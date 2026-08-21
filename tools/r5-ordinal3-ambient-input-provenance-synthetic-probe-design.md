# P-3 R5 ordinal 3 — ambient input provenance synthetic-probe design (review-only draft)

Status: P-3-free workspace design only. This document does not amend `r5-ordinal3-os-isolation-proof-schema.json` and neither configures nor creates a sandbox, VM, role runtime, provider account, role delivery, role launch, implementation, return, measurement, gate, or P-11 change.

## Narrow conclusion

A fixed guest-side filesystem probe can establish a limited fact: a particular OS identity could not resolve or open a particular external path during the traced probe lifetime. It cannot establish that a Codex-like model received no ambient instruction, parent-session history, platform policy, tool definition, connector state, or control-plane input. Those inputs may be delivered without any guest file read.

Consequently, `role-home-external-path-reads = 0` is necessary local evidence but is not a clean-room proof. A strict claim about ambient context requires a separately attested, complete model-input/control-plane provenance record captured before the model consumes its first token. If the runtime/provider cannot enumerate and attest that surface, the result is `FAIL / unobservable`, not a weaker PASS.

This design also does not claim that a model has no learned knowledge, provider-side state, or inaccessible internal policy. It concerns only the provenance and delivery of runtime input/context and callable surfaces.

## Assertions that must remain separate

| Assertion | Minimum evidence | What it cannot establish |
| --- | --- | --- |
| Local external-path denial | Fixed non-model probe, host existence witness, OS syscall/namespace trace, mount/ACL/env/process evidence | No hidden prompt, session, tool policy, or provider-side input reached the model |
| Attachment payload set | Exact regular-file inventory and individual read-only access evidence | The model received no other instruction/context |
| Model-input provenance | Complete, pre-invocation control-plane source coverage captured by a protected, independently appraised agent | No learned/model-internal knowledge exists |
| No post-start control | Attested closure of every runtime input plane, including management/recovery/tool/network planes | Completeness of pre-start context unless the previous row also passes |

No record may use the phrase “four attachments only” without naming which assertion it means. A four-file attachment inventory is not evidence that the full model context contained four objects only.

## Required real-runtime evidence contract

A future real-runtime validator must accept an ambient-context PASS only when every item below is present, byte-pinned, and issued by a protected control-plane/measurement component outside the implementation identity.

### 1. Closed source-coverage manifest

Before runtime creation, the independently administered verifier creates a canonical, fixed-schema `sourceCoverageManifest`. It lists exactly one record for every input class that could influence the implementation identity or model invocation:

1. platform system/developer/global-agent instructions;
2. parent task, user message, launch request, and runtime bootstrap instructions;
3. resumed session, conversation, project, task, cache, and history state;
4. user, global, project, role-home, skill, plugin, and extension configuration;
5. tool, MCP, connector, browser, integration, model-endpoint, and policy definitions;
6. process argv, working directory, environment, credential/metadata, mount, ACL, filesystem, and device surfaces;
7. network, proxy, DNS, management API, console, boot/recovery, secret-injection, clipboard, redirection, and control channels; and
8. attachments and any separately allowed immutable runtime-base/runner inputs.

Each entry has only bounded, content-free fields in the evidence bundle:

```text
sourceClass                    fixed enum from the manifest
sourceInstanceOpaqueId         verifier-defined opaque identifier, not a locator
expectedDisposition            delivered | not-delivered | absent-by-design
canonicalDescriptorSha256      hash of verifier-retained canonical descriptor
originWitnessSha256            hash of a source-existence/origin witness
deliveryEvidenceSha256         hash of pre-invocation delivery or denial evidence
capturedBeforeModelStart       true
coverageOrdinal                unique contiguous integer
```

For a delivered source, the verifier-retained descriptor additionally records byte length and content hash. For a `not-delivered` source, it records a host/control-plane origin witness and a delivery-denial result, but neither raw text nor a host path is placed in a role-visible bundle. `unobservable`, `provider-asserted-only`, `partial`, `truncated`, or an unknown source class is invalid.

The manifest’s coverage set is verifier-owned. The runtime, coordinator, and implementation identity cannot add, remove, reorder, or mark an input class as absent. Any extra delivered frame, missing class, duplicate ordinal, or descriptor hash mismatch is `FAIL`.

### 2. Sealed invocation envelope and protected capture

The runtime needs a protected input-capture component that runs before the first model token and records a canonical hash of every delivered invocation frame: instructions, messages, tool definitions, attachment descriptors, configuration, session-resume material, and control-plane policy. The capture component must bind all of the following in one hardware-rooted or equivalently independently appraised signed statement:

```text
proofNonce
runtimeInstanceMeasurementSha256
runtimeConfigurationSha256
runnerAndAdapterSha256
sourceCoverageManifestSha256
sealedInvocationEnvelopeSha256
toolSurfaceManifestSha256
inputCaptureAgentSha256
captureStartedBeforeModelStart
noUncapturedFramesObserved
```

The signed statement must be verified against a trust anchor outside the coordinator’s administration. A guest log, model response, runner self-report, or coordinator-generated MAC is insufficient. The capture mechanism must be unable to be disabled, bypassed, or reconfigured by the implementation identity, including via a privileged guest process.

### 3. Invocation-to-termination closure

The same protected trace covers the full model/role lifetime. It records only fixed boolean/count/hash observations, not prompt contents, attachment bytes, host paths, role stdout, or arbitrary role-authored JSON. Required observations are:

