package com.keymapping.powerkeyrules.xposed

import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.model.RuleConfig
import com.keymapping.powerkeyrules.util.Constants
import com.keymapping.powerkeyrules.util.RuleJson
import com.keymapping.powerkeyrules.util.Time
import io.github.libxposed.api.XposedModule
import java.lang.reflect.Method
import java.util.concurrent.atomic.AtomicReference

/**
 * Modern API 規則存儲
 * 
 * 使用 XposedService 的 Remote Preferences 替代 AIDL Service
 * 
 * 優化改進：
 * - 緩存反射 Method 對象，避免重複查找
 * - 使用 AtomicReference 確保 ruleIndex 更新的原子性
 * - 新增 comboIndex 加速組合鍵查找
 */
object ModernRuleStore {
    private const val RELOAD_INTERVAL_MS = 1000L

    @Volatile private var module: XposedModule? = null
    
    // 使用 AtomicReference 包裝規則列表和索引，確保原子更新
    private val rulesRef = AtomicReference<List<KeyRule>>(emptyList())
    
    // 性能優化：預建索引 Map<keyCode, Map<behavior, List<Rule>>>
    private val ruleIndexRef = AtomicReference<Map<Int, Map<String, List<KeyRule>>>>(emptyMap())
    
    // 組合鍵索引：Map<Pair<minKey, maxKey>, List<Rule>>（鍵已排序，確保唯一性）
    private val comboIndexRef = AtomicReference<Map<Pair<Int, Int>, List<KeyRule>>>(emptyMap())
    
    @Volatile private var lastSignature: String = ""
    @Volatile private var lastCheckAt: Long = 0L
    @Volatile private var config: RuleConfig = DefaultRules.config()
    
    // 緩存反射 Method，避免每次調用都重新查找
    @Volatile private var cachedRemotePrefsMethod: Method? = null
    @Volatile private var remotePrefsMethodChecked = false

    fun init(mod: XposedModule) {
        module = mod
        mod.log("ModernRuleStore initialized")
    }

    /**
     * 節流檢查 + 按需重載規則
     * 在按鍵事件處理前調用
     */
    fun maybeReload() {
        val now = Time.uptimeMillis()
        if (now - lastCheckAt < RELOAD_INTERVAL_MS && lastSignature.isNotEmpty()) {
            return
        }
        lastCheckAt = now

        val currentSig = getSignature()
        if (currentSig == lastSignature && rulesRef.get().isNotEmpty()) {
            return
        }

        val loadResult = load()
        lastSignature = loadResult.signature
        config = loadResult.config
        
        val newRules = if (loadResult.config.rules.isNotEmpty()) {
            loadResult.config.rules
        } else {
            DefaultRules.config().rules
        }
        
        // 原子更新所有索引
        rulesRef.set(newRules)
        ruleIndexRef.set(buildRuleIndex(newRules))
        comboIndexRef.set(buildComboIndex(newRules))
        
        KeyStateTracker.updateConfig(config, newRules)
        module?.log("Rules reloaded: count=${newRules.size}, source=${loadResult.source}")
    }

    /**
     * 建立規則索引：Map<keyCode, Map<behavior, List<Rule>>>
     * O(1) 查找性能
     */
    private fun buildRuleIndex(rules: List<KeyRule>): Map<Int, Map<String, List<KeyRule>>> {
        return rules.groupBy { it.keyCode }
            .mapValues { (_, keyCodeRules) ->
                keyCodeRules.groupBy { it.behavior.name }
            }
    }
    
    /**
     * 建立組合鍵索引：Map<Pair<minKey, maxKey>, List<Rule>>
     * 使用排序後的鍵對作為 key，確保 (A,B) 與 (B,A) 映射到同一個條目
     */
    private fun buildComboIndex(rules: List<KeyRule>): Map<Pair<Int, Int>, List<KeyRule>> {
        return rules
            .filter { it.behavior == KeyBehavior.COMBO_DOWN || it.behavior == KeyBehavior.COMBO_LONG_PRESS }
            .filter { it.comboKeyCode > 0 }
            .groupBy { rule ->
                val k1 = minOf(rule.keyCode, rule.comboKeyCode)
                val k2 = maxOf(rule.keyCode, rule.comboKeyCode)
                k1 to k2
            }
    }

