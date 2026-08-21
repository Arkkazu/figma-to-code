# P-3 R5 ordinal 3 — Hyper-V P-3-free capability probe 設計

状態: workspace-only 草案、未実施、fail-closed。これは Hyper-V の隔離能力を**合成データだけで**調べるための設計であり、runtime 設定、VM 作成、feature 変更、role delivery / launch、implementation、return check / apply、site / lifecycle、browser / Figma、P-11 のいずれも承認しない。

## 1. 目的と判定境界

目的は、Hyper-V の新規 VM が `r5-ordinal3-os-isolation-proof-schema.json` の外部 OS 隔離証跡を生成できる候補かを測ることだけです。実行時には P-3 の attachment、handoff、role home、coordinator record、worktree、archive、比較物を使用しません。

この設計で得られ得る最良の判定は、次に限ります。

> synthetic Hyper-V capability probe: PASS for the measured fixture topology and nonce only. P-11 remains NOT_AUTHORIZED. No P-3 role launch or implementation action is authorized.

実データを使う将来の検証は、別nonce、別runtime、別のowner authorization、実attachment inventory、launch直前のpost-probe recheckを必須とします。合成probeのPASSを実P-3 runtimeへ転用してはなりません。

## 2. 候補トポロジー

Linux guest を採用候補とします。Windows guest の通常VHDX上の一時領域ではなく、guest kernel の `tmpfs` をscratchに使えるためです。ただし、ここでの採用候補は実測前の仮説であり、guest-only scratch の証明ではありません。

```text
coordinator-controlled host
├─ verifier / evidence validator              (host only)
├─ nonce-owned synthetic fixture builder      (host only)
├─ Hyper-V manager event source               (host only)
├─ future fixed exporter / persistent output  (not attached to probe VM)
└─ fresh Generation-2 VM
   ├─ sealed, read-only OS base image
   ├─ nonce-owned, read-only fixture ISO
   │  └─ exactly four synthetic regular files
   ├─ /p3/scratch = guest-memory tmpfs
   ├─ implementation-equivalent standard user `p3probe`
   └─ no persistent-output device, folder, mount, ACL, or path
```

### 2.1 VMに接続してはならないもの

- host folder / host drive / UNC share / mapped drive
- user profile、workspace checkout、role home、history、plugin・skill・MCP・connector設定
- persistent output、private spool、evidence store、fixed exporter binary/configuration
- virtual NIC、RDP / Enhanced Session、clipboard、drive・printer・audio・USB・COM redirect、GPU / discrete-device assignment
- VM Guest Service、PowerShell Direct、Key-Value Pair Exchange、virtual socket、host serial-pipe等のhost-control経路
- reusable writable disk、checkpoint、saved state、existing VM session

Hyper-V integration service は、probe evidence を回収するためだけに有効化してはなりません。probe用に一時的なconsole / serial回収経路を使う案も、将来のrole runtimeには残せず、post-probe recheckで不在を立証できない限り不合格です。

### 2.2 scratch と output の分離

- `/p3/scratch` はguest内memory filesystemであり、VM停止で消滅することを別の合成lifecycle testで測定します。読み取り専用probe自身はscratchへ書き込みません。
- persistent outputはVMに存在しません。implementation-equivalent identityにactual outputのhost path、mount、ACL、directory entryを提示してはなりません。host verifierがhost outputのcanonical empty inventoryを採取し、VM configuration、guest mount / ACL、filesystem traceと対にして非attachを証明します。
- guest側の固定probeが行えるのは、actual outputではない論理的なnon-mapped placeholder又はsynthetic decoyへの負の操作だけです。guestの`not found`単独はactual output非露出の証拠にせず、host側non-attach証跡を必須とします。
- fixed exporterのguest→host転送方法は、この設計では**未選定**です。shared folder、RW VHDX、Guest Service、clipboard、generic network uploadを暫定経路として採用してはなりません。
- guest probe evidenceをhost verifierへ回収する経路も**未選定**です。console、serial pipe、integration service、network、guest-written host-backed logを、role runtimeと同一の隔離証跡として扱ってはなりません。role identityから到達不能なcollectorを別途実測できるまで、evidence recordはPASSにできません。

