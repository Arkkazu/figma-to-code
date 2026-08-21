#!/usr/bin/env node
// P-3 R4 baseline sequence-1 runtime activation finalizer.
//
// This is deliberately an append-only coordinator tool.  It never writes a
// worktree, role home, lifecycle ledger, P-11 record, or site file.  A failed
// helper-release parity check is reported as BLOCKED and performs no write.
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
import { dirname, join, normalize, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkRolePacket } from "../templates/verify/p3-role-packet.mjs";
import { hashInputStaging, validateRoleReturn } from "../templates/verify/p3-role-return.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAIR_ID = "open-service-top-hero-v1-20260809";
const SCOPE_ID = "open-service-top-hero-v1";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;
const CANDIDATE_BUNDLE_ID = "c5ec0969c8e5882d51b4d966124f87557138bf1725315fa8b42cd368e1131cad";
const V4_ROOT = `${COORDINATOR}/return-authority/v4/${CANDIDATE_BUNDLE_ID}`;
const ACTIVATION_PARENT = `${COORDINATOR}/runtime-activations/v2`;
const DESIGN_PATH = join(HERE, "r4-return-authority-v4-design.json");

const EXPECTED = Object.freeze({
  design: "8c4fb215a0a3ead792fc3742eb336d45c9517501b40fcb5e59f1d807993d2313",
  v4Protocol: "a4c0202ee603ea63c4a5d05f35bdda0944305a20ab756358740ba692a8499919",
  baselineAuthority: "616197ba6063f316731da4f07ebb1d2795d2674c3ebe59b26cd91b6a79d71e97",
  decision: "e1497dee0be929a01d21d520eab743d8c7f71ca7f910deacfafabc83f3440ab5",
  baselineContract: "ef4c911cf48951365294cea604a86896c25d7ed656872661cb23cc54dc1c7166",
  currentContract: "06d8d35c5048d48f63c920126371f29073aba9a8c3cbe168cf97bdc33efac342",
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  pairLock: "fd5ba36af2299b20bbd735bf072958573221c75858a6598931698094fd006b94",
  baselineActive: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentActive: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  pcReference: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0",
  spReference: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427",
});
const RELEASE_EXPECTED = Object.freeze({
  "return-helper": "7ad82ecbb7ecf7678071ff5e857b0d0312851180911750da92f5f5d0a7fbb89d",
  "return-helper-e2e": "5a1bc396f10523680fe3cc85e606fe57f2e3ac477184ce33786cf41a8a4ec2fc",
  "return-plan-template": "7212cd022b4b5fb5634d14c63d382ad275ee3723a849b60fa6d53576ae77f730",
  "registry-template": "d8bb833bb593a9045bcff4ab0dd2949c5a32ac5d151f5f90646a07b35f377918",
  "protocol-template": "12a6cb01c87b2c0239c78feb2216faf632baf66cee30ba6647e18f646aa96e5b",
});

const REL = Object.freeze({
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  helper: "MyBrain/verify/p3-role-return.mjs",
  helperE2e: "MyBrain/verify/p3-role-return.e2e.mjs",
  returnPlanTemplate: "MyBrain/verify/p3-role-return-plan-template.json",
  returnManifestTemplate: "MyBrain/verify/p3-role-return-manifest-template.json",
  feedbackTemplate: "MyBrain/verify/p3-role-return-feedback-template.json",
  protocolTemplate: "MyBrain/verify/p3-role-handoff-protocol-template.json",
  registryTemplate: "MyBrain/verify/p3-role-handoff-registry-template.json",
  packetHelper: "MyBrain/verify/p3-role-packet.mjs",
  packetPlanTemplate: "MyBrain/verify/p3-role-packet-plan-template.json",
  pcReference: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/exports/pc-first-view.png",
  spReference: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/exports/sp-first-view.png",
});

const CHECKPOINTS = Object.freeze([
  "open-service-top-hero",
  "open-service-header",
  "open-service-hero-visual",
  "open-service-hero-copy",
  "open-service-hero-actions",
  "open-service-hero-stats",
]);
const COMPONENT = Object.freeze({
  elementId: CHECKPOINTS[0],
  sequence: 1,
  attempt: 1,
  componentDecisionCodePath: "site/index.html",
  allowedChangeTargets: ["site/index.html", "site/styles.css"],
  attemptOneCreatePaths: ["site/index.html", "site/styles.css"],
  derivedBootstrapDirectories: ["site"],
});
const PROTOCOL_COMPONENT = Object.freeze({
  elementId: COMPONENT.elementId,
  sequence: COMPONENT.sequence,
  componentDecisionCodePath: COMPONENT.componentDecisionCodePath,
  allowedChangeTargets: COMPONENT.allowedChangeTargets,
  attemptOneCreatePaths: COMPONENT.attemptOneCreatePaths,
  derivedBootstrapDirectories: COMPONENT.derivedBootstrapDirectories,
});
const DELIVERY_PROGRESS = Object.freeze({
  version: 1,
  scope: "per-condition",
  initialDeliverySequence: 1,
  increment: 1,
});
const ROLE_BOUNDARY = Object.freeze({
  pairReadiness: false,
  pairBegin: false,
  pairPreflight: false,
  rolePacket: true,
  roleDelivery: false,
  roleLaunch: false,
  implementation: false,
  browserMeasurement: false,
  figmaMeasurement: false,
  p11: false,
});

