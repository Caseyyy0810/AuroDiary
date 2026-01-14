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
                let finalWidth = 400; // 默认宽度
                let finalHeight = 300; // 默认高度
                
                try {
                  // 尝试获取尺寸数据
                  const dims = await exifr.parse(localPath, true);
                  
                  // exifr 在某些格式下返回不同的字段，我们要多方检查
                  const originalWidth = dims?.ExifImageWidth || dims?.PixelXDimension || dims?.ImageWidth || 0;
                  const originalHeight = dims?.ExifImageHeight || dims?.PixelYDimension || dims?.ImageHeight || 0;
                  
                  if (originalWidth > 0 && originalHeight > 0) {
                    const ratio = originalHeight / originalWidth;
                    // 以 Word 页面常用宽度 450 为基准
                    finalWidth = 450;
                    finalHeight = Math.round(finalWidth * ratio);
                    
                    // 如果高度太夸张（比如超长手机截图），进行二次限制
                    if (finalHeight > 600) {
                      finalHeight = 600;
                      finalWidth = Math.round(finalHeight / ratio);
                    }
                  }
                  console.log(`图片尺寸识别成功: ${originalWidth}x${originalHeight} -> 适配为: ${finalWidth}x${finalHeight}`);
                } catch (sizeErr) {
                  console.warn('获取图片尺寸失败，使用默认大小:', sizeErr.message);
                  // 失败了保持 400x300 的默认值，保证图片不消失
                }

                children.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new ImageRun({
                        data: imageBuffer,
                        transformation: {
                          width: finalWidth,
                          height: finalHeight,
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
