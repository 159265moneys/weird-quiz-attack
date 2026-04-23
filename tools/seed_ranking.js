/* ============================================================
   tools/seed_ranking.js — ランキング用ダミーデータ生成スクリプト
   ------------------------------------------------------------
   実行: node tools/seed_ranking.js
   出力: data/ranking_seed.json (10 stage × 100 件 = 1000 件)

   目的:
     α/β 期間は実ユーザー数が少なすぎて
     「ランキング TOP 100」が自分1人になり成立しない。
     そのため plausible なダミースコアを事前 seed する。
     将来 Firestore に投入する際は同フォーマットをそのまま
     firestore import で流し込めるように設計。

   生成ルール:
     - playerId: プレイヤーIDと同じ 6 桁英数字 (衝突しにくい文字プール)
     - displayName: プロフィール未設定扱い → ID そのままを表示名に使う
                   (ゲーム本体の Save.getPlayerDisplayName と同じ挙動)
     - iconId: 80% で null、残り 20% はプリセットアバターのいずれか
     - stage: 各ステージ 100 件ずつ
     - rank: ステージ難度に応じた分布 (易しいステージほど上位に寄る)
     - score: ランクごとの点数帯で正規分布っぽく散らす
     - totalTimeMs: ランクから逆算したタイム (SS は速い、F は投了気味)
     - createdAt: 過去 30 日に散らして"運用された感"を演出
     - _bot: true — 本番で一括削除/トグル非表示できるように印をつけておく

   注意:
     このファイル自体は Node で実行するが、ブラウザには
     data/ranking_seed.json として置かれるので、ブラウザ側は
     fetch で読むだけ。
   ============================================================ */

const fs = require('fs');
const path = require('path');

