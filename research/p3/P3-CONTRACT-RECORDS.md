# P-3 contract record templates

`fidelity-comparison-template.json` のplaceholderを実測値で埋めた後、ownerが承認する記録の雛形です。`path`参照へ入れるSHA-256はJSONファイルの**byte SHA-256**です。保存後に次で取得します。

```bash
node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash MyBrain/verify/<record>.json
```

`stableJsonSha256` はJSONのキー順を正規化した補助値であり、`path.sha256`へは`fileSha256`を入れます。

## 0. v13の事前条件・record作成順

comparison contractは version 13 です。v12およびそれ以前のcontract、pair lock、active stateは移行なしに拒否します。baseline/currentは別clean worktreeの同じrepository-relative contract pathに置き、sharedを完全に同一にします。condition固有のrunだけを変えます。baselineは evaluatedChange.id を baseline にし、currentはowner承認済みの改善IDとapprovalRecordを持ちます。currentは別workspaceId、implementation/review context、clean-room evidence、pageProviderReceiptPathも持ちます。clean-room evidenceの参照pathはpairId＋condition固有にし、p3-clean-room-<pairId>-baseline.json と p3-clean-room-<pairId>-current.json のように別名で保存します。別pair・別conditionとの共有または上書きはできません。

shared.pageProviderは kind、outputRoot、entryPath だけを含む hermetic-static-v1 です。entryTargetPathやtargetPathsは実行器が導出する値なのでcontractへ書きません。shared gate manifestはimplementation identityを一切持たず、pair-preflightだけがcondition固有のrun.implementationを`--implementation-actor`／`--implementation-context-id`として渡します。figma-gate active state version 5はそのidentityとordered `responsiveHtml.sourceFiles`／`deferredSourceFiles`を固定し、checkpoint／section-start／section-close／close／release-checkはstateだけを読み、identity flag、identity欠落、version 4およびそれ以前のlegacy stateを拒否します。`scope.responsiveHtml`は`sourceFiles`、`deferredSourceFiles`、`exceptions`だけを持つ。deferredSourceFilesの各pathはsourceFilesとchangeTargetsの両方に含まれpreflight時に未存在でなければならず、preflightはnon-deferred sourceだけ、checkpoint以降は全sourceにsingle-DOM guardを実行します。shared.environment.nodeExecArgvは空配列に固定し、NODE_OPTIONS、NODE_PATH、NODE_PRESERVE_SYMLINKS、NODE_PRESERVE_SYMLINKS_MAINを持たないbare Nodeで実行します。shared.environment.chromeは`CDP Browser.getVersion`、`[product, revision, userAgent]`、`within-final-batches-and-across-pair`の閉じたpolicyだけを持ち、実値はfinal batchからcondition-local run.chromeFingerprintとして導出します。

shared.cleanRoomAuthorizationは、ownerがDecision J v2で採用する前の共通隔離planです。pairIdとbaseline/currentのちょうど2 conditionを持ち、A/BのworkspaceId・absolute worktreeRoot・implementation/review actor+contextId・相手workspaceId・evidencePath・隔離方式・相手成果物5種の非参照を固定します。A/Bのworkspace/worktree/evidencePathはそれぞれ異なり、4 contextIdはすべて異なり、otherWorkspaceIdは相互参照、非参照はfalseと5件固定リストでなければなりません。baseline worktreeはこのplanからcurrent側sourceやevidenceを読まないため、plan内のcurrent evidencePathは構文とJ承認対象としてのみ扱います。

