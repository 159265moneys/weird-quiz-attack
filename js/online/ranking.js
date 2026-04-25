/* ============================================================
   online/ranking.js — ランキング抽象 API 層
   ------------------------------------------------------------
   現状 (α Prep モード):
     - データソース = data/ranking_seed.json (BOT 1000 件)
     - 自分のスコア = localStorage 追記 (端末内のみ)
     - 実ネットワーク送信なし
   将来 (Firebase 接続後):
     - fetchTop / submit の内部実装だけを Firestore クライアントに
       差し替える (window.Ranking の外部インタフェースは不変)

   API:
     Ranking.load()                -> Promise (seed 初期化)
     Ranking.fetchTop(stageNo, n)  -> Promise<Array>  TOP N
     Ranking.submit(entry)         -> Promise<{ok, rank}>
     Ranking.getMyHistory()        -> Array  自分が送った全エントリ
     Ranking.isEnabled()           -> boolean (設定値を Save から引く)
     Ranking.setEnabled(v)         -> void

   エントリのデータ形:
     {
       playerId, displayName, iconId,
       stageNo, stageId, score,
       correct, total, totalTimeMs,
       rank, deathEnd,
       createdAt, sessionId, appVersion,
       _self?: true      // 自分のレコードか (fetchTop 結果で付与)
     }

   ソート順 (共通):
     1. score 降順
     2. totalTimeMs 昇順 (短いほど上)
     3. createdAt 昇順 (先に取った方が上)
   ============================================================ */

