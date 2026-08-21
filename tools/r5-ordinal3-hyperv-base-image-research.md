# Hyper-V Gen2 P-3-free capability probe — Linux base-image research

Status: research only / no download, VM creation, image build, or P-3 input access performed  
Measured: 2026-08-15 (local tool availability); official-source review on the same date

## Recommendation

Use the official **Ubuntu Server 24.04.4 LTS amd64 live-server ISO** for the first P-3-free capability probe:

| Field | Pinned value |
| --- | --- |
| Artifact | `ubuntu-24.04.4-live-server-amd64.iso` |
| Official release index | [releases.ubuntu.com/24.04](https://releases.ubuntu.com/24.04/) |
| Published SHA-256 | `e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433` |
| Published size | approximately 3.2 GB |
| VM generation | Generation 2 |
| Secure Boot template | `MicrosoftUEFICertificateAuthority` |

This is the smallest operationally simple choice for the probe: it is a signed, current LTS **server** installer without a desktop or the Quick Create integration features. Canonical documents the manual ISO path for Hyper-V and its use with Generation 2; Microsoft documents the Linux-compatible UEFI CA Secure Boot template. Do not use Quick Create for this probe because Canonical describes it as including sharing-oriented enhanced features. Do not use the Azure `.vhd` cloud artifact: Canonical states that those VHDs are Azure-specific and do not function on on-premises Hyper-V.

Sources: [Ubuntu on Hyper-V](https://ubuntu.com/server/docs/how-to/virtualisation/ubuntu-on-hyper-v/), [Ubuntu release index](https://releases.ubuntu.com/24.04/), [Canonical cloud-image artifact reference](https://documentation.ubuntu.com/public-images/public-images-reference/artifacts/), [Microsoft Generation 2 guidance](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/plan/should-i-create-a-generation-1-or-2-virtual-machine-in-hyper-v).

The published SHA-256 above is an acquisition target, not a local verification result: the ISO was deliberately not downloaded in this scope.

## Acquisition and byte pinning

Acquire these four Canonical artifacts together into a new, dedicated cache directory; never use an unpinned `current` alias as a runtime input.

1. `ubuntu-24.04.4-live-server-amd64.iso`
2. `SHA256SUMS`
3. `SHA256SUMS.gpg`
4. `ubuntu-archive-keyring.gpg`

Canonical's required verification sequence is:

1. Establish trust in the Ubuntu CD Image Automatic Signing Key independently of the download channel. Canonical publishes the current signing-key fingerprint `843938DF228D22F7B3742BC0D94AA3F0EFE21092`; a first-use trust decision still needs an independent owner-approved comparison.
2. Verify `SHA256SUMS.gpg` against the trusted keyring with `gpgv`.
3. Compute the ISO SHA-256 and compare it to the signed `SHA256SUMS` entry and the pinned value in this document.
4. Record SHA-256 values for all four downloaded files, the verification tool binary, tool version, source URLs, and the verification transcript hash in a new probe-local manifest.

`Get-FileHash` alone can establish equality to a supplied value, but it cannot authenticate where that supplied value came from. The detached signature check is therefore required before the byte pin is accepted.

Source: [Canonical image-integrity verification](https://documentation.ubuntu.com/security/software-integrity/image-verification/).

## Secure Boot and immutable base arrangement

For the P-3-free probe, create a Generation 2 VM manually from the ISO and configure:

```powershell
Set-VMFirmware -VMName '<probe-vm>' -EnableSecureBoot On `
  -SecureBootTemplate 'MicrosoftUEFICertificateAuthority'
```

Microsoft identifies `Microsoft UEFI Certificate Authority` as the template for Linux distributions, and Canonical gives the same template instruction for an Ubuntu Gen2 VM. `Set-VMFirmware` is a Generation 2-only cmdlet. Verify the effective configuration with `Get-VMFirmware` before first boot, then retain the command/result as probe evidence.

Secure Boot authenticates the boot chain; it does **not** authenticate the later host-side fixture ISO or make the installed guest disk immutable. After an offline base installation, compute and pin the base VHDX SHA-256, restrict its host ACL, and create a fresh differencing VHDX for every capability run. Hyper-V supports a differencing VHDX through `New-VHD -ParentPath <base> -Path <child> -Differencing`.

Sources: [Microsoft Generation 2 security](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/generation-2-virtual-machine-security-features), [Set-VMFirmware](https://learn.microsoft.com/en-us/powershell/module/hyper-v/set-vmfirmware), [New-VHD](https://learn.microsoft.com/en-us/powershell/module/hyper-v/new-vhd).

## Offline seed and fixture ISO design

Use two separate non-bootable ISO images. Neither may contain P-3 material.

| ISO | Purpose | Contents | Lifecycle |
| --- | --- | --- | --- |
| `seed.iso` | One-time Ubuntu autoinstall | only `user-data` and `meta-data`, volume label `CIDATA` | Eject immediately after base installation |
| `fixture.iso` | Capability test input | exactly four synthetic, non-sensitive sentinel files plus a synthetic manifest | Attach only after the installed base is sealed |

Cloud-init's NoCloud datasource accepts an `iso9660` or VFAT volume labeled `CIDATA`; it does not require a network service. The base install can therefore remain offline. The capability fixture must not double as an autoinstall seed, so that temporary credentials and installation directives cannot be mistaken for input data.

The host currently has no ISO authoring utility: `New-IsoFile`, `oscdimg.exe`, `xorriso.exe`, and `mkisofs.exe` were all absent. Microsoft documents `Oscdimg` in the Windows ADK Deployment Tools and supports ISO 9660/UDF creation, a volume label (`-l`), fixed timestamps (`-t`), and UDF/ISO 9660 (`-u1 -udfver102`). Once the tool itself has been independently pinned, the intended builders are:

```text
seed.iso:    Oscdimg -u1 -udfver102 -lCIDATA -g -t<fixed-UTC-time> <seed-dir> <seed.iso>
fixture.iso: Oscdimg -u1 -udfver102 -lPROBEFIXTURE -g -t<fixed-UTC-time> <fixture-dir> <fixture.iso>
```

Each build must record the input inventory, every input SHA-256, the exact command, the `Oscdimg` binary SHA-256/version, and the resulting ISO SHA-256. Hash pinning the resulting ISO is required even if timestamp normalization is used; reproducibility has not yet been measured.

Attach the fixture only through `Add-VMDvdDrive -Path <fixture.iso>`, never through a host directory share. A virtual DVD is the correct media abstraction, but guest read-only behavior remains a measurement requirement: the P-3-free probe must show the mounted filesystem type, inventory/hash match, and a failed guest write attempt before any stronger claim is made.

Sources: [NoCloud datasource](https://cloudinit.readthedocs.io/en/latest/reference/datasources/nocloud.html), [Oscdimg options](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/oscdimg-command-line-options), [Add-VMDvdDrive](https://learn.microsoft.com/en-us/powershell/module/hyper-v/add-vmdvddrive), [ADK offline installation](https://learn.microsoft.com/en-us/windows-hardware/get-started/adk-offline-install).

## Local readiness measured

| Check | Result |
| --- | --- |
| Hyper-V PowerShell module | present, version `2.0.0.0` |
| `New-VM`, `New-VHD`, `Set-VMFirmware` | present |
| ISO authoring utilities | none present (`New-IsoFile`, `oscdimg`, `xorriso`, `mkisofs`) |
| `gpg` / `gpgv` | absent |
| Hyper-V/CIM/host Secure Boot status query | access denied in the current session |

The access-denied result does not establish that Hyper-V or Secure Boot is unavailable. It establishes that the current non-elevated session cannot provide the required management evidence.

## Required owner scope before an actual P-3-free probe

1. Authorize an elevated or `Hyper-V Administrators` execution context limited to a named P-3-free probe directory, including VM, VHDX, DVD attachment, start, stop, and deletion operations.
2. Authorize retrieval and cache storage of the exact Ubuntu ISO, signed checksum files, and Canonical keyring, or supply those already-verified bytes and their provenance.
3. Authorize installation of only Windows ADK **Deployment Tools** (to obtain `Oscdimg`) and a GnuPG verifier, or supply independently pinned equivalents. Both are host changes and are not authorized by this research task.
4. Authorize creation of only synthetic `seed.iso` and `fixture.iso`, a sealed base VHDX, and disposable differencing VHDX files. No P-3 attachment, record, role home, site, or lifecycle data may enter this scope.
5. Authorize an offline first run with no VM network adapter and no host-folder, clipboard, Enhanced Session, PowerShell Direct, guest-service, or Docker integration. The later model-egress design is a separate approval and is not proved by this base-image probe.

## Decision

The recommended image and byte-pinning process are ready for owner-scoped acquisition. The actual capability probe remains blocked on the listed host permissions and tool provenance. This research establishes no P-3 runtime authorization and changes no P-3 state.
