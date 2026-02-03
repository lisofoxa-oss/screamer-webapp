// ============================================================
// game.js v6 — Фикс тренировки, scatter-интро, fullscreen
//
// Фиксы:
// - onTrainingCatch/Return теперь обрабатывают step 4
// - unbindEvents правильно снимает listener'ы
// - Fullscreen при первом касании
// - Интро: "чёрная роза" разлетается буквами
// - Тренировочные подсказки позиционируются правильно
// ============================================================

// === Telegram ===
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id') || tg?.initDataUnsafe?.user?.id;
const isNewPlayer = urlParams.get('new') === '1';

// === Fullscreen ===
function requestFullscreen() {
    const tg = window.Telegram?.WebApp;
    if (tg?.isVersionAtLeast?.('8.0') && tg.requestFullscreen) {
        try { tg.requestFullscreen(); } catch(e) {}
    }
    const el = document.documentElement;
    try {
        if (el.requestFullscreen) el.requestFullscreen().catch(()=>{});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch(e) {}
}

// === Audio ===
let soundOn = true;
const ambientSound = document.getElementById('ambientSound');
const laughSound = document.getElementById('laughSound');
const screamSound = document.getElementById('screamSound');
const meowSound = document.getElementById('meowSound');
const breathSound = document.getElementById('breathSound');

if (ambientSound) ambientSound.volume = 0.3;
if (laughSound) laughSound.volume = 0.6;
if (screamSound) screamSound.volume = 0.8;
if (meowSound) meowSound.volume = 0.7;
if (breathSound) breathSound.volume = 0;

document.getElementById('soundBtn').onclick = () => {
    soundOn = !soundOn;
    document.getElementById('soundBtn').textContent = soundOn ? '🔊' : '🔇';
    if (!soundOn) {
        if (ambientSound) ambientSound.pause();
        if (breathSound) breathSound.pause();
    }
};

function playAmbient() { if (soundOn && ambientSound) ambientSound.play().catch(()=>{}); }
function stopAmbient() { if (ambientSound) { ambientSound.pause(); ambientSound.currentTime = 0; } }
function playLaugh() { if (soundOn && laughSound) { laughSound.currentTime = 0; laughSound.play().catch(()=>{}); } }
function playMeow() { if (soundOn && meowSound) { meowSound.currentTime = 0; meowSound.play().catch(()=>{}); } }
function playScream() {
    if (!soundOn) return;
    if (screamSound && screamSound.readyState >= 2) {
        screamSound.currentTime = 0; screamSound.play().catch(()=>{});
    } else {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 900; osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        } catch(e) {}
    }
}

// === Breathing Sound Control ===
function startBreathing() {
    if (!soundOn || !breathSound || !CONFIG.BREATH_ENABLED) return;
    breathSound.volume = CONFIG.BREATH_VOLUME_START;
    breathSound.playbackRate = CONFIG.BREATH_RATE_START;
    breathSound.play().catch(()=>{});
}

function updateBreathing(round, realRound) {
    if (!breathSound || !CONFIG.BREATH_ENABLED) return;
    if (round < CONFIG.BREATH_START_ROUND) return;
    
    // Прогресс от начала до скримера
    const startR = CONFIG.BREATH_START_ROUND;
    const progress = Math.min(1, (round - startR) / (realRound - startR));
    
    // Плавное нарастание громкости и скорости
    const vol = CONFIG.BREATH_VOLUME_START + (CONFIG.BREATH_VOLUME_MAX - CONFIG.BREATH_VOLUME_START) * progress;
    const rate = CONFIG.BREATH_RATE_START + (CONFIG.BREATH_RATE_MAX - CONFIG.BREATH_RATE_START) * progress;
    
    breathSound.volume = Math.min(vol, CONFIG.BREATH_VOLUME_MAX);
    breathSound.playbackRate = Math.min(rate, CONFIG.BREATH_RATE_MAX);
}

function stopBreathing() {
    if (breathSound) {
        breathSound.pause();
        breathSound.currentTime = 0;
        breathSound.volume = 0;
        breathSound.playbackRate = 1.0;
    }
}

// === Micro-sounds (шорохи в тишине) ===
// Создают ощущение "что-то сейчас будет"
function scheduleMicroSound(delayMs) {
    if (!soundOn) return;
    if (state.round < 3) return;  // не слишком рано
    if (state.realHappened) return;  // не после скримера
    
    // 30% шанс микро-шороха
    if (Math.random() > 0.30) return;
    
    setTimeout(() => {
        if (state.phase !== 'wait' || !state.active) return;
        
        // Используем atmosphere для воспроизведения тихого звука
        const sounds = ['creak', 'whisper', 'texture'];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        
        // Вызываем atmosphere для one-shot звука
        if (atmosphere && atmosphere._playOneShot) {
            atmosphere._playOneShot(sound, 0.08 + Math.random() * 0.07);  // очень тихо
        }
    }, delayMs * (0.3 + Math.random() * 0.4));  // где-то в середине ожидания
}

// === Glitch Clock Control ===
const clockEl = document.getElementById('glitchClock');
let clockInterval = null;

function showClock() {
    if (!clockEl || !CONFIG.CLOCK_ENABLED) return;
    clockEl.classList.add('visible');
    updateClockDisplay();
    clockInterval = setInterval(updateClockDisplay, 1000);
}

