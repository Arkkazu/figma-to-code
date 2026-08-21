// P-3 R5 ordinal-3 structured source-pin closure audit.
//
// This is a fixed-input, workspace-only, read-only checker. It never accepts
// a filesystem path from argv, never reads a P-3/runtime path, and never
// creates, changes, or authorizes a record, runtime, delivery, launch,
// implementation, return operation, measurement, or P-11 state.
//
// The result intentionally distinguishes two different claims:
// - executionReadClosure: the byte-pinned manifest-declared input set used by
//   the candidate dry-run/provenance review; and
// - structuredSourceClosure: sourceDocuments and successor bindings in the
//   fixed current review records below.
// A passing executionReadClosure does not imply a passing structured closure.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, "..");
const RESULT_SCHEMA = "p3-r5-ordinal3-structured-source-pin-closure-audit/v1";

const ROOTS = Object.freeze({
  candidateDesign: Object.freeze({
    path: "tools/r5-baseline-reissue-3-candidate-design.json",
    sha256: "4c56ecb4a75f12b9fedf2e5b1ac676fdc60dad877c4eead15e76a630eff05955"
  }),
  provenanceManifest: Object.freeze({
    path: "tools/r5-ordinal3-candidate-provenance-review-manifest.json",
    sha256: "e273cbc8838d859a2236ecb2999305333859e70223a60e3217c599d427dd96dd"
  }),
  ownerZeroCostV1: Object.freeze({
    path: "tools/r5-ordinal3-owner-zero-cost-constraint.json",
    sha256: "4160d9537cd5cb79ab66b0cf9c065a211a9314873417f356dbbc6300dd3dec03"
  }),
  ownerZeroCostV2: Object.freeze({
    path: "tools/r5-ordinal3-owner-zero-cost-constraint-v2.json",
    sha256: "707c5535c1f04713e99951962be989e30d1d65a7a26300caca8d00e68d2906b4"
  }),
  ownerZeroCostV3: Object.freeze({
    path: "tools/r5-ordinal3-owner-zero-cost-constraint-v3.json",
    sha256: "ba5b5200a572f49bad245b9d343f4983a0f994249eb1d2e6db89a0586fc35b18"
  }),
  currentOwnerTemplate: Object.freeze({
    path: "tools/r5-ordinal3-external-boundary-owner-decision-template.json",
    sha256: "b7ac0c19c4669a4695e760860552058fc2967ddbe9d5766b4df86af7059029f6"
  }),
  ownerTemplateV2CorrectionDraft: Object.freeze({
    path: "tools/r5-ordinal3-external-boundary-owner-decision-template-v2-correction-draft.json",
    sha256: "b5d39e0c3254d7b962f2e190b49b83647aa0d16d25c82ffb6022932e82e24da1"
  }),
  ownerZeroCostV4CorrectionDraft: Object.freeze({
    path: "tools/r5-ordinal3-owner-zero-cost-constraint-v4-correction-draft.json",
    sha256: "e69043ad4708c16a383b7ce2f8a4f2d69956705b180decee3be56044beb66c18"
  }),
  offlineNonceSubmissionDraft: Object.freeze({
    path: "tools/r5-ordinal3-offline-nonce-submission-volume-amendment-draft.json",
    sha256: "afdb56caddb599c4aac5eb50c5ffb1e9d06cfe903a27df571d9a976519815181"
  }),
  offlineNonceSubmissionV2CorrectionDraft: Object.freeze({
    path: "tools/r5-ordinal3-offline-nonce-submission-volume-amendment-v2-correction-draft.json",
    sha256: "bdfa34fce0d5779f80cb8f7cc2af60169f45353d0853de8db987d520e90047c7"
  }),
  ownerStage1ContentApproval: Object.freeze({
    path: "tools/r5-ordinal3-owner-stage1-content-approval.json",
    sha256: "e865888db3cae0af43b83bfd5014975825cf1013e3e5a85494d2c265408a4bc7"
  }),
  ownerStage1ContentApprovalV2Correction: Object.freeze({
    path: "tools/r5-ordinal3-owner-stage1-content-approval-v2-correction.json",
    sha256: "23331c129b87657f7515d8bd91a15b13f77781b6bd7bc25ce2316d6bf2ba0bd8"
  }),
  nonattachedOutputAmendmentDraft: Object.freeze({
    path: "tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json",
    sha256: "b7960c5509ea50ed27d18ad636f0f12c5c712444a84de0765068f416b27b28a0"
  }),
  nonattachedOutputOwnerAcceptance: Object.freeze({
    path: "tools/r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance.json",
    sha256: "a35ccd16bd8a911879614f04807a6d17d745e3de0491a1ee71350cfba2077e8e"
  }),
  readBoundaryContract: Object.freeze({
    path: "tools/r5-ordinal3-role-read-boundary-guard-contract.json",
    sha256: "c874c8d60908168522935bbc82ffcf09bb9ac28663ba7911f9a6863f6d6873d7"
  }),
  readBoundaryTupleAllowlist: Object.freeze({
    path: "tools/r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist.json",
    sha256: "6625915372c44f54693f06d93fe9b516b9ad375e59ff101f6caad46588e1bb57"
  }),
  readBoundaryReleaseDraft: Object.freeze({
    path: "tools/r5-ordinal3-role-read-boundary-guard-contract-release-draft.json",
    sha256: "e59245a2b0974ea008c0396f738e1c0aaac60c50bb7ca177e8a7c5a4cb555112"
  }),
  osIsolationProofSchema: Object.freeze({
    path: "tools/r5-ordinal3-os-isolation-proof-schema.json",
    sha256: "c17a30f3fd2b84c897635b0f0eb645e3633d3b19418d99c41a7cd8fb5d031403"
  })
});

const EXECUTION_ROOT_PATHS = Object.freeze([
  ROOTS.candidateDesign.path,
  "tools/r5-baseline-reissue-3-candidate-dry-run.mjs"
]);

const CANDIDATE_DRY_RUN_GENERATOR_SHA256 = "18287ba29f74dee61963cbd9eace696b64bf9d3d6c0725ea9a5fb331a821c87d";

const EXECUTION_DEPENDENCY_PATHS = Object.freeze([
  "templates/verify/p3-role-return.mjs",
  "templates/verify/p3-role-return.e2e.mjs",
  "tools/r5-return-helper-e2e-evidence-d9723895.json",
  "tools/r5-ordinal3-os-isolation-proof-schema.json",
  "tools/r5-ordinal3-readonly-capability-probe-plan.md",
  "tools/r5-ordinal3-role-read-boundary-guard-contract.json",
  "tools/r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist.json",
  "tools/r5-ordinal3-role-read-boundary-guard-contract-release-draft.json",
  "tools/r5-ordinal3-ambient-input-provenance-synthetic-probe-design.md",
  "tools/r5-ordinal3-ambient-input-provenance-synthetic-validator.mjs",
  "tools/r5-ordinal3-ambient-input-provenance-synthetic-validator.e2e.mjs",
  "tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json",
  "tools/r5-ordinal3-hyperv-capability-probe-design.md",
  "tools/r5-ordinal3-fixed-exporter-design.md",
  "tools/r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance.json",
  "tools/r5-ordinal3-nonattached-output-evidence-validator.mjs",
  "tools/r5-ordinal3-nonattached-output-evidence-validator.e2e.mjs",
  "tools/r5-ordinal3-owner-zero-cost-constraint.json",
  "tools/r5-ordinal3-owner-zero-cost-constraint-v2.json",
  ROOTS.ownerZeroCostV3.path,
  "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md",
  ROOTS.currentOwnerTemplate.path,
  "tools/r5-ordinal3-zero-cost-external-boundary-feasibility.md",
  "tools/r5-ordinal3-zero-cost-local-hardware-inventory.md"
]);

const EXECUTION_ALLOWED_PATHS = new Set([
  ...EXECUTION_ROOT_PATHS,
  ...EXECUTION_DEPENDENCY_PATHS
]);

const STRUCTURED_ALLOWED_PATHS = new Set([
  ...EXECUTION_ALLOWED_PATHS,
  ROOTS.ownerTemplateV2CorrectionDraft.path,
  ROOTS.ownerZeroCostV4CorrectionDraft.path,
  ROOTS.offlineNonceSubmissionDraft.path,
  ROOTS.offlineNonceSubmissionV2CorrectionDraft.path,
  ROOTS.ownerStage1ContentApproval.path,
  ROOTS.ownerStage1ContentApprovalV2Correction.path,
  "tools/r5-ordinal3-hyperv-capability-preflight.ps1",
  "tools/r5-ordinal3-hyperv-evidence-collector-decision.md"
]);

