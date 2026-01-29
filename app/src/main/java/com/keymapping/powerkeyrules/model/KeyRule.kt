package com.keymapping.powerkeyrules.model

data class KeyRule(
    val keyCode: Int,
    val behavior: KeyBehavior,
    val durationMs: Long = 0,
    val action: KeyAction,
    val comboKeyCode: Int = 0  // 組合鍵的第二個鍵碼（僅 COMBO_* 類型使用）
)