function hideClock() {
    if (clockEl) clockEl.classList.remove('visible', 'intense');
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

function updateClockDisplay() {
    if (!clockEl) return;
    const hours = clockEl.querySelector('.clock-hours');
    const mins = clockEl.querySelector('.clock-minutes');
    const secs = clockEl.querySelector('.clock-seconds');
    if (!hours || !mins || !secs) return;
    
    // 30% шанс показать странное время
    if (Math.random() < 0.3) {
        const creepy = CONFIG.CLOCK_CREEPY_TIMES[Math.floor(Math.random() * CONFIG.CLOCK_CREEPY_TIMES.length)];
        const [h, m] = creepy.split(':');
        hours.textContent = h;
        mins.textContent = m;
        secs.textContent = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    } else {
        // Нормальное время, но секунды иногда скачут
        const now = new Date();
        hours.textContent = String(now.getHours()).padStart(2, '0');
        mins.textContent = String(now.getMinutes()).padStart(2, '0');
        
        // Секунды иногда идут назад или скачут
        let sec = now.getSeconds();
        if (Math.random() < 0.2) sec = (sec + Math.floor(Math.random() * 10) - 5 + 60) % 60;
        secs.textContent = String(sec).padStart(2, '0');
    }
}

function glitchClock() {
    if (!clockEl || !CONFIG.CLOCK_ENABLED) return;
    if (Math.random() > CONFIG.CLOCK_GLITCH_CHANCE) return;
    
    clockEl.classList.add('glitching');
    setTimeout(() => clockEl.classList.remove('glitching'), 150);
    
    // Иногда показываем "глюк" в цифрах
    const secs = clockEl.querySelector('.clock-seconds');
    if (secs && Math.random() < 0.4) {
        const orig = secs.textContent;
        secs.textContent = '??';
        setTimeout(() => { secs.textContent = orig; }, 100);
    }
}

function intensifyClock() {
    if (clockEl) clockEl.classList.add('intense');
}

// === Vibration Escalation ===
function vibrateForRound(round, realRound) {
    if (!CONFIG.VIBRATE_ENABLED || !navigator.vibrate) return;
    if (round < CONFIG.VIBRATE_START_ROUND) return;
    
    const progress = (round - CONFIG.VIBRATE_START_ROUND) / (realRound - CONFIG.VIBRATE_START_ROUND);
    
    // Выбираем паттерн по прогрессу
    let pattern;
    if (progress < 0.4) {
        pattern = CONFIG.VIBRATE_PATTERN_LIGHT;
    } else if (progress < 0.75) {
        pattern = CONFIG.VIBRATE_PATTERN_MEDIUM;
    } else {
        pattern = CONFIG.VIBRATE_PATTERN_HEAVY;
    }
    
    // Случайный шанс вибрации (чаще ближе к скримеру)
    const chance = 0.2 + progress * 0.5;  // от 20% до 70%
    if (Math.random() < chance) {
        navigator.vibrate(pattern);
    }
}

// === DOM ===
const $ = id => document.getElementById(id);
const el = {
    warning: $('warning'), loading: $('loading'), intro: $('intro'),
    tutorial: $('tutorial'), game: $('game'), results: $('results'),
    trainDone: $('trainDone'),
    loadingText: $('loadingText'), loadingFill: $('loadingFill'),
    introText: $('introText'), introBg: $('introBg'),
    zone: $('zone'), heart: $('heart'), pointer: $('pointer'),
    instruction: $('instruction'), creepyText: $('creepyText'),
    trainHint: $('trainHint'),
    screamer: $('screamer'), screamerImg: $('screamerImg'), screamerEmoji: $('screamerEmoji'),
    fakeScreamer: $('fakeScreamer'), kittyImg: $('kittyImg'), kittyEmoji: $('kittyEmoji'),
    score: $('score'), scoreFill: $('scoreFill'), label: $('label'), heartsResult: $('heartsResult')
};

// === State ===
let heartX = 0, heartY = 0;

const state = {
    phase: 'wait', round: 0, active: false, isMouse: false,
    heartCaughtThisRound: false, returnedThisRound: false,
    heartAt: 0, moveAt: 0, catchAt: 0, returnStartAt: 0,
    screamerAt: 0, lastMoveTime: 0,
    startX: 0, startY: 0, lastX: 0, lastY: 0, catchX: 0, catchY: 0,
    trajectory: [], maxRecoil: 0,
    fakeScreamerRound: 0, realScreamerRound: 0,
    currentEvent: 'normal', fakeHappened: false, realHappened: false,
    heartsCaught: 0, heartsMissed: 0,
    preCalib: [], fakeScreamer: null, midCalib: [], realScreamer: null, postCalib: [],
    heartTimer: null, _currentRound: null,
    lastSaveTime: 0, creepyUsed: new Set(),
    isTraining: false, trainingStep: 0, trainingRound: 0,
};

// === Helpers ===
const dist = (x1,y1,x2,y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2);

function zoneCenter() {
    const r = el.zone.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
}

const inZone = (x,y) => dist(x, y, zoneCenter().x, zoneCenter().y) <= CONFIG.ZONE_R;
const onHeart = (x,y) => dist(x, y, heartX, heartY) <= CONFIG.HEART_R;

function angleBetween(v1x,v1y,v2x,v2y) {
    const dot = v1x*v2x + v1y*v2y;
    const m1 = Math.sqrt(v1x*v1x + v1y*v1y);
    const m2 = Math.sqrt(v2x*v2x + v2y*v2y);
    if (m1 === 0 || m2 === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot/(m1*m2)))) * 180/Math.PI;
}

function placeHeart(minDist) {
    const zone = zoneCenter();
    const pad = CONFIG.HEART_EDGE_PAD || 55;
    const minY = CONFIG.MIN_HEART_Y || 130;
    const maxY = window.innerHeight * (CONFIG.MAX_HEART_Y_RATIO || 0.34);
    let attempts = 0;
    do {
        heartX = pad + Math.random() * (window.innerWidth - pad*2);
        heartY = minY + Math.random() * (maxY - minY);
        attempts++;
    } while ((dist(heartX, heartY, zone.x, zone.y) < minDist ||
              dist(heartX, heartY, state.lastX, state.lastY) < CONFIG.HEART_R * 3) &&
             attempts < 50);
    el.heart.style.left = (heartX - 20) + 'px';
    el.heart.style.top = (heartY - 20) + 'px';
}

