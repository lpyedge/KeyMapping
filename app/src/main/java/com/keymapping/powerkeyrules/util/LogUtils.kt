package com.keymapping.powerkeyrules.util

import android.util.Log

/**
 * 日誌工具類
 * 
 * APP 端使用 Android Log，Xposed 端由 PowerKeyModule 使用 XposedInterface.log
 */
object LogUtils {
    private const val TAG = "PowerKeyRules"

    fun d(message: String) {
        Log.d(TAG, message)
    }

    fun i(message: String) {
        Log.i(TAG, message)
    }

    fun e(message: String, throwable: Throwable? = null) {
        Log.e(TAG, message, throwable)
    }
}
