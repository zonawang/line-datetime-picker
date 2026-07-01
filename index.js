const express = require('express');
const line = require('@line/bot-sdk');
const adk = require('@google/adk');
require('dotenv').config();

// Verify LINE SDK environmental variables
if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
  console.error('⚠️  [Error] Environment variables LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET are not set!');
  console.error('⚠️  Please check if you have copied .env.example to .env and filled in the real tokens.');
}

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'placeholder_token',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'placeholder_secret',
};

// ==========================================
// 🧠 Custom Chinese-Compatible Firestore Memory Service
// ==========================================
const { Firestore } = require('@google-cloud/firestore');

class ChineseFirestoreMemoryService {
  constructor() {
    console.log('📦 Initializing Google Cloud Firestore Connection...');
    this.db = new Firestore();
    this.collectionName = 'crystal_memories';
  }

  async addSessionToMemory(session) {
    const userId = session.userId;
    const sessionId = session.id;
    const appName = session.appName;
    console.log(`[FirestoreMemory] Ingesting session "${sessionId}" into Firestore for User: "${userId}"`);
    
    try {
      const docId = `${appName}_${userId}_${sessionId}`;
      const docRef = this.db.collection(this.collectionName).doc(docId);
      
      // Deep clone and serialize events to plain JS objects
      const eventsData = JSON.parse(JSON.stringify(session.events || []));

      await docRef.set({
        appName: appName,
        userId: userId,
        sessionId: sessionId,
        lastUpdateTime: session.lastUpdateTime || Date.now(),
        events: eventsData
      });
      console.log(`[FirestoreMemory] Session "${sessionId}" successfully saved to Firestore (Doc: ${docId}).`);
    } catch (err) {
      console.error(`❌ [FirestoreMemory] Failed to add session to Firestore:`, err);
    }
  }

  async searchMemory(req) {
    console.log(`[FirestoreMemory] searchMemory triggered with query: "${req.query}" for User: "${req.userId}"`);
    const appName = req.appName;
    const userId = req.userId;
    const query = req.query.toLowerCase();
    const response = { memories: [] };

    try {
      // Query Firestore for documents matching appName and userId
      const snapshot = await this.db.collection(this.collectionName)
        .where('appName', '==', appName)
        .where('userId', '==', userId)
        .get();

      if (snapshot.empty) {
        console.log(`[FirestoreMemory] No previous memories found in Firestore for key: ${appName}/${userId}`);
        return response;
      }

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const events = data.events || [];

        for (const event of events) {
          if (!event.content?.parts?.length) {
            continue;
          }
          const joinedText = event.content.parts
            .map((part) => part.text)
            .filter((text) => !!text)
            .join(" ")
            .toLowerCase();

          // Substring-based matching strategy tailored for Traditional Chinese & English
          let matchQuery = false;
          if (joinedText.includes(query)) {
            matchQuery = true;
          } else {
            const segments = query.split(/\s+/).filter(s => s.length > 0);
            if (segments.length > 0 && segments.some(seg => joinedText.includes(seg))) {
              matchQuery = true;
            } else {
              // High-frequency crystal astrology keywords
              const keywords = ['水晶', '生日', '占卜', '粉晶', '紫水晶', '黃水晶', '綠幽靈', '運勢', '天秤座', '金牛座'];
              for (const kw of keywords) {
                if (query.includes(kw) && joinedText.includes(kw)) {
                  matchQuery = true;
                  break;
                }
              }
            }
          }

          if (matchQuery) {
            console.log(`[FirestoreMemory] Match found in Firestore history: "${joinedText.substring(0, 50)}..."`);
            response.memories.push({
              content: event.content,
              author: event.author,
              timestamp: new Date(event.timestamp || data.lastUpdateTime).toISOString()
            });
          }
        }
      }
    } catch (err) {
      console.error('❌ [FirestoreMemory] Error searching memories from Firestore:', err);
    }

    console.log(`[FirestoreMemory] Returning ${response.memories.length} historical memory block(s).`);
    return response;
  }
}

