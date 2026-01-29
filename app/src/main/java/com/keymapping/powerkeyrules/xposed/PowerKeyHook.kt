package com.keymapping.powerkeyrules.xposed

import android.view.KeyEvent
import com.keymapping.powerkeyrules.util.LogUtils
import com.keymapping.powerkeyrules.util.SystemContext
import de.robv.android.xposed.IXposedHookLoadPackage
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedHelpers
import de.robv.android.xposed.callbacks.XC_LoadPackage

class PowerKeyHook : IXposedHookLoadPackage {
    override fun handleLoadPackage(lpparam: XC_LoadPackage.LoadPackageParam) {
        if (lpparam.packageName != "android") return
        val clazz = runCatching {
            XposedHelpers.findClass("com.android.server.policy.PhoneWindowManager", lpparam.classLoader)
        }.getOrElse {
            LogUtils.e("PhoneWindowManager not found", it)
            return
        }
        // 首次載入時同步刷新 service 快取，確保第一個按鍵事件即可應用用戶配置
        val context = SystemContext.tryGet()
        RuleServiceClient.refreshSyncOnce(context)
        hookInterceptKeyBeforeQueueing(clazz)
    }

    private fun hookInterceptKeyBeforeQueueing(clazz: Class<*>) {
        val hook = object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val event = param.args.getOrNull(0) as? KeyEvent ?: return

                try {
                    val context = SystemContext.tryGet()
                    // 1. 觸發異步刷新與重載檢查 (確保規則最新)
                    KeyRuleEngine.maybeReload(context)

                    // 2. 追蹤按鍵狀態 (DOWN/UP/長按/雙擊計算)
                    // 必須在 return 前調用，否則電源鍵 DOWN 會被漏掉，導致 UP 時時長計算錯誤
                    val gesture = KeyStateTracker.onKeyEvent(event)

                    // 3. 安全過濾：
                    // a) 虛擬按鍵源 (如 input keyevent) 忽略，防止遞歸崩潰
                    if (event.deviceId < 0) return

                    // b) 電源鍵 DOWN 事件永不攔截，確保設備能喚醒
                    if (event.keyCode == KeyEvent.KEYCODE_POWER && event.action == KeyEvent.ACTION_DOWN) {
                        return
                    }

                    if (gesture == null) return

                    // 4. 規則匹配與執行
                    val rule = KeyRuleEngine.match(event.keyCode, gesture.behavior, gesture.durationMs) ?: return
                    
                    ActionExecutor.execute(rule.action)
                    
                    // 5. 攔截原按鍵事件 (不再傳遞給系統)
                    param.result = 0
                } catch (t: Throwable) {
                    LogUtils.e("Hook error", t)
                }
            }
        }

        runCatching {
            XposedHelpers.findAndHookMethod(
                clazz,
                "interceptKeyBeforeQueueing",
                KeyEvent::class.java,
                Int::class.javaPrimitiveType,
                hook
            )
        }.onFailure { first ->
            runCatching {
                XposedHelpers.findAndHookMethod(
                    clazz,
                    "interceptKeyBeforeQueueing",
                    KeyEvent::class.java,
                    Int::class.javaPrimitiveType,
                    Int::class.javaPrimitiveType,
                    hook
                )
            }.onFailure { second ->
                LogUtils.e("Failed to hook interceptKeyBeforeQueueing", first)
                LogUtils.e("Failed to hook interceptKeyBeforeQueueing (3 params)", second)
            }
        }
    }
}
