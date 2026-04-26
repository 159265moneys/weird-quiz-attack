/* ============================================================
   online/ranking.js — ランキング抽象 API 層
   ------------------------------------------------------------
   モード:
     - online (Firebase Firestore 接続成功): 実プレイヤーのスコアを
       Firestore に保存・取得。fetchTop は Firestore + BOT seed の
       マージを返す。
     - offline (Firebase 未到達 / SDK 未初期化): localStorage 内の
       自分の送信履歴 + BOT seed のみで動作。submit は localStorage
       にだけ積まれ、ネットワーク復帰時の再送はしない (α では割愛)。

   ⚠️ window.Ranking の外部インタフェースは旧 α Prep 版から完全互換。
      画面側 (result.js / ranking.js / homeMenu.js) は無修正で動く。

   API:
     Ranking.load()                -> Promise<void>      seed/Firebase 初期化
     Ranking.fetchTop(stageNo, n)  -> Promise<Array>     TOP N (BOT + 実) マージ
     Ranking.submit(entry)         -> Promise<{ok, rank, mode}>
     Ranking.getMyHistory()        -> Array              自分の送信履歴
     Ranking.isEnabled()           -> boolean
     Ranking.setEnabled(v)         -> void
     Ranking.isOnline()            -> boolean            Firestore 到達可能?

   エントリのデータ形 (Firestore に投入する形と同一):
     {
       playerId, displayName, iconId,
       stageNo, stageId, score,
       correct, total, totalTimeMs,
       rank, deathEnd,
       createdAt, sessionId, appVersion,
       _self?: true,    // fetchTop 結果で付与
       _bot?: true      // BOT seed 由来 (UI 表示用)
     }

   ソート順 (共通):
     1. score 降順
     2. totalTimeMs 昇順 (短いほど上)
     3. createdAt 昇順 (先に取った方が上)
   ============================================================ */

