// P-3 R5 ordinal-3 pair recovery candidate: workspace-only, read-only dry-run.
// It never reads or writes role homes, runtime roots, worktrees, progress stores,
// packets, the predecessor terminal, or the predecessor lease.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, "..");
const DESIGN_PATH = resolve(HERE, "r5-baseline-reissue-3-candidate-design.json");

const EXPECTED = Object.freeze({
  schema: "p3-r5-pair-reissue-3-candidate-design/v2",
  pairId: "open-service-top-hero-v1-20260809",
  component: "open-service-top-hero",
  priorProtocol: "2cb05ebec90d7fefdf28cf51be8fb93e277e0bc7cec1a67ebcd458e1c686b342",
  priorBaselineHandoff: "f92bcaa29c39e52eb6d5044638b41101",
  priorCurrentHandoff: "b3f41c2108d65cf6c6ae7767b6e797d1",
  priorBaselineDelivery: "24574bae74a4d86df62c188237db228457dc2f91b3a052f8238487d813bfedf2",
  priorCurrentDelivery: "8450699e10cb18ad4068d72f657ef3c6e5c53a6c131629d0700fb528ad3de4c4",
  terminalId: "96f8b2a65957679bc8b58a0cff85915bc13c6e9205c2681803b490e996aae8fe",
  terminalRecord: "4fd1da910b09559e448d21c6e61d9b244011e6baab4183accdb9c9eb1f990920",
  terminalObservation: "ff5b16bce79e4454ad8c8b8d3e2abb47f493102fb99fef8a2a9624c2c8138213",
  leaseId: "c252cc94c12f3c565ac0d819d983f5e9cc1a1bee020721be53226615f21316f7",
  leaseRecord: "6e8f19d43ba081897d175f0735bc38086f7cd8b4bf6a043244c6d84933ea2f76",
  quarantinedArchive: "b9a96b6d68eb7282c65734971e40b8e7d30f8553a41f47cf2aad585695c70018",
  helper: "d9723895c308b3f87f27f7f8cd1e06409a4104ac4b2b5ba1e910d7630b36d2cc",
  helperE2E: "216cfdafb7221e2e5539c3581ebf82aeb7bc25ec3f7a2e1cec8d3fafaec8b74a",
  helperEvidence: "22584e4f6eea6454b318b1f57b4e76e97156845938879f098f97b83f35241e90",
  isolationProofSchema: "c17a30f3fd2b84c897635b0f0eb645e3633d3b19418d99c41a7cd8fb5d031403",
  capabilityProbePlan: "5a8fad287a9da97b62f428fa055b1892c9d577559c377283dccca766e35f4dd1",
  readBoundaryContract: "c874c8d60908168522935bbc82ffcf09bb9ac28663ba7911f9a6863f6d6873d7",
  readBoundaryTupleAllowlist: "6625915372c44f54693f06d93fe9b516b9ad375e59ff101f6caad46588e1bb57",
  readBoundaryRelease: "e59245a2b0974ea008c0396f738e1c0aaac60c50bb7ca177e8a7c5a4cb555112",
  readBoundaryValidator: "553529e63e660977c30cc29b049a9ccfe9c6cde47fa225d0c263ca5856af776f",
  readBoundaryValidatorE2E: "e7af9037e12c2a1c9ce73d7ca791d5f2439000b6fe3b64e96f3d9e6fa775d1f6",
  nonattachedOutputAmendment: "b7960c5509ea50ed27d18ad636f0f12c5c712444a84de0765068f416b27b28a0",
  nonattachedOutputOwnerAcceptance: "a35ccd16bd8a911879614f04807a6d17d745e3de0491a1ee71350cfba2077e8e",
  nonattachedOutputValidator: "87ff3f44ae9dbf5c735ccff4f239824600e9da2e0ea610b1f36fad731def6a23",
  nonattachedOutputValidatorE2E: "b665a18c995f8b868aa657995650739e974aea0deee94c673eea4e05679f5b53",
  zeroCostConstraintV1: "4160d9537cd5cb79ab66b0cf9c065a211a9314873417f356dbbc6300dd3dec03",
  zeroCostConstraintV2: "707c5535c1f04713e99951962be989e30d1d65a7a26300caca8d00e68d2906b4",
  zeroCostConstraintV3: "ba5b5200a572f49bad245b9d343f4983a0f994249eb1d2e6db89a0586fc35b18",
  externalVerifierBoundaryRequirements: "f3a0ea86270038e62278f97f6d2fa4f75b6c85fb103052a16ae56571877688b3",
  externalBoundaryOwnerDecisionTemplate: "b7ac0c19c4669a4695e760860552058fc2967ddbe9d5766b4df86af7059029f6",
  zeroCostFeasibility: "22d50e6e3f38a39aa99c01a9c5258af0b06ef4ff73f7915b43dc1e5fad38a45c",
  zeroCostLocalInventory: "f6641a3de0bbb6d6fa5a0519b6b34b5e5984942369a481f2e49287b03e7e049c"
});

const EXPECTED_GUEST_TOPOLOGY = Object.freeze({
  schema: "p3-role-guest-topology/v1",
  attachmentRoot: "/p3/attachments",
  attachmentAccess: "read-only",
  requiredAttachmentRelativePaths: [
    "input/assignment.json",
    "input/references/pc-first-view.png",
    "input/references/sp-first-view.png",
    "return-authority.json"
  ],
  scratchRoot: "/p3/scratch",
  scratchWorkRoot: "/p3/scratch/work",
  scratchSubmissionPath: "/p3/scratch/return.ustar.tar",
  scratchPersistence: "ephemeral-not-host-backed-destroyed-with-runtime",
  persistentOutputRoot: "/p3/output",
  persistentOutputArchivePath: "/p3/output/return.ustar.tar",
  implementationIdentityPersistentOutputAccess: "none",
  persistentOutputAllowlist: ["return.ustar.tar"],
  fixedExporter: {
    required: true,
    implementationIdentityMayInvoke: false,
    sourcePath: "/p3/scratch/return.ustar.tar",
    destinationPath: "/p3/output/return.ustar.tar",
    destinationWritePolicy: "single-fixed-name-atomic-create-only-when-empty",
    mustValidateBeforeExport: true,
    mustRejectAdditionalPersistentFiles: true
  },
  hostPathsExposedToImplementationIdentity: false,
  attachmentInventoryBinding: "sealed-per-delivery-outside-pair-common-protocol",
  runnerInstructionBinding: "byte-pinned-before-final-publication"
});

const EXPECTED_SCOPE = "P-3 R5 pair-wide baseline/current open-service-top-hero sequence-1 attempt-1 recovery reissue-3 candidate only";

const EXPECTED_AUTHORITY_BOUNDARY = Object.freeze({
  candidateIsNotAnExternalRecord: true,
  candidateIsNotRoleDeliveryAuthority: true,
  candidateIsNotRoleLaunchAuthority: true,
  futureFinalRecordMayAuthorizeAttachmentOnlyDeliveryOnlyAfterExternalOsIsolationProof: true,
  futureFinalRecordMayAuthorizeRoleLaunchOnlyAfterExternalOsIsolationProof: true,
  roleLaunchEligibility: "pending a separately recorded external OS-isolation proof and fresh pre-launch checks for the relevant condition",
  prohibitedNow: [
    "external publication",
    "provider selection",
    "external account access",
    "purchase or subscription",
    "networking change",
    "physical device deployment",
    "VM or sandbox creation",
    "runtime provisioning",
    "role delivery",
    "role launch",
    "implementation",
    "return check or apply",
    "site or lifecycle mutation",
    "browser or Figma measurement",
    "P-11 mutation"
  ]
});

const EXPECTED_PAIR_COMMON_PROTOCOL_SUCCESSOR = Object.freeze({
  schema: "p3-role-handoff-protocol/v4",
  required: true,
  predecessorSha256: EXPECTED.priorProtocol,
  byteIdentityRequirement: "The same canonical protocol bytes and SHA-256 must be bound by both baseline and current ordinal-3 deliveries. The protocol payload contains no condition, opaque handoff, role-home, progress-store, or worktree field.",
  deliveryMode: "attachment-only",
  executionState: false,
  ownerApproved: false,
  guestTopology: EXPECTED_GUEST_TOPOLOGY,
  futurePublicationRequirement: "A later append-only publication must independently prove all fresh destinations, preserve the predecessor terminal and lease hashes, pin this exact protocol hash, pin a fixed exporter and runner, and leave delivery and launch disabled until the isolation gate passes."
});

const EXPECTED_FIXED_EXPORTER_REQUIREMENT = Object.freeze({
  status: "required-but-not-selected-candidate-blocks-publication",
  mustRunAs: "coordinator-controlled identity distinct from the implementation identity",
  mustBeBytePinnedBeforeFinalPublication: true,
  requiredFutureReleaseFields: [
    "exporterBinarySha256",
    "exporterInvocationSha256",
    "exporterConfigurationSha256",
    "exporterUidAndAclEvidenceSha256",
    "archiveValidationPolicySha256"
  ],
  mustReadOnly: ["/p3/scratch/return.ustar.tar"],
  mayWriteOnly: ["/p3/output/return.ustar.tar"],
  mustReject: [
    "direct implementation-identity writes to persistent output",
    "output that is nonempty before export",
    "additional persistent output paths",
    "invalid or non-USTAR archive bytes"
  ],
  publicationEligibility: "false until the exact exporter binary, invocation, configuration, UID/ACL boundary, and validation policy are separately byte-pinned and independently verified"
});

