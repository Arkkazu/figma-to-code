// Stage-2 source-pin correction acceptance-candidate audit, v2.
// Fixed-input, workspace-only, read-only. It creates no owner acceptance,
// finalization, publication, runtime, delivery, launch, implementation,
// measurement, gate, or P-11 state.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, "..");
const RESULT_SCHEMA = "p3-r5-ordinal3-source-pin-correction-acceptance-candidate-audit/v2";

const ROOTS = Object.freeze({
  stage1: Object.freeze({
    path: "tools/r5-ordinal3-owner-stage1-content-approval-v2-correction.json",
    sha256: "23331c129b87657f7515d8bd91a15b13f77781b6bd7bc25ce2316d6bf2ba0bd8"
  }),
  t: Object.freeze({
    path: "tools/r5-ordinal3-external-boundary-owner-decision-template-v2-source-pin-correction-acceptance-candidate.json",
    sha256: "9d2806d017746b69463832368ad73d54abdaf285a152696e3d3abf403d98dba3"
  }),
  z: Object.freeze({
    path: "tools/r5-ordinal3-owner-zero-cost-constraint-v4-source-pin-correction-acceptance-candidate.json",
    sha256: "9d864520d5e17ebaa8311c969bdf1d40171e046c3ac0eed76834107cdf3b0173"
  }),
  o: Object.freeze({
    path: "tools/r5-ordinal3-offline-nonce-submission-volume-amendment-v2-source-pin-correction-acceptance-candidate.json",
    sha256: "c780df2501beeb748f93142c40cdb22cc02a956b51bdd3a877908e09d08e72c2"
  }),
  templateDraft: Object.freeze({
    path: "tools/r5-ordinal3-external-boundary-owner-decision-template-v2-correction-draft.json",
    sha256: "b5d39e0c3254d7b962f2e190b49b83647aa0d16d25c82ffb6022932e82e24da1"
  }),
  zeroDraft: Object.freeze({
    path: "tools/r5-ordinal3-owner-zero-cost-constraint-v4-correction-draft.json",
    sha256: "e69043ad4708c16a383b7ce2f8a4f2d69956705b180decee3be56044beb66c18"
  }),
  offlineDraft: Object.freeze({
    path: "tools/r5-ordinal3-offline-nonce-submission-volume-amendment-v2-correction-draft.json",
    sha256: "bdfa34fce0d5779f80cb8f7cc2af60169f45353d0853de8db987d520e90047c7"
  }),
  legacyTemplate: Object.freeze({
    path: "tools/r5-ordinal3-external-boundary-owner-decision-template.json",
    sha256: "b7ac0c19c4669a4695e760860552058fc2967ddbe9d5766b4df86af7059029f6"
  }),
  legacyOffline: Object.freeze({
    path: "tools/r5-ordinal3-offline-nonce-submission-volume-amendment-draft.json",
    sha256: "afdb56caddb599c4aac5eb50c5ffb1e9d06cfe903a27df571d9a976519815181"
  }),
  zeroV3: Object.freeze({
    path: "tools/r5-ordinal3-owner-zero-cost-constraint-v3.json",
    sha256: "ba5b5200a572f49bad245b9d343f4983a0f994249eb1d2e6db89a0586fc35b18"
  })
});

const PINS = Object.freeze({
  [ROOTS.stage1.path]: ROOTS.stage1.sha256,
  [ROOTS.t.path]: ROOTS.t.sha256,
  [ROOTS.z.path]: ROOTS.z.sha256,
  [ROOTS.o.path]: ROOTS.o.sha256,
  [ROOTS.templateDraft.path]: ROOTS.templateDraft.sha256,
  [ROOTS.zeroDraft.path]: ROOTS.zeroDraft.sha256,
  [ROOTS.offlineDraft.path]: ROOTS.offlineDraft.sha256,
  [ROOTS.legacyTemplate.path]: ROOTS.legacyTemplate.sha256,
  [ROOTS.legacyOffline.path]: ROOTS.legacyOffline.sha256,
  [ROOTS.zeroV3.path]: ROOTS.zeroV3.sha256,
  "tools/r5-baseline-reissue-3-candidate-design.json": "4c56ecb4a75f12b9fedf2e5b1ac676fdc60dad877c4eead15e76a630eff05955",
  "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md": "f3a0ea86270038e62278f97f6d2fa4f75b6c85fb103052a16ae56571877688b3",
  "tools/r5-ordinal3-fixed-exporter-design.md": "8a1ce2913f14e55a823ee59c2e140a88b8f328550efaa6bc3415d5d4e995951a",
  "tools/r5-ordinal3-hyperv-capability-preflight.ps1": "f379daf025cb79e093660cf85aed6429f2f2eaf6d8d62c571165de6c47b2cde7",
  "tools/r5-ordinal3-hyperv-capability-probe-design.md": "c4a2d4c684e9768a3af7bc150452a19e2a834e45ee220341d7acf378cea58228",
  "tools/r5-ordinal3-hyperv-evidence-collector-decision.md": "b62fcf92f152ba16f9ebc6c6ec30e58dd32ddad02dc28503525dd6b82cea1353",
  "tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json": "b7960c5509ea50ed27d18ad636f0f12c5c712444a84de0765068f416b27b28a0",
  "tools/r5-ordinal3-nonattached-output-evidence-validator.mjs": "87ff3f44ae9dbf5c735ccff4f239824600e9da2e0ea610b1f36fad731def6a23",
  "tools/r5-ordinal3-os-isolation-proof-schema.json": "c17a30f3fd2b84c897635b0f0eb645e3633d3b19418d99c41a7cd8fb5d031403",
  "tools/r5-ordinal3-zero-cost-external-boundary-feasibility.md": "22d50e6e3f38a39aa99c01a9c5258af0b06ef4ff73f7915b43dc1e5fad38a45c",
  "tools/r5-ordinal3-zero-cost-local-hardware-inventory.md": "f6641a3de0bbb6d6fa5a0519b6b34b5e5984942369a481f2e49287b03e7e049c"
});

