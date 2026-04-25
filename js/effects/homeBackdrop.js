/* ============================================================
   effects/homeBackdrop.js — ホーム背景の回転多面体
   ------------------------------------------------------------
   旧実装: <canvas> + requestAnimationFrame で正二十面体を毎フレーム
           3D 回転 → 投影 → 2D 描画していたが、iOS WKWebView では
           VHS / FloatingText / キャラ呼吸アニメ 等と重なって GPU 負荷が
           上限に達し、放置 5〜10 秒で WebContent が落ちる事例が継続。

   新実装: 1 度だけ正二十面体を投影してから静的 SVG を生成し、CSS の
           @keyframes で SVG 自体をゆっくり回転させる方式に切り替え。
           - rAF / canvas / ctx 一切なし
           - 描画は GPU の compositor 処理のみ (transform layer 1 枚)
           - mount/unmount で DOM に挿入/削除するだけ
           絶対に GPU バッファを溢れさせないことを最優先にした設計。
   ============================================================ */
(function () {
    'use strict';

    // --- 正二十面体ジオメトリ (元実装と同一データ) ---
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

    // 投影に使う固定回転 (viewBox -1..1 内に収まる "見栄えのする" 角度)。
    // 純粋な真上/真横だと薄っぺらく見えるので少し傾けてある。
    const VIEW_ROT = { x: 0.45, y: 0.85, z: 0.15 };

    function projectStaticVerts() {
        const cosX = Math.cos(VIEW_ROT.x), sinX = Math.sin(VIEW_ROT.x);
        const cosY = Math.cos(VIEW_ROT.y), sinY = Math.sin(VIEW_ROT.y);
        const cosZ = Math.cos(VIEW_ROT.z), sinZ = Math.sin(VIEW_ROT.z);
        return VERTS.map(([px0, py0, pz0]) => {
            let px = px0, py = py0, pz = pz0;
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
            return [px * scale, py * scale, pz];
        });
    }

    function buildSvg() {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const projected = projectStaticVerts();

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'home-bg-poly');
        // viewBox は -1.6..1.6 で十分余白を取って中央配置
        svg.setAttribute('viewBox', '-1.6 -1.6 3.2 3.2');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('aria-hidden', 'true');

        // 辺は z で奥→手前にソート (奥は薄く、手前は濃く)
        const edges = EDGES.map(([a, b]) => {
            const p1 = projected[a];
            const p2 = projected[b];
            return { p1, p2, z: (p1[2] + p2[2]) * 0.5 };
        }).sort((a, b) => a.z - b.z);

        for (const { p1, p2, z } of edges) {
            const depth = (z + 1) * 0.5; // 0..1
            const alpha = (0.10 + depth * 0.22).toFixed(3);
            const sw = (0.012 + depth * 0.014).toFixed(4);
            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', p1[0].toFixed(4));
            line.setAttribute('y1', p1[1].toFixed(4));
            line.setAttribute('x2', p2[0].toFixed(4));
            line.setAttribute('y2', p2[1].toFixed(4));
            line.setAttribute('stroke', `rgba(20, 22, 30, ${alpha})`);
            line.setAttribute('stroke-width', sw);
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);
        }

        // 頂点 (奥は小さめ薄め、手前は大きめ濃いめ)
        for (const p of projected) {
            const depth = (p[2] + 1) * 0.5;
            const alpha = (0.12 + depth * 0.22).toFixed(3);
            const r = (0.018 + depth * 0.022).toFixed(4);
            const c = document.createElementNS(SVG_NS, 'circle');
            c.setAttribute('cx', p[0].toFixed(4));
            c.setAttribute('cy', p[1].toFixed(4));
            c.setAttribute('r', r);
            c.setAttribute('fill', `rgba(30, 30, 45, ${alpha})`);
            svg.appendChild(c);
        }

        return svg;
    }

    let mountedSvg = null;

    const HomeBackdrop = {
        // 旧 API は canvas 要素を引数に受け取っていた。互換のため引数は受けるが、
        // 中身は SVG 差し替えに変更。受け取った要素は SVG に置換 or 削除する。
        mount(targetEl) {
            this.unmount();
            // home.js の render() が <canvas class="home-bg-canvas"> を埋め込んでいる。
            // canvas 自体は完全不要なので親に空 SVG を挿し直す。
            let parent = null;
            if (targetEl && targetEl.parentNode) {
                parent = targetEl.parentNode;
                parent.removeChild(targetEl);
            } else {
                parent = document.querySelector('.home-screen');
            }
            if (!parent) return;
            mountedSvg = buildSvg();
            // 背景レイヤとして 一番先頭 に挿入 (z-index は CSS 側で -1)
            parent.insertBefore(mountedSvg, parent.firstChild);
        },
        unmount() {
            if (mountedSvg && mountedSvg.parentNode) {
                mountedSvg.parentNode.removeChild(mountedSvg);
            }
            mountedSvg = null;
        },
    };

    window.HomeBackdrop = HomeBackdrop;
})();
