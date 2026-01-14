# AuroDiary - AI日记本

一个基于 DeepSeek API 的智能日记应用，用户可以上传照片和输入文字，AI 自动生成生动形象的日记。

## 功能特点

- 📸 上传多张照片
- 📍 输入地点信息
- ✍️ 输入文字描述
- 🤖 AI 自动生成拟人化的日记内容
- 📱 移动端适配

## 技术栈

- 前端：React + Vite
- 后端：Node.js + Express
- AI：DeepSeek API
- 图片处理：Multer + ExifReader

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量：
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 DeepSeek API Key
```

3. 运行开发服务器：
```bash
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

## 使用说明

1. 上传照片（可选，可多张）
2. 输入地点
3. 输入文字描述
4. 点击生成日记
5. AI 会根据照片和描述生成一篇生动的日记