const CANDIDATE_PATHS = Object.freeze([ROOTS.t.path, ROOTS.z.path, ROOTS.o.path]);
const FINAL_ACCEPTANCE_NAME = /^r5-ordinal3-.*source-pin-correction-acceptance\.json$/;
const TEMPLATE_SOURCES = Object.freeze([
  "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md",
  "tools/r5-ordinal3-nonattached-output-evidence-validator.mjs",
  "tools/r5-ordinal3-hyperv-capability-preflight.ps1"
]);
const OFFLINE_SOURCES = Object.freeze([
  "tools/r5-baseline-reissue-3-candidate-design.json",
  "tools/r5-ordinal3-os-isolation-proof-schema.json",
  "tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json",
  "tools/r5-ordinal3-hyperv-capability-probe-design.md",
  "tools/r5-ordinal3-hyperv-evidence-collector-decision.md"
]);
const ZERO_BINDINGS = Object.freeze([
  "tools/r5-ordinal3-external-verifier-boundary-requirements-draft.md",
  ROOTS.templateDraft.path,
  "tools/r5-ordinal3-zero-cost-external-boundary-feasibility.md",
  "tools/r5-ordinal3-zero-cost-local-hardware-inventory.md"
]);
const STAGE1_DRAFTS = Object.freeze([ROOTS.templateDraft.path, ROOTS.zeroDraft.path, ROOTS.offlineDraft.path]);
const NO_AUTHORIZATION = Object.freeze([
  "provider selection",
  "external account access",
  "purchase or subscription",
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
  accessibilityMotionOrGateAuthorized: false,
  p11Authorization: "NOT_AUTHORIZED",
  actionsPermittedByThisAudit: Object.freeze([])
});

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function hex(value, label) { assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), label + " must be lowercase SHA-256 hex."); }

function keys(value, expected, label) {
  assert(plain(value), label + " must be an object.");
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), label + " has unsupported or missing keys.");
}

function sameSet(actualValues, expectedValues, label) {
  assert(Array.isArray(actualValues), label + " must be an array.");
  const actual = [...actualValues].sort();
  const expected = [...expectedValues].sort();
  assert(actual.length === expected.length && actual.every((value, index) => value === expected[index]), label + " changed.");
}

function realpath(path) { return realpathSync.native ? realpathSync.native(path) : realpathSync(path); }
function within(parent, child) {
  const route = relative(parent, child);
  return route === "" || (!isAbsolute(route) && !route.split(/[\\/]+/).includes(".."));
}

function localPath(logicalPath, label) {
  assert(typeof logicalPath === "string" && logicalPath.length > 0, label + " must be a nonempty workspace-relative POSIX path.");
  assert(!logicalPath.includes("\\") && !logicalPath.includes(":") && !logicalPath.startsWith("/"), label + " must be workspace-relative POSIX.");
  const segments = logicalPath.split("/");
  assert(segments.every((part) => part.length > 0 && part !== "." && part !== ".."), label + " contains an unsafe path component.");
  const target = resolve(WORKSPACE_ROOT, ...segments);
  assert(target !== WORKSPACE_ROOT && within(WORKSPACE_ROOT, target), label + " escapes the workspace.");
  return target;
}

function allowed(logicalPath, label) {
  localPath(logicalPath, label);
  assert(Object.prototype.hasOwnProperty.call(PINS, logicalPath), label + " is not in this audit's fixed allowlist.");
}

function component(status, directory, label) {
  assert(!status.isSymbolicLink(), label + " contains a symbolic link or junction.");
  if (directory) assert(status.isDirectory(), label + " has a non-directory ancestor.");
}

function regular(lstat, stat, label) {
  assert(lstat.isFile() && !lstat.isSymbolicLink(), label + " is not a regular non-link file.");
  assert(stat.isFile(), label + " is not a regular file after stat.");
  assert(typeof stat.nlink === "number" && Number.isInteger(stat.nlink) && stat.nlink === 1, label + " must be a non-hard-linked regular file.");
}

function noLinks(path, label) {
  const root = resolve(WORKSPACE_ROOT);
  const target = resolve(path);
  const route = relative(root, target);
  assert(route && within(root, target), label + " escapes the workspace.");
  try {
    component(lstatSync(root), true, label + " workspace root");
    let cursor = root;
    const pieces = route.split(/[\\/]+/).filter(Boolean);
    assert(pieces.length > 0, label + " resolves to the workspace root.");
    for (let index = 0; index < pieces.length; index += 1) {
      cursor = resolve(cursor, pieces[index]);
      component(lstatSync(cursor), index < pieces.length - 1, label);
    }
    assert(realpath(root) !== realpath(target) && within(realpath(root), realpath(target)), label + " resolves outside the workspace.");
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    fail(label + " has a missing or unreadable path component.");
  }
}

function readRegular(path, label) {
  noLinks(path, label);
  const ls = lstatSync(path);
  const st = statSync(path);
  regular(ls, st, label);
  return readFileSync(path);
}

function jsonWhitespace(character) {
  return character === " " || character === "\n" || character === "\r" || character === "\t";
}

