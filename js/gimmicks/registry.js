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

    // HTML エスケープ (innerHTML 経由で textContent を設定する時に使う)
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // stem.textContent/innerHTML を書き換える系ギミック同士の相互排他リスト。
    // 後勝ちで前の効果が消えるので、同時適用するとどちらか片方しか見えない。
    const STEM_TEXT_CONFLICTS = [
        'B02', 'B07', 'B10', 'B15', 'B17',          // 既存
        'B23', 'B24', 'B26', 'B27', 'B28', 'B29', 'B30',  // 2026-04 追加
    ];
    function stemConflictsExcept(selfId) {
        return STEM_TEXT_CONFLICTS.filter(id => id !== selfId);
    }

    // rows × cols のグリッドを、外側から内側に向かって螺旋順に巡る [row,col] の配列を返す。
    // ccw=true なら反時計回り (下→右→上→左)、false なら時計回り (右→下→左→上)。
    function spiralPath(rows, cols, ccw) {
        const path = [];
        let top = 0, bottom = rows - 1, left = 0, right = cols - 1;
        while (top <= bottom && left <= right) {
            if (!ccw) {
                for (let c = left; c <= right; c++) path.push([top, c]); top++;
                for (let r = top; r <= bottom; r++) path.push([r, right]); right--;
                if (top <= bottom) {
                    for (let c = right; c >= left; c--) path.push([bottom, c]); bottom--;
                }
                if (left <= right) {
                    for (let r = bottom; r >= top; r--) path.push([r, left]); left++;
                }
            } else {
                for (let r = top; r <= bottom; r++) path.push([r, left]); left++;
                for (let c = left; c <= right; c++) path.push([bottom, c]); bottom--;
                if (left <= right) {
                    for (let r = bottom; r >= top; r--) path.push([r, right]); right--;
                }
                if (top <= bottom) {
                    for (let c = right; c >= left; c--) path.push([top, c]); top++;
                }
            }
        }
        return path;
    }

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

            // 2026-04 再調整 v2 (実機クラッシュ報告を受けて):
            //   CSS 側で box-shadow / mix-blend-mode / will-change(常時) を全廃したので
            //   1 本あたりの GPU コストは ~15% に。ただし「2本同時」でもまだ iOS 実機で
            //   落ちるケースが残るため、保険として同時発射数は 1 に厳格化。
            //   連射感は「1本の発射 → ほぼ間髪入れず次の本が発射」で維持できるよう
            //   他ビームは発射終了 100〜400ms で次の発射チャンスを得る。
            const MAX_CONCURRENT = 1;
            let concurrentFires = 0;

            // 各ビームのベース角度。CSS の transform は廃止し JS で毎発射上書き。
            const BASE_ANGLES = [60.6, 119.4, 240.6, 299.4];

            function fire(beam) {
                if (!alive) return;
                // 既に上限撃ってる場合は短期リトライ (互いに順番待ち)
                if (concurrentFires >= MAX_CONCURRENT) {
                    schedule(() => fire(beam), 40 + Math.random() * 80);
                    return;
                }
                // ±20° ランダム角度を毎発射適用 (始点・終点は60px外出しで常に画面外)
                const base = parseFloat(beam.dataset.base);
                beam.style.transform = `rotate(${base + (Math.random() - 0.5) * 40}deg)`;
                concurrentFires++;
                window.SE?.fire('gB11Charge');
                beam.classList.add('is-fire');
                schedule(() => window.SE?.fire('gB11Fire'), 600);
                schedule(() => {
                    beam.classList.remove('is-fire');
                    concurrentFires = Math.max(0, concurrentFires - 1);
                    // 即座に再キュー。MAX_CONCURRENT=1 がクラッシュ防護なのでインターバルは関係なし
                    schedule(() => fire(beam), 20 + Math.random() * 60);
                }, FIRE_DURATION);
            }

            // 4本を順番に起動。ベース角度を data 属性に焼き込んで初期 transform も設定。
            beams.forEach((beam, i) => {
                beam.dataset.base = BASE_ANGLES[i];
                beam.style.transform = `rotate(${BASE_ANGLES[i]}deg)`;
                schedule(() => fire(beam), 300 + i * 400 + Math.random() * 300);
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

    // ============================================================
    // 2026-04 追加 — 問題文系ギミック 9 個 (B22-B31)
    // 旧 9 個 (B14/W05/W10/W15/W16/W17/W19/G2/G8) の置換として追加。
    // 全て「問題文の見た目を崩す」バリエーション。画面全体や回答エリアには
    // 手を出さない (バグ増やさない方針)。
    // ============================================================

    // --- B22 問題文二重見え ---
    // text-shadow で左右に色ズレした影を付けて「文字が二重にブレて見える」状態。
    // 静止演出なので酔わない。読めるがピントが合わず疲れる。
    const B22_DOUBLE_VISION = {
        id: 'B22', name: '問題文二重見え', supports: 'both', introducedAt: 5, difficulty: 5,
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            stem.classList.add('gk-b22-double');
            return () => stem.classList.remove('gk-b22-double');
        },
    };

    // --- B23 問題文黒塗り ---
    // ランダムな位置に 1〜5 文字 (最大 5) を黒帯で覆い隠す。
    // 完全に消すのではなく、文字色を極薄白 (rgba 0.05) にして、よーく見ると
    // うっすら文字シルエットが透けるようにする (= 推測のヒント程度に残す)。
    // 旧仕様 (連続セグメント × 複数) は問題文全体を埋め尽くしてしまい、
    // ギミックとして機能していなかったため 2026-04 に簡素化。
    const B23_REDACTION = {
        id: 'B23', name: '問題文黒塗り', supports: 'both', introducedAt: 6, difficulty: 7,
        conflicts: stemConflictsExcept('B23'),
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const originalHTML = stem.innerHTML;
            const chars = Array.from(stem.textContent);
            const n = chars.length;
            if (n < 2) return () => {};

            // 隠す文字数 = 1〜5 の一様乱数。問題文が短い時は n を上限にクリップ。
            const target = Math.min(n, 1 + Math.floor(Math.random() * 5));

            // 重複しない位置を target 個選ぶ (= ランダムに散りばめる)。
            //   連続セグメントだと「機密文書」感は出るが、5 文字程度の短い帯は
            //   必ず読めてしまうのでギミックにならない。バラ撒くことで全体の
            //   どこかに「読めない箇所」が点在する形にする。
            const indices = [];
            const used = new Set();
            let safety = 0;
            while (indices.length < target && safety++ < 100) {
                const idx = Math.floor(Math.random() * n);
                if (used.has(idx)) continue;
                used.add(idx);
                indices.push(idx);
            }

            const covered = new Array(n).fill(false);
            indices.forEach(i => { covered[i] = true; });

            let html = '';
            for (let i = 0; i < n; i++) {
                if (covered[i]) {
                    html += `<span class="gk-b23-redact">${esc(chars[i])}</span>`;
                } else {
                    html += esc(chars[i]);
                }
            }
            stem.innerHTML = html;
            return () => {
                stem.innerHTML = originalHTML;
            };
        },
    };

    // --- B24 問題文スクロール (ニュースティッカー) ---
    // 問題文を 1 行化して横スクロール。制限時間内に流し読むしかない。
    const B24_SCROLL = {
        id: 'B24', name: '問題文スクロール', supports: 'both', introducedAt: 7, difficulty: 7,
        conflicts: stemConflictsExcept('B24'),
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const originalHTML = stem.innerHTML;
            const text = stem.textContent;
            stem.classList.add('gk-b24-scroll');
            // 2 つ続けて並べ、半分流れたらループが繋がって見える (seamless loop)
            stem.innerHTML =
                `<span class="gk-b24-track">` +
                `<span class="gk-b24-seg">${esc(text)}</span>` +
                `<span class="gk-b24-seg">${esc(text)}</span>` +
                `</span>`;
            return () => {
                stem.classList.remove('gk-b24-scroll');
                stem.innerHTML = originalHTML;
            };
        },
    };

    // --- B26 問題文カラーバラ ---
    // 各文字をランダムな色に。読めるが目がチカチカする視覚疲労系。
    // 注意: .q-stem は display:flex なので <span> を直に並べると各 span が
    // 別々の flex item になって折り返さず、長文で横にはみ出る。
    // → 単一のインラインラッパ <span class="gk-b26-inner"> に全文字 span を
    //   格納して、それを 1 個の flex item として扱う。ラッパ内部は通常の
    //   インラインフロー + word-break で改行する。
    const B26_COLOR_RANDOM = {
        id: 'B26', name: '問題文カラーバラ', supports: 'both', introducedAt: 4, difficulty: 4,
        conflicts: stemConflictsExcept('B26'),
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const originalHTML = stem.innerHTML;
            const original = stem.textContent;
            const PALETTE = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c780ff', '#ff9f43', '#7ef9ff'];
            const inner = Array.from(original).map(ch => {
                if (/\s/.test(ch)) return ch;
                const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
                return `<span style="color:${c}">${esc(ch)}</span>`;
            }).join('');
            stem.classList.add('gk-b26-color');
            stem.innerHTML = `<span class="gk-b26-inner">${inner}</span>`;
            return () => {
                stem.classList.remove('gk-b26-color');
                stem.innerHTML = originalHTML;
            };
        },
    };

    // --- B27 問題文1文字欠落 ---
    // ランダムな 1 文字だけ見えなくする (空白置換)。永久欠落で戻らない。
    // 「何の文字が抜けたか」を推測させるタイプ。短文ほど厳しい。
    const B27_CHAR_DROP = {
        id: 'B27', name: '問題文1文字欠落', supports: 'both', introducedAt: 5, difficulty: 5,
        conflicts: stemConflictsExcept('B27'),
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            const chars = Array.from(original);
            const candidates = [];
            for (let i = 0; i < chars.length; i++) {
                if (!/\s/.test(chars[i])) candidates.push(i);
            }
            if (candidates.length === 0) return () => {};
            const dropIdx = candidates[Math.floor(Math.random() * candidates.length)];
            chars[dropIdx] = '\u3000';  // 全角空白で欠けた幅をキープ
            stem.textContent = chars.join('');
            return () => {
                if (stem.isConnected) stem.textContent = original;
            };
        },
    };

    // --- B28 問題文サイズ崩壊 ---
    // 各文字のフォントサイズがランダム (小は読める範囲〜大は結構でかい)。
    // 行高にもバラつきが出るが、問題文エリア内に収まるよう最大サイズを抑える。
    const B28_SIZE_CHAOS = {
        id: 'B28', name: '問題文サイズ崩壊', supports: 'both', introducedAt: 6, difficulty: 6,
        conflicts: stemConflictsExcept('B28'),
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const originalHTML = stem.innerHTML;
            const original = stem.textContent;
            // 読める範囲の最小 24px 〜 クソでかの最大 64px
            const SIZES = [24, 28, 32, 38, 46, 52, 58, 64];
            const inner = Array.from(original).map(ch => {
                if (/\s/.test(ch)) return ch;
                const s = SIZES[Math.floor(Math.random() * SIZES.length)];
                return `<span style="font-size:${s}px;line-height:1;vertical-align:middle">${esc(ch)}</span>`;
            }).join('');
            stem.classList.add('gk-b28-size');
            // B26 と同じ理由 (.q-stem が flex で char span が個別 flex item 化するのを
            // 避けるため) インラインラッパに包んでから挿入。
            stem.innerHTML = `<span class="gk-b28-inner">${inner}</span>`;
            return () => {
                stem.classList.remove('gk-b28-size');
                stem.innerHTML = originalHTML;
            };
        },
    };

    // --- B29 問題文バウンド ---
    // 問題文は定位置表示。0.3 秒後に先頭から 1 文字ずつ真下に落下し、
    // stem 下端でバウンド → ランダム角度で画面外へ飛ぶ。
    // アニメーションは Web Animations API (fall + bounce の 2 フェーズ)。
    const B29_BOUNCE = {
        id: 'B29', name: '問題文バウンド', supports: 'both', introducedAt: 8, difficulty: 9,
        conflicts: stemConflictsExcept('B29'),
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const originalHTML = stem.innerHTML;
            const prevClasses = stem.className;

            // .q-stem は display:flex のコンテナ。直接の子要素はすべて flex item になるため、
            // 各文字 span を直接 stem に入れると flex item として横並びになりテキストフローが崩れる。
            // gk-b29-wrap (display:block) を1枚挟むことで stem の flex item は wrap1個のみにし、
            // 内部ではインラインフローとして普通に文字が並ぶようにする。
            stem.innerHTML = `<div class="gk-b29-wrap">${
                Array.from(stem.textContent).map(ch =>
                    /\s/.test(ch) ? esc(ch) : `<span class="gk-b29-char">${esc(ch)}</span>`
                ).join('')
            }</div>`;

            const spans = Array.from(stem.querySelectorAll('.gk-b29-char'));
            const timers = [];
            const anims = [];
            let cancelled = false;

            spans.forEach((span, i) => {
                const t = setTimeout(() => {
                    if (cancelled) return;

                    const spanRect = span.getBoundingClientRect();
                    const stemRect = stem.getBoundingClientRect();
                    // 文字下端 → stem 下端 (outer border) までの落下距離。
                    // getBoundingClientRect() はビューポート座標を返すので、
                    // 親に CSS transform がない通常時は translateY のローカル座標と一致する。
                    const fallDist = Math.max(0, stemRect.bottom - spanRect.bottom);

                    // バウンド角度: 水平から 25°〜75° 上向き、左右ランダム
                    const elevDeg = 25 + Math.random() * 50;
                    const elevRad = elevDeg * Math.PI / 180;
                    const side = Math.random() < 0.5 ? 1 : -1;
                    const speed = 1000 + Math.random() * 500;
                    const exitX = side * Math.cos(elevRad) * speed;
                    const exitY = -Math.sin(elevRad) * speed; // 負=上方向

                    // Phase 1: 真下に落下 (ease-in で重力感)
                    const fall = span.animate([
                        { transform: 'translateY(0)',             opacity: '1' },
                        { transform: `translateY(${fallDist}px)`, opacity: '1' },
                    ], { duration: 380, easing: 'ease-in', fill: 'forwards' });
                    anims.push(fall);

                    fall.onfinish = () => {
                        if (cancelled) return;
                        window.SE?.fire('gB25Pop');
                        // Phase 2: ランダム角度で画面外へ
                        const bounce = span.animate([
                            { transform: `translateY(${fallDist}px)`,                        opacity: '1' },
                            { transform: `translate(${exitX}px, ${fallDist + exitY}px)`,     opacity: '0' },
                        ], { duration: 520, easing: 'ease-out', fill: 'forwards' });
                        anims.push(bounce);
                    };
                }, 300 + i * 200);
                timers.push(t);
            });

            return () => {
                cancelled = true;
                timers.forEach(clearTimeout);
                anims.forEach(a => { try { a.cancel(); } catch (e) {} });
                stem.className = prevClasses;
                stem.innerHTML = originalHTML;
            };
        },
    };

    // --- B30 問題文渦巻き ---
    // 問題文を外側→内側の螺旋順にグリッドへ流し込む静止配置。
    // 向き (CW/CCW) はランダム。1 文字ずつ格子セルに並べるので読むには脳内で
    // 渦巻きを追う必要がある。
    const B30_SPIRAL = {
        id: 'B30', name: '問題文渦巻き', supports: 'both', introducedAt: 8, difficulty: 8,
        conflicts: stemConflictsExcept('B30'),
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const originalHTML = stem.innerHTML;
            const chars = Array.from(stem.textContent);
            const n = chars.length;
            if (n < 4) return () => {};

            // 概ね正方形〜やや横長のグリッドにする (日本語縦書きだと縦長のが読みやすいが
            // 現状は横書きの UI なので横長寄り)
            const cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.15)));
            const rows = Math.ceil(n / cols);
            const ccw = Math.random() < 0.5;
            const path = spiralPath(rows, cols, ccw);
            const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
            for (let i = 0; i < n && i < path.length; i++) {
                const [r, c] = path[i];
                grid[r][c] = chars[i];
            }
            const html = grid.flat().map(ch =>
                `<span class="gk-b30-cell">${esc(ch)}</span>`
            ).join('');
            stem.classList.add('gk-b30-spiral');
            stem.style.setProperty('--b30-cols', String(cols));
            stem.innerHTML = html;
            return () => {
                stem.classList.remove('gk-b30-spiral');
                stem.style.removeProperty('--b30-cols');
                stem.innerHTML = originalHTML;
            };
        },
    };

    // --- B31 問題文超薄 ---
    // 問題文の opacity を 0.12 程度まで下げて「ほぼ透明」に。
    // 頑張って目を凝らせば読める、というレベル。
    const B31_FAINT = {
        id: 'B31', name: '問題文超薄', supports: 'both', introducedAt: 4, difficulty: 5,
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            stem.classList.add('gk-b31-faint');
            return () => stem.classList.remove('gk-b31-faint');
        },
    };

    // --- B07: グリッチ (問題文が文字化けしたり戻ったりする) ---
    // 狙い: 大半の時間は化けてて、たまに正気に戻る瞬間に読む必要がある緊張感。
    // 回転頻度: 250〜450ms に1ティック (前: 600〜1300ms)。
    // 化け確率: 70% (前: 30%) → 半分以上の時間は読めない状態に。
    const B07_GLITCH = {
        id: 'B07', name: 'グリッチ', supports: 'both', introducedAt: 2, difficulty: 3,
        // 2026-04: B09 (画面縮小) を追加。
        //   60% スケール + 120ms の "読める瞬間" が極小になる → Stage10 Q2 の
        //   「意味不明で解けない」スクショ報告の根本原因。読む窓が確保できる
        //   組み合わせだけ許可する。
        conflicts: ['B09', 'B12', 'B13'],
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
            // 5秒周期で blur(12px) ↔ blur(3px) を脈動させる:
            //   超ぼかし → ぼかし → 薄ぼかし → ぼかし → 超ぼかし
            // 一定の強度だと長文や他ギミック併発時に詰むため緩急を付ける。
            // ただし「完全にクリア」な状態は作らない (= 最薄でも 3px)。
            // 既存の filter / animation は一旦退避し、解除時に戻す。
            const prevFilter = stem.style.filter;
            const prevAnim = stem.style.animation;
            stem.classList.add('gk-b12-blur-pulse');
            return () => {
                stem.classList.remove('gk-b12-blur-pulse');
                stem.style.filter = prevFilter;
                stem.style.animation = prevAnim;
            };
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

    // --- B10 問題文均質化 (2026-04 仕様変更) ---
    // 旧実装「950ms ごとに全文字シャッフル」は見た目が騒がしいだけで
    // 問題文がほぼ常に読めない状態になり、ただのランダムノイズと区別が付かなかった。
    // 新実装: 2 秒ごとに 1 文字だけ、問題文内の他のどこかの文字で "上書き" する。
    //   問題文が 10 文字なら約 18 秒で全部同じ文字に収束 = 意味が徐々に消えていく。
    //   序盤は読める → 中盤怪しい → 終盤意味不明、というじわじわ崩壊演出。
    const B10_SHUFFLE_TEXT = {
        id: 'B10', name: '問題文均質化', supports: 'both', introducedAt: 6, difficulty: 5,
        conflicts: ['B02', 'B07', 'B15', 'B17'],  // stem.textContent を触る他とぶつかる
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            const original = stem.textContent;
            const chars = Array.from(original);
            if (chars.length < 2) return () => {};

            const timer = setInterval(() => {
                if (!stem.isConnected) return;
                const n = chars.length;
                const dst = Math.floor(Math.random() * n);
                let src = Math.floor(Math.random() * n);
                if (src === dst) src = (src + 1) % n;  // 自己コピー回避
                chars[dst] = chars[src];
                stem.textContent = chars.join('');
            }, 2000);

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
            // 2026-04 改修: 問題文エリアをノイズで埋め尽くす。
            //   .q-zone-question は 1080-canvas で 960×660px。28px Courier の
            //   モノスペース字幅 ≒ 14px、行高 ≒ 32px なので、最大で
            //     縦: ~20 行 / 横: ~60 文字
            //   詰められる。本物の問題文は最大でも約 30 文字なので、本物以外
            //   全行を 40〜55 文字のノイズで埋める。本物行も pre/post に
            //   ノイズを 8〜18 文字ずつ入れて全体長を揃える (= 行の長さで
            //   見分けがつかないようにする)。
            //   インデントは 0〜40px のランダム (本物だけ揃った位置にしない)。
            // 22 行は下端がクリップされて本物が読めなくなるリスクがある
            // (28px * 1.1 * 22 + padding ≒ 694px > q-zone 660px)。
            // 確実に全行表示できる 20 行に固定。
            const LINES = 20;
            const realLineIdx = Math.floor(Math.random() * LINES);

            function realLine() {
                const pre = randStr(8, 18);
                const post = randStr(8, 18);
                return `${pre}${originalText}${post}`;
            }
            const out = [];
            for (let i = 0; i < LINES; i++) {
                const indent = Math.floor(Math.random() * 40);  // 0..40px
                const style = `padding-left:${indent}px;`;
                if (i === realLineIdx) {
                    out.push(`<span class="gk-b17-line gk-b17-real" style="${style}">${esc(realLine())}</span>`);
                } else {
                    out.push(`<span class="gk-b17-line" style="${style}">${esc(randStr(40, 55))}</span>`);
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

    // C02 選択肢ノイズ (2026-04 仕様変更):
    //   旧仕様 (ダミー選択肢) は「他選択肢のテキストを微改変して別選択肢に貼る」
    //   ものだったが、短文 / 改変不能パターンで appendMark フォールバックに
    //   落ちると "雨" と "雨。" のように "ほぼ同一" の選択肢が並んでしまい、
    //   実質的に運ゲーと体感されていた (ユーザーフィードバック)。
    //
    //   新実装: 全 4 つの選択肢それぞれに対し、ランダムな 1 文字をノイズ
    //   グリフ (▓ █ ◊ ※ 等) で置換する。各選択肢は大半の文字が読めるので
    //   推測で正解を選べる「視覚ノイズ系」のフェアなギミックに。
    //   どの選択肢にも均等にノイズが入るので、特定の選択肢だけが目立つ
    //   ことはなく、運要素は無い。
    const C02_CHOICE_NOISE = {
        id: 'C02', name: '選択肢ノイズ', supports: 'choice', introducedAt: 6, difficulty: 6,
        apply(ctx) {
            const btns = qa(ctx.screen, '.q-choice');
            if (btns.length === 0) return () => {};
            const NOISE = ['▓', '█', '▒', '░', '◊', '※', '◇', '◆', '◯', '☒'];
            // 2文字以下の選択肢 (例「蛇尾」) はノイズで1文字隠すと残り1文字になり、
            // どの選択肢もほぼ同じ見た目になり運ゲー化する。3文字以上にのみ適用。
            const MIN_LEN = 3;
            const records = [];
            btns.forEach(btn => {
                const original = btn.textContent;
                const chars = Array.from(original);
                const visibleCount = chars.filter(c => !/\s/.test(c)).length;
                if (visibleCount < MIN_LEN) {
                    records.push({ btn, original, changed: false });
                    return;
                }
                const candidates = [];
                for (let i = 0; i < chars.length; i++) {
                    if (!/\s/.test(chars[i])) candidates.push(i);
                }
                if (candidates.length === 0) {
                    records.push({ btn, original, changed: false });
                    return;
                }
                const idx = candidates[Math.floor(Math.random() * candidates.length)];
                chars[idx] = NOISE[Math.floor(Math.random() * NOISE.length)];
                btn.textContent = chars.join('');
                records.push({ btn, original, changed: true });
            });
            return () => {
                records.forEach(r => {
                    if (r.changed && r.btn.isConnected) r.btn.textContent = r.original;
                });
            };
        },
    };

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

    // --- C03 選択肢真っ黒 ---
    // 仕様: 4 択のうち 1 つを完全ブラックアウト (背景・枠・文字 すべて #000)。
    //   抽選は完全ランダム (1/N)。正解が黒になることもあれば外れが黒になることも
    //   ある = 黒く塗り潰された選択肢を「賭けで押す」か「無視して残りから選ぶ」かの
    //   判断を強いるギミック。「黒 = 必ず正解」「黒 = 必ず誤答」のような偏りは入れない。
    const C03_CHAR_CORRUPT = {
        id: 'C03', name: '選択肢真っ黒', supports: 'choice', introducedAt: 8, difficulty: 8,
        apply(ctx) {
            const btns = qa(ctx.screen, '.q-choice');
            if (btns.length === 0) return () => {};
            // 2文字以下の選択肢を黒塗りすると情報量がほぼ無く運ゲー化するので、
            // 候補は3文字以上の選択肢に限定する。該当ゼロなら何もしない。
            const MIN_LEN = 3;
            const eligible = btns.filter(btn => {
                const t = btn.textContent || '';
                return Array.from(t).filter(c => !/\s/.test(c)).length >= MIN_LEN;
            });
            if (eligible.length === 0) return () => {};
            const target = eligible[Math.floor(Math.random() * eligible.length)];
            target.classList.add('gk-c03-blackout');
            return () => {
                if (target.isConnected) target.classList.remove('gk-c03-blackout');
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

    // --- W07 入力ガチ全消し (2026-04 仕様変更) ---
    // 旧実装「1.6〜2.4 秒ごとに表示だけ1文字ランダム消し」は気づかれず効果薄だった。
    // 新実装: 3 文字入力した瞬間に 1 問 1 回だけ発動し、末尾から 1 文字ずつ
    // 200ms 間隔で "ガチ" に (buffer ごと) 消えていく演出。
    // プレイヤーは全部打ち直す羽目になる、"入力リセット" 系ギミック。
    const W07_CHAR_DROP = {
        id: 'W07', name: '入力ガチ全消し', supports: 'input', introducedAt: 6, difficulty: 7,
        conflicts: ['W04', 'W09'],
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb || !kb.setValue || !kb.getOnChange) return () => {};
            let fired = false;
            const timers = new Set();

            const orig = kb.getOnChange();
            kb.setOnChange((val) => {
                // 3 文字到達で初回だけトリガー。発動後は普通の onChange として流す。
                if (!fired && val.length >= 3) {
                    fired = true;
                    triggerErase(val);
                }
                if (orig) orig(val);
            });

            function triggerErase(val) {
                // 打った直後に即消し始めると「指の入力を食った?」と誤解されるので
                // 400ms 待って「一拍間を置いてから」1 文字ずつ落としていく
                const chars = Array.from(val);
                const kickoff = setTimeout(step, 400);
                timers.add(kickoff);

                function step() {
                    chars.pop();
                    try { kb.setValue(chars.join('')); } catch (e) { /* ignore */ }
                    // 視覚上のちらつきを抑える短い SE (glitch) を各文字消失時に薄く鳴らす
                    window.SE?.fire('gB17Glitch');
                    if (chars.length > 0) {
                        const t = setTimeout(step, 200);
                        timers.add(t);
                    }
                }
            }

            return () => {
                timers.forEach(clearTimeout);
                timers.clear();
                try { kb.setOnChange(orig); } catch (e) { /* ignore */ }
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
    //
    // 2026-04 強化: 「静かすぎて気づかない」対策として、
    //   - 入力ボックスに "⚠ INPUT DRIFT" 警告バッジを常時表示
    //   - 表示文字列を subtle に左右ゆらし (jitter) → 目視で異常を主張
    const W04_INPUT_SHIFT = {
        id: 'W04', name: '入力ズレ', supports: 'input', introducedAt: 8, difficulty: 9,
        // onChange ラップの重複回避 + フリック方向弄り系とは別軸なので併用不可
        // (フリックで既に狂ってる文字がさらに見た目上ずれると解法が成立しない)
        conflicts: ['W06', 'W07', 'W09', 'W20'],
        apply(ctx) {
            const box = q(ctx.screen, '.q-input-box');
            if (box) box.classList.add('gk-w04-drift');
            const unwrap = wrapOnChange((orig) => (val) => {
                const shifted = Array.from(val).map(ch => w04ShiftChar(ch)).join('');
                if (orig) orig(shifted);
            });
            return () => {
                if (box && box.isConnected) box.classList.remove('gk-w04-drift');
                unwrap();
            };
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

    // --- W09 ダブル入力 (2026-04 仕様変更) ---
    // 旧実装「ゴースト表示」は表示と buffer がズレる overlay 方式で、
    // プレイヤーが「ゴーストを消そうとしたら自分の打った文字が消える」と誤解して
    // 混乱するだけだった。置換。
    //
    // 新実装: 1 タップで「打った文字 + ランダム1文字」= 2文字が buffer に入る。
    //   - 全て実体入力 (buffer) なので BS で1文字ずつ消せる = フェア
    //   - プレイヤーは毎タップ後に「BS で余計な1字を削る」運用を強いられる
    //   - 入力ボックスに "⚠ DOUBLE INPUT" 警告バッジで気づかせる
    const W09_GHOST_INPUT = {
        id: 'W09', name: 'ダブル入力', supports: 'input', introducedAt: 8, difficulty: 8,
        conflicts: ['W04', 'W06', 'W07'],
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb?.setValue || !kb?.getOnChange) return () => {};
            const NOISE = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょっゞゟヰヱヶ';
            const noiseCh = () => NOISE[Math.floor(Math.random() * NOISE.length)];
            const box = q(ctx.screen, '.q-input-box');
            if (box) box.classList.add('gk-w09-double');

            let lastLength = kb.getValue ? kb.getValue().length : 0;
            let suppressNext = false;

            const unwrap = wrapOnChange((orig) => (val) => {
                if (suppressNext) {
                    // setValue による再 emit。記録だけ更新して素通し。
                    suppressNext = false;
                    lastLength = val.length;
                    if (orig) orig(val);
                    return;
                }
                if (val.length === lastLength + 1) {
                    // 1 文字増えた = 実タップ。ランダム1字を連結して 2 文字化。
                    suppressNext = true;
                    try { kb.setValue(val + noiseCh()); } catch (e) { /* ignore */ }
                    return;
                }
                // BS (縮み) / clear / その他はそのまま流す
                lastLength = val.length;
                if (orig) orig(val);
            });

            return () => {
                if (box && box.isConnected) box.classList.remove('gk-w09-double');
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
    //
    // 2026-04 強化: 「何が起きたか分からない」対策として、
    //   - キーボード領域に "⚠ FLICK LOST" 警告バッジを常時表示
    //   - フリック実行時にキーボード全体が一瞬ガクッと揺れる (視覚フィードバック)
    const W20_FLICK_SHUFFLE = {
        id: 'W20', name: 'フリック方向シャッフル', supports: 'input', introducedAt: 9, difficulty: 10,
        conflicts: [],
        apply(ctx) {
            const kb = window.Keyboard;
            if (!kb?.setFlickTransform) return () => {};
            const host = q(ctx.screen, '#keyboardHost') || ctx.screen;
            host.classList.add('gk-w20-chaos');
            const DIRS = ['u', 'd', 'l', 'r'];
            let shakeTimer = 0;
            kb.setFlickTransform((dir) => {
                if (dir === 'c' || !dir) return dir;
                // フリック検出時に host 全体をピクッと揺らす (100ms)
                host.classList.add('gk-w20-shake');
                clearTimeout(shakeTimer);
                shakeTimer = setTimeout(() => host.classList.remove('gk-w20-shake'), 140);
                return DIRS[Math.floor(Math.random() * DIRS.length)];
            });
            return () => {
                kb.setFlickTransform(null);
                clearTimeout(shakeTimer);
                host.classList.remove('gk-w20-chaos');
                host.classList.remove('gk-w20-shake');
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
        conflicts: stemConflictsExcept('G4'), // stem.textContent を触る他
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
        // C02 はノイズ系に差し替え済 (旧ダミー時代の click 再送 conflict は不要)
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

    // ============================================================
    //  Annoyance pack (Stage 1-4 向けうざい系) — B32 / B33 / B34 / B35
    //  全て純CSS or 軽量 overlay 1個追加のみで判定/入力には一切影響しない。
    //  目的: 「うざいだけで詰まない」軽量プレッシャーを Stage 序盤に分散投入。
    // ============================================================

    // B33 CRT走査線: 画面全体に半透明の走査線パターンを上から下へ流す。
    // 読みづらくはならないが、目障り。Stage 1 から登場。
    const B33_SCANLINES = {
        id: 'B33', name: 'CRT走査線', supports: 'both', introducedAt: 1, difficulty: 2,
        apply(ctx) {
            ctx.screen.classList.add('gk-b33-scanlines');
            return () => ctx.screen.classList.remove('gk-b33-scanlines');
        },
    };

    // B35 シアン走査線スパム: シアン水平線が複数本、画面を上→下に流れる。
    // 太さ・所要時間・スタートタイミングがランダム、一定間隔で spawn。
    // 不透明 (透過なし) で頻度高め。pointer-events: none で入力影響なし。
    const B35_SCAN_BAR = {
        id: 'B35', name: 'シアン走査線', supports: 'both', introducedAt: 2, difficulty: 2,
        apply(ctx) {
            const items = new Set();
            function spawn() {
                const el = document.createElement('div');
                el.className = 'gk-b35-scanbar';
                el.setAttribute('aria-hidden', 'true');
                const thick = 1 + Math.floor(Math.random() * 5); // 1-5px
                const dur = 1.6 + Math.random() * 1.6;           // 1.6-3.2s
                el.style.height = `${thick}px`;
                el.style.animationDuration = `${dur}s`;
                ctx.screen.appendChild(el);
                items.add(el);
                setTimeout(() => {
                    if (el.isConnected) el.remove();
                    items.delete(el);
                }, dur * 1000 + 200);
            }
            spawn(); spawn();
            const t = setInterval(spawn, 380);
            return () => {
                clearInterval(t);
                items.forEach(el => { if (el.isConnected) el.remove(); });
            };
        },
    };

    // B32 画面ねじれ: ctx.screen を 2.5deg 傾ける。読めるが平衡感覚がズレる。
    // 他の screen 全体 transform 系 (B03 逆さ / B04 ズーム / B05 ミラー /
    // B09 縮小) と inline transform を奪い合うので排他。
    const B32_TILT = {
        id: 'B32', name: '画面ねじれ', supports: 'both', introducedAt: 3, difficulty: 3,
        conflicts: ['B03', 'B04', 'B05', 'B09'],
        apply(ctx) {
            ctx.screen.classList.add('gk-b32-tilt');
            return () => ctx.screen.classList.remove('gk-b32-tilt');
        },
    };

    // B34 文字震え: q-stem に 1.5px のマイクロシェイクをかける。読めるが
    // 見続けると目が泳ぐ。他の q-stem transform 系と排他。
    const B34_JITTER = {
        id: 'B34', name: '文字震え', supports: 'both', introducedAt: 4, difficulty: 4,
        // q-stem に transform を当てる系 (B04 ズーム, B29 バウンド, B30 渦巻き) と排他
        conflicts: ['B04', 'B29', 'B30'],
        apply(ctx) {
            const stem = q(ctx.screen, '.q-stem');
            if (!stem) return () => {};
            stem.classList.add('gk-b34-jitter');
            return () => stem.classList.remove('gk-b34-jitter');
        },
    };

    // ============================================================
    //  Overlay annoyance pack — B36 / B37 / B38 / B39 / B40
    //  全て pointer-events: none の overlay を spawn/dispose するだけ。
    //  画面構造・入力・判定には一切干渉しない。
    // ============================================================

    // B36 吹き出しスパム: 白い吹き出しが画面ランダム位置にポップ→消える。
    // 1.5s 寿命、約 0.8s 間隔で spawn。
    const B36_BUBBLE_SPAM = {
        id: 'B36', name: '吹き出しスパム', supports: 'both', introducedAt: 4, difficulty: 4,
        apply(ctx) {
            // 2026-04: 全エントリ 5 文字以上に統一 (短文だと「？」だけ等が
            // パッと出ても煽りにならない)。記号を含めて 5 文字でも OK
            // (「なんで？？」など)。filter で 5 未満を弾いて事故防止。
            const TEXTS = [
                'なんで？？', 'なんでよ！', 'ちがうよ！', 'うそでしょ',
                'まちがってる', '間違ってない？', 'いやちがう', 'やめてくれ',
                'ええええ？', 'は？？？？', 'マジで？？', 'うそうそうそ',
                'ちがくない？', 'なになになに', 'だからちがう', 'それじゃない',
                'もうわからん', 'それ違うよ', 'そうじゃない', 'バグってる？',
                'ちょっと待って', 'あぁぁぁぁ', 'ちがうやろ', 'ありえん…',
                'なにそれ？', 'まじか…？', 'おかしい！', 'いやそれは…',
                'なんなのこれ', 'やめてって',
            ].filter(s => Array.from(s).length >= 5);
            const items = new Set();
            function spawn() {
                const el = document.createElement('div');
                el.className = 'gk-b36-bubble';
                el.textContent = TEXTS[Math.floor(Math.random() * TEXTS.length)];
                el.style.left = `${5 + Math.random() * 85}%`;
                el.style.top = `${5 + Math.random() * 85}%`;
                el.style.setProperty('--rot', `${(Math.random() * 12 - 6).toFixed(1)}deg`);
                ctx.screen.appendChild(el);
                items.add(el);
                setTimeout(() => {
                    if (el.isConnected) el.remove();
                    items.delete(el);
                }, 1500);
            }
            spawn();
            const t = setInterval(spawn, 800);
            return () => {
                clearInterval(t);
                items.forEach(el => { if (el.isConnected) el.remove(); });
            };
        },
    };

    // B37 付箋スパム: 黄/桃/シアンの正方形ふせんが画面ランダム位置に「貼られる」。
    // 2.2s 寿命、1.2s 間隔。傾き付き。
    const B37_STICKY_NOTES = {
        id: 'B37', name: '付箋スパム', supports: 'both', introducedAt: 3, difficulty: 3,
        apply(ctx) {
            const TEXTS = ['？', '?!', '!?', '！', '正解', '違う', '？？', '!!'];
            const COLORS = ['#fff276', '#ff9bd2', '#9be7ff', '#ffb88a', '#b6ffb6'];
            const items = new Set();
            function spawn() {
                const el = document.createElement('div');
                el.className = 'gk-b37-sticky';
                el.textContent = TEXTS[Math.floor(Math.random() * TEXTS.length)];
                el.style.left = `${5 + Math.random() * 80}%`;
                el.style.top = `${10 + Math.random() * 75}%`;
                el.style.setProperty('--rot', `${(Math.random() * 12 - 6).toFixed(1)}deg`);
                el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
                ctx.screen.appendChild(el);
                items.add(el);
                setTimeout(() => {
                    if (el.isConnected) el.remove();
                    items.delete(el);
                }, 2200);
            }
            spawn();
            const t = setInterval(spawn, 1200);
            return () => {
                clearInterval(t);
                items.forEach(el => { if (el.isConnected) el.remove(); });
            };
        },
    };

    // B38 ？マーク雨: 画面上端から ？ がランダムに落下する装飾ノイズ。
    // 不透明白で密度高め (約 0.25s 間隔で spawn、寿命 4-6s)。
    const B38_QMARK_RAIN = {
        id: 'B38', name: 'クエスチョン雨', supports: 'both', introducedAt: 1, difficulty: 2,
        apply(ctx) {
            const items = new Set();
            function spawn() {
                const el = document.createElement('div');
                el.className = 'gk-b38-qmark';
                el.textContent = '？';
                el.style.left = `${Math.random() * 100}%`;
                el.style.fontSize = `${40 + Math.floor(Math.random() * 80)}px`;
                const dur = 4 + Math.random() * 2;
                el.style.animationDuration = `${dur}s`;
                el.style.setProperty('--drift', `${Math.floor(Math.random() * 60 - 30)}px`);
                el.style.setProperty('--rot', `${Math.floor(Math.random() * 720 - 360)}deg`);
                ctx.screen.appendChild(el);
                items.add(el);
                setTimeout(() => {
                    if (el.isConnected) el.remove();
                    items.delete(el);
                }, dur * 1000 + 200);
            }
            spawn(); spawn(); spawn(); spawn();
            const t = setInterval(spawn, 250);
            return () => {
                clearInterval(t);
                items.forEach(el => { if (el.isConnected) el.remove(); });
            };
        },
    };

    // B39 偽通知バナー: 画面上端に iOS 風の通知バナーが定期的にスライドダウン。
    // 一覧から random pick。pointer-events: none で実機通知に偽装。
    const B39_FAKE_NOTIFICATION = {
        id: 'B39', name: '偽通知', supports: 'both', introducedAt: 4, difficulty: 3,
        apply(ctx) {
            const NOTIFS = [
                { app: 'システム',   body: 'アップデートが利用可能です' },
                { app: '通信',       body: 'ネットワーク接続が不安定です' },
                { app: 'バッテリー', body: '残量 1% — 充電してください' },
                { app: 'メール',     body: '新着メッセージ (1)' },
                { app: '位置情報',   body: '現在地の取得に失敗しました' },
                { app: 'カレンダー', body: '次の予定: 締切 10 分後' },
                { app: 'リマインダー', body: '今すぐ確認してください' },
                { app: 'ストレージ', body: '空き容量がわずかです' },
            ];
            const items = new Set();
            function escapeHTML(s) {
                return String(s).replace(/[&<>"']/g, c => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                }[c]));
            }
            function spawn() {
                const n = NOTIFS[Math.floor(Math.random() * NOTIFS.length)];
                const el = document.createElement('div');
                el.className = 'gk-b39-notif';
                el.innerHTML =
                    `<div class="gk-b39-notif-app">${escapeHTML(n.app)}</div>` +
                    `<div class="gk-b39-notif-body">${escapeHTML(n.body)}</div>`;
                ctx.screen.appendChild(el);
                items.add(el);
                setTimeout(() => {
                    if (el.isConnected) el.remove();
                    items.delete(el);
                }, 3500);
            }
            spawn();
            const t = setInterval(spawn, 4200);
            return () => {
                clearInterval(t);
                items.forEach(el => { if (el.isConnected) el.remove(); });
            };
        },
    };

    // B40 ニコ動弾幕: 問題文エリア (q-zone-question) の中をコメントが
    // 右→左へ流れる。文字色・サイズ・速度ランダム、複数同時。
    // overflow:hidden を一時的に zone に付けて、はみ出しを clip。
    const B40_DANMAKU = {
        id: 'B40', name: 'ニコ動弾幕', supports: 'both', introducedAt: 5, difficulty: 5,
        apply(ctx) {
            // 2文字以下の超短コメント (「草」「ｗｗ」等) は視認性が低いので除外。
            // 全コメント 3 文字以上で統一。
            const COMMENTS = [
                'wwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwwwwwwwww',
                '草草草草草草草草', '草草草草草草草草草草草草草',
                'あああああああああああ', 'うわあああああああああ',
                '8888888888888888', '888888888888',
                'wwwwww', '草草草', '簡単すぎ', '答え:1', '答え:2', '答え:3', '答え:4',
                'ヒント！', 'いやそれ違うw', '騙されんなｗｗｗ', 'これは罠だろ',
                'やべぇぇ', 'むずい', '時間ない', 'ええええ', 'マジで？', 'うそだろ',
                '神回', '俺はわかったｗｗｗ', '正解は出ない', 'もう諦めろｗ',
                'バグってる？', '自信ある', 'チートかな', '神問題', 'ファッ！？',
                '焦るな', 'まじか…', 'はあぁぁぁ？', 'これ無理ゲーじゃん',
                'おまえらレベル低いなｗ', '答え教えてｗ', 'ヒントありがとう',
                'なるほどなぁ', 'これ罠やぞｗｗ',
            ].filter(s => s.length >= 3);
            const COLORS = ['#ffffff', '#ff8888', '#88ff88', '#8888ff', '#ffff88', '#ff88ff', '#88ffff', '#ffaa00'];
            const zone = q(ctx.screen, '.q-zone-question') || ctx.screen;
            const prevOverflow = zone.style.overflow;
            zone.style.overflow = 'hidden';
            zone.classList.add('gk-b40-host');
            const items = new Set();
            function spawn() {
                const el = document.createElement('div');
                el.className = 'gk-b40-danmaku';
                el.textContent = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
                el.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];
                el.style.fontSize = `${36 + Math.floor(Math.random() * 28)}px`; // 36-64px
                el.style.top = `${Math.random() * 88}%`;
                const dur = 4 + Math.random() * 2.5;
                el.style.animationDuration = `${dur}s`;
                const travel = (zone.clientWidth || 800) + 600;
                el.style.setProperty('--travel', `${travel}px`);
                zone.appendChild(el);
                items.add(el);
                setTimeout(() => {
                    if (el.isConnected) el.remove();
                    items.delete(el);
                }, dur * 1000 + 200);
            }
            spawn(); spawn(); spawn(); spawn();
            const t = setInterval(spawn, 280);
            return () => {
                clearInterval(t);
                items.forEach(el => { if (el.isConnected) el.remove(); });
                zone.classList.remove('gk-b40-host');
                zone.style.overflow = prevOverflow;
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
        B22_DOUBLE_VISION, B23_REDACTION, B24_SCROLL,
        B26_COLOR_RANDOM, B27_CHAR_DROP, B28_SIZE_CHAOS,
        B29_BOUNCE, B30_SPIRAL, B31_FAINT,
        B01_REVERSE_TAP, B17_NOISE_TEXT,
        B32_TILT, B33_SCANLINES, B34_JITTER, B35_SCAN_BAR,
        B36_BUBBLE_SPAM, B37_STICKY_NOTES, B38_QMARK_RAIN, B39_FAKE_NOTIFICATION, B40_DANMAKU,
        C01_SHUFFLE, C02_CHOICE_NOISE, C03_CHAR_CORRUPT, C04_FAKE_5050,
        W01_KEYS_INVISIBLE, W02_KEYS_SHUFFLE, W03_ANSWER_INVISIBLE, W07_CHAR_DROP,
        W04_INPUT_SHIFT, W06_REVERSE_TEXT, W09_GHOST_INPUT,
        B21_INSTANT_DEATH, W08_KEYS_RESHUFFLE, W18_KEY_VANISH, W20_FLICK_SHUFFLE,
        G1_RANDOM_DEATH, G4_GARBLED_TEXT, G5_CHOICE_WARP, G7_SCORE_TAUNT,
    };
    const all = Object.values(map).filter(g => g && g.id);
    window.GimmickRegistry = Object.assign({ all }, map);
})();
