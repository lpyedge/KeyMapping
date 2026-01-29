package com.keymapping.powerkeyrules.xposed

import android.view.KeyEvent
import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.model.RuleConfig
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

object KeyStateTracker {
    data class KeyGesture(
        val behavior: KeyBehavior, 
        val durationMs: Long, 
        val firstKeyCode: Int = 0,
        val secondKeyCode: Int = 0
    )

    private data class State(
        var downTime: Long = 0,
        var lastUpTime: Long = 0,
        var pressCount: Int = 0,
        var triggeredThresholds: MutableSet<Long> = mutableSetOf(),  // 已觸發的閾值（單鍵長按）
        var monitoringFuture: ScheduledFuture<*>? = null,  // 監控任務（單鍵長按）
        var longPressTriggered: Boolean = false  // 是否觸發過長按（用於長按釋放判斷）
    )

    // 組合鍵狀態
    private data class ComboState(
        var firstKeyCode: Int = 0,
        var secondKeyCode: Int = 0,
        var comboDownTime: Long = 0,
        var triggeredThresholds: MutableSet<Long> = mutableSetOf(),  // 已觸發的閾值（組合鍵長按）
        var monitoringFuture: ScheduledFuture<*>? = null  // 監控任務（組合鍵長按）
    )

    // Thread-safe map for concurrent access
    private val stateMap = ConcurrentHashMap<Int, State>()
    
    // 组合键状态需要同步保护（虽然通常是顺序访问，但为安全起见）
    @Volatile private var comboState = ComboState()
    private val comboLock = Any()
    
    @Volatile private var doublePressInterval = 300L
    @Volatile private var longPressMinMs = 500L
    @Volatile private var longPressRules: List<KeyRule> = emptyList()
    @Volatile private var longPressReleaseRules: List<KeyRule> = emptyList()
    @Volatile private var comboDownRules: List<KeyRule> = emptyList()
    @Volatile private var comboLongPressRules: List<KeyRule> = emptyList()
    
    // 使用 ScheduledExecutorService 進行定時檢查（system_server 沒有 MainLooper）
    private val scheduler: ScheduledExecutorService = Executors.newScheduledThreadPool(2)

    @Synchronized
    fun updateConfig(config: RuleConfig, rules: List<KeyRule>) {
        doublePressInterval = config.doublePressIntervalMs
        longPressMinMs = config.longPressMinMs
        
        // 分類規則
        longPressRules = rules.filter { it.behavior == KeyBehavior.LONG_PRESS }
        longPressReleaseRules = rules.filter { it.behavior == KeyBehavior.LONG_PRESS_RELEASE }
        comboDownRules = rules.filter { it.behavior == KeyBehavior.COMBO_DOWN }
        comboLongPressRules = rules.filter { it.behavior == KeyBehavior.COMBO_LONG_PRESS }
        
        // FIX: 不要因為規則時長短就降低全局判定閾值，這會導致誤判
        // longPressMinMs 應該嚴格遵守用戶配置
    }

    @Synchronized
    fun onKeyEvent(event: KeyEvent): KeyGesture? {
        val keyCode = event.keyCode
        val now = event.eventTime
        val state = stateMap.getOrPut(keyCode) { State() }

        return when (event.action) {
            KeyEvent.ACTION_DOWN -> handleKeyDown(keyCode, now, state)
            KeyEvent.ACTION_UP -> handleKeyUp(keyCode, now, state)
            KeyEvent.ACTION_CANCEL -> handleKeyCancel(keyCode)
            else -> null
        }
    }

    private fun handleKeyDown(keyCode: Int, now: Long, state: State): KeyGesture? {
        // 忽略重複 DOWN（系統長按時 repeatCount > 0）
        if (state.downTime > 0) {
            return null
        }
        
        // 檢查是否是組合鍵
        val comboGesture = checkComboKeyDown(keyCode, now)
        if (comboGesture != null) {
            return comboGesture
        }
        
        // 雙擊計數
        if (now - state.lastUpTime < doublePressInterval) {
            state.pressCount++
        } else {
            state.pressCount = 1
        }
        
        state.downTime = now
        state.triggeredThresholds.clear()
        state.longPressTriggered = false
        
        // 啟動長按監控
        startLongPressMonitoring(keyCode)
        
        return KeyGesture(KeyBehavior.DOWN, 0)
    }

