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
     Stage7: B01, B13, B17, W05, W10, W14, W17, W19  ← Phase 5b-Batch4 (+ B13=5a)
     Stage8: C03, C04, W04, W06, W09, W15, W16  ← Phase 5b-Batch5 (+ C04=5a)
     Stage9: B21, W08, W18, W20                 ← Phase 5b-Batch6 (最終バッチ)

   未実装: なし (MVP ギミック全数 = 35 / Phase 5b 完了)
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
            // 外側は位置と回転を担当。内側 .gk-b11-core が実際の発光・scaleX アニメ。
            host.innerHTML = `
                <div class="gk-b11-beam gk-b11-tl"><div class="gk-b11-core"></div></div>
                <div class="gk-b11-beam gk-b11-tr"><div class="gk-b11-core"></div></div>
                <div class="gk-b11-beam gk-b11-br"><div class="gk-b11-core"></div></div>
                <div class="gk-b11-beam gk-b11-bl"><div class="gk-b11-core"></div></div>
            `;
            ctx.screen.appendChild(host);

            const beams = Array.from(host.querySelectorAll('.gk-b11-beam'));
            const timers = new Set();
            let firing = false;   // 発射中フラグ (排他制御: 同時発射させない)
            let alive = true;

            // チャージ+発射+フェード で1本あたり合計 1.2 秒。
            // CSSのキーフレームと揃える必要があるので定数化。
            const FIRE_DURATION = 1200;

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
                schedule(() => {
                    beam.classList.remove('is-fire');
                    firing = false;
                    // 休憩 1.8〜3.5秒
                    schedule(() => fire(beam), 1800 + Math.random() * 1700);
                }, FIRE_DURATION);
            }

            beams.forEach((beam, i) => {
                schedule(() => fire(beam), 300 + i * 800 + Math.random() * 600);
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
        id: 'B16', name: '偽カウントダウン', supports: 'both', introducedAt: 1, difficulty: 2,
        apply(ctx) {
            const host = document.createElement('div');
            host.className = 'gk-b16-fake';
            host.innerHTML = `
                <span class="gk-b16-label">SYS</span>
                <span class="gk-b16-num">01:00</span>
            `;
            ctx.screen.appendChild(host);
            const numEl = host.querySelector('.gk-b16-num');
            const TOTAL_MS = 20000; // 3倍速: 表示60秒 ÷ 3 = 実時間20秒
            const startAt = Date.now();
            const timer = setInterval(() => {
                const remainMs = Math.max(0, TOTAL_MS - (Date.now() - startAt));
                const sec = Math.floor((remainMs / TOTAL_MS) * 60);
                const mm = Math.floor(sec / 60).toString().padStart(2, '0');
                const ss = (sec % 60).toString().padStart(2, '0');
                numEl.textContent = `${mm}:${ss}`;
                if (remainMs <= 0) {
                    numEl.textContent = '00:00';
                    clearInterval(timer);
                }
            }, 100);
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

    const B25_CHAR_OBSTRUCT = {
        id: 'B25', name: 'キャラ妨害', supports: 'both', introducedAt: 5, difficulty: 5,
        apply(ctx) {
            const SPRITES = [
                'sprite/girl/basic.png',
                'sprite/girl/happy.png',
                'sprite/girl/hi.png',
                'sprite/girl/think.png',
                'sprite/girl/think_light.png',
            ];
            const timers = new Set();
            let alive = true;

            function schedule(fn, delay) {
                const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, delay);
                timers.add(t);
            }

            function createChar(side) {
                const img = document.createElement('img');
                img.src = SPRITES[Math.floor(Math.random() * SPRITES.length)];
                img.className = `gk-b25-char gk-b25-${side}`;
                img.draggable = false;
                ctx.screen.appendChild(img);
                return img;
            }

            function spawnPair() {
                const left = createChar('left');
                const right = createChar('right');
                // 初期(画面外)状態を描画してからトランジション開始
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (!alive) return;
                        left.classList.add('is-in');
                        right.classList.add('is-in');
                    });
                });
                // 1.5〜2.5秒ホールドして退場
                schedule(() => {
                    left.classList.remove('is-in');
                    right.classList.remove('is-in');
                    schedule(() => { left.remove(); right.remove(); }, 600);
                }, 1500 + Math.random() * 1000);
            }

            schedule(spawnPair, 1200);
            schedule(spawnPair, 6000 + Math.random() * 3000);

            return () => {
                alive = false;
                timers.forEach(clearTimeout);
                timers.clear();
                ctx.screen.querySelectorAll('.gk-b25-char').forEach(el => el.remove());
            };
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

    // --- Stage 7 プール ---

    const B01_REVERSE_TAP = {
        id: 'B01', name: '反転タップ', supports: 'both', introducedAt: 7, difficulty: 8,
        // 座標系を捻るギミックとは干渉させない。
        // W19 (フリック方向反転) はポインタ反転と二重反転→相殺して難度弱化。
        conflicts: ['B03', 'B05', 'W19'],
        apply(ctx) {
            const screen = ctx.screen;
            function mirrorPoint(cx0, cy0, x, y) {
                return { x: 2 * cx0 - x, y: 2 * cy0 - y };
            }
            function center() {
                const rect = screen.getBoundingClientRect();
                return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
            }
            function redirectPointer(e) {
                if (e.__gkB01) return;
                // keyboard が拾わない場所のイベントは無視 (パフォーマンス)
                // pointermove/up は「発射」中のドラッグのみ反転されるべきだが、
                // ブラウザは問答無用で window に流すので全部反転させる。
                const { cx, cy } = center();
                const { x, y } = mirrorPoint(cx, cy, e.clientX, e.clientY);
                e.preventDefault();
                e.stopImmediatePropagation();
                const target = document.elementFromPoint(x, y) || screen;
                const ne = new PointerEvent(e.type, {
                    bubbles: true, cancelable: true,
                    clientX: x, clientY: y,
                    pointerId: e.pointerId,
                    pointerType: e.pointerType || 'touch',
                    button: e.button, buttons: e.buttons,
                    isPrimary: e.isPrimary,
                });
                ne.__gkB01 = true;
                target.dispatchEvent(ne);
            }
            function redirectClick(e) {
                if (e.__gkB01) return;
                const { cx, cy } = center();
                const { x, y } = mirrorPoint(cx, cy, e.clientX, e.clientY);
                e.preventDefault();
                e.stopImmediatePropagation();
                const target = document.elementFromPoint(x, y) || screen;
                const ne = new MouseEvent('click', {
                    bubbles: true, cancelable: true,
                    clientX: x, clientY: y,
                    button: e.button, buttons: e.buttons,
                });
                ne.__gkB01 = true;
                target.dispatchEvent(ne);
            }
            // pointerdown/click は screen 上で、pointermove/up/cancel は
            // keyboard.js が window に付けているので window レベルで横取りする。
            screen.addEventListener('pointerdown', redirectPointer, true);
            screen.addEventListener('click', redirectClick, true);
            window.addEventListener('pointermove', redirectPointer, true);
            window.addEventListener('pointerup', redirectPointer, true);
            window.addEventListener('pointercancel', redirectPointer, true);
            return () => {
                screen.removeEventListener('pointerdown', redirectPointer, true);
                screen.removeEventListener('click', redirectClick, true);
                window.removeEventListener('pointermove', redirectPointer, true);
                window.removeEventListener('pointerup', redirectPointer, true);
                window.removeEventListener('pointercancel', redirectPointer, true);
            };
        },
    };

    const B17_NOISE_TEXT = {
        id: 'B17', name: '問題文めちゃくちゃ', supports: 'both', introducedAt: 7, difficulty: 7,
        // stem を書き換える/フェードさせる系と全部衝突
        conflicts: ['B02', 'B07', 'B08', 'B10', 'B15'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const originalHTML = stem.innerHTML;
            const originalText = stem.textContent;
            const prevClasses = stem.className;

            const CHARS = 'あかさたなはまやらわいきしちにひみりうくすつぬふむゆるえけせてねへめれおこそとのほもよろをがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽアカサタナハマヤラワ日本国語数字漢記号線点';
            function randLine(minLen, maxLen) {
                const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
                let s = '';
                for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
                return s;
            }
            function esc(s) {
                return String(s).replace(/[&<>"']/g, c => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                }[c]));
            }
            const LINES = 14;
            const realLineIdx = 1 + Math.floor(Math.random() * (LINES - 2)); // 両端は避ける
            const out = [];
            for (let i = 0; i < LINES; i++) {
                if (i === realLineIdx) {
                    out.push(`<span class="gk-b17-line gk-b17-real">${esc(originalText)}</span>`);
                } else {
                    out.push(`<span class="gk-b17-line">${esc(randLine(6, 22))}</span>`);
                }
            }
            stem.classList.add('gk-b17-noise');
            stem.innerHTML = out.join('');
            return () => {
                stem.className = prevClasses;
                stem.innerHTML = originalHTML;
            };
        },
    };

    const B13_TINY = {
        id: 'B13', name: 'フォント極小', supports: 'both', introducedAt: 7, difficulty: 7,
        // B17: stem inline fontSize=14px が .gk-b17-line の 34px(CSS)を上書き → B17難度弱化
        // W14: .gk-b13 .kb-key .kb-main{font-size:14px !important} が W14 huge(96px)を上書き
        conflicts: ['B17', 'W14'],
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

    // --- Stage 8 プール (Choice) ---

    const C03_CHAR_CORRUPT = {
        id: 'C03', name: '選択肢文字変化', supports: 'choice', introducedAt: 8, difficulty: 8,
        apply(ctx) {
            const btns = qa(ctx.screen, '.q-choice');
            if (btns.length === 0) return () => {};
            // 本物/ダミー問わず全ての選択肢を対象にする (C02 との併用時も整合)
            const states = btns.map(btn => ({
                btn,
                original: btn.textContent,
                chars: Array.from(btn.textContent),
            }));
            const NOISE = '█▓▒░◊#&@?*%ΛΣΞ☆♪♀♂々〆ヾミЯЮЖ';
            const noiseCh = () => NOISE[Math.floor(Math.random() * NOISE.length)];

            // 1秒ごとにランダムな選択肢のランダムな位置を1文字ずつ壊す
            const timer = setInterval(() => {
                const alive = states.filter(s => s.btn.isConnected);
                if (alive.length === 0) return;
                const s = alive[Math.floor(Math.random() * alive.length)];
                if (s.chars.length === 0) return;
                const pos = Math.floor(Math.random() * s.chars.length);
                s.chars[pos] = noiseCh();
                s.btn.textContent = s.chars.join('');
            }, 1000);

            return () => {
                clearInterval(timer);
                states.forEach(s => {
                    if (s.btn.isConnected) s.btn.textContent = s.original;
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
        // W17 のモード切替は render() を走らせてラベルを元に戻してしまう
        conflicts: ['W17'],
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

    // --- Stage 7 プール (文字盤フック系) ---

    // キーボード onChange を安全にラップするためのヘルパー
    // - W05/W10 など 1 問中に1個しか使わない前提 (conflicts で制御)
    function wrapOnChange(mutator) {
        const kb = window.Keyboard;
        if (!kb || !kb.getOnChange) return () => {};
        const orig = kb.getOnChange();
        kb.setOnChange(mutator(orig));
        return () => {
            // unmount済なら setOnChange は no-op
            try { kb.setOnChange(orig); } catch (e) { /* ignore */ }
        };
    }

    const W05_CURSOR_WILD = {
        id: 'W05', name: 'カーソル暴走', supports: 'input', introducedAt: 7, difficulty: 7,
        // 同じく buffer を捻るギミックとは干渉
        conflicts: ['W07', 'W10'],
        apply(ctx) {
            let prev = window.Keyboard?.getValue() || '';
            let bypass = false;
            const unwrap = wrapOnChange((orig) => (val) => {
                if (bypass) { bypass = false; prev = val; if (orig) orig(val); return; }
                // 末尾に1文字だけ追加された場合 → ランダムな位置に挿入し直す
                if (val.length === prev.length + 1 && val.startsWith(prev)) {
                    const ch = val[val.length - 1];
                    const base = prev;
                    if (base.length === 0) {
                        // 最初の1文字はそのまま
                        prev = val; if (orig) orig(val); return;
                    }
                    let pos = Math.floor(Math.random() * (base.length + 1));
                    // 本当の末尾は避ける(必ず「ズレた」感を出す)
                    if (pos === base.length) pos = Math.max(0, base.length - 1);
                    const mutated = base.slice(0, pos) + ch + base.slice(pos);
                    bypass = true;
                    window.Keyboard.setValue(mutated);
                    return;
                }
                prev = val;
                if (orig) orig(val);
            });
            return unwrap;
        },
    };

    const W10_INPUT_DELAY = {
        id: 'W10', name: '入力遅延', supports: 'input', introducedAt: 7, difficulty: 7,
        conflicts: ['W05', 'W07'],
        apply(ctx) {
            const DELAY = 2000;
            const timers = new Set();
            const unwrap = wrapOnChange((orig) => (val) => {
                const t = setTimeout(() => {
                    timers.delete(t);
                    if (orig) orig(val);
                }, DELAY);
                timers.add(t);
            });
            return () => {
                timers.forEach(clearTimeout);
                timers.clear();
                unwrap();
            };
        },
    };

    const W14_KEY_HUGE = {
        id: 'W14', name: 'キー巨大化', supports: 'input', introducedAt: 7, difficulty: 7,
        // W17 render() で .gk-w14-huge が消滅。B13 との conflict は B13 側で宣言済み。
        conflicts: ['W17'],
        apply(ctx) {
            let target = null;
            function pick() {
                // OK/BS は避ける (操作不能事故防止)
                const candidates = qa(ctx.screen, '.kb-key:not(.kb-empty):not(.kb-fn-ok):not(.kb-fn-bs)');
                if (candidates.length === 0) return null;
                return candidates[Math.floor(Math.random() * candidates.length)];
            }
            function apply() {
                if (target) target.classList.remove('gk-w14-huge');
                target = pick();
                if (target) target.classList.add('gk-w14-huge');
            }
            apply();
            // 問題中に1回だけ差し替え (10秒後) — 永続的に同じキーだと慣れてしまう
            const swap = setTimeout(apply, 10000);
            return () => {
                clearTimeout(swap);
                if (target) target.classList.remove('gk-w14-huge');
            };
        },
    };

    const W17_MODE_AUTO_SWAP = {
        id: 'W17', name: 'カナひら勝手切替', supports: 'input', introducedAt: 7, difficulty: 7,
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb || !kb.setMode) return () => {};
            const originalMode = kb.getMode();
            // ひらがな⇔カタカナのみ切り替える (alpha/number は問題性質と噛み合わないので除外)
            let cur = originalMode === 'katakana' ? 'katakana' : 'hiragana';
            function flip() {
                cur = cur === 'hiragana' ? 'katakana' : 'hiragana';
                try { kb.setMode(cur); } catch (e) { /* ignore */ }
            }
            const interval = setInterval(flip, 3500 + Math.random() * 1500);
            return () => {
                clearInterval(interval);
                try { kb.setMode(originalMode); } catch (e) { /* ignore */ }
            };
        },
    };

    const W19_FLICK_REVERSE = {
        id: 'W19', name: 'フリック方向反転', supports: 'input', introducedAt: 7, difficulty: 7,
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb || !kb.setFlickTransform) return () => {};
            kb.setFlickTransform((dir) => {
                if (dir === 'u') return 'd';
                if (dir === 'd') return 'u';
                if (dir === 'l') return 'r';
                if (dir === 'r') return 'l';
                return dir;
            });
            return () => kb.setFlickTransform(null);
        },
    };

    // --- Stage 8 プール (Input) ---

    // あいうえお 行内で「1個前の音」へ戻すマップ。行頭は不動。
    // カタカナの場合は hiraToKata/kataToHira でラップして使う。
    const W04_SHIFT_MAP = (() => {
        const rows = [
            'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと',
            'なにぬねの', 'はひふへほ', 'まみむめも', 'やゆよ',
            'らりるれろ', 'わをん',
        ];
        const m = {};
        rows.forEach(r => {
            const arr = Array.from(r);
            for (let i = 0; i < arr.length; i++) {
                m[arr[i]] = i === 0 ? arr[0] : arr[i - 1];
            }
        });
        return m;
    })();

    function w04ShiftChar(ch) {
        const L = window.KeyboardLayouts;
        if (!L) return ch;
        // カタカナ → ひらがな化してマップを引き、元のスクリプトに戻す
        const isKata = /[\u30A1-\u30F6]/.test(ch);
        const base = isKata ? L.kataToHira(ch) : ch;
        const mapped = W04_SHIFT_MAP[base];
        if (!mapped || mapped === base) return ch;
        return isKata ? L.hiraToKata(mapped) : mapped;
    }

    const W04_INPUT_SHIFT = {
        id: 'W04', name: '入力ズレ', supports: 'input', introducedAt: 8, difficulty: 9,
        // buffer を捻る系全般と排他
        conflicts: ['W05', 'W06', 'W07', 'W09', 'W10'],
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb) return () => {};
            let prev = kb.getValue() || '';
            let bypass = false;
            const unwrap = wrapOnChange((orig) => (val) => {
                if (bypass) { bypass = false; prev = val; if (orig) orig(val); return; }
                if (val.length === prev.length + 1 && val.startsWith(prev)) {
                    const ch = val[val.length - 1];
                    const shifted = w04ShiftChar(ch);
                    if (shifted === ch) {
                        prev = val; if (orig) orig(val); return;
                    }
                    const mutated = prev + shifted;
                    bypass = true;
                    kb.setValue(mutated);
                    return;
                }
                prev = val;
                if (orig) orig(val);
            });
            return unwrap;
        },
    };

    const W06_REVERSE_TEXT = {
        id: 'W06', name: '文字順逆転', supports: 'input', introducedAt: 8, difficulty: 8,
        // これは表示のみ反転 (buffer はそのまま) なので buffer 系との併用は許容
        // だが W05/W09 等と組むとどっちが先に見えているのか混乱するので排他にしておく
        conflicts: ['W05', 'W04', 'W09', 'W10'],
        apply(ctx) {
            // buffer は触らず、onChange に流す「表示用値」だけ反転する
            // → OK 判定時の onSubmit は本物の buffer を受け取るので
            //   「見えている文字列を正しく並べて入力する」ゲームになる
            const unwrap = wrapOnChange((orig) => (val) => {
                const reversed = Array.from(val).reverse().join('');
                if (orig) orig(reversed);
            });
            return unwrap;
        },
    };

    const W09_GHOST_INPUT = {
        id: 'W09', name: 'ゴースト入力', supports: 'input', introducedAt: 8, difficulty: 8,
        conflicts: ['W04', 'W05', 'W06', 'W07', 'W10'],
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb) return () => {};
            const NOISE = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょっゞゟヰヱヶ';
            const noiseCh = () => NOISE[Math.floor(Math.random() * NOISE.length)];

            let bypass = false;
            // setValue 経由で挿入すると wrapOnChange の他ギミックと競合するが、
            // 排他設定してあるので単独起動のはず。
            function inject() {
                const cur = kb.getValue() || '';
                if (cur.length >= 19) return; // max 直前は挿入しない (溢れ防止)
                bypass = true;
                kb.setValue(cur + noiseCh());
            }
            // 4〜6 秒に1回、ランダムにゴミを足す
            function scheduleNext() {
                return setTimeout(() => {
                    inject();
                    timer = scheduleNext();
                }, 4000 + Math.random() * 2000);
            }

            // onChange を素通しさせる薄いラップ (bypass リセットのため)
            const unwrap = wrapOnChange((orig) => (val) => {
                bypass = false;
                if (orig) orig(val);
            });

            let timer = scheduleNext();
            return () => {
                clearTimeout(timer);
                unwrap();
            };
        },
    };

    const W15_KEY_WARP = {
        id: 'W15', name: 'キーワープ', supports: 'input', introducedAt: 8, difficulty: 8,
        // 文字盤の DOM を直接いじるので、再描画系/別DOM操作系と排他
        conflicts: ['W02', 'W08', 'W16', 'W17'],
        apply(ctx) {
            const grid = q(ctx.screen, '.kb-grid');
            if (!grid) return () => {};

            // スワップ対象は文字キーのみ (fn キーを動かすと OK/BS が行方不明になる)
            function candidates() {
                return qa(grid, '.kb-key:not(.kb-empty):not(.kb-fn)');
            }

            function swapNodes(a, b) {
                if (a === b) return;
                const pa = a.parentNode;
                const pb = b.parentNode;
                if (!pa || !pb) return;
                const na = a.nextSibling;
                const nb = b.nextSibling;
                pb.insertBefore(a, nb);
                pa.insertBefore(b, na);
            }

            function onUp(e) {
                const keyEl = e.target.closest('.kb-key');
                if (!keyEl || keyEl.classList.contains('kb-fn') || keyEl.classList.contains('kb-empty')) return;
                // 実際に文字が入力される (ドラッグなしのタップ) かは判定が難しいので、
                // キーを触ったら必ずワープさせる。
                const pool = candidates().filter(k => k !== keyEl);
                if (pool.length === 0) return;
                const partner = pool[Math.floor(Math.random() * pool.length)];
                // ワープは次フレームで (今の pointerup の後処理が済むまで待つ)
                requestAnimationFrame(() => swapNodes(keyEl, partner));
            }
            grid.addEventListener('pointerup', onUp, true);
            return () => {
                grid.removeEventListener('pointerup', onUp, true);
            };
        },
    };

    const W16_KEYS_MERGE = {
        id: 'W16', name: 'キー同士くっつく', supports: 'input', introducedAt: 8, difficulty: 8,
        conflicts: ['W02', 'W08', 'W15', 'W17'],
        apply(ctx) {
            const grid = q(ctx.screen, '.kb-grid');
            if (!grid) return () => {};
            const keys = qa(grid, '.kb-key:not(.kb-empty):not(.kb-fn)');
            if (keys.length < 6) return () => {};

            // 元の data-key と main テキストを退避
            const snapshot = keys.map(k => ({
                el: k,
                dataKey: k.getAttribute('data-key'),
                mainHTML: (k.querySelector('.kb-main') || {}).textContent || '',
            }));

            // 3 グループ、各 2〜3 個をランダムに選んで「くっつける」
            const pool = keys.slice();
            // Fisher-Yates shuffle
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            const modifiedEls = [];
            let idx = 0;
            for (let g = 0; g < 3 && idx < pool.length; g++) {
                const size = 2 + Math.floor(Math.random() * 2); // 2 or 3
                const group = pool.slice(idx, idx + size);
                idx += size;
                if (group.length < 2) break;
                const anchor = group[0];
                const anchorData = anchor.getAttribute('data-key');
                const anchorMain = (anchor.querySelector('.kb-main') || {}).textContent || '';
                group.slice(1).forEach(k => {
                    k.setAttribute('data-key', anchorData);
                    const main = k.querySelector('.kb-main');
                    if (main) main.textContent = anchorMain;
                    // サブ文字 (フリック方向) もアンカーに合わせるより空にする方が整合性高い
                    qa(k, '.kb-sub').forEach(s => { s.textContent = ''; });
                    k.classList.add('gk-w16-glued');
                    modifiedEls.push(k);
                });
                // アンカー自身にも見た目のしるしを付けて「どれが本体か」分かるようにする
                anchor.classList.add('gk-w16-anchor');
                modifiedEls.push(anchor);
            }

            return () => {
                snapshot.forEach(s => {
                    if (!s.el.isConnected) return;
                    if (s.dataKey !== null) s.el.setAttribute('data-key', s.dataKey);
                    const main = s.el.querySelector('.kb-main');
                    if (main) main.textContent = s.mainHTML;
                    s.el.classList.remove('gk-w16-glued', 'gk-w16-anchor');
                });
            };
        },
    };

    // ============================================================
    // Phase 5b Batch 6 — Stage 9 最終バッチ (B21/W08/W18/W20)
    // 全て最高難度帯。Stage 10 の理不尽プールにも組み込まれる。
    // ============================================================

    // --- B21: 即死 ---
    // 不正解で強制ゲームオーバー (残問スキップ → result 画面)。
    // ヘッダ右上に "わずかに気付ける" 赤点を表示 (2〜3周目で気付くバランス)。
    // 実際の "即死" 処理は question.js 側で session.instantDeath フラグを拾って行う。
    const B21_INSTANT_DEATH = {
        id: 'B21', name: '即死', supports: 'both', introducedAt: 9, difficulty: 10,
        apply(ctx) {
            const session = window.GameState?.session;
            if (session) session.instantDeath = true;

            // バレないマーク: ヘッダ右側にひっそり赤い点を光らせる
            const header = q(ctx.screen, '.q-zone-header');
            let mark = null;
            if (header) {
                mark = document.createElement('div');
                mark.className = 'gk-b21-mark';
                header.appendChild(mark);
            }
            return () => {
                if (session) session.instantDeath = false;
                if (mark && mark.parentNode) mark.parentNode.removeChild(mark);
            };
        },
    };

    // --- W08: 文字盤あべこべv2 (キー配置を1文字打つごとに再配置) ---
    // W02 は "ラベルだけ" シャッフルだったが、v2 は DOM 位置そのものを入れ替える。
    // タップしたキーは "そのキーの文字" が入るので、onChange 直後に再配置するとワープ。
    const W08_KEYS_RESHUFFLE = {
        id: 'W08', name: '文字盤あべこべv2', supports: 'input', introducedAt: 9, difficulty: 9,
        conflicts: ['W02', 'W15', 'W16', 'W17', 'W18'],
        apply(ctx) {
            const grid = q(ctx.screen, '.kb-grid');
            if (!grid) return () => {};

            // W15 と同じシンプル実装。DOM ノードを placeholder 経由で入れ替え。
            function swapNodes(a, b) {
                if (a === b) return;
                if (!a.parentNode || !b.parentNode) return;
                const tmp = document.createComment('');
                a.parentNode.insertBefore(tmp, a);
                b.parentNode.insertBefore(a, b);
                tmp.parentNode.insertBefore(b, tmp);
                tmp.remove();
            }

            function shuffleAll() {
                const keys = qa(grid, '.kb-key:not(.kb-fn):not(.kb-empty)');
                if (keys.length < 2) return;
                // Fisher-Yates を DOM swap で実装
                for (let i = keys.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    if (i !== j) swapNodes(keys[i], keys[j]);
                }
            }

            // 初期配置からシャッフルしておく
            shuffleAll();

            // onChange をラップして、入力のたびに再配置
            const kb = window.Keyboard;
            const orig = kb?.getOnChange ? kb.getOnChange() : null;
            if (kb?.setOnChange) {
                kb.setOnChange((val) => {
                    if (orig) orig(val);
                    // 次フレームで再配置 (pointerup の後処理より後)
                    requestAnimationFrame(shuffleAll);
                });
            }

            return () => {
                if (kb?.setOnChange && orig) kb.setOnChange(orig);
                // DOM の並び順はそのまま (次問題で再マウントされるので OK)
            };
        },
    };

    // --- W18: キー消失 (一度押したキーが0.5秒後に消える) ---
    // 押したキーを 0.5s 後に visibility:hidden + pointer-events:none。
    // 打鍵履歴が長くなるほど使えるキーが減って詰み寸前になる鬼畜系。
    // fn キー (OK/BS/モード切替) は対象外 — さすがに OK まで消したら詰むため。
    const W18_KEY_VANISH = {
        id: 'W18', name: 'キー消失', supports: 'input', introducedAt: 9, difficulty: 9,
        conflicts: ['W02', 'W08', 'W15', 'W16', 'W17'],
        apply(ctx) {
            const grid = q(ctx.screen, '.kb-grid');
            if (!grid) return () => {};
            const timers = [];
            const vanished = new Set();

            function onUp(e) {
                const keyEl = e.target.closest('.kb-key');
                if (!keyEl) return;
                if (keyEl.classList.contains('kb-fn') || keyEl.classList.contains('kb-empty')) return;
                if (vanished.has(keyEl)) return;
                const t = setTimeout(() => {
                    keyEl.classList.add('gk-w18-gone');
                    vanished.add(keyEl);
                }, 500);
                timers.push(t);
            }
            grid.addEventListener('pointerup', onUp, true);

            return () => {
                grid.removeEventListener('pointerup', onUp, true);
                timers.forEach(clearTimeout);
                vanished.forEach(k => {
                    if (k && k.isConnected) k.classList.remove('gk-w18-gone');
                });
            };
        },
    };

    // --- W20: フリック方向シャッフル ---
    // flickTransform フックで、上下左右を毎回ランダムに remap。中央タップ(c)は素通り。
    // W19 (反転) と同じフックを使うので conflict。
    const W20_FLICK_SHUFFLE = {
        id: 'W20', name: 'フリック方向シャッフル', supports: 'input', introducedAt: 9, difficulty: 10,
        conflicts: ['W19'],
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb?.setFlickTransform) return () => {};
            const DIRS = ['u', 'd', 'l', 'r'];
            kb.setFlickTransform((dir) => {
                if (dir === 'c' || !dir) return dir;
                return DIRS[Math.floor(Math.random() * DIRS.length)];
            });
            return () => {
                kb.setFlickTransform(null);
            };
        },
    };

    // ---------- Export ----------
    const map = {
        B11_BLASTER, B16_FAKE_COUNTDOWN, B18_FAKE_ERROR,
        B02_TYPEWRITER, B04_ZOOM_CHAOS, B08_FADEOUT, B15_REVERSED_TEXT, B20_BLACKOUT,
        B03_REVERSE, B05_MIRROR, B06_COLOR_BREAK, B07_GLITCH,
        B09_SHRINK, B10_SHUFFLE_TEXT,
        B12_BLUR, B13_TINY, B14_MARGIN_CHAOS, B25_CHAR_OBSTRUCT,
        B01_REVERSE_TAP, B17_NOISE_TEXT,
        C01_SHUFFLE, C02_DUMMY_CHOICE, C03_CHAR_CORRUPT, C04_FAKE_5050,
        W01_KEYS_INVISIBLE, W02_KEYS_SHUFFLE, W03_ANSWER_INVISIBLE, W07_CHAR_DROP,
        W05_CURSOR_WILD, W10_INPUT_DELAY, W14_KEY_HUGE, W17_MODE_AUTO_SWAP, W19_FLICK_REVERSE,
        W04_INPUT_SHIFT, W06_REVERSE_TEXT, W09_GHOST_INPUT, W15_KEY_WARP, W16_KEYS_MERGE,
        B21_INSTANT_DEATH, W08_KEYS_RESHUFFLE, W18_KEY_VANISH, W20_FLICK_SHUFFLE,
    };
    const all = Object.values(map).filter(g => g && g.id);
    window.GimmickRegistry = Object.assign({ all }, map);
})();
