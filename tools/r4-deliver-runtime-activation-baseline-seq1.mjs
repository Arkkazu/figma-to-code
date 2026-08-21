#!/usr/bin/env node
// P-3 R4 baseline implementation, sequence-1 attachment-only delivery.
//
// This tool is intentionally narrower than runtime activation.  It can copy
// only the checked role-visible packet into the empty a-impl role home and
// append a coordinator-only delivery receipt.  It never launches a role,
// invokes implementation, writes a worktree, touches the lifecycle ledger,
// measures a browser/Figma surface, or changes P-11.
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { checkRolePacket } from "../templates/verify/p3-role-packet.mjs";
import { hashInputStaging } from "../templates/verify/p3-role-return.mjs";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const ACTIVATION_ID = "f8657db3a6c739184e02a6d411efaee3965dea822508791a46eb9914c2b91a6c";
const HANDOFF_ID = "624e2521f5e3f95d3f0ed3d193349b63";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;
const ACTIVATION_ROOT = `${COORDINATOR}/runtime-activations/v2/${ACTIVATION_ID}`;
const ROLE_HOME = "C:/Users/tane1/AppData/Local/p3-role-homes/a-impl";
const ROLE_HOME_PARENT = dirname(ROLE_HOME);
const DELIVERY_ROOT_RELATIVE = "packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery";
const INPUT_ROOT_RELATIVE = `${DELIVERY_ROOT_RELATIVE}/input`;
const DELIVERY_RECEIPT_RELATIVE = `delivery-receipts/baseline-implementation-delivery-1-${HANDOFF_ID}.json`;

const EXPECTED = Object.freeze({
  activationReceipt: "dc12154c14cf7b2947b02b6b49e46c4d53150492e5b173d6f814d791b72d984f",
  packetManifest: "d54ebb62ddc0116b3fed01ba615ca3409e0287951690ed4f565eeeac0cf5e567",
  packetPlan: "43fde0c784aad707d4ceb52adeb7356e93c39670a20facd17ac487bcf5cbe42b",
  assignment: "ea1763c3680497789c7cde17d6d9a37b3741a62a7d10ac1a6905acde932bc4f5",
  pcReference: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0",
  spReference: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427",
  visibleAuthority: "ceed95fc4f3debcec8af2427a10fbf77ffcb60811690640631ecb65341de3504",
  protocol: "55573130d5bacfe5f0ff66e52eae47980bae8e3c23b871aa811712f9bd671cef",
  registry: "a3a84f0fc30bd7616c7653a02230022a7103aaacb0454ca415888806809b0f66",
  returnPlan: "660fec0e43e16b166476dba851c0cef66e7b55d7cde7d1d8fa4b5584ef84552d",
  runtimeAuthority: "a2ae224d9eb45ec03bcf4533207fb0ab733a203f095363f5c037c36fffa998ee",
  inputStaging: "8e3340b76e2c8c08a9409699f09f2bdb210533f328e656ed73e76dff85a885af",
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  pairLock: "fd5ba36af2299b20bbd735bf072958573221c75858a6598931698094fd006b94",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  baselineActive: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentActive: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  decisionJ: "e1497dee0be929a01d21d520eab743d8c7f71ca7f910deacfafabc83f3440ab5",
  baselineContract: "ef4c911cf48951365294cea604a86896c25d7ed656872661cb23cc54dc1c7166",
  currentContract: "06d8d35c5048d48f63c920126371f29073aba9a8c3cbe168cf97bdc33efac342",
  v4Protocol: "a4c0202ee603ea63c4a5d05f35bdda0944305a20ab756358740ba692a8499919",
  v4Authority: "616197ba6063f316731da4f07ebb1d2795d2674c3ebe59b26cd91b6a79d71e97",
  approvedDesign: "8c4fb215a0a3ead792fc3742eb336d45c9517501b40fcb5e59f1d807993d2313",
});

const EXPECTED_OUTPUTS = Object.freeze([
  { relativePath: "packet-manifest-baseline-delivery-1.json", sha256: EXPECTED.packetManifest, bytes: 6415 },
  { relativePath: "packet-plan-baseline-delivery-1.json", sha256: EXPECTED.packetPlan, bytes: 2383 },
  { relativePath: `${INPUT_ROOT_RELATIVE}/assignment.json`, sha256: EXPECTED.assignment, bytes: 4351 },
  { relativePath: `${INPUT_ROOT_RELATIVE}/references/pc-first-view.png`, sha256: EXPECTED.pcReference, bytes: 413224 },
  { relativePath: `${INPUT_ROOT_RELATIVE}/references/sp-first-view.png`, sha256: EXPECTED.spReference, bytes: 168441 },
  { relativePath: `${DELIVERY_ROOT_RELATIVE}/return-authority.json`, sha256: EXPECTED.visibleAuthority, bytes: 1307 },
  { relativePath: "protocol-baseline.json", sha256: EXPECTED.protocol, bytes: 28483 },
  { relativePath: "protocol-current.json", sha256: EXPECTED.protocol, bytes: 28483 },
  { relativePath: "registry-baseline-delivery-1.json", sha256: EXPECTED.registry, bytes: 6085 },
  { relativePath: "return-plan-baseline-seq1-attempt1.json", sha256: EXPECTED.returnPlan, bytes: 9912 },
  { relativePath: "runtime-authority-baseline-delivery-1.json", sha256: EXPECTED.runtimeAuthority, bytes: 7539 },
]);

