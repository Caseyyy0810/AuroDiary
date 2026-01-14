import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } from 'docx';
import fs from 'fs';
import path from 'path';
import exifr from 'exifr';

export async function generateDocx({ title, date, location, content, photos, uploadsDir }) {
  console.log('开始生成 Word 文档...', { title, photosCount: photos?.length });
  
  try {
    // 1. 准备所有段落内容
    const children = [
      // 标题
      new Paragraph({
        text: title || '无标题',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      // 元数据
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `日期：${date || '未设置'}`, color: "666666" }),
          new TextRun({ text: "    " }),
          new TextRun({ text: `地点：${location || '未设置'}`, color: "666666" }),
        ],
        spacing: { after: 400 },
      }),
    ];

    // 2. 解析正文并插入图片
    if (content) {
      const parts = content.split(/(\[图片\d+\])/g);

      for (const part of parts) {
        const photoMatch = part.match(/\[图片(\d+)\]/);
        if (photoMatch) {
          const photoIndex = parseInt(photoMatch[1], 10) - 1;
          const photo = photos && photos[photoIndex];
          
          if (photo && photo.path) {
            const fileName = path.basename(photo.path);
            const localPath = path.join(uploadsDir, fileName);

            if (fs.existsSync(localPath)) {
              try {
                const imageBuffer = fs.readFileSync(localPath);
                
                // 获取图片原始尺寸以计算比例，防止变形
                let width = 450; // 默认宽度
                let height = 300; // 默认高度
                
                try {
                  const dims = await exifr.parse(localPath, [
                    'PixelXDimension', 
                    'PixelYDimension', 
                    'ExifImageWidth', 
                    'ExifImageHeight'
                  ]);
                  
                  const originalWidth = dims?.PixelXDimension || dims?.ExifImageWidth || 0;
                  const originalHeight = dims?.PixelYDimension || dims?.ExifImageHeight || 0;
                  
                  if (originalWidth && originalHeight) {
                    const ratio = originalHeight / originalWidth;
                    // 以最大宽度 450px 为基准
                    width = 450;
                    height = Math.round(width * ratio);
                    
                    // 如果高度太长（比如竖屏长图），限制一下高度
                    if (height > 600) {
                      height = 600;
                      width = Math.round(height / ratio);
                    }
                  }
                } catch (sizeErr) {
                  console.warn('获取图片尺寸失败，使用默认大小:', sizeErr);
                }

                children.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new ImageRun({
                        data: imageBuffer,
                        transformation: {
                          width: width,
                          height: height,
                        },
                      }),
                    ],
                    spacing: { before: 200, after: 100 },
                  })
                );
                if (photo.location) {
                  children.push(
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({ text: `📍 ${photo.location}`, size: 20, color: "4fc3f7" }),
                      ],
                      spacing: { after: 200 },
                    })
                  );
                }
              } catch (err) {
                console.error('Word插入图片失败:', err);
              }
            } else {
              console.warn('Word生成：图片文件不存在:', localPath);
            }
          }
        } else if (part.trim()) {
          const lines = part.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: line.trim(), size: 28 }),
                  ],
                  spacing: { after: 150 },
                })
              );
            }
          }
        }
      }
    }

    // 3. 创建文档
    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });

    // 4. 打包文档
    const buffer = await Packer.toBuffer(doc);
    console.log('Word 文档生成成功，Buffer 长度:', buffer.length);
    return buffer;
  } catch (err) {
    console.error('docxGenerator 内部错误:', err);
    throw err;
  }
}
