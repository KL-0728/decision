# decision

繁體中文、手機優先的個人決策工具。以可愛的岔路插畫陪你列利弊、逐項評分，再揭曉方向。主要使用平台為 iPhone，也支援桌面與 Android 基本操作。

## 啟動

使用 Node.js 22.12 以上或 Node.js 24。首次啟動：

```powershell
npm.cmd ci
npm.cmd run dev
```

在瀏覽器開啟終端機顯示的網址（預設 http://localhost:5173）。Windows PowerShell 請使用 `npm.cmd`，不需要更改系統執行原則；macOS / Linux 使用 `npm`。

正式版與離線測試：

```powershell
npm.cmd run build
npm.cmd run preview
```

開啟 http://localhost:4173，等右上角顯示「可離線使用」。開發模式不啟用 Service Worker；離線測試請使用正式建置。

## 功能

- 先寫一個問題，標題與行動自動帶入；比較基準預設「維持現況」，進階設定選填。
- 「幫我想利弊」提供離線內建考量提示；參考句可先修改，未確認時不進入評分。未串接 AI，也沒有 API 用量費用。
- 要不要做／多選項比較，使用共同基準，未知理由不進入評分。
- 逐項打亂順序，隱藏總分與排名；可返回上一項與重開後繼續。
- 底線三種狀態、同分並列、暫定結果與主要影響因素。
- 首次結果快照與重評比較；修改評估內容先確認重置。
- IndexedDB 自動保存、交易寫入、失敗重試與跨分頁版本衝突檢查。
- JSON 整份備份與新增副本匯入，完整驗證後一次寫入。
- PWA 主畫面圖示、離線快取、手動確認版本更新。

資料只保存在目前網站來源的裝置／瀏覽器，不會上傳或同步。`localhost:5173`、`localhost:4173` 與正式網址各自有獨立資料；瀏覽器和已安裝 PWA 是否共享資料依平台而異。可匯出 JSON 搬移。

## iPhone 實測與 Vercel 部署

請依 [TESTING.md](TESTING.md) 操作；已執行的瀏覽器流程與修正記錄見 [QA.md](QA.md)。

1. 將本專案放入 `KL-0728/decision` GitHub 儲存庫。
2. 在 Vercel 選擇 Add New → Project，匯入該儲存庫。
3. Framework Preset 選 Vite，Root Directory 保持專案根目錄。
4. Build Command 使用 `npm run build`，Output Directory 使用 `dist`，Install Command 使用 `npm ci`；Node.js 選 24（或支援的 22.12 以上版本），不需要環境變數。
5. 部署完成後用 iPhone Safari 開啟 Vercel 提供的 HTTPS 網址，分享 → 加入主畫面。

`vercel.json` 已提供路由回退與 Service Worker 不快取的設定。正式上線前確認平台目前方案限制。未在程式碼中預設或宣稱任何尚未部署的網址。

## 開發與自動檢查

```powershell
npm.cmd test
npm.cmd run build
```

本機有 Chrome 時，瀏覽器測試：

```powershell
$env:DECISION_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
npm.cmd run test:e2e
```

若使用 Edge，改為 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`。CI 會安裝 Playwright Chromium；一般開發也可執行 `npx.cmd playwright install chromium` 後直接跑測試。

`src/domain.ts` 管理計分、狀態與備份驗證；`src/storage.ts` 管理原子保存與版本檢查；`src/App.tsx` 管理操作流程。圖示生成原圖保留在 `assets/`，網站使用的壓縮插畫與安裝尺寸在 `public/`。

重新產生安裝尺寸：`npm.cmd run icons`。格式化程式碼：`npx.cmd prettier --write src tests scripts *.ts *.json index.html`。

技術參考：[Vite 建置與部署](https://vite.dev/guide/static-deploy.html)、[Vite PWA 更新提示](https://vite-pwa-org.netlify.app/guide/prompt-for-update)、[PWA 安裝](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)。