// ============================================================
// SCREENS
// ============================================================
function show(name) {
    ['warning','loading','intro','tutorial','game','trainDone','results'].forEach(s =>
        el[s]?.classList.toggle('active', s === name));
}

// ============================================================
// PRELOADER
// ============================================================
async function startLoading() {
    requestFullscreen();
    show('loading');

    const audioUrls = CONFIG.PRELOAD_AUDIO || [];
    const imageUrls = CONFIG.PRELOAD_IMAGES || [];
    const total = audioUrls.length + imageUrls.length;
    let loaded = 0;

    function updateProgress() {
        loaded++;
        const pct = Math.round((loaded / Math.max(1, total)) * 100);
        if (el.loadingFill) el.loadingFill.style.width = pct + '%';
        if (el.loadingText) {
            const texts = ['Загрузка...', 'Подготовка...', 'Скоро начнём...', 'Почти готово...'];
            el.loadingText.textContent = pct < 30 ? texts[0] : pct < 60 ? texts[1] : pct < 90 ? texts[2] : texts[3];
        }
    }

    const audioPromises = audioUrls.map(url => new Promise(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; updateProgress(); resolve(); };
        const audio = new Audio();
        audio.preload = 'auto';
        audio.oncanplaythrough = finish;
        audio.onerror = finish;
        setTimeout(finish, 5000);
        audio.src = url;
        audio.load();
    }));

    const imagePromises = imageUrls.map(url => new Promise(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; updateProgress(); resolve(); };
        const img = new Image();
        img.onload = finish;
        img.onerror = finish;
        setTimeout(finish, 5000);
        img.src = url;
    }));

    [ambientSound, laughSound, screamSound, meowSound].forEach(a => { if (a) a.load(); });
    await Promise.all([...audioPromises, ...imagePromises]);

    if (el.loadingFill) el.loadingFill.style.width = '100%';
    if (el.loadingText) el.loadingText.textContent = 'Готово!';
    await new Promise(r => setTimeout(r, 400));

    playIntro();
}

// ============================================================
// INTRO — "Чёрная роза" с разлётом букв
// ============================================================
function playIntro() {
    show('intro');
    playAmbient();

    const C = CONFIG;
    const textEl = el.introText;
    const bgFlash = el.introBg;

    // Создаём отдельные span'ы для каждой буквы
    if (textEl) {
        textEl.innerHTML = '';
        textEl.style.opacity = '0';
        const text = 'чёрная роза';
        for (const ch of text) {
            const span = document.createElement('span');
            span.className = 'intro-letter';
            span.textContent = ch === ' ' ? '\u00A0\u00A0' : ch;
            textEl.appendChild(span);
        }
    }
    if (bgFlash) bgFlash.style.opacity = '0';

    let t = 0;

    // Фаза 1: чёрный экран
    t += C.INTRO_BLACK_MS;

    // Фаза 2: текст появляется
    setTimeout(() => {
        if (textEl) textEl.style.opacity = '1';
    }, t);
    t += C.INTRO_TEXT_FADE_MS + C.INTRO_TEXT_HOLD_MS;

    // Фаза 3: буквы разлетаются
    setTimeout(() => {
        scatterIntroText();
    }, t);
    t += C.INTRO_SCATTER_MS;

    // Фаза 4: быстрые мерцающие вспышки bg2/bg3/screamer
    setTimeout(() => {
        doIntroFlashes();
    }, t);
    t += C.INTRO_FLASH_MS;

    // Фаза 5: переход к tutorial
    t += C.INTRO_PAUSE_MS;
    setTimeout(() => {
        show('tutorial');
    }, t);
}

