/* ============================================================
   debug.js — 開発用デバッグパネル
   ------------------------------------------------------------
   有効化方法:
     ・PC: Shift + D
     ・URL: ?debug=1 もしくは #debug をつけて開く
     ・モバイル: タイトル画面のフッター "v0.1.0-alpha" を5連タップ
   操作:
     ・Q画面: 強制正解 / 強制不正解 / SKIP
     ・共通:   全ステージ解放 / セーブ削除 / タイトルへ
   ============================================================ */

(function () {
    const STORAGE_KEY = 'kuso_quiz_debug_enabled';

    const Debug = {
        enabled: false,
        overlayEl: null,

        init() {
            // 保存されていたら復元
            if (localStorage.getItem(STORAGE_KEY) === '1') {
                this.enabled = true;
            }
            // URL hint
            if (location.hash.includes('debug') || location.search.includes('debug=1')) {
                this.enabled = true;
            }

            document.addEventListener('keydown', (e) => {
                // Shift + D
                if ((e.key === 'D' || e.key === 'd') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    this.toggle();
                }
                if (!this.enabled) return;
                // Q画面時のクイックキー
                if (window.Router?.current === 'question') {
                    if (e.key === 'w' || e.key === 'W') {
                        window.dispatchEvent(new CustomEvent('debug:forceAnswer', { detail: 'win' }));
                    } else if (e.key === 'l' || e.key === 'L') {
                        window.dispatchEvent(new CustomEvent('debug:forceAnswer', { detail: 'lose' }));
                    } else if (e.key === 's' || e.key === 'S') {
                        window.dispatchEvent(new CustomEvent('debug:forceAnswer', { detail: 'skip' }));
                    }
                }
            });

            // モバイル用: タイトル画面のバージョン5連タップ
            this.installFooterTapHook();

            this.render();
        },

        toggle() {
            this.enabled = !this.enabled;
            localStorage.setItem(STORAGE_KEY, this.enabled ? '1' : '0');
            this.render();
        },

        installFooterTapHook() {
            let taps = 0;
            let last = 0;
            document.addEventListener('click', (e) => {
                const t = e.target;
                if (!(t instanceof HTMLElement)) return;
                if (!t.closest('.title-footer')) return;
                const now = Date.now();
                if (now - last > 600) taps = 0;
                last = now;
                taps++;
                if (taps >= 5) {
                    taps = 0;
                    this.toggle();
                }
            });
        },

        render() {
            if (this.overlayEl) {
                this.overlayEl.remove();
                this.overlayEl = null;
            }
            if (!this.enabled) return;

            const el = document.createElement('div');
            el.className = 'debug-overlay';
            el.innerHTML = this.content();
            document.body.appendChild(el);
            this.overlayEl = el;
            this.attach();
        },

        refresh() {
            if (!this.enabled || !this.overlayEl) return;
            this.overlayEl.innerHTML = this.content();
            this.attach();
        },

        content() {
            const s = window.GameState?.session || {};
            const q = s.questions?.[s.index];
            const rtr = window.Router?.current || '-';

            // 現在のギミック一覧
            const active = window.Gimmicks?.listActive?.() || [];
            const last = window.Gimmicks?.listLastApplied?.() || [];
            const all = window.GimmickRegistry?.all || [];

            // 各ギミックを手動で試せるボタン (問題画面のときだけ)
            const gkButtons = rtr === 'question'
                ? all.map(g => `<button data-gk="${g.id}" title="${g.name} (ST${g.minStage ?? 1}+)">${g.id}<small style="opacity:.5">@${g.minStage ?? 1}</small></button>`).join('')
                : '';

            return `
                <div class="dbg-head">
                    <span>DEBUG</span>
                    <button data-act="close" title="閉じる (Shift+D)">×</button>
                </div>
                <div class="dbg-info">
                    screen: <b>${rtr}</b><br>
                    stage:  ${window.GameState?.currentStage ?? '-'}<br>
                    Q:      ${s.index != null ? (s.index + 1) : '-'}/${s.questions?.length ?? '-'}${q ? ' [' + q.id + ']' : ''}<br>
                    mode:   ${q?.mode ?? '-'} | diff: ${q?.difficulty ?? '-'}${q ? ' | ans:' + (q.mode === 'choice' ? q.answer : q.answer_text) : ''}<br>
                    GK now: <b style="color:#ff0">${active.join(',') || '-'}</b><br>
                    GK last: ${last.join(',') || '-'}<br>
                    GK slots: <span style="color:#0ff">${(s.gimmickSlots || []).map(i => i + 1).join(',') || '-'}</span>
                </div>
                <div class="dbg-section">Q操作 (W/L/S)</div>
                <div class="dbg-actions">
                    <button data-act="win" class="ok">強制正解 (W)</button>
                    <button data-act="lose" class="ng">強制不正解 (L)</button>
                    <button data-act="skip">SKIP (S)</button>
                </div>
                ${rtr === 'question' ? `
                <div class="dbg-section">崩壊UIギミック</div>
                <div class="dbg-actions">
                    <button data-act="gk-clear">CLEAR</button>
                    <button data-act="gk-reapply">RE-APPLY</button>
                </div>
                <div class="dbg-actions" style="grid-template-columns: repeat(3, 1fr);">
                    ${gkButtons}
                </div>
                ` : ''}
                <div class="dbg-section">セーブ</div>
                <div class="dbg-actions">
                    <button data-act="unlock">全ステージ解放</button>
                    <button data-act="reset" class="ng">セーブ削除</button>
                </div>
                <div class="dbg-section">画面ジャンプ</div>
                <div class="dbg-actions">
                    <button data-act="title">タイトル</button>
                    <button data-act="stageSelect">ステージ選択</button>
                    <button data-act="result">リザルト(ダミー)</button>
                </div>
            `;
        },

        attach() {
            this.overlayEl.querySelectorAll('[data-act]').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const act = btn.dataset.act;
                    this.handle(act);
                    setTimeout(() => this.refresh(), 80);
                });
            });
            // ギミック個別ボタン: 現在の問題に対して単発で適用
            this.overlayEl.querySelectorAll('[data-gk]').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const id = btn.dataset.gk;
                    const q = window.GameState.session.questions?.[window.GameState.session.index];
                    if (!q) return;
                    window.Gimmicks.setForced([id]);
                    window.Gimmicks.applyForQuestion(window.GameState.currentStage, q);
                    setTimeout(() => this.refresh(), 80);
                });
            });
        },

        handle(act) {
            switch (act) {
                case 'close':
                    this.toggle();
                    return;
                case 'win':
                case 'lose':
                case 'skip':
                    window.dispatchEvent(new CustomEvent('debug:forceAnswer', { detail: act }));
                    return;
                case 'unlock':
                    window.Save.data.progress.unlockedStage = 10;
                    window.Save.persist();
                    if (window.Router.current === 'stageSelect') window.Router.reload();
                    return;
                case 'reset':
                    if (confirm('セーブデータを削除します。よろしい？')) {
                        window.Save.reset();
                        window.Router.show('title');
                    }
                    return;
                case 'title':
                    window.Router.show('title');
                    return;
                case 'stageSelect':
                    window.Router.show('stageSelect');
                    return;
                case 'result':
                    // ダミーセッションを作ってリザルトへ
                    const gs = window.GameState;
                    gs.currentStage = gs.currentStage || 1;
                    gs.resetSession();
                    gs.session.questions = new Array(window.CONFIG.QUESTIONS_PER_STAGE).fill({});
                    gs.session.answers = gs.session.questions.map(() => ({ correct: true, timeMs: 10000 }));
                    gs.session.startAt = Date.now() - 200000;
                    gs.session.endAt = Date.now();
                    window.Router.show('result');
                    return;
                case 'gk-clear':
                    window.Gimmicks?.dispose();
                    return;
                case 'gk-reapply':
                    const gq = window.GameState.session.questions?.[window.GameState.session.index];
                    if (gq) window.Gimmicks?.applyForQuestion(window.GameState.currentStage, gq);
                    return;
            }
        },
    };

    window.Debug = Debug;
})();
