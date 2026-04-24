/* ============================================================
   ranks.js — ランク定義 / 上位%換算 / 現実換算ラベル
   ------------------------------------------------------------
   2026-04 改訂 v2: 「絶対ランク (SS〜F)」と「コメント用の実効パーセンタイル」
   を分離。SS/S/A/B の褒め度は STAGE が上がるほど強く、C/D/E/F の蔑み度も
   STAGE が上がるほど強くなる 2 軸テーブルを導入した。

   設計:
     1. SS〜F は絶対条件 (正答率 + 時間) で scoring.js が決定。バッジ表示・
        色・アクセントは RANK_META の静的値を使う (rank の見た目は不変)。
     2. セリフ / 上位%表示は (rank, stageNo) → STAGE_PCT_TABLE → effective %
        → 実効 tier を経由して決定する。同じ SS でも S1 と S10 では
        「悪くないじゃない」から「人類の域じゃない」まで幅が出る。
     3. tier 逆引き境界は 8 段階を維持 (NORMAL_UP は廃止扱い)。DECENT の
        範囲を広げて中間の 上位10〜50% を全部吸収する。

   tier 境界 (上位/下位 パーセンテージ):
     上位  ≤0.5%             → GODLIKE
     上位  0.5% <  ≤3%       → ELITE
     上位  3%   <  ≤10%      → STRONG
     上位  10%  <  ≤50%      → DECENT
     下位  50%  ≥  >25%      → NORMAL_DOWN  (中央値付近)
     下位  25%  ≥  >10%      → WEAK
     下位  10%  ≥  >1%       → TERRIBLE
     下位  ≤1%               → DOOMED

   検証:
     S1 SS  = 上位 25%   → DECENT       「悪くないじゃない」等
     S10 SS = 上位 0.3%  → GODLIKE      「人類の到達限界」等
     S1 F   = 下位 2%    → TERRIBLE
     S10 F  = 下位 0.01% → DOOMED

   ※ Stage 10 死亡は F でも結果画面側で専用セリフ (慰め枠)
   ============================================================ */

