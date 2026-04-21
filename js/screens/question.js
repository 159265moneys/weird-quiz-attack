/* ============================================================
   question.js — 出題画面 (Phase 1 プレースホルダー)
   崩壊UIギミックやタイマーは Phase 2 以降で追加。
   ============================================================ */

(function () {
    function currentQ() {
        const s = window.GameState.session;
        return s.questions[s.index];
    }

    const Screen = {
        render() {
            const s = window.GameState.session;
            const q = currentQ();
            if (!q) return '<div class="screen"><div class="text-center" style="font-size:48px;margin-top:200px">NO QUESTION</div></div>';

            const total = s.questions.length;
            const num = s.index + 1;
            const genreLabel = window.CONFIG.GENRE_LABELS[q.genre] || q.genre;

            let interaction = '';
            if (q.mode === 'choice') {
                interaction = `
                    <div class="q-choices">
                        ${q.choices.map((c, i) => `
                            <button class="q-choice" data-idx="${i}">${c}</button>
                        `).join('')}
                    </div>
                `;
            } else {
                // input モード: Phase 1 ではダミー
                interaction = `
                    <div class="q-input-area">___</div>
                    <div class="text-center text-mute" style="margin-bottom:24px;font-size:28px;">
                        [ 内製文字盤は Phase 3 で実装 ]
                    </div>
                    <button class="q-submit" data-action="dummy-ok">仮: 正解扱い</button>
                    <div style="height:16px;"></div>
                    <button class="q-submit" data-action="dummy-ng" style="background:var(--accent-red);border-color:var(--accent-red);box-shadow:8px 8px 0 var(--accent-red-dim);">仮: 不正解扱い</button>
                `;
            }

            return `
                <div class="screen question-screen">
                    <div class="q-header">
                        <span>STAGE ${window.GameState.currentStage} / Q ${num}/${total}</span>
                        <span>[${genreLabel}] DIFF ${q.difficulty}</span>
                    </div>

                    <div class="q-timer-bar"><div class="q-timer-fill"></div></div>

                    <div class="q-stem">${q.question}</div>

                    ${interaction}
                </div>
            `;
        },

        init() {
            const q = currentQ();
            if (!q) return;

            if (q.mode === 'choice') {
                document.querySelectorAll('.q-choice').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.idx, 10);
                        const correct = idx === q.answer;
                        advance(q, correct, String(idx));
                    });
                });
            } else {
                document.querySelector('[data-action="dummy-ok"]')?.addEventListener('click', () => {
                    advance(q, true, '[DUMMY-OK]');
                });
                document.querySelector('[data-action="dummy-ng"]')?.addEventListener('click', () => {
                    advance(q, false, '[DUMMY-NG]');
                });
            }
        },
    };

    function advance(q, correct, userInput) {
        const s = window.GameState.session;
        s.answers.push({
            id: q.id,
            correct,
            userInput,
            timeMs: 0, // Phase 2 で計測
        });
        if (correct) s.score += 1000;

        if (s.index + 1 >= s.questions.length) {
            s.endAt = Date.now();
            window.Router.show('result');
        } else {
            s.index += 1;
            window.Router.reload();
        }
    }

    window.Screens.question = Screen;
})();
