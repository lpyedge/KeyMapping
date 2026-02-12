這是一份詳盡的 Phase 2 開發計劃，旨在將項目從單純的按鍵映射工具升級為強大的系統自動化引擎。

***

# Phase 2 開發計劃：系統自動化與條件觸發 (Project Expansion Plan)

**目標**: 通過引入「伴侶應用 (Companion App)」模式，突破 Rust Daemon 在 Android Framework 層面的感知局限，實現類似 iOS 捷徑 (Shortcuts) 的條件觸發與自動化能力。

**架構核心**:

* **大腦與四肢 (Rust Daemon)**: 保持 Root 權限，負責決策與執行。
* **眼睛與耳朵 (Sensor App)**: 作為系統應用注入，負責感知環境與監聽事件。

***

## 📅 里程碑 1: 伴侶應用 (Sensor App) 原型開發

**預計耗時**: 2-3 週

在這個階段，我們將構建一個輕量級的 Android App，它的核心職責不是展示 UI，而是作為「探針」存在。

### 1.1 基礎架構搭建

* **技術棧**: Kotlin + Jetpack (無 UI 或極簡 UI)。
* **通信模塊**: 實現一個高效的 HTTP Client (OkHttp)，用於向 `127.0.0.1:8888` (Rust Daemon) 發送心跳和觸發指令。
* **數據協議**: 定義 JSON 交互格式。

```json
POST /api/trigger
{
  "source": "GEOFENCE",
  "event": "ENTER",
  "payload": { "location_id": "HOME" }
}
```


### 1.2 Magisk 注入機制

* **目錄結構調整**: 在 Rust 項目中建立 `system/priv-app/KeymapperSensor/` 目錄。
* **編譯流集成**: 編寫腳本，將編譯好的 APK 自動複製到 Magisk 模塊目錄。
* **權限聲明**: 在 `AndroidManifest.xml` 中聲明 `ACCESS_BACKGROUND_LOCATION`, `BIND_NOTIFICATION_LISTENER_SERVICE` 等敏感權限。


### 1.3 保活與權限自動化

* **Service 腳本升級**: 修改 `service.sh`，在開機時：

1. 檢查 Sensor App 是否安裝。
2. 使用 `pm grant` 命令自動授予所有運行時權限 (Runtime Permissions)。
3. 使用 `am start-foreground-service` 強行拉起 App 的後台服務。

***

## 📅 里程碑 2: 核心觸發器 (Triggers) 實現

**預計耗時**: 3-4 週

這一階段將賦予系統感知能力。

### 2.1 地理圍欄 (Geofencing)

* **實現**: 集成 Google Play Services 的 `LocationClient`。
* **邏輯**:
    * 用戶在配置中定義坐標 (如 "公司", "家")。
    * Sensor App 註冊圍欄。
    * 觸發 `GEOFENCE_TRANSITION_ENTER` / `EXIT` 事件時，通知 Daemon。
* **應用場景**: 回家自動切換手機為響鈴模式；到公司自動靜音並開啟 Wi-Fi。


### 2.2 通知監聽 (Notification Listener)

* **實現**: 繼承 `NotificationListenerService`。
* **邏輯**:
    * 監聽 `onNotificationPosted`。
    * 解析 `packageName` (應用), `title`, `text`。
    * 支持正則表達式匹配 (如 "微信" + "包含 '快遞'").
* **隱私**: 確保所有過濾邏輯在本地完成，僅將匹配結果 (Trigger ID) 發送給 Daemon，不發送內容。


### 2.3 狀態監聽 (State Monitoring)

* **網絡狀態**: Wi-Fi 連接/斷開 (獲取 SSID)、藍牙設備連接 (獲取 MAC 地址)。
* **電源狀態**: 充電中/電池電量低。
* **時間觸發**: 利用 `AlarmManager` 實現精確定時任務，喚醒 Daemon 執行操作。

***

## 📅 里程碑 3: 規則引擎升級 (Rule Engine 2.0)

**預計耗時**: 2 週

Rust 端需要升級，以支持「條件」判斷。

### 3.1 條件 (Conditions) 支持

* 擴展 YAML 配置結構，增加 `conditions` 字段。

```yaml
- id: "auto_mute_at_work"
  trigger: "GEOFENCE_ENTER_WORK"  # 來自 Sensor App 的觸發
  action: "MUTE_SYSTEM"
  conditions:                     # 額外條件
    - type: "TIME_RANGE"
      start: "09:00"
      end: "18:00"
```


### 3.2 變量與上下文 (Context)

* 在 Rust 內存中維護一個 `Context` 對象，存儲當前狀態 (如 `is_charging`, `current_ssid`, `last_notification_app`)。
* 允許規則基於 Context 進行動態判斷。

***

## 📅 里程碑 4: 集成測試與優化

**預計耗時**: 2 週

### 4.1 功耗優化

* **策略**: 確保 Sensor App 在非必要時不佔用 CPU。
* **測試**: 對比安裝模塊前後的待機耗電量，優化 GPS 輪詢頻率。


### 4.2 穩定性測試

* **殺後台測試**: 手動強制停止 Sensor App，驗證 `service.sh` 或 Daemon 是否有看門狗機制將其拉起。
* **OTA 模擬**: 模擬系統升級場景，確保 Magisk 模塊掛載和權限依然有效。

***

## 🚀 最終交付成果

1. **增強版 Magisk 模塊**: 內含 Rust Binary + Sensor APK。
2. **自動化能力**: 支持 基於位置、時間、通知、網絡狀態 的觸發器。
3. **無感體驗**: 用戶無需手動打開 App，一切在後台靜默運行。

此計劃將使項目從「好用的按鍵工具」進化為「Android 系統級自動化中樞」。

