// === Telegram ===
const tg = window.Telegram?.WebApp;

// Логируем состояние Telegram WebApp
console.log('Telegram WebApp:', tg ? 'Available' : 'Not available');
console.log('Telegram initData:', tg?.initData || 'none');
console.log('Telegram initDataUnsafe:', tg?.initDataUnsafe || 'none');

if (tg) { 
    tg.expand(); 
    tg.ready();
    console.log('Telegram WebApp expanded and ready');
}

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id') || tg?.initDataUnsafe?.user?.id;
console.log('User ID:', userId);

// === Audio ===
let soundOn = true;
const ambientSound = document.getElementById('ambientSound');
const laughSound = document.getElementById('laughSound');
const screamSound = document.getElementById('screamSound');

if (ambientSound) ambientSound.volume = 0.3;
if (laughSound) laughSound.volume = 0.6;
if (screamSound) screamSound.volume = 0.8;

document.getElementById('soundBtn').onclick = () => {
    soundOn = !soundOn;
    document.getElementById('soundBtn').textContent = soundOn ? '🔊' : '🔇';
    if (!soundOn && ambientSound) ambientSound.pause();
};

function playAmbient() {
    if (!soundOn || !ambientSound) return;
    ambientSound.play().catch(() => {});
}

function stopAmbient() {
    if (!ambientSound) return;
    ambientSound.pause();
    ambientSound.currentTime = 0;
}

function playLaugh() {
    if (!soundOn || !laughSound) return;
    laughSound.currentTime = 0;
    laughSound.play().catch(() => {});
}

function playScream() {
    if (!soundOn) return;
    if (screamSound && screamSound.readyState >= 2) {
        screamSound.currentTime = 0;
        screamSound.play().catch(() => {});
    } else {
        // Fallback синтезированный звук
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 900;
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch(e) {}
    }
}

// === Constants ===
const HEART_R = 40;
const ZONE_R = 55;
const MOVE_TH = 15;
const HEART_TIMEOUT = 1200; // 1.2 сек на поимку
const TOTAL_HEARTS = 7;
const MIN_HEART_DISTANCE = 180; // Минимальная дистанция сердца от круга
const SCREAMER_HEART_DELAY = 120; // Задержка появления сердца после скримера (мс)

// Emoji скримеры для рандома
const SCREAMER_EMOJIS = ['👻', '💀', '😱', '🎃', '👹'];

// === State ===
const state = {
    phase: 'wait',
    round: 0,
    active: false,
    isMouse: false,
    heartCaughtThisRound: false,
    returnedThisRound: false,
    
    // Timing
    heartAt: 0,
    moveAt: 0,
    catchAt: 0,
    returnStartAt: 0,
    
    // Position
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    catchX: 0, catchY: 0,
    
    // Trajectory tracking (для новых метрик)
    trajectory: [], // [{x, y, t, speed, angle}]
    
    // Screamer
    screamerRound: 0,
    isScreamerRound: false,
    screamerHappened: false,
    
    // Metrics
    heartsCaught: 0,
    heartsMissed: 0,
    
    // Data collection
    preCalib: [],
    screamer: {
        startDelay: 0,
        catchTime: 0,
        returnTime: 0,
        lost: false,
        // Новые метрики
        microFreeze: 0,        // Пауза после скримера
        directionError: 0,     // Ошибка направления (градусы)
        speedVariability: 0,   // Разброс скорости
        overshoot: 0,          // Проскок
        correctionDelay: 0     // Время на коррекцию
    },
    postCalib: [],
    
    // Timer
    heartTimer: null
};

// === Elements ===
const $ = id => document.getElementById(id);
const el = {
    warning: $('warning'),
    tutorial: $('tutorial'),
    game: $('game'),
    results: $('results'),
    zone: $('zone'),
    heart: $('heart'),
    pointer: $('pointer'),
    instruction: $('instruction'),
    heartsCounter: $('heartsCounter'),
    screamer: $('screamer'),
    screamerImg: $('screamerImg'),
    screamerEmoji: $('screamerEmoji'),
    score: $('score'),
    scoreFill: $('scoreFill'),
    label: $('label'),
    heartsResult: $('heartsResult')
};

