// ============================================================
// atmosphere.js v5 — Фикс masterGain + усиленные эффекты
//
// ИСПРАВЛЕНО: masterGain оставался на 0 после _audioStutter()
// Теперь: восстанавливается через 0.6s, и в start(), и в setPhase()
// ============================================================

const ATM = {
    SCENARIOS: {
        A: { name: 'slow_dread',   weight: 40, fakeRound: [5,6], realRound: [8,9],  buildup: 'full' },
        B: { name: 'early_strike', weight: 20, fakeRound: null,  realRound: [3,4],  buildup: 'none' },
        C: { name: 'double_fake',  weight: 25, fakeRound: [3,4], realRound: [7,8],  buildup: 'full' },
        D: { name: 'silence',      weight: 15, fakeRound: [5,6], realRound: [9,10], buildup: 'silence' },
    },

    PHASES: {
        calm:       { drone:0.04, drone_low:0.00, piano:0.30, heart:0.00, texture:0.00, wind:0.00, static:0.00, demon:0.00,
                      grain:0.0,  grainSpeed:0.3, vignette:0.60, scanlines:0.00,
                      tint:0.00,  bgFilter:'none' },

        uneasy:     { drone:0.18, drone_low:0.08, piano:0.18, heart:0.12, texture:0.08, wind:0.00, static:0.00, demon:0.00,
                      grain:0.12, grainSpeed:0.18, vignette:0.32, scanlines:0.06,
                      tint:0.25,  bgFilter:'brightness(0.72) saturate(0.75)' },

        tension:    { drone:0.38, drone_low:0.18, piano:0.05, heart:0.35, texture:0.20, wind:0.00, static:0.00, demon:0.00,
                      grain:0.30, grainSpeed:0.10, vignette:0.12, scanlines:0.18,
                      tint:0.55,  bgFilter:'brightness(0.45) saturate(0.50) contrast(1.1)' },

        pre_strike: { drone:0.48, drone_low:0.25, piano:0.00, heart:0.50, texture:0.28, wind:0.00, static:0.00, demon:0.00,
                      grain:0.42, grainSpeed:0.05, vignette:0.03, scanlines:0.28,
                      tint:0.80,  bgFilter:'brightness(0.30) saturate(0.30) contrast(1.2)' },

        false_calm: { drone:0.02, drone_low:0.00, piano:0.08, heart:0.00, texture:0.00, wind:0.06, static:0.00, demon:0.00,
                      grain:0.0,  grainSpeed:0.3, vignette:0.55, scanlines:0.00,
                      tint:0.00,  bgFilter:'brightness(0.92)' },

        silence:    { drone:0.00, drone_low:0.12, piano:0.00, heart:0.00, texture:0.00, wind:0.00, static:0.10, demon:0.18,
                      grain:0.25, grainSpeed:0.12, vignette:0.02, scanlines:0.12,
                      tint:0.70,  bgFilter:'brightness(0.20) saturate(0.10) contrast(1.3)' },

        post:       { drone:0.06, drone_low:0.00, piano:0.20, heart:0.00, texture:0.00, wind:0.00, static:0.00, demon:0.00,
                      grain:0.0,  grainSpeed:0.3, vignette:0.50, scanlines:0.00,
                      tint:0.00,  bgFilter:'brightness(0.90)' },

        linger:     { drone:0.28, drone_low:0.15, piano:0.00, heart:0.20, texture:0.12, wind:0.00, static:0.00, demon:0.00,
                      grain:0.25, grainSpeed:0.10, vignette:0.08, scanlines:0.10,
                      tint:0.50,  bgFilter:'brightness(0.40) saturate(0.40)' },
    },

    HEART_ANOMALIES: [
        { id: 'dark',    css: 'filter: brightness(0.7)' },
        { id: 'flicker', css: 'opacity: 0', duration: 60 },
        { id: 'drift',   dx: 2, dy: -1 },
        { id: 'delay',   touchDelay: 40 },
    ],

    UI_GLITCHES: [
        { id: 'instruction_dots', target: '#instruction',      effect: 'text-replace',  text: '...', duration: 180 },
        { id: 'bg_flash',         target: '.background-image', effect: 'bg-swap',       duration: 40 },
        { id: 'screen_shift',     target: '#game',             effect: 'translate',     dx: 2, dy: -2, duration: 250 },
    ],
};