function noDuplicateJsonKeys(text, label) {
  let index = 0;
  const skip = () => { while (index < text.length && jsonWhitespace(text[index])) index += 1; };
  const expect = (character, message) => { assert(text[index] === character, label + " " + message); index += 1; };
  const stringValue = () => {
    assert(text[index] === "\"", label + " contains an invalid JSON string.");
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "\"") {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); }
        catch (error) { fail(label + " contains an invalid JSON string: " + error.message); }
      }
      if (character === "\\") {
        index += 1;
        assert(index < text.length, label + " contains an unterminated JSON escape.");
        const escape = text[index];
        assert('"\\/bfnrtu'.includes(escape), label + " contains an invalid JSON escape.");
        if (escape === "u") {
          assert(index + 4 < text.length, label + " contains a truncated JSON unicode escape.");
          for (let offset = 1; offset <= 4; offset += 1) assert(/[0-9a-fA-F]/.test(text[index + offset]), label + " contains an invalid JSON unicode escape.");
          index += 5;
        } else index += 1;
        continue;
      }
      assert(character.charCodeAt(0) >= 0x20, label + " contains an unescaped control character.");
      index += 1;
    }
    fail(label + " contains an unterminated JSON string.");
  };
  const value = () => {
    skip();
    const character = text[index];
    if (character === "{") {
      index += 1;
      skip();
      const seen = new Set();
      if (text[index] === "}") { index += 1; return; }
      while (true) {
        skip();
        const key = stringValue();
        assert(!seen.has(key), label + " contains a duplicate JSON key: " + key + ".");
        seen.add(key);
        skip();
        expect(":", "contains an object key without a colon.");
        value();
        skip();
        if (text[index] === "}") { index += 1; return; }
        expect(",", "contains an object member without a comma.");
      }
    }
    if (character === "[") {
      index += 1;
      skip();
      if (text[index] === "]") { index += 1; return; }
      while (true) {
        value();
        skip();
        if (text[index] === "]") { index += 1; return; }
        expect(",", "contains an array member without a comma.");
      }
    }
    if (character === "\"") { stringValue(); return; }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) { index += literal.length; return; }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    assert(number !== null, label + " contains an invalid JSON value.");
    index += number[0].length;
  };
  value();
  skip();
  assert(index === text.length, label + " contains trailing JSON data.");
}

function parseCanonicalJson(bytes, label) {
  assert(Buffer.isBuffer(bytes), label + " must be read as bytes.");
  assert(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), label + " must not contain a UTF-8 BOM.");
  assert(!bytes.includes(0), label + " must not contain a NUL byte.");
  const text = bytes.toString("utf8");
  assert(Buffer.from(text, "utf8").equals(bytes), label + " is not valid UTF-8.");
  noDuplicateJsonKeys(text, label);
  let document;
  try { document = JSON.parse(text); }
  catch (error) { fail(label + " must be valid JSON: " + error.message); }
  assert(JSON.stringify(document, null, 2) + "\n" === text, label + " must use canonical UTF-8 JSON.");
  return document;
}

function loadJson(root, label) {
  const bytes = readRegular(localPath(root.path, label), label);
  const actualSha256 = sha256(bytes);
  assert(actualSha256 === root.sha256, label + " raw SHA-256 pin changed.");
  return { document: parseCanonicalJson(bytes, label), actualSha256 };
}

function pointer(value, label, expectedPath, extras) {
  const extra = extras || {};
  keys(value, ["path", "sha256", ...Object.keys(extra)], label);
  for (const [key, expected] of Object.entries(extra)) assert(value[key] === expected, label + "." + key + " changed.");
  allowed(value.path, label + ".path");
  assert(value.path === expectedPath, label + ".path changed.");
  hex(value.sha256, label + ".sha256");
  const expectedSha256 = PINS[value.path];
  const actualSha256 = sha256(readRegular(localPath(value.path, label + ".path"), label));
  return {
    label,
    path: value.path,
    declaredSha256: value.sha256,
    expectedSha256,
    actualSha256,
    matched: value.sha256 === expectedSha256 && actualSha256 === expectedSha256
  };
}

function sourcePaths(items, expected, label) {
  assert(Array.isArray(items) && items.length === expected.length, label + " has an unexpected source count.");
  for (let index = 0; index < expected.length; index += 1) {
    assert(plain(items[index]) && items[index].path === expected[index], label + "[" + index + "] path changed.");
  }
}

function candidateDirent(entry, label) {
  assert(entry && typeof entry.isFile === "function" && typeof entry.isSymbolicLink === "function", label + " has an unreadable directory entry.");
  assert(entry.isFile() && !entry.isSymbolicLink(), label + " must be a regular non-link file.");
}

function finalAcceptanceDirent(entry, label) {
  assert(entry && typeof entry.isFile === "function" && typeof entry.isSymbolicLink === "function", label + " has an unreadable directory entry.");
  assert(entry.isFile() && !entry.isSymbolicLink(), label + " must be a regular non-link file.");
}

function inventory() {
  const directory = localPath("tools", "candidate inventory tools directory");
  noLinks(directory, "candidate inventory tools directory");
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => /^r5-ordinal3-.*source-pin-correction-acceptance-candidate\.json$/.test(entry.name));
  const observed = entries.map((entry) => {
    const path = "tools/" + entry.name;
    const label = "candidate inventory " + path;
    candidateDirent(entry, label);
    readRegular(localPath(path, label), label);
    return path;
  });
  sameSet(observed, CANDIDATE_PATHS, "source-pin correction acceptance-candidate inventory");
  return {
    status: "pass-exact-fixed-source-pin-correction-acceptance-candidate-inventory",
    count: CANDIDATE_PATHS.length,
    paths: [...CANDIDATE_PATHS].sort()
  };
}

function finalizationState(observedPaths) {
  assert(Array.isArray(observedPaths), "Stage-2 finalization inventory must be an array.");
  const paths = [...observedPaths].sort();
  const absent = paths.length === 0;
  return {
    status: absent
      ? "absent-stage2-owner-finalization-approval-required"
      : "present-stage2-owner-finalization-record-not-accepted-by-candidate-audit",
    ownerFinalizationRecordObserved: !absent,
    observedFinalizationPaths: paths
  };
}

