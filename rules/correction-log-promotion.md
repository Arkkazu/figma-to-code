# Figma訂正ログからLoop Engineeringへ昇格する契約

## 目的

案件横断のFigma実装失敗を、同じ失敗を拒否するルール・検証器・負のE2E候補へ接続する。推測分類、案件固有情報の横断コピー、承認なしの正本書換えは禁止する。

## 1. 機械可読な記録

新しい案件横断ログは手書き追記せず、`templates/figma-log-record.json` を埋めて保存する。

```powershell
node tools/figma-log-promote.mjs record rules/log-promotion-policy.json <record.json> learning/log-promotions
```

`record` はID一意性、許可済みルール・検証器、案件固有URL・パス・node-id・アセット参照の不在を検査し、`<!-- loop-log-schema: v1 -->` より前の**機械管理領域の先頭**へメタデータ付きで追記する（2026-08-26 更新：それ以前は marker の直前＝領域の末尾へ入れていたため、領域内が古い順に並び、先頭から読むセッションに最新の記録が届かなかった）。marker より後は legacy領域で、メタデータを持たず再発判定の対象にならない。

## 2. 再発の検知

```powershell
node tools/figma-log-promote.mjs scan rules/log-promotion-policy.json learning/log-promotions
```

同じ `recurrenceKey` が閾値以上なら不変の `pending-review` proposalを作る。

**未分類の節は、無関係な家族の提案生成を止めない（2026-09-01 変更）。**

旧契約は「未分類の新規ログが1件でもあれば `waiting-human` に停止し、提案を進めない」だった。
この全面停止のため、機構は設置以来**一度も提案を出していなかった**。2026-09-01 実測：
閾値2に到達した promotable 家族が1件（`page-coverage-review-invalidated-implementer-stops`）
あったにもかかわらず、それとは無関係な2節（`rules/corrections.md` の 2026-08-19 の節と
`rules/mistakes.md` の 2026-08-26 の節）に marker が無いというだけで提案は0件だった。
「規則は増えるが検証器は強くならない」の唯一の機械的な出口が、ここで塞がっていた。

未分類は「その節が未分類である」という事実であって、他の家族の再発が起きていないという
根拠にはならない。現契約は次のとおり。

| 未分類 | 閾値到達family | status |
|---|---|---|
| なし | あり | `pending-review` |
| **あり** | **あり** | **`pending-review-with-unclassified`** |
| あり | なし | `waiting-human` |
| なし | なし | `no-recurring-failure` |

未分類の内訳（path / heading / line / SHA-256）は intake・report・latest が保持する。
**提案本体には入れない。**提案は不変ファイルであり、無関係な節の分類が進むたびに
同一IDの内容が変わって再スキャンが落ちるためである。

提案が出ても、従来どおり `applyAllowed: false` の `pending-review` 止まりである。
負のE2E・弱体化の実測・オーナー承認なしに正本は変わらない。未分類の解消は、
提案の承認とは別に必要な残務として `waiting-human` 相当の扱いを続ける。

## 3. 検証と承認

**2026-09-04：レビュー役が実装役と別人格であることの要求を廃止した**（オーナー指示「独立レビューが仕様だと作業効率が悪すぎる」）。`review` を回すのに別セッション・別担当を用意しない。止めるのは下の機械検査とオーナー承認だけである。理由は `rules/loop-execution.md`「独立レビューを工程にしない」。

`templates/figma-log-promotion-review.json` を作り、提案・入力ログSHA-256、この工程を回した identity、非緩和性、負のE2E、owner承認状態を記録する。

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

### 弱体化の実測（2026-09-04 追加）

`review.checks.strengthensOnly` と `guardrailsUnchanged` は、レビュー役が文字列 `"PASS"` を書けば通る**申告**であり、弱体化を1つも止めていなかった。しかもレビューは提案に対して行われ、**差分そのものはレビュー役の目に触れない**。

`apply` は書き込む前に、patchの前後から検査の在庫を数える。

| 対象 | 在庫の単位 | 根拠 |
|---|---|---|
| `.mjs` | 文字列・テンプレートリテラル | 検査の識別子と失敗メッセージはここに現れる。補間は `${}` へ潰す |
| `.md` | 空でない行 | 規則の弱体化は行の削除として現れる |

同じ内容が複数あるものは多重集合として数える。在庫が空の対象は、比較が空振りするため落とす。

**消失そのものは禁止しない。**言い換えれば消失として出るため、一律に止めれば正当な強化まで止まる。要求するのは「消えるものを事前に列挙し、20文字以上の理由を書く」ことで、機械はその列挙が実測と**過不足なく**一致するかを見る。

```json
"removedGuards": [
  { "target": "templates/verify/x.mjs", "guard": "消える文字列そのもの", "reason": "なぜ消えてよいか" }
]
```

- 申告のない消失があれば、対象を1バイトも書かずに落ちる。
- 起きない消失を申告しても落ちる。
- 何も消えないなら `removedGuards` は空でよい。純粋な追加は素通りする。

消失は理由つきで promotion receipt の `removedGuards` に残る。負のE2Eが見逃す消失（テストが触れていない検査の削除）を止めるのがこの検査の役目である。

## 5. 境界

- `apply` は通常のFigma scope、`figma-gate close`、Git hook、commit、push、deployから自動起動しない。
- 正本の昇格は負のE2E、弱体化の実測、owner承認、STATE.md記録をすべて満たす別の仕様育成イテレーションだけで行う。
- 案件固有の事実は案件側 `MyBrain/rules/corrections.md` に残す。

## 更新履歴

- 2026-07-18 / codex / D-010起草として、訂正ログからのproposal生成契約を新設
- 2026-07-18 / codex / D-011起草として、record・review receipt・承認済み限定差分の原子的適用を追加