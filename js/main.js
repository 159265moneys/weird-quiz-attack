/* ============================================================
   main.js — エントリポイント
   ============================================================ */

(function () {
    function updateScale() {
        // visualViewport を優先 (iOS のアドレスバー変動に追従)
        const vv = window.visualViewport;
        const w = (vv && vv.width)  || window.innerWidth;
        const h = (vv && vv.height) || window.innerHeight;
        // 左右/上下に 1px も余らせないため、丸め誤差で見切れるのを避ける
        const sx = w / 1080;
        const sy = h / 1920;
        const scale = Math.min(sx, sy);
        document.documentElement.style.setProperty('--scale', scale);
    }

    // 初期フラッシュ抑制: DOMContentLoadedを待たずに即時反映
    updateScale();
    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', updateScale);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateScale);
        window.visualViewport.addEventListener('scroll', updateScale);
    }
    // iOSでレイアウト確定が遅れるケースに備えて次ティックでも再計算
    setTimeout(updateScale, 0);
    setTimeout(updateScale, 300);

    function boot() {
        window.Save.load();
        updateScale();

        // 保存されてる音量/ミュート設定を起動時に反映
        try {
            const s = window.Save.getSettings();
            window.SE?.setMasterVolume?.(s.seVolume);
            window.BGM?.setVolume?.(s.bgmVolume);
            window.SE?.mute?.(!!s.muted);
            window.BGM?.mute?.(!!s.muted);
        } catch (_) { /* noop */ }

        // ダブルタップズーム抑制 (iOS)
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) e.preventDefault();
            lastTap = now;
        }, { passive: false });

        window.Debug?.init();
        window.FloatingTextFX?.mount();
        window.VhsFX?.mount();
        // 蝶カーソル: スマホはタッチ操作なのでカーソル追従は無意味。
        // 代わりに選択した要素 (.is-selected 等) の左上に蝶アイコンを表示する
        // CSS 方式に変更 (styles/effects.css 参照)。
        window.Router.show('title');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
