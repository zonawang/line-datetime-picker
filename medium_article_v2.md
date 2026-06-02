# 🔮 打造長效永久記憶的 LINE 智慧占星助理：Google ADK 與 Cloud Firestore 技術實踐指南

你是否遇過這種糟糕的體驗：與聊天機器人互動時，每次開啟對話，都得重新輸入自己的生日、重新上傳照片、重新交代前因後後？這對使用者體驗來說無疑是一場災難。

今天，我與 AI 協同開發助理 Antigravity 展開了一場合作。我們的目標是：利用 Google 最新的 **ADK (Agent Development Kit)** 智慧代理框架，搭配 **Google Cloud Firestore** 永久資料庫，為我們的 LINE 水晶占星機器人打造一套「長效不遺忘」的永久記憶系統！

更重要的是，我們還將機器人的靈魂重新雕琢，使其從原本浮誇吵鬧的「神婆」，蛻變為溫柔理性、沈穩且富含洞察力的專業水晶占星專家。

以下是我們在短短半小時內，攜手攻克四大技術難難、成功在 Google Cloud Run 上熱更新部署的真實技術實錄。

---

## 🚀 核心升級：為什麼選擇 Google ADK 開發框架？

Google 最新的 **ADK (Agent Development Kit)** 是一個專門用來構建 AI Agent（智慧代理）的輕量級框架。它最令人驚豔的特性，就是強大的「記憶編排能力」。

透過內建的 **`PreloadMemoryTool`**，我們在程式碼中**僅需加入一行宣告**：
```javascript
const crystalExpertAgent = new adk.LlmAgent({
  name: 'crystal-expert',
  model: llm,
  instruction: `...`,
  tools: [adk.PRELOAD_MEMORY] // 核心：只要一行，自動在對話開始前載入歷史相關記憶
});
```
這樣一來，Agent 就會在每一次使用者發言前，自動去搜尋、提取歷史記憶，並預載到當前對話的系統上下文（System Context）中。使用者不再需要反覆重複背景資訊，機器人就能自動展現出「我一直記得你」的驚豔體驗。

然而，當我們開始實作這套架構並部署至 Google Cloud Run 時，卻一連遭遇了四個驚心動魄的技術挑戰。

---

## 🧩 第一關：Node.js CJS/ESM 混血衝突與 Node 22 Alpine 救援

當我們高高興興引入 `@google/adk` 框架並在雲端進行部署測試時，伺服器卻在啟動瞬間崩潰：
> ❌ *Error [ERR_REQUIRE_ESM]: require() of ES Module ... lodash-es not supported*

### 💡 衝突診斷：當舊 CommonJS 撞上新 ES Module
Google ADK 套件在內部引用了 ESM 格式的 `lodash-es`，然而我們的 LINE 專案是傳統的 CommonJS (`require`) 架構，在舊版 Node.js 中兩者無法直接混用。

要將整個專案重構為 ESM 是一件繁瑣且容易出錯的工程。此時，AI 助理展現了它對 Node.js 最新標準的敏銳度，提出了一個極其優雅的解決方案：
> 「Node.js 自版本 22 起，引入了一個顛覆性的黑科技旗標 `--experimental-require-module`，它允許 CommonJS 的 `require` 直接同步載入 ES Module。」

我們立即調整了 `Dockerfile` :
1. 將基礎映像檔升級為最新的 **`node:22-alpine`**。
2. 將啟動指令優化為：`CMD [ "node", "--experimental-require-module", "index.js" ]`。

重新部署後，CJS 與 ESM 成功在 Node 22 中「世紀和解」，伺服器順利且流暢地啟動！

---

## 🇨🇳 第二關：外國人寫的 ADK 不懂中文？自製中文分詞檢意器

伺服器能跑了，但當我傳送中文進行測試時，卻發現機器人依然「裝作不認識我」，完全讀取不到先前的對話歷史。

### 💡 程式碼解密：被正則過濾掉的漢字
透過翻閱本地 `@google/adk` 的類型定義與源碼，我們發現了關鍵問題：
> ADK 內建的 `InMemoryMemoryService` 在進行文字分詞與檢索時，使用的是 `/[A-Za-z]+/g` 這個正規表示式。這意味著**所有的中文字元、漢字，在分詞階段就會被完全當成空白過濾掉**，導致中文使用者永遠無法命中記憶！

為了解決這個「水土不服」的 Bug，AI 助理幫我自製了一個 **`ChineseInMemoryMemoryService`**，直接繼承並覆寫了 ADK 的記憶檢索邏輯：
* **子字串匹配（Substring-based Matching）**：不再依賴英文單字分詞，而是直接利用 `includes` 進行中文字串的比對。
* **高頻詞模糊匹配**：特別加入了針對台灣習慣的「水晶、生日、占卜、運勢、粉晶、紫水晶、黃水晶」等高頻占星詞彙的權重比對。

