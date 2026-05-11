/* ============================================================
   dialogs.js — リザルト + ホーム のセリフ外部化ローダ
   ------------------------------------------------------------
   data/dialogs.json を一度だけ fetch してキャッシュし、
   各画面に必要な getter を提供する。

   API:
     Dialogs.load()                 -> Promise<data>
     Dialogs.getMain(tier)          -> { poses, variants } | null
     Dialogs.getStage10Death()      -> [{ poses, lines }, ...]
     Dialogs.getSubCharFor(stageNo) -> { id, label, iconId, image,
                                          poses, stages, variants } | null
       ※ rank 引数は廃止 (variants object のキーで判定)。
     Dialogs.pickSubVariantBank(subChar, rank, deathEnd, unlocked)
       -> [["a","b"], ...] | null
       ※ deathOrF バンクは unlocked=true のときだけ返す。
     Dialogs.getHomeBank(charId)    -> ["text", ...] | null
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
            return { main: {}, stage10Death: [], subCharacters: {}, home: {} };
        }
        return {
            main: (raw.main && typeof raw.main === 'object') ? raw.main : {},
            stage10Death: Array.isArray(raw.stage10Death) ? raw.stage10Death : [],
            subCharacters: (raw.subCharacters && typeof raw.subCharacters === 'object')
                ? raw.subCharacters : {},
            home: (raw.home && typeof raw.home === 'object') ? raw.home : {},
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

    // stageNo に該当するサブキャラを 1 体返す (各ステージ帯に 1 キャラ前提)。
    // rank に応じたバンク選択は呼び出し側で pickSubVariantBank() を使う。
    function getSubCharFor(stageNo) {
        if (!cache) return null;
        const ids = Object.keys(cache.subCharacters);
        for (const id of ids) {
            const c = cache.subCharacters[id];
            if (!c) continue;
            const stages = Array.isArray(c.stages) ? c.stages : [];
            if (!stages.includes(stageNo)) continue;
            return {
                id,
                label:    c.label    || '',
                iconId:   c.iconId   || id,
                image:    c.image    || null,
                stages:   stages.slice(),
                poses:    Array.isArray(c.poses) ? c.poses.slice() : ['basic'],
                variants: (c.variants && typeof c.variants === 'object') ? c.variants : {},
            };
        }
        return null;
    }

    // (subChar, rank, deathEnd, unlocked) → variant bank (= [[line,line], ...])
    //   F または deathEnd の場合: unlocked=true なら deathOrF バンクを使う。
    //                             unlocked=false なら null (= サブキャラ非登場)
    //   SS / S はそれぞれ専用バンクがあれば優先、無ければ default。
    //   B / A は default。
    //   variants が legacy 配列形式 (古い JSON) の場合はそれをそのまま返す。
    function pickSubVariantBank(subChar, rank, deathEnd, unlocked) {
        if (!subChar) return null;
        const v = subChar.variants;
        if (!v) return null;
        // 旧形式 (variants が flat array) サポート
        if (Array.isArray(v)) {
            return v.length ? v : null;
        }
        if (typeof v !== 'object') return null;

        const isFOrDeath = (rank === 'F') || !!deathEnd;
        if (isFOrDeath) {
            // 解放後だけ煽り/慰めバンクを出す
            if (unlocked && Array.isArray(v.deathOrF) && v.deathOrF.length) {
                return v.deathOrF;
            }
            return null; // F/death 時は default バンクで褒めるとちぐはぐなので諦める
        }
        if (rank === 'SS' && Array.isArray(v.SS) && v.SS.length) return v.SS;
        if (rank === 'S'  && Array.isArray(v.S)  && v.S.length)  return v.S;
        if (Array.isArray(v.default) && v.default.length) return v.default;
        // 最終フォールバック: 空でない最初のバンク
        for (const k of ['default', 'SS', 'S', 'deathOrF']) {
            if (Array.isArray(v[k]) && v[k].length) return v[k];
        }
        return null;
    }

    // ホーム画面: charId に対応するセリフ配列を返す。
    // 未対応 charId の場合は puzzle 用にフォールバック。
    function getHomeBank(charId) {
        if (!cache) return null;
        const home = cache.home || {};
        const arr = Array.isArray(home[charId]) ? home[charId] : null;
        if (arr && arr.length) return arr.slice();
        const fb = Array.isArray(home.puzzle) ? home.puzzle : null;
        return (fb && fb.length) ? fb.slice() : null;
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
        pickSubVariantBank,
        getHomeBank,
        interpolate,
    };

    // 起動と同時に取得開始 (各画面到達までに cache 完了してる想定)
    try { load(); } catch (_) {}
})();
