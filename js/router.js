/* ============================================================
   router.js — 画面切替の司令塔
   各画面は window.Screens[name] に登録される想定。
      { render(params) -> HTML string,
        init?(params),
        destroy?() }
   ============================================================ */

(function () {
    window.Screens = window.Screens || {};

    const Router = {
        current: null,
        currentParams: null,

        show(name, params = {}) {
            const screen = window.Screens[name];
            if (!screen) {
                console.error('unknown screen:', name);
                return;
            }

            // 既存画面のクリーンアップ
            if (this.current && window.Screens[this.current]?.destroy) {
                try { window.Screens[this.current].destroy(); }
                catch (e) { console.error('destroy error:', e); }
            }

            const app = document.getElementById('app');
            app.innerHTML = screen.render(params) || '';

            this.current = name;
            this.currentParams = params;
            document.body.dataset.screen = name;

            if (screen.init) {
                try { screen.init(params); }
                catch (e) { console.error('init error:', e); }
            }

            if (window.Debug?.refresh) {
                try { window.Debug.refresh(); } catch (e) { /* noop */ }
            }

            if (window.FloatingTextFX?.onScreenChange) {
                try { window.FloatingTextFX.onScreenChange(name); } catch (e) { /* noop */ }
            }
            if (window.VhsFX?.onScreenChange) {
                try { window.VhsFX.onScreenChange(name); } catch (e) { /* noop */ }
            }
        },

        reload() {
            if (this.current) {
                this.show(this.current, this.currentParams);
            }
        },
    };

    window.Router = Router;
})();
