# P-3 R5 ordinal 3 — external verifier boundary requirements (review-only draft)

Status: P-3-free workspace research only. This is neither a provider selection nor authority to provision an account, buy hardware, create a VM, publish a handoff, deliver, launch, implement, export, apply, measure, or change P-11.

## Narrow conclusion

No single ordinary cloud verifier, physical diode, or separately administered collector is sufficient by itself for the stated boundary:

- A conventional confidential-compute attestation service can authenticate a measured workload, but this draft has not established a provider-specific one-way topology for any candidate. It therefore does not by itself prove that no verifier/coordinator input can subsequently control the role.
- A physical one-way device can constrain direction, but does not authenticate the guest, prove the measurement agent was intact, or appraise the evidence.
- An independently administered collector separates operators, but an administrative boundary alone cannot establish guest evidence provenance.

Under this draft’s strict boundary, a candidate must demonstrate both independently appraised hardware-rooted evidence and a device-layer transmit-only conveyance path. These capabilities may be integrated in one independently audited system, but neither property may be inferred from the other:

```text
hardware-rooted attester / protected measurement agent
  -- device-layer transmit-only evidence path -->
independently administered verifier with pinned trust anchors
  -- signed attestation result --> relying-party record store
```

The verifier may be a confidential-compute service, but only if the selected offering can satisfy every requirement below without a runtime return/control path to the role. The one-way device may be integrated with the verifier service or be a separate appliance. A generic egress firewall or a TCP/TLS endpoint is not enough: its reply packets are still a host/service-to-role path.

## Required data flow

1. Before runtime creation, the external verifier creates and signs a one-time canonical fixed-length `challengeCapsule`. It contains only a nonce, not-before/expiry values, evidence-schema hash, measurement/reference-value-policy hash, verifier-side expected-coverage-manifest hash, and fixed evidence-size/count limits. It contains no command, policy body, URI/address, secret, file/path/locator, code, or variable-length payload.
2. The coordinator may copy that signed capsule only into a protected measurement-agent namespace in the sealed read-only runtime image before launch. The implementation identity cannot read, branch on, replace, or derive it. The agent verifies the signer, fixed schema, and time validity using an attested/trusted clock before any role-visible action; if such a clock is unavailable or inconsistent, the runtime fails before role start. The external verifier also applies receipt-time expiry validation before nonce consumption. This is a pre-launch data binding, not a live control channel.
3. A byte-pinned measurement agent, protected from the implementation identity, obtains a hardware-backed attestation report whose signed payload binds `H(canonicalChallengeCapsule || evidenceBundle || agentBytes || runtimeConfiguration)`. The verifier independently recomputes the canonical capsule digest, nonce, agent/runtime configuration hashes, and evidence hash from the same signed report and rejects any mismatch; neither an optional side binding nor a role claim is accepted.
4. The agent sends only the fixed-schema evidence and the attestation report across a transmit-only device-layer path to the external verifier. No command, configuration, secret, acknowledgement, or result may travel back to the role while it exists.
5. The external verifier validates evidence, signs an attestation result, and writes it to a verifier-controlled record store. The coordinator/relying party obtains that result separately; the role never receives it.

If a candidate needs an online verifier challenge, dynamic policy update, secret release, retry instruction, result acknowledgement, or network response while the role exists, it fails this strict boundary unless that inbound data is proven unreachable by the implementation and measurement identities.

## Non-negotiable technical requirements