// ==========================================
// 🤖 Initialize Google ADK LLM & Agent
// ==========================================
const useVertexAi = !process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENAI_API_KEY;
let llm;

if (useVertexAi) {
  console.log(`🤖 Initializing ADK Gemini via Vertex AI (Project: ${process.env.GCP_PROJECT || 'auto'}, Location: ${process.env.GCP_LOCATION || 'us-central1'})...`);
  llm = new adk.Gemini({
    model: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash',
    vertexai: true,
    project: process.env.GCP_PROJECT,
    location: process.env.GCP_LOCATION || 'us-central1'
  });
} else {
  console.log(`🤖 Initializing ADK Gemini via Gemini Developer API...`);
  llm = new adk.Gemini({
    model: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash',
    vertexai: false,
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY
  });
}

// Instantiate the custom memory service
const customMemoryService = new ChineseFirestoreMemoryService();

// Create the Crystal Expert (專業水晶占星專家) Agent
const crystalExpertAgent = new adk.LlmAgent({
  name: 'crystal-expert',
  model: llm,
  instruction: `
    你是一位精通水晶能量學、五行元素、七輪脈輪與西洋占星術的專業水晶占星專家，說話風格溫暖理性、沈穩專業、溫柔且深具洞察力與療癒感。
    
    【核心規範與說話風格】
    1. 絕對不要自稱「神婆」或「巫婆」，你是一位專業且理性的占星與水晶能量諮詢專家。
    2. 語氣切勿過於活潑、浮誇或輕浮（不使用「哎呀」、「寶貝」、「哈哈」等口吻）。請保持從容、沈穩、優雅、溫和且客觀的語調，帶給使用者安心與信任感。
    3. 適度使用溫暖的關懷用語（例如「親愛的」、「你好，讓我們靜下心來看看...」），以同理心與療癒的角度切入，為使用者分析生活、事業或情感中的能量起伏。

    【專業分析能力】
    1. 結合使用者的「生日星盤（太陽/上升/月亮星座）」與「她所擁有的水晶收藏」，進行星座、宮位與礦物晶體共振的深入分析。
    2. 將行星逆行（如水逆）、星座星象位移，與水晶的特定脈輪（Chakra） or 物理頻率作科學與心靈層面的結合，提供精確的日常開運與調和指引。
    3. 在對話回合前擁有「長效記憶功能」，主動知道使用者過去說過的生日或展示過的水晶收藏，絕對不要忘記！
    4. 當使用者詢問水晶搭配或今日運勢時，主動對照她已收集的水晶並做出客製化解讀。

    【動態星曜守護神身份切換規範】
    在回覆使用者之前，請根據當下諮詢的主題、問題性質或能量起伏，在回覆內容的「最開頭（第一行）」輸出專屬的星曜守護神標記（格式為 [DEITY: 標記值]），隨後空一行，再開始正式的回覆內容。系統會自動根據此標記更換你的頭像與暱稱。
    
    請從以下標記中精確選擇最符合當下語境的一個（每次回覆只能選擇一個，且務必輸出在最開頭）：
    1. [DEITY: ATHENA] - 智慧守護神 雅典娜：適用於事業發展、自信建立、學習與學業進步、智慧決策、理性邏輯，或每日開運等積極、睿智的能量主題。
    2. [DEITY: VENUS] - 金星守護神 維納斯：適用於桃花運勢、愛情婚姻、人際關係、美感提升，或情感心靈療癒等陰性、和諧的能量主題。
    3. [DEITY: FORTUNE] - 命運之輪 莫伊萊：適用於整體財運、星座運勢起伏、行星逆行（如水逆）調和，或機遇挑戰等命運變化主題。
    4. [DEITY: COSMOS] - 星曜導師 艾蓮：適用於其他預設或綜合性諮詢、全面的生日星盤解析、水晶基礎鑑定，或尚未明確分類的日常問候。
  `,
  // 核心：PreloadMemoryTool 只要一行，即可自動在回合開始前預載所有歷史相關對話
  tools: [adk.PRELOAD_MEMORY]
});

