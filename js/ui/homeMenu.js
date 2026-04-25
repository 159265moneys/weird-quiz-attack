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
                        <span class="hm-lbl"><span class="hm-lbl-main">RESET</span><span class="hm-lbl-sub">全データを削除</span></span>
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

    // tier 別アイコン (SVG, 24x24 想定)。
    //   story = 旗 / skill = 稲妻 / fun = どくろ / core = 焚き火っぽい炎
    const TIER_ICONS = {
        story: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>`,
        skill: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>`,
        fun:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a7 7 0 0 0-7 7v3l2 2v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3l2-2v-3a7 7 0 0 0-7-7Z"/><circle cx="9" cy="11" r="1.4"/><circle cx="15" cy="11" r="1.4"/><path d="M10 17h4"/></svg>`,
        core:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1.5 3 4 4 4 7a4 4 0 0 1-8 0c0-1.5 1-2.5 2-4 .8 1 2 1.5 2 0 0-1-1-2 0-3Z"/><path d="M6 17a6 6 0 0 0 12 0"/></svg>`,
    };
    const TIER_LABELS = {
        story: 'STORY',
        skill: 'SKILL',
        fun:   'HIDDEN',
        core:  'DAILY',
    };
    const TIER_ORDER = ['story', 'skill', 'core', 'fun'];

    // ロックアイコン (錠前)
    const LOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

    // 達成バッジ一覧モーダル。Achievements.CATALOG を tier 毎にグルーピング表示。
    //   - 上部にスティッキーなヘッダ (タイトル + CLOSE)
    //   - 進捗カード (大きな数字 + 進捗バー + tier 別チップ)
    //   - tier セクション (STORY → SKILL → DAILY → HIDDEN)
    //   - 各カード: tier アイコン / 名称 / ヒント / 状態ピル (EARNED / LOCKED)
    //   - 未解放は名前を ??? にし、ロックアイコンを出して密かさを演出。
    function buildAchievementsHTML() {
        const cat = window.Achievements?.CATALOG || [];
        const have = new Set(window.Save?.getAchievements?.() || []);
        const total = cat.length;
        const got = cat.filter(a => have.has(a.id)).length;
        const pct = total ? Math.round((got / total) * 100) : 0;

        // tier 別カウント
        const tierCounts = {};
        TIER_ORDER.forEach(t => { tierCounts[t] = { got: 0, total: 0 }; });
        cat.forEach(a => {
            const t = a.tier || 'core';
            if (!tierCounts[t]) tierCounts[t] = { got: 0, total: 0 };
            tierCounts[t].total++;
            if (have.has(a.id)) tierCounts[t].got++;
        });

        const chipsHTML = TIER_ORDER
            .filter(t => tierCounts[t] && tierCounts[t].total > 0)
            .map(t => `
                <div class="hm-ach-chip tier-${t}">
                    <span class="hm-ach-chip-ic">${TIER_ICONS[t] || ''}</span>
                    <span class="hm-ach-chip-lbl">${TIER_LABELS[t] || t.toUpperCase()}</span>
                    <span class="hm-ach-chip-cnt">${tierCounts[t].got}/${tierCounts[t].total}</span>
                </div>
            `).join('');

        // tier 毎にグルーピング (CATALOG 順を保ったまま)
        const groups = {};
        TIER_ORDER.forEach(t => { groups[t] = []; });
        cat.forEach(a => {
            const t = a.tier || 'core';
            if (!groups[t]) groups[t] = [];
            groups[t].push(a);
        });

        const sectionsHTML = TIER_ORDER
            .filter(t => groups[t] && groups[t].length > 0)
            .map(t => {
                const cards = groups[t].map((a) => {
                    const isGot = have.has(a.id);
                    const cls = `hm-ach-card tier-${t} ${isGot ? 'is-got' : 'is-locked'}`;
                    const name = isGot ? escapeHTML(a.name) : '??? ??? ???';
                    const hint = escapeHTML(a.hint);
                    const icon = isGot ? (TIER_ICONS[t] || '') : LOCK_ICON;
                    const pillCls = isGot ? 'is-got' : 'is-locked';
                    const pillText = isGot ? 'EARNED' : 'LOCKED';
                    return `
                        <div class="${cls}">
                            <div class="hm-ach-card-ic">${icon}</div>
                            <div class="hm-ach-card-body">
                                <div class="hm-ach-card-name">${name}</div>
                                <div class="hm-ach-card-hint">${hint}</div>
                            </div>
                            <div class="hm-ach-pill ${pillCls}">${pillText}</div>
                        </div>
                    `;
                }).join('');
                return `
                    <section class="hm-ach-section tier-${t}">
                        <header class="hm-ach-sec-head">
                            <span class="hm-ach-sec-ic">${TIER_ICONS[t] || ''}</span>
                            <span class="hm-ach-sec-lbl">${TIER_LABELS[t] || t.toUpperCase()}</span>
                            <span class="hm-ach-sec-line"></span>
                            <span class="hm-ach-sec-cnt">${tierCounts[t].got}/${tierCounts[t].total}</span>
                        </header>
                        <div class="hm-ach-grid">${cards}</div>
                    </section>
                `;
            }).join('');

        const bodyHTML = !total
            ? `<div class="hm-ach-empty">読み込み中…</div>`
            : `
                <div class="hm-ach-progress">
                    <div class="hm-ach-progress-num">
                        <span class="hm-ach-progress-got">${got}</span>
                        <span class="hm-ach-progress-sep">/</span>
                        <span class="hm-ach-progress-total">${total}</span>
                        <span class="hm-ach-progress-lbl">UNLOCKED</span>
                    </div>
                    <div class="hm-ach-progress-bar">
                        <div class="hm-ach-progress-fill" style="width:${pct}%"></div>
                        <div class="hm-ach-progress-pct">${pct}%</div>
                    </div>
                    <div class="hm-ach-chips">${chipsHTML}</div>
                </div>
                ${sectionsHTML}
            `;

        return `
            <div class="hm-panel hm-panel-wide hm-panel-ach" role="dialog" aria-label="ACHIEVEMENTS">
                <div class="hm-head hm-head-sticky">
                    <div class="hm-title">ACHIEVEMENTS</div>
                    <button class="hm-close" aria-label="閉じる">${ICONS.close}</button>
                </div>
                <div class="hm-ach-body">
                    ${bodyHTML}
                </div>
            </div>
        `;
    }

    // 達成バッジ画面を開く。
    //   2026-04: 旧モーダル (hm-overlay + sticky head の二重 backdrop-filter)
    //   が iOS WKWebView で落ちる事象が出たため、図鑑と同様に Router 管理の
    //   独立スクリーン (js/screens/achievements.js) に移行した。
    //   既存の呼び出し箇所 (home.js / TabBar 等) を変更せず済むよう、
    //   ここから Router.show('achievements') に転送する。
    function openAchievements() {
        if (window.Router?.show) {
            window.Router.show('achievements');
        } else {
            console.error('[HomeMenu] Router not available for achievements screen');
        }
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

                    <!-- 保存ボタンは 1つに統一: アイコンはタップで即保存される
                         設計のため、このボタンは実質「名前の保存」だが、UX 上は
                         「プロフィール全体を保存した」という印象になるよう
                         ラベルを中立的な "SAVE" に。RESET NAME は名前専用の
                         サブアクションとして控えめに残す (アイコンのリセットは
                         アバターグリッド先頭の "—" で行う)。
                         ABOUT / RESET PROGRESS は Home の ⚙ (設定モーダル)
                         に移動したのでここからは削除。 -->
                    <div class="hm-pf-actions">
                        <button class="hm-pf-btn hm-pf-save"  type="button" data-default-label="SAVE">SAVE</button>
                        <button class="hm-pf-btn hm-pf-reset hm-pf-btn-small" type="button">RESET NAME</button>
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
        const saveBtn = root.querySelector('.hm-pf-save');
        saveBtn?.addEventListener('click', () => {
            const v = input ? input.value : '';
            window.Save?.setPlayerName?.(v);
            window.SE?.fire?.('confirm');
            const curEl = root.querySelector('.hm-pf-current');
            if (curEl) curEl.textContent = window.Save?.getPlayerDisplayName?.() || '';

            // 保存した感フィードバック: 一瞬 "SAVED" 表示 + saved クラスで発光
            // アイコンはタップ時に既に保存済みだが、ユーザーには「1ボタンで
            // 両方保存された」という体験を演出するためここで一括フラッシュ。
            if (saveBtn && !saveBtn.dataset.flashing) {
                const defaultLabel = saveBtn.dataset.defaultLabel || 'SAVE';
                saveBtn.dataset.flashing = '1';
                saveBtn.textContent = 'SAVED';
                saveBtn.classList.add('is-saved-flash');
                setTimeout(() => {
                    saveBtn.textContent = defaultLabel;
                    saveBtn.classList.remove('is-saved-flash');
                    delete saveBtn.dataset.flashing;
                }, 900);
            }
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
                    <div class="hm-about-sub">ODD QUIZ</div>
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
    // 2026-04 更新: "完全初期化" 方針に変更。
    //   旧実装は identity (id/name/icon) と設定 (音量/ミュート等) を保持して
    //   進捗だけ消していたが、ユーザー要望で「初回インストール状態まで戻す」に。
    //   → localStorage.removeItem → defaultData() を載せ直す一連の処理に統一。
    //   tutorialDone=false に戻るので、title → stageSelect の強制チュートリアル
    //   フローが再び走る (= 初回と同じ体験)。
    async function openResetConfirm() {
        // ゲーム UI に揃えたカスタム確認ダイアログ (window.ConfirmDialog) を使用。
        // 二段階確認: 1) 内容提示 → 2) 最終警告。どちらもキャンセルでノー変更。
        const ok = await window.ConfirmDialog.show({
            title: '全データを削除',
            message: 'アイコン / 名前 / 進捗 / ベストスコア / 設定を\nすべて削除し、初回インストール状態に戻します。\n\n本当によろしいですか？',
            okText: '次へ',
            cancelText: 'キャンセル',
            danger: true,
        });
        if (!ok) return;
        const ok2 = await window.ConfirmDialog.show({
            title: '最終確認',
            message: 'この操作は取り消せません。\n本当に全データを削除しますか？',
            okText: '削除する',
            cancelText: 'やめる',
            danger: true,
        });
        if (!ok2) return;
        try {
            // 全データを初期化 (player id も再発行される)
            window.Save?.reset?.();
            // ランタイム側の派生状態もクリーンアップ
            // 保存された音量設定はリセットされデフォルトに戻るので、
            // 実行中の SE / BGM にも反映させる。
            try {
                const s = window.Save?.getSettings?.();
                if (s) {
                    window.SE?.setMasterVolume?.(s.seVolume);
                    window.BGM?.setVolume?.(s.bgmVolume);
                    window.SE?.mute?.(!!s.muted);
                    window.BGM?.mute?.(!!s.muted);
                }
            } catch (_) { /* noop */ }

            // UI 側の残骸を閉じる (設定モーダル / メニュー / profile overlay 等)
            try { window.Settings?.close?.(); } catch (_) {}
            try { closeMenu(); } catch (_) {}
            try { closeProfile?.(); } catch (_) {}
            try { closeScores?.(); } catch (_) {}
            try { closeAbout?.(); } catch (_) {}

            window.SE?.fire?.('confirm');

            // Navigator に残っていた吹き出しもクリア (タブロックが残る事故防止)
            try { window.Navigator?.close?.(); } catch (_) {}
            document.body.classList.remove('is-tutorial-lock');

            // 初回と全く同じ体験にするためタイトル画面から再スタート。
            // title → タップ → (tutorialDone=false なので) stageSelect 強制フロー。
            setTimeout(() => window.Router?.show?.('title'), 150);
        } catch (e) {
            console.error('[HomeMenu] reset failed:', e);
            window.ConfirmDialog.show({
                title: 'エラー',
                message: 'リセットに失敗しました。\n時間を置いて再度お試しください。',
                okText: 'OK',
                cancelText: '閉じる',
                danger: true,
            });
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
        openAchievements,
        // ホーム ⚙ (設定モーダル) から ABOUT / 進捗リセットを開けるように
        // 公開。従来はプロフィール画面フッタから呼んでいた。
        openResetConfirm,
        // フルスクリーンタブ (js/screens/profile.js, scores.js, achievements.js)
        // からモーダルと同じ HTML / ハンドラを再利用するための公開 API。
        buildProfileHTML,        // -> <div class="hm-panel">...</div>
        buildScoresHTML,         // -> <div class="hm-panel hm-panel-wide">...</div>
        buildAchievementsHTML,   // -> <div class="hm-panel hm-panel-wide hm-panel-ach">...</div>
        bindProfileHandlers,     // (rootEl, { onClose, isModal=false })
    };
})();
