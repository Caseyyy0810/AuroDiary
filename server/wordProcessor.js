import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } from 'docx';
import fs from 'fs';
import path from 'path';

export async function generateDocx({ title, date, location, content, photos }) {
  // 创建文档
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // 标题
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          // 日期和地点
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `📅 ${date}    📍 ${location}`, color: "666666", size: 24 }),
            ],
            spacing: { after: 600 },
          }),
          // 正文
          ...await processContent(content, photos),
        ],
      },
    ],
  });

  // 生成 Buffer
  return await Packer.toBuffer(doc);
}

async function processContent(content, photos) {
  const children = [];
  const parts = content.split(/(\[图片\d+\])/g);
  const usedPhotoIndices = new Set();

  for (const part of parts) {
    const photoMatch = part.match(/\[图片(\d+)\]/);
    if (photoMatch) {
      const photoIndex = parseInt(photoMatch[1], 10) - 1;
      const photo = photos[photoIndex];
      
      if (photo && !usedPhotoIndices.has(photoIndex)) {
        usedPhotoIndices.add(photoIndex);
        try {
          // 获取图片绝对路径
          // 注意：在 Render 上，图片存在 os.tmpdir() 中，photo.path 是 '/uploads/xxx'
          // 我们需要提取文件名并在正确目录查找
          const fileName = path.basename(photo.path);
          const uploadsDir = process.env.NODE_ENV === 'production' 
            ? path.join(import.meta.dirname, '../../../../tmp/aurodiary_uploads') // 这是一个估计路径，稍后在 index.js 中统一
            : path.join(process.cwd(), 'uploads');
          
          // 更稳妥的方式是从 photo.path 映射，但我们需要知道 uploadsDir
          // 这里我们假设传入的 photos 已经包含完整本地路径或者我们能推导出来
          // 为了简单起见，我们在 index.js 调用时处理好路径
          const localPath = photo.localPath; 

          if (fs.existsSync(localPath)) {
            const imageBuffer = fs.readFileSync(localPath);
            
            children.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: imageBuffer,
                    transformation: {
                      width: 450,
                      height: 300,
                    },
                  }),
                ],
                spacing: { before: 400, after: 100 },
              })
            );

            if (photo.location) {
              children.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: `📍 ${photo.location}`, color: "4fc3f7", size: 18 }),
                  ],
                  spacing: { after: 400 },
                })
              );
            }
          }
        } catch (err) {
          console.error('Word 生成中插入图片失败:', err);
        }
      }
    } else if (part.trim()) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: part.trim(), size: 28 }),
          ],
          spacing: { after: 300 },
          alignment: AlignmentType.LEFT,
        })
      );
    }
  }

  return children;
}
