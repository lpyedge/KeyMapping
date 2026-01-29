package com.keymapping.powerkeyrules.xposed

import android.content.Intent
import com.keymapping.powerkeyrules.model.KeyAction
import com.keymapping.powerkeyrules.util.LogUtils
import com.keymapping.powerkeyrules.util.SystemContext
import java.util.concurrent.Executors

object ActionExecutor {
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "PowerKeyRules-Action").apply { isDaemon = true }
    }

    fun execute(action: KeyAction) {
        executor.execute {
            try {
                when (action) {
                    is KeyAction.LaunchIntent -> launchIntent(action)
                    is KeyAction.SendKeyEvent -> runShell("input keyevent ${action.keyCode}")
                    is KeyAction.RunShell -> runShell(action.command)
                }
            } catch (t: Throwable) {
                LogUtils.e("Action execution failed", t)
            }
        }
    }

    private fun launchIntent(action: KeyAction.LaunchIntent) {
        val context = SystemContext.tryGet() ?: return
        val intent = action.intent.toIntent().apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
        } catch (t: Throwable) {
            LogUtils.e("Failed to start intent", t)
        }
    }

    private fun runShell(command: String) {
        try {
            // Use sh -c and background execution; discard output to avoid blocking.
            val array = arrayOf("sh", "-c", "( $command ) >/dev/null 2>&1 &")
            Runtime.getRuntime().exec(array)
        } catch (t: Throwable) {
            LogUtils.e("Shell exec failed: $command", t)
        }
    }
}
