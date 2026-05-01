/* ============================================================
   scoring.js — スコア計算 & ランク判定
   ------------------------------------------------------------
   スコア計算 (1問あたり)
     正答ベース: 1000点 (不正解なら 0点)
     時間ボーナス: max(0, 残り時間) / 制限時間 * 1000 点
     → 1問最大 2000 点 / 20問で最大 40,000 点

   ランク判定 (2026-05 改訂 v3):
     SS: 0 ミス AND 合計時間 <= ステージ別閾値 (60〜120 秒)
     S : 0 ミス (時間不問)
     A : 1 ミス (時間不問)
     B : 2 ミス以上 AND 正答率 >= 70% (= 2〜6 ミス相当)
     C : 正答率 >= 50%
     D : 正答率 >= 30%
     E : 正答率 >= 10%
     F : それ未満 / 即死 (B21/G1) 終了

   SS 閾値はステージごとに段階的に緩くなる:
     S1=60, S2=70, S3=75, S4=80, S5=90,
     S6=95, S7=100, S8=105, S9=110, S10=120 (秒)

   B21/G1 即死で session.deathEnd = true → 強制 F。
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = 60 * 1000; // 1問あたり60秒
    const BASE_POINT = 1000;
    const TIME_BONUS_MAX = 1000;

    // SS 取得に必要な合計時間 (秒)。配列の index = stageNo - 1。
    const SS_TIME_BY_STAGE = [60, 70, 75, 80, 90, 95, 100, 105, 110, 120];
    // フォールバック: stageNo 不明なら最も寛容な Stage 10 の閾値を使う。
    const SS_TIME_FALLBACK_SEC = SS_TIME_BY_STAGE[SS_TIME_BY_STAGE.length - 1];

    function ssThresholdSecFor(stageNo) {
        const n = Number(stageNo);
        if (!Number.isFinite(n)) return SS_TIME_FALLBACK_SEC;
        const idx = Math.min(SS_TIME_BY_STAGE.length, Math.max(1, Math.round(n))) - 1;
        return SS_TIME_BY_STAGE[idx];
    }

    function computeQuestionScore(answer) {
        if (!answer || !answer.correct) return { base: 0, timeBonus: 0, total: 0 };
        const t = Math.min(Q_TIME_LIMIT_MS, Math.max(0, answer.timeMs || 0));
        const remaining = Q_TIME_LIMIT_MS - t;
        const timeBonus = Math.round((remaining / Q_TIME_LIMIT_MS) * TIME_BONUS_MAX);
        return { base: BASE_POINT, timeBonus, total: BASE_POINT + timeBonus };
    }

    function compute(session, stageNo) {
        const total = session.questions.length;
        const answered = session.answers.length;
        const correct = session.answers.filter(a => a.correct).length;
        const missed = total - correct;
        const accuracy = total > 0 ? correct / total : 0;

        let score = 0;
        let totalTimeMs = 0;
        for (const a of session.answers) {
            totalTimeMs += Math.min(Q_TIME_LIMIT_MS, a.timeMs || 0);
            const s = computeQuestionScore(a);
            score += s.total;
        }

        const avgTimeSec = answered > 0 ? (totalTimeMs / answered) / 1000 : 0;
        const totalTimeSec = totalTimeMs / 1000;

        // stageNo 未指定時は GameState から拾う (compute(session) 旧シグネチャの互換)
        const _stage = (stageNo != null)
            ? stageNo
            : (typeof window !== 'undefined' && window.GameState ? window.GameState.currentStage : null);
        const ssThresholdSec = ssThresholdSecFor(_stage);

        let rank;
        if (session.deathEnd) {
            // B21/G1 即死終了は強制 F
            rank = 'F';
        } else if (total > 0 && missed === 0 && totalTimeSec <= ssThresholdSec) {
            rank = 'SS';
        } else if (total > 0 && missed === 0) {
            rank = 'S';
        } else if (total > 0 && missed === 1) {
            rank = 'A';
        } else if (accuracy >= 0.70) {
            rank = 'B';
        } else if (accuracy >= 0.50) {
            rank = 'C';
        } else if (accuracy >= 0.30) {
            rank = 'D';
        } else if (accuracy >= 0.10) {
            rank = 'E';
        } else {
            rank = 'F';
        }

        return { score, correct, total, accuracy, avgTimeSec, totalTimeSec, rank, ssThresholdSec };
    }

    window.Scoring = {
        Q_TIME_LIMIT_MS,
        BASE_POINT,
        TIME_BONUS_MAX,
        SS_TIME_BY_STAGE,
        ssThresholdSecFor,
        computeQuestionScore,
        compute,
    };
})();
