/* ============================================================
   audio.js — 効果音 (SE) ラッパ (Web Audio API 実装)
   ------------------------------------------------------------
   設計方針:
     - Web Audio API (AudioContext + AudioBuffer) ベース。
       * iOS WKWebView / Android Chrome どちらでも確実にアンロック可能
         (AudioContext.resume() が公式 API)。
       * decodeAudioData で全 SE を PCM としてメモリ展開しておくため
         「初回再生が 0.x 秒遅れる」症状が構造的に出ない。
       * AudioBufferSourceNode は使い捨てなのでプール管理不要。
         多重再生は上限なく確実。
     - 外部 API (`window.SE.*`) は HTMLAudio 版と完全互換。
       呼び出し側コード (registry.js / question.js / result.js 等) は
       一切変更する必要が無い。

   API:
     SE.play(path, opts)
        path    : audio/se/... の相対パス
        opts    :
          volume         0.0〜1.0 (既定 1.0)
          clipMs         先頭からのミリ秒指定。経過後にフェードアウトして停止
          key            排他キー。同 key の既存再生を先に止める
                         (指定なし = 非排他、同 path でも独立に重ねる)
          persist        true: abortAll(force=false) で停止しない
          startOffsetMs  先頭無音を飛ばして再生開始
     SE.playExclusive(path, opts)  = play(path, {key:path, ...opts})
     SE.playLoop(path, volume=0.3) = loop 再生 (active[path] で管理)
     SE.stop(path)                  = loop/排他 の停止
     SE.abortAll(fadeMs=200, force=false)
         全停止 (画面遷移時)。persist は force=true でのみ止める
     SE.mute(flag) / SE.isMuted()
     SE.setMasterVolume(v) / SE.getMasterVolume()
     SE.fire(name) / SE.stopNamed(name)  ← SE_SPEC ベースのセマンティック層
   ============================================================ */

