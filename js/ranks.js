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
    // ランク → メタ
    const RANK_META = {
        SS: {
            percentile: 0.01,    // 上位 0.01%
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

    function percentileText(rank) {
        const meta = RANK_META[rank] || RANK_META.F;
        if (meta.positive) {
            // 小数を保ったまま (0.01 / 1 / 3 / 10)
            const p = meta.percentile;
            const s = p < 1 ? p.toFixed(2) : String(p);
            return `上位 ${s}%`;
        }
        // 下位側: 下位 X% (≒ 100 - percentile と見るのは複雑なのでそのまま表記)
        return `下位 ${meta.percentile}%`;
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
        pickLabel,
        percentileText,
        accentColorVar,
    };
})();
