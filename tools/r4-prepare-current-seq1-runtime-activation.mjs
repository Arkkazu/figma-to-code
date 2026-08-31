#!/usr/bin/env node
// P-3 R4 current condition / sequence 1 runtime-activation preparation.
//
// This is intentionally dry-run only.  It derives and validates a separate
// current-condition packet and activation in a temporary directory.  It never
// writes a coordinator record, role home, worktree, site, lifecycle ledger, or
// P-11 record; it has no --apply mode.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkRolePacket } from "../research/p3/p3-role-packet.mjs";
import { hashInputStaging } from "../research/p3/p3-role-return.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAIR_ID = "open-service-top-hero-v1-20260809";
const CONDITION = "current";
const COMPONENT = "open-service-top-hero";
const SEQUENCE = 1;
const ATTEMPT = 1;
const RUNTIME_DELIVERY_SEQUENCE = 1;
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;
const V4_ROOT = `${COORDINATOR}/return-authority/v4/c5ec0969c8e5882d51b4d966124f87557138bf1725315fa8b42cd368e1131cad`;
const ACTIVATION_PARENT = `${COORDINATOR}/runtime-activations/v2`;
const BASELINE_PUBLISHED_ACTIVATION = `${ACTIVATION_PARENT}/bb3077e21473ce4664e353cadc8e4fda44df87da6be9bf3839f4af818ab42165`;
const ROLE_HOME_PARENT = "C:/Users/tane1/AppData/Local/p3-role-homes";
const EXTERNAL_PROGRESS_PARENT = "C:/Users/tane1/AppData/Local/p3-coordinator-records/open-service-top-hero-v1-20260809/r4-current-delivery/v1";

