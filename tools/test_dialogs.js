/* dialogs.js / save.js のユニットテスト (Node 実行用)
   ブラウザ前提の window.* を最低限モックし、主要ロジックだけを検証する。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(relPath, sandbox) {
    const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
    vm.runInContext(code, sandbox);
}

// --- ブラウザ環境モック ---
const localStorageStore = {};
const sandbox = {
    console,
    setTimeout, clearTimeout,
    window: {
        CONFIG: { SAVE_KEY: 'test-key', SAVE_VERSION: 1 },
    },
    localStorage: {
        getItem: (k) => localStorageStore[k] ?? null,
        setItem: (k, v) => { localStorageStore[k] = String(v); },
        removeItem: (k) => { delete localStorageStore[k]; },
    },
    fetch: async (url) => {
        const rel = url.replace(/^\//, '');
        const p = path.join(__dirname, '..', rel);
        if (!fs.existsSync(p)) return { ok: false, json: async () => null };
        const text = fs.readFileSync(p, 'utf8');
        return { ok: true, json: async () => JSON.parse(text) };
    },
};
vm.createContext(sandbox);

// --- ロード ---
load('js/save.js', sandbox);
load('js/dialogs.js', sandbox);

// window.Save.load() を呼ぶ
sandbox.window.Save.load();

let failed = 0;
function assert(label, cond, detail) {
    if (cond) { console.log('  PASS', label); }
    else { console.log('  FAIL', label, detail || ''); failed++; }
}

(async () => {
    console.log('--- Dialogs ---');
    await sandbox.window.Dialogs.load();

    const sub5A = sandbox.window.Dialogs.getSubCharFor(5, 'A');
    assert('stage5 A → jellyfish', sub5A && sub5A.id === 'jellyfish', JSON.stringify(sub5A));

    const sub6S = sandbox.window.Dialogs.getSubCharFor(6, 'S');
    assert('stage6 S → jellyfish', sub6S && sub6S.id === 'jellyfish');

    const sub7A = sandbox.window.Dialogs.getSubCharFor(7, 'A');
    assert('stage7 A → tv', sub7A && sub7A.id === 'tv');

    const sub8SS = sandbox.window.Dialogs.getSubCharFor(8, 'SS');
    assert('stage8 SS → tv', sub8SS && sub8SS.id === 'tv');

    const sub9SS = sandbox.window.Dialogs.getSubCharFor(9, 'SS');
    assert('stage9 SS → phonograph', sub9SS && sub9SS.id === 'phonograph');

    const sub10A = sandbox.window.Dialogs.getSubCharFor(10, 'A');
    assert('stage10 A → phonograph', sub10A && sub10A.id === 'phonograph');

    assert('stage1 SS → null (対象外)', sandbox.window.Dialogs.getSubCharFor(1, 'SS') === null);
    assert('stage5 B → null (ランク不足)', sandbox.window.Dialogs.getSubCharFor(5, 'B') === null);
    assert('stage5 F → null (F は除外)', sandbox.window.Dialogs.getSubCharFor(5, 'F') === null);
    assert('stage4 A → null', sandbox.window.Dialogs.getSubCharFor(4, 'A') === null);

    // interpolate
    const ip = sandbox.window.Dialogs.interpolate('{pct} に {label} だよ', { pct: '上位 8%', label: 'TEST' });
    assert('interpolate {pct}{label}', ip === '上位 8% に TEST だよ', ip);
    const ipEmpty = sandbox.window.Dialogs.interpolate('{pct} です {label}', { pct: '上位 8%' });
    assert('interpolate label 未指定 → 空', ipEmpty === '上位 8% です ', ipEmpty);

    // main 全 tier
    const tiers = ['GODLIKE','ELITE','STRONG','DECENT','NORMAL_DOWN','WEAK','TERRIBLE','DOOMED'];
    for (const t of tiers) {
        const b = sandbox.window.Dialogs.getMain(t);
        assert('main.'+t+' 取得', b && b.variants && b.variants.length === 5, b ? b.variants.length : 'null');
    }

    // stage10 death
    const d = sandbox.window.Dialogs.getStage10Death();
    assert('stage10Death ×5', d.length === 5);
    assert('stage10Death[0].lines length', Array.isArray(d[0].lines) && d[0].lines.length >= 2);

    console.log('--- Save ---');
    const unlocked = sandbox.window.Save.getUnlockedIcons();
    assert('初期 unlockedIcons に butterfly', unlocked.includes('butterfly'));
    assert('初期 unlockedIcons に puzzle', unlocked.includes('puzzle'));
    assert('初期 unlockedIcons に jellyfish 含まず', !unlocked.includes('jellyfish'));

    assert('isIconUnlocked(butterfly)', sandbox.window.Save.isIconUnlocked('butterfly') === true);
    assert('isIconUnlocked(jellyfish) false', sandbox.window.Save.isIconUnlocked('jellyfish') === false);
    assert('isIconUnlocked(null) true', sandbox.window.Save.isIconUnlocked(null) === true);

    const r1 = sandbox.window.Save.unlockIcon('jellyfish');
    assert('unlockIcon(jellyfish) 初回 true', r1 === true);
    assert('unlockIcon(jellyfish) 後 isIconUnlocked true', sandbox.window.Save.isIconUnlocked('jellyfish') === true);
    const r2 = sandbox.window.Save.unlockIcon('jellyfish');
    assert('unlockIcon(jellyfish) 2回目 false (既存)', r2 === false);

    // persist → 再 load で保持
    const raw = localStorageStore['test-key'];
    assert('persist: jellyfish 含まれる', raw && raw.includes('jellyfish'));

    // 旧セーブ (unlockedIcons なし + icon=jellyfish) マイグレーション検証
    delete localStorageStore['test-key'];
    localStorageStore['test-key'] = JSON.stringify({
        version: 1,
        player: { id: 'ABCDEF', name: null, icon: 'tv' },
        progress: { unlockedStage: 5, clearedStages: [1,2,3,4] },
        scores: {}, flags: {}, settings: {},
    });
    sandbox.window.Save.load();
    const migUnlocks = sandbox.window.Save.getUnlockedIcons();
    assert('旧セーブ migration: butterfly 追加', migUnlocks.includes('butterfly'));
    assert('旧セーブ migration: puzzle 追加', migUnlocks.includes('puzzle'));
    assert('旧セーブ migration: 選択中の tv を没収しない', migUnlocks.includes('tv'));
    assert('旧セーブ migration: jellyfish は未解放のまま', !migUnlocks.includes('jellyfish'));

    console.log('\n=======');
    if (failed === 0) console.log('ALL PASSED');
    else { console.log(failed, 'FAILED'); process.exit(1); }
})();
