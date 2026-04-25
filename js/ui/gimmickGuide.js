/* ============================================================
   ui/gimmickGuide.js — ギミック図鑑 (独立スクリーン)
   ------------------------------------------------------------
   Phase: 2026-04-21 リファクタ
     - 旧: document.body に overlay 追加する modal 実装
     - 新: window.Screens.gimmickGuide として Router 経由のフル
            スクリーン画面に変更
   home → 図鑑ボタン → Router.show('gimmickGuide')
     - 2列グリッドにカード (サムネ + 名前) を並べる
     - 一度でも食らったことのないギミックは ??? にして popup 不可
     - カードをタップすると popup が開いてサンプル領域でギミックを
       3秒ループで実演 (同時に動くのは1個だけ)
     - 戻るは画面右上の × ボタン (= Router.show('home'))
   難易度の表示は registry の difficulty (1〜10) を:
     1〜5: ☆ × N
     6〜8: 💀 × (N-5)
     9〜10: 💀 × 3 にクランプ

   POPUP は子詳細なので overlay のまま (画面遷移するほどの情報量
   ではない / 閉じる直前のコンテキストを残したい)。Router.show で
   別スクリーンに行く際は destroy() で popup と sample ループも
   確実に止める。
   ============================================================ */
(function () {
    // -------- ギミック解説テキスト (作者編集用) --------
    // ここを書き換えれば popup の説明欄に反映される。各 1〜2 行が目安。
    const DESCRIPTIONS = {
        // ---- B (問題文/画面系) ----
        B01: 'タップ位置が上下逆になる。狙った選択肢の正反対が選ばれてしまう。',
        B02: '問題文が1文字ずつタイプライター風に表示される。早く読みたいのに焦らされる。',
        B03: '問題文が左右反転 (鏡像) で表示される。普通には読めない。',
        B04: '問題文が異常に拡大・縮小を繰り返す。文字が読み取りづらい。',
        B05: '問題文が水平方向に鏡映表示される。脳がバグる。',
        B06: '極端な配色でテキストが読みにくくなる。背景と文字色が紛れる。',
        B07: '画面全体にグリッチ風のノイズが走る。視界がチカチカ。',
        B08: '問題文が時間経過でフェードアウト。読み終わる前に消える。',
        B09: '画面全体が小さくしぼんでいく。中身がどんどん見えなくなる。',
        B10: '問題文の文字が均質化されて似た形になる。判別困難。',
        B11: '画面四隅からビーム状のエフェクトが走り視界を遮る。',
        B12: 'ぼかしが時間経過で強→弱→強と脈動する。完全には見えない。',
        B13: '問題文のフォントサイズが極端に小さい。目を凝らさないと読めない。',
        B15: '問題文の文字順が逆順 (末尾→先頭) で表示される。',
        B16: '本物そっくりの偽カウントダウンが表示される。本当の制限時間ではない。',
        B17: '大量のノイズ文字列の中に本物の問題文が紛れ込む。',
        B18: '入力中に偽のエラーメッセージが画面を覆う。中身は嘘。',
        B20: '画面が時々暗転する。読みたいタイミングで真っ暗。',
        B21: '問題文に触れると即死。表示エリアにタップ判定のトラップ。',
        B22: '問題文が二重にズレて見える。視界が酔う。',
        B23: '問題文の一部単語が黒塗り (墨消し) される。',
        B24: '問題文が止まらず流れていく。読んでる隙にどんどん進む。',
        B25: 'マスコットキャラが画面を歩き回って問題文に被る。',
        B26: '文字ごとに色がランダムに変わって読みづらい。',
        B27: '問題文の1文字がランダムに欠落する。意味が読み取りにくい。',
        B28: '文字ごとにサイズがバラバラ。読みにくい。',
        B29: '問題文がバウンドしながら跳ね回る。',
        B30: '問題文が螺旋状に回転しながら表示される。',
        B31: '問題文の色が極端に薄い。背景に溶け込む。',
        B32: '画面全体が斜めに傾いて表示される。微妙に酔う。',
        B33: 'CRT風の走査線が画面を上から下へ流れる。',
        B34: '問題文が微振動 (ジッター) する。じっと読めない。',
        B35: 'シアン色の太さランダムな線が画面を高速通過する。',
        B36: '画面中に邪魔な吹き出しがランダムに出ては消える。',
        B37: '付箋メモが画面中に貼り付けられて視界を塞ぐ。',
        B38: '画面上部から「？」マークが大量に降ってくる。',
        B39: 'iOS風の偽通知バナーが画面上部からスライドダウン。',
        B40: 'ニコ動風のコメント弾幕が問題文エリアを高速で流れる。',
        // ---- C (選択肢系) ----
        C01: '選択肢の並び順が定期的にシャッフルされる。位置で覚えられない。',
        C02: '選択肢の文字に記号ノイズ (▓ ░ ◊ ※) が混じり一部が読めなくなる。',
        C03: '選択肢のうち1つが完全に真っ黒で読めない。賭けに出るか見送るか。',
        C04: '本物の50:50に見せかけた偽の絞り込み演出。残った2択も全部嘘の可能性。',
        // ---- W (キーボード/入力系) ----
        W01: 'キーボードの文字盤がほぼ見えなくなる。位置で覚えてないと打てない。',
        W02: '一定間隔でキー配置がシャッフルされる。指の動きで覚えても無駄。',
        W03: '入力欄が見えない。何を打ったか確認できない。',
        W04: 'タップしたキーから少しズレた文字が入力される。',
        W06: '入力した文字列が末尾→先頭の逆順で記録される。',
        W07: '3文字打ち込むと末尾から1文字ずつ自動で消えていく。打ち直し地獄。',
        W08: '通常シャッフルより激しいキー再配置。 タップごとに動く。',
        W09: '1回のタップで文字が2回入力される。半分のスピードで打つしかない。',
        W18: 'キーボードのキーがランダムに消滅する。消えたキーは打てない。',
        W20: 'フリック入力の方向が入れ替わる。「あ」を上にフリックしても「い」が出ない。',
        // ---- G (Stage10 ボス) ----
        G1: '一定確率でランダム即死。運が悪いと何もしてないのに終わる。',
        G4: '問題文が強烈に文字化けして大半が判読不可能になる。',
        G5: '選択肢の位置が画面内をワープし続ける。タップが追いつかない。',
        G7: '結果に関係なく煽り文句がスコア欄に表示される。メンタル攻撃。',
    };

    // -------- SVG アイコン --------
    const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    // 難易度アイコン: <svg> をインラインで描いて currentColor で色を制御する。
    //   塗り (filled) 用と 枠だけ (empty) 用を分ける。
    const ICON_STAR_FILL  = `<span class="gg-diff-ic gg-diff-ic-fill"><svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z"/></svg></span>`;
    const ICON_STAR_EMPTY = `<span class="gg-diff-ic gg-diff-ic-empty"><svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-350Z"/></svg></span>`;
    // 難易度 6〜8 (旧 ドクロ枠) は星と同一の SVG パスで描画する。
    // 試行: 独自 ドクロ SVG / Material 系 / Bootstrap Icons いずれも
    // 星と並べたとき viewBox とパス実描画範囲のズレで上下に揃わない。
    // ユーザ判断 (2026-04-21) で「赤い星でいい」となったため、星と完全に
    // 同じパスで色だけ赤系 (--accent-red) に切り替えて危険度を表現する。
    // → 同一 SVG = ピクセル単位でアライン保証 + 既存の星サイズ感と完全に
    //   一致するので並べても違和感がない。
    const ICON_SKULL_FILL  = `<span class="gg-diff-ic gg-diff-ic-fill"><svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z"/></svg></span>`;
    const ICON_SKULL_EMPTY = `<span class="gg-diff-ic gg-diff-ic-empty"><svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-350Z"/></svg></span>`;

    function escapeHTML(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 難易度表示: 1〜5 = ☆ × N (残りは空☆), 6〜8 = 💀 × (N-5) (残りは空💀)。
    // 9・10 は 💀×3 にクランプ。
    function difficultyHTML(d) {
        const dn = Math.max(1, Math.min(10, d || 1));
        const isSkull = dn >= 6;
        if (isSkull) {
            const filled = Math.min(3, dn - 5);
            const empty = 3 - filled;
            let html = '<span class="gg-diff-row gg-diff-row-skull">';
            for (let i = 0; i < filled; i++) html += ICON_SKULL_FILL;
            for (let i = 0; i < empty; i++) html += ICON_SKULL_EMPTY;
            html += '</span>';
            return html;
        }
        const filled = dn;
        const empty = 5 - filled;
        let html = '<span class="gg-diff-row gg-diff-row-star">';
        for (let i = 0; i < filled; i++) html += ICON_STAR_FILL;
        for (let i = 0; i < empty; i++) html += ICON_STAR_EMPTY;
        html += '</span>';
        return html;
    }

    // ============================================================
    // スクリーン (Router.show('gimmickGuide') で開く)
    // ============================================================

    function buildScreenHTML() {
        const all = window.GimmickRegistry?.all || [];
        const seenSet = new Set(window.Save?.getEncounteredGimmicks?.() || []);
        // difficulty 昇順 → id 昇順 でソート
        const sorted = all.slice().sort((a, b) => {
            const da = a.difficulty || 0, db = b.difficulty || 0;
            if (da !== db) return da - db;
            return String(a.id).localeCompare(String(b.id));
        });
        const cards = sorted.map(g => buildCardHTML(g, seenSet.has(g.id))).join('');
        const total = all.length;
        const seen = sorted.filter(g => seenSet.has(g.id)).length;
        return `
            <div class="screen gimmick-guide-screen" role="region" aria-label="ギミック図鑑">
                <div class="gg-screen-head">
                    <div class="gg-screen-title">GIMMICK ARCHIVE</div>
                    <button class="gg-screen-back" type="button" data-gg-action="back" aria-label="ホームに戻る">${ICON_CLOSE}</button>
                </div>
                <div class="gg-progress-bar">
                    <span class="gg-progress-cnt">${seen} / ${total}</span>
                    <span class="gg-progress-lbl">CONFIRMED</span>
                </div>
                <div class="gg-grid-wrap">
                    <div class="gg-grid">${cards}</div>
                </div>
            </div>
        `;
    }

    // ギミック毎のサムネ HTML を生成。各効果を視覚的に示す静止画 (CSS-only)。
    // 53 個分すべてに固有のサムネを与える。可能な限り「EXAMPLE」テキストや
    // UI 風の小さい矩形でその効果が一目で分かるように作る。
    function buildThumbInner(id) {
        switch (id) {
            // ---- B (問題文/画面系) ----
            case 'B01': return '<div class="gt-flip-tap">↓<br>↑</div>';
            case 'B02': return '<div class="gt-typewriter">EXA<i></i></div>';
            case 'B03': return '<div class="gt-mirror">EXAMPLE</div>';
            case 'B04': return '<div class="gt-zoom">EXAMPLE</div>';
            case 'B05': return '<div class="gt-hflip">EXAMPLE</div>';
            case 'B06': return '<div class="gt-rainbow">EXAMPLE</div>';
            case 'B07': return '<div class="gt-glitch" data-text="EXAMPLE">EXAMPLE</div>';
            case 'B08': return '<div class="gt-fade">EXAMPLE</div>';
            case 'B09': return '<div class="gt-shrink">EX</div>';
            case 'B10': return '<div class="gt-homog">口口口口</div>';
            case 'B11': return '<div class="gt-beam"></div>';
            case 'B12': return '<div class="gt-blur">EXAMPLE</div>';
            case 'B13': return '<div class="gt-tiny">EXAMPLE</div>';
            case 'B15': return '<div class="gt-reverse">ELPMAXE</div>';
            case 'B16': return '<div class="gt-countdown"><span>00:03</span></div>';
            case 'B17': return '<div class="gt-noise-text"><span>x▓░▓Λ#</span><span>EXAMPLE</span><span>%▓░※x</span></div>';
            case 'B18': return '<div class="gt-error">ERROR!</div>';
            case 'B20': return '<div class="gt-blackout"></div>';
            case 'B21': return '<div class="gt-trap">EXAMPLE<i></i></div>';
            case 'B22': return '<div class="gt-double" data-text="EXAMPLE">EXAMPLE</div>';
            case 'B23': return '<div class="gt-redact">EX<i></i>PLE</div>';
            case 'B24': return '<div class="gt-marquee">EXAMPLE»»</div>';
            case 'B25': return '<div class="gt-mascot"></div>';
            case 'B26': return '<div class="gt-randcolor"><b>E</b><b>X</b><b>A</b><b>M</b><b>P</b><b>L</b><b>E</b></div>';
            case 'B27': return '<div class="gt-drop">E A P E</div>';
            case 'B28': return '<div class="gt-mixsize"><b>E</b><i>x</i><b>A</b><i>m</i><b>P</b></div>';
            case 'B29': return '<div class="gt-bounce">EX</div>';
            case 'B30': return '<div class="gt-spiral">EX</div>';
            case 'B31': return '<div class="gt-pale">EXAMPLE</div>';
            case 'B32': return '<div class="gt-tilt">EXAMPLE</div>';
            case 'B33': return '<div class="gt-scanlines"></div>';
            case 'B34': return '<div class="gt-jitter">EXAMPLE</div>';
            case 'B35': return '<div class="gt-scanbar"></div>';
            case 'B36': return '<div class="gt-bubble">!?</div>';
            case 'B37': return '<div class="gt-sticky">MEMO</div>';
            case 'B38': return '<div class="gt-qrain">?<span>?</span><i>?</i><b>?</b></div>';
            case 'B39': return '<div class="gt-notif"><span></span><b>NOTICE</b></div>';
            case 'B40': return '<div class="gt-danmaku"><span>www</span><b>草草草</b></div>';
            // ---- C (選択肢系) ----
            case 'C01': return '<div class="gt-shuffle"><b>3</b><b>1</b><b>4</b><b>2</b></div>';
            case 'C02': return '<div class="gt-cnoise">A▓C░E</div>';
            case 'C03': return '<div class="gt-blackchoice"><b></b><b></b><i></i><b></b></div>';
            case 'C04': return '<div class="gt-5050"><b></b><b></b><i></i><i></i></div>';
            // ---- W (キーボード/入力系) ----
            case 'W01': return '<div class="gt-keypad gt-keypad-fade"></div>';
            case 'W02': return '<div class="gt-keypad gt-keypad-shuffle"></div>';
            case 'W03': return '<div class="gt-noinput"></div>';
            case 'W04': return '<div class="gt-offsetkey">A<span>→</span>B</div>';
            case 'W06': return '<div class="gt-reverse-in">ELPMAXE</div>';
            case 'W07': return '<div class="gt-autodel">EXA<span>←</span></div>';
            case 'W08': return '<div class="gt-keypad gt-keypad-shuffle"></div>';
            case 'W09': return '<div class="gt-doublekey">EEEXAA</div>';
            case 'W18': return '<div class="gt-keypad gt-keypad-missing"></div>';
            case 'W20': return '<div class="gt-flick">↓ ↑<br>← →</div>';
            // ---- G (Stage10 ボス) ----
            case 'G1': return '<div class="gt-skull"></div>';
            case 'G4': return '<div class="gt-corrupt">▓░Λ#</div>';
            case 'G5': return '<div class="gt-warp"><b></b><b></b><b></b><b></b></div>';
            case 'G7': return '<div class="gt-insult">!?</div>';
        }
        // Fallback (未登録 id): カテゴリ別の幾何モチーフ
        const cat = String(id).charAt(0);
        return `<div class="gg-thumb-art gg-thumb-art-${cat}"></div>`;
    }

    function buildCardHTML(g, seen) {
        const cat = String(g.id).charAt(0); // B / C / W / G (内部判定用、UIには出さない)
        if (!seen) {
            return `
                <button class="gg-card is-locked" type="button" data-gid="${escapeHTML(g.id)}" disabled aria-label="未確認のギミック">
                    <div class="gg-thumb gg-thumb-locked"><span class="gg-thumb-q">?</span></div>
                    <div class="gg-card-name">???</div>
                </button>
            `;
        }
        // サムネは ギミック毎の固有静止画。カテゴリ別アクセント (下端ライン色) は
        //   B = 問題文系 (cyan)
        //   C = 選択肢系 (warn yellow)
        //   W = 入力系 (green)
        //   G = Boss (red)
        return `
            <button class="gg-card is-seen" type="button" data-gid="${escapeHTML(g.id)}" aria-label="${escapeHTML(g.name)}">
                <div class="gg-thumb gg-thumb-cat-${cat}">${buildThumbInner(g.id)}</div>
                <div class="gg-card-name">${escapeHTML(g.name)}</div>
            </button>
        `;
    }

    // 画面ルート要素 (.gimmick-guide-screen) への click delegated handler。
    //   各クリックで closest を辿って判定するので、innerHTML 差し替えで
    //   ボタンが消えても新しい DOM にそのまま追従する。
    function onScreenClick(e) {
        const screenEl = e.currentTarget;
        if (!screenEl) return;
        if (e.target.closest('[data-gg-action="back"]')) {
            window.SE?.fire?.('cancel');
            window.Router.show('home');
            return;
        }
        const card = e.target.closest('.gg-card');
        if (card && !card.classList.contains('is-locked')) {
            const gid = card.dataset.gid;
            if (gid) {
                window.SE?.fire?.('menuCursor');
                openCardPopup(gid);
            }
        }
    }

    let escHandler = null;

    const Screen = {
        render() {
            return buildScreenHTML();
        },
        init() {
            // タブバーは出さない (図鑑は深掘りビュー、5タブのいずれでもない)
            window.TabBar?.unmount?.();

            const screenEl = document.querySelector('.gimmick-guide-screen');
            if (screenEl) screenEl.addEventListener('click', onScreenClick);

            // ESC キーで戻る (PC ブラウザ用)。popup が開いてれば popup を閉じる。
            escHandler = (e) => {
                if (e.key !== 'Escape') return;
                if (popupOverlay && popupOverlay.classList.contains('is-open')) {
                    unpatchSE();
                    window.SE?.fire?.('cancel');
                    closeCardPopup();
                } else {
                    window.SE?.fire?.('cancel');
                    window.Router.show('home');
                }
            };
            document.addEventListener('keydown', escHandler);

            window.SE?.fire?.('confirm');
        },
        destroy() {
            // 画面遷移時は popup と sample ループを必ず止める (rAF/setTimeout が
            // 別画面まで生き残ると BGM 帯域や CPU を喰い続けてしまうため)。
            closeCardPopup();
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
                escHandler = null;
            }
            // popup overlay を DOM から完全撤去 (次回 open 時に再生成する)
            if (popupOverlay) {
                popupOverlay.removeEventListener('click', onPopupClick);
                popupOverlay.remove();
                popupOverlay = null;
            }
        },
    };

    window.Screens = window.Screens || {};
    window.Screens.gimmickGuide = Screen;

    // -------- 公開 API: ホーム画面のボタンから呼ばれる --------
    window.GimmickGuide = {
        open() {
            window.Router.show('gimmickGuide');
        },
        close() {
            // 後方互換用 (現状の呼び出し箇所無し)
            window.Router.show('home');
        },
    };

    // ============================================================
    // POPUP (カードタップ時の詳細) — 画面の上に乗る overlay
    //   閉じる動作は画面内に留まる。Router.show されたら destroy で
    //   完全クリーンアップする。
    // ============================================================
    let popupOverlay = null;
    let activeSampleStop = null;
    // ギミックの一部 (B16 偽カウントダウン等) は apply 内/setInterval で
    // 直接 SE.fire を呼ぶ。図鑑のサンプルループでこれが鳴り続けるとうるさいので、
    // popup を開いている間は SE.fire を no-op に差し替えて抑制する。
    let savedSEFire = null;
    function patchSE() {
        if (window.SE && typeof window.SE.fire === 'function' && !savedSEFire) {
            savedSEFire = window.SE.fire;
            window.SE.fire = function () { /* suppressed during sample */ };
        }
    }
    function unpatchSE() {
        if (savedSEFire && window.SE) {
            window.SE.fire = savedSEFire;
            savedSEFire = null;
        }
    }

    // input 専用ギミックは サンプル mock にキーボードが必要なため、
    // 図鑑では「実プレイ中に体験できます」と静的表示にする。
    function isSampleable(g) {
        return g.supports === 'choice' || g.supports === 'both';
    }

    function buildSampleHTML(g) {
        if (!isSampleable(g)) {
            return `<div class="gg-sample-na">プレイ中に体験できます</div>`;
        }
        // .question-screen を実画面と同じクラス名で再現。
        // 内部の絶対配置は CSS 側で popup 用に上書きする。
        return `
            <div class="gg-sample question-screen" data-gid="${escapeHTML(g.id)}">
                <div class="q-zone-header"></div>
                <div class="q-zone-question">
                    <div class="q-stem">EXAMPLE EXAMPLE EXAMPLE EXAMPLE EXAMPLE</div>
                </div>
                <div class="q-zone-answer is-choice">
                    <div class="q-choices">
                        <button type="button" class="q-choice">EXAMPLE 1</button>
                        <button type="button" class="q-choice">EXAMPLE 2</button>
                        <button type="button" class="q-choice">EXAMPLE 3</button>
                        <button type="button" class="q-choice">EXAMPLE 4</button>
                    </div>
                </div>
            </div>
        `;
    }

    function openCardPopup(gid) {
        const g = (window.GimmickRegistry?.all || []).find(x => x.id === gid);
        if (!g) return;
        if (!window.Save?.hasEncounteredGimmick?.(gid)) return;

        if (!popupOverlay) {
            popupOverlay = document.createElement('div');
            popupOverlay.className = 'gg-popup-overlay';
            document.body.appendChild(popupOverlay);
            popupOverlay.addEventListener('click', onPopupClick);
        }
        popupOverlay.innerHTML = `
            <div class="gg-popup" role="dialog" aria-label="${escapeHTML(g.name)}">
                <div class="gg-popup-head">
                    <div class="gg-popup-title">${escapeHTML(g.name)}</div>
                    <button class="gg-popup-close" type="button" aria-label="閉じる">${ICON_CLOSE}</button>
                </div>
                <div class="gg-popup-body">
                    <div class="gg-popup-sample-wrap">${buildSampleHTML(g)}</div>
                    <div class="gg-popup-meta">
                        <div class="gg-popup-diff">
                            <span class="gg-popup-diff-lbl">難易度</span>
                            ${difficultyHTML(g.difficulty)}
                        </div>
                    </div>
                    <div class="gg-popup-desc">${escapeHTML(DESCRIPTIONS[g.id] || '— 解説未登録 —')}</div>
                </div>
            </div>
        `;
        popupOverlay.classList.add('is-open');

        if (isSampleable(g)) {
            patchSE();
            startSampleLoop(g);
        }
    }

    // delegated click: 背景タップ / .gg-popup-close を判定。
    function onPopupClick(e) {
        if (e.target === popupOverlay || e.target.closest('.gg-popup-close')) {
            // SE を先に復元してから cancel SE を鳴らす (no-op 中に発火させない)
            unpatchSE();
            window.SE?.fire?.('cancel');
            closeCardPopup();
        }
    }

    // 3秒ごとに apply→cleanup→DOM初期化→apply を繰り返す。
    // 同時に動くサンプルは1個だけ (closeCardPopup で必ず stop)。
    function startSampleLoop(g) {
        const sampleEl = popupOverlay?.querySelector('.gg-sample');
        if (!sampleEl) return;
        // ギミックは 1080×1920 論理キャンバス前提で固定 px サイズで書かれている
        // ので、sample は 1080×1920 で描画して wrap 幅に合わせて scale する。
        // CSS の --canvas-h は 1920px 固定 (本番と同じ)。 ここで wrap の
        // 実幅を測って --gg-sample-scale を JS で与える。
        const setStageScale = () => {
            const wrap = sampleEl.parentElement;
            const w = wrap?.clientWidth || 0;
            if (w > 0) sampleEl.style.setProperty('--gg-sample-scale', String(w / 1080));
        };
        setStageScale();
        const ctx = {
            q: { id: 'GG_SAMPLE', mode: 'choice', question: 'EXAMPLE', choices: ['EXAMPLE 1', 'EXAMPLE 2', 'EXAMPLE 3', 'EXAMPLE 4'], answer: 0 },
            screen: sampleEl,
            zones: {
                header: sampleEl.querySelector('.q-zone-header'),
                question: sampleEl.querySelector('.q-zone-question'),
                answer: sampleEl.querySelector('.q-zone-answer'),
            },
        };

        let stopped = false;
        let timerId = 0;
        let curCleanup = null;

        const resetDom = () => {
            const stem = sampleEl.querySelector('.q-stem');
            if (stem) {
                // 子要素が増えてる可能性があるので textContent で完全初期化
                stem.textContent = 'EXAMPLE EXAMPLE EXAMPLE EXAMPLE EXAMPLE';
                stem.removeAttribute('style');
                stem.className = 'q-stem';
            }
            const zoneQ = sampleEl.querySelector('.q-zone-question');
            if (zoneQ) {
                zoneQ.removeAttribute('style');
                zoneQ.className = 'q-zone-question';
            }
            const choices = sampleEl.querySelectorAll('.q-choice');
            choices.forEach((c, i) => {
                c.textContent = `EXAMPLE ${i + 1}`;
                c.removeAttribute('style');
                c.className = 'q-choice';
            });
            // overlay 系ギミックは sampleEl に子要素を追加することがある (B33/B35/B36 等)。
            // .q-zone-* / .q-stem / .q-choices 以外を取り除く。
            const keep = new Set([
                sampleEl.querySelector('.q-zone-header'),
                sampleEl.querySelector('.q-zone-question'),
                sampleEl.querySelector('.q-zone-answer'),
            ]);
            Array.from(sampleEl.children).forEach(el => {
                if (!keep.has(el)) el.remove();
            });
            // sampleEl 自体に付与されたクラスも一掃 (gk-* 由来)。
            sampleEl.className = 'gg-sample question-screen';
        };

        const cycle = () => {
            if (stopped) return;
            try {
                curCleanup = g.apply(ctx) || (() => {});
            } catch (e) {
                console.error('[GimmickGuide] sample apply failed:', g.id, e);
                curCleanup = () => {};
            }
            timerId = setTimeout(() => {
                try { curCleanup(); } catch (e) { /* ignore */ }
                resetDom();
                if (!stopped) cycle();
            }, 3000);
        };

        cycle();

        activeSampleStop = () => {
            stopped = true;
            if (timerId) { clearTimeout(timerId); timerId = 0; }
            try { curCleanup?.(); } catch (e) { /* ignore */ }
            curCleanup = null;
            resetDom();
        };
    }

    function closeCardPopup() {
        if (activeSampleStop) {
            try { activeSampleStop(); } catch (e) { /* ignore */ }
            activeSampleStop = null;
        }
        // 念のため二重保険 (doClose を経由せず closeCardPopup が直接呼ばれた場合用)
        unpatchSE();
        if (popupOverlay) popupOverlay.classList.remove('is-open');
    }
})();
