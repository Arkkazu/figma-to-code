---
type: rule
status: permanent
date: 2026-07-03
topic: Figma MCPからの実装ルール
tags: [Figma, MCP, Codex, design-to-code, WordPress]
---

# Figma MCPからの実装ルール

CodexがFigmaデザインを実装するとき、目分量・推測・一部確認だけでコーディングしないための手順。

> **必須：実装の実行手順は `C:\AI\figma-to-code\rules\figma-spec-pipeline.md`（スペック駆動の閉ループパイプライン）に従う。**
> 本ファイルは取得項目・換算式・チェック順の詳細定義。パイプラインのspec作成／実測照合フェーズから参照される。

## 基本方針

- Figma実装では、必ずFigma MCPから対象ノードの実データを取得してからコードを書く。
- スクリーンショットの見た目だけ、過去の記憶、既存コードの雰囲気、比率計算だけでCSS値を決めない。
- 「Figmaどおり」と報告してよいのは、Figma MCP取得値、実装コード、実ブラウザ計測値を照合した箇所だけ。
- Figma値が取得できない場合は「未取得」として止める。推測で補完しない。

## 着手前に必ず読む

1. `C:\AI\vault\rules\corrections.md`（全作業共通の恒久ルール）
2. `C:\AI\vault\rules\mistakes.md`（全作業共通の再発防止）
3. `C:\AI\figma-to-code\rules\corrections.md`（Figma固有の恒久ルール）
4. `C:\AI\figma-to-code\rules\mistakes.md`（Figma固有の再発防止）
5. `C:\AI\figma-to-code\references\Figmaレビュー基準.md`
6. `C:\AI\figma-to-code\rules\figma-image-export.md`
7. 案件側 `MyBrain/README.md`
8. 案件側 `MyBrain/rules/corrections.md`

## Figma MCPで取得するもの

対象URLを受け取ったら、まずURLを分解する：`/design/<fileKey>/...?node-id=XXXX-YYYY` → fileKey / nodeId（`XXXX:YYYY`）。**nodeIdを推測しない。node-idが無いURLは対象未特定として停止する。**
取得には `get_metadata` / `get_design_context` / `get_variable_defs` / `get_screenshot`（個別）を使い、最低限次を取得する。

- fileKey
- nodeId
- 対象フレーム名
- node階層
- section / frame / component の x, y, width, height
- auto layout の direction, padding, gap, align, justify
- text の文言、改行位置、行数
- font-size, line-height, letter-spacing, font-weight, color
- button / card / list の幅、高さ、padding, gap, border-radius
- image / icon / logo の表示枠、asset URL、scaleMode、imageTransform、opacity、blend mode
- PC / tablet / SP の対応ノード
- hover / open / active 等の variant、instance の元 component（状態差分UIは default だけで実装しない）
- 親フレーム・同階層の兄弟要素（対象node単体の値だけでページ上の配置・余白を決めない）

## 単位換算（Figma値 → コード値）

Figmaが返す値は基本的にpx。コードに書く前に、必ず**案件の単位規約**に従って換算する。

- 着手前に案件側 `MyBrain/rules/` の単位規約ファイルを確認する。無い場合は、既存SCSSの `html { font-size }` とビルド済みCSSから規約を特定し、案件側にルールとして書き残してから実装する。
- **Figmaのpx値を、規約を確認せずそのまま `px` で書かない**。フルードrem方式の案件では `px` 直書きはレスポンシブ時に拡縮されず、ズレの直接原因になる。
- letter-spacing の換算式：
  - Figmaが `%` の場合 → `em` = `% / 100`（例：`2%` → `0.02em`）
  - Figmaが `px` の場合 → `em` = `px ÷ font-size`（例：font 28px / tracking 1.4px → `0.05em`）
- line-height の換算式：
  - Figmaが `%` の場合 → 単位なし = `% / 100`（例：`150%` → `1.5`）
  - Figmaが `px` の場合 → 単位なし = `px ÷ font-size`
- 換算結果が割り切れない場合は丸めずに計算値を書き、丸めた場合はコメントで元値を残す。

## 実装前の差分表

コードを触る前に、対象ごとに次の表を作る。

| 対象 | Figma node | Figma値 | 現HTML | 現SCSS | 差分 | 変更する内容 | 変更しない内容 |
| --- | --- | --- | --- | --- | --- | --- | --- |

差分表を作れない場合はコードを変更しない。

## 背景色の確定手順（必須・2026-07-05再発対応）

セクション単位の実装では、コードを書く前に必ず「セクション×背景色×根拠」の表を作る。

| セクション | 背景色 | 根拠（いずれか必須） |
| --- | --- | --- |
| 例: セクションA | #EDEDEC | node XXXX:YYYY 個別スクショのピクセル実測 |

- 根拠として認めるのは次の3つだけ。**縮小全体スクショの印象・周辺セクションからの類推・「塗りが無いから白/黒」の決めつけは根拠にならない。**
  1. design_context に出力された背景指定（`bg-*` / backgroundImage）
  2. get_variable_defs で取得した塗り変数
  3. 対象ノードの get_screenshot（個別）＋ピクセル実測値
- design_context に背景指定が出てこないノードは「背景未取得」として扱い、上記2または3で確定するまでそのセクションの背景をコードに書かない。
- 根拠列が埋まらない行が1つでもあれば、実装を止めて取得を先に行う。

## チェック順

レイアウトのズレは必ずこの順で見る。

1. DOM構造
2. BEMクラス / modifier class
3. display / grid / flex / order
4. CSSカスケードと生成CSSの上書き順
5. 親要素の幅・高さ・padding・gap
6. 子要素の幅・高さ・margin
7. テキストの文言・改行・行数
8. font-size / line-height / letter-spacing
9. 画像・アイコンの表示枠・crop・transform
10. hover / active / open など状態差分

## 実装ルール

- 変更は「1原因・必要最小限のプロパティ」に絞る。
- SP修正は原則 `max-width: 767px` または案件ルールのSP範囲に閉じる。
- PC幅に影響するベースCSSを変更する場合は、Figma PC値も取得してから判断する。
- 同一コンテンツをPC/SPで別HTMLに複製しない。既存方針とFigma構造上どうしても必要な場合は理由を記録する。
- letter-spacingはFigmaの実値から換算する。bodyの継承だけで済ませず、上書きしている箇所を確認する。
- line-heightは単位なしを基本とし、px固定を使う場合は理由を記録する。
- 画像は `figma-image-export.md` に従い、asset URL、実フォーマット、寸法、透過、表示倍率を確認する。

## 実装後の確認

実装後は最低限これを確認する。

- Sass / build が通ること。
- PHPテンプレートを触った場合は `php -l` が通ること。
- 対象幅でブラウザ表示し、DOMのbounding boxとFigma値を比較すること。
- 主要パーツ単位で文言、改行、行数、サイズ、位置、余白、画像表示が一致していること。
- 生成CSSで意図しない上書きが起きていないこと。
- 変更範囲外のPC/SPに影響が出ていないこと。

## 報告ルール

完了報告では次を明記する。

- 使用したFigma fileKey / nodeId
- 取得した主要Figma値
- 変更したファイル
- どの差分を解消したか
- 未確認の項目
- 実行した検証コマンド

未確認項目がある場合は「未確認」と書く。「問題ない」「Figmaどおり」と断定しない。