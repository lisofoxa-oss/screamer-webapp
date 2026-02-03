// ============================================================
// camera.js v6 — Android / Telegram WebView SAFE
// 5s BEFORE + 3s AFTER screamer
// ============================================================

const Camera = {
    stream: null,
    recorder: null,
    chunks: [],
    recording: false,
    finalBlob: null,
    videoUrl: null,

    PRE_MS: 5000,
    POST_MS: 3000,
    TIMESLICE: 250,

    videoEl: null,
    previewEl: null,

    mimeType: 'video/webm;codecs=vp8',

    // ============================================================
    // INIT
    // ============================================================

    init() {
        this.videoEl = document.getElementById('cameraVideo');
        this.previewEl = document.getElementById('cameraPreview');

        if (!navigator.mediaDevices?.getUserMedia) return false;
        if (!window.MediaRecorder) return false;

        if (!MediaRecorder.isTypeSupported(this.mimeType)) {
            this.mimeType = 'video/webm';
        }

        return true;
    },

    // ============================================================
    // CAMERA
    // ============================================================

    async startCamera() {
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 480 },
                height: { ideal: 640 }
            },
            audio: false
        });

        this.videoEl.srcObject = this.stream;
        this.videoEl.play().catch(() => {});
        this.previewEl?.classList.add('active');

        this.startRecording();
    },

    stopCamera() {
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;
    },

    // ============================================================
    // RECORDING (ring buffer)
    // ============================================================

    startRecording() {
        this.chunks = [];
        this.recording = true;
        this.finalBlob = null;
        this.videoUrl = null;

        this.recorder = new MediaRecorder(this.stream, {
            mimeType: this.mimeType,
            videoBitsPerSecond: 900_000
        });

        this.recorder.ondataavailable = e => {
            if (!e.data || e.data.size === 0) return;

            const now = Date.now();
            this.chunks.push({ blob: e.data, time: now });

            // 🔁 ring buffer: храним только 5 секунд
            const cutoff = now - this.PRE_MS;
            this.chunks = this.chunks.filter(c => c.time >= cutoff);
        };

        this.recorder.onstop = () => {
            const blobs = this.chunks.map(c => c.blob);
            this.finalBlob = new Blob(blobs, { type: this.mimeType });
            this.videoUrl = URL.createObjectURL(this.finalBlob);
        };

        this.recorder.start(this.TIMESLICE);
    },

    // ============================================================
    // SCREAMER
    // ============================================================

    onScreamer() {
        if (!this.recording || !this.recorder) return;

        this.recording = false;

        // 👇 продолжаем писать ещё 3 секунды
        setTimeout(() => {
            if (this.recorder.state === 'recording') {
                this.recorder.stop();
            }
        }, this.POST_MS);
    },

    // ============================================================
    // PREVIEW / SHARE
    // ============================================================

    showVideo() {
        if (!this.videoUrl) {
            alert('Видео ещё готовится');
            return;
        }

        let overlay = document.getElementById('videoOverlay');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'videoOverlay';
        overlay.style.cssText = `
            position:fixed;
            inset:0;
            background:#000;
            z-index:99999;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            padding:15px;
        `;

        overlay.innerHTML = `
            <video controls playsinline
                style="max-width:100%;max-height:60vh;border-radius:10px">
            </video>
            <div style="margin-top:15px;display:flex;gap:10px">
                <button id="closeVid">Закрыть</button>
                <button id="shareVid">Поделиться</button>
            </div>
        `;

        document.body.appendChild(overlay);

        const video = overlay.querySelector('video');
        video.src = this.videoUrl;

        overlay.querySelector('#closeVid').onclick = () => overlay.remove();
        overlay.querySelector('#shareVid').onclick = () => this.share();
    },

    async share() {
        if (!this.finalBlob) return;

        const file = new File([this.finalBlob], 'reaction.webm', {
            type: this.finalBlob.type
        });

        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file] });
        } else {
            alert('Зажми видео → Сохранить');
        }
    }
};

// ============================================================
// GLOBALS
// ============================================================

document.addEventListener('DOMContentLoaded', () => Camera.init());

function startCamera() {
    Camera.startCamera();
}

function onScreamer() {
    Camera.onScreamer();
}

function showReactionPreview() {
    Camera.showVideo();
}