const REL = Object.freeze({
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  pcReference: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/exports/pc-first-view.png",
  spReference: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/exports/sp-first-view.png",
});
const EXPECTED = Object.freeze({
  approvedDesign: "8c4fb215a0a3ead792fc3742eb336d45c9517501b40fcb5e59f1d807993d2313",
  baselineContract: "ef4c911cf48951365294cea604a86896c25d7ed656872661cb23cc54dc1c7166",
  currentContract: "06d8d35c5048d48f63c920126371f29073aba9a8c3cbe168cf97bdc33efac342",
  v4Protocol: "a4c0202ee603ea63c4a5d05f35bdda0944305a20ab756358740ba692a8499919",
  baselineV4Authority: "616197ba6063f316731da4f07ebb1d2795d2674c3ebe59b26cd91b6a79d71e97",
  currentV4Authority: "c525c8100815ffbb4cd520723653f3217222563521b061fbab8afad0327f3ba4",
  decision: "e1497dee0be929a01d21d520eab743d8c7f71ca7f910deacfafabc83f3440ab5",
  preImplementationProof: "01ae83d1d346d2f56ce4527c0e1d91389bee5d3bf00f0808018e6506ef9605a2",
  evaluatorBaseline: "8ba089d6e48ad46eb5c4d7670222103c309b26e9af3ecd8097485f7f87776806",
  componentDecision: "2ecb1d110404a51a482ecd539969fa0f6bf4b1693dd855d8810790fe5686a657",
  baselineCleanRoom: "440dc6ffa4a66727446831e59e517b4c4dbf1cf970a43dff012f184538f44592",
  currentCleanRoom: "18ba3b228118c0f8b8a85f2c8b151bbbe1049638802429ac7e50cfb4ece7351f",
  currentApproval: "ace010c21ed6d392e8f67283267996143e2ff216cc52e364cd4c794564b928ba",
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  pairLock: "fd5ba36af2299b20bbd735bf072958573221c75858a6598931698094fd006b94",
  baselineGate: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentGate: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  gateManifest: "e0b6ad7c91697ac923579f62a6d716c75ea29355241b064ab88827b2f73aff86",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  pcReference: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0",
  spReference: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427",
  pairProtocol: "2cb05ebec90d7fefdf28cf51be8fb93e277e0bc7cec1a67ebcd458e1c686b342",
  cleanRoomAuthorization: "25d98caffe942686dbf6adefc1985908c51b5b73e3bb0b7feaf8ad7c56709e57",
});
// Every source below is read and byte-hashed before candidate construction and
// again after candidate validation.  The map is deliberately broader than the
// role-visible packet: coordinator-only frozen evidence must never be inferred
// from a current worktree value without an explicit byte binding.
const IMMUTABLE_SOURCE_SPEC = Object.freeze({
  approvedDesign: { path: "C:/AI/figma-to-code/tools/r4-return-authority-v4-design.json", sha256: EXPECTED.approvedDesign },
  baselineV4Protocol: { path: `${V4_ROOT}/protocols/baseline/p3-role-handoff-protocol-v2.json`, sha256: EXPECTED.v4Protocol },
  currentV4Protocol: { path: `${V4_ROOT}/protocols/current/p3-role-handoff-protocol-v2.json`, sha256: EXPECTED.v4Protocol },
  publishedPairProtocolBaseline: { path: `${BASELINE_PUBLISHED_ACTIVATION}/protocol-baseline.json`, sha256: EXPECTED.pairProtocol },
  publishedPairProtocolCurrent: { path: `${BASELINE_PUBLISHED_ACTIVATION}/protocol-current.json`, sha256: EXPECTED.pairProtocol },
  baselineV4Authority: { path: `${V4_ROOT}/authorities/baseline/p3-role-return-authority-v1.json`, sha256: EXPECTED.baselineV4Authority },
  currentV4Authority: { path: `${V4_ROOT}/authorities/current/p3-role-return-authority-v1.json`, sha256: EXPECTED.currentV4Authority },
  baselineContract: { path: `${BASELINE}/${REL.contract}`, sha256: EXPECTED.baselineContract },
  currentContract: { path: `${CURRENT}/${REL.contract}`, sha256: EXPECTED.currentContract },
  baselineDecisionJ: { path: `${BASELINE}/${REL.decision}`, sha256: EXPECTED.decision },
  currentDecisionJ: { path: `${CURRENT}/${REL.decision}`, sha256: EXPECTED.decision },
  baselinePreImplementationProof: { path: `${BASELINE}/MyBrain/verify/p3-pre-implementation-proof-open-service-top-hero-v1.json`, sha256: EXPECTED.preImplementationProof },
  currentPreImplementationProof: { path: `${CURRENT}/MyBrain/verify/p3-pre-implementation-proof-open-service-top-hero-v1.json`, sha256: EXPECTED.preImplementationProof },
  baselineEvaluatorBaseline: { path: `${BASELINE}/MyBrain/verify/p3-evaluator-baseline-open-service-top-hero-v1.json`, sha256: EXPECTED.evaluatorBaseline },
  currentEvaluatorBaseline: { path: `${CURRENT}/MyBrain/verify/p3-evaluator-baseline-open-service-top-hero-v1.json`, sha256: EXPECTED.evaluatorBaseline },
  baselineComponentDecision: { path: `${BASELINE}/MyBrain/verify/component-decisions-open-service-top-hero-v1.json`, sha256: EXPECTED.componentDecision },
  currentComponentDecision: { path: `${CURRENT}/MyBrain/verify/component-decisions-open-service-top-hero-v1.json`, sha256: EXPECTED.componentDecision },
  baselineCleanRoom: { path: `${BASELINE}/MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-baseline.json`, sha256: EXPECTED.baselineCleanRoom },
  currentCleanRoom: { path: `${CURRENT}/MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-current.json`, sha256: EXPECTED.currentCleanRoom },
  currentBOnlyApproval: { path: `${CURRENT}/MyBrain/verify/p3-current-change-approval-open-service-top-hero-v1.json`, sha256: EXPECTED.currentApproval },
  pairLedger: { path: `${PILOT}/.git/figma-p3-comparison-ledger.jsonl`, sha256: EXPECTED.ledger },
  pairLock: { path: `${PILOT}/.git/figma-p3-comparison-pair-locks/55b8f4a26446c19fdfe5c43d2dae08e2b7715e31d1befee1f82257e36c0e4bac.json`, sha256: EXPECTED.pairLock },
  baselinePreflight: { path: `${BASELINE}/.figma-gate/active.json`, sha256: EXPECTED.baselineGate },
  currentPreflight: { path: `${CURRENT}/.figma-gate/active.json`, sha256: EXPECTED.currentGate },
  baselineGateManifest: { path: `${BASELINE}/MyBrain/verify/gate-open-service-top-hero-v1.json`, sha256: EXPECTED.gateManifest },
  currentGateManifest: { path: `${CURRENT}/MyBrain/verify/gate-open-service-top-hero-v1.json`, sha256: EXPECTED.gateManifest },
  p11BlockedRecord: { path: `${COORDINATOR}/records/p3-p11-authorization-${PAIR_ID}.json`, sha256: EXPECTED.p11 },
  currentPcReference: { path: `${CURRENT}/${REL.pcReference}`, sha256: EXPECTED.pcReference },
  currentSpReference: { path: `${CURRENT}/${REL.spReference}`, sha256: EXPECTED.spReference },
});
const RELEASE = Object.freeze([
  ["return-helper", "p3-role-return.mjs", "d9723895c308b3f87f27f7f8cd1e06409a4104ac4b2b5ba1e910d7630b36d2cc"],
  ["return-helper-e2e", "p3-role-return.e2e.mjs", "216cfdafb7221e2e5539c3581ebf82aeb7bc25ec3f7a2e1cec8d3fafaec8b74a"],
  ["return-plan-template", "p3-role-return-plan-template.json", "7212cd022b4b5fb5634d14c63d382ad275ee3723a849b60fa6d53576ae77f730"],
  ["return-manifest-template", "p3-role-return-manifest-template.json", "6fb1e5175cb7db9a713adb4a8a5e68acf13b45d88c05885397e71ce52b118361"],
  ["return-feedback-template", "p3-role-return-feedback-template.json", "f63ec9b9b6ebee92b4d17d70fb66d6b976c7c461b3f05c4f5b9d5be824e0f4c9"],
  ["protocol-template", "p3-role-handoff-protocol-template.json", "12a6cb01c87b2c0239c78feb2216faf632baf66cee30ba6647e18f646aa96e5b"],
  ["registry-template", "p3-role-handoff-registry-template.json", "d8bb833bb593a9045bcff4ab0dd2949c5a32ac5d151f5f90646a07b35f377918"],
  ["packet-helper", "p3-role-packet.mjs", "69fc169f186dfd1c8dff69616eac8977900e5de77b8c5734468a96bf4a99af07"],
  ["packet-plan-template", "p3-role-packet-plan-template.json", "8ca2441d02fd0583e4d596f2ef78123874af6d60efb180be427fb3ed1632dbea"],
]);
const CHECKPOINTS = Object.freeze(["open-service-top-hero", "open-service-header", "open-service-hero-visual", "open-service-hero-copy", "open-service-hero-actions", "open-service-hero-stats"]);
const COMPONENT_SCOPE = Object.freeze({
  elementId: COMPONENT,
  sequence: SEQUENCE,
  attempt: ATTEMPT,
  componentDecisionCodePath: "site/index.html",
  allowedChangeTargets: ["site/index.html", "site/styles.css"],
  attemptOneCreatePaths: ["site/index.html", "site/styles.css"],
  derivedBootstrapDirectories: ["site"],
});
const DELIVERY_PROGRESS = Object.freeze({ version: 1, scope: "per-condition", initialDeliverySequence: 1, increment: 1 });

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
function stableHash(value) { return sha256(Buffer.from(JSON.stringify(canonical(value)), "utf8")); }
function exact(left, right, label) { assert(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)), `${label} is not exact.`); }
function posix(path) { return resolve(path).replace(/\\/g, "/"); }
function isWithin(parent, child) { const route = relative(resolve(parent), resolve(child)); return route === "" || (!route.startsWith("..") && !isAbsolute(route)); }
function assertRegular(path, label) { assert(existsSync(path), `${label} is missing: ${posix(path)}`); const info = lstatSync(path); assert(!info.isSymbolicLink() && info.isFile(), `${label} must be a regular file.`); return info; }
function assertDirectory(path, label) { assert(existsSync(path), `${label} is missing: ${posix(path)}`); const info = lstatSync(path); assert(!info.isSymbolicLink() && info.isDirectory(), `${label} must be a real directory.`); return info; }
function assertAbsent(path, label) { assert(!existsSync(path), `${label} must be absent: ${posix(path)}`); }
function readRegular(path, label) { assertRegular(path, label); return readFileSync(path); }
function readJson(path, label) { try { return JSON.parse(readRegular(path, label).toString("utf8")); } catch (error) { fail(`${label} is invalid JSON: ${error.message}`); } }
function checkedFile(path, expected, label) { const bytes = readRegular(path, label); const digest = sha256(bytes); assert(digest === expected, `${label} SHA-256 changed: expected ${expected}, got ${digest}.`); return { path: posix(path), sha256: digest, bytes }; }
function immutableReferences(entries) {
  return Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, { path: entry.path, sha256: entry.sha256 }]));
}
function readImmutableInputs() {
  return Object.fromEntries(Object.entries(IMMUTABLE_SOURCE_SPEC).map(([id, spec]) => [id, checkedFile(spec.path, spec.sha256, `immutable source ${id}`)]));
}
function revalidateImmutableInputs(expectedReferences) {
  const reread = readImmutableInputs();
  const actualReferences = immutableReferences(reread);
  exact(actualReferences, expectedReferences, "immutable source post-validation");
  return actualReferences;
}
function safeChild(root, logicalPath, label) { const target = resolve(root, ...logicalPath.split("/")); assert(isWithin(root, target) && target !== resolve(root), `${label} escapes its root.`); return target; }
function writeNew(path, bytes) { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); }
function listFiles(root) {
  const output = [];
  function visit(directory, prefix = "") {
    assertDirectory(directory, "bundle directory");
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const full = join(directory, entry.name); const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name; const info = lstatSync(full);
      assert(!info.isSymbolicLink(), `bundle symbolic link: ${logicalPath}`);
      if (info.isDirectory()) visit(full, logicalPath); else { assert(info.isFile(), `bundle non-regular entry: ${logicalPath}`); output.push({ logicalPath, sha256: sha256(readFileSync(full)), bytes: info.size }); }
    }
  }
  visit(root); return output;
}