const RELEASE_FILES = Object.freeze([
  { id: "return-helper", generic: "p3-role-return.mjs", relative: REL.helper },
  { id: "return-helper-e2e", generic: "p3-role-return.e2e.mjs", relative: REL.helperE2e },
  { id: "return-plan-template", generic: "p3-role-return-plan-template.json", relative: REL.returnPlanTemplate },
  { id: "return-manifest-template", generic: "p3-role-return-manifest-template.json", relative: REL.returnManifestTemplate },
  { id: "return-feedback-template", generic: "p3-role-return-feedback-template.json", relative: REL.feedbackTemplate },
  { id: "protocol-template", generic: "p3-role-handoff-protocol-template.json", relative: REL.protocolTemplate },
  { id: "registry-template", generic: "p3-role-handoff-registry-template.json", relative: REL.registryTemplate },
  { id: "packet-helper", generic: "p3-role-packet.mjs", relative: REL.packetHelper },
  { id: "packet-plan-template", generic: "p3-role-packet-plan-template.json", relative: REL.packetPlanTemplate },
]);

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function posix(value) { return normalize(resolve(value)).replace(/\\/g, "/"); }
function rootPath(root, relativePath) { return join(root, ...relativePath.split("/")); }
function ref(path, digest) { return { path, sha256: digest }; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function stableHash(value) { return sha256(Buffer.from(JSON.stringify(canonical(value)), "utf8")); }
function exact(left, right, label) { assert(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)), `${label} is not exact.`); }
function sameBytes(left, right, label) { assert(left.equals(right), `${label} bytes differ.`); }
function assertAbsent(path, label) { assert(!existsSync(path), `${label} already exists: ${posix(path)}`); }
function readRegular(path, label) {
  assert(existsSync(path), `${label} is missing: ${posix(path)}`);
  const info = lstatSync(path);
  assert(!info.isSymbolicLink() && info.isFile(), `${label} must be a regular file.`);
  return readFileSync(path);
}
function readJson(path, label) {
  try { return JSON.parse(readRegular(path, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function checkedFile(path, expected, label) {
  const bytes = readRegular(path, label);
  const digest = sha256(bytes);
  assert(digest === expected, `${label} SHA-256 changed: expected ${expected}, got ${digest}.`);
  return { path: posix(path), sha256: digest, bytes };
}
function checkedJson(path, expected, label) {
  const file = checkedFile(path, expected, label);
  try { return { ...file, value: JSON.parse(file.bytes.toString("utf8")) }; }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function writeNew(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
}
function listFiles(root) {
  const found = [];
  function walk(directory, prefix = "") {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "variant" }));
    for (const child of children) {
      const full = join(directory, child.name);
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const info = lstatSync(full);
      assert(!info.isSymbolicLink(), `bundle contains a symbolic link: ${relativePath}`);
      if (info.isDirectory()) walk(full, relativePath);
      else {
        assert(info.isFile(), `bundle contains a non-regular entry: ${relativePath}`);
        found.push({ relativePath, sha256: sha256(readFileSync(full)), bytes: info.size });
      }
    }
  }
  walk(root);
  return found;
}
function inventory(path, expectedFiles, label, { complete = true } = {}) {
  assert(existsSync(path), `${label} is missing.`);
  const info = lstatSync(path);
  assert(!info.isSymbolicLink() && info.isDirectory(), `${label} is not a real directory.`);
  const actual = listFiles(path).map((entry) => entry.relativePath).sort();
  const expected = [...expectedFiles.keys()].sort();
  assert(actual.every((entry) => expected.includes(entry)), `${label} has an unexpected file.`);
  if (complete) exact(actual, expected, `${label} inventory`);
  return actual;
}
function releaseWorkspacePath(entry) { return join(HERE, "..", "templates", "verify", entry.generic); }
function releaseConditionPath(conditionRoot, entry) { return rootPath(conditionRoot, entry.relative); }

function loadRelease() {
  const records = RELEASE_FILES.map((entry) => {
    const generic = readRegular(releaseWorkspacePath(entry), `generic ${entry.id}`);
    const baseline = readRegular(releaseConditionPath(BASELINE, entry), `baseline ${entry.id}`);
    const current = readRegular(releaseConditionPath(CURRENT, entry), `current ${entry.id}`);
    return {
      id: entry.id,
      genericPath: posix(releaseWorkspacePath(entry)),
      baselinePath: posix(releaseConditionPath(BASELINE, entry)),
      currentPath: posix(releaseConditionPath(CURRENT, entry)),
      genericSha256: sha256(generic),
      baselineSha256: sha256(baseline),
      currentSha256: sha256(current),
      generic,
      baseline,
      current,
    };
  });
  const mismatches = records.filter((entry) => !entry.generic.equals(entry.baseline) || !entry.generic.equals(entry.current))
    .map(({ id, genericPath, baselinePath, currentPath, genericSha256, baselineSha256, currentSha256 }) => ({
      id, genericPath, baselinePath, currentPath, genericSha256, baselineSha256, currentSha256,
    }));
  const byId = new Map(records.map((entry) => [entry.id, entry]));
  const helperText = byId.get("return-helper").generic.toString("utf8");
  const planTemplateText = byId.get("return-plan-template").generic.toString("utf8");
  const registryTemplateText = byId.get("registry-template").generic.toString("utf8");
  const semanticProblems = [];
  for (const [id, expected] of Object.entries(RELEASE_EXPECTED)) {
    const actual = byId.get(id)?.genericSha256;
    if (actual !== expected) semanticProblems.push(`generic ${id} SHA-256 changed: expected ${expected}, got ${actual ?? "missing"}.`);
  }
  if (!helperText.includes('p3-role-handoff-registry/v2') || !helperText.includes("validateConditionLocalDeliveryProgress")) {
    semanticProblems.push("generic p3-role-return.mjs does not contain the required v2 registry/per-condition delivery validation.");
  }
  if (!planTemplateText.includes('"deliveryProgress"') || !registryTemplateText.includes('"schema": "p3-role-handoff-registry/v2"')) {
    semanticProblems.push("generic runtime templates do not contain the required v2 deliveryProgress schema.");
  }
  return { records, mismatches, semanticProblems, ready: mismatches.length === 0 && semanticProblems.length === 0 };
}

function contractGateReference(contract, label) {
  const gate = contract?.shared?.gate?.inputs?.manifest;
  assert(gate && typeof gate.path === "string" && typeof gate.sha256 === "string", `${label} lacks a final gate manifest reference.`);
  return { path: gate.path, sha256: gate.sha256 };
}
function contractWorktreeRoot(contract, condition, label) {
  const entries = contract?.shared?.cleanRoomAuthorization?.conditions;
  assert(Array.isArray(entries), `${label} lacks clean-room condition bindings.`);
  const entry = entries.find((candidate) => candidate?.condition === condition);
  assert(entry && typeof entry.worktreeRoot === "string", `${label} lacks the ${condition} worktree binding.`);
  return entry.worktreeRoot;
}
function readLedger(file) {
  const lines = file.bytes.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert(lines.length === 3 && lines[0].kind === "started"
    && lines[1].kind === "preflight-recorded" && lines[1].condition === "baseline"
    && lines[2].kind === "preflight-recorded" && lines[2].condition === "current",
  "fixed P-3 ledger must contain exactly started and the two preflight records.");
  assert(lines.every((line) => line.pairId === PAIR_ID && line.contractVersion === 13), "fixed P-3 ledger pair/version changed.");
  return lines;
}
function loadInputs() {
  const design = checkedJson(DESIGN_PATH, EXPECTED.design, "approved v4 design");
  assert(design.value.schema === "p3-role-return-authority-candidate-design/v4" && design.value.candidateOnly === true,
    "approved v4 design is not the preserved candidate-only source.");
  const baselineContract = checkedJson(rootPath(BASELINE, REL.contract), EXPECTED.baselineContract, "baseline final v13 contract");
  const currentContract = checkedJson(rootPath(CURRENT, REL.contract), EXPECTED.currentContract, "current final v13 contract");
  assert(baselineContract.value.version === 13 && baselineContract.value.condition === "baseline" && baselineContract.value.pairId === PAIR_ID,
    "baseline final comparison contract changed.");
  assert(currentContract.value.version === 13 && currentContract.value.condition === "current" && currentContract.value.pairId === PAIR_ID,
    "current final comparison contract changed.");
  const decision = checkedJson(rootPath(BASELINE, REL.decision), EXPECTED.decision, "baseline owner Decision J");
  sameBytes(decision.bytes, readRegular(rootPath(CURRENT, REL.decision), "current owner Decision J"), "A/B owner Decision J");
  assert(decision.value.version === 2 && decision.value.decisionId === "J" && decision.value.status === "approved" && decision.value.ownerApproved === true,
    "owner Decision J is not the approved v2 record.");
  assert(Array.isArray(decision.value.scope?.checkpointPlan) && JSON.stringify(decision.value.scope.checkpointPlan) === JSON.stringify(CHECKPOINTS),
    "Decision J checkpoint plan changed.");
  assert(Array.isArray(decision.value.scope?.changeTargets) && decision.value.scope.changeTargets.length === 28,
    "Decision J must freeze exactly 28 change targets.");
  const v4Protocol = checkedJson(join(V4_ROOT, "protocols", "baseline", "p3-role-handoff-protocol-v2.json"), EXPECTED.v4Protocol, "existing final v4 baseline protocol");
  sameBytes(v4Protocol.bytes, readRegular(join(V4_ROOT, "protocols", "current", "p3-role-handoff-protocol-v2.json"), "existing final v4 current protocol"), "existing v4 A/B protocol");
  const baselineAuthority = checkedJson(join(V4_ROOT, "authorities", "baseline", "p3-role-return-authority-v1.json"), EXPECTED.baselineAuthority, "existing final v4 baseline authority");
  const currentAuthority = readJson(join(V4_ROOT, "authorities", "current", "p3-role-return-authority-v1.json"), "existing final v4 current authority");
  assert(v4Protocol.value.schema === "p3-role-handoff-protocol/v2" && v4Protocol.value.recordState === "finalized"
    && v4Protocol.value.ownerApproved === true && v4Protocol.value.executionState === false && v4Protocol.value.aBByteIdentical === true,
  "existing final v4 protocol is not the inert finalized source.");
  assert(baselineAuthority.value.runtimeEligible === false && baselineAuthority.value.packetAuthority?.status === "NOT_CREATED"
    && baselineAuthority.value.deliveryAuthority?.status === "NOT_AUTHORIZED", "existing baseline v4 authority is not inert.");
  assert(currentAuthority.runtimeEligible === false && currentAuthority.packetAuthority?.status === "NOT_CREATED"
    && currentAuthority.deliveryAuthority?.status === "NOT_AUTHORIZED", "existing current v4 authority is not inert.");
  const ledger = checkedFile(`${PILOT}/.git/figma-p3-comparison-ledger.jsonl`, EXPECTED.ledger, "fixed pair ledger");
  const ledgerLines = readLedger(ledger);
  const pairLock = checkedJson(`${PILOT}/.git/figma-p3-comparison-pair-locks/55b8f4a26446c19fdfe5c43d2dae08e2b7715e31d1befee1f82257e36c0e4bac.json`, EXPECTED.pairLock, "fixed v5 pair lock");
  assert(pairLock.value.version === 5 && pairLock.value.contractVersion === 13 && pairLock.value.pairId === PAIR_ID,
    "fixed pair lock changed.");
  const baselineActive = checkedJson(`${BASELINE}/.figma-gate/active.json`, EXPECTED.baselineActive, "baseline frozen preflight active state");
  const currentActive = checkedJson(`${CURRENT}/.figma-gate/active.json`, EXPECTED.currentActive, "current frozen preflight active state");
  assert(baselineActive.value.version === 5 && baselineActive.value.phase === "preflight" && baselineActive.value.preflightId === ledgerLines[1].preflightId,
    "baseline active state no longer binds its ledger preflight.");
  assert(currentActive.value.version === 5 && currentActive.value.phase === "preflight" && currentActive.value.preflightId === ledgerLines[2].preflightId,
    "current active state no longer binds its ledger preflight.");
  const p11 = checkedJson(`${COORDINATOR}/records/p3-p11-authorization-${PAIR_ID}.json`, EXPECTED.p11, "P-11 blocked record");
  assert(p11.value.status === "BLOCKED" && (p11.value.authorization === "NOT_AUTHORIZED" || p11.value.p11Authorization === "NOT_AUTHORIZED"),
    "P-11 must remain BLOCKED/NOT_AUTHORIZED.");
  assertAbsent(join(BASELINE, "site"), "baseline site directory");
  assertAbsent(join(CURRENT, "site"), "current site directory");
  const pcReference = checkedFile(rootPath(BASELINE, REL.pcReference), EXPECTED.pcReference, "baseline PC frozen reference export");
  const spReference = checkedFile(rootPath(BASELINE, REL.spReference), EXPECTED.spReference, "baseline SP frozen reference export");
  const scopes = v4Protocol.value.implementationLoop?.componentReturnScopes;
  const delimiters = v4Protocol.value.implementationLoop?.frozenDelimiterBindings;
  assert(Array.isArray(scopes) && scopes.length === 6 && Array.isArray(delimiters) && delimiters.length === 6,
    "existing v4 protocol allocation or delimiter inventory changed.");
  exact(scopes[0], PROTOCOL_COMPONENT, "existing v4 sequence 1 allocation");
  const allCreates = scopes.flatMap((scope) => scope.attemptOneCreatePaths ?? []);
  assert(allCreates.length === 28 && new Set(allCreates.map((path) => path.toLowerCase())).size === 28,
    "existing v4 protocol does not retain the 28-target exact partition.");
  assert(scopes[2].attemptOneCreatePaths.includes("site/assets/hero/hero-laurel.png")
    && !scopes[5].allowedChangeTargets.includes("site/assets/hero/hero-laurel.png"),
  "existing v4 protocol no longer gives hero-laurel to sequence 3 only.");
  return {
    design,
    baselineContract,
    currentContract,
    decision,
    v4Protocol,
    baselineAuthority,
    currentAuthority,
    ledger,
    ledgerLines,
    pairLock,
    baselineActive,
    currentActive,
    p11,
    pcReference,
    spReference,
    scopes: clone(scopes),
    delimiters: clone(delimiters),
    baselineGateManifest: contractGateReference(baselineContract.value, "baseline contract"),
    currentGateManifest: contractGateReference(currentContract.value, "current contract"),
    baselineWorktreeRoot: contractWorktreeRoot(baselineContract.value, "baseline", "baseline contract"),
    currentWorktreeRoot: contractWorktreeRoot(currentContract.value, "current", "current contract"),
  };
}

function activationIds(inputs, release) {
  const releaseBindings = release.records.map((entry) => ({ id: entry.id, sha256: entry.genericSha256 }));
  const activationId = stableHash({
    kind: "p3-r4-runtime-activation/v2",
    pairId: PAIR_ID,
    candidateBundleId: CANDIDATE_BUNDLE_ID,
    approvedDesignSha256: inputs.design.sha256,
    v4ProtocolSha256: inputs.v4Protocol.sha256,
    baselineAuthoritySha256: inputs.baselineAuthority.sha256,
    baselineContractSha256: inputs.baselineContract.sha256,
    currentContractSha256: inputs.currentContract.sha256,
    decisionSha256: inputs.decision.sha256,
    ledgerSha256: inputs.ledger.sha256,
    helperRelease: releaseBindings,
  });
  const handoffId = sha256(Buffer.from(`p3-r4-runtime-activation-baseline-seq1\0${activationId}`, "utf8")).slice(0, 32);
  return { activationId, handoffId, outputRoot: `${ACTIVATION_PARENT}/${activationId}` };
}

function releaseReferences(release) {
  const byId = new Map(release.records.map((entry) => [entry.id, entry]));
  const asReference = (id) => {
    const item = byId.get(id);
    return { path: item.genericPath, sha256: item.genericSha256 };
  };
  return {
    helper: asReference("return-helper"),
    e2e: asReference("return-helper-e2e"),
    planTemplate: asReference("return-plan-template"),
    manifestTemplate: asReference("return-manifest-template"),
    feedbackTemplate: asReference("return-feedback-template"),
    protocolTemplate: asReference("protocol-template"),
    registryTemplate: asReference("registry-template"),
    packetHelper: asReference("packet-helper"),
    packetPlanTemplate: asReference("packet-plan-template"),
  };
}

function buildRuntimeProtocol(inputs, release, identifiers, approvedAt) {
  const protocol = clone(inputs.v4Protocol.value);
  protocol.ownerApprovedAt = approvedAt;
  protocol.approvalBasis = "Owner instruction to continue P-3 R4 lifecycle work: this append-only runtime activation authorizes coordinator packet assembly and checked return-plan preparation only; it does not perform role-home delivery, role launch, implementation, worktree mutation, measurement, lifecycle mutation, or P-11 change.";
  protocol.authorityRole = "append-only R4 runtime activation successor; coordinator-only protocol binding for baseline implementation delivery sequence 1";
  protocol.executionState = false;
  protocol.executionBoundary = clone(ROLE_BOUNDARY);
  protocol.returnPackage = {
    ...clone(protocol.returnPackage),
    validator: releaseReferences(release).helper,
    e2e: releaseReferences(release).e2e,
    planTemplate: releaseReferences(release).planTemplate,
    manifestTemplate: releaseReferences(release).manifestTemplate,
    feedbackTemplate: releaseReferences(release).feedbackTemplate,
    protocolTemplate: releaseReferences(release).protocolTemplate,
    registryTemplate: releaseReferences(release).registryTemplate,
    packetValidator: releaseReferences(release).packetHelper,
    packetPlanTemplate: releaseReferences(release).packetPlanTemplate,
    planVersion: 5,
    manifestVersion: 4,
  };
  protocol.authorityBindings = {
    ...clone(protocol.authorityBindings),
    runtimeActivation: {
      activationId: identifiers.activationId,
      activationRoot: posix(identifiers.outputRoot),
      sourceV4Protocol: ref(inputs.v4Protocol.path, inputs.v4Protocol.sha256),
      sourceBaselineV4Authority: ref(inputs.baselineAuthority.path, inputs.baselineAuthority.sha256),
      sourceCurrentV4Authority: ref(join(V4_ROOT, "authorities", "current", "p3-role-return-authority-v1.json"), sha256(readRegular(join(V4_ROOT, "authorities", "current", "p3-role-return-authority-v1.json"), "current v4 authority bytes"))),
      helperRelease: release.records.map((entry) => ({ id: entry.id, genericPath: entry.genericPath, sha256: entry.genericSha256 })),
      pairPreflights: {
        ledger: ref(inputs.ledger.path, inputs.ledger.sha256),
        baseline: { preflightId: inputs.ledgerLines[1].preflightId, activeStateSha256: inputs.baselineActive.sha256 },
        current: { preflightId: inputs.ledgerLines[2].preflightId, activeStateSha256: inputs.currentActive.sha256 },
      },
    },
  };
  protocol.runtimeActivationRequired = [
    "packet manifest and p3-role-packet check completed in this activation",
    "schema-aligned condition-local v2 registry completed in this activation",
    "concrete baseline sequence-1 return plan completed in this activation",
    "separate owner-operated role-home delivery receipt before actual delivery",
  ];
  assert(protocol.schema === "p3-role-handoff-protocol/v2" && protocol.recordState === "finalized" && protocol.ownerApproved === true
    && protocol.aBIdentical === true && protocol.aBByteIdentical === true && protocol.pairId === PAIR_ID,
  "runtime protocol lost its finalized A/B invariant.");
  exact(protocol.implementationLoop.componentReturnScopes, inputs.scopes, "runtime protocol allocation");
  return protocol;
}

function assignmentPayload({ handoffId, protocolSha256, delimiters }) {
  return {
    schema: "p3-role-component-assignment/v2",
    kind: "implementation-component-assignment",
    scopeId: SCOPE_ID,
    handoff: { opaqueHandoffId: handoffId, deliverySequence: 1, handoffProtocolSha256: protocolSha256 },
    component: {
      elementId: COMPONENT.elementId,
      sequence: COMPONENT.sequence,
      attempt: COMPONENT.attempt,
      componentDecisionCodePath: COMPONENT.componentDecisionCodePath,
    },
    changeAuthority: {
      allowedChangeTargets: clone(COMPONENT.allowedChangeTargets),
      attemptOneCreatePaths: clone(COMPONENT.attemptOneCreatePaths),
      derivedBootstrapDirectories: clone(COMPONENT.derivedBootstrapDirectories),
      laterAttemptCreationAllowed: false,
      outOfScopePathChangeAllowed: false,
    },
    bootstrapRequirement: {
      mustInitializeEveryFrozenDelimiterRegion: true,
      delimiterRegions: clone(delimiters),
    },
    referenceImages: [
      { logicalPath: "input/references/pc-first-view.png", viewport: "pc", width: 1440, height: 850 },
      { logicalPath: "input/references/sp-first-view.png", viewport: "sp", width: 375, height: 850 },
    ],
    returnRequirement: {
      returnFormat: "plain-ustar-with-root-return-manifest-json",
      returnManifestVersion: 4,
      returnOnlyDeclaredTargets: true,
      coordinatorWillValidateBeforeApply: true,
    },
  };
}

function roleVisibleReturnAuthority({ handoffId, protocolSha256, inputStagingSha256 }) {
  return {
    schema: "p3-role-visible-return-authority/v1",
    kind: "component-return-instruction",
    deliveryMode: "attachment-only",
    handoff: { opaqueHandoffId: handoffId, deliverySequence: 1, handoffProtocolSha256: protocolSha256 },
    component: {
      elementId: COMPONENT.elementId,
      componentDecisionCodePath: COMPONENT.componentDecisionCodePath,
      sequence: COMPONENT.sequence,
      attempt: COMPONENT.attempt,
      allowedChangeTargets: clone(COMPONENT.allowedChangeTargets),
      attemptOneCreatePaths: clone(COMPONENT.attemptOneCreatePaths),
      derivedBootstrapDirectories: clone(COMPONENT.derivedBootstrapDirectories),
    },
    inputStaging: { logicalRoot: "input", sha256: inputStagingSha256 },
    returnManifest: {
      version: 4,
      requiredRootEntry: "return-manifest.json",
      requiredFields: ["handoffId", "deliverySequence", "handoffProtocolSha256", "component", "inputStagingSha256", "files"],
    },
    prohibited: [
      "peer-condition-information",
      "comparison-contract",
      "owner-decision-j",
      "clean-room-evidence",
      "coordinator-host-path-instructions",
      "role-launch",
    ],
  };
}

function packetPlan({ planRoot, packetRoot, inputs }) {
  const packetRootRelative = relative(planRoot, packetRoot).replace(/\\/g, "/");
  assert(!packetRootRelative.startsWith(".."), "packet staging must be below the coordinator plan root.");
  const attachments = listFiles(packetRoot).map((entry) => ({
    logicalPath: entry.relativePath,
    path: entry.relativePath,
    sha256: entry.sha256,
    origin: entry.relativePath.startsWith("input/references/")
      ? "saved frozen Figma reference export copied by the coordinator"
      : "coordinator-authored redacted baseline sequence-1 role input",
  }));
  return {
    version: 3,
    kind: "p3-role-packet-plan",
    packetRoot: packetRootRelative,
    roleAttachments: attachments,
    identityAuthority: {
      comparisonContract: ref(inputs.baselineContract.path, inputs.baselineContract.sha256),
      ownerDecisionJ: ref(inputs.decision.path, inputs.decision.sha256),
      recipientCondition: "baseline",
    },
    forbiddenArtifacts: [
      { id: "comparison-contract", description: "baseline/current comparison contract, including self-condition copies" },
      { id: "decision-j", description: "Owner Decision J v2 record" },
      { id: "clean-room-evidence", description: "P-3 clean-room evidence, including self-condition copies" },
      { id: "template", description: "fidelity-comparison-template.json and P-3 comparison contract templates" },
    ],
  };
}

function registryPayload({ approvedAt, protocolSha256, packetManifestSha256, packetAttachments, handoffId }) {
  const attachments = packetAttachments.map((entry) => ({
    attachmentId: sha256(Buffer.from(`p3-r4-attachment\0${handoffId}\0${entry.logicalPath}`, "utf8")).slice(0, 32),
    logicalPath: entry.logicalPath,
    origin: entry.origin,
    sha256: entry.sha256,
  }));
  return {
    schema: "p3-role-handoff-registry/v2",
    recordState: "finalized",
    executionState: false,
    ownerApproved: true,
    ownerApprovedAt: approvedAt,
    approvalBasis: "Owner instruction to continue P-3 R4 lifecycle work; this condition-local registry records a checked baseline implementation packet for delivery sequence 1 only and does not itself copy to a role home, launch a role, mutate a worktree, measure, mutate lifecycle state, or change P-11.",
    aBIdentical: true,
    aBByteIdentical: true,
    deliveryMode: "attachment-only",
    deliveryProgress: clone(DELIVERY_PROGRESS),
    protocol: ref("protocol-baseline.json", protocolSha256),
    coordinatorOnly: true,
    packetValidation: {
      validator: "p3-role-packet.mjs",
      planVersion: 3,
      authoritySource: "actual-v13-comparison-contract-and-owner-approved-decision-j-v2",
      safeArchiveExpansionRequiredBeforeCheck: true,
      archiveAttachmentsAcceptedByValidator: false,
      packetManifestIsCoordinatorOnly: true,
      allAttachmentsRequirePacketManifest: true,
      allAttachmentsRequirePacketCheck: true,
      packetCheckCommand: "node p3-role-packet.mjs --check <coordinator-only-plan.json>",
      packetManifestMustExactlyEnumerateDeliveryAttachments: true,
    },
    attachmentOnlyEvidence: {
      filesystemProbes: { p7: { run: false, countable: false }, p9: { run: false, countable: false }, p10: { run: false, countable: false }, p12: { run: false, countable: false } },
      filesystemDenialMayBeClaimed: false,
      p11: {
        literalFailure: "P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE",
        recordIsCoordinatorOnly: true,
        recordIsNeverRoleAttachment: true,
        p11Authorization: "NOT_AUTHORIZED",
        status: "BLOCKED",
        p11PassRequiredForFinalization: false,
        p11HelperRequiredForFinalization: false,
      },
    },
    returnValidation: {
      validator: "p3-role-return.mjs",
      planTemplate: "p3-role-return-plan-template.json",
      manifestTemplate: "p3-role-return-manifest-template.json",
      planVersion: 5,
      manifestVersion: 4,
      returnFormat: "plain-ustar-with-root-return-manifest-json",
      pairPreflightAuthority: "frozen actual common-Git P-3 ledger, fixed v13 pair lock, and both actual v13 preflight/v5 gate-state bindings",
      applyAfter: "both-condition-pair-preflight-pass-mechanically-verified-from-the-frozen-actual-ledger",
      recoveryJournal: { version: 2, reverseCreationOrderDeletionRequired: true, deleteOnlyEmptyDirectoriesCreatedByThisTransaction: true, unknownOrNonEmptyDirectoriesFailClosed: true, v1RecoveryCompatibilityRequired: true },
      conditionIndependentAttemptOneCreateAllocationRequired: true,
      aBByteIdenticalProtocolRequired: true,
      multiFileAtomicTransactionGuaranteed: false,
    },
    recipientPackets: [{
      opaqueHandoffId: handoffId,
      roleKind: "implementation",
      coordinatorConditionBinding: "baseline",
      deliverySequence: 1,
      deliverAfter: "both-condition-pair-preflight-pass",
      deliveryMode: "attachment-only",
      allAttachmentsMustBeInPacketManifest: true,
      packetCheck: { command: "node p3-role-packet.mjs --check <coordinator-only-plan.json>", allAttachmentsCovered: true, result: "PASS" },
      attachments,
      identityLeakScan: {
        scanTargets: ["attachment bytes", "attachment names", "archive entry names", "archive entry bytes"],
        forbiddenValueSource: "final cleanRoomAuthorization coordinator-only fields",
        forbiddenFields: ["workspaceId", "worktreeRoot", "implementation.actor", "implementation.contextId", "review.actor", "review.contextId", "otherWorkspaceId", "evidencePath"],
        result: "clear",
      },
      outsideHostPathInstructionReview: { method: "manual-coordinator-review", machineValidated: false, reviewer: "coordinator", reviewedAt: approvedAt, result: "clear" },
      packetManifest: ref("packet-manifest-baseline-delivery-1.json", packetManifestSha256),
      coordinatorEvidencePath: "packet-manifest-baseline-delivery-1.json",
    }],
  };
}

function delimiterRegionsForPath(delimiters, path) {
  const delimiterKind = path.endsWith(".html") ? "html" : path.endsWith(".css") ? "css" : null;
  assert(delimiterKind !== null, `no frozen delimiter type is defined for ${path}.`);
  return delimiters.map((entry, index) => {
    assert(entry.sequence === index + 1 && entry.elementId === CHECKPOINTS[index]
      && typeof entry[delimiterKind]?.start === "string" && typeof entry[delimiterKind]?.end === "string",
    `frozen ${delimiterKind} delimiter binding ${index + 1} is invalid.`);
    return { elementId: entry.elementId, startDelimiter: entry[delimiterKind].start, endDelimiter: entry[delimiterKind].end };
  });
}

function filePolicies(delimiters) {
  assert(Array.isArray(delimiters) && delimiters.length === CHECKPOINTS.length, "frozen delimiter set is incomplete.");
  return COMPONENT.allowedChangeTargets.map((path) => {
    const regions = delimiterRegionsForPath(delimiters, path);
    const own = regions[0];
    return {
      path,
      kind: "shared-delimited-region",
      startDelimiter: own.startDelimiter,
      endDelimiter: own.endDelimiter,
      bootstrapDelimiterRegions: regions,
    };
  });
}

function returnPlan({ inputs, identifiers, protocolSha256, registrySha256, packetManifestSha256, inputStagingSha256 }) {
  return {
    version: 5,
    kind: "p3-role-return-plan",
    authority: {
      pairId: PAIR_ID,
      condition: "baseline",
      comparisonContract: { path: REL.contract, sha256: inputs.baselineContract.sha256 },
      frozenScope: { checkpointPlan: clone(CHECKPOINTS), changeTargets: clone(inputs.decision.value.scope.changeTargets) },
      pairPreflights: {
        ledger: ref(inputs.ledger.path, inputs.ledger.sha256),
        conditions: [
          {
            condition: "baseline",
            worktreeRoot: inputs.baselineWorktreeRoot,
            comparisonContract: { path: REL.contract, sha256: inputs.baselineContract.sha256 },
            gateManifest: clone(inputs.baselineGateManifest),
            preflightState: { path: ".figma-gate/active.json", sha256: inputs.baselineActive.sha256 },
            preflightId: inputs.ledgerLines[1].preflightId,
          },
          {
            condition: "current",
            worktreeRoot: inputs.currentWorktreeRoot,
            comparisonContract: { path: REL.contract, sha256: inputs.currentContract.sha256 },
            gateManifest: clone(inputs.currentGateManifest),
            preflightState: { path: ".figma-gate/active.json", sha256: inputs.currentActive.sha256 },
            preflightId: inputs.ledgerLines[2].preflightId,
          },
        ],
      },
      progress: {
        ledgerPath: posix(join(identifiers.outputRoot, "progress", "role-return-progress.jsonl")),
        checkpointProofDirectory: posix(join(identifiers.outputRoot, "progress", "checkpoint-proofs")),
      },
      handoff: {
        opaqueHandoffId: identifiers.handoffId,
        deliverySequence: 1,
        deliveryProgress: clone(DELIVERY_PROGRESS),
        protocol: {
          self: ref("protocol-baseline.json", protocolSha256),
          peer: ref("protocol-current.json", protocolSha256),
        },
        registry: ref("registry-baseline-delivery-1.json", registrySha256),
        packetManifest: ref("packet-manifest-baseline-delivery-1.json", packetManifestSha256),
      },
    },
    component: {
      elementId: COMPONENT.elementId,
      componentDecisionCodePath: COMPONENT.componentDecisionCodePath,
      attempt: COMPONENT.attempt,
      sequence: COMPONENT.sequence,
      inputStaging: { root: `packet-staging/${identifiers.handoffId}/delivery/input`, sha256: inputStagingSha256 },
      allowedChangeTargets: clone(COMPONENT.allowedChangeTargets),
      attemptOneCreatePaths: clone(COMPONENT.attemptOneCreatePaths),
      derivedBootstrapDirectories: clone(COMPONENT.derivedBootstrapDirectories),
      filePolicies: filePolicies(inputs.delimiters),
    },
  };
}

function runtimeAuthority({ inputs, release, identifiers, approvedAt, protocolSha256, registrySha256, packetPlanSha256, packetManifestSha256, returnPlanSha256, inputStagingSha256 }) {
  return {
    schema: "p3-r4-runtime-activation-authority/v2",
    recordState: "finalized",
    ownerApproved: true,
    ownerApprovedAt: approvedAt,
    approvalBasis: "Owner instruction to continue P-3 R4 lifecycle work, constrained to runtime activation records and coordinator packet preparation. This record does not effect role-home delivery, role launch, implementation, worktree mutation, browser/Figma measurement, lifecycle mutation, or P-11 change.",
    activationId: identifiers.activationId,
    pairId: PAIR_ID,
    condition: "baseline",
    recipient: { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: identifiers.handoffId },
    state: "delivery-ready-not-delivered",
    coordinatorOnly: true,
    sourceV4Authority: ref(inputs.baselineAuthority.path, inputs.baselineAuthority.sha256),
    sourceV4Protocol: ref(inputs.v4Protocol.path, inputs.v4Protocol.sha256),
    helperRelease: release.records.map((entry) => ({ id: entry.id, path: entry.genericPath, sha256: entry.genericSha256 })),
    runtimeBindings: {
      protocolBaseline: ref("protocol-baseline.json", protocolSha256),
      protocolCurrent: ref("protocol-current.json", protocolSha256),
      registry: ref("registry-baseline-delivery-1.json", registrySha256),
      packetPlan: ref("packet-plan-baseline-delivery-1.json", packetPlanSha256),
      packetManifest: ref("packet-manifest-baseline-delivery-1.json", packetManifestSha256),
      returnPlan: ref("return-plan-baseline-seq1-attempt1.json", returnPlanSha256),
      inputStaging: { path: `packet-staging/${identifiers.handoffId}/delivery/input`, sha256: inputStagingSha256 },
    },
    immutableInputs: {
      approvedDesign: ref(posix(DESIGN_PATH), inputs.design.sha256),
      decisionJ: ref(inputs.decision.path, inputs.decision.sha256),
      baselineContract: ref(inputs.baselineContract.path, inputs.baselineContract.sha256),
      currentContract: ref(inputs.currentContract.path, inputs.currentContract.sha256),
      ledger: ref(inputs.ledger.path, inputs.ledger.sha256),
      pairLock: ref(inputs.pairLock.path, inputs.pairLock.sha256),
      baselinePreflightState: ref(inputs.baselineActive.path, inputs.baselineActive.sha256),
      currentPreflightState: ref(inputs.currentActive.path, inputs.currentActive.sha256),
      p11BlockedRecord: ref(inputs.p11.path, inputs.p11.sha256),
    },
    deliveryReceiptRequiredBeforeRoleHomeCopy: true,
    actualRoleHomeCopy: false,
    actualRoleLaunch: false,
    actualImplementation: false,
    executionBoundary: clone(ROLE_BOUNDARY),
  };
}

function buildReceipt({ inputs, release, identifiers, approvedAt, files, packetManifest }) {
  const outputs = [...files.entries()].map(([relativePath, bytes]) => ({ relativePath, sha256: sha256(bytes), bytes: bytes.length }));
  return {
    schema: "p3-r4-runtime-activation-receipt/v2",
    recordState: "finalized",
    activationId: identifiers.activationId,
    pairId: PAIR_ID,
    condition: "baseline",
    recipient: { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: identifiers.handoffId },
    ownerApprovalRecordedAt: approvedAt,
    outputRoot: posix(identifiers.outputRoot),
    outputs,
    packetCheck: { result: "PASS", attachmentCount: packetManifest.attachmentCount, manifestSha256: sha256(jsonBytes(packetManifest)) },
    release: release.records.map((entry) => ({ id: entry.id, genericPath: entry.genericPath, sha256: entry.genericSha256 })),
    immutableInputs: {
      v4Protocol: ref(inputs.v4Protocol.path, inputs.v4Protocol.sha256),
      baselineV4Authority: ref(inputs.baselineAuthority.path, inputs.baselineAuthority.sha256),
      decisionJ: ref(inputs.decision.path, inputs.decision.sha256),
      baselineContract: ref(inputs.baselineContract.path, inputs.baselineContract.sha256),
      currentContract: ref(inputs.currentContract.path, inputs.currentContract.sha256),
      lifecycleLedger: ref(inputs.ledger.path, inputs.ledger.sha256),
      pairLock: ref(inputs.pairLock.path, inputs.pairLock.sha256),
      p11BlockedRecord: ref(inputs.p11.path, inputs.p11.sha256),
    },
    result: {
      packetCreatedAndChecked: true,
      registryCreated: true,
      concreteReturnPlanCreated: true,
      roleHomeCopied: false,
      roleDelivered: false,
      roleLaunched: false,
      siteCreatedOrMutated: false,
      lifecycleMutated: false,
      browserOrFigmaMeasurement: false,
      p11Changed: false,
    },
  };
}

function validateRoleVisibleNoIdentity(value) {
  const prohibitedKeys = new Set(["pairId", "condition", "workspaceId", "worktreeRoot", "actor", "contextId", "evidencePath", "otherWorkspaceId"]);
  function visit(node, path = "$") {
    if (Array.isArray(node)) return node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      assert(!prohibitedKeys.has(key), `role-visible return authority contains a prohibited identity key at ${path}.${key}.`);
      visit(child, `${path}.${key}`);
    }
  }
  visit(value);
}
function validateReturnPlan(plan, inputs, identifiers, protocolSha256, registrySha256, packetManifestSha256, inputStagingSha256) {
  assert(plan.version === 5 && plan.kind === "p3-role-return-plan", "runtime return plan version/kind is invalid.");
  assert(plan.authority?.condition === "baseline" && plan.authority?.pairId === PAIR_ID, "runtime return plan condition/pair changed.");
  exact(plan.authority.frozenScope.checkpointPlan, CHECKPOINTS, "runtime return plan checkpoint scope");
  exact(plan.authority.frozenScope.changeTargets, inputs.decision.value.scope.changeTargets, "runtime return plan change target scope");
  exact(plan.authority.handoff.deliveryProgress, DELIVERY_PROGRESS, "runtime return plan delivery progress");
  assert(plan.authority.handoff.opaqueHandoffId === identifiers.handoffId && plan.authority.handoff.deliverySequence === 1,
    "runtime return plan handoff changed.");
  exact(plan.authority.handoff.protocol.self, ref("protocol-baseline.json", protocolSha256), "runtime return plan self protocol");
  exact(plan.authority.handoff.protocol.peer, ref("protocol-current.json", protocolSha256), "runtime return plan peer protocol");
  exact(plan.authority.handoff.registry, ref("registry-baseline-delivery-1.json", registrySha256), "runtime return plan registry");
  exact(plan.authority.handoff.packetManifest, ref("packet-manifest-baseline-delivery-1.json", packetManifestSha256), "runtime return plan packet manifest");
  exact(plan.component.allowedChangeTargets, COMPONENT.allowedChangeTargets, "runtime return plan allowed targets");
  exact(plan.component.attemptOneCreatePaths, COMPONENT.attemptOneCreatePaths, "runtime return plan create targets");
  exact(plan.component.derivedBootstrapDirectories, COMPONENT.derivedBootstrapDirectories, "runtime return plan bootstrap directories");
  assert(plan.component.inputStaging.sha256 === inputStagingSha256 && plan.component.inputStaging.root === `packet-staging/${identifiers.handoffId}/delivery/input`,
    "runtime return plan input staging binding changed.");
  assert(plan.component.filePolicies.length === 2 && plan.component.filePolicies.every((entry) => entry.kind === "shared-delimited-region"),
    "runtime return plan must use two bootstrap shared-delimited-region policies.");
  for (const policy of plan.component.filePolicies) {
    exact(policy.bootstrapDelimiterRegions, delimiterRegionsForPath(inputs.delimiters, policy.path), `runtime return plan bootstrap delimiters for ${policy.path}`);
  }
}

function tarString(header, offset, length, value, label) {
  const bytes = Buffer.from(value, "utf8");
  assert(bytes.length < length, `${label} is too long for a USTAR field.`);
  bytes.copy(header, offset);
}
function tarOctal(header, offset, length, value) {
  const text = `${Number(value).toString(8).padStart(length - 1, "0")}\0`;
  Buffer.from(text, "ascii").copy(header, offset);
}
function tarChecksum(header) {
  let total = 0;
  for (const byte of header) total += byte;
  return total;
}
function ustarEntry(path, bytes) {
  const header = Buffer.alloc(512, 0);
  tarString(header, 0, 100, path, "USTAR entry path");
  tarOctal(header, 100, 8, 0o644);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, bytes.length);
  tarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  Buffer.from("ustar\0", "ascii").copy(header, 257);
  Buffer.from("00", "ascii").copy(header, 263);
  tarString(header, 265, 32, "p3", "USTAR user name");
  tarString(header, 297, 32, "p3", "USTAR group name");
  const checksum = tarChecksum(header);
  Buffer.from(`${checksum.toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148);
  const padding = Buffer.alloc((512 - (bytes.length % 512)) % 512, 0);
  return Buffer.concat([header, bytes, padding]);
}
function fixtureArchive({ root, identifiers, protocolSha256, inputStagingSha256, delimiters }) {
  const files = COMPONENT.allowedChangeTargets.map((path) => {
    const regions = delimiterRegionsForPath(delimiters, path);
    const bytes = Buffer.from(regions.map((entry) => `${entry.startDelimiter}\nfixture ${entry.elementId}\n${entry.endDelimiter}\n`).join("\n"), "utf8");
    return { path, bytes, sha256: sha256(bytes) };
  });
  const manifest = {
    version: 4,
    kind: "p3-role-return",
    handoffId: identifiers.handoffId,
    deliverySequence: 1,
    handoffProtocolSha256: protocolSha256,
    component: {
      elementId: COMPONENT.elementId,
      componentDecisionCodePath: COMPONENT.componentDecisionCodePath,
      sequence: COMPONENT.sequence,
      attempt: COMPONENT.attempt,
    },
    inputStagingSha256,
    files: files.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
  };
  const archive = Buffer.concat([
    ustarEntry("return-manifest.json", jsonBytes(manifest)),
    ...files.map((entry) => ustarEntry(entry.path, entry.bytes)),
    Buffer.alloc(1024, 0),
  ]);
  const archivePath = join(root, "fixture-return.tar");
  writeNew(archivePath, archive);
  return archivePath;
}
function validateConcreteReturnPlanReadOnly(root, bundle, identifiers, inputs) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "p3-r4-runtime-return-plan-"));
  try {
    const sourcePlan = readJson(join(root, "return-plan-baseline-seq1-attempt1.json"), "runtime return plan for fixture validation");
    sourcePlan.authority.progress = {
      ledgerPath: posix(join(fixtureRoot, "progress", "role-return-progress.jsonl")),
      checkpointProofDirectory: posix(join(fixtureRoot, "progress", "checkpoint-proofs")),
    };
    for (const relativePath of [
      "protocol-baseline.json",
      "protocol-current.json",
      "registry-baseline-delivery-1.json",
      "packet-manifest-baseline-delivery-1.json",
    ]) {
      writeNew(join(fixtureRoot, relativePath), readRegular(join(root, relativePath), `runtime fixture source ${relativePath}`));
    }
    const inputSource = join(root, "packet-staging", identifiers.handoffId, "delivery", "input");
    for (const entry of listFiles(inputSource)) {
      writeNew(join(fixtureRoot, "packet-staging", identifiers.handoffId, "delivery", "input", ...entry.relativePath.split("/")),
        readRegular(join(inputSource, ...entry.relativePath.split("/")), `runtime fixture input ${entry.relativePath}`));
    }
    mkdirSync(join(fixtureRoot, "progress", "checkpoint-proofs"), { recursive: true, mode: 0o700 });
    const planPath = join(fixtureRoot, "return-plan-baseline-seq1-attempt1.json");
    writeNew(planPath, jsonBytes(sourcePlan));
    const archivePath = fixtureArchive({
      root: fixtureRoot,
      identifiers,
      protocolSha256: bundle.protocolSha256,
      inputStagingSha256: bundle.inputStagingSha256,
      delimiters: inputs.delimiters,
    });
    const validation = validateRoleReturn(planPath, archivePath, inputs.baselineWorktreeRoot);
    assert(validation.applyReady === true && validation.handoffId === identifiers.handoffId
      && validation.component?.sequence === 1 && validation.validatedFiles?.length === 2,
    "read-only fixture did not validate the concrete baseline sequence-1 return plan.");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 0 });
  }
}

function buildBundle(inputs, release, identifiers, approvedAt, outputRoot) {
  const protocol = buildRuntimeProtocol(inputs, release, identifiers, approvedAt);
  const protocolBytes = jsonBytes(protocol);
  const protocolSha256 = sha256(protocolBytes);
  const packetRoot = join(outputRoot, "packet-staging", identifiers.handoffId, "delivery");
  const inputRoot = join(packetRoot, "input");
  const files = new Map();
  const stagedWrites = [
    [join(inputRoot, "assignment.json"), jsonBytes(assignmentPayload({ handoffId: identifiers.handoffId, protocolSha256, delimiters: inputs.delimiters }))],
    [join(inputRoot, "references", "pc-first-view.png"), inputs.pcReference.bytes],
    [join(inputRoot, "references", "sp-first-view.png"), inputs.spReference.bytes],
  ];
  for (const [path, bytes] of stagedWrites) writeNew(path, bytes);
  const inputStagingSha256 = hashInputStaging(inputRoot);
  const visibleAuthority = roleVisibleReturnAuthority({ handoffId: identifiers.handoffId, protocolSha256, inputStagingSha256 });
  validateRoleVisibleNoIdentity(visibleAuthority);
  writeNew(join(packetRoot, "return-authority.json"), jsonBytes(visibleAuthority));
  const plan = packetPlan({ planRoot: outputRoot, packetRoot, inputs });
  const packetPlanBytes = jsonBytes(plan);
  writeNew(join(outputRoot, "packet-plan-baseline-delivery-1.json"), packetPlanBytes);
  const packetManifest = checkRolePacket(join(outputRoot, "packet-plan-baseline-delivery-1.json"));
  const packetManifestBytes = jsonBytes(packetManifest);
  const packetManifestSha256 = sha256(packetManifestBytes);
  writeNew(join(outputRoot, "packet-manifest-baseline-delivery-1.json"), packetManifestBytes);
  const registry = registryPayload({
    approvedAt,
    protocolSha256,
    packetManifestSha256,
    packetAttachments: packetManifest.roleAttachments,
    handoffId: identifiers.handoffId,
  });
  const registryBytes = jsonBytes(registry);
  const registrySha256 = sha256(registryBytes);
  writeNew(join(outputRoot, "registry-baseline-delivery-1.json"), registryBytes);
  const concretePlan = returnPlan({ inputs, identifiers, protocolSha256, registrySha256, packetManifestSha256, inputStagingSha256 });
  validateReturnPlan(concretePlan, inputs, identifiers, protocolSha256, registrySha256, packetManifestSha256, inputStagingSha256);
  const returnPlanBytes = jsonBytes(concretePlan);
  const returnPlanSha256 = sha256(returnPlanBytes);
  writeNew(join(outputRoot, "return-plan-baseline-seq1-attempt1.json"), returnPlanBytes);
  const authority = runtimeAuthority({
    inputs,
    release,
    identifiers,
    approvedAt,
    protocolSha256,
    registrySha256,
    packetPlanSha256: sha256(packetPlanBytes),
    packetManifestSha256,
    returnPlanSha256,
    inputStagingSha256,
  });
  const authorityBytes = jsonBytes(authority);
  writeNew(join(outputRoot, "runtime-authority-baseline-delivery-1.json"), authorityBytes);
  writeNew(join(outputRoot, "protocol-baseline.json"), protocolBytes);
  writeNew(join(outputRoot, "protocol-current.json"), protocolBytes);
  mkdirSync(join(outputRoot, "progress", "checkpoint-proofs"), { recursive: true, mode: 0o700 });
  for (const entry of listFiles(outputRoot)) files.set(entry.relativePath, readFileSync(join(outputRoot, ...entry.relativePath.split("/"))));
  const receipt = buildReceipt({ inputs, release, identifiers, approvedAt, files, packetManifest });
  const receiptBytes = jsonBytes(receipt);
  writeNew(join(outputRoot, "activation-receipt.json"), receiptBytes);
  files.set("activation-receipt.json", receiptBytes);
  return {
    files,
    protocolSha256,
    registrySha256,
    packetPlanSha256: sha256(packetPlanBytes),
    packetManifestSha256,
    returnPlanSha256,
    inputStagingSha256,
    packetManifest,
  };
}

function validateBundle(root, bundle, identifiers, inputs) {
  inventory(root, bundle.files, "runtime activation bundle");
  for (const [relativePath, expected] of bundle.files) {
    sameBytes(readRegular(join(root, ...relativePath.split("/")), `runtime activation ${relativePath}`), expected, `runtime activation ${relativePath}`);
  }
  assert(lstatSync(join(root, "progress")).isDirectory() && lstatSync(join(root, "progress", "checkpoint-proofs")).isDirectory(),
    "runtime activation progress directories are missing.");
  const protocolBaseline = readRegular(join(root, "protocol-baseline.json"), "runtime baseline protocol");
  sameBytes(protocolBaseline, readRegular(join(root, "protocol-current.json"), "runtime current protocol"), "runtime A/B protocol");
  const manifest = checkRolePacket(join(root, "packet-plan-baseline-delivery-1.json"));
  sameBytes(jsonBytes(manifest), readRegular(join(root, "packet-manifest-baseline-delivery-1.json"), "runtime packet manifest"), "runtime packet manifest fresh check");
  const registry = readJson(join(root, "registry-baseline-delivery-1.json"), "runtime registry");
  assert(registry.schema === "p3-role-handoff-registry/v2" && registry.recordState === "finalized"
    && registry.ownerApproved === true && registry.executionState === false && registry.coordinatorOnly === true,
  "runtime registry state is invalid.");
  exact(registry.deliveryProgress, DELIVERY_PROGRESS, "runtime registry delivery progress");
  const recipient = registry.recipientPackets?.[0];
  assert(Array.isArray(registry.recipientPackets) && registry.recipientPackets.length === 1
    && recipient.opaqueHandoffId === identifiers.handoffId && recipient.deliverySequence === 1
    && recipient.coordinatorConditionBinding === "baseline" && recipient.identityLeakScan?.result === "clear",
  "runtime registry recipient binding is invalid.");
  const attachmentTriples = manifest.roleAttachments.map((entry) => ({ logicalPath: entry.logicalPath, origin: entry.origin, sha256: entry.sha256 }))
    .sort((left, right) => left.logicalPath.localeCompare(right.logicalPath, "en"));
  const registryTriples = recipient.attachments.map((entry) => ({ logicalPath: entry.logicalPath, origin: entry.origin, sha256: entry.sha256 }))
    .sort((left, right) => left.logicalPath.localeCompare(right.logicalPath, "en"));
  exact(registryTriples, attachmentTriples, "runtime registry packet attachments");
  const visible = readJson(join(root, "packet-staging", identifiers.handoffId, "delivery", "return-authority.json"), "role-visible return authority");
  validateRoleVisibleNoIdentity(visible);
  const receipt = readJson(join(root, "activation-receipt.json"), "runtime activation receipt");
  assert(receipt.result?.roleDelivered === false && receipt.result?.siteCreatedOrMutated === false && receipt.result?.lifecycleMutated === false && receipt.result?.p11Changed === false,
    "runtime activation receipt claims an unauthorized side effect.");
  validateConcreteReturnPlanReadOnly(root, bundle, identifiers, inputs);
}

function expectedOutputNames(identifiers) {
  return [
    "activation-receipt.json",
    "packet-manifest-baseline-delivery-1.json",
    "packet-plan-baseline-delivery-1.json",
    `packet-staging/${identifiers.handoffId}/delivery/input/assignment.json`,
    `packet-staging/${identifiers.handoffId}/delivery/input/references/pc-first-view.png`,
    `packet-staging/${identifiers.handoffId}/delivery/input/references/sp-first-view.png`,
    `packet-staging/${identifiers.handoffId}/delivery/return-authority.json`,
    "protocol-baseline.json",
    "protocol-current.json",
    "registry-baseline-delivery-1.json",
    "return-plan-baseline-seq1-attempt1.json",
    "runtime-authority-baseline-delivery-1.json",
  ];
}

function buildBlocked(inputs, release, identifiers) {
  return {
    status: "BLOCKED",
    reason: "R4_HELPER_RELEASE_NOT_SYNCHRONIZED",
    externalWritesPerformed: false,
    activationId: identifiers.activationId,
    opaqueHandoffId: identifiers.handoffId,
    wouldCreateRoot: posix(identifiers.outputRoot),
    expectedOutputs: expectedOutputNames(identifiers),
    helperRelease: {
      genericABByteIdentical: false,
      mismatches: release.mismatches,
      semanticProblems: release.semanticProblems,
    },
    immutableInputsVerified: {
      approvedV4Design: inputs.design.sha256,
      finalV4Protocol: inputs.v4Protocol.sha256,
      baselineFinalV4Authority: inputs.baselineAuthority.sha256,
      pairLedger: inputs.ledger.sha256,
      baselinePreflightState: inputs.baselineActive.sha256,
      currentPreflightState: inputs.currentActive.sha256,
    },
    prohibitedActions: { roleHomeCopy: false, roleDelivery: false, roleLaunch: false, siteMutation: false, lifecycleMutation: false, p11Mutation: false },
  };
}

function dryRun(inputs, release, identifiers) {
  if (!release.ready) return buildBlocked(inputs, release, identifiers);
  assertAbsent(identifiers.outputRoot, "runtime activation output root");
  const temporary = mkdtempSync(join(tmpdir(), "p3-r4-runtime-activation-"));
  try {
    const approvedAt = new Date().toISOString();
    const bundle = buildBundle(inputs, release, identifiers, approvedAt, temporary);
    validateBundle(temporary, bundle, identifiers, inputs);
    return {
      status: "validated-dry-run",
      externalWritesPerformed: false,
      activationId: identifiers.activationId,
      opaqueHandoffId: identifiers.handoffId,
      wouldCreateRoot: posix(identifiers.outputRoot),
      ownerApprovalWouldBeRecordedAt: approvedAt,
      files: [...bundle.files.entries()].map(([relativePath, bytes]) => ({ relativePath, sha256: sha256(bytes), bytes: bytes.length })),
      packetCheck: { result: "PASS", attachmentCount: bundle.packetManifest.attachmentCount },
      bindings: {
        protocolSha256: bundle.protocolSha256,
        registrySha256: bundle.registrySha256,
        packetPlanSha256: bundle.packetPlanSha256,
        packetManifestSha256: bundle.packetManifestSha256,
        returnPlanSha256: bundle.returnPlanSha256,
        inputStagingSha256: bundle.inputStagingSha256,
      },
      prohibitedActions: { roleHomeCopy: false, roleDelivery: false, roleLaunch: false, siteMutation: false, lifecycleMutation: false, p11Mutation: false },
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 0 });
  }
}

function pruneCreatedParents(parent, root) {
  let cursor = resolve(parent);
  const stop = resolve(COORDINATOR);
  while (cursor !== stop && existsSync(cursor)) {
    const info = lstatSync(cursor);
    assert(!info.isSymbolicLink() && info.isDirectory(), "created activation parent changed to a non-real directory.");
    if (readdirSync(cursor).length !== 0) break;
    rmdirSync(cursor);
    cursor = dirname(cursor);
  }
}
function removeOwnedBundle(root, bundle, label) {
  if (!existsSync(root)) return;
  inventory(root, bundle.files, label);
  rmSync(root, { recursive: true, force: false, maxRetries: 0 });
}
function removeUnpublishedStage(root) {
  if (!existsSync(root)) return;
  const normalizedRoot = resolve(root);
  const normalizedParent = resolve(ACTIVATION_PARENT);
  const route = relative(normalizedParent, normalizedRoot);
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\"), "unpublished stage is outside the activation parent.");
  function assertOnlyRegularEntries(directory) {
    const info = lstatSync(directory);
    assert(!info.isSymbolicLink() && info.isDirectory(), "unpublished stage contains an invalid directory.");
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      const childInfo = lstatSync(child);
      assert(!childInfo.isSymbolicLink(), "unpublished stage cleanup refuses a symbolic link.");
      if (childInfo.isDirectory()) assertOnlyRegularEntries(child);
      else assert(childInfo.isFile(), "unpublished stage cleanup refuses a non-regular entry.");
    }
  }
  assertOnlyRegularEntries(normalizedRoot);
  rmSync(normalizedRoot, { recursive: true, force: false, maxRetries: 0 });
}
function apply(inputs, release, identifiers) {
  if (!release.ready) fail("R4 helper release is not synchronized; --apply is refused without any write.");
  assertAbsent(identifiers.outputRoot, "runtime activation output root");
  const parentExisted = existsSync(ACTIVATION_PARENT);
  mkdirSync(ACTIVATION_PARENT, { recursive: true, mode: 0o700 });
  const stage = join(ACTIVATION_PARENT, `.${identifiers.activationId}.stage-${randomUUID()}`);
  let bundle;
  try {
    const approvedAt = new Date().toISOString();
    bundle = buildBundle(inputs, release, identifiers, approvedAt, stage);
    validateBundle(stage, bundle, identifiers, inputs);
    assertAbsent(identifiers.outputRoot, "runtime activation output root immediately before atomic publish");
    renameSync(stage, identifiers.outputRoot);
    try {
      validateBundle(identifiers.outputRoot, bundle, identifiers, inputs);
    } catch (error) {
      try {
        removeOwnedBundle(identifiers.outputRoot, bundle, "post-validation failed runtime activation bundle");
        if (!parentExisted) pruneCreatedParents(ACTIVATION_PARENT, identifiers.outputRoot);
      } catch (rollbackError) {
        error.message = `${error.message}; post-validation cleanup also failed: ${rollbackError.message}`;
      }
      throw error;
    }
    return {
      status: "finalized",
      externalWritesPerformed: true,
      activationId: identifiers.activationId,
      opaqueHandoffId: identifiers.handoffId,
      outputRoot: posix(identifiers.outputRoot),
      files: [...bundle.files.entries()].map(([relativePath, bytes]) => ({ relativePath, sha256: sha256(bytes), bytes: bytes.length })),
      packetCheck: { result: "PASS", attachmentCount: bundle.packetManifest.attachmentCount },
      prohibitedActions: { roleHomeCopy: false, roleDelivery: false, roleLaunch: false, siteMutation: false, lifecycleMutation: false, p11Mutation: false },
    };
  } catch (error) {
    try {
      if (existsSync(stage)) {
        if (bundle) removeOwnedBundle(stage, bundle, "failed runtime activation stage");
        else removeUnpublishedStage(stage);
      }
      if (!parentExisted) pruneCreatedParents(ACTIVATION_PARENT, identifiers.outputRoot);
    } catch (rollbackError) {
      error.message = `${error.message}; unpublished-stage cleanup also failed: ${rollbackError.message}`;
    }
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--apply"].includes(args[0])) {
    fail("Usage: node tools/r4-finalize-runtime-activation-baseline-seq1.mjs --dry-run | --apply");
  }
  const inputs = loadInputs();
  const release = loadRelease();
  const identifiers = activationIds(inputs, release);
  const result = args[0] === "--dry-run" ? dryRun(inputs, release, identifiers) : apply(inputs, release, identifiers);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`P3 R4 RUNTIME ACTIVATION: ${error.message}\n`);
  process.exitCode = 1;
}
