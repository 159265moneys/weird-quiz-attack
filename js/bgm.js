/* ============================================================
   bgm.js — BGM 管理 (クロスフェードループ + 画面間クロスフェード)
   ------------------------------------------------------------
   設計方針:
     - 各トラックは loop=false で再生し、尻尾 CROSSFADE_MS 秒前から
       次ループ(= 同ファイルを time=0 から)を被せて再生することで、
       "フェードアウトしつつシームレスに頭に戻る" 挙動を実現する。
     - 画面遷移で別 BGM に切替える時もクロスフェードで繋ぐ。
     - 同じ name を play() しても中断しない (idempotent)。
     - iOS autoplay 制限下で play() が弾かれた時は、最初のユーザー操作で
       自動リトライする (SE の unlockOnce と連動)。

   API:
     BGM.play(name)   — name にマッピングされたトラックを再生/切替
     BGM.stop()       — フェードアウトして停止
     BGM.setVolume(v) — 基本音量 0〜1
     BGM.mute(flag)   — ミュート切替
   ============================================================ */

(function () {
    const BASE = 'audio/bgm/';

    // 画面 name -> ファイル名
    const BGM_SPEC = {
        title:   'title&main.mp3',       // title & stageSelect 共通
        stage1:  'stage1,5.mp3',
        stage2:  'stage2,6.mp3',
        stage3:  'stage3,7.mp3',
        stage4:  'stage4,8.mp3',
        stage5:  'stage1,5.mp3',
        stage6:  'stage2,6.mp3',
        stage7:  'stage3,7.mp3',
        stage8:  'stage4,8.mp3',
        stage9:  'stage9.mp3',
        stage10: 'stage10.mp3',
        result:  'Result.mp3',
    };

    // ------- 設定 -------
    const CROSSFADE_MS   = 3000;   // 尻尾クロスフェード長
    const SWITCH_FADE_MS = 800;    // 別 BGM 切替時のフェード長
    const DEFAULT_VOL    = 0.2;    // BGM は空気感担当 (SE よりはっきり小さく)

    // ------- 状態 -------
    let currentName = null;
    let currentEl   = null;        // 今の本体 (再生中)
    let fadingEls   = new Set();   // フェードアウト中の旧 el たち (GC 防止参照)
    let baseVolume  = DEFAULT_VOL;
    let muted       = false;
    let watchRAF    = 0;
    let pendingName = null;        // unlock 前に play() されたやつを覚えておく
    let unlocked    = false;

    // preload 用の Audio 要素保持 (GC 防止 + ブラウザキャッシュ温め)。
    // script 読込時点で fetch を走らせて、最初の play() で一瞬遅延するのを防ぐ。
    const _preloadRefs = [];

    // ------- ユーティリティ -------
    function clampVol(v) { return Math.max(0, Math.min(1, Number(v))); }

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

    // 新規 Audio を生成して再生開始 (volume=0 から fadeIn)
    function spawnAudio(path, targetVol, fadeInMs) {
        // "title&main.mp3" の "&" 等を含むファイル名を安全に取り扱うためエンコード。
        const el = new Audio(BASE + encodeURIComponent(path));
        el.preload = 'auto';
        el.loop = false;                // ループは自前クロスフェードで
        el.volume = 0;
        const p = el.play();
        if (p && p.catch) {
            p.catch(() => {
                // 再生に失敗 (iOS autoplay ブロック等)。pending に置き直してリトライ待ち。
                pendingName = currentName;
            });
        }
        fadeTo(el, targetVol, fadeInMs);
        return el;
    }

    // 現在 el の尻尾監視ループ。残り時間が CROSSFADE_MS を切ったら次ループを被せる。
    function startWatcher() {
        if (watchRAF) return;
        const tick = () => {
            if (currentEl && !currentEl._loopTriggered) {
                const dur = currentEl.duration;
                if (dur && isFinite(dur) && dur > 0) {
                    const remainMs = (dur - currentEl.currentTime) * 1000;
                    if (remainMs > 0 && remainMs <= CROSSFADE_MS) {
                        currentEl._loopTriggered = true;
                        triggerSelfLoop();
                    }
                }
            }
            watchRAF = requestAnimationFrame(tick);
        };
        watchRAF = requestAnimationFrame(tick);
    }

    // 現在 el の尻尾にクロスフェードでもう 1 本同じファイルを被せる (= ループ)
    function triggerSelfLoop() {
        if (!currentName || !currentEl) return;
        const path = BGM_SPEC[currentName];
        if (!path) return;

        const oldEl = currentEl;

        // 旧 el を CROSSFADE_MS かけて 0 へ、終わったら pause & 参照解放
        fadingEls.add(oldEl);
        fadeTo(oldEl, 0, CROSSFADE_MS, () => {
            try { oldEl.pause(); } catch (_) {}
            fadingEls.delete(oldEl);
        });

        // 新 el を time=0 で fadeIn しながら再生
        const targetVol = muted ? 0 : baseVolume;
        const newEl = spawnAudio(path, targetVol, CROSSFADE_MS);
        newEl._loopTriggered = false;
        currentEl = newEl;
    }

    // 旧 BGM を一斉にフェードアウト (別 BGM への切替時)
    function fadeOutCurrent(fadeMs) {
        if (currentEl) {
            const old = currentEl;
            fadingEls.add(old);
            fadeTo(old, 0, fadeMs, () => {
                try { old.pause(); } catch (_) {}
                fadingEls.delete(old);
            });
            currentEl = null;
        }
    }

    // ------- 公開 API -------
    function play(name) {
        // 未知 name は無視 (null 指定で停止扱い)
        if (!name) { stop(); return; }
        if (!BGM_SPEC[name]) return;

        // 同一 BGM を再リクエスト → 何もしない (idempotent)。
        // 再生が止まってる場合 (unlock 前など) はそのまま通して再試行。
        if (currentName === name && currentEl && !currentEl.paused) return;

        // unlock 前はリクエストだけ覚えて待つ
        if (!unlocked) {
            pendingName = name;
            currentName = name;  // 画面側から見える名前は先に確定
            return;
        }

        // 既存 BGM を SWITCH_FADE_MS でフェードアウト
        fadeOutCurrent(SWITCH_FADE_MS);

        currentName = name;
        const targetVol = muted ? 0 : baseVolume;
        currentEl = spawnAudio(BGM_SPEC[name], targetVol, SWITCH_FADE_MS);
        currentEl._loopTriggered = false;
        startWatcher();
    }

    function stop(fadeMs = SWITCH_FADE_MS) {
        currentName = null;
        pendingName = null;
        fadeOutCurrent(fadeMs);
        // fadingEls 全部はそのままフェードアウト継続
    }

    function setVolume(v) {
        baseVolume = clampVol(v);
        if (currentEl && !muted) {
            fadeTo(currentEl, baseVolume, 300);
        }
    }

    function getVolume() { return baseVolume; }

    function mute(flag) {
        muted = !!flag;
        if (muted) {
            if (currentEl) fadeTo(currentEl, 0, 250);
            fadingEls.forEach(el => fadeTo(el, 0, 250));
        } else {
            if (currentEl) fadeTo(currentEl, baseVolume, 500);
        }
    }

    function isMuted() { return muted; }

    // ------- プリロード -------
    // script 読込時点で各 BGM ファイルを fetch してキャッシュを温めておく。
    // iOS でも `el.src = ...; el.load()` は user-gesture 無しで fetch を
    // キックする (play() のみが gesture 必須)。
    // ※ 参照を保持しないとフェッチ中に GC されて取り消される可能性があるので
    //   _preloadRefs に残す。
    function preloadAll() {
        const seen = new Set();
        for (const name in BGM_SPEC) {
            const path = BGM_SPEC[name];
            if (!path || seen.has(path)) continue;
            seen.add(path);
            try {
                const el = new Audio();
                el.preload = 'auto';
                el.src = BASE + encodeURIComponent(path);
                el.load();
                _preloadRefs.push(el);
            } catch (_) { /* noop */ }
        }
    }

    // ------- unlock 連動 -------
    // 最初のユーザー操作で unlocked フラグを立て、pendingName があれば再生。
    function installUnlock() {
        const handler = () => {
            unlocked = true;
            document.removeEventListener('pointerdown', handler);
            document.removeEventListener('touchstart', handler);
            document.removeEventListener('keydown', handler);
            if (pendingName) {
                const n = pendingName;
                pendingName = null;
                currentName = null;   // play() の idempotent チェックを通すため
                play(n);
            }
        };
        document.addEventListener('pointerdown', handler, { once: false });
        document.addEventListener('touchstart',  handler, { once: false });
        document.addEventListener('keydown',     handler, { once: false });
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
