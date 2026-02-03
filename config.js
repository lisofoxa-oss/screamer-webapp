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

    // Timing — base delays
    PAUSE_MIN: 1200,
    PAUSE_MAX: 3200,
    SCREAMER_HEART_DELAY: 150,
    FAKE_HEART_DELAY: 120,
    SCREAMER_HIDE_MS: 900,
    FAKE_HIDE_MS: 700,

    // --- Random delay spikes (создают непредсказуемость) ---
    DELAY_SPIKE_CHANCE: 0.25,      // 25% шанс дополнительной паузы
    DELAY_SPIKE_MIN: 300,          // +0.3 сек
    DELAY_SPIKE_MAX: 1200,         // +1.2 сек

    // --- Vibration escalation (нарастание к скримеру) ---
    VIBRATE_ENABLED: true,
    VIBRATE_START_ROUND: 3,        // с какого раунда начинать
    VIBRATE_PATTERN_LIGHT: [15],   // лёгкая
    VIBRATE_PATTERN_MEDIUM: [25, 30, 25],  // средняя
    VIBRATE_PATTERN_HEAVY: [40, 50, 40, 50, 40],  // сильная

    // --- Glitch clock ---
    CLOCK_ENABLED: true,
    CLOCK_SHOW_ROUND: 2,           // показать с раунда 2
    CLOCK_GLITCH_CHANCE: 0.3,      // шанс глитча каждый раунд
    CLOCK_CREEPY_TIMES: ['03:33', '00:00', '13:13', '06:66', '23:59', '04:44'],

    // --- Breathing sound ---
    BREATH_ENABLED: true,
    BREATH_START_ROUND: 4,         // начать дыхание с раунда 4
    BREATH_VOLUME_START: 0.05,     // начальная громкость
    BREATH_VOLUME_MAX: 0.25,       // максимальная перед скримером
    BREATH_RATE_START: 1.0,        // начальная скорость
    BREATH_RATE_MAX: 1.6,          // ускорение к скримеру

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
        // Loops
        'assets/sounds/drone.mp3',
        'assets/sounds/drone_low.mp3',
        'assets/sounds/heartbeat.mp3',
        'assets/sounds/texture.mp3',
        'assets/sounds/wind.mp3',
        'assets/sounds/static.mp3',
        'assets/sounds/whisper_demon.mp3',
        'assets/sounds/breath.mp3',
        // One-shots
        'assets/sounds/riser.mp3',
        'assets/sounds/whisper.mp3',
        'assets/sounds/creak.mp3',
        'assets/sounds/footstep.mp3',
        'assets/sounds/breath_close.mp3',
        'assets/sounds/knock.mp3',
        'assets/sounds/metal.mp3',
        'assets/sounds/glass.mp3',
        'assets/sounds/voice_reverse.mp3',
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