const CURRENT_OWNER_TEMPLATE_SOURCE_PATHS = Object.freeze([
  "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md",
  "tools/r5-ordinal3-nonattached-output-evidence-validator.mjs",
  "tools/r5-ordinal3-hyperv-capability-preflight.ps1"
]);

const OWNER_ZERO_COST_V3_BINDING_PATHS = Object.freeze([
  "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md",
  ROOTS.currentOwnerTemplate.path,
  "tools/r5-ordinal3-zero-cost-external-boundary-feasibility.md",
  "tools/r5-ordinal3-zero-cost-local-hardware-inventory.md"
]);

const OWNER_ZERO_COST_V4_BINDING_PATHS = Object.freeze([
  "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md",
  ROOTS.ownerTemplateV2CorrectionDraft.path,
  "tools/r5-ordinal3-zero-cost-external-boundary-feasibility.md",
  "tools/r5-ordinal3-zero-cost-local-hardware-inventory.md"
]);

const OFFLINE_NONCE_SOURCE_PATHS = Object.freeze([
  ROOTS.candidateDesign.path,
  "tools/r5-ordinal3-os-isolation-proof-schema.json",
  "tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json",
  "tools/r5-ordinal3-hyperv-capability-probe-design.md",
  "tools/r5-ordinal3-hyperv-evidence-collector-decision.md"
]);

const STAGE1_CORRECTION_DRAFT_PATHS = Object.freeze([
  ROOTS.ownerTemplateV2CorrectionDraft.path,
  ROOTS.ownerZeroCostV4CorrectionDraft.path,
  ROOTS.offlineNonceSubmissionV2CorrectionDraft.path
]);

const STAGE1_APPEND_ONLY_RULE = Object.freeze({
  ruleId: "p3-r5-ordinal3-stage1-content-approval-append-only/v1",
  ruleText: "Stage-1 approval approves correction content only. Every predecessor and review-only draft remains immutable, and only a separately owner-finalized append-only successor with then-current exact source pins may adopt any approved correction.",
  predecessorAndDraftRecordsRemainImmutable: true,
  separateOwnerFinalizedSuccessorRequired: true,
  stage1ContentApprovalDoesNotResolvePredecessorMismatches: true,
  stage1ContentApprovalDoesNotConferOperationalAuthority: true
});

const STAGE1_DOES_NOT_AUTHORIZE = Object.freeze([
  "correction-draft finalization",
  "append-only successor finalization",
  "publication",
  "runtime or VM activation",
  "external account access",
  "provider or topology selection",
  "role delivery",
  "role launch",
  "implementation",
  "return check or apply",
  "site or lifecycle mutation",
  "browser or Figma measurement",
  "P-11 change"
]);

const STAGE1_V2_APPEND_ONLY_RULE = Object.freeze({
  ruleId: "p3-r5-ordinal3-stage1-content-approval-append-only/v2",
  exactRule: "hash-pinned documents never in-place edited; changes create NEW VERSION-NUMBERED FILE; old bytes/record/pin remain reference-only history.",
  hashPinnedDocumentsNeverInPlaceEdited: true,
  changesCreateNewVersionNumberedFile: true,
  oldBytesRecordAndPinRemainReferenceOnlyHistory: true,
  separateOwnerFinalizedSuccessorRequired: true,
  stage1ContentApprovalDoesNotResolvePredecessorMismatches: true,
  stage1ContentApprovalDoesNotConferOperationalAuthority: true
});

const STAGE1_V2_DOES_NOT_AUTHORIZE = Object.freeze([
  "correction-draft finalization",
  "append-only successor finalization",
  "publication",
  "runtime creation or activation",
  "VM creation",
  "sandbox creation",
  "provider selection",
  "external account access",
  "networking change",
  "physical device deployment",
  "role delivery",
  "role launch",
  "implementation",
  "return check or apply",
  "site or lifecycle mutation",
  "browser or Figma measurement",
  "accessibility validation",
  "motion validation",
  "gate execution",
  "P-11 change"
]);

const NONATTACHED_AMENDMENT_SOURCES = Object.freeze([
  Object.freeze({ path: ROOTS.osIsolationProofSchema.path, role: "target evidence contract" }),
  Object.freeze({ path: "tools/r5-ordinal3-hyperv-capability-probe-design.md", role: "non-attached Hyper-V topology candidate" }),
  Object.freeze({ path: "tools/r5-ordinal3-fixed-exporter-design.md", role: "host-only exporter boundary candidate" })
]);

const READ_BOUNDARY_RELEASE_SOURCE_FILE_NAMES = Object.freeze([
  "r5-ordinal3-role-read-boundary-guard-contract.json",
  "r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist.json",
  "r5-ordinal3-ambient-input-provenance-synthetic-probe-design.md",
  "r5-ordinal3-os-isolation-proof-schema.json",
  "r5-ordinal3-ambient-input-provenance-synthetic-validator.mjs",
  "r5-ordinal3-ambient-input-provenance-synthetic-validator.e2e.mjs"
]);

const CANDIDATE_HELPER_PATHS = Object.freeze([
  "templates/verify/p3-role-return.mjs",
  "templates/verify/p3-role-return.e2e.mjs",
  "tools/r5-return-helper-e2e-evidence-d9723895.json"
]);

const CANDIDATE_TOPOLOGY_POINTERS = Object.freeze([
  Object.freeze({ path: ROOTS.osIsolationProofSchema.path, location: ["osIsolationProofSchema"] }),
  Object.freeze({ path: "tools/r5-ordinal3-readonly-capability-probe-plan.md", location: ["readonlyCapabilityProbePlan"] }),
  Object.freeze({ path: ROOTS.readBoundaryContract.path, location: ["ambientInputReadBoundaryGuard", "contract"] }),
  Object.freeze({ path: ROOTS.readBoundaryTupleAllowlist.path, location: ["ambientInputReadBoundaryGuard", "syntheticTupleAllowlist"] }),
  Object.freeze({ path: ROOTS.readBoundaryReleaseDraft.path, location: ["ambientInputReadBoundaryGuard", "release"] }),
  Object.freeze({ path: ROOTS.nonattachedOutputAmendmentDraft.path, location: ["nonattachedPersistentOutputEvidence", "amendment"] }),
  Object.freeze({ path: ROOTS.nonattachedOutputOwnerAcceptance.path, location: ["nonattachedPersistentOutputEvidence", "ownerAcceptance"] }),
  Object.freeze({ path: "tools/r5-ordinal3-nonattached-output-evidence-validator.mjs", location: ["nonattachedPersistentOutputEvidence", "syntheticValidator"] }),
  Object.freeze({ path: "tools/r5-ordinal3-nonattached-output-evidence-validator.e2e.mjs", location: ["nonattachedPersistentOutputEvidence", "syntheticValidatorE2E"] }),
  Object.freeze({ path: ROOTS.ownerZeroCostV3.path, location: ["ownerZeroCostConstraint", "constraintRecord"] })
]);

const OUTPUT_BOUNDARY = Object.freeze({
  workspaceOnly: true,
  inputsMutated: false,
  externalP3ArtifactReads: false,
  externalP3ArtifactWrites: false,
  runtimeOrVmReads: false,
  runtimeOrVmWrites: false,
  childProcesses: false,
  providerSelectionAuthorized: false,
  externalAccountAccessAuthorized: false,
  publicationAuthorized: false,
  roleDeliveryAuthorized: false,
  roleLaunchAuthorized: false,
  implementationAuthorized: false,
  returnCheckOrApplyAuthorized: false,
  browserOrFigmaMeasurementAuthorized: false,
  p11Authorization: "NOT_AUTHORIZED",
  actionsPermittedByThisAudit: Object.freeze([])
});

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function assertHex(value, label) { assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), `${label} must be lowercase SHA-256 hex.`); }

