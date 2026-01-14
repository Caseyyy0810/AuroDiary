import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import { generateDiary } from './ai.js';
import { extractLocationFromImage } from './imageProcessor.js';
import { saveToFeishu } from './feishu.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// 适配云平台端口：优先使用 process.env.PORT，默认使用 8080
const PORT = process.env.PORT || 8080;

console.log('正在启动服务器...');
console.log('当前运行目录:', __dirname);

// 确保上传目录存在（在云端建议使用 /tmp 或持久化卷，这里先保持本地）
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('成功创建上传目录:', uploadsDir);
  } catch (err) {
    console.error('创建上传目录失败:', err);
  }
}

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// 健康检查接口（云平台用于判断服务是否存活）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 单独的图片上传接口
app.post('/api/upload-photos', multer({ dest: os.tmpdir() }).array('photos', 10), async (req, res) => {
  try {
    const photos = req.files || [];
    const { location: defaultLocation } = req.body;

    const photosWithLocation = await Promise.all(
      photos.map(async (photo) => {
        const detectedLocation = await extractLocationFromImage(photo.path);
        
        // 云端临时处理：将文件复制到 uploads 目录（使用 copyFileSync + unlinkSync 避免跨分区移动失败）
        const finalName = Date.now() + '-' + photo.originalname.replace(/\s+/g, '_');
        const finalPath = path.join(uploadsDir, finalName);
        fs.copyFileSync(photo.path, finalPath);
        fs.unlinkSync(photo.path);

        return {
          filename: finalName,
          originalName: photo.originalname,
          path: `/uploads/${finalName}`,
          location: detectedLocation || defaultLocation || '未知地点'
        };
      })
    );

    res.json({ success: true, photos: photosWithLocation });
  } catch (error) {
    console.error('图片上传错误:', error);
    res.status(500).json({ error: '图片处理失败' });
  }
});

// 配置 multer 用于生成接口
const upload = multer({ dest: os.tmpdir() });

// 生成日记接口
app.post('/api/generate-diary', upload.array('photos', 10), async (req, res) => {
  try {
    const { location, date, description, diaryStyle, styleDescription } = req.body;
    const files = req.files || [];

    console.log(`收到生成请求: 风格=${diaryStyle}, 地点=${location}`);

    // 处理图片并移动到持久目录
    const photosWithLocation = await Promise.all(
      files.map(async (file) => {
        const detectedLocation = await extractLocationFromImage(file.path);
        const finalName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        const finalPath = path.join(uploadsDir, finalName);
        fs.copyFileSync(file.path, finalPath);
        fs.unlinkSync(file.path);
        
        return {
          filename: finalName,
          originalName: file.originalname,
          path: `/uploads/${finalName}`,
          location: detectedLocation || location || '未知地点'
        };
      })
    );

    const diaryContent = await generateDiary({
      location: location || '未指定',
      date: date || new Date().toLocaleDateString(),
      description,
      photos: photosWithLocation,
      diaryStyle: diaryStyle || '游记',
      styleDescription: styleDescription || ''
    });

    res.json({
      success: true,
      diary: {
        title: diaryContent.title,
        location: location || '未指定',
        date: date || new Date().toLocaleDateString(),
        content: diaryContent.content,
        photos: photosWithLocation
      }
    });
  } catch (error) {
    console.error('生成日记错误:', error);
    res.status(500).json({ error: '生成日记失败', message: error.message });
  }
});

// 保存到飞书接口
app.post('/api/save-to-feishu', async (req, res) => {
  try {
    const { title, date, location, content, photos } = req.body;
    const result = await saveToFeishu({ title, date, location, content, photos });
    res.json(result);
  } catch (error) {
    console.error('飞书保存接口错误:', error);
    res.status(500).json({ error: '保存到飞书失败', message: error.message });
  }
});

// 静态文件服务
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
  console.log('已启用前端静态文件托管');
} else {
  console.warn('警告: dist 目录不存在，前端页面将无法访问。请确保运行了 npm run build');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 服务器已成功启动!`);
  console.log(`监听地址: http://0.0.0.0:${PORT}`);
});
