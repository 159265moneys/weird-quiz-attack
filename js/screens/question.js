/* ============================================================
   question.js — 出題画面 (Phase 3: input モードは内製文字盤を使用)
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = window.Scoring.Q_TIME_LIMIT_MS;

    let questionStartAt = 0;
    let timerRAF = 0;
    let resolved = false;
    let selectedIdx = -1;   // choice モード: 「回答」ボタン押下前に選んでいる選択肢

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
                        <button type="button" class="q-submit" id="qSubmitBtn" disabled>回答</button>
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
            selectedIdx = -1;
            questionStartAt = Date.now();
            startTimer();

            if (q.mode === 'choice') {
                // 選択肢タップ = 選択のみ。実際の回答提出は「回答」ボタン
                // (反転タップ等のギミックで初見殺しを避けるため 2段階化)
                document.querySelectorAll('.q-choice').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        if (resolved) return;
                        const idx = parseInt(btn.dataset.idx, 10);
                        if (Number.isNaN(idx)) return;  // C02 ダミー選択肢は data-idx 無し
                        selectedIdx = idx;
                        document.querySelectorAll('.q-choice').forEach(b => b.classList.remove('is-selected'));
                        btn.classList.add('is-selected');
                        const submitBtn = document.getElementById('qSubmitBtn');
                        if (submitBtn) submitBtn.disabled = false;
                    });
                });
                const submitBtn = document.getElementById('qSubmitBtn');
                if (submitBtn) {
                    submitBtn.addEventListener('click', () => {
                        if (resolved) return;
                        if (selectedIdx < 0) return;
                        const correct = selectedIdx === q.answer;
                        resolveAnswer(correct, String(selectedIdx), 'user');
                    });
                }
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

            // --- 崩壊UIギミック適用 ---
            // DOMが整い、キーボードもmountされた後に適用する必要があるため
            // 次ティックに回す (Keyboard.mount 内で innerHTML 差し替えが走るため)
            setTimeout(() => {
                if (resolved) return;
                window.Gimmicks?.applyForQuestion(window.GameState.currentStage, q);
            }, 0);
        },

        destroy() {
            stopTimer();
            window.removeEventListener('debug:forceAnswer', onDebugForce);
            window.Gimmicks?.dispose();
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

        // G2 誤判定: 正解かつ user 由来回答に限り 15% で裏返す。
        // timeout や debug の強制判定には干渉しない。
        if (correct && s.misjudge && reason === 'user' && Math.random() < 0.15) {
            correct = false;
            reason = 'misjudge';
        }

        s.answers.push({
            id: q.id,
            correct,
            userInput,
            timeMs,
            reason,
            gimmicks: window.Gimmicks?.listLastApplied() || [],
        });

        // B21 即死: ギミック dispose 前にフラグを拾う (dispose で false に戻るため)
        const isInstantDeath = !!s.instantDeath;

        // ◯×フラッシュ前にギミックを解除して見た目をリセット
        window.Gimmicks?.dispose();

        // 不正解の場合は正解が読める時間を確保
        const fbDuration = correct ? 520 : 1500;
        showFeedback(correct, reason === 'timeout', q, fbDuration);

        setTimeout(() => {
            // --- B21 即死: 不正解だったら残問をスキップして結果画面へ ---
            if (!correct && isInstantDeath) {
                while (s.index + 1 < s.questions.length) {
                    s.index += 1;
                    const qSkip = s.questions[s.index];
                    s.answers.push({
                        id: qSkip.id,
                        correct: false,
                        userInput: '[INSTANT-DEATH]',
                        timeMs: 0,
                        reason: 'instant-death',
                        gimmicks: [],
                    });
                }
                s.endAt = Date.now();
                s.deathEnd = true;   // 結果画面で演出用に参照可
                window.Router.show('result');
                return;
            }

            if (s.index + 1 >= s.questions.length) {
                s.endAt = Date.now();
                window.Router.show('result');
            } else {
                s.index += 1;
                window.Router.reload();
            }
        }, fbDuration);
    }

    function answerTextOf(q) {
        if (!q) return '';
        if (q.mode === 'choice') return q.choices?.[q.answer] ?? '';
        if (q.mode === 'input') return q.answer_text ?? '';
        return '';
    }

    function showFeedback(correct, isTimeout, q, durationMs) {
        const app = document.getElementById('app');
        if (!app) return;
        const el = document.createElement('div');
        el.className = 'q-feedback ' + (correct ? 'ok' : 'ng');
        if (isTimeout) el.classList.add('is-timeout');

        const mark = document.createElement('div');
        mark.className = 'q-feedback-mark';
        mark.textContent = correct ? '◯' : (isTimeout ? 'TIME\nUP' : '✕');
        el.appendChild(mark);

        // 不正解時: × の真下に正解を表示
        if (!correct) {
            const ans = answerTextOf(q);
            if (ans) {
                const ansEl = document.createElement('div');
                ansEl.className = 'q-feedback-answer';
                ansEl.innerHTML = `<span class="q-feedback-answer-label">正解</span><span class="q-feedback-answer-text">${escapeHTML(ans)}</span>`;
                el.appendChild(ansEl);
            }
        }

        app.appendChild(el);
        setTimeout(() => el.remove(), durationMs);
    }

    function escapeHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    window.QuestionScreen = { resolveAnswer: (c, input, reason) => resolveAnswer(c, input, reason || 'debug') };
    window.Screens.question = Screen;
})();