| Area | Requirement | Fail-closed condition |
| --- | --- | --- |
| Independent root of trust | Verifier signing key, appraisal policy, and trust-anchor store are outside the coordinator host's administrative control. A documented key-rotation/revocation process exists. | A local coordinator process, VM, or key signs the only evidence result. |
| Authentic attester | Hardware-backed attestation validates the exact immutable runtime/TEE measurement and binds the signed challenge capsule and evidence hash. The verifier checks certificate chain, revocation/freshness collateral, nonce, and reference values. | Only a guest-generated JSON, host MAC, log, or self-report is available. |
| Measurement-agent protection | The agent, trace facility, policy, and attestation material are byte-pinned and unavailable to the implementation identity for read, write, process control, namespace entry, or configuration. Its privilege boundary must remain valid even if the implementation process becomes privileged inside its own role domain. | The role can kill, replace, ptrace, mount over, reconfigure, or forge the agent/trace. |
| Challenge capsule | The verifier-signed capsule is canonical, fixed-length, data-only, bound to the same signed attestation payload as nonce/agent/runtime/evidence hashes, and exposed only to the protected agent. The agent validates signature/schema/time using an attested clock before the role can observe a state change; the verifier separately validates receipt-time expiry before nonce consumption. | The role can read, branch on, alter, or derive the capsule; trusted time is absent; the verifier cannot recompute the same capsule binding; or the capsule carries a command, policy body, URI/address, secret, code, locator, or variable-length data. |
| One-way conveyance | The evidence channel is transmit-only at an independently administered device/physical layer beneath the coordinator-controlled hypervisor, not merely by guest ACL, network policy, or a normal host hypervisor. There is a testable host/service-to-role injection denial result for the exact runtime topology. | Guest permissions, a firewall rule, a TCP connection, serial pipe, shared folder, VHDX, VM integration service, console, socket, or coordinator-controlled hypervisor is treated as a diode without a lower-layer proof. |
| No live control | The role has no route to receive runtime commands, policy, files, secrets, acknowledgements, or result data from the coordinator/verifier/collector. This covers evidence transport plus console, metadata service, management API, integration service, boot/recovery path, secret injection, device redirection, and every other runtime input plane. All role-visible configuration is immutable before launch and covered by the attested measurement. | Any post-start inbound channel exists, including an ordinary bidirectional attestation session or an unmeasured management/boot/recovery/control plane. |
| Fixed evidence and coverage | Evidence has a pinned schema, maximum record count/size, content-free fields, and an explicit rejection policy for attachment bytes, host paths, archive bytes, stdout, arbitrary JSON, or role-selected destinations. Every assertion is bound to a byte-pinned collector operation and explicit coverage set. The verifier owns an independently byte-pinned expected-coverage manifest and rejects missing, extra, duplicate, undefined, type-invalid, or out-of-order assertions. `unknown`, `unobservable`, collector error, and partial trace invalidate the report rather than becoming a safe boolean/count/hash. | An evidence field can carry unrestricted role-controlled bytes or a host locator; an assertion lacks a coverage set; the observed coverage differs from the verifier manifest; or any observation failure is rounded into a successful value. |
| Freshness/replay | A verifier-generated single-use nonce and expiry are bound into the hardware-signed report; the verifier records nonce consumption atomically and rejects duplicates, late evidence, and cross-condition reuse. | Timestamp-only freshness or a nonce selected solely by the role/coordinator. |
| Independent result | The verifier produces a signed result with a pinned key/certificate chain and a complete source-artifact hash manifest. The relying party verifies it against an out-of-band pinned trust anchor. | The role, collector, or coordinator can mark itself `pass`. |
| Failure containment | A missing or invalid report, missing diode test, stale collateral, provenance mismatch, or transport error produces only `fail`; it never creates a persistent output or a role-launch authorization. | Partial evidence is promoted to capability PASS. |

## Evidence minimum

The external verifier must receive and retain only the minimum needed to decide the isolation assertion:

- opaque runtime instance identifier;
- verifier nonce and expiry;
- hardware attestation report plus certificate/collateral references;
- hashes of pinned measurement-agent, runtime image/configuration, probe, schema, policy, and verifier-owned expected-coverage manifest;
- fixed boolean/count/hash assertions for the sealed topology, negative probes, mount/ACL/process/socket/trace summaries, and post-probe recheck, each with its byte-pinned collector operation and exact coverage set; the verifier rejects all missing, extra, duplicate, undefined, type-invalid, and out-of-order assertions;
- explicit invalid/fail states for unknown, unobservable, collector-error, stale, or partial-trace results; no missing observation may be serialized as a safe `false` or `0`;
- source artifact IDs and hashes, not attachment contents or persistent-output locators;
- verifier decision, reason codes, signing key ID, timestamps, and nonce-consumption receipt.

