package com.keymapping.powerkeyrules.model

data class KeyRule(
    val keyCode: Int,
    val behavior: KeyBehavior,
    val durationMs: Long = 0,
    val action: KeyAction
)
