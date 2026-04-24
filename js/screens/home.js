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

    // 所持 (解放済み) キャラからランダム 1 体の画像パス。
    // Avatars manifest 未ロード時は null を返し、init() 側で load 後に差し替える。
    function pickAvatarPath() {
        const list = window.Avatars?.getList?.() || [];
        if (!list.length) return null;
        // 解放済みだけに絞る (未解放は除外)
        const ok = list.filter(it => window.Save?.isIconUnlocked?.(it.id) !== false);
        const pool = ok.length > 0 ? ok : list;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return window.Avatars?.pathOf?.(pick.id) || null;
    }

    const Screen = {
        render() {
            const progress = window.Save?.data?.progress || {};
            const unlocked = progress.unlockedStage || 1;
            const stageName = window.CONFIG.STAGES?.[unlocked - 1]?.name || '';
            const dialogue = pickDialogue();
            const avPath = pickAvatarPath();

            const charHtml = avPath
                ? `<img class="home-char" src="${escapeHTML(avPath)}" alt="" id="homeChar" onerror="this.remove();">`
                : `<div class="home-char home-char-placeholder" id="homeChar"></div>`;

            return `
                <div class="screen home-screen">
                    <div class="screen-header home-head">
                        <div class="home-head-brand">変なクイズ</div>
                        <div class="home-head-ver">v${window.CONFIG.VERSION}</div>
                    </div>

                    <div class="home-stage">
                        <div class="home-char-area">${charHtml}</div>
                        <div class="home-dialog">
                            <p class="home-dialog-text" id="homeDialog">${escapeHTML(dialogue)}</p>
                        </div>
                    </div>

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
            // タブバーを表示 (home がアクティブ)
            window.TabBar?.mount?.('home');

            // BGM: title/stageSelect と共有のメイン BGM。
            const prev = window.Router?.previous;
            const seq = (prev === 'question' || prev === 'result');
            window.BGM?.play('title', { sequential: seq });

            // Avatars manifest が render 時に未ロードだった場合、load 完了後に差し替え
            if (window.Avatars?.load) {
                window.Avatars.load().then(() => {
                    const cur = document.getElementById('homeChar');
                    if (!cur) return;
                    if (cur.tagName === 'IMG' && cur.getAttribute('src')) return;  // 既に ok
                    const path = pickAvatarPath();
                    if (!path) return;
                    const img = document.createElement('img');
                    img.className = 'home-char';
                    img.id = 'homeChar';
                    img.src = path;
                    img.alt = '';
                    img.onerror = () => img.remove();
                    cur.replaceWith(img);
                }).catch(() => {});
            }

            document.querySelector('[data-action="start"]')?.addEventListener('click', () => {
                window.SE?.fire?.('confirm');
                const unlocked = window.Save?.data?.progress?.unlockedStage || 1;
                launchStage(unlocked);
            });

            document.querySelector('[data-action="select"]')?.addEventListener('click', () => {
                window.SE?.fire?.('menuCursor');
                window.Router.show('stageSelect');
            });
        },

        destroy() {
            // 他タブ or question/result に遷移する際の TabBar 管理は各遷移先で行う。
            // ただし question/result など TabBar を出さない画面へ行くケースでは
            // ここで消さないと残ってしまうので、launchStage 側で明示 unmount する。
            // home -> stageSelect / ranking は次画面で mount しなおす。
        },
    };

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
