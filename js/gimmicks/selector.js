/* ============================================================
   gimmicks/selector.js — ステージ設定と問題modeから崩壊ギミックを抽選
   ------------------------------------------------------------
   構成:
     - poolForStage(stageNo)     : ステージ別プール (introducedAt 窓 ルール)
     - buildConflictMap()        : conflict を双方向 Map 化
     - pickGimmicks(stageNo,q,K) : K個を conflict 回避しつつランダム抽選
                                   (不足時は K-1 → K-2 → … にフォールバック)
     - pickGimmickSlots(stageNo) : 20問中どのindexでギミック発動するか
     - generateKAssignment       : 各 slot 問題に K値を割当 (kDist 展開 + shuffle)
   ============================================================ */

(function () {
    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function filterByMode(gimmicks, qMode) {
        return gimmicks.filter(g => g.supports === 'both' || g.supports === qMode);
    }

    // excludeFromPool: 通常抽選から除外 (B18 のような「特別枠で別経路で必ず出す」ギミック用)
    function filterPoolable(gimmicks) {
        return gimmicks.filter(g => !g.excludeFromPool);
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

    // ステージ開始時に呼び出す: 各 gimmickSlot index に K値を割り当てる
    // kDist = [[k1, c1], [k2, c2], ...]  (合計が slots と一致)
    // 返り値: { [slotIdx]: kValue }
    function generateKAssignment(stageNo, gimmickSlots) {
        const stageConfig = window.CONFIG.STAGES.find(s => s.no === stageNo);
        const kDist = stageConfig?.kDist || [[1, gimmickSlots.length]];

        // kDist を展開: [[1,13],[2,7]] → [1,1,...(13個),...2,2,...(7個)]
        const kList = [];
        kDist.forEach(([k, count]) => {
            for (let i = 0; i < count; i++) kList.push(k);
        });

        // slots数と不一致なら警告 (config書き間違い防止)
        if (kList.length !== gimmickSlots.length) {
            console.warn('[Gimmick] kDist sum mismatch: stage', stageNo,
                'kDist total=', kList.length, 'slots=', gimmickSlots.length,
                '→ truncate/pad to', gimmickSlots.length);
            while (kList.length < gimmickSlots.length) kList.push(1);
            kList.length = gimmickSlots.length;
        }

        // shuffle して「どの slot が K=何か」をランダム化
        for (let i = kList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [kList[i], kList[j]] = [kList[j], kList[i]];
        }

        const map = {};
        gimmickSlots.forEach((slotIdx, i) => {
            map[slotIdx] = kList[i];
        });
        return map;
    }

    // Registry 全体から双方向の conflict map を構築。
    // "B07 conflicts: [B12]" としか書いていなくても、B12→B07 も遮断する。
    let _conflictMapCache = null;
    function buildConflictMap() {
        if (_conflictMapCache) return _conflictMapCache;
        const map = {};
        const all = window.GimmickRegistry?.all || [];
        for (const g of all) {
            if (!map[g.id]) map[g.id] = new Set();
            for (const c of (g.conflicts || [])) {
                map[g.id].add(c);
                if (!map[c]) map[c] = new Set();
                map[c].add(g.id);
            }
        }
        _conflictMapCache = map;
        return map;
    }

    // count 個、conflict を回避しながら抽選。取れなければ取れた分だけ返す。
    function pickGimmicks(stageNo, q, count) {
        const stageConfig = window.CONFIG.STAGES.find(s => s.no === stageNo);
        if (!stageConfig) return [];
        if (!count || count <= 0) return [];

        // ①ステージ別プール ②回答モード ③excludeFromPool除外 の三段フィルタ
        const stageOK = poolForStage(window.GimmickRegistry.all, stageNo);
        const modeOK = filterByMode(stageOK, q.mode);
        const pool = filterPoolable(modeOK);
        if (pool.length === 0) {
            console.warn(`[Gimmick] no compatible gimmick for stage=${stageNo} mode=${q.mode}`);
            return [];
        }

        const conflictMap = buildConflictMap();

        // ランダム順に並べ替えて、conflict を避けつつ count 個取る
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);

        const picked = [];
        const usedIds = new Set();

        for (const g of shuffled) {
            if (picked.length >= count) break;
            if (usedIds.has(g.id)) continue;
            const blocks = conflictMap[g.id];
            if (blocks && Array.from(blocks).some(id => usedIds.has(id))) continue;
            picked.push(g);
            usedIds.add(g.id);
        }
        // count より少なくてもそのまま返す (プール枯渇やconflict集中で発生しうる)
        return picked;
    }

    window.GimmickSelector = {
        pickGimmicks,
        pickGimmickSlots,
        generateKAssignment,
        poolForStage,
        buildConflictMap,
    };
})();