let heartX = 0, heartY = 0;

// === Helpers ===
const dist = (x1, y1, x2, y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2);

function zoneCenter() {
    const r = el.zone.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
}

const inZone = (x, y) => dist(x, y, zoneCenter().x, zoneCenter().y) <= ZONE_R;
const onHeart = (x, y) => dist(x, y, heartX, heartY) <= HEART_R;

// Угол между двумя векторами (в градусах)
function angleBetween(v1x, v1y, v2x, v2y) {
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x*v1x + v1y*v1y);
    const mag2 = Math.sqrt(v2x*v2x + v2y*v2y);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cos) * 180 / Math.PI;
}

function updateHeartsUI() {
    el.heartsCounter.textContent = `❤️ ${state.heartsCaught}`;
}

function placeHeart(forceMinDistance = false) {
    const zone = zoneCenter();
    const p = 60;
    const maxY = Math.min(window.innerHeight * 0.4, 300);
    
    let attempts = 0;
    do {
        heartX = p + Math.random() * (window.innerWidth - p*2);
        heartY = 80 + Math.random() * maxY;
        attempts++;
    } while (forceMinDistance && dist(heartX, heartY, zone.x, zone.y) < MIN_HEART_DISTANCE && attempts < 20);
    
    el.heart.style.left = (heartX - 20) + 'px';
    el.heart.style.top = (heartY - 20) + 'px';
}

// === Screens ===
function show(name) {
    ['warning', 'tutorial', 'game', 'results'].forEach(s => {
        el[s].classList.toggle('active', s === name);
    });
}

function showTutorial() {
    playLaugh();
    playAmbient();
    show('tutorial');
}

function startGame() {
    show('game');
    
    // 🔥 ЖЁСТКИЙ RESET
    state.phase = 'wait';
    state.round = 0;
    state.active = false;
    state.heartCaughtThisRound = false;
    state.returnedThisRound = false;
    state.heartsCaught = 0;
    state.heartsMissed = 0;
    state.preCalib = [];
    state.postCalib = [];
    state.screamer = {
        startDelay: 0, catchTime: 0, returnTime: 0, lost: false,
        microFreeze: 0, directionError: 0, speedVariability: 0,
        overshoot: 0, correctionDelay: 0
    };
    state.screamerHappened = false;
    state.trajectory = [];
    clearTimeout(state.heartTimer);
    
    // Скрыть pointer
    el.pointer.classList.remove('active');
    
    // Рандомный раунд для скримера (2, 3 или 4)
    state.screamerRound = 2 + Math.floor(Math.random() * 3);
    
    updateHeartsUI();
    el.instruction.textContent = 'Положи палец в круг';
    el.zone.className = 'hold-zone';
    el.heart.classList.remove('visible', 'fading');
    
    // Remove old listeners first
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // Add fresh listeners
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

// === Touch Handlers ===
function onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    state.active = true;
    state.isMouse = false;
    state.lastX = t.clientX;
    state.lastY = t.clientY;
    updatePointer(t.clientX, t.clientY);
    process(t.clientX, t.clientY);
}

function onTouchMove(e) {
    e.preventDefault();
    if (!state.active) return;
    const t = e.touches[0];
    const prevX = state.lastX;
    const prevY = state.lastY;
    state.lastX = t.clientX;
    state.lastY = t.clientY;
    updatePointer(t.clientX, t.clientY);
    process(t.clientX, t.clientY, prevX, prevY);
}

function onTouchEnd(e) {
    e.preventDefault();
    handleRelease();
}

// === Mouse Handlers ===
function onMouseDown(e) {
    if (e.button !== 0) return;
    state.active = true;
    state.isMouse = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    updatePointer(e.clientX, e.clientY);
    process(e.clientX, e.clientY);
}

