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
        const session = window.GameState?.session;
        const idx = session?.index ?? -1;

        if (forcedIds && forcedIds.length) {
            // デバッグ強制: mode合致するものだけ適用 (非対応はスキップ)
            picked = forcedIds
                .map(id => window.GimmickRegistry.all.find(g => g.id === id))
                .filter(Boolean)
                .filter(g => g.supports === 'both' || g.supports === q.mode);
            forcedIds = null;
        } else {
            const slots = session?.gimmickSlots || [];
            if (!slots.includes(idx)) {
                picked = [];
            } else {
                const k = (session?.kAssignment && session.kAssignment[idx]) || 1;
                picked = window.GimmickSelector.pickGimmicks(stageNo, q, k);
            }
        }

        // B18 特別枠: session.b18Slot に当たった問題では B18 を強制追加 (通常枠とは別経路)
        // ただしキーボード物理シャッフル系 (キー位置を動かす/消す) が picked に入ってる場合、
        // B18 ポップで画面下半分が隠れると「ずれた/消えたキーを探す」手段も絶たれて
        // 物理的に解けなくなる。その場合は picked から物理シャッフル系を先に外して
        // B18 を通す (問題文/選択肢を隠す系との同居は許容、プレイヤー側で「見えにくい」
        // だけなので B18 と共存しても無理ゲーにはならない)。
        if (session?.b18Slot === idx) {
            const b18 = window.GimmickRegistry?.B18_FAKE_ERROR;
            if (b18 && !picked.some(g => g.id === 'B18')) {
                const B18_HARD_CONFLICTS = new Set(['W02', 'W08', 'W15', 'W16', 'W18']);
                picked = picked.filter(g => !B18_HARD_CONFLICTS.has(g.id));
                picked = picked.concat([b18]);
            }
        }

        if (picked.length === 0) {
            lastAppliedIds = [];
            return [];
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
