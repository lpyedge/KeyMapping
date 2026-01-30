package com.keymapping.powerkeyrules.xposed

import android.os.SystemClock
import android.view.KeyEvent
import com.keymapping.powerkeyrules.model.KeyBehavior
import com.keymapping.powerkeyrules.model.KeyRule
import com.keymapping.powerkeyrules.model.RuleConfig
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * 按鍵狀態追蹤器
 * 
 * 重構改進：
 * - 使用細粒度 per-key 鎖替代全局 synchronized
 * - 組合鍵狀態添加超時自動清理機制
 * - 定時器回調不再持有全局鎖
 */
object KeyStateTracker {
    data class KeyGesture(
        val behavior: KeyBehavior, 
        val durationMs: Long, 
        val firstKeyCode: Int = 0,
        val secondKeyCode: Int = 0
    )

    private class KeyState {
        val lock = ReentrantLock()
        @Volatile var downTime: Long = 0
        @Volatile var lastUpTime: Long = 0
        @Volatile var pressCount: Int = 0
        val triggeredThresholds = ConcurrentHashMap.newKeySet<Long>()
        @Volatile var monitoringFuture: ScheduledFuture<*>? = null
        @Volatile var longPressTriggered: Boolean = false
    }

    // 組合鍵狀態（使用 AtomicReference 确保原子更新）
    private data class ComboState(
        val firstKeyCode: Int = 0,
        val secondKeyCode: Int = 0,
        val comboDownTime: Long = 0,
        val triggeredThresholds: Set<Long> = emptySet(),
        val monitoringFuture: ScheduledFuture<*>? = null
    ) {
        fun isActive() = firstKeyCode != 0 && comboDownTime > 0
        fun hasSecondKey() = secondKeyCode != 0
    }

    // Thread-safe per-key state map
    private val stateMap = ConcurrentHashMap<Int, KeyState>()
    
    // 組合鍵狀態使用 AtomicReference + 不可變數據結構
    private val comboStateRef = AtomicReference(ComboState())
    private val comboLock = ReentrantLock()
    
    // 組合鍵超時：第一個鍵按下後 1 秒內未形成組合則自動清理
    private const val COMBO_FIRST_KEY_TIMEOUT_MS = 1000L
    
    @Volatile private var doublePressInterval = 300L
    @Volatile private var longPressMinMs = 500L
    @Volatile private var longPressRules: List<KeyRule> = emptyList()
    @Volatile private var longPressReleaseRules: List<KeyRule> = emptyList()
    @Volatile private var comboDownRules: List<KeyRule> = emptyList()
    @Volatile private var comboLongPressRules: List<KeyRule> = emptyList()
    
    // 使用 ScheduledExecutorService 進行定時檢查
    private val scheduler: ScheduledExecutorService = Executors.newScheduledThreadPool(2) { runnable ->
        Thread(runnable, "PowerKeyRules-Timer").apply { 
            isDaemon = false  // 非 daemon 線程，確保 system_server 中任務完成
        }
    }

    fun updateConfig(config: RuleConfig, rules: List<KeyRule>) {
        doublePressInterval = config.doublePressIntervalMs
        longPressMinMs = config.longPressMinMs
        
        // 分類規則
        longPressRules = rules.filter { it.behavior == KeyBehavior.LONG_PRESS }
        longPressReleaseRules = rules.filter { it.behavior == KeyBehavior.LONG_PRESS_RELEASE }
        comboDownRules = rules.filter { it.behavior == KeyBehavior.COMBO_DOWN }
        comboLongPressRules = rules.filter { it.behavior == KeyBehavior.COMBO_LONG_PRESS }
    }

    /**
     * 處理按鍵事件（無全局鎖）
     */
    fun onKeyEvent(event: KeyEvent): KeyGesture? {
        val keyCode = event.keyCode
        val now = event.eventTime
        val state = stateMap.getOrPut(keyCode) { KeyState() }

        return when (event.action) {
            KeyEvent.ACTION_DOWN -> handleKeyDown(keyCode, now, state)
            KeyEvent.ACTION_UP -> handleKeyUp(keyCode, now, state)
            else -> null
        }
    }

