const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!ACCESS_TOKEN || ACCESS_TOKEN.startsWith('your_')) {
  console.error('❌ Error: LINE_CHANNEL_ACCESS_TOKEN is not set or is still a placeholder in .env!');
  process.exit(1);
}

// 1. Define Main Rich Menu Configuration
// The left half (x:0, y:0, width:1250) switches to the five-grid rich menu.
// The right half (x:1250, y:0, width:1250) links to the external URL.
const mainRichMenuConfig = {
  size: {
    width: 2500,
    height: 1686
  },
  selected: true,
  name: "Crystal Astrology Main Rich Menu",
  chatBarText: "精靈選單",
  areas: [
    {
      bounds: {
        x: 0,
        y: 0,
        width: 1250,
        height: 1686
      },
      action: {
        type: "richmenuswitch",
        richMenuAliasId: "alias_five_grids",
        data: "switch-to-five-grids"
      }
    },
    {
      bounds: {
        x: 1250,
        y: 0,
        width: 1250,
        height: 1686
      },
      action: {
        type: "uri",
        uri: "https://github.com/zonawang/zona-ai-learning-lab"
      }
    }
  ]
};

// 2. Define Five Grids Rich Menu Configuration
// This corresponds to 五宮格.png (resized to 2500x1686).
// Row 1 (y:0 to 674) - Left: "閱讀指南", Right: "認識水晶"
// Row 2 (y:674 to 1348) - Left: "淨化方法", Right: "功效與佩戴"
// Row 3 (y:1348 to 1686) - Full width: "回到上一頁" (switches back to main menu)
const fiveGridsRichMenuConfig = {
  size: {
    width: 2500,
    height: 1686
  },
  selected: false,
  name: "Crystal Astrology Five Grids Rich Menu",
  chatBarText: "指南與介紹",
  areas: [
    {
      bounds: {
        x: 0,
        y: 0,
        width: 1250,
        height: 674
      },
      action: {
        type: "message",
        text: "閱讀指南"
      }
    },
    {
      bounds: {
        x: 1250,
        y: 0,
        width: 1250,
        height: 674
      },
      action: {
        type: "message",
        text: "認識水晶"
      }
    },
    {
      bounds: {
        x: 0,
        y: 674,
        width: 1250,
        height: 674
      },
      action: {
        type: "message",
        text: "淨化方法"
      }
    },
    {
      bounds: {
        x: 1250,
        y: 674,
        width: 1250,
        height: 674
      },
      action: {
        type: "message",
        text: "功效與佩戴"
      }
    },
    {
      bounds: {
        x: 0,
        y: 1348,
        width: 2500,
        height: 338
      },
      action: {
        type: "richmenuswitch",
        richMenuAliasId: "alias_main_menu",
        data: "switch-to-main-menu"
      }
    }
  ]
};

