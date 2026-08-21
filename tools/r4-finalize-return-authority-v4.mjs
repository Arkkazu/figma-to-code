#!/usr/bin/env node
// Finalizes only the owner-approved R4 return-allocation sidecars.
// It never creates packets, staging, return plans, roles, site files, or
// lifecycle records.  Existing R3 v1 protocol/registry records are immutable.
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const HERE = dirname(fileURLToPath(import.meta.url));
const DESIGN_PATH = join(HERE, "r4-return-authority-v4-design.json");
const CANDIDATE_SCRIPT = join(HERE, "r4-return-authority-candidates-v4.mjs");
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;

const EXPECTED = Object.freeze({
  design: "8c4fb215a0a3ead792fc3742eb336d45c9517501b40fcb5e59f1d807993d2313",
  candidateBundleId: "c5ec0969c8e5882d51b4d966124f87557138bf1725315fa8b42cd368e1131cad",
  decision: "e1497dee0be929a01d21d520eab743d8c7f71ca7f910deacfafabc83f3440ab5",
  preImplementation: "01ae83d1d346d2f56ce4527c0e1d91389bee5d3bf00f0808018e6506ef9605a2",
  evaluator: "8ba089d6e48ad46eb5c4d7670222103c309b26e9af3ecd8097485f7f87776806",
  componentDecision: "2ecb1d110404a51a482ecd539969fa0f6bf4b1693dd855d8810790fe5686a657",
  baselineContract: "ef4c911cf48951365294cea604a86896c25d7ed656872661cb23cc54dc1c7166",
  currentContract: "06d8d35c5048d48f63c920126371f29073aba9a8c3cbe168cf97bdc33efac342",
  baselineCleanRoom: "440dc6ffa4a66727446831e59e517b4c4dbf1cf970a43dff012f184538f44592",
  currentCleanRoom: "18ba3b228118c0f8b8a85f2c8b151bbbe1049638802429ac7e50cfb4ece7351f",
  currentApproval: "ace010c21ed6d392e8f67283267996143e2ff216cc52e364cd4c794564b928ba",
  legacyProtocol: "a42c289be5e1084b211d1f65a32642184de6f94215f9466b5bc0f73d71f168a3",
  legacyRegistry: "138f2350739ac71d3cd795b174e708c35154a9cef38f1512dadd77b6c80d278d",
  helper: "5e29f8f9f7c5c58b004097e10a03ea5bb24b1a20feb48e040329ebb0dafd47b6",
  e2e: "c98b4c5f6ede175f89dbb4aba2381518f4a19badd87617d1ff0f66969d3f6ec6",
  planTemplate: "b9c7e784c2e7b72acd613d5459b75afcb04c596101f5cd7fcfd48cb32aa2a563",
  protocolTemplate: "a00c47117e08ed183670d1b68569fcf104b7f17f030eaa6aa8d75f27f9803d9f",
  registryTemplate: "4c8ffc6c01db12e10c29d959a4aff1259434aca52ce48dc03ae80f8c77c54682",
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  pairLock: "fd5ba36af2299b20bbd735bf072958573221c75858a6598931698094fd006b94",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  baselineActive: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentActive: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
});

const REL = Object.freeze({
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  preImplementation: "MyBrain/verify/p3-pre-implementation-proof-open-service-top-hero-v1.json",
  evaluator: "MyBrain/verify/p3-evaluator-baseline-open-service-top-hero-v1.json",
  components: "MyBrain/verify/component-decisions-open-service-top-hero-v1.json",
  cleanBaseline: "MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-baseline.json",
  cleanCurrent: "MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-current.json",
  currentApproval: "MyBrain/verify/p3-current-change-approval-open-service-top-hero-v1.json",
  legacyProtocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
  helper: "MyBrain/verify/p3-role-return.mjs",
  e2e: "MyBrain/verify/p3-role-return.e2e.mjs",
  planTemplate: "MyBrain/verify/p3-role-return-plan-template.json",
  protocolTemplate: "MyBrain/verify/p3-role-handoff-protocol-template.json",
  registryTemplate: "MyBrain/verify/p3-role-handoff-registry-template.json",
});

