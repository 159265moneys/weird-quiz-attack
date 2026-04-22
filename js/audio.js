/* ============================================================
   audio.js — 効果音 (SE) ラッパ
   ------------------------------------------------------------
   設計方針:
     - HTMLAudio プール方式。短尺SE中心なので低負荷。
     - 初回ユーザー操作でアンロック (iOS Safari 対策)。
     - 同時再生可 (overlap)。排他再生・ループ・クリップ再生も対応。

   API:
     Audio.play(path, {volume, clipMs, key})
        path      : audio/se/... の相対パス
        volume    : 0.0〜1.0 (既定 1.0)
        clipMs    : ミリ秒指定で先頭からだけ再生してフェードアウト
                    (例: 長尺 b20_in.mp3 の先頭 1500ms だけ使う)
        key       : 同 key の既存再生を先に止めたい時に指定
                    (指定なしなら path をキーに使う)
     Audio.playExclusive(path, opts)     ← key 指定と同義
     Audio.playLoop(path, volume=0.3)    ← loop 再生開始
     Audio.stop(path)                    ← loop/単発 どちらでも停止
     Audio.abortAll()                    ← 全停止 (画面遷移時)
     Audio.mute(flag) / Audio.isMuted()
   ============================================================ */

(function () {
    const BASE = 'audio/';
    const MAX_POOL_PER_KEY = 6;           // 同SE同時再生上限

    // path -> [{el, expiresAt}] のプール (単発用 / 終了を待たず再利用)
    const pool = new Map();
    // loop/exclusive 用の現在再生中マップ (key -> HTMLAudioElement)
    const active = new Map();
    // ミュート状態 (後でオプション画面とか繋げる)
    let muted = false;
    let unlocked = false;

    // 初回タップでモバイルの autoplay 制限を解除
    function unlockOnce() {
        if (unlocked) return;
        unlocked = true;
        // ダミーの無音再生を一度だけ走らせることで以後の play() が許可される
        try {
            const a = new Audio();
            a.muted = true;
            a.play().catch(() => {/* noop */});
        } catch (_) { /* noop */ }
    }

    function installUnlockGuard() {
        const handler = () => {
            unlockOnce();
            document.removeEventListener('pointerdown', handler);
            document.removeEventListener('touchstart', handler);
            document.removeEventListener('keydown', handler);
        };
        document.addEventListener('pointerdown', handler, { once: false });
        document.addEventListener('touchstart', handler, { once: false });
        document.addEventListener('keydown', handler, { once: false });
    }

    function acquire(path) {
        let list = pool.get(path);
        if (!list) { list = []; pool.set(path, list); }
        // 終了しているインスタンスがあれば再利用
        for (const entry of list) {
            if (entry.el.ended || entry.el.paused) return entry.el;
        }
        if (list.length < MAX_POOL_PER_KEY) {
            const el = new Audio(BASE + path);
            el.preload = 'auto';
            list.push({ el });
            return el;
        }
        // 上限到達時は最古を横取り
        const oldest = list[0];
        try { oldest.el.pause(); } catch (_) {}
        oldest.el.currentTime = 0;
        return oldest.el;
    }

    function play(path, opts = {}) {
        if (muted) return null;
        const key = opts.key || path;
        const prev = active.get(key);
        if (prev) { try { prev.pause(); } catch (_) {} active.delete(key); }

        const el = acquire(path);
        cancelFade(el);                // 以前のフェードを解除して正常音量で再生
        el.loop = false;
        el.volume = clampVol(opts.volume);
        try { el.currentTime = 0; } catch (_) {}
        const playPromise = el.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});

        if (opts.key) active.set(key, el);

        if (opts.clipMs) {
            setTimeout(() => {
                try { fadeStop(el, 180); } catch (_) {}
            }, opts.clipMs);
        }
        return el;
    }

    function playExclusive(path, opts = {}) {
        return play(path, { ...opts, key: path });
    }

    function playLoop(path, volume = 0.3) {
        if (muted) return null;
        stop(path); // 同ループ多重起動防止
        const el = new Audio(BASE + path);
        el.loop = true;
        el.volume = clampVol(volume);
        el.preload = 'auto';
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
        active.set(path, el);
        return el;
    }

    function stop(path) {
        const el = active.get(path);
        if (!el) return;
        try { el.pause(); } catch (_) {}
        active.delete(path);
    }

    // 画面遷移時の一斉停止。ブツ切れ回避のため短いフェードアウトをかけてから止める。
    // ループ系はフェード不要 (長尺の残響が問題になりにくく、即断の方が切替感が出る)。
    function abortAll(fadeMs = 200) {
        // active (ループ/排他): ループは即停止、exclusive単発はフェード
        for (const el of active.values()) {
            if (el.loop) {
                try { el.pause(); } catch (_) {}
            } else {
                fadeStop(el, fadeMs);
            }
        }
        active.clear();
        // 単発プール側: 再生中のやつだけフェードアウト
        for (const list of pool.values()) {
            for (const { el } of list) {
                if (!el.paused && !el.ended) {
                    fadeStop(el, fadeMs);
                }
            }
        }
    }

    function mute(flag) { muted = !!flag; if (muted) abortAll(); }
    function isMuted() { return muted; }

    function clampVol(v) {
        if (v == null) return 1.0;
        return Math.max(0, Math.min(1, Number(v)));
    }

    // 短くフェードアウトしてから停止 (clipMs 用 + abortAll 用)
    // 再生直後に fade が被って鳴らなくなるのを防ぐため、各要素に _fadeTimer を貯めて
    // 新規 play() 時にキャンセルする (play 側で cancelFade() を呼ぶ)。
    function fadeStop(el, durationMs = 200) {
        if (el.paused) return;
        cancelFade(el);
        const startVol = el.volume;
        const steps = 10;
        const dt = Math.max(10, Math.floor(durationMs / steps));
        let i = 0;
        el._fadeTimer = setInterval(() => {
            i++;
            el.volume = Math.max(0, startVol * (1 - i / steps));
            if (i >= steps) {
                cancelFade(el);
                try { el.pause(); el.volume = startVol; } catch (_) {}
            }
        }, dt);
    }

    function cancelFade(el) {
        if (el && el._fadeTimer) {
            clearInterval(el._fadeTimer);
            el._fadeTimer = null;
        }
    }

    installUnlockGuard();

    // ------------------------------------------------------------
    // セマンティック SE 層
    //   各発火点は SE.fire('correct') / SE.fire('gimmick.b04Zoom') の形で呼ぶ。
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
        correct:       { path: 'se/system/correct.mp3',     volume: 0.7 },
        wrong:         { path: 'se/system/wrong.mp3',       volume: 0.9 },
        timeout:       { path: 'se/system/timeout.mp3',     volume: 0.8, exclusive: true },
        select:        { path: 'se/system/select.mp3',      volume: 0.6 },
        confirm:       { path: 'se/system/confirm.mp3',     volume: 0.8 },
        cancel:        { path: 'se/system/cancel.mp3',      volume: 0.7 },
        keyTap:        { path: 'se/system/key_tap.mp3',     volume: 0.45 },
        keyBs:         { path: 'se/system/key_bs.mp3',      volume: 0.55 },
        // key_ok.mp3 は 4.68s と長すぎて画面遷移でほぼ切れるので、
        // confirm.mp3 (2.93s) に置換。こちらの方が遷移と自然になじむ。
        keyOk:         { path: 'se/system/confirm.mp3',     volume: 0.85, exclusive: true },
        gameOver:      { path: 'se/system/game_over.mp3',   volume: 0.9 },
        menuCursor:    { path: 'se/system/menu_cursor.mp3', volume: 0.5 },
        scoreCount:    { path: 'se/system/score_count.mp3', volume: 0.35 },
        timeWarn:      { path: 'se/system/time_warn.mp3',   volume: 0.8 },
        naviPop:       { path: 'se/system/navi_pop.mp3',    volume: 0.5 },

        // --- 差し替え系 ---
        // タイトル tap-to-start: 元は和太鼓 → PC電源断カッ (b20_out)
        tapStart:      { path: 'se/gimmick/b20_out.mp3',    volume: 0.85 },
        // ステージ開始: 元は男衆掛け声 → PC起動フェードイン (b20_in の頭1.5s)
        stageStart:    { path: 'se/gimmick/b20_in.mp3',     volume: 0.7, clipMs: 1500 },
        // ランク発表: 元はジャジャーン → b17_glitch (ノイズ) の単打 (b20_out 重ねは発火側で)
        rankReveal:    { path: 'se/gimmick/b17_glitch.mp3', volume: 0.9 },
        rankRevealSnap:{ path: 'se/gimmick/b20_out.mp3',    volume: 0.7 },
        // シェア成功: 元は鉄琴キラッ → confirm 流用
        shareOk:       { path: 'se/system/confirm.mp3',     volume: 0.8 },

        // --- gimmick ---
        gB04Zoom:      { path: 'se/gimmick/b04_zoom.mp3',   volume: 0.8 },
        // B05 ミラー: シャキーン差し替え → b17_glitch 短縮
        gB05Mirror:    { path: 'se/gimmick/b17_glitch.mp3', volume: 0.7, clipMs: 600 },
        gB11Charge:    { path: 'se/gimmick/b11_charge.mp3', volume: 0.7 },
        gB11Fire:      { path: 'se/gimmick/b11_fire.mp3',   volume: 0.9 },
        gB16Tick:      { path: 'se/gimmick/b16_tick.mp3',   volume: 0.7 },
        gB16Alarm:     { path: 'se/gimmick/b16_alarm.mp3',  volume: 0.85 },
        gB17Glitch:    { path: 'se/gimmick/b17_glitch.mp3', volume: 0.8 },
        gB18Notify:    { path: 'se/gimmick/b18_notify.mp3', volume: 0.9 },
        gB20In:        { path: 'se/gimmick/b20_in.mp3',     volume: 0.7, clipMs: 3000 },
        gB20Out:       { path: 'se/gimmick/b20_out.mp3',    volume: 0.9 },
        gB21Death:     { path: 'se/gimmick/b21_death.mp3',  volume: 1.0 },
        // B25 キャラ乱入: ポップ差し替え → b18_notify (iOS通知)
        gB25Pop:       { path: 'se/gimmick/b18_notify.mp3', volume: 0.7 },
        // C01 シャッフル: 琴差し替え → w15_warp を短クロップ
        gC01Shuffle:   { path: 'se/gimmick/w15_warp.mp3',   volume: 0.5, clipMs: 400 },
        // C04 嘘50:50: キラッ差し替え → 無音 (null)
        gC04Fake50:    null,
        gG2Betray:     { path: 'se/gimmick/g2_betray.mp3',  volume: 0.9 },
        gGlitchLoop:   { path: 'se/gimmick/glitch_loop.mp3', volume: 0.25, loop: true },
        gW15Warp:      { path: 'se/gimmick/w15_warp.mp3',   volume: 0.7 },
        // W18 キー消失: チーン差し替え → 無音
        gW18Vanish:    null,
    };

    function fire(name) {
        const spec = SE_SPEC[name];
        if (!spec) return null;           // 無音マッピング
        if (spec.loop) return playLoop(spec.path, spec.volume);
        if (spec.exclusive) return playExclusive(spec.path, { volume: spec.volume, clipMs: spec.clipMs });
        return play(spec.path, { volume: spec.volume, clipMs: spec.clipMs });
    }

    function stopNamed(name) {
        const spec = SE_SPEC[name];
        if (!spec) return;
        stop(spec.path);
    }

    window.SE = {
        // 低レベル (path 指定)
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
