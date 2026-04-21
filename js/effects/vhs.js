/* ============================================================
   effects/vhs.js — VHS風グリッチ演出 (3SEC 踏襲)
   ------------------------------------------------------------
   常時の静的ノイズ (CSS側の scanline) に加え、JS で
     - 画面全体の横ズレ (tear)
     - RGBチャンネルシフト (chromatic aberration)
   をランダムタイミングでバースト発生させる。
   常時回すのではなく数十秒〜1分に一度の突発演出にすることで、
   UI の読みやすさを保ちつつ "壊れたテレビ感" を出す。
   ============================================================ */

(function () {
    const SHOW_ON = new Set(['title', 'stageSelect', 'result']);

    // タイミング設定 (ms)
    const MIN_INTERVAL = 12000;
    const MAX_INTERVAL = 28000;

    let overlay = null;
    let scheduled = 0;
    let stageEl = null;

    function mount() {
        if (overlay) return;
        stageEl = document.getElementById('stage');
        if (!stageEl) return;

        overlay = document.createElement('div');
        overlay.className = 'fx-vhs-overlay';
        overlay.innerHTML = `
            <div class="fx-vhs-scanlines"></div>
            <div class="fx-vhs-glow"></div>
        `;
        stageEl.appendChild(overlay);
        schedule();
    }

    function unmount() {
        clearTimeout(scheduled);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        stageEl = null;
    }

    function schedule() {
        const wait = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
        scheduled = setTimeout(burst, wait);
    }

    function burst() {
        if (!overlay || !stageEl || !isEnabled()) {
            schedule();
            return;
        }
        // ランダムに "tear" / "rgb" / "both" を抽選
        const kind = Math.random();
        if (kind < 0.45)       applyTear();
        else if (kind < 0.8)   applyRgb();
        else                   applyBoth();
        schedule();
    }

    function applyTear() {
        if (!stageEl) return;
        stageEl.classList.add('fx-vhs-tearing');
        setTimeout(() => stageEl?.classList.remove('fx-vhs-tearing'), 260);
    }
    function applyRgb() {
        if (!stageEl) return;
        stageEl.classList.add('fx-vhs-rgb');
        setTimeout(() => stageEl?.classList.remove('fx-vhs-rgb'), 340);
    }
    function applyBoth() {
        applyTear();
        applyRgb();
    }

    function isEnabled() {
        const name = document.body.dataset.screen;
        return SHOW_ON.has(name);
    }

    function onScreenChange(name) {
        if (!overlay) return;
        overlay.classList.toggle('is-hidden', !SHOW_ON.has(name));
    }

    window.VhsFX = { mount, unmount, onScreenChange };
})();
