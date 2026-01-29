package com.keymapping.powerkeyrules.model

import android.content.Intent
import android.net.Uri

@Suppress("UNCHECKED_CAST")
data class IntentSpec(
    val action: String? = null,
    val packageName: String? = null,
    val className: String? = null,
    val data: String? = null,
    val flags: Int = 0,
    val extras: Map<String, Any?> = emptyMap()
) {
    fun toIntent(): Intent {
        val intent = Intent()
        if (!action.isNullOrBlank()) {
            intent.action = action
        }
        if (!packageName.isNullOrBlank() && !className.isNullOrBlank()) {
            intent.setClassName(packageName, className)
        } else if (!packageName.isNullOrBlank()) {
            intent.`package` = packageName
        }
        if (!data.isNullOrBlank()) {
            intent.data = Uri.parse(data)
        }
        if (flags != 0) {
            intent.addFlags(flags)
        }
        extras.forEach { (key, value) ->
            when (value) {
                is String -> intent.putExtra(key, value)
                is Int -> intent.putExtra(key, value)
                is Long -> intent.putExtra(key, value)
                is Boolean -> intent.putExtra(key, value)
                is Double -> intent.putExtra(key, value)
            }
        }
        return intent
    }
}
