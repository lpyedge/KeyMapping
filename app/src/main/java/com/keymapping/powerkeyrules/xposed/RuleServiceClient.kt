package com.keymapping.powerkeyrules.xposed

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.keymapping.powerkeyrules.IRuleService
import com.keymapping.powerkeyrules.util.Constants
import com.keymapping.powerkeyrules.util.LogUtils
import com.keymapping.powerkeyrules.util.SystemContext
import com.keymapping.powerkeyrules.util.Time
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

object RuleServiceClient {
    private const val MIN_REFRESH_INTERVAL_MS = 1000L
    private const val BIND_TIMEOUT_MS = 1500L

    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "PowerKeyRules-RuleSvc").apply { isDaemon = true }
    }

    @Volatile private var lastRefreshAt: Long = 0L
    @Volatile private var cachedUpdatedAt: Long = -1L
    @Volatile private var cachedRulesJson: String? = null
    private val initialized = AtomicBoolean(false)

    /**
     * 同步刷新一次（僅用於初始化），確保首次按鍵前配置已載入。
     * 後續按鍵事件應使用 maybeRefresh（異步背景刷新）。
     */
    fun refreshSyncOnce(context: Context?) {
        if (!initialized.compareAndSet(false, true)) return
        val ctx = context ?: SystemContext.tryGet() ?: return
        refreshBlocking(ctx)
    }

    fun maybeRefresh(context: Context?) {
        val now = Time.uptimeMillis()
        if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return
        lastRefreshAt = now

        val ctx = context ?: SystemContext.tryGet() ?: return
        executor.execute { refreshBlocking(ctx) }
    }

    fun getCachedSignatureOrNull(): String? {
        val updatedAt = cachedUpdatedAt
        return if (updatedAt >= 0) "svc:$updatedAt" else null
    }

    fun getCachedRulesJsonOrNull(): String? = cachedRulesJson

    private fun refreshBlocking(context: Context) {
        val result = bindAndFetch(context) ?: return
        if (result.updatedAt < 0) return
        if (result.updatedAt == cachedUpdatedAt && result.rulesJson == null) return

        val json = result.rulesJson
        if (json.isNullOrBlank()) return
        if (result.updatedAt != cachedUpdatedAt || json != cachedRulesJson) {
            cachedUpdatedAt = result.updatedAt
            cachedRulesJson = json
            LogUtils.i("RuleServiceClient refreshed: updatedAt=${result.updatedAt}, size=${json.length}")
        }
    }

    private data class FetchResult(val updatedAt: Long, val rulesJson: String?)

    private fun bindAndFetch(context: Context): FetchResult? {
        val intent = Intent().setClassName(
            Constants.MODULE_PACKAGE,
            "${Constants.MODULE_PACKAGE}.app.RuleService"
        )

        val binderRef = AtomicReference<IBinder?>()
        val latch = CountDownLatch(1)
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, service: IBinder) {
                binderRef.set(service)
                latch.countDown()
            }

            override fun onServiceDisconnected(name: ComponentName) {
                // ignore
            }

            override fun onBindingDied(name: ComponentName) {
                // ignore
            }

            override fun onNullBinding(name: ComponentName) {
                latch.countDown()
            }
        }

        val bound = try {
            context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        } catch (t: Throwable) {
            LogUtils.e("RuleServiceClient bind failed", t)
            false
        }

        if (!bound) return null

        return try {
            if (!latch.await(BIND_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                null
            } else {
                val binder = binderRef.get() ?: return null
                val api = IRuleService.Stub.asInterface(binder) ?: return null
                val updatedAt = try {
                    api.getUpdatedAt()
                } catch (t: Throwable) {
                    LogUtils.e("RuleServiceClient getUpdatedAt failed", t)
                    -1L
                }
                if (updatedAt >= 0 && updatedAt == cachedUpdatedAt && cachedRulesJson != null) {
                    FetchResult(updatedAt, null)
                } else {
                    val json = try {
                        api.getRulesJson()
                    } catch (t: Throwable) {
                        LogUtils.e("RuleServiceClient getRulesJson failed", t)
                        null
                    }
                    FetchResult(updatedAt, json)
                }
            }
        } finally {
            runCatching { context.unbindService(connection) }
        }
    }
}
