package com.keymapping.powerkeyrules.util

import com.keymapping.powerkeyrules.model.IntentSpec
import com.keymapping.powerkeyrules.model.KeyAction
import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.model.RuleConfig
import org.json.JSONArray
import org.json.JSONObject

object RuleJson {
    fun parse(json: String): RuleConfig {
        val root = JSONObject(json)
        val version = root.optInt("version", 1)
        val doublePressIntervalMs = root.optLong("doublePressIntervalMs", 300)
        val longPressMinMs = root.optLong("longPressMinMs", 500)
        val rules = mutableListOf<KeyRule>()
        val rulesArray = root.optJSONArray("rules") ?: JSONArray()
        for (i in 0 until rulesArray.length()) {
            val ruleObj = rulesArray.optJSONObject(i) ?: continue
            val rule = parseRule(ruleObj) ?: continue
            rules += rule
        }
        return RuleConfig(
            version = version,
            doublePressIntervalMs = doublePressIntervalMs,
            longPressMinMs = longPressMinMs,
            rules = rules
        )
    }

    fun toJson(config: RuleConfig): String {
        val root = JSONObject()
        root.put("version", config.version)
        root.put("doublePressIntervalMs", config.doublePressIntervalMs)
        root.put("longPressMinMs", config.longPressMinMs)
        val rulesArray = JSONArray()
        config.rules.forEach { rule ->
            rulesArray.put(ruleToJson(rule))
        }
        root.put("rules", rulesArray)
        return root.toString(2)
    }

    private fun parseRule(obj: JSONObject): KeyRule? {
        val keyCode = obj.optInt("keyCode", -1)
        if (keyCode < 0) return null
        val behaviorStr = obj.optString("behavior", "").uppercase()
        val behavior = runCatching { KeyBehavior.valueOf(behaviorStr) }.getOrNull() ?: return null
        val durationMs = obj.optLong("durationMs", 0)
        val actionObj = obj.optJSONObject("action") ?: return null
        val action = parseAction(actionObj) ?: return null
        return KeyRule(
            keyCode = keyCode,
            behavior = behavior,
            durationMs = durationMs,
            action = action
        )
    }

    private fun parseAction(obj: JSONObject): KeyAction? {
        return when (obj.optString("type", "")) {
            "launch_intent" -> {
                val intentObj = obj.optJSONObject("intent") ?: JSONObject()
                KeyAction.LaunchIntent(parseIntent(intentObj))
            }
            "send_key" -> {
                val keyCode = obj.optInt("keyCode", -1)
                if (keyCode < 0) null else KeyAction.SendKeyEvent(keyCode)
            }
            "run_shell" -> {
                val command = obj.optString("command", "")
                if (command.isBlank()) null else KeyAction.RunShell(command)
            }
            else -> null
        }
    }

    private fun parseIntent(obj: JSONObject): IntentSpec {
        val extras = mutableMapOf<String, Any?>()
        val extrasObj = obj.optJSONObject("extras")
        if (extrasObj != null) {
            val keys = extrasObj.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = extrasObj.opt(key)
                when (value) {
                    is String, is Int, is Long, is Boolean, is Double -> extras[key] = value
                }
            }
        }
        return IntentSpec(
            action = obj.optString("action", null),
            packageName = obj.optString("package", null),
            className = obj.optString("className", null),
            data = obj.optString("data", null),
            flags = obj.optInt("flags", 0),
            extras = extras
        )
    }

    private fun ruleToJson(rule: KeyRule): JSONObject {
        val obj = JSONObject()
        obj.put("keyCode", rule.keyCode)
        obj.put("behavior", rule.behavior.name)
        obj.put("durationMs", rule.durationMs)
        obj.put("action", actionToJson(rule.action))
        return obj
    }

    private fun actionToJson(action: KeyAction): JSONObject {
        val obj = JSONObject()
        when (action) {
            is KeyAction.LaunchIntent -> {
                obj.put("type", "launch_intent")
                obj.put("intent", intentToJson(action.intent))
            }
            is KeyAction.SendKeyEvent -> {
                obj.put("type", "send_key")
                obj.put("keyCode", action.keyCode)
            }
            is KeyAction.RunShell -> {
                obj.put("type", "run_shell")
                obj.put("command", action.command)
            }
        }
        return obj
    }

    private fun intentToJson(intent: IntentSpec): JSONObject {
        val obj = JSONObject()
        if (!intent.action.isNullOrBlank()) obj.put("action", intent.action)
        if (!intent.packageName.isNullOrBlank()) obj.put("package", intent.packageName)
        if (!intent.className.isNullOrBlank()) obj.put("className", intent.className)
        if (!intent.data.isNullOrBlank()) obj.put("data", intent.data)
        if (intent.flags != 0) obj.put("flags", intent.flags)
        if (intent.extras.isNotEmpty()) {
            val extrasObj = JSONObject()
            intent.extras.forEach { (key, value) ->
                when (value) {
                    is String, is Int, is Long, is Boolean, is Double -> extrasObj.put(key, value)
                }
            }
            obj.put("extras", extrasObj)
        }
        return obj
    }
}