function finalizationInventory() {
  const directory = localPath("tools", "Stage-2 finalization inventory tools directory");
  noLinks(directory, "Stage-2 finalization inventory tools directory");
  const observed = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => FINAL_ACCEPTANCE_NAME.test(entry.name))
    .map((entry) => {
      const path = "tools/" + entry.name;
      finalAcceptanceDirent(entry, "Stage-2 finalization inventory " + path);
      return path;
    });
  return finalizationState(observed);
}

function noAuthority(value, label) {
  keys(value, [
    "doesNotFinalizeOwnerDecision", "doesNotAuthorizePublication", "doesNotCreateRuntimeVmOrSandbox",
    "doesNotAuthorizeP3RoleAction", "doesNotAuthorize", "p11Authorization"
  ], label);
  assert(value.doesNotFinalizeOwnerDecision === true && value.doesNotAuthorizePublication === true, label + " finalization/publication boundary changed.");
  assert(value.doesNotCreateRuntimeVmOrSandbox === true && value.doesNotAuthorizeP3RoleAction === true, label + " runtime/P-3 authority boundary changed.");
  sameSet(value.doesNotAuthorize, NO_AUTHORIZATION, label + ".doesNotAuthorize");
  assert(value.p11Authorization === "NOT_AUTHORIZED", label + ".p11Authorization changed.");
}

function candidateBase(value, label, kind) {
  assert(value.version === 1 && value.kind === kind, label + " identity changed.");
  assert(value.recordState === "owner-stage2-finalization-candidate" && value.candidateOnly === true, label + " record state changed.");
  assert(value.ownerApproved === false && value.ownerApprovalState === "REQUIRED_STAGE2_FINALIZATION_APPROVAL" && value.effective === false, label + " acceptance state changed.");
  assert(value.p11Authorization === "NOT_AUTHORIZED", label + " P-11 boundary changed.");
}

function templateState(value, label) {
  keys(value, [
    "acceptedTemplateRemainsOwnerInputRequired", "templateOwnerDecisionFinalized", "allRequiredOwnerDecisionsRemainUnset"
  ], label);
  assert(value.acceptedTemplateRemainsOwnerInputRequired === true && value.templateOwnerDecisionFinalized === false && value.allRequiredOwnerDecisionsRemainUnset === true, label + " changed.");
}

function requiredOwnerDecisionsUnset(value, label) {
  keys(value, ["externalVerifier", "transmitOnlyTransport", "runtimeAndMeasurement", "evidenceAndRetention", "scope"], label);
  keys(value.externalVerifier, ["providerOrOperator", "trustAnchorAndKeyCustody", "dataResidencyAndJurisdiction", "accountAndCostAuthority"], label + ".externalVerifier");
  keys(value.transmitOnlyTransport, ["deviceOrIndependentlyAuditedService", "independentAdministrationBoundary", "injectionDenialTestAuthority"], label + ".transmitOnlyTransport");
  keys(value.runtimeAndMeasurement, ["attesterAndProtectedMeasurementAgentSubstrate", "trustedTimeSource", "allRuntimeInputPlaneClosurePlan"], label + ".runtimeAndMeasurement");
  keys(value.evidenceAndRetention, ["coverageManifestOwnerAndAudit", "metadataRetentionBackupDeletionPolicy", "independentAuditBudgetAndOperator"], label + ".evidenceAndRetention");
  keys(value.scope, ["p3FreeSyntheticProbeProvisioning", "explicitlyExcludesP3DeliveryLaunchImplementation", "p11Authorization"], label + ".scope");
  const required = [
    value.externalVerifier.providerOrOperator,
    value.externalVerifier.trustAnchorAndKeyCustody,
    value.externalVerifier.dataResidencyAndJurisdiction,
    value.externalVerifier.accountAndCostAuthority,
    value.transmitOnlyTransport.deviceOrIndependentlyAuditedService,
    value.transmitOnlyTransport.independentAdministrationBoundary,
    value.transmitOnlyTransport.injectionDenialTestAuthority,
    value.runtimeAndMeasurement.attesterAndProtectedMeasurementAgentSubstrate,
    value.runtimeAndMeasurement.trustedTimeSource,
    value.runtimeAndMeasurement.allRuntimeInputPlaneClosurePlan,
    value.evidenceAndRetention.coverageManifestOwnerAndAudit,
    value.evidenceAndRetention.metadataRetentionBackupDeletionPolicy,
    value.evidenceAndRetention.independentAuditBudgetAndOperator,
    value.scope.p3FreeSyntheticProbeProvisioning
  ];
  assert(required.every((item) => item === "REQUIRED_UNSET"), label + " contains a finalized owner decision.");
  assert(value.scope.explicitlyExcludesP3DeliveryLaunchImplementation === true && value.scope.p11Authorization === "NOT_AUTHORIZED", label + " P-3/P-11 boundary changed.");
}

function stage1Records() {
  const document = loadJson(ROOTS.stage1, "Stage-1 v2 approval").document;
  assert(document.recordState === "finalized-owner-stage1-content-approval-correction-only" && document.ownerApproved === true && document.effectiveForOperationalUse === false && document.p11Authorization === "NOT_AUTHORIZED", "Stage-1 v2 approval state changed.");
  sourcePaths(document.approvedCorrectionDrafts, STAGE1_DRAFTS, "Stage-1 v2 approved correction drafts");
  const records = document.approvedCorrectionDrafts.map((item, index) => pointer(item, "Stage-1 v2 approved correction drafts[" + index + "]", STAGE1_DRAFTS[index]));
  const rule = document.adoptedAppendOnlyRule;
  assert(plain(rule) && rule.exactRule === "hash-pinned documents never in-place edited; changes create NEW VERSION-NUMBERED FILE; old bytes/record/pin remain reference-only history.", "Stage-1 v2 append-only rule changed.");
  assert(rule.hashPinnedDocumentsNeverInPlaceEdited === true && rule.changesCreateNewVersionNumberedFile === true && rule.oldBytesRecordAndPinRemainReferenceOnlyHistory === true, "Stage-1 v2 append-only rule boundary changed.");
  return records;
}

