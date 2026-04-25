/* ============================================================
   achievements.js — 達成バッジ (Achievements)
   ------------------------------------------------------------
   ・カタログを 1 箇所 (CATALOG) で定義。
   ・解放はステージクリア / 連続ログイン等のフックポイントで判定。
   ・Save.unlockAchievement(id) で永続化、新規解放なら toast を出す。
   ・PROFILE 画面に解放済みリストを表示する。
   ・要件:
     - データは Save.data.achievements (id 配列) に保持
     - 「条件を満たせば一度きり」シンプルポリシー (累積系も達成済みなら no-op)
     - 後方互換: 旧セーブで achievements 未定義なら空配列を補完
   ============================================================ */

(function () {
    // ランク順序 (上位 → 下位)。Config と同じものを参照。
    function rankOrder() {
        return window.CONFIG?.RANK_ORDER || ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
    }
    function rankAtLeast(rank, minRank) {
        const O = rankOrder();
        const r = O.indexOf(rank);
        const m = O.indexOf(minRank);
        if (r < 0 || m < 0) return false;
        return r <= m;
    }

    // ---- カタログ ----
    // id   : 不変キー (英数 + _)。Save 側で配列管理する識別子。
    // name : 一覧で表示するラベル
    // hint : 解放条件のヒント (詳細を出す)。未解放時は伏字オプションも検討可。
    // tier : "core" / "story" / "skill" / "fun" — UI で色分けに使う
    const CATALOG = [
        { id: 'first_step',   name: 'はじめの一歩',     hint: 'STAGE 1 を B 以上でクリア',           tier: 'story' },
        { id: 'halfway',      name: '折り返し',         hint: 'STAGE 5 を B 以上でクリア',           tier: 'story' },
        { id: 'all_clear',    name: '完走',             hint: 'STAGE 10 を B 以上でクリア',          tier: 'story' },
        { id: 'rank_s',       name: 'S RANK',           hint: 'いずれかのステージで S を取得',         tier: 'skill' },
        { id: 'rank_ss',      name: 'SS RANK',          hint: 'いずれかのステージで SS を取得',        tier: 'skill' },
        { id: 'perfect',      name: 'PERFECT',          hint: '1 ステージで全問正解',                  tier: 'skill' },
        { id: 'speed',        name: 'スピードラン',     hint: '平均応答 5 秒以下で B 以上クリア',      tier: 'skill' },
        { id: 'streak_3',     name: 'STREAK 3',         hint: '3 日連続でホームを開く',              tier: 'core' },
        { id: 'streak_7',     name: 'STREAK 7',         hint: '7 日連続でホームを開く',              tier: 'core' },
        { id: 'dead_lover',   name: 'DEAD LOVER',       hint: '死亡エンドを引く',                     tier: 'fun' },
    ];

    function getCatalog() {
        return CATALOG.slice();
    }

    function findById(id) {
        return CATALOG.find(a => a.id === id) || null;
    }

    // 解放確定 + toast。既に持っていれば何もしない (false 返す)。
    function tryUnlock(id) {
        const def = findById(id);
        if (!def) return false;
        const newly = !!window.Save?.unlockAchievement?.(id);
        if (newly) {
            // toast はビジュアルレイヤ。失敗してもセーブはされる。
            try { showToast(def); } catch (_) {}
            try { window.SE?.fire?.('rankReveal'); } catch (_) {}
        }
        return newly;
    }

    // ---- フック: ステージクリア後 ----
    // result.js から呼ばれる。
    //   rec    : Save.recordStageClear の戻り値 (isClearing 等)
    //   result : Scoring.compute の戻り値 (rank, correct, total, avgTimeSec ...)
    //   stageNo: 完了したステージ番号
    //   session: GameState.session (deathEnd 参照用)
    function checkAfterStage(rec, result, stageNo, session) {
        if (!rec || !result) return;

        // 死亡エンドは独立して 1 つ解放
        if (session?.deathEnd) tryUnlock('dead_lover');

        // ストーリー系 (B 以上クリア時)
        if (rec.isClearing) {
            if (stageNo === 1)  tryUnlock('first_step');
            if (stageNo === 5)  tryUnlock('halfway');
            if (stageNo === 10) tryUnlock('all_clear');

            // スピードラン (平均応答 ≤ 5s)
            if (typeof result.avgTimeSec === 'number' && result.avgTimeSec <= 5.0) {
                tryUnlock('speed');
            }
            // パーフェクト (全問正解)
            if (result.correct > 0 && result.correct === result.total) {
                tryUnlock('perfect');
            }
        }

        // ランク系: クリア基準を満たさなくても、表示ランク自体が S/SS なら開放
        //   (即死等は rank='F' になるので自然に弾かれる)
        if (rankAtLeast(result.rank, 'SS')) tryUnlock('rank_ss');
        if (rankAtLeast(result.rank, 'S'))  tryUnlock('rank_s');
    }

    // ---- フック: ホーム到達 (連続ログイン) ----
    function checkAfterSession(touchResult) {
        if (!touchResult) return;
        const streak = touchResult.streak || 0;
        if (streak >= 7) tryUnlock('streak_7');
        if (streak >= 3) tryUnlock('streak_3');
    }

    // ---- toast ----
    // icon-unlock popup と被らないよう、左下から上にスライドインする小型カード。
    function showToast(def) {
        const stage = document.getElementById('stage');
        if (!stage || !def) return;
        const el = document.createElement('div');
        el.className = `ach-toast tier-${def.tier || 'core'}`;
        el.innerHTML = `
            <div class="ach-toast-eye">ACHIEVEMENT</div>
            <div class="ach-toast-name">${escapeHTML(def.name)}</div>
            <div class="ach-toast-hint">${escapeHTML(def.hint)}</div>
        `;
        stage.appendChild(el);

        const dismiss = () => {
            if (!el.parentNode) return;
            el.classList.add('is-hide');
            setTimeout(() => { if (el.parentNode) el.remove(); }, 320);
        };
        el.addEventListener('pointerdown', dismiss);
        requestAnimationFrame(() => el.classList.add('is-show'));
        setTimeout(dismiss, 4200);
    }

    function escapeHTML(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.Achievements = {
        CATALOG,
        getCatalog,
        findById,
        tryUnlock,
        checkAfterStage,
        checkAfterSession,
    };
})();
