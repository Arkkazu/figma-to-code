#!/usr/bin/env node
// R4 same-pair baseline reissue candidate: read-only dry-run only.
//
// This file never writes outside or inside the workspace.  It verifies the
// audited preconditions, derives a non-reused handoff and fresh role-home
// identity in memory, and prints the append-only publication design.  It does
// not create a quarantine record, runtime activation, packet, role home, or
// progress directory.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const WORKSPACE_ROOT = resolve(HERE, "..");
const DESIGN_PATH = resolve(HERE, "r4-baseline-reissue-candidate-design.json");

const PAIR_ID = "open-service-top-hero-v1-20260809";
const CONDITION = "baseline";
const COMPONENT = "open-service-top-hero";
const ATTEMPT = 1;
const RUNTIME_DELIVERY_SEQUENCE = 1;
const COORDINATOR_REISSUE_ORDINAL = 2;
const SOURCE_ACTIVATION_ID = "f8657db3a6c739184e02a6d411efaee3965dea822508791a46eb9914c2b91a6c";
const SOURCE_HANDOFF_ID = "624e2521f5e3f95d3f0ed3d193349b63";

const PILOT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const BASELINE_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const COORDINATOR_ROOT = `${PILOT_ROOT}/.git/p3-coordinator/${PAIR_ID}`;
const SOURCE_ACTIVATION_ROOT = `${COORDINATOR_ROOT}/runtime-activations/v2/${SOURCE_ACTIVATION_ID}`;
const SOURCE_ROLE_HOME = "C:/Users/tane1/AppData/Local/p3-role-homes/a-impl";
const SOURCE_ARCHIVE_PATH = `${SOURCE_ROLE_HOME}/return.ustar.tar`;
const EXTERNAL_PROGRESS_PARENT = "C:/Users/tane1/AppData/Local/p3-coordinator-records/open-service-top-hero-v1-20260809/r4-baseline-reissue/v1";
const PEER_REACH_AUDIT_PATH = "C:/Users/tane1/.codex/attachments/e8f84717-6e28-42ee-9fa8-5d5061bc9262/pasted-text.txt";
const PEER_REACH_VERIFICATION_STATUS = "owner-accepted self-report, not machine-verifiable";

const EXPECTED = Object.freeze({
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  sourceRuntimeAuthority: "a2ae224d9eb45ec03bcf4533207fb0ab733a203f095363f5c037c36fffa998ee",
  sourceActivationReceipt: "dc12154c14cf7b2947b02b6b49e46c4d53150492e5b173d6f814d791b72d984f",
  sourceDeliveryReceipt: "993e890ada453dfbb9f7949c9be98df91e7cbb12a59b07fd012faeb94565f63e",
  sourceReturnPlan: "660fec0e43e16b166476dba851c0cef66e7b55d7cde7d1d8fa4b5584ef84552d",
  sourceArchive: "b9a96b6d68eb7282c65734971e40b8e7d30f8553a41f47cf2aad585695c70018",
  baselineGate: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentGate: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  peerReachAudit: "d832af388f25010d037e07b8e4a7fe8632130b8b8ecf61297a61519848807a99",
});

