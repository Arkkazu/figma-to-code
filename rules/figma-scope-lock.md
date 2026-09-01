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
node C:/AI/figma-to-code/tools/figma-scope-lock.mjs begin MyBrain/verify/scope-<id>.json MyBrain/verify/scope-<id>.state.json
node C:/AI/figma-to-code/tools/figma-scope-lock.mjs assert MyBrain/verify/scope-<id>.state.json assets/scss/components/_card.scss
node C:/AI/figma-to-code/tools/figma-scope-lock.mjs verify MyBrain/verify/scope-<id>.state.json
~~~

assert は各ファイルを書き換える直前、verify は checkpoint前とclose前に必ず実行する。

## 判定範囲（2026-08-29 変更）

**verify は宣言パスと制御パスに交差する変更だけで判定する。** 宣言パスと1つも交差しない変更は
違反ではなく baseline の更新として取り込み、件数とパスを出力して history に残す。

旧実装は baseline にリポジトリ全体の dirty 集合を取り、宣言パス以外の変更をすべて違反にしていた。
そのため**別scopeが自分の宣言パスを正しく編集しただけで、無関係なscopeが停止した**
（実測: 案件の why-choose-us scope が blog-detail scope の編集5件で停止し、復帰不能になった）。
衝突判定は `scope-conflict-audit` のパス交差に委ねる方針と食い違っていた。
根拠は `rules/corrections.md` 2026-08-25 `concurrent-scope-blocked-by-repo-wide-baseline`。

判定を狭めたぶん、**宣言そのものの書き換え（scope manifest の改ざん）は verify で落とす**。
manifest は begin で一度だけ書かれ、amend でも書き換えない（amend が広げるのは state 側の
`allowedPaths`）。begin 時の hash と違えば `scope-manifest-tampered` として blocked にする。

「自分が宣言せずに編集した」場合の検出は、`assert`（編集前に非宣言パスを拒否する）と、
commit時の `close-receipt-audit --require-coverage` が担う。verify はその代替ではない。

## 逸脱時の停止

blocked になるのは次の2つである。

- `scope-manifest-tampered` … 宣言ファイル自体を begin 後に書き換えた
- `out-of-scope-path` … 2026-08-29 以前のstateに残る旧判定

いずれの場合も、

- その時点で編集、checkpoint、close、完了報告を停止する。
- 対象外変更を「ついでの改善」として続行しない。
- ツールはユーザーの変更を自動復旧しない。差分を隠さず、ownerへ対象外パスを報告する。
- 既に blocked のscopeをエージェント自身で拡張・再開してはならない。`begin` は既存stateを不変として、
  `amend` は blocked を修正不可として、どちらも拒否する。

## blocked からの復帰（2026-08-29 追加）

復帰は `rebaseline` だけである。ownerの明示承認を記録したファイルが要る。承認の `instruction` は
20文字以上で、なぜ解除してよいかを書く。`rebaseline` は現在の作業ツリーを新しい baseline として
取り直し、status を active へ戻す。解除した停止は history に残す。

~~~bash
node C:/AI/figma-to-code/tools/figma-scope-lock.mjs rebaseline MyBrain/verify/scope-<id>.state.json MyBrain/verify/scope-<id>.rebaseline.json
~~~

承認ファイルの形は次のとおり。

~~~json
{
  "version": 1,
  "scopeId": "<scope-id>",
  "ownerApproval": {
    "status": "approved",
    "approvedBy": "owner",
    "approvedAt": "<ISO8601>",
    "instruction": "<解除してよい理由。20文字以上>"
  }
}
~~~

`scope-manifest-tampered` の停止は `rebaseline` では解除できない。宣言ファイルを begin 時点の
内容へ戻すか、新しいscopeを起こす。宣言を広げるなら `amend` を使う。

### blocked状態の対象別判定

`blocked`を報告・判断する前に、必ず次を分けて照合する。

1. ユーザーが直すよう指示した正確なファイルパス
2. active scopeの`allowedPaths`・Figma manifestの`changeTargets`に、その対象が含まれるか
3. scope violationとして検出された正確な対象外パス

