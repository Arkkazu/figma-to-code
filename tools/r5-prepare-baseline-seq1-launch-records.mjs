#!/usr/bin/env node
// P-3 R5 baseline sequence 1 launch-record preparation.
//
// --dry-run reads only. --apply may publish one append-only coordinator-only
// pre-launch authorization record, but never creates a role context, launches
// a role, changes either worktree, or changes P-11.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const CONDITION = "baseline";
const ACTIVATION_ID = "bb3077e21473ce4664e353cadc8e4fda44df87da6be9bf3839f4af818ab42165";
const HANDOFF_ID = "f92bcaa29c39e52eb6d5044638b41101";
const DELIVERY_SEQUENCE = 1;
const PROTOCOL_SHA256 = "2cb05ebec90d7fefdf28cf51be8fb93e277e0bc7cec1a67ebcd458e1c686b342";
const ACTIVATION_ROOT = `C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/${PAIR_ID}/runtime-activations/v2/${ACTIVATION_ID}`;
const DELIVERY_RECEIPT_PATH = `${ACTIVATION_ROOT}/delivery-receipts/baseline-implementation-delivery-1-${HANDOFF_ID}.json`;
const DELIVERY_RECEIPT_SHA256 = "24574bae74a4d86df62c188237db228457dc2f91b3a052f8238487d813bfedf2";
const ROLE_HOME = `C:/Users/tane1/AppData/Local/p3-role-homes/a-impl-r4-reissue-2-${HANDOFF_ID}`;
const BASELINE_RETURN_PLAN_SHA256 = "d331e86063218097ec3678a56343e195de60e17b1d325f0cb1060ff8ec2e1392";
const RETURN_HELPER_PATH = `${ACTIVATION_ROOT}/helper-release/p3-role-return.mjs`;
const RETURN_HELPER_SHA256 = "d9723895c308b3f87f27f7f8cd1e06409a4104ac4b2b5ba1e910d7630b36d2cc";
const RETURN_E2E_PATH = `${ACTIVATION_ROOT}/helper-release/p3-role-return.e2e.mjs`;
const RETURN_E2E_SHA256 = "216cfdafb7221e2e5539c3581ebf82aeb7bc25ec3f7a2e1cec8d3fafaec8b74a";
const RETURN_E2E_RECEIPT_PATH = "C:/AI/figma-to-code/tools/r5-return-helper-e2e-evidence-d9723895.json";
const RETURN_E2E_RECEIPT_SHA256 = "22584e4f6eea6454b318b1f57b4e76e97156845938879f098f97b83f35241e90";
const CURRENT_CONDITION = "current";
const CURRENT_ACTIVATION_ID = "f06ba96a83153efac0d2b0e8f7e00a5548d747a36fccabf75787a05273d66375";
const CURRENT_HANDOFF_ID = "b3f41c2108d65cf6c6ae7767b6e797d1";
const CURRENT_ACTIVATION_ROOT = `C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/${PAIR_ID}/runtime-activations/v2/${CURRENT_ACTIVATION_ID}`;
const CURRENT_AUTHORIZATION_RECEIPT_PATH = `${CURRENT_ACTIVATION_ROOT}/delivery-receipts/current-implementation-delivery-authorization-1-${CURRENT_HANDOFF_ID}.json`;
const CURRENT_AUTHORIZATION_RECEIPT_SHA256 = "c39975d3eec7065f71645d3671b3afbae6188f1e94c3f0f3f369695d7bc085df";
const CURRENT_COMPLETION_RECEIPT_PATH = `${CURRENT_ACTIVATION_ROOT}/delivery-receipts/current-implementation-delivery-1-${CURRENT_HANDOFF_ID}.json`;
const CURRENT_COMPLETION_RECEIPT_SHA256 = "8450699e10cb18ad4068d72f657ef3c6e5c53a6c131629d0700fb528ad3de4c4";
const CURRENT_ROLE_HOME = `C:/Users/tane1/AppData/Local/p3-role-homes/b-impl-r4-reissue-2-${CURRENT_HANDOFF_ID}`;
const BASELINE_WORKTREE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT_WORKTREE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const EXTERNAL_COORDINATOR_RECORDS_ROOT = `C:/Users/tane1/AppData/Local/p3-coordinator-records/${PAIR_ID}`;
const R5_PRELAUNCH_RECORDS_PARENT = `${EXTERNAL_COORDINATOR_RECORDS_ROOT}/r5-baseline-seq1-prelaunch/v1`;
const PRELAUNCH_RECORD_FILE = "baseline-seq1-prelaunch-authorization.json";
const OWNER_ATTESTATION_SOURCE = Object.freeze({
  kind: "user-message",
  date: "2026-08-15",
  contentHash: "not-available",
  description: "owner-supplied expanded baseline/current seq1 role context attestation/audit",
});
const OWNER_ATTESTATION_CLASSIFICATION = "owner-attested, not machine-verifiable";
const OWNER_FACT_REQUIRED = "baseline/current seq1 の人間・runtime contextに関する事実は、owner-attested, not machine-verifiable としてのみ扱う。";
const R5_SCOPE = Object.freeze({
  pairReadiness: false,
  pairBegin: false,
  pairPreflight: false,
  rolePacket: false,
  roleHomeCopy: false,
  roleDelivery: false,
  roleLaunch: true,
  implementation: false,
  returnApply: false,
  siteMutation: false,
  lifecycleMutation: false,
  browserMeasurement: false,
  figmaMeasurement: false,
  p11Mutation: false,
});

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function exact(left, right, label) { assert(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)), `${label} is not exact.`); }
function posix(path) { return resolve(path).replace(/\\/g, "/"); }
function isWithin(parent, child) { const route = relative(resolve(parent), resolve(child)); return route === "" || (!route.startsWith("..") && !isAbsolute(route)); }
function assertRegular(path, label) { assert(existsSync(path), `${label} is missing: ${posix(path)}`); const stat = lstatSync(path); assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular file.`); return stat; }
function assertDirectory(path, label) { assert(existsSync(path), `${label} is missing: ${posix(path)}`); const stat = lstatSync(path); assert(stat.isDirectory() && !stat.isSymbolicLink(), `${label} must be a real directory.`); return stat; }
function assertAbsent(path, label) { assert(!existsSync(path), `${label} must be absent: ${posix(path)}`); }
function readRegular(path, label) { assertRegular(path, label); return readFileSync(path); }
function readJson(path, label) { try { return JSON.parse(readRegular(path, label).toString("utf8")); } catch (error) { fail(`${label} is invalid JSON: ${error.message}`); } }
function fileReference(path, label) { const bytes = readRegular(path, label); return { path: posix(path), sha256: sha256(bytes), bytes: bytes.length }; }
function referenceWithinRoot(root, reference, label) {
  assert(reference && typeof reference.path === "string" && /^[a-f0-9]{64}$/.test(reference.sha256), `${label} reference is invalid.`);
  assert(!isAbsolute(reference.path), `${label} path must be activation-root-relative.`);
  const path = resolve(root, reference.path);
  assert(isWithin(root, path), `${label} escapes its activation root.`);
  const actual = fileReference(path, label);
  assert(actual.sha256 === reference.sha256, `${label} SHA-256 changed.`);
  return { path: actual.path, sha256: actual.sha256 };
}
function listFiles(root) {
  const output = [];
  function visit(directory, prefix = "") {
    assertDirectory(directory, "tree directory");
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const full = join(directory, entry.name); const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name; const stat = lstatSync(full);
      assert(!stat.isSymbolicLink(), `tree contains a symbolic link: ${logicalPath}`);
      if (stat.isDirectory()) visit(full, logicalPath);
      else { assert(stat.isFile(), `tree contains a non-regular entry: ${logicalPath}`); output.push({ logicalPath, sha256: sha256(readFileSync(full)), bytes: stat.size }); }
    }
  }
  visit(root);
  return output;
}
function normalizedAttachments(entries) {
  return entries.map(({ logicalPath, sha256: digest, bytes }) => ({ logicalPath, sha256: digest, bytes })).sort((left, right) => left.logicalPath.localeCompare(right.logicalPath, "en"));
}
function normalizedAttachmentHashes(entries) {
  return entries.map(({ logicalPath, sha256: digest }) => ({ logicalPath, sha256: digest })).sort((left, right) => left.logicalPath.localeCompare(right.logicalPath, "en"));
}
function compareAttachmentInventories(baseline, current) {
  const baselineAttachments = normalizedAttachments(baseline.roleHome.attachments);
  const currentAttachments = normalizedAttachments(current.roleHome.attachments);
  assert(baselineAttachments.length === 4 && currentAttachments.length === 4, "both delivered role homes must contain exactly four attachments.");
  const baselineByPath = new Map(baselineAttachments.map((entry) => [entry.logicalPath, entry]));
  const currentByPath = new Map(currentAttachments.map((entry) => [entry.logicalPath, entry]));
  const paths = [...new Set([...baselineByPath.keys(), ...currentByPath.keys()])].sort((left, right) => left.localeCompare(right, "en"));
  const same = [];
  const changed = [];
  const baselineOnly = [];
  const currentOnly = [];
  for (const logicalPath of paths) {
    const baselineEntry = baselineByPath.get(logicalPath);
    const currentEntry = currentByPath.get(logicalPath);
    if (!baselineEntry) { currentOnly.push(currentEntry); continue; }
    if (!currentEntry) { baselineOnly.push(baselineEntry); continue; }
    if (baselineEntry.sha256 === currentEntry.sha256 && baselineEntry.bytes === currentEntry.bytes) same.push({ logicalPath, sha256: baselineEntry.sha256, bytes: baselineEntry.bytes });
    else changed.push({ logicalPath, baseline: baselineEntry, current: currentEntry });
  }
  assert(baselineOnly.length === 0 && currentOnly.length === 0, "baseline/current role-home attachment paths differ.");
  return {
    verificationStatus: "machine-verified",
    method: "delivered role-home regular-file inventory; logicalPath, SHA-256, and byte length",
    baseline: { roleHome: baseline.roleHome.path, attachments: baselineAttachments },
    current: { roleHome: current.roleHome.path, attachments: currentAttachments },
    summary: {
      commonLogicalPathCount: paths.length,
      sameByteAndSha256: same,
      differentByteOrSha256: changed,
      baselineOnly,
      currentOnly,
    },
  };
}
function readPinnedReturnHelperE2EReceipt() {
  const helper = fileReference(RETURN_HELPER_PATH, "pinned p3-role-return helper");
  const e2e = fileReference(RETURN_E2E_PATH, "pinned p3-role-return E2E harness");
  assert(helper.sha256 === RETURN_HELPER_SHA256, "pinned p3-role-return helper SHA-256 changed.");
  assert(e2e.sha256 === RETURN_E2E_SHA256, "pinned p3-role-return E2E harness SHA-256 changed.");
  const e2eSource = readRegular(RETURN_E2E_PATH, "pinned p3-role-return E2E harness").toString("utf8");
  assert(e2eSource.includes('resolve(templateDirectory, "p3-role-return.mjs")'), "pinned p3-role-return E2E harness does not resolve its colocated helper.");
  const receiptReference = fileReference(RETURN_E2E_RECEIPT_PATH, "durable pinned p3-role-return E2E receipt");
  assert(receiptReference.sha256 === RETURN_E2E_RECEIPT_SHA256, "durable pinned p3-role-return E2E receipt SHA-256 changed.");
  const receipt = readJson(RETURN_E2E_RECEIPT_PATH, "durable pinned p3-role-return E2E receipt");
  assert(receipt.schema === "p3-r5-return-helper-e2e-evidence/v1" && receipt.recordState === "observed" && receipt.scope === "isolated fixture verification only", "durable pinned p3-role-return E2E receipt state changed.");
  assert(receipt.test?.command === "node C:\\AI\\figma-to-code\\templates\\verify\\p3-role-return.e2e.mjs" && receipt.test?.exitCode === 0 && receipt.test?.stdout === "p3-role-return E2E PASS" && receipt.test?.wallClockSeconds === 360.7 && receipt.test?.processCompletionTimestamp === "not-captured", "durable pinned p3-role-return E2E test result changed.");
  exact(receipt.postRunReleaseHashObservation?.helper, { path: "research/p3/p3-role-return.mjs", sha256: helper.sha256 }, "durable pinned p3-role-return E2E receipt helper");
  exact(receipt.postRunReleaseHashObservation?.e2e, { path: "research/p3/p3-role-return.e2e.mjs", sha256: e2e.sha256 }, "durable pinned p3-role-return E2E receipt harness");
  assert(typeof receipt.postRunReleaseHashObservation?.observedAt === "string" && !Number.isNaN(Date.parse(receipt.postRunReleaseHashObservation.observedAt)), "durable pinned p3-role-return E2E receipt observation time is invalid.");
  exact(receipt.fixtureBoundary, { temporaryFixtureRoot: "%TEMP%/p3-role-return-e2e-*", liveActivationMutation: false, roleHomeMutation: false, siteMutation: false, lifecycleMutation: false, p11Mutation: false }, "durable pinned p3-role-return E2E receipt fixture boundary");
  return {
    verificationStatus: "machine-auditable durable execution evidence",
    result: "PASS",
    evidenceReceipt: { path: receiptReference.path, sha256: receiptReference.sha256 },
    helper: { path: helper.path, sha256: helper.sha256 },
    harness: { path: e2e.path, sha256: e2e.sha256 },
    test: { command: receipt.test.command, exitCode: receipt.test.exitCode, stdout: receipt.test.stdout, wallClockSeconds: receipt.test.wallClockSeconds, processCompletionTimestamp: receipt.test.processCompletionTimestamp },
    postRunReleaseHashObservedAt: receipt.postRunReleaseHashObservation.observedAt,
    fixtureBoundary: receipt.fixtureBoundary,
    resultBinding: "must be copied byte-for-byte into any final pre-launch authorization generated from this candidate; a different finalization requires a fresh or separately durable auditable E2E evidence receipt",
  };
}
function immutableSnapshot(references) {
  assert(references && typeof references === "object" && !Array.isArray(references), "baseline immutable input references are invalid.");
  const output = {};
  for (const [id, reference] of Object.entries(references)) {
    assert(reference && typeof reference.path === "string" && /^[a-f0-9]{64}$/.test(reference.sha256), `baseline immutable input ${id} is invalid.`);
    const actual = fileReference(reference.path, `baseline immutable input ${id}`);
    assert(actual.sha256 === reference.sha256, `baseline immutable input changed: ${id}`);
    output[id] = { path: actual.path, sha256: actual.sha256 };
  }
  return output;
}
function validatePublishedBaseline() {
  assertDirectory(ACTIVATION_ROOT, "published baseline activation root");
  const activationReceiptPath = join(ACTIVATION_ROOT, "activation-receipt.json");
  const activationReceipt = readJson(activationReceiptPath, "baseline activation receipt");
  const activationReceiptReference = fileReference(activationReceiptPath, "baseline activation receipt");
  assert(activationReceipt.schema === "p3-r4-runtime-activation-receipt/v2" && activationReceipt.recordState === "finalized" && activationReceipt.activationId === ACTIVATION_ID && activationReceipt.pairId === PAIR_ID && activationReceipt.condition === CONDITION, "baseline activation receipt identity changed.");
  assert(activationReceipt.result?.roleHomeCreated === false && activationReceipt.result?.roleHomeCopied === false && activationReceipt.result?.roleDelivered === false && activationReceipt.result?.roleLaunched === false && activationReceipt.result?.siteCreatedOrMutated === false && activationReceipt.result?.lifecycleMutated === false && activationReceipt.result?.browserOrFigmaMeasurement === false && activationReceipt.result?.p11Changed === false, "baseline activation receipt claims a later side effect.");

  const protocolBaseline = readRegular(join(ACTIVATION_ROOT, "protocol-baseline.json"), "baseline common protocol");
  const protocolCurrent = readRegular(join(ACTIVATION_ROOT, "protocol-current.json"), "current common protocol");
  assert(sha256(protocolBaseline) === PROTOCOL_SHA256 && protocolBaseline.equals(protocolCurrent), "published baseline/common protocol is not the required 2cb byte copy.");

  const runtimeAuthorityPath = join(ACTIVATION_ROOT, "runtime-authority-baseline-delivery-1.json");
  const runtimeAuthority = readJson(runtimeAuthorityPath, "baseline runtime authority");
  const runtimeAuthorityReference = fileReference(runtimeAuthorityPath, "baseline runtime authority");
  assert(runtimeAuthority.schema === "p3-r4-runtime-activation-authority/v2" && runtimeAuthority.recordState === "finalized" && runtimeAuthority.ownerApproved === true && runtimeAuthority.state === "delivery-ready-not-delivered" && runtimeAuthority.condition === CONDITION, "baseline runtime authority state changed.");
  exact(runtimeAuthority.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "baseline runtime authority recipient");
  assert(runtimeAuthority.actualRoleHomeCopy === false && runtimeAuthority.actualRoleLaunch === false && runtimeAuthority.actualImplementation === false && runtimeAuthority.deliveryReceiptRequiredBeforeRoleHomeCopy === true, "baseline runtime authority pre-delivery facts changed.");
  exact(runtimeAuthority.runtimeBindings.protocolBaseline, { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 }, "baseline runtime authority baseline protocol");
  exact(runtimeAuthority.runtimeBindings.protocolCurrent, { path: "protocol-current.json", sha256: PROTOCOL_SHA256 }, "baseline runtime authority current protocol");

  const deliveryReceiptBytes = readRegular(DELIVERY_RECEIPT_PATH, "baseline delivered role receipt");
  assert(sha256(deliveryReceiptBytes) === DELIVERY_RECEIPT_SHA256, "baseline delivery receipt SHA-256 changed.");
  const deliveryReceipt = JSON.parse(deliveryReceiptBytes.toString("utf8"));
  assert(deliveryReceipt.schema === "p3-r4-runtime-delivery-receipt/v2" && deliveryReceipt.recordState === "finalized", "baseline delivery receipt state changed.");
  exact(deliveryReceipt.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION }, "baseline delivery receipt activation");
  exact(deliveryReceipt.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "baseline delivery receipt recipient");
  assert(deliveryReceipt.result?.roleHomeCopied === true && deliveryReceipt.result?.roleDelivered === true && deliveryReceipt.result?.roleLaunched === false && deliveryReceipt.result?.implementation === false && deliveryReceipt.result?.returnApplied === false && deliveryReceipt.result?.siteCreatedOrMutated === false && deliveryReceipt.result?.lifecycleMutated === false && deliveryReceipt.result?.browserOrFigmaMeasurement === false && deliveryReceipt.result?.p11Changed === false, "baseline delivery receipt result changed.");
  assert(deliveryReceipt.freshRoleLaunchObservation?.created === false && deliveryReceipt.freshRoleLaunchObservation?.status === "NOT_OBSERVED", "baseline delivery receipt already claims a role launch observation.");
  assert(deliveryReceipt.authorization?.runtimeAuthority?.sha256 === runtimeAuthorityReference.sha256 && deliveryReceipt.authorization?.activationReceipt?.sha256 === activationReceiptReference.sha256, "baseline delivery receipt authority binding changed.");

  const registryReference = referenceWithinRoot(ACTIVATION_ROOT, deliveryReceipt.authorization?.registry, "baseline delivered registry");
  const packetManifestReference = referenceWithinRoot(ACTIVATION_ROOT, deliveryReceipt.authorization?.packetManifest, "baseline delivered packet manifest");
  const registry = readJson(registryReference.path, "baseline delivered registry");
  const packetManifest = readJson(packetManifestReference.path, "baseline delivered packet manifest");
  const returnPlanPath = join(ACTIVATION_ROOT, "return-plan-baseline-seq1-attempt1.json");
  const returnPlanReference = fileReference(returnPlanPath, "baseline delivered return plan");
  assert(returnPlanReference.sha256 === BASELINE_RETURN_PLAN_SHA256, "baseline delivered return plan SHA-256 changed.");
  const returnPlan = readJson(returnPlanPath, "baseline delivered return plan");
  assert(registry.schema === "p3-role-handoff-registry/v2" && registry.recordState === "finalized" && registry.ownerApproved === true && registry.executionState === false && registry.deliveryMode === "attachment-only", "baseline delivered registry state changed.");
  exact(registry.protocol, { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 }, "baseline delivered registry protocol");
  const registryPacket = Array.isArray(registry.recipientPackets) ? registry.recipientPackets.find((packet) => packet?.opaqueHandoffId === HANDOFF_ID) : undefined;
  assert(registryPacket && registryPacket.roleKind === "implementation" && registryPacket.coordinatorConditionBinding === CONDITION && registryPacket.deliverySequence === DELIVERY_SEQUENCE, "baseline delivered registry recipient binding changed.");
  exact(registryPacket.packetManifest, { path: "packet-manifest-baseline-delivery-1.json", sha256: packetManifestReference.sha256 }, "baseline delivered registry packet manifest");
  assert(packetManifest.version === 3 && packetManifest.kind === "p3-role-packet-manifest" && packetManifest.coordinatorOnly === true, "baseline delivered packet manifest state changed.");
  assert(returnPlan.version === 5 && returnPlan.kind === "p3-role-return-plan" && returnPlan.authority?.pairId === PAIR_ID && returnPlan.authority?.condition === CONDITION && returnPlan.component?.elementId === "open-service-top-hero" && returnPlan.component?.sequence === DELIVERY_SEQUENCE && returnPlan.component?.attempt === 1, "baseline delivered return plan identity changed.");
  exact(returnPlan.authority?.handoff?.registry, { path: "registry-baseline-delivery-1.json", sha256: registryReference.sha256 }, "baseline delivered return plan registry");
  exact(returnPlan.authority?.handoff?.packetManifest, { path: "packet-manifest-baseline-delivery-1.json", sha256: packetManifestReference.sha256 }, "baseline delivered return plan packet manifest");
  exact(returnPlan.authority?.handoff?.protocol?.self, { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 }, "baseline delivered return plan self protocol");
  exact(returnPlan.authority?.handoff?.protocol?.peer, { path: "protocol-current.json", sha256: PROTOCOL_SHA256 }, "baseline delivered return plan peer protocol");

  const expectedAttachments = normalizedAttachments(deliveryReceipt.roleHome?.attachments ?? []);
  assert(expectedAttachments.length === 4, "baseline delivery receipt must bind exactly four role-home attachments.");
  exact(normalizedAttachments(deliveryReceipt.source?.attachments ?? []), expectedAttachments, "baseline delivery receipt source attachments");
  assert(deliveryReceipt.roleHome?.path === ROLE_HOME && deliveryReceipt.roleHome?.attachmentOnly === true, "baseline delivery role-home binding changed.");
  assert(deliveryReceipt.postValidation?.packetCheck?.result === "PASS" && deliveryReceipt.postValidation?.packetCheck?.attachmentCount === expectedAttachments.length && deliveryReceipt.postValidation?.packetCheck?.manifestSha256 === packetManifestReference.sha256, "baseline delivery receipt packet validation changed.");
  assert(packetManifest.attachmentCount === expectedAttachments.length, "baseline delivered packet manifest attachment count changed.");
  exact(normalizedAttachmentHashes(packetManifest.roleAttachments ?? []), normalizedAttachmentHashes(expectedAttachments), "baseline delivered packet manifest attachments");
  const actualAttachments = normalizedAttachments(listFiles(ROLE_HOME));
  exact(actualAttachments, expectedAttachments, "delivered baseline role-home attachment inventory");

  const visibleAuthority = readJson(join(ROLE_HOME, "return-authority.json"), "baseline role-visible authority");
  assert(visibleAuthority.handoff?.opaqueHandoffId === HANDOFF_ID && visibleAuthority.handoff?.deliverySequence === DELIVERY_SEQUENCE && visibleAuthority.handoff?.handoffProtocolSha256 === PROTOCOL_SHA256, "baseline role-visible authority handoff changed.");
  assert(Array.isArray(visibleAuthority.prohibited) && visibleAuthority.prohibited.includes("role-launch"), "baseline role-visible authority no longer prohibits role self-launch.");

  const immutableInputs = immutableSnapshot(activationReceipt.immutableInputs);
  exact(immutableInputs, immutableSnapshot(runtimeAuthority.immutableInputs), "baseline activation/runtime immutable snapshots");
  const p11 = readJson(immutableInputs.p11BlockedRecord.path, "baseline P-11 record");
  assert(p11.status === "BLOCKED" && p11.authorization === "NOT_AUTHORIZED" && p11.roleLaunchObserved === false, "P-11 must remain BLOCKED/NOT_AUTHORIZED and unobserved.");
  assertAbsent(join(BASELINE_WORKTREE, "site"), "baseline site directory");
  assertAbsent(join(CURRENT_WORKTREE, "site"), "current site directory");

  return {
    activationReceipt: { path: activationReceiptReference.path, sha256: activationReceiptReference.sha256 },
    runtimeAuthority: { path: runtimeAuthorityReference.path, sha256: runtimeAuthorityReference.sha256 },
    deliveryReceipt: { path: posix(DELIVERY_RECEIPT_PATH), sha256: DELIVERY_RECEIPT_SHA256 },
    roleHome: { path: posix(ROLE_HOME), attachments: expectedAttachments },
    protocol: { baseline: { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 }, current: { path: "protocol-current.json", sha256: PROTOCOL_SHA256 } },
    deliveredCoordinatorArtifacts: {
      registry: registryReference,
      packetManifest: packetManifestReference,
      returnPlan: { path: returnPlanReference.path, sha256: returnPlanReference.sha256 },
    },
    immutableInputs,
    p11: { status: "BLOCKED", authorization: "NOT_AUTHORIZED", roleLaunchObserved: false },
    siteDirectoriesAbsent: { baseline: true, current: true },
  };
}
function validateCurrentDeliveredNotLaunched() {
  assertDirectory(CURRENT_ACTIVATION_ROOT, "published current activation root");
  const activationReceiptPath = join(CURRENT_ACTIVATION_ROOT, "activation-receipt.json");
  const activationReceipt = readJson(activationReceiptPath, "current activation receipt");
  const activationReceiptReference = fileReference(activationReceiptPath, "current activation receipt");
  assert(activationReceipt.schema === "p3-r4-current-runtime-activation-receipt/v2" && activationReceipt.recordState === "finalized" && activationReceipt.ownerApproved === true && activationReceipt.activationId === CURRENT_ACTIVATION_ID && activationReceipt.pairId === PAIR_ID && activationReceipt.condition === CURRENT_CONDITION, "current activation receipt identity changed.");
  exact(activationReceipt.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: CURRENT_HANDOFF_ID }, "current activation receipt recipient");
  assert(activationReceipt.result?.roleHomeCreated === false && activationReceipt.result?.roleHomeCopied === false && activationReceipt.result?.roleDelivered === false && activationReceipt.result?.roleLaunched === false && activationReceipt.result?.implementation === false && activationReceipt.result?.returnApplied === false && activationReceipt.result?.siteCreatedOrMutated === false && activationReceipt.result?.lifecycleMutated === false && activationReceipt.result?.browserOrFigmaMeasurement === false && activationReceipt.result?.p11Changed === false, "current activation receipt claims a later side effect.");

  const protocolBaseline = readRegular(join(CURRENT_ACTIVATION_ROOT, "protocol-baseline.json"), "current activation baseline protocol");
  const protocolCurrent = readRegular(join(CURRENT_ACTIVATION_ROOT, "protocol-current.json"), "current activation current protocol");
  assert(sha256(protocolBaseline) === PROTOCOL_SHA256 && protocolBaseline.equals(protocolCurrent), "current activation/common protocol is not the required 2cb byte copy.");

  const authorizationBytes = readRegular(CURRENT_AUTHORIZATION_RECEIPT_PATH, "current pre-copy delivery authorization receipt");
  assert(sha256(authorizationBytes) === CURRENT_AUTHORIZATION_RECEIPT_SHA256, "current pre-copy delivery authorization receipt SHA-256 changed.");
  const authorizationReceipt = JSON.parse(authorizationBytes.toString("utf8"));
  const completionBytes = readRegular(CURRENT_COMPLETION_RECEIPT_PATH, "current delivery completion receipt");
  assert(sha256(completionBytes) === CURRENT_COMPLETION_RECEIPT_SHA256, "current delivery completion receipt SHA-256 changed.");
  const completionReceipt = JSON.parse(completionBytes.toString("utf8"));
  assert(authorizationReceipt.schema === "p3-r4-current-role-delivery-authorization-receipt/v1" && authorizationReceipt.recordState === "finalized" && authorizationReceipt.ownerApproved === true && authorizationReceipt.recordPublishedBeforeRoleHomeCopy === true && authorizationReceipt.deliveryReceiptRequiredBeforeRoleHomeCopy === true, "current pre-copy delivery authorization receipt state changed.");
  assert(completionReceipt.schema === "p3-r4-current-role-delivery-completion-receipt/v1" && completionReceipt.recordState === "finalized" && completionReceipt.ownerApproved === true && completionReceipt.ownerOperated === true, "current delivery completion receipt state changed.");
  const expectedActivation = { activationId: CURRENT_ACTIVATION_ID, outputRoot: posix(CURRENT_ACTIVATION_ROOT), activationReceiptSha256: activationReceiptReference.sha256 };
  exact(authorizationReceipt.activation, expectedActivation, "current pre-copy delivery authorization activation");
  exact(completionReceipt.activation, expectedActivation, "current delivery completion activation");
  for (const [label, record] of [["current pre-copy delivery authorization", authorizationReceipt], ["current delivery completion", completionReceipt]]) {
    assert(record.pairId === PAIR_ID && record.condition === CURRENT_CONDITION, `${label} pair binding changed.`);
    exact(record.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: CURRENT_HANDOFF_ID }, `${label} recipient`);
  }
  assert(authorizationReceipt.result?.deliveryAuthorized === true && authorizationReceipt.result?.deliveryExecuted === false && authorizationReceipt.result?.roleHomeCopy === false && authorizationReceipt.result?.roleHomeCopied === false && authorizationReceipt.result?.roleDelivery === false && authorizationReceipt.result?.roleDelivered === false && authorizationReceipt.result?.roleLaunch === false && authorizationReceipt.result?.roleLaunched === false && authorizationReceipt.result?.implementation === false && authorizationReceipt.result?.returnApply === false && authorizationReceipt.result?.siteMutation === false && authorizationReceipt.result?.siteCreatedOrMutated === false && authorizationReceipt.result?.lifecycleMutation === false && authorizationReceipt.result?.browserOrFigmaMeasurement === false && authorizationReceipt.result?.p11Mutation === false && authorizationReceipt.result?.p11Changed === false, "current pre-copy delivery authorization result changed.");
  assert(completionReceipt.result?.deliveryAuthorized === true && completionReceipt.result?.deliveryExecuted === true && completionReceipt.result?.roleHomeCopy === true && completionReceipt.result?.roleHomeCopied === true && completionReceipt.result?.roleDelivery === true && completionReceipt.result?.roleDelivered === true && completionReceipt.result?.roleLaunch === false && completionReceipt.result?.roleLaunched === false && completionReceipt.result?.implementation === false && completionReceipt.result?.returnApply === false && completionReceipt.result?.siteMutation === false && completionReceipt.result?.siteCreatedOrMutated === false && completionReceipt.result?.lifecycleMutation === false && completionReceipt.result?.browserOrFigmaMeasurement === false && completionReceipt.result?.p11Mutation === false && completionReceipt.result?.p11Changed === false, "current delivery completion result changed.");

  const authorizationReference = referenceWithinRoot(CURRENT_ACTIVATION_ROOT, completionReceipt.preCopyAuthorizationReceipt, "current completion pre-copy authorization receipt");
  assert(authorizationReference.sha256 === CURRENT_AUTHORIZATION_RECEIPT_SHA256, "current completion pre-copy authorization SHA-256 changed.");
  exact(completionReceipt.source?.packetManifest, authorizationReceipt.source?.packetManifest, "current delivery packet manifest binding");
  const expectedAttachments = normalizedAttachments(completionReceipt.roleHome?.files ?? []);
  assert(expectedAttachments.length === 4, "current delivery completion receipt must bind exactly four role-home attachments.");
  exact(normalizedAttachments(completionReceipt.source?.attachments ?? []), expectedAttachments, "current delivery completion source attachments");
  exact(normalizedAttachments(authorizationReceipt.plannedRoleHome?.files ?? []), expectedAttachments, "current pre-copy planned role-home attachments");
  assert(completionReceipt.roleHome?.path === CURRENT_ROLE_HOME, "current delivery completion role-home binding changed.");
  const actualAttachments = normalizedAttachments(listFiles(CURRENT_ROLE_HOME));
  exact(actualAttachments, expectedAttachments, "delivered current role-home attachment inventory");
  const visibleAuthority = readJson(join(CURRENT_ROLE_HOME, "return-authority.json"), "current role-visible authority");
  assert(visibleAuthority.handoff?.opaqueHandoffId === CURRENT_HANDOFF_ID && visibleAuthority.handoff?.deliverySequence === DELIVERY_SEQUENCE && visibleAuthority.handoff?.handoffProtocolSha256 === PROTOCOL_SHA256, "current role-visible authority handoff changed.");
  assert(Array.isArray(visibleAuthority.prohibited) && visibleAuthority.prohibited.includes("role-launch"), "current role-visible authority no longer prohibits role self-launch.");

  return {
    activationReceipt: { path: activationReceiptReference.path, sha256: activationReceiptReference.sha256 },
    authorizationReceipt: { path: posix(CURRENT_AUTHORIZATION_RECEIPT_PATH), sha256: CURRENT_AUTHORIZATION_RECEIPT_SHA256 },
    completionReceipt: { path: posix(CURRENT_COMPLETION_RECEIPT_PATH), sha256: CURRENT_COMPLETION_RECEIPT_SHA256 },
    roleHome: { path: posix(CURRENT_ROLE_HOME), attachments: expectedAttachments },
    protocol: { baseline: { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 }, current: { path: "protocol-current.json", sha256: PROTOCOL_SHA256 } },
    deliveryState: { roleDelivered: true, roleLaunch: false, roleLaunched: false, implementation: false, returnApply: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false },
  };
}
function baselineFirstSerialBinding(current) {
  return {
    policy: "baseline-sequence-1-before-current-sequence-1",
    simultaneousABRoleLaunchForbidden: true,
    candidateAuthorizesOnly: { condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID, roleLaunch: true },
    currentLaunchAuthorizedByThisCandidate: false,
    requiredCurrentStateBeforeBaselinePreauthorization: "delivered-not-launched",
    recordEvidenceLimit: "The machine check proves the published current activation and delivery records remain non-launch records and its role-home inventory remains unchanged. It cannot prove the live human/runtime state outside those records.",
    actualCurrentRuntimeState: {
      status: "REQUIRED_UNSET",
      verificationStatus: OWNER_ATTESTATION_CLASSIFICATION,
      requiredOwnerFact: "published record外のcurrent role stateは、owner attestationとしてのみ扱う。",
    },
    current: {
      activationId: CURRENT_ACTIVATION_ID,
      condition: CURRENT_CONDITION,
      deliverySequence: DELIVERY_SEQUENCE,
      opaqueHandoffId: CURRENT_HANDOFF_ID,
      completionReceipt: current.completionReceipt,
      roleHome: current.roleHome,
      deliveryState: current.deliveryState,
    },
  };
}
function roleContextAttestation() {
  return {
    status: "owner-attested-source-cited",
    verificationStatus: OWNER_ATTESTATION_CLASSIFICATION,
    sourceCitation: OWNER_ATTESTATION_SOURCE,
    requiredOwnerFact: OWNER_FACT_REQUIRED,
    actualActor: "REQUIRED_UNSET",
    actualContextId: "REQUIRED_UNSET",
    observedAt: "REQUIRED_UNSET",
  };
}
function buildCandidates(bindings) {
  const ownerDirective = {
    status: "owner-authorized-for-prelaunch-record-only",
    sourceCitation: OWNER_ATTESTATION_SOURCE,
    verificationStatus: "owner authorization, not file-verifiable",
    authorizedScope: "baseline sequence 1 coordinator-only pre-launch authorization record; no launch or implementation",
  };
  const preLaunch = {
    schema: "p3-r5-role-launch-preauthorization/v1",
    recordState: "candidate-not-published",
    ownerApproved: false,
    ownerApprovalRecordedAt: "REQUIRED_UNSET",
    ownerDirective,
    activation: { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    bindings,
    pinnedReturnHelperE2E: bindings.pinnedReturnHelperE2E,
    pairRoleInputAudit: bindings.pairRoleInputAudit,
    authorizationScope: { ...R5_SCOPE },
    ownerAttestedFreshContext: roleContextAttestation(),
    verificationBoundary: {
      machineVerified: ["baseline/current delivered role-home attachment inventories", "baseline/current attachment input-diff summary", "pinned d972 helper and 216 durable E2E evidence"],
      notMachineVerifiable: ["actual human/runtime context history", "actual actor", "actual contextId", "live current role state outside published records"],
    },
    p11: { ...bindings.p11, assertion: "not asserted by this record" },
    coordinatorLaunchOnly: true,
    roleVisibleAuthorityUnchanged: { roleSelfLaunchProhibited: true },
    postLaunchCompletionRequired: true,
  };
  const preLaunchSha256 = sha256(jsonBytes(preLaunch));
  const postLaunch = {
    schema: "p3-r5-role-launch-completion-receipt/v1",
    recordState: "candidate-not-published",
    ownerApproved: false,
    completedAt: "REQUIRED_UNSET",
    activation: { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    preLaunchAuthorization: { candidateSha256: preLaunchSha256, finalRecordSha256: "REQUIRED_UNSET" },
    bindings,
    pinnedReturnHelperE2E: bindings.pinnedReturnHelperE2E,
    pairRoleInputAudit: bindings.pairRoleInputAudit,
    ownerAttestedFreshContext: roleContextAttestation(),
    verificationBoundary: {
      machineVerified: ["baseline/current delivered role-home attachment inventories", "baseline/current attachment input-diff summary", "pinned d972 helper and 216 durable E2E evidence"],
      notMachineVerifiable: ["actual human/runtime context history", "actual actor", "actual contextId", "live current role state outside published records"],
    },
    result: {
      pairReadiness: false,
      pairBegin: false,
      pairPreflight: false,
      rolePacket: false,
      roleHomeCopy: false,
      roleDelivery: false,
      roleLaunch: "REQUIRED_UNSET",
      implementation: false,
      returnApply: false,
      siteMutation: false,
      lifecycleMutation: false,
      browserMeasurement: false,
      figmaMeasurement: false,
      p11Mutation: false,
    },
    p11: { ...bindings.p11, assertion: "not asserted by this record" },
    coordinatorLaunchOnly: true,
  };
  return { preLaunch, postLaunch, preLaunchSha256, postLaunchSha256: sha256(jsonBytes(postLaunch)) };
}
function collectValidatedState() {
  const baselineBindings = validatePublishedBaseline();
  const currentBindings = validateCurrentDeliveredNotLaunched();
  const pairRoleInputAudit = compareAttachmentInventories(baselineBindings, currentBindings);
  const pinnedReturnHelperE2E = readPinnedReturnHelperE2EReceipt();
  const bindings = {
    ...baselineBindings,
    baselineFirstSerial: baselineFirstSerialBinding(currentBindings),
    pairRoleInputAudit,
    pinnedReturnHelperE2E,
  };
  return { bindings, candidates: buildCandidates(bindings) };
}
function publicationId(candidates) {
  return sha256(Buffer.from(`p3-r5-baseline-seq1-prelaunch\0${PAIR_ID}\0${ACTIVATION_ID}\0${HANDOFF_ID}\0${candidates.preLaunchSha256}\0${JSON.stringify(canonical(OWNER_ATTESTATION_SOURCE))}`, "utf8"));
}
function executionNotPerformed() {
  return {
    pairReadiness: false,
    pairBegin: false,
    pairPreflight: false,
    rolePacket: false,
    roleHomeCopy: false,
    roleDelivery: false,
    roleLaunchAuthorized: true,
    roleLaunchExecuted: false,
    implementation: false,
    returnApply: false,
    siteMutation: false,
    lifecycleMutation: false,
    browserMeasurement: false,
    figmaMeasurement: false,
    p11Mutation: false,
  };
}
function buildFinalPreLaunchPublication(state, ownerApprovalRecordedAt) {
  assert(typeof ownerApprovalRecordedAt === "string" && !Number.isNaN(Date.parse(ownerApprovalRecordedAt)), "owner approval timestamp is invalid.");
  const recordId = publicationId(state.candidates);
  const root = join(R5_PRELAUNCH_RECORDS_PARENT, recordId);
  const record = {
    schema: "p3-r5-role-launch-preauthorization/v1",
    recordState: "finalized",
    ownerApproved: true,
    ownerApprovalRecordedAt,
    approvalBasis: "Owner-authorized R5 baseline sequence-1 coordinator-only pre-launch record. This record authorizes only role launch; it does not create or launch a role and does not authorize implementation, return apply, site/worktree mutation, lifecycle mutation, browser/Figma measurement, P-11, OS isolation, or model-visible tool-surface claims.",
    ownerAuthorization: {
      sourceCitation: OWNER_ATTESTATION_SOURCE,
      classification: OWNER_ATTESTATION_CLASSIFICATION,
      machineVerified: false,
      contentText: "not available in a machine-readable artifact; no content hash has been invented",
    },
    activation: { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    candidateHashes: {
      preLaunchAuthorization: state.candidates.preLaunchSha256,
      postLaunchCompletion: state.candidates.postLaunchSha256,
    },
    bindings: state.bindings,
    pinnedReturnHelperE2E: state.bindings.pinnedReturnHelperE2E,
    pairRoleInputAudit: state.bindings.pairRoleInputAudit,
    authorizationScope: { ...R5_SCOPE },
    execution: executionNotPerformed(),
    ownerAttestedFreshContext: roleContextAttestation(),
    verificationBoundary: {
      machineVerified: ["baseline/current delivered role-home attachment inventories", "baseline/current attachment input-diff summary", "pinned d972 helper and 216 durable E2E evidence"],
      notMachineVerifiable: ["actual human/runtime context history", "actual actor", "actual contextId", "live current role state outside published records", "OS isolation", "model-visible tool surface"],
    },
    p11: { ...state.bindings.p11, assertion: "not authorized or asserted by this record" },
    nonElevatedBoundaries: {
      osIsolation: "not asserted",
      modelVisibleToolSurface: "not asserted",
      roleContextCreated: false,
      roleLaunched: false,
    },
    postLaunchCompletionRequired: true,
    output: { recordId, root: posix(root), file: PRELAUNCH_RECORD_FILE },
  };
  const bytes = jsonBytes(record);
  const publication = { recordId, root, record, bytes, sha256: sha256(bytes) };
  validateFinalPreLaunchPublication(publication, state);
  return publication;
}
function validateFinalPreLaunchPublication(publication, state) {
  const { record } = publication;
  assert(record.schema === "p3-r5-role-launch-preauthorization/v1" && record.recordState === "finalized" && record.ownerApproved === true, "final R5 pre-launch record state is invalid.");
  assert(typeof record.ownerApprovalRecordedAt === "string" && !Number.isNaN(Date.parse(record.ownerApprovalRecordedAt)), "final R5 pre-launch approval timestamp is invalid.");
  exact(record.ownerAuthorization?.sourceCitation, OWNER_ATTESTATION_SOURCE, "final R5 pre-launch owner source citation");
  assert(record.ownerAuthorization?.classification === OWNER_ATTESTATION_CLASSIFICATION && record.ownerAuthorization?.machineVerified === false && record.ownerAuthorization?.contentText === "not available in a machine-readable artifact; no content hash has been invented", "final R5 pre-launch owner attestation classification changed.");
  exact(record.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "final R5 pre-launch activation");
  exact(record.authorizationScope, R5_SCOPE, "final R5 pre-launch authorization scope");
  exact(record.execution, executionNotPerformed(), "final R5 pre-launch execution state");
  exact(record.candidateHashes, { preLaunchAuthorization: state.candidates.preLaunchSha256, postLaunchCompletion: state.candidates.postLaunchSha256 }, "final R5 pre-launch candidate hashes");
  exact(record.bindings, state.bindings, "final R5 pre-launch bindings");
  exact(record.pinnedReturnHelperE2E, state.bindings.pinnedReturnHelperE2E, "final R5 pre-launch E2E binding");
  exact(record.pairRoleInputAudit, state.bindings.pairRoleInputAudit, "final R5 pre-launch pair input audit");
  assert(record.p11?.status === "BLOCKED" && record.p11?.authorization === "NOT_AUTHORIZED" && record.p11?.assertion === "not authorized or asserted by this record", "final R5 pre-launch P-11 boundary changed.");
  exact(record.nonElevatedBoundaries, { osIsolation: "not asserted", modelVisibleToolSurface: "not asserted", roleContextCreated: false, roleLaunched: false }, "final R5 pre-launch non-elevated boundaries");
  exact(record.output, { recordId: publication.recordId, root: posix(publication.root), file: PRELAUNCH_RECORD_FILE }, "final R5 pre-launch output binding");
  assert(publication.sha256 === sha256(publication.bytes), "final R5 pre-launch record SHA-256 is invalid.");
}
function ensurePublishParent() {
  const root = resolve(EXTERNAL_COORDINATOR_RECORDS_ROOT);
  const parent = resolve(R5_PRELAUNCH_RECORDS_PARENT);
  assertDirectory(root, "external coordinator records root");
  assert(root !== parent && isWithin(root, parent), "R5 pre-launch publication parent escapes the external coordinator records root.");
  const missing = [];
  let cursor = parent;
  while (!existsSync(cursor)) {
    assert(isWithin(root, cursor) && resolve(cursor) !== root, "R5 pre-launch publication parent escapes the external coordinator records root.");
    missing.push(cursor);
    cursor = dirname(cursor);
  }
  assertDirectory(cursor, "existing R5 pre-launch publication ancestor");
  const created = [...missing].reverse();
  for (const directory of created) {
    mkdirSync(directory, { recursive: false, mode: 0o700 });
    assertDirectory(directory, "created R5 pre-launch publication ancestor");
  }
  return created;
}
function removeOwnedEmptyParents(created) {
  for (const directory of [...created].reverse()) {
    if (!existsSync(directory)) continue;
    assertDirectory(directory, "rollback R5 pre-launch publication ancestor");
    if (readdirSync(directory).length === 0) rmdirSync(directory);
  }
}
function stageRoot(finalRoot) {
  const parent = dirname(finalRoot);
  assertDirectory(parent, "R5 pre-launch publication parent");
  const stage = join(parent, `.${basename(finalRoot)}.stage-${randomUUID()}`);
  assert(isWithin(parent, stage) && resolve(stage) !== resolve(parent), "R5 pre-launch stage escapes its parent.");
  assertAbsent(stage, "R5 pre-launch stage root");
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  return stage;
}
function assertOwnedStage(stage, finalRoot) {
  const parent = resolve(dirname(finalRoot));
  assert(resolve(dirname(stage)) === parent && basename(stage).startsWith(`.${basename(finalRoot)}.stage-`), "refusing to operate on a stage outside this R5 pre-launch transaction.");
}
function removeOwnedStage(stage, finalRoot) {
  if (!stage || !existsSync(stage)) return;
  assertOwnedStage(stage, finalRoot);
  rmSync(stage, { recursive: true, force: false });
}
function validatePublicationTree(root, publication, label) {
  const files = listFiles(root);
  assert(files.length === 1 && files[0].logicalPath === PRELAUNCH_RECORD_FILE && files[0].sha256 === publication.sha256 && files[0].bytes === publication.bytes.length, `${label} inventory is invalid.`);
  const value = readJson(join(root, PRELAUNCH_RECORD_FILE), `${label} record`);
  exact(value, publication.record, `${label} record bytes`);
}
function removeOwnedPublishedPublication(publication, state) {
  validatePublicationTree(publication.root, publication, "published R5 pre-launch rollback target");
  validateFinalPreLaunchPublication(publication, state);
  rmSync(publication.root, { recursive: true, force: false });
  assertAbsent(publication.root, "rolled-back R5 pre-launch publication");
}
function assertStableState(expected) {
  const actual = collectValidatedState();
  exact(actual.bindings, expected.bindings, "R5 pre-launch source bindings changed during publication");
  exact(actual.candidates, expected.candidates, "R5 pre-launch candidate changed during publication");
}
function publishFinalPreLaunch(state) {
  const ownerApprovalRecordedAt = new Date().toISOString();
  const publication = buildFinalPreLaunchPublication(state, ownerApprovalRecordedAt);
  assertDirectory(EXTERNAL_COORDINATOR_RECORDS_ROOT, "external coordinator records root");
  assertAbsent(publication.root, "R5 pre-launch output root");
  let createdParents = [];
  let stage = null;
  let published = false;
  try {
    createdParents = ensurePublishParent();
    stage = stageRoot(publication.root);
    writeFileSync(join(stage, PRELAUNCH_RECORD_FILE), publication.bytes, { mode: 0o600 });
    validatePublicationTree(stage, publication, "staged R5 pre-launch publication");
    assertStableState(state);
    assertAbsent(publication.root, "R5 pre-launch output root immediately before atomic publication");
    renameSync(stage, publication.root);
    stage = null;
    published = true;
    assertStableState(state);
    validatePublicationTree(publication.root, publication, "published R5 pre-launch publication");
    validateFinalPreLaunchPublication(publication, state);
    assertStableState(state);
    return {
      status: "published-prelaunch-authorization-only",
      publication: { recordId: publication.recordId, root: posix(publication.root), file: PRELAUNCH_RECORD_FILE, sha256: publication.sha256 },
      ownerApprovalRecordedAt,
      roleContextCreated: false,
      roleLaunched: false,
      implementationExecuted: false,
      externalWritesPerformed: true,
    };
  } catch (error) {
    const rollbackFailures = [];
    try { removeOwnedStage(stage, publication.root); } catch (rollbackError) { rollbackFailures.push(`stage: ${rollbackError.message}`); }
    try { if (published) removeOwnedPublishedPublication(publication, state); } catch (rollbackError) { rollbackFailures.push(`publication: ${rollbackError.message}`); }
    try { removeOwnedEmptyParents(createdParents); } catch (rollbackError) { rollbackFailures.push(`parents: ${rollbackError.message}`); }
    const suffix = rollbackFailures.length ? ` Rollback failures: ${rollbackFailures.join(" | ")}` : "";
    fail(`R5 pre-launch publication failed: ${error.message}.${suffix}`);
  }
}
function dryRunResult(state) {
  const recordId = publicationId(state.candidates);
  const root = join(R5_PRELAUNCH_RECORDS_PARENT, recordId);
  assertDirectory(EXTERNAL_COORDINATOR_RECORDS_ROOT, "external coordinator records root");
  assertAbsent(root, "R5 pre-launch output root");
  return {
    status: "validated-dry-run-no-launch",
    externalWritesPerformed: false,
    roleContextCreated: false,
    roleLaunched: false,
    implementationExecuted: false,
    ownerFactRequired: OWNER_FACT_REQUIRED,
    ownerAttestationSourceCitation: OWNER_ATTESTATION_SOURCE,
    codexForkTurnsNoneEligibility: {
      eligible: false,
      reason: "fork_turns:none omits transcript turns but does not attest an attachment-only mount, no-history runtime, or disabled model-visible tool surface.",
    },
    plannedPublication: {
      recordId,
      root: posix(root),
      file: PRELAUNCH_RECORD_FILE,
      candidateSha256: state.candidates.preLaunchSha256,
      finalRecordSha256: "requires actual ownerApprovalRecordedAt at --apply",
      atomicMethod: "same-parent staging directory then atomic rename; transaction-owned record rollback after post-validation failure",
    },
    bindings: state.bindings,
    candidates: {
      preLaunchAuthorization: { sha256: state.candidates.preLaunchSha256, record: state.candidates.preLaunch },
      postLaunchCompletion: { sha256: state.candidates.postLaunchSha256, record: state.candidates.postLaunch },
    },
  };
}
function main() {
  if (process.argv.length !== 3 || !["--dry-run", "--apply"].includes(process.argv[2])) fail("Usage: node tools/r5-prepare-baseline-seq1-launch-records.mjs --dry-run|--apply");
  const state = collectValidatedState();
  const result = process.argv[2] === "--dry-run" ? dryRunResult(state) : publishFinalPreLaunch(state);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
try { main(); } catch (error) { process.stderr.write(`P3 R5 BASELINE LAUNCH RECORDS: ${error.message}\n`); process.exitCode = 1; }
