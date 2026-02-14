# PowerKeyRules WebUI

WebUI 由 Rust 後端靜態託管，前端原始碼位於 `webui/`（Svelte + Tailwind + 本地 SVG）。

## API

- `GET /api/config`：讀取目前設定
- `POST /api/config`：儲存設定（寫回 YAML）
- `GET /api/apps`：回傳已安裝 App 清單（`name` + `package`）
- `POST /api/system/learn-start`：啟動 3 秒按鍵學習模式
- `GET /api/system/learn-result`：取得學習狀態與 `remainingMs`

## 前端工程

- 原始碼目錄：`webui/`
- 技術棧：`Svelte + Tailwind + Vite`
- 圖示來源：`webui/src/lib/icons/*.svg`
- 建置輸出：`webroot/`（由 `vite.config.js` 固定 `outDir: ../webroot`）

## 本地開發

```bash
cd webui
npm install
npm run dev
```

## 產出到 webroot

```bash
cd webui
npm run build
```

建置後會覆蓋更新 `webroot/index.html` 與對應靜態資源。

## 行為保護

- 對於目前 UI 不支援直接編輯的複雜 action（如 macro 等），前端會顯示「只讀保護」並禁止提交修改，避免誤覆蓋既有 YAML。
