/* ============================================================
   save.js — localStorage永続化
   ============================================================ */

(function () {
    const KEY = window.CONFIG.SAVE_KEY;
    const VERSION = window.CONFIG.SAVE_VERSION;

    function defaultData() {
        return {
            version: VERSION,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            player: {
                name: 'PLAYER',
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
    };

    window.Save = Save;
})();
