// === Telegram ===
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id') || tg?.initDataUnsafe?.user?.id;

// === Audio ===
let soundOn = true;
const ambientSound = document.getElementById('ambientSound');
const laughSound = document.getElementById('laughSound');
const screamSound = document.getElementById('screamSound');

ambientSound.volume = 0.3;
laughSound.volume = 0.6;
screamSound.volume = 0.8;

document.getElementById('soundBtn').onclick = () => {
    soundOn = !soundOn;
    document.getElementById('soundBtn').textContent = soundOn ? '🔊' : '🔇';
    if (!soundOn) ambientSound.pause();
};

function playAmbient() {
    if (!soundOn) return;
    ambientSound.play().catch(() => {});
}

function stopAmbient() {
    ambientSound.pause();
    ambientSound.currentTime = 0;
}

function playLaugh() {
    if (!soundOn) return;
    laughSound.currentTime = 0;
    laughSound.play().catch(() => {});
}

function playScream() {
    if (!soundOn) return;
    if (screamSound.readyState >= 2) {
        screamSound.currentTime = 0;
        screamSound.play().catch(() => {});
    } else {
        // Fallback
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
const MOVE_TH = 15; // Порог движения
const HEART_TIMEOUT = 1000; // Сердце исчезает через 1 сек
const TOTAL_HEARTS = 7; // Всего сердец в игре

// === State ===
const state = {
    phase: 'wait', // wait, toHeart, toZone
    round: 0,
    active: false,
    isMouse: false,
    
    // Timing
    heartAt: 0,      // Когда появилось сердце
    moveAt: 0,       // Когда начал двигаться
    catchAt: 0,      // Когда поймал
    returnStartAt: 0, // Когда начал возврат
    
    // Position
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    catchX: 0, catchY: 0,
    
    // Screamer
    screamerRound: 0, // На каком раунде скример (рандом 2-4)
    isScreamerRound: false,
    screamerHappened: false,
    
    // Metrics
    heartsCaught: 0,
    heartsMissed: 0,
    
    // Data collection
    preCalib: [],   // До скримера
    screamer: { startDelay: 0, catchTime: 0, returnTime: 0, lost: false },
    postCalib: [],  // После скримера
    
    // Heart timeout
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

// Проверка движения В СТОРОНУ сердца
function isMovingTowardsHeart(fromX, fromY, toX, toY) {
    const distBefore = dist(fromX, fromY, heartX, heartY);
    const distAfter = dist(toX, toY, heartX, heartY);
    return distAfter < distBefore - 5; // Минимум 5px ближе
}

function updateHeartsUI() {
    el.heartsCounter.textContent = `❤️ ${state.heartsCaught}`;
}

function placeHeart() {
    const p = 60;
    const maxY = Math.min(window.innerHeight * 0.35, 250);
    heartX = p + Math.random() * (window.innerWidth - p*2);
    heartY = 80 + Math.random() * maxY;
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
    
    // Reset state
    state.round = 0;
    state.heartsCaught = 0;
    state.heartsMissed = 0;
    state.preCalib = [];
    state.postCalib = [];
    state.screamer = { startDelay: 0, catchTime: 0, returnTime: 0, lost: false };
    state.screamerHappened = false;
	// 🔥 ЖЁСТКИЙ RESET FSM
    state.phase = 'wait';
    state.active = false;
    state.heartCaughtThisRound = false;
    clearTimeout(state.heartTimer);
    
    // Рандомный раунд для скримера (2, 3 или 4 — т.е. 3й, 4й или 5й сердечко)
    state.screamerRound = 2 + Math.floor(Math.random() * 3);
    
    updateHeartsUI();
    el.instruction.textContent = 'Положи палец в круг';
    el.zone.className = 'hold-zone';
    
    // Events
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
    if (state.phase === 'toHeart' || state.phase === 'toZone') {
        if (state.isScreamerRound) state.screamer.lost = true;
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
    else if (state.phase === 'toHeart') {
        // Детектим начало движения К СЕРДЦУ
        if (!state.moveAt && prevX !== undefined) {
            const moved = dist(state.startX, state.startY, x, y);
            if (moved > MOVE_TH && isMovingTowardsHeart(prevX, prevY, x, y)) {
                state.moveAt = now;
            }
        }
        
        // Проверяем поимку
        if (onHeart(x, y)) {
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
    
    const delay = 1400 + Math.random() * 1200;
    setTimeout(() => {
        if (state.phase === 'wait' && state.active) showHeart();
    }, delay);
}

function showHeart() {
    // Определяем тип раунда
    state.isScreamerRound = (state.round === state.screamerRound && !state.screamerHappened);
    state.heartCaughtThisRound = false;
    placeHeart();
    
    state.startX = state.lastX;
    state.startY = state.lastY;
    state.phase = 'toHeart';
    state.heartAt = Date.now();
    state.moveAt = 0;
    
    el.zone.className = 'hold-zone waiting';
    el.heart.classList.remove('fading');
    el.heart.classList.add('visible');
    
    // Таймер исчезновения сердца
    clearTimeout(state.heartTimer);
    state.heartTimer = setTimeout(() => {
        if (state.phase === 'toHeart') {
            // Не успел поймать!
            el.heart.classList.add('fading');
            setTimeout(() => missHeart(), 150);
        }
    }, HEART_TIMEOUT);
    
    if (state.isScreamerRound) {
        el.screamer.classList.add('active');
        playScream();
        if (navigator.vibrate) navigator.vibrate([200, 50, 200, 50, 300]);
        setTimeout(() => el.screamer.classList.remove('active'), 900);
        state.screamerHappened = true;
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
    
    // Считаем метрики
    const startDelay = state.moveAt ? state.moveAt - state.heartAt : now - state.heartAt;
    const catchTime = now - state.heartAt;
    
    state.phase = 'toZone';
    state.returnStartAt = now;
    
    el.heart.classList.remove('visible', 'fading');
    el.zone.className = 'hold-zone';
    el.instruction.textContent = '← В круг';
    
    // Сохраняем промежуточные данные для этого раунда
    state._currentRound = { startDelay, catchTime };
    
    if (state.isScreamerRound) {
        state.screamer.startDelay = startDelay;
        state.screamer.catchTime = catchTime;
    }
}

function returnedToZone() {
    if (state.phase !== 'toZone') return;

    state.phase = 'wait'; // ❗ а не cooldown

    const now = Date.now();
    const returnTime = now - state.returnStartAt;
    
    state.heartsCaught++;
    updateHeartsUI();
    
    el.zone.className = 'hold-zone active';
    el.instruction.textContent = '';
    
    // Сохраняем полные данные раунда
    const roundData = {
        ...state._currentRound,
        returnTime
    };
    
    if (state.isScreamerRound) {
        state.screamer.returnTime = returnTime;
    } else if (!state.screamerHappened) {
        state.preCalib.push(roundData);
    } else {
        state.postCalib.push(roundData);
    }
    
    state.round++;
    
    // Проверяем конец игры
    if (state.round >= TOTAL_HEARTS) {
        setTimeout(showResults, 400);
        return;
    }
    
    // Следующее сердце
    state.phase = 'wait';
    setTimeout(() => {
        if (state.phase === 'wait' && state.active) showHeart();
    }, 600 + Math.random() * 800);
}

function missHeart() {
    clearTimeout(state.heartTimer);
    
    state.heartsMissed++;
    el.heart.classList.remove('visible', 'fading');
    
    if (state.isScreamerRound) {
        state.screamer.lost = true;
    }
    
    state.round++;
    
    if (state.round >= TOTAL_HEARTS) {
        setTimeout(showResults, 400);
        return;
    }
    
    // Продолжаем
    state.phase = 'wait';
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
    
    // Вычисляем средние метрики
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
    
    // Рассчёт Score
    let score = 0;
    
    // 1. Убрал палец / не поймал при скримере = сильный испуг
    if (scr.lost) {
        score += 50;
    } else {
        // 2. Задержка старта при скримере vs калибровка (главная метрика!)
        if (avgPre.startDelay > 0 && scr.startDelay > 0) {
            const ratio = scr.startDelay / avgPre.startDelay;
            if (ratio > 1.15) {
                score += Math.min(30, Math.round((ratio - 1) * 50));
            }
        }
        
        // 3. Время поимки
        if (avgPre.catchTime > 0 && scr.catchTime > 0) {
            const ratio = scr.catchTime / avgPre.catchTime;
            if (ratio > 1.2) {
                score += Math.min(15, Math.round((ratio - 1) * 25));
            }
        }
        
        // 4. Время возврата
        if (avgPre.returnTime > 0 && scr.returnTime > 0) {
            const ratio = scr.returnTime / avgPre.returnTime;
            if (ratio > 1.2) {
                score += Math.min(10, Math.round((ratio - 1) * 15));
            }
        }
    }
    
    // 5. Бонус: сравнение post vs pre (восстановление)
    // Если после скримера метрики хуже — человек ещё не отошёл
    if (avgPost.startDelay > avgPre.startDelay * 1.1) {
        score += 5;
    }
    
    score = Math.min(100, Math.max(0, Math.round(score)));
    
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
    
    // Отображение
    el.score.textContent = score;
    el.scoreFill.style.width = score + '%';
    el.label.textContent = label;
    el.heartsResult.textContent = `Поймано сердец: ${state.heartsCaught} из ${TOTAL_HEARTS}`;
    
    // Отправка данных
    sendData(score, avgPre, avgPost, scr);
    
    show('results');
}

function sendData(score, avgPre, avgPost, scr) {
    const data = {
        fear_score: score,
        hearts_caught: state.heartsCaught,
        hearts_total: TOTAL_HEARTS,
        
        // Pre-screamer calibration averages
        pre_start_delay: Math.round(avgPre.startDelay),
        pre_catch_time: Math.round(avgPre.catchTime),
        pre_return_time: Math.round(avgPre.returnTime),
        
        // Screamer round
        scream_start_delay: Math.round(scr.startDelay),
        scream_catch_time: Math.round(scr.catchTime),
        scream_return_time: Math.round(scr.returnTime),
        scream_lost: scr.lost,
        
        // Post-screamer averages
        post_start_delay: Math.round(avgPost.startDelay),
        post_catch_time: Math.round(avgPost.catchTime),
        post_return_time: Math.round(avgPost.returnTime),
        
        // Raw data
        raw_pre_calib: state.preCalib,
        raw_post_calib: state.postCalib,
        raw_screamer: scr,
        
        // Meta
        input_type: state.isMouse ? 'mouse' : 'touch',
        screamer_round: state.screamerRound + 1,
        device_info: navigator.userAgent
    };
    
    if (tg) {
        tg.sendData(JSON.stringify(data));
    } else {
        console.log('Game result:', data);
        // Debug output for testing
        console.table({
            'Pre startDelay': avgPre.startDelay.toFixed(0) + ' ms',
            'Scream startDelay': scr.startDelay.toFixed(0) + ' ms',
            'Post startDelay': avgPost.startDelay.toFixed(0) + ' ms',
            'Ratio': scr.startDelay ? (scr.startDelay / avgPre.startDelay).toFixed(2) : 'N/A'
        });
    }
}

function restart() {
    playAmbient();
    startGame();
}

function closeApp() {
    stopAmbient();
    if (tg) tg.close();
    else show('warning');
}
