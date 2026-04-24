/* ============================================================
   tabBar.js — 画面下部 5タブ ボトムナビ
   ------------------------------------------------------------
   左から: ACCOUNT / STAGE / HOME / RANKING / SCORES
     - ACCOUNT  : Router.show('profile')
     - STAGE    : Router.show('stageSelect')
     - HOME     : Router.show('home')
     - RANKING  : Router.show('ranking')
     - SCORES   : Router.show('scores')
   Phase 3b ですべてフルスクリーンタブ化完了。

   アイコン: Material Symbols (Outlined, Apache 2.0 / Google)
     sprite/icons/tabs/*.svg を <img> で参照。
     選択時 cyan 発光は CSS filter で実現。

   DOM 構造 (2026-04 更新: position:fixed 化):
     body
       #stage           (1080x1920 canvas, transform:scale(--scale))
         #app           (Router.show が innerHTML 差替)
       .tabbar          (TabBar.mount でここに挿入。position:fixed
                         でビューポート下端にアンカー、safe-area 吸収)
     TabBar は #stage の外に居るのでキャンバスの scale 変換を受けず、
     iPhone 15 等のアスペクト比が 9:16 より縦長でもビューポート下端
     に張り付く。iOS UITabBar と同じレイアウトモデル。
     画面遷移で TabBar DOM は生き残り、active 状態だけ更新される。
   ============================================================ */

(function () {
    const TABS = [
        { id: 'account',     label: 'ACCOUNT', icon: 'person.svg' },
        { id: 'stageSelect', label: 'STAGE',   icon: 'grid_view.svg' },
        { id: 'home',        label: 'HOME',    icon: 'home.svg' },
        { id: 'ranking',     label: 'RANKING', icon: 'leaderboard.svg' },
        { id: 'scores',      label: 'SCORES',  icon: 'scoreboard.svg' },
    ];

    let barEl = null;

    function host() {
        // position:fixed は祖先の transform/filter/perspective があると
        // そのボックスを基準にしてしまい viewport 固定が壊れる。
        // body 直下に置けば body の position:fixed (top/left/right/bottom:0)
        // もビューポート基準なので、TabBar は常にビューポート下端に張り付く。
        return document.body;
    }

    function render(activeId) {
        return TABS.map(t => `
            <button type="button"
                    class="tabbar-btn ${t.id === activeId ? 'is-active' : ''}"
                    data-tab="${t.id}"
                    aria-label="${t.label}"
                    aria-selected="${t.id === activeId ? 'true' : 'false'}">
                <span class="tabbar-ic"><img src="sprite/icons/tabs/${t.icon}" alt=""></span>
                <span class="tabbar-lbl">${t.label}</span>
            </button>
        `).join('');
    }

    function mount(activeId) {
        if (!barEl) {
            barEl = document.createElement('nav');
            barEl.className = 'tabbar';
            barEl.setAttribute('role', 'tablist');
            host().appendChild(barEl);
            barEl.addEventListener('click', onClick);
            // スクロール発火防止 (タブのタップで誤発火しないよう)
            barEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        }
        barEl.dataset.active = activeId || '';
        barEl.innerHTML = render(activeId);
        document.body.classList.add('has-tabbar');
        document.body.dataset.tabActive = activeId || '';
    }

    function unmount() {
        if (barEl) {
            barEl.remove();
            barEl = null;
        }
        document.body.classList.remove('has-tabbar');
        delete document.body.dataset.tabActive;
    }

    function onClick(ev) {
        const btn = ev.target.closest('.tabbar-btn');
        if (!btn) return;
        const id = btn.dataset.tab;
        const active = barEl?.dataset.active;
        if (id === active) return;  // 同タブ再タップは無視

        window.SE?.fire?.('menuCursor');

        // ACCOUNT タブ → profile 画面 (id と screen 名を対応させるためマップ)
        const screenName = (id === 'account') ? 'profile' : id;
        window.Router?.show?.(screenName);
    }

    window.TabBar = {
        mount,
        unmount,
        // 画面側で "今アクティブなタブ" を更新したい時用
        setActive(id) {
            if (!barEl) return;
            barEl.dataset.active = id || '';
            barEl.querySelectorAll('.tabbar-btn').forEach(b => {
                const on = b.dataset.tab === id;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            document.body.dataset.tabActive = id || '';
        },
    };
})();
