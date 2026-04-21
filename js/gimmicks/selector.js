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

        const pool = filterByMode(window.GimmickRegistry.all, q.mode);
        if (pool.length === 0) return [];

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

    window.GimmickSelector = { pickGimmicks, pickGimmickSlots };
})();
