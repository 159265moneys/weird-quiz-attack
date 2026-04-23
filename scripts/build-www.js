#!/usr/bin/env node
/* ============================================================
   scripts/build-www.js — Capacitor 用 www ビルド
   ------------------------------------------------------------
   ゲーム本体はビルドステップを持たないバニラ HTML/JS/CSS なので、
   "Capacitor に渡すために必要なファイルだけ www/ にコピー" する
   単純なスクリプトでビルド代わりとする。

   コピー対象:
     index.html      (ルート)
     audio/          (SE/BGM 素材)
     data/           (問題データ, dialogs.json, ranking_seed.json)
     js/             (すべてのスクリプト)
     sprite/         (画像素材)
     styles/         (CSS)

   除外:
     node_modules/, ios/, android/, www/, scripts/, tools/,
     docs (*.md / *.csv), 非ゲーム資産 (marketing/, 参考/, x-header.html)

   npm run build で実行される。npx cap sync 前に自動で走らせる。
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'www');

const INCLUDE_FILES = ['index.html'];
const INCLUDE_DIRS  = ['audio', 'data', 'js', 'sprite', 'styles'];

function rmrf(p) {
    if (!fs.existsSync(p)) return;
    if (fs.rmSync) {
        fs.rmSync(p, { recursive: true, force: true });
    } else {
        // Node < 14.14 fallback
        for (const entry of fs.readdirSync(p)) {
            const cur = path.join(p, entry);
            if (fs.lstatSync(cur).isDirectory()) rmrf(cur);
            else fs.unlinkSync(cur);
        }
        fs.rmdirSync(p);
    }
}

function copyRecursive(src, dst) {
    const st = fs.statSync(src);
    if (st.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        for (const name of fs.readdirSync(src)) {
            // 明示的除外: .DS_Store 等のゴミ
            if (name === '.DS_Store' || name.startsWith('._')) continue;
            copyRecursive(path.join(src, name), path.join(dst, name));
        }
    } else {
        fs.copyFileSync(src, dst);
    }
}

function main() {
    const t0 = Date.now();
    console.log('[build-www] out =', OUT);

    rmrf(OUT);
    fs.mkdirSync(OUT, { recursive: true });

    for (const f of INCLUDE_FILES) {
        const src = path.join(ROOT, f);
        if (!fs.existsSync(src)) {
            console.warn('  skip (missing):', f);
            continue;
        }
        copyRecursive(src, path.join(OUT, f));
        console.log('  +', f);
    }
    for (const d of INCLUDE_DIRS) {
        const src = path.join(ROOT, d);
        if (!fs.existsSync(src)) {
            console.warn('  skip (missing):', d);
            continue;
        }
        copyRecursive(src, path.join(OUT, d));
        console.log('  +', d + '/');
    }

    const dt = Date.now() - t0;
    console.log(`[build-www] done in ${dt}ms`);
}

main();