這個自製的中文記憶服務，成功讓 Google ADK 在中文世界裡發揮了 100% 的威力！

---

## 🔥 第三關：打破 Stateless 限制！將記憶刻進 Google Cloud Firestore

雖然中文記憶搞定了，但 Google Cloud Run 是一個「無狀態（Stateless）」的 Serverless environment，一旦一段時間沒有請求，伺服器就會自動縮容至 0（Scale to Zero）或重新啟動，此時暫存在記憶體中的記憶依然會隨風而逝。

為了讓記憶永恆不滅，我下達了指令：**「請幫我寫在 Google Cloud Firestore 裡。」**

### 💡 打造雙層儲存：自製 FirestoreMemoryService
我們安裝了 `@google-cloud/firestore`，並在程式中實作了全新的 **`ChineseFirestoreMemoryService`**（完全對接並符合 ADK 的 `BaseMemoryService` 介面規範）：
* **永恆儲存（addSessionToMemory）**：每次 LINE 對話結束，系統會自動在 Firestore 的 `crystal_memories` 集合中，以使用者 ID 建立文檔，將該次對話歷史（events）寫入雲端。
* **無縫預載（searchMemory）**：當新對話開始，ADK 的 `PreloadMemoryTool` 會自動去 Firestore 中檢索該用戶的歷史記憶，並將其與當前對話融合。
* **免金鑰安全認證 (ADC)**：利用 Google Cloud 內建的應用程式預設憑證（ADC），我們只需在 GCP IAM 中授權給 Cloud Run 的預設服務帳戶 `roles/datastore.user`（Firestore 使用者）權限。機器人不需要任何 JSON 私鑰檔案，就能安全、自動地讀寫資料庫！

---

## 🎭 第四關：人設大升級：從活潑「神婆」蛻變為溫暖優雅的「占星專家」

技術架構全部打通後，我發現原先設定的「水晶神婆」人設在對話時顯得有點過於活潑、甚至有些輕浮。在進行心靈占卜與水晶諮詢時，使用者需要的是信任感與安定感。

於視我對 AI 助理提出人設轉型要求：
> 💬 **「首先，不要叫自己神婆，然後語氣有點太活潑，你是專業的水晶與占星諮詢大師，語氣請調整得更沈穩知性。」**

### 💡 專業化的知性人設：從容、沈穩、溫柔且深具洞察力
收到指令後，AI 助理迅速對 `index.js` 的系統設定（System Instruction）進行了「沈穩知性」的整型：
* **徹底封印「神婆」**：嚴格禁止自稱神婆、巫婆，改為溫暖理性的「水晶占星專家」。
* **優雅語調調校**：過濾掉「哎呀」、「寶貝」、「哈哈」等浮誇語助詞，改用「親愛的，讓我們靜下心來看看...」這種溫和、優雅且客觀的語調，建立與使用者之間的同理心與信任感。
* **雙向共振解讀**：引導 AI 主動將使用者的「生日星盤」與「已收集的水晶」進行深入分析，對照星象位移，給予最精確的脈輪調和建議。

當我重新傳送粉晶照片給它時，機器人給出了極具溫度與專業感的回覆：
> **「🔮 親愛的，收到你的水晶照片了。這是一顆散發著溫柔粉紅光學波動的芙蓉晶（粉晶），它對應著你的心輪。在最近星象能量起伏較大的時期，它能溫柔地撫平你內心的焦慮... 結合你先前提到太陽落在天秤座的星盤配置，這股穩定的能量能為你帶來極佳的調和效果...」**

那一刻，我知道，我們成功賦予了這個 LINE Bot 一個溫暖而專業的靈魂。

---

## 💬 結語：人機協同，讓創意的火花即刻落地

回顧這整趟升級至 Google ADK + Firestore 具備「長效記憶」，並擁有沈穩、專業且充滿療癒靈魂的占星專家機器人。這整趟與 AI 協同開發助理 Antigravity 的進化之旅，徹底展現了「人機協同」的極致魅力：
* **AI 負責攻堅複雜的底層技術**：從 Node 22 的 ESM 兼容問題、ADK 中文分詞的底層覆寫，到 Firestore 的無縫整合與安全性授權配置。
* **人類負責雕琢靈魂與產品方向**：包括對人設語氣的極致挑剔、對用戶體驗的細緻堅持。

在有 AI 輔助的開發新時代，我們不再需要花費大量時間去死記生硬的工具指令，而是能將精力集中在「如何清晰表達邏輯與創意」。

---
本專案的完整程式碼、安全配置與 Google ADK Firestore 記憶實作已全數備份至新 GitHub 倉庫：https://github.com/zonawang/line-memory-bot.git，如果您對建立自己的智慧型 LINE 機器人或與 AI 協同開發感興趣，歡迎隨時留言與我交流！
