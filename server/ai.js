import dotenv from 'dotenv';

dotenv.config();

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();

export async function generateDiary({ location, date, description, photos, diaryStyle, styleDescription }) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API Key 未配置，请在 .env 文件中设置 DEEPSEEK_API_KEY');
  }
  
  // 验证 API Key 格式（DeepSeek API Key 通常以 sk- 开头）
  if (!DEEPSEEK_API_KEY.startsWith('sk-')) {
    throw new Error('API Key 格式不正确。DeepSeek API Key 应该以 "sk-" 开头。请检查 .env 文件中的配置。');
  }

  const systemPrompt = `你是一个多才多艺的日记写手。根据用户提供的信息，生成一篇极具感染力的内容。要求：
1. 严格遵守用户选择的【${diaryStyle}】风格，其核心要求是：${styleDescription}
2. 语言要生动形象，富有情感，避免机械化的陈述。
3. 包含关键信息（时间、地点、人物、事件），用于以后长久的回忆。
4. 日记要有标题和正文两部分。
5. 正文要自然地融入日期、地点、照片等信息。
6. 在正文中，如果提到某个照片，请用 "[图片n]" 的形式（n为照片的索引，从1开始）来指代照片。
7. 每张照片在正文中只能被指代一次。`;

  const photosDescription = photos.map((photo, index) => 
    `图片${index + 1} (${photo.originalName})，地点: ${photo.location || '未识别'}`
  ).join('； ');

  const userPrompt = `请根据以下信息生成一篇日记：

日期：${date}
地点：${location}
用户描述：${description}
${photos.length > 0 ? `照片信息：${photosDescription}` : ''}
日记风格：${diaryStyle}

请严格按照以下格式生成日记（每行单独显示）：
标题：你的标题
正文：你的正文内容

正文要生动形象，包含关键信息以便以后回忆。`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      let errorMessage = `API 请求失败: ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorData);
        if (errorJson.error) {
          if (response.status === 401) {
            errorMessage = 'API Key 无效或已过期。请检查：\n1. .env 文件中的 DEEPSEEK_API_KEY 是否正确\n2. API Key 是否完整（通常以 sk- 开头）\n3. API Key 是否在 DeepSeek 平台中仍然有效\n4. 如果修改了 .env 文件，请重启服务器';
          } else {
            errorMessage = errorJson.error.message || errorMessage;
          }
        }
      } catch (e) {
        errorMessage += ` - ${errorData}`;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 响应格式错误');
    }

    const content = data.choices[0].message.content;
    
    // 解析标题和正文 - 更健壮的解析
    let title = '今日日记';
    let body = content;
    
    // 尝试提取标题
    const titleMatch = content.match(/标题[：:]\s*([^\n]+)/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    
    // 尝试提取正文
    const bodyMatch = content.match(/正文[：:]\s*([\s\S]+)/);
    if (bodyMatch) {
      body = bodyMatch[1].trim();
    } else {
      // 如果没有找到"正文："标记，移除标题行，剩余作为正文
      body = content.replace(/标题[：:].+?(?:\n|$)/, '').trim();
    }

    return {
      title: title || '今日日记',
      content: body || content
    };

  } catch (error) {
    console.error('DeepSeek API 调用错误:', error);
    throw error;
  }
}