(function () {
    const SEED_URL        = 'data/ranking_seed.json';
    const LS_SUBMISSIONS  = 'wq.ranking.submissions';

    // Firestore 上のコレクションルート: /rankings/{stageId}/scores
    const COLL_ROOT       = 'rankings';
    const COLL_LEAF       = 'scores';

    // Firestore からの取得件数 (TOP100 にマージするので少し多めに引いて余裕を持つ)
    const FIRESTORE_FETCH_LIMIT = 200;

    // --- 状態 ---
    let seedEntries   = null;       // BOT 1000 件 (1 回ロードしたら使い回し)
    let seedPromise   = null;
    let firestoreApi  = null;       // dynamic import 結果のキャッシュ
    let firestoreApiPromise = null;

    // ============================================================
    //   seed (BOT) ロード
    // ============================================================
    function normalizeSeed(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw.entries)) return raw.entries;
        return [];
    }

    function loadSeed() {
        if (seedEntries) return Promise.resolve(seedEntries);
        if (seedPromise) return seedPromise;
        seedPromise = fetch(SEED_URL, { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
            .then(raw => {
                seedEntries = normalizeSeed(raw).map(e => ({ ...e, _bot: true }));
                seedPromise = null;
                return seedEntries;
            });
        return seedPromise;
    }

    // ============================================================
    //   Firestore SDK 動的読み込み (1 回キャッシュ)
    //   index.html の <script type="module"> で既に Firebase SDK は
    //   ESM ロードされているため、同じ URL を再 import しても CDN の
    //   モジュールキャッシュが効いてネットワークコストはかからない。
    // ============================================================
    async function getFirestoreApi() {
        if (firestoreApi) return firestoreApi;
        if (firestoreApiPromise) return firestoreApiPromise;

        firestoreApiPromise = (async () => {
            const m = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
            firestoreApi = {
                collection:      m.collection,
                addDoc:          m.addDoc,
                query:           m.query,
                orderBy:         m.orderBy,
                limit:           m.limit,
                where:           m.where,
                getDocs:         m.getDocs,
                serverTimestamp: m.serverTimestamp,
            };
            firestoreApiPromise = null;
            return firestoreApi;
        })().catch((e) => {
            console.warn('[Ranking] Firestore SDK import failed:', e);
            firestoreApiPromise = null;
            return null;
        });

        return firestoreApiPromise;
    }

    function isOnline() {
        return !!(window.Firebase && window.Firebase.db);
    }

    // ============================================================
    //   load() — 互換のため残す。seed のみ確実にロード。
    //   Firebase 自体は index.html 側で初期化済み (window.Firebase) を待つ。
    // ============================================================
    async function load() {
        await loadSeed();
        // Firebase の初期化は index.html 側で並行して走っているので
        // ここでは特に待たない (使う直前に isOnline() で確認する)
    }

    // ============================================================
    //   localStorage: 自分の送信履歴
    //   - online モード: Firestore 送信失敗時のリトライ用バッファ (α では未使用)
    //   - offline モード: 唯一の保存先
    // ============================================================
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

    // ============================================================
    //   設定 (参加 ON/OFF)
    //   ------------------------------------------------------------
    //   2026-04: 全員強制参加に変更。ON/OFF トグルは廃止し、isEnabled は
    //   常に true を返す。setEnabled は API 互換のため残してあるが no-op。
    //   オフライン (Firebase 不到達) なら結果として送信は走らないので、
    //   ユーザーがネット遮断する自由は引き続き持っている。
    // ============================================================
    function isEnabled() {
        return true;
    }
    function setEnabled(_v) {
        /* no-op: 強制参加に固定 */
    }

    // ============================================================
    //   並び替え (共通)
    // ============================================================
    function sortLeaderboard(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if ((a.totalTimeMs || 0) !== (b.totalTimeMs || 0)) return (a.totalTimeMs || 0) - (b.totalTimeMs || 0);
        return (a.createdAt || 0) - (b.createdAt || 0);
    }

    // ============================================================
    //   Firestore createdAt は Timestamp オブジェクト。
    //   ソートと表示のためミリ秒に正規化する。
    // ============================================================
    function normalizeFsRow(raw) {
        const c = raw.createdAt;
        let createdAtMs = 0;
        if (typeof c === 'number') createdAtMs = c;
        else if (c && typeof c.toMillis === 'function') createdAtMs = c.toMillis();
        else if (c && typeof c.seconds === 'number') createdAtMs = c.seconds * 1000;
        return { ...raw, createdAt: createdAtMs };
    }

    // ============================================================
    //   Firestore からステージ TOP を取得
    //   - orderBy('score', 'desc') の単一フィールドのみ → 複合 INDEX 不要
    //   - tiebreak (totalTimeMs / createdAt) はクライアント側で sort
    // ============================================================
    async function fetchFromFirestore(stageNo, fetchLimit) {
        if (!isOnline()) return [];
        const api = await getFirestoreApi();
        if (!api) return [];

        try {
            const stageId = `stage-${stageNo}`;
            const ref = api.collection(window.Firebase.db, COLL_ROOT, stageId, COLL_LEAF);
            const q   = api.query(ref, api.orderBy('score', 'desc'), api.limit(fetchLimit));
            const snap = await api.getDocs(q);
            const rows = [];
            snap.forEach(doc => {
                rows.push(normalizeFsRow({ id: doc.id, ...doc.data() }));
            });
            return rows;
        } catch (e) {
            console.warn('[Ranking] Firestore fetch failed:', e);
            return [];
        }
    }

    // ============================================================
    //   API: TOP N 取得
    //     online  : Firestore + 自分の最近送信 + BOT seed をマージ
    //     offline : 自分の最近送信 + BOT seed のみ
    //
    //   self の identity (displayName / iconId) は提出時のスナップショット
    //   ではなく **今プロフィールに設定されている最新値** を上書き表示する。
    //   (アバターを変えたら過去のレコードでも即座に新アバターで見える)
    // ============================================================
    async function fetchTop(stageNo, fetchLimit) {
        if (!fetchLimit) fetchLimit = 100;
        await loadSeed();

        const myId          = window.Save?.getPlayerId?.() || null;
        const myCurrentName = window.Save?.getPlayerDisplayName?.() || null;
        const myCurrentIcon = window.Save?.getPlayerIcon?.() || null;

        // BOT seed (このステージ分のみ)
        const bots = (seedEntries || []).filter(e => e.stageNo === stageNo);

        // 自分のローカル送信履歴のうちこのステージのベスト
        let myLocalBest = null;
        for (const e of readSubmissions()) {
            if (!e || e.stageNo !== stageNo) continue;
            if (!myLocalBest || sortLeaderboard(e, myLocalBest) < 0) {
                myLocalBest = e;
            }
        }

        // Firestore 取得 (online のみ)
        const fsRows = await fetchFromFirestore(stageNo, FIRESTORE_FETCH_LIMIT);

        // マージ: BOT + Firestore + 自分のローカル送信
        // 重複排除: (playerId, stageNo, sessionId) が同じレコードは 1 つにまとめる
        const seen = new Set();
        const merged = [];
        function pushUnique(e) {
            if (!e) return;
            const key = `${e.playerId}|${e.stageNo}|${e.sessionId || ''}|${e.score}|${e.totalTimeMs}`;
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(e);
        }
        for (const e of bots)   pushUnique(e);
        for (const e of fsRows) pushUnique(e);
        if (myLocalBest)        pushUnique(myLocalBest);

        merged.sort(sortLeaderboard);

        return merged.slice(0, fetchLimit).map(e => {
            const isSelf = !!(myId && e.playerId === myId);
            if (isSelf) {
                return {
                    ...e,
                    _self: true,
                    displayName: myCurrentName || e.displayName,
                    iconId:      myCurrentIcon != null ? myCurrentIcon : e.iconId,
                };
            }
            return { ...e, _self: false };
        });
    }

    // ============================================================
    //   API: 送信
    //     online  : Firestore に addDoc + ローカルにも 1 件保持 (再表示用)
    //     offline : ローカルにだけ追記
    //   どちらでも同じ shape の record を返す。
    // ============================================================
    async function submit(entry) {
        if (!entry) return { ok: false, reason: 'no-entry', mode: 'noop' };
        if (!isEnabled()) return { ok: false, reason: 'disabled', mode: 'noop' };

        const myId   = window.Save?.getPlayerId?.()          || '';
        const myName = window.Save?.getPlayerDisplayName?.() || myId;
        const myIcon = window.Save?.getPlayerIcon?.()        || null;

        const now = Date.now();
        const stageId = `stage-${entry.stageNo}`;

        // 数値の丸め・clamp は Rules でも検証されるが、クライアント側で
        // 念のためサニタイズして拒否率を下げる。
        const clampInt = (v, lo, hi) => {
            const n = Math.round(Number(v) || 0);
            return Math.max(lo, Math.min(hi, n));
        };

        const baseRecord = {
            playerId:    myId,
            displayName: String(myName || myId).slice(0, 16),
            iconId:      myIcon,
            stageNo:     clampInt(entry.stageNo, 1, 10),
            stageId,
            score:       clampInt(entry.score, 0, 40000),
            correct:     clampInt(entry.correct, 0, 20),
            total:       clampInt(entry.total, 0, 20),
            totalTimeMs: clampInt(entry.totalTimeMs, 0, 1800000),
            rank:        entry.rank || 'F',
            deathEnd:    !!entry.deathEnd,
            sessionId:   entry.sessionId || genSessionId(),
            appVersion:  String(window.CONFIG?.VERSION || '0.1.0-alpha').slice(0, 32),
        };

        // ---- ローカルに先に積む (Firestore 送信が失敗しても保持) ----
        const localRecord = { ...baseRecord, createdAt: now };
        const arr = readSubmissions();
        arr.push(localRecord);
        // プレイヤー × ステージあたり直近 5 件にトリム
        const grouped = {};
        for (const r of arr) {
            const k = `${r.playerId}:${r.stageNo}`;
            (grouped[k] || (grouped[k] = [])).push(r);
        }
        const pruned = [];
        for (const k of Object.keys(grouped)) {
            const list = grouped[k];
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            for (const r of list.slice(0, 5)) pruned.push(r);
        }
        writeSubmissions(pruned);

        // ---- Firestore に送信 (online のみ。失敗しても致命的ではない) ----
        let mode = 'offline';
        let sentOk = false;
        if (isOnline()) {
            const api = await getFirestoreApi();
            if (api) {
                try {
                    const ref = api.collection(window.Firebase.db, COLL_ROOT, stageId, COLL_LEAF);
                    // createdAt は serverTimestamp() を Rules が要求するので必ずこちら
                    const fsRecord = { ...baseRecord, createdAt: api.serverTimestamp() };
                    await api.addDoc(ref, fsRecord);
                    sentOk = true;
                    mode = 'online';
                } catch (e) {
                    console.warn('[Ranking] addDoc failed (will keep local copy):', e);
                    mode = 'online-failed';
                }
            }
        }

        // ---- 投稿後の順位を計算 (TOP1000 内に自分が見つかればその順位) ----
        const top = await fetchTop(entry.stageNo, 1000);
        const myPos = top.findIndex(e => e._self);

        return {
            ok:    sentOk || mode === 'offline',  // ローカルだけでも保存できれば ok
            sent:  sentOk,
            rank:  myPos >= 0 ? (myPos + 1) : null,
            total: top.length,
            mode,
        };
    }

    // ============================================================
    //   その他 API
    // ============================================================
    function getMyHistory() {
        return readSubmissions().slice();
    }

    function genSessionId() {
        try {
            if (crypto && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
        } catch (_) { /* noop */ }
        // polyfill (UUIDv4 風)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    window.Ranking = {
        load,
        fetchTop,
        submit,
        getMyHistory,
        isEnabled,
        setEnabled,
        isOnline,
    };

    // 起動時 seed プリロード (画面を開いた時の初回表示を速く)
    try { loadSeed(); } catch (_) {}
})();
