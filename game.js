// ============================================================
// game.js — Основная логика игры
// Зависит от: config.js, metrics.js (загружаются раньше)
// ============================================================

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
const meowSound = document.getElementById('meowSound');

if (ambientSound) ambientSound.volume = 0.3;
if (laughSound) laughSound.volume = 0.6;
if (screamSound) screamSound.volume = 0.8;
if (meowSound) meowSound.volume = 0.7;

document.getElementById('soundBtn').onclick = () => {
    soundOn = !soundOn;
    document.getElementById('soundBtn').textContent = soundOn ? '🔊' : '🔇';
    if (!soundOn && ambientSound) ambientSound.pause();
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

// === DOM ===
const $ = id => document.getElementById(id);
const el = {
    warning: $('warning'), tutorial: $('tutorial'), game: $('game'), results: $('results'),
    zone: $('zone'), heart: $('heart'), pointer: $('pointer'),
    instruction: $('instruction'), heartsCounter: $('heartsCounter'),
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
    lastSaveTime: 0
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

function updateHeartsUI() {
    el.heartsCounter.textContent = `❤️ ${state.heartsCaught}/${CONFIG.TOTAL_HEARTS}`;
}

function placeHeart(minDist) {
    const zone = zoneCenter();
    const pad = 50;
    const maxY = window.innerHeight * CONFIG.HEART_MAX_Y_RATIO;
    let attempts = 0;
    do {
        heartX = pad + Math.random() * (window.innerWidth - pad*2);
        heartY = 50 + Math.random() * (maxY - 50);
        attempts++;
    } while ((dist(heartX, heartY, zone.x, zone.y) < minDist ||
              dist(heartX, heartY, state.lastX, state.lastY) < CONFIG.HEART_R * 3) &&
             attempts < 40);
    el.heart.style.left = (heartX - 20) + 'px';
    el.heart.style.top = (heartY - 20) + 'px';
}

// ============================================================
// SCREENS
// ============================================================
function show(name) {
    ['warning','tutorial','game','results'].forEach(s =>
        el[s].classList.toggle('active', s === name));
}

function showTutorial() { playLaugh(); playAmbient(); show('tutorial'); }

function startGame() {
    show('game');
    Object.assign(state, {
        phase:'wait', round:0, active:false,
        heartCaughtThisRound:false, returnedThisRound:false,
        heartsCaught:0, heartsMissed:0,
        preCalib:[], fakeScreamer:null, midCalib:[],
        realScreamer:null, postCalib:[],
        fakeHappened:false, realHappened:false,
        currentEvent:'normal', trajectory:[], maxRecoil:0,
        screamerAt:0
    });
    clearTimeout(state.heartTimer);

    // Atmosphere picks scenario & round numbers
    atmosphere.pickScenario();
    const rounds = atmosphere.getScreamerRounds();
    state.fakeScreamerRound = rounds.fakeRound;
    state.realScreamerRound = rounds.realRound;
    state.scenarioKey = rounds.scenarioKey;
    console.log(`🎭 Scenario ${rounds.scenarioKey} — Fake: ${state.fakeScreamerRound}, Real: ${state.realScreamerRound}`);

    atmosphere.start();

    el.pointer.classList.remove('active');
    el.heart.classList.remove('visible','fading');
    el.screamer.classList.remove('active');
    el.fakeScreamer.classList.remove('active');
    updateHeartsUI();
    el.instruction.textContent = 'Положи палец в круг';
    el.zone.className = 'hold-zone';

    const evts = [
        ['touchstart', onTouchStart], ['touchmove', onTouchMove], ['touchend', onTouchEnd],
        ['mousedown', onMouseDown], ['mousemove', onMouseMove], ['mouseup', onMouseUp]
    ];
    evts.forEach(([e,fn]) => document.removeEventListener(e, fn));
    document.addEventListener('touchstart', onTouchStart, {passive:false});
    document.addEventListener('touchmove', onTouchMove, {passive:false});
    document.addEventListener('touchend', onTouchEnd, {passive:false});
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

// ============================================================
// INPUT
// ============================================================
function touchInfo(t) {
    return { radiusX: t.radiusX||0, radiusY: t.radiusY||0, force: t.force||0 };
}

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

function handleRelease() {
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
            if (heartX && heartY && distance > 2) {
                angle = angleBetween(dx, dy, heartX - prevX, heartY - prevY);
            }
            const info = ti || {};
            state.trajectory.push({
                x, y, t: now, speed, angle, dx, dy, distance,
                radiusX: info.radiusX||0, radiusY: info.radiusY||0,
                force: info.force||0,
                contactArea: Math.PI * (info.radiusX||0) * (info.radiusY||0)
            });
        }
        if (!state.moveAt && dist(state.startX, state.startY, x, y) > CONFIG.MOVE_TH) {
            state.moveAt = now;
        }
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

    const delay = CONFIG.PAUSE_MIN + Math.random() * (CONFIG.PAUSE_MAX - CONFIG.PAUSE_MIN);
    setTimeout(() => {
        if (state.phase === 'wait' && state.active) showHeart();
    }, delay);
}

function showHeart() {
    const C = CONFIG;

    // Determine event type
    if (state.round === state.fakeScreamerRound && !state.fakeHappened) {
        state.currentEvent = 'fake';
    } else if (state.round === state.realScreamerRound && !state.realHappened) {
        state.currentEvent = 'real';
    } else {
        state.currentEvent = 'normal';
    }

    // Atmosphere round hook
    atmosphere.onRound(state.round, state.currentEvent === 'real', state.realHappened);

    // Reset round
    state.heartCaughtThisRound = false;
    state.returnedThisRound = false;
    state.trajectory = [];
    state.maxRecoil = 0;
    state.lastMoveTime = Date.now();
    state.startX = state.lastX;
    state.startY = state.lastY;
    state.moveAt = 0;
    state.screamerAt = 0; // 🐛 FIX: обнуляем чтобы не тащить между раундами

    const isReal = state.currentEvent === 'real';
    const isFake = state.currentEvent === 'fake';
    placeHeart(isReal ? C.SCREAMER_HEART_DIST : C.MIN_HEART_DIST);

    el.zone.className = 'hold-zone waiting';

    // Heart anomaly check
    const anomaly = atmosphere.getHeartAnomaly();
    if (anomaly && !isReal && !isFake) {
        if (anomaly.css) {
            el.heart.style.cssText += anomaly.css;
            if (anomaly.duration > 0) {
                setTimeout(() => { el.heart.style.filter = ''; el.heart.style.opacity = ''; }, anomaly.duration);
            }
        }
    } else {
        el.heart.style.filter = '';
    }

    if (isReal) {
        state.screamerAt = Date.now();
        if (el.screamerEmoji) {
            el.screamerEmoji.textContent = C.SCREAMER_EMOJIS[Math.floor(Math.random() * C.SCREAMER_EMOJIS.length)];
        }
        el.screamer.classList.add('active');
        playScream();

        // Atmosphere screamer effects (red flash, invert, shake, haptic)
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

    if (state.currentEvent === 'real') {
        state.realScreamer = { ...state._currentRound, lost: false };
    } else if (state.currentEvent === 'fake') {
        state.fakeScreamer = { ...state._currentRound, lost: false };
    }
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
    updateHeartsUI();
    el.zone.className = 'hold-zone active';
    el.instruction.textContent = '';

    const roundData = {
        ...state._currentRound,
        returnTime,
        recoilDistance: state.maxRecoil,
        returnAsymmetry
    };

    if (state.currentEvent === 'real') {
        state.realScreamer = { ...roundData, lost: false };
    } else if (state.currentEvent === 'fake') {
        state.fakeScreamer = { ...roundData, lost: false };
    } else if (!state.fakeHappened) {
        state.preCalib.push(roundData);
    } else if (!state.realHappened) {
        state.midCalib.push(roundData);
    } else {
        state.postCalib.push(roundData);
    }

    state.round++;
    if (state.round >= CONFIG.TOTAL_HEARTS) { setTimeout(showResults, 400); return; }

    setTimeout(() => {
        state.phase = 'wait';
        if (state.active) {
            const d = CONFIG.PAUSE_MIN + Math.random() * (CONFIG.PAUSE_MAX - CONFIG.PAUSE_MIN);
            setTimeout(() => {
                if (state.phase === 'wait' && state.active) showHeart();
            }, d);
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

    if (state.currentEvent === 'real' && !state.realScreamer?.lost) {
        state.realScreamer = { lost: true, missed: true };
    }
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
    atmosphere.stop();
    ['touchstart','touchmove','touchend','mousedown','mousemove','mouseup'].forEach(e => {
        document.removeEventListener(e, {touchstart:onTouchStart, touchmove:onTouchMove,
            touchend:onTouchEnd, mousedown:onMouseDown, mousemove:onMouseMove, mouseup:onMouseUp}[e]);
    });

    const scr = state.realScreamer || { lost: true };
    const fake = state.fakeScreamer;
    const avgPre = avgMetrics([...state.preCalib, ...state.midCalib]);
    const avgPost = avgMetrics(state.postCalib);

    const { score, details } = computeScore(scr, fake, avgPre, avgPost);

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
    show('results');
}

async function saveGame(score, scr, fake, avgPre, avgPost) {
    // Anti-duplicate
    const now = Date.now();
    if (now - state.lastSaveTime < CONFIG.SAVE_COOLDOWN_MS) {
        console.log('Save skipped — cooldown');
        return;
    }
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
