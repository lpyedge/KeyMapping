package com.keymapping.powerkeyrules.xposed

import android.content.Context
import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.util.LogUtils
import com.keymapping.powerkeyrules.util.Time

object KeyRuleEngine {
    private const val RELOAD_INTERVAL_MS = 1000L

    @Volatile private var rules: List<KeyRule> = emptyList()
    @Volatile private var lastSignature: String? = null
    @Volatile private var lastCheckAt: Long = 0

    fun maybeReload(context: Context?) {
        // 先在背景刷新 service 快取，避免在按鍵路徑做跨進程 I/O。
        RuleServiceClient.maybeRefresh(context)

        val now = Time.uptimeMillis()
        if (now - lastCheckAt < RELOAD_INTERVAL_MS && lastSignature != null) {
            return
        }
        lastCheckAt = now

        val currentSig = RuleStore.getSignature(context)
        if (currentSig == lastSignature && rules.isNotEmpty()) {
            return
        }

        val result = RuleStore.load(context)
        lastSignature = result.signature
        rules = if (result.config.rules.isNotEmpty()) {
            result.config.rules
        } else {
            DefaultRules.config().rules
        }
        KeyStateTracker.updateConfig(result.config, rules)
        LogUtils.i("Rules loaded from ${result.source}, count=${rules.size}")
    }

    fun match(keyCode: Int, behavior: KeyBehavior, duration: Long): KeyRule? {
        val candidates = rules.filter {
            it.keyCode == keyCode && it.behavior == behavior && duration >= it.durationMs
        }
        return candidates.maxByOrNull { it.durationMs }
    }
}