(function () {
    const BASE = 'audio/';
    // フェードアウトで 0 にすると Safari が「値が変わらなかった」とみなす
    // 場合があるので、極小正値まで落として stop() する。
    const FADE_MIN = 0.0001;

    // ---- AudioContext 本体 ----
    let audioCtx = null;
    let masterGain = null;       // masterVolume × (muted?0:1) を掛ける最上位 gain
    const buffers = new Map();   // path -> AudioBuffer
    const fetchPromises = new Map(); // path -> Promise<AudioBuffer|null> (二重 fetch 抑止)

    // ---- 再生中状態 ----
    // active: 排他 (key) で 1 本だけ保持するもの。loop/exclusive 用
    //   key -> entry
    const active = new Map();
    // liveSources: 現在鳴っている全 entry の集合 (abortAll で走査する用)
    //   非排他単発もここに入る。entry.source.onended で自動的に抜ける。
    const liveSources = new Set();

    // ---- フラグ ----
    let muted = false;
    let unlocked = false;
    let masterVolume = 1.0;

    // ====== AudioContext 準備 ======
    function ensureCtx() {
        if (audioCtx) return audioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try {
            audioCtx = new Ctx();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = muted ? 0 : masterVolume;
            masterGain.connect(audioCtx.destination);
        } catch (e) {
            // iOS の超旧版などで user-gesture 無しに new AudioContext が弾かれる
            // 場合は null のまま。次の user-gesture (unlockOnce) で再試行される。
            console.warn('[SE] AudioContext init failed:', e);
            audioCtx = null;
            masterGain = null;
        }
        return audioCtx;
    }

    // ====== デコード済みバッファの取得 (memoize) ======
    function loadBuffer(path) {
        if (buffers.has(path)) return Promise.resolve(buffers.get(path));
        if (fetchPromises.has(path)) return fetchPromises.get(path);
        const ctx = ensureCtx();
        if (!ctx) return Promise.resolve(null);

        const url = BASE + encodeURI(path);
        const p = fetch(url)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            })
            .then((ab) => new Promise((resolve, reject) => {
                // Safari 旧版は Promise 返さないので callback 形式で包む。
                // Promise 版対応ブラウザでも callback 版は同じ挙動で動く。
                try {
                    const ret = ctx.decodeAudioData(ab, resolve, reject);
                    if (ret && typeof ret.then === 'function') {
                        ret.then(resolve, reject);
                    }
                } catch (e) { reject(e); }
            }))
            .then((buf) => {
                buffers.set(path, buf);
                fetchPromises.delete(path);
                return buf;
            })
            .catch((err) => {
                fetchPromises.delete(path);
                console.warn('[SE] load failed:', path, err);
                return null;
            });
        fetchPromises.set(path, p);
        return p;
    }

    function preloadAll() {
        if (!ensureCtx()) return;
        const seen = new Set();
        for (const name in SE_SPEC) {
            const spec = SE_SPEC[name];
            if (!spec || !spec.path) continue;
            if (seen.has(spec.path)) continue;
            seen.add(spec.path);
            // fire-and-forget。失敗は loadBuffer 内で握りつぶして warn。
            loadBuffer(spec.path);
        }
    }

    // ====== ユーザー操作でのアンロック ======
    function unlockOnce() {
        const ctx = ensureCtx();
        if (!ctx) return;
        if (ctx.state !== 'running') {
            // iOS WKWebView ではこれが「有効な user-gesture 起点の再生予約」と
            // みなされて、以後の source.start() が通るようになる。
            ctx.resume().catch(() => { /* noop */ });
        }
        if (!unlocked) {
            unlocked = true;
            // preload を保険でもう一度走らせる (スクリプト読込直後の preload が
            // まだ完了していない、もしくはキャッシュ弾きされた場合に備えて)。
            preloadAll();
        }
    }

    function installUnlockGuard() {
        const handler = () => { try { unlockOnce(); } catch (_) {} };
        // 永続リスナ。iOS は着信 / 他アプリ復帰で ctx が suspended に戻るため
        // 毎回 user-gesture で resume を試みる。
        document.addEventListener('pointerdown', handler, { passive: true });
        document.addEventListener('touchstart',  handler, { passive: true });
        document.addEventListener('keydown',     handler);
        // visibilitychange: 他アプリから戻ったとき suspended ならリジュームを試みる
        //                   (user-gesture 必須なので成功は保証されないが、復帰直後の
        //                    タップで確実に動くようにする最善手)。
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && audioCtx
                && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
        });
    }

    // ====== 内部: 1 発再生する ======
    // buffer を鳴らして {source, gain, persistOnTransition, stopped} を返す。
    // 失敗時 null。
    function startBuffer(buffer, opts) {
        if (!audioCtx || !masterGain || !buffer) return null;
        const gainNode = audioCtx.createGain();
        const baseVol = opts.volume == null ? 1.0 : Number(opts.volume);
        gainNode.gain.value = clampVol(baseVol);  // master は別 node で掛ける
        gainNode.connect(masterGain);

        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.loop = !!opts.loop;
        // playbackRate: 1.0 以外なら高速/低速再生 (ピッチも変わる)。
        // 正解音を 2x で短く圧縮したり、B16 カウントダウン tick をループで
        // 3x ピッチアップして鳴らしたり等に使う。
        if (opts.playbackRate && opts.playbackRate !== 1.0) {
            try { src.playbackRate.value = Number(opts.playbackRate); } catch (_) {}
        }
        src.connect(gainNode);

        const entry = {
            source: src,
            gain: gainNode,
            persistOnTransition: !!opts.persist,
            loop: !!opts.loop,
            stopped: false,
            key: opts.key || null,
        };
        liveSources.add(entry);
        src.onended = () => {
            entry.stopped = true;
            liveSources.delete(entry);
            try { src.disconnect(); } catch (_) {}
            try { gainNode.disconnect(); } catch (_) {}
            // active に自分が残ってたら掃除 (自然終了で抜ける loop/排他)
            if (entry.key && active.get(entry.key) === entry) {
                active.delete(entry.key);
            }
        };

        const offsetSec = Math.max(0, (opts.startOffsetMs || 0) / 1000);
        try {
            src.start(audioCtx.currentTime, offsetSec);
        } catch (e) {
            // start が既に呼ばれていたら捨てる
            liveSources.delete(entry);
            try { src.disconnect(); } catch (_) {}
            try { gainNode.disconnect(); } catch (_) {}
            return null;
        }

        // clipMs: 先頭 clipMs ms だけ鳴らしてフェードアウト & 停止を AudioContext の
        // スケジューラに予約する (setTimeout ではなくサンプル精度)。
        if (opts.clipMs) {
            const FADE_MS = 180;
            const startAt = audioCtx.currentTime + opts.clipMs / 1000;
            const endAt   = startAt + FADE_MS / 1000;
            try {
                gainNode.gain.setValueAtTime(gainNode.gain.value, startAt);
                gainNode.gain.linearRampToValueAtTime(FADE_MIN, endAt);
                src.stop(endAt + 0.02);
            } catch (_) { /* noop */ }
        }
        return entry;
    }

    // ====== 停止系 ======
    // 指定 entry をフェードアウトして停止。
    function fadeStopEntry(entry, fadeMs = 200) {
        if (!entry || entry.stopped || !audioCtx) return;
        entry.stopped = true;
        const now = audioCtx.currentTime;
        const endAt = now + Math.max(0, fadeMs) / 1000;
        try {
            entry.gain.gain.cancelScheduledValues(now);
            entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
            entry.gain.gain.linearRampToValueAtTime(FADE_MIN, endAt);
        } catch (_) {}
        try {
            entry.source.stop(endAt + 0.02);
        } catch (_) {
            // すでに stop 済みで InvalidStateError 等は無視
        }
    }

    // 即停止 (ループを切りたい時用)。
    function hardStopEntry(entry) {
        if (!entry || entry.stopped) return;
        entry.stopped = true;
        try { entry.source.stop(); } catch (_) {}
    }

    // ====== 公開: play / playExclusive / playLoop / stop ======
    function play(path, opts = {}) {
        if (muted) return null;
        ensureCtx();

        // 排他 key 指定があれば、既存を即断してから新規を鳴らす。
        if (opts.key) {
            const prev = active.get(opts.key);
            if (prev) {
                hardStopEntry(prev);
                active.delete(opts.key);
            }
        }

        const buf = buffers.get(path);
        if (buf) {
            const entry = startBuffer(buf, opts);
            if (entry && opts.key) active.set(opts.key, entry);
            return entry;
        }

        // まだデコードが完了していない場合、完了後に再生。
        // ユーザー体感の遅延を避けるため、preloadAll でほぼ全ての SE は
        // スクリプト読込段階で decode 済みになっているが、念のためのフォールバック。
        loadBuffer(path).then((b) => {
            if (!b) return;
            if (muted) return;
            // 間に mute や別の exclusive 呼び出しが入ってるかも。再チェック。
            if (opts.key) {
                const prev = active.get(opts.key);
                if (prev) { hardStopEntry(prev); active.delete(opts.key); }
            }
            const entry = startBuffer(b, opts);
            if (entry && opts.key) active.set(opts.key, entry);
        });
        return null;
    }

    function playExclusive(path, opts = {}) {
        return play(path, { ...opts, key: path });
    }

    function playLoop(path, volume = 0.3, playbackRate = 1.0) {
        if (muted) return null;
        ensureCtx();
        // 同 path の loop/排他があれば止める
        stop(path);
        const opts = { volume, loop: true, key: path, playbackRate };
        const buf = buffers.get(path);
        if (buf) {
            const entry = startBuffer(buf, opts);
            if (entry) active.set(path, entry);
            return entry;
        }
        loadBuffer(path).then((b) => {
            if (!b || muted) return;
            if (active.has(path)) return;  // 直近で別が始まっていれば何もしない
            const entry = startBuffer(b, opts);
            if (entry) active.set(path, entry);
        });
        return null;
    }

    function stop(path) {
        const entry = active.get(path);
        if (!entry) return;
        if (entry.loop) {
            hardStopEntry(entry);  // ループは即断で切替感を出す
        } else {
            fadeStopEntry(entry, 80);
        }
        active.delete(path);
    }

    // ====== 画面遷移で全停止 ======
    //   fadeMs: フェード秒数 (既定 200ms)
    //   force:  true なら persistOnTransition も含めて止める (mute 時)
    function abortAll(fadeMs = 200, force = false) {
        // active (排他/ループ): ループは即断、排他単発はフェード。
        const toDelete = [];
        for (const [key, entry] of active.entries()) {
            if (!force && entry.persistOnTransition) continue;
            if (entry.loop) hardStopEntry(entry);
            else            fadeStopEntry(entry, fadeMs);
            toDelete.push(key);
        }
        for (const k of toDelete) active.delete(k);

        // liveSources: 非排他単発 + 排他のエイリアス (両方入っている)。
        // 既に hardStop/fadeStop で止めたものは entry.stopped=true でスキップ。
        for (const entry of Array.from(liveSources)) {
            if (entry.stopped) continue;
            if (!force && entry.persistOnTransition) continue;
            if (entry.loop) hardStopEntry(entry);
            else            fadeStopEntry(entry, fadeMs);
        }
    }

    // ====== ミュート / 音量 ======
    function mute(flag) {
        muted = !!flag;
        // masterGain を実ゲインでも 0 にする (将来スケジュール済みの音にも効く)。
        if (masterGain && audioCtx) {
            const now = audioCtx.currentTime;
            try {
                masterGain.gain.cancelScheduledValues(now);
                masterGain.gain.setValueAtTime(masterGain.gain.value, now);
                masterGain.gain.linearRampToValueAtTime(
                    muted ? 0 : masterVolume,
                    now + 0.12
                );
            } catch (_) {}
        }
        // 鳴っている音も全停止 (persist 音含めて ユーザー操作を尊重)
        if (muted) abortAll(200, true);
    }
    function isMuted() { return muted; }

    function setMasterVolume(v) {
        masterVolume = clampVol(v);
        if (masterGain && audioCtx && !muted) {
            const now = audioCtx.currentTime;
            try {
                masterGain.gain.cancelScheduledValues(now);
                masterGain.gain.setValueAtTime(masterGain.gain.value, now);
                masterGain.gain.linearRampToValueAtTime(masterVolume, now + 0.05);
            } catch (_) {}
        }
    }
    function getMasterVolume() { return masterVolume; }

    function clampVol(v) {
        if (v == null) return 1.0;
        const n = Number(v);
        if (!isFinite(n)) return 1.0;
        return Math.max(0, Math.min(1, n));
    }

    // ------------------------------------------------------------
    // セマンティック SE 層
    //   各発火点は SE.fire('correct') / SE.fire('gB21Death') の形で呼ぶ。
    //   世界観に合わない音は厳格フィルタにより差し替え/無音化する。
    //
    //   ★ 厳格フィルタでの差し替え:
    //     stage_start (掛け声)    → b20_in を 1.5s クロップ
    //     stage_clear (テッテレー) → 無音 (result の rankReveal で代替)
    //     tap_start   (和太鼓)    → b20_out
    //     rank_reveal (ジャジャーン) → b17_glitch + b20_out
    //     share_ok    (鉄琴キラッ) → confirm で代用
    //     b05_mirror  (シャキーン) → b17_glitch
    //     b25_pop     (ポップ)     → b18_notify
    //     c01_shuffle (琴)        → w15_warp 頭0.4s
    //     c04_fake50  (キラッ)    → 無音
    //     w18_vanish  (チーン)    → 無音
    // ------------------------------------------------------------
    const SE_SPEC = {
        // --- system ---
        // 正解/不正解は画面遷移で中断させない (persistOnTransition: true)。
        // 次の問題の頭に被っても良いので、最後まで聞かせたい。
        // ただし原音は長めなので 2x 倍速で圧縮してスピード感を出す (ピッチも少し上がる)。
        correct:       { path: 'se/system/correct.mp3',     volume: 0.7, persistOnTransition: true, playbackRate: 2.0 },
        wrong:         { path: 'se/system/wrong.mp3',       volume: 0.9, persistOnTransition: true, playbackRate: 2.0 },
        // timeout / gG2Betray / gB21Death は resolve 後 1500ms 前後で
        // Router.show() が走るため、persist が無いと abortAll の
        // 200ms フェードで切れてしまう。最後まで鳴らすため persist する。
        timeout:       { path: 'se/system/timeout.mp3',     volume: 0.8, exclusive: true, persistOnTransition: true },
        // 渋滞回避のため、選択/確定/キャンセル/メニュー/naviPop などの小物音は
        // volume と clipMs を絞って "ピ" 程度の地味さに抑える。
        select:        { path: 'se/system/select.mp3',      volume: 0.18, clipMs: 80 },
        confirm:       { path: 'se/system/confirm.mp3',     volume: 0.25, clipMs: 100 },
        cancel:        { path: 'se/system/cancel.mp3',      volume: 0.22, clipMs: 100 },
        // 入力音 (key_tap / key_bs / key_ok) は打鍵ごとに鳴って喧しいので全面削除
        keyTap:        null,
        keyBs:         null,
        keyOk:         null,
        gameOver:      { path: 'se/system/game_over.mp3',   volume: 0.9 },
        menuCursor:    { path: 'se/system/menu_cursor.mp3', volume: 0.18, clipMs: 80 },
        scoreCount:    { path: 'se/system/score_count.mp3', volume: 0.22, clipMs: 60 },
        timeWarn:      { path: 'se/system/time_warn.mp3',   volume: 0.8 },
        // コメント吹き出しの出現音も "ピ" 程度
        naviPop:       { path: 'se/system/navi_pop.mp3',    volume: 0.2, clipMs: 80 },

        // --- 差し替え系 ---
        // タイトル tap-to-start: 元は和太鼓 → PC電源断カッ (b20_out)
        tapStart:      { path: 'se/gimmick/b20_out.mp3',    volume: 0.85 },
        // 出題音 (ステージ開始のヒュイーン) は渋滞の原因なので削除
        stageStart:    null,
        // ランク発表: 元はジャジャーン → b17_glitch (ノイズ) の単打 (b20_out 重ねは発火側で)
        rankReveal:    { path: 'se/gimmick/b17_glitch.mp3', volume: 0.9 },
        // snap は reveal と同時発音なので音量を抑えて重ね感だけ残す
        rankRevealSnap:{ path: 'se/gimmick/b20_out.mp3',    volume: 0.5 },
        // シェア成功: 元は鉄琴キラッ → confirm 流用
        shareOk:       { path: 'se/system/confirm.mp3',     volume: 0.8 },

        // --- gimmick ---
        // B02 タイプライタ演出: 元は keyTap を流用していたが、ユーザー入力音を
        // 全廃したので専用エントリを用意。menu_cursor を極小音量で流用してカチ音を再現。
        gB02Type:      { path: 'se/system/menu_cursor.mp3', volume: 0.1,  clipMs: 40 },
        gB04Zoom:      { path: 'se/gimmick/b04_zoom.mp3',   volume: 0.8 },
        // B05 ミラー: シャキーン差し替え → b17_glitch 短縮
        gB05Mirror:    { path: 'se/gimmick/b17_glitch.mp3', volume: 0.7, clipMs: 600 },
        // B11 連射: 複数ビームを時間差で撃つためチャージ/発射音が多重化し得る。
        //           同 SE の重ね鳴りは濁るだけなので exclusive で直列化する。
        gB11Charge:    { path: 'se/gimmick/b11_charge.mp3', volume: 0.7, exclusive: true },
        gB11Fire:      { path: 'se/gimmick/b11_fire.mp3',   volume: 0.9, exclusive: true },
        // B16 偽カウントダウン: 以前は 300ms ごとに tick を叩きまくって途切れ感が出ていた。
        // 改修: 単一ループ SE を 3x 倍速で流し続ける方式に変更 (registry.js 側でも連打停止)。
        //       これで途切れなく「ザーッ」と時計が走る感じになる。
        gB16Tick:      { path: 'se/gimmick/b16_tick.mp3',   volume: 0.45, loop: true, playbackRate: 3.0 },
        gB16Alarm:     { path: 'se/gimmick/b16_alarm.mp3',  volume: 0.85 },
        gB17Glitch:    { path: 'se/gimmick/b17_glitch.mp3', volume: 0.8 },
        gB18Notify:    { path: 'se/gimmick/b18_notify.mp3', volume: 0.9 },
        gB20In:        { path: 'se/gimmick/b20_in.mp3',     volume: 0.7, clipMs: 3000 },
        gB20Out:       { path: 'se/gimmick/b20_out.mp3',    volume: 0.9 },
        gB21Death:     { path: 'se/gimmick/b21_death.mp3',  volume: 1.0, persistOnTransition: true },
        // B25 キャラ乱入: ポップ差し替え → b18_notify (iOS通知)
        gB25Pop:       { path: 'se/gimmick/b18_notify.mp3', volume: 0.7 },
        // C01 シャッフル: 琴差し替え → w15_warp を短クロップ
        gC01Shuffle:   { path: 'se/gimmick/w15_warp.mp3',   volume: 0.5, clipMs: 400 },
        // C04 嘘50:50: キラッ差し替え → 無音 (null)
        gC04Fake50:    null,
        gG2Betray:     { path: 'se/gimmick/g2_betray.mp3',  volume: 0.9, persistOnTransition: true },
        gGlitchLoop:   { path: 'se/gimmick/glitch_loop.mp3', volume: 0.25, loop: true },
        gW15Warp:      { path: 'se/gimmick/w15_warp.mp3',   volume: 0.7 },
        // W18 キー消失: チーン差し替え → 無音
        gW18Vanish:    null,
    };

    function fire(name) {
        // ハプティクスは SE の音が null (無音マッピング) でも発火したい場合がある
        // (例: keyTap は音を廃止したが、打鍵の感触だけは残したい)。
        // → まず Haptics を呼んでから SE を処理する。
        try { window.Haptics?.fire?.(name); } catch (_) {}

        const spec = SE_SPEC[name];
        if (!spec) return null;           // null = 無音マッピング (仕様的にミュート)
        if (spec.loop) return playLoop(spec.path, spec.volume, spec.playbackRate || 1.0);
        const opts = {
            volume: spec.volume,
            clipMs: spec.clipMs,
            persist: !!spec.persistOnTransition,
            // SE 素材の頭に無音があるやつはここで個別に skip させる
            startOffsetMs: spec.startOffsetMs,
            // 2x 倍速再生など (正解/不正解 SE を短く圧縮するのに使う)
            playbackRate: spec.playbackRate,
        };
        if (spec.exclusive) return playExclusive(spec.path, opts);
        return play(spec.path, opts);
    }

    function stopNamed(name) {
        const spec = SE_SPEC[name];
        if (!spec || !spec.path) return;
        stop(spec.path);
    }

    // ====== 初期化 ======
    installUnlockGuard();
    // スクリプト読込直後に ctx を作って全 SE の fetch & decode を開始。
    // AudioContext は user-gesture 無しだと suspended 状態で生成されるが、
    // decodeAudioData はそれでも実行できるので、タップ前に全 SE が decode 済みになる。
    try { ensureCtx(); preloadAll(); } catch (_) {}

    window.SE = {
        // 低レベル (path 指定)
        setMasterVolume,
        getMasterVolume,
        play,
        playExclusive,
        playLoop,
        stop,
        abortAll,
        mute,
        isMuted,
        // セマンティック
        fire,
        stopNamed,
        SPEC: SE_SPEC,
    };
})();
