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
                        <div class="title-tap-text">
                            <span class="tl-tap-char tl-tap-first" data-char="T"><img class="title-butterfly" id="titleBfly"
                                         src="sprite/butterfly.png" alt=""
                                         onerror="this.style.display='none'">T</span><span class="tl-tap-char" data-char="A">A</span><span class="tl-tap-char" data-char="P">P</span><span class="tl-tap-char tl-tap-space"> </span><span class="tl-tap-char" data-char="T">T</span><span class="tl-tap-char" data-char="O">O</span><span class="tl-tap-space"> </span><span class="tl-tap-char" data-char="S">S</span><span class="tl-tap-char" data-char="T">T</span><span class="tl-tap-char" data-char="A">A</span><span class="tl-tap-char" data-char="R">R</span><span class="tl-tap-char" data-char="T">T</span>
                        </div>
                    </div>

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

            // タイトル BGM を試行 (iOS autoplay ブロック時は初回タップで後追い)
            window.BGM?.play('title');

            // 設定はホーム (ステ選択) のハンバーガーメニューに集約したのでタイトルには置かない

            let transitioning = false;
            const onTap = (ev) => {
                if (transitioning) return;
                // フッター (5 タップでデバッグ起動) ではスタートさせない
                if (ev.target && ev.target.closest && ev.target.closest('.title-footer')) return;
                transitioning = true;
                screen.classList.add('is-leaving');

                // タイトル tap-to-start SE: PC電源断の "カッ" (b20_out で代用)
                window.SE?.fire('tapStart');

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

                // 蝶を screen 直下へ reparent してから tap を隠す。
                // tap に is-gone (opacity:0) を付けると子の蝶も巻き込まれて
                // 即消えるため、先に screen ルートへ移して opacity 汚染を回避。
                if (bfly && screen) {
                    const br = bfly.getBoundingClientRect();
                    const sr = screen.getBoundingClientRect();
                    const sc = sr.width > 0 ? sr.width / 1080 : 1;
                    bfly.style.position = 'absolute';
                    bfly.style.left     = Math.round((br.left - sr.left) / sc) + 'px';
                    bfly.style.top      = Math.round((br.top  - sr.top)  / sc) + 'px';
                    bfly.style.width    = '110px';
                    bfly.style.margin   = '0';
                    bfly.style.bottom   = 'auto';
                    screen.appendChild(bfly);
                }

                // TAP TO START を文字ごとにバラバラ崩壊
                if (tap) {
                    tap.querySelectorAll('.tl-tap-char').forEach((el, i) => {
                        const tx = (Math.random() - 0.5) * 320;
                        const ty = -(200 + Math.random() * 500);  // 上方向へ散る
                        const rz = (Math.random() - 0.5) * 160;
                        el.style.setProperty('--tx', `${tx}px`);
                        el.style.setProperty('--ty', `${ty}px`);
                        el.style.setProperty('--rz', `${rz}deg`);
                        el.style.animationDelay = `${i * 0.04}s`;
                        el.classList.add('is-shatter');
                    });
                    // アニメ完了後に非表示
                    setTimeout(() => { tap.style.visibility = 'hidden'; }, 1200);
                }

                // 蝶を右方向へ羽ばたかせて画面外へ (reparent 後に次フレームで発火)
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (bfly) bfly.classList.add('is-flying');
                }));

                // ロゴ崩壊 (1.2s) + 蝶フライアウト (1.6s) の長い方に合わせて遷移
                setTimeout(() => {
                    window.Router.show('stageSelect');
                }, 1600);
            };

            // 全面タップで発火 (ボタンより広い当たり判定)
            screen.addEventListener('pointerdown', onTap, { once: false });
        },
    };

    window.Screens.title = Screen;
})();
