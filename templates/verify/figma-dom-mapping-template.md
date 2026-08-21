---
type: template
status: permanent
date: 2026-07-11
topic: Figmaノード↔実装DOM 全件対応表テンプレート
tags: [Figma, verify, template, design-to-code]
---

# Figmaノード ↔ 実装DOM 全件対応表（テンプレート）

`rules/figma-spec-pipeline.md` フェーズ0（着手ゲート）で要求される対応表の書式。案件側 `MyBrain/verify/` にコピーして使う。**見えている主要要素だけを対象にしない。**

## 対応表

| 区分 | Figma node | 実装DOM / selector | Figma事実 | 現状 | 差分・処置 |
| --- | --- | --- | --- | --- | --- |
| section |  |  | x/y/w/h、背景、overflow |  |  |
| wrapper / inner / content |  |  | width、padding、gap、layout |  |  |
| nav / list / item |  |  | 順序、項目数、クリック範囲 |  |  |
| title / text |  |  | 文言、改行、font、色 |  |  |
| button / icon |  |  | 枠、padding、状態差分 |  |  |
| image / pseudo相当の装飾 |  |  | 表示枠、crop、asset |  |  |

- section / wrapper / inner / content / nav / list / item / title / text / button / image / 疑似要素相当 / hiddenでない装飾要素を必ず含める。
- 親要素の width / height / x / y / padding / gap / overflow も比較対象にする。**子要素が合っていても親が違えばNG。**
- コンポーネント見本ページだけで済ませず、実際に部品を使用するページのDOM・クラス・CSS読み込み順と照合する。

## 未対応・余計な要素リスト（別表で明記）

| 種別 | 要素 | Figma node / DOM selector | 処置 |
| --- | --- | --- | --- |
| FigmaにあるがDOMにない |  |  |  |
| DOMにあるがFigmaにない |  |  |  |

> [!important] このMarkdownは人間のレビュー用
> `figma-gate` はこのファイルを `mappingSha256` でハッシュ固定するだけで、内容を読まない。
> 機械検査は同じ内容を機械可読にした `MyBrain/verify/nodemap-<対象>.json`（書式は `nodemap-example.json`）で行う。
> manifestの `scope.nodeMapPath` に登録し、`preflight` のFigma子ノード単位カバレッジ検査をPASSさせる。
> **この表だけを作ってnode mapを作らない運用は、対応漏れが工程を素通りするため禁止する。**

対応表・リストを作れない場合は作業を進めず、未確認として止める（`rules/figma-spec-pipeline.md`「停止・未確認として報告する条件」参照）。
