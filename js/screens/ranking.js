/* ============================================================
   ranking.js — ランキング画面
   ------------------------------------------------------------
   - ステージタブ (1〜10) + 解放済みタブのみ非グレー
     (未クリアでも見えるが視覚的に一段弱める)
   - 選択中ステージの TOP 100 を表示 (自分はハイライト)
   - 100 位圏外なら下部に "YOUR RANK" ピン表示
   - 参加 OFF 状態なら Banner で案内 + 送信されないことを明示

   エントリ例:
     { rank(#), playerId, displayName, iconId,
       score, totalTimeMs, rank(grade), deathEnd, _self }
   ============================================================ */

(function () {
    let currentStage = 1;

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
        const death = entry.deathEnd ? '<span class="rk-death" title="即死">☠</span>' : '';
        return `
            <li class="rk-row ${medal} ${self}" data-pos="${pos}">
                <span class="rk-pos">${pos <= 99 ? '#' + pos : String(pos)}</span>
                ${avatarImgTag(entry.iconId)}
                <span class="rk-name">${escapeHtml(entry.displayName)}${death}</span>
                <span class="rk-rank rank-${entry.rank}">${entry.rank}</span>
                <span class="rk-score">${(entry.score | 0).toLocaleString()}</span>
                <span class="rk-time">${fmtTime(entry.totalTimeMs)}</span>
            </li>
        `;
    }

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

            const tabs = stages.map(s => {
                const isUnlocked = s.no <= unlocked;
                const active = (s.no === currentStage) ? 'is-active' : '';
                const dim = isUnlocked ? '' : 'is-dim';
                return `<button class="rk-tab ${active} ${dim}" data-stage="${s.no}">${String(s.no).padStart(2, '0')}</button>`;
            }).join('');

            const banner = enabled ? '' : `
                <div class="rk-banner">
                    <div class="rk-banner-title">ランキング参加: OFF</div>
                    <div class="rk-banner-desc">ON にするとクリア時に自動送信されます。<br>設定メニューから変更できます。</div>
                </div>
            `;

            return `
                <div class="screen ranking-screen">
                    <div class="screen-header">
                        <button class="btn-back" data-action="back" aria-label="BACK">◀ BACK</button>
                        <div class="rk-title">RANKING</div>
                        <div style="width:64px"></div>
                    </div>
                    <div class="rk-tabs scroll-x">${tabs}</div>
                    ${banner}
                    <div class="rk-stage-head">
                        <span class="rk-stage-no">STAGE ${String(currentStage).padStart(2, '0')}</span>
                        <span class="rk-stage-name">${stages[currentStage - 1].name}</span>
                    </div>
                    <div class="rk-colhead">
                        <span class="rk-pos">#</span>
                        <span></span>
                        <span class="rk-name">NAME</span>
                        <span class="rk-rank">R</span>
                        <span class="rk-score">SCORE</span>
                        <span class="rk-time">TIME</span>
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

            // BACK
            root.querySelector('[data-action="back"]')?.addEventListener('click', () => {
                window.SE?.fire?.('menuCursor');
                window.Router.show('stageSelect');
            });

            // タブ切替
            root.querySelectorAll('.rk-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    const no = parseInt(btn.dataset.stage, 10);
                    if (!no || no === currentStage) return;
                    currentStage = no;
                    window.SE?.fire?.('menuCursor');
                    // 再描画 (全画面 reload するほどの内容でもないので局所 update)
                    root.querySelectorAll('.rk-tab').forEach(b => {
                        b.classList.toggle('is-active', parseInt(b.dataset.stage, 10) === currentStage);
                    });
                    root.querySelector('.rk-stage-no').textContent = `STAGE ${String(currentStage).padStart(2, '0')}`;
                    root.querySelector('.rk-stage-name').textContent =
                        window.CONFIG.STAGES[currentStage - 1].name;
                    rerenderList(root);
                });
            });

            // アバター画像パスの解決が manifest load 完了後なので、load を待ってから描画
            const kickoff = () => rerenderList(root);
            if (window.Avatars?.load) {
                window.Avatars.load().then(kickoff).catch(kickoff);
            } else {
                kickoff();
            }
        },
    };

    window.Screens.ranking = Screen;
})();
