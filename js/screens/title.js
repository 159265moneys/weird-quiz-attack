/* ============================================================
   title.js — タイトル画面 (tap to start 方式)
   ------------------------------------------------------------
   タイトル文字をタップ → ロゴがバラバラに崩れ落ちる
   蝶が画面下から羽ばたいて上空へ → stageSelect に遷移。
   世界観 (VHS + 蝶 + モノクロ+差し色) を維持したシンプル構成。
   ============================================================ */

(function () {
    const LOGO_TEXT = '変なクイズ';

    const Screen = {
        render() {
            // 背景に散らす浮遊文字 (英数字+記号)
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

            // ロゴ文字を 1 文字ずつ span で包む (崩壊時に個別に落下させるため)
            const logoChars = Array.from(LOGO_TEXT)
                .map((ch, i) => `<span class="tl-char" style="--idx:${i};">${ch}</span>`)
                .join('');

            return `
                <div class="screen title-screen" id="titleScreen">
                    <div class="title-floaters">${floaters}</div>

                    <div class="title-logo-wrap">
                        <div class="title-logo" id="titleLogo">${logoChars}</div>
                    </div>
                    <div class="title-sub">WEIRD QUIZ ATTACK</div>

                    <div class="title-tap" id="titleTap">
                        <div class="title-tap-text">TAP TO START</div>
                    </div>

                    <img class="title-butterfly" id="titleBfly"
                         src="sprite/butterfly.png" alt=""
                         onerror="this.style.display='none'">

                    <div class="title-footer">
                        <span>v${window.CONFIG.VERSION}</span>
                        <span>${window.Save.data?.player?.name || 'PLAYER'}</span>
                    </div>
                </div>
            `;
        },

        init() {
            const screen = document.getElementById('titleScreen');
            const logo   = document.getElementById('titleLogo');
            const tap    = document.getElementById('titleTap');
            const bfly   = document.getElementById('titleBfly');
            if (!screen) return;

            let transitioning = false;
            const onTap = (ev) => {
                if (transitioning) return;
                // フッター (5 タップでデバッグ起動) ではスタートさせない
                if (ev.target && ev.target.closest && ev.target.closest('.title-footer')) return;
                transitioning = true;
                screen.classList.add('is-leaving');

                // ロゴ文字を個別にバラバラに落とす
                if (logo) {
                    logo.querySelectorAll('.tl-char').forEach(el => {
                        const tx = (Math.random() - 0.5) * 280;
                        const ty = 600 + Math.random() * 400;
                        const rz = (Math.random() - 0.5) * 120;
                        el.style.setProperty('--tx', `${tx}px`);
                        el.style.setProperty('--ty', `${ty}px`);
                        el.style.setProperty('--rz', `${rz}deg`);
                        el.classList.add('is-shatter');
                    });
                }

                // TAP TO START を即フェード
                if (tap) tap.classList.add('is-gone');

                // 蝶を飛ばす: 下から湧いて中央→上空へ
                if (bfly) bfly.classList.add('is-flying');

                // ロゴ崩壊 + 蝶フライアウトに合わせて 1.2 秒後に遷移
                setTimeout(() => {
                    window.Router.show('stageSelect');
                }, 1200);
            };

            // 全面タップで発火 (ボタンより広い当たり判定)
            screen.addEventListener('pointerdown', onTap, { once: false });
        },
    };

    window.Screens.title = Screen;
})();
