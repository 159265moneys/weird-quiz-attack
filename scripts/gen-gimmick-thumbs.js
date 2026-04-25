/* ============================================================
   gen-gimmick-thumbs.js
   ------------------------------------------------------------
   各ギミックを実 DOM レンダリングして PNG サムネを生成する。
   使い方: node scripts/gen-gimmick-thumbs.js
   出力先: sprite/gimmick-thumbs/{ID}.png  (1080x1080 → 540x540 にリサイズ)

   - W (キーボード/入力系) はサンプル DOM にキーボードが無いので除外
     → 図鑑の方で「プレイ中に体験できます」のフォールバックを使う。
   - C (選択肢系) は q-zone-answer 中心にクロップ。
   - B / G は q-zone-question 中心にクロップ。
   - 個別ギミックは CROP_OVERRIDE で y/h を上書き可能。
   ============================================================ */

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'sprite', 'gimmick-thumbs');
const HTML_PATH = path.join(ROOT, 'tools', 'thumb-gen.html');

// 1080×1080 で切り抜く (square)。元画像はそのまま PNG (~50-80KB)。
// gimmickGuide 側で <img> を 540x540 表示するので Retina 対応として 1080
// のままにしてもいいが、ファイルサイズを抑えるため puppeteer の screenshot
// を 1080×1080 で撮って保存する。
const CROP_W = 1080;
const CROP_H = 1080;

// カテゴリ別デフォルトクロップ y 座標
const DEFAULT_CROP_Y = {
    B: 100,   // header(40-200) を少しだけ + question(220-880) フル + 選択肢の頭
    C: 720,   // 下半分: question 末尾 + 4 選択肢フル
    G: 100,   // ボス系は問題文寄り
};

// ギミック個別の上書き (apply 結果を一番映える位置に出す)
//   y: 切り抜き上端
//   delay: apply してから screenshot まで待つ ms (アニメーションの中盤を狙う)
const CROP_OVERRIDE = {
    // 演出 (静的に映えるタイミング)
    B07_GLITCH: { delay: 300 },
    B08_FADEOUT: { delay: 200 },        // フェード途中で文字残ってる時点
    B12_BLUR: { delay: 1100 },          // 5秒サイクルで一番強くぼかしてるとこ付近
    B11_BLASTER: { delay: 700 },
    B33_SCANLINES: { delay: 600 },
    B35_SCAN_BAR: { delay: 700 },
    B36_BUBBLE_SPAM: { delay: 1300 },   // 2 個重なる時間帯 (b0[0-1500]+b1[800-2300])
    B37_STICKY_NOTES: { delay: 1500 },
    B38_QMARK_RAIN: { delay: 1500 },    // ? が画面に十分降ってから
    B39_FAKE_NOTIFICATION: { delay: 1500, y: 0 }, // 通知バナーは画面上部に出る
    B40_DANMAKU: { delay: 1200, y: 220 },
    B25_CHAR_OBSTRUCT: { delay: 800 },
    B24_SCROLL: { delay: 400 },
    B16_FAKE_COUNTDOWN: { delay: 200, y: 0 }, // header 寄りに偽カウントダウン
    B18_FAKE_ERROR: { delay: 600 },
    B22_DOUBLE_VISION: { delay: 500 },
    B29_BOUNCE: { delay: 500 },
    B30_SPIRAL: { delay: 500 },
    B34_JITTER: { delay: 200 },         // ジッターは止めずに撮る (ブレ感が出る)
    B32_TILT: { delay: 200 },
    B20_BLACKOUT: { delay: 800 },
    B02_TYPEWRITER: { delay: 800 },     // タイプ途中
    B04_ZOOM_CHAOS: { delay: 600 },
    B09_SHRINK: { delay: 600 },
    B27_CHAR_DROP: { delay: 200 },
    B28_SIZE_CHAOS: { delay: 200 },
    B23_REDACTION: { delay: 200 },
    B21_INSTANT_DEATH: { delay: 200 },
    B17_NOISE_TEXT: { delay: 200 },
    B05_MIRROR: { delay: 200 },
    B06_COLOR_BREAK: { delay: 200 },
    B10_SHUFFLE_TEXT: { delay: 200 },
    B26_COLOR_RANDOM: { delay: 200 },
    B31_FAINT: { delay: 200 },
    B13_TINY: { delay: 200 },
    B15_REVERSED_TEXT: { delay: 200 },
    B03_REVERSE: { delay: 200 },
    B01_REVERSE_TAP: { delay: 200 },
    // 選択肢系
    C01_SHUFFLE: { delay: 1000 },
    C02_CHOICE_NOISE: { delay: 200 },
    C03_CHAR_CORRUPT: { delay: 200 },
    C04_FAKE_5050: { delay: 1500 },
    // ボス
    G1_RANDOM_DEATH: { delay: 200 },
    G4_GARBLED_TEXT: { delay: 200 },
    G5_CHOICE_WARP: { delay: 600, y: 720 },
    G7_SCORE_TAUNT: { delay: 200 },
};

