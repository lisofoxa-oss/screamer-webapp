// ============================================================
// camera.js v4 — Запись реакции (FULL DEBUG)
//
// Изменения v4:
// - Запрос камеры при клике на чекбокс (до игры)
// - Debug панель показывает ВСЁ
// - Более надёжная финализация видео
// ============================================================

const Camera = {
    enabled: false,
    permissionGranted: false,
    stream: null,
    mediaRecorder: null,
    chunks: [],
    screamerTime: 0,
    finalBlob: null,
    captureInProgress: false,
    mimeType: null,
    
    BUFFER_MS: 5000,
    POST_MS: 3500,
    
    previewEl: null,
    videoEl: null,
    debugEl: null,
    debugLines: [],
    
    // ============================================================
    // INIT
    // ============================================================
    
    init() {
        this.previewEl = document.getElementById('cameraPreview');
        this.videoEl = document.getElementById('cameraVideo');
        
        // Debug панель
        this.debugEl = document.createElement('div');
        this.debugEl.id = 'camDbg';
        this.debugEl.style.cssText = 'position:fixed;bottom:5px;left:5px;background:rgba(0,0,0,0.85);color:#0f0;font-size:9px;padding:4px 6px;border-radius:4px;z-index:9999;font-family:monospace;max-width:180px;line-height:1.3;';
        document.body.appendChild(this.debugEl);
        
        // Проверки
        if (!navigator.mediaDevices?.getUserMedia) {
            this.log('❌ No getUserMedia');
            this.hideOption();
            return false;
        }
        
        if (!window.MediaRecorder) {
            this.log('❌ No MediaRecorder');
            this.hideOption();
            return false;
        }
        
        // Находим формат
        const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        this.mimeType = types.find(t => MediaRecorder.isTypeSupported(t));
        
        if (!this.mimeType) {
            this.log('❌ No format');
            this.hideOption();
            return false;
        }
        
        this.log('✓ ' + this.mimeType.split(';')[0]);
        
        // Чекбокс
        const checkbox = document.getElementById('cameraCheckbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.requestPermission();
                } else {
                    this.stopStream();
                }
            });
        }
        
        return true;
    },
    
    log(msg) {
        const ts = new Date().toLocaleTimeString().slice(3, 8);
        const line = ts + ' ' + msg;
        console.log('📷', line);
        
        this.debugLines.push(line);
        if (this.debugLines.length > 6) this.debugLines.shift();
        
        if (this.debugEl) {
            this.debugEl.innerHTML = this.debugLines.join('<br>');
        }
    },
    
    hideOption() {
        const opt = document.getElementById('cameraOption');
        if (opt) opt.style.display = 'none';
    },
    
    isEnabled() {
        const cb = document.getElementById('cameraCheckbox');
        return cb && cb.checked && this.permissionGranted;
    },
    
    // ============================================================
    // PERMISSION (при клике на чекбокс)
    // ============================================================
    
    async requestPermission() {
        this.log('Requesting...');
        
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
                audio: false
            });
            
            if (this.videoEl) {
                this.videoEl.srcObject = this.stream;
                this.videoEl.play().catch(() => {});
            }
            if (this.previewEl) {
                this.previewEl.classList.add('active');
            }
            
            this.permissionGranted = true;
            this.log('✓ Camera OK');
            
        } catch (err) {
            this.log('❌ ' + err.name);
            this.permissionGranted = false;
            const cb = document.getElementById('cameraCheckbox');
            if (cb) cb.checked = false;
        }
    },
    
    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.previewEl) this.previewEl.classList.remove('active');
        if (this.videoEl) this.videoEl.srcObject = null;
        this.permissionGranted = false;
        this.log('Stream off');
    },
    
    // ============================================================
    // START RECORDING (при старте игры)
    // ============================================================
    
    start() {
        this.log('start() called');
        
        if (!this.isEnabled()) {
            this.log('Not enabled');
            return;
        }
        
        if (!this.stream) {
            this.log('No stream!');
            return;
        }
        
        this.chunks = [];
        this.screamerTime = 0;
        this.finalBlob = null;
        this.captureInProgress = false;
        
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: this.mimeType,
                videoBitsPerSecond: 1000000
            });
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.chunks.push({ data: e.data, time: Date.now() });
                    this.log('Chunk #' + this.chunks.length + ' ' + Math.round(e.data.size/1024) + 'K');
                    
                    // Буфер 12 сек
                    if (!this.captureInProgress) {
                        const cutoff = Date.now() - 12000;
                        this.chunks = this.chunks.filter(c => c.time > cutoff);
                    }
                }
            };
            
            this.mediaRecorder.onerror = (e) => {
                this.log('❌ Error: ' + (e.error?.name || 'unknown'));
            };
            
            this.mediaRecorder.onstart = () => {
                this.log('▶ Recording');
                this.enabled = true;
            };
            
            this.mediaRecorder.onstop = () => {
                this.log('⏹ Stopped');
            };
            
            // Запуск
            this.mediaRecorder.start(400);
            this.log('Recorder started');
            
        } catch (err) {
            this.log('❌ ' + err.message);
        }
    },
    
    // ============================================================
    // ON SCREAMER
    // ============================================================
    
    onScreamer() {
        this.log('onScreamer()');
        
        if (!this.enabled) {
            this.log('Not enabled');
            return;
        }
        
        if (!this.mediaRecorder) {
            this.log('No recorder');
            return;
        }
        
        if (this.mediaRecorder.state !== 'recording') {
            this.log('State: ' + this.mediaRecorder.state);
            return;
        }
        
        this.screamerTime = Date.now();
        this.captureInProgress = true;
        this.log('😱 CAPTURED! ' + this.chunks.length + ' chunks');
        
        // Ждём POST_MS
        setTimeout(() => {
            this.finalize();
        }, this.POST_MS);
    },
    
    finalize() {
        this.log('finalize()');
        
        if (!this.mediaRecorder) {
            this.createVideo();
            return;
        }
        
        // Получаем последние данные
        if (this.mediaRecorder.state === 'recording') {
            try {
                this.mediaRecorder.requestData();
            } catch (e) {}
        }
        
        // Даём время на обработку
        setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                try {
                    this.mediaRecorder.stop();
                } catch (e) {}
            }
            
            setTimeout(() => {
                this.createVideo();
            }, 500);
        }, 300);
    },
    
    createVideo() {
        this.log('createVideo: ' + this.chunks.length + ' chunks');
        
        if (this.chunks.length === 0) {
            this.log('❌ 0 chunks!');
            return;
        }
        
        // Собираем все blobs
        const blobs = this.chunks.map(c => c.data);
        const totalSize = blobs.reduce((s, b) => s + b.size, 0);
        
        this.log('Total: ' + Math.round(totalSize / 1024) + 'KB');
        
        this.finalBlob = new Blob(blobs, { type: this.mimeType });
        
        this.log('✓ Blob: ' + Math.round(this.finalBlob.size / 1024) + 'KB');
        
        // Кнопка
        const btn = document.getElementById('viewReactionBtn');
        if (btn && this.finalBlob.size > 10000) {
            btn.style.display = 'block';
            this.log('Button ON');
        } else {
            this.log('Too small');
        }
    },
    
    // ============================================================
    // STOP & RESET
    // ============================================================
    
    stop() {
        if (this.mediaRecorder?.state === 'recording') {
            try { this.mediaRecorder.stop(); } catch (e) {}
        }
        this.enabled = false;
        this.mediaRecorder = null;
    },
    
    reset() {
        this.chunks = [];
        this.screamerTime = 0;
        this.finalBlob = null;
        this.captureInProgress = false;
        this.enabled = false;
        
        const btn = document.getElementById('viewReactionBtn');
        if (btn) btn.style.display = 'none';
        
        this.log('Reset');
    },
    
    // ============================================================
    // PREVIEW & SHARE
    // ============================================================
    
    showPreview() {
        this.log('showPreview()');
        
        if (!this.finalBlob) {
            this.log('No blob');
            return false;
        }
        
        if (this.finalBlob.size < 10000) {
            this.log('Blob too small');
            return false;
        }
        
        const video = document.getElementById('reactionVideo');
        if (video) {
            video.src = URL.createObjectURL(this.finalBlob);
            this.log('Preview set');
        }
        return true;
    },
    
    download() {
        if (!this.finalBlob) {
            this.log('Nothing to download');
            return;
        }
        
        this.log('Downloading...');
        
        const url = URL.createObjectURL(this.finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'reaction.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    
    async share() {
        if (!this.finalBlob) return;
        
        this.log('Sharing...');
        
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([this.finalBlob], 'reaction.webm', { type: this.finalBlob.type });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Моя реакция 😱' });
                    return;
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                this.log('Share err: ' + err.name);
            }
        }
        this.download();
    }
};

// Init
document.addEventListener('DOMContentLoaded', () => Camera.init());

// Globals
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
