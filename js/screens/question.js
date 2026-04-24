/* ============================================================
   question.js — 出題画面 (Phase 3: input モードは内製文字盤を使用)
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = window.Scoring.Q_TIME_LIMIT_MS;

    let questionStartAt = 0;
    let timerRAF = 0;
    let resolved = false;
    let countdownHandle = null;   // SE.scheduleCountdownBeeps の戻り値 (cancel 用)
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
                    <button type="button" class="q-abort-btn" id="qAbortBtn" aria-label="中断">中断</button>
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

            // ステージに応じた BGM に切替 (同ステージ問題間は idempotent で継続再生)
            const stageNo = window.GameState?.currentStage;
            if (stageNo) window.BGM?.play(`stage${stageNo}`);

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
                        window.SE?.fire('select');
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
                        // 確定音はあえて鳴らさない (直後の正解/不正解 SE と被って
                        // 何が鳴っているか分かりにくくなるため)。選択時の select SE で十分。
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
            window.addEventListener('gimmick:forceFail', onGimmickForceFail);

            // 中断ボタン (ギミックの影響を受けないよう最前面)
            const abortBtn = document.getElementById('qAbortBtn');
            if (abortBtn) {
                abortBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (resolved) return;
                    openAbortConfirm();
                });
            }

            // --- 崩壊UIギミック適用 ---
            // 問題文が「ギミック出る前に一瞬見える」状態を防ぐため、DOM 差し替え直後に
            // 同期的に適用する。この時点で Keyboard.mount も完了済みなので安全。
            window.Gimmicks?.applyForQuestion(window.GameState.currentStage, q);
        },

        destroy() {
            stopTimer();
            window.removeEventListener('debug:forceAnswer', onDebugForce);
            window.removeEventListener('gimmick:forceFail', onGimmickForceFail);
            window.Gimmicks?.dispose();
            if (window.Keyboard?.unmount) window.Keyboard.unmount();
            closeAbortConfirm();
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

    // G1 ランダム即死からの強制不正解 (reason を 'gimmick-death' に区別)
    function onGimmickForceFail(ev) {
        if (resolved) return;
        const reason = (ev.detail && ev.detail.reason) || 'gimmick-death';
        resolveAnswer(false, '', reason);
    }

    function startTimer() {
        stopTimer();
        // 残り 3/2/1/0 秒の "ピ ピ ピ ピー" を AudioContext 基準でまとめて予約。
        // 0 秒ぴったりに「ピー」が立ち上がるようサンプル精度スケジュールしているので、
        // 旧実装のような RAF 検知 + timeWarn 単発 + timeout SE 重畳は廃止。
        countdownHandle = window.SE?.scheduleCountdownBeeps?.(Q_TIME_LIMIT_MS) || null;
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
        // 予約済みのカウントダウンビープを早期解答/画面遷移時にキャンセル。
        // ピー未発火なら無音で終わる (stop(t<start) は発音されない)。
        if (countdownHandle) {
            try { countdownHandle.cancel(); } catch (_) {}
            countdownHandle = null;
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
            gimmicks: window.Gimmicks?.listLastApplied() || [],
        });

        // B21 即死: ギミック dispose 前にフラグを拾う (dispose で false に戻るため)
        const isInstantDeath = !!s.instantDeath;

        // ◯×フラッシュ前にギミックを解除して見た目をリセット
        window.Gimmicks?.dispose();

        // 正解/不正解/タイムアウトの SE
        // timeout は scheduleCountdownBeeps の「ピー」(0s 発火) が既に tiemout 告知を
        // 担っているため、ここでの追加 SE は鳴らさない (旧 timeout.mp3 の 6s ブーは廃止)。
        if (reason === 'timeout') {
            // no-op: 0s ピーで完結
        } else if (correct) {
            window.SE?.fire('correct');
        } else if (reason === 'instant-death' || reason === 'gimmick-death') {
            window.SE?.fire('gB21Death');
        } else {
            window.SE?.fire('wrong');
        }

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

    // --- 中断確認モーダル (pause ではなく完全中断 → ホームへ戻る) ---
    // モーダル表示中もタイマーは継続 (ズル防止)。
    let abortDom = null;
    function openAbortConfirm() {
        if (abortDom) return;
        const app = document.getElementById('app');
        if (!app) return;
        abortDom = document.createElement('div');
        abortDom.className = 'q-abort-overlay';
        abortDom.innerHTML = `
            <div class="q-abort-panel" role="dialog" aria-modal="true">
                <div class="q-abort-title">中断しますか？</div>
                <div class="q-abort-desc">現在のスコアは記録されず、<br>ホームへ戻ります。</div>
                <div class="q-abort-actions">
                    <button type="button" class="btn" data-abort="cancel">続ける</button>
                    <button type="button" class="btn btn-accent-red" data-abort="ok">中断する</button>
                </div>
            </div>
        `;
        app.appendChild(abortDom);
        window.SE?.fire('naviPop');
        abortDom.querySelector('[data-abort="cancel"]').addEventListener('click', () => {
            window.SE?.fire('cancel');
            closeAbortConfirm();
        });
        abortDom.querySelector('[data-abort="ok"]').addEventListener('click', () => {
            window.SE?.fire('confirm');
            doAbort();
        });
        // パネル外タップでキャンセル
        abortDom.addEventListener('click', (e) => {
            if (e.target === abortDom) closeAbortConfirm();
        });
    }
    function closeAbortConfirm() {
        if (!abortDom) return;
        abortDom.remove();
        abortDom = null;
    }
    function doAbort() {
        // 先に resolved を立てておくことで closeAbortConfirm のタイマー再開を抑止
        resolved = true;
        stopTimer();
        closeAbortConfirm();
        window.Gimmicks?.dispose();
        if (window.Keyboard?.unmount) window.Keyboard.unmount();
        // 現セッションは破棄 (結果画面には行かず、まっすぐホームへ)
        if (window.GameState?.resetSession) window.GameState.resetSession();
        window.Router.show('home');
    }

    function escapeHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    window.QuestionScreen = { resolveAnswer: (c, input, reason) => resolveAnswer(c, input, reason || 'debug') };
    window.Screens.question = Screen;
})();