function onMouseMove(e) {
    if (!state.active || !state.isMouse) return;
    const prevX = state.lastX;
    const prevY = state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    updatePointer(e.clientX, e.clientY);
    process(e.clientX, e.clientY, prevX, prevY);
}

function onMouseUp(e) {
    if (!state.isMouse) return;
    handleRelease();
}

function handleRelease() {
    if (state.phase === 'toHeart' || state.phase === 'toZone' || state.phase === 'screamerShock') {
        if (state.isScreamerRound) {
            state.screamer.lost = true;
        }
        fail();
    }
    state.active = false;
    el.pointer.classList.remove('active');
}

function updatePointer(x, y) {
    el.pointer.style.left = x + 'px';
    el.pointer.style.top = y + 'px';
    el.pointer.classList.add('active');
}

function process(x, y, prevX, prevY) {
    const now = Date.now();
    
    if (state.phase === 'wait') {
        if (inZone(x, y)) enterZone(x, y);
    }
    else if (state.phase === 'toHeart' || state.phase === 'screamerShock') {
        // Трекинг траектории (собираем и во время шока от скримера!)
        if (prevX !== undefined) {
            const dt = now - (state.lastMoveTime || now);
            state.lastMoveTime = now;
            
            const dx = x - prevX;
            const dy = y - prevY;
            const distance = Math.sqrt(dx*dx + dy*dy);
            const speed = dt > 0 ? distance / dt * 1000 : 0; // px/sec
            
            // Вектор к сердцу (если сердце уже есть)
            let angle = 0;
            if (heartX && heartY) {
                const toHeartX = heartX - prevX;
                const toHeartY = heartY - prevY;
                angle = angleBetween(dx, dy, toHeartX, toHeartY);
            }
            
            state.trajectory.push({ x, y, t: now, speed, angle, dx, dy, distance });
        }
        
        // Детектим начало движения
        if (!state.moveAt && state.phase === 'toHeart') {
            const moved = dist(state.startX, state.startY, x, y);
            if (moved > MOVE_TH) {
                state.moveAt = now;
            }
        }
        
        // Проверка поимки (только если сердце видно)
        if (state.phase === 'toHeart' && onHeart(x, y)) {
            catchHeart(x, y);
        }
    }
    else if (state.phase === 'toZone') {
        if (inZone(x, y)) returnedToZone();
    }
}

function enterZone(x, y) {
    state.phase = 'wait';
    state.startX = x;
    state.startY = y;
    el.zone.className = 'hold-zone active';
    el.instruction.textContent = '';
    
    const delay = 800 + Math.random() * 1200;
    setTimeout(() => {
        if (state.phase === 'wait' && state.active) showHeart();
    }, delay);
}

