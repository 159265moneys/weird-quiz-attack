/* ============================================================
   bgm.js — BGM 管理 (クロスフェードループ + 画面間クロスフェード)
   ------------------------------------------------------------
   設計方針:
     - 各トラックは loop=false で再生し、尻尾 CROSSFADE_MS 秒前から
       次ループ(= 同ファイルを time=0 から)を被せて再生することで、
       "フェードアウトしつつシームレスに頭に戻る" 挙動を実現する。
     - 画面遷移で別 BGM に切替える時もクロスフェードで繋ぐ
       (opts.sequential=true の場合は "完全 fadeout → 再生" に切替)。
     - 同じ name を play() しても中断しない (idempotent)。
     - iOS autoplay 制限下で play() が弾かれた時は、最初のユーザー操作で
       自動リトライする (SE の unlockOnce と連動)。
     - 各 BGM はファイル毎にマスタリング音量がバラつくため、
       BGM_SPEC で "gain" を指定して個別に補正する。
       特に game 中の BGM は小さめに絞って SE を前に出す。

   API:
     BGM.play(name, opts?)     — name にマッピングされたトラックを再生/切替
                                  opts.sequential=true で "前BGMを完全消してから再生"
     BGM.stop(fadeMs?)         — フェードアウトして停止
     BGM.setVolume(v)          — 基本音量 0〜1
     BGM.mute(flag)            — ミュート切替
   ============================================================ */

