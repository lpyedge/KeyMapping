package com.keymapping.powerkeyrules.app

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.os.Process
import com.keymapping.powerkeyrules.IRuleService
import com.keymapping.powerkeyrules.util.Constants

class RuleService : Service() {

    private val binder = object : IRuleService.Stub() {
        override fun getRulesJson(): String {
            enforceCaller()
            val prefs = createDeviceProtectedStorageContext().getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            return prefs.getString(Constants.PREFS_KEY_RULES_JSON, "") ?: ""
        }

        override fun getUpdatedAt(): Long {
            enforceCaller()
            val prefs = createDeviceProtectedStorageContext().getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            return prefs.getLong(Constants.PREFS_KEY_RULES_UPDATED_AT, 0L)
        }
    }

    override fun onBind(intent: Intent): IBinder = binder

    private fun enforceCaller() {
        val uid = Binder.getCallingUid()
        if (uid == Process.SYSTEM_UID || uid == applicationInfo.uid) return
        throw SecurityException("Unauthorized caller uid=$uid")
    }
}
