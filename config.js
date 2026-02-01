// ============================================================
// config.js v6 — + bg3, intro flash images
// ============================================================

const CONFIG = {
    // --- Gameplay ---
    TOTAL_HEARTS: 12,
    HEART_R: 40,
    ZONE_R: 55,
    MOVE_TH: 15,
    HEART_TIMEOUT: 1500,

    // Heart placement
    MIN_HEART_DIST: 200,
    SCREAMER_HEART_DIST: 280,
    MIN_HEART_Y: 130,
    MAX_HEART_Y_RATIO: 0.34,
    HEART_EDGE_PAD: 55,

    // Timing
    PAUSE_MIN: 1200,
    PAUSE_MAX: 3200,
    SCREAMER_HEART_DELAY: 150,
    FAKE_HEART_DELAY: 120,
    SCREAMER_HIDE_MS: 900,
    FAKE_HIDE_MS: 700,

    SCREAMER_EMOJIS: ['👻', '💀', '😱', '🎃', '👹'],

    // --- Training ---
    TRAINING_ROUNDS: 3,
    TRAINING_TIMEOUT: 3500,

    // --- Intro ---
    INTRO_BLACK_MS: 1500,
    INTRO_TEXT_FADE_MS: 800,
    INTRO_TEXT_HOLD_MS: 1500,
    INTRO_SCATTER_MS: 900,
    INTRO_FLASH_MS: 1800,
    INTRO_PAUSE_MS: 600,
    INTRO_FLASH_IMAGES: [
        'assets/images/background.jpg',
        'assets/images/bg2.jpg',
        'assets/images/bg3.jpg',
        'assets/images/bg2.jpg',
        'assets/images/bg3.jpg',
        'assets/images/background.jpg',
        'assets/images/bg2.jpg',
        'assets/images/bg3.jpg',
    ],

    // --- Creepy text ---
    CREEPY_MESSAGES: {
        early: ['лови быстрее', 'не отвлекайся', 'хорошо...', 'молодец'],
        mid:   ['не бойся...', 'тсс...', '...', 'ещё немного', 'продолжай', 'мы здесь', 'не оглядывайся'],
        late:  ['мы наблюдаем', 'скоро', 'ты ведь не боишься?', 'не останавливайся', 'почти...', 'тебе нравится?', 'мы рядом'],
        post:  ['забудь', 'это был сон', 'уже скоро конец', 'почти всё', 'или нет...'],
    },
    CREEPY_TEXT_CHANCE_BASE: 0.45,
    CREEPY_TEXT_CHANCE_GROWTH: 0.06,
    CREEPY_TEXT_MIN_ROUND: 1,

    // --- Preload ---
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
        'assets/images/bg3.jpg',
        'assets/images/screamer.png',
        'assets/images/kitty.png',
    ],

    // --- API ---
    API_URL: 'https://screamer-backend.onrender.com',
    SAVE_COOLDOWN_MS: 3000,
};
