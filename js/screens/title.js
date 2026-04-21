/* ============================================================
   title.js — タイトル画面
   ============================================================ */

(function () {
    const Screen = {
        render() {
            // 浮遊文字 (3SEC風): 英数字・記号をランダムに散らす
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!?*+=/\\'.split('');
            const floaters = Array.from({ length: 28 }, () => {
                const c = chars[Math.floor(Math.random() * chars.length)];
                const top = Math.floor(Math.random() * 96);
                const left = Math.floor(Math.random() * 96);
                const delay = (Math.random() * 18).toFixed(1);
                const size = 24 + Math.floor(Math.random() * 28);
                const op = (0.2 + Math.random() * 0.25).toFixed(2);
                return `<span style="top:${top}%;left:${left}%;font-size:${size}px;opacity:${op};animation-delay:${delay}s;">${c}</span>`;
            }).join('');

            return `
                <div class="screen title-screen">
                    <div class="title-floaters">${floaters}</div>
                    <div class="title-logo">変なクイズ</div>
                    <div class="title-sub">WEIRD QUIZ ATTACK</div>

                    <div class="title-menu">
                        <button class="menu-item" data-action="start">
                            <img src="sprite/butterfly.png" class="butterfly" alt="">
                            <span>START</span>
                        </button>
                        <button class="menu-item" data-action="records">
                            <img src="sprite/butterfly.png" class="butterfly" alt="">
                            <span>RECORDS</span>
                        </button>
                        <button class="menu-item" data-action="settings">
                            <img src="sprite/butterfly.png" class="butterfly" alt="">
                            <span>SETTINGS</span>
                        </button>
                    </div>

                    <img class="title-navigator" src="sprite/girl/basic.png" alt="" onerror="this.style.display='none'">

                    <div class="title-footer">
                        <span>v${window.CONFIG.VERSION}</span>
                        <span>${window.Save.data?.player?.name || 'PLAYER'}</span>
                    </div>
                </div>
            `;
        },

        init() {
            const items = document.querySelectorAll('.menu-item');
            // デフォルトでSTARTをハイライト
            items[0]?.classList.add('is-active');

            items.forEach((el) => {
                el.addEventListener('click', () => {
                    const action = el.dataset.action;
                    if (action === 'start') {
                        window.Router.show('stageSelect');
                    } else if (action === 'records') {
                        alert('RECORDS画面は Phase 6 で実装予定です。');
                    } else if (action === 'settings') {
                        alert('SETTINGS画面は Phase 7 で実装予定です。');
                    }
                });
                el.addEventListener('pointerenter', () => {
                    items.forEach(i => i.classList.remove('is-active'));
                    el.classList.add('is-active');
                });
            });
        },
    };

    window.Screens.title = Screen;
})();
