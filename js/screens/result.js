/* ============================================================
   result.js — リザルト画面 (Phase 2: 新スコア/ランクを使用)
   ============================================================ */

(function () {
    const Screen = {
        render() {
            const result = window.Scoring.compute(window.GameState.session, window.GameState.currentStage);
            const s = window.GameState.session;

            // セーブ (初回表示時のみ)
            //   recordStageClear は B 以上だけ "クリア" 扱いで unlockedStage を伸ばす。
            //   戻り値で「次ステージ解放/初クリア」が分かるので、後段の演出で使う。
            if (window.GameState.currentStage && !s._saved) {
                const rec = window.Save.recordStageClear(window.GameState.currentStage, result.score, result.rank);
                s._saveRec = rec || null;
                s._saved = true;
                // アチーブメントの判定 (saveRec が「Bクリア」を握っているのでここで一発)。
                //   toast はこの瞬間に出るが、リザルト演出と被るので Achievements 側で
                //   左下スライドイン (icon-unlock とは座標を分ける)。
                try {
                    window.Achievements?.checkAfterStage?.(rec, result, window.GameState.currentStage, s);
                } catch (e) { console.warn('[ach] post-stage failed', e); }

                // ランキング送信 (Firestore + localStorage)。
                //   参加 OFF / Ranking モジュール未ロード時は no-op。
                //   死亡エンドも送信する (F も並ぶ方が賑わって見える)。
                //   返り値の Promise は session に保持しておき、init() で
                //   「YOUR RANK X / Y」表示に使う。失敗トーストもここで拾う。
                try {
                    const submitPromise = window.Ranking?.submit?.({
                        stageNo: window.GameState.currentStage,
                        score: result.score,
                        correct: result.correct,
                        total: result.total,
                        totalTimeMs: Math.round((result.totalTimeSec || 0) * 1000),
                        rank: result.rank,
                        deathEnd: !!s.deathEnd,
                        sessionId: s.sessionId,
                    });
                    if (submitPromise && typeof submitPromise.then === 'function') {
                        s._rankingSubmit = submitPromise.catch(err => {
                            console.warn('[Ranking] submit failed', err);
                            return { ok: false, mode: 'error' };
                        });
                    }
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

            // 見出しの 3 分岐 (+ Stage10 全クリア時の特例):
            //   - Stage10 を B 以上で 初めて 抜けた -> ALL CLEAR (祝祭)
            //   - 死亡エンド (B21 即死系)         -> DEAD END (赤・震え)
            //   - クリア基準 (B 以上) クリア      -> STAGE CLEAR (シアン)
            //   - クリア基準未満 (C 以下)         -> STAGE FAILED (赤系)
            // クリア状況は recordStageClear の戻り値 (s._saveRec) を信頼する。
            const rec = s._saveRec || {};
            const isClearing = !!rec.isClearing;

            // 全クリアフラグの初回検出。第10ステージを B 以上で抜けた瞬間に
            //   一度だけ true になる。判定はここでのみ行い、Save.flags へ確定書込。
            //   Navigator 側のコメントもこのフラグを参照して切替えできるよう、
            //   フラグを立てるのはバナー表示判定より先 (= render の早い段階)。
            // session に既にメモ済みなら再 render でもフラグを維持する。
            //   render() は Router の再描画で 1 セッション中複数回呼ばれ得るため、
            //   getFlag は 2 回目以降 false を返してしまう。session 側にスナップする。
            let isAllClearMoment = !!s._wasAllClearMoment;
            if (!isAllClearMoment
                && stageNo === 10 && isClearing
                && !window.Save?.getFlag?.('gameCleared')) {
                isAllClearMoment = true;
                s._wasAllClearMoment = true;
                window.Save?.setFlag?.('gameCleared', true);
            }

            let head;
            if (isAllClearMoment) {
                head = '<div class="result-head result-head-allclear">ALL STAGES CLEAR</div>';
            } else if (s.deathEnd) {
                head = '<div class="result-head result-head-dead">DEAD END</div>';
            } else if (isClearing) {
                head = '<div class="result-head result-head-clear">STAGE CLEAR</div>';
            } else {
                head = '<div class="result-head result-head-failed">STAGE FAILED</div>';
            }

            // 「Bランク以上で次ステージ解放」のヒント / 解放告知バナー
            //   - ALL CLEAR の瞬間 -> 専用の "ENDING" バナー (祝祭)
            //   - 初回 B 以上クリア & 次ステージが解放された -> 大きめのアンロック告知
            //   - 失敗 (C 以下 / 死亡エンド) -> 「Bランク以上で次に進めます」のヒント
            //   - それ以外 (再クリア・最終ステージ再クリア等) -> 何も出さない
            let statusBanner = '';
            if (isAllClearMoment) {
                statusBanner = `
                    <div class="result-unlock-banner is-allclear" data-banner="allclear">
                        <span class="rub-eye">ENDING</span>
                        <span class="rub-text">全 10 ステージ制覇</span>
                    </div>`;
            } else if (rec.newlyUnlockedStage) {
                statusBanner = `
                    <div class="result-unlock-banner" data-banner="unlock">
                        <span class="rub-eye">UNLOCKED</span>
                        <span class="rub-text">STAGE ${String(rec.newlyUnlockedStage).padStart(2, '0')} 解放</span>
                    </div>`;
            } else if (!isClearing) {
                statusBanner = `
                    <div class="result-unlock-banner is-fail" data-banner="fail">
                        <span class="rub-eye">REQUIREMENT</span>
                        <span class="rub-text">B ランク以上で次ステージ解放</span>
                    </div>`;
            }

            // 動的 2 ボタン:
            //   失敗 / 死亡 ->  [もう一度] [ステージ選択]
            //   クリア + 次がある -> [次のステージ] [ステージ選択]
            //   クリア + 最終 (10) -> [もう一度] [ステージ選択]
            // シェアは右上にアイコン化して常時 (狭いので 3 ボタン化はしない)。
            let primaryAction, primaryLabel, primaryClass;
            const hasNext = isClearing && stageNo && stageNo < 10;
            if (hasNext) {
                primaryAction = 'next';
                primaryLabel = `STAGE ${String(stageNo + 1).padStart(2, '0')} へ`;
                primaryClass = 'btn btn-accent-cyan';
            } else if (!isClearing) {
                primaryAction = 'retry';
                primaryLabel = 'もう一度';
                primaryClass = 'btn btn-accent-red';
            } else {
                // クリア済み + 最終ステージ
                primaryAction = 'retry';
                primaryLabel = 'もう一度';
                primaryClass = 'btn btn-accent-cyan';
            }

            return `
                <div class="screen result-screen rank-${result.rank} ${isClearing ? 'is-cleared' : 'is-failed'}">
                    <button class="result-share-btn" data-action="share" aria-label="シェア">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="6" cy="12" r="2.6"/>
                            <circle cx="18" cy="6"  r="2.6"/>
                            <circle cx="18" cy="18" r="2.6"/>
                            <line x1="8.2" y1="10.7" x2="15.8" y2="7.3"/>
                            <line x1="8.2" y1="13.3" x2="15.8" y2="16.7"/>
                        </svg>
                    </button>
                    ${head}
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

                    <!-- ランキング順位表示 (init() で window.Ranking.submit() の結果が
                         返ってきた後に動的に埋める)。送信中は "..." を出しておき、
                         参加OFFや失敗時はその旨を出す。 -->
                    <div class="result-rank-pos" data-rank-pos>
                        <span class="rrp-label">YOUR RANK</span>
                        <span class="rrp-value">…</span>
                    </div>

                    ${statusBanner}

                    <div class="result-actions">
                        <button class="${primaryClass}" data-action="${primaryAction}">${primaryLabel}</button>
                        <button class="btn" data-action="stageSelect">ステージ選択</button>
                    </div>
                    <div class="share-toast" data-share-toast></div>
                </div>
            `;
        },

        init() {
            const s = window.GameState.session;
            const result = window.Scoring.compute(s, window.GameState.currentStage);
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

            // 上位ランク (SS/S/A) は蝶バースト演出。
            //   ALL CLEAR の瞬間 (Stage10 を B 以上で初めて抜けた) は、
            //   ランクに関わらず SS 相当の祝祭バーストを出す。
            const isAllClearMoment = !!s._wasAllClearMoment;
            if (isAllClearMoment) {
                spawnButterflies('SS');
            } else if (result.rank === 'SS' || result.rank === 'S' || result.rank === 'A') {
                spawnButterflies(result.rank);
            }

            // 演出が一段落した頃にナビゲーターがランクに対してコメント
            // (スコアカウントアップ完了 0.6+0.9=1.5s 直後に出す)
            setTimeout(() => {
                speakResultComment(result, !!s.deathEnd);
            }, 1500);

            // ランキング順位の DOM 反映 + 送信失敗トースト
            // submit() の Promise は render() 側で session._rankingSubmit に
            // 退避済み。enabled でも online 失敗でも、画面側で適切に表示する。
            updateRankPosUI(s);

            // シェアボタン
            document.querySelector('[data-action="share"]')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                if (btn.disabled) return;
                btn.disabled = true;
                const prevLabel = btn.textContent;
                btn.textContent = '生成中...';

                try {
                    const stageNo = window.GameState.currentStage;
                    const result = window.Scoring.compute(window.GameState.session, stageNo);
                    const s = window.GameState.session;
                    const timeouts = s.answers.filter(a => a.reason === 'timeout').length;
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
                window.SE?.fire('menuCursor');
                window.Router.show('stageSelect');
            });

            // もう一度: 同じステージを再開する。
            //   stageSelect に挟まずダイレクトに startStage 相当を実行する。
            //   stageSelect の startStage が module-private なので、stageSelect に
            //   一旦遷移して params.autoStart で再開させる方式は避け、ここで
            //   GameState を組み直して question を直接出す。
            document.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
                const no = window.GameState?.currentStage;
                if (!no) {
                    window.Router.show('stageSelect');
                    return;
                }
                window.SE?.fire('menuCursor');
                relaunchStage(no);
            });

            // 次のステージへ。解放済みのはず (recordStageClear で unlocked) なので
            //   念のため Save.isStageUnlocked で検査して、ロックなら stageSelect 経由。
            document.querySelector('[data-action="next"]')?.addEventListener('click', () => {
                const cur = window.GameState?.currentStage || 0;
                const nextNo = Math.min(cur + 1, 10);
                if (!window.Save?.isStageUnlocked?.(nextNo)) {
                    window.Router.show('stageSelect');
                    return;
                }
                window.SE?.fire('menuCursor');
                relaunchStage(nextNo);
            });
        },
    };

    // ============================================================
    //   ランキング順位 (YOUR RANK X / Y) の DOM 反映
    //   - online 成功     : "#42 / 1234人" の形で表示
    //   - online 失敗     : "OFFLINE" 表示 + 小トースト
    //   - rank 不明 (圏外): "—"
    // ============================================================
    function updateRankPosUI(s) {
        const wrap = document.querySelector('[data-rank-pos]');
        if (!wrap) return;
        const valEl = wrap.querySelector('.rrp-value');

        // submit が走ってない場合 (Ranking モジュール未読込)
        const p = s && s._rankingSubmit;
        if (!p || typeof p.then !== 'function') {
            if (valEl) valEl.textContent = '—';
            return;
        }

        p.then((res) => {
            if (!res) return;
            wrap.classList.remove('is-loading');
            if (res.mode === 'online' || res.mode === 'offline') {
                if (res.rank && res.total) {
                    wrap.classList.add('is-ok');
                    if (valEl) {
                        valEl.innerHTML = `<strong>#${res.rank}</strong> <span class="rrp-of">/ ${res.total}人</span>`;
                    }
                } else {
                    if (valEl) valEl.textContent = '—';
                }
                if (res.mode === 'offline') {
                    wrap.classList.add('is-offline');
                }
            } else {
                wrap.classList.add('is-failed');
                if (valEl) valEl.textContent = 'OFFLINE';
                showRankFailToast();
            }
        });
    }

    // 送信失敗トースト (シェアトーストを流用)。短く出すだけ。
    function showRankFailToast() {
        const el = document.querySelector('[data-share-toast]');
        if (!el) return;
        el.textContent = 'ランキング送信失敗 (オフライン)';
        el.classList.add('is-show');
        clearTimeout(showRankFailToast._t);
        showRankFailToast._t = setTimeout(() => el.classList.remove('is-show'), 2400);
    }

    // ステージを開き直す共通ルーチン。stageSelect.js の startStage と同じ流れ。
    //   重複コードだが、stageSelect.js 側は IIFE 内に閉じていて呼べないので
    //   ここに薄くコピーする。Phase 2 で共通 util に切り出し予定。
    async function relaunchStage(no) {
        try {
            // Navigator が holdLast 等で残っているケースがあるので閉じる
            if (window.Navigator?.isOpen?.()) window.Navigator.close();

            window.GameState.currentStage = no;
            window.GameState.resetSession();
            window.GameState.session.startAt = Date.now();

            const all = await window.QuizLoader.loadAll();
            const picked = window.QuizLoader.pickForStage(all, no, window.CONFIG.QUESTIONS_PER_STAGE);
            window.GameState.session.questions = picked;
            const slots = window.GimmickSelector.pickGimmickSlots(no, picked.length);
            window.GameState.session.gimmickSlots = slots;
            window.GameState.session.kAssignment =
                window.GimmickSelector.generateKAssignment(no, slots);
            const b18Prob = window.CONFIG.B18_STAGE_PROB ?? 1.0;
            const inputIdxs = picked
                .map((q, i) => (q.mode === 'input' ? i : -1))
                .filter(i => i >= 0);
            window.GameState.session.b18Slot =
                (Math.random() < b18Prob && inputIdxs.length > 0)
                    ? inputIdxs[Math.floor(Math.random() * inputIdxs.length)]
                    : -1;

            window.TabBar?.unmount?.();
            window.Router.show('question');
            window.SE?.fire('stageStart');
        } catch (e) {
            console.error('[Result] relaunch failed:', e);
            window.Router.show('stageSelect');
        }
    }

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

            // ステージに該当するサブキャラを取得 (死亡時もキャラ自体は同じ)。
            // バンク選択 (default/SS/S/deathOrF) は pickSubVariantBank に委ねる。
            const subChar = window.Dialogs?.getSubCharFor?.(stageNo) || null;
            const subUnlocked = subChar
                ? !!window.Save?.isIconUnlocked?.(subChar.iconId)
                : false;
            // ランクに応じた variant bank を引く。
            //   F/死亡 + 解放後 → deathOrF バンク
            //   F/死亡 + 未解放 → null (= サブキャラ非登場、ナビ子にフォールバック)
            //   B/A/S/SS       → 該当ランクの bank or default
            const subBank = subChar
                ? window.Dialogs?.pickSubVariantBank?.(subChar, rank, deathEnd, subUnlocked)
                : null;

            // useSub 判定:
            //   未解放 + 通常ランク (B/A/S/SS) → 確定で出す (= 初回登場 / 解放トリガー)
            //   解放後 + bank あり             → 50/50 抽選でナビ子と分岐
            //   それ以外                        → サブキャラ非表示
            let useSub = false;
            if (subBank && subBank.length) {
                if (!subUnlocked) {
                    // 初回登場は B/A/S/SS のときだけ (= deathOrF は解放後限定)
                    useSub = (rank === 'B' || rank === 'A' || rank === 'S' || rank === 'SS');
                } else {
                    useSub = (hashSeed(seed + '_lottery') % 2 === 0);
                }
            }

            let lines = null;
            let poses = null;
            let customImage = null;
            let unlockTarget = null;  // セリフ後に解放 popup を出すキャラ

            if (useSub && subChar && subBank) {
                const pick = subBank[hashSeed(seed) % subBank.length] || [];
                // サブキャラのセリフは {label} を使わない方針だが、安全のため空文字で消す
                lines = pick.map(l => window.Dialogs.interpolate(l, { pct, label: '' }));
                poses = subChar.poses;
                customImage = subChar.image;
                if (!subUnlocked) unlockTarget = subChar;
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
        // label が空のキャラ (= 名前を出さない方針) ではラベル div を省略する
        const labelHtml = label
            ? `<div class="icon-unlock-label">${escapeHTML(label)}</div>`
            : '';
        el.innerHTML = `
            <div class="icon-unlock-card">
                <div class="icon-unlock-eyebrow">NEW ICON</div>
                <div class="icon-unlock-frame">
                    <img src="${img}" alt="">
                </div>
                ${labelHtml}
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