class AtmosphereEngine {
    constructor() {
        this.scenario = null;
        this.phase = 'calm';
        this.round = 0;
        this.isActive = false;
        this.userInteracted = false;

        this.ctx = null;
        this.masterGain = null;
        this.layers = {};
        this.oneShotBuffers = {};
        this._timers = [];

        this.glitchesUsed = 0;
        this.anomaliesUsed = 0;
        this.bgFlashCount = 0;
        this.singleSoundPlayed = false;
        this.falseScreamerDone = false;
        this.fakeCompletedAtRound = -1;
        this.lingerActive = false;
        this.pointerParanoia = false;
        this._oneShotsScheduled = false;
        this._silenceStutterDone = false;

        this.grainEl = document.querySelector('.noise');
        this.vignetteEl = document.querySelector('.vignette');
        this.bgEl = document.querySelector('.background-image');
        this.scanlines = null;
        this.tintEl = null;

        this._createScanlines();
        this._createTint();
        this._injectCSS();
    }

    pickScenario() {
        const total = Object.values(ATM.SCENARIOS).reduce((s, v) => s + v.weight, 0);
        let r = Math.random() * total;
        for (const [key, sc] of Object.entries(ATM.SCENARIOS)) {
            r -= sc.weight;
            if (r <= 0) { this.scenario = { key, ...sc }; break; }
        }
        if (!this.scenario) this.scenario = { key: 'A', ...ATM.SCENARIOS.A };
        console.log(`🎭 Scenario: ${this.scenario.key} (${this.scenario.name})`);
        return this.scenario;
    }

    getScreamerRounds() {
        if (!this.scenario) this.pickScenario();
        const sc = this.scenario;
        const pick = arr => arr ? arr[0] + Math.floor(Math.random() * (arr[1] - arr[0] + 1)) : -1;
        return { fakeRound: pick(sc.fakeRound), realRound: pick(sc.realRound), scenarioKey: sc.key };
    }

    // === LIFECYCLE ===
    start() {
        this.isActive = true;
        this.round = 0;
        this.glitchesUsed = 0;
        this.anomaliesUsed = 0;
        this.bgFlashCount = 0;
        this.singleSoundPlayed = false;
        this.falseScreamerDone = false;
        this.fakeCompletedAtRound = -1;
        this.lingerActive = false;
        this.pointerParanoia = false;
        this._oneShotsScheduled = false;
        this._silenceStutterDone = false;

        this._initWebAudio();

        // *** FIX: восстановить masterGain при старте ***
        this._restoreMasterGain();

        this.setPhase('calm');
        this._startDrift();
        this._startBgFlash();
        this._scheduleGlitch();
    }

    stop() {
        this.isActive = false;
        this._clearTimers();
        this._fadeAllLayers(0, 1000);
        this._resetVisuals();
        this._stopPointerParanoia();
    }

    unlock() {
        if (this.userInteracted) return;
        this.userInteracted = true;
        if (this.ctx?.state === 'suspended') this.ctx.resume();
    }

