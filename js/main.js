/* ============================================================
   main.js — エントリポイント
   ============================================================ */

(function () {
    function updateScale() {
        // ★ 2026-04 方針: canvas 高さ可変 + 幅固定スケーリング
        // ----------------------------------------------------------
        // 論理 canvas: 1080px 幅 × 可変高さ (最低 1920)
        // scale = viewport_width / 1080 (幅に合わせる)
        // canvas_h = max(1920, viewport_height / scale)
        //   → scaled 高さが必ず viewport_height 以上になる
        //   → 上下の「画面外」余白がゼロになる (モダン iPhone も埋まる)
        //
        // visualViewport は使わない: キーボードで縮むと #stage 全体が
        // 縮小されてしまい UX が崩壊するため。layout viewport は
        // キーボードで変化しない。
        // ----------------------------------------------------------
        const w = window.innerWidth;
        const h = window.innerHeight;
        const scale = w / 1080;
        const logicalH = Math.max(1920, Math.ceil(h / scale));
        const root = document.documentElement.style;
        root.setProperty('--scale', scale);
        root.setProperty('--canvas-h', logicalH + 'px');
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
