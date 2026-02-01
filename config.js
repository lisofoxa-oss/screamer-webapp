// ============================================================
// config.js — Константы и параметры тюнинга
// ============================================================

const CONFIG = {
    // --- Gameplay ---
    TOTAL_HEARTS: 12,
    HEART_R: 40,
    ZONE_R: 55,
    MOVE_TH: 15,
    HEART_TIMEOUT: 1500,

    // Heart placement — ограничения чтобы не было на краю
    MIN_HEART_DIST: 200,
    SCREAMER_HEART_DIST: 280,
    MIN_HEART_Y: 130,            // не ближе 130px от верха (под надписями)
    MAX_HEART_Y_RATIO: 0.34,    // верхних 34% экрана (было 0.38)
    HEART_EDGE_PAD: 55,         // отступ от краёв экрана

    // Timing
    PAUSE_MIN: 1200,
    PAUSE_MAX: 3200,
    SCREAMER_HEART_DELAY: 150,
    FAKE_HEART_DELAY: 120,
    SCREAMER_HIDE_MS: 900,
    FAKE_HIDE_MS: 700,

    FAKE_ROUND_MIN: 5,
    FAKE_ROUND_SPREAD: 2,
    REAL_AFTER_FAKE_MIN: 2,
    REAL_AFTER_FAKE_SPREAD: 2,

    SCREAMER_EMOJIS: ['👻', '💀', '😱', '🎃', '👹'],

    // --- Creepy intermission text ---
    CREEPY_MESSAGES: {
        early: ['лови быстрее', 'не отвлекайся', 'хорошо...', 'молодец'],
        mid:   ['не бойся...', 'тсс...', '...', 'ещё немного', 'продолжай', 'мы здесь', 'не оглядывайся'],
        late:  ['мы наблюдаем', 'скоро', 'ты ведь не боишься?', 'не останавливайся', 'почти...', 'тебе нравится?', 'мы рядом'],
        post:  ['забудь', 'это был сон', 'уже скоро конец', 'почти всё', 'или нет...'],
    },
    CREEPY_TEXT_CHANCE_BASE: 0.45,      // было 0.25 — чаще показываем
    CREEPY_TEXT_CHANCE_GROWTH: 0.06,    // рост с каждым раундом
    CREEPY_TEXT_MIN_ROUND: 1,           // начинаем с раунда 1 (было 2)

    // --- Preload assets ---
    PRELOAD_AUDIO: [
        'assets/sounds/ambient.mp3',
        'assets/sounds/laugh.mp3',
        'assets/sounds/scream.mp3',
        'assets/sounds/meow.mp3',
        'assets/sounds/drone.mp3',
        'assets/sounds/heartbeat.mp3',
        'assets/sounds/texture.mp3',
        'assets/sounds/riser.mp3',
        'assets/sounds/whisper.mp3',
        'assets/sounds/creak.mp3',
    ],
    PRELOAD_IMAGES: [
        'assets/images/background.jpg',
        'assets/images/bg2.jpg',
        'assets/images/screamer.jpg',
        'assets/images/kitty.png',
    ],

    // --- API ---
    API_URL: 'https://screamer-backend.onrender.com',
    SAVE_COOLDOWN_MS: 3000,
};
