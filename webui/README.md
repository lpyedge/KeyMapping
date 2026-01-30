# PowerKeyRules WebUI

此目錄包含 WebUI 的原始開發版本，主要用於：

1. **APK 內嵌資源**：`app/src/main/assets/webui/` 中的檔案與此目錄保持同步
2. **開發檢視**：可在此目錄用瀏覽器直接打開 `index.html` 預覽修改效果

## 當前架構

- **配置入口**：APK 內的 `WebUiActivity`（WebView 加載 `assets/webui/index.html`）
- **儲存方式**：SharedPreferences (`powerkey_rules`)
- **讀取方式**：system_server 透過 AIDL `RuleService` 獲取

## 註意事項

- 此目錄的檔案僅用於 APK 內嵌 WebView（同步到 `app/src/main/assets/webui/`）
- 修改後需同步更新到 `app/src/main/assets/webui/`
- Android WebView bridge 不支援 `exec()` 命令，僅支援 `loadRulesJson/saveRulesJson`