```json
{
  "version": 1,
  "pairId": "REPLACE-owner-approved-pair-id",
  "conditions": [
    {
      "condition": "baseline",
      "evidencePath": "MyBrain/verify/p3-clean-room-REPLACE-pair-id-baseline.json",
      "workspaceId": "REPLACE-baseline-workspace-id",
      "worktreeRoot": "REPLACE-absolute-baseline-worktree-root",
      "implementation": { "actor": "REPLACE-baseline-implementation-actor", "contextId": "REPLACE-baseline-implementation-context-id" },
      "review": { "actor": "REPLACE-baseline-review-actor", "contextId": "REPLACE-baseline-review-context-id" },
      "otherWorkspaceId": "REPLACE-current-workspace-id",
      "isolationMechanism": "REPLACE-owner-controlled-access-boundary",
      "otherConditionArtifactsAccessible": false,
      "prohibitedArtifacts": ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"]
    },
    {
      "condition": "current",
      "evidencePath": "MyBrain/verify/p3-clean-room-REPLACE-pair-id-current.json",
      "workspaceId": "REPLACE-current-workspace-id",
      "worktreeRoot": "REPLACE-absolute-current-worktree-root",
      "implementation": { "actor": "REPLACE-current-implementation-actor", "contextId": "REPLACE-current-implementation-context-id" },
      "review": { "actor": "REPLACE-current-review-actor", "contextId": "REPLACE-current-review-context-id" },
      "otherWorkspaceId": "REPLACE-baseline-workspace-id",
      "isolationMechanism": "REPLACE-owner-controlled-access-boundary",
      "otherConditionArtifactsAccessible": false,
      "prohibitedArtifacts": ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"]
    }
  ]
}
```

run.closeの現行schemaは pathだけです。close reportのSHA-256をこのrecordへ先に書きません。pair-closeはP-3管理providerの起動とfigma-gate closeの**前**に、最終Git変更集合が凍結changeTargetsと完全一致することを再検査する。不一致ならactive preflight stateをcloseせず、provider receiptも作らない。これを通過した後にfigma-gate closeを実行し、active stateとclose reportのpath/SHA-256を照合します。run.pageProviderReceiptPathはcondition別のrepository-relative出力先であり、pair-close前に存在していると失敗します。

shared.pageProvider.outputRootはpair-close前に実在するreal source-side directoryでなければなりません。MyBrain、.figma-gate、node_modules、symlink、special file、既起動server、外部server、ignored/generated build outputは使用できません。providerが収集するbundle全pathはoutputRootと結合した時点でscope.changeTargetsと完全一致し、余分なbundle fileや未収録targetを残せません。entryPathはHTML regular fileであり、entry自身もchangeTargetsの一つです。**entry HTMLはbundle内のfaviconを`<link rel="icon" href="...">`で明示宣言し、そのfaviconファイルも新規のchangeTargetに含めます。** 未宣言ならChromeがorigin直下の`/favicon.ico`を要求し、provider/traceがbundle外の404で停止し得ます。

P-3のQ-08 scopeには、URLを変更するclick遷移である`destination.location`を含めません。P-3は凍結`verifyUrl`とDocument URLの完全一致を要求するためです。URLを変えず描画可視だけを照合する`destination.visible`は対象にできます。判断Jを承認する前に、対象scopeから`destination.location`を除外します。

現行v13のP-3パイロットは、全`changeTargets`がsource snapshotに存在しない新規ファイルであり、全てが単一のstatic source `outputRoot`配下に収まり、bundle path集合と`changeTargets`が完全一致する清浄な専用リポジトリを前提にします。`MyBrain/`、`.figma-gate/`、`node_modules/`以外のignored artifactがある通常のWordPress、`dist/`無視のビルド、`vendor/`・`.env`・`*.log`等を置く構成は、そのまま対象にしません。別scope・owner承認・独立批評によるadapterなしに条件を緩めません。

