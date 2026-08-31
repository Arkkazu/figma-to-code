#!/usr/bin/env node
// P-3 R4 current condition / sequence 1 attachment-only role delivery.
//
// --dry-run is read-only.  --apply is owner-operated and first atomically
// publishes a truthful pre-copy authorization receipt, then atomically copies
// the four-file role home, and finally appends a completion receipt.  This
// ordering satisfies deliveryReceiptRequiredBeforeRoleHomeCopy without ever
// claiming a completed delivery before the copy exists.
// It never launches a role, implements, applies a return, mutates a site or
// lifecycle, measures browser/Figma, or changes P-11.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { checkRolePacket } from "../research/p3/p3-role-packet.mjs";
import { currentPreparationInternals as I } from "./r4-prepare-current-seq1-runtime-activation.mjs";

const ACTIVATION_ID = "f06ba96a83153efac0d2b0e8f7e00a5548d747a36fccabf75787a05273d66375";
const HANDOFF_ID = "b3f41c2108d65cf6c6ae7767b6e797d1";
const DELIVERY_SEQUENCE = 1;
const ACTIVATION_ROOT = `${I.ACTIVATION_PARENT}/${ACTIVATION_ID}`;
const PACKET_ROOT = `${ACTIVATION_ROOT}/packet-staging/${HANDOFF_ID}/delivery`;
const ROLE_HOME_PARENT = I.ROLE_HOME_PARENT;
const ROLE_HOME = `${ROLE_HOME_PARENT}/b-impl-r4-reissue-2-${HANDOFF_ID}`;
const PROGRESS_ROOT = `${I.EXTERNAL_PROGRESS_PARENT}/${ACTIVATION_ID}/progress`;
const RECEIPT_PARENT = `${ACTIVATION_ROOT}/delivery-receipts`;
const AUTHORIZATION_RECEIPT_PATH = `${RECEIPT_PARENT}/current-implementation-delivery-authorization-${DELIVERY_SEQUENCE}-${HANDOFF_ID}.json`;
const COMPLETION_RECEIPT_PATH = `${RECEIPT_PARENT}/current-implementation-delivery-${DELIVERY_SEQUENCE}-${HANDOFF_ID}.json`;
const ACTIVATION_RECEIPT_SHA256 = "db6813e4346b86290c6993fc4c25bc6ef0d494cf45fc3b947f030ab892cdb776";
const PROTOCOL_SHA256 = "2cb05ebec90d7fefdf28cf51be8fb93e277e0bc7cec1a67ebcd458e1c686b342";
const DELIVERY_BOUNDARY = Object.freeze({
  roleHomeCopy: true,
  roleHomeCopied: true,
  roleDelivery: true,
  roleDelivered: true,
  roleLaunch: false,
  roleLaunched: false,
  implementation: false,
  returnApply: false,
  siteMutation: false,
  siteCreatedOrMutated: false,
  lifecycleMutation: false,
  browserOrFigmaMeasurement: false,
  p11Mutation: false,
  p11Changed: false,
});
const PRECOPY_BOUNDARY = Object.freeze({
  roleHomeCopy: false,
  roleHomeCopied: false,
  roleDelivery: false,
  roleDelivered: false,
  roleLaunch: false,
  roleLaunched: false,
  implementation: false,
  returnApply: false,
  siteMutation: false,
  siteCreatedOrMutated: false,
  lifecycleMutation: false,
  browserOrFigmaMeasurement: false,
  p11Mutation: false,
  p11Changed: false,
});
const ATTACHMENTS = Object.freeze([
  { logicalPath: "input/assignment.json", sha256: "a7b6cc716e264d4f954c181775dafee14e576cb85711aadbbac99a993e4634bf", bytes: 4351 },
  { logicalPath: "input/references/pc-first-view.png", sha256: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0", bytes: 413224 },
  { logicalPath: "input/references/sp-first-view.png", sha256: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427", bytes: 168441 },
  { logicalPath: "return-authority.json", sha256: "584cd9fcd0a7a8bf32c4338c80d40e4f1193cb9a52b04c0bd60e938720cd88bf", bytes: 1307 },
]);

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
function exact(left, right, label) { assert(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)), `${label} is not exact.`); }
function posix(path) { return resolve(path).replace(/\\/g, "/"); }
function isWithin(parent, child) { const route = relative(resolve(parent), resolve(child)); return route === "" || (!route.startsWith("..") && !isAbsolute(route)); }
function assertRegular(path, label) { assert(existsSync(path), `${label} is missing: ${posix(path)}`); const stat = lstatSync(path); assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular file.`); return stat; }
function assertDirectory(path, label) { assert(existsSync(path), `${label} is missing: ${posix(path)}`); const stat = lstatSync(path); assert(stat.isDirectory() && !stat.isSymbolicLink(), `${label} must be a real directory.`); return stat; }
function assertAbsent(path, label) { assert(!existsSync(path), `${label} must be absent: ${posix(path)}`); }
function readRegular(path, label) { assertRegular(path, label); return readFileSync(path); }
function readJson(path, label) { try { return JSON.parse(readRegular(path, label).toString("utf8")); } catch (error) { fail(`${label} is invalid JSON: ${error.message}`); } }
function safeChild(root, logicalPath, label) { assert(typeof logicalPath === "string" && logicalPath.length > 0 && !logicalPath.includes("\\"), `${label} has an invalid logical path.`); const target = resolve(root, ...logicalPath.split("/")); assert(isWithin(root, target) && target !== resolve(root), `${label} escapes its root.`); return target; }
function writeFresh(path, bytes) { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); }
function listFiles(root) {
  const output = [];
  function visit(directory, prefix = "") {
    assertDirectory(directory, "tree directory");
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const full = join(directory, entry.name); const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name; const stat = lstatSync(full);
      assert(!stat.isSymbolicLink(), `tree contains a symbolic link: ${logicalPath}`);
      if (stat.isDirectory()) visit(full, logicalPath); else { assert(stat.isFile(), `tree contains a non-regular entry: ${logicalPath}`); output.push({ logicalPath, sha256: sha256(readFileSync(full)), bytes: stat.size }); }
    }
  }
  visit(root); return output;
}
function baseActivationPaths() {
  return new Set([
    "activation-receipt.json", "protocol-current.json", "protocol-baseline.json", "registry-current-delivery-1.json", "return-plan-current-seq1-attempt1.json", "runtime-authority-current-delivery-1.json", "packet-plan-current-delivery-1.json", "packet-manifest-current-delivery-1.json",
    `packet-staging/${HANDOFF_ID}/delivery/input/assignment.json`, `packet-staging/${HANDOFF_ID}/delivery/input/references/pc-first-view.png`, `packet-staging/${HANDOFF_ID}/delivery/input/references/sp-first-view.png`, `packet-staging/${HANDOFF_ID}/delivery/return-authority.json`,
    ...I.RELEASE.map(([, file]) => `helper-release/${file}`),
  ]);
}
function attachmentSourceEntries() {
  return ATTACHMENTS.map((entry) => {
    const path = safeChild(PACKET_ROOT, entry.logicalPath, `activation attachment ${entry.logicalPath}`);
    const bytes = readRegular(path, `activation attachment ${entry.logicalPath}`);
    assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `activation attachment changed: ${entry.logicalPath}`);
    return { ...entry, path, data: bytes };
  });
}
function expectedReceiptEntries(state) {
  if (state === "none") return [];
  if (state === "authorization") return [basename(AUTHORIZATION_RECEIPT_PATH)];
  if (state === "complete") return [basename(AUTHORIZATION_RECEIPT_PATH), basename(COMPLETION_RECEIPT_PATH)].sort();
  fail(`unsupported delivery receipt state: ${state}`);
}
function assertReceiptParent({ state = "none" } = {}) {
  if (!existsSync(RECEIPT_PARENT)) {
    assert(state === "none", `delivery receipt parent is missing for ${state} state.`);
    return;
  }
  assertDirectory(RECEIPT_PARENT, "delivery receipt parent");
  const entries = readdirSync(RECEIPT_PARENT).sort();
  exact(entries, expectedReceiptEntries(state), `delivery receipt parent ${state} state`);
}
function assertEmptyProgress() {
  assertDirectory(PROGRESS_ROOT, "external progress root");
  assert(readdirSync(PROGRESS_ROOT).length === 0, "external progress root is not empty.");
  for (const name of ["role-return-progress.jsonl", "checkpoint-proofs", "role-return-progress.lock"]) assertAbsent(join(PROGRESS_ROOT, name), `external progress artifact ${name}`);
}
function expectedPairPreflights(inputs) {
  return [
    { condition: "baseline", worktreeRoot: I.BASELINE.toLowerCase(), comparisonContract: { path: I.REL.contract, sha256: inputs.baselineContract.sha256 }, gateManifest: { path: "MyBrain/verify/gate-open-service-top-hero-v1.json", sha256: inputs.immutableInputs.baselineGateManifest.sha256 }, preflightState: { path: ".figma-gate/active.json", sha256: inputs.immutableInputs.baselinePreflight.sha256 }, preflightId: inputs.records[1].preflightId },
    { condition: "current", worktreeRoot: I.CURRENT.toLowerCase(), comparisonContract: { path: I.REL.contract, sha256: inputs.currentContract.sha256 }, gateManifest: { path: "MyBrain/verify/gate-open-service-top-hero-v1.json", sha256: inputs.immutableInputs.currentGateManifest.sha256 }, preflightState: { path: ".figma-gate/active.json", sha256: inputs.immutableInputs.currentPreflight.sha256 }, preflightId: inputs.records[2].preflightId },
  ];
}
function validateActivation({ receiptState = "none", requireFreshHome = true } = {}) {
  const inputs = I.loadInputs();
  const release = I.loadRelease();
  assertDirectory(ACTIVATION_ROOT, "published current activation root");
  const allFiles = listFiles(ACTIVATION_ROOT);
  const baseFiles = allFiles.filter((entry) => !entry.logicalPath.startsWith("delivery-receipts/"));
  exact(baseFiles.map((entry) => entry.logicalPath).sort(), [...baseActivationPaths()].sort(), "published current activation base inventory");
  assert(baseFiles.length === 21, `published current activation must contain exactly 21 base regular files, got ${baseFiles.length}.`);
  assert(sha256(readRegular(join(ACTIVATION_ROOT, "activation-receipt.json"), "published activation receipt")) === ACTIVATION_RECEIPT_SHA256, "published activation receipt SHA-256 changed.");
  const receipt = readJson(join(ACTIVATION_ROOT, "activation-receipt.json"), "published activation receipt");
  assert(receipt.recordState === "finalized" && receipt.ownerApproved === true && receipt.activationId === ACTIVATION_ID && receipt.outputRoot === ACTIVATION_ROOT && receipt.condition === "current", "published activation receipt identity changed.");
  exact(receipt.immutableInputs, inputs.immutableInputReferences, "published activation receipt immutable inputs");
  exact(receipt.postBuildImmutableInputs, inputs.immutableInputReferences, "published activation receipt post-build immutable inputs");
  exact(receipt.outputs, baseFiles.filter((entry) => entry.logicalPath !== "activation-receipt.json"), "published activation receipt output inventory");
  assert(receipt.result?.roleHomeCreated === false && receipt.result?.roleDelivered === false && receipt.result?.roleLaunched === false && receipt.result?.implementation === false && receipt.result?.returnApplied === false && receipt.result?.siteCreatedOrMutated === false && receipt.result?.lifecycleMutated === false && receipt.result?.browserOrFigmaMeasurement === false && receipt.result?.p11Changed === false, "activation receipt already claims a prohibited side effect.");

  const protocolCurrent = readRegular(join(ACTIVATION_ROOT, "protocol-current.json"), "current protocol");
  assert(sha256(protocolCurrent) === PROTOCOL_SHA256 && protocolCurrent.equals(readRegular(join(ACTIVATION_ROOT, "protocol-baseline.json"), "baseline protocol")), "published current protocol is not the pair-common 2cb byte copy.");
  const protocol = JSON.parse(protocolCurrent.toString("utf8"));
  assert(Array.isArray(protocol.runtimeActivationRequired) && protocol.runtimeActivationRequired.includes("separate owner-operated role-home delivery receipt before actual delivery"), "published common protocol no longer requires a separate pre-copy delivery receipt.");
  exact(protocol.executionBoundary, { pairReadiness: false, pairBegin: false, pairPreflight: false, rolePacket: true, roleDelivery: false, roleLaunch: false, implementation: false, browserMeasurement: false, figmaMeasurement: false, p11: false }, "published common protocol execution boundary");
  for (const entry of release) {
    const bytes = readRegular(join(ACTIVATION_ROOT, "helper-release", entry.file), `activation helper ${entry.id}`);
    assert(bytes.equals(entry.bytes) && sha256(bytes) === entry.sha256, `activation helper release changed: ${entry.id}`);
  }
  const freshManifest = checkRolePacket(join(ACTIVATION_ROOT, "packet-plan-current-delivery-1.json"));
  exact(freshManifest, readJson(join(ACTIVATION_ROOT, "packet-manifest-current-delivery-1.json"), "published packet manifest"), "published packet manifest");
  assert(freshManifest.attachmentCount === 4, "published packet does not contain exactly four attachments.");
  const sources = attachmentSourceEntries();
  exact(freshManifest.roleAttachments.map(({ logicalPath, origin, sha256: digest }) => ({ logicalPath, origin, sha256: digest })), sources.map(({ logicalPath, sha256: digest }) => ({ logicalPath, origin: freshManifest.roleAttachments.find((item) => item.logicalPath === logicalPath).origin, sha256: digest })), "packet attachment hashes");
  const visibleAuthority = readJson(join(PACKET_ROOT, "return-authority.json"), "current role-visible authority");
  I.validateVisible(visibleAuthority);
  assert(visibleAuthority.handoff?.opaqueHandoffId === HANDOFF_ID && visibleAuthority.handoff?.deliverySequence === DELIVERY_SEQUENCE && visibleAuthority.handoff?.handoffProtocolSha256 === PROTOCOL_SHA256, "current role-visible authority handoff changed.");

  const registry = readJson(join(ACTIVATION_ROOT, "registry-current-delivery-1.json"), "published current registry");
  assert(registry.recordState === "finalized" && registry.executionState === false && registry.ownerApproved === true && registry.aBIdentical === true && registry.aBByteIdentical === true && registry.coordinatorOnly === true, "published current registry finalization changed.");
  assert(registry.protocol?.path === "protocol-current.json" && registry.protocol?.sha256 === PROTOCOL_SHA256, "published current registry protocol changed.");
  const recipient = registry.recipientPackets?.[0];
  assert(registry.recipientPackets?.length === 1 && recipient?.opaqueHandoffId === HANDOFF_ID && recipient?.roleKind === "implementation" && recipient?.coordinatorConditionBinding === "current" && recipient?.deliverySequence === DELIVERY_SEQUENCE && recipient?.identityLeakScan?.result === "clear", "published current registry recipient changed.");
  exact(recipient.attachments.map(({ logicalPath, origin, sha256: digest }) => ({ logicalPath, origin, sha256: digest })), freshManifest.roleAttachments.map(({ logicalPath, origin, sha256: digest }) => ({ logicalPath, origin, sha256: digest })), "registry packet attachment binding");
  const plan = readJson(join(ACTIVATION_ROOT, "return-plan-current-seq1-attempt1.json"), "published current return plan");
  assert(plan.version === 5 && plan.kind === "p3-role-return-plan" && plan.authority?.pairId === I.PAIR_ID && plan.authority?.condition === "current", "published current return plan identity changed.");
  exact(plan.authority.pairPreflights.conditions, expectedPairPreflights(inputs), "published current return-plan pair preflights");
  exact(plan.authority.handoff.protocol, { self: { path: "protocol-current.json", sha256: PROTOCOL_SHA256 }, peer: { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 } }, "published current return-plan protocol refs");
  assert(plan.authority.handoff?.opaqueHandoffId === HANDOFF_ID && plan.authority.handoff?.deliverySequence === DELIVERY_SEQUENCE && plan.authority.handoff?.registry?.sha256 === sha256(readRegular(join(ACTIVATION_ROOT, "registry-current-delivery-1.json"), "published registry bytes")) && plan.authority.handoff?.packetManifest?.sha256 === sha256(readRegular(join(ACTIVATION_ROOT, "packet-manifest-current-delivery-1.json"), "published packet manifest bytes")), "published current return-plan handoff bindings changed.");
  const runtime = readJson(join(ACTIVATION_ROOT, "runtime-authority-current-delivery-1.json"), "published current runtime authority");
  assert(runtime.recordState === "finalized" && runtime.ownerApproved === true && runtime.activationId === ACTIVATION_ID && runtime.condition === "current" && runtime.recipient?.opaqueHandoffId === HANDOFF_ID && runtime.state === "finalized-not-delivered", "published current runtime authority changed.");
  exact(runtime.immutableInputs, inputs.immutableInputReferences, "published runtime authority immutable inputs");
  exact(runtime.runtimeBindings.protocolCurrent, { path: "protocol-current.json", sha256: PROTOCOL_SHA256 }, "published runtime authority current protocol");
  exact(runtime.runtimeBindings.protocolBaseline, { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 }, "published runtime authority baseline protocol");
  assert(runtime.actualRoleHomeCopy === false && runtime.actualRoleLaunch === false && runtime.actualImplementation === false, "published runtime authority already claims a prohibited side effect.");
  assert(runtime.deliveryReceiptRequiredBeforeRoleHomeCopy === true, "published runtime authority no longer requires a receipt before role-home copy.");
  assert(runtime.freshRoleHome?.path === ROLE_HOME && runtime.freshRoleHome?.state === "must-remain-absent-until-separate-delivery-authorization", "published runtime authority fresh role-home binding changed.");
  exact(I.revalidateImmutableInputs(inputs.immutableInputReferences), inputs.immutableInputReferences, "current immutable source post-validation");
  assertEmptyProgress();
  assertReceiptParent({ state: receiptState });
  if (requireFreshHome) assertAbsent(ROLE_HOME, "fresh current role home");
  return { inputs, release, receipt, registry, plan, protocol, runtime, manifest: freshManifest, sources };
}

function assertRoleHome(root, sources, label) {
  const actual = listFiles(root);
  exact(actual, sources.map(({ logicalPath, sha256: digest, bytes }) => ({ logicalPath, sha256: digest, bytes })), `${label} attachment inventory`);
  for (const source of sources) assert(readRegular(safeChild(root, source.logicalPath, `${label} attachment`), `${label} attachment`).equals(source.data), `${label} attachment bytes changed: ${source.logicalPath}`);
}
function stageRoleHome(sources) {
  assertDirectory(ROLE_HOME_PARENT, "role-home parent");
  const stage = join(ROLE_HOME_PARENT, `.${basename(ROLE_HOME)}.stage-${randomUUID()}`);
  assertAbsent(stage, "role-home stage"); mkdirSync(stage, { recursive: false, mode: 0o700 });
  for (const source of sources) writeFresh(safeChild(stage, source.logicalPath, "role-home staged attachment"), source.data);
  assertRoleHome(stage, sources, "staged role home");
  return stage;
}
function removeOwnedHomeStage(stage) {
  if (!stage || !existsSync(stage)) return;
  const route = relative(resolve(ROLE_HOME_PARENT), resolve(stage));
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\") && basename(stage).startsWith(`.${basename(ROLE_HOME)}.stage-`), "refusing to remove an unowned role-home stage.");
  rmSync(stage, { recursive: true, force: false, maxRetries: 2 });
}
function ensureReceiptParent() {
  if (existsSync(RECEIPT_PARENT)) { assertDirectory(RECEIPT_PARENT, "delivery receipt parent"); return false; }
  assertDirectory(ACTIVATION_ROOT, "activation root for delivery receipt");
  mkdirSync(RECEIPT_PARENT, { recursive: false, mode: 0o700 });
  assertDirectory(RECEIPT_PARENT, "created delivery receipt parent");
  return true;
}
function stageReceipt(receipt, receiptPath, label) {
  const stage = join(RECEIPT_PARENT, `.${basename(receiptPath)}.stage-${randomUUID()}`);
  writeFileSync(stage, jsonBytes(receipt), { flag: "wx", mode: 0o600 });
  assertRegular(stage, `${label} stage`); return stage;
}
function removeOwnedReceiptStage(stage, receiptPath, label) {
  if (!stage || !existsSync(stage)) return;
  assert(dirname(stage) === resolve(RECEIPT_PARENT) && basename(stage).startsWith(`.${basename(receiptPath)}.stage-`), `refusing to remove an unowned ${label} stage.`);
  rmSync(stage, { force: false });
}
function pruneReceiptParentIfOwned(created) { if (!created || !existsSync(RECEIPT_PARENT)) return; assertDirectory(RECEIPT_PARENT, "created delivery receipt parent during rollback"); assert(readdirSync(RECEIPT_PARENT).length === 0, "created delivery receipt parent is no longer empty."); rmdirSync(RECEIPT_PARENT); }
function attachmentSnapshot(validation) {
  return validation.sources.map(({ logicalPath, sha256: digest, bytes }) => ({ logicalPath, sha256: digest, bytes }));
}
function sourceAttachmentSnapshot(validation) {
  return validation.sources.map(({ logicalPath, path, sha256: digest, bytes }) => ({ logicalPath, path: posix(path), sha256: digest, bytes }));
}
function packetCheckSnapshot() {
  return { result: "PASS", attachmentCount: 4, manifestSha256: sha256(readRegular(join(ACTIVATION_ROOT, "packet-manifest-current-delivery-1.json"), "packet manifest for delivery receipt")) };
}
function immutablePostValidation(validation) {
  return {
    packetCheck: packetCheckSnapshot(),
    immutableInputs: validation.inputs.immutableInputReferences,
    pairLifecycleRemainsPreflightOnly: true,
    siteDirectoriesRemainAbsent: { baseline: true, current: true },
    p11: { status: "BLOCKED", authorization: "NOT_AUTHORIZED" },
  };
}
function makeAuthorizationReceipt(validation, deliveryId, ownerApprovalRecordedAt) {
  return {
    schema: "p3-r4-current-role-delivery-authorization-receipt/v1",
    recordState: "finalized",
    ownerApproved: true,
    ownerApprovalRecordedAt,
    deliveryId,
    ownerOperated: true,
    deliveryReceiptRequiredBeforeRoleHomeCopy: true,
    recordPublishedBeforeRoleHomeCopy: true,
    activation: { activationId: ACTIVATION_ID, outputRoot: ACTIVATION_ROOT, activationReceiptSha256: ACTIVATION_RECEIPT_SHA256 },
    pairId: I.PAIR_ID,
    condition: "current",
    recipient: { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    source: { packetRoot: PACKET_ROOT, packetManifest: { path: "packet-manifest-current-delivery-1.json", sha256: packetCheckSnapshot().manifestSha256 }, attachments: sourceAttachmentSnapshot(validation) },
    plannedRoleHome: { path: ROLE_HOME, files: attachmentSnapshot(validation), requiredToBeAbsentAtReceiptPublication: true },
    preCopyValidation: immutablePostValidation(validation),
    result: { deliveryAuthorized: true, deliveryExecuted: false, ...PRECOPY_BOUNDARY },
  };
}
function assertPublishedReceipt(receiptPath, expected, label) {
  const bytes = readRegular(receiptPath, label);
  assert(bytes.equals(jsonBytes(expected)), `${label} bytes differ from the staged record.`);
  const actual = readJson(receiptPath, label);
  exact(actual, expected, `${label} JSON`);
  return { actual, bytes, sha256: sha256(bytes) };
}
function validatePublishedAuthorization(receipt, validation, deliveryId) {
  const actual = assertPublishedReceipt(AUTHORIZATION_RECEIPT_PATH, receipt, "published pre-copy authorization receipt").actual;
  assert(actual.deliveryId === deliveryId && actual.result?.deliveryAuthorized === true && actual.result?.deliveryExecuted === false && actual.result?.roleHomeCopy === false && actual.result?.roleHomeCopied === false && actual.result?.roleDelivery === false && actual.result?.roleDelivered === false, "published pre-copy authorization receipt claims an actual delivery.");
  exact(actual.preCopyValidation.immutableInputs, validation.inputs.immutableInputReferences, "pre-copy authorization immutable snapshot");
  exact(actual.plannedRoleHome.files, attachmentSnapshot(validation), "pre-copy authorization planned role-home files");
}
function makeCompletionReceipt(validation, authorizationReceipt, deliveryId, completedAt) {
  const authorization = assertPublishedReceipt(AUTHORIZATION_RECEIPT_PATH, authorizationReceipt, "published pre-copy authorization receipt");
  assertRoleHome(ROLE_HOME, validation.sources, "role home before completion receipt");
  return {
    schema: "p3-r4-current-role-delivery-completion-receipt/v1",
    recordState: "finalized",
    ownerApproved: true,
    ownerApprovalRecordedAt: authorizationReceipt.ownerApprovalRecordedAt,
    completedAt,
    deliveryId,
    ownerOperated: true,
    activation: { activationId: ACTIVATION_ID, outputRoot: ACTIVATION_ROOT, activationReceiptSha256: ACTIVATION_RECEIPT_SHA256 },
    pairId: I.PAIR_ID,
    condition: "current",
    recipient: { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    preCopyAuthorizationReceipt: { path: `delivery-receipts/${basename(AUTHORIZATION_RECEIPT_PATH)}`, sha256: authorization.sha256 },
    source: { packetRoot: PACKET_ROOT, packetManifest: { path: "packet-manifest-current-delivery-1.json", sha256: packetCheckSnapshot().manifestSha256 }, attachments: sourceAttachmentSnapshot(validation) },
    roleHome: { path: ROLE_HOME, files: attachmentSnapshot(validation) },
    postCopyValidation: { ...immutablePostValidation(validation), roleHomeAttachmentInventory: "PASS" },
    result: { deliveryAuthorized: true, deliveryExecuted: true, ...DELIVERY_BOUNDARY },
  };
}
function validatePublishedCompletion(receipt, authorizationReceipt, validation, deliveryId) {
  const actual = assertPublishedReceipt(COMPLETION_RECEIPT_PATH, receipt, "published delivery completion receipt").actual;
  assert(actual.deliveryId === deliveryId && actual.result?.deliveryAuthorized === true && actual.result?.deliveryExecuted === true && actual.result?.roleHomeCopy === true && actual.result?.roleHomeCopied === true && actual.result?.roleDelivery === true && actual.result?.roleDelivered === true, "published delivery completion receipt does not prove actual delivery.");
  const authorization = assertPublishedReceipt(AUTHORIZATION_RECEIPT_PATH, authorizationReceipt, "published pre-copy authorization receipt");
  exact(actual.preCopyAuthorizationReceipt, { path: `delivery-receipts/${basename(AUTHORIZATION_RECEIPT_PATH)}`, sha256: authorization.sha256 }, "completion authorization binding");
  exact(actual.postCopyValidation.immutableInputs, validation.inputs.immutableInputReferences, "completion immutable snapshot");
  exact(actual.roleHome.files, attachmentSnapshot(validation), "completion role-home files");
}

function dryRun() {
  const validation = validateActivation({ receiptState: "none", requireFreshHome: true });
  return {
    status: "validated-dry-run-not-delivered",
    externalWritesPerformed: false,
    activation: { activationId: ACTIVATION_ID, root: ACTIVATION_ROOT, regularFileCount: 21, protocolSha256: PROTOCOL_SHA256 },
    recipient: { condition: "current", roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    roleHome: { path: ROLE_HOME, exactlyAbsent: true },
    deliveryReceipts: {
      preCopyAuthorization: { path: AUTHORIZATION_RECEIPT_PATH, wouldBeAppendOnly: true, deliveryAuthorized: true, deliveryExecuted: false, publishedBeforeRoleHomeCopy: true },
      postCopyCompletion: { path: COMPLETION_RECEIPT_PATH, wouldBeAppendOnly: true, deliveryAuthorized: true, deliveryExecuted: true },
    },
    requiredPublicationOrder: ["pre-copy authorization receipt", "atomic role-home copy", "post-copy completion receipt"],
    attachments: validation.sources.map(({ logicalPath, path, sha256: digest, bytes }) => ({ logicalPath, path: posix(path), sha256: digest, bytes })),
    immutableInputs: validation.inputs.immutableInputReferences,
    packetCheck: { result: "PASS", attachmentCount: validation.manifest.attachmentCount, manifestSha256: sha256(readRegular(join(ACTIVATION_ROOT, "packet-manifest-current-delivery-1.json"), "dry-run packet manifest")) },
    prohibitedActions: { roleLaunch: false, implementation: false, returnApply: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false },
  };
}
function apply() {
  const validation = validateActivation({ receiptState: "none", requireFreshHome: true });
  const deliveryId = randomUUID(); const ownerApprovalRecordedAt = new Date().toISOString();
  let homeStage = null; let authorizationStage = null; let completionStage = null;
  let authorizationPublished = false; let homePublished = false; let completionPublished = false; let receiptParentCreated = false;
  try {
    homeStage = stageRoleHome(validation.sources);
    const revalidated = validateActivation({ receiptState: "none", requireFreshHome: true });
    exact(revalidated.inputs.immutableInputReferences, validation.inputs.immutableInputReferences, "pre-publication immutable inputs");
    receiptParentCreated = ensureReceiptParent();
    assertReceiptParent({ state: "none" });
    const authorizationReceipt = makeAuthorizationReceipt(revalidated, deliveryId, ownerApprovalRecordedAt);
    authorizationStage = stageReceipt(authorizationReceipt, AUTHORIZATION_RECEIPT_PATH, "pre-copy authorization receipt");
    assertAbsent(AUTHORIZATION_RECEIPT_PATH, "pre-copy authorization receipt immediately before append");
    renameSync(authorizationStage, AUTHORIZATION_RECEIPT_PATH); authorizationPublished = true; authorizationStage = null;
    validatePublishedAuthorization(authorizationReceipt, revalidated, deliveryId);
    const authorized = validateActivation({ receiptState: "authorization", requireFreshHome: true });
    exact(authorized.inputs.immutableInputReferences, validation.inputs.immutableInputReferences, "post-authorization immutable inputs");
    assertAbsent(ROLE_HOME, "fresh role home immediately before publication");
    renameSync(homeStage, ROLE_HOME); homePublished = true; homeStage = null;
    assertRoleHome(ROLE_HOME, authorized.sources, "published role home");
    const copied = validateActivation({ receiptState: "authorization", requireFreshHome: false });
    assertRoleHome(ROLE_HOME, copied.sources, "post-copy role home");
    exact(copied.inputs.immutableInputReferences, validation.inputs.immutableInputReferences, "post-copy immutable inputs");
    const completionReceipt = makeCompletionReceipt(copied, authorizationReceipt, deliveryId, new Date().toISOString());
    completionStage = stageReceipt(completionReceipt, COMPLETION_RECEIPT_PATH, "delivery completion receipt");
    assertAbsent(COMPLETION_RECEIPT_PATH, "delivery completion receipt immediately before append");
    renameSync(completionStage, COMPLETION_RECEIPT_PATH); completionPublished = true; completionStage = null;
    validatePublishedCompletion(completionReceipt, authorizationReceipt, copied, deliveryId);
    const post = validateActivation({ receiptState: "complete", requireFreshHome: false });
    assertRoleHome(ROLE_HOME, post.sources, "post-validation role home");
    exact(post.inputs.immutableInputReferences, validation.inputs.immutableInputReferences, "post-delivery immutable inputs");
    return { status: "delivered-not-launched", externalWritesPerformed: true, deliveryId, ownerApprovalTimestamp: ownerApprovalRecordedAt, activation: { activationId: ACTIVATION_ID, root: ACTIVATION_ROOT }, roleHome: { path: ROLE_HOME, attachmentCount: 4 }, deliveryReceipts: { preCopyAuthorization: { path: AUTHORIZATION_RECEIPT_PATH }, postCopyCompletion: { path: COMPLETION_RECEIPT_PATH } }, prohibitedActions: { roleLaunch: false, implementation: false, returnApply: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false } };
  } catch (error) {
    const cleanupFailures = [];
    try { removeOwnedReceiptStage(completionStage, COMPLETION_RECEIPT_PATH, "delivery completion receipt"); } catch (cleanupError) { cleanupFailures.push(`completion stage cleanup: ${cleanupError.message}`); }
    try { removeOwnedReceiptStage(authorizationStage, AUTHORIZATION_RECEIPT_PATH, "pre-copy authorization receipt"); } catch (cleanupError) { cleanupFailures.push(`authorization stage cleanup: ${cleanupError.message}`); }
    try { removeOwnedHomeStage(homeStage); } catch (cleanupError) { cleanupFailures.push(`role-home stage cleanup: ${cleanupError.message}`); }
    if (!authorizationPublished) {
      try { pruneReceiptParentIfOwned(receiptParentCreated); } catch (cleanupError) { cleanupFailures.push(`receipt-parent cleanup: ${cleanupError.message}`); }
    }
    const publishedState = completionPublished ? "authorization, role home, and completion receipt remain published" : homePublished ? "authorization receipt and role home remain published; completion receipt is absent" : authorizationPublished ? "authorization receipt remains published; role home is absent" : "no delivery record or role home was published";
    error.message = `${error.message}; fail-closed recovery state: ${publishedState}${cleanupFailures.length ? `; ${cleanupFailures.join("; ")}` : ""}`;
    throw error;
  }
}

function main() {
  if (process.argv.length !== 3 || !["--dry-run", "--apply"].includes(process.argv[2])) fail("Usage: node tools/r4-deliver-current-runtime-activation-seq1.mjs --dry-run | --apply");
  const result = process.argv[2] === "--dry-run" ? dryRun() : apply();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
try { main(); } catch (error) { process.stderr.write(`P3 R4 CURRENT DELIVERY: ${error.message}\n`); process.exitCode = 1; }
