---
type: rule
status: permanent
date: 2026-07-18
topic: Figma実装ループの自己改善
tags: [Figma, loop, learning, verification]
---

# Figma実装ループの自己改善

## 目的

Figma実装のclose後に、所要時間、検証回数、対象外変更、HTML検証の記録を事実として保存し、既知の再発を案件ローカルの安全制御へ接続する。

## 原則

- `figma-gate close` の成功後だけ学習器を実行する。Git hook、commit、push、deployでは実行しない。
- 学習イベントには事実だけを保存し、原因推測や正本ルール本文を混ぜない。
- `safe-auto` は案件ローカルの制約追加だけを行う。正本ルール、人間ゲート、停止条件、許可リスト、予算、ネットワーク設定を変更しない。
- 正本ルールの改善は根拠付き提案として出力し、独立レビューとオーナー承認を経るまで反映しない。
- 学習器の入力、出力、active controls はすべてリポジトリ内の相対パスに限定する。

## 実行物

- 正本: `C:\AI\figma-to-code\templates\verify\loop-learn.mjs`
- 案件側コピー: `MyBrain/verify/loop-learn.mjs`
- 改善カタログ: `MyBrain/verify/loop-learning-policy.json`
- 証跡保存先: `MyBrain/verify/learning/`

`figma-gate close` は学習イベントと検知レポートを自動生成する。手動で確認するときは次を使う。

```bash
npm run figma:learn -- from-gate MyBrain/verify/gate-<target>.json .figma-gate/learning-input.json MyBrain/verify/loop-learning-policy.json MyBrain/verify/learning
```

## 出力と権限

- `events/`: 追記のみの学習イベントJSON
- `reports/`: シグナル判定と根拠JSON
- `proposals/`: `pending-review` の正本改善提案JSON/Markdown
- `active-controls.json`: `safe-auto` で許可された案件ローカル制御だけ
- `latest.json`: 直近結果の索引

同じ問題を検知しても、学習器は正本のMarkdown、ソースコード、Git設定、デプロイ設定を直接変更しない。提案は `LOOP.md` / `STATE.md` の独立レビュー手順で扱う。

## Figma横断訂正ログの取込

案件横断のFigma失敗を `rules/corrections.md` / `rules/mistakes.md` へ記録した直後は、`rules/correction-log-promotion.md` のJSONメタデータを付けて次を実行する。

```powershell
node tools/figma-log-promote.mjs scan rules/log-promotion-policy.json learning/log-promotions
```

同じ再発キーが閾値に達すると、Loop Engineering向けの `pending-review` 提案を生成する。提案は正本ルール・検証器を直接編集しない。負のE2E、独立レビュー、オーナー承認が揃うまで昇格しない。未分類の新しい横断ログは、無関係な再発キーの提案生成を止めない（2026-09-01 変更。以前は全面停止し、そのため機構は設置以来一度も提案を出していなかった）。閾値到達がなく未分類だけがあるときに `waiting-human`、両方あるときは `pending-review-with-unclassified` を返し、未分類の解消は提案の承認とは別の残務として残す。詳細は `rules/correction-log-promotion.md`。

## ログ昇格の実装ループ（D-011起草）

横断ログは `record`、提案生成は `scan`、独立レビューは `review`、owner承認済みの限定差分は `apply` の順に進める。各段階で入力SHA-256、許可対象、負のE2Eを検査し、適用は失敗時に対象を復元する。通常の案件LOOPや `figma-gate close` は `apply` を自動起動しない。

## スコープ逸脱の検知（D-012）

scope lockのstateをclose記録へ含める。scope manifestにないパスが検知された場合は、所要時間の理由付けや後付けの改善では解消せず、scopeを blocked としてownerへエスカレーションする。safe-autoが追加できるのは案件ローカルでscope lockの開始・assert・verifyを必須化する制御だけであり、対象外変更を許容する制御、scopeの自動拡張、正本ルールへの自動変更は許可しない。
## 停止

次の場合、学習器は安全制御を適用せず失敗または `pending-review` とする。

- イベントまたはポリシーの必須事実が欠ける
- 制御が `effect: strengthen` と `scope: project-local` の両方を満たさない
- 必要なゲート能力が無い
- 正本ルールまたは人間ゲートに触れる変更が必要

## 更新履歴

- 2026-07-18 / codex / Loop Engineering D-009に対応する自己改善の実行契約を新設

- 2026-07-18 / codex / D-010起草として、Figma横断訂正ログからのLoop Engineering提案生成を追加
- 2026-07-18 / codex / D-011起草として、review receiptと承認済み限定差分の原子的適用契約を追加

- 2026-07-18 / codex / D-012として、scope逸脱をblockedで停止し、通常scopeへ運用改善を混入させない規約を追加
