/* ============================================================
   config.js — アプリ全体で使う不変の設定値
   ============================================================ */

window.CONFIG = Object.freeze({
    APP_NAME: '変なクイズ',
    VERSION: '0.1.0-alpha',

    // --- ステージ定義 (クソゲー仕様書v1.0 §3-1 / 設計書v1.0 §9-3) ---
    // name: 仮名 / stress: E=楽しい, M=軽ストレス, X=超ストレス
    // slots: ステージ20問のうち何問ギミックが発動するか (仕様書の「崩壊UI数」)
    // kDist: そのステージの slots 個の問題に対する K値分布 [[k, count], ...]
    //        各 [k,count] の合計が slots と一致すること。
    //        stage開始時にシャッフルして 各 gimmickSlot に K を割当。
    // diff: 出題難易度ratio [L1, L2, L3]
    //
    // 【重要】K方針 (2025 rev2):
    //   Stage 1-7 : 全スロット K=1 固定 (1ギミックずつ)
    //   Stage 8   : K=1×13 + K=2×7  (約1/3で2重)
    //   Stage 9   : K=2×20          (全問2重)
    //   Stage 10  : K=2×13 + K=3×7  (約1/3で3重)
    // 8/9/10 の差別化は K分布 + ギミックプールで付ける。
    STAGES: [
        { no: 1,  name: 'TUTORIAL ZONE',     stress: 'E', slots: 4,  kDist: [[1, 4]],            diff: [0.80, 0.20, 0.00] },
        { no: 2,  name: 'WARMUP',            stress: 'E', slots: 5,  kDist: [[1, 5]],            diff: [0.70, 0.25, 0.05] },
        { no: 3,  name: 'GENTLE GLITCH',     stress: 'E', slots: 7,  kDist: [[1, 7]],            diff: [0.60, 0.30, 0.10] },
        { no: 4,  name: 'SOFT CHAOS',        stress: 'E', slots: 10, kDist: [[1, 10]],           diff: [0.50, 0.35, 0.15] },
        { no: 5,  name: 'NOISE FLOOR',       stress: 'E', slots: 12, kDist: [[1, 12]],           diff: [0.40, 0.40, 0.20] },
        { no: 6,  name: 'FRAGMENTED',        stress: 'M', slots: 15, kDist: [[1, 15]],           diff: [0.30, 0.45, 0.25] },
        { no: 7,  name: 'DISTORTED',         stress: 'M', slots: 19, kDist: [[1, 19]],           diff: [0.25, 0.45, 0.30] },
        { no: 8,  name: 'COLLAPSE',          stress: 'X', slots: 20, kDist: [[1, 13], [2, 7]],   diff: [0.20, 0.40, 0.40] },
        { no: 9,  name: 'HELL',              stress: 'X', slots: 20, kDist: [[2, 20]],           diff: [0.15, 0.35, 0.50] },
        { no: 10, name: 'ABYSS',             stress: 'X', slots: 20, kDist: [[2, 13], [3, 7]],   diff: [0.10, 0.30, 0.60] },
    ],

    // 1ステージあたりの出題数
    QUESTIONS_PER_STAGE: 20,

    // Stage 10 専用プール: 最高難度を抜粋 (重複OK、セレクタで直指定)
    // 難度9-10中心 + 補助的に難度8も含む。実装済みのみ有効。
    STAGE10_POOL: [
        // ------- 理不尽ギミック G1-G8 (Stage 10 専用) -------
        'G1', // ランダム即死 10%即死 (10)
        'G2', // 誤判定 15%で正解が不正解に (10)
        'G4', // 文字化け (9)
        'G5', // 選択肢ワープ (10)
        'G7', // スコア煽り (7)
        'G8', // 易問トラップ (漢字そっくり4択) (8)
        // ------- 最高難度の崩壊UI -------
        'B21', // 即死 (10)
        'W20', // フリック方向シャッフル (10)
        'W04', // 入力ズレ(1文字前) (9)
        'W08', // 文字盤あべこべv2 (9)
        'W18', // キー消失 (9)
        'C03', // 選択肢文字変化 (8)
        'W05', // カーソル暴走 (8)
        'W06', // 文字順逆転 (8)
        'W09', // ゴースト入力 (8)
        'W15', // キーワープ (8)
        'W16', // キー同士くっつく (8)
        'B01', // 反転タップ (7)
        'B13', // フォント極小 (7) ← 実装済
        'B17', // 問題文めちゃくちゃ (7)
        'C02', // ダミー選択肢 (7)
        'W01', // 文字盤見えない (7) ← 実装済
    ],

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

    // --- B18 偽エラー発動率 (ステージ単位) ---
    // 各ステージ開始時に、この確率で「b18Slot」が割り当てられる。
    // 割り当てなしなら、そのステージでは B18 は発生しない。
    // 1.0 = 毎ステージ必ず1回 / 0.5 = 2ステージに1回程度
    B18_STAGE_PROB: 0.5,
});
