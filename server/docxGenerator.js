import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } from 'docx';
import fs from 'fs';
import path from 'path';
import sizeOf from 'image-size'; // 使用更稳定的尺寸识别工具

export async function generateDocx({ title, date, location, content, photos, uploadsDir }) {
  console.log('开始生成 Word 文档...', { title, photosCount: photos?.length });
  
  try {
    const children = [
      new Paragraph({
        text: title || '无标题',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
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
                
                // --- 核心修复：精准计算比例 ---
                const dimensions = sizeOf(localPath);
                const originalWidth = dimensions.width || 400;
                const originalHeight = dimensions.height || 300;
                
                // 计算比例
                const ratio = originalHeight / originalWidth;
                
                // Word 页面标准宽度约为 450 磅 (Points)
                let finalWidth = 450;
                let finalHeight = Math.round(finalWidth * ratio);
                
                // 如果高度过长，进行等比例限制
                if (finalHeight > 600) {
                  finalHeight = 600;
                  finalWidth = Math.round(finalHeight / ratio);
                }

                console.log(`Word图片适配: ${originalWidth}x${originalHeight} -> ${finalWidth}x${finalHeight} (比例保持不变)`);

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
                // --- 修复结束 ---

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

    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    return buffer;
  } catch (err) {
    console.error('docxGenerator 内部错误:', err);
    throw err;
  }
}
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
