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

    // 状態
    let host = null;
    let opts = null;
    let buffer = '';
    let mode = 'hiragana';     // 'hiragana' | 'katakana' | 'alpha' | 'number'
    let alphaCaps = false;     // ABC モード時の大文字フラグ

    // ドラッグ/フリック中の状態
    let dragging = null; // { x, y, keyEl, key, direction }

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
            }, options || {});
            buffer = opts.initialValue || '';
            mode = opts.mode;
            alphaCaps = false;
            render();
            emitChange();
        },

        unmount() {
            if (host) host.innerHTML = '';
            host = null;
            opts = null;
            buffer = '';
            dragging = null;
        },

        getValue() { return buffer; },
        setValue(s) { buffer = s || ''; emitChange(); renderBufferOnly(); },
        clear() { buffer = ''; emitChange(); renderBufferOnly(); },
        setMode(m) { mode = m; render(); },
        getMode() { return mode; },
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
        if (key.fn) return key.label || '';
        if (mode === 'katakana' && key.c) return L.hiraToKata(key.c);
        if (mode === 'alpha' && alphaCaps && key.c && /[a-z]/.test(key.c)) return key.c.toUpperCase();
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
    }

    function renderBufferOnly() {
        emitChange();
    }

    function keyHTML(key) {
        if (!key || (!key.c && !key.fn)) {
            return `<div class="kb-key kb-empty"></div>`;
        }
        const cls = ['kb-key'];
        if (key.fn) cls.push('kb-fn', 'kb-fn-' + key.fn);
        const display = keyDisplayChar(key);
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
            // フォーカスで余計な挙動を防ぐ
            el.addEventListener('contextmenu', (e) => e.preventDefault());
        });
    }

    function onPointerDown(e) {
        e.preventDefault();
        const el = e.currentTarget;
        const keyStr = el.dataset.key;
        if (!keyStr) return;
        const key = JSON.parse(keyStr.replace(/&#39;/g, "'"));
        el.setPointerCapture?.(e.pointerId);
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

        const onMove = (ev) => onPointerMove(ev, el, key);
        const onEnd = (ev) => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onEnd);
            el.removeEventListener('pointercancel', onEnd);
            onPointerUp(ev, el, key);
        };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onEnd);
        el.addEventListener('pointercancel', onEnd);
    }

    function onPointerMove(e, el, key) {
        if (!dragging || dragging.pointerId !== e.pointerId) return;
        const dx = e.clientX - dragging.x;
        const dy = e.clientY - dragging.y;
        dragging.direction = computeDirection(dx, dy);
        showPreview(el, key, dragging.direction);
    }

    function onPointerUp(e, el, key) {
        if (!dragging || dragging.pointerId !== e.pointerId) return;
        const dir = dragging.direction;
        hidePreview();
        el.classList.remove('is-pressed');
        dragging = null;

        handleKey(key, dir);
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
        if (key.fn) return handleFn(key.fn);
        // 文字キー
        let char = (dir === 'c') ? (key.c || '')
            : (dir === 'u' ? (key.u || '')
            : (dir === 'd' ? (key.d || '')
            : (dir === 'l' ? (key.l || '')
            : (dir === 'r' ? (key.r || '') : ''))));
        if (!char) return;
        char = adjustOutput(char);
        type(char);
    }

    function adjustOutput(ch) {
        if (mode === 'katakana' && /[\u3041-\u3096]/.test(ch)) return L.hiraToKata(ch);
        if (mode === 'alpha' && alphaCaps && /[a-z]/.test(ch)) return ch.toUpperCase();
        return ch;
    }

    function handleFn(fn) {
        switch (fn) {
            case 'bs': backspace(); return;
            case 'space': type(' '); return;
            case 'ok': if (opts?.onSubmit) opts.onSubmit(buffer); return;
            case 'dakuten': dakutenCycle(); return;
            case 'caps': alphaCaps = !alphaCaps; render(); return;
            case 'mode-hira': mode = 'hiragana'; render(); return;
            case 'mode-alpha': mode = 'alpha'; render(); return;
            case 'mode-num': mode = 'number'; render(); return;
        }
    }

    function type(ch) {
        if (buffer.length >= (opts?.maxLength ?? 24)) return;
        buffer += ch;
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
        if (preview) preview.style.display = 'none';
    }

    window.Keyboard = Keyboard;
})();
