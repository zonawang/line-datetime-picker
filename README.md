# 🔮 LINE Crystal Astrology Expert Bot - 本次新增功能說明

本專案已完成最新階段的升級開發，完美解決了 LINE 頭像切換靈活性與 Google Cloud Run 執行緒凍結的問題。以下為本次新增之核心特色功能與雲端架構設計說明。

---

## 🌟 本次新增核心特色功能

### 1. 🪐 動態守護神頭像與暱稱切換 (Deity Icon Switch)
* **智慧偵測切換**：機器人會依據當下諮詢的主題（如事業、愛情、財運），自動在回覆最開頭帶入守護神標記（如 `[DEITY: ATHENA]`、`[DEITY: VENUS]`、`[DEITY: FORTUNE]`、`[DEITY: COSMOS]`）。
* **動態 Sender 變更**：系統在向 LINE 發送訊息前，會主動解析標記並移除，同時將 LINE 訊息的 `sender.name` 與 `sender.iconUrl` 動態變更為對應的守護神暱稱與專屬頭像（雅典娜、維納斯、莫伊萊、艾蓮）。
* **靜態資源本機託管**：頭像圖檔（`雅典娜.png`、`維納斯.png`、`莫伊萊.png`）直接託管於專案根目錄下，透過 Express 靜態路由 `/static` 動態產出對外網址，實現零外鏈依賴。

---

## 💡 關鍵雲端架構注意事項 (重要)

### 📌 為什麼 Webhook 必須使用「同步 `Promise.all`」？
在部署至 Google Cloud Run 時，必須特別注意其 CPU 分配機制：
* **Cloud Run CPU 限制機制 (CPU Throttling)**：
  Cloud Run 預設使用的是 **「僅在請求處理期間分配 CPU」**。如果 Webhook 路由採取 `res.send('OK')` 秒回 LINE，而把分析與回覆放在背景非同步執行，**Cloud Run 會在回覆發出的瞬間將容器的 CPU 限制降到接近 0**。
* **解決「沒有反應」問題**：
  這會造成背景的 Gemini 占星呼叫與 Firestore 讀寫完全卡死或運作極度緩慢。因此，本專案將 Webhook 改回穩定的同步 `Promise.all` 處理：
  ```javascript
  Promise.all(req.body.events.map((event) => handleEvent(event, req)))
    .then((result) => res.json(result))
  ```
  這能確保在 Gemini 處理（約 2~3 秒）期間，CPU 始終獲得 100% 完整分配，保證 LINE 訊息能以最快速度完成回覆。

---

## 🛠️ 本地開發與部署設定

### 1. 執行環境
* **Node.js**：推薦 Node 22 以上（本專案已在 `node:22-alpine` 容器下，透過 `--experimental-require-module` 解決 CJS 同步載入 ESM 的載入問題）。

### 2. 環境變數 (`.env`)
```env
PORT=8080
LINE_CHANNEL_SECRET=您的_Channel_Secret
LINE_CHANNEL_ACCESS_TOKEN=您的_Channel_Access_Token
GCP_PROJECT=您的_GCP_專案ID
GCP_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash
GITHUB_TOKEN=您的_GitHub_Token
```

### 3. 一鍵部署至 Cloud Run
```bash
gcloud run deploy line-echo-bot \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --update-env-vars="GCP_PROJECT=您的_GCP_專案ID,GCP_LOCATION=us-central1,VERTEX_AI_MODEL=gemini-2.5-flash"
```
