/* ============================================================
   save.js — localStorage永続化
   ============================================================ */

(function () {
    const KEY = window.CONFIG.SAVE_KEY;
    const VERSION = window.CONFIG.SAVE_VERSION;

    // プレイヤー ID は "混同しにくい英数字" 32 文字プールから 6 桁ランダム。
    //   (0/O/1/I/L/l 等の紛らわしいのは除外)
    // 初回起動時に発行し、以後は不変。表示名 (name) が未設定なら ID を
    // そのまま表示名に使う (= デフォルトで "固有の ID = その人の名前")。
    const ID_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function generatePlayerId(len) {
        if (!len) len = 6;
        let s = '';
        for (let i = 0; i < len; i++) {
            s += ID_POOL[Math.floor(Math.random() * ID_POOL.length)];
        }
        return s;
    }

    function defaultData() {
        return {
            version: VERSION,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            player: {
                id: generatePlayerId(),
                name: null,       // null = "ID をそのまま表示名にする"
                icon: null,       // null = アイコン未選択 (PROFILE で選ばせる。sprite/avatars/manifest.json の id)
            },
            progress: {
                unlockedStage: 1, // stage 1だけ最初から解放
                clearedStages: [], // clearしたstage番号
            },
            scores: {
                // 'stage-1': { best: 12000, bestRank: 'B', plays: 4 }
            },
            flags: {
                tutorialDone: false,
            },
            settings: {
                seVolume: 0.8,    // SE マスター音量 (0〜1)
                bgmVolume: 0.2,   // BGM 音量 (0〜1) — 空気感担当で控えめ
                muted: false,     // 全体ミュート (SE+BGM)
                vibration: true,
            },
        };
    }

    const Save = {
        data: null,

        load() {
            try {
                const raw = localStorage.getItem(KEY);
                if (!raw) {
                    this.data = defaultData();
                    this.persist();
                    return this.data;
                }
                const parsed = JSON.parse(raw);
                if (parsed.version !== VERSION) {
                    console.warn(`save version mismatch (got ${parsed.version}, want ${VERSION}). resetting.`);
                    this.data = defaultData();
                    this.persist();
                    return this.data;
                }
                this.data = parsed;
                // 設定ブロックの後方互換 & 旧デフォルト値の移行
                //   旧 bgmVolume デフォルト 0.35 は実機でうるさいので、
                //   未調整のまま 0.35 が残っているセーブは 0.2 に寄せる。
                //   (ユーザーが自分で 0.35 に設定してた場合も巻き込まれるが、
                //    新デフォルトが正解なので許容)
                if (!this.data.settings) this.data.settings = {};
                const s = this.data.settings;
                if (s.seVolume == null) s.seVolume = 0.8;
                if (s.bgmVolume == null || s.bgmVolume === 0.35) s.bgmVolume = 0.2;
                if (s.muted == null) s.muted = false;
                if (s.vibration == null) s.vibration = true;
                // 2026-04 回復処理: 旧スライダーは min=0 まで下げられたため、
                //   ユーザーが誤操作で SE/BGM 音量を 0 に張り付かせたまま保存 →
                //   "SE だけ鳴らない" 状態で詰むケースがあった。
                //   ごく小さい値 (< 0.02) は誤操作とみなしてデフォルトに戻す。
                //   真の消音は MUTE ALL トグルを使う想定。
                if (typeof s.seVolume === 'number' && s.seVolume < 0.02) s.seVolume = 0.8;
                if (typeof s.bgmVolume === 'number' && s.bgmVolume < 0.02) s.bgmVolume = 0.2;
                // プレイヤーブロックの後方互換:
                //   - id が無ければ発行する
                //   - 旧デフォルト name='PLAYER' は "未設定" 扱いにして ID 表示へ
                if (!this.data.player) this.data.player = {};
                const pl = this.data.player;
                if (!pl.id) pl.id = generatePlayerId();
                if (pl.name === 'PLAYER' || pl.name === undefined) pl.name = null;
                if (pl.icon === undefined) pl.icon = null;
                this.persist();
                return this.data;
            } catch (e) {
                console.error('load failed, resetting', e);
                this.data = defaultData();
                this.persist();
                return this.data;
            }
        },

        persist() {
            if (!this.data) return;
            this.data.updatedAt = Date.now();
            try {
                localStorage.setItem(KEY, JSON.stringify(this.data));
            } catch (e) {
                console.error('persist failed', e);
            }
        },

        reset() {
            localStorage.removeItem(KEY);
            this.data = defaultData();
            this.persist();
        },

        // --- 便利メソッド ---
        isStageUnlocked(no) {
            return no <= (this.data?.progress?.unlockedStage || 1);
        },

        isStageCleared(no) {
            return this.data?.progress?.clearedStages?.includes(no) || false;
        },

        recordStageClear(no, score, rank) {
            if (!this.data) return;
            const prog = this.data.progress;
            if (!prog.clearedStages.includes(no)) {
                prog.clearedStages.push(no);
            }
            prog.unlockedStage = Math.max(prog.unlockedStage, Math.min(no + 1, 10));

            const key = `stage-${no}`;
            const cur = this.data.scores[key] || { best: 0, bestRank: '', plays: 0 };
            cur.plays += 1;
            if (score > cur.best) {
                cur.best = score;
                cur.bestRank = rank;
            }
            this.data.scores[key] = cur;
            this.persist();
        },

        getStageScore(no) {
            return this.data?.scores?.[`stage-${no}`] || null;
        },

        getFlag(key) {
            if (!this.data) return false;
            // 既存セーブデータに flags が無い可能性に対応
            if (!this.data.flags) this.data.flags = {};
            return !!this.data.flags[key];
        },
        setFlag(key, value) {
            if (!this.data) return;
            if (!this.data.flags) this.data.flags = {};
            this.data.flags[key] = !!value;
            this.persist();
        },

        // 設定: default と merge して返す (古いセーブで未定義キーがあっても落ちない)
        getSettings() {
            const def = defaultData().settings;
            if (!this.data) return { ...def };
            return { ...def, ...(this.data.settings || {}) };
        },
        setSetting(key, value) {
            if (!this.data) return;
            if (!this.data.settings) this.data.settings = {};
            this.data.settings[key] = value;
            this.persist();
        },

        // --- プレイヤー情報 ---
        // 表示用の名前: name が未設定 (null/empty) なら ID をそのまま使う
        getPlayerDisplayName() {
            if (!this.data) return '';
            const pl = this.data.player || {};
            const nm = (typeof pl.name === 'string') ? pl.name.trim() : '';
            return nm || pl.id || 'PLAYER';
        },
        getPlayerId() {
            return this.data?.player?.id || '';
        },
        // 名前の保存。空文字/null で "未設定" 扱い (= ID を名前として使う) に戻す。
        // 最大 16 文字に丸める (シェア画像等で崩れないように)。
        setPlayerName(name) {
            if (!this.data) return;
            if (!this.data.player) this.data.player = {};
            if (typeof name === 'string') {
                const trimmed = name.trim().slice(0, 16);
                this.data.player.name = trimmed || null;
            } else {
                this.data.player.name = null;
            }
            this.persist();
        },

        // プレイヤーアイコン (プリセット id)。null で "未選択" に戻す。
        getPlayerIcon() {
            return this.data?.player?.icon || null;
        },
        setPlayerIcon(iconId) {
            if (!this.data) return;
            if (!this.data.player) this.data.player = {};
            if (typeof iconId === 'string' && iconId.length > 0) {
                this.data.player.icon = iconId.slice(0, 32);
            } else {
                this.data.player.icon = null;
            }
            this.persist();
        },
    };

    window.Save = Save;
})();
