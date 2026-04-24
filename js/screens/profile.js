/* ============================================================
   profile.js — PROFILE 画面 (5タブ UI の ACCOUNT タブ)
   ------------------------------------------------------------
   旧 PROFILE モーダル (homeMenu.js#openProfile) をフルスクリーン化。
   見た目は一切変更せず、既存 hm-panel の HTML / ハンドラを
   HomeMenu から流用。モーダルを外側の screen で包んだだけ。
   ============================================================ */

(function () {
    const Screen = {
        render() {
            // Avatars manifest がまだロードされていない可能性があるので、
            // とりあえず現在の状態で一度レンダし、init 側で差し替える。
            const html = window.HomeMenu?.buildProfileHTML?.() || '';
            return `
                <div class="screen profile-screen">
                    <div class="profile-screen-inner">${html}</div>
                </div>
            `;
        },

        init() {
            window.TabBar?.mount?.('account');
            const root = document.querySelector('.profile-screen');
            if (!root) return;

            const bind = () => {
                const inner = root.querySelector('.profile-screen-inner');
                if (!inner) return;
                window.HomeMenu?.bindProfileHandlers?.(inner, {
                    isModal: false,
                    onClose: () => window.Router?.show?.('home'),
                });
            };

            // Avatars manifest が未ロードならロード完了後に再レンダ
            if (window.Avatars) {
                window.Avatars.load().then(() => {
                    const saved = window.Save?.getPlayerIcon?.();
                    if (saved && !window.Avatars.getById(saved)) {
                        window.Save?.setPlayerIcon?.(null);
                    }
                    const inner = root.querySelector('.profile-screen-inner');
                    if (inner) {
                        inner.innerHTML = window.HomeMenu?.buildProfileHTML?.() || '';
                    }
                    bind();
                }).catch(() => bind());
            } else {
                bind();
            }
        },

        destroy() { /* TabBar は遷移先で再マウント */ },
    };

    window.Screens.profile = Screen;
})();