// --- 決定性乱数 (seed 指定で再現可能) ---
// 毎回同じデータを吐きたいので Mulberry32。
function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t = (t + 0x6D2B79F5) >>> 0;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return (((x ^ (x >>> 14)) >>> 0) / 4294967296);
    };
}
const rand = mulberry32(42);
function rnd(min, max) { return min + rand() * (max - min); }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }
function pickWeighted(pairs) {
    // [[value, weight], ...] の重み付き抽選
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [v, w] of pairs) {
        r -= w;
        if (r <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
}
// 正規分布近似 (Box-Muller の簡易版)
function gauss(mean, stddev) {
    const u1 = 1 - rand();
    const u2 = 1 - rand();
    const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// --- ID / アバター ---
// Save.js と同じ文字プール (紛らわしい 0/O/1/I/L/l は除外)
const ID_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genPlayerId() {
    let s = '';
    for (let i = 0; i < 6; i++) s += ID_POOL[Math.floor(rand() * ID_POOL.length)];
    return s;
}
const AVATAR_IDS = ['butterfly', 'jellyfish', 'tv', 'puzzle', 'phonograph'];
function pickIcon() {
    // 80% で未選択 (null = NONE)、残り 20% でアバター
    if (rand() < 0.80) return null;
    return AVATAR_IDS[Math.floor(rand() * AVATAR_IDS.length)];
}

// --- ランク分布 (ステージごと) ---
// 易しいステージほど上位比率高め、難しいステージは F/E 多め。
// 合計 100 になるよう設計。
const STAGE_RANK_DIST = {
    1:  { SS: 8,  S: 14, A: 22, B: 30, C: 15, D:  7, E:  3, F:  1 },
    2:  { SS: 6,  S: 12, A: 22, B: 32, C: 17, D:  7, E:  3, F:  1 },
    3:  { SS: 5,  S: 10, A: 20, B: 33, C: 19, D:  8, E:  3, F:  2 },
    4:  { SS: 4,  S:  9, A: 18, B: 32, C: 22, D: 10, E:  3, F:  2 },
    5:  { SS: 3,  S:  8, A: 16, B: 30, C: 24, D: 12, E:  5, F:  2 },
    6:  { SS: 2,  S:  6, A: 14, B: 28, C: 26, D: 14, E:  7, F:  3 },
    7:  { SS: 1,  S:  5, A: 12, B: 25, C: 27, D: 17, E:  9, F:  4 },
    8:  { SS: 1,  S:  4, A:  9, B: 22, C: 27, D: 20, E: 11, F:  6 },
    9:  { SS: 0,  S:  2, A:  6, B: 18, C: 26, D: 23, E: 16, F:  9 },
    10: { SS: 0,  S:  1, A:  4, B: 12, C: 22, D: 26, E: 22, F: 13 },
};

// --- ランク → スコア帯 (40000 点満点) ---
// mean/stddev はおおよそで、狭すぎずかつ桁違いにならない範囲。
// scoring.js: 1問最大 2000 (正答1000 + タイムボーナス最大1000) × 20問。
const RANK_SCORE = {
    SS: { mean: 38000, stddev:  800, min: 36000, max: 39800 },
    S:  { mean: 34000, stddev: 1600, min: 30500, max: 37500 },
    A:  { mean: 30500, stddev: 2000, min: 26000, max: 34000 },
    B:  { mean: 24500, stddev: 3200, min: 17000, max: 31000 },
    C:  { mean: 17500, stddev: 3200, min: 10000, max: 24000 },
    D:  { mean: 10500, stddev: 2500, min:  5000, max: 16000 },
    E:  { mean:  5500, stddev: 1800, min:  1500, max:  9500 },
    F:  { mean:  2000, stddev: 1500, min:     0, max:  6000 },
};

// --- ランク → 所要時間 (秒) ---
// SS: 必ず 150 秒以下 / S: 150-210 / A: 〜240 / それ以下はバラける
const RANK_TIME_SEC = {
    SS: { mean: 130, stddev: 12, min:  95, max: 150 },
    S:  { mean: 180, stddev: 18, min: 151, max: 210 },
    A:  { mean: 220, stddev: 18, min: 180, max: 240 },
    B:  { mean: 340, stddev: 70, min: 230, max: 500 },
    C:  { mean: 430, stddev: 90, min: 280, max: 650 },
    D:  { mean: 520, stddev: 110, min: 320, max: 820 },
    E:  { mean: 660, stddev: 140, min: 380, max: 960 },
    F:  { mean: 480, stddev: 180, min: 150, max: 960 },
};

// --- accuracy (0-1) ---
// ランク判定ロジックと整合するように割当。
//   SS/S = 1.0, A ≥ 0.95, B ≥ 0.70, C ≥ 0.50, D ≥ 0.30, E ≥ 0.10, F < 0.10 or death
function rankAccuracy(rank, deathEnd) {
    if (deathEnd) return clamp(rand(), 0.20, 0.95); // 即死は正答率自体は高いこともある
    switch (rank) {
        case 'SS':
        case 'S':  return 1.0;
        case 'A':  return clamp(gauss(0.97, 0.015), 0.95, 1.00);
        case 'B':  return clamp(gauss(0.82, 0.06),  0.70, 0.94);
        case 'C':  return clamp(gauss(0.60, 0.05),  0.50, 0.69);
        case 'D':  return clamp(gauss(0.40, 0.05),  0.30, 0.49);
        case 'E':  return clamp(gauss(0.18, 0.04),  0.10, 0.29);
        default:   return clamp(gauss(0.05, 0.03),  0.00, 0.095);
    }
}

// --- 時刻: 過去 30 日間に均等散布 ---
const NOW_MS = Date.now();
const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;
function pastCreatedAt() {
    return Math.floor(NOW_MS - rand() * MS_30_DAYS);
}
function genSessionId() {
    // Firestore ドキュメント ID 風 (ランダム 20 文字)
    const POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s = '';
    for (let i = 0; i < 20; i++) s += POOL[Math.floor(rand() * POOL.length)];
    return s;
}

// --- 指定分布に従ってランクを 100 件引く ---
function sampleRanks(distribution) {
    const pairs = Object.entries(distribution).map(([k, v]) => [k, v]);
    const out = [];
    for (let i = 0; i < 100; i++) {
        out.push(pickWeighted(pairs));
    }
    return out;
}

// --- 1 エントリ生成 ---
function makeEntry(stageNo, rank) {
    const deathEnd = (rank === 'F') && (rand() < 0.55); // F の半分ちょっとは即死
    const scoreSpec = RANK_SCORE[rank];
    const timeSpec = (deathEnd ? RANK_TIME_SEC.F : RANK_TIME_SEC[rank]);
    const score = Math.round(clamp(gauss(scoreSpec.mean, scoreSpec.stddev), scoreSpec.min, scoreSpec.max));
    const totalTimeSec = clamp(gauss(timeSpec.mean, timeSpec.stddev), timeSpec.min, timeSpec.max);
    const acc = rankAccuracy(rank, deathEnd);
    const correct = Math.min(20, Math.round(acc * 20));

    const playerId = genPlayerId();
    return {
        playerId,
        displayName: playerId,        // ゲーム仕様: name 未設定なら ID がそのまま表示名
        iconId: pickIcon(),
        stageId: `stage-${stageNo}`,
        stageNo,
        score,
        correct,
        total: 20,
        totalTimeMs: Math.round(totalTimeSec * 1000),
        rank,
        deathEnd,
        createdAt: pastCreatedAt(),
        sessionId: genSessionId(),
        appVersion: '0.9.0-alpha',
        _bot: true,  // 本番で一括除外/削除できるフラグ
    };
}

// --- メイン ---
function main() {
    const all = [];
    for (let stageNo = 1; stageNo <= 10; stageNo++) {
        const ranks = sampleRanks(STAGE_RANK_DIST[stageNo]);
        for (const r of ranks) {
            all.push(makeEntry(stageNo, r));
        }
    }
    // スコア高い順に並べる (同点はタイムが短い方が上、さらに古い方が上)
    all.sort((a, b) => {
        if (a.stageNo !== b.stageNo) return a.stageNo - b.stageNo;
        if (b.score !== a.score) return b.score - a.score;
        if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
        return a.createdAt - b.createdAt;
    });

    const outPath = path.join(__dirname, '..', 'data', 'ranking_seed.json');
    const output = {
        _generatedAt: new Date().toISOString(),
        _count: all.length,
        _note: 'ダミーデータ。Firestore 投入後は _bot: true で除外可能。',
        entries: all,
    };
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`Wrote ${all.length} entries to ${outPath}`);

    // 各ステージのランク分布を出力 (検算用)
    console.log('\n=== Rank distribution per stage ===');
    const header = 'stage\tSS\tS\tA\tB\tC\tD\tE\tF\ttopScore';
    console.log(header);
    for (let stageNo = 1; stageNo <= 10; stageNo++) {
        const stEntries = all.filter(e => e.stageNo === stageNo);
        const counts = { SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
        for (const e of stEntries) counts[e.rank]++;
        const top = stEntries[0]?.score || 0;
        console.log(`${stageNo}\t${counts.SS}\t${counts.S}\t${counts.A}\t${counts.B}\t${counts.C}\t${counts.D}\t${counts.E}\t${counts.F}\t${top}`);
    }
}

main();
