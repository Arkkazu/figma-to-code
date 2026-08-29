# P-3 clean-room role handoff protocol

この文書はP-3 comparison contract v13のcoordinator-only運用手順です。v12およびそれ以前のcomparison contractは移行なしに受理しません。P-3 runtime contract、Decision J、clean-room evidenceのschemaを拡張しません。roleへ渡す文書でもruntime入力でもありません。

## 1. 役割と境界

coordinatorだけがactual linked worktree、common Git directory、pair lock、fixed ledger、`.figma-gate`、P-3 lifecycleを扱います。baseline/currentのimplementation roleとreview roleは、Git metadataを持たないcondition別stagingと、roleへ許可されたattachmentだけを扱います。coordinatorはA/B implementation/review actorとして宣言しません。

actual linked worktreeとcommon Git directoryはP-3 v13のfixed ledger、pair lock、compareのため維持します。roleへ渡さないことと、actual worktreeを分離・複製することは別です。`cleanRoomAuthorization.conditions[*].worktreeRoot`にはstagingではなくactual linked worktreeの絶対pathを記載します。

## 2. role packetの許可・禁止

role inputはself-contained staging archive、Figma evidence、gate manifest・components・spec・node map・page coverage・accessibility/motion/threshold/mask等のidentityを含まない凍結入力に限ります。currentだけはowner承認済み改善情報を追加できます。review roleは同condition implementationの返却物だけを追加で受け取れます。

次をbaseline/currentのどちらについてもroleへ渡してはいけません。自condition分も含みます。

- comparison contract
- Owner Decision J v2 record
- clean-room evidence v2 record
- `fidelity-comparison-template.json`
- actual linked worktree、common Git directory、ledger、pair lock、`.figma-gate`
- `P3-CONTRACT-RECORDS.md`、p3 evaluator input/baseline record、raw `MyBrain/verify/`一括コピー
- 相手conditionのsource、diff、checkpoint、conversation、result
- `.git`、`MyBrain/`、`AGENTS.md`、`CLAUDE.md`、`STATE.md`（列挙済みのpath classとして`p3-role-packet.mjs`が機械的に拒否するもの）

source snapshot archiveを再利用する場合は、上記の禁止物を除いたrole専用staging archiveを生成します。archiveのsource SHA-256との対応、生成規則、entry manifestをcoordinator-only証跡に残します。

roleに配布したstaging/attachmentの外にあるhost filesystem pathを読む、開く、又は導出するよう促す自由文・設定がないことは、coordinatorが各delivery前に行う手続レビューとします。`p3-role-packet.mjs`は任意の自然言語・設定の意味を解析しません。reviewer、reviewedAt、対象deliveryのpacket manifest SHA-256、結果（`clear` / `blocked`）をcoordinator-only attachment manifestへ記録します。この記録はowner-managed運用証跡であり、helper又はP-3 runtimeによる機械証明ではありません。

## 3. identity leak scanとattachment manifest

coordinatorはroleへの**各delivery前**に、archiveをcoordinator-only inspection directoryへ安全に展開します。`p3-role-packet.mjs` v3はarchiveを入力として受け付けません。展開済みのreal directoryを`packetRoot`として列挙し、symlink、special file、未宣言file、archive名を含むpathを拒否します。archiveの安全な展開はhelperの前段にあるcoordinatorの責任であり、展開済みdirectoryとhelperのstdout manifestはroleへ渡しません。

role packet plan v3の`identityAuthority`は、actual v13 comparison contractとowner承認済みDecision J v2の各`path`/byte SHA-256、および`recipientCondition`だけを持ちます。helperは両authorityのpairId、Decision J参照、cleanRoomAuthorization stable JSON hashを照合してから、**相手condition**のidentityを導出します。callerが独自の`forbiddenIdentityStrings`やstand-aloneのcleanRoomAuthorizationを渡して検査対象を狭める形式ではありません。authority fileとplanは`packetRoot`外のcoordinator-only領域に置きます。

