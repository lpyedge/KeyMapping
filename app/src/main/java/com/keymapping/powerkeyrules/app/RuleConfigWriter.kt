package com.keymapping.powerkeyrules.app

import android.content.Context
import android.os.Build
import android.system.Os
import android.system.OsConstants
import android.widget.Toast
import com.keymapping.powerkeyrules.util.Constants
import com.keymapping.powerkeyrules.util.LogUtils
import com.keymapping.powerkeyrules.util.RuleJson
import com.keymapping.powerkeyrules.xposed.DefaultRules
import java.io.File

object RuleConfigWriter {
    fun writeDefault(context: Context) {
        val json = RuleJson.toJson(DefaultRules.config())
        writeJson(context, json)
        Toast.makeText(context, "Default rules saved", Toast.LENGTH_SHORT).show()
    }

    fun writeJson(context: Context, json: String) {
        val prefs = context.createDeviceProtectedStorageContext().getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(Constants.PREFS_KEY_RULES_JSON, json)
            .putLong(Constants.PREFS_KEY_RULES_UPDATED_AT, System.currentTimeMillis())
            .apply()

        val deviceContext = context.createDeviceProtectedStorageContext()
        val file = File(deviceContext.filesDir, Constants.RULES_FILE_NAME)
        runCatching {
            file.parentFile?.mkdirs()
            file.writeText(json, Charsets.UTF_8)
            file.setReadable(true, false)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Os.chmod(
                    file.absolutePath,
                    OsConstants.S_IRUSR or OsConstants.S_IWUSR or OsConstants.S_IRGRP or OsConstants.S_IROTH
                )
            }
        }.onFailure {
            LogUtils.e("Failed to write rules file", it)
        }
    }

    fun rulesFilePath(context: Context): String {
        val deviceContext = context.createDeviceProtectedStorageContext()
        return File(deviceContext.filesDir, Constants.RULES_FILE_NAME).absolutePath
    }
}
