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

    // ---------- ナビゲーターによる tier 別コメント ----------
    // セリフ選択ルール:
    //   - 基本は rank → tier の固定 1:1 マップ (RANK_META 参照)
    //   - F のみ例外で 2 分岐:
    //     * Stage 10 死亡 → 慰め系 (最終ステージは仕方ない枠)
    //     * それ以外の F (Stage 1-9 死亡 / 非死亡 F) → DOOMED 固定 (伝説のアホ)
    //   - 口調は女性カジュアル統一
    // TODO (future phase): プロフィールアイコン (クラゲ和装/TVロリ/蓄音機白衣) に
    //   応じてキャラ口調と立ち絵を切り替える。
    function speakResultComment(result, deathEnd) {
        if (!window.Navigator) return;
        const rank = result.rank;
        const stageNo = window.GameState.currentStage;
        const pct = window.Ranks?.percentileText(rank) || '';
        const seed = `${window.GameState?.session?.startAt || 0}_${rank}_${stageNo}_${deathEnd ? 'd' : 'n'}`;

        // F ランク特別扱い (Stage 10 死亡 = 慰め / その他 F = DOOMED 固定)
        const isF = rank === 'F';
        const isStage10Death = isF && deathEnd && stageNo === 10;
        const dialogueTier = isStage10Death
            ? null
            : (window.Ranks?.tierOf(rank) || 'DOOMED');

        // ラベル (セリフ内 ${label} に埋め込み)
        let label = '';
        if (dialogueTier) {
            const labelBank = window.Ranks?.TIER_LABELS?.[dialogueTier] || [];
            if (labelBank.length) {
                label = labelBank[hashSeed(seed + '_label') % labelBank.length];
            }
        }

        // tier 別 variants (各 5 パターン / 女性カジュアル)
        // 固定マッピング: SS→GODLIKE / S→ELITE / A→STRONG / B→DECENT
        //                 C→NORMAL_DOWN / D→WEAK / E→TERRIBLE / F→DOOMED
        const DIALOGS = {
            // SS (上位 0.3%) — 神扱い・疑念
            GODLIKE: {
                poses: ['happy', 'hi'],
                variants: [
                    ['嘘でしょ…！全問、しかもこのスピード。',          `${pct}。${label} のあれだよ？人類の域じゃない。`],
                    ['ちょっと、やば。マジで神じゃん。',                 `${pct}。${label}、って出てる。ホンモノかも。`],
                    ['ねえ、一応聞くけど、あなた人間？',                 `${pct}。${label} って頭脳、何食べたら育つの。`],
                    ['こんなの、見たことないんですけど…。',              `${pct}。異次元すぎ、${label} レベル。`],
                    ['…チートじゃないよね？ほんとに？',                  `${pct}。${label}、って。引いた、さすがに。`],
                ],
            },
            // S (上位 2%) — ベタ褒め
            ELITE: {
                poses: ['happy', 'hi'],
                variants: [
                    ['すごい、普通にすごい。',                          `${pct} は ${label} の水準だよ。`],
                    ['全問正解、ってだけで普通に上位。',                 `${pct}。${label} 級、って思っていい。`],
                    ['マジか…本気出したね、それ。',                     `${pct}。${label} に匹敵する結果。`],
                    ['えーすごい。私には無理かも、これ。',               `${pct}。${label}、って出てる。`],
                    ['これはちょっと、自慢していいやつ。',               `${pct} は ${label} レベル。`],
                ],
            },
            // A (上位 8%) — 普通に褒め
            STRONG: {
                poses: ['hi', 'basic'],
                variants: [
                    ['うん、上手。ちゃんと読めてる。',                   `${pct} は ${label} クラス。`],
                    ['かなり強いほう、だと思うよ。',                     `${pct}。${label} くらいの立ち位置。`],
                    ['いい感じ。自信持っていいと思う。',                 `${pct} は ${label} 相当。`],
                    ['惜しい問題いくつかあったね、おしい。',             `${pct}、${label} クラスだよ。`],
                    ['普通にえらい。ここまでくれば。',                   `${pct}。${label} に並ぶ結果。`],
                ],
            },
            // B (上位 25%) — いい感じ
            DECENT: {
                poses: ['basic', 'hi'],
                variants: [
                    ['悪くないじゃない。',                               `${pct}。${label}、くらいの位置。`],
                    ['普通に上手いと思うよ、これ。',                     `${pct} は ${label} と同格。`],
                    ['平均より、ちょっと上ってところ。',                 `${pct}。${label} クラスです。`],
                    ['ギリギリ合格ライン、みたいな?',                    `${pct}、${label} レベル。`],
                    ['もうちょい取れたかもね、惜しい。',                 `${pct}、${label} あたり。`],
                ],
            },
            // C (下位 50% = 中央値) — 並・凡人
            NORMAL_DOWN: {
                poses: ['basic', 'think'],
                variants: [
                    ['ふつうに並、だね。',                               `${pct}。${label} あたり。`],
                    ['ギミックにやられた、って感じ?',                    `${pct}、${label}。切り替えていこ。`],
                    ['まあまあ、こういう日もあるよ。',                   `${pct}。${label} ってとこ。`],
                    ['崩壊 UI に惑わされすぎ、かも?',                   `${pct} は ${label} のゾーン。`],
                    ['次いこ、次。集中すればまだ行けるって。',           `${pct}、${label}。`],
                ],
            },
            // D (下位 20%) — 要練習
            WEAK: {
                poses: ['think'],
                variants: [
                    ['うーん、もうちょっと取れたんじゃない?',            `${pct}。${label}、って結果。`],
                    ['集中、してた?ほんとに。',                          `${pct} は ${label} 相当。`],
                    ['これは練習が必要、かもね。',                       `${pct}、${label}。`],
                    ['もったいない。惜しい答えが多かった。',             `${pct}。${label} ってとこ。`],
                    ['次、本気出そ?いける、まだ。',                     `${pct} は ${label}。`],
                ],
            },
            // E (下位 5%) — ぴえん
            TERRIBLE: {
                poses: ['think_light'],
                variants: [
                    ['なんか、集中できなかった感じ?',                    `${pct}、${label}。`],
                    ['問題、ちゃんと読めてる?',                          `${pct} は ${label} 相当。`],
                    ['ギミックに完全に負けてるよ、これ。',               `${pct}。${label}、だって。`],
                    ['…うん、練習、しよっか。',                          `${pct}、${label} 認定。`],
                    ['のびしろだよ、のびしろ。たぶん。',                 `${pct}、${label}。`],
                ],
            },
            // F (下位 0.5%) — 伝説のアホ
            // Stage 10 死亡は別枠 (STAGE10_DEATH_COMFORT) で処理、ここには来ない
            DOOMED: {
                poses: ['think_light'],
                variants: [
                    ['…なんて言ったらいいんだろう。',                    `${pct}。「${label}」、だってさ。`],
                    ['あの…大丈夫?体調悪いとか?',                      `${pct}、${label} 認定。ちょっと休もっか?`],
                    ['うん、これはやばいよ普通に。',                     `${pct}。「${label}」の称号、ゲット。`],
                    ['自信、持ってくれていいよ。逆の意味で。',           `${pct}、${label}。`],
                    ['これ、なかなか見ないやつ。',                       `${pct}。「${label}」、レジェンド。`],
                ],
            },
        };

        // Stage 10 死亡専用 (慰め系) — Stage 10 まで到達したこと自体は評価する
        const STAGE10_DEATH_COMFORT = [
            {
                poses: ['think_light', 'think'],
                lines: [
                    'Stage 10 で死亡、って。まあ、運もあるから。',
                    'ドンマイ、気にしないで。',
                ],
            },
            {
                poses: ['think'],
                lines: [
                    'ここまで来てそれはキツいね。',
                    'でも Stage 10 は仕方ない部分もあるから。',
                ],
            },
            {
                poses: ['basic', 'think'],
                lines: [
                    'あそこまで行っただけ、普通にすごいよ。',
                    '死因は、気にしないでよし。たぶん。',
                ],
            },
            {
                poses: ['think_light'],
                lines: [
                    '最終ステージで死亡、これは切ない。',
                    'また挑戦してみて、次こそ。',
                ],
            },
            {
                poses: ['basic'],
                lines: [
                    'Stage 10 は死ぬ前提、くらいに考えていいから。',
                    '切り替えて、また来てね。',
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
        if (isStage10Death) {
            // Stage 10 死亡 → 慰め専用
            const pick = STAGE10_DEATH_COMFORT[hashSeed(seed) % STAGE10_DEATH_COMFORT.length];
            poses = pick.poses;
            lines = pick.lines;
        } else {
            // それ以外: tier ベース (F は forcedDoomed により 'DOOMED' 固定)
            const bank = DIALOGS[dialogueTier] || DIALOGS.NORMAL_DOWN;
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
