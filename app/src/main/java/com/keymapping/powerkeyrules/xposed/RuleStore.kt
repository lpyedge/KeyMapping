package com.keymapping.powerkeyrules.xposed

import android.content.Context
import com.keymapping.powerkeyrules.model.RuleConfig
import com.keymapping.powerkeyrules.util.Constants
import com.keymapping.powerkeyrules.util.LogUtils
import com.keymapping.powerkeyrules.util.RuleJson


object RuleStore {
    data class LoadResult(val config: RuleConfig, val signature: String, val source: String)

    private data class JsonSource(val json: String, val signature: String, val source: String)

    /**
     * Lightweight signature calculation: only uses file mtime/size or prefs update timestamp,
     * without reading JSON content. Helps avoid expensive I/O on key events.
     */
    // ...existing code...
    fun getSignature(context: Context?): String {
        // 方案一：system_server 端只走 AIDL service 快取。
        // 若 service 尚未可用，回退到 default（避免做任何跨進程檔案/偏好設定 I/O）。
        return RuleServiceClient.getCachedSignatureOrNull() ?: "default"
    }

    fun load(context: Context?): LoadResult {
        val source = readJsonSource(context)
        if (source == null) {
            return LoadResult(DefaultRules.config(), "default", "default")
        }
        val config = try {
            RuleJson.parse(source.json)
        } catch (t: Throwable) {
            LogUtils.e("Failed to parse rules JSON from ${source.source}", t)
            DefaultRules.config()
        }
        return LoadResult(config, source.signature, source.source)
    }

    private fun readJsonSource(context: Context?): JsonSource? {
        readFromServiceCache()?.let { return it }
        return null
    }

    private fun readFromServiceCache(): JsonSource? {
        val json = RuleServiceClient.getCachedRulesJsonOrNull()
        if (json.isNullOrBlank()) return null
        val sig = RuleServiceClient.getCachedSignatureOrNull() ?: "svc"
        return JsonSource(json, sig, "service")
    }
}

