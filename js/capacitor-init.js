/* ============================================================
   capacitor-init.js — Capacitor ネイティブ層との接続
   ------------------------------------------------------------
   Web (GitHub Pages 等) から読み込まれた時は何もしない no-op。
   Capacitor ネイティブ (iOS/Android WebView) で動いている時のみ:
     - スプラッシュを手動 hide (UI 準備完了後)
     - StatusBar をゲーム世界観に合わせて黒に
     - 画面を portrait にロック
     - ハプティクスを既存 Haptics API に接ぐ (iOS Safari で navigator.vibrate が
       動かない問題を解消)
     - ハードウェアバックキー (Android) で Router.back を呼ぶ

   Capacitor は window.Capacitor をグローバルに公開する。存在チェックで
   Web 版では全処理をスキップする。
   ============================================================ */

(function () {
    const Cap = window.Capacitor;
    if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) {
        // Web ブラウザで開かれた場合は何もしない
        return;
    }
    const platform = Cap.getPlatform ? Cap.getPlatform() : 'web';
    document.documentElement.classList.add('is-capacitor', `is-${platform}`);

    // -------- SplashScreen: UI 準備完了後に手動 hide --------
    const Splash = Cap.Plugins?.SplashScreen;
    if (Splash && typeof Splash.hide === 'function') {
        // main.js の boot() が呼ばれるタイミングよりやや遅らせて、
        // BGM 準備 / 初回 render 完了後に消す (白フラッシュ回避)。
        const hideSplash = () => {
            try { Splash.hide({ fadeOutDuration: 300 }); } catch (_) {}
        };
        if (document.readyState === 'complete') {
            setTimeout(hideSplash, 400);
        } else {
            window.addEventListener('load', () => setTimeout(hideSplash, 400));
        }
    }

    // -------- StatusBar: 黒 + ライトアイコン --------
    const StatusBar = Cap.Plugins?.StatusBar;
    if (StatusBar) {
        try {
            StatusBar.setStyle({ style: 'DARK' });           // アイコン色 (DARK=明色)
            StatusBar.setBackgroundColor?.({ color: '#000000' });
            StatusBar.setOverlaysWebView?.({ overlay: false });
        } catch (_) {}
    }

    // -------- ScreenOrientation: portrait ロック --------
    const Orient = Cap.Plugins?.ScreenOrientation;
    if (Orient && typeof Orient.lock === 'function') {
        try { Orient.lock({ orientation: 'portrait' }); } catch (_) {}
    }

    // -------- Haptics: navigator.vibrate → @capacitor/haptics にルーティング --------
    //   既存の window.Haptics は内部で navigator.vibrate を呼ぶが、iOS Safari では
    //   これが no-op になる。Capacitor Haptics plugin を使うと iOS で確実に
    //   taptic engine を発火できるので、ここで差し替える。
    const NativeHaptics = Cap.Plugins?.Haptics;
    if (NativeHaptics && window.Haptics) {
        const origVibrate = window.Haptics.vibrate;
        // 強度マッピング (ms → impact style)
        const mapImpact = (ms) => {
            if (!ms || ms <= 15) return 'LIGHT';
            if (ms <= 40)        return 'MEDIUM';
            return 'HEAVY';
        };
        window.Haptics.vibrate = function (ms) {
            try {
                NativeHaptics.impact({ style: mapImpact(ms) });
            } catch (_) {
                // plugin 失敗時は従来の vibrate へフォールバック
                try { origVibrate.call(window.Haptics, ms); } catch (_) {}
            }
        };
    }

    // -------- バックキー (Android) --------
    const AppPlugin = Cap.Plugins?.App;
    if (AppPlugin && typeof AppPlugin.addListener === 'function') {
        AppPlugin.addListener('backButton', (ev) => {
            // Router に back メソッドがあれば呼ぶ、なければ何もしない
            if (window.Router && typeof window.Router.back === 'function') {
                window.Router.back();
            } else {
                // どうしようもない時だけアプリ終了を許可
                if (ev && ev.canGoBack === false) {
                    AppPlugin.exitApp?.();
                }
            }
        });
    }
})();