(function () {
    const BASE = 'audio/bgm/';

    // 画面 name -> { path, gain }
    //   gain: そのトラックの相対音量 (0〜1)。
    //         game 中の BGM は SE を埋もれさせないため 0.4 前後に絞る。
    //         title/stage select は空気感を出したいので少し高め。
    const BGM_SPEC = {
        title:   { path: 'title&main.mp3', gain: 1.00 },   // title & stageSelect 共通
        stage1:  { path: 'stage1,5.mp3',   gain: 0.40 },
        stage2:  { path: 'stage2,6.mp3',   gain: 0.40 },
        stage3:  { path: 'stage3,7.mp3',   gain: 0.40 },
        stage4:  { path: 'stage4,8.mp3',   gain: 0.40 },
        stage5:  { path: 'stage1,5.mp3',   gain: 0.40 },
        stage6:  { path: 'stage2,6.mp3',   gain: 0.40 },
        stage7:  { path: 'stage3,7.mp3',   gain: 0.40 },
        stage8:  { path: 'stage4,8.mp3',   gain: 0.40 },
        stage9:  { path: 'stage9.mp3',     gain: 0.45 },
        stage10: { path: 'stage10.mp3',    gain: 0.45 },
        result:  { path: 'Result.mp3',     gain: 0.85 },
    };

    // ------- 設定 -------
    const CROSSFADE_MS   = 3000;   // 尻尾クロスフェードループ長
    const SWITCH_FADE_MS = 800;    // 別 BGM 切替時のクロスフェード長 (通常切替)
    const SEQ_FADEOUT_MS = 450;    // sequential モード: 前 BGM を消す時間
    const SEQ_FADEIN_MS  = 600;    // sequential モード: 新 BGM を fade in する時間
    const DEFAULT_VOL    = 0.2;    // BGM は空気感担当 (SE よりはっきり小さく)

    // ------- 状態 -------
    let currentName = null;
    let currentEl   = null;        // 今の本体 (再生中)
    let fadingEls   = new Set();   // フェードアウト中の旧 el たち (GC 防止参照)
    let baseVolume  = DEFAULT_VOL;
    let muted       = false;
    let pendingName = null;        // unlock 前に play() されたやつを覚えておく
    let pendingOpts = null;
    let unlocked    = false;

    // path -> Audio 要素 (preload 済みで未使用のもの)。最初の spawnAudio で
    // 取り出して再生に使うことで "fetch → 再生開始" の遅延をゼロにする。
    const _preloadByPath = new Map();

    // ------- ユーティリティ -------
    function clampVol(v) { return Math.max(0, Math.min(1, Number(v))); }

    function specOf(name) {
        const s = BGM_SPEC[name];
        if (!s) return null;
        if (typeof s === 'string') return { path: s, gain: 1.0 };
        return s;
    }

    // そのトラックの "目標音量" を算出 (mute/基本音量/トラックゲイン を合成)
    function targetVolumeFor(name) {
        if (muted) return 0;
        const sp = specOf(name);
        const g = sp ? (sp.gain ?? 1.0) : 1.0;
        return clampVol(baseVolume * g);
    }

    function cancelFade(el) {
        if (el && el._fade) {
            clearInterval(el._fade);
            el._fade = null;
        }
    }

    // durationMs かけて targetVol にフェード。完了時に onDone。
    function fadeTo(el, targetVol, durationMs, onDone) {
        if (!el) return;
        cancelFade(el);
        const startVol = el.volume;
        const steps = Math.max(10, Math.floor(durationMs / 50));
        const dt = Math.floor(durationMs / steps);
        let i = 0;
        el._fade = setInterval(() => {
            i++;
            const v = startVol + (targetVol - startVol) * (i / steps);
            try { el.volume = clampVol(v); } catch (_) {}
            if (i >= steps) {
                try { el.volume = clampVol(targetVol); } catch (_) {}
                cancelFade(el);
                if (onDone) onDone();
            }
        }, dt);
    }

    // 新規 Audio を生成 (or preload 済みを掠め取る) して再生開始 (volume=0 から fadeIn)
    function spawnAudio(path, targetVol, fadeInMs) {
        let el = _preloadByPath.get(path);
        if (el) {
            // preload 済みの要素を "初回だけ" 再利用する (Map から外す → 2回目以降は new)。
            // これにより初回再生時の fetch 待ちが消える (iOS で特に効く)。
            _preloadByPath.delete(path);
            try { el.currentTime = 0; } catch (_) {}
        } else {
            el = new Audio(BASE + encodeURIComponent(path));
            el.preload = 'auto';
        }
        el.loop = false;
        el.volume = 0;
        el._loopTriggered = false;

        // ---- ループ検知: timeupdate + ended 二段構え ----
        // 旧実装は requestAnimationFrame で尻尾を監視していたが、iOS Safari / WKWebView
        // では user gesture の無い再生中に rAF が throttle (最悪 0Hz) されて尻尾検知を逃し、
        // loop=false の audio が自然終了 → 無音で固まる問題があった。
        // Audio 要素の `timeupdate` は再生中 ~4Hz で確実に発火するのでこちらで検知する。
        // また万一 timeupdate も逃した場合の safety-net として `ended` でも強制ループ。
        const onTimeUpdate = () => {
            if (el !== currentEl) return;        // 既に入替済 → 無視
            if (el._loopTriggered) return;
            const dur = el.duration;
            if (!dur || !isFinite(dur) || dur <= 0) return;
            const remainMs = (dur - el.currentTime) * 1000;
            if (remainMs > 0 && remainMs <= CROSSFADE_MS) {
                el._loopTriggered = true;
                triggerSelfLoop();
            }
        };
        const onEnded = () => {
            // クロスフェード検知を逃した場合のリカバリ。el が fade out 中で
            // currentEl でなければ無視 (そっちは意図した終了)。
            if (el !== currentEl) return;
            if (!el._loopTriggered) {
                el._loopTriggered = true;
                triggerSelfLoop();
            }
        };
        el.addEventListener('timeupdate', onTimeUpdate);
        el.addEventListener('ended',       onEnded);
        el._detachLoopListeners = () => {
            el.removeEventListener('timeupdate', onTimeUpdate);
            el.removeEventListener('ended',       onEnded);
        };

        const p = el.play();
        if (p && p.catch) {
            p.catch(() => {
                // 再生失敗 (iOS autoplay ブロック等)。pending に置き直してリトライ待ち。
                pendingName = currentName;
                pendingOpts = null;
            });
        }
        fadeTo(el, targetVol, fadeInMs);
        return el;
    }

    // 旧 el のリスナを外して pause する (retire)。
    // 注: 呼び出し時点で currentEl から外して fadingEls に移していることが前提。
    function retireEl(el) {
        if (!el) return;
        try { el._detachLoopListeners?.(); } catch (_) {}
        try { el.pause(); } catch (_) {}
        fadingEls.delete(el);
    }

    // 現在 el の尻尾にクロスフェードでもう 1 本同じファイルを被せる (= ループ)
    function triggerSelfLoop() {
        if (!currentName || !currentEl) return;
        const sp = specOf(currentName);
        if (!sp) return;

        const oldEl = currentEl;

        // 旧 el を CROSSFADE_MS かけて 0 へ、終わったら pause & 参照解放 & リスナ除去
        fadingEls.add(oldEl);
        fadeTo(oldEl, 0, CROSSFADE_MS, () => retireEl(oldEl));

        // 新 el を time=0 で fadeIn しながら再生
        const targetVol = targetVolumeFor(currentName);
        currentEl = spawnAudio(sp.path, targetVol, CROSSFADE_MS);
    }

    // 旧 BGM を一斉にフェードアウト (別 BGM への切替時)
    function fadeOutCurrent(fadeMs, onDone) {
        if (currentEl) {
            const old = currentEl;
            fadingEls.add(old);
            fadeTo(old, 0, fadeMs, () => {
                retireEl(old);
                if (onDone) onDone();
            });
            currentEl = null;
        } else if (onDone) {
            onDone();
        }
    }

    // ------- 公開 API -------
    function play(name, opts) {
        opts = opts || {};
        // 未知 name は無視 (null 指定で停止扱い)
        if (!name) { stop(); return; }
        if (!BGM_SPEC[name]) return;

        // 同一 BGM を再リクエスト → 何もしない (idempotent)。
        // 再生が止まってる場合 (unlock 前など) はそのまま通して再試行。
        if (currentName === name && currentEl && !currentEl.paused) return;

        // unlock 前はリクエストだけ覚えて待つ
        if (!unlocked) {
            pendingName = name;
            pendingOpts = opts;
            currentName = name;  // 画面側から見える名前は先に確定
            return;
        }

        const sp = specOf(name);
        const targetVol = targetVolumeFor(name);

        if (opts.sequential) {
            // 前 BGM を完全に消してから新 BGM を発火 (ムラ対策)。
            // これにより "クロスフェードで 2 曲が混ざってガサつく" 感が消える。
            fadeOutCurrent(SEQ_FADEOUT_MS, () => {
                currentName = name;
                currentEl = spawnAudio(sp.path, targetVol, SEQ_FADEIN_MS);
            });
            currentName = name;  // 見かけ上の "今の BGM" は先に切替
            return;
        }

        // 通常切替 (クロスフェード)
        fadeOutCurrent(SWITCH_FADE_MS);
        currentName = name;
        currentEl = spawnAudio(sp.path, targetVol, SWITCH_FADE_MS);
    }

    function stop(fadeMs) {
        if (fadeMs == null) fadeMs = SWITCH_FADE_MS;
        currentName = null;
        pendingName = null;
        pendingOpts = null;
        fadeOutCurrent(fadeMs);
    }

    function setVolume(v) {
        baseVolume = clampVol(v);
        if (currentEl && currentName && !muted) {
            fadeTo(currentEl, targetVolumeFor(currentName), 300);
        }
    }

    function getVolume() { return baseVolume; }

    function mute(flag) {
        muted = !!flag;
        if (muted) {
            if (currentEl) fadeTo(currentEl, 0, 250);
            fadingEls.forEach(el => fadeTo(el, 0, 250));
        } else {
            if (currentEl && currentName) fadeTo(currentEl, targetVolumeFor(currentName), 500);
        }
    }

    function isMuted() { return muted; }

    // ------- プリロード -------
    // script 読込時点で各 BGM ファイルを fetch してキャッシュを温めておく。
    // さらにここで作った Audio 要素は spawnAudio 内で "初回再生" にそのまま
    // 再利用する (Map から取り出して使う) ので、ユーザーの最初のタップで
    // 即座に音が出る (fetch 待ちゼロ)。
    function preloadAll() {
        const seen = new Set();
        for (const name in BGM_SPEC) {
            const sp = specOf(name);
            if (!sp || !sp.path || seen.has(sp.path)) continue;
            seen.add(sp.path);
            try {
                const el = new Audio();
                el.preload = 'auto';
                el.src = BASE + encodeURIComponent(sp.path);
                el.load();
                _preloadByPath.set(sp.path, el);
            } catch (_) { /* noop */ }
        }
    }

    // ------- unlock 連動 -------
    // 最初のユーザー操作で unlocked フラグを立て、pendingName があれば再生。
    // capture: true で登録することで、画面側の stopPropagation 等に邪魔されず
    // 確実に最初の user gesture を拾う (初回起動時 BGM 鳴らない対策)。
    function installUnlock() {
        const handler = () => {
            if (unlocked) return;
            unlocked = true;
            document.removeEventListener('pointerdown', handler, true);
            document.removeEventListener('touchstart',  handler, true);
            document.removeEventListener('click',       handler, true);
            document.removeEventListener('keydown',     handler, true);
            if (pendingName) {
                const n = pendingName;
                const o = pendingOpts;
                pendingName = null;
                pendingOpts = null;
                currentName = null;   // play() の idempotent チェックを通すため
                play(n, o || {});
            }
        };
        document.addEventListener('pointerdown', handler, true);
        document.addEventListener('touchstart',  handler, true);
        document.addEventListener('click',       handler, true);
        document.addEventListener('keydown',     handler, true);
    }

    installUnlock();
    // スクリプト読込直後にキャッシュ温め開始 (鳴り始めの遅延対策)
    try { preloadAll(); } catch (_) {}

    window.BGM = {
        play,
        stop,
        setVolume,
        getVolume,
        mute,
        isMuted,
    };
})();