const RELEASE = Object.freeze([
  {
    id: "return-helper",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-return.mjs",
    releasePath: "helper-release/p3-role-return.mjs",
    sha256: "d9723895c308b3f87f27f7f8cd1e06409a4104ac4b2b5ba1e910d7630b36d2cc",
  },
  {
    id: "return-helper-e2e",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-return.e2e.mjs",
    releasePath: "helper-release/p3-role-return.e2e.mjs",
    sha256: "216cfdafb7221e2e5539c3581ebf82aeb7bc25ec3f7a2e1cec8d3fafaec8b74a",
  },
  {
    id: "return-plan-template",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-return-plan-template.json",
    releasePath: "helper-release/p3-role-return-plan-template.json",
    sha256: "7212cd022b4b5fb5634d14c63d382ad275ee3723a849b60fa6d53576ae77f730",
  },
  {
    id: "return-manifest-template",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-return-manifest-template.json",
    releasePath: "helper-release/p3-role-return-manifest-template.json",
    sha256: "6fb1e5175cb7db9a713adb4a8a5e68acf13b45d88c05885397e71ce52b118361",
  },
  {
    id: "return-feedback-template",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-return-feedback-template.json",
    releasePath: "helper-release/p3-role-return-feedback-template.json",
    sha256: "f63ec9b9b6ebee92b4d17d70fb66d6b976c7c461b3f05c4f5b9d5be824e0f4c9",
  },
  {
    id: "protocol-template",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-handoff-protocol-template.json",
    releasePath: "helper-release/p3-role-handoff-protocol-template.json",
    sha256: "12a6cb01c87b2c0239c78feb2216faf632baf66cee30ba6647e18f646aa96e5b",
  },
  {
    id: "registry-template",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-handoff-registry-template.json",
    releasePath: "helper-release/p3-role-handoff-registry-template.json",
    sha256: "d8bb833bb593a9045bcff4ab0dd2949c5a32ac5d151f5f90646a07b35f377918",
  },
  {
    id: "packet-helper",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-packet.mjs",
    releasePath: "helper-release/p3-role-packet.mjs",
    sha256: "69fc169f186dfd1c8dff69616eac8977900e5de77b8c5734468a96bf4a99af07",
  },
  {
    id: "packet-plan-template",
    sourcePath: "C:/AI/figma-to-code/templates/verify/p3-role-packet-plan-template.json",
    releasePath: "helper-release/p3-role-packet-plan-template.json",
    sha256: "8ca2441d02fd0583e4d596f2ef78123874af6d60efb180be427fb3ed1632dbea",
  },
]);

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value), null, 2)}\n`, "utf8");
}

function posix(path) {
  return resolve(path).replace(/\\/g, "/");
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertRegular(path, label) {
  assert(existsSync(path), `${label} is missing: ${path}`);
  const info = lstatSync(path);
  assert(!info.isSymbolicLink() && info.isFile(), `${label} must be a regular file: ${path}`);
}

function assertDirectory(path, label) {
  assert(existsSync(path), `${label} is missing: ${path}`);
  const info = lstatSync(path);
  assert(!info.isSymbolicLink() && info.isDirectory(), `${label} must be a directory: ${path}`);
}

function readFile(path, label) {
  assertRegular(path, label);
  return readFileSync(path);
}

function fileHash(path, label) {
  return sha256(readFile(path, label));
}

function assertHash(path, expected, label) {
  const actual = fileHash(path, label);
  assert(actual === expected, `${label} SHA-256 changed: expected ${expected}, got ${actual}`);
  return actual;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFile(path, label).toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function isWithin(parent, candidate) {
  const route = relative(resolve(parent), resolve(candidate));
  return route === "" || (!route.startsWith("..") && !isAbsolute(route));
}

function assertOutside(candidate, forbiddenRoots, label) {
  for (const root of forbiddenRoots) {
    assert(!isWithin(root, candidate) && !isWithin(candidate, root), `${label} overlaps forbidden root: ${root}`);
  }
}

function assertAbsent(path, label) {
  assert(!existsSync(path), `${label} must be absent for a fresh append-only candidate: ${path}`);
}

function assertGate(root, expectedHash, condition) {
  const gatePath = `${root}/.figma-gate/active.json`;
  assertHash(gatePath, expectedHash, `${condition} preflight gate`);
  const gate = readJson(gatePath, `${condition} preflight gate`);
  assert(gate.phase === "preflight", `${condition} gate is not at preflight.`);
  assert(Array.isArray(gate.benchmark?.attempts) && gate.benchmark.attempts.length === 0,
    `${condition} gate has consumed a benchmark attempt.`);
  assertAbsent(`${root}/site`, `${condition} site directory`);
  assertAbsent(`${root}/.p3-role-return-recovery`, `${condition} recovery directory`);
}

function assertLedger() {
  const ledgerPath = `${PILOT_ROOT}/.git/figma-p3-comparison-ledger.jsonl`;
  const bytes = readFile(ledgerPath, "pair ledger");
  const actualHash = sha256(bytes);
  assert(actualHash === EXPECTED.ledger, "pair ledger changed after the audited preflight-only state.");
  const records = bytes.toString("utf8").trim().split("\n").map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`pair ledger line ${index + 1} is not JSON: ${error.message}`);
    }
  });
  assert(records.length === 3, "pair ledger must contain only started plus both preflight records.");
  assert(JSON.stringify(records.map((record) => record.kind)) === JSON.stringify(["started", "preflight-recorded", "preflight-recorded"]),
    "pair ledger contains a non-preflight lifecycle event.");
  assert(records.every((record) => record.pairId === PAIR_ID), "pair ledger contains another pair.");
  assert(records[1].condition === "baseline" && records[2].condition === "current",
    "pair ledger does not contain baseline/current preflights in order.");
  return { path: posix(ledgerPath), sha256: actualHash, recordCount: records.length };
}

function assertSourceRuntime() {
  const authorityPath = `${SOURCE_ACTIVATION_ROOT}/runtime-authority-baseline-delivery-1.json`;
  const receiptPath = `${SOURCE_ACTIVATION_ROOT}/activation-receipt.json`;
  const deliveryPath = `${SOURCE_ACTIVATION_ROOT}/delivery-receipts/baseline-implementation-delivery-1-${SOURCE_HANDOFF_ID}.json`;
  const planPath = `${SOURCE_ACTIVATION_ROOT}/return-plan-baseline-seq1-attempt1.json`;
  const progressRoot = `${SOURCE_ACTIVATION_ROOT}/progress`;
  const authorityHash = assertHash(authorityPath, EXPECTED.sourceRuntimeAuthority, "source runtime authority");
  const receiptHash = assertHash(receiptPath, EXPECTED.sourceActivationReceipt, "source activation receipt");
  const deliveryHash = assertHash(deliveryPath, EXPECTED.sourceDeliveryReceipt, "source delivery receipt");
  const planHash = assertHash(planPath, EXPECTED.sourceReturnPlan, "source return plan");
  const authority = readJson(authorityPath, "source runtime authority");
  const delivery = readJson(deliveryPath, "source delivery receipt");
  const plan = readJson(planPath, "source return plan");
  assert(authority.recipient?.opaqueHandoffId === SOURCE_HANDOFF_ID && authority.recipient?.deliverySequence === 1,
    "source runtime authority identity does not match delivery 1.");
  assert(delivery.recipient?.opaqueHandoffId === SOURCE_HANDOFF_ID && delivery.recipient?.deliverySequence === 1,
    "source delivery receipt identity does not match delivery 1.");
  const roleVisiblePacketRelative = delivery.source?.roleVisiblePacketRoot;
  assert(typeof roleVisiblePacketRelative === "string" && roleVisiblePacketRelative.length > 0,
    "source delivery receipt has no declared role-visible packet root.");
  const roleVisiblePacketRoot = resolve(SOURCE_ACTIVATION_ROOT, roleVisiblePacketRelative);
  assert(!isWithin(roleVisiblePacketRoot, deliveryPath),
    "source delivery receipt no longer demonstrates the known role-visible packet-root structural issue.");
  assert(plan.authority?.handoff?.opaqueHandoffId === SOURCE_HANDOFF_ID
    && plan.authority?.handoff?.deliverySequence === 1,
  "source return plan identity does not match delivery 1.");
  assert(plan.authority?.handoff?.deliveryProgress?.initialDeliverySequence === 1
    && plan.authority?.handoff?.deliveryProgress?.increment === 1,
  "source return plan does not preserve per-condition delivery sequence 1 semantics.");
  assertDirectory(progressRoot, "source activation progress root");
  const progressEntries = readdirSync(progressRoot).sort();
  assert(JSON.stringify(progressEntries) === JSON.stringify(["checkpoint-proofs"]),
    "source progress root must contain only an empty checkpoint-proofs directory.");
  const checkpointRoot = `${progressRoot}/checkpoint-proofs`;
  assertDirectory(checkpointRoot, "source checkpoint proof directory");
  assert(readdirSync(checkpointRoot).length === 0, "source checkpoint proof directory is not empty.");
  assertAbsent(`${progressRoot}/role-return-progress.jsonl`, "source progress ledger");
  const archiveHash = assertHash(SOURCE_ARCHIVE_PATH, EXPECTED.sourceArchive, "submitted source archive");
  return {
    activation: { id: SOURCE_ACTIVATION_ID, root: posix(SOURCE_ACTIVATION_ROOT), runtimeAuthoritySha256: authorityHash, receiptSha256: receiptHash },
    delivery: {
      handoffId: SOURCE_HANDOFF_ID,
      receiptSha256: deliveryHash,
      returnPlanSha256: planHash,
      receiptStructuralIssue: {
        roleVisiblePacketRoot: posix(roleVisiblePacketRoot),
        receiptPath: posix(deliveryPath),
        classification: "R5-known-issue",
        reissuePublicationPrerequisite: false,
      },
    },
    sourceArchive: { path: posix(SOURCE_ARCHIVE_PATH), sha256: archiveHash },
    unconsumedAttemptEvidence: {
      sourceProgressLedger: "absent",
      checkpointProofFiles: 0,
      runtimeDeliverySequenceForEmptyProgress: 1,
    },
  };
}

function assertPeerReachAudit() {
  const hash = assertHash(PEER_REACH_AUDIT_PATH, EXPECTED.peerReachAudit, "peer-reach audit source");
  const text = readFile(PEER_REACH_AUDIT_PATH, "peer-reach audit source").toString("utf8");
  const requiredPhrases = [
    PEER_REACH_VERIFICATION_STATUS,
    "唯一存在した法医学的経路は、私の監査読み取りで消えた",
    "receipt の設計欠陥（R5 対象）",
  ];
  for (const phrase of requiredPhrases) {
    assert(text.includes(phrase), `peer-reach audit source is missing the required finding: ${phrase}`);
  }
  return {
    source: { path: posix(PEER_REACH_AUDIT_PATH), sha256: hash },
    peerReachStatement: {
      recordingState: "required-before-append-only-publication",
      verificationStatus: PEER_REACH_VERIFICATION_STATUS,
      meaning: "The reissue record preserves an owner-accepted self-report about contaminated-role reach. It does not turn that statement into a machine conclusion.",
    },
    atimeForensicRoute: {
      source: "known",
      state: "overwritten-by-audit",
      meaning: "The prior access-time route cannot establish access at the delivery-time window after the later audit read.",
    },
  };
}

function assertP11Unchanged() {
  const path = `${COORDINATOR_ROOT}/records/p3-p11-authorization-${PAIR_ID}.json`;
  const hash = assertHash(path, EXPECTED.p11, "P-11 record");
  const value = readJson(path, "P-11 record");
  assert(value.status === "BLOCKED" && value.authorization === "NOT_AUTHORIZED", "P-11 is not preserved as BLOCKED / NOT_AUTHORIZED.");
  return { path: posix(path), sha256: hash, status: value.status, authorization: value.authorization };
}

function assertCurrentRelease() {
  const observed = RELEASE.map((entry) => {
    const actual = assertHash(entry.sourcePath, entry.sha256, `current helper release ${entry.id}`);
    return { id: entry.id, sourcePath: entry.sourcePath, releasePath: entry.releasePath, sha256: actual };
  });
  const helperSource = readFile(RELEASE[0].sourcePath, "current return helper").toString("utf8");
  const requiredAnchors = [
    "function validateConditionLocalDeliveryProgress(value, label)",
    "if (initialDeliverySequence !== 1 || increment !== 1)",
    "function initialProgressExpectation(authority)",
    "deliverySequence: authority.handoff.deliveryProgress.initialDeliverySequence",
  ];
  for (const anchor of requiredAnchors) {
    assert(helperSource.includes(anchor), `current return helper is missing the required delivery-sequence anchor: ${anchor}`);
  }
  return observed;
}

function deriveIdentifiers(source) {
  const seed = {
    schema: "p3-r4-baseline-reissue-seed/v1",
    pairId: PAIR_ID,
    condition: CONDITION,
    component: COMPONENT,
    attempt: ATTEMPT,
    runtimeDeliverySequence: RUNTIME_DELIVERY_SEQUENCE,
    coordinatorReissueOrdinal: COORDINATOR_REISSUE_ORDINAL,
    sourceActivationId: SOURCE_ACTIVATION_ID,
    sourceHandoffId: SOURCE_HANDOFF_ID,
    sourceRuntimeAuthoritySha256: source.activation.runtimeAuthoritySha256,
    sourceDeliveryReceiptSha256: source.delivery.receiptSha256,
    sourceReturnPlanSha256: source.delivery.returnPlanSha256,
    sourceArchiveSha256: source.sourceArchive.sha256,
    peerReachAuditSha256: source.peerReachAudit.source.sha256,
    peerReachVerificationStatus: source.peerReachAudit.peerReachStatement.verificationStatus,
    returnHelperSha256: RELEASE[0].sha256,
    returnHelperE2ESha256: RELEASE[1].sha256,
  };
  const seedHash = sha256(canonicalBytes(seed));
  const opaqueHandoffId = sha256(Buffer.from(`p3-r4-baseline-reissue-handoff\0${seedHash}`, "utf8")).slice(0, 32);
  const helperReleaseId = sha256(Buffer.from(`p3-r4-baseline-reissue-helper-release\0${seedHash}`, "utf8"));
  const activationId = sha256(Buffer.from(`p3-r4-baseline-reissue-activation\0${seedHash}\0${opaqueHandoffId}`, "utf8"));
  const quarantineId = sha256(Buffer.from(`p3-r4-baseline-reissue-quarantine\0${source.delivery.receiptSha256}\0${source.sourceArchive.sha256}`, "utf8"));
  return { seedHash, opaqueHandoffId, helperReleaseId, activationId, quarantineId };
}

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") {
    fail("Usage: node tools/r4-baseline-reissue-candidate-dry-run.mjs --dry-run");
  }

  const designBytes = readFile(DESIGN_PATH, "candidate design");
  const design = readJson(DESIGN_PATH, "candidate design");
  assert(design.schema === "p3-r4-baseline-reissue-design/v1" && design.status === "draft-not-a-record",
    "candidate design is not a draft-only R4 reissue design.");
  assert(design.execution?.externalWrites === false && design.execution?.ownerApprovedFinalRecord === false,
    "candidate design permits an external write or owner-approved final record.");
  assert(design.identitySeparation?.runtimeDeliverySequence === 1
    && design.identitySeparation?.coordinatorReissueOrdinal === 2,
  "candidate design does not keep runtime delivery sequence and coordinator reissue ordinal separate.");
  assert(design.sourceArchivePolicy?.mayBeRoleInput === false
    && design.sourceArchivePolicy?.mayBeApplied === false
    && design.sourceArchivePolicy?.mayBeCopiedIntoNewPacket === false,
  "candidate design permits submitted-archive reuse.");
  assert(design.sourceArchivePolicy?.deliverySequence === 1
    && design.sourceArchivePolicy?.candidateDisposition === "quarantined"
    && design.sourceArchivePolicy?.candidateApplicationState === "not-applied"
    && design.sourceArchivePolicy?.archiveSha256 === EXPECTED.sourceArchive,
  "candidate design does not record delivery 1 as quarantined / not-applied with its source archive hash.");
  assert(design.peerReachStatement?.verificationStatus === PEER_REACH_VERIFICATION_STATUS,
    "candidate design does not retain the exact owner-accepted peer-reach status.");
  assert(design.atimeForensicRoute?.source === "known" && design.atimeForensicRoute?.state === "overwritten-by-audit",
    "candidate design does not preserve the overwritten atime forensic route.");
  assert(design.r5KnownIssue?.classification === "R5-known-issue"
    && design.r5KnownIssue?.reissuePublicationPrerequisite === false,
  "candidate design does not classify the receipt structural defect as an R5 known issue.");
  assert(design.runtimeReleasePolicy?.currentHelperAuditBinding?.status === "PASS"
    && design.runtimeReleasePolicy?.currentHelperAuditBinding?.returnHelperSha256 === RELEASE[0].sha256
    && design.runtimeReleasePolicy?.currentHelperAuditBinding?.returnHelperE2ESha256 === RELEASE[1].sha256,
  "candidate design does not bind the already-PASS current helper audit.");

  const ledger = assertLedger();
  assertGate(BASELINE_ROOT, EXPECTED.baselineGate, "baseline");
  assertGate(CURRENT_ROOT, EXPECTED.currentGate, "current");
  const source = assertSourceRuntime();
  const peerReachAudit = assertPeerReachAudit();
  source.peerReachAudit = peerReachAudit;
  const p11 = assertP11Unchanged();
  const helperRelease = assertCurrentRelease();
  const identifiers = deriveIdentifiers(source);

  const candidateActivationRoot = `${COORDINATOR_ROOT}/runtime-activations/v2/${identifiers.activationId}`;
  const candidateReleaseRoot = `${candidateActivationRoot}/helper-release`;
  const candidateProgressRoot = `${EXTERNAL_PROGRESS_PARENT}/${identifiers.activationId}/progress`;
  const candidateProgressLedger = `${candidateProgressRoot}/role-return-progress.jsonl`;
  const candidateCheckpointProofDirectory = `${candidateProgressRoot}/checkpoint-proofs`;
  const candidateRoleHome = `C:/Users/tane1/AppData/Local/p3-role-homes/a-impl-r4-reissue-2-${identifiers.opaqueHandoffId}`;
  const quarantineRoot = `${COORDINATOR_ROOT}/quarantines/v1/${identifiers.quarantineId}`;

  for (const [path, label] of [
    [candidateActivationRoot, "candidate activation root"],
    [candidateProgressRoot, "candidate external progress root"],
    [candidateRoleHome, "candidate fresh role home"],
    [quarantineRoot, "candidate quarantine root"],
  ]) assertAbsent(path, label);

  const forbiddenProgressRoots = [
    BASELINE_ROOT,
    CURRENT_ROOT,
    `${PILOT_ROOT}/.git`,
    SOURCE_ACTIVATION_ROOT,
    candidateActivationRoot,
    SOURCE_ROLE_HOME,
    candidateRoleHome,
  ];
  assertOutside(candidateProgressRoot, forbiddenProgressRoots, "candidate external progress root");
  assertOutside(candidateCheckpointProofDirectory, forbiddenProgressRoots, "candidate checkpoint proof directory");
  assertOutside(candidateProgressLedger, forbiddenProgressRoots, "candidate progress ledger");

  const candidate = {
    schema: "p3-r4-baseline-reissue-candidate/v1",
    status: "dry-run-pass-not-published",
    ownerApproval: "not-created",
    pair: {
      pairId: PAIR_ID,
      condition: CONDITION,
      component: COMPONENT,
      attempt: ATTEMPT,
      preflightLedger: ledger,
      p11,
    },
    sourceDelivery: {
      activation: source.activation,
      delivery: source.delivery,
      archive: {
        ...source.sourceArchive,
        deliverySequence: 1,
        candidateDisposition: "quarantined",
        candidateApplicationState: "not-applied",
        mayBeRoleInput: false,
        mayBeApplied: false,
      },
      peerReachAudit,
      unconsumedAttemptEvidence: source.unconsumedAttemptEvidence,
    },
    reissueIdentity: {
      coordinatorReissueOrdinal: COORDINATOR_REISSUE_ORDINAL,
      runtimeDeliverySequence: RUNTIME_DELIVERY_SEQUENCE,
      opaqueHandoffId: identifiers.opaqueHandoffId,
      freshRoleHome: candidateRoleHome,
      sourceHandoffId: SOURCE_HANDOFF_ID,
      sourceHandoffMayNotBeReused: true,
    },
    helperRelease: {
      releaseId: identifiers.helperReleaseId,
      root: candidateReleaseRoot,
      publication: "would-copy-byte-identically-after-owner-approval",
      entries: helperRelease,
      currentHelperAuditBinding: {
        status: "PASS",
        bindingAction: "copy-the-existing-PASS-binding-into-the-new-activation",
        returnHelperSha256: RELEASE[0].sha256,
        returnHelperE2ESha256: RELEASE[1].sha256,
        assertions: [
          "empty progress keeps sequence 1 / attempt 1 / deliverySequence 1",
          "Windows path handling does not relax create-target or site-prefix checks",
          "existing E2E assertions remain present",
        ],
      },
      futureReturnValidationAndApplyHelper: `${candidateReleaseRoot}/p3-role-return.mjs`,
    },
    runtimeActivation: {
      activationId: identifiers.activationId,
      root: candidateActivationRoot,
      publication: "append-only-not-created",
      mustBind: [
        "new finalized baseline protocol v2 for the new opaque handoff",
        "new condition-local baseline registry with runtime deliverySequence 1",
        "new packet plan and packet manifest with the new opaque handoff",
        "new return plan for sequence 1 / attempt 1 with external progress paths",
        "the byte-pinned helper release above",
        "the existing PASS helper-audit binding for d972/216",
      ],
      mustNotBind: [
        "source return archive as packet input or apply candidate",
        "source opaque handoffId as a reusable recipient identity",
        "deliverySequence 2",
      ],
    },
    externalProgress: {
      root: candidateProgressRoot,
      ledgerPath: candidateProgressLedger,
      checkpointProofDirectory: candidateCheckpointProofDirectory,
      stateAtPublication: "must-be-absent-and-empty-before-first-apply",
      isExternalToRuntimeAndRoleHomes: true,
    },
    quarantine: {
      quarantineId: identifiers.quarantineId,
      root: quarantineRoot,
      publication: "append-only-not-created",
      requiredRecord: "delivery-1-quarantine.json",
      delivery1: {
        deliveryReceiptSha256: source.delivery.receiptSha256,
        archiveSha256: source.sourceArchive.sha256,
        disposition: "quarantined",
        applicationState: "not-applied",
        excludedFromNewRoleInputs: true,
        reason: "attachment-only contract violation self-report",
      },
    },
    r5KnownIssue: source.delivery.receiptStructuralIssue,
    prohibitedByThisDryRun: [
      "external writes",
      "quarantine or activation publication",
      "ownerApproved final records",
      "role delivery or launch",
      "implementation or return apply",
      "worktree, site, lifecycle, browser, Figma, or P-11 mutation",
      "submitted archive reuse",
    ],
    remainingOwnerGates: [
      {
        id: "peer-reach-owner-attestation",
        requiredRecord: "Record the owner-accepted self-report about contaminated-role reach with the exact verificationStatus carried above.",
        verificationStatus: PEER_REACH_VERIFICATION_STATUS,
        consequenceIfStatementReportsCurrentConditionReach: "Reject this same-pair candidate and reset the pair with the required re-approvals.",
      },
      {
        id: "publish-reissue-records",
        requiredApproval: "Approve only append-only publication of the quarantine record, byte-pinned helper release, and new runtime activation; no delivery, launch, implementation, apply, lifecycle, browser/Figma, or P-11 authority is included.",
      },
      {
        id: "future-fresh-role-observation",
        requiredFact: "Before any later launch, observe a newly created role context and role home receiving only that reissue's four attachments.",
      },
    ],
  };
  const candidateText = JSON.stringify(candidate).toLowerCase();
  const prohibitedPhrases = [
    ["con", "firmed"].join(""),
    ["veri", "fied"].join(""),
    ["no peer", " disclosure"].join(""),
  ];
  for (const prohibitedPhrase of prohibitedPhrases) {
    assert(!candidateText.includes(prohibitedPhrase), `candidate record wording contains prohibited assertion wording: ${prohibitedPhrase}`);
  }
  const candidateBytes = canonicalBytes(candidate);
  process.stdout.write(`${JSON.stringify({
    result: "PASS",
    mode: "read-only-dry-run",
    externalWritesPerformed: false,
    design: { path: posix(DESIGN_PATH), sha256: sha256(designBytes) },
    candidate: { ...candidate, sha256: sha256(candidateBytes) },
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`R4 BASELINE REISSUE CANDIDATE DRY-RUN: ${error.message}\n`);
  process.exitCode = 1;
}
