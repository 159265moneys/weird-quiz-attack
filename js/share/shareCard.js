/* ============================================================
   share/shareCard.js — リザルト画像を Canvas に直描き
   ------------------------------------------------------------
   崩壊UIの影響を受けない "クリーン版" を別Canvasで生成し、
   Blob 化してシェア可能にする。外部ライブラリ (html2canvas) 不使用。
   1080x1080 の正方形 (IG / X どちらでも縦横比を気にしなくて良い)。
   ============================================================ */

(function () {
    const SIZE = 1080;

    // Canvas 用の配色 (base.css の tokens に対応)
    const COLOR = {
        bgDark:     '#111116',
        boxBg:      '#151519',
        line:       '#ffffff',
        lineDim:    '#888892',
        textDim:    '#888892',
        textMute:   '#5a5a66',
        accentCyan: '#00e5ff',
        accentRed:  '#ff3340',
        accentWarn: '#ffcc00',
    };

    const FONT_MONO = "'Courier New', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', monospace";
    const FONT_JP   = "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Courier New', sans-serif";

    // ランク → 色
    function rankColor(rank) {
        if (rank === 'SS' || rank === 'S') return COLOR.accentCyan;
        if (rank === 'A')                  return COLOR.accentWarn;
        if (rank === 'B')                  return COLOR.line;
        if (rank === 'C')                  return COLOR.lineDim;
        return COLOR.accentRed; // D, F, timeout
    }

    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function drawGrid(ctx) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= SIZE; x += 60) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, SIZE);
            ctx.stroke();
        }
        for (let y = 0; y <= SIZE; y += 60) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(SIZE, y + 0.5);
            ctx.stroke();
        }
    }

    function drawDoubleFrame(ctx, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.strokeRect(24, 24, SIZE - 48, SIZE - 48);
        ctx.lineWidth = 2;
        ctx.strokeRect(40, 40, SIZE - 80, SIZE - 80);
    }

    // letterSpacing 対応の中央寄せテキスト
    function drawText(ctx, text, x, y, opts) {
        const {
            font, color, align = 'center', baseline = 'middle', letterSpacing = 0,
        } = opts;
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = baseline;

        if (letterSpacing === 0) {
            ctx.textAlign = align;
            ctx.fillText(text, x, y);
            return;
        }
        const chars = Array.from(text);
        const widths = chars.map(c => ctx.measureText(c).width);
        const totalW = widths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
        let cx;
        if (align === 'center')     cx = x - totalW / 2;
        else if (align === 'right') cx = x - totalW;
        else                        cx = x;
        ctx.textAlign = 'left';
        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], cx, y);
            cx += widths[i] + letterSpacing;
        }
    }

    // ---------- メイン ----------

    /**
     * result: scoring.compute() の返り値
     *   { score, correct, total, accuracy, avgTimeSec, totalTimeSec, rank }
     * stageInfo: { no, name, stress }
     * extras: { timeouts, deathEnd }
     */
    function render(result, stageInfo, extras = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');

        // 1. 背景 + グリッド
        ctx.fillStyle = COLOR.bgDark;
        ctx.fillRect(0, 0, SIZE, SIZE);
        drawGrid(ctx);

        // 2. 外枠 (ランク色の二重枠)
        const rc = rankColor(result.rank);
        drawDoubleFrame(ctx, rc);

        // 3. ヘッダ: STAGE 08  |  COLLAPSE
        drawText(ctx, `STAGE ${String(stageInfo.no).padStart(2, '0')}`, 100, 120, {
            font: `bold 48px ${FONT_MONO}`,
            color: COLOR.textDim,
            align: 'left',
            letterSpacing: 8,
        });
        drawText(ctx, stageInfo.name || '', SIZE - 100, 120, {
            font: `bold 44px ${FONT_JP}`,
            color: COLOR.line,
            align: 'right',
            letterSpacing: 4,
        });

        // ヘッダ下 horizontal line
        ctx.strokeStyle = COLOR.textMute;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(60, 170);
        ctx.lineTo(SIZE - 60, 170);
        ctx.stroke();

        // 4. RANK ラベル + でっかいランク文字
        drawText(ctx, 'RANK', SIZE / 2, 240, {
            font: `bold 44px ${FONT_MONO}`,
            color: COLOR.textMute,
            letterSpacing: 16,
        });
        const rankSize = result.rank.length === 1 ? 520 : 420;
        drawText(ctx, result.rank, SIZE / 2, 470, {
            font: `900 ${rankSize}px ${FONT_MONO}`,
            color: rc,
        });

        // ランク文字の下の thin separator
        ctx.strokeStyle = rc;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(240, 720);
        ctx.lineTo(SIZE - 240, 720);
        ctx.stroke();

        // 5. 上位% / 現実換算ラベル (仕様書 8-4)
        //    ランク文字の直下に 1 行、その下に 1 行
        const meta = window.Ranks?.META?.[result.rank];
        const pctText = window.Ranks?.percentileText(result.rank, stageInfo?.no) || '';
        const realLabel = window.Ranks?.pickLabel(result.rank, extras.labelSeed) || '';
        const pctColor = (meta && meta.positive) ? rc : COLOR.accentRed;

        if (pctText) {
            drawText(ctx, pctText, SIZE / 2, 760, {
                font: `900 60px ${FONT_MONO}`,
                color: pctColor,
                letterSpacing: 6,
            });
        }
        if (realLabel) {
            drawText(ctx, `≒ ${realLabel}`, SIZE / 2, 820, {
                font: `28px ${FONT_JP}`,
                color: COLOR.line,
                letterSpacing: 2,
            });
        }

        // 6. SCORE
        drawText(ctx, 'SCORE', SIZE / 2, 880, {
            font: `bold 32px ${FONT_MONO}`,
            color: COLOR.textDim,
            letterSpacing: 12,
        });
        drawText(ctx, result.score.toLocaleString(), SIZE / 2, 930, {
            font: `900 72px ${FONT_MONO}`,
            color: COLOR.line,
        });

        // 7. ステータス行
        const parts = [
            { text: `正解 ${result.correct}/${result.total}`, color: COLOR.line },
            { text: `TIME ${formatTime(result.totalTimeSec)}`, color: COLOR.line },
        ];
        const timeouts = extras.timeouts || 0;
        if (timeouts > 0) {
            parts.push({ text: `TIMEOUT×${timeouts}`, color: COLOR.accentRed });
        }

        ctx.font = `bold 30px ${FONT_JP}`;
        ctx.textBaseline = 'middle';
        const widths = parts.map(p => ctx.measureText(p.text).width);
        const totalW = widths.reduce((a, b) => a + b, 0);
        const spacing = Math.max(36, (SIZE - 280 - totalW) / Math.max(1, parts.length - 1));
        const rowY = 985;
        let cx = (SIZE - (totalW + spacing * (parts.length - 1))) / 2;
        parts.forEach((p, i) => {
            ctx.fillStyle = p.color;
            ctx.textAlign = 'left';
            ctx.fillText(p.text, cx, rowY);
            cx += widths[i] + spacing;
        });

        // 8. フッタ: タイトル + ハッシュタグ
        drawText(ctx, 'WEIRD QUIZ ATTACK', SIZE / 2, 1030, {
            font: `bold 30px ${FONT_MONO}`,
            color: COLOR.accentCyan,
            letterSpacing: 10,
        });
        drawText(ctx, '#変なクイズ  #WEIRDQUIZ', SIZE / 2, 1060, {
            font: `20px ${FONT_JP}`,
            color: COLOR.textDim,
            letterSpacing: 2,
        });

        // 8. DEAD スタンプ (B21即死で終了した場合)
        if (extras.deathEnd) {
            ctx.save();
            ctx.translate(SIZE - 180, 220);
            ctx.rotate(-0.18);
            ctx.strokeStyle = COLOR.accentRed;
            ctx.lineWidth = 6;
            ctx.strokeRect(-110, -50, 220, 100);
            ctx.fillStyle = COLOR.accentRed;
            ctx.font = `900 48px ${FONT_MONO}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('DEAD', 0, 4);
            ctx.restore();
        }

        return canvas;
    }

    // Canvas → Blob (PNG)
    function toBlob(canvas) {
        return new Promise((resolve) => {
            canvas.toBlob(blob => resolve(blob), 'image/png');
        });
    }

    // シェア用テキスト生成
    function buildText(result, stageInfo, extras = {}) {
        const rankLine = `Rank ${result.rank}  Score ${result.score.toLocaleString()}`;
        const stageLine = `Stage ${stageInfo.no} 「${stageInfo.name || ''}」`;
        const pct = window.Ranks?.percentileText(result.rank, stageInfo?.no) || '';
        const label = window.Ranks?.pickLabel(result.rank, extras.labelSeed) || '';
        const pctLine = pct ? `${pct}${label ? `  ≒ ${label}` : ''}` : '';
        const lines = [rankLine, stageLine, `正解 ${result.correct}/${result.total}`];
        if (pctLine) lines.push(pctLine);
        lines.push('', '#変なクイズ #WEIRDQUIZ');
        return lines.join('\n');
    }

    window.ShareCard = { render, toBlob, buildText, SIZE };
})();
