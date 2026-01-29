package com.keymapping.powerkeyrules.xposed

import android.content.Intent
import android.view.KeyEvent
import com.keymapping.powerkeyrules.model.IntentSpec
import com.keymapping.powerkeyrules.model.KeyAction
import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.model.RuleConfig

object DefaultRules {
    fun config(): RuleConfig {
        return RuleConfig(
            rules = listOf(
                // === 單鍵操作示例 ===
                
                // 500ms 長按：啟動語音助手
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_POWER,
                    behavior = KeyBehavior.LONG_PRESS,
                    durationMs = 500,
                    action = KeyAction.LaunchIntent(
                        IntentSpec(action = Intent.ACTION_VOICE_ASSIST)
                    )
                ),
                // 2000ms 長按：喚起系統電源菜單（關機/重啟）
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_POWER,
                    behavior = KeyBehavior.LONG_PRESS,
                    durationMs = 2000,
                    action = KeyAction.RunShell("input keyevent ${KeyEvent.KEYCODE_POWER}")
                ),
                // 長按釋放：顯示通知（長按 2 秒後釋放觸發）
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_POWER,
                    behavior = KeyBehavior.LONG_PRESS_RELEASE,
                    durationMs = 2000,
                    action = KeyAction.RunShell("am broadcast -a android.intent.action.SHOW_BRIGHTNESS_DIALOG")
                ),
                // 雙擊：觸發相機鍵
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_POWER,
                    behavior = KeyBehavior.DOUBLE_PRESS,
                    action = KeyAction.SendKeyEvent(KeyEvent.KEYCODE_CAMERA)
                ),
                
                // === 組合鍵操作示例 ===
                
                // 電源鍵 + 音量上：截屏
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_POWER,
                    behavior = KeyBehavior.COMBO_DOWN,
                    comboKeyCode = KeyEvent.KEYCODE_VOLUME_UP,
                    action = KeyAction.RunShell("input keyevent ${KeyEvent.KEYCODE_SYSRQ}")
                ),
                // 音量上 + 音量下長按 1 秒：靜音模式切換
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_VOLUME_UP,
                    behavior = KeyBehavior.COMBO_LONG_PRESS,
                    comboKeyCode = KeyEvent.KEYCODE_VOLUME_DOWN,
                    durationMs = 1000,
                    action = KeyAction.RunShell("cmd audio set-ringer-mode silent")
                )
            )
        )
    }
}
