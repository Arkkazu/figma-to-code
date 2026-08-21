# P-11 App Server feasibility spike

`p3-p11-app-server-spike.mjs` は、P-11認可器ではなく、現行Codex App Serverが同一candidate launchに束縛されたtool/MCP surfaceをどこまで機械観測できるかを測るcoordinator-only feasibility spikeです。P-3 runtime、`p3-clean-room-probe.mjs`、`--require-p11-authorization`、comparison contract、Decision J、clean-room evidence、pair lifecycleを変更しません。

出力は常に `feasibilityOnly: true` と `p11Authorization: "NOT_AUTHORIZED"` を持ちます。認可を計算するcode path、`AUTHORIZED`等の肯定値、`--validate-evidence`への配線、role attachmentは持ちません。owner承認、spikeの成功、P-7/P-9/P-10/P-12の観測PASSはいずれもP-11を上書きしません。

## 1. 主張の範囲

spikeが記録できるのは、使い捨てのcandidate launchについて、時点Tに得たApp Serverの観測値と不足能力だけです。実implementation/review role、pair-begin、roleへの実input配布、実装、実Figma測定には使いません。

role staging/attachment外のhost pathを読むよう促す自然言語・設定がないかは、既存のcoordinator手続レビューの対象です。spikeはその意味を解析せず、その不在を機械証明しません。

次を主張してはいけません。

- OSによる強制隔離、不変の非参照、暗号学的な非参照、未構成host toolの不存在
- 将来のlaunch又は実roleでも同じsurfaceになること
- inventoryに現れなかったtoolが存在しないこと。ただし、そのorigin classの完全観測能力と正負対照を実測できた場合だけは、当該**観測API上の** `absent` と表せます

時刻はcapture層が記録した観測時刻であり、信頼できる時刻源ではありません。PIDもprocess同一性の弱い補助値にすぎません。

## 2. launch外で固定するもの（C-1、C-2、C-6）

coordinatorはspawn前に、runner実装、transport capture層、Codex binaryのbyte SHA-256、Codex version、argv、`CODEX_HOME`、sandbox/profile、launchIdをcoordinator-only pre-launch recordへ固定します。runner自身が書いた値だけを証跡にしてはいけません。runner出力の同項目はpre-launch recordと照合し、1件でも不一致ならその観測は不成立です。

実行planは[p3-p11-app-server-spike-plan-template.json](p3-p11-app-server-spike-plan-template.json)を使う。`coordinatorScratchRoot`、`coordinatorOutputRoot`、その空の子directoryである`outputRoot`はすべてcoordinator-onlyであり、`forbiddenRoots`にはこのtemplate source root、両actual worktree、common Git、pair lock、fixed ledger、`.figma-gate`を明記する。source rootは呼出元のcwdではなくspike自身のmodule pathから導いたphysical rootと一致しなければならない。各launchのcwdはphysical scratch配下、App Serverへ送るsandbox wire valueは厳密に`read-only`である。lexical又はphysical/reparseいずれかでforbidden rootと重なれば、child launch又はartifact書込みの前に拒否する。

`timeoutMs`は各JSON-RPCと`stdin.end()`後のtransport closeにだけ使う。`overallTimeoutMs`は公開CLIのworker全体の上限であり、省略時は360,000msを補う。公開CLIはplanをparse・physical root検査後、正規化したfreeze-copyを`coordinatorOutputRoot`直下へexclusiveに書き、**worker spawn前に同rootを再照合してから**workerへ元planでなくそのcopyだけを渡す。これによりworker開始前後のplan差替えを同一launch束縛へ混ぜない。in-processの`runP11AppServerSpike()` exportは使い捨てfixtureのdependency injection用に残るが、実際の`--plan`観測は必ずsupervisor/worker経路を使う。

overall deadline時、supervisorは自らspawnしたworker PIDだけをWindowsの`taskkill.exe /pid <supervisor-owned-pid> /t /f`へ渡す。image name、wildcard、shell、plan/config由来のPIDは使わない。`taskkill`の終了だけではcleanup成功とせず、対象workerの`close`も観測できた場合だけconfirmedとする。EOF後transport timeoutとpre-launch version command timeoutも同じPID限定tree cleanupを使い、direct childだけを止めてNode/Codex descendantを残す経路を作らない。PIDは依然として弱い補助値である。

deadline時は`outputRoot`内のpartial reportやraw transportを解析・成功扱いにせず、`coordinatorOutputRoot`直下（`outputRoot`外）にexclusiveなtimeout receiptだけを書く。receipt書込み直後にはfreeze済みrootを再照合し、receiptを再読してbyte SHA-256とbyte数を照合する。receiptは常に`feasibilityOnly: true`、`p11Authorization: "NOT_AUTHORIZED"`、`report: { state: "not-used-after-timeout" }`を持つ。tree cleanup又はreceipt保全に失敗した場合もfail-closedであり、P-11認可へ読み替えない。

