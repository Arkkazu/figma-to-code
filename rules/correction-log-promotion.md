# Figma訂正ログからLoop Engineeringへ昇格する契約

## 目的

案件横断のFigma実装失敗を、同じ失敗を拒否するルール・検証器・負のE2E候補へ接続する。推測分類、案件固有情報の横断コピー、承認なしの正本書換えは禁止する。

## 1. 機械可読な記録

新しい案件横断ログは手書き追記せず、`templates/figma-log-record.json` を埋めて保存する。

```powershell
node tools/figma-log-promote.mjs record rules/log-promotion-policy.json <record.json> learning/log-promotions
```

`record` はID一意性、許可済みルール・検証器、案件固有URL・パス・node-id・アセット参照の不在を検査し、`<!-- loop-log-schema: v1 -->` より前へメタデータ付きで追記する。

## 2. 再発の検知

```powershell
node tools/figma-log-promote.mjs scan rules/log-promotion-policy.json learning/log-promotions
```

同じ `recurrenceKey` が閾値以上なら不変の `pending-review` proposalを作る。未分類の新規ログがあれば `waiting-human` に停止し、提案を進めない。

## 3. 独立レビューと承認

`templates/figma-log-promotion-review.json` を作り、提案・入力ログSHA-256、実装役と異なるレビュー文脈、非緩和性、負のE2E、owner承認状態を記録する。

```powershell
node tools/figma-log-promote.mjs review rules/log-promotion-policy.json <proposal.json> <review.json> learning/log-promotions
```

`review` は根拠ハッシュと負のE2Eを再実行する。owner承認前は `waiting-owner`、承認済みなら `ready-to-apply` receiptを出力する。AIは `ownerApproval.status` を勝手に `approved` にしない。

## 4. 承認済み限定差分の適用

`ready-to-apply` receiptがある場合だけ、`templates/figma-log-promotion-plan.json` の限定差分を適用できる。

```powershell
node tools/figma-log-promote.mjs apply rules/log-promotion-policy.json <proposal.json> <review-receipt.json> <promotion-plan.json> learning/log-promotions
```

`apply` はproposalが許可した対象だけを受け付ける。適用前SHA-256、一意な置換、変更MJSの構文、負のE2Eを検査し、失敗時は全対象を適用前に復元する。成功時だけ `promotions/` に不変のpromotion receiptを保存する。

## 5. 境界

- `apply` は通常のFigma scope、`figma-gate close`、Git hook、commit、push、deployから自動起動しない。
- 正本の昇格は独立レビュー、負のE2E、owner承認、STATE.md記録をすべて満たす別の仕様育成イテレーションだけで行う。
- 案件固有の事実は案件側 `MyBrain/rules/corrections.md` に残す。

## 更新履歴

- 2026-07-18 / codex / D-010起草として、訂正ログからのproposal生成契約を新設
- 2026-07-18 / codex / D-011起草として、record・review receipt・承認済み限定差分の原子的適用を追加