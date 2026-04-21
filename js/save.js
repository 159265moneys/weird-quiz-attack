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
            settings: {
                soundVolume: 0.8,
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
    };

    window.Save = Save;
})();