function scatterIntroText() {
    const letters = document.querySelectorAll('.intro-letter');
    letters.forEach((l, i) => {
        const tx = (Math.random() - 0.5) * 500;
        const ty = (Math.random() - 0.5) * 350;
        const rot = (Math.random() - 0.5) * 360;
        const scale = 0.2 + Math.random() * 0.5;
        const dur = 0.5 + Math.random() * 0.4;
        const delay = i * 0.03;
        l.style.transition = `transform ${dur}s ease-out ${delay}s, opacity ${dur * 0.8}s ease-out ${delay}s`;
        l.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`;
        l.style.opacity = '0';
    });
}

function doIntroFlashes() {
    const bgFlash = el.introBg;
    if (!bgFlash) return;

    const images = CONFIG.INTRO_FLASH_IMAGES || [
        'assets/images/bg2.jpg', 'assets/images/bg3.jpg'
    ];
    const totalMs = CONFIG.INTRO_FLASH_MS || 1800;
    const interval = totalMs / images.length;
    let i = 0;

    const flash = () => {
        if (i >= images.length) {
            bgFlash.style.opacity = '0';
            return;
        }
        bgFlash.style.backgroundImage = `url('${images[i]}')`;
        bgFlash.style.opacity = '1';

        setTimeout(() => {
            bgFlash.style.opacity = '0';
            i++;
            setTimeout(flash, 30 + Math.random() * 40);
        }, interval * 0.6);
    };
    flash();
}

// ============================================================
// CREEPY TEXT
// ============================================================
function maybeShowCreepyText(round, realHappened, callback) {
    if (state.isTraining) { callback(); return; }
    const chance = CONFIG.CREEPY_TEXT_CHANCE_BASE + round * CONFIG.CREEPY_TEXT_CHANCE_GROWTH;
    const minRound = CONFIG.CREEPY_TEXT_MIN_ROUND || 1;
    if (round < minRound || Math.random() > chance) { callback(); return; }

    const phase = realHappened ? 'post' : (round >= 7 ? 'late' : (round >= 3 ? 'mid' : 'early'));
    const msgs = CONFIG.CREEPY_MESSAGES[phase];
    let available = msgs.filter(m => !state.creepyUsed.has(m));
    if (available.length === 0) { state.creepyUsed.clear(); available = [...msgs]; }
    const msg = available[Math.floor(Math.random() * available.length)];
    state.creepyUsed.add(msg);

    if (!el.creepyText) { callback(); return; }
    el.creepyText.textContent = msg;
    el.creepyText.className = 'creepy-text visible';

    const holdTime = 1200 + Math.random() * 800;
    setTimeout(() => {
        el.creepyText.className = 'creepy-text fade-out';
        setTimeout(() => {
            el.creepyText.className = 'creepy-text';
            setTimeout(callback, 200);
        }, 400);
    }, holdTime);
}

// ============================================================
// TRAINING — пошаговое обучение (ИСПРАВЛЕНО)
// ============================================================
function startTraining() {
    atmosphere.unlock();
    requestFullscreen();
    show('game');

    state.isTraining = true;
    state.trainingStep = 1;
    state.trainingRound = 0;
    state.phase = 'wait';
    state.active = false;
    state.round = 0;
    state.heartsCaught = 0;
    state.heartsMissed = 0;

    clearTimeout(state.heartTimer);

    el.pointer.classList.remove('active');
    el.heart.classList.remove('visible','fading');
    el.screamer.classList.remove('active');
    el.fakeScreamer.classList.remove('active');
    if (el.creepyText) el.creepyText.className = 'creepy-text';

    el.instruction.textContent = '';
    showTrainHint('Приложи палец сюда ↓', 'above-zone');
    el.zone.className = 'hold-zone train-pulse';

    bindEvents();
}

function showTrainHint(text, position) {
    if (!el.trainHint) return;
    el.trainHint.textContent = text;
    el.trainHint.classList.add('visible');
    // Сброс позиции
    el.trainHint.style.top = '';
    el.trainHint.style.bottom = '';
    switch (position) {
        case 'above-zone':
            el.trainHint.style.bottom = '38%';
            break;
        case 'above-heart':
            el.trainHint.style.top = '5%';
            break;
        case 'middle':
            el.trainHint.style.top = '38%';
            break;
        default:
            el.trainHint.style.bottom = '38%';
    }
}

function hideTrainHint() {
    if (el.trainHint) el.trainHint.classList.remove('visible');
}

function onTrainingZoneEnter() {
    if (state.trainingStep !== 1) return;
    // Палец в зоне — показываем сердце
    state.trainingStep = 2;
    el.zone.className = 'hold-zone active';

    setTimeout(() => {
        if (!state.isTraining) return;
        placeHeart(CONFIG.MIN_HEART_DIST);
        el.heart.classList.add('visible');
        state.phase = 'toHeart';
        state.heartAt = Date.now();
        showTrainHint('Проведи палец к сердечку ↑', 'above-heart');

        clearTimeout(state.heartTimer);
        state.heartTimer = setTimeout(() => {
            if (state.phase === 'toHeart' && state.isTraining) {
                el.heart.classList.add('fading');
                setTimeout(() => trainMissHeart(), 300);
            }
        }, CONFIG.TRAINING_TIMEOUT);
    }, 500);
}

function onTrainingCatch() {
    // Ловим и на шаге 2 (guided) и на шаге 4 (free practice)
    if (state.trainingStep !== 2 && state.trainingStep !== 4) return;

    clearTimeout(state.heartTimer);
    el.heart.classList.remove('visible','fading');
    state.phase = 'toZone';
    state.catchX = state.lastX;
    state.catchY = state.lastY;
    state.maxRecoil = 0;

    if (state.trainingStep === 2) {
        state.trainingStep = 3;
        showTrainHint('Верни палец в круг ↓', 'middle');
    }
    // step 4: подсказки не нужны
}

function onTrainingReturn() {
    if (state.trainingStep !== 3 && state.trainingStep !== 4) return;

    state.trainingRound++;
    state.heartsCaught++;
    el.zone.className = 'hold-zone active';

    if (state.trainingStep === 3) {
        // После первого guided раунда
        showTrainHint('Не отрывай палец от экрана!', 'middle');
        setTimeout(() => {
            if (!state.isTraining) return;
            state.trainingStep = 4;
            hideTrainHint();
            if (state.trainingRound >= CONFIG.TRAINING_ROUNDS) {
                finishTraining();
            } else {
                startTrainFreeRound();
            }
        }, 1800);
    } else {
        // Free practice (step 4)
        if (state.trainingRound >= CONFIG.TRAINING_ROUNDS) {
            finishTraining();
        } else {
            startTrainFreeRound();
        }
    }
}

function startTrainFreeRound() {
    state.phase = 'wait';
    el.zone.className = 'hold-zone active';
    const delay = 600 + Math.random() * 500;

    setTimeout(() => {
        if (!state.isTraining) return;
        // Если палец не на экране — ждём возвращения
        if (!state.active) {
            state.phase = 'wait';
            el.zone.className = 'hold-zone train-pulse';
            // process() подхватит когда палец вернётся
            return;
        }
        placeHeart(CONFIG.MIN_HEART_DIST);
        el.heart.classList.add('visible');
        state.phase = 'toHeart';
        state.heartAt = Date.now();
        el.zone.className = 'hold-zone waiting';

        clearTimeout(state.heartTimer);
        state.heartTimer = setTimeout(() => {
            if (state.phase === 'toHeart' && state.isTraining) {
                el.heart.classList.add('fading');
                setTimeout(() => trainMissHeart(), 300);
            }
        }, CONFIG.TRAINING_TIMEOUT);
    }, delay);
}

function trainMissHeart() {
    if (!state.isTraining) return;
    state.phase = 'wait';
    el.heart.classList.remove('visible','fading');
    el.zone.className = 'hold-zone train-pulse';
    el.instruction.textContent = 'Не успел! Попробуй ещё раз';
    setTimeout(() => { el.instruction.textContent = ''; }, 1500);

    if (state.trainingStep < 4) {
        state.trainingStep = 1;
        showTrainHint('Приложи палец сюда ↓', 'above-zone');
    } else {
        // Free practice — авто-retry если палец на экране
        setTimeout(() => {
            if (state.isTraining && state.active && inZone(state.lastX, state.lastY)) {
                startTrainFreeRound();
            }
        }, 800);
    }
}

function finishTraining() {
    state.isTraining = false;
    state.phase = 'wait';
    state.active = false;
    clearTimeout(state.heartTimer);
    el.heart.classList.remove('visible','fading');
    el.zone.className = 'hold-zone';
    hideTrainHint();
    unbindEvents();
    show('trainDone');
}

function startGameFromTraining() {
    startGame();
}

function skipToGame() {
    requestFullscreen();
    atmosphere.unlock();
    startGame();
}

// ============================================================
// GAME
// ============================================================
function startGame() {
    atmosphere.unlock();
    requestFullscreen();
    show('game');
    
    // Сброс атмосферных эффектов
    stopBreathing();
    hideClock();

    Object.assign(state, {
        phase:'wait', round:0, active:false, isTraining: false,
        heartCaughtThisRound:false, returnedThisRound:false,
        heartsCaught:0, heartsMissed:0,
        preCalib:[], fakeScreamer:null, midCalib:[],
        realScreamer:null, postCalib:[],
        fakeHappened:false, realHappened:false,
        currentEvent:'normal', trajectory:[], maxRecoil:0,
        screamerAt:0, creepyUsed: new Set(),
        trainingStep: 0, trainingRound: 0
    });
    clearTimeout(state.heartTimer);

    atmosphere.pickScenario();
    const rounds = atmosphere.getScreamerRounds();
    state.fakeScreamerRound = rounds.fakeRound;
    state.realScreamerRound = rounds.realRound;
    state.scenarioKey = rounds.scenarioKey;
    console.log(`🎭 Scenario ${rounds.scenarioKey} — Fake: ${state.fakeScreamerRound}, Real: ${state.realScreamerRound}`);

    atmosphere.start();
    playAmbient();

    el.pointer.classList.remove('active');
    el.heart.classList.remove('visible','fading');
    el.screamer.classList.remove('active');
    el.fakeScreamer.classList.remove('active');
    if (el.creepyText) el.creepyText.className = 'creepy-text';
    hideTrainHint();
    el.instruction.textContent = 'Положи палец в круг';
    el.zone.className = 'hold-zone';

    bindEvents();
}

// ============================================================
// EVENTS
// ============================================================
function onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    state.active = true; state.isMouse = false;
    state.lastX = t.clientX; state.lastY = t.clientY;
    updatePointer(t.clientX, t.clientY);
    process(t.clientX, t.clientY, undefined, undefined, touchInfo(t));
}
function onTouchMove(e) {
    e.preventDefault();
    if (!state.active) return;
    const t = e.touches[0];
    const px = state.lastX, py = state.lastY;
    state.lastX = t.clientX; state.lastY = t.clientY;
    updatePointer(t.clientX, t.clientY);
    process(t.clientX, t.clientY, px, py, touchInfo(t));
}
function onTouchEnd(e) { e.preventDefault(); handleRelease(); }
function onMouseDown(e) {
    if (e.button !== 0) return;
    state.active = true; state.isMouse = true;
    state.lastX = e.clientX; state.lastY = e.clientY;
    updatePointer(e.clientX, e.clientY);
    process(e.clientX, e.clientY);
}
function onMouseMove(e) {
    if (!state.active || !state.isMouse) return;
    const px = state.lastX, py = state.lastY;
    state.lastX = e.clientX; state.lastY = e.clientY;
    updatePointer(e.clientX, e.clientY);
    process(e.clientX, e.clientY, px, py);
}
function onMouseUp(e) { if (state.isMouse) handleRelease(); }

function touchInfo(t) { return { radiusX: t.radiusX||0, radiusY: t.radiusY||0, force: t.force||0 }; }

function bindEvents() {
    unbindEvents();
    document.addEventListener('touchstart', onTouchStart, {passive:false});
    document.addEventListener('touchmove', onTouchMove, {passive:false});
    document.addEventListener('touchend', onTouchEnd, {passive:false});
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function unbindEvents() {
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
}

function handleRelease() {
    if (state.isTraining) {
        if (['toHeart','toZone'].includes(state.phase)) {
            state.phase = 'wait';
            el.heart.classList.remove('visible','fading');
            clearTimeout(state.heartTimer);
            el.zone.className = 'hold-zone train-pulse';
            el.instruction.textContent = 'Палец оторвался! Снова в круг';
            setTimeout(() => { if (state.isTraining) el.instruction.textContent = ''; }, 1500);
            // Сброс guided шагов
            if (state.trainingStep < 4) {
                state.trainingStep = 1;
                showTrainHint('Приложи палец сюда ↓', 'above-zone');
            }
            // step 4: process() подхватит при возврате пальца в зону
        }
        state.active = false;
        el.pointer.classList.remove('active');
        return;
    }

    if (['toHeart','toZone','screamerShock','fakeShock'].includes(state.phase)) {
        if (state.currentEvent === 'real') {
            state.realScreamer = state.realScreamer || {};
            state.realScreamer.lost = true;
        }
        fail();
    }
    state.active = false;
    el.pointer.classList.remove('active');
}

function updatePointer(x,y) {
    el.pointer.style.left = x+'px'; el.pointer.style.top = y+'px';
    el.pointer.classList.add('active');
}

// ============================================================
// GAME LOGIC
// ============================================================
function process(x, y, prevX, prevY, ti) {
    const now = Date.now();

    // === Training mode ===
    if (state.isTraining) {
        if (state.phase === 'wait' && inZone(x, y)) {
            state.active = true;
            if (state.trainingStep === 1) {
                onTrainingZoneEnter();
            } else if (state.trainingStep === 4) {
                // Палец вернулся в зону в свободной практике
                el.zone.className = 'hold-zone active';
                startTrainFreeRound();
            }
        }
        if (state.phase === 'toHeart' && onHeart(x, y)) {
            onTrainingCatch();
        }
        if (state.phase === 'toZone' && inZone(x, y)) {
            onTrainingReturn();
        }
        return;
    }

    // === Normal game ===
    if (state.phase === 'wait') {
        if (inZone(x, y)) enterZone(x, y);
        return;
    }

    const trackPhases = ['screamerShock','fakeShock','toHeart'];
    if (trackPhases.includes(state.phase)) {
        if (prevX !== undefined) {
            const dt = now - (state.lastMoveTime || now);
            state.lastMoveTime = now;
            const dx = x - prevX, dy = y - prevY;
            const distance = Math.sqrt(dx*dx + dy*dy);
            const speed = dt > 0 ? distance / dt * 1000 : 0;
            let angle = 0;
            if (heartX && heartY && distance > 2)
                angle = angleBetween(dx, dy, heartX - prevX, heartY - prevY);
            const info = ti || {};
            state.trajectory.push({
                x, y, t: now, speed, angle, dx, dy, distance,
                radiusX: info.radiusX||0, radiusY: info.radiusY||0,
                force: info.force||0,
                contactArea: Math.PI * (info.radiusX||0) * (info.radiusY||0)
            });
        }
        if (!state.moveAt && dist(state.startX, state.startY, x, y) > CONFIG.MOVE_TH)
            state.moveAt = now;
        if (state.phase === 'toHeart' && onHeart(x, y)) catchHeart(x, y);
    }

    if (state.phase === 'toZone') {
        const d = dist(x, y, state.catchX, state.catchY);
        if (d > state.maxRecoil) state.maxRecoil = d;
        if (inZone(x, y)) returnedToZone();
    }
}

function enterZone(x, y) {
    state.phase = 'wait';
    state.startX = x; state.startY = y;
    el.zone.className = 'hold-zone active';
    el.instruction.textContent = '';

    // Базовая задержка
    let delay = CONFIG.PAUSE_MIN + Math.random() * (CONFIG.PAUSE_MAX - CONFIG.PAUSE_MIN);
    
    // Случайный "спайк" — дополнительная пауза для непредсказуемости
    if (Math.random() < CONFIG.DELAY_SPIKE_CHANCE) {
        delay += CONFIG.DELAY_SPIKE_MIN + Math.random() * (CONFIG.DELAY_SPIKE_MAX - CONFIG.DELAY_SPIKE_MIN);
    }
    
    // Микро-шорох в тишине (создаёт тревогу)
    scheduleMicroSound(delay);
    
    setTimeout(() => {
        if (state.phase === 'wait' && state.active) showHeart();
    }, delay);
}

function showHeart() {
    const C = CONFIG;

    if (state.round === state.fakeScreamerRound && !state.fakeHappened) {
        state.currentEvent = 'fake';
    } else if (state.round === state.realScreamerRound && !state.realHappened) {
        state.currentEvent = 'real';
    } else {
        state.currentEvent = 'normal';
    }

    atmosphere.onRound(state.round, state.currentEvent === 'real', state.realHappened);
    
    // === Атмосферные эффекты ===
    
    // Показываем часы с раунда N
    if (state.round === CONFIG.CLOCK_SHOW_ROUND) {
        showClock();
    }
    
    // Глитч часов (случайный)
    if (state.round >= CONFIG.CLOCK_SHOW_ROUND) {
        glitchClock();
    }
    
    // Запускаем дыхание с раунда N
    if (state.round === CONFIG.BREATH_START_ROUND) {
        startBreathing();
    }
    
    // Обновляем интенсивность дыхания
    if (state.round >= CONFIG.BREATH_START_ROUND) {
        updateBreathing(state.round, state.realScreamerRound);
    }
    
    // Нарастающая вибрация
    vibrateForRound(state.round, state.realScreamerRound);
    
    // Перед скримером — интенсифицируем часы
    if (state.round === state.realScreamerRound - 1) {
        intensifyClock();
    }

    state.heartCaughtThisRound = false;
    state.returnedThisRound = false;
    state.trajectory = [];
    state.maxRecoil = 0;
    state.lastMoveTime = Date.now();
    state.startX = state.lastX;
    state.startY = state.lastY;
    state.moveAt = 0;
    state.screamerAt = 0;

    const isReal = state.currentEvent === 'real';
    const isFake = state.currentEvent === 'fake';
    placeHeart(isReal ? C.SCREAMER_HEART_DIST : C.MIN_HEART_DIST);
    el.zone.className = 'hold-zone waiting';

    const anomaly = atmosphere.getHeartAnomaly();
    if (anomaly && !isReal && !isFake) {
        if (anomaly.css) {
            el.heart.style.cssText += anomaly.css;
            if (anomaly.duration > 0)
                setTimeout(() => { el.heart.style.filter=''; el.heart.style.opacity=''; }, anomaly.duration);
        }
    } else {
        el.heart.style.filter = '';
    }

    if (isReal) {
        state.screamerAt = Date.now();
        if (el.screamerEmoji)
            el.screamerEmoji.textContent = C.SCREAMER_EMOJIS[Math.floor(Math.random() * C.SCREAMER_EMOJIS.length)];
        el.screamer.classList.add('active');
        
        // Резко обрываем дыхание — тишина перед криком
        stopBreathing();
        hideClock();
        
        playScream();
        atmosphere.onScreamer();

        state.phase = 'screamerShock';
        state.heartAt = Date.now();

        setTimeout(() => {
            if (state.phase !== 'screamerShock') return;
            state.phase = 'toHeart';
            state.heartAt = Date.now();
            el.heart.classList.remove('fading'); el.heart.classList.add('visible');
            setHeartTimer();
        }, C.SCREAMER_HEART_DELAY);

        setTimeout(() => el.screamer.classList.remove('active'), C.SCREAMER_HIDE_MS);
        state.realHappened = true;

    } else if (isFake) {
        state.screamerAt = Date.now();
        el.fakeScreamer.classList.add('active');
        playMeow();
        if (navigator.vibrate) navigator.vibrate(100);

        state.phase = 'fakeShock';
        state.heartAt = Date.now();

        setTimeout(() => {
            if (state.phase !== 'fakeShock') return;
            state.phase = 'toHeart';
            state.heartAt = Date.now();
            el.heart.classList.remove('fading'); el.heart.classList.add('visible');
            setHeartTimer();
        }, C.FAKE_HEART_DELAY);

        setTimeout(() => el.fakeScreamer.classList.remove('active'), C.FAKE_HIDE_MS);
        state.fakeHappened = true;
        atmosphere.onFakeComplete(state.round);

    } else {
        state.phase = 'toHeart';
        state.heartAt = Date.now();
        el.heart.classList.remove('fading'); el.heart.classList.add('visible');
        setHeartTimer();
    }
}

function setHeartTimer() {
    clearTimeout(state.heartTimer);
    state.heartTimer = setTimeout(() => {
        if (state.phase === 'toHeart') {
            el.heart.classList.add('fading');
            setTimeout(() => missHeart(), 150);
        }
    }, CONFIG.HEART_TIMEOUT);
}

function catchHeart(x, y) {
    if (state.phase !== 'toHeart' || state.heartCaughtThisRound) return;
    state.heartCaughtThisRound = true;
    state.phase = 'toZone';
    clearTimeout(state.heartTimer);

    const now = Date.now();
    state.catchAt = now;
    state.catchX = x; state.catchY = y;
    state.returnStartAt = now;
    state.maxRecoil = 0;

    const startDelay = state.moveAt ? state.moveAt - state.heartAt : now - state.heartAt;
    const catchTime = now - state.heartAt;
    const shockDuration = state.screamerAt ? (state.moveAt || now) - state.screamerAt : 0;

    el.heart.classList.remove('visible','fading');
    el.zone.className = 'hold-zone';
    el.instruction.textContent = '← В круг';

    const metrics = analyzeRound(state.trajectory);
    state._currentRound = {
        startDelay, catchTime, shockDuration,
        isFlinch: startDelay < 80 && metrics.directionError > 15,
        ...metrics, missed: false
    };

    if (state.currentEvent === 'real')
        state.realScreamer = { ...state._currentRound, lost: false };
    else if (state.currentEvent === 'fake')
        state.fakeScreamer = { ...state._currentRound, lost: false };
}

function returnedToZone() {
    if (state.phase !== 'toZone' || state.returnedThisRound) return;
    state.returnedThisRound = true;
    state.phase = 'cooldown';

    const now = Date.now();
    const returnTime = now - state.returnStartAt;
    const catchTime = state._currentRound?.catchTime || 0;
    const returnAsymmetry = (catchTime + returnTime) > 0 ?
        Math.abs(catchTime - returnTime) / (catchTime + returnTime) : 0;

    state.heartsCaught++;
    el.zone.className = 'hold-zone active';
    el.instruction.textContent = '';

    const roundData = { ...state._currentRound, returnTime, recoilDistance: state.maxRecoil, returnAsymmetry };

    if (state.currentEvent === 'real')
        state.realScreamer = { ...roundData, lost: false };
    else if (state.currentEvent === 'fake')
        state.fakeScreamer = { ...roundData, lost: false };
    else if (!state.fakeHappened) state.preCalib.push(roundData);
    else if (!state.realHappened) state.midCalib.push(roundData);
    else state.postCalib.push(roundData);

    state.round++;
    if (state.round >= CONFIG.TOTAL_HEARTS) { setTimeout(showResults, 400); return; }

    setTimeout(() => {
        state.phase = 'wait';
        if (state.active) {
            maybeShowCreepyText(state.round, state.realHappened, () => {
                const d = CONFIG.PAUSE_MIN + Math.random() * (CONFIG.PAUSE_MAX - CONFIG.PAUSE_MIN);
                setTimeout(() => {
                    if (state.phase === 'wait' && state.active) showHeart();
                }, d);
            });
        }
    }, 100);
}

function missHeart() {
    if (state.phase !== 'toHeart') return;
    clearTimeout(state.heartTimer);
    state.phase = 'wait';
    state.heartsMissed++;
    el.heart.classList.remove('visible','fading');

    if (state.currentEvent === 'real') {
        const metrics = analyzeRound(state.trajectory);
        state.realScreamer = { ...metrics, lost: true, missed: true,
            catchTime: CONFIG.HEART_TIMEOUT,
            startDelay: state.moveAt ? state.moveAt - state.heartAt : CONFIG.HEART_TIMEOUT,
            shockDuration: state.screamerAt ? Date.now() - state.screamerAt : 0 };
    } else if (state.currentEvent === 'fake') {
        state.fakeScreamer = { lost: true, missed: true };
    }

    state.round++;
    if (state.round >= CONFIG.TOTAL_HEARTS) { setTimeout(showResults, 400); return; }
    el.zone.className = 'hold-zone';
    el.instruction.textContent = 'Не успел! Снова в круг';
}

function fail() {
    clearTimeout(state.heartTimer);
    state.phase = 'wait';
    el.heart.classList.remove('visible','fading');
    el.zone.className = 'hold-zone';
    el.screamer.classList.remove('active');
    el.fakeScreamer.classList.remove('active');

    if (state.currentEvent === 'real' && !state.realScreamer?.lost)
        state.realScreamer = { lost: true, missed: true };
    state.heartsMissed++;
    state.round++;
    if (state.round >= CONFIG.TOTAL_HEARTS) { setTimeout(showResults, 400); return; }
    el.instruction.textContent = 'Палец оторвался! Снова в круг';
}

// ============================================================
// RESULTS & SAVE
// ============================================================
function showResults() {
    stopAmbient();
    stopBreathing();
    hideClock();
    atmosphere.stop();
    unbindEvents();

    const scr = state.realScreamer || { lost: true };
    const fake = state.fakeScreamer;
    const avgPre = avgMetrics([...state.preCalib, ...state.midCalib]);
    const avgMid = state.midCalib.length > 0 ? avgMetrics(state.midCalib) : null;
    const avgPost = avgMetrics(state.postCalib);

    const { score, details } = computeScore(scr, fake, avgPre, avgPost, avgMid);

    console.log('=== SCORE BREAKDOWN ===');
    details.forEach(d => console.log('  ' + d));
    console.log('  TOTAL:', score);

    const labels = [
        [10,'🤖 Железные нервы'], [25,'😎 Почти не вздрогнул'],
        [40,'😐 Немного растерялся'], [55,'😰 Хорошо испугался'],
        [75,'🙀 Сильно испугался!'], [Infinity,'📱💨 Максимальный испуг!']
    ];
    el.score.textContent = score;
    el.scoreFill.style.width = score + '%';
    el.label.textContent = labels.find(([max]) => score <= max)[1];
    el.heartsResult.textContent = `Поймано сердец: ${state.heartsCaught} из ${CONFIG.TOTAL_HEARTS}`;

    saveGame(score, scr, fake, avgPre, avgPost);

    // Новый игрок: только кнопка «Закрыть»
    const restartBtn = document.querySelector('#results .btn[onclick="restart()"]');
    if (restartBtn) restartBtn.style.display = isNewPlayer ? 'none' : '';

    show('results');
}

async function saveGame(score, scr, fake, avgPre, avgPost) {
    const now = Date.now();
    if (now - state.lastSaveTime < CONFIG.SAVE_COOLDOWN_MS) return;
    state.lastSaveTime = now;

    const data = {
        fear_score: score,
        hearts_caught: state.heartsCaught,
        hearts_total: CONFIG.TOTAL_HEARTS,
        pre_start_delay: Math.round(avgPre.startDelay),
        pre_catch_time: Math.round(avgPre.catchTime),
        pre_return_time: Math.round(avgPre.returnTime),
        scream_start_delay: Math.round(scr.startDelay || 0),
        scream_catch_time: Math.round(scr.catchTime || 0),
        scream_return_time: Math.round(scr.returnTime || 0),
        scream_lost: !!scr.lost,
        scream_direction_error: Math.round(scr.directionError || 0),
        scream_speed_variability: Math.round((scr.speedVariability || 0) * 100) / 100,
        scream_micro_freeze: Math.round(scr.microFreeze || 0),
        scream_sinuosity: Math.round((scr.sinuosity || 1) * 1000) / 1000,
        scream_flinch: !!(scr.startDelay < 80 && (scr.directionError || 0) > 15),
        scream_total_jerk: Math.round(scr.totalJerk || 0),
        scream_contact_area_max: Math.round(scr.contactAreaMax || 0),
        scream_recoil_distance: Math.round(scr.recoilDistance || 0),
        scream_freeze_onset: Math.round(scr.freezeOnset || 0),
        scream_return_asymmetry: Math.round((scr.returnAsymmetry || 0) * 100) / 100,
        scream_shock_duration: Math.round(scr.shockDuration || 0),
        post_start_delay: Math.round(avgPost.startDelay),
        post_catch_time: Math.round(avgPost.catchTime),
        post_return_time: Math.round(avgPost.returnTime),
        screamer_round: state.realScreamerRound + 1,
        fake_screamer_round: state.fakeScreamerRound + 1,
        fake_catch_time: Math.round(fake?.catchTime || 0),
        fake_direction_error: Math.round(fake?.directionError || 0),
        input_type: state.isMouse ? 'mouse' : 'touch',
        device_info: navigator.userAgent,
        telegram_id: userId,
        username: tg?.initDataUnsafe?.user?.username || 'unknown',
        first_name: tg?.initDataUnsafe?.user?.first_name || '',
        scenario: state.scenarioKey || 'unknown',
        raw_pre_calib: state.preCalib,
        raw_mid_calib: state.midCalib,
        raw_post_calib: state.postCalib,
        raw_fake_screamer: state.fakeScreamer,
        raw_real_screamer: state.realScreamer
    };

    try {
        const res = await fetch(CONFIG.API_URL + '/api/game-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        console.log('Save:', result.success ? '✅' : '❌', result);
    } catch (e) {
        console.error('Save error:', e);
    }
}

function restart() { playAmbient(); startGame(); }

function closeApp() {
    stopAmbient();
    if (tg && tg.close) tg.close();
    else show('warning');
}