    private fun handleKeyDown(keyCode: Int, now: Long, state: KeyState): KeyGesture? {
        // 使用 per-key 鎖
        state.lock.withLock {
            // 忽略重複 DOWN
            if (state.downTime > 0) {
                return null
            }
            
            // 檢查組合鍵（在鎖外執行以避免嵌套鎖）
        }
        
        val comboGesture = checkComboKeyDown(keyCode, now)
        if (comboGesture != null) {
            // 記錄按下時間以便追蹤
            state.lock.withLock {
                state.downTime = now
            }
            return comboGesture
        }
        
        state.lock.withLock {
            // 雙擊計數
            if (now - state.lastUpTime < doublePressInterval) {
                state.pressCount++
            } else {
                state.pressCount = 1
            }
            
            state.downTime = now
            state.triggeredThresholds.clear()
            state.longPressTriggered = false
        }
        
        // 啟動長按監控（在鎖外執行）
        startLongPressMonitoring(keyCode, state)
        
        return KeyGesture(KeyBehavior.DOWN, 0)
    }

    private fun handleKeyUp(keyCode: Int, now: Long, state: KeyState): KeyGesture? {
        // 檢查並清理組合鍵狀態
        cleanupComboKeyOnUp(keyCode)
        
        // 取消長按監控
        cancelLongPressMonitoring(state)
        
        val duration: Long
        val wasLongPress: Boolean
        val pressCount: Int
        
        state.lock.withLock {
            // 若無前置 DOWN，忽略此 UP
            if (state.downTime == 0L) {
                return null
            }
            
            duration = now - state.downTime
            wasLongPress = state.longPressTriggered
            pressCount = state.pressCount
            
            state.lastUpTime = now
            state.downTime = 0
            state.longPressTriggered = false
        }

        // 檢查長按釋放
        if (wasLongPress || duration >= longPressMinMs) {
            val releaseGesture = checkLongPressRelease(keyCode, duration)
            if (releaseGesture != null) {
                return releaseGesture
            }
        }

        // 雙擊檢測
        if (pressCount == 2) {
            state.lock.withLock {
                state.pressCount = 0
            }
            return KeyGesture(KeyBehavior.DOUBLE_PRESS, duration)
        }
        
        // 普通單擊（未觸發長按且時長小於閾值）
        if (!wasLongPress && duration < longPressMinMs) {
            return KeyGesture(KeyBehavior.UP, duration)
        }
        
        return null
    }

