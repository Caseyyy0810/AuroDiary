import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import './App.css';

// 定义风格常量及其核心描述
const DIARY_STYLES = [
  { title: '游记', description: '以空间移动为线索，强调感官体验与独特见闻，记录“此地此刻”的发现与感触。' },
  { title: '日常', description: '捕捉平凡生活中的细微波动与内心涟漪，于琐事中寻找意义与情绪的真实记录。' },
  { title: '文学/诗意', description: '运用意象、隐喻与跳跃节奏，以高度凝练的语言封装情感与哲思，追求瞬间的美感凝结。' },
  { title: '古诗', description: '以古典诗词的格律与意境抒写现代心境，实现传统形式与当代灵魂的融合与对话。' },
  { title: '幽默', description: '通过自嘲、夸张与意外转折，将生活的尴尬与荒诞转化为轻松的笑点与喜剧性叙事。' },
  { title: '严肃', description: '用于深度自我对话、事件剖析或哲学思辨，笔调冷静、结构清晰、内省而真挚。' }
];

function App() {
  const [photos, setPhotos] = useState([]);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); 
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [diary, setDiary] = useState(null);
  const [error, setError] = useState('');
  const [diaryStyle, setDiaryStyle] = useState(DIARY_STYLES[0].title); 
  // 创作模式 ai(AI润色) 或 manual(手动创作)
  const [mode, setMode] = useState('ai');
  const [manualTitle, setManualTitle] = useState('');
  
  const [currentInput, setCurrentInput] = useState({ photos: [], location: '', date: new Date().toISOString().split('T')[0], description: '', diaryStyle: DIARY_STYLES[0].title, mode: 'ai', title: '' });

  const [isEditingDiary, setIsEditingDiary] = useState(false);
  const [editableTitle, setEditableTitle] = useState('');
  const [editableContent, setEditableContent] = useState('');
  const [editablePhotos, setEditablePhotos] = useState([]); 
  const [isUploading, setIsUploading] = useState(false); 
  const [isSavingToFeishu, setIsSavingToFeishu] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [downloadImageData, setDownloadImageData] = useState(null); // 新增：用于手机端保存图片
  const diaryRef = useRef(null);

  const handleManualPhotoChange = (e) => {
    const files = Array.from(e.target.files);
    const newPhotos = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      originalName: file.name,
      location: '未知地点'
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const handleGetLocation = () => {
    if (typeof window.AMap === 'undefined') {
      alert('地图库加载失败，请检查网络');
      return;
    }

    setLocation('定位中...');
    
    window.AMap.plugin('AMap.Geolocation', function() {
      const geolocation = new window.AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10000,
        needAddress: true,
        extensions: 'base'
      });

      geolocation.getCurrentPosition(function(status, result) {
        if (status === 'complete') {
          const addr = result.addressComponent;
          const city = addr.city || addr.province || '';
          const district = addr.district || '';
          const township = addr.township || '';
          // 精度调整为：城市 · 区县 街道/乡镇
          setLocation(`${city} · ${district}${township}`);
        } else {
          console.error('高德定位失败:', result);
          alert('定位失败：' + (result.message || '请检查权限'));
          setLocation('');
        }
      });
    });
  };

  const removePhoto = (index) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      if (newPhotos[index].preview && newPhotos[index].file instanceof File) {
        URL.revokeObjectURL(newPhotos[index].preview);
      }
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const generateDiaryEntry = async (inputPhotos, inputLocation, inputDate, inputDescription, inputDiaryStyleTitle, inputMode = 'ai', inputTitle = '') => {
    setLoading(true);
    setError('');

    const selectedStyle = DIARY_STYLES.find(s => s.title === inputDiaryStyleTitle);
    const styleDescription = selectedStyle ? selectedStyle.description : '';

    try {
      const formData = new FormData();
      inputPhotos.forEach(photo => {
        if (photo.file instanceof File) {
          formData.append('photos', photo.file);
        }
      });
      formData.append('location', inputLocation);
      formData.append('date', inputDate);
      formData.append('description', inputDescription);
      formData.append('diaryStyle', inputDiaryStyleTitle);
      formData.append('styleDescription', styleDescription);
      formData.append('mode', inputMode); // 'ai' 自动生成 或 'polish' 润色
      formData.append('title', inputTitle);

      setCurrentInput({ 
        photos: inputPhotos, 
        location: inputLocation, 
        date: inputDate, 
        description: inputDescription, 
        diaryStyle: inputDiaryStyleTitle,
        mode: inputMode,
        title: inputTitle
      });

      const response = await fetch('/api/generate-diary', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '生成失败');
      }

      setDiary(data.diary);
      setIsEditingDiary(false);
    } catch (err) {
      setError(err.message || '生成失败');
      console.error('Error:', err);
      setDiary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError(mode === 'ai' ? '请输入需要润色的内容' : '请输入日记正文');
      return;
    }

    if (mode === 'manual') {
      // 手动模式：先上传照片，然后直接设置日记状态
      setLoading(true);
      try {
        let uploadedPhotos = [];
        // 如果有新照片，需要上传
        const newPhotosToUpload = photos.filter(p => p.file instanceof File);
        
        if (newPhotosToUpload.length > 0) {
          const formData = new FormData();
          newPhotosToUpload.forEach(p => {
            formData.append('photos', p.file);
          });
          formData.append('location', location);
          
          const res = await fetch('/api/upload-photos', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.success) {
            uploadedPhotos = data.photos;
          }
        }

        const newDiary = {
          title: manualTitle || `${date} 的日记`,
          location: location || '未指定地点',
          date: date,
          content: description,
          photos: uploadedPhotos
        };
        setDiary(newDiary);
      } catch (err) {
        setError('处理失败，请重试');
      } finally {
        setLoading(false);
      }
    } else {
      // AI 助手模式 (润色或生成)
      generateDiaryEntry(photos, location, date, description, diaryStyle, 'ai');
    }
  };

  const handlePolish = async () => {
    if (!description.trim()) {
      alert('请先输入日记内容再进行润色');
      return;
    }
    generateDiaryEntry(photos, location, date, description, diaryStyle, 'polish', manualTitle);
  };

  const handleRegenerate = () => {
    generateDiaryEntry(
      currentInput.photos, 
      currentInput.location, 
      currentInput.date, 
      currentInput.description, 
      diaryStyle,
      currentInput.mode,
      currentInput.title
    );
  };

  const handleEdit = () => {
    if (diary) {
      setEditableTitle(diary.title || '');
      setEditableContent(diary.content || '');
      setEditablePhotos([...(diary.photos || [])]);
      setIsEditingDiary(true);
    }
  };

  const removeEditablePhoto = (index) => {
    const newPhotos = [...editablePhotos];
    newPhotos.splice(index, 1);
    setEditablePhotos(newPhotos);
  };

  const handleAddPhotoInEdit = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('photos', file));
      formData.append('location', location || '未知地点');
      formData.append('date', date);

      const response = await fetch('/api/upload-photos', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok && data.success && data.photos) {
        const newPhotosList = [...editablePhotos, ...data.photos];
        setEditablePhotos(newPhotosList);
        
        let addedTags = "";
        data.photos.forEach((_, index) => {
          const newIndex = editablePhotos.length + index + 1;
          addedTags += `\n\n[图片${newIndex}]\n`;
        });
        setEditableContent(prev => prev + addedTags);
      } else {
        throw new Error(data.error || '上传失败');
      }
    } catch (err) {
      console.error('上传图片失败:', err);
      alert('上传照片失败');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveEdit = () => {
    setDiary({
      ...diary,
      title: editableTitle,
      content: editableContent,
      photos: editablePhotos
    });
    setIsEditingDiary(false);
  };

  const handleSaveToFeishu = async () => {
    if (!diary) return;
    
    setIsSavingToFeishu(true);
    setSaveStatus('正在保存到飞书...');
    
    try {
      const response = await fetch('/api/save-to-feishu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: diary.title,
          date: diary.date,
          location: diary.location,
          content: diary.content,
          photos: diary.photos // 发送照片信息以便后端上传
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSaveStatus('✅ 已成功保存到飞书多维表格！');
        setTimeout(() => setSaveStatus(''), 3000);
      } else {
        throw new Error(data.error || '保存失败');
      }
    } catch (err) {
      console.error('保存到飞书失败:', err);
      setSaveStatus('❌ 保存失败: ' + err.message);
      setTimeout(() => setSaveStatus(''), 5000);
    } finally {
      setIsSavingToFeishu(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!diaryRef.current) return;
    
    setSaveStatus('正在生成长图...');
    try {
      const canvas = await html2canvas(diaryRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#0d1426',
        logging: false,
        windowWidth: 500, // 锁定宽度以获得更好的移动端效果
      });
      
      const image = canvas.toDataURL('image/png');
      
      // 检测是否为移动端
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        setDownloadImageData(image);
        setSaveStatus('✅ 已生成图片，请长按保存');
      } else {
        const link = document.createElement('a');
        link.href = image;
        link.download = `日记-${diary.title}-${diary.date}.png`;
        link.click();
        setSaveStatus('✅ 长图已保存！');
      }
      
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      console.error('生成图片失败:', err);
      setSaveStatus('❌ 生成长图失败');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const handleReset = () => {
    photos.forEach(photo => {
      if (photo.file instanceof File && photo.preview) {
        URL.revokeObjectURL(photo.preview);
      }
    });
    setPhotos([]);
    setLocation('');
    setDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setDiaryStyle(DIARY_STYLES[0].title);
    setDiary(null);
    setError('');
    setCurrentInput({ photos: [], location: '', date: new Date().toISOString().split('T')[0], description: '', diaryStyle: DIARY_STYLES[0].title });
    setIsEditingDiary(false);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>📔 AuroDiary</h1>
        <p className="subtitle">AI智能日记本</p>
      </header>

      {loading && !diary ? (
        <div className="loading-container">
          <div className="loader"></div>
          <p>AI 正在构思你的日记...</p>
        </div>
      ) : !diary ? (
        <form className="form" onSubmit={handleSubmit}>
          
          <div className="mode-selector">
            <button 
              type="button" 
              className={`mode-btn ${mode === 'ai' ? 'active' : ''}`}
              onClick={() => setMode('ai')}
            >
              🪄 AI 润色模式
            </button>
            <button 
              type="button" 
              className={`mode-btn ${mode === 'manual' ? 'active' : ''}`}
              onClick={() => setMode('manual')}
            >
              ✍️ 自由创作模式
            </button>
          </div>

          <div className="form-row">
            {mode === 'ai' && (
              <div className="form-group flex-1">
                <label className="label">✨ 风格</label>
                <select value={diaryStyle} onChange={(e) => setDiaryStyle(e.target.value)} className="input compact-input">
                  {DIARY_STYLES.map(style => (
                    <option key={style.title} value={style.title}>{style.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={`form-group ${mode === 'ai' ? 'flex-2' : 'flex-1'}`}>
              <label className="label">📍 地点</label>
              <div className="location-input-container">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="地点"
                  className="input compact-input"
                />
                <button type="button" className="get-location-btn compact-btn" onClick={handleGetLocation}>
                  📍
                </button>
              </div>
            </div>

            <div className="form-group flex-1.5">
              <label className="label">📅 日期</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input compact-input"
              />
            </div>
          </div>

          {mode === 'ai' && (
            <p className="style-tip">
              {DIARY_STYLES.find(s => s.title === diaryStyle)?.description}
            </p>
          )}

          {mode === 'manual' && (
            <div className="form-group">
              <label className="label">🔖 日记标题</label>
              <input
                type="text"
                placeholder="给日记起个标题吧..."
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className="input"
              />
            </div>
          )}

          <div className="form-group">
            <label className="label">📸 上传照片（可选）</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleManualPhotoChange}
              className="file-input"
              id="photo-input"
            />
            <label htmlFor="photo-input" className="file-input-label">
              <span>选择照片</span>
              <span style={{fontSize:'20px'}}>📸</span>
            </label>
            {photos.length > 0 && (
              <div className="photo-preview-grid">
                {photos.map((photo, index) => (
                  <div key={index} className="photo-preview-item">
                    <img src={photo.preview} alt={`预览 ${index + 1}`} className="photo-preview" />
                    <button type="button" onClick={() => removePhoto(index)} className="remove-photo-btn">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="label">
              {mode === 'ai' ? '📝 想要润色的内容' : '✍️ 日记正文'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={mode === 'ai' ? "随便写写，AI 帮你润色成精美的日记..." : "在这里写下你的故事..."}
              className="textarea"
              rows="6"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="submit-group">
            <button type="submit" disabled={loading} className="submit-btn flex-2">
              {loading ? (mode === 'ai' ? '处理中...' : '提交中...') : (mode === 'ai' ? '✨ 开始生成' : '✅ 预览日记')}
            </button>
            {mode === 'manual' && (
              <button 
                type="button" 
                onClick={handlePolish} 
                disabled={loading || !description.trim()} 
                className="action-btn polish-btn flex-1"
                style={{ marginTop: '10px' }}
              >
                🪄 AI 润色
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="diary-result">
          <div className="diary-content" ref={diaryRef}>
            {isEditingDiary ? (
              <input
                className="diary-title-input"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
                placeholder="日记标题"
              />
            ) : (
              <h2 className="diary-title">{diary.title}</h2>
            )}
            
            <div className="diary-location">
              <span>📍 {diary.location}</span>
              <span style={{ marginLeft: '15px' }}>📅 {diary.date}</span>
            </div>
            
            <div className="diary-body">
              {isEditingDiary ? (
                <>
                  <textarea
                    className="diary-content-textarea"
                    value={editableContent}
                    onChange={(e) => setEditableContent(e.target.value)}
                    rows="15"
                    placeholder="在这里编辑你的日记内容..."
                  />
                  
                  <div className="edit-photos-section">
                    <label className="label">🖼️ 管理照片 (使用 [图片n] 插入正文)</label>
                    <div className="edit-photos-grid">
                      {editablePhotos.map((photo, index) => (
                        <div key={index} className="edit-photo-item">
                          <img src={photo.path} alt={`图片 ${index + 1}`} />
                          <span className="photo-index-tag">图片{index + 1}</span>
                          <button 
                            className="remove-edit-photo-btn"
                            onClick={() => removeEditablePhoto(index)}
                          >×</button>
                        </div>
                      ))}
                      <label className="add-photo-edit-btn">
                        <input 
                          type="file" 
                          accept="image/*" 
                          multiple 
                          onChange={handleAddPhotoInEdit} 
                          style={{display:'none'}}
                        />
                        {isUploading ? '...' : '+'}
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                (() => {
                  const usedPhotoIndices = new Set();
                  return diary.content.split(/(\[图片\d+\])/g).map((part, index) => {
                    const photoMatch = part.match(/\[图片(\d+)\]/);
                    if (photoMatch) {
                      const photoIndex = parseInt(photoMatch[1], 10) - 1;
                      const photo = diary.photos[photoIndex];
                      if (photo && !usedPhotoIndices.has(photoIndex)) {
                        usedPhotoIndices.add(photoIndex);
                        return (
                          <div key={index} className="diary-photo-in-text-item">
                            <img src={photo.path} alt={`日记图片 ${photoIndex + 1}`} className="diary-photo-in-text" />
                            {photo.location && <div className="photo-location">📍 {photo.location}</div>}
                          </div>
                        );
                      }
                      return null;
                    } else {
                      return part.split('\n').map((paragraph, pIndex) => (
                        paragraph.trim() && (
                          <p key={`${index}-${pIndex}`} className="diary-paragraph">
                            {paragraph}
                          </p>
                        )
                      ));
                    }
                  });
                })()
              )}
            </div>
          </div>

          <div className="diary-actions">
            {isEditingDiary ? (
              <div className="action-row">
                <button onClick={handleSaveEdit} className="action-btn save-btn">
                  ✅ 确定修改
                </button>
                <button onClick={() => setIsEditingDiary(false)} className="action-btn cancel-btn">
                  ❌ 取消
                </button>
              </div>
            ) : (
              <>
                <div className="regenerate-style-selector">
                  <span className="label">切换风格重新生成：</span>
                  <select 
                    value={diaryStyle} 
                    onChange={(e) => setDiaryStyle(e.target.value)} 
                    className="input compact-input result-style-select"
                  >
                    {DIARY_STYLES.map(style => (
                      <option key={style.title} value={style.title}>{style.title}</option>
                    ))}
                  </select>
                </div>
                
                <div className="action-row">
                  <button onClick={handleRegenerate} className="action-btn regenerate-btn" disabled={loading}>
                    {loading ? '重新生成中...' : '🔄 重新生成'}
                  </button>
                  <button onClick={handleEdit} className="action-btn edit-btn" disabled={loading}>
                    ✏️ 编辑文章
                  </button>
                </div>
                
                <div className="action-row">
                  <button 
                    onClick={handleSaveToFeishu} 
                    className="action-btn feishu-btn" 
                    disabled={isSavingToFeishu || loading}
                  >
                    {isSavingToFeishu ? '🚀 正在保存...' : '📒 保存到飞书'}
                  </button>
                  <button 
                    onClick={handleDownloadImage} 
                    className="action-btn download-btn" 
                    disabled={loading}
                  >
                    🖼️ 下载长图
                  </button>
                </div>

                {saveStatus && <div className="save-status">{saveStatus}</div>}

                <button onClick={handleReset} className="action-btn reset-btn" disabled={loading}>
                  📝 写新日记
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 图片保存模态框 - 仅在手机端生成图片后显示 */}
      {downloadImageData && (
        <div className="download-modal" onClick={() => setDownloadImageData(null)}>
          <div className="download-modal-content" onClick={e => e.stopPropagation()}>
            <p>长按下方图片保存到手机</p>
            <img src={downloadImageData} alt="生成的日记长图" className="download-preview-img" />
            <button className="close-modal-btn" onClick={() => setDownloadImageData(null)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