function assertPreflight(root, expectedHash, condition) {
  const activePath = `${root}/.figma-gate/active.json`;
  const active = readJson(activePath, `${condition} active state`);
  checkedFile(activePath, expectedHash, `${condition} active state`);
  assert(active.phase === "preflight" && Array.isArray(active.benchmark?.attempts) && active.benchmark.attempts.length === 0, `${condition} preflight is consumed.`);
  assertAbsent(`${root}/site`, `${condition} site directory`);
  assertAbsent(`${root}/.p3-role-return-recovery`, `${condition} recovery directory`);
  return active;
}
function loadInputs() {
  const immutableInputs = readImmutableInputs();
  const immutableInputReferences = immutableReferences(immutableInputs);
  const baselineContract = immutableInputs.baselineContract;
  const currentContract = immutableInputs.currentContract;
  const baselineContractValue = JSON.parse(baselineContract.bytes.toString("utf8"));
  const contract = JSON.parse(currentContract.bytes.toString("utf8"));
  assert(baselineContractValue.version === 13 && baselineContractValue.condition === "baseline" && baselineContractValue.pairId === PAIR_ID, "baseline v13 contract identity changed.");
  assert(contract.version === 13 && contract.condition === CONDITION && contract.pairId === PAIR_ID, "current v13 contract identity changed.");
  exact(baselineContractValue.shared?.cleanRoomAuthorization, contract.shared?.cleanRoomAuthorization, "baseline/current clean-room authorization");
  assert(stableHash(contract.shared?.cleanRoomAuthorization) === EXPECTED.cleanRoomAuthorization, "current clean-room authorization stable hash changed.");
  assert(stableHash(baselineContractValue.shared?.cleanRoomAuthorization) === EXPECTED.cleanRoomAuthorization, "baseline clean-room authorization stable hash changed.");
  const v4Protocol = immutableInputs.currentV4Protocol;
  assert(immutableInputs.baselineV4Protocol.bytes.equals(v4Protocol.bytes), "frozen baseline/current v4 protocols differ.");
  const pairProtocol = immutableInputs.publishedPairProtocolBaseline;
  assert(immutableInputs.publishedPairProtocolCurrent.bytes.equals(pairProtocol.bytes), "published baseline activation protocols are not byte-identical.");
  const v4Authority = immutableInputs.currentV4Authority;
  const authority = JSON.parse(v4Authority.bytes.toString("utf8"));
  assert(authority.runtimeEligible === false && authority.packetAuthority?.status === "NOT_CREATED" && authority.deliveryAuthority?.status === "NOT_AUTHORIZED", "frozen current v4 authority changed from inert.");
  const baselineAuthority = JSON.parse(immutableInputs.baselineV4Authority.bytes.toString("utf8"));
  assert(baselineAuthority.runtimeEligible === false && baselineAuthority.packetAuthority?.status === "NOT_CREATED" && baselineAuthority.deliveryAuthority?.status === "NOT_AUTHORIZED", "frozen baseline v4 authority changed from inert.");
  const decision = immutableInputs.currentDecisionJ;
  assert(immutableInputs.baselineDecisionJ.bytes.equals(decision.bytes), "baseline/current Decision J bytes differ.");
  const decisionValue = JSON.parse(decision.bytes.toString("utf8"));
  exact(decisionValue.cleanRoomAuthorization, contract.shared?.cleanRoomAuthorization, "Decision J current clean-room authorization");
  assert(decisionValue.cleanRoomAuthorizationStableJsonSha256 === EXPECTED.cleanRoomAuthorization, "Decision J clean-room authorization hash changed.");
  const clean = immutableInputs.currentCleanRoom;
  const approval = immutableInputs.currentBOnlyApproval;
  const approvalValue = JSON.parse(approval.bytes.toString("utf8"));
  assert(approvalValue.ownerApproved === true, "current B-only approval is no longer owner-approved.");
  for (const key of ["baselinePreImplementationProof", "currentPreImplementationProof", "baselineEvaluatorBaseline", "currentEvaluatorBaseline", "baselineComponentDecision", "currentComponentDecision", "baselineCleanRoom", "currentCleanRoom", "pairLock"]) {
    JSON.parse(immutableInputs[key].bytes.toString("utf8"));
  }
  const ledger = immutableInputs.pairLedger;
  const records = ledger.bytes.toString("utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert(records.length === 3 && records[0].kind === "started" && records[1].kind === "preflight-recorded" && records[2].kind === "preflight-recorded" && records[1].condition === "baseline" && records[2].condition === "current", "pair lifecycle is not preflight-only.");
  const baselineActive = assertPreflight(BASELINE, EXPECTED.baselineGate, "baseline");
  const currentActive = assertPreflight(CURRENT, EXPECTED.currentGate, "current");
  const p11 = immutableInputs.p11BlockedRecord;
  const p11Value = JSON.parse(p11.bytes.toString("utf8"));
  assert(p11Value.status === "BLOCKED" && p11Value.authorization === "NOT_AUTHORIZED", "P-11 changed from BLOCKED / NOT_AUTHORIZED.");
  const pcReference = immutableInputs.currentPcReference;
  const spReference = immutableInputs.currentSpReference;
  const protocol = JSON.parse(v4Protocol.bytes.toString("utf8"));
  const scopes = protocol.implementationLoop?.componentReturnScopes;
  const delimiters = protocol.implementationLoop?.frozenDelimiterBindings;
  assert(Array.isArray(scopes) && scopes.length === 6 && Array.isArray(delimiters) && delimiters.length === 6, "current v4 protocol lacks component scopes/delimiters.");
  exact(scopes[0], { elementId: COMPONENT, sequence: SEQUENCE, componentDecisionCodePath: "site/index.html", allowedChangeTargets: COMPONENT_SCOPE.allowedChangeTargets, attemptOneCreatePaths: COMPONENT_SCOPE.attemptOneCreatePaths, derivedBootstrapDirectories: COMPONENT_SCOPE.derivedBootstrapDirectories }, "sequence-1 scope");
  const partition = scopes.flatMap((scope) => scope.attemptOneCreatePaths ?? []);
  assert(partition.length === 28 && new Set(partition.map((path) => path.toLowerCase())).size === 28, "frozen 28-target partition changed.");
  assert(Array.isArray(authority.frozenScope?.changeTargets), "current v4 authority lacks frozen change targets.");
  return { immutableInputs, immutableInputReferences, baselineContract, baselineContractValue, currentContract, contract, v4Protocol, protocol, pairProtocol, v4Authority, authority, decision, clean, approval, ledger, records, baselineActive, currentActive, p11, pcReference, spReference, scopes, delimiters, frozenChangeTargets: clone(authority.frozenScope.changeTargets) };
}
function loadRelease() {
  return RELEASE.map(([id, file, expected]) => {
    const genericPath = join(HERE, "..", "templates", "verify", file);
    const currentPath = `${CURRENT}/MyBrain/verify/${file}`;
    const generic = checkedFile(genericPath, expected, `generic ${id}`);
    const current = checkedFile(currentPath, expected, `current ${id}`);
    assert(generic.bytes.equals(current.bytes), `current ${id} differs from the audited generic helper bytes.`);
    return { id, file, sha256: expected, bytes: generic.bytes };
  });
}
function identifiers(inputs, release) {
  const seed = { schema: "p3-r4-current-seq1-runtime-preparation/v1", pairId: PAIR_ID, condition: CONDITION, component: COMPONENT, sequence: SEQUENCE, attempt: ATTEMPT, runtimeDeliverySequence: RUNTIME_DELIVERY_SEQUENCE, immutableInputs: inputs.immutableInputReferences, helperRelease: release.map(({ id, sha256: digest }) => ({ id, sha256: digest })) };
  const seedHash = stableHash(seed);
  const handoffId = sha256(Buffer.from(`p3-r4-current-seq1-handoff\0${seedHash}`, "utf8")).slice(0, 32);
  const activationId = sha256(Buffer.from(`p3-r4-current-seq1-activation\0${seedHash}\0${handoffId}`, "utf8"));
  return { seedHash, handoffId, activationId, outputRoot: `${ACTIVATION_PARENT}/${activationId}`, roleHome: `${ROLE_HOME_PARENT}/b-impl-r4-seq1-${handoffId}`, progressRoot: `${EXTERNAL_PROGRESS_PARENT}/${activationId}/progress` };
}
function delimiterRegions(delimiters, path) {
  const kind = path.endsWith(".html") ? "html" : "css";
  return delimiters.map((entry, index) => { assert(entry.sequence === index + 1 && entry.elementId === CHECKPOINTS[index] && typeof entry[kind]?.start === "string" && typeof entry[kind]?.end === "string", `invalid ${kind} delimiter ${index + 1}.`); return { elementId: entry.elementId, startDelimiter: entry[kind].start, endDelimiter: entry[kind].end }; });
}
function assignment(handoffId, protocolSha256, delimiters) {
  return { schema: "p3-role-component-assignment/v2", kind: "implementation-component-assignment", scopeId: "open-service-top-hero-v1", handoff: { opaqueHandoffId: handoffId, deliverySequence: 1, handoffProtocolSha256: protocolSha256 }, component: { elementId: COMPONENT, sequence: 1, attempt: 1, componentDecisionCodePath: "site/index.html" }, changeAuthority: { allowedChangeTargets: COMPONENT_SCOPE.allowedChangeTargets, attemptOneCreatePaths: COMPONENT_SCOPE.attemptOneCreatePaths, derivedBootstrapDirectories: COMPONENT_SCOPE.derivedBootstrapDirectories, laterAttemptCreationAllowed: false, outOfScopePathChangeAllowed: false }, bootstrapRequirement: { mustInitializeEveryFrozenDelimiterRegion: true, delimiterRegions: clone(delimiters) }, referenceImages: [{ logicalPath: "input/references/pc-first-view.png", viewport: "pc", width: 1440, height: 850 }, { logicalPath: "input/references/sp-first-view.png", viewport: "sp", width: 375, height: 850 }], returnRequirement: { returnFormat: "plain-ustar-with-root-return-manifest-json", returnManifestVersion: 4, returnOnlyDeclaredTargets: true, coordinatorWillValidateBeforeApply: true } };
}
function visibleAuthority(handoffId, protocolSha256, inputStagingSha256) {
  return { schema: "p3-role-visible-return-authority/v1", kind: "component-return-instruction", deliveryMode: "attachment-only", handoff: { opaqueHandoffId: handoffId, deliverySequence: 1, handoffProtocolSha256: protocolSha256 }, component: { elementId: COMPONENT, componentDecisionCodePath: "site/index.html", sequence: 1, attempt: 1, allowedChangeTargets: COMPONENT_SCOPE.allowedChangeTargets, attemptOneCreatePaths: COMPONENT_SCOPE.attemptOneCreatePaths, derivedBootstrapDirectories: COMPONENT_SCOPE.derivedBootstrapDirectories }, inputStaging: { logicalRoot: "input", sha256: inputStagingSha256 }, returnManifest: { version: 4, requiredRootEntry: "return-manifest.json", requiredFields: ["handoffId", "deliverySequence", "handoffProtocolSha256", "component", "inputStagingSha256", "files"] }, prohibited: ["peer-condition-information", "comparison-contract", "owner-decision-j", "clean-room-evidence", "coordinator-host-path-instructions", "role-launch"] };
}
function validateVisible(value) {
  const forbidden = new Set(["pairId", "condition", "workspaceId", "worktreeRoot", "actor", "contextId", "evidencePath", "otherWorkspaceId"]);
  function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== "object") return; for (const [key, child] of Object.entries(node)) { assert(!forbidden.has(key), `role-visible authority contains forbidden key ${key}.`); visit(child); } }
  visit(value);
}
function buildBundle(root, inputs, release, ids) {
  // Protocol is a pair-common frozen artifact.  Current-specific identity is
  // deliberately held only in the registry/runtime-authority/receipt below.
  const protocolBytes = inputs.pairProtocol.bytes; const protocolSha256 = sha256(protocolBytes);
  const packetRoot = join(root, "packet-staging", ids.handoffId, "delivery"); const inputRoot = join(packetRoot, "input");
  writeNew(join(inputRoot, "assignment.json"), jsonBytes(assignment(ids.handoffId, protocolSha256, inputs.delimiters)));
  writeNew(join(inputRoot, "references", "pc-first-view.png"), inputs.pcReference.bytes);
  writeNew(join(inputRoot, "references", "sp-first-view.png"), inputs.spReference.bytes);
  const inputStagingSha256 = hashInputStaging(inputRoot);
  const authority = visibleAuthority(ids.handoffId, protocolSha256, inputStagingSha256); validateVisible(authority);
  writeNew(join(packetRoot, "return-authority.json"), jsonBytes(authority));
  const plan = { version: 3, kind: "p3-role-packet-plan", packetRoot: `packet-staging/${ids.handoffId}/delivery`, roleAttachments: listFiles(packetRoot).map((entry) => ({ logicalPath: entry.logicalPath, path: entry.logicalPath, sha256: entry.sha256, origin: entry.logicalPath.startsWith("input/references/") ? "current-condition frozen Figma reference export" : "current-condition coordinator-authored redacted role input" })), identityAuthority: { comparisonContract: { path: inputs.currentContract.path, sha256: inputs.currentContract.sha256 }, ownerDecisionJ: { path: inputs.decision.path, sha256: inputs.decision.sha256 }, recipientCondition: CONDITION }, forbiddenArtifacts: [{ id: "comparison-contract", description: "condition contract" }, { id: "decision-j", description: "Owner Decision J" }, { id: "clean-room-evidence", description: "clean-room evidence" }, { id: "template", description: "comparison-contract templates" }] };
  writeNew(join(root, "packet-plan-current-delivery-1.json"), jsonBytes(plan));
  const packetManifest = checkRolePacket(join(root, "packet-plan-current-delivery-1.json"));
  writeNew(join(root, "packet-manifest-current-delivery-1.json"), jsonBytes(packetManifest));
  const packetManifestSha256 = sha256(jsonBytes(packetManifest));
  const registry = { schema: "p3-role-handoff-registry/v2", recordState: "draft-not-published", executionState: false, ownerApproved: false, deliveryMode: "attachment-only", deliveryProgress: DELIVERY_PROGRESS, protocol: { path: "protocol-current.json", sha256: protocolSha256 }, coordinatorOnly: true, packetValidation: { validator: "helper-release/p3-role-packet.mjs", allAttachmentsRequirePacketManifest: true, packetManifestIsCoordinatorOnly: true, result: "PASS-in-dry-run" }, recipientPackets: [{ opaqueHandoffId: ids.handoffId, roleKind: "implementation", coordinatorConditionBinding: CONDITION, deliverySequence: 1, deliveryMode: "attachment-only", allAttachmentsMustBeInPacketManifest: true, attachments: packetManifest.roleAttachments.map((entry) => ({ attachmentId: sha256(Buffer.from(`p3-r4-current-attachment\0${ids.handoffId}\0${entry.logicalPath}`, "utf8")).slice(0, 32), logicalPath: entry.logicalPath, origin: entry.origin, sha256: entry.sha256 })), packetManifest: { path: "packet-manifest-current-delivery-1.json", sha256: packetManifestSha256 } }] };
  const registryBytes = jsonBytes(registry); const registrySha256 = sha256(registryBytes); writeNew(join(root, "registry-current-delivery-1.json"), registryBytes);
  const returnPlan = { version: 5, kind: "p3-role-return-plan", authority: { pairId: PAIR_ID, condition: CONDITION, comparisonContract: { path: REL.contract, sha256: inputs.currentContract.sha256 }, frozenScope: { checkpointPlan: CHECKPOINTS, changeTargets: clone(inputs.frozenChangeTargets) }, pairPreflights: { ledger: { path: inputs.ledger.path, sha256: inputs.ledger.sha256 }, conditions: [{ condition: "baseline", worktreeRoot: BASELINE.toLowerCase(), comparisonContract: { path: REL.contract, sha256: inputs.baselineContract.sha256 }, gateManifest: { path: "MyBrain/verify/gate-open-service-top-hero-v1.json", sha256: inputs.immutableInputs.baselineGateManifest.sha256 }, preflightState: { path: ".figma-gate/active.json", sha256: inputs.immutableInputs.baselinePreflight.sha256 }, preflightId: inputs.records[1].preflightId }, { condition: "current", worktreeRoot: CURRENT.toLowerCase(), comparisonContract: { path: REL.contract, sha256: inputs.currentContract.sha256 }, gateManifest: { path: "MyBrain/verify/gate-open-service-top-hero-v1.json", sha256: inputs.immutableInputs.currentGateManifest.sha256 }, preflightState: { path: ".figma-gate/active.json", sha256: inputs.immutableInputs.currentPreflight.sha256 }, preflightId: inputs.records[2].preflightId }] }, progress: { ledgerPath: `${ids.progressRoot}/role-return-progress.jsonl`, checkpointProofDirectory: `${ids.progressRoot}/checkpoint-proofs` }, handoff: { opaqueHandoffId: ids.handoffId, deliverySequence: 1, deliveryProgress: DELIVERY_PROGRESS, protocol: { self: { path: "protocol-current.json", sha256: protocolSha256 }, peer: { path: "protocol-baseline.json", sha256: protocolSha256 } }, registry: { path: "registry-current-delivery-1.json", sha256: registrySha256 }, packetManifest: { path: "packet-manifest-current-delivery-1.json", sha256: packetManifestSha256 } } }, component: { elementId: COMPONENT, componentDecisionCodePath: "site/index.html", attempt: 1, sequence: 1, inputStaging: { root: `packet-staging/${ids.handoffId}/delivery/input`, sha256: inputStagingSha256 }, allowedChangeTargets: COMPONENT_SCOPE.allowedChangeTargets, attemptOneCreatePaths: COMPONENT_SCOPE.attemptOneCreatePaths, derivedBootstrapDirectories: COMPONENT_SCOPE.derivedBootstrapDirectories, filePolicies: COMPONENT_SCOPE.allowedChangeTargets.map((path) => { const regions = delimiterRegions(inputs.delimiters, path); return { path, kind: "shared-delimited-region", startDelimiter: regions[0].startDelimiter, endDelimiter: regions[0].endDelimiter, bootstrapDelimiterRegions: regions }; }) } };
  const returnPlanBytes = jsonBytes(returnPlan); const returnPlanSha256 = sha256(returnPlanBytes); writeNew(join(root, "return-plan-current-seq1-attempt1.json"), returnPlanBytes);
  const runtimeAuthority = { schema: "p3-r4-runtime-activation-authority/v2", recordState: "draft-not-published", ownerApproved: false, activationId: ids.activationId, pairId: PAIR_ID, condition: CONDITION, recipient: { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: ids.handoffId }, state: "delivery-prepared-not-published", coordinatorOnly: true, sourceV4Authority: { path: inputs.v4Authority.path, sha256: inputs.v4Authority.sha256 }, sourceV4Protocol: { path: inputs.v4Protocol.path, sha256: inputs.v4Protocol.sha256 }, helperRelease: release.map(({ id, file, sha256: digest }) => ({ id, path: `helper-release/${file}`, sha256: digest })), runtimeBindings: { protocolCurrent: { path: "protocol-current.json", sha256: protocolSha256 }, protocolBaseline: { path: "protocol-baseline.json", sha256: protocolSha256 }, registry: { path: "registry-current-delivery-1.json", sha256: registrySha256 }, packetPlan: { path: "packet-plan-current-delivery-1.json", sha256: sha256(jsonBytes(plan)) }, packetManifest: { path: "packet-manifest-current-delivery-1.json", sha256: packetManifestSha256 }, returnPlan: { path: "return-plan-current-seq1-attempt1.json", sha256: returnPlanSha256 }, inputStaging: { path: `packet-staging/${ids.handoffId}/delivery/input`, sha256: inputStagingSha256 } }, immutableInputs: { currentContract: { path: inputs.currentContract.path, sha256: inputs.currentContract.sha256 }, currentV4Authority: { path: inputs.v4Authority.path, sha256: inputs.v4Authority.sha256 }, currentCleanRoom: { path: inputs.clean.path, sha256: inputs.clean.sha256 }, currentApproval: { path: inputs.approval.path, sha256: inputs.approval.sha256 }, ledger: { path: inputs.ledger.path, sha256: inputs.ledger.sha256 }, baselinePreflight: { path: `${BASELINE}/.figma-gate/active.json`, sha256: EXPECTED.baselineGate }, currentPreflight: { path: `${CURRENT}/.figma-gate/active.json`, sha256: EXPECTED.currentGate }, p11: { path: inputs.p11.path, sha256: inputs.p11.sha256 } }, deliveryReceiptRequiredBeforeRoleHomeCopy: true, actualRoleHomeCopy: false, actualRoleLaunch: false, actualImplementation: false, executionBoundary: { pairReadiness: false, pairBegin: false, pairPreflight: false, rolePacket: false, roleDelivery: false, roleLaunch: false, implementation: false, browserMeasurement: false, figmaMeasurement: false, p11: false } };
  const runtimeAuthorityBytes = jsonBytes(runtimeAuthority); writeNew(join(root, "runtime-authority-current-delivery-1.json"), runtimeAuthorityBytes);
  writeNew(join(root, "protocol-current.json"), protocolBytes); writeNew(join(root, "protocol-baseline.json"), protocolBytes);
  for (const { file, bytes } of release) writeNew(join(root, "helper-release", file), bytes);
  const outputFiles = listFiles(root);
  const receipt = { schema: "p3-r4-current-runtime-preparation-receipt/v1", recordState: "dry-run-only", activationId: ids.activationId, pairId: PAIR_ID, condition: CONDITION, recipient: { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: ids.handoffId }, outputRoot: ids.outputRoot, freshRoleHome: { path: ids.roleHome, state: "must-remain-absent" }, externalProgress: { root: ids.progressRoot, state: "must-remain-absent-until-publication" }, outputs: outputFiles, result: { roleHomeCreated: false, roleDelivered: false, roleLaunched: false, implementation: false, returnApplied: false, siteCreatedOrMutated: false, lifecycleMutated: false, browserOrFigmaMeasurement: false, p11Changed: false } };
  writeNew(join(root, "activation-preparation-receipt.json"), jsonBytes(receipt));
  return { protocolSha256, inputStagingSha256, packetManifestSha256, registrySha256, returnPlanSha256, packetManifest, files: listFiles(root) };
}
function validateBundle(root, bundle, ids) {
  const files = listFiles(root); assert(files.length === 21, `current dry-run bundle must contain 21 regular files, got ${files.length}.`);
  const expectedPaths = new Set(["activation-preparation-receipt.json", "protocol-current.json", "protocol-baseline.json", "registry-current-delivery-1.json", "return-plan-current-seq1-attempt1.json", "runtime-authority-current-delivery-1.json", "packet-plan-current-delivery-1.json", "packet-manifest-current-delivery-1.json", `packet-staging/${ids.handoffId}/delivery/input/assignment.json`, `packet-staging/${ids.handoffId}/delivery/input/references/pc-first-view.png`, `packet-staging/${ids.handoffId}/delivery/input/references/sp-first-view.png`, `packet-staging/${ids.handoffId}/delivery/return-authority.json`, ...RELEASE.map(([, file]) => `helper-release/${file}`)]);
  exact(files.map((entry) => entry.logicalPath).sort(), [...expectedPaths].sort(), "current dry-run file set");
  const visible = readJson(join(root, "packet-staging", ids.handoffId, "delivery", "return-authority.json"), "visible current authority"); validateVisible(visible);
  const manifest = checkRolePacket(join(root, "packet-plan-current-delivery-1.json")); exact(manifest, readJson(join(root, "packet-manifest-current-delivery-1.json"), "current packet manifest"), "current packet manifest");
  assert(manifest.roleAttachments.length === 4, "current packet must contain exactly four attachments.");
  assert(readRegular(join(root, "protocol-current.json"), "candidate current protocol").equals(readRegular(join(root, "protocol-baseline.json"), "candidate baseline protocol")), "candidate pair protocols are not byte-identical.");
  assert(sha256(readRegular(join(root, "protocol-current.json"), "candidate current protocol")) === EXPECTED.pairProtocol, "candidate does not bind the published pair-common protocol.");
  const plan = readJson(join(root, "return-plan-current-seq1-attempt1.json"), "current return plan");
  assert(plan.authority?.condition === CONDITION && plan.authority?.handoff?.opaqueHandoffId === ids.handoffId && plan.authority?.handoff?.deliverySequence === 1, "current return-plan handoff changed.");
  exact(plan.authority.handoff.deliveryProgress, DELIVERY_PROGRESS, "current delivery progress");
  assert(plan.component?.inputStaging?.sha256 === bundle.inputStagingSha256, "current input staging binding changed.");
  const packetText = readRegular(join(root, "packet-staging", ids.handoffId, "delivery", "input", "assignment.json"), "current assignment").toString("utf8") + readRegular(join(root, "packet-staging", ids.handoffId, "delivery", "return-authority.json"), "current visible authority").toString("utf8");
  assert(!packetText.includes(BASELINE) && !packetText.includes("a-impl-r4-reissue"), "current packet reuses baseline role information.");
}
function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") fail("Usage: node tools/r4-prepare-current-seq1-runtime-activation.mjs --dry-run");
  const inputs = loadInputs(); const release = loadRelease(); const ids = identifiers(inputs, release);
  assertAbsent(ids.outputRoot, "candidate current activation root"); assertAbsent(ids.roleHome, "candidate current fresh role home"); assertAbsent(ids.progressRoot, "candidate current external progress root");
  const tmp = mkdtempSync(join(tmpdir(), "p3-r4-current-preparation-"));
  try {
    const bundle = buildBundle(tmp, inputs, release, ids); validateBundle(tmp, bundle, ids);
    process.stdout.write(`${JSON.stringify({ status: "validated-dry-run-not-published", externalWritesPerformed: false, activation: { activationId: ids.activationId, outputRoot: ids.outputRoot, condition: CONDITION, runtimeDeliverySequence: RUNTIME_DELIVERY_SEQUENCE, opaqueHandoffId: ids.handoffId }, freshRoleHome: { path: ids.roleHome, state: "absent" }, externalProgress: { root: ids.progressRoot, state: "absent" }, packet: { sourceCondition: CONDITION, attachmentCount: bundle.packetManifest.roleAttachments.length, manifestSha256: bundle.packetManifestSha256, inputStagingSha256: bundle.inputStagingSha256, baselinePacketBytesRead: false, baselineSharedProtocolBytesRead: true }, frozenBindings: { pairCommonProtocol: inputs.pairProtocol.sha256, currentContract: inputs.currentContract.sha256, currentV4Authority: inputs.v4Authority.sha256, currentCleanRoom: inputs.clean.sha256, currentBOnlyApproval: inputs.approval.sha256, ledger: inputs.ledger.sha256, p11: inputs.p11.sha256 }, bundle: { regularFileCount: bundle.files.length, protocolSha256: bundle.protocolSha256, registrySha256: bundle.registrySha256, returnPlanSha256: bundle.returnPlanSha256 }, prohibitedActions: { roleDelivery: false, roleLaunch: false, implementation: false, returnApply: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false } }, null, 2)}\n`);
  } finally { rmSync(tmp, { recursive: true, force: true, maxRetries: 0 }); }
}
// The finalized-activation dry-run imports this strictly local construction
// vocabulary.  Importing the module has no side effect; only this file's CLI
// entry point may execute the draft preparation flow.
export const currentPreparationInternals = Object.freeze({
  PAIR_ID, CONDITION, COMPONENT, SEQUENCE, ATTEMPT, RUNTIME_DELIVERY_SEQUENCE,
  PILOT, BASELINE, CURRENT, COORDINATOR, V4_ROOT, ACTIVATION_PARENT,
  BASELINE_PUBLISHED_ACTIVATION, ROLE_HOME_PARENT, EXTERNAL_PROGRESS_PARENT,
  REL, EXPECTED, RELEASE, IMMUTABLE_SOURCE_SPEC, CHECKPOINTS, COMPONENT_SCOPE,
  DELIVERY_PROGRESS, fail, assert, sha256, jsonBytes, clone, canonical, stableHash,
  exact, posix, readRegular, readJson, writeNew, listFiles, safeChild,
  hashInputStaging, loadInputs, loadRelease, identifiers, assignment,
  visibleAuthority, validateVisible, delimiterRegions, buildBundle,
  validateBundle, revalidateImmutableInputs,
});

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try { main(); } catch (error) { process.stderr.write(`P3 R4 CURRENT PREPARATION: ${error.message}\n`); process.exitCode = 1; }
}