const EXPECTED_MINIMUM_MACHINE_EVIDENCE = Object.freeze([
  "each fresh attachment staging root contains exactly the four declared regular attachment files before launch",
  "each fresh output role home is empty before launch and contains no attachment",
  "the implementation identity receives the attachment staging root read-only, an ephemeral scratch filesystem, and no persistent-output read or write capability",
  "the implementation identity has no readable path outside the declared runtime base, attachment staging root, and ephemeral scratch filesystem",
  "the implementation identity exposes no filesystem, Git, network, browser, MCP, connector, plugin, or project-history route beyond the declared runtime base and attachments",
  "a separately pinned fixed exporter is the only identity allowed to persist /p3/scratch/return.ustar.tar as /p3/output/return.ustar.tar",
  "the exporter rejects every additional persistent output and the verifier proves scratch destruction after runtime termination"
]);

const EXPECTED_FUTURE_ISOLATION_GATE = Object.freeze({
  externalOsIsolatedRuntimeRequired: true,
  localNestedCodexRuntimeProhibited: true,
  requiredBeforeExternalPublication: true,
  requiredBeforeRoleDelivery: true,
  requiredBeforeRoleLaunch: true,
  mustBeRecordedSeparately: true,
  runtimeImplementation: "not selected by this candidate; a later proof must identify the external OS-isolated runtime and its enforced boundary",
  minimumMachineEvidence: EXPECTED_MINIMUM_MACHINE_EVIDENCE,
  ownerAttestationMaySupplementButNotReplaceMachineEvidence: true,
  p11State: "unchanged; P-11 remains outside this candidate scope"
});

const EXPECTED_NO_REUSE_POLICY = Object.freeze({
  failedAttemptTerminalAndLease: "immutable forensic predecessors only",
  failedBaselineRoleHome: "never reused as a role home, packet source, archive source, or implementation source",
  previousCurrentDelivery: "immutable and superseded for protocol compatibility; not contaminated; never reused as a role home or peer input",
  quarantinedArchive: "never used as a role input, archive candidate, apply input, or implementation source"
});

const EXPECTED_DERIVED_IDENTIFIERS = Object.freeze({
  identitySeedSha256: "65983215efc2cb0d24ace6f5bb57d9e9e442323ae7af1123a1ced09aa2087e02",
  baselineOpaqueHandoffId: "27f8395d41ff465d058d51ed0caf32b0",
  currentOpaqueHandoffId: "992fe486b022ec24dde7e5a25fdd7e38",
  pairRuntimeActivationId: "b145d6cb768ba2fbf4efadc395aa3787d3b217cfd5824462466e89bed2e37dbc",
  helperReleaseId: "22c3289fafbec24de5747a4361f6b77dc2dac365ac7380f9b5ec90b20bff769f",
  pairCommonProtocolSha256: "6154d3c3c1854e46f9949031354f7a44d8084b8326ea6a7fd9ddef22bb935b33"
});

const EXPECTED_ONE_TIME_RECOVERY_EXCEPTION = Object.freeze({
  ownerApproved: true,
  approvalEvidence: {
    kind: "user-message",
    content: "承認",
    contentSha256: "not-available"
  },
  scope: "Only this pair-wide ordinal-3 recovery may create fresh sequence-1 / attempt-1 role contexts after the baseline ordinal-2 launch terminal consumed its attempt.",
  automaticRetry: false,
  doesNotReopenOrModifyPriorAttempt: true,
  doesNotReusePriorRoleHomesOrOutputs: true,
  doesNotAuthorizePublicationDeliveryOrLaunchBeforeExternalOsIsolationProof: true,
  doesNotAuthorizeImplementationApplyMeasurementOrP11: true
});

const EXPECTED_SOURCE_BINDINGS = Object.freeze({
  previousPairCommonProtocolSha256: EXPECTED.priorProtocol,
  previousBaseline: {
    opaqueHandoffId: EXPECTED.priorBaselineHandoff,
    runtimeActivationId: "bb3077e21473ce4664e353cadc8e4fda44df87da6be9bf3839f4af818ab42165",
    deliveryReceiptSha256: EXPECTED.priorBaselineDelivery,
    roleHome: "C:/Users/tane1/AppData/Local/p3-role-homes/a-impl-r4-reissue-2-f92bcaa29c39e52eb6d5044638b41101",
    state: "immutable-predecessor-not-reused"
  },
  previousCurrent: {
    opaqueHandoffId: EXPECTED.priorCurrentHandoff,
    runtimeActivationId: "f06ba96a83153efac0d2b0e8f7e00a5548d747a36fccabf75787a05273d66375",
    deliveryReceiptSha256: EXPECTED.priorCurrentDelivery,
    roleHome: "C:/Users/tane1/AppData/Local/p3-role-homes/b-impl-r4-reissue-2-b3f41c2108d65cf6c6ae7767b6e797d1",
    state: "immutable-superseded-for-protocol-compatibility",
    contaminationClassification: "not-contaminated",
    supersessionReason: "Ordinal-3 requires a new pair-common protocol that is byte-identical for baseline and current."
  },
  failedBaselineAttempt: {
    terminalRecordId: EXPECTED.terminalId,
    terminalRoot: "C:/Users/tane1/AppData/Local/p3-coordinator-records/open-service-top-hero-v1-20260809/r5-baseline-seq1-launch-terminal/v1/96f8b2a65957679bc8b58a0cff85915bc13c6e9205c2681803b490e996aae8fe",
    terminalRecord: {
      path: "baseline-seq1-launch-terminal.json",
      sha256: EXPECTED.terminalRecord
    },
    observation: {
      path: "baseline-seq1-launch-observation.json",
      sha256: EXPECTED.terminalObservation
    },
    lease: {
      recordId: EXPECTED.leaseId,
      root: "C:/Users/tane1/AppData/Local/p3-coordinator-records/open-service-top-hero-v1-20260809/r5-pair-live-lease/v1/c252cc94c12f3c565ac0d819d983f5e9cc1a1bee020721be53226615f21316f7",
      path: "baseline-seq1-live-lease.json",
      sha256: EXPECTED.leaseRecord
    },
    immutable: true,
    attemptConsumed: true,
    failureFacts: [
      "attachment-only boundary breach",
      "no return.ustar.tar produced"
    ],
    mayBeReused: false,
    mayBeModified: false
  },
  quarantinedDelivery1Archive: {
    sha256: EXPECTED.quarantinedArchive,
    roleHome: "C:/Users/tane1/AppData/Local/p3-role-homes/a-impl",
    disposition: "quarantined",
    applicationState: "not-applied",
    mayBeRoleInput: false,
    mayBeApplied: false,
    mayBeCopiedIntoNewPacket: false,
    mayBeUsedForImplementation: false
  }
});

const EXPECTED_IDENTITY_DERIVATION = Object.freeze({
  algorithm: "sha256-canonical-json-v1",
  domain: "p3-r5-pair-reissue-3",
  inputFields: [
    "pairIdentity",
    "sourceBindings.previousPairCommonProtocolSha256",
    "sourceBindings.previousBaseline.opaqueHandoffId",
    "sourceBindings.previousCurrent.opaqueHandoffId",
    "sourceBindings.failedBaselineAttempt terminal/observation/lease hashes",
    "bytePinnedHelperRelease",
    "oneTimeRecoveryException scope",
    "pairCommonRuntimeProtocolSuccessor.guestTopology",
    "topologyEvidenceSpecifications",
    "fixedExporterRequirement",
    "freshDestinationPolicy",
    "futureIsolationGate"
  ],
  expectedDerivedIdentifiers: EXPECTED_DERIVED_IDENTIFIERS
});

const EXPECTED_DESIGN_KEYS = Object.freeze([
  "authorityBoundary",
  "bytePinnedHelperRelease",
  "execution",
  "fixedExporterRequirement",
  "freshDestinationPolicy",
  "futureIsolationGate",
  "identityDerivation",
  "noReusePolicy",
  "oneTimeRecoveryException",
  "pairCommonRuntimeProtocolSuccessor",
  "pairIdentity",
  "recordState",
  "schema",
  "scope",
  "sourceBindings",
  "topologyEvidenceSpecifications"
]);

const EXPECTED_TOPOLOGY_EVIDENCE_KEYS = Object.freeze([
  "ambientInputReadBoundaryGuard",
  "bindingRule",
  "nonattachedPersistentOutputEvidence",
  "osIsolationProofSchema",
  "ownerZeroCostConstraint",
  "readonlyCapabilityProbePlan"
]);

const READ_BOUNDARY_NON_AUTHORIZING_RESULT = Object.freeze({
  fixedResult: "SYNTHETIC_ONLY__NO_REAL_RUNTIME_OR_P11_AUTHORIZATION",
  capabilityProbePass: false,
  p11Authorization: "NOT_AUTHORIZED",
  roleDeliveryAuthorized: false,
  roleLaunchAuthorized: false,
  implementationAuthorized: false,
  returnCheckAuthorized: false,
  returnApplyAuthorized: false,
  measurementAuthorized: false,
  accessibilityAuthorized: false,
  motionAuthorized: false,
  gateAuthorized: false,
  reissuePublicationAuthorized: false,
  siteLifecycleMutationAuthorized: false,
  providerOrRuntimeProvisioningAuthorized: false
});

