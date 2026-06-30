# LINE Bot 實戰：用 Loading Animation 與 Serverless 去重機制，優化 LLM 的對話體驗

大家哈囉！如果你曾經在 LINE Bot 中整合過 OpenAI 或 Google Gemini 等大型語言模型（LLM），可能都會遇到一個共通的痛點：**LLM 生成回答的時間通常需要 5 到 15 秒。在這段等待的空白期中，用戶常常會因為不知道機器人是否正常運作，而開始重複發送訊息。**

自從與我的 AI 協作夥伴 **Google Antigravity** 展開合作以來，我們的智慧占星水晶 Bot 已經順利完成了多個階段的進化。而這一次，為了解決用戶等待焦慮的問題，我們決定在專案中加入 LINE 官方支援的 **`showLoadingAnimation` (載入中動畫)** 功能。

原本以為這只是個呼叫 API 的簡單設定，但在配合 Google Cloud Run 等 Serverless 部署環境進行實際測試時，我們卻遇到了兩個蠻具挑戰性的技術問題：
1. **載入動畫有順利出現，但動畫結束後機器人卻沒有任何回覆。**
2. **機器人成功回覆了，但在回覆發送後，載入動畫卻又莫名其妙重複出現。**

這篇文章會以白話、務實的角度，記錄我們在開發過程中是如何找出問題根源，並透過「連線保持」與「雙重快取阻斷」機制順利解決的。

---

## 🧩 問題一：動畫順利出現，但機器人卻沒有任何回覆

LINE 官方提供的 `showLoadingAnimation` API 體驗相當不錯，它會在用戶手機的對話視窗頂端，顯示類似真人打字中的動態氣泡，最長可設定 15 秒，且只要後端發送了真正的回覆，動畫就會自動結束。

在開發初期，我的直覺做法是：
> 「既然 LLM 運算需要時間，為了不讓 LINE 伺服器因為等太久而判定逾時，我應該在收到 Webhook 的當下立刻回傳 `200 OK`，然後讓非同步程式在背景慢慢跑 Gemini 運算，最後再回傳結果。」

然而部署到 Cloud Run 測試後，卻發現打字動畫閃了 15 秒後消失，用戶卻完全沒有收到任何回覆，後端日誌也吐出了一堆 `Invalid reply token` 的錯誤。

### 原因分析：Serverless 的 CPU 凍結機制
在 Google Cloud Run 這種 Serverless 平台上，運算資源的調度非常即時：
**當你的後端程式回傳了 `res.send('OK')`，Cloud Run 就會判定該次 HTTP 請求已完成。為了節省資源，平台會立即凍結該容器的 CPU（Throttling）。**

這導致我們在背景執行的 Gemini 非同步任務直接被「暫停」了。直到下一次有其他請求進來喚醒容器時，任務才會繼續跑，但這時先前的 `replyToken` 早就已經過期失效，造成回覆無法送達。

### 解決方法：連線保持 (Connection Holding)
我們不能提早回傳 `200 OK`。在 `/webhook` 路由中，必須使用 `Promise.all` **保持 HTTP 連線開啟**，一直等到 Gemini 運算完畢且 `replyMessage` 成功送出後，才正式回覆 LINE 伺服器。這可以確保 Cloud Run 在整個推論期間都分配給我們完整的 CPU 動能。

---

## 🧩 問題二：回覆成功了，但載入動畫為什麼重複出現？

解決了第一個問題後，機器人可以順利回覆了。但這時卻出現了另一個奇怪的現象：
* 用戶發送訊息後，打字動畫順利出現。
* 約過 8 秒，用戶收到了機器人的回答，動畫隨之消失。
* 但又過了 1、2 秒，打字動畫竟然在手機上再次閃爍了起來。

這代表後端在完成回覆後，又被重複觸發了。

### 原因分析：LINE Webhook 的 5 秒超時重試機制
這是我們採取「連線保持」後帶來的副作用。

LINE 官方規定：**當 Webhook 發送後，如果 5 秒內沒有收到回應（也就是我們為了等 Gemini 跑完而按住連線），LINE 伺服器就會判定這次發送可能失敗了，並會自動重新發送最多 3 次一模一樣的重試請求（Retry）。**

