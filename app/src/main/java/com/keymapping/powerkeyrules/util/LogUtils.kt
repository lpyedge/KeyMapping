package com.keymapping.powerkeyrules.util

import android.util.Log

object LogUtils {
    private const val TAG = "PowerKeyRules"
    @Volatile private var xposedAvailable: Boolean? = null

    fun d(message: String) {
        Log.d(TAG, message)
        xposedLog(message)
    }

    fun i(message: String) {
        Log.i(TAG, message)
        xposedLog(message)
    }

    fun e(message: String, throwable: Throwable? = null) {
        Log.e(TAG, message, throwable)
        val detail = if (throwable != null) {
            "$message\n${Log.getStackTraceString(throwable)}"
        } else {
            message
        }
        xposedLog(detail)
    }

    private fun xposedLog(message: String) {
        val available = xposedAvailable
        if (available == false) {
            return
        }
        try {
            val bridge = Class.forName("de.robv.android.xposed.XposedBridge")
            val logMethod = bridge.getMethod("log", String::class.java)
            logMethod.invoke(null, "$TAG: $message")
            xposedAvailable = true
        } catch (_: Throwable) {
            xposedAvailable = false
        }
    }
}