const EXPECTED_READ_BOUNDARY_RELEASE_SOURCES = Object.freeze([
  { fileName: "r5-ordinal3-role-read-boundary-guard-contract.json", sha256: EXPECTED.readBoundaryContract },
  { fileName: "r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist.json", sha256: EXPECTED.readBoundaryTupleAllowlist },
  { fileName: "r5-ordinal3-ambient-input-provenance-synthetic-probe-design.md", sha256: "14b2e343ed3652704f6b14a6be8f68648098fdb5f851e6775b6d48c61f12f6ad" },
  { fileName: "r5-ordinal3-os-isolation-proof-schema.json", sha256: EXPECTED.isolationProofSchema },
  { fileName: "r5-ordinal3-ambient-input-provenance-synthetic-validator.mjs", sha256: EXPECTED.readBoundaryValidator },
  { fileName: "r5-ordinal3-ambient-input-provenance-synthetic-validator.e2e.mjs", sha256: EXPECTED.readBoundaryValidatorE2E }
]);

const EXPECTED_READ_BOUNDARY_GUARD = Object.freeze({
  contract: {
    workspacePath: "tools/r5-ordinal3-role-read-boundary-guard-contract.json",
    sha256: EXPECTED.readBoundaryContract
  },
  syntheticTupleAllowlist: {
    workspacePath: "tools/r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist.json",
    sha256: EXPECTED.readBoundaryTupleAllowlist
  },
  release: {
    workspacePath: "tools/r5-ordinal3-role-read-boundary-guard-contract-release-draft.json",
    sha256: EXPECTED.readBoundaryRelease
  },
  futureRuntimeEvidenceRule: "A final append-only publication must bind separately captured, runtime-specific evidence conforming to the pinned contract; the review-only contract, release, synthetic tuple allowlist, synthetic validator, and synthetic validator result are not external OS-isolation proof, P-11 authorization, or authority for publication, delivery, or launch. A real runtime must use a newly sealed runtime-specific tuple allowlist; this synthetic tuple allowlist must not be copied into a runtime."
});

const NONATTACHED_OUTPUT_DOES_NOT_AUTHORIZE = Object.freeze([
  "reissue publication",
  "role delivery",
  "role launch",
  "implementation",
  "return check",
  "return apply",
  "site or lifecycle mutation",
  "browser or Figma measurement",
  "P-11 change"
]);

const NONATTACHED_OUTPUT_ACCEPTED_SCOPE = Object.freeze({
  nonattachedPersistentOutputEvidenceSemantics: true,
  p3FreeHyperVCapabilityProbePreparation: true,
  schemaReplacementAuthorized: false,
  typedValidatorStillRequiredForPass: true,
  separateRuntimeAndNonceStillRequired: true
});

const EXPECTED_NONATTACHED_OUTPUT_EVIDENCE = Object.freeze({
  amendment: {
    workspacePath: "tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json",
    sha256: EXPECTED.nonattachedOutputAmendment
  },
  ownerAcceptance: {
    workspacePath: "tools/r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance.json",
    sha256: EXPECTED.nonattachedOutputOwnerAcceptance
  },
  syntheticValidator: {
    workspacePath: "tools/r5-ordinal3-nonattached-output-evidence-validator.mjs",
    sha256: EXPECTED.nonattachedOutputValidator
  },
  syntheticValidatorE2E: {
    workspacePath: "tools/r5-ordinal3-nonattached-output-evidence-validator.e2e.mjs",
    sha256: EXPECTED.nonattachedOutputValidatorE2E
  },
  futureRuntimeEvidenceRule: "The finalized owner acceptance recognizes only P-3-free capability-probe preparation. The amendment remains non-effective and no schema replacement, external OS-isolation proof, P-11 authorization, reissue publication, delivery, launch, implementation, return, measurement, or runtime provisioning is authorized. A final record needs a separately selected runtime, fresh nonce, externally independent verifier evidence, and an independently approved successor validator."
});

const ZERO_COST_DOES_NOT_AUTHORIZE = Object.freeze([
  "provider selection",
  "external account access",
  "purchase or subscription",
  "networking change",
  "physical device deployment",
  "VM or sandbox creation",
  "P-3 role delivery or launch",
  "implementation or return handling",
  "P-11 change"
]);

const ZERO_COST_CURRENT_BINDINGS = Object.freeze([
  { path: "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md", sha256: EXPECTED.externalVerifierBoundaryRequirements },
  { path: "tools/r5-ordinal3-external-boundary-owner-decision-template.json", sha256: EXPECTED.externalBoundaryOwnerDecisionTemplate },
  { path: "tools/r5-ordinal3-zero-cost-external-boundary-feasibility.md", sha256: EXPECTED.zeroCostFeasibility },
  { path: "tools/r5-ordinal3-zero-cost-local-hardware-inventory.md", sha256: EXPECTED.zeroCostLocalInventory }
]);

const ZERO_COST_INTERPRETATION = Object.freeze({
  noScreenedOrConcretelyIdentifiedLocalOptionMeetsStrictBoundaryAtZeroYen: true,
  doesNotClaimAbsenceOfUnenumeratedOrExternallyAdministeredHardware: true,
  doesNotSelectProviderOrDevice: true,
  requiresSeparateOwnerDecisionBeforeChangingAnyCostOrBoundaryConstraint: true
});

