/* ============================================================
   main.js — エントリポイント
   ============================================================ */

(function () {
    function updateScale() {
        // ★ 2026-04 方針変更: visualViewport は使わない。
        // ----------------------------------------------------------
        // visualViewport.height は iOS でソフトウェアキーボードが
        // 開くと縮む。これを元に --scale を算出すると、名前入力を
        // タップした瞬間に #stage 全体が縮小されてしまい UX が崩壊。
        // layout viewport (window.innerWidth / innerHeight) は
        // キーボードでは変わらず、アドレスバーの伸縮のみ追従する
        // (モダン iOS Safari では resize イベントも発火する)。
        // よってレイアウト viewport のみを使う。
        // ----------------------------------------------------------
        const w = window.innerWidth;
        const h = window.innerHeight;
        const sx = w / 1080;
        const sy = h / 1920;
        const scale = Math.min(sx, sy);
        document.documentElement.style.setProperty('--scale', scale);
    }

    // 初期フラッシュ抑制: DOMContentLoaded を待たずに即時反映
    updateScale();
    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', updateScale);
    // visualViewport resize はキーボード開閉で発火するため意図的に不使用。
    // iOS でレイアウト確定が遅れるケースに備えて次ティックでも再計算
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
