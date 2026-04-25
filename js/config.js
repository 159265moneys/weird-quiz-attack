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
    // diff: 出題難易度比率 [lower, mid, upper] — level-1 / level / level+1 への相対比率。
    //       端ステージ (level=1 or 10) では存在しない難度の比率は mid に吸収される。
    //
    // 【重要】K方針 (2025 rev2):
    //   Stage 1-7 : 全スロット K=1 固定 (1ギミックずつ)
    //   Stage 8   : K=1×13 + K=2×7  (約1/3で2重)
    //   Stage 9   : K=2×20          (全問2重)
    //   Stage 10  : K=2×13 + K=3×7  (約1/3で3重)
    // 8/9/10 の差別化は K分布 + ギミックプールで付ける。
    // level: difficulty の中心値 (1〜10)。Stage N = level N。
    //        各ステージは difficulty ∈ [level-1, level+1] の問題のみ引く (1/10 でクランプ)。
    STAGES: [
        { no: 1,  name: 'TUTORIAL ZONE',     stress: 'E', slots: 7,  kDist: [[1, 7]],            diff: [0.00, 0.75, 0.25], level: 1  },
        { no: 2,  name: 'WARMUP',            stress: 'E', slots: 9,  kDist: [[1, 9]],            diff: [0.25, 0.55, 0.20], level: 2  },
        { no: 3,  name: 'GENTLE GLITCH',     stress: 'E', slots: 12, kDist: [[1, 12]],           diff: [0.25, 0.50, 0.25], level: 3  },
        { no: 4,  name: 'SOFT CHAOS',        stress: 'E', slots: 15, kDist: [[1, 15]],           diff: [0.25, 0.50, 0.25], level: 4  },
        { no: 5,  name: 'NOISE FLOOR',       stress: 'E', slots: 17, kDist: [[1, 17]],           diff: [0.25, 0.50, 0.25], level: 5  },
        { no: 6,  name: 'FRAGMENTED',        stress: 'M', slots: 18, kDist: [[1, 18]],           diff: [0.25, 0.50, 0.25], level: 6  },
        { no: 7,  name: 'DISTORTED',         stress: 'M', slots: 20, kDist: [[1, 20]],           diff: [0.20, 0.50, 0.30], level: 7  },
        { no: 8,  name: 'COLLAPSE',          stress: 'X', slots: 20, kDist: [[2, 20]],           diff: [0.20, 0.45, 0.35], level: 8  },
        { no: 9,  name: 'HELL',              stress: 'X', slots: 20, kDist: [[2, 20]],           diff: [0.20, 0.45, 0.35], level: 9  },
        { no: 10, name: 'ABYSS',             stress: 'X', slots: 20, kDist: [[2, 13], [3, 7]],   diff: [0.30, 0.70, 0.00], level: 10 },
    ],

    // 1ステージあたりの出題数
    QUESTIONS_PER_STAGE: 20,

    // Stage 10 専用プール: 最高難度を抜粋 (重複OK、セレクタで直指定)
    // 難度9-10中心 + 補助的に難度8も含む。実装済みのみ有効。
    STAGE10_POOL: [
        // ------- 理不尽ギミック G1-G7 (Stage 10 専用) -------
        // (2026-04 整理) G2 誤判定 / G8 易問トラップ は実機テストで廃止
        'G1', // ランダム即死 10%即死 (10)
        'G4', // 文字化け (9)
        'G5', // 選択肢ワープ (10)
        'G7', // スコア煽り (7)
        // ------- 最高難度の崩壊UI -------
        'B21', // 即死 (10)
        'W20', // フリック方向シャッフル (10)
        'W04', // 入力ズレ(1文字前) (9)
        'W08', // 文字盤あべこべv2 (9)
        'W18', // キー消失 (9)
        'C03', // 選択肢文字変化 (8)
        'W06', // 文字順逆転 (8)
        'W09', // ゴースト入力 (8)
        'B01', // 反転タップ (7)
        'B13', // フォント極小 (7) ← 実装済
        'B17', // 問題文めちゃくちゃ (7)
        'C02', // ダミー選択肢 (7)
        'W01', // 文字盤見えない (7) ← 実装済
        // ------- 2026-04 追加: 問題文崩壊バリエーション -------
        'B23', // 黒塗り (7)
        'B24', // スクロール (7)
        'B29', // バウンド (9)
        'B30', // 渦巻き (8)
        'B28', // サイズ崩壊 (6) ※Stage10にも混ぜる
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

    // --- クリア判定 ---
    // ステージを「クリア」と認める最低ランク。これ以上なら次ステージ解放 +
    //   サブキャラ解放抽選の対象になる。これ未満は score/play は記録するが
    //   "未クリア" 扱い (リザルトは STAGE FAILED)。
    //   ランク順序は SS > S > A > B > C > D > E > F。
    CLEAR_RANK_THRESHOLD: 'B',
    RANK_ORDER: ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'],

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