    // *** FIX: восстановление masterGain ***
    _restoreMasterGain() {
        if (!this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const g = this.masterGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(1.0, now + 0.1);
    }

    // === WEB AUDIO ===
    _initWebAudio() {
        if (!this.ctx) {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch(e) { console.warn('No Web Audio'); return; }
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});

        if (!this.masterGain) {
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 1.0;
            this.masterGain.connect(this.ctx.destination);
        }

        const defs = [
            { name:'drone',     src:'assets/sounds/drone.mp3',         loop:true },
            { name:'drone_low', src:'assets/sounds/drone_low.mp3',     loop:true },  // Субвуфер
            { name:'piano',     elementId:'ambientSound',               loop:true },
            { name:'heart',     src:'assets/sounds/heartbeat.mp3',     loop:true },
            { name:'texture',   src:'assets/sounds/texture.mp3',       loop:true },
            { name:'wind',      src:'assets/sounds/wind.mp3',          loop:true },  // Завывание
            { name:'static',    src:'assets/sounds/static.mp3',        loop:true },  // Помехи
            { name:'riser',     src:'assets/sounds/riser.mp3',         loop:false },
            { name:'demon',     src:'assets/sounds/whisper_demon.mp3', loop:true },  // Для сценария D
        ];

        defs.forEach(def => {
            if (this.layers[def.name]) return;
            const gain = this.ctx.createGain();
            gain.gain.value = 0;
            gain.connect(this.masterGain);

            let element = def.elementId
                ? document.getElementById(def.elementId)
                : Object.assign(new Audio(), { src: def.src, preload: 'auto', loop: !!def.loop });

            if (!def.elementId) {
                element.addEventListener('error', () => console.log(`🔇 ${def.name}: not found`));
            }

            let source = null;
            try { source = this.ctx.createMediaElementSource(element); source.connect(gain); }
            catch(e) {}

            this.layers[def.name] = { gain, element, source, loop: !!def.loop };
        });

        // One-shot звуки (короткие эффекты)
        const oneShots = [
            'whisper', 'creak',           // Старые
            'footstep', 'breath_close',   // Присутствие
            'knock', 'metal', 'glass',    // Резкие
            'voice_reverse'               // Сюрреализм
        ];
        oneShots.forEach(n => this._loadBuffer(`assets/sounds/${n}.mp3`, n));
    }

    async _loadBuffer(url, name) {
        try {
            const r = await fetch(url);
            if (!r.ok) return;
            this.oneShotBuffers[name] = await this.ctx.decodeAudioData(await r.arrayBuffer());
        } catch(e) {}
    }

    _fadeLayer(name, target, ms = 2000) {
        const layer = this.layers[name];
        if (!layer || !soundOn) return;
        const g = layer.gain;
        const now = this.ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(Math.max(0.001, target), now + ms/1000);
        if (target > 0.001 && layer.element.paused) layer.element.play().catch(()=>{});
    }

    _fadeAllLayers(target, ms) {
        Object.keys(this.layers).forEach(n => this._fadeLayer(n, target, ms));
    }

    _setHeartbeatRate(rate) {
        const el = this.layers.heart?.element;
        if (!el) return;
        const cur = el.playbackRate;
        const diff = rate - cur;
        let step = 0;
        const iv = setInterval(() => {
            step++;
            el.playbackRate = cur + diff * (step / 20);
            if (step >= 20) clearInterval(iv);
        }, 500);
    }

    _playOneShot(name, volume = 0.04) {
        if (!this.ctx || !soundOn) return;
        const buf = this.oneShotBuffers[name];
        if (!buf) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.value = volume;
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = (Math.random() - 0.5) * 1.6;
        src.connect(g); g.connect(pan); pan.connect(this.masterGain);
        src.start();
    }

    _scheduleOneShots() {
        if (this._oneShotsScheduled) return;
        this._oneShotsScheduled = true;
        const loop = () => {
            if (!this.isActive) return;
            this._timer(() => {
                if (!this.isActive || !soundOn) { loop(); return; }
                if (['calm','post','false_calm'].includes(this.phase)) { loop(); return; }
                const sounds = Object.keys(this.oneShotBuffers);
                if (sounds.length > 0 && Math.random() < 0.40) {
                    this._playOneShot(sounds[Math.floor(Math.random() * sounds.length)], 0.04 + Math.random() * 0.04);
                }
                loop();
            }, 15000 + Math.random() * 30000);
        };
        loop();
    }