実App Serverは旧`readOnly`を拒否した応答の中で`read-only`を受理値として列挙した。しかし、是正後の`read-only`を送信した`thread/start`が実際に受理されたことは未実測である。fixtureの受理は実機受理の証明ではない。次の実profile観測は新しい一回限りのowner許可がある場合だけに限り、最初に`candidate.thread !== null`、すなわち`thread/start`が成功してthreadIdを返したことを確認する。`rawThreadStartBinding`はrequestとpre-launch recordの整合だけを示し、サーバ受理の証跡にはしない。

capture層はApp Server subprocessのstdin/stdout transport境界でbyte単位にteeします。runnerが整形、選択、再serialiseしたログをraw JSONLと呼んではいけません。stdin、stdout、stderrのartifact書込み列は相互に独立させ、stdout/stderrの大容量tee待ちが後続stdin RPCを止めない。capture終了時だけ3列すべての完了を待ち、artifact書込み失敗は観測をfail-closedにする。capture層自身のbyte SHA-256もpre-launch recordに入れます。capture層とpre-launch recordはcoordinator-onlyであり、candidate launch又はroleに書かせません。

結果には`CODEX_HOME`がcandidate roleと同一の実profileか、使い捨てprofileかを明記します。使い捨て`CODEX_HOME`での空inventoryを、実profileに定義されたsurfaceの不在としては扱いません。config file、`codex mcp list`、agent文章、self-authored transcriptは、同一launch surfaceの証跡ではありません。

## 3. 同一candidate launch内の観測（C-4、C-5）

captureした1 launchについて、次を同じlaunchId、processInstanceId、threadId、sessionIdに束縛します。

1. initializeとthread/startのraw request/response
2. thread/startが返したthreadIdだけを使う、turnを挟まない連続2回のpre-turn full inventory
3. 無害なfeasibility turnのraw event stream
4. 同じthreadIdのpost-turn full inventory
5. pre/post inventoryのstable JSON hash、個別pageのhash、差分

capture完了後、coordinatorはraw stdin bytesを再読し、ちょうど1件の`thread/start` requestのcwd、sandbox、approval policy、model、raw hash/byte countをpre-launch recordと厳密照合する。照合不能又はpre/post差分がある場合、MCP候補を`absent`としては扱わず`unobservable`にする。

`snapshotId`、server-attested `processInstanceId`、entryごとのorigin・enabled・callable、turn/startのsnapshot binding、plugin/app、project stateは、capture済みraw stdoutを再読してhash/byte countを照合した後にだけ導出する。stdinのJSON-RPC request IDとmethodに対応するstdout response resultだけを使い、field名とfield pathのallowlist外を再帰検索しない。観測値にはresponse ID、response sequence、response wire SHA-256、raw stdout artifact SHA-256/byte count、field pathをprovenanceとして残す。thread-bound field、全entry field、又はresponseの対応が欠ける場合は`unobservable`であり、normalized inventory projectionやconfigから補完しない。

`app/installed`の`enabled`と`callable`だけをapp callabilityの根拠にします。`app/list`の`isEnabled`と`isAccessible`はavailability metadataとして別記録し、`isAccessible`だけでcallable又はP-11の能力要件を満たしたとは扱いません。両collectionの突合はdisplay nameへのfallbackを使わず、raw responseのcanonical `id`とそのprovenanceだけで行う。`id`欠落、同一raw response/page内のduplicate `id`、同一display nameに対する異なる`id`、又は同一installed `id`のenabled/callable不一致はfail-closedにする。

`app/list`にあるappが`app/installed`に無いことはApp Server APIの不変条件違反とは主張しない。しかし、このspikeはそのappのcallability根拠を持たないため、list-only `id`が1件でもあれば保守的に`enabledCallable`を`APP_LIST_ENTRY_WITHOUT_INSTALLED_CALLABILITY`で`observed:false`とする。installed-only `id`は同じ結論を導かず、監査用に別配列へ記録する。reportにはinstalled/listのraw entry数・canonical ID数・display name一覧・list-only/installed-only ID一覧と各raw response provenanceを残す。availabilityの`appListAvailability.value.entryCount`はcallability数と混ぜず別記録する。`enabledCallable`のvalueでは全raw inventory entry数とcallability根拠を持つentry数を別fieldで記録する。

inventory APIがpaginationを持つ場合は、全request/response、cursorの順序、page番号、next cursorをraw bytesから再構成します。連続2回のpre-turn inventoryはpage数とpage順を再現しなければなりません。cursorの重複・欠落、page順の不再現、終端pageのnext cursor残存、schema不一致、ID不一致、capture欠落、取得不能は観測をfail-closedにします。

pre/post差分があれば「surfaceはこのturnの前後でstableでなかった」と記録します。差分がゼロでも、turn中の不変性又は完全性を主張しません。event streamにinventory外toolのcallが現れた場合はinventoryの不完全さを反証できますが、inventoryが完全だったことは立証しません。