function showHeart() {
    state.isScreamerRound = (state.round === state.screamerRound && !state.screamerHappened);
    
    // Reset round flags
    state.heartCaughtThisRound = false;
    state.returnedThisRound = false;
    state.trajectory = [];
    state.lastMoveTime = Date.now();
    
    // Сердце при скримере дальше от круга
    placeHeart(state.isScreamerRound);
    
    state.startX = state.lastX;
    state.startY = state.lastY;
    state.moveAt = 0;
    
    el.zone.className = 'hold-zone waiting';
    
    if (state.isScreamerRound) {
        // === СКРИМЕР! ===
        state.screamerAt = Date.now(); // Запоминаем момент скримера
        
        // Рандомный emoji если картинка не загрузилась
        if (el.screamerEmoji) {
            el.screamerEmoji.textContent = SCREAMER_EMOJIS[Math.floor(Math.random() * SCREAMER_EMOJIS.length)];
        }
        
        el.screamer.classList.add('active');
        playScream();
        if (navigator.vibrate) navigator.vibrate([200, 50, 200, 50, 300]);
        
        // СРАЗУ начинаем трекать траекторию (ловим шок!)
        state.phase = 'screamerShock';
        state.heartAt = Date.now();
        
        // Сердце появляется с ЗАДЕРЖКОЙ после скримера
        setTimeout(() => {
            state.phase = 'toHeart';
            state.heartAt = Date.now(); // Время появления сердца
            el.heart.classList.remove('fading');
            el.heart.classList.add('visible');
            
            // Таймер исчезновения
            clearTimeout(state.heartTimer);
            state.heartTimer = setTimeout(() => {
                if (state.phase === 'toHeart') {
                    el.heart.classList.add('fading');
                    setTimeout(() => missHeart(), 150);
                }
            }, HEART_TIMEOUT);
        }, SCREAMER_HEART_DELAY);
        
        // Скрыть скример
        setTimeout(() => el.screamer.classList.remove('active'), 900);
        state.screamerHappened = true;
        
    } else {
        // Обычное сердце
        state.phase = 'toHeart';
        state.heartAt = Date.now();
        el.heart.classList.remove('fading');
        el.heart.classList.add('visible');
        
        clearTimeout(state.heartTimer);
        state.heartTimer = setTimeout(() => {
            if (state.phase === 'toHeart') {
                el.heart.classList.add('fading');
                setTimeout(() => missHeart(), 150);
            }
        }, HEART_TIMEOUT);
    }
}

function catchHeart(x, y) {
    if (state.phase !== 'toHeart') return;
    if (state.heartCaughtThisRound) return;
    
    state.heartCaughtThisRound = true;
    state.phase = 'toZone';
    
    clearTimeout(state.heartTimer);
    
    const now = Date.now();
    state.catchAt = now;
    state.catchX = x;
    state.catchY = y;
    
    const startDelay = state.moveAt ? state.moveAt - state.heartAt : now - state.heartAt;
    const catchTime = now - state.heartAt;
    
    state.returnStartAt = now;
    
    el.heart.classList.remove('visible', 'fading');
    el.zone.className = 'hold-zone';
    el.instruction.textContent = '← В круг';
    
    // Анализ траектории
    let metrics = { microFreeze: 0, directionError: 0, speedVariability: 0, totalJerk: 0 };
    
    console.log('=== CATCH HEART ===');
    console.log('isScreamerRound:', state.isScreamerRound);
    console.log('trajectory length:', state.trajectory.length);
    
    if (state.trajectory.length > 1) {
        metrics = analyzeTrajectory(state.trajectory);
    }
    
    state._currentRound = { startDelay, catchTime, ...metrics };
    
    if (state.isScreamerRound) {
        console.log('Recording screamer metrics!');
        state.screamer.startDelay = startDelay;
        state.screamer.catchTime = catchTime;
        state.screamer.microFreeze = metrics.microFreeze;
        state.screamer.directionError = metrics.directionError;
        state.screamer.speedVariability = metrics.speedVariability;
        state.screamer.totalJerk = metrics.totalJerk;
        
        // Время шока от скримера до начала движения к сердцу
        if (state.screamerAt) {
            state.screamer.shockDuration = state.moveAt ? state.moveAt - state.screamerAt : catchTime;
            console.log('Shock duration:', state.screamer.shockDuration);
        }
    }
}

