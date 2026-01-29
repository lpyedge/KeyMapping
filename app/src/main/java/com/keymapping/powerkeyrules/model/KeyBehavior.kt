package com.keymapping.powerkeyrules.model

enum class KeyBehavior {
    DOWN,
    UP,
    LONG_PRESS,
    // Long press then release (trigger on ACTION_UP if duration threshold reached).
    LONG_PRESS_RELEASE,
    DOUBLE_PRESS,
    // Two-key combo pressed down (triggered when second key is pressed).
    COMBO_DOWN,
    // Two-key combo long press (triggered while both keys are held).
    COMBO_LONG_PRESS,
}

