/* ============================================================
   ranks.js — ランク定義 / 上位%換算 / 現実換算ラベル
   ------------------------------------------------------------
   2026-04 改訂: STAGE_RANK_PCT を撤廃し、rank → percentile / tier を
   固定マッピングに切り替えた。理由は scoring.js 側でランク判定が
   「時間 + 正答率」の絶対条件になったため、ステージごとに希少性を
   散らす意味が薄れた。8 ランク ↔ 8 tier が 1:1 対応する設計。

   rank  percentile         tier          代表ラベル
   ----  -----------------  ------------  --------------------
   SS    上位 0.3%          GODLIKE       宇宙飛行士・人類到達限界
   S     上位 2%            ELITE         東大理Ⅲ・医師
   A     上位 8%            STRONG        早慶・TOEIC 900
   B     上位 25%           DECENT        MARCH・公務員
   C     下位 50% (中央値)  NORMAL_DOWN   凡人・中央値
   D     下位 20%           WEAK          要復習・ぴえん
   E     下位 5%            TERRIBLE      小学校やり直し
   F     下位 0.5%          DOOMED        伝説のアホ

   ※ Stage 10 死亡は F でも結果画面側で専用セリフ (慰め枠)
   ============================================================ */

(function () {
    // ランク → メタ (固定 percentile / tier)
    const RANK_META = {
        SS: { percentile: 0.3, positive: true,  color: 'warn', tier: 'GODLIKE'     },
        S:  { percentile: 2,   positive: true,  color: 'cyan', tier: 'ELITE'       },
        A:  { percentile: 8,   positive: true,  color: 'cyan', tier: 'STRONG'      },
        B:  { percentile: 25,  positive: true,  color: 'line', tier: 'DECENT'      },
        C:  { percentile: 50,  positive: false, color: 'dim',  tier: 'NORMAL_DOWN' },
        D:  { percentile: 20,  positive: false, color: 'dim',  tier: 'WEAK'        },
        E:  { percentile: 5,   positive: false, color: 'red',  tier: 'TERRIBLE'    },
        F:  { percentile: 0.5, positive: false, color: 'red',  tier: 'DOOMED'      },
    };

    // tier → 現実換算ラベル
    // NORMAL_UP は現ランクマップ上は未使用 (将来のステージ加点機能用に残置)。
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

    function tierOf(rank) {
        return (RANK_META[rank] || RANK_META.F).tier;
    }

    function resolvePercentile(rank) {
        return (RANK_META[rank] || RANK_META.F).percentile;
    }

    function pickLabel(rank, seed) {
        const tier = tierOf(rank);
        const list = TIER_LABELS[tier] || TIER_LABELS.NORMAL_DOWN;
        const idx = seed != null
            ? Math.abs(hash(seed)) % list.length
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

    function percentileText(rank) {
        const meta = RANK_META[rank] || RANK_META.F;
        const p = meta.percentile;
        if (meta.positive) return `上位 ${formatPct(p)}%`;
        return `下位 ${formatPct(p)}%`;
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
        tierOf,
        pickLabel,
        percentileText,
        resolvePercentile,
        accentColorVar,
    };
})();
