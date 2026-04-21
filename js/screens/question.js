/* ============================================================
   question.js — 出題画面 (Phase 3: input モードは内製文字盤を使用)
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = window.Scoring.Q_TIME_LIMIT_MS;

    let questionStartAt = 0;
    let timerRAF = 0;
    let resolved = false;

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

            let answerZone = '';
            if (q.mode === 'choice') {
                answerZone = `
                    <div class="q-zone-answer is-choice">
                        <div class="q-choices">
                            ${q.choices.map((c, i) => `
                                <button class="q-choice" data-idx="${i}">${escapeHTML(c)}</button>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                const suggested = window.Judge.suggestMode(q);
                const hint = window.Judge.hintLabel(suggested);
                answerZone = `
                    <div class="q-zone-answer is-input">
                        <div class="q-input-hint">${hint}</div>
                        <div class="q-input-box is-empty" id="qInputBox">
                            <span class="q-input-text">文字盤で入力</span><span class="q-caret"></span>
                        </div>
                        <div id="keyboardHost"></div>
                    </div>
                `;
            }

            return `
                <div class="screen question-screen">
                    <div class="q-zone-header">
                        <div class="q-header">
                            <span>STAGE ${window.GameState.currentStage} / Q ${num}/${total}</span>
                            <span id="qTimerLabel">100.0s</span>
                            <span>[${genreLabel}] DIFF ${q.difficulty}</span>
                        </div>
                        <div class="q-timer-bar"><div class="q-timer-fill" id="qTimerFill"></div></div>
                    </div>

                    <div class="q-zone-question">
                        <div class="q-stem">${escapeHTML(q.question)}</div>
                    </div>

                    ${answerZone}
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
                // 入力モード: 内製文字盤をマウント
                const suggested = window.Judge.suggestMode(q);
                window.Keyboard.mount('#keyboardHost', {
                    mode: suggested,
                    onChange: (value) => updateInputBox(value),
                    onSubmit: (value) => {
                        if (resolved) return;
                        const correct = window.Judge.judge(q, value);
                        resolveAnswer(correct, value, 'user');
                    },
                    maxLength: 20,
                });
            }

            window.addEventListener('debug:forceAnswer', onDebugForce);
        },

        destroy() {
            stopTimer();
            window.removeEventListener('debug:forceAnswer', onDebugForce);
            if (window.Keyboard?.unmount) window.Keyboard.unmount();
        },
    };

    function updateInputBox(value) {
        const box = document.getElementById('qInputBox');
        if (!box) return;
        const text = box.querySelector('.q-input-text');
        if (text) text.textContent = value || '';
        if (value && value.length > 0) box.classList.remove('is-empty');
        else {
            box.classList.add('is-empty');
            if (text) text.textContent = '文字盤で入力';
        }
    }

    function onDebugForce(ev) {
        const kind = ev.detail;
        if (resolved) return;
        if (kind === 'win') resolveAnswer(true, '[DEBUG-WIN]', 'debug');
        else if (kind === 'lose') resolveAnswer(false, '[DEBUG-LOSE]', 'debug');
        else if (kind === 'skip') resolveAnswer(false, '[DEBUG-SKIP]', 'debug');
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

        const delay = reason === 'timeout' ? 650 : 420;
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

    function escapeHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    window.QuestionScreen = { resolveAnswer: (c, input, reason) => resolveAnswer(c, input, reason || 'debug') };
    window.Screens.question = Screen;
})();
