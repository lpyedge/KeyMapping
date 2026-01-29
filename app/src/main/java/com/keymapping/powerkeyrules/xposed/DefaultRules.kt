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
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_POWER,
                    behavior = KeyBehavior.LONG_PRESS,
                    durationMs = 500,
                    action = KeyAction.LaunchIntent(
                        IntentSpec(action = Intent.ACTION_VOICE_ASSIST)
                    )
                ),
                KeyRule(
                    keyCode = KeyEvent.KEYCODE_POWER,
                    behavior = KeyBehavior.DOUBLE_PRESS,
                    action = KeyAction.SendKeyEvent(KeyEvent.KEYCODE_CAMERA)
                )
            )
        )
    }
}