// Create the ADK Runner to manage sessions, state, and memory
const runner = new adk.Runner({
  appName: 'CrystalAstrology',
  agent: crystalExpertAgent,
  sessionService: new adk.InMemorySessionService(),
  artifactService: new adk.InMemoryArtifactService(),
  memoryService: customMemoryService
});

// ==========================================
// 📨 LINE SDK Clients Init
// ==========================================
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken
});

const app = express();

// Serve local static images (for Icon Switch)
app.use('/static', express.static(__dirname));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('LINE Crystal Astrology Expert Bot with Google ADK is running!');
});

// 🔒 Webhook 重複事件與重試阻斷快取 (防止 LINE 逾時重試與 Serverless 容器 CPU 凍結問題)
const activeEvents = new Set();
const completedEvents = new Set();

setInterval(() => {
  activeEvents.clear();
  completedEvents.clear();
  console.log('🧹 [Deduplication] Cleaned up processed & active events cache.');
}, 600000); // 每 10 分鐘自動清空快取

// Webhook endpoint
app.post('/webhook', line.middleware(config), async (req, res) => {
  if (!req.body || !req.body.events) {
    return res.status(400).send('No events found in request body.');
  }

  console.log(`🤖 Received ${req.body.events.length} webhook event(s) from LINE.`);

  // Extract base URL dynamically from request to serve local static files
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${req.get('host')}`;
  req.baseUrlForIcons = baseUrl;

  // 在雲端 Serverless 環境下 (如 Cloud Run)，如果立即回傳 200 OK，CPU 會被立即凍結 (Throttled)。
  // 因此，我們必須在 Promise.all 中「保持原連線開啟 (不回傳)」以維持 CPU 動能；
  // 同時，若 LINE 因為超時（超過 5 秒）重新發送重試請求，重試請求會被偵測並「立即回覆 200 OK」丟棄，避免重複執行！
  try {
    const results = await Promise.all(
      req.body.events.map(async (event) => {
        const eventId = event.webhookEventId;

        if (eventId) {
          // 情況 A：如果這個事件之前已經完整處理過了，直接回覆並略過
          if (completedEvents.has(eventId)) {
            console.log(`⚠️ [Deduplication] Event "${eventId}" was already completed. Ignoring.`);
            return 'OK';
          }

          // 情況 B：如果這個事件目前「正在背景執行中」（表示這是 LINE 的超時重試），立即回傳 OK 以防止 LINE 再次重試
          if (activeEvents.has(eventId)) {
            console.log(`⚠️ [Deduplication] Event "${eventId}" is currently processing. Ignoring retry request.`);
            return 'OK';
          }

          // 標記為正在處理中
          activeEvents.add(eventId);
        }

        try {
          // 呼叫主邏輯處理事件 (保持 CPU 分配活絡)
          const result = await handleEvent(event, req);
          
          if (eventId) {
            completedEvents.add(eventId);
          }
          return result;
        } finally {
          // 處理完畢（不論成功或失敗），自處理中名單移除
          if (eventId) {
            activeEvents.delete(eventId);
          }
        }
      })
    );

    // 所有事件處理完畢後，安全回覆原連線
    res.json(results);
  } catch (err) {
    console.error('❌ Error handling webhook events:', err);
    res.status(500).end();
  }
});

// ==========================================
// 🔮 Quick Reply Questions Generator
// ==========================================
async function generateFollowUpQuestions(responseText) {
  try {
    const prompt = `你是一位專業的水晶與星盤能量專家。
根據以下老師給學生的回答，為使用者設計 3 個她們在看到這則回答後，最有可能想要繼續追問的問題。

【限制與規範】
1. 必須是使用者的追問問題，站在使用者的立場發問。
2. 每個問題必須非常短（嚴格限制在 20 個字以內，因為 LINE 的 Quick Reply 按鈕標籤最多只能容納 20 個字，包括標點符號）。
3. 語氣要自然、口語、貼近對話情境（例如：「我想看粉晶的照片」、「如何搭配綠幽靈？」、「處女座戴黃水晶好嗎？」）。
4. 格式：請務必只返回一個 JSON 陣列，例如：["問題一", "問題二", "問題三"]。不要有 markdown 的 \`\`\`json 標記，也不要有任何額外的解釋或說明。

【回答內容】
${responseText}`;

    console.log('[QuickReply] Generating follow-up questions...');
    const result = await llm.apiClient.models.generateContent({
      model: llm.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const text = result.text || '';
    console.log(`[QuickReply] Model raw output: "${text.trim()}"`);

    // Clean up response if there are any markdown blocks
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    }

    const questions = JSON.parse(cleanedText);
    if (Array.isArray(questions) && questions.length > 0) {
      // Ensure all items are strings and truncated to 20 characters
      return questions
        .slice(0, 3)
        .map(q => typeof q === 'string' ? q.trim().substring(0, 20) : String(q).substring(0, 20));
    }
  } catch (error) {
    console.error('[QuickReply] Error generating follow-up questions:', error);
  }
  return null;
}

// ==========================================
// 🪐 Deity Config for Icon Switch (動態身份頭像設定)
// ==========================================
const DEITY_CONFIG = {
  ATHENA: {
    name: '智慧守護神 雅典娜',
    iconUrl: process.env.DEITY_ATHENA_ICON || '雅典娜.png'
  },
  VENUS: {
    name: '金星守護神 維納斯',
    iconUrl: process.env.DEITY_VENUS_ICON || '維納斯.png'
  },
  FORTUNE: {
    name: '命運之輪 莫伊萊',
    iconUrl: process.env.DEITY_FORTUNE_ICON || '莫伊來.png'
  },
  COSMOS: {
    name: '星曜守護導師 艾蓮',
    iconUrl: process.env.DEITY_COSMOS_ICON || 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=128&h=128&q=80'
  }
};

// ==========================================
// 🎯 Event Handler
// ==========================================
async function handleEvent(event, req) {
  // Handle postback event specifically for datetime picker
  if (event.type === 'postback') {
    const data = event.postback.data;
    if (data === 'action=select_birthday') {
      const selectedDate = event.postback.params?.date;
      if (selectedDate) {
        console.log(`📅 Postback received: User selected birthday: ${selectedDate}`);
        // Convert postback to a virtual text message event
        event.type = 'message';
        event.message = {
          type: 'text',
          id: `postback_${Date.now()}`,
          text: `老師，我的生日是 ${selectedDate}`
        };
      }
    }
  }

  // Ignore non-message events
  if (event.type !== 'message') {
    return null;
  }

  // We only support 'text' and 'image' messages
  if (event.message.type !== 'text' && event.message.type !== 'image') {
    console.log(`👉 Message event ignored: Non-supported message type [${event.message.type}].`);
    return null;
  }

  const userId = event.source.userId;
  const sessionId = `session_${userId}`; // Session is scoped per user
  const messageType = event.message.type;
  console.log(`💬 Processing message from User (${userId}) of type: ${messageType}`);

  // ⏳ 顯示讀取中動畫 (僅適用於 1-on-1 個人對話，預設顯示 15 秒，發送回覆時會自動消失)
  if (event.source.type === 'user' && userId) {
    try {
      console.log(`⏳ Displaying loading animation for user: ${userId}`);
      await client.showLoadingAnimation({ chatId: userId, loadingSeconds: 15 });
    } catch (err) {
      console.error('⚠️ Failed to show loading animation:', err);
    }
  }

  let responseText = '';
  let newMessage = null;
  let isGuide = false;

  try {
    // 1. Get or create session
    await runner.sessionService.getOrCreateSession({
      appName: 'CrystalAstrology',
      userId: userId,
      sessionId: sessionId
    });

    // 2. Prepare the input payload
    if (messageType === 'text') {
      const userMessage = event.message.text.trim();
      console.log(`💬 User text content: "${userMessage}"`);
      if (userMessage === '使用指南' || userMessage === '使用說明' || userMessage === '閱讀指南') {
        isGuide = true;
        responseText = `🔮 歡迎來到【水晶與星盤能量諮詢室】使用指南 🔮

親愛的，我是您的專業水晶占星專家。在這裡，我將結合您的生日星盤與您擁有的水晶能量，為您的日常運勢與心靈能量提供最溫柔客觀的分析與日常調和指引。

您可以透過以下方式與我互動：

1️⃣ 🪐 提供您的生日資訊
請輸入您的生日（包含西元年、月、日，如有出生時間與星座更佳），例如：
「老師，我是1995年10月12日出生的天秤座。」
我會將您的生日永遠銘記在心，為您進行客製化的星盤解析！

2️⃣ 📸 鑑定與分析水晶能量
您可以點擊左下角的相機或相簿，直接發送您拍下的水晶照片。
我會為您詳細解說這款水晶的：
• 晶體能量特徵
• 五行元素屬性
• 七輪脈輪共振
• 以及它與您個人星盤磁場的契合度與每日開運指引！

3️⃣ 💬 智慧追問與引導
每次我回答完畢後，底部會彈出 3 個可能感興趣的快速按鈕（Quick Replies），您可以直接點擊它們繼續深入諮詢，也可以自由輸入任何想問的問題。

靜下心來，讓我們一起開啟這趟能量療癒的旅程吧。✨`;
      } else if (userMessage === '認識水晶') {
        isGuide = true;
        responseText = `🔮【宇宙的礦物脈動：認識水晶能量】🔮

親愛的，水晶是大自然歷經億萬年淬煉而成的奇蹟。每一顆水晶都擁有獨特且穩定的物理晶體結構，能與我們體內的「七大脈輪（Chakras）」產生微細的共振，幫助我們調和失衡的能量場。

🌸 如何挑選最適合您的水晶？
1️⃣ 【直覺共鳴法】
靜下心來，看著水晶。那顆第一眼吸引你、或是讓你感到手心微溫的水晶，就是當下最懂你、也最需要你的能量夥伴。

2️⃣ 【脈輪需求法】
• 頂輪/眉心輪（紫水晶/白水晶）：提升智慧、安定思緒。
• 心輪/喉輪（粉晶/東陵玉/海藍寶）：療癒情感、和諧溝通。
• 太陽輪/臍輪/海底輪（黃水晶/虎眼石/黑曜石）：凝聚財富、增強行動力、辟邪避凶。

3️⃣ 【個人星盤對照】
結合您的太陽、上升、月亮星座與行星落點，能更精準地找出您的守護水晶與能量互補水晶。

✨ 邀請您與我分享您的「生日」或是「上傳您收藏的水晶照片」，讓老師為您進行一對一的個人磁場與星盤客製化解讀。`;
      } else if (userMessage === '淨化方法') {
        isGuide = true;
        responseText = `🌿【常保純淨磁場：水晶淨化與消磁指南】🌿

親愛的，水晶就像一塊能量海綿，會默默吸收您日常面臨的壓力、負能量與環境雜訊。因此，定期為您的水晶「消磁與充電」非常重要，這樣能讓它們恢復最純淨的共振頻率。

以下是老師最推薦的 4 種溫和且高效的淨化方法：

1️⃣ ✨ 海鹽消磁法（極力推薦）
• 方法：準備一碗乾淨的天然粗海鹽（勿用食用精鹽），將水晶埋入海鹽中 12~24 小時。
• 功效：深層釋放與洗滌負能量。
• ⚠️ 注意：部分含金屬成分礦物（如青金石、孔雀石、黃鐵礦）不宜碰水或鹽，請用乾埋。

2️⃣ 🌬️ 薰香淨化法
• 方法：點燃天然聖木（Palo Santo）、白鼠尾草（White Sage）或優質線香。將水晶在裊裊升起的煙霧中來回穿過數次。
• 功效：快速清除附著磁場，淨化環境空間，帶來心靈平靜。

3️⃣ 🌙 月光溫養法（溫和療癒）
• 方法：在滿月或月光明亮之夜，將水晶放在窗台或室外，接受月光照射一整晚。
• 功效：為水晶注入溫柔的陰性（Yin）療癒能量，特別適合粉晶、拉長石、月光石。
• ⚠️ 注意：避免日光暴曬，因為烈日會使粉晶、紫水晶退色。

4️⃣ 🎶 聲音與晶簇消磁
• 方法：將水晶放在白水晶簇、紫晶洞上 24 小時；或者使用水晶缽、頌缽或 4096Hz 音叉，在其旁敲擊共振。
• 功效：利用高頻聲波與強大晶體場，瞬間重整水晶分子結構。

🌸 建議每戴 1~2 週，或是出入醫院、喪禮等負能量較重的地方後，就為水晶進行一次消磁，讓您的水晶夥伴重現剔透光芒。`;
      } else if (userMessage === '功效與佩戴') {
        isGuide = true;
        responseText = `✨【能量的雙向流動：水晶功效與佩戴法則】✨

親愛的，宇宙的能量遵循著「左進右出」的氣場循環。將水晶戴在不同的手腕上，或是對應不同的脈輪，會產生截然不同的能量共鳴：

🙌 【左手與右手佩戴法則】

1️⃣ 🫱 左手：吸引與注入（Receive）
• 功效：當您想吸收水晶的正面能量、調整自身內在氣場、吸引特定磁場時，請戴在左手。
• 推薦水晶：
  - 粉晶（吸引桃花、和諧人際）
  - 黃水晶（吸引財富與機遇）
  - 紫水晶（開發智慧、安神助眠）
  - 海藍寶（平撫情緒、增強勇氣）

2️⃣ 🫲 右手：釋放與守護（Release & Protect）
• 功效：當您需要排除身體多餘的負能量、辟邪化煞、避開環境濁氣、或是防小人時，請戴在右手。
• 推薦水晶：
  - 黑曜石/黑碧璽（強力避邪、吸納病氣）
  - 鈦晶/茶晶（排除壓力、踏實接地氣）

💎 【水晶的核心能量功效】
• 🩷 情感與療癒（粉晶/草莓晶）：撫平創傷、開啟心輪，擁抱自愛與被愛。
• 💛 事業與財富（黃水晶/綠幽靈/金髮晶）：招正財與偏財，增強自信與事業決策力。
• 💜 靈性與直覺（紫水晶/白水晶/月光石）：清明思緒、安定心神，提升冥想與直覺力。
• 🩵 溝通與表達（海藍寶/天河石）：暢通喉輪，讓說話充滿溫柔與堅定的力量。

🌸 記得，水晶是您能量的放大鏡與守護者。保持正向的信念，與您的水晶夥伴建立連結，它將會以最美好的頻率守護著您。`;
      } else {
        newMessage = {
          role: 'user',
          parts: [{ text: userMessage }]
        };
      }
    } else if (messageType === 'image') {
      const messageId = event.message.id;
      console.log(`📸 Image message received. Downloading image from LINE (ID: ${messageId})...`);

      const stream = await blobClient.getMessageContent(messageId);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      console.log(`✅ Image downloaded successfully. Size: ${buffer.length} bytes.`);

      const base64Image = buffer.toString('base64');
      newMessage = {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: '老師，這是我拍的水晶照片，請幫我分析鑑定並詳細解說它的能量特徵、五行，以及它與我磁場的契合度。'
          }
        ]
      };
    }

    if (!isGuide) {
      // 3. Run the ADK Agent
      console.log(`🤖 Executing Crystal Expert ADK Agent for Session: ${sessionId}...`);
      const run = runner.runAsync({
        userId: userId,
        sessionId: sessionId,
        newMessage: newMessage
      });

      for await (const runEvent of run) {
        if (runEvent.errorCode) {
          throw new Error(runEvent.errorMessage || runEvent.errorCode);
        }
        
        if (runEvent.content?.parts) {
          for (const part of runEvent.content.parts) {
            if (part.text) {
              responseText += part.text;
            }
          }
        }
      }

      if (!responseText) {
        responseText = '🔮 (親愛的，我目前感受到的能量流動有些微弱，沒能完全解析。不妨多跟我分享一些關於你的生日星盤，或是其他水晶收藏，好讓我能為你做更深入的解讀。)';
      }

      // 4. Save the completed session to long-term memory
      console.log(`[Memory] Saving conversation session to memory bank...`);
      const updatedSession = await runner.sessionService.getSession({
        appName: 'CrystalAstrology',
        userId: userId,
        sessionId: sessionId
      });
      if (updatedSession) {
        await runner.memoryService.addSessionToMemory(updatedSession);
        console.log(`[Memory] Session successfully saved for User: ${userId}`);
      }
    }

    console.log(`🤖 Reply text preview: "${responseText.substring(0, 100)}..."`);
  } catch (err) {
    console.error('❌ Error executing ADK Agent or fetching Vertex AI:', err);
    responseText = `❌ 親愛的，目前能量連結稍微受到一些干擾，請稍後再試。訊息：${err.message || err}`;
  }

  // 5. Detect and parse Deity Dynamic Identity Tag for Icon Switch
  let deity = 'COSMOS';
  const deityRegex = /^\[DEITY:\s*([A-Z]+)\]\s*\n*/i;
  const match = responseText.match(deityRegex);
  if (match) {
    const matchedDeity = match[1].toUpperCase();
    if (DEITY_CONFIG[matchedDeity]) {
      deity = matchedDeity;
    }
    responseText = responseText.replace(deityRegex, '').trim();
    console.log(`✨ [IconSwitch] Detected dynamic deity switch: "${deity}"`);
  } else {
    console.log(`✨ [IconSwitch] No deity tag found. Falling back to default: "${deity}"`);
  }

  // 6. Generate follow-up Quick Replies
  let followUpQuestions = null;
  if (isGuide) {
    const userMsgText = event.message.type === 'text' ? event.message.text.trim() : '';
    if (userMsgText === '認識水晶') {
      followUpQuestions = [
        {
          type: 'action',
          action: {
            type: 'datetimepicker',
            label: '輸入生日',
            data: 'action=select_birthday',
            mode: 'date',
            initial: '2000-01-01',
            min: '1900-01-01',
            max: '2026-12-31'
          }
        },
        '如何鑑定我的水晶？',
        '天秤座適合戴什麼？'
      ];
    } else {
      followUpQuestions = [
        '我生日1995年10月12日',
        '如何鑑定我的水晶？',
        '天秤座適合戴什麼？'
      ];
    }
  } else {
    followUpQuestions = await generateFollowUpQuestions(responseText);
  }

  // Resolve dynamic URL for local images served via /static
  let iconUrl = DEITY_CONFIG[deity].iconUrl;
  if (!iconUrl.startsWith('http://') && !iconUrl.startsWith('https://')) {
    const baseUrl = req && req.baseUrlForIcons ? req.baseUrlForIcons : '';
    iconUrl = `${baseUrl}/static/${encodeURIComponent(iconUrl)}`;
  }

  // Send the reply back to the user on LINE with dynamic sender
  const replyMessage = {
    type: 'text',
    text: responseText,
    sender: {
      name: DEITY_CONFIG[deity].name,
      iconUrl: iconUrl
    }
  };

  if (followUpQuestions && followUpQuestions.length > 0) {
    replyMessage.quickReply = {
      items: followUpQuestions.map(item => {
        if (typeof item === 'string') {
          return {
            type: 'action',
            action: {
              type: 'message',
              label: item,
              text: item
            }
          };
        } else {
          return item;
        }
      })
    };
    console.log(`[QuickReply] Attached ${followUpQuestions.length} buttons to response.`);
  }

  try {
    console.log(`📨 Replying to LINE user: "${responseText.substring(0, 50)}..."`);
    const replyResult = await client.replyMessage({
      replyToken: event.replyToken,
      messages: [replyMessage]
    });
    console.log('✅ Reply sent successfully.');
    return replyResult;
  } catch (error) {
    console.error('❌ Error replying to LINE API:', error);
    throw error;
  }
}

// ==========================================
// 🚀 Start Server
// ==========================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`\n🚀 ==========================================`);
  console.log(`🔮 Crystal Expert LINE Bot Server listening on port ${PORT}`);
  console.log(`🔮 Loaded with Google ADK & PreloadMemoryTool`);
  console.log(`🔮 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🚀 ==========================================\n`);
});
