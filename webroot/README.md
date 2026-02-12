# PowerKeyRules WebUI

WebUI 由 Rust 後端靜態託管，透過 HTTP API 與守護程式同步設定。

## API

- `GET /api/config`：讀取目前設定
- `POST /api/config`：儲存設定（寫回 YAML）
- `GET /api/apps`：回傳已安裝 App 清單（`name` + `package`）

## 前端行為

- App 搜尋在前端本地過濾
- 同時支援以 App 名稱與包名關鍵字過濾
