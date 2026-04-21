/* ============================================================
   result.js — リザルト画面 (Phase 2: 新スコア/ランクを使用)
   ============================================================ */

(function () {
    const Screen = {
        render() {
            const result = window.Scoring.compute(window.GameState.session);
            const s = window.GameState.session;

            // セーブ (初回表示時のみ)
            if (window.GameState.currentStage && !s._saved) {
                window.Save.recordStageClear(window.GameState.currentStage, result.score, result.rank);
                s._saved = true;
            }

            // タイムアウト回数
            const timeouts = s.answers.filter(a => a.reason === 'timeout').length;

            return `
                <div class="screen result-screen">
                    <div class="result-rank rank-${result.rank}">${result.rank}</div>
                    <div class="result-score">${result.score.toLocaleString()}</div>
                    <div class="result-detail">
                        正解 ${result.correct} / ${result.total} (${Math.round(result.accuracy * 100)}%)<br>
                        TOTAL ${result.totalTimeSec.toFixed(1)}s / AVG ${result.avgTimeSec.toFixed(1)}s<br>
                        ${timeouts > 0 ? `<span class="text-red">TIMEOUT × ${timeouts}</span><br>` : ''}
                        STAGE ${window.GameState.currentStage}
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-accent-cyan" data-action="share">シェア</button>
                        <button class="btn" data-action="retry">もう一度</button>
                        <button class="btn" data-action="stageSelect">ステージ選択</button>
                        <button class="btn" data-action="title">タイトル</button>
                    </div>
                    <div class="share-toast" data-share-toast></div>
                </div>
            `;
        },

        init() {
            // シェアボタン
            document.querySelector('[data-action="share"]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                if (btn.disabled) return;
                btn.disabled = true;
                const prevLabel = btn.textContent;
                btn.textContent = '生成中...';

                try {
                    const result = window.Scoring.compute(window.GameState.session);
                    const s = window.GameState.session;
                    const timeouts = s.answers.filter(a => a.reason === 'timeout').length;
                    const stageNo = window.GameState.currentStage;
                    const stageDef = window.CONFIG.STAGES.find(x => x.no === stageNo) || {};
                    const stageInfo = { no: stageNo, name: stageDef.name || '', stress: stageDef.stress };

                    const canvas = window.ShareCard.render(result, stageInfo, {
                        timeouts,
                        deathEnd: !!s.deathEnd,
                    });
                    const blob = await window.ShareCard.toBlob(canvas);
                    const text = window.ShareCard.buildText(result, stageInfo);

                    const filename = `weirdquiz_stage${String(stageNo).padStart(2, '0')}_${result.rank}.png`;
                    const r = await window.ShareSheet.share({ blob, text, filename });

                    showToast(r);
                } catch (err) {
                    console.error('[Share] failed:', err);
                    showToast({ method: 'error', error: err });
                } finally {
                    btn.disabled = false;
                    btn.textContent = prevLabel;
                }
            });

            document.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
                const no = window.GameState.currentStage;
                (async () => {
                    const all = await window.QuizLoader.loadAll();
                    window.GameState.resetSession();
                    window.GameState.session.startAt = Date.now();
                    const picked = window.QuizLoader.pickForStage(
                        all, no, window.CONFIG.QUESTIONS_PER_STAGE
                    );
                    window.GameState.session.questions = picked;
                    const slots = window.GimmickSelector.pickGimmickSlots(no, picked.length);
                    window.GameState.session.gimmickSlots = slots;
                    window.GameState.session.kAssignment =
                        window.GimmickSelector.generateKAssignment(no, slots);
                    window.Router.show('question');
                })();
            });
            document.querySelector('[data-action="stageSelect"]')?.addEventListener('click', () => {
                window.Router.show('stageSelect');
            });
            document.querySelector('[data-action="title"]')?.addEventListener('click', () => {
                window.Router.show('title');
            });
        },
    };

    function showToast(r) {
        const el = document.querySelector('[data-share-toast]');
        if (!el) return;
        let msg = '';
        switch (r.method) {
            case 'share-file':         msg = 'シェアしました'; break;
            case 'share-text+download':msg = 'テキストをシェア / 画像をダウンロード'; break;
            case 'download+clipboard': msg = '画像をダウンロード / テキストをコピー'; break;
            case 'download':           msg = '画像をダウンロード'; break;
            case 'cancel':             msg = 'キャンセル'; break;
            case 'error':              msg = 'シェア失敗'; break;
            default:                   msg = r.method || '';
        }
        el.textContent = msg;
        el.classList.add('is-show');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => el.classList.remove('is-show'), 2200);
    }

    window.Screens.result = Screen;
})();
