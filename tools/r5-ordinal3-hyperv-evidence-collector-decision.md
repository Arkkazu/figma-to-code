# P-3 R5 ordinal 3 — Hyper-V guest-evidence collector 判定

状態: workspace-only の設計・調査記録。P-3 の実attachment、handoff、role home、delivery / launch record、site、lifecycle、P-11 には触れていない。VM作成、Hyper-V設定変更、guest起動も行っていない。

## 結論

現在確認できる標準 Hyper-V の機能だけでは、次の条件を同時に満たす guest evidence 回収経路は選定できない。

- shared folder、guest書込み可能な VHDX、Guest Service、network upload を使わない。
- implementation identity から host を操作又は読取できる経路を残さない。
- host-only verifier が guest 内の固定probeの結果・traceを回収できる。
- 将来のrole runtimeに collector / console / serial / integration-service のhost control surfaceを残さない。

したがって、現行の Hyper-V P-3-free capability probe は evidence collector 未選定のまま `FAIL / NOT AUTHORIZED` である。既存 runner の `COLLECTOR_NOT_APPROVED` 停止条件は維持する。

これは「Hyper-V では絶対に不可能」という断定ではない。current native surfaceについて、上記を機械的に示せる一方向 collector が未確認であり、標準機能を安全な例外として採用できない、という fail-closed 判定である。

## なぜ host-only config evidence だけでは足りないか

host は VM configuration、virtual-media attach、NIC・integration service・checkpoint・saved state の不在を直接測定できる。この測定は topology の証拠にはなる。

一方、guest RAM 内だけで実行された固定probeの process、mount、ACL、negative access probe、filesystem trace は、外部へ観測可能な結果を出さなければhostには届かない。VM停止で tmpfs が消え、writable mediaとguest-to-host通信も禁止するなら、PASS実行とFAIL実行をhostが区別する情報は残らない。このため、host config evidenceだけを guest probe 実行・拒否結果の代用にしてはならない。

## 調査した native candidate

| candidate | 判定 | 理由 |
| --- | --- | --- |
| Guest Service Interface / `Copy-VMFile` | 不採用 | Microsoftは guest と host の間で fileを**双方向**コピーするinterfaceと説明している。禁止対象でもある。 |
| PowerShell Direct | 不採用 | networkなしで hostからguestへ任意のPowerShellを実行でき、persistent sessionでは双方向copyもできる。host control surfaceそのものである。 |
| KVP / Hyper-V socket | 不採用 | KVPはhost/guest双方が見るmetadata exchange、Hyper-V socketはhost/guest communicationである。いずれも一方向性を示せない。 |
| VMConnect / basic console / Enhanced Session | 不採用 | VMConnectはkeyboard・mouseをguestへ送り、media attach、checkpoint、設定変更も扱える。証跡回収用consoleをrole runtimeに残せない。 |
| virtual COM port + named pipe | 不採用（probe-only実験候補にも未承認） | `Set-VMComPort` はnamed pipeへの接続だけを設定する。方向制約を公開しておらず、公式kernel-debugging手順ではhost debuggerがguestを停止・制御する用途である。host→guest injectionを排除する証拠にならない。 |
| guest tmpfsを停止後に読む | 不可 | tmpfsは停止時に消える。保存状態・checkpoint・memory dumpは別のpersistent host-observable stateとなり、このprobeの禁止境界を満たさない。 |
| guest-written differencing disk / dedicated VHDX | 不採用 | guest書込み可能なVHDXをevidence transportとして使うことは明示的な禁止対象である。 |