Raw attachment bytes, role conversation, role stdout, host paths, persistent-output bytes, and implementation-authored manifests are excluded. Archive submission/export remains a separate transport and validation problem; it cannot serve as guest-evidence provenance.

## Candidate boundary classes

| Candidate | Can contribute | Cannot be presumed to solve | Extra proof required |
| --- | --- | --- | --- |
| External confidential-compute verifier | Hardware-rooted attestation validation and signed results. Azure Attestation, AWS Nitro attestation, and Google Cloud Attestation document signed/verifiable attestation evidence, but no provider is selected here. | No-live-inbound control: this draft has not established a provider-specific one-way topology. | A provider-specific design proving pre-launch challenge binding, protected agent measurement, and topology-specific injection-denial evidence that every runtime evidence transport has no reverse path. |
| Physical one-way appliance | Device-layer evidence-only conveyance when independently specified, installed, and tested. | Guest authenticity, agent integrity, policy appraisal, and signed result. | Hardware data-flow specification, deployment diagram, adversarial injection test, tamper/maintenance control, and integration with a hardware-rooted attester/verifier. |
| Independently administered collector | Separate operator and evidence storage/verification domain. | Directionality or provenance merely from different credentials/tenancy. | Separate administrator/key custody, no shared control plane, hardware-attestation validation, signed result, and a true one-way intake path. |

## Explicit unresolved owner decisions

1. Select, or reject, the trusted attestation root/provider and its data residency, contract, availability, support, and cost envelope.
2. Select a physical/device-layer one-way transport or explicitly authorize a successor threat model that permits a narrowly defined bidirectional protocol. The current strict boundary does not permit the latter by default.
3. Decide whether a pre-launch verifier-signed challenge capsule may be copied into the sealed image, and define its expiry/replay/disposal policy.
4. Select the protected measurement-agent substrate. A general guest root boundary is insufficient unless the selected TEE/partition makes the agent and trace unmodifiable by the implementation identity.
5. Define verifier-owner versus coordinator-owner administration, trust-anchor escrow/rotation/revocation, incident response, retention, backup, and deletion rules.
6. Approve the exact content classification and retention period for evidence metadata. No raw P-3 attachment or archive data may be used for a capability probe without separate authority.
7. Fund and authorize an independent design audit and a P-3-free synthetic adversarial test of the exact device topology, including attempted reverse injection.

## Required successor artifacts before any use

- a new pair-common protocol successor and fresh opaque handoffs if the topology changes;
- a provider/appliance-specific threat model and data-flow diagram;
- byte-pinned measurement-agent, verifier, policy, reference values, transport firmware/configuration, and result validator;
- a typed fail-closed validator that checks attestation signatures, trust anchors, nonce consumption, proof-source separation, and every current isolation-schema assertion;
- independent review of the exact final bytes and a P-3-free synthetic test report;
- a separate owner authorization for any account provisioning, purchase, networking, VM creation, role delivery, or role launch.

Until those artifacts exist and are separately approved, the current Hyper-V collector state remains `COLLECTOR_NOT_APPROVED`, any capability status remains `FAIL / NOT AUTHORIZED`, and P-11 remains `NOT_AUTHORIZED`.

## Basis

- The IETF RATS architecture distinguishes an Attester, a Verifier that appraises evidence, and a Relying Party that consumes the resulting attestation result: [RFC 9334](https://www.rfc-editor.org/rfc/rfc9334.html).
- Azure Attestation describes policy evaluation over TEE evidence and signed attestation tokens: [Microsoft Learn](https://learn.microsoft.com/en-us/azure/attestation/overview).
- AWS documents a Nitro Hypervisor-signed attestation document containing PCRs and a nonce: [AWS Nitro Enclaves](https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave-concepts.html).
- Google Cloud documents attestation proofs validated through public keys or PKI roots: [Google Cloud Attestation](https://docs.cloud.google.com/confidential-computing/docs/attestation?hl=en).

These sources establish available attestation concepts, not compliance of any future selected provider or topology with this draft.
