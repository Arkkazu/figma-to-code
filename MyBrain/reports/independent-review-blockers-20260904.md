# 独立レビュー待ち／単体で進行不能な項目の点検（2026-09-04）

対象：`C:\AI\figma-to-code`（ブランチ `feat/entry-gate-and-vendored-sync`、`origin/master` = 6a20e12 + 未pushの3コミット）

## 結論

1. **別エージェント（codex等）がいないと進まない項目は0件** ✅。独立性の機械判定は3箇所すべて「actor と contextId の**両方**が実装役と一致したときだけ落ちる」実装で、片方が違えば通る。
   - `templates/verify/figma-gate.mjs:1382`
   - `tools/figma-log-promote.mjs:869`
   - `research/p3/p3-role-packet.mjs:570`
   前例も実在する（`learning/review-coverage-mechanical-checks-20260826.json`：actor=claude のまま別contextで書き、同一セッションが実装も担当した事実を開示している）。
2. **単体で進行不能なのはオーナー承認だけ**。機械が `owner` を要求する関門は下記Bの7種。
3. いま実際に止まっている昇格は1件で、それは**Bに当たる**（承認しても、閉じても、どちらもオーナー承認が要る）。

## A. 独立レビュー待ち（自分で別contextを立てれば進む。待つ必要はない）

| 対象 | 状態 | 備考 |
|---|---|---|
| STATE `[198]` scope-conflict-audit の所有失効・未登録の停止撤廃 | ⚠️ レビュー未了 | STATE.md 本文が「owner が担当を指定するまで」としているが、共通Vault `rules/corrections.md` 2026-08-26 の既定は**同一エージェントの別context**。担当指定を待つのは同記録が禁じた停止理由に当たる。**申告済みの弱体化を含むので、レビューの最初の対象にすること** |
| 2026-09-01以降の19コミット | ⚠️ STATE記録0件・レビュー記録0件 | STATE.md の最新は `[198]`（2026-09-01）で止まっている。以後 `rules/`・`tools/`・`templates/verify/` を触った19コミットに対応する記録がない。オーナー直接指示による変更なので優先順位1で正当だが、`LOOP.md` 手順6のSTATE追記は未履行 |
| `[196]` playbook root guard | ✅ 対象外 | `[197]` でオーナーが「レビュー不要」と判断済み |

## B. オーナー承認が要る関門（AIが越えてはならない＝単体では進行不能）

1. **昇格提案 `figma-log-page-coverage-review-invalidated-implementer-stops-ede9450263c8d706`**（現在 `pending-review-with-unclassified`、2026-09-04 再スキャンで同一 ✅）
   - `apply` は `review.ownerApproval.status === "approved"` を要求（`tools/figma-log-promote.mjs:904`）。
   - `close`（completed-outside-promotion）も `ownerApproval.status === "approved"` を要求（同 1040）。
   - **論点**：この提案の対象機構（page coverage の独立レビュー承認）は 714f23c / 6a20e12 で**削除済み**。強化すべき対象が存在しないので、順当な処理は `apply` ではなく `close` である。どちらにせよオーナー承認が要る。
2. `figma-scope-lock` の scope amendment / rebaseline：`ownerApproval.approvedBy === "owner"` を文字列で固定（`tools/figma-scope-lock.mjs:512, 586`）。scope途中で編集パスが増えると必ずここで止まる。
3. アクセシビリティの色検査停止：`config.colorChecks.ownerApproval.status === "approved"`（`templates/verify/accessibility-verify.mjs:205`）。
4. P-3 忠実度ベンチマーク：判断J record／preImplementationProof／evaluator baseline／current改善承認／clean-room evidence がいずれも `ownerApproved: true` 必須（`templates/verify/fidelity-benchmark.mjs:620, 942, 1224, 1247 ほか`）。
5. P-3 の attachment-only 移行：MCP／connector／plugin の無効化を**機械証明ではない運用申告**として残存リスク付きで受け入れるかの採否（STATE `[170]` `[171]`）。
6. 判断K：Q-03 §5-1 / §5-2（Grid・Min/Max）の実測対象の指定。該当機能を含む案件をオーナーが指定するまで採取不能。
7. branch protection / required check の有効化（リポジトリ設定）。未有効のため、CIは「落ちたことが見える」だけでmergeを止めない。

## C. 誰にもできない項目（オーナー承認でも解除されない）

- **P-11**：現行の公開APIで到達不能。STATE `[170]` で BLOCKED と判定済み。同一方式の再観測・timeout対策・追加回帰では解消しない。`--require-p11-authorization` の fail-closed を維持する。
- `run-checks.mjs` の `KNOWN_FAILING` 9件のうち、実ブラウザ系5件と案件成果物1件はこのリポジトリ単独では緑にできない（除外は2026-08-22から13日経過 ✅ 実測）。

## D. 潜在リスク：もう1件出ると単体作業が不能になる記録

`learning/log-promotions/correction-self-approval-via-second-context-20260825.input.json`
（`recurrenceKey: independent-review-bypassable`、現在 **1/2**。閾値2）

この記録の `prevention` は「**実装役と異なる actor であることを必須にし、contextIdの相違だけで独立性を認めない**」と書いてある。同じ再発キーがもう1件記録されると `scan` が提案を生成し、それが昇格されると、共通Vault `rules/corrections.md` 2026-08-26（既定は同一エージェントの別context）と**正面から衝突する**。衝突したまま昇格すると、独立レビューが常に他エージェント待ちになり、単体作業が不能になる。

閾値到達前に、どちらを採るかを決めておくのが安い。決めるのはオーナー。

## E. 残務（AI単体で処理できる。承認不要）

- 未分類の横断ログ2件（`loop-log` マーカー欠落）。`rules/corrections.md:135`（2026-08-19 の節）と `rules/mistakes.md:17`（2026-08-26 の節）。分類しても提案生成は止まらないが、`pending-review-with-unclassified` は解消しない。
- 未pushの3コミット（`ef202d6` / `a95a231` / `441e554`）。共通Vault `rules/corrections.md` 2026-09-01 は正本リポジトリの修正を**pushまで**と定めている。
- `templates/verify/figma-page-coverage.mjs:729` の失敗メッセージが `run preflight after independent approval` のままで、廃止済みの工程を案内している（scope外のため本点検では修正していない）。
