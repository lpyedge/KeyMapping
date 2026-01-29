package com.keymapping.powerkeyrules.model

sealed class KeyAction {
    data class LaunchIntent(val intent: IntentSpec) : KeyAction()
    data class SendKeyEvent(val keyCode: Int) : KeyAction()
    data class RunShell(val command: String) : KeyAction()
}