    private fun handleKeyCancel(keyCode: Int, state: KeyState): KeyGesture? {
        // 清理組合鍵
        cleanupComboKeyOnUp(keyCode)
        
        // 取消長按監控
        cancelLongPressMonitoring(state)
        
        // 清理按鍵狀態
        state.lock.withLock {
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
        val matchingRule = longPressReleaseRules
            .filter { rule -> rule.keyCode == keyCode && duration >= rule.durationMs }
            .maxByOrNull { it.durationMs }
            
        return if (matchingRule != null) {
            KeyGesture(KeyBehavior.LONG_PRESS_RELEASE, duration)
        } else null
    }

    /**
     * 檢查組合鍵按下
     */
    private fun checkComboKeyDown(keyCode: Int, now: Long): KeyGesture? {
        comboLock.withLock {
            val currentCombo = comboStateRef.get()
            
            // 如果已有第一個鍵按下，檢查是否構成組合
            if (currentCombo.isActive() && !currentCombo.hasSecondKey()) {
                // 檢查超時：第一個鍵按下超過 1 秒未形成組合則重置
                if (now - currentCombo.comboDownTime > COMBO_FIRST_KEY_TIMEOUT_MS) {
                    comboStateRef.set(ComboState())
                    // 繼續檢查當前鍵是否可以作為新的第一鍵
                } else {
                    // 檢查是否有匹配的組合鍵規則
                    val matchingRules = (comboDownRules + comboLongPressRules).filter { rule ->
                        (rule.keyCode == currentCombo.firstKeyCode && rule.comboKeyCode == keyCode) ||
                        (rule.keyCode == keyCode && rule.comboKeyCode == currentCombo.firstKeyCode)
                    }
                    
                    if (matchingRules.isNotEmpty()) {
                        val firstKey = currentCombo.firstKeyCode
                        
                        // 更新組合狀態
                        comboStateRef.set(currentCombo.copy(
                            secondKeyCode = keyCode,
                            comboDownTime = now
                        ))
                        
                        // 取消單鍵長按監控
                        stateMap[firstKey]?.let { cancelLongPressMonitoring(it) }
                        stateMap[keyCode]?.let { cancelLongPressMonitoring(it) }

                        // 啟動組合鍵長按監控
                        startComboLongPressMonitoring(firstKey, keyCode)
                        
                        return KeyGesture(
                            behavior = KeyBehavior.COMBO_DOWN, 
                            durationMs = 0,
                            firstKeyCode = firstKey,
                            secondKeyCode = keyCode
                        )
                    }
                }
            }
            
            // 記錄為第一個按下的鍵（如果當前沒有組合狀態）
            val latestCombo = comboStateRef.get()
            if (!latestCombo.isActive()) {
                comboStateRef.set(ComboState(
                    firstKeyCode = keyCode,
                    comboDownTime = now
                ))
            }
            
            return null
        }
    }

    /**
     * 組合鍵釋放時清理狀態
     */
    private fun cleanupComboKeyOnUp(keyCode: Int) {
        comboLock.withLock {
            val currentCombo = comboStateRef.get()
            if (currentCombo.firstKeyCode == keyCode || currentCombo.secondKeyCode == keyCode) {
                currentCombo.monitoringFuture?.cancel(false)
                comboStateRef.set(ComboState())
            }
        }
    }

    /**
     * 啟動單鍵長按監控
     */
    private fun startLongPressMonitoring(keyCode: Int, state: KeyState) {
        cancelLongPressMonitoring(state)

        val lpRules = longPressRules.filter { it.keyCode == keyCode }
        val lprRules = longPressReleaseRules.filter { it.keyCode == keyCode }
        
        if (lpRules.isEmpty() && lprRules.isEmpty()) return
        
        val future = scheduler.scheduleAtFixedRate({
            try {
                var triggerAction: KeyRule? = null
                
                state.lock.withLock { 
                    if (state.downTime == 0L) return@scheduleAtFixedRate
                    
                    val now = SystemClock.uptimeMillis()
                    val elapsed = now - state.downTime
                    
                    // 標記長按狀態
                    if (elapsed >= longPressMinMs) {
                        state.longPressTriggered = true
                    }

                    // 檢查是否觸發 LONG_PRESS 規則
                    for (rule in lpRules) {
                        if (elapsed >= rule.durationMs && !state.triggeredThresholds.contains(rule.durationMs)) {
                            state.triggeredThresholds.add(rule.durationMs)
                            state.longPressTriggered = true
                            triggerAction = rule
                            break
                        }
                    }
                }
                
                // 鎖外執行 Action
                triggerAction?.let { ActionExecutor.execute(it.action) }
                
            } catch (t: Throwable) {
                PowerKeyModule.getXposed()?.log("LongPress timer error: ${t.message}")
            }
        }, 50, 50, TimeUnit.MILLISECONDS)
        
        state.lock.withLock {
            state.monitoringFuture = future
        }
    }

    /**
     * 取消單鍵長按監控
     */
    private fun cancelLongPressMonitoring(state: KeyState) {
        state.lock.withLock {
            state.monitoringFuture?.cancel(false)
            state.monitoringFuture = null
        }
    }

    /**
     * 啟動組合鍵長按監控
     */
    private fun startComboLongPressMonitoring(firstKeyCode: Int, secondKeyCode: Int) {
        val rules = comboLongPressRules
            .filter { rule ->
                (rule.keyCode == firstKeyCode && rule.comboKeyCode == secondKeyCode) ||
                (rule.keyCode == secondKeyCode && rule.comboKeyCode == firstKeyCode)
            }
            .sortedBy { it.durationMs }
        
        if (rules.isEmpty()) return
        
        val future = scheduler.scheduleAtFixedRate({
            try {
                var triggerAction: KeyRule? = null
                
                comboLock.withLock {
                    val combo = comboStateRef.get()
                    if (combo.comboDownTime == 0L) return@scheduleAtFixedRate
                    
                    val now = SystemClock.uptimeMillis()
                    val elapsed = now - combo.comboDownTime
                    
                    for (rule in rules) {
                        if (elapsed >= rule.durationMs && !combo.triggeredThresholds.contains(rule.durationMs)) {
                            comboStateRef.set(combo.copy(
                                triggeredThresholds = combo.triggeredThresholds + rule.durationMs
                            ))
                            triggerAction = rule
                            break
                        }
                    }
                }
                
                triggerAction?.let { ActionExecutor.execute(it.action) }
                
            } catch (t: Throwable) {
                PowerKeyModule.getXposed()?.log("ComboLongPress timer error: ${t.message}")
            }
        }, 50, 50, TimeUnit.MILLISECONDS)
        
        comboLock.withLock {
            val current = comboStateRef.get()
            comboStateRef.set(current.copy(monitoringFuture = future))
        }
    }
}