function analyzeTrajectory(traj) {
    if (traj.length < 2) return { microFreeze: 0, directionError: 0, speedVariability: 0, totalJerk: 0 };
    
    console.log('Analyzing trajectory, points:', traj.length);
    
    // 1. Micro-freeze: ищем паузы в движении
    let microFreeze = 0;
    let maxGap = 0;
    for (let i = 1; i < traj.length; i++) {
        const gap = traj[i].t - traj[i-1].t;
        if (gap > maxGap) maxGap = gap;
        if (gap > 50 && microFreeze === 0) { // Первая пауза больше 50мс
            microFreeze = gap;
        }
    }
    console.log('  MicroFreeze:', microFreeze, 'MaxGap:', maxGap);
    
    // 2. Direction error: как кривлялась траектория
    let totalAngle = 0;
    let angleCount = 0;
    for (let i = 0; i < traj.length; i++) {
        if (traj[i].angle !== undefined && !isNaN(traj[i].angle) && traj[i].distance > 3) {
            totalAngle += traj[i].angle;
            angleCount++;
        }
    }
    const directionError = angleCount > 0 ? totalAngle / angleCount : 0;
    console.log('  DirError:', directionError.toFixed(1), 'from', angleCount, 'points');
    
    // 3. Speed variability
    const speeds = traj.filter(p => p.speed > 0 && !isNaN(p.speed)).map(p => p.speed);
    let speedVariability = 0;
    if (speeds.length > 2) {
        const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        const variance = speeds.reduce((sum, s) => sum + (s - avgSpeed) ** 2, 0) / speeds.length;
        speedVariability = avgSpeed > 0 ? Math.sqrt(variance) / avgSpeed : 0;
    }
    console.log('  SpeedVar:', (speedVariability*100).toFixed(0) + '%', 'from', speeds.length, 'speeds');
    
    // 4. Total jerk (рывки) - сумма резких изменений скорости
    let totalJerk = 0;
    for (let i = 1; i < speeds.length; i++) {
        const jerk = Math.abs(speeds[i] - speeds[i-1]);
        if (jerk > 500) totalJerk += jerk; // Только значимые рывки
    }
    console.log('  TotalJerk:', totalJerk.toFixed(0));
    
    return { microFreeze, directionError, speedVariability, totalJerk };
}
    
    return { microFreeze, directionError, speedVariability };
}

function returnedToZone() {
    if (state.phase !== 'toZone') return;
    if (state.returnedThisRound) return;
    
    state.returnedThisRound = true;
    state.phase = 'cooldown'; // Временная блокировка
    
    const now = Date.now();
    const returnTime = now - state.returnStartAt;
    
    state.heartsCaught++;
    updateHeartsUI();
    
    el.zone.className = 'hold-zone active';
    el.instruction.textContent = '';
    
    const roundData = {
        ...state._currentRound,
        returnTime
    };
    
    if (state.isScreamerRound) {
        state.screamer.returnTime = returnTime;
        state.isScreamerRound = false;
    } else if (!state.screamerHappened) {
        state.preCalib.push(roundData);
    } else {
        state.postCalib.push(roundData);
    }
    
    state.round++;
    
    if (state.round >= TOTAL_HEARTS) {
        setTimeout(showResults, 400);
        return;
    }
    
    // Следующее сердце
    setTimeout(() => {
        state.phase = 'wait';
        if (state.active) {
            setTimeout(() => {
                if (state.phase === 'wait' && state.active) showHeart();
            }, 400 + Math.random() * 600);
        }
    }, 100);
}

function missHeart() {
    if (state.phase !== 'toHeart') return;
    
    clearTimeout(state.heartTimer);
    state.phase = 'wait';
    
    state.heartsMissed++;
    el.heart.classList.remove('visible', 'fading');
    
    if (state.isScreamerRound) {
        state.screamer.lost = true;
        state.isScreamerRound = false;
    }
    
    state.round++;
    
    if (state.round >= TOTAL_HEARTS) {
        setTimeout(showResults, 400);
        return;
    }
    
    el.zone.className = 'hold-zone';
    el.instruction.textContent = 'Не успел! Снова в круг';
}

function fail() {
    clearTimeout(state.heartTimer);
    state.phase = 'wait';
    el.heart.classList.remove('visible', 'fading');
    el.zone.className = 'hold-zone';
    el.screamer.classList.remove('active');
    
    if (state.isScreamerRound) {
        state.screamer.lost = true;
        state.isScreamerRound = false;
        state.screamerHappened = true;
    }
    
    state.heartsMissed++;
    state.round++;
    
    if (state.round >= TOTAL_HEARTS) {
        setTimeout(showResults, 400);
        return;
    }
    
    el.instruction.textContent = 'Палец оторвался! Снова в круг';
}

