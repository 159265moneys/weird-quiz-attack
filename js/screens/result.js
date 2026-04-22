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

            // G7 スコア煽り: 最初は 0 を出しておく (init で本物に差し替え)
            const taunt = !!s.scoreTaunt;
            const initialScore = taunt ? 0 : result.score;

            // 上位 % / 現実換算ラベル (ランダムだが session 内で固定)
            const meta = window.Ranks?.META?.[result.rank] || {};
            const percentileText = window.Ranks?.percentileText(result.rank) || '';
            const seed = `${s.startAt}_${result.rank}`;
            const realLabel = window.Ranks?.pickLabel(result.rank, seed) || '';
            const isPositive = !!meta.positive;

            const rankAccent = window.Ranks?.accentColorVar(result.rank) || 'var(--accent-cyan)';

            // B21 で即死した場合は見出しに DEAD END を出す
            const deathHead = s.deathEnd
                ? '<div class="result-head result-head-dead">DEAD END</div>'
                : '<div class="result-head">STAGE CLEAR</div>';

            return `
                <div class="screen result-screen rank-${result.rank}">
                    ${deathHead}
                    <div class="result-rank-wrap">
                        <div class="result-rank-label">RANK</div>
                        <div class="result-rank rank-${result.rank}">${result.rank}</div>
                    </div>

                    <div class="result-percentile ${isPositive ? 'is-positive' : 'is-negative'}">
                        ${percentileText}
                    </div>
                    <div class="result-reallabel" style="--rank-accent:${rankAccent};">
                        ≒ ${realLabel}
                    </div>

                    <div class="result-score-wrap">
                        <div class="result-score-label">SCORE</div>
                        <div class="result-score" id="resultScore">${initialScore.toLocaleString()}</div>
                    </div>

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
            const s = window.GameState.session;
            const result = window.Scoring.compute(s);
            const target = result.score;
            const el = document.getElementById('resultScore');

            // G7 スコア煽り: スクランブル数字 → 本スコア着地
            // 通常時: 0 からの一方向カウントアップ (演出0.9秒、0.6秒遅らせてランク登場に合わせる)
            if (el) {
                if (s.scoreTaunt) {
                    el.classList.add('is-taunting');
                    const HOLD = 1400, TICKS = 24, DUR = 900;
                    setTimeout(() => {
                        let n = 0;
                        const step = () => {
                            n++;
                            const r = Math.floor(Math.random() * target * 2);
                            el.textContent = r.toLocaleString();
                            if (n < TICKS) {
                                setTimeout(step, DUR / TICKS);
                            } else {
                                el.classList.remove('is-taunting');
                                el.classList.add('is-settled');
                                el.textContent = target.toLocaleString();
                            }
                        };
                        step();
                    }, HOLD);
                } else {
                    const DELAY = 600, DUR = 900, TICKS = 28;
                    el.textContent = '0';
                    setTimeout(() => {
                        let n = 0;
                        const step = () => {
                            n++;
                            // easeOutQuad っぽい進度
                            const t = n / TICKS;
                            const eased = 1 - (1 - t) * (1 - t);
                            const v = Math.floor(target * eased);
                            el.textContent = v.toLocaleString();
                            if (n < TICKS) {
                                setTimeout(step, DUR / TICKS);
                            } else {
                                el.textContent = target.toLocaleString();
                                el.classList.add('is-settled');
                            }
                        };
                        step();
                    }, DELAY);
                }
            }

            // 上位ランク (SS/S/A) だけ蝶バースト演出
            if (result.rank === 'SS' || result.rank === 'S' || result.rank === 'A') {
                spawnButterflies(result.rank);
            }

            // 演出が一段落した頃にナビゲーターがランクに対してコメント
            // (スコアカウントアップ完了 0.6+0.9=1.5s 直後に出す)
            setTimeout(() => {
                speakResultComment(result, !!s.deathEnd);
            }, 1500);

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

                    const labelSeed = `${s.startAt}_${result.rank}`;
                    const canvas = window.ShareCard.render(result, stageInfo, {
                        timeouts,
                        deathEnd: !!s.deathEnd,
                        labelSeed,
                    });
                    const blob = await window.ShareCard.toBlob(canvas);
                    const text = window.ShareCard.buildText(result, stageInfo, { labelSeed });

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
                    window.GameState.session.b18Slot =
                        Math.floor(Math.random() * picked.length);
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

    // ---------- ナビゲーターによるランク別コメント ----------
    function speakResultComment(result, deathEnd) {
        if (!window.Navigator) return;
        const rank = result.rank;
        const pct = window.Ranks?.percentileText(rank) || '';
        const meta = window.Ranks?.META?.[rank] || {};
        const label = meta.labels?.[0] || '';

        const DIALOGS = {
            SS: {
                poses: ['happy', 'hi'],
                lines: [
                    '嘘でしょ…！全問正解、しかも早い！',
                    `${pct}…${label}級です。もう、人類の域じゃない。`,
                ],
            },
            S: {
                poses: ['happy', 'hi'],
                lines: [
                    'すごい。${pct} だよ、それ。'.replace('${pct}', pct),
                    `${label}に匹敵するレベル。`,
                ],
            },
            A: {
                poses: ['hi', 'basic'],
                lines: [
                    `${pct}。かなり強いほうだと思う。`,
                    `${label}くらいの頭脳って感じ。`,
                ],
            },
            B: {
                poses: ['basic'],
                lines: [
                    `${pct}。悪くないじゃない。`,
                    `${label}、くらいの位置。`,
                ],
            },
            C: {
                poses: ['basic', 'think'],
                lines: [
                    `${pct}…まあ、${label}だね。`,
                    '崩壊 UI に惑わされすぎ、かも？',
                ],
            },
            D: {
                poses: ['think'],
                lines: [
                    `${pct}。`,
                    `ラベルは「${label}」。あと一歩、って感じ。`,
                ],
            },
            E: {
                poses: ['think_light'],
                lines: [
                    `${pct}…「${label}」と出ました。`,
                    'UI 崩壊に呑まれてしまったね。',
                ],
            },
            F: {
                poses: ['think_light'],
                lines: [
                    `${pct}。「${label}」。`,
                    'これは、再挑戦が必要かも。',
                ],
            },
        };
        const deathLines = {
            poses: ['think_light', 'think'],
            lines: [
                'あ、死んだ。',
                'あのギミックはもう、避けようが無い場合もあるから。',
                '次はうまく切り抜けて。',
            ],
        };

        const dlg = deathEnd ? deathLines : (DIALOGS[rank] || DIALOGS.C);
        window.Navigator.speak(dlg.lines, { poses: dlg.poses });
    }

    // ---------- 上位ランク専用: 蝶バースト ----------
    function spawnButterflies(rank) {
        const screen = document.querySelector('.result-screen');
        if (!screen) return;
        let layer = screen.querySelector('.result-butterflies');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'result-butterflies';
            screen.appendChild(layer);
        }
        // SS=12匹 / S=8匹 / A=5匹 くらい
        const count = rank === 'SS' ? 14 : rank === 'S' ? 9 : 5;
        for (let i = 0; i < count; i++) {
            const b = document.createElement('span');
            b.className = 'bfly';
            const startX = 400 + Math.random() * 280; // 中央付近 (1080幅)
            const startY = 1600 + Math.random() * 200;
            b.style.left = `${startX}px`;
            b.style.top  = `${startY}px`;
            const tx = (Math.random() - 0.5) * 1200;
            const ty = -1400 - Math.random() * 400;
            const rz = (Math.random() - 0.5) * 120;
            b.style.setProperty('--tx', `${tx}px`);
            b.style.setProperty('--ty', `${ty}px`);
            b.style.setProperty('--rz', `${rz}deg`);
            b.style.animationDelay = `${0.6 + Math.random() * 0.8}s`;
            b.style.animationDuration = `${7 + Math.random() * 4}s`;
            layer.appendChild(b);
            // 役目を終えたら捨てる
            setTimeout(() => b.remove(), 14000);
        }
    }

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
