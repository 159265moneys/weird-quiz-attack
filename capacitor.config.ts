import type { CapacitorConfig } from '@capacitor/cli';

/* ============================================================
   capacitor.config.ts — 変なクイズ (Capacitor 8)
   ------------------------------------------------------------
   appId: 世界で一意なアプリ識別子 (後から変更不可)
   appName: デバイスに表示されるアプリ名
   webDir: npm run build 後の静的ファイル置き場
   ============================================================ */

const config: CapacitorConfig = {
    appId: 'com.oddquiz.app',
    appName: '変なクイズ',
    webDir: 'www',

    // iOS / Android 共通設定
    server: {
        // 本番は bundle 内の web を参照。開発用に
        //   "url": "http://192.168.x.x:8080"
        // を入れるとライブリロードできる (今は使わない)。
        androidScheme: 'https',
    },

    // ネイティブスプラッシュ設定
    plugins: {
        SplashScreen: {
            // 起動直後はスプラッシュを出し、web が ready になるまで保持。
            // main.js の最後で hide() を呼ぶ方針 (後述 capacitor-init.js)。
            launchAutoHide: false,
            launchShowDuration: 2000,
            backgroundColor: '#0a0a0a',
            showSpinner: false,
            iosSpinnerStyle: 'small',
            androidScaleType: 'CENTER_CROP',
            splashFullScreen: true,
            splashImmersive: true,
        },
        StatusBar: {
            // 真っ黒背景のゲームに合わせてダーク側で統一
            backgroundColor: '#000000',
            style: 'DARK',
            overlaysWebView: false,
        },
    },

    // iOS 固有
    ios: {
        // scroll の慣性を切る (ゲーム画面が勝手にスクロールするのを防ぐ)
        scrollEnabled: false,
        // バックスワイプで webview が戻るのを無効化 (ゲームなので戻る意味が無い)
        // 注: Capacitor 8 でデフォルト無効なので特に指定不要
        contentInset: 'always',
    },

    // Android 固有
    android: {
        // 明示的に allowMixedContent を無効化 (任意)
        allowMixedContent: false,
    },
};

export default config;
