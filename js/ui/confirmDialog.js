/* ============================================================
   ui/confirmDialog.js — ゲーム UI に揃えた汎用 確認ダイアログ
   ------------------------------------------------------------
   OS 標準の confirm() を置き換える。nav-bubble / box-3d と揃えた
   ダーク + シアン/レッド アクセントのモーダル。

   使い方:
     const ok = await window.ConfirmDialog.show({
         title: '全データを削除',
         message: 'アイコン / 名前 / 進捗 / ベストスコア / 設定を\n
                  すべて削除し、初回インストール状態に戻します。',
         okText: '削除する',
         cancelText: 'キャンセル',
         danger: true,         // 赤アクセント + OK ボタン右側の慣習
     });
     if (!ok) return;

   show() は Promise<boolean> を返す。
   overlay を document.body に position:fixed でマウント (viewport 座標)。
   多重 show 呼び出しは先着優先 (後発は直ちに false を返して無視)。
   ============================================================ */

(function () {
    let isOpen = false;

    function mount(opts) {
        const {
            title = '確認',
            message = '',
            okText = 'OK',
            cancelText = 'キャンセル',
            danger = false,
        } = opts || {};

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay' + (danger ? ' is-danger' : '');
        overlay.innerHTML = `
            <div class="confirm-backdrop"></div>
            <div class="confirm-panel" role="dialog" aria-modal="true">
                <div class="confirm-title">${escapeHTML(title)}</div>
                <div class="confirm-message">${escapeHTML(message).replace(/\n/g, '<br>')}</div>
                <div class="confirm-actions">
                    <button type="button" class="confirm-btn confirm-cancel">${escapeHTML(cancelText)}</button>
                    <button type="button" class="confirm-btn confirm-ok${danger ? ' is-danger' : ''}">${escapeHTML(okText)}</button>
                </div>
            </div>
        `;
        return overlay;
    }

    function escapeHTML(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function show(opts) {
        if (isOpen) return Promise.resolve(false);
        isOpen = true;

        return new Promise((resolve) => {
            const overlay = mount(opts || {});
            document.body.appendChild(overlay);
            // 次フレームで is-open を付けてフェードイン
            requestAnimationFrame(() => overlay.classList.add('is-open'));

            const cleanup = (ok) => {
                isOpen = false;
                overlay.classList.remove('is-open');
                // アニメ後に DOM から外す
                setTimeout(() => overlay.remove(), 220);
                resolve(!!ok);
            };

            overlay.querySelector('.confirm-ok').addEventListener('click', () => {
                window.SE?.fire?.('confirm');
                cleanup(true);
            });
            overlay.querySelector('.confirm-cancel').addEventListener('click', () => {
                window.SE?.fire?.('cancel');
                cleanup(false);
            });
            // backdrop タップでキャンセル
            overlay.querySelector('.confirm-backdrop').addEventListener('click', () => {
                window.SE?.fire?.('cancel');
                cleanup(false);
            });
            // Esc でキャンセル
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    cleanup(false);
                }
            };
            document.addEventListener('keydown', onKey);
        });
    }

    // ちょっとだけ便利: 文字列だけ渡してデフォルトタイトルで出すショートカット
    function ask(message, opts) {
        return show(Object.assign({ title: '確認', message }, opts || {}));
    }

    window.ConfirmDialog = { show, ask };
})();
