/* ============================================================
   firebase-config.js — Firebase 接続設定
   ------------------------------------------------------------
   ⚠️ これらの値はクライアントに露出するが、App Check (reCAPTCHA
      Enterprise) で「本物アプリからのリクエストか」を検証する
      ため、API キーが漏れても他クライアントから悪用されない設計。

   設定の生成元:
     - firebaseConfig    : Firebase Console → プロジェクト設定 → 全般
     - APP_CHECK_SITE_KEY: GCP Console     → reCAPTCHA Enterprise

   差し替え時は両方を一括で更新すること。
   ============================================================ */

(function () {
    window.FIREBASE_CONFIG = {
        apiKey:            "AIzaSyAIz6CkQgjscVqjQTop4Zefq2t3G-I-hv8",
        authDomain:        "odd-quiz.firebaseapp.com",
        projectId:         "odd-quiz",
        storageBucket:     "odd-quiz.firebasestorage.app",
        messagingSenderId: "259932897869",
        appId:             "1:259932897869:web:53ebcb996d8fe1cb2d9204",
        // measurementId は Analytics 用。本ゲームは Analytics を使わない
        // のでコメントアウト (= initializeApp は無視する)。
        // measurementId:  "G-738VZC6E74",
    };

    // reCAPTCHA Enterprise サイトキー (App Check 用)
    //   登録ドメイン: localhost / 159265moneys.github.io
    //   ドメイン所有権の証明: スキップ (TXT 設定不能のため ON にしてある)
    window.APP_CHECK_SITE_KEY = "6LcJ4sosAAAAAG9A6EA1tGp11WzBNOHQinFraXbD";
})();
