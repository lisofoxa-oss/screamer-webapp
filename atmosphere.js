// ============================================================
// atmosphere.js — Движок психологической атмосферы
// Управляет: аудио-слои, визуальные эффекты, микро-глюки,
// нагнетание, сценарии
// ============================================================

const ATM = {
    // === Сценарии ===
    SCENARIOS: {
        A: { name: 'slow_dread',  weight: 40, fakeRound: [5,6], realRound: [8,9],  buildup: 'full' },
        B: { name: 'early_strike', weight: 20, fakeRound: null,  realRound: [3,4],  buildup: 'none' },
        C: { name: 'double_fake', weight: 25, fakeRound: [3,4], realRound: [7,8],  buildup: 'full' },
        D: { name: 'silence',    weight: 15, fakeRound: [5,6], realRound: [9,10], buildup: 'silence' },
    },

    // === Фазы атмосферы ===
    PHASES: {
        calm:       { drone: 0.05, piano: 0.30, heart: 0.00, texture: 0.00, grain: 0.03, vignette: 0.50 },
        uneasy:     { drone: 0.10, piano: 0.25, heart: 0.05, texture: 0.03, grain: 0.05, vignette: 0.45 },
        tension:    { drone: 0.20, piano: 0.15, heart: 0.20, texture: 0.08, grain: 0.08, vignette: 0.35 },
        pre_strike: { drone: 0.30, piano: 0.05, heart: 0.35, texture: 0.12, grain: 0.12, vignette: 0.20 },
        false_calm: { drone: 0.03, piano: 0.10, heart: 0.00, texture: 0.00, grain: 0.03, vignette: 0.50 },
        silence:    { drone: 0.00, piano: 0.00, heart: 0.00, texture: 0.00, grain: 0.10, vignette: 0.15 },
        post:       { drone: 0.08, piano: 0.15, heart: 0.00, texture: 0.00, grain: 0.06, vignette: 0.40 },
    },

    // === Аномалии сердечек ===
    HEART_ANOMALIES: [
        { id: 'dark',     css: 'filter: brightness(0.82)', duration: 0 },
        { id: 'flicker',  css: 'opacity: 0',               duration: 50 },
        { id: 'drift',    dx: 2, dy: -1 },
        { id: 'delay',    touchDelay: 35 },
    ],

    // === Глюки интерфейса ===
    UI_GLITCHES: [
        { id: 'counter_blink',   target: '#heartsCounter', effect: 'opacity-blink', duration: 80 },
        { id: 'instruction_dots', target: '#instruction',  effect: 'text-replace',  text: '...', duration: 150 },
        { id: 'bg_flash',        target: '.background-image', effect: 'bg-swap',    duration: 33 },
        { id: 'screen_shift',    target: '#game',          effect: 'translate',     dx: 1, dy: -1, duration: 200 },
    ],
};

// ============================================================
// Atmosphere Engine
// ============================================================
class AtmosphereEngine {
    constructor() {
        this.scenario = null;
        this.phase = 'calm';
        this.round = 0;
        this.gameStartTime = 0;
        this.isActive = false;

        // Audio layers
        this.audio = {
            drone: null,
            piano: null,  // = ambientSound (already exists)
            heart: null,
            texture: null,
            riser: null,
        };

        // Timers
        this.driftTimer = null;
        this.glitchTimer = null;
        this.bgShiftTimer = null;
        this.heartbeatTimer = null;

        // State
        this.glitchesUsed = 0;
        this.anomaliesUsed = 0;
        this.bgFlashCount = 0;
        this.singleSoundPlayed = false;

        // CSS elements
        this.grainEl = document.querySelector('.noise');
        this.vignetteEl = document.querySelector('.vignette');
        this.bgEl = document.querySelector('.background-image');
        this.scanlines = null;

        this._createScanlines();
    }

