# P-3 R5 ordinal 3 — zero-cost external-boundary feasibility

Status: P-3-free, read-only feasibility record. No provider account, subscription, purchase, VM, network, role delivery, role launch, implementation, return handling, site/lifecycle action, browser/Figma measurement, or P-11 action was performed.

## Owner constraint

- Maximum incremental spend: **JPY 0**.
- Source: direct owner conversation on 2026-08-15; source-content hash is unavailable and is not represented as machine-verified evidence.

## Screened options

| Option | Zero-cost result | Boundary result | Decision |
| --- | --- | --- | --- |
| Docker Sandboxes | The `sbx` CLI is documented as free to use. | The available local topology lacks the required independently appraised hardware-rooted attester and device/physical transmit-only evidence path. | Excluded for this strict boundary. |
| AWS Nitro Enclaves | Nitro Enclaves has no separate fee, but requires a running parent EC2 instance and other used AWS services are billed. | Its documented parent/enclave `vsock` is not a proven one-way transport for this boundary. | Excluded by the JPY 0 cap and topology requirement. |
| Google Confidential VM / Attestation | Confidential VM billing is based on machine, disk, and other resource usage. | Attestation alone does not supply the required lower-layer one-way collector topology. | Excluded by the JPY 0 cap and topology requirement. |
| Azure Attestation / Confidential runtime | This screen does not establish a selected JPY 0 runtime topology. | Attestation alone does not satisfy the independent physical/device-layer transport requirement. | Not selected. |
| Existing local Hyper-V and connected hardware | No incremental cloud charge. | A P-3-free read-only inventory, pinned below, observed an enabled Hyper-V feature, zero DDA-assignable devices, and no connected device that could be concretely identified as an independently administered verifier or physical one-way evidence transport. Native Hyper-V also has no approved independent collector/diode. | Excluded by the current local capability assessment. |

## Conclusion

No screened option or concretely identified connected device has been shown to meet the strict external-boundary requirements at **JPY 0** in [the requirements draft](r5-ordinal3-external-verifier-boundary-requirements-draft.md). `COLLECTOR_NOT_APPROVED`, capability `FAIL / NOT AUTHORIZED`, and P-11 `NOT_AUTHORIZED` remain unchanged.

The next feasible routes require a new owner decision that changes at least one constraint:

1. provide an already-owned, independently auditable physical transmit-only device and verifier; or
2. authorize a nonzero budget and select a provider/appliance plus data-residency and retention terms; or
3. authorize a separately reviewed relaxation of the strict one-way threat model.

None of these routes is selected or authorized by this record.

## Sources consulted on 2026-08-15

The following are URL/date references only; the retrieved page bytes are not pinned by this record.

- [Docker Sandboxes FAQ](https://docs.docker.com/ai/sandboxes/faq/) — CLI pricing and governance distinction.
- [AWS Nitro Enclaves](https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave.html) — no separate enclave fee; parent EC2 and used-service billing.
- [AWS Nitro Enclaves concepts](https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave-concepts.html) — parent/enclave `vsock` channel.
- [Google Confidential Computing](https://cloud.google.com/security/products/confidential-computing) — usage-based Confidential VM pricing.
- [Azure Attestation quickstart](https://learn.microsoft.com/en-us/azure/attestation/quickstart-portal) — Azure subscription/free-account prerequisite; not a provider-specific JPY 0 topology determination.
- [Local zero-cost hardware inventory](r5-ordinal3-zero-cost-local-hardware-inventory.md) — SHA-256 `f6641a3de0bbb6d6fa5a0519b6b34b5e5984942369a481f2e49287b03e7e049c`; P-3-free, read-only local measurement. It records only enumerated host state and does not prove that no unenumerated or externally administered device exists.
