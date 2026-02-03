// ============================================================
// camera.js v5 — Telegram WebApp compatible
// ============================================================

const Camera = {
    enabled: false,
    permissionGranted: false,
    stream: null,
    mediaRecorder: null,
    chunks: [],
    screamerTime: 0,
    finalBlob: null,
    dataUrl: null,  // Храним готовый data URL
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
        
        // Debug
        this.debugEl = document.createElement('div');
        this.debugEl.style.cssText = 'position:fixed;bottom:5px;left:5px;background:rgba(0,0,0,0.9);color:#0f0;font-size:9px;padding:4px 6px;border-radius:4px;z-index:9999;font-family:monospace;max-width:200px;line-height:1.3;';
        document.body.appendChild(this.debugEl);
        
        if (!navigator.mediaDevices?.getUserMedia) {
            this.log('❌ No camera API');
            this.hideOption();
            return false;
        }
        
        if (!window.MediaRecorder) {
            this.log('❌ No MediaRecorder');
            this.hideOption();
            return false;
        }
        
        const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        this.mimeType = types.find(t => MediaRecorder.isTypeSupported(t));
        
        if (!this.mimeType) {
            this.log('❌ No format');
            this.hideOption();
            return false;
        }
        
        this.log('✓ ' + this.mimeType.split(';')[0]);
        
        const checkbox = document.getElementById('cameraCheckbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) this.requestPermission();
                else this.stopStream();
            });
        }
        
        return true;
    },
    
    log(msg) {
        console.log('📷', msg);
        this.debugLines.push(msg);
        if (this.debugLines.length > 5) this.debugLines.shift();
        if (this.debugEl) this.debugEl.innerHTML = this.debugLines.join('<br>');
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
    // PERMISSION
    // ============================================================
    
    async requestPermission() {
        this.log('Requesting camera...');
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
                audio: false
            });
            if (this.videoEl) {
                this.videoEl.srcObject = this.stream;
                this.videoEl.play().catch(() => {});
            }
            if (this.previewEl) this.previewEl.classList.add('active');
            this.permissionGranted = true;
            this.log('✓ Camera ready');
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
    },
    
    // ============================================================
    // RECORDING
    // ============================================================
    
    start() {
        this.log('start()');
        if (!this.isEnabled() || !this.stream) {
            this.log('Skip');
            return;
        }
        
        this.chunks = [];
        this.screamerTime = 0;
        this.finalBlob = null;
        this.dataUrl = null;
        this.captureInProgress = false;
        
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: this.mimeType,
                videoBitsPerSecond: 800000
            });
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data?.size > 0) {
                    this.chunks.push({ data: e.data, time: Date.now() });
                    this.log('Chunk ' + this.chunks.length);
                    if (!this.captureInProgress) {
                        const cutoff = Date.now() - 12000;
                        this.chunks = this.chunks.filter(c => c.time > cutoff);
                    }
                }
            };
            
            this.mediaRecorder.onstart = () => {
                this.log('▶ REC');
                this.enabled = true;
            };
            
            this.mediaRecorder.start(400);
        } catch (err) {
            this.log('❌ ' + err.message);
        }
    },
    
    // ============================================================
    // SCREAMER
    // ============================================================
    
    onScreamer() {
        this.log('onScreamer');
        if (!this.enabled || !this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
            this.log('Skip: not recording');
            return;
        }
        
        this.screamerTime = Date.now();
        this.captureInProgress = true;
        this.log('😱 ' + this.chunks.length + ' chunks');
        
        setTimeout(() => this.finalize(), this.POST_MS);
    },
    
    finalize() {
        this.log('finalize()');
        
        if (this.mediaRecorder?.state === 'recording') {
            try { this.mediaRecorder.requestData(); } catch (e) {}
        }
        
        setTimeout(() => {
            if (this.mediaRecorder?.state === 'recording') {
                try { this.mediaRecorder.stop(); } catch (e) {}
            }
            setTimeout(() => this.createVideo(), 300);
        }, 200);
    },
    
    createVideo() {
        this.log('createVideo: ' + this.chunks.length);
        
        if (this.chunks.length === 0) {
            this.log('❌ 0 chunks');
            return;
        }
        
        const blobs = this.chunks.map(c => c.data);
        this.finalBlob = new Blob(blobs, { type: this.mimeType });
        
        this.log('Blob: ' + Math.round(this.finalBlob.size / 1024) + 'KB');
        
        // Сразу конвертируем в data URL (для Telegram)
        this.log('Converting...');
        const reader = new FileReader();
        reader.onload = () => {
            this.dataUrl = reader.result;
            this.log('✓ Data URL ready');
            
            const btn = document.getElementById('viewReactionBtn');
            if (btn && this.dataUrl) {
                btn.style.display = 'block';
                this.log('Button ON');
            }
        };
        reader.onerror = () => this.log('Convert error');
        reader.readAsDataURL(this.finalBlob);
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
        this.dataUrl = null;
        this.captureInProgress = false;
        this.enabled = false;
        const btn = document.getElementById('viewReactionBtn');
        if (btn) btn.style.display = 'none';
    },
    
    // ============================================================
    // SHOW VIDEO (unified for preview and download)
    // ============================================================
    
    showVideo() {
        this.log('showVideo()');
        
        if (!this.dataUrl) {
            this.log('No data URL!');
            alert('Видео ещё конвертируется, подожди пару секунд');
            return false;
        }
        
        // Создаём fullscreen overlay с видео
        let overlay = document.getElementById('videoOverlay');
        if (overlay) overlay.remove();
        
        overlay = document.createElement('div');
        overlay.id = 'videoOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #000;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 15px;
        `;
        
        overlay.innerHTML = `
            <div style="color:#fff;font-size:13px;text-align:center;margin-bottom:10px;">
                Твоя реакция 😱
            </div>
            <video id="overlayVideo" controls playsinline
                style="max-width:100%;max-height:55vh;border-radius:8px;background:#111;">
            </video>
            <div style="color:#888;font-size:11px;margin-top:12px;text-align:center;line-height:1.5;">
                📱 Чтобы сохранить:<br>
                <strong>Зажми видео</strong> → "Сохранить"
            </div>
            <div style="display:flex;gap:10px;margin-top:15px;">
                <button id="overlayShare" style="padding:10px 20px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;font-size:13px;">
                    📤 Поделиться
                </button>
                <button id="overlayClose" style="padding:10px 20px;background:#333;color:#fff;border:none;border-radius:8px;font-size:13px;">
                    Закрыть
                </button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Устанавливаем видео
        const video = document.getElementById('overlayVideo');
        if (video) {
            video.src = this.dataUrl;
            video.load();
        }
        
        // Кнопки
        document.getElementById('overlayClose').onclick = () => overlay.remove();
        document.getElementById('overlayShare').onclick = () => this.share();
        
        this.log('Overlay shown');
        return true;
    },
    
    async share() {
        this.log('share()');
        
        if (!this.finalBlob) {
            this.log('No blob');
            return;
        }
        
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([this.finalBlob], 'reaction.webm', { type: this.finalBlob.type });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Моя реакция 😱' });
                    this.log('Shared!');
                    return;
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                this.log('Share: ' + err.name);
            }
        }
        
        this.log('Share not available');
        alert('Зажми видео и выбери "Сохранить"');
    }
};

// Init
document.addEventListener('DOMContentLoaded', () => Camera.init());

// Globals — теперь всё через showVideo()
function showReactionPreview() {
    Camera.showVideo();
}

function closeReactionPreview() {
    const overlay = document.getElementById('videoOverlay');
    if (overlay) overlay.remove();
    document.getElementById('results')?.classList.add('active');
}

function downloadReaction() {
    Camera.showVideo();
}

function shareReaction() {
    Camera.share();
}
