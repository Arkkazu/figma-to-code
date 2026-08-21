---
type: rule
status: permanent
date: 2026-07-17
topic: LOOP execution hierarchy
tags: [figma, loop, verification, governance]
---

# LOOPの位置づけ

## 優先順位

Figma実装・修正では、次の順で判断する。

1. システム規則とオーナーの現在の明示指示
2. 共通Vault（`C:\AI\vault`）の憲法・恒久ルール・汎用コーディング規則
3. `C:\AI\figma-to-code` のFigma固有規則・テンプレート
4. 案件側 MyBrain の事実・単位規約・案件固有ルール
5. 案件側 LOOP.md と STATE.md の実行手順・状態記録

LOOP.md は上位規則を再定義する文書ではない。上位規則を緩和、例外化、または担当者名・手順名で上書きしてはならない。

## 実行責務

- 共通Vault（`C:\AI\vault`）は、全作業に共通する原則とオーナーの判断基準を定める。
- `C:\AI\figma-to-code` は、Figma固有の取得・spec・アセット・実測・検証・テンプレート・履歴の唯一の正本である。
- 案件側MyBrainは、対象案件のFigma情報、単位、ルーティング、既知の修正指示を定める。
- 案件側LOOPは、Figma規則を案件内で実行するためのpreflight、checkpoint、section-close、close、STATE記録を定める。
- Figma照合はコーディングの各反復内で行う。Git hookに結び付けず、commit / push / deployでは再実行しない。

## 検証の単一実行

詳細な合否基準、画像差分の扱い、FAIL分類、`一括spec → 一括測定 → FAIL一括修正 → 全件再測定` の手順は、`C:\AI\figma-to-code\rules\figma-spec-pipeline.md` の「フェーズ3A: 一括照合・修正バッチ（単一実行）」を唯一の正本とする。ここでは案件LOOPでの適用だけを定める。

- `section-start` 前に、正本で定めた集約specと証跡を `preflight` で固定する。
- 各 `checkpoint` は、対象section / componentのPC/SP全件を正本の単一コマンドで測定する。FAIL時は、同じcheckpointのFAILを一括修正してから全件再測定する。
- spec不備、待機失敗、タイムアウト、未取得値、証跡欠落がある場合はcheckpointを停止し、STATE.mdに事実を記録する。PC/SP・要素・状態を分割した手作業の再確認で通過させない。
- `section-close` と最終 `close` は、正本のPASS条件と案件側page coverageの両方を満たす場合だけ実行する。
## 担当者

実装役・検証役は、オーナーがタスク開始時に指定する。LOOP内の役割表記は担当分離を表すだけであり、上位規則またはオーナーの指示に反して特定のエージェントへ固定しない。