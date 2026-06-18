# 🔮 LINE Bot 視覺與智慧雙重升級：打造動態隨機「水晶推薦」Flex Message 卡片與 AI 大腦融合實錄

自從跟我的 AI 神隊友 **Google Antigravity** 展開合作以來，我們的 LINE 占星與水晶助理已經經歷了多次不可思議的進化：
* **首部曲**：[不懂程式也能看懂！我與 AI 攜手 20 分鐘無痛打造 LINE Bot 實錄](https://medium.com/@zonawang/%E4%B8%8D%E6%87%82%E7%A8%8B%E5%BC%8F%E4%B9%9F%E8%83%BD%E7%9C%8B%E6%87%82-%E6%88%91%E8%88%87-ai-%E5%8A%A9%E7%90%86%E6%94%9C%E6%89%8B-20-%E5%88%86%E9%90%98%E7%84%A1%E7%97%9B%E6%89%93%E9%80%A0%E9%9B%B2%E7%AB%AF-line-%E6%A9%9F%E5%99%A8%E4%BA%BA%E5%AF%A6%E9%8C%84-a8977432d84b) —— 奠定雲端 Cloud Run 部署基礎。
* **二部曲**：[從複誦到看圖說故事：我與 AI 助理 15 分鐘將 LINE Bot 升級 Gemini 2.5 多模態大腦與免密認證實錄](https://medium.com/@zonawang/%E7%BA%8C%E9%9B%86-%E5%BE%9E%E5%AD%B8%E8%88%8C%E5%88%B0%E7%9C%8B%E5%9C%96%E8%AA%AA%E6%95%85%E4%BA%8B-%E6%88%91%E8%88%87-ai-%E5%8A%A9%E7%90%86-15-%E5%88%86%E9%90%98%E5%B0%87-line-bot-%E5%8D%87%E7%B4%9A-gemini-2-5-%E5%A4%9A%E6%A8%A1%E6%85%8B%E5%A4%A7%E8%85%A6%E8%88%87%E5%85%8D%E5%AF%86%E9%80%9A%E9%97%9C%E5%AF%A6%E9%8C%84-9fe9c64d1ea2?postPublishedType=repub) —— 讓機器人學會看圖並簡化認證流程。
* **三部曲**：[打造長效永久記憶的 LINE 智慧占星助理](https://medium.com/@zonawang/%E7%B0%A1%E5%96%AE%E4%B8%89%E6%AD%A5%E9%A6%96%E9%A0%81%E5%BF%AB%E9%80%9F%E6%8E%A5%E4%B8%8A-firestore-%E4%B9%8B%E9%A1%9E%E7%9A%84%E6%96%87%E7%AB%A0%E9%80%A3%E7%B5%90) —— 引入 Google ADK 框架與 Firestore，建立永久對話記憶。
* **四部曲**：[互動感拉滿的智慧追問 Quick Reply 與手繪圖文選單](https://medium.com/@zonawang/%E5%8A%A8%E6%85%8B%E6%99%AE%E5%8F%8A%E8%BF%BD%E5%95%8F%E4%B9%8B%E9%A1%9E%E7%9A%84%E9%80%A3%E7%B5%90) —— 突破 20 字膠囊限制、壓縮手繪選單突破 1MB 並排除 JavaScript 作用域 Bug。

雖然機器人已經有永久記憶也很好看，但在對話過程中，我發現純文字的回應在視覺上還是不夠驚艷。這一次，我決定繼續召喚我的 AI 神隊友 **Google Antigravity**，把互動視覺效果直接拉到極致：打造**高規格微型輪播卡片（Flex Message Carousel）**！

以下是我們今天在短短半天內，攜手攻克四大技術難關、成功更新部署並安全 Push 的真實合作實錄。

---

## 🧩 第一關：Micro-Carousel Flex Message 隨機推薦設計

要給使用者提供最好的水晶推薦，在視覺呈現上，絕對不能只是乾巴巴的文字。我對 Antigravity 說：

> 💬 **「我要使用flex message, 顯示本日推薦三種水晶，需要水晶圖片（網路上抓圖或是你幫我產）、水晶功效，我想要類似以下模板...」**

Antigravity 很快幫我分析了 LINE Flex Message Simulator 的繁瑣 JSON 語法，建立了 `micro` 尺寸的氣泡圖卡模板（Bubble Template）：包括 `320:213` 的水晶高質感圖片、金黃色推薦星級、條列式功效說明、以及詳細諮詢的按鈕。

但我希望卡片每一次出來都能讓人有新鮮感，於是我進一步要求：

> 💬 **「以上可以，但我想要每一次出現flex message時，都是隨機出現三種不同的水晶」**

為了解決隨機不重複的問題，Antigravity 在 JavaScript 中實作了經典的 **Fisher-Yates 隨機洗牌演算法**：從我們精選的 7 種優質水晶庫（紫水晶、粉晶、黃水晶、綠幽靈、白水晶、黑曜石、鈦晶）中隨機提取不重複的 3 種，完美達成了動態隨機推薦的需求！

```javascript
function getRandomCrystals(count = 3) {
  const shuffled = [...CRYSTAL_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
```

---

## 🧩 第二關：大腦功能搬遷與防干擾分流

水晶圖卡做好後，我面臨了新的挑戰：我們需要把先前在舊專案裡的所有多模態、ADK 智慧代理與 Firestore 記憶庫完整移植到新的 `line-flex-message` 專案中。我對 Antigravity 下指令：

> 💬 **「請把line-ai-bot 裡的所有功能，也都搬進來」**

在整併的過程中，我發現了一個互動上的衝突：如果只是單純的關鍵字模糊比對，只要使用者在跟 AI 占星師聊天時提到「白水晶」，後端就會立刻又跳出推薦卡片，嚴重干擾正常對話。

為了解決這個問題，我對 Antigravity 說：

> 💬 **「請幫我改成打「#水晶」時，才會出現flex message」**

透過這個前綴分流設定，我們在程式碼中做出了精準的邏輯分流：
1. **精準觸發**：當使用者輸入 `#水晶` 時，後端 0 毫秒秒出 3 張不重複的精美水晶推薦圖卡。
2. **一般聊天與圖文諮詢**：其餘普通水晶關鍵字或上傳水晶照片，則一律安全交給 Google ADK 與 Firestore 永久記憶託管，保持對話的流暢與優雅。

---

## 🧩 第三關：本地安裝快取 EACCES 權限衝突

在本地端進行大融合專案的套件安裝時，我的終端機在執行 `npm install` 時突然拋出了大量红色的 `EACCES: permission denied` 權限拒絕錯誤。

這通常是因為全域 npm 快取目錄被 root 鎖定。為了不使用不安全的 `sudo` 安裝，Antigravity 給出了一個非常優雅的隔離快取解法：

```bash
npm install --cache ./.npm-cache
```

透過指定專案底下的 `/.npm-cache`，我們完美繞過了系統權限衝突，安全且順暢地完成了所有依賴套件的安裝！

---

## 🧩 第四關：GCP 跨區部署與 Webhook 網址羅生門

套件與大腦整合好後，我迫不及待地請 Antigravity 幫我部署到 Google Cloud Run。

> 💬 **「請幫我用gcloud部署上去 專案名稱：line-zona 機器名稱：line-echo-bot 環境變數不變」**

很快，Antigravity 完成了部署。然而，當我興奮地在 LINE 視窗裡測試時，卻發現發送「#水晶」毫無反應。我忍不住詢問：

> 💬 **「你有部署上去嗎？我打了「水晶」，沒有出現flex message」**

Antigravity 隨即展開排查。原來，我們在部署時沒有顯式指定部署區域，導致 GCP 預設將其部署到了美國的 `us-central1`。而我原本在 LINE Developer Console 上設定的 Live Webhook 網址，指向的其實是台灣的 `asia-east1`！

當我對它說：

> 💬 **「我已經設定過了，請直接更新」**

它立刻將指令修正為台灣區域的精準熱更新部署：

```bash
gcloud run deploy line-echo-bot \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated
```

重新部署成功後，輸入 `#水晶`——精緻無比的水晶推薦圖卡瞬間呈現！

---

## 💬 結語與安全 Push

在一切測試完美落幕後，我下達了最後的整理指令：

> 💬 **「請幫我push到 line-flex-message 這個repo」**

在確保私密的 `.env` 環境變數被 `.gitignore` 安全排除後，今天所有的結晶，包含 `index.js`、`Dockerfile` 以及這一篇最新文章，都已經成功、安全地 Push 到我的最新倉庫中！

🔗 **專案 GitHub 倉庫**：https://github.com/zonawang/line-flex-message.git

與 **Google Antigravity** 的再次協作依然高效愉快。AI 替我快速排除了本地權限、GCP 部署區域衝突等繁瑣的底層 Bug，而我則能專注於打造水晶推薦的隨機邏輯、分流互動體驗、以及寫作分享。

如果您也想親自體驗用 AI 打造如此好玩的高質感 LINE Bot，歡迎參考我的 Repo！
