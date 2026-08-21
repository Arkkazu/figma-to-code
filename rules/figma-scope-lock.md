---
type: rule
status: permanent
date: 2026-07-18
topic: Figma実装のスコープロック
tags: [Figma, scope, guardrail, verification]
---

# Figma実装のスコープロック

## 目的

対象コンポーネント・セクションの修正中に、依頼されていないルール、検証基盤、別コンポーネント、ドキュメントへ作業を広げない。再発防止の仕組み作りは、それ自体を明示された別タスクとして扱う。

## 必須契約

Figma実装・修正では、SCSS、PHP、JavaScript、画像、生成CSSを1行でも変更する前に、案件側 MyBrain/verify/scope-<id>.json を作成し、C:\AI\figma-to-code\templates\figma-scope-lock.json の形式で次を固定する。

- ownerが依頼した対象だけを表す task と ownerInstruction
- Gitリポジトリのroot
- 編集を許可する正確な相対ファイルパスの列挙

ワイルドカード、ディレクトリ指定、「関連ファイル一式」、後から必要になるかもしれない基盤ファイルは許可しない。生成CSSも変更するなら、生成前にその正確なパスを列挙する。

~~~powershell
node C:\AI\figma-to-code\tools\figma-scope-lock.mjs begin MyBrain/verify/scope-<id>.json MyBrain/verify/scope-<id>.state.json
node C:\AI\figma-to-code\tools\figma-scope-lock.mjs assert MyBrain/verify/scope-<id>.state.json assets/scss/components/_card.scss
node C:\AI\figma-to-code\tools\figma-scope-lock.mjs verify MyBrain/verify/scope-<id>.state.json
~~~

assert は各ファイルを書き換える直前、verify は checkpoint前とclose前に必ず実行する。

## 逸脱時の停止

verify が対象外パスを検知した時点でstateは blocked になる。

- その時点で編集、checkpoint、close、完了報告を停止する。
- 対象外変更を「ついでの改善」として続行しない。
- ツールはユーザーの変更を自動復旧しない。差分を隠さず、ownerへ対象外パスを報告する。
- 既に blocked のscopeをエージェント自身で拡張・再開してはならない。ownerの判断後、必要なら新しいscopeを開始する。

### blocked状態の対象別判定

`blocked`を報告・判断する前に、必ず次を分けて照合する。

1. ユーザーが直すよう指示した正確なファイルパス
2. active scopeの`allowedPaths`・Figma manifestの`changeTargets`に、その対象が含まれるか
3. scope violationとして検出された正確な対象外パス

`blocked`は当該scopeの編集・checkpoint・closeを停止する状態であり、依頼された修正対象がscope外であることを意味しない。対象ファイルを個別照合せずに「修正できない」「対象外変更が原因でこの修正も止まる」と報告することを禁止する。対象が許可済みで違反が別ファイルだけなら、対象は許可済み・scope全体は別ファイルで停止中である事実を分けてownerへ報告し、対象外ファイルの自動復旧・自動amend・上書きは行わない。

対象外ファイルを編集する必要が判明したが、まだ編集していない場合だけ、ownerの明示承認を記録した scope-amendment.json を用意して amend を実行できる。承認前に対象外ファイルを触ることは禁止する。

~~~powershell
node C:\AI\figma-to-code\tools\figma-scope-lock.mjs amend MyBrain/verify/scope-<id>.state.json MyBrain/verify/scope-<id>.amendment.json
~~~

## 作業単位の分離

「カードの余白を直す」「特定セクションをFigmaに合わせる」などの実装scopeでは、共通ルール、LOOP仕様、Figma検証ツール、ログ昇格機構の変更は対象外である。ownerがその改善を明示して別scopeを許可した場合だけ、別のscope manifestで扱う。

スコープロックはGit hook、commit、push、deployには結び付けない。Figma実装の編集反復でだけ実行する。

## 更新履歴

- 2026-07-18 / codex / owner指示によりD-012の実行契約として新設
