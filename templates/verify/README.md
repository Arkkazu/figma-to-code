---
type: template
status: permanent
date: 2026-07-09
topic: Figma実装検証キットの案件導入手順
tags: [Figma, verify, CDP, lint, template, Codex, Claude]
---

# templates/verify — Figma実装検証キット（案件非依存）

`C:\AI\figma-to-code\rules\figma-spec-pipeline.md` のフェーズ2（単位規約lint）とフェーズ3（CDP実ブラウザ実測照合）を、**どの案件・どの実行エージェント（Claude / Codex）でも同じ手順で実行する**ためのテンプレート。
「デザインどおりか」の合否は目視ではなく、このキットの終了コードで判定する。

## 導入（案件ごとに1回）


## 正本が web-development にある同梱ファイル

次の4ファイルは、このディレクトリにあるが**正本ではない**。正本は `C:\AI\web-development\verify\` にある。

| ファイル | 役割 |
|---|---|
| `scope-conflict-audit.mjs` | gate受領証・担当台帳・共有所有権の衝突検査 |
| `scope-coordination.mjs` | scope予約台帳の読み書きとpreflight lock |
| `responsive-html-guard.mjs` | PC/SPの同一本文重複検査 |
| `lint-units.mjs` | SCSS単位規約lint |

**ここで独自に編集しない。**直すときは web-development の正本を直し、こちらへ同期する。

同梱している理由は、`figma-gate.e2e.mjs` がこのうち2件をフィクスチャへコピーして使うためである。
絶対パスで web-development を参照すると、上位層を持たないクラウドセッションで
「このリポジトリ内で完結するE2E」が回らなくなる（`WORKFLOW.md`「クラウドセッションでの実行範囲」）。

同梱は乖離する。実際、2026-08-25 に `scope-conflict-audit.mjs` が正本より **116行古い**状態で
見つかった（同梱397行 / 正本471行）。案件側は正本と一致していたので、腐っていたのはここだけだった。
誰も2箇所を突き合わせていなかったため、静かに残り続けていた。

そのため一致を機械検査する。正本を読める環境でだけ照合し、読めない環境（クラウド）は
`skipped` として通す。検査できないことを「一致している」と報告しないよう、`mode` を必ず出力する。

```bash
node C:/AI/figma-to-code/tools/vendored-verifier-audit.mjs
```

    exit 0  一致、または照合不能（mode: skipped）
    exit 2  同梱コピーが正本と乖離、または片側が欠落

正本の場所は `WEB_DEVELOPMENT_VERIFY_DIR` で差し替えられる。

<!-- executable-figma-gate -->
## figma-gate.mjs — コーディング反復中の強制ゲート

`figma-gate.mjs`、`figma-gate-template.json`、`loop-learn.mjs`、`loop-learning-policy.json`、および同ディレクトリの `cdp-browser.mjs` / `checkpoint-capture.mjs` / `checkpoint-diff.mjs` / `verify-layout.mjs` / `gate-browser-batch.mjs` を案件側 `MyBrain/verify/` にコピーする。実装を始める前にpreflightを行い、コンポーネントごとのcheckpointとsection-closeを経て、当該scopeのcloseを行う。

マニフェストには少なくとも、実装actor/context、対象Figma PC/SP node、取得した可視/非表示レイヤー、採用アセットのFigma MCP export URLとSHA-256、spec、DOM対応表、機械可読なnode map（`scope.nodeMapPath`）、component decision manifestを記録する。
**Q-13 / Q-08の同一session接続（contract v3）。** `scope.accessibilityPath` と `scope.motionPath` に案件側の `accessibility-<scope>.json` / `motion-<scope>.json` を明示する。preflightは両設定と `accessibility.axe.sourcePath` の存在・SHA-256を凍結し、各batchの復帰後にも再照合する。checkpoint、close、release-checkは `gate-browser-batch.mjs` がQ-09のPC/SPレイアウト実測・撮影、Q-13（axe・コントラスト・キーボード）、Q-08（hover/open/中間値）を**一つのChrome/CDP session**で実行する。release-checkはcomponentごとの公開URL再測定に加え、全specを一つのfull-page batchで再測定し、単体`verify-layout.mjs`を別Chromeで後付け起動しない。未承認axe違反、未承認コントラスト未達、キーボード失敗、状態期待値不一致はSPEC FAILとして停止する。コントラスト人間判定リストは証跡へ保存するだけで機械FAILには混ぜない。単体の `accessibility-verify.mjs` / `motion-verify.mjs` は設定作成時の隔離実行に使えるが、gate内で別Chromeを起動して後付けする経路はない。DOM対応表（Markdown）はハッシュ固定のみで内容を検査できないため、同じ内容を `nodemap-example.json` の書式で機械可読にし、`preflight` の `assertNodeMapCoverage` がFigma子ノード単位のカバレッジを検査する。`mapped` ノードがspecで測定されていない、未対応ノードに `reason` がない、specセレクタがnode mapに追跡できない、PC/SPどちらかの登録が無い場合はpreflightを通らない。component manifestの各componentにはspacingOwnershipを必ず持たせ、rootPaddingはnoneまたはinternal、interSectionSpacingはparent-layoutまたはnot-applicableにする。コンポーネントrootに外側のセクション間余白をpaddingとして持たせる宣言はpreflightで拒否する。page coverage reviewとnew判定のreviewer actor/contextは、実装actor/contextと同一組合せを禁止する。変更前後の手入力スクリーンショット・矩形はgateの合否に使わないため要求しない。

**`start` は着手時点の入口。** 引数を取らず、`WORKFLOW.md`「着手前ゲート」の5点、フェーズ0の固定チェックリスト、停止・未確認として報告する条件、次に実行するコマンドを出力する。内容は `FIGMA_TO_CODE_ROOT` の正本Markdownから抽出するため、gate側に工程表の複製を持たない。正本側で該当節が改名・欠落した場合は、工程を出さないまま通さず SPEC FAIL とする。**`start` はゲートではなく、編集の許可を与えない。** `preflight` は適用規則に加えて停止条件も出力し、受領証の `stopConditions` に残す。

**着手宣言は受領証にする。** `scope.startDeclarationPath` に `MyBrain/verify/start-<scope-id>.json` を宣言する（書式は `start-declaration-template.json`）。`preflight` は `scopeId` = manifest `id`、`figma.fileKey` と `figma.nodeIds.pc` / `.sp` = `manifest.figma.viewportNodes`、`specPath` = `manifest.scope.specPath` を突き合わせ、`scopeLockStatePath` の実在、`outOfScopePaths` と `changeTargets` の非重複、`ownerInstruction` 20文字以上、`environmentPreflight.mode: "local"`、`declaredAt` のISO 8601形式を検査する。宣言のSHA-256は他の凍結入力と同じく固定し、preflight後の書き換えは後続phaseで落ちる。先行scopeの宣言を複製すると `scopeId` 不一致で落ちる。既存manifestはこの項目を持たないため旧契約となり、`gate-contract-audit.mjs` が欠落を一覧する。

**`preflight` はGitリポジトリのルートで実行する。** 変更対象がすでに編集済み（dirty）ならその場で SPEC FAIL となる。「編集してから通す」経路を塞ぐための判定で、gitが使えない環境では実行できない。ビルド生成物は `scope.generatedTargets`（`changeTargets` の部分集合）へ宣言し、中断作業の再開など編集済みで開始する場合だけ `scope.preEditApproval = { instruction, paths[] }` にオーナー承認を記録する。specには `viewportPolicy.scrollbars`（`hidden` / `visible`）が必須で、実測と撮影の両方で同じ値を使う。

**画像差分の閾値。** painted componentは `visualThreshold` を必ず持つ。ビューポートごとに変えたい場合は `visualThresholds: { pc, sp }` を併記し、宣言したviewportは `viewports` に含める。既定の厳格値 **1%** を超える閾値がひとつでもあると、`visualThresholdBasis`（40文字以上、実測した下限とその取得方法）が無い限り `preflight` が失敗する。上限は5%。日本語の高密度テキストが占める区画はFigma書き出しとブラウザのラスタライズ差だけで下限が上がるため、PCとSPを同じ値にすると片方が素通しになる。下限はサブピクセル位相に依存し**レイアウトの正しさと単調に対応しない**ので、単発の測定値ではなく観測した位相の最大値を採る。比率は良否の判定ではなく「specの測定項目に無い誤り」の検出に使う。

**完了済みscopeの成果は承認なしで引き継げる。** `close` は変更対象の最終ハッシュを close-report の `fileHashes` に残す。後続scopeの `preflight` は、dirty な変更対象の内容がいずれかの**合格した** close-report の `fileHashes` と一致する場合、それを「完了済みscopeの検証済み成果」と判定して承認なしで通す（どのscope由来かを標準出力と evidence の `carriedOverFromClosedScopes` に記録する）。1バイトでも違えば一致しないので従来どおり落ちる。

これが無いと、未コミットのまま次のscopeへ進むという通常運用のたびに `preEditApproval`（オーナー承認の抜け穴）を使うことになり、抜け穴の常用でゲートが形骸化する。承認は「引き継ぎで説明できない dirty」にだけ使う。

境界：この判定は close-report を信頼する。close-report を手で書けば迂回できるが、それは `completed` ロールなど既存の証跡と同じ前提であり、想定する相手は「近道をするエージェント」であって改竄者ではない。

**HTML/PHPを変更したscopeはW3C証跡が必須。** `w3c-check.mjs <url> <out> <htmlSource...>` が対象URLのHTMLを取得して W3C Nu Validator へ送り、証跡JSONを書く。ローカルURLは外部から到達できないためHTMLをPOSTする。証跡には**検証時点のテンプレートのSHA-256**を併記し、`close` が現在の内容と突き合わせる。これが無いと古い合格証跡を使い回せる。

`close` は `manifest.scope.w3cEvidencePath` を読み、URL一致・ソースハッシュ一致・`errorCount === 0` を確認して `close-report.w3cValidation` と gate state へ記録する。**Errorが残っていれば close は失敗する。**実行できない事情がある場合だけ `manifest.scope.w3cSkip = { reason }`（20文字以上）を宣言でき、合格にはならず `status: "not-recorded"` として証跡に残る（完了報告の未確認リストへ転記する）。`w3cEvidencePath` と `w3cSkip` の同時宣言は拒否する。

> 規則には以前から「HTML/PHPを変更したらW3Cを実行する」と書いてあったが、検査が無く、postflight が未実施を検出しても close は素通りしていた。実測でError 74件が残ったまま合格していた。**検出する仕組みと止める仕組みが別々だと、合格証跡には現れないので問題なしと読まれる。**

**close-report は契約バージョンを持つ。** `close` は `contractVersion` を close-report へ書く。`completed` ロールはこの値が現行以上であることを要求し、`contractVersion` を持たない close-report は0（バージョン導入前の契約）と判定する。これが無いと、`completed` の3条件（実在・target列挙・FAIL 0）は旧契約の close-report でも満たせてしまい、台帳を迂回して「検証済み」を名乗れる。契約に必須検査を足したら `FIGMA_GATE_CONTRACT_VERSION`（`figma-page-coverage.mjs`）を上げる。上げると既存の close は自動的に旧契約になり、監査が「manifestの項目は揃っているが close が古い」状態として検出する。

**待機上限。** CDPプロトコル往復の上限（20秒）と、ページ遷移・描画完了の待機上限（既定60秒）は別枠。後者は `FIGMA_VERIFY_NAV_TIMEOUT_MS` で上書きできる。待機上限は撮影条件ではないため、延ばしても合否基準は変わらない。

**node mapの `figmaNodeType`。** `mapped` エントリに任意で `figmaNodeType`（`TEXT` / `FRAME` / `INSTANCE` / `COMPONENT` / `GROUP` / `VECTOR` / `RECTANGLE` / `IMAGE` / `OTHER`）を持たせられる。**`TEXT` を宣言した対応先は、spec で `text` を検証しないと `preflight` が失敗する。**幾何値だけをspecに書いて文言を書かない実装が、数値は全一致なのにラベルと注記が33箇所ずれたまま合格した事例への対処。規則に「文言をspec対象に含める」と書いてあっても、落ちる仕組みが無ければ実装者が誰であれ守られない。

**退避しても検証義務は消さない。** 参照デザインが現行でない manifest は移行できないので `_retired/` へ退避するが、そのページを現行デザインで検証する義務は残る。台帳の `pendingPageVerification` に「ページ / 退避した旧manifest / 現行のverifyUrl」を記録し、監査の出力に必ず載せる。**退避を「片付いた」と読ませないための仕組み**で、これが無いと backlog が消えたように見える。案件ディレクトリは `.gitignore` されていることがあるため、退避は削除ではなくファイル移動で行い内容を保全する。

**参照デザインが現行かどうかは、契約の新旧とは別に見る。** `MyBrain/verify/figma-project.json` に `currentFileKey` を置くと、`gate-contract-audit.mjs` が各 gate manifest の `figma.fileKey` と照合し、別ファイルを根拠にしているものを一覧する。**契約を満たしていても、参照したデザインファイルが現行でなければその証跡は現行デザインに対する根拠にならない。**旧ファイルは同じ node ID を持つことがあり、寸法や可視性だけが違うため取り違えても気づきにくい。実測ではある案件で27件中13件が別ファイル基準だった。

**旧契約の scope を黙って残さない。** 契約を強化するたび、既存の manifest は自動的に「旧契約」になる。旧契約の scope は `preflight` で落ちるが、落ちること自体を誰も見ていないため、**過去の完了報告が現在の基準を満たしていない事実が黙って残る**。`gate-contract-audit.mjs` が案件の `gate-*.json` を走査し、現行契約に欠ける項目（`nodeMapPath` / `componentDecisionPath` / `pageCoveragePath` / `accessibilityPath` / `motionPath` / `viewportPolicy.scrollbars` / 要素ごとの `provenance`）を一覧する。未移行は `MyBrain/verify/legacy-scopes.json` の `acknowledged`（`manifest`・`reason` 20文字以上・`plannedMigration`）で明示宣言する。宣言のない旧契約 manifest はもちろん、**移行済みなのに残っている宣言も失敗**にする（双方向）。これは免除ではなく台帳であり、移行が済んだ行は削除する。

```bash
npm run figma:audit   # または node MyBrain/verify/gate-contract-audit.mjs
```

**page coverageの `sections[].role`。** `target` / `context` / `deferred` / `completed` の4種。`completed` は先行scopeで検証済みの区画で、`figmaNodeIds.pc` / `.sp`、`completedByScope`、`closeReportPath` を必須とする。参照先のclose-reportが実在し、当該sectionを `coverage.targetSectionIds` に含み、`result` のSPEC/LAYOUT/VISUALがすべて0であることまで検査するため、宣言だけでは通らない。`completed` は当該scopeの `targetSectionCount` には含めず `completedSectionIds` として報告する。

```bash
# Before any PHP/SCSS/CSS/image edit
npm run figma:gate -- preflight MyBrain/verify/gate-<target>.json --implementation-actor <actor> --implementation-context-id <context>

