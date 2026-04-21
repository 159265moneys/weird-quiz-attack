/* ============================================================
   scoring.js — スコア計算 & ランク判定
   ------------------------------------------------------------
   設計: 1問あたり
     正答ベース: 1000点 (不正解なら 0点)
     時間ボーナス: max(0, 残り時間) / 制限時間 * 1000 点
     → 1問最大 2000 点 / 20問で最大 40,000 点
   ランク (6段階): D < C < B < A < S < SS
     SS: [暫定] 全問正解 AND 1問平均 <= 15秒
     S : 正答率 >= 0.95
     A : 正答率 >= 0.85
     B : 正答率 >= 0.70
     C : 正答率 >= 0.50
     D : それ未満

   TODO(Phase 6+): SS判定はステージごとに閾値を厳格化する。
     例: Stage 1 なら平均8秒以内、Stage 10 なら全問正解+速度+ノーペナルティ等。
     現状は全ステージ共通の暫定ルール。
   ============================================================ */

(function () {
    const Q_TIME_LIMIT_MS = 60 * 1000; // 1問あたり60秒
    const BASE_POINT = 1000;
    const TIME_BONUS_MAX = 1000;
    // TODO(Phase 6+): ステージごとの SS閾値 (CONFIG.STAGES[n].ssAvgSec) に置き換え
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
        if (accuracy >= 1.0 && avgTimeSec <= SS_AVG_TIME_SEC && total > 0) {
            rank = 'SS';
        } else if (accuracy >= 0.95) {
            rank = 'S';
        } else if (accuracy >= 0.85) {
            rank = 'A';
        } else if (accuracy >= 0.70) {
            rank = 'B';
        } else if (accuracy >= 0.50) {
            rank = 'C';
        } else {
            rank = 'D';
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
