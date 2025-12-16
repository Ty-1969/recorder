# 部署指南 - 健康紀錄系統

## 📋 部署前準備

### 1. 建立 Supabase 專案

1. 前往 [Supabase](https://supabase.com/) 註冊/登入
2. 點擊 "New Project"
3. 填寫專案資訊：
   - Project Name: health-recorder
   - Database Password: 設定強密碼（請妥善保存）
   - Region: 選擇離您最近的區域
4. 等待專案建立完成（約 2-3 分鐘）

### 2. 初始化資料庫

1. 在 Supabase 專案中，點擊左側選單的 "SQL Editor"
2. 點擊 "New Query"
3. 複製 `database/init.sql` 的**完整內容**並貼上
4. 點擊 "Run" 執行腳本
5. 確認執行成功（應該會看到「資料庫初始化完成！」訊息）

### 3. 設定 Supabase Auth

1. 在 Supabase 專案中，點擊左側選單的 "Authentication" > "Settings"
2. 確認以下設定：
   - **Enable Email Signup**: 開啟
   - **Enable Email Confirmations**: 可選（建議關閉以便快速測試）
   - **Site URL**: 暫時設為 `http://localhost:8888`（本地開發用）

### 4. 取得 API 金鑰

1. 在 Supabase 專案中，點擊左側選單的 "Settings" > "API"
2. 記錄以下資訊：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: 長字串（這是公開金鑰）

## 🚀 部署到 Netlify

### 方法 1：使用 Git 整合（推薦）

#### 步驟 1：推送到 Git 儲存庫

```bash
cd app-netlify/recorder
git init
git add .
git commit -m "Initial commit: Health Recorder"
git remote add origin <your-repo-url>
git push -u origin main
```

#### 步驟 2：在 Netlify 中建立新專案

1. 前往 [Netlify](https://app.netlify.com/) 並登入
2. 點擊 "Add new site" > "Import an existing project"
3. 選擇您的 Git 提供者（GitHub/GitLab/Bitbucket）
4. 選擇您的儲存庫
5. 設定建置選項：
   - **Build command**: `npm install`（或留空）
   - **Publish directory**: `public`
6. 點擊 "Show advanced" 展開進階設定
7. 點擊 "New variable" 新增環境變數：
   - `SUPABASE_URL`: 您的 Supabase Project URL
   - `SUPABASE_KEY`: 您的 Supabase anon public key
8. 點擊 "Deploy site"

#### 步驟 3：更新 Supabase Site URL

部署完成後，取得 Netlify 提供的網址（例如：`https://your-site.netlify.app`）

1. 回到 Supabase，進入 "Authentication" > "Settings"
2. 將 **Site URL** 更新為您的 Netlify 網址
3. 在 "Redirect URLs" 中新增：`https://your-site.netlify.app`

### 方法 2：使用 Netlify CLI

#### 步驟 1：安裝 Netlify CLI

```bash
npm install -g netlify-cli
```

#### 步驟 2：登入 Netlify

```bash
netlify login
```

#### 步驟 3：初始化專案

```bash
cd app-netlify/recorder
netlify init
```

依照提示：
- 選擇 "Create & configure a new site"
- 輸入網站名稱（或使用自動產生的名稱）
- 設定建置命令：`npm install`（或留空）
- 設定發布目錄：`public`

#### 步驟 4：設定環境變數

```bash
netlify env:set SUPABASE_URL "https://your-project.supabase.co"
netlify env:set SUPABASE_KEY "your-anon-key"
```

#### 步驟 5：部署

```bash
# 測試部署
netlify deploy

# 正式部署
netlify deploy --prod
```

## 🔧 本地開發

### 1. 安裝依賴

```bash
cd app-netlify/recorder
npm install
```

### 2. 設定環境變數

建立 `.env` 檔案（不要提交到 Git）：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### 3. 啟動開發伺服器

```bash
npm run dev
```

訪問：`http://localhost:8888`

## ✅ 驗證部署

部署完成後，請確認：

1. ✅ 網站可以正常開啟
2. ✅ 可以註冊新帳號
3. ✅ 可以登入
4. ✅ 可以新增健康紀錄
5. ✅ 可以查看週視圖（桌面）或日視圖（手機）
6. ✅ 可以編輯和刪除紀錄
7. ✅ 統計圖表可以正常顯示
8. ✅ 可以匯出資料（CSV）

## 🐛 常見問題

### 問題 1：環境變數未設定

**錯誤訊息**：`資料庫連線未設定` 或 `Supabase 環境變數未設定`

**解決方法**：
- 確認在 Netlify 專案設定中已正確設定環境變數
- 確認變數名稱正確：`SUPABASE_URL` 和 `SUPABASE_KEY`
- 重新部署專案

### 問題 2：資料表不存在

**錯誤訊息**：`relation "users" does not exist` 或類似錯誤

**解決方法**：
- 確認已在 Supabase SQL Editor 中執行 `database/init.sql`
- 檢查 Supabase 專案是否正確
- 確認 RLS 政策已正確建立

### 問題 3：認證失敗

**錯誤訊息**：`未授權` 或 `無效的 token`

**解決方法**：
- 確認 Supabase Auth 已啟用
- 檢查 Supabase Site URL 是否正確設定
- 確認 Redirect URLs 包含您的網站網址
- 清除瀏覽器的 localStorage 並重新登入

### 問題 4：CORS 錯誤

**錯誤訊息**：`CORS policy` 相關錯誤

**解決方法**：
- 確認 Supabase 專案設定中的 CORS 設定
- 檢查 Netlify Functions 的回應標頭（已在程式碼中設定）
- 確認 Supabase Site URL 和 Redirect URLs 正確

### 問題 5：函數無法執行

**錯誤訊息**：`Function not found` 或 404

**解決方法**：
- 確認 `netlify.toml` 中的 functions 路徑正確：`netlify/functions`
- 確認檔案結構正確：`netlify/functions/*.js`
- 重新部署專案

### 問題 6：統計圖表無法顯示

**解決方法**：
- 確認已新增對應類別的紀錄（血壓、心跳等）
- 檢查瀏覽器控制台是否有錯誤
- 確認 Chart.js 已正確載入

### 問題 7：匯出功能無法使用

**解決方法**：
- CSV 匯出應該可以正常使用
- PDF 匯出目前返回 JSON 格式（需要額外的 PDF 生成庫）
- 檢查瀏覽器是否允許下載檔案

## 📚 相關資源

- [Netlify 文件](https://docs.netlify.com/)
- [Supabase 文件](https://supabase.com/docs)
- [Supabase Auth 文件](https://supabase.com/docs/guides/auth)
- [Netlify Functions 文件](https://docs.netlify.com/functions/overview/)
- [Chart.js 文件](https://www.chartjs.org/docs/)

## 🔐 安全性建議

1. **永遠不要**在前端程式碼中直接暴露 Supabase 的 service_role key
2. 使用 **anon/public key** 在 Netlify Functions 中
3. Supabase 的 Row Level Security (RLS) 已啟用，確保資料隔離
4. 使用環境變數儲存敏感資訊
5. 定期更新依賴套件
6. 啟用 Supabase 的 Email Confirmations（生產環境）

## 📝 後續優化建議

1. **PDF 匯出**：整合 PDF 生成庫（如 jsPDF、PDFKit）
2. **資料備份**：定期自動備份功能
3. **提醒功能**：用藥提醒、測量提醒
4. **資料分析**：更詳細的統計分析
5. **多語言支援**：i18n 國際化
6. **離線支援**：Service Worker 和 IndexedDB

