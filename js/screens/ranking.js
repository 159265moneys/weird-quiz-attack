/* ============================================================
   ranking.js — ランキング画面
   ------------------------------------------------------------
   - ステージナビ: 現在ステージを中央に配置し、前後 1 個ずつ半分見える
     カルーセル形式。◀ ▶ ボタンと画面全体の左右スワイプで切替。
     未解放ステージも可視化 (dim) するが、プレビュー目的で選択は可能。
   - 選択中ステージの TOP 100 を表示 (自分はハイライト)。
   - 表示倍率: 上位 10 位 + 自分のエントリは jumbo (約 1.6x) で強調。
     その他の行は通常サイズ。
   - 100 位圏外なら下部に "YOUR RANK" ピン表示 (jumbo で)。
   - 参加 OFF 状態なら Banner で案内 + 送信されないことを明示。

   エントリ例:
     { rank(#), playerId, displayName, iconId,
       score, totalTimeMs, rank(grade), deathEnd, _self }
   ============================================================ */

(function () {
    let currentStage = 1;

    // スワイプ判定用の状態
    const SWIPE_MIN_PX = 60;          // 発火に必要な水平移動量
    const SWIPE_AXIS_RATIO = 1.5;     // |dx| > |dy| * 1.5 で水平スワイプと判定
    let swipe = null;

    // --- helpers ---
    function fmtTime(ms) {
        if (!ms || ms < 0) return '--:--';
        const s = Math.round(ms / 1000);
        const m = Math.floor(s / 60);
        const r = s - m * 60;
        return `${m}:${String(r).padStart(2, '0')}`;
    }
    function avatarImgTag(iconId) {
        const path = iconId ? window.Avatars?.pathOf?.(iconId) : null;
        if (!path) {
            // アイコン未選択: 記号だけの丸プレースホルダ (絵文字は使わない)
            return `<span class="rk-avatar rk-avatar-none" aria-hidden="true"></span>`;
        }
        return `<span class="rk-avatar" style="background-image:url('${path}')" aria-hidden="true"></span>`;
    }
    function escapeHtml(s) {
        if (typeof s !== 'string') return '';
        return s.replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function rowHtml(entry, pos) {
        const medal = pos <= 3 ? `rk-medal-${pos}` : '';
        const self = entry._self ? 'is-self' : '';
        // 上位 10 + 自分は大サイズ。(pinned は _self 付きで呼ばれるので自動対応)
        const jumbo = (pos <= 10 || entry._self) ? 'is-jumbo' : '';
        const death = entry.deathEnd ? '<span class="rk-death" title="即死">☠</span>' : '';
        return `
            <li class="rk-row ${medal} ${self} ${jumbo}" data-pos="${pos}">
                <span class="rk-pos">${pos <= 99 ? '#' + pos : String(pos)}</span>
                ${avatarImgTag(entry.iconId)}
                <span class="rk-name">${escapeHtml(entry.displayName)}${death}</span>
                <span class="rk-rank rank-${entry.rank}">${entry.rank}</span>
                <span class="rk-score">${(entry.score | 0).toLocaleString()}</span>
                <span class="rk-time">${fmtTime(entry.totalTimeMs)}</span>
            </li>
        `;
    }

    // --- ステージナビ (横スクロールチップ列) ---
    //   - 数字チップを横一列で並べる (overflow-x: auto)
    //   - active チップだけ大きく+シアン枠
    //   - active が常に画面に収まるように scrollIntoView
    function chipHtml(s, isActive, isUnlocked) {
        const cls = [
            'rk-chip',
            isActive ? 'is-active' : '',
            isUnlocked ? '' : 'is-locked',
        ].filter(Boolean).join(' ');
        return `<button class="${cls}" data-stage="${s.no}" aria-label="Stage ${s.no}">${String(s.no).padStart(2, '0')}</button>`;
    }

    // active チップを画面中央寄りにスクロール
    function scrollActiveIntoView(root, animate = true) {
        const chips = root.querySelector('.rk-stage-chips');
        if (!chips) return;
        const active = chips.querySelector('.rk-chip.is-active');
        if (!active) return;
        // active の中心を chips の中心に揃える
        const left = active.offsetLeft - (chips.clientWidth / 2 - active.offsetWidth / 2);
        if (animate) {
            chips.scrollTo({ left, behavior: 'smooth' });
        } else {
            chips.scrollLeft = left;
        }
    }

    function updateActiveTab(root) {
        root.querySelectorAll('.rk-chip').forEach(b => {
            b.classList.toggle('is-active',
                parseInt(b.dataset.stage, 10) === currentStage);
        });
    }

    function changeStage(root, delta) {
        const max = (window.CONFIG?.STAGES || []).length;
        const next = Math.min(max, Math.max(1, currentStage + delta));
        if (next === currentStage) return;
        currentStage = next;
        applyStageChange(root);
    }

    function setStage(root, no) {
        const max = (window.CONFIG?.STAGES || []).length;
        const n = Math.min(max, Math.max(1, parseInt(no, 10) || 1));
        if (n === currentStage) return;
        currentStage = n;
        applyStageChange(root);
    }

    function applyStageChange(root) {
        window.SE?.fire?.('menuCursor');
        updateActiveTab(root);
        scrollActiveIntoView(root, true);
        const stages = window.CONFIG?.STAGES || [];
        const head = root.querySelector('.rk-stage-head');
        if (head) {
            const noEl = head.querySelector('.rk-stage-no');
            const nameEl = head.querySelector('.rk-stage-name');
            if (noEl) noEl.textContent = `STAGE ${String(currentStage).padStart(2, '0')}`;
            if (nameEl) nameEl.textContent = stages[currentStage - 1]?.name || '';
        }
        rerenderList(root);
    }

    // --- スワイプ ---
    // 画面全体で左右スワイプを拾ってステージ切替。縦スクロールと干渉させないため、
    // 終点で dx/dy を見て水平判定が成立した時だけ切替する。
    function onPointerDown(ev, root) {
        // チップ列内 (横スクロール領域) と チップ自身は除外
        if (ev.target.closest('.rk-chip, .rk-stage-chips, .btn-back')) {
            swipe = null;
            return;
        }
        swipe = {
            x: ev.clientX,
            y: ev.clientY,
            t: Date.now(),
            done: false,
        };
    }
    function onPointerUp(ev, root) {
        if (!swipe || swipe.done) { swipe = null; return; }
        const dx = ev.clientX - swipe.x;
        const dy = ev.clientY - swipe.y;
        swipe.done = true;
        swipe = null;
        if (Math.abs(dx) < SWIPE_MIN_PX) return;
        if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
        // 左スワイプ (dx<0) → 次 / 右スワイプ → 前
        changeStage(root, dx < 0 ? 1 : -1);
    }
    function onPointerCancel() { swipe = null; }

    async function rerenderList(root) {
        const listEl = root.querySelector('.rk-list');
        const pinEl = root.querySelector('.rk-selfpin');
        if (!listEl) return;
        listEl.innerHTML = '<li class="rk-loading">LOADING…</li>';
        if (pinEl) pinEl.innerHTML = '';

        const top = await window.Ranking.fetchTop(currentStage, 100);
        if (!top.length) {
            listEl.innerHTML = '<li class="rk-empty">NO DATA</li>';
            return;
        }
        listEl.innerHTML = top.map((e, i) => rowHtml(e, i + 1)).join('');

        // 100 位以内にいない場合、自分の正確な順位を調べて下部ピン表示
        const myId = window.Save?.getPlayerId?.() || '';
        const inTop = top.some(e => e._self);
        if (!inTop && myId && pinEl) {
            const all = await window.Ranking.fetchTop(currentStage, 2000);
            const myPos = all.findIndex(e => e.playerId === myId);
            if (myPos >= 0) {
                pinEl.innerHTML = `
                    <div class="rk-selfpin-inner">
                        <div class="rk-selfpin-label">YOUR RANK</div>
                        <ol class="rk-list rk-list--pinned">
                            ${rowHtml({ ...all[myPos], _self: true }, myPos + 1)}
                        </ol>
                    </div>`;
            } else {
                pinEl.innerHTML = `
                    <div class="rk-selfpin-inner">
                        <div class="rk-selfpin-hint">このステージはまだ未プレイ</div>
                    </div>`;
            }
        }
    }

    const Screen = {
        render() {
            const stages = window.CONFIG.STAGES;
            const progress = window.Save?.data?.progress || {};
            const unlocked = progress.unlockedStage || 1;
            const enabled = window.Ranking?.isEnabled?.() ?? true;

            const chips = stages.map(s =>
                chipHtml(s, s.no === currentStage, s.no <= unlocked)
            ).join('');

            const banner = enabled ? '' : `
                <div class="rk-banner">
                    <div class="rk-banner-title">ランキング参加: OFF</div>
                    <div class="rk-banner-desc">ON にするとクリア時に自動送信されます。<br>設定メニューから変更できます。</div>
                </div>
            `;

            return `
                <div class="screen ranking-screen">
                    <div class="tab-header">
                        <h1 class="tab-header-title">RANKING</h1>
                    </div>
                    <div class="rk-stage-bar">
                        <div class="rk-stage-chips">${chips}</div>
                    </div>
                    ${banner}
                    <div class="rk-stage-head">
                        <span class="rk-stage-no">STAGE ${String(currentStage).padStart(2, '0')}</span>
                        <span class="rk-stage-name">${stages[currentStage - 1].name}</span>
                    </div>
                    <div class="scroll-area">
                        <ol class="rk-list"><li class="rk-loading">LOADING…</li></ol>
                        <div class="rk-selfpin"></div>
                        <div class="rk-footer-hint">${enabled ? '※クリア時に自動送信されます。' : '※送信はされていません。'}</div>
                    </div>
                </div>
            `;
        },
        init() {
            const root = document.querySelector('.ranking-screen');
            if (!root) return;

            window.TabBar?.mount?.('ranking');

            // チップタップでステージ切替
            root.querySelectorAll('.rk-chip').forEach(btn => {
                btn.addEventListener('click', () => {
                    const no = parseInt(btn.dataset.stage, 10);
                    if (!no) return;
                    setStage(root, no);
                });
            });

            // スワイプ (画面全体)
            root.addEventListener('pointerdown', (ev) => onPointerDown(ev, root));
            root.addEventListener('pointerup',   (ev) => onPointerUp(ev, root));
            root.addEventListener('pointercancel', onPointerCancel);

            // 描画後に active を画面内へ
            const kickoff = () => {
                rerenderList(root);
                requestAnimationFrame(() => scrollActiveIntoView(root, false));
            };
            if (window.Avatars?.load) {
                window.Avatars.load().then(kickoff).catch(kickoff);
            } else {
                kickoff();
            }
        },
        destroy() {
            swipe = null;
        },
    };

    window.Screens.ranking = Screen;
})();