この未選定項目により、設計段階およびoutput exportを含むruntimeは `FAIL / NOT AUTHORIZED` のままです。

## 3. 合成fixtureの作成要件（将来の実行時）

fixtureはnonce生成後に作り、実P-3 bytesを一切含めません。topologyだけを同型にするため、次の4 regular fileを含むread-only ISOまたは同等のread-only virtual mediaを使います。

```text
input/assignment.json
input/references/pc-first-view.png
input/references/sp-first-view.png
return-authority.json
```

- 各ファイルの内容は明示的にsyntheticと識別できる無害な値にします。PNG名のものも、実際に使用する場合は有効な小型PNGを生成し、P-3 referenceのbytesを複製しません。
- host verifierはpath、regular-file種別、byte length、SHA-256だけをinventoryに記録します。内容をevidence bundleへ複製しません。
- ISO root、ISO hash、attachment inventory hash、作成時刻、nonceをsealed topology manifestへ固定します。
- ISOの可視entryはroot、`input/`、`input/references/`、上記4 regular fileだけを許可します。これ以外のfile entry、symlink、reparse point、overlay、writable attachmentは一件でも不合格です。

## 4. 実行前に固定するもの

実施を承認された場合でも、VMを作成する前に外部verifierが次をnonceへ束縛します。

| 対象 | 必須の固定情報 |
| --- | --- |
| verifier | binary path、version、SHA-256、invocation SHA-256 |
| VM base | image digest / SHA-256、base snapshot ID、read-only属性、secure-boot設定、probe前後のbase hash |
| VM writable state | nonce後に作成したfresh differencing / volatile diskのID・attach mode・初期inventory、既存attach履歴なし、VM破棄時のdestroy receipt。host shared filesystemをscratchとして使わない。 |
| VM config | generation、CPU / memory、NIC不在、integration-service不在、checkpoint type無効、saved-state不在、automatic stopがsaveでないこと、automatic start無効、disk / media attach一覧、そのcanonical configuration hash |
| fixture | four-file inventory hash、read-only media hash、mount target |
| probe | fixed probe binary、unit / invocation、permitted child binaryのSHA-256 |
| identity | `p3probe` UID / group / privilege tokenの期待値。administrator、sudo、VM管理、device attach、service control権限は含めない |
| evidence | host-only evidence directory、bundle signing / MAC key ID、出力先がVMから到達不能である証跡 |

probe payloadは固定binaryまたはhash固定の最小scriptに限定します。role prompt、model、interactive shell、browser、Git、plugin host、MCP serviceを含めません。

## 5. P-3-free capability probe の測定順

### A. host側のfreshness測定

1. verifierが新nonceを生成し、fixture、base image、VM config、probe bytesをsealします。
2. Hyper-V managerのイベントと構成exportから、VMがnonce後に新規作成されたこと、以前のsaved state / checkpoint / writable diskを復元していないことを記録します。
3. host側で、read-only fixture media以外のdata attachが無いこと、persistent outputとevidence storeがVM configurationに含まれないことを記録します。
4. host-onlyの無害なsentinelを、禁止surface classごとに用意します。sentinelは実P-3 path、host profileの実内容、secretを使いません。host existence witnessはverifierだけが保持します。

### B. guest起動後の固定probe（collector設計後だけ実行可能）

fixed probeの実行は、hash固定・roleから不可視・改変不能なmeasurement agentと、host-only evidence collectorの設計・実測が別scopeで完了した後に限ります。現時点でcollectorは未選定なので、本節は実行指示ではなく必要要件です。collectorがrole runtimeに残る、又はrole identityからhost操作・data transferに使える構成は不合格です。

probeは次の読み取り・拒否確認だけを行います。