// 撮らないやつ (キーボード必須 / 体験必須なので静止画に意味がない)。
// 図鑑側でフォールバック表示する。
const SKIP_IDS = new Set([
    'W01', 'W02', 'W03', 'W04', 'W06', 'W07', 'W08', 'W09', 'W18', 'W20',
]);

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// CLI: node scripts/gen-gimmick-thumbs.js [ID...]
//   引数を渡すとそれだけ再生成 (例: node scripts/gen-gimmick-thumbs.js B36 B40)
//   引数なしで全ギミック再生成。
const ONLY_IDS = process.argv.slice(2).filter(a => !a.startsWith('-'));

(async () => {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 1 },
    });
    const page = await browser.newPage();
    page.on('console', msg => {
        if (msg.type() === 'error') console.warn('[page]', msg.text());
    });

    const url = 'file://' + HTML_PATH;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });

    // 全ギミック一覧 (id / category / supports)
    const list = await page.evaluate(() => window.__listGimmicks());

    let ok = 0, skipped = 0, failed = [];
    for (const g of list) {
        if (ONLY_IDS.length && !ONLY_IDS.includes(g.id)) {
            continue;
        }
        if (SKIP_IDS.has(g.id)) {
            skipped++;
            console.log(`  SKIP ${g.id}`);
            continue;
        }

        // クロップ計算
        const ovr = CROP_OVERRIDE[`${g.id}_DUMMY`] || {};
        // CROP_OVERRIDE は内部 const 名 (_GLITCH 付き) でマップしてるが、
        // 公開 ID は 'B07' なので id だけで直接ヒットさせる。
        const direct = (() => {
            for (const k of Object.keys(CROP_OVERRIDE)) {
                if (k === g.id || k.startsWith(g.id + '_')) return CROP_OVERRIDE[k];
            }
            return null;
        })();
        const conf = direct || {};
        const cropY = conf.y != null ? conf.y : (DEFAULT_CROP_Y[g.cat] ?? 100);
        const wait = conf.delay != null ? conf.delay : 600;

        // apply → wait → screenshot → reset
        await page.evaluate(() => window.__resetSample());
        const applied = await page.evaluate((id) => window.__applyGimmick(id), g.id);
        if (!applied) {
            failed.push(g.id);
            console.warn(`  FAIL apply ${g.id}`);
            continue;
        }
        await delay(wait);

        const outPath = path.join(OUT_DIR, `${g.id}.png`);
        try {
            await page.screenshot({
                path: outPath,
                clip: { x: 0, y: cropY, width: CROP_W, height: CROP_H },
                omitBackground: false,
            });
            ok++;
            console.log(`  OK   ${g.id}  → ${path.relative(ROOT, outPath)}`);
        } catch (e) {
            failed.push(g.id);
            console.warn(`  FAIL screenshot ${g.id}:`, e.message);
        }
    }

    await browser.close();

    console.log('');
    console.log(`done. ok=${ok}  skipped=${skipped}  failed=${failed.length}`);
    if (failed.length) console.log('failed ids:', failed.join(', '));
})().catch(err => {
    console.error(err);
    process.exit(1);
});
