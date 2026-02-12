# Rust Keymapper

以 Rust 實作的 Android/Linux 輸入鍵重映射守護程式，提供強型別 YAML 設定與內建 WebUI。

## 專案現況（對齊目前程式碼）

- 設定檔格式僅支援 `YAML`（`.yaml` / `.yml`）
- 觸發行為：單鍵與雙鍵組合
- WebUI 透過 HTTP API 與後端同步，設定會直接回寫 YAML
- 資料結構採 `serde(deny_unknown_fields)`，降低寬鬆解析造成的不確定性

## 已實作功能

### 1. 事件觸發類型（`RuleType`）

- `CLICK`
- `DOUBLE_CLICK`
- `SHORT_PRESS`
- `LONG_PRESS`
- `COMBO_CLICK`（兩鍵）
- `COMBO_SHORT_PRESS`（兩鍵）
- `COMBO_LONG_PRESS`（兩鍵）

### 2. 動作類型（`Action`）

- `send_key`：送出虛擬按鍵
- `shell`：執行 Shell 指令
- `builtin_command`：常用系統命令（強型別）
  - `mute_toggle`
  - `open_voice_assistant`
  - `open_camera`
  - `toggle_flashlight`
  - `toggle_do_not_disturb`
- `launch_app`：啟動 App（package / activity）
- `launch_intent`：啟動 Intent（可作為快捷操作入口）
- `macro`：依序執行多個動作
- `multi_tap`：連續送出多個按鍵
- `volume_control` / `brightness_control` / `toggle_screen` / `toggle_rule` / `intercept`

### 3. WebUI 與 API

- `GET /api/config`：讀取當前設定
- `POST /api/config`：寫回設定到 YAML
- `GET /api/apps`：回傳已安裝 app 清單（`name` + `package`）

WebUI 支援：
- 規則新增 / 編輯 / 刪除
- 全域閾值調整（短按、長按、雙擊、組合時窗）
- 常見系統命令快速選單
- App 清單查詢、前端關鍵字過濾（名稱/包名）與回填 package

## 執行流程（核心邏輯）

1. 啟動時讀取 YAML 設定，先做嚴格校驗
2. 依 `device_name` 自動尋找 `/dev/input/event*`（或使用 `--device` 指定）
3. 啟動 WebUI（預設 `8888`）
4. 事件處理迴圈：
   - 讀取 evdev 事件
   - 交給狀態機判斷點擊/長按/雙擊/兩鍵組合
   - 匹配規則後執行對應 `Action`
5. 每 5 秒從共享設定更新狀態機規則與閾值（WebUI 修改可生效）

## 設定檔重點

預設路徑：
`/data/adb/modules/rust_keymapper/config/config.yaml`

設定檔關鍵欄位：

- `device_name`：輸入裝置名稱（如 `gpio-keys`）
- `hardware_map`：實體 keycode 對應名稱
- `settings`：全域閾值與執行選項
- `rules`：規則清單

範例（節錄）：

```yaml
device_name: "gpio-keys"

hardware_map:
  115: VOL_UP
  114: VOL_DOWN
  116: POWER

settings:
  long_press_threshold_ms: 800
  short_press_threshold_ms: 300
  double_tap_interval_ms: 300
  combination_timeout_ms: 200
  enable_haptic: true
  enable_wakelock: true
  log_level: "info"
  rule_timeout_ms: 5000

rules:
  - id: "rule_vol_up_short"
    trigger: "115"
    rule_type: SHORT_PRESS
    action:
      type: builtin_command
      command: open_voice_assistant
    enabled: true
    description: "Volume Up short press opens voice assistant"
```

## 建置與啟動

### 建置

```bash
cargo build --release --target aarch64-linux-android
```

### 啟動（主程式）

```bash
./keymapper_d \
  --config /data/adb/modules/rust_keymapper/config/config.yaml \
  --webui-port 8888 \
  --log-level info
```

可選參數：

- `--device <path>`：直接指定輸入裝置路徑（略過自動尋找）

## KernelSU / WebUIX 入口識別

目前模組已補齊 WebUI 入口所需結構：

- `module/module.prop`：新增 `actionIcon` 與 `webuiIcon`
- `module/action.sh`：提供動作入口，會開啟 `http://127.0.0.1:8888`
- `webroot/index.html`：保留在模組根目錄 `webroot/` 供管理器識別 WebUI
- CI 打包會包含 `action.sh`，並在封裝時設定 `action.sh/service.sh/uninstall.sh` 為可執行

可保證項目：
- 模組封裝格式已符合 KernelSU/WebUIX 常見識別條件，可正常出現 WebUI/動作入口

限制說明：
- 實際是否顯示入口與圖示，仍取決於使用的 KernelSU/WebUIX 版本與其 UI 實作

## 目前實作範圍

- 觸發：單鍵 + 雙鍵組合
- 動作：`send_key`、`shell`、`builtin_command`、`launch_app`、`launch_intent`、`macro`、`multi_tap`、`volume_control`、`brightness_control`、`toggle_screen`、`toggle_rule`、`intercept`
- WebUI：規則管理、全域閾值設定、App 清單載入與前端本地過濾

## 目錄概覽

- `src/main.rs`：啟動入口與參數
- `src/config/*`：設定模型、解析、驗證
- `src/event/*`：事件處理、狀態機、動作執行
- `src/hardware/*`：輸入裝置與 uinput
- `src/webui/*`：HTTP API 與靜態頁面託管
- `webroot/*`：WebUI 前端
- `webroot/icon.png`：模組入口圖示（`module.prop` 參照）
- `module/action.sh`：管理器動作入口腳本（開啟本機 WebUI URL）
- `config/config.default.yaml`：預設設定範例
