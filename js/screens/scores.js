/* ============================================================
   scores.js — SCORES 画面 (5タブ UI の SCORES タブ)
   ------------------------------------------------------------
   旧 SCORES モーダル (homeMenu.js#openScores) をフルスクリーン化。
   - 上部サマリ (CLEARED / PLAYS)
   - ステージ別ベスト (rank / best score / plays)
   ビュー専用 (書き換え無し)。
   ============================================================ */

(function () {
    function escapeHTML(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildBodyHTML() {
        const stages = window.CONFIG.STAGES || [];
        const rows = stages.map(s => {
            const sc = window.Save?.getStageScore?.(s.no);
            const unlocked = window.Save?.isStageUnlocked?.(s.no) ?? (s.no === 1);
            let body;
            if (!unlocked) {
                body = `<span class="sc-lock">LOCKED</span>`;
            } else if (!sc || !sc.best) {
                body = `<span class="sc-none">— NO CLEAR —</span>`;
            } else {
                const rank = sc.bestRank || '?';
                const accent = window.Ranks?.accentColorVar?.(rank) || 'var(--accent-cyan)';
                body = `
                    <span class="sc-rank rank-${escapeHTML(rank)}" style="--rank-accent:${accent};">${escapeHTML(rank)}</span>
                    <span class="sc-score">${(sc.best || 0).toLocaleString()}</span>
                    <span class="sc-plays">×${sc.plays || 0}</span>
                `;
            }
            return `
                <div class="sc-row">
                    <div class="sc-no">${String(s.no).padStart(2, '0')}</div>
                    <div class="sc-name">${escapeHTML(s.name)}</div>
                    <div class="sc-body">${body}</div>
                </div>
            `;
        }).join('');

        const totalPlays = stages.reduce((a, s) => a + (window.Save?.getStageScore?.(s.no)?.plays || 0), 0);
        const cleared = (window.Save?.data?.progress?.clearedStages || []).length;

        return `
            <section class="sc-summary">
                <div>
                    <span class="sc-sum-lbl">CLEARED</span>
                    <span class="sc-sum-val">${cleared}/${stages.length}</span>
                </div>
                <div>
                    <span class="sc-sum-lbl">PLAYS</span>
                    <span class="sc-sum-val">${totalPlays}</span>
                </div>
            </section>
            <section class="sc-list">${rows}</section>
        `;
    }

    const Screen = {
        render() {
            return `
                <div class="screen scores-screen">
                    <div class="screen-header scores-head">
                        <button class="back-btn" data-action="back" type="button">◀ BACK</button>
                        <h1 class="scores-title">SCORES</h1>
                        <div class="scores-head-spacer"></div>
                    </div>
                    <div class="scroll-area scores-scroll">
                        ${buildBodyHTML()}
                    </div>
                </div>
            `;
        },

        init() {
            window.TabBar?.mount?.('scores');

            const root = document.querySelector('.scores-screen');
            root?.querySelector('[data-action="back"]')?.addEventListener('click', () => {
                window.SE?.fire?.('menuCursor');
                window.Router?.show?.('home');
            });
        },

        destroy() { /* noop */ },
    };

    window.Screens.scores = Screen;
})();
