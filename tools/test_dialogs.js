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

    // getSubCharFor は stages のみで判定 (rank/F は pickSubVariantBank で別個に判定)
    const sub5 = sandbox.window.Dialogs.getSubCharFor(5);
    assert('stage5 → jellyfish', sub5 && sub5.id === 'jellyfish', JSON.stringify(sub5));
    const sub6 = sandbox.window.Dialogs.getSubCharFor(6);
    assert('stage6 → jellyfish', sub6 && sub6.id === 'jellyfish');
    const sub7 = sandbox.window.Dialogs.getSubCharFor(7);
    assert('stage7 → tv', sub7 && sub7.id === 'tv');
    const sub8 = sandbox.window.Dialogs.getSubCharFor(8);
    assert('stage8 → tv', sub8 && sub8.id === 'tv');
    const sub9 = sandbox.window.Dialogs.getSubCharFor(9);
    assert('stage9 → phonograph', sub9 && sub9.id === 'phonograph');
    const sub10 = sandbox.window.Dialogs.getSubCharFor(10);
    assert('stage10 → phonograph', sub10 && sub10.id === 'phonograph');
    assert('stage1 → null (対象外)', sandbox.window.Dialogs.getSubCharFor(1) === null);
    assert('stage4 → null', sandbox.window.Dialogs.getSubCharFor(4) === null);

    // pickSubVariantBank: ランク別バンク選択 + deathOrF はアンロック後限定
    const pick = sandbox.window.Dialogs.pickSubVariantBank;
    const ssBank = pick(sub5, 'SS', false, false);
    assert('jellyfish SS bank 取得', Array.isArray(ssBank) && ssBank.length === 7);
    const sBank = pick(sub5, 'S', false, false);
    assert('jellyfish S bank 取得', Array.isArray(sBank) && sBank.length === 5);
    const aBank = pick(sub5, 'A', false, false);
    assert('jellyfish A → default bank', Array.isArray(aBank) && aBank.length === 11);
    const bBank = pick(sub5, 'B', false, false);
    assert('jellyfish B → default bank', Array.isArray(bBank) && bBank.length === 11);
    const fLocked = pick(sub5, 'F', false, false);
    assert('jellyfish F + 未解放 → null (= 非登場)', fLocked === null);
    const fUnlocked = pick(sub5, 'F', false, true);
    assert('jellyfish F + 解放後 → deathOrF', Array.isArray(fUnlocked) && fUnlocked.length === 7);
    const deathLocked = pick(sub5, 'A', true, false);
    assert('jellyfish A+deathEnd + 未解放 → null', deathLocked === null);
    const deathUnlocked = pick(sub5, 'A', true, true);
    assert('jellyfish A+deathEnd + 解放後 → deathOrF', Array.isArray(deathUnlocked) && deathUnlocked.length === 7);

    // home bank
    const homePuzzle = sandbox.window.Dialogs.getHomeBank('puzzle');
    assert('home.puzzle 20 行', Array.isArray(homePuzzle) && homePuzzle.length === 20, homePuzzle?.length);
    const homeJelly = sandbox.window.Dialogs.getHomeBank('jellyfish');
    assert('home.jellyfish 20 行', Array.isArray(homeJelly) && homeJelly.length === 20);
    const homeTv = sandbox.window.Dialogs.getHomeBank('tv');
    assert('home.tv 20 行', Array.isArray(homeTv) && homeTv.length === 20);
    const homePhono = sandbox.window.Dialogs.getHomeBank('phonograph');
    assert('home.phonograph 20 行', Array.isArray(homePhono) && homePhono.length === 20);
    const homeUnknown = sandbox.window.Dialogs.getHomeBank('does_not_exist');
    assert('home.unknown → puzzle にフォールバック', Array.isArray(homeUnknown) && homeUnknown.length === 20);

    // interpolate
    const ip = sandbox.window.Dialogs.interpolate('{pct} に {label} だよ', { pct: '上位 8%', label: 'TEST' });
    assert('interpolate {pct}{label}', ip === '上位 8% に TEST だよ', ip);
    const ipEmpty = sandbox.window.Dialogs.interpolate('{pct} です {label}', { pct: '上位 8%' });
    assert('interpolate label 未指定 → 空', ipEmpty === '上位 8% です ', ipEmpty);

    // main 全 tier (新仕様: 各 11 パターン)
    const tiers = ['GODLIKE','ELITE','STRONG','DECENT','NORMAL_DOWN','WEAK','TERRIBLE','DOOMED'];
    for (const t of tiers) {
        const b = sandbox.window.Dialogs.getMain(t);
        assert('main.'+t+' 取得 (11 パターン)', b && b.variants && b.variants.length === 11, b ? b.variants.length : 'null');
    }

    // stage10 death (新仕様: 11 パターン)
    const d = sandbox.window.Dialogs.getStage10Death();
    assert('stage10Death ×11', d.length === 11);
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