    fun getRules(): List<KeyRule> = rulesRef.get()

    /**
     * 快速查找規則（使用索引）
     * @return 匹配 keyCode 和 behavior 的規則列表
     */
    fun getRulesForKey(keyCode: Int, behavior: String): List<KeyRule> {
        return ruleIndexRef.get()[keyCode]?.get(behavior) ?: emptyList()
    }
    
    /**
     * 快速查找組合鍵規則（使用組合鍵索引）
     * @return 匹配兩個按鍵的組合鍵規則列表
     */
    fun getComboRules(keyCode1: Int, keyCode2: Int): List<KeyRule> {
        val k1 = minOf(keyCode1, keyCode2)
        val k2 = maxOf(keyCode1, keyCode2)
        return comboIndexRef.get()[k1 to k2] ?: emptyList()
    }

    fun getConfig(): RuleConfig = config

    /**
     * 獲取配置簽名（用於變更檢測）
     * 使用 Remote Preferences 的 updatedAt 時間戳（elapsedRealtime）
     */
    private fun getSignature(): String {
        return try {
            val prefs = getRemotePrefs() ?: return "default"
            val updatedAt = prefs.getLong(Constants.PREFS_KEY_RULES_UPDATED_AT, 0L)
            "remote:$updatedAt"
        } catch (t: Throwable) {
            module?.log("getSignature failed: ${t.message}")
            "default"
        }
    }

    data class LoadResult(val config: RuleConfig, val signature: String, val source: String)

    /**
     * 從 Remote Preferences 加載規則配置
     */
    private fun load(): LoadResult {
        try {
            val prefs = getRemotePrefs()
            if (prefs == null) {
                module?.log("Remote prefs not available, using defaults")
                return LoadResult(DefaultRules.config(), "default", "default")
            }

            val json = prefs.getString(Constants.PREFS_KEY_RULES_JSON, null)
            val updatedAt = prefs.getLong(Constants.PREFS_KEY_RULES_UPDATED_AT, 0L)
            val signature = "remote:$updatedAt"

            if (json.isNullOrBlank()) {
                return LoadResult(DefaultRules.config(), signature, "empty")
            }

            val config = try {
                RuleJson.parse(json)
            } catch (t: Throwable) {
                module?.log("Failed to parse rules JSON: ${t.message}")
                DefaultRules.config()
            }

            return LoadResult(config, signature, "remote_prefs")
        } catch (t: Throwable) {
            module?.log("load() failed: ${t.message}")
            return LoadResult(DefaultRules.config(), "error", "error")
        }
    }

    /**
     * 獲取 Remote Preferences
     * Modern API 提供的跨進程配置共享能力
     * 
     * 優化：緩存反射 Method，避免每次調用都重新查找
     */
    private fun getRemotePrefs(): android.content.SharedPreferences? {
        val mod = module ?: return null
        
        // 如果已經檢查過且沒找到方法，直接返回 null
        if (remotePrefsMethodChecked && cachedRemotePrefsMethod == null) {
            return null
        }
        
        return try {
            // 嘗試使用緩存的 Method
            val method = cachedRemotePrefsMethod ?: run {
                val m = try {
                    mod.javaClass.getMethod("getRemotePreferences", String::class.java)
                } catch (ns: NoSuchMethodException) {
                    null
                }
                remotePrefsMethodChecked = true
                cachedRemotePrefsMethod = m
                
                if (m == null) {
                    module?.log("getRemotePreferences not available on module")
                }
                m
            }
            
            if (method != null) {
                @Suppress("UNCHECKED_CAST")
                method.invoke(mod, Constants.PREFS_NAME) as? android.content.SharedPreferences
            } else {
                null
            }
        } catch (t: Throwable) {
            module?.log("getRemotePreferences failed: ${t.message}")
            null
        }
    }
}