function templateDraftRecords() {
  const document = loadJson(ROOTS.templateDraft, "template correction draft").document;
  assert(document.version === 2 && document.recordState === "owner-review-only-draft" && document.effective === false && document.appendOnlySuccessorRequiredIfFinalized === true, "template correction draft state changed.");
  sourcePaths(document.sourceDocuments, TEMPLATE_SOURCES, "template correction draft sourceDocuments");
  const records = document.sourceDocuments.map((item, index) => pointer(item, "template correction draft sourceDocuments[" + index + "]", TEMPLATE_SOURCES[index]));
  const correction = document.correction;
  keys(correction, ["field", "path", "predecessorDeclaredSha256", "currentWorkspaceSha256", "historicalBytesRecovered", "requiresOwnerFinalizationBeforeUse"], "template correction draft correction");
  assert(correction.field === "sourceDocuments[2].sha256" && correction.path === TEMPLATE_SOURCES[2], "template correction draft target changed.");
  assert(correction.predecessorDeclaredSha256 === "0a3cb848af0b6eb3106c7fc33d53ec1c5d92057b81fad79bb0f8c7fb67b4dbec" && correction.currentWorkspaceSha256 === PINS[TEMPLATE_SOURCES[2]], "template correction draft snapshot pins changed.");
  assert(correction.historicalBytesRecovered === false && correction.requiresOwnerFinalizationBeforeUse === true, "template correction draft finalization boundary changed.");
  requiredOwnerDecisionsUnset(document.requiredOwnerDecisions, "template correction draft required owner decisions");
  return records;
}

function zeroDraftRecords() {
  const document = loadJson(ROOTS.zeroDraft, "zero-cost correction draft").document;
  assert(document.version === 4 && document.recordState === "owner-review-only-draft" && document.ownerApprovalState === "REQUIRED_UNSET" && document.effectiveForSelection === false, "zero-cost correction draft state changed.");
  const records = [
    pointer(document.proposedSupersedesByReferenceOnly, "zero-cost correction draft predecessor", ROOTS.zeroV3.path, { predecessorRecordRemainsImmutable: true }),
    pointer(document.proposedCorrection && document.proposedCorrection.replacesBinding, "zero-cost correction draft replaced template binding", ROOTS.legacyTemplate.path),
    pointer(document.proposedCorrection && document.proposedCorrection.withReviewOnlyDraft, "zero-cost correction draft review-only template draft", ROOTS.templateDraft.path, { recordState: "owner-review-only-draft", effective: false })
  ];
  sourcePaths(document.proposedBindings, ZERO_BINDINGS, "zero-cost correction draft proposedBindings");
  document.proposedBindings.forEach((item, index) => records.push(pointer(item, "zero-cost correction draft proposedBindings[" + index + "]", ZERO_BINDINGS[index])));
  assert(document.proposedConstraint && document.proposedConstraint.currency === "JPY" && document.proposedConstraint.maximumIncrementalSpend === 0 && document.proposedCorrection.doesNotSelectProviderOrTopology === true && document.proposedCorrection.requiresExplicitOwnerFinalization === true, "zero-cost correction draft constraint/finalization boundary changed.");
  return records;
}

function offlineDraftRecords() {
  const document = loadJson(ROOTS.offlineDraft, "offline correction draft").document;
  assert(document.version === 2 && document.recordState === "owner-review-only-draft" && document.ownerApprovalState === "REQUIRED_UNSET" && document.effective === false, "offline correction draft state changed.");
  sourcePaths(document.sourceDocuments, OFFLINE_SOURCES, "offline correction draft sourceDocuments");
  const records = document.sourceDocuments.map((item, index) => pointer(item, "offline correction draft sourceDocuments[" + index + "]", OFFLINE_SOURCES[index]));
  const correction = document.correction;
  keys(correction, ["field", "path", "predecessorDeclaredSha256", "currentWorkspaceSha256", "historicalBytesRecovered", "requiresOwnerFinalizationBeforeUse"], "offline correction draft correction");
  assert(correction.field === "sourceDocuments[0].sha256" && correction.path === OFFLINE_SOURCES[0], "offline correction draft target changed.");
  assert(correction.predecessorDeclaredSha256 === "811a84bb656bf43f168a3ae9e4d7a756d06a51fcab9e16304340d0271d9fe007" && correction.currentWorkspaceSha256 === PINS[OFFLINE_SOURCES[0]], "offline correction draft snapshot pins changed.");
  assert(correction.historicalBytesRecovered === false && correction.requiresOwnerFinalizationBeforeUse === true, "offline correction draft finalization boundary changed.");
  return records;
}

function tRecords(document) {
  keys(document, [
    "version", "kind", "recordState", "candidateOnly", "ownerApproved", "ownerApprovalState", "effective", "stage2Sequence",
    "stage1Approval", "acceptedCorrectionDraft", "predecessorTemplate", "templateState", "noAuthority", "p11Authorization"
  ], "T template acceptance candidate");
  candidateBase(document, "T template acceptance candidate", "p3-r5-ordinal3-external-boundary-owner-decision-template-source-pin-correction-acceptance-candidate");
  assert(document.stage2Sequence === 1, "T template acceptance candidate sequence changed.");
  templateState(document.templateState, "T template state");
  noAuthority(document.noAuthority, "T noAuthority");
  return [
    pointer(document.stage1Approval, "T stage1 approval", ROOTS.stage1.path),
    pointer(document.acceptedCorrectionDraft, "T accepted correction draft", ROOTS.templateDraft.path),
    pointer(document.predecessorTemplate, "T predecessor template", ROOTS.legacyTemplate.path, { predecessorRemainsUnmodified: true, predecessorRemainsReferenceOnlyHistory: true })
  ];
}

