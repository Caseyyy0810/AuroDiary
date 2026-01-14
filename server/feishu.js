import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取飞书 Access Token
async function getTenantAccessToken() {
  const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
  const response = await axios.post(url, {
    app_id: process.env.FEISHU_APP_ID,
    app_secret: process.env.FEISHU_APP_SECRET,
  });
  return response.data.tenant_access_token;
}

// 上传图片到飞书（获取 file_token）
async function uploadImageToFeishu(token, filePath) {
  const url = 'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all';
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file_name', fileName);
  form.append('parent_type', 'bitable_image');
  form.append('parent_node', process.env.FEISHU_APP_TOKEN);
  form.append('size', stats.size);
  form.append('file', fs.createReadStream(filePath));

  const response = await axios.post(url, form, {
    headers: {
      'Authorization': `Bearer ${token}`,
      ...form.getHeaders(),
    },
  });

  if (response.data.code !== 0) {
    throw new Error(`图片上传飞书失败: ${response.data.msg}`);
  }

  return response.data.data.file_token;
}

export async function saveToFeishu({ title, date, location, content, photos }) {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET || !process.env.FEISHU_APP_TOKEN || !process.env.FEISHU_TABLE_ID) {
    throw new Error('飞书配置不完整，请检查 .env 文件');
  }

  try {
    const token = await getTenantAccessToken();

    // 1. 先上传所有图片到飞书
    const photoTokens = [];
    for (const photo of photos) {
      // photo.path 可能是 /uploads/xxx.jpg，需要转为绝对路径
      const localPath = path.join(__dirname, '..', photo.path);
      if (fs.existsSync(localPath)) {
        const fileToken = await uploadImageToFeishu(token, localPath);
        photoTokens.push({ file_token: fileToken });
      }
    }

    // 2. 写入多维表格
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records`;
    
    const recordData = {
      fields: {
        '标题': title,
        '日期': new Date(date).getTime(), // 飞书日期字段接收时间戳（毫秒）
        '地点': location, // 恢复为直接传入字符串
        '日记正文': content,
        '照片': photoTokens
      }
    };

    console.log('发送给飞书的最终数据包:', JSON.stringify(recordData, null, 2));

    const response = await axios.post(url, recordData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    if (response.data.code !== 0) {
      throw new Error(`写入飞书多维表格失败: ${response.data.msg}`);
    }

    return { success: true, recordId: response.data.data.record.record_id };
  } catch (error) {
    console.error('飞书保存失败:', error.response?.data || error.message);
    throw error;
  }
}
