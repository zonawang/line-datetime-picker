# ⏳ LINE Bot 體驗與效能雙重進化：Loading Animation 載入中動畫與 Serverless 防重複去重機制實戰

自從與我的 AI 神隊友 **Google Antigravity** 展開合作以來，我們的 LINE 智慧水晶占星助理已經成功升級了雙選單無縫切換，並順利部署到了 Google Cloud Run 上。

然而，當我們開始引入大型語言模型（LLM）例如 Gemini 進行繁重的多模態分析、星盤計算或圖片能量鑑定時，一個無法避免的物理瓶頸悄然浮現：**從用戶發送訊息，到 LLM 推理完成並組織好高質感的排版回覆，通常需要 5 到 15 秒的時間。**

這段「無聲的空白期」引發了兩個致命的體驗與系統痛點：
1. **使用者焦慮**：對話視窗一片死寂，用戶不知道 Bot 是正在思考，還是已經當機，因而頻繁重複發送訊息。
2. **Serverless 平台的 CPU 凍結與 LINE 超時重試衝突**：
   * **CPU 凍結詛咒**：在 Google Cloud Run 等 Serverless 平台上，若為了防止 LINE 超時而在 Webhook 接收後「立即回傳 200 OK」，平台會瞬間凍結容器的 CPU，導致後續非同步執行的 LLM 任務直接中斷暫停，造成 `replyToken` 失效報錯。
   * **LINE 5秒重試轟炸**：若選擇「保持連線（不回傳）」直到 LLM 處理完畢，只要時間超過 5 秒，LINE 平台就會認定超時，並自動發動多達 3 次的 Webhook 重試（Retry），導致伺服器重複觸發 LLM、重複發送訊息！

為了徹底擊碎這兩個兩難的技術關卡，我和 Antigravity 攜手開發了一套**「Loading Animation 載入動畫 + 伺服器雙重快取阻斷去重」**的黃金防護機制。以下是我們的實戰全紀錄！

---

## 🧩 第一關：擊碎等待焦慮！手把手解鎖官方 `showLoadingAnimation`

過去，許多開發者會用「請稍候，老師正在為您分析...」這樣的文字訊息來做過渡。但這會白白消耗掉一個 `replyToken`，且文字訊息依然顯得有些生硬。

LINE 官方其實提供了一個非常精緻的 API —— **`showLoadingAnimation`**（載入中/正在輸入動畫）。

### 💡 運作原理：
* **本地端原生動畫**：它會在用戶的手機聊天視窗頂端，顯示如同真人打字般的「讀取中/正在輸入...」動態氣泡，極具儀式感與高級感。
* **調用方式**：
  ```javascript
  // 顯示讀取中動畫 (僅適用於 1-on-1 個人對話，最長可設定 15 秒)
  await client.showLoadingAnimation({
    chatId: userId,
    loadingSeconds: 15 // 範圍為 3 到 15 秒
  });
  ```
* **智慧消失**：最棒的是，**當後端發送真正的 `replyMessage` 時，這個載入動畫會立刻且自動消失**，完全不需要開發者手動調用 API 去關閉它。

我們在 `index.js` 的 `handleEvent` 核心邏輯最前端加入了這段程式碼：
```javascript
if (event.source.type === 'user' && userId) {
  try {
    console.log(`⏳ Displaying loading animation for user: ${userId}`);
    await client.showLoadingAnimation({ chatId: userId, loadingSeconds: 15 });
  } catch (err) {
    console.error('⚠️ Failed to show loading animation:', err);
  }
}
```
現在，用戶發送訊息或照片的瞬間，動態氣泡立刻流暢地閃爍，焦慮感瞬間歸零！

---

## 🧩 第二關：破解 Serverless 宿命！連線保持（Connection Holding）維持 CPU 活絡

如果你把 LINE Bot 部署在 Google Cloud Run、AWS Lambda 等無伺服器（Serverless）架構上，你必須深刻理解其 **CPU 分配與計費機制**。

> ⚠️ **Serverless 運行詛咒**：
> 當你的 Webhook 路由執行了 `res.status(200).send('OK')`，伺服器會認為該次 HTTP 請求已經生命週期結束。為了節省資源，Cloud Run 會**立刻將該容器實例的 CPU 資源降到接近零或直接凍結（Throttling）**。
>
> 如果此時你的程式碼還在用 `await runner.runAsync(...)` 等待 Gemini 的非同步生成，這個非同步任務會被無情地「暫停」。直到下一個使用者的 Webhook 請求進來「喚醒」容器時，它才會繼續跑，但此時先前的 `replyToken` 早已過期，導致 `Invalid reply token` 報錯。

### 🛠️ 終極解決方案：連線保持 (Connection Holding)
我們不能提早回傳 `200 OK`！必須在 `/webhook` 路由中，使用 `Promise.all(...)` **強行按住 HTTP 連線不放**，直到 `handleEvent` 核心邏輯、LLM 推論與 `replyMessage` 完全執行完畢：

```javascript
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    // 保持連線開啟，直到 handleEvent 內的 replyMessage 完成，確保 CPU 不被凍結
    const results = await Promise.all(
      req.body.events.map(async (event) => {
        return await handleEvent(event, req);
      })
    );
    // 所有非同步推論與回覆發送成功後，才安全回傳 200
    res.json(results);
  } catch (err) {
    console.error('❌ Error handling webhook events:', err);
    res.status(500).end();
  }
});
```
這樣一來，Cloud Run 會在整個 LLM 運算期間判定 HTTP 請求處於活躍狀態，維持 100% 的 CPU 動能，保證回覆穩健發送！