function zRecords(document) {
  keys(document, [
    "version", "kind", "recordState", "candidateOnly", "ownerApproved", "ownerApprovalState", "effective", "effectiveForSelection", "stage2Sequence",
    "stage1Approval", "acceptedCorrectionDraft", "predecessorZeroCostConstraint", "replacedTemplateBinding", "reboundTemplateCorrectionCandidate",
    "constraintState", "noAuthority", "p11Authorization"
  ], "Z zero-cost rebinding acceptance candidate");
  candidateBase(document, "Z zero-cost rebinding acceptance candidate", "p3-r5-ordinal3-owner-zero-cost-constraint-source-pin-correction-acceptance-candidate");
  assert(document.effectiveForSelection === false && document.stage2Sequence === 2, "Z zero-cost rebinding acceptance candidate selection/sequence changed.");
  keys(document.constraintState, ["currency", "maximumIncrementalSpend", "doesNotSelectProviderOrTopology", "candidateCannotBeUsedAsSelectionInputBeforeFinalizedOwnerSuccessor"], "Z constraint state");
  assert(document.constraintState.currency === "JPY" && document.constraintState.maximumIncrementalSpend === 0 && document.constraintState.doesNotSelectProviderOrTopology === true && document.constraintState.candidateCannotBeUsedAsSelectionInputBeforeFinalizedOwnerSuccessor === true, "Z constraint state changed.");
  noAuthority(document.noAuthority, "Z noAuthority");
  return [
    pointer(document.stage1Approval, "Z stage1 approval", ROOTS.stage1.path),
    pointer(document.acceptedCorrectionDraft, "Z accepted correction draft", ROOTS.zeroDraft.path),
    pointer(document.predecessorZeroCostConstraint, "Z predecessor zero-cost constraint", ROOTS.zeroV3.path, { predecessorRemainsUnmodified: true, predecessorRemainsReferenceOnlyHistory: true }),
    pointer(document.replacedTemplateBinding, "Z replaced template binding", ROOTS.legacyTemplate.path, { predecessorRemainsReferenceOnlyHistory: true }),
    pointer(document.reboundTemplateCorrectionCandidate, "Z rebound template correction candidate", ROOTS.t.path)
  ];
}

function historicalOfflineSnapshot(value) {
  keys(value, ["field", "path", "predecessorDeclaredSha256", "currentWorkspaceSha256", "historicalBytesRecovered", "predecessorRemainsUnmodified"], "O predecessor source snapshot");
  assert(value.field === "sourceDocuments[0].sha256" && value.path === OFFLINE_SOURCES[0], "O predecessor source snapshot target changed.");
  assert(value.predecessorDeclaredSha256 === "811a84bb656bf43f168a3ae9e4d7a756d06a51fcab9e16304340d0271d9fe007", "O predecessor source snapshot declared hash changed.");
  assert(value.currentWorkspaceSha256 === PINS[OFFLINE_SOURCES[0]] && value.historicalBytesRecovered === false && value.predecessorRemainsUnmodified === true, "O predecessor source snapshot boundary changed.");
  const actual = sha256(readRegular(localPath(value.path, "O predecessor source snapshot path"), "O predecessor source snapshot"));
  return {
    label: "O predecessor source snapshot current-byte reference",
    path: value.path,
    declaredHistoricalSha256: value.predecessorDeclaredSha256,
    expectedCurrentSha256: value.currentWorkspaceSha256,
    actualCurrentSha256: actual,
    matched: actual === value.currentWorkspaceSha256
  };
}

function oRecords(document) {
  keys(document, [
    "version", "kind", "recordState", "candidateOnly", "ownerApproved", "ownerApprovalState", "effective", "stage2PresentationOrder",
    "presentationOrderOnlyNoDependencyOnTemplateOrZeroCostCandidate", "stage1Approval", "acceptedCorrectionDraft", "predecessorOfflineDraft",
    "predecessorSourceSnapshot", "noAuthority", "p11Authorization"
  ], "O offline acceptance candidate");
  candidateBase(document, "O offline acceptance candidate", "p3-r5-ordinal3-offline-nonce-submission-volume-amendment-source-pin-correction-acceptance-candidate");
  assert(document.stage2PresentationOrder === 3 && document.presentationOrderOnlyNoDependencyOnTemplateOrZeroCostCandidate === true, "O offline acceptance candidate presentation-only ordering changed.");
  noAuthority(document.noAuthority, "O noAuthority");
  return [
    pointer(document.stage1Approval, "O stage1 approval", ROOTS.stage1.path),
    pointer(document.acceptedCorrectionDraft, "O accepted correction draft", ROOTS.offlineDraft.path),
    pointer(document.predecessorOfflineDraft, "O predecessor offline draft", ROOTS.legacyOffline.path, { predecessorRemainsUnmodified: true, predecessorRemainsReferenceOnlyHistory: true }),
    historicalOfflineSnapshot(document.predecessorSourceSnapshot)
  ];
}

