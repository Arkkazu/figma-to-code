# 案件エントリ — 編集の前にゲートを通す

このファイルは `C:\AI\figma-to-code\templates\project-entry.md` の複製です。**直接編集せず**、正本を直してから `node C:/AI/figma-to-code/tools/project-entry-install.mjs <ディレクトリ>` で再生成します。規則本文はここに複製しません。

**最初のツール実行**で環境判定を実行します。cwdに依存しない絶対パスで呼びます。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs
```

出力JSONの `mode` で分岐します。`mode` を得られない場合（ツールが無い、起動できない）は `cloud-restricted` として扱います。

## `local` のとき — 読む順序

調査でも修正でも、**編集の前に**この順で読みます。下位が上位を置き換えません。

1. `C:\AI\vault\WORKFLOW.md` と、そこで指定される必読
2. `C:\AI\web-development\WORKFLOW.md` と `rules/`（Web実装の正本）
3. 案件側 `MyBrain/README.md`、`MyBrain/WORKFLOW.md`、`MyBrain/rules/`（`corrections.md` と単位規約を含む）
4. Figma由来の作業では `C:\AI\figma-to-code\WORKFLOW.md`

## すべてのWeb編集にcoding gateを通す

PHP、HTML、SCSS、CSS、JavaScript、テンプレート、画像、およびSassビルド生成物を**1行でも変更する前に**、`C:\AI\web-development\rules\implementation-gate.md` に従ってscope manifestを作り、preflightをPASSさせます。Figma由来かどうかに関係なく必須です。

```bash
npm run coding:gate -- preflight MyBrain/verify/coding-<scope-id>.json
npm run coding:gate -- close     MyBrain/verify/coding-<scope-id>.json
```

`changeTargets` に宣言していないファイルを編集しません。`close` がPASSするまで「完了」「修正しました」「問題なし」と報告しません。

## デザイン根拠がFigmaならFigma gateも通す

**Figma URLが会話に出ているかどうかで判定しません。**「Figmaデザインを実装して」「Figmaどおりにコーディングして」「このFigmaを再現して」「デザインどおりに直して」「デザインと違う」、およびFigmaで設計された画面・コンポーネントの新規実装、見た目・レイアウト・余白・色・文字の修正は、すべてこれに当たります。

```bash
npm run figma:gate -- start
```

`C:\AI\figma-to-code\WORKFLOW.md`「着手前ゲート」の5点を報告するまで**ソースを1行も編集しません**。`start` はゲートではなく編集を許可しないため、実行して失うものはありません。

**Figma由来か判断できない依頼は、Figma側へ倒します。** coding manifestの `scope.designBasis` には `figma` か `non-figma` を必ず書きます。`non-figma` はオーナー承認の記録がある場合だけです。`scope.kinds` の自己申告でFigma照合を外せません。

## 完了の条件

`coding:gate close`、Figma由来なら `figma:gate close`、`npm run report:check`、対象のローカルcommitがすべて揃うまで完了ではありません。未closeのscope、`planned` のまま残るcheck、未commitの変更が1つでもあれば、「完了」「デザインどおり」「検証完了」と書きません。未検証の項目は ⚠️ を付けて区別して報告します。

## `cloud-restricted` のとき

このセッションには上位層が存在せず、案件側 `MyBrain/` も非公開部分は届きません。読める規則は案件クローンに含まれる `MyBrain/cloud/README.md`、`WORKFLOW.md`、`STATE.md`、`rules/` だけです。これらを読み、そこで許可された範囲に限定して作業します。ローカル実測、Figma照合、デプロイを要する作業はローカルセッションへ差し戻します。`MyBrain/cloud/` が無い案件では、従うべき規則を読めないため着手しません。