`blocked`は当該scopeの編集・checkpoint・closeを停止する状態であり、依頼された修正対象がscope外であることを意味しない。対象ファイルを個別照合せずに「修正できない」「対象外変更が原因でこの修正も止まる」と報告することを禁止する。対象が許可済みで違反が別ファイルだけなら、対象は許可済み・scope全体は別ファイルで停止中である事実を分けてownerへ報告し、対象外ファイルの自動復旧・自動amend・上書きは行わない。

対象外ファイルを編集する必要が判明したが、まだ編集していない場合だけ、ownerの明示承認を記録した scope-amendment.json を用意して amend を実行できる。承認前に対象外ファイルを触ることは禁止する。

~~~powershell
node C:/AI/figma-to-code/tools/figma-scope-lock.mjs amend MyBrain/verify/scope-<id>.state.json MyBrain/verify/scope-<id>.amendment.json
~~~

## 共有パスの排他所有はscopeに束ねる（2026-09-01 追加）

共有部品の排他所有台帳（案件側 `MyBrain/verify/shared-component-ownership.json`）の各行は、
**どのscopeの求めで割り当てたかを `grantedForScope` に持つ。** そのscopeが `closed` または
`aborted` になるか台帳から消えた時点で、所有は失効し、以後どの宣言も止めない。

`grantedForScope` を持たない行は恒久所有として従来どおり効くが、`scope-conflict-audit` が
件数を報告する。移行のための互換であって、恒久所有を増やしてよいという意味ではない。

**所有者が居ないパスは、停止事由にしない。** 並行scope同士の排他は受領証のclaim交差判定が
担っており、所有台帳はその上に重なる二枚目の関門にすぎない。未登録を停止事由にすると、
共有アセットを新規に作るたび台帳を手で更新するまでどのscopeも宣言できず、実装が終わった
あとの commit 直前で詰まる。

根拠は実測（2026-09-01）。所有がエージェント名へ常設で紐づき、close しても解放されないため、
所有者側に稼働中のscopeが0件でも別の担当は対象を宣言できず、close受領証を作れず、
pre-commit が commit を拒否した。**6日前に close した scope 由来の所有が、無関係な実装
19ファイルをせき止めていた。**同じ形は 2026-08-26 にも起きており（waiting のまま2日間
握られた共有enqueueを避けるため、テンプレート内 `wp_enqueue_style()` の回避実装が入った）、
そのときは台帳を手で解除しただけで機構を直していない。過去には、未登録による停止を避ける
ために**ディレクトリ全体を1担当へ与えるglob**が足され、それが次の停止の原因になった。

所有を理由に止めるときは、次を必ず出力する。「所有者が違う」とだけ言われた実装役は、
台帳のどの行をどう直せばよいか分からず、オーナーへの問い合わせに化ける。

- 該当した台帳の行（`pattern`）
- 所有者に `active` / `waiting` のscopeが台帳にあるか。無いなら「稼働していない所有が
  止めている」と明示する
- そのまま貼れる台帳差分（`pattern` / `owner` / `grantedForScope`）。解決は先頭一致なので、
  挿入位置が既存globより前であることも書く

契約の回帰試験は `templates/verify/scope-conflict-audit.e2e.mjs`（6件）。失効の読み飛ばし、
稼働中の所有による停止、休眠所有の明示と解除差分、未登録を止めないこと、交差する並行scopeが
止まること、不正な `grantedForScope` の拒否を固定する。

## 作業単位の分離

「カードの余白を直す」「特定セクションをFigmaに合わせる」などの実装scopeでは、共通ルール、LOOP仕様、Figma検証ツール、ログ昇格機構の変更は対象外である。ownerがその改善を明示して別scopeを許可した場合だけ、別のscope manifestで扱う。

スコープロックはGit hook、commit、push、deployには結び付けない。Figma実装の編集反復でだけ実行する。

## 更新履歴

- 2026-07-18 / codex / owner指示によりD-012の実行契約として新設
