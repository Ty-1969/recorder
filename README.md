# 🏥 健康紀錄系統 (Health Recorder)

一個功能完整的健康紀錄系統，支援多使用者、統計圖表、資料匯出等功能。

## ✨ 功能特色

- ✅ **多使用者支援** - 每個使用者獨立的健康紀錄
- ✅ **多類型紀錄** - 飲食、血壓、心跳、含氧量、藥物、大小便等
- ✅ **自訂項目** - 使用者可自行新增類別和欄位
- ✅ **時間編輯** - 可修改紀錄的日期和時間
- ✅ **智能篩選** - 依類別、日期範圍篩選
- ✅ **統計圖表** - 視覺化呈現健康數據趨勢
- ✅ **資料匯出** - 支援 PDF 和 Excel 格式匯出
- ✅ **響應式設計** - 桌面週視圖、手機日視圖
- ✅ **暗色主題** - 護眼的暗色介面設計
- ✅ **簡化操作** - 最少步驟完成紀錄

## 🚀 快速開始

### 1. 安裝依賴

```bash
cd app-netlify/recorder
npm install
```

### 2. 設定 Supabase

1. 前往 [Supabase](https://supabase.com/) 建立專案
2. 在 SQL Editor 執行 `database/init.sql`
3. 取得 Project URL 和 API Key

### 3. 設定環境變數

在 Netlify 專案設定中新增：
- `SUPABASE_URL`: Supabase Project URL
- `SUPABASE_KEY`: Supabase API Key (anon/public)

本地開發：建立 `.env` 檔案：
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### 4. 本地開發

```bash
npm run dev
```

訪問：`http://localhost:8888`

### 5. 部署到 Netlify

推送到 Git 並在 Netlify 中連接，或使用：
```bash
netlify deploy --prod
```

## 📁 專案結構

```
recorder/
├── public/                  # 前端靜態檔案
│   ├── index.html          # 主頁面
│   ├── css/
│   │   └── style.css       # 暗色主題樣式
│   └── js/
│       ├── app.js          # 主要邏輯
│       ├── charts.js       # 圖表功能
│       └── export.js       # 匯出功能
├── netlify/
│   └── functions/          # Netlify Functions
│       ├── records.js      # 紀錄 CRUD API
│       ├── users.js        # 使用者管理 API
│       ├── stats.js        # 統計資料 API
│       └── export.js       # 匯出功能 API
├── database/
│   └── init.sql            # 資料庫初始化
├── package.json
├── netlify.toml
└── README.md
```

## 🎨 UI/UX 設計

### 桌面版（週視圖）
- 一週七天的卡片式呈現
- 可快速切換週次
- 類別篩選和搜尋功能

### 手機版（日視圖）
- 單日詳細呈現
- 滑動切換日期
- 快速新增按鈕

### 暗色主題
- 深色背景（#1a1a1a, #2d2d2d）
- 高對比文字
- 護眼的配色方案

## 📊 預設類別

| 類別 | 預設欄位 |
|------|---------|
| 飲食 | 名稱、數量、重量(g) |
| 血壓 | 收縮壓、舒張壓、心跳 |
| 心跳 | 心跳數(bpm) |
| 含氧量 | 含氧量(%) |
| 藥物 | 藥物名稱、劑量、單位 |
| 大小便 | 類型(大/小)、次數 |
| 自訂 | 使用者自行定義 |

## 🔐 多使用者支援

- 使用 Supabase Auth 進行身份驗證
- Row Level Security (RLS) 確保資料隔離
- 每個使用者只能存取自己的紀錄

## 📈 統計圖表

- 血壓趨勢圖（折線圖）
- 心跳趨勢圖（折線圖）
- 飲食統計（圓餅圖）
- 藥物使用統計（長條圖）

## 📤 資料匯出

- **PDF 匯出**：包含所有紀錄和統計圖表
- **Excel 匯出**：結構化資料，方便分析

## 🛠️ 技術棧

- **前端**：HTML5 + CSS3 + JavaScript (Vanilla)
- **圖表**：Chart.js
- **後端**：Netlify Functions
- **資料庫**：Supabase (PostgreSQL)
- **部署**：Netlify

## 📝 使用說明

1. **登入/註冊**：首次使用需註冊帳號
2. **新增紀錄**：點擊「+」按鈕，選擇類別，填寫資料
3. **查看紀錄**：桌面版顯示週視圖，手機版顯示日視圖
4. **編輯紀錄**：點擊卡片上的編輯按鈕
5. **查看統計**：點擊「統計」標籤查看圖表
6. **匯出資料**：點擊「匯出」選擇格式

## 🐛 疑難排解

詳見 `DEPLOY.md` 中的常見問題章節。

## 📚 相關資源

- [Netlify 文件](https://docs.netlify.com/)
- [Supabase 文件](https://supabase.com/docs)
- [Chart.js 文件](https://www.chartjs.org/docs/)

