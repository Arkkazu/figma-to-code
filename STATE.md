# STATE: figma-to-code-spec-dev

<!-- 仕様: ..\loop-engineering\spec\02-state-spec.md / Log と Escalations は追記のみ -->

## 現在地（Current）
- [2026-08-12 / P-3 R4現行] owner承認済みv4 allocation designから、開始済みpair lifecycleとは別のappend-only v2 return-allocation sidecarを最終化した。A/B同一protocol v2とbaseline/currentの非runtime condition-local authorityをcoordinator-only rootへ固定し、28 targetは2/10/12/0/4/0、hero-laurelはsequence 3のみとした。既存R3 v1 protocol/registry、contract、ledger、pair lock、active state、P11は不変である。role packet、delivery／launch、implementation、browser/Figma測定、P-11解除は依然未承認・未実施である。
- ステータス: waiting-owner-input（P-6 / P-7 / P-1a / 固定高さ検査は独立批評まで完了。P-4はowner判断H/Fの適用と[107]のterra ultra代替最終再批評を経て、figma-gate統合まで合格。P-5は判断Iのowner承認により[118]で最終閉鎖。P-3 Open Service pilotはFigma scope・clean A/B snapshot・共有証跡・current B改善を起草済みであり、[144]で後発の評価器CJS互換/loader hardeningも別ベンダー独立批評に合格した。[147]でClaude（Anthropic）がcomparison contract v10を合格と判定し、[148]で配列placeholder拒否・LOW-1文書・A/B v10再配備とdraft再生成を是正した。[149]で別ベンダー追補独立批評がMEDIUM-1とLOW-2の解消を確認した。local `unelevated` sandboxはA/B sibling worktreeを遮断できず、P-3実装・review contextには使わない（[150]）。[152]のClaude全文独立批評は、coordinator／role分離アーキテクチャを維持しつつ、実装loop、role配布物、返却適用順序、probe証跡のBLOCKER-1〜3により条件付きFAILと判定した。[153]でP-3実行器を変えずにBLOCKER-1〜3とP-7/P-9/P-10/P-12の手順・draft証跡を起草内で是正し、[154]のClaude（Anthropic）別ベンダー独立追補批評が当該是正とP-11 fail-closedをPASSと判定した。P-11は`NOT_AUTHORIZED`のままfail-closedであり、owner承認では解除できない。fresh gate sidecarの最終入力、実効性を確認した4 context、pair固有owner recordとowner承認は未完了。4段根拠監査の10/10/0は実Figma忠実度・P-3に読み替えない）
- P-11 feasibility spike: [161]でClaude（Anthropic）は[160]のLOW-1/LOW-2記録・証跡保全差分をPASSと判定し、新規HIGH/MEDIUMはなかった。[162]で23件の保全artifactを機械可読manifestへ固定した。[163]の新しい一回限り許可付き実観測で、`read-only`は実App Serverへ送信され、`thread/start`は受理されthread IDを返した。しかし最初のinventory前に`CAPTURE_CHILD_EXIT_TIMEOUT`となり、P-11は`NOT_AUTHORIZED`のままである。[164]で原因をchild生存期間とRPC deadlineの混同と確定し、終了deadlineを`stdin.end()`後だけに局所是正した。[165]の新しい一回限り許可付き実行はouter wrapperの420秒timeoutまでにreportを生成できず、当該runに属する4 processだけを停止した。[166]でraw stdout artifactの共有書込み列が後続stdin RPCを止めることを使い捨てfixtureで再現し、channel別書込み列へ局所是正した。[167]で公開CLIをdeadline付きsupervisor／workerへ分離し、freeze plan、PID限定tree cleanup、timeout receiptを追加した。[168]と[169]のユーザー一回限り許可付き実 `CODEX_HOME` candidate観測は、ともに360秒でtimeout receiptへfail-closedした。完成reportは不在であり、partial rawは未読・未解釈である。P-11認可、owner承認、pair lifecycleは依然不許可である。
- [2026-08-11 / [170] P-11停止判断による現行補正] Claude（Anthropic）の独立批評は **BLOCKED（現行公開APIでは到達不能）** と判定した。P-11を認可へ変換せず、`--require-p11-authorization`のfail-closedを維持し、同一方式のreal `CODEX_HOME`観測、timeout対策、追加回帰試験は停止する。P-11はP-3の技術的必須条件ではない。P-3を進めるには、roleをattachment-onlyに限定し、MCP／connector／pluginの無効化と他condition artifactを提供・参照させないことを、機械証明ではないowner運用申告として残存リスク付きで記録するかをownerが判断する。P-11未認可のまま`ownerApproved:true`／pair-beginへ自動では進めない。
- [2026-08-11 / [171] attachment-only移行条件のdraft反映] Claude（Anthropic）のattachment-only移行判定はPASSであり、条件1〜6をdraftへ反映した。P-11 FAIL逐語証跡、role packetでの`STATE.md`禁止、attachment manifest／packet check、A/B同一の残存リスク付き`isolationMechanism`、owner承認packetを準備した。post-changeの別ベンダー独立確認が未完了であり、owner承認、pair lifecycle、role配布、実装、実Figma測定は開始しない。
- 対象:
  - Q-12（実装ループの役割と粒度）: **確定**（[77] 独立批評合格 → [78] owner承認）
  - Q-09（実装とデザインの一致の自動検証）: **確定**。[79] P-6 で §6「合否基準との対応」を復元し、ゴール条件2の欠落を解消
  - Q-10（検出した差分の修正順序）: **確定**。[79] の独立批評で不合格だった指摘は [81] で是正起草し、[82] の再批評で **合格**（P-7 解消）
  - Q-09/Q-01 の実行強制（P-1a）: `unverified-figma-value` に対する provenance 検査を `figma-gate.mjs` へ実装し、負のE2E3件を追加（[83]）。[84] の独立批評で **合格**。低優先指摘（被代替ガードの回帰試験）も反映済み
  - 忠実度ベンチマーク（P-3）: 初期計測器（`figma-gate.mjs` の checkpoint 試行記録・`preflight` の対象集合凍結、および `templates/verify/fidelity-benchmark.mjs` の集計器）は [85]〜[87] の独立批評で合格した。**比較契約v9は別物であり、[139]のbundle scope負E2E欠落を[140]で是正し、[141]でClaude（Anthropic）の別ベンダー独立批評に合格した。改訂判断J-v9はownerが採用し、その着手前条件1〜3も[142]で回帰合格した。後発のCJS直接property互換も[144]でClaude（Anthropic）の別ベンダー独立批評に合格した。** [146]で、draft runtime拒否とJ v2／condition別clean-room evidence v2のowner承認束縛をcomparison contract **v10**へ追加し、[147]でClaude（Anthropic）はv10本体を合格と判定した。検出された配列placeholderのMEDIUM-1は[148]で是正し、P-3全E2E・figma-gate E2E、A/B `npm ci`／`p3-evaluator-plan`、v10 draft再生成まで完了した。[149]の別ベンダー追補独立批評はMEDIUM-1とLOW-2の解消、新たなHIGH/MEDIUMなしを確認した。[150]で、local `unelevated` sandboxのfresh contextが相手worktreeを読めたため、同方式を4 contextの根拠に使わないと確定した。[152]のClaude全文独立批評は、actual linked worktreeとcommon Gitをcoordinatorが維持し、roleをside-only stagingへ分けるアーキテクチャ自体はPASSとしつつ、BLOCKER-1（component単位実装loop）、BLOCKER-2（contract/J/evidenceのrole配布除外とidentity検査）、BLOCKER-3（pair-preflight成功後の返却適用）を是正するまで条件付きFAILとした。[153]は、packet v3 authority-bound scan、return v4 progress/checkpoint/feedback順序、probe v5のP-7/P-9/P-10/P-12有限観測を起草内E2Eで是正した記録であり、[154]のClaude（Anthropic）別ベンダー独立追補批評は当該是正をPASSと判定した。LOW-1のrecovery journal診断手順も`P3-CLEAN-ROOM-PROTOCOL.md`へ追記済みである。P-11は現行公開APIでは`NOT_AUTHORIZED`／BLOCKEDのままである。ただし[170]・[171]のattachment-only運用境界では、P-11 FAILをPASS又は技術的隔離へ読み替えず、post-change別ベンダー独立確認とownerによる残存リスクの採否を経ることを条件に、`ownerApproved:true`・pair-beginへ進む余地がある。Open Service top hero pilotではFigma URL/node、専用clean static source/A-B worktree、PC/SP viewport、scope、B改善ID、最新evaluator baseline draftが準備済みである。
  - ゴール条件（`LOOP.md`）: 条件1（全設問 `確定`）✅ / 条件2（各回答に検証可能な合否基準）✅ 13/13にアンカー付与 / 条件3（TODO・FIXME 0件）✅。**3条件は満たした。原因4（検証器の穴＝P-4）は[107]でfigma-gate統合まで完了した。原因1（効果測定の不在＝P-3）は、comparison contract v9の独立批評・設計採用・着手前条件を通過したが、実Figma入力指定と実測値が0件のため未解消である。**
  - 次にやること: ①attachment-onlyを採るowner判断をpair固有draftへ記録し、owner操作によるMCP／connector／plugin無効化と他condition artifactを提供・参照させない運用申告を最終化する ②fresh Figma asset URL、reference crop、mask/threshold、gate sidecar、4 context、pair別recordを最終入力としてhash固定する ③owner本人が判断J record・baseline record・preImplementationProof・current改善承認record・baseline/current clean-room evidenceの`ownerApproved: true`を承認する ④承認済みpair固有recordを凍結後、read-only `pair-readiness <baseline-contract> pre-begin`を実行する
  - ブロッカー: (1) fresh gate sidecar最終入力、4 context、mask/thresholdとpair固有owner recordの承認が未完了。P-11は現行公開APIではBLOCKEDのままであり、同一方式の再観測・timeout対策・追加回帰では解消しない (2) 判断KでQ-03 §5-1 / §5-2のGrid/Hug＋min-width実測対象を指定するまで採取不能
- 未確認: Q-03 §5-1 / §5-2 の実測（Grid モード・Min/Max の design_context 出力形）は、該当機能を含む最初の案件で行う（[10]）
- 解消済み（記録のため残す）: Q-10 の状態表記の3か所不一致は [80] で解消。Q-10 §1-2 の批評指摘は [82] で解消。`close-report.json` が初回checkpointのFAIL件数を保持しているかの未確認は [85] で解消（**保持していない**。固定値で0を書いている）
- 注記（2026-07-28 claude）: 本ファイルは [0]〜[60] とこの節の旧本文が文字化けし判読不能。U+FFFD がファイルに焼き付いており復旧できない（610行中402行・3,332箇所）。旧本文で判読できた断片は waiting-critique / page coverage / Q-09 / Q-12 のみ。上記は [61]〜[71] と QUESTIONS.md の事実から再構成したものであり、旧本文の逐語復元ではない。[0]〜[60] 期の結論は各 spec/*.md と QUESTIONS.md を正本とする

## イテレーション記録（Log）

<!-- 新しいものを上に追記 -->
## [194] 2026-08-12 / Codex（P-3 R4 return allocation v2 authorityのowner承認最終化）

- owner承認: v4 design SHA-256 `8c4fb215a0a3ead792fc3742eb336d45c9517501b40fcb5e59f1d807993d2313`を採用し、2/10/12/0/4/0の28 target完全分割、hero-laurelのsequence 3単独所有、v5 return plan／protocol v2／journal v2束縛だけを最終化する権限を受けた。role packet、delivery／launch、implementation、browser/Figma測定、P-11解除は承認範囲外である。
- 記録: coordinator-only append-only root `C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/return-authority/v4/c5ec0969c8e5882d51b4d966124f87557138bf1725315fa8b42cd368e1131cad/`へA/B byte-identical `p3-role-handoff-protocol/v2` 2件（SHA-256 `a4c0202ee603ea63c4a5d05f35bdda0944305a20ab756358740ba692a8499919`）と、baseline/current非runtime authority 2件、finalization reportを生成した。`ownerApproved:true`の記録時刻は`2026-08-12T17:10:13.094Z`である。
- 境界: 新recordは`runtimeEligible:false`、packet status `NOT_CREATED`、delivery status `NOT_AUTHORIZED`であり、opaque handoff ID、packet manifest、attachment hash、identityLeakScan、concrete return planを持たない。既存R3 v1 protocol／registryは凍結hash鎖を守るため置換せず、historical recordのまま保持した。
- 検証: 28 targetの完全分割・laurelのseq3一意・protocolのA/B byte一致・全execution boundary falseを検証した。既存v1 protocol `a42c289…`、registry `138f235…`、ledger `2986f5b…`、pair lock `fd5ba36…`、A/B active state、P11 `f86935…`はいずれも不変であり、A/B `site/`、packet manifest／stagingは未作成である。

## [176] 2026-08-11 / Codex（ownerのattachment-only採用判断をpair draftへ反映）

- 記録先: baseline/currentの`records/owner-approval-packet.md`へ、ownerが残存リスクを理解してattachment-onlyを採ると決定したこと、許可範囲はfinal inputとpair固有owner recordの準備のみであること、禁止範囲は`ownerApproved:true`、Decision J採用、pair-readiness／pair-begin／pair-preflight、role配布、実装、Figma測定、P-11認可であることをA/B同一文で追記した。
- 検証: A/B byte-identical、SHA-256 `f5b2b29610d98d90e7c3d600dbec35d87d895ff6b1c2625b696d23611392c2ba`。front matterは`status: draft`、実際の`ownerApproved: true` fieldは不在、pair-beginは許可しない文を確認した。

## [177] 2026-08-11 / Codex（attachment-only最終入力のsource-only Figma照合）

- 読取: Figma file `KkBHUa1mNd6CiOKXNpSqAS` のPC first view `2153:21934`、SP first view `2153:22335`、PC header `2153:21981` のdesign contextを取得した。SP first view内のheaderは `2585:30331` として同時に確認した。
- 境界: 取得はsource metadata／design contextと短命asset URLの照合だけである。reference cropのexport、asset bytesの保存、mask／thresholdの実測、figma-gate、browser、pair lifecycle、role配布、実装は行っていない。
- 状態: URLとasset byte hashはowner承認済みpreflightの直前に再取得・固定する必要があるため、今回の読取をfinal evidence又はowner承認へ読み替えない。残る最終入力はfresh crop／asset／mask・threshold、11入力sidecar、独立component／page coverage review、4 contextとowner運用申告、各pair固有recordである。

## [178] 2026-08-11 / Codex（PC HeaderのFigma source-only node ID更新）

- 更新: baseline/currentの`nodemap-open-service-top-hero-v1.draft.json`で、旧`0:*`だったPC Header子ノード12件を、fresh design context由来の`I2153:21981;1836:*` INSTANCE IDへA/B同一で置換した。対象はtitle、container、navigation、3 nav button、CTA、2 CTA button、logo set、ellipse、logo本体である。
- 不変: 各子ノードの`status: "figma-only"`と独立Header INSTANCE review待ちの理由、全draft status、selector、asset binding、gate／record／lifecycle状態は変更していない。SP node IDとmapping Markdownには変更不要だった。
- 検証: 両JSON parse PASS、inventory 12件・nodes 12件、旧ID 0件、`figma-only`以外 0件、A/B byte-identical、SHA-256 `e937dc5cb07009e9cdbaa7570c8853f2e8ab146d081562fb6f8edbbf6d72b864`。Figma測定、owner承認、pair lifecycle、role配布、実装は未実行。

## [179] 2026-08-11 / Codex（node map更新に伴うdraft hash参照の同期）

- 更新: 同じnode map SHA-256を持つA/Bの`p3-decision-j-input`と、baseline/current各`fidelity-comparison` draftのnodeMap参照5箇所を`e937dc5cb07009e9cdbaa7570c8853f2e8ab146d081562fb6f8edbbf6d72b864`へ同期した。
- 検証: 4 JSON parse PASS、旧hash参照0件。共通`p3-decision-j-input`はA/B byte-identical、SHA-256 `b8e86d4e005e18d0608a947ed64940d258a5823fc6f96d0cf1191036e16c231e`。すべてdraftの入力参照更新のみであり、owner承認、runtime record、preflight、pair lifecycle、role配布、実装、Figma測定は未実行。

## [180] 2026-08-11 / Codex（PC Header reference cropのsource export寸法を確定）

- 読取: Figma source exportの`2153:21981`は、natural size `1440x121`を返した。draftにあった1440x121 exportと一致し、metadata boundの1440x64はexported reference cropの寸法を決めないことを確認した。
- 更新: A/Bの`reference-crops` draftの注記をsource exportの事実とpreflight直前の再export／再hash要件へ置換し、A/B byte-identical SHA-256 `5f66d06744074b1ec97d7a9aa406dc27ca4398a6d6beef9f875ba89f42d269e6`を得た。A/Bの`p3-decision-j-input`のreferenceCrops hashも同期し、A/B共通SHA-256は`52aea19d3fc8dc8991684c51e1b1211add25654430ea8ec47d53fe4027536642`となった。
- 不変: 出力PNGの保存、crop hashの最終化、mask／thresholdの測定、gate／browser、owner承認、pair lifecycle、role配布、実装は未実行。

## [181] 2026-08-11 / Codex（fresh Figma source export・asset hash固定）

- 取得・固定: Figma file `KkBHUa1mNd6CiOKXNpSqAS` のPC/SP root・first view・headerについて、capture `20260811T023327Z-07b2fcb5021a` を新規取得した。6 export、6 metadata、6 design context、plan-bound raw asset 26件をfresh-gate evidenceへ保存し、manifest SHA-256は`3bf9e9b787e7f192f74a3d6ab34d3680e400851eff5da324c53518c63fe04c36`。短命asset URLは保存していない。
- 同期・検証: 26件のasset bytesをfresh download後に再hashし、いずれも直前の凍結値と一致した。node evidence、asset binding plan、reference crops、gate、components、Decision J input、pre-implementation proofおよびcondition別fidelity draftのsource参照を同captureへ更新した。fresh batchと更新対象のA/B共有draftはbyte-identicalである。
- 境界: 全更新はdraft source evidenceのみであり、mask／threshold、`figma-gate`、browser/Figma比較測定、`ownerApproved:true`、Decision J採用、pair lifecycle、role配布、実装、P-11認可は変更又は開始していない。

## [182] 2026-08-11 / Codex（P-3 source-only残務のdraft整備）

- 更新: fresh design context由来のTEXT 32件（PC/SPの行境界、U+200B、nested node ID）をA/B共通node mapへ追記し、spec／components／mappingと直接SHA参照を同期した。metadataとdesign contextのlead表記不一致、PC/SPのsuffix差は未解決のsource conflictとして残し、selector mapping、Header独立review、owner値を変更していない。SP Headerのlayer source labelを`sp-header metadata`へ是正し、condition別fidelity draftのlayer hashを同期した。
- B限定: currentのhero asset provenanceをfresh manifest `3bf9e9b787e7f192f74a3d6ab34d3680e400851eff5da324c53518c63fe04c36`の26 raw assetへ再束縛し、raw実値に合わせSVG intrinsicの丸め差を訂正した。B draft SHA-256は`8fb5e52365d936fef21d1645dbc6d3f75b4e4aee1a2b3501c5bc3f7c8981c536`で、current change approvalの参照を同期した。
- 実測: A/B両worktreeでread-only `p3-evaluator-plan`を実行し、同一evaluator roots SHA-256 `9f2ff81287d3a8f2e3b04eb70e70278542f084330eb12d404e91fc0669ce1f9b`、execution bundle SHA-256 `c56f33c3706a78cd0f481e2e7cbef1728de9a47cf90cb887ecf67a199db0bc7d`を得た。既存baseline draftは同bundleと一致し、更新不要だった。
- 検証: A/B共通draft 12件のbyte一致、JSON parse、UTF-8 strict／U+FFFDなし、直接SHA参照、B-only approval参照、`ownerApproved:true` 0件、`.figma-gate/active.json`不在を確認した。Figma/browser比較測定、mask／threshold最終化、owner承認、pair lifecycle、role配布、実装、P-11認可は未実行。

## [183] 2026-08-11 / Claude（Anthropic）独立監査（P-3 R1実在値の代行可否）

- 根拠: 添付`C:\Users\tane1\.codex\attachments\bee698ef-2e7b-44e6-9ae0-5b41560819a2\pasted-text.txt`、SHA-256 `17bae0e2195135262c0df53ce9128b328a1cf1ac3d7c0af64956eb1b66e483d4`。
- 判定: R1はownerが与える実在値だけでBLOCKED。baseline/current各workspaceId、implementation actor/context、review actor/context、Header/page coverage reviewer actor/context、attachment-onlyの2運用申告は既存recordから一意に導出できず、Codexが仮名・UUID・path名で代入してはならない。
- 自動導出: ownerが両workspaceIdを入力後、相互`otherWorkspaceId`とgateのcondition-specific implementation actor/contextはCodexが機械反映する。registryの4 slot×4 placeholderはrole delivery時のcoordinator生成物であり、owner入力ではない。P-11はBLOCKEDのままである。
- 不変: ownerApproved、Decision J採用、pair lifecycle、role配布、実装、browser/Figma測定、P-11観測は開始していない。

## [184] 2026-08-11 / Codex（P-3 R1 owner確定値・attachment-only運用申告のdraft転記）

- 転記: owner指定のbaseline/current workspaceId、implementation／review actor・contextId、相互`otherWorkspaceId`を、Decision J input／owner-J scaffold／condition別clean-room／condition別fidelity runDraftへ整合して反映した。4 contextIdは相異であり、Header／page coverageにはreviewer actor・contextIdだけを反映した。
- 運用申告: owner提供のpeer artifact非提供・非参照手続と、role別の空`CODEX_HOME`／起動時目視確認手続を、A/B byte-identicalの`records/owner-approval-packet.md`へ逐語記録した。canonical `isolationMechanism`は変更せず、P-11をPASS又は機械証明へ読み替えていない。
- 検証: A/B計51 JSON parse、2 workspaceの相異、相互otherWorkspaceId、4 contextIdの相異、reviewer/implementation分離、共有record byte一致、component decision hash参照、draft／`ownerApproved:false`、P-11 BLOCKED／NOT_AUTHORIZED不変を独立再検証した。shared gateは両copy同一のまま条件別identity placeholderを維持している。
- 不変: Headerの`independentApproved:false`、両reviewの日時・final hash、Decision J採用、non-draft凍結、pair lifecycle、role配布、実装、browser/Figma測定は未実施。次の実作業はR2の独立review実施記録であり、Headerのclean worktree検索と非draft review evidenceが必要である。

## [185] 2026-08-11 / Codex（P-3 Header component decisionの独立review記録）

- 実測: baseline/currentの凍結HEAD `5e43b1e1d5edfa15ffa889c742726017d4b13a88`、tree `aab448dc9ac9cb16a726281d0f392f5ac0ccea09`、clean worktreeを確認した。`header`、`<nav>`、`navbar`、`site-header`、`globalnav`、`gnav`、`masthead`、`toolbar`の8語を各conditionの追跡HEADへ検索し、全16検索はexit 1／候補0件だった。検索範囲は凍結commitの追跡ファイルのみであり、未追跡ファイルと`MyBrain/`資料は候補に含めない。
- 記録: Header decisionを`new`妥当として独立review済みに更新し、`independentApproved:true`、reviewer `claude`／`p3-osth-v1-ctx-header-review`、`reviewedAt: 2026-08-11T13:50:54+09:00`をA/B同一draftへ転記した。component searchは`draft-executed`としてbaseline/current各1件の検索証跡を記録し、review Markdownも実施済み結論へ置換した。
- 参照: component decision SHA-256 `a96c02f48f621201c3aecd1df14a80138bc520cfbc881ddf84045a1ddd59d9ce`をbaseline/current fidelity draftのcomponent decision input参照へ同期した。A/B共有のsearch／decision／review文書はbyte-identicalである。
- 境界: これはHeader component decisionだけのdraft review recordである。`ownerApproved:false`、shared gate draft、P-11 BLOCKED／NOT_AUTHORIZED、page coverage review、Decision J採用、non-draft凍結、pair lifecycle、role配布、実装、browser/Figma測定は変更又は開始していない。

## [186] 2026-08-11 / Codex（P-3 page coverage final review前のscope確定待ち）

- 判定: page coverageをruntimeへ接続するnon-draft recordへ凍結するには、ownerがfinal pair scopeを採用する必要がある。現draftは`pairIdCandidate`であり、`figma.finalCanonicalRootNodeId`、exact pairId、source snapshot、28 changeTargets／6 checkpointsのscope、B-only improvementの採否は最終owner決定ではない。
- 準備済み: R1のcondition identityから、final gateのbaseline implementation `codex`／`p3-osth-v1-ctx-a-impl`とcurrent implementation `codex`／`p3-osth-v1-ctx-b-impl`は機械導出できる。page coverageはscope採用後、A/B non-draft sidecarへ凍結し、SHA-256を固定してからClaudeのpage coverage review recordへ渡す。
- 不変: fresh Figma asset／crop／mask／thresholdの定例再取得は必要条件ではない。P-11はattachment-only方針下でBLOCKED／NOT_AUTHORIZEDのまま。owner scope決定、page coverage review、final input凍結、Decision J採用、pair lifecycle、role配布、実装、測定は未実施。

## [187] 2026-08-11 / Codex（P-3 R3 scope採用・page coverage non-runtime sidecar凍結）

- owner scope: pairId `open-service-top-hero-v1-20260809`、source commit `5e43b1e1d5edfa15ffa889c742726017d4b13a88`／tree `aab448dc9ac9cb16a726281d0f392f5ac0ccea09`、現28 changeTargets／6 checkpoints、B-only `hero-asset-provenance-and-responsive-geometry`、R1 attachment-only planを採用した。canonical rootはPC `2153:21702`、SP `2153:22332`はresponsive counterpartとしてdraft decision input／owner-J scaffold／owner packetへ記録した。
- 凍結: A/B同一のnon-runtime `MyBrain/verify/page-coverage-open-service-top-hero-v1.json`を作成し、SHA-256 `c7b2093748497b6a79ef9f710c8dcf7060ce1b6947f94d168b20e6061606d367`（5,897 bytes）を固定した。sidecar基準のPC/SP metadataPathと宣言SHAは実体と一致する。
- 検証: 4対象のA/B byte一致、sidecar JSON parse、draftとの差分がstatusとmetadataPathだけであること、scope入力の一致、`ownerApproved:false`、Decision J未生成、P-11 BLOCKED／NOT_AUTHORIZED、lifecycle未開始を確認した。独立read-only監査もPASSした。
- 次: `claude`／`p3-osth-v1-ctx-pagecov-review`によるpage coverage独立reviewが、このSHAと実施時刻を持つnon-draft review recordを作成する。owner approval、Decision J、pair lifecycle、role配布、実装、browser/Figma測定は依然開始しない。

## [188] 2026-08-11 / Codex（P-3 page coverage独立review recordの固定）

- 根拠: Claude（Anthropic）の独立review PASS。添付`C:\\Users\\tane1\\.codex\\attachments\\88a36181-8bbf-436a-b240-6ab55cd751be\\pasted-text.txt`。
- 記録: baseline/currentの`MyBrain/verify/page-coverage-review-open-service-top-hero-v1.json`をA/B同一で作成し、`status:"approved"`、reviewer `claude`／`p3-osth-v1-ctx-pagecov-review`、`reviewedAt:"2026-08-11T15:36:59+09:00"`、sidecar SHA-256 `c7b2093748497b6a79ef9f710c8dcf7060ce1b6947f94d168b20e6061606d367`を束縛した。review record SHA-256は`827f688b545fc4f600f81fcb63e7b691c0e41c2fa262c70b7980050d4fb8bcc1`。
- 検証: review後もsidecarのbytes／SHA-256は不変であり、metadata roots実体・hash、review recordのA/B byte一致、reviewer／implementation分離を確認した。
- 境界: page coverage reviewの記録だけである。`ownerApproved:true`、Decision J、final gate、clean-room evidence、pair lifecycle、role配布、実装、browser/Figma測定、P-11は変更又は開始していない。

## [189] 2026-08-11 / Codex（P-3保存済みfresh asset evidenceへの整合）

- 是正: 短命Figma URLの再取得・保存を要求する残存draft文言を、redactedの保存済みfresh manifest SHA-256 `3bf9e9b787e7f192f74a3d6ab34d3680e400851eff5da324c53518c63fe04c36`のbyte固定とnon-draft freezeへ統一した。対象はasset plan、reference crops、gate、node evidence、Decision J input、pre-implementation proof、condition別fidelity、READMEであり、直接SHA参照を追従した。
- 検証: A/B共有artifactのbyte一致、JSON 14件parse、manifest参照、直接SHA伝播、draft guard、`ownerApproved:false`、Node／Chromeのfinal-freeze placeholder不変を確認した。
- 境界: URLの再取得・保存、browser/Figma測定、non-draft昇格、owner承認、Decision J、pair lifecycle、role配布、実装、P-11はいずれも実行していない。

## [193] 2026-08-12 / Claude（Anthropic）独立再提出監査（P-3 R4 v13 lifecycle・R3再束縛・return v5）

- 根拠: 添付`C:\\Users\\tane1\\.codex\\attachments\\e15d3728-e5b2-42c6-8576-23e40e986130\\pasted-text.txt`。
- 判定: R3 final record・sidecar再束縛 **PASS**、v12→v13 lifecycle移行 **PASS**、return v5 helper実装 **PASS**。R4 role packet作成は、candidate-only v4 designをowner承認済みfinal v2 authorityへ昇格するまで **CONDITIONAL**。
- 実測: fresh manifest修復後の15 non-draft sidecar、Decision J・preImplementationProof・evaluator baseline・A/B clean-room evidence・current B-only approvalのhash鎖、v13 contract、fixed ledgerのstarted／A/B preflight-recorded、pair lock v5、A/B active state v5を整合と判定した。ledgerの`contractSha256`はfile-byte hashではなく`stableHash(raw)`であることを明記した。
- 境界: role packet、role delivery／launch、implementation、browser／Figma測定、P-11解除は開始していない。live protocol v1とcandidate-only v4を混同せず、final v2 authorityのowner承認後だけpacket作成へ進む。
- 是正: runtime非束縛のP-3手順文書だけをcomparison contract v13／active state v5へ同期する。final record、contract、lifecycle、role authorityは変更しない。

## [192] 2026-08-12 / Claude（Anthropic）独立追補確認（P-3 v11 E2E被覆復元）

- 根拠: 添付`C:\\Users\\tane1\\.codex\\attachments\\ffa0eefd-d42c-4c49-9812-c5c83aa02133\\pasted-text.txt`、SHA-256 `e61b773620d816dc8d63b4dfbee4b1026994587b7116d4a6831bda19663ec822`。
- 判定: **PASS**。HIGH-1（draft guard負E2E消失）とMEDIUM-1（release-check正負経路不足）はともに解消し、新規HIGH/MEDIUMはない。
- 実測: generic／baseline／currentの`figma-gate.e2e.mjs`はbyte-identical、SHA-256 `16ce37900f215427b5eedcfc15cbc0f618338d1d9840595d78358b8265483732`、各`PASS (135 assertions)`。preflight失敗後のactive state／page-coverage runtime不在、後続phaseとrelease-check失敗後のstate／runtime／record不変、disposable test double経由のrelease record `pending → passed`を確認した。
- 不変: v11 coreの`figma-gate.mjs`、`figma-page-coverage.mjs`、`fidelity-benchmark.mjs`は批評時freeze SHA-256のまま。Chrome/CDP、Figma、P-11、role、pair lifecycleは起動していない。
- LOW-1: 外部追補確認依頼のSHA-256転記が63桁だっただけであり、[191]と本項では64桁の実測値を記録した。成果物への修正は不要。
- 境界: `ownerApproved:true`、Decision J採用、pair-begin、role配布、実装、browser/Figma測定、P-11認可は開始していない。

## [191] 2026-08-12 / Codex（P-3 v11 E2E被覆の復元）

- 根拠: Claude（Anthropic）の実装後独立追補批評は、v11契約の4保証を条件付きPASSとした一方、`figma-gate.e2e.mjs`の大規模置換によりdraft guard負E2Eとrelease-check被覆が失われたHIGH-1／MEDIUM-1を指摘した。添付`C:\\Users\\tane1\\.codex\\attachments\\41a7e15b-9670-4040-9e28-747b3444cc39\\pasted-text.txt`、SHA-256 `fd4bc19d4d1a3d8b185d83a42d55da81ff65144626f9735eb8d178e94bb6c068`。
- 修復: `figma-gate.e2e.mjs`だけを復元した。v11のpreflight identity flagsを使い、manifest `_draftOnly`、spec `status:draft`、component `draftOnly`、accessibilityの完全／前方一致`OWNER_INPUT_REQUIRED`、予約`p3-drafts` path、checkpoint plan配列placeholderをpreflightで拒否する。失敗後はactive stateとpage-coverage runtimeが未作成であることを固定した。section-start／checkpoint／close／release-checkの後続phaseでは同じdraft guardを実行し、既存state/runtimeがbyte不変であることを固定した。
- release-check: disposable `gate-browser-batch.mjs` test doubleにより、draft release record拒否とvalid pending release recordの`status:"passed"`遷移をCLIで検証した。実ブラウザ、Figma、P-11、pair lifecycle、role配布は起動していない。
- 検証: template、baseline、currentの各E2Eは`figma-gate.e2e: PASS (135 assertions)`。各copyの`node --check`もPASSし、3 copyのSHA-256は`16ce37900f215427b5eedcfc15cbc0f618338d1d9840595d78358b8265483732`でbyte-identical。v11 coreの`figma-gate.mjs`、`figma-page-coverage.mjs`、`fidelity-benchmark.mjs`は未編集で、それぞれ`8c8dab…e2123`、`62b5e9…2505`、`5e837c…a67f`を維持した。
- 不変: `ownerApproved:true`、Decision J採用、non-draft contract、pair lifecycle、role配布、実装、browser/Figma測定、P-11認可は開始していない。修復差分だけの独立追補確認を残す。

## [190] 2026-08-11 / Codex（P-3 comparison contract v11の循環是正）

- 根拠: Claude（Anthropic）の独立設計批評は、shared gateにcondition固有identityを含める矛盾と、Decision J前にfinal batch由来Chrome実値を要求する循環を確認し、v11是正を支持した。添付`C:\\Users\\tane1\\.codex\\attachments\\0d033c52-bceb-4fae-a95a-53ef8b3e2e62\\pasted-text.txt`、SHA-256 `30006ac87c2addc20d37305e0851904aa25a298ab4cfbb0f30776ac4aa36519f`。
- 是正: shared gateからimplementation identityを除き、preflightだけがcondition別`run.implementation`をflagで受け、active state v3とpage-coverage runtime v2へ固定する方式に変更した。後続phaseのflag、identity欠落旧state、manifestへのidentity再混入をfail-closedで拒否する。Chromeはsharedの閉じた`CDP Browser.getVersion` policyだけをDecision Jへ束縛し、実値はcondition-local final batch fingerprintとしてcondition内・A/B間の一致を検査する。
- 同期: packet／return／probeと関連templateはv11のみを受理し、v10はmigrationなしで拒否する。A/B draft、evaluator roots／bundle、Decision J input、handoff文書、正本templateをv11へ同期した。B-2としてpilot中のChrome更新停止とcurrent最初のcheckpointでの早期fingerprint照合をprotocol §6へ記録した。
- 実測: `figma-gate` E2E 24 assertion、v11 pure fixture 19 assertion、full fidelity E2E、packet／return／probe E2E、syntax／JSON parseがPASS。最終内部監査はHIGH/MEDIUM/LOW 0件。core SHA-256はgate `8c8dab70292af4476134bdb8eafcd34c5f2f53199e3d16eb21accd00885e2123`、page coverage `62b5e9b8053573e20b930cfad660b7f001e0616dc30f309fd3b0ab7d6b582505`、benchmark `5e837c2390aeb34baae90c10171e840ab8487ddd71e74460ec8a0f20f788a67f`。
- 境界: P-11は`NOT_AUTHORIZED`／BLOCKEDのまま。`ownerApproved:true`、Decision J採用、final non-draft contract、pair lifecycle、role配布、実装、browser/Figma測定は開始していない。

## [175] 2026-08-11 / owner判断（P-3 attachment-onlyを採る）

- 決定: ownerは、P-11が`NOT_AUTHORIZED`／BLOCKEDであり、attachment-onlyではP-7/P-9/P-10/P-12のfilesystem観測を含めず、peer artifactを提供・参照させないことがowner運用申告に留まる残存リスクを理解したうえで、非公開P-3 pilotにattachment-only境界を採ると回答した。
- 範囲: この判断は最終入力とpair固有owner recordの準備を許可する。`ownerApproved:true`、Decision J採用、pair-begin、role配布、実装、Figma測定、P-11認可は許可しない。

## [174] 2026-08-11 / Claude（Anthropic）独立差分確認（attachment-only確認6：PASS）

- 根拠: 添付`C:\Users\tane1\.codex\attachments\6373c71a-dfab-44ac-8cea-58463b7d3a72\pasted-text.txt`、SHA-256 `ca86db20f49286116d93ccef7ba6b2642dcca03632ed9602ff211b155a1fc82a`。前回FAILの唯一の理由だったowner approval packetの引用とrecordの不一致は解消し、新たなFAILはないと判定された。
- 実測: A/B packetの引用はrecordの`isolationMechanism`とbyte一致し、UTF-8 587 bytes。14箇所の`isolationMechanism`全一致、禁止語0件、A/B packet byte-identical、SHA-256 `a8d60df37aea840f2358f4e904c1d5878b9587e27388470109f3a6fa227ec547`。P-11はexit 1／`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`のままである。
- 状態: ownerへattachment-onlyの残存リスクについて「採る」又は「停止」を尋ねられる段階になった。この記録はP-11認可、`ownerApproved:true`、Decision J採用、pair-begin、role配布、実装、Figma測定の許可ではない。

## [173] 2026-08-11 / Codex（attachment-only owner提示文のbyte一致是正）

- 根拠: Claude（Anthropic）の添付`C:\Users\tane1\.codex\attachments\7b11ed15-7d63-4fcb-b8fe-ff29cbf96466\pasted-text.txt`、SHA-256 `efb0ad382d7edfc3296d56d30704d437ed66a5465b9da65340fbed0a991967de`。判定はFAILだが、未達はowner approval packetが提示する文とrecordの`isolationMechanism`がbyte一致しない一点だけであり、A/B同一の当該packetのみを是正するよう指示された。
- 是正: baseline/currentの`owner-approval-packet.md`で、ownerが読む引用をrecordの587-byte `isolationMechanism`文字列へ完全置換し、説明も「A/BのcontractとDecision Jで完全に同一」とした。packet引用とrecord文字列のbyte一致、UTF-8 587 bytes、14箇所の`isolationMechanism`全一致、禁止語0件、A/B packet byte-identicalを確認した。新しいA/B packet SHA-256は`a8d60df37aea840f2358f4e904c1d5878b9587e27388470109f3a6fa227ec547`。
- 不変: P3-CLEAN-ROOM-PROTOCOL、p3-role-packet、handoff protocol／registry、P-11 blocked recordは前回確認SHAのまま。P-11認可、ownerApproved、pair lifecycle、role配布、実装、Figma測定は開始していない。

## [172] 2026-08-11 / Codex（P-3 Current欄のP-11開始条件をattachment-only方針へ整合）

- 修正: Current欄に残っていた「P-11未認可の間は`ownerApproved:true`・pair-beginへ進めない」という旧来の一律表現を、[170]・[171]と整合するattachment-only限定の記述へ置換した。P-11をPASS又は技術的隔離へ読み替えず、post-change別ベンダー独立確認とownerによる残存リスクの採否までは開始しない。
- 境界: P-3 runtime、pair固有draft以外のrecord、P-11 helper、ownerApproved、pair lifecycle、role配布、実装、Figma測定は変更又は開始していない。

## [171] 2026-08-11 / Codex（P-3 attachment-only移行条件1〜6のdraft反映・独立確認待ち）

- 根拠: Claude（Anthropic）の添付`C:\Users\tane1\.codex\attachments\0924b2b8-acac-4bbe-8785-636c17c1752b\pasted-text.txt`、SHA-256 `253b043a7adc143541bff9ddb1a5a8895dbb462bf298dc926de407bfda7b150e`（13,538 bytes）。判定は **PASS（attachment-onlyへ移行可能）** だが、owner承認前の最小条件7件を要求する。本記録は条件1〜6のdraft準備であり、owner承認又はP-11認可ではない。
- 条件1〜2: `P3-CLEAN-ROOM-PROTOCOL.md`へ、P-11 FAIL記録はattachment-only開始の禁止ではなく、FAILをPASS又は技術的隔離に扱うことだけを禁止する文を追加した。attachment-onlyではP-7/P-9/P-10/P-12 filesystem probeを観測・PASS計上しないことを明記した。`p3-role-packet.mjs`は`STATE.md`を禁止path classに追加し、path／logical path／USTAR entryの負E2Eを追加した。
- 条件3〜4: baseline/currentのfidelity comparison draft、Decision J draft、Decision J input draft、condition clean-room evidence draftの14個の`isolationMechanism`を同一文字列（SHA-256 `f846779fe10d27977397efb204e20e5178a51d44133940826606e9d061fe93f7`）へ統一した。文はP-11 BLOCKED、machine-attestedではないtool surface、owner操作によるMCP／connector／plugin無効化、peer artifactを提供・参照させないowner申告、`otherConditionArtifactsAccessible:false`がreachability measurementではないことを明記し、`OS-enforced`／`guarantees`／`cannot access`を含まない。
- 条件5〜6: A/B byte-identicalの`records/p3-p11-blocked-open-service-top-hero-v1.draft.json`をcoordinator-only／role入力禁止として追加した。逐語FAILはexit 1、`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`、UTF-8 211 bytes、SHA-256 `ec2d99f410ea6bd203ab976734cacd58b665345065e5714bff15a3f5630bed5a`である。A/B owner approval packetへ、P-11未証明、attachment-onlyでfilesystem probeを失うこと、peer非参照はowner申告であることを承認前に理解する3条件と、停止／採用の選択を追加した。A/B protocol／registry／READMEをattachment-onlyへ同期し、P-11 recordとattachment manifest＋`p3-role-packet --check`をcoordinator-only要件にした。
- 検証: `node --check`×2、generic JSON template parse、`node templates/verify/p3-role-packet.e2e.mjs`はPASS。A/BのREADME、handoff protocol、handoff registry、P-11 blocked record、owner packetはbyte-identical。14 JSONはparse／strict UTF-8／U+FFFD=0、`draftOnly:true`／`status:"draft"`／`ownerApproved:false`、registry executionState全falseを確認した。`node templates/verify/p3-clean-room-probe.mjs --require-p11-authorization`は引き続きexit 1／`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`。P-3 runtime coreは変更していない。
- 境界: final runtime record、ownerApproved:true、pair-begin、pair-preflight、role配布、実装、Figma測定を開始していない。Claude条件7の機械検証はfinal non-draft inputとpair開始前に改めて満たす。次はこの差分の別ベンダー独立確認である。

## [170] 2026-08-11 / Claude（Anthropic）独立批評（P-3 P-11停止判断：BLOCKED）

- 根拠: 添付`C:\Users\tane1\.codex\attachments\3b2ed208-c111-4543-99f1-83f1310cd4f0\pasted-text.txt`、SHA-256 `60b30c3bc8c554f9c2a79edc3d27e91c32897b1be58b75194d943448e89f1053`（14,707 bytes）。Claudeはコード・設定・P-3 recordを編集せず、real `CODEX_HOME`、App Server、pair lifecycle、role配布、実装、実Figma測定を実行していない。
- 判定: **BLOCKED（現行公開APIでは不可能）**。決定的理由はtimeout回数ではなく、観測が完成しても`p3-p11-app-server-spike.mjs`が`NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API`を無条件に理由へ積み、`NOT_AUTHORIZED`を返す構造にある。現行公開APIは同一thread／turnに束縛された完全なmodel-visible tool surfaceをatomicに返さないため、P-11を認可できない。`--require-p11-authorization`のexit 1は維持する。
- 停止: 同一方式・同一real `CODEX_HOME`の三回目以降の観測、新たなtimeout対策、同対策の追加回帰試験を行わない。新しい明示許可だけではこの停止を解除しない。[168]／[169]のreceiptと保全済み証跡は保持し、P-7／P-9／P-10／P-12はP-11とは独立に維持する。
- 将来P-11を再開する条件: 単一thread／turnに束縛された公開APIが、(1) MCP、built-in、dynamic、plugin/app、trusted project由来を全て含む完全surface snapshotとsnapshotId、(2) server-attested processInstanceId、(3) entryごとのorigin、(4) entryごとのenabled/callable、(5)完全paginationと終端、(6)turn開始時snapshotとのatomic bindingを返すこと。又は(7)全tool classに共通し副作用なく、不在／無効をnetwork failure・timeout・引数errorと区別する安定否認codeを返すこと。いずれも満たされない限りP-11を再開しない。
- P-3の扱い: P-11 blockedだけではP-3全体を停止しない。ownerがattachment-only role、MCP／connector／pluginのowner操作による無効化、他condition artifactを提供・参照させないowner運用申告を、機械証明でない残存リスクとして明記したうえで採るかを判断する。`isolationMechanism`に`OS-enforced`、`guarantees`、`cannot access`を記さない。owner判断前に`ownerApproved:true`、pair-begin、role配布、実装、実Figma測定を開始しない。

## [169] 2026-08-11 / Codex（P-11 real `CODEX_HOME` coordinator-only再観測：overall deadline timeout receipt）

- 実行: ユーザーの新しい一回限りの明示許可の下、新規run `C:\Users\tane1\AppData\Local\p3-p11-coordinator\20260811T075038Z-481f33cd1647\`で公開supervisorを一回だけ起動した。candidateだけがreal `C:\Users\tane1\.codex`／`real-profile`、MCP／plugin-app／project trusted／project untrustedの4 controlは別々のempty disposable profile、全launchは`read-only`、`timeoutMs:30000`、`overallTimeoutMs:360000`である。元plan SHA-256は`980a5b5449722d7e0da013b50b35f90b296cee2ae5c83bd791df2d3e1b639157`である。
- 結果: 360秒でdeadlineがexpiredとなり、supervisorはworker PID `45988`だけへ`taskkill /PID /T /F`を実行した。taskkill exit codeは0、worker closeはexit 1、cleanupはconfirmedである。reportは存在せず、partial raw transportを読み出し・解析・成功扱いにしていない。timeout receiptは2,379 bytes／SHA-256 `50e389bc1f15d33f1cbb027eba5b10af7e89c54e96bb4a295abacc11cd6943bb`、`feasibilityOnly:true`、`p11Authorization:"NOT_AUTHORIZED"`、`report:{state:"not-used-after-timeout"}`である。
- 照合: frozen worker planは5,296 bytes／SHA-256 `f68505f0d3cc5ed315c94e1c96f1989540a694b238b143633ea686fac6c56fcb`でreceipt記載値と一致し、canonical stable-plan SHA-256 `5c77332d721497f7e4102bc6bd7487161b5e40dd62e0c786fd40f17b7af486b5`も一致した。観測target treeの全PIDとrun rootに紐づくhelper processは残存していない。pair lock、fixed ledger、source／baseline／current `.figma-gate/active.json`も不存在である。`--require-p11-authorization`は引き続きexit 1／`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`である。
- 境界: raw stdin／stdout／stderr／prelaunch本文は一切読んでいない。real profileの通常のsession/log side effectが無いとは主張しないが、profile設定の編集・cleanupはしていない。P-11は`NOT_AUTHORIZED`のままであり、owner承認、pair lifecycle、role配布、実装、実Figma測定を開始しない。timeout原因の根拠なしに再実行せず、再観測には新しい一回限りの明示許可が必要である。

## [168] 2026-08-11 / Codex（P-11 real `CODEX_HOME` coordinator-only観測：overall deadline timeout receipt）

- 実行: ユーザーの一回限りの明示許可の下、新規run `C:\Users\tane1\AppData\Local\p3-p11-coordinator\20260810T222315Z-65bc0c9a6adb\`で公開supervisorを一回だけ起動した。candidateだけがreal `C:\Users\tane1\.codex`／`real-profile`、MCP／plugin-app／project trusted／project untrustedの4 controlは別々のempty disposable profile、全launchは`read-only`、`timeoutMs:30000`、`overallTimeoutMs:360000`である。入力plan SHA-256は`acaece918fa4bad52c89cef6e2eccebaedb4e3cde05f150f32cde6877cbef38b`である。
- 結果: 360秒でdeadlineがexpiredとなり、supervisorはworker PID `43876`だけへ`taskkill /PID /T /F`を実行した。taskkill exit codeは0、worker closeはexit 1、cleanupはconfirmedである。reportは存在せず、partial raw transportを読み出し・解析・成功扱いにしていない。timeout receiptは2,379 bytes／SHA-256 `b2d8ad5bf515b61d366123c74b8c8011b506d944711002bf3b3a861bb7e5d9df`、`feasibilityOnly:true`、`p11Authorization:"NOT_AUTHORIZED"`、`report:{state:"not-used-after-timeout"}`である。
- 照合: frozen worker planは5,267 bytes／SHA-256 `4472a9b2a4aa22829498e557d09b44ab6aa44350f38709ef65b0635b3248c096`でreceipt記載値と一致し、canonical stable-plan SHA-256 `605c0f2be6f99f591925293f1b5bfac914aa2c1e8589b929bc8bfa7414484430`も一致した。run rootに紐づく`node.exe`／`codex.exe`とworker PIDは残存していない。pair lock、fixed ledger、baseline/current `.figma-gate/active.json`も不存在である。`--require-p11-authorization`は引き続きexit 1／`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`である。
- 境界: real profileの通常のsession/log side effectが無いとは主張しないが、profile設定の編集・cleanupはしていない。P-11は`NOT_AUTHORIZED`のままであり、owner承認、pair lifecycle、role配布、実装、実Figma測定を開始しない。timeout原因の根拠なしに再実行せず、再観測には新しい一回限りの明示許可が必要である。

## [167] 2026-08-11 / Codex（P-11 outer timeout：overall deadline・PID tree cleanup）

- 是正: 公開`--plan` CLIをsupervisor／workerへ分離し、RPCごとの`timeoutMs`とは別に`overallTimeoutMs`（省略時360,000ms）を導入した。supervisorはphysical root検査後に正規化planを`coordinatorOutputRoot`直下へexclusive freeze-copyし、workerには元planでなくfreeze copyだけを渡す。deadline時は自らspawnしたworker PIDだけをWindowsの`taskkill.exe /pid <pid> /t /f`へ固定引数で渡し、対象`close`も確認できた場合だけcleanupをconfirmedとする。image名・wildcard・shell・既存process探索は使わない。
- fail-closed: deadline時は`outputRoot`内のpartial report／raw transportを解析せず、`outputRoot`外の`coordinatorOutputRoot`直下へexclusive timeout receiptを作る。receiptは常に`feasibilityOnly:true`／`p11Authorization:"NOT_AUTHORIZED"`／`report:{state:"not-used-after-timeout"}`である。transportのEOF hangとpre-launch version command timeoutにも同じPID限定tree cleanupを適用し、freeze copy直後・receipt書込み後のphysical root再照合とreceipt readback hash／byte照合を加えた。
- 検証: disposable Node fixtureだけで、公開supervisorの通常完走、overall deadlineのworker→fixture→grandchild終了、EOF hangのchild tree終了、versionArgs hangのparent→grandchild終了、receipt readbackを固定した。`node templates/verify/p3-p11-app-server-spike.e2e.mjs`はPASS（87.8秒）。4 MJSの`node --check`、plan JSON parse、UTF-8 strict／U+FFFD=0、`node C:/AI/MyBrain/bootstrap.mjs --check`、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check`もPASSした。P-3 core 3件とclean-room probeの既知SHAは不変である。
- 境界: real `CODEX_HOME`／実App Serverは起動していない。`node templates/verify/p3-clean-room-probe.mjs --require-p11-authorization`は引き続きexit 1／`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`であり、P-11は`NOT_AUTHORIZED`のままである。実機再観測には新しい一回限りの明示許可が必要であり、owner承認、pair lifecycle、role配布、実装、実Figma測定は開始しない。

## [166] 2026-08-11 / Codex（P-11 outer timeout：raw stdout backpressure局所是正）

- 診断: [165]はcandidate artifactだけを残してreport前にouter 420秒timeoutとなった。raw本文を出力せずmetadataだけを調べた結果、stdoutは165,345,707 bytes、108完結JSONL行と3,342,336-byte未終端尾部、2MiB超の行44件であった。旧transportはstdin／stdout／stderrのartifact書込みを1本の`writeChain`に直列化し、stdout書込みbacklogの後に`send()`がstdin artifact書込みをawaitすると、RPC timeoutがresponse Promiseだけをrejectしても`send()`待ちが解けず、`runObservedLaunch()`のcatch／close／reportへ戻れない構造だった。
- 是正: transportをchannel別の順序書込み列へ分離し、stdout／stderrのtee待ちが後続stdin RPCを止めないようにした。capture終了時だけ3列すべてをjoinし、Windowsのchild cleanupは`exit`でなくstdioを含む`close`まで待つ。P-3 runtime core、clean-room probe、P-11 authorization経路は変更していない。
- 検証: disposable Node JSON-RPC fixtureでstdout artifact handleだけをgate停止し、1MiBの正常response後にgateを閉じたまま100ms deadlineの後続stdin RPCを送った。250ms以内にresponseが返り、旧共有列なら発生する`send()`待機を回帰として検出する。`node --check`（transport／spike／E2E）と`node templates/verify/p3-p11-app-server-spike.e2e.mjs`はPASS（74.3秒）。transport SHA-256 `9855237e18c46b41992b6b1e469accebef3565ac4839c0df31d4baf6abeb9158`、E2E `9299bac6de52a2e2b736bd782afe645ba725f2ecd5d27cbf2d92a85156a46ca7`、P-11文書 `126c0fd7b2f596ad56d49a2e2315e09b253bc95e91dda1fe225af21c0b054c44`、対象3件のU+FFFDは0である。
- 境界: real `CODEX_HOME`／App Serverは再起動していない。[165]のreport不在を成功又はP-11観測値へ読み替えない。`node templates/verify/p3-clean-room-probe.mjs --require-p11-authorization`はexit 1を維持し、P-11は`NOT_AUTHORIZED`のままである。実機再観測には新しい一回限りの明示許可が必要であり、この局所是正だけのためにClaudeへ追加批評は求めない。

## [165] 2026-08-11 / Codex（P-11 real `CODEX_HOME` coordinator-only再観測：outer timeout、report未生成）

- 実行: ユーザーの新しい一回限りの明示許可の下、`C:\Users\tane1\AppData\Local\p3-p11-coordinator\20260810T202054Z-35e1daac6436\`でhelperを一回起動した。candidateのみreal `C:\Users\tane1\.codex`／`real-profile`、4 controlは新規empty disposable profile、`sandboxProfile:"read-only"`である。起動wrapperは420秒でtimeoutし、`output/observation/p3-p11-app-server-spike-report.json`は生成されなかった。
- 証跡: outputにはplan（SHA-256 `1d5fd55c117fbbace98a02b57ae8e62fe52de00722f8b9c4da5ed451feafa5f0`）とpre-observation freeze（`d5f47071febd8a59a790c9133546dbc65b6dbf0b00b00afa022020375847a59d`）、candidate prelaunch（2,290 bytes／`f9c4a2423b27ea5d3c9a281c643e04fc908c20719e333956a8e296650dc1f976`）、raw stdin（6,610 bytes／`b6a08bdefd447b96bc76442703974e0b70d9c3cdc255a4041d690c363cbf4625`）、raw stdout（165,345,707 bytes／`da323a9ee3d426108a879243b3887f36afb7d06a1e35f3a128a4492b1db3654c`）、raw stderr（2,747 bytes／`6435a77353ae1a4ecee40820dcd1763dd99a2160babcf9efb6785e15b28b27a4`）が残る。raw本文は読まず、role attachment、P-3 runtime input、owner recordへ移していない。
- cleanup: timeout後、command lineと親子関係で当該runにのみ属するPID `41248`、`43844`、`37592`、`40624`を特定して停止した。4 PIDはすべて不存在となり、既存の別Codex processは停止していない。pair lock、fixed ledger、baseline/currentの`.figma-gate/active.json`も不存在である。
- 状態: reportが無いためcandidate thread、first inventory、tool surface、P-11 outcomeを今回のrunから判定しない。P-11は従来どおり`NOT_AUTHORIZED`である。P-3 core 3件とclean-room probeのSHA-256はfreeze値と一致し、pair lifecycle、role配布、実装、実Figma測定は開始していない。
- 次: real profileを再起動せず、outer timeout／report未生成をdisposable fixtureで局所診断する。再観測には別の明示許可が必要であり、Claudeへの追加批評はこの失敗記録だけのためには求めない。

## [164] 2026-08-11 / Codex（P-11 App Server：inventory前`CAPTURE_CHILD_EXIT_TIMEOUT`局所是正）

- 原因: [163]のcandidate captureは開始から30,005ms後に終了し、thread IDは存在する一方first inventoryはnullだった。`p3-p11-app-server-transport-capture.mjs`はspawn時点から`timeoutMs`でchildをkillしており、各RPCの個別deadlineとchild生存期間deadlineを混同していた。保存済みreportの順序はthread/start後にinventory要求・応答が進行中であり、server protocol拒否の証跡ではない。
- 是正: child exit/errorの監視は起動直後から維持しつつ、`CAPTURE_CHILD_EXIT_TIMEOUT`のdeadlineを`close()`の`stdin.end()`後にだけ開始するよう局所変更した。個別RPC timeoutとunexpected child exitはfail-closedのまま維持する。P-3 runtime core、clean-room probe、P-11の`NOT_AUTHORIZED`定数・authorization経路は変更していない。
- 検証: `node --check`（transport／spike E2E／spike）PASS。使い捨てJSON-RPC fixtureだけで`node templates/verify/p3-p11-app-server-spike.e2e.mjs` PASS（61.7秒）。総観測時間がlaunch timeoutを超えても各RPCが期限内ならthread-bound first inventoryまで成功する経路と、stdin EOF後も終了しないchildがclose時に`CAPTURE_CHILD_EXIT_TIMEOUT`で停止する負経路を追加した。transport SHA-256 `27e5192095a0e306502733b2730459f360daff32c86906f3edc4850e4f9e227b`、E2E SHA-256 `fba5fe74995035fe8d36e0bfaebc4d9d75e0dbe000c6c391d80170c7fba926b0`、対象2件のU+FFFDは0である。
- 境界: real `CODEX_HOME`／App Serverは再起動していない。`node templates/verify/p3-clean-room-probe.mjs --require-p11-authorization`は`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`でFAILを維持する。実機でのinventory到達を確認するには新しい一回限りの明示許可が必要であり、P-11認可、owner承認、pair lifecycle、role配布、実装、実Figma測定を開始しない。

## [163] 2026-08-11 / Codex（P-11 real `CODEX_HOME` coordinator-only再観測：`read-only`受理、inventory前timeout）

- 実行: ユーザーの新しい一回限りの明示許可の下、`C:\Users\tane1\AppData\Local\p3-p11-coordinator\20260810T195314Z-ee95eeb37c6e\`でhelperを1回実行した。candidateのみreal `C:\Users\tane1\.codex`／`real-profile`、4 controlは新規empty disposable profileであり、`sandboxProfile:"read-only"`を全launchへ固定した。reportは`output/observation/p3-p11-app-server-spike-report.json`、SHA-256 `457cb3c74b97d6423e89111b674a19ba1b5547848bd8a7acc56aa4e16d7f3785`、40,027 bytesである。
- 結果: `candidate.thread !== null`であり、実App Serverは`read-only`を受理して`thread/start`のthread IDを返した。candidateは最初のinventory前に`CAPTURE_CHILD_EXIT_TIMEOUT`でunobservableとなり、`candidate.inventories.first`、turn、snapshot／origin／enabledCallable／completePagination／atomic turn bindingは未観測である。controlはunobservable、15 targetはunobservable、outcomeと`p11Authorization`はともに`NOT_AUTHORIZED`、`NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API`を維持した。inventory外MCP callは0件である。
- 証跡: report、candidate/control raw transport、prelaunch、plan、freeze、runner stdout/stderrを含むoutput 25 artifactをTemp外run rootへ保全し、artifact tree外の`C:\Users\tane1\AppData\Local\p3-p11-coordinator\20260810T195314Z-ee95eeb37c6e.manifest.json`へ相対path／byte数／SHA-256を固定した。manifest SHA-256は`cd9ac5784341c005afe7b903cc190eb955feebcecd026a75e1667c9a59c090e6`、4,966 bytesである。raw本文はrole attachment、P-3 runtime input、owner recordへ移していない。
- 不変: pre-observation freezeのP-11 helper／transport／E2E、P-3 core 3件、clean-room probe、STATEの全9 hashは観測後も一致した。pair lock、fixed ledger、`.figma-gate/active.json`は引き続き不存在である。再試行はしていない。
- 境界: この結果はP-11認可、owner承認、pair lifecycle、role配布、実装、実Figma測定を許可しない。inventory timeoutの診断・局所是正後にも、再観測には新しい一回限りの明示許可が必要である。

## [162] 2026-08-11 / Codex（P-11 real App Server観測：保全manifest・STATE連番監査）

- 保全manifest: 23件のTemp原本とTemp外coordinator-only複製先について、相対path／byte数／SHA-256を再照合し、source 23件＝保全先23件の全件一致を確認した。artifact treeの外側に`C:\Users\tane1\AppData\Local\p3-p11-coordinator-records\20260810T135500Z-d780b32b7bfb.manifest.json`を作成した。manifestは`preservedAt`、sourceRoot、preservedRoot、23件の`files[{path,bytes,sha256}]`だけを持ち、自身を列挙しない。strict UTF-8 readback／JSON parse／23 record照合を通過し、SHA-256は`8c48bdabbb35100ebafe07bdecffa8131db1bde3766e05e168f69fe64fd05879`、4,587 bytesである。
- STATE連番: 現物のLog見出しは`## [117]`の次が`## [119]`であり、`## [118]`見出しは存在しない。Current本文にはP-5の閉鎖を`[118]`と参照する箇所があるが、現ファイルだけから欠番理由や本文を復元できない。追記のみの規則に従い、既存番号の改番・補完・削除は行わない。
- 境界: P-3 runtime、P-11 helper、Temp原本、`scratch/home-*`は変更・削除していない。P-11は`NOT_AUTHORIZED`のままであり、`ownerApproved:true`、pair lifecycle、role配布、実装、実Figma測定を開始していない。

## [161] 2026-08-11 / Claude（Anthropic）独立差分確認（P-11 real App Server観測：LOW-1/LOW-2記録・証跡保全：PASS）

- 原文: ユーザー添付のClaude批評原文（`C:\Users\tane1\.codex\attachments\3389150e-655b-4516-831f-9f7f642f5bea\pasted-text.txt`）を読み取り、SHA-256 `a91a158bed8efdd862f1bbfaa72d11e920d8b9d3b62f9785ad56a153a880be36` を確認した。
- 判定: Claude（Anthropic）は、`read-only`が実App Serverの旧`readOnly`拒否応答で列挙された受理値にとどまり、実送信・受理は未実測である記録、およびTemp外への23 artifact複製と全件SHA-256再照合を**PASS**と判定した。新規HIGH/MEDIUMはない。P-11は引き続き`NOT_AUTHORIZED`である。
- 追補LOW: machine-readable manifestが保全先に無い点だけをLOWとして指摘した。これは[162]でartifact tree外のmanifestを追加して解消し、Claudeへの追加確認は要しない。Logの`[118]`欠番は現物で確認したが、既存Logを改変せず事実のみ[162]へ記録した。
- 境界: このPASSはP-11認可、owner承認、pair lifecycle、role配布、実装、実Figma測定を許可しない。次のreal `CODEX_HOME` candidate再観測は、新しい一回限りの明示許可がある場合だけに限る。

## [160] 2026-08-11 / Codex（P-11 real App Server観測：LOW-1/LOW-2の記録・証跡保全）

- LOW-2保全: 一回限り許可で得たTemp出力の`output/observation/` 21件と`output/plans/` 2件を、2026-08-11T04:32:48+09:00に`C:\Users\tane1\AppData\Local\p3-p11-coordinator-records\20260810T135500Z-d780b32b7bfb\`へ**複製**した。source 23件／保全先23件は相対path、byte SHA-256、byte数が全件一致し、report SHA-256は`1eeaa31fe5ccbbfe64b98fc2c8d7a661e265c5f517df713fb94680afe96c23d5`のままである。Temp原本と`scratch/home-*`は削除していない。scratchはdisposable control profileのため保管対象外である。
- 保全manifest（relative path / bytes / SHA-256）:
  - `observation/p3-p11-app-server-spike-report.json` / 34687 / `1eeaa31fe5ccbbfe64b98fc2c8d7a661e265c5f517df713fb94680afe96c23d5`
  - `observation/p3-p11-candidate-prelaunch.json` / 2313 / `d373513a354adaec8e7125649453542e35ad6db3613200bae4215c5c7a34d886`
  - `observation/p3-p11-candidate-stderr.raw.bin` / 0 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  - `observation/p3-p11-candidate-stdin.raw.jsonl` / 450 / `12e03da355522cdf2b8ff6439473c74ada8a52c4e7615f28d168f1d1524f9554`
  - `observation/p3-p11-candidate-stdout.raw.jsonl` / 577 / `a51dcf773d182576b437e1af536e311dad0a57c86702ca7a07f67001203afc32`
  - `observation/p3-p11-mcp-control-prelaunch.json` / 2421 / `1c39cbe19d67ab74410a5f88c72d92b9381afd4b4e954a615e106ea05e4d5684`
  - `observation/p3-p11-mcp-control-stderr.raw.bin` / 315 / `d7b0ccfa77b1b7d4cc7176d2880f93c264c095cebb9469deaca69f7f27ff1310`
  - `observation/p3-p11-mcp-control-stdin.raw.jsonl` / 452 / `daf56dfbe9bf660e2029a1e1509aa123128d01ef5acd9be755061976363eda29`
  - `observation/p3-p11-mcp-control-stdout.raw.jsonl` / 669 / `cb74350a1b331adf7219d9eeb42c96232fac3abacf18b57b0b78ff631be819e8`
  - `observation/p3-p11-plugin-control-prelaunch.json` / 2439 / `b13d94b26156fa04e1396a962baaecb15b527a9d227a28488982125a1f586669`
  - `observation/p3-p11-plugin-control-stderr.raw.bin` / 318 / `3993447db96c742bae0f8b9bab5584fdbeb8838aa3fe84479f23cc43f587ea63`
  - `observation/p3-p11-plugin-control-stdin.raw.jsonl` / 455 / `c2ad7a6aadae6a16363e7c47cad175d98158dfc6a9b9d16bef9c606cf2669dcd`
  - `observation/p3-p11-plugin-control-stdout.raw.jsonl` / 672 / `beee4f38a27d1591314345e3af7781c706abe2f80b97a901378070d6d10f4760`
  - `observation/p3-p11-project-trusted-prelaunch.json` / 2445 / `b7995ab34d6b6a919002bf5ec766957edcda09377e06bcf2b8c0b167a002deb4`
  - `observation/p3-p11-project-trusted-stderr.raw.bin` / 319 / `92bf4dc6cc7425e2a64c08e719e85623b9923bae9bd062dfe78010fd121c53c3`
  - `observation/p3-p11-project-trusted-stdin.raw.jsonl` / 456 / `d16dc2492f4c3f2033c46135dccc59ef7828f61583632b450205ee9a77cffc81`
  - `observation/p3-p11-project-trusted-stdout.raw.jsonl` / 673 / `fa97eddc46a5a63a3bd111005b38ba1e16eff2910ac716fa4a43def1970a2ca0`
  - `observation/p3-p11-project-untrusted-prelaunch.json` / 2457 / `51a52453fe4d7719f855bbc840a10d631fce68ef79dea4a1d14cd1de2518d787`
  - `observation/p3-p11-project-untrusted-stderr.raw.bin` / 321 / `7787e51bbe8dbf640345f39eb17838041621aa80163a8ca3d0282711746567e9`
  - `observation/p3-p11-project-untrusted-stdin.raw.jsonl` / 458 / `a94889c96383ec29cc1c5791139608b86eaf8d6a61c1b9f2c9067d5957a6bf14`
  - `observation/p3-p11-project-untrusted-stdout.raw.jsonl` / 675 / `ab81b1bfc20b642187e4fc6b655f0ae74a414004225e29e7a202d49ee93ac16b`
  - `plans/p3-p11-app-server-spike-plan.json` / 4865 / `a096baf8799cc010f54d96f4dd116490b97ce92e829d8c8f3ef760cc8f691c41`
  - `plans/pre-observation-freeze.json` / 1494 / `884bfbc797998934a6af32b50da6a1e86fcba9be75ff679e144d05cd8bb7f7e1`
- LOW-1記録: `P3-P11-APP-SERVER-SPIKE.md`へ、`read-only`は実App Serverが旧`readOnly`を拒否した応答で列挙した受理値だが、是正後に送信して`thread/start`が受理されたことは未実測であると明記した。次の実profile観測は新しい一回限りの明示許可がある場合だけに限り、最初に`candidate.thread !== null`を確認する。`rawThreadStartBinding.state: "present"`はrequestとpre-launch recordの整合であり、サーバ受理ではない。
- 境界: P-11は`NOT_AUTHORIZED`のままである。保全artifactをP-3 runtime入力、role attachment、owner recordへ移していない。`ownerApproved:true`、判断J-v10のowner採用、`pair-begin`、role配布、実装、実Figma測定を開始していない。
- 次: LOW-1/LOW-2の記録・保全差分を別ベンダー独立確認へ出す。PASS後にも実App Server再観測は新しい明示許可が必要であり、その結果がP-11認可を自動的に生むことはない。

## [159] 2026-08-11 / Claude（Anthropic）独立差分確認（P-11 real App Server観測：wire `read-only` 是正：PASS、LOW-1/LOW-2）

- 原文: ユーザー添付のClaude批評原文（`C:\Users\tane1\.codex\attachments\22120329-54a0-4f70-9da3-2d0c48db9548\pasted-text.txt`）を読み取り、SHA-256 `dc069feb2ceb6acdcf888b2eaf69ba2078db38f1c0a9d8f246abb3d585beaef1` を確認した。
- 判定: Claude（Anthropic）は、実App Serverの`-32600`が列挙した受理値へsandbox wireを`read-only`で統一する局所是正、parser／raw request／prelaunch-raw binding／fixture拒否の回帰、実観測report SHA-256 `1eeaa31fe5ccbbfe64b98fc2c8d7a661e265c5f517df713fb94680afe96c23d5`の実物照合、P-3保護領域無変更の境界を**PASS**と判定した。新規HIGH/MEDIUMはない。
- 実観測: [158]のcandidateは旧`readOnly`を送り、`thread/start`が`-32600`で拒否された。thread/turn/inventoryはnull、全15 targetと8 capabilityはunobservable、P-11は`NOT_AUTHORIZED`である。`rawThreadStartBinding.state: "present"`はrequest整合だけで、サーバ受理を意味しない。
- LOW-1/LOW-2: `read-only`を送信して実サーバが受理することは未実測であり、次回は新しい明示許可と`candidate.thread !== null`の初期確認が必要である。一回限り観測のTemp証跡は恒久coordinator-only領域へ保全し、各SHA-256を記録するよう求められた。
- 境界: このPASSはP-11認可、owner承認、pair lifecycle、role配布、実装、実Figma測定を許可しない。

## [158] 2026-08-10 / Codex（P-11 real `CODEX_HOME` coordinator-only実観測：fail-closed、sandbox wire不整合）

- 実行: ユーザーの明示許可の下、source・A/B actual worktree・common Git・pair lock・ledger・`.figma-gate`から分離したTemp coordinator領域で`p3-p11-app-server-spike`を一回だけ実行した。report SHA-256は`1eeaa31fe5ccbbfe64b98fc2c8d7a661e265c5f517df713fb94680afe96c23d5`である。
- 結果: reportは`coordinatorOnly:true`、`feasibilityOnly:true`、`p11Authorization:"NOT_AUTHORIZED"`、outcome=`NOT_AUTHORIZED`で保存された。candidateはreal profileを記録したが、`thread/start`のsandbox=`readOnly`が実App Serverの受理値`read-only`と不一致で`-32600`となり、inventory・plugin/project state・tool invocation前に`unobservable`へfail-closedした。
- 境界: source root、両actual worktree、common Gitは観測窓で更新0件、pair lock／fixed ledger／`.figma-gate`は不在、report参照20 artifactは全てTemp output内でSHA/bytes一致だった。一方real `CODEX_HOME`には同時刻の更新があり、共有live profileのため因果は断定しないが、完全な出力閉じ込めは主張しない。raw本文はrole attachment・P-3 runtime input・owner recordへ移していない。
- 次: plan/template/helper/E2Eのsandbox wire値を`read-only`へ局所是正し、実wire値を拒否するfixture回帰を追加した。差分確認後に新しい明示許可があるまで再観測しない。P-11、owner承認、pair lifecycle、role配布、実装、実Figma測定は開始しない。

## [157] 2026-08-10 / Claude（Anthropic）差分確認（P-3 P-11 spike MEDIUM-2／installed-only回帰：PASS、inventory method-set LOW）

- 原文: ユーザー添付のClaude批評原文（`C:\Users\tane1\.codex\attachments\8ac3f487-a886-4cdb-9665-fe9cf5056939\pasted-text.txt`）を読み取り、SHA-256 `c3782643980c8a7cace8466275405921e72a181b25888d3271b78c262423366d` を確認した。
- 判定: Claude（Anthropic）は[156]のMEDIUM-2（raw canonical idによるapp collection突合とlist-only fail-closed）およびinstalled-only方針の専用回帰試験を**PASS**と判定した。`app/list`と`app/installed`をAPI一般の同一集合と主張せず、P-11 spike固有の保守条件としてlist-onlyを未観測へ倒すこと、installed-onlyはprovenance付きで記録のみとすること、availabilityとcallabilityの分離、P-11の`NOT_AUTHORIZED`固定、P-3 core/probe不変を確認した。
- LOW-1: raw inventory evidenceが`mcpServerStatus/list`、`app/installed`、`app/list`の3方式全てを含むことを明示検査していない。現行呼出し経路では到達しないが、将来のmethod skipでapp surface未観測のままcallability完全性を記録しないよう、集合欠落を`RAW_THREAD_BOUND_INVENTORY_METHOD_SET_INCOMPLETE`でfail-closedにする局所是正と1件のE2Eを追加する。
- 境界: 本判定はP-11認可、owner承認、pair lifecycle、role配布、実装、実Figma測定を許可しない。LOW-1是正後に限り実Codex App Serverをcoordinator-onlyで一回観測してよいが、完全な同一launch tool surfaceの根拠がなければP-11は`NOT_AUTHORIZED`のままである。

## [156] 2026-08-10 / Claude（Anthropic）独立追補批評（P-3 P-11 App Server feasibility spike：条件付きPASS、MEDIUM-2）

- 原文: ユーザー添付のClaude批評原文（`C:\Users\tane1\.codex\attachments\fac347a2-7acd-4a25-adf4-a3cd56414d5d\pasted-text.txt`）を読み取り、SHA-256 `771fe6a9461fd7b9bf6b5735382d4b55dd2e38fd30711506d89602e2afa751de` を確認した。
- 判定: 起草・実装者Codex（OpenAI）とは別ベンダーのClaude（Anthropic）が、[155]のMEDIUM-1（raw response由来の将来API capability再検出）とLOW-1（tool使用抑制turnの限界記録）を解消と判定した。`app/list.isAccessible`と`app/installed.callable`の意味分離、raw request-response provenance、baseline/rich/malformedのfail-closed、`NOT_AUTHORIZED`固定、P-3 core/probe不変も確認した。
- MEDIUM-2: `app/list`にのみ存在するappを`enabledCallable`の対象集合から黙って除外できる。現rich fixture自身が`app/installed={documents}`と`app/list={documents,browser}`でありながら`enabledCallable.observed:true`を許す。app collectionをresponse由来nameで突合し、未照合entryがあれば`APP_LIST_ENTRY_WITHOUT_INSTALLED_CALLABILITY`でfail-closedにする局所是正と正負E2Eが必要である。
- 境界: 本判定はP-11認可、実Codex App Server観測、owner承認、pair lifecycle、role配布、実装、実Figma測定を許可しない。MEDIUM-2の短い外部確認まで、P-11は`NOT_AUTHORIZED`のままである。

## [155] 2026-08-10 / Claude（Anthropic）独立批評（P-3 P-11 App Server feasibility spike：PASS、MEDIUM-1・LOW-1）

- 原文: ユーザー添付のClaude批評原文（`C:\Users\tane1\.codex\attachments\c707d0a5-b013-43c6-9131-3fb88b32de01\pasted-text.txt`）を読み取り、SHA-256 `e1b4f7feb7fdc23285b58d6077cc7a3326b952b2c694a32f18324672b597ebf2` を確認した。
- 判定: 起草・実装者Codex（OpenAI）とは別ベンダーのClaude（Anthropic）が、`p3-p11-app-server-spike`をP-11認可器ではないcoordinator-only feasibility spikeとして**PASS**と判定した。C-1〜C-10、raw transport、同一launch束縛、pre/post安定性、三値分類、C-10 physical root境界、P-3 core/probe非変更を確認した。
- 境界: reportとprelaunch recordは常に`feasibilityOnly:true`／`p11Authorization:"NOT_AUTHORIZED"`であり、P-11認可、owner承認、pair lifecycle、role input配布、実装、実Figma測定を許可しない。公開App Server APIが同一turnへatomicに束縛された完全なmodel-visible tool surfaceを提供しないという限界は、実Codexへのcoordinator-only観測を行うまで一次実測としては未確定である。
- MEDIUM-1: `requiredApiCapabilities()`のsnapshot/process instance/origin/enabled/callable/atomic bindingとplugin/app・project stateが入力に依らない定数であり、将来App Server APIが必要fieldを追加しても再実行で検出できない。raw responseから導出し、thread-bound field有無の正負E2Eを追加する。`reportOutcome()`の`NOT_AUTHORIZED`固定は変更しない。
- LOW-1: feasibility turnがtool使用を明示抑制するため、inventory外tool callという反証信号を観測しにくい。追加tool使用turnは採用せず、limitationsへ「反証の不在は完全性の証拠でない」と明記する。
- 次: MEDIUM-1/LOW-1是正後に別ベンダー独立追補批評を行い、その後に限り実Codex App Serverをcoordinator-onlyで1回観測する。P-11は当該実測後も別の完全性根拠がない限り`NOT_AUTHORIZED`である。

## [154] 2026-08-10 / Claude（Anthropic）独立追補批評（P-3 clean-room remediation v5：PASS、LOW-1手順是正）

- 原文: ユーザー添付のClaude批評原文（`C:\Users\tane1\.codex\attachments\2dbe0632-8f48-4a5c-82a2-42cbdf695637\pasted-text.txt`）を読み取り、SHA-256 `e8c2300f75969cd69859704bd38d3490f9312abc298046e566deb7ca619c532c` を確認した。依頼文は必須実測PowerShell block後の判定観点部分が欠落していたが、批評は[152]のBLOCKER-1〜3、P-7/P-9/P-10/P-12、P-11 fail-closedを明示的に対象としている。
- 判定: 起草者Codex（OpenAI）とは別ベンダーのClaude（Anthropic）が、[152]のBLOCKER-1〜3およびP-7/P-9/P-10/P-12の是正、P-11をPASSへ読み替えないfail-closed実装を**PASS**と判定した。P-3 comparison contract v10本体、判断J-v10のowner採用、pair lifecycle、実装・実Figma測定の許可へは読み替えない。
- LOW-1: recovery journalがsource scopeへ残ると、未回復時に`finalChangeScope()`が原因を示さずscope違反として停止し得る。`P3-CLEAN-ROOM-PROTOCOL.md` §4/§5へ、`--recover`先行、未回復journalまたはrecovery root内残存entry時のlifecycle停止、`.gitignore`による回避禁止を追記した。空のrecovery rootの削除をhelperが一般保証するとは記述していない。return helperコード、P-3 runtime core、gate FAIL条件は変更していない。
- 実測: Claudeはpacket/return/probe E2E、6 MJS syntax、bootstrap、workflow-entrypointsを逐次PASSし、対象SHA前後一致、runtime core不変、A/B draft 3件のbyte一致、対象U+FFFD 0（STATEのみ既存190）を確認した。LOW-1文書追記後にも`node templates/verify/p3-role-return.e2e.mjs`はPASSした。
- 状態: `waiting-p11-tool-surface-evidence`を維持する。P-11は`NOT_AUTHORIZED`であり、owner承認では解除できないため、同一actual role launchに束縛されたtool/MCP surface又は全tool raw denialを検証する専用helperとその独立批評まで、`ownerApproved:true`・pair-begin・role delivery・実装・実Figma測定を開始しない。

## [153] 2026-08-10 / codex（P-3 clean-room隔離方式：BLOCKER-1〜3・P-7/P-9/P-10/P-12起草内是正、P-11 fail-closed）

- 是正範囲: P-3 runtime core、comparison contract schema、gate FAIL条件は変更せず、runtime外のcoordinator helper・雛形・手順・Open Service A/B draftだけを更新した。`p3-role-packet.mjs`はactual v10 contractとowner Decision J v2から相手identityを導出し、safe USTAR展開、path class、raw bytes/JSON identity scanを固定する。任意の自由文にあるhost外path指示は機械証明と主張せず、delivery前のcoordinator手続レビューへ切り分けた。
- BLOCKER-1〜3: `p3-role-return.mjs` v4は両conditionのactual pair-preflight／ledger／fixed lockを照合し、`return-apply-intent`→`return-applied`→`checkpoint-recorded`→`feedback-recorded`のprogress順序、component／attempt、same-condition feedback、recoveryを強制する。したがってpair-preflight前のapply、checkpoint/feedback前の次delivery、attempt skip、replayを拒否する。role packet v3 authority-bound scanとrole attachment manifestはcontract/J/evidence/templateをrole入力から除外する。
- P-7/P-9/P-10/P-12: `p3-clean-room-probe.mjs` v5はactual role processの`TEMP`/`TMP`へ0600 sentinelを作成し、matrix v3で3 peerのoriginal absolute TEMP pathをhash/realpath/provenanceに束縛する。P-10は`.codex`のhistory、sessions、archived sessions、memories、3 SQLite、rules、skills、および条件付きClaude Projectsを具体pathで確認し、P-12はself/peer worktree、3 peer staging、common Git、coordinator scratchへのread/write denialをfinite observationとして照合する。A/B draftはv5記述へ同一バイトで同期し、runtime record・pair lifecycle・site/・active stateは未作成のままである。
- P-11: `--ignore-user-config --ephemeral --json`の同一actual Codex launchに束縛されたmachine-readable tool/MCP surface inventoryを、現行CLIの契約から機械取得できない。static `all-disabled` config、別プロセスのconfig listing、agent文章、self-authored transcriptは証拠として受理しない。`--validate-evidence`は常に`p11Authorization: "NOT_AUTHORIZED"`を返し、`--require-p11-authorization`は`P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE`でFAILする。owner承認による上書きは不可である。
- 実測: `node templates/verify/p3-role-packet.e2e.mjs`、`node templates/verify/p3-role-return.e2e.mjs`、`node templates/verify/p3-clean-room-probe.e2e.mjs`はPASS。6 MJSの`node --check`、関連JSON parse、UTF-8 strict decode、U+FFFD 0、Markdown fence偶数、A/B対応3 draftのbyte一致を確認した。`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check`はOK。runtime core SHA-256は`fidelity-benchmark.mjs`=`c8aa5c7b9c9aa35e533cd52f2b019892a9186b1796c514b13d18f81239bcf60d`、`figma-gate.mjs`=`15c2658db5602fc1af44f12b46075c2f618a0056477dca4070f95b4164736e20`、`p3-page-provider.mjs`=`6836fc317fcafa277963e96cae71ee6dd125013d1fa97a9e9c90e1007dac1c9f`のままである。
- 境界: 本記録はClaude全文批評[152]の合格への置換、判断J-v10のowner採用、`ownerApproved:true`、pair lifecycle、role delivery、実装、実Figma測定の許可ではない。P-11をactual role launchに対して認可できる別helperと独立批評が完了するまで、開始しない。

## [152] 2026-08-10 / Claude（Anthropic）独立批評（P-3 clean-room隔離方式全文：条件付きFAIL、BLOCKER-1〜3是正）

- 原文: Claudeの全文独立批評原文を案件側`MyBrain/reports/2026-08-10-p3-clean-room-isolation-full-independent-review-result.md`へ保存した。SHA-256は`4d62f74343fd8792f7e06f5c4617267f622a86f6bfdf6dbcbe13aa365dc745ba`で、添付原文と一致する。
- PASSの範囲: actual baseline/current linked worktreeとcommon Git directoryを維持し、coordinatorだけがGit／P-3 lifecycleを実行し、A/B implementation/review roleをside-only staging／attachment inputへ分けるアーキテクチャはv10のfixed ledger・pair lock・compareを壊さない。coordinatorはA/B roleとして宣言しない。
- FAILの根拠: BLOCKER-1はcomponent単位の返却・checkpoint・FAIL逐語feedback・A/B同一停止条件という実装loopが未定義で、firstTryPassRateを初回実装測定として解釈できないこと。BLOCKER-2はcomparison contract、Decision J v2、clean-room evidence v2、contract templateがrole配布除外として明示されず、self-condition文書経由で相手identity metadataを渡し得ること。BLOCKER-3は返却物をpair-preflight成功前に適用するとunimplementedWorktree()がpairをabortedにする順序欠陥である。
- 追加条件: `elevated` probeは時点観測に留め、OS強制不変条件と記録しない。positive control、会話／履歴ストア、MCP迂回、相手側／common Git／coordinator scratchへの書込拒否、相互TEMP sentinel読取拒否をP-9〜P-12とP-7修正として加える。attachment-onlyではrole別attachment目録のpath／SHA-256を固定し、相手identity文字列が配布物に無いことを検査する。common Gitの共有はcoordinator用に維持し、roleへ渡さない。
- 境界: 本FAILはcomparison contract v10の実行器変更を要求しない。BLOCKER是正と追補独立批評の合格まで、`ownerApproved:true`、判断J-v10採用、pair lifecycle、実装、実Figma測定は開始しない。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`、既存gate FAIL条件は未変更である。

## [151] 2026-08-10 / Claude（Anthropic）独立批評（P-3 clean-room隔離方式：部分判定・全文再批評待ち）

- 原文: Claudeの部分批評原文を案件側`MyBrain/reports/2026-08-10-p3-clean-room-isolation-independent-review-partial.md`へ保存した。SHA-256は`28fbc6bd3a4eb9d634dd7bb7de1a2b8ce9289feee69ee8624adfc271552cd4a0`で、添付原文と一致する。
- 部分所見: `sandbox = "unelevated"`は同一Windows userのA/B path境界ではなく、[150]の実測と一致してP-3 implementation/review contextの根拠に使わない。actual baseline/current linked worktreeとcommon Git directoryはv10のfixed ledger・pair lock・compareに必要なため、独立cloneやcommon Git分離を行わない。4 fresh contextとcoordinator専用のGit／lifecycleは、相手conditionの5種artifactを渡さず参照させないowner運用の手続境界に留まる。
- 未判定: Claudeが受領した依頼文は`[windows] sandbox = "unelevated"`のTOMLブロック途中で終わり、coordinatorがactual linked worktreeとlifecycleを担い、roleはside-only staging／attachment inputと返却bundleだけを扱う全文案、`elevated` sandboxのrole限定probe、attachment-only fallbackを判定していない。本件をPASS/FAILへ読み替えず、全文を再送して独立批評を待つ。
- 境界: actual common Gitはcoordinator用に共有を維持する。roleがcommon Gitを必要とするとは限らず、role用OS境界を主張する場合はpeer worktree、parent、pilot/common Git、自側`.git`、STATE、共有TEMP、connectorを拒否するprofileと負の実測が別途必要である。`ownerApproved:true`、判断J-v10採用、pair lifecycle、実装、実Figma測定は許可しない。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`、既存gate FAIL条件は未変更である。

## [150] 2026-08-10 / codex（P-3 clean-room local sandbox負経路：unelevated不採用）

- 実測: 現在の`C:\Users\tane1\.codex\config.toml`は`[windows] sandbox = "unelevated"`である。fresh `codex exec --ephemeral`をbaseline worktreeに限定し、`-s read-only`と`-s workspace-write`で別々に相手current worktreeとcommon Git directoryの読取りを試した。両方でcurrent worktreeは`READABLE`だった。common Git directoryが見つからないという結果だけでは、A/B境界の成立根拠にならない。
- 判定: 同一host上のcurrent設定のlocal `unelevated` fresh context、および同一filesystemを共有するteam subagentを、Open Service P-3のbaseline/current implementationまたはreview actorとして使わない。`otherConditionArtifactsAccessible: false`を虚偽に記録しない。pair lifecycle、owner record、実装、実Figma測定は未実行である。
- 方針: Windows標準アカウントの追加は要件ではない。OpenAI公式のWindows sandbox仕様は`elevated`を優先し、`unelevated`をACL型のfallbackと説明する。非管理者で進める場合は、host worktree・common Git directory・shared project／connectorを渡さないside別attachment-only fresh contextを4本使い、coordinatorは各sideの返却bundleをnamed worktreeへ機械適用する。`elevated`を使う場合も、設定後に相手worktreeとcommon Git directoryの負のアクセス検査に通ったcontextだけを採用する。
- 境界: この記録はcomparison contract v10の技術合格、判断J-v10のowner採用、`ownerApproved:true`、`pair-begin`、実装、実Figma測定の許可ではない。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`、既存gate FAIL条件は未変更である。公式根拠: https://learn.chatgpt.com/docs/windows/windows-sandbox

## [149] 2026-08-10 / Claude（Anthropic）独立追補批評（P-3 comparison contract v10 MEDIUM-1是正：合格）

- 判定: [147]のv10本体合格を置換せず、別ベンダーのClaude（Anthropic）が[148]のMEDIUM-1是正を**解消済み**と判定した。配列の文字列要素にある`OWNER_INPUT_REQUIRED*`は、`fidelity-benchmark.mjs`と`figma-gate.mjs`でobject valueと同じfail-closed policyにより拒否される。新たなHIGH/MEDIUMはない。LOW-2のA/B v10再配備・`npm ci`後の`p3-evaluator-plan`・baseline draft再生成も解消済みと確認された。
- 独立実測: `node templates/verify/fidelity-benchmark.e2e.mjs` → PASS（368.0秒）、`node templates/verify/figma-gate.e2e.mjs` → PASS（39.1秒）、`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件で合格、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check` → OK。批評対象6ファイルは実測前後byte-identicalで、MJS/E2E/README/RECORDSのU+FFFDは0、STATEの既存U+FFFDは190で増減0である。
- reservation前拒否: fidelity E2Eは`shared.scope.masks`配列のplaceholderを`reservePair()`前に拒否し、pair lock/ledger未作成を検証した。figma-gate E2Eは`scope.checkpointPlan[0]`のplaceholderをpreflight前に拒否し、active state未作成を検証した。draft path、通常non-draft入力、`p3-json-hash`／`p3-evaluator-plan`／`p3-decision-input-plan`のdraft preparation例外は維持される。
- LOW-A: 本追補依頼のSTATE SHA-256申告値は、[147]追記後の現物`abb1aec1194d0da530c5a69150aefefcdf68e149aa73d0762df6f9b4bbbb2c44`と不一致だったが、内容・U+FFFDの問題ではない。以後の独立批評依頼では発行直前にSTATE SHA-256を再測定する。
- 境界: 原文は案件側`MyBrain/reports/2026-08-10-p3-v10-placeholder-array-followup-independent-review-result.md`（SHA-256 `5debcdc3eb941747e3a09d680cbc9715d3ea58d0fe9f1aec7ddaba7a93167a15`）へ保存した。本追補は`ownerApproved:true`、判断J-v10のowner採用、`pair-begin`・`pair-preflight`・`pair-close`、実装、実Figma測定を許可しない。fresh gate sidecar、4 context、final inputのhash固定、pair固有owner recordとowner承認を先に完了する。draft guardの非対称性は別scopeのままとする。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`、既存gate FAIL条件は未変更である。

## [148] 2026-08-10 / codex（P-3 v10 MEDIUM-1是正・A/B v10評価器再配備・draft再生成、追補独立批評待ち）

- MEDIUM-1是正: [147]のClaude批評が検出した、`OWNER_INPUT_REQUIRED*`がJSON配列の文字列要素だとdraft guardを素通りする穴を是正した。`fidelity-benchmark.mjs`と`figma-gate.mjs`の`assertNoDraftMarkers()`はarray分岐より前の文字列分岐でplaceholder prefixを拒否する。fidelity E2Eは`shared.scope.masks`配列のplaceholderを`pair-begin` reservation前に拒否しlock/ledgerがともに未作成であることを、figma-gate E2Eは`manifest.scope.checkpointPlan[0]`のplaceholderをpreflight前に拒否しactive state未作成であることを固定した。内部読取監査でもHIGH/MEDIUMなしである。
- LOW-1文書: `README.md`と`P3-CONTRACT-RECORDS.md`へ、未承認baseline clean-room evidenceは`pair-begin`のreservation後にabortedとなりpairId/contract pathを消費すること、消費を避けるにはread-only `pair-readiness <baseline-contract> pre-begin`を先に実行することを明記した。
- 実測: `node templates/verify/fidelity-benchmark.e2e.mjs` → `fidelity-benchmark E2E PASS`（674.1秒）。`node templates/verify/figma-gate.e2e.mjs` → `figma-gate E2E PASS`（75.6秒）。対象MJSの`node --check`4件はPASS、対象4ファイルのU+FFFDは0件である。
- A/B再配備: baseline/currentの`MyBrain/verify/fidelity-benchmark.mjs`を`c8aa5c7b9c9aa35e533cd52f2b019892a9186b1796c514b13d18f81239bcf60d`、`figma-gate.mjs`を`15c2658db5602fc1af44f12b46075c2f618a0056477dca4070f95b4164736e20`へ同一配備し、v10 template/README/record手順も同期した。両worktreeで`npm ci`（3 packages、0 vulnerabilities）後にread-only `p3-evaluator-plan`を実測し、evaluator input SHA-256 `c2520e0a5db7f8e59d6420656285fbe9da876ec8cb42b1ae0e9aa5e217c77403`、roots `9f2ff81287d3a8f2e3b04eb70e70278542f084330eb12d404e91fc0669ce1f9b`、execution bundle `c56f33c3706a78cd0f481e2e7cbef1728de9a47cf90cb887ecf67a199db0bc7d`が一致した。
- draft packet: 旧v9 scaffoldを流用せず、A/Bのbaseline draft（12 artifacts、SHA-256 `d59aad13efd62c3861888d16e3ccd11f4ce87c9754798603bbe47ad6ce3153a5`）、comparison draft、Decision J v2 input/scaffold、condition別clean-room evidence v2、owner packetをdraft-onlyのまま再生成した。45 JSON parse、A/B共通25ファイルbyte一致、v9参照0、関連recordの`ownerApproved:false`／`status:draft`、runtime contract/pair lock/ledger/active state不在を実測した。current/B改善recordは未変更である。
- 境界: Claudeのv10合格原文は案件側`MyBrain/reports/2026-08-10-p3-v10-clean-room-authorization-independent-review-result.md`へ保存した。MEDIUM-1是正は評価器rootを変更するため、同じく案件側の日本語追補批評依頼`2026-08-10-p3-v10-placeholder-array-followup-independent-review-request.md`に従う別ベンダー独立批評が必要である。合格まで`ownerApproved:true`、`pair-begin`・`pair-preflight`・`pair-close`、実装、実Figma測定は開始しない。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`、既存gate FAIL条件は未変更である。

## [147] 2026-08-10 / Claude（Anthropic）独立批評（P-3 comparison contract v10：合格、MEDIUM-1後続是正）

- 判定: 起草者Codex（OpenAI）とは別ベンダーのClaude（Anthropic）が、v9およびCJS direct-property変更の結論を流用せず、P-3 comparison contract v10を**合格**と判定した。draft artifactのreservation前拒否、Decision J v2→condition別clean-room evidence v2の一方向束縛、通常non-draft gate FAIL条件の不変性に停止級欠陥はないとされた。
- 実測: `fidelity-benchmark E2E PASS`（425.6秒）、`figma-gate E2E PASS`（45.7秒）、bootstrap required 27件、workflow entrypoint self-checkがすべて合格した。批評対象8ファイルは実測前後でbyte-identical、対象MJS等のU+FFFDは0、STATEの既存U+FFFDは190で増減0だった。実pilotではownerApproved true / status approvedのrecordが0件、pair lifecycle未実行も確認した。
- 指摘: MEDIUM-1として、`OWNER_INPUT_REQUIRED*`がJSON配列の文字列要素にある場合、両runtimeのplaceholder走査が素通りすることを検出した。実pilot draftでは到達しないが、v10のdraft reject目的に対する部分的な穴であり、owner Decision J v2承認前に是正する必要がある。LOW-1（未承認baseline evidenceはreservation後abortでpairIdを消費する旨の文書化）とLOW-2（A/Bへv10配備後にevaluator plan/draft baselineを再生成）も示した。
- 境界: この合格はv10設計・実装の批評結果であり、owner recordの`ownerApproved:true`、J-v10のowner採用、`pair-begin`、実装、実Figma測定を許可しない。Claude原文は案件側`MyBrain/reports/2026-08-10-p3-v10-clean-room-authorization-independent-review-result.md`に保存した。MEDIUM-1を是正した後、変更rootに対する追補独立批評を待つ。

## [146] 2026-08-10 / codex（P-3 comparison contract v10：draft runtime拒否とowner clean-room承認束縛、独立批評待ち）

- 契機: Open Service P-3 pilot用draft packetの読取監査で、draft marker／`p3-drafts`が「必須field不足で偶然止まる」だけで実行器が明示拒否しないこと、およびclean-room evidenceがowner判断Jへ自己申告SHAだけで結合され、`status`／`ownerApproved`／承認時刻を要求しないことを検出した。owner承認・`pair-begin`前にv10へ是正した。
- 是正: `fidelity-benchmark.mjs`はruntimeでdraft path、`_draftOnly`／`draftOnly`（falseを含む）、`status:"draft"`、`OWNER_INPUT_REQUIRED*`を拒否し、`pair-begin`では全frozen authorityと間接JSON pathを**reservation前**に検査する。v10はshared `cleanRoomAuthorization`（baseline/currentの2 plan）をDecision J v2へ完全束縛し、condition別evidence v2がJ file SHA-256・plan stable JSON SHA-256・当該conditionの完全複写・`status:"approved"`・`ownerApproved:true`・承認時刻を一方向に束縛する。evidence SHAをJへ戻さないため循環SHAを作らない。started/preflight/report/compareはJ／plan／condition evidenceのpath/SHA/承認時刻を台帳まで照合する。v9以前のfixed reservationは占有済みのままv10 lifecycleへ継続・置換できない。
- gate: `figma-gate.mjs`はmanifest・execution JSON/evidenceのdraft marker／reserved `p3-drafts`入力をpreflight/checkpoint/close/release前に拒否する。既存の非draft入力に対するgate FAIL条件は変更していない。
- 実測: `node templates/verify/fidelity-benchmark.e2e.mjs` → `fidelity-benchmark E2E PASS`。J plan hash・shared plan差分、baseline/current evidence未承認、draft contract/J/evidence/plan path、予約後markerのpreflight abort、report/compare/ledger binding、v5 lock／legacy v4 lock、既存CJS・provider・scope負経路を含む。`node templates/verify/figma-gate.e2e.mjs` → `figma-gate E2E PASS`。`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件で合格。`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check` → OK。対象MJSの`node --check`とtemplate JSON parseもPASS、変更対象のU+FFFDは0件。
- 境界: これは起草内回帰であり、v10の合格判定、J-v10のowner採用、owner recordの`ownerApproved:true`、`pair-begin`・実装・実Figma測定の開始ではない。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`は未変更。v9を合格と判定したClaude（Anthropic）の結論をv10へ流用しない。v10は別ベンダー独立批評待ちである。

## [145] 2026-08-10 / codex（Open Service P-3 fresh Figma gate evidence：A/B同一保存）

- fresh evidence: Open Service fileKey `KkBHUa1mNd6CiOKXNpSqAS`のPC/SP root・First View・Header計6 nodeについて、短命export/raw-design-context URL、取得時刻、node IDを記録し、対象asset byteを直ちに保存した。保存先はbaseline/current各`MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/`のみであり、既存`download-manifest.json`は変更していない。
- 実測: fresh-gate manifestを含む35ファイルの相対path/SHA-256はA/Bで完全一致し、manifest SHA-256は`ae0ce55065bfe6b57235dab45e9ed8cdf4b0e01dd19137f474258736ebe5a7bf`である。34 asset byteのうち31件は既存download manifestのSHAと一致した。未一致3件は新規のPC root export（1440×6772 JPEG/none）、SP root export（750×18492 JPEG/none）、SP header export（375×62 PNG/opaque）として実byteからMIME/SHA/寸法/alphaを確定した。current B asset provenance draftが期待する26 asset SHAはすべてfresh-gate内に存在する。
- 境界: URLは短命であり、最終gate manifest作成・実行時点で失効していれば再取得する。`site/`、gate sidecar、pair固有owner record、`pair-begin`・`pair-preflight`・`pair-close`・実装・実Figma測定はまだ開始していない。コード、確定spec、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は変更していない。

## [144] 2026-08-10 / Claude（Anthropic）独立批評（P-3 evaluator CJS direct-property変更：合格）

- 判定: 起草者Codex（OpenAI）とは別ベンダーのClaude（Anthropic）が、[143]の後発CJS direct-property互換/loader hardeningを、P-3 comparison contract v9本体とは別個に**合格**と判定した。`require("literal").identifier`の単一property許可は実依存`pngjs`の`require("assert").ok`と`require("buffer").kMaxLength`を静的閉包に含め、alias / bracket / optional / chain / invocation / constructor、`process`の`getBuiltinModule` / `binding` / `mainModule` / `dlopen`、`module` / `node:module`のproperty取得を拒否する範囲で狭く保たれている。
- 独立実測: `node templates/verify/fidelity-benchmark.e2e.mjs`はPASS（約620秒）、`bootstrap.mjs --check`はfigma-to-code required 27件で合格、`workflow-entrypoints.mjs --self-check`はOK。Open Service baseline/currentのread-only `p3-evaluator-plan`は、CLI SHA `317a9191891f0d7355da246fd7eefc7c35235eed190a126034c5476ca4cb1200`、input SHA `cbd34ec6a3ac565895619fb37eadba48cb6a801d3019e2efa532cab50820eebe`、root SHA `1033f8b26d40696682eabfca994c622408023554e74979dadca9f0bebc14825d`、bundle SHA `85d9f9aa0c24118d3cb564ac2b8e73744d02f7f4e720d5ac9d06f03f41e07bdc`、root 12 / closure 38 / package 2で一致した。A/B sourceは同一commit/tree・Git clean・`site/`未作成だった。
- 記録と限定: Claudeのmedium指摘は、変数束縛後のconstructor/process到達が今回の変更以前から存在する経路である点であり、今回scopeの不合格理由ではない。静的execution bundleが識別子束縛や任意runtime loader逃避を完全に証明・sandboxしない限界をREADME/P3-CONTRACT-RECORDSへ明記した。`module`の非loader propertyを使う追加負E2Eはlowの後続候補であり、合格済み意味変更へ新たなコード変更を加えない。
- draft: A/Bのevaluator baseline draftを最新planから再生成し、両方SHA-256 `7b56c5e1a59108290c678d23058635c12c0fb8202fc718b62dd492247d6a1c8f`、`version:2` / `status:draft` / `ownerApproved:false` / artifact 12件を確認した。fixed ledger / pair lockは未作成である。
- 境界: Claudeの合格はdraft再生成と後段pair固有record準備を許すが、owner本人の`ownerApproved:true`を代行しない。fresh gate sidecar、4 context、判断J record・baseline record・preImplementationProof・current改善承認recordのowner承認が揃うまで、`pair-begin`・`pair-preflight`・`pair-close`・実装・実Figma測定を開始しない。確定spec、`QUESTIONS.md`、gate manifest、`figma-gate.mjs`、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は変更していない。

## [143] 2026-08-09 / codex（Open Service P-3 pilot入力と評価器CJS hardening：独立批評待ち）

- P-3 pilot入力: ownerが指定したOpen Service FigmaのPC `2153:21702` / SP `2153:22332` と、First View / Header範囲、PC 1440×850 / SP 375×850、current B改善ID `hero-asset-provenance-and-responsive-geometry` を案件側reportへ記録した。専用source/A/B worktreeは同一commit `5e43b1e1d5edfa15ffa889c742726017d4b13a88`・tree `aab448dc9ac9cb16a726281d0f392f5ac0ccea09`、Git clean、`site/`未作成である。Figma evidenceはPC/SP/headerと親rootをA/Bへ同一保存し、download manifest SHA-256 `543fd752997ca2b463acb9aabbce0cd2c284dd84e6da4888ec8075af64368fac`、106ファイルの相対path/SHA-256一致、短命asset URL残存0を得た。
- current B draft: `p3-b-hero-asset-provenance-open-service-top-hero-v1.draft.json`へ、Figma source byteのMIME/SHA-256/intrinsic寸法/alpha分類、PC/SP CSS幾何、new `changeTargets` 28件を記録した。これはBのみの未承認実装手順であり、baseline Aへの指示・owner record・`pair-begin`の代替ではない。
- 評価器hardening: 実依存`pngjs`の`require("assert").ok`を静的閉包化するため、direct literal requireの単一named propertyだけを許容した。同時に`process`の`getBuiltinModule` / `binding` / `mainModule` / `dlopen`、および`module` / `node:module`のproperty取得はFAILへ追加し、bracket / optional / chain / invocation / constructorを引き続き拒否した。変更template SHA-256は`fidelity-benchmark.mjs=317a9191891f0d7355da246fd7eefc7c35235eed190a126034c5476ca4cb1200`、E2E=`d0b2ab48815806fefe31d806fe9da60bc85f509cbf953531e7086eaa29e24e28`である。
- 実測: `node templates/verify/fidelity-benchmark.e2e.mjs`は**PASS（1,179秒）**。`bootstrap.mjs --check`はfigma-to-code required 27件で合格、`workflow-entrypoints.mjs --self-check`はOK。A/B双方のread-only `p3-evaluator-plan`はroot SHA `1033f8b26d40696682eabfca994c622408023554e74979dadca9f0bebc14825d`、bundle SHA `85d9f9aa0c24118d3cb564ac2b8e73744d02f7f4e720d5ac9d06f03f41e07bdc`、root 12 / closure 38 / package 2で一致した。変更templateのU+FFFDは各0、STATE.mdは既存190文字である。
- 境界: この後発評価器意味変更は[141]のv9合格後であり、Codexの自己合格にしない。案件側に独立批評依頼を作成した。合格するまでevaluator baselineは`draft`・`ownerApproved:false`のままとし、owner record・`pair-begin`・実装・実Figma測定を開始しない。確定spec、`QUESTIONS.md`、gate manifest、`figma-gate.mjs`、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は変更していない。

## [142] 2026-08-09 / codex（改訂判断J-v9のowner採用条件1〜3を反映・回帰合格）

- owner判断: Escalationsの改訂判断J-v9へ、owner指示による採用記録を追記した。旧判断Jは履歴として残し、以後のP-3設計参照はJ-v9完成形だけにする。本採用は設計採用であり、実Figma入力8項目・案件ごとの`ownerApproved: true` recordを省略した実装/測定の許可ではない。
- 条件1: `fidelity-comparison-template.json`の`_lifecycle.activePairOrder`へ、read-onlyの`pair-readiness <baseline contract> pre-begin`を`pair-begin`前、`pair-readiness <condition contract> pre-close`を`pair-close`前として追加し、README/P3-CONTRACT-RECORDSの実順と同期した。
- 条件2: README/P3-CONTRACT-RECORDSへ、entry HTMLがbundle内faviconを`<link rel="icon" href="...">`で明示し、そのfaviconもnew `changeTarget`へ含めることを記載した。bundle外`/favicon.ico`要求はprovider/traceの404停止対象である。
- 条件3: README/P3-CONTRACT-RECORDSへ、baseline worktreeで`npm ci`後にread-onlyの`p3-evaluator-plan`を実測し、第三者`node_modules`のpolicy適合を`pair-begin`前に確認する手順を追記した。FAIL時はpair予約を消費しない。
- 実測: template JSON parseはPASS。sandbox内の`fidelity-benchmark.e2e.mjs`初回はGit子プロセスの`EPERM`で開始不能、通常環境の15分上限実行は904.2秒でtimeoutしP-3由来Node子プロセスだけを終了した。残留を除去して通常環境で上限30分の同E2Eを1回再実行し、**`fidelity-benchmark E2E PASS`（1,007.5秒）**を得た。続けて`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check`はOK。E2E完走後のNode残留はAdobe Creative Cloudの既存1件だけである。
- 境界: 本scopeの正本変更は`fidelity-comparison-template.json`、`templates/verify/README.md`、`templates/verify/P3-CONTRACT-RECORDS.md`、STATE記録だけである。P-3実行器/E2E、確定spec、`QUESTIONS.md`、gate manifest、`figma-gate.mjs`、`C:/AI/MyBrain/manifest.json`、既存gate FAIL条件は変更していない。上記3ファイルのU+FFFDは各0件、STATE.mdは既存190件。
- 保留: entry guardの無言no-op防止とprovider接続の明示破棄は、owner指定どおり別scopeとする。実Figma入力8項目が揃うまで`pair-begin`を実行しない。

## [141] 2026-08-09 / Claude（Anthropic）独立批評（P-3 comparison contract v9：合格）

- 判定: 起草者Codex（OpenAI）とは別ベンダーのClaude（Anthropic）が、開始前に対象17ファイルのSHA-256を凍結し、全測定後にbyte-identicalを再照合した上で**P-3 comparison contract v9を合格**と判定した。起草者による自己合格ではない。
- 実測: `node templates/verify/fidelity-benchmark.e2e.mjs`を逐次3回、`p3-path-boundary.e2e.mjs`、`p3-page-provider.e2e.mjs`、`gate-browser-batch.e2e.mjs`、`figma-gate.e2e.mjs`、layout/accessibility/motion/correction-receipt/figma-log-promote/asset-verify各E2E、`node C:/AI/MyBrain/bootstrap.mjs --check`、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check`の必須15コマンドをすべてPASSとして再現した。bootstrapはfigma-to-code required 27件で合格した。
- 重点確認: source snapshot時点からtrackedかつ未変更の`src/legacy.html`を使うbundle scope固有負経路、実装後`src/extra.css`を使うfinal scope固有負経路、provider起動前・起動後・close後のbundle照合とcleanup、実配布12 root、ignored artifactの開始前拒否、read-only readiness、Darwin境界、実static providerと実Chrome/CDP 4 phaseを確認した。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`、既存gate FAIL条件は変更されていない。変更P-3ファイルのU+FFFDは0件、STATE.mdは既存190件。
- 低優先の後続候補: faviconをbundle/changeTargetsへ含めるpilot設定の文書化、comparison templateへの`pair-readiness pre-begin/pre-close`手順同期、第三者`node_modules`の`npm ci`後`p3-evaluator-plan`実測の文書化、symlink時のentry guard明示失敗化、providerの`closeAllConnections()`追加。いずれも今回の合格版の偽PASS・実行阻害・測定無効化ではない。凍結済み合格版を独断で変えないため、別scope・独立批評対象として保留する。
- 次の人間判断: [改訂判断J-v9]をownerが採用するまで、実Figma URL/node、A/B実装、実測report、改善効果の主張を開始しない。

## [140] 2026-08-09 / codex（P-3 v9：bundle scope負E2Eを復元・再批評待ちへ復帰）

- 契機: [139]の欠落を是正する。`assertHermeticBundleScope()`は最終変更集合の検査と非冗長であり、source snapshot由来の未変更bundle fileを拒否する唯一の停止条件である。
- 是正: `pair-close`はprovider起動前に`collectStaticBundle()`とbundle scope照合を行う。provider起動直後とclose後にもlaunch bundleとの同一性を照合し、不一致時は`provider.close()`後に停止する。`fidelity-benchmark.e2e.mjs`へ、source commit時点からtrackedかつ未変更の`src/legacy.html`と、実装後の`src/extra.css`を分けた2経路を追加した。legacyは`finalChangeScope()`が`src/main.html`だけで通過した後、pre-closeでは`Comparison pre-close provider snapshot bundle file paths and frozen changeTargets`、pair-closeでは`P-3 provider snapshot bundle file paths and frozen changeTargets`で停止する。extra.cssは別にfinal Git change scopeで停止する。両方でreadiness read-only、gate close invocation/close report/provider receipt未到達、aborted、pairId再利用拒否を固定した。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`を残留同名Node process 0件から逐次実行しPASS（631.0秒）。`node templates/verify/p3-page-provider.e2e.mjs`はsandbox外でPASS。`node templates/verify/p3-path-boundary.e2e.mjs`、両変更MJSの`node --check`、`node C:/AI/MyBrain/bootstrap.mjs --check`もPASS（required 27件）。別起草内読取監査は、legacyがfinalChangeScopeと非冗長なbundle scope拒否であること、provider cleanupを含め新規HIGH/MEDIUMがないことを確認した。
- 文字化け・境界: 変更したP-3実行器/E2Eおよび関連文書はU+FFFD 0件、STATE.mdは既存190件。確定spec、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`は今回編集していない。
- 判断待ち: この再測定は起草内回帰でありP-3合格ではない。Claudeの別ベンダー再独立批評が合格するまで、改訂判断Jのowner採用と実Figma A/B比較を開始しない。

## [139] 2026-08-09 / codex（P-3 v9：hermetic bundle scope負E2E欠落を発見、是正中）

- 契機: 待機中の追加監査で、`assertHermeticBundleScope()`自体は`pair-readiness pre-close`と`pair-close`で実行されているが、これを固有に守る負E2Eが現行`fidelity-benchmark.e2e.mjs`から消えていると指摘された。`rg "provider snapshot bundle" templates/verify/fidelity-benchmark.e2e.mjs`は0件であり、指摘を確認した。
- 影響: `finalChangeScope()`はsource commitからの変更・未追跡だけを扱う。source commit時点からtrackedで未変更の`src/legacy.html`は最終変更集合に出ず`finalChangeScope`を通過するが、outputRoot=`src`のbundleへ含まれる。この場合、bundle pathsとfrozen `changeTargets`の完全一致を拒否する`assertHermeticBundleScope()`だけが停止条件になる。従って、対象外変更の`styles/decoy.css`負経路はこの契約の代替にならない。
- 是正中: (1) outputRoot内の余分`src/extra.css`、(2) source commit時点からtrackedかつ未変更の`src/legacy.html`を個別に用意し、pre-close/pair-closeがbundle scope固有エラーで拒否する負E2Eを追加する。両方でgate close invocation、close report、provider receipt未生成、abort、pairId再利用拒否を確認する。是正と回帰が完了するまで、[138]の起草内PASSを再独立批評への準備完了に読み替えない。

## [138] 2026-08-09 / codex（P-3 v9再批評前の追加是正・最終起草内回帰）

- 契機: [136]後の起草内監査で、`pair-readiness pre-close`を省略すると対象外変更の発見がgate close後になり得ること、darwinのcase-insensitive filesystem境界、実provider・実P-3 trace・実Chromeを同時に通すE2Eの欠落を検出した。Claude批評のlow 7は未知の第三者`node_modules`を偽PASSせずP-3開始前にFAILするため、判断J採用前に案件側`p3-evaluator-plan`で実測する境界として残す。low 9のA/B順次実行は文書化済み。
- 是正: `pair-close`はprovider起動と`figma-gate close`の前に`finalChangeScope()`を必須実行し、post-close再検査も維持した。負E2EはoutputRoot外`styles/decoy.css`で、close呼出marker・active state・close report・receiptが不変のままabort/再利用拒否となることを固定した。`win32 || darwin`をcase-insensitive path boundaryへ統一し、`p3-path-boundary.e2e.mjs`で`mybrain/`・`.FIGMA-GATE/`・`Node_Modules/`のcase variantを拒否する。`gate-browser-batch.e2e.mjs`は実static bundle・`startHermeticStaticProvider()`・実Chrome/CDP・P-3 network traceの正経路を追加し、faviconをbundleに含めた。同一実providerでbundle外CSSが404となりCDP traceが2xx失敗またはChromeの`net::ERR_ABORTED`で停止する負経路を固定した。README/P3-CONTRACT-RECORDSはpair-close直前再検査とcase-sensitive APFSでの安全側拒否を追記した。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`を残留同名Node process 0件から逐次3回実行し、すべてPASS（1,086.9秒、1,221.5秒、1,415.2秒）。読取診断では新設readiness/final scope/Darwin helperに非終端はなく、E2Eが約95回のNode子プロセスとESM resolverを逐次起動するため長時間化することを確認した。`node templates/verify/gate-browser-batch.e2e.mjs`は実provider統合を含めPASS（56秒）、`node templates/verify/p3-page-provider.e2e.mjs`、`node templates/verify/p3-path-boundary.e2e.mjs`、`node templates/verify/figma-gate.e2e.mjs`（168.6秒）、`node C:/AI/MyBrain/bootstrap.mjs --check`（required 27件）、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check`はすべてPASS。
- 文字化け・境界: `([regex]::Matches([IO.File]::ReadAllText((Resolve-Path -LiteralPath <file>)),[char]0xFFFD)).Count`で、変更したP-3実行器/E2E/文書11ファイルは各0件、STATE.mdは既存190件。mtimeは`spec/08-motion.md`=2026-07-29、`spec/13-accessibility.md`=2026-08-06、`spec/QUESTIONS.md`=2026-07-30、`figma-gate-template.json`と`C:/AI/MyBrain/manifest.json`=2026-08-06であり、今回編集していない。`figma-gate.mjs`は2026-08-08の既存P-3作業帯から未編集である。
- 判断待ち: これは起草内測定でありP-3合格・判断J採用・実Figma A/B比較開始のいずれでもない。Claudeの別ベンダー再独立批評が合格するまで開始しない。

## [137] 2026-08-09 / codex（P-3 v9是正の測定証跡補足とCurrent訂正）

- 契機: [136]の起草内回帰結果を、後続のClaude再独立批評が再現できるコマンド単位の証跡に分ける。初期P-3計測器の[87]合格と、comparison contract v9の再批評待ちがCurrentで混同しないよう訂正する。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`を逐次3回実行し、PASS（689.9秒、769.9秒、821.1秒）。`node templates/verify/figma-gate.e2e.mjs`、`node templates/verify/gate-browser-batch.e2e.mjs`、`node templates/verify/p3-page-provider.e2e.mjs`、`node templates/verify/verify-layout.e2e.mjs`、`node templates/verify/accessibility-verify.e2e.mjs`、`node templates/verify/motion-verify.e2e.mjs`、`node templates/verify/correction-receipt.e2e.mjs`、`node tools/figma-log-promote.e2e.mjs`、`node templates/verify/asset-verify.e2e.mjs`、`node templates/verify/gate-contract-audit.e2e.mjs`、`node templates/verify/loop-learn.e2e.mjs`、`node templates/verify/figma-feature-coverage.e2e.mjs`、`node C:/AI/MyBrain/bootstrap.mjs --check`、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check`を逐次実行し、すべてPASS。bootstrapはfigma-to-code required 27件。
- 文字化け測定: `([regex]::Matches([IO.File]::ReadAllText((Resolve-Path -LiteralPath <file>)),[char]0xFFFD)).Count`を、変更した`cdp-browser.mjs`、`figma-gate.e2e.mjs`、`fidelity-benchmark.mjs`、`fidelity-benchmark.e2e.mjs`、`README.md`、`P3-CONTRACT-RECORDS.md`、`fidelity-comparison-template.json`、`STATE.md`へ実行した。前7ファイルは各0件、STATE.mdは既存190件。
- 境界: この記録は起草者の回帰測定であり、P-3 v9の合格判定ではない。ClaudeはD-001/D-005における別ベンダーの再独立批評役として、[136]の是正と実配布物の両方を判定する。
- 次にやること: Claude再独立批評が合格するまで実Figma A/B比較を開始しない。合格後も改訂判断Jのowner採用と実Figma入力指定が必要である。

## [136] 2026-08-09 / codex（P-3 comparison contract v9、Claude独立批評の不合格6件是正・再独立批評待ち）

- 契機: Claudeの独立批評は、`cdp-browser.mjs`自身がstatic loader policyの`globalThis[...]`禁止に抵触し実配布P-3が起動できないこと、隔離E2Eが10本のrootをstub化して実配布物を走査していないこと、ignored artifactと最終scope/provider bundleをpair-closeまで早期検出できないこと、Q-08 destination／firstTryPassRate／専用パイロット条件の境界が文書に不足することを理由にP-3 v9を不合格とした。
- 是正: WebRTC guardとそのcaptureは`Object.getOwnPropertyDescriptor`によるdescriptor/prototype chain参照へ変更し、static loader policyは緩和しなかった。`figma-gate.e2e.mjs`はcanonical 12 rootを`templates/verify/`の実ファイルからコピーし、本物の`p3-evaluator-plan`が通る正経路とbracket lookupを拒否する負経路を追加した。`pair-begin`はreservation前、`pair-preflight`はgate起動前にignored artifactを拒否する。read-onlyの`pair-readiness <comparison> <pre-begin|pre-close>`を追加し、pre-beginは開始時clean/provider構造、pre-closeは最終Git変更集合/static bundle/entryを測定するが、ledger・pair lock・gate state・close reportを変更しない。READMEとP3-CONTRACT-RECORDSにはdestination.location除外、firstTryPassRateの非hermetic境界、清浄な専用リポジトリ条件、A/B順次実行、readiness lifecycleを記録した。
- 実測結果: 残留したP-3 E2E process treeを停止して0件を確認後、`node templates/verify/fidelity-benchmark.e2e.mjs`を逐次3回実行し、すべてPASS（689.9秒、769.9秒、821.1秒）。`figma-gate.e2e.mjs`、`gate-browser-batch.e2e.mjs`、`p3-page-provider.e2e.mjs`、`verify-layout.e2e.mjs`、`accessibility-verify.e2e.mjs`、`motion-verify.e2e.mjs`、`correction-receipt.e2e.mjs`、`tools/figma-log-promote.e2e.mjs`、`asset-verify.e2e.mjs`、`gate-contract-audit.e2e.mjs`、`loop-learn.e2e.mjs`、`figma-feature-coverage.e2e.mjs`はPASS。`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格、共通入口self-checkも合格した。変更P-3実行器・E2E・文書のU+FFFDは0件、STATE.mdは既存190件。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は今回編集していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。
- 判断待ち: この是正と起草内回帰はP-3の合格判定でも、改訂判断Jのowner採用でもない。Claude再独立批評がv9を合格と判定するまで、実Figma A/B比較を開始しない。

## [135] 2026-08-08 / codex（P-3 v9後の残り回帰）

- 実測結果: `correction-receipt.e2e.mjs`、`tools/figma-log-promote.e2e.mjs`、`asset-verify.e2e.mjs`を逐次実行し、すべてPASS（それぞれ2.0秒、13.1秒、36.7秒）。いずれもサンドボックス内ではNode子プロセスまたはChrome DevTools endpointの制約で完走しなかったため、sandbox外で同一コマンドを再実行して測定した。`figma-feature-coverage.mjs audit`の現行カタログ再計測はfeatures 10 / fully covered 10 / findings 0であり、静的根拠監査の結果であって実Figma忠実度・P-3の効果測定ではない。
- 境界: この回帰はP-3 v9の起草内検証を補完するものであり、独立批評、判断Jのowner採用、実Figma A/B比較の開始を許可しない。

## [134] 2026-08-08 / codex（P-3 comparison contract v9、追加起草内是正・回帰、Claude独立批評待ち）

- 契機: [133]後の起草内監査で、Windowsの大小文字差を利用した非source path判定、providerのoutput／entry／bundleと凍結changeTargetsの結合、P-3限定のnavigation／Document証跡、WebRTC由来の外部入力、clean-room evidence pathの衝突に追加是正余地を検出した。
- 是正: `fidelity-benchmark.mjs`はWindowsで非source prefixを大小文字非区別で扱い、P-3 static providerのoutput root・entry target・bundle pathを凍結changeTargetsと厳密一致させる。`cdp-browser.mjs`と`gate-browser-batch.mjs`はP-3 batchに限りloader／Document lifecycleを結び、WebRTC guardを追加した。`p3-page-provider.mjs`のP-3限定CSPと、comparison template／README／`P3-CONTRACT-RECORDS.md`をv9契約へ同期した。
- 実測結果: 重複して残っていたP-3 E2E process treeを停止後、`node templates/verify/fidelity-benchmark.e2e.mjs`を逐次3回実行し、各回`fidelity-benchmark E2E PASS`（593.6秒、573.9秒、556.0秒）。`node templates/verify/p3-page-provider.e2e.mjs`、`gate-browser-batch.e2e.mjs`、`figma-gate.e2e.mjs`、`verify-layout.e2e.mjs`、`accessibility-verify.e2e.mjs`、`motion-verify.e2e.mjs`、`gate-contract-audit.e2e.mjs`、`loop-learn.e2e.mjs`、`figma-feature-coverage.e2e.mjs`はPASS、`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格した。変更したテンプレート・実行器・文書のU+FFFDは0件、`STATE.md`は既存190件である。
- 境界: 今回セッションで確定済みspec本文、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`は編集していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。
- 判断待ち: 起草内回帰はP-3の合格判定でも、改訂判断Jのowner採用でもない。Claude独立批評がv9契約を合格と判定するまで、実Figma A/B比較を開始しない。

## [133] 2026-08-08 / codex（P-3 comparison contract v9、hermetic static provider・CDP証跡の起草内是正、Claude独立批評待ち）

- 契機: v8への起草内静的監査で、providerがHTMLへ識別`meta`を注入することで測定時だけ描画を変え得ること、Window targetだけのNetwork監視ではWorker由来の外部入力を検出できないことを確認した。あわせて、P-3 sidecarのstatic importが`C:/AI/MyBrain/bootstrap.mjs --check`で未登録required配布物として検出された。
- 是正: 新規`p3-page-provider.mjs`は最終static outputを開始時にbytes snapshot化して配信し、HTML bytesを改変しない。random marker・entry SHA-256・bundle Merkle rootはHTTP response headerだけに載せ、P-3専用CSPでWorker／service worker、iframe、popup、外部connectを停止する。`gate-browser-batch`は`p3Hermetic: true`のP-3 batchだけでQ-09 layout/capture・Q-13・Q-08の各phaseについてCDP Network responseを保存し、4 phaseすべてのDocument request/response URL、provider header、origin、cache／service worker／WebSocketを検査する。通常gate batchは新しいP-3 Network／page identity失敗条件を起動しない。`pair-close`はprovider起動中に既存`figma-gate close`を実行し、close後のbundle不変性・batch evidence・receiptを固定する。providerはP-3任意sidecarとして実行時にだけ読み込み、`C:/AI/MyBrain/manifest.json`へ追加していない。
- 利用準備: `p3-json-hash`、`p3-evaluator-plan`、`p3-decision-input-plan`を追加し、P-3 contract作成前のJSON hash、12 root＋execution bundleのbaseline record、pair固有判断J入力をread-onlyで生成する。`fidelity-comparison-template.json`、`P3-CONTRACT-RECORDS.md`、READMEをv9 lifecycle、baseline/current差分、static output適格条件、空capture probeへ同期した。
- 実測結果: sandbox外で`node templates/verify/fidelity-benchmark.e2e.mjs`を逐次3回実行し、各回`fidelity-benchmark E2E PASS`（533.0秒、547.7秒、551.8秒）。`node templates/verify/p3-page-provider.e2e.mjs`は実ChromeでWorker遮断・外部fetch未到達を含めPASS、`node templates/verify/gate-browser-batch.e2e.mjs`、`figma-gate.e2e.mjs`、`verify-layout.e2e.mjs`、`accessibility-verify.e2e.mjs`、`motion-verify.e2e.mjs`、`gate-contract-audit.e2e.mjs`、`loop-learn.e2e.mjs`、`figma-feature-coverage.e2e.mjs`はすべてPASS。`node C:/AI/MyBrain/bootstrap.mjs --check`はsandbox外でfigma-to-code required 27件が合格、共通入口self-checkも合格した。変更11ファイルのU+FFFDは0件、STATE.mdは既存190件。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は編集していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。P-3 static providerは静的output限定であり、動的アプリは専用provider adapterを別scope・owner承認・独立批評で追加するまで対象外とする。
- 判断待ち: この起草内回帰はP-3の合格判定でも、改訂判断Jのowner採用でもない。Claude独立批評がv9契約を合格と判定するまで、実Figma A/B比較を開始しない。

## [132] 2026-08-08 / codex（P-3 comparison contract v8、起草内追加監査のCJS・固定台帳是正、独立批評待ち）

- 契機: [131]の起草内回帰後の追加監査で、bare CJS package内部の`require`依存、開始済みpairの壊れたcomparison contract、同一contract pathの二重予約、負E2Eの台帳assertに穴があることを検出した。これらは起草内で合格に読み替えず、再批評前に是正対象とした。
- 是正: evaluation bundleの静的依存収集は、コメント除去後にESM static import/export・literal dynamic importと、空白/コメントを挟むCJSのliteral `require` / `module.require` / `require.resolve`を収集する。direct literal call以外のdynamic import/requireとrequire aliasを拒否し、Node組込みmoduleはpackage解決から除外する。common Git directoryにはpairId lockとcontract-path lockを一対一で作成し、A/Bの同一repository-relative contract pathを強制する。既知pathの壊れたJSONは解析前に、別pathだがpairIdを解析できるcurrentはlock照合前に、started pairを`aborted`へ終端する。
- 隔離E2E: CJS helper改変、dynamic require、require alias、空白/コメント付き`require`・`module.require`・`require.resolve`、CJS内の`require("fs")`、同一contract pathへの別pairId予約、別path currentのpreflight前拒否を追加した。壊れたcontractの`pair-preflight`、`report`、`compare`はいずれも対象pairId自身の`aborted` JSONL recordと、復元後のpairId再利用拒否を検査する。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で逐次3回実行し、各回`fidelity-benchmark E2E PASS`（wall time 280.5秒、234.4秒、209.2秒）。`node templates/verify/figma-gate.e2e.mjs`は`figma-gate E2E PASS`（193.6秒）、`node templates/verify/gate-browser-batch.e2e.mjs`は3反復とも`PASS 2 / FAIL 0`、`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格した。変更template/README/E2EのU+FFFDは0件、STATE.mdは既存190件。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は編集していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。これは起草内回帰であり、P-3の合格判定でも判断Jのowner採用でもない。
- 判断待ち: Claude独立批評がこの追加是正を評価するまで、実Figma A/B比較を開始しない。

## [131] 2026-08-08 / codex（P-3 comparison contract v8、Claude v7批評4件の是正・独立批評待ち）

- 契機: Claude v7批評は、closeのFAIL条件となる`lint-units.mjs` / `loop-learn.mjs` / `loop-learning-policy.json`が凍結評価器から漏れること、案件用実体の根拠不足、`frozen/`等のfixture由来除外、[123]訂正参照の不備を理由にP-3を不合格とした。
- 是正: canonical evaluatorを12本へ拡張し、`figma-gate.mjs`の`MyBrain/verify/*.mjs|json` literal runtime artifactを抽出して未宣言なら`pair-begin`で拒否する。baseline record v2は12 rootのpath/SHA-256とexecution bundle hashをowner承認済み案件用実体として記録し、判断Jもroot hash・baseline record hash・execution bundle hashを束縛する。bundleはruntime artifact、相対import閉包、bare package実解決entry/package.json、lockfileを含み、`pair-preflight`は実gate preflight起動前に再照合する。`NON_SOURCE_PREFIXES`は`.figma-gate/`、`MyBrain/`、`node_modules/`だけに縮小し、E2E証跡を`MyBrain/verify/`配下へ移動した。`frozen/`の未実装selector残存はworktree側とGit tree側の双方で拒否する。
- 隔離E2E: baselineの`lintUnits` hash不一致、`loopLearningPolicy` root改変、root不変の相対helper改変、`pair-begin`後のhelper改変（gate preflight未到達）、未宣言runtime artifact、`frozen/`内selector残存を負経路として固定した。期待する拒否は`baseline record artifacts differ`、`baseline record execution bundle differs`、`owner decision J record evaluator execution bundle differs`、`runtime artifact ... has no canonical evaluator declaration`、`already renders`である。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で3回実行し、すべて`fidelity-benchmark E2E PASS`。`node templates/verify/figma-gate.e2e.mjs`は実gateを用いるP-3 preflight統合を含め`figma-gate E2E PASS`。`node templates/verify/gate-browser-batch.e2e.mjs`は3反復で`PASS 2 / FAIL 0`、`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格。
- 境界: 今回の編集対象はP-3比較契約、隔離E2E、template、README、STATE記録である。確定済みspec本文、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`は編集していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。READMEはstatic evaluator bundleが`npm`/Sass/PHP等のOS/toolchain実行体を同一性検証しない限界も明記した。
- 判断待ち: この起草内回帰はP-3の合格判定ではない。Claude独立批評と改訂判断Jのowner採用まで、実Figma A/B比較を開始しない。

## [130] 2026-08-08 / codex（P-3 v7、判断Jの評価器束縛の負経路を補強）

- 契機: v7の判断J `evaluatorRootsSha256`は実装済みだったが、全9 root束縛そのものを壊す隔離E2Eを明示していなかった。
- 実施: owner decision J recordの9 root束縛hashだけを不一致にした`pair-begin`を追加し、`Owner decision J record evaluator roots differ from the frozen canonical evaluators`で拒否する負経路を固定した。canonical path外の`gateBrowserBatch`拒否、pair-preflight後の直接preflight再実行→report拒否の負経路は維持した。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で追加実行し、`fidelity-benchmark E2E PASS`。
- 境界: これは起草内回帰であり、P-3の合格判定ではない。Claude独立批評と改訂判断Jのowner採用まで実Figma A/B比較を開始しない。
## [129] 2026-08-08 / codex（P-3 comparison contract v7、Claude独立批評待ち）

- 契機: Claudeによるv6批評は、`figmaGate`以外の8測定器が任意pathを受け取れること、pair-preflight後に直接`figma-gate preflight`を再実行して`benchmark.attempts`を初期化できることをhighとして不合格とした。selector文字列探索の限界と、[123]の`gitIdentityAtPreflight`に関する記述も訂正対象とした。
- 是正: 比較契約をv7へ更新し、9測定器すべてを対応する`MyBrain/verify/*.mjs` canonical pathへ固定した。判断J recordには9 rootのpath/SHA-256束縛`evaluatorRootsSha256`を必須化した。`figma-gate preflight`はcrypto UUIDの`preflightId`をstateへ記録し、pair-preflightが台帳へ記録したID・時刻・runtime hashとreport時のstateを照合する。直接preflight再実行でIDが変わったstateは比較根拠にできない。隔離E2Eは任意の`gateBrowserBatch` decoy path拒否と、pair-preflight後の直接preflight再実行→report拒否を追加した。READMEにはselector探索が文字列検査であり、別表現・Git無視ファイル・生成物を意味論的に証明しない限界を明記した。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で3回（うち追加2回は並行）実行し、すべて`fidelity-benchmark E2E PASS`。`node templates/verify/figma-gate.e2e.mjs`は実gate entryを使うP-3 pair-preflight統合を含め`figma-gate E2E PASS`。`node templates/verify/gate-browser-batch.e2e.mjs`は`gate-browser-batch E2E PASS`。`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格。
- 訂正: [123]の「`figma-gate.mjs`はP-3証跡の追加のみで、既存gate FAIL条件は変更していない」はv3の`gitIdentityAtPreflight`を含めると不正確である。Git identityはP-3比較の前提として使われる。v6で追加したruntime evidence自体は`figma-gate`の既存検証FAIL条件を変更していない。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は変更していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。
- 判断待ち: v7はClaudeによる独立批評と、改訂判断Jのowner採用前である。codexはP-3の合格判定、実Figma A/B比較の開始、改善効果の報告を行わない。
## [128] 2026-08-08 / codex（P-3 comparison contract v6、代替独立批評待ち）

- 契機: v5への代替批評は、`figmaGate`が任意pathを受け取りfixtureがactive stateを直接書けること、未実装sourceがchangeTargetsの存在だけでcomponent実装と結び付かないこと、ledgerの`aborted`追記失敗を握り潰すこと、該当負E2Eが不足することを不合格理由とした。
- 是正: v6は`MyBrain/verify/figma-gate.mjs`だけを起動し、実gateがpreflight stateへ記録するentry path/SHA-256を凍結評価器と照合する。preImplementationProof v2は、凍結component manifestとcomponent decision manifest由来のelementId/selector/figmaNodeId/codePathを完全一致で記録し、source Git treeとpair-begin/pair-preflight直前worktreeの実ソースをselectorごとに検索する。開始前にGit common directoryの固定pair lockを原子的に予約し、ledger追記が失敗しても同pairIdを再利用できない。実gateを`pair-preflight`から起動する統合E2Eと、ledger書込み障害注入の負E2Eを追加した。`figma-gate.mjs`への変更はruntime証跡の追加だけであり、既存FAIL条件は変更していない。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で3回並行実行し、各回`fidelity-benchmark E2E PASS`。`node templates/verify/figma-gate.e2e.mjs`は実gate entryを使うP-3 pair-preflight統合を含め`figma-gate E2E PASS`。`node templates/verify/gate-browser-batch.e2e.mjs`は`PASS`、`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格。変更6ファイルのU+FFFDは0件、STATE.mdは既存190件。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は変更していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。
- 判断待ち: v6のterra ultra代替独立批評が合格し、改訂判断Jをownerが採用するまで、実Figma A/B比較を開始しない。
## [127] 2026-08-07 / codex（P-3 comparison contract v5、代替独立批評待ち）

- 契機: v4のterra ultra代替批評は、判断Jが`pair-begin` / `pair-preflight`の実gate起動前に強制されないこと、Bの改善承認が任意文書で通ること、未実装sourceを機械保証していないこと、bare importとlockfile実解決版の結合が不足することを不合格理由とした。
- 是正: v5は判断J・owner承認済みpreImplementationProof・Bのpair/改善IDに結び付いたowner承認recordを、`pair-begin`または`pair-preflight`の前に検証する。preImplementationProofの`unimplementedTargetPaths`は凍結`changeTargets`と完全一致させ、source Git treeとpreflight直前worktreeの双方にtarget実装ファイルがある場合をFAILにした。評価器のlockfileはrepository rootの`package-lock.json`に限定し、bare importの実解決package versionとlockfileの`packages` entryを照合する。開始前の入力・承認失敗でもfixed ledgerへ`aborted`を記録し、同一pairIdの置換を拒否する。READMEの重複したv3記述を削除してv5契約へ統一した。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で3回実行し、各回`fidelity-benchmark E2E PASS`。正経路の別worktree A/B、判断J未承認、B改善承認未承認（実gate preflight未到達）、source Git tree/worktreeへのtarget実装残存、lockfile hash改変と実解決package version不一致、bare package内部の相対依存改変、clean-room不整合、close/report/Chrome証跡不整合、早期compare失敗の`aborted`終端を測定した。`node templates/verify/gate-browser-batch.e2e.mjs`、`node templates/verify/figma-gate.e2e.mjs`、`node C:/AI/MyBrain/bootstrap.mjs --check`は合格（required 27件）。変更4ファイルのU+FFFDは0件、STATE.mdは既存190件。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は変更していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。
- 判断待ち: v5のterra ultra代替独立批評が合格し、改訂判断Jをownerが採用するまで、実Figma A/B比較を開始しない。

## [126] 2026-08-07 / codex（P-3 comparison contract v4、代替独立批評待ち）

- 契機: comparison contract v3へのterra ultra代替批評は、source snapshotが任意ファイルに近いこと、clean-roomが任意文字列であること、scope/target sectionをmutableなactive stateから読めること、bare import/lockfile/Chrome revision・userAgentが凍結されないこと、壊れたreportの比較失敗が台帳を`aborted`で終端しないことを不合格理由とした。
- 是正: v4はsource Git commit/treeの`git archive --format=tar`実バイトと両worktreeへ配置したarchive SHA-256を照合する。判断Jのowner承認recordにFigma target、source、manifest/components/page coverage、checkpoint plan、change targets、target sectionを固定し、manifest/components/page coverageから再導出した値とactive state・close report・実ファイルhashを完全照合する。clean-roomは判断Jのowner承認record SHA-256、condition/worktree/context/相手成果物5種の非参照を含む構造化evidenceへ変更し、コード単独では会話等の非参照を証明できない限界をREADMEに明記した。評価器は相対import閉包、bare importの実解決entry/package.json、package lockfileを固定し、CDPのproduct/revision/userAgentを同一batch session証跡と照合する。`compare`はbaseline contractを第3引数に要求し、壊れたreport・comparison欠落を読む前に既知pairのfixed ledgerを設定して自動`aborted`で終端する。
- 実測結果: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で初期回帰として3回、bare import実体とChrome revisionの負経路を追加後に1回、判断J承認recordとclean-room evidenceの結合後に1回実行し、各回`fidelity-benchmark E2E PASS`。正経路の同一Git archive A/B比較、manifest由来planへのactive state縮小、package lock改変、bare import実体改変、Chrome revision改変、clean-room非参照宣言欠落、壊れたbaseline reportでの早期`aborted`を測定した。`node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件で合格。変更4ファイルのU+FFFDは0件、STATE.mdは既存190件で増加していない。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、既存gate FAIL条件、`C:/AI/MyBrain/manifest.json`は変更していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。
- 判断待ち: v4の代替独立批評が合格し、改訂判断Jをownerが採用するまで、実Figma A/B比較を開始しない。
## [125] 2026-08-07 / codex（P-3 v3 figma-gate回帰）

- 実測結果: 重複したタイムアウト起点のE2E子プロセスを終了後、単一の`node templates/verify/figma-gate.e2e.mjs`をhidden backgroundで完走し、`figma-gate E2E PASS`を得た。P-3 v3の追加Git証跡が既存gate回帰を破壊していない。
- 状態: P-3 v3の起草内回帰は`fidelity-benchmark`、`gate-browser-batch`、`figma-gate`、bootstrapで完走済み。代替独立批評と改訂判断Jのowner採用までは実Figma A/B比較を開始しない。
## [124] 2026-08-07 / codex（P-3 v3 bootstrap回帰）

- 実測結果: `node C:/AI/MyBrain/bootstrap.mjs --check`をsandbox外で実行し、figma-to-code required 27件、相対import検査を含め合格した。
- 未完了の検証: 起草後の`figma-gate.e2e.mjs`はまだ完走結果を得ていない。P-3 v3は代替独立批評待ちであり、判断J採用・実Figma A/B比較には進めない。
## [123] 2026-08-07 / codex（P-3 comparison contract v3、代替独立批評待ち）

- 契機: [122]への代替独立批評で、preflight時点のGit identity、close-reportの実体照合、評価器依存閉包、gate実測sessionとのChrome証跡、固定台帳と早期失敗の終端保証が不足すると判定された。
- 是正: `figma-gate preflight`がGit worktree/HEAD/treeをactive stateへ記録し、`gate-browser-batch`が同一CDP sessionの`Browser.getVersion`とNode版をsummaryへ記録するようにした。P-3はv3へ更新し、A/Bの`pair-preflight`が実際のfigma-gate preflightを起動する。source snapshotとpreflight Git identity、close-report/state/current file hash、checkpoint集合、gate batchのQ-09/Q-13/Q-08 session、評価器rootと相対import依存閉包を照合する。台帳はGit common directoryに固定し、入力失敗・preflight失敗・report/compare失敗をabortedで終端する。
- 隔離E2E: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で実行し`fidelity-benchmark E2E PASS`。同一snapshotの別worktree A/B正経路、固定台帳のpair再利用拒否、import依存改変後の自動aborted、close-reportと実ファイルhash不一致を実測した。`node templates/verify/gate-browser-batch.e2e.mjs`もsandbox外で`PASS`し、追加CDP証跡を含むbatch回帰を通過した。
- 未完了の検証: `node templates/verify/figma-gate.e2e.mjs`と`node C:/AI/MyBrain/bootstrap.mjs --check`はこの起草後まだ完走結果を得ていない。代替独立批評と改訂判断Jのowner採用前に、実Figma A/B比較・改善効果の判定は開始しない。
- 境界: 確定済みspec本文、`QUESTIONS.md`、gate manifest、`C:/AI/MyBrain/manifest.json`は変更していない。`figma-gate.mjs`はP-3証跡の追加のみで、既存gate FAIL条件は変更していない。
  （2026-08-08 更新: [129]で訂正。v3の`gitIdentityAtPreflight`を含めると「既存gate FAIL条件を変更していない」は不正確。）
## [122] 2026-08-07 / codex（P-3 comparison contract v2、代替独立批評待ち）

- 契機: P-3の代替独立批評は、v1が任意source file・手書きpreflight・任意evaluation bundle・途中FAIL component・任意2 reportを比較根拠にできるため、判断Jの条件追加は採用不能と判定した。
- 実施内容: `fidelity-benchmark.mjs`のcomparison contractをv2へ更新した。source snapshotをGit commit/treeとcommit内blobへ照合し、A/Bの実Git worktree rootが異なることをcompareで必須化した。figma-gateのmanifest/spec/components/mapping/node map/component decision/node/layer evidence/accessibility/motion/axe source全hash、close-reportのmanifest・SPEC/LAYOUT/VISUAL 0・全checkpoint PASS・target section・file hash、個別の測定器9件、CDP `Browser.getVersion`のChrome実測証跡、公開時のowner承認済みpassed release-checkを必須化した。`pair-begin` / `pair-abort`とworktree外JSONL台帳を追加し、started・aborted・completedの記録済みpairIdを再実行・置換できないようにした。comparison contractのreport/compare失敗時はabortedを自動追記し、preflight失敗は明示`pair-abort`で同じ終端状態にする。
- 隔離E2E: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で3回実行し、各回`fidelity-benchmark E2E PASS`。同一Git commit/treeからの別worktree A/B、CDP Chrome実測、close/release証跡、source commit不一致、評価器hash改変、最終PASS未達、同一worktree、pair再利用を正負経路で測定した。
- 実測結果: `node C:/AI/MyBrain/bootstrap.mjs --check`はfigma-to-code required 27件を含め合格した。変更4ファイルのU+FFFDは0件、STATE.mdは既存190件で増加していない。
- 境界と判断待ち: 確定済みspec本文、`QUESTIONS.md`、`figma-gate.mjs`、gate manifest、`C:/AI/MyBrain/manifest.json`は変更していない。実Figma URL/node、A/B実装、実測report、改善効果は未作成・未判定である。comparison contract v2はClaude不在時のterra ultra代替独立批評と、改訂判断Jのowner採用まで実案件比較に使わない。

## [121] 2026-08-07 / codex（P-3凍結項目の必須化、代替独立批評待ち）

- 契機: [120]の`input/evaluator bundle`だけでは、Figma metadata・design context・screenshot、scopeのspec・page coverage・mask・閾値・gate manifest、評価器本体を記載せずに比較契約を作れる余地があった。
- 是正: `comparison contract v1`の`shared`を、Figma node map / metadata / designContexts / screenshots / assets、source snapshot、scope.specs / pageCoverage / masks / thresholds / figmaGateManifest、evaluator.fidelityBenchmark / figmaGate / bundle、Chrome/Node証跡へ分解した。assetsとmasksが無いscopeも空配列の明示を必須とし、それ以外の必須項目の欠落・hash不一致はreport生成時に停止する。Chrome版文字列が凍結証跡内に無い場合も停止する。
- 隔離E2E: 必須項目化直後に旧`inputBundle`だけを改変する負経路が成功してしまう回帰を検出した。scope.specsの凍結改変を検査する経路へ直し、`node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で再実行して`fidelity-benchmark E2E PASS`。`node --check`2件とcomparison templateのJSON parseも成功した。
- 実測結果: `node C:/AI/MyBrain/bootstrap.mjs --check`をsandbox外で実行し、共通入口仕様、figma-to-code required 27件、相対import検査を含め合格した。変更ファイルのU+FFFDは0件、STATE.mdは既存190件で増加していない。
- 境界と判断待ち: 確定済みspec本文、`QUESTIONS.md`、figma-gate、gate manifest、MyBrain manifestは変更していない。実Figma入力、A/B report、効果測定は未実施である。判断Jの条件追加は代替独立批評とowner採用待ちのままである。

## [120] 2026-08-07 / codex（P-3比較契約の起草、代替独立批評待ち）

- 契機: [119]のP-3比較設計へ、同一ページを再実装するA/Bの比較可能性、クリーンルーム、中止条件、パイロット扱いを機械的に固定する必要があると判断された。
- 実施内容: `fidelity-benchmark.mjs`のreport第2引数としてcomparison contract v1を追加した。Figma fileKey/root nodeとnode map、同一未実装source snapshot、input/evaluator bundle、Chrome/Node証跡を各SHA-256で凍結する。A/Bのpair ID・共有bundle・checkpoint plan、clean preflight、別workspace・別implementation context、Bのowner承認記録（path/SHA-256）、公開照合の適用有無を検証し、不一致なら`compare`を拒否する。`fidelity-comparison-template.json`とREADMEへ、A/Bの別clean Git worktree・相互非参照、preflight失敗時の比較中止、公開時だけのrelease-check、1組はパイロットという運用を起草した。
- 隔離E2E: `node templates/verify/fidelity-benchmark.e2e.mjs`をsandbox外で実行し`fidelity-benchmark E2E PASS`。正経路のほか、contract欠落、未凍結owner承認、checkpoint plan差分、workspace/context共有、input/evaluator hash差分、dirty preflight、未着手component、integrityのrejected attempt、凍結後input改変を拒否する負経路を固定した。`node --check templates/verify/fidelity-benchmark.mjs`および同E2E、comparison templateのJSON parseも成功した。`node C:/AI/MyBrain/bootstrap.mjs --check`はsandbox外でfigma-to-code required 27件を含め合格した。
- 境界: 今回変更したのは`templates/verify/fidelity-benchmark.mjs`、同E2E、`fidelity-comparison-template.json`、`templates/verify/README.md`だけである。確定済みspec本文、`QUESTIONS.md`、`figma-gate`、gate manifest、`C:/AI/MyBrain/manifest.json`は変更していない。実Figma URL/node、A/B scope、実測reportは未作成であり、改善効果・P-3完了は判定していない。
- 判断待ち: この起草を代替独立批評し、[判断Jの条件追加]をownerが採用するまで、comparison contractを実案件の比較根拠へ使わない。

## [119] 2026-08-07 / codex（P-3・Q-03の実測準備、owner入力待ち）

- 調査: `rg -n --hidden --no-ignore "figma\.com/design|node-id=|fileKey|rootNodeId|gridColumnSpan|min-width" . -g '!STATE-archive-corrupted-0-60.md' -g '!node_modules/**'` を実行した。実Figma URL/node-idは0件で、検出したfileKey/node-idは雛形または規則の説明だけだった。
- P-3: [112]の訂正どおり、同一ページの再測定は比較に使わない。既存実装を削除しない同一ページ・クリーンルーム再実装を推奨し、Figma URL/root node、A/B実装scope、凍結入力、component plan、viewport、評価する改善、公開照合証跡を判断Jの完成形へ分解した。
- Q-03: §5-1 / §5-2が要求するGrid（スパン無/有）2ノードとHug＋min-width 1ノードを、実案件に限定しないFigmaテストファイルで採取できるよう判断Kへ固定した。
- P-3回帰: sandbox内の`node templates/verify/fidelity-benchmark.e2e.mjs`は子process起動の`spawnSync ... node.exe EPERM`で標準エラーを捕捉できず失敗した。実行器のFAILではないことをprobeで確認し、sandbox外で同じE2Eを再実行して`fidelity-benchmark E2E PASS`を得た。
- 境界: 確定済みspec本文、QUESTIONS.md、figma-gate、MyBrain manifest、実行器は変更していない。実Figma入力を推測して採取・実装・数値報告はしていない。
- 次にやること: ownerが判断J/Kへ必要なURL/node-id/scopeを指定した後、P-3のA/B実装とQ-03実測を実行する。


- owner判断: 既存Q-05のWebP・品質80・出力パス既定は変更せず、判断Gの禁止対象を新設`asset-verify`実行器と設定見本に限定する。実行器は変換方式・品質・出力先を固定していないため、G-1受入条件と矛盾しない。これによりP-5を最終閉鎖する。
- 閉鎖根拠: [117]のterra ultra代替最終再批評でG-1/G-2技術受入は合格。各正負隔離E2E、figma-gate回帰、bootstrap、P-5根拠監査を実測済みである。`features 10 / fully covered 10 / findings 0`は4段根拠監査の機械結果としてだけ記録し、実Figma忠実度・P-3の実測効果へは読み替えない。
- 範囲: Q-05、Q-08、確定済みspec本文、QUESTIONS、figma-gate、gate manifest、MyBrain manifestを変更しない。`asset-verify`は任意の独立検証器のままであり、必須配布物・gate FAIL条件へ接続しない。
- 次にやること: P-3の比較設計と実装scope、Q-03のFigmaテスト対象のowner指定を待つ。

## [117] 2026-08-07 / terra ultra代替最終再批評（P-5 G-1/G-2 技術受入: 合格）

- 判定: G-1/G-2の技術受入は合格。G-1の実ページMIME連結（raw/normalized `Content-Type`、実output MIME比較、header欠落/非2xx、SVG/ラスター負経路）と、G-2の空search/hash厳密比較、余計なquery/hash、既到達、click以外/中間拒否、既存80ms/animationstart/lag維持を、コードと隔離E2Eで確認した。
- 実測再現: `node templates/verify/asset-verify.e2e.mjs` → PASS。`node templates/verify/motion-verify.e2e.mjs`を2回 → PASS。`node templates/verify/figma-feature-coverage.e2e.mjs` → PASS。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-07-g-final-rereview.json` → features 10 / fully covered 10 / findings 0。`node templates/verify/figma-gate.e2e.mjs` → PASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件で合格。
- 監査結果の範囲: 10/10/0は取得/spec化/変換/検証の4段根拠が存在する機械結果であり、実Figma忠実度、P-3の効果、P-5の最終閉鎖へ読み替えない。
- 境界: figma-gate/gate template/gate E2E/MyBrain manifestの`asset-verify` / `destination`参照は各0件。MyBrain manifest requiredは27件。G実装後の確定済みspec本文・`QUESTIONS.md`変更痕跡は観測されず、変更テンプレート・新規reportのU+FFFDは0件、STATE.mdは既存190件。
- 判断I: 技術受入とは分離できる。既存Q-05のWebP/品質80/path既定を変えず、G-1実行器が新規共通既定を持たない点は確認した。ただしP-5の最終閉鎖を記録するには、判断Iのowner明文化が必要である。
- 独立性: Claude不在時のterra ultra代替批評であり、別ベンダー独立批評ではない。

## [116] 2026-08-07 / codex（G-2の空query/hash是正、G-1回帰補強。代替再批評待ち）

- 契機: [115]後のterra ultra代替再批評は、G-1配信MIME是正を合格とした一方、`motion-verify-template.json`の`"search": ""`を`motion-verify.mjs`が拒否し、余計なquery/hashを厳密に落とせないとしてG-2を不合格とした。批評はClaude不在時の代替であり、別ベンダー独立批評ではない。
- G-2是正: `normalizeDestinationLocation`は未記載componentを未比較のまま保持し、明示した`search: ""` / `hash: ""`を空componentとの厳密比較として受理する。空だけで比較対象を持たないlocationは拒否する。隔離E2Eへ空search/空hashの正経路、余計なquery/hash、既到達、hover/key/none action、中間状態、空だけlocationの負経路を追加した。
- G-1回帰補強: 初回批評後に追加した配信MIME比較について、raw `Content-Type`と正規化値のreport、正常2xxのheader欠落→`referenced-mime`、非2xx→`referenced-resource`のみ、宣言output MIMEが誤っていても実バイトから観測したoutput MIMEでページ利用を比較する経路を隔離E2Eへ固定した。既存SVG/ラスターの大文字・parameter正経路、誤MIME負経路も維持した。
- 実測結果: `node templates/verify/asset-verify.e2e.mjs` → PASS。`node templates/verify/motion-verify.e2e.mjs`を2回 → PASS。`node templates/verify/figma-feature-coverage.e2e.mjs` → PASS。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-07-g-final.json` → features 10 / fully covered 10 / findings 0。`node templates/verify/figma-gate.e2e.mjs` → PASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件で合格。
- 境界実測: `figma-gate.mjs`、gate template、gate E2E、MyBrain manifestの`asset-verify` / `destination`参照は各0件。確定済みspec本文と`QUESTIONS.md`は変更していない。変更テンプレート・新規reportのU+FFFDは0件、STATE.mdは既存190件。
- 判断待ち: G-1/G-2およびP-5の合格判定はcodexが出さない。G-2是正を含む代替再批評が必要である。既存Q-05のWebP/品質/出力パス既定と、判断Gの「実行器が共通既定を持たない」の適用範囲は判断Iとしてownerの明文化待ちである。

## [115] 2026-08-07 / codex（G-1の配信MIME是正。代替再批評待ち）

- 契機: [114]後のterra ultra代替批評はG-2を合格、G-1を不合格と判定した。理由は、実ページから取得したHTTP `Content-Type` をreportに記録するだけで、登録済み変換出力の**実**MIMEと照合していなかったためである。批評はClaude不在時の代替であり、別ベンダー独立批評ではない。
- 是正: `asset-verify.mjs`で取得応答のraw `Content-Type` と正規化media typeを証跡に残し、正常取得した実ページ利用のmedia typeを、実バイトから観測した変換出力MIMEと比較する`referenced-mime` FAILを追加した。パラメータと大小文字は正規化し、header欠落は`referenced-mime`、取得失敗/非2xxは従来どおり`referenced-resource`でFAILとなる。変換方式・品質・出力パス、figma-gate、gate manifest、MyBrain manifest、確定済みspec本文、`QUESTIONS.md`は変更していない。
- 負E2E: `asset-verify.e2e.mjs`は、SVGとラスターの双方で誤ったHTTP MIMEを`referenced-mime`としてFAILすること、`IMAGE/WEBP; charset=binary`と`IMAGE/SVG+XML; charset=utf-8`の正規化正経路、既存のhash/MIME/寸法/partial alpha/未参照/未生成を固定する。
- 実測結果: `node templates/verify/asset-verify.e2e.mjs` → PASS。`node templates/verify/motion-verify.e2e.mjs`を2回 → PASS。`node templates/verify/figma-feature-coverage.e2e.mjs` → PASS。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-07-g-mime-fix.json` → features 10 / fully covered 10 / findings 0。`node templates/verify/figma-gate.e2e.mjs` → PASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件で合格。
- 境界実測: `figma-gate.mjs`、gate template、gate E2E、MyBrain manifestの`asset-verify` / `destination`参照は各0件。変更テンプレート・新規reportのU+FFFDは0件、STATE.mdは既存190件。
- 判断待ち: G-1/G-2とP-5の合格判定はcodexが出さない。G-1の是正を含む代替再批評で受入条件と隔離E2Eを再評価する。初回批評が指摘した既存Q-05の横断既定と判断G文言の適用範囲は、実行器に新規既定を入れていない本是正とは分離し、ownerの解釈確認が必要ならEscalationsで扱う。

## [114] 2026-08-07 / codex（owner採用: 判断GのG-1/G-2を実装。代替独立批評待ち）

- owner判断: ownerは「G-1・G-2とも、提示済み受入条件を満たす前提で採用」と明示した。[113]の条件付き代替批評に従い、G-1/G-2を別scopeで起草した。
- G-1実施内容: 任意の独立検証器`asset-verify.mjs`、設定見本、隔離E2Eを追加した。Figma元書き出し→登録済み変換出力→実ページ利用を、実MIME、SHA-256、intrinsic寸法、alpha分類、実URL、CSS表示寸法で照合する。SVGは実SVG MIME / `viewBox`、ラスターは実デコードと`opaque` / `binary` / `partial`を別契約にした。partial alpha劣化、未生成、未参照、MIME・寸法・hash不一致を個別FAILにする。
- G-2実施内容: `motion-verify.mjs`へclick専用`destination`を追加した。正規化した`pathname` / `search` / `hash`または描画可視selectorの一方を必須とし、遷移前後URL、待機開始・到達時刻、実待機時間、可視判定をreportへ出す。既到達、未遷移、誤hash、不可視、click以外はFAILとし、既存hover/open/80ms中間値を維持した。
- 実測結果: `node templates/verify/asset-verify.e2e.mjs` → PASS（透過WebP・SVGの正経路、hash/MIME/寸法/partial alpha/未参照/未生成の負経路）。`node templates/verify/motion-verify.e2e.mjs` → PASS（location・visibleの正経路、未遷移・誤hash・不可視・hover拒否の負経路と既存Q-08経路）。`node templates/verify/figma-feature-coverage.e2e.mjs` → PASS。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-07-g.json` → features 10 / fully covered 10 / findings 0。
- 回帰・境界: `node templates/verify/figma-gate.e2e.mjs` → PASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件で合格。`figma-gate.mjs`内`asset-verify` / `destination`参照0件、MyBrain manifest内`asset-verify`参照0件。確定済みspec本文と`QUESTIONS.md`は変更していない。
- 独立性: codexはG-1/G-2およびP-5の合格判定を出さない。Claude不在のため、次はterra ultraによる代替独立批評が必要であり、別ベンダー独立批評ではない。
- 次にやること: G-1/G-2の代替独立批評で受入条件、隔離E2E、P-5 covered根拠、manifest/gate非接続を評価する。

## [113] 2026-08-07 / user提示の代替批評（判断G: 条件付き承認）

- 批評結論: G-1/G-2は現状のまま実装せず、受入条件を追加した上でownerが個別採否する。これはClaude不在時の代替批評であり、別ベンダー独立批評ではない。
- G-1受入条件: Figma元書き出し→登録済み変換出力→実ページ利用を、実MIME、hash、intrinsic寸法、alpha分類、実URL、CSS表示寸法で一意に結ぶ。SVGとラスターは別契約とし、partial alpha劣化、未生成、未参照、形式・寸法・hash不一致を個別FAILにする。変換方式・出力パスを案件横断で固定しない。
- G-2受入条件: click専用`destination`を、正規化したpathname/search/hashまたは描画可視selectorのどちらか必須で設計する。遷移前後URL、待機時刻、可視判定をreportへ残し、未遷移・誤hash・不可視を負E2Eで固定する。既存hover/open/80ms中間値のE2Eを維持する。
- 配布境界: `asset-verify`は案件が必要なときだけ使う独立検証器であり、MyBrain manifestのrequiredへ加えない。figma-gate、gate manifest、既存FAIL条件は変更しない。P-5カタログは実装・隔離E2E・根拠監査の完了までcoveredへ更新しない。
- 次にやること: ownerがEscalationsの完成形でG-1/G-2を個別に承認した場合だけ、別scopeで起草・隔離E2E・代替批評を行う。

## [112] 2026-08-07 / codex（terra ultra指摘: 判断Gの先行実装を撤回）

- 事実: [111]でG-1/G-2の実行器・READMEを、判断Gの独立批評とowner個別採否より先に変更した。判断Gは承認まで既存manifestを変更せず、提案を自動適用しない契約であり、この順序は不適切だった。
- 是正: `asset-verify.mjs`、設定見本、隔離E2Eを削除し、`motion-verify.mjs`・同E2E・設定見本から遷移先検査を撤回した。READMEの通常配布・実行手順への記載も復元した。figma-gate、MyBrain manifest、P-5カタログは変更していない。
- P-3訂正: 同一ページの再測定比較は初回実装を測れないため採用しない。ownerは別ページ比較または同一ページ再実装の設計と、実Figma・実装scope・checkpointを指定する。単発reportだけはこの判断と分離して有効である。
- Q-03訂正: 実案件に限定しない。Gridのスパン有無2ノードとHug＋min-widthノードを持つFigmaテストファイル、または案件nodeで実測する。
- 次にやること: P-5 G-1/G-2は代替独立批評とowner採否後に初めて再起草する。

## [111] 2026-08-07 / codex（判断Gの実装案: 配布・独立批評待ち）

- 契機: ownerの「残務の対応をしろ」に基づき、[577]のG-1/G-2を実装可能な範囲で起草した。確定済みspec、QUESTIONS、figma-gateは変更していない。
- 実施内容: G-2として`motion-verify.mjs`へclick後の`destination.url` / `hash` / `visibleSelector`の待機・照合を追加し、URL/hash/可視状態に到達しない状態を`motion-state-failed`に記録する。G-1として新規`asset-verify.mjs`、設定見本、正負隔離E2Eを追加した。Figma書き出しと登録済み変換出力のformat、intrinsic寸法、alpha、SHA-256、同一入力、CDP上の実URL・CSS表示寸法を照合する。
- 実測結果: `node templates/verify/motion-verify.e2e.mjs`を2回、`node templates/verify/asset-verify.e2e.mjs`、`node templates/verify/figma-feature-coverage.e2e.mjs` → PASS。変更7ファイルのU+FFFDは0件、STATE.mdは既存190件。
- 判断待ち: `C:/AI/MyBrain/manifest.json`への`asset-verify.mjs` / 設定見本 / E2Eの配布登録、ならびにP-5カタログをcoveredへ更新することは、判断Gの明示承認とClaude代替terra ultra批評の後に行う。現在はREADMEへ利用手順を記録しただけで、figma-gateには接続していない。
- 次にやること: G-1/G-2の代替独立批評、owner承認後のmanifest・カバレッジ反映とbootstrap再検証。P-3は固定Figma入力、Q-03はGrid/Min-Maxを含む実案件の指定待ち。

## [110] 2026-08-07 / codex（owner承認: unverified-figma-valueを別経路完了で閉鎖）

- 承認: ownerは、現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`について、P-1aのowner直接指示で同一の強化と負のE2Eが完了済みであるため、`completed-outside-promotion`として閉じることを明示承認した。
- 実施内容: `node tools/figma-log-promote.mjs close`で、proposal ID・path・SHA-256・承認を含む閉鎖入力を検証し、`proposals/current.json`の`unverified-figma-value`を`current: null`、`closed` 1件へ更新した。不変のclosure receiptを生成し、`promoted`、review receipt、applyは作成していない。
- 実測結果: close → `PASS close completed-outside-promotion`。scan → `PASS no-recurring-failure: 18 promotable / 26 non-promotable / 0 unclassified / 0 proposal`。`node tools/figma-log-promote.e2e.mjs` → PASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → required 27件を含め合格。
- 次にやること: P-3の固定入力、判断G、Q-03の実案件測定だけがowner判断または案件入力待ちとして残る。STATEの履歴[107]〜[97]には触れず、[109]の無効化記録を維持する。

## [109] 2026-08-07 / codex（STATE履歴の書換え事故を記録）

- 事実: [108]のCurrent更新時、置換対象をCurrent節へ限定しなかったため、[107]〜[97]の各`次にやること`行にもCurrentと同じ文面が入った。仕様、QUESTIONS、rules、検証器、proposal、closure / promotion recordはこの操作で変更していない。
- 復旧境界: 保存済みのローカル履歴と復元ポイントを読み取り確認したが、書換え前のSTATE原文は取得できなかった。原文を推測して復元しない。該当する履歴行は無効であり、各Log本文と後続Logに記録された事実を正本として読む。
- 現在地: Current節と[108]の判断E結果はこの事故の前後で内容を個別実測しており、現行事実として有効である。STATE.mdのU+FFFDは更新前後とも既存190件。
- 次にやること: STATEの履歴を部分置換で更新しない。更新はCurrent節を境界付きで編集し、Logは追記だけに限定する。
## [108] 2026-08-07 / codex + terra ultra（判断Eの実装・是正・代替独立批評: 合格）

- 契機: ownerの「必要なものから対応」に基づき、[96]の推奨分岐を実装対象とした。検証器を持てない訂正を未分類のまま停止させず、理由付きで非昇格として記録する。ただし既存のowner承認を要する提案閉鎖は含めない。
- 実施内容: `tools/figma-log-promote.mjs`へ`promotability`を追加した。`non-promotable`は一行20文字以上の理由を必須とし、rule/verifier targetを禁止する。`scan`は非昇格をレポートに残してpromotableだけでproposal生成を続け、真の未分類は従来どおり`waiting-human`で停止する。`record`入力・E2Eにも正負経路を追加した。
- 分類是正: 初回分類の11件に実際には再現しない`figma-gate.e2e.mjs`を割り当てていたため、terra ultra批評の指摘を受けて個別理由付き非昇格へ戻した。既存のscope実行フェンス記録には、allowlist内で対象外変更をFAILにする`tools/figma-scope-lock.e2e.mjs`を追加した。
- 実測結果: `node tools/figma-log-promote.mjs scan rules/log-promotion-policy.json learning/log-promotions` → `18 promotable / 26 non-promotable / 0 unclassified / 1 proposal`。`node tools/figma-log-promote.e2e.mjs`、`node tools/figma-scope-lock.e2e.mjs`、`node templates/verify/loop-learn.e2e.mjs`、`node C:/AI/MyBrain/bootstrap.mjs --check`（figma-to-code required 27件）→ PASS。変更・関連ファイルのU+FFFDは0件、STATE.mdは更新前の既存190件。
- 批評結論: terra ultraは、残る18件のverifier targetがallowlist内の実在する負のE2Eに接続し、11件の非昇格契約も満たすとして**判断E 合格**と判定した。Claude不在時の代替であり、別ベンダー独立批評ではない。codexは自己合格を出していない。
- b94の状態: `b94f11bd4b566549`はsource SHA変化によりsuperseded、現行proposalは`66a72cdb86aa026a`である。closure / promotion / owner承認済みの完了記録は作成していない。現行proposalを別経路完了として閉じるにはownerの明示判断が必要である。
- 次にやること: b94の後継である現行proposalの閉じ方をownerが決めるまで、review / apply / completed-outside-promotionを実行しない。P-3固定入力、判断G、Q-03実案件測定はそれぞれowner判断または案件入力待ちとして維持する。
## [107] 2026-08-07 / terra ultra（Claude代替例外・P-4統合後最終再批評: 合格）

- 契機: [106]で、[105]の不合格理由だったrelease-checkの別Chrome経路、layout/capture/Q-13/Q-08のsession/PID照合、P-4入力のpre/post-batch凍結、保存済み証跡の再結合を是正し、起草者以外のterra ultraへ再批評を依頼した。
- 批評結論: **P-4統合 合格。** checkpoint、section close、scope close、release-checkのQ-09/Q-13/Q-08は同一CDP browser batchで実行される。公開URLの全頁release batchは単体`verify-layout.mjs`を起動せず、layout / accessibility / motion証跡が同一session ID・PIDであることを実行器とgateの二層で検査する。
- 実測結果: `node templates/verify/verify-layout.e2e.mjs` / `accessibility-verify.e2e.mjs` / `motion-verify.e2e.mjs`を3回 / `gate-browser-batch.e2e.mjs` / `gate-contract-audit.e2e.mjs` / `loop-learn.e2e.mjs` / `figma-feature-coverage.e2e.mjs` / `node C:/AI/MyBrain/bootstrap.mjs --check`（figma-to-code required 27件）/ `node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check` → PASS。feature coverage auditは`features 10, fully covered 8, findings 2`であり、PASS・完全被覆には読み替えない。
- 実測結果（統合E2E）: 批評者が`node templates/verify/figma-gate.e2e.mjs`を実行上限300秒で独立再実行し、144.5秒・exit 0・`figma-gate E2E PASS`を再現した。前回124秒のタイムアウトは実行上限不足であり、実装不適合ではない。release full-pageのsession/PID不一致・layout FAIL、8件の実行器側session/PID不一致、保存済みlayout/capture/Q-13/Q-08証跡改ざん、phase入口・batch中・release-check中のP-4入力改変は隔離負経路でFAILを固定する。
- 判断H/F: 判断HのCSS `opacity`規則はowner承認適用済みとして閉じてよい。判断FのP-4 gate統合も完了として記録してよい。`spec/13-accessibility.md`の現行本文と`spec/QUESTIONS.md`はSTATE記録と整合する。ただし非Git管理のため、過去から承認範囲外の変更がなかったことは履歴として証明できない。
- 独立性: この合格はClaude不在時の**terra ultra代替批評**であり、別ベンダーによる独立批評ではない。起草者codexは自己合格を出していない。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [106] 2026-08-07 / codex（P-4統合: terra ultra代替批評の不合格を是正。再批評待ち）
- 契機: [105]の統合後批評は**P-4統合 不合格**とした。`release-check`がcomponentごとの同一session batch後に単体`verify-layout.mjs`を起動し、別Chromeで公開URLのQ-09再測定をしていたためである。あわせてlayoutのsession/PID照合、P-4入力凍結の改変E2E、保存済み証跡の再結合E2Eが不足していると指摘された。
- 是正（release-check）: 単体`verify-layout.mjs`起動を削除し、公開URLの全specをQ-13/Q-08と同一CDP sessionで測定する`release-full-page` browser batchへ置換した。component別の公開再測定とpainted差分は維持し、全頁batchのlayout / accessibility / motion・job・summaryのSHA-256とsession/PIDをrelease recordとgate stateへ保存する。
- 是正（同一session・証跡）: `gate-browser-batch.mjs`はlayout結果のsession/PIDを実行時に照合する。gate側もlayout、capture、Q-13、Q-08のsession/PIDをbatch evidenceと再照合し、checkpoint stateが差し替えられてもsection-close/closeへ進めない。
- 是正（凍結入力）: accessibility config、motion config、axe sourceをbatch起動後にも`assertFrozenInputs`で再照合する。batch実行中のP-4設定改変はcheckpoint/release-checkをFAILにする。section-start、section-close、close、release-checkの入力改変負経路も隔離E2Eへ追加した。
- 実測結果: `node templates/verify/figma-gate.e2e.mjs` → PASS。公開releaseの正常経路はcomponent 5件 + full-page 1件の計6 browser batchを記録し、単体`verify-layout`起動はfixtureで即FAIL・log不在を確認する。full-page layoutのsession不一致、PID不一致、layout FAIL、およびQ-13/Q-08/capture/layoutの保存済み証跡不一致はすべて負経路でFAILを固定した。
- 実測結果（回帰）: `node templates/verify/verify-layout.e2e.mjs` / `accessibility-verify.e2e.mjs` / `motion-verify.e2e.mjs`を3回 / `gate-browser-batch.e2e.mjs` / `gate-contract-audit.e2e.mjs` / `loop-learn.e2e.mjs` / `fidelity-benchmark.e2e.mjs` / `correction-receipt.e2e.mjs` / `tools/figma-log-promote.e2e.mjs` / `figma-feature-coverage.e2e.mjs` → すべてPASS。batch E2Eはlayout・capture・Q-13・Q-08の各session/PID不一致を8負経路でFAILにする。feature coverage auditは`features 10, fully covered 8, findings 2`のまま。
- 実測結果（配布・境界）: `node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件を含め合格。`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check` → PASS。`rg -n 'MyBrain/verify/verify-layout\\.mjs' templates/verify/figma-gate.mjs`、`rg -n 'accessibility-verify|motion-verify' templates/verify/figma-gate.mjs` → いずれも0件。変更テンプレート・レポートはU+FFFD 0件、STATE.mdは更新前の既存190件。
- 独立性: codexは是正後のP-4統合を自己合格にしない。Claude不在のためterra ultraによる代替再批評が必要であり、別ベンダー独立批評ではない。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測
## [105] 2026-08-06 / codex（owner承認H/Fの適用：Q-13/Q-08を同一CDP sessionでfigma-gateへ統合。terra ultra代替再批評待ち）
- 契機: owner指示「承認」により、Escalationsの判断H完成形と判断F完成形を採用した。
- 実施内容（判断H）: `spec/13-accessibility.md` §3-3へ、対象または祖先のCSS `opacity`を各描画groupへ順に乗算し単色背景へalpha合成した実効前景色・実効背景色でWCAG比を計算し、下層まで単色に解決できない場合は人間判定リストへ送る規則を追加した。画像・gradient・blend mode・重なり描画要素の境界、閾値、例外規則、`spec/QUESTIONS.md`は変更していない。
- 実施内容（判断F）: gate contractをv3へ上げ、`scope.accessibilityPath` / `scope.motionPath`とaxe sourceの存在・SHA-256をpreflightで凍結する。checkpoint、close、release-checkは新規`gate-browser-batch.mjs`の一つのChrome/CDP sessionでQ-09 PC/SPレイアウト実測・撮影、Q-13、Q-08を連続実行する。Q-13/Q-08の機械FAILは`SPEC FAIL`として停止し、人間判定リストは証跡だけに残す。`gate-contract-audit.mjs`はv3未接続manifestを`legacy-scopes.json`の台帳なしに残すとFAILにする。
- 実測結果: `node templates/verify/verify-layout.e2e.mjs` / `accessibility-verify.e2e.mjs` / `motion-verify.e2e.mjs` / `gate-browser-batch.e2e.mjs` → すべてPASS。後者は正経路のcapture / accessibility / motionのsession ID・PID一致、Q-13コントラストFAILとQ-08期待値不一致の負経路を固定する。`node templates/verify/figma-gate.e2e.mjs` → PASS（checkpoint / close / release-checkのbatch回数15件と同一session証跡を検査）。
- 実測結果（回帰・配布）: `node templates/verify/gate-contract-audit.e2e.mjs` / `fidelity-benchmark.e2e.mjs` / `correction-receipt.e2e.mjs` / `tools/figma-log-promote.e2e.mjs` / `loop-learn.e2e.mjs` / `figma-feature-coverage.e2e.mjs` → すべてPASS。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-06.json` → `features 10, fully covered 8, findings 2`。`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 27件を含め合格。
- 境界の実測: `rg -n "accessibility-verify|motion-verify" templates/verify/figma-gate.mjs` → 0件（単体実行器を別Chromeで後付けしない）。変更テンプレート・レポートのU+FFFDは0件、STATE.mdは更新前の既存190件。
- 独立性: codexは統合後の合格判定を出さない。Claude不在のため、terra ultraによる代替再批評が必要であり、別ベンダー独立批評ではない。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測
## [104] 2026-08-06 / terra ultra（Claude代替例外・P-4最終再批評: 合格）
- 契機: [103]でQ-08の再批評不合格3件（lag負E2Eの非決定性、アクション前開始のFAIL欠落、`animationstart` E2E欠落）を是正し、起草者と別のterra ultraへ最終再批評を依頼した。
- 批評結論: **P-4 合格。** Q-08では、`sampleLagMs > maxSampleLagMs`の`sample-lag` FAIL、`transitionStartedAtMs < actionStartedAtMs`の`transition-before-action` FAIL、実CSS `@keyframes`の`animationstart`中間値採取をそれぞれ実装・E2Eで確認した。Q-13のUI自身のopacity、兄弟描画層、human review理由の既存合格事項も後退していないと判定した。
- 実測結果: `node templates/verify/motion-verify.e2e.mjs`を3回 → すべてPASS。`node templates/verify/accessibility-verify.e2e.mjs` → PASS。`node templates/verify/figma-gate.e2e.mjs` → PASS。`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check` → PASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → required 26件を含めPASS。`figma-gate.mjs`の`accessibility-verify` / `motion-verify`参照は0件。変更テンプレートはU+FFFD 0件、STATE.mdは既存190件。
- bootstrapの測定境界: 制限sandboxでは`bootstrap.mjs`が内部で起動する`workflow-entrypoints.mjs --self-check`の子Nodeが拒否され、共通入口仕様NGとなる。一度の暫定不合格はこの環境要因だった。子Nodeを許可した通常のローカル実行環境で直接再測定し、自己検査・bootstrapともexit 0を確認してから上記結論へ改訂した。
- 判断待ち: この批評はClaude不在時のterra ultra代替であり、別ベンダー独立批評ではない。判断HはQ-13 §3-3のopacity規則同期としてowner承認へ進められる。P-4合格により判断Fもowner判断へ進められるが、承認前の`figma-gate`接続、確定済みspec本文、QUESTIONS.mdの変更は行わない。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [103] 2026-08-06 / codex（P-4: Q-08の再批評不合格3件を是正。terra ultra最終判定待ち）
- 契機: terra ultra代替批評は、Q-13の3事項を合格とした一方、Q-08について (1) `maxSampleLagMs: 0` のlag超過FAIL負E2Eが非決定的、(2) `actionToTransitionMs < 0` をFAILにしていない、(3) `animationstart` 経路のE2Eが無い、と指摘した。P-4全体は不合格のままとされた。
- 実施内容: `motion-verify.mjs`に、CSS開始時刻がアクション時刻より前なら`transition-before-action`としてFAILにする判定を追加した。既存の`sample-lag`と同じ`timingMismatches`へ蓄積し、期待値が一致してもstateをFAILにする。
- 実施内容（隔離E2E）: 中間値採取に使う次のページtimerをfixture内で一度だけ100ms遅延させ、`sampleLagMs >= 50`をE2Eの前提として検査する。従来の偶発的なbusy loopには依存しない。`maxSampleLagMs: 0`で`sample-lag` FAILとなる負経路、テスト専用のアクション前`transitionstart`で`transition-before-action` FAILとなる負経路、実CSS `@keyframes`による`animationstart`中間値の正経路を追加した。
- 実測結果: 制限実行環境ではChrome DevTools endpointの起動待機がtimeoutしたため、ブラウザE2Eは通常のローカル実行環境で実測した。`node templates/verify/motion-verify.e2e.mjs`を3回連続実行 → すべて`motion-verify E2E PASS`。`node templates/verify/accessibility-verify.e2e.mjs` → PASS。`node templates/verify/figma-feature-coverage.e2e.mjs` → PASS。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-06.json` → `features 10, fully covered 8, findings 2`。`node templates/verify/figma-gate.e2e.mjs`、`verify-layout.e2e.mjs`、`loop-learn.e2e.mjs`、`fidelity-benchmark.e2e.mjs`、`correction-receipt.e2e.mjs`、`tools/figma-log-promote.e2e.mjs` → すべてPASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → figma-to-code required 26件が合格。
- 実測結果（境界）: `rg -n -i "accessibility-verify|motion-verify" templates/verify/figma-gate.mjs` → 参照0件。`motion-verify.mjs`、`motion-verify.e2e.mjs`、README、再生成したfeature-coverage JSON/MermaidはU+FFFD 0件、STATE.mdは既存190件のまま。確定済みspec本文、QUESTIONS.md、判断H/F/G、`figma-gate`接続は変更していない。
- 判断待ち: codexはP-4の合格判定を出さない。terra ultraによる最終判定が必要であり、これはClaude不在時の代替であって別ベンダー独立批評ではない。判断Hはowner承認待ち、`figma-gate`接続は判断Fまで未実施。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [102] 2026-08-06 / codex（P-4: terra ultra代替批評の不合格4件を是正。再批評待ち）
- 契機: Claudeが利用不可のためowner指示でterra ultraを代替批評役にした。その批評はP-4を不合格とし、(1) UI対象自身の`opacity` / `background-image` / `mix-blend-mode`の見落とし、(2) 兄弟描画層の部分重なり、(3) 人間レビュー理由のE2E不足、(4) Q-08でアクション時刻とCSS遷移開始を区別しない点を指摘した。P-5のneedle下限とSHA-256説明は合格だった。
- 実施内容（Q-13）: `backgroundScope: "behind"`を背景色の選択だけに限定し、対象自身の`opacity`は前景へ常に合成し、対象自身の`background-image` / `mix-blend-mode`は常に人間レビューへ送るよう分離した。祖先以外の画像・gradient・blend・img/video/canvas等は、対象矩形と交差すれば中心一点だけで単色と断定せず人間レビューへ送る。祖先背景は不透明の`background-color`で探索を止める既存境界を維持した。
- 実施内容（Q-13 E2E）: UI自身のopacityでborder色が未達になる負経路、UI自身の画像/blend、部分的な兄弟gradient、img/video/canvas、opacity未解決、色未解決、不可視対象、祖先画像を不透明面で遮蔽する経路を固定した。
- 実施内容（Q-08）: 中間状態に`transitionSelector`と、案件・実行環境の初回測定を根拠にした必須`maxSampleLagMs`を追加した。ページ内の`transitionstart` / `animationstart`を起点に採取し、アクションから遷移開始までの時間・実経過・lagを報告する。lagが設定上限を超えた場合は期待値が一致してもFAILにする。案件横断の推測値は置かず、templateは初回実測を要求するplaceholderとした。
- 実施内容（Q-08 E2E）: action後に遅れて開始する遷移で、アクション時刻とCSS遷移開始を別々に記録すること、実測lag上限超過がFAILになることを固定した。
- 実測結果: `node templates/verify/accessibility-verify.e2e.mjs` → `accessibility-verify E2E PASS`。`node templates/verify/motion-verify.e2e.mjs` → `motion-verify E2E PASS`。`node templates/verify/figma-feature-coverage.e2e.mjs` → `figma-feature-coverage E2E PASS`。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-06.json` → `features 10, fully covered 8, findings 2`。`node C:/AI/MyBrain/bootstrap.mjs --check` → 合格（figma-to-code required 26件）。
- 判断待ち: codexは合格判定を出さない。P-4はterra ultraによる再批評待ちであり、これはClaude不在時の代替であって別ベンダー独立批評ではない。判断Hはowner承認待ち、`figma-gate`接続は判断Fまで未実施。確定済みspec本文とQUESTIONS.mdは変更していない。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [101] 2026-08-06 / codex（P-4/P-5: claude批評6指摘への反映。再独立批評待ち）
- 契機: claudeの独立批評はP-4を不合格、P-5を合格（medium 1件）とし、Q-13のCSS `opacity`、人間レビュー境界とfixture、Q-08中間値の時計、P-5の根拠needle長とSHA-256の説明を指摘した。D-001 / D-005に従い、codexは合格判定を出さず、各指摘を実装と隔離E2Eへ反映した。
- 指摘1: **反映した。** `accessibility-verify.mjs`の`effectiveColors`は対象から祖先までの`opacity`を、背景と前景を含む描画groupへ順に乗算して下層の単色背景へ合成し、実効色で比を判定する。E2Eは`opacity: 0.5`の`#707070`テキストをコントラストFAIL 1件として固定した。Q-13 §3-3にはCSS `opacity`の規則が明記されていないため、判断Hへ追記案を分離した。
- 指摘2: **反映した。** `humanReason`は単色・alpha=1・`opacity: 1`の背景へ達した時点で祖先探索を打ち切り、その不透明面より下の背景画像を人間レビュー理由にしない。画像・gradient・blend modeと判定領域へ重なる描画要素は従来どおり人間レビューとする。
- 指摘3: **反映した。** 隔離fixtureにbackground-image/gradient、blend mode、重なり`img`、および不透明面で遮蔽された祖先background-imageを追加した。前3者の理由コードと、遮蔽例が機械判定に残ることをE2Eで検査する。
- 指摘4: **反映した。** `motion-verify.mjs`はアクションイベント時のページ内`performance.now()`を起点にし、その絶対時刻から`sampleAtMs`までページ内timerで待機する。レポート`timing`へ開始、採取、実経過、要求値との差を残し、E2Eは80ms以上の実経過と時刻順を検査する。Node側の`delay(sampleAtMs)`は中間状態の測定経路から除いた。
- 指摘5: **反映した。** `figma-feature-coverage.mjs`の`evidence.needle`を20文字以上必須にした。隔離E2Eは短いneedleを入力時点で拒否する負経路を追加し、正本カタログの根拠文字列も実在する20文字以上の文字列へ更新した。
- 指摘6: **反映した。** READMEにSHA-256は監査時点の根拠同定であり、前回値との差分を自動検出・FAILにする制御ではないと明記した。根拠文字列が残る意味劣化は独立レビューで扱う。
- 実測結果: `node templates/verify/accessibility-verify.e2e.mjs` → `accessibility-verify E2E PASS`。`node templates/verify/motion-verify.e2e.mjs` → `motion-verify E2E PASS`。`node templates/verify/figma-feature-coverage.e2e.mjs` → `figma-feature-coverage E2E PASS`。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-06.json` → `features 10, fully covered 8, findings 2`。`node C:/AI/MyBrain/bootstrap.mjs --check` → 合格（figma-to-code required 26件）。
- 判断待ち: CSS `opacity`の明文化は判断Hのowner承認待ち。P-4/P-5は変更後のclaude再独立批評待ちであり、`figma-gate`接続は判断Fまで未実施。確定済みspec本文とQUESTIONS.mdは変更していない。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測
## [100] 2026-08-06 / codex（P-4: Q-13コントラスト境界のspec同期）
- 契機: P-4実装の`humanReason`が`opacity < 1`を一律に人間レビューへ送っていた。Q-13 §3-3は「祖先の半透明`background-color`の下が単色ならアルファ合成して機械判定」と定め、除外は画像・グラデーション・blend・重なり描画要素・下が単色に解決できない半透明に限定している。一律除外は仕様より広かった。
- 実施内容: opacityだけの除外を削除し、READMEの人間判定境界も「不透明でない合成」から「下が単色に解決できない半透明背景」へ同期した。背景画像・グラデーション・blend mode・描画要素の重なりの除外は維持した。
- 実測結果: `node templates/verify/accessibility-verify.e2e.mjs` → PASS。隔離fixtureに`opacity: 0.85`の単色背景テキストを加え、`humanReview`へ送らず機械コントラスト判定に残ることを検査した。既存のaxe違反FAIL経路も同じE2EでPASSした。
- 判断待ち: この同期後のP-4実装もD-001 / D-005によりclaude独立批評待ち。figma-gate接続は判断Fまで未実施。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [99] 2026-08-06 / codex（P-5: 監査グラフの独立成果物化）
- 契機: P-5監査のMermaidグラフがJSON内の文字列だけでは、レビュー時に取り出しづらい。
- 実施内容: `figma-feature-coverage.mjs audit`がJSONレポートと同名の`.mmd`を同時出力するようにした。隔離E2EはJSONのgraph fieldだけでなく`.mmd`実体も検査する。
- 実測結果: `node templates/verify/figma-feature-coverage.e2e.mjs` → PASS。`node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-06.json` → 10機能、全4段被覆8件、提案2件。JSONは`learning/feature-coverage/2026-08-06.json`、Mermaid graphは`learning/feature-coverage/2026-08-06.mmd`へ出力された。
- 判断待ち: [98] と同じく、提案2件の採用前にclaude独立批評と判断Gが必要。監査器はfigma-gateへ未接続。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [98] 2026-08-06 / codex（P-5: 予防的Figma機能カバレッジ監査）
- 契機: `rules/corrections.md` の `proactive-fidelity-improvement` は、失敗後の訂正ログだけでなく、案件投入前にFigma機能の取得・spec化・変換・検証の対応を監査し、未対応・検証不能・根拠不足を改善提案にすることを要求している。既存の`figma-page-coverage.mjs`はページsectionの被覆を扱うため、この4段監査の代替にはならない。
- 実施内容: `figma-feature-coverage.mjs`、案件用`figma-feature-coverage-template.json`、正本自身を監査する`figma-feature-coverage-catalog.json`、隔離E2Eを追加した。covered宣言は実在ファイルの根拠文字列・SHA-256・行番号で検査し、文字列消失は根拠不足へ降格する。未対応・検証不能・根拠不足はMermaidグラフと`pending-independent-review`提案として出力する。`--strict`は提案をFAILにできるが、`figma-gate`には接続していない。README導入節と`C:/AI/MyBrain/manifest.json`のrequired配布物2件（required合計26件）を追加した。確定済みspec本文とQUESTIONS.mdは変更していない。
- 実測結果: `node templates/verify/figma-feature-coverage.mjs audit templates/verify/figma-feature-coverage-catalog.json learning/feature-coverage/2026-08-06.json` → **10機能、全4段被覆8件、提案2件**。出力は`learning/feature-coverage/2026-08-06.json`。提案は (1) raster/vector assetsの変換段が未対応（`asset-verify.mjs`の契約候補） (2) prototype interactionsの遷移後URL/到達状態が現行`motion-verify.mjs`で検証不能、の2件。これは正本に穴があるという静的監査結果であり、初回実装の忠実度実測値ではない。
- 実測結果: `node templates/verify/figma-feature-coverage.e2e.mjs` → PASS（全被覆の正経路、根拠消失・path traversal・strict FAILの負経路）。`node templates/verify/motion-verify.e2e.mjs` → PASS（80ms中間値fixtureの遷移時間を1秒へ延ばし、実行負荷で完了状態を読まないようにした）。`node templates/verify/accessibility-verify.e2e.mjs` → PASS。構文検査6件・設定JSON4件 → PASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → 合格（figma-to-code required **26件**）。
- 判断待ち: D-001 / D-005によりP-4/P-5の合格判定はclaude独立批評待ち。P-5の2提案は正本・実行器を自動変更しない。独立批評後、Escalationsの判断Gでowner採否を求める。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [97] 2026-08-06 / codex（P-4: Q-13・Q-08の独立実行器と隔離E2E）
- 契機: Q-13（axe-core、単色背景コントラスト、キーボード4条件）とQ-08（hover / open / 遷移中間値）の仕様は確定済みだが、正本`templates/verify/`に実行器が無かった。
- 実施内容: `accessibility-verify.mjs`を追加。案件が固定したローカル`axe-core` sourceをCDP注入し、WCAG 2.0/2.1 A・AAタグを固定実行する。ルール除外は拒否し、承認済み例外だけを違反ノード単位で記録する。単色へ解決できる背景だけをWCAG比で判定し、画像・グラデーション・blend・解決不能な合成は`humanReview`へ出す。開閉UIは閉/開の両状態でTab到達性・DOM順・フォーカス可視を走査し、モーダルはtrap/Esc/復帰を追加検査する。`motion-verify.mjs`を追加し、状態ごとにCDP操作後のcomputed style・属性と、`sampleAtMs`の中間値範囲を照合する。両方とも既存`cdp-browser.mjs`を再利用し、`figma-gate`には未接続である。
- 実施内容: 設定見本2件、隔離E2E2件、`templates/verify/README.md`の導入節、`C:/AI/MyBrain/manifest.json`のrequired配布物4件を追加した。spec本文とQUESTIONS.mdは変更していない。
- 実測結果: `node templates/verify/accessibility-verify.e2e.mjs` → PASS（正常fixtureとaxe違反fixtureの正負経路）。`node templates/verify/motion-verify.e2e.mjs` → PASS（閉/hover/開/80ms中間値の正常経路と誤期待値FAIL経路）。`node templates/verify/figma-gate.e2e.mjs` → PASS、`verify-layout.e2e.mjs` / `loop-learn.e2e.mjs` / `fidelity-benchmark.e2e.mjs` / `correction-receipt.e2e.mjs` / `tools/figma-log-promote.e2e.mjs` → すべてPASS。`node C:/AI/MyBrain/bootstrap.mjs --check` → 合格（figma-to-code required 24件）。
- 判断待ち: `figma-gate`接続は新しいFAIL条件になるため、Escalationsの判断Fへ完成案を記録した。D-001 / D-005により、この実装の合格判定はclaudeによる独立批評待ちであり、codex自身は合格判定しない。
- 次にやること: ①owner判断: 現行提案`figma-log-unverified-figma-value-66a72cdb86aa026a`を、別経路完了として閉じるか、実際のreview/applyへ進めるか ②P-3の初回実測対象となる実Figmaページの指定 ③判断G: P-5の2改善提案を採用するか ④該当Figma機能を含む最初の案件でQ-03 §5-1 / §5-2を実測

## [96] 2026-08-06 / codex + claude（判断E 最終確認。**縮約は誤り、再反論2件は成立**。決定可能な形に整理）
- codexの判定は「不合格」だが、内訳は claude 2勝・codex 1勝・1件は読み違いだった。往復を続けても収束しないため、ここで決定可能な形にまとめる。
- **(3) 第三案の件 → claudeの再反論が成立**。codexは「完全同一とは言えない」としたが、その根拠は「**既存の『未分類は停止』動作と異なる**」であり、**claudeの選択肢1と比べていない**。codex自身が挙げた差分点「`promotable` / `nonPromotable` の分離条件を追加し、提案対象を `promotable` のみに絞る」は、**選択肢1（非昇格状態を足す）の定義そのもの**である。現状実装との比較を選択肢1との比較にすり替えている。
- **(4) 言い換えの実例 → claudeの主張が確定**。codexは判定2に対し **「示せない」と明記**した。認識・方針の訂正を、正直な `verifierTargets` を持つ検証可能な規則強化へ言い換えた実例は提示されなかった。よって「言い換えだけで全件を処理する道（選択肢2）は、必ず不正直な割り当てに戻る」は維持される。
- **(総括) codexの読み違い**。codexは「`parseMetadata` に `promotability` の処理が無く `scan` は停止判定にするので『実装案が一致』は成立しない」としたが、claudeが述べたのは**これから行う実装案の一致**であって現行コードの状態ではない。codex自身が質問5で示した変更箇所がそれである。ただし「実装案」という語が現行実装と読まれ得た点は claude の書き方の問題でもある。
- **(縮約) codexの指摘が妥当。claudeの整理は不十分だった**。「オーナーが決めるのは一点」としたが、実際には**1つの決定と3つの設計分岐**が残る。訂正する。
- **決定可能な形（claude推奨つき）**:
  - **決定**: 検証器を持てない訂正を「非昇格（理由必須）」としてツールに記録させる変更を認めるか。認める場合の変更は `tools/figma-log-promote.mjs` のみで、`log-promotion-policy.json` と既存8件・4提案には触れない。
  - **分岐1（非昇格の判定基準）** — 推奨: 「その訂正の失敗を再現・検知できる検証器が `allowedVerifierTargets` 内に存在しない」場合に限る。理由文を必須（20文字以上、なぜ検証器を書けないかを書く）。`w3cSkip` の `reason` 必須と同じ扱い。
  - **分岐2（`scan` の停止条件）** — 推奨: `promotable` だけで提案生成を継続し、非昇格はレポートに明細を出す。現行の「未分類が1件でもあれば全停止」は、**1件の分類漏れで学習全体が止まる設計**であり、実際に36件たまるまで誰も気づかなかった（[90]）。停止を維持したまま非昇格を足しても、この欠陥は残る。
  - **分岐3（言い換えとの優先順位）** — 推奨: 検証器を書けるなら**必ず言い換えを優先**し、非昇格は最後の手段とする。判定基準は「allowlist 内の検証器で、その失敗を再現する負のE2Eが書けるか」。書けるなら非昇格にしてはならない。
- 環境の実測: `codex-cli 0.142.1`。`codex models list` はこの版に存在しない（`unexpected argument 'list'`）ため、許可規則の `Bash(codex models *)` は現在使えない。利用可能モデルは実測で `spark` のみ。

## [95] 2026-08-06 / codex（claudeの判断E批評を再検証: **不合格**。2件は妥当、2件は再反論）
- 契機: kazu 指摘「判断Eもcodexに確認させろ」。[94] の判断E批評は claude の主張であり、独立検証を経ていなかった。
- **claudeの誇張2件（codexの指摘が妥当。訂正する）**:
  - (1) 「(ii)の設計は `figma-log-promote.mjs` **と policy** の変更を要求する」と書いたが、**policy の変更は不要**だった。`parseMetadata` は `loop-log` の未知キーを無視するため、`promotability` のような任意メタの追加は**ツール側の変更だけ**で足りる。`log-promotion-policy.json` に未分類の扱いを決める項目は無い。誇張である。ただし**核心（codexの推奨(ii)は「契約を崩さないため」と言いながら設計はツール変更を要求しており矛盾している）は codex 自身が認めた**（「未分類の扱いを明示的に再設計するには figma-log-promote.mjs 変更が必要です」）。矛盾の指摘は維持する。
  - (2) 「`w3cSkip` は**同型**の前例」と書いたのは強すぎた。`w3cSkip` はscope内の未実行を `not-recorded` として残す仕組みで、昇格経路の候補生成・再発閾値・昇格可否とは**機構が異なる**。正しくは「機構の同型」ではなく「**同じ原則の前例**」——検証していない事実を、合格に見せず理由付きで記録する、という原則の先例である。この水準なら支持される。
- **claudeが再反論する2件**:
  - (3) codexは「第三案がある: `scan` を非昇格候補を別扱いに分離して提案生成は継続する」と述べたが、**これは claude が挙げた選択肢1（ツールに非昇格状態を足す）そのものを運用面から言い換えたものであり、第三の選択肢ではない**。ただし「**提案生成を止めない**」という性質を明示した点は有用で、選択肢1の必須要件として取り込む。
  - (4) codexは「(F)『言い換えでは必ず不正直な割り当てに戻る』は過言」とし、根拠に `w3cSkip` を挙げた。しかし `w3cSkip` は「検証不能を明示する」仕組みであり、それは**選択肢1（非昇格状態の記録）**に属する。(F)が問うていたのは**選択肢2（認識の訂正を検証可能な強化へ書き換える）**である。依頼文では「言い換えで正直に解ける実例を1つでも示せるなら示せ」と明示的に求めたが、**実例は提示されなかった**。したがって (F) は維持する。
- **結論（両者の帰結が一致した）**: codexは推奨として(ii)を掲げたまま、質問5への回答で**選択肢1の最小実装**を具体的に示した——`parseMetadata`（186-224行）に `promotability` 系の任意メタを追加、`scanSourceLog`（227-265行）で `unclassified` と分離して `nonPromotable` を収集、`scan`（373-392行）の提案生成対象を promotable のみに限定しつつレポートへ非昇格明細を追加、提案IDの `signature` 構成（311-320行）は維持して**既存8件・4提案を壊さない**。policy は変更不要。**推奨の表明は割れているが、実装案は claude の推奨と一致している。**
- オーナーが決めるのはこの一点に縮約された: **「検証器を持てない訂正を『非昇格（理由必須）』としてツールに記録させる」変更を認めるか。** 認める場合の変更範囲は上記のとおりで、`log-promotion-policy.json` と既存記録には触れない。

## [94] 2026-08-06 / codex起草 + claude批評（判断D・E・b94f11bd。**3件とも要修正**）
- 【判断A・Bの適用】owner承認 → 適用済み。`spec/09-verification.md` §3-1 に固定高さ検査の実体、§6 に対応行、編集履歴に経緯を追記。`C:/AI/MyBrain/manifest.json` に `gate-contract-audit.mjs` を `required: true` で追加。実測: `figma-gate E2E PASS` / 配布物検査 合格（required **20件**）/ 両ファイルとも `U+FFFD` 0件。
- 【判断D】codexは方式(a)（別ページを時期を変えて測る）を推奨。**前回の欠陥（根拠のない数値）は解消**し、閾値は「固定値で持たず過去ベースライン分布から設定」と明記した。`integrity` を使った完全性条件も具体的で機械判定可能。ただし claude 批評で3点:
  - (1) **同等性の判定が循環している（high）**。「`plannedComponents`・`attemptedComponents`・`firstTryPassRate` の変動で同等性を監視する」とあるが、`firstTryPassRate` は測りたい成果そのもの。成果指標を同等性の判定に使うと「率が違う＝比較対象でない」として不利な結果を除外できる。同等性は**測定前に決まる入力側の属性**だけで定義しなければならない。
  - (2) **`notAttemptedComponents === 0` を比較の必須条件にすると生存者バイアスが入る（medium）**。途中で放棄したscopeほど忠実度が低い可能性が高いのに、それが体系的に除外される。除外ではなく「未完走として別集計」にすべき。
  - (3) **方式(a)の致命的な弱点に触れていない（medium）**。別ページ同士の比較では、差が「改善によるもの」か「ページ難易度の差」かを分離できない。1ページずつでは判別不能で、同カテゴリ複数ページが要る。これは「1ページ選べばよい」という当初のオーナー判断の形自体を変える。
  - **claudeの対案**: 同等性の基準は実データが無い今は決められない。**当面 `compare` は使わず `report` を貯める**。オーナーが今決めるのは「最初に測る1ページ」だけでよく、比較設計の確定は3件ほど蓄積してから行う。これなら判断Dで作業全体を止めなくて済む。
- 【判断E】codexは「(ii) 言い換え」を推奨したが、**推奨とその設計が矛盾している（high）**。(ii)を選んだ理由は「契約を崩さないため」なのに、設計項目3・4・5と必要な負のE2E（「`scan` が `waiting-human` で全停止せず明示的非昇格としてレポートされる」）は**すべて `figma-log-promote.mjs` と policy の変更を要求**する。つまり中身は(i)であり、しかも(i)より大きい変更になっている。加えて設計2)は「`verifierTargets` を `figma-log-promote.mjs` のような検証器に固定」と、[93]で否定した不正直な割り当てを言い換えただけで再掲している。既存8件を「非昇格クローズ」に再分類する案も、正当なメタデータを持つ記録を理由なく壊す。
  - **claudeの整理**: 実際の選択肢は「**ツールに『非昇格（理由必須）』の状態を足す**」か「**ツールを変えず、言い換えだけで全件を検証可能な強化に落とす**」の二択。前者には同じ構造の前例がある——`spec/09` §3 の `scope.w3cSkip = { reason }` は、検証できない事実を**合格にせず `not-recorded` として残す**仕組みで、まさに同型。後者は「figma-to-codeは案件横断の正本である」のような訂正で正直な検証器を書けず、必ず不正直な割り当てに戻る。**claudeは前者を推奨する。**
- 【b94f11bd】閉じる結論は一致。閉じ方の起草に3点:
  - (1) `proposalId` を `b94f11bd` と短縮しているが、実際のIDは `figma-log-unverified-figma-value-b94f11bd4b566549`（low）。
  - (2) `current.json` に新設する `proposalClosed` 配列は、既存の `recurrenceKeys[].current/superseded` と**並列で無関係な第二の構造**になる。`readProposal` が見ているのは `recurrenceKeys` なので、既存構造の中で閉じるほうが単一の真実源を保てる（medium）。
  - (3) **再開ゲートが危険（high）**。`reopenRule` で「同一 recurrenceKey の新規recordはowner再開許可まで apply へ進めない」とする案だが、`unverified-figma-value` は**最も再発の多い失敗分類**である。そこに手動の再開ゲートを置くと、最も効く経路が人の操作待ちで止まる。閉じるのは提案1件だけにとどめ、将来の再発を止めない形にすべき。
- 次: 上記3件をオーナーに提示。判断Dは「最初の1ページだけ決める」形に縮約でき、判断Eは二択の性質が変わったため、再提示後に決めてもらう。

## [93] 2026-08-06 / claude起草 + codex批評（判断A・Bは**合格**。判断Eは要再修正、判断Dはオーナー待ち）
- 【判断A・B】claudeが起草し codex が批評 → **合格**。codex は [92] の自案2件を明確に撤回した。
  - A-1（固定高さ検査を §3 preflight へ実体追記 + §6 に対応行1行）: 合格。「`fixed-height-reason` と `tolerance` の扱い、`[64,64]` の抜け道対策まで反映済みで過不足がない」。
  - §6 の性質（対応表であり実体を書く場所ではない）: **high で claude の主張を支持**。「§6 へ実体本文を置くのは逆」と自案を否定した。
  - A-2（ベンチマークを spec/09 に入れない）: 妥当（medium）。「合否条件への直接紐付けだけが失われ、合否判定力自体は低下しない」。
  - B（`required: true`）: 整合性が高い（low）。「前案の `accessibility-audit.mjs` は web-development 区分の別 authority 由来で、単純比較は成立しない」と自案の根拠を撤回。
  - **A-1 と B はオーナー承認だけで適用できる状態**（文面・JSON行は Escalations 2026-08-06 にある）。A-2 は「入れない」という結論なので適用作業は無い。
- 【判断E】codex が修正条件2件（`action` は `strengthen` 固定 / `recurrenceKey` は既存の平坦キーと互換）を反映して再起草。claude の批評で**なお2件の問題**:
  - (1) **暫定verifierの割り当てが不正直**（high）。認識の訂正に `tools/figma-log-promote.mjs` を `verifierTargets` として付ける案だが、このファイルは当該訂正を検証しない。さらに `verifierTargets` は提案の `requiredChange` になり `apply` のパッチ許可先を決めるため、将来その再発キーで強化するとき **figma-log-promote.mjs しか変更できない**という無意味な制約になる。b94f11bd で否定した「証跡の演出」と同型。
  - (2) `verifierTargets` は「2件以上必須」と書いているが、実際は**1件以上**（`normalizeUniqueStringArray` は非空要件のみ、`tools/figma-log-promote.mjs:110-115`）。
  - **判断Eはオーナー判断が1つ増える**: 契約は `ruleTargets` と `verifierTargets` の**両方を非空**で要求するため、正直に書ける検証器を持たない認識の訂正（例「figma-to-codeは案件横断の正本である」）を表現できない。かつ scan は未分類が1件でもあると止まるので「書かない」も選べない。**(i) 契約を緩めて `verifierTargets` の空を許す**（契約変更＝オーナー承認）か、**(ii) 認識の訂正も実際に検証できる規則強化へ言い換える**か、のどちらかを決める必要がある。
- 【36件の範囲が確定】codex の指摘（見出しは72件・未付与65件なのに36件とは何か）を受けて `scanSourceLog` を確認した。scan は `<!-- loop-log-schema: v1 -->` マーカー**より前**の見出しだけを新規エントリとして扱う（`corrections.md:192` / `mistakes.md:47`）。**36件はマーカーより前＝新しい記録だけ**で正しい。
- 【判断D】未着手。比較設計（別ページ方式か再実装方式か）がオーナー判断のため。ただし**分岐に依存しない部分は先に修正した**: `templates/verify/README.md` の「同一のFigmaページを固定入力として `report` を2回取り `compare` する」という記述は、どちらの方式でも誤りなので、誤りである旨と未確定である旨に書き換えた。`report` 単体（1回の実装の忠実度記録）はこの決定と無関係に有効である。
- 【運用の是正】外部エージェント依頼で承認プロンプトを2回出させた（読み取りだけの批評依頼で）。原因は許可設定ではなく**自分のコマンドの書き方**で、長大な引数とコマンド置換 `$(cat ...)` が前方一致を外していた。`tools/codex-task.mjs`（依頼文ファイルを受け取って codex を起動する薄いラッパー）を追加し、呼び出しを `node tools/codex-task.mjs <prompt-file>` の固定形にして解消した（`Bash(node tools/*)` に一致）。共通Vaultの `mistakes.md` に5回目の再発として記録した。

## [92] 2026-08-06 / codex起草 + claude批評（オーナー判断5件の推奨案: 採用1・要修正4）
- 契機: kazu 指摘「だからそのオーナー判断はcodexに確認させるべきなのでは？」。判断待ちを列挙して丸投げするのではなく、**codexを起草役・claudeを批評役**にして「承認/却下だけで済む具体案」を作る形にした（これまでと役割が逆。D-001/D-005 を満たす）。
- 実行上の失敗と対処: 5件を1タスクで依頼したところ codex が context 超過で落ちた（`Codex ran out of room in the model's context window`）。読む対象を各タスク4-5ファイルに絞って3タスクへ分割し直して成功した。**依頼側が読む範囲を設計しないと批評者が仕事をできない。**
- 【判断C（b94f11bd）】**codexの推奨(b)=閉じるが正しく、claudeの想定が誤りだった。** claudeは直前に「独立レビューは[84]で実施済み、負のE2Eも3件あるので、昇格契約(a)は既存証跡の転記で済む可能性が高い」と述べたが、`tools/figma-log-promote.mjs:742-790` を読むと **`apply` は `find !== replace` の非空パッチを要求し、実際にファイルを書き換える**。当該強化（provenance検査）は既に実装済みで適用すべき差分が存在しないため、(a)を通すには**コードを一度戻して再適用する**しかなく、それは証跡の演出にすぎない。**採用**。
  - claudeの追加提案（codex案に無い）: 閉じる際に「次に同じ `recurrenceKey: unverified-figma-value` の強化を行うときは、最初から `record → scan → review → apply` に載せる」を条件として記録する。そうしないと契約は一度も実行されないまま形骸化する。
- 【判断A（spec/09 §6 への追記）】**要修正（重大）**。codexは §6 の末尾に2項目を追記する完成文を出したが、**§6 の形式を壊す**。§6 は「基準の記述: §番号」という**同一ファイル内の節への対応表**であり（`spec/09-verification.md` の §6 は5行すべてが `: §1`〜`: §5`）、編集履歴にも「新しい合否基準は追加しておらず、既存 §1〜§5 への対応を明示しただけ」と明記されている。codex案は右辺に `templates/verify/README.md` という外部ファイルを置き、基準の実体を §6 に書いている。正しい手順は2段階: (1) 実体を §1（三層検証）または §3（実装中のゲート）に書く (2) §6 に `…: §3` の1行を足す。**この形で起草し直す必要がある。**
- 【判断B（`gate-contract-audit.mjs` の配布）】**要修正**。codexは `required: false` を推奨し、前例として `accessibility-audit.mjs`（別ソース web-development、required:false）を引いた。しかし**より近い前例は同じ figma-to-code の files 配列にある `fidelity-benchmark.mjs`** で、import依存ではないが「無いと成果を数値で残せない」を理由に `required: true` にしている（[85]）。加えて 2026-08-06 に `rules/figma-spec-pipeline.md` へ「未移行specは `gate-contract-audit.mjs` が一覧する」と書いたため、**配布されないとその手順を実行できない**。codex自身のリスク欄も「required:false のまま未配布だと監査手順が抜ける」と認めている。**`required: true` を対案とする。**
- 【判断D（固定入力ページの要件）】**要修正（重大）**。(i) 数値条件（component 20〜180件、painted>=12、painted比 0.30、反復比 0.20、更新 1回/14日以内）に**根拠が無い**。codexは根拠として README を挙げるが README にこれらの数値は存在しない。推測値を選定基準にするのは `spec/09` §5「推測での代替禁止」に反する。(ii) codexのリスク2「`notAttemptedComponents > 0` が残ると `firstTryPassRate` が過大評価」は**逆**。分母は `plan` なので未着手componentは率を**過小**にする（E2Eで plan 4・PASS 1 → 0.25 を固定済み）。(iii) **最大の問題**: 「同一ページで `report` を2回取り `compare` する」手順は、2回目の測定対象が**すでに実装済みのページ**であり、初回実装の忠実度を測っていない。改善を入れてから同じページを測り直しても、componentは既に正しいので初回checkpointは自明にPASSする。**これは codex の案の欠陥であると同時に、claude が `templates/verify/README.md` に書いた「同一のFigmaページを固定入力として report を2回取り compare する」という文言そのものの欠陥である。** ワンショット忠実度は原理的に**毎回まっさらな実装**でしか測れないため、比較可能性は (a) 同程度の複雑さを持つ**別ページ**を時期を変えて測る（＝「固定入力1枚」という前提が誤り）か (b) 同一ページを一度破棄して再実装する、のどちらかでしか得られない。判断1は要件定義以前に**設計をやり直す必要がある**。
- 【判断E（未分類36件の分類方針）】**要修正**。codexは認識の訂正について `action: "owner-decision"` を暫定採用候補としたが、`tools/figma-log-promote.mjs:201-202` は **`action` が `"strengthen"` 以外なら scan でFAIL**にする（`loop-log.action must be strengthen`）。この案は実行できない。また `recurrenceKey` を `<failureFamily>.<controlPoint>`（例 `unverified-figma-value.visual-verification`）というドット記法にする提案は、既存の平坦なキー（`unverified-figma-value`、`log-to-rule-feedback-gap`）と**文字列一致しない**ため、既存4提案の再発カウントと繋がらない。粒度規則の考え方（原因機構＋制御点）自体は妥当なので、既存キーとの互換を保つ形へ修正が要る。
- 総括: 5件のうち**採用1（判断C）／要修正4**。うち2件（A・D）は起草の問題ではなく**設計の問題**を露呈させた。特に判断Dは claude 自身が書いたREADMEの欠陥を明らかにしており、P-3 の成果物に手戻りが要る。役割を逆にした効果が最も出た点である。
- 次: 要修正4件の再起草。判断A・B は claude が起草して codex が批評（対案が明確なため）、判断D は設計のやり直しなので先にオーナーの意向を聞く、判断E は codex に修正条件を渡して再起草させる。

## [91] 2026-08-06 / codex + claude（判断待ち一覧・訂正版の再監査: **合格**。追加判断1件は不要と判定）
- 契機: kazu 指摘「その判断もcodexに確認させるべきでは？」。[90] の訂正版もclaudeの出力であり、同じ理由で検証対象になる。
- 経緯: 1回目の再監査は codex 側の `Selected model is at capacity` で判定前に落ちた（生成物への書き込みは無いことを mtime で確認済み）。同一依頼で再実行し判定を得た。
- 判定: **合格**。[90] の訂正はすべて再導出で一致した。
  - (a) 未分類は 36 件が現在値で、「3件」が 2026-07-30 の旧レポート値だったという説明は正しい。**内訳は `rules/corrections.md` 34件 + `rules/mistakes.md` 2件**（claudeが独立に再集計して一致を確認）。claudeは corrections.md しか見ていなかったため、mistakes.md の2件は codex の再導出で初めて明示された。
  - (b) `b94f11bd` を `promoted` として閉じるのは昇格契約に反し、レビュー工程を省略した証跡化にあたる（high）。`rules/correction-log-promotion.md:20-23`、`rules/self-improvement.md:54`、`tools/figma-log-promote.mjs:388,717`、提案の `status: "pending-review"` が根拠。[90] の整理は妥当と確認された。
  - (c) scan の影響範囲の訂正文（intake/report 追加・`latest.json` 書換え・`current.json` 索引更新・提案と正本は不変）は再導出で一致。
  - (d) 判断待ち5件の現在値と規模は明確。抜けている判断は無い。
  - (e) 未分類36件を「claude が草案 → owner 承認」で分類し、昇格実装は独立レビュー経路で行う運用は `self-improvement.md` / `correction-log-promotion.md` の契約と整合する（medium）。
- 追加候補の却下: claude が挙げた「figma-to-code が git 管理下にない」は**判断待ちに加えない**のが妥当と判定された。`preflight` は git 不可を FAIL 条件として扱う設計で、版管理を要求するのは実装が行われる案件リポジトリであり、正本リポジトリの状態は運用上の仕様内という根拠（`rules/figma-spec-pipeline.md:68`）。
  - 残る懸念（claude 記録）: 正本・テンプレート・検証器の変更が差分で追えず巻き戻せない点は解消していない。ただし判断待ちとして常設するほどではないため、必要になった時点でオーナーが決める事項として残す。
- 記録の位置づけ: 判断待ち一覧は3イテレーション（[90] 不合格 → 訂正 → [91] 合格）を経て確定した。**一覧そのものを成果物として独立検証の対象に入れる**ことが今回の学びであり、この扱いは今後の「判断待ちの提示」全般に適用する。

## [90] 2026-08-06 / codex + claude（判断待ち一覧の独立監査: **不合格**。claudeの列挙に事実誤りが2件）
- 契機: kazu 指摘「codexにも確認させるべきでは？」。判断待ちの列挙そのものが claude の自己申告で独立検証を経ていなかった。**指摘は正しく、実際に誤りが出た**。
- 誤り1（codexが検出 / high）: **提案 b94f11bd を「promoted として閉じる」という推奨が事実と整合しない。** 提案の `status` は `pending-review` のままで、`reviews` / `promotions` の証跡は存在しない（実測: `proposals/figma-log-unverified-figma-value-b94f11bd4b566549.json` の `status: "pending-review"`、`learning/log-promotions/` 配下に reviews / promotions ディレクトリ無し）。強化の**内容**は owner 直接指示のL2で実装済みだが、それは `record → scan → review → apply` の昇格契約を通っていない。ここで `promoted` と記録すれば、**実行していないレビュー工程の証跡を捏造することになる**。正しい選択肢は (a) review + apply を実際に通して証跡を作る (b) 「実装は別経路で完了」を理由に閉じる、のどちらかで、オーナーはその**選別**を判断する。
- 誤り2（claudeが自己検出 / high）: **未分類の訂正が「3件」というのは 2026-07-30 時点の古い数字だった。** 参照していた report は当時のもので、以後 corrections.md に 2026-07-31〜2026-08-05 の訂正が多数追加され、いずれにも `loop-log` が付いていない。実測のため `node tools/figma-log-promote.mjs scan rules/log-promotion-policy.json learning/log-promotions` を実行した結果は **`8 tagged log record(s), 36 unclassified new record(s), 0 proposal(s)`**。作業量は3件ではなく **36件**である。codex はこの点を「抜けなし」と判定しており、**独立批評も見落とした**（名指しした3件の存在確認で止まり、件数を再導出しなかった）。
  - このscan実行の影響範囲（実測で確認し、当初の記述を訂正した）: 新規に `intake/figma-log-intake-3d7863287b80d745.json` と同名の report を追加し、`latest.json` と **`proposals/current.json` を上書き**した。current.json は可変索引で、`updatedAt` が 2026-07-30 → 2026-08-06 に変わったが `recurrenceKeys` の内容は同一である。不変の提案ファイル4件（mtime 7/18）と正本・適用経路は変わっていない。**「正本・提案・適用には触れていない」と最初に書いたのは不正確で、可変索引は書き換わっている。**
  - 付随して判明: **figma-to-code は git 管理下にない**（`git rev-parse` が `not a git repository`）。差分による事後確認ができないため、生成物の影響範囲は mtime と内容比較で確かめるしかない。
- 誤り3（codexが検出 / medium）: 優先順位。scan を止めている直接原因は未分類の訂正なので、パイプライン再開の観点では claude が4番目に置いた項目が先。ただし36件に増えた以上、コストは当初の想定より大きい。
- 確認された事項（codex / low）: 判断待ち(1)固定入力の未指定、(2)spec/09への接続、(3)`gate-contract-audit.mjs` の配布物欠落、(4)未分類訂正の存在は**いずれも実在し記述は妥当**。`manifest.json` に `fidelity-benchmark.mjs` はあるが `gate-contract-audit.mjs` は無いことも実測で確認された。
- 教訓: 「判断待ちの一覧」も成果物であり、独立検証の対象から外していた。**ツールが出した数字を引用するときは、その数字が生成された時点と現在の入力が同じかを確認する。** 古いレポートの引用は、実測に見えて実測ではない。
- 次: 上記を反映した判断待ち一覧をオーナーへ再提示する。

## [89] 2026-08-06 / codex + claude（固定高さ検査の独立批評: **合格**。実効性に関わる指摘3件を反映）
- 判定（批評役 codex、起草役 claude）: **合格（PASS）**。観点(3)`note`限定と`assertSpecProvenance`の整合、(4)E2Eの負/正経路、(5)`spec-example.json`の互換は合格。抜け道の高優先指摘は「確認できず」。以下は合格判定のうえでの指摘。
- 指摘1（low / 抜け道）: `[min, max]` を一律に「可変前提」とみなすため、`[64, 64]` のような**幅の無いレンジで実質固定値を隠せる**。
  - **反映**: レンジの幅が `tolerance` 以下なら単一値と同じに扱うようにした。E2Eに負の1件（`height: [64, 64]` が落ちること）を追加。**レンジ形式にするだけで検査を外せる経路は塞がった**。
- 指摘2（low+medium / 誤検知）: `lineHeight` が単位なし・`normal`・未宣言の場合は行ボックス判定が不能で落ちる。また `-webkit-line-clamp` / `overflow: hidden` で意図的に高さを固定する設計は `note` 根拠で通す運用が要る。
  - **反映**: いずれも仕様として明記した。前者は意図した厳しさである（`lineHeight` は computed style と完全一致で書く規約なので通常は px 形式になる）。後者は `fixed-height-reason` の正当な用途として README とパイプラインの例に追加した。**判定条件は変えていない。**
- 指摘3（medium / 既存specへの影響）: 既存案件のspecに単一値の `height` があれば、この契約強化で新たに落ちる。
  - **反映**: `gate-contract-audit.mjs` に同じ判定を追加し、`可変テキスト要素の固定height xN` として一覧するようにした。preflightで落ちるのを待たず移行前に件数を把握できる。これは README:50 が定める「旧契約は落ちるが、落ちること自体を誰も見ていない」問題への既存の対処法に合わせたものである。実測でフィクスチャ1件を検出し、行ボックス一致の要素は検出しないことを確認した。
- 回帰試験（実測）: `figma-gate E2E PASS` / `verify-layout E2E PASS` / `loop-learn E2E PASS` / `fidelity-benchmark E2E PASS` / 配布物検査 合格。
- 未処理（オーナー判断）: (a) `spec/09-verification.md` への接続は未実施（確定済みspecの変更承認が必要。Escalations 2026-07-30 の2件目と同じ判断） (b) `gate-contract-audit.mjs` が `C:/AI/MyBrain/manifest.json` の配布物一覧に**入っていない**。README:50 は案件で実行するよう定めているのに配布されない状態で、今回の指摘3の対処も案件側に届かない。配布物契約の変更になるため独断で追加していない。

## [88] 2026-08-06 / claude（可変テキスト要素の固定高さ検査を機械化。独立批評待ち）
- 契機: kazu が `web-development/rules/css-values.md` に「可変テキスト要素の高さ」節を、`rules/figma-spec-pipeline.md:115` にチェック項目を追加し、点検を指示。点検の結果3件の問題を報告し、機械検査の追加に **承認** を得た。
- 点検結果（報告済み）: (a) 文字化けは実測で両ファイル `U+FFFD` 0件 (b) 正本は `css-values.md` 一本に定まっており二重管理ではない (c) 既存の少数値規約と論点が別で衝突なし。
- 問題1（高）: **機械強制に接続されていなかった**。`lint-units.mjs` は E1〜E4/W1 のみで `height` を見ず、ゲートは実測高さしか照合しない。つまりFigmaの矩形高さ（padding込み）を CSS の `height` へ焼き付けた実装でも、**Figmaのダミー文言のままなら実測が一致して PASS する**。文字量が変わった時点で崩れるが、その時にはもうゲートを離れている。[75] の原因4（ルールが実行器に接続されていないと素通りする）そのもの。
- 問題2（中）: 「固定 `height` の根拠を spec へ記録」が現行スキーマでは実行できなかった。`assertSpecProvenance` は `sel` / `note` / `provenance` / `textPatternReason` 以外のキーを測定値とみなし限定されたprovenanceタグを要求するため、`fixedHeightReason` のような自由記述キーは別のSPEC FAILになる。記録先は `note` に限られる。
- 問題3（中）: `min-height` で組んだ要素の実測高さは文言で変わるため、spec に点値の `height` を書くと LAYOUT FAIL になる。`spec-example.json` は既に `"height": [52, 56]` の範囲指定を持ち `verify-layout.mjs:22` が対応しているので、ルールと対で書く必要がある。
- 実装（`figma-gate.mjs` `assertVariableTextHeight`、`validateManifest` から `assertSpecProvenance` の直後に呼ぶ）: `text` / `innerText` / `textPattern` / `lineCount` のいずれかを持つ要素が `height` を**単一の数値**で宣言し、その値が `lineHeight × lineCount`（許容誤差 `tolerance`）で説明できない場合を **SPEC FAIL** とする。高さが行ボックスそのものなら固定枠ではないので合格にし、単一値の一律禁止による誤検知を避けた。例外は `note` の `fixed-height-reason: <根拠>` のみで、目印だけで根拠が空なら通らない。
- 回帰試験（実測）: `figma-gate.e2e.mjs` に負2件（padding焼き付け / 目印だけで根拠が空）と正3件（note に根拠あり / 高さ＝行ボックス / `[min,max]` 範囲指定）を追加。正の3件は `commitFixture` 後に置く必要があった（それ以前は変更対象がdirtyで preflight 自体が通らない）。`figma-gate E2E PASS` / `fidelity-benchmark E2E PASS` / `verify-layout E2E PASS` / `loop-learn E2E PASS` / 配布物検査 合格。既存の `spec-example.json` は不合格にならないことを確認（唯一該当する `.sample-section__title` は h=26・lineHeight 26px・1行で行ボックス一致）。
- 文書化: `templates/verify/README.md`「spec-*.json の書式」節と `rules/figma-spec-pipeline.md`（115行のチェック項目を実装に合わせ、132行付近に機械検査の本文を追加）。`css-values.md` は一般原則の正本なのでFigma固有の記述を持ち込まず変更していない。
- **`spec/09-verification.md` は変更していない。** 新しいFAIL条件を確定済みspecの合否基準へ接続するには別途オーナー承認が必要で、Escalations 2026-07-30 の2件目（ベンチマークの §6 追記）と同じ判断になる。
- 次: codex による独立批評。

## [87] 2026-07-30 / codex（P-3 再批評: **合格**。追加指摘なし）
- 判定（批評役 codex、起草役 claude）: **合格（PASS）**。[86] の是正3件はすべて解決と認定され、新規の指摘は出なかった。
  - 指摘1（分母）: 解決。`preflight` が `checkpointPlan` を `benchmark.plan` として凍結し、集計が実測集合ではなく凍結対象集合で分母を作る（`figma-gate.mjs:1103-1108`、`fidelity-benchmark.mjs:64-67,110-114`）。「E2Eで plan 4件・`firstTryPassRate` 0.25 を固定しているため、形だけでなく回帰試験で実効性を担保している」（`fidelity-benchmark.e2e.mjs:52-54,73-77`）。
  - 指摘2（ゲーム化）: 解決方向として妥当。書式厳格化と `integrity` 3項目（`rejectedAttempts` / `unplannedComponents` / `attemptCountMismatches`）、警告時に指標解釈を止める運用まで確認（`fidelity-benchmark.mjs:47-59,66-76,160-193`、E2E `:101-129`）。
  - 指摘3（release-check 除外）: 解決。集計側の二重除外とE2Eの `release: true` 試行で回帰を検知できる。
  - 改ざん耐性の主張: 過大でない。`tamperEvident: false` の固定とREADMEの限界記述が実装と一致している。
  - 既存挙動の破壊: 重大な破綻なし。`preflight` は状態を追加するだけで、フェーズガードと `assertFrozenInputs` の経路は従来どおり。release-check は `releaseCheckpoints` に分離されたまま。
- **P-3 の計測器はこれで完成**とする。ただし成果は「測れるようにした」までであり、**実測値はまだ0件**である。原因1（効果測定の不在）が実際に解消するのは、固定入力の実Figmaページで初回実装を1回通してからである（Escalations 2026-07-30 の1件目）。
- 次: オーナー判断2件（固定入力の置き場所、`spec/09` §6 への追記可否。Escalations に追記案の本文を置いた）。実作業は P-4（Q-13/Q-08 の実行器接続）→ P-5（予防的機能カバレッジ監査）。

## [86] 2026-07-30 / codex + claude（P-3 独立批評: **不合格**。3件すべて是正して再批評へ）
- 判定（批評役 codex、起草役 claude）: **不合格**。観点(2)checkpoint判定への干渉なし・(3)finalRecheck/release-checkの除外判断・(5)確定済みspecの無断変更なし は合格。観点(1)と(4)で指摘3件。
- 指摘1（medium / 観点1「指標の妥当性」）: 分母が `benchmark.attempts` に現れたcomponentだけから推定されており、未着手componentが分母から落ちる。実装途中で `report` すると初回PASS率が**過大に出る**。根拠 `fidelity-benchmark.mjs:45,46,72,73`。
  - **是正**: `preflight` が `benchmark.plan` に checkpoint plan 全件を凍結して書くようにした（`figma-gate.mjs:1103` 付近）。集計はこれを分母に使い、`plannedComponents` / `attemptedComponents` / `notAttemptedComponents` を出す。E2Eでは plan 4件・試行3件で `firstTryPassRate` が 0.25（従来の推定なら 0.3333）になることを固定した。`plan` が無い旧stateでは `planRecorded: false` と警告を出す。
- 指摘2（low / 観点4「ゲーム化」）: `.figma-gate/active.json` を手編集すれば `finalRecheck` や `outcome` を偽装でき、集計側も書式検証をしていないため改ざんが数値に混入する。根拠 `figma-gate.mjs:36,44,55`、`fidelity-benchmark.mjs:45,76`。
  - **是正**: (a) 集計時に試行1件ごとの書式検証を追加し、違反は集計に混ぜず `integrity.rejectedAttempts` に理由付きで出す。(b) 対象集合に無いcomponentの試行を `integrity.unplannedComponents` に出す。(c) 別経路で維持されている `learningMetrics.directViewportRuns` と試行数を突き合わせ、不一致を `integrity.attemptCountMismatches` に出す。(d) `integrity.tamperEvident: false` を明記し、READMEに「実装役が書き換えられるため改ざん耐性は無い。自己証明ではなく、オーナーが `close-report.json`・release-check・実際の見た目と併せて読む指標である」と書いた。
  - 限界の明示: 状態ファイルを書けるactorに対する完全な改ざん耐性は、外部の信頼点なしには成立しない。今回の是正は「黙って数値に混入すること」を防ぐところまでであり、「不可能にした」とは記録しない。
- 指摘3（low / 観点4「release-check の除外監視不足」）: 隔離E2Eが `finalRecheck` だけを検証し、release-checkが将来誤って集計対象化した場合の回帰を検知しない。根拠 `fidelity-benchmark.e2e.mjs:58`。
  - **是正**: 集計側の除外条件を `finalRecheck === true || release === true` の二重にし、E2Eに `release: true` の試行を追加して除外を固定した。記録側（`figma-gate.mjs` の `if (!release)`）と合わせて二重防御になる。
- 回帰試験（実測）: `fidelity-benchmark E2E PASS` / `figma-gate E2E PASS`（preflightの `benchmark.plan` 凍結の検証を追加）/ `loop-learn E2E PASS` / `figma-log-promote E2E PASS`。
- 次: codex による再批評。[85] の承認待ち2件（固定入力の置き場所、spec/09 §6 への統合可否）は未解決のまま残る。

## [85] 2026-07-30 / claude（P-3 起草: ワンショット忠実度ベンチマークの計測実装）
- 契機: kazu 指示「P-3に進めろ」。[75] の原因1（効果測定の不在）を解消し、P-1/P-2/P-4 の効果を機械判定できる土台を作る。
- **先に確認した未確認事項**（[79] の宿題）: `close-report.json` は `result: { specFail: 0, layoutFail: 0, visualFail: 0 }` を**固定値で書いている**（`figma-gate.mjs:1160` 付近）。closeは全PASSでしか到達しないため当然であり、初回checkpoint時点のFAIL件数は**保持していない**。よって計測は新規に実装する必要があると確定した。
- 実装1（計測点、`templates/verify/figma-gate.mjs`）: `checkpoint` が試行ごとに `.figma-gate/active.json` の `benchmark.attempts` へ1件追記する。1件は `{ elementId, viewports, painted, attempt, finalRecheck, outcome, failureClass, message, at }`。
  - PASS は checkpoint 末尾の `writeState` に同梱して1回のI/Oで書く。
  - FAIL は `fail()` に記録処理を差し込んだ。`fail()` は `process.exit(1)` するため `finally` が動かず、従来は分類が失われていた。`pendingBenchmarkAttempt` を測定開始前に立て、`fail()` がFAILメッセージから `/\b(SPEC|LAYOUT|VISUAL)\s+FAIL\b/` で分類を取り出して追記する（該当しなければ `OTHER`）。
  - 記録の失敗は `try/catch` で飲み、**合否には一切影響させない**。計測が検証を壊してはならないため。
  - `release` 実行時は記録しない。release-check は公開物の照合であり、初回実装の忠実度ではない。
- 実装2（集計器、新規 `templates/verify/fidelity-benchmark.mjs`）: `report` / `compare` の2コマンド。指標は `firstTryPassRate`（主要指標）、`meanAttemptsPerComponent` / `maxAttemptsForOneComponent`（手動修正ラウンド数）、`firstAttemptFailureClasses`、`allFailureClasses`。`finalRecheck`（close時の全件再測定）は分母から除外する。component 0件のとき率は `null` を返す（`0/0` を 0% と誤読させないため）。**合否は判定しない**——閾値判定と「指標が良化しても外部で検証できる成果が悪化していないか」の点検はオーナーに残す。
- 回帰試験: 新規 `templates/verify/fidelity-benchmark.e2e.mjs`（初回PASS/3試行/未PASS/`finalRecheck`除外/空/`benchmark`欠落の前方互換/`compare` 引数不足）→ `fidelity-benchmark E2E PASS`（実測）。`figma-gate.e2e.mjs` にも2件追加: (a) `verify-layout.mjs` を `process.exit(1)` に差し替えた checkpoint が `failureClass: "LAYOUT"` の試行を1件記録すること (b) 全component分の PASS 試行が記録されること → `figma-gate E2E PASS`（実測）。
- 配布物: `C:/AI/MyBrain/manifest.json` の figma-to-code に `fidelity-benchmark.mjs` を `required` で追加（import依存ではないが、無いと成果を数値で残せない）。`fidelity-benchmark.e2e.mjs` は `excluded` へ。`node C:/AI/MyBrain/bootstrap.mjs --check` → 合格（required 19件）。
- 文書化: `templates/verify/README.md` に節を追加（記録書式・コマンド・指標の読み方・除外理由・合否判定しない旨）。**`spec/09-verification.md` は変更していない。**確定済みspecの本文変更はオーナー承認を要するため、spec/09 §6 への統合は下記の承認待ちとして残す。
- 承認待ち（オーナー判断）: (1) 固定入力とする実Figmaページの置き場所（これが決まるまで実測値は0件のまま）(2) `spec/09-verification.md` §6 に「忠実度ベンチマークの記録と集計」を追記してよいか。追記しない場合、ベンチマークは運用文書のみに存在し、実行ゲートの合否基準には接続されない。
- 次: codex による独立批評（起草が claude のため、D-001/D-005 により批評は codex）。

## [84] 2026-07-30 / codex + claude（P-1a 独立批評: 合格。低優先指摘1件を反映）
- 判定（批評役 codex、実装役 claude）: **合格（PASS）**。5観点すべて合格、重大不具合なし。
  - (a) 到達性: ✅ `validateManifest` は preflight / checkpoint / close / release-check から直接、`section-start` / `section-close` は `requireFrozenPreflight` 経由で呼ばれるため、`assertSpecProvenance` は全工程で再評価される（`figma-gate.mjs:727,735,1044,1134,1184,1188`）。
  - (b) 既存要求の緩和: ✅ なし。provenance 必須化は追加のみで、`assertSpecCoversComponents` の未測定コンポーネント検知も残存。
  - (c) 除外リストと `viewport.page` の抜け道: ✅ `SPEC_NON_MEASURED_KEYS` は3キーのみ。`viewport.page` は要素キー列挙の対象外という構造のため誤要求も発生しない。
  - (d) `current.json` ガードと不変性設計の整合: ✅ 提案本体は `writeImmutableJson` で不変、索引のみ `writeJson` で可変。`readProposal` の被代替拒否ガードも設計思想と整合。
  - (e) 負のE2E: ✅ 3件（未指定 / unknown（`inferred`）/ stale）が preflight の拒否を検証している。
- 低優先指摘（重大度: 低）: `tools/figma-log-promote.e2e.mjs` が `readProposal` の被代替ガードを直接検証しておらず、回帰リスクの観測が不足している。
- **反映（claude）**: 同 E2E に被代替ガードの回帰試験を追加した。`proposals/current.json` の `current` を別IDにして当該提案を `superseded` に置いた状態で、`review` と `apply` の**両方**が失敗することを検証する。実行結果 `figma-log-promote E2E PASS`（実測）。
- 結果: P-1a は実装・独立批評・回帰試験まで完了。`unverified-figma-value`（最も再発している失敗クラス）に対する機械的強制が初めて成立した。

## [83] 2026-07-30 / claude（P-1a 実装: provenance検査・負のE2E・提案の被代替索引。独立批評待ち）
- 承認記録: owner指示「P-1a — provenance 検査の実装＋負のE2E＋昇格器の冪等性修正。今回の『Figma どおりにならない』に最も直接効く欠落です／これを修正しろ」。
- **(1) provenance 検査の実装**: `templates/verify/figma-gate.mjs` に `assertSpecProvenance` を追加し、`validateManifest` から呼ぶようにした（`specDocument` を1回読んで `assertSpecCoversComponents` と共用）。specの各要素の測定キー（`sel` / `note` / `provenance` 以外の全キー）に対して取得元タグを必須化する。許可値は `metadata` / `design_context` / `variable_defs` / `screenshot` / `asset` / `rest` / `scale-conversion` のみ。次の3種をすべて **SPEC FAIL** として拒否する: 取得元なし／未知の取得元（`inferred` など推測を表す値を含む）／実在しない期待値に対する取得元（改名・陳腐化の検出）。`validateManifest` 経由のため preflight だけでなく checkpoint・section-start・section-close・close・release-check でも有効になる。測定キーが無い要素（`sel` だけ）は対象外。`viewport.page`（`maxScrollWidth` 等の基準幅由来の値）も対象外とした。
- **(2) 負のE2E**: `templates/verify/figma-gate.e2e.mjs` に3件追加した（取得元なし／`inferred` という未知の取得元／実在しない期待値への取得元）。いずれも `preflight` が失敗することを `runGateFailure` で確認する。これは提案 `figma-log-unverified-figma-value-b94f11bd4b566549` が昇格条件として要求していた「失敗クラスを再現する負のE2E」に対応する（[79] で FAIL としていた項目）。
- **(3) 書式と正本の同期**: `templates/verify/spec-example.json` の3要素に `provenance` を追加。`rules/figma-spec-pipeline.md` フェーズ3A-1 に契約（必須化・許可値・拒否条件・検査関数・負のE2Eの所在）を明記した。
- **(4) 冪等性: 当初の仮説を撤回して設計に沿う修正へ切り替えた**（正直な記録）
  - [79] で「提案IDが可変な内容ハッシュに依存しているのが冪等性の欠陥」と記録し、署名から `source.sha256` を除く変更を一度加えた。しかし `writeImmutableJson`（`tools/figma-log-promote.mjs:83-93`）を実測すると、**提案ファイルは不変で、既存と内容が異なる場合は `fail` する**設計だった。内容ハッシュを識別子から外すと、ログ本文が変わったとき同一IDで内容だけ異なる書き込みになり **scan 自体が失敗する**。当初の変更は誤りだったため撤回した。
  - 真の欠陥は「識別子の作り方」ではなく **被代替の追跡が無いこと**だった。提案は不変なのでログ編集ごとに別IDの提案が積まれるのは設計どおりだが、旧提案が `pending-review` のまま残るため、同じ再発キーの提案が滞留して見え、`spec/06` の停止条件（同じ提案が3回連続で未解決）に触れていた。
  - 修正: `proposals/current.json`（**可変**な索引）を追加し、再発キーごとに `current` と `superseded` を記録する。`readProposal` に被代替提案の昇格拒否ガードを追加した（`current` と異なるIDの提案は `fail`）。提案ファイル自体は不変のまま変更していない。
- **(5) 重複4件の整理**: `current.json` に `current = ...b94f11bd4b566549`、`superseded = ...4065dc95 / ...5a071e44 / ...8d8aa16d` を登録した。根拠は、最後に提案を生成した intake `figma-log-intake-9e8a6cdb52d57f4a.json` の `proposalIds` が b94f11bd のみを指すこと、および4件の failure class・recurrence key・evidence count が同一であること。提案ファイルは削除・改変していない（追記のみの原則を維持）。
- 実行した検証（すべて実測）: `figma-gate.e2e.mjs` **PASS**（負のE2E3件を含む）。`figma-log-promote.e2e.mjs` **PASS**。実ログに対する `scan` を3回実行し、いずれも `7 tagged / 3 unclassified / 0 proposals` で同一、不変性エラーなし（冪等性を確認）。3回目は `current.json` の `current` / `superseded` が保持されることも確認した。
- **新たに判明した停止要因（重要）**: 実ログの scan は `waiting-human` で止まっており、**提案は0件生成**である。原因は `rules/corrections.md` の 2026-07-29 の3件（`proactive-fidelity-improvement` / `figma-to-code-is-cross-project-rulebook` / `one-shot-fidelity-is-the-product-goal`）に `loop-log` メタデータが無く未分類のためで、`spec/06`「新しい横断ログにメタデータがない場合は waiting-human とし、既存提案の自動昇格を止める」の正しい動作である。**これも `unverified-figma-value` の昇格が進まなかった原因の一つ**。分類（failureClass / recurrenceKey / ruleTargets / verifierTargets）の付与はオーナーの判断事項であり、起草役が推測で付けない。
- **昇格経路の相違（記録）**: 提案 b94f11bd が要求していた強化（`rules/figma-spec-pipeline.md` と `figma-gate.mjs` / `figma-gate.e2e.mjs`）は、D-011 の `apply`（review receipt＋promotion plan による限定差分適用）ではなく、**owner直接指示によるL2変更**として実施した。したがって D-011 の apply 経路は実行していない。提案の状態を `promoted` として閉じるかはオーナーの判断とし、提案ファイル（不変）は変更していない。
- 状態: **実装済み・独立批評待ち**。codex に (a) validateManifest 経由の到達性 (b) 既存要求の緩和の有無 (c) 除外リストの抜け道 (d) current.json ガードと不変性設計の整合 (e) 負のE2Eが失敗クラスを再現しているか、の5点で批評を依頼した。
- 次: codex の批評結果を記録する。オーナー判断は ①未分類3件の分類 ②提案 b94f11bd の閉じ方（promoted とするか）。

## [82] 2026-07-30 / codex + claude（P-7 独立批評: 合格。軽微指摘1件を反映）
- 判定（批評役 codex、起草役 claude）: **合格（PASS）**。[79] の指摘①②はいずれも解消と確認された。
  - ①（高）R3 の一意性: 解消。`spec/10-fix-order.md` の `R1→R2→R4→R3` 排他評価と R3=残余定義により機械判定できる。R4-1〜R4-6 はすべて既存規定（3A-2分類、component decision、D-012、units.md、spec note、訂正受領証）への写像であることを批評役が確認した。
  - ②（高）3ラウンドのFAIL集合: 解消。FAILキー（viewport／対象セレクタ／測定項目）の定義と、`rules/figma-spec-pipeline.md` 3B のラウンド定義への参照同期を確認。
  - ③（中）新条件の追加・既存要求の緩和: なし。「再定義ではなく写像」と評価された。
  - ⑤（低）ラベル不変原則との整合: 整合。エスカレーションが追記であることと D-012 の `blocked` に揃えた説明を確認。
- 軽微指摘（④中）: §1 のカテゴリ昇順説明で R4 の扱いが読み取りにくい。→ **反映済み**。`spec/10-fix-order.md` に「R4 はカテゴリ順の対象外」の項を分離し、カテゴリ昇順が支配するのは R1〜R3 の処理順だけであること、R4 は検出時点で停止し後回しにしないことを明記した。
- 結果: P-7（[80] で登録した未解消指摘の追跡）は**解消**。Q-10 は `確定` のまま、本文の欠陥が閉じた。

## [81] 2026-07-30 / claude（P-7 是正起草: R3付与条件の機械判定化。独立批評待ち）
- 承認記録: owner指示「P-7 — 上記 R3 の機械判定化（確定済み本文の変更なので承認が必要）／承認」。確定済み設問（Q-10）の本文変更についての承認である。
- 事前確認: `rules/figma-spec-pipeline.md` を実測し、経路ラベル・未収束・FAILキーの定義が**同ファイルには存在しない**ことを確認した（3A-2 はFAIL3分類、3A-3 は一括修正、3B 1-0 は構造一致ゲート、3B「FAIL時の反復」はラウンドの閉じ方のみを定める）。したがって定義の正本は `spec/10-fix-order.md` §1-2 の一箇所で、上位正本との二重定義は生じない。
- 是正の設計（[79] の指摘①への対応）: R3 の付与条件から「原因が対象スコープ内のCSS・assetに閉じるもの」という**原因推定を削除**し、**残余（上位3ラベルの否定）**として再定義した。判定は次の排他的な優先順で行う。
  1. **R1** ← 分類が `SPEC FAIL`（3A-2 の定義）
  2. **R2** ← `LAYOUT` / `VISUAL FAIL` のうち (a) 3B 1-0 構造一致ゲート違反 (b) §1 カテゴリ1（全件対応表のDOM構造不一致）(c) component manifest の `spacingOwnership` 違反 が記録されているもの
  3. **R4** ← 観測可能な6条件のいずれかが観測されたもの。**R4-1** 未分類差分 / **R4-2** component decision が `new` / **R4-3** scope lock（D-012）の許可パス外の変更が必要と判明 / **R4-4** 案件側 `units.md` の換算表に該当しない換算 / **R4-5** specのnoteにFigmaデータ矛盾が記録済み / **R4-6** 訂正受領証が未取得・失効
  4. **R3** ← 上記のいずれにも一致しない `LAYOUT` / `VISUAL FAIL`（残余）
  - これにより R3 と R4 の境界は「R4-1〜R4-6 が観測されたか」だけで決まり、判定者の解釈を含まない。6条件はすべて既存規定（3A-2 / component decision manifest / D-012 scope lock / 案件側 units.md / spec note / 訂正受領証ゲート）に実在する観測点への写像であり、新規の発明を含まない。
- 是正の設計（[79] の指摘②への対応）: 未収束の判定単位を **FAILキー = `viewport` / `対象セレクタ` / `測定項目`** の3つ組と定義した（`verify-layout` の出力ラベルが「セレクタ＋測定項目」で、viewportは実行単位で分かれるという実装事実に対応）。Figma node ID・カテゴリ・ラベルは参考併記とし同一性判定に使わない。宣言条件を「同一FAILキーが3ラウンド連続でPASSしない」に改め、ラウンドは3B「FAIL時の反復」の1回とし、件数の増減や別FAILキーのPASSではリセットしないことを明示した。
- 追加した規定: **R3 → R4 のエスカレーション**。R3 として着手後に R4-1〜R4-6 を観測した場合、ラベルを書き換えるのではなく「R4 へエスカレーションした事実・条件番号・根拠・観測時刻」を追記し、checkpointを停止してオーナー確認へ回す。上流方向のみを許し、R4→R3 の差し戻しを禁止する。これは既存の「ラベル不変」（読み替え禁止）と両立させるための用語分離であり、D-012 のscope lockが対象外パス検知でscopeを `blocked` にする挙動と同じ扱いである。
- 同期: `spec/10-fix-order.md` の §3「合否基準との対応」2行（経路ラベル・未収束の検証可能性）、状態行、編集履歴。`rules/figma-spec-pipeline.md` 3B「FAIL時の反復」に正本参照1行を追加。
- 非緩和の確認: 新しい合否条件・許容誤差の緩和・検証範囲の削減は追加していない。R4 の条件列挙は従来「上記で閉じない指摘」と包括的に書かれていた範囲を観測点へ分解したものであり、R4 の対象を狭めていない（未分類差分は R4-1 として明示的に維持）。
- 状態: **起草済み・独立批評待ち**。起草役（claude）は合格判定を行わない。codex に (1) 指摘①②の解消 (2) 新条件の追加・既存要求の緩和が無いか (3) 判定順序と §1 カテゴリ昇順の競合 (4) エスカレーション規定と「ラベル不変」の整合、の4点で批評を依頼した。
- 次: codex の批評結果を記録する。不合格なら次イテレーションで修正。合格なら Q-10 は確定のまま P-7 の追跡を閉じる。

## [80] 2026-07-30 / claude（owner承認によるQ-10の確定と、未解消指摘のP-7としての追跡）
- 承認記録: owner指示「なお :4 の状態行は「合格（kazu の確定承認待ち。／ 確定」。`spec/10-fix-order.md:4` の状態行を `確定` にする承認である。
- 実施: (1) `spec/10-fix-order.md:4` の状態行を「合格（kazu の確定承認待ち）」→「確定（2026-07-30 オーナー承認）」に更新し、R3の[中]指摘が未解消であること と 追跡先（P-7）を同じ行に明記した。(2) 編集履歴に2行追記した（2026-07-30 codex の不合格判定、2026-07-30 claude のowner承認による状態更新）。**2026-07-28 の既存履歴行は書き換えていない**（過去の記録は保存する）。(3) §1-2 の本文は変更していない。
- 状態表記の整合: `spec/QUESTIONS.md`（確定）/ `spec/10-fix-order.md:4`（確定）/ 編集履歴（批評結果と承認の経緯）の3か所が一致した。[79] で報告した食い違いは解消。
- **未解消のまま確定した指摘（P-7として追跡）**: 独立批評 [79] の是正要件は未実施である。確定は設問の状態についての判断であり、指摘の解消を意味しない。
  - **P-7**: (1) `R3` の付与条件に証跡項目（例 `scope-local=true` の明示フラグ）を追加し、R3/R4 の分岐を `SPEC` / `LAYOUT` / `VISUAL` から機械判定できる条件として完全定義する。(2) 未収束の宣言条件を「同一FAILキー（nodeId／カテゴリ／ラベル）で3ラウンド解消ゼロ」と明示する。対象は `spec/10-fix-order.md` §1-2 と、`rules/figma-spec-pipeline.md` フェーズ3A・3B の該当箇所。確定済み設問の本文変更にあたるためowner承認を要する。
  - リスク（記録のみ、対処は未実施）: 現状のまま案件で運用すると、R3とR4の境界が実装者の解釈に委ねられる。`spec/10-fix-order.md:77`（§3）は「§1-2 の各行は Q-09 の出力分類から機械的に決まる」と主張しているが、R3についてはこの主張が成立していない。
- 次: owner判断 ①P-7 の着手 ②[79] の P-1a（provenance検査の実装＋負のE2E＋昇格器の冪等性修正）③[79] の P-3 の固定入力の置き場所

## [79] 2026-07-30 / claude + codex（owner指示による4スコープ着手: P-6完了 / Q-10批評 / P-1レビュー / P-3着手）
- 契機: owner指示「P-6 に着手しろ。Q-10 の独立批評（起草が claude なので codex が担当）に進める。あわせて [75] の P-1（滞留提案4件の昇格）と P-3（忠実度ベンチマーク）も着手しろ。」

### P-6（合否基準の追跡性の回復）: 完了
- 実施: (1) `spec/09-verification.md` に §6「合否基準との対応」を追加した。既存 §1〜§5（三層の合格条件／実測の前提／実装中のゲート／ページ全体カバレッジ／未確認と失敗の扱い）への対応を明示しただけで、新しい合否基準は追加していない。(2) `spec/QUESTIONS.md` の正本列13件すべてに節アンカーを付与した（実測した節番号: 01=§4, 02=§4, 03=§7, 04=§5, 05=§5, 06=§5, 07=§5, 08=§4, 09=§6, 10=§3, 11=§5, 12=§6, 13=§5）。(3) 同ファイルの更新ルールに2行追加し、合否基準の正本が各specの当該節であること、アンカーが解決しない設問は `LOOP.md` ゴール条件2を満たさないため `確定` にできないことを明記した。
- 効果: 「合否基準との対応」節を持つspecが12/13 → **13/13**。ゴール条件2の欠落が解消し、以後は節の削除・改名がアンカー不整合として検出できる。設問文と状態は変更していない。

### Q-10 §1-2 の独立批評（批評役: codex、起草役: claude [71]）: **不合格**
- 判定と指摘は批評役の記録を正とする。
- **[中] 観点①不合格**: `R3` の付与条件が「原因が対象スコープ内のCSS・assetに閉じるもの」に依存し、既存FAIL分類（SPEC / LAYOUT / VISUAL）から機械的に一意決定できない。`spec/10-fix-order.md:44,45,51`。「分類できないFAILはR4」との接続はあるが、R3とR4の境界が判定者依存で、同一FAILへのラベル付けが再現しない。
- 観点②（R4停止と既存停止条件の整合）: 合格。`rules/figma-spec-pipeline.md:174,177,210,233` と整合。
- 観点③（未収束宣言が合否緩和の抜け道か）: 概ね合格。ただし **[低]** 「同じラベル3ラウンド」をどのFAIL集合で評価するかが未定義。
- 観点④（カテゴリ昇順と上流ラベル優先の競合解釈）: 合格。`spec/10-fix-order.md:48,49` で一意。
- 是正要件（批評役の指定）: (1) R3判定に証跡項目（例 `scope-local=true` の明示フラグ）を追加し、R3/R4分岐を判定条件として完全定義する。(2) 未収束ルールを「同一FAILキー（nodeId／カテゴリ／ラベル）で3ラウンド解消ゼロ」と明示する。
- **人間ゲート**: `spec/QUESTIONS.md` の Q-10 の状態は現在 `確定` であり、確定済み設問に未解消の指摘がある状態になった。状態変更はオーナー承認事項のため変更していない。差し戻すか、是正を確定状態のまま追補として扱うかの判断が必要。

### P-1（滞留提案4件の昇格）: 独立レビュー実施 → **昇格不可**
- 重複性: 4件（`8d8aa16d634fc8bd` / `5a071e44b16503b1` / `4065dc958c9d424a` / `b94f11bd4b566549`）は failure class・recurrence key・evidence count（2/threshold 2）がすべて同一で、**同一提案の重複**である。`latest.json` は `b94f11bd4b566549` のみを指すため、実効の最新提案は1件で残り3件は旧世代の残骸。[69] は「再実行の冪等性を確認した」と記録しているが、実際には intake ごとに新しい提案ハッシュが生成されており、冪等性は成立していない（`tools/figma-log-promote.mjs` の欠陥）。
- 独立レビュー（レビュー役 claude。提案生成器の作成者は codex であり独立性を満たす）。提案の Promotion gate が要求する4点で判定:
  - evidence: **PASS**。`rules/corrections.md:75`（`correction-provenance-spec-20260709`）と `rules/mistakes.md:84`（`mistake-provenance-spec-20260625`）の2件、閾値2に到達。各レコードのSHA-256が提案に記録されている。
  - non-weakening: **PASS**。Required change は対象ルールの強化のみで、検証・人間ゲート・許可リスト・停止条件・予算・ネットワークの緩和を含まない。
  - target scope: **PASS**。`rules/figma-spec-pipeline.md`、`templates/verify/figma-gate.mjs`、`templates/verify/figma-gate.e2e.mjs` に限定されている。
  - negative E2E: **FAIL**。`templates/verify/figma-gate.e2e.mjs` を実測したところ `provenance` / `unverified` / `inferred` / `negative` のいずれもヒット0件で、失敗クラスを再現する負のE2Eが存在しない。
- さらに判明した前提の欠落: 昇格対象の検証器 `templates/verify/figma-gate.mjs` を実測したところ、**spec値の取得元（provenance）を検査する機能そのものが存在しない**（`provenance` / `source` / `origin` / `inferred` のヒットは `responsiveHtml.sourceFiles` のみ）。つまり最も再発している失敗クラス `unverified-figma-value`（Figmaから取得していない推測値をspec・検証基準に使う）に対する機械的強制は未実装であり、負のE2Eを書く対象が存在しない。
- 判定: `loop-engineering/spec/06-self-improvement.md` の停止条件「ログ昇格提案に必要な負のE2E、独立レビュー、owner承認のいずれかが欠ける」に該当するため **`waiting-human`**。正本ルール・検証器は変更していない。
- 昇格に必要な追加スコープ（**P-1a**）: (1) spec の各期待値に取得元（`provenance`: metadata / design_context / screenshot実測 / asset実測）を必須化し、preflightで取得元なしの期待値を拒否する検査を `figma-gate.mjs` へ実装 (2) 取得元のない期待値でpreflightが失敗する負のE2Eを `figma-gate.e2e.mjs` へ追加 (3) `rules/figma-spec-pipeline.md` へ同じ契約を明記 (4) `tools/figma-log-promote.mjs` の冪等性欠陥を修正し重複提案3件を整理。owner承認が必要。

### P-3（ワンショット忠実度ベンチマーク）: 着手（設計要件の定義まで）
- 目的（owner訂正 2026-07-29「one-shot-fidelity-is-the-product-goal」より）: 初回実装でFigmaどおりになる確率を数値で測り、正本・テンプレート・検証器の改善が実際に効いたかを機械判定できるようにする。
- 測定項目（受入条件）: 対象セクションごとに (1) 初回 `checkpoint` 時点のFAIL件数を SPEC / LAYOUT / VISUAL 別に記録 (2) PASSまでに要した同一checkpointの再実行回数（＝手動修正ラウンド数）(3) PC/SP全spec のPASS率 (4) painted componentの差分率 (5) 所要時間。いずれも既に `close-report.json` と `loop-learn.mjs` の学習イベントが持つ項目の部分集合であり、新規の計測器を作らずに集計できる見込み（🔶 `close-report.json` は最終状態のFAIL 0件のみを保存しており、**初回checkpoint時点のFAIL件数を保持しているかは未確認**。P-3実装時に最初に確認する）。
- 未確認・owner依存の前提: ベンチマークには固定入力となる実Figmaページが必要。`figma-to-code` は案件横断の正本であり案件固有のFigma URL・node-idを置けない（`rules/corrections.md` 2026-07-29「figma-to-code-is-cross-project-rulebook」）。したがって固定入力の置き場所（ownerのFigmaテストファイルか、案件側MyBrainからの参照か）を決める必要がある。**この決定はownerの判断事項**。
- 本イテレーションでは設計要件の定義までとし、計測器の実装・固定入力の登録は行っていない。

### 次
- owner判断: (1) Q-10 の状態（確定のまま追補か、差し戻しか）(2) P-1a の着手承認 (3) P-3 の固定入力の置き場所
- 未着手: [75] の P-2（Q-12は [77][78] で完了。残りはQ-10の是正）、P-4（Q-13/Q-08の実行器接続）、P-5（予防的機能カバレッジ監査）

## [78] 2026-07-30 / claude（owner承認によるQ-12確定と、ゴール条件の機械判定）
- 承認記録: owner指示「Q-12 の状態を確定に変更。」に基づく代行更新。`spec/QUESTIONS.md`「更新ルール」の状態変更はオーナー承認事項であり、本件は対象設問（Q-12）と目的状態（確定）が特定された承認である。
- 実施: (1) `spec/QUESTIONS.md` の Q-12 を「差し戻し（2026-07-18）」→「確定」。(2) `spec/12-loop-design.md:3` の状態行を「差し戻し」→「確定（2026-07-30 オーナー承認。修正起草は [66]、独立批評の合格判定は [77]）」に同期（[77] 指摘3の解消）。
- ゴール条件（`LOOP.md`）: 条件1（全設問 `確定`）✅ / 条件2（各回答に検証可能な合否基準）✅ 13/13にアンカー付与 / 条件3（TODO・FIXME 0件）✅。**3条件は満たしたが、[75] の原因1（効果測定の不在＝P-3）は残っている。原因4（検証器の穴＝P-4）は[104]で独立実行器・隔離E2Eを合格とし、owner承認H/Fにより[105]でgate統合したが、統合はrelease-checkの別Chrome経路で不合格となった。[106]で是正済みだが、統合後の合格判定はterra ultra代替再批評が必要であり、codexは出していない**
  1. **QUESTIONS.md の全設問が `確定`** → ✅ 達成。Q-01〜Q-13 のうち Q-12 が最後の未確定だった。
  2. **各回答に検証可能な合否基準が付いている** → ❌ **未達**。`spec/` の設問回答13ファイルのうち「合否基準との対応」節を持つのは12ファイルで、**`09-verification.md` に存在しない**。同ファイルの節構成を実測した結果は「方針 / 1. 検証の三層 / 2. 実測の前提 / 3. 実装中のゲート / 4. ページ全体カバレッジ / 5. 未確認と失敗の扱い / 参照 / 編集履歴」であり、合否基準との対応節が無い。Q-09 は `確定` 状態だが、合否基準の対応を機械的に追跡できない。
  3. **仕様本文の未解決 TODO / FIXME が 0 件** → ✅ 達成。`spec/` 配下を実測して0件（[74] の「過去STATE記録内のみ」と整合）。
  - 判定: **ゴール未到達**。条件1と3は達成、条件2が Q-09 で欠落している。
- 新規提案 **P-6**: `spec/09-verification.md` に「合否基準との対応」節を復元し、Q-09 の合否基準を追跡可能にする。あわせて [77] 指摘1（`QUESTIONS.md` が表形式化して合否基準欄と回答先の節アンカーを失った）を同じスコープで扱う。両者は同根であり、回答先アンカーが失われたことで spec 側の節が削除されても検出されなくなった。Q-09 は確定状態のため、本文への節追加はL2の正本変更としてowner承認を要する。本記録では変更していない。
- 経緯の推定: この節は過去に存在し、旧 `QUESTIONS.md` は「回答先: spec/09-verification.md#6-合否基準との対応」の形で参照していた（🔶 当時の会話記録に基づく推定。現行ファイルに節が無いことは✅実測）。`09-verification.md` は [67][74] で大きく改訂されており、その過程で失われた可能性がある。
- 次: owner が P-6 の着手を判断する。[75] の P-1〜P-5 は未着手のまま。

## [77] 2026-07-30 / claude（Q-12 独立批評: 合格）
- 前提: owner が [76] の案Aを選択。批評役に claude を指定した。Q-12 の修正起草は [66] の **codex** であり、起草役（codex）と批評役（claude）は別ベンダーのため `loop-engineering/spec/05-spec-dev-loop.md` の役割分担（D-005）を満たす。正本の規則は変更していない。
- 判定基準: `spec/12-loop-design.md` §6「合否基準との対応」の5項目、および差し戻しの根拠である [61]（再利用・公開照合の強制不足）[62]（Codex実装役でのFAIL→修正ループ、工程重複）[65]（高1 凍結入力の迂回／高2 独立検証を強制できない／高3 release-check未接続）。
- 検証方法: 仕様本文・テンプレート・実行ゲートのコードを実測照合した（`spec/12-loop-design.md`、`templates/LOOP.md`、`templates/verify/figma-gate.mjs`、`templates/verify/figma-page-coverage.mjs`）。行番号は実測時点のもの。
- [65] 高1（凍結入力の迂回）: **解消** ✅。`figma-gate.mjs:1114` が section-start で、`:1118` が section-close で `requireFrozenPreflight`（`:657`→`:665` で `assertFrozenInputs`）を実行する。section-close はさらに `:1120-1122` で manifest パス一致、`:1123` で checkpoint 証跡整合性を確認する。checkpoint `:684`、close `:975`、release-check `:1065` を含め5工程すべてで凍結照合が走る。preflight後に spec・DOM対応表・component decision・Figma証跡を差し替えても section 開始・完了に進めない。
- [65] 高2（独立検証を強制できない）: **解消** ✅。page coverage review は `figma-page-coverage.mjs:94` で `reviewerActor === implementationActor && reviewerContextId === implementationContextId` を拒否する。new判定は `figma-gate.mjs:513` で `independentApproved: true` を section-start 前に必須化し、`:518` で同じ組合せを拒否する。実装役が自分で承認する経路は塞がれた。仕様 §1 の記述と実装は一致する。
- [65] 高3（公開後release-check未接続）: **解消** ✅。`releaseCheck:1057` は `phase === "closed"`（close成功）を前提とし、`validateReleaseRecord:1034-1055` が version 1 / status `pending` / `ownerApproved: true` / `ownerApprovedAt` / `deploymentId` / `publicUrl`（URL構文と **HTTPS** を強制）を検査する。公開URLで全 checkpointPlan の再測定・painted再diff（`:1069-1071`）、`releaseCheckpoints` の完了確認（`:1073`）、公開URLでの全spec実測（`:1074`）を実行し、PASS時だけ record を `passed` にして凍結入力7種のハッシュと検証component一覧を追記する。`templates/LOOP.md` ゴール条件5・手順11が「未記録なら公開完了と報告しない」を明文化している。
- [62] 修正条件: **解消** ✅。(1) `templates/LOOP.md:24-26` は実装役・検証役とも「開始時にkazuが指定する」としエージェント名を固定しない（`rules/loop-execution.md`「担当者」と整合）。手順7（`:101`）に「FAILならQ-10の順で原因診断→必要最小限の修正→同一componentのcheckpoint再実行をPASSまで繰り返す。PASSまで次component・section-close・完了報告へ進まない」を明記。(2) preflight は `:46` `:98` で「一度だけ」。(3) 手順9（`:103`）が「Sass build、単位lint、PHP lint、全spec再測定はcloseが唯一実行する」と定め、実装 `close:990-998` と一致。W3C/a11yと全セクション描画比較は別の一度実行として分離。(4) release-check は build/lint/close を再実行しない（`releaseCheck:1057-1106` に該当呼出しなし）。
- [61] 修正条件: **解消** ✅。component decision manifest の検証器 `validateComponentDecisionManifest:464` が存在し、preflight で `componentDecisionSha256` として凍結され release の `frozenInputs`（`:1087`）にも含まれる。new は独立承認必須（`:513`）。公開照合は高3のとおり。
- 判定: **合格（承認待ち）**。`spec/12-loop-design.md` §6 の5項目すべてが仕様本文・テンプレート・実行ゲートで一致して裏付けられている。
- 残る指摘（いずれも合否を下げない。内容の欠陥ではなく記述の追跡性・保証範囲の問題）:
  - **指摘1（中／横断・人間ゲート事項）**: `spec/QUESTIONS.md` が表形式（ID・設問・正本・状態）に変更され、`loop-engineering/spec/05-spec-dev-loop.md` が必須とする設問書式（`状態` / `回答先: spec/{ファイル}#{節}` / `合否基準`）と一致しない。特に **合否基準欄が存在しない**ため、`LOOP.md` ゴール条件2「各回答に検証可能な合否基準が付いている」を QUESTIONS.md 単体では追跡できない。実質は各specの「合否基準との対応」節（Q-12 は §6）が担っている。設問書式の変更は人間ゲートのため、本批評では変更せず提案として記録する。
  - **指摘2（中／Q-12本文への追記推奨）**: §1 の独立性検査は `reviewerContextId` を含むが、contextId は manifest・review JSON に書かれた**自己申告の文字列**であり、ゲートは「実際に別コンテキストで実行されたか」を検証できない。同一actorが別のcontextId文字列を書けば通る。仕様（別スレッドを許す設計）どおりであり [65] 高2 の「実装役が自分で承認できる」状態は解消済みだが、保証範囲は「actor と contextId の組合せが同一でないこと」までである。§1 にこの保証範囲を明記することを推奨する。
  - **指摘3（低）**: `spec/12-loop-design.md:3` の状態行が「差し戻し（2026-07-18。修正起草と自己監査は STATE.md [64][65]。独立批評待ち）」のままで、[66] の修正起草と本批評に言及していない。状態変更に合わせた更新が必要。
- 人間ゲート待ち: `spec/QUESTIONS.md` の「更新ルール」により**状態変更はオーナー承認を要する**ため、Q-12 の状態（差し戻し → 合格（承認待ち）／確定）は本批評では変更していない。`spec/12-loop-design.md:3` の状態行も同様に未変更。
- 次: owner が Q-12 の状態を更新する。Q-10（起草は [71] の claude）の独立批評は別ベンダーの codex が担当する。

## [76] 2026-07-30 / claude（owner指示「起草役と同一actorでも合格判定を出せるように変更しろ」の影響分析。正本は未変更）
- 位置づけ: owner指示は正本（`C:\AI\loop-engineering`）の採用済み設計判断の変更にあたり、`LOOP.md` ガードレールの人間ゲート（DECISIONS への採用記録）に該当する。着手前に影響範囲と代替経路を実測した。この記録時点で spec・templates・検証器・DECISIONS は変更していない。
- 変更が波及する箇所（実測）:
  - `spec/DECISIONS.md`: D-001（実装と検証の分離／採用）、D-005（起草役と批評役を別ベンダーに分ける／採用）、D-007（L1→L2自動昇格の条件に「実装役と別の独立検証役」／採用）、D-008（「自己検証のみへの切替は禁止」と明記／採用）の4件。`AGENTS.md` により既存エントリの書き換え・削除は禁止のため、撤回ではなく新エントリでの上書き記録が必要。
  - `spec/05-spec-dev-loop.md`: 役割分担表の批評役、Claude検証設定（起草役がClaudeならClaude批評は設定不正として `waiting-human`）。
  - `spec/01-loop-spec.md`: Claude検証設定の代替検証役（「実装役と別コンテキスト」）、L1→L2自動昇格の必須記載（「実装役と別の独立検証役」）。
  - `templates/LOOP-spec-dev.md`: `agents` の批評役欄と「起草役がClaudeの場合はdisabled＋代替批評役」の制約行（`AGENTS.md` 禁止事項により仕様と同時更新が必要）。
  - `C:\AI\figma-to-code\templates\verify\`: `implementationActor` / `reviewerActor` の不一致を強制する実装が6ファイル（`figma-gate.mjs`、`figma-page-coverage.mjs`、`figma-gate.e2e.mjs`、`figma-gate-template.json`、`component-decisions-example.json`、`page-coverage-review-template.json`）。これはFigma実装ループの独立検証であり、[75] 原因4（検証器の穴）を塞ぐ側の仕組みである。
  - `README.md` 版番号: `AGENTS.md` 規則7（既存フィールドの意味変更はマイナーを上げる）により 0.6.0 → 0.7.0。
- 指示の前提に対する実測結果（重要）: 現在の停止は「同一actorしか使えない」ためではなく、**役割の割り当てが起草役と同じ側に寄っているため**である。
  - Q-12: 起草は [66] の **codex**。したがって **claude が批評すれば D-005 の別ベンダー要件を満たす**。規則を変更せずに独立批評を実施できる。
  - Q-10: 起草は [71] の **claude**。したがって codex が批評すれば満たす。本セッションから codex を起動する経路は実在する（本プロジェクトの過去イテレーションで実行実績あり）。
  - 担当の固定は解除可能: `rules/loop-execution.md`「担当者」は、実装役・検証役をownerがタスク開始時に指定し、LOOP内の役割表記で特定エージェントへ固定しないと定める。`LOOP.md` の「起草役: claude / 批評役: codex」は既定の表記であり、owner指定で入れ替えられる。
- 選択肢:
  - **案A（推奨）**: 正本を変更せず、Q-12は claude、Q-10は codex を批評役として実施し停止を解除する。移行コスト0。D-001/D-005/D-007/D-008 と検証器6ファイルに触らない。
  - **案B**: D-001/D-005 を削除せず、仕様育成ループの批評役に限った条件付きフォールバックを新エントリ（D-016 相当）として追加する。適用条件は「別ベンダーの批評役が利用不能であることをownerが記録した場合」に限り、(a) 起草とは別コンテキスト (b) 合否基準ごとのPASS/FAILを根拠付きでSTATEへ記録 (c) 「同一actor批評」であることをSTATEとQUESTIONSの状態欄に明示 (d) `確定` は従来どおりowner、を必須にする。Figma実装ループの `reviewerActor` 強制は対象外とする。
  - **案C（非推奨）**: D-005 を無条件で撤回し、同一actorの合格判定を制約なしに許可する。理由: 採用済み判断4件と検証器6ファイルが同時に緩み、[75] 原因4（Figma実装側の独立検証の穴）を塞ぐ方向と逆行する。本プロジェクトでは自己監査が合格判定を出さない運用のもとで [63][65] が重大・高の欠陥を検出しており、同一actorでの合格判定を無条件化する根拠となる実測は無い。
- 判断待ち: 案A / 案B / 案C のいずれか（DECISIONS への採用記録は人間ゲート）。案Aならownerの担当者指定のみで着手できる。
- 次: owner の選択。選択まで正本・検証器を変更しない。

## [75] 2026-07-30 / claude（Loop Engineering L1監査: 初回実装の忠実度が上がらない原因）
- 契機: owner指示「このプロジェクトの内容だとまだfigmaデザインどおりにaiがコーディングしない場合があるので、ループエンジニアリングで改善して」。`C:\AI\vault\WORKFLOW.md` §ループエンジニアリングの共通起動に従い、`C:\AI\loop-engineering` の `CLAUDE.md` / `AGENTS.md` / `README.md`（版0.6.0）、`spec/06-self-improvement.md`、`spec/07-graph-orchestration.md`、`rules/loop-execution.md`、本プロジェクトの `LOOP.md` / `STATE.md` / `rules/corrections.md` / `rules/mistakes.md` / `learning/` を読み、L1（読み取りと報告のみ）で監査した。正本・spec・検証器・コードは変更していない。
- グラフ化診断（`spec/07-graph-orchestration.md`）:
  1. 視点の分離: **肯定**。起案・独立批評・予防監査・効果測定が同一actorに集中しており、[66][71] は起草者と検証者が同一のため合格判定を出せず停止している。
  2. 並列化の余地: **肯定**。Figma機能領域別（取得・トークン・レイアウト・タイポ・アセット・コンポーネント・レスポンシブ・モーション・検証・a11y）のカバレッジ監査は相互依存しない読み取り作業で、書込み許可パスも重ならない。
  3. 経路の分岐: **肯定**。監査結果の種類で戻り先が変わる（未対応→spec起草 / 検証不能→検証器 / 根拠不足→Figma再取得 / 正本変更→human-gate）。経路ラベルは有限集合として定義可能。
  4. 完了条件: 単一ループのゴール（QUESTIONS.md 全問`確定`）とは**異なる**。グラフ側は「ベンチマークにおける初回実装のFAIL分類ゼロ率」を機械判定条件にできるが、**その測定基盤が未実装**のため現時点では定義のみ。
  - 判定: 1〜3が肯定かつ4を記録したため `topology: graph` の**候補**に該当する（`spec/07` の昇格要件）。ただし診断は自動昇格の根拠にならないため、構成はL2として保留し、既定は `single-loop` を維持する。
- 監査結果（原因を上流から）:
  - **原因1: 効果測定の不在** ✅。owner訂正 2026-07-29「one-shot-fidelity-is-the-product-goal」は、実Figmaページのベンチマークで初回実装のFAIL分類・再実測・手動修正回数を受入条件にすると定める。`learning/` 配下の実測は `log-promotions` のみで、ベンチマーク結果は0件（Glob実測）。初回実装の忠実度を数値で持たないため、[74] のようなL2改善が「Figmaどおりでない場合」を減らしたかを機械判定できない。今回の指摘に最も直接対応する欠落。
  - **原因2: 学習の滞留** ✅。同一再発キー `unverified-figma-value`（Figmaから取得していない推測値をspec・検証基準に使う）の昇格提案が `learning/log-promotions/proposals/` に4件、すべて `pending-review`。`spec/06-self-improvement.md` の停止条件「同じ提案が3回連続で未解決」に該当する。最も再発している失敗クラスが、独立レビューとowner承認の不在によってルール・検証器の強化へ接続されていない。
  - **原因3: 実行契約の未確定** ✅。Q-12（component再利用の強制・凍結入力の再照合・公開URL照合）は [61] 以来差し戻し中で、[66] の修正起草以降**独立批評が未実施**。実行契約が未確定のため、「既存componentを調査せず新規実装する」「preflight後に凍結入力を差し替える」経路が実際に塞がれたかを確認できていない。
  - **原因4: 検証器の穴** ✅。`templates/verify` を実測した結果、a11y（`axe` / `contrast` / `keyboard` / `aria-expanded`）に一致するファイルが**0件**、状態強制（`forcePseudoState` / `forceState` / `pseudoClass`）も**0件**。Q-13は仕様上Q-09へ統合済みとされ、Q-08はhover/open/中間状態の照合を要求するが、いずれも実行器が存在しない。[63] の指摘が [74] の範囲外として残置されている。
- 提案（L2候補。ID付き。実施はowner承認後）:
  - **P-1**: `unverified-figma-value` の滞留提案4件を1件へ統合し、負のE2E→独立レビュー→owner承認の昇格契約（`spec/06` / `rules/correction-log-promotion.md`）で処理する。最も再発している失敗クラスへ直接効く。
  - **P-2**: Q-12（[66] 起草分）とQ-10（[71] 起草分）の独立批評を、起草役と別actor/contextで実施する。ownerによる担当者指定が前提（`rules/loop-execution.md`「担当者」）。
  - **P-3**: ワンショット忠実度ベンチマークの新設。実Figmaページを固定入力とし、初回実装のSPEC/LAYOUT/VISUAL別FAIL件数・手動修正回数・PC/SP全spec PASS率を記録する。原因1の解消であり、P-1/P-2/P-4の効果判定の土台になる。
  - **P-4**: Q-13（axe-core・コントラスト・キーボード走査）とQ-08（hover/open/中間状態）の実行器接続。合否契約と実行器の乖離を閉じる。
  - **P-5**: 予防的な機能カバレッジ監査（owner訂正 2026-07-29「proactive-fidelity-improvement」の未実装分）。Figma機能ごとに取得・spec化・変換・検証の対応表を監査し、未対応・検証不能・根拠不足を提案化する。グラフ構成の候補はこのノード群。
  - 推奨順: P-1 → P-2 → P-3 → P-4 → P-5。P-3を先に置く選択もあり得るが、P-1/P-2は既に起草・提案が存在するため着手コストが低い。
- 承認ゲート: 正本・spec・検証器・テンプレートの変更、提案の昇格、グラフの構成はすべてowner承認が必要（`LOOP.md` 人間ゲート、`spec/06` 出力と昇格）。実装役・検証役はownerがタスク開始時に指定する。
- 次: ownerがP-1〜P-5の着手順と担当者を指定する。指定までL2へ進まない。

## [74] 2026-07-29 / codex（Loop Engineering L2改善: verify-layout拡張とcomponent spacing gate）
- やったこと: owner承認を受け、[73] のL2推奨範囲から `verify-layout.mjs` の測定項目拡張と、component rootの外側セクション間padding禁止のgate化を実施した。Q-12の合格判定は、過去の起草・自己検証と同一actorのため行っていない。
- 変更: `verify-layout.mjs` が line-height、文言（textContent/innerText）、描画行数（lineCountは完全一致）、角丸、padding/margin/gap、top等を測れるようにした。`figma-gate.mjs` はcomponent manifest各componentの `spacingOwnership` を必須化し、rootPaddingはnone/internalのみ、interSectionSpacingはparent-layout/not-applicableのみを許可する。外側セクション間余白をcomponent root paddingとして宣言するとpreflightで拒否する。
- 同期: `spec/09-verification.md`、`rules/figma-spec-pipeline.md`、`templates/LOOP.md`、`templates/verify/README.md`、`spec-example.json`、`components-example.json`、`figma-gate.e2e.mjs` を同じ契約へ更新し、`verify-layout.e2e.mjs` を追加した。
- 検証: verify配下JSON全件解析PASS、MJS全件 `node --check` PASS、`verify-layout.e2e.mjs` PASS、`figma-gate.e2e.mjs` PASS、`loop-learn.e2e.mjs` PASS。TODO/FIXME検索は過去STATE記録内のみ。
- 次: Q-12/Q-10の独立批評と、Q-13のaxe-core・contrast・keyboard走査の実行器接続は未完。a11yは別スコープで扱う。
## [73] 2026-07-29 / codex（Loop Engineering L1監査: Figma 100%再現改善）
- やったこと: owner指示「このプロジェクトをブラッシュアップするためにループエンジニアリングで改善」を受け、`C:\AI\vault\WORKFLOW.md` の起動条件に従い、`C:\AI\loop-engineering` 正本、現行 `LOOP.md` / `STATE.md`、Q-09/Q-10/Q-12/Q-13、`rules/figma-spec-pipeline.md`、`templates/LOOP.md`、`templates/verify/README.md`、`verify-layout.mjs`、`figma-gate.mjs` をL1で監査した。
- 結果: topologyは `single-loop` が妥当。未完の独立批評（Q-12/Q-10）と実行器の測定不足が主因で、現状の最大リスクは (1) `verify-layout.mjs` が line-height / textContent / 改行・行数 / border-radius 等を測らず、Q-09/Q-11の合否契約を満たせないこと (2) Q-13は仕様上Q-09統合済みだが、現行gate/verifyにaxe-core・contrast・keyboard走査の実行が無いこと (3) `component-section-spacing-ownership` が訂正ログにあるだけで、component rootの外側section間paddingを拒否するgateが無いこと (4) Q-12は修正起草済みだが、同一実装者の自己検証であり合格へ進めないこと。
- 次: L2で正本または検証器を変更するにはowner承認が必要。推奨するL2スコープは、まずQ-12独立批評を完了し、その後 `verify-layout.mjs` / spec schema / gate E2Eへ「文言・改行・行数・line-height・radius・component外側padding拒否」を追加する。a11y実行器接続は別スコープで扱う。

## [72] 2026-07-28 / claude（owner指示: 文字化けした履歴の分離）
- 範囲: 判読不能なイテレーション記録 [60]〜[0]（484行・66,034バイト・U+FFFD 2,860箇所）を `STATE-archive-corrupted-0-60.md` へ移した。本ファイルは現在地・[71]〜[61]・エスカレーションを保持する。記録の削除はしていない。
- あわせて処理: エスカレーション節の後ろに `##` 無しで混入していた `[61] 2026-07-15 / codex（契約v4起点）` を、番号重複（Log の [61] は 2026-07-18）と判読不能を理由に同じアーカイブへ移した。内容を復元できないため改番はしない。
- 構造行の復元: 文字化けしていた見出しとコメント5行（仕様コメント、Log見出し、新しいものを上に追記の注記、Escalations見出し、その注記）を C:\AI\loop-engineering\templates\STATE.md の同一文言に基づいて復元した。推測ではなく雛形との一致による復元であり、記録本文は一切復元していない。
- 復元しなかったもの: [60]〜[0] の本文。U+FFFD がファイルに焼き付いており逐語復元は不可能。この期間の結論は各 `spec/*.md` と `QUESTIONS.md` を正本とする。
- 状態: 記録の整理のみ。設問状態、`spec/`、`rules/`、`templates/`、検証ツールは変更していない。

## [71] 2026-07-28 / claude（owner指示: 差分指摘への修正経路ラベル導入）
- 範囲: `spec/10-fix-order.md` に §1-2「修正経路（ルーティング）ラベル」と「未収束の宣言（3ラウンド）」を追加し、§3 に検証可能性、出典4、編集履歴を同期した。他のspec、`rules/`、`templates/`、検証ツールは変更していない。
- 起草根拠: owner指示。外部記事 `github.com/chaaaaarin/claudecode-channel-20260723` 第6章の「指摘に修正経路ラベルを付け、経路ごとに戻り先を固定する」という整理だけを採用した。判定条件と戻り先は新規に発明せず、既存規定へ写像している。R1=フェーズ3A-3（SPEC FAILは実装を変更せずFigma取得・DOM対応表の補完へ戻る）、R2=フェーズ3B 1-0（構造一致ゲート。CSSでの視覚合わせ禁止）、R3=フェーズ3A-3の一括修正バッチ、R4=フェーズ0A・フェーズ2の規約逸脱停止・オーナー訂正受領証ゲート。
- 追加の実質: (1) カテゴリ（直す順序）と経路（戻り先）を分離し、FAIL 1行ごとに `C4/R3` の形で併記させる。(2) 複数該当時は上流ラベル優先（R1 > R2 > R3）、検出後のラベル読み替えを禁止。(3) 既存 §2-5 の「3回失敗で停止・報告」を「未収束の宣言」として報告様式まで固定した（残FAILのカテゴリ／ラベル／件数、3ラウンドの実測推移、原因候補は断定しない、オーナーが選べる選択肢と影響範囲）。宣言後の許容誤差の拡大、spec からの対象除外、PASS済みだけの再測定を明示的に禁止した。
- 記事の限界の扱い: 引用元の実測は1環境・1回であり効果の一般化はできない（記事自身が明記）。この事実を出典4に記載し、効果を根拠として本文に持ち込んでいない。
- 未実施（意図的）: `QUESTIONS.md` の Q-10 の状態、`rules/` 配下、`templates/`、検証ツールは変更していない。報告テンプレートへのラベル欄追加は `rules/figma-spec-pipeline.md` の所管のため、本イテレーションのスコープ外とした。
- 観察（変更なし）: `spec/10-fix-order.md` の見出し状態は「合格（kazu の確定承認待ち）」だが `QUESTIONS.md` の Q-10 は「確定」で不一致。人間ゲート事項のため変更せず記録のみとする。
- 状態: **起草済み・独立批評待ち**。起草役（claude）は合格判定を行わない。次は codex が §1-2 を独立批評する。観点: ①R1〜R4の付与条件が既存FAIL分類から一意に決まるか（重複・空白がないか）②R4での停止が既存の停止条件と矛盾しないか ③未収束宣言が合否緩和の抜け道にならないか ④§1のカテゴリ昇順処理と上流ラベル優先が競合した場合の解釈。

## [70] 2026-07-19 / codex（owner指示: フェーズ3BのFigma比較を明文化）
- 範囲: `rules/figma-spec-pipeline.md` のフェーズ3B「PC/SPを各1回、同一checkpointコマンドで全件実測する」だけを更新した。Figma実装のPC/SP実測を、ブラウザ内の値だけではなく、preflightで固定したFigma node ID、spec値、参照画像、asset、crop・mask・閾値と比較する工程として明記した。
- 起草根拠: owner指示「Figma値取得・対象修正・PC/SPでFigma対ブラウザ比較・HTML変更時のみW3C」という1ラウンド固定順序。既存のフェーズ3Aの全件収集、FAIL分類、一括修正、evidence保存、完了条件は変更していない。
- 独立批評: reviewerが、SPEC / LAYOUT / VISUAL / 未分類差分のいずれか1件でもcheckpointをFAILとする文面、Figma固定入力の未取得をSPEC FAILとする文面を要求し、反映した。
- 状態: owner承認済みの明文化更新。`QUESTIONS.md` の設問状態およびQ-12の差し戻し状態は変更しない。

## [69] 2026-07-18 / codex（Q-12関連: Figma横断訂正ログの昇格器起草）
- 範囲: `rules/corrections.md` / `mistakes.md` の案件横断ログを、再発キーと許可済み対象だけの機械可読レコードとして取り込む `tools/figma-log-promote.mjs` を追加した。出力は不変のintake/reportと `pending-review` 提案であり、正本ルールや検証器を直接編集しない。
- 検証: 隔離E2Eで、同じ再発キー2件からの提案生成、入力ログ不変、再実行の冪等性、新しい未分類ログでの `waiting-human` 停止を確認した。保存済みの「推測値を検証基準にした」横断ログ2件から、初回の `pending-review` 提案を生成した。
- 状態: D-010は起草、Q-12は独立批評待ちのまま。提案の昇格には負のE2E、独立批評、kazuの承認が必要であり、ここでは確定・自動適用をしていない。
## [68] 2026-07-18 / codex（Q-12関連: 自己改善フェーズの実行器起草）
- 範囲: close後の事実駆動自己改善を追加した。対象は `loop-learn.mjs`、改善カタログ、`figma-gate close` の起動フック、案件LOOP導入契約、隔離E2Eであり、Figmaデザイン実装コードは変更していない。
- 実装: close後に所要時間、componentごとのPC/SP実測回数、HTML/PHP変更時のW3C記録、scope観測可能な事実をJSONへ保存する。既知かつ `effect: strengthen` / `scope: project-local` の制御だけを案件ローカルへ追加し、正本変更が必要なものは根拠付き `pending-review` 提案へ分離する。
- 検証: `loop-learn.e2e.mjs` で安全制御、提案、unsafe policy拒否、gate state入力を確認し、`figma-gate.e2e.mjs` でclose後のevent/report生成を確認した。
- 状態: Q-12の差し戻し状態は変更しない。本起草は独立批評待ちであり、正本ルールへの自動昇格はしていない。
## [67] 2026-07-18 / codex（Phase 3A 実行器の新ルール適合）
- 範囲: `rules/figma-spec-pipeline.md` のPhase 3Aで検出した「固定待機・viewportごとのChrome起動・mask未対応」を、手作業の例外運用ではなく検証実行器で是正した。
- 実装: `cdp-browser.mjs` を共通化し、`checkpoint-capture.mjs --batch` と `verify-layout.mjs` が固有CDP port/profileの単一Chrome sessionを使うよう変更した。ページ完了、Web Font、画像、対象selectorの可視矩形を条件待機し、固定秒数sleepを撤廃した。`figma-gate checkpoint` はPC/SPのcapture jobを一括起動し、session ID / PID / readinessを凍結証跡として保存する。
- 描画差分: `checkpoint-diff.mjs` にFigma根拠のalpha mask（`exclude`）を追加した。maskのSHA-256・寸法・空/全面maskを検査し、比較pixel数・除外pixel数・差分率を出力する。gateはmaskをmanifestで凍結し、未宣言または差替えmaskをFAILとする。
- 集約: `figma-gate close` は `close-report.json` に SPEC / LAYOUT / VISUAL別の集約結果を保存する。導入README、components manifest見本、案件LOOP雛形、spec/09を同じ契約へ同期した。
- 検証: MJS構文検査、隔離gate E2E、実ChromeのPC/SP batch capture・layout実測、実PNGのmaskあり/なし差分を実行する。Q-09/Q-12の独立批評・確定状態は本記録だけでは変更しない。
## [66] 2026-07-18 / codex（Q-12 修正起草: 凍結・独立性・公開照合の強制）
- 範囲: 差し戻し中のQ-12だけを修正した。Q-09/Q-13の合否項目そのものは変更していない。
- 凍結入力: `section-start` と `section-close` の両方で、active preflight state、manifest、spec、DOM対応表、component decision、Figma node/layer証跡のハッシュを再照合するようにした。変更後は次のcheckpointやsection完了へ進めない。
- 独立性: manifestのimplementationActor/contextと、page coverage reviewおよびnew判定のreviewerActor/contextを必須化した。actorとcontextが両方同じ自己承認はpreflightで拒否する。別agentまたは別スレッドは維持できる。
- 公開照合: `release-check`を追加した。成功済みcloseとowner承認済みのpending recordを前提に、HTTPS公開URLでPC/SP全spec実測と全painted componentのcapture・再diffを実行する。PASS時だけrecordへURL、デプロイ識別子、実行時刻、凍結入力ハッシュ、検証component一覧を追記する。STATEへrecordパス/SHA-256等を記録するまで公開完了と報告できない。Figma再取得、ローカルcheckpoint、build/lint、closeは再実行しない。
- 追加是正: painted componentを含むE2Eで検出したsection-closeの未正規化component参照を、凍結済みmanifestで検証したcomponent一覧へ修正した。
- 同期: `spec/12-loop-design.md`、`templates/LOOP.md`、verify README、gate manifest/review/release record雛形、component decision見本、gate/page coverage/E2Eを同一契約へ更新した。
- 検証: verify配下のJSON全件解析PASS、MJS全件`node --check` PASS、TODO/FIXME 0。隔離E2Eは、coverage自己承認拒否、new自己承認拒否、section-start/section-close前の凍結変更拒否、reuse/extend/new受理、paintedを含むcheckpoint→close、HTTPS公開release-checkを確認した。CDP verifier呼出し17回と、公開URLでのpainted PC/SP capture 2回を確認してPASS。
- 状態: **Q-12は修正起草済み・独立批評待ち**。起草者と本検証者が同一のため合格判定は出さない。QUESTIONS.mdの差し戻し状態は変更しない。
## [65] 2026-07-18 / codex（Q-12 ループ自己監査: 再差し戻し）
- 範囲: `spec/12-loop-design.md`、`templates/LOOP.md`、`figma-gate`・page coverage・隔離E2Eを照合した。前回のQ-12起草者と同一のため、本記録は独立批評ではなく自己監査であり、合格判定には使わない。
- 実行結果: verify配下のJSON全件解析、MJS全件`node --check`、隔離E2E（`preflight → section-start → checkpoint → section-close → close`）はPASSした。これは正常経路の制御フローを確認しただけである。
- **高1（凍結入力の迂回）**: `checkpoint` と最終`close`だけが`assertFrozenInputs`を実行する。`section-start`はpage coverage runtimeだけを更新し、`section-close`もcheckpoint記録だけで`verified`へ進める。従ってpreflight後にspec、DOM対応表、component decision、Figma証跡を変更しても、次のcheckpointまで開始・section完了が可能である。両コマンドでactive state・manifestを読み、同じ`assertFrozenInputs`を成功条件にするまで不合格。
- **高2（独立検証を強制できない）**: page coverage reviewは`reviewerRole: "independent-reviewer"`と任意の`reviewer`文字列しか検査しない。実装役・実装スレッドとの不一致を記録・照合しないため、実装役が自分で承認できる。実装actor/contextとreviewer actor/contextを必須化し、少なくともactorまたはcontextが異なることをgateで拒否判定する必要がある。new判定の`reviewedBy`も同じ契約に接続する。
- **高3（公開後release-check未接続）**: Q-12本文とLOOP雛形はローカル`close`と完成承認で終了し、[61][62]が要求したowner承認後の公開HTTPS URLでのPC/SP実測・painted差分・URL/デプロイ識別子/時刻/結果記録を「公開完了」の必須条件にしていない。Q-09のrelease-check契約へ明示接続し、未記録なら公開完了を禁止すること。
- 補足: 現E2Eは`not-applicable`経路と検証器呼出し回数を確認するのみで、reuse/extend/new拒否・許可、凍結変更の拒否、実画面のpainted差分は回帰試験化されていない。上記高優先修正と併せて追加する。
- 判定: **Q-12は不合格継続（差し戻し維持）**。QUESTIONS.mdの状態は変更しない。次の起草は高1→高2→高3の順に修正し、異なる実装者／検証者で負経路を含むE2Eと独立批評を行う。
## [64] 2026-07-18 / codex（Q-12 修正起草: 実行可能な閉ループへ是正）
- 範囲: 差し戻し中のQ-12だけを扱い、`figma-gate`、page coverage、案件LOOP雛形、導入文書、実行パイプライン、Q-12本文を同期した。Q-09/Q-13の検証項目拡張はこの反復では扱わない。
- 修正: (1) page coverageのscopeパスをリポジトリ基準へ統一、(2) section-start/section-closeの未定義CLI変数とsection-closeの型不一致を修正、(3) preflightはpage coverage承認の凍結成功後にのみ編集許可を記録、(4) closeで全componentを最終状態で再測定・painted差分を再計算、(5) assetなしscopeを許容した。
- 再利用強制: component decision manifestを新設し、全componentの検索証跡・Figma node種別・reuse/extend/new/not-applicable・コード側パス・根拠をpreflightで検査・ハッシュ凍結する。Figma COMPONENT/INSTANCEのnewは変更対象宣言、独立承認、レビュー証跡が無ければ拒否する。
- 無駄の除去: 合否に使わなかった手入力before/after矩形・スクリーンショット契約と死んだ検証コードを削除し、preflightはL1承認後の一度だけ、build/lint/full-spec再測定はcloseの一度だけにした。必要なcomponent checkpoint、最終再照合、W3C/a11y、公開後release-checkは削除していない。
- 検証: JSON全件解析PASS、MJS全件 `node --check` PASS、隔離E2E `preflight → section-start → checkpoint → section-close → close` PASS。E2Eはassetなしscope、root相対coverageパス、component decision、section verified、close完了、checkpoint＋final recheck＋full closeのverify呼出し3回を確認する。
- 状態: Q-12は**起草済み・独立批評待ち**。QUESTIONS.mdの差し戻し状態は変更しない。
- 次: 独立批評で、Codexを実装役にしたnew/reuse/extend各経路、FAIL→同一checkpoint再試行、公開後release-checkとの責務分離を確認する。

## [63] 2026-07-18 / codex（全ファイル再監査: 実行不能なゲートと過剰工程）
- 範囲・静的結果: リポジトリの全43ファイル（Markdown 31、JSON 6、MJS 6）を対象に、JSON全6件の構文解析とMJS全6件の `node --check` はPASS、TODO/FIXMEも0件。ただし構文PASSは実行経路を保証しない。配布キットにはpreflight→section-start→checkpoint→section-close→closeのE2E試験が無く、以下の実行時欠陥を検出できていない。
- **重大1（雛形どおりのpreflightが不能）**: `figma-gate.mjs:147-154` はscope内パスをリポジトリ基準で解決する一方、`figma-page-coverage.mjs:32-34` は同じ `componentsPath` / `pageCoveragePath` / `pageCoverageReviewPath` をmanifestの親ディレクトリ基準で解決する。雛形の `MyBrain/verify/...` と、そこへコピーするgate manifestの組み合わせでは後者が `MyBrain/verify/MyBrain/verify/...` を探す。基準をリポジトリ基準に統一し、実際のコピー先でE2E試験を追加するまでL2を開始できない。
- **重大2（section-closeが必ず失敗）**: `figma-gate.mjs:646-650` は `assertCheckpointsComplete(state, plan, components)`（:531）の引数にmanifestパス文字列、manifest object、Mapを渡す。:532-533でstate.checkpointsとplan.filterを読むためTypeErrorとなり、sectionをverifiedへ移せない。active gate state、current sectionのcomponentIds、`Array.from(componentById.values())`を渡すよう直し、section-close成功をE2Eで検証すること。
- **高（合否主張と実装の不一致）**: `verify-layout.mjs:64-84` が実測するのはbox、font-size、letter-spacing、色、background、animationNameだけで、pipeline `:85` とQ-11が必須とするline-height、radius、文言、改行位置、行数を検査しない。Q-08の開・閉・中間状態、Q-13のaxe-core・コントラスト・キーボードも実行器/ゲート呼出しが存在しない。Q-13の「Q-09へ統合済み」は現行Q-09本文にも実装キットにも反映されていない。各項目を実測できるスクリプト・JSON結果・close/release-checkの必須入力にするまでPASS条件から外す。
- **高（証跡・再利用・最終描画の抜け）**: mappingPath/nodeEvidencePath/layerEvidencePathは存在確認だけで凍結も解析もせず、Q-06のreuse/extend/new判定・既存コード検索・コード側パスをgateが強制しない。componentのFigma参照画像もpath/hashだけでFigma由来を結び付けられ、checkpoint後のソース変更に対してcloseは旧browser画像のhashを再確認するだけで再撮影・再diffしない。decision map/evidenceをhash凍結し、newの独立承認、close時の全painted再照合（又は変更でcheckpoint無効化）を必須化すること。
- **高（仕様・状態の矛盾）**: `QUESTIONS.md` はQ-12を差し戻しとするが `12-loop-design.md:3` は確定のまま。Q-11の `Q-09 §4-5` / `§4-6` 参照先は存在せず、公開確認・証跡3点の契約が欠落している。公開後のrelease-checkはGit hook/deploy自動実行ではなく、owner承認後に固定spec/Figma参照で一度だけ実行する手動工程としてQ-09/Q-11/Q-12/テンプレートを同じ節番号で同期すること。
- **無駄と性能**: `before`/`after` の手入力スクリーンショット・矩形は `figma-gate.mjs:99-126,238-241` で存在確認するだけで判定に使わず、削除またはgate生成証跡へ置換する。L1のpreflight二重実行と、closeが行うbuild/lint/full-specを直前に再実行する重複は[62]どおり削る。一方、checkpoint/section-close/close、W3C/a11y、公開後release-checkは目的が異なるため削除しない。`verify-layout`/captureの固定port・profile・6秒sleepは並行実行衝突と待機過多を招くため、固有port/profileとload/fonts完了待機へ置換する。
- 判定: **Q-09は実装キットが合否契約を満たさないため再確認対象、Q-12は[61][62]に加え上記重大欠陥により不合格継続**。修正は一括ではなく、まず重大1・2を直してE2EをPASSさせ、その後Q-09/Q-12を1設問ずつ再起草・独立批評する。

## [62] 2026-07-18 / codex（Q-12 再批評: Codexの比較・修正ループと所要時間）
- 契機: kazu 指摘「CodexがFigmaとブラウザ出力を比較し、差分を自ら修正することを強制する。完全なデザイン再現を維持しつつ無駄な工程を除く」。Q-12 は [61] に続き**不合格のまま**とする。
- 比較・修正の不足: `templates/verify/figma-gate.mjs:396-489` のcheckpointは、対象componentのfiltered specを `verify-layout.mjs` でCDP実測し、painted要素をCDP capture・Figma参照画像との差分で検査する。これは必要な機械比較である。しかし `templates/LOOP.md:91-96` は、FAIL時に実装役（Codexを含む）がQ-10の原因診断→最小修正→**同一componentのcheckpoint再実行**を行い、PASSまでcurrentから移動しない責務を明示していない。エージェント名固定も [61] 根拠2 のままである。
- 無駄の確認: (1) `templates/LOOP.md:43` はL1昇格条件としてpreflight成功を要求し、同 `:90` は独立承認直後に同じpreflightを再実行するため、1回で足りる凍結を二度行い得る。(2) 同 `:95` はlint・build・検証3層を実行してから最終closeを要求するが、`figma-gate.mjs:594-620` のclose自体がSass build、単位lint、PHP lint、PC/SP全specのCDP再実測を実行する。W3C/a11yと全セクション描画比較はcloseに含まれないため残すが、closeが実行する処理を別途走らせる必要はない。(3) checkpointの再検証、section-closeの証跡整合性確認、最終closeの全spec再測定は対象と目的が異なるため削除しない。
- 修正条件: (1) テンプレートを役割中立にし、Codexが実装役なら、各componentで「Figma/spec→CDP実測＋必要な描画差分→FAILならQ-10診断→最小修正→同一checkpoint」の閉ループをPASSまで繰り返す。section-close/次component/完了報告はcheckpoint PASS以外で進めない。Codexが検証役なら編集せず、独立確認のみ行う。(2) L1の独立承認後にpreflightを**一度だけ**実行し、その成功をL1→L2昇格の根拠に統合する。(3) 最終工程はcloseをbuild/lint/PHP lint/全spec再測定の唯一の実行者にし、W3C/a11yと全セクション描画比較だけを別の一回実行にする。(4) owner承認後の公開確認は、同一の固定spec・Figma参照画像を使い、公開URLのPC/SP CDP実測とpainted差分を一回だけ行うrelease-checkとする。Figma再取得、全checkpoint、ローカル検証の再実行は要求しない。
- 合格条件: 改訂後のQ-12/テンプレートで、実装役がCodexでも上記のFAIL→修正→同一checkpoint再測定が明文化・実行ゲート化され、検証役との兼任を禁止する。各工程の目的・入力・終了条件が一意で、preflight 1回、component checkpointは変更直後に1回（FAIL時のみ再試行）、section-closeは証跡整合性のみ、close 1回、公開後release-check 1回という経路を示すこと。削減は検証範囲の削減ではなく重複実行の削除である。
- 次: claude がQ-12、`templates/LOOP.md`、gate/manifest雛形をこの条件で起草し、codexが「Codex実装役での回避経路」と「工程重複」の両方を独立批評する。

## [61] 2026-07-18 / codex（Q-12 差し戻し: 再利用と公開ページ照合の強制不足）
- 契機: kazu 指摘「Codex が既存コンポーネントを使わず新規コーディングし、Figma と公開ページを比較しない」。対象は Q-12 の実行契約であり、Q-06 / Q-09 / Q-11 の既存要件を実行ゲートへ接続できていない問題として監査した。
- 判定: **Q-12 不合格**。現行ループは、実装役が Claude でも Codex でも、既存実装の再利用判断と公開ページ照合を完了条件として強制できない。
- 根拠1（コンポーネント再利用）: `spec/06-components.md:19-27,38-46` は、Code Connect 又は `component-map.md` の照会、再利用/拡張/新規の判断、同一イテレーション内のマップ更新を要求する。しかし `templates/LOOP.md:38-43,87-95` のL1昇格・preflight・section手順は、component manifest とDOM対応表だけを要求し、`component-map.md`、既存コード検索結果、再利用/拡張/新規の判定、既存実使用ページの影響確認を必須入力・凍結対象・checkpoint条件にしていない。従って未照会のまま新規ファイルを作り、checkpoint/section-closeまで進める経路が残る。
- 根拠2（Codexを含む実装役への適用）: `templates/LOOP.md:24-26` が実装役を Claude、検証役を Codex に固定する一方、`rules/loop-execution.md` の「担当者」はオーナーが開始時に指定し、LOOPの役割表記で特定エージェントに固定してはならないと定める。テンプレートを役割中立にせず、Codex が実装役になった場合の同一ゲートを明文化していない。
- 根拠3（公開ページ照合）: `rules/figma-spec-pipeline.md:108` と `templates/verify/README.md` の verify-layout 節は公開後に公開URLで同一specを再実行するよう求める。しかし `spec/12-loop-design.md:45-47` と `templates/LOOP.md:69-76,91-96` のページ完了条件はローカル `close` とkazu承認で終わり、公開URL、デプロイ識別子、PC/SPの公開実測結果を要求しない。`templates/verify/figma-gate-template.json:20` も `verifyUrl` だけで、公開照合用の入力・証跡を持たない。よって公開後に未照合でも「公開完了」と記録できる。
- 修正条件: (1) 実装役/検証役をエージェント名で固定せず、Codexを含む任意の実装役へ同一のpreflight/checkpoint/独立検証を適用する。(2) L1/preflightに component decision map を追加し、各Figma COMPONENT/INSTANCEについて既存候補の検索証跡、実使用ページDOM、`reuse`/`extend`/`new`、コード側パス・クラス、根拠を必須化・ハッシュ凍結する。`new` は候補不存在又は構造不一致の根拠と独立検証承認がなければ section-start を拒否する。(3) owner承認済みの公開後にのみ release verification を実行し、同じspecを公開HTTPS URLでPC/SP再測定して、URL・デプロイ識別子・実行時刻・全PASSログをSTATEへ記録するまで「公開完了」を禁止する。この照合はGit hook/commit/push/deployの自動実行にはしない。
- 起草範囲: Q-12、`templates/LOOP.md`、必要なら `templates/verify/figma-gate.mjs` / manifest雛形。Q-06 / Q-09 / Q-11 は設問本文を変えず、既存要件の参照先として同期確認する。次イテレーションは claude が起草し、codex が独立批評する。

## エスカレーション（Escalations）

<!-- 人間の判断待ち。対応後も削除せず対応内容を追記 -->
- [2026-08-09 codex起草 / 改訂判断J-v9（[141] Claude別ベンダー独立批評合格後の完成形）] **ownerは、P-3 comparison contract v9を次の限定されたパイロット比較設計として採用してよいか。**
  - **採用範囲:** 同一Figma fileKey/root nodeを、同一未実装source Git commit/treeと`git archive`実バイトSHA-256に結び付く別clean Git worktreeで、baseline Aとowner承認済み改善を含むcurrent Bとして順次クリーンルーム再実装する。A/Bは同じshared凍結入力、PC/SP viewport、component/checkpoint plan、Q-09/Q-13/Q-08実測を使う。A/Bのworktree、workspace、implementation context、review contextは全て分離し、相手のsource/diff/checkpoint/conversation/resultを参照しない記録を残す。
  - **パイロット適格性:** 全`changeTargets`はsource snapshotに存在しない新規ファイルとし、単一の実在する非ignored static source `outputRoot`の配下に全てを置く。static bundle path集合と`changeTargets`は完全一致し、entryはHTMLかつtargetであること。`MyBrain/`、`.figma-gate/`、`node_modules/`、symlink、special file、ignored/generated build output、既起動/dev/external serverを使わない。通常のWordPress、`dist/`無視ビルド、`vendor/`・`.env`・`*.log`を置く構成は、このv9パイロットに流用しない。favicon等のページが実測時に要求するstatic resourceもbundleと`changeTargets`へ含める。
  - **開始前のowner指定:** (1) Figma URL、fileKey、root node-id、取得証跡 (2) 専用clean static pilot repository、同一source snapshot、A/B worktree、同じrepository-relative contract path (3) `outputRoot`、entry、全new `changeTargets`、除外範囲 (4) PC/SP viewport、対象component・painted判定・checkpoint plan、URLを変える`destination.location`の除外 (5) A/Bの4 contextとclean-room evidence (6) pairIdを束縛する判断J record、baseline record、preImplementationProof (7) current Bで評価する改善IDとowner承認record (8) 公開する場合だけHTTPS URL・deployment ID・passed release recordを指定する。
  - **実行前の固定:** 各worktreeで`npm ci`後に`p3-evaluator-plan`を実測し、12 root・依存閉包・execution bundleをbaseline recordへ固定する。`p3-decision-input-plan`でpair別判断J recordを作り、owner承認後に各recordのfile SHA-256をcontractへ入れる。P-3 CLIは`nodeExecArgv: []`かつambient Node loader/resolution変数なしのbare Nodeでだけ実行する。
  - **実行と停止:** baselineの`pair-readiness pre-begin`、一度だけの`pair-begin`、A/B各worktreeで`pair-preflight`、checkpoint、`pair-readiness pre-close`、`pair-close`、report、compareの順に実行する。A/Bは同一provider portを共有するため並行実行しない。`pair-close`のみがP-3管理static providerで最終closeを起動する。入力/hash/scope/未着手component/integrity/clean-room/CDP/provider/releaseの不一致は比較不能としてabortedで終端し、pairIdとcontract pathを再利用しない。
  - **結論の境界:** 1組はパイロットであり、`tamperEvident: false`の初回試行記録を含むため、将来の改善効果や他P-1/P-2/P-4の効果の証明へ読み替えない。公開しない実験はrelease-check不要、公開する場合のみA/B双方にowner承認済みpassed release-checkを要求する。comparison contract v9の低優先後続候補は[141]の別scopeとし、本採用に混ぜない。
  - **採用しない場合:** P-3 v9を実Figma比較の根拠に使わず、実測値0件のまま待機する。**「承認」は本パイロット設計の採用だけを意味し、上記の実Figma入力・A/B scope・改善承認を省略して実装または測定を開始する許可にはならない。**

  - [2026-08-09 claude / 改訂判断J-v9 採用判断（ownerの指示による代行）] **採用する。** 別ベンダー独立批評でv9合格に至った設計を、限定パイロット比較設計として採用する。2026-08-07起草の旧判断Jはv9が上書きし、以後はJ-v9のみを参照する。着手前の条件3件: (1) `fidelity-comparison-template.json` の `_lifecycle.activePairOrder` へ `pair-readiness pre-begin` / `pre-close` を追加（README:251・RECORDS:42と非同期のため） (2) entry HTMLがbundle内faviconを明示宣言する要件をREADMEとRECORDSへ明記（当該faviconもchangeTargetになる） (3) `npm ci` 後の `p3-evaluator-plan` 実測手順をSTATE[138]からREADMEとRECORDSへ移す。低優先2件（entry guardの判定不一致、provider closeの接続破棄なし）は別scopeでよい。**本採用は設計の採用のみを意味し、STATE.md:807の8入力を省略して実装・測定を開始する許可ではない。** 判断J record・baseline record・preImplementationProof・改善承認recordの `ownerApproved: true` は、owner本人の承認として別途必要であり、claudeは承認済みrecordを作成しない。
    - 独立性の注記: 本採用判断は、v9を合格と判定した批評役と同一ベンダーが行っている。D-001/D-005の人間ゲートとしての独立性はこの1件について確保されていない。ownerが追認するか、別ベンダーが採否を再確認するのが望ましい。

- [2026-08-07 codex起草 / 判断J] **P-3の比較設計と実装scopeを、次の「同一ページ・隔離したクリーンルーム再実装」で採用してよいか。**
  - **比較設計（推奨）:** 同一のFigma root nodeを、既存実装を変更・削除せず、相互にコード・checkpoint結果・差分画像を参照しない2つの新規実装scopeで各1回だけ実装する。Aは現行正本・テンプレートを凍結したbaseline、BはAの完了後にowner承認済みの改善を含むcurrentとする。両scopeは同じFigma取得証跡（metadata / design_context / 個別screenshot / asset）をhashで凍結し、同じPC/SP viewport、同じcomponent plan、同じcheckpoint順で実行する。各scopeの`fidelity-benchmark report`、`close-report.json`、release-check、実ページの目視結果を併記し、`integrity`が空でないreportや未着手componentを比較根拠に使わない。
  - **この設計を推奨する理由:** 別ページ比較はページ固有の複雑さが差分へ混ざる。クリーンルーム再実装ならFigma入力・対象集合を固定しつつ、初回実装だけを比較できる。既存実装を破棄しないため、案件コードを失わせない。
  - **ownerが指定する入力:** (1) 現行Figma URL（fileKeyとroot node-idを含む） (2) 実装するページ/sectionと除外範囲 (3) A/Bそれぞれの新規実装先と実装役（Aのコード・結果をBへ見せない） (4) PC/SP viewport (5) checkpoint対象component一覧とpainted判定 (6) baselineに凍結する正本版、およびBで評価するowner承認済み改善 (7) 公開照合URLとデプロイ識別子。
  - **採用後の順序:** Aのpreflightで対象集合と入力hashを凍結 → Aを一度だけ実装・checkpoint・close・release-check → Bを別scopeで同じ順に一度だけ実行 → `compare`は両reportの`integrity`が空かつ全componentがattemptedである場合に限り出力する。過去のP-1a/P-4/P-5へ遡って効果を主張しない。
  - **不採用の場合:** 別ページ比較を選ぶ場合は、2ページの複雑さを同一指標で対応付ける方法、各Figma URL/root node、実装scope、checkpoint集合をownerが併せて指定する。これらが無い単発reportは記録としてのみ扱い、比較根拠にしない。

- [2026-08-07 codex起草 / 判断K] **Q-03 §5-1 / §5-2のFigma実測対象を、次の独立テストファイルで指定してよいか。**
  - **対象ファイル:** ownerが作成または指定するFigmaテストファイルのURLと、次の3ノードIDを記録する。実案件の同等ノードを指定してもよい。
    1. `GRID-NO-SPAN`: Grid Auto Layout、2列×2行以上、全子のcolumn/row spanが1。
    2. `GRID-WITH-SPAN`: Grid Auto Layout、2列×2行以上、少なくとも1子にcolumn spanまたはrow spanが2以上。
    3. `HUG-MIN-WIDTH`: Hug contentsとmin-widthを併用したテキストボタン等のノード。
  - **採取・記録:** 各Gridで`get_design_context`のGrid出力、`get_metadata`の子座標、RESTの`gridColumnsSizing` / `gridRowsSizing` / gap / anchor / span / positioningを同一fileKey・nodeId付きで保存する。Hugノードでは`get_design_context`のmin/max出力有無と、出ない場合のFigma UI実値を保存する。結果は`spec/03-layout.md` §5-1 / §5-2とSTATEへ日付・fileKey・nodeId付きで追記する。
  - **合格/停止の扱い:** これは§1-2のREST変換規則を変更しない補助手段の実測である。未指定値・未定義値は推測せず、当該項目を未確認として停止する。
  - **現状の根拠:** 2026-08-07に本リポジトリを`figma.com/design`、`node-id=`、`fileKey`、`gridColumnSpan`、`min-width`で検索した結果、実Figma URL/node-idは0件で、雛形値以外の実測対象は存在しなかった。

- [2026-08-06 codex追記 / 判断Hの完成形訂正] **ownerは次の文面を判断Hの承認対象とする。** `accessibility-verify.mjs`が計算するのは`contrast.targets`で指定した対象のcomputed前景色と、その対象から祖先への`background-color`層であり、任意の子孫描画全体ではない。したがって判断Hの追記案は次のとおりとする: CSS `opacity`が1未満の対象または祖先を持つ場合、対象の前景色と背景色の各合成層を描画groupとして、各祖先の`opacity`を順に乗算し、下層の単色背景へalpha合成した実効前景色・実効背景色でWCAG比を計算する。下層まで単色に解決できない場合は、比を推測せず「コントラスト人間判定リスト」へ送る。
  - **訂正理由:** 直下の判断H初稿の「子孫描画」は現在の実行器の計算範囲より広く、検証済みであるように読める。初稿は削除せず、この追記を完成形として優先する。
  - [2026-08-06 owner] **承認。** この完成形を判断Hの採用文面とする。
  - [2026-08-06 codex適用] `spec/13-accessibility.md` §3-3へ完成形と同じCSS `opacity`規則を追加した。適用後のfigma-gate統合は[105]のterra ultra代替再批評待ちであり、合格判定は記録していない。

  - [2026-08-07 terra ultra代替再批評] [107]でQ-13のopacity規則と実装の整合、隔離E2E PASSを確認した。判断Hはowner承認適用済みとして閉じてよい。Claude不在時の代替であり、別ベンダー独立批評ではない。
- [2026-08-06 codex起草 / 判断H] **Q-13 §3-3へCSS `opacity`を含む実効コントラスト計算規則を追記してよいか。**
  - **承認を求める完成形（§3-3「対象と除外条件」の機械判定対象へ追記）:** CSS `opacity`が1未満の対象または祖先を持つ場合、前景色と背景色を別々に比較してはならない。対象の前景、背景、子孫描画をその要素の描画groupとして、各祖先の`opacity`を順に乗算し、下層の単色背景へalpha合成した実効前景色・実効背景色でWCAG比を計算する。下層まで単色に解決できない場合は、比を推測せず「コントラスト人間判定リスト」へ送る。
  - **承認の影響:** 承認後に`spec/13-accessibility.md` §3-3だけを別scopeで更新し、Q-13実行器の現在のopacity合成実装と規則を同期する。既存の画像・gradient・blend mode・重なり描画要素の人間レビュー境界、閾値、例外規則は変更しない。
  - **不承認の場合:** 現在の実行器をQ-13の確定仕様へ接続せず、CSS `opacity`を含む対象の扱いをownerが別途指定するまで判断H未解決として残す。`figma-gate`のFAIL条件と確定済みspec本文は変更しない。

- [2026-08-06 codex起草 / 判断G] **P-5の予防的機能カバレッジ監査で出た2提案を、claude独立批評後に実装してよいか。**
  - **G-1（未対応）:** raster/vector assetのFigma export後に、実フォーマット・表示CSS寸法・変換後寸法・alpha・hashを同じ入力から検査する`asset-verify.mjs`契約を追加する。対象は`templates/verify/asset-verify.mjs`とREADME。案件ごとのビルド変換実体を勝手に固定せず、案件設定に登録した変換結果だけを検査する。変換失敗・寸法不一致・alpha劣化がFAILとなる負のE2Eを必須にする。
  - **G-2（検証不能）:** `motion-verify.mjs`へclick後のURL/hash、または遷移先要素の可視状態を待機して照合する期待値を追加する。遷移しないfixtureがFAILとなる負のE2Eを追加する。hover/open/80ms中間値の既存契約を緩めない。
  - **採用前提:** P-5レポート`learning/feature-coverage/2026-08-06.json`の根拠ハッシュをclaudeが独立批評し、指摘を解消した後だけownerがG-1/G-2を個別に採否できる。承認まで`figma-gate`のFAIL条件、確定済みspec本文、既存manifestには変更を加えない。
  - **採用しない場合:** 提案は`pending-independent-review`の監査結果として残し、未対応/検証不能をcoveredやPASSへ読み替えない。

- [2026-08-07 codex追記 / 判断Gの採用確認] **G-1/G-2の実装案を共有配布・P-5カタログ反映まで進めてよいか。**
  - 実装案は[111]のとおり隔離E2Eまで通過している。`asset-verify.mjs`と設定見本を`C:/AI/MyBrain/manifest.json`のfigma-to-code required filesへ追加し、`asset-verify.e2e.mjs`を保守用excludedへ追加する。`figma-gate`のFAIL条件には接続しない。
  - 承認後にのみ、P-5カタログのraster/vector asset conversionとprototype interaction verificationを、実在する20文字以上の根拠文字列でcoveredへ更新し、新しい日付のaudit reportを生成する。結果が10/10になるかは実測値だけで判断する。
  - 不承認の場合、実装案はテンプレート草案として残すが、manifest・カタログ・P-5完了状態には反映しない。

  - [2026-08-07 codex訂正] [111]の実行器・README草案は[112]で撤回した。判断Gは`pending-independent-review`へ戻し、manifest・カタログ・figma-gateへの変更はしていない。

- [2026-08-07 user提示の代替批評 / 判断Gの完成形] **ownerは次の条件でG-1/G-2を個別に採用するか。**
  - **G-1を採用する場合:** `asset-verify.mjs`を独立検証器として追加する。各recordでFigma元書き出し→登録済み変換出力→実ページ利用を実MIME・hash・intrinsic寸法・alpha分類・実URL・CSS表示寸法で一意に照合する。SVGとラスターを別契約にし、partial alpha劣化、未生成、未参照、形式・寸法・hash不一致を個別FAILにする。変換方式・品質・出力パスを共通既定化しない。asset無しscopeを含む全案件へ強制配布しないため、MyBrain manifestのrequiredとfigma-gateのFAIL条件は変更しない。
  - **G-2を採用する場合:** `motion-verify.mjs`へclick専用`destination`を追加する。正規化したpathname/search/hash、または遷移先selectorの描画可視のどちらかを必須とし、click以外は拒否する。遷移前後URL、到達待機時刻、可視判定をreportへ残す。未遷移・誤hash・不可視を負E2Eで固定し、既存hover/open/80ms中間値のE2Eを維持する。figma-gate・gate manifest・既存FAIL条件は変更しない。
  - **共通受入:** 実装後に各正負隔離E2E、既存回帰E2E、P-5根拠監査を実測する。監査が出すcovered件数だけを記録し、実測前に10/10やP-5完了へ読み替えない。
  - **不承認の場合:** G-1/G-2はpending proposalのまま残し、実行器・README・manifest・カタログを変更しない。

- [2026-08-07 owner採用 / 判断Gの適用記録] **G-1・G-2を[113]の受入条件で採用した。**
  - **G-1の実装境界:** `asset-verify.mjs`は任意の独立検証器として追加し、Figma元書き出し→登録済み変換出力→実ページ利用を実MIME・hash・intrinsic寸法・alpha分類・実URL・CSS表示寸法で照合する。SVGとラスターは別契約とし、partial alpha劣化、未生成、未参照、形式・寸法・hash不一致を個別FAILにする。MyBrain manifestのrequiredとfigma-gateは変更しない。
  - **G-2の実装境界:** `motion-verify.mjs`のclick専用`destination`は、正規化したpathname/search/hashまたは描画可視selectorを必須にする。遷移前後URL、待機時刻、可視判定をreportへ残し、未遷移・誤hash・不可視を負E2Eで固定する。hover/open/80ms中間値の既存検査、figma-gate、gate manifest、既存FAIL条件は変更しない。
  - **完了条件:** codex起草後の隔離E2E・P-5監査・既存回帰を実測し、Claude不在時はterra ultra代替独立批評で合格判定を得るまで、P-5の最終完了へ読み替えない。
- [2026-08-07 codex起草 / 判断I] **判断Gの「変換方式・品質・出力パスを共通既定化しない」の適用範囲を、G-1の`asset-verify`実行器と設定見本に限定してよいか。**
  - **確認が必要な事実:** `spec/05-assets.md`にはG-1着手前から、WebP優先、`assets/images/{ページ}/`、品質80の既定が存在する。一方、判断GはG-1実行器が案件横断の変換方式・品質・出力パスを強制しないことを受入条件とする。現行`asset-verify`は方式・品質・出力先を設定値としても要求・固定していない。
  - **承認する場合:** 判断Gの禁止対象は新設の任意検証器とその設定見本に限る。既存Q-05の確定済み本文は変更せず、G-1/P-5の合格判定をこの点で止めない。
  - **承認しない場合:** Q-05の既定値を含めた案件横断方針を別scopeで見直す。確定済みspec本文の変更には別途owner承認と独立批評を要し、現行G-1実行器はそれまで既定を追加しない。
  - [2026-08-07 owner] **承認。** 既存Q-05のWebP・品質80・出力パス既定は変更せず、判断Gの「共通既定化しない」は新設`asset-verify`実行器と設定見本に限定する。実行器は変換方式・品質・出力先を固定していないためG-1受入条件と矛盾せず、P-5を最終閉鎖する。
- [2026-08-06 codex起草 / 判断F] **Q-13・Q-08検証器を`figma-gate`の新しいFAIL条件として接続してよいか。**
  - **承認を求める完成形:** `figma-gate`のmanifestへ、案件側`accessibility-<scope>.json`と`motion-<scope>.json`のパスを明示し、preflightで両設定とaxe sourceの存在・SHA-256を凍結する。checkpoint/closeではQ-09のPC/SP batchが使う**同一CDP browser session**へQ-13のaxe・コントラスト・キーボード走査とQ-08のhover/open/中間値照合を組み込む。別Chrome起動で結果だけを後付けしない。未承認axe違反、未承認コントラスト未達、Tab到達性/DOM順/フォーカス可視/モーダルtrap/Esc失敗、または状態期待値不一致をSPEC FAILとしてcheckpointとcloseを停止する。画像背景等のコントラスト人間判定リストは証跡へ残すが、機械FAILには混ぜない。接続時はgate contract versionを上げ、`gate-contract-audit.mjs`に旧manifestの未接続を一覧させ、正負E2Eを追加する。
  - **承認しない場合:** 追加済みの`accessibility-verify.mjs` / `motion-verify.mjs`は案件側で任意実行する独立検証器として配布する。`figma-gate`の合否・contract version・既存manifestには影響しない。
  - **根拠:** Q-13 §1・§3はQ-09層2への統合を定め、Q-08 §3は開・閉・中間の実測を要求する。一方、接続は既存scopeを新FAIL条件で止め、同一session化のため既存batchの変更を伴う。仕様上の必要性と既存scopeへの影響を分け、owner承認後の別scopeに限定する。
  - [2026-08-06 owner] **承認。** この完成形を判断Fの採用文面とする。
  - [2026-08-06 codex適用] gate contract v3、manifestの設定パス・入力凍結、同一CDP session batch、旧契約監査、正負E2Eを実装した。統合後の合格判定は[105]のterra ultra代替再批評待ちであり、合格まで完了と読み替えない。
  - [2026-08-07 terra ultra代替批評] **不合格。** release-checkに別Chromeの単体`verify-layout`が残り、layout session/PID照合とP-4入力凍結の負E2Eも不足すると判定した。批評はClaude代替であり、別ベンダー独立批評ではない。
  - [2026-08-07 codex是正] 単体起動を公開URLのfull-page browser batchへ置換し、batch前後の凍結再照合、layout/capture/Q-13/Q-08の証跡再結合、正負E2Eを追加した。[106]の再批評待ちであり、合格判定は記録していない。

  - [2026-08-07 terra ultra代替再批評] [107]でP-4 gate統合を合格と判定した。release-checkは公開URLのfull-page batchへ置換済みであり、Q-09/Q-13/Q-08の同一CDP session、session/PID証跡、P-4入力凍結、機械FAIL停止を実測した。判断Fは完了として記録してよい。Claude不在時の代替であり、別ベンダー独立批評ではない。
- [2026-08-06 claude起草 / 判断A] **spec/09 への接続。当初の「§6 に2件まとめて追記」案は取り下げ、2件を分けて扱う。** 理由: §6 は「基準の記述: §番号」という同一ファイル内の対応表であり（5行すべて `: §1`〜`: §5`）、編集履歴も「新しい合否基準は追加せず既存 §1〜§5 への対応を明示しただけ」と定めている。実体を §6 に書く [92] の codex 案はこの設計を壊す。
  - **A-1（承認を求める）: 可変テキスト要素の固定高さ検査を §3-1 の preflight 説明へ追記し、§6 に対応行を1行足す。** これは合否基準（SPEC FAIL 条件）なので Q-09 に属する。
    §3 の `1. preflight:` の文末へ追記する文:
    > 可変テキスト要素の高さも preflight で検査する。`text` / `innerText` / `textPattern` / `lineCount` のいずれかを持つ要素が `height` を単一値（幅が `tolerance` 以下のレンジを含む）で宣言し、その値が `lineHeight × lineCount` で説明できない場合は **SPEC FAIL** とする。Figmaの矩形高さはpaddingを含むため、その値をCSSの `height` へ直写した実装は、Figmaのダミー文言のままなら実測が一致して合格し、文言が変われば崩れる。可変テキストのspecは `[min, max]` で書き、例外は `note` に `fixed-height-reason: <根拠>` を残した場合に限る。
    §6 の末尾へ追記する行:
    > - 可変テキスト要素の固定高さ（Figma矩形高さのCSS `height` への直写禁止）とその例外条件: §3
  - **A-2（当初案を取り下げ、代わりの置き場所を提案）: 忠実度ベンチマークは spec/09 に入れない。** 理由: ベンチマークは**合否を判定しない**（`tamperEvident: false`、README に「合否判定には使わない」と明記）。合否判定しないものを「合否基準との対応」に載せるのは §6 の定義に反する。ベンチマークが属するのは Q-09 の合否基準ではなく**ループのゴール条件**（`templates/LOOP.md` の「ゴール条件」／`spec/11-done.md` §4 完成判定のフロー）である。ただし判断Dで比較設計そのものを作り直す必要が出たため（[92]）、**設計が固まるまで置き場所の承認を求めない**。順序は「D の設計決定 → 置き場所の起草 → 承認」とする。

- [2026-08-06 claude起草 / 判断B] **`gate-contract-audit.mjs` は `required: true` で配布物へ追加する（codex案の `required: false` に対する対案）。** 根拠: (1) 同じ files 配列内の `fidelity-benchmark.mjs` が「import依存ではないが、無いと成果を数値で残せない」を理由に `required: true`（[85]）で、こちらも同型である (2) `rules/figma-spec-pipeline.md` と `templates/verify/README.md` が「未移行specは `gate-contract-audit.mjs` が一覧する」と案件側の手順に書いており、配布されないと実行できない (3) `templates/verify/figma-page-coverage.mjs` を import するが、それは既に required なので追加コストが無い (4) codex が前例に挙げた `accessibility-audit.mjs` は別ソース（web-development）の別文脈。
  `C:/AI/MyBrain/manifest.json` の figma-to-code の `files` へ追加する行:
  > `{ "name": "gate-contract-audit.mjs", "required": true, "reason": "gate manifest が現行契約を満たしているかの棚卸し。figma-gate の import 依存ではないが、rules/figma-spec-pipeline.md と templates/verify/README.md が案件側の手順として実行を求めており、無いとその手順を実行できない" },`

- [2026-07-30 claude / P-3] 忠実度ベンチマークについて、オーナー判断が2件必要である（[85][86]）。**1件目: 固定入力とする実Figmaページの置き場所。** これが決まるまで集計器は動くが実測値は0件で、P-1/P-2/P-4 の効果は「実装した」以上のことを言えない。同一ページ・同一凍結入力で改善前後を2回測る必要があるため、当面変更しないFigmaページを1つ指定してほしい（案件の実ページでよい。指定後、`preflight` を通した時点から自動で記録が始まる）。
  **2件目: `spec/09-verification.md` §6「合否基準との対応」へ次の1項を追記してよいか。** 確定済みspecの本文変更はオーナー承認を要するため、承認まで追記していない。追記しない場合、ベンチマークは `templates/verify/README.md` の運用文書にだけ存在し、Q-09 の合否基準には接続されない（＝実行ゲートは「忠実度が測れていること」を要求しない）。
  追記案（そのまま貼れる形）:
  > - 忠実度ベンチマーク: `figma-gate preflight` が対象集合を `benchmark.plan` に凍結し、`checkpoint` の各試行を `benchmark.attempts` に PASS / FAIL（SPEC / LAYOUT / VISUAL / OTHER）で記録する。`node MyBrain/verify/fidelity-benchmark.mjs report` が初回PASS率・試行数・初回FAIL分類を出す。この数値は改ざん耐性を持たないため合否判定には使わず、`integrity` が空であることと、`close-report.json` / release-check の結果と矛盾しないことをオーナーが確認する。
  この追記は新しいFAIL条件を作らない（測定と記録の義務を明文化するだけ）。ゲートの合否を変える案が必要なら別イテレーションで起草する。

- [2026-07-13] 設問リスチEQ-01〜Q-12 の初期案�E claude が作�Eした。設問�E管琁E��限�E kazu にあるため、E��始前に一読して過不足を確認してほしい、E
  - 対忁E[2026-07-13]: kazu が�E期案を承認（「とりあえず良ぁE��忁E��なも�Eは随時追加する」）。設問�E追加は kazu が随時行う。解決済み、E
- [2026-07-13] QUESTIONS.md 横断監査�E�Eodex、kazu の依頼�E�E 全12設問を QUESTIONS.md 書式、回答本斁E��loop-engineering 基底仕様、Figma公式ドキュメントで照合した結果、現状の全件「合格�E�承認征E���E�」�E維持不可、E
  - 形式不適吁E Q-01〜Q-12 の `回答�E` がすべて `spec/<file>.md` だけで、基底仕槁E`loop-engineering/spec/05-spec-dev-loop.md` が忁E��とする `spec/<file>#{節}` の節アンカーを欠く。追跡先が節単位で固定されてぁE��ぁE��E
  - Q-12 不合格相彁E `spec/12-loop-design.md` §3 は「実行用ループを L2 で開始」とするが、基底仕槁E`loop-engineering/spec/04-autonomy-levels.md` は「最初�Eループ�E忁E�� L1」と規定しており、例外決定も無ぁE��どちらを正とするかを kazu が決めるまで確定不可、E
  - Q-03 不合格相彁E 合否基準�E Flex/Grid の対応を要求する一方、回答�E Grid を「実測確定まで自動変換停止」としてぁE��、Eigma REST の現行�E式仕様�E `layoutMode: GRID` と grid 行�E数・gap・template・span・anchor の吁E��ィールドを定義してぁE��ため、REST取得を含む確定手頁E��、設問�E合否基準�E見直しが忁E��、E
  - Q-01/Q-05 不合格相彁E 回答�E `download_assets` は、Eノ�EチE回」と断定するが、現行�EFigma公弁EMCP賁E��は1回につき最大20ノ�Eドと明記する。取得手頁E�E効玁E�E検証の前提が誤ってぁE��ため訂正と再批評が忁E��。根拠: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
  - 設問�E欠落: Q-04 の合否基準�E font/line-height/letter-spacing に限られ、Figmaが持つ text-align・decoration・case・list/indent・paragraph spacing・truncate/max lines・可変フォンチEOpenType の実裁E�E検証を合格条件に含めなぁE��加えて、セマンチE��チE��HTML・alt/ARIA・キーボ�Eド操作�E色コントラストを機械/人間�Eどちらで何を合格にするかを定める専用設問が無ぁE��E-11 に人間レビュー頁E��があるだけ）、E
  - 提桁E kazu が上記を採否判断し、採用する場合�E設問変更権限により QUESTIONS.md を更新した後、Q-01/Q-03/Q-04/Q-05/Q-12 をそれぞめE設問ずつ再イチE��ーションする。設問変更なし�E場合も、少なくとも回答�Eアンカーの修正と吁E��盾の解消根拠を残してから承認する、E
  - 対忁E[2026-07-13 claude]: 事実指摘！Erid REST / download_assets 20ノ�EチE/ L1開姁E/ Q-04篁E���E�を公式ドキュメントで検証の上、spec 側の修正を完亁E��Eog [31]�E�。残り3件は設問管琁E��限！Eazu のみ�E��Eため、以下�E適用案を用意した、E*採否の判断を求�E**:
    1. **回答�Eアンカー**�E��E12設問！E 吁E��答ファイルの「合否基準との対応」節を指す形へ変更する案。QUESTIONS.md の吁E`回答�E:` を次に置揁E— EQ-01: `spec/01-extraction.md#4-合否基準との対応` / Q-02: `spec/02-tokens.md#4-合否基準との対応` / Q-03: `spec/03-layout.md#7-合否基準との対応` / Q-04: `spec/04-typography.md#5-合否基準との対応` / Q-05: `spec/05-assets.md#5-合否基準との対応` / Q-06: `spec/06-components.md#5-合否基準との対応` / Q-07: `spec/07-responsive.md#5-合否基準との対応` / Q-08: `spec/08-motion.md#4-合否基準との対応` / Q-09: `spec/09-verification.md#6-合否基準との対応` / Q-10: `spec/10-fix-order.md#3-合否基準との対応` / Q-11: `spec/11-done.md#5-合否基準との対応` / Q-12: `spec/12-loop-design.md#4-合否基準との対応`
    2. **Q-04 合否基準�E拡張桁E*: 現行文の末尾に「加えて、text-align・text-decoration・text-case・リスチE段落間隔・truncate�E�EaxLines�E��EOpenType/可変フォント�E変換規則が定義されてぁE��」を追記！Epec 側の受け皿 §3-1 は作�E済み�E�E
    3. **新設啁EQ-13 案（アクセシビリチE���E�E*: 、E# Q-13: アクセシビリチE���E�セマンチE��クス・ARIA・キーボ�Eド�Eコントラスト）をどぁE��裁E�E検証するか！E/ 状慁E 未回筁E/ 回答�E: spec/13-accessibility.md#合否基準との対忁E/ 合否基溁E セマンチE��チE��HTML・alt/ARIA属性・キーボ�Eド操作�E色コントラスト�EそれぞれにつぁE��、機械検証�E�ツール・閾値�E�と人間レビューのどちらで何を合格にするかが定義されてぁE��、E
    - 適用は kazu ぁEQUESTIONS.md を直接編雁E��るか、「適用してよい」�E一言があれ�E claude が代行し編雁E�E容を本欁E��記録する、E

  - 対忁E[2026-07-13 / kazu 持E��・codex 適用]: 提桁E案をすべて採用し、QUESTIONS.md へ反映済み、E
    1. Q-01〜Q-12 の `回答�E` を、各回答�E「合否基準との対応」節アンカー付きへ置換した、E
    2. Q-04 の合否基準を §3-1 の受け皿に対応すめEtext-align・text-decoration・text-case・リスチE段落間隔・truncate�E�EaxLines�E��EOpenType/可変フォントまで拡張した。§3-1 を�E照合済みのため、Q-04 は「合格�E�承認征E���E�」を維持する、E
    3. Q-13�E�アクセシビリチE���E�を「未回答」で追加した。回答本斁E`spec/13-accessibility.md` は、次の手動イチE��ーションで claude が起草する、E
- [2026-08-07 codex起草 / 判断Jの条件追加] **[判断J]は次の全条件を満たす完成形なら条件付きで採用してよいか。**
  - **共通評価器の凍結:** A/Bは同一Figma fileKey/root node、node map、同一未実装source snapshot、Figma取得証跡、spec、page coverage、mask、閾値、figma-gate、Chrome/Node証跡を`shared`へpathとSHA-256で固定する。A/Bの`shared`またはcheckpoint planが異なるreportは比較しない。Bの評価対象改善はowner承認記録そのものをpath/SHA-256で固定する。
  - **比較可能性の検査:** `fidelity-benchmark report <out> <comparison-contract>`は凍結ファイル、Figma ID、Node版、clean preflightを検査する。`compare`はcontract欠落、未着手component、integrity非空、dirty preflight、pair ID・shared bundle・checkpoint plan・workspace・implementation context・release適用有無の不一致をFAILとして比較を拒否する。正負隔離E2Eでこの拒否を固定する。
  - **クリーンルーム:** A/Bを同一の未実装source snapshotから別clean Git worktreeで開始し、workspace・implementation context・review contextを分ける。Aのコード・差分・checkpoint・会話・結果にBがアクセスしない具体的な隔離宣言をrecordへ残す。各scopeの実装と批評は同一actorかつ同一contextにしない。
  - **中止条件:** preflight失敗、source/input/evaluator hash不一致、対象外変更、未着手component、integrity非空のいずれかなら、そのA/B組は比較不能として終了する。後続の再実行・置換で同一pairを比較根拠にしない。
  - **結論の範囲:** 1組のA/Bはパイロットであり、将来の改善効果の証明とは呼ばない。追加ペアと効果主張の評価条件は、実測前にownerが別途定める。根拠のない件数閾値は置かない。公開しない比較実験にrelease-checkは要求しないが、公開する場合だけA/B双方でowner承認済みrelease-checkを必須にする。
  - **ownerが採用後に指定する入力:** 実Figma URL（fileKey/root nodeを含む）、実装scopeと除外範囲、A/B各worktree・実装/批評context、PC/SP viewport、checkpoint対象とpainted判定、baseline、Bで評価する承認済み改善、公開する場合のURL・デプロイ識別子を指定する。これらが揃うまで実Figma測定・A/B比較・改善効果の報告は開始しない。
  - **採用前の境界:** comparison contractの起草と隔離E2Eは[120]で完了したが、代替独立批評とowner採用前に実案件の比較根拠として使わない。確定済みspec本文、`QUESTIONS.md`、figma-gate、gate manifest、MyBrain manifestは変更しない。

- [2026-08-21 claude / 環境判定 workflow-preflight の批評と修正] **クラウド判定の欠陥修正（codex `0c8c866`）を独立検証し、指摘10件のうち機械的に検証できる7件を修正した。**
  - 妥当と認めた点: `CLAUDE_CODE_REMOTE` 単独判定は実在の欠陥（`71e4509`、claudeが混入させたもの）。安全弁を環境変数でなく上位層ファイルの可読性に置いた向きは正しい。依存注入によりE2Eが実環境非依存。
  - 修正した指摘: R-1（案件cwdで exit 1 → 絶対パス形を規定）、R-3（両モード exit 0 で強制力なし → `--assert-local` で exit 2）、R-4（`figma:gate preflight` との用語衝突 → 「環境判定」と明示し両方通すと規定）、R-5（実装上ありえない死条件を削除）、R-6（`accessSync` のみで空・プレースホルダが `local` になる → 下限バイトと見出しを検査）、R-7（`CODEX_CI=1` 未実測 → 補助シグナルへ格下げし実測状況を明記）、R-8（Windows固定パス → 環境変数で上書き可）、R-10（README状態欄と必読リスト）。
  - 併せて監査P-Aの本リポジトリ側を実施: 入口2枚に「着手前ゲート」5項目を本文として直書きし、`WORKFLOW.md` の「規則本文を入口へ複製しない」設計を、このゲートに限り例外とした。
  - 実測: `tools/workflow-preflight.e2e.mjs` を9群へ拡張し、実プロセス起動で終了コード（local=0 / cloud=2）まで固定。`figma-log-promote.e2e` / `figma-scope-lock.e2e` に回帰なし。
  - 未実施（ローカル必須）: 監査P-A の案件側 `AGENTS.md` 設置（本リポジトリは案件cwdの祖先ではないため、クラウドからは届かない）。`figma-gate` から `--assert-local` を自動起動する配線（案件側 `package.json` と実測が要る）。監査C（旧 `C:\AI\MyBrain` 参照5箇所）、監査D（`unverified-figma-value` 5件の滞留）、監査E（忠実度ベンチマーク0件）は別scopeとして未着手。
  - 記録: `AUDIT-2026-08-21-rule-adherence.md`、`REVIEW-2026-08-21-codex-preflight.md`

- [2026-08-21 claude / 配送と強制の配線] **監査P-Aの案件側配送と、figma-gateからの環境判定起動を実装した。**
  - 案件側入口: `templates/project-entry.md` を雛形の正本とし、`tools/project-entry-install.mjs` で案件ルートへ `AGENTS.md` / `CLAUDE.md` を設置する。`--check` は雛形とのSHA-256一致を検査し、未設置・世代差を非0で落とす。手作業コピーと世代差の検出不能（監査C）に対する最小の機械検査。
  - gate配線: `templates/verify/figma-gate.mjs` の `preflight` が、manifestを読むより先に `workflow-preflight --assert-local` を起動する。`cloud-restricted`、ツール不在、起動失敗はいずれも SPEC FAIL。正本の位置は `FIGMA_TO_CODE_ROOT` で指定する。迂回用の環境変数は用意していない（テストダブルはgateのフィクスチャ内に限る）。
  - 実測: `figma-gate.e2e` は 309 → 323 アサーションでPASS（cloud判定・ツール不在の負の2件と、同一manifestがlocal判定なら通る正の1件を追加。負の2件でgate成果物が生成されないことも確認）。`project-entry-install.e2e` PASS。`gate-contract-audit.e2e` / `figma-feature-coverage.e2e` / `workflow-preflight.e2e` / `figma-log-promote.e2e` / `figma-scope-lock.e2e` に回帰なし。`fidelity-benchmark.e2e` / `p3-p11-app-server-spike.e2e` / `p3-role-packet.e2e` は本変更の前後で同一の理由で失敗したまま（既存の未解決）。
  - 未実施: 案件側での実測（案件ルートへの実設置、`npm run figma:gate -- preflight` の実行、上位層 `C:\AI\vault` / `C:\AI\web-development` を読める状態での `local` 判定）はローカルでしか行えない。案件側 `MyBrain/verify/` への配布同期（監査C）と `unverified-figma-value` の滞留（監査D）は別scopeのまま。

- [2026-08-21 kazu実測報告 / 案件入口の現況] **案件側の入口は既に存在するが、上位層へ繋がっていない。**
  - 実在: `…\\themes\\rpa-technologies-theme\\AGENTS.md` と同 `CLAUDE.md`。本文は「規則本文は `MyBrain/WORKFLOW.md` のみです」の3行。
  - 位置はテーマディレクトリであり、リポジトリのルートではない。祖先チェーンはcwdから上へしか辿らないため、上位ディレクトリで起動したセッションには届かない。
  - 内容は開始順の5（案件層）だけを宣言し、1〜4（共通Vault / Web Development / figma-to-code / 本リポジトリの規則本文）を参照しない。**監査Aの「届いても本文が無い」に加えて「届いても上位層へ繋がらない」状態だった。**Codexがfigma-to-codeの規則に従わない直接の経路として辻褄が合う。
  - 対応: `templates/project-entry.md` に「規則を読む順序」（vault → web-development → figma-to-code → 案件 `MyBrain/`）を明記し、案件側 `MyBrain/` は最下層で上位層を置き換えないと規定。`project-entry-install.mjs` は複数ディレクトリを一度に設置・検査できるようにした（リポジトリのルートとテーマディレクトリの両方に同一内容を置くため）。
  - 未実測: 案件側 `MyBrain/WORKFLOW.md` の本文はクラウドから読めないため、そこからfigma-to-codeへ繋がっているかは未確認。ローカルで確認が要る。

- [2026-08-21 claude / 訂正と実測] **直前の記録「案件の入口が上位層へ繋がっていない」は誤りだった。**オーナーが提示した案件側 `MyBrain/WORKFLOW.md` の実文により訂正する。
  - 事実: 案件側 `MyBrain/WORKFLOW.md` は開始順1に `C:\AI\vault\WORKFLOW.md` を置き、「Web実装の規則」で `C:\AI\web-development`、「Figma実装・修正」で `C:\AI\figma-to-code\WORKFLOW.md` と `rules/loop-execution.md` / `rules/figma-spec-pipeline.md` を必読と明記している。**配送チェーン自体は繋がっている。**入口3行 → MyBrain → 上位層、の4ホップ構成である。
  - 残る弱点: (1) 入口3行に着手前ゲートが無く、規則本文へ到達する前に編集できる。(2) 4ホップすべてが任意読みで、到達したかを検証する機構が無い（監査B）。(3) `C:\AI\web-development` と `C:\AI\figma-to-code` は案件側の番号付き開始順には無く、条件節での参照にとどまる。
  - **実測で見つかった本リポジトリ側の欠陥**: `rules/figma-spec-pipeline.md:58` と `templates/LOOP.md:46,98` が `figma:gate -- preflight` を `--implementation-actor` / `--implementation-context-id` 抜きで記載していた。gateはv13でこの2つを必須にしており、書いてあるとおり実行すると `preflight requires exactly --implementation-actor and --implementation-context-id once each.` で即FAILする（実測）。案件側 `MyBrain/WORKFLOW.md` は正本のこの記述を写しているだけで、**案件は正しく正本に従っていた。ゲートを通せない原因は正本の記述にあった。**
  - 対応: 3箇所を現行契約の形へ修正し、再発防止として `tools/gate-command-doc-audit.mjs` を追加した。規範文書（`rules/` `templates/` `spec/` `references/` とルート直下）に書かれた preflight コマンドが必須フラグを欠けば exit 2 で落ちる。記録類（STATE / AUDIT / REVIEW）は履歴のため対象外。`gate-command-doc-audit.e2e.mjs` で正負を固定し、正本自身が契約と一致していることも回帰として固定した。
