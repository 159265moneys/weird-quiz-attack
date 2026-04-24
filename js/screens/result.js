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

                // ランキング送信 (α Prep モードでは localStorage のみ)
                //   参加 OFF / Ranking モジュール未ロード時は no-op。
                //   死亡エンドも送信する (F も並ぶ方が賑わって見える)。
                try {
                    window.Ranking?.submit?.({
                        stageNo: window.GameState.currentStage,
                        score: result.score,
                        correct: result.correct,
                        total: result.total,
                        totalTimeMs: Math.round((result.totalTimeSec || 0) * 1000),
                        rank: result.rank,
                        deathEnd: !!s.deathEnd,
                        sessionId: s.sessionId,
                    });
                } catch (_) { /* ランキングの失敗はゲーム進行に影響させない */ }
            }

            // タイムアウト回数
            const timeouts = s.answers.filter(a => a.reason === 'timeout').length;

            // G7 スコア煽り: 最初は 0 を出しておく (init で本物に差し替え)
            const taunt = !!s.scoreTaunt;
            const initialScore = taunt ? 0 : result.score;

            // 上位 % / 現実換算ラベル (ランダムだが session 内で固定)
            // stage も加味した実効パーセンタイル → 実効 tier でラベル抽選する。
            const stageNo = window.GameState?.currentStage;
            const meta = window.Ranks?.META?.[result.rank] || {};
            const percentileText = window.Ranks?.percentileText(result.rank, stageNo) || '';
            const seed = `${s.startAt}_${result.rank}_${stageNo}`;
            const realLabel = window.Ranks?.pickLabel(result.rank, stageNo, seed) || '';
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

                    const filename = `oddquiz_stage${String(stageNo).padStart(2, '0')}_${result.rank}.png`;
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

    // seed から安定した非負整数ハッシュ (同一セッション内で抽選を固定する用)
    function hashSeed(s) {
        let h = 0;
        const str = String(s);
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    // ---------- ナビゲーター / サブキャラによるコメント ----------
    // セリフ選択ルール:
    //   1. Stage 10 死亡 (F) → Dialogs.stage10Death (慰め枠)
    //   2. 対象 stage/rank にサブキャラ定義あり:
    //      - 未アンロックなら必ずサブキャラ登場 (= 初回確定で解放する体験)
    //      - 既にアンロック済みなら 50% 抽選でパズルナビとサブキャラを分岐
    //   3. 上記以外 → rank → tier の固定 1:1 マップで Dialogs.main を参照
    // セリフ中の {pct} / {label} は Dialogs.interpolate で差し替える。
    // サブキャラ初登場時はセリフ完了後に showIconUnlockPopup を遅延呼び出し。
    function speakResultComment(result, deathEnd) {
        if (!window.Navigator) return;
        const rank = result.rank;
        const stageNo = window.GameState.currentStage;
        const pct = window.Ranks?.percentileText(rank, stageNo) || '';
        const seed = `${window.GameState?.session?.startAt || 0}_${rank}_${stageNo}_${deathEnd ? 'd' : 'n'}`;

        const run = () => {
            const isF = rank === 'F';
            const isStage10Death = isF && deathEnd && stageNo === 10;

            // サブキャラ判定 (死亡エンドは対象外 = F は stages/ranks に含まれないので自動的に除外される)
            const subChar = (!deathEnd)
                ? (window.Dialogs?.getSubCharFor?.(stageNo, rank) || null)
                : null;
            const subUnlocked = subChar
                ? !!window.Save?.isIconUnlocked?.(subChar.iconId)
                : true;
            // 初回は確定。2 回目以降は 50/50 抽選。
            let useSub = false;
            if (subChar) {
                useSub = !subUnlocked
                    ? true
                    : (hashSeed(seed + '_lottery') % 2 === 0);
            }

            let lines = null;
            let poses = null;
            let customImage = null;
            let unlockTarget = null;  // セリフ後に解放 popup を出すキャラ

            if (useSub && subChar) {
                const vs = subChar.variants || [];
                if (vs.length) {
                    const pick = vs[hashSeed(seed) % vs.length] || [];
                    lines = pick.map(l => window.Dialogs.interpolate(l, { pct, label: subChar.label }));
                    poses = subChar.poses;
                    customImage = subChar.image;
                    if (!subUnlocked) unlockTarget = subChar;
                }
            } else if (isStage10Death) {
                const arr = window.Dialogs?.getStage10Death?.() || [];
                if (arr.length) {
                    const pick = arr[hashSeed(seed) % arr.length] || {};
                    lines = pick.lines;
                    poses = pick.poses;
                }
            } else {
                // (rank, stageNo) → 実効 tier でセリフバンクを引く。
                // 同じ SS でも S1 と S10 で tier が DECENT〜GODLIKE と動くので、
                // 褒めすぎ/けなしすぎの「傾斜」がここで入る。
                const tier = window.Ranks?.tierFor(rank, stageNo) || 'DOOMED';
                const bank = window.Dialogs?.getMain?.(tier);
                const labelBank = window.Ranks?.TIER_LABELS?.[tier] || [];
                const label = labelBank.length
                    ? labelBank[hashSeed(seed + '_label') % labelBank.length]
                    : '';
                if (bank) {
                    const pick = bank.variants[hashSeed(seed) % bank.variants.length] || [];
                    lines = pick.map(l => window.Dialogs.interpolate(l, { pct, label }));
                    poses = bank.poses;
                }
            }

            if (!lines || !lines.length) return;

            window.Navigator.speak(lines, {
                poses,
                mode: 'result',
                oneShot: true,
                persist: true,
                customImage,
            });

            // 初回サブキャラ登場 → セリフの「読み時間」を確保してから popup
            if (unlockTarget) {
                const newly = window.Save?.unlockIcon?.(unlockTarget.iconId);
                if (newly) {
                    setTimeout(() => showIconUnlockPopup(unlockTarget), 3200);
                }
            }
        };

        // Dialogs JSON 未ロードの場合は 1 回だけロードを待ってから発話
        if (window.Dialogs?.load) {
            window.Dialogs.load().then(run).catch(run);
        } else {
            run();
        }
    }

    // ---------- NEW ICON 獲得 popup ----------
    // 表示条件: サブキャラが初めて登場した (= unlockIcon が true を返した) 時。
    // z-index は nav-overlay (1500) より上、B18 (9999) より下で 1800。
    // タップで即閉じ / 5 秒で自動フェード。
    function showIconUnlockPopup(subChar) {
        const stage = document.getElementById('stage');
        if (!stage || !subChar) return;
        const img = subChar.image || '';
        const label = subChar.label || '';
        const el = document.createElement('div');
        el.className = 'icon-unlock';
        el.innerHTML = `
            <div class="icon-unlock-card">
                <div class="icon-unlock-eyebrow">NEW ICON</div>
                <div class="icon-unlock-frame">
                    <img src="${img}" alt="">
                </div>
                <div class="icon-unlock-label">${escapeHTML(label)}</div>
                <div class="icon-unlock-hint">PROFILE から設定できるよ</div>
            </div>
        `;
        stage.appendChild(el);

        const dismiss = () => {
            if (!el.parentNode) return;
            el.classList.add('is-hide');
            setTimeout(() => { if (el.parentNode) el.remove(); }, 320);
        };
        el.addEventListener('pointerdown', dismiss);

        requestAnimationFrame(() => el.classList.add('is-show'));
        window.SE?.fire?.('rankReveal');
        setTimeout(dismiss, 5000);
    }

    function escapeHTML(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
