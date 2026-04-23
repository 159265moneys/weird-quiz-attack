/* ============================================================
   dialogs.js — リザルト画面セリフ外部化ローダ
   ------------------------------------------------------------
   data/dialogs.json を一度だけ fetch してキャッシュし、
   tier 別メインセリフ / Stage 10 死亡枠 / サブキャラ抽選を提供する。

   API:
     Dialogs.load()              -> Promise<data>
     Dialogs.getMain(tier)       -> { poses, variants } | null
     Dialogs.getStage10Death()   -> [{ poses, lines }, ...]
     Dialogs.getSubCharFor(stageNo, rank)
         -> { id, label, iconId, image, poses, variants } | null
     Dialogs.interpolate(line, vars)
         -> "{pct}" / "{label}" を差し替えた文字列

   JSON 未ロード時は各 getter が null/空配列を返し、呼び出し側は
   自前のフォールバック (無表示) にすれば落ちない設計。
   ============================================================ */

(function () {
    const DATA_URL = 'data/dialogs.json';

    let cache = null;     // normalized data
    let loading = null;   // in-flight Promise

    function normalize(raw) {
        if (!raw || typeof raw !== 'object') {
            return { main: {}, stage10Death: [], subCharacters: {} };
        }
        return {
            main: (raw.main && typeof raw.main === 'object') ? raw.main : {},
            stage10Death: Array.isArray(raw.stage10Death) ? raw.stage10Death : [],
            subCharacters: (raw.subCharacters && typeof raw.subCharacters === 'object')
                ? raw.subCharacters : {},
        };
    }

    function load() {
        if (cache) return Promise.resolve(cache);
        if (loading) return loading;
        loading = fetch(DATA_URL, { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
            .then(raw => { cache = normalize(raw); loading = null; return cache; });
        return loading;
    }

    function getMain(tier) {
        if (!cache) return null;
        const bank = cache.main[tier];
        if (!bank || !Array.isArray(bank.variants) || bank.variants.length === 0) return null;
        return {
            poses: Array.isArray(bank.poses) ? bank.poses.slice() : ['basic'],
            variants: bank.variants,
        };
    }

    function getStage10Death() {
        if (!cache) return [];
        return cache.stage10Death.slice();
    }

    // stageNo + rank から該当サブキャラを 1 体だけ返す (要件: 各ステージ帯に
    // 1 キャラ。将来複数被った場合は最初にマッチしたものを採用)。
    function getSubCharFor(stageNo, rank) {
        if (!cache) return null;
        const ids = Object.keys(cache.subCharacters);
        for (const id of ids) {
            const c = cache.subCharacters[id];
            if (!c) continue;
            const stages = Array.isArray(c.stages) ? c.stages : [];
            const ranks  = Array.isArray(c.ranks)  ? c.ranks  : [];
            if (!stages.includes(stageNo)) continue;
            if (!ranks.includes(rank)) continue;
            return {
                id,
                label:   c.label   || id.toUpperCase(),
                iconId:  c.iconId  || id,
                image:   c.image   || null,
                poses:   Array.isArray(c.poses) ? c.poses.slice() : ['basic'],
                variants: Array.isArray(c.variants) ? c.variants : [],
            };
        }
        return null;
    }

    // "{pct}" / "{label}" を vars から差し替え。未定義キーは空文字に。
    // 値側に { } が入ってても連鎖置換しないよう、1 回のパスで処理する。
    function interpolate(line, vars) {
        if (typeof line !== 'string' || !line) return '';
        const v = vars || {};
        return line.replace(/\{(pct|label)\}/g, (_, key) => {
            const val = v[key];
            return (val == null) ? '' : String(val);
        });
    }

    window.Dialogs = {
        load,
        getMain,
        getStage10Death,
        getSubCharFor,
        interpolate,
    };

    // 起動と同時に取得開始 (result 画面到達までに cache 完了してる想定)
    try { load(); } catch (_) {}
})();
