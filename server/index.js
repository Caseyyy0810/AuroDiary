import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { generateDiary } from './ai.js';
import { extractLocationFromImage } from './imageProcessor.js';
import { saveToFeishu } from './feishu.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// 确保上传目录存在
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// 定义 dist 目录路径
const distPath = path.join(__dirname, '../dist');

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 单独的图片上传接口（用于编辑模式）
app.post('/api/upload-photos', upload.array('photos', 10), async (req, res) => {
  try {
    const photos = req.files || [];
    const { location: defaultLocation } = req.body;

    const photosWithLocation = await Promise.all(
      photos.map(async (photo) => {
        const imagePath = photo.path;
        const detectedLocation = await extractLocationFromImage(imagePath);
        
        return {
          filename: photo.filename,
          originalName: photo.originalname,
          path: `/uploads/${photo.filename}`,
          location: detectedLocation || defaultLocation || '未知地点'
        };
      })
    );

    res.json({
      success: true,
      photos: photosWithLocation
    });
  } catch (error) {
    console.error('图片上传错误:', error);
    res.status(500).json({ error: '图片处理失败' });
  }
});

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('只支持图片格式 (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// 生成日记接口
app.post('/api/generate-diary', upload.array('photos', 10), async (req, res) => {
  try {
    const { location, date, description, diaryStyle, styleDescription } = req.body;
    const photos = req.files || [];

    console.log(`收到生成请求: 风格=${diaryStyle}, 地点=${location}`);

    if (!description) {
      return res.status(400).json({ error: '请提供文字描述' });
    }

    // 处理每张图片，提取地点信息
    const photosWithLocation = await Promise.all(
      photos.map(async (photo) => {
        const imagePath = photo.path;
        const detectedLocation = await extractLocationFromImage(imagePath);
        
        return {
          filename: photo.filename,
          originalName: photo.originalname,
          path: `/uploads/${photo.filename}`,
          location: detectedLocation || location || '未知地点'
        };
      })
    );

    // 调用 AI 生成日记
    const diaryContent = await generateDiary({
      location: location || '未指定',
      date: date || new Date().toLocaleDateString(),
      description,
      photos: photosWithLocation,
      diaryStyle: diaryStyle || '游记',
      styleDescription: styleDescription || ''
    });

    // 返回结果
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
    res.status(500).json({ 
      error: '生成日记失败', 
      message: error.message 
    });
  }
});

// 保存到飞书接口
app.post('/api/save-to-feishu', async (req, res) => {
  try {
    const { title, date, location, content, photos } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }

    const result = await saveToFeishu({ title, date, location, content, photos });
    res.json(result);
  } catch (error) {
    console.error('飞书保存接口错误:', error);
    res.status(500).json({ 
      error: '保存到飞书失败', 
      message: error.message 
    });
  }
});

// 静态文件服务 - 生产环境托管前端打包后的文件
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    // 排除 API 路由
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
