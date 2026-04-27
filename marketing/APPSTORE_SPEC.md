# App Store 提出物 技術仕様書

> **目的**: App Store Connect への提出に必要な画像・動画・テキスト素材の正確な仕様をまとめる。デザイナー納品時/開発者の最終チェック用。
>
> 出典: [Apple Developer 公式ドキュメント](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/) (2026-04-27 時点)
> 関連: [`CONCEPT_BRIEF.md`](./CONCEPT_BRIEF.md) (世界観・コンセプト)

---

## 0. このアプリの提出方針

| 項目 | 設定 |
|---|---|
| 対応プラットフォーム | **iOS のみ** (現状) |
| 対応デバイス | **iPhone only** (iPad 非対応として申請) |
| 画面方向 | **縦 (Portrait) 固定** |
| ローカライズ | **日本語のみ** (将来的に英語追加余地あり) |
| 課金 | **無料・広告なし・IAPなし** |

**理由**: 一作目 MVP のため対応範囲を絞ってリリース難度を下げる。iPad / 横画面 / 多言語は v1.x で対応。

---

## 1. スクリーンショット (必須)

### 1-1. 必須サイズ (2026年4月時点)

Apple は 2024 年から **iPhone 6.9" のみ必須** に変更。これ1セット出せば他サイズは自動スケーリングされる。

| Display | 解像度 (Portrait) | 必須 | 備考 |
|---|---|---|---|
| **iPhone 6.9"** | **1320 × 2868 px** | ⭐ **必須** | iPhone 16/17 Pro Max ネイティブ解像度。**これだけ出せば最低条件を満たす** |
| iPhone 6.7" (代替可) | 1290 × 2796 px | 互換 | 16/17 Pro Max 旧世代 |
| iPhone 6.5" | 1284 × 2778 px | 任意 | 6.9 から自動縮小される |
| iPad 13" | 2064 × 2752 px | iPad 対応する場合のみ | 今回は **不要** |

### 1-2. ファイル仕様

| 項目 | 仕様 |
|---|---|
| 形式 | `.png` / `.jpg` / `.jpeg` |
| カラースペース | sRGB or P3 (sRGB 推奨) |
| 透過 (Alpha) | **使用不可** (背景は不透明にする) |
| 1ロケールあたり枚数 | **最低 1 枚 / 最大 10 枚** |
| 推奨枚数 | **6〜10 枚** (3枚以下だと魅力伝わらない、多いほど CV 上がる傾向) |

### 1-3. 本プロジェクトの納品仕様

```
解像度:   1320 × 2868 px (iPhone 6.9" Portrait)
形式:     PNG (透過なし)
カラー:   sRGB
枚数:     8 枚
ファイル名: ss_iphone69_01_concept.png
          ss_iphone69_02_chaos.png
          ss_iphone69_03_empathy.png
          ss_iphone69_04_srank.png
          ss_iphone69_05_deadend.png
          ss_iphone69_06_ranking.png
          ss_iphone69_07_genres.png
          ss_iphone69_08_cta.png
```

各シーンの主題と一言コピーは [`CONCEPT_BRIEF.md` §6-2](./CONCEPT_BRIEF.md) 参照。

### 1-4. 横長キービジュアル (App Store には不要、SNS 告知用)

| 用途 | 解像度 | 備考 |
|---|---|---|
| Twitter / X OGP | 1200 × 630 px | リンクシェア時のサムネ |
| YouTube サムネ | 1280 × 720 px | 実況動画時用 |
| TikTok カバー | 1080 × 1920 px | 縦動画用 (流用可) |

---

## 2. App アイコン

### 2-1. App Store 用 1024×1024

| 項目 | 仕様 |
|---|---|
| 解像度 | **1024 × 1024 px** (固定) |
| 形式 | **PNG** |
| 透過 | **不可** (背景必須) |
| 角丸 | **付けない** (Apple 側で自動的に角丸が当たる) |
| カラースペース | sRGB or P3 |
| ファイル名 | `icon_1024.png` |

### 2-2. Capacitor 用アプリ内アイコン

`npx @capacitor/assets generate` 用に **1024×1024 のソース** を 1 枚渡せば、iOS の全サイズ (29/40/60/76/83.5pt 等) に自動展開される。

```bash
npm run assets:generate
```

これで `ios/App/App/Assets.xcassets/AppIcon.appiconset/` 以下が更新される。

### 2-3. 制作上の注意

- 縮小されても潰れない太い線・大きいパーツで構成
- 文字を入れる場合は 60pt 以上のサイズ感 (アプリ画面で 60×60 まで縮小される)
- 背景は単色 or 単純グラデ推奨 (細かい模様は潰れる)

---

## 3. App Preview (動画) — 任意だが強い

App Store の最初の表示枠 (スクショ前) を独占できる。CV 効果大。

### 3-1. 仕様

