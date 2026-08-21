# LOOP: {案件名}-figma-implementation

<!-- 基底: ..\..\loop-engineering\templates\LOOP.md -->
<!-- 使い方: 案件開始時に本ファイルを案件リポジトリへ LOOP.md としてコピーし、{中括弧} の項目だけを埋める。構造・固定文言は変更しない -->

## 導入チェックリスト

テンプレートは導入・有効化して初めて強制力を持つ。全項目を満たすまでループを起動しない。

- [ ] 本ファイルを案件リポジトリへ LOOP.md としてコピーし、{中括弧} を埋めた
- [ ] `C:\AI\figma-to-code\templates\verify\` から figma-gate.mjs / figma-page-coverage.mjs / correction-receipt.mjs / responsive-html-guard.mjs / cdp-browser.mjs / checkpoint-diff.mjs / checkpoint-capture.mjs / lint-units.mjs / verify-layout.mjs / loop-learn.mjs / loop-learning-policy.json / figma-gate-template.json / components-example.json / component-decisions-example.json / page-coverage-example.json / page-coverage-review-template.json / release-check-template.json / correction-receipt-template.json を案件側 MyBrain/verify/ へコピーした（`node C:/AI/MyBrain/bootstrap.mjs <案件ルート>` が同じ配置を自動で行う）
- [ ] package.json に figma:gate / figma:learn スクリプトを登録した。内容はそれぞれ node MyBrain/verify/figma-gate.mjs / node MyBrain/verify/loop-learn.mjs
- [ ] Figma照合はコーディング反復内で実行し、Git hookには登録していない
- [ ] npm i -D pixelmatch pngjs を実行した
- [ ] MyBrain/verify/checkpoints/ ディレクトリを作成した
- [ ] 案件側 MyBrain/rules/units.md が存在する。無ければ既存CSSから単位規約を特定して先に作る
- [ ] STATE.md を loop-engineering の templates から作成した

## メタ情報

- name: {案件名}-figma-implementation
- level: L1で開始する。L1試走はコードを編集せず、着手ゲート宣言・ページcoverage棚卸し・spec作成・差分レポートを行う。L1からL2への自動昇格ゲートがPASSした場合だけL2を開始する。FAILまたは未確認時は waiting-human とする
- owner: kazu
- agents:
  - 実装役: 開始時にkazuが指定する。着手ゲート宣言、spec作成、実装、checkpoint、最小修正を担当する。gate manifestのimplementationActorとimplementationContextIdに実際の担当とrunを記録する
  - 検証役: 開始時にkazuが指定する。独立検証とSTATE.md記録を担当する。実装物を編集せず、実装役との兼任を禁止する。reviewerActorとreviewerContextIdは実装役とactorまたはcontextの一方以上を異ならせる

## 起動条件

- 手動。kazuがPCページ全体とSPページ全体をそれぞれ指すFigma URLを指示する。どちらもnode-id必須であり、無い場合は開始しない
- 検証URLを指定する。URLが指すページ全体を既定対象とし、部分修正だけ範囲を明示する
- トップページは共有ヘッダー・フッターを対象に含める。下層ページは共有ヘッダー・フッターをcontextとして対象外にする

## L1からL2への自動昇格ゲート

L1ではコードを変更しない。検証役は実装役と独立に次を監査する。

- 導入チェックリストが全件完了している
- PC/SPのFigma URL、ページ全体メタデータ、対応関係、対象範囲、全セクション一覧、実装順が揃っている
- page coverageに全セクションが一度ずつ登録されている
- 最初の対象セクションのspec、DOM対応表、component decision manifest、差分レポートに未取得値、推測値、未対応項目、矛盾がない
- component decision manifestは全componentを一度ずつ含み、Figma COMPONENT / INSTANCEには検索証跡付きのreuse / extend / new判定がある。newには独立承認とレビュー証跡がある。component manifestの全componentにspacingOwnershipがあり、component rootが外側のセクション間余白をpaddingとして持たないことを記録している
- 独立レビュアーのpage coverage承認記録が現在のcoverageハッシュを指し、reviewer actor/contextがimplementation actor/contextと同一組合せではない
- 停止条件または重大指摘がない

全件PASS後、検証役は独立承認をSTATE.mdに記録する。実装役はその直後に `npm run figma:gate -- preflight {gate-manifest} --implementation-actor {actor} --implementation-context-id {context}` を**一度だけ**実行し、exit 0をL1→L2昇格の根拠とする。FAIL、未確認、または検証不能なら waiting-human として停止し、kazuへエスカレーションする。

## ページcoverage・セクション完了契約

実装前にPC/SPページ全体のFigmaメタデータを保存し、全セクションをpage coverageへ一度ずつ登録する。役割と進行状態は分離する。

- role: target または context
- targetのstate: next、current、verified
- context: 下層ページのshared-headerまたはshared-footerだけ。checkpoint対象のcomponentIdsを持たない
- トップページの共有ヘッダー・フッターはtargetとして登録する
- component manifestの各elementIdはtargetセクション一つにだけ属し、component.sectionIdとpage coverageのcomponentIdsを一致させる

実装役とは別の検証役が、PC/SPメタデータ、coverage、DOM対応表、component decision manifest、既存コード検索証跡、セクション順、component割当を棚卸しし、coverageハッシュに対するapproved記録を残す。manifestのimplementation actor/contextとreviewのreviewer actor/contextは、少なくとも一方を異ならせる。この承認がない、同一組合せである、またはcoverageハッシュと不一致なら、preflightもソース編集も開始してはならない。

preflightはmanifest、implementation identity、spec、DOM対応表、components、component decision manifest、Figma node/layer証跡、page coverage、承認レビューを凍結し、targetセクションをcoverage順にnextへ初期化する。L2では次を一セクションずつ反復する。

1. section-startでactive preflight stateと凍結入力を再照合してから、先頭nextをcurrentへ移す
2. currentセクションのcomponentIdsだけを実装し、checkpointする
3. section-closeでactive preflight stateと凍結入力を再照合し、currentセクションのcheckpoint証跡整合性を確認してからverifiedへ移す。最終closeが全componentを最終状態で再測定・再描画比較する
4. 次のnextセクションへ進む

section-closeは一セクションの完了であり、ページ完了ではない。最終closeは全targetがverifiedである場合だけ実行できるページ完了判定である。nextまたはcurrentが一件でも残る間、ページ全体を完了またはFigmaどおりと報告してはならない。

## 自己改善（Learn）

- モード: `safe-auto`。close後に `loop-learn.mjs` が学習イベントを1件保存する。
- 保存先: `MyBrain/verify/learning/`。event / report / proposalは証跡であり、削除・上書きをしない。
- 自動適用: 改善カタログで `effect: strengthen` かつ `scope: project-local` と宣言された安全制御だけをactive controlsへ追加する。次のpreflightは制御と検証器の互換性を確認する。
- 正本昇格: `pending-review` 提案は独立レビューとkazuの承認が必要。Figma正本ルール、Git hook、commit、push、deployを学習器が変更することは禁止する。
- 実行時点: Figma照合と同じコーディング反復のclose後だけ。Git hook、commit、push、deployでは実行しない。
## ゴール条件

- 条件: 対象範囲の全targetセクションが spec/11-done.md の完成判定を満たす
- 判定方法:
  1. 全target verified後に npm run figma:gate -- close MyBrain/verify/gate-{対象}.json がexit 0
  2. HTML確定時に `C:\AI\web-development\rules\w3c-validation.md` を適用し、アクセシビリティ機械検査がPASS
  3. セクション単位のスクリーンショット比較が spec/09-verification.md の閾値内
  4. STATE.md上にkazuの実装完了承認記録がある
  5. 公開を伴う場合は、owner承認済みのデプロイ後にrelease-check recordがpassedとなり、URL・デプロイ識別子・実行時刻・recordのパスとSHA-256がSTATE.mdへ記録されている。未記録なら公開完了と報告しない

## 停止条件

- イテレーション上限: 30
- 同一セクション3連続不合格: kazuへエスカレーション
- node-idの無いURL、specの未取得欄、実測不能: 停止
- 手動停止: kazuの指示

## 手順

1. STATE.mdを読み、前回までの状況と未解決FAILを把握する
2. L1でPC/SPページ全体のメタデータ、page coverage、component manifest、component decision manifest、DOM対応表、既存コード検索証跡、独立承認記録を作成する
3. 実装役は着手ゲートを宣言し、painted要素のFigma参照画像をSHA-256とともに登録する
4. 独立レビュー承認後、component rootの外側section間padding禁止を含むcomponent manifestを固定し、npm run figma:gate -- preflight {gate-manifest} --implementation-actor {actor} --implementation-context-id {context} を**一度だけ**実行する。成功時にL2を開始する
5. L2では npm run figma:gate -- section-start {gate-manifest} {sectionId} を実行する
6. 実装役はcurrentセクションのspecを作成し、未取得欄が残る間は停止する
7. 実装役はcurrentセクションを実装し、各componentに npm run figma:gate -- checkpoint {gate-manifest} {elementId} を実行する。painted componentのPC/SPは同一Chrome sessionのbatch撮影・条件待機・宣言済みmask差分で照合する。FAILならQ-10の順で原因診断→必要最小限の修正→**同一componentのcheckpoint再実行**をPASSまで繰り返す。PASSまで次component・section-close・完了報告へ進まない
8. currentセクションのcheckpoint全件PASS後、npm run figma:gate -- section-close {gate-manifest} {sectionId} を実行する
9. 次のtargetがあれば手順5へ戻る。全target verified後だけ、W3C/a11y検査と全セクション描画比較を一度実行し、最後に `close` を一度実行する。Sass build、単位lint、PHP lint、全spec再測定はcloseが唯一実行する
10. 検証役は独立に検証し、結果をSTATE.mdへ記録する。kazuの実装完了承認をもって実装完了とする
11. 公開を伴う場合、owner承認済みのデプロイ後にpendingのrelease record（ownerApproved、承認時刻、HTTPS公開URL、デプロイ識別子）を作成し、`npm run figma:gate -- release-check {gate-manifest} {release-record}` を一度だけ実行する。gateがpassed recordへ追記したURL・デプロイ識別子・時刻・recordパス・SHA-256をSTATE.mdへ記録するまで公開完了と報告しない。Figma再取得、ローカルcheckpoint、build/lint、closeは再実行しない

## ガードレール

- 触れるパス: {案件リポジトリのパス} 配下のみ
- 実行できる操作: ファイル読み書き、Sass・PHP lint、ビルド、CDPによる実測・スクリーンショット、Figma MCP・RESTの読み取り系
- ネットワーク: Figma APIと公式ドキュメントの参照のみ
- kazuの承認が必要な操作:
  - Figmaへの書き込み
  - 本番デプロイ、公開、git push
  - 完成判定とL2からL3への昇格
- 検証役は実装物を編集しない
- 案件固有の値は案件側 MyBrain/rules/ を参照する

## 更新履歴

- 2026-07-14: 初版作成。Figma実装の閉ループ雛形を導入
- 2026-07-14: checkpoint、preflight、closeの契約v2・v3を反映
- 2026-07-15: ページ全体を既定対象とし、トップページと下層ページのヘッダー・フッター取扱いを明確化
- 2026-07-15: L1からL2の独立検証による自動昇格ゲートを追加
- 2026-07-15: 契約v4。page coverageの独立承認、section-start、section-close、最終closeのページ完了分離を追加
- 2026-07-18: 契約v6。implementation/reviewer actor・contextの独立性照合、section-start/section-closeの凍結再照合、公開HTTPS release-check recordを追加
- 2026-07-18: close後の学習イベント、案件ローカル安全制御、正本ルール提案の自己改善フェーズを追加
- 2026-07-29: verify-layoutの測定項目拡張とcomponent rootの外側section間padding禁止をL2改善として反映