| 確認対象 | PASS条件 |
| --- | --- |
| attachment inventory | 指定4件だけがregular fileとして可視。metadataとhashはhost inventoryに一致する。 |
| attachment immutability | create / overwrite / rename / delete / permission-changeが拒否され、probe後hashが全件不変。 |
| persistent output | actual outputのhost path、parent、mount、ACL、environment、argv、working directoryがguestから見えない。host側のcanonical empty inventory、VM non-attach、guest mount / ACL snapshot、filesystem traceを対にする。fixed probeのnon-mapped placeholder / synthetic decoy結果だけではPASSにしない。 |
| scratch | `/p3/scratch`がguest memory filesystemとしてmount tableに現れ、host share / VHDX / network mountではない。probe自身は書き込まない。 |
| forbidden data surfaces | host sentinel、profile、project / Git、history、role home、plugin / skill、MCP / connector / browser configへのpath mapping、symlink、junction、mount、environment variable、argvが無い。 |
| process / privilege | pinned probeと宣言済みOS依存だけ。admin token、sudo、VM-management tool、device hot-plug、service-control、root-equivalent権限が無い。 |
| host control channels | virtual socket、serial pipe、RDP、clipboard / device redirect、shared socket、host listenerが無い。VMBus / Hyper-V deviceは全件を列挙し、宣言済みOS依存以外、又はguest userからhost操作・data transferに使えるservice endpointが一件でもあればFAIL。 |
| network | NICが無い、又は明示的にdisabled。non-loopback endpoint、outbound connection、proxy設定、DNS resolver、routing entryが無い。 |

将来のmeasurement agent / host-only collectorは、attachment内容、host path、sentinel内容をevidenceへ書き出しません。許可 / 拒否の操作種、対象class識別子、結果、errno / access status、hashだけを扱います。

### C. host側の事後測定（collector設計後だけ実行可能）

1. input hash、fixture media hash、VM config hash、mount / ACL / reparse状態、persistent-output非露出を再測定します。
2. host-only measurement agentが回収した`p3probe`のprocess / filesystem / network traceを検証し、許可範囲外のread、write、resolve、network、child processを一件でも検出したらFAILにします。Hyper-V configuration export、guest stdout、guest自己申告だけでこのtraceを代用してはなりません。
3. VMを破棄後、別のP-3-free lifecycle testでscratch markerが復元不能であることを測定します。このmarker testはattachment / outputを使いません。
4. 別scopeで定義するevidence validatorがschema必須field、全artifact hash、同一nonce、event時刻順、post-probe configuration recheckを検証します。validatorが未実装又は未監査ならFAILです。

## 6. schemaとの対応表

| schema領域 | Hyper-V probeで要求する一次証跡 |
| --- | --- |
| `freshRuntime` | Hyper-V manager event、VM configuration export hash、base image digest、fresh differencing / volatile-state inventory、checkpoint・saved-state不在証跡 |
| `runner` | fixed probe / future runner bytes、service unit、invocation、allowlisted child executableのhash |
| `attachmentAndOutputTopology` | fixture ISO inventory、virtual-media attach一覧、guest mount / ACL表、output path不在、host-side reparse / link scan |
| `forbiddenSurfaceDenial` | host sentinel existence witness、guest negative transcript、environment / process / socket / mount snapshot、filesystem trace |
| `inputIntegrityAndReadOnlyProbe` | input before / after hashes、denied mutation transcript、host-side output non-attachment / canonical empty-inventory evidence、synthetic-decoy denial transcript、probe binary / command / trace hash |
| `independentBinding` | nonce、sealed topology manifest hash、verifier bundle signature / MAC、post-probe VM configuration recheck |

host-only verifierが作ったartifactだけを証跡とします。guest probeのstdout、owner self-report、VM内で作ったmanifestだけではPASSにできません。

## 7. fail-closed 条件

次のいずれかは、部分的な観測結果があってもFAILです。

