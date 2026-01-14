import exifr from 'exifr';

export async function extractLocationFromImage(imagePath) {
  try {
    const exifData = await exifr.parse(imagePath, {
      gps: true,
      translateKeys: false,
      translateValues: false,
    });

    if (exifData && exifData.latitude && exifData.longitude) {
      // 如果有GPS坐标，可以返回坐标或进行逆地理编码
      // 这里简单返回坐标字符串，实际可以调用地图API获取地点名称
      return `${exifData.latitude.toFixed(6)}, ${exifData.longitude.toFixed(6)}`;
    }

    // 也可以检查其他EXIF字段
    if (exifData && exifData.city) {
      return exifData.city;
    }

    return null;
  } catch (error) {
    console.error('读取图片EXIF信息错误:', error);
    return null;
  }
}
