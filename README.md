# 🤖 LINE AI Bot (Gemini 2.5 Flash / 多模態影像分析助手)

這是一個強大的 LINE 智慧 AI 機器人，基於 **Node.js + Express** 與 **@line/bot-sdk (v9)** 實作，並搭載了企業級的 **Google Cloud Vertex AI (Gemini 2.5 Flash)** 引擎，可直接無縫託管於 **Google Cloud Run**。

本機器人不僅支援豐富流暢的智慧對話，更具備強大的**多模態照片辨識與深度分析解釋能力**，並全面針對**台灣繁體中文**的用語習慣進行優化。

---

## 🌟 核心特色功能

* 💬 **智慧文字對話**：呼叫最新的 `gemini-2.5-flash` 進行快速、流暢的智慧問答與生活對談。
* 📸 **多模態影像分析**：傳送任何照片給機器人，Bot 將自動透過 LINE Blob API 安全地下載，並交由 Gemini 進行畫面細節辨識、景物解讀及全繁體中文的詳細說明。
* 🇹🇼 **在地化繁體中文**：內建 System Instruction（系統指令），強制模型一律採用親切友善的**台灣繁體中文**與在地常用語，告別生硬簡轉繁與大陸語法。
* 🔒 **企業級無金鑰安全認證 (ADC)**：部署至 Cloud Run 時，不需在外流出或儲存 `GEMINI_API_KEY`，直接透過 GCP 服務帳戶的 IAM（應用程式預設憑證）進行安全呼叫。

---

## 🛠️ 本地開發與環境設定

在開始運行之前，請確保您已完成以下準備：

### 1. LINE Developers 設定
1. 登入 [LINE Developers Console](https://developers.line.biz/)。
2. 建立 **Provider**，並在下方建立一個 **Messaging API** 頻道。
3. 在 **Basic settings** 分頁中，找到 **Channel secret**。
4. 在 **Messaging API** 分頁最下方，點擊 **Channel access token (v2)** 的 **Issue** 產生權杖。

### 2. 環境變數設定 (`.env`)
複製 `.env.example` 並重新命名為 `.env`，填入您取得的金鑰與 GCP 設定：

```env
PORT=8080

# LINE Channel 金鑰
LINE_CHANNEL_SECRET=您的_Channel_Secret
LINE_CHANNEL_ACCESS_TOKEN=您的_Channel_Access_Token

# Google Cloud 設定 (本地測試時需填寫)
GCP_PROJECT=您的_GCP_專案ID
GCP_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash
```

> [!NOTE]  
> 建議將 `GCP_LOCATION` 設定為 `us-central1` 或 `asia-northeast1` (東京)，以確保 Gemini 2.5 Flash 多模態模型有最佳的區域支援與低延遲！

---

## 🚀 本地執行步驟

### 1. 安裝套件
在專案根目錄下執行：
```bash
npm install
```

### 2. 本地認證 (呼叫 Vertex AI)
在本地執行時，由於沒有 API Key，您必須確保本機電腦已設定好 Google Cloud 驗證：
```bash
# 登入您的 GCP 帳號並產生 Application Default Credentials (ADC)
gcloud auth application-default login
```

### 3. 啟動開發伺服器
```bash
npm run dev
```
伺服器將在 `http://localhost:8080` 啟動，並使用 Node.js 的 `--watch` 機制實現程式碼變更自動重載。

### 4. 設定 ngrok 與 LINE Webhook
1. 啟動 ngrok 將 8080 埠口映射至外網：
   ```bash
   ngrok http 8080
   ```
2. 將 ngrok 產生的 `https://xxxx.ngrok-free.app/webhook` 貼入 LINE Developers Console 的 **Webhook URL**。
3. 點擊 **Update** 並啟用 **Use Webhook**。

---

## ☁️ 部署到 Google Cloud Run (極薦 🚀)

本專案已完全優化 Cloud Run 的一鍵容器化部署，能以極低成本（呼叫時才計費）提供高彈性的 AI Bot 服務。

### 1. 授與 Vertex AI 權限 (IAM)
在部署前，您需要讓 Cloud Run 預設的服務帳戶擁有呼叫 Vertex AI 的權限。請在終端機執行：

```bash
gcloud projects add-iam-policy-binding 您的_GCP_專案ID \
  --member="serviceAccount:您的_GCP_專案編號-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### 2. 執行 Cloud Run 部署
使用以下指令即可在幾分鐘內完成雲端打包與部署：

```bash
gcloud run deploy line-echo-bot \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --update-env-vars="GCP_PROJECT=您的_GCP_專案ID,GCP_LOCATION=us-central1,VERTEX_AI_MODEL=gemini-2.5-flash"
```

> [!IMPORTANT]  
> 為了避免洩漏金鑰，部署指令中的 `--update-env-vars` **只需填寫 GCP 專案設定**。Cloud Run 服務會自動繼承您原先設定於伺服器上的 `LINE_CHANNEL_SECRET` 與 `LINE_CHANNEL_ACCESS_TOKEN`！

---

## 🧪 玩轉您的 AI Bot

1. 打開手機 LINE 掃描 **Messaging API** 分頁最上方的 QR code 加好友。
2. **文字對答**：輸入「*請用兩句話向我解釋量子力學*」，機器人會回傳流利且專業的繁體中文解釋。
3. **傳送照片**：直接傳送一張您的午餐、寵物或地標照片。Bot 會回答：「*📸 收到照片，正在幫您分析...*」，並隨後給您一份極具親切感的深度景物分析與解釋！
