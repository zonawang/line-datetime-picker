# ⚡ LINE Loading Animation & Serverless Deduplication Bot ⚡

本專案展示了如何在 LINE Bot 中整合 **LINE Loading Animation (載入中動畫)**，並專為 Serverless 部署環境（如 Google Cloud Run）設計了一套**「高併發、防 CPU 凍結、防重複觸發」的雙重快取去重機制**。

---

## 🌟 核心功能說明

### 1. ⏳ LINE Loading Animation (載入中動畫)
* **極致順暢的等待體驗**：在後端進行 Gemini 能量分析、圖像辨識或大型語言模型（LLM）推論等繁重任務時，呼叫 LINE 官方的 `showLoadingAnimation` API。
* **動態自動消失**：自動在用戶的手機聊天視窗中顯示「讀取中/正在輸入」的載入動畫（預設顯示時間 15 秒）。一旦後端回應發送，載入動畫會立即且自動消失，大幅緩解用戶等待的焦慮感，營造極具高級感的互動體驗。

### 2. ⚡ 雲端連線保持 (Serverless Connection Holding)
* **解決 CPU 凍結難題**：在 Google Cloud Run 等 Serverless 平台上，若在收到 Webhook 後立即回傳 `200 OK`，平台會為了節省資源而**立即凍結 (Throttle) 容器的 CPU**。這會導致背景正在運作的非同步 LLM 任務被暫停，並造成 `replyToken` 過期失效。
* **連線保持技術**：本專案使用 `await Promise.all(...)` 保持與 LINE Webhook 的 HTTP 請求連線開啟，直到事件主邏輯完全執行完畢並成功發送回覆，確保容器 CPU 資源在推論期間始終處於高活絡分配狀態。

### 3. 🔒 雙重快取防重複去重機制 (Double-Set Deduplication)
* **阻斷 5 秒超時重試**：由於連線保持機制會讓 Webhook 回應時間拉長，一旦超過 5 秒，LINE 平台便會判定逾時並發動多達 3 次的「自動重試（Retry）」。
* **防重複機制**：
  * **處理中快取 (`activeEvents`)**：當相同的 `webhookEventId` 正在執行中，後續進來的重試請求會被秒速阻斷並直接回傳 `200 OK` 丟棄，防堵重複載入動畫與重複呼叫 LLM。
  * **已完成快取 (`completedEvents`)**：任務完成後，其 ID 會記錄至已完成集合。後續任何遲到的重試請求皆會被直接忽視，保證「僅執行一次 (Exactly-Once)」的安全防護。
  * **記憶體自動釋放**：設有 10 分鐘定時排程，自動清除快取 Set，避免高併發下的記憶體溢出。

### 4. 📅 生日選擇器與生命靈數 (Birthdate Picker & Life Path Number)
* **原生日期選擇器快速回覆 (Quick Reply Datetime Picker)**：當用戶點選「認識水晶」指南選單時，底部會彈出「輸入生日」原生日期選擇器（預設為 2000-01-01）。
* **Postback 虛擬訊息轉換**：捕捉 LINE 平台的 `postback` 事件，將用戶選擇的日期在後端自動轉換為虛擬文字訊息並餵給 Gemini 專家，確保用戶無需手動輸入。
* **生命靈數自動加總運算**：自動偵測對話中出現的生日資訊（支援多種格式），利用遞迴演算法將出生年、月、日所有數字拆解並不斷相加，直到得出 $1 \sim 9$ 的單一數字作為個人的生命靈數。
* **動態快速回覆按鈕**：偵測到生日訊息後，系統會主動於後續回覆的最前端插入一個客製化的快速回覆按鈕「了解我的生命靈數」，點擊後即可快速向水晶占星專家諮詢靈數奧秘。
* **高相容性適配**：簡化 `datetimepicker` 的日期限制（移除了極端 `min` / `max` 範圍限制），完美解決部分行動端/桌面端 LINE App 渲染崩潰而導致訊息遺失的問題。

---

## 🛠️ 環境配置與部署

### 1. 本地環境變數設定 (`.env`)
在專案目錄下建立 `.env` 檔案，並填入以下設定：

```env
PORT=8080

# LINE Channel 設定
LINE_CHANNEL_SECRET=your_channel_secret_here
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here

# Gemini / Vertex AI 設定 (自動適配)
GCP_PROJECT=your_gcp_project_id_here
GCP_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash
```

### 2. 執行與部署

* **本地端啟動**：
  ```bash
  npm install
  npm start
  ```

* **一鍵部署至 Google Cloud Run**：
  ```bash
  gcloud run deploy line-echo-bot --source . --region asia-east1
  ```
