/* ============================================================
   result.js — リザルト画面 (Phase 1 プレースホルダー)
   シェア機能や詳細演出は Phase 6。
   ============================================================ */

(function () {
    function computeRank(correctRatio) {
        if (correctRatio >= 0.95) return 'S';
        if (correctRatio >= 0.85) return 'A';
        if (correctRatio >= 0.70) return 'B';
        if (correctRatio >= 0.50) return 'C';
        if (correctRatio >= 0.30) return 'D';
        if (correctRatio > 0.00) return 'E';
        return 'F';
    }

    const Screen = {
        render() {
            const s = window.GameState.session;
            const total = s.questions.length || 1;
            const correct = s.answers.filter(a => a.correct).length;
            const ratio = correct / total;
            const rank = computeRank(ratio);
            const timeSec = Math.max(0, Math.round((s.endAt - s.startAt) / 1000));

            // セーブ
            if (window.GameState.currentStage) {
                window.Save.recordStageClear(window.GameState.currentStage, s.score, rank);
            }

            return `
                <div class="screen result-screen">
                    <div class="result-rank">${rank}</div>
                    <div class="result-score">${s.score.toLocaleString()}</div>
                    <div class="result-detail">
                        正解 ${correct} / ${total}<br>
                        TIME ${timeSec}s<br>
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
                // 再抽選
                (async () => {
                    const all = await window.QuizLoader.loadAll();
                    window.GameState.resetSession();
                    window.GameState.session.startAt = Date.now();
                    window.GameState.session.questions = window.QuizLoader.pickForStage(
                        all, no, window.CONFIG.QUESTIONS_PER_STAGE
                    );
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
