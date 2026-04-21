/* ============================================================
   main.js — エントリポイント
   ============================================================ */

(function () {
    function updateScale() {
        const sx = window.innerWidth / 1080;
        const sy = window.innerHeight / 1920;
        const scale = Math.min(sx, sy);
        document.documentElement.style.setProperty('--scale', scale);
    }

    function boot() {
        window.Save.load();
        updateScale();
        window.addEventListener('resize', updateScale);
        window.addEventListener('orientationchange', updateScale);

        // ダブルタップズーム抑制 (iOS)
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) e.preventDefault();
            lastTap = now;
        }, { passive: false });

        window.Debug?.init();
        window.Router.show('title');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
