/* ============================================================
   ui/navigator.js — ナビゲーター (girl キャラ) + 吹き出し
   ------------------------------------------------------------
   画面下部に girl スプライトを置いて吹き出しで会話させる。
   チュートリアル / リザルトコメント等で使い回す汎用 UI。

   API:
     Navigator.speak(lines[, opts])
       lines: string[]      発言 (1要素 = 1吹き出し)
       opts.poses: string[] 各発言に対応するポーズ (省略時は自動ローテ)
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

        // クリックで次の台詞
        overlay.addEventListener('pointerdown', (e) => {
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
        imgEl.onerror = () => { imgEl.style.opacity = '0'; };
        imgEl.onload  = () => { imgEl.style.opacity = '1'; };
        imgEl.src = `sprite/girl/${pose}.png`;

        // bubble を一瞬オフにして再度ポップさせる
        bubble.classList.remove('is-pop');
        figure.classList.remove('is-pop');
        void bubble.offsetWidth;  // reflow
        bubble.classList.add('is-pop');
        figure.classList.add('is-pop');

        textEl.textContent = line;
        const isLast = idx >= state.lines.length - 1;
        nextEl.textContent = isLast ? 'OK ▶' : 'TAP ▶';
        overlay.classList.toggle('is-last', isLast);
    }

    function next() {
        if (!state) return;
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
    }

    function close() {
        if (overlay) overlay.classList.remove('is-open');
        document.body.classList.remove('nav-lock');
        const done = state?.onDone;
        state = null;
        if (typeof done === 'function') {
            try { done(); } catch (e) { /* noop */ }
        }
    }

    function speak(lines, opts = {}) {
        if (!lines || !lines.length) return;
        mountShell();
        state = {
            lines: lines.slice(),
            poses: opts.poses || null,
            idx: 0,
            onDone: opts.onDone || null,
        };
        open();
        show(0);
    }

    function isOpen() {
        return !!(overlay && overlay.classList.contains('is-open'));
    }

    window.Navigator = { speak, close, isOpen };
})();
