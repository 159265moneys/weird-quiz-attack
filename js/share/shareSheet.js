/* ============================================================
   share/shareSheet.js — Web Share API でシェア、駄目なら保存フォールバック
   ------------------------------------------------------------
   優先順位:
     1. navigator.share({ files: [...] })           ← 画像添付シェア (iOS/Android新)
     2. navigator.share({ text, url })              ← テキストのみ (古い iOS 等)
     3. 画像DL + テキストをクリップボードに           ← PC ブラウザ等
   ============================================================ */

(function () {
    function canShareFiles(file) {
        return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    }
    function canShareText() {
        return !!navigator.share;
    }

    async function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function writeClipboard(text) {
        try {
            await navigator.clipboard?.writeText(text);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * シェア処理。blob は PNG、text はキャプション、filename はファイル名。
     * 成功したら { method: 'share-file' | 'share-text' | 'download' } を返す。
     */
    async function share({ blob, text, filename = 'result.png' }) {
        // 1. ファイル添付シェア
        if (blob && navigator.share && navigator.canShare) {
            const file = new File([blob], filename, { type: 'image/png' });
            if (canShareFiles(file)) {
                try {
                    await navigator.share({
                        files: [file],
                        text,
                        title: 'WEIRD QUIZ ATTACK',
                    });
                    return { method: 'share-file' };
                } catch (e) {
                    if (e.name === 'AbortError') return { method: 'cancel' };
                    console.warn('[Share] file share failed, trying text-only:', e);
                }
            }
        }

        // 2. テキストのみシェア
        if (canShareText()) {
            try {
                await navigator.share({
                    text,
                    title: 'WEIRD QUIZ ATTACK',
                });
                // ついでに画像をダウンロードもさせる (テキストだけじゃ絵がない)
                if (blob) await downloadBlob(blob, filename);
                return { method: 'share-text+download' };
            } catch (e) {
                if (e.name === 'AbortError') return { method: 'cancel' };
                console.warn('[Share] text share failed, falling back to download:', e);
            }
        }

        // 3. ダウンロード + クリップボード
        if (blob) await downloadBlob(blob, filename);
        const clipped = await writeClipboard(text);
        return { method: clipped ? 'download+clipboard' : 'download' };
    }

    window.ShareSheet = { share };
})();
