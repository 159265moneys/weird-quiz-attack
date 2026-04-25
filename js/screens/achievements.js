/* ============================================================
   screens/achievements.js — ACHIEVEMENTS 画面 (独立スクリーン)
   ------------------------------------------------------------
   2026-04: 旧モーダル (homeMenu.js#openAchievements) は
     - 全画面 backdrop-filter:blur(4px)
     - sticky header にもう 1 枚 backdrop-filter:blur(6px)
     - progress bar shimmer の連続アニメ
   が同居しており、iOS WKWebView で開いた瞬間に落ちる事例があった。
   ギミック図鑑と同じパターン (Router 管理の独立スクリーン) に移行。

   - render: HomeMenu.buildAchievementsHTML() の戻り値を全画面で表示
   - init  : TabBar を畳む / close / Esc バインド
   - destroy: ESC handler 解除のみ (DOM は Router が差し替え)
   ============================================================ */

(function () {
    let escHandler = null;

    function buildBodyHTML() {
        // モーダル時代の HTML をそのまま流用 (内部の hm-* クラスは
        // 既存 home-menu.css がそのまま当たる)。
        return window.HomeMenu?.buildAchievementsHTML?.() || `
            <div class="hm-panel hm-panel-wide hm-panel-ach">
                <div class="hm-head hm-head-sticky">
                    <div class="hm-title">ACHIEVEMENTS</div>
                </div>
                <div class="hm-ach-body">
                    <div class="hm-ach-empty">読み込みに失敗しました</div>
                </div>
            </div>
        `;
    }

    const Screen = {
        render() {
            return `
                <div class="screen achievements-screen" role="region" aria-label="ACHIEVEMENTS">
                    <div class="achievements-screen-inner">${buildBodyHTML()}</div>
                </div>
            `;
        },

        init() {
            // 図鑑と同じく、5タブのいずれでもないので TabBar は畳む。
            window.TabBar?.unmount?.();

            const root = document.querySelector('.achievements-screen');
            if (!root) return;

            const goHome = () => {
                window.SE?.fire?.('cancel');
                window.Router.show('home');
            };

            // モーダル流用 HTML 内の閉じるボタン (.hm-close) を Router 戻りに割当
            const closeBtn = root.querySelector('.hm-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', goHome);
            }

            escHandler = (e) => {
                if (e.key === 'Escape') goHome();
            };
            document.addEventListener('keydown', escHandler);

            window.SE?.fire?.('confirm');
        },

        destroy() {
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
                escHandler = null;
            }
        },
    };

    window.Screens = window.Screens || {};
    window.Screens.achievements = Screen;
})();