```text
modelStartObserved
modelStopObserved
deliveredFrameCount
unexpectedFrameCount
sessionResumeCount
postStartInboundControlCount
unknownToolDefinitionCount
unknownToolInvocationCount
unknownNetworkEndpointCount
unknownFilesystemReadCount
traceCompleteness
```

Every unexpected/unlisted activity count must be zero, and `deliveredFrameCount` must exactly equal the manifest’s allowed delivered-frame count. `traceCompleteness` must be `complete`; missing telemetry cannot be encoded as zero. The final record binds the source coverage manifest, sealed invocation envelope, OS trace, tool-surface trace, and runtime measurement to the same nonce.

### 4. Local-surface guard contract

The local access trace must distinguish four permitted surface classes from all forbidden non-runtime data:

```text
runtime-base
exact-attachments
ephemeral-scratch
guard-dependencies
```

Every other class is `forbidden-nonruntime-data`; it is not a catch-all allowed class. The guarded trace records a fixed opaque target identifier, actor, sequence, surface class, and one of these operation values:

```text
read | resolve | list | stat | readlink | open | mmap | exec | child-spawn | connect
```

Any one of those operations on `forbidden-nonruntime-data` or an unknown/unlisted surface class is a failure, even if a later log claims denial. The guard must begin before model start, remain live through model stop, end only after the final guarded event, report no event gaps, and report zero unknown child processes. The implementation identity may not disable, replace, or route around it. This local-surface assertion remains distinct from model-input provenance.

### 5. Exact PASS rule

An ambient-input provenance PASS is possible only if all of the following are true:

- every source class is covered by the verifier-owned manifest and has valid pre-start evidence;
- every delivered frame is represented by the sealed invocation envelope and belongs to the allowed source set;
- every forbidden source has an independently collected non-delivery/denial record;
- capture starts before model invocation, remains protected through termination, and reports a complete trace;
- the local-surface guard covers the entire model lifetime, has no event gaps or unknown child, and observes no forbidden/unknown-class operation;
- local OS external-path probes and model/control-plane provenance both pass independently; and
- the verifier validates signatures, nonce freshness/one-time consumption, complete coverage, and exact byte pins.

The result must still state `P-11: NOT_AUTHORIZED` and must not authorize delivery, launch, implementation, export, apply, browser/Figma measurement, accessibility, motion, or gate work.

## Fail-closed conditions

The following are terminal failures for this assertion:

- the platform cannot enumerate a source class, raw invocation frame, tool policy, or resume source;
- a global instruction, system/developer message, plugin/skill/connector/MCP definition, parent context, or service-side policy is injected outside the protected capture;
- capture begins after any model-visible frame, is only a wrapper log, or can be modified by the implementation identity or coordinator;
- any source is merely declared absent without an origin/delivery witness;
- a network, management, recovery, console, metadata, tool, connector, or runtime control input can arrive after model start;
- OS path trace is incomplete, a forbidden path is visible, or an unlisted filesystem/network/tool access occurs;
- any evidence includes raw attachment bytes, raw prompts, role stdout, host locators, or role-authored arbitrary data; or
- a record derives PASS from a model answer, a canary not being repeated, a configuration flag, or an owner/role self-report.

## P-3-free synthetic test boundary

Before a real-runtime integration exists, a deterministic synthetic fixture may test only the future validator’s rejection logic. It uses invented paths, invented fixed-length canaries, an invented input-frame stream, and a non-model fixture process. It must not mount/read P-3 attachments, role homes, coordinator records, project material, site output, or conversation history.

The fixture creates a complete allowed source manifest and then verifies that the structural validator rejects, at minimum:

1. an added global-instruction frame;
2. an unlisted parent/session-resume frame;
3. a missing or late-started capture record;
4. a forbidden filesystem read or an incomplete OS trace;
5. an extra tool/MCP/connector definition or invocation;
6. a post-start inbound control event;
7. a duplicate/missing/reordered coverage record;
8. an `unobservable` or `provider-asserted-only` source state; and
9. an evidence record that changes `P-11` or asserts a real capability PASS.

Its only valid conclusion is: “the synthetic validator rejects the specified malformed fixtures.” It cannot validate Codex, Claude, Docker Sandboxes, Hyper-V, an external provider, or any clean-room runtime.

## Canary use is detection-only

A unique synthetic canary per prohibited source can make a positive leak observable when it appears in a captured frame, tool call, or model output. Nonappearance never proves nonvisibility: a model may ignore, transform, suppress, or not act on an observed canary. Canary silence must therefore be stored, if at all, as `diagnosticOnly: true` and must not contribute to a PASS predicate.

## Required successor work before any real use

1. Select a runtime/provider whose control plane exposes a complete, independently attestable pre-invocation source capture. A standard spawned Codex-like runtime with non-enumerable platform/global instructions cannot satisfy this draft.
2. Define a new byte-pinned typed validator, trusted capture agent, trust anchor, coverage manifest, and synthetic fixture suite; independently audit their exact bytes.
3. Demonstrate a P-3-free synthetic adversarial test of the selected topology, including attempted hidden instruction injection, session resumption, tool injection, and post-start control delivery.
4. Obtain separate owner authorization for any provider account, hardware, network, VM, sandbox, delivery, or role launch. This document supplies none.

## Required final statement

`ambient-input provenance synthetic design: no real runtime was tested; P-11 remains NOT_AUTHORIZED; no role launch or implementation action is authorized.`
