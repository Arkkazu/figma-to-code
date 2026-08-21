#!/usr/bin/env node
// P-3 R4 baseline reissue, sequence 1: attachment-only role delivery.
//
// --dry-run is read-only.  --apply is deliberately limited to atomically
// copying the four already-published role attachments into the fresh role
// home and appending this delivery's coordinator receipt.  It never launches
// the role, validates/applies a return, changes a worktree/site/lifecycle, or
// changes P-11.
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const ACTIVATION_ID = "bb3077e21473ce4664e353cadc8e4fda44df87da6be9bf3839f4af818ab42165";
const HANDOFF_ID = "f92bcaa29c39e52eb6d5044638b41101";
const DELIVERY_SEQUENCE = 1;
const PILOT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const BASELINE_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const COORDINATOR_ROOT = `${PILOT_ROOT}/.git/p3-coordinator/${PAIR_ID}`;
const ACTIVATION_ROOT = `${COORDINATOR_ROOT}/runtime-activations/v2/${ACTIVATION_ID}`;
const PACKET_ROOT_RELATIVE = `packet-staging/${HANDOFF_ID}/delivery`;
const PACKET_ROOT = `${ACTIVATION_ROOT}/${PACKET_ROOT_RELATIVE}`;
const ROLE_HOME_PARENT = "C:/Users/tane1/AppData/Local/p3-role-homes";
const ROLE_HOME = `${ROLE_HOME_PARENT}/a-impl-r4-reissue-2-${HANDOFF_ID}`;
const RECEIPT_RELATIVE = `delivery-receipts/baseline-implementation-delivery-${DELIVERY_SEQUENCE}-${HANDOFF_ID}.json`;
const RECEIPT_PATH = `${ACTIVATION_ROOT}/${RECEIPT_RELATIVE}`;

const EXPECTED = Object.freeze({
  activationReceipt: "cdee724ffb182d6c82eaaac0322ba9d0076ebb2f87aeff8d5e070de24658539c",
  runtimeAuthority: "052bfbf58e429d963aba0037a9c4bbafc6312e87c1daed82921ab9e3166c3628",
  protocol: "2cb05ebec90d7fefdf28cf51be8fb93e277e0bc7cec1a67ebcd458e1c686b342",
  registry: "3e4137c0f0ec558e4928c4f5fae089c3f02756cb3d9c3ccc82bb2af4b6e90f99",
  returnPlan: "d331e86063218097ec3678a56343e195de60e17b1d325f0cb1060ff8ec2e1392",
  packetPlan: "d02c3cdc0ad63af421071ee280377919ef85d75490fb634efee81e855308f743",
  packetManifest: "39b1262cf6445d41f0b13a833467192910471111402c435265d844c63292b982",
  inputStaging: "876e20a8923eff31760d02037750fd4343ae724bfc7695d757581d3c76b5640f",
  baselineGate: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentGate: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
});

const IMMUTABLE_INPUTS = Object.freeze({
  approvedDesign: {
    path: "C:/AI/figma-to-code/tools/r4-return-authority-v4-design.json",
    sha256: "8c4fb215a0a3ead792fc3742eb336d45c9517501b40fcb5e59f1d807993d2313",
  },
  decisionJ: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline/MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
    sha256: "e1497dee0be929a01d21d520eab743d8c7f71ca7f910deacfafabc83f3440ab5",
  },
  baselineContract: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline/MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
    sha256: "ef4c911cf48951365294cea604a86896c25d7ed656872661cb23cc54dc1c7166",
  },
  currentContract: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current/MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
    sha256: "06d8d35c5048d48f63c920126371f29073aba9a8c3cbe168cf97bdc33efac342",
  },
  ledger: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/figma-p3-comparison-ledger.jsonl",
    sha256: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  },
  pairLock: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/figma-p3-comparison-pair-locks/55b8f4a26446c19fdfe5c43d2dae08e2b7715e31d1befee1f82257e36c0e4bac.json",
    sha256: "fd5ba36af2299b20bbd735bf072958573221c75858a6598931698094fd006b94",
  },
  baselinePreflightState: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline/.figma-gate/active.json",
    sha256: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  },
  currentPreflightState: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current/.figma-gate/active.json",
    sha256: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  },
  p11BlockedRecord: {
    path: "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/records/p3-p11-authorization-open-service-top-hero-v1-20260809.json",
    sha256: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  },
});

