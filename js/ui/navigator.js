/* ============================================================
   ui/navigator.js — ナビゲーター (girl キャラ) + 吹き出し
   ------------------------------------------------------------
   画面下部に girl スプライトを置いて吹き出しで会話させる。
   チュートリアル / リザルトコメント等で使い回す汎用 UI。

     API:
     Navigator.speak(lines[, opts])
       lines: string[]      発言 (1要素 = 1吹き出し)
       opts.poses: string[] 各発言に対応するポーズ (省略時は自動ローテ)
       opts.customImage: string
                            指定時は sprite/girl/*.png ではなくこのパスの
                            静止画を使う (= サブキャラ立ち絵 1 枚用)。
                            ポーズローテも無効化される。
       opts.onDone: fn      最後まで送った後のコールバック
       opts.autoStart: bool true なら最初の行を即表示 (default true)
     Navigator.close()
       即座に閉じる。
     Navigator.isOpen()

   ポーズは sprite/girl/ の以下 5 種:
     basic.png / hi.png / happy.png / think.png / think_light.png
   吹き出し更新毎にローテ (指定が無ければ 'basic'→'hi'→'think'→'happy'→'think_light'→...)。

   内部で stage 直下にオーバーレイをマウント。B18 (z:9999) より下、
   VHS canvas (z:100) よりは上で 1500 に置く。
   ============================================================ */

