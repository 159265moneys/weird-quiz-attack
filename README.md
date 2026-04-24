# 変なクイズ (ODD QUIZ)

崩壊UIが襲いかかる、バイラル狙いのスコアアタック型クイズアプリ。  
技術スタック: **HTML / CSS / Vanilla JavaScript** (ビルドツール無し) + **Capacitor** (最終段階でネイティブ化)。

---

## 現状 (Phase 5a 完了)

- タイトル / ステージ選択 / 問題 / リザルト の画面遷移が動作
- 10ステージ定義済み（Stage 1のみ解放、クリアで次が解放）
- 問題JSONから抽選し20問のセッションを構築
- localStorage によるスコア・進捗永続化
- 1080×1920 論理解像度 + 自動スケーリングで任意の縦横比に追従
- **崩壊UIギミックエンジン + MVP 9ギミック実装済**

### まだ無いもの (今後のフェーズ)

- 崩壊UIギミック拡充 (残 33個 / Phase 5b-5c)
- シェア機能・スクショ生成 (Phase 6)
- ビジュアル詰め (VHS・浮遊テキスト等) (Phase 4)
- Capacitor ネイティブ化 (Phase 8)

### Phase 3 で追加された機能

- 内製文字盤 (ひらがな / カタカナ / 英字 / 数字)
- フリック入力 (四方向 + プレビュー)
- 濁点・半濁点・小文字サイクル変換 (`゛゜小` キー)
- 正解判定 (ひらがな/カタカナ同一視、大文字小文字無視、全角半角吸収)

### Phase 5a で追加された機能

- 問題画面を縦3ゾーン固定レイアウトに変更 (HEADER/QUESTION/ANSWER)
- 崩壊UIギミックエンジン (apply/dispose, conflicts, force指定)
- ステージのK値から自動抽選・問題modeに応じたフィルタ
- 実装ギミック (9個):
    - **B03** 問題文逆さ / **B05** ミラー / **B07** グリッチ
    - **B12** ぼかし / **B13** フォント極小
    - **C01** 選択肢シャッフル / **C04** 嘘50:50
    - **W01** 文字盤見えない / **W03** 解答欄見えない
- デバッグパネルから個別ギミックを強制発動可能

詳細は `設計書v1.0.md` 参照。

---

## 起動方法

### ローカル開発 (推奨: Python)

```bash
# プロジェクトルートで
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開く。

> **注意**: `index.html` を file:// でダブルクリック起動すると `fetch()` が失敗し、問題データが読めません。必ずHTTPサーバ経由で開いてください。

### Node.js派の場合

```bash
npx serve .
# または
npx http-server -p 8000
```

### スマホ実機テスト (同一LAN)

```bash
python3 -m http.server 8000
# 同じWi-Fiのスマホから http://<MacのIP>:8000 を開く
```

### GitHub Pages デプロイ

1. このディレクトリをGitHubリポジトリにpush
2. Settings → Pages → Source: main / root を選択
3. `https://<user>.github.io/<repo>/` にアクセス

ビルド工程ゼロなのでそのまま動きます。

---

## ディレクトリ構造

```
.
├── index.html              # エントリ
├── styles/
│   ├── base.css            # カラーパレット / フォント / スケーリング
│   └── screens.css         # 画面別スタイル
├── js/
│   ├── config.js           # 不変の設定値 (ステージ定義等)
│   ├── state.js            # ランタイム状態
│   ├── save.js             # localStorage ラッパー
│   ├── router.js           # 画面切替
│   ├── quiz/
│   │   ├── loader.js       # 問題JSONロード & 抽選
│   │   └── judge.js        # 記述正解判定 & 入力モード推定
│   ├── keyboard/
│   │   ├── layouts.js      # ひらがな/カタカナ/英数/数字レイアウト
│   │   └── keyboard.js     # 内製文字盤本体 (フリック入力)
│   ├── gimmicks/
│   │   ├── registry.js     # 崩壊UIギミック定義集
│   │   ├── selector.js     # ステージ設定から抽選
│   │   └── engine.js       # apply/dispose オーケストレータ
│   ├── scoring.js          # スコア・ランク計算
│   ├── debug.js            # 開発用デバッグパネル
│   ├── screens/
│   │   ├── title.js
│   │   ├── stageSelect.js
│   │   ├── question.js
│   │   └── result.js
│   └── main.js             # エントリJS
├── data/
│   └── questions/          # 200問の問題データ (6ジャンル)
│       ├── math.json
│       ├── english.json
│       ├── japanese.json
│       ├── science.json
│       ├── social.json
│       └── others.json
├── sprite/                 # スプライト (butterfly, girl)
├── 参考/                    # 3SEC デザイン参考
├── 設計書v1.0.md
├── クソゲー仕様書v1.0.md
└── ギミック一覧.md
```

---

## キャッシュリセット

開発中にセーブデータを消したい時は、ブラウザのDevTools → Application → Local Storage から `kuso_quiz_save_v1` を削除、または console で:

```js
Save.reset();
location.reload();
```

---

## デバッグモード

### 有効化

- **PC**: `Shift + D` でトグル
- **URL**: `?debug=1` もしくは `#debug` を付けて開く
- **モバイル**: タイトル画面フッターの `v0.1.0-alpha` を **5連タップ**

有効状態は `localStorage` に保存されるので、一度ONにしたら再読込でも維持されます。

### 機能

画面右上に紫枠のパネルが出現。内容:

- 現在のscreen / stage / 問題IDなどの状態表示
- **強制正解 (W)** / **強制不正解 (L)** / **SKIP (S)** — Q画面で効くキーも割当済
- **全ステージ解放** — unlockedStageを10に
- **セーブ削除** — 進捗一掃
- 画面ジャンプ (title / stageSelect / result(ダミー))
- **崩壊UIギミック強制発動** — Q画面で `B03/B05/B07/...` 等のボタンを押すと指定ギミックを即適用。`CLEAR` で全解除、`RE-APPLY` で抽選やり直し
