/* ============================================================
   ranks.js — ランク定義 / 上位%換算 / 現実換算ラベル
   ------------------------------------------------------------
   仕様書 (クソゲー仕様書v1.0.md 8-2 / 8-4) 準拠。
     SS: 0.01% (宇宙飛行士選抜通過 等)
     S : 1%   (医師 / 年収2000万 / 東大生)
     A : 3%   (早慶合格率 / TOEIC 900)
     B : 10%  (公務員合格 / 大卒上位)
     C : 30%  (凡人 / 普通人)
     D : 60%  (人類の中央値〜ちょい下)
     E : 90%  (小学校やり直し推奨)
     F : 95%以下 (現代の縄文人 / 無免許運転レベル)

   上位ラベル: 自慢用、プラス語彙
   下位ラベル: ネタスクショ用、辛辣だが悪意は弱め
   どちらもランダム抽選して変動感を出す (1回の結果表示で固定)。
   ============================================================ */

(function () {
    // ------------------------------------------------------------
    // ステージ別 上位/下位% テーブル (stage 1-9 は通し集計、10 は独立)
    // 考え方:
    //   - 正ランク(SS/S/A/B) は "上位 X%" → X 小ほどレア (難ステージほど小)
    //   - 負ランク(C/D/E/F) は "下位 X%" → X 小ほど恥ずかしい (易ステージほど小)
    //   - Stage 1 の SS は約40% (だれでも取れる) / F は 0.02% (ありえない)
    //   - Stage 9 の SS は 0.01% (人類到達限界) / F は 80% (みんな負ける)
    //   - Stage 10 は独立集計・更にレア
    // ------------------------------------------------------------
    const STAGE_RANK_PCT = {
        1:  { SS: 40,    S: 55,   A: 70,   B: 85,   C: 2,   D: 0.5,  E: 0.1,  F: 0.02 },
        2:  { SS: 28,    S: 42,   A: 58,   B: 75,   C: 4,   D: 1,    E: 0.3,  F: 0.05 },
        3:  { SS: 18,    S: 30,   A: 45,   B: 62,   C: 8,   D: 2,    E: 0.5,  F: 0.1  },
        4:  { SS: 10,    S: 20,   A: 35,   B: 50,   C: 14,  D: 5,    E: 1.5,  F: 0.3  },
        5:  { SS: 5,     S: 12,   A: 25,   B: 40,   C: 22,  D: 10,   E: 3,    F: 0.8  },
        6:  { SS: 2,     S: 6,    A: 15,   B: 30,   C: 28,  D: 18,   E: 7,    F: 2    },
        7:  { SS: 0.5,   S: 3,    A: 10,   B: 22,   C: 32,  D: 28,   E: 15,   F: 5    },
        8:  { SS: 0.1,   S: 1.5,  A: 5,    B: 15,   C: 35,  D: 38,   E: 25,   F: 10   },
        9:  { SS: 0.01,  S: 1,    A: 3,    B: 10,   C: 30,  D: 50,   E: 70,   F: 80   },
        10: { SS: 0.001, S: 0.05, A: 0.3,  B: 2,    C: 25,  D: 50,   E: 75,   F: 85   },
    };

    // ランク → メタ
    const RANK_META = {
        SS: {
            percentile: 0.01,    // fallback (stage 不明時)
            positive: true,
            labels: [
                '宇宙飛行士選抜通過レベル',
                'ノーベル賞候補相当',
                'プロ棋士タイトル保持者級',
                '国家機密 級の頭脳',
                '人類の到達限界',
            ],
            color: 'warn',       // 金
        },
        S: {
            percentile: 1,
            positive: true,
            labels: [
                '東大理Ⅲ合格率',
                'オリンピック代表選考通過レベル',
                '医師国家試験 上位合格',
                '年収2000万円 相当',
                'MENSA 入会レベル',
            ],
            color: 'cyan',
        },
        A: {
            percentile: 3,
            positive: true,
            labels: [
                '早慶合格率 相当',
                'TOEIC 900 オーバー',
                '公認会計士合格 級',
                '大手商社 内定レベル',
            ],
            color: 'cyan',
        },
        B: {
            percentile: 10,
            positive: true,
            labels: [
                '公務員合格レベル',
                '大卒上位 10%',
                'MARCH 合格率',
                '運転免許 一発合格 級',
            ],
            color: 'line',
        },
        C: {
            percentile: 30,
            positive: false,
            labels: [
                '凡人',
                'ごく普通の人類',
                '可もなく不可もなく',
                '日本人の中央値付近',
            ],
            color: 'dim',
        },
        D: {
            percentile: 60,
            positive: false,
            labels: [
                '人類の中央値(下側)',
                '惜しい',
                'あと一歩の凡人',
                '平熱',
            ],
            color: 'dim',
        },
        E: {
            percentile: 90,
            positive: false,
            labels: [
                '小学生に負けるレベル',
                '小学校やり直し推奨',
                'ぴえん',
                '成長期',
            ],
            color: 'red',
        },
        F: {
            percentile: 99,
            positive: false,
            labels: [
                '称号「現代の縄文人」',
                '令和の無免許運転 級',
                '伝説のアホ',
                '義務教育の敗北',
                '文明以前',
            ],
            color: 'red',
        },
    };

    function pickLabel(rank, seed) {
        const meta = RANK_META[rank] || RANK_META.F;
        const list = meta.labels;
        // 表示中のブレを抑えるため、session ID などの seed で安定抽選 (無ければ純ランダム)
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

    // ステージ補正付き %値を返す。stageNo 未指定時はメタのデフォルトにフォールバック。
    function resolvePercentile(rank, stageNo) {
        const table = STAGE_RANK_PCT[stageNo];
        if (table && table[rank] != null) return table[rank];
        const meta = RANK_META[rank] || RANK_META.F;
        return meta.percentile;
    }

    function formatPct(p) {
        if (p >= 1) return String(Math.round(p * 10) / 10).replace(/\.0$/, '');
        // 1未満: 有効桁を確保 (0.01 / 0.001 / 0.05 等)
        if (p >= 0.1)  return p.toFixed(1);
        if (p >= 0.01) return p.toFixed(2);
        return p.toFixed(3);
    }

    function percentileText(rank, stageNo) {
        const meta = RANK_META[rank] || RANK_META.F;
        const p = resolvePercentile(rank, stageNo);
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
        STAGE_RANK_PCT,
        pickLabel,
        percentileText,
        resolvePercentile,
        accentColorVar,
    };
})();