準備は次の依存順で実行します。pair-begin前にbaseline worktreeで`npm ci`を完了し、直後にread-onlyの`p3-evaluator-plan`を実測して第三者node_modulesのpolicy適合を検査します。literal dynamic importは静的解析対象として許可し、literal specifier・解決path・SHA-256をexecution bundleへ含めます。ここでいうpolicy適合は、静的に列挙した依存、lockfile、解決済みpackageを固定する契約に限ります。識別子束縛や任意の実行時loader逃避を完全に証明・sandboxするものではなく、閉包外コードが実行時に読まれない保証ではありません。`p3-evaluator-plan`がFAILした場合はpair-beginへ進まないためpair予約を消費しません。p3-json-hashはpath参照を持つ全JSON recordで実行し、出力のfileSha256を使います。draft、`ownerApproved: false`、`status: "approved"`以外のJ/evidence recordはruntime入力にできません。

runtimeは`pair-readiness`、`pair-begin`、`pair-preflight`、`pair-close`、`report`、`compare`だけを指します。`p3-evaluator-plan`、`p3-decision-input-plan`、`p3-decision-candidate-plan`、`p3-json-hash`はread-onlyのrecord作成補助です。`p3-decision-candidate-plan <draft-comparison> <draft-pre-implementation> <draft-evaluator-baseline>`はdraft入力から`candidateOnly: true`かつ`runtimeEligible: false`のDecision J candidateを返すだけで、final J、owner承認、runtime入力、pair lifecycleを生成しません。最終Jは承認済みnon-draft preImplementationProofとevaluator baselineを参照する`p3-decision-input-plan`だけで生成します。draftをruntimeへ渡すことはできません。evaluator baseline、preImplementationProof、current/B improvement approvalの既存owner承認要件もv13で緩和しません。

~~~bash
# 凍結済みevaluator rootとpackage-lockをcontractへ入れた後。pair-begin前の第三者node_modules policy検査
npm ci
node MyBrain/verify/fidelity-benchmark.mjs p3-evaluator-plan MyBrain/verify/fidelity-comparison-baseline.json
# 出力のbaselineRecordTemplateをowner承認して保存した後
node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash MyBrain/verify/p3-evaluator-baseline-<id>.json

# 凍結source/scopeからpreImplementationProofをowner承認して保存した後
node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash MyBrain/verify/p3-pre-implementation-<id>.json

# draft candidateの内容束縛だけを読む。出力はcandidateOnly/runtimeEligible:falseでありruntimeへ渡さない
node MyBrain/verify/fidelity-benchmark.mjs p3-decision-candidate-plan MyBrain/verify/p3-drafts/fidelity-comparison-<id>.json MyBrain/verify/p3-drafts/p3-pre-implementation-<id>.json MyBrain/verify/p3-drafts/p3-evaluator-baseline-<id>.json

# 承認済みpreImplementationProof、baselineRecord、shared.cleanRoomAuthorizationをcontractが参照した後
node MyBrain/verify/fidelity-benchmark.mjs p3-decision-input-plan MyBrain/verify/fidelity-comparison-baseline.json
# 出力のownerDecisionJTemplate v2をowner承認して保存した後
node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash MyBrain/verify/p3-owner-decision-J-<id>.json
~~~

Decision J v2の承認後に、baseline/currentそれぞれのclean-room evidence v2を作成し、owner承認後にp3-json-hashで固定します。Jはevidenceのbyte SHA-256を参照せず、evidenceだけがJのpath/file SHA-256とJ内planのstable JSON SHA-256を参照します。したがって、Jをevidence SHAへ戻して参照することはありません。current/B improvement approvalも既存意味論のままowner承認後に固定します。clean-room evidenceはpairId＋conditionを含む固有pathへ保存し、別pair・別conditionとの共有または上書きを行いません。

