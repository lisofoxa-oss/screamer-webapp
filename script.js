// ============================================================
// 1. INITIALIZATION
// ============================================================
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id') || tg?.initDataUnsafe?.user?.id;
const API_URL = 'https://screamer-backend.onrender.com';

// Audio
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

function playAmbient() { if (soundOn && ambientSound) ambientSound.play().catch(() => {}); }
function stopAmbient() { if (ambientSound) { ambientSound.pause(); ambientSound.currentTime = 0; } }
function playLaugh() { if (soundOn && laughSound) { laughSound.currentTime = 0; laughSound.play().catch(() => {}); } }
function playMeow() { if (soundOn && meowSound) { meowSound.currentTime = 0; meowSound.play().catch(() => {}); } }
function playScream() {
    if (!soundOn) return;
    if (screamSound && screamSound.readyState >= 2) {
        screamSound.currentTime = 0;
        screamSound.play().catch(() => {});
    } else {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 900; osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        } catch(e) {}
    }
}

// ============================================================
// 2. CONSTANTS & STATE
// ============================================================
const HEART_R = 40;
const ZONE_R = 55;
const MOVE_TH = 15;
const HEART_TIMEOUT = 1500;
const TOTAL_HEARTS = 12;
const MIN_HEART_DIST = 200;
const SCREAMER_HEART_DIST = 280;
const SCREAMER_HEART_DELAY = 150;
const FAKE_HEART_DELAY = 120;
const PAUSE_MIN = 1200;
const PAUSE_MAX = 3200;

const SCREAMER_EMOJIS = ['👻', '💀', '😱', '🎃', '👹'];

const state = {
    phase: 'wait',
    round: 0,
    active: false,
    isMouse: false,
    heartCaughtThisRound: false,
    returnedThisRound: false,

    // Timing
    heartAt: 0, moveAt: 0, catchAt: 0, returnStartAt: 0,
    screamerAt: 0, lastMoveTime: 0,

    // Position
    startX: 0, startY: 0, lastX: 0, lastY: 0,
    catchX: 0, catchY: 0,

    // Trajectory & biometrics
    trajectory: [],
    maxRecoil: 0,

    // Screamer config
    fakeScreamerRound: 0,
    realScreamerRound: 0,
    currentEvent: 'normal', // 'normal', 'fake', 'real'
    fakeHappened: false,
    realHappened: false,

    // Counts
    heartsCaught: 0,
    heartsMissed: 0,

    // Data buckets
    preCalib: [],
    fakeScreamer: null,
    midCalib: [],
    realScreamer: null,
    postCalib: [],

    heartTimer: null,
    _currentRound: null
};

// ============================================================
// 3. DOM & HELPERS
// ============================================================
const $ = id => document.getElementById(id);
const el = {
    warning: $('warning'), tutorial: $('tutorial'), game: $('game'), results: $('results'),
    zone: $('zone'), heart: $('heart'), pointer: $('pointer'),
    instruction: $('instruction'), heartsCounter: $('heartsCounter'),
    screamer: $('screamer'), screamerImg: $('screamerImg'), screamerEmoji: $('screamerEmoji'),
    fakeScreamer: $('fakeScreamer'), kittyImg: $('kittyImg'), kittyEmoji: $('kittyEmoji'),
    score: $('score'), scoreFill: $('scoreFill'), label: $('label'), heartsResult: $('heartsResult')
};

let heartX = 0, heartY = 0;

const dist = (x1, y1, x2, y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2);

function zoneCenter() {
    const r = el.zone.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
}

const inZone = (x, y) => dist(x, y, zoneCenter().x, zoneCenter().y) <= ZONE_R;
const onHeart = (x, y) => dist(x, y, heartX, heartY) <= HEART_R;

function angleBetween(v1x, v1y, v2x, v2y) {
    const dot = v1x*v2x + v1y*v2y;
    const m1 = Math.sqrt(v1x*v1x + v1y*v1y);
    const m2 = Math.sqrt(v2x*v2x + v2y*v2y);
    if (m1 === 0 || m2 === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (m1*m2)))) * 180 / Math.PI;
}

