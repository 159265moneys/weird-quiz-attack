# Android ビルド & 配布ガイド

> **目的**: 友達への APK 配布、および Google Play への本番リリース手順をまとめる。
>
> 想定読者: 自分。Mac で初めて Android 開発する人。

---

## 0. 前提状態

Android プロジェクトは既に完成している:

- ✅ `android/` ディレクトリ構築済み・全アセット生成済み・git でコミット済み
- ✅ パッケージ名: `com.oddquiz.app`
- ✅ アプリ名: 変なクイズ
- ✅ Portrait 固定
- ✅ アダプティブアイコン (FG/BG分離) 生成済み
- ✅ スプラッシュ画像配置済み
- ✅ Firebase ランキング機能は **iOS と同じコード経由で動作する** (Capacitor の WebView は `localhost` と認識されるため、既存の App Check デバッグトークン経路がそのまま使える)

つまり、コード側はゼロ作業。**残るは Android Studio をインストールしてビルドするだけ**。

---

## 1. Android Studio インストール (初回のみ, ~1時間)

### 1-1. ダウンロード

https://developer.android.com/studio

- Mac (Apple silicon) なら "Mac with Apple chip" を選ぶ
- Mac (Intel) なら "Mac with Intel chip"
- DMG (~1.2 GB) をダウンロード → 開いて Applications にドラッグ

### 1-2. 初回起動セットアップ

1. Android Studio を起動
2. "Do not import settings" を選択
3. Welcome 画面で "Standard" インストールを選ぶ
4. **Android SDK のダウンロード** が始まる (~1 GB, 30 分くらい)
5. 完了したら "Finish"

### 1-3. JDK の確認

Android Studio には JDK が同梱されているので、別途 `brew install openjdk` 等は不要。

念のため確認したい場合:

```bash
/Applications/Android\ Studio.app/Contents/jbr/Contents/Home/bin/java -version
```

---

## 2. プロジェクトを開く

### 2-1. 起動

1. Android Studio を起動
2. "Open" を選択
3. **`/Users/t.y/Desktop/変なクイズ/android`** ディレクトリを選んで開く
   - **重要**: ルートではなく **`android/` サブディレクトリ** を選ぶこと
4. 信頼するか聞かれたら "Trust Project"

### 2-2. Gradle Sync (初回のみ, 10〜30分)

開くと自動的に "Gradle Sync" が走る。

- 右下のプログレスバーが動く
- 初回は Gradle 本体・Android Gradle Plugin・依存ライブラリを大量ダウンロード (~500MB)
- 完了するまで他の操作はしないで待つ
- "Build: completed successfully" が出たら OK

### 2-3. エラー出た場合

| エラー | 対処 |
|---|---|
| `Could not find android.jar` | File → Sync Project with Gradle Files |
| `SDK location not found` | File → Project Structure → SDK location を `~/Library/Android/sdk` に設定 |
| `Compile SDK Version not specified` | Tools → SDK Manager → API 34 (or latest) をインストール |

---

## 3. デバッグ APK ビルド (友達配布用)

### 3-1. メニューから生成

```
Build メニュー → Build App Bundle(s) / APK(s) → Build APK(s)
```

クリックすると右下に "Gradle Build Running" が出る。
完了すると右下に通知が出るので "locate" をクリック。

### 3-2. APK の場所

```
android/app/build/outputs/apk/debug/app-debug.apk
```

このファイルをそのまま友達に送れば動く。**サイズは大体 8〜15 MB**。

### 3-3. Capacitor を使ったショートカット

ターミナルから一発で生成したい場合:

```bash
cd android
./gradlew assembleDebug
```

完了後、上記と同じ場所に `app-debug.apk` が出る。

---

## 4. 友達への配布手順

### 4-1. APK アップロード

1. `app-debug.apk` を **Google Drive** にアップロード
2. ファイルを右クリック → "リンクを取得" → "リンクを知っている全員"
3. URL をコピー

### 4-2. 友達にお願いする内容

> **変なクイズ Android テスト版** を試して欲しい!
>
> 1. 下記リンクから APK をダウンロード: [Google Drive URL]
> 2. ダウンロード時に「ファイルが安全じゃない」って警告出るけど構わずダウンロード
> 3. ダウンロードしたファイルをタップ
> 4. 「不明なアプリのインストール」を許可してくださいと出たら、設定で許可
>    (機種により Chrome やファイルマネージャに対して許可)
> 5. インストール → 起動 → プレイ
>
> ⚠️ 注意:
> - これは開発版なのでアプリの色んな所が壊れる可能性ある
> - 個人情報は一切収集しない
> - スコアはサーバに保存される (TOP100 ランキング機能のテスト用)
> - 不具合あったら [Twitter @odd__games or LINE 等] まで

### 4-3. APK インストールが弾かれる時

Android 8.0 以降は「アプリごと」に許可が必要:

```
設定 → アプリ → 特別なアプリアクセス → 不明なアプリのインストール
→ Chrome (or ダウンロードに使ったアプリ) → 許可
```

---

## 5. Google Play 本番リリース (友達テスト後の話)

