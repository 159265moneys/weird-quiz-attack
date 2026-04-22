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
    // 同SE同時再生上限。短尺のタップ音/スコアtick等は連打されると
    // 6 では足りず、プール満杯で oldest を強制上書き = "前に鳴ったやつが
    // 途中で消される" という現象が起きるため余裕を持って 16 にする。
    const MAX_POOL_PER_KEY = 16;

    // path -> [{el, expiresAt}] のプール (単発用 / 終了を待たず再利用)
    const pool = new Map();
    // loop/exclusive 用の現在再生中マップ (key -> HTMLAudioElement)
    const active = new Map();
    // ミュート状態 (後でオプション画面とか繋げる)
    let muted = false;
    let unlocked = false;
    // マスター音量 (設定画面から変更される)。spec.volume に掛け合わせて適用。
    let masterVolume = 1.0;

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
        // 念のためアンロック直後にも preloadAll (スクリプト読込直後の fetch が
        // まだ届いてなかったり キャッシュ弾きされた場合のリトライ) を走らせる。
        try { preloadAll(); } catch (_) {}
    }

    // 指定 path の Audio を 1 本だけ pool に先置きしてデコードをキックする
    function preload(path) {
        let list = pool.get(path);
        if (!list) { list = []; pool.set(path, list); }
        if (list.length > 0) return;
        const el = new Audio(BASE + path);
        el.preload = 'auto';
        try { el.load(); } catch (_) {}
        list.push({ el });
    }

    function preloadAll() {
        const seen = new Set();
        for (const name in SE_SPEC) {
            const spec = SE_SPEC[name];
            if (!spec || !spec.path) continue;
            if (seen.has(spec.path)) continue;
            seen.add(spec.path);
            preload(spec.path);
        }
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
        // 終了/一時停止のインスタンスがあれば再利用 (再生中のものは触らない)
        for (const entry of list) {
            if (entry.el.ended || entry.el.paused) return entry.el;
        }
        if (list.length < MAX_POOL_PER_KEY) {
            const el = new Audio(BASE + path);
            el.preload = 'auto';
            list.push({ el });
            return el;
        }
        // 上限到達 = 全て再生中。やむを得ず最もゴールに近い (currentTime が
        // duration に近い) 1 本を選んで再利用する。list[0] 固定だと、
        // 冒頭から鳴り始めた SE が一番早く犠牲になるので。
        let victim = list[0].el;
        let bestRatio = 0;
        for (const { el } of list) {
            const dur = el.duration || 1;
            const r = (el.currentTime || 0) / dur;
            if (r > bestRatio) { bestRatio = r; victim = el; }
        }
        try { victim.pause(); } catch (_) {}
        victim.currentTime = 0;
        return victim;
    }

    function play(path, opts = {}) {
        if (muted) return null;

        // "排他" は opts.key を明示的に渡した時 (= playExclusive/playLoop 経由)
        // に限定する。非排他の通常 play() が、前に鳴ったループや exclusive
        // SE を勝手に止めてしまう事故を防ぐ。
        // (以前は const key = opts.key || path で active を常に参照していたため、
        //  たまたま同じ path を使う非排他 SE が先行 SE を蹴っていた)
        if (opts.key) {
            const prev = active.get(opts.key);
            if (prev) { try { prev.pause(); } catch (_) {} active.delete(opts.key); }
        }

        const el = acquire(path);
        // 以前のこの el に仕掛けた fade / clip タイマーを全部解除してから再生する。
        // これをやらないと、"前回の play で予約された setTimeout(fadeStop) が
        // 再利用された新しい再生を途中で殺す" 事故が起きる。
        // (同 path を連打した時に「2回目の音がプツッと切れる」症状の根本原因)
        cancelFade(el);
        cancelClip(el);
        el.loop = false;
        // spec.volume * masterVolume をかけて適用 (設定画面のスライダと連動)
        const baseVol = opts.volume == null ? 1.0 : Number(opts.volume);
        el.volume = clampVol(baseVol * masterVolume);
        // abortAll が画面遷移時にこの SE を強制停止するか判定する印。
        // true なら次画面の頭に被って完走させる (正解/不正解音など)。
        if (opts.persist) el.dataset.persistOnTransition = '1';
        else delete el.dataset.persistOnTransition;
        // 先頭無音スキップ (opts.startOffsetMs 指定時、その位置から再生開始)。
        // SE 素材の頭に 50-200ms の無音マージンがあるとユーザー体感で "SE が遅れる" と
        // 感じるので、該当 SE だけこっちで補正する。
        const offsetSec = (opts.startOffsetMs || 0) / 1000;
        try { el.currentTime = offsetSec; } catch (_) {}
        const playPromise = el.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});

        if (opts.key) active.set(opts.key, el);

        if (opts.clipMs) {
            // 新しい clipTimer を保持 (次回 play/abortAll 時にキャンセルできるよう)
            el._clipTimer = setTimeout(() => {
                el._clipTimer = null;
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
        el.volume = clampVol(volume * masterVolume);
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
    //   force = true: persistOnTransition も含めて完全停止 (ミュート時用)
    function abortAll(fadeMs = 200, force = false) {
        // active (ループ/排他): ループは即停止、exclusive単発はフェード
        // persistOnTransition が立っている要素は完走させる (active からだけ外す)
        for (const el of active.values()) {
            if (!force && el.dataset.persistOnTransition === '1') continue;
            // 停止時に stale な clip/fade timer が残ると、後で reuse された時に
            // 新しい再生を殺す原因になる。abortAll 時点で明示的にクリア。
            cancelClip(el);
            if (el.loop) {
                try { el.pause(); } catch (_) {}
            } else {
                fadeStop(el, fadeMs);
            }
        }
        // active からは persist 要素も外す (次画面で同じ key の再生を妨げないように)
        active.clear();
        // 単発プール側: 再生中のやつだけフェードアウト (persist は飛ばす)
        for (const list of pool.values()) {
            for (const { el } of list) {
                if (!force && el.dataset.persistOnTransition === '1') continue;
                cancelClip(el);
                if (!el.paused && !el.ended) {
                    fadeStop(el, fadeMs);
                }
            }
        }
    }

    // ミュートは persist 音も含め完全停止 (ユーザー操作を尊重)。
    function mute(flag) { muted = !!flag; if (muted) abortAll(200, true); }
    function isMuted() { return muted; }

    function clampVol(v) {
        if (v == null) return 1.0;
        return Math.max(0, Math.min(1, Number(v)));
    }

    // 短くフェードアウトしてから停止 (clipMs 用 + abortAll 用)
    // 再生直後に fade が被って鳴らなくなるのを防ぐため、各要素に _fadeTimer を貯めて
    // 新規 play() 時にキャンセルする (play 側で cancelFade() を呼ぶ)。
    function fadeStop(el, durationMs = 200) {
        // 先に stale timer をクリア (paused で早期 return しても timer が残らないよう)
        cancelFade(el);
        if (el.paused) return;
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

    // clipMs 用の stale な停止タイマーを解除。
    // play() が pool から古い el を再利用するとき、前回の setTimeout(fadeStop)
    // が残っていると新しい再生を途中で殺すので必ず呼ぶ。
    function cancelClip(el) {
        if (el && el._clipTimer) {
            clearTimeout(el._clipTimer);
            el._clipTimer = null;
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
        // 正解/不正解は画面遷移で中断させない (persistOnTransition: true)。
        // 次の問題の頭に被っても良いので、最後まで聞かせたい。
        correct:       { path: 'se/system/correct.mp3',     volume: 0.7, persistOnTransition: true },
        wrong:         { path: 'se/system/wrong.mp3',       volume: 0.9, persistOnTransition: true },
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
        const spec = SE_SPEC[name];
        if (!spec) return null;           // 無音マッピング
        if (spec.loop) return playLoop(spec.path, spec.volume);
        const opts = {
            volume: spec.volume,
            clipMs: spec.clipMs,
            persist: !!spec.persistOnTransition,
            // SE 素材の頭に無音があるやつはここで個別に skip させる
            startOffsetMs: spec.startOffsetMs,
        };
        if (spec.exclusive) return playExclusive(spec.path, opts);
        return play(spec.path, opts);
    }

    function setMasterVolume(v) {
        masterVolume = clampVol(v);
    }
    function getMasterVolume() { return masterVolume; }

    function stopNamed(name) {
        const spec = SE_SPEC[name];
        if (!spec) return;
        stop(spec.path);
    }

    // スクリプト読込直後に全 SE の fetch & decode を開始。
    // `new Audio()` 自体は user-activation を要求しないので autoplay block の
    // 影響を受けない。これにより「初回 SE が 0.x 秒遅れる (decode 待ち)」症状を解消。
    try { preloadAll(); } catch (_) {}

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
