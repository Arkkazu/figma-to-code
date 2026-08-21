# P-3 R5 ordinal 3 — guest-evidence collector alternatives research

状態: workspace-only の P-3-free 調査。P-3 attachment、handoff、role home、coordinator record、runtime、VM、host 設定、site、lifecycle、P-11 は変更していない。

## 結論

標準 Hyper-V だけで、実行中に host → guest の制御面を残さず、終了後に guest 内の否定証跡を信頼可能に回収する構成は見つからなかった。`COLLECTOR_NOT_APPROVED` を維持する。

停止後に nonce VHDX を別の collector VM で読む構成は、archive の隔離検査・搬送には使える。しかし、そのVMが読むのは停止済み guest が残したバイトだけであり、実行中の process、mount、ACL、socket、trace、拒否結果を遡って立証できない。したがって evidence collector ではなく、submission transport / isolated extractor に留める。

## 実測

✅ 2026-08-15、管理者昇格した `Get-VMHostAssignableDevice` を読み取り専用で実行した。ラッパーは成功かつ結果0件のときだけ exit code `50` を返す。実測値は `50` だったため、その時点で本 host が列挙する DDA assignable device は0件だった。

この値は「現在の列挙結果」に限る。接続されていない hardware、他host、将来追加されるdeviceの不在を証明するものではない。

## 候補別の判定

| 候補 | 判定 | 到達できる範囲 | 満たせない点 |
| --- | --- | --- | --- |
| 停止後の別 collector VM + detached nonce VHDX | 不採用（evidence用途） | untrusted archive を main coordinator host に mount せず、isolated parser で検査できる | disk上の自己生成データから、終了済みguestの実行中traceや否定結果を復元できない |
| HGS / shielded VM / vTPM | 基盤候補、collectorではない | trusted host上だけでshielded VMを起動する制御、boot / host health のattestation | guest runtime evidenceをhost-only verifierへ渡す一方向channelを提供しない |
| Linux IMA + TPM quote | 基盤候補、単独では不十分 | measurement log とPCR quoteを結び、明示policy対象の測定を外部検証できる | 測定範囲はpolicy依存。否定的なfilesystem / socket / host-control事実を自動的に網羅せず、quoteを外へ渡す信頼できるtransportも別途必要 |
| Hyper-V DDA | 不採用（generic device） | physical deviceをguestへ直接渡せる | DDAはdeviceの全capabilityをguestへ渡す。標準deviceにhost→guestを物理的に欠くことを示すprimitiveは無い。現在のhost列挙も0件 |
| virtual / serial device | 不採用（generic virtual channel） | guestとhost間の仮想入出力を提供できる | 標準surfaceにdirectionをguest→collectorだけへ固定し、host→guest制御を構造的に否定するprimitiveは無い |
| physical transmit-only diode + independent collector | ⚠️ 将来の別構成候補 | device層でguest→collectorだけのbit pathを作れる可能性 | vendor/hardware検証、guest measurement-agent隔離、guest/host trust model、nonce/protocol、collector独立監査が未実装。現在のhostには候補deviceなし |
| confidential VM + remote verifier | ⚠️ 将来の別構成候補 | TEE hardware / guest attestationにより、trusted external partyへplatform / boot evidenceを渡せる | external provider・cost・new authority・remote verifierが必要。attestation/APIが双方向networkを使うため、strictなunidirectional transportをそのまま満たさない |

## 根拠

### 1. Offline collector VM は「後処理」であり観測器ではない

role VMを完全停止しVHDXをdetachした後、別identityのVMでreadonly extractionすることは、live host control surfaceをrole VMへ残さないという一点では有利である。

しかし collector VM が得るものは、guest側のsupervisor又はroleが書いたsubmission bytesだけである。disk imageに次の事実は自動的には残らない。

- implementation identityが実行中にどのpath、mount、socket、processへ到達したか
- negative probeが実行されたか、その時に何を拒否されたか
- measurement agentがroleより先・別identityで動いていたか
- hostが実行中にguestへ制御・data injectionしていないか

よって、collector VMを採用しても、前提となるmeasurement agentの真正性と、そのagentから外部へ出る一方向evidence channelが無ければ、self-authored evidenceを検査しているだけになる。

### 2. HGS / shielded VM は host 健全性の基盤であり、evidence exportではない

MicrosoftのHGSは、shielded VMが既知で正当な構成のtrusted fabric host上でのみ実行されることを保証するためのhost attestation / key protectionである。TPM-trusted configurationでは、hostのTPM identity、measured boot、code-integrity policyを基にする。これは強い前提になり得るが、guest内のruntime traceを収集・搬送する機構ではない。