const CHECKPOINTS = [
  "open-service-top-hero",
  "open-service-header",
  "open-service-hero-visual",
  "open-service-hero-copy",
  "open-service-hero-actions",
  "open-service-hero-stats",
];
const HERO_LAUREL = "site/assets/hero/hero-laurel.png";
const EXECUTION_BOUNDARY = Object.freeze({
  pairReadiness: false,
  pairBegin: false,
  pairPreflight: false,
  rolePacket: false,
  roleDelivery: false,
  roleLaunch: false,
  implementation: false,
  browserMeasurement: false,
  figmaMeasurement: false,
  p11: false,
});

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function posix(pathname) { return normalize(resolve(pathname)).replace(/\\/g, "/"); }
function rootPath(root, relativePath) { return join(root, ...relativePath.split("/")); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function exactArray(left, right, label) {
  assert(Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((item, index) => item === right[index]), `${label} is not exact.`);
}
function fileBytes(pathname, label) {
  try { return readFileSync(pathname); }
  catch (error) { fail(`${label} is unreadable: ${posix(pathname)} (${error.message})`); }
}
function jsonFile(pathname, label) {
  try { return JSON.parse(fileBytes(pathname, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function checkedReference(pathname, expectedHash, label) {
  const bytes = fileBytes(pathname, label);
  const sha256 = digest(bytes);
  assert(sha256 === expectedHash, `${label} SHA-256 changed: expected ${expectedHash}, got ${sha256}.`);
  return { path: posix(pathname), sha256 };
}
function readCheckedJson(pathname, expectedHash, label) {
  const reference = checkedReference(pathname, expectedHash, label);
  const value = jsonFile(pathname, label);
  return { ...reference, value };
}
function sameBytes(left, right, label) {
  assert(left.equals(right), `${label} baseline/current bytes differ.`);
}
function assertAbsent(pathname, label) {
  assert(!existsSync(pathname), `${label} must not exist: ${posix(pathname)}`);
}
function equalObject(left, right, label) {
  assert(JSON.stringify(left) === JSON.stringify(right), `${label} differs.`);
}
function uniquePaths(values, label) {
  assert(Array.isArray(values), `${label} must be an array.`);
  const seen = new Set();
  values.forEach((value) => {
    assert(typeof value === "string" && value.startsWith("site/") && !value.includes("..") && !value.includes("\\"), `${label} contains an invalid target.`);
    const key = value.toLowerCase();
    assert(!seen.has(key), `${label} contains duplicate target: ${value}`);
    seen.add(key);
  });
  return values;
}
function directoriesFrom(createPaths) {
  const directories = new Set();
  for (const target of createPaths) {
    const segments = target.split("/");
    for (let index = 1; index < segments.length; index += 1) directories.add(segments.slice(0, index).join("/"));
  }
  return [...directories].sort((left, right) => {
    const depth = left.split("/").length - right.split("/").length;
    return depth !== 0 ? depth : left.localeCompare(right, "en");
  });
}
function ref(pathname, sha256) { return { path: posix(pathname), sha256 }; }
function recursiveForbidden(value, keys, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => recursiveForbidden(entry, keys, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!keys.has(key), `Final authority contains forbidden field ${path}.${key}.`);
    recursiveForbidden(child, keys, `${path}.${key}`);
  }
}
function assertNoRuntimeDeliveryFacts(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRuntimeDeliveryFacts(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "packetManifest") {
      assert(child === null, `Final inert authority has a packet manifest binding at ${path}.${key}.`);
      continue;
    }
    assert(!new Set(["opaqueHandoffId", "deliverySequence", "identityLeakScan"]).has(key),
      `Final inert authority contains delivery fact ${path}.${key}.`);
    assertNoRuntimeDeliveryFacts(child, `${path}.${key}`);
  }
}

function candidateSummary() {
  let output;
  try { output = execFileSync(process.execPath, [CANDIDATE_SCRIPT, "--dry-run"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { fail(`v4 candidate dry-run failed: ${error.stderr || error.message}`); }
  let result;
  try { result = JSON.parse(output); }
  catch (error) { fail(`v4 candidate dry-run returned invalid JSON: ${error.message}`); }
  assert(result.candidateBundleId === EXPECTED.candidateBundleId, "v4 candidate bundle ID changed.");
  assert(result.workspaceDesign?.sha256 === EXPECTED.design, "v4 candidate no longer binds the approved design SHA-256.");
  assert(result.candidateOnly === true && result.runtimeEligible === false && result.ownerApproved === false,
    "v4 candidate is not preserved as an unapproved non-runtime input.");
  return result;
}

function loadInputs({ allowFinalAuthorityRoot = false } = {}) {
  const candidate = candidateSummary();
  const design = readCheckedJson(DESIGN_PATH, EXPECTED.design, "approved v4 authority design");
  assert(design.value.schema === "p3-role-return-authority-candidate-design/v4", "approved design schema differs.");
  assert(design.value.candidateOnly === true && design.value.runtimeEligible === false && design.value.ownerApproved === false,
    "approved design must remain a candidate-only source record.");

  const baselineContract = readCheckedJson(rootPath(BASELINE, REL.contract), EXPECTED.baselineContract, "baseline final contract");
  const currentContract = readCheckedJson(rootPath(CURRENT, REL.contract), EXPECTED.currentContract, "current final contract");
  for (const [condition, contract] of [["baseline", baselineContract], ["current", currentContract]]) {
    assert(contract.value.version === 13 && contract.value.pairId === PAIR_ID && contract.value.condition === condition,
      `${condition} final contract is not the frozen v13 contract.`);
  }

  const decisionPath = rootPath(BASELINE, REL.decision);
  const decision = readCheckedJson(decisionPath, EXPECTED.decision, "baseline Decision J");
  const currentDecisionBytes = fileBytes(rootPath(CURRENT, REL.decision), "current Decision J");
  sameBytes(fileBytes(decisionPath, "baseline Decision J"), currentDecisionBytes, "Decision J");
  assert(decision.value.status === "approved" && decision.value.ownerApproved === true && decision.value.pairId === PAIR_ID,
    "Decision J is not the approved final record for this pair.");
  exactArray(decision.value.scope?.checkpointPlan, CHECKPOINTS, "Decision J checkpoint plan");
  const changeTargets = uniquePaths(decision.value.scope?.changeTargets, "Decision J change targets");
  assert(changeTargets.length === 28, "Decision J must freeze exactly 28 change targets.");
  assert(baselineContract.value.shared?.ownerDecisionJ?.sha256 === decision.sha256
    && currentContract.value.shared?.ownerDecisionJ?.sha256 === decision.sha256,
  "final contracts do not bind the approved Decision J bytes.");

  const preImplementation = readPairedJson(REL.preImplementation, EXPECTED.preImplementation, "pre-implementation proof");
  const evaluator = readPairedJson(REL.evaluator, EXPECTED.evaluator, "evaluator baseline");
  for (const source of [preImplementation, evaluator]) {
    assert(source.baseline.value.status === "approved" && source.baseline.value.ownerApproved === true,
      `${source.label} is not owner-approved.`);
  }
  const components = readPairedJson(REL.components, EXPECTED.componentDecision, "component decision");
  const componentById = new Map((components.baseline.value.decisions ?? []).map((entry) => [entry.elementId, entry]));
  const legacyProtocol = readPairedJson(REL.legacyProtocol, EXPECTED.legacyProtocol, "legacy R3 protocol");
  assert(legacyProtocol.baseline.value.schema === "p3-role-handoff-protocol/v1", "legacy R3 protocol schema changed.");
  exactArray(legacyProtocol.baseline.value.componentProtocol?.checkpointPlan, CHECKPOINTS, "legacy R3 checkpoint plan");
  const legacyRegistry = readCheckedJson(`${COORDINATOR}/records/p3-role-handoff-registry-${PAIR_ID}.json`, EXPECTED.legacyRegistry, "legacy R3 registry");
  assert(legacyRegistry.value.schema === "p3-role-handoff-registry/v1", "legacy R3 registry schema changed.");

  const cleanBaseline = readCheckedJson(rootPath(BASELINE, REL.cleanBaseline), EXPECTED.baselineCleanRoom, "baseline clean-room evidence");
  const cleanCurrent = readCheckedJson(rootPath(CURRENT, REL.cleanCurrent), EXPECTED.currentCleanRoom, "current clean-room evidence");
  const currentApproval = readCheckedJson(rootPath(CURRENT, REL.currentApproval), EXPECTED.currentApproval, "current B-only approval");
  for (const record of [cleanBaseline, cleanCurrent, currentApproval]) {
    assert(record.value.status === "approved" && record.value.ownerApproved === true, "approved R3 source record changed state.");
  }

  const helper = readPairedBytes(REL.helper, EXPECTED.helper, "v5 return helper");
  const e2e = readPairedBytes(REL.e2e, EXPECTED.e2e, "v5 return helper E2E");
  const planTemplate = readPairedBytes(REL.planTemplate, EXPECTED.planTemplate, "v5 return-plan template");
  const protocolTemplate = readPairedBytes(REL.protocolTemplate, EXPECTED.protocolTemplate, "v2 protocol template");
  const registryTemplate = readPairedBytes(REL.registryTemplate, EXPECTED.registryTemplate, "registry template");

  const ledger = checkedReference(`${PILOT}/.git/figma-p3-comparison-ledger.jsonl`, EXPECTED.ledger, "fixed pair ledger");
  const ledgerLines = fileBytes(ledger.path, "fixed pair ledger").toString("utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert(ledgerLines.length === 3 && ledgerLines[0].kind === "started"
    && ledgerLines[1].kind === "preflight-recorded" && ledgerLines[1].condition === "baseline"
    && ledgerLines[2].kind === "preflight-recorded" && ledgerLines[2].condition === "current",
  "pair ledger must still contain only started and the two preflight records.");
  assert(ledgerLines.every((entry) => entry.pairId === PAIR_ID && entry.contractVersion === 13), "pair ledger pair/version changed.");
  const pairLock = readCheckedJson(`${PILOT}/.git/figma-p3-comparison-pair-locks/55b8f4a26446c19fdfe5c43d2dae08e2b7715e31d1befee1f82257e36c0e4bac.json`, EXPECTED.pairLock, "fixed pair lock");
  assert(pairLock.value.version === 5 && pairLock.value.contractVersion === 13 && pairLock.value.pairId === PAIR_ID,
    "fixed pair lock changed.");
  const baselineActive = readCheckedJson(`${BASELINE}/.figma-gate/active.json`, EXPECTED.baselineActive, "baseline preflight active state");
  const currentActive = readCheckedJson(`${CURRENT}/.figma-gate/active.json`, EXPECTED.currentActive, "current preflight active state");
  validateActive(baselineActive, ledgerLines[1], "baseline");
  validateActive(currentActive, ledgerLines[2], "current");
  const p11 = readCheckedJson(`${COORDINATOR}/records/p3-p11-authorization-${PAIR_ID}.json`, EXPECTED.p11, "P11 blocked record");
  assert(p11.value.status === "BLOCKED" && (p11.value.authorization === "NOT_AUTHORIZED" || p11.value.p11Authorization === "NOT_AUTHORIZED"),
    "P11 record is no longer BLOCKED/NOT_AUTHORIZED.");

  assertAbsent(`${BASELINE}/site`, "baseline site directory");
  assertAbsent(`${CURRENT}/site`, "current site directory");
  for (const directory of ["plans", "packet-manifests", "packet-staging", "role-staging"]) {
    assertAbsent(`${COORDINATOR}/${directory}`, `coordinator ${directory} directory`);
  }
  if (!allowFinalAuthorityRoot) assertAbsent(`${COORDINATOR}/return-authority`, "coordinator return-authority directory");

  const v1Regions = legacyProtocol.baseline.value.componentProtocol?.regions;
  assert(Array.isArray(v1Regions) && v1Regions.length === 6, "legacy R3 delimiter region inventory changed.");
  return {
    candidate,
    design,
    baselineContract,
    currentContract,
    decision,
    preImplementation,
    evaluator,
    components,
    componentById,
    legacyProtocol,
    legacyRegistry,
    cleanBaseline,
    cleanCurrent,
    currentApproval,
    helper,
    e2e,
    planTemplate,
    protocolTemplate,
    registryTemplate,
    ledger,
    ledgerLines,
    pairLock,
    baselineActive,
    currentActive,
    p11,
    changeTargets,
    regions: clone(v1Regions),
  };
}

function readPairedJson(relativePath, expectedHash, label) {
  const baselinePath = rootPath(BASELINE, relativePath);
  const currentPath = rootPath(CURRENT, relativePath);
  const baseline = readCheckedJson(baselinePath, expectedHash, `baseline ${label}`);
  const currentBytes = fileBytes(currentPath, `current ${label}`);
  sameBytes(fileBytes(baselinePath, `baseline ${label}`), currentBytes, label);
  assert(digest(currentBytes) === expectedHash, `current ${label} SHA-256 changed.`);
  return { label, baseline, current: { path: posix(currentPath), sha256: expectedHash, value: JSON.parse(currentBytes.toString("utf8")) } };
}
function readPairedBytes(relativePath, expectedHash, label) {
  const generic = checkedReference(join(HERE, "..", "templates", "verify", relativePath.split("/").pop()), expectedHash, `generic ${label}`);
  const baselinePath = rootPath(BASELINE, relativePath);
  const currentPath = rootPath(CURRENT, relativePath);
  const baseline = checkedReference(baselinePath, expectedHash, `baseline ${label}`);
  const current = checkedReference(currentPath, expectedHash, `current ${label}`);
  sameBytes(fileBytes(generic.path, `generic ${label}`), fileBytes(baseline.path, `baseline ${label}`), `${label} generic/baseline`);
  sameBytes(fileBytes(generic.path, `generic ${label}`), fileBytes(current.path, `current ${label}`), `${label} generic/current`);
  return { generic, baseline, current };
}
function validateActive(active, ledgerEntry, condition) {
  assert(active.value.version === 5 && active.value.phase === "preflight", `${condition} active state is not frozen v5 preflight.`);
  assert(active.sha256 === ledgerEntry.preflightStateSha256 && active.value.preflightId === ledgerEntry.preflightId,
    `${condition} active state no longer matches its immutable preflight ledger entry.`);
}

function scopesFrom(inputs) {
  const sequences = inputs.design.value.perSequenceBootstrap?.sequences;
  assert(Array.isArray(sequences) && sequences.length === 6, "approved design must define six allocation sequences.");
  const owners = new Map();
  const scopes = sequences.map((entry, index) => {
    assert(entry.sequence === index + 1 && entry.elementId === CHECKPOINTS[index], "approved allocation sequence changed.");
    const allowedChangeTargets = uniquePaths(entry.proposedAllowedChangeTargets, `approved allocation allowedChangeTargets sequence ${index + 1}`);
    const attemptOneCreatePaths = uniquePaths(entry.proposedCreateTargets, `approved allocation createTargets sequence ${index + 1}`);
    for (const target of attemptOneCreatePaths) {
      assert(allowedChangeTargets.includes(target), `approved allocation creates target outside its allowlist: ${target}`);
      assert(!owners.has(target.toLowerCase()), `approved allocation creates target more than once: ${target}`);
      owners.set(target.toLowerCase(), index + 1);
    }
    const component = inputs.componentById.get(entry.elementId);
    assert(typeof component?.codePath === "string", `component decision lacks codePath for ${entry.elementId}.`);
    return {
      elementId: entry.elementId,
      sequence: index + 1,
      componentDecisionCodePath: component.codePath,
      allowedChangeTargets: clone(allowedChangeTargets),
      attemptOneCreatePaths: clone(attemptOneCreatePaths),
      derivedBootstrapDirectories: directoriesFrom(attemptOneCreatePaths),
    };
  });
  assert(owners.size === inputs.changeTargets.length, "approved allocation does not create exactly 28 targets.");
  for (const target of inputs.changeTargets) assert(owners.has(target.toLowerCase()), `approved allocation omits frozen target: ${target}`);
  const laurelScopes = scopes.filter((scope) => scope.attemptOneCreatePaths.includes(HERO_LAUREL));
  assert(laurelScopes.length === 1 && laurelScopes[0].sequence === 3 && scopes[2].allowedChangeTargets.includes(HERO_LAUREL),
    "hero-laurel creation/change authority must be sequence 3 only.");
  for (const scope of scopes.filter((scope) => scope.sequence !== 3)) {
    assert(!scope.allowedChangeTargets.includes(HERO_LAUREL) && !scope.attemptOneCreatePaths.includes(HERO_LAUREL),
      `hero-laurel appears outside its sequence 3 authority in sequence ${scope.sequence}.`);
  }
  return scopes;
}

function sourceBinding(inputs, condition) {
  const isBaseline = condition === "baseline";
  return {
    comparisonContract: ref(isBaseline ? inputs.baselineContract.path : inputs.currentContract.path, isBaseline ? inputs.baselineContract.sha256 : inputs.currentContract.sha256),
    ownerDecisionJ: {
      baselinePath: posix(rootPath(BASELINE, REL.decision)),
      currentPath: posix(rootPath(CURRENT, REL.decision)),
      sha256: inputs.decision.sha256,
    },
    preImplementationProof: {
      baselinePath: inputs.preImplementation.baseline.path,
      currentPath: inputs.preImplementation.current.path,
      sha256: inputs.preImplementation.baseline.sha256,
    },
    evaluatorBaseline: {
      baselinePath: inputs.evaluator.baseline.path,
      currentPath: inputs.evaluator.current.path,
      sha256: inputs.evaluator.baseline.sha256,
    },
    componentDecision: {
      baselinePath: inputs.components.baseline.path,
      currentPath: inputs.components.current.path,
      sha256: inputs.components.baseline.sha256,
    },
    cleanRoomEvidence: ref(isBaseline ? inputs.cleanBaseline.path : inputs.cleanCurrent.path, isBaseline ? inputs.cleanBaseline.sha256 : inputs.cleanCurrent.sha256),
    conditionSpecificApproval: isBaseline ? null : ref(inputs.currentApproval.path, inputs.currentApproval.sha256),
  };
}

function returnArtifacts(inputs) {
  return {
    helper: ref(inputs.helper.generic.path, inputs.helper.generic.sha256),
    e2e: ref(inputs.e2e.generic.path, inputs.e2e.generic.sha256),
    planTemplate: ref(inputs.planTemplate.generic.path, inputs.planTemplate.generic.sha256),
    protocolTemplate: ref(inputs.protocolTemplate.generic.path, inputs.protocolTemplate.generic.sha256),
    registryTemplate: ref(inputs.registryTemplate.generic.path, inputs.registryTemplate.generic.sha256),
    planVersion: 5,
    journalVersion: 2,
    manifestVersion: 4,
  };
}

function buildProtocol(inputs, scopes, approvedAt, outputRoot) {
  const legacy = inputs.legacyProtocol.baseline.value;
  const artifacts = returnArtifacts(inputs);
  return {
    schema: "p3-role-handoff-protocol/v2",
    recordState: "finalized",
    executionState: false,
    ownerApproved: true,
    ownerApprovedAt: approvedAt,
    approvalBasis: "Owner-approved R4 v4 allocation finalization only; this append-only return-allocation sidecar does not authorize role packet creation, delivery, launch, implementation, measurement, or P-11.",
    authorityRole: "post-preflight R4 return-allocation sidecar; not a pair-lifecycle record and not a runtime delivery registry",
    scopeId: "open-service-top-hero-v1",
    pairId: PAIR_ID,
    aBIdentical: true,
    aBByteIdentical: true,
    deliveryMode: "attachment-only",
    coordinatorOnly: {
      actualWorktree: true,
      commonGitDirectory: true,
      p3Lifecycle: true,
      comparisonContract: true,
      ownerDecisionJ: true,
      cleanRoomEvidence: true,
      contractTemplate: true,
      p11FailureRecord: true,
    },
    implementationLoop: {
      checkpointPlanSource: `${REL.components}#${inputs.components.baseline.sha256}`,
      submissionUnit: "one-component-one-attempt-one-return-archive",
      conditionIndependentAllocation: true,
      aBByteIdenticalProtocolRequired: true,
      attemptOneCreationPolicy: {
        attemptOneOnly: true,
        createPathsAreOwnedExactlyOnceAcrossCheckpointPlan: true,
        createPathsMustExactlyPartitionFrozenChangeTargets: true,
        createPathsMustBeOrderedSubsetsOfAllowedChangeTargets: true,
        bootstrapDirectoriesDerivedOnlyFromAttemptOneCreatePaths: true,
        siteRootOnly: true,
        laterAttemptsMayNotCreateTargets: true,
        laterSequencesMayNotRecreateTargets: true,
        p3OpenServiceTopHeroOwnership: {
          [HERO_LAUREL]: {
            ownerSequence: 3,
            mustAppearInAttemptOneCreatePaths: true,
            mustNotAppearInSequence6AllowedChangeTargets: true,
            mustNotAppearInSequence6AttemptOneCreatePaths: true,
          },
        },
      },
      componentReturnScopes: clone(scopes),
      frozenDelimiterBindings: clone(inputs.regions),
      coordinatorChecks: [
        "condition binding",
        "elementId",
        "component decision code path",
        "attempt number",
        "allowedChangeTargets",
        "attemptOneCreatePaths exactly match the coordinator handoff protocol component scope",
        "derivedBootstrapDirectories exactly match the directories derived from attemptOneCreatePaths",
        "attemptOneCreatePaths partition frozen changeTargets exactly once across the checkpoint plan",
        "P-3 hero-laurel ownership: sequence 3 only; sequence 6 may not create or change it",
      ],
      checkpointPerAppliedReturn: 1,
      progressOrder: [
        "one checked return apply",
        "one actual matching figma-gate checkpoint result in the actual worktree active state",
        "p3-role-return --record-checkpoint coordinator proof",
        "one same-condition feedback artifact and p3-role-return --record-feedback",
        "only then the next component or retry delivery",
      ],
      feedbackAllowed: clone(legacy.componentProtocol.feedbackAllowed),
      feedbackForbidden: clone(legacy.componentProtocol.feedbackForbidden),
      maxAttemptsPerComponent: 3,
      stopRule: legacy.componentProtocol.stopRule,
      reviewCannotPreCorrectAttempt: true,
      absoluteFirstTryPassRateComparableToNormalOperation: false,
      comparisonInterpretation: "A/B difference under this identical protocol only",
      negativeTestRequirements: [
        "N-1: Creating a target outside this sequence's allowedChangeTargets fails.",
        "N-2: Any new target creation at attempt 2 or later fails.",
        "N-3: A target already created by one sequence cannot be created again by another sequence.",
        "N-4: A target cannot be created twice within one sequence fails.",
        "N-5: A bootstrap directory outside site/, absolute, traversal-bearing, or under a forbidden root fails.",
        "N-6: protocol componentReturnScopes and return-plan allowedChangeTargets, attemptOneCreatePaths, or derivedBootstrapDirectories mismatch fails.",
        "N-7: The union of all attemptOneCreatePaths is not an exact 28-target partition of frozen changeTargets fails.",
        "N-8: Recovery finds a non-empty transaction-created directory, preserves it, reports it, and fails closed.",
        "N-9: Recovery never deletes a directory absent from its journal.",
        "N-10: A crash after mkdir and before the created-state write recovers an empty journal-intent-proven directory to a consistent rollback state; a non-empty or journal-unproven directory remains fail-closed.",
        "N-11: A v1 journal recovers successfully through v2 code.",
        "N-12: A v2 journal with a required field missing fails.",
        "N-13: A condition-local return authority whose packet manifest, attachment hash, or identityLeakScan does not match fails.",
        "N-14: sequence 6 attempts to create or change site/assets/hero/hero-laurel.png and fails.",
        "N-15: baseline and current finalized handoff-protocol bytes differ and fail.",
      ],
      retainedLegacyV4NegativeTests: [
        "A legacy firstComponentFullCreate field is rejected; it is a negative-test fixture only and is not a v2 runtime field.",
        "A create path outside its component allowlist is rejected.",
        "A shared delimiter-region return with any byte changed outside its declared delimiters is rejected.",
      ],
    },
    returnPackage: {
      validator: artifacts.helper,
      e2e: artifacts.e2e,
      planTemplate: artifacts.planTemplate,
      protocolTemplate: artifacts.protocolTemplate,
      registryTemplate: artifacts.registryTemplate,
      planVersion: 5,
      manifestVersion: 4,
      recoveryJournal: {
        version: 2,
        writeDirectoryIntentBeforeMkdir: true,
        recordCreatedByThisTransaction: true,
        rollbackDeletesInReverseCreationOrder: true,
        rollbackDeletesOnlyEmptyDirectoriesCreatedByThisTransaction: true,
        unknownOrNonEmptyDirectoriesArePreservedAndFailClosed: true,
        v1RecoveryCompatibilityRequired: true,
      },
    },
    authorityBindings: {
      approvedDesign: ref(DESIGN_PATH, inputs.design.sha256),
      candidateBundleId: inputs.candidate.candidateBundleId,
      sourceRecords: {
        ownerDecisionJ: sourceBinding(inputs, "baseline").ownerDecisionJ,
        preImplementationProof: sourceBinding(inputs, "baseline").preImplementationProof,
        evaluatorBaseline: sourceBinding(inputs, "baseline").evaluatorBaseline,
        componentDecision: sourceBinding(inputs, "baseline").componentDecision,
        baselineComparisonContract: ref(inputs.baselineContract.path, inputs.baselineContract.sha256),
        currentComparisonContract: ref(inputs.currentContract.path, inputs.currentContract.sha256),
        baselineCleanRoomEvidence: ref(inputs.cleanBaseline.path, inputs.cleanBaseline.sha256),
        currentCleanRoomEvidence: ref(inputs.cleanCurrent.path, inputs.cleanCurrent.sha256),
        currentBOnlyApproval: ref(inputs.currentApproval.path, inputs.currentApproval.sha256),
      },
      returnArtifacts: artifacts,
      historicalLifecycleSnapshot: {
        ledger: ref(inputs.ledger.path, inputs.ledger.sha256),
        pairLock: ref(inputs.pairLock.path, inputs.pairLock.sha256),
        baselinePreflight: { preflightId: inputs.ledgerLines[1].preflightId, stateSha256: inputs.baselineActive.sha256 },
        currentPreflight: { preflightId: inputs.ledgerLines[2].preflightId, stateSha256: inputs.currentActive.sha256 },
      },
      p11BlockedRecord: ref(inputs.p11.path, inputs.p11.sha256),
      retainedLegacyRecords: {
        baselineProtocolV1: ref(rootPath(BASELINE, REL.legacyProtocol), inputs.legacyProtocol.baseline.sha256),
        currentProtocolV1: ref(rootPath(CURRENT, REL.legacyProtocol), inputs.legacyProtocol.current.sha256),
        coordinatorRegistryV1: ref(`${COORDINATOR}/records/p3-role-handoff-registry-${PAIR_ID}.json`, inputs.legacyRegistry.sha256),
        retainedNoMutation: true,
      },
      successorOutputRoot: posix(outputRoot),
    },
    runtimeActivationRequired: [
      "separate owner authorization for role packet creation",
      "per-delivery packet manifest and p3-role-packet check",
      "schema-aligned runtime registry and concrete return plan",
      "separate delivery authorization",
    ],
    executionBoundary: clone(EXECUTION_BOUNDARY),
  };
}

function buildAuthority(inputs, scopes, approvedAt, condition, protocolReference) {
  const sourceBindings = sourceBinding(inputs, condition);
  const peerCondition = condition === "baseline" ? "current" : "baseline";
  const peerProtocolPath = `../../protocols/${peerCondition}/p3-role-handoff-protocol-v2.json`;
  return {
    schema: "p3-role-return-authority/v1",
    kind: "condition-local-final-return-authority",
    recordState: "finalized",
    executionState: false,
    runtimeEligible: false,
    ownerApproved: true,
    ownerApprovedAt: approvedAt,
    approvalBasis: "Owner-approved v4 allocation binding only; packet, delivery, launch, implementation, browser/Figma measurement, and P-11 are excluded.",
    authorityRole: "inert condition-local allocation authority; not a p3-role-handoff-registry and not a concrete return-plan authority",
    pairId: PAIR_ID,
    condition,
    deliveryMode: "attachment-only",
    coordinatorOnly: true,
    protocol: clone(protocolReference),
    peerProtocol: { path: peerProtocolPath, sha256: protocolReference.sha256 },
    sourceBindings,
    frozenScope: {
      checkpointPlan: clone(CHECKPOINTS),
      changeTargets: clone(inputs.changeTargets),
      componentReturnScopes: clone(scopes),
    },
    returnPackage: returnArtifacts(inputs),
    legacyReferences: {
      protocolV1: {
        baselinePath: posix(rootPath(BASELINE, REL.legacyProtocol)),
        currentPath: posix(rootPath(CURRENT, REL.legacyProtocol)),
        sha256: inputs.legacyProtocol.baseline.sha256,
      },
      registryV1: ref(`${COORDINATOR}/records/p3-role-handoff-registry-${PAIR_ID}.json`, inputs.legacyRegistry.sha256),
      retainedNoMutation: true,
    },
    packetAuthority: {
      status: "NOT_CREATED",
      recipientPackets: [],
      packetManifest: null,
      rolePacketCreationAuthorized: false,
    },
    deliveryAuthority: {
      status: "NOT_AUTHORIZED",
      roleDeliveryAuthorized: false,
      roleLaunchAuthorized: false,
    },
    executionBoundary: clone(EXECUTION_BOUNDARY),
  };
}

function validateFinalProtocol(value, inputs, scopes, approvedAt) {
  assert(value.schema === "p3-role-handoff-protocol/v2" && value.recordState === "finalized"
    && value.executionState === false && value.ownerApproved === true && value.ownerApprovedAt === approvedAt
    && value.pairId === PAIR_ID && value.aBIdentical === true && value.aBByteIdentical === true,
  "final protocol top-level state is invalid.");
  equalObject(value.executionBoundary, EXECUTION_BOUNDARY, "final protocol execution boundary");
  assert(value.authorityRole.includes("not a pair-lifecycle"), "final protocol must declare lifecycle separation.");
  const scopesValue = value.implementationLoop?.componentReturnScopes;
  assert(Array.isArray(scopesValue) && scopesValue.length === 6, "final protocol must contain six scopes.");
  scopesValue.forEach((scope, index) => {
    exactArray(Object.keys(scope).sort(), ["allowedChangeTargets", "attemptOneCreatePaths", "componentDecisionCodePath", "derivedBootstrapDirectories", "elementId", "sequence"], `scope ${index + 1} keys`);
    equalObject(scope, scopes[index], `final protocol scope ${index + 1}`);
  });
  assert(value.implementationLoop.maxAttemptsPerComponent === 3, "final protocol max attempts changed.");
  assert(value.returnPackage.planVersion === 5 && value.returnPackage.recoveryJournal.version === 2, "final protocol v5/journal v2 binding invalid.");
  assert(value.authorityBindings.approvedDesign.sha256 === EXPECTED.design
    && value.authorityBindings.candidateBundleId === EXPECTED.candidateBundleId,
  "final protocol does not bind the approved v4 design/candidate.");
  recursiveForbidden(value, new Set(["opaqueHandoffId", "deliverySequence", "packetManifest", "identityLeakScan", "recipientPackets"]));
}
function validateAuthority(value, inputs, scopes, approvedAt, condition, protocolReference) {
  assert(value.schema === "p3-role-return-authority/v1" && value.kind === "condition-local-final-return-authority"
    && value.recordState === "finalized" && value.executionState === false && value.runtimeEligible === false
    && value.ownerApproved === true && value.ownerApprovedAt === approvedAt && value.pairId === PAIR_ID && value.condition === condition,
  `${condition} final condition-local authority top-level state is invalid.`);
  equalObject(value.executionBoundary, EXECUTION_BOUNDARY, `${condition} authority execution boundary`);
  equalObject(value.protocol, protocolReference, `${condition} authority protocol binding`);
  equalObject(value.frozenScope.componentReturnScopes, scopes, `${condition} authority allocation`);
  assert(value.packetAuthority.status === "NOT_CREATED" && value.packetAuthority.rolePacketCreationAuthorized === false
    && Array.isArray(value.packetAuthority.recipientPackets) && value.packetAuthority.recipientPackets.length === 0
    && value.packetAuthority.packetManifest === null,
  `${condition} authority must not fabricate packet facts.`);
  assert(value.deliveryAuthority.status === "NOT_AUTHORIZED" && value.deliveryAuthority.roleDeliveryAuthorized === false
    && value.deliveryAuthority.roleLaunchAuthorized === false,
  `${condition} authority must not authorize delivery or launch.`);
  assert(value.sourceBindings.comparisonContract.sha256 === (condition === "baseline" ? EXPECTED.baselineContract : EXPECTED.currentContract),
    `${condition} authority contract binding changed.`);
  assertNoRuntimeDeliveryFacts(value);
}

function buildBundle(inputs, approvedAt) {
  const scopes = scopesFrom(inputs);
  const parent = `${COORDINATOR}/return-authority/v4`;
  const outputRoot = `${parent}/${EXPECTED.candidateBundleId}`;
  assertAbsent(outputRoot, "final v2 authority output root");
  const protocol = buildProtocol(inputs, scopes, approvedAt, outputRoot);
  validateFinalProtocol(protocol, inputs, scopes, approvedAt);
  const protocolBytes = jsonBytes(protocol);
  const protocolHash = digest(protocolBytes);
  const baselineProtocolPath = "../../protocols/baseline/p3-role-handoff-protocol-v2.json";
  const currentProtocolPath = "../../protocols/current/p3-role-handoff-protocol-v2.json";
  const baselineAuthority = buildAuthority(inputs, scopes, approvedAt, "baseline", { path: baselineProtocolPath, sha256: protocolHash });
  const currentAuthority = buildAuthority(inputs, scopes, approvedAt, "current", { path: currentProtocolPath, sha256: protocolHash });
  validateAuthority(baselineAuthority, inputs, scopes, approvedAt, "baseline", { path: baselineProtocolPath, sha256: protocolHash });
  validateAuthority(currentAuthority, inputs, scopes, approvedAt, "current", { path: currentProtocolPath, sha256: protocolHash });
  const files = new Map([
    ["protocols/baseline/p3-role-handoff-protocol-v2.json", protocolBytes],
    ["protocols/current/p3-role-handoff-protocol-v2.json", protocolBytes],
    ["authorities/baseline/p3-role-return-authority-v1.json", jsonBytes(baselineAuthority)],
    ["authorities/current/p3-role-return-authority-v1.json", jsonBytes(currentAuthority)],
  ]);
  const outputFiles = [...files.entries()].map(([relativePath, bytes]) => ({ relativePath, sha256: digest(bytes), bytes: bytes.length }));
  const report = {
    schema: "p3-r4-return-authority-finalization-report/v1",
    transactionId: randomUUID(),
    finalizationKind: "append-only R4 return-allocation sidecars",
    pairId: PAIR_ID,
    candidateBundleId: EXPECTED.candidateBundleId,
    ownerApprovalRecordedAt: approvedAt,
    ownerApprovalScope: "Final v2 allocation protocol and inert condition-local authorities only; role packet, delivery/launch, implementation, browser/Figma measurement, and P-11 remain unauthorized.",
    outputRoot: posix(outputRoot),
    outputs: outputFiles,
    immutableInputs: {
      approvedDesign: ref(DESIGN_PATH, inputs.design.sha256),
      decisionJ: ref(inputs.decision.path, inputs.decision.sha256),
      baselineContract: ref(inputs.baselineContract.path, inputs.baselineContract.sha256),
      currentContract: ref(inputs.currentContract.path, inputs.currentContract.sha256),
      preImplementationProof: ref(inputs.preImplementation.baseline.path, inputs.preImplementation.baseline.sha256),
      evaluatorBaseline: ref(inputs.evaluator.baseline.path, inputs.evaluator.baseline.sha256),
      componentDecision: ref(inputs.components.baseline.path, inputs.components.baseline.sha256),
      baselineCleanRoomEvidence: ref(inputs.cleanBaseline.path, inputs.cleanBaseline.sha256),
      currentCleanRoomEvidence: ref(inputs.cleanCurrent.path, inputs.cleanCurrent.sha256),
      currentBOnlyApproval: ref(inputs.currentApproval.path, inputs.currentApproval.sha256),
      legacyProtocolV1: ref(rootPath(BASELINE, REL.legacyProtocol), inputs.legacyProtocol.baseline.sha256),
      legacyRegistryV1: ref(`${COORDINATOR}/records/p3-role-handoff-registry-${PAIR_ID}.json`, inputs.legacyRegistry.sha256),
      ledger: ref(inputs.ledger.path, inputs.ledger.sha256),
      pairLock: ref(inputs.pairLock.path, inputs.pairLock.sha256),
      p11BlockedRecord: ref(inputs.p11.path, inputs.p11.sha256),
    },
    historicPreflightSnapshot: {
      baseline: { preflightId: inputs.ledgerLines[1].preflightId, activeStateSha256: inputs.baselineActive.sha256 },
      current: { preflightId: inputs.ledgerLines[2].preflightId, activeStateSha256: inputs.currentActive.sha256 },
    },
    allocation: scopes.map((scope) => ({ sequence: scope.sequence, elementId: scope.elementId, createTargetCount: scope.attemptOneCreatePaths.length, createTargets: scope.attemptOneCreatePaths })),
    validation: {
      targetPartition: "2/10/12/0/4/0; 28/28 exactly once",
      heroLaurelOwnerSequence: 3,
      protocolABByteIdentical: true,
      siteDirectoriesAbsentBeforeFinalization: true,
      packetAndStagingAbsentBeforeFinalization: true,
      legacyR3RecordsRetainedWithoutMutation: true,
      lifecycleRecordsRetainedWithoutMutation: true,
      p11RemainsBlockedNotAuthorized: true,
      concreteReturnPlanCreated: false,
      runtimeRegistryCreated: false,
      rolePacketCreated: false,
      roleDeliveryOrLaunchAuthorized: false,
    },
  };
  files.set("finalization-report.json", jsonBytes(report));
  return { outputRoot, parent, files, report };
}

function validateStagedBundle(stage, bundle) {
  for (const [relativePath, expectedBytes] of bundle.files) {
    const pathname = join(stage, ...relativePath.split("/"));
    const actual = fileBytes(pathname, `staged ${relativePath}`);
    assert(actual.equals(expectedBytes), `staged bytes differ: ${relativePath}`);
  }
  const protocolA = fileBytes(join(stage, "protocols", "baseline", "p3-role-handoff-protocol-v2.json"), "staged baseline v2 protocol");
  const protocolB = fileBytes(join(stage, "protocols", "current", "p3-role-handoff-protocol-v2.json"), "staged current v2 protocol");
  sameBytes(protocolA, protocolB, "staged A/B v2 protocol");
}
function inventoryOwnedBundle(pathname, bundle, { complete, label }) {
  const root = resolve(pathname);
  const parent = resolve(bundle.parent);
  assert(root.startsWith(`${parent}\\`) || root.startsWith(`${parent}/`), `${label} is outside the authorized authority parent.`);
  assert(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), `${label} is not a real directory.`);
  const discovered = [];
  function descend(directory, relativePath = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const nextRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const next = join(directory, entry.name);
      const stat = lstatSync(next);
      assert(!stat.isSymbolicLink(), `${label} contains a symbolic link: ${nextRelative}`);
      if (stat.isDirectory()) descend(next, nextRelative);
      else {
        assert(stat.isFile(), `${label} contains a non-regular entry: ${nextRelative}`);
        discovered.push(nextRelative.replace(/\\/g, "/"));
      }
    }
  }
  descend(root);
  discovered.sort();
  const expected = [...bundle.files.keys()].sort();
  assert(discovered.every((entry) => expected.includes(entry)), `${label} contains an unexpected file.`);
  if (complete) exactArray(discovered, expected, `${label} file inventory`);
}
function removeOwnedBundle(pathname, bundle, { complete, label }) {
  if (!existsSync(pathname)) return;
  inventoryOwnedBundle(pathname, bundle, { complete, label });
  rmSync(pathname, { recursive: true, force: false, maxRetries: 0 });
}
function pruneCreatedAuthorityParents(bundle) {
  let current = resolve(bundle.parent);
  const coordinator = resolve(COORDINATOR);
  while (current !== coordinator) {
    if (!existsSync(current)) {
      current = dirname(current);
      continue;
    }
    const stat = lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), "created authority parent changed to a non-real directory.");
    if (readdirSync(current).length !== 0) break;
    rmdirSync(current);
    current = dirname(current);
  }
}
function publishBundle(bundle) {
  const parentExisted = existsSync(bundle.parent);
  mkdirSync(bundle.parent, { recursive: true });
  assertAbsent(bundle.outputRoot, "final v2 authority output root immediately before publish");
  let stage;
  try {
    stage = mkdtempSync(join(bundle.parent, `.${EXPECTED.candidateBundleId}.stage-`));
    for (const [relativePath, bytes] of bundle.files) {
      const pathname = join(stage, ...relativePath.split("/"));
      mkdirSync(dirname(pathname), { recursive: true });
      writeFileSync(pathname, bytes, { flag: "wx" });
    }
    validateStagedBundle(stage, bundle);
    assertAbsent(bundle.outputRoot, "final v2 authority output root immediately before rename");
    renameSync(stage, bundle.outputRoot);
    return { parentExisted };
  } catch (error) {
    try {
      if (stage && existsSync(stage)) removeOwnedBundle(stage, bundle, { complete: false, label: "failed finalization stage" });
      if (!parentExisted) pruneCreatedAuthorityParents(bundle);
    } catch (rollbackError) {
      error.message = `${error.message}; rollback of the unpublished stage also failed: ${rollbackError.message}`;
    }
    throw error;
  }
}
function postValidate(inputs, bundle) {
  assert(existsSync(bundle.outputRoot), "published final v2 authority root is missing.");
  validateStagedBundle(bundle.outputRoot, bundle);
  const protocolA = jsonFile(join(bundle.outputRoot, "protocols", "baseline", "p3-role-handoff-protocol-v2.json"), "published baseline v2 protocol");
  const protocolB = jsonFile(join(bundle.outputRoot, "protocols", "current", "p3-role-handoff-protocol-v2.json"), "published current v2 protocol");
  equalObject(protocolA, protocolB, "published A/B protocol JSON");
  const scopes = scopesFrom(inputs);
  validateFinalProtocol(protocolA, inputs, scopes, protocolA.ownerApprovedAt);
  validateAuthority(jsonFile(join(bundle.outputRoot, "authorities", "baseline", "p3-role-return-authority-v1.json"), "published baseline authority"), inputs, scopes, protocolA.ownerApprovedAt, "baseline", { path: "../../protocols/baseline/p3-role-handoff-protocol-v2.json", sha256: digest(jsonBytes(protocolA)) });
  validateAuthority(jsonFile(join(bundle.outputRoot, "authorities", "current", "p3-role-return-authority-v1.json"), "published current authority"), inputs, scopes, protocolA.ownerApprovedAt, "current", { path: "../../protocols/current/p3-role-handoff-protocol-v2.json", sha256: digest(jsonBytes(protocolA)) });
  // Repeat immutable checks after the append-only publish.
  loadInputs({ allowFinalAuthorityRoot: true });
}

function main() {
  const args = process.argv.slice(2);
  if (!(args.length === 1 && (args[0] === "--dry-run" || args[0] === "--apply"))) {
    fail("Usage: node r4-finalize-return-authority-v4.mjs --dry-run|--apply");
  }
  const inputs = loadInputs();
  const approvedAt = new Date().toISOString();
  const bundle = buildBundle(inputs, approvedAt);
  if (args[0] === "--apply") {
    const transaction = publishBundle(bundle);
    try {
      postValidate(inputs, bundle);
    } catch (error) {
      try {
        removeOwnedBundle(bundle.outputRoot, bundle, { complete: true, label: "failed published final authority bundle" });
        if (!transaction.parentExisted) pruneCreatedAuthorityParents(bundle);
      } catch (rollbackError) {
        error.message = `${error.message}; rollback of the published authority bundle also failed: ${rollbackError.message}`;
      }
      throw error;
    }
  }
  const output = {
    status: args[0] === "--apply" ? "finalized" : "validated-dry-run",
    externalWritesPerformed: args[0] === "--apply",
    outputRoot: posix(bundle.outputRoot),
    ownerApprovalRecordedAt: approvedAt,
    candidateBundleId: EXPECTED.candidateBundleId,
    files: [...bundle.files.entries()].map(([relativePath, bytes]) => ({ relativePath, sha256: digest(bytes), bytes: bytes.length })),
    prohibitedActions: {
      rolePacket: false,
      roleDelivery: false,
      roleLaunch: false,
      implementation: false,
      browserMeasurement: false,
      figmaMeasurement: false,
      p11: false,
      lifecycleMutation: false,
      legacyR3RecordReplacement: false,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try { main(); }
catch (error) { console.error(`P3 R4 RETURN AUTHORITY FINALIZATION: ${error.message}`); process.exitCode = 1; }
