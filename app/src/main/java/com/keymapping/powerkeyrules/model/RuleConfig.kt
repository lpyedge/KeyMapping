package com.keymapping.powerkeyrules.model

data class RuleConfig(
    val version: Int = 1,
    val doublePressIntervalMs: Long = 300,
    val longPressMinMs: Long = 500,
    val rules: List<KeyRule> = emptyList()
)
