/* ============================================================
   effects/homeBackdrop.js — ホーム背景の回転多面体 (1SEC 移植)
   ------------------------------------------------------------
   元ネタ: 1SEC の drawGeometricBackground (正二十面体ワイヤー +
           外周リング)。canvas に毎フレーム描画。
   配置: home-screen の z-index 最下層 (.home-bg-canvas 要素)。
   - DPR を考慮してバッキングストアを CSS サイズと同期
   - 白背景に映えるよう線色は濃い目グレー、低 alpha
   - tab 切替で home から離れたら確実に rAF 停止
   ============================================================ */
(function () {
    'use strict';

    let canvas = null;
    let ctx = null;
    let rafId = 0;
    let startTs = 0;
    let onResize = null;

    // 正二十面体の頂点 / 辺 (回転毎の再計算は不要)
    const PHI = (1 + Math.sqrt(5)) / 2;
    const NORM = Math.sqrt(1 + PHI * PHI);
    const VERTS = [
        [-1,  PHI, 0], [ 1,  PHI, 0], [-1, -PHI, 0], [ 1, -PHI, 0],
        [ 0, -1,  PHI], [ 0, 1, PHI], [ 0, -1, -PHI], [ 0, 1, -PHI],
        [ PHI, 0, -1], [ PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
    ].map(v => [v[0] / NORM, v[1] / NORM, v[2] / NORM]);
    const EDGES = [
        [0,1],[0,5],[0,7],[0,10],[0,11],
        [1,5],[1,7],[1,8],[1,9],
        [2,3],[2,4],[2,6],[2,10],[2,11],
        [3,4],[3,6],[3,8],[3,9],
        [4,5],[4,9],[4,11],
        [5,9],[5,11],
        [6,7],[6,8],[6,10],
        [7,8],[7,10],
        [8,9],[10,11],
    ];

    function syncCanvasSize() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
    }

    function draw(elapsedMs) {
        if (!ctx || !canvas) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const time = elapsedMs * 0.001;
        const cx = W * 0.5;
        const cy = H * 0.46;
        // 3x: 元 0.32 → 0.96。投影で *0.67 されるので実視半径は約 min(W,H)*0.64
        const radius = Math.min(W, H) * 0.96;

        const rotX = time * 0.3;
        const rotY = time * 0.5;
        const rotZ = time * 0.2;
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

        const projected = new Array(VERTS.length);
        for (let i = 0; i < VERTS.length; i++) {
            let [px, py, pz] = VERTS[i];
            // X
            let yy = py * cosX - pz * sinX;
            let zz = py * sinX + pz * cosX;
            py = yy; pz = zz;
            // Y
            let xx = px * cosY + pz * sinY;
            zz = -px * sinY + pz * cosY;
            px = xx; pz = zz;
            // Z
            xx = px * cosZ - py * sinZ;
            yy = px * sinZ + py * cosZ;
            px = xx; py = yy;

            const scale = 1 / (2 - pz * 0.5);
            projected[i] = [cx + px * radius * scale, cy + py * radius * scale, pz];
        }

        const sorted = EDGES.map(([a, b]) => {
            const p1 = projected[a];
            const p2 = projected[b];
            return { p1, p2, z: (p1[2] + p2[2]) * 0.5 };
        }).sort((a, b) => a.z - b.z);

        // 辺
        for (const { p1, p2, z } of sorted) {
            const depth = (z + 1) * 0.5; // 0..1
            const alpha = 0.08 + depth * 0.18;
            ctx.strokeStyle = `rgba(20, 22, 30, ${alpha})`;
            ctx.lineWidth = 1 + depth * 1.0;
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.stroke();
        }

        // 頂点
        for (const p of projected) {
            const depth = (p[2] + 1) * 0.5;
            const alpha = 0.10 + depth * 0.20;
            const size = 1.5 + depth * 2.5;
            ctx.fillStyle = `rgba(30, 30, 45, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p[0], p[1], size, 0, Math.PI * 2);
            ctx.fill();
        }
        // 外周装飾リングは削除 (多面体だけ表示)
    }

    function loop() {
        if (!ctx) return;
        draw(performance.now() - startTs);
        rafId = requestAnimationFrame(loop);
    }

    const HomeBackdrop = {
        mount(canvasEl) {
            this.unmount();
            if (!canvasEl) return;
            canvas = canvasEl;
            ctx = canvas.getContext('2d');
            if (!ctx) { canvas = null; return; }
            startTs = performance.now();
            syncCanvasSize();
            onResize = () => syncCanvasSize();
            window.addEventListener('resize', onResize);
            rafId = requestAnimationFrame(loop);
        },
        unmount() {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            if (onResize) {
                window.removeEventListener('resize', onResize);
                onResize = null;
            }
            canvas = null;
            ctx = null;
        },
    };

    window.HomeBackdrop = HomeBackdrop;
})();
