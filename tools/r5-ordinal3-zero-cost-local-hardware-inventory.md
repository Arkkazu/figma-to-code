# 0円ローカル・ハードウェア候補インベントリ

測定日: 2026-08-15
状態: workspace-only / P-3-free / read-only measurement record

## 対象と非変更境界

この記録は、既接続のWindowsホスト機器とHyper-Vの読み取り専用インベントリだけを対象にした。

- 実行した操作は `Get-*`、`Get-CimInstance`、`Get-PnpDevice`、`Get-NetAdapter`、`Get-Disk`、`Get-WindowsOptionalFeature`、および同じ読み取り操作だけを含む昇格子プロセスである。
- デバイスドライバー、サービス、ネットワーク、Hyper-V VM、DDA割当、ディスク、P-3 role home、P-3 input、P-3 record、site、lifecycleの変更は行っていない。
- この記録を作るためのコマンドにP-3 pathは含めていない。

## 直接観測

### 仮想化とDDA

- `Win32_ComputerSystem` は `HypervisorPresent=true` を返した。
- 同じCIM測定では、`VirtualizationFirmwareEnabled=false`、`VMMonitorModeExtensions=false`、`SecondLevelAddressTranslationExtensions=false` を返した。
- 別の昇格子プロセスでは、`Get-VMHost` が成功し、`Microsoft-Hyper-V-All` の状態が `Enabled` であり、`Get-VMHostAssignableDevice` の結果が0件だった。この子プロセスは、上記二つの成功と0件のときだけ exit code `100` を返す測定用分岐であり、実際に `100` を返した。
- このDDA測定は候補名を出力していない。結論は「この時点の `Get-VMHostAssignableDevice` 結果は0件」である。

### USBとシリアル

`Get-PnpDevice -PresentOnly` のUSB系列で、次の機器・クラスを観測した。識別子はシリアル値を含めず、USBのvendor/product部分だけを記録する。

| 観測クラス | FriendlyName | USB vendor/product部分 |
| --- | --- | --- |
| AVClass | Fresco Logic FL2000 USB Display Adapter | `USB\\VID_1D5C&PID_2000` |
| Bluetooth | Intel(R) Wireless Bluetooth(R) | `USB\\VID_8087&PID_0033` |
| Camera | BisonCam,NB Pro | `USB\\VID_5986&PID_9102&MI_00` |
| HIDClass | Logitech USB Input Device とUSB input interface群 | `USB\\VID_046D&PID_C52B` の各interface |
| HIDClass / XnaComposite | USB input interface群 / XBOX 360 Controller For Windows | `USB\\VID_3537&PID_1040` の各interface |
| USB | Intel USB host controller 2件、USB composite device 3件、USB root hub 2件、generic USB hub 1件 | 観測済み |

- `Win32_SerialPort` と `Get-PnpDevice -Class Ports` は、Bluetoothリンク経由の標準シリアル `COM5` と `COM6` だけを返した。
- 上の測定は、物理serialポートの不存在を証明するものではない。観測されたPorts classに物理serialポートは含まれていない、という結果である。

### PCIとネットワーク

`Get-PnpDevice -PresentOnly` のPCI系列で、主に以下を観測した。

- Intel(R) UHD Graphics
- Intel(R) Wi-Fi 6E AX211 160MHz
- Realtek PCIe GbE Family Controller
- BayHubTech Integrated MMC/SD controller(Generic)
- Intel RST VMD、USB controller、PCIe root port、I2C/SMBus/SPI等のIntel system controller群

`Get-NetAdapter -IncludeHidden` では、Wi-Fiは `Up`、Realtek Ethernetは `Disconnected` だった。Hyper-V vEthernet/vSwitch、VirtualBox host-only、Fortinet、Bluetooth PAN、WAN miniport等のvirtual adapterも列挙された。

### ストレージとその他のPnP機器

- `Get-Disk` は、NVMe `SOLIDIGM SSDPFKNU010TZ` 1本を返した。BusTypeは `NVMe`、状態は `Online` / `Healthy`、`IsBoot=true`、`IsSystem=true` だった。
- `Win32_DiskDrive` をUSB/SD/1394/removableで絞った結果は0件だった。
- PnPには `Trusted Platform Module 2.0` が `SecurityDevices` classとして存在した。一方、`Get-Tpm` が返した `TpmPresent`、`TpmReady`、`TpmEnabled`、`TpmActivated`、`TpmOwned`、`ManufacturerIdTxt`、`ManagedAuthLevel` はすべてnullだった。
- EPSON EW-M5610FT SeriesはPrinter/Image classで存在し、instance routeは `SWD` だった。
- PnPのFriendlyNameを `diode`、`unidirectional`、`one-way`、`data guard`、`serial server`、`capture`、`attest`、`HSM`、`security key`、`smart card`、`fiber`、`optical` で検索した結果は0件だった。

## この測定から特定できる候補

このインベントリで、既存の独立管理者が運用するverifier、または物理的一方向evidence transportであると具体的に特定できる機器は0件だった。

- DDA候補0件は、既存機器をHyper-VへDDAで渡す案の候補が観測されなかったことを示す。
- USB、Bluetooth、Wi-Fi、Ethernet、printer、TPMの存在だけでは、独立管理、物理的一方向性、又は証跡verifierとしての適格性は実証されない。
- TPMについてはPnP上の存在だけを観測し、attestation機能・鍵管理・独立管理者の有無を確認していない。

## 限界

- PnP、CIM、Hyper-V cmdletが返す現在のホスト状態だけを測定した。物理配線、未列挙機器、機器の内部firmware、ネットワーク相手、管理主体、又は物理的一方向性は検査していない。
- FriendlyNameの検索結果0件は、該当名称のPnP機器が見つからなかったことだけを意味し、専用機器の不存在を証明しない。
- CIMのCPU仮想化値と、別経路で得たHyper-Vの有効・API成功の結果は一致しない。この記録は両方の実測値を併記し、どちらからも追加の能力判断をしていない。
