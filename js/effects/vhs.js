/* ============================================================
   effects/vhs.js — VHS 風グリッチ演出 (3SEC 準拠・Canvas実装)
   ------------------------------------------------------------
   参考実装 (3SEC: js/screens/title.js) をそのまま移植:
     - スキャンライン: rgba(0,0,0,0.03) を 3px おきに描く
     - 常時ノイズ: 微量の白/黒ドット + 横方向のトラッキングライン
     - グリッチ発動: 毎フレーム 2% で ON、数フレーム維持
         - 水平ラインノイズ (3本): 幅固定のグレー帯
         - カラーブロックノイズ (5個): 彩度高めの矩形
         - 画面揺れ: #stage に translate を付与
         - RGBシフト: 画面全体を hue-rotate + オフセット2枚重ね
   全て Canvas 2D に描画。1080x1920 論理座標で持ち、#stage 内の
   absolute 最前面に配置。pointer-events: none。
   画面タイプ (title / stageSelect / result) でのみ有効化。
   ============================================================ */

(function () {
    const SHOW_ON = new Set(['title', 'stageSelect', 'result', 'home']);

    const W = 1080;
    const H = 1920;

    let canvas = null;
    let ctx = null;
    let rafId = 0;
    let alive = false;
    let stageEl = null;

    // --- グリッチ状態 (参考コードの変数と対応) ---
    let vhsGlitchTime = 0;
    let vhsGlitchActive = false;
    let vhsGlitchIntensity = 0;
    let vhsGlitchFrames = 0;

    // トラッキングライン (常時スクロール)
    let trackingY = 0;

    function mount() {
        if (canvas) return;
        stageEl = document.getElementById('stage');
        if (!stageEl) return;

        canvas = document.createElement('canvas');
        canvas.className = 'fx-vhs-canvas';
        canvas.width = W;
        canvas.height = H;
        stageEl.appendChild(canvas);
        ctx = canvas.getContext('2d');

        alive = true;
        rafId = requestAnimationFrame(loop);
    }

    function unmount() {
        alive = false;
        cancelAnimationFrame(rafId);
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        canvas = null;
        ctx = null;
        stageEl = null;
        vhsGlitchActive = false;
        setShake(0, 0);
        setRgb(false);
    }

    function isEnabled() {
        const name = document.body.dataset.screen;
        return SHOW_ON.has(name);
    }

    function onScreenChange(name) {
        if (!canvas) return;
        const enabled = SHOW_ON.has(name);
        canvas.style.display = enabled ? '' : 'none';
        if (!enabled) {
            setShake(0, 0);
            setRgb(false);
        }
    }

    function setShake(x, y) {
        if (!stageEl) return;
        stageEl.style.setProperty('--shake-x', `${x}px`);
        stageEl.style.setProperty('--shake-y', `${y}px`);
    }

    function setRgb(on) {
        if (!stageEl) return;
        stageEl.classList.toggle('fx-vhs-rgb-active', !!on);
    }

    function loop() {
        if (!alive) return;
        rafId = requestAnimationFrame(loop);
        if (!isEnabled()) {
            // 画面外では描画だけサボる (設定コストは小)
            if (ctx) ctx.clearRect(0, 0, W, H);
            setShake(0, 0);
            setRgb(false);
            return;
        }
        update();
        draw();
    }

    // --- 毎フレームの状態更新 (参考コード updateTitle 相当) ---
    function update() {
        vhsGlitchTime++;

        // 1% の確率で新規グリッチ発動 (= ~100フレームに1回、旧値2%から半減)
        if (!vhsGlitchActive && Math.random() < 0.01) {
            vhsGlitchActive = true;
            vhsGlitchIntensity = 0.6 + Math.random() * 0.4;   // 0.6 - 1.0
            vhsGlitchFrames = 3 + Math.floor(Math.random() * 6); // 3-8f
        }
        if (vhsGlitchActive) {
            vhsGlitchFrames--;
            if (vhsGlitchFrames <= 0) {
                vhsGlitchActive = false;
                vhsGlitchIntensity = 0;
            }
        }

        // 画面揺れ + RGBシフト: グリッチ中のみ
        if (vhsGlitchActive) {
            const sx = (Math.random() - 0.5) * 24 * vhsGlitchIntensity;
            const sy = (Math.random() - 0.5) * 12 * vhsGlitchIntensity;
            setShake(sx, sy);
            setRgb(true);
        } else {
            setShake(0, 0);
            setRgb(false);
        }

        // トラッキングライン (常時 下 → 上 にゆっくり動く)
        trackingY -= 2.4;
        if (trackingY < 0) trackingY = H;
    }

    // --- 描画 (参考コード drawVHSEffect 相当) ---
    function draw() {
        ctx.clearRect(0, 0, W, H);

        // ① スキャンライン: 3px おきに 1px 黒 3%
        ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
        for (let y = 0; y < H; y += 3) {
            ctx.fillRect(0, y, W, 1);
        }

        // ② 常時の軽いノイズ (白点/黒点 各20個くらい)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (let i = 0; i < 24; i++) {
            const nx = Math.random() * W;
            const ny = Math.random() * H;
            ctx.fillRect(nx, ny, 2, 2);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        for (let i = 0; i < 18; i++) {
            const nx = Math.random() * W;
            const ny = Math.random() * H;
            ctx.fillRect(nx, ny, 2, 2);
        }

        // ③ VHS トラッキングライン: 画面を上に流れる横一本
        //   白 → 透明 のグラデ帯。ちょっとブラー感を出すため 3 層重ね。
        const tl = [
            { h: 40, a: 0.03 },
            { h: 16, a: 0.06 },
            { h: 4,  a: 0.12 },
        ];
        tl.forEach(band => {
            ctx.fillStyle = `rgba(255, 255, 255, ${band.a})`;
            ctx.fillRect(0, trackingY - band.h / 2, W, band.h);
        });

        // ④ グリッチ発動時の強ノイズ
        if (vhsGlitchActive) {
            const k = vhsGlitchIntensity;

            // 水平ラインノイズ (3 本): 白グレー、高さ 4-24px
            for (let i = 0; i < 3; i++) {
                const by = Math.random() * H;
                const bh = 4 + Math.random() * 20;
                const gray = 180 + Math.floor(Math.random() * 75);
                ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, ${0.5 + 0.3 * k})`;
                ctx.fillRect(0, by, W, bh);
            }

            // カラーブロックノイズ (5 個): 彩度高めの矩形をランダム位置
            const COLORS = [
                'rgba(255, 51, 64, 0.55)',   // red
                'rgba(0, 229, 255, 0.55)',   // cyan
                'rgba(255, 204, 0, 0.55)',   // yellow
                'rgba(255, 255, 255, 0.45)', // white
                'rgba(10, 132, 255, 0.5)',   // blue
            ];
            for (let i = 0; i < 5; i++) {
                const bx = Math.random() * W;
                const by = Math.random() * H;
                const bw = 40 + Math.random() * 280;
                const bh = 6 + Math.random() * 60;
                ctx.fillStyle = COLORS[i % COLORS.length];
                ctx.fillRect(bx, by, bw, bh);
            }

            // 強めのスキャンラインバースト
            ctx.fillStyle = `rgba(0, 0, 0, ${0.12 * k})`;
            for (let y = 0; y < H; y += 4) {
                ctx.fillRect(0, y, W, 2);
            }
        }
    }

    window.VhsFX = { mount, unmount, onScreenChange };
})();
