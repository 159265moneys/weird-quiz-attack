/* ============================================================
   gimmicks/selector.js — ステージ設定と問題modeから崩壊ギミックを抽選
   ------------------------------------------------------------
   ルール:
     - 件数は stageConfig.K = [min, max] の範囲からランダム
     - 問題の mode (choice|input) に対応するものだけを候補とする
     - conflicts に挙がっているIDは同時採用しない
   ============================================================ */

(function () {
    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function pickCount(stageConfig) {
        const [kmin, kmax] = stageConfig?.K || [0, 0];
        return randInt(kmin, kmax);
    }

    function filterByMode(gimmicks, qMode) {
        return gimmicks.filter(g => g.supports === 'both' || g.supports === qMode);
    }

    // ステージ別プール (設計書§9-3 準拠)
    //   Stage 1   : introducedAt === 1
    //   Stage 2-7 : introducedAt ∈ {n-1, n}  (当該 + 1個下まで)
    //   Stage 8   : 全部 (introducedAt ≤ 8)
    //   Stage 9   : introducedAt ∈ {8, 9}    (8追加分 + 9追加分のみ)
    //   Stage 10  : CONFIG.STAGE10_POOL 直指定 (最高難度のみ)
    function poolForStage(gimmicks, stageNo) {
        if (stageNo === 10) {
            const ids = new Set(window.CONFIG.STAGE10_POOL || []);
            return gimmicks.filter(g => ids.has(g.id));
        }
        if (stageNo === 9) {
            return gimmicks.filter(g => {
                const at = g.introducedAt ?? 1;
                return at === 8 || at === 9;
            });
        }
        if (stageNo === 8) {
            return gimmicks.filter(g => (g.introducedAt ?? 1) <= 8);
        }
        if (stageNo === 1) {
            return gimmicks.filter(g => (g.introducedAt ?? 1) === 1);
        }
        // Stage 2-7: 当該 + 1個下
        const low = stageNo - 1;
        const high = stageNo;
        return gimmicks.filter(g => {
            const at = g.introducedAt ?? 1;
            return at >= low && at <= high;
        });
    }

    // ステージ開始時に呼び出す: 全問中 slots 個をランダム選抜して
    // ギミック発動問題の index 配列 (0-based) を返す
    function pickGimmickSlots(stageNo, totalQuestions) {
        const stageConfig = window.CONFIG.STAGES.find(s => s.no === stageNo);
        const slots = Math.min(stageConfig?.slots ?? 0, totalQuestions);
        if (slots <= 0) return [];

        const indices = [];
        for (let i = 0; i < totalQuestions; i++) indices.push(i);
        // Fisher-Yates shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return indices.slice(0, slots).sort((a, b) => a - b);
    }

    function pickGimmicks(stageNo, q) {
        const stageConfig = window.CONFIG.STAGES.find(s => s.no === stageNo);
        if (!stageConfig) return [];

        const count = pickCount(stageConfig);
        if (count <= 0) return [];

        // ①ステージ別プール ②回答モード の二段フィルタ
        const stageOK = poolForStage(window.GimmickRegistry.all, stageNo);
        const pool = filterByMode(stageOK, q.mode);
        if (pool.length === 0) {
            console.warn(`[Gimmick] no compatible gimmick for stage=${stageNo} mode=${q.mode}`);
            return [];
        }

        // ランダム順に並べ替えて、conflict を避けつつ count 個取る
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);

        const picked = [];
        const usedIds = new Set();
        const blockedIds = new Set();

        for (const g of shuffled) {
            if (picked.length >= count) break;
            if (usedIds.has(g.id)) continue;
            if (blockedIds.has(g.id)) continue;
            picked.push(g);
            usedIds.add(g.id);
            (g.conflicts || []).forEach(c => blockedIds.add(c));
        }
        return picked;
    }

    window.GimmickSelector = { pickGimmicks, pickGimmickSlots, poolForStage };
})();
