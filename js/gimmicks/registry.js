/* ============================================================
   gimmicks/registry.js — 崩壊UIギミック定義集
   ------------------------------------------------------------
   各ギミックのインタフェース:
     {
       id: 'B03',                              // ギミック一覧.md の ID
       name: '問題文逆さ',
       supports: 'both' | 'choice' | 'input',  // 対応する回答モード
       introducedAt: 2,                        // 初登場ステージ (設計書§9-3ステージ別プール)
       difficulty: 3,                          // 体感難度 1-10 (スタッフ付け)
       conflicts: ['C01', ...],                // 同時適用NGなID
       apply(ctx) => cleanupFn                 // ctx: { q, screen, zones }
     }

   ステージ別プール抽選ルール (selector.js で実装):
     Stage 1  : introducedAt === 1
     Stage 2-7: introducedAt ∈ {n-1, n}  (当該 + 1個下まで)
     Stage 8  : introducedAt ∈ {1..8}    (全部)
     Stage 9  : introducedAt ∈ {8, 9}    (8追加分 + 9追加分のみ)
     Stage 10 : CONFIG.STAGE10_POOL 直指定 (最高難度のみ, 重複OK)

   実装済み:
     Stage1: B11, B16, B18, B19             ← Phase 5b-Batch1
     Stage2: B03, B07                       ← Phase 5a
     Stage4: C01                            ← Phase 5a
     Stage5: B05, B12                       ← Phase 5a
     Stage6: W01, W03                       ← Phase 5a
     Stage7: B13                            ← Phase 5a
     Stage8: C04                            ← Phase 5a

   未実装 (Phase 5b-Batch2〜):
     Stage3: B02, B08
     Stage4: B04, B15, B20
     Stage5: B06, B14
     Stage6: B09, B10, W02, W07, C02
     Stage7: B01, B17, W05, W10, W14, W17, W19
     Stage8: C03, W04, W06, W09, W15, W16
     Stage9: B21, W08, W18, W20
   ============================================================ */

