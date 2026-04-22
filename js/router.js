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
        previous: null,          // 直前の screen 名 (遷移演出の分岐用)
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
            this.previous = this.current;

            // 画面遷移時に長尺 SE / ループ SE を全停止
            // (timeout 6s / key_ok 4.7s / glitch_loop 等の残留防止)
            if (window.SE?.abortAll) {
                try { window.SE.abortAll(); } catch (_) {}
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
