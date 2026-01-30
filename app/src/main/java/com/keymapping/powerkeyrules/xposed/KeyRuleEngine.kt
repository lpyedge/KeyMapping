package com.keymapping.powerkeyrules.xposed

import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule

/**
 * 規則匹配引擎
 * 
 * Modern 版本：規則數據由 ModernRuleStore 管理
 * 本類僅負責匹配邏輯
 * 
 * 性能優化：
 * - 使用 ModernRuleStore 的索引 Map，O(1) 查找
 * - 組合鍵使用專用 comboIndex，避免合併列表
 */
object KeyRuleEngine {

    /**
     * 匹配單一規則（最長匹配）
     * @param keyCode 按鍵碼
     * @param behavior 按鍵行為（DOWN/UP/LONG_PRESS/DOUBLE_PRESS）
     * @param duration 按壓時長（毫秒）
     * @return 匹配的規則，若無則返回 null
     */
    fun match(keyCode: Int, behavior: KeyBehavior, duration: Long): KeyRule? {
        // 使用索引 Map 快速查找，避免線性掃描
        val candidates = ModernRuleStore.getRulesForKey(keyCode, behavior.name)
            .filter { duration >= it.durationMs }
        
        // 返回 durationMs 最大的規則（最精確匹配）
        return candidates.maxByOrNull { it.durationMs }
    }

    /**
     * 匹配所有符合條件的規則（按 durationMs 由小到大排序）
     * 用於多階段長按場景：500ms 觸發動作 A，2000ms 觸發動作 B
     * @return 所有匹配的規則列表，按時長由短到長排序
     */
    fun matchAll(keyCode: Int, behavior: KeyBehavior, duration: Long): List<KeyRule> {
        return ModernRuleStore.getRulesForKey(keyCode, behavior.name)
            .filter { duration >= it.durationMs }
            .sortedBy { it.durationMs }
    }

    /**
     * 匹配組合鍵規則
     * 
     * 優化：使用 ModernRuleStore.getComboRules() 進行 O(1) 查找
     * 
     * @param firstKeyCode 第一個按鍵碼
     * @param secondKeyCode 第二個按鍵碼
     * @param behavior 按鍵行為（COMBO_DOWN/COMBO_LONG_PRESS）
     * @return 匹配的規則，若無則返回 null
     */
    fun matchCombo(firstKeyCode: Int, secondKeyCode: Int, behavior: KeyBehavior): KeyRule? {
        // 使用組合鍵專用索引，O(1) 查找
        val candidates = ModernRuleStore.getComboRules(firstKeyCode, secondKeyCode)

        return candidates.firstOrNull { rule ->
            rule.behavior == behavior &&
            ((rule.keyCode == firstKeyCode && rule.comboKeyCode == secondKeyCode) ||
             (rule.keyCode == secondKeyCode && rule.comboKeyCode == firstKeyCode))
        }
    }
    
    /**
     * 匹配組合鍵長按規則（帶時長過濾）
     */
    fun matchComboLongPress(firstKeyCode: Int, secondKeyCode: Int, duration: Long): KeyRule? {
        val candidates = ModernRuleStore.getComboRules(firstKeyCode, secondKeyCode)
            .filter { it.behavior == KeyBehavior.COMBO_LONG_PRESS && duration >= it.durationMs }
        
        return candidates.maxByOrNull { it.durationMs }
    }
}
