/* ============================================================
   scores.js — SCORES 画面 (5タブ UI の SCORES タブ)
   ------------------------------------------------------------
   旧 SCORES モーダル (homeMenu.js#openScores) をフルスクリーン化。
   見た目は一切変更せず、既存 hm-panel の HTML を HomeMenu から
   流用。モーダルを外側の screen で包んだだけ (ビュー専用)。
   ============================================================ */

(function () {
    const Screen = {
        render() {
            const html = window.HomeMenu?.buildScoresHTML?.() || '';
            return `
                <div class="screen scores-screen">
                    <div class="tab-header">
                        <h1 class="tab-header-title">SCORES</h1>
                    </div>
                    <div class="scores-screen-inner">${html}</div>
                </div>
            `;
        },

        init() {
            window.TabBar?.mount?.('scores');
            const root = document.querySelector('.scores-screen');
            if (!root) return;

            // モーダル版と同じ .hm-close (×) ボタン: フルスクリーンでは home に戻す
            root.querySelector('.hm-close')?.addEventListener('click', () => {
                window.SE?.fire?.('cancel');
                window.Router?.show?.('home');
            });
        },

        destroy() { /* TabBar は遷移先で再マウント */ },
    };

    window.Screens.scores = Screen;
})();