function showResults() {
    stopAmbient();
    
    // Remove listeners
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    const pre = state.preCalib;
    const post = state.postCalib;
    const scr = state.screamer;
    
    const avgPre = {
        startDelay: pre.length ? pre.reduce((a,b) => a + b.startDelay, 0) / pre.length : 300,
        catchTime: pre.length ? pre.reduce((a,b) => a + b.catchTime, 0) / pre.length : 500,
        returnTime: pre.length ? pre.reduce((a,b) => a + b.returnTime, 0) / pre.length : 400
    };
    
    const avgPost = {
        startDelay: post.length ? post.reduce((a,b) => a + b.startDelay, 0) / post.length : avgPre.startDelay,
        catchTime: post.length ? post.reduce((a,b) => a + b.catchTime, 0) / post.length : avgPre.catchTime,
        returnTime: post.length ? post.reduce((a,b) => a + b.returnTime, 0) / post.length : avgPre.returnTime
    };
    
    // === РАСЧЁТ SCORE ===
    let score = 0;
    let scoreDetails = [];
    
    // 1. Потерял/не поймал при скримере - главный показатель!
    if (scr.lost) {
        score += 50;
        scoreDetails.push('Lost: +50');
    }
    
    // 2. Время поимки при скримере vs калибровка (надёжная метрика)
    if (avgPre.catchTime > 0 && scr.catchTime > 0) {
        const ratio = scr.catchTime / avgPre.catchTime;
        // Если при скримере ловил дольше - испугался
        if (ratio > 1.05) {
            const points = Math.min(25, Math.round((ratio - 1) * 50));
            score += points;
            scoreDetails.push(`CatchTime ratio ${ratio.toFixed(2)}: +${points}`);
        }
    }
    
    // 3. Время возврата при скримере
    if (avgPre.returnTime > 0 && scr.returnTime > 0) {
        const ratio = scr.returnTime / avgPre.returnTime;
        if (ratio > 1.1) {
            const points = Math.min(15, Math.round((ratio - 1) * 30));
            score += points;
            scoreDetails.push(`ReturnTime ratio ${ratio.toFixed(2)}: +${points}`);
        }
    }
    
    // 4. Micro-freeze (ступор) - если есть
    if (scr.microFreeze > 50) {
        const points = Math.min(10, Math.round(scr.microFreeze / 20));
        score += points;
        scoreDetails.push(`MicroFreeze ${scr.microFreeze}ms: +${points}`);
    }
    
    // 5. Direction error (кривая траектория)
    if (scr.directionError > 10) {
        const points = Math.min(10, Math.round(scr.directionError / 4));
        score += points;
        scoreDetails.push(`DirError ${scr.directionError.toFixed(1)}°: +${points}`);
    }
    
    // 6. Нестабильная скорость
    if (scr.speedVariability > 0.3) {
        const points = Math.min(8, Math.round(scr.speedVariability * 15));
        score += points;
        scoreDetails.push(`SpeedVar ${(scr.speedVariability*100).toFixed(0)}%: +${points}`);
    }
    
    // 7. Сравнение post vs pre - долго восстанавливался
    if (post.length > 0 && avgPost.catchTime > avgPre.catchTime * 1.05) {
        score += 5;
        scoreDetails.push('SlowRecovery: +5');
    }
    
    // 8. Пропущенные сердца вообще
    if (state.heartsMissed > 0) {
        const points = state.heartsMissed * 5;
        score += points;
        scoreDetails.push(`Missed ${state.heartsMissed}: +${points}`);
    }
    
    score = Math.min(100, Math.max(0, Math.round(score)));
    
    // DEBUG
    console.log('=== SCORE BREAKDOWN ===');
    scoreDetails.forEach(d => console.log('  ' + d));
    console.log('  TOTAL:', score);
    
    // Лейбл
    let label = '';
    if (score <= 10) {
        label = '🤖 Железные нервы';
    } else if (score <= 25) {
        label = '😎 Почти не вздрогнул';
    } else if (score <= 40) {
        label = '😐 Немного растерялся';
    } else if (score <= 55) {
        label = '😰 Хорошо испугался';
    } else if (score <= 75) {
        label = '🙀 Сильно испугался!';
    } else {
        label = '📱💨 Максимальный испуг!';
    }
    
    el.score.textContent = score;
    el.scoreFill.style.width = score + '%';
    el.label.textContent = label;
    el.heartsResult.textContent = `Поймано сердец: ${state.heartsCaught} из ${TOTAL_HEARTS}`;
    
    sendData(score, avgPre, avgPost, scr);
    
    show('results');
}