const ATTACHMENTS = Object.freeze([
  { logicalPath: "input/assignment.json", sha256: "022df11874d51d34c7599b8aa5c3f64ca1f8b03301a08e19d11eff1ef93d1f40", bytes: 4351 },
  { logicalPath: "input/references/pc-first-view.png", sha256: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0", bytes: 413224 },
  { logicalPath: "input/references/sp-first-view.png", sha256: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427", bytes: 168441 },
  { logicalPath: "return-authority.json", sha256: "592405b694db2f6d123c1eb671de3564e5ac46d8eabe5a65ddb90785ffaafeb7", bytes: 1307 },
]);

const DELIVERY_SCOPE = Object.freeze({
  roleHomeCopy: true,
  roleDelivery: true,
  roleLaunch: false,
  implementation: false,
  returnApply: false,
  siteMutation: false,
  lifecycleMutation: false,
  browserOrFigmaMeasurement: false,
  p11Mutation: false,
});

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function exact(left, right, label) {
  assert(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)), `${label} is not exact.`);
}
function posix(path) { return resolve(path).replace(/\\/g, "/"); }
function isWithin(parent, child) {
  const route = relative(resolve(parent), resolve(child));
  return route === "" || (!route.startsWith("..") && !isAbsolute(route));
}
function assertRegular(path, label) {
  assert(existsSync(path), `${label} is missing: ${posix(path)}`);
  const info = lstatSync(path);
  assert(!info.isSymbolicLink() && info.isFile(), `${label} must be a regular file: ${posix(path)}`);
  return info;
}
function assertDirectory(path, label) {
  assert(existsSync(path), `${label} is missing: ${posix(path)}`);
  const info = lstatSync(path);
  assert(!info.isSymbolicLink() && info.isDirectory(), `${label} must be a real directory: ${posix(path)}`);
  return info;
}
function assertAbsent(path, label) { assert(!existsSync(path), `${label} must be absent: ${posix(path)}`); }
function readRegular(path, label) { assertRegular(path, label); return readFileSync(path); }
function readJson(path, label) {
  try { return JSON.parse(readRegular(path, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function assertHash(path, expected, label) {
  const actual = sha256(readRegular(path, label));
  assert(actual === expected, `${label} SHA-256 changed: expected ${expected}, got ${actual}.`);
  return actual;
}
function assertImmutableInputs(receipt) {
  exact(receipt.immutableInputs, IMMUTABLE_INPUTS, "activation receipt immutable inputs");
  const snapshot = {};
  for (const [id, entry] of Object.entries(IMMUTABLE_INPUTS)) {
    const actual = assertHash(entry.path, entry.sha256, `immutable input ${id}`);
    snapshot[id] = { path: posix(entry.path), sha256: actual };
  }
  return snapshot;
}
function safeChild(root, logicalPath, label) {
  assert(typeof logicalPath === "string" && logicalPath.length > 0 && !logicalPath.includes("\\"), `${label} has an invalid logical path.`);
  const target = resolve(root, ...logicalPath.split("/"));
  assert(isWithin(root, target) && target !== resolve(root), `${label} escapes its root.`);
  return target;
}
function listRegularFiles(root) {
  const result = [];
  function visit(directory, prefix = "") {
    assertDirectory(directory, "tree directory");
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const full = join(directory, entry.name);
      const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const info = lstatSync(full);
      assert(!info.isSymbolicLink(), `tree contains a symbolic link: ${logicalPath}`);
      if (info.isDirectory()) visit(full, logicalPath);
      else {
        assert(info.isFile(), `tree contains a non-regular entry: ${logicalPath}`);
        result.push({ logicalPath, sha256: sha256(readFileSync(full)), bytes: info.size });
      }
    }
  }
  visit(root);
  return result;
}
function attachmentInventory(root, label) {
  const actual = listRegularFiles(root).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en"));
  const expected = [...ATTACHMENTS].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en"));
  exact(actual, expected, `${label} attachment inventory`);
  return actual;
}
function assertActivationInventory(receipt, receiptBytes = null) {
  const expected = new Map(receipt.outputs.map((entry) => [entry.relativePath, { sha256: entry.sha256, bytes: entry.bytes }]));
  expected.set("activation-receipt.json", { sha256: EXPECTED.activationReceipt, bytes: readRegular(`${ACTIVATION_ROOT}/activation-receipt.json`, "activation receipt").length });
  if (receiptBytes) expected.set(RECEIPT_RELATIVE, { sha256: sha256(receiptBytes), bytes: receiptBytes.length });
  const actual = listRegularFiles(ACTIVATION_ROOT);
  exact(actual.map(({ logicalPath, sha256: digest, bytes }) => ({ logicalPath, sha256: digest, bytes })).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en")),
    [...expected.entries()].map(([logicalPath, value]) => ({ logicalPath, ...value })).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en")),
    "activation exact regular-file inventory");
}

async function loadLocalHelpers() {
  const returnHelperPath = `${ACTIVATION_ROOT}/helper-release/p3-role-return.mjs`;
  const packetHelperPath = `${ACTIVATION_ROOT}/helper-release/p3-role-packet.mjs`;
  assertHash(returnHelperPath, "d9723895c308b3f87f27f7f8cd1e06409a4104ac4b2b5ba1e910d7630b36d2cc", "local return helper");
  assertHash(packetHelperPath, "69fc169f186dfd1c8dff69616eac8977900e5de77b8c5734468a96bf4a99af07", "local packet helper");
  const roleReturn = await import(pathToFileURL(returnHelperPath).href);
  const rolePacket = await import(pathToFileURL(packetHelperPath).href);
  assert(typeof roleReturn.hashInputStaging === "function", "local return helper lacks hashInputStaging.");
  assert(typeof rolePacket.checkRolePacket === "function", "local packet helper lacks checkRolePacket.");
  return { roleReturn, rolePacket };
}

function assertLedgerAndPreflights() {
  const ledgerPath = `${PILOT_ROOT}/.git/figma-p3-comparison-ledger.jsonl`;
  assertHash(ledgerPath, EXPECTED.ledger, "pair ledger");
  const records = readRegular(ledgerPath, "pair ledger").toString("utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert(records.length === 3 && records[0].kind === "started" && records[1].kind === "preflight-recorded" && records[2].kind === "preflight-recorded", "pair lifecycle is no longer preflight-only.");
  assert(records.every((record) => record.pairId === PAIR_ID), "pair ledger contains a different pair.");
  assert(records[1].condition === "baseline" && records[2].condition === "current", "pair preflight condition ordering changed.");
  for (const [root, hash, condition] of [[BASELINE_ROOT, EXPECTED.baselineGate, "baseline"], [CURRENT_ROOT, EXPECTED.currentGate, "current"]]) {
    const active = readJson(`${root}/.figma-gate/active.json`, `${condition} active preflight`);
    assertHash(`${root}/.figma-gate/active.json`, hash, `${condition} active preflight`);
    assert(active.phase === "preflight" && Array.isArray(active.benchmark?.attempts) && active.benchmark.attempts.length === 0, `${condition} preflight is consumed.`);
    assertAbsent(`${root}/site`, `${condition} site directory`);
    assertAbsent(`${root}/.p3-role-return-recovery`, `${condition} recovery directory`);
  }
  const p11Path = `${COORDINATOR_ROOT}/records/p3-p11-authorization-${PAIR_ID}.json`;
  assertHash(p11Path, EXPECTED.p11, "P-11 record");
  const p11 = readJson(p11Path, "P-11 record");
  assert(p11.status === "BLOCKED" && p11.authorization === "NOT_AUTHORIZED", "P-11 changed from BLOCKED / NOT_AUTHORIZED.");
}

function assertActivationImmutableInputs(activationReceipt) {
  const immutable = activationReceipt.immutableInputs;
  const required = [
    "approvedDesign",
    "decisionJ",
    "baselineContract",
    "currentContract",
    "ledger",
    "pairLock",
    "baselinePreflightState",
    "currentPreflightState",
    "p11BlockedRecord",
  ];
  assert(immutable && typeof immutable === "object" && !Array.isArray(immutable), "activation immutable inputs are missing.");
  exact(Object.keys(immutable).sort(), required.slice().sort(), "activation immutable input keys");
  for (const key of required) {
    const reference = immutable[key];
    assert(reference && typeof reference.path === "string" && /^[0-9a-f]{64}$/.test(reference.sha256), `activation immutable input ${key} is invalid.`);
    assertHash(reference.path, reference.sha256, `activation immutable input ${key}`);
  }
}

async function validatePreconditions({ receiptBytes = null } = {}) {
  assertDirectory(ACTIVATION_ROOT, "published reissue activation");
  assertHash(`${ACTIVATION_ROOT}/activation-receipt.json`, EXPECTED.activationReceipt, "activation receipt");
  assertHash(`${ACTIVATION_ROOT}/runtime-authority-baseline-delivery-1.json`, EXPECTED.runtimeAuthority, "runtime authority");
  assertHash(`${ACTIVATION_ROOT}/protocol-baseline.json`, EXPECTED.protocol, "baseline protocol");
  assertHash(`${ACTIVATION_ROOT}/protocol-current.json`, EXPECTED.protocol, "current protocol");
  assertHash(`${ACTIVATION_ROOT}/registry-baseline-delivery-1.json`, EXPECTED.registry, "registry");
  assertHash(`${ACTIVATION_ROOT}/return-plan-baseline-seq1-attempt1.json`, EXPECTED.returnPlan, "return plan");
  assertHash(`${ACTIVATION_ROOT}/packet-plan-baseline-delivery-1.json`, EXPECTED.packetPlan, "packet plan");
  assertHash(`${ACTIVATION_ROOT}/packet-manifest-baseline-delivery-1.json`, EXPECTED.packetManifest, "packet manifest");
  const activationReceipt = readJson(`${ACTIVATION_ROOT}/activation-receipt.json`, "activation receipt");
  const authority = readJson(`${ACTIVATION_ROOT}/runtime-authority-baseline-delivery-1.json`, "runtime authority");
  const registry = readJson(`${ACTIVATION_ROOT}/registry-baseline-delivery-1.json`, "registry");
  const returnPlan = readJson(`${ACTIVATION_ROOT}/return-plan-baseline-seq1-attempt1.json`, "return plan");
  const packetManifestPath = `${ACTIVATION_ROOT}/packet-manifest-baseline-delivery-1.json`;
  const packetRoot = PACKET_ROOT;
  const immutableInputs = assertImmutableInputs(activationReceipt);
  assert(activationReceipt.activationId === ACTIVATION_ID && activationReceipt.pairId === PAIR_ID && activationReceipt.condition === "baseline", "activation receipt identity changed.");
  assertActivationImmutableInputs(activationReceipt);
  exact(activationReceipt.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "activation receipt recipient");
  assert(activationReceipt.result?.roleHomeCreated === false && activationReceipt.result?.roleHomeCopied === false && activationReceipt.result?.roleDelivered === false && activationReceipt.result?.roleLaunched === false && activationReceipt.result?.siteCreatedOrMutated === false && activationReceipt.result?.lifecycleMutated === false && activationReceipt.result?.browserOrFigmaMeasurement === false && activationReceipt.result?.p11Changed === false, "activation receipt already records a prohibited side effect.");
  exact(authority.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "runtime authority recipient");
  assert(authority.state === "delivery-ready-not-delivered" && authority.actualRoleHomeCopy === false && authority.actualRoleLaunch === false && authority.actualImplementation === false, "runtime authority is not delivery-ready/not-delivered.");
  assert(returnPlan.authority?.handoff?.opaqueHandoffId === HANDOFF_ID && returnPlan.authority?.handoff?.deliverySequence === DELIVERY_SEQUENCE, "return plan handoff changed.");
  exact(returnPlan.authority?.handoff?.deliveryProgress, { version: 1, scope: "per-condition", initialDeliverySequence: 1, increment: 1 }, "return plan delivery progress");
  assert(registry.recordState === "finalized" && registry.executionState === false && registry.coordinatorOnly === true, "registry state changed.");
  const recipient = registry.recipientPackets?.[0];
  assert(Array.isArray(registry.recipientPackets) && registry.recipientPackets.length === 1 && recipient?.opaqueHandoffId === HANDOFF_ID && recipient?.deliverySequence === DELIVERY_SEQUENCE, "registry recipient changed.");
  const helpers = await loadLocalHelpers();
  const inputRoot = `${packetRoot}/input`;
  const inputHash = helpers.roleReturn.hashInputStaging(inputRoot);
  assert(inputHash === EXPECTED.inputStaging, `input staging SHA-256 changed: expected ${EXPECTED.inputStaging}, got ${inputHash}.`);
  attachmentInventory(packetRoot, "published coordinator packet");
  const packetManifest = helpers.rolePacket.checkRolePacket(`${ACTIVATION_ROOT}/packet-plan-baseline-delivery-1.json`);
  exact(packetManifest.roleAttachments.map((entry) => ({ logicalPath: entry.logicalPath, sha256: entry.sha256 })).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en")), ATTACHMENTS.map(({ logicalPath, sha256: digest }) => ({ logicalPath, sha256: digest })).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en")), "packet helper attachment set");
  exact(packetManifest, readJson(packetManifestPath, "packet manifest"), "fresh packet manifest");
  assertDirectory(ROLE_HOME_PARENT, "role-home parent");
  assert(isWithin(ROLE_HOME_PARENT, ROLE_HOME) && relative(resolve(ROLE_HOME_PARENT), resolve(ROLE_HOME)).split(/[\\/]/).length === 1, "fresh role home is not a direct child of its parent.");
  if (receiptBytes === null) {
    assertAbsent(ROLE_HOME, "fresh role home before delivery");
    assertAbsent(RECEIPT_PATH, "delivery receipt before delivery");
  } else {
    attachmentInventory(ROLE_HOME, "delivered role home");
    assert(sha256(readRegular(RECEIPT_PATH, "delivery receipt")) === sha256(receiptBytes), "delivery receipt bytes changed after creation.");
  }
  const progressRoot = activationReceipt.externalProgress?.root ?? returnPlan.authority?.progress?.root;
  assert(typeof progressRoot === "string", "published activation has no external progress root.");
  assertDirectory(progressRoot, "external progress root");
  assert(readdirSync(progressRoot).length === 0, "external progress root is no longer empty.");
  assertLedgerAndPreflights();
  assertActivationInventory(activationReceipt, receiptBytes);
  return { activationReceipt, authority, registry, packetManifest, inputHash, immutableInputs };
}

function ensureParentForStage(parent) {
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertDirectory(parent, "role-home staging parent");
}
function copyAttachments(sourceRoot, targetRoot) {
  for (const entry of ATTACHMENTS) {
    const bytes = readRegular(safeChild(sourceRoot, entry.logicalPath, `source attachment ${entry.logicalPath}`), `source attachment ${entry.logicalPath}`);
    assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `source attachment ${entry.logicalPath} changed.`);
    const target = safeChild(targetRoot, entry.logicalPath, `staged attachment ${entry.logicalPath}`);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  }
  attachmentInventory(targetRoot, "staged role packet");
}
function removeOwnedTree(root, expectedAttachments, label) {
  if (!existsSync(root)) return;
  const expected = expectedAttachments.map((entry) => ({ logicalPath: entry.logicalPath, sha256: entry.sha256, bytes: entry.bytes })).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en"));
  const actual = listRegularFiles(root).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath, "en"));
  exact(actual, expected, `${label} rollback inventory`);
  rmSync(root, { recursive: true, force: false, maxRetries: 0 });
}
function deliveryReceipt({ deliveredAt, validation }) {
  return {
    schema: "p3-r4-runtime-delivery-receipt/v2",
    recordState: "finalized",
    deliveryExecutedAt: deliveredAt,
    activation: { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: "baseline" },
    recipient: { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    authorization: {
      scope: "P-3 R4 attachment-only role delivery only",
      deliveryScope: DELIVERY_SCOPE,
      excludes: ["role-launch", "implementation", "return-apply", "worktree-or-site-mutation", "lifecycle-mutation", "browser-or-figma-measurement", "p11-change"],
      activationReceipt: { path: "activation-receipt.json", sha256: EXPECTED.activationReceipt },
      runtimeAuthority: { path: "runtime-authority-baseline-delivery-1.json", sha256: EXPECTED.runtimeAuthority },
      registry: { path: "registry-baseline-delivery-1.json", sha256: EXPECTED.registry },
      packetManifest: { path: "packet-manifest-baseline-delivery-1.json", sha256: EXPECTED.packetManifest },
    },
    source: {
      roleVisiblePacketRoot: PACKET_ROOT_RELATIVE,
      inputStaging: { path: `${PACKET_ROOT_RELATIVE}/input`, sha256: validation.inputHash },
      attachments: ATTACHMENTS,
    },
    roleHome: {
      path: posix(ROLE_HOME),
      wasAbsentBeforeDelivery: true,
      copyMethod: "same-parent-staging-directory-then-atomic-rename",
      attachmentOnly: true,
      attachments: ATTACHMENTS,
    },
    postValidation: {
      packetCheck: { result: "PASS", attachmentCount: ATTACHMENTS.length, manifestSha256: EXPECTED.packetManifest },
      immutableInputs: validation.immutableInputs,
      roleHomeAttachmentInventory: "PASS",
      pairLifecycleRemainsPreflightOnly: true,
      siteDirectoriesRemainAbsent: { baseline: true, current: true },
      p11: { status: "BLOCKED", authorization: "NOT_AUTHORIZED" },
    },
    result: {
      roleHomeCopied: true,
      roleDelivered: true,
      roleLaunched: false,
      implementation: false,
      returnApplied: false,
      siteCreatedOrMutated: false,
      lifecycleMutated: false,
      browserOrFigmaMeasurement: false,
      p11Changed: false,
    },
    freshRoleLaunchObservation: { created: false, status: "NOT_OBSERVED" },
  };
}
function createReceipt(bytes) {
  const parent = dirname(RECEIPT_PATH);
  const parentExisted = existsSync(parent);
  if (!parentExisted) mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertDirectory(parent, "delivery receipt parent");
  assertAbsent(RECEIPT_PATH, "delivery receipt");
  writeFileSync(RECEIPT_PATH, bytes, { flag: "wx", mode: 0o600 });
  return { parentExisted };
}
function removeReceipt(bytes, receiptState) {
  if (existsSync(RECEIPT_PATH)) {
    assert(sha256(readRegular(RECEIPT_PATH, "owned delivery receipt")) === sha256(bytes), "receipt rollback refuses changed bytes.");
    rmSync(RECEIPT_PATH, { force: false, maxRetries: 0 });
  }
  if (!receiptState.parentExisted && existsSync(dirname(RECEIPT_PATH))) {
    assert(readdirSync(dirname(RECEIPT_PATH)).length === 0, "receipt rollback parent is not empty.");
    rmdirSync(dirname(RECEIPT_PATH));
  }
}

async function dryRun() {
  const validation = await validatePreconditions();
  return {
    status: "validated-dry-run",
    externalWritesPerformed: false,
    activationId: ACTIVATION_ID,
    opaqueHandoffId: HANDOFF_ID,
    roleHome: { path: posix(ROLE_HOME), mustRemainAbsentUntilApply: true },
    sourcePacketRoot: posix(PACKET_ROOT),
    attachments: ATTACHMENTS,
    packetCheck: { result: "PASS", attachmentCount: validation.packetManifest.roleAttachments.length, manifestSha256: EXPECTED.packetManifest },
    wouldAppendReceipt: posix(RECEIPT_PATH),
    prohibitedActions: { roleLaunch: false, implementation: false, returnApply: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false },
  };
}

async function apply() {
  const initial = await validatePreconditions();
  ensureParentForStage(ROLE_HOME_PARENT);
  const stage = join(ROLE_HOME_PARENT, `.${HANDOFF_ID}.delivery-stage-${randomUUID()}`);
  assertAbsent(stage, "role-home staging directory");
  let stageCreated = false;
  let promoted = false;
  let receiptBytes = null;
  let receiptState = null;
  try {
    mkdirSync(stage, { mode: 0o700 });
    stageCreated = true;
    copyAttachments(PACKET_ROOT, stage);
    const beforePublish = await validatePreconditions();
    exact(beforePublish.packetManifest, initial.packetManifest, "pre-publish packet manifest");
    assertAbsent(ROLE_HOME, "fresh role home immediately before publish");
    renameSync(stage, ROLE_HOME);
    stageCreated = false;
    promoted = true;
    attachmentInventory(ROLE_HOME, "published role home");
    const deliveredAt = new Date().toISOString();
    receiptBytes = jsonBytes(deliveryReceipt({ deliveredAt, validation: beforePublish }));
    receiptState = createReceipt(receiptBytes);
    await validatePreconditions({ receiptBytes });
    return {
      status: "delivered",
      externalWritesPerformed: true,
      activationId: ACTIVATION_ID,
      opaqueHandoffId: HANDOFF_ID,
      roleHome: posix(ROLE_HOME),
      receipt: { path: posix(RECEIPT_PATH), sha256: sha256(receiptBytes), bytes: receiptBytes.length },
      attachments: ATTACHMENTS,
      result: { roleHomeCopied: true, roleDelivered: true, roleLaunched: false, implementation: false, returnApplied: false, siteCreatedOrMutated: false, lifecycleMutated: false, browserOrFigmaMeasurement: false, p11Changed: false },
    };
  } catch (error) {
    const rollbackErrors = [];
    try { if (receiptBytes && receiptState) removeReceipt(receiptBytes, receiptState); }
    catch (rollbackError) { rollbackErrors.push(`receipt rollback: ${rollbackError.message}`); }
    try {
      if (promoted) {
        attachmentInventory(ROLE_HOME, "published role home rollback");
        assertAbsent(stage, "rollback staging destination");
        renameSync(ROLE_HOME, stage);
        promoted = false;
        stageCreated = true;
      }
      if (stageCreated) removeOwnedTree(stage, ATTACHMENTS, "role-home staging");
    } catch (rollbackError) { rollbackErrors.push(`role-home rollback: ${rollbackError.message}`); }
    if (rollbackErrors.length) error.message = `${error.message}; ${rollbackErrors.join("; ")}`;
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--apply"].includes(args[0])) {
    fail("Usage: node tools/r4-deliver-baseline-reissue-seq1.mjs --dry-run | --apply");
  }
  const result = args[0] === "--dry-run" ? await dryRun() : await apply();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`P3 R4 BASELINE REISSUE DELIVERY: ${error.message}\n`);
  process.exitCode = 1;
});