const EXPECTED_ATTACHMENTS = Object.freeze([
  {
    logicalPath: "input/assignment.json",
    path: "input/assignment.json",
    sha256: EXPECTED.assignment,
    bytes: 4351,
    origin: "coordinator-authored redacted baseline sequence-1 role input",
  },
  {
    logicalPath: "input/references/pc-first-view.png",
    path: "input/references/pc-first-view.png",
    sha256: EXPECTED.pcReference,
    bytes: 413224,
    origin: "saved frozen Figma reference export copied by the coordinator",
  },
  {
    logicalPath: "input/references/sp-first-view.png",
    path: "input/references/sp-first-view.png",
    sha256: EXPECTED.spReference,
    bytes: 168441,
    origin: "saved frozen Figma reference export copied by the coordinator",
  },
  {
    logicalPath: "return-authority.json",
    path: "return-authority.json",
    sha256: EXPECTED.visibleAuthority,
    bytes: 1307,
    origin: "coordinator-authored redacted baseline sequence-1 role input",
  },
]);

const EXPECTED_RELEASE = Object.freeze([
  { id: "return-helper", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-return.mjs", sha256: "7ad82ecbb7ecf7678071ff5e857b0d0312851180911750da92f5f5d0a7fbb89d" },
  { id: "return-helper-e2e", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-return.e2e.mjs", sha256: "5a1bc396f10523680fe3cc85e606fe57f2e3ac477184ce33786cf41a8a4ec2fc" },
  { id: "return-plan-template", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-return-plan-template.json", sha256: "7212cd022b4b5fb5634d14c63d382ad275ee3723a849b60fa6d53576ae77f730" },
  { id: "return-manifest-template", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-return-manifest-template.json", sha256: "6fb1e5175cb7db9a713adb4a8a5e68acf13b45d88c05885397e71ce52b118361" },
  { id: "return-feedback-template", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-return-feedback-template.json", sha256: "f63ec9b9b6ebee92b4d17d70fb66d6b976c7c461b3f05c4f5b9d5be824e0f4c9" },
  { id: "protocol-template", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-handoff-protocol-template.json", sha256: "12a6cb01c87b2c0239c78feb2216faf632baf66cee30ba6647e18f646aa96e5b" },
  { id: "registry-template", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-handoff-registry-template.json", sha256: "d8bb833bb593a9045bcff4ab0dd2949c5a32ac5d151f5f90646a07b35f377918" },
  { id: "packet-helper", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-packet.mjs", sha256: "69fc169f186dfd1c8dff69616eac8977900e5de77b8c5734468a96bf4a99af07" },
  { id: "packet-plan-template", genericPath: "C:/AI/figma-to-code/templates/verify/p3-role-packet-plan-template.json", sha256: "8ca2441d02fd0583e4d596f2ef78123874af6d60efb180be427fb3ed1632dbea" },
]);

const EXPECTED_IMMUTABLE = Object.freeze({
  approvedDesign: { path: "C:/AI/figma-to-code/tools/r4-return-authority-v4-design.json", sha256: EXPECTED.approvedDesign },
  decisionJ: { path: `${BASELINE}/MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json`, sha256: EXPECTED.decisionJ },
  baselineContract: { path: `${BASELINE}/MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json`, sha256: EXPECTED.baselineContract },
  currentContract: { path: `${CURRENT}/MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json`, sha256: EXPECTED.currentContract },
  ledger: { path: `${PILOT}/.git/figma-p3-comparison-ledger.jsonl`, sha256: EXPECTED.ledger },
  pairLock: { path: `${PILOT}/.git/figma-p3-comparison-pair-locks/55b8f4a26446c19fdfe5c43d2dae08e2b7715e31d1befee1f82257e36c0e4bac.json`, sha256: EXPECTED.pairLock },
  baselinePreflightState: { path: `${BASELINE}/.figma-gate/active.json`, sha256: EXPECTED.baselineActive },
  currentPreflightState: { path: `${CURRENT}/.figma-gate/active.json`, sha256: EXPECTED.currentActive },
  p11BlockedRecord: { path: `${COORDINATOR}/records/p3-p11-authorization-${PAIR_ID}.json`, sha256: EXPECTED.p11 },
  v4Protocol: { path: `${COORDINATOR}/return-authority/v4/c5ec0969c8e5882d51b4d966124f87557138bf1725315fa8b42cd368e1131cad/protocols/baseline/p3-role-handoff-protocol-v2.json`, sha256: EXPECTED.v4Protocol },
  baselineV4Authority: { path: `${COORDINATOR}/return-authority/v4/c5ec0969c8e5882d51b4d966124f87557138bf1725315fa8b42cd368e1131cad/authorities/baseline/p3-role-return-authority-v1.json`, sha256: EXPECTED.v4Authority },
});

const DELIVERY_BOUNDARY = Object.freeze({
  roleHomeCopied: true,
  roleDelivered: true,
  roleLaunched: false,
  implementationExecuted: false,
  siteCreatedOrMutated: false,
  lifecycleMutated: false,
  browserOrFigmaMeasurement: false,
  p11Changed: false,
  freshRoleLaunchObservationCreated: false,
});

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function posix(path) { return resolve(path).replace(/\\/g, "/"); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function exact(left, right, label) {
  assert(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)), `${label} is not exact.`);
}
function assertDigest(value, label) {
  assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), `${label} must be a lowercase SHA-256.`);
  return value;
}
function lstatOrNull(path) {
  try { return lstatSync(path); }
  catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}
function assertAbsent(path, label) {
  assert(lstatOrNull(path) === null, `${label} already exists: ${posix(path)}`);
}
function assertRealDirectory(path, label) {
  const info = lstatOrNull(path);
  assert(info && !info.isSymbolicLink() && info.isDirectory(), `${label} must be a real directory: ${posix(path)}`);
  return info;
}
function readRegular(path, label) {
  const info = lstatOrNull(path);
  assert(info && !info.isSymbolicLink() && info.isFile(), `${label} must be a regular, non-symlink file: ${posix(path)}`);
  return readFileSync(path);
}
function checkedFile(path, expected, label) {
  assertDigest(expected, `${label} expected digest`);
  const bytes = readRegular(path, label);
  const actual = sha256(bytes);
  assert(actual === expected, `${label} SHA-256 changed: expected ${expected}, got ${actual}.`);
  return { path: posix(path), sha256: actual, bytes };
}
function readJson(path, label) {
  try { return JSON.parse(readRegular(path, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function checkedJson(path, expected, label) {
  const file = checkedFile(path, expected, label);
  try { return { ...file, value: JSON.parse(file.bytes.toString("utf8")) }; }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function assertWithin(root, candidate, label) {
  const route = relative(resolve(root), resolve(candidate));
  assert(route === "" || (!route.startsWith("..") && !route.startsWith("..\\") && !isAbsolute(route)), `${label} escapes its root.`);
}
function safeRelativePath(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  assert(!value.includes("\\") && !value.includes("\0") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value), `${label} must be slash-relative.`);
  const segments = value.split("/");
  assert(segments.every((segment) => segment !== "" && segment !== "." && segment !== ".."), `${label} contains a traversal segment.`);
  assert(segments.every((segment) => !segment.endsWith(".") && !segment.endsWith(" ") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(segment)), `${label} contains an NTFS-ambiguous segment.`);
  const normalized = normalize(value).replace(/\\/g, "/");
  assert(normalized === value, `${label} is not canonical.`);
  return value;
}
function safeChild(root, relativePath, label) {
  const safe = safeRelativePath(relativePath, label);
  const candidate = join(root, ...safe.split("/"));
  assertWithin(root, candidate, label);
  return candidate;
}
function listTree(root, label) {
  assertRealDirectory(root, label);
  const files = [];
  const directories = [];
  function walk(directory, prefix = "") {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "variant" }));
    for (const child of children) {
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const safe = safeRelativePath(relativePath, `${label} entry`);
      const full = safeChild(root, safe, `${label} entry`);
      const info = lstatSync(full);
      assert(!info.isSymbolicLink(), `${label} contains a symbolic link: ${safe}`);
      if (info.isDirectory()) {
        directories.push(safe);
        walk(full, safe);
      } else {
        assert(info.isFile(), `${label} contains a non-regular entry: ${safe}`);
        files.push({ relativePath: safe, sha256: sha256(readFileSync(full)), bytes: info.size });
      }
    }
  }
  walk(root);
  return { files, directories };
}
function directorySetFor(paths) {
  const directories = new Set();
  for (const path of paths) {
    const segments = safeRelativePath(path, "declared attachment path").split("/");
    for (let index = 1; index < segments.length; index += 1) directories.add(segments.slice(0, index).join("/"));
  }
  return [...directories].sort();
}
function assertTree(root, expectedFiles, label, { extraDirectories = [] } = {}) {
  const actual = listTree(root, label);
  const normalizedExpected = expectedFiles.map((entry) => ({
    relativePath: safeRelativePath(entry.relativePath, `${label} expected path`),
    sha256: assertDigest(entry.sha256, `${label} expected digest`),
    bytes: entry.bytes,
  })).sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  const expectedDirectories = [...new Set([...directorySetFor(normalizedExpected.map((entry) => entry.relativePath)), ...extraDirectories])].sort();
  exact(actual.files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en")), normalizedExpected, `${label} file inventory`);
  exact([...actual.directories].sort(), expectedDirectories, `${label} directory inventory`);
  return actual;
}
function assertDirectoryEmpty(path, label) {
  assertRealDirectory(path, label);
  assert(readdirSync(path, { withFileTypes: true }).length === 0, `${label} must be exactly empty.`);
}
function assertReference(actual, expected, label) {
  exact(actual, expected, label);
  checkedFile(expected.path, expected.sha256, `${label} source`);
}
function stableHash(value) { return sha256(Buffer.from(JSON.stringify(canonical(value)), "utf8")); }

function checkLocalRelease(receipt) {
  exact(receipt.release, EXPECTED_RELEASE, "activation receipt helper release");
  for (const release of EXPECTED_RELEASE) checkedFile(release.genericPath, release.sha256, `release ${release.id}`);
}

function validateActivationRoot({ deliveryReceiptBytes = null } = {}) {
  const expectedFiles = [
    { relativePath: "activation-receipt.json", sha256: EXPECTED.activationReceipt, bytes: 7824 },
    ...EXPECTED_OUTPUTS,
  ];
  if (deliveryReceiptBytes !== null) {
    expectedFiles.push({ relativePath: DELIVERY_RECEIPT_RELATIVE, sha256: sha256(deliveryReceiptBytes), bytes: deliveryReceiptBytes.length });
  }
  const extraDirectories = ["progress", "progress/checkpoint-proofs"];
  if (deliveryReceiptBytes !== null) extraDirectories.push("delivery-receipts");
  assertTree(ACTIVATION_ROOT, expectedFiles, "runtime activation root", { extraDirectories });
  const receipt = checkedJson(join(ACTIVATION_ROOT, "activation-receipt.json"), EXPECTED.activationReceipt, "runtime activation receipt").value;
  assert(receipt.schema === "p3-r4-runtime-activation-receipt/v2" && receipt.recordState === "finalized", "activation receipt schema/state changed.");
  assert(receipt.activationId === ACTIVATION_ID && receipt.pairId === PAIR_ID && receipt.condition === "baseline", "activation receipt identity changed.");
  exact(receipt.recipient, { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: HANDOFF_ID }, "activation receipt recipient");
  exact(receipt.outputs, EXPECTED_OUTPUTS, "activation receipt outputs");
  assert(receipt.packetCheck?.result === "PASS" && receipt.packetCheck?.attachmentCount === EXPECTED_ATTACHMENTS.length && receipt.packetCheck?.manifestSha256 === EXPECTED.packetManifest,
    "activation receipt packet check changed.");
  checkLocalRelease(receipt);
  exact(receipt.result, {
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
  }, "activation receipt original boundary");
  if (deliveryReceiptBytes !== null) {
    const persisted = readRegular(safeChild(ACTIVATION_ROOT, DELIVERY_RECEIPT_RELATIVE, "delivery receipt path"), "delivery receipt");
    assert(persisted.equals(deliveryReceiptBytes), "persisted delivery receipt differs from the post-copy record.");
  } else {
    assertAbsent(safeChild(ACTIVATION_ROOT, DELIVERY_RECEIPT_RELATIVE, "delivery receipt path"), "delivery receipt");
  }
  return receipt;
}

function validateNoVisibleIdentity(value) {
  const prohibited = new Set(["pairId", "condition", "workspaceId", "worktreeRoot", "actor", "contextId", "evidencePath", "otherWorkspaceId"]);
  function visit(node, path = "$") {
    if (Array.isArray(node)) return node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      assert(!prohibited.has(key), `role-visible packet contains forbidden identity key ${path}.${key}.`);
      visit(child, `${path}.${key}`);
    }
  }
  visit(value);
}

function validateRuntimeBindings(receipt) {
  const protocolBaseline = checkedJson(join(ACTIVATION_ROOT, "protocol-baseline.json"), EXPECTED.protocol, "runtime baseline protocol");
  const protocolCurrent = checkedFile(join(ACTIVATION_ROOT, "protocol-current.json"), EXPECTED.protocol, "runtime current protocol");
  assert(protocolBaseline.bytes.equals(protocolCurrent.bytes), "runtime A/B protocol bytes differ.");
  const protocol = protocolBaseline.value;
  assert(protocol.schema === "p3-role-handoff-protocol/v2" && protocol.recordState === "finalized" && protocol.ownerApproved === true
    && protocol.aBIdentical === true && protocol.aBByteIdentical === true && protocol.executionState === false,
  "runtime protocol state changed.");
  exact(protocol.executionBoundary, {
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
  }, "runtime protocol execution boundary");
  assert(Array.isArray(protocol.runtimeActivationRequired) && protocol.runtimeActivationRequired.includes("separate owner-operated role-home delivery receipt before actual delivery"),
    "runtime protocol no longer requires the separate delivery receipt.");

  const planPath = join(ACTIVATION_ROOT, "packet-plan-baseline-delivery-1.json");
  checkedFile(planPath, EXPECTED.packetPlan, "runtime packet plan");
  const freshManifest = checkRolePacket(planPath);
  const persistedManifest = checkedJson(join(ACTIVATION_ROOT, "packet-manifest-baseline-delivery-1.json"), EXPECTED.packetManifest, "runtime packet manifest");
  assert(jsonBytes(freshManifest).equals(persistedManifest.bytes), "runtime packet manifest differs from a fresh packet check.");
  const manifest = persistedManifest.value;
  assert(manifest.coordinatorOnly === true && manifest.packetRoot === DELIVERY_ROOT_RELATIVE && manifest.attachmentCount === EXPECTED_ATTACHMENTS.length,
    "runtime packet manifest scope changed.");
  exact(manifest.roleAttachments.map(({ logicalPath, path, sha256: digest, origin }) => ({ logicalPath, path, sha256: digest, origin })),
    EXPECTED_ATTACHMENTS.map(({ logicalPath, path, sha256: digest, origin }) => ({ logicalPath, path, sha256: digest, origin })),
  "runtime packet manifest role attachments");
  assert(manifest.scan?.authorityBinding === "comparison-contract-and-owner-decision-j-clear" && manifest.scan?.derivedPeerIdentity === "clear"
    && manifest.scan?.checksums === "clear", "runtime packet manifest scan changed.");

  const registry = checkedJson(join(ACTIVATION_ROOT, "registry-baseline-delivery-1.json"), EXPECTED.registry, "runtime registry").value;
  assert(registry.schema === "p3-role-handoff-registry/v2" && registry.recordState === "finalized" && registry.ownerApproved === true
    && registry.executionState === false && registry.coordinatorOnly === true && registry.deliveryMode === "attachment-only",
  "runtime registry state changed.");
  exact(registry.deliveryProgress, { version: 1, scope: "per-condition", initialDeliverySequence: 1, increment: 1 }, "runtime registry delivery progress");
  assert(registry.protocol?.path === "protocol-baseline.json" && registry.protocol?.sha256 === EXPECTED.protocol, "runtime registry protocol binding changed.");
  assert(Array.isArray(registry.recipientPackets) && registry.recipientPackets.length === 1, "runtime registry recipient count changed.");
  const registryRecipient = registry.recipientPackets[0];
  assert(registryRecipient.opaqueHandoffId === HANDOFF_ID && registryRecipient.roleKind === "implementation"
    && registryRecipient.coordinatorConditionBinding === "baseline" && registryRecipient.deliverySequence === 1
    && registryRecipient.deliveryMode === "attachment-only" && registryRecipient.packetCheck?.result === "PASS"
    && registryRecipient.identityLeakScan?.result === "clear", "runtime registry recipient binding changed.");
  exact(registryRecipient.attachments.map(({ logicalPath, origin, sha256: digest }) => ({ logicalPath, origin, sha256: digest })),
    EXPECTED_ATTACHMENTS.map(({ logicalPath, origin, sha256: digest }) => ({ logicalPath, origin, sha256: digest })),
  "runtime registry attachment binding");
  exact(registryRecipient.packetManifest, { path: "packet-manifest-baseline-delivery-1.json", sha256: EXPECTED.packetManifest }, "runtime registry manifest binding");

  const returnPlan = checkedJson(join(ACTIVATION_ROOT, "return-plan-baseline-seq1-attempt1.json"), EXPECTED.returnPlan, "runtime return plan").value;
  assert(returnPlan.version === 5 && returnPlan.kind === "p3-role-return-plan" && returnPlan.authority?.condition === "baseline"
    && returnPlan.authority?.handoff?.opaqueHandoffId === HANDOFF_ID && returnPlan.authority?.handoff?.deliverySequence === 1,
  "runtime return plan handoff changed.");
  exact(returnPlan.authority.handoff.protocol, {
    self: { path: "protocol-baseline.json", sha256: EXPECTED.protocol },
    peer: { path: "protocol-current.json", sha256: EXPECTED.protocol },
  }, "runtime return plan protocol binding");
  exact(returnPlan.authority.handoff.registry, { path: "registry-baseline-delivery-1.json", sha256: EXPECTED.registry }, "runtime return plan registry binding");
  exact(returnPlan.authority.handoff.packetManifest, { path: "packet-manifest-baseline-delivery-1.json", sha256: EXPECTED.packetManifest }, "runtime return plan manifest binding");

  const authority = checkedJson(join(ACTIVATION_ROOT, "runtime-authority-baseline-delivery-1.json"), EXPECTED.runtimeAuthority, "runtime authority").value;
  assert(authority.schema === "p3-r4-runtime-activation-authority/v2" && authority.recordState === "finalized" && authority.ownerApproved === true
    && authority.state === "delivery-ready-not-delivered" && authority.coordinatorOnly === true
    && authority.deliveryReceiptRequiredBeforeRoleHomeCopy === true && authority.actualRoleHomeCopy === false
    && authority.actualRoleLaunch === false && authority.actualImplementation === false,
  "runtime authority pre-delivery state changed.");
  exact(authority.recipient, { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: HANDOFF_ID }, "runtime authority recipient");
  exact(authority.runtimeBindings, {
    protocolBaseline: { path: "protocol-baseline.json", sha256: EXPECTED.protocol },
    protocolCurrent: { path: "protocol-current.json", sha256: EXPECTED.protocol },
    registry: { path: "registry-baseline-delivery-1.json", sha256: EXPECTED.registry },
    packetPlan: { path: "packet-plan-baseline-delivery-1.json", sha256: EXPECTED.packetPlan },
    packetManifest: { path: "packet-manifest-baseline-delivery-1.json", sha256: EXPECTED.packetManifest },
    returnPlan: { path: "return-plan-baseline-seq1-attempt1.json", sha256: EXPECTED.returnPlan },
    inputStaging: { path: INPUT_ROOT_RELATIVE, sha256: EXPECTED.inputStaging },
  }, "runtime authority bindings");
  exact(authority.executionBoundary, {
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
  }, "runtime authority execution boundary");

  const deliveryRoot = safeChild(ACTIVATION_ROOT, DELIVERY_ROOT_RELATIVE, "role-visible delivery root");
  const sourceAttachments = EXPECTED_ATTACHMENTS.map((entry) => ({ relativePath: entry.path, sha256: entry.sha256, bytes: entry.bytes }));
  assertTree(deliveryRoot, sourceAttachments, "role-visible packet staging");
  const inputRoot = safeChild(ACTIVATION_ROOT, INPUT_ROOT_RELATIVE, "role-visible input staging");
  assert(hashInputStaging(inputRoot) === EXPECTED.inputStaging, "role-visible input staging hash changed.");
  const visibleAuthority = checkedJson(safeChild(deliveryRoot, "return-authority.json", "role-visible return authority"), EXPECTED.visibleAuthority, "role-visible return authority").value;
  assert(visibleAuthority.schema === "p3-role-visible-return-authority/v1" && visibleAuthority.kind === "component-return-instruction"
    && visibleAuthority.deliveryMode === "attachment-only" && visibleAuthority.handoff?.opaqueHandoffId === HANDOFF_ID
    && visibleAuthority.handoff?.deliverySequence === 1 && visibleAuthority.handoff?.handoffProtocolSha256 === EXPECTED.protocol,
  "role-visible return authority handoff changed.");
  exact(visibleAuthority.inputStaging, { logicalRoot: "input", sha256: EXPECTED.inputStaging }, "role-visible input staging binding");
  assert(visibleAuthority.prohibited?.includes("role-launch"), "role-visible authority no longer prohibits role launch.");
  validateNoVisibleIdentity(visibleAuthority);
  const assignment = checkedJson(safeChild(inputRoot, "assignment.json", "role-visible assignment"), EXPECTED.assignment, "role-visible assignment").value;
  assert(assignment.schema === "p3-role-component-assignment/v2" && assignment.kind === "implementation-component-assignment"
    && assignment.handoff?.opaqueHandoffId === HANDOFF_ID && assignment.handoff?.deliverySequence === 1
    && assignment.handoff?.handoffProtocolSha256 === EXPECTED.protocol && assignment.component?.sequence === 1 && assignment.component?.attempt === 1,
  "role-visible assignment changed.");
  exact(assignment.changeAuthority, {
    allowedChangeTargets: ["site/index.html", "site/styles.css"],
    attemptOneCreatePaths: ["site/index.html", "site/styles.css"],
    derivedBootstrapDirectories: ["site"],
    laterAttemptCreationAllowed: false,
    outOfScopePathChangeAllowed: false,
  }, "role-visible assignment change authority");
  assertReference(receipt.immutableInputs.v4Protocol, { path: EXPECTED_IMMUTABLE.v4Protocol.path, sha256: EXPECTED.v4Protocol }, "activation receipt v4 protocol");
  assertReference(receipt.immutableInputs.baselineV4Authority, { path: EXPECTED_IMMUTABLE.baselineV4Authority.path, sha256: EXPECTED.v4Authority }, "activation receipt v4 authority");
  return { protocol, manifest, registry, returnPlan, authority, visibleAuthority, assignment };
}

function validateImmutableInputs() {
  const snapshot = {};
  for (const [id, reference] of Object.entries(EXPECTED_IMMUTABLE)) {
    snapshot[id] = { path: posix(reference.path), sha256: checkedFile(reference.path, reference.sha256, `immutable ${id}`).sha256 };
  }
  const p11 = readJson(EXPECTED_IMMUTABLE.p11BlockedRecord.path, "immutable P-11 blocked record");
  assert(p11.status === "BLOCKED" && (p11.authorization === "NOT_AUTHORIZED" || p11.p11Authorization === "NOT_AUTHORIZED"),
    "P-11 is no longer BLOCKED/NOT_AUTHORIZED.");
  assertAbsent(join(BASELINE, "site"), "baseline site directory");
  assertAbsent(join(CURRENT, "site"), "current site directory");
  return {
    files: snapshot,
    siteDirectoriesAbsent: { baseline: true, current: true },
    p11: { status: p11.status, authorization: p11.authorization ?? p11.p11Authorization },
  };
}

function validatePreconditions() {
  assertRealDirectory(ACTIVATION_ROOT, "runtime activation root");
  assertRealDirectory(ROLE_HOME_PARENT, "a-impl role-home parent");
  assertWithin(ROLE_HOME_PARENT, ROLE_HOME, "a-impl role home");
  assert(relative(resolve(ROLE_HOME_PARENT), resolve(ROLE_HOME)).split(/[\\/]/).length === 1, "a-impl role home must remain a direct child of its parent.");
  const receipt = validateActivationRoot();
  const bindings = validateRuntimeBindings(receipt);
  const immutable = validateImmutableInputs();
  assertDirectoryEmpty(ROLE_HOME, "a-impl role home");
  return { receipt, bindings, immutable };
}

function createDirectoryWithin(root, relativeDirectory, label) {
  const segments = relativeDirectory === "" ? [] : safeRelativePath(relativeDirectory, label).split("/");
  let cursor = root;
  assertRealDirectory(cursor, `${label} root`);
  for (const segment of segments) {
    cursor = join(cursor, segment);
    const existing = lstatOrNull(cursor);
    if (existing === null) mkdirSync(cursor, { mode: 0o700 });
    assertRealDirectory(cursor, label);
  }
  return cursor;
}
function createStage(stagePath) {
  assertWithin(ROLE_HOME_PARENT, stagePath, "delivery staging path");
  assert(relative(resolve(ROLE_HOME_PARENT), resolve(stagePath)).split(/[\\/]/).length === 1, "delivery staging path must be a direct role-home-parent child.");
  assertAbsent(stagePath, "delivery staging path");
  mkdirSync(stagePath, { mode: 0o700 });
  assertRealDirectory(stagePath, "delivery staging path");
}
function copyRoleVisibleAttachments(stagePath) {
  const deliveryRoot = safeChild(ACTIVATION_ROOT, DELIVERY_ROOT_RELATIVE, "role-visible delivery root");
  for (const attachment of EXPECTED_ATTACHMENTS) {
    const source = safeChild(deliveryRoot, attachment.path, `source attachment ${attachment.path}`);
    const bytes = checkedFile(source, attachment.sha256, `source attachment ${attachment.path}`).bytes;
    assert(bytes.length === attachment.bytes, `source attachment ${attachment.path} byte length changed.`);
    const target = safeChild(stagePath, attachment.path, `staged attachment ${attachment.path}`);
    const parentRelative = dirname(attachment.path).replace(/\\/g, "/");
    if (parentRelative !== ".") createDirectoryWithin(stagePath, parentRelative, `staged attachment parent ${attachment.path}`);
    assertWithin(stagePath, target, `staged attachment ${attachment.path}`);
    writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  }
  assertTree(stagePath, EXPECTED_ATTACHMENTS.map(({ path, sha256: digest, bytes }) => ({ relativePath: path, sha256: digest, bytes })), "delivery staging");
}
function validateRoleHomePopulated() {
  return assertTree(ROLE_HOME, EXPECTED_ATTACHMENTS.map(({ path, sha256: digest, bytes }) => ({ relativePath: path, sha256: digest, bytes })), "a-impl role home");
}
function cleanupOwnedStage(stagePath) {
  const info = lstatOrNull(stagePath);
  if (!info) return;
  assert(!info.isSymbolicLink() && info.isDirectory(), "delivery staging cleanup refuses a non-real directory.");
  assertWithin(ROLE_HOME_PARENT, stagePath, "delivery staging cleanup path");
  const actual = listTree(stagePath, "delivery staging cleanup");
  const expectedByPath = new Map(EXPECTED_ATTACHMENTS.map((entry) => [entry.path, entry]));
  for (const file of actual.files) {
    const expected = expectedByPath.get(file.relativePath);
    assert(expected && expected.sha256 === file.sha256 && expected.bytes === file.bytes, `delivery staging cleanup refuses an unexpected file: ${file.relativePath}`);
  }
  const allowedDirectories = new Set(directorySetFor(EXPECTED_ATTACHMENTS.map((entry) => entry.path)));
  assert(actual.directories.every((entry) => allowedDirectories.has(entry)), "delivery staging cleanup refuses an unexpected directory.");
  for (const file of [...actual.files].sort((left, right) => right.relativePath.localeCompare(left.relativePath, "en"))) {
    unlinkSync(safeChild(stagePath, file.relativePath, "delivery staging cleanup file"));
  }
  for (const directory of [...actual.directories].sort((left, right) => right.split("/").length - left.split("/").length || right.localeCompare(left, "en"))) {
    rmdirSync(safeChild(stagePath, directory, "delivery staging cleanup directory"));
  }
  rmdirSync(stagePath);
}

function deliveryReceiptPayload({ deliveredAt, validation }) {
  const deliveryId = stableHash({
    schema: "p3-r4-runtime-delivery-receipt/v1",
    activationId: ACTIVATION_ID,
    pairId: PAIR_ID,
    handoffId: HANDOFF_ID,
    roleHome: posix(ROLE_HOME),
    attachments: EXPECTED_ATTACHMENTS.map(({ logicalPath, sha256: digest }) => ({ logicalPath, sha256: digest })),
  });
  return {
    schema: "p3-r4-runtime-delivery-receipt/v1",
    recordState: "finalized",
    deliveryId,
    deliveryExecutedAt: deliveredAt,
    activation: { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: "baseline" },
    recipient: { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: HANDOFF_ID },
    authorization: {
      scope: "P-3 R4 role-visible attachment-only delivery",
      basis: "The owner-approved R4 lifecycle instruction permits delivery of the already-finalized baseline implementation packet only.",
      excludes: ["role-launch", "implementation", "worktree-mutation", "browser-or-figma-measurement", "lifecycle-mutation", "p11-change"],
      runtimeAuthority: { path: "runtime-authority-baseline-delivery-1.json", sha256: EXPECTED.runtimeAuthority },
      registry: { path: "registry-baseline-delivery-1.json", sha256: EXPECTED.registry },
      packetManifest: { path: "packet-manifest-baseline-delivery-1.json", sha256: EXPECTED.packetManifest },
    },
    source: {
      activationReceipt: { path: "activation-receipt.json", sha256: EXPECTED.activationReceipt },
      roleVisiblePacketRoot: DELIVERY_ROOT_RELATIVE,
      inputStaging: { path: INPUT_ROOT_RELATIVE, sha256: EXPECTED.inputStaging },
      attachments: EXPECTED_ATTACHMENTS.map(({ logicalPath, path, sha256: digest, bytes, origin }) => ({ logicalPath, path, sha256: digest, bytes, origin })),
    },
    roleHome: {
      path: posix(ROLE_HOME),
      wasExactlyEmptyBeforeCopy: true,
      copyMethod: "same-parent-staging-directory-then-atomic-rename",
      attachmentOnly: true,
      files: EXPECTED_ATTACHMENTS.map(({ logicalPath, path, sha256: digest, bytes }) => ({ logicalPath, path, sha256: digest, bytes })),
    },
    postValidation: {
      packetCheck: { result: "PASS", attachmentCount: EXPECTED_ATTACHMENTS.length, manifestSha256: EXPECTED.packetManifest },
      immutableInputs: validation.immutable,
      roleHomeHashCheck: "PASS",
      siteDirectoriesAbsent: { baseline: true, current: true },
    },
    result: { deliveryExecuted: true, ...DELIVERY_BOUNDARY },
    freshRoleLaunchObservation: { created: false, status: "NOT_OBSERVED" },
  };
}
function createDeliveryReceipt(bytes) {
  const directory = safeChild(ACTIVATION_ROOT, "delivery-receipts", "delivery receipt directory");
  const alreadyExisted = lstatOrNull(directory) !== null;
  if (!alreadyExisted) mkdirSync(directory, { mode: 0o700 });
  assertRealDirectory(directory, "delivery receipt directory");
  const receiptPath = safeChild(ACTIVATION_ROOT, DELIVERY_RECEIPT_RELATIVE, "delivery receipt path");
  assertAbsent(receiptPath, "delivery receipt");
  writeFileSync(receiptPath, bytes, { flag: "wx", mode: 0o600 });
  return { receiptPath, createdDirectory: !alreadyExisted };
}
function removeOwnedReceipt(receiptPath, receiptBytes, createdDirectory) {
  const info = lstatOrNull(receiptPath);
  if (info) {
    assert(!info.isSymbolicLink() && info.isFile(), "delivery receipt rollback refuses a non-regular file.");
    assert(readFileSync(receiptPath).equals(receiptBytes), "delivery receipt rollback refuses a changed receipt.");
    unlinkSync(receiptPath);
  }
  if (createdDirectory) {
    const directory = dirname(receiptPath);
    assertDirectoryEmpty(directory, "owned delivery receipt directory");
    rmdirSync(directory);
  }
}
function validateDeliveryReceipt(bytes, validation) {
  const receipt = JSON.parse(bytes.toString("utf8"));
  assert(receipt.schema === "p3-r4-runtime-delivery-receipt/v1" && receipt.recordState === "finalized", "delivery receipt schema/state changed.");
  exact(receipt.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: "baseline" }, "delivery receipt activation");
  exact(receipt.recipient, { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: HANDOFF_ID }, "delivery receipt recipient");
  exact(receipt.result, { deliveryExecuted: true, ...DELIVERY_BOUNDARY }, "delivery receipt execution boundary");
  exact(receipt.freshRoleLaunchObservation, { created: false, status: "NOT_OBSERVED" }, "delivery receipt launch observation");
  assert(receipt.authorization?.scope === "P-3 R4 role-visible attachment-only delivery" && Array.isArray(receipt.authorization?.excludes)
    && receipt.authorization.excludes.includes("role-launch") && receipt.authorization.excludes.includes("implementation"),
  "delivery receipt authorization scope changed.");
  exact(receipt.source.attachments, EXPECTED_ATTACHMENTS.map(({ logicalPath, path, sha256: digest, bytes: size, origin }) => ({ logicalPath, path, sha256: digest, bytes: size, origin })),
    "delivery receipt source attachments");
  exact(receipt.roleHome.files, EXPECTED_ATTACHMENTS.map(({ logicalPath, path, sha256: digest, bytes: size }) => ({ logicalPath, path, sha256: digest, bytes: size })),
    "delivery receipt role-home attachments");
  exact(receipt.postValidation.immutableInputs, validation.immutable, "delivery receipt immutable snapshot");
}

function dryRun() {
  const validation = validatePreconditions();
  const deliveryId = stableHash({
    schema: "p3-r4-runtime-delivery-receipt/v1",
    activationId: ACTIVATION_ID,
    pairId: PAIR_ID,
    handoffId: HANDOFF_ID,
    roleHome: posix(ROLE_HOME),
    attachments: EXPECTED_ATTACHMENTS.map(({ logicalPath, sha256: digest }) => ({ logicalPath, sha256: digest })),
  });
  process.stdout.write(`${JSON.stringify({
    status: "validated-dry-run",
    externalWritesPerformed: false,
    activationId: ACTIVATION_ID,
    opaqueHandoffId: HANDOFF_ID,
    sourcePacketRoot: posix(safeChild(ACTIVATION_ROOT, DELIVERY_ROOT_RELATIVE, "role-visible delivery root")),
    roleHome: { path: posix(ROLE_HOME), exactlyEmpty: true },
    deliveryReceipt: { path: posix(safeChild(ACTIVATION_ROOT, DELIVERY_RECEIPT_RELATIVE, "delivery receipt path")), deliveryId, wouldBeAppendOnly: true },
    attachments: EXPECTED_ATTACHMENTS.map(({ logicalPath, path, sha256: digest, bytes }) => ({ logicalPath, path, sha256: digest, bytes })),
    packetCheck: { result: "PASS", attachmentCount: EXPECTED_ATTACHMENTS.length, manifestSha256: EXPECTED.packetManifest },
    immutableInputs: validation.immutable,
    wouldRecord: { deliveryExecuted: true, ...DELIVERY_BOUNDARY, freshRoleLaunchObservationCreated: false },
    prohibitedActions: { roleLaunch: false, implementation: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false },
  }, null, 2)}\n`);
}

function apply() {
  const initial = validatePreconditions();
  const nonce = randomUUID();
  const stagePath = join(ROLE_HOME_PARENT, `.a-impl.r4-delivery-stage-${nonce}`);
  const backupPath = join(ROLE_HOME_PARENT, `.a-impl.r4-empty-backup-${nonce}`);
  let stageCreated = false;
  let homeMovedToBackup = false;
  let stagePromotedToRoleHome = false;
  let receiptBytes = null;
  let receiptState = null;
  try {
    assertAbsent(backupPath, "a-impl empty-home backup path");
    createStage(stagePath);
    stageCreated = true;
    copyRoleVisibleAttachments(stagePath);
    // Re-read all immutable bindings after the staged copy, before publishing it.
    const rechecked = validatePreconditions();
    exact(rechecked.immutable, initial.immutable, "pre-copy immutable snapshot");
    assertTree(stagePath, EXPECTED_ATTACHMENTS.map(({ path, sha256: digest, bytes }) => ({ relativePath: path, sha256: digest, bytes })), "delivery staging before publish");
    assertDirectoryEmpty(ROLE_HOME, "a-impl role home immediately before publish");
    renameSync(ROLE_HOME, backupPath);
    homeMovedToBackup = true;
    renameSync(stagePath, ROLE_HOME);
    stagePromotedToRoleHome = true;
    stageCreated = false;
    validateRoleHomePopulated();
    const postCopy = validatePreconditionsAfterHomeCopy();
    exact(postCopy.immutable, initial.immutable, "post-copy immutable snapshot");
    const deliveredAt = new Date().toISOString();
    receiptBytes = jsonBytes(deliveryReceiptPayload({ deliveredAt, validation: postCopy }));
    validateDeliveryReceipt(receiptBytes, postCopy);
    receiptState = createDeliveryReceipt(receiptBytes);
    validateRoleHomePopulated();
    validateActivationRoot({ deliveryReceiptBytes: receiptBytes });
    const finalImmutable = validateImmutableInputs();
    exact(finalImmutable, initial.immutable, "post-delivery immutable snapshot");
    assertDirectoryEmpty(backupPath, "a-impl empty-home backup");
    rmdirSync(backupPath);
    homeMovedToBackup = false;
    return {
      status: "delivered",
      externalWritesPerformed: true,
      activationId: ACTIVATION_ID,
      opaqueHandoffId: HANDOFF_ID,
      roleHome: posix(ROLE_HOME),
      deliveryReceipt: { path: posix(receiptState.receiptPath), sha256: sha256(receiptBytes), bytes: receiptBytes.length },
      attachments: EXPECTED_ATTACHMENTS.map(({ logicalPath, path, sha256: digest, bytes }) => ({ logicalPath, path, sha256: digest, bytes })),
      result: { deliveryExecuted: true, ...DELIVERY_BOUNDARY, freshRoleLaunchObservationCreated: false },
    };
  } catch (error) {
    const rollbackErrors = [];
    try {
      if (receiptState && receiptBytes) removeOwnedReceipt(receiptState.receiptPath, receiptBytes, receiptState.createdDirectory);
    } catch (rollbackError) { rollbackErrors.push(`delivery receipt rollback: ${rollbackError.message}`); }
    try {
      if (stagePromotedToRoleHome) {
        validateRoleHomePopulated();
        assertAbsent(stagePath, "rollback staging destination");
        renameSync(ROLE_HOME, stagePath);
        stagePromotedToRoleHome = false;
        stageCreated = true;
      }
      if (homeMovedToBackup) {
        assertAbsent(ROLE_HOME, "rollback role home destination");
        assertDirectoryEmpty(backupPath, "rollback a-impl empty-home backup");
        renameSync(backupPath, ROLE_HOME);
        homeMovedToBackup = false;
      }
      if (stageCreated) cleanupOwnedStage(stagePath);
    } catch (rollbackError) { rollbackErrors.push(`role-home rollback: ${rollbackError.message}`); }
    if (rollbackErrors.length > 0) error.message = `${error.message}; ${rollbackErrors.join("; ")}`;
    throw error;
  }
}

function validatePreconditionsAfterHomeCopy() {
  assertRealDirectory(ACTIVATION_ROOT, "runtime activation root after copy");
  const receipt = validateActivationRoot();
  const bindings = validateRuntimeBindings(receipt);
  const immutable = validateImmutableInputs();
  validateRoleHomePopulated();
  return { receipt, bindings, immutable };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--apply"].includes(args[0])) {
    fail("Usage: node tools/r4-deliver-runtime-activation-baseline-seq1.mjs --dry-run | --apply");
  }
  if (args[0] === "--dry-run") dryRun();
  else process.stdout.write(`${JSON.stringify(apply(), null, 2)}\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`P3 R4 BASELINE DELIVERY: ${error.message}\n`);
  process.exitCode = 1;
}
