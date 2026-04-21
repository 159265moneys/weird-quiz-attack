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

    // 内部: 配列をシャッフルして返す (Fisher-Yates)
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function pickForStage(all, stageNo, count) {
        const stageCfg = window.CONFIG.STAGES.find(s => s.no === stageNo);
        const diff = stageCfg?.diff || [1 / 3, 1 / 3, 1 / 3];

        // 各難度で何問取るか (端数丸めで合計が count になるよう調整)
        const c1 = Math.round(count * diff[0]);
        const c2 = Math.round(count * diff[1]);
        const c3 = Math.max(0, count - c1 - c2);
        const want = { 1: c1, 2: c2, 3: c3 };

        // 難度別プール (シャッフル済み)
        const pools = { 1: [], 2: [], 3: [] };
        all.forEach(q => {
            const d = q.difficulty || 1;
            (pools[d] || pools[1]).push(q);
        });
        for (const d of [1, 2, 3]) pools[d] = shuffle(pools[d]);

        // 第1パス: 各難度から want 件取る
        const picked = [];
        const usedIds = new Set();
        for (const d of [1, 2, 3]) {
            const take = pools[d].splice(0, want[d]);
            take.forEach(q => { picked.push(q); usedIds.add(q.id); });
        }

        // 第2パス: 不足があれば他難度から補填
        if (picked.length < count) {
            const rest = shuffle(
                [...pools[1], ...pools[2], ...pools[3]].filter(q => !usedIds.has(q.id))
            );
            picked.push(...rest.slice(0, count - picked.length));
        }

        // 出題順もシャッフル (難度順で並ばないように)
        return shuffle(picked);
    }

    window.QuizLoader = {
        loadAll,
        pickForStage,
    };
})();
