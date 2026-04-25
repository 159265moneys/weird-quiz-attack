/* ============================================================
   keyboard/keyboard.js — 内製文字盤本体
   ------------------------------------------------------------
   使用例:
     Keyboard.mount('#keyboardHost', {
         mode: 'hiragana',        // 初期モード
         onChange: (value) => {}, // 入力欄更新コールバック
         onSubmit: (value) => {}, // OK押下時
         maxLength: 16,
     });
     Keyboard.unmount();
   ============================================================ */

(function () {
    const L = window.KeyboardLayouts;

    // フリック判定しきい値 (client pixel)
    const FLICK_THRESHOLD = 18;

    // ガラケー風 連打 (multi-tap) のタイムアウト。
    //   同じキーを連続タップすると c→l→u→r→d の順でサイクルし、最後に
    //   タップしてからこの ms 経過すると次回タップは新規入力扱いになる。
    //   1.0s だとタイピングが速い人で誤判定するため少し緩めに。
    const MULTITAP_TIMEOUT_MS = 1200;

    // 状態
    let host = null;
    let opts = null;
    let buffer = '';
    let mode = 'hiragana';     // 'hiragana' | 'katakana' | 'alpha' | 'number'
    let alphaCaps = false;     // ABC モード時の大文字フラグ

    // ドラッグ/フリック中の状態
    let dragging = null; // { x, y, keyEl, key, direction }

    // 連打 (multi-tap) 状態。
    //   keyC:    識別キー (= key.c)。違うキーをタップしたらリセット。
    //   cycle:   サイクル文字列 (raw、ひらがな or 英小文字)。adjustOutput で変換して挿入。
    //   idx:     現在のサイクル位置 (0-based)。
    //   timer:   タイムアウト ID。新タップで refresh される。
    let multitap = null;

    // ギミック用フック: フリック方向変換 (fn(dir)=>dir'). null で無効。
    let flickTransform = null;

    // 「モード切替/CAPS キー」を完全ロックするフラグ。
    //   問題文に「ひらがなで」「カタカナで」等の指定がある時に true にして、
    //   ABC / 123 / あ / 大小切替を無効化 (グレーアウト + クリック黙殺)。
    //   suggestMode で決まった初期モードに固定したいケース用。
    let lockModeKeys = false;

    // render() 後 (モード切替でも呼ばれる) に実行されるコールバック。
    // ギミック側で文字盤 DOM をいじるものはここに再適用処理を登録することで、
    // ABC ↔ あいう切替でもギミックが継続する。
    const postRenderHooks = [];

    // ---------------------------------------------------------
    // Public API
    // ---------------------------------------------------------
    const Keyboard = {
        mount(selector, options) {
            const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
            if (!el) { console.error('Keyboard: host not found', selector); return; }
            host = el;
            opts = Object.assign({
                mode: 'hiragana',
                onChange: () => {},
                onSubmit: () => {},
                maxLength: 24,
                initialValue: '',
                // 「ひらがなで」「カタカナで」等の問題で、勝手にモード切替されるのを
                // 防ぎたい場合に true。ABC/123/あ/大小切替の fn キーが no-op になる。
                lockModeKeys: false,
            }, options || {});
            buffer = opts.initialValue || '';
            mode = opts.mode;
            alphaCaps = false;
            lockModeKeys = !!opts.lockModeKeys;
            clearMultitap();
            render();
            emitChange();
        },

        unmount() {
            cleanupDragging();
            clearMultitap();
            if (host) host.innerHTML = '';
            host = null;
            opts = null;
            buffer = '';
            lockModeKeys = false;
            flickTransform = null;   // ギミック状態のリセット
            postRenderHooks.length = 0;
        },

        getValue() { return buffer; },
        setValue(s) { buffer = s || ''; clearMultitap(); emitChange(); renderBufferOnly(); },
        clear() { buffer = ''; clearMultitap(); emitChange(); renderBufferOnly(); },
        setMode(m) { mode = m; clearMultitap(); render(); },
        getMode() { return mode; },

        // --- ギミック用フック (Phase 5b Batch4〜) ---
        getOnChange() { return opts?.onChange; },
        setOnChange(fn) { if (opts) opts.onChange = fn || (() => {}); },
        getOnSubmit() { return opts?.onSubmit; },
        setOnSubmit(fn) { if (opts) opts.onSubmit = fn || (() => {}); },
        setFlickTransform(fn) { flickTransform = typeof fn === 'function' ? fn : null; },
        // render() 終了直後 (=モード切替直後) に fn() を呼ぶ。戻り値で登録解除。
        addPostRender(fn) {
            if (typeof fn !== 'function') return () => {};
            postRenderHooks.push(fn);
            return () => {
                const i = postRenderHooks.indexOf(fn);
                if (i >= 0) postRenderHooks.splice(i, 1);
            };
        },
        // フリック/タップ中かどうか。ギミック側で「タップ中はシャッフルしない」判定に使う
        isDragging() { return !!dragging; },
    };

    // ---------------------------------------------------------
    // レンダリング
    // ---------------------------------------------------------
    function currentLayout() {
        if (mode === 'alpha') return L.ALPHA;
        if (mode === 'number') return L.NUMBER;
        return L.HIRAGANA; // hiragana/katakana 共用
    }

    function keyDisplayChar(key) {
        if (key.fn === 'caps') return alphaCaps ? 'A' : 'a';
        if (key.fn) return key.label || '';
        if (mode === 'katakana' && key.c) return L.hiraToKata(key.c);
        if (mode === 'alpha') {
            // iPhone 風ラベル: 1キーに割り当てられた全文字を並べて表示する
            // (a/b/c → "ABC", @/#/// → "@#/&_" 等)
            // 手動上書きがあれば優先 (key.display)
            if (key.display) return key.display;
            if (key.c) {
                // 英字キーは常に大文字で表示 (iPhone の ABC 表示に合わせる)
                const isLetter = /[a-z]/i.test(key.c);
                const chars = [key.c, key.l, key.u, key.r, key.d].filter(Boolean);
                if (isLetter) {
                    // アルファベット順でソートして表示
                    return chars.slice().sort().join('').toUpperCase();
                }
                // 記号キー: c → l → u → r → d 順で並べる
                return chars.join('');
            }
        }
        return key.c || '';
    }

    function render() {
        if (!host) return;
        const layout = currentLayout();
        const modeLabel = ({
            hiragana: 'あいう',
            katakana: 'アイウ',
            alpha: 'ABC',
            number: '123',
        })[mode] || '';

        const rows = layout.map((row) => {
            return `<div class="kb-row">${row.map(keyHTML).join('')}</div>`;
        }).join('');

        host.innerHTML = `
            <div class="kb-wrap">
                <div class="kb-modeline">
                    <span class="kb-modelabel">MODE: ${modeLabel}</span>
                    ${mode === 'alpha' ? `<span class="kb-caps">${alphaCaps ? 'CAPS' : 'lower'}</span>` : ''}
                </div>
                <div class="kb-grid">
                    ${rows}
                </div>
                <div class="kb-preview" id="kbPreview" aria-hidden="true"></div>
            </div>
        `;

        attachHandlers();

        // ギミック側で文字盤 DOM に適用した変更 (W02/W08 等) を再適用
        for (let i = 0; i < postRenderHooks.length; i++) {
            try { postRenderHooks[i](); } catch (e) { console.error('[Keyboard] postRender hook failed', e); }
        }
    }

    function renderBufferOnly() {
        emitChange();
    }

    // モードロック中に無効化対象とする fn キー一覧。
    //   ABC/123/あ への切替 + 英字大小切替 (caps) を全て止める。
    //   他の fn (bs / space / ok / dakuten) は通常通り使える。
    const LOCKED_FN_KEYS = new Set(['mode-hira', 'mode-alpha', 'mode-num', 'caps']);

    function isFnLocked(fn) {
        return lockModeKeys && LOCKED_FN_KEYS.has(fn);
    }

    function keyHTML(key) {
        if (!key || (!key.c && !key.fn)) {
            return `<div class="kb-key kb-empty"></div>`;
        }
        const cls = ['kb-key'];
        if (key.fn) cls.push('kb-fn', 'kb-fn-' + key.fn);
        if (key.fn && isFnLocked(key.fn)) cls.push('is-locked');
        const display = keyDisplayChar(key);
        // 複数文字ラベル (iPhone風 "ABC" 等) は font を小さめに
        if (!key.fn && display.length >= 2) cls.push('kb-main-group');
        // サブ文字 (フリック方向の表示)
        let subs = '';
        if (!key.fn) {
            const u = dirChar(key, 'u');
            const l = dirChar(key, 'l');
            const r = dirChar(key, 'r');
            const d = dirChar(key, 'd');
            subs = `
                <span class="kb-sub kb-sub-u">${u}</span>
                <span class="kb-sub kb-sub-l">${l}</span>
                <span class="kb-sub kb-sub-r">${r}</span>
                <span class="kb-sub kb-sub-d">${d}</span>
            `;
        }
        return `
            <button type="button" class="${cls.join(' ')}"
                    data-key='${JSON.stringify(key).replace(/'/g, '&#39;')}'>
                <span class="kb-main">${display}</span>
                ${subs}
            </button>
        `;
    }

    function dirChar(key, dir) {
        const ch = key[dir];
        if (!ch) return '';
        if (mode === 'katakana') return L.hiraToKata(ch);
        if (mode === 'alpha' && alphaCaps && /[a-z]/.test(ch)) return ch.toUpperCase();
        return ch;
    }

    // ---------------------------------------------------------
    // イベント
    // ---------------------------------------------------------
    function attachHandlers() {
        host.querySelectorAll('.kb-key').forEach((el) => {
            el.addEventListener('pointerdown', onPointerDown);
            el.addEventListener('contextmenu', (e) => e.preventDefault());
        });
    }

    function cleanupDragging() {
        // 見た目の残骸を全部消す
        if (dragging && dragging.keyEl) {
            dragging.keyEl.classList.remove('is-pressed');
        }
        hidePreview();
        dragging = null;
    }

    function onPointerDown(e) {
        e.preventDefault();

        // 既にドラッグ中なら前のセッションを強制クリーンアップ
        // (iOS で pointerup を取りこぼすと preview が残る問題の保険)
        if (dragging) cleanupDragging();

        const el = e.currentTarget;
        const keyStr = el.dataset.key;
        if (!keyStr) return;
        const key = JSON.parse(keyStr.replace(/&#39;/g, "'"));
        el.classList.add('is-pressed');

        dragging = {
            x: e.clientX,
            y: e.clientY,
            keyEl: el,
            key,
            direction: 'c',
            pointerId: e.pointerId,
        };
        showPreview(el, key, 'c');

        // 移動/終了系は window に付ける (指が別のキーに飛んでも追える)
        const onMove = (ev) => {
            if (!dragging || dragging.pointerId !== ev.pointerId) return;
            const dx = ev.clientX - dragging.x;
            const dy = ev.clientY - dragging.y;
            dragging.direction = computeDirection(dx, dy);
            showPreview(el, key, dragging.direction);
        };
        const onEnd = (ev) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);

            const match = dragging && dragging.pointerId === ev.pointerId;
            const dir = match ? dragging.direction : 'c';
            cleanupDragging();   // pointerId不一致でも必ず掃除
            if (match) handleKey(key, dir);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
    }

    function computeDirection(dx, dy) {
        const dist = Math.hypot(dx, dy);
        if (dist < FLICK_THRESHOLD) return 'c';
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'r' : 'l';
        return dy > 0 ? 'd' : 'u';
    }

    // ---------------------------------------------------------
    // キー処理
    // ---------------------------------------------------------
    function handleKey(key, dir) {
        if (key.fn) {
            // モード切替/CAPS のロック中は黙殺 (cancel SE で「無効」を伝える)
            if (isFnLocked(key.fn)) {
                window.SE?.fire('cancel');
                return;
            }
            return handleFn(key.fn);
        }
        // ギミックによるフリック方向変換 (W19: 上下左右反転など)
        if (flickTransform) {
            try { dir = flickTransform(dir) || dir; } catch (e) { /* ignore */ }
        }

        // --- 連打 (multi-tap) ---
        // dir==='c' (フリックなしの素タップ) のみ対象。フリック入力は素直に方向の文字。
        if (dir === 'c') {
            handleCenterTap(key);
            return;
        }

        // フリック確定時は連打サイクルをリセットして方向文字を type
        clearMultitap();
        let char =
            dir === 'u' ? (key.u || '') :
            dir === 'd' ? (key.d || '') :
            dir === 'l' ? (key.l || '') :
            dir === 'r' ? (key.r || '') : '';
        if (!char) return;
        char = adjustOutput(char);
        type(char);
    }

    // 中央タップ (dir === 'c')。連打サイクルを管理する。
    //   ・同じキーを連続でタップ → 直前に挿入した文字をサイクル次の文字に置換
    //   ・違うキー or タイムアウト経過 → 新規入力 (key.c を 1 文字 type)
    //   ・サイクル順は c → l → u → r → d (= ガラケー順「あ→い→う→え→お」)
    function handleCenterTap(key) {
        const cycle = buildTapCycle(key);

        // サイクルが 1 文字以下のキー (= 数字, ピリオド等) は連打しても意味が無い。
        // 普通に新規 type。
        if (cycle.length <= 1) {
            clearMultitap();
            const ch = adjustOutput(key.c || '');
            if (!ch) return;
            type(ch);
            return;
        }

        const sameKey = !!multitap && multitap.keyC === key.c;
        if (sameKey) {
            // サイクル進行: 直前に置いた文字を次のサイクル文字で置換
            multitap.idx = (multitap.idx + 1) % multitap.cycle.length;
            const next = adjustOutput(multitap.cycle[multitap.idx]);
            const arr = Array.from(buffer);
            if (arr.length === 0) {
                // 何らかの事情で buffer が空 (BS で消されたなど) → 新規 type に倒す
                clearMultitap();
                type(next);
                return;
            }
            arr[arr.length - 1] = next;
            buffer = arr.join('');
            window.SE?.fire('keyTap');
            emitChange();
            refreshMultitapTimeout();
            return;
        }

        // 別キー or タイムアウト後の素タップ: 新規入力 + サイクル開始
        clearMultitap();
        const first = adjustOutput(cycle[0]);
        if (!first) return;
        type(first);
        multitap = { keyC: key.c, cycle, idx: 0, timer: null };
        refreshMultitapTimeout();
    }

    // タップサイクル列を作る。順序: c, l, u, r, d (= 「あいうえお」順)。
    //   存在しない方向はスキップする (例: 数字キー [c のみ] → ['1'])。
    function buildTapCycle(key) {
        const order = ['c', 'l', 'u', 'r', 'd'];
        const out = [];
        for (const k of order) {
            const ch = key[k];
            if (ch && !out.includes(ch)) out.push(ch);
        }
        return out;
    }

    function clearMultitap() {
        if (multitap?.timer) clearTimeout(multitap.timer);
        multitap = null;
    }

    function refreshMultitapTimeout() {
        if (!multitap) return;
        if (multitap.timer) clearTimeout(multitap.timer);
        multitap.timer = setTimeout(() => { multitap = null; }, MULTITAP_TIMEOUT_MS);
    }

    function adjustOutput(ch) {
        if (mode === 'katakana' && /[\u3041-\u3096]/.test(ch)) return L.hiraToKata(ch);
        if (mode === 'alpha' && alphaCaps && /[a-z]/.test(ch)) return ch.toUpperCase();
        return ch;
    }

    function handleFn(fn) {
        // どの fn キーであっても、連打サイクルは中断する (= 次回中央タップは新規入力)
        clearMultitap();
        switch (fn) {
            case 'bs': window.SE?.fire('keyBs'); backspace(); return;
            case 'space': type(' '); return;  // type() 側で keyTap 発火
            case 'ok': window.SE?.fire('keyOk'); if (opts?.onSubmit) opts.onSubmit(buffer); return;
            case 'dakuten': window.SE?.fire('keyTap'); dakutenCycle(); return;
            case 'caps': window.SE?.fire('menuCursor'); alphaCaps = !alphaCaps; render(); return;
            case 'mode-hira': window.SE?.fire('menuCursor'); mode = 'hiragana'; render(); return;
            case 'mode-alpha': window.SE?.fire('menuCursor'); mode = 'alpha'; render(); return;
            case 'mode-num': window.SE?.fire('menuCursor'); mode = 'number'; render(); return;
        }
    }

    function type(ch) {
        if (buffer.length >= (opts?.maxLength ?? 24)) return;
        buffer += ch;
        window.SE?.fire('keyTap');
        emitChange();
    }

    function backspace() {
        if (buffer.length === 0) return;
        // サロゲートペア対応の末尾1文字削除
        const arr = Array.from(buffer);
        arr.pop();
        buffer = arr.join('');
        emitChange();
    }

    function dakutenCycle() {
        if (buffer.length === 0) return;
        const arr = Array.from(buffer);
        const last = arr[arr.length - 1];
        const next = L.cycleNext(last);
        if (!next) return;
        arr[arr.length - 1] = next;
        buffer = arr.join('');
        emitChange();
    }

    function emitChange() {
        if (opts?.onChange) opts.onChange(buffer);
    }

    // ---------------------------------------------------------
    // フリックプレビュー
    // ---------------------------------------------------------
    function showPreview(keyEl, key, dir) {
        if (key.fn) return;
        const preview = document.getElementById('kbPreview');
        if (!preview) return;
        const rect = keyEl.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const x = rect.left - hostRect.left + rect.width / 2;
        const y = rect.top - hostRect.top + rect.height / 2;

        preview.innerHTML = `
            <div class="kb-pv kb-pv-c ${dir === 'c' ? 'is-active' : ''}">${keyDisplayChar(key)}</div>
            <div class="kb-pv kb-pv-u ${dir === 'u' ? 'is-active' : ''}">${dirChar(key, 'u')}</div>
            <div class="kb-pv kb-pv-l ${dir === 'l' ? 'is-active' : ''}">${dirChar(key, 'l')}</div>
            <div class="kb-pv kb-pv-r ${dir === 'r' ? 'is-active' : ''}">${dirChar(key, 'r')}</div>
            <div class="kb-pv kb-pv-d ${dir === 'd' ? 'is-active' : ''}">${dirChar(key, 'd')}</div>
        `;
        preview.style.left = x + 'px';
        preview.style.top = y + 'px';
        preview.style.display = 'block';
    }

    function hidePreview() {
        const preview = document.getElementById('kbPreview');
        if (preview) {
            preview.style.display = 'none';
            preview.innerHTML = '';
        }
    }

    window.Keyboard = Keyboard;
})();
