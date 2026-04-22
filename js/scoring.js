/* ============================================================
   scoring.js — スコア計算 & ランク判定
   ------------------------------------------------------------
   設計: 1問あたり
     正答ベース: 1000点 (不正解なら 0点)
     時間ボーナス: max(0, 残り時間) / 制限時間 * 1000 点
     → 1問最大 2000 点 / 20問で最大 40,000 点
   ランク (8段階, 仕様書 8-2 準拠):
     SS: 全問正解 AND 平均 <= 15秒   上位 0.01% (神)
     S : 正答率 >= 0.95              上位 1%
     A : 正答率 >= 0.85              上位 3%
     B : 正答率 >= 0.70              上位 10%
     C : 正答率 >= 0.50              下位 30%
     D : 正答率 >= 0.30              下位 60%
     E : 正答率 >= 0.10              下位 90%
     F : それ未満 / 即死(B21)終了     下位 99%+

   B21 で即死終了したセッションは session.deathEnd = true。
   deathEnd が立っている場合、正答率に関係なく強制 F。
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = 60 * 1000; // 1問あたり60秒
    const BASE_POINT = 1000;
    const TIME_BONUS_MAX = 1000;
    const SS_AVG_TIME_SEC = 15;

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
            // B21 即死終了は強制 F。演出・ネタ枠。
            rank = 'F';
        } else if (accuracy >= 1.0 && avgTimeSec <= SS_AVG_TIME_SEC && total > 0) {
            rank = 'SS';
        } else if (accuracy >= 0.95) {
            rank = 'S';
        } else if (accuracy >= 0.85) {
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
