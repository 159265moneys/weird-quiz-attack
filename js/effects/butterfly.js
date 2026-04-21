/* ============================================================
   effects/butterfly.js — 蝶々カーソル (3SEC 踏襲)
   ------------------------------------------------------------
   - マウス / タッチを遅延追従する小さな蝶が画面を舞う
   - 羽ばたきアニメ (scale + rotate) は CSS keyframes 側
   - 移動方向によって本体も傾く (atan2)
   - 集中を削ぎすぎないよう、特定の screen (question/result) では非表示
   ============================================================ */

(function () {
    // この画面では非表示 (集中画面)
    const HIDDEN_ON = new Set(['question', 'result']);

    const EASE = 0.12;       // カーソル追従のイージング (0..1)
    const IDLE_DRIFT = 0.4;  // 入力なし時のランダムドリフト量 (px/frame)

    let wrap = null;
    let raf = 0;
    let alive = false;

    // 実座標 (画面px) & 目標座標
    let tx = 0, ty = 0;      // target
    let cx = 0, cy = 0;      // current
    let px = 0, py = 0;      // prev (回転計算用)
    let hasPointer = false;  // マウス/タッチ入力されたか

    // ------- 生成 -------
    function mount() {
        if (wrap) return;
        wrap = document.createElement('div');
        wrap.className = 'fx-butterfly';
        wrap.innerHTML = `
            <div class="fx-butterfly-rot">
                <img src="sprite/butterfly.png" alt="" draggable="false" class="fx-butterfly-img">
            </div>
        `;
        document.body.appendChild(wrap);

        // 初期位置は画面中央下寄り
        cx = tx = window.innerWidth / 2;
        cy = ty = window.innerHeight * 0.7;
        px = cx; py = cy;
        applyTransform();

        attachListeners();
        alive = true;
        raf = requestAnimationFrame(loop);
    }

    function unmount() {
        alive = false;
        cancelAnimationFrame(raf);
        detachListeners();
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        wrap = null;
    }

    // ------- 入力 -------
    function onPointerMove(e) {
        hasPointer = true;
        tx = e.clientX;
        ty = e.clientY;
    }
    function onTouchMove(e) {
        if (!e.touches || e.touches.length === 0) return;
        hasPointer = true;
        tx = e.touches[0].clientX;
        ty = e.touches[0].clientY;
    }

    function attachListeners() {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
    }
    function detachListeners() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('touchmove', onTouchMove);
    }

    // ------- ループ -------
    function loop() {
        if (!alive) return;

        // 入力が一度もなければゆるやかにランダムドリフト (鑑賞用)
        if (!hasPointer) {
            const t = performance.now() / 1000;
            tx = window.innerWidth / 2 + Math.sin(t * 0.5) * (window.innerWidth * 0.3);
            ty = window.innerHeight * 0.5 + Math.cos(t * 0.37) * (window.innerHeight * 0.25);
        }

        px = cx; py = cy;
        cx += (tx - cx) * EASE;
        cy += (ty - cy) * EASE;

        applyTransform();
        raf = requestAnimationFrame(loop);
    }

    function applyTransform() {
        if (!wrap) return;
        const dx = cx - px;
        const dy = cy - py;
        // 移動距離 < 0.5px の時は角度を据え置き (ブレ防止)
        const rot = wrap.dataset.rot
            ? parseFloat(wrap.dataset.rot)
            : 0;
        let newRot = rot;
        if (dx * dx + dy * dy > 0.25) {
            // 進行方向 + 90° (素材の向きによる補正)
            newRot = Math.atan2(dy, dx) * 180 / Math.PI + 90;
            wrap.dataset.rot = String(newRot);
        }
        wrap.style.transform = `translate(${cx}px, ${cy}px)`;
        // 回転は内側の要素で (羽ばたき scale と分離)
        const rotEl = wrap.firstElementChild;
        if (rotEl) rotEl.style.transform = `rotate(${newRot}deg)`;
    }

    // ------- 可視状態を screen に連動 -------
    function setVisible(visible) {
        if (!wrap) return;
        wrap.classList.toggle('is-hidden', !visible);
    }

    // Router の `showHook` で呼ばれる前提。なければ公開 API だけ提供。
    function onScreenChange(name) {
        if (!wrap) return;
        setVisible(!HIDDEN_ON.has(name));
    }

    window.ButterflyFX = {
        mount, unmount, onScreenChange,
    };
})();
