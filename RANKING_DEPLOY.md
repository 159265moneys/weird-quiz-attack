# ランキング機能 — デプロイ & 動作確認手順

このメモは「ランキング機能仕様書v1.0.md」のセクション 5/13/15 の運用版。
α 配布前に **必ずこの順** で進めること。

---

## 0. 既に完了した作業 (AI 実装済)

- [x] `js/online/firebase-config.js` (config の値埋め込み)
- [x] `index.html` への Firebase SDK + App Check 初期化追加
- [x] `firestore.rules` 作成 (既存 record 形式に厳密適合)
- [x] `firebase.json` / `.firebaserc` / `firestore.indexes.json` 作成
- [x] `js/online/ranking.js` の内部実装を Firestore 化 (API 完全互換)
- [x] BOT seed (`data/ranking_seed.json`) と localStorage を保険として残す

`window.Ranking.fetchTop` / `submit` / `isEnabled` / `setEnabled` は
旧 α Prep モードと完全互換。画面側 (result / ranking / homeMenu) は無修正。

---

## 1. 🧑 Firebase コンソール側で完了済

- [x] Firebase プロジェクト作成 (Project ID: `odd-quiz`)
- [x] Firestore 有効化 (asia-northeast1, 本番モード)
- [x] Web アプリ登録 (`weird-quiz-web`)
- [x] App Check に reCAPTCHA Enterprise プロバイダ登録 (TTL 1h)
- [x] reCAPTCHA Enterprise キー作成 (ドメイン: `localhost`, `159265moneys.github.io`)

**App Check の Enforce は OFF のまま** にしてある。SDK 側のトークン取得が
安定して動くのを確認してから ON に切替える (手順 4)。

---

## 2. 🧑 Firestore Rules のデプロイ (初回のみ Firebase CLI を入れる)

```bash
# 初回のみ
npm install -g firebase-tools
firebase login   # ブラウザで Google OAuth 認証

# プロジェクトルートで
cd /Users/t.y/Desktop/変なクイズ
firebase deploy --only firestore:rules
```

成功すると `✔ Deploy complete!` が出る。
Firebase Console → Firestore → ルール タブで反映を確認可能。

---

## 3. 🧑 ローカル動作確認

```bash
# プロジェクトルートで簡易 HTTP サーバ (どれでも OK)
python3 -m http.server 8080
# または: npx serve -l 8080
```

ブラウザで `http://localhost:8080` を開き、DevTools の Console で:

```js
// 1) Firebase 初期化を確認
window.Firebase            // → { app, appCheck, db } のオブジェクトが出る
window.Ranking.isOnline()  // → true

// 2) seed (BOT) ロード確認
await window.Ranking.fetchTop(1, 5)
// → 5 件返る (うち _bot:true が含まれる)

// 3) ダミー送信 → Firestore 書き込み確認
await window.Ranking.submit({
  stageNo: 1, score: 35000, correct: 18, total: 20,
  totalTimeMs: 60000, rank: 'A', deathEnd: false,
  sessionId: window.crypto.randomUUID()
})
// → { ok: true, sent: true, mode: 'online', rank: <数字> }
```

Firebase Console → Firestore Database → データ で
`/rankings/stage-1/scores/...` に新しいドキュメントが出来てれば OK。

トラブル時:
- `mode: 'online-failed'` → Console でエラー詳細を確認。よくあるのは:
  - reCAPTCHA キーのドメイン設定漏れ (localhost が登録されてない)
  - Rules の検証で弾かれている (Firebase Console の Rules → ログを参照)
- `mode: 'offline'` → `window.Firebase` が undefined。CDN 到達不可

---

## 4. 🧑 App Check Enforce を ON にする

ローカルで `mode: 'online'` で書き込めるのを確認してから:

1. Firebase Console → App Check → API タブ
2. **「Cloud Firestore」** を選択 → 「適用 (Enforce)」を **ON**
3. ON 後 1 分ほど反映待ち
4. もう一度ローカルで `Ranking.submit(...)` してまだ通れば本番運用可能

⚠️ Enforce ON 後に書き込みが急に失敗するようになったら、
   reCAPTCHA トークンが取れていない。SDK の初期化エラーログを確認。

---

## 5. 🧑 GitHub Pages / 本番ビルドの動作確認

```bash
npm run build      # www/ を再生成
git add -A && git commit -m "ranking: enable Firebase Firestore"
git push           # GitHub Pages が再デプロイされる
```

`https://159265moneys.github.io/weird-quiz-attack/` で開いて
DevTools Console で `Ranking.isOnline() === true` を確認。

---

## 6. 🧑 iOS Capacitor ビルド

```bash
npm run cap:sync   # build → www/ → ios/App/App/public/ に反映
npx cap open ios   # Xcode で実機/シミュ起動
```

Capacitor の WebView origin は `capacitor://localhost`。
reCAPTCHA Enterprise のドメイン許可リストには `localhost` を入れて
あるので、サブドメイン無し `localhost` 単体マッチで通る想定。

万一 iOS で App Check トークンが取れない場合は、将来的に
`@capacitor-firebase/app-check` を追加して DeviceCheck プロバイダに
切替えるのが本筋 (β 以降)。

---

## 7. ロールバック (やらかした時)

### Rules を間違えた場合
```bash
# 直前の Rules バージョンに戻す
firebase deploy --only firestore:rules
# または Firebase Console の Rules → 履歴 → 復元
```

### Firestore のゴミデータを掃除したい
Firebase Console → Firestore → データ → コレクション (rankings) を削除

### Ranking 機能ごと一旦 OFF にしたい
`js/online/firebase-config.js` を空オブジェクトに置き換え:
```js
window.FIREBASE_CONFIG = {};      // 初期化エラー → window.Firebase 不在
window.APP_CHECK_SITE_KEY = "";
```
→ `Ranking.isOnline() === false` になり、自動的に offline モード
   (BOT seed + localStorage) に切替わる。画面側は無事。

---

## 8. 監視

- Firestore 書き込み件数: Firebase Console → Firestore → 使用量
- App Check 拒否率:        Firebase Console → App Check → 指標
- Spark 無料枠:
  - Firestore: 50,000 reads / 20,000 writes per day
  - reCAPTCHA Enterprise: 10,000 評価 / 月

DAU 3,000 までなら無料枠内で余裕。超えそうになったら β 移行時に
古いレコード (30日以上前) の自動削除を Cloud Functions で書く。
