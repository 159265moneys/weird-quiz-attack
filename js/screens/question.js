/* ============================================================
   question.js — 出題画面 (Phase 2: タイマー/判定パイプライン)
   崩壊UIギミックは Phase 5 で追加。
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = window.Scoring.Q_TIME_LIMIT_MS;

    // セッションごとに使う状態
    let questionStartAt = 0;
    let timerRAF = 0;
    let resolved = false; // 回答確定済みかどうか (二重入力防止)

    function currentQ() {
        const s = window.GameState.session;
        return s.questions[s.index];
    }

    const Screen = {
        render() {
            const s = window.GameState.session;
            const q = currentQ();
            if (!q) {
                return '<div class="screen"><div class="text-center" style="font-size:48px;margin-top:200px">NO QUESTION</div></div>';
            }
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
                        <span id="qTimerLabel">100.0s</span>
                        <span>[${genreLabel}] DIFF ${q.difficulty}</span>
                    </div>

                    <div class="q-timer-bar"><div class="q-timer-fill" id="qTimerFill"></div></div>

                    <div class="q-stem">${q.question}</div>

                    ${interaction}
                </div>
            `;
        },

        init() {
            const q = currentQ();
            if (!q) return;

            resolved = false;
            questionStartAt = Date.now();
            startTimer();

            if (q.mode === 'choice') {
                document.querySelectorAll('.q-choice').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.idx, 10);
                        const correct = idx === q.answer;
                        resolveAnswer(correct, String(idx), 'user');
                    });
                });
            } else {
                document.querySelector('[data-action="dummy-ok"]')?.addEventListener('click', () => {
                    resolveAnswer(true, '[DUMMY-OK]', 'user');
                });
                document.querySelector('[data-action="dummy-ng"]')?.addEventListener('click', () => {
                    resolveAnswer(false, '[DUMMY-NG]', 'user');
                });
            }

            // デバッグからの強制回答
            window.addEventListener('debug:forceAnswer', onDebugForce);
        },

        destroy() {
            stopTimer();
            window.removeEventListener('debug:forceAnswer', onDebugForce);
        },
    };

    function onDebugForce(ev) {
        const kind = ev.detail;
        if (resolved) return;
        if (kind === 'win') {
            resolveAnswer(true, '[DEBUG-WIN]', 'debug');
        } else if (kind === 'lose') {
            resolveAnswer(false, '[DEBUG-LOSE]', 'debug');
        } else if (kind === 'skip') {
            resolveAnswer(false, '[DEBUG-SKIP]', 'debug');
        }
    }

    function startTimer() {
        stopTimer();
        const loop = () => {
            const elapsed = Date.now() - questionStartAt;
            const remaining = Math.max(0, Q_TIME_LIMIT_MS - elapsed);
            const pct = (remaining / Q_TIME_LIMIT_MS) * 100;

            const fill = document.getElementById('qTimerFill');
            const label = document.getElementById('qTimerLabel');
            if (fill) {
                fill.style.width = pct + '%';
                if (pct < 20) fill.style.background = 'var(--accent-red)';
                else if (pct < 50) fill.style.background = 'var(--accent-warn)';
                else fill.style.background = 'var(--accent-cyan)';
            }
            if (label) {
                label.textContent = (remaining / 1000).toFixed(1) + 's';
                if (pct < 20) label.style.color = 'var(--accent-red)';
                else if (pct < 50) label.style.color = 'var(--accent-warn)';
                else label.style.color = 'var(--text-dim)';
            }

            if (remaining <= 0) {
                resolveAnswer(false, '[TIMEOUT]', 'timeout');
                return;
            }
            timerRAF = requestAnimationFrame(loop);
        };
        timerRAF = requestAnimationFrame(loop);
    }

    function stopTimer() {
        if (timerRAF) {
            cancelAnimationFrame(timerRAF);
            timerRAF = 0;
        }
    }

    function resolveAnswer(correct, userInput, reason) {
        if (resolved) return;
        resolved = true;
        stopTimer();

        const q = currentQ();
        const s = window.GameState.session;
        const timeMs = Math.min(Q_TIME_LIMIT_MS, Date.now() - questionStartAt);

        s.answers.push({
            id: q.id,
            correct,
            userInput,
            timeMs,
            reason,
        });

        showFeedback(correct, reason === 'timeout');

        const delay = reason === 'timeout' ? 650 : 400;
        setTimeout(() => {
            if (s.index + 1 >= s.questions.length) {
                s.endAt = Date.now();
                window.Router.show('result');
            } else {
                s.index += 1;
                window.Router.reload();
            }
        }, delay);
    }

    function showFeedback(correct, isTimeout) {
        const app = document.getElementById('app');
        if (!app) return;
        const el = document.createElement('div');
        el.className = 'q-feedback ' + (correct ? 'ok' : 'ng');
        el.textContent = correct ? '◯' : (isTimeout ? 'TIME\nUP' : '✕');
        if (isTimeout) el.classList.add('is-timeout');
        app.appendChild(el);
        setTimeout(() => el.remove(), 600);
    }

    // デバッグからも使えるよう外に出す
    window.QuestionScreen = { resolveAnswer: (c, input, reason) => resolveAnswer(c, input, reason || 'debug') };

    window.Screens.question = Screen;
})();
