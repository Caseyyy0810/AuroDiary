import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();

export async function generateDiary({ location, date, description, photos, diaryStyle, styleDescription, mode = 'ai', title = '' }) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API Key 未配置，请在 .env 文件中设置 DEEPSEEK_API_KEY');
  }
  
  // 验证 API Key 格式（DeepSeek API Key 通常以 sk- 开头）
  if (!DEEPSEEK_API_KEY.startsWith('sk-')) {
    throw new Error('API Key 格式不正确。DeepSeek API Key 应该以 "sk-" 开头。请检查 .env 文件中的配置。');
  }

  let systemPrompt = '';
  let userPrompt = '';

  if (mode === 'polish') {
    // 润色模式
    systemPrompt = `你是一个专业的日记润色助手。用户的任务是根据他写的一段原话，进行文学润色，使其更符合【${diaryStyle}】风格（核心要求：${styleDescription}）。
要求：
1. 保持用户原意，不要虚构不存在的事实。
2. 优化语言表达，使其更自然、生动。
3. 如果用户提供了标题，请优化它；如果没提供，请根据内容起一个。
4. 必须包含用户提到的关键信息（时间、地点、事件）。
5. 必须在正文中合理插入 [图片n] 标签（n为照片索引，从1开始），每张照片仅限一次。`;

    userPrompt = `请润色以下日记内容：
日期：${date}
地点：${location}
原定标题：${title || '无'}
用户原文：${description}
${photos.length > 0 ? `照片信息：${photos.map((p, i) => `图片${i+1} (${p.originalName})`).join('; ')}` : ''}

请严格按照以下格式输出：
标题：润色后的标题
正文：润色后的正文`;
  } else {
    // 自动生成模式 (默认)
    systemPrompt = `你是一个多才多艺的日记写手。根据用户提供的信息，生成一篇极具感染力的内容。要求：
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

    userPrompt = `请根据以下信息生成一篇日记：

日期：${date}
地点：${location}
用户描述：${description}
${photos.length > 0 ? `照片信息：${photosDescription}` : ''}
日记风格：${diaryStyle}

请严格按照以下格式生成日记（每行单独显示）：
标题：你的标题
正文：你的正文内容
    
正文要生动形象，包含关键信息以便以后回忆。`;
  }

  try {
    const response = await axios.post(DEEPSEEK_API_URL, {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    });

    const data = response.data;
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 响应格式错误');
    }

    const content = data.choices[0].message.content;
    
    // 解析标题和正文 - 更健壮的解析
    let diaryTitle = '今日日记';
    let diaryBody = content;
    
    // 尝试提取标题
    const titleMatch = content.match(/标题[：:]\s*([^\n]+)/);
    if (titleMatch) {
      diaryTitle = titleMatch[1].trim();
    }
    
    // 尝试提取正文
    const bodyMatch = content.match(/正文[：:]\s*([\s\S]+)/);
    if (bodyMatch) {
      diaryBody = bodyMatch[1].trim();
    } else {
      // 如果没有找到"正文："标记，移除标题行，剩余作为正文
      diaryBody = content.replace(/标题[：:].+?(?:\n|$)/, '').trim();
    }

    return {
      title: diaryTitle || '今日日记',
      content: diaryBody || content
    };

  } catch (error) {
    console.error('DeepSeek API 调用错误:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error?.message || error.message;
    throw new Error(errorMessage);
  }
}
}
