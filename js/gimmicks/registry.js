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
     Stage7: B01, B13, B17, W05, W10, W17, W19  ← Phase 5b-Batch4 (+ B13=5a) ※W14不採用
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

            // 2026-04 調整: 発射間隔 1.5x (休憩 1800〜3500ms → 1200〜2333ms)。
            // 排他発射の厳格ルールは廃止しつつ、同時発射数を 2 本まで cap する。
            // 理由: .gk-b11-core は box-shadow 3 重 + mix-blend-mode + will-change の
            //      GPU 重量級レイヤー。4 本全部が同時に is-fire になると WKWebView の
            //      GPU メモリ枠を超えて iOS がプロセスを kill する
            //      (= 実機で「ビーム連射中に落ちてタイトルに戻る」 症状の原因)。
            //      2 本までなら「被ってもOK」の仕様も満たしつつ安全。
            const MAX_CONCURRENT = 2;
            let concurrentFires = 0;

            function fire(beam) {
                if (!alive) return;
                // 既に 2 本撃ってる場合は少し待って再挑戦 (重なり自体は許容)
                if (concurrentFires >= MAX_CONCURRENT) {
                    schedule(() => fire(beam), 200 + Math.random() * 400);
                    return;
                }
                concurrentFires++;
                window.SE?.fire('gB11Charge');
                beam.classList.add('is-fire');
                schedule(() => window.SE?.fire('gB11Fire'), 600);
                schedule(() => {
                    beam.classList.remove('is-fire');
                    concurrentFires = Math.max(0, concurrentFires - 1);
                    schedule(() => fire(beam), 1200 + Math.random() * 1133);
                }, FIRE_DURATION);
            }

            // 初期ずらしも 1.5x テンポに (i*800 → i*530)
            beams.forEach((beam, i) => {
                schedule(() => fire(beam), 300 + i * 530 + Math.random() * 600);
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
                <span class="gk-b16-num">00:30</span>
            `;
            ctx.screen.appendChild(host);
            const numEl = host.querySelector('.gk-b16-num');
            // 表示 30 秒を 3x 倍速で走らせる → 実時間 10 秒で 00:00 到達。
            // 問題1問の制限時間 (概ね 10〜12 秒) にだいたい噛み合うので
            // 「タイマーと同時に切れそう」 なギリギリの緊張感が出る。
            const TOTAL_MS = 10000;
            const DISPLAY_MAX = 30;
            const startAt = Date.now();
            let alarmed = false;

            // tick 音はループ SE を 3x 倍速で流し続ける (audio.js 側で設定済)。
            window.SE?.fire('gB16Tick');

            const timer = setInterval(() => {
                const remainMs = Math.max(0, TOTAL_MS - (Date.now() - startAt));
                const sec = Math.floor((remainMs / TOTAL_MS) * DISPLAY_MAX);
                const mm = Math.floor(sec / 60).toString().padStart(2, '0');
                const ss = (sec % 60).toString().padStart(2, '0');
                numEl.textContent = `${mm}:${ss}`;
                if (remainMs <= 0) {
                    numEl.textContent = '00:00';
                    if (!alarmed) {
                        alarmed = true;
                        // tick ループを止めてアラームを鳴らす。さらに b17_glitch を
                        // 重ねて「不協和音系」の警告感を追加 (ユーザー要望)。
                        window.SE?.stopNamed('gB16Tick');
                        window.SE?.fire('gB16Alarm');
                        window.SE?.fire('gB17Glitch');
                    }
                    clearInterval(timer);
                }
            }, 100);
            return () => {
                clearInterval(timer);
                // 解答確定などで dispose された時も tick ループを必ず止める
                window.SE?.stopNamed('gB16Tick');
                host.remove();
            };
        },
    };

    // 本物のスマホの「インターネット接続エラー」ダイアログに寄せる。
    // 問題中ずっと表示しっぱなし。背景は暗転、ダイアログは pointer-events:none で
    // 見た目上ブロックされてるように見えるが実際は操作可能 (フェイク)。
    // B18 偽エラー表示: ユーザ評価が特に良いので「全ステージで必ず1回は出す」特別枠。
    // - `excludeFromPool: true` で通常抽選から除外 (二重発生防止)
    // - engine.js 側で session.b18Slot と idx が一致する回に強制適用
    // - DOM は #stage にマウント → B09 (SHRINK) 等 .screen にかかる scale の影響を受けない
    // - 1.5倍表示、z-index 最上位
    const B18_FAKE_ERROR = {
        // input 問題専用。choice 問題だと選択肢上半分を完全に隠してしまい、
        // 正解が上半分にあると当て勘になるため。(stageSelect/result 側の
        // b18Slot 抽選も input-mode のインデックスに限定している)
        id: 'B18', name: '偽エラー表示', supports: 'input', introducedAt: 1, difficulty: 2,
        excludeFromPool: true,
        apply(ctx) {
            const stage = document.getElementById('stage') || document.body;

            const backdrop = document.createElement('div');
            backdrop.className = 'gk-b18-backdrop';

            const alert = document.createElement('div');
            alert.className = 'gk-b18-alert';
            alert.innerHTML = `
                <div class="gk-b18-alert-body">
                    <div class="gk-b18-alert-title">インターネット未接続</div>
                    <div class="gk-b18-alert-msg">
                        ネットワークに接続できませんでした。<br>
                        接続状況をご確認の上、もう一度<br>お試しください。
                    </div>
                </div>
                <div class="gk-b18-alert-actions">
                    <button class="gk-b18-alert-btn" disabled>キャンセル</button>
                    <button class="gk-b18-alert-btn is-primary" disabled>再試行</button>
                </div>
            `;

            stage.appendChild(backdrop);
            stage.appendChild(alert);

            backdrop.style.pointerEvents = 'none';
            alert.style.pointerEvents = 'none';

            // 出現アニメ (iOS っぽく中央でふわっと) + iOS 通知ポップ音
            requestAnimationFrame(() => {
                backdrop.classList.add('is-on');
                alert.classList.add('is-on');
                window.SE?.fire('gB18Notify');
            });

            return () => {
                backdrop.remove();
                alert.remove();
            };
        },
    };

    // --- Stage 2+ ---

    // --- B02: 問題文1文字ずつ (早押しクイズ風) ---
    // 狙い: 「全部出るの待って読んでたら時間を大幅に消費する」 圧をかけるギミック。
    // プレイヤーは読めた部分から推測して早撃ちするか、全文字出揃うまで待って確実に
    // 答えるかのトレードオフを強いられる。
    // → 1文字あたり 360 〜 520ms (前: 90〜130ms) と大幅にスロー化。
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
            // 次の文字までのディレイを毎回ランダム化 (人間のタイピング感)
            function scheduleNext() {
                return setTimeout(() => {
                    if (i >= chars.length) {
                        done = true;
                        return;
                    }
                    stem.textContent = chars.slice(0, i + 1).join('');
                    // タイプライタ音: 2文字に1回 (間隔が広がった分テンポ感を保つ)
                    if (i % 2 === 0) window.SE?.fire('gB02Type');
                    i++;
                    timer = scheduleNext();
                }, 360 + Math.random() * 160);
            }
            let timer = scheduleNext();
            return () => {
                clearTimeout(timer);
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
            window.SE?.fire('gB04Zoom');
            return () => stem.classList.remove('gk-b04-zoom');
        },
    };

    // --- B08: 問題文フェードアウト ---
    // 狙い: 読んでいる間にどんどん薄くなる圧。「早く読まないと消える」 焦り演出。
    // → 4.5s かけて消えていた前実装だと遅すぎて読み切れてしまうので、
    //   開始 300ms + 2.0s フェードで一気に消える仕様に短縮。
    const B08_FADEOUT = {
        id: 'B08', name: 'フェードアウト', supports: 'both', introducedAt: 3, difficulty: 4,
        conflicts: ['B02', 'B12'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const prevTransition = stem.style.transition;
            const prevOpacity = stem.style.opacity;
            stem.style.transition = 'opacity 2.0s linear';
            const timer = setTimeout(() => {
                if (stem.isConnected) stem.style.opacity = '0';
            }, 300);
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
            // 開始 1 秒で発動 → 3 秒真っ暗 → 5〜8 秒休み → 再び 3 秒…
            let showTimer = 0, hideTimer = 0;
            const show = () => {
                host.classList.add('is-on');
                window.SE?.fire('gB20Out');   // 電源OFF カッ
                hideTimer = setTimeout(hide, 3000);
            };
            const hide = () => {
                host.classList.remove('is-on');
                window.SE?.fire('gB20In');    // 起動音 (先頭3s クロップ)
                showTimer = setTimeout(show, 5000 + Math.random() * 3000);
            };
            showTimer = setTimeout(show, 1000);
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
            window.SE?.fire('gB05Mirror');  // シャキーン → b17_glitch 短縮で代用
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

    const B25_CHAR_OBSTRUCT = {
        id: 'B25', name: 'キャラ妨害', supports: 'both', introducedAt: 5, difficulty: 5,
        apply(ctx) {
            const SPRITES = [
                'sprite/girl/basic.png', 'sprite/girl/happy.png',
                'sprite/girl/hi.png', 'sprite/girl/think.png', 'sprite/girl/think_light.png',
            ];
            // 2026-04 調整: キャラ 1.5x スケール (360→540, 640→960 ほか全係数を1.5倍)
            const CHAR_H   = 540;   // 画像高さ (px, 仮想座標) ※ CSS height:540px; width:auto
            const CHAR_W   = 960;   // 画像幅 (1920×1080→高さ540表示時: 540/1080*1920=960)
            const PEEK     = 450;   // 頭が覗き込む量 (px)
            const PAD      = 120;   // 退場時の追加オフセット
            const SCREEN_W = 1080;
            const CX0 = CHAR_W / 2; // 320
            const CY0 = CHAR_H / 2; // 180

            const timers = new Set();
            let alive = true;
            let spriteIdx = 0;

            function schedule(fn, delay) {
                const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, delay);
                timers.add(t);
            }

            function getBoundaryY() {
                const zone = ctx.screen.querySelector('.q-zone-answer');
                if (!zone) return 1050;
                const sr = ctx.screen.getBoundingClientRect();
                const zr = zone.getBoundingClientRect();
                const scale = sr.width / SCREEN_W;
                return scale > 0 ? (zr.top - sr.top) / scale : 1050;
            }

            // 8方向テーブル。Rは rotate の角度(deg)。
            // headDir = (sin(R), -cos(R)) がPNG上辺(頭)の向く画面方向。
            // PNG下辺(足)は常に壁に向き、隙間ゼロで貼り付く。
            // bx/by は境界上の基点。全位置決めは transform のみ (left/top=0固定)。
            function getDirs(boundaryY) {
                const SW = SCREEN_W;
                return [
                    { R:   90, bx: () => 0,  by: () => CX0 + Math.random()*Math.max(0, boundaryY-CHAR_W) },       // 左
                    { R:  135, bx: () => 0,  by: () => Math.random()*boundaryY*0.3 },                              // 上-左
                    { R:  180, bx: () => CX0 + Math.random()*(SW-CHAR_W),             by: () => 0 },               // 上
                    { R: -135, bx: () => SW, by: () => Math.random()*boundaryY*0.3 },                              // 上-右
                    { R:  -90, bx: () => SW, by: () => CX0 + Math.random()*Math.max(0, boundaryY-CHAR_W) },       // 右
                ];
            }

            function spawnChar() {
                if (!alive) return;
                const boundaryY = getBoundaryY();
                const dirs = getDirs(boundaryY);
                const { R, bx: bxFn, by: byFn } = dirs[Math.floor(Math.random() * dirs.length)];
                const bx = bxFn(), by = byFn();

                const img = document.createElement('img');
                img.src = SPRITES[spriteIdx % SPRITES.length];
                spriteIdx++;
                img.draggable = false;
                img.className = 'gk-b25-char';
                img.style.left = '0';
                img.style.top  = '0';

                const rad = R * Math.PI / 180;
                const hdx = Math.sin(rad);   // 頭方向 x
                const hdy = -Math.cos(rad);  // 頭方向 y

                // visible: 頭が境界からPEEK内側 (PEEK_OFS = PEEK - CY0 = 120)
                const PEEK_OFS = PEEK - CY0;
                const vcx = bx + hdx * PEEK_OFS;
                const vcy = by + hdy * PEEK_OFS;

                // hidden: 頭まで壁の外に退場 (HIDE_OFS = CY0 + PAD = 260)
                const HIDE_OFS = CY0 + PAD;
                const hcx = bx - hdx * HIDE_OFS;
                const hcy = by - hdy * HIDE_OFS;

                const vtx = Math.round(vcx - CX0), vty = Math.round(vcy - CY0);
                const htx = Math.round(hcx - CX0), hty = Math.round(hcy - CY0);

                const visibleT = `translate(${vtx}px,${vty}px) rotate(${R}deg)`;
                const hiddenT  = `translate(${htx}px,${hty}px) rotate(${R}deg)`;

                img.style.transform = hiddenT;
                ctx.screen.appendChild(img);

                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (!alive) { img.remove(); return; }
                    img.style.transform = visibleT;
                    window.SE?.fire('gB25Pop');  // ポップ → b18_notify (iOS通知) で代用
                }));

                schedule(() => {
                    img.style.transform = hiddenT;
                    schedule(() => img.remove(), 450);
                }, 800 + Math.random() * 700);
            }

            function loop() {
                spawnChar();
                schedule(loop, 400 + Math.random() * 600);
            }

            // 3本並列ループでモグラ叩き的に連続出現
            schedule(loop, 100);
            schedule(loop, 500);
            schedule(loop, 950);

            return () => {
                alive = false;
                timers.forEach(clearTimeout);
                timers.clear();
                ctx.screen.querySelectorAll('.gk-b25-char').forEach(el => el.remove());
            };

        },
    };

    // --- B07: グリッチ (問題文が文字化けしたり戻ったりする) ---
    // 狙い: 大半の時間は化けてて、たまに正気に戻る瞬間に読む必要がある緊張感。
    // 回転頻度: 250〜450ms に1ティック (前: 600〜1300ms)。
    // 化け確率: 70% (前: 30%) → 半分以上の時間は読めない状態に。
    const B07_GLITCH = {
        id: 'B07', name: 'グリッチ', supports: 'both', introducedAt: 2, difficulty: 3,
        conflicts: ['B12', 'B13'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            const noise = ['█', '▓', '▒', '░', '◊', '#', '@', '&', '%', '?', '*', '/'];

            window.SE?.fire('gGlitchLoop');

            let tickTimer = 0;
            let restoreTimer = 0;
            let glitchSfxCooldown = 0; // SE 連打防止 (視覚は高速回転、音は抑制)
            const tick = () => {
                if (Math.random() < 0.7) {
                    let out = '';
                    for (const ch of original) {
                        out += Math.random() < 0.45
                            ? noise[Math.floor(Math.random() * noise.length)]
                            : ch;
                    }
                    stem.textContent = out;
                    // glitch SE は 3 ティックに 1 回程度 (でないと壊れたラジオ状態になる)
                    if (--glitchSfxCooldown <= 0) {
                        window.SE?.fire('gB17Glitch');
                        glitchSfxCooldown = 3;
                    }
                    clearTimeout(restoreTimer);
                    // 復元も速め (120ms) にして「読める瞬間」がチラつく感じに
                    restoreTimer = setTimeout(() => {
                        if (stem.isConnected) stem.textContent = original;
                    }, 120);
                }
                tickTimer = setTimeout(tick, 250 + Math.random() * 200);
            };
            tickTimer = setTimeout(tick, 200);
            return () => {
                clearTimeout(tickTimer);
                clearTimeout(restoreTimer);
                window.SE?.stopNamed('gGlitchLoop');
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
            // 12px は強すぎて読めなくなるので 9px に。
            stem.style.filter = `${prev ? prev + ' ' : ''}blur(9px)`;
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

    // --- B01 反転タップ (2026-04 仕様変更) ---
    // 裏側の選択処理には一切触らず、「見た目だけ」反転させる純粋CSSギミック。
    // プレイヤーがタップした選択肢には is-selected が普通に付くが、
    // .gk-b01-reverse クラス配下では CSS で is-selected ↔ :not(.is-selected) の
    // 視覚スタイルが入れ替わる。
    //
    // 結果: タップした選択肢だけが通常見た目、他3つが「選択されてる風」に光る。
    //       プレイヤー視点「俺が押したのになぜか他が光ってる」= 反転タップ認知。
    //       判定は普通に「タップした方」で処理される (理不尽ではなくフェア)。
    const B01_REVERSE_TAP = {
        id: 'B01', name: '反転タップ', supports: 'choice', introducedAt: 7, difficulty: 8,
        // C01 はシャッフル済みで反転の意味が薄くなる
        conflicts: ['C01'],
        apply(ctx) {
            ctx.screen.classList.add('gk-b01-reverse');
            return () => {
                ctx.screen.classList.remove('gk-b01-reverse');
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
            function randStr(minLen, maxLen) {
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
            // 本物の行にもノイズを前後・内部に混ぜて紛れ込ませる:
            // 「本物行だけ左端から始まる/予測可能な位置」の手掛かりを潰す。
            // 行数も増やし、インデントをランダム化。本物は任意の行に配置。
            const LINES = 16;
            const realLineIdx = Math.floor(Math.random() * LINES);

            function realLine() {
                const pre = randStr(2, 6);
                const post = randStr(2, 6);
                return `${pre}${originalText}${post}`;
            }
            const out = [];
            for (let i = 0; i < LINES; i++) {
                const indent = Math.floor(Math.random() * 140);  // 0..140px
                const style = `padding-left:${indent}px;`;
                if (i === realLineIdx) {
                    out.push(`<span class="gk-b17-line gk-b17-real" style="${style}">${esc(realLine())}</span>`);
                } else {
                    out.push(`<span class="gk-b17-line" style="${style}">${esc(randStr(8, 26))}</span>`);
                }
            }
            stem.classList.add('gk-b17-noise');
            stem.innerHTML = out.join('');
            window.SE?.fire('gB17Glitch');
            return () => {
                stem.className = prevClasses;
                stem.innerHTML = originalHTML;
            };
        },
    };

    const B13_TINY = {
        id: 'B13', name: 'フォント極小', supports: 'both', introducedAt: 7, difficulty: 7,
        // B17: stem inline fontSize=14px が .gk-b17-line の 34px(CSS)を上書き → B17難度弱化
        conflicts: ['B17'],
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
                window.SE?.fire('gC01Shuffle');  // 琴 → w15_warp 頭0.4s 代用
            }, 1000);
            return () => clearInterval(timer);
        },
    };

    // C02 ダミー選択肢:
    // 旧実装は「src の textContent をそっくり dst にコピー」だったので、
    // 2 つの選択肢が "1 文字も違わない完全一致" になっていた
    // → どちらが正解か見分ける手段が文字通りゼロ、完全に運ゲー (ユーザー指摘バグ)。
    //
    // 新実装: src のラベルを "微改変" して dst に貼る。
    //   改変候補を複数試し、[改変後] が [src原本] と異なり かつ [他選択肢のいずれとも異なる]
    //   ものを採用。短文/改変不能な場合は末尾に記号を 1 つ足す safe fallback。
    //   「似てるけどよく見れば違う」ダミーを生成することで、よく読んだ者が正解できる
    //   「焦り系」ギミックに戻る。
    const C02_DUMMY_CHOICE = {
        id: 'C02', name: 'ダミー選択肢', supports: 'choice', introducedAt: 6, difficulty: 7,
        apply(ctx) {
            const btns = qa(ctx.screen, '.q-choice');
            if (btns.length < 2) return () => {};
            const srcIdx = Math.floor(Math.random() * btns.length);
            let dstIdx;
            do { dstIdx = Math.floor(Math.random() * btns.length); } while (dstIdx === srcIdx);
            const dst = btns[dstIdx];
            const src = btns[srcIdx];
            const originalText = dst.textContent;

            // 他の選択肢 (src と dst 以外) のテキスト集合。生成したダミーが
            // これらと衝突する場合はもう一度別戦略で作り直す。
            const otherTexts = new Set(
                btns.filter((b, i) => i !== srcIdx && i !== dstIdx)
                    .map(b => b.textContent)
            );

            const dummyText = makeSimilarDummy(src.textContent, otherTexts);
            dst.textContent = dummyText;
            dst.classList.add('gk-c02-dummy');
            window.SE?.fire('gB25Pop');
            return () => {
                dst.textContent = originalText;
                dst.classList.remove('gk-c02-dummy');
            };
        },
    };

    // ---- C02 ダミー文字生成ヘルパ ----
    // 似てるけど違う」を安定して作るための複数戦略。
    // どの戦略も「元と異なる かつ 他選択肢と被らない」ものだけ採用する。
    const DAKUTEN_PAIRS = (() => {
        const m = {
            'か':'が','き':'ぎ','く':'ぐ','け':'げ','こ':'ご',
            'さ':'ざ','し':'じ','す':'ず','せ':'ぜ','そ':'ぞ',
            'た':'だ','ち':'ぢ','つ':'づ','て':'で','と':'ど',
            'は':'ば','ひ':'び','ふ':'ぶ','へ':'べ','ほ':'ぼ',
            'カ':'ガ','キ':'ギ','ク':'グ','ケ':'ゲ','コ':'ゴ',
            'サ':'ザ','シ':'ジ','ス':'ズ','セ':'ゼ','ソ':'ゾ',
            'タ':'ダ','チ':'ヂ','ツ':'ヅ','テ':'デ','ト':'ド',
            'ハ':'バ','ヒ':'ビ','フ':'ブ','ヘ':'ベ','ホ':'ボ',
        };
        Object.keys(m).slice().forEach(k => { m[m[k]] = k; });
        return m;
    })();
    const SMALL_PAIRS = (() => {
        const m = {
            'や':'ゃ','ゆ':'ゅ','よ':'ょ','つ':'っ',
            'あ':'ぁ','い':'ぃ','う':'ぅ','え':'ぇ','お':'ぉ',
            'ヤ':'ャ','ユ':'ュ','ヨ':'ョ','ツ':'ッ',
            'ア':'ァ','イ':'ィ','ウ':'ゥ','エ':'ェ','オ':'ォ',
        };
        Object.keys(m).slice().forEach(k => { m[m[k]] = k; });
        return m;
    })();

    function makeSimilarDummy(src, excludeSet) {
        const tried = [];
        const strategies = [
            strategyToggleDakuten,
            strategyToggleSmall,
            strategySwapAdjacent,
            strategyReplaceChar,
            strategyAppendMark,
        ];
        // 戦略をランダム順に試す
        strategies.sort(() => Math.random() - 0.5);
        for (const strat of strategies) {
            const out = strat(src);
            if (!out || out === src) continue;
            if (excludeSet.has(out)) continue;
            return out;
        }
        // どうしても作れないとき (超短い/記号だけ等) のフォールバック
        const marks = ['…', '。', ' ', '　'];
        for (const mk of marks) {
            const out = src + mk;
            if (out !== src && !excludeSet.has(out)) return out;
        }
        return src + '?';  // 最終手段: どうあがいても src とは別のはず
    }

    // [1] 濁点/半濁点を 1 箇所トグル
    function strategyToggleDakuten(s) {
        const positions = [];
        for (let i = 0; i < s.length; i++) {
            if (DAKUTEN_PAIRS[s[i]]) positions.push(i);
        }
        if (!positions.length) return null;
        const p = positions[Math.floor(Math.random() * positions.length)];
        return s.slice(0, p) + DAKUTEN_PAIRS[s[p]] + s.slice(p + 1);
    }
    // [2] 小書きをトグル (や↔ゃ 等)
    function strategyToggleSmall(s) {
        const positions = [];
        for (let i = 0; i < s.length; i++) {
            if (SMALL_PAIRS[s[i]]) positions.push(i);
        }
        if (!positions.length) return null;
        const p = positions[Math.floor(Math.random() * positions.length)];
        return s.slice(0, p) + SMALL_PAIRS[s[p]] + s.slice(p + 1);
    }
    // [3] 隣接 2 文字の入れ替え
    function strategySwapAdjacent(s) {
        if (s.length < 2) return null;
        const p = Math.floor(Math.random() * (s.length - 1));
        return s.slice(0, p) + s[p + 1] + s[p] + s.slice(p + 2);
    }
    // [4] 1 文字を似た別文字に置換 (ー ↔ 一, O ↔ 0 等の視覚類似)
    function strategyReplaceChar(s) {
        const HOMO = {
            'ー':'一', '一':'ー', 'O':'0', '0':'O', 'l':'1', '1':'l',
            'い':'り', 'り':'い', 'こ':'二', '二':'こ', 'ロ':'口', '口':'ロ',
        };
        const positions = [];
        for (let i = 0; i < s.length; i++) {
            if (HOMO[s[i]]) positions.push(i);
        }
        if (!positions.length) return null;
        const p = positions[Math.floor(Math.random() * positions.length)];
        return s.slice(0, p) + HOMO[s[p]] + s.slice(p + 1);
    }
    // [5] 末尾に微小な記号を付加
    function strategyAppendMark(s) {
        const marks = ['。', '、', '…', '!', '?'];
        return s + marks[Math.floor(Math.random() * marks.length)];
    }

    const C04_FAKE_5050 = {
        id: 'C04', name: '嘘50:50', supports: 'choice', introducedAt: 8, difficulty: 6,
        conflicts: ['C01'],
        apply(ctx) {
            const btns = qa(ctx.screen, '.q-choice');
            if (btns.length < 4) return () => {};
            // 見た目だけのギミック: タップは有効のままにしておく (騙し要素)
            // pointer-events を残すと「あれ、消えてるのに押せるぞ…？」という錯乱が生まれる
            const pool = btns.map((_, i) => i).sort(() => Math.random() - 0.5);
            const picked = pool.slice(0, 2);
            picked.forEach(i => {
                btns[i].style.opacity = '0.22';
                btns[i].style.filter = 'grayscale(1)';
            });
            return () => {
                picked.forEach(i => {
                    if (!btns[i]) return;
                    btns[i].style.opacity = '';
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
            let ticks = 0;
            const timer = setInterval(() => {
                const alive = states.filter(s => s.btn.isConnected);
                if (alive.length === 0) return;
                const s = alive[Math.floor(Math.random() * alive.length)];
                if (s.chars.length === 0) return;
                const pos = Math.floor(Math.random() * s.chars.length);
                s.chars[pos] = noiseCh();
                s.btn.textContent = s.chars.join('');
                // 2ティックに1回グリッチ音 (鳴らしすぎ防止)
                if (ticks++ % 2 === 0) window.SE?.fire('gB17Glitch');
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

    // W02 文字盤あべこべ: 旧実装は「ラベルだけシャッフル、タップは元の key を出力」
    // だったが、実機テストでユーザが「タップしたのが反映されない」と混乱。
    // → WYSIWYG 化: タップした瞬間に見えているラベルの文字を出力するように、
    //   data-key JSON 自体を入れ替える方式に変更。
    // 定期的にシャッフル。ただし「指が下りている最中」はシャッフルを保留。
    // 英/日モード切替 (Keyboard の再 render) 後も postRender フックで再適用。
    const W02_KEYS_SHUFFLE = {
        id: 'W02', name: '文字盤あべこべ', supports: 'input', introducedAt: 6, difficulty: 7,
        conflicts: ['W08', 'W18'],
        apply(ctx) {
            const shuffleAll = () => {
                const keys = qa(ctx.screen, '.kb-key:not(.kb-fn):not(.kb-empty)');
                if (keys.length < 2) return;
                // 各キーの data-key JSON と表示ラベル (.kb-main) を一括取得
                const records = keys.map(k => ({
                    el: k,
                    json: k.getAttribute('data-key'),
                    main: k.querySelector('.kb-main')?.textContent ?? '',
                }));
                // シャッフル先 index
                const order = records.map((_, i) => i);
                for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                order.forEach((srcI, dstI) => {
                    const src = records[srcI];
                    const dst = records[dstI].el;
                    if (src.json) dst.setAttribute('data-key', src.json);
                    const mainEl = dst.querySelector('.kb-main');
                    if (mainEl) mainEl.textContent = src.main;
                });
            };
            const trySchedule = () => {
                if (window.Keyboard?.isDragging?.()) return;   // タップ中は保留
                shuffleAll();
            };
            shuffleAll();
            const timer = setInterval(trySchedule, 2800);
            const unreg = window.Keyboard?.addPostRender?.(shuffleAll);
            return () => {
                clearInterval(timer);
                if (typeof unreg === 'function') unreg();
            };
        },
    };

    // --- W07: 入力1文字消失 (表示から落とすだけ) ---
    // 【重要】buffer は触らない。droppedIdx に入れた index を "表示上" 抜いて渡す。
    // プレイヤーは「売ったはずの文字が消えた」と錯覚するが、
    // 実際には buffer には残っており、OK を押せば判定は通る。
    const W07_CHAR_DROP = {
        id: 'W07', name: '入力1文字消失', supports: 'input', introducedAt: 6, difficulty: 7,
        conflicts: ['W04', 'W09'],
        apply(ctx) {
            const droppedIdx = new Set();
            let currentBuffer = '';
            let origHandler = null;

            function refresh() {
                const arr = Array.from(currentBuffer);
                const out = arr.filter((_, i) => !droppedIdx.has(i));
                if (origHandler) origHandler(out.join(''));
            }

            const unwrap = wrapOnChange((orig) => {
                origHandler = orig;
                return (val) => {
                    currentBuffer = val;
                    // 範囲外になった index は除去 (backspace で buffer が縮んだ場合)
                    for (const i of [...droppedIdx]) {
                        if (i >= val.length) droppedIdx.delete(i);
                    }
                    refresh();
                };
            });

            const schedule = () => {
                return setTimeout(() => {
                    const available = [];
                    for (let i = 0; i < currentBuffer.length; i++) {
                        if (!droppedIdx.has(i)) available.push(i);
                    }
                    if (available.length > 0) {
                        const pick = available[Math.floor(Math.random() * available.length)];
                        droppedIdx.add(pick);
                        refresh();
                    }
                    timer = schedule();
                }, 1600 + Math.random() * 800);
            };
            let timer = schedule();

            return () => {
                clearTimeout(timer);
                unwrap();
            };
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

    // --- Stage 8 プール (Input) ---
    // (2026-04 整理) W05/W10/W14/W17/W19 は実機テストで
    // 「気づかれない」「狙いと違う」等の理由で廃止。

    // あいうえお 行内で「1個前の音」へ戻すマップ (循環)。
    // 以前は行頭を不動にしていたが、そのせいで各行末文字 (お,こ,そ,と,の,ほ,も,よ,ろ,ん)
    // が完全に到達不能になり、答えにそれらを含む問題が物理的に解けなかった。
    // 循環 (行末 → 行頭 → ...) にすることで全文字に到達可能を保証する。
    //   例) あいうえお: あ→お, い→あ, う→い, え→う, お→え
    //   プレイヤーは「狙いの文字より1個後ろの音」をタップすれば目的文字を出せる。
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
            const n = arr.length;
            for (let i = 0; i < n; i++) {
                // i=0 (行頭) は行末へ (循環)
                m[arr[i]] = arr[(i - 1 + n) % n];
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

    // --- W04: 入力ズレ (表示上だけ 1 段ずらす) ---
    // 【重要】buffer は触らない。onChange の表示文字列だけ各文字を w04ShiftChar で
    // 1 段ずらす。OK 判定は buffer (= 売った順) で行われるので、プレイヤーは
    // 自分の入力を信じて OK するのが正攻法。見た目上は全く違う文字列に見える。
    const W04_INPUT_SHIFT = {
        id: 'W04', name: '入力ズレ', supports: 'input', introducedAt: 8, difficulty: 9,
        // onChange ラップの重複回避 + フリック方向弄り系とは別軸なので併用不可
        // (フリックで既に狂ってる文字がさらに見た目上ずれると解法が成立しない)
        conflicts: ['W06', 'W07', 'W09', 'W20'],
        apply(ctx) {
            const unwrap = wrapOnChange((orig) => (val) => {
                const shifted = Array.from(val).map(ch => w04ShiftChar(ch)).join('');
                if (orig) orig(shifted);
            });
            return unwrap;
        },
    };

    // --- W06: 文字順逆転 (表示だけ反転) ---
    // buffer は触らず、onChange に流す表示用値だけ reverse。
    // OK 判定は buffer (= 売った順) で行われるので「自分の入力を信じる」ゲーム。
    // 他の表示変形系 (W04/W05/W07/W09/W10) とは重ねると意味不明なので排他。
    const W06_REVERSE_TEXT = {
        id: 'W06', name: '文字順逆転', supports: 'input', introducedAt: 8, difficulty: 8,
        conflicts: ['W04', 'W07', 'W09'],
        apply(ctx) {
            const unwrap = wrapOnChange((orig) => (val) => {
                const reversed = Array.from(val).reverse().join('');
                if (orig) orig(reversed);
            });
            return unwrap;
        },
    };

    // --- W09: ゴースト入力 (表示にだけノイズ文字を挿入) ---
    // 【重要】buffer は触らない。ghosts 配列に {pos, ch} を溜めて、
    // onChange の表示文字列にだけ挿入する。OK 時は buffer (= 売った順) で判定。
    // プレイヤーは「勝手に変な文字が混ざる」と感じるが、自分の入力を信じて
    // OK すれば正解になる。
    const W09_GHOST_INPUT = {
        id: 'W09', name: 'ゴースト入力', supports: 'input', introducedAt: 8, difficulty: 8,
        conflicts: ['W04', 'W06', 'W07'],
        apply(ctx) {
            const NOISE = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょっゞゟヰヱヶ';
            const noiseCh = () => NOISE[Math.floor(Math.random() * NOISE.length)];

            // ghosts[k] = { pos, ch } — pos は buffer 配列内での挿入位置 (0..buffer.length)
            let ghosts = [];
            let currentBuffer = '';
            let origHandler = null;

            function buildDisplay() {
                const arr = Array.from(currentBuffer);
                // pos 降順で挿入して index ずれを回避
                const sorted = ghosts.slice().sort((a, b) => b.pos - a.pos);
                const out = arr.slice();
                for (const g of sorted) {
                    const p = Math.min(Math.max(g.pos, 0), out.length);
                    out.splice(p, 0, g.ch);
                }
                return out.join('');
            }
            function refresh() {
                if (origHandler) origHandler(buildDisplay());
            }

            const unwrap = wrapOnChange((orig) => {
                origHandler = orig;
                return (val) => {
                    currentBuffer = val;
                    // buffer が縮んだ場合 ghost の pos が範囲外になるので繋ぎ止める
                    ghosts.forEach(g => {
                        if (g.pos > val.length) g.pos = val.length;
                    });
                    refresh();
                };
            });

            // 4〜6 秒に1回、ゴーストを1個足す (表示が 20 字超えないよう制限)
            const schedule = () => {
                return setTimeout(() => {
                    if (currentBuffer.length + ghosts.length < 20) {
                        const pos = Math.floor(Math.random() * (currentBuffer.length + 1));
                        ghosts.push({ pos, ch: noiseCh() });
                        refresh();
                    }
                    timer = schedule();
                }, 4000 + Math.random() * 2000);
            };
            let timer = schedule();

            return () => {
                clearTimeout(timer);
                unwrap();
            };
        },
    };

    // ============================================================
    // Phase 5b Batch 6 — Stage 9 最終バッチ (B21/W08/W18/W20)
    // 全て最高難度帯。Stage 10 の理不尽プールにも組み込まれる。
    // ============================================================

    // --- 即死モード共通演出 (B21/G1 から呼ぶ) ---
    // 2026-04 トーンダウン改修: 激しいVHSで酔うクレーム懸念があったため、
    // 動きと点滅を大幅に抑えつつ「絶望感」は血のじわじわ演出で別方向から維持。
    //
    // 1. .gk-instant-death クラスで全UI赤化 + 周縁赤グロー (CSSで低頻度パルス)
    // 2. ::before でスクリーン上端から血が滴り落ちる静か演出 (20〜24秒でじわじわ)
    // 3. VHS tearing (横揺れ) は撤廃。RGB split だけを低頻度 (5〜8秒に1回) で薄く
    //    一瞬差し込んで "壊れてる" 違和感だけ残す。
    function applyDeathMode(screen) {
        screen.classList.add('gk-instant-death');
        const stage = document.getElementById('stage');
        let dead = false;
        let nextTimer = null;

        function fireVhs() {
            if (dead || !stage) return;
            stage.classList.remove('fx-vhs-rgb');
            requestAnimationFrame(() => {
                if (dead) return;
                stage.classList.add('fx-vhs-rgb');
                setTimeout(() => { if (stage) stage.classList.remove('fx-vhs-rgb'); }, 420);
            });
            // 発火間隔を 0.9〜2.0s → 5.0〜8.0s に大幅間引き
            nextTimer = setTimeout(fireVhs, 5000 + Math.random() * 3000);
        }
        // 初回も遅らせる (問題を認識する余白を確保)
        nextTimer = setTimeout(fireVhs, 1200 + Math.random() * 800);

        return () => {
            dead = true;
            clearTimeout(nextTimer);
            screen.classList.remove('gk-instant-death');
            if (stage) stage.classList.remove('fx-vhs-tearing', 'fx-vhs-rgb');
        };
    }

    // --- B21: 即死 ---
    // 不正解で強制ゲームオーバー (残問スキップ → result 画面)。
    // 全UI赤化 + VHS高頻度グリッチで「この問題はやばい」を全力で伝える。
    // 実際の "即死" 処理は question.js 側で session.instantDeath フラグを拾って行う。
    const B21_INSTANT_DEATH = {
        id: 'B21', name: '即死', supports: 'both', introducedAt: 9, difficulty: 10,
        apply(ctx) {
            const session = window.GameState?.session;
            if (session) session.instantDeath = true;
            const cleanupDeath = applyDeathMode(ctx.screen);
            return () => {
                if (session) session.instantDeath = false;
                cleanupDeath();
            };
        },
    };

    // --- W08: 文字盤あべこべv2 (キー配置を1文字打つごとに再配置) ---
    // W02 は "ラベルだけ" シャッフルだったが、v2 は DOM 位置そのものを入れ替える。
    // タップしたキーは "そのキーの文字" が入るので、onChange 直後に再配置するとワープ。
    const W08_KEYS_RESHUFFLE = {
        id: 'W08', name: '文字盤あべこべv2', supports: 'input', introducedAt: 9, difficulty: 9,
        conflicts: ['W02', 'W18'],
        apply(ctx) {
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
                const grid = q(ctx.screen, '.kb-grid');
                if (!grid) return;
                const keys = qa(grid, '.kb-key:not(.kb-fn):not(.kb-empty)');
                if (keys.length < 2) return;
                for (let i = keys.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    if (i !== j) swapNodes(keys[i], keys[j]);
                }
            }
            shuffleAll();
            const kb = window.Keyboard;
            const orig = kb?.getOnChange ? kb.getOnChange() : null;
            if (kb?.setOnChange) {
                kb.setOnChange((val) => {
                    if (orig) orig(val);
                    // タップ中はシャッフルしない (ユーザ視点のキーが急に動くのを防止)
                    requestAnimationFrame(() => {
                        if (kb?.isDragging?.()) return;
                        shuffleAll();
                    });
                });
            }
            // ABC ↔ あいう モード切替後も DOM を再シャッフル (ギミック継続)
            const unreg = kb?.addPostRender?.(shuffleAll);
            return () => {
                if (kb?.setOnChange && orig) kb.setOnChange(orig);
                if (typeof unreg === 'function') unreg();
            };
        },
    };

    // --- W18: キー消失 (一度押したキーが0.5秒後に消える) ---
    // 押したキーを 0.5s 後に visibility:hidden + pointer-events:none。
    // 打鍵履歴が長くなるほど使えるキーが減って詰み寸前になる鬼畜系。
    // fn キー (OK/BS/モード切替) は対象外 — さすがに OK まで消したら詰むため。
    const W18_KEY_VANISH = {
        id: 'W18', name: 'キー消失', supports: 'input', introducedAt: 9, difficulty: 9,
        conflicts: ['W02', 'W08'],
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
        conflicts: [],
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

    // ============================================================
    // Phase 5-Special — Stage 10 理不尽ギミック G1-G8
    // 親仕様書 5章。Stage 10 専用プール (CONFIG.STAGE10_POOL) からのみ抽選。
    // supports は全て 'both' or 'choice' とし、input モードでも破綻しない設計。
    // ============================================================

    // --- G1: 即死 (間違えたら即ゲームオーバー) ---
    // B21 と同じく不正解で強制ゲームオーバー。
    // B21 との違い: Stage 10 専用で赤UI演出は同じだが gk-b21-mark は出さない。
    // (Stage 10 まで来たプレイヤーへの「また来たか」という絶望を演出)
    const G1_RANDOM_DEATH = {
        id: 'G1', name: '即死(隠し)', supports: 'both', introducedAt: 10, difficulty: 10,
        apply(ctx) {
            const session = window.GameState?.session;
            if (session) session.instantDeath = true;
            const cleanupDeath = applyDeathMode(ctx.screen);
            return () => {
                if (session) session.instantDeath = false;
                cleanupDeath();
            };
        },
    };

    // --- G4: 文字化け ---
    // 50% の確率で発動。発動時、問題文を Unicode 記号・ギリシャ文字・ラテン拡張等に
    // 置換して「読めないけど何となく推測するゲー」にする。
    // 文字数はほぼ元と同じ。空白は保持 (単語区切りを残すと推測しやすい = 難易度調整)。
    const G4_GARBLED_TEXT = {
        id: 'G4', name: '文字化け問題', supports: 'both', introducedAt: 10, difficulty: 9,
        conflicts: ['B02', 'B07', 'B08', 'B10', 'B15', 'B17'], // stem.textContent を触る他
        apply(ctx) {
            if (Math.random() >= 0.5) return () => {};
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            const GARBLE = '▓▒░█▌▐▄▀■□●○◆◇★☆※§¶†‡◘◙♪♫∴∵∞≒≠±∫∮∑∏√';

            const makeGarbled = () => Array.from(original).map(ch => {
                if (/\s/.test(ch)) return ch;
                return GARBLE[Math.floor(Math.random() * GARBLE.length)];
            }).join('');

            // 化けた状態(長め) ↔ 原文(短い "読める窓") を交互に。
            // - 化け期間: 900〜1300ms (長く, 全文字入れ替え → B07より強い難度)
            // - 読める窓: 150〜230ms (一瞬だけ覗ける)
            // 70%くらいが化け状態なので体感「ほぼずっと文字化け」、
            // でも秒1ペースで原文が一瞬見える = 推測ゲーとして成立
            let timer = 0;
            let phase = 'garble';
            let sfxCooldown = 0;

            const step = () => {
                if (!stem.isConnected) return;
                if (phase === 'garble') {
                    stem.textContent = makeGarbled();
                    if (--sfxCooldown <= 0) {
                        window.SE?.fire('gB17Glitch');
                        sfxCooldown = 2;
                    }
                    phase = 'peek';
                    timer = setTimeout(step, 900 + Math.random() * 400);
                } else {
                    stem.textContent = original;
                    phase = 'garble';
                    timer = setTimeout(step, 150 + Math.random() * 80);
                }
            };
            // 初期: 化けた状態でスタート
            stem.textContent = makeGarbled();
            window.SE?.fire('gB17Glitch');
            sfxCooldown = 2;
            phase = 'peek';
            timer = setTimeout(step, 900 + Math.random() * 400);

            return () => {
                clearTimeout(timer);
                if (stem.isConnected) stem.textContent = original;
            };
        },
    };

    // --- G5: 選択肢ワープ (2026-04 仕様変更) ---
    // 最初の選択肢タップから 350ms 後に、選択が時計回りの隣に「勝手にワープ」する。
    // ただし 1問1回だけ発動 (2回目以降の選択肢変更はワープしない)。
    // プレイヤーが気づいて元の選択肢を押し直せば、普通に正解できる仕様。
    // 「タップしたのに他の選択肢が光ってる、あれ?」→ 気づいて戻せるフェアさ。
    const G5_CHOICE_WARP = {
        id: 'G5', name: '選択肢ワープ', supports: 'choice', introducedAt: 10, difficulty: 10,
        // C02 ダミー: ダミー選択肢を拾うと click 再送で selectedIdx が不整合になる
        conflicts: ['C02'],
        apply(ctx) {
            const choices = qa(ctx.screen, '.q-choice');
            if (choices.length < 2) return () => {};
            const grid = q(ctx.screen, '.q-choices') || ctx.screen;
            let warped = false;      // 1問1回限定フラグ
            let warpTimer = 0;

            function onPick(e) {
                if (warped) return;
                const btn = e.target.closest('.q-choice');
                if (!btn) return;
                const cur = choices.indexOf(btn);
                if (cur < 0) return;
                // 2×2グリッドの時計回り: 0→1→3→2→0
                const CW = [1, 3, 0, 2];
                const nextIdx = CW[cur] ?? ((cur + 1) % choices.length);
                const next = choices[nextIdx];
                if (!next || next === btn) return;
                warped = true;
                // 通常のタップ処理(選択反映)が済んだ後にワープ
                warpTimer = setTimeout(() => {
                    if (!next.isConnected) return;
                    next.click();
                    window.SE?.fire('gW15Warp');  // AUDIO_INDEX: G5 → w15_warp 流用
                }, 350);
            }

            grid.addEventListener('click', onPick);
            return () => {
                clearTimeout(warpTimer);
                grid.removeEventListener('click', onPick);
            };
        },
    };

    // --- G7: スコア煽り ---
    // 今回は "session フラグを立てるだけ" のシンプル実装。
    // 実際のアニメは result.js がフラグを拾って描画する。
    // 表示は「SCORE 0」→ 1.2秒静止 → 実スコアがバラバラっと回って実数値に着地、の2段構え。
    const G7_SCORE_TAUNT = {
        id: 'G7', name: 'スコア煽り', supports: 'both', introducedAt: 10, difficulty: 7,
        apply(ctx) {
            const s = window.GameState?.session;
            if (s) s.scoreTaunt = true;
            // 単発問題ごとの gimmick だが、フラグは終了時まで残したいので
            // dispose では戻さない (result 到達時にまだ立っている必要あり)。
            // 次セッションでは resetSession で消えるので副作用なし。
            return () => {};
        },
    };

    // ---------- Export ----------
    const map = {
        B11_BLASTER, B16_FAKE_COUNTDOWN, B18_FAKE_ERROR,
        B02_TYPEWRITER, B04_ZOOM_CHAOS, B08_FADEOUT, B15_REVERSED_TEXT, B20_BLACKOUT,
        B03_REVERSE, B05_MIRROR, B06_COLOR_BREAK, B07_GLITCH,
        B09_SHRINK, B10_SHUFFLE_TEXT,
        B12_BLUR, B13_TINY, B25_CHAR_OBSTRUCT,
        B01_REVERSE_TAP, B17_NOISE_TEXT,
        C01_SHUFFLE, C02_DUMMY_CHOICE, C03_CHAR_CORRUPT, C04_FAKE_5050,
        W01_KEYS_INVISIBLE, W02_KEYS_SHUFFLE, W03_ANSWER_INVISIBLE, W07_CHAR_DROP,
        W04_INPUT_SHIFT, W06_REVERSE_TEXT, W09_GHOST_INPUT,
        B21_INSTANT_DEATH, W08_KEYS_RESHUFFLE, W18_KEY_VANISH, W20_FLICK_SHUFFLE,
        G1_RANDOM_DEATH, G4_GARBLED_TEXT, G5_CHOICE_WARP, G7_SCORE_TAUNT,
    };
    const all = Object.values(map).filter(g => g && g.id);
    window.GimmickRegistry = Object.assign({ all }, map);
})();