一次資料: [Hyper-V Integration Services](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/integration-services)、[PowerShell Direct](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/powershell-direct)、[Virtual Machine Connection](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/virtual-machine-connection)、[Set-VMComPort](https://learn.microsoft.com/en-us/powershell/module/hyper-v/set-vmcomport?view=windowsserver2025-ps)、[virtual COM port kernel debugging](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/attaching-to-a-virtual-machine--kernel-mode-).

## serial named-pipe を解として採用しない理由

virtual COM portは最も近い候補に見えるが、現時点では採用できない。

1. `Set-VMComPort` の公開interfaceには direction / transmit-only / host-write-deny の指定がない。
2. Microsoftのkernel-debugging手順は、同じnamed-pipe COM portをhost debuggerがguestを停止・制御できる接続として扱う。
3. guest userのLinux device ACLをwrite-onlyにしても、それはHyper-Vのhost→guest経路を封じた証明ではない。guest root・emulated UART・host pipe endpointのいずれも別境界であり、未実測である。
4. たとえsynthetic probeでhost writeを失敗させられても、その測定は当該implementation runtimeのconfigに転用できない。future role runtimeにはCOM port自体をattachしないpost-create recheckが必要になる。

従って、COM portは role runtimeのcollectorにも、machine-verified evidence channelにも使わない。P-3-freeの使い捨て診断実験として調べる場合も、別owner scopeで、実P-3 runtimeへの根拠にしないことを先に固定する必要がある。

## 将来選択できる唯一の構成条件

guest内の事実をhost-only verifierへ渡す必要が残るなら、標準 Hyper-V 外で、**guest→hostだけの専用evidence diode** を設計・独立監査する必要がある。これは現行runtimeへの導入提案ではなく、必要条件の記述である。

```text
fixed measurement agent (guest privileged, byte-pinned)
  └─ transmit-only evidence diode ──> host-only collector ──> host-only verifier

implementation identity
  ├─ no device node / no read / no write / no ioctl
  ├─ no collector process control
  └─ no host path, socket, integration service, console, or network route
```

最低条件は次の全てである。

1. device/hypervisor層でhost→guest data pathが物理的又は実装上存在しない。guest file permissionだけでは不足する。
2. implementation identityはdevice node、collector configuration、collector key、host endpoint、process controlに到達できない。measurement agentは固定hashのroot-owned componentとしてroleより前に起動し、roleからの任意inputをevidence payloadに取り込まない。
3. collector protocolは固定schema、nonce、最大長、record数、content-free fieldsだけを受ける。attachment内容、host path、role stdout、archive raw bytesは拒否する。
4. guest evidenceの真正性は、hostが自由に生成できないidentityに束縛する。hostが信頼境界外であるなら、Hyper-V hostはVM stateを変更できるため、host単独MACでは独立したguest実行証明にならない。attestation key・measured boot・verifier trust modelを別途明文化する。
5. collector deviceはmeasurement用のdisposable VMにだけ存在してよい。actual role runtimeでは、fresh VM作成後とlaunch直前の両方でdevice・COM port・VMConnect session・integration service・socket・NICが不在であることをhost verifierが再測定する。
6. collectorが存在するprobe結果は、collectorを持たないactual runtimeのguest internal traceを証明しない。この差はrecord上で明示し、topology capability evidence以上に昇格させない。

Hyper-V の標準 VM device / integration service APIから、このdeviceを構成する安全な一方向primitiveは確認できていない。物理data diode、独立したvmm拡張、又は別hypervisorの明示的なunidirectional deviceが候補になり得るが、いずれも新規技術・threat model・byte pin・独立監査・owner承認が必要である。

## phase 分離の安全境界

P-3-free Hyper-V capability probe でcollector実験を行うとしても、次の二つを混同してはならない。

| phase | 許容する主張 | 許容しない主張 |
| --- | --- | --- |
| instrumented synthetic measurement VM | 固定agentとcollectorがsynthetic nonceで所定の情報を回収できたか | actual role runtimeが同じguest traceを安全に出せる、P-11が通る |
| fresh role runtime candidate | collector・host-control surfaceなしのVM topologyが作れたか | guest内negative probeが実行・回収済み、delivery / launch可 |

前者は使い捨てで破棄し、後者へVM state、checkpoint、disk、saved state、serial setting、console settingを再利用しない。双方が揃わない限り、P-3 actual runtimeのisolation proofはPASSにできない。

## 以後の停止条件

次のいずれかが未解決なら、Hyper-V `Apply`、P-3 role delivery / launch、return exportを開始しない。

- host-only collectorの実装・byte pin・verification scope・threat modelがowner承認されていない。
- collectorがnative Hyper-Vの双方向channel、shared folder、RW VHDX、Guest Service、network upload、VMConnect、PowerShell Direct、KVP、HvSocketのいずれかに依存する。
- actual runtimeのpost-create / pre-launch recheckでhost control surfaceの不在を実測できない。
- typed evidence validatorがnonce、configuration、collector trace、post-probe topologyをfail-closedに検証できない。
- collector実験の結果をP-11 PASS又はP-3 implementation authorizationへ読み替える。

この文書自体はVM、host設定、P-3 data/record、role runtime、siteを変更していない。