active pairの順序は、baseline contractでread-onlyの`pair-readiness <baseline-contract> pre-begin`を通してから`pair-begin`を一度だけ実行し、baseline/current各worktreeでpair-preflight、実装checkpoint、`pair-readiness <condition-contract> pre-close`、pair-close、reportを順に実行する。pre-beginはowner承認済みJ v2とbaseline evidence v2、編集前のignored artifact・未実装source・provider構造・clean sourceを検査し、pre-closeはactive pair-preflightに記録されたJ/plan/evidence束縛、最終Git変更集合、provider bundle、entryをread-onlyで検査する。readinessはledger／pair lock／gate stateを書かず、`figma-gate close`、provider receipt、最終CDP測定の代替ではない。draftまたは不一致のJ/evidenceはreadinessで拒否されるが、pair予約やaborted ledgerを作らない。**baseline clean-room evidenceが未承認の場合、`pair-begin`はreservation作成後に失敗してpairを`aborted`で終端し、pairIdとcontract pathを消費する。これを避けるため、必ず先にread-onlyの`pair-readiness <baseline-contract> pre-begin`を実行する。** **pair-closeはpre-closeの結果を信用せず、provider起動とfigma-gate closeの直前に最終Git変更集合を再検査する。** 不一致ならclose stateとreceiptを残さずpairをabortedで終端する。最終closeは手動で実行せず`pair-close`だけから実行する。両reportがそろってからbaseline contractを第3引数にcompareを実行する。pair-abortは20文字以上の理由でactive pairを終端する代替経路であり、completed後に実行する手順ではありません。

baseline/currentはsharedのgate manifestが持つ同一`verifyUrl`、すなわち同一provider portを共有します。providerはexclusiveであり、実装中のcheckpoint用serverもこのportを使うため、A/BのP-3実行は並行にできません。baseline/currentを順次実行します。

`p3-page-provider.mjs`がhermeticに固定するのは`pair-close`の最終static bundle測定です。実装中のcheckpointが書く`benchmark.attempts`、したがって`firstTryPassRate`の初回試行記録そのものはhermetic providerの対象ではありません。この指標は`tamperEvident: false`の範囲に残ります。checkpointのhermetic化は現行v13に含めず、必要なら別scope・owner承認・独立批評で扱います。

## 1. Pre-implementation proof v2

source snapshotにtarget実装ファイルもselectorも存在しないことをownerが承認する記録です。`unimplementedComponents`はcomponent decision由来の全対象、`unimplementedTargetPaths`は凍結`changeTargets`と完全一致させます。

```json
{
  "version": 2,
  "status": "approved",
  "ownerApproved": true,
  "approvedAt": "REPLACE-ISO-8601",
  "sourceSnapshot": {
    "commit": "REPLACE-source-commit",
    "tree": "REPLACE-source-tree",
    "archiveSha256": "REPLACE-64-hex"
  },
  "scope": {
    "manifestSha256": "REPLACE-64-hex",
    "componentsSha256": "REPLACE-64-hex",
    "pageCoverageSha256": "REPLACE-64-hex",
    "checkpointPlan": ["REPLACE-element-id"]
  },
  "unimplementedTargetPaths": ["REPLACE-new-target-file"],
  "unimplementedComponents": [
    {
      "elementId": "REPLACE-element-id",
      "selector": "REPLACE-selector",
      "figmaNodeId": "REPLACE-figma-node-id",
      "codePath": "REPLACE-new-target-file"
    }
  ]
}
```

## 2. Evaluator baseline record v2

先に次を実行し、出力された12 artifactと`executionBundleSha256`をそのまま使います。

```bash
node MyBrain/verify/fidelity-benchmark.mjs p3-evaluator-plan MyBrain/verify/fidelity-comparison-baseline.json
```

出力の`baselineRecordTemplate`で`status`、`ownerApproved`、`approvedAt`、`basis`だけをowner承認結果へ置換します。artifact・execution bundleの値を手編集しません。

## 3. Owner decision J v2

pre-implementation proofとevaluator baseline recordをowner承認後に、次を実行します。

```bash
node MyBrain/verify/fidelity-benchmark.mjs p3-decision-input-plan MyBrain/verify/fidelity-comparison-baseline.json
```