(function () {
    // ランク → 絶対メタ (バッジ色 / tier 初期値 / positive 方向)
    // positive は「上位 X%」か「下位 X%」のどちらで表示するかを決める軸で、
    // 実効パーセンタイルが変わっても rank ごとに固定 (SS〜B は上位, C〜F は下位)。
    const RANK_META = {
        SS: { positive: true,  color: 'warn', tier: 'GODLIKE'     },
        S:  { positive: true,  color: 'cyan', tier: 'ELITE'       },
        A:  { positive: true,  color: 'cyan', tier: 'STRONG'      },
        B:  { positive: true,  color: 'line', tier: 'DECENT'      },
        C:  { positive: false, color: 'dim',  tier: 'NORMAL_DOWN' },
        D:  { positive: false, color: 'dim',  tier: 'WEAK'        },
        E:  { positive: false, color: 'red',  tier: 'TERRIBLE'    },
        F:  { positive: false, color: 'red',  tier: 'DOOMED'      },
    };

    // (rank, stageNo) → 実効パーセンタイル
    // 列 = stage 1..10 (1-index)。値は rank の positive 方向で解釈する。
    //   SS〜B: 値 = 上位 X%
    //   C〜F : 値 = 下位 X%
    // 同一ステージ内で SS < S < A < B (上位% で単調) を保つ。
    // 同一ランク内で stage が上がるほど希少度が上がる (値は単調減少)。
    const STAGE_PCT_TABLE = {
        //      S1    S2    S3    S4    S5    S6    S7    S8    S9   S10
        SS: [  25,   18,   12,    8,    5,    3,    2,    1,  0.5,  0.3  ],
        S:  [  30,   24,   18,   13,    9,  5.5,  3.5,    2,  1.2,    1  ],
        A:  [  40,   34,   28,   22,   17,   12,    8,    5,    3,  1.8  ],
        B:  [  48,   44,   39,   33,   27,   22,   17,   12,    8,    4  ],
        C:  [  49,   46,   42,   38,   34,   30,   26,   22,   18,   14  ],
        D:  [  15,   13,   11,    9,    7,    5,    4,    3,    2,    1  ],
        E:  [   5,    4,    3,    2,  1.5,    1,  0.7,  0.5,  0.3,  0.2  ],
        F:  [   2,  1.5,    1,  0.7,  0.5,  0.3,  0.2,  0.1, 0.05, 0.01  ],
    };

    // 実効パーセンタイル → tier (positive/negative で分岐)。
    // 境界は閉区間上側で判定 (≤ boundary → 当該 tier)。
    function tierFromEffective(pct, positive) {
        if (positive) {
            if (pct <= 0.5) return 'GODLIKE';
            if (pct <= 3)   return 'ELITE';
            if (pct <= 10)  return 'STRONG';
            return 'DECENT';                 // 〜50%
        } else {
            // negative: pct が小さいほど希少 (= より悪い)
            if (pct <= 1)   return 'DOOMED';
            if (pct <= 10)  return 'TERRIBLE';
            if (pct <= 25)  return 'WEAK';
            return 'NORMAL_DOWN';            // 〜50%
        }
    }

    // tier → 現実換算ラベル。(NORMAL_UP は現行マップで未使用だが互換のため残置)
    const TIER_LABELS = {
        GODLIKE: [
            '宇宙飛行士選抜通過レベル',
            'ノーベル賞候補相当',
            'プロ棋士タイトル保持者級',
            '国家機密 級の頭脳',
            '人類の到達限界',
        ],
        ELITE: [
            '東大理Ⅲ合格率',
            'オリンピック代表選考通過レベル',
            '医師国家試験 上位合格',
            '年収2000万円 相当',
            'MENSA 入会レベル',
        ],
        STRONG: [
            '早慶合格率 相当',
            'TOEIC 900 オーバー',
            '公認会計士合格 級',
            '大手商社 内定レベル',
        ],
        DECENT: [
            '公務員合格レベル',
            '大卒上位 10%',
            'MARCH 合格率',
            '運転免許 一発合格 級',
        ],
        NORMAL_UP: [
            '中堅大卒 平均',
            '平均より、ちょっと上',
            '地頭はふつう',
            'まあまあ、いる人',
            '日本人のボリュームゾーン上側',
        ],
        NORMAL_DOWN: [
            '日本人の中央値付近',
            '可もなく不可もなく',
            'ごく普通の人類',
            'ボリュームゾーン下側',
            'あと一歩の凡人',
        ],
        WEAK: [
            'ぴえん',
            '成長期',
            '要復習',
            'もうひと頑張り',
            '集中力 切れがち',
        ],
        TERRIBLE: [
            '小学生に負けるレベル',
            '小学校やり直し推奨',
            '算数からやり直し',
            '下位ランクの中でも下位',
        ],
        DOOMED: [
            '称号「現代の縄文人」',
            '令和の無免許運転 級',
            '伝説のアホ',
            '義務教育の敗北',
            '文明以前',
        ],
    };

    // stageNo を 1..10 にクランプ。未指定/不正値は 1 扱い (最も寛容な評価)。
    function clampStage(stageNo) {
        const n = Number(stageNo);
        if (!Number.isFinite(n)) return 1;
        return Math.min(10, Math.max(1, Math.round(n)));
    }

    // (rank, stageNo) → { pct, positive }
    // 有効値が取れないときは RANK_META.F ベースの安全値にフォールバック。
    function effectivePercentile(rank, stageNo) {
        const meta = RANK_META[rank] || RANK_META.F;
        const row = STAGE_PCT_TABLE[rank];
        const idx = clampStage(stageNo) - 1;
        const pct = (row && Number.isFinite(row[idx]))
            ? row[idx]
            : (STAGE_PCT_TABLE.F[idx] ?? 50);
        return { pct, positive: meta.positive };
    }

    // (rank, stageNo) → 実効 tier。stageNo 未指定時は RANK_META.tier を返す
    // (share プレビュー等の旧パス互換)。
    function tierFor(rank, stageNo) {
        if (stageNo == null) {
            return (RANK_META[rank] || RANK_META.F).tier;
        }
        const { pct, positive } = effectivePercentile(rank, stageNo);
        return tierFromEffective(pct, positive);
    }

    // 互換: 絶対 tier (rank のみ) を返す旧 API。新規コードは tierFor を使うこと。
    function tierOf(rank) {
        return (RANK_META[rank] || RANK_META.F).tier;
    }

    // 互換: rank 単独の percentile を返す。stageNo 無しだと S5 相当を暫定値として返す。
    function resolvePercentile(rank, stageNo) {
        return effectivePercentile(rank, stageNo ?? 5).pct;
    }

    function pickLabel(rank, stageNo, seed) {
        // 後方互換: 2 引数で呼ばれたら (rank, seed) として扱う。
        let _stage = stageNo;
        let _seed = seed;
        if (_seed === undefined && (typeof _stage === 'string' || _stage === null)) {
            _seed = _stage;
            _stage = undefined;
        }
        const tier = tierFor(rank, _stage);
        const list = TIER_LABELS[tier] || TIER_LABELS.NORMAL_DOWN;
        const idx = _seed != null
            ? Math.abs(hash(_seed)) % list.length
            : Math.floor(Math.random() * list.length);
        return list[idx];
    }

    function hash(str) {
        let h = 0;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h = (h * 31 + s.charCodeAt(i)) | 0;
        }
        return h;
    }

    function formatPct(p) {
        if (p >= 1) return String(Math.round(p * 10) / 10).replace(/\.0$/, '');
        if (p >= 0.1)  return p.toFixed(1);
        if (p >= 0.01) return p.toFixed(2);
        return p.toFixed(3);
    }

    function percentileText(rank, stageNo) {
        const { pct, positive } = effectivePercentile(rank, stageNo);
        return positive ? `上位 ${formatPct(pct)}%` : `下位 ${formatPct(pct)}%`;
    }

    function accentColorVar(rank) {
        const meta = RANK_META[rank] || RANK_META.F;
        switch (meta.color) {
            case 'warn': return 'var(--accent-warn)';
            case 'cyan': return 'var(--accent-cyan)';
            case 'red':  return 'var(--accent-red)';
            case 'dim':  return 'var(--text-dim)';
            default:     return 'var(--text-on-dark)';
        }
    }

    window.Ranks = {
        META: RANK_META,
        TIER_LABELS,
        STAGE_PCT_TABLE,
        tierOf,
        tierFor,
        effectivePercentile,
        pickLabel,
        percentileText,
        resolvePercentile,
        accentColorVar,
    };
})();
