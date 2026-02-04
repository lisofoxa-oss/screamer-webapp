// camera.js v6 — DEBUG WITH ALERTS

const Camera = {
    stream: null,
    mediaRecorder: null,
    chunks: [],
    finalBlob: null,
    dataUrl: null,
    enabled: false,
    permissionGranted: false,
    mimeType: null,
    
    previewEl: null,
    videoEl: null,

    init() {
        this.previewEl = document.getElementById('cameraPreview');
        this.videoEl = document.getElementById('cameraVideo');
        
        // Проверки
        if (!navigator.mediaDevices?.getUserMedia) {
            console.log('📷 No getUserMedia');
            return;
        }
        if (!window.MediaRecorder) {
            console.log('📷 No MediaRecorder');
            return;
        }
        
        // Формат
        this.mimeType = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4']
            .find(t => MediaRecorder.isTypeSupported(t));
        
        if (!this.mimeType) {
            console.log('📷 No format');
            return;
        }
        
        console.log('📷 Ready:', this.mimeType);
        
        // Чекбокс
        const cb = document.getElementById('cameraCheckbox');
        if (cb) {
            cb.addEventListener('change', e => {
                if (e.target.checked) this.requestPermission();
                else this.stopStream();
            });
        }
    },

    async requestPermission() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
            if (this.videoEl) {
                this.videoEl.srcObject = this.stream;
                this.videoEl.play().catch(()=>{});
            }
            if (this.previewEl) this.previewEl.classList.add('active');
            this.permissionGranted = true;
            console.log('📷 Permission OK');
        } catch (e) {
            console.log('📷 Permission denied:', e.name);
            this.permissionGranted = false;
        }
    },

    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.previewEl) this.previewEl.classList.remove('active');
        this.permissionGranted = false;
    },

    isEnabled() {
        const cb = document.getElementById('cameraCheckbox');
        return cb?.checked && this.permissionGranted && this.stream;
    },

    start() {
        // DEBUG ALERT
        alert('Camera.start() called!\nisEnabled: ' + this.isEnabled() + '\nstream: ' + !!this.stream);
        
        console.log('📷 start() called');
        
        if (!this.isEnabled()) {
            console.log('📷 Not enabled, skip');
            return;
        }

        this.chunks = [];
        this.finalBlob = null;
        this.dataUrl = null;

        try {
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: this.mimeType
            });

            this.mediaRecorder.ondataavailable = e => {
                if (e.data?.size > 0) {
                    this.chunks.push(e.data);
                    console.log('📷 Chunk', this.chunks.length, e.data.size);
                }
            };

            this.mediaRecorder.onstart = () => {
                console.log('📷 Recording started');
                this.enabled = true;
            };

            this.mediaRecorder.onstop = () => {
                console.log('📷 Recording stopped, chunks:', this.chunks.length);
            };

            this.mediaRecorder.onerror = e => {
                console.log('📷 Error:', e.error);
            };

            // Старт с интервалом 500ms
            this.mediaRecorder.start(500);
            
        } catch (e) {
            console.log('📷 Start error:', e);
        }
    },

    onScreamer() {
        // DEBUG ALERT
        alert('onScreamer!\nenabled: ' + this.enabled + '\nchunks: ' + this.chunks.length);
        
        console.log('📷 onScreamer, enabled:', this.enabled, 'chunks:', this.chunks.length);
        
        if (!this.enabled || !this.mediaRecorder) return;
        if (this.mediaRecorder.state !== 'recording') return;

        // Ждём 3 сек и останавливаем
        setTimeout(() => {
            console.log('📷 Stopping after 3s...');
            
            if (this.mediaRecorder?.state === 'recording') {
                this.mediaRecorder.stop();
            }
            
            // Ждём ещё чуть и создаём blob
            setTimeout(() => this.createBlob(), 500);
        }, 3000);
    },

    createBlob() {
        console.log('📷 createBlob, chunks:', this.chunks.length);
        
        if (this.chunks.length === 0) {
            console.log('📷 No chunks!');
            return;
        }

        this.finalBlob = new Blob(this.chunks, { type: this.mimeType });
        console.log('📷 Blob size:', this.finalBlob.size);

        // Конвертируем в data URL
        const reader = new FileReader();
        reader.onload = () => {
            this.dataUrl = reader.result;
            console.log('📷 DataURL ready, length:', this.dataUrl.length);
            
            // Показываем кнопку
            const btn = document.getElementById('viewReactionBtn');
            if (btn) {
                btn.style.display = 'block';
                console.log('📷 Button shown');
            }
        };
        reader.readAsDataURL(this.finalBlob);
    },

    stop() {
        if (this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop();
        }
        this.enabled = false;
    },

    reset() {
        this.chunks = [];
        this.finalBlob = null;
        this.dataUrl = null;
        this.enabled = false;
        const btn = document.getElementById('viewReactionBtn');
        if (btn) btn.style.display = 'none';
    },

    showVideo() {
        // ALERT для отладки
        alert('showVideo called!\ndataUrl: ' + (this.dataUrl ? 'YES ' + this.dataUrl.length : 'NO'));
        
        if (!this.dataUrl) {
            alert('Видео не готово');
            return;
        }

        // Fullscreen overlay
        let ov = document.getElementById('camOverlay');
        if (ov) ov.remove();

        ov = document.createElement('div');
        ov.id = 'camOverlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
        
        ov.innerHTML = `
            <p style="color:#fff;margin-bottom:15px;">Твоя реакция 😱</p>
            <video controls playsinline style="max-width:90%;max-height:50vh;background:#222;"></video>
            <p style="color:#888;font-size:12px;margin-top:15px;text-align:center;">
                📱 Зажми видео → Сохранить
            </p>
            <button style="margin-top:20px;padding:12px 30px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;">
                Закрыть
            </button>
        `;
        
        document.body.appendChild(ov);
        
        const video = ov.querySelector('video');
        video.src = this.dataUrl;
        
        ov.querySelector('button').onclick = () => ov.remove();
    },

    share() {
        if (!this.finalBlob) return;
        
        if (navigator.share) {
            const file = new File([this.finalBlob], 'reaction.webm', { type: this.mimeType });
            navigator.share({ files: [file] }).catch(() => {});
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Camera.init());

function showReactionPreview() {
    Camera.showVideo();
}

function closeReactionPreview() {
    const ov = document.getElementById('camOverlay');
    if (ov) ov.remove();
}

function downloadReaction() {
    Camera.showVideo();
}

function shareReaction() {
    Camera.share();
}