(function () {
    const SEED_URL = 'data/ranking_seed.json';
    const LS_SUBMISSIONS = 'wq.ranking.submissions';

    // --- 状態 ---
    let seedEntries = null;   // 初期ロード後に配列
    let loadingPromise = null;

    function normalize(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw.entries)) return raw.entries;
        return [];
    }

    function load() {
        if (seedEntries) return Promise.resolve(seedEntries);
        if (loadingPromise) return loadingPromise;
        loadingPromise = fetch(SEED_URL, { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
            .then(raw => {
                seedEntries = normalize(raw);
                loadingPromise = null;
                return seedEntries;
            });
        return loadingPromise;
    }

    // --- localStorage: 自分の送信履歴 ---
    // 端末内のみ保持。将来 Firestore に送るときは、この配列を
    // 参照してネットワーク送信対象にする。
    function readSubmissions() {
        try {
            const raw = localStorage.getItem(LS_SUBMISSIONS);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }
    function writeSubmissions(arr) {
        try {
            localStorage.setItem(LS_SUBMISSIONS, JSON.stringify(arr));
        } catch (e) {
            console.warn('[Ranking] submissions persist failed', e);
        }
    }

    // --- 設定 (参加 ON/OFF) ---
    function isEnabled() {
        const s = window.Save?.getSettings?.() || {};
        // 未定義時のデフォルトは true (α/β では自動参加)
        return s.rankingEnabled !== false;
    }
    function setEnabled(v) {
        window.Save?.setSetting?.('rankingEnabled', !!v);
    }

    // --- 並び替え (共通) ---
    function sortLeaderboard(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if ((a.totalTimeMs || 0) !== (b.totalTimeMs || 0)) return (a.totalTimeMs || 0) - (b.totalTimeMs || 0);
        return (a.createdAt || 0) - (b.createdAt || 0);
    }

    // --- API: TOP N 取得 ---
    //   内部的に seed (BOT) + 自分の送信履歴をマージ。
    //   自分が上位に食い込めば自動で上に来る。
    async function fetchTop(stageNo, limit) {
        if (!limit) limit = 100;
        await load();
        const myId = window.Save?.getPlayerId?.() || null;
        // _self 行に表示する identity は提出時のスナップショットではなく、
        //   今プロフィールで設定されている最新値 (アバター変更を即座に反映する)
        const myCurrentName = window.Save?.getPlayerDisplayName?.() || null;
        const myCurrentIcon = window.Save?.getPlayerIcon?.() || null;

        const myLatestByStage = {};
        // 自分のベストだけ残す (同じステージで複数送信してたら最高スコア 1 件)
        for (const e of readSubmissions()) {
            if (!e || e.stageNo !== stageNo) continue;
            const cur = myLatestByStage[e.stageNo];
            if (!cur || sortLeaderboard(e, cur) < 0) {
                myLatestByStage[e.stageNo] = e;
            }
        }
        const mine = myLatestByStage[stageNo] ? [myLatestByStage[stageNo]] : [];
        const bots = (seedEntries || []).filter(e => e.stageNo === stageNo);
        const merged = bots.concat(mine).slice();
        merged.sort(sortLeaderboard);

        // _self マーキング + 自分の identity を最新化
        return merged.slice(0, limit).map((e) => {
            const isSelf = !!(myId && e.playerId === myId);
            if (isSelf) {
                return {
                    ...e,
                    _self: true,
                    displayName: myCurrentName || e.displayName,
                    iconId: myCurrentIcon != null ? myCurrentIcon : e.iconId,
                };
            }
            return { ...e, _self: false };
        });
    }

    // --- API: 送信 ---
    //   α Prep モードでは localStorage に追記するだけ。
    //   参加 OFF なら no-op。
    async function submit(entry) {
        if (!entry) return { ok: false, reason: 'no-entry' };
        if (!isEnabled()) return { ok: false, reason: 'disabled' };

        const myId = window.Save?.getPlayerId?.() || '';
        const myName = window.Save?.getPlayerDisplayName?.() || myId;
        const myIcon = window.Save?.getPlayerIcon?.() || null;

        const now = Date.now();
        const record = {
            playerId: myId,
            displayName: myName,
            iconId: myIcon,
            stageNo: entry.stageNo,
            stageId: `stage-${entry.stageNo}`,
            score: entry.score | 0,
            correct: entry.correct | 0,
            total: entry.total | 0,
            totalTimeMs: Math.round(entry.totalTimeMs || 0),
            rank: entry.rank || 'F',
            deathEnd: !!entry.deathEnd,
            createdAt: now,
            sessionId: entry.sessionId || genSessionId(),
            appVersion: window.CONFIG?.APP_VERSION || '0.9.0-alpha',
        };

        const arr = readSubmissions();
        arr.push(record);
        // 古い履歴が肥大化しないよう、プレイヤー × ステージあたり直近 5 件に間引く
        const keyOf = r => `${r.playerId}:${r.stageNo}`;
        const grouped = {};
        for (const r of arr) {
            const k = keyOf(r);
            if (!grouped[k]) grouped[k] = [];
            grouped[k].push(r);
        }
        const pruned = [];
        for (const k of Object.keys(grouped)) {
            const list = grouped[k];
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            for (const r of list.slice(0, 5)) pruned.push(r);
        }
        writeSubmissions(pruned);

        // 即時ランキングで順位計算 (seed + 今回送信)
        const top = await fetchTop(entry.stageNo, 1000);
        const myPos = top.findIndex(e => e._self);
        return {
            ok: true,
            rank: myPos >= 0 ? (myPos + 1) : null,   // 1-based 順位 (見つからなければ null)
            total: top.length,
        };
    }

    // --- API: 自分の送信履歴 ---
    function getMyHistory() {
        return readSubmissions().slice();
    }

    // --- ヘルパ ---
    function genSessionId() {
        const POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let s = '';
        for (let i = 0; i < 20; i++) s += POOL[Math.floor(Math.random() * POOL.length)];
        return s;
    }

    window.Ranking = {
        load,
        fetchTop,
        submit,
        getMyHistory,
        isEnabled,
        setEnabled,
    };

    // 起動と同時に seed をプリロード (初回ランキング画面表示が速くなる)
    try { load(); } catch (_) {}
})();
