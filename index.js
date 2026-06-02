const express = require('express');
const line = require('@line/bot-sdk');
const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

// Verify environmental variables are loaded
if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
  console.error('⚠️  [Error] Environment variables LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET are not set!');
  console.error('⚠️  Please check if you have copied .env.example to .env and filled in the real tokens.');
}

if (!process.env.GCP_PROJECT) {
  console.warn('⚠️  [Warning] GCP_PROJECT is not set! When deploying on Cloud Run, this can be auto-detected, but is recommended for local development.');
}

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'placeholder_token',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'placeholder_secret',
};

// Initialize Vertex AI Client
const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT,
  location: process.env.GCP_LOCATION || 'us-central1'
});

const modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';
const model = vertexAI.getGenerativeModel({
  model: modelName,
  systemInstruction: {
    role: 'system',
    parts: [{ text: '你是一個親切的 LINE 機器人助理。請一律使用繁體中文（台灣繁體）來回答使用者的問題，並多使用台灣常見的生活用語與友善口吻。' }]
  }
});

// Create LINE SDK Messaging API Client (V9+ style)
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

// Create LINE SDK Blob Client for handling binary/media downloads
const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken
});

const app = express();

// Health check endpoint
app.get('/', (req, res) => {
  res.send('LINE Echo Bot is running! Use POST /webhook for LINE webhook events.');
});

// Register a webhook handler
// Note: line.middleware needs the raw body to verify signature, 
// so do NOT use express.json() middleware BEFORE this route.
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

// Event handler for incoming LINE events
async function handleEvent(event) {
  // We only care about message events
  if (event.type !== 'message') {
    console.log(`👉 Event ignored: [${event.type}] type event.`);
    return null;
  }

  // We support 'text' and 'image' message types
  if (event.message.type !== 'text' && event.message.type !== 'image') {
    console.log(`👉 Message event ignored: Non-supported message type [${event.message.type}].`);
    return null;
  }

  const userId = event.source.userId;
  const messageType = event.message.type;
  console.log(`💬 Received message from User (${userId}) of type: ${messageType}`);

  let responseText = '';

  try {
    if (messageType === 'text') {
      const userMessage = event.message.text;
      console.log(`💬 Text message content: "${userMessage}"`);

      console.log(`🤖 Calling Vertex AI API (Model: ${modelName})...`);
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }]
      });

      responseText = parseVertexAIResponse(result);
    } else if (messageType === 'image') {
      const messageId = event.message.id;
      console.log(`📸 Image message ID: ${messageId}. Downloading content...`);

      // Download the image content stream from LINE API using the Blob client
      const stream = await blobClient.getMessageContent(messageId);
      
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      console.log(`✅ Image downloaded successfully. Size: ${buffer.length} bytes.`);

      const base64Image = buffer.toString('base64');

      console.log(`🤖 Calling Vertex AI API with Image (Model: ${modelName})...`);
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg', // Standard JPEG for LINE photos
                  data: base64Image
                }
              },
              {
                text: '請根據這張照片提供詳細訊息、分析照片中的內容，並向我做出親切詳細的繁體中文解釋。'
              }
            ]
          }
        ]
      });

      responseText = parseVertexAIResponse(result);
    }
    
    console.log(`🤖 Vertex AI response: "${responseText.substring(0, 100)}..."`);
  } catch (apiError) {
    console.error('❌ Error processing request with Vertex AI:', apiError);
    responseText = `❌ 處理請求發生錯誤：${apiError.message || apiError}`;
  }

  // Create response message with Gemini's response
  const aiResponse = {
    type: 'text',
    text: responseText
  };

  try {
    console.log(`📨 Replying to user: "${responseText.substring(0, 50)}..."`);
    // Reply using the replyToken
    const replyResult = await client.replyMessage({
      replyToken: event.replyToken,
      messages: [aiResponse]
    });
    console.log('✅ Reply sent successfully.');
    return replyResult;
  } catch (error) {
    console.error('❌ Error replying message:', error);
    throw error;
  }
}

// Helper function to parse Vertex AI response safely
function parseVertexAIResponse(result) {
  if (
    result.response &&
    result.response.candidates &&
    result.response.candidates[0] &&
    result.response.candidates[0].content &&
    result.response.candidates[0].content.parts &&
    result.response.candidates[0].content.parts[0]
  ) {
    return result.response.candidates[0].content.parts[0].text;
  } else {
    return '🤖 (Vertex AI 沒有生成任何回應內容)';
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 ==========================================`);
  console.log(`🚀 LINE Echo Bot server is listening on port ${PORT}`);
  console.log(`🚀 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🚀 ==========================================\n`);
});