    // --- Scenario Selection ---
    pickScenario() {
        const total = Object.values(ATM.SCENARIOS).reduce((s, v) => s + v.weight, 0);
        let r = Math.random() * total;
        for (const [key, sc] of Object.entries(ATM.SCENARIOS)) {
            r -= sc.weight;
            if (r <= 0) {
                this.scenario = { key, ...sc };
                console.log(`🎭 Scenario: ${key} (${sc.name})`);
                return this.scenario;
            }
        }
        this.scenario = { key: 'A', ...ATM.SCENARIOS.A };
        return this.scenario;
    }

    getScreamerRounds() {
        if (!this.scenario) this.pickScenario();
        const sc = this.scenario;
        const fakeRound = sc.fakeRound
            ? sc.fakeRound[0] + Math.floor(Math.random() * (sc.fakeRound[1] - sc.fakeRound[0] + 1))
            : -1;
        const realRound = sc.realRound[0] + Math.floor(Math.random() * (sc.realRound[1] - sc.realRound[0] + 1));
        return { fakeRound, realRound, scenarioKey: sc.key };
    }

    // --- Lifecycle ---
    start() {
        this.isActive = true;
        this.gameStartTime = Date.now();
        this.round = 0;
        this.glitchesUsed = 0;
        this.anomaliesUsed = 0;
        this.bgFlashCount = 0;
        this.singleSoundPlayed = false;

        this._initAudio();
        this.setPhase('calm');
        this._startDrift();
        this._startBgFlash();
        this._scheduleGlitch();
    }

    stop() {
        this.isActive = false;
        this._stopAllTimers();
        this._fadeAllAudio(0, 1000);
        this._resetVisuals();
    }

    // --- Round Hook (called from game.js) ---
    onRound(roundNum, isPreScreamer, isPostScreamer) {
        this.round = roundNum;

        if (!this.scenario) return;
        const sc = this.scenario;

        if (isPostScreamer) {
            this.setPhase('post');
            return;
        }

        // Phase progression based on scenario
        if (sc.buildup === 'none') {
            // Scenario B: stay calm until screamer
            this.setPhase('calm');

        } else if (sc.buildup === 'silence') {
            // Scenario D: progressive silence
            const realRound = sc.realRound[0];
            const roundsLeft = realRound - roundNum;
            if (roundsLeft > 4) this.setPhase('calm');
            else if (roundsLeft > 2) {
                this._fadeLayer('piano', 0.08, 8000);
                this._fadeLayer('drone', 0.03, 8000);
                this.setPhase('uneasy');
            }
            else if (roundsLeft > 0) this.setPhase('silence');
            else this.setPhase('silence');

        } else {
            // Scenario A, C: full buildup
            const realRound = sc.realRound[0];
            const roundsLeft = realRound - roundNum;
            if (roundsLeft > 5) this.setPhase('calm');
            else if (roundsLeft > 3) this.setPhase('uneasy');
            else if (roundsLeft > 1) this.setPhase('tension');
            else if (roundsLeft === 1) this.setPhase('pre_strike');
            else if (roundsLeft === 0) this.setPhase('false_calm');
        }

        // Heart anomaly chance (1 in 7, max 2 per game)
        if (this.anomaliesUsed < 2 && Math.random() < 0.14 && roundNum > 2) {
            this._scheduleHeartAnomaly();
        }
    }

    // --- Pre-screamer sequence ---
    prepareScreamer(callback) {
        // Called ~3 sec before actual screamer
        const sc = this.scenario;

        if (sc?.buildup === 'silence') {
            // Already silent — hold silence, then callback
            this._fadeAllAudio(0, 500);
            setTimeout(() => {
                // 2-4 sec of TOTAL silence
                const silenceDuration = 2000 + Math.random() * 2000;
                setTimeout(callback, silenceDuration);
            }, 600);

        } else if (sc?.buildup === 'none') {
            // No buildup — immediate
            callback();

        } else {
            // Full buildup: riser → false calm → silence → HIT
            this._playRiser();
            this.setPhase('pre_strike');

            // False calm after 2 sec
            setTimeout(() => {
                this.setPhase('false_calm');

                // Fade to silence
                setTimeout(() => {
                    this._fadeAllAudio(0, 1500);
                    this._setGrain(0.03);

                    // Total silence 1-2 sec → callback
                    setTimeout(() => {
                        const silenceMs = 1000 + Math.random() * 1500;
                        setTimeout(callback, silenceMs);
                    }, 1600);
                }, 1500);
            }, 2500);
        }
    }