出力の`ownerDecisionJTemplate`で`status`、`ownerApproved`、`approvedAt`だけをowner承認結果へ置換します。pairId・Figma・source・scope・evaluator・comparison input bundle・`cleanRoomAuthorization`・`cleanRoomAuthorizationStableJsonSha256`は変更しません。`cleanRoomAuthorization`はcontract sharedの同じobjectを完全複写し、`cleanRoomAuthorizationStableJsonSha256`はそのキー順を正規化したSHA-256です。J v2はevidenceのbyte SHA-256を持ちません。evidenceがJへ一方向に参照を張るため、Jとevidenceを相互SHAで固定してはなりません。

J v2の追加必須部分は次です。ここに示さない既存のFigma、sourceSnapshot、scope、evaluator、comparisonInputBundleの全fieldも`p3-decision-input-plan`出力をそのまま残します。

```json
{
  "version": 2,
  "decisionId": "J",
  "status": "approved",
  "ownerApproved": true,
  "approvedAt": "REPLACE-ISO-8601",
  "pairId": "REPLACE-owner-approved-pair-id",
  "cleanRoomAuthorization": {
    "version": 1,
    "pairId": "REPLACE-owner-approved-pair-id",
    "conditions": [
      {
        "condition": "baseline",
        "evidencePath": "MyBrain/verify/p3-clean-room-REPLACE-pair-id-baseline.json",
        "workspaceId": "REPLACE-baseline-workspace-id",
        "worktreeRoot": "REPLACE-absolute-baseline-worktree-root",
        "implementation": { "actor": "REPLACE-baseline-implementation-actor", "contextId": "REPLACE-baseline-implementation-context-id" },
        "review": { "actor": "REPLACE-baseline-review-actor", "contextId": "REPLACE-baseline-review-context-id" },
        "otherWorkspaceId": "REPLACE-current-workspace-id",
        "isolationMechanism": "REPLACE-owner-controlled-access-boundary",
        "otherConditionArtifactsAccessible": false,
        "prohibitedArtifacts": ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"]
      },
      {
        "condition": "current",
        "evidencePath": "MyBrain/verify/p3-clean-room-REPLACE-pair-id-current.json",
        "workspaceId": "REPLACE-current-workspace-id",
        "worktreeRoot": "REPLACE-absolute-current-worktree-root",
        "implementation": { "actor": "REPLACE-current-implementation-actor", "contextId": "REPLACE-current-implementation-context-id" },
        "review": { "actor": "REPLACE-current-review-actor", "contextId": "REPLACE-current-review-context-id" },
        "otherWorkspaceId": "REPLACE-baseline-workspace-id",
        "isolationMechanism": "REPLACE-owner-controlled-access-boundary",
        "otherConditionArtifactsAccessible": false,
        "prohibitedArtifacts": ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"]
      }
    ]
  },
  "cleanRoomAuthorizationStableJsonSha256": "REPLACE-stable-json-sha256-of-cleanRoomAuthorization"
}
```

実recordではsection 0の`shared.cleanRoomAuthorization`とJ v2内の`cleanRoomAuthorization`をstable JSONで完全一致させます。片方のconditionだけ、短縮したobject、evidence SHA-256をJへ追加したrecordは使えません。

## 4. Condition別 clean-room evidence v2

baselineとcurrentで別々に作成し、各recordをownerが承認します。evidenceファイル名は必ずpairIdとconditionを含め、たとえば MyBrain/verify/p3-clean-room-<pairId>-baseline.json と MyBrain/verify/p3-clean-room-<pairId>-current.json にします。同じconditionでも別pairのevidenceを再利用・上書きしてはなりません。A/Bの4 context IDは全て異なり、相手側のsource、diff、checkpoint、conversation、resultへアクセスできないことをowner管理の境界として記録します。これは暗号学的な非参照証明ではなく、J v2とconditionごとのowner承認を実行時に束縛する契約です。