    private fun handleKeyUp(keyCode: Int, now: Long, state: State): KeyGesture? {
        // 检查是否是组合键释放
        checkComboKeyUp(keyCode)
        
        // 取消长按监控
        cancelLongPressMonitoring(keyCode)
        
        // 若无前置 DOWN，忽略此 UP（防止 duration 计算异常）
        if (state.downTime == 0L) {
            return null
        }
        
        val duration = now - state.downTime
        val wasLongPress = state.longPressTriggered
        
        state.lastUpTime = now
        state.downTime = 0
        state.longPressTriggered = false

        // 检查长按释放
        // 只要达到长按状态（无论是通过定时器触发了 LONG_PRESS，还是仅仅超过了时间），都尝试匹配 LONG_PRESS_RELEASE
        if (wasLongPress || duration >= longPressMinMs) {
            val releaseGesture = checkLongPressRelease(keyCode, duration)
            if (releaseGesture != null) {
                return releaseGesture
            }
        }

        // 双击检测
        if (state.pressCount == 2) {
            state.pressCount = 0
            return KeyGesture(KeyBehavior.DOUBLE_PRESS, duration)
        }
        
        // 普通单击
        // 如果已经触发过长按，不应再触发 UP（避免长按后释放又触发单击）
        if (!wasLongPress && duration < longPressMinMs) {
            return KeyGesture(KeyBehavior.UP, duration)
        }
        
        return null
    }

    private fun handleKeyCancel(keyCode: Int): KeyGesture? {
        // 检查组合键取消
        synchronized(comboLock) {
            if (comboState.firstKeyCode == keyCode || comboState.secondKeyCode == keyCode) {
                cancelComboLongPressMonitoring()
                comboState = ComboState()
            }
        }
        
        // 取消单键长按监控
        cancelLongPressMonitoring(keyCode)
        
        // 清理状态
        stateMap[keyCode]?.let { state ->
            state.downTime = 0
            state.pressCount = 0
            state.triggeredThresholds.clear()
            state.longPressTriggered = false
        }
        
        return null
    }

    /**
     * 檢查長按釋放
     */
    private fun checkLongPressRelease(keyCode: Int, duration: Long): KeyGesture? {
        // 找出所有符合時長的 LongPressRelease 規則，取時長最長的那個（最精確匹配）
        // 比如有 500ms 和 2000ms 的規則，按了 2500ms，應該匹配 2000ms 的
        val matchingRule = longPressReleaseRules
            .filter { rule -> rule.keyCode == keyCode && duration >= rule.durationMs }
            .maxByOrNull { it.durationMs }
            
        return if (matchingRule != null) {
            KeyGesture(KeyBehavior.LONG_PRESS_RELEASE, duration)
        } else null
    }

    /**
     * 检查组合键按下
     */
    private fun checkComboKeyDown(keyCode: Int, now: Long): KeyGesture? {
        synchronized(comboLock) {
            // 如果已有一个键按下，检查是否构成组合键
            if (comboState.firstKeyCode != 0 && comboState.comboDownTime > 0) {
                // 检查是否有匹配的组合键规则（COMBO_DOWN 或 COMBO_LONG_PRESS）
                val matchingDownRules = comboDownRules.filter { rule ->
                    (rule.keyCode == comboState.firstKeyCode && rule.comboKeyCode == keyCode) ||
                    (rule.keyCode == keyCode && rule.comboKeyCode == comboState.firstKeyCode)
                }
                val matchingLongPressRules = comboLongPressRules.filter { rule ->
                    (rule.keyCode == comboState.firstKeyCode && rule.comboKeyCode == keyCode) ||
                    (rule.keyCode == keyCode && rule.comboKeyCode == comboState.firstKeyCode)
                }
                val matchingRules = matchingDownRules + matchingLongPressRules
                
                if (matchingRules.isNotEmpty()) {
                    comboState.secondKeyCode = keyCode
                    comboState.comboDownTime = now
                    
                    // Combo has higher priority than single-key long press; stop per-key long-press monitoring to
                    // avoid firing LONG_PRESS actions while a combo is being performed.
                    cancelLongPressMonitoring(comboState.firstKeyCode)
                    cancelLongPressMonitoring(keyCode)

                    // 启动组合键长按监控
                    startComboLongPressMonitoring(comboState.firstKeyCode, keyCode)
                    
                    return KeyGesture(
                        behavior = KeyBehavior.COMBO_DOWN, 
                        durationMs = 0,
                        firstKeyCode = comboState.firstKeyCode,
                        secondKeyCode = keyCode
                    )
                }
            }
            
            // 记录第一个按下的键
            if (comboState.firstKeyCode == 0) {
                comboState.firstKeyCode = keyCode
                comboState.comboDownTime = now
            }
            
            return null
        }
    }

    /**
     * 检查组合键释放
     */
    private fun checkComboKeyUp(keyCode: Int) {
        synchronized(comboLock) {
            if (comboState.firstKeyCode == keyCode || comboState.secondKeyCode == keyCode) {
                cancelComboLongPressMonitoring()
                comboState = ComboState()
            }
        }
    }

