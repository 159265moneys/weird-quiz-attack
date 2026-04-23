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
            const stageNo = window.GameState.currentStage;
            const percentileText = window.Ranks?.percentileText(result.rank, stageNo) || '';
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
                        <button class="btn" data-action="stageSelect">ステージ選択</button>
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

            // リザルト BGM に切替 (stageN → result のクロスフェード)
            window.BGM?.play('result');

            // --- 開幕: RANK 発表 SE (ノイズバースト + 電源カッ) ---
            // 世界観整合のため"ジャジャーン"は使わず、グリッチで発表。
            // deathEnd 時は rank_reveal 抑制 (game_over 系が後続しないので無音)。
            if (!s.deathEnd) {
                setTimeout(() => {
                    window.SE?.fire('rankRevealSnap');
                }, 80);
                setTimeout(() => {
                    window.SE?.fire('rankReveal');
                }, 140);
            } else {
                setTimeout(() => window.SE?.fire('gameOver'), 120);
            }

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
                            // tick 音: 4 回ごとに鳴らす (連打しすぎない)
                            if (n % 4 === 1) window.SE?.fire('scoreCount');
                            if (n < TICKS) {
                                setTimeout(step, DUR / TICKS);
                            } else {
                                el.classList.remove('is-taunting');
                                el.classList.add('is-settled');
                                el.textContent = target.toLocaleString();
                                window.SE?.fire('confirm');  // 着地音
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
                            // 3 tick ごとに tick 音
                            if (n % 3 === 1) window.SE?.fire('scoreCount');
                            if (n < TICKS) {
                                setTimeout(step, DUR / TICKS);
                            } else {
                                el.textContent = target.toLocaleString();
                                el.classList.add('is-settled');
                                window.SE?.fire('confirm');  // 着地音
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

            document.querySelector('[data-action="stageSelect"]')?.addEventListener('click', () => {
                window.Router.show('stageSelect');
            });
        },
    };

    // ---------- ナビゲーターによるランク別コメント ----------
    // 2026-04 セリフレパートリー 5 倍増量 (女性カジュアル口調に統一)。
    //   - 各ランクに 5 パターンの variants を用意し、session seed で安定抽選
    //   - deathLines も 5 パターンに増量
    //   - 抽選は session.startAt + rank をハッシュして決めるので、同一結果画面内で
    //     リロードしない限り固定 (毎回バラバラにならず落ち着いて読める)
    // TODO (future phase): プロフィールアイコン (クラゲ和装/TVロリ/蓄音機白衣) に
    //   応じてキャラ口調と立ち絵を切り替える。アス比問題 (現ナビ画像は長方形、
    //   プロフキャラは正方形) の吸収処理も合わせて実装。
    function speakResultComment(result, deathEnd) {
        if (!window.Navigator) return;
        const rank = result.rank;
        const pct = window.Ranks?.percentileText(rank, window.GameState.currentStage) || '';
        const meta = window.Ranks?.META?.[rank] || {};
        const label = meta.labels?.[0] || '';
        const seed = `${window.GameState?.session?.startAt || 0}_${rank}_${deathEnd ? 'd' : 'n'}`;

        // ランク別 variants (各 5 パターン)
        const DIALOGS = {
            SS: {
                poses: ['happy', 'hi'],
                variants: [
                    ['嘘でしょ…！全問正解、しかも早い！',             `${pct}…${label}級です。もう、人類の域じゃない。`],
                    ['ちょっと、やば…マジで神じゃん。',                 `${pct} って、${label} のあれだよ？`],
                    ['ねえ、ちょっと、チートじゃないよね…？',           `${pct}。${label} って頭脳、何食べたら育つの。`],
                    ['こんなの、見たことないんですけど…。',              `${pct}。異次元すぎ。${label}、くらいじゃない？`],
                    ['…一応聞くけど、あなた人間？',                    `${pct}…${label}、だってさ。ホンモノかも。`],
                ],
            },
            S: {
                poses: ['happy', 'hi'],
                variants: [
                    ['すごい。かなり上手いね。',                        `${pct} は、${label} レベルだよ。`],
                    ['あと一問だったのに〜、惜しい！',                  `${pct}。それでも ${label} に匹敵する。`],
                    ['ほぼ満点じゃない？次は SS いけるかも。',           `${pct}。${label} より、やや上の立ち位置。`],
                    ['えーすごい。私には無理かも、これ。',              `${pct}。${label} 級です。`],
                    ['マジか…本気出したね、それ。',                    `${pct} は ${label} の水準。`],
                ],
            },
            A: {
                poses: ['hi', 'basic'],
                variants: [
                    [`${pct}。かなり強いほうだと思う。`,                `${label} くらいの頭脳って感じ。`],
                    ['惜しい問題いくつかあったね、おしい。',             `${pct}、${label} クラスだよ。`],
                    ['うん、上手。ちゃんと読めてる。',                   `${pct} は ${label} 並み、って出てる。`],
                    ['えー、あの問題取ってほしかったかも…。',            `でも ${pct}。${label} 相当の頭脳。`],
                    ['いい感じ。自信持っていいと思う。',                 `${pct} は ${label} クラス。`],
                ],
            },
            B: {
                poses: ['basic'],
                variants: [
                    [`${pct}。悪くないじゃない。`,                      `${label}、くらいの位置。`],
                    ['普通に上手いと思うよ、これ。',                    `${pct}。${label} と同格。`],
                    ['もうちょい取れたかもね、惜しい。',                 `${pct}、${label} あたり。`],
                    ['平均より、ちょっと上ってところ。',                 `${pct}。${label} クラスです。`],
                    ['ギリギリ合格ライン、みたいな？',                  `${pct}、${label} レベル。`],
                ],
            },
            C: {
                poses: ['basic', 'think'],
                variants: [
                    [`${pct}…まあ、${label} だね。`,                    '崩壊 UI に惑わされすぎ、かも？'],
                    ['もっといけたんじゃない？ほんとに。',                `${pct}。${label} と同等。`],
                    ['ふつうに並、だね。',                               `${pct} は ${label} のゾーン。`],
                    ['ギミックにやられたね、これは。',                   `${pct}、${label} くらいの位置。`],
                    [`${pct}。${label}、って結果。`,                    'ま、こんな日もあるよ。'],
                ],
            },
            D: {
                poses: ['think'],
                variants: [
                    [`${pct}。あと一歩、って感じ。`,                    `ラベルは「${label}」。もうちょい。`],
                    ['もうちょっと頑張れそう、だよ？',                   `${pct}、${label}。`],
                    ['惜しい答えが多かったかも。',                       `${pct} は ${label} ゾーン。`],
                    ['うーん、これは練習が必要かな。',                   `${pct}。${label} って結果。`],
                    ['次いこ、次！集中すればまだ行けるって。',           `${pct}、${label}。`],
                ],
            },
            E: {
                poses: ['think_light'],
                variants: [
                    [`${pct}…「${label}」と出ました。`,                 'UI 崩壊に呑まれてしまったね。'],
                    ['なんか、集中できなかった感じ？',                   `${pct}、${label}。`],
                    ['問題、ちゃんと読めてる？',                         `${pct} は ${label} 相当。`],
                    ['ギミックに完全に負けてるよ、これ。',               `${pct}。${label}、だって。`],
                    ['まあ、のびしろだよ、のびしろ。',                   `${pct}、${label} 認定。`],
                ],
            },
            F: {
                poses: ['think_light'],
                variants: [
                    [`${pct}。「${label}」。`,                          'これは、再挑戦が必要かも。'],
                    ['…なんて言ったらいいんだろう。',                    `${pct}。「${label}」だよ？`],
                    ['あの…大丈夫？体調悪いとか？',                     `${pct}、${label}。ちょっと休もっか？`],
                    ['うん、これはやばいよ普通に。',                     `${pct}。${label} の称号、ゲット。`],
                    ['えっと…自信、持ってくれていいよ。逆の意味で。',      `${pct}、${label}。`],
                ],
            },
        };

        // deathEnd 用 (即死 B21/G1 終了) も 5 パターン
        const DEATH_VARIANTS = [
            {
                poses: ['think_light', 'think'],
                lines: [
                    'あ、死んだ。',
                    'あのギミックはもう、避けようが無い場合もあるから。',
                    '次はうまく切り抜けて。',
                ],
            },
            {
                poses: ['think_light'],
                lines: [
                    'UI に殺された、って顔してる。',
                    'ドンマイ、こういう日もあるよ。',
                ],
            },
            {
                poses: ['think'],
                lines: [
                    '突然、死ぬよね、このゲーム。',
                    '次は気をつけて、って言っても無理かもだけど。',
                ],
            },
            {
                poses: ['think_light', 'basic'],
                lines: [
                    'それ、避けられる即死じゃなかった気も…しないかな。',
                    '再挑戦、どうぞ。',
                ],
            },
            {
                poses: ['basic', 'think'],
                lines: [
                    'あら〜、即死ですか。',
                    '慣れだよ、慣れ。次いこ。',
                ],
            },
        ];

        // seed を使った安定ランダム抽選 (画面内で固定)
        function hashSeed(s) {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            return Math.abs(h);
        }

        let poses, lines;
        if (deathEnd) {
            const pick = DEATH_VARIANTS[hashSeed(seed) % DEATH_VARIANTS.length];
            poses = pick.poses;
            lines = pick.lines;
        } else {
            const bank = DIALOGS[rank] || DIALOGS.C;
            const variants = bank.variants;
            lines = variants[hashSeed(seed) % variants.length];
            poses = bank.poses;
        }

        // 結果画面は「タップ文字送り」せず、全部 1 吹き出しで一気に表示。
        // mode:'result' で下寄せ & 小さめ構成に切り替え。
        // persist:true でタップでは閉じず、ボタン操作を妨げないよう貫通。
        window.Navigator.speak(lines, {
            poses,
            mode: 'result',
            oneShot: true,
            persist: true,
        });
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
        let sfx = 'shareOk';
        switch (r.method) {
            case 'share-file':         msg = 'シェアしました'; break;
            case 'share-text+download':msg = 'テキストをシェア / 画像をダウンロード'; break;
            case 'download+clipboard': msg = '画像をダウンロード / テキストをコピー'; break;
            case 'download':           msg = '画像をダウンロード'; break;
            case 'cancel':             msg = 'キャンセル'; sfx = 'cancel'; break;
            case 'error':              msg = 'シェア失敗'; sfx = 'wrong'; break;
            default:                   msg = r.method || '';
        }
        window.SE?.fire(sfx);
        el.textContent = msg;
        el.classList.add('is-show');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => el.classList.remove('is-show'), 2200);
    }

    window.Screens.result = Screen;
})();
