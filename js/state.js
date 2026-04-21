/* ============================================================
   state.js — ランタイムで変動するゲーム状態
   セッション中にしか使わない値はここ。永続化は save.js。
   ============================================================ */

window.GameState = {
    // 現在プレイ中のステージ番号 (1-10)
    currentStage: null,

    // プレイセッションデータ
    session: {
        questions: [],      // 出題する問題(20問)の配列
        index: 0,           // 現在の問題index (0-based)
        answers: [],        // 回答履歴 [{id, correct, timeMs, userInput}]
        startAt: 0,         // セッション開始時刻 (ms)
        endAt: 0,
        score: 0,
    },

    // 画面遷移パラメータの一時置き場
    transient: {},

    resetSession() {
        this.session = {
            questions: [],
            index: 0,
            answers: [],
            startAt: 0,
            endAt: 0,
            score: 0,
        };
    },
};
