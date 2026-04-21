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
                        <button class="btn btn-accent-cyan" data-action="retry">もう一度</button>
                        <button class="btn" data-action="stageSelect">ステージ選択</button>
                        <button class="btn" data-action="title">タイトル</button>
                    </div>
                </div>
            `;
        },

        init() {
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

    window.Screens.result = Screen;
})();
