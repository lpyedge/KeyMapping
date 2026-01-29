package com.keymapping.powerkeyrules.app

import android.app.Activity
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import com.keymapping.powerkeyrules.util.Constants
import com.keymapping.powerkeyrules.util.LogUtils
import com.keymapping.powerkeyrules.util.RuleJson
import com.keymapping.powerkeyrules.xposed.DefaultRules
import org.json.JSONObject

class WebUiActivity : Activity() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_NO_CACHE
            allowFileAccess = true
            // 安全性：禁用跨域文件訪問，防止遠程 JS 調用原生接口
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
        }
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(AndroidBridge(), "PowerKeyRulesAndroid")
        webView.loadUrl("file:///android_asset/webui/index.html")
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun loadRulesJson(): String {
            val prefs = createDeviceProtectedStorageContext().getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            val json = prefs.getString(Constants.PREFS_KEY_RULES_JSON, null)
            return json ?: ""
        }

        @JavascriptInterface
        fun saveRulesJson(json: String): Boolean {
            // Basic sanity: avoid huge payloads / empty writes
            if (json.length > 128 * 1024) return false
            // Validate JSON structure by parsing it
            try {
                RuleJson.parse(json)
            } catch (t: Throwable) {
                android.util.Log.e("WebUiActivity", "Invalid JSON: ${t.message}", t)
                return false
            }
            // 使用 RuleConfigWriter 統一保存邏輯，消除代碼重複
            RuleConfigWriter.writeJson(this@WebUiActivity, json)
            return true
        }

        @JavascriptInterface
        fun loadDefaultRulesJson(): String {
            return RuleJson.toJson(DefaultRules.config())
        }

        @JavascriptInterface
        fun getUpdatedAt(): Long {
            val prefs = createDeviceProtectedStorageContext().getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            return prefs.getLong(Constants.PREFS_KEY_RULES_UPDATED_AT, 0L)
        }

        /**
         * 測試動作執行 - 用於調試
         * @param actionJson 動作的 JSON 字符串，格式如：
         *   {"type":"run_shell","command":"echo test"}
         *   {"type":"send_key","keyCode":27}
         *   {"type":"launch_intent","intent":{"action":"android.settings.SETTINGS"}}
         * @return 執行結果訊息
         */
        @JavascriptInterface
        fun testAction(actionJson: String): String {
            return try {
                val obj = JSONObject(actionJson)
                when (obj.optString("type", "")) {
                    "run_shell" -> testRunShell(obj.optString("command", ""))
                    "send_key" -> testSendKey(obj.optInt("keyCode", -1))
                    "launch_intent" -> testLaunchIntent(obj.optJSONObject("intent"))
                    else -> "錯誤：未知的動作類型"
                }
            } catch (t: Throwable) {
                LogUtils.e("testAction error", t)
                "錯誤：${t.message}"
            }
        }

        private fun testRunShell(command: String): String {
            if (command.isBlank()) return "錯誤：命令不能為空"
            val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
            return try {
                // 使用 Future 避免主線程阻塞，添加 3 秒超時
                val future = executor.submit<String> {
                    val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
                    val completed = process.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
                    if (!completed) {
                        process.destroy()
                        return@submit "⚠️ 執行超時（3秒）"
                    }
                    val exitCode = process.exitValue()
                    val output = process.inputStream.bufferedReader().readText().take(500)
                    val error = process.errorStream.bufferedReader().readText().take(200)
                    buildString {
                        append("✅ 執行完成 (exit=$exitCode)")
                        if (output.isNotBlank()) append("\n輸出：$output")
                        if (error.isNotBlank()) append("\n錯誤：$error")
                    }
                }
                future.get(4, java.util.concurrent.TimeUnit.SECONDS)
            } catch (e: java.util.concurrent.TimeoutException) {
                "⚠️ 整體超時（4秒）"
            } catch (t: Throwable) {
                "❌ 執行失敗：${t.message}"
            } finally {
                executor.shutdownNow()
            }
        }

        private fun testSendKey(keyCode: Int): String {
            if (keyCode < 0) return "錯誤：無效的 keyCode"
            val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
            return try {
                // 使用 Future 避免主線程阻塞，添加 2 秒超時
                val future = executor.submit<String> {
                    val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", "input keyevent $keyCode"))
                    val completed = process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)
                    if (!completed) {
                        process.destroy()
                        return@submit "⚠️ 執行超時（2秒）"
                    }
                    val exitCode = process.exitValue()
                    if (exitCode == 0) {
                        "✅ 已發送 keyCode=$keyCode"
                    } else {
                        "⚠️ 執行完成但 exit=$exitCode（可能需要 Root 權限）"
                    }
                }
                future.get(3, java.util.concurrent.TimeUnit.SECONDS)
            } catch (e: java.util.concurrent.TimeoutException) {
                "⚠️ 整體超時（3秒）"
            } catch (t: Throwable) {
                "❌ 發送失敗：${t.message}"
            } finally {
                executor.shutdownNow()
            }
        }

        private fun testLaunchIntent(intentObj: JSONObject?): String {
            if (intentObj == null) return "錯誤：Intent 不能為空"
            return try {
                val intent = Intent()
                val action = intentObj.optString("action", null)
                val pkg = intentObj.optString("package", null)
                val className = intentObj.optString("className", null)
                val data = intentObj.optString("data", null)

                if (!action.isNullOrBlank()) intent.action = action
                if (!pkg.isNullOrBlank() && !className.isNullOrBlank()) {
                    intent.setClassName(pkg, className)
                } else if (!pkg.isNullOrBlank()) {
                    intent.`package` = pkg
                }
                if (!data.isNullOrBlank()) intent.data = Uri.parse(data)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

                this@WebUiActivity.startActivity(intent)
                "✅ Intent 已啟動"
            } catch (t: Throwable) {
                "❌ 啟動失敗：${t.message}"
            }
        }
    }
}

