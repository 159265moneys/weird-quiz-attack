/* ============================================================
   quiz/judge.js — 記述式解答の正誤判定
   ============================================================ */

(function () {
    // --- 正規化 ---
    // カタカナ → ひらがな
    function kataToHira(s) {
        return s.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    }
    // 全角英数字 → 半角
    function fullToHalf(s) {
        return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    }
    // 空白類を除去
    function stripSpaces(s) {
        return s.replace(/[\s\u3000]+/g, '');
    }

    // 幅広い正規化: 比較用の共通キー
    function normalize(s) {
        if (s == null) return '';
        let v = String(s);
        v = v.trim();
        v = fullToHalf(v);
        v = v.toLowerCase();
        v = kataToHira(v);
        v = stripSpaces(v);
        return v;
    }

    // --- 判定 ---
    // q: 問題オブジェクト (mode: 'input', answer_text, answer_variants)
    // userInput: ユーザ入力文字列
    function judge(q, userInput) {
        if (!q || q.mode !== 'input') return false;
        if (userInput == null) return false;

        const userNorm = normalize(userInput);
        if (!userNorm) return false;

        const candidates = [q.answer_text, ...(q.answer_variants || [])];
        for (const c of candidates) {
            if (c == null) continue;
            if (normalize(c) === userNorm) return true;
        }
        return false;
    }

    // 入力ヒントの自動判定 (キーボード初期モード決定に使う)
    // 'hiragana' | 'katakana' | 'alpha' | 'number'
    function suggestMode(q) {
        const a = q?.answer_text || '';
        if (/^[0-9]+(\.[0-9]+)?$/.test(a)) return 'number';
        if (/^[a-zA-Z]+$/.test(a)) return 'alpha';
        if (/^[\u3041-\u3096ー]+$/.test(a)) return 'hiragana';
        if (/^[\u30A1-\u30F6ー]+$/.test(a)) return 'katakana';
        return 'hiragana';
    }

    function hintLabel(mode) {
        return ({
            hiragana: 'ひらがなで入力',
            katakana: 'カタカナで入力',
            alpha: '英字で入力',
            number: '数字で入力',
        })[mode] || '入力';
    }

    window.Judge = {
        normalize,
        judge,
        suggestMode,
        hintLabel,
    };
})();
