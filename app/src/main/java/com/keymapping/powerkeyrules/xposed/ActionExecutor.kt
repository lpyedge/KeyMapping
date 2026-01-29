package com.keymapping.powerkeyrules.xposed

import android.content.Intent
import com.keymapping.powerkeyrules.model.KeyAction
import com.keymapping.powerkeyrules.util.SystemContext
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * 動作執行器
 * 
 * 改進：
 * - 添加執行超時機制
 * - 添加隊列深度限制（防止堆積）
 * - 後台線程執行避免阻塞 system_server
 */
object ActionExecutor {
    private const val MAX_QUEUE_SIZE = 10
    private const val SHELL_TIMEOUT_MS = 5000L
    
    private val queueSize = AtomicInteger(0)
    
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "PowerKeyRules-Action").apply { isDaemon = true }
    }

    fun execute(action: KeyAction) {
        // 隊列深度限制：防止動作堆積導致系統卡頓
        if (queueSize.get() >= MAX_QUEUE_SIZE) {
            log("Action queue full, dropping: $action")
            return
        }
        
        queueSize.incrementAndGet()
        executor.execute {
            try {
                when (action) {
                    is KeyAction.LaunchIntent -> launchIntent(action)
                    is KeyAction.SendKeyEvent -> runShellWithTimeout("input keyevent ${action.keyCode}")
                    is KeyAction.RunShell -> runShellWithTimeout(action.command)
                }
            } catch (t: Throwable) {
                log("Action execution failed: ${t.message}")
            } finally {
                queueSize.decrementAndGet()
            }
        }
    }

    private fun launchIntent(action: KeyAction.LaunchIntent) {
        val context = SystemContext.tryGet()
        if (context == null) {
            log("SystemContext not available for LaunchIntent")
            return
        }
        
        val intent = action.intent.toIntent().apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            // 多用戶支持：嘗試使用 startActivityAsUser（需反射調用）
            try {
                val userHandle = Class.forName("android.os.UserHandle")
                // CURRENT 是字段不是方法
                val currentField = userHandle.getField("CURRENT")
                val current = currentField.get(null)
                val startActivityAsUser = context.javaClass.getMethod(
                    "startActivityAsUser",
                    Intent::class.java,
                    userHandle
                )
                startActivityAsUser.invoke(context, intent, current)
            } catch (e: Exception) {
                // Fallback: 使用普通 startActivity
                context.startActivity(intent)
            }
        } catch (t: Throwable) {
            log("Failed to start intent: ${t.message}")
        }
    }

    /**
     * 執行 Shell 命令（帶超時）
     */
    private fun runShellWithTimeout(command: String) {
        try {
            // 使用 sh -c 並後台執行，但帶超時保護
            val process = ProcessBuilder("sh", "-c", "( $command ) >/dev/null 2>&1")
                .redirectErrorStream(true)
                .start()
            
            // 等待完成或超時
            val completed = process.waitFor(SHELL_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            if (!completed) {
                process.destroyForcibly()
                log("Shell command timed out: $command")
            }
        } catch (t: Throwable) {
            log("Shell exec failed: $command - ${t.message}")
        }
    }

    private fun log(message: String) {
        PowerKeyModule.getXposed()?.log(message)
    }
}