function updateHeartsUI() {
    el.heartsCounter.textContent = `❤️ ${state.heartsCaught}/${TOTAL_HEARTS}`;
}

function placeHeart(minDist = MIN_HEART_DIST) {
    const zone = zoneCenter();
    const pad = 50;
    const maxY = window.innerHeight * 0.42;
    let attempts = 0;
    do {
        heartX = pad + Math.random() * (window.innerWidth - pad*2);
        heartY = 50 + Math.random() * (maxY - 50);
        attempts++;
    } while ((dist(heartX, heartY, zone.x, zone.y) < minDist ||
              dist(heartX, heartY, state.lastX, state.lastY) < HEART_R * 3) &&
             attempts < 40);
    el.heart.style.left = (heartX - 20) + 'px';
    el.heart.style.top = (heartY - 20) + 'px';
}

// ============================================================
// 4. SCREENS
// ============================================================
function show(name) {
    ['warning', 'tutorial', 'game', 'results'].forEach(s =>
        el[s].classList.toggle('active', s === name)
    );
}

function showTutorial() { playLaugh(); playAmbient(); show('tutorial'); }

function startGame() {
    show('game');

    // Hard reset
    Object.assign(state, {
        phase: 'wait', round: 0, active: false,
        heartCaughtThisRound: false, returnedThisRound: false,
        heartsCaught: 0, heartsMissed: 0,
        preCalib: [], fakeScreamer: null, midCalib: [],
        realScreamer: null, postCalib: [],
        fakeHappened: false, realHappened: false,
        currentEvent: 'normal', trajectory: [], maxRecoil: 0
    });
    clearTimeout(state.heartTimer);

    // Fake screamer: round 5 or 6
    state.fakeScreamerRound = 5 + Math.floor(Math.random() * 2);
    // Real screamer: 2-3 rounds after fake
    state.realScreamerRound = state.fakeScreamerRound + 2 + Math.floor(Math.random() * 2);
    console.log(`Fake screamer: round ${state.fakeScreamerRound}, Real: round ${state.realScreamerRound}`);

    el.pointer.classList.remove('active');
    el.heart.classList.remove('visible', 'fading');
    el.screamer.classList.remove('active');
    el.fakeScreamer.classList.remove('active');
    updateHeartsUI();
    el.instruction.textContent = 'Положи палец в круг';
    el.zone.className = 'hold-zone';

    // Fresh listeners
    const events = [
        ['touchstart', onTouchStart], ['touchmove', onTouchMove], ['touchend', onTouchEnd],
        ['mousedown', onMouseDown], ['mousemove', onMouseMove], ['mouseup', onMouseUp]
    ];
    events.forEach(([e, fn]) => document.removeEventListener(e, fn));
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

// ============================================================
// 5. INPUT HANDLERS
// ============================================================
function touchInfo(t) {
    return { radiusX: t.radiusX || 0, radiusY: t.radiusY || 0, force: t.force || 0 };
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
    if (['toHeart', 'toZone', 'screamerShock', 'fakeShock'].includes(state.phase)) {
        if (state.currentEvent === 'real') state.realScreamer = state.realScreamer || {};
        if (state.currentEvent === 'real' && state.realScreamer) state.realScreamer.lost = true;
        fail();
    }
    state.active = false;
    el.pointer.classList.remove('active');
}

function updatePointer(x, y) {
    el.pointer.style.left = x + 'px'; el.pointer.style.top = y + 'px';
    el.pointer.classList.add('active');
}

// ============================================================
// 6. GAME LOGIC
// ============================================================
function process(x, y, prevX, prevY, ti) {
    const now = Date.now();

    if (state.phase === 'wait') {
        if (inZone(x, y)) enterZone(x, y);
        return;
    }

    const trackPhases = ['screamerShock', 'fakeShock', 'toHeart'];
    if (trackPhases.includes(state.phase)) {
        // Record trajectory
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
                radiusX: info.radiusX || 0, radiusY: info.radiusY || 0,
                force: info.force || 0,
                contactArea: Math.PI * (info.radiusX || 0) * (info.radiusY || 0)
            });
        }

        // Detect movement start
        if (!state.moveAt) {
            if (dist(state.startX, state.startY, x, y) > MOVE_TH) {
                state.moveAt = now;
            }
        }

        // Catch check
        if (state.phase === 'toHeart' && onHeart(x, y)) catchHeart(x, y);
    }

    if (state.phase === 'toZone') {
        // Track recoil distance
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

    const delay = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
    setTimeout(() => {
        if (state.phase === 'wait' && state.active) showHeart();
    }, delay);
}

