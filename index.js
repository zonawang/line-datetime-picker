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

// Create the Crystal Sorceress (水晶占卜神婆) Agent
const crystalSorceressAgent = new adk.LlmAgent({
  name: 'crystal-sorceress',
  model: llm,
  instruction: `
    你是一位精通水晶能量學、五行磁場學與西洋占星術的台灣在地「水晶占卜神婆」。
    
    【說話風格與語氣】
    1. 一律使用親切、溫柔、有時帶點神祕感且活潑熱情的繁體中文（台灣繁體）。
    2. 多多使用台灣在地用語，例如：「親愛的」、「寶貝」、「招桃花」、「避邪避小人」、「水逆」、「磁場」、「正能量」。
    3. 口吻要像一個經驗豐富、慈祥且樂觀的占卜神婆，多用關懷的句子。

    【核心能力】
    1. 你能自動結合使用者的生日（星座/命盤）與她收集過的水晶（例如：粉晶、紫水晶、綠幽靈等）來提供完美的每日能量占卜、開運穿搭與水晶磁場搭配建議。
    2. 你在對話回合前擁有「長效記憶功能」，能主動知道使用者過去說過的生日或展示過的水晶收藏，絕對不要忘記！
    3. 當使用者詢問水晶搭配或今日運勢時，主動對照她已收集的水晶並做出客製化解讀。
  `,
  // 核心：PreloadMemoryTool 只要一行，即可自動在回合開始前預載所有歷史相關對話
  tools: [adk.PRELOAD_MEMORY]
});

// Create the ADK Runner to manage sessions, state, and memory
const runner = new adk.Runner({
  appName: 'CrystalSorceress',
  agent: crystalSorceressAgent,
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
  res.send('LINE Crystal Sorceress Bot with Google ADK is running!');
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
      appName: 'CrystalSorceress',
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
            text: '神婆，這是我拍的水晶照片，請幫我分析鑑定並詳細解說它的能量特徵、五行，以及它與我磁場的契合度。'
          }
        ]
      };
    }

    // 3. Run the ADK Agent
    console.log(`🤖 Executing Crystal Sorceress ADK Agent for Session: ${sessionId}...`);
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
      responseText = '🔮 (親愛的，神婆感受到了微弱的磁場波動，但沒能看清命盤呢... 請再跟神婆多說說妳的水晶或生日吧！)';
    }

    // 4. Save the completed session to long-term memory
    console.log(`[Memory] Saving conversation session to memory bank...`);
    const updatedSession = await runner.sessionService.getSession({
      appName: 'CrystalSorceress',
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
    responseText = `❌ 哎呀親愛的，宇宙磁場好像有點干擾：${err.message || err}`;
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
  console.log(`🔮 Crystal Sorceress LINE Bot Server listening on port ${PORT}`);
  console.log(`🔮 Loaded with Google ADK & PreloadMemoryTool`);
  console.log(`🔮 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🚀 ==========================================\n`);
});
