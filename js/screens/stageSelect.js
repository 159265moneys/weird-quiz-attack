/* ============================================================
   stageSelect.js — ステージ選択画面
   ============================================================ */

(function () {
    function stressClass(s) {
        if (s === 'M') return 'is-stress';
        if (s === 'X') return 'is-extreme';
        return '';
    }

    function stressLabel(s) {
        if (s === 'E') return 'EASY';
        if (s === 'M') return 'STRESS';
        if (s === 'X') return 'EXTREME';
        return '';
    }

    const Screen = {
        render() {
            const stages = window.CONFIG.STAGES;

            const list = stages.map((s) => {
                const locked = !window.Save.isStageUnlocked(s.no);
                const score = window.Save.getStageScore(s.no);
                const rank = score?.bestRank || '-';

                return `
                    <button class="stage-card ${stressClass(s.stress)} ${locked ? 'is-locked' : ''}"
                            data-stage="${s.no}" ${locked ? 'disabled' : ''}>
                        <div class="stage-no">${String(s.no).padStart(2, '0')}</div>
                        <div class="stage-info">
                            <div class="stage-name">${s.name}</div>
                            <div class="stage-meta">
                                ${stressLabel(s.stress)} / GIMMICKS ${s.K[0]}-${s.K[1]} / ${window.CONFIG.QUESTIONS_PER_STAGE}Q
                            </div>
                        </div>
                        <div class="stage-rank">${locked ? '🔒' : rank}</div>
                    </button>
                `;
            }).join('');

            return `
                <div class="screen stage-select-screen">
                    <div class="screen-header">
                        <button class="back-btn" data-action="back">◀ BACK</button>
                        <div class="stage-title" style="flex:1; margin-bottom:0;">STAGE SELECT</div>
                        <div style="width:160px;"></div>
                    </div>
                    <div class="scroll-area">
                        <div class="stage-list">${list}</div>
                    </div>
                </div>
            `;
        },

        init() {
            document.querySelector('[data-action="back"]')?.addEventListener('click', () => {
                window.Router.show('title');
            });

            document.querySelectorAll('.stage-card').forEach((card) => {
                card.addEventListener('click', () => {
                    if (card.classList.contains('is-locked')) return;
                    const no = parseInt(card.dataset.stage, 10);
                    startStage(no);
                });
            });
        },
    };

    async function startStage(no) {
        window.GameState.currentStage = no;
        window.GameState.resetSession();
        window.GameState.session.startAt = Date.now();

        try {
            const all = await window.QuizLoader.loadAll();
            const picked = window.QuizLoader.pickForStage(all, no, window.CONFIG.QUESTIONS_PER_STAGE);
            window.GameState.session.questions = picked;
            window.Router.show('question');
        } catch (e) {
            console.error(e);
            alert('問題の読み込みに失敗しました。HTTPサーバ経由で開いているか確認してください。');
        }
    }

    window.Screens.stageSelect = Screen;
})();