(function () {
    const POSES_DEFAULT = ['basic', 'hi', 'think', 'happy', 'think_light'];

    let overlay = null;
    let state = null; // { lines, poses, idx, onDone }
    let showAt = 0;
    const MIN_SHOW_MS = 450; // この時間内のタップは無視 (誤操作で即閉じ回避)

    function mountShell() {
        if (overlay) return overlay;
        const stage = document.getElementById('stage');
        if (!stage) return null;

        overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        overlay.innerHTML = `
            <div class="nav-backdrop"></div>
            <div class="nav-figure">
                <img class="nav-girl" alt="">
            </div>
            <div class="nav-bubble">
                <div class="nav-bubble-text"></div>
                <div class="nav-bubble-next">TAP</div>
            </div>
        `;
        stage.appendChild(overlay);

        // クリックで次の台詞。persist モード中は反応しない (完全表示しっぱなし)
        overlay.addEventListener('pointerdown', (e) => {
            if (state?.persist) return;  // タップで閉じない
            e.stopPropagation();
            next();
        });
        return overlay;
    }

    function show(idx) {
        if (!overlay || !state) return;
        const line = state.lines[idx];
        const pose = (state.poses && state.poses[idx])
            || POSES_DEFAULT[idx % POSES_DEFAULT.length];

        const imgEl  = overlay.querySelector('.nav-girl');
        const textEl = overlay.querySelector('.nav-bubble-text');
        const nextEl = overlay.querySelector('.nav-bubble-next');
        const bubble = overlay.querySelector('.nav-bubble');
        const figure = overlay.querySelector('.nav-figure');

        // ポーズ切替: src 変更 (load 失敗は黙って隠す)
        //   customImage 指定時はポーズ機構をバイパスして 1 枚絵を使う
        //   (サブキャラはアバター PNG をそのまま流用する想定)。
        imgEl.onerror = () => { imgEl.style.opacity = '0'; };
        imgEl.onload  = () => { imgEl.style.opacity = '1'; };
        imgEl.src = state.customImage || `sprite/girl/${pose}.png`;

        // bubble を一瞬オフにして再度ポップさせる
        bubble.classList.remove('is-pop');
        figure.classList.remove('is-pop');
        void bubble.offsetWidth;  // reflow
        bubble.classList.add('is-pop');
        figure.classList.add('is-pop');

        window.SE?.fire('naviPop');

        textEl.textContent = line;
        const isLast = idx >= state.lines.length - 1;
        // holdLast: 最後の行に到達したらそれ以降 persist 状態にラッチする。
        //   = 吹き出しは残したまま、タップで閉じず・下の UI (ステ1カード等) へ
        //     クリックを透過させる。外部 (stageSelect) が Navigator.close() を
        //     明示的に呼ぶまで表示し続ける。
        //   同時に body[data-nav-mode=tutorial] を外す: これを残すと CSS が
        //   全 stage-card を pointer-events:none にしてしまい、ステ1 のタップも
        //   拾えなくなる。is-tutorial-lock (stage1 以外ロック) だけに切り替える。
        if (isLast && state.holdLast) {
            state.persist = true;
            delete document.body.dataset.navMode;
        }
        // persist: タップで閉じないので "次へ" ヒントそのものを隠す。
        // oneShot: 吹き出しタップで閉じる (最終行と同じ)
        if (state.persist) {
            nextEl.textContent = '';
            nextEl.style.display = 'none';
        } else {
            nextEl.style.display = '';
            nextEl.textContent = state.oneShot ? 'CLOSE ▶' : (isLast ? 'OK ▶' : 'TAP ▶');
        }
        overlay.classList.toggle('is-last', isLast);
        overlay.classList.toggle('is-persist', !!state.persist);
        showAt = Date.now();
    }

    function next() {
        if (!state) return;
        if (Date.now() - showAt < MIN_SHOW_MS) return; // 誤タップ無視
        state.idx++;
        if (state.idx >= state.lines.length) {
            close();
            return;
        }
        show(state.idx);
    }

    function open() {
        mountShell();
        if (overlay) overlay.classList.add('is-open');
        document.body.classList.add('nav-lock');
        // モードを body に反映。tutorial は「他 UI 完全ロック」、
        // result (persist) は下のボタンが押せるよう素通し。CSS がこれを参照する。
        document.body.dataset.navMode = state?.mode || 'tutorial';
    }

    function close() {
        if (overlay) {
            overlay.classList.remove('is-open');
            overlay.classList.remove('is-persist');
            overlay.classList.remove('is-last');
            overlay.classList.remove('is-subchar');
            // persist モードでも強制的に閉じられるよう表示状態を完全リセット
            const bubble = overlay.querySelector('.nav-bubble');
            const figure = overlay.querySelector('.nav-figure');
            if (bubble) bubble.classList.remove('is-pop');
            if (figure) figure.classList.remove('is-pop');
        }
        document.body.classList.remove('nav-lock');
        delete document.body.dataset.navMode;
        const done = state?.onDone;
        state = null;
        if (typeof done === 'function') {
            try { done(); } catch (e) { /* noop */ }
        }
    }

    function speak(lines, opts = {}) {
        if (!lines || !lines.length) return;
        mountShell();

        // oneShot: タップ文字送りせず 1 吹き出しに全行を結合表示
        const displayLines = opts.oneShot
            ? [lines.join('\n')]
            : lines.slice();

        state = {
            lines: displayLines,
            poses: opts.poses || null,
            idx: 0,
            onDone: opts.onDone || null,
            mode: opts.mode || 'tutorial',
            oneShot: !!opts.oneShot,
            // persist: true → タップで閉じない。キャラと吹き出しが画面に残り続ける。
            // (リザルト画面で「ずっと話しかけてる」体裁を作りたい時に使う)
            persist: !!opts.persist,
            // holdLast: true → 最終行に到達したら自動で persist 状態にラッチ。
            //   「最後のセリフを出したまま、ユーザが特定のカードを押すのを待つ」
            //    使い方。チュートリアルの最後から Stage 1 タップへのブリッジで使用。
            holdLast: !!opts.holdLast,
            // customImage: サブキャラ 1 枚絵差し替え用 (nullable)
            customImage: (typeof opts.customImage === 'string' && opts.customImage) ? opts.customImage : null,
        };
        applyMode(state.mode);
        // サブキャラ時は CSS 調整フックを立てる (正方形画像を綺麗に見せる等)
        if (overlay) overlay.classList.toggle('is-subchar', !!state.customImage);
        open();
        show(0);
    }

    function applyMode(mode) {
        if (!overlay) return;
        overlay.classList.remove('mode-tutorial', 'mode-result');
        overlay.classList.add(`mode-${mode}`);
    }

    function isOpen() {
        return !!(overlay && overlay.classList.contains('is-open'));
    }

    window.Navigator = { speak, close, isOpen };
})();