```json
{
  "version": 2,
  "kind": "p3-clean-room-evidence",
  "status": "approved",
  "ownerApproved": true,
  "approvedAt": "REPLACE-ISO-8601-after-or-equal-to-Decision-J-approval",
  "pairId": "REPLACE-owner-approved-pair-id",
  "condition": "baseline",
  "ownerDecisionJ": {
    "path": "MyBrain/verify/p3-owner-decision-J-REPLACE.json",
    "fileSha256": "REPLACE-byte-sha256-of-owner-decision-J-v2-record"
  },
  "cleanRoomAuthorizationStableJsonSha256": "REPLACE-stable-json-sha256-from-Decision-J-v2",
  "conditionAuthorization": {
    "condition": "baseline",
    "evidencePath": "MyBrain/verify/p3-clean-room-REPLACE-pair-id-baseline.json",
    "workspaceId": "REPLACE-baseline-workspace-id",
    "worktreeRoot": "REPLACE-absolute-baseline-worktree-root",
    "implementation": { "actor": "REPLACE-baseline-implementation-actor", "contextId": "REPLACE-baseline-implementation-context-id" },
    "review": { "actor": "REPLACE-baseline-review-actor", "contextId": "REPLACE-baseline-review-context-id" },
    "otherWorkspaceId": "REPLACE-current-workspace-id",
    "isolationMechanism": "REPLACE-owner-controlled-access-boundary",
    "otherConditionArtifactsAccessible": false,
    "prohibitedArtifacts": ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"]
  }
}
```

`conditionAuthorization`はDecision J v2の`cleanRoomAuthorization.conditions`内の当該condition objectと完全一致させます。contractの`run.cleanRoom`はこのrecordを`{ "evidence": { "path", "sha256" } }`として参照するだけであり、isolationMechanism等をrunへ再記載しません。baseline evidenceは`pair-readiness pre-begin`と`pair-begin`で、current evidenceはcurrent `pair-preflight`で検査されるため、いずれもdraft、未承認、J/path/plan/identity不一致なら`figma-gate preflight`へ進めません。

## 5. Current/B improvement approval

currentだけに必要です。baselineは`evaluatedChange.id = "baseline"`で、この記録を持ちません。v13でもこのapproval recordのversionと意味論は変えません。recordの`ownerDecisionJSha256`はcleanRoomAuthorizationを含むDecision J v2全体のbyte SHA-256を参照し、current `pair-preflight`はclean-room evidence v2とこのimprovement approvalの両方を`figma-gate preflight`より先に検査します。

```json
{
  "version": 1,
  "status": "approved",
  "ownerApproved": true,
  "pairId": "REPLACE-owner-approved-pair-id",
  "evaluatedChangeId": "REPLACE-improvement-id",
  "approvedAt": "REPLACE-ISO-8601",
  "ownerDecisionJSha256": "REPLACE-byte-sha256-of-owner-decision-J-record",
  "sourceSnapshot": {
    "commit": "REPLACE-source-commit",
    "tree": "REPLACE-source-tree",
    "archiveSha256": "REPLACE-64-hex",
    "preImplementationProofSha256": "REPLACE-byte-sha256-of-pre-implementation-proof"
  },
  "scope": {
    "manifestSha256": "REPLACE-64-hex",
    "componentsSha256": "REPLACE-64-hex",
    "pageCoverageSha256": "REPLACE-64-hex",
    "checkpointPlan": ["REPLACE-element-id"],
    "changeTargets": ["REPLACE-new-target-file"],
    "targetSectionIds": ["REPLACE-section-id"]
  }
}
```

`pair-begin`、`pair-preflight`、`pair-close`、`report`、`compare`のいずれかで失敗したpairはfixed ledgerに終端を残し、pairIdや同じcontract pathを再利用できません。v12以前のfixed reservationは占有済みのまま保持し、v13 contractで継続または置換できません。`pair-readiness`だけはread-onlyの事前検査であり、draft/未承認/不一致を拒否してもledger、pair lock、gate state、aborted終端を作りません。人が中止する場合は`pair-abort <comparison.json> <20文字以上の理由>`を実行します。