function exactKeys(value, expected, label) {
  assert(isPlainObject(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has unsupported or missing keys.`);
}

function nativeRealpath(path) {
  return realpathSync.native ? realpathSync.native(path) : realpathSync(path);
}

function isWithin(parent, child) {
  const route = relative(parent, child);
  return route === "" || (!isAbsolute(route) && !route.split(/[\\/]+/).includes(".."));
}

function workspacePath(logicalPath, label) {
  assert(typeof logicalPath === "string" && logicalPath.length > 0, `${label} must be a nonempty workspace-relative POSIX path.`);
  assert(!logicalPath.includes("\\") && !logicalPath.includes(":") && !logicalPath.startsWith("/"), `${label} must be workspace-relative POSIX.`);
  const segments = logicalPath.split("/");
  assert(segments.every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), `${label} contains an unsafe path component.`);
  const target = resolve(WORKSPACE_ROOT, ...segments);
  assert(target !== WORKSPACE_ROOT && isWithin(WORKSPACE_ROOT, target), `${label} escapes the workspace.`);
  return target;
}

function assertAllowedPath(logicalPath, allowedPaths, label) {
  workspacePath(logicalPath, label);
  assert(allowedPaths.has(logicalPath), `${label} is not in this audit's fixed allowlist.`);
}

function assertSafePathComponentStatus(status, { mustBeDirectory = false } = {}, label) {
  assert(!status.isSymbolicLink(), `${label} contains a symbolic link or junction.`);
  if (mustBeDirectory) assert(status.isDirectory(), `${label} has a non-directory ancestor.`);
}

function assertRegularNonLinkFileStatus(lstat, stat, label) {
  assert(lstat.isFile() && !lstat.isSymbolicLink(), `${label} is not a regular non-link file.`);
  assert(stat.isFile(), `${label} is not a regular file after stat.`);
  assert(typeof stat.nlink === "number" && Number.isInteger(stat.nlink) && stat.nlink === 1, `${label} must be a non-hard-linked regular file.`);
}

function assertRootInventoryDirent(entry, label) {
  assert(entry && typeof entry.isFile === "function" && typeof entry.isSymbolicLink === "function", `${label} has an unreadable directory entry.`);
  assert(entry.isFile() && !entry.isSymbolicLink(), `${label} must be a regular non-link file.`);
}

function assertNoLinkComponents(path, label) {
  const root = resolve(WORKSPACE_ROOT);
  const target = resolve(path);
  const route = relative(root, target);
  assert(route && isWithin(root, target), `${label} escapes the workspace.`);
  try {
    const rootStatus = lstatSync(root);
    assertSafePathComponentStatus(rootStatus, { mustBeDirectory: true }, `${label} workspace root`);
    let current = root;
    const segments = route.split(/[\\/]+/).filter(Boolean);
    assert(segments.length > 0, `${label} resolves to the workspace root.`);
    for (let index = 0; index < segments.length; index += 1) {
      current = resolve(current, segments[index]);
      const status = lstatSync(current);
      assertSafePathComponentStatus(status, { mustBeDirectory: index < segments.length - 1 }, label);
    }
    const rootReal = nativeRealpath(root);
    const targetReal = nativeRealpath(target);
    assert(rootReal !== targetReal && isWithin(rootReal, targetReal), `${label} resolves outside the workspace.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    fail(`${label} has a missing or unreadable path component.`);
  }
}

function readRegular(path, label) {
  assertNoLinkComponents(path, label);
  const lst = lstatSync(path);
  const st = statSync(path);
  assertRegularNonLinkFileStatus(lst, st, label);
  return readFileSync(path);
}

function isJsonWhitespace(character) {
  return character === " " || character === "\n" || character === "\r" || character === "\t";
}

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

function parseCanonicalJsonBytes(bytes, label, { requireRepositorySerialization = true } = {}) {
  assert(Buffer.isBuffer(bytes), `${label} must be read as bytes.`);
  assert(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM.`);
  assert(!bytes.includes(0), `${label} must not contain a NUL byte.`);
  const text = bytes.toString("utf8");
  assert(Buffer.from(text, "utf8").equals(bytes), `${label} is not valid UTF-8.`);
  assertNoDuplicateJsonKeys(text, label);
  let value;
  try { value = JSON.parse(text); }
  catch (error) { fail(`${label} must be valid JSON: ${error.message}`); }
  const repositorySerializationConforming = `${JSON.stringify(value, null, 2)}\n` === text;
  if (requireRepositorySerialization) assert(repositorySerializationConforming, `${label} must use canonical UTF-8 JSON.`);
  return { value, repositorySerializationConforming };
}

function readPinnedRoot(key) {
  const root = ROOTS[key];
  const label = `${key} root`;
  const bytes = readRegular(workspacePath(root.path, label), label);
  const actualSha256 = sha256(bytes);
  assert(actualSha256 === root.sha256, `${label} byte pin changed.`);
  const parsed = parseCanonicalJsonBytes(bytes, label, {
    // This schema is exact-byte pinned by an accepted amendment chain. Its
    // legacy comma/whitespace serialization is observable but cannot be
    // rewritten by this review-only audit without a successor chain.
    requireRepositorySerialization: key !== "osIsolationProofSchema"
  });
  return {
    key,
    path: root.path,
    sha256: actualSha256,
    document: parsed.value,
    repositorySerializationConforming: parsed.repositorySerializationConforming
  };
}

function exactStringSet(actualValues, expectedValues, label) {
  const actual = [...actualValues].sort();
  const expected = [...expectedValues].sort();
  assert(actual.length === expected.length && actual.every((value, index) => value === expected[index]), `${label} changed.`);
}

function auditRootInventory() {
  const toolsDirectory = workspacePath("tools", "root inventory tools directory");
  assertNoLinkComponents(toolsDirectory, "root inventory tools directory");
  const expected = Object.values(ROOTS)
    .map((root) => root.path)
    .filter((path) => /^tools\/r5-ordinal3.*\.json$/.test(path));
  const candidates = readdirSync(toolsDirectory, { withFileTypes: true })
    .filter((entry) => /^r5-ordinal3.*\.json$/.test(entry.name));
  const observed = candidates.map((entry) => {
    const logicalPath = `tools/${entry.name}`;
    const label = `root inventory candidate ${logicalPath}`;
    assertRootInventoryDirent(entry, label);
    // Verify the actual path as well as Dirent's type: this rejects a
    // directory/symlink/junction/reparse entry before it can be hidden by
    // set comparison, and rejects hard-linked files through readRegular.
    readRegular(workspacePath(logicalPath, label), label);
    return logicalPath;
  });
  exactStringSet(observed, expected, "r5-ordinal3 JSON root inventory");
  return {
    status: "pass-exact-fixed-r5-ordinal3-json-root-inventory",
    count: expected.length,
    paths: [...expected].sort()
  };
}

function auditPointer(pointer, label, {
  pathKey = "path",
  allowedPaths = STRUCTURED_ALLOWED_PATHS,
  expectedPath = undefined,
  extraExpected = undefined
} = {}) {
  const expectedKeys = [pathKey, "sha256", ...(extraExpected ? Object.keys(extraExpected) : [])];
  exactKeys(pointer, expectedKeys, label);
  if (extraExpected) {
    for (const [key, value] of Object.entries(extraExpected)) assert(pointer[key] === value, `${label}.${key} changed.`);
  }
  const logicalPath = pointer[pathKey];
  assertAllowedPath(logicalPath, allowedPaths, `${label}.${pathKey}`);
  if (expectedPath !== undefined) assert(logicalPath === expectedPath, `${label}.${pathKey} changed.`);
  assertHex(pointer.sha256, `${label}.sha256`);
  const actualSha256 = sha256(readRegular(workspacePath(logicalPath, `${label}.${pathKey}`), label));
  return Object.freeze({
    label,
    path: logicalPath,
    declaredSha256: pointer.sha256,
    actualSha256,
    matched: pointer.sha256 === actualSha256
  });
}

function auditFileNamePointer(pointer, label, expectedFileName) {
  exactKeys(pointer, ["fileName", "sha256"], label);
  assert(typeof pointer.fileName === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pointer.fileName), `${label}.fileName must be a plain file name.`);
  assert(pointer.fileName === expectedFileName, `${label}.fileName changed.`);
  return auditPointer({ path: `tools/${pointer.fileName}`, sha256: pointer.sha256 }, label, {
    expectedPath: `tools/${expectedFileName}`
  });
}

function assertPathSequence(records, expectedPaths, label, pathKey) {
  assert(Array.isArray(records) && records.length === expectedPaths.length, `${label} has an unexpected source count.`);
  for (const [index, expectedPath] of expectedPaths.entries()) {
    assert(isPlainObject(records[index]) && records[index][pathKey] === expectedPath, `${label}[${index}] path changed.`);
  }
}

function auditExecutionReadClosure(manifest) {
  exactKeys(manifest, [
    "version", "kind", "recordState", "effective", "scope", "bindingModel", "roots", "dependencyClosure",
    "expectedGeneratorChecks", "nonAuthorizingResult", "requiredFinalStatement"
  ], "provenance manifest");
  assert(manifest.version === 1 && manifest.kind === "p3-r5-ordinal3-candidate-provenance-review-manifest", "provenance manifest identity changed.");
  assert(manifest.recordState === "review-only" && manifest.effective === false, "provenance manifest became effective.");
  exactKeys(manifest.scope, ["workspaceOnly", "candidateValidationOnly", "externalP3ArtifactReads", "externalP3ArtifactWrites", "runtimeExecution"], "provenance manifest scope");
  assert(manifest.scope.workspaceOnly === true && manifest.scope.candidateValidationOnly === true, "provenance manifest workspace scope changed.");
  assert(manifest.scope.externalP3ArtifactReads === false && manifest.scope.externalP3ArtifactWrites === false && manifest.scope.runtimeExecution === false, "provenance manifest external boundary changed.");
  exactKeys(manifest.roots, ["candidateDesign", "candidateDryRunGenerator"], "provenance manifest roots");
  assert(manifest.roots.candidateDesign.workspacePath === ROOTS.candidateDesign.path && manifest.roots.candidateDesign.sha256 === ROOTS.candidateDesign.sha256, "provenance manifest candidate root changed.");
  assert(manifest.roots.candidateDryRunGenerator.workspacePath === EXECUTION_ROOT_PATHS[1] && manifest.roots.candidateDryRunGenerator.sha256 === CANDIDATE_DRY_RUN_GENERATOR_SHA256, "provenance manifest generator root changed.");
  const records = [
    auditPointer(manifest.roots.candidateDesign, "provenance manifest candidate root", { pathKey: "workspacePath", allowedPaths: EXECUTION_ALLOWED_PATHS, expectedPath: EXECUTION_ROOT_PATHS[0] }),
    auditPointer(manifest.roots.candidateDryRunGenerator, "provenance manifest generator root", { pathKey: "workspacePath", allowedPaths: EXECUTION_ALLOWED_PATHS, expectedPath: EXECUTION_ROOT_PATHS[1] })
  ];
  exactKeys(manifest.dependencyClosure, ["uniqueWorkspaceInputCountExcludingRoots", "allFilesAreWorkspaceRelativeRegularNonLinkFiles", "files"], "provenance manifest dependency closure");
  assert(manifest.dependencyClosure.uniqueWorkspaceInputCountExcludingRoots === EXECUTION_DEPENDENCY_PATHS.length, "provenance manifest dependency count changed.");
  assert(manifest.dependencyClosure.allFilesAreWorkspaceRelativeRegularNonLinkFiles === true, "provenance manifest regular-file policy changed.");
  assertPathSequence(manifest.dependencyClosure.files, EXECUTION_DEPENDENCY_PATHS, "provenance manifest dependency closure", "workspacePath");
  const paths = new Set(EXECUTION_ROOT_PATHS);
  for (const [index, record] of manifest.dependencyClosure.files.entries()) {
    assert(!paths.has(record.workspacePath), `provenance manifest dependency closure[${index}] duplicates an execution input.`);
    paths.add(record.workspacePath);
    records.push(auditPointer(record, `provenance manifest dependency closure[${index}]`, {
      pathKey: "workspacePath",
      allowedPaths: EXECUTION_ALLOWED_PATHS,
      expectedPath: EXECUTION_DEPENDENCY_PATHS[index]
    }));
  }
  const mismatches = records.filter((record) => !record.matched);
  return {
    status: mismatches.length === 0 ? "pass-byte-pinned-declared-execution-read-closure" : "fail-closed-execution-input-pin-mismatch",
    evidenceKind: "manifest-declared byte-pinned input closure; this audit does not execute the generator or trace system calls",
    inputCountExcludingManifest: records.length,
    records,
    mismatches
  };
}

function auditCandidateContext(candidate) {
  assert(isPlainObject(candidate.bytePinnedHelperRelease), "candidate helper release is absent.");
  const helperRecords = [
    auditPointer(candidate.bytePinnedHelperRelease.returnHelper, "candidate return helper pin", {
      pathKey: "workspacePath",
      expectedPath: CANDIDATE_HELPER_PATHS[0]
    }),
    auditPointer(candidate.bytePinnedHelperRelease.returnHelperE2E, "candidate return helper E2E pin", {
      pathKey: "workspacePath",
      expectedPath: CANDIDATE_HELPER_PATHS[1]
    }),
    auditPointer(candidate.bytePinnedHelperRelease.e2eEvidence, "candidate helper E2E evidence pin", {
      pathKey: "workspacePath",
      expectedPath: CANDIDATE_HELPER_PATHS[2],
      extraExpected: { scope: "isolated fixture verification only" }
    })
  ];
  assert(isPlainObject(candidate.topologyEvidenceSpecifications), "candidate topology evidence specifications are absent.");
  const topologyRecords = [];
  for (const descriptor of CANDIDATE_TOPOLOGY_POINTERS) {
    let pointer = candidate.topologyEvidenceSpecifications;
    for (const key of descriptor.location) pointer = pointer?.[key];
    const label = `candidate topology pin ${descriptor.location.join(".")}`;
    topologyRecords.push(auditPointer(pointer, label, {
      pathKey: "workspacePath",
      expectedPath: descriptor.path
    }));
  }
  assert(topologyRecords.at(-1).declaredSha256 === ROOTS.ownerZeroCostV3.sha256, "candidate owner-zero-cost context pin changed.");
  return [...helperRecords, ...topologyRecords];
}

function auditOwnerZeroCostV3(v3) {
  assert(v3.version === 3 && v3.recordState === "finalized-owner-constraint-only" && v3.appendOnly === true && v3.effectiveForSelection === false, "owner zero-cost v3 state changed.");
  const records = [];
  records.push(auditPointer(v3.supersedesByReferenceOnly, "owner zero-cost v3 predecessor", {
    expectedPath: "tools/r5-ordinal3-owner-zero-cost-constraint-v2.json",
    extraExpected: { predecessorRecordRemainsImmutable: true }
  }));
  assertPathSequence(v3.bindings, OWNER_ZERO_COST_V3_BINDING_PATHS, "owner zero-cost v3 bindings", "path");
  for (const [index, source] of v3.bindings.entries()) {
    records.push(auditPointer(source, `owner zero-cost v3 bindings[${index}]`, { expectedPath: OWNER_ZERO_COST_V3_BINDING_PATHS[index] }));
  }
  return records;
}

function auditOwnerZeroCostV1(v1) {
  assert(v1.version === 1 && v1.kind === "p3-r5-ordinal3-owner-zero-cost-constraint", "owner zero-cost v1 identity changed.");
  assert(v1.recordState === "finalized-owner-constraint-only" && v1.effectiveForSelection === false, "owner zero-cost v1 state changed.");
  return [];
}

function auditOwnerZeroCostV2(v2) {
  assert(v2.version === 2 && v2.kind === "p3-r5-ordinal3-owner-zero-cost-constraint-supplement", "owner zero-cost v2 identity changed.");
  assert(v2.recordState === "finalized-owner-constraint-only" && v2.appendOnly === true && v2.effectiveForSelection === false, "owner zero-cost v2 state changed.");
  return [auditPointer(v2.supersedesByReferenceOnly, "owner zero-cost v2 predecessor", {
    expectedPath: ROOTS.ownerZeroCostV1.path,
    extraExpected: { originalRecordRemainsImmutable: true }
  })];
}

function auditCurrentOwnerTemplate(template) {
  assert(template.version === 1 && template.status === "owner-input-required" && template.effective === false, "current owner template state changed.");
  assertPathSequence(template.sourceDocuments, CURRENT_OWNER_TEMPLATE_SOURCE_PATHS, "current owner template sourceDocuments", "path");
  return template.sourceDocuments.map((source, index) => auditPointer(source, `current owner template sourceDocuments[${index}]`, {
    expectedPath: CURRENT_OWNER_TEMPLATE_SOURCE_PATHS[index]
  }));
}

function auditOwnerTemplateV2CorrectionDraft(draft) {
  assert(draft.version === 2 && draft.recordState === "owner-review-only-draft" && draft.effective === false && draft.appendOnlySuccessorRequiredIfFinalized === true, "owner template v2 correction draft state changed.");
  const records = [auditPointer(draft.supersedesByReferenceOnly, "owner template v2 predecessor", {
    expectedPath: ROOTS.currentOwnerTemplate.path,
    extraExpected: { predecessorRemainsUnmodified: true }
  })];
  assertPathSequence(draft.sourceDocuments, CURRENT_OWNER_TEMPLATE_SOURCE_PATHS, "owner template v2 sourceDocuments", "path");
  for (const [index, source] of draft.sourceDocuments.entries()) {
    records.push(auditPointer(source, `owner template v2 sourceDocuments[${index}]`, { expectedPath: CURRENT_OWNER_TEMPLATE_SOURCE_PATHS[index] }));
  }
  return records;
}

function auditOwnerZeroCostV4CorrectionDraft(draft) {
  assert(draft.version === 4 && draft.recordState === "owner-review-only-draft" && draft.ownerApprovalState === "REQUIRED_UNSET", "owner zero-cost v4 correction draft state changed.");
  assert(draft.effectiveForSelection === false && draft.cannotBeUsedAsCandidateInputBeforeFinalizedOwnerSuccessor === true, "owner zero-cost v4 correction authority changed.");
  const records = [
    auditPointer(draft.proposedSupersedesByReferenceOnly, "owner zero-cost v4 predecessor", {
      expectedPath: ROOTS.ownerZeroCostV3.path,
      extraExpected: { predecessorRecordRemainsImmutable: true }
    }),
    auditPointer(draft.proposedCorrection?.replacesBinding, "owner zero-cost v4 replaced binding", {
      expectedPath: ROOTS.currentOwnerTemplate.path
    }),
    auditPointer(draft.proposedCorrection?.withReviewOnlyDraft, "owner zero-cost v4 review-only draft", {
      expectedPath: ROOTS.ownerTemplateV2CorrectionDraft.path,
      extraExpected: { recordState: "owner-review-only-draft", effective: false }
    })
  ];
  assertPathSequence(draft.proposedBindings, OWNER_ZERO_COST_V4_BINDING_PATHS, "owner zero-cost v4 proposed bindings", "path");
  for (const [index, source] of draft.proposedBindings.entries()) {
    records.push(auditPointer(source, `owner zero-cost v4 proposed bindings[${index}]`, { expectedPath: OWNER_ZERO_COST_V4_BINDING_PATHS[index] }));
  }
  return records;
}

function auditOfflineNonceSubmissionDraft(draft) {
  assert(draft.version === 1 && draft.status === "owner-review-only-draft" && draft.effective === false, "offline nonce submission draft state changed.");
  assertPathSequence(draft.sourceDocuments, OFFLINE_NONCE_SOURCE_PATHS, "offline nonce submission sourceDocuments", "path");
  return draft.sourceDocuments.map((source, index) => auditPointer(source, `offline nonce submission sourceDocuments[${index}]`, {
    expectedPath: OFFLINE_NONCE_SOURCE_PATHS[index]
  }));
}

function auditOfflineNonceSubmissionV2CorrectionDraft(draft) {
  assert(draft.version === 2 && draft.kind === "p3-r5-ordinal3-offline-nonce-submission-volume-amendment-correction-draft", "offline nonce v2 correction draft identity changed.");
  assert(draft.recordState === "owner-review-only-draft" && draft.ownerApprovalState === "REQUIRED_UNSET" && draft.effective === false, "offline nonce v2 correction draft state changed.");
  assert(draft.appendOnlySuccessorRequiredIfFinalized === true && draft.cannotBeUsedAsCandidateInputBeforeFinalizedOwnerSuccessor === true, "offline nonce v2 correction draft successor boundary changed.");
  const records = [auditPointer(draft.supersedesByReferenceOnly, "offline nonce v2 correction predecessor", {
    expectedPath: ROOTS.offlineNonceSubmissionDraft.path,
    extraExpected: { predecessorRemainsUnmodified: true }
  })];
  exactKeys(draft.correction, [
    "field", "path", "predecessorDeclaredSha256", "currentWorkspaceSha256", "historicalBytesRecovered", "requiresOwnerFinalizationBeforeUse"
  ], "offline nonce v2 correction");
  assert(draft.correction.field === "sourceDocuments[0].sha256" && draft.correction.path === ROOTS.candidateDesign.path, "offline nonce v2 correction target changed.");
  assert(draft.correction.predecessorDeclaredSha256 === "811a84bb656bf43f168a3ae9e4d7a756d06a51fcab9e16304340d0271d9fe007", "offline nonce v2 correction predecessor snapshot changed.");
  assert(draft.correction.currentWorkspaceSha256 === ROOTS.candidateDesign.sha256, "offline nonce v2 correction current candidate pin changed.");
  assert(draft.correction.historicalBytesRecovered === false && draft.correction.requiresOwnerFinalizationBeforeUse === true, "offline nonce v2 correction historical/finalization boundary changed.");
  assertPathSequence(draft.sourceDocuments, OFFLINE_NONCE_SOURCE_PATHS, "offline nonce v2 correction sourceDocuments", "path");
  for (const [index, source] of draft.sourceDocuments.entries()) {
    records.push(auditPointer(source, `offline nonce v2 correction sourceDocuments[${index}]`, {
      expectedPath: OFFLINE_NONCE_SOURCE_PATHS[index]
    }));
  }
  exactKeys(draft.noAuthority, [
    "doesNotModifyPredecessor", "doesNotModifyCurrentCandidate", "doesNotSelectProviderOrTopology", "doesNotAuthorize", "p11Authorization"
  ], "offline nonce v2 correction noAuthority");
  assert(draft.noAuthority.doesNotModifyPredecessor === true && draft.noAuthority.doesNotModifyCurrentCandidate === true && draft.noAuthority.doesNotSelectProviderOrTopology === true, "offline nonce v2 correction noAuthority changed.");
  exactStringSet(draft.noAuthority.doesNotAuthorize, [
    "reissue publication",
    "role delivery",
    "role launch",
    "implementation",
    "return check",
    "return apply",
    "site or lifecycle mutation",
    "browser or Figma measurement",
    "P-11 change",
    "Hyper-V VM creation"
  ], "offline nonce v2 correction doesNotAuthorize");
  assert(draft.noAuthority.p11Authorization === "NOT_AUTHORIZED", "offline nonce v2 correction noAuthority P-11 boundary changed.");
  assert(draft.p11Authorization === "NOT_AUTHORIZED", "offline nonce v2 correction P-11 boundary changed.");
  return records;
}

function assertStage1AppendOnlyRule(rule, label) {
  exactKeys(rule, Object.keys(STAGE1_APPEND_ONLY_RULE), label);
  for (const [key, expected] of Object.entries(STAGE1_APPEND_ONLY_RULE)) {
    assert(rule[key] === expected, `${label}.${key} changed.`);
  }
}

function auditOwnerStage1ContentApproval(approval) {
  assert(approval.version === 1 && approval.kind === "p3-r5-ordinal3-owner-stage1-content-approval", "owner stage-1 content approval identity changed.");
  assert(approval.recordState === "finalized-owner-stage1-content-approval-only" && approval.appendOnly === true && approval.effectiveForOperationalUse === false, "owner stage-1 content approval state changed.");
  assert(approval.ownerApproved === true && approval.ownerApprovalState === "GRANTED_STAGE1_CONTENT_ONLY", "owner stage-1 content approval owner state changed.");
  assert(typeof approval.approvedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(approval.approvedAt), "owner stage-1 content approval timestamp changed.");
  exactKeys(approval, [
    "version", "kind", "recordState", "appendOnly", "effectiveForOperationalUse", "ownerApproved", "ownerApprovalState", "approvedAt",
    "approvalSource", "approvalScope", "approvedCorrectionDrafts", "adoptedAppendOnlyRule", "noAuthority", "p11Authorization"
  ], "owner stage-1 content approval");
  exactKeys(approval.approvalSource, ["kind", "contentHash", "machineVerified"], "owner stage-1 content approval source");
  assert(approval.approvalSource.kind === "direct-owner-conversation" && approval.approvalSource.contentHash === "not-available" && approval.approvalSource.machineVerified === false, "owner stage-1 content approval source changed.");
  exactKeys(approval.approvalScope, [
    "stage", "approvesContentOnly", "doesNotFinalizeCorrectionDrafts", "doesNotPublishOrActivateRuntime", "doesNotAuthorizeP3RoleAction"
  ], "owner stage-1 content approval scope");
  assert(approval.approvalScope.stage === "stage-1-content-approval" && approval.approvalScope.approvesContentOnly === true, "owner stage-1 content approval scope changed.");
  assert(approval.approvalScope.doesNotFinalizeCorrectionDrafts === true && approval.approvalScope.doesNotPublishOrActivateRuntime === true && approval.approvalScope.doesNotAuthorizeP3RoleAction === true, "owner stage-1 content approval authority boundary changed.");
  assertPathSequence(approval.approvedCorrectionDrafts, STAGE1_CORRECTION_DRAFT_PATHS, "owner stage-1 approved correction drafts", "path");
  const records = approval.approvedCorrectionDrafts.map((draft, index) => auditPointer(draft, `owner stage-1 approved correction drafts[${index}]`, {
    expectedPath: STAGE1_CORRECTION_DRAFT_PATHS[index]
  }));
  assertStage1AppendOnlyRule(approval.adoptedAppendOnlyRule, "owner stage-1 adopted append-only rule");
  exactKeys(approval.noAuthority, [
    "doesNotModifyApprovedDraftsOrPredecessors", "doesNotFinalizeCorrectionDraftsOrSuccessors", "doesNotAuthorize", "p11Authorization"
  ], "owner stage-1 content approval noAuthority");
  assert(approval.noAuthority.doesNotModifyApprovedDraftsOrPredecessors === true && approval.noAuthority.doesNotFinalizeCorrectionDraftsOrSuccessors === true, "owner stage-1 content approval noAuthority changed.");
  exactStringSet(approval.noAuthority.doesNotAuthorize, STAGE1_DOES_NOT_AUTHORIZE, "owner stage-1 content approval doesNotAuthorize");
  assert(approval.noAuthority.p11Authorization === "NOT_AUTHORIZED" && approval.p11Authorization === "NOT_AUTHORIZED", "owner stage-1 content approval P-11 boundary changed.");
  return records;
}

function assertStage1V2AppendOnlyRule(rule, label) {
  exactKeys(rule, Object.keys(STAGE1_V2_APPEND_ONLY_RULE), label);
  for (const [key, expected] of Object.entries(STAGE1_V2_APPEND_ONLY_RULE)) {
    assert(rule[key] === expected, `${label}.${key} changed.`);
  }
}

function auditOwnerStage1ContentApprovalV2Correction(approval) {
  assert(approval.version === 2 && approval.kind === "p3-r5-ordinal3-owner-stage1-content-approval-correction", "owner stage-1 v2 correction identity changed.");
  assert(approval.recordState === "finalized-owner-stage1-content-approval-correction-only" && approval.appendOnly === true && approval.referenceOnly === true && approval.effectiveForOperationalUse === false, "owner stage-1 v2 correction state changed.");
  assert(approval.ownerApproved === true && approval.ownerApprovalState === "GRANTED_STAGE1_CONTENT_ONLY", "owner stage-1 v2 correction owner state changed.");
  assert(typeof approval.approvedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(approval.approvedAt), "owner stage-1 v2 correction timestamp changed.");
  exactKeys(approval, [
    "version", "kind", "recordState", "appendOnly", "referenceOnly", "effectiveForOperationalUse", "ownerApproved", "ownerApprovalState", "approvedAt",
    "approvalSource", "supersedesByReferenceOnly", "approvalScope", "approvedCorrectionDrafts", "adoptedAppendOnlyRule", "noAuthority", "p11Authorization"
  ], "owner stage-1 v2 correction");
  exactKeys(approval.approvalSource, ["kind", "contentHash", "machineVerified"], "owner stage-1 v2 correction source");
  assert(approval.approvalSource.kind === "direct-owner-conversation" && approval.approvalSource.contentHash === "not-available" && approval.approvalSource.machineVerified === false, "owner stage-1 v2 correction source changed.");
  const records = [auditPointer(approval.supersedesByReferenceOnly, "owner stage-1 v2 correction predecessor", {
    expectedPath: ROOTS.ownerStage1ContentApproval.path,
    extraExpected: { predecessorRemainsUnmodified: true, predecessorRemainsReferenceOnlyHistory: true }
  })];
  exactKeys(approval.approvalScope, [
    "stage", "correctionRecordOnly", "approvesContentOnly", "doesNotFinalizeCorrectionDrafts", "doesNotPublishOrActivateRuntime", "doesNotAuthorizeP3RoleAction"
  ], "owner stage-1 v2 correction scope");
  assert(approval.approvalScope.stage === "stage-1-content-approval" && approval.approvalScope.correctionRecordOnly === true && approval.approvalScope.approvesContentOnly === true, "owner stage-1 v2 correction scope changed.");
  assert(approval.approvalScope.doesNotFinalizeCorrectionDrafts === true && approval.approvalScope.doesNotPublishOrActivateRuntime === true && approval.approvalScope.doesNotAuthorizeP3RoleAction === true, "owner stage-1 v2 correction authority boundary changed.");
  assertPathSequence(approval.approvedCorrectionDrafts, STAGE1_CORRECTION_DRAFT_PATHS, "owner stage-1 v2 approved correction drafts", "path");
  for (const [index, draft] of approval.approvedCorrectionDrafts.entries()) {
    records.push(auditPointer(draft, `owner stage-1 v2 approved correction drafts[${index}]`, {
      expectedPath: STAGE1_CORRECTION_DRAFT_PATHS[index]
    }));
  }
  assertStage1V2AppendOnlyRule(approval.adoptedAppendOnlyRule, "owner stage-1 v2 adopted append-only rule");
  exactKeys(approval.noAuthority, [
    "doesNotModifyHashPinnedDocumentsOrPredecessors", "doesNotFinalizeCorrectionDraftsOrSuccessors", "doesNotCreateRuntimeVmOrSandbox",
    "doesNotChangeProviderAccountNetworkOrPhysicalInfrastructure", "doesNotAuthorizeP3RoleActions", "doesNotAuthorizeMeasurementOrGate", "doesNotAuthorize", "p11Authorization"
  ], "owner stage-1 v2 correction noAuthority");
  assert(approval.noAuthority.doesNotModifyHashPinnedDocumentsOrPredecessors === true && approval.noAuthority.doesNotFinalizeCorrectionDraftsOrSuccessors === true, "owner stage-1 v2 correction immutable/finalization boundary changed.");
  assert(approval.noAuthority.doesNotCreateRuntimeVmOrSandbox === true && approval.noAuthority.doesNotChangeProviderAccountNetworkOrPhysicalInfrastructure === true, "owner stage-1 v2 correction infrastructure authority boundary changed.");
  assert(approval.noAuthority.doesNotAuthorizeP3RoleActions === true && approval.noAuthority.doesNotAuthorizeMeasurementOrGate === true, "owner stage-1 v2 correction role/measurement authority boundary changed.");
  exactStringSet(approval.noAuthority.doesNotAuthorize, STAGE1_V2_DOES_NOT_AUTHORIZE, "owner stage-1 v2 correction doesNotAuthorize");
  assert(approval.noAuthority.p11Authorization === "NOT_AUTHORIZED" && approval.p11Authorization === "NOT_AUTHORIZED", "owner stage-1 v2 correction P-11 boundary changed.");
  return records;
}

function auditNonattachedOutputAmendmentDraft(draft) {
  assert(draft.version === 1 && draft.kind === "p3-r5-ordinal3-nonattached-persistent-output-contract-amendment", "nonattached output amendment identity changed.");
  assert(draft.status === "owner-review-only-draft" && draft.effective === false, "nonattached output amendment state changed.");
  assert(Array.isArray(draft.sourceDocuments) && draft.sourceDocuments.length === NONATTACHED_AMENDMENT_SOURCES.length, "nonattached output amendment sourceDocuments count changed.");
  const records = [];
  for (const [index, expected] of NONATTACHED_AMENDMENT_SOURCES.entries()) {
    const source = draft.sourceDocuments[index];
    assert(isPlainObject(source) && source.path === expected.path && source.role === expected.role, `nonattached output amendment sourceDocuments[${index}] changed.`);
    records.push(auditPointer(source, `nonattached output amendment sourceDocuments[${index}]`, {
      expectedPath: expected.path,
      extraExpected: { role: expected.role }
    }));
  }
  assert(isPlainObject(draft.scope), "nonattached output amendment scope is absent.");
  assert(draft.scope.targetSchemaVersion === 1, "nonattached output amendment target schema version changed.");
  records.push(auditPointer({
    path: draft.scope.targetSchemaPath,
    sha256: draft.scope.targetSchemaSha256
  }, "nonattached output amendment scope target schema", {
    expectedPath: ROOTS.osIsolationProofSchema.path
  }));
  return records;
}

function auditNonattachedOutputOwnerAcceptance(acceptance) {
  assert(acceptance.version === 1 && acceptance.kind === "p3-r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance", "nonattached output owner acceptance identity changed.");
  assert(acceptance.recordState === "finalized" && acceptance.ownerApproved === true && acceptance.p11Authorization === "NOT_AUTHORIZED", "nonattached output owner acceptance state changed.");
  return [auditPointer(acceptance.acceptedDraft, "nonattached output owner acceptance accepted draft", {
    expectedPath: ROOTS.nonattachedOutputAmendmentDraft.path
  })];
}

function auditReadBoundaryContract(contract) {
  assert(contract.version === 1 && contract.kind === "p3-r5-ordinal3-role-read-boundary-guard-contract", "read-boundary contract identity changed.");
  assert(contract.status === "review-only-synthetic-draft-not-evidence" && contract.recordState === "review-only" && contract.effective === false, "read-boundary contract state changed.");
  const records = [
    auditFileNamePointer(contract.derivedFrom, "read-boundary contract derived-from", "r5-ordinal3-ambient-input-provenance-synthetic-probe-design.md")
  ];
  assert(isPlainObject(contract.schemaRelation) && contract.schemaRelation.mode === "no-amendment", "read-boundary contract schema relation changed.");
  records.push(auditFileNamePointer({
    fileName: contract.schemaRelation.fileName,
    sha256: contract.schemaRelation.sha256
  }, "read-boundary contract schema relation", "r5-ordinal3-os-isolation-proof-schema.json"));
  const syntheticArtifact = contract.guardContract?.tupleAllowlistRequired?.syntheticArtifact;
  exactKeys(syntheticArtifact, ["fileName", "sha256", "mode"], "read-boundary contract synthetic tuple allowlist");
  assert(syntheticArtifact.mode === "synthetic-fixture-fixed-policy-not-runtime-authorization", "read-boundary contract synthetic tuple allowlist mode changed.");
  records.push(auditFileNamePointer({
    fileName: syntheticArtifact.fileName,
    sha256: syntheticArtifact.sha256
  }, "read-boundary contract synthetic tuple allowlist", "r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist.json"));
  return records;
}

function auditReadBoundaryTupleAllowlist(allowlist) {
  assert(allowlist.version === 1 && allowlist.kind === "p3-r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist", "read-boundary tuple allowlist identity changed.");
  assert(allowlist.recordState === "review-only" && allowlist.effective === false && allowlist.syntheticOnly === true, "read-boundary tuple allowlist state changed.");
  assert(Array.isArray(allowlist.tuples) && allowlist.tuples.length > 0, "read-boundary tuple allowlist tuples are absent.");
  return [];
}

function auditReadBoundaryReleaseDraft(release) {
  assert(release.version === 1 && release.kind === "p3-r5-ordinal3-role-read-boundary-guard-contract-release", "read-boundary release identity changed.");
  assert(release.recordState === "review-only" && release.effective === false && release.syntheticOnly === true, "read-boundary release state changed.");
  assertPathSequence(release.sourceFiles, READ_BOUNDARY_RELEASE_SOURCE_FILE_NAMES, "read-boundary release sourceFiles", "fileName");
  return release.sourceFiles.map((source, index) => auditFileNamePointer(source, `read-boundary release sourceFiles[${index}]`, READ_BOUNDARY_RELEASE_SOURCE_FILE_NAMES[index]));
}

function auditOsIsolationProofSchema(schema) {
  assert(schema.version === 1 && schema.kind === "p3-r5-ordinal3-external-os-isolation-proof-schema", "OS-isolation proof schema identity changed.");
  assert(schema.status === "draft-not-evidence", "OS-isolation proof schema state changed.");
  return [];
}

function auditStructuredSourceClosure(documents, rootInventory) {
  const records = [
    ...auditCandidateContext(documents.candidateDesign.document),
    ...auditOwnerZeroCostV1(documents.ownerZeroCostV1.document),
    ...auditOwnerZeroCostV2(documents.ownerZeroCostV2.document),
    ...auditOwnerZeroCostV3(documents.ownerZeroCostV3.document),
    ...auditCurrentOwnerTemplate(documents.currentOwnerTemplate.document),
    ...auditOwnerTemplateV2CorrectionDraft(documents.ownerTemplateV2CorrectionDraft.document),
    ...auditOwnerZeroCostV4CorrectionDraft(documents.ownerZeroCostV4CorrectionDraft.document),
    ...auditOfflineNonceSubmissionDraft(documents.offlineNonceSubmissionDraft.document),
    ...auditOfflineNonceSubmissionV2CorrectionDraft(documents.offlineNonceSubmissionV2CorrectionDraft.document),
    ...auditOwnerStage1ContentApproval(documents.ownerStage1ContentApproval.document),
    ...auditOwnerStage1ContentApprovalV2Correction(documents.ownerStage1ContentApprovalV2Correction.document),
    ...auditNonattachedOutputAmendmentDraft(documents.nonattachedOutputAmendmentDraft.document),
    ...auditNonattachedOutputOwnerAcceptance(documents.nonattachedOutputOwnerAcceptance.document),
    ...auditReadBoundaryContract(documents.readBoundaryContract.document),
    ...auditReadBoundaryTupleAllowlist(documents.readBoundaryTupleAllowlist.document),
    ...auditReadBoundaryReleaseDraft(documents.readBoundaryReleaseDraft.document),
    ...auditOsIsolationProofSchema(documents.osIsolationProofSchema.document)
  ];
  const mismatches = records.filter((record) => !record.matched);
  const rootRecords = Object.values(documents).map(({ key, path, sha256: hash, repositorySerializationConforming }) => ({
    key,
    path,
    sha256: hash,
    matched: true,
    repositorySerializationConforming
  }));
  return {
    status: mismatches.length === 0 ? "pass-current-structured-source-closure" : "fail-closed-current-structured-source-pin-mismatch",
    scope: "All current tools/r5-ordinal3*.json roots plus the fixed ordinal-3 candidate design. Historical zero-cost v1/v2 records are parsed and their successor lineage edges are byte-verified, but their own historical source snapshots are not reclassified as current source-closure failures.",
    rootCount: rootRecords.length,
    rootInventory,
    rootRecords,
    nonBlockingFormatDiagnostic: documents.osIsolationProofSchema.repositorySerializationConforming === false
      ? "The exact-byte-pinned OS-isolation schema has legacy noncanonical repository serialization. Its UTF-8, BOM, NUL, duplicate-key, JSON, root-byte, and typed-edge checks passed; this audit does not rewrite it."
      : null,
    sourcePointerCount: records.length,
    verifiedPointerCount: records.length - mismatches.length,
    records,
    mismatches,
    historicalLineageBoundary: {
      status: "byte-pinned-predecessor-records-only",
      statement: "The zero-cost v3 predecessor reference is byte-verified. This audit does not recursively reclassify source snapshots inside historical zero-cost v1/v2 lineage records as current source-closure failures."
    },
    reviewOnlyCorrectionBoundary: {
      status: "correction-drafts-do-not-replace-predecessors",
      statement: "The offline nonce v2 correction draft is parsed as a non-effective owner-review-only successor proposal. Its current source pins do not cure, replace, or reclassify the v1 draft's stale candidate source snapshot before a separately finalized successor exists."
    },
    stage1ContentApprovalBoundary: {
      status: "owner-approved-content-only-not-operational-authority",
      statement: "The Stage-1 owner approval binds the three correction-draft bytes and the adopted append-only rule. It does not finalize a correction or successor, publish, activate a runtime, deliver or launch a role, implement, handle a return, measure, gate, or change P-11."
    },
    stage1ContentApprovalV2CorrectionBoundary: {
      status: "reference-only-append-only-correction-no-operational-authority",
      statement: "The Stage-1 v2 correction is a reference-only append-only successor that binds the original approval record and restates the three draft pins. Hash-pinned documents are never in-place edited; changes require a new version-numbered file, while old bytes, record, and pin remain reference-only history."
    }
  };
}

function runAudit() {
  const documents = Object.fromEntries(Object.keys(ROOTS).map((key) => [key, readPinnedRoot(key)]));
  const rootInventory = auditRootInventory();
  const executionReadClosure = auditExecutionReadClosure(documents.provenanceManifest.document);
  const structuredSourceClosure = auditStructuredSourceClosure(documents, rootInventory);
  const pass = executionReadClosure.mismatches.length === 0 && structuredSourceClosure.mismatches.length === 0;
  return {
    status: pass ? "pass-review-only-not-runtime-evidence" : "fail-closed-review-only-not-runtime-evidence",
    ...OUTPUT_BOUNDARY,
    executionReadClosure,
    structuredSourceClosure,
    selfIntegrityBoundary: "This checker does not byte-pin or attest its own source. Its result is a workspace-only observation of the fixed root inventory and typed source edges at this invocation.",
    requiredInterpretation: "A passing manifest-declared execution/read closure is not proof that every structured sourceDocuments pin is current. Any structured source-pin mismatch leaves the structured closure failed and does not authorize a successor, publication, delivery, launch, implementation, return operation, measurement, gate, or P-11 change."
  };
}

function expectRejected(name, fragment, callback) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(fragment), `self-test ${name} rejected with an unexpected message: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  fail(`self-test ${name} did not reject.`);
}

function classifyPointerMatch(declaredSha256, actualSha256) {
  assertHex(declaredSha256, "fixture declared SHA-256");
  assertHex(actualSha256, "fixture actual SHA-256");
  return declaredSha256 === actualSha256;
}

function runSelfTest() {
  const goodPath = ROOTS.candidateDesign.path;
  assertAllowedPath(goodPath, STRUCTURED_ALLOWED_PATHS, "self-test allowed path");
  expectRejected("path-traversal", "unsafe path component", () => workspacePath("tools/../outside.json", "self-test traversal"));
  expectRejected("absolute-path", "workspace-relative POSIX", () => workspacePath("/tmp/outside.json", "self-test absolute"));
  expectRejected("drive-path", "workspace-relative POSIX", () => workspacePath("C:/outside.json", "self-test drive"));
  expectRejected("backslash-path", "workspace-relative POSIX", () => workspacePath("tools\\outside.json", "self-test backslash"));
  expectRejected("unlisted-path", "fixed allowlist", () => assertAllowedPath("tools/unlisted.json", STRUCTURED_ALLOWED_PATHS, "self-test unlisted"));
  expectRejected("duplicate-key", "duplicate JSON key", () => parseCanonicalJsonBytes(Buffer.from('{\n  "x": 1,\n  "x": 2\n}\n', "utf8"), "self-test duplicate"));
  expectRejected("bom", "UTF-8 BOM", () => parseCanonicalJsonBytes(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a]), "self-test BOM"));
  expectRejected("nul", "NUL byte", () => parseCanonicalJsonBytes(Buffer.from([0x7b, 0x00, 0x7d, 0x0a]), "self-test NUL"));
  expectRejected("invalid-utf8", "not valid UTF-8", () => parseCanonicalJsonBytes(Buffer.from([0xc3, 0x28]), "self-test invalid UTF-8"));
  expectRejected("noncanonical-root", "canonical UTF-8 JSON", () => parseCanonicalJsonBytes(Buffer.from("{\n\n}\n", "utf8"), "self-test noncanonical"));
  const legacyFormat = parseCanonicalJsonBytes(Buffer.from("{\n\n}\n", "utf8"), "self-test legacy format", { requireRepositorySerialization: false });
  assert(legacyFormat.repositorySerializationConforming === false, "self-test legacy format diagnostic changed.");
  expectRejected("missing-pointer-hash", "unsupported or missing keys", () => auditPointer({ path: goodPath }, "self-test missing pointer hash", { expectedPath: goodPath }));
  expectRejected("historical-lineage-wrong-predecessor", ".path changed", () => auditPointer({
    path: ROOTS.ownerZeroCostV2.path,
    sha256: "0".repeat(64),
    originalRecordRemainsImmutable: true
  }, "self-test historical lineage", {
    expectedPath: ROOTS.ownerZeroCostV1.path,
    extraExpected: { originalRecordRemainsImmutable: true }
  }));
  expectRejected("offline-correction-wrong-predecessor", ".path changed", () => auditPointer({
    path: ROOTS.candidateDesign.path,
    sha256: "0".repeat(64),
    predecessorRemainsUnmodified: true
  }, "self-test offline correction predecessor", {
    expectedPath: ROOTS.offlineNonceSubmissionDraft.path,
    extraExpected: { predecessorRemainsUnmodified: true }
  }));
  expectRejected("offline-correction-owner-approval", "state changed", () => auditOfflineNonceSubmissionV2CorrectionDraft({
    version: 2,
    kind: "p3-r5-ordinal3-offline-nonce-submission-volume-amendment-correction-draft",
    recordState: "owner-review-only-draft",
    ownerApprovalState: "APPROVED",
    effective: false
  }));
  expectRejected("stage1-content-approval-operational-effect", "state changed", () => auditOwnerStage1ContentApproval({
    version: 1,
    kind: "p3-r5-ordinal3-owner-stage1-content-approval",
    recordState: "finalized-owner-stage1-content-approval-only",
    appendOnly: true,
    effectiveForOperationalUse: true
  }));
  expectRejected("stage1-append-only-rule-mutation", ".separateOwnerFinalizedSuccessorRequired changed", () => assertStage1AppendOnlyRule({
    ...STAGE1_APPEND_ONLY_RULE,
    separateOwnerFinalizedSuccessorRequired: false
  }, "self-test stage-1 append-only rule"));
  expectRejected("stage1-v2-correction-operational-effect", "state changed", () => auditOwnerStage1ContentApprovalV2Correction({
    version: 2,
    kind: "p3-r5-ordinal3-owner-stage1-content-approval-correction",
    recordState: "finalized-owner-stage1-content-approval-correction-only",
    appendOnly: true,
    referenceOnly: true,
    effectiveForOperationalUse: true
  }));
  expectRejected("stage1-v2-exact-append-only-rule-mutation", ".changesCreateNewVersionNumberedFile changed", () => assertStage1V2AppendOnlyRule({
    ...STAGE1_V2_APPEND_ONLY_RULE,
    changesCreateNewVersionNumberedFile: false
  }, "self-test stage-1 v2 append-only rule"));
  expectRejected("root-inventory-unlisted-nonregular-entry", "regular non-link file", () => assertRootInventoryDirent({
    isFile: () => false,
    isSymbolicLink: () => true
  }, "self-test root inventory unlisted symlink"));
  expectRejected("root-inventory-drift", "root inventory changed", () => exactStringSet([ROOTS.currentOwnerTemplate.path], [ROOTS.currentOwnerTemplate.path, ROOTS.ownerTemplateV2CorrectionDraft.path], "self-test root inventory"));
  const regularStatus = { isFile: () => true, isSymbolicLink: () => false };
  assertRegularNonLinkFileStatus(regularStatus, { isFile: () => true, nlink: 1 }, "self-test regular file");
  expectRejected("symlink-file-status", "regular non-link", () => assertRegularNonLinkFileStatus({ isFile: () => true, isSymbolicLink: () => true }, { isFile: () => true, nlink: 1 }, "self-test symlink file"));
  expectRejected("hardlink-file-status", "non-hard-linked", () => assertRegularNonLinkFileStatus(regularStatus, { isFile: () => true, nlink: 2 }, "self-test hardlink file"));
  expectRejected("symlink-ancestor-status", "symbolic link or junction", () => assertSafePathComponentStatus({ isSymbolicLink: () => true, isDirectory: () => true }, { mustBeDirectory: true }, "self-test symlink ancestor"));
  const mismatch = classifyPointerMatch("0".repeat(64), "1".repeat(64));
  assert(mismatch === false, "self-test hash mismatch must remain a failed pointer.");
  process.stdout.write(`${JSON.stringify({
    schema: RESULT_SCHEMA,
    status: "self-test-passed-review-only-not-runtime-evidence",
    ...OUTPUT_BOUNDARY,
    fixtureStorage: "in-memory-only with filesystem-status test seams",
    tests: 27
  }, null, 2)}\n`);
}

function writeFailure(error) {
  process.stdout.write(`${JSON.stringify({
    schema: RESULT_SCHEMA,
    status: "failed-closed-invalid-or-unreadable-workspace-input",
    ...OUTPUT_BOUNDARY,
    failure: error instanceof Error ? error.message : String(error)
  }, null, 2)}\n`);
}

function main() {
  if (process.argv.length !== 3) fail("Usage: node tools/r5-ordinal3-structured-source-pin-closure-audit.mjs --check|--self-test");
  if (process.argv[2] === "--self-test") return runSelfTest();
  if (process.argv[2] !== "--check") fail("Usage: node tools/r5-ordinal3-structured-source-pin-closure-audit.mjs --check|--self-test");
  const result = runAudit();
  process.stdout.write(`${JSON.stringify({ schema: RESULT_SCHEMA, ...result }, null, 2)}\n`);
  if (result.status !== "pass-review-only-not-runtime-evidence") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  writeFailure(error);
  process.exitCode = 1;
}