這導致了以下連鎖反應：
1. 第一個正常請求還在等待 Gemini 處理（此時已超過 5 秒，手機上正常顯示動畫）。
2. LINE 發動重試，第二個相同的請求抵達後端。
3. 後端再次進入處理邏輯，**又呼叫了一次顯示動畫的 API**，並在背景跑起另一個重複的 Gemini 任務。
4. 即使第一個請求順利跑完並結束了動畫，第二個遲到的請求隨後依然在背景執行，導致動畫再次出現。

### 解決方法：雙重快取防重複機制 (Double-Set Deduplication)
為了解決重試造成的重複執行，我們在伺服器記憶體中建立了兩個 `Set` 快取：
* `activeEvents`：記錄**正在處理中**的事件 ID。
* `completedEvents`：記錄**已完成回覆**的事件 ID。

在 Webhook 事件進來時，我們進行以下過濾：

```javascript
const eventId = event.webhookEventId;

if (eventId) {
  // 1. 如果這個事件之前已經處理完畢，直接忽略重試
  if (completedEvents.has(eventId)) {
    console.log(`⚠️ [去重] 事件已完成過，拋棄重試。`);
    return 'OK';
  }

  // 2. 如果相同的事件正在處理中（代表是 LINE 因 5 秒超時而發送的重試請求）
  // 我們「立刻回傳 200 OK」給重試請求並將其丟棄，以阻止 LINE 繼續嘗試
  if (activeEvents.has(eventId)) {
    console.log(`⚠️ [去重] 事件處理中，立即回覆 OK 並拋棄重試。`);
    return 'OK';
  }

  // 3. 正常請求，加入處理中快取
  activeEvents.add(eventId);
}
```

這個邏輯的核心在於：**對於原請求，我們保持連線以獲取 CPU 資源；而對於重試請求，我們透過快取辨識，立刻回覆 200 OK 並將其拋棄。** 這樣就能確保每個事件只會被實質執行一次。

---

## 🚀 核心程式碼範例

在 `/webhook` 路由中，實作方式如下：

```javascript
const activeEvents = new Set();
const completedEvents = new Set();

// 每 10 分鐘清空快取，維護記憶體安全
setInterval(() => {
  activeEvents.clear();
  completedEvents.clear();
}, 600000);

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map(async (event) => {
        const eventId = event.webhookEventId;

        if (eventId) {
          if (completedEvents.has(eventId)) return 'OK';
          if (activeEvents.has(eventId)) return 'OK';
          activeEvents.add(eventId);
        }

        try {
          const result = await handleEvent(event, req);
          if (eventId) completedEvents.add(eventId);
          return result;
        } finally {
          if (eventId) activeEvents.delete(eventId);
        }
      })
    );

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});
```

在 `handleEvent` 處理邏輯的最前端，呼叫載入動畫：
```javascript
// 顯示 15 秒打字動畫，發送 replyMessage 時會自動結束
await client.showLoadingAnimation({ chatId: userId, loadingSeconds: 15 });
```

---

## 🏆 總結

透過這次的調整，我們成功優化了 LINE Bot 的使用體驗與系統穩定度：
* **減少等待焦慮**：用戶送出訊息後立即可看見打字狀態提示，互動體驗更為精緻。
* **確保執行成功率**：Cloud Run 容器在推論期間維持 CPU 活躍分配，徹底解決非同步處理被中斷的現象。
* **避免資源浪費**：雙快取去重機制精準攔截了 LINE Webhook 的超時重試，不重複觸發動畫，也避免了額外的 API 額度消耗。

這套「連線保持 + 雙重快取去重 + 載入動畫」的實作方式，能有效解決 Serverless 環境下非同步處理與重試機制的衝突。如果你也在開發 LLM 驅動的聊天機器人，不妨參考看看。

---

### 📂 專案開源與完整程式碼
本專案的完整程式碼、Dockerfile、設定檔案及防重複防護邏輯已全面開源至 GitHub。歡迎點擊下方連結進行 Star、Fork 或深入研究：

👉 **GitHub 儲存庫：[https://github.com/zonawang/line-loading-animation](https://github.com/zonawang/line-loading-animation)**

如果您在部署或使用過程中遇到任何技術細節問題，也歡迎在儲存庫中發起 Issue 與我們一起探討交流！✨
