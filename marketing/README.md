# 変なゲーム / @odd__games ポストストック

キャラ垢 @odd__games 用のポスト 100 件。
投稿は Claude in Chrome 等を使って手動運用する。

## posts.csv

| 列 | 内容 |
|----|------|
| id | 1〜100 |
| mode | `emotion`（感情豊か） / `flat`（無心） |
| text | 本文（改行含む場合はダブルクォート囲み） |
| posted_at | 投稿済みなら ISO 日時、未投稿なら空 |

- **感情 51 / 無心 49** をだいたい交互に配置済み。id 昇順で回せば自然に起伏が出る。
- 朝＝emotion、夜＝flat みたいに分けるのも可。
- スプレッドシート（Google Sheets / Numbers / Excel）で直接編集可能。
- 投稿したら `posted_at` を埋めておくと重複投稿を避けられる。
