/* ============================================================
   effects/floatingText.js — 浮遊文字背景 (3SEC 踏襲)
   ------------------------------------------------------------
   背景に世界観ワードが低透明度でゆっくり浮遊する。
   - 常時画面上に N 個 (= CAPACITY) 保つ
   - 各文字は左右いずれかの画面外から入り、反対側へドリフト
   - title / stageSelect 画面だけ有効 (問題画面では邪魔)
   ============================================================ */

(function () {
    const SHOW_ON = new Set(['title', 'stageSelect', 'result']);

    const CAPACITY = 14; // 同時に浮かぶ最大文字数

    // 世界観ワード (英数字カタカナ混在、短めが映える)
    const WORDS = [
        'QUIZ', 'DEATH', 'ERROR', 'COLLAPSE', 'GLITCH', 'CHAOS',
        'SYSTEM', 'NULL', 'FATAL', 'BUG', 'REBOOT', 'NOISE',
        '崩壊', '絶望', '理不尽', 'バグ', '狂気', '暴走',
        'BROKEN', 'VOID', '∞', '×', 'RUN', 'STOP',
    ];

    // プリセットの色 (ロゴとぶつからないよう低彩度+半透明で使う)
    const COLORS = [
        'rgba(255,255,255,0.06)',
        'rgba(0,229,255,0.08)',    // cyan
        'rgba(255,51,64,0.06)',    // red
        'rgba(255,204,0,0.06)',    // warn
    ];

    // 論理座標 (1080x1920) で動かす — #stage 内に入れて transform: scale と一緒に拡縮される
    const LOGICAL_W = 1080;
    const LOGICAL_H = 1920;

    let wrap = null;
    let raf = 0;
    let alive = false;
    const items = []; // { el, x, y, vx, vy, rot }

    function mount() {
        if (wrap) return;
        wrap = document.createElement('div');
        wrap.className = 'fx-floating';
        // #stage の直下に置き、logical座標で1080x1920フルに展開
        // #app より「下」に置きたいので prepend
        const stage = document.getElementById('stage');
        if (stage) stage.insertBefore(wrap, stage.firstChild);
        else document.body.appendChild(wrap);

        for (let i = 0; i < CAPACITY; i++) items.push(spawn(true));
        alive = true;
        raf = requestAnimationFrame(loop);
    }

    function unmount() {
        alive = false;
        cancelAnimationFrame(raf);
        items.length = 0;
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        wrap = null;
    }

    function rand(min, max) { return Math.random() * (max - min) + min; }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function spawn(initial) {
        const el = document.createElement('div');
        el.className = 'fx-floating-item';
        el.textContent = pick(WORDS);
        el.style.color = pick(COLORS);
        const size = rand(64, 220);
        el.style.fontSize = `${size}px`;

        // 左右どちらから流すか
        const fromLeft = Math.random() < 0.5;
        const W = LOGICAL_W;
        const H = LOGICAL_H;

        const it = {
            el,
            x: initial ? rand(-200, W + 200) : (fromLeft ? -400 : W + 400),
            y: rand(-100, H + 100),
            vx: (fromLeft ? 1 : -1) * rand(0.4, 1.4),
            vy: rand(-0.15, 0.15),
            rot: rand(-15, 15),
            size,
        };
        el.style.transform = `translate(${it.x}px, ${it.y}px) rotate(${it.rot}deg)`;
        wrap.appendChild(el);
        return it;
    }

    function respawn(it) {
        if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
        const idx = items.indexOf(it);
        if (idx >= 0) items[idx] = spawn(false);
    }

    function loop() {
        if (!alive) return;
        const W = LOGICAL_W;
        for (const it of items) {
            it.x += it.vx;
            it.y += it.vy;
            it.el.style.transform = `translate(${it.x}px, ${it.y}px) rotate(${it.rot}deg)`;

            // 画面外へ抜けたら再スポーン (逆側から)
            if (it.vx > 0 && it.x > W + 500) respawn(it);
            else if (it.vx < 0 && it.x < -500) respawn(it);
        }
        raf = requestAnimationFrame(loop);
    }

    function onScreenChange(name) {
        if (!wrap) return;
        wrap.classList.toggle('is-hidden', !SHOW_ON.has(name));
    }

    window.FloatingTextFX = { mount, unmount, onScreenChange };
})();
