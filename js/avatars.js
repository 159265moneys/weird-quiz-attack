/* ============================================================
   avatars.js — プリセットアイコン (sprite/avatars/) のローダ
   ------------------------------------------------------------
   sprite/avatars/manifest.json を 1 度だけ fetch してキャッシュ。
   PROFILE パネル等がリストを取得 / id→ファイルパス解決するだけの
   薄い窓口。存在しないファイルが指定された時は null を返す。
   Capacitor 移植時も相対 fetch で OK (ローカルバンドル読み込み)。
   ============================================================ */

(function () {
    // manifest は sprite/avatars/ に置くが、実ファイルは sprite/chars/ にも
    // 分散しているので (butterfly は avatars/、キャラ本体ポーズ画像は chars/)、
    // BASE_PATH は sprite/ 直下に揃えて manifest の file 側で chars/xxx.png 等の
    // サブパスを書く方針に変更。
    const MANIFEST_URL = 'sprite/avatars/manifest.json';
    const BASE_PATH    = 'sprite/';

    let cache = null;      // { items: [{id,file,label}, ...] }
    let loading = null;    // in-flight Promise

    // 壊れた manifest でも致命傷にならないよう、items が取れなければ空リスト
    function normalize(raw) {
        if (!raw || !Array.isArray(raw.items)) return { items: [] };
        const items = raw.items
            .filter(x => x && typeof x.id === 'string' && typeof x.file === 'string')
            .map(x => ({
                id: x.id,
                file: x.file,
                label: x.label || x.id.toUpperCase(),
            }));
        return { items };
    }

    function load() {
        if (cache) return Promise.resolve(cache);
        if (loading) return loading;
        loading = fetch(MANIFEST_URL, { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : { items: [] })
            .catch(() => ({ items: [] }))
            .then(raw => { cache = normalize(raw); loading = null; return cache; });
        return loading;
    }

    function getList() {
        return cache ? cache.items.slice() : [];
    }

    function getById(id) {
        if (!cache || !id) return null;
        return cache.items.find(x => x.id === id) || null;
    }

    // id を解決して <img src> に渡せるパスを返す。未登録/null なら null。
    // file は "chars/puzzle_new_avatar.png" のようにサブディレクトリを含み得るので
    // segment 毎に encodeURIComponent して '/' を温存する (全体 encode だと '/'
    // が '%2F' になって壊れる)。
    function pathOf(id) {
        const item = getById(id);
        if (!item) return null;
        const safe = String(item.file)
            .split('/')
            .map(seg => encodeURIComponent(seg))
            .join('/');
        return BASE_PATH + safe;
    }

    window.Avatars = {
        load,
        getList,
        getById,
        pathOf,
    };

    // スクリプト評価と同時にマニフェスト取得を走らせておく
    //   (後で参照するタイミングまでには概ね cache 完了しているため、
    //    title 画面などが synchronous に getById / pathOf できるようになる)
    try { load(); } catch (_) {}
})();