function showHeart() {
    // Determine event type
    if (state.round === state.fakeScreamerRound && !state.fakeHappened) {
        state.currentEvent = 'fake';
    } else if (state.round === state.realScreamerRound && !state.realHappened) {
        state.currentEvent = 'real';
    } else {
        state.currentEvent = 'normal';
    }

    // Reset round
    state.heartCaughtThisRound = false;
    state.returnedThisRound = false;
    state.trajectory = [];
    state.maxRecoil = 0;
    state.lastMoveTime = Date.now();
    state.startX = state.lastX;
    state.startY = state.lastY;
    state.moveAt = 0;

    const isScary = state.currentEvent === 'real';
    const isFake = state.currentEvent === 'fake';
    placeHeart(isScary ? SCREAMER_HEART_DIST : MIN_HEART_DIST);

    el.zone.className = 'hold-zone waiting';

    if (isScary) {
        // === REAL SCREAMER ===
        state.screamerAt = Date.now();
        if (el.screamerEmoji) {
            el.screamerEmoji.textContent = SCREAMER_EMOJIS[Math.floor(Math.random() * SCREAMER_EMOJIS.length)];
        }
        el.screamer.classList.add('active');
        playScream();
        if (navigator.vibrate) navigator.vibrate([200, 50, 200, 50, 300]);

        state.phase = 'screamerShock';
        state.heartAt = Date.now();

        setTimeout(() => {
            if (!['screamerShock', 'wait'].includes(state.phase) && state.phase !== 'screamerShock') return;
            state.phase = 'toHeart';
            state.heartAt = Date.now();
            el.heart.classList.remove('fading');
            el.heart.classList.add('visible');
            setHeartTimer();
        }, SCREAMER_HEART_DELAY);

        setTimeout(() => el.screamer.classList.remove('active'), 900);
        state.realHappened = true;

    } else if (isFake) {
        // === FAKE SCREAMER (kitty) ===
        state.screamerAt = Date.now();
        el.fakeScreamer.classList.add('active');
        playMeow();
        if (navigator.vibrate) navigator.vibrate(100);

        state.phase = 'fakeShock';
        state.heartAt = Date.now();

        setTimeout(() => {
            state.phase = 'toHeart';
            state.heartAt = Date.now();
            el.heart.classList.remove('fading');
            el.heart.classList.add('visible');
            setHeartTimer();
        }, FAKE_HEART_DELAY);

        setTimeout(() => el.fakeScreamer.classList.remove('active'), 700);
        state.fakeHappened = true;

    } else {
        // === NORMAL ===
        state.phase = 'toHeart';
        state.heartAt = Date.now();
        el.heart.classList.remove('fading');
        el.heart.classList.add('visible');
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
    }, HEART_TIMEOUT);
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

    el.heart.classList.remove('visible', 'fading');
    el.zone.className = 'hold-zone';
    el.instruction.textContent = '← В круг';

    // Analyze trajectory
    const metrics = analyzeRound(state.trajectory);
    const isFlinch = startDelay < 100 && metrics.directionError > 15;

    state._currentRound = {
        startDelay, catchTime, shockDuration, isFlinch,
        ...metrics, missed: false
    };

    // Store in screamer-specific data
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

    // Sort into bucket
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
    if (state.round >= TOTAL_HEARTS) { setTimeout(showResults, 400); return; }

    setTimeout(() => {
        state.phase = 'wait';
        if (state.active) {
            const d = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
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
    el.heart.classList.remove('visible', 'fading');

    if (state.currentEvent === 'real') {
        const metrics = analyzeRound(state.trajectory);
        state.realScreamer = { ...metrics, lost: true, missed: true, catchTime: HEART_TIMEOUT,
            startDelay: state.moveAt ? state.moveAt - state.heartAt : HEART_TIMEOUT,
            shockDuration: state.screamerAt ? Date.now() - state.screamerAt : 0 };
    } else if (state.currentEvent === 'fake') {
        state.fakeScreamer = { lost: true, missed: true };
    }

    state.round++;
    if (state.round >= TOTAL_HEARTS) { setTimeout(showResults, 400); return; }
    el.zone.className = 'hold-zone';
    el.instruction.textContent = 'Не успел! Снова в круг';
}

function fail() {
    clearTimeout(state.heartTimer);
    state.phase = 'wait';
    el.heart.classList.remove('visible', 'fading');
    el.zone.className = 'hold-zone';
    el.screamer.classList.remove('active');
    el.fakeScreamer.classList.remove('active');

    if (state.currentEvent === 'real' && !state.realScreamer?.lost) {
        state.realScreamer = { lost: true, missed: true };
    }
    state.heartsMissed++;
    state.round++;
    if (state.round >= TOTAL_HEARTS) { setTimeout(showResults, 400); return; }
    el.instruction.textContent = 'Палец оторвался! Снова в круг';
}

// ============================================================
// 7. METRICS ANALYSIS
// ============================================================
function analyzeRound(traj) {
    const r = {
        microFreeze: 0, freezeOnset: 0,
        directionError: 0, speedVariability: 0,
        totalJerk: 0, jerkPeakLatency: 0,
        sinuosity: 1, trajectoryLength: 0,
        contactAreaAvg: 0, contactAreaMax: 0, contactAreaDelta: 0,
        forceAvg: 0, forceMax: 0,
        pointCount: traj.length
    };
    if (traj.length < 2) return r;

    // Trajectory length
    let totalPath = 0;
    for (let i = 1; i < traj.length; i++) totalPath += traj[i].distance || 0;
    r.trajectoryLength = totalPath;

    // Sinuosity
    const directDist = dist(traj[0].x, traj[0].y, traj[traj.length-1].x, traj[traj.length-1].y);
    r.sinuosity = directDist > 10 ? totalPath / directDist : 1;

    // Micro-freeze & freeze onset
    let frozenStart = 0;
    for (let i = 1; i < traj.length; i++) {
        const gap = traj[i].t - traj[i-1].t;
        if (gap > 50 && !r.microFreeze) r.microFreeze = gap;
        // Freeze: speed near 0 for >50ms
        if (traj[i].speed < 30) {
            if (!frozenStart) frozenStart = traj[i].t;
            else if (traj[i].t - frozenStart > 50 && !r.freezeOnset) {
                r.freezeOnset = frozenStart - traj[0].t;
            }
        } else { frozenStart = 0; }
    }

    // Direction error
    let totalAngle = 0, angleCount = 0;
    for (const p of traj) {
        if (!isNaN(p.angle) && p.distance > 3) { totalAngle += p.angle; angleCount++; }
    }
    r.directionError = angleCount > 0 ? totalAngle / angleCount : 0;

    // Speed stats
    const speeds = traj.filter(p => p.speed > 0 && !isNaN(p.speed)).map(p => p.speed);
    if (speeds.length > 2) {
        const avg = speeds.reduce((a,b) => a+b, 0) / speeds.length;
        const variance = speeds.reduce((s, v) => s + (v-avg)**2, 0) / speeds.length;
        r.speedVariability = avg > 0 ? Math.sqrt(variance) / avg : 0;
    }

    // Jerk
    let maxJerk = 0, maxJerkIdx = 0;
    for (let i = 1; i < speeds.length; i++) {
        const j = Math.abs(speeds[i] - speeds[i-1]);
        r.totalJerk += j;
        if (j > maxJerk) { maxJerk = j; maxJerkIdx = i; }
    }
    if (maxJerkIdx > 0 && traj[maxJerkIdx]) {
        r.jerkPeakLatency = traj[maxJerkIdx].t - traj[0].t;
    }

    // Contact area & force
    const areas = traj.filter(p => p.contactArea > 0).map(p => p.contactArea);
    if (areas.length > 0) {
        r.contactAreaAvg = areas.reduce((a,b) => a+b, 0) / areas.length;
        r.contactAreaMax = Math.max(...areas);
        r.contactAreaDelta = r.contactAreaMax - Math.min(...areas);
    }
    const forces = traj.filter(p => p.force > 0).map(p => p.force);
    if (forces.length > 0) {
        r.forceAvg = forces.reduce((a,b) => a+b, 0) / forces.length;
        r.forceMax = Math.max(...forces);
    }

    return r;
}

// ============================================================
// 8. SCORE & RESULTS
// ============================================================
function avgMetrics(rounds) {
    const valid = rounds.filter(r => r.catchTime > 100 && !r.missed);
    if (!valid.length) return { startDelay: 400, catchTime: 550, returnTime: 250,
        directionError: 5, speedVariability: 0.8, totalJerk: 600, sinuosity: 1.2 };
    const avg = key => valid.reduce((a,b) => a + (b[key] || 0), 0) / valid.length;
    return {
        startDelay: avg('startDelay'), catchTime: avg('catchTime'), returnTime: avg('returnTime'),
        directionError: avg('directionError'), speedVariability: avg('speedVariability'),
        totalJerk: avg('totalJerk'), sinuosity: avg('sinuosity')
    };
}

function computeScore(scr, avgPre, avgPost) {
    let score = 0;
    const details = [];

    if (!scr || scr.lost) {
        score += 50;
        details.push('Lost: +50');
        if (avgPost.catchTime > avgPre.catchTime * 1.05) { score += 5; details.push('PostDeg: +5'); }
        score += Math.min(10, state.heartsMissed * 3);
        return { score: Math.min(100, score), details };
    }

    // 1. FLINCH: startDelay near 0 = involuntary jerk
    if (scr.startDelay < 100) {
        const pts = 20;
        score += pts;
        details.push(`Flinch(sd=${scr.startDelay}): +${pts}`);

        // Direction error during flinch = palec uletél ne tuda
        if (scr.directionError > 15) {
            const p = Math.min(15, Math.round(scr.directionError / 3));
            score += p;
            details.push(`FlinchDir(${scr.directionError.toFixed(0)}°): +${p}`);
        }
    }

    // 2. CatchTime ratio vs pre
    if (avgPre.catchTime > 0 && scr.catchTime > 0) {
        const ratio = scr.catchTime / avgPre.catchTime;
        if (ratio > 1.05) {
            const p = Math.min(12, Math.round((ratio - 1) * 30));
            score += p;
            details.push(`CatchRatio(${ratio.toFixed(2)}): +${p}`);
        }
    }

    // 3. TotalJerk (reaction intensity)
    if (avgPre.totalJerk > 0 && scr.totalJerk > avgPre.totalJerk * 1.3) {
        const p = Math.min(10, Math.round((scr.totalJerk / avgPre.totalJerk - 1) * 10));
        score += p;
        details.push(`Jerk(${scr.totalJerk.toFixed(0)} vs ${avgPre.totalJerk.toFixed(0)}): +${p}`);
    } else if (scr.totalJerk > 2000) {
        const p = Math.min(8, Math.round((scr.totalJerk - 2000) / 400));
        score += p;
        details.push(`JerkAbs(${scr.totalJerk.toFixed(0)}): +${p}`);
    }

    // 4. Sinuosity (zigzag)
    if (scr.sinuosity > 1.3) {
        const ratioSin = avgPre.sinuosity > 1 ? scr.sinuosity / avgPre.sinuosity : scr.sinuosity;
        if (ratioSin > 1.15) {
            const p = Math.min(8, Math.round((ratioSin - 1) * 20));
            score += p;
            details.push(`Sinuosity(${scr.sinuosity.toFixed(2)}): +${p}`);
        }
    }

    // 5. SpeedVariability
    if (scr.speedVariability > avgPre.speedVariability * 1.2) {
        const p = Math.min(6, Math.round((scr.speedVariability / avgPre.speedVariability - 1) * 15));
        score += p;
        details.push(`SpeedVar(${scr.speedVariability.toFixed(2)}): +${p}`);
    }

    // 6. ContactArea spike (touch biometric)
    if (scr.contactAreaMax > 0 && scr.contactAreaDelta > 500) {
        const p = Math.min(8, Math.round(scr.contactAreaDelta / 300));
        score += p;
        details.push(`ContactSpike(${scr.contactAreaDelta.toFixed(0)}): +${p}`);
    }

    // 7. Freeze onset
    if (scr.freezeOnset > 0 && scr.freezeOnset < 400) {
        score += 4;
        details.push(`Freeze(${scr.freezeOnset}ms): +4`);
    }

    // 8. MicroFreeze
    if (scr.microFreeze > 100) {
        const p = Math.min(5, Math.round(scr.microFreeze / 60));
        score += p;
        details.push(`MicroFreeze(${scr.microFreeze}ms): +${p}`);
    }

    // 9. Recoil distance
    if (scr.recoilDistance > 40) {
        const p = Math.min(5, Math.round(scr.recoilDistance / 30));
        score += p;
        details.push(`Recoil(${(scr.recoilDistance||0).toFixed(0)}px): +${p}`);
    }

    // 10. Post-screamer degradation
    if (avgPost.catchTime > avgPre.catchTime * 1.05) {
        score += 5;
        details.push('PostDeg: +5');
    }

    return { score: Math.min(100, Math.max(0, Math.round(score))), details };
}

function showResults() {
    stopAmbient();
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    const scr = state.realScreamer || { lost: true };
    const avgPre = avgMetrics([...state.preCalib, ...state.midCalib]);
    const avgPost = avgMetrics(state.postCalib);

    const { score, details } = computeScore(scr, avgPre, avgPost);

    console.log('=== SCORE BREAKDOWN ===');
    details.forEach(d => console.log('  ' + d));
    console.log('  TOTAL:', score);
    console.log('Pre-calib:', avgPre);
    console.log('Real screamer:', scr);
    console.log('Fake screamer:', state.fakeScreamer);
    console.log('Post-calib:', avgPost);

    const labels = [
        [10, '🤖 Железные нервы'], [25, '😎 Почти не вздрогнул'],
        [40, '😐 Немного растерялся'], [55, '😰 Хорошо испугался'],
        [75, '🙀 Сильно испугался!'], [Infinity, '📱💨 Максимальный испуг!']
    ];
    const label = labels.find(([max]) => score <= max)[1];

    el.score.textContent = score;
    el.scoreFill.style.width = score + '%';
    el.label.textContent = label;
    el.heartsResult.textContent = `Поймано сердец: ${state.heartsCaught} из ${TOTAL_HEARTS}`;

    saveGame(score, scr, avgPre, avgPost);
    show('results');
}

// ============================================================
// 9. SAVE & NETWORKING
// ============================================================
async function saveGame(score, scr, avgPre, avgPost) {
    const data = {
        fear_score: score,
        hearts_caught: state.heartsCaught,
        hearts_total: TOTAL_HEARTS,

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
        scream_sinuosity: Math.round((scr.sinuosity || 1) * 100) / 100,
        scream_flinch: !!(scr.startDelay < 100 && (scr.directionError || 0) > 15),
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
        fake_catch_time: Math.round(state.fakeScreamer?.catchTime || 0),
        fake_direction_error: Math.round(state.fakeScreamer?.directionError || 0),

        input_type: state.isMouse ? 'mouse' : 'touch',
        device_info: navigator.userAgent,
        telegram_id: userId,
        username: tg?.initDataUnsafe?.user?.username || 'unknown',

        raw_pre_calib: state.preCalib,
        raw_mid_calib: state.midCalib,
        raw_post_calib: state.postCalib,
        raw_fake_screamer: state.fakeScreamer,
        raw_real_screamer: state.realScreamer
    };

    try {
        const res = await fetch(API_URL + '/api/game-result', {
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