| 項目 | 仕様 |
|---|---|
| 長さ | **15 秒以上 30 秒以内** |
| 解像度 (iPhone 6.9") | **886 × 1920 px** (縦) |
| 形式 | `.mov` / `.m4v` / `.mp4` |
| コーデック | H.264 + AAC (32-44 kHz) |
| フレームレート | 30 fps |
| 最大ファイルサイズ | 500 MB |
| 1ロケールあたり本数 | 最大 3 本 |

### 3-2. 制作方針 (任意で出すなら)

- 最初の 3 秒で「画面が壊れたまま小学生クイズ」とわかる構図
- 最後 5 秒で S ランク or DEAD END の衝撃画
- 音声は無くてもOK (App Store はデフォルトミュート再生)

---

## 4. App Store メタデータ (テキスト系)

### 4-1. 必須テキスト

| 項目 | 文字数上限 | 内容 |
|---|---|---|
| **App Name (Title)** | 30 文字 | `変なクイズ` |
| **Subtitle** | 30 文字 | (例) `画面が壊れた、小6クイズ` |
| **Promotional Text** | 170 文字 | リリース後に審査通さず変更可。アップデート時のお知らせ等に |
| **Description** | 4000 文字 | アプリ説明文。改行可 |
| **Keywords** | 100 文字 (合計) | カンマ区切り。SEO 最重要 (例) `クイズ,クソゲー,維管束,小学生,難問,バズ,ランキング,小6` |
| **What's New** | 4000 文字 | バージョンごとの更新内容 |

### 4-2. URL 系 (必須・任意)

| 項目 | 必須 | 例 |
|---|---|---|
| **Privacy Policy URL** | ⭐ 必須 | `https://(個人サイト)/oddquiz/privacy.html` ([本リポジトリの privacy.html](../privacy.html) と同一内容) |
| **Support URL** | ⭐ 必須 | GitHub Issues か Twitter プロフィール (例: `https://x.com/odd__games`) |
| **Marketing URL** | 任意 | ゲームのランディングページがあれば |

### 4-3. カテゴリ

| 項目 | 設定値 |
|---|---|
| Primary Category | **Games** |
| Secondary Category | **Trivia** (クイズ) または **Puzzle** |
| Game Subcategory | Trivia |

### 4-4. 年齢レーティング

App Store Connect のアンケートで以下を選択する想定:

| 質問 | 回答 |
|---|---|
| Cartoon or Fantasy Violence | **None** (画面は崩壊するが暴力なし) |
| Realistic Violence | None |
| Sexual Content or Nudity | None |
| Profanity or Crude Humor | **Mild / Infrequent** ("クソゲー" 連呼があるため) |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | **Mild / Infrequent** (DEAD END 演出、ホラー要素軽度あり) |
| Gambling | None |
| Contests | **Yes** (オンラインランキングがある) |
| Unrestricted Web Access | None |

→ 結果として **12+** 程度になる見込み。

### 4-5. App Store 用 説明文の叩き台

```
画面がぶっ壊れたまま、小学校で習ったはずのクイズに挑戦しろ。

これは「変なクイズ」。
小学6年生レベルの問題を、グリッチ・反転・ぼかし・選択肢ワープ等
20種類以上の崩壊UIに襲われながら 20 問解くスコアアタック型クイズ。

■ あなたは「維管束」を覚えていますか?
社会・理科・国語・算数・英語・家庭科・音楽・美術・体育、
合計1000問の中から、忘れてそうな知識を意図的に選んで出題。
「これ習ったっけ…?」を引き出す共感型クイズ。

■ 全10ステージ
Stage 1: チュートリアル (誰でもクリアできる)
Stage 9: 最難関 (理論上クリア可能)
Stage 10: ガチキチ (Sランク達成率 0.01%)

■ ランクシステム
SS / S / A / B / C / D / E / F の 8段階。
クリアランクごとに「上位 X% / ≒ 〇〇合格率と同等」の煽り表示で
ぜひスクショして晒してください。

■ オンラインランキング (TOP100)
全国のクソゲー人と競う。

■ シェア機能
リザルトをワンタップで画像化、SNS 即拡散。

■ 完全無料・広告なし・課金なし
アプリ内で何も売っていません。

——————————————————
あなたは現代の知識人か、それとも「現代の縄文人」か。
今すぐダウンロードして、自分の脳の劣化具合を確かめろ。
——————————————————
```

(これは叩き台。本番投入時に文字数調整 + キーワード密度最適化する)

---

## 5. App Information (App Store Connect 登録項目)

### 5-1. 開発者情報

| 項目 | 設定 |
|---|---|
| Seller (販売者名) | ODDGAMES |
| Bundle ID | `com.oddquiz.app` |
| SKU | `oddquiz_001` (任意の管理用ID) |
| Primary Language | Japanese (Japan) |

### 5-2. ビルド情報

| 項目 | 設定 |
|---|---|
| Version (Marketing) | `1.0.0` (リリース版) |
| Build (内部番号) | `1` から始めてリビルドごとにインクリメント |
| Minimum iOS Version | iOS 13.0 (Capacitor 8 のサポート下限) |

### 5-3. App Privacy (Nutrition Label)

App Store Connect の "App Privacy" セクションで宣言する内容:

| データタイプ | 収集する? | 用途 | リンクされる? | 追跡? |
|---|---|---|---|---|
| User ID (playerId) | ✅ | App Functionality (ランキング機能) | ✅ Linked to user | ❌ Not used to track |
| User Content (displayName) | ✅ | App Functionality | ✅ Linked to user | ❌ |
| User Content (iconId) | ✅ | App Functionality | ✅ Linked to user | ❌ |
| Gameplay Data (score, time, rank) | ✅ | App Functionality, Analytics | ✅ Linked to user | ❌ |
| Device ID (IDFA) | ❌ | — | — | — |
| Location | ❌ | — | — | — |
| Contact Info | ❌ | — | — | — |
| Browsing History | ❌ | — | — | — |

**Tracking** (App Tracking Transparency 対象): なし → ATT プロンプト不要

---

## 6. App Review 提出時の追加情報

### 6-1. Review Notes (審査担当向けメモ)

審査担当者が見る欄。書いておくと審査がスムーズ:

```
このアプリはオンラインランキング機能を持つクイズゲームです。

■ ログイン不要
匿名IDで動作するため、テストアカウントは不要です。

■ Firebase 利用について
- Cloud Firestore: ランキングデータ保存
- App Check (reCAPTCHA Enterprise): 不正書き込み防止
- どちらも Apple の Privacy Policy に準拠した形で利用しています

■ プレイ動作確認の手順
1. アプリを起動 (タイトル画面で TAP TO START)
2. プロフィールで好きな名前を入力 (任意)
3. STAGE 01 を選択してプレイ
4. クリア後、リザルト画面でランキング送信が自動的に行われます
5. RANKING タブからリーダーボードを確認できます

■ 「DEAD END」「現代の縄文人」等の表現について
ゲームの世界観演出であり、暴力的・差別的意図はありません。
プレイヤーへのカジュアルな煽り表現で、SNS 共有時のユーモア素材として
意図的に取り入れています。

■ 連絡先
Email: 112511taka@gmail.com
```

### 6-2. デモアカウント / Sign-in 情報

| 項目 | 設定 |
|---|---|
| Sign-in required | **No** |
| Demo Account | **Not Applicable** |

---

## 7. ファイル組織 (デザイナー納品形式)

```
marketing/
├── CONCEPT_BRIEF.md       # 世界観・コンセプト
├── APPSTORE_SPEC.md       # この文書 (技術仕様)
├── deliverables/           # ← デザイナーから納品されるディレクトリ
│   ├── icon_1024.png
│   ├── screenshots/
│   │   ├── ss_iphone69_01_concept.png
│   │   ├── ss_iphone69_02_chaos.png
│   │   ├── ss_iphone69_03_empathy.png
│   │   ├── ss_iphone69_04_srank.png
│   │   ├── ss_iphone69_05_deadend.png
│   │   ├── ss_iphone69_06_ranking.png
│   │   ├── ss_iphone69_07_genres.png
│   │   └── ss_iphone69_08_cta.png
│   ├── keyvisuals/
│   │   ├── kv_twitter_1200x630.png
│   │   ├── kv_youtube_1280x720.png
│   │   └── kv_tiktok_1080x1920.png (任意)
│   └── source/
│       ├── icon_master.fig (or .ai / .psd)
│       └── screenshots_master.fig
```

---

## 8. 提出前 チェックリスト

提出直前にこのチェックリストを通す:

### 画像系
- [ ] スクショ 8 枚すべて 1320×2868 px
- [ ] スクショに透過がない (アルファチャンネル削除済み)
- [ ] スクショに Apple ロゴ・他社ロゴ・iPhone シルエットなし
- [ ] アイコン 1024×1024 PNG、角丸なし、透過なし
- [ ] キービジュアル各サイズが揃っている

### テキスト系
- [ ] App Name 30文字以内
- [ ] Subtitle 30文字以内
- [ ] Description が事実ベースで誇大表現なし ("Best", "No.1" 等を使ってない)
- [ ] Keywords が 100 文字以内 (カンマ区切り)
- [ ] What's New (初回は "初回リリース" でOK)

### URL 系
- [ ] Privacy Policy URL が公開されてアクセス可能
- [ ] Support URL が機能している
- [ ] (必要なら) Marketing URL

### App Privacy
- [ ] Privacy Nutrition の項目を全部入力
- [ ] Tracking なしを宣言

### ビルド
- [ ] Bundle ID が `com.oddquiz.app` で正しい
- [ ] Version / Build 番号が前回より大きい
- [ ] iOS 13.0 以降で動作確認

### Review Notes
- [ ] Review Notes に Firebase 利用の説明を記載
- [ ] サインイン不要を明記

---

## 9. 参考リンク

- [Apple Developer: Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/)
- [Apple Developer: Upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [Apple Developer: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Developer: App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)

---

**END OF SPEC**
