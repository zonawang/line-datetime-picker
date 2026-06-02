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
// 🧠 Custom Chinese-Compatible Memory Service
// ==========================================
class ChineseInMemoryMemoryService extends adk.InMemoryMemoryService {
  async searchMemory(req) {
    console.log(`[Memory] searchMemory triggered with query: "${req.query}"`);
    const userKey = `${req.appName}/${req.userId}`;
    if (!this.sessionEvents[userKey]) {
      console.log(`[Memory] No previous memories found for key: ${userKey}`);
      return { memories: [] };
    }
    const query = req.query.toLowerCase();
    const response = { memories: [] };
    
    for (const [sessId, sessionEvents] of Object.entries(this.sessionEvents[userKey])) {
      for (const event of sessionEvents) {
        if (!event.content?.parts?.length) {
          continue;
        }
        const joinedText = event.content.parts
          .map((part) => part.text)
          .filter((text) => !!text)
          .join(" ")
          .toLowerCase();

        // Substring-based matching strategy tailored for Traditional Chinese
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
          console.log(`[Memory] Match found in history: "${joinedText.substring(0, 50)}..."`);
          response.memories.push({
            content: event.content,
            author: event.author,
            timestamp: new Date(event.timestamp).toISOString()
          });
        }
      }
    }
    console.log(`[Memory] Returning ${response.memories.length} historical memory block(s).`);
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
const customMemoryService = new ChineseInMemoryMemoryService();

// Create the Crystal Expert (專業水晶占星專家) Agent
const crystalExpertAgent = new adk.LlmAgent({
  name: 'crystal-expert',
  model: llm,
  instruction: `
    你是一位精通水晶能量學、五行元素、七輪脈輪與西洋占星術的專業水晶占星專家（說話風格如同溫暖理性的「國師」唐綺陽，沈穩、專業、溫柔、深具洞察力與療癒感）。
    
    【核心規範與說話風格】
    1. 絕對不要自稱「神婆」或「巫婆」，你是一位專業且理性的占星與水晶能量諮詢專家。
    2. 語氣切勿過於活潑、浮誇或輕浮（不使用「哎呀」、「寶貝」、「哈哈」等口吻）。請保持從容、沈穩、優雅、溫和且客觀的語調，帶給使用者安心與信任感。
    3. 適度使用溫暖的關懷用語（例如「親愛的」、「你好，讓我們靜下心來看看...」），以同理心與療癒的角度切入，為使用者分析生活、事業或情感中的能量起伏。

    【專業分析能力】
    1. 結合使用者的「生日星盤（太陽/上升/月亮星座）」與「她所擁有的水晶收藏」，進行星座、宮位與礦物晶體共振的深入分析。
    2. 將行星逆行（如水逆）、星座星象位移，與水晶的特定脈輪（Chakra）或物理頻率作科學與心靈層面的結合，提供精確的日常開運與調和指引。
    3. 在對話回合前擁有「長效記憶功能」，主動知道使用者過去說過的生日或展示過的水晶收藏，絕對不要忘記！
    4. 當使用者詢問水晶搭配或今日運勢時，主動對照她已收集的水晶並做出客製化解讀。
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

// Health check endpoint
app.get('/', (req, res) => {
  res.send('LINE Crystal Astrology Expert Bot with Google ADK is running!');
});

// Webhook endpoint
app.post('/webhook', line.middleware(config), (req, res) => {
  if (!req.body || !req.body.events) {
    return res.status(400).send('No events found in request body.');
  }

  console.log(`🤖 Received ${req.body.events.length} webhook event(s) from LINE.`);

  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('❌ Error handling events:', err);
      res.status(500).end();
    });
});

// ==========================================
// 🎯 Event Handler
// ==========================================
async function handleEvent(event) {
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

  let responseText = '';
  let newMessage = null;

  try {
    // 1. Get or create session
    await runner.sessionService.getOrCreateSession({
      appName: 'CrystalAstrology',
      userId: userId,
      sessionId: sessionId
    });

    // 2. Prepare the input payload
    if (messageType === 'text') {
      const userMessage = event.message.text;
      console.log(`💬 User text content: "${userMessage}"`);
      newMessage = {
        role: 'user',
        parts: [{ text: userMessage }]
      };
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

    console.log(`🤖 Reply text preview: "${responseText.substring(0, 100)}..."`);
  } catch (err) {
    console.error('❌ Error executing ADK Agent or fetching Vertex AI:', err);
    responseText = `❌ 親愛的，目前能量連結稍微受到一些干擾，請稍後再試。訊息：${err.message || err}`;
  }

  // Send the reply back to the user on LINE
  const replyMessage = {
    type: 'text',
    text: responseText
  };

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
