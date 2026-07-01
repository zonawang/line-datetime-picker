# 📅 LINE Birthdate Picker & Life Path Number Bot 🔮

本專案專注於在 LINE Bot 中實現 **LINE 原生生日日期選擇器 (Birthdate Picker)** 與 **生命靈數 (Life Path Number) 動態運算與解讀** 功能。

---

## 🌟 核心功能說明

### 1. 📅 生日選擇器快速回覆 (Quick Reply Datetime Picker)
* **原生日期選擇器**：當用戶在「精靈選單」點擊「認識水晶」時，底部會自動彈出「輸入生日」的快速回覆按鈕。點擊後，會調用 LINE 原生的日期選擇器（預設日期為 `2000-01-01`）。
* **跨平台相容性優化**：移除了極端的最小/最大日期邊界限制，解決了在舊版 LINE App 或 LINE 電腦版（Desktop）上可能發生的訊息渲染崩潰問題，保證 100% 的顯示相容性。

### 2. 🔢 生命靈數自動加總演算法 (Life Path Number Calculation)
* **遞迴相加演算法**：系統在接收到生日資料後，會自動將西元出生年、月、日的所有數字拆解並進行加總。若總和超過個位數，則將所得之十位數與個位數再次相加，直至算出 $1 \sim 9$ 的單一數字。
* **📝 運算實際舉例**：
  * 若生日為：西元 `1995` 年 `11` 月 `23` 日
  * 第一輪拆解加總：$1 + 9 + 9 + 5 + 1 + 1 + 2 + 3 = 31$
  * 第二輪拆解加總：$3 + 1 = 4$
  * 得出結果：該生日的生命靈數即為 **4**。

### 3. 🎯 「了解我的生命靈數」動態快速回覆
* **動態按鈕觸發**：當用戶選擇並輸入生日後，系統在隨後的回覆訊息中，會主動在底部附帶一個「了解我的生命靈數」快速回覆按鈕。
* **一鍵快速諮詢**：用戶點擊該按鈕後，會直接向水晶占星專家發送諮詢請求，引導 Gemini 進行深度、客製化的生命靈數與水晶能量關聯分析。

---

## 🛠️ 環境配置與部署

### 1. 本地環境變數設定 (`.env`)
請在專案根目錄下建立 `.env` 檔案，並填入以下必要設定：

```env
PORT=8080

# LINE 官方通道憑證
LINE_CHANNEL_SECRET=your_channel_secret_here
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here

# Google Cloud 與 Gemini AI 設定
GCP_PROJECT=your_gcp_project_id_here
GCP_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash

# GitHub 存取憑證 (用於代碼同步)
GITHUB_TOKEN=ghp_your_personal_access_token_here
```

### 2. 本地執行
```bash
# 安裝相依套件
npm install

# 啟動本機伺服器
npm start
```

### 3. 部署至 Google Cloud Run
利用以下指令，可以快速將此 Bot 服務一鍵部署至雲端：
```bash
gcloud run deploy line-echo-bot --source . --region asia-east1
```

部署完成後，請將產生的 Cloud Run URL（如 `https://...run.app/webhook`）設定於 LINE Developer Console 的 Webhook URL 中。
