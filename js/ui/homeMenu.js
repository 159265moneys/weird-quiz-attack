/* ============================================================
   homeMenu.js — ホーム (= ステージ選択画面) 用ハンバーガーメニュー
   ------------------------------------------------------------
   ステージ選択画面が実質ホームなので、右上ハンバーガーから
     - SOUND   (音量/ミュート = 既存 Settings パネル)
     - SCORES  (各ステージのベストスコア/ランク一覧)
     - RESET   (進捗リセット: 2 段確認)
     - ABOUT   (バージョン/クレジット)
   を開けるようにする。モーダルは settings と同じ系統で統一。
   ============================================================ */

(function () {
    let menuOverlay  = null;
    let scoreOverlay = null;
    let aboutOverlay = null;
    let menuOpen = false;

    // ---------- Lucide 風 SVG (MIT) ----------
    const ICONS = {
        volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
        trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        reset:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>`,
        info:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        chevron:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        close:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        menu:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6"  x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    };

    // ---------- メインメニュー ----------
    function ensureMenuDom() {
        if (menuOverlay) return menuOverlay;
        menuOverlay = document.createElement('div');
        menuOverlay.className = 'hm-overlay';
        menuOverlay.innerHTML = `
            <div class="hm-panel" role="dialog" aria-label="メニュー">
                <div class="hm-head">
                    <div class="hm-title">MENU</div>
                    <button class="hm-close" aria-label="閉じる">${ICONS.close}</button>
                </div>
                <ul class="hm-list">
                    <li><button class="hm-item" data-act="sound">
                        <span class="hm-ic">${ICONS.volume}</span>
                        <span class="hm-lbl"><span class="hm-lbl-main">SOUND</span><span class="hm-lbl-sub">音量・ミュート</span></span>
                        <span class="hm-chv">${ICONS.chevron}</span>
                    </button></li>
                    <li><button class="hm-item" data-act="scores">
                        <span class="hm-ic">${ICONS.trophy}</span>
                        <span class="hm-lbl"><span class="hm-lbl-main">SCORES</span><span class="hm-lbl-sub">ステージ別ベスト</span></span>
                        <span class="hm-chv">${ICONS.chevron}</span>
                    </button></li>
                    <li><button class="hm-item" data-act="reset">
                        <span class="hm-ic">${ICONS.reset}</span>
                        <span class="hm-lbl"><span class="hm-lbl-main">RESET</span><span class="hm-lbl-sub">進捗をリセット</span></span>
                        <span class="hm-chv">${ICONS.chevron}</span>
                    </button></li>
                    <li><button class="hm-item" data-act="about">
                        <span class="hm-ic">${ICONS.info}</span>
                        <span class="hm-lbl"><span class="hm-lbl-main">ABOUT</span><span class="hm-lbl-sub">バージョン / クレジット</span></span>
                        <span class="hm-chv">${ICONS.chevron}</span>
                    </button></li>
                </ul>
                <div class="hm-foot">v${window.CONFIG.VERSION}</div>
            </div>
        `;
        document.body.appendChild(menuOverlay);

        // ※ パネル外タップで閉じる挙動は意図的に無効化。誤タップ防止のため ✕ 必須。
        menuOverlay.querySelector('.hm-close').addEventListener('click', () => {
            window.SE?.fire?.('cancel');
            closeMenu();
        });

        menuOverlay.querySelectorAll('.hm-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                const act = btn.dataset.act;
                window.SE?.fire?.('menuCursor');
                if (act === 'sound') {
                    closeMenu();
                    setTimeout(() => window.Settings?.open?.(), 120);
                } else if (act === 'scores') {
                    closeMenu();
                    setTimeout(openScores, 120);
                } else if (act === 'reset') {
                    openResetConfirm();
                } else if (act === 'about') {
                    closeMenu();
                    setTimeout(openAbout, 120);
                }
            });
        });

        return menuOverlay;
    }

    function openMenu() {
        if (menuOpen) return;
        ensureMenuDom();
        menuOverlay.classList.add('is-open');
        menuOpen = true;
        window.SE?.fire?.('confirm');
    }

    function closeMenu() {
        if (!menuOpen || !menuOverlay) return;
        menuOverlay.classList.remove('is-open');
        menuOpen = false;
    }

    // ---------- SCORES パネル ----------
    function buildScoresHTML() {
        const stages = window.CONFIG.STAGES;
        const rows = stages.map((s) => {
            const sc = window.Save?.getStageScore?.(s.no);
            const unlocked = window.Save?.isStageUnlocked?.(s.no) ?? (s.no === 1);
            let body;
            if (!unlocked) {
                body = `<span class="hm-sc-lock">LOCKED</span>`;
            } else if (!sc || !sc.best) {
                body = `<span class="hm-sc-none">— NO CLEAR —</span>`;
            } else {
                const rank = sc.bestRank || '?';
                const accent = window.Ranks?.accentColorVar?.(rank) || 'var(--accent-cyan)';
                body = `
                    <span class="hm-sc-rank rank-${rank}" style="--rank-accent:${accent};">${rank}</span>
                    <span class="hm-sc-score">${(sc.best||0).toLocaleString()}</span>
                    <span class="hm-sc-plays">×${sc.plays||0}</span>
                `;
            }
            return `
                <div class="hm-sc-row">
                    <div class="hm-sc-no">${String(s.no).padStart(2,'0')}</div>
                    <div class="hm-sc-name">${s.name}</div>
                    <div class="hm-sc-body">${body}</div>
                </div>
            `;
        }).join('');

        const totalPlays = stages.reduce((a,s) => a + (window.Save?.getStageScore?.(s.no)?.plays||0), 0);
        const cleared = (window.Save?.data?.progress?.clearedStages || []).length;

        return `
            <div class="hm-panel hm-panel-wide" role="dialog" aria-label="SCORES">
                <div class="hm-head">
                    <div class="hm-title">SCORES</div>
                    <button class="hm-close" aria-label="閉じる">${ICONS.close}</button>
                </div>
                <div class="hm-sc-summary">
                    <div><span class="hm-sc-sum-lbl">CLEARED</span><span class="hm-sc-sum-val">${cleared}/10</span></div>
                    <div><span class="hm-sc-sum-lbl">PLAYS</span><span class="hm-sc-sum-val">${totalPlays}</span></div>
                </div>
                <div class="hm-sc-list">${rows}</div>
            </div>
        `;
    }

    function openScores() {
        if (!scoreOverlay) {
            scoreOverlay = document.createElement('div');
            scoreOverlay.className = 'hm-overlay';
            document.body.appendChild(scoreOverlay);
            // ※ パネル外タップで閉じる挙動は意図的に無効化 (誤タップ防止)
        }
        scoreOverlay.innerHTML = buildScoresHTML();
        scoreOverlay.classList.add('is-open');
        scoreOverlay.querySelector('.hm-close').addEventListener('click', () => {
            window.SE?.fire?.('cancel');
            closeScores();
        });
        window.SE?.fire?.('confirm');
    }

    function closeScores() {
        if (scoreOverlay) scoreOverlay.classList.remove('is-open');
    }

    // ---------- ABOUT パネル ----------
    function buildAboutHTML() {
        const ver = window.CONFIG?.VERSION || '?';
        return `
            <div class="hm-panel" role="dialog" aria-label="ABOUT">
                <div class="hm-head">
                    <div class="hm-title">ABOUT</div>
                    <button class="hm-close" aria-label="閉じる">${ICONS.close}</button>
                </div>
                <div class="hm-about">
                    <div class="hm-about-logo">変なクイズ</div>
                    <div class="hm-about-sub">WEIRD QUIZ ATTACK</div>
                    <div class="hm-about-ver">v${ver}</div>
                    <p class="hm-about-desc">
                        UI が崩壊していく中で正解を掴むスコアアタック型クイズ。<br>
                        世界観: モノクロ + シアン/レッド の VHS 風ディストピア。
                    </p>
                    <div class="hm-about-credit">
                        Icons: Lucide (MIT)<br>
                    </div>
                </div>
            </div>
        `;
    }

    function openAbout() {
        if (!aboutOverlay) {
            aboutOverlay = document.createElement('div');
            aboutOverlay.className = 'hm-overlay';
            document.body.appendChild(aboutOverlay);
            // ※ パネル外タップで閉じる挙動は意図的に無効化 (誤タップ防止)
        }
        aboutOverlay.innerHTML = buildAboutHTML();
        aboutOverlay.classList.add('is-open');
        aboutOverlay.querySelector('.hm-close').addEventListener('click', () => {
            window.SE?.fire?.('cancel');
            closeAbout();
        });
        window.SE?.fire?.('confirm');
    }

    function closeAbout() {
        if (aboutOverlay) aboutOverlay.classList.remove('is-open');
    }

    // ---------- RESET 確認 (2 段) ----------
    function openResetConfirm() {
        const ok = confirm('すべての進捗 (クリア状況 / ベストスコア / プレイ回数) をリセットします。本当に良いですか？');
        if (!ok) return;
        const ok2 = confirm('本当にリセットします。この操作は取り消せません。');
        if (!ok2) return;
        try {
            // 設定 (音量/ミュート) は保持して進捗だけ消す
            const settings = window.Save?.getSettings?.();
            window.Save?.reset?.();
            if (settings) {
                Object.keys(settings).forEach(k => window.Save?.setSetting?.(k, settings[k]));
            }
            window.SE?.fire?.('confirm');
            closeMenu();
            // stageSelect を再描画して反映
            setTimeout(() => window.Router?.reload?.(), 150);
        } catch (e) {
            console.error('[HomeMenu] reset failed:', e);
            alert('リセットに失敗しました。');
        }
    }

    // ---------- ハンバーガー トリガー (stageSelect 右上に貼る) ----------
    function mountTrigger(host) {
        if (!host) return;
        if (host.querySelector('.hm-trigger')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hm-trigger';
        btn.setAttribute('aria-label', 'メニュー');
        btn.innerHTML = ICONS.menu;
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            window.SE?.fire?.('menuCursor');
            openMenu();
        });
        btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        host.appendChild(btn);
    }

    window.HomeMenu = {
        open: openMenu,
        close: closeMenu,
        mountTrigger,
    };
})();
