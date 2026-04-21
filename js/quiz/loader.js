/* ============================================================
   loader.js — 問題JSONの読み込み & ステージ用抽選
   (Phase 1) 全ジャンル単純合算 → ランダムに N 問抜く、のみ。
   将来のジャンル比率・難度比率制御はここを差し替えて対応。
   ============================================================ */

(function () {
    const GENRES = window.CONFIG.GENRES;

    let _cache = null;

    async function loadAll() {
        if (_cache) return _cache;
        const results = await Promise.all(
            GENRES.map(async (g) => {
                const resp = await fetch(`data/questions/${g}.json`);
                if (!resp.ok) throw new Error(`failed to load ${g}.json`);
                return await resp.json();
            })
        );
        _cache = results.flat();
        return _cache;
    }

    function pickForStage(all, stageNo, count) {
        // (Phase 1 暫定) 単純ランダム抽選。難度配分は Phase 2 で適用。
        const shuffled = [...all].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    window.QuizLoader = {
        loadAll,
        pickForStage,
    };
})();
