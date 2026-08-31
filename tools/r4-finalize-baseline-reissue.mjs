#!/usr/bin/env node
// P-3 R4 baseline delivery-1 quarantine and same-pair reissue finalizer.
//
// The tool has two modes:
//   --dry-run validates the candidate and constructs no external output.
//   --apply publishes only the approved quarantine record, external empty
//   progress root, byte-pinned helper release, and runtime activation.
// It never delivers or launches a role, applies a return, changes lifecycle,
// mutates a worktree/site, performs measurement, or changes P-11.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRolePacket } from "../research/p3/p3-role-packet.mjs";
import { hashInputStaging, validateRoleReturn } from "../research/p3/p3-role-return.mjs";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DESIGN_PATH = join(HERE, "r4-baseline-reissue-candidate-design.json");

const PAIR_ID = "open-service-top-hero-v1-20260809";
const CONDITION = "baseline";
const COMPONENT = "open-service-top-hero";
const SOURCE_HANDOFF_ID = "624e2521f5e3f95d3f0ed3d193349b63";
const SOURCE_ACTIVATION_ID = "f8657db3a6c739184e02a6d411efaee3965dea822508791a46eb9914c2b91a6c";
const PILOT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR_ROOT = `${PILOT_ROOT}/.git/p3-coordinator/${PAIR_ID}`;
const ACTIVATION_PARENT = `${COORDINATOR_ROOT}/runtime-activations/v2`;
const QUARANTINE_PARENT = `${COORDINATOR_ROOT}/quarantines/v1`;
const EXTERNAL_PROGRESS_PARENT = "C:/Users/tane1/AppData/Local/p3-coordinator-records/open-service-top-hero-v1-20260809/r4-baseline-reissue/v1";
const SOURCE_ACTIVATION_ROOT = `${ACTIVATION_PARENT}/${SOURCE_ACTIVATION_ID}`;
const PEER_REACH_STATUS = "owner-accepted self-report, not machine-verifiable";
const SOURCE_PACKET_ROOT = `${SOURCE_ACTIVATION_ROOT}/packet-staging/${SOURCE_HANDOFF_ID}/delivery`;
const SOURCE = Object.freeze({
  protocol: `${SOURCE_ACTIVATION_ROOT}/protocol-baseline.json`,
  registry: `${SOURCE_ACTIVATION_ROOT}/registry-baseline-delivery-1.json`,
  returnPlan: `${SOURCE_ACTIVATION_ROOT}/return-plan-baseline-seq1-attempt1.json`,
  runtimeAuthority: `${SOURCE_ACTIVATION_ROOT}/runtime-authority-baseline-delivery-1.json`,
  packetPlan: `${SOURCE_ACTIVATION_ROOT}/packet-plan-baseline-delivery-1.json`,
  assignment: `${SOURCE_PACKET_ROOT}/input/assignment.json`,
  returnAuthority: `${SOURCE_PACKET_ROOT}/return-authority.json`,
  pcReference: `${SOURCE_PACKET_ROOT}/input/references/pc-first-view.png`,
  spReference: `${SOURCE_PACKET_ROOT}/input/references/sp-first-view.png`,
});
const SOURCE_SHA256 = Object.freeze({
  protocol: "55573130d5bacfe5f0ff66e52eae47980bae8e3c23b871aa811712f9bd671cef",
  registry: "a3a84f0fc30bd7616c7653a02230022a7103aaacb0454ca415888806809b0f66",
  returnPlan: "660fec0e43e16b166476dba851c0cef66e7b55d7cde7d1d8fa4b5584ef84552d",
  runtimeAuthority: "a2ae224d9eb45ec03bcf4533207fb0ab733a203f095363f5c037c36fffa998ee",
  packetPlan: "43fde0c784aad707d4ceb52adeb7356e93c39670a20facd17ac487bcf5cbe42b",
  assignment: "ea1763c3680497789c7cde17d6d9a37b3741a62a7d10ac1a6905acde932bc4f5",
  returnAuthority: "ceed95fc4f3debcec8af2427a10fbf77ffcb60811690640631ecb65341de3504",
  pcReference: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0",
  spReference: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427",
});
const CANDIDATE_EXPECTED = Object.freeze({
  design: "442ac454ad6ac6eb544bcdfa3577f103441f32b991e91f7ddebbf48c5fd262eb",
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  baselineGate: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentGate: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  sourceRuntimeAuthority: "a2ae224d9eb45ec03bcf4533207fb0ab733a203f095363f5c037c36fffa998ee",
  sourceActivationReceipt: "dc12154c14cf7b2947b02b6b49e46c4d53150492e5b173d6f814d791b72d984f",
  sourceDeliveryReceipt: "993e890ada453dfbb9f7949c9be98df91e7cbb12a59b07fd012faeb94565f63e",
  sourceArchive: "b9a96b6d68eb7282c65734971e40b8e7d30f8553a41f47cf2aad585695c70018",
  peerReachAudit: "d832af388f25010d037e07b8e4a7fe8632130b8b8ecf61297a61519848807a99",
});
const BASELINE_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const SOURCE_ROLE_HOME = "C:/Users/tane1/AppData/Local/p3-role-homes/a-impl";
const SOURCE_ARCHIVE_PATH = `${SOURCE_ROLE_HOME}/return.ustar.tar`;
const PEER_REACH_AUDIT_PATH = "C:/Users/tane1/.codex/attachments/e8f84717-6e28-42ee-9fa8-5d5061bc9262/pasted-text.txt";
const REQUIRED_ACTIVATION_FILES = Object.freeze([
  "activation-receipt.json",
  "packet-manifest-baseline-delivery-1.json",
  "packet-plan-baseline-delivery-1.json",
  "protocol-baseline.json",
  "protocol-current.json",
  "registry-baseline-delivery-1.json",
  "return-plan-baseline-seq1-attempt1.json",
  "runtime-authority-baseline-delivery-1.json",
]);

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function posix(value) { return resolve(value).replace(/\\/g, "/"); }
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
function assertAbsent(path, label) { assert(!existsSync(path), `${label} already exists: ${posix(path)}`); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function stableHash(value) { return sha256(Buffer.from(JSON.stringify(canonical(value)), "utf8")); }

function candidateReleaseEntries() {
  return [
    ["return-helper", "p3-role-return.mjs", "d9723895c308b3f87f27f7f8cd1e06409a4104ac4b2b5ba1e910d7630b36d2cc"],
    ["return-helper-e2e", "p3-role-return.e2e.mjs", "216cfdafb7221e2e5539c3581ebf82aeb7bc25ec3f7a2e1cec8d3fafaec8b74a"],
    ["return-plan-template", "p3-role-return-plan-template.json", "7212cd022b4b5fb5634d14c63d382ad275ee3723a849b60fa6d53576ae77f730"],
    ["return-manifest-template", "p3-role-return-manifest-template.json", "6fb1e5175cb7db9a713adb4a8a5e68acf13b45d88c05885397e71ce52b118361"],
    ["return-feedback-template", "p3-role-return-feedback-template.json", "f63ec9b9b6ebee92b4d17d70fb66d6b976c7c461b3f05c4f5b9d5be824e0f4c9"],
    ["protocol-template", "p3-role-handoff-protocol-template.json", "12a6cb01c87b2c0239c78feb2216faf632baf66cee30ba6647e18f646aa96e5b"],
    ["registry-template", "p3-role-handoff-registry-template.json", "d8bb833bb593a9045bcff4ab0dd2949c5a32ac5d151f5f90646a07b35f377918"],
    ["packet-helper", "p3-role-packet.mjs", "69fc169f186dfd1c8dff69616eac8977900e5de77b8c5734468a96bf4a99af07"],
    ["packet-plan-template", "p3-role-packet-plan-template.json", "8ca2441d02fd0583e4d596f2ef78123874af6d60efb180be427fb3ed1632dbea"],
  ].map(([id, filename, digest]) => ({
    id,
    sourcePath: `C:/AI/figma-to-code/templates/verify/${filename}`,
    releasePath: `helper-release/${filename}`,
    sha256: digest,
  }));
}
function isWithin(parent, candidate) {
  const route = relative(resolve(parent), resolve(candidate));
  return route === "" || (!route.startsWith("..") && !route.startsWith("..\\"));
}
function loadCandidate() {
  const design = checkedJson(DESIGN_PATH, CANDIDATE_EXPECTED.design, "candidate design");
  assert(design.schema === "p3-r4-baseline-reissue-design/v1" && design.status === "draft-not-a-record",
    "candidate design is no longer the frozen draft source.");
  assert(design.execution?.externalWrites === false && design.execution?.ownerApprovedFinalRecord === false,
    "candidate design permits an external write or final owner record.");
  assert(design.identitySeparation?.runtimeDeliverySequence === 1 && design.identitySeparation?.coordinatorReissueOrdinal === 2,
    "candidate design no longer separates runtime delivery sequence from coordinator reissue ordinal.");
  assert(design.sourceArchivePolicy?.archiveSha256 === CANDIDATE_EXPECTED.sourceArchive
    && design.sourceArchivePolicy?.candidateDisposition === "quarantined"
    && design.sourceArchivePolicy?.candidateApplicationState === "not-applied"
    && design.sourceArchivePolicy?.mayBeRoleInput === false
    && design.sourceArchivePolicy?.mayBeApplied === false
    && design.sourceArchivePolicy?.mayBeCopiedIntoNewPacket === false,
  "candidate design no longer excludes the submitted archive.");
  assert(design.peerReachStatement?.verificationStatus === PEER_REACH_STATUS,
    "candidate design peer-reach status changed.");
  assert(design.atimeForensicRoute?.source === "known" && design.atimeForensicRoute?.state === "overwritten-by-audit",
    "candidate design atime forensic route changed.");
  assert(design.r5KnownIssue?.classification === "R5-known-issue" && design.r5KnownIssue?.reissuePublicationPrerequisite === false,
    "candidate design R5-known-issue binding changed.");
  const ledgerPath = `${PILOT_ROOT}/.git/figma-p3-comparison-ledger.jsonl`;
  const ledgerBytes = checkedBytes(ledgerPath, CANDIDATE_EXPECTED.ledger, "pair lifecycle ledger");
  const ledger = ledgerBytes.toString("utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert(ledger.length === 3 && ledger[0]?.kind === "started" && ledger[1]?.kind === "preflight-recorded"
    && ledger[1]?.condition === "baseline" && ledger[2]?.kind === "preflight-recorded" && ledger[2]?.condition === "current"
    && ledger.every((entry) => entry.pairId === PAIR_ID),
  "pair ledger no longer contains only start plus both preflight records.");
  const gate = (root, expected, condition) => {
    const value = checkedJson(`${root}/.figma-gate/active.json`, expected, `${condition} preflight gate`);
    assert(value.phase === "preflight" && Array.isArray(value.benchmark?.attempts) && value.benchmark.attempts.length === 0,
      `${condition} preflight is no longer unconsumed.`);
    assertAbsent(`${root}/site`, `${condition} site directory`);
    assertAbsent(`${root}/.p3-role-return-recovery`, `${condition} recovery directory`);
    return value;
  };
  const baselineGate = gate(BASELINE_ROOT, CANDIDATE_EXPECTED.baselineGate, "baseline");
  const currentGate = gate(CURRENT_ROOT, CANDIDATE_EXPECTED.currentGate, "current");
  const sourceAuthority = checkedJson(`${SOURCE_ACTIVATION_ROOT}/runtime-authority-baseline-delivery-1.json`,
    CANDIDATE_EXPECTED.sourceRuntimeAuthority, "source runtime authority");
  const sourceReceipt = checkedJson(`${SOURCE_ACTIVATION_ROOT}/activation-receipt.json`,
    CANDIDATE_EXPECTED.sourceActivationReceipt, "source activation receipt");
  const deliveryPath = `${SOURCE_ACTIVATION_ROOT}/delivery-receipts/baseline-implementation-delivery-1-${SOURCE_HANDOFF_ID}.json`;
  const sourceDelivery = checkedJson(deliveryPath, CANDIDATE_EXPECTED.sourceDeliveryReceipt, "source delivery receipt");
  checkedBytes(`${SOURCE_ACTIVATION_ROOT}/return-plan-baseline-seq1-attempt1.json`, SOURCE_SHA256.returnPlan,
    "source return plan");
  assert(sourceAuthority.recipient?.opaqueHandoffId === SOURCE_HANDOFF_ID && sourceAuthority.recipient?.deliverySequence === 1,
    "source runtime authority identity changed.");
  assert(sourceReceipt.recipient?.opaqueHandoffId === SOURCE_HANDOFF_ID && sourceReceipt.recipient?.deliverySequence === 1,
    "source activation receipt identity changed.");
  assert(sourceDelivery.recipient?.opaqueHandoffId === SOURCE_HANDOFF_ID && sourceDelivery.recipient?.deliverySequence === 1,
    "source delivery receipt identity changed.");
  const roleVisiblePacketRoot = resolve(SOURCE_ACTIVATION_ROOT, sourceDelivery.source?.roleVisiblePacketRoot ?? "");
  assert(typeof sourceDelivery.source?.roleVisiblePacketRoot === "string" && !isWithin(roleVisiblePacketRoot, deliveryPath),
    "source delivery receipt no longer demonstrates the R5 packet-root structural issue.");
  const sourceProgress = `${SOURCE_ACTIVATION_ROOT}/progress`;
  assertRealDirectory(sourceProgress, "source activation progress root");
  exactStringSet(readdirSync(sourceProgress), ["checkpoint-proofs"], "source activation progress inventory");
  assertRealDirectory(`${sourceProgress}/checkpoint-proofs`, "source checkpoint-proof directory");
  assert(readdirSync(`${sourceProgress}/checkpoint-proofs`).length === 0, "source checkpoint-proof directory is not empty.");
  assertAbsent(`${sourceProgress}/role-return-progress.jsonl`, "source progress ledger");
  checkedBytes(SOURCE_ARCHIVE_PATH, CANDIDATE_EXPECTED.sourceArchive, "submitted source archive");
  const peerReachAuditBytes = checkedBytes(PEER_REACH_AUDIT_PATH, CANDIDATE_EXPECTED.peerReachAudit, "peer-reach audit source");
  const peerReachAuditText = peerReachAuditBytes.toString("utf8");
  for (const phrase of [PEER_REACH_STATUS, "唯一存在した法医学的経路は、私の監査読み取りで消えた", "receipt の設計欠陥（R5 対象）"]) {
    assert(peerReachAuditText.includes(phrase), `peer-reach audit source is missing a required finding: ${phrase}`);
  }
  const p11 = checkedJson(`${COORDINATOR_ROOT}/records/p3-p11-authorization-${PAIR_ID}.json`, CANDIDATE_EXPECTED.p11, "P-11 record");
  assert(p11.status === "BLOCKED" && p11.authorization === "NOT_AUTHORIZED", "P-11 is no longer BLOCKED / NOT_AUTHORIZED.");
  const release = candidateReleaseEntries();
  const seed = {
    schema: "p3-r4-baseline-reissue-seed/v1",
    pairId: PAIR_ID,
    condition: CONDITION,
    component: COMPONENT,
    attempt: 1,
    runtimeDeliverySequence: 1,
    coordinatorReissueOrdinal: 2,
    sourceActivationId: SOURCE_ACTIVATION_ID,
    sourceHandoffId: SOURCE_HANDOFF_ID,
    sourceRuntimeAuthoritySha256: CANDIDATE_EXPECTED.sourceRuntimeAuthority,
    sourceDeliveryReceiptSha256: CANDIDATE_EXPECTED.sourceDeliveryReceipt,
    sourceReturnPlanSha256: SOURCE_SHA256.returnPlan,
    sourceArchiveSha256: CANDIDATE_EXPECTED.sourceArchive,
    peerReachAuditSha256: CANDIDATE_EXPECTED.peerReachAudit,
    peerReachVerificationStatus: PEER_REACH_STATUS,
    returnHelperSha256: releaseById(release, "return-helper").sha256,
    returnHelperE2ESha256: releaseById(release, "return-helper-e2e").sha256,
  };
  const seedHash = sha256(jsonBytes(canonical(seed)));
  const handoffId = sha256(Buffer.from(`p3-r4-baseline-reissue-handoff\0${seedHash}`, "utf8")).slice(0, 32);
  const activationId = sha256(Buffer.from(`p3-r4-baseline-reissue-activation\0${seedHash}\0${handoffId}`, "utf8"));
  const quarantineId = sha256(Buffer.from(`p3-r4-baseline-reissue-quarantine\0${CANDIDATE_EXPECTED.sourceDeliveryReceipt}\0${CANDIDATE_EXPECTED.sourceArchive}`, "utf8"));
  const peerReachAudit = {
    source: { path: posix(PEER_REACH_AUDIT_PATH), sha256: CANDIDATE_EXPECTED.peerReachAudit },
    peerReachStatement: { verificationStatus: PEER_REACH_STATUS },
    atimeForensicRoute: { source: "known", state: "overwritten-by-audit" },
  };
  const candidate = {
    pair: { pairId: PAIR_ID, condition: CONDITION, component: COMPONENT, attempt: 1,
      preflightLedger: { path: posix(ledgerPath), sha256: CANDIDATE_EXPECTED.ledger, recordCount: 3 }, p11 },
    sourceDelivery: {
      activation: { id: SOURCE_ACTIVATION_ID, root: posix(SOURCE_ACTIVATION_ROOT), runtimeAuthoritySha256: CANDIDATE_EXPECTED.sourceRuntimeAuthority },
      delivery: { handoffId: SOURCE_HANDOFF_ID, receiptSha256: CANDIDATE_EXPECTED.sourceDeliveryReceipt, returnPlanSha256: SOURCE_SHA256.returnPlan },
      archive: { sha256: CANDIDATE_EXPECTED.sourceArchive, deliverySequence: 1, candidateDisposition: "quarantined", candidateApplicationState: "not-applied" },
      peerReachAudit,
      unconsumedAttemptEvidence: { sourceProgressLedger: "absent", checkpointProofFiles: 0, runtimeDeliverySequenceForEmptyProgress: 1 },
    },
    reissueIdentity: { coordinatorReissueOrdinal: 2, runtimeDeliverySequence: 1, opaqueHandoffId: handoffId, sourceHandoffId: SOURCE_HANDOFF_ID },
    helperRelease: { entries: release },
    runtimeActivation: { activationId, root: `${ACTIVATION_PARENT}/${activationId}` },
    quarantine: { quarantineId, root: `${QUARANTINE_PARENT}/${quarantineId}` },
    r5KnownIssue: { roleVisiblePacketRoot: posix(roleVisiblePacketRoot), receiptPath: posix(deliveryPath), classification: "R5-known-issue", reissuePublicationPrerequisite: false },
    observedPreflights: { baseline: baselineGate.preflightId, current: currentGate.preflightId },
  };
  assert(handoffId === "f92bcaa29c39e52eb6d5044638b41101" && activationId === "bb3077e21473ce4664e353cadc8e4fda44df87da6be9bf3839f4af818ab42165"
    && quarantineId === "ef7787add1332a4e96cf077696f58600ff5156123ee84accd225a87fa5df07b7",
  "candidate deterministic identifiers changed.");
  return { candidate };
}

function ids(candidate) {
  const handoffId = candidate.reissueIdentity.opaqueHandoffId;
  const activationId = candidate.runtimeActivation.activationId;
  const quarantineId = candidate.quarantine.quarantineId;
  return {
    handoffId,
    activationId,
    quarantineId,
    activationRoot: `${ACTIVATION_PARENT}/${activationId}`,
    quarantineRoot: `${QUARANTINE_PARENT}/${quarantineId}`,
    progressRoot: `${EXTERNAL_PROGRESS_PARENT}/${activationId}/progress`,
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sameBytes(left, right, label) { assert(Buffer.from(left).equals(Buffer.from(right)), `${label} bytes differ.`); }
function checkedBytes(path, expected, label) {
  const bytes = readRegular(path, label);
  const actual = sha256(bytes);
  assert(actual === expected, `${label} SHA-256 changed: expected ${expected}, got ${actual}.`);
  return bytes;
}
function checkedJson(path, expected, label) {
  const bytes = checkedBytes(path, expected, label);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function safeChild(root, relativePath) {
  assert(typeof relativePath === "string" && relativePath.length > 0, "output relative path is empty.");
  const output = resolve(root, ...relativePath.split("/"));
  const route = relative(resolve(root), output);
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\"), `output path escapes its root: ${relativePath}`);
  return output;
}
function writeNew(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
}
function writeRelative(root, relativePath, bytes) { writeNew(safeChild(root, relativePath), bytes); }
function assertRealDirectory(path, label) {
  assert(existsSync(path), `${label} is missing: ${posix(path)}`);
  const info = lstatSync(path);
  assert(!info.isSymbolicLink() && info.isDirectory(), `${label} must be a real directory.`);
}
function listFiles(root) {
  assertRealDirectory(root, "output root");
  const found = [];
  function walk(directory, prefix = "") {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "variant" }));
    for (const child of children) {
      const absolute = join(directory, child.name);
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const info = lstatSync(absolute);
      assert(!info.isSymbolicLink(), `output contains a symlink: ${relativePath}`);
      if (info.isDirectory()) walk(absolute, relativePath);
      else {
        assert(info.isFile(), `output contains a non-regular entry: ${relativePath}`);
        found.push({ relativePath, bytes: info.size, sha256: sha256(readFileSync(absolute)) });
      }
    }
  }
  walk(root);
  return found;
}
function exactStringSet(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  assert(JSON.stringify(left) === JSON.stringify(right), `${label} differs.`);
}
function inputStagingHash(entries) {
  const hash = createHash("sha256");
  hash.update("p3-role-input-staging/v1\0", "utf8");
  for (const entry of [...entries].sort((left, right) => Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")))) {
    hash.update(entry.path, "utf8");
    hash.update(Buffer.from([0]));
    hash.update(sha256(entry.bytes), "ascii");
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}
function sourceTemplates() {
  return {
    protocol: checkedJson(SOURCE.protocol, SOURCE_SHA256.protocol, "source runtime protocol"),
    registry: checkedJson(SOURCE.registry, SOURCE_SHA256.registry, "source runtime registry"),
    returnPlan: checkedJson(SOURCE.returnPlan, SOURCE_SHA256.returnPlan, "source runtime return plan"),
    runtimeAuthority: checkedJson(SOURCE.runtimeAuthority, SOURCE_SHA256.runtimeAuthority, "source runtime authority"),
    packetPlan: checkedJson(SOURCE.packetPlan, SOURCE_SHA256.packetPlan, "source packet plan"),
    assignment: checkedJson(SOURCE.assignment, SOURCE_SHA256.assignment, "source role assignment"),
    returnAuthority: checkedJson(SOURCE.returnAuthority, SOURCE_SHA256.returnAuthority, "source role-visible return authority"),
    pcReference: checkedBytes(SOURCE.pcReference, SOURCE_SHA256.pcReference, "source PC reference"),
    spReference: checkedBytes(SOURCE.spReference, SOURCE_SHA256.spReference, "source SP reference"),
  };
}
function releaseFiles(candidate) {
  const entries = candidate?.helperRelease?.entries;
  assert(Array.isArray(entries) && entries.length === 9, "candidate does not enumerate the required nine helper-release files.");
  const requiredIds = [
    "return-helper",
    "return-helper-e2e",
    "return-plan-template",
    "return-manifest-template",
    "return-feedback-template",
    "protocol-template",
    "registry-template",
    "packet-helper",
    "packet-plan-template",
  ];
  exactStringSet(entries.map((entry) => entry.id), requiredIds, "helper-release id inventory");
  return entries.map((entry) => {
    assert(typeof entry.sourcePath === "string" && typeof entry.releasePath === "string" && typeof entry.sha256 === "string",
      `helper-release ${entry.id} has an incomplete candidate binding.`);
    assert(entry.releasePath.startsWith("helper-release/"), `helper-release ${entry.id} escapes the activation helper-release root.`);
    const bytes = checkedBytes(entry.sourcePath, entry.sha256, `current helper release ${entry.id}`);
    return { ...entry, bytes };
  });
}
function releaseById(release, id) {
  const entry = release.find((candidate) => candidate.id === id);
  assert(entry, `missing helper-release entry: ${id}`);
  return entry;
}
function releaseReference(release, idsValue, id) {
  const entry = releaseById(release, id);
  return { path: `${idsValue.activationRoot}/${entry.releasePath}`, sha256: entry.sha256 };
}
function releaseReceiptEntries(release, idsValue) {
  return release.map((entry) => ({
    id: entry.id,
    sourcePath: posix(entry.sourcePath),
    releasePath: entry.releasePath,
    path: `${idsValue.activationRoot}/${entry.releasePath}`,
    sha256: entry.sha256,
    bytes: entry.bytes.length,
  }));
}
function prepareProtocol(templates, release, idsValue, approvedAt, quarantine) {
  const protocol = clone(templates.protocol);
  protocol.recordState = "finalized";
  protocol.executionState = false;
  protocol.ownerApproved = true;
  protocol.ownerApprovedAt = approvedAt;
  protocol.approvalBasis = "Owner-approved append-only R4 reissue publication: coordinator quarantine record, byte-pinned helper release, and runtime activation only. Role delivery, launch, implementation, return apply, lifecycle mutation, measurement, and P-11 change remain outside this authority.";
  protocol.authorityRole = "append-only R4 same-pair baseline reissue coordinator protocol; runtime delivery sequence 1";
  protocol.returnPackage.validator = releaseReference(release, idsValue, "return-helper");
  protocol.returnPackage.e2e = releaseReference(release, idsValue, "return-helper-e2e");
  protocol.returnPackage.planTemplate = releaseReference(release, idsValue, "return-plan-template");
  protocol.returnPackage.manifestTemplate = releaseReference(release, idsValue, "return-manifest-template");
  protocol.returnPackage.feedbackTemplate = releaseReference(release, idsValue, "return-feedback-template");
  protocol.returnPackage.protocolTemplate = releaseReference(release, idsValue, "protocol-template");
  protocol.returnPackage.registryTemplate = releaseReference(release, idsValue, "registry-template");
  protocol.returnPackage.packetValidator = releaseReference(release, idsValue, "packet-helper");
  protocol.returnPackage.packetPlanTemplate = releaseReference(release, idsValue, "packet-plan-template");
  const runtime = clone(protocol.authorityBindings.runtimeActivation);
  runtime.activationId = idsValue.activationId;
  runtime.activationRoot = idsValue.activationRoot;
  runtime.helperRelease = releaseReceiptEntries(release, idsValue);
  runtime.coordinatorReissue = {
    ordinal: 2,
    sourceActivationId: SOURCE_ACTIVATION_ID,
    sourceHandoffId: SOURCE_HANDOFF_ID,
    sourceArchiveSha256: quarantine.record.sourceDelivery.archive.sha256,
    sourceArchiveDisposition: "quarantined",
    sourceArchiveApplicationState: "not-applied",
  };
  protocol.authorityBindings.runtimeActivation = runtime;
  protocol.authorityBindings.reissuePublication = {
    coordinatorReissueOrdinal: 2,
    sourceActivationId: SOURCE_ACTIVATION_ID,
    sourceHandoffId: SOURCE_HANDOFF_ID,
    sourceArchiveSha256: quarantine.record.sourceDelivery.archive.sha256,
    quarantineRecord: {
      path: `${idsValue.quarantineRoot}/delivery-1-quarantine.json`,
      sha256: quarantine.sha256,
    },
    roleDeliveryAuthorized: false,
    roleLaunchAuthorized: false,
    returnApplyAuthorized: false,
  };
  protocol.executionBoundary = {
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
  };
  return protocol;
}
function prepareRolePacket(templates, handoffId, protocolSha256) {
  const assignment = clone(templates.assignment);
  assignment.handoff.opaqueHandoffId = handoffId;
  assignment.handoff.deliverySequence = 1;
  assignment.handoff.handoffProtocolSha256 = protocolSha256;
  const assignmentBytes = jsonBytes(assignment);
  const inputEntries = [
    { path: "assignment.json", bytes: assignmentBytes },
    { path: "references/pc-first-view.png", bytes: templates.pcReference },
    { path: "references/sp-first-view.png", bytes: templates.spReference },
  ];
  const inputStagingSha256 = inputStagingHash(inputEntries);
  const authority = clone(templates.returnAuthority);
  authority.handoff.opaqueHandoffId = handoffId;
  authority.handoff.deliverySequence = 1;
  authority.handoff.handoffProtocolSha256 = protocolSha256;
  authority.inputStaging.sha256 = inputStagingSha256;
  const authorityBytes = jsonBytes(authority);
  const attachments = [
    { logicalPath: "input/assignment.json", path: "input/assignment.json", bytes: assignmentBytes, origin: "coordinator-authored redacted baseline sequence-1 role input" },
    { logicalPath: "input/references/pc-first-view.png", path: "input/references/pc-first-view.png", bytes: templates.pcReference, origin: "saved frozen Figma reference export copied by the coordinator" },
    { logicalPath: "input/references/sp-first-view.png", path: "input/references/sp-first-view.png", bytes: templates.spReference, origin: "saved frozen Figma reference export copied by the coordinator" },
    { logicalPath: "return-authority.json", path: "return-authority.json", bytes: authorityBytes, origin: "coordinator-authored redacted baseline sequence-1 role input" },
  ];
  exactStringSet(attachments.map((entry) => entry.logicalPath), [
    "input/assignment.json",
    "input/references/pc-first-view.png",
    "input/references/sp-first-view.png",
    "return-authority.json",
  ], "role attachment inventory");
  const roleText = Buffer.concat([assignmentBytes, authorityBytes]).toString("utf8");
  for (const forbidden of [SOURCE_HANDOFF_ID, SOURCE_SHA256.returnPlan, "C:/docker-project", "C:\\docker-project", "coordinatorReissueOrdinal"]) {
    assert(!roleText.includes(forbidden), `role packet contains a forbidden coordinator value: ${forbidden}`);
  }
  return { assignment, assignmentBytes, authority, authorityBytes, attachments, inputStagingSha256 };
}
function preparePacketPlan(templates, idsValue, packet) {
  const plan = clone(templates.packetPlan);
  plan.packetRoot = `packet-staging/${idsValue.handoffId}/delivery`;
  plan.roleAttachments = packet.attachments.map((entry) => ({
    logicalPath: entry.logicalPath,
    path: entry.path,
    sha256: sha256(entry.bytes),
    origin: entry.origin,
  }));
  return plan;
}
function prepareRegistry(templates, idsValue, approvedAt, protocolSha256, packetManifest, packetManifestSha256) {
  const registry = clone(templates.registry);
  registry.recordState = "finalized";
  registry.executionState = false;
  registry.ownerApproved = true;
  registry.ownerApprovedAt = approvedAt;
  registry.approvalBasis = "Owner-approved append-only R4 same-pair reissue publication for a new opaque baseline handoff. This registry does not copy to a role home, deliver or launch a role, implement, apply a return, mutate lifecycle state, measure, or change P-11.";
  registry.protocol = { path: "protocol-baseline.json", sha256: protocolSha256 };
  registry.coordinatorReissue = {
    ordinal: 2,
    runtimeDeliverySequence: 1,
    sourceHandoffId: SOURCE_HANDOFF_ID,
    sourceArchiveDisposition: "quarantined",
    sourceArchiveApplicationState: "not-applied",
  };
  const recipient = registry.recipientPackets[0];
  recipient.opaqueHandoffId = idsValue.handoffId;
  recipient.deliverySequence = 1;
  recipient.attachments = packetManifest.roleAttachments.map((entry) => ({
    attachmentId: sha256(Buffer.from(`${idsValue.handoffId}\0${entry.logicalPath}`, "utf8")).slice(0, 32),
    logicalPath: entry.logicalPath,
    origin: entry.origin,
    sha256: entry.sha256,
  }));
  recipient.packetManifest = { path: "packet-manifest-baseline-delivery-1.json", sha256: packetManifestSha256 };
  recipient.coordinatorEvidencePath = "packet-manifest-baseline-delivery-1.json";
  recipient.outsideHostPathInstructionReview = {
    method: "static coordinator packet-content review",
    machineValidated: false,
    reviewer: "coordinator",
    reviewedAt: approvedAt,
    result: "clear",
  };
  return registry;
}
function prepareReturnPlan(templates, idsValue, protocolSha256, registrySha256, packetManifestSha256, inputStagingSha256) {
  const plan = clone(templates.returnPlan);
  plan.authority.progress = {
    ledgerPath: `${idsValue.progressRoot}/role-return-progress.jsonl`,
    checkpointProofDirectory: `${idsValue.progressRoot}/checkpoint-proofs`,
  };
  plan.authority.handoff.opaqueHandoffId = idsValue.handoffId;
  plan.authority.handoff.deliverySequence = 1;
  plan.authority.handoff.deliveryProgress = { version: 1, scope: "per-condition", initialDeliverySequence: 1, increment: 1 };
  plan.authority.handoff.protocol = {
    self: { path: "protocol-baseline.json", sha256: protocolSha256 },
    peer: { path: "protocol-current.json", sha256: protocolSha256 },
  };
  plan.authority.handoff.registry = { path: "registry-baseline-delivery-1.json", sha256: registrySha256 };
  plan.authority.handoff.packetManifest = { path: "packet-manifest-baseline-delivery-1.json", sha256: packetManifestSha256 };
  plan.component.inputStaging = {
    root: `packet-staging/${idsValue.handoffId}/delivery/input`,
    sha256: inputStagingSha256,
  };
  const text = JSON.stringify(plan);
  assert(!text.includes("coordinatorReissueOrdinal") && !text.includes("reissueOrdinal"),
    "return plan must not carry the coordinator-only reissue ordinal.");
  assert(!text.includes(SOURCE_HANDOFF_ID) && !text.includes(SOURCE_SHA256.returnPlan),
    "return plan retains a prohibited source delivery identifier.");
  return plan;
}
function prepareRuntimeAuthority(templates, release, idsValue, approvedAt, bindings, quarantine) {
  const authority = clone(templates.runtimeAuthority);
  authority.recordState = "finalized";
  authority.ownerApproved = true;
  authority.ownerApprovedAt = approvedAt;
  authority.approvalBasis = "Owner-approved append-only R4 same-pair reissue publication. The authority is limited to the byte-pinned helper release and runtime activation; it does not deliver or launch a role, implement, apply a return, mutate lifecycle state, measure, or change P-11.";
  authority.activationId = idsValue.activationId;
  authority.recipient = { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: idsValue.handoffId };
  authority.state = "delivery-ready-not-delivered";
  authority.helperRelease = release.map((entry) => ({
    id: entry.id,
    path: `${idsValue.activationRoot}/${entry.releasePath}`,
    sha256: entry.sha256,
  }));
  authority.runtimeBindings = {
    protocolBaseline: { path: "protocol-baseline.json", sha256: bindings.protocolSha256 },
    protocolCurrent: { path: "protocol-current.json", sha256: bindings.protocolSha256 },
    registry: { path: "registry-baseline-delivery-1.json", sha256: bindings.registrySha256 },
    packetPlan: { path: "packet-plan-baseline-delivery-1.json", sha256: bindings.packetPlanSha256 },
    packetManifest: { path: "packet-manifest-baseline-delivery-1.json", sha256: bindings.packetManifestSha256 },
    returnPlan: { path: "return-plan-baseline-seq1-attempt1.json", sha256: bindings.returnPlanSha256 },
    inputStaging: { path: `packet-staging/${idsValue.handoffId}/delivery/input`, sha256: bindings.inputStagingSha256 },
  };
  authority.coordinatorReissue = {
    ordinal: 2,
    sourceActivationId: SOURCE_ACTIVATION_ID,
    sourceHandoffId: SOURCE_HANDOFF_ID,
    sourceArchiveSha256: quarantine.record.sourceDelivery.archive.sha256,
    quarantineRecord: {
      path: `${idsValue.quarantineRoot}/delivery-1-quarantine.json`,
      sha256: quarantine.sha256,
      disposition: "quarantined",
      applicationState: "not-applied",
    },
  };
  authority.deliveryReceiptRequiredBeforeRoleHomeCopy = true;
  authority.actualRoleHomeCopy = false;
  authority.actualRoleLaunch = false;
  authority.actualImplementation = false;
  authority.executionBoundary = {
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
  };
  return authority;
}
function prepareQuarantine(candidate, idsValue, approvedAt) {
  const record = {
    schema: "p3-r4-baseline-delivery-quarantine/v1",
    recordState: "finalized",
    ownerApproved: true,
    ownerApprovedAt: approvedAt,
    approvalBasis: "Owner-approved append-only quarantine publication for the submitted baseline delivery-1 archive. This record does not authorize role delivery, launch, implementation, return apply, lifecycle mutation, browser/Figma measurement, or P-11 change.",
    coordinatorOnly: true,
    coordinatorReissueOrdinal: 2,
    pair: { pairId: PAIR_ID, condition: CONDITION, component: COMPONENT, sequence: 1, attempt: 1 },
    sourceDelivery: {
      sourceActivationId: SOURCE_ACTIVATION_ID,
      opaqueHandoffId: SOURCE_HANDOFF_ID,
      runtimeDeliverySequence: 1,
      deliveryReceiptSha256: candidate.sourceDelivery.delivery.receiptSha256,
      archive: {
        sha256: candidate.sourceDelivery.archive.sha256,
        disposition: "quarantined",
        applicationState: "not-applied",
        excludedFromNewRoleInputs: true,
        mayBeApplied: false,
        mayBeCopiedIntoNewPacket: false,
        mayBeUsedForImplementation: false,
      },
    },
    peerReachStatement: {
      verificationStatus: PEER_REACH_STATUS,
      recordingScope: "owner-accepted self-report only",
      machineConclusion: false,
    },
    peerReachAuditSource: clone(candidate.sourceDelivery.peerReachAudit.source),
    atimeForensicRoute: {
      source: "known",
      state: "overwritten-by-audit",
      meaning: "The prior access-time route cannot establish access in the delivery-time window after the later audit read.",
    },
    r5KnownIssue: clone(candidate.r5KnownIssue),
    output: { root: idsValue.quarantineRoot, record: "delivery-1-quarantine.json" },
    executionBoundary: {
      roleDelivery: false,
      roleLaunch: false,
      implementation: false,
      returnApply: false,
      lifecycleMutation: false,
      browserOrFigmaMeasurement: false,
      p11Mutation: false,
    },
  };
  const text = JSON.stringify(record).toLowerCase();
  for (const forbidden of ["confirmed", "verified", "no peer disclosure"]) {
    assert(!text.includes(forbidden), `quarantine record contains prohibited assertion wording: ${forbidden}`);
  }
  assert(record.peerReachStatement.verificationStatus === PEER_REACH_STATUS,
    "quarantine record does not preserve the exact owner-accepted self-report status.");
  assert(record.atimeForensicRoute.source === "known" && record.atimeForensicRoute.state === "overwritten-by-audit",
    "quarantine record does not preserve the overwritten atime forensic route.");
  assert(record.r5KnownIssue.classification === "R5-known-issue" && record.r5KnownIssue.reissuePublicationPrerequisite === false,
    "quarantine record does not preserve the R5 known issue classification.");
  const bytes = jsonBytes(record);
  return { record, bytes, sha256: sha256(bytes), candidate };
}
function expectedActivationFiles(idsValue, release) {
  return [
    ...REQUIRED_ACTIVATION_FILES,
    ...release.map((entry) => entry.releasePath),
    `packet-staging/${idsValue.handoffId}/delivery/input/assignment.json`,
    `packet-staging/${idsValue.handoffId}/delivery/input/references/pc-first-view.png`,
    `packet-staging/${idsValue.handoffId}/delivery/input/references/sp-first-view.png`,
    `packet-staging/${idsValue.handoffId}/delivery/return-authority.json`,
  ];
}
function prepareReceipt(templates, release, idsValue, approvedAt, bindings, quarantine, outputs) {
  return {
    schema: "p3-r4-runtime-activation-receipt/v2",
    recordState: "finalized",
    activationId: idsValue.activationId,
    pairId: PAIR_ID,
    condition: CONDITION,
    recipient: { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: idsValue.handoffId },
    ownerApprovalRecordedAt: approvedAt,
    coordinatorReissue: {
      ordinal: 2,
      sourceActivationId: SOURCE_ACTIVATION_ID,
      sourceHandoffId: SOURCE_HANDOFF_ID,
      sourceArchiveSha256: quarantine.record.sourceDelivery.archive.sha256,
      quarantineRecord: { path: `${idsValue.quarantineRoot}/delivery-1-quarantine.json`, sha256: quarantine.sha256 },
    },
    outputRoot: idsValue.activationRoot,
    outputs,
    packetCheck: { result: "PASS", attachmentCount: 4, manifestSha256: bindings.packetManifestSha256 },
    release: releaseReceiptEntries(release, idsValue),
    immutableInputs: clone(templates.runtimeAuthority.immutableInputs),
    externalProgress: {
      root: idsValue.progressRoot,
      ledgerPath: `${idsValue.progressRoot}/role-return-progress.jsonl`,
      checkpointProofDirectory: `${idsValue.progressRoot}/checkpoint-proofs`,
      initialState: "empty-root-no-progress-artifacts",
    },
    result: {
      quarantineRecordCreated: true,
      helperReleaseCreated: true,
      runtimeActivationCreated: true,
      packetCreatedAndChecked: true,
      registryCreated: true,
      concreteReturnPlanCreated: true,
      roleHomeCreated: false,
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
function buildActivation(root, templates, release, idsValue, approvedAt, quarantine) {
  const protocol = prepareProtocol(templates, release, idsValue, approvedAt, quarantine);
  const protocolBytes = jsonBytes(protocol);
  const protocolSha256 = sha256(protocolBytes);
  for (const entry of release) writeRelative(root, entry.releasePath, entry.bytes);
  writeRelative(root, "protocol-baseline.json", protocolBytes);
  writeRelative(root, "protocol-current.json", protocolBytes);
  const packet = prepareRolePacket(templates, idsValue.handoffId, protocolSha256);
  for (const entry of packet.attachments) writeRelative(root, `packet-staging/${idsValue.handoffId}/delivery/${entry.path}`, entry.bytes);
  const packetPlan = preparePacketPlan(templates, idsValue, packet);
  const packetPlanBytes = jsonBytes(packetPlan);
  const packetPlanPath = safeChild(root, "packet-plan-baseline-delivery-1.json");
  writeNew(packetPlanPath, packetPlanBytes);
  const packetManifest = checkRolePacket(packetPlanPath);
  const packetManifestBytes = jsonBytes(packetManifest);
  const packetManifestSha256 = sha256(packetManifestBytes);
  writeRelative(root, "packet-manifest-baseline-delivery-1.json", packetManifestBytes);
  const registry = prepareRegistry(templates, idsValue, approvedAt, protocolSha256, packetManifest, packetManifestSha256);
  const registryBytes = jsonBytes(registry);
  const registrySha256 = sha256(registryBytes);
  writeRelative(root, "registry-baseline-delivery-1.json", registryBytes);
  const returnPlan = prepareReturnPlan(templates, idsValue, protocolSha256, registrySha256, packetManifestSha256, packet.inputStagingSha256);
  const returnPlanBytes = jsonBytes(returnPlan);
  const returnPlanSha256 = sha256(returnPlanBytes);
  writeRelative(root, "return-plan-baseline-seq1-attempt1.json", returnPlanBytes);
  const bindings = {
    protocolSha256,
    registrySha256,
    packetPlanSha256: sha256(packetPlanBytes),
    packetManifestSha256,
    returnPlanSha256,
    inputStagingSha256: packet.inputStagingSha256,
  };
  const authority = prepareRuntimeAuthority(templates, release, idsValue, approvedAt, bindings, quarantine);
  const authorityBytes = jsonBytes(authority);
  writeRelative(root, "runtime-authority-baseline-delivery-1.json", authorityBytes);
  const outputs = listFiles(root).map(({ relativePath, sha256: digest, bytes }) => ({ relativePath, sha256: digest, bytes }));
  const receipt = prepareReceipt(templates, release, idsValue, approvedAt, bindings, quarantine, outputs);
  const receiptBytes = jsonBytes(receipt);
  writeRelative(root, "activation-receipt.json", receiptBytes);
  return { protocol, packet, packetManifest, registry, returnPlan, authority, receipt, bindings };
}
function validateProgress(root) {
  assertRealDirectory(root, "external progress root");
  assert(readdirSync(root).length === 0, "external progress root must be empty at publication.");
  assert(!existsSync(join(root, "role-return-progress.jsonl")), "external progress ledger must be absent at publication.");
  assert(!existsSync(join(root, "checkpoint-proofs")), "external checkpoint-proof directory must be absent at publication.");
  assert(!existsSync(join(root, "role-return-progress.lock")), "external progress lock must be absent at publication.");
}
function tarString(header, offset, length, value, label) {
  const bytes = Buffer.from(value, "utf8");
  assert(bytes.length < length, `${label} is too long for the USTAR header.`);
  bytes.copy(header, offset);
}
function tarOctal(header, offset, length, value) {
  Buffer.from(`${Number(value).toString(8).padStart(length - 1, "0")}\0`, "ascii").copy(header, offset);
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
  Buffer.from(`${tarChecksum(header).toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148);
  return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512, 0)]);
}
function fixtureReturnArchive(root, plan) {
  const files = plan.component.filePolicies.map((policy) => {
    const content = policy.bootstrapDelimiterRegions.map((region) => (
      `${region.startDelimiter}\nfixture ${region.elementId}\n${region.endDelimiter}\n`
    )).join("\n");
    const bytes = Buffer.from(content, "utf8");
    return { path: policy.path, bytes, sha256: sha256(bytes) };
  });
  const manifest = {
    version: 4,
    kind: "p3-role-return",
    handoffId: plan.authority.handoff.opaqueHandoffId,
    deliverySequence: 1,
    handoffProtocolSha256: plan.authority.handoff.protocol.self.sha256,
    component: {
      elementId: plan.component.elementId,
      componentDecisionCodePath: plan.component.componentDecisionCodePath,
      sequence: plan.component.sequence,
      attempt: plan.component.attempt,
    },
    inputStagingSha256: plan.component.inputStaging.sha256,
    files: files.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
  };
  const archive = Buffer.concat([
    ustarEntry("return-manifest.json", jsonBytes(manifest)),
    ...files.map((entry) => ustarEntry(entry.path, entry.bytes)),
    Buffer.alloc(1024, 0),
  ]);
  const path = join(root, "fixture-return.ustar.tar");
  writeNew(path, archive);
  return path;
}
function removeOwnedTree(root, label) {
  try {
    rmSync(root, { recursive: true, force: false, maxRetries: 30, retryDelay: 100 });
  } catch (error) {
    if (!['EBUSY', 'EPERM'].includes(error?.code)) throw error;
    const literal = root.replace(/'/g, "''");
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Remove-Item -LiteralPath '${literal}' -Recurse -Force -ErrorAction Stop`,
    ], { encoding: "utf8", windowsHide: true });
    assert(!existsSync(root), `${label} cleanup did not remove the finalizer-owned path.`);
  }
}
function removeWorkspaceFixture(root) {
  if (!existsSync(root)) return;
  const workspaceRoot = resolve(HERE, "..");
  const route = relative(workspaceRoot, resolve(root));
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\")
    && basename(root).startsWith(".r4-baseline-reissue-return-fixture-"),
  "refusing to remove a path outside the finalizer-owned workspace fixture.");
  removeOwnedTree(root, "workspace fixture");
}
function validateConcreteReturnPlan(root, idsValue) {
  const workspaceRoot = resolve(HERE, "..");
  const fixtureRoot = mkdtempSync(join(workspaceRoot, ".r4-baseline-reissue-return-fixture-"));
  try {
    const plan = readJson(safeChild(root, "return-plan-baseline-seq1-attempt1.json"), "runtime return plan fixture source");
    plan.authority.progress = {
      ledgerPath: posix(join(fixtureRoot, "progress", "role-return-progress.jsonl")),
      checkpointProofDirectory: posix(join(fixtureRoot, "progress", "checkpoint-proofs")),
    };
    for (const relativePath of [
      "protocol-baseline.json",
      "protocol-current.json",
      "registry-baseline-delivery-1.json",
      "packet-manifest-baseline-delivery-1.json",
    ]) {
      writeRelative(fixtureRoot, relativePath, readRegular(safeChild(root, relativePath), `runtime fixture source ${relativePath}`));
    }
    const inputRoot = safeChild(root, `packet-staging/${idsValue.handoffId}/delivery/input`);
    for (const entry of listFiles(inputRoot)) {
      writeRelative(fixtureRoot, `packet-staging/${idsValue.handoffId}/delivery/input/${entry.relativePath}`,
        readRegular(safeChild(inputRoot, entry.relativePath), `runtime fixture input ${entry.relativePath}`));
    }
    mkdirSync(join(fixtureRoot, "progress", "checkpoint-proofs"), { recursive: true, mode: 0o700 });
    const planPath = safeChild(fixtureRoot, "return-plan-baseline-seq1-attempt1.json");
    writeNew(planPath, jsonBytes(plan));
    const archivePath = fixtureReturnArchive(fixtureRoot, plan);
    const result = validateRoleReturn(planPath, archivePath, BASELINE_ROOT);
    assert(result.applyReady === true && result.handoffId === idsValue.handoffId
      && result.component?.sequence === 1 && result.component?.attempt === 1
      && Array.isArray(result.validatedFiles) && result.validatedFiles.length === 2,
    "concrete baseline sequence-1 return plan did not validate through the byte-pinned helper.");
  } finally {
    removeWorkspaceFixture(fixtureRoot);
  }
}
function validateActivation(root, release, idsValue, approvedAt, quarantine) {
  const expected = expectedActivationFiles(idsValue, release);
  const files = listFiles(root);
  exactStringSet(files.map((entry) => entry.relativePath), expected, "activation file inventory");
  assert(files.length === 21, `activation must contain exactly 21 regular files, got ${files.length}.`);
  for (const entry of release) {
    sameBytes(readRegular(safeChild(root, entry.releasePath), `activation helper release ${entry.id}`), entry.bytes,
      `activation helper release ${entry.id}`);
  }
  const protocolBaseline = readRegular(safeChild(root, "protocol-baseline.json"), "baseline protocol");
  sameBytes(protocolBaseline, readRegular(safeChild(root, "protocol-current.json"), "current protocol"), "A/B protocol");
  const protocol = JSON.parse(protocolBaseline.toString("utf8"));
  assert(protocol.ownerApproved === true && protocol.ownerApprovedAt === approvedAt && protocol.executionState === false,
    "activation protocol finalization state is invalid.");
  const packetPlanPath = safeChild(root, "packet-plan-baseline-delivery-1.json");
  const freshManifest = checkRolePacket(packetPlanPath);
  sameBytes(jsonBytes(freshManifest), readRegular(safeChild(root, "packet-manifest-baseline-delivery-1.json"), "packet manifest"),
    "packet manifest fresh validation");
  assert(freshManifest.attachmentCount === 4, "packet manifest attachment count is not four.");
  const inputRoot = safeChild(root, `packet-staging/${idsValue.handoffId}/delivery/input`);
  const inputHash = hashInputStaging(inputRoot);
  const returnAuthority = readJson(safeChild(root, `packet-staging/${idsValue.handoffId}/delivery/return-authority.json`), "role-visible return authority");
  assert(returnAuthority.handoff?.opaqueHandoffId === idsValue.handoffId && returnAuthority.handoff?.deliverySequence === 1,
    "role-visible return authority recipient identity is invalid.");
  assert(returnAuthority.inputStaging?.sha256 === inputHash, "role-visible return authority input-staging hash is invalid.");
  const registry = readJson(safeChild(root, "registry-baseline-delivery-1.json"), "runtime registry");
  assert(registry.coordinatorReissue?.ordinal === 2 && registry.recipientPackets?.[0]?.opaqueHandoffId === idsValue.handoffId,
    "runtime registry reissue or recipient binding is invalid.");
  const returnPlan = readJson(safeChild(root, "return-plan-baseline-seq1-attempt1.json"), "runtime return plan");
  assert(returnPlan.authority?.handoff?.opaqueHandoffId === idsValue.handoffId
    && returnPlan.authority?.handoff?.deliverySequence === 1
    && returnPlan.component?.sequence === 1 && returnPlan.component?.attempt === 1,
  "runtime return plan handoff identity is invalid.");
  assert(returnPlan.component?.inputStaging?.sha256 === inputHash, "runtime return plan input-staging hash is invalid.");
  assert(returnPlan.authority?.progress?.ledgerPath === `${idsValue.progressRoot}/role-return-progress.jsonl`
    && returnPlan.authority?.progress?.checkpointProofDirectory === `${idsValue.progressRoot}/checkpoint-proofs`,
  "runtime return plan does not bind the external progress root.");
  const returnPlanText = JSON.stringify(returnPlan);
  assert(!returnPlanText.includes("coordinatorReissueOrdinal") && !returnPlanText.includes("reissueOrdinal"),
    "runtime return plan includes the coordinator-only reissue ordinal.");
  const authority = readJson(safeChild(root, "runtime-authority-baseline-delivery-1.json"), "runtime authority");
  assert(authority.coordinatorReissue?.ordinal === 2 && authority.activationId === idsValue.activationId,
    "runtime authority reissue binding is invalid.");
  assert(authority.actualRoleHomeCopy === false && authority.actualRoleLaunch === false && authority.actualImplementation === false,
    "runtime authority claims an unauthorized role side effect.");
  const receipt = readJson(safeChild(root, "activation-receipt.json"), "activation receipt");
  assert(receipt.ownerApprovalRecordedAt === approvedAt && receipt.coordinatorReissue?.ordinal === 2,
    "activation receipt timestamp or reissue ordinal is invalid.");
  const outputPaths = receipt.outputs.map((entry) => entry.relativePath);
  exactStringSet(outputPaths, expected.filter((entry) => entry !== "activation-receipt.json"), "activation receipt output inventory");
  assert(receipt.result?.roleHomeCreated === false && receipt.result?.roleDelivered === false
    && receipt.result?.roleLaunched === false && receipt.result?.siteCreatedOrMutated === false
    && receipt.result?.lifecycleMutated === false && receipt.result?.p11Changed === false,
  "activation receipt claims an unauthorized side effect.");
  assert(receipt.coordinatorReissue?.quarantineRecord?.sha256 === quarantine.sha256,
    "activation receipt does not bind the quarantine record.");
  assert(receipt.externalProgress?.initialState === "empty-root-no-progress-artifacts"
    && receipt.externalProgress?.root === idsValue.progressRoot,
  "activation receipt external-progress initial state is invalid.");
  validateConcreteReturnPlan(root, idsValue);
}
function validatePublishedQuarantine(root, quarantine, approvedAt) {
  const files = listFiles(root);
  assert(files.length === 1 && files[0].relativePath === "delivery-1-quarantine.json" && files[0].sha256 === quarantine.sha256,
    "published quarantine inventory or hash is invalid.");
  const value = readJson(safeChild(root, "delivery-1-quarantine.json"), "published quarantine record");
  assert(value.recordState === "finalized" && value.ownerApproved === true && value.ownerApprovedAt === approvedAt,
    "published quarantine finalization state is invalid.");
  assert(value.sourceDelivery?.archive?.disposition === "quarantined"
    && value.sourceDelivery?.archive?.applicationState === "not-applied"
    && value.peerReachStatement?.verificationStatus === PEER_REACH_STATUS
    && value.atimeForensicRoute?.source === "known" && value.atimeForensicRoute?.state === "overwritten-by-audit"
    && value.r5KnownIssue?.classification === "R5-known-issue",
  "published quarantine binding is invalid.");
}
function assertOwnedPublishedActivation(root, release, idsValue, quarantine) {
  const files = listFiles(root);
  exactStringSet(files.map((entry) => entry.relativePath), expectedActivationFiles(idsValue, release), "published activation ownership inventory");
  const receipt = readJson(safeChild(root, "activation-receipt.json"), "published activation receipt");
  const authority = readJson(safeChild(root, "runtime-authority-baseline-delivery-1.json"), "published runtime authority");
  assert(receipt.activationId === idsValue.activationId && receipt.outputRoot === idsValue.activationRoot
    && receipt.coordinatorReissue?.quarantineRecord?.sha256 === quarantine.sha256
    && authority.activationId === idsValue.activationId && authority.coordinatorReissue?.ordinal === 2,
  "published activation is not provably owned by this finalizer.");
}
function removeOwnedPublishedActivation(root, release, idsValue, quarantine) {
  if (!existsSync(root)) return;
  assertOwnedPublishedActivation(root, release, idsValue, quarantine);
  removeOwnedTree(root, "published activation");
}
function stageRoot(finalRoot) {
  const parent = dirname(finalRoot);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const stage = join(parent, `.${basename(finalRoot)}.stage-${randomUUID()}`);
  assertAbsent(stage, "unpublished stage root");
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  return stage;
}
function removeOwnedStage(stage, finalRoot) {
  if (!existsSync(stage)) return;
  const parent = resolve(dirname(finalRoot));
  const route = relative(parent, resolve(stage));
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\") && basename(stage).startsWith(`.${basename(finalRoot)}.stage-`),
    "refusing to remove a path outside the finalizer-owned stage root.");
  removeOwnedTree(stage, "unpublished stage");
}
function publishStage(stage, finalRoot, label) {
  assertAbsent(finalRoot, `${label} output root immediately before atomic publication`);
  renameSync(stage, finalRoot);
}
function dryRunResult(candidate, idsValue, bundle, quarantine, approvedAt) {
  return {
    status: "validated-dry-run",
    externalWritesPerformed: false,
    generatedAt: approvedAt,
    candidateDesignSha256: sha256(readRegular(DESIGN_PATH, "candidate design")),
    candidateSha256: stableHash(candidate),
    identifiers: idsValue,
    quarantine: { root: idsValue.quarantineRoot, file: "delivery-1-quarantine.json", sha256: quarantine.sha256 },
    activation: {
      root: idsValue.activationRoot,
      regularFileCount: 21,
      protocolSha256: bundle.bindings.protocolSha256,
      registrySha256: bundle.bindings.registrySha256,
      packetManifestSha256: bundle.bindings.packetManifestSha256,
      returnPlanSha256: bundle.bindings.returnPlanSha256,
      inputStagingSha256: bundle.bindings.inputStagingSha256,
    },
    progress: {
      root: idsValue.progressRoot,
      plannedEntries: [],
      forbiddenAtPublication: ["role-return-progress.jsonl", "checkpoint-proofs", "role-return-progress.lock"],
    },
    prohibitedActions: {
      roleHomeCreated: false,
      roleDelivery: false,
      roleLaunch: false,
      implementation: false,
      returnApply: false,
      lifecycleMutation: false,
      siteMutation: false,
      browserOrFigmaMeasurement: false,
      p11Mutation: false,
    },
  };
}
function assertWorkspaceDryRunStage(stage) {
  const workspaceRoot = resolve(HERE, "..");
  const dryRunRoot = join(workspaceRoot, "r4-baseline-reissue-dry-run-output");
  const route = relative(workspaceRoot, resolve(stage));
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\")
    && basename(stage).startsWith(`.${basename(dryRunRoot)}.stage-`),
  "dry-run worker stage is outside the finalizer-owned workspace root.");
  assertRealDirectory(stage, "dry-run worker stage");
  assert(readdirSync(stage).length === 0, "dry-run worker stage must be empty before construction.");
}
function internalDryRun(stage) {
  assertWorkspaceDryRunStage(stage);
  const { candidate } = loadCandidate();
  const idsValue = ids(candidate);
  assertAbsent(idsValue.quarantineRoot, "quarantine output root");
  assertAbsent(idsValue.activationRoot, "activation output root");
  assertAbsent(idsValue.progressRoot, "external progress output root");
  const templates = sourceTemplates();
  const release = releaseFiles(candidate);
  const approvedAt = new Date().toISOString();
  const quarantine = prepareQuarantine(candidate, idsValue, approvedAt);
  const bundle = buildActivation(stage, templates, release, idsValue, approvedAt, quarantine);
  validateActivation(stage, release, idsValue, approvedAt, quarantine);
  return dryRunResult(candidate, idsValue, bundle, quarantine, approvedAt);
}
function dryRun() {
  const workspaceRoot = resolve(HERE, "..");
  const dryRunRoot = join(workspaceRoot, "r4-baseline-reissue-dry-run-output");
  const stage = stageRoot(dryRunRoot);
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH, "--internal-dry-run", stage], { encoding: "utf8", windowsHide: true });
    const result = JSON.parse(stdout);
    assert(result?.status === "validated-dry-run" && result?.externalWritesPerformed === false,
      "dry-run worker did not report a validated read-only result.");
    return result;
  } finally {
    removeOwnedStage(stage, dryRunRoot);
  }
}
function apply(candidate, idsValue, templates, release, quarantine, approvedAt) {
  const quarantineStage = stageRoot(idsValue.quarantineRoot);
  let activationStage;
  let progressStage;
  let progressPublished = false;
  let activationPublished = false;
  try {
    writeRelative(quarantineStage, "delivery-1-quarantine.json", quarantine.bytes);
    const quarantineFiles = listFiles(quarantineStage);
    assert(quarantineFiles.length === 1 && quarantineFiles[0].relativePath === "delivery-1-quarantine.json"
      && quarantineFiles[0].sha256 === quarantine.sha256, "quarantine stage inventory is invalid.");
    publishStage(quarantineStage, idsValue.quarantineRoot, "quarantine");
    validatePublishedQuarantine(idsValue.quarantineRoot, quarantine, approvedAt);
    activationStage = stageRoot(idsValue.activationRoot);
    buildActivation(activationStage, templates, release, idsValue, approvedAt, quarantine);
    validateActivation(activationStage, release, idsValue, approvedAt, quarantine);
    progressStage = stageRoot(idsValue.progressRoot);
    validateProgress(progressStage);
    publishStage(progressStage, idsValue.progressRoot, "external progress");
    progressPublished = true;
    validateProgress(idsValue.progressRoot);
    publishStage(activationStage, idsValue.activationRoot, "activation");
    activationPublished = true;
    validateActivation(idsValue.activationRoot, release, idsValue, approvedAt, quarantine);
    validatePublishedQuarantine(idsValue.quarantineRoot, quarantine, approvedAt);
    const revalidatedCandidate = loadCandidate().candidate;
    assert(stableHash(revalidatedCandidate) === stableHash(candidate),
      "immutable candidate inputs changed during append-only publication.");
    return {
      status: "finalized",
      externalWritesPerformed: true,
      generatedAt: approvedAt,
      quarantine: { root: idsValue.quarantineRoot, file: "delivery-1-quarantine.json", sha256: quarantine.sha256 },
      activation: { root: idsValue.activationRoot, regularFileCount: 21 },
      progress: { root: idsValue.progressRoot, entries: [] },
      prohibitedActions: {
        roleHomeCreated: false,
        roleDelivery: false,
        roleLaunch: false,
        implementation: false,
        returnApply: false,
        lifecycleMutation: false,
        siteMutation: false,
        browserOrFigmaMeasurement: false,
        p11Mutation: false,
      },
    };
  } catch (error) {
    try {
      removeOwnedStage(quarantineStage, idsValue.quarantineRoot);
      if (activationPublished) removeOwnedPublishedActivation(idsValue.activationRoot, release, idsValue, quarantine);
      else if (activationStage) removeOwnedStage(activationStage, idsValue.activationRoot);
      if (progressStage) removeOwnedStage(progressStage, idsValue.progressRoot);
      if (progressPublished && existsSync(idsValue.progressRoot)) {
        validateProgress(idsValue.progressRoot);
        removeOwnedTree(idsValue.progressRoot, "published empty external progress root");
      }
    } catch (cleanupError) {
      error.message = `${error.message}; activation/progress cleanup also failed: ${cleanupError.message}`;
    }
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--internal-dry-run") {
    process.stdout.write(`${JSON.stringify(internalDryRun(resolve(args[1])), null, 2)}\n`);
    return;
  }
  const mode = args[0];
  if (args.length !== 1 || !["--dry-run", "--apply"].includes(mode)) {
    fail("Usage: node tools/r4-finalize-baseline-reissue.mjs --dry-run | --apply");
  }
  const { candidate } = loadCandidate();
  const identifiers = ids(candidate);
  assertAbsent(identifiers.quarantineRoot, "quarantine output root");
  assertAbsent(identifiers.activationRoot, "activation output root");
  assertAbsent(identifiers.progressRoot, "external progress output root");
  if (mode === "--dry-run") {
    process.stdout.write(`${JSON.stringify(dryRun(), null, 2)}\n`);
    return;
  }
  const templates = sourceTemplates();
  const release = releaseFiles(candidate);
  const approvedAt = new Date().toISOString();
  const quarantine = prepareQuarantine(candidate, identifiers, approvedAt);
  const result = apply(candidate, identifiers, templates, release, quarantine, approvedAt);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`P3 R4 BASELINE REISSUE FINALIZER: ${error.message}\n`);
  process.exitCode = 1;
}