function legacy() {
  const template = loadJson(ROOTS.legacyTemplate, "legacy template predecessor").document;
  const offline = loadJson(ROOTS.legacyOffline, "legacy offline predecessor").document;
  const records = [
    pointer(template.sourceDocuments && template.sourceDocuments[2], "legacy template sourceDocuments[2]", TEMPLATE_SOURCES[2]),
    pointer(offline.sourceDocuments && offline.sourceDocuments[0], "legacy offline sourceDocuments[0]", OFFLINE_SOURCES[0])
  ];
  assert(records[0].declaredSha256 === "0a3cb848af0b6eb3106c7fc33d53ec1c5d92057b81fad79bb0f8c7fb67b4dbec", "legacy template mismatch declaration changed.");
  assert(records[1].declaredSha256 === "811a84bb656bf43f168a3ae9e4d7a756d06a51fcab9e16304340d0271d9fe007", "legacy offline mismatch declaration changed.");
  const retained = records.every((record) => record.matched === false)
    && records[0].actualSha256 === PINS[TEMPLATE_SOURCES[2]]
    && records[1].actualSha256 === PINS[OFFLINE_SOURCES[0]];
  return {
    status: retained ? "pass-known-legacy-source-pin-mismatches-retained" : "fail-legacy-predecessor-integrity-drift",
    scope: "The two fixed stale source snapshot edges retained in immutable legacy predecessor records; this is not a replacement for audit v1.",
    records,
    retainedMismatchCount: records.filter((record) => !record.matched).length,
    mismatches: records.filter((record) => !record.matched)
  };
}

function projected(candidates) {
  const records = [
    ...stage1Records(),
    ...tRecords(candidates.t.document),
    ...templateDraftRecords(),
    ...zRecords(candidates.z.document),
    ...zeroDraftRecords(),
    ...oRecords(candidates.o.document),
    ...offlineDraftRecords()
  ];
  const mismatches = records.filter((record) => !record.matched);
  return {
    status: mismatches.length === 0 ? "pass-projected-stage2-candidate-source-pin-closure" : "fail-projected-stage2-candidate-source-pin-closure",
    scope: "Projected T -> Z closure plus separately presented O. T/O recursively validate accepted correction draft sourceDocuments; Z validates its v4 correction draft and only the rebound T candidate.",
    edgeCount: records.length,
    verifiedEdgeCount: records.length - mismatches.length,
    records,
    mismatches
  };
}

function acceptance(candidates) {
  const states = [
    { key: "T", path: ROOTS.t.path, ownerApproved: candidates.t.document.ownerApproved, effective: candidates.t.document.effective },
    { key: "Z", path: ROOTS.z.path, ownerApproved: candidates.z.document.ownerApproved, effective: candidates.z.document.effective },
    { key: "O", path: ROOTS.o.path, ownerApproved: candidates.o.document.ownerApproved, effective: candidates.o.document.effective }
  ];
  assert(states.every((state) => state.ownerApproved === false && state.effective === false), "Stage-2 candidate approval state changed.");
  const finalization = finalizationInventory();
  return {
    ...finalization,
    scope: "Direct, nonrecursive inventory of tools/ entries ending in source-pin-correction-acceptance.json; candidate-only filenames do not match this finalization-record pattern.",
    candidates: states
  };
}

function runAudit() {
  const candidateInventory = inventory();
  const candidates = {
    t: loadJson(ROOTS.t, "T template acceptance candidate root"),
    z: loadJson(ROOTS.z, "Z zero-cost acceptance candidate root"),
    o: loadJson(ROOTS.o, "O offline acceptance candidate root")
  };
  const legacyPredecessorIntegrity = legacy();
  const projectedCandidateClosure = projected(candidates);
  const acceptanceState = acceptance(candidates);
  const pass = legacyPredecessorIntegrity.status === "pass-known-legacy-source-pin-mismatches-retained"
    && projectedCandidateClosure.status === "pass-projected-stage2-candidate-source-pin-closure"
    && acceptanceState.status === "absent-stage2-owner-finalization-approval-required";
  return {
    status: pass ? "pass-projected-candidates-with-legacy-mismatches-retained-and-acceptance-absent" : "fail-closed-stage2-candidate-audit",
    ...OUTPUT_BOUNDARY,
    candidateInventory,
    candidateRootRecords: [
      { key: "T", path: ROOTS.t.path, sha256: candidates.t.actualSha256, matched: true },
      { key: "Z", path: ROOTS.z.path, sha256: candidates.z.actualSha256, matched: true },
      { key: "O", path: ROOTS.o.path, sha256: candidates.o.actualSha256, matched: true }
    ],
    legacyPredecessorIntegrity,
    projectedCandidateClosure,
    acceptanceState,
    requiredInterpretation: "Projected candidate closure does not resolve legacy predecessor mismatches or create owner finalization, publication, runtime, delivery, launch, implementation, return, measurement, gate, or P-11 authority."
  };
}

function rejected(name, fragment, callback) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(fragment), "self-test " + name + " rejected with an unexpected message.");
    return;
  }
  fail("self-test " + name + " did not reject.");
}

function unsetFixture() {
  return {
    externalVerifier: {
      providerOrOperator: "REQUIRED_UNSET",
      trustAnchorAndKeyCustody: "REQUIRED_UNSET",
      dataResidencyAndJurisdiction: "REQUIRED_UNSET",
      accountAndCostAuthority: "REQUIRED_UNSET"
    },
    transmitOnlyTransport: {
      deviceOrIndependentlyAuditedService: "REQUIRED_UNSET",
      independentAdministrationBoundary: "REQUIRED_UNSET",
      injectionDenialTestAuthority: "REQUIRED_UNSET"
    },
    runtimeAndMeasurement: {
      attesterAndProtectedMeasurementAgentSubstrate: "REQUIRED_UNSET",
      trustedTimeSource: "REQUIRED_UNSET",
      allRuntimeInputPlaneClosurePlan: "REQUIRED_UNSET"
    },
    evidenceAndRetention: {
      coverageManifestOwnerAndAudit: "REQUIRED_UNSET",
      metadataRetentionBackupDeletionPolicy: "REQUIRED_UNSET",
      independentAuditBudgetAndOperator: "REQUIRED_UNSET"
    },
    scope: {
      p3FreeSyntheticProbeProvisioning: "REQUIRED_UNSET",
      explicitlyExcludesP3DeliveryLaunchImplementation: true,
      p11Authorization: "NOT_AUTHORIZED"
    }
  };
}

