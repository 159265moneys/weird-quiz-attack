/* ============================================================
   loader.js — 問題JSONの読み込み & ステージ用抽選
   (Phase 1) 全ジャンル単純合算 → ランダムに N 問抜く、のみ。
   将来のジャンル比率・難度比率制御はここを差し替えて対応。
   ============================================================ */

(function () {
    const GENRES = window.CONFIG.GENRES;

    let _cache = null;

    async function loadAll() {
        if (_cache) return _cache;
        const results = await Promise.all(
            GENRES.map(async (g) => {
                const resp = await fetch(`data/questions/${g}.json`);
                if (!resp.ok) throw new Error(`failed to load ${g}.json`);
                return await resp.json();
            })
        );
        _cache = results.flat();
        return _cache;
    }

    // 内部: 配列をシャッフルして返す (Fisher-Yates)
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // 選択肢問題の choices を毎回シャッフル + answer index を追随。
    // 「丸暗記で位置だけ覚える」対策。元の q は変更せず浅いコピーを返す。
    function shuffleChoices(q) {
        if (q.mode !== 'choice' || !Array.isArray(q.choices) || q.choices.length < 2) {
            return q;
        }
        const n = q.choices.length;
        const perm = shuffle([...Array(n).keys()]);          // ex: [2,0,3,1]
        const newChoices = perm.map(i => q.choices[i]);
        const newAnswer  = perm.indexOf(q.answer);
        return { ...q, choices: newChoices, answer: newAnswer };
    }

    function pickForStage(all, stageNo, count) {
        const stageCfg = window.CONFIG.STAGES.find(s => s.no === stageNo);
        const diff = stageCfg?.diff || [1 / 3, 1 / 3, 1 / 3];

        // difficulty は 1〜10 の10段階。ステージ level N は [N-1, N, N+1] だけ引く。
        // diff[0/1/2] は [level-1, level, level+1] への相対比率。
        // 端ステージ (level=1 or 10) では存在しない難度の比率を mid に吸収。
        const level  = stageCfg?.level ?? stageNo;
        const dLow   = Math.max(1,  level - 1);
        const dMid   = level;
        const dHigh  = Math.min(10, level + 1);

        // 前回出題済み ID を除外して被り抑止。
        // プール不足 (seen除外後 < count×2) の場合は seen を無視してフルプールから引く。
        const seenIds = new Set(window.Save?.getSeenQuestions(stageNo) || []);

        const eligible = all.filter(q => {
            const d = q.difficulty || 1;
            return d >= dLow && d <= dHigh;
        });

        // seen除外後のプールが十分あれば seen を適用。なければ全量使う (小プール救済)。
        const eligibleFiltered = eligible.filter(q => !seenIds.has(q.id));
        const useFiltered = eligibleFiltered.length >= count * 2;
        const activeEligible = useFiltered ? eligibleFiltered : eligible;

        // 端ステージで dLow==dMid or dMid==dHigh になる場合は比率を吸収
        const ratioMap = { [dLow]: 0, [dMid]: 0, [dHigh]: 0 };
        ratioMap[dLow]  += diff[0];
        ratioMap[dMid]  += diff[1];
        ratioMap[dHigh] += diff[2];
        const tiers = [...new Set([dLow, dMid, dHigh])];  // 重複除去

        // 各難度の目標問題数 (端数丸め、最後の tier で帳尻)
        const wantMap = {};
        let assigned = 0;
        tiers.slice(0, -1).forEach(d => {
            wantMap[d] = Math.round(count * ratioMap[d]);
            assigned += wantMap[d];
        });
        wantMap[tiers[tiers.length - 1]] = Math.max(0, count - assigned);

        // 難度別プール (シャッフル済み)
        const pools = {};
        tiers.forEach(d => { pools[d] = []; });
        activeEligible.forEach(q => {
            const d = q.difficulty;
            if (pools[d] !== undefined) pools[d].push(q);
        });
        tiers.forEach(d => { pools[d] = shuffle(pools[d]); });

        // 第1パス: 各難度から want 件取る
        const picked = [];
        const usedIds = new Set();
        tiers.forEach(d => {
            const take = pools[d].splice(0, wantMap[d]);
            take.forEach(q => { picked.push(q); usedIds.add(q.id); });
        });

        // 第2パス: 不足があれば他難度から補填
        if (picked.length < count) {
            const rest = shuffle(
                tiers.flatMap(d => pools[d]).filter(q => !usedIds.has(q.id))
            );
            picked.push(...rest.slice(0, count - picked.length));
        }

        // 出題順もシャッフル (難度順で並ばないように)
        // 加えて各 choice 問題の選択肢位置もシャッフル (丸暗記対策)
        const result = shuffle(picked).map(shuffleChoices);

        // 今回出題した ID を seen バッファに積む (次回同ステージの被り防止)
        if (window.Save) {
            window.Save.addSeenQuestions(stageNo, result.map(q => q.id));
        }

        return result;
    }

    window.QuizLoader = {
        loadAll,
        pickForStage,
    };
})();