(function () {
    // ---------- 共通ユーティリティ ----------
    function q(scope, sel) { return scope && scope.querySelector(sel); }
    function qa(scope, sel) { return scope ? Array.from(scope.querySelectorAll(sel)) : []; }

    // ========== B (Both) ==========

    // --- Stage 1 プール (視覚ノイズ系、ゲーム本体には干渉しない) ---

    const B11_SHINE = {
        id: 'B11', name: '光沢', supports: 'both', introducedAt: 1, difficulty: 3,
        apply(ctx) {
            const host = document.createElement('div');
            host.className = 'gk-b11-shine';
            ctx.screen.appendChild(host);
            return () => host.remove();
        },
    };

    const B16_FAKE_COUNTDOWN = {
        id: 'B16', name: '高速カウントダウン', supports: 'both', introducedAt: 1, difficulty: 2,
        apply(ctx) {
            const host = document.createElement('div');
            host.className = 'gk-b16-fake';
            host.innerHTML = `
                <span class="gk-b16-label">SYS</span>
                <span class="gk-b16-num">0.000</span>
            `;
            ctx.screen.appendChild(host);
            const numEl = host.querySelector('.gk-b16-num');
            let n = 500 + Math.random() * 500;
            const timer = setInterval(() => {
                n -= 3 + Math.random() * 9;
                if (n < 0) n = 500 + Math.random() * 500;
                numEl.textContent = n.toFixed(3);
            }, 45);
            return () => {
                clearInterval(timer);
                host.remove();
            };
        },
    };

    const B18_FAKE_ERROR = {
        id: 'B18', name: '偽エラー表示', supports: 'both', introducedAt: 1, difficulty: 2,
        apply(ctx) {
            const host = document.createElement('div');
            host.className = 'gk-b18-fake';
            host.innerHTML = `
                <div class="gk-b18-spinner"></div>
                <div class="gk-b18-text">通信エラー<br><small>再試行中…</small></div>
            `;
            ctx.screen.appendChild(host);
            let showTimer = 0, hideTimer = 0;
            const show = () => {
                host.classList.add('is-on');
                hideTimer = setTimeout(hide, 1400 + Math.random() * 600);
            };
            const hide = () => {
                host.classList.remove('is-on');
                showTimer = setTimeout(show, 2500 + Math.random() * 2000);
            };
            showTimer = setTimeout(show, 800);
            return () => {
                clearTimeout(showTimer);
                clearTimeout(hideTimer);
                host.remove();
            };
        },
    };

    const B19_FAKE_PROGRESS = {
        id: 'B19', name: '進捗バー嘘', supports: 'both', introducedAt: 1, difficulty: 1,
        apply(ctx) {
            const header = q(ctx.screen, '.q-header');
            if (!header) return () => {};
            // 「STAGE X / Q N/M」を含む span を取得
            const span = qa(header, 'span').find(el => /Q\s*\d+\s*\/\s*\d+/.test(el.textContent));
            if (!span) return () => {};
            const original = span.textContent;
            const total = 20;
            const tick = () => {
                if (!span.isConnected) return;
                const fakeN = Math.floor(Math.random() * total) + 1;
                span.textContent = original.replace(/Q\s*\d+\s*\/\s*\d+/, `Q ${fakeN}/${total}`);
            };
            const timer = setInterval(tick, 1200);
            tick();
            return () => {
                clearInterval(timer);
                if (span.isConnected) span.textContent = original;
            };
        },
    };

    // --- Stage 2+ ---

    const B03_REVERSE = {
        id: 'B03', name: '問題文逆さ', supports: 'both', introducedAt: 2, difficulty: 3,
        apply(ctx) {
            const el = ctx.zones.question;
            if (!el) return () => {};
            const prev = el.style.transform;
            el.style.transform = `${prev ? prev + ' ' : ''}rotate(180deg)`;
            return () => { el.style.transform = prev; };
        },
    };

    const B05_MIRROR = {
        id: 'B05', name: 'ミラー', supports: 'both', introducedAt: 5, difficulty: 5,
        conflicts: ['B03'],
        apply(ctx) {
            const el = ctx.screen;
            const prev = el.style.transform;
            el.style.transform = `${prev ? prev + ' ' : ''}scaleX(-1)`;
            return () => { el.style.transform = prev; };
        },
    };

    const B07_GLITCH = {
        id: 'B07', name: 'グリッチ', supports: 'both', introducedAt: 2, difficulty: 3,
        conflicts: ['B12', 'B13'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            const noise = ['█', '▓', '▒', '░', '◊', '#', '@', '&', '%', '?', '*', '/'];

            let tickTimer = 0;
            let restoreTimer = 0;
            const tick = () => {
                // 20% の確率でグリッチ発動
                if (Math.random() < 0.3) {
                    let out = '';
                    for (const ch of original) {
                        out += Math.random() < 0.35
                            ? noise[Math.floor(Math.random() * noise.length)]
                            : ch;
                    }
                    stem.textContent = out;
                    clearTimeout(restoreTimer);
                    restoreTimer = setTimeout(() => {
                        if (stem.isConnected) stem.textContent = original;
                    }, 180);
                }
                tickTimer = setTimeout(tick, 600 + Math.random() * 700);
            };
            tickTimer = setTimeout(tick, 400);
            return () => {
                clearTimeout(tickTimer);
                clearTimeout(restoreTimer);
                if (stem.isConnected) stem.textContent = original;
            };
        },
    };

    const B12_BLUR = {
        id: 'B12', name: 'ぼかし', supports: 'both', introducedAt: 5, difficulty: 5,
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const prev = stem.style.filter;
            stem.style.filter = `${prev ? prev + ' ' : ''}blur(3px)`;
            return () => { stem.style.filter = prev; };
        },
    };

    const B13_TINY = {
        id: 'B13', name: 'フォント極小', supports: 'both', introducedAt: 7, difficulty: 7,
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            const prevSize = stem ? stem.style.fontSize : '';
            const prevLine = stem ? stem.style.lineHeight : '';
            if (stem) {
                stem.style.fontSize = '14px';
                stem.style.lineHeight = '1.2';
                stem.style.letterSpacing = '0';
            }
            ctx.screen.classList.add('gk-b13');
            return () => {
                if (stem) {
                    stem.style.fontSize = prevSize;
                    stem.style.lineHeight = prevLine;
                    stem.style.letterSpacing = '';
                }
                ctx.screen.classList.remove('gk-b13');
            };
        },
    };

    // ========== C (Choice only) ==========

    const C01_SHUFFLE = {
        id: 'C01', name: '選択肢シャッフル', supports: 'choice', introducedAt: 4, difficulty: 5,
        conflicts: ['C04'],
        apply(ctx) {
            const grid = q(ctx.screen, '.q-choices');
            if (!grid) return () => {};
            const timer = setInterval(() => {
                const btns = Array.from(grid.children);
                // Fisher-Yates で DOM 順を入れ替え
                for (let i = btns.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    if (i !== j) grid.insertBefore(btns[i], btns[j]);
                }
            }, 1000);
            return () => clearInterval(timer);
        },
    };

    const C04_FAKE_5050 = {
        id: 'C04', name: '嘘50:50', supports: 'choice', introducedAt: 8, difficulty: 6,
        conflicts: ['C01'],
        apply(ctx) {
            const btns = qa(ctx.screen, '.q-choice');
            if (btns.length < 4) return () => {};
            // 正解含めランダムに2つをグレーアウト (騙し要素)
            const pool = btns.map((_, i) => i).sort(() => Math.random() - 0.5);
            const picked = pool.slice(0, 2);
            picked.forEach(i => {
                btns[i].style.opacity = '0.22';
                btns[i].style.pointerEvents = 'none';
                btns[i].style.filter = 'grayscale(1)';
            });
            return () => {
                picked.forEach(i => {
                    if (!btns[i]) return;
                    btns[i].style.opacity = '';
                    btns[i].style.pointerEvents = '';
                    btns[i].style.filter = '';
                });
            };
        },
    };

    // ========== W (Input/Write only) ==========

    const W01_KEYS_INVISIBLE = {
        id: 'W01', name: '文字盤見えない', supports: 'input', introducedAt: 6, difficulty: 7,
        apply(ctx) {
            ctx.screen.classList.add('gk-w01');
            return () => ctx.screen.classList.remove('gk-w01');
        },
    };

    const W03_ANSWER_INVISIBLE = {
        id: 'W03', name: '解答欄見えない', supports: 'input', introducedAt: 6, difficulty: 6,
        apply(ctx) {
            ctx.screen.classList.add('gk-w03');
            return () => ctx.screen.classList.remove('gk-w03');
        },
    };

    // ---------- Export ----------
    const map = {
        B11_SHINE, B16_FAKE_COUNTDOWN, B18_FAKE_ERROR, B19_FAKE_PROGRESS,
        B03_REVERSE, B05_MIRROR, B07_GLITCH, B12_BLUR, B13_TINY,
        C01_SHUFFLE, C04_FAKE_5050,
        W01_KEYS_INVISIBLE, W03_ANSWER_INVISIBLE,
    };
    const all = Object.values(map).filter(g => g && g.id);
    window.GimmickRegistry = Object.assign({ all }, map);
})();
