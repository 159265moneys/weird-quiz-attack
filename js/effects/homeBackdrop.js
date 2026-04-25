/* ============================================================
   effects/homeBackdrop.js — ホーム背景の回転多面体 (1SEC 移植)
   ------------------------------------------------------------
   元ネタ: 1SEC の drawGeometricBackground (正二十面体ワイヤー)。
   配置: home-screen の z-index 最下層 (.home-bg-canvas 要素)。

   軽量化方針 (iOS WKWebView 落ち対策):
   - DPR を 1 にクランプ (mix-blend-mode 削除と合わせて GPU 負荷激減)
   - 30 fps に間引き (60 fps だと数秒で WebContent プロセスが落ちる端末あり)
   - per-frame 配列確保を廃止 (使い回し)
   - document.visibilityState / page hidden で rAF を完全停止
   ============================================================ */
(function () {
    'use strict';

    let canvas = null;
    let ctx = null;
    let rafId = 0;
    let startTs = 0;
    let lastDrawTs = 0;
    let onResize = null;
    let onVisibility = null;
    let mounted = false;

    // 描画間隔 (ms)。30 fps ≒ 33ms。多面体の回転速度自体が遅いので
    // 30fps でも視覚的にカクつかない。
    const FRAME_INTERVAL_MS = 33;

    // 正二十面体の頂点 / 辺
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

    // 投影結果と sort 用バッファを使い回す (毎フレーム new しない)
    const PROJECTED = new Float32Array(VERTS.length * 3); // x,y,z * N
    const SORT_BUF = EDGES.map(() => ({ a: 0, b: 0, z: 0 }));

    function syncCanvasSize() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        // DPR=1 で十分。線が細くて気になる場合は CSS の opacity で馴染ませる。
        const dpr = 1;
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
        const radius = Math.min(W, H) * 0.96;

        const rotX = time * 0.3;
        const rotY = time * 0.5;
        const rotZ = time * 0.2;
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

        for (let i = 0; i < VERTS.length; i++) {
            let px = VERTS[i][0], py = VERTS[i][1], pz = VERTS[i][2];
            // X 軸回転
            let yy = py * cosX - pz * sinX;
            let zz = py * sinX + pz * cosX;
            py = yy; pz = zz;
            // Y 軸回転
            let xx = px * cosY + pz * sinY;
            zz = -px * sinY + pz * cosY;
            px = xx; pz = zz;
            // Z 軸回転
            xx = px * cosZ - py * sinZ;
            yy = px * sinZ + py * cosZ;
            px = xx; py = yy;

            const scale = 1 / (2 - pz * 0.5);
            const off = i * 3;
            PROJECTED[off    ] = cx + px * radius * scale;
            PROJECTED[off + 1] = cy + py * radius * scale;
            PROJECTED[off + 2] = pz;
        }

        // 辺の z 平均で奥→手前にソート (使い回しバッファ)
        for (let i = 0; i < EDGES.length; i++) {
            const e = EDGES[i];
            const za = PROJECTED[e[0] * 3 + 2];
            const zb = PROJECTED[e[1] * 3 + 2];
            const buf = SORT_BUF[i];
            buf.a = e[0]; buf.b = e[1];
            buf.z = (za + zb) * 0.5;
        }
        SORT_BUF.sort((a, b) => a.z - b.z);

        // 辺
        for (let i = 0; i < SORT_BUF.length; i++) {
            const buf = SORT_BUF[i];
            const a3 = buf.a * 3, b3 = buf.b * 3;
            const depth = (buf.z + 1) * 0.5;
            const alpha = 0.10 + depth * 0.22;
            ctx.strokeStyle = 'rgba(20, 22, 30, ' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1 + depth * 1.0;
            ctx.beginPath();
            ctx.moveTo(PROJECTED[a3], PROJECTED[a3 + 1]);
            ctx.lineTo(PROJECTED[b3], PROJECTED[b3 + 1]);
            ctx.stroke();
        }

        // 頂点
        for (let i = 0; i < VERTS.length; i++) {
            const off = i * 3;
            const z = PROJECTED[off + 2];
            const depth = (z + 1) * 0.5;
            const alpha = 0.12 + depth * 0.22;
            const size = 1.5 + depth * 2.5;
            ctx.fillStyle = 'rgba(30, 30, 45, ' + alpha.toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(PROJECTED[off], PROJECTED[off + 1], size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function loop(now) {
        if (!mounted) return;
        // 30fps 間引き。requestAnimationFrame は 60fps で回るので
        // 1 フレームおきに draw する。
        if (now - lastDrawTs >= FRAME_INTERVAL_MS) {
            lastDrawTs = now;
            draw(now - startTs);
        }
        rafId = requestAnimationFrame(loop);
    }

    function startLoop() {
        if (!mounted || rafId) return;
        lastDrawTs = 0;
        rafId = requestAnimationFrame(loop);
    }
    function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
    }

    const HomeBackdrop = {
        mount(canvasEl) {
            this.unmount();
            if (!canvasEl) return;
            canvas = canvasEl;
            ctx = canvas.getContext('2d', { alpha: true });
            if (!ctx) { canvas = null; return; }
            mounted = true;
            startTs = performance.now();
            syncCanvasSize();

            onResize = () => syncCanvasSize();
            window.addEventListener('resize', onResize);

            // タブ非表示・アプリバックグラウンド時は rAF を完全停止する。
            // これを入れないとバックグラウンドでも 60fps で回り続け、復帰時の
            // GPU バッファ溢れで落ちる端末がある。
            onVisibility = () => {
                if (document.hidden) stopLoop();
                else startLoop();
            };
            document.addEventListener('visibilitychange', onVisibility);

            startLoop();
        },
        unmount() {
            mounted = false;
            stopLoop();
            if (onResize) {
                window.removeEventListener('resize', onResize);
                onResize = null;
            }
            if (onVisibility) {
                document.removeEventListener('visibilitychange', onVisibility);
                onVisibility = null;
            }
            canvas = null;
            ctx = null;
        },
    };

    window.HomeBackdrop = HomeBackdrop;
})();