    /**
     * 啟動單鍵長按監控
     */
    private fun startLongPressMonitoring(keyCode: Int) {
        cancelLongPressMonitoring(keyCode)
        
        val state = stateMap[keyCode] ?: return

        // FIX: 必須同時考慮 LONG_PRESS 和 LONG_PRESS_RELEASE 規則
        // 即使用戶只配置了 LONG_PRESS_RELEASE，也需要定時器來標記 "longPressTriggered"
        
        val lpRules = longPressRules.filter { it.keyCode == keyCode }
        val lprRules = longPressReleaseRules.filter { it.keyCode == keyCode }
        
        if (lpRules.isEmpty() && lprRules.isEmpty()) return
        
        // 收集所有需要喚醒的時間點
        // 對於 LONG_PRESS，需要觸發 Action
        // 對於 LONG_PRESS_RELEASE，只需要標記 longPressTriggered = true
        val checkPoints = mutableSetOf<Long>()
        lpRules.forEach { checkPoints.add(it.durationMs) }
        lprRules.forEach { checkPoints.add(it.durationMs) }
        
        // 如果沒有具體時間點（例如異常數據），至少添加 longPressMinMs 以便區分單擊
        if (checkPoints.isEmpty()) {
             checkPoints.add(longPressMinMs)
        }
        
        state.monitoringFuture = scheduler.scheduleAtFixedRate({
             // 注意：不要在定時器中鎖定整個 KeyStateTracker，這會阻塞主線程的 onKeyEvent
             // 我們只鎖定當前按鍵的 state 對象，或者使用更細粒度的鎖
             // 為了簡單起見，這裡還是使用了 synchronized(this)，但在 ActionExecutor 執行時是異步的，所以影響較小
             // 但為了最佳實踐，我們試著只讀取必要的變量
             
             var triggerAction: KeyRule? = null
             var markTriggered = false
             
             synchronized(this) { 
                if (state.downTime == 0L) return@synchronized // 已释放
                
                val now = android.os.SystemClock.uptimeMillis()
                val elapsed = now - state.downTime
                
                // 標記長按狀態
                if (elapsed >= longPressMinMs) {
                    state.longPressTriggered = true
                }

                // 检查是否触发 LONG_PRESS 规则
                for (rule in lpRules) {
                    if (elapsed >= rule.durationMs && !state.triggeredThresholds.contains(rule.durationMs)) {
                        state.triggeredThresholds.add(rule.durationMs)
                        state.longPressTriggered = true
                        triggerAction = rule // 拿出锁外执行
                        break // 一次只触发一个阈值
                    }
                }
             }
             
             // 锁外执行 Action
             if (triggerAction != null) {
                 ActionExecutor.execute(triggerAction!!.action)
             }
             
        }, 50, 50, TimeUnit.MILLISECONDS)
    }

    /**
     * 取消單鍵長按監控
     */
    private fun cancelLongPressMonitoring(keyCode: Int) {
        stateMap[keyCode]?.monitoringFuture?.cancel(false)
        stateMap[keyCode]?.monitoringFuture = null
    }

    /**
     * 启动组合键长按监控
     */
    private fun startComboLongPressMonitoring(firstKeyCode: Int, secondKeyCode: Int) {
        cancelComboLongPressMonitoring()
        
        val rules = comboLongPressRules
            .filter { rule ->
                (rule.keyCode == firstKeyCode && rule.comboKeyCode == secondKeyCode) ||
                (rule.keyCode == secondKeyCode && rule.comboKeyCode == firstKeyCode)
            }
            .sortedBy { it.durationMs }
        
        if (rules.isEmpty()) return
        
        val future = scheduler.scheduleAtFixedRate({
            var triggerAction: KeyRule? = null
            
            synchronized(comboLock) {
                if (comboState.comboDownTime == 0L) return@scheduleAtFixedRate
                
                val now = android.os.SystemClock.uptimeMillis()
                val elapsed = now - comboState.comboDownTime
                
                for (rule in rules) {
                    if (elapsed >= rule.durationMs && !comboState.triggeredThresholds.contains(rule.durationMs)) {
                        comboState.triggeredThresholds.add(rule.durationMs)
                        triggerAction = rule
                        break // 一次只触发一个
                    }
                }
            }
            
            if (triggerAction != null) {
                ActionExecutor.execute(triggerAction!!.action)
            }
            
        }, 50, 50, TimeUnit.MILLISECONDS)
        
        synchronized(comboLock) {
            comboState.monitoringFuture = future
        }
    }

    /**
     * 取消组合键长按监控
     */
    private fun cancelComboLongPressMonitoring() {
        synchronized(comboLock) {
            comboState.monitoringFuture?.cancel(false)
            comboState.monitoringFuture = null
            comboState.triggeredThresholds.clear()
        }
    }
}
