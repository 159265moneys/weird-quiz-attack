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

   iOS バックグラウンド復帰対策 (2026-04):
     - 他アプリ → 戻ってきた時 HTMLAudioElement は強制 pause されるため、
       visibilitychange / pageshow を監視して paused 検知 → 再生再開。
     - フェードは setInterval ではなく requestAnimationFrame で回し、
       visibility hidden になったら即完了させる (throttle でフェードが
       中途半端に残るのを防ぐ)。

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
    // 2026-04: メモリ圧迫対策で "title のみ" preload する方針に変更。
    // その他の BGM は play() 時に素直に new Audio() する (数百 ms 遅延は
    // 画面遷移 fade で隠れるので体感しない)。
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
        if (!el) return;
        if (el._fadeRaf) {
            cancelAnimationFrame(el._fadeRaf);
            el._fadeRaf = null;
        }
        // 旧 setInterval ベースの残骸ガード (後方互換)
        if (el._fade) {
            clearInterval(el._fade);
            el._fade = null;
        }
        el._fadeDone = null;
        el._fadeTarget = null;
    }

    // durationMs かけて targetVol にフェード (rAF ベース)。
    //   - visibility hidden になったら throttle で進まないため、visibility 復帰
    //     時に即完了させる処理を別途持つ (installVisibilityHandler 側)。
    //   - onDone は完了 or キャンセル時に呼ばれる (retireEl で早期 disposal される
    //     際に残留 interval を GC 可能にするため)。
    function fadeTo(el, targetVol, durationMs, onDone) {
        if (!el) return;
        cancelFade(el);
        const startVol = clampVol(el.volume);
        const finalVol = clampVol(targetVol);
        const delta    = finalVol - startVol;
        el._fadeTarget = finalVol;   // flushFade で使う最終音量 (fade in の onDone が無い場合用)
        el._fadeDone   = onDone || null;
        if (durationMs <= 0 || Math.abs(delta) < 0.001) {
            try { el.volume = finalVol; } catch (_) {}
            const cb = el._fadeDone;
            el._fadeDone = null;
            el._fadeTarget = null;
            if (cb) cb();
            return;
        }
        const startAt  = performance.now();
        const endAt    = startAt + durationMs;

        const step = (now) => {
            if (!el._fadeRaf) return; // 途中キャンセル
            const t = now >= endAt ? 1 : (now - startAt) / durationMs;
            try { el.volume = clampVol(startVol + delta * t); } catch (_) {}
            if (t >= 1) {
                el._fadeRaf = null;
                el._fadeTarget = null;
                const cb = el._fadeDone;
                el._fadeDone = null;
                if (cb) cb();
            } else {
                el._fadeRaf = requestAnimationFrame(step);
            }
        };
        el._fadeRaf = requestAnimationFrame(step);
    }

    // fade を "今すぐ targetVol まで到達" に早回しする (visibility 復帰時用)。
    //   バックグラウンド中 rAF が throttle され、fade が中途半端な volume で
    //   止まっているので、最終音量まで即代入 → onDone 呼び出しで決着させる。
    function flushFade(el) {
        if (!el || !el._fadeRaf) return;
        const target = (typeof el._fadeTarget === 'number') ? el._fadeTarget : null;
        const cb = el._fadeDone;
        cancelFade(el);
        if (target != null) {
            try { el.volume = target; } catch (_) {}
        }
        if (cb) cb();
    }

    // 新規 Audio を生成 (or preload 済みを掠め取る) して再生開始 (volume=0 から fadeIn)
    function spawnAudio(path, targetVol, fadeInMs) {
        let el = _preloadByPath.get(path);
        let usedPreload = false;
        if (el) {
            // preload 済みの要素を "初回だけ" 再利用する (Map から外す → 2回目以降は new)。
            // これにより初回再生時の fetch 待ちが消える (iOS で特に効く)。
            _preloadByPath.delete(path);
            usedPreload = true;
            // currentTime=0 が設定できなかった場合 (Safari で partial stream 時に
            // 発生することがある) は preload 要素を捨てて新規に作り直す。
            let ok = false;
            try { el.currentTime = 0; ok = (el.currentTime < 0.2); } catch (_) { ok = false; }
            if (!ok) {
                try { el.pause(); } catch (_) {}
                el = null;
                usedPreload = false;
            }
        }
        if (!el) {
            el = new Audio(BASE + encodeURIComponent(path));
            el.preload = 'auto';
        }
        el.loop = false;
        el.volume = 0;
        el._loopTriggered = false;
        el._path = path;

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
        cancelFade(el);                     // fade interval/RAF を確実に止める
        try { el._detachLoopListeners?.(); } catch (_) {}
        try { el.pause(); } catch (_) {}
        try { el.volume = 0; } catch (_) {}
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
        // 再生が止まってる場合 (unlock 前 / バックグラウンド復帰直後) は
        // 下の再開ロジックで拾うのでここでは return しない。
        if (currentName === name && currentEl && !currentEl.paused) return;

        // unlock 前はリクエストだけ覚えて待つ
        if (!unlocked) {
            pendingName = name;
            pendingOpts = opts;
            currentName = name;  // 画面側から見える名前は先に確定
            return;
        }

        // 同一 BGM で、既存 el が paused 状態ならそれを再開するだけ
        // (バックグラウンド復帰時のヒーラー)。currentEl ごと作り直すと
        // その都度冒頭から再生されてしまうので、可能なら継続優先。
        if (currentName === name && currentEl && currentEl.paused) {
            try {
                currentEl.volume = targetVolumeFor(name);
                const p = currentEl.play();
                if (p && p.catch) p.catch(() => {});
                return;
            } catch (_) { /* 落ちたら下の普通の切替へ流す */ }
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
    // 2026-04 方針変更: title のみ preload (メモリ圧迫回避)。
    //   旧実装は 10 以上の stage BGM を全部 new Audio() しており、
    //   使われない要素がブラウザのデコードバッファ保持で WebView メモリを
    //   累積圧迫 → B11 等重ギミック時に OOM で kill される懸念があった。
    //   title は "最初のタップで即音" が体感的に重要なので残す。
    //   stage/result BGM の "数百 ms 遅延" は画面遷移 fade に隠れて気付かない。
    function preloadTitle() {
        const sp = specOf('title');
        if (!sp) return;
        try {
            const el = new Audio();
            el.preload = 'auto';
            el.src = BASE + encodeURIComponent(sp.path);
            el.load();
            _preloadByPath.set(sp.path, el);
        } catch (_) { /* noop */ }
    }

    // ------- visibilitychange / pageshow 対策 (iOS バックグラウンド復帰) -------
    //   他アプリから戻ってきた時 HTMLAudioElement は強制 pause された状態
    //   になる。ここで paused 検知 → 現在の name で play() を再発火する。
    //   pageshow (bfcache 復帰) も同様。
    //   併せて: フェード中だった el は rAF が throttle で止まっていて中途半端
    //   な volume で固まっているので flushFade() で完了まで早回し。
    function resumeFromBackground() {
        // rAF throttle で途中停止した fade を強制完了
        if (currentEl) flushFade(currentEl);
        fadingEls.forEach(flushFade);

        if (muted) return;   // ミュート中は何もしない
        if (!currentName) return;

        // currentEl が null / paused なら play() 再発火で復旧
        if (!currentEl || currentEl.paused) {
            const cn = currentName;
            currentName = null;    // play() の idempotent チェックを通すため
            play(cn);
        }
    }
    function installVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // resume を次フレームに遅延 (visible イベントと同期で Audio API
                // を叩くと iOS で失敗することがあるため)
                setTimeout(resumeFromBackground, 60);
            }
        });
        // pageshow: bfcache から復帰したケース (iOS Safari でよくある)
        window.addEventListener('pageshow', (ev) => {
            if (ev.persisted) setTimeout(resumeFromBackground, 60);
        });
        // focus: PWA として起動した場合の保険
        window.addEventListener('focus', () => {
            setTimeout(resumeFromBackground, 60);
        });
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
    installVisibilityHandler();
    // スクリプト読込直後に title だけキャッシュ温め開始
    try { preloadTitle(); } catch (_) {}

    window.BGM = {
        play,
        stop,
        setVolume,
        getVolume,
        mute,
        isMuted,
    };
})();