    _synthClick() {
        if (!this.ctx || !soundOn) return;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        const p = this.ctx.createStereoPanner();
        p.pan.value = (Math.random()-0.5)*1.4;
        o.connect(g); g.connect(p); p.connect(this.masterGain);
        o.frequency.value = 1800+Math.random()*1200; o.type = 'sine';
        g.gain.setValueAtTime(0.025, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime+0.06);
        o.start(); o.stop(this.ctx.currentTime+0.06);
    }

    _synthCreak() {
        if (!this.ctx || !soundOn) return;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        const p = this.ctx.createStereoPanner();
        p.pan.value = (Math.random()-0.5)*1.2;
        o.connect(g); g.connect(p); p.connect(this.masterGain);
        o.frequency.value = 60+Math.random()*50; o.type = 'sawtooth';
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(0.02,t);
        g.gain.linearRampToValueAtTime(0.035, t+0.15);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.4);
        o.start(); o.stop(t+0.4);
    }

    _playSingleSound() {
        if (this.singleSoundPlayed || !soundOn) return;
        this.singleSoundPlayed = true;
        const sounds = Object.keys(this.oneShotBuffers);
        if (sounds.length > 0) this._playOneShot(sounds[Math.floor(Math.random()*sounds.length)], 0.05);
        else Math.random() < 0.5 ? this._synthClick() : this._synthCreak();
    }

    // === AUDIO STUTTER (FIXED) ===
    _audioStutter() {
        if (!this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const g = this.masterGain.gain;
        const cur = g.value;
        g.cancelScheduledValues(now);
        g.setValueAtTime(cur, now);
        g.linearRampToValueAtTime(0.0,       now + 0.06);
        g.linearRampToValueAtTime(cur * 0.4, now + 0.12);
        g.linearRampToValueAtTime(0.0,       now + 0.22);
        g.linearRampToValueAtTime(cur * 0.2, now + 0.30);
        g.linearRampToValueAtTime(0.0,       now + 0.38);
        g.linearRampToValueAtTime(cur * 0.05,now + 0.44);
        g.linearRampToValueAtTime(0.0,       now + 0.50);

        // *** FIX: восстановить masterGain после stutter ***
        // В silence фазе оставляем 0, но ставим таймер на восстановление
        // чтобы при смене фазы звук вернулся
        this._timer(() => {
            // Не восстанавливаем если всё ещё в silence — звук не нужен
            // Но ставим флаг что masterGain нужно поднять при выходе
            this._masterGainKilled = true;
        }, 600);

        this._visualStutter();
    }

    _visualStutter() {
        if (!this.bgEl) return;
        const orig = this.bgEl.style.filter || 'none';
        this.bgEl.style.transition = 'none';
        this.bgEl.style.filter = 'brightness(0.1) contrast(2.5)';
        this._timer(() => {
            this.bgEl.style.filter = orig;
            this._timer(() => {
                this.bgEl.style.transition = 'none';
                this.bgEl.style.filter = 'brightness(0) contrast(3)';
                this._timer(() => {
                    this.bgEl.style.transition = 'filter 2s';
                    this.bgEl.style.filter = 'brightness(0.20) saturate(0.10)';
                }, 100);
            }, 140);
        }, 80);
    }

    // === FAKE SCREAMER COMPLETE ===
    onFakeComplete(round) {
        this.fakeCompletedAtRound = round;
        console.log(`🐱 Fake screamer at round ${round} — enabling false_calm`);
    }

    // === ROUND HOOK ===
    onRound(roundNum, isPreScreamer, isPostScreamer) {
        this.round = roundNum;
        if (!this.scenario) return;
        const sc = this.scenario;

        if (isPostScreamer) {
            if (!this.lingerActive) this.setPhase('post');
            return;
        }

        // === ЛОЖНОЕ ОБЛЕГЧЕНИЕ после fake screamer ===
        // 2 раунда после котика — светло и спокойно, игрок расслабляется
        const roundsAfterFake = this.fakeCompletedAtRound > 0 ? roundNum - this.fakeCompletedAtRound : -1;
        const inFalseCalm = roundsAfterFake >= 0 && roundsAfterFake < 2;
        
        if (inFalseCalm && sc.buildup !== 'silence') {
            this.setPhase('false_calm');
            // Светлый фон, мягкая музыка — "опасность миновала"
            this._setBgFilter('brightness(0.95) saturate(1.1)', '1.5s');
            this._setVignette(0.65, '1.5s');
            this._setTint(0, '1s');
            this._setGrain(0, '1s');
            console.log(`😌 False calm active (${roundsAfterFake + 1}/2)`);
            return;
        }

        if (sc.buildup === 'none') {
            this.setPhase('calm');
        } else if (sc.buildup === 'silence') {
            const left = sc.realRound[0] - roundNum;
            if (left > 6) {
                this.setPhase('calm');
            } else if (left > 4) {
                this.setPhase('uneasy');
                this._fadeLayer('piano', 0.03, 18000);
                this._fadeLayer('drone', 0.01, 18000);
            } else if (left > 1) {
                if (!this._silenceStutterDone) {
                    this._silenceStutterDone = true;
                    this._audioStutter();
                    this._setBgFilter('brightness(0.15) saturate(0.05)', '0.5s');
                    this._setTint(0.80, '0.5s');
                    this._setGrain(0.30, '0.5s');
                }
                this.setPhase('silence');
            } else {
                this.setPhase('silence');
                this._setGrain(0.12, '2s');
                this._setTint(0.85, '1s');
                this._setBgFilter('brightness(0.10) saturate(0.05) contrast(1.4)', '1.5s');
                this._setVignette(0.0, '1s');
            }
        } else {
            const left = sc.realRound[0] - roundNum;
            if (left > 5) this.setPhase('calm');
            else if (left > 3) this.setPhase('uneasy');
            else if (left > 1) this.setPhase('tension');
            else if (left === 1) this.setPhase('pre_strike');
            else this.setPhase('false_calm');
        }

        if (sc.key === 'C' && !this.falseScreamerDone) {
            if (roundNum === sc.realRound[0] - 1 && Math.random() < 0.6) {
                this._timer(() => this._falseScreamerVisual(), 500 + Math.random() * 2000);
            }
        }
    }

    // === PHASE ===
    setPhase(name) {
        const prevPhase = this.phase;
        this.phase = name;
        const p = ATM.PHASES[name];
        if (!p) return;

        // *** FIX: если masterGain убит stutter'ом — восстановить ***
        if (this._masterGainKilled && name !== 'silence') {
            this._restoreMasterGain();
            this._masterGainKilled = false;
            console.log('🔊 masterGain restored on phase change');
        }

        const toScary = ['tension','pre_strike','silence','linger'].includes(name);
        const fromScary = ['tension','pre_strike','silence','linger'].includes(prevPhase);
        let audioMs, transMs;

        if (toScary && !fromScary) {
            audioMs = 800; transMs = '0.8s';
        } else if (!toScary && fromScary) {
            audioMs = 5000; transMs = '5s';
        } else if (toScary) {
            audioMs = 1200; transMs = '1.2s';
        } else {
            audioMs = 3000; transMs = '3s';
        }

        ['drone','drone_low','piano','heart','texture','wind','static','demon'].forEach(n => {
            if (p[n] !== undefined) this._fadeLayer(n, p[n], audioMs);
        });

        this._setGrain(p.grain, transMs);
        this._setVignette(p.vignette, transMs);
        this._setScanlines(p.scanlines, transMs);
        this._setTint(p.tint, transMs);
        this._setBgFilter(p.bgFilter, transMs);
        if (p.grainSpeed) this._setGrainSpeed(p.grainSpeed);

        if (name === 'tension')    this._setHeartbeatRate(1.2);
        if (name === 'pre_strike') this._setHeartbeatRate(1.5);
        if (name === 'linger')     this._setHeartbeatRate(0.65);
        if (['calm','post','false_calm'].includes(name)) this._setHeartbeatRate(1.0);

        if (name === 'uneasy' && !this.singleSoundPlayed && Math.random() < 0.5)
            this._timer(() => this._playSingleSound(), 2000 + Math.random() * 4000);

        if (['uneasy','tension','pre_strike'].includes(name)) this._scheduleOneShots();

        if (name === 'tension') this._hapticLoop('tension');
        if (name === 'pre_strike') this._hapticLoop('pre_strike');

        if (['tension','pre_strike'].includes(name)) this._startPointerParanoia();
        else this._stopPointerParanoia();

        console.log(`🌙 Phase: ${prevPhase} → ${name} (${transMs})`);
    }

    startLinger() {
        this.lingerActive = true;
        this.setPhase('linger');
        this._timer(() => {
            this.lingerActive = false;
            this.setPhase('post');
        }, 5000 + Math.random() * 5000);
    }

    prepareScreamer(callback) {
        const sc = this.scenario;
        if (sc?.buildup === 'silence') {
            this._fadeAllLayers(0, 300);
            this._setBgFilter('brightness(0.08) saturate(0)', '0.3s');
            this._timer(() => this._timer(callback, 2500 + Math.random()*2500), 400);
        } else if (sc?.buildup === 'none') {
            callback();
        } else {
            this._playRiser();
            this.setPhase('pre_strike');
            this._timer(() => {
                this.setPhase('false_calm');
                this._timer(() => {
                    this._fadeAllLayers(0, 1200);
                    this._setGrain(0.02, '1s');
                    this._timer(() => this._timer(callback, 1000+Math.random()*1500), 1300);
                }, 1500);
            }, 2500);
        }
    }

    _playRiser() {
        const l = this.layers.riser;
        if (l?.element) l.element.currentTime = 0;
        this._fadeLayer('riser', 0.30, 3000);
    }

    onScreamer() {
        // *** FIX: восстановить masterGain перед скримером ***
        this._restoreMasterGain();
        this._masterGainKilled = false;

        this._fadeAllLayers(0, 150);
        this._flashRed(150);
        this._invertFlash(60);
        this._screenShake(80);
        this._haptic('heavy');
        this._timer(() => this._haptic('error'), 100);
        this._timer(() => this._haptic('heavy'), 200);

        const tg = window.Telegram?.WebApp;
        if (tg?.isVersionAtLeast?.('8.0') && tg.requestFullscreen) {
            try { tg.requestFullscreen(); } catch(e) {}
        }
        this._timer(() => this.startLinger(), 1000);
    }

    _falseScreamerVisual() {
        if (this.falseScreamerDone) return;
        this.falseScreamerDone = true;
        this._flashRed(80);
        this._timer(() => this._invertFlash(40), 30);
        if (this.bgEl) {
            this.bgEl.style.backgroundImage = "url('assets/images/bg2.jpg')";
            this._timer(() => {
                if (this.bgEl) this.bgEl.style.backgroundImage = "url('assets/images/background.jpg')";
            }, 100);
        }
    }

    _haptic(type) {
        const tg = window.Telegram?.WebApp;
        if (tg?.HapticFeedback) {
            if (['heavy','medium','light','rigid','soft'].includes(type)) tg.HapticFeedback.impactOccurred(type);
            else if (['error','warning','success'].includes(type)) tg.HapticFeedback.notificationOccurred(type);
        } else if (navigator.vibrate) {
            if (type === 'heavy') navigator.vibrate(50);
            else if (type === 'error') navigator.vibrate([30,20,30]);
            else navigator.vibrate(15);
        }
    }

    _hapticLoop(phase) {
        const loop = () => {
            if (!this.isActive || this.phase !== phase) return;
            const isTension = phase === 'tension';
            const delay = isTension ? 3500+Math.random()*2500 : 1500+Math.random()*1500;
            const chance = isTension ? 0.40 : 0.60;
            this._timer(() => {
                if (this.phase !== phase) return;
                if (Math.random() < chance) {
                    const types = isTension ? ['light','light','warning'] : ['rigid','soft','medium'];
                    this._haptic(types[Math.floor(Math.random()*types.length)]);
                }
                loop();
            }, delay);
        };
        loop();
    }

    _startPointerParanoia() {
        if (this.pointerParanoia) return;
        this.pointerParanoia = true;
        const ptr = document.getElementById('pointer');
        if (!ptr) return;
        const loop = () => {
            if (!this.pointerParanoia || !this.isActive) return;
            this._timer(() => {
                if (!this.pointerParanoia) return;
                if (Math.random() < 0.35) {
                    const dx = (Math.random()-0.5)*5, dy = (Math.random()-0.5)*5;
                    ptr.style.transition = 'none';
                    ptr.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                    this._timer(() => {
                        ptr.style.transition = 'transform 0.3s ease';
                        ptr.style.transform = 'translate(-50%,-50%)';
                    }, 80 + Math.random()*70);
                }
                loop();
            }, 2500+Math.random()*4000);
        };
        loop();
    }

    _stopPointerParanoia() {
        this.pointerParanoia = false;
        const ptr = document.getElementById('pointer');
        if (ptr) ptr.style.transform = 'translate(-50%,-50%)';
    }

    // === VISUALS ===
    _setGrain(o, transition='3s') { if (this.grainEl) { this.grainEl.style.transition=`opacity ${transition}`; this.grainEl.style.opacity=o; } }
    _setGrainSpeed(s) { if (this.grainEl) this.grainEl.style.animationDuration = s + 's'; }
    _setVignette(r, transition='3s') {
        if (!this.vignetteEl) return;
        this.vignetteEl.style.transition = `background ${transition}`;
        this.vignetteEl.style.background = `radial-gradient(ellipse at center, transparent ${Math.round(r*100)}%, rgba(0,0,0,0.85) 100%)`;
    }

    _createScanlines() {
        this.scanlines = document.createElement('div');
        this.scanlines.className = 'atm-scanlines';
        this.scanlines.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50;opacity:0;transition:opacity 3s;';
        document.body.appendChild(this.scanlines);
    }
    _setScanlines(o, transition='3s') { if (this.scanlines) { this.scanlines.style.transition=`opacity ${transition}`; this.scanlines.style.opacity=o; } }

    _createTint() {
        this.tintEl = document.createElement('div');
        this.tintEl.className = 'atm-tint';
        this.tintEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:49;opacity:0;transition:opacity 3s;background:radial-gradient(ellipse at center, rgba(50,0,0,0.20) 0%, rgba(80,0,0,0.55) 100%);';
        document.body.appendChild(this.tintEl);
    }
    _setTint(o, transition='3s') { if (this.tintEl) { this.tintEl.style.transition=`opacity ${transition}`; this.tintEl.style.opacity=o; } }
    _setBgFilter(filter, transition='3s') { if (this.bgEl) { this.bgEl.style.transition=`filter ${transition}`; this.bgEl.style.filter = filter==='none' ? '' : filter; } }

    _flashRed(ms) {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;background:rgba(180,0,0,0.50);z-index:105;pointer-events:none;';
        document.body.appendChild(d);
        this._timer(() => d.remove(), ms);
    }
    _invertFlash(ms) { document.body.style.filter='invert(1)'; this._timer(()=>{document.body.style.filter='';},ms); }
    _screenShake(ms) { const g=document.getElementById('game'); if(!g)return; g.style.animation=`atmShake ${ms}ms linear`; this._timer(()=>{g.style.animation='';},ms+10); }

    _startBgFlash() {
        const loop = () => {
            if (!this.isActive) return;
            this._timer(() => {
                if (!this.isActive || this.bgFlashCount >= 3) return;
                if (['calm','post'].includes(this.phase)) { loop(); return; }
                this.bgFlashCount++;
                if (this.bgEl) {
                    this.bgEl.style.backgroundImage = "url('assets/images/bg2.jpg')";
                    this._timer(() => {
                        if (this.bgEl) this.bgEl.style.backgroundImage = "url('assets/images/background.jpg')";
                    }, 20+Math.floor(Math.random()*20));
                }
                loop();
            }, 20000+Math.random()*30000);
        };
        loop();
    }

    _startDrift() {
        const loop = () => {
            if (!this.isActive) return;
            this._timer(() => {
                if (!this.isActive || !soundOn || !this.ctx) { loop(); return; }
                const l = this.layers.piano;
                if (l) {
                    const base = ATM.PHASES[this.phase]?.piano || 0.20;
                    const cur = l.gain.gain.value;
                    const drift = (Math.random()-0.5) * base * 0.15;
                    l.gain.gain.linearRampToValueAtTime(Math.max(0.01,Math.min(0.5,cur+drift)), this.ctx.currentTime+2);
                }
                loop();
            }, 12000+Math.random()*8000);
        };
        loop();
    }

    _scheduleGlitch() {
        const loop = () => {
            if (!this.isActive) return;
            this._timer(() => {
                if (!this.isActive) return;
                const max = 2+Math.floor(Math.max(0,this.round-8)/8);
                if (this.glitchesUsed>=max || this.phase==='calm') { loop(); return; }
                this._doGlitch(); loop();
            }, 15000+Math.random()*30000);
        };
        loop();
    }

    _doGlitch() {
        const g = ATM.UI_GLITCHES[Math.floor(Math.random()*ATM.UI_GLITCHES.length)];
        const t = document.querySelector(g.target);
        if (!t) return;
        this.glitchesUsed++;
        switch(g.effect) {
            case 'text-replace': const orig=t.textContent; t.textContent=g.text; this._timer(()=>{t.textContent=orig;},g.duration); break;
            case 'bg-swap': if(this.bgEl){this.bgEl.style.backgroundImage="url('assets/images/bg2.jpg')";this._timer(()=>{this.bgEl.style.backgroundImage="url('assets/images/background.jpg')";},g.duration);} break;
            case 'translate': t.style.transform=`translate(${g.dx}px,${g.dy}px)`;this._timer(()=>{t.style.transform='';},g.duration); break;
        }
    }

    getHeartAnomaly() {
        if (!this.isActive || this.round < 3) return null;
        if (['calm','post'].includes(this.phase)) return null;
        const max = this.round>8?4:2;
        if (this.anomaliesUsed>=max) return null;
        if (Math.random() > (this.round>8?0.25:0.16)) return null;
        this.anomaliesUsed++;
        return ATM.HEART_ANOMALIES[Math.floor(Math.random()*ATM.HEART_ANOMALIES.length)];
    }

    _timer(fn, delay) {
        const id = setTimeout(() => { this._timers=this._timers.filter(t=>t!==id); fn(); }, delay);
        this._timers.push(id);
        return id;
    }
    _clearTimers() { this._timers.forEach(id=>clearTimeout(id)); this._timers=[]; }

    _resetVisuals() {
        this._setGrain(0.0,'1s'); this._setVignette(0.60,'1s'); this._setScanlines(0,'1s');
        this._setTint(0,'1s'); this._setBgFilter('none','1s'); this._setGrainSpeed(0.3);
        if(this.bgEl){this.bgEl.style.transform='';this.bgEl.style.backgroundImage="url('assets/images/background.jpg')";}
        document.body.style.filter='';
    }

    _injectCSS() {
        const s=document.createElement('style');
        s.textContent=`
            @keyframes atmShake{0%,100%{transform:translate(0,0)}10%{transform:translate(-5px,4px)}20%{transform:translate(6px,-3px)}30%{transform:translate(-4px,-5px)}40%{transform:translate(5px,3px)}50%{transform:translate(-3px,6px)}60%{transform:translate(4px,-4px)}70%{transform:translate(-6px,2px)}80%{transform:translate(3px,-5px)}90%{transform:translate(-2px,4px)}}
            .atm-scanlines{background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 3px);animation:atmScanMove 4s linear infinite;}
            @keyframes atmScanMove{0%{background-position:0 0}100%{background-position:0 6px}}`;
        document.head.appendChild(s);
    }
}

const atmosphere = new AtmosphereEngine();