const EXPECTED_OWNER_ZERO_COST_CONSTRAINT = Object.freeze({
  constraintRecord: {
    workspacePath: "tools/r5-ordinal3-owner-zero-cost-constraint-v3.json",
    sha256: EXPECTED.zeroCostConstraintV3
  },
  futureRuntimeEvidenceRule: "The current constraint limits incremental spend to JPY 0; no provider, device, account, or runtime is selected or authorized. Changing either the cost cap or the external-boundary constraint requires a separate owner decision. This binding does not authorize provisioning, publication, delivery, launch, implementation, return, measurement, or P-11."
});

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assertPinnedSha256(bytes, expected, label) { assert(sha256(bytes) === expected, `${label} byte pin changed.`); }
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function canonicalBytes(value) { return Buffer.from(canonical(value), "utf8"); }
function exact(actual, expected, label) { assert(canonical(actual) === canonical(expected), `${label} changed.`); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, expected, label) {
  assert(isPlainObject(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has unsupported or missing keys.`);
}
function assertHex(value, length, label) { assert(typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value), `${label} is not lowercase ${length}-hex.`); }
function nativeRealpath(path) { return realpathSync.native ? realpathSync.native(path) : realpathSync(path); }
function isWithin(parent, child) {
  const route = relative(parent, child);
  return route === "" || (!route.startsWith("..") && !route.includes(":"));
}
function assertNoLinkComponents(path, label) {
  const root = resolve(WORKSPACE_ROOT);
  const target = resolve(path);
  const route = relative(root, target);
  assert(route && isWithin(root, target), `${label} escapes the workspace.`);
  try {
    const rootStatus = lstatSync(root);
    assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), `${label} workspace root is not a non-link directory.`);
    let current = root;
    for (const segment of route.split(/[\\/]+/)) {
      if (!segment) continue;
      current = resolve(current, segment);
      const status = lstatSync(current);
      assert(!status.isSymbolicLink(), `${label} contains a symbolic link or junction.`);
    }
    const rootReal = nativeRealpath(root);
    const targetReal = nativeRealpath(target);
    assert(isWithin(rootReal, targetReal) && rootReal !== targetReal, `${label} resolves outside the workspace.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    fail(`${label} has a missing or unreadable path component.`);
  }
}
function readRegular(path, label) {
  assertNoLinkComponents(path, label);
  const lstat = lstatSync(path);
  assert(lstat.isFile() && !lstat.isSymbolicLink(), `${label} is not a regular non-link file.`);
  const stat = statSync(path);
  assert(
    typeof stat.nlink === "number"
      && Number.isInteger(stat.nlink)
      && stat.nlink >= 1,
    `${label} hard-link count is unobservable.`,
  );
  assert(stat.nlink === 1, `${label} is hard-linked.`);
  return readFileSync(path);
}
function isJsonWhitespace(character) { return character === " " || character === "\n" || character === "\r" || character === "\t"; }
function assertNoDuplicateJsonKeys(text, label) {
  let index = 0;
  const skipWhitespace = () => { while (index < text.length && isJsonWhitespace(text[index])) index += 1; };
  const expect = (character, message) => { assert(text[index] === character, `${label} ${message}`); index += 1; };
  const parseString = () => {
    assert(text[index] === "\"", `${label} contains an invalid JSON string.`);
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "\"") {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); }
        catch (error) { fail(`${label} contains an invalid JSON string: ${error.message}`); }
      }
      if (character === "\\") {
        index += 1;
        assert(index < text.length, `${label} contains an unterminated JSON escape.`);
        const escape = text[index];
        assert('"\\/bfnrtu'.includes(escape), `${label} contains an invalid JSON escape.`);
        if (escape === "u") {
          assert(index + 4 < text.length, `${label} contains a truncated JSON unicode escape.`);
          for (let offset = 1; offset <= 4; offset += 1) assert(/[0-9a-fA-F]/.test(text[index + offset]), `${label} contains an invalid JSON unicode escape.`);
          index += 5;
        } else index += 1;
        continue;
      }
      assert(character.charCodeAt(0) >= 0x20, `${label} contains an unescaped control character.`);
      index += 1;
    }
    fail(`${label} contains an unterminated JSON string.`);
  };
  const parseValue = () => {
    skipWhitespace();
    const character = text[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") { index += 1; return; }
      while (true) {
        skipWhitespace();
        const key = parseString();
        assert(!keys.has(key), `${label} contains a duplicate JSON key: ${key}.`);
        keys.add(key);
        skipWhitespace();
        expect(":", "contains an object key without a colon.");
        parseValue();
        skipWhitespace();
        if (text[index] === "}") { index += 1; return; }
        expect(",", "contains an object member without a comma.");
      }
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") { index += 1; return; }
      while (true) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") { index += 1; return; }
        expect(",", "contains an array member without a comma.");
      }
    }
    if (character === "\"") { parseString(); return; }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) { index += literal.length; return; }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    assert(number !== null, `${label} contains an invalid JSON value.`);
    index += number[0].length;
  };
  parseValue();
  skipWhitespace();
  assert(index === text.length, `${label} contains trailing JSON data.`);
}
function parseCanonicalJsonBytes(bytes, label) {
  assert(Buffer.isBuffer(bytes), `${label} must be read as bytes.`);
  assert(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM.`);
  assert(!bytes.includes(0), `${label} must not contain a NUL byte.`);
  const text = bytes.toString("utf8");
  assert(Buffer.from(text, "utf8").equals(bytes), `${label} is not valid UTF-8.`);
  assertNoDuplicateJsonKeys(text, label);
  let value;
  try { value = JSON.parse(text); }
  catch (error) { fail(`${label} must be valid JSON: ${error.message}`); }
  assert(`${JSON.stringify(value, null, 2)}\n` === text, `${label} must use canonical UTF-8 JSON.`);
  return value;
}
function readJson(path, label) {
  return parseCanonicalJsonBytes(readRegular(path, label), label);
}
function posix(path) { return path.replaceAll("\\", "/"); }
function workspacePath(logicalPath, label) {
  assert(typeof logicalPath === "string" && logicalPath.length > 0 && !logicalPath.includes("\\") && !logicalPath.startsWith("/") && !logicalPath.includes(":"), `${label} must be workspace-relative POSIX.`);
  const resolved = resolve(WORKSPACE_ROOT, logicalPath);
  const route = relative(WORKSPACE_ROOT, resolved);
  assert(route && !route.startsWith("..") && !route.includes(":"), `${label} escapes the workspace.`);
  return resolved;
}

function assertReadBoundaryGuard(specification) {
  exact(specification?.ambientInputReadBoundaryGuard, EXPECTED_READ_BOUNDARY_GUARD, "ambient input read-boundary guard pin");
  for (const [label, pin] of [
    ["read-boundary contract", specification.ambientInputReadBoundaryGuard.contract],
    ["read-boundary synthetic tuple allowlist", specification.ambientInputReadBoundaryGuard.syntheticTupleAllowlist],
    ["read-boundary release", specification.ambientInputReadBoundaryGuard.release]
  ]) {
    assert(sha256(readRegular(workspacePath(pin.workspacePath, `${label} path`), label)) === pin.sha256, `${label} byte pin changed.`);
  }
  const contract = readJson(workspacePath(specification.ambientInputReadBoundaryGuard.contract.workspacePath, "read-boundary contract path"), "read-boundary contract");
  assert(contract.recordState === "review-only" && contract.effective === false && contract.scope?.workspaceOnly === true && contract.scope?.p3Free === true && contract.scope?.syntheticOnly === true, "read-boundary contract is no longer a workspace-only synthetic review.");
  exact(contract.nonAuthorizingResult, READ_BOUNDARY_NON_AUTHORIZING_RESULT, "read-boundary contract non-authorizing result");
  const tupleAllowlist = readJson(workspacePath(specification.ambientInputReadBoundaryGuard.syntheticTupleAllowlist.workspacePath, "read-boundary tuple allowlist path"), "read-boundary synthetic tuple allowlist");
  assert(tupleAllowlist.recordState === "review-only" && tupleAllowlist.effective === false && tupleAllowlist.syntheticOnly === true, "read-boundary synthetic tuple allowlist is not review-only synthetic data.");
  const release = readJson(workspacePath(specification.ambientInputReadBoundaryGuard.release.workspacePath, "read-boundary release path"), "read-boundary release");
  assert(release.recordState === "review-only" && release.effective === false && release.syntheticOnly === true && release.scope?.workspaceOnly === true && release.scope?.p3Free === true, "read-boundary release is no longer workspace-only synthetic review data.");
  exact(release.nonAuthorizingResult, READ_BOUNDARY_NON_AUTHORIZING_RESULT, "read-boundary release non-authorizing result");
  exact(release.sourceFiles, EXPECTED_READ_BOUNDARY_RELEASE_SOURCES, "read-boundary release source set");
  for (const source of release.sourceFiles) {
    assert(typeof source.fileName === "string" && source.fileName === source.fileName.split(/[\\/]/).at(-1), "read-boundary release source file name is not a plain file name.");
    const sourcePath = workspacePath(`tools/${source.fileName}`, `read-boundary release source ${source.fileName}`);
    assert(sha256(readRegular(sourcePath, `read-boundary release source ${source.fileName}`)) === source.sha256, `read-boundary release source ${source.fileName} byte pin changed.`);
  }
}

function assertNonattachedPersistentOutputEvidence(specification) {
  exact(specification?.nonattachedPersistentOutputEvidence, EXPECTED_NONATTACHED_OUTPUT_EVIDENCE, "nonattached persistent-output evidence pin");
  for (const [label, pin] of [
    ["nonattached output amendment", specification.nonattachedPersistentOutputEvidence.amendment],
    ["nonattached output owner acceptance", specification.nonattachedPersistentOutputEvidence.ownerAcceptance],
    ["nonattached output synthetic validator", specification.nonattachedPersistentOutputEvidence.syntheticValidator],
    ["nonattached output synthetic validator E2E", specification.nonattachedPersistentOutputEvidence.syntheticValidatorE2E]
  ]) {
    assert(sha256(readRegular(workspacePath(pin.workspacePath, `${label} path`), label)) === pin.sha256, `${label} byte pin changed.`);
  }
  const amendment = readJson(workspacePath(specification.nonattachedPersistentOutputEvidence.amendment.workspacePath, "nonattached output amendment path"), "nonattached output amendment");
  assert(amendment.status === "owner-review-only-draft" && amendment.effective === false, "nonattached output amendment is no longer a non-effective owner-review draft.");
  assert(amendment.noAuthority?.doesNotModifyTargetSchema === true && amendment.noAuthority?.doesNotCreateEvidenceRecord === true && amendment.noAuthority?.p11Authorization === "NOT_AUTHORIZED", "nonattached output amendment expands authority.");
  exact(amendment.noAuthority.doesNotAuthorize, NONATTACHED_OUTPUT_DOES_NOT_AUTHORIZE, "nonattached output amendment no-authority set");
  const acceptance = readJson(workspacePath(specification.nonattachedPersistentOutputEvidence.ownerAcceptance.workspacePath, "nonattached output owner acceptance path"), "nonattached output owner acceptance");
  assert(acceptance.recordState === "finalized" && acceptance.ownerApproved === true && acceptance.p11Authorization === "NOT_AUTHORIZED", "nonattached output owner acceptance is not finalized, approved, and P-11-not-authorized.");
  exact(acceptance.acceptedDraft, { path: specification.nonattachedPersistentOutputEvidence.amendment.workspacePath, sha256: EXPECTED.nonattachedOutputAmendment }, "nonattached output accepted amendment pin");
  exact(acceptance.acceptedScope, NONATTACHED_OUTPUT_ACCEPTED_SCOPE, "nonattached output accepted scope");
  exact(acceptance.doesNotAuthorize, NONATTACHED_OUTPUT_DOES_NOT_AUTHORIZE, "nonattached output owner acceptance no-authority set");
}

function assertOwnerZeroCostConstraint(specification) {
  exact(specification?.ownerZeroCostConstraint, EXPECTED_OWNER_ZERO_COST_CONSTRAINT, "owner zero-cost constraint pin");
  const recordPath = workspacePath(specification.ownerZeroCostConstraint.constraintRecord.workspacePath, "owner zero-cost constraint path");
  const recordBytes = readRegular(recordPath, "owner zero-cost constraint");
  assertPinnedSha256(recordBytes, EXPECTED.zeroCostConstraintV3, "owner zero-cost constraint");
  const v3 = parseCanonicalJsonBytes(recordBytes, "owner zero-cost constraint");
  assert(v3.version === 3 && v3.kind === "p3-r5-ordinal3-owner-zero-cost-constraint-supplement" && v3.recordState === "finalized-owner-constraint-only" && v3.appendOnly === true && v3.effectiveForSelection === false, "owner zero-cost v3 record state changed.");
  exact(v3.supersedesByReferenceOnly, {
    path: "tools/r5-ordinal3-owner-zero-cost-constraint-v2.json",
    sha256: EXPECTED.zeroCostConstraintV2,
    predecessorRecordRemainsImmutable: true
  }, "owner zero-cost v3 predecessor pin");
  exact(v3.source, { kind: "direct-owner-conversation", contentHash: "not-available", machineVerified: false, receivedAtDate: "2026-08-15" }, "owner zero-cost v3 source boundary");
  exact(v3.correction, {
    kind: "append-only-current-source-pin-coherence-correction",
    correctedBindingPath: "tools/r5-ordinal3-external-boundary-owner-decision-template.json",
    predecessorDeclaredSha256: "fdc8c45b6c81f4fe914ee554532ee7a032fe07ac08ffb9e8350862f31686cbe4",
    currentSha256: EXPECTED.externalBoundaryOwnerDecisionTemplate,
    doesNotAlterCostCapOrAuthorizeSelection: true
  }, "owner zero-cost v3 correction boundary");
  exact(v3.constraint, { currency: "JPY", maximumIncrementalSpend: 0, continuesOriginalConstraint: true }, "owner zero-cost v3 constraint");
  exact(v3.bindings, ZERO_COST_CURRENT_BINDINGS, "owner zero-cost v3 current source set");
  for (const source of v3.bindings) {
    assert(sha256(readRegular(workspacePath(source.path, `owner zero-cost source ${source.path}`), `owner zero-cost source ${source.path}`)) === source.sha256, `owner zero-cost source ${source.path} byte pin changed.`);
  }
  exact(v3.interpretation, ZERO_COST_INTERPRETATION, "owner zero-cost v3 interpretation");
  exact(v3.doesNotAuthorize, ZERO_COST_DOES_NOT_AUTHORIZE, "owner zero-cost v3 no-authority set");
  assert(v3.p11Authorization === "NOT_AUTHORIZED", "owner zero-cost v3 changes P-11 authorization.");

  const v2Path = workspacePath(v3.supersedesByReferenceOnly.path, "owner zero-cost v2 path");
  assert(sha256(readRegular(v2Path, "owner zero-cost v2")) === EXPECTED.zeroCostConstraintV2, "owner zero-cost v2 historical byte pin changed.");
  const v2 = readJson(v2Path, "owner zero-cost v2");
  assert(v2.version === 2 && v2.kind === "p3-r5-ordinal3-owner-zero-cost-constraint-supplement" && v2.recordState === "finalized-owner-constraint-only" && v2.appendOnly === true && v2.effectiveForSelection === false, "owner zero-cost v2 historical state changed.");
  exact(v2.constraint, { currency: "JPY", maximumIncrementalSpend: 0, continuesOriginalConstraint: true }, "owner zero-cost v2 constraint lineage");
  exact(v2.supersedesByReferenceOnly, {
    path: "tools/r5-ordinal3-owner-zero-cost-constraint.json",
    sha256: EXPECTED.zeroCostConstraintV1,
    originalRecordRemainsImmutable: true
  }, "owner zero-cost v2 predecessor pin");
  exact(v2.doesNotAuthorize, ZERO_COST_DOES_NOT_AUTHORIZE, "owner zero-cost v2 no-authority lineage");
  assert(v2.p11Authorization === "NOT_AUTHORIZED", "owner zero-cost v2 changes P-11 authorization.");

  const v1Path = workspacePath(v2.supersedesByReferenceOnly.path, "owner zero-cost v1 path");
  assert(sha256(readRegular(v1Path, "owner zero-cost v1")) === EXPECTED.zeroCostConstraintV1, "owner zero-cost v1 historical byte pin changed.");
  const v1 = readJson(v1Path, "owner zero-cost v1");
  assert(v1.version === 1 && v1.kind === "p3-r5-ordinal3-owner-zero-cost-constraint" && v1.recordState === "finalized-owner-constraint-only" && v1.effectiveForSelection === false, "owner zero-cost v1 historical state changed.");
  exact(v1.constraint, { currency: "JPY", maximumIncrementalSpend: 0 }, "owner zero-cost v1 constraint lineage");
  exact(v1.doesNotAuthorize, ZERO_COST_DOES_NOT_AUTHORIZE, "owner zero-cost v1 no-authority lineage");
  assert(v1.p11Authorization === "NOT_AUTHORIZED", "owner zero-cost v1 changes P-11 authorization.");
}

function assertTopologyPins(design) {
  const specifications = design.topologyEvidenceSpecifications;
  exactKeys(specifications, EXPECTED_TOPOLOGY_EVIDENCE_KEYS, "topology evidence specifications");
  exact(specifications?.osIsolationProofSchema, {
    workspacePath: "tools/r5-ordinal3-os-isolation-proof-schema.json",
    sha256: EXPECTED.isolationProofSchema
  }, "OS-isolation proof schema pin");
  exact(specifications?.readonlyCapabilityProbePlan, {
    workspacePath: "tools/r5-ordinal3-readonly-capability-probe-plan.md",
    sha256: EXPECTED.capabilityProbePlan
  }, "capability probe plan pin");
  assertReadBoundaryGuard(specifications);
  assertNonattachedPersistentOutputEvidence(specifications);
  assertOwnerZeroCostConstraint(specifications);
  exact(specifications?.bindingRule, "The final append-only publication must use separately captured real-runtime evidence conforming to these pinned workspace drafts. Review-only schemas, designs, release drafts, synthetic fixtures, tuple allowlists, validators, and their results are not external OS-isolation proof and cannot satisfy any publication, delivery, or launch gate. A separately approved successor requires new ordinal-3 identities.", "topology evidence binding rule");
  for (const [label, pin] of [
    ["OS-isolation proof schema", specifications.osIsolationProofSchema],
    ["capability probe plan", specifications.readonlyCapabilityProbePlan]
  ]) assert(sha256(readRegular(workspacePath(pin.workspacePath, `${label} path`), label)) === pin.sha256, `${label} byte pin changed.`);
}

function assertGuestTopology(topology) {
  exact(topology, EXPECTED_GUEST_TOPOLOGY, "pair-common guest topology");
  for (const path of [
    topology.attachmentRoot,
    topology.scratchRoot,
    topology.scratchWorkRoot,
    topology.scratchSubmissionPath,
    topology.persistentOutputRoot,
    topology.persistentOutputArchivePath,
    topology.fixedExporter.sourcePath,
    topology.fixedExporter.destinationPath
  ]) assert(path.startsWith("/p3/") && !path.includes("..") && !path.includes("\\") && !path.includes(":"), `guest topology path is not a sealed /p3 path: ${path}`);
  assert(topology.fixedExporter.sourcePath === topology.scratchSubmissionPath && topology.fixedExporter.destinationPath === topology.persistentOutputArchivePath, "fixed exporter paths diverge from topology paths.");
}

function assertHelperPins(design) {
  const evidencePath = workspacePath(design.bytePinnedHelperRelease.e2eEvidence.workspacePath, "E2E evidence path");
  const evidenceBytes = readRegular(evidencePath, "E2E evidence");
  assert(sha256(evidenceBytes) === EXPECTED.helperEvidence && design.bytePinnedHelperRelease.e2eEvidence.sha256 === EXPECTED.helperEvidence, "E2E evidence byte pin changed.");
  const evidence = parseCanonicalJsonBytes(evidenceBytes, "E2E evidence");
  assert(evidence.test?.exitCode === 0 && evidence.test?.stdout === "p3-role-return E2E PASS", "E2E evidence does not record PASS.");
  exact(evidence.postRunReleaseHashObservation?.helper?.sha256, EXPECTED.helper, "E2E evidence helper pin");
  exact(evidence.postRunReleaseHashObservation?.e2e?.sha256, EXPECTED.helperE2E, "E2E evidence E2E pin");
  exact(evidence.fixtureBoundary, {
    temporaryFixtureRoot: "%TEMP%/p3-role-return-e2e-*",
    liveActivationMutation: false,
    roleHomeMutation: false,
    siteMutation: false,
    lifecycleMutation: false,
    p11Mutation: false
  }, "E2E fixture boundary");
  for (const [label, release, pin] of [
    ["return helper", design.bytePinnedHelperRelease.returnHelper, EXPECTED.helper],
    ["return helper E2E", design.bytePinnedHelperRelease.returnHelperE2E, EXPECTED.helperE2E]
  ]) {
    assert(release.sha256 === pin && sha256(readRegular(workspacePath(release.workspacePath, `${label} path`), label)) === pin, `${label} byte pin changed.`);
  }
}

function assertDesign(design) {
  exactKeys(design, EXPECTED_DESIGN_KEYS, "candidate design");
  exact(design.schema, EXPECTED.schema, "design schema");
  assert(design.recordState === "draft-not-published", "candidate must remain draft/not-published.");
  exact(design.scope, EXPECTED_SCOPE, "candidate scope");
  exact(design.execution, {
    workspaceWrites: true,
    externalWrites: false,
    providerSelection: false,
    externalAccountAccess: false,
    purchaseOrSubscription: false,
    networkingChange: false,
    physicalDeviceDeployment: false,
    vmOrSandboxCreation: false,
    runtimeProvisioning: false,
    roleDelivery: false,
    roleLaunch: false,
    implementation: false,
    returnCheck: false,
    returnApply: false,
    siteMutation: false,
    lifecycleMutation: false,
    browserOrFigmaMeasurement: false,
    p11Mutation: false
  }, "candidate execution boundary");
  exact(design.authorityBoundary, EXPECTED_AUTHORITY_BOUNDARY, "candidate authority boundary");
  exact(design.pairIdentity, {
    pairId: EXPECTED.pairId,
    component: EXPECTED.component,
    sequence: 1,
    attempt: 1,
    runtimeDeliverySequence: 1,
    coordinatorReissueOrdinal: 3,
    conditions: ["baseline", "current"]
  }, "pair-wide ordinal-3 identity");
  const source = design.sourceBindings;
  exact(source, EXPECTED_SOURCE_BINDINGS, "predecessor source bindings");
  exact(source.previousPairCommonProtocolSha256, EXPECTED.priorProtocol, "prior pair-common protocol");
  exact(source.previousBaseline.opaqueHandoffId, EXPECTED.priorBaselineHandoff, "prior baseline handoff");
  exact(source.previousCurrent.opaqueHandoffId, EXPECTED.priorCurrentHandoff, "prior current handoff");
  exact(source.previousBaseline.deliveryReceiptSha256, EXPECTED.priorBaselineDelivery, "prior baseline delivery receipt");
  exact(source.previousCurrent.deliveryReceiptSha256, EXPECTED.priorCurrentDelivery, "prior current delivery receipt");
  assert(source.previousBaseline.state === "immutable-predecessor-not-reused", "previous baseline state weakened.");
  assert(source.previousCurrent.state === "immutable-superseded-for-protocol-compatibility" && source.previousCurrent.contaminationClassification === "not-contaminated", "previous current delivery is not correctly preserved as a non-contaminated protocol-compatibility predecessor.");
  const failed = source.failedBaselineAttempt;
  exact(failed.terminalRecordId, EXPECTED.terminalId, "failed terminal id");
  exact(failed.terminalRecord.sha256, EXPECTED.terminalRecord, "failed terminal record hash");
  exact(failed.observation.sha256, EXPECTED.terminalObservation, "failed terminal observation hash");
  exact(failed.lease.recordId, EXPECTED.leaseId, "failed lease id");
  exact(failed.lease.sha256, EXPECTED.leaseRecord, "failed lease hash");
  assert(failed.immutable === true && failed.attemptConsumed === true && failed.mayBeReused === false && failed.mayBeModified === false, "failed terminal/lease protection weakened.");
  exact(source.quarantinedDelivery1Archive.sha256, EXPECTED.quarantinedArchive, "quarantined archive hash");
  for (const key of ["mayBeRoleInput", "mayBeApplied", "mayBeCopiedIntoNewPacket", "mayBeUsedForImplementation"]) assert(source.quarantinedDelivery1Archive[key] === false, `quarantined archive permits ${key}.`);
  exact(design.oneTimeRecoveryException, EXPECTED_ONE_TIME_RECOVERY_EXCEPTION, "one-time recovery exception");
  exact(design.pairCommonRuntimeProtocolSuccessor, EXPECTED_PAIR_COMMON_PROTOCOL_SUCCESSOR, "pair-common protocol successor boundary");
  assertGuestTopology(design.pairCommonRuntimeProtocolSuccessor.guestTopology);
  exact(design.futureIsolationGate, EXPECTED_FUTURE_ISOLATION_GATE, "external OS-isolation gate");
  exact(design.fixedExporterRequirement, EXPECTED_FIXED_EXPORTER_REQUIREMENT, "fixed exporter gate");
  exact(design.noReusePolicy, EXPECTED_NO_REUSE_POLICY, "no-reuse policy");
  assertTopologyPins(design);
  exact(design.identityDerivation, EXPECTED_IDENTITY_DERIVATION, "identity derivation");
  assertHelperPins(design);
}

function identityInput(design) {
  const source = design.sourceBindings;
  return {
    domain: design.identityDerivation.domain,
    pairIdentity: design.pairIdentity,
    previousPairCommonProtocolSha256: source.previousPairCommonProtocolSha256,
    previousBaselineHandoffId: source.previousBaseline.opaqueHandoffId,
    previousCurrentHandoffId: source.previousCurrent.opaqueHandoffId,
    predecessorTerminalRecordSha256: source.failedBaselineAttempt.terminalRecord.sha256,
    predecessorObservationSha256: source.failedBaselineAttempt.observation.sha256,
    predecessorLeaseSha256: source.failedBaselineAttempt.lease.sha256,
    bytePinnedHelperRelease: design.bytePinnedHelperRelease,
    recoveryExceptionScope: design.oneTimeRecoveryException.scope,
    guestTopology: design.pairCommonRuntimeProtocolSuccessor.guestTopology,
    topologyEvidenceSpecifications: design.topologyEvidenceSpecifications,
    fixedExporterRequirement: design.fixedExporterRequirement,
    freshDestinationPolicy: design.freshDestinationPolicy,
    futureIsolationGate: design.futureIsolationGate
  };
}

function derive(design) {
  const identitySeedSha256 = sha256(canonicalBytes(identityInput(design)));
  const baselineOpaqueHandoffId = sha256(Buffer.from(`p3-r5-pair-reissue-3-baseline-handoff\0${identitySeedSha256}`, "utf8")).slice(0, 32);
  const currentOpaqueHandoffId = sha256(Buffer.from(`p3-r5-pair-reissue-3-current-handoff\0${identitySeedSha256}`, "utf8")).slice(0, 32);
  const pairRuntimeActivationId = sha256(Buffer.from(`p3-r5-pair-reissue-3-activation\0${identitySeedSha256}\0${baselineOpaqueHandoffId}\0${currentOpaqueHandoffId}`, "utf8"));
  const helperReleaseId = sha256(Buffer.from(`p3-r5-pair-reissue-3-helper-release\0${identitySeedSha256}`, "utf8"));
  const source = design.sourceBindings;
  const protocolPayload = {
    schema: design.pairCommonRuntimeProtocolSuccessor.schema,
    pairId: design.pairIdentity.pairId,
    component: design.pairIdentity.component,
    sequence: design.pairIdentity.sequence,
    attempt: design.pairIdentity.attempt,
    runtimeDeliverySequence: design.pairIdentity.runtimeDeliverySequence,
    coordinatorReissueOrdinal: design.pairIdentity.coordinatorReissueOrdinal,
    predecessorProtocolSha256: design.pairCommonRuntimeProtocolSuccessor.predecessorSha256,
    predecessorFailure: {
      terminalRecordSha256: source.failedBaselineAttempt.terminalRecord.sha256,
      observationSha256: source.failedBaselineAttempt.observation.sha256,
      leaseSha256: source.failedBaselineAttempt.lease.sha256
    },
    deliveryMode: design.pairCommonRuntimeProtocolSuccessor.deliveryMode,
    executionState: false,
    guestTopology: design.pairCommonRuntimeProtocolSuccessor.guestTopology,
    fixedExporterPublicationGate: {
      status: design.fixedExporterRequirement.status,
      mustBeBytePinnedBeforeFinalPublication: design.fixedExporterRequirement.mustBeBytePinnedBeforeFinalPublication,
      mustRunAs: design.fixedExporterRequirement.mustRunAs,
      mustReadOnly: design.fixedExporterRequirement.mustReadOnly,
      mayWriteOnly: design.fixedExporterRequirement.mayWriteOnly,
      mustReject: design.fixedExporterRequirement.mustReject
    },
    helperRelease: {
      returnHelperSha256: design.bytePinnedHelperRelease.returnHelper.sha256,
      returnHelperE2ESha256: design.bytePinnedHelperRelease.returnHelperE2E.sha256,
      evidenceSha256: design.bytePinnedHelperRelease.e2eEvidence.sha256
    },
    pairCommonByteIdentity: true
  };
  const pairCommonProtocolSha256 = sha256(canonicalBytes(protocolPayload));
  return { identitySeedSha256, baselineOpaqueHandoffId, currentOpaqueHandoffId, pairRuntimeActivationId, helperReleaseId, pairCommonProtocolSha256, protocolPayload };
}

function paths(design, ids) {
  const policy = design.freshDestinationPolicy;
  const activationRoot = policy.runtimeActivationRootTemplate.replace("<pairRuntimeActivationId>", ids.pairRuntimeActivationId);
  const progress = (condition) => policy.externalProgressRootTemplate.replace("<pairRuntimeActivationId>", ids.pairRuntimeActivationId).replace("<condition>", condition);
  return {
    activationRoot,
    baselineProgressRoot: progress("baseline"),
    currentProgressRoot: progress("current"),
    baselineAttachmentStagingRoot: policy.baselineAttachmentStagingRootTemplate.replace("<baselineOpaqueHandoffId>", ids.baselineOpaqueHandoffId),
    currentAttachmentStagingRoot: policy.currentAttachmentStagingRootTemplate.replace("<currentOpaqueHandoffId>", ids.currentOpaqueHandoffId),
    baselineOutputRoleHome: policy.baselineOutputRoleHomeTemplate.replace("<baselineOpaqueHandoffId>", ids.baselineOpaqueHandoffId),
    currentOutputRoleHome: policy.currentOutputRoleHomeTemplate.replace("<currentOpaqueHandoffId>", ids.currentOpaqueHandoffId),
    baselineIsolationEvidenceRoot: policy.baselineIsolationEvidenceRootTemplate.replace("<pairRuntimeActivationId>", ids.pairRuntimeActivationId),
    currentIsolationEvidenceRoot: policy.currentIsolationEvidenceRootTemplate.replace("<pairRuntimeActivationId>", ids.pairRuntimeActivationId)
  };
}

function assertDerived(design, ids, destinations) {
  for (const [label, value, length] of [
    ["identity seed", ids.identitySeedSha256, 64],
    ["baseline opaque handoff", ids.baselineOpaqueHandoffId, 32],
    ["current opaque handoff", ids.currentOpaqueHandoffId, 32],
    ["pair runtime activation", ids.pairRuntimeActivationId, 64],
    ["helper release", ids.helperReleaseId, 64],
    ["pair-common protocol", ids.pairCommonProtocolSha256, 64]
  ]) assertHex(value, length, label);
  assert(ids.baselineOpaqueHandoffId !== ids.currentOpaqueHandoffId, "baseline/current opaque handoffs collide.");
  for (const predecessor of [EXPECTED.priorBaselineHandoff, EXPECTED.priorCurrentHandoff, EXPECTED.terminalId, EXPECTED.leaseId]) {
    assert(ids.baselineOpaqueHandoffId !== predecessor && ids.currentOpaqueHandoffId !== predecessor, "new opaque handoff collides with a predecessor.");
  }
  assert(ids.pairRuntimeActivationId !== design.sourceBindings.previousBaseline.runtimeActivationId && ids.pairRuntimeActivationId !== design.sourceBindings.previousCurrent.runtimeActivationId, "pair activation collides with a predecessor.");
  assert(ids.pairCommonProtocolSha256 !== EXPECTED.priorProtocol, "pair-common successor did not change.");
  const protocolText = canonical(ids.protocolPayload);
  for (const prohibited of ["baseline", "current", "\"condition\"", "HandoffId", ids.baselineOpaqueHandoffId, ids.currentOpaqueHandoffId, "roleHome", "progress", "worktree", "C:/", "C:\\\\", "Users", "p3-role-homes", "p3-coordinator-records"]) assert(!protocolText.includes(prohibited), `pair-common protocol contains condition-specific, host, or destination data: ${prohibited}`);
  exact(destinations.activationRoot, `C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/${EXPECTED.pairId}/runtime-activations/v3/${ids.pairRuntimeActivationId}`, "pair activation root");
  exact(destinations.baselineProgressRoot, `C:/Users/tane1/AppData/Local/p3-coordinator-records/${EXPECTED.pairId}/r5-pair-reissue-3/v1/${ids.pairRuntimeActivationId}/progress/baseline`, "baseline progress root");
  exact(destinations.currentProgressRoot, `C:/Users/tane1/AppData/Local/p3-coordinator-records/${EXPECTED.pairId}/r5-pair-reissue-3/v1/${ids.pairRuntimeActivationId}/progress/current`, "current progress root");
  exact(destinations.baselineAttachmentStagingRoot, `C:/Users/tane1/AppData/Local/p3-role-attachment-staging/${EXPECTED.pairId}/r5-reissue-3/baseline-impl-${ids.baselineOpaqueHandoffId}`, "baseline attachment staging root");
  exact(destinations.currentAttachmentStagingRoot, `C:/Users/tane1/AppData/Local/p3-role-attachment-staging/${EXPECTED.pairId}/r5-reissue-3/current-impl-${ids.currentOpaqueHandoffId}`, "current attachment staging root");
  exact(destinations.baselineOutputRoleHome, `C:/Users/tane1/AppData/Local/p3-role-homes/a-impl-r5-reissue-3-output-${ids.baselineOpaqueHandoffId}`, "baseline output role home");
  exact(destinations.currentOutputRoleHome, `C:/Users/tane1/AppData/Local/p3-role-homes/b-impl-r5-reissue-3-output-${ids.currentOpaqueHandoffId}`, "current output role home");
  exact(destinations.baselineIsolationEvidenceRoot, `C:/Users/tane1/AppData/Local/p3-coordinator-records/${EXPECTED.pairId}/r5-pair-reissue-3/v1/${ids.pairRuntimeActivationId}/isolation-evidence/baseline`, "baseline isolation evidence root");
  exact(destinations.currentIsolationEvidenceRoot, `C:/Users/tane1/AppData/Local/p3-coordinator-records/${EXPECTED.pairId}/r5-pair-reissue-3/v1/${ids.pairRuntimeActivationId}/isolation-evidence/current`, "current isolation evidence root");
  assert(new Set(Object.values(destinations)).size === Object.keys(destinations).length, "fresh destinations collide.");
  for (const oldPath of [design.sourceBindings.previousBaseline.roleHome, design.sourceBindings.previousCurrent.roleHome, design.sourceBindings.quarantinedDelivery1Archive.roleHome, design.sourceBindings.failedBaselineAttempt.terminalRoot, design.sourceBindings.failedBaselineAttempt.lease.root]) assert(!Object.values(destinations).includes(oldPath), `fresh destination reuses predecessor path: ${oldPath}`);
  const actual = {
    identitySeedSha256: ids.identitySeedSha256,
    baselineOpaqueHandoffId: ids.baselineOpaqueHandoffId,
    currentOpaqueHandoffId: ids.currentOpaqueHandoffId,
    pairRuntimeActivationId: ids.pairRuntimeActivationId,
    helperReleaseId: ids.helperReleaseId,
    pairCommonProtocolSha256: ids.pairCommonProtocolSha256
  };
  exact(actual, EXPECTED_DERIVED_IDENTIFIERS, "derived identifiers");
}

function validateDesignAndDerive(design) {
  assertDesign(design);
  const ids = derive(design);
  const destinations = paths(design, ids);
  assertDerived(design, ids, destinations);
  return { ids, destinations };
}

function runDryRun() {
  const designBytes = readRegular(DESIGN_PATH, "candidate design");
  const design = parseCanonicalJsonBytes(designBytes, "candidate design");
  const { ids, destinations } = validateDesignAndDerive(design);
  const candidate = {
    schema: "p3-r5-pair-reissue-3-candidate/v2",
    status: "dry-run-pass-not-published",
    mode: "workspace-only-read-only-dry-run",
    externalWritesPerformed: false,
    roleDeliveryPerformed: false,
    roleLaunchPerformed: false,
    externalPredecessorArtifactsReadByDryRun: false,
    externalPredecessorArtifactsModifiedByDryRun: false,
    freshDestinationAbsenceVerifiedByDryRun: false,
    design: { workspacePath: posix(relative(WORKSPACE_ROOT, DESIGN_PATH)), sha256: sha256(designBytes) },
    oneTimeRecoveryException: design.oneTimeRecoveryException,
    predecessor: {
      previousPairCommonProtocolSha256: EXPECTED.priorProtocol,
      baselineDelivery: { handoffId: EXPECTED.priorBaselineHandoff, receiptSha256: EXPECTED.priorBaselineDelivery, reuse: "forbidden" },
      currentDelivery: { handoffId: EXPECTED.priorCurrentHandoff, receiptSha256: EXPECTED.priorCurrentDelivery, state: "immutable-superseded-for-protocol-compatibility", contaminationClassification: "not-contaminated", reuse: "forbidden" },
      failedBaselineAttempt: {
        terminalRecordId: EXPECTED.terminalId,
        terminalRecordSha256: EXPECTED.terminalRecord,
        observationSha256: EXPECTED.terminalObservation,
        leaseRecordId: EXPECTED.leaseId,
        leaseSha256: EXPECTED.leaseRecord,
        immutable: true,
        attemptConsumed: true,
        reuse: "forbidden"
      },
      quarantinedDelivery1Archive: { sha256: EXPECTED.quarantinedArchive, application: "not-applied", reuse: "forbidden" }
    },
    plannedPairRuntime: {
      identitySeedSha256: ids.identitySeedSha256,
      activationId: ids.pairRuntimeActivationId,
      activationRoot: destinations.activationRoot,
      helperReleaseId: ids.helperReleaseId,
      pairCommonProtocol: { sha256: ids.pairCommonProtocolSha256, canonicalPayload: ids.protocolPayload, exactAandBByteIdentityRequired: true },
      helperRelease: design.bytePinnedHelperRelease
    },
    plannedDeliveries: [
      { condition: "baseline", opaqueHandoffId: ids.baselineOpaqueHandoffId, attachmentStagingRoot: destinations.baselineAttachmentStagingRoot, outputRoleHome: destinations.baselineOutputRoleHome, isolationEvidenceRoot: destinations.baselineIsolationEvidenceRoot, externalProgressRoot: destinations.baselineProgressRoot, deliverySequence: 1, sequence: 1, attempt: 1 },
      { condition: "current", opaqueHandoffId: ids.currentOpaqueHandoffId, attachmentStagingRoot: destinations.currentAttachmentStagingRoot, outputRoleHome: destinations.currentOutputRoleHome, isolationEvidenceRoot: destinations.currentIsolationEvidenceRoot, externalProgressRoot: destinations.currentProgressRoot, deliverySequence: 1, sequence: 1, attempt: 1 }
    ],
    freshDestinationChecksRequiredAtPublication: {
      allPlannedDestinationsAbsent: true,
      noPredecessorRoleHomeReuse: true,
      noPredecessorArchiveReuse: true,
      noPredecessorTerminalOrLeaseMutation: true,
      baselineAndCurrentProtocolBytesAndSha256Identical: true,
      attachmentStagingAndOutputHomeAreSeparate: true,
      outputHomeInitiallyEmptyAndAttachmentFree: true,
      scratchIsEphemeralAndNotHostBacked: true,
      evidenceStoreIsSeparateAndRoleInvisible: true,
      fixedExporterIsPinnedBeforePublication: true
    },
    futureIsolationPrerequisites: {
      ambientInputReadBoundaryGuard: design.topologyEvidenceSpecifications.ambientInputReadBoundaryGuard,
      nonattachedPersistentOutputEvidence: design.topologyEvidenceSpecifications.nonattachedPersistentOutputEvidence,
      ownerZeroCostConstraint: design.topologyEvidenceSpecifications.ownerZeroCostConstraint
    },
    launchGate: design.futureIsolationGate,
    actionsPermittedByThisDryRun: [],
    actionsExplicitlyNotPerformed: Object.entries(design.execution).filter(([, value]) => value === false).map(([key]) => key)
  };
  process.stdout.write(`${JSON.stringify({ ...candidate, sha256: sha256(canonicalBytes(candidate)) }, null, 2)}\n`);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function runSelfTest() {
  const design = parseCanonicalJsonBytes(readRegular(DESIGN_PATH, "candidate design"), "candidate design");
  validateDesignAndDerive(design);
  const rejected = [];
  const expectRejected = (name, messageFragment, action) => {
    let error;
    try { action(); }
    catch (caught) { error = caught; }
    assert(error instanceof Error && error.message.includes(messageFragment), `self-test expected ${name} to reject with ${messageFragment}`);
    rejected.push(name);
  };
  const expectCandidateRejected = (name, messageFragment, mutate) => {
    const fixture = clone(design);
    mutate(fixture);
    expectRejected(name, messageFragment, () => validateDesignAndDerive(fixture));
  };
  const expectJsonRejected = (name, messageFragment, bytes) => {
    expectRejected(name, messageFragment, () => parseCanonicalJsonBytes(bytes, `self-test ${name}`));
  };

  expectCandidateRejected("derived-identifiers-null-bypass", "identity derivation changed.", (fixture) => {
    for (const key of Object.keys(fixture.identityDerivation.expectedDerivedIdentifiers)) fixture.identityDerivation.expectedDerivedIdentifiers[key] = null;
  });
  expectCandidateRejected("external-os-gate-false", "external OS-isolation gate changed.", (fixture) => { fixture.futureIsolationGate.externalOsIsolatedRuntimeRequired = false; });
  expectCandidateRejected("runtime-selected", "external OS-isolation gate changed.", (fixture) => { fixture.futureIsolationGate.runtimeImplementation = "selected runtime"; });
  expectCandidateRejected("p11-promoted", "external OS-isolation gate changed.", (fixture) => { fixture.futureIsolationGate.p11State = "PASS"; });
  expectCandidateRejected("injected-future-delivery-authorization", "external OS-isolation gate changed.", (fixture) => { fixture.futureIsolationGate.roleDeliveryAuthorized = true; });
  expectCandidateRejected("injected-future-launch-authorization", "external OS-isolation gate changed.", (fixture) => { fixture.futureIsolationGate.roleLaunchAuthorized = true; });
  expectCandidateRejected("delivery-now-authorized", "candidate execution boundary changed.", (fixture) => { fixture.execution.roleDelivery = true; });
  expectCandidateRejected("launch-now-authorized", "candidate execution boundary changed.", (fixture) => { fixture.execution.roleLaunch = true; });
  expectCandidateRejected("authority-boundary-launch-now", "candidate authority boundary changed.", (fixture) => { fixture.authorityBoundary.candidateMayLaunchNow = true; });
  expectCandidateRejected("recovery-exception-extra-authorization", "one-time recovery exception changed.", (fixture) => { fixture.oneTimeRecoveryException.roleLaunchAuthorized = true; });
  expectCandidateRejected("candidate-root-extra-authorization", "candidate design has unsupported or missing keys.", (fixture) => { fixture.roleLaunchAuthorized = true; });
  expectCandidateRejected("predecessor-application-state-promoted", "predecessor source bindings changed.", (fixture) => { fixture.sourceBindings.quarantinedDelivery1Archive.applicationState = "applied"; });
  expectCandidateRejected("predecessor-extra-authorization", "predecessor source bindings changed.", (fixture) => { fixture.sourceBindings.previousBaseline.roleLaunchAuthorized = true; });
  expectCandidateRejected("identity-algorithm-weakened", "identity derivation changed.", (fixture) => { fixture.identityDerivation.algorithm = "none"; });
  expectCandidateRejected("identity-extra-authorization", "identity derivation changed.", (fixture) => { fixture.identityDerivation.roleLaunchAuthorized = true; });
  expectCandidateRejected("protocol-byte-identity-weakened", "pair-common protocol successor boundary changed.", (fixture) => { fixture.pairCommonRuntimeProtocolSuccessor.byteIdentityRequirement = "baseline only"; });
  expectCandidateRejected("protocol-future-publication-weakened", "pair-common protocol successor boundary changed.", (fixture) => { fixture.pairCommonRuntimeProtocolSuccessor.futurePublicationRequirement = "publication allowed now"; });
  expectCandidateRejected("candidate-scope-broadened", "candidate scope changed.", (fixture) => { fixture.scope = "broadened"; });
  expectCandidateRejected("no-reuse-weakened", "no-reuse policy changed.", (fixture) => { fixture.noReusePolicy.quarantinedArchive = "may be reused"; });
  expectCandidateRejected("topology-extra-authorization-key", "topology evidence specifications has unsupported or missing keys.", (fixture) => { fixture.topologyEvidenceSpecifications.futureRoleLaunchAuthorization = true; });
  expectCandidateRejected("helper-release-extra-authorization", "derived identifiers changed.", (fixture) => { fixture.bytePinnedHelperRelease.roleLaunchAuthorized = true; });
  expectCandidateRejected("fresh-destination-policy-weakened", "derived identifiers changed.", (fixture) => { fixture.freshDestinationPolicy.mustBeAbsentBeforePublication = false; });
  const zeroCostBytes = readRegular(workspacePath("tools/r5-ordinal3-owner-zero-cost-constraint-v3.json", "self-test owner zero-cost constraint path"), "self-test owner zero-cost constraint");
  const alteredZeroCostBytes = Buffer.from(zeroCostBytes.toString("utf8").replace('"maximumIncrementalSpend": 0', '"maximumIncrementalSpend": 1'), "utf8");
  assert(!alteredZeroCostBytes.equals(zeroCostBytes), "self-test could not alter the zero-cost cap fixture.");
  expectRejected("zero-cost-cap-increased", "owner zero-cost constraint byte pin changed.", () => assertPinnedSha256(alteredZeroCostBytes, EXPECTED.zeroCostConstraintV3, "owner zero-cost constraint"));
  expectJsonRejected("noncanonical-json", "must use canonical UTF-8 JSON.", Buffer.from("{\n\n}\n", "utf8"));
  expectJsonRejected("duplicate-json-key", "contains a duplicate JSON key: scope.", Buffer.from('{"scope":"x","scope":"y"}\n', "utf8"));
  expectJsonRejected("duplicate-nested-json-key", "contains a duplicate JSON key: a.", Buffer.from('{"x":{"a":1,"a":2}}\n', "utf8"));
  expectJsonRejected("duplicate-escaped-json-key", "contains a duplicate JSON key: a.", Buffer.from('{"x":{"\\u0061":1,"a":2}}\n', "utf8"));
  expectJsonRejected("json-bom", "must not contain a UTF-8 BOM.", Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a]));
  expectJsonRejected("json-nul", "must not contain a NUL byte.", Buffer.from([0x7b, 0x7d, 0x00, 0x0a]));

  process.stdout.write(`${JSON.stringify({
    schema: "p3-r5-pair-reissue-3-candidate-self-test/v1",
    status: "pass-workspace-only-no-external-action",
    externalWritesPerformed: false,
    roleDeliveryPerformed: false,
    roleLaunchPerformed: false,
    implementationPerformed: false,
    returnCheckOrApplyPerformed: false,
    browserOrFigmaMeasurementPerformed: false,
    p11Changed: false,
    checks: ["positive-design-and-derived-identifiers", ...rejected]
  }, null, 2)}\n`);
}

function main() {
  if (process.argv.length !== 3) fail("Usage: node tools/r5-baseline-reissue-3-candidate-dry-run.mjs --dry-run|--self-test");
  if (process.argv[2] === "--dry-run") return runDryRun();
  if (process.argv[2] === "--self-test") return runSelfTest();
  fail("Usage: node tools/r5-baseline-reissue-3-candidate-dry-run.mjs --dry-run|--self-test");
}

try { main(); }
catch (error) { process.stderr.write(`R5 pair reissue-3 candidate dry-run failed: ${error.message}\n`); process.exitCode = 1; }