    // --- Screamer moment enhancements ---
    onScreamer() {
        // Visual chaos
        this._flashRed(100);
        this._invertFlash(50);
        this._screenShake(60);

        // Haptic blast
        const tg = window.Telegram?.WebApp;
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('heavy');
            setTimeout(() => tg.HapticFeedback.notificationOccurred('error'), 100);
            setTimeout(() => tg.HapticFeedback.impactOccurred('heavy'), 200);
        }

        // Fullscreen if available
        if (tg?.isVersionAtLeast?.('8.0') && tg.requestFullscreen) {
            try { tg.requestFullscreen(); } catch(e) {}
        }
    }

    // ============================================================
    // AUDIO
    // ============================================================
    _initAudio() {
        // Piano = existing ambientSound
        this.audio.piano = document.getElementById('ambientSound');

        // Create audio layers if files exist
        const layers = ['drone', 'heart', 'texture'];
        layers.forEach(name => {
            const audio = new Audio();
            audio.loop = true;
            audio.volume = 0;
            audio.preload = 'auto';
            audio.src = `assets/sounds/${name}.mp3`;
            audio.addEventListener('error', () => {
                console.log(`Audio layer '${name}' not found — skipping`);
            });
            this.audio[name] = audio;
        });

        // Riser (not looped)
        this.audio.riser = new Audio();
        this.audio.riser.volume = 0;
        this.audio.riser.preload = 'auto';
        this.audio.riser.src = 'assets/sounds/riser.mp3';
    }

    _fadeLayer(name, targetVol, durationMs = 2000) {
        const audio = this.audio[name];
        if (!audio || !soundOn) return;

        const startVol = audio.volume;
        const diff = targetVol - startVol;
        const steps = 20;
        const stepMs = durationMs / steps;
        let step = 0;

        // Start playing if needed
        if (targetVol > 0 && audio.paused) {
            audio.play().catch(() => {});
        }

        const interval = setInterval(() => {
            step++;
            audio.volume = Math.max(0, Math.min(1, startVol + diff * (step / steps)));
            if (step >= steps) {
                clearInterval(interval);
                if (targetVol === 0) audio.pause();
            }
        }, stepMs);
    }

    _fadeAllAudio(targetVol, durationMs) {
        Object.keys(this.audio).forEach(name => {
            if (this.audio[name]) this._fadeLayer(name, targetVol, durationMs);
        });
    }

    _playRiser() {
        const riser = this.audio.riser;
        if (!riser || !soundOn) return;
        riser.currentTime = 0;
        riser.volume = 0;
        riser.play().catch(() => {});
        this._fadeLayer('riser', 0.25, 3000);
    }

    _playSingleSound() {
        // One creepy sound per game — very quiet
        if (this.singleSoundPlayed || !soundOn) return;
        this.singleSoundPlayed = true;

        // Use Web Audio for a subtle click/creak
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            // Random: either a click or a low tone
            if (Math.random() < 0.5) {
                // Click
                osc.frequency.value = 2000 + Math.random() * 1000;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.03, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
                osc.start();
                osc.stop(ctx.currentTime + 0.05);
            } else {
                // Low creak
                osc.frequency.value = 80 + Math.random() * 40;
                osc.type = 'sawtooth';
                gain.gain.setValueAtTime(0.02, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch(e) {}
    }

    // --- Volume drift (±5% every 15-25 sec) ---
    _startDrift() {
        if (this.driftTimer) clearInterval(this.driftTimer);
        this.driftTimer = setInterval(() => {
            if (!this.isActive || !soundOn) return;
            const piano = this.audio.piano;
            if (piano && !piano.paused) {
                const phase = ATM.PHASES[this.phase];
                const base = phase?.piano || 0.20;
                const drift = (Math.random() - 0.5) * base * 0.12; // ±6%
                piano.volume = Math.max(0, Math.min(1, piano.volume + drift));
            }
        }, 15000 + Math.random() * 10000);
    }

    // ============================================================
    // VISUALS
    // ============================================================
    setPhase(phaseName) {
        this.phase = phaseName;
        const p = ATM.PHASES[phaseName];
        if (!p) return;

        // Audio transitions
        Object.keys(p).forEach(key => {
            if (this.audio[key]) {
                this._fadeLayer(key, p[key], 3000);
            }
        });

        // Visual transitions
        this._setGrain(p.grain);
        this._setVignette(p.vignette);

        // Scanlines in tension phases
        if (['tension', 'pre_strike'].includes(phaseName)) {
            this._showScanlines(0.03);
        } else {
            this._showScanlines(0);
        }

        // Schedule single sound in uneasy phase
        if (phaseName === 'uneasy' && !this.singleSoundPlayed && Math.random() < 0.5) {
            setTimeout(() => this._playSingleSound(), 3000 + Math.random() * 5000);
        }

        // Heartbeat acceleration in tension
        if (phaseName === 'tension' && this.audio.heart) {
            this.audio.heart.playbackRate = 1.1;
        }
        if (phaseName === 'pre_strike' && this.audio.heart) {
            this.audio.heart.playbackRate = 1.3;
        }
    }

    _setGrain(opacity) {
        if (this.grainEl) {
            this.grainEl.style.transition = 'opacity 3s ease';
            this.grainEl.style.opacity = opacity;
        }
    }

    _setVignette(centerSize) {
        if (this.vignetteEl) {
            this.vignetteEl.style.transition = 'background 3s ease';
            const pct = Math.round(centerSize * 100);
            this.vignetteEl.style.background =
                `radial-gradient(ellipse at center, transparent ${pct}%, rgba(0,0,0,0.7) 100%)`;
        }
    }

    _createScanlines() {
        this.scanlines = document.createElement('div');
        this.scanlines.className = 'atm-scanlines';
        this.scanlines.style.cssText = `
            position:fixed; inset:0; pointer-events:none; z-index:50; opacity:0;
            transition: opacity 3s ease;
            background: repeating-linear-gradient(
                0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 3px
            );
        `;
        document.body.appendChild(this.scanlines);
    }

    _showScanlines(opacity) {
        if (this.scanlines) this.scanlines.style.opacity = opacity;
    }

    // --- Background flash (bg1 ↔ bg2, subliminal) ---
    _startBgFlash() {
        if (this.bgShiftTimer) clearTimeout(this.bgShiftTimer);
        const schedule = () => {
            if (!this.isActive) return;
            const delay = 25000 + Math.random() * 35000; // 25-60 sec
            this.bgShiftTimer = setTimeout(() => {
                if (!this.isActive || this.bgFlashCount >= 3) return;
                if (['calm', 'post'].includes(this.phase)) { schedule(); return; }

                this.bgFlashCount++;
                // Flash bg2 for 1-2 frames
                if (this.bgEl) {
                    this.bgEl.style.backgroundImage = "url('assets/images/bg2.jpg')";
                    setTimeout(() => {
                        if (this.bgEl) this.bgEl.style.backgroundImage = "url('assets/images/background.jpg')";
                    }, 16 + Math.floor(Math.random() * 17)); // 1-2 frames
                }
                schedule();
            }, delay);
        };
        schedule();
    }

    // --- Micro bg shift ---
    _microShift() {
        if (!this.bgEl || !this.isActive) return;
        const dx = (Math.random() - 0.5) * 2;
        const dy = (Math.random() - 0.5) * 2;
        this.bgEl.style.transition = 'transform 8s ease-in-out';
        this.bgEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.003)`;
        setTimeout(() => {
            if (this.bgEl) {
                this.bgEl.style.transform = 'translate(0,0) scale(1)';
            }
        }, 8000);
    }

    // --- Screamer visual effects ---
    _flashRed(durationMs) {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position:fixed; inset:0; background:rgba(180,0,0,0.4);
            z-index:105; pointer-events:none;
        `;
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), durationMs);
    }

    _invertFlash(durationMs) {
        document.body.style.filter = 'invert(1)';
        setTimeout(() => { document.body.style.filter = ''; }, durationMs);
    }

    _screenShake(durationMs) {
        const game = document.getElementById('game');
        if (!game) return;
        game.style.animation = `atmShake ${durationMs}ms linear`;
        setTimeout(() => { game.style.animation = ''; }, durationMs);
    }

    // ============================================================
    // GLITCHES & ANOMALIES
    // ============================================================
    _scheduleGlitch() {
        if (this.glitchTimer) clearTimeout(this.glitchTimer);
        const schedule = () => {
            if (!this.isActive) return;
            const delay = 20000 + Math.random() * 40000; // 20-60 sec
            this.glitchTimer = setTimeout(() => {
                if (!this.isActive || this.glitchesUsed >= 2) return;
                if (['calm'].includes(this.phase)) { schedule(); return; }

                this._doGlitch();
                schedule();
            }, delay);
        };
        schedule();
    }

    _doGlitch() {
        const glitch = ATM.UI_GLITCHES[Math.floor(Math.random() * ATM.UI_GLITCHES.length)];
        const target = document.querySelector(glitch.target);
        if (!target) return;

        this.glitchesUsed++;
        console.log(`👾 Glitch: ${glitch.id}`);

        switch (glitch.effect) {
            case 'opacity-blink':
                target.style.opacity = '0.3';
                setTimeout(() => { target.style.opacity = ''; }, glitch.duration);
                break;
            case 'text-replace':
                const orig = target.textContent;
                target.textContent = glitch.text;
                setTimeout(() => { target.textContent = orig; }, glitch.duration);
                break;
            case 'bg-swap':
                if (this.bgEl) {
                    this.bgEl.style.backgroundImage = "url('assets/images/bg2.jpg')";
                    setTimeout(() => {
                        this.bgEl.style.backgroundImage = "url('assets/images/background.jpg')";
                    }, glitch.duration);
                }
                break;
            case 'translate':
                target.style.transform = `translate(${glitch.dx}px, ${glitch.dy}px)`;
                setTimeout(() => { target.style.transform = ''; }, glitch.duration);
                break;
        }
    }

    _scheduleHeartAnomaly() {
        // Returns anomaly to apply to current heart, or null
        this.anomaliesUsed++;
        const anom = ATM.HEART_ANOMALIES[Math.floor(Math.random() * ATM.HEART_ANOMALIES.length)];
        console.log(`💔 Heart anomaly: ${anom.id}`);
        return anom;
    }

    getHeartAnomaly() {
        // Called from game.js when placing heart
        if (!this.isActive) return null;
        if (this.anomaliesUsed >= 2) return null;
        if (this.round < 3) return null;
        if (['calm', 'post'].includes(this.phase)) return null;
        if (Math.random() > 0.14) return null; // 1 in 7

        return this._scheduleHeartAnomaly();
    }

    // ============================================================
    // CLEANUP
    // ============================================================
    _stopAllTimers() {
        clearInterval(this.driftTimer);
        clearTimeout(this.glitchTimer);
        clearTimeout(this.bgShiftTimer);
        clearTimeout(this.heartbeatTimer);
    }

    _resetVisuals() {
        this._setGrain(0.03);
        this._setVignette(0.50);
        this._showScanlines(0);
        if (this.bgEl) {
            this.bgEl.style.transform = '';
            this.bgEl.style.backgroundImage = "url('assets/images/background.jpg')";
        }
        document.body.style.filter = '';
    }
}

// Add CSS animation for shake
const atmStyle = document.createElement('style');
atmStyle.textContent = `
    @keyframes atmShake {
        0%, 100% { transform: translate(0,0) }
        10% { transform: translate(-4px, 3px) }
        20% { transform: translate(5px, -2px) }
        30% { transform: translate(-3px, -4px) }
        40% { transform: translate(4px, 2px) }
        50% { transform: translate(-2px, 5px) }
        60% { transform: translate(3px, -3px) }
        70% { transform: translate(-5px, 1px) }
        80% { transform: translate(2px, -4px) }
        90% { transform: translate(-1px, 3px) }
    }
`;
document.head.appendChild(atmStyle);

// Global instance
const atmosphere = new AtmosphereEngine();
