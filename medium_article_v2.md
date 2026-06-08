# 🔮 打造長效永久記憶的 LINE 智慧占星助理：Google ADK 與 Cloud Firestore 技術實踐指南

你是否遇過這種糟糕的體驗：與聊天機器人互動時，每次開啟對話，都得重新輸入自己的生日、重新上傳照片、重新交代前因後果？這對使用者體驗來說無疑是一場災難。


![Image 2](https://miro.medium.com/v2/resize:fit:700/1*bMLL73hvp4Xdo9-ht_AL3w.png)

在我們之前的系列旅程中，我們已經為這個 LINE Bot 奠定了堅實的基礎：

*   首部曲：[程式小白也能看懂！我與 AI 攜手 20 分鐘無痛打造 LINE Bot實錄](https://medium.com/@zonawang/%E4%B8%8D%E6%87%82%E7%A8%8B%E5%BC%8F%E4%B9%9F%E8%83%BD%E7%9C%8B%E6%87%82-%E6%88%91%E8%88%87-ai-%E5%8A%A9%E7%90%86%E6%94%9C%E6%89%8B-20-%E5%88%86%E9%90%98%E7%84%A1%E7%97%9B%E6%89%93%E9%80%A0%E9%9B%B2%E7%AB%AF-line-%E6%A9%9F%E5%99%A8%E4%BA%BA%E5%AF%A6%E9%8C%84-a8977432d84b)
*   二部曲：[從 複誦到看圖說故事：我與 AI 助理 15 分鐘將 LINE Bot 升級 Gemini 2.5 多模態大腦與免密認證實錄](https://medium.com/@zonawang/%E7%BA%8C%E9%9B%86-%E5%BE%9E%E5%AD%B8%E8%88%8C%E5%88%B0%E7%9C%8B%E5%9C%96%E8%AA%AA%E6%95%85%E4%BA%8B-%E6%88%91%E8%88%87-ai-%E5%8A%A9%E7%90%86-15-%E5%88%86%E9%90%98%E5%B0%87-line-bot-%E5%8D%87%E7%B4%9A-gemini-2-5-%E5%A4%9A%E6%A8%A1%E6%85%8B%E5%A4%A7%E8%85%A6%E8%88%87%E5%85%8D%E5%AF%86%E9%80%9A%E9%97%9C%E5%AF%A6%E9%8C%84-9fe9c64d1ea2?postPublishedType=repub)

然而，在多模態大腦就位後，我們迎來了更深層的考驗：每當 Cloud Run 容器因為閒置而縮容至零（Scale to Zero）或重新啟動時，暫存在記憶體中的對話歷史就會隨之消逝。下一次開啟對話，使用者又必須重新輸入自己的生日。

為了解決這個痛點，今天，我與 AI 協同開發助理 Antigravity 展開了第三部曲的深度進化合作！我們的目標是：利用 Google 最新的 ADK (Agent Development Kit) 智慧代理框架，搭配 Google Cloud Firestore 永久資料庫，為我們的 LINE 水晶占星機器人打造一套「長效不遺忘」的永久記憶系統！

更重要的是，我們還將機器人的靈魂重新雕琢，使其從原本浮誇吵鬧的「神婆」，蛻變為溫柔理性、沈穩且富含洞察力的專業水晶占星專家。

以下是我們在短短半小時內，攜手攻克四大技術難關、成功在 Google Cloud Run 上熱更新部署的真實技術實錄。

## 🚀 核心升級：為什麼選擇 Google ADK 開發框架？

Google 最新的 ADK (Agent Development Kit) 是一個專門用來構建 AI Agent（智慧代理）的輕量級框架。它最令人驚豔的特性，就是強大的「記憶編排能力」。

透過內建的 `PreloadMemoryTool`，我們在程式碼中僅需加入一行宣告：

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

## 🧩 第一關：Node.js CJS/ESM 混血衝突與 Node 22 Alpine 救援

當我們高高興興引入 `@google/adk` 框架並在雲端進行部署測試時，伺服器卻在啟動瞬間崩潰：

> _❌_ Error [ERR_REQUIRE_ESM]: require() of ES Module … lodash-es not supported

## 💡 衝突診斷：當舊 CommonJS 撞上新 ES Module

Google ADK 套件在內部引用了 ESM 格式的 `lodash-es`，然而我們的 LINE 專案是傳統的 CommonJS (`require`) 架構，在舊版 Node.js 中兩者無法直接混用。

要將整個專案重構為 ESM 是一件繁瑣且容易出錯的工程。此時，AI 助理展現了它對 Node.js 最新標準的敏銳度，提出了一個極其優雅的解決方案：

> _「Node.js 自版本 22 起，引入了一個顛覆性的黑科技旗標_`--experimental-require-module`_，它允許 CommonJS 的_`require`_直接同步載入 ES Module。」_

我們立即調整了 `Dockerfile` :

1.   將基礎映像檔升級為最新的 `node:22-alpine`。
2.   將啟動指令優化為：`CMD [ "node", "--experimental-require-module", "index.js" ]`。

重新部署後，CJS 與 ESM 成功在 Node 22 中「世紀和解」，伺服器順利且流暢地啟動！

## 🇨🇳 第二關：外國人寫的 ADK 不懂中文？自製中文分詞檢意器

伺服器能跑了，但當我傳送中文進行測試時，卻發現機器人依然「裝作不認識我」，完全讀取不到先前的對話歷史。

## 💡 程式碼解密：被正則過濾掉的漢字

透過翻閱本地 `@google/adk` 的類型定義與源碼，我們發現了關鍵問題：

> _ADK 內建的_`InMemoryMemoryService`_在進行文字分詞與檢索時，使用的是_`/[A-Za-z]+/g`_這個正規表示式。這意味著所有的中文字元、漢字，在分詞階段就會被完全當成空白過濾掉，導致中文使用者永遠無法命中記憶！_

為了解決這個「水土不服」的 Bug，AI 助理幫我自製了一個 `ChineseInMemoryMemoryService`，直接繼承並覆寫了 ADK 的記憶檢索邏輯：

*   子字串匹配（Substring-based Matching）：不再依賴英文單字分詞，而是直接利用 `includes` 進行中文字串的比對。
*   高頻詞模糊匹配：特別加入了針對台灣習慣的「水晶、生日、占卜、運勢、粉晶、紫水晶、黃水晶」等高頻占星詞彙的權重比對。

這個自製的中文記憶服務，成功讓 Google ADK 在中文世界裡發揮了 100% 的威力！

## 🔥 第三關：打破 Stateless 限制！將記憶刻進 Google Cloud Firestore

雖然中文記憶搞定了，但 Google Cloud Run 是一個「無狀態（Stateless）」的 Serverless environment，一旦一段時間沒有請求，伺服器就會自動縮容至 0（Scale to Zero）或重新啟動，此時暫存在記憶體中的記憶依然會隨風而逝。


![Image 3](https://miro.medium.com/v2/resize:fit:700/1*z6o7akwgLDygf_2LPao4ow.png)

(過一段時間後，開始答非所問）




為了讓記憶永恆不滅，我下達了指令：「請幫我寫在 Google Cloud Firestore 裡。」

## 💡 打造雙層儲存：自製 FirestoreMemoryService

我們安裝了 `@google-cloud/firestore`，並在程式中實作了全新的 `ChineseFirestoreMemoryService`（完全對接並符合 ADK 的 `BaseMemoryService` 介面規範）：

*   永恆儲存（addSessionToMemory）：每次 LINE 對話結束，系統會自動在 Firestore 的 `crystal_memories` 集合中，以使用者 ID 建立文檔，將該次對話歷史（events）寫入雲端。
*   無縫預載（searchMemory）：當新對話開始，ADK 的 `PreloadMemoryTool` 會自動去 Firestore 中檢索該用戶的歷史記憶，並將其與當前對話融合。
*   免金鑰安全認證 (ADC)：利用 Google Cloud 內建的應用程式預設憑證（ADC），我們只需在 GCP IAM 中授權給 Cloud Run 的預設服務帳戶 `roles/datastore.user`（Firestore 使用者）權限。機器人不需要任何 JSON 私鑰檔案，就能安全、自動地讀寫資料庫！

## 🎭 第四關：人設大升級：從活潑「神婆」蛻變為溫暖優雅的「占星專家」

技術架構全部打通後，我發現原先設定的「水晶神婆」人設在對話時顯得有點過於活潑、甚至有些輕浮。在進行心靈占卜與水晶諮詢時，使用者需要的是信任感與安定感。


![Image 4](https://miro.medium.com/v2/resize:fit:700/1*AnjPGBiDSmPNgJRtkumu4Q.png)

於視我對 AI 助理提出人設轉型要求：

> _💬 「首先，不要叫自己神婆，然後語氣有點太活潑，你是專業的水晶與占星諮詢大師，語氣請調整得更沈穩知性。」_

## 💡 專業化的知性人設：從容、沈穩、溫柔且深具洞察力

收到指令後，AI 助理迅速對 `index.js` 的系統設定（System Instruction）進行了「沈穩知性」的整型：

*   徹底封印「神婆」：嚴格禁止自稱神婆、巫婆，改為溫暖理性的「水晶占星專家」。
*   優雅語調調校：過濾掉「哎呀」、「寶貝」、「哈哈」等浮誇語助詞，改用「親愛的，讓我們靜下心來看看…」這種溫和、優雅且客觀的語調，建立與使用者之間的同理心與信任感。
*   雙向共振解讀：引導 AI 主動將使用者的「生日星盤」與「已收集的水晶」進行深入分析，對照星象位移，給予最精確的脈輪調和建議。

當我重新傳送水晶照片給它時，機器人給出了極具溫度與專業感的回覆：

> _「🔮_ 親愛的，你好。感謝你信任地與我分享這條美麗的水晶手鍊。讓我們靜下心來，一同感受這份來自大地的能量。
> 
> 
> 從照片中，這條手鍊呈現出深邃的黑色光澤，珠體圓潤而飽滿。根據我的專業判斷，這應該是一條能量非常強大的**黑曜石（Obsidian）**手鍊。黑曜石是一種天然的火山玻璃，它蘊含著地球深處的古老能量，自古以來就被視為極佳的辟邪與保護石。….._」_


![Image 5](https://miro.medium.com/v2/resize:fit:700/1*ZuYMqQx1Q3DLKzJM8kjyPg.png)

那一刻，我知道，我們成功賦予了這個 LINE Bot 一個溫暖而專業的靈魂。

## 🌟 第四部曲：互動感拉滿！打造動態智慧追問 Quick Reply 與專屬手繪圖文選單

在長效記憶與知性人格全數就位後，我們決定更進一步：**徹底拉滿使用者的互動體驗！**

這一次，我與 AI 助理 Antigravity 決定為機器人進行一次極致的「外觀與互動雙重進化」：
1. **動態智慧追問 (Quick Reply)**：不再只是被動回答，而是根據每次的占星諮詢回覆，動態生成 3 個使用者最可能想繼續追問的問題。
2. **專屬手繪選單 (Rich Menu)**：配置一張全新手繪質感卡牌風格的圖文選單，左側一鍵直達「使用指南」，右側無縫跳轉到 GitHub 實驗室。

然而，就在我們擼起袖子大幹一場時，命運又給我們出了三道全新的技術難題。

### 🧩 第五關：拒絕被動對話！Gemini 動態追問與 LINE 20 字膠囊限制

聊天機器人最容易遇到的瓶頸就是「話不投機半句多」，使用者看完一輪分析後往往不知道下一步該問什麼。

#### 💡 解決方案：動態生成 3 個智慧追問問題
我們利用 Gemini 的 `generateContent` 介面，在 `crystalExpertAgent` 產生專業回答後，將回覆內容即時送進第二輪快速推理。我們設計了極為苛刻的 Prompt，要求 Gemini 站在「使用者的主觀角度」，動態設想三個最貼切、最自然的口語化追問。

然而，**LINE API 對 Quick Reply 按鈕的標籤（Label）有著極度嚴格的字數限制：最大只能容納 20 個字！**

為了解決這個硬體界限，我們在後端加上了「AI 限制 + 程式碼雙重截斷」的保險機制：
* 在 Prompt 中嚴格限制：`每個問題必須非常短（嚴格限制在 20 個字以內）`。
* 在 JavaScript 中進行安全截斷與清理：`.map(q => q.trim().substring(0, 20))`。

這確保了每個追問膠囊按鈕（Quick Reply）都能完美在使用者手機底部浮現，點擊即可流暢追問！

### 🧩 第六關：大圖上傳失敗？手繪選單與突破 LINE 1MB 上限挑戰

接著，我們準備套用由 Midjourney / Canva 生成的全新手繪質感卡牌風格圖文選單圖片 `123.png`。這是一張美輪美奐的設計，左側為「水晶使用指南」，右側為「開發過程分享」，完美呼應了水晶占星的神秘療癒感。

#### 💡 衝突診斷：nginx 的 `413 Request Entity Too Large`
這張高品質的 2752x1536 PNG 原圖大小高達 **8.1 MB**。即便我們使用 `sips` 縮放成標準 Large 選單尺寸 (2500x1686)，檔案依然有 **7.5 MB**。

當我們嘗試呼叫 LINE API 上傳這張巨圖時，伺服器無情地彈回了 `413 Request Entity Too Large` 的錯誤，因為 **LINE 對 Rich Menu 圖片有著硬性的 1MB 限制**。

#### 💡 解決方案：極致無損壓縮與一鍵註冊腳本
AI 助理再次提出了精準的指令，利用 macOS 內建的 `sips` 進行極致的 JPEG 格式轉換與品質壓縮：
```bash
sips -s format jpeg -s formatOptions 70 -z 1686 2500 123.png --out richmenu_resized.jpg
```
這行黑科技指令在**肉眼完全看不出畫質損耗**的情況下，將 8.1MB 的巨圖精準壓縮到了 **955 KB**，完美低於 1MB 上限！

隨後，我們寫了一個自動化指令碼 `create-rich-menu.js`，使用 Node 22 原生支援的 `fetch` API，完成了「一鍵註冊選單 -> 上傳 JPEG 圖片 -> 設定為全球預設」的完整三部曲，直接打通 LINE 圖文選單配置！

### 🧩 第七關：點選無反應？捉拿 JavaScript let 區塊作用域的隱藏 Bug

為了節省 Gemini 的 Token 開銷並提升響應速度，我們在後端做了快捷攔截：當使用者點選選單左側發送「使用指南」時，Bot 會直接從程式碼中直出精美版的使用說明，完全不經過 LLM 運算。

然而，當部署上線測試時，點擊選單左側「使用指南」，Bot 卻一片死寂，完全沒有反應。

#### 💡 程式碼除錯：被 `let` 軟禁的作用域
AI 助理冷靜地調閱了日誌，立刻鎖定了這個看似簡單卻致命的變數作用域（Scoping）Bug：
```javascript
try {
  let isGuide = false; // ❌ 宣告在 try 區塊內！
  if (userMessage === '使用指南') {
    isGuide = true;
    responseText = "...";
  }
} catch (err) {}

if (isGuide) { // ❌ 報錯！isGuide 在 try 區塊外部根本不存在！
  ...
}
```
在 JavaScript 中，`let` 具有嚴格的**區塊作用域（Block Scope）**。宣告在 `try` 區塊內的 `isGuide`，在區塊外部引用時會直接觸發 `ReferenceError: isGuide is not defined`。這導致整個 Webhook 在發送回覆前就崩潰中斷，難怪畫面上毫無反應。

我們迅速進行了「作用域提昇（Scope Hoisting）」，將 `isGuide` 提昇至 `handleEvent` 函式層級：
```javascript
let responseText = '';
let newMessage = null;
let isGuide = false; // 正確宣告在函式層級！
```
重新部署後，Bug 瞬間消逝，使用指南功能以 **0 毫秒延遲、0 Token 消耗** 的完美姿態正式上線！

---

## 💬 結語：人機協作，讓創意的火花即刻落地

回顧這整趟升級至 Google ADK + Firestore 具備「長效記憶」，並進化至「手繪選單」與「智慧動態追問」的療癒系水晶占星專家機器人。這整趟與 AI 協同開發助理 Antigravity 展開的深度進化之旅，徹底展現了「人機協同」的極致魅力：

*   AI 負責攻堅複雜的底層技術與影像處理：從 Node 22 的 ESM 兼容問題、ADK 中文分詞的底層覆寫、GCP 權限授權配置，到 `sips` 影像壓制、LINE Rich Menu 動態上傳及作用域 Bug 的快速定位。
*   人類負責雕琢靈魂與產品體驗：包括對圖文選單按鈕的佈局、對人設語氣的極致挑剔、對追問長度限制的細緻把關。

在有 AI 輔助的開發新時代，我們不再需要花費大量時間去死記生硬的工具指令，而是能將精力集中在「如何清晰表達邏輯與創意」。

---

本專案的完整程式碼、安全配置、1MB 影像壓制方案與 Google ADK Firestore 記憶實作已全數備份至最新 GitHub 倉庫：https://github.com/zonawang/line-quick-reply.git，如果您對建立自己的智慧型 LINE 機器人或與 AI 協同開發感興趣，歡迎隨時留言與我交流！