- Hyper-V管理権限、feature状態、VM event source、base image起源のいずれかを外部verifierが取得できない。
- VMにhost share、virtual NIC、integration service、serial / socket / redirect channel、reusable disk、saved state、checkpoint、unlisted deviceが残る。
- `p3probe`がadmin / sudo / root-equivalent、service control、virtualization management、device attachのいずれかを得られる。
- base image又はnonce-owned writable stateのhash / attach mode / lifecycleを固定できない。checkpoint、saved state、automatic save / restart、既存VM stateの再利用を除外できない。
- `tmpfs`がhost shared path、VHDX、network filesystem、persistent writable locationである、又はVM破棄後の消滅を証明できない。
- persistent output、private spool、evidence store、exporter、host pathがguestのmount、ACL、environment、process、socket、traceに一度でも現れる。
- probe transcriptがcontent、host secret、real P-3 bytesを含む、又はprobeがinput / scratch / output / configを変更する。
- exact model-endpoint-only egress、host-only archive export、launch後のpost-probe recheckのどれかを未測定のまま、role launch可と記録する。
- P-11をPASS / authorized / provedと表現する。

## 8. このprobeで意図的に未解決の事項

次はprobeをPASSと評価する前提ではなく、将来の別設計・別実測が必要なblockerです。

1. **固定archive export**: guest scratchからhost-only fixed exporterへ、implementation identityに見えない一方向経路をどう設けるか。共有folder、RW VHDX、Guest Service、generic uploadは現時点で承認済み解ではありません。
2. **model egress**: 実装roleに必要な通信だけをallowするdefault-deny policy、DNS / proxy / certificate / endpoint pinning、role identityからのhost・任意Internet到達不能の証跡。
3. **evidence collection**: probe transcript、filesystem trace、socket / process snapshotを、implementation identityに見えないhost-only collectorへ移す経路。collectorの存在がrole runtimeへhost-control channelを追加してはなりません。
4. **実P-3 binding**: 実attachmentのinventory、opaque handoff、runtime launch manifest、actual runner、固定exporter、output空性を同じfresh nonceへ束縛すること。
5. **VM host authority**: VMを作成・検証できる最小権限のadministrator / dedicated Hyper-V identityを明示し、通常ユーザーのhost環境や既存VMに影響しないこと。

## 9. schemaの機械検証に関する未解決点

既存の`r5-ordinal3-os-isolation-proof-schema.json`は、現時点ではacceptance checklist / contractであり、JSON Schemaの`required`、`type`、hash形式、nonce相関、追加キー方針を機械検証するtyped schemaではありません。この設計は、そのファイルだけでevidence validatorが存在すると主張しません。

さらに現contractは`implementationIdentityOutputDenialProbeSha256`、`outputHashBeforeSha256`、actual persistent outputへのdenied read/writeを必須にしています。一方、本設計はactual outputをguestへmapしないため、implementation identityがactual outputのfile hash又は拒否probeを生成することはできません。この矛盾が残る限り、Hyper-V topologyが安全にnon-attachを実現してもschema上のPASSは不可能です。ここでschemaを自己変更して解消してはなりません。

Hyper-V capability recordを機械的にPASSとするには、別scopeで次を定義・実装・独立監査する必要があります。

- typed evidence-record schemaとfail-closed validator
- actual outputをguestへmapしない設計に対応した、canonical empty output inventoryとhost-side non-attach証跡のfield semantics
- `implementationIdentityOutputDenialProbeSha256`、`outputHashBeforeSha256`、actual-output denial要件を、host-side non-attach証跡とsynthetic placeholder / decoy負のprobeへ安全に分離する、owner承認済みのcontract amendment
- verifier / measurement agent / collectorの各identity、byte pin、read/write境界
- nonce、event時刻、VM configuration、fixture inventory、trace bundleの相関検査

これらが無い限り、本書はVM能力を判定する実施計画であり、machine-verified isolation proofではありません。

したがって、この設計は実P-3のdelivery / launchへ進む根拠になりません。実行を開始する前に、ownerが「P-3-free Hyper-V capability probe」のVM作成と必要な管理者操作を別途承認する必要があります。
