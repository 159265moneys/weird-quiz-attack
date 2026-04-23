/* ============================================================
   scoring.js — スコア計算 & ランク判定
   ------------------------------------------------------------
   スコア計算 (1問あたり)
     正答ベース: 1000点 (不正解なら 0点)
     時間ボーナス: max(0, 残り時間) / 制限時間 * 1000 点
     → 1問最大 2000 点 / 20問で最大 40,000 点

   ランク判定 (2026-04 改訂):
     SS: 全問正解 AND 合計 <= 2:30 (150s) — 鬼仕様・激レア
     S : 全問正解 AND 合計 <= 3:30 (210s)
     A : 正答率 >= 95% (≤1ミス) AND 合計 <= 4:00 (240s)
     B : 正答率 >= 70%                (時間不問)
     C : 正答率 >= 50%
     D : 正答率 >= 30%
     E : 正答率 >= 10%
     F : それ未満 / 即死(B21/G1)終了

   注意: "100% 正解でも遅いと B 落ち" は意図通りの鬼仕様。
   B21/G1 即死で session.deathEnd = true → 強制 F。
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = 60 * 1000; // 1問あたり60秒
    const BASE_POINT = 1000;
    const TIME_BONUS_MAX = 1000;
    // 合計時間制限 (20問 total)
    const SS_TOTAL_TIME_SEC = 150;  // 2:30
    const S_TOTAL_TIME_SEC  = 210;  // 3:30
    const A_TOTAL_TIME_SEC  = 240;  // 4:00

    function computeQuestionScore(answer) {
        if (!answer || !answer.correct) return { base: 0, timeBonus: 0, total: 0 };
        const t = Math.min(Q_TIME_LIMIT_MS, Math.max(0, answer.timeMs || 0));
        const remaining = Q_TIME_LIMIT_MS - t;
        const timeBonus = Math.round((remaining / Q_TIME_LIMIT_MS) * TIME_BONUS_MAX);
        return { base: BASE_POINT, timeBonus, total: BASE_POINT + timeBonus };
    }

    function compute(session) {
        const total = session.questions.length;
        const answered = session.answers.length;
        const correct = session.answers.filter(a => a.correct).length;
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

        let rank;
        if (session.deathEnd) {
            // B21/G1 即死終了は強制 F
            rank = 'F';
        } else if (total > 0 && accuracy >= 1.0 && totalTimeSec <= SS_TOTAL_TIME_SEC) {
            rank = 'SS';
        } else if (total > 0 && accuracy >= 1.0 && totalTimeSec <= S_TOTAL_TIME_SEC) {
            rank = 'S';
        } else if (accuracy >= 0.95 && totalTimeSec <= A_TOTAL_TIME_SEC) {
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

        return { score, correct, total, accuracy, avgTimeSec, totalTimeSec, rank };
    }

    window.Scoring = {
        Q_TIME_LIMIT_MS,
        BASE_POINT,
        TIME_BONUS_MAX,
        computeQuestionScore,
        compute,
    };
})();