feasibility turnは意図的にtool使用を抑制する。そのためinventory外callが観測されないことは、反証信号が出なかっただけであり、inventory完全性の証拠ではない。未知MCP又は外部副作用を持つtoolの呼出しを追加して補うことはしない。

## 4. origin class、対照、三値分類（C-3）

surfaceは少なくとも次のorigin classごとに個別に記録します。

| origin class | current candidate catalog |
| --- | --- |
| MCP server | `GitKraken`、`node_repl`、`figma`、`openaiDeveloperDocs` |
| plugin/app | `documents`、`spreadsheets`、`presentations`、`browser-use`、`pdf`、`chrome`、`template-creator`、`sites`、`visualize`、`browser` |
| project state | `p3-open-service-top-hero-pilot` の trusted state |

このcatalogはcoordinatorが実profileを読み取って作る検査対象一覧であり、config上のenabled/disabled又はtrusted記述だけで`present`/`absent`を決めません。各候補は同一candidate launchのinventoryから個別に扱います。

各classには次の対照が必要です。

- MCP server class: 無害なhealth MCP toolを1件与え、inventoryへの個別出現と副作用なしpingを検査する。
- plugin/app class: 無害なplugin/appを1件有効化し、inventoryへの個別出現を検査する。
- project state class: trusted stateを反映するcandidate launchと反映しないcandidate launchを別々に作り、観測上の差を検査する。
- 負の対照: 与えていない既知tool名がinventoryへ現れないことを検査する。

classごとの結果は必ず `present`、`absent`、`unobservable` のいずれかにします。class別の正の対照、負の対照、完全pagination、同一launch束縛のいずれかを満たせない場合は`unobservable`です。`unobservable`を`absent`、空配列、成功として書き換えてはいけません。`unobservable`が1件でもあれば、complete model-visible surfaceは不成立でありP-11は`NOT_AUTHORIZED`のままです。

## 5. feasibility report（C-7、C-8、C-9）

reportはcoordinator-onlyであり、最低限次を含みます。

- `feasibilityOnly: true` と `p11Authorization: "NOT_AUTHORIZED"`
- pre-launch record、capture層、raw transport artifacts、runner/Codex SHA-256、launch/thread/session/process identifierへの参照と照合結果
- pre/post inventory hash・差分、paginationの終端検査、origin class別の対照と三値結果
- API能力要件ごとの観測結果: `snapshotId`、`processInstanceId`、`threadId`、`turnId`、origin、enabled/callable状態、完全pagination、turn開始時のatomic binding。raw responseから観測できた値には個別provenanceを付ける
- 観測時刻とPIDの限界、inventory外callがあればその反証、現在不足している公開API能力

`isolationMechanism`、clean-room evidence、Decision J、comparison contractのfieldをこのreportから生成してはいけません。reportをP-3 runtime入力、owner承認record、role input、attachment manifestに追加してはいけません。

## 6. P-3からの隔離（C-10）

spikeは`fidelity-benchmark.mjs`、`figma-gate.mjs`、`p3-page-provider.mjs`をimportせず、それらからimportもされません。`C:/AI/MyBrain/manifest.json`のrequired集合へ追加しません。actual worktree、common Git directory、pair lock、fixed ledger、`.figma-gate`へ書き込みません。

spikeのscratch/output root、plan、pre-launch record、raw transport、report、worker freeze-copy、timeout receiptはcoordinator-onlyであり、source root内、actual worktree内、common Git内、pair lifecycle領域内に置けません。freeze-copyとtimeout receiptは`coordinatorOutputRoot`直下、observation reportとraw transportは空で開始する`outputRoot`内に分ける。実行前に空output root、physical root、read-only launch profileを検証し、freeze-copy直後のworker spawn前とtimeout receipt書込み直後にfreeze済みcoordinator output rootが変わっていないことを再照合する。timeout receiptは再読してbyte SHA-256とbyte数を照合する。いずれもP-3 runtime入力又はrole attachmentへ移しません。

一回限りの実profile観測では、`output/observation/`のreportを含む全artifactと`output/plans/`を、Temp外のcoordinator-only恒久保管先へ複製し、相対path・byte SHA-256・byte数・保全時刻を照合して記録する。report SHA-256が保全先でも一致しなければ、その観測を後続判断へ使わない。`scratch/home-*`はdisposable control profileであり保管対象外だが、ownerの明示許可なく削除しない。保全artifactもP-3 runtime入力、role attachment、owner recordへ移さない。

実装後はspike本体・E2E・本書のSHA-256、P-3 runtime core 3ファイルの不変、`node C:/AI/MyBrain/bootstrap.mjs --check`、`node C:/AI/vault/scripts/workflow-entrypoints.mjs --self-check`を独立批評へ提出します。P-11認可、`ownerApproved: true`、pair-begin、実roleの起動は、その批評のPASS後にも別の根拠なしには開始できません。
