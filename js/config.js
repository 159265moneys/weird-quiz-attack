/* ============================================================
   config.js — アプリ全体で使う不変の設定値
   ============================================================ */

window.CONFIG = Object.freeze({
    APP_NAME: '変なクイズ',
    VERSION: '0.1.0-alpha',

    // --- ステージ定義 (クソゲー仕様書v1.0 §3-1 / 設計書v1.0 §9-3) ---
    // name: 仮名 / stress: E=楽しい, M=軽ストレス, X=超ストレス
    // slots: ステージ20問のうち何問ギミックが発動するか (仕様書の「崩壊UI数」)
    // K: 1問あたりの同時ギミック数 [min, max]
    // diff: 出題難易度ratio [L1, L2, L3]
    //
    // 【重要】Stage 8/9/10 の差別化は K値ではなく "ギミックプール" で付ける:
    //   - Stage 8 : 既存 Aランク全開放 (minStage<=8)
    //   - Stage 9 : + パラメータMAX / 動的切替 / ミスペナルティ (Phase 6)
    //   - Stage 10: + 理不尽ギミック・X系 (毎タップ配列替え等, Phase 6)
    STAGES: [
        { no: 1,  name: 'TUTORIAL ZONE',     stress: 'E', slots: 4,  K: [1, 1], diff: [0.80, 0.20, 0.00] },
        { no: 2,  name: 'WARMUP',            stress: 'E', slots: 5,  K: [1, 1], diff: [0.70, 0.25, 0.05] },
        { no: 3,  name: 'GENTLE GLITCH',     stress: 'E', slots: 7,  K: [1, 2], diff: [0.60, 0.30, 0.10] },
        { no: 4,  name: 'SOFT CHAOS',        stress: 'E', slots: 10, K: [2, 2], diff: [0.50, 0.35, 0.15] },
        { no: 5,  name: 'NOISE FLOOR',       stress: 'E', slots: 12, K: [2, 3], diff: [0.40, 0.40, 0.20] },
        { no: 6,  name: 'FRAGMENTED',        stress: 'M', slots: 15, K: [3, 3], diff: [0.30, 0.45, 0.25] },
        { no: 7,  name: 'DISTORTED',         stress: 'M', slots: 19, K: [3, 4], diff: [0.25, 0.45, 0.30] },
        { no: 8,  name: 'COLLAPSE',          stress: 'X', slots: 20, K: [4, 5], diff: [0.20, 0.40, 0.40] },
        { no: 9,  name: 'HELL',              stress: 'X', slots: 20, K: [4, 5], diff: [0.15, 0.35, 0.50] }, // パラメータMAX・動的切替はPhase6
        { no: 10, name: 'ABYSS',             stress: 'X', slots: 20, K: [4, 5], diff: [0.10, 0.30, 0.60] }, // 理不尽ギミック(毎タップ配列替え等)はPhase6
    ],

    // 1ステージあたりの出題数
    QUESTIONS_PER_STAGE: 20,

    // --- ジャンル ---
    GENRES: ['math', 'english', 'japanese', 'science', 'social', 'others'],
    GENRE_LABELS: {
        math: '算数',
        english: '英語',
        japanese: '国語',
        science: '理科',
        social: '社会',
        others: 'その他',
    },

    // --- セーブデータ ---
    SAVE_KEY: 'kuso_quiz_save_v1',
    SAVE_VERSION: 1,

    // --- タイミング ---
    TITLE_FADE_MS: 400,
    SCREEN_FADE_MS: 250,
});
