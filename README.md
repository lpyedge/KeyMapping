# PowerKeyRules - Android 實體按鍵映射模組

基於 LSPosed/Xposed 的 Android 實體按鍵自訂映射模組，通過 Hook `PhoneWindowManager.interceptKeyBeforeQueueing` 實現按鍵行為重定義。

## 特性

- ✅ 支援長按、雙擊、單擊等多種手勢識別
- ✅ 三種動作類型：啟動 Intent、發送按鍵事件、執行 Shell 命令
- ✅ APK 內建 WebUI 可視化配置界面
- ✅ 穩定的跨進程配置讀取（AIDL + Service）
- ✅ 防崩潰設計（電源鍵 DOWN 永不攔截 + 全局異常捕獲）
- ✅ 性能優化（簽名快取 + 1 秒 reload 節流）

---

## 前置需求

### 必需環境

1. **Root 權限**: Magisk 或 KernelSU
2. **Xposed 框架**（任選其一）:
   - [LSPosed](https://github.com/LSPosed/LSPosed/releases)
   - [LSPosed_mod](https://github.com/mywalkb/LSPosed_mod/releases) (Zygisk)

### 安裝步驟

```bash
# 1. 確保設備已 Root
# 2. 安裝 LSPosed 模組並重啟
# 3. 安裝本模組 APK
# 4. 在 LSPosed Manager 中：
#    - 啟用「PowerKeyRules」
#    - 勾選作用域：系統框架 (android)
# 5. 重啟設備生效
```

---

## 編譯構建

### 系統要求

- JDK 17+
- Gradle 8.2+ 或使用系統 `gradle` 命令
- 網絡連接（首次構建時下載 Xposed API）

> **注意**：
> - 當前倉庫未包含 Gradle Wrapper（`gradlew`），構建腳本會自動使用系統 `gradle`
> - 首次構建時會自動從 JCenter/Maven Central 下載 Xposed API (api-82.jar)

### Windows

```batch
build.bat debug      # Debug 版本
build.bat release    # Release 版本（推薦）
build.bat clean      # 清理
```

### Linux/macOS

```bash
chmod +x build.sh
./build.sh debug     # Debug 版本
./build.sh release   # Release 版本（推薦）
./build.sh clean     # 清理
```

**輸出**: `app/build/outputs/apk/release/app-release.apk`

---

## 配置方式

### 📱 推薦方式：APK 內建 WebUI

1. 打開「PowerKeyRules」應用
2. 點擊「打開 WebUI 配置」
3. 在可視化界面中添加/編輯規則
4. 點擊「保存」即時生效

### 📝 JSON 配置結構

```json
{
  "version": 1,
  "doublePressIntervalMs": 300,
  "longPressMinMs": 500,
  "rules": [
    {
      "keyCode": 26,
      "behavior": "LONG_PRESS",
      "durationMs": 500,
      "action": {
        "type": "launch_intent",
        "intent": {
          "action": "android.intent.action.VOICE_ASSIST"
        }
      }
    }
  ]
}
```

#### 全局參數

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `version` | 配置版本 | 1 |
| `doublePressIntervalMs` | 雙擊判定間隔（毫秒） | 300 |
| `longPressMinMs` | 長按判定閾值（毫秒） | 500 |

#### 規則欄位 (rules)

| 欄位 | 類型 | 說明 |
|------|------|------|
| `keyCode` | Int | Android 按鍵代碼（26=電源鍵, 24/25=音量鍵） |
| `behavior` | String | `DOWN`/`UP`/`LONG_PRESS`/`DOUBLE_PRESS` |
| `durationMs` | Long | 長按閾值（僅 `LONG_PRESS` 需要） |
| `action` | Object | 執行動作（見下文） |

### 動作類型 (Action)

#### 1. 啟動 Intent (`launch_intent`)

```json
{
  "type": "launch_intent",
  "intent": {
    "action": "android.intent.action.VOICE_ASSIST"
  }
}
```

**常用示例**:

```json
// 語音助手
{"action": "android.intent.action.VOICE_ASSIST"}

// 相機
{"action": "android.media.action.STILL_IMAGE_CAMERA"}

// 指定應用
{
  "action": "android.intent.action.MAIN",
  "package": "com.android.settings",
  "className": "com.android.settings.Settings"
}
```

#### 2. 發送按鍵事件 (`send_key`)

```json
{
  "type": "send_key",
  "keyCode": 27
}
```

**常用按鍵代碼**:
- `27` - 相機鍵
- `223` - 休眠/關屏 (SLEEP)
- `224` - 喚醒/亮屏 (WAKEUP)
- `85` - 播放/暫停

#### 3. 執行 Shell 命令 (`run_shell`)

```json
{
  "type": "run_shell",
  "command": "input keyevent 223"
}
```

**常用命令**:
```bash
# 截圖
input keyevent 120

# 關閉屏幕
input keyevent 223

# 滑動解鎖
input swipe 500 1500 500 500
```

---

## 技術架構

### 配置流程

```
用戶操作 WebUI (APK)
    ↓
保存到 SharedPreferences + device-protected file
    ↓
system_server 通過 AIDL 綁定 RuleService
    ↓
RuleServiceClient 快取規則 JSON
    ↓
按鍵事件觸發 → KeyRuleEngine 匹配規則
    ↓
ActionExecutor 執行動作（Intent/KeyEvent/Shell）
```

### 核心組件

| 組件 | 職責 |
|------|------|
| `PowerKeyHook` | Xposed Hook 入口，攔截 `interceptKeyBeforeQueueing` |
| `KeyStateTracker` | 手勢檢測（長按/雙擊/單擊） |
| `KeyRuleEngine` | 規則匹配與 reload 節流 |
| `RuleStore` | 配置加載（僅從 AIDL service 讀取） |
| `RuleServiceClient` | AIDL 客戶端，維護規則快取 |
| `RuleService` | AIDL 服務端，讀取 SharedPreferences |
| `ActionExecutor` | 動作執行（後台執行，避免阻塞） |

### 安全機制

- ✅ **電源鍵 DOWN 永不攔截**: 保證喚醒功能不受影響
- ✅ **UID 檢查**: RuleService 僅允許 `SYSTEM_UID (1000)` 或自身訪問
- ✅ **全局異常捕獲**: Hook 與動作執行都有 try/catch 保護
- ✅ **同步初始化**: Hook 加載時同步刷新配置，確保首次按鍵即可生效

### 性能優化

- ⚡ **簽名快取**: 僅比較 `updatedAt` 時間戳，避免重複讀取 JSON
- ⚡ **1 秒節流**: reload 檢查間隔最小 1000ms
- ⚡ **後台執行**: Shell/Intent 在獨立線程執行，不阻塞按鍵響應
- ⚡ **智能刷新**: 僅在時間戳變化時才重新解析 JSON

---

## 預設規則

未配置時使用以下預設規則：

```json
{
  "version": 1,
  "doublePressIntervalMs": 300,
  "longPressMinMs": 500,
  "rules": [
    {
      "keyCode": 26,
      "behavior": "LONG_PRESS",
      "durationMs": 500,
      "action": {
        "type": "launch_intent",
        "intent": {"action": "android.intent.action.VOICE_ASSIST"}
      }
    },
    {
      "keyCode": 26,
      "behavior": "DOUBLE_PRESS",
      "durationMs": 0,
      "action": {
        "type": "send_key",
        "keyCode": 27
      }
    }
  ]
}
```

- **電源鍵長按 500ms**: 啟動語音助手
- **電源鍵雙擊**: 觸發相機鍵事件

---

## 限制與注意事項

### ⚠️ 已知限制

1. **雙擊第一次按鍵會觸發單擊規則**
   - 這是輕量級攔截器的通用權衡
   - 建議：避免同時配置同一按鍵的單擊和雙擊規則

2. **長按可能與系統功能衝突**
   - 電源鍵長按系統會彈出電源選單
   - 建議：使用 2 秒以上的長按閾值，或通過其他方式禁用系統長按選單

3. **配置生效時機**
   - 保存後配置會在 1 秒內自動刷新
   - 若未生效可嘗試：按一次其他按鍵觸發 reload，或重啟 system_server

### 🛡️ 安全建議

- 首次測試建議配置音量鍵，避免影響電源鍵基本功能
- 避免配置會觸發同一按鍵的 Shell 命令（如 `input keyevent 26`），會導致遞歸
- 測試前備份重要數據

### 🔍 調試

```bash
# 查看模組日誌
adb logcat | grep PowerKeyRules

# 查看配置文件（需 root）
adb shell su -c "cat /data/user/0/com.keymapping.powerkeyrules/shared_prefs/powerkey_rules.xml"

# 查看備份文件
adb shell su -c "cat /data/user_de/0/com.keymapping.powerkeyrules/files/rules.json"
```

---

## 故障排除

### 模組不生效

1. 檢查 LSPosed Manager 中模組是否啟用
2. 確認已勾選「系統框架 (android)」作用域
3. 重啟設備後查看日誌: `adb logcat | grep PowerKeyRules`
4. 確認 LSPosed 自身工作正常（檢查其他模組）

### 按鍵無響應

1. 檢查 WebUI 保存時是否顯示「已保存配置」
2. 確認 JSON 格式正確（WebUI 會自動驗證）
3. 查看日誌中是否有 "Rules loaded from service" 或錯誤訊息
4. 嘗試重啟 system_server: `adb shell su -c "killall system_server"`（會重啟 UI）

### 系統卡頓/重啟

1. 立即檢查是否配置了遞歸規則（如電源鍵觸發 `input keyevent 26`）
2. 通過 ADB 刪除配置: `adb shell su -c "rm /data/user/0/com.keymapping.powerkeyrules/shared_prefs/powerkey_rules.xml"`
3. 重啟設備，在 LSPosed 中暫時停用模組
4. 檢查日誌找出問題規則

---

## 開發技術棧

- **語言**: Kotlin
- **構建**: Gradle 8.2 + AGP 8.2.2
- **最低版本**: Android 8.0 (API 26)
- **目標版本**: Android 14 (API 34)
- **依賴**:
  - Xposed API 82 (compileOnly)
  - Kotlin stdlib

---

## 許可證

本專案採用 **Apache License 2.0** 開源。

---

## 貢獻

歡迎提交 Issue 和 Pull Request！

### 開發指南

1. `webui/` 目錄為開發版本，修改後需同步到 `app/src/main/assets/webui/`
2. 修改 AIDL 後需 Clean Project 重新生成存根代碼
3. 測試前建議先在模擬器/副設備驗證，避免影響主設備

### 相關資源

- [Xposed API 文檔](https://api.xposed.info/)
- [LSPosed 項目](https://github.com/LSPosed/LSPosed)
- [Android KeyEvent 參考](https://developer.android.com/reference/android/view/KeyEvent)
