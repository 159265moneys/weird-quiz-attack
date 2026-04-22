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

            // 全体進捗 (解放ステージ / クリア数)
            const progress = window.Save.data?.progress || {};
            const unlocked = progress.unlockedStage || 1;
            const clearedCount = (progress.clearedStages || []).length;

            const list = stages.map((s) => {
                const locked = !window.Save.isStageUnlocked(s.no);
                const score = window.Save.getStageScore(s.no);
                const rank = score?.bestRank || null;
                const best = score?.best || 0;
                const plays = score?.plays || 0;

                // kDist から「K=N(xC)+K=M(xC)」のサマリを作る
                const kSummary = (s.kDist || [[1, s.slots]])
                    .map(([k, c]) => `K${k}×${c}`).join('+');

                // ランクバッジ: 未クリア / ロック / クリア済みで分岐
                let rankBadge;
                if (locked) {
                    rankBadge = `
                        <div class="stage-rank-badge is-locked">
                            <div class="rank-icon">🔒</div>
                            <div class="rank-sub">LOCKED</div>
                        </div>`;
                } else if (rank) {
                    rankBadge = `
                        <div class="stage-rank-badge rank-${rank}">
                            <div class="rank-text">${rank}</div>
                            <div class="rank-sub">BEST</div>
                        </div>`;
                } else {
                    rankBadge = `
                        <div class="stage-rank-badge is-pending">
                            <div class="rank-text">?</div>
                            <div class="rank-sub">NEW</div>
                        </div>`;
                }

                const statLine = locked ? '' : `
                    <div class="stage-stats">
                        <span class="stat">BEST ${best.toLocaleString()}</span>
                        <span class="stat">PLAY ${plays}</span>
                    </div>`;

                return `
                    <button class="stage-card ${stressClass(s.stress)} ${locked ? 'is-locked' : ''}"
                            data-stage="${s.no}" ${locked ? 'disabled' : ''}>
                        <div class="stage-no-col">
                            <div class="stage-no">${String(s.no).padStart(2, '0')}</div>
                            <div class="stage-stress">${stressLabel(s.stress)}</div>
                        </div>
                        <div class="stage-info">
                            <div class="stage-name">${s.name}</div>
                            <div class="stage-meta">${kSummary} / ${window.CONFIG.QUESTIONS_PER_STAGE}Q</div>
                            ${statLine}
                        </div>
                        ${rankBadge}
                    </button>
                `;
            }).join('');

            return `
                <div class="screen stage-select-screen">
                    <div class="screen-header" style="margin-bottom:16px;">
                        <button class="back-btn" data-action="back">◀ BACK</button>
                        <div class="text-mute" style="font-size:24px;letter-spacing:3px;">v${window.CONFIG.VERSION}</div>
                    </div>
                    <div class="stage-title">STAGE SELECT</div>
                    <div class="stage-progress">
                        <span class="sp-label">UNLOCKED</span>
                        <span class="sp-value">${unlocked}/10</span>
                        <span class="sp-sep">·</span>
                        <span class="sp-label">CLEARED</span>
                        <span class="sp-value">${clearedCount}/10</span>
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

            // 初回のみナビゲーターで簡易チュートリアル
            if (!window.Save.getFlag('tutorialDone')) {
                runTutorial();
            }
        },
    };

    function runTutorial() {
        if (!window.Navigator) return;
        const lines = [
            'ようこそ、変なクイズへ。',
            'ルールはシンプル。クイズに答えてステージをクリアする。',
            '…のはずが、進むほど UI が壊れていく。',
            '文字が崩れ、ボタンが動き、キーボードが入れ替わる。',
            '慌てないで。冷静に読めば、たいてい答えは見えるはず。',
            'じゃあ、始めよう。',
        ];
        const poses = ['hi', 'basic', 'think', 'think_light', 'basic', 'happy'];
        window.Navigator.speak(lines, {
            poses,
            onDone: () => {
                window.Save.setFlag('tutorialDone', true);
            },
        });
    }

    async function startStage(no) {
        window.GameState.currentStage = no;
        window.GameState.resetSession();
        window.GameState.session.startAt = Date.now();

        try {
            const all = await window.QuizLoader.loadAll();
            const picked = window.QuizLoader.pickForStage(all, no, window.CONFIG.QUESTIONS_PER_STAGE);
            window.GameState.session.questions = picked;
            // このステージで何問目にギミックを出すか事前抽選
            const slots = window.GimmickSelector.pickGimmickSlots(no, picked.length);
            window.GameState.session.gimmickSlots = slots;
            // 各 slot に K 値 (同時ギミック数) を割当
            window.GameState.session.kAssignment =
                window.GimmickSelector.generateKAssignment(no, slots);
            // B18 (偽エラー表示): 確率 (CONFIG.B18_STAGE_PROB) で 1 問だけ発生する特別枠。
            // 通常のギミックスロットに依存せず重ねて発動する。
            const b18Prob = window.CONFIG.B18_STAGE_PROB ?? 1.0;
            window.GameState.session.b18Slot = Math.random() < b18Prob
                ? Math.floor(Math.random() * picked.length)
                : -1;
            console.log('[Stage]', no, 'slots:', slots,
                'K:', window.GameState.session.kAssignment,
                'b18Slot:', window.GameState.session.b18Slot);
            window.Router.show('question');
        } catch (e) {
            console.error(e);
            alert('問題の読み込みに失敗しました。HTTPサーバ経由で開いているか確認してください。');
        }
    }

    window.Screens.stageSelect = Screen;
})();
