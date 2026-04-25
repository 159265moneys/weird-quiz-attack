/* ============================================================
   home.js — ホーム画面 (5タブ UI の中央タブ)
   ------------------------------------------------------------
   構成:
     - キャラクター (所持アバターからランダム 1 体、毎回選び直し)
     - セリフ (ランダム 10 種、メタ発言禁止の口調ハードコード)
     - GAME START (最新解放ステージに直行)
     - STAGE SELECT (stageSelect タブへ遷移)

   起動:
     title -> home が新規導線。既存 title は今まで stageSelect に
     飛ばしていたが、home がハブになるので home に繋ぎ替え済み。
   ============================================================ */

(function () {
    // 10 セリフ (メタ禁止: ゲーム/プレイヤー/UI/画面に言及しない)
    // 口調: 既存パズル女ラインと同調 (クール / からかい / 挑発寄り)。
    const DIALOGUES = [
        '暇だったのね、よく来たじゃない。',
        '指、温めてきた? 冷えたまま挑むと痛い目見るわよ。',
        'ちょっと待って、考え事してたの。',
        '今日はどこまで行けるかしらね。',
        '焦らなくていい。ただし時間は、削れてるから。',
        '目を逸らさないで。落ちるわよ。',
        '冴えてる? たぶん。見せて。',
        '答えは、だいたい最初の直感が正しいわ。',
        'ちゃんと息、してる? 止めてると鈍るから。',
        'ようこそ。また戻ってきたのね。',
    ];

    function escapeHTML(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function pickDialogue() {
        return DIALOGUES[Math.floor(Math.random() * DIALOGUES.length)];
    }

    // ------------------------------------------------------------------
    // TIPS — ボタンの上に出す小カード。タップで次の TIP に切替。
    // ------------------------------------------------------------------
    // 操作のコツ + 仕様の小ネタを混ぜる。順番は提示時にシャッフル。
    // 絵文字は使わない (.cursor/rules/no-emoji.mdc)。
    const TIPS = [
        '同じキーを連打で「あ→い→う→え→お」と切替できる',
        'フリック (上下左右) でも文字入力できる',
        '濁点キーを連打で「だ→ば→ぱ」と変換できる',
        '問題文に「ひらがなで」とある時は ABC/123 切替が効かなくなる',
        '黒塗りの文字は よーく見ると うっすら透けている',
        'ステージクリアで次のステージとアイコンが解放される',
        'プロフィールタブで 名前とアイコンを変えられる',
        'ランキング送信は 設定 → ONLINE RANKING でオフにできる',
        '回答中の中断は画面右上 EXIT ボタンから',
        'BGM は アプリをバックグラウンドにすると止まる',
        'プレイヤー ID は 6 文字。ランキングで他の人と区別する目印',
        'タイトル画面でタップするとスタート (ロックは効かないので慎重に)',
    ];

    function pickInitialTipIndex() {
        return Math.floor(Math.random() * TIPS.length);
    }

    // ------------------------------------------------------------------
    // STATS — ヘッダ下の 1 行ストリップ。
    //   STAGE n/10  ·  BEST <rank>  ·  STREAK Nd  ·  PLAYS N
    //   未クリア時は BEST/PLAYS が "—" 表示。STREAK は 0 → "1d" 扱い。
    // ------------------------------------------------------------------
    function buildStatsHTML() {
        const progress = window.Save?.data?.progress || {};
        const unlocked = progress.unlockedStage || 1;
        const totalStages = (window.CONFIG.STAGES?.length) || 10;

        const bestRank = window.Save?.getBestRankAcross?.() || null;
        const totalPlays = window.Save?.getTotalPlays?.() || 0;
        const streak = Math.max(1, window.Save?.getStreak?.() || 0);

        const cells = [
            { key: 'stage',  label: 'STAGE',  value: `${unlocked}/${totalStages}` },
            { key: 'best',   label: 'BEST',   value: bestRank || '—' },
            { key: 'streak', label: 'STREAK', value: `${streak}d` },
            { key: 'plays',  label: 'PLAYS',  value: String(totalPlays) },
        ];
        const html = cells.map(c => `
            <div class="home-stats-cell" data-key="${c.key}">
                <span class="home-stats-k">${c.label}</span>
                <span class="home-stats-v">${escapeHTML(c.value)}</span>
            </div>
        `).join('<span class="home-stats-sep" aria-hidden="true">·</span>');
        return `<div class="home-stats" aria-label="プレイ状況">${html}</div>`;
    }

    // ------------------------------------------------------------------
    // HOME に立たせるキャラ絵プール (1000×1000 透過 PNG / sprite/chars/)
    // ------------------------------------------------------------------
    // 各キャラは複数ポーズを持つ。PROFILE で表示するアイコン (160×160 前後) と
    // 別に、HOME 用の大きい立ち絵として使う。butterfly は装飾専用 (ルール:
    // .cursor/rules/butterfly-is-decoration-only.mdc) なので HOME には出さない。
    //
    // プール仕様:
    //   - 初期解放時点では puzzle だけ → puzzle の 4 ポーズからランダム
    //   - サブキャラ (jellyfish / tv / phonograph) が解放されるたびに、
    //     そのキャラの全ポーズが抽選プールに追加される
    //   - 最終的に最大 13 ポーズから毎回ランダム表示
    // ------------------------------------------------------------------
    const CHARS_BASE = 'sprite/chars/';
    const HOME_POSES = {
        puzzle:     ['puzzle_normal.png', 'puzzle_hmm.png', 'puzzle_one_hand_up.png', 'puzzle_thinking.png'],
        jellyfish:  ['jellyfish_1.png', 'jellyfish_2.png', 'jellyfish_sitting.png'],
        tv:         ['tv_1.png', 'tv_dark.png', 'tv_thinking.png'],
        phonograph: ['phonograph_1.png', 'phonograph_discover.png', 'phonograph_idea.png'],
    };

    function pickHomeCharPath() {
        // 解放済み (HOME 候補) の char id を集める
        const unlockedIds = Object.keys(HOME_POSES)
            .filter(id => window.Save?.isIconUnlocked?.(id) !== false);
        const ids = unlockedIds.length ? unlockedIds : ['puzzle'];

        // 全ポーズを一つのプールに結合してランダム抽選 (= キャラ解放が多いほど
        // そのキャラが出る確率が上がる。ポーズ単位で一様抽選)
        const pool = [];
        for (const id of ids) {
            for (const f of (HOME_POSES[id] || [])) pool.push(f);
        }
        if (!pool.length) return null;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return CHARS_BASE + encodeURIComponent(pick);
    }

    // タップで切替する TIP の index (画面再生成のたびに乱数で初期化)
    let currentTipIdx = 0;

    const Screen = {
        render() {
            const progress = window.Save?.data?.progress || {};
            const unlocked = progress.unlockedStage || 1;
            const stageName = window.CONFIG.STAGES?.[unlocked - 1]?.name || '';
            const dialogue = pickDialogue();
            const avPath = pickHomeCharPath();

            const charHtml = avPath
                ? `<img class="home-char" src="${escapeHTML(avPath)}" alt="" id="homeChar" onerror="this.remove();">`
                : `<div class="home-char home-char-placeholder" id="homeChar"></div>`;

            currentTipIdx = pickInitialTipIndex();
            const tipHtml = `
                <button class="home-tip" id="homeTip" type="button" aria-label="次の TIP">
                    <span class="home-tip-label">TIP</span>
                    <span class="home-tip-text" id="homeTipText">${escapeHTML(TIPS[currentTipIdx])}</span>
                </button>
            `;

            return `
                <div class="screen home-screen">
                    <div class="screen-header home-head">
                        <div class="home-head-left">
                            <div class="home-head-ver">v${window.CONFIG.VERSION}</div>
                        </div>
                        <div class="home-head-icons">
                            <button class="home-head-icon" type="button" data-action="mail" aria-label="お知らせ">
                                <img src="sprite/icons/header/mail.svg" alt="">
                            </button>
                            <button class="home-head-icon" type="button" data-action="settings" aria-label="設定">
                                <img src="sprite/icons/header/settings.svg" alt="">
                            </button>
                            <button class="home-head-icon" type="button" data-action="achievements" aria-label="達成バッジ">
                                <img src="sprite/icons/header/trophy.svg" alt="">
                            </button>
                        </div>
                    </div>

                    ${buildStatsHTML()}

                    <div class="home-dialog" id="homeDialog">
                        <p class="home-dialog-text">${escapeHTML(dialogue)}</p>
                    </div>

                    <!-- キャラを flex 伸長領域で描画。dialog とボタンの間を埋める。
                         画像はこの領域一杯に object-fit:contain でフィットする。 -->
                    <div class="home-char-area">${charHtml}</div>

                    ${tipHtml}

                    <div class="home-actions">
                        <button class="home-btn home-btn-start" type="button" data-action="start">
                            <span class="home-btn-main">GAME START</span>
                            <span class="home-btn-sub">STAGE ${String(unlocked).padStart(2, '0')} · ${escapeHTML(stageName)}</span>
                        </button>
                        <button class="home-btn home-btn-select" type="button" data-action="select">
                            <span class="home-btn-main">STAGE SELECT</span>
                            <span class="home-btn-sub">全ステージ一覧</span>
                        </button>
                    </div>
                </div>
            `;
        },

        init() {
            // 連続日数を更新 (1 度の起動で何回 home に来ても同日なら no-op)
            //   isNewDay=true なら STREAK セルにポップ演出を 1 回入れる。
            const sess = window.Save?.touchSession?.();
            // 連続日数バッジ (STREAK 3 / 7) の判定。toast は Achievements 側で出る。
            //   isNewDay でなくても streak >= 7 を保持していれば過去解放済みのはず =
            //   tryUnlock は 2 回目以降 false なので副作用なし。
            try { window.Achievements?.checkAfterSession?.(sess); } catch (_) {}
            if (sess?.isNewDay) {
                requestAnimationFrame(() => {
                    const cell = document.querySelector(
                        '.home-stats-cell[data-key="streak"]'
                    );
                    if (cell) {
                        cell.classList.add('is-bumped');
                        setTimeout(() => cell.classList.remove('is-bumped'), 1500);
                    }
                });
            }

            // タブバーを表示 (home がアクティブ)
            window.TabBar?.mount?.('home');

            // BGM: title/stageSelect と共有のメイン BGM。
            const prev = window.Router?.previous;
            const seq = (prev === 'question' || prev === 'result');
            window.BGM?.play('title', { sequential: seq });

            // HOME のキャラ絵プール (sprite/chars/*) は manifest に依存せず静的。
            // render() 時点で確定できるので load 待ちの差し替え処理は不要。
            // (manifest はプロフィール画面のアイコンピッカー用途にのみ使う)

            document.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
                window.SE?.fire?.('menuCursor');
                window.Settings?.open?.();
            });

            document.querySelector('[data-action="mail"]')?.addEventListener('click', () => {
                window.SE?.fire?.('cancel');
                showHomeToast('お知らせ機能は準備中');
            });

            document.querySelector('[data-action="achievements"]')?.addEventListener('click', () => {
                window.SE?.fire?.('menuCursor');
                window.HomeMenu?.openAchievements?.();
            });

            document.querySelector('[data-action="start"]')?.addEventListener('click', () => {
                window.SE?.fire?.('confirm');
                const unlocked = window.Save?.data?.progress?.unlockedStage || 1;
                launchStage(unlocked);
            });

            document.querySelector('[data-action="select"]')?.addEventListener('click', () => {
                window.SE?.fire?.('menuCursor');
                window.Router.show('stageSelect');
            });

            // TIP カード: タップで次の TIP に進む (リング状に循環)
            document.getElementById('homeTip')?.addEventListener('click', () => {
                window.SE?.fire?.('select');
                currentTipIdx = (currentTipIdx + 1) % TIPS.length;
                const el = document.getElementById('homeTipText');
                if (el) {
                    el.classList.remove('is-flip');
                    // reflow trick (1px) で animation を再起動
                    void el.offsetWidth;
                    el.textContent = TIPS[currentTipIdx];
                    el.classList.add('is-flip');
                }
            });
        },

        destroy() {
            // 他タブ or question/result に遷移する際の TabBar 管理は各遷移先で行う。
            // ただし question/result など TabBar を出さない画面へ行くケースでは
            // ここで消さないと残ってしまうので、launchStage 側で明示 unmount する。
            // home -> stageSelect / ranking は次画面で mount しなおす。
        },
    };

    // --- 軽量トースト (mail 等、まだ機能ないボタンの仮 UI) ---
    function showHomeToast(text) {
        const existing = document.querySelector('.home-toast');
        if (existing) existing.remove();
        const el = document.createElement('div');
        el.className = 'home-toast';
        el.textContent = text;
        document.body.appendChild(el);
        // ポップイン後、1.6s で自動フェードアウト
        requestAnimationFrame(() => el.classList.add('is-shown'));
        setTimeout(() => {
            el.classList.remove('is-shown');
            setTimeout(() => el.remove(), 320);
        }, 1600);
    }

    // stageSelect.js の startStage とほぼ同じ処理。Phase 1 では複製で済ませる
    // (Phase 2 で 共通 util に切り出し予定)。
    async function launchStage(no) {
        window.GameState.currentStage = no;
        window.GameState.resetSession();
        window.GameState.session.startAt = Date.now();

        try {
            const all = await window.QuizLoader.loadAll();
            const picked = window.QuizLoader.pickForStage(
                all, no, window.CONFIG.QUESTIONS_PER_STAGE);
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

            // クイズ画面は TabBar 不要
            window.TabBar?.unmount?.();
            window.Router.show('question');
            window.SE?.fire('stageStart');
        } catch (e) {
            console.error(e);
            alert('問題の読み込みに失敗しました。HTTPサーバ経由で開いているか確認してください。');
        }
    }

    window.Screens.home = Screen;
})();