payloadはbinaryを含むraw byte sequenceと、valid JSONなら再帰走査したstring/keyを検査します。pathはslash/case/JSON escapeを含む表記ゆれも扱い、相手conditionの次の値が1件でも含まれるpacketを拒否します。

- `workspaceId`
- `worktreeRoot`
- `implementation.actor`と`implementation.contextId`
- `review.actor`と`review.contextId`
- `evidencePath`
- `otherWorkspaceId`

deliveryごとにcoordinator-only attachment manifestを保存します。最低限、opaque handoff ID、role種別、delivery sequence、attachment logical path、SHA-256、origin、identity scan対象、scan結果、返却形式を記録します。condition名、pairId、worktree path、actor/context ID、evidence pathをroleへ渡すredacted manifestへ入れません。attachment manifest自身もroleへ渡しません。

`p3-role-packet.mjs --check <coordinator-only-plan.json>`は、packetのpath、SHA-256、restricted P-3 artifact fingerprint/source class、authorityから導出したidentityを機械照合してstdoutのcoordinator-only manifestを得ます。comparison contract、Decision J、clean-room evidence、probe plan/evidenceはこのtoolのrole inputに含めません。

## 4. component return packageとrecovery

implementation roleは1 component・1 attemptごとに、plain USTAR形式のreturn archiveを返します。archiveはregular fileだけで構成し、rootの`return-manifest.json` v4と、manifestが宣言したfileだけを含めます。compressed tar、PAX/GNU extension、directory、symlink、hard link、special file、path traversal、未宣言entryは受け付けません。

coordinatorは`p3-role-return-plan-template.json`からcondition別・component別のreturn plan v5を作り、`p3-role-return-manifest-template.json`をrole返却物のmanifest書式として渡します。return planはA/Bでbyte-identicalなcoordinator-only handoff protocol v2のpath/SHA-256と、そのcomponentのelementId・sequence・component decision code path・ordered `allowedChangeTargets`、`attemptOneCreatePaths`、`derivedBootstrapDirectories`を完全一致で束縛します。`componentReturnScopes`の各entryはこの6 fieldだけ（`elementId`、`sequence`、`componentDecisionCodePath`、`allowedChangeTargets`、`attemptOneCreatePaths`、`derivedBootstrapDirectories`）を持ち、checkpoint plan順でなければなりません。`attemptOneCreatePaths`にshared-delimited fileが含まれる場合、そのreturn planの対応file policyは6 checkpoint要素を凍結順に列挙する`bootstrapDelimiterRegions`を持ち、以後のdelimiter-only returnが使う全regionを初回に初期化します。さらにactual common-Git P-3 ledgerとfixed pair lock、baseline/current双方のactual worktree上のfinal v13 contract、frozen gate manifest、v5の`.figma-gate/active.json`、preflightIdをpath/SHA-256で固定します。v5 stateはconditionの`run.implementation`と一致する`implementationIdentity`および`responsiveHtml.sourceFiles`/`deferredSourceFiles`を必須とします。return manifestはopaque handoff ID、handoff protocol SHA-256、component elementId/code path/sequence/attempt、input staging SHA-256、各fileのbyte SHA-256を固定します。

`node p3-role-return.mjs --check <coordinator-only-plan.json> <return.ustar.tar> <actual-target-root>`はactual targetを変更せず、上記のauthority、archive entries、hash、component allowlistを検査します。planのscopeはfrozen `changeTargets`の任意部分集合ではなく、handoff protocol内の当該component scopeと完全一致しなければなりません。`attemptOneCreatePaths`は当該sequenceの`allowedChangeTargets`の順序付き部分集合であり、attempt 1だけで未作成targetを許可します。全6 sequenceの`attemptOneCreatePaths`は凍結28 targetを重複なく完全に分割し、attempt 2以降および別sequenceの再作成は拒否します。P-3 Open Service Top Heroでは`site/assets/hero/hero-laurel.png`の作成・変更責任はsequence 3だけにあり、sequence 6の`allowedChangeTargets`と`attemptOneCreatePaths`に含めず、変更試行はFAILとします。shared fileはpair-begin前に固定したstart/end delimiterの間だけを変更でき、delimiterの外側byteは同一でなければなりません。component fileは既存regular fileに限り、`attemptOneCreatePaths`に明示された未作成targetだけが例外です。