# After the current implementation scope is complete
npm run figma:gate -- close MyBrain/verify/gate-<target>.json

# Optional: inspect the latest close event without changing source code
npm run figma:learn -- from-gate MyBrain/verify/gate-<target>.json .figma-gate/learning-input.json MyBrain/verify/loop-learning-policy.json MyBrain/verify/learning

# Once the owner-approved public deployment is available
npm run figma:gate -- release-check MyBrain/verify/gate-<target>.json MyBrain/verify/release-<target>.json
```

`preflight` が失敗したらそのscopeを編集しない。implementation identityはshared manifestへ書かず、preflightの2 flagでのみ渡してactive stateへ固定する。`checkpoint`、`section-start`、`section-close`、`close`、`release-check`へ同flagを渡すことは拒否され、以後はactive stateのidentityだけを使用する。`section-start` と `section-close` はactive preflight stateと凍結入力が変わっていない場合だけ進める。`checkpoint` がFAILならQ-10の原因診断→最小修正→同一componentの再実行をPASSまで続ける。`close` は最終状態で全componentの数値再測定とpainted差分を再計算し、実装完了の根拠とする。`MyBrain/verify/checkpoints/<manifestId>/close-report.json` に SPEC / LAYOUT / VISUAL の件数別集約結果を保存し、いずれかが0以外ならcloseはPASSしない。component decision manifestは全componentを一度ずつ含め、Figma COMPONENT / INSTANCEの`new`は検索証跡・独立承認・異なるactorまたはcontextのレビュー証跡が無ければpreflightを通らない。公開を伴う場合、owner承認済みのHTTPS公開URLとデプロイ識別子を持つpending release recordに対し、`release-check`がPC/SP実測とpainted再diffを行い、passed recordをSTATE.mdへ記録するまで公開完了扱いにしない。**Git hookには登録しない。commit / push / deploy時にFigma照合を再実行しない。**

テンプレート保守時は、ブラウザ不要の隔離試験を実行する。

```bash
node templates/verify/figma-gate.e2e.mjs
node templates/verify/verify-layout.e2e.mjs
node templates/verify/loop-learn.e2e.mjs
node templates/verify/gate-contract-audit.e2e.mjs
node templates/verify/gate-browser-batch.e2e.mjs  # Chromeを使用
```

1. `cdp-browser.mjs`、`checkpoint-capture.mjs`、`checkpoint-diff.mjs`、`gate-browser-batch.mjs`、`gate-contract-audit.mjs`、`lint-units.mjs`、`verify-layout.mjs`、`loop-learn.mjs`、`loop-learning-policy.json`、`accessibility-verify.mjs`、`accessibility-verify-template.json`、`motion-verify.mjs`、`motion-verify-template.json`、`figma-feature-coverage.mjs`、`figma-feature-coverage-template.json` を案件リポジトリの `MyBrain/verify/` へ同じ版でコピーする。**あわせて `figma-page-coverage.mjs`、`correction-receipt.mjs`、`responsive-html-guard.mjs`、`scope-coordination.mjs` も必ずコピーする**（`figma-gate.mjs` が `./` 相対で import しており、欠けると `ERR_MODULE_NOT_FOUND` で起動しない）。`scope-conflict-audit.mjs` は import ではなく別プロセスとして起動されるが、これが無いと preflight が必ず落ちるため同様に必須で、案件側に `MyBrain/verify/scope-coordination.json` と `MyBrain/verify/shared-component-ownership.json` の2つの台帳を用意する必要がある（受領証は scope ごとに `<stateDir>/active/<manifestId>.json` へ分かれており、この2つの台帳と `scope-conflict-audit.mjs` が、宣言パスの交差するscope同士の上書きを止める。詳細は `C:\AI\web-development\verify\README.md`）。`figma-visible-asset-audit.mjs` は `manifest.scope.visibleAssetAuditPath` を宣言した案件でだけ必要。`components-example.json`、`component-decisions-example.json`、`page-coverage-example.json`、`release-check-template.json`、`correction-receipt-template.json`、`start-declaration-template.json` は各manifest・公開照合record・受領証跡・着手宣言の書式見本としてコピーして記入する。`spec-example.json` は書式見本（コピー不要、参照のみ）。配布物の一覧は `C:\AI\MyBrain\manifest.json` を機械可読な正本とし、`node C:/AI/MyBrain/bootstrap.mjs --check` が import の取りこぼしを検査する。`figma-dom-mapping-template.md` はフェーズ0の全件対応表・未対応/余計要素リストの書式（対象ごとに案件側 `MyBrain/verify/` へコピーして記入する）。
2. 案件側 `MyBrain/rules/units.md`（単位規約）が無ければ、既存CSSの `html { font-size }` とビルド済みCSSから規約を特定し、**先に units.md を作ってから**実装に入る。
3. 要件：Node 22+（WebSocket内蔵）、Google Chrome。Chromeが標準パスに無い場合は環境変数 `CHROME_PATH` で指定する。Figmaから採用するアセットが無いscopeでは、manifestの `assets` は空配列または省略でよい。

## checkpoint-capture.mjs / checkpoint-diff.mjs — 描画差分（フェーズ3A）

`figma-gate checkpoint` は `gate-browser-batch.mjs` を一つ起動する。ジョブ内のPC/SPレイアウト実測・painted要素の撮影と、Q-13/Q-08は同一のChromeプロセス・CDP sessionで実行し、`document.readyState`、Web Font、ページ内画像、対象selectorの可視矩形を条件待機してから進む。固定秒数待機、手入力スクリーンショット、viewportごとのChrome起動、Q-13/Q-08だけを別Chromeで後付けすることは認めない。

- gateが `*-capture-jobs.json`、`*-browser-batch.json`、`*-browser-batch-summary.json`、Q-13/Q-08 reportを生成する。layout・capture・Q-13・Q-08の全証跡のsession ID / PIDが一致しなければcheckpointはFAILとなる。release-checkは公開URLの全specを同じ形式のfull-page batchで追加再測定し、その証跡をrelease recordへ残す。
- `figmaImages.<viewport>.mask` は必要な場合だけ宣言する。maskはFigma根拠を持つalpha PNGで、alphaが0より大きいpixelだけを比較から除外する。maskのpath / SHA-256 / `mode: "exclude"` はpreflightで凍結し、空mask・全面mask・ハッシュ不一致・未宣言maskはFAILとする。
- `checkpoint-diff.mjs` は比較pixel数・除外pixel数・差分率を出力する。maskを差分の隠蔽に使わず、除外理由をDOM対応表・specへ残す。
## lint-units.mjs — SCSS単位規約チェック（フェーズ2）

```bash
node MyBrain/verify/lint-units.mjs <対象scss...>
```

- 検査内容：E1 line-heightの単位付き指定 / E2 letter-spacingのpx・rem / E3 レイアウト系プロパティのpx直書き / E4 @media内のBEM要素再宣言 / W1 理由コメント無しのmargin-bottom・margin-right
- E1・E2・E4・W1は案件横断ルール（corrections.md / scss.md）。E3は「Figma px→rem」規約を既定とした検査のため、単位規約が異なる案件では**案件側コピーを units.md に合わせて調整し、調整内容を案件側 corrections.md に記録する**。
- **終了コード0（エラー0）になるまでビルド・完了報告に進まない。** 例外行には同じ行に理由コメントを付ける（コメント付き行は許容される）。

## verify-layout.mjs — CDP実測照合（フェーズ3）

```bash
node MyBrain/verify/verify-layout.mjs MyBrain/verify/spec-<対象>.json [URL上書き]
```

- specの `url` には**その部品が実際に使われるページ**のURLを書く。コンポーネント見本ページで代用しない。
- viewportは案件の基準幅で最低PC/SPの2つ。基準幅以外で測ると 1rem ≠ 1px になり、Figma値と直接比較できない（換算が必要）。
- 公開・デプロイ後は、公開URLを第2引数に渡して同じspecを再実行し、**デザインと公開ページの一致**を確認する。ローカル一致だけで公開完了と報告しない。
- 開閉UI（メニュー・モーダル・アコーディオン）は open/closed 両状態を確認する。specで測れない状態はCDPで状態を強制してから測り、結果を報告に含める。
- **終了コード0（全PASS）が完了条件。** FAILがある間は「完了」「Figmaどおり」と報告しない。

## accessibility-verify.mjs — Q-13の機械検証

```bash
node MyBrain/verify/accessibility-verify.mjs MyBrain/verify/accessibility-<scope>.json
```

`accessibility-verify-template.json`を案件側でコピーして記入する。`axe.sourcePath`には案件が依存関係として固定した`axe-core/axe.min.js`の相対パスを指定する（例: `node_modules/axe-core/axe.min.js`）。実行時に外部CDNを取得せず、そのローカルsourceをCDPで注入して、固定の`wcag2a` / `wcag2aa` / `wcag21a` / `wcag21aa`タグを実行する。`rules` / `disableRules` / `exclude` / `runOptions`でルールを外す指定は拒否する。

axeの違反は0件が合格である。やむを得ない例外はルールを無効化せず、実行後の違反ノードへ`ruleId`と`target`を完全一致させる。例外ごとにspecのパス、20文字以上の判断記録、`ownerApproval.status: "approved"`、承認者、参照を必須にする。未承認・対象不一致の違反はFAILのまま残る。

`contrast.targets`には、単色背景へ解決できる全テキスト・UI要素を列挙する。通常テキストは4.5:1以上、大テキスト（24px以上または18.66px以上かつ太字）は3:1以上、UIは3:1以上でPASSとする。背景画像・グラデーション・blend mode・下が単色に解決できない半透明背景・重なった`img` / `video` / `canvas`は自動合否に混ぜず、出力JSONの`humanReview`（コントラスト人間判定リスト）へ理由付きで出す。UIで`backgroundScope: "behind"`を指定する場合も、対象自身の`opacity`は前景へ合成し、対象自身の`background-image` / `mix-blend-mode`は人間レビューへ送る。`behind`はborder等の背景色として対象自身の`background-color`を使わない指定であり、効果判定の除外ではない。機械検証は色を変更しない。Figma実値が未達なら、specのnoteとowner判断を先に記録する。

`keyboard.stateFlows`には`aria-expanded`を持つ開閉UIを全件、`keyboard.dialogs`には`role="dialog" aria-modal="true"`のモーダルを全件列挙する。閉・開の両状態でTab到達性、DOM順、フォーカス可視を走査する。モーダルはさらにフォーカストラップ、Escでの閉鎖、起動要素へのフォーカス復帰をFAIL条件として検査する。設定に載らない`aria-expanded`またはモーダルもFAILにする。

## motion-verify.mjs — Q-08の状態・中間値検証

```bash
node MyBrain/verify/motion-verify.mjs MyBrain/verify/motion-<scope>.json
```

`motion-verify-template.json`をコピーし、Figmaまたは承認済み既定値から、閉・hover・開・遷移中間の期待値を状態ごとに記録する。各状態は新しいCDPページで開始するため、前の状態が残ってPASSする経路はない。`action`（`click` / `hover` / `key`）後のcomputed styleと属性を照合する。終了状態は必要に応じて`settleMs`で遷移完了を待つ。中間状態は`transitionSelector`で指定した要素のページ内`transitionstart`または`animationstart`を起点に、`sampleAtMs`（例: 80）時点の数値範囲を検査する。`maxSampleLagMs`は案件・実行環境の初回測定で根拠を記録してから設定する必須値であり、推測の既定値は置かない。実測lagがこの上限を超えた場合、またはCSS開始時刻がアクション時刻より前の場合は、期待値が一致してもFAILとなる。報告の`timing`にはアクション時刻、遷移開始、採取、実経過、要求値との差を残す。期待値または対象selectorが1件でも不一致ならFAILとなる。

プロトタイプ遷移を仕様化した**click**状態だけは、`destination`を追加できる。`location`（正規化した`pathname` / `search` / `hash`）または`visible.selector`（遷移先の描画可視）の**一方だけ**を必須にし、案件で実測した`timeoutMs`を記録する。`location`で未記載のcomponentは比較せず、明示した`"search": ""`または`"hash": ""`は空componentとの厳密比較を意味する。hover・key・中間状態、またはopen/closeだけのclickには`destination`を付けない。到達前から期待URL・期待selectorが成立している場合、未遷移、余計なquery/hash、誤hash、不可視はFAILである。reportは遷移前後URL、待機開始・到達時刻、実待機時間、可視判定を残す。

テンプレート保守時は、実ブラウザを使う隔離E2Eを実行する。

```bash
node templates/verify/accessibility-verify.e2e.mjs
node templates/verify/motion-verify.e2e.mjs
node templates/verify/figma-feature-coverage.e2e.mjs
```
## asset-verify.mjs — Q-05の任意アセット連結検証

```bash
node MyBrain/verify/asset-verify.mjs MyBrain/verify/assets-<scope>.json
```

`asset-verify-template.json`は、Figma exportを採用するscopeだけでコピーして記入する。これは`figma-gate`へ接続しない独立検証器であり、asset無しscopeを含む全案件への必須配布物ではない。各recordはFigma元書き出し、案件設定に登録した変換出力、実ブラウザが参照するURLを、実MIME・SHA-256・intrinsic寸法・alpha分類・CSS表示寸法で一意に結ぶ。reportには実ページ取得応答のraw `Content-Type`と正規化media typeを残し、正常取得したmedia typeが実バイトから観測した変換出力MIMEと一致しなければFAILにする。変換方式、品質、出力パスの共通既定は持たない。

`kind: "raster"`は実デコードした寸法と`opaque` / `binary` / `partial` alphaを照合する。元書き出しが`partial`なら、変換出力の`binary`または`opaque`化をFAILにする。`kind: "svg"`は実SVG MIME、`viewBox`寸法、変換出力と実ページ参照を別契約で照合する。未生成、未参照、実MIME・寸法・hashの不一致は個別にFAILとなる。

テンプレート保守時は、実ブラウザを使う隔離E2Eを実行する。

```bash
node templates/verify/asset-verify.e2e.mjs
```
## figma-feature-coverage.mjs — P-5の予防的機能カバレッジ監査

```bash
node MyBrain/verify/figma-feature-coverage.mjs audit MyBrain/verify/figma-feature-coverage-<scope>.json MyBrain/verify/feature-coverage/<scope>.json
```

`figma-feature-coverage-template.json`をコピーし、対象Figma機能を**取得・spec化・変換・検証**の4段で登録する。各`covered`には、現在の取得証跡・spec・実装・検証器の実在ファイルと、その中に存在する20文字以上の根拠文字列を記録する。監査器はファイルのSHA-256と行番号を出力するため、古い根拠やパスだけの自己申告は根拠不足として扱う。SHA-256は監査時点の根拠を同定する記録であり、前回レポートとの差分を自動FAILにする制御ではない。根拠文字列が残ったまま意味を失う変更は独立レビューで評価する。

`uncovered`（未対応）、`unverifiable`（検証不能）、または根拠文字列の消失は、`pending-independent-review`の改善提案とMermaidグラフとして出力する。提案に必要な変更は自動適用しない。各提案は負のE2E、独立批評、owner承認を経て初めて正本・実行器へ昇格できる。`--strict`は提案が1件でも残ると終了コード1にする監査用モードであり、`figma-gate`には接続しない。

この正本自身のカタログは`figma-feature-coverage-catalog.json`であり、案件固有のFigma URL・node-id・実測値は含めない。初回実装の忠実度を示すものではないため、改善の効果は別途`fidelity-benchmark.mjs`の案件実測で判断する。

テンプレート保守時は次を実行する。

```bash
node templates/verify/figma-feature-coverage.e2e.mjs
```
## spec-*.json の書式

`spec-example.json` を見本にする。

- 数値項目（left / topInSection / width / height）：許容誤差 `tolerance`（既定±1.5px）。`[min, max]` の範囲指定も可。
- 文字列項目（fontSize / lineHeight / letterSpacing / color / backgroundColor / borderRadius / padding* / margin* / gap / rowGap / columnGap / animationName）：computed styleとの**完全一致**。ブラウザの返す形式（`rgb(…)` / px値）で書く。`text` / `innerText` は改行を含めて比較する（CRLFとNBSPだけ正規化）。
- `lineCount`：Rangeの描画矩形から実際の行数を数える。Figmaの期待行数・明示改行と一致しない場合はFAIL。`page.maxScrollWidth`：横はみ出し検出。viewport幅を超えたらFAIL。
- 各要素の `note` にFigma node idを残し、specだけで「どの値がどのノード由来か」追えるようにする。
- **可変テキスト要素の高さ（2026-08-06追加）**：`text` / `innerText` / `textPattern` / `lineCount` のいずれかを持つ要素が `height` を単一の数値で宣言し、その値が `lineHeight × lineCount`（許容誤差 `tolerance`）で説明できない場合、`preflight` は **SPEC FAIL** とする。Figmaの矩形高さはpaddingを含むため、その数値をCSSの `height` へ直写した実装は、Figmaのダミー文言のままなら実測が一致してPASSし、CMS文言・翻訳・改行で文字量が変わった時点で崩れる。ゲートは実測高さしか見ないので、specの段階で塞ぐ。
  - 正しい書き方は `"height": [min, max]` の範囲指定で、実装側は `padding` / `min-height` / `line-height` / `gap` で高さを作る。一般原則の正本は `C:\AI\web-development\rules\css-values.md` の「可変テキスト要素の高さ」。
  - アイコンボタン・正方形サムネイル・ロゴ枠など中身の量が変わらない要素、および `-webkit-line-clamp` や `overflow: hidden` で高さを意図的に固定する設計は、`note` に `fixed-height-reason: <根拠>` を書けば単一値を宣言できる。目印だけで根拠が空文字なら通らない。**記録先が `note` に限られるのは仕様**である。`fixedHeightReason` のような独自キーを足すと、`assertSpecProvenance` が provenance の無い測定値とみなして別のSPEC FAILになる。
  - `[min, max]` でも **幅が `tolerance` 以下のレンジ（例 `[64, 64]`）は単一値と同じに扱う**。レンジ形式にするだけで検査を外せる抜け道を作らないため。
  - `lineHeight` を宣言しない、`normal` にする、単位なしで書く、`lineCount` を書かない場合は行ボックスとの一致を機械判定できないため、範囲指定か `fixed-height-reason` が必要になる。これは意図した厳しさである（`lineHeight` は computed style と完全一致で書く規約なので、通常はブラウザが返す px 形式になる）。
  - 既存案件のspecがこの契約を満たしているかは `node MyBrain/verify/gate-contract-audit.mjs` が `可変テキスト要素の固定height xN` として一覧する。preflightで落ちるのを待たず、移行前に件数を把握できる。

## loop-learn.mjs — close後の自己改善

`figma-gate close` は正常終了後に `loop-learn.mjs from-gate` を1回だけ起動する。学習器は `MyBrain/verify/learning/` にイベント・レポート・提案を保存し、カタログに明示された案件ローカルの強化制御だけを `active-controls.json` へ追加する。正本のルール、Git hook、commit、push、deploy、外部設定は変更しない。

HTML/PHP変更にW3Cの記録が無いなど、実行器や正本ルールの変更を要する問題は `proposals/` に `pending-review` として出力する。提案の昇格には独立レビューとオーナー承認が必要である。

## fidelity-benchmark.mjs — ワンショット忠実度ベンチマーク

P-3の研究用実行器・E2E・契約文書は 
esearch/p3/ に置く。案件へ配布する検証キットには含めない。

このプロジェクトの成果は「Figmaデザインどおりのコードを初回実装で出せること」であり、正本・テンプレート・実行器の改善が実際に効いたかは推測ではなく計測で判定する。`figma-gate checkpoint` は各試行の結果を `.figma-gate/active.json` の `benchmark.attempts` に追記する。1件は `{ elementId, viewports, painted, attempt, finalRecheck, outcome, failureClass, message, at }` で、`outcome` は `PASS` / `FAIL`、`failureClass` はFAIL時に `SPEC` / `LAYOUT` / `VISUAL` / `OTHER` のいずれかである。記録はcheckpointの合否に影響しない（記録できない場合は黙って諦める）。

### P-3 v13の契約・実行順

比較contractのschemaは version 13 である。baseline/currentは別clean worktreeの同じrepository-relative contract pathに置き、sharedは完全に同一に保つ。currentで変えるのはconditionとcondition固有のrun証跡であり、baselineは evaluatedChange.id を baseline、currentはowner承認済みの改善IDとapprovalRecordにする。workspaceId、implementation/review context、clean-room evidence、provider receiptもconditionごとに分ける。

`shared.cleanRoomAuthorization`は、pairId、baseline/currentの2条件、各conditionのevidence path、workspaceId、absolute worktree root、implementation/review actor・contextId、相手workspaceId、owner管理の隔離方式、相手成果物5種の非参照を固定する共通planである。A/Bのworkspace/worktreeは異なり、4 contextIdはすべて異なり、相手workspaceIdは相互参照でなければならない。Decision J v2はこのplanを完全に承認する。Jはcondition evidenceのbyte SHA-256を持たず、condition別evidence v2がJのpath/file SHA-256とplanのstable JSON SHA-256を一方向に参照し、各contractが自condition evidenceのbyte SHA-256を凍結する。この向きによりDecision JとevidenceのSHA循環を作らない。

shared.pageProviderは kind、outputRoot、entryPath の3キーだけを持つ hermetic-static-v1 である。shared gate manifestはimplementation identityを一切持たず、pair-preflightだけがcondition固有のrun.implementationを`--implementation-actor`／`--implementation-context-id`として渡す。figma-gate active state version 5はそのidentityを固定し、checkpoint／section-start／section-close／close／release-checkはstateだけを読み、identity flagとidentity欠落のversion 4およびそれ以前のlegacy stateを拒否する。shared.environment.nodeExecArgv は必ず空配列であり、NODE_OPTIONS、NODE_PATH、preserve-symlink系のambient環境変数も無いbare Nodeで起動する。shared.environment.chromeは`CDP Browser.getVersion`、`[product, revision, userAgent]`、`within-final-batches-and-across-pair`の閉じたpolicyだけを持つ。Chrome実値はfinal batchからcondition-local run.chromeFingerprintとして導出され、condition内一貫性とA/B一致をruntimeが検査する。run.closeの現行schemaは pathだけである。SHA-256はcontractへ手書きせず、pair-closeが照合するactive stateとclose reportから得る。run.pageProviderReceiptPathはpair-closeが新規作成するcondition固有のrepository-relative receipt pathであり、pair-close前に存在していてはならない。`run.cleanRoom`は`evidence`（path/sha256）だけを持つ。隔離方式・相手workspace・非参照項目をrunへ重複記載しない。

static providerが適格になるのは、outputRootが実在する非ignoredのsource-side directoryであり、MyBrain、.figma-gate、node_modules、symlink、special file、既起動dev server、ignored/generated build outputを使わない場合だけである。outputRoot配下のstatic bundle全pathは凍結changeTargetsと集合として完全一致し、余分なresourceも欠落も認めない。entryPathはHTMLのregular fileで、entry自身もchangeTargetsの一つでなければならない。**entry HTMLはbundle内のfaviconを`<link rel="icon" href="...">`で明示宣言し、そのfaviconファイルも新規のchangeTargetに含める。** 未宣言ならChromeがorigin直下の`/favicon.ico`を要求し、provider/traceがbundle外の404で停止し得る。providerは起動時snapshotとclose後の再照合の両方でbundle bytesの不変性を検査する。

**P-3のQ-08対象境界。** `destination.location` はURLを変えるclick遷移を測る契約であるため、凍結`verifyUrl`とDocument URLの完全一致を要求するP-3 scopeには含められない。P-3で許容できるのは、URLを変えず描画可視だけを照合する`destination.visible`である。判断JでFigma targetとscopeを選ぶ前に、この条件を満たすか除外する。

pair-begin前にbaseline worktreeで`npm ci`を完了し、直後に`p3-evaluator-plan`を実測して第三者node_modulesのpolicy適合を検査する。`p3-evaluator-plan`はread-onlyであり、ここでFAILした場合はpair-beginへ進まないためpair予約を消費しない。実行前recordの順序は、(1) shared.cleanRoomAuthorizationを含むshared input、(2) owner承認済みevaluator baseline record、(3) owner承認済みpreImplementationProof、(4)それらから生成したowner承認済みDecision J v2、(5)Jへ一方向に束縛されたowner承認済みbaseline/current clean-room evidence v2、(6)currentだけの既存意味論によるowner承認済みevaluatedChange.approvalRecordである。path参照を持つ各JSONは`p3-json-hash`のfileSha256で凍結する。draft、`ownerApproved: false`、`status: "approved"`以外のJ/evidenceは`pair-readiness`、`pair-begin`、`pair-preflight`、`pair-close`、`report`、`compare`のruntime入力として拒否される。clean-room evidenceはpairId＋condition固有の別ファイルとして保存し、別pair・別conditionで共有または上書きしない。P3-CONTRACT-RECORDS.mdのrecord書式に従う。

ここでいうruntimeは`pair-readiness`、`pair-begin`、`pair-preflight`、`pair-close`、`report`、`compare`である。`p3-evaluator-plan`、`p3-decision-input-plan`、`p3-json-hash`はrecord作成のread-only補助であり、draft雛形を出力してよいが、draftをruntimeへ渡してはならない。evaluator baseline、preImplementationProof、current/B improvement approvalの既存のowner承認要件はv13でも緩和しない。

実行順は次のとおりである。pair-abortは比較完了後の手順ではなく、active pairを終端する代替経路である。

~~~bash
# record作成と第三者node_modules policy検査（pair-begin前。p3-evaluator-planがFAILした場合はpair予約を消費しない）
npm ci
node MyBrain/verify/fidelity-benchmark.mjs p3-evaluator-plan MyBrain/verify/fidelity-comparison-baseline.json
node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash MyBrain/verify/p3-evaluator-baseline-<id>.json
node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash MyBrain/verify/p3-pre-implementation-<id>.json
node MyBrain/verify/fidelity-benchmark.mjs p3-decision-input-plan MyBrain/verify/fidelity-comparison-baseline.json
node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash MyBrain/verify/p3-owner-decision-J-<id>.json

# baseline worktreeだけで開始する
node MyBrain/verify/fidelity-benchmark.mjs pair-readiness MyBrain/verify/fidelity-comparison-baseline.json pre-begin
node MyBrain/verify/fidelity-benchmark.mjs pair-begin MyBrain/verify/fidelity-comparison-baseline.json

# 各worktreeでソース編集前に実行する
node MyBrain/verify/fidelity-benchmark.mjs pair-preflight MyBrain/verify/fidelity-comparison-<baseline-or-current>.json MyBrain/verify/gate-<target>.json

# 各worktreeでcheckpoint後、最終static bundleを用意してread-onlyで事前検査する
node MyBrain/verify/fidelity-benchmark.mjs pair-readiness MyBrain/verify/fidelity-comparison-<baseline-or-current>.json pre-close

# pre-close readinessはread-only補助。pair-closeもprovider起動前に最終Git変更集合を再検査してから、P-3管理providerで最終closeを実行する
node MyBrain/verify/fidelity-benchmark.mjs pair-close MyBrain/verify/fidelity-comparison-<baseline-or-current>.json MyBrain/verify/gate-<target>.json
node MyBrain/verify/fidelity-benchmark.mjs report MyBrain/verify/benchmark/<baseline-or-current>.json MyBrain/verify/fidelity-comparison-<baseline-or-current>.json

# 両conditionのreport後、baseline contractを第3引数にする
node MyBrain/verify/fidelity-benchmark.mjs compare <baseline.json> <current.json> MyBrain/verify/fidelity-comparison-baseline.json

# 比較前に人が中止する場合だけ。理由は20文字以上。
node MyBrain/verify/fidelity-benchmark.mjs pair-abort MyBrain/verify/fidelity-comparison-<baseline-or-current>.json "<reason>"
~~~

baseline/currentはsharedのgate manifestが持つ同一`verifyUrl`（同一provider port）を共有する。`p3-page-provider.mjs`はexclusiveであり、実装中のcheckpoint用serverも同じportを使うため、P-3のA/B実行は並行に行えない。baseline/currentは上記のlifecycleに従って順次実行する。

`pair-readiness`はread-onlyであり、ledger、pair lock、`.figma-gate/active.json`を作成・更新しない。`pre-begin`はowner承認済みDecision J v2、baseline clean-room evidence v2、ignored runtime artifact、未実装source、provider構造、編集前worktreeのclean状態を検査する。`pre-close`はactiveなpair-preflightを読取照合し、owner承認recordのJ/plan/evidence束縛、最終Git変更集合、static bundle全path、entry hashを検査する。draft、`ownerApproved: false`、`status`不一致はどちらのstageでも拒否されるが、readiness失敗はpair予約・gate起動・ledger終端を作らない。**baseline clean-room evidenceが未承認なら、`pair-begin`はreservation作成後に失敗してpairを`aborted`で終端し、pairIdとcontract pathを消費する。消費を避けるには、必ず先にread-onlyの`pair-readiness <baseline-contract> pre-begin`を実行する。** どちらも`figma-gate close`、provider receipt、最終CDP測定の代替ではない。`pair-close`はpre-closeの出力を信頼せず、provider起動と`figma-gate close`の直前に同じ最終Git変更集合を必ず再検査する。不一致ならpreflight stateをcloseせずprovider receiptも作らず、pairをabortedで終端する。readiness後に手動で`figma-gate close`を実行せず、`pair-close`だけで最終closeを実行する。

分母は `preflight` が凍結する対象集合である。`preflight` は `benchmark.plan` に checkpoint plan の全 elementId を書き、集計はこれを分母に使う。実装途中で `report` を取っても未着手componentが分母から落ちないため、初回PASS率が過大に出ない。

`report` が出す指標は次のとおり。

- `firstTryPassRate` — 初回checkpointでPASSしたcomponentの割合（分母は `plan`）。これが主要指標である。
- `plannedComponents` / `attemptedComponents` / `notAttemptedComponents` — 対象集合と、実測に到達した件数。`notAttemptedComponents` が0でない間は途中経過である。
- `meanAttemptsPerComponent` / `maxAttemptsForOneComponent` — PASSまでに要した同一checkpointの再実行回数（＝手動修正ラウンド数）。
- `firstAttemptFailureClasses` — 初回FAILの分類別件数。SPECが多いなら取得・spec化の欠落（Q-03/Q-05系）、LAYOUTが多いなら構造・単位（Q-06/Q-07系）、VISUALが多いなら塗り・書体・画像（Q-04系）に原因がある。
- `allFailureClasses` — 全試行の分類別件数。修正の空振り回数が見える。

集計対象は初回実装のcheckpointだけであり、`finalRecheck`（`close` 時の全件再測定）と `release-check` は除外する。componentが0件のとき率は `null` を出す（`0/0` を 0% と誤読させないため）。

計測されないもの: checkpointが測定に入る前に落ちる場合（manifest検証、spec provenance、凍結入力の不一致、順序違反）は試行として記録しない。spec側の欠落は `preflight` が同じ `validateManifest` を通すためscope開始前に止まり、凍結入力の不一致と順序違反は忠実度ではなく手順違反である。したがって、記録される試行は「凍結された入力に対して実測まで到達した回数」を意味する。

`integrity` は数値を信用してよいかの自己申告である。`planRecorded`（対象集合が凍結されているか）、`rejectedAttempts`（書式違反で集計から外した試行）、`unplannedComponents`（対象集合に無いcomponentの試行）、`attemptCountMismatches`（別経路の `learningMetrics.directViewportRuns` と試行数が合わない component）を出し、いずれかが埋まっていれば `report` は警告を表示する。**`tamperEvident: false`** を明記しているとおり、`.figma-gate/active.json` は実装役が書き換えられるため、この数値は改ざん耐性を持たない。したがってベンチマークは自己証明ではなく、オーナーが `close-report.json`・release-check・実際の見た目という外部で検証できる成果と併せて読むための指標である。`integrity` に1件でも載っている数値を改善の根拠に使わない。

**hermetic証跡の境界。** `p3-page-provider.mjs`が保証するのは`pair-close`で行う最終測定のstatic bundle、Document、CDP証跡である。`firstTryPassRate`を含む`benchmark.attempts`は実装中のcheckpoint記録であり、記録そのものはhermetic providerの対象ではない。この初回試行の回数・成否は`tamperEvident: false`の範囲に残る。checkpoint自体をhermetic化する機能は現行P-3 v13に含めず、必要なら別scope・owner承認・独立批評で扱う。

このスクリプトは合否を判定しない。閾値による判定と「指標が良化しても外部で検証できる成果が悪化していないか」の点検はオーナーが行う。

**P-3の比較契約v13（判断Jの改訂起草、独立批評・owner承認前）。** A/Bは同一Figma root nodeに対し、同じ未実装source Git commit/treeと`git archive`実バイトSHA-256を照合した別clean worktreeで実装する。契約はworktreeの作成手段そのものを証明しない。pair-begin/preflight/close/report/compareは1つの置換不能なlifecycleとして実行し、checkpointの検証試行数は初回PASS指標の一部として別途記録する。

`p3-page-provider.mjs` はP-3比較契約だけの付属実行器であり、P-3のowner採用・独立批評前は `C:\AI\MyBrain\manifest.json` のrequired配布物に登録しない。P-3パイロットをownerが採用した案件では、`p3-page-provider.mjs`、[P3-CONTRACT-RECORDS.md](../../research/p3/P3-CONTRACT-RECORDS.md)を同じ版で案件側 `MyBrain/verify/` へ併せてコピーする。

pair-begin前のowner recordは[P3-CONTRACT-RECORDS.md](../../research/p3/P3-CONTRACT-RECORDS.md)に従う。`p3-evaluator-plan`は12本のroot、依存閉包、execution bundleとbaseline record雛形を出力し、`p3-decision-input-plan`は承認済みpre-implementation proof、baseline record、shared.cleanRoomAuthorizationからDecision J v2雛形を出力する。J v2は全A/B隔離planを承認するがevidenceのbyte SHA-256を参照しない。次にcondition別evidence v2がJ file SHA-256とplan SHA-256へ参照を張り、contractが各evidenceのfileSha256を凍結する。`p3-json-hash`の`fileSha256`をrecord参照の`sha256`へ入れる。baseline/currentを同じcontract pathに置くため、templateの`_currentVariant`どおりcurrentではcondition、receipt path、evaluatedChange.id、approvalRecord、cleanRoom.evidenceだけを置換する。

preImplementationProof v2はowner承認済みでなければならず、凍結component manifestとcomponent decision manifestから導出した`unimplementedComponents`（elementId / selector / figmaNodeId / codePath）および`unimplementedTargetPaths`と完全一致させる。`unimplementedTargetPaths`は凍結`changeTargets`と完全一致し、source Git treeと各`pair-preflight`直前worktreeのどちらにも存在してはならない。さらにGit管理対象・未追跡・無視された実ソースをselector文字列ごとに検索し、対象componentを既に描画していれば拒否する。検索対象から除外するのは`MyBrain/`、`.figma-gate/`、`node_modules/`だけであり、比較証跡は`MyBrain/`配下に置く。`frozen/`、`out/`、`comparison/`などの任意ディレクトリは実ソースとして検索する。無視された実行時成果物がsource側に残る場合も開始を拒否する。これは開始条件を機械的に固定するものであり、会話等の非参照をコードだけで暗号学的に証明するものではない。

A/Bは別workspace、implementation context、review contextを持つ。shared.cleanRoomAuthorizationとDecision J v2がA/Bのworktree、4 context、相手workspace、owner管理の隔離方式、source・diff・checkpoint・会話・結果の全5種を相手へ渡さない境界を固定する。condition別clean-room evidence v2は`status: "approved"`、`ownerApproved: true`、承認時刻、Jのrepository-relative path/file SHA-256、plan stable JSON SHA-256、当該conditionAuthorizationの完全複写を記録する。evidence pathはpairId＋condition固有（p3-clean-room-<pairId>-baseline.json / p3-clean-room-<pairId>-current.json）とし、別pair・別conditionとの共有・上書きを禁止する。これはownerが設定するアクセス境界の承認済み受領証跡である。会話などの非参照そのものをコードだけで暗号学的に証明するものではない。

pair-beginは、pair別のDecision J v2・baseline clean-room evidence v2・preImplementationProof・凍結source・scope・評価器を検証してから、common Git directoryのmutex下でimmutableな単一pair reservationを作る。Decision J v2はbaseline/current両方の隔離planを承認するが、baseline worktreeからcurrent evidenceやsourceを読まない。current側は、そのconditionのclean-room evidence v2と既存意味論のevaluatedChange.approvalRecordを`figma-gate preflight`起動前に検証する。不足・draft・不一致ならactive stateを作らずpairを`aborted`で終端する。reservationはpairIdとcontract pathを一対一に結び、A/Bは**同じrepository-relative contract path**を別worktreeに置く。pairIdまたはcontract pathのいずれも再利用できない。v12以前の固定reservationは占有済みとして保持し、v13 lifecycleへ継続・置換しない。開始後にその契約JSONが壊れても`pair-preflight`・`report`・`compare`はJSON解析前にfailure ledgerをarmし、started pairを`aborted`で終端する。ledger I/Oそのものが失敗した場合は予約を残してfail-closedとし、自動再利用・自動掃除を行わない。baseline record v2はowner承認済みの案件用実体であり、12本すべてのcanonical evaluator root（Q-09/Q-13/Q-08の9本、`lint-units.mjs`、`loop-learn.mjs`、`loop-learning-policy.json`）のpath/SHA-256とexecution bundle SHA-256を持つ。Decision Jも`evaluatorRootsSha256`、baseline recordのSHA-256、`evaluatorExecutionBundleSha256`、比較入力bundle、cleanRoomAuthorization stable JSON SHA-256を束縛する。各worktreeで編集前に実行するpair-preflightも同じbundle照合を**figma-gate preflight起動前**に行う。preflight stateはcrypto random UUIDの`preflightId`、entry path/SHA-256を記録し、reportはpair-preflight ledgerの識別子と一致しなければ停止する。

fidelity-comparison-template.jsonは、Figma metadata・design context・screenshot・node map（assets/masksなしは空配列を明記）、source archiveとGit commit/tree、preImplementationProof、spec・page coverage・threshold、gateのmanifest/components/mapping/node/layer/アクセシビリティ/motion/axe source全hash、判断Jのowner承認recordを固定する。計画・対象・target sectionはmutableなactive stateでなく凍結manifest/components/page coverageから再導出し、active state・close-report・実ファイルと完全一致しなければ拒否する。close-reportは全checkpoint PASS、SPEC/LAYOUT/VISUAL 0、最終file hash一致を必須とする。

評価器execution bundleは12本のcanonical root、`figma-gate.mjs`内の`MyBrain/verify/*.mjs|json` literal runtime artifact、ESMのstatic import/export・literal dynamic import、CJSのliteral `require` / `module.require` / `require.resolve`を再帰した相対依存閉包、bare importの実解決entryとpackage.json、repository rootのpackage-lock.jsonを個別hashで凍結する。literal dynamic importは静的解析対象であり、literal specifier・解決path・SHA-256を閉包へ含めるため許可する。non-TCB依存では、literalでないdynamic import/require、解析器が検出できる動的loader API、既知のrequire/module alias・間接構文を拒否する。

この静的解析は、識別子束縛、alias/destructuring、constructor/prototype、process等を経由する任意の実行時loader逃避を完全に証明またはsandboxするものではない。P-3の実行器閉包は、静的に列挙された依存、lockfile、解決済みpackageをpath/SHA-256で固定する契約に限る。閉包外コードが実行時に読まれないこと、OS/toolchainまたは任意実行を隔離することは保証しない。P-3本体だけはroot SHA、baseline record、判断Jで束縛する小さいresolver TCBである。P-3起動は`nodeExecArgv: []`のbare Nodeに限り、`NODE_OPTIONS`、`NODE_PATH`、symlink解決用のambient環境変数を拒否する。literal runtime artifactがcanonical集合に無ければpair-beginを拒否する。baseline recordは配布元との自動同一性を主張せず、ownerが承認した案件用path/SHA-256実体を示す。sharedのChrome入力は閉じたpolicyだけであり、実値はP-3開始前には採らない。final Q-09/Q-13/Q-08 batchからcondition-local fingerprintを導出し、condition内の全batch一致とA/B比較時の一致を検査する。Chrome自動更新はpilot期間中に停止し、各conditionの最初のcheckpointでfingerprintを記録し、B側最初のcheckpointでA側と早期照合する。不一致なら両conditionを停止し、同一Chromeで再開できる状態へ戻す。準備時のsummaryは比較証跡ではなく、P-3 reportは比較専用に別Chromeを起動した証跡を使わない。公開時はowner承認済みpassed release-check record、HTTPS URL、deployment ID、凍結input一致をA/B双方で検査する。公開しない実験だけはnot-applicableの理由付き記録を使える。`npm`/Sass実行体・PATH/npm config・PHP実行体/php.ini/extensionsはこのbundleの同一性対象外であり、P-3はOS/toolchain再現性まで証明しない。

P-3の最終測定は、既起動のdev server・外部URL・任意のdynamic serverを使わない。`pair-close`はproviderを起動する**前**に、最終Git変更集合が凍結`changeTargets`と完全一致することを再検査する。不一致ならfigma-gate closeを起動せず、close reportとprovider receiptを作らずpairをabortedで終端する。通過時だけA/B各worktreeの`shared.pageProvider`で指定した**最終static source bundle**を開始時にbytes単位でsnapshot化し、P-3親管理の`http://127.0.0.1:<port>/...` providerから一時配信してから既存`figma-gate close`を実行する。close中またはclose後にbundleが変われば停止する。outputRootはpair-close前に存在する非ignoredのsource側ディレクトリであり、`MyBrain/`、`.figma-gate/`、`node_modules/`、symlink、special fileを含められない。static bundleの全pathはoutputRootと結合した時点で凍結`changeTargets`と完全一致し、余分なresource、未収録target、ignored/generated build outputを残せない。entryはHTMLに限定し、entry自身もchangeTargetsの一つである。providerはHTML bytesを改変せず、ランダムmarker・raw entry SHA-256・static bundle Merkle rootを**HTTP response header**へ付与する。P-3専用CSPはWorker、service worker、iframe、popup、外部接続を停止する。P-3 batchでは同一CDP page targetのNetwork証跡をQ-09 layout/capture、Q-13、Q-08の4 phaseごとに保存し、cacheとservice workerを無効化する。capture jobが0件でもP-3だけはprovider document probeを行い、4 phaseすべてに凍結`verifyUrl`と完全一致するDocument responseを必須にする。全Document/resourceの実URL・response headerをprovider marker・entry hash・bundle rootへ照合する。外部origin、別Document、WebSocket、cache/service worker応答、header欠落を停止する。final Q-09/Q-13/Q-08 batch summaryはcheckpoint elementId・preflightId・URL・response headerのmarker・entry hash・bundle root・phase別Network証跡をreceiptへ残す。同一summaryの使い回し、別URL、別provider、外部resource、close後のbundle変更はreportを拒否する。静的source bundleとして配布できない案件は、この汎用P-3比較の対象外であり、専用provider adapterを別scope・owner承認・独立批評で追加するまで比較を開始しない。

**P-3パイロットのリポジトリ境界。** 現行v13は、全`changeTargets`がsource snapshotに存在しない新規ファイルであり、その全てが単一のstatic source `outputRoot`配下に収まり、static bundle path集合と`changeTargets`が完全一致する専用の清浄なリポジトリを前提とする。`MyBrain/`、`.figma-gate/`、`node_modules/`以外のignored artifactを持つリポジトリは、このままでは開始できない。通常のWordPress構成、`dist/`を無視するビルド構成、`vendor/`・`.env`・`*.log`等のignored artifactを置く構成を、そのままP-3パイロットへ流用しない。対象にするには、この条件を満たす専用リポジトリを用意するか、別scope・owner承認・独立批評でadapter契約を追加する。

**macOSのpath境界。** P-3はWindowsとDarwinを大文字小文字非区別として扱い、`mybrain/`等のcase variantでsource/provider境界・固定contract key・除外pathを迂回できないようにする。case-sensitive APFSではcaseが異なる正当なpathも安全側で拒否し得るため、その構成をP-3パイロットに使わない。

compareはcomparison contract欠落、未着手または最終PASSしていないcomponent、integrity異常、dirty preflight、pair ID・shared hash・evaluation bundle hash・checkpoint plan・Git worktree・workspace・implementation/review context・Decision J v2/clean-room authorization/condition evidence・provider receipt・release適用有無・台帳report hash・condition-local Chrome fingerprintの不一致で比較を拒否する。比較に成功したときだけ台帳へcompletedを追記する。集計report本体のschema versionはv6のままで、comparison節のschema versionがv13である。1組のA/Bはパイロットであり、tamperEvident: falseのreportと1組の数値だけで改善が将来の初回実装確率を高めたとは主張しない。将来の効果主張は、測定前にownerが定める比較対象・評価条件・追加ペアの扱いと、close-report・必要時のrelease-check・実ページ目視を併記して判断する。
