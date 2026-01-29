package com.keymapping.powerkeyrules.util

import android.content.Context

object SystemContext {
    @Volatile private var cached: Context? = null

    fun tryGet(): Context? {
        cached?.let { return it }
        return try {
            val activityThread = Class.forName("android.app.ActivityThread")
            val currentThread = activityThread.getMethod("currentActivityThread").invoke(null)
            val context = activityThread.getMethod("getSystemContext").invoke(currentThread) as? Context
            if (context != null) {
                cached = context
            }
            context
        } catch (t: Throwable) {
            LogUtils.e("Failed to get system context", t)
            null
        }
    }
}
