package com.keymapping.powerkeyrules.xposed

import android.view.KeyEvent
import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.model.RuleConfig

object KeyStateTracker {
    data class KeyGesture(val behavior: KeyBehavior, val durationMs: Long)

    private data class State(
        var downTime: Long = 0,
        var lastUpTime: Long = 0,
        var pressCount: Int = 0
    )

    private val stateMap = mutableMapOf<Int, State>()
    @Volatile private var doublePressInterval = 300L
    @Volatile private var longPressMinMs = 500L

    fun updateConfig(config: RuleConfig, rules: List<KeyRule>) {
        doublePressInterval = config.doublePressIntervalMs
        longPressMinMs = config.longPressMinMs
        val minRuleLongPress = rules
            .filter { it.behavior == KeyBehavior.LONG_PRESS && it.durationMs > 0 }
            .minOfOrNull { it.durationMs }
        if (minRuleLongPress != null && minRuleLongPress < longPressMinMs) {
            longPressMinMs = minRuleLongPress
        }
    }

    @Synchronized
    fun onKeyEvent(event: KeyEvent): KeyGesture? {
        val keyCode = event.keyCode
        val now = event.eventTime
        val state = stateMap.getOrPut(keyCode) { State() }

        return when (event.action) {
            KeyEvent.ACTION_DOWN -> {
                if (now - state.lastUpTime < doublePressInterval) {
                    state.pressCount++
                } else {
                    state.pressCount = 1
                }
                state.downTime = now
                KeyGesture(KeyBehavior.DOWN, 0)
            }
            KeyEvent.ACTION_UP -> {
                val duration = now - state.downTime
                state.lastUpTime = now

                if (state.pressCount == 2) {
                    state.pressCount = 0
                    KeyGesture(KeyBehavior.DOUBLE_PRESS, duration)
                } else if (duration >= longPressMinMs) {
                    KeyGesture(KeyBehavior.LONG_PRESS, duration)
                } else {
                    KeyGesture(KeyBehavior.UP, duration)
                }
            }
            KeyEvent.ACTION_CANCEL -> {
                stateMap.remove(keyCode)
                null
            }
            else -> null
        }
    }
}
