/* ============================================================
   profile.js — PROFILE 画面 (5タブ UI の ACCOUNT タブ)
   ------------------------------------------------------------
   旧 PROFILE モーダル (homeMenu.js#openProfile) をフルスクリーン化。
   表示項目:
     - アバタープレビュー + PLAYER ID + DISPLAY NAME
     - 名前編集 (input + SAVE / RESET)
     - アイコングリッド (ロック対応)
     - RANKING オンライン参加 ON/OFF
     - ABOUT (モーダル on top) / RESET PROGRESS
   モーダル版と同じ Save/Avatars/Ranking API を参照する単純な再構築。
   ============================================================ */

(function () {
    function escapeHTML(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildAvatarGridHTML(selectedId) {
        const items = window.Avatars?.getList?.() || [];
        const cells = [
            `<button class="pf-av ${!selectedId ? 'is-sel' : ''}" data-av-id="" type="button" aria-label="NONE">
                <span class="pf-av-none">—</span>
            </button>`
        ];
        for (const it of items) {
            const path = window.Avatars?.pathOf?.(it.id) || `sprite/avatars/${encodeURIComponent(it.file)}`;
            const sel = it.id === selectedId ? 'is-sel' : '';
            const unlocked = window.Save?.isIconUnlocked?.(it.id) !== false;
            const lockCls = unlocked ? '' : 'is-locked';
            const lockBadge = unlocked ? '' : `<span class="pf-av-lockbadge" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </span>`;
            cells.push(`
                <button class="pf-av ${sel} ${lockCls}" data-av-id="${escapeHTML(it.id)}" data-locked="${unlocked ? '0' : '1'}" type="button" aria-label="${escapeHTML(it.label)}${unlocked ? '' : ' (未解放)'}">
                    <img src="${escapeHTML(path)}" alt="${escapeHTML(it.label)}" onerror="this.parentElement.classList.add('is-broken');">
                    ${lockBadge}
                </button>
            `);
        }
        return `<div class="pf-av-grid">${cells.join('')}</div>`;
    }

    function buildBodyHTML() {
        const id     = window.Save?.getPlayerId?.() || '??????';
        const disp   = window.Save?.getPlayerDisplayName?.() || id;
        const raw    = window.Save?.data?.player?.name || '';
        const iconId = window.Save?.getPlayerIcon?.() || null;
        const inputVal = raw ? escapeHTML(raw) : '';
        const selPath = iconId ? window.Avatars?.pathOf?.(iconId) : null;
        const previewHTML = selPath
            ? `<img class="pf-avpreview-img" src="${escapeHTML(selPath)}" alt="">`
            : `<span class="pf-avpreview-none">—</span>`;

        const rankingOn = (window.Ranking?.isEnabled?.() ?? true);

        return `
            <div class="pf-body">
                <section class="pf-card pf-card-head">
                    <div class="pf-avpreview">${previewHTML}</div>
                    <div class="pf-topinfo">
                        <div class="pf-lbl">PLAYER ID</div>
                        <div class="pf-id">${escapeHTML(id)}</div>
                    </div>
                </section>

                <section class="pf-card">
                    <div class="pf-lbl">DISPLAY NAME</div>
                    <div class="pf-current" id="pfCurrent">${escapeHTML(disp)}</div>
                    <input
                        type="text"
                        class="pf-input"
                        id="pfInput"
                        maxlength="16"
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck="false"
                        value="${inputVal}"
                        placeholder="名前を入力 (16文字まで)">
                    <div class="pf-row-actions">
                        <button class="pf-btn pf-btn-primary" type="button" data-act="saveName">SAVE NAME</button>
                        <button class="pf-btn pf-btn-ghost"   type="button" data-act="resetName">RESET NAME</button>
                    </div>
                </section>

                <section class="pf-card">
                    <div class="pf-lbl">ICON</div>
                    <div class="pf-avwrap">${buildAvatarGridHTML(iconId)}</div>
                </section>

                <section class="pf-card pf-card-row">
                    <div class="pf-lbl">RANKING</div>
                    <label class="pf-toggle">
                        <input type="checkbox" class="pf-rank" id="pfRank" ${rankingOn ? 'checked' : ''}>
                        <span class="pf-toggle-box"></span>
                        <span class="pf-toggle-label">オンライン TOP100 に参加</span>
                    </label>
                </section>

                <section class="pf-card pf-card-danger">
                    <div class="pf-lbl">MORE</div>
                    <div class="pf-row-actions">
                        <button class="pf-btn pf-btn-ghost"  type="button" data-act="about">ABOUT</button>
                        <button class="pf-btn pf-btn-danger" type="button" data-act="resetProgress">RESET PROGRESS</button>
                    </div>
                </section>
            </div>
        `;
    }

    function bindHandlers(root) {
        const input = root.querySelector('#pfInput');
        const curEl = root.querySelector('#pfCurrent');
        const rank  = root.querySelector('#pfRank');

        root.querySelector('[data-act="saveName"]')?.addEventListener('click', () => {
            window.Save?.setPlayerName?.(input ? input.value : '');
            window.SE?.fire?.('confirm');
            if (curEl) curEl.textContent = window.Save?.getPlayerDisplayName?.() || '';
        });
        root.querySelector('[data-act="resetName"]')?.addEventListener('click', () => {
            if (input) input.value = '';
            window.Save?.setPlayerName?.(null);
            window.SE?.fire?.('cancel');
            if (curEl) curEl.textContent = window.Save?.getPlayerDisplayName?.() || '';
        });

        if (rank) {
            rank.addEventListener('change', () => {
                const v = rank.checked;
                window.Ranking?.setEnabled?.(v);
                window.SE?.fire?.(v ? 'confirm' : 'cancel');
            });
        }

        root.querySelector('[data-act="about"]')?.addEventListener('click', () => {
            window.SE?.fire?.('menuCursor');
            window.HomeMenu?.openAbout?.();
        });

        root.querySelector('[data-act="resetProgress"]')?.addEventListener('click', () => {
            window.SE?.fire?.('menuCursor');
            // homeMenu の openResetConfirm と同内容をここで再実装
            // (confirm() 2段 → reset → Router.reload())
            const ok = confirm('すべての進捗 (クリア状況 / ベストスコア / プレイ回数) をリセットします。本当に良いですか？');
            if (!ok) return;
            const ok2 = confirm('本当にリセットします。この操作は取り消せません。');
            if (!ok2) return;
            try {
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
                setTimeout(() => window.Router?.reload?.(), 150);
            } catch (e) {
                console.error('[Profile] reset failed:', e);
                alert('リセットに失敗しました。');
            }
        });

        // アイコングリッド
        const grid = root.querySelector('.pf-av-grid');
        if (grid) {
            grid.querySelectorAll('.pf-av').forEach(btn => {
                btn.addEventListener('click', () => {
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
                    grid.querySelectorAll('.pf-av.is-sel').forEach(el => el.classList.remove('is-sel'));
                    btn.classList.add('is-sel');
                    const pv = root.querySelector('.pf-avpreview');
                    if (pv) {
                        const path = id ? window.Avatars?.pathOf?.(id) : null;
                        pv.innerHTML = path
                            ? `<img class="pf-avpreview-img" src="${escapeHTML(path)}" alt="">`
                            : `<span class="pf-avpreview-none">—</span>`;
                    }
                });
            });
        }
    }

    const Screen = {
        render() {
            return `
                <div class="screen profile-screen">
                    <div class="screen-header profile-head">
                        <button class="back-btn" data-action="back" type="button">◀ BACK</button>
                        <h1 class="profile-title">PROFILE</h1>
                        <div class="profile-head-spacer"></div>
                    </div>
                    <div class="scroll-area profile-scroll" id="profileScroll">
                        ${buildBodyHTML()}
                    </div>
                </div>
            `;
        },

        init() {
            window.TabBar?.mount?.('account');

            // Avatars manifest が未ロードなら load 後に scroll 部分だけ再レンダ
            const root = document.querySelector('.profile-screen');
            if (!root) return;

            if (window.Avatars) {
                window.Avatars.load().then(() => {
                    const saved = window.Save?.getPlayerIcon?.();
                    if (saved && !window.Avatars.getById(saved)) {
                        window.Save?.setPlayerIcon?.(null);
                    }
                    const scroll = root.querySelector('#profileScroll');
                    if (scroll) {
                        scroll.innerHTML = buildBodyHTML();
                        bindHandlers(scroll);
                    }
                }).catch(() => bindHandlers(root));
            } else {
                bindHandlers(root);
            }

            root.querySelector('[data-action="back"]')?.addEventListener('click', () => {
                window.SE?.fire?.('menuCursor');
                window.Router?.show?.('home');
            });
        },

        destroy() {
            // TabBar の管理は遷移先で行う。ここでは何もしない。
        },
    };

    window.Screens.profile = Screen;
})();
