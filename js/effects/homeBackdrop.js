/* ============================================================
   effects/homeBackdrop.js — ホーム背景の回転正二十面体
   ------------------------------------------------------------
   要件:
     1. 正二十面体 (12 頂点 / 30 辺)
     2. 頂点にドット
     3. 3D で回転
     4. 最も軽い方法で

   実装方針 (canvas / rAF / SVG 全て不採用):
     - 頂点 12 個と辺 30 本を <div> として 1 度だけ生成し、
       CSS の transform: translate3d / rotateY / rotateZ で 3D 配置。
     - 全体を transform-style: preserve-3d な親 (rotor) に入れ、
       CSS @keyframes で rotateX/Y/Z を回す。
     - 描画は GPU compositor が単一 3D マトリックスを各 div に適用するだけで、
       JS 側の処理は mount 時の 1 回のみ。事実上ゼロコスト。
   ============================================================ */
(function () {
    'use strict';

    // 正二十面体の頂点 / 辺 (黄金比ベース、単位球面に正規化)
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

    // 半径 (ホーム画面の game canvas は 1080×1920 想定。500px 前後で見栄え良し)
    const RADIUS = 460;
    const RAD2DEG = 180 / Math.PI;

    function build() {
        const stage = document.createElement('div');
        stage.className = 'home-bg-poly-stage';
        stage.setAttribute('aria-hidden', 'true');

        const rotor = document.createElement('div');
        rotor.className = 'home-bg-poly-rotor';
        stage.appendChild(rotor);

        // --- 頂点 (12 個) ---
        for (let i = 0; i < VERTS.length; i++) {
            const [vx, vy, vz] = VERTS[i];
            const x = (vx * RADIUS).toFixed(2);
            const y = (vy * RADIUS).toFixed(2);
            const z = (vz * RADIUS).toFixed(2);
            const dot = document.createElement('div');
            dot.className = 'home-bg-poly-dot';
            // translate(-50%,-50%) で element 中心を起点に。translate3d で 3D 位置へ。
            dot.style.transform =
                `translate3d(${x}px, ${y}px, ${z}px) translate(-50%, -50%)`;
            rotor.appendChild(dot);
        }

        // --- 辺 (30 本) ---
        // div を 横長矩形 (length × 太さ) として作り、中点に置いて、
        // 「local +X 方向 = 辺の方向」 となるよう rotateY / rotateZ を計算する。
        for (const [ai, bi] of EDGES) {
            const A = VERTS[ai], B = VERTS[bi];
            const dx = (B[0] - A[0]) * RADIUS;
            const dy = (B[1] - A[1]) * RADIUS;
            const dz = (B[2] - A[2]) * RADIUS;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const mx = (A[0] + B[0]) * 0.5 * RADIUS;
            const my = (A[1] + B[1]) * 0.5 * RADIUS;
            const mz = (A[2] + B[2]) * 0.5 * RADIUS;
            const ux = dx / len, uy = dy / len, uz = dz / len;

            // local +X (1,0,0) を (ux,uy,uz) に向ける 2 段階回転:
            //   step1: rotateZ(β) で +X を XY 平面内で角度 β 持ち上げる → (cosβ, sinβ, 0)
            //   step2: rotateY(α) で Y 軸まわりに α だけ回す → (cosβ cosα, sinβ, -cosβ sinα)
            //   求める方向に一致するには β = asin(uy), α = atan2(-uz, ux)
            const beta  = Math.asin(uy);
            const alpha = Math.atan2(-uz, ux);
            const aDeg = (alpha * RAD2DEG).toFixed(2);
            const bDeg = (beta  * RAD2DEG).toFixed(2);

            const edge = document.createElement('div');
            edge.className = 'home-bg-poly-edge';
            edge.style.width = `${len.toFixed(2)}px`;
            // 順序 (CSS 右→左で適用): translate(-50%,-50%) → rotateZ → rotateY → translate3d
            edge.style.transform =
                `translate3d(${mx.toFixed(2)}px, ${my.toFixed(2)}px, ${mz.toFixed(2)}px) ` +
                `rotateY(${aDeg}deg) rotateZ(${bDeg}deg) translate(-50%, -50%)`;
            rotor.appendChild(edge);
        }

        return stage;
    }

    let mountedRoot = null;

    const HomeBackdrop = {
        // 旧 API (canvas 要素を引数) 互換: 渡された要素は削除して SVG に置換。
        mount(targetEl) {
            this.unmount();
            let parent = null;
            if (targetEl && targetEl.parentNode) {
                parent = targetEl.parentNode;
                parent.removeChild(targetEl);
            } else {
                parent = document.querySelector('.home-screen');
            }
            if (!parent) return;
            mountedRoot = build();
            // 背景レイヤとして 一番先頭 に挿入 (z-index は CSS 側で -1)
            parent.insertBefore(mountedRoot, parent.firstChild);
        },
        unmount() {
            if (mountedRoot && mountedRoot.parentNode) {
                mountedRoot.parentNode.removeChild(mountedRoot);
            }
            mountedRoot = null;
        },
    };

    window.HomeBackdrop = HomeBackdrop;
})();
