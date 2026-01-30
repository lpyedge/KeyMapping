package com.keymapping.powerkeyrules.xposed

import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.model.RuleConfig
import com.keymapping.powerkeyrules.util.Constants
import com.keymapping.powerkeyrules.util.RuleJson
import com.keymapping.powerkeyrules.util.Time
import io.github.libxposed.XposedModule
import java.io.BufferedReader

/**
 * Modern API 規則存儲
 * 
 * 使用 XposedService 的 Remote Preferences 替代 AIDL Service
 * - getRemotePreferences(): 跨進程讀取模組的 SharedPreferences
 * - 無需自建 AIDL 通道，由框架處理跨進程通信
 * - 保留原有的"時間戳簽名 + 1秒節流"邏輯
 */
object ModernRuleStore {
    private const val RELOAD_INTERVAL_MS = 1000L

    @Volatile private var module: XposedModule? = null
    @Volatile private var rules: List<KeyRule> = emptyList()
    // 性能優化：預建索引 Map<keyCode, Map<behavior, List<Rule>>>
    @Volatile private var ruleIndex: Map<Int, Map<String, List<KeyRule>>> = emptyMap()
    @Volatile private var lastSignature: String = ""
    @Volatile private var lastCheckAt: Long = 0L
    @Volatile private var config: RuleConfig = DefaultRules.config()

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
        if (currentSig == lastSignature && rules.isNotEmpty()) {
            return
        }

        val loadResult = load()
        lastSignature = loadResult.signature
        config = loadResult.config
        rules = if (loadResult.config.rules.isNotEmpty()) {
            loadResult.config.rules
        } else {
            DefaultRules.config().rules
        }
        
        // 建立索引 Map 以優化查詢性能
        ruleIndex = buildRuleIndex(rules)
        
        KeyStateTracker.updateConfig(config, rules)
        module?.log("Rules reloaded: count=${rules.size}, source=${loadResult.source}")
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

    fun getRules(): List<KeyRule> = rules

    /**
     * 快速查找規則（使用索引）
     * @return 匹配 keyCode 和 behavior 的規則列表
     */
    fun getRulesForKey(keyCode: Int, behavior: String): List<KeyRule> {
        return ruleIndex[keyCode]?.get(behavior) ?: emptyList()
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
     */
    private fun getRemotePrefs(): android.content.SharedPreferences? {
        val mod = module ?: return null
        return try {
            // libxposed/service 提供的 Remote Preferences API
            // 自動處理跨進程通信，無需 AIDL
            mod.getRemotePreferences(Constants.PREFS_NAME)
        } catch (t: Throwable) {
            module?.log("getRemotePreferences failed: ${t.message}")
            null
        }
    }
}
