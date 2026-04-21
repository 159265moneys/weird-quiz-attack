/* ============================================================
   gimmicks/engine.js — 崩壊UIギミックの適用/解除エンジン
   ------------------------------------------------------------
   ライフサイクル:
     - question.js の init() で applyForQuestion(stageNo, q) を呼ぶ
     - resolveAnswer() 直前と destroy() で dispose() を呼ぶ
     - setForced([id,...]) で次の問題に強制ギミックを適用できる (デバッグ用)
   ============================================================ */

(function () {
    let active = [];     // [{ gimmick, cleanup }]
    let forcedIds = null;
    let lastAppliedIds = [];

    function buildContext(q) {
        const screen = document.querySelector('.question-screen');
        return {
            q,
            screen,
            zones: {
                header:   screen?.querySelector('.q-zone-header'),
                question: screen?.querySelector('.q-zone-question'),
                answer:   screen?.querySelector('.q-zone-answer'),
            },
        };
    }

    function applyForQuestion(stageNo, q) {
        dispose();

        const ctx = buildContext(q);
        if (!ctx.screen) return [];

        let picked;
        if (forcedIds && forcedIds.length) {
            // デバッグ強制: mode合致するものだけ適用 (非対応はスキップ)
            picked = forcedIds
                .map(id => window.GimmickRegistry.all.find(g => g.id === id))
                .filter(Boolean)
                .filter(g => g.supports === 'both' || g.supports === q.mode);
            forcedIds = null;
        } else {
            // このインデックスが今ステージの「ギミック発動スロット」に入っていなければ何もしない
            const session = window.GameState?.session;
            const slots = session?.gimmickSlots || [];
            const idx = session?.index ?? -1;
            if (!slots.includes(idx)) {
                lastAppliedIds = [];
                return [];
            }
            picked = window.GimmickSelector.pickGimmicks(stageNo, q);
        }

        picked.forEach(g => {
            try {
                const cleanup = g.apply(ctx);
                active.push({ gimmick: g, cleanup: cleanup || (() => {}) });
            } catch (e) {
                console.error('[Gimmick] apply failed:', g.id, e);
            }
        });

        lastAppliedIds = picked.map(g => g.id);
        if (picked.length) {
            console.log('[Gimmick] applied:', lastAppliedIds.join(', '));
        }
        return picked;
    }

    function dispose() {
        active.forEach(({ gimmick, cleanup }) => {
            try { cleanup(); } catch (e) {
                console.error('[Gimmick] cleanup failed:', gimmick.id, e);
            }
        });
        active = [];
    }

    function setForced(ids) {
        forcedIds = Array.isArray(ids) ? ids.slice() : null;
    }

    function listActive() {
        return active.map(a => a.gimmick.id);
    }

    function listLastApplied() {
        return lastAppliedIds.slice();
    }

    window.Gimmicks = {
        applyForQuestion,
        dispose,
        setForced,
        listActive,
        listLastApplied,
    };
})();