---

## 🧩 第三關：救贖 5 秒超時！記憶體雙快取去重機制（Double-Set Deduplication）

解決了 CPU 凍結問題，隨之而來的卻是另一個「連線保持」的副作用：**LINE 平台的 5 秒超時重試機制。**

LINE 規定：**如果 Webhook 請求發出後 5 秒內沒有收到 `200 OK` 回應，LINE 就會認為你的伺服器超時或掛掉了，並會在接下來的幾秒內，自動重新發送最多 3 次一模一樣的重試請求。**

因為我們為了保持 CPU 活絡而故意按住連線不放，一旦 Gemini 的多模態圖像辨識或長文本生成超過 5 秒，LINE 的重試轟炸就會抵達。這會導致我們的伺服器同時為同一個事件執行多次 `handleEvent`，重複呼叫載入動畫 API、重複扣除 Gemini Token、甚至對用戶發送 3 次一模一樣的重複回覆！

### 🛠️ 解決方案：雙重記憶體快取阻斷（Double-Set Deduplication）

我們在記憶體中建立了兩個全域的 `Set`：
* `activeEvents`：記錄**正在背景執行中**的事件 `webhookEventId`。
* `completedEvents`：記錄**已經順利完成回覆**的事件 `webhookEventId`。

```javascript
const activeEvents = new Set();
const completedEvents = new Set();
```

當 Webhook 接收到事件時，我們對每個事件進行身分攔截：

```javascript
const eventId = event.webhookEventId;

if (eventId) {
  // 情況 A：如果這個事件之前已經完整處理並回覆過了，直接無視並回傳 OK 丟棄該重試
  if (completedEvents.has(eventId)) {
    console.log(`⚠️ [Deduplication] Event "${eventId}" was already completed. Ignoring.`);
    return 'OK';
  }

  // 情況 B：如果同一個事件正在處理中，表示這是 LINE 因 5 秒逾時發出的重試
  // 為了防止 LINE 繼續轟炸，我們必須「立刻回傳 200 OK」給重試請求，並直接丟棄它！
  if (activeEvents.has(eventId)) {
    console.log(`⚠️ [Deduplication] Event "${eventId}" is currently processing. Ignoring retry request.`);
    return 'OK'; // 回傳 OK，LINE 收到後就不會再繼續重試了
  }

  // 標記該事件進入「處理中」名單
  activeEvents.add(eventId);
}

try {
  // 執行主邏輯
  const result = await handleEvent(event, req);
  
  if (eventId) {
    completedEvents.add(eventId); // 成功回覆後，標記為已完成
  }
  return result;
} finally {
  if (eventId) {
    activeEvents.delete(eventId); // 不論成功或失敗，移出處理中名單
  }
}
```

### 🧹 記憶體防溢出自動清道夫：
為了不讓快取佔用本機記憶體，我們加上了定時排程，每 10 分鐘自動清空快取，確保系統在高併發下的長效安全：
```javascript
setInterval(() => {
  activeEvents.clear();
  completedEvents.clear();
  console.log('🧹 [Deduplication] Cleaned up processed & active events cache.');
}, 600000); // 10 分鐘
```

這套架構完美融合了**「對原請求連線保持（維持 CPU）」**與**「對重試請求立即回覆捨棄（去重阻斷）」**，達到了極致的高併發安全性！

---

## 🚀 成果：絲滑無比、堅不可摧的互動體驗

將這套黃金架構部署到 Google Cloud Run 後，系統表現完美無瑕：
* **打字指示器秒速回饋**：用戶不論是打字問問題，還是上傳幾 MB 的水晶原圖，聊天視窗頂端立刻出現流暢的正在打字氣泡，毫無遲滯。
* **零重複回覆**：即使 Gemini 的圖片辨識長達 12 秒，LINE 平台在第 5 秒 and 第 10 秒發動了兩次超時重試，後端也會瞬間將重試請求攔截並優雅丟棄，用戶端最終只會收到 1 次精準、完美的分析報告，打字動畫隨之優雅消失。
* **100% 執行成功率**：Cloud Run 的 CPU 資源全程保持全速分配，徹底告別非同步任務被中斷或 replyToken 失效的噩夢。

這一次與 Antigravity 的協作，不僅美化了使用者的視覺感官，更是對後端分散式併發與 Serverless 資源調度的硬核優化。

如果你也正在開發 LLM 驅動的 LINE Bot，快把這套「連線保持 + 雙重 Set 去重 + 載入動畫」的黃金架構打包帶走吧！

---

### 📂 專案開源與完整程式碼
本專案的完整程式碼、Dockerfile、設定檔案及防重複防護邏輯已全面開源至 GitHub。歡迎點擊下方連結進行 Star、Fork 或深入研究：

👉 **GitHub 儲存庫：[https://github.com/zonawang/line-loading-animation](https://github.com/zonawang/line-loading-animation)**

如果您在部署或使用過程中遇到任何技術細節問題，也歡迎在儲存庫中發起 Issue 與我們一起探討交流！✨
