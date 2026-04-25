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
    // YYYY-MM-DD (端末ローカル時刻) を返す。連続ログイン判定用。
    //   toISOString() は UTC ベースなので深夜帯で日付がズレる → 自前で組む。
    function ymdLocal(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

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
                // プリセットアイコンの解放状況。
                //   butterfly / puzzle: 最初から選択可 (デフォルト顔)
                //   jellyfish / tv / phonograph: ゲーム内でアンロックして初めて
                //   選べるようになる (初回アンロック時に result 画面で popup)。
                unlockedIcons: ['butterfly', 'puzzle'],
            },
            scores: {
                // 'stage-1': { best: 12000, bestRank: 'B', plays: 4 }
            },
            // ログイン (= ホーム画面到達) の追跡。連続日数バッジに使う。
            //   lastPlayDate : 最後にホームを開いた日 (ローカル時刻 YYYY-MM-DD)
            //   streak       : 連続日数 (1 始まり、間が空いたら 1 に戻る)
            session: {
                lastPlayDate: null,
                streak: 0,
            },
            // 達成バッジ。js/achievements.js のカタログ id を配列で保持。
            achievements: [],
            // 図鑑用「過去に発動を見たことがあるギミック ID」の配列。
            // 1度でも apply されたら追加。図鑑では未開放の場合 ??? 表示にする。
            encounteredGimmicks: [],
            flags: {
                tutorialDone: false,
            },
            settings: {
                seVolume: 0.8,    // SE マスター音量 (0〜1)
                bgmVolume: 0.2,   // BGM 音量 (0〜1) — 空気感担当で控えめ
                muted: false,     // 全体ミュート (SE+BGM)
                vibration: true,
                rankingEnabled: true, // オンラインランキング参加 (クリア時自動送信)
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
                if (s.rankingEnabled == null) s.rankingEnabled = true;
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
                // progress ブロックの後方互換 (unlockedIcons は 2026-04 追加)
                if (!this.data.progress) this.data.progress = { unlockedStage: 1, clearedStages: [], unlockedIcons: [] };
                const prog = this.data.progress;
                if (!Array.isArray(prog.unlockedIcons)) prog.unlockedIcons = [];
                // butterfly / puzzle は常に持っているものとして保証
                for (const baseId of ['butterfly', 'puzzle']) {
                    if (!prog.unlockedIcons.includes(baseId)) prog.unlockedIcons.push(baseId);
                }
                // session ブロックの後方互換 (2026-04 追加: 連続日数)
                if (!this.data.session || typeof this.data.session !== 'object') {
                    this.data.session = { lastPlayDate: null, streak: 0 };
                }
                // achievements 配列の後方互換 (2026-04 追加)
                if (!Array.isArray(this.data.achievements)) {
                    this.data.achievements = [];
                }
                // encounteredGimmicks 配列の後方互換 (2026-04 追加)
                if (!Array.isArray(this.data.encounteredGimmicks)) {
                    this.data.encounteredGimmicks = [];
                }
                // 旧セーブで既に jellyfish/tv/phonograph を選択してた人は
                //   "没収しない" ポリシー: 選択中アイコンを所持扱いにする
                if (pl.icon && !prog.unlockedIcons.includes(pl.icon)) {
                    prog.unlockedIcons.push(pl.icon);
                }
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

        // ランクが "クリア基準" (デフォルト B) 以上か。
        //   SS > S > A > B > C > D > E > F の順序で判定する。
        //   死亡エンド時は Scoring 側で rank='F' になるため必然的に false。
        isRankClearing(rank) {
            const ORDER = window.CONFIG.RANK_ORDER || ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
            const threshold = window.CONFIG.CLEAR_RANK_THRESHOLD || 'B';
            const ti = ORDER.indexOf(threshold);
            const ri = ORDER.indexOf(rank);
            if (ti < 0 || ri < 0) return false;
            return ri <= ti;  // 配列前方ほど上位 = 数字が小さい = clear
        },

        // ステージ完了処理。プレイ回数とベストスコアは「ランクに関わらず」常に記録する
        //   (ランキングや BEST 表示の連続性を保つため) が、
        //   "クリア済み" マーク + 次ステージ解放は B 以上のときだけ。
        // 戻り値: {
        //   isClearing: bool,             // B 以上で「クリア」と認定された
        //   isFirstClearOfStage: bool,    // このステージを初めて B 以上で抜けた
        //   newlyUnlockedStage: number|0, // 解放された次のステージ番号 (なければ 0)
        //   isBestUpdated: bool,
        //   bestScore, bestRank,
        //   plays,
        // }
        recordStageClear(no, score, rank) {
            const result = {
                isClearing: false,
                isFirstClearOfStage: false,
                newlyUnlockedStage: 0,
                isBestUpdated: false,
                bestScore: 0,
                bestRank: '',
                plays: 0,
            };
            if (!this.data) return result;
            const prog = this.data.progress;

            const key = `stage-${no}`;
            const cur = this.data.scores[key] || { best: 0, bestRank: '', plays: 0 };
            cur.plays += 1;
            if (score > cur.best) {
                cur.best = score;
                cur.bestRank = rank;
                result.isBestUpdated = true;
            }
            this.data.scores[key] = cur;

            const isClearing = this.isRankClearing(rank);
            if (isClearing) {
                result.isClearing = true;
                if (!prog.clearedStages.includes(no)) {
                    prog.clearedStages.push(no);
                    result.isFirstClearOfStage = true;
                }
                const before = prog.unlockedStage;
                const after = Math.max(before, Math.min(no + 1, 10));
                if (after > before) {
                    prog.unlockedStage = after;
                    result.newlyUnlockedStage = after;
                }
            }

            this.persist();
            result.bestScore = cur.best;
            result.bestRank = cur.bestRank;
            result.plays = cur.plays;
            return result;
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

        // --- 出題済み ID バッファ (同ステージ再プレイ時の重複抑止) ---
        // ステージごとに最大 SEEN_BUFFER_PER_STAGE 件の question.id を保持する FIFO。
        // pickForStage がこれを読んで eligible から除外することで、
        // 同ステージを何度やっても同じ問題が連続して出にくくなる。
        SEEN_BUFFER_PER_STAGE: 60,

        getSeenQuestions(stageNo) {
            return (this.data?.seenQuestions?.[`stage-${stageNo}`] || []).slice();
        },
        addSeenQuestions(stageNo, ids) {
            if (!this.data) return;
            if (!this.data.seenQuestions) this.data.seenQuestions = {};
            const key = `stage-${stageNo}`;
            const buf = this.data.seenQuestions[key] || [];
            for (const id of ids) {
                if (!buf.includes(id)) buf.push(id);
            }
            // バッファ上限を超えたら古いものを先頭から削除
            const limit = this.SEEN_BUFFER_PER_STAGE;
            if (buf.length > limit) buf.splice(0, buf.length - limit);
            this.data.seenQuestions[key] = buf;
            this.persist();
        },

        // --- アイコン解放 ---
        // 所持チェック。id が空/null の場合は "NONE 選択" として常に true。
        isIconUnlocked(iconId) {
            if (!iconId) return true;
            const list = this.data?.progress?.unlockedIcons || [];
            return list.includes(iconId);
        },
        getUnlockedIcons() {
            return (this.data?.progress?.unlockedIcons || []).slice();
        },
        // --- 連続ログイン (session) ---
        // ホーム画面到達時に呼ばれる。
        //   - 初回:                streak=1, lastPlayDate=今日
        //   - 同日 2 回目以降:     何もしない
        //   - 前日に来てた:        streak += 1, lastPlayDate=今日
        //   - 1 日以上空いた:      streak=1 に戻して再スタート
        // 戻り値: { streak, isNewDay }
        //   isNewDay=true なら呼び出し側で「STREAK +1」演出が出せる
        // 日付は端末ローカル時刻 YYYY-MM-DD で扱う (UTC 跨ぎで連続が崩れない)。
        touchSession() {
            if (!this.data) return { streak: 1, isNewDay: false };
            if (!this.data.session) this.data.session = { lastPlayDate: null, streak: 0 };
            const sess = this.data.session;
            const today = ymdLocal(new Date());
            if (sess.lastPlayDate === today) {
                return { streak: sess.streak || 1, isNewDay: false };
            }
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const yesterday = ymdLocal(y);
            if (sess.lastPlayDate === yesterday) {
                sess.streak = (sess.streak || 0) + 1;
            } else {
                sess.streak = 1;
            }
            sess.lastPlayDate = today;
            this.persist();
            return { streak: sess.streak, isNewDay: true };
        },
        getStreak() {
            return this.data?.session?.streak || 0;
        },

        // --- 全ステージ集計 (HOME の STATS バーで使う) ---
        // 累計プレイ回数 (= scores[*].plays の合計)
        getTotalPlays() {
            const sc = this.data?.scores || {};
            let n = 0;
            for (const k in sc) {
                if (sc[k] && typeof sc[k].plays === 'number') n += sc[k].plays;
            }
            return n;
        },
        // 全ステージの中で最高ランク (SS > S > A > B > C > D > E > F)。
        // 1 度もクリアしていない場合 null を返す。
        getBestRankAcross() {
            const ORDER = ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
            const sc = this.data?.scores || {};
            let best = null;
            let bestIdx = ORDER.length;
            for (const k in sc) {
                const r = sc[k]?.bestRank;
                if (!r) continue;
                const i = ORDER.indexOf(r);
                if (i >= 0 && i < bestIdx) {
                    bestIdx = i;
                    best = r;
                }
            }
            return best;
        },

        // --- 達成バッジ ---
        // 既に持っていれば false。新規解放なら true を返す。
        unlockAchievement(id) {
            if (!this.data) return false;
            if (typeof id !== 'string' || id.length === 0) return false;
            if (!Array.isArray(this.data.achievements)) this.data.achievements = [];
            const list = this.data.achievements;
            if (list.includes(id)) return false;
            list.push(id);
            this.persist();
            return true;
        },
        hasAchievement(id) {
            const list = this.data?.achievements || [];
            return list.includes(id);
        },
        getAchievements() {
            return (this.data?.achievements || []).slice();
        },

        // --- 図鑑: ギミック発動履歴 ---
        // 1度でも実際の出題で apply されたギミック ID を蓄積。
        // 図鑑は未発動 (= 未確認) のものを ??? 表示にしてネタバレを防ぐ。
        markGimmickEncountered(id) {
            if (!this.data) return false;
            if (typeof id !== 'string' || id.length === 0) return false;
            if (!Array.isArray(this.data.encounteredGimmicks)) this.data.encounteredGimmicks = [];
            const list = this.data.encounteredGimmicks;
            if (list.includes(id)) return false;
            list.push(id);
            this.persist();
            return true;
        },
        hasEncounteredGimmick(id) {
            return (this.data?.encounteredGimmicks || []).includes(id);
        },
        getEncounteredGimmicks() {
            return (this.data?.encounteredGimmicks || []).slice();
        },

        // iconId を解放。新規解放なら true を返す (呼び出し側で popup 演出に利用)。
        unlockIcon(iconId) {
            if (!this.data) return false;
            if (typeof iconId !== 'string' || iconId.length === 0) return false;
            if (!this.data.progress) this.data.progress = { unlockedStage: 1, clearedStages: [], unlockedIcons: [] };
            if (!Array.isArray(this.data.progress.unlockedIcons)) this.data.progress.unlockedIcons = [];
            const list = this.data.progress.unlockedIcons;
            if (list.includes(iconId)) return false;
            list.push(iconId);
            this.persist();
            return true;
        },
    };

    window.Save = Save;
})();
