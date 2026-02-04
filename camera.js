// camera.js v7 — Fixed trimming + Save button

const Camera = {
    stream: null,
    mediaRecorder: null,
    chunks: [],          // {data, time}
    screamerTime: 0,
    finalBlob: null,
    dataUrl: null,
    enabled: false,
    permissionGranted: false,
    mimeType: null,
    
    BEFORE_MS: 5000,     // 5 сек до скримера
    AFTER_MS: 3000,      // 3 сек после
    
    previewEl: null,
    videoEl: null,

    init() {
        this.previewEl = document.getElementById('cameraPreview');
        this.videoEl = document.getElementById('cameraVideo');
        
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            console.log('📷 Not supported');
            return;
        }
        
        this.mimeType = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4']
            .find(t => MediaRecorder.isTypeSupported(t));
        
        if (!this.mimeType) return;
        
        console.log('📷 Ready:', this.mimeType);
        
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
        } catch (e) {
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
        console.log('📷 start()');
        if (!this.isEnabled()) return;

        this.chunks = [];
        this.screamerTime = 0;
        this.finalBlob = null;
        this.dataUrl = null;

        try {
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });

            this.mediaRecorder.ondataavailable = e => {
                if (e.data?.size > 0) {
                    this.chunks.push({ data: e.data, time: Date.now() });
                    console.log('📷 Chunk', this.chunks.length);
                }
            };

            this.mediaRecorder.onstart = () => {
                this.enabled = true;
                console.log('📷 Recording');
            };

            this.mediaRecorder.start(500);
        } catch (e) {
            console.log('📷 Error:', e);
        }
    },

    onScreamer() {
        console.log('📷 onScreamer, chunks:', this.chunks.length);
        if (!this.enabled || !this.mediaRecorder) return;
        if (this.mediaRecorder.state !== 'recording') return;

        this.screamerTime = Date.now();
        console.log('📷 Screamer time:', this.screamerTime);

        // Ждём AFTER_MS и останавливаем
        setTimeout(() => {
            console.log('📷 Stopping...');
            
            if (this.mediaRecorder?.state === 'recording') {
                // Запрашиваем последние данные
                this.mediaRecorder.requestData();
                
                // Останавливаем через небольшую паузу
                setTimeout(() => {
                    if (this.mediaRecorder?.state === 'recording') {
                        this.mediaRecorder.stop();
                    }
                    // Ждём onstop и создаём blob
                    setTimeout(() => this.createBlob(), 800);
                }, 300);
            }
        }, this.AFTER_MS);
    },

    createBlob() {
        console.log('📷 createBlob, total chunks:', this.chunks.length);
        
        if (this.chunks.length === 0) return;

        // Обрезаем по времени: BEFORE_MS до скримера + AFTER_MS после
        const startTime = this.screamerTime - this.BEFORE_MS;
        const endTime = this.screamerTime + this.AFTER_MS + 1000; // +1с запас
        
        const trimmedChunks = this.chunks.filter(c => 
            c.time >= startTime && c.time <= endTime
        );
        
        console.log('📷 Trimmed chunks:', trimmedChunks.length, 'of', this.chunks.length);
        
        // Если после обрезки мало — берём последние 16 чанков (~8 сек)
        const useChunks = trimmedChunks.length >= 3 ? trimmedChunks : this.chunks.slice(-16);
        
        const blobs = useChunks.map(c => c.data);
        this.finalBlob = new Blob(blobs, { type: this.mimeType });
        
        console.log('📷 Blob:', Math.round(this.finalBlob.size / 1024), 'KB');

        // Конвертируем в data URL
        const reader = new FileReader();
        reader.onload = () => {
            this.dataUrl = reader.result;
            console.log('📷 DataURL ready');
            
            const btn = document.getElementById('viewReactionBtn');
            if (btn) btn.style.display = 'block';
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
        this.screamerTime = 0;
        this.enabled = false;
        const btn = document.getElementById('viewReactionBtn');
        if (btn) btn.style.display = 'none';
    },

    showVideo() {
        if (!this.dataUrl) {
            alert('Видео не готово, подожди');
            return;
        }

        // Fullscreen overlay
        let ov = document.getElementById('camOverlay');
        if (ov) ov.remove();

        ov = document.createElement('div');
        ov.id = 'camOverlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:15px;';
        
        ov.innerHTML = `
            <p style="color:#fff;font-size:16px;margin-bottom:12px;">Твоя реакция 😱</p>
            <video id="reactionVid" controls playsinline style="max-width:95%;max-height:50vh;background:#111;border-radius:8px;"></video>
            <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;justify-content:center;">
                <button id="btnSave" style="padding:12px 24px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:bold;">
                    💾 Сохранить
                </button>
                <button id="btnShare" style="padding:12px 24px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;font-size:14px;">
                    📤 Поделиться
                </button>
                <button id="btnClose" style="padding:12px 24px;background:#333;color:#fff;border:none;border-radius:8px;font-size:14px;">
                    ✕ Закрыть
                </button>
            </div>
            <p style="color:#666;font-size:11px;margin-top:15px;text-align:center;">
                Если кнопка не работает: зажми видео → Сохранить
            </p>
        `;
        
        document.body.appendChild(ov);
        
        // Video
        const video = document.getElementById('reactionVid');
        video.src = this.dataUrl;
        
        // Buttons
        document.getElementById('btnClose').onclick = () => ov.remove();
        document.getElementById('btnSave').onclick = () => this.saveVideo();
        document.getElementById('btnShare').onclick = () => this.shareVideo();
    },

    saveVideo() {
        if (!this.finalBlob) return;
        
        console.log('📷 Saving...');
        
        // Способ 1: Web Share API с возможностью сохранения
        if (navigator.canShare && navigator.share) {
            const file = new File([this.finalBlob], 'reaction.webm', { type: this.mimeType });
            
            if (navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Моя реакция'
                }).then(() => {
                    console.log('📷 Shared/Saved');
                }).catch(e => {
                    if (e.name !== 'AbortError') {
                        console.log('📷 Share error:', e);
                        this.fallbackSave();
                    }
                });
                return;
            }
        }
        
        this.fallbackSave();
    },
    
    fallbackSave() {
        // Способ 2: Классический download (может не работать в Telegram)
        console.log('📷 Fallback save...');
        
        try {
            const a = document.createElement('a');
            a.href = this.dataUrl;
            a.download = 'reaction.webm';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            console.log('📷 Download error:', e);
            alert('Зажми видео и выбери "Сохранить видео"');
        }
    },

    shareVideo() {
        if (!this.finalBlob) return;
        
        if (navigator.share) {
            const file = new File([this.finalBlob], 'reaction.webm', { type: this.mimeType });
            navigator.share({ 
                files: [file],
                title: 'Моя реакция на Чёрную Розу 😱'
            }).catch(() => {});
        } else {
            alert('Поделиться недоступно');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Camera.init());

function showReactionPreview() { Camera.showVideo(); }
function closeReactionPreview() { document.getElementById('camOverlay')?.remove(); }
function downloadReaction() { Camera.saveVideo(); }
function shareReaction() { Camera.shareVideo(); }
