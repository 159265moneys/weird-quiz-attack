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
    let menuOverlay    = null;
    let scoreOverlay   = null;
    let aboutOverlay   = null;
    let profileOverlay = null;
    let menuOpen = false;

    // ---------- Lucide 風 SVG (MIT) ----------
    const ICONS = {
        volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
        trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        reset:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>`,
        info:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        user:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        chevron:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        close:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        menu:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6"  x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
        ranking:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`,
    };

    function escapeHTML(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

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
                    <li><button class="hm-item" data-act="profile">
                        <span class="hm-ic">${ICONS.user}</span>
                        <span class="hm-lbl"><span class="hm-lbl-main">PROFILE</span><span class="hm-lbl-sub">プレイヤー ID / 名前</span></span>
                        <span class="hm-chv">${ICONS.chevron}</span>
                    </button></li>
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
                    <li><button class="hm-item" data-act="ranking">
                        <span class="hm-ic">${ICONS.ranking}</span>
                        <span class="hm-lbl"><span class="hm-lbl-main">RANKING</span><span class="hm-lbl-sub">オンライン TOP100</span></span>
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
                } else if (act === 'ranking') {
                    closeMenu();
                    setTimeout(() => window.Router?.show?.('ranking'), 120);
                } else if (act === 'profile') {
                    closeMenu();
                    setTimeout(openProfile, 120);
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

    // ---------- PROFILE パネル (プレイヤー ID / 名前 / アイコン編集) ----------
    function buildAvatarGridHTML(selectedId) {
        const items = window.Avatars?.getList?.() || [];
        // 先頭に "NONE" (アイコン未選択) 枠を固定で置く
        const cells = [
            `<button class="hm-pf-av ${!selectedId ? 'is-sel' : ''}" data-av-id="" type="button" aria-label="NONE">
                <span class="hm-pf-av-none">—</span>
            </button>`
        ];
        for (const it of items) {
            const path = window.Avatars?.pathOf?.(it.id) || `sprite/avatars/${encodeURIComponent(it.file)}`;
            const sel = it.id === selectedId ? 'is-sel' : '';
            const unlocked = window.Save?.isIconUnlocked?.(it.id) !== false;
            const lockCls = unlocked ? '' : 'is-locked';
            // ロック時はアイコン自体は見せつつ、鍵マークとグレーアウトで未解放を示す。
            // 獲得条件はゲーム内 popup/セリフから学ぶ設計なのでここでは明示しない。
            // 鍵アイコンは SVG (.cursor/rules/no-emoji.mdc: 絵文字不可)
            const lockBadge = unlocked ? '' : `<span class="hm-pf-av-lockbadge" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </span>`;
            cells.push(`
                <button class="hm-pf-av ${sel} ${lockCls}" data-av-id="${escapeHTML(it.id)}" data-locked="${unlocked ? '0' : '1'}" type="button" aria-label="${escapeHTML(it.label)}${unlocked ? '' : ' (未解放)'}">
                    <img src="${escapeHTML(path)}" alt="${escapeHTML(it.label)}" onerror="this.parentElement.classList.add('is-broken');">
                    ${lockBadge}
                </button>
            `);
        }
        // items が空 (manifest 未ロード/空) でも「—」セル単独のグリッドを返す。
        //   ここに開発者向けの警告文を出していた過去があるが、プロダクション UI に
        //   漏れる懸念があるため削除 (2026-04)。
        return `<div class="hm-pf-av-grid">${cells.join('')}</div>`;
    }

    function buildProfileHTML() {
        const id   = window.Save?.getPlayerId?.() || '??????';
        const disp = window.Save?.getPlayerDisplayName?.() || id;
        const raw  = window.Save?.data?.player?.name || '';
        const iconId = window.Save?.getPlayerIcon?.() || null;
        // name が null の場合は ID と表示名が一致するので入力欄は空
        const inputVal = raw ? escapeHTML(raw) : '';

        // 選択中アイコンのプレビュー
        const selPath = iconId ? window.Avatars?.pathOf?.(iconId) : null;
        const previewHTML = selPath
            ? `<img class="hm-pf-avpreview-img" src="${escapeHTML(selPath)}" alt="">`
            : `<span class="hm-pf-avpreview-none">—</span>`;

        return `
            <div class="hm-panel" role="dialog" aria-label="PROFILE">
                <div class="hm-head">
                    <div class="hm-title">PROFILE</div>
                    <button class="hm-close" aria-label="閉じる">${ICONS.close}</button>
                </div>
                <div class="hm-profile">
                    <div class="hm-pf-top">
                        <div class="hm-pf-avpreview">${previewHTML}</div>
                        <div class="hm-pf-topinfo">
                            <div class="hm-pf-lbl">PLAYER ID</div>
                            <div class="hm-pf-id">${escapeHTML(id)}</div>
                        </div>
                    </div>

                    <div class="hm-pf-row">
                        <div class="hm-pf-lbl">DISPLAY NAME</div>
                        <div class="hm-pf-current">${escapeHTML(disp)}</div>
                        <input
                            type="text"
                            class="hm-pf-input"
                            maxlength="16"
                            autocomplete="off"
                            autocapitalize="off"
                            spellcheck="false"
                            value="${inputVal}">
                    </div>

                    <div class="hm-pf-row">
                        <div class="hm-pf-lbl">ICON</div>
                        <div class="hm-pf-avwrap">${buildAvatarGridHTML(iconId)}</div>
                    </div>

                    <div class="hm-pf-row hm-pf-row-toggle">
                        <div class="hm-pf-lbl">RANKING</div>
                        <label class="hm-pf-toggle">
                            <input type="checkbox" class="hm-pf-rank" ${(window.Ranking?.isEnabled?.() ?? true) ? 'checked' : ''}>
                            <span class="hm-pf-toggle-box"></span>
                            <span class="hm-pf-toggle-label">オンライン TOP100 に参加</span>
                        </label>
                    </div>

                    <div class="hm-pf-actions">
                        <button class="hm-pf-btn hm-pf-save"  type="button">SAVE NAME</button>
                        <button class="hm-pf-btn hm-pf-reset" type="button">RESET NAME</button>
                    </div>

                    <!-- 旧ハンバーガーメニュー (廃止) からの移設: ABOUT / 進捗リセット -->
                    <div class="hm-pf-footer">
                        <div class="hm-pf-footer-divider"></div>
                        <div class="hm-pf-footer-actions">
                            <button class="hm-pf-btn hm-pf-btn-small" type="button" data-act="about">ABOUT</button>
                            <button class="hm-pf-btn hm-pf-btn-small hm-pf-btn-danger" type="button" data-act="resetProgress">RESET PROGRESS</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // root / opts を受け取ってモーダル以外 (= フルスクリーンタブ画面) にも
    // バインドできる形にしてある。
    //   root: 走査対象のルート要素 (省略時は profileOverlay = モーダル版)
    //   opts.onClose: 閉じるボタン/ABOUT/RESET 後に外側から渡される hook。
    //     モーダル版は closeProfile/closeMenu を使うが、フルスクリーン版は
    //     Router.show('home') 等を渡せばよい。
    function bindProfileHandlers(root, opts) {
        root = root || profileOverlay;
        opts = opts || {};
        const onClose = typeof opts.onClose === 'function' ? opts.onClose : closeProfile;
        const isModal = opts.isModal !== false; // 省略時はモーダル扱い

        root.querySelector('.hm-close')?.addEventListener('click', () => {
            window.SE?.fire?.('cancel');
            onClose();
        });
        const input = root.querySelector('.hm-pf-input');
        root.querySelector('.hm-pf-save')?.addEventListener('click', () => {
            const v = input ? input.value : '';
            window.Save?.setPlayerName?.(v);
            window.SE?.fire?.('confirm');
            const curEl = root.querySelector('.hm-pf-current');
            if (curEl) curEl.textContent = window.Save?.getPlayerDisplayName?.() || '';
        });
        // ランキング参加 ON/OFF トグル (即時反映)
        const rankToggle = root.querySelector('.hm-pf-rank');
        if (rankToggle) {
            rankToggle.addEventListener('change', () => {
                const v = rankToggle.checked;
                window.Ranking?.setEnabled?.(v);
                window.SE?.fire?.(v ? 'confirm' : 'cancel');
            });
        }

        root.querySelector('.hm-pf-reset')?.addEventListener('click', () => {
            if (input) input.value = '';
            window.Save?.setPlayerName?.(null);
            window.SE?.fire?.('cancel');
            const curEl = root.querySelector('.hm-pf-current');
            if (curEl) curEl.textContent = window.Save?.getPlayerDisplayName?.() || '';
        });

        // ABOUT / RESET PROGRESS (旧ハンバーガーから移設)
        root.querySelectorAll('.hm-pf-footer-actions [data-act]').forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.dataset.act;
                window.SE?.fire?.('menuCursor');
                if (act === 'about') {
                    // モーダル版は一旦閉じてから ABOUT を重ねる。フルスクリーン版は
                    // そのまま ABOUT モーダルを上に重ねる。
                    if (isModal) {
                        closeProfile();
                        setTimeout(openAbout, 120);
                    } else {
                        openAbout();
                    }
                } else if (act === 'resetProgress') {
                    openResetConfirm();
                }
            });
        });

        // アイコングリッド: 各セルタップで即保存・プレビュー更新
        const grid = root.querySelector('.hm-pf-av-grid');
        if (grid) {
            grid.querySelectorAll('.hm-pf-av').forEach((btn) => {
                btn.addEventListener('click', () => {
                    // ロック中アイコンは選択不可 (拒否音 + シェイクのみ)
                    if (btn.dataset.locked === '1') {
                        window.SE?.fire?.('wrong');
                        btn.classList.remove('is-shake');
                        void btn.offsetWidth;
                        btn.classList.add('is-shake');
                        return;
                    }
                    const id = btn.dataset.avId || '';
                    window.Save?.setPlayerIcon?.(id || null);
                    window.SE?.fire?.('select');
                    // 選択ハイライトを付け替え
                    grid.querySelectorAll('.hm-pf-av.is-sel').forEach(el => el.classList.remove('is-sel'));
                    btn.classList.add('is-sel');
                    // プレビューを差し替え
                    const pv = root.querySelector('.hm-pf-avpreview');
                    if (pv) {
                        const path = id ? window.Avatars?.pathOf?.(id) : null;
                        pv.innerHTML = path
                            ? `<img class="hm-pf-avpreview-img" src="${escapeHTML(path)}" alt="">`
                            : `<span class="hm-pf-avpreview-none">—</span>`;
                    }
                });
            });
        }
    }

    function openProfile() {
        if (!profileOverlay) {
            profileOverlay = document.createElement('div');
            profileOverlay.className = 'hm-overlay';
            document.body.appendChild(profileOverlay);
        }
        // manifest を先にロードしてからレンダリング (既に cache 済みなら即時)
        const render = () => {
            profileOverlay.innerHTML = buildProfileHTML();
            profileOverlay.classList.add('is-open');
            bindProfileHandlers();
        };
        // 一度も読んだことが無い時はローディング表示、読んだら再レンダ
        if (window.Avatars) {
            window.Avatars.load().then(() => {
                // 参照中のアイコン id がマニフェストに無い (ファイル削除されたケース)
                // なら null に戻しておく (壊れ画像表示の予防)
                const saved = window.Save?.getPlayerIcon?.();
                if (saved && !window.Avatars.getById(saved)) {
                    window.Save?.setPlayerIcon?.(null);
                }
                render();
            });
        } else {
            render();
        }

        window.SE?.fire?.('confirm');
    }

    function closeProfile() {
        if (profileOverlay) profileOverlay.classList.remove('is-open');
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
            // 設定 (音量/ミュート) とプレイヤー ID / 名前 / アイコンは保持して
            // 進捗 (クリア状況/スコア/プレイ回数) だけ消す。identity は引き継ぎ。
            const settings = window.Save?.getSettings?.();
            const prevId   = window.Save?.getPlayerId?.();
            const prevName = window.Save?.data?.player?.name ?? null;
            const prevIcon = window.Save?.data?.player?.icon ?? null;
            window.Save?.reset?.();
            if (settings) {
                Object.keys(settings).forEach(k => window.Save?.setSetting?.(k, settings[k]));
            }
            if (window.Save?.data && prevId) {
                window.Save.data.player = { id: prevId, name: prevName, icon: prevIcon };
                window.Save.persist?.();
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
        // TabBar (5タブ UI) からモーダル直行用に公開。
        // ACCOUNT タブ -> openProfile、SCORES タブ -> openScores。
        openProfile,
        openScores,
        openAbout,
        // フルスクリーンタブ (js/screens/profile.js, scores.js) から
        // モーダルと同じ HTML / ハンドラを再利用するための公開 API。
        buildProfileHTML,     // -> <div class="hm-panel">...</div>
        buildScoresHTML,      // -> <div class="hm-panel hm-panel-wide">...</div>
        bindProfileHandlers,  // (rootEl, { onClose, isModal=false })
    };
})();
