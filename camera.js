// ============================================================
// camera.js v2 — Запись реакции на скример (FIXED)
//
// Фиксы:
// - Камера запускается асинхронно, не блокирует игру
// - Улучшена логика буфера
// - Корректный захват момента скримера
// ============================================================

const Camera = {
    // Состояние
    enabled: false,
    stream: null,
    mediaRecorder: null,
    chunks: [],
    screamerTime: 0,
    finalBlob: null,
    captureInProgress: false,
    
    // Настройки
    BUFFER_MS: 5000,      // 5 сек ДО скримера
    POST_MS: 3000,        // 3 сек ПОСЛЕ скримера
    
    // DOM
    previewEl: null,
    videoEl: null,
    
    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    
    init() {
        this.previewEl = document.getElementById('cameraPreview');
        this.videoEl = document.getElementById('cameraVideo');
        
        // Проверяем поддержку
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            console.log('📷 Camera/MediaRecorder not supported');
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
    // ЗАПУСК (не блокирует!)
    // ============================================================
    
    start() {
        if (!this.isEnabled()) {
            console.log('📷 Camera disabled by user');
            return;
        }
        
        // Запускаем асинхронно, не ждём
        this._startAsync().catch(err => {
            console.log('📷 Camera failed:', err.message);
        });
    },
    
    async _startAsync() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
                audio: false
            });
            
            // Показываем превью
            if (this.videoEl) {
                this.videoEl.srcObject = this.stream;
                await this.videoEl.play().catch(() => {});
            }
            if (this.previewEl) {
                this.previewEl.classList.add('active');
            }
            
            // Запускаем запись
            this._startRecording();
            this.enabled = true;
            console.log('📷 Camera started');
            
        } catch (err) {
            console.log('📷 Camera error:', err.message);
            this.enabled = false;
        }
    },
    
    // ============================================================
    // ЗАПИСЬ
    // ============================================================
    
    _startRecording() {
        if (!this.stream) return;
        
        // Выбираем формат
        const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
            .find(t => MediaRecorder.isTypeSupported(t));
        
        if (!mimeType) {
            console.log('📷 No supported format');
            return;
        }
        
        this.chunks = [];
        this.screamerTime = 0;
        this.finalBlob = null;
        this.captureInProgress = false;
        
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType,
                videoBitsPerSecond: 800000
            });
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data?.size > 0) {
                    this.chunks.push({ data: e.data, time: Date.now() });
                    
                    // Держим только последние 10 сек (буфер)
                    if (!this.captureInProgress) {
                        const cutoff = Date.now() - 10000;
                        this.chunks = this.chunks.filter(c => c.time > cutoff);
                    }
                }
            };
            
            this.mediaRecorder.start(300);  // chunks каждые 300ms
            console.log('📷 Recording started, format:', mimeType);
            
        } catch (err) {
            console.log('📷 Recorder error:', err);
        }
    },
    
    // ============================================================
    // МОМЕНТ СКРИМЕРА
    // ============================================================
    
    onScreamer() {
        if (!this.enabled || !this.mediaRecorder) return;
        
        this.screamerTime = Date.now();
        this.captureInProgress = true;
        console.log('📷 Screamer! Capturing...');
        
        // Записываем ещё POST_MS секунд, потом стоп
        setTimeout(() => {
            this._stopAndFinalize();
        }, this.POST_MS);
    },
    
    _stopAndFinalize() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
            this._createFinalVideo();
            return;
        }
        
        this.mediaRecorder.onstop = () => {
            this._createFinalVideo();
        };
        
        try {
            this.mediaRecorder.stop();
        } catch (e) {
            this._createFinalVideo();
        }
    },
    
    _createFinalVideo() {
        if (this.chunks.length === 0) {
            console.log('📷 No chunks');
            return;
        }
        
        // Берём chunks: BUFFER_MS до скримера + POST_MS после
        const startTime = this.screamerTime - this.BUFFER_MS;
        const endTime = this.screamerTime + this.POST_MS + 500;  // +500ms запас
        
        let relevantChunks = this.chunks.filter(c => c.time >= startTime && c.time <= endTime);
        
        // Если мало — берём все
        if (relevantChunks.length < 3) {
            relevantChunks = this.chunks;
        }
        
        const blobs = relevantChunks.map(c => c.data);
        this.finalBlob = new Blob(blobs, { type: blobs[0]?.type || 'video/webm' });
        
        console.log('📷 Video ready:', Math.round(this.finalBlob.size / 1024), 'KB,', relevantChunks.length, 'chunks');
        
        // Показываем кнопку
        const btn = document.getElementById('viewReactionBtn');
        if (btn && this.finalBlob.size > 1000) {
            btn.style.display = 'block';
        }
    },
    
    // ============================================================
    // STOP & CLEANUP
    // ============================================================
    
    stop() {
        if (this.mediaRecorder?.state !== 'inactive') {
            try { this.mediaRecorder.stop(); } catch (e) {}
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        
        if (this.previewEl) this.previewEl.classList.remove('active');
        if (this.videoEl) this.videoEl.srcObject = null;
        
        this.enabled = false;
        this.mediaRecorder = null;
        console.log('📷 Camera stopped');
    },
    
    reset() {
        this.chunks = [];
        this.screamerTime = 0;
        this.finalBlob = null;
        this.captureInProgress = false;
        
        const btn = document.getElementById('viewReactionBtn');
        if (btn) btn.style.display = 'none';
    },
    
    // ============================================================
    // PREVIEW & SHARE
    // ============================================================
    
    showPreview() {
        if (!this.finalBlob || this.finalBlob.size < 1000) {
            console.log('📷 No video to show');
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
    },
    
    async share() {
        if (!this.finalBlob) return;
        
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([this.finalBlob], 'reaction.webm', { type: this.finalBlob.type });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Моя реакция 😱',
                        text: 'Чёрная Роза'
                    });
                    return;
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }
        this.download();
    }
};

// Init
document.addEventListener('DOMContentLoaded', () => Camera.init());

// Global functions for HTML
function showReactionPreview() {
    if (Camera.showPreview()) {
        document.getElementById('results')?.classList.remove('active');
        document.getElementById('reactionPreview')?.classList.add('active');
    }
}

function closeReactionPreview() {
    document.getElementById('reactionPreview')?.classList.remove('active');
    document.getElementById('results')?.classList.add('active');
}

function downloadReaction() { Camera.download(); }
function shareReaction() { Camera.share(); }
