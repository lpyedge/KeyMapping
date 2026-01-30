package com.keymapping.powerkeyrules.xposed

import android.view.KeyEvent
import com.keymapping.powerkeyrules.model.KeyBehavior
import io.github.libxposed.api.XposedInterface
import io.github.libxposed.api.XposedInterface.BeforeHookCallback
import io.github.libxposed.api.XposedInterface.AfterHookCallback
import io.github.libxposed.api.XposedInterface.Hooker
import io.github.libxposed.api.XposedModule
import io.github.libxposed.api.XposedModuleInterface
import java.lang.reflect.Method
import java.util.concurrent.ConcurrentHashMap

/**
 * Modern Xposed API 模組入口類
 * 
 * 使用 libxposed/api v29，需要 LSPosed 1.9.1+
 * API 文檔：https://libxposed.github.io/api/
 * 
 * 功能：
 * - 使用 onSystemServerLoaded 生命週期回調進行 Hook
 * - 使用 getRemotePreferences 跨進程共享配置（替代 AIDL）
 * - 使用 deoptimize 提升 Hook 穩定性
 */
class PowerKeyModule(
    base: XposedInterface,
    param: XposedModuleInterface.ModuleLoadedParam
) : XposedModule(base, param) {

    companion object {
        private const val TAG = "PowerKeyModule"
        
        @Volatile
        private var instance: PowerKeyModule? = null

        fun getInstance(): PowerKeyModule? = instance
    }

    init {
        instance = this
        log("$TAG: Module loaded in process: ${param.processName}")
    }

    /**
     * 當 system_server 進程啟動時觸發
     * 這是進行 PhoneWindowManager Hook 的正確時機
     */
    override fun onSystemServerLoaded(param: XposedModuleInterface.SystemServerLoadedParam) {
        log("$TAG: onSystemServerLoaded called")
        
        // 初始化規則存儲（使用 Remote Preferences）
        ModernRuleStore.init(this)
        
        // 在 system_server 進程中進行 Hook
        try {
            tryHookPhoneWindowManager(param.classLoader)
            log("$TAG: Hook setup completed")
        } catch (t: Throwable) {
            log("$TAG: Hook setup failed: ${t.message}")
            t.printStackTrace()
        }
    }

    private fun tryHookPhoneWindowManager(classLoader: ClassLoader) {
        val pwmClass = classLoader.loadClass("com.android.server.policy.PhoneWindowManager")
        
        // 查找 interceptKeyBeforeQueueing 方法（嘗試多種簽名）
        val method = findInterceptMethod(pwmClass)
        if (method == null) {
            log("$TAG: ERROR - interceptKeyBeforeQueueing method not found")
            return
        }

        // deoptimize 提升穩定性（某些 ROM 優化場景下有幫助）
        runCatching { deoptimize(method) }
            .onFailure { log("$TAG: deoptimize skipped: ${it.message}") }

        // 註冊 Hook：Modern API 使用靜態方法的 Hooker 類
        hook(method, InterceptKeyHooker::class.java)
        
        log("$TAG: Successfully hooked ${method.name} with ${method.parameterCount} params")
    }

    private fun findInterceptMethod(clazz: Class<*>): Method? {
        // 嘗試 2 參數版本 (KeyEvent, Int) - 最常見
        runCatching {
            val method = clazz.getDeclaredMethod(
                "interceptKeyBeforeQueueing",
                KeyEvent::class.java,
                Int::class.javaPrimitiveType
            )
            log("$TAG: Found 2-param signature: (KeyEvent, int)")
            return method
        }
        
        // 嘗試 3 參數版本 (KeyEvent, Int, Int) - 某些 ROM
        runCatching {
            val method = clazz.getDeclaredMethod(
                "interceptKeyBeforeQueueing",
                KeyEvent::class.java,
                Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType
            )
            log("$TAG: Found 3-param signature: (KeyEvent, int, int)")
            return method
        }
        
        // 遍歷所有方法找匹配的
        val candidates = clazz.declaredMethods.filter { method ->
            method.name == "interceptKeyBeforeQueueing" && 
            method.parameterTypes.isNotEmpty() &&
            method.parameterTypes[0] == KeyEvent::class.java
        }
        
        if (candidates.isNotEmpty()) {
            val selected = candidates.first()
            log("$TAG: Found ${candidates.size} candidate(s), selected: ${selected.parameterTypes.joinToString { it.simpleName }}")
            return selected
        }
        
        return null
    }

    /**
     * Modern API Hooker 類
     * 
     * 實現 XposedInterface.Hooker 接口，提供 before/after **靜態方法**
     * 注意：Modern API 的 Hooker 接口要求靜態方法，而非實例方法
     * API 文檔：https://libxposed.github.io/api/io/github/libxposed/api/XposedInterface.Hooker.html
     */
    class InterceptKeyHooker : Hooker {
        companion object {
            private const val TAG = "InterceptKeyHooker"
            
            // 遞歸防護：最近執行的 keyCode+action 時間戳
            private val recentDispatch = ConcurrentHashMap<String, Long>()
            private const val REENTRY_GUARD_MS = 100L

            /**
             * Hook 前置回調（靜態方法）
             * @param callback 提供 args、thisObject、returnAndSkip() 等方法
             */
            @JvmStatic
            fun before(callback: BeforeHookCallback) {
                try {
                    val args = callback.args
                    val event = args.firstOrNull { it is KeyEvent } as? KeyEvent ?: return

                    // === 安全過濾 ===
                    
                    // 1. 虛擬按鍵源忽略（防止 input keyevent 遞歸）
                    if (event.deviceId < 0) return

                    // 2. 電源鍵 DOWN 永不攔截（確保設備能喚醒）
                    if (event.keyCode == KeyEvent.KEYCODE_POWER && event.action == KeyEvent.ACTION_DOWN) {
                        // 但仍需追蹤狀態，以便計算長按時長
                        KeyStateTracker.onKeyEvent(event)
                        return
                    }

                    // 3. 遞歸防護：同一 keyCode+action 在短時間內重複觸發則忽略
                    val key = "${event.keyCode}:${event.action}"
                    val now = android.os.SystemClock.uptimeMillis()
                    val lastTime = recentDispatch[key] ?: 0L
                    if (now - lastTime < REENTRY_GUARD_MS) {
                        return
                    }

                    // === 規則處理 ===
                    
                    // 觸發配置刷新檢查
                    ModernRuleStore.maybeReload()

                    // 追蹤按鍵狀態
                    val gesture = KeyStateTracker.onKeyEvent(event) ?: return

                    // 只處理非長按事件（LONG_PRESS 已在 KeyStateTracker 內部通過定時器觸發）
                    // COMBO_LONG_PRESS 也在定時器中觸發，這裡不處理
                    if (gesture.behavior == KeyBehavior.LONG_PRESS || 
                        gesture.behavior == KeyBehavior.COMBO_LONG_PRESS) {
                        return
                    }

                    // 匹配规则（DOWN/UP/DOUBLE_PRESS/LONG_PRESS_RELEASE/COMBO_DOWN）
                    val rule = if (gesture.behavior == KeyBehavior.COMBO_DOWN) {
                        // 组合键需要匹配两个 keyCode
                        KeyRuleEngine.matchCombo(gesture.firstKeyCode, gesture.secondKeyCode, gesture.behavior)
                    } else {
                        KeyRuleEngine.match(event.keyCode, gesture.behavior, gesture.durationMs)
                    } ?: return

                    // 記錄本次分發時間（遞歸防護）
                    recentDispatch[key] = now
                    
                    // 清理過期記錄
                    if (recentDispatch.size > 20) {
                        val cutoff = now - 5000
                        recentDispatch.entries.removeIf { it.value < cutoff }
                    }

                    // 執行動作
                    ActionExecutor.execute(rule.action)

                    // Safety: never skip POWER key handling
                    if (event.keyCode != KeyEvent.KEYCODE_POWER) {
                        callback.returnAndSkip(0)
                    }

                } catch (t: Throwable) {
                    // 全局異常捕獲，防止 system_server 崩潰
                    getInstance()?.log("$TAG: Hook error: ${t.message}")
                }
            }

            /**
             * Hook 後置回調（靜態方法）
             * 本模組不需要後置處理，但提供空實現以符合接口規範
             */
            @JvmStatic
            fun after(callback: AfterHookCallback) {
                // 不需要後置處理
            }
        }
    }
}