// URL бэкенда
const API_URL = 'https://screamer-backend.onrender.com';

async function saveGame(data) {
    try {
        console.log('Saving game...', data);
        const response = await fetch(API_URL + '/api/game-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log('Save result:', result);
        return result.success;
    } catch (e) {
        console.error('Save error:', e);
        return false;
    }
}

function sendData(score, avgPre, avgPost, scr) {
    const data = {
        fear_score: score,
        hearts_caught: state.heartsCaught,
        hearts_total: TOTAL_HEARTS,
        
        pre_start_delay: Math.round(avgPre.startDelay),
        pre_catch_time: Math.round(avgPre.catchTime),
        pre_return_time: Math.round(avgPre.returnTime),
        
        scream_start_delay: Math.round(scr.startDelay),
        scream_catch_time: Math.round(scr.catchTime),
        scream_return_time: Math.round(scr.returnTime),
        scream_lost: scr.lost,
        scream_micro_freeze: Math.round(scr.microFreeze),
        scream_direction_error: Math.round(scr.directionError),
        scream_speed_variability: Math.round(scr.speedVariability * 100) / 100,
        
        post_start_delay: Math.round(avgPost.startDelay),
        post_catch_time: Math.round(avgPost.catchTime),
        post_return_time: Math.round(avgPost.returnTime),
        
        raw_pre_calib: state.preCalib,
        raw_post_calib: state.postCalib,
        raw_screamer: scr,
        
        input_type: state.isMouse ? 'mouse' : 'touch',
        screamer_round: state.screamerRound + 1,
        device_info: navigator.userAgent,
        telegram_id: userId,
        username: tg?.initDataUnsafe?.user?.username || 'unknown'
    };
    
    // DEBUG - показываем все метрики в консоли
    console.log('=== GAME METRICS ===');
    console.log('Pre-calibration:', avgPre);
    console.log('Screamer:', scr);
    console.log('Post-calibration:', avgPost);
    console.log('Score breakdown:');
    console.log('  - Lost:', scr.lost ? '+45' : '0');
    if (avgPre.startDelay > 0 && scr.startDelay > 0) {
        const ratio = scr.startDelay / avgPre.startDelay;
        console.log('  - StartDelay ratio:', ratio.toFixed(2), ratio > 1.1 ? `+${Math.min(25, Math.round((ratio - 1) * 40))}` : '+0');
    }
    console.log('  - MicroFreeze:', scr.microFreeze, scr.microFreeze > 80 ? `+${Math.min(10, Math.round(scr.microFreeze / 30))}` : '+0');
    console.log('  - DirError:', scr.directionError, scr.directionError > 15 ? `+${Math.min(10, Math.round(scr.directionError / 5))}` : '+0');
    console.log('  - SpeedVar:', scr.speedVariability, scr.speedVariability > 0.5 ? `+${Math.min(8, Math.round(scr.speedVariability * 10))}` : '+0');
    console.log('Final score:', score);
    
    // АВТОСОХРАНЕНИЕ сразу после игры
    saveGame(data);
    
    window.gameResultData = data;
}

function restart() {
    window.gameResultData = null;
    playAmbient();
    startGame();
}

function closeApp() {
    stopAmbient();
    if (tg && tg.close) {
        tg.close();
    } else {
        show('warning');
    }
}