// Helper function to handle LINE API requests
async function lineApi(endpoint, method = 'GET', body = null, isBinary = false, contentType = 'application/json') {
  const headers = {
    'Authorization': `Bearer ${ACCESS_TOKEN}`
  };
  if (!isBinary && contentType) {
    headers['Content-Type'] = contentType;
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = isBinary ? body : JSON.stringify(body);
  }

  const response = await fetch(`https://api.line.me${endpoint}`, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API Error [${method} ${endpoint}]: ${response.status} ${errorText}`);
  }
  return response.json().catch(() => ({}));
}

// Helper to upload image to rich menu
async function uploadRichMenuImage(richMenuId, imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found at path: ${imagePath}`);
  }
  const imageBuffer = fs.readFileSync(imagePath);
  
  const isJpg = imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg');
  const contentType = isJpg ? 'image/jpeg' : 'image/png';
  
  const headers = {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': contentType
  };

  const response = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers,
    body: imageBuffer
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload rich menu image [${richMenuId}]: ${response.status} ${errorText}`);
  }
  console.log(`✅ Uploaded image successfully for Rich Menu ID: ${richMenuId}`);
}

async function run() {
  try {
    console.log('🔮 Starting Dual Rich Menu and Switch Aliases setup... 🔮');

    // 1. Create Main Rich Menu
    console.log('\n🚀 [Step 1/8] Creating Main Rich Menu...');
    const mainRichMenu = await lineApi('/v2/bot/richmenu', 'POST', mainRichMenuConfig);
    const mainRichMenuId = mainRichMenu.richMenuId;
    console.log(`✅ Main Rich Menu created successfully! ID: ${mainRichMenuId}`);

    // 2. Upload Main Rich Menu Image
    console.log('\n🚀 [Step 2/8] Uploading Main Rich Menu image...');
    const mainImagePath = path.join(__dirname, 'richmenu_resized.jpg');
    await uploadRichMenuImage(mainRichMenuId, mainImagePath);

    // 3. Create Five Grids Rich Menu
    console.log('\n🚀 [Step 3/8] Creating Five Grids Rich Menu...');
    const fiveGridsRichMenu = await lineApi('/v2/bot/richmenu', 'POST', fiveGridsRichMenuConfig);
    const fiveGridsRichMenuId = fiveGridsRichMenu.richMenuId;
    console.log(`✅ Five Grids Rich Menu created successfully! ID: ${fiveGridsRichMenuId}`);

    // 4. Upload Five Grids Rich Menu Image
    console.log('\n🚀 [Step 4/8] Uploading Five Grids Rich Menu image...');
    const fiveGridsImagePath = path.join(__dirname, '五宮格_resized.jpg');
    await uploadRichMenuImage(fiveGridsRichMenuId, fiveGridsImagePath);

    // 5. Clean up existing aliases if they exist to prevent name conflicts
    console.log('\n🚀 [Step 5/8] Cleaning up existing aliases if they exist...');
    
    try {
      await fetch(`https://api.line.me/v2/bot/richmenu/alias/alias_main_menu`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      });
      console.log('🧹 Cleaned up existing "alias_main_menu"');
    } catch (e) {
      // Ignore if it doesn't exist
    }

    try {
      await fetch(`https://api.line.me/v2/bot/richmenu/alias/alias_five_grids`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      });
      console.log('🧹 Cleaned up existing "alias_five_grids"');
    } catch (e) {
      // Ignore if it doesn't exist
    }

    // 6. Create alias_main_menu pointing to Main Rich Menu
    console.log('\n🚀 [Step 6/8] Creating alias "alias_main_menu" pointing to Main Rich Menu...');
    await lineApi('/v2/bot/richmenu/alias', 'POST', {
      richMenuAliasId: "alias_main_menu",
      richMenuId: mainRichMenuId
    });
    console.log('✅ Alias "alias_main_menu" registered successfully!');

    // 7. Create alias_five_grids pointing to Five Grids Rich Menu
    console.log('\n🚀 [Step 7/8] Creating alias "alias_five_grids" pointing to Five Grids Rich Menu...');
    await lineApi('/v2/bot/richmenu/alias', 'POST', {
      richMenuAliasId: "alias_five_grids",
      richMenuId: fiveGridsRichMenuId
    });
    console.log('✅ Alias "alias_five_grids" registered successfully!');

    // 8. Set Main Rich Menu as default
    console.log('\n🚀 [Step 8/8] Setting Main Rich Menu as default for all users...');
    const setDefaultResponse = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${mainRichMenuId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });

    if (!setDefaultResponse.ok) {
      const errorText = await setDefaultResponse.text();
      throw new Error(`Failed to set default rich menu: ${setDefaultResponse.status} ${errorText}`);
    }

    console.log('✅ Main Rich Menu set as default for all users!');
    console.log('\n🎉 BOTH RICH MENUS CREATED, LINKED, AND SET UP SUCCESSFULLY! 🎉');
    console.log(`ℹ️  Main Menu ID: ${mainRichMenuId}`);
    console.log(`ℹ️  Five Grids Menu ID: ${fiveGridsRichMenuId}`);
  } catch (error) {
    console.error('\n❌ Error occurred during setup:', error.message);
    process.exit(1);
  }
}

run();
