// ============================================================
// camera.js — Запись реакции на скример
//
// Функционал:
// - Кольцевой буфер ~5 сек (постоянно пишем, старое удаляем)
// - При скримере: фиксируем буфер + пишем ещё 3 сек
// - Preview после игры
// - Сохранение / Share
// ============================================================

const Camera = {
    // Состояние
    enabled: false,
    stream: null,
    mediaRecorder: null,
    chunks: [],           // Все чанки с начала игры
    screamerTime: 0,      // Когда был скример
    recordingStartTime: 0,
    finalBlob: null,
    
    // Настройки
    BUFFER_SECONDS: 5,    // Секунд ДО скримера
    POST_SECONDS: 3,      // Секунд ПОСЛЕ скримера
    
    // DOM
    previewEl: null,
    videoEl: null,
    recIndicator: null,
    
    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    
    init() {
        this.previewEl = document.getElementById('cameraPreview');
        this.videoEl = document.getElementById('cameraVideo');
        this.recIndicator = document.getElementById('cameraRec');
        
        // Проверяем поддержку
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.log('📷 Camera not supported');
            this.hideOption();
            return false;
        }
        
        // Проверяем MediaRecorder
        if (!window.MediaRecorder) {
            console.log('📷 MediaRecorder not supported');
            this.hideOption();
            return false;
        }
        
        console.log('📷 Camera module ready');
        return true;
    },
    
    hideOption() {
        const opt = document.getElementById('cameraOption');
        if (opt) opt.style.display = 'none';
    },
    
    isEnabled() {
        const checkbox = document.getElementById('cameraCheckbox');
        return checkbox && checkbox.checked;
    },
    
    // ============================================================
    // ЗАПУСК КАМЕРЫ
    // ============================================================
    
    async start() {
        if (!this.isEnabled()) {
            console.log('📷 Camera disabled by user');
            return false;
        }
        
        try {
            // Запрашиваем камеру
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 480 },
                    height: { ideal: 640 }
                },
                audio: false  // Без звука (будет игровой звук)
            });
            
            // Показываем превью
            if (this.videoEl) {
                this.videoEl.srcObject = this.stream;
            }
            if (this.previewEl) {
                this.previewEl.classList.add('active');
            }
            
            // Запускаем запись
            this.startRecording();
            
            this.enabled = true;
            console.log('📷 Camera started');
            return true;
            
        } catch (err) {
            console.log('📷 Camera error:', err.message);
            this.enabled = false;
            return false;
        }
    },
    
    // ============================================================
    // ЗАПИСЬ
    // ============================================================
    
    startRecording() {
        if (!this.stream) return;
        
        // Выбираем формат
        const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];
        
        let mimeType = '';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }
        
        if (!mimeType) {
            console.log('📷 No supported video format');
            return;
        }
        
        console.log('📷 Using format:', mimeType);
        
        this.chunks = [];
        this.recordingStartTime = Date.now();
        this.screamerTime = 0;
        this.finalBlob = null;
        
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType,
                videoBitsPerSecond: 1000000  // 1 Mbps
            });
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.chunks.push({
                        data: e.data,
                        time: Date.now()
                    });
                    
                    // Удаляем старые чанки (держим ~10 сек буфер)
                    const cutoff = Date.now() - 10000;
                    this.chunks = this.chunks.filter(c => c.time > cutoff);
                }
            };
            
            this.mediaRecorder.onerror = (e) => {
                console.log('📷 Recorder error:', e.error);
            };
            
            // Записываем чанками по 500мс
            this.mediaRecorder.start(500);
            
            console.log('📷 Recording started');
            
        } catch (err) {
            console.log('📷 Recorder init error:', err);
        }
    },
    
    // ============================================================
    // МОМЕНТ СКРИМЕРА
    // ============================================================
    
    onScreamer() {
        if (!this.enabled || !this.mediaRecorder) return;
        
        this.screamerTime = Date.now();
        console.log('📷 Screamer captured!');
        
        // Записываем ещё POST_SECONDS секунд
        setTimeout(() => {
            this.stopRecording();
        }, this.POST_SECONDS * 1000);
    },
    
    // ============================================================
    // ОСТАНОВКА
    // ============================================================
    
    stopRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
            return;
        }
        
        this.mediaRecorder.onstop = () => {
            this.createFinalVideo();
        };
        
        this.mediaRecorder.stop();
        console.log('📷 Recording stopped');
    },
    
    createFinalVideo() {
        if (this.chunks.length === 0) {
            console.log('📷 No chunks to process');
            return;
        }
        
        // Берём чанки вокруг скримера
        // BUFFER_SECONDS до + POST_SECONDS после
        const startTime = this.screamerTime - (this.BUFFER_SECONDS * 1000);
        const endTime = this.screamerTime + (this.POST_SECONDS * 1000);
        
        const relevantChunks = this.chunks.filter(c => 
            c.time >= startTime && c.time <= endTime
        );
        
        if (relevantChunks.length === 0) {
            // Берём последние чанки
            relevantChunks.push(...this.chunks.slice(-16));
        }
        
        const blobs = relevantChunks.map(c => c.data);
        this.finalBlob = new Blob(blobs, { type: blobs[0]?.type || 'video/webm' });
        
        console.log('📷 Final video created:', Math.round(this.finalBlob.size / 1024), 'KB');
        
        // Показываем кнопку просмотра
        const btn = document.getElementById('viewReactionBtn');
        if (btn) {
            btn.style.display = 'block';
        }
    },
    
    // ============================================================
    // ОСТАНОВКА КАМЕРЫ
    // ============================================================
    
    stop() {
        // Останавливаем запись если идёт
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try {
                this.mediaRecorder.stop();
            } catch (e) {}
        }
        
        // Останавливаем stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        // Скрываем превью
        if (this.previewEl) {
            this.previewEl.classList.remove('active');
        }
        if (this.videoEl) {
            this.videoEl.srcObject = null;
        }
        
        this.enabled = false;
        this.mediaRecorder = null;
        
        console.log('📷 Camera stopped');
    },
    
    // ============================================================
    // PREVIEW & SHARE
    // ============================================================
    
    showPreview() {
        if (!this.finalBlob) {
            console.log('📷 No video to preview');
            return false;
        }
        
        const video = document.getElementById('reactionVideo');
        if (video) {
            video.src = URL.createObjectURL(this.finalBlob);
        }
        
        return true;
    },
    
    download() {
        if (!this.finalBlob) return;
        
        const url = URL.createObjectURL(this.finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reaction_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('📷 Video downloaded');
    },
    
    async share() {
        if (!this.finalBlob) return;
        
        // Проверяем поддержку Share API
        if (!navigator.share || !navigator.canShare) {
            // Fallback — скачиваем
            this.download();
            return;
        }
        
        try {
            const file = new File([this.finalBlob], 'reaction.webm', { 
                type: this.finalBlob.type 
            });
            
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Моя реакция на Чёрную Розу 😱',
                    text: 'Посмотри как я испугался!'
                });
                console.log('📷 Video shared');
            } else {
                // Share не поддерживает файлы — скачиваем
                this.download();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.log('📷 Share error:', err);
                this.download();
            }
        }
    },
    
    // ============================================================
    // CLEANUP
    // ============================================================
    
    reset() {
        this.chunks = [];
        this.screamerTime = 0;
        this.recordingStartTime = 0;
        this.finalBlob = null;
        
        const btn = document.getElementById('viewReactionBtn');
        if (btn) btn.style.display = 'none';
    }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    Camera.init();
});

// Глобальные функции для HTML onclick
function showReactionPreview() {
    if (Camera.showPreview()) {
        // Показываем экран preview
        document.getElementById('results')?.classList.remove('active');
        document.getElementById('reactionPreview')?.classList.add('active');
    }
}

function closeReactionPreview() {
    document.getElementById('reactionPreview')?.classList.remove('active');
    document.getElementById('results')?.classList.add('active');
}

function downloadReaction() {
    Camera.download();
}

function shareReaction() {
    Camera.share();
}
