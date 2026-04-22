/* ============================================================
   haptics.js — バイブレーション (触覚フィードバック) 制御
   ------------------------------------------------------------
   SE と 1 対 1 で対応する名前キーを受け取り、ごく短い
   navigator.vibrate() パターンを発火する薄いラッパー。

   - Save の settings.vibration が false なら一切発火しない
   - navigator.vibrate が無い環境 (iOS Safari など) では no-op
     (iOS 上では Web 版では動かない。Capacitor ネイティブ移植時に
      @capacitor/haptics へ差し替えるための抽象層を兼ねている)
   - SE と統一した名前キーで呼べるよう `fire(name)` を提供。
     audio.js 側の SE.fire() から自動で呼ぶため、基本的に
     画面側コードが直接 Haptics を呼ぶ必要は無い。
   - ミュート設定 (SE/BGM のマスターミュート) とは独立。
     音を消したい状況 (深夜) でも振動は欲しい人向けに分離。
   ============================================================ */

(function () {
    // SE の name → バイブレーションパターン
    //   数値 = 単発ミリ秒 / 配列 = [振動, 停止, 振動, ...]
    //   全体的に控えめ。「スマホが鳴る」より「指先に返事が来る」レベル。
    const PATTERNS = {
        // --- 入力系 (地味に) ---
        select:        8,
        confirm:       14,
        cancel:        10,
        menuCursor:    6,
        // キーボード打鍵: SE は渋滞回避で全面削除したが、触覚は残した方が
        // "押した" 感が出て誤タップに気付きやすい。iPhone の純正キーボード
        // 体感に寄せる意図でごく短い tick を使う。
        keyTap:        5,
        keyBs:         8,
        keyOk:         12,

        // --- 判定 ---
        correct:       [18, 40, 18],     // 軽快な 2 連
        wrong:         60,               // ドッ
        timeout:       [80, 40, 80],     // ダダッ
        gameOver:      180,

        // --- UI 演出 ---
        rankReveal:    30,
        rankRevealSnap:[8, 40, 8],
        shareOk:       14,
        naviPop:       6,
        scoreCount:    4,
        timeWarn:      40,
        tapStart:      18,
        stageStart:    20,

        // --- gimmick (強めの演出系は少しだけ振動で "効かせる") ---
        gB21Death:     [200, 80, 200],
        gB04Zoom:      12,
        gB05Mirror:    10,
        gB11Fire:      22,
        gB16Alarm:     [40, 40, 40, 40, 40],
        gB17Glitch:    [6, 20, 6, 20, 6],
        gB18Notify:    [20, 40, 20],
        gB20In:        10,
        gB20Out:       14,
        gB25Pop:       10,
        gC01Shuffle:   8,
        gW15Warp:      10,
    };

    // iOS Safari は navigator.vibrate を定義していない (Chrome on iOS も同様)。
    // Android Chrome, Android Firefox はサポート。
    // プロパティ存在チェックに加え、ブラウザが「常に false を返すダミー」になっている
    // 場合 (セキュリティ設定等) もあるが、呼ぶ分には害が無いのでそのまま通す。
    const SUPPORTED =
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function';

    function isEnabled() {
        const s = window.Save?.getSettings?.();
        // 設定オブジェクトが取れない初期段階 (load 前) はデフォ ON
        if (!s) return true;
        return s.vibration !== false;
    }

    function setEnabled(flag) {
        const v = !!flag;
        window.Save?.setSetting?.('vibration', v);
        // OFF に切り替えた瞬間に走り続けている振動があれば止める
        if (!v && SUPPORTED) {
            try { navigator.vibrate(0); } catch (_) {}
        }
    }

    // 任意のパターンをそのまま発火 (画面側が独自に振動させたい時用)
    function vibrate(pattern) {
        if (!SUPPORTED) return false;
        if (!isEnabled()) return false;
        try { return navigator.vibrate(pattern); } catch (_) { return false; }
    }

    function fire(name) {
        const pat = PATTERNS[name];
        if (pat == null) return false;
        return vibrate(pat);
    }

    // 外部向けに SUPPORTED を公開 (Settings UI 側で「未対応環境」表示に使う)
    window.Haptics = {
        fire,
        vibrate,
        setEnabled,
        isEnabled,
        isSupported: () => SUPPORTED,
    };
})();