### 5-1. 必要なもの

- Google Play Console アカウント ($25 一回払い)
- 署名済み AAB (Android App Bundle, .aab)
- アップロードキー (`*.jks` / `*.keystore`) ※ **絶対に紛失しないこと**
- スクリーンショット (1080×1920 縦, 最低2枚, 推奨8枚)
- Feature Graphic (1024×500 PNG)
- ハイレゾアイコン (512×512 PNG)
- プライバシーポリシー URL (既存の `privacy.html` でOK)

### 5-2. 署名鍵の生成 (一度だけ)

Android Studio の `Build → Generate Signed Bundle / APK` から GUI で生成可能。

または手動で:

```bash
keytool -genkey -v -keystore ~/oddquiz-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias oddquiz
```

入力項目:
- パスワード: 任意 (絶対に忘れない・どこかにメモ・GitHub にコミットしない)
- 名前/組織: 適当でOK (ODDGAMES 等)
- キーパスワード: ストアパスワードと同じでOK

**生成された `.jks` ファイルは厳重に管理。紛失するとアプリ更新不可。** Google Drive (パスワード掛けた zip) や 1Password 等にバックアップ。

### 5-3. 署名済み AAB 生成

```
Build → Generate Signed Bundle / APK → Android App Bundle → Next
→ keystore path / password 入力 → release → Finish
```

出力先:
```
android/app/release/app-release.aab
```

### 5-4. Play Console でアプリ作成

1. https://play.google.com/console/ にログイン
2. "アプリを作成"
3. 必要事項入力:
   - アプリ名: 変なクイズ
   - デフォルト言語: 日本語
   - アプリ or ゲーム: **ゲーム**
   - 無料 or 有料: 無料
   - 各種ポリシー同意

### 5-5. 内部テスト (ベータ配布)

正式リリース前にやる事を強く推奨:

```
Play Console → テスト → 内部テスト → 新しいリリースを作成
→ AAB をアップロード → 公開
→ "テスター" タブでメールアドレス指定 (Gmail のみ)
```

招待されたユーザーは Play ストア経由でインストール可能。これなら APK 直接配布の警告が出ない。

### 5-6. 本番リリース

```
Play Console → 製品版 → 新しいリリースを作成 → AAB アップロード → 提出
```

審査は通常 **数時間〜3日**。同時並行で以下を入力:

- ストアの掲載情報 (説明文・スクショ・アイコン)
- コンテンツのレーティング (アンケート)
- 対象ユーザー (年齢層・国)
- データセーフティ (プライバシー宣言)
- アプリのアクセス権 (ログイン不要 → 「すべての機能が制限なく使える」を選択)

### 5-7. データセーフティ宣言の内容 (Google Play 版)

iOS の Privacy Nutrition と似ている。以下のように回答:

| 質問 | 回答 |
|---|---|
| データを収集する? | はい |
| データを共有する? | いいえ (Firebase は処理委託なので "共有" にはあたらない) |
| 個人 ID (playerId) | 収集する / アプリ機能のため / 必須ではない |
| ユーザー名 (displayName) | 収集する / アプリ機能のため / 任意 |
| アプリ操作データ (score) | 収集する / アプリ機能・分析のため |
| 暗号化通信を使っている? | はい (HTTPS) |
| ユーザーがデータ削除を要求できる? | はい (Firebase Console 経由で対応) |

---

## 6. トラブルシューティング

### 6-1. 「アプリは互換性がありません」

`android/variables.gradle` の `minSdkVersion` を確認。Capacitor 8 のデフォルトは 22 (Android 5.1)。下げる必要は基本ない。

### 6-2. 起動するが真っ黒画面

```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

または Android Studio の `File → Invalidate Caches / Restart`。

### 6-3. ランキングが Android で動かない

`adb logcat` で WebView ログ確認:

```bash
adb logcat -s "Capacitor/Console:*" "chromium:*"
```

`hostname` が `localhost` になってるか確認。なってなければ `capacitor.config.ts` の `androidScheme: 'https'` 設定を確認。

### 6-4. Firebase に書き込めない (App Check 拒否)

`__isLocalDev` 判定が効いていないと推測される。一時的に `index.html` の `__isLocalDev` を `true` にして再ビルドし、書き込めるか確認 → 書き込めれば判定の問題、書き込めなければ Firebase Console 設定の問題。

---

## 7. クイックリファレンス

| やりたいこと | コマンド |
|---|---|
| 全ファイル sync | `npm run cap:sync` |
| Android Studio 開く | `npm run cap:open:android` |
| デバッグ APK 即生成 | `cd android && ./gradlew assembleDebug` |
| Release AAB 生成 (要署名) | `cd android && ./gradlew bundleRelease` |
| 接続中の実機にインストール | `adb install android/app/build/outputs/apk/debug/app-debug.apk` |
| ログ確認 | `adb logcat -s "Capacitor/Console:*"` |

---

## 8. 参考リンク

- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [Android Studio User Guide](https://developer.android.com/studio/intro)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [App Bundle vs APK](https://developer.android.com/guide/app-bundle)

---

**END**