function selfTest() {
  allowed(ROOTS.t.path, "self-test allowed path");
  rejected("path traversal", "unsafe path component", () => localPath("tools/../outside.json", "self-test traversal"));
  rejected("absolute path", "workspace-relative POSIX", () => localPath("/tmp/outside.json", "self-test absolute"));
  rejected("unlisted path", "fixed allowlist", () => allowed("tools/unlisted.json", "self-test unlisted"));
  rejected("duplicate key", "duplicate JSON key", () => parseCanonicalJson(Buffer.from('{\n  "x": 1,\n  "x": 2\n}\n', "utf8"), "self-test duplicate"));
  rejected("BOM", "UTF-8 BOM", () => parseCanonicalJson(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a]), "self-test BOM"));
  rejected("NUL", "NUL byte", () => parseCanonicalJson(Buffer.from([0x7b, 0x00, 0x7d, 0x0a]), "self-test NUL"));
  rejected("invalid UTF-8", "not valid UTF-8", () => parseCanonicalJson(Buffer.from([0xc3, 0x28]), "self-test invalid UTF-8"));
  rejected("noncanonical", "canonical UTF-8 JSON", () => parseCanonicalJson(Buffer.from("{\n\n}\n", "utf8"), "self-test noncanonical"));
  rejected("candidate inventory nonregular", "regular non-link file", () => candidateDirent({ isFile: () => false, isSymbolicLink: () => true }, "self-test candidate inventory"));
  rejected("finalization inventory nonregular", "regular non-link file", () => finalAcceptanceDirent({ isFile: () => false, isSymbolicLink: () => true }, "self-test finalization inventory"));
  rejected("hardlink", "non-hard-linked", () => regular({ isFile: () => true, isSymbolicLink: () => false }, { isFile: () => true, nlink: 2 }, "self-test hardlink"));
  rejected("final owner decision", "acceptance state changed", () => candidateBase({
    version: 1,
    kind: "p3-r5-ordinal3-external-boundary-owner-decision-template-source-pin-correction-acceptance-candidate",
    recordState: "owner-stage2-finalization-candidate",
    candidateOnly: true,
    ownerApproved: true,
    ownerApprovalState: "REQUIRED_STAGE2_FINALIZATION_APPROVAL",
    effective: false,
    p11Authorization: "NOT_AUTHORIZED"
  }, "self-test final owner decision", "p3-r5-ordinal3-external-boundary-owner-decision-template-source-pin-correction-acceptance-candidate"));
  rejected("required unset filled", "changed", () => templateState({
    acceptedTemplateRemainsOwnerInputRequired: true,
    templateOwnerDecisionFinalized: false,
    allRequiredOwnerDecisionsRemainUnset: false
  }, "self-test template state"));
  const finalizedRequirement = unsetFixture();
  finalizedRequirement.externalVerifier.providerOrOperator = "SELECTED";
  rejected("required owner decision filled", "finalized owner decision", () => requiredOwnerDecisionsUnset(finalizedRequirement, "self-test required owner decisions"));
  rejected("Z raw template draft", ".path changed", () => pointer({
    path: ROOTS.templateDraft.path,
    sha256: ROOTS.templateDraft.sha256
  }, "self-test Z raw template draft", ROOTS.t.path));
  const zTemplateHashDrift = pointer({
    path: ROOTS.t.path,
    sha256: "0".repeat(64)
  }, "self-test Z template hash drift", ROOTS.t.path);
  assert(zTemplateHashDrift.matched === false, "self-test Z template hash drift was not detected.");
  rejected("P11 authorized", ".p11Authorization changed", () => noAuthority({
    doesNotFinalizeOwnerDecision: true,
    doesNotAuthorizePublication: true,
    doesNotCreateRuntimeVmOrSandbox: true,
    doesNotAuthorizeP3RoleAction: true,
    doesNotAuthorize: [...NO_AUTHORIZATION],
    p11Authorization: "AUTHORIZED"
  }, "self-test noAuthority"));
  rejected("candidate timestamp", "unsupported or missing keys", () => keys({ version: 1, createdAt: "forbidden" }, ["version"], "self-test candidate timestamp"));
  const finalizationPresent = finalizationState(["tools/r5-ordinal3-example-source-pin-correction-acceptance.json"]);
  assert(finalizationPresent.ownerFinalizationRecordObserved === true && finalizationPresent.status === "present-stage2-owner-finalization-record-not-accepted-by-candidate-audit", "self-test finalization record presence was not detected.");
  process.stdout.write(JSON.stringify({
    schema: RESULT_SCHEMA,
    status: "self-test-passed-projected-candidate-audit-only",
    ...OUTPUT_BOUNDARY,
    fixtureStorage: "in-memory-only with filesystem-status test seams",
    tests: 20
  }, null, 2) + "\n");
}

function failure(error) {
  process.stdout.write(JSON.stringify({
    schema: RESULT_SCHEMA,
    status: "failed-closed-invalid-or-unreadable-workspace-input",
    ...OUTPUT_BOUNDARY,
    failure: error instanceof Error ? error.message : String(error)
  }, null, 2) + "\n");
}

function main() {
  if (process.argv.length !== 3) fail("Usage: node tools/r5-ordinal3-source-pin-correction-acceptance-candidate-audit-v2.mjs --check|--self-test");
  if (process.argv[2] === "--self-test") return selfTest();
  if (process.argv[2] !== "--check") fail("Usage: node tools/r5-ordinal3-source-pin-correction-acceptance-candidate-audit-v2.mjs --check|--self-test");
  const result = runAudit();
  process.stdout.write(JSON.stringify({ schema: RESULT_SCHEMA, ...result }, null, 2) + "\n");
  if (result.status !== "pass-projected-candidates-with-legacy-mismatches-retained-and-acceptance-absent") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  failure(error);
  process.exitCode = 1;
}
