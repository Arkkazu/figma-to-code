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

## 独立レビューを工程にしない（2026-09-04）

**独立レビューを、作業を進める条件にしない。**オーナー指示：「独立レビューが仕様だと作業効率が悪すぎる」。実装・修正・正本変更を、レビュー役の承認待ちで止めない。STATE.md や報告に「独立レビュー未了」を残務として書かない。

理由は3つで、いずれも実測に基づく。

1. **判断を要する項目がほとんど無かった。** page coverageで廃止したときの実測どおり、レビューで見ていた項目はほぼ全部が構文解析で判定できた（`rules/figma-spec-pipeline.md`）。
2. **止められない偽装を検査の形で置いていた。** 既定のレビュー役は同一エージェントの別context（共通Vault `rules/corrections.md` 2026-08-26）であり、identityは実装役が自由に名乗れる（同 `rules/corrections.md` 2026-08-25）。残るのは往復のコストだけだった。
3. **往復が修正の代わりになっていた。** 共通Vault `rules/corrections.md` 2026-09-01（査読を4往復して変更行数0）。

代わりに置くのは、人ではなく機械で落ちるものだけとする。

- 決定・証跡・凍結入力のハッシュ照合と構文検査（`figma-gate.mjs`）
- **変更を壊す方向の負のE2E**。新しい検査を足したら、その呼び出しを無効化して実際に落ちることを確かめてから復元する。これが独立レビューの代わりである
- 弱体化の実測（`rules/correction-log-promotion.md`「弱体化の実測」）
- オーナー承認。これは残す。撤廃したのは「別人格のレビュー役」であって、オーナーの判断ではない

第三者の目が要ると判断したときは、工程としてではなくオーナーが担当を指定して行う。