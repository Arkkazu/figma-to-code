// P-3 R5 ordinal-3 contract coherence checker.
// This checker is workspace-only and read-only. It never reads a runtime, VM,
// role home, packet, progress store, site, browser, Figma, or external service.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, "..");

const INPUTS = Object.freeze({
  candidate: Object.freeze({
    path: "tools/r5-baseline-reissue-3-candidate-design.json",
    sha256: "4c56ecb4a75f12b9fedf2e5b1ac676fdc60dad877c4eead15e76a630eff05955"
  }),
  isolationSchema: Object.freeze({
    path: "tools/r5-ordinal3-os-isolation-proof-schema.json",
    sha256: "c17a30f3fd2b84c897635b0f0eb645e3633d3b19418d99c41a7cd8fb5d031403"
  }),
  amendment: Object.freeze({
    path: "tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json",
    sha256: "b7960c5509ea50ed27d18ad636f0f12c5c712444a84de0765068f416b27b28a0"
  }),
  acceptance: Object.freeze({
    path: "tools/r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance.json",
    sha256: "a35ccd16bd8a911879614f04807a6d17d745e3de0491a1ee71350cfba2077e8e"
  })
});

const ATTACHMENTS = Object.freeze([
  "input/assignment.json",
  "input/references/pc-first-view.png",
  "input/references/sp-first-view.png",
  "return-authority.json"
]);

const NO_AUTHORIZATION = Object.freeze([
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

const CANDIDATE_PROHIBITED_NOW = Object.freeze([
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
]);

const CANDIDATE_TOP_LEVEL_KEYS = Object.freeze([
  "schema",
  "recordState",
  "scope",
  "authorityBoundary",
  "execution",
  "pairIdentity",
  "sourceBindings",
  "oneTimeRecoveryException",
  "identityDerivation",
  "pairCommonRuntimeProtocolSuccessor",
  "bytePinnedHelperRelease",
  "freshDestinationPolicy",
  "futureIsolationGate",
  "topologyEvidenceSpecifications",
  "fixedExporterRequirement",
  "noReusePolicy"
]);

const ISOLATION_SCHEMA_TOP_LEVEL_KEYS = Object.freeze([
  "version",
  "kind",
  "status",
  "purpose",
  "scope",
  "evidenceRecordContract",
  "requiredEvidence",
  "failureConditions",
  "requiredFinalStatement"
]);

const AMENDMENT_TOP_LEVEL_KEYS = Object.freeze([
  "version",
  "kind",
  "status",
  "draftId",
  "effective",
  "purpose",
  "sourceDocuments",
  "scope",
  "noAuthority",
  "proposedInvariants",
  "legacyFieldDisposition",
  "proposedRequiredEvidence",
  "machineVerificationRules",
  "requiredFinalStatement",
  "ownerReviewRequired"
]);

const ACCEPTANCE_TOP_LEVEL_KEYS = Object.freeze([
  "version",
  "kind",
  "recordState",
  "ownerApproved",
  "approvedAt",
  "approvalSource",
  "acceptedDraft",
  "acceptedScope",
  "doesNotAuthorize",
  "p11Authorization"
]);

const CANDIDATE_AUTHORITY_BOUNDARY_KEYS = Object.freeze([
  "candidateIsNotAnExternalRecord",
  "candidateIsNotRoleDeliveryAuthority",
  "candidateIsNotRoleLaunchAuthority",
  "futureFinalRecordMayAuthorizeAttachmentOnlyDeliveryOnlyAfterExternalOsIsolationProof",
  "futureFinalRecordMayAuthorizeRoleLaunchOnlyAfterExternalOsIsolationProof",
  "roleLaunchEligibility",
  "prohibitedNow"
]);

const CANDIDATE_PROTOCOL_KEYS = Object.freeze([
  "schema",
  "required",
  "predecessorSha256",
  "byteIdentityRequirement",
  "deliveryMode",
  "executionState",
  "ownerApproved",
  "guestTopology",
  "futurePublicationRequirement"
]);

const CANDIDATE_FUTURE_ISOLATION_GATE_KEYS = Object.freeze([
  "externalOsIsolatedRuntimeRequired",
  "localNestedCodexRuntimeProhibited",
  "requiredBeforeExternalPublication",
  "requiredBeforeRoleDelivery",
  "requiredBeforeRoleLaunch",
  "mustBeRecordedSeparately",
  "runtimeImplementation",
  "minimumMachineEvidence",
  "ownerAttestationMaySupplementButNotReplaceMachineEvidence",
  "p11State"
]);

const CANDIDATE_FIXED_EXPORTER_REQUIREMENT_KEYS = Object.freeze([
  "status",
  "mustRunAs",
  "mustBeBytePinnedBeforeFinalPublication",
  "requiredFutureReleaseFields",
  "mustReadOnly",
  "mayWriteOnly",
  "mustReject",
  "publicationEligibility"
]);

const AMENDMENT_NO_AUTHORITY_KEYS = Object.freeze([
  "doesNotModifyTargetSchema",
  "doesNotCreateEvidenceRecord",
  "doesNotAuthorize",
  "p11Authorization"
]);

const AMENDMENT_PROPOSED_INVARIANT_KEYS = Object.freeze([
  "actualPersistentOutputNonAttachment",
  "hostSideProofRequired",
  "guestProbeBoundary",
  "canonicalEmptyInventory",
  "exporterBoundary",
  "fixedSubmissionOnly",
  "noInferenceFromAbsence"
]);

const AMENDMENT_MACHINE_VERIFICATION_RULES = Object.freeze([
  "A non-attached-topology record is fail unless all proposed replacement fields are present, valid SHA-256 values, independently sourced, and bound to the same nonce.",
  "A record is fail if it contains a retired legacy field as a stand-in for the replacement semantics, uses a guest not-found result or synthetic decoy result as sole proof, or exposes an actual host output pathname to the implementation identity.",
  "A record is fail if the output root is nonempty before the probe, differs after the probe, has an unapproved link/reparse/ACL condition, or is attached by any runtime or host-control channel.",
  "A record is fail if the fixed exporter can accept role-controlled input other than the one fixed scratch filename, can write any destination other than the fixed archive pathname, runs before role termination, or lacks a separately pinned validation adapter PASS.",
  "A record is fail if the evidence collector, exporter, private spool, host output root, or host output path becomes reachable by the implementation identity through a mount, ACL, process, environment variable, socket, network route, inherited handle, or trace event.",
  "Missing typed-schema validation, missing independent audit of the validator, or absent explicit owner acceptance of this exact final amendment byte hash leaves the record draft or fail; it cannot be pass."
]);

const ACCEPTANCE_ACCEPTED_SCOPE_KEYS = Object.freeze([
  "nonattachedPersistentOutputEvidenceSemantics",
  "p3FreeHyperVCapabilityProbePreparation",
  "schemaReplacementAuthorized",
  "typedValidatorStillRequiredForPass",
  "separateRuntimeAndNonceStillRequired"
]);

const LEGACY_REPLACEMENTS = Object.freeze([
  Object.freeze({
    sourceField: "requiredEvidence.attachmentAndOutputTopology.requiredFields.implementationIdentityOutputDenialProbeSha256",
    disposition: "retire-for-nonattached-topology",
    replacementField: "implementationIdentityOutputNamespaceAbsenceProbeSha256"
  }),
  Object.freeze({
    sourceField: "requiredEvidence.inputIntegrityAndReadOnlyProbe.requiredFields.outputHashBeforeSha256",
    disposition: "retire-for-nonattached-topology",
    replacementField: "persistentOutputCanonicalEmptyInventoryBeforeSha256"
  }),
  Object.freeze({
    sourceField: "requiredEvidence.attachmentAndOutputTopology.requiredFields.persistentOutputInitiallyEmpty",
    disposition: "retire-for-nonattached-topology",
    replacementField: "persistentOutputCanonicalEmptyInventoryBeforeSha256"
  }),
  Object.freeze({
    sourceField: "requiredEvidence.inputIntegrityAndReadOnlyProbe.acceptance[1]",
    disposition: "replace-actual-output-denial-clause",
    replacementRequirement: true
  }),
  Object.freeze({
    sourceField: "requiredEvidence.attachmentAndOutputTopology.requiredFields.fixedExporterUidAndAclEvidenceSha256",
    disposition: "retain-and-strengthen",
    replacementField: "fixedExporterIdentityAndBoundaryEvidenceSha256"
  }),
  Object.freeze({
    sourceField: "requiredEvidence.attachmentAndOutputTopology.requiredFields.fixedExporterAtomicCreateEvidenceSha256",
    disposition: "retain-and-strengthen",
    replacementField: "fixedExporterAtomicCreateEvidenceSha256"
  })
]);

const OUTPUT_FLAGS = Object.freeze({
  reviewOnly: true,
  runtimeEvidence: false,
  externalOsIsolationProof: false,
  p11Authorization: "NOT_AUTHORIZED",
  actionsAuthorized: Object.freeze({
    reissuePublication: false,
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
  }),
  checkerEffects: Object.freeze({
    workspaceWrites: false,
    externalReads: false,
    externalWrites: false,
    childProcesses: false,
    runtimeOrVmReads: false
  })
});

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  assert(isPlainObject(value), "canonical JSON value must be a plain object.");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function exact(actual, expected, label) {
  assert(canonical(actual) === canonical(expected), `${label} changed.`);
}

function exactKeys(value, expectedKeys, label) {
  assert(isPlainObject(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has unsupported or missing keys.`);
}

function assertHex(value, label) {
  assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), `${label} must be lowercase SHA-256 hex.`);
}

function nativeRealpath(path) {
  return realpathSync.native ? realpathSync.native(path) : realpathSync(path);
}

function isWithin(parent, child) {
  const route = relative(parent, child);
  return route === "" || (!route.startsWith("..") && !route.includes(":"));
}

function workspacePath(logicalPath, label) {
  assert(typeof logicalPath === "string" && logicalPath.length > 0, `${label} path is absent.`);
  assert(!logicalPath.includes("\\") && !logicalPath.startsWith("/") && !logicalPath.includes(":"), `${label} path is not workspace-relative POSIX.`);
  const target = resolve(WORKSPACE_ROOT, logicalPath);
  const route = relative(WORKSPACE_ROOT, target);
  assert(route && isWithin(WORKSPACE_ROOT, target), `${label} path escapes the workspace.`);
  return target;
}

function assertNoLinkComponents(path, label) {
  const root = resolve(WORKSPACE_ROOT);
  const target = resolve(path);
  const route = relative(root, target);
  assert(route && isWithin(root, target), `${label} escapes the workspace.`);
  try {
    const rootStatus = lstatSync(root);
    assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), `${label} workspace root is not a regular non-link directory.`);
    let current = root;
    const segments = route.split(/[\\/]+/).filter(Boolean);
    assert(segments.length > 0, `${label} has no file component.`);
    for (let index = 0; index < segments.length; index += 1) {
      current = resolve(current, segments[index]);
      const status = lstatSync(current);
      assert(!status.isSymbolicLink(), `${label} contains a symbolic link or junction.`);
      if (index < segments.length - 1) assert(status.isDirectory(), `${label} contains a non-directory parent component.`);
    }
    const realRoot = nativeRealpath(root);
    const realTarget = nativeRealpath(target);
    assert(realRoot !== realTarget && isWithin(realRoot, realTarget), `${label} resolves outside the workspace.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    fail(`${label} has a missing or unreadable path component.`);
  }
}

function readRegular(path, label) {
  assertNoLinkComponents(path, label);
  const lst = lstatSync(path);
  assert(lst.isFile() && !lst.isSymbolicLink(), `${label} is not a regular non-link file.`);
  const st = statSync(path);
  assert(st.isFile(), `${label} is not a regular file after resolution.`);
  assert(typeof st.nlink === "number" && Number.isInteger(st.nlink) && st.nlink >= 1, `${label} hard-link count is unobservable.`);
  assert(st.nlink === 1, `${label} is hard-linked.`);
  return readFileSync(path);
}

function isJsonWhitespace(character) {
  return character === " " || character === "\n" || character === "\r" || character === "\t";
}

function assertNoDuplicateJsonKeys(text, label) {
  let index = 0;
  const skipWhitespace = () => { while (index < text.length && isJsonWhitespace(text[index])) index += 1; };
  const expect = (character, message) => {
    assert(text[index] === character, `${label} ${message}`);
    index += 1;
  };
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

function parseStrictJsonBytes(bytes, label, { requireRepositorySerialization = true } = {}) {
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
  if (requireRepositorySerialization) {
    assert(repositorySerializationConforming, `${label} must use the repository JSON serialization convention.`);
  }
  return { value, repositorySerializationConforming };
}

function assertNoAuthority(noAuthority, label) {
  exactKeys(noAuthority, AMENDMENT_NO_AUTHORITY_KEYS, label);
  assert(noAuthority.doesNotModifyTargetSchema === true, `${label} must not modify the target schema.`);
  assert(noAuthority.doesNotCreateEvidenceRecord === true, `${label} must not create evidence records.`);
  exact(noAuthority.doesNotAuthorize, NO_AUTHORIZATION, `${label} doesNotAuthorize`);
  assert(noAuthority.p11Authorization === "NOT_AUTHORIZED", `${label} P-11 authorization must remain NOT_AUTHORIZED.`);
}

function assertCandidate(candidate, hashes) {
  assert(candidate.schema === "p3-r5-pair-reissue-3-candidate-design/v2", "candidate schema changed.");
  assert(candidate.recordState === "draft-not-published", "candidate must remain draft-not-published.");

  const boundary = candidate.authorityBoundary;
  exactKeys(boundary, CANDIDATE_AUTHORITY_BOUNDARY_KEYS, "candidate authority boundary");
  assert(boundary.candidateIsNotAnExternalRecord === true, "candidate must not become an external record.");
  assert(boundary.candidateIsNotRoleDeliveryAuthority === true, "candidate must not become delivery authority.");
  assert(boundary.candidateIsNotRoleLaunchAuthority === true, "candidate must not become launch authority.");
  assert(boundary.futureFinalRecordMayAuthorizeAttachmentOnlyDeliveryOnlyAfterExternalOsIsolationProof === true, "candidate delivery isolation prerequisite changed.");
  assert(boundary.futureFinalRecordMayAuthorizeRoleLaunchOnlyAfterExternalOsIsolationProof === true, "candidate launch isolation prerequisite changed.");
  exact(boundary.prohibitedNow, CANDIDATE_PROHIBITED_NOW, "candidate prohibited-now actions");

  const execution = candidate.execution;
  const executionKeys = [
    "workspaceWrites", "externalWrites", "providerSelection", "externalAccountAccess", "purchaseOrSubscription",
    "networkingChange", "physicalDeviceDeployment", "vmOrSandboxCreation", "runtimeProvisioning", "roleDelivery",
    "roleLaunch", "implementation", "returnCheck", "returnApply", "siteMutation", "lifecycleMutation",
    "browserOrFigmaMeasurement", "p11Mutation"
  ];
  exactKeys(execution, executionKeys, "candidate execution");
  assert(execution.workspaceWrites === true, "candidate workspace-write declaration changed.");
  for (const key of executionKeys.filter((key) => key !== "workspaceWrites")) {
    assert(execution[key] === false, `candidate execution ${key} must remain false.`);
  }

  const protocol = candidate.pairCommonRuntimeProtocolSuccessor;
  exactKeys(protocol, CANDIDATE_PROTOCOL_KEYS, "candidate pair-common protocol");
  assert(protocol.deliveryMode === "attachment-only", "candidate delivery mode must remain attachment-only.");
  assert(protocol.executionState === false, "candidate protocol execution state must remain false.");
  assert(protocol.ownerApproved === false, "candidate protocol must remain unapproved.");
  const topology = protocol.guestTopology;
  assert(isPlainObject(topology), "candidate guest topology must be an object.");
  exact(topology.requiredAttachmentRelativePaths, ATTACHMENTS, "guest topology attachment inventory");
  assert(topology.attachmentAccess === "read-only", "guest topology attachment access changed.");
  assert(topology.scratchPersistence === "ephemeral-not-host-backed-destroyed-with-runtime", "guest topology scratch must remain ephemeral.");
  assert(topology.implementationIdentityPersistentOutputAccess === "none", "guest topology persistent-output access must remain none.");
  assert(topology.hostPathsExposedToImplementationIdentity === false, "guest topology must not expose host paths.");
  const exporter = topology.fixedExporter;
  assert(isPlainObject(exporter), "guest topology fixed exporter must be an object.");
  assert(exporter.required === true, "guest topology fixed exporter must remain required.");
  assert(exporter.implementationIdentityMayInvoke === false, "guest topology fixed exporter must not be invokable by the implementation identity.");
  assert(exporter.sourcePath === "/p3/scratch/return.ustar.tar", "guest topology exporter source changed.");
  assert(exporter.destinationPath === "/p3/output/return.ustar.tar", "guest topology exporter destination changed.");

  const gate = candidate.futureIsolationGate;
  exactKeys(gate, CANDIDATE_FUTURE_ISOLATION_GATE_KEYS, "candidate future isolation gate");
  for (const key of [
    "externalOsIsolatedRuntimeRequired",
    "localNestedCodexRuntimeProhibited",
    "requiredBeforeExternalPublication",
    "requiredBeforeRoleDelivery",
    "requiredBeforeRoleLaunch",
    "mustBeRecordedSeparately"
  ]) assert(gate[key] === true, `candidate future isolation gate ${key} must remain true.`);
  assert(gate.runtimeImplementation === "not selected by this candidate; a later proof must identify the external OS-isolated runtime and its enforced boundary", "candidate runtime must remain unselected.");
  assert(gate.p11State === "unchanged; P-11 remains outside this candidate scope", "candidate P-11 state changed.");

  const exporterRequirement = candidate.fixedExporterRequirement;
  exactKeys(exporterRequirement, CANDIDATE_FIXED_EXPORTER_REQUIREMENT_KEYS, "candidate fixed exporter requirement");
  assert(exporterRequirement.status === "required-but-not-selected-candidate-blocks-publication", "candidate fixed exporter selection state changed.");
  assert(exporterRequirement.mustBeBytePinnedBeforeFinalPublication === true, "candidate fixed exporter byte-pin requirement changed.");

  const specifications = candidate.topologyEvidenceSpecifications;
  assert(isPlainObject(specifications), "candidate topology evidence specifications must be an object.");
  const schemaPin = specifications.osIsolationProofSchema;
  assert(isPlainObject(schemaPin), "candidate schema pin must be an object.");
  assert(schemaPin.workspacePath === INPUTS.isolationSchema.path, "candidate schema pin path changed.");
  assert(schemaPin.sha256 === hashes.isolationSchema, "candidate schema pin hash does not bind the isolation schema bytes.");
  const nonattached = specifications.nonattachedPersistentOutputEvidence;
  assert(isPlainObject(nonattached), "candidate nonattached-output specification must be an object.");
  assert(nonattached.amendment?.workspacePath === INPUTS.amendment.path, "candidate amendment pin path changed.");
  assert(nonattached.amendment?.sha256 === hashes.amendment, "candidate amendment pin hash does not bind the amendment bytes.");
  assert(nonattached.ownerAcceptance?.workspacePath === INPUTS.acceptance.path, "candidate acceptance pin path changed.");
  assert(nonattached.ownerAcceptance?.sha256 === hashes.acceptance, "candidate acceptance pin hash does not bind the acceptance bytes.");
}

function assertIsolationSchema(schema) {
  assert(schema.version === 1, "isolation schema version changed.");
  assert(schema.kind === "p3-r5-ordinal3-external-os-isolation-proof-schema", "isolation schema kind changed.");
  assert(schema.status === "draft-not-evidence", "isolation schema must remain draft-not-evidence.");
  const scope = schema.scope;
  assert(isPlainObject(scope), "isolation schema scope must be an object.");
  exact(scope.requiredAttachmentRelativePaths, ATTACHMENTS, "isolation schema attachment scope");
  assert(scope.implementationIdentityPersistentOutputAccess === "none", "isolation schema persistent-output access must remain none.");
  exact(scope.notAuthorized, NO_AUTHORIZATION, "isolation schema not-authorized actions");
  assert(schema.evidenceRecordContract?.p11Authorization === "NOT_AUTHORIZED", "isolation schema P-11 authorization must remain NOT_AUTHORIZED.");
}

function assertAmendment(amendment, hashes) {
  assert(amendment.version === 1, "amendment version changed.");
  assert(amendment.kind === "p3-r5-ordinal3-nonattached-persistent-output-contract-amendment", "amendment kind changed.");
  assert(amendment.status === "owner-review-only-draft", "amendment must remain owner-review-only-draft.");
  assert(amendment.effective === false, "amendment must remain non-effective.");

  assert(Array.isArray(amendment.sourceDocuments), "amendment source documents must be an array.");
  const schemaSources = amendment.sourceDocuments.filter((source) => isPlainObject(source) && source.path === INPUTS.isolationSchema.path);
  assert(schemaSources.length === 1, "amendment must bind exactly one isolation-schema source document.");
  assert(schemaSources[0].sha256 === hashes.isolationSchema, "amendment source schema hash does not bind the isolation schema bytes.");
  assert(schemaSources[0].role === "target evidence contract", "amendment source schema role changed.");

  const scope = amendment.scope;
  assert(isPlainObject(scope), "amendment scope must be an object.");
  assert(scope.targetSchemaPath === INPUTS.isolationSchema.path, "amendment scope schema path changed.");
  assert(scope.targetSchemaVersion === 1, "amendment scope schema version changed.");
  assert(scope.targetSchemaSha256 === hashes.isolationSchema, "amendment scope schema hash does not bind the isolation schema bytes.");
  assertNoAuthority(amendment.noAuthority, "amendment no-authority boundary");

  const proposedInvariants = amendment.proposedInvariants;
  exactKeys(proposedInvariants, AMENDMENT_PROPOSED_INVARIANT_KEYS, "amendment proposed invariants");

  exact(amendment.machineVerificationRules, AMENDMENT_MACHINE_VERIFICATION_RULES, "amendment machine verification rules");

  assert(Array.isArray(amendment.legacyFieldDisposition), "amendment legacy field disposition must be an array.");
  assert(amendment.legacyFieldDisposition.length === LEGACY_REPLACEMENTS.length, "amendment legacy field disposition count changed.");
  const replacementFields = new Set();
  for (const expected of LEGACY_REPLACEMENTS) {
    const entry = amendment.legacyFieldDisposition.find((item) => isPlainObject(item) && item.sourceField === expected.sourceField);
    assert(entry !== undefined, `amendment legacy disposition is missing ${expected.sourceField}.`);
    assert(entry.disposition === expected.disposition, `amendment legacy disposition changed for ${expected.sourceField}.`);
    if (expected.replacementField) {
      assert(entry.replacementField === expected.replacementField, `amendment replacement field changed for ${expected.sourceField}.`);
      replacementFields.add(expected.replacementField);
    } else {
      assert(typeof entry.replacementRequirement === "string" && entry.replacementRequirement.length > 0, `amendment replacement requirement is missing for ${expected.sourceField}.`);
    }
  }

  const proposed = amendment.proposedRequiredEvidence;
  assert(isPlainObject(proposed), "amendment proposed required evidence must be an object.");
  const topologyFields = proposed.attachmentAndOutputTopology?.requiredFields;
  const inputFields = proposed.inputIntegrityAndReadOnlyProbe?.requiredFields;
  assert(Array.isArray(topologyFields) && Array.isArray(inputFields), "amendment proposed replacement fields must be arrays.");
  const proposedFields = new Set([...topologyFields, ...inputFields]);
  for (const replacement of replacementFields) {
    assert(proposedFields.has(replacement), `amendment replacement field ${replacement} is absent from proposed required evidence.`);
  }
  for (const required of [
    "persistentOutputCanonicalEmptyInventoryAfterProbeSha256",
    "actualPersistentOutputHostExistenceAndNonAttachEvidenceSha256",
    "persistentOutputNonAttachmentConfigurationEvidenceSha256",
    "persistentOutputHostAclAndReparseEvidenceSha256",
    "outputLocatorNonDisclosureEvidenceSha256",
    "implementationIdentityOutputNamespaceAbsenceProbeSha256",
    "implementationIdentityOutputNamespaceTraceSha256",
    "syntheticOutputDecoyDefinitionSha256",
    "implementationIdentitySyntheticOutputDecoyDenialProbeSha256"
  ]) assert(proposedFields.has(required), `amendment replacement field ${required} is absent from proposed required evidence.`);
  for (const retired of [
    "implementationIdentityOutputDenialProbeSha256",
    "outputHashBeforeSha256",
    "persistentOutputInitiallyEmpty",
    "fixedExporterUidAndAclEvidenceSha256"
  ]) assert(!proposedFields.has(retired), `amendment proposed required evidence retains retired field ${retired}.`);
  assert(proposed.futureAuthorizedExportPhaseOnly?.status === "not-authorized-by-this-draft", "amendment export phase must remain unauthorized.");
  assert(typeof amendment.requiredFinalStatement === "string" && amendment.requiredFinalStatement.includes("P-11 remains NOT_AUTHORIZED"), "amendment final statement must preserve P-11 non-authorization.");
}

function assertAcceptance(acceptance, hashes) {
  assert(acceptance.version === 1, "acceptance version changed.");
  assert(acceptance.kind === "p3-r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance", "acceptance kind changed.");
  assert(acceptance.recordState === "finalized", "acceptance must remain finalized.");
  assert(acceptance.ownerApproved === true, "acceptance must remain owner-approved.");
  assert(acceptance.acceptedDraft?.path === INPUTS.amendment.path, "acceptance draft path changed.");
  assert(acceptance.acceptedDraft?.sha256 === hashes.amendment, "acceptance draft hash does not bind the amendment bytes.");
  const acceptedScope = acceptance.acceptedScope;
  exactKeys(acceptedScope, ACCEPTANCE_ACCEPTED_SCOPE_KEYS, "acceptance scope");
  assert(acceptedScope.nonattachedPersistentOutputEvidenceSemantics === true, "acceptance must retain nonattached-output semantics.");
  assert(acceptedScope.p3FreeHyperVCapabilityProbePreparation === true, "acceptance must retain only P-3-free probe preparation.");
  assert(acceptedScope.schemaReplacementAuthorized === false, "acceptance must not authorize schema replacement.");
  assert(acceptedScope.typedValidatorStillRequiredForPass === true, "acceptance must retain the typed-validator requirement.");
  assert(acceptedScope.separateRuntimeAndNonceStillRequired === true, "acceptance must retain the separate runtime-and-nonce requirement.");
  exact(acceptance.doesNotAuthorize, NO_AUTHORIZATION, "acceptance doesNotAuthorize");
  assert(acceptance.p11Authorization === "NOT_AUTHORIZED", "acceptance P-11 authorization must remain NOT_AUTHORIZED.");
}

function validateSemantics(documents, hashes) {
  assertCandidate(documents.candidate, hashes);
  assertIsolationSchema(documents.isolationSchema);
  assertAmendment(documents.amendment, hashes);
  assertAcceptance(documents.acceptance, hashes);
}

function validateDocumentShapes(documents) {
  exactKeys(documents.candidate, CANDIDATE_TOP_LEVEL_KEYS, "candidate document");
  exactKeys(documents.isolationSchema, ISOLATION_SCHEMA_TOP_LEVEL_KEYS, "isolation schema document");
  exactKeys(documents.amendment, AMENDMENT_TOP_LEVEL_KEYS, "amendment document");
  exactKeys(documents.acceptance, ACCEPTANCE_TOP_LEVEL_KEYS, "acceptance document");
}

function readDocuments() {
  const raw = {};
  const hashes = {};
  for (const [key, input] of Object.entries(INPUTS)) {
    const bytes = readRegular(workspacePath(input.path, `${key} input`), `${key} input`);
    const actual = sha256(bytes);
    assert(actual === input.sha256, `${key} input byte pin changed.`);
    raw[key] = bytes;
    hashes[key] = actual;
  }
  const documents = {};
  const formatPolicy = {};
  for (const [key, bytes] of Object.entries(raw)) {
    // The preexisting schema is byte-pinned by the accepted amendment chain. Its
    // non-semantic comma placement must remain observable but cannot be repaired
    // by this review-only checker without a successor schema/amendment/acceptance.
    const parsed = parseStrictJsonBytes(bytes, `${key} input`, {
      requireRepositorySerialization: key !== "isolationSchema"
    });
    documents[key] = parsed.value;
    formatPolicy[key] = parsed.repositorySerializationConforming;
  }
  return { documents, hashes, formatPolicy };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeSelfTestFixture() {
  const candidate = {
    schema: "p3-r5-pair-reissue-3-candidate-design/v2",
    recordState: "draft-not-published",
    authorityBoundary: {
      candidateIsNotAnExternalRecord: true,
      candidateIsNotRoleDeliveryAuthority: true,
      candidateIsNotRoleLaunchAuthority: true,
      futureFinalRecordMayAuthorizeAttachmentOnlyDeliveryOnlyAfterExternalOsIsolationProof: true,
      futureFinalRecordMayAuthorizeRoleLaunchOnlyAfterExternalOsIsolationProof: true,
      roleLaunchEligibility: "pending a separately recorded external OS-isolation proof and fresh pre-launch checks for the relevant condition",
      prohibitedNow: [...CANDIDATE_PROHIBITED_NOW]
    },
    execution: {
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
    },
    pairCommonRuntimeProtocolSuccessor: {
      schema: "p3-role-handoff-protocol/v4",
      required: true,
      predecessorSha256: "0".repeat(64),
      byteIdentityRequirement: "The same canonical protocol bytes are required.",
      deliveryMode: "attachment-only",
      executionState: false,
      ownerApproved: false,
      guestTopology: {
        schema: "p3-role-guest-topology/v1",
        attachmentRoot: "/p3/attachments",
        requiredAttachmentRelativePaths: [...ATTACHMENTS],
        attachmentAccess: "read-only",
        scratchRoot: "/p3/scratch",
        scratchWorkRoot: "/p3/scratch/work",
        scratchSubmissionPath: "/p3/scratch/return.ustar.tar",
        scratchPersistence: "ephemeral-not-host-backed-destroyed-with-runtime",
        persistentOutputRoot: "/p3/output",
        persistentOutputArchivePath: "/p3/output/return.ustar.tar",
        implementationIdentityPersistentOutputAccess: "none",
        persistentOutputAllowlist: ["return.ustar.tar"],
        hostPathsExposedToImplementationIdentity: false,
        attachmentInventoryBinding: "sealed-per-delivery-outside-pair-common-protocol",
        runnerInstructionBinding: "byte-pinned-before-final-publication",
        fixedExporter: {
          required: true,
          implementationIdentityMayInvoke: false,
          sourcePath: "/p3/scratch/return.ustar.tar",
          destinationPath: "/p3/output/return.ustar.tar",
          destinationWritePolicy: "single-fixed-name-atomic-create-only-when-empty",
          mustValidateBeforeExport: true,
          mustRejectAdditionalPersistentFiles: true
        }
      },
      futurePublicationRequirement: "A later publication must leave delivery and launch disabled."
    },
    futureIsolationGate: {
      externalOsIsolatedRuntimeRequired: true,
      localNestedCodexRuntimeProhibited: true,
      requiredBeforeExternalPublication: true,
      requiredBeforeRoleDelivery: true,
      requiredBeforeRoleLaunch: true,
      mustBeRecordedSeparately: true,
      runtimeImplementation: "not selected by this candidate; a later proof must identify the external OS-isolated runtime and its enforced boundary",
      minimumMachineEvidence: [],
      ownerAttestationMaySupplementButNotReplaceMachineEvidence: true,
      p11State: "unchanged; P-11 remains outside this candidate scope"
    },
    fixedExporterRequirement: {
      status: "required-but-not-selected-candidate-blocks-publication",
      mustRunAs: "coordinator-controlled identity distinct from the implementation identity",
      mustBeBytePinnedBeforeFinalPublication: true,
      requiredFutureReleaseFields: [],
      mustReadOnly: [],
      mayWriteOnly: [],
      mustReject: [],
      publicationEligibility: "false until the exact exporter binary, invocation, configuration, UID/ACL boundary, and validation policy are separately byte-pinned and independently verified"
    },
    topologyEvidenceSpecifications: {
      osIsolationProofSchema: {},
      nonattachedPersistentOutputEvidence: { amendment: {}, ownerAcceptance: {} }
    }
  };
  const isolationSchema = {
    version: 1,
    kind: "p3-r5-ordinal3-external-os-isolation-proof-schema",
    status: "draft-not-evidence",
    scope: {
      requiredAttachmentRelativePaths: [...ATTACHMENTS],
      implementationIdentityPersistentOutputAccess: "none",
      notAuthorized: [...NO_AUTHORIZATION]
    },
    evidenceRecordContract: { p11Authorization: "NOT_AUTHORIZED" }
  };
  const amendment = {
    version: 1,
    kind: "p3-r5-ordinal3-nonattached-persistent-output-contract-amendment",
    status: "owner-review-only-draft",
    effective: false,
    sourceDocuments: [],
    scope: {},
    noAuthority: {
      doesNotModifyTargetSchema: true,
      doesNotCreateEvidenceRecord: true,
      doesNotAuthorize: [...NO_AUTHORIZATION],
      p11Authorization: "NOT_AUTHORIZED"
    },
    proposedInvariants: {
      actualPersistentOutputNonAttachment: "fixture invariant",
      hostSideProofRequired: "fixture invariant",
      guestProbeBoundary: "fixture invariant",
      canonicalEmptyInventory: "fixture invariant",
      exporterBoundary: "fixture invariant",
      fixedSubmissionOnly: "fixture invariant",
      noInferenceFromAbsence: "fixture invariant"
    },
    legacyFieldDisposition: LEGACY_REPLACEMENTS.map((expected) => ({
      sourceField: expected.sourceField,
      disposition: expected.disposition,
      ...(expected.replacementField ? { replacementField: expected.replacementField } : { replacementRequirement: "required replacement semantics" })
    })),
    proposedRequiredEvidence: {
      attachmentAndOutputTopology: {
        requiredFields: [
          "persistentOutputCanonicalEmptyInventoryBeforeSha256",
          "persistentOutputCanonicalEmptyInventoryAfterProbeSha256",
          "actualPersistentOutputHostExistenceAndNonAttachEvidenceSha256",
          "persistentOutputNonAttachmentConfigurationEvidenceSha256",
          "persistentOutputHostAclAndReparseEvidenceSha256",
          "outputLocatorNonDisclosureEvidenceSha256",
          "implementationIdentityOutputNamespaceAbsenceProbeSha256",
          "implementationIdentityOutputNamespaceTraceSha256",
          "syntheticOutputDecoyDefinitionSha256",
          "implementationIdentitySyntheticOutputDecoyDenialProbeSha256",
          "fixedExporterIdentityAndBoundaryEvidenceSha256",
          "fixedExporterAtomicCreateEvidenceSha256"
        ]
      },
      inputIntegrityAndReadOnlyProbe: { requiredFields: [] },
      futureAuthorizedExportPhaseOnly: { status: "not-authorized-by-this-draft" }
    },
    machineVerificationRules: [...AMENDMENT_MACHINE_VERIFICATION_RULES],
    requiredFinalStatement: "P-11 remains NOT_AUTHORIZED."
  };
  const acceptance = {
    version: 1,
    kind: "p3-r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance",
    recordState: "finalized",
    ownerApproved: true,
    acceptedDraft: {},
    acceptedScope: {
      nonattachedPersistentOutputEvidenceSemantics: true,
      p3FreeHyperVCapabilityProbePreparation: true,
      schemaReplacementAuthorized: false,
      typedValidatorStillRequiredForPass: true,
      separateRuntimeAndNonceStillRequired: true
    },
    doesNotAuthorize: [...NO_AUTHORIZATION],
    p11Authorization: "NOT_AUTHORIZED"
  };
  const hashes = {
    isolationSchema: sha256(canonicalJsonBytes(isolationSchema)),
    amendment: "",
    acceptance: ""
  };
  candidate.topologyEvidenceSpecifications.osIsolationProofSchema = {
    workspacePath: INPUTS.isolationSchema.path,
    sha256: hashes.isolationSchema
  };
  amendment.sourceDocuments = [{
    path: INPUTS.isolationSchema.path,
    sha256: hashes.isolationSchema,
    role: "target evidence contract"
  }];
  amendment.scope = {
    targetSchemaPath: INPUTS.isolationSchema.path,
    targetSchemaVersion: 1,
    targetSchemaSha256: hashes.isolationSchema
  };
  hashes.amendment = sha256(canonicalJsonBytes(amendment));
  candidate.topologyEvidenceSpecifications.nonattachedPersistentOutputEvidence.amendment = {
    workspacePath: INPUTS.amendment.path,
    sha256: hashes.amendment
  };
  acceptance.acceptedDraft = { path: INPUTS.amendment.path, sha256: hashes.amendment };
  hashes.acceptance = sha256(canonicalJsonBytes(acceptance));
  candidate.topologyEvidenceSpecifications.nonattachedPersistentOutputEvidence.ownerAcceptance = {
    workspacePath: INPUTS.acceptance.path,
    sha256: hashes.acceptance
  };
  return { documents: { candidate, isolationSchema, amendment, acceptance }, hashes };
}

function expectRejected(name, fragment, callback) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(fragment), `self-test ${name} rejected with an unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  fail(`self-test ${name} did not reject.`);
}

function runSelfTest() {
  const fixture = makeSelfTestFixture();
  validateSemantics(fixture.documents, fixture.hashes);
  const test = (name, fragment, mutate) => {
    const copy = { documents: clone(fixture.documents), hashes: { ...fixture.hashes } };
    mutate(copy);
    expectRejected(name, fragment, () => validateSemantics(copy.documents, copy.hashes));
  };
  test("candidate-schema-pin", "candidate schema pin hash", ({ documents }) => {
    documents.candidate.topologyEvidenceSpecifications.osIsolationProofSchema.sha256 = "0".repeat(64);
  });
  test("amendment-schema-binding", "amendment scope schema hash", ({ documents }) => {
    documents.amendment.scope.targetSchemaSha256 = "0".repeat(64);
  });
  test("amendment-effective", "amendment must remain non-effective", ({ documents }) => {
    documents.amendment.effective = true;
  });
  test("acceptance-binding", "acceptance draft hash", ({ documents }) => {
    documents.acceptance.acceptedDraft.sha256 = "0".repeat(64);
  });
  test("acceptance-schema-replacement", "acceptance must not authorize schema replacement", ({ documents }) => {
    documents.acceptance.acceptedScope.schemaReplacementAuthorized = true;
  });
  test("acceptance-p11", "acceptance P-11 authorization", ({ documents }) => {
    documents.acceptance.p11Authorization = "AUTHORIZED";
  });
  test("acceptance-no-authority", "acceptance doesNotAuthorize", ({ documents }) => {
    documents.acceptance.doesNotAuthorize = documents.acceptance.doesNotAuthorize.filter((action) => action !== "role launch");
  });
  test("guest-output-access", "guest topology persistent-output access", ({ documents }) => {
    documents.candidate.pairCommonRuntimeProtocolSuccessor.guestTopology.implementationIdentityPersistentOutputAccess = "read-only";
  });
  test("missing-replacement", "amendment replacement field", ({ documents }) => {
    documents.amendment.proposedRequiredEvidence.attachmentAndOutputTopology.requiredFields = documents.amendment.proposedRequiredEvidence.attachmentAndOutputTopology.requiredFields.filter((field) => field !== "implementationIdentityOutputNamespaceAbsenceProbeSha256");
  });
  test("candidate-authority-boundary-extra-authority", "candidate authority boundary has unsupported or missing keys", ({ documents }) => {
    documents.candidate.authorityBoundary.roleLaunchAuthorized = true;
  });
  test("candidate-protocol-extra-authority", "candidate pair-common protocol has unsupported or missing keys", ({ documents }) => {
    documents.candidate.pairCommonRuntimeProtocolSuccessor.roleDeliveryAuthorized = true;
  });
  test("candidate-isolation-gate-extra-authority", "candidate future isolation gate has unsupported or missing keys", ({ documents }) => {
    documents.candidate.futureIsolationGate.roleLaunchAuthorized = true;
  });
  test("candidate-fixed-exporter-extra-authority", "candidate fixed exporter requirement has unsupported or missing keys", ({ documents }) => {
    documents.candidate.fixedExporterRequirement.exporterMayAuthorizeRoleLaunch = true;
  });
  test("amendment-no-authority-extra-authority", "amendment no-authority boundary has unsupported or missing keys", ({ documents }) => {
    documents.amendment.noAuthority.roleLaunchAuthorized = true;
  });
  test("amendment-proposed-invariants-extra-authority", "amendment proposed invariants has unsupported or missing keys", ({ documents }) => {
    documents.amendment.proposedInvariants.roleDeliveryAuthorized = "fixture violation";
  });
  test("amendment-machine-verification-extra-authority", "amendment machine verification rules changed", ({ documents }) => {
    documents.amendment.machineVerificationRules.push("A record may authorize role launch.");
  });
  test("acceptance-scope-extra-authority", "acceptance scope has unsupported or missing keys", ({ documents }) => {
    documents.acceptance.acceptedScope.schemaReplacementAuthorizedByAcceptance = true;
  });
  expectRejected("duplicate-json-key", "duplicate JSON key", () => parseStrictJsonBytes(Buffer.from('{\n  "x": 1,\n  "x": 2\n}\n', "utf8"), "self-test duplicate JSON"));
  expectRejected("nonconforming-repository-json", "repository JSON serialization convention", () => parseStrictJsonBytes(Buffer.from('{\n\n}\n', "utf8"), "self-test nonconforming JSON"));
  const preservedLegacyFormatting = parseStrictJsonBytes(Buffer.from('{\n\n}\n', "utf8"), "self-test preserved legacy JSON", { requireRepositorySerialization: false });
  assert(preservedLegacyFormatting.repositorySerializationConforming === false, "self-test preserved legacy JSON must retain a non-blocking format diagnostic.");
  writeReport({
    status: "self-test-passed-review-only-not-runtime-evidence",
    fixtureCoherent: true,
    tests: 20
  });
}

function writeReport(result) {
  process.stdout.write(`${JSON.stringify({
    schema: "p3-r5-ordinal3-contract-coherence-check/v1",
    ...OUTPUT_FLAGS,
    ...result
  }, null, 2)}\n`);
}

function runCheck() {
  const { documents, hashes, formatPolicy } = readDocuments();
  validateDocumentShapes(documents);
  validateSemantics(documents, hashes);
  writeReport({
    status: "coherent-review-only-not-runtime-evidence",
    coherent: true,
    inputs: Object.fromEntries(Object.entries(hashes).map(([key, hash]) => [key, {
      path: INPUTS[key].path,
      sha256: hash,
      repositorySerializationConforming: formatPolicy[key]
    }]))
  });
}

function main() {
  if (process.argv.length !== 3) fail("Usage: node tools/r5-ordinal3-contract-coherence-check.mjs --check|--self-test");
  if (process.argv[2] === "--check") return runCheck();
  if (process.argv[2] === "--self-test") return runSelfTest();
  fail("Usage: node tools/r5-ordinal3-contract-coherence-check.mjs --check|--self-test");
}

try {
  main();
} catch (error) {
  writeReport({
    status: "incoherent-review-only-not-runtime-evidence",
    coherent: false,
    failure: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
}