`--apply`は`--check`相当の検査後にだけactual targetへ適用します。検査はpair ledgerのhash chain、actual common-Git location、fixed pair lock、baseline/current各`preflight-recorded`のv13 contract/run intent/worktree/implementation identity/v5 gate state/preflightId束縛を再検証し、両方が存在しなければ拒否します。v5はcoordinator-only progress JSONLで`return-apply-intent`、`return-applied`、`checkpoint-recorded`、`feedback-recorded`の順序を固定します。`--record-checkpoint`はactual `.figma-gate/active.json`、同一preflightId、v5 implementation identity、直後に1本だけ増えた当該component・attemptのbenchmark測定を照合し、`--record-feedback`は同conditionのfeedback artifactをそのcheckpoint proofへ束縛します。次deliveryはfeedback後だけに導出され、PASSなら次componentのattempt 1、FAILなら同componentの次attempt以外を拒否します。適用はrecovery journalを用いたrollback可能な複数file処理であり、先行する未完了journalは回復してから進みます。中断時は`node p3-role-return.mjs --recover <actual-target-root>`でjournalを検査し、rollbackまたはcommitted処理の完了を行います。これはmulti-file atomic transaction、durable filesystem commit、OSによる隔離を保証するものではありません。coordinatorはarchive/plan/manifest/check/apply/checkpoint/feedback/recoveryのbyte SHA-256と結果をcoordinator-only evidenceへ残します。

`--apply`が中断した場合は、`pair-readiness`または`pair-close`より先に必ず`node p3-role-return.mjs --recover <actual-target-root>`を成功させ、未回復journalまたはrecovery root内の残存entryがあれば手動削除・`.gitignore`追加をせずlifecycleを停止します。journal v2はdirectory intentを`mkdir`より前に記録し、rollbackではtransactionが作成した空directoryだけを**作成の逆順**で削除します。未知directory、journal未記録directory、非空directoryは削除せず、残して報告しfail-closedとします。v1 journalはv2 recoveryで互換処理し、v2必須field欠落はFAILとします。

## 5. lifecycleと返却物の適用順

返却物をactual worktreeへ適用する前に、次を順に完了させます。

1. baseline actual worktreeで`pair-readiness <baseline contract> pre-begin`を実行する。
2. baseline actual worktreeで`pair-begin <baseline contract>`を1回だけ実行する。
3. baseline actual worktreeで`pair-preflight <baseline contract> <gate manifest>`を実行する。
4. current actual worktreeで`pair-preflight <current contract> <gate manifest>`を実行する。
5. step 3と4がともにPASSした後にのみ、condition別implementation loopを開始する。

step 3と4の時点では、両actual worktreeの凍結`changeTargets`と対象selectorが未実装でなければなりません。先に返却物を適用すると`unimplementedWorktree()`がpairをabortし、pairIdとcontract pathを再利用できなくします。

未回復journalまたはrecovery root内の残存entryのままlifecycleを進めると`finalChangeScope()`が変更scope違反として失敗し、`.gitignore`に追加しても`assertNoIgnoredRuntimeArtifacts()`が拒否し、`pair-close`ではpairIdとcontract pathを消費し得ます。

## 6. component単位のimplementation loop

pair-begin前に、coordinator-only protocolで次をA/B同一値として固定します。

- `checkpointPlan`の順序
- elementIdごとの`allowedChangeTargets`
- 提出単位（1 component・1 attempt・1 return archive）
- attempt上限と停止条件
- roleへ返すfeedbackの種類
- review handoffの時点と、reviewがattemptを事前修正しないこと

Chrome fingerprintはP-3 final batchの`CDP Browser.getVersion`だけから得る。pilot期間中はcoordinatorがChrome自動更新を止め、baselineの最初のcheckpointでfingerprintを記録する。currentの最初のcheckpointではそのfingerprintと即時照合し、不一致なら以後のcheckpoint、role delivery、pair closeを開始せず当該pairを停止する。この早期停止はfinal report／compareのA/B完全一致検査を置換又は緩和しない。

各conditionの各elementIdについて、次を実行します。

1. implementation roleが当該elementIdの`componentDecision.codePath`を含むplain USTAR return archiveと`return-manifest.json` v4を提出する。
2. coordinatorがcomponent別return planと`p3-role-return.mjs --check`でcondition、component ID、attempt番号、opaque handoff、input staging hash、allowedChangeTargets、archive entries、file hashes、shared delimiter scopeを検査する。`--check`がPASSした後だけ`--apply`でactual worktreeへ機械適用する。coordinatorは修正、助言、解釈を加えない。
3. coordinatorが同一conditionの`figma-gate checkpoint`を当該elementIdへ1回実行し、`--record-checkpoint`で実測証跡をprogress ledgerへ固定する。最初にcheckpoint測定へ到達したreturn archiveをattempt 1とする。
4. FAIL時、roleへ返せるものは同一conditionのgate `message`、`failureClass`、同一conditionのdiff成果物、scope違反path一覧の逐語出力だけであり、coordinatorは`--record-feedback`で同conditionのfeedback artifactを記録する。
5. `feedback-recorded`後だけに、FAILなら同componentの次attempt、PASSなら次componentのattempt 1を導出する。PASSまたは固定停止条件に達するまで1〜5を繰り返す。A/Bのloopを並列実行しない。

roleはブラウザ実物を見ず、同conditionの凍結入力と逐語gate出力だけで反復します。`firstTryPassRate`と`benchmark.attempts`は`tamperEvident: false`であり、このprotocolの絶対値を通常実装運用と比較しません。同一protocol下のA/B差分だけを解釈します。reviewを実施した事実はowner運用証跡であり、P-3 runtimeが機械検証した事実ではありません。

## 7. disposable probeとcoordinator-only機械検証

OS sandboxを使う場合も、probeは時点付き観測です。全経路にわたるOS強制不変条件、暗号学的な非参照、未構成のhost toolの不存在は主張しません。予定roleと同じ起動方法・同じ設定で作った使い捨てprobe contextを実測後に破棄し、implementation/review roleには転用しません。

probeはP-9 positive control（自stagingの既知file読取成功）、P-10会話/履歴/記憶store、P-12の**self actual worktree / other actual worktree / 3本すべてのpeer staging / common Git / coordinator scratch**にcoordinatorが対応付けたopaque routeへのreadとwrite-openの拒否、P-7 self TEMP/TMP sentinelと3 peer sentinelの読取拒否を含めます。P-10は`.codex/history.jsonl`、`.codex/sessions`、`.codex/archived_sessions`、`.codex/memories` directory、`.codex/memories_1.sqlite`、`.codex/logs_2.sqlite`、`.codex/state_5.sqlite`、`.codex/rules`、`.codex/skills`を別々のfile/directory操作で対象にします。これらはlabelだけで別pathを代用できず、helperが各concrete `.codex` suffixを照合します。`claudeProjects.state: "used"`の場合は`.claude/projects/*.jsonl`を別targetとして必須にし、`absent`の場合はそのtargetを置けません。P-12の`r+` permission probeはopen後にただちにcloseし、create/write/deleteを一切行いません。

v5はrole-sideとcoordinator-onlyを分離します。role planはopaqueな`role-staging-<hex>` rootを明記し、plan file/inventory pathはそのroot内でなければなりません。inventoryを読む**前**にhelperはstaging root自体とinventoryの`realpath`を検査し、staging junction/symlink又はinventory reparse escapeを拒否します。inventoryを読んだ直後、raw launch config・P-9・P-7 challengeを読む前にも`realpath`を検査します。P-7 self sentinelだけはstagingを使いません。helperが**実際に起動されたrole processの**`TEMP`と`TMP`の両方を読み、stagingとのoverlapを拒否して、各directoryへ0600排他create・自己read・SHA-256化します。P-10/P-12 routeはrole側でresolveしません。role-sideが読むのはplan、hash固定した自分用inventory、自staging内のraw launch config/self control/P-7 challenge、P-10 target、そして`p12-routes-<hex>`内のopaque P-12 targetだけです。**role-side plan/inventoryにはcomparison contract、Decision J、coordinator authority、matrix plan、bootstrap plan/output、peer identity、actual worktree/common Git/coordinator scratch/peer stagingのpathを入れません。** full probeはそれらをreadしない構造であり、E2Eは当該pathのread attemptが0件であることを固定します。

coordinator-onlyの`p3-clean-room-probe-coordinator-authority-v1`は、両v13 condition contractとDecision J v2をpath/SHA-256で束縛し、Jのactual worktreeRoot、4本のopaque role staging、actual common Git、coordinator scratch、P-10 target、P-12 redacted route rootを持ちます。helperはcontract/JのcleanRoomAuthorization stable JSON hash、condition別run、actual worktree、4 role identityから導出した`recipientCommitment`を照合し、sourceのroot containment・3 peer rootの完全性・hash・`realpath`を検査します。realpathが宣言root外へ出るreparse/symlinkはFAILです。sourceから導出した`p12-routes-<hex>/p12-<commitment>-{read,write}.sentinel`は、coordinatorが作成・保持する**symbolic/reparse alias**でなければなりません。helperはaliasをread/hash照合し、`realpath`が対応sourceと**同一**でなければFAILです（hard linkや同bytesの別copyでは足りません）。full inventoryはこのaliasとcommitmentに完全一致しなければFAILであり、P-12のactual pathはroleへ配布されません。

P-7は二段です。4 contextの`bootstrap` probeは実launchの`TEMP`と`TMP`から各1本を作成し、launch environment・二つのoriginal path・hashをcoordinator-only before JSONLへ残します。coordinatorだけがmatrix v3へrecipient以外3本のbootstrap plan/outputを渡します。matrixは各plan/inventoryをauthorityと照合し、両sentinelのread/hash/realpathを検証します。source pathはpairId、condition、workspaceId、actor、contextId、evidence path等のauthority既知identity fragmentを含めばFAILです。matrixはbootstrap plan stable JSON hash、inventory SHA-256、output SHA-256、TEMP/TMP environment hash、両source path/content SHA-256から`sourceCommitment`を導出します。

matrixは**aliasを作りません**。各peer full probeへ渡すchallenge v3の3本のpathは、対応bootstrap roleが実際の`TEMP`に作った**original absolute sentinel pathそのもの**です。challengeはrecipient commitment、opaque sentinel ID、original path、content hash、source commitment、matrix plan stable JSON hash、authority SHA-256、bootstrap evidence set SHA-256だけを持ちます。`matrixId`/`challengeId`/`probeId`はそれぞれ`matrix-`/`challenge-`/`probe-` + 32〜128桁のlowercase hexのみです。source pathをaliasへ差し替えること、known identityを含むこと、bootstrap source/hash/realpathと一致しないこと、又は余分fieldはFAILです。これは観測したrole process環境でのread denialを束縛するものであり、TEMP pathに含まれる未知のhost情報を匿名化する仕組みやOS隔離そのものを証明するものではありません。

P-11は**v5では未認可のままfail-closed**です。`p3-clean-room-role-runtime-config-v3`の`mode: "all-disabled"`、空の`mcpServers`/`connectors`はprobe input schemaにすぎず、P-11 PASSではありません。2026-08-10に確認したCodex CLIでは`codex exec --ignore-user-config --ephemeral --json`は利用できますが、`--ignore-user-config`は`$CODEX_HOME/config.toml`を読まない指定、`--ephemeral`はsession rolloutを永続化しない指定であり、その**同一launchに束縛された機械可読なtool/MCP surface inventory**を出すCLI契約は確認できませんでした。別コマンドのconfig listing、空JSON、agentの文章、又はself-authored transcriptでは、managed/project toolやactual unavailable-MCP attemptを独立に立証できません。

