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
     Stage1: B11, B16, B18                  ← Phase 5b-Batch1 (B19は廃止)
     Stage2: B03, B07                       ← Phase 5a
     Stage3: B02, B08                       ← Phase 5b-Batch2
     Stage4: B04, B15, B20, C01             ← Phase 5b-Batch2 (+ C01=5a)
     Stage5: B05, B06, B12, B14             ← Phase 5b-Batch3a (+ B05/B12=5a)
     Stage6: B09, B10, W01, W02, W03, W07, C02  ← Phase 5b-Batch3b (+ W01/W03=5a)
     Stage7: B13                            ← Phase 5a
     Stage8: C04                            ← Phase 5a

   未実装 (Phase 5b-Batch4〜):
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

    const B11_BLASTER = {
        id: 'B11', name: 'コーナービーム', supports: 'both', introducedAt: 1, difficulty: 4,
        apply(ctx) {
            const host = document.createElement('div');
            host.className = 'gk-b11-host';
            host.innerHTML = `
                <div class="gk-b11-beam gk-b11-tl"></div>
                <div class="gk-b11-beam gk-b11-tr"></div>
                <div class="gk-b11-beam gk-b11-br"></div>
                <div class="gk-b11-beam gk-b11-bl"></div>
            `;
            ctx.screen.appendChild(host);

            const beams = Array.from(host.querySelectorAll('.gk-b11-beam'));
            const timers = new Set();
            let firing = false;   // 発射中フラグ (排他制御: 同時発射させない)
            let alive = true;

            function schedule(fn, delay) {
                const t = setTimeout(() => {
                    timers.delete(t);
                    if (alive) fn();
                }, delay);
                timers.add(t);
            }

            function fire(beam) {
                if (!alive) return;
                if (firing) {
                    // 他ビーム発射中 → 少し待って再挑戦 (重なり回避)
                    schedule(() => fire(beam), 200 + Math.random() * 400);
                    return;
                }
                firing = true;
                beam.classList.add('is-fire');
                // 1秒間発射
                schedule(() => {
                    beam.classList.remove('is-fire');
                    firing = false;
                    // 休憩 1.5〜4秒の後、再発射スケジュール
                    schedule(() => fire(beam), 1500 + Math.random() * 2500);
                }, 1000);
            }

            // 初期ばらけ: 4本それぞれ別タイミングで開始
            beams.forEach((beam, i) => {
                schedule(() => fire(beam), 300 + i * 700 + Math.random() * 600);
            });

            return () => {
                alive = false;
                timers.forEach(clearTimeout);
                timers.clear();
                host.remove();
            };
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

    // --- Stage 2+ ---

    const B02_TYPEWRITER = {
        id: 'B02', name: '問題文1文字ずつ', supports: 'both', introducedAt: 3, difficulty: 4,
        conflicts: ['B07', 'B08', 'B17'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            const chars = Array.from(original);
            stem.textContent = '';
            let i = 0;
            let done = false;
            const timer = setInterval(() => {
                if (i >= chars.length) {
                    clearInterval(timer);
                    done = true;
                    return;
                }
                stem.textContent = chars.slice(0, i + 1).join('');
                i++;
            }, 90 + Math.random() * 40);
            return () => {
                clearInterval(timer);
                if (stem.isConnected && !done) stem.textContent = original;
            };
        },
    };

    const B04_ZOOM_CHAOS = {
        id: 'B04', name: 'ズーム暴走', supports: 'both', introducedAt: 4, difficulty: 5,
        conflicts: ['B03', 'B05'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            stem.classList.add('gk-b04-zoom');
            return () => stem.classList.remove('gk-b04-zoom');
        },
    };

    const B08_FADEOUT = {
        id: 'B08', name: 'フェードアウト', supports: 'both', introducedAt: 3, difficulty: 4,
        conflicts: ['B02', 'B12'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const prevTransition = stem.style.transition;
            const prevOpacity = stem.style.opacity;
            stem.style.transition = 'opacity 4.5s linear';
            const timer = setTimeout(() => {
                if (stem.isConnected) stem.style.opacity = '0';
            }, 1000);
            return () => {
                clearTimeout(timer);
                if (stem.isConnected) {
                    stem.style.transition = prevTransition;
                    stem.style.opacity = prevOpacity;
                }
            };
        },
    };

    const B15_REVERSED_TEXT = {
        id: 'B15', name: '問題文逆順表示', supports: 'both', introducedAt: 4, difficulty: 6,
        conflicts: ['B02', 'B07', 'B17'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            stem.textContent = Array.from(original).reverse().join('');
            return () => {
                if (stem.isConnected) stem.textContent = original;
            };
        },
    };

    const B20_BLACKOUT = {
        id: 'B20', name: '暗転', supports: 'both', introducedAt: 4, difficulty: 5,
        apply(ctx) {
            const host = document.createElement('div');
            host.className = 'gk-b20-blackout';
            ctx.screen.appendChild(host);
            let showTimer = 0, hideTimer = 0;
            const show = () => {
                host.classList.add('is-on');
                hideTimer = setTimeout(hide, 2600 + Math.random() * 800);
            };
            const hide = () => {
                host.classList.remove('is-on');
                showTimer = setTimeout(show, 6000 + Math.random() * 4000);
            };
            // 最初は少し遅らせて発動 (問題が見える時間を確保)
            showTimer = setTimeout(show, 4000 + Math.random() * 3000);
            return () => {
                clearTimeout(showTimer);
                clearTimeout(hideTimer);
                host.remove();
            };
        },
    };

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

    const B06_COLOR_BREAK = {
        id: 'B06', name: '色覚破壊', supports: 'both', introducedAt: 5, difficulty: 6,
        apply(ctx) {
            ctx.screen.classList.add('gk-b06');
            return () => ctx.screen.classList.remove('gk-b06');
        },
    };

    const B14_MARGIN_CHAOS = {
        id: 'B14', name: '余白暴走', supports: 'both', introducedAt: 5, difficulty: 5,
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            stem.classList.add('gk-b14');
            return () => stem.classList.remove('gk-b14');
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

    const B09_SHRINK = {
        id: 'B09', name: '画面縮小', supports: 'both', introducedAt: 6, difficulty: 6,
        conflicts: ['B03', 'B05'],  // 画面全体のtransformを奪うため
        apply(ctx) {
            const el = ctx.screen;
            const prev = el.style.transform;
            const prevOrigin = el.style.transformOrigin;
            el.style.transform = `${prev ? prev + ' ' : ''}scale(0.6)`;
            el.style.transformOrigin = 'center center';
            return () => {
                el.style.transform = prev;
                el.style.transformOrigin = prevOrigin;
            };
        },
    };

    const B10_SHUFFLE_TEXT = {
        id: 'B10', name: '問題文ランダム出力', supports: 'both', introducedAt: 6, difficulty: 5,
        conflicts: ['B02', 'B07', 'B15', 'B17'],  // stem.textContent を触る他とぶつかる
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            const chars = Array.from(original);

            const shuffled = () => {
                const a = chars.slice();
                for (let i = a.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [a[i], a[j]] = [a[j], a[i]];
                }
                return a.join('');
            };
            stem.textContent = shuffled();
            const timer = setInterval(() => {
                if (stem.isConnected) stem.textContent = shuffled();
            }, 950);
            return () => {
                clearInterval(timer);
                if (stem.isConnected) stem.textContent = original;
            };
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

    const C02_DUMMY_CHOICE = {
        id: 'C02', name: 'ダミー選択肢', supports: 'choice', introducedAt: 6, difficulty: 7,
        apply(ctx) {
            const grid = q(ctx.screen, '.q-choices');
            if (!grid) return () => {};
            const existing = qa(grid, '.q-choice');
            if (existing.length === 0) return () => {};

            // 既存のランダム1つを複製 → 同じラベルのダミーを1個追加
            // cloneNode は addEventListener を引き継がない → 叩いても無反応
            const sample = existing[Math.floor(Math.random() * existing.length)];
            const dummy = sample.cloneNode(true);
            dummy.classList.add('gk-c02-dummy');
            dummy.removeAttribute('data-idx');  // 誤って拾われないように
            // 念のため capture 段で click も殺す
            const killClick = (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                dummy.classList.add('gk-c02-deny');
                setTimeout(() => dummy.classList.remove('gk-c02-deny'), 180);
            };
            dummy.addEventListener('click', killClick, { capture: true });
            dummy.addEventListener('pointerdown', killClick, { capture: true });

            // 挿入位置もランダム
            const insertAt = Math.floor(Math.random() * (existing.length + 1));
            if (insertAt >= existing.length) grid.appendChild(dummy);
            else grid.insertBefore(dummy, existing[insertAt]);

            return () => dummy.remove();
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

    const W02_KEYS_SHUFFLE = {
        id: 'W02', name: '文字盤あべこべ', supports: 'input', introducedAt: 6, difficulty: 7,
        apply(ctx) {
            const shuffleLabels = () => {
                // 現在のキーボードから「文字キー」の main ラベルを抽出
                const keys = qa(ctx.screen, '.kb-key:not(.kb-fn)');
                const mains = keys.map(k => k.querySelector('.kb-main')).filter(Boolean);
                if (mains.length < 2) return;
                const labels = mains.map(m => m.textContent);
                // Fisher-Yates
                for (let i = labels.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [labels[i], labels[j]] = [labels[j], labels[i]];
                }
                mains.forEach((m, i) => { m.textContent = labels[i]; });
            };
            shuffleLabels();
            const timer = setInterval(shuffleLabels, 2800);
            return () => clearInterval(timer);
            // 表示だけのシャッフル。実際のタップ挙動は元の key のまま (=位置が正解)
            // → ユーザは「表示に騙されて」別の文字を入力してしまう
        },
    };

    const W07_CHAR_DROP = {
        id: 'W07', name: '入力1文字消失', supports: 'input', introducedAt: 6, difficulty: 7,
        apply(ctx) {
            const tick = () => {
                const kb = window.Keyboard;
                if (!kb || typeof kb.getValue !== 'function') return;
                const v = kb.getValue();
                if (!v || v.length === 0) return;
                const arr = Array.from(v);
                const idx = Math.floor(Math.random() * arr.length);
                arr.splice(idx, 1);
                kb.setValue(arr.join(''));
            };
            // 1.6〜2.4秒ごとに1文字消す
            const schedule = () => {
                return setTimeout(() => {
                    tick();
                    timer = schedule();
                }, 1600 + Math.random() * 800);
            };
            let timer = schedule();
            return () => clearTimeout(timer);
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
        B11_BLASTER, B16_FAKE_COUNTDOWN, B18_FAKE_ERROR,
        B02_TYPEWRITER, B04_ZOOM_CHAOS, B08_FADEOUT, B15_REVERSED_TEXT, B20_BLACKOUT,
        B03_REVERSE, B05_MIRROR, B06_COLOR_BREAK, B07_GLITCH,
        B09_SHRINK, B10_SHUFFLE_TEXT,
        B12_BLUR, B13_TINY, B14_MARGIN_CHAOS,
        C01_SHUFFLE, C02_DUMMY_CHOICE, C04_FAKE_5050,
        W01_KEYS_INVISIBLE, W02_KEYS_SHUFFLE, W03_ANSWER_INVISIBLE, W07_CHAR_DROP,
    };
    const all = Object.values(map).filter(g => g && g.id);
    window.GimmickRegistry = Object.assign({ all }, map);
})();