- [Host Guardian Service attestation protocol](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-hgsa/7730337b-53d6-4f83-bc76-a156c3cfd342)
- [Guarded Fabric and Shielded VMs overview](https://learn.microsoft.com/en-us/windows-server/security/guarded-fabric-shielded-vm/guarded-fabric-and-shielded-vms)

したがって HGSを将来採用しても、別のcollector / evidence transport設計が必要である。

### 3. IMA + TPM は measurement の真正性を補強できるが、coverage とtransportを代替しない

Linux IMAはmeasurement listをTPM PCRにextendでき、remote attestationではquoteとmeasurement logを対応付けて検証できる。kernel documentationは、PCRだけでは解釈しづらくmeasurement logが必要であること、さらにmeasurement対象はpolicyで明示する必要があることを示す。

- [TPM Event Log](https://docs.kernel.org/security/tpm/tpm_event_log.html)
- [IMA measurements export and delete](https://docs.kernel.org/security/IMA-export-delete.html)
- [IMA policy kernel parameter](https://docs.kernel.org/4.20/admin-guide/kernel-parameters.html)

これはbyte-pinned agent、nonce、quote、policy hashを結ぶ将来の構成要素にはなり得る。一方で、role実行の全filesystem / socket / host-control denialを自動的に測定するわけではない。policy外の事実はquoteがあっても証明されず、quoteとlogを外部verifierへ安全に渡すchannelも追加で必要になる。

### 4. DDA は physical diodeの代わりにならない

MicrosoftのDDAはPCIe device全体をguestへ渡す機能であり、guestはdeviceをbare-metal同様に利用できる。公式文書もdeviceの全capabilityがguestへ利用可能となること、untrusted tenantではvendorのDevice Mitigation Driverを要することを明記している。従って、通常のDDA device又はvirtual serial deviceを一方向evidence channelとみなすことはできない。

- [Plan for deploying devices using DDA](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/plan/plan-for-deploying-devices-using-discrete-device-assignment)
- [Deploy devices using DDA](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/deploy/deploying-graphics-devices-using-dda)

物理的にreturn pathを持たない専用diodeが別途存在し、そのdeviceのfirmware、wiring、driver、guest ACLを独立監査できるなら、標準Hyper-V外のcandidateにはなり得る。ただし current hostではassignable deviceが列挙されず、実機・外部collectorもないため、ここでsynthetic probeを実施できない。

### 5. Confidential VM + external verifier は新しいtrust boundaryを作る候補だが、local Hyper-Vの延長ではない

Azure Confidential VMのguest attestationは、AMD SEV-SNP又はIntel TDXのTEE、vTPM evidence、external attestation serviceを使い、relying partyがhardware-backed VM stateを評価するための機構である。これはhost単独MACより強いexternal trust anchorを提供し得る。

- [What is guest attestation for confidential VMs?](https://learn.microsoft.com/en-us/azure/confidential-computing/guest-attestation-confidential-vms)
- [Azure Attestation overview](https://learn.microsoft.com/en-us/azure/attestation/overview)
- [Confidential VM guest attestation design](https://learn.microsoft.com/en-us/azure/confidential-computing/guest-attestation-confidential-virtual-machines-design)

ただし、guest attestation serviceへのrequest / responseはnetwork通信である。これは「host→guest controlが無い」ことの証拠にも、「strictにone-wayなevidence transport」にもならない。採用するなら、external verifier、model endpoint、attestation endpoint、role network namespace、measurement-agent network namespaceを別々に固定し、responseをrole identityへ渡さないことを含む新しいprotocolが必要になる。

## 将来構成としてのみ成立し得る最小像

これは current runtimeへの実装提案ではなく、追加authority・独立監査がそろった場合の必要条件である。

```text
read-only nonce fixture
  └─ confidential / guarded guest
       ├─ byte-pinned measurement agent (roleとは別identity)
       ├─ unprivileged implementation role
       └─ hardware-backed attestation key
             └─ physically transmit-only diode
                   └─ independent collector / remote verifier

after role termination only:
  fixed supervisor -> nonce submission volume -> isolated readonly extractor
```

必須の追加条件:

1. host→guest bit pathをdevice / physical layerで否定できるdiode。guest permissionだけでは足りない。
2. measurement agentとattestation keyをimplementation identityから隔離し、agentのcode / policy / nonce / role lifecycleをmeasurementへ束縛すること。
3. external verifierがnonce replay、policy hash、quote、bounded content-free evidence schemaを検証すること。
4. output transportとevidence transportを別物として扱うこと。nonce VHDXはarchive submission / isolated extraction用途に限り、guest evidenceの正当性を担わせないこと。
5. current schema・handoff・candidateを上書きせず、pair-common successor、typed validator、independent audit、owner approvalを別途完了すること。

## 次の安全なprobe

このhost・現行authorityの範囲では、実行可能かつcollector問題を解くfunctional probeは無い。VM作成、serial設定、DDA attach、guest起動、外部attestationサービス利用は、どれも新しいtrust boundary又はcontrol surfaceを導入し、現時点の根拠ではPASSへ進めない。

安全に継続できる作業は、P-3-free のまま次に限る。

1. typed evidence validatorをfail-closedで設計・独立試験する。
2. physical diode又はexternal confidential-compute verifierを採用するかどうかのowner decisionを、必要なhardware・trust boundary・外部費用・監査条件と共に別scopeへ起票する。

それまでは `COLLECTOR_NOT_APPROVED`、P-11 `NOT_AUTHORIZED`、role delivery / launch / implementation / return apply未承認を維持する。