従って`node p3-clean-room-probe.mjs --validate-evidence <absolute-evidence-plan>`のPASSはP-7/P-9/P-10/P-12の有限観測整合だけで、出力は必ず`p11Authorization: "NOT_AUTHORIZED"`です。実Figma pairを始める前に`node p3-clean-room-probe.mjs --require-p11-authorization`を実行し、現在は`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`でFAILすることを記録します。ownerはこのFAILを承認で上書きできません。

このFAIL記録は開始の禁止ではない。P-11はBLOCKEDであり、attachment-only運用境界（§7末尾）を採る場合、`--require-p11-authorization` のFAIL出力を逐語で記録したうえでP-3を開始してよい。禁止されるのは、このFAILをPASSまたは技術的隔離の成立として扱うことである。

`p3-p11-app-server-spike.mjs`は、この不足をP-11認可へ読み替えずにApp Serverの観測可能性を測るcoordinator-only feasibility spikeです。runner/Codex/capture層/argv/`CODEX_HOME`をlaunch前に外部固定し、transport境界のraw bytesと同じcandidate launchのpre/post inventoryを照合します。MCP server、plugin/app、project stateはそれぞれ正負対照を持つ`present`/`absent`/`unobservable`の三値で記録し、観測不能を不在と扱いません。spikeの全出力は`feasibilityOnly: true`かつ`p11Authorization: "NOT_AUTHORIZED"`であり、認可code path、runtime入力、role attachment、pair lifecycleへの配線を持ちません。実行planのscratch/output/forbidden rootとread-only launch profileは[p3-p11-app-server-spike-plan-template.json](p3-p11-app-server-spike-plan-template.json)で固定し、source・actual worktree・common Git・pair lifecycle領域への出力はchild launch前に拒否します。詳細は[P3-P11-APP-SERVER-SPIKE.md](P3-P11-APP-SERVER-SPIKE.md)に従います。

probe plan/inventory/config/challengeは**disposable probeだけ**の入力です。coordinator authority、matrix plan、bootstrap plan/output、evidence plan/JSONL、stdout/stderr、launcher/profile fingerprint、role attachment manifest、P-11 feasibility reportはcoordinator-onlyであり、implementation/review roleへのattachmentにしません。雛形は`p3-clean-room-probe-plan-template.json`、`p3-clean-room-agent-environment-inventory-bootstrap-template.json`、`p3-clean-room-agent-environment-inventory-template.json`（full）、`p3-clean-room-probe-coordinator-authority-template.json`、`p3-clean-room-role-runtime-config-template.json`、`p3-clean-room-peer-sentinel-matrix-plan-template.json`、`p3-clean-room-peer-sentinel-challenge-template.json`、`p3-clean-room-probe-evidence-template.json`です。旧`p3-clean-room-tool-transcript-template.json`はretiredであり、v5入力ではありません。

attachment-only方式ではfilesystem denialを観測せず、PASSと数えず、P-7/P-9/P-10/P-12のprobeをattachment-onlyの証跡として使いません。role別attachment manifestへ各deliveryの全attachmentのlogical path、SHA-256、origin、scan結果を固定し、fresh contextへshared project/history/connector/cross-condition attachmentを与えなかったowner申告を手続境界として残します。この申告は、相手conditionの成果物を渡していない・参照させていないことの機械証明ではありません。attachment-onlyの`isolationMechanism`にはowner-operated procedural boundaryだけを事実どおり記載し、`observed denial at time T`は使いません。`OS-enforced`、`guarantees`、`cannot access`も書きません。

## 8. 独立批評と開始条件

このprotocol、component別allowlist、attachment manifest、probe plan/evidenceはP-3 runtime外の補助証跡です。実案件でfinal化する前に独立批評を受けます。独立批評が合格するまで、`ownerApproved: true`、Decision J採用、pair lifecycle、roleへの実input配布、実装、実Figma測定を開始しません。
