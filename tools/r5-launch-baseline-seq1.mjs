#!/usr/bin/env node
// P-3 R5 baseline sequence 1 coordinator launch engine.
//
// --dry-run and --self-test are read-only.  --apply is implemented for a
// separately authorized future run; this task does not invoke it.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const CONDITION = "baseline";
const ACTIVATION_ID = "bb3077e21473ce4664e353cadc8e4fda44df87da6be9bf3839f4af818ab42165";
const HANDOFF_ID = "f92bcaa29c39e52eb6d5044638b41101";
const DELIVERY_SEQUENCE = 1;
const PROTOCOL_SHA256 = "2cb05ebec90d7fefdf28cf51be8fb93e277e0bc7cec1a67ebcd458e1c686b342";
const ACTIVATION_ROOT = `C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/${PAIR_ID}/runtime-activations/v2/${ACTIVATION_ID}`;
const ACTIVATION_RECEIPT_PATH = join(ACTIVATION_ROOT, "activation-receipt.json");
const ACTIVATION_RECEIPT_SHA256 = "cdee724ffb182d6c82eaaac0322ba9d0076ebb2f87aeff8d5e070de24658539c";
const DELIVERY_RECEIPT_PATH = join(ACTIVATION_ROOT, "delivery-receipts", `baseline-implementation-delivery-1-${HANDOFF_ID}.json`);
const DELIVERY_RECEIPT_SHA256 = "24574bae74a4d86df62c188237db228457dc2f91b3a052f8238487d813bfedf2";
const ROLE_HOME = `C:/Users/tane1/AppData/Local/p3-role-homes/a-impl-r4-reissue-2-${HANDOFF_ID}`;
const CURRENT_HANDOFF_ID = "b3f41c2108d65cf6c6ae7767b6e797d1";
const CURRENT_ACTIVATION_ID = "f06ba96a83153efac0d2b0e8f7e00a5548d747a36fccabf75787a05273d66375";
const CURRENT_ACTIVATION_ROOT = `C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/${PAIR_ID}/runtime-activations/v2/${CURRENT_ACTIVATION_ID}`;
const CURRENT_DELIVERY_RECEIPT_PATH = join(CURRENT_ACTIVATION_ROOT, "delivery-receipts", `current-implementation-delivery-1-${CURRENT_HANDOFF_ID}.json`);
const CURRENT_DELIVERY_RECEIPT_SHA256 = "8450699e10cb18ad4068d72f657ef3c6e5c53a6c131629d0700fb528ad3de4c4";
const CURRENT_ROLE_HOME = `C:/Users/tane1/AppData/Local/p3-role-homes/b-impl-r4-reissue-2-${CURRENT_HANDOFF_ID}`;
const BASELINE_WORKTREE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT_WORKTREE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PRELAUNCH_ROOT = `C:/Users/tane1/AppData/Local/p3-coordinator-records/${PAIR_ID}/r5-baseline-seq1-prelaunch/v1/4b0edd52d9bbc10fc50cdfdd2f9d2d33916f7f269d5d378e221183dd4448e70a`;
const PRELAUNCH_FILE = "baseline-seq1-prelaunch-authorization.json";
const PRELAUNCH_PATH = join(PRELAUNCH_ROOT, PRELAUNCH_FILE);
const PRELAUNCH_SHA256 = "621b969b53b8c7423611780186e4a7257658172a3a5e4c86ea0068fb44c04140";
const PRELAUNCH_CANDIDATE_SHA256 = "c997366435a31c35f69739f69e6eb7ea25550cc288ca06bfb31efbc7aa25a336";
const COMPLETION_CANDIDATE_SHA256 = "34dcc660837a267c8f80bc39039eb64cae64d56bc2def19baa0fa9b21170d164";
const PROGRESS_ROOT = `C:/Users/tane1/AppData/Local/p3-coordinator-records/${PAIR_ID}/r4-baseline-reissue/v1/${ACTIVATION_ID}/progress`;
const INPUT_STAGING_SHA256 = "876e20a8923eff31760d02037750fd4343ae724bfc7695d757581d3c76b5640f";
const RETURN_HELPER_PATH = join(ACTIVATION_ROOT, "helper-release", "p3-role-return.mjs");
const RETURN_HELPER_SHA256 = "d9723895c308b3f87f27f7f8cd1e06409a4104ac4b2b5ba1e910d7630b36d2cc";
const RETURN_E2E_PATH = join(ACTIVATION_ROOT, "helper-release", "p3-role-return.e2e.mjs");
const RETURN_E2E_SHA256 = "216cfdafb7221e2e5539c3581ebf82aeb7bc25ec3f7a2e1cec8d3fafaec8b74a";
const RETURN_E2E_EVIDENCE_PATH = "C:/AI/figma-to-code/tools/r5-return-helper-e2e-evidence-d9723895.json";
const RETURN_E2E_EVIDENCE_SHA256 = "22584e4f6eea6454b318b1f57b4e76e97156845938879f098f97b83f35241e90";
const RETURN_PLAN_PATH = join(ACTIVATION_ROOT, "return-plan-baseline-seq1-attempt1.json");
const RETURN_PLAN_SHA256 = "d331e86063218097ec3678a56343e195de60e17b1d325f0cb1060ff8ec2e1392";
const EXTERNAL_RECORDS_ROOT = `C:/Users/tane1/AppData/Local/p3-coordinator-records/${PAIR_ID}`;
const LAUNCH_SPEC_PARENT = `${EXTERNAL_RECORDS_ROOT}/r5-baseline-seq1-launch-spec/v1`;
const LAUNCH_SPEC_FILE = "baseline-seq1-launch-spec-authorization.json";
// This root is pair-wide, not baseline-specific.  A future current launcher
// must use the same root, so either condition observes the other condition's
// active/consumed launch attempt before it can spawn.
const LIVE_LEASE_PARENT = `${EXTERNAL_RECORDS_ROOT}/r5-pair-live-lease/v1`;
const LIVE_LEASE_FILE = "baseline-seq1-live-lease.json";
const TERMINAL_PARENT = `${EXTERNAL_RECORDS_ROOT}/r5-baseline-seq1-launch-terminal/v1`;
const TERMINAL_FILE = "baseline-seq1-launch-terminal.json";
const TERMINAL_SIDECAR_FILE = "baseline-seq1-launch-observation.json";
const ROLE_STDOUT_FILE = "role-report.txt";
const ROLE_STDERR_FILE = "role-stderr.txt";
const CHECK_STDOUT_FILE = "return-check-report.txt";
const CHECK_STDERR_FILE = "return-check-stderr.txt";
const UNRESOLVED_PARENT = `${EXTERNAL_RECORDS_ROOT}/r5-baseline-seq1-launch-unresolved/v1`;
const UNRESOLVED_FILE = "baseline-seq1-launch-unresolved.json";

const BASELINE_ATTACHMENTS = Object.freeze([
  { logicalPath: "input/assignment.json", sha256: "022df11874d51d34c7599b8aa5c3f64ca1f8b03301a08e19d11eff1ef93d1f40", bytes: 4351 },
  { logicalPath: "input/references/pc-first-view.png", sha256: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0", bytes: 413224 },
  { logicalPath: "input/references/sp-first-view.png", sha256: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427", bytes: 168441 },
  { logicalPath: "return-authority.json", sha256: "592405b694db2f6d123c1eb671de3564e5ac46d8eabe5a65ddb90785ffaafeb7", bytes: 1307 },
]);
const CURRENT_ATTACHMENTS = Object.freeze([
  { logicalPath: "input/assignment.json", sha256: "a7b6cc716e264d4f954c181775dafee14e576cb85711aadbbac99a993e4634bf", bytes: 4351 },
  { logicalPath: "input/references/pc-first-view.png", sha256: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0", bytes: 413224 },
  { logicalPath: "input/references/sp-first-view.png", sha256: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427", bytes: 168441 },
  { logicalPath: "return-authority.json", sha256: "584cd9fcd0a7a8bf32c4338c80d40e4f1193cb9a52b04c0bd60e938720cd88bf", bytes: 1307 },
]);
const AUTHORIZATION_SCOPE = Object.freeze({
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
const PRELAUNCH_EXECUTION = Object.freeze({
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
});

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function exact(actual, expected, label) {
  assert(JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected)), `${label} is not exact.`);
}
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function canonicalSha256(value) { return sha256(Buffer.from(JSON.stringify(canonical(value)), "utf8")); }
function posix(path) { return resolve(path).replace(/\\/g, "/"); }
function assertRegular(path, label) {
  assert(existsSync(path), `${label} is missing: ${posix(path)}`);
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular file.`);
  return stat;
}
function assertDirectory(path, label) {
  assert(existsSync(path), `${label} is missing: ${posix(path)}`);
  const stat = lstatSync(path);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), `${label} must be a real directory.`);
  return stat;
}
function assertAbsent(path, label) { assert(!existsSync(path), `${label} must be absent: ${posix(path)}`); }
function readRegular(path, label) { assertRegular(path, label); return readFileSync(path); }
function readJson(path, label) {
  try { return JSON.parse(readRegular(path, label).toString("utf8")); }
  catch (error) { fail(`${label} is invalid JSON: ${error.message}`); }
}
function fileReference(path, label) {
  const bytes = readRegular(path, label);
  return { path: posix(path), sha256: sha256(bytes), bytes: bytes.length };
}
function isWithin(parent, child) {
  const route = relative(resolve(parent), resolve(child));
  return route === "" || (!route.startsWith("..") && !isAbsolute(route));
}
function relativePathIsSafe(logicalPath, label) {
  assert(typeof logicalPath === "string" && logicalPath.length > 0 && !isAbsolute(logicalPath), `${label} path must be a non-empty relative path.`);
  const normalized = logicalPath.replace(/\\/g, "/");
  assert(!normalized.split("/").includes("..") && !normalized.startsWith("/"), `${label} path escapes its root.`);
  return normalized;
}
function listTree(root, label) {
  assertDirectory(root, label);
  const files = [];
  const directories = [];
  function visit(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const full = join(directory, entry.name);
      const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = lstatSync(full);
      assert(!stat.isSymbolicLink(), `${label} contains a symbolic link: ${logicalPath}`);
      if (stat.isDirectory()) {
        directories.push(logicalPath);
        visit(full, logicalPath);
      } else {
        assert(stat.isFile(), `${label} contains a non-regular entry: ${logicalPath}`);
        files.push({ logicalPath, sha256: sha256(readFileSync(full)), bytes: stat.size });
      }
    }
  }
  visit(root);
  return {
    files: files.sort((left, right) => left.logicalPath.localeCompare(right.logicalPath, "en")),
    directories: directories.sort((left, right) => left.localeCompare(right, "en")),
  };
}
function normalizedInventory(entries) {
  return entries.map(({ logicalPath, sha256: digest, bytes }) => ({ logicalPath, sha256: digest, bytes })).sort((left, right) => left.logicalPath.localeCompare(right.logicalPath, "en"));
}
function directorySetForFiles(files) {
  const output = new Set();
  for (const { logicalPath } of files) {
    const pieces = logicalPath.split("/");
    for (let index = 1; index < pieces.length; index += 1) output.add(pieces.slice(0, index).join("/"));
  }
  return [...output].sort((left, right) => left.localeCompare(right, "en"));
}
function assertTree(root, expectedFiles, label) {
  const actual = listTree(root, label);
  exact(actual.files, normalizedInventory(expectedFiles), `${label} regular-file inventory`);
  exact(actual.directories, directorySetForFiles(expectedFiles), `${label} directory inventory`);
  return actual;
}
function assertJsonReference(reference, label) {
  assert(reference && typeof reference.path === "string" && /^[a-f0-9]{64}$/.test(reference.sha256), `${label} reference is invalid.`);
  const actual = fileReference(reference.path, label);
  assert(actual.sha256 === reference.sha256, `${label} SHA-256 changed.`);
  return actual;
}
function assertRoleHome(roleHome, expectedAttachments, label) {
  assertTree(roleHome, expectedAttachments, label);
  assertAbsent(join(roleHome, "return.ustar.tar"), `${label} archive`);
  return { path: posix(roleHome), attachments: normalizedInventory(expectedAttachments), returnArchivePresent: false };
}

function validateAssignmentAndRoleAuthority() {
  const assignment = readJson(join(ROLE_HOME, "input", "assignment.json"), "baseline assignment");
  exact(assignment.handoff, { opaqueHandoffId: HANDOFF_ID, deliverySequence: DELIVERY_SEQUENCE, handoffProtocolSha256: PROTOCOL_SHA256 }, "baseline assignment handoff");
  exact(assignment.component, { elementId: "open-service-top-hero", sequence: 1, attempt: 1, componentDecisionCodePath: "site/index.html" }, "baseline assignment component");
  exact(assignment.changeAuthority?.allowedChangeTargets, ["site/index.html", "site/styles.css"], "baseline assignment change targets");
  exact(assignment.changeAuthority?.attemptOneCreatePaths, ["site/index.html", "site/styles.css"], "baseline assignment create targets");
  exact(assignment.changeAuthority?.derivedBootstrapDirectories, ["site"], "baseline assignment bootstrap directory");
  assert(assignment.changeAuthority?.laterAttemptCreationAllowed === false && assignment.changeAuthority?.outOfScopePathChangeAllowed === false, "baseline assignment change authority changed.");
  assert(assignment.bootstrapRequirement?.mustInitializeEveryFrozenDelimiterRegion === true && Array.isArray(assignment.bootstrapRequirement?.delimiterRegions) && assignment.bootstrapRequirement.delimiterRegions.length === 6, "baseline assignment delimiter bootstrap changed.");
  const authority = readJson(join(ROLE_HOME, "return-authority.json"), "baseline role-visible return authority");
  assert(authority.schema === "p3-role-visible-return-authority/v1" && authority.deliveryMode === "attachment-only", "baseline role-visible authority mode changed.");
  exact(authority.handoff, { opaqueHandoffId: HANDOFF_ID, deliverySequence: DELIVERY_SEQUENCE, handoffProtocolSha256: PROTOCOL_SHA256 }, "baseline role-visible authority handoff");
  exact(authority.component?.allowedChangeTargets, ["site/index.html", "site/styles.css"], "baseline role-visible authority targets");
  assert(authority.component?.elementId === "open-service-top-hero" && authority.component?.sequence === 1 && authority.component?.attempt === 1 && authority.component?.componentDecisionCodePath === "site/index.html", "baseline role-visible authority component changed.");
  assert(authority.inputStaging?.logicalRoot === "input" && authority.inputStaging?.sha256 === INPUT_STAGING_SHA256, "baseline role-visible authority input staging changed.");
  assert(Array.isArray(authority.prohibited) && authority.prohibited.includes("role-launch"), "baseline role-visible authority no longer prohibits role self-launch.");
  return {
    assignment: { path: "input/assignment.json", sha256: BASELINE_ATTACHMENTS[0].sha256 },
    returnAuthority: { path: "return-authority.json", sha256: BASELINE_ATTACHMENTS[3].sha256 },
  };
}

function validateActivationAndDelivery(prelaunch) {
  const activationReceiptReference = fileReference(ACTIVATION_RECEIPT_PATH, "baseline activation receipt");
  assert(activationReceiptReference.sha256 === ACTIVATION_RECEIPT_SHA256, "baseline activation receipt SHA-256 changed.");
  const activationReceipt = readJson(ACTIVATION_RECEIPT_PATH, "baseline activation receipt");
  assert(activationReceipt.schema === "p3-r4-runtime-activation-receipt/v2" && activationReceipt.recordState === "finalized", "baseline activation receipt state changed.");
  assert(activationReceipt.activationId === ACTIVATION_ID && activationReceipt.pairId === PAIR_ID && activationReceipt.condition === CONDITION, "baseline activation receipt identity changed.");
  exact(activationReceipt.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "baseline activation receipt recipient");
  assert(activationReceipt.outputRoot === posix(ACTIVATION_ROOT), "baseline activation receipt output root changed.");
  assert(activationReceipt.result?.roleLaunched === false && activationReceipt.result?.siteCreatedOrMutated === false && activationReceipt.result?.lifecycleMutated === false && activationReceipt.result?.browserOrFigmaMeasurement === false && activationReceipt.result?.p11Changed === false, "baseline activation receipt claims a later effect.");
  exact(activationReceipt.externalProgress, {
    root: PROGRESS_ROOT,
    ledgerPath: `${PROGRESS_ROOT}/role-return-progress.jsonl`,
    checkpointProofDirectory: `${PROGRESS_ROOT}/checkpoint-proofs`,
    initialState: "empty-root-no-progress-artifacts",
  }, "baseline activation external progress binding");
  assert(Array.isArray(activationReceipt.outputs) && activationReceipt.outputs.length === 20, "baseline activation receipt must bind exactly 20 activation outputs.");
  const outputFiles = activationReceipt.outputs.map((entry, index) => {
    assert(entry && typeof entry === "object" && /^[a-f0-9]{64}$/.test(entry.sha256) && Number.isInteger(entry.bytes) && entry.bytes >= 0, `baseline activation output ${index} is invalid.`);
    const logicalPath = relativePathIsSafe(entry.relativePath, `baseline activation output ${index}`);
    const absolutePath = resolve(ACTIVATION_ROOT, logicalPath);
    assert(isWithin(ACTIVATION_ROOT, absolutePath), `baseline activation output ${logicalPath} escapes its root.`);
    const actual = fileReference(absolutePath, `baseline activation output ${logicalPath}`);
    assert(actual.sha256 === entry.sha256 && actual.bytes === entry.bytes, `baseline activation output changed: ${logicalPath}`);
    return { logicalPath, sha256: entry.sha256, bytes: entry.bytes };
  });
  assert(new Set(outputFiles.map(({ logicalPath }) => logicalPath)).size === outputFiles.length, "baseline activation receipt repeats an output path.");
  const deliveryReceiptReference = fileReference(DELIVERY_RECEIPT_PATH, "baseline delivery receipt");
  assert(deliveryReceiptReference.sha256 === DELIVERY_RECEIPT_SHA256, "baseline delivery receipt SHA-256 changed.");
  const expectedTreeFiles = [
    { logicalPath: "activation-receipt.json", sha256: activationReceiptReference.sha256, bytes: activationReceiptReference.bytes },
    ...outputFiles,
    { logicalPath: `delivery-receipts/baseline-implementation-delivery-1-${HANDOFF_ID}.json`, sha256: deliveryReceiptReference.sha256, bytes: deliveryReceiptReference.bytes },
  ];
  assert(expectedTreeFiles.length === 22, "baseline activation tree must contain 21 activation artifacts plus one delivery receipt.");
  assert(outputFiles.length + 1 === 21, "baseline activation artifact count is not 21.");
  assertTree(ACTIVATION_ROOT, expectedTreeFiles, "baseline activation root");

  const protocolBaseline = readRegular(join(ACTIVATION_ROOT, "protocol-baseline.json"), "baseline protocol");
  const protocolCurrent = readRegular(join(ACTIVATION_ROOT, "protocol-current.json"), "current protocol copy in baseline activation");
  assert(sha256(protocolBaseline) === PROTOCOL_SHA256 && protocolBaseline.equals(protocolCurrent), "common protocol copies are not the pinned 2cb byte sequence.");
  const helper = fileReference(RETURN_HELPER_PATH, "pinned return helper");
  const e2e = fileReference(RETURN_E2E_PATH, "pinned return helper E2E harness");
  assert(helper.sha256 === RETURN_HELPER_SHA256 && e2e.sha256 === RETURN_E2E_SHA256, "pinned return helper release changed.");
  const evidence = fileReference(RETURN_E2E_EVIDENCE_PATH, "durable return-helper E2E evidence");
  assert(evidence.sha256 === RETURN_E2E_EVIDENCE_SHA256, "durable return-helper E2E evidence changed.");
  const evidenceJson = readJson(RETURN_E2E_EVIDENCE_PATH, "durable return-helper E2E evidence");
  assert(evidenceJson.schema === "p3-r5-return-helper-e2e-evidence/v1" && evidenceJson.recordState === "observed" && evidenceJson.test?.exitCode === 0 && evidenceJson.test?.stdout === "p3-role-return E2E PASS", "durable return-helper E2E evidence changed state.");

  const deliveryReceipt = readJson(DELIVERY_RECEIPT_PATH, "baseline delivery receipt");
  assert(deliveryReceipt.schema === "p3-r4-runtime-delivery-receipt/v2" && deliveryReceipt.recordState === "finalized", "baseline delivery receipt state changed.");
  exact(deliveryReceipt.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION }, "baseline delivery receipt activation");
  exact(deliveryReceipt.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "baseline delivery receipt recipient");
  assert(deliveryReceipt.result?.roleHomeCopied === true && deliveryReceipt.result?.roleDelivered === true && deliveryReceipt.result?.roleLaunched === false && deliveryReceipt.result?.implementation === false && deliveryReceipt.result?.returnApplied === false && deliveryReceipt.result?.siteCreatedOrMutated === false && deliveryReceipt.result?.lifecycleMutated === false && deliveryReceipt.result?.browserOrFigmaMeasurement === false && deliveryReceipt.result?.p11Changed === false, "baseline delivery receipt claims a later effect.");
  assert(deliveryReceipt.freshRoleLaunchObservation?.created === false && deliveryReceipt.freshRoleLaunchObservation?.status === "NOT_OBSERVED", "baseline delivery receipt already claims a role launch.");
  exact(normalizedInventory(deliveryReceipt.roleHome?.attachments ?? []), normalizedInventory(BASELINE_ATTACHMENTS), "baseline delivery receipt role-home attachments");
  exact(normalizedInventory(deliveryReceipt.source?.attachments ?? []), normalizedInventory(BASELINE_ATTACHMENTS), "baseline delivery receipt source attachments");
  assert(deliveryReceipt.roleHome?.path === ROLE_HOME && deliveryReceipt.roleHome?.attachmentOnly === true, "baseline delivery receipt role-home binding changed.");

  const immutableInputs = activationReceipt.immutableInputs;
  assert(immutableInputs && typeof immutableInputs === "object" && !Array.isArray(immutableInputs), "baseline activation immutable inputs are invalid.");
  const immutableReferences = Object.fromEntries(Object.entries(immutableInputs).map(([name, reference]) => [name, assertJsonReference(reference, `baseline immutable input ${name}`)]));
  const p11 = readJson(immutableReferences.p11BlockedRecord.path, "P-11 blocked record");
  assert(p11.status === "BLOCKED" && p11.authorization === "NOT_AUTHORIZED" && p11.roleLaunchObserved === false, "P-11 must remain BLOCKED/NOT_AUTHORIZED and unobserved.");
  assert(prelaunch.bindings?.activationReceipt?.sha256 === activationReceiptReference.sha256 && prelaunch.bindings?.activationReceipt?.path === activationReceiptReference.path, "pre-launch record activation receipt binding changed.");
  assert(prelaunch.bindings?.deliveryReceipt?.sha256 === deliveryReceiptReference.sha256 && prelaunch.bindings?.deliveryReceipt?.path === deliveryReceiptReference.path, "pre-launch record delivery receipt binding changed.");
  return {
    activationReceipt: activationReceiptReference,
    activationArtifactFileCount: 21,
    fullActivationTreeFileCount: expectedTreeFiles.length,
    deliveryReceipt: deliveryReceiptReference,
    protocol: { sha256: PROTOCOL_SHA256, byteIdenticalCopies: true },
    helperRelease: { helper, e2e, durableEvidence: evidence },
    immutableInputs: immutableReferences,
    p11: { status: p11.status, authorization: p11.authorization, roleLaunchObserved: p11.roleLaunchObserved },
  };
}

function validateCurrentDeliveredNotLaunched(prelaunch) {
  const receiptReference = fileReference(CURRENT_DELIVERY_RECEIPT_PATH, "current delivery receipt");
  assert(receiptReference.sha256 === CURRENT_DELIVERY_RECEIPT_SHA256, "current delivery receipt SHA-256 changed.");
  const receipt = readJson(CURRENT_DELIVERY_RECEIPT_PATH, "current delivery receipt");
  assert(receipt.schema === "p3-r4-current-role-delivery-completion-receipt/v1" && receipt.recordState === "finalized" && receipt.ownerApproved === true && receipt.ownerOperated === true, "current delivery receipt state changed.");
  assert(receipt.pairId === PAIR_ID && receipt.condition === "current", "current delivery receipt pair binding changed.");
  exact(receipt.recipient, { roleKind: "implementation", deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: CURRENT_HANDOFF_ID }, "current delivery receipt recipient");
  assert(receipt.result?.roleDelivered === true && receipt.result?.roleLaunch === false && receipt.result?.roleLaunched === false && receipt.result?.implementation === false && receipt.result?.returnApply === false && receipt.result?.siteMutation === false && receipt.result?.lifecycleMutation === false && receipt.result?.browserOrFigmaMeasurement === false && receipt.result?.p11Mutation === false && receipt.result?.p11Changed === false, "current delivery receipt claims a later effect.");
  exact(normalizedInventory(receipt.roleHome?.files ?? []), normalizedInventory(CURRENT_ATTACHMENTS), "current delivery receipt role-home attachments");
  assert(receipt.roleHome?.path === CURRENT_ROLE_HOME, "current delivery receipt role-home binding changed.");
  const roleHome = assertRoleHome(CURRENT_ROLE_HOME, CURRENT_ATTACHMENTS, "current role home");
  assert(prelaunch.bindings?.baselineFirstSerial?.current?.completionReceipt?.sha256 === receiptReference.sha256 && prelaunch.bindings?.baselineFirstSerial?.current?.completionReceipt?.path === receiptReference.path, "pre-launch record current delivery binding changed.");
  assert(prelaunch.bindings?.baselineFirstSerial?.currentLaunchAuthorizedByThisCandidate === false && prelaunch.bindings?.baselineFirstSerial?.simultaneousABRoleLaunchForbidden === true, "pre-launch record no longer preserves baseline-first serialization.");
  return { deliveryReceipt: receiptReference, roleHome, currentLaunchAuthorizedByThisCandidate: false, simultaneousABRoleLaunchForbidden: true };
}

function validatePairInputDifferential(baselineRoleHome, currentRoleHome, prelaunch) {
  const baseline = new Map(baselineRoleHome.attachments.map((entry) => [entry.logicalPath, entry]));
  const current = new Map(currentRoleHome.attachments.map((entry) => [entry.logicalPath, entry]));
  const paths = [...new Set([...baseline.keys(), ...current.keys()])].sort((left, right) => left.localeCompare(right, "en"));
  const same = [];
  const different = [];
  for (const logicalPath of paths) {
    const left = baseline.get(logicalPath);
    const right = current.get(logicalPath);
    assert(left && right, "baseline/current role-home logical paths differ.");
    if (left.sha256 === right.sha256 && left.bytes === right.bytes) same.push(logicalPath);
    else different.push(logicalPath);
  }
  exact(same, ["input/references/pc-first-view.png", "input/references/sp-first-view.png"], "baseline/current same attachment paths");
  exact(different, ["input/assignment.json", "return-authority.json"], "baseline/current differing attachment paths");
  const recorded = prelaunch.bindings?.pairRoleInputAudit?.summary;
  assert(recorded?.commonLogicalPathCount === 4 && Array.isArray(recorded.sameByteAndSha256) && Array.isArray(recorded.differentByteOrSha256) && Array.isArray(recorded.baselineOnly) && Array.isArray(recorded.currentOnly), "pre-launch pair input audit is incomplete.");
  exact(recorded.sameByteAndSha256.map((entry) => entry.logicalPath).sort((left, right) => left.localeCompare(right, "en")), same, "pre-launch recorded same attachment paths");
  exact(recorded.differentByteOrSha256.map((entry) => entry.logicalPath).sort((left, right) => left.localeCompare(right, "en")), different, "pre-launch recorded differing attachment paths");
  exact(recorded.baselineOnly, [], "pre-launch baseline-only attachment paths");
  exact(recorded.currentOnly, [], "pre-launch current-only attachment paths");
  return { verificationStatus: "machine-verified", commonLogicalPathCount: paths.length, sameByteAndSha256Paths: same, differentByteOrSha256Paths: different };
}

function validatePrelaunchRecord() {
  assertTree(PRELAUNCH_ROOT, [{ logicalPath: PRELAUNCH_FILE, sha256: PRELAUNCH_SHA256, bytes: lstatSync(PRELAUNCH_PATH).size }], "published baseline pre-launch record root");
  const reference = fileReference(PRELAUNCH_PATH, "published baseline pre-launch record");
  assert(reference.sha256 === PRELAUNCH_SHA256, "published baseline pre-launch record SHA-256 changed.");
  const record = readJson(PRELAUNCH_PATH, "published baseline pre-launch record");
  assert(record.schema === "p3-r5-role-launch-preauthorization/v1" && record.recordState === "finalized" && record.ownerApproved === true, "published baseline pre-launch record state changed.");
  assert(typeof record.ownerApprovalRecordedAt === "string" && !Number.isNaN(Date.parse(record.ownerApprovalRecordedAt)), "published baseline pre-launch approval time is invalid.");
  exact(record.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "published baseline pre-launch activation");
  exact(record.authorizationScope, AUTHORIZATION_SCOPE, "published baseline pre-launch authorization scope");
  exact(record.execution, PRELAUNCH_EXECUTION, "published baseline pre-launch execution state");
  exact(record.candidateHashes, { preLaunchAuthorization: PRELAUNCH_CANDIDATE_SHA256, postLaunchCompletion: COMPLETION_CANDIDATE_SHA256 }, "published baseline pre-launch candidate hashes");
  assert(record.postLaunchCompletionRequired === true && typeof record.approvalBasis === "string" && record.approvalBasis.includes("authorizes only role launch"), "published baseline pre-launch coordinator boundary changed.");
  assert(record.p11?.status === "BLOCKED" && record.p11?.authorization === "NOT_AUTHORIZED" && record.p11?.roleLaunchObserved === false, "published baseline pre-launch P-11 state changed.");
  assert(record.nonElevatedBoundaries?.osIsolation === "not asserted" && record.nonElevatedBoundaries?.modelVisibleToolSurface === "not asserted" && record.nonElevatedBoundaries?.roleContextCreated === false && record.nonElevatedBoundaries?.roleLaunched === false, "published baseline pre-launch elevation boundary changed.");
  assert(record.ownerAttestedFreshContext?.verificationStatus === "owner-attested, not machine-verifiable" && record.ownerAttestedFreshContext?.actualActor === "REQUIRED_UNSET" && record.ownerAttestedFreshContext?.actualContextId === "REQUIRED_UNSET" && record.ownerAttestedFreshContext?.observedAt === "REQUIRED_UNSET", "published baseline pre-launch attestation boundary changed.");
  assert(record.output?.recordId === "4b0edd52d9bbc10fc50cdfdd2f9d2d33916f7f269d5d378e221183dd4448e70a" && record.output?.root === posix(PRELAUNCH_ROOT) && record.output?.file === PRELAUNCH_FILE, "published baseline pre-launch output binding changed.");
  assert(record.bindings?.roleHome?.path === ROLE_HOME, "published baseline pre-launch role-home path changed.");
  exact(normalizedInventory(record.bindings?.roleHome?.attachments ?? []), normalizedInventory(BASELINE_ATTACHMENTS), "published baseline pre-launch role-home attachments");
  return { reference, record };
}

function validateNoProgressOrWorktreeMutation(activation) {
  assertDirectory(PROGRESS_ROOT, "baseline external progress root");
  const progress = listTree(PROGRESS_ROOT, "baseline external progress root");
  exact(progress.files, [], "baseline external progress file inventory");
  assert(progress.directories.every((logicalPath) => logicalPath === "checkpoint-proofs"), "baseline external progress contains an unexpected directory.");
  assert(activation.immutableInputs.p11BlockedRecord, "baseline P-11 immutable reference is missing.");
  for (const worktree of [BASELINE_WORKTREE, CURRENT_WORKTREE]) {
    assertDirectory(worktree, "condition worktree");
    assertAbsent(join(worktree, "site"), "condition site directory");
    assertAbsent(join(worktree, ".p3-role-return-recovery"), "condition return recovery directory");
  }
  return {
    progressRoot: posix(PROGRESS_ROOT),
    progressFiles: 0,
    checkpointProofDirectories: progress.directories.length,
    siteDirectoriesAbsent: { baseline: true, current: true },
    recoveryDirectoriesAbsent: { baseline: true, current: true },
  };
}

export function buildRolePrompt() {
  return `あなたは P-3 の attachment-only implementation role です。\n\n作業対象は、この新規 role context の次の4ファイルだけです。\n\n- input/assignment.json\n- input/references/pc-first-view.png\n- input/references/sp-first-view.png\n- return-authority.json\n\nこれ以外の会話履歴、project、host filesystem、Git、MyBrain、MCP、connector、plugin、Web、peer artifact、比較contract、Decision J、clean-room evidenceを読んだり参照したりしないでください。外部パスや他conditionの情報を求めないでください。ローカルの2枚のreference画像は、上記4ファイルの一部としてのみ参照できます。browser/Figma測定を行わないでください。\n\n実装対象は sequence 1 / attempt 1 の open-service-top-hero だけです。\n\n許可された作成対象は次の2ファイルだけです。\n\n- site/index.html\n- site/styles.css\n\nassets、追加ファイル、追加directoryは作成しないでください。site/index.html と site/styles.css には、PC/SP referenceとassignmentに基づく初期hero実装を入れてください。\n\n両ファイルには、次の6 componentの開始・終了delimiterをすべて初期化してください。\n\n1. open-service-top-hero\n2. open-service-header\n3. open-service-hero-visual\n4. open-service-hero-copy\n5. open-service-hero-actions\n6. open-service-hero-stats\n\nsequence 1以外の5領域は空のdelimiter対にしてください。sequence 1の実装だけを open-service-top-hero のdelimiter内に置いてください。\n\nHTML delimiter形式:\n<!-- p3-open-service-top-hero-v1:<elementId>:start -->\n<!-- p3-open-service-top-hero-v1:<elementId>:end -->\n\nCSS delimiter形式:\n/* p3-open-service-top-hero-v1:<elementId>:start */\n/* p3-open-service-top-hero-v1:<elementId>:end */\n\n作業結果は実worktreeへ適用しません。この role home のrootに plain uncompressed USTAR archive return.ustar.tar を作成してください。返却先の探索・配置・copy・applyは行わないでください。完了時にこのrole homeに残してよい出力は return.ustar.tar だけです。\n\narchive rootには、次の3つのregular fileだけを含めてください。\n\n- return-manifest.json\n- site/index.html\n- site/styles.css\n\ndirectory entry、symlink、hard link、special file、PAX/GNU extension、参照画像、input配下のファイル、追加ファイルをarchiveへ含めないでください。\n\nreturn-manifest.json は次の形にしてください。site/index.html と site/styles.css のsha256は実際のファイル値を入れてください。\n\n{\n  "version": 4,\n  "kind": "p3-role-return",\n  "handoffId": "${HANDOFF_ID}",\n  "deliverySequence": ${DELIVERY_SEQUENCE},\n  "handoffProtocolSha256": "${PROTOCOL_SHA256}",\n  "component": {\n    "elementId": "open-service-top-hero",\n    "componentDecisionCodePath": "site/index.html",\n    "sequence": 1,\n    "attempt": 1\n  },\n  "inputStagingSha256": "${INPUT_STAGING_SHA256}",\n  "files": [\n    {\n      "path": "site/index.html",\n      "sha256": "<actual lowercase SHA-256>"\n    },\n    {\n      "path": "site/styles.css",\n      "sha256": "<actual lowercase SHA-256>"\n    }\n  ]\n}\n\n完了前にarchive内容と各SHA-256を検証してください。role launch、return apply、site/lifecycle変更、browser/Figma測定、P-11変更は行わないでください。完了時は return.ustar.tar のSHA-256だけを報告してください。`;
}

export const ROLE_PROMPT_SHA256 = "cc9732a78e021c87c1aa4c95e498d0401926af3b584e801fd6b9501efd8d0e45";
export const LAUNCH_TIMEOUT_MS = 900000;
export const ROLE_IMAGE_ARGUMENTS = Object.freeze([
  "--image",
  `${ROLE_HOME}/input/references/pc-first-view.png`,
  "--image",
  `${ROLE_HOME}/input/references/sp-first-view.png`,
]);
export function buildExpectedCodexArgv() {
  const prompt = buildRolePrompt();
  assert(sha256(Buffer.from(prompt, "utf8")) === ROLE_PROMPT_SHA256, "baseline role prompt SHA-256 changed.");
  return [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--sandbox",
    "workspace-write",
    "-C",
    ROLE_HOME,
    "--skip-git-repo-check",
    ...ROLE_IMAGE_ARGUMENTS,
    "--",
    prompt,
  ];
}

class PublishedIntegrityError extends Error {
  constructor(root, message) {
    super(message);
    this.name = "PublishedIntegrityError";
    this.root = root;
  }
}

function bufferReference(logicalPath, bytes) {
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? "", "utf8");
  return { path: logicalPath, sha256: sha256(value), bytes: value.length };
}
function serialError(error) {
  if (!error) return null;
  return { name: String(error.name ?? "Error"), code: error.code ?? null, message: String(error.message ?? error) };
}
function expectedLaunchSpec() {
  const prompt = buildRolePrompt();
  const argv = buildExpectedCodexArgv();
  assert(sha256(Buffer.from(prompt, "utf8")) === ROLE_PROMPT_SHA256, "baseline role prompt SHA-256 changed.");
  exact(argv.slice(0, -1), ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "workspace-write", "-C", ROLE_HOME, "--skip-git-repo-check", ...ROLE_IMAGE_ARGUMENTS, "--"], "exact Codex launch argv flags");
  assert(argv.at(-1) === prompt && !argv.some((entry) => entry === "--add-dir" || entry.startsWith("--add-dir=")), "exact Codex launch argv is unsafe.");
  return {
    executable: "codex",
    argv,
    cwd: ROLE_HOME,
    shell: false,
    timeoutMs: LAUNCH_TIMEOUT_MS,
    additionalDirectories: [],
    rolePromptSha256: ROLE_PROMPT_SHA256,
    imageArguments: [...ROLE_IMAGE_ARGUMENTS],
  };
}
function assertCurrentNotLaunchedState(result, label) {
  assert(result?.roleDelivered === true && result?.roleLaunch === false && result?.roleLaunched === false && result?.implementation === false && result?.returnApply === false && result?.siteMutation === false && result?.lifecycleMutation === false && result?.browserOrFigmaMeasurement === false && result?.p11Mutation === false && result?.p11Changed === false, `${label} is not delivered-not-launched.`);
}
function strictRoleHomeSnapshot(tree, archiveReference, label) {
  assert(archiveReference && /^[a-f0-9]{64}$/.test(archiveReference.sha256) && Number.isInteger(archiveReference.bytes) && archiveReference.bytes > 0, `${label} has no regular return archive.`);
  assert(!Array.isArray(tree.invalidEntries) || tree.invalidEntries.length === 0, `${label} contains a symlink or special entry.`);
  const expected = [...BASELINE_ATTACHMENTS, { logicalPath: "return.ustar.tar", sha256: archiveReference.sha256, bytes: archiveReference.bytes }];
  exact(tree.files, normalizedInventory(expected), `${label} regular-file inventory`);
  exact(tree.directories, ["input", "input/references"], `${label} directory inventory`);
  return { path: posix(ROLE_HOME), attachments: normalizedInventory(BASELINE_ATTACHMENTS), archive: archiveReference };
}
function inspectRoleHomeAfterLaunch() {
  const archivePath = join(ROLE_HOME, "return.ustar.tar");
  const archive = fileReference(archivePath, "baseline role return archive");
  const tree = listTree(ROLE_HOME, "baseline role home after launch");
  return strictRoleHomeSnapshot(tree, { path: archive.path, sha256: archive.sha256, bytes: archive.bytes }, "baseline role home after launch");
}
function launchSpecCandidateFromFinalRecord(record) {
  return {
    ...record,
    recordState: "candidate-not-published",
    ownerApproved: false,
    ownerApprovalRecordedAt: "REQUIRED_UNSET",
    execution: { ...record.execution, launchSpecAuthorized: false },
    output: undefined,
  };
}
function launchSpecRecordIdFromFinalRecord(record) {
  const candidateSha256 = sha256(jsonBytes(launchSpecCandidateFromFinalRecord(record)));
  return sha256(Buffer.from(
    "p3-r5-baseline-seq1-launch-spec\0"
      + PAIR_ID + "\0"
      + ACTIVATION_ID + "\0"
      + HANDOFF_ID + "\0"
      + PRELAUNCH_SHA256 + "\0"
      + ROLE_PROMPT_SHA256 + "\0"
      + candidateSha256,
    "utf8",
  ));
}
function validateLaunchSpecRecord(record, reference, root, { revalidatePreSpawn = true } = {}) {
  assert(record.schema === "p3-r5-role-launch-spec-authorization/v1" && record.recordState === "finalized" && record.ownerApproved === true, "published launch-spec record state changed.");
  exact(record.preLaunchAuthorization, { path: posix(PRELAUNCH_PATH), sha256: PRELAUNCH_SHA256 }, "published launch-spec pre-launch binding");
  exact(record.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "published launch-spec activation");
  exact(record.bindings, {
    protocolSha256: PROTOCOL_SHA256,
    deliveryReceipt: { path: posix(DELIVERY_RECEIPT_PATH), sha256: DELIVERY_RECEIPT_SHA256 },
    roleHome: { path: ROLE_HOME, attachments: BASELINE_ATTACHMENTS },
  }, "published launch-spec bindings");
  assert(record.preSpawnState && record.preSpawnState.sha256 === canonicalSha256(record.preSpawnState.state), "published launch-spec stored pre-spawn fingerprint is invalid.");
  if (revalidatePreSpawn) {
    const expectedPreSpawnState = collectAuthorizationPreSpawnState();
    exact(record.preSpawnState, { sha256: canonicalSha256(expectedPreSpawnState), state: expectedPreSpawnState }, "published launch-spec pre-spawn state fingerprint");
  }
  exact(record.launch, expectedLaunchSpec(), "published launch-spec exact invocation");
  exact(record.authorizationScope, AUTHORIZATION_SCOPE, "published launch-spec authorization scope");
  assert(record.execution?.launchSpecAuthorized === true && record.execution?.liveLeaseAcquired === false && record.execution?.roleLaunchExecuted === false && record.execution?.implementation === false && record.execution?.returnApply === false && record.execution?.siteMutation === false && record.execution?.lifecycleMutation === false && record.execution?.browserMeasurement === false && record.execution?.figmaMeasurement === false && record.execution?.p11Mutation === false, "published launch-spec execution state changed.");
  assert(record.additionalDirectoriesForbidden === true && record.launch.additionalDirectories.length === 0 && !record.launch.argv.some((entry) => entry === "--add-dir" || entry.startsWith("--add-dir=")), "published launch-spec permits additional directories.");
  assert(record.nonAssertions?.p11 === "not authorized or changed by this record" && record.nonAssertions?.osIsolation === "not asserted" && record.nonAssertions?.cleanRoom === "not asserted" && record.nonAssertions?.modelVisibleToolSurface === "not asserted" && record.nonAssertions?.actualFreshContextIdentity === "not asserted", "published launch-spec non-assertion boundary changed.");
  const expectedRecordId = launchSpecRecordIdFromFinalRecord(record);
  assert(record.output?.root === posix(root) && record.output?.file === LAUNCH_SPEC_FILE && record.output?.recordId === expectedRecordId && basename(root) === expectedRecordId, "published launch-spec output binding changed.");
  return { reference, record, root: posix(root) };
}
function readPublishedLaunchSpec(required, options = {}) {
  if (!existsSync(LAUNCH_SPEC_PARENT)) {
    if (required) fail("required published launch-spec authorization is absent.");
    return { status: "not-published" };
  }
  assertDirectory(LAUNCH_SPEC_PARENT, "launch-spec parent");
  const entries = readdirSync(LAUNCH_SPEC_PARENT, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (entries.length === 0) {
    if (required) fail("required published launch-spec authorization is absent.");
    return { status: "not-published" };
  }
  assert(entries.length === 1 && entries[0].isDirectory() && !entries[0].isSymbolicLink() && !entries[0].name.startsWith("."), "launch-spec parent is malformed or contains more than one record.");
  const root = join(LAUNCH_SPEC_PARENT, entries[0].name);
  const reference = fileReference(join(root, LAUNCH_SPEC_FILE), "published launch-spec record");
  const tree = listTree(root, "published launch-spec root");
  exact(tree.directories, [], "published launch-spec directory inventory");
  exact(tree.files, [{ logicalPath: LAUNCH_SPEC_FILE, sha256: reference.sha256, bytes: reference.bytes }], "published launch-spec regular-file inventory");
  return { status: "published", ...validateLaunchSpecRecord(readJson(join(root, LAUNCH_SPEC_FILE), "published launch-spec record"), reference, root, options) };
}
export function collectInitialLaunchState(spec = null) {
  const prelaunch = validatePrelaunchRecord();
  const activation = validateActivationAndDelivery(prelaunch.record);
  const baselineRoleHome = assertRoleHome(ROLE_HOME, BASELINE_ATTACHMENTS, "baseline role home before launch");
  exact(prelaunch.record.bindings?.roleHome?.attachments, baselineRoleHome.attachments, "pre-launch record baseline role-home revalidation");
  const visibleRoleInputs = validateAssignmentAndRoleAuthority();
  const current = validateCurrentDeliveredNotLaunched(prelaunch.record);
  assertCurrentNotLaunchedState(readJson(CURRENT_DELIVERY_RECEIPT_PATH, "current delivery receipt").result, "current delivery receipt");
  const pairInputDifferential = validatePairInputDifferential(baselineRoleHome, current.roleHome, prelaunch.record);
  const nonMutationState = validateNoProgressOrWorktreeMutation(activation);
  const returnPlan = fileReference(RETURN_PLAN_PATH, "baseline return plan");
  assert(returnPlan.sha256 === RETURN_PLAN_SHA256, "baseline return plan SHA-256 changed.");
  const images = [
    fileReference(`${ROLE_HOME}/input/references/pc-first-view.png`, "baseline PC image argument"),
    fileReference(`${ROLE_HOME}/input/references/sp-first-view.png`, "baseline SP image argument"),
  ];
  exact(images.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes })), [
    { path: `${ROLE_HOME}/input/references/pc-first-view.png`, sha256: BASELINE_ATTACHMENTS[1].sha256, bytes: BASELINE_ATTACHMENTS[1].bytes },
    { path: `${ROLE_HOME}/input/references/sp-first-view.png`, sha256: BASELINE_ATTACHMENTS[2].sha256, bytes: BASELINE_ATTACHMENTS[2].bytes },
  ], "baseline --image attachment bindings");
  return {
    prelaunch: prelaunch.reference,
    launchSpec: spec ? spec.reference : null,
    activation,
    baselineRoleHome,
    visibleRoleInputs,
    currentDeliveredNotLaunched: current,
    pairInputDifferential,
    noProgressOrWorktreeMutation: nonMutationState,
    returnPlan,
    imageAttachments: images,
  };
}
// The pre-spawn authorization exists before a launch-spec is published.
// Keep its immutable fingerprint independent of that later record reference;
// the lease separately binds the published launch-spec before spawn.
export function collectAuthorizationPreSpawnState() {
  const { launchSpec, ...state } = collectInitialLaunchState(null);
  return state;
}
function collectPostLaunchState(spec, before) {
  const prelaunch = validatePrelaunchRecord();
  const activation = validateActivationAndDelivery(prelaunch.record);
  const baselineRoleHome = inspectRoleHomeAfterLaunch();
  const visibleRoleInputs = validateAssignmentAndRoleAuthority();
  const current = validateCurrentDeliveredNotLaunched(prelaunch.record);
  assertCurrentNotLaunchedState(readJson(CURRENT_DELIVERY_RECEIPT_PATH, "current delivery receipt").result, "current delivery receipt after baseline launch");
  const pairInputDifferential = validatePairInputDifferential({ attachments: baselineRoleHome.attachments }, current.roleHome, prelaunch.record);
  const nonMutationState = validateNoProgressOrWorktreeMutation(activation);
  const returnPlan = fileReference(RETURN_PLAN_PATH, "baseline return plan after launch");
  assert(returnPlan.sha256 === RETURN_PLAN_SHA256, "baseline return plan SHA-256 changed after launch.");
  const stable = {
    prelaunch: prelaunch.reference,
    launchSpec: spec.reference,
    activation,
    visibleRoleInputs,
    currentDeliveredNotLaunched: current,
    pairInputDifferential,
    noProgressOrWorktreeMutation: nonMutationState,
    returnPlan,
  };
  const expected = {
    prelaunch: before.prelaunch,
    launchSpec: before.launchSpec,
    activation: before.activation,
    visibleRoleInputs: before.visibleRoleInputs,
    currentDeliveredNotLaunched: before.currentDeliveredNotLaunched,
    pairInputDifferential: before.pairInputDifferential,
    noProgressOrWorktreeMutation: before.noProgressOrWorktreeMutation,
    returnPlan: before.returnPlan,
  };
  exact(stable, expected, "pinned state changed during role launch");
  return { ...stable, baselineRoleHome };
}
function leaseId() {
  return sha256(Buffer.from(`p3-r5-baseline-seq1-live-lease\0${PAIR_ID}\0${CONDITION}\0${DELIVERY_SEQUENCE}\0${PRELAUNCH_SHA256}`, "utf8"));
}
function recordParentEntries(parent, label) {
  if (!existsSync(parent)) return [];
  assertDirectory(parent, label + " parent");
  return readdirSync(parent, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory() && !entry.isSymbolicLink(),
      symlink: entry.isSymbolicLink(),
      file: entry.isFile() && !entry.isSymbolicLink(),
    }));
}
function oneTimeGuardStatus() {
  const blockers = [];
  for (const [label, parent] of [["pair live lease", LIVE_LEASE_PARENT], ["baseline terminal", TERMINAL_PARENT], ["baseline unresolved", UNRESOLVED_PARENT]]) {
    const entries = recordParentEntries(parent, label);
    if (entries.length > 0) blockers.push({ label, parent: posix(parent), entries });
  }
  return {
    clear: blockers.length === 0,
    blockers,
    checkedParents: [posix(LIVE_LEASE_PARENT), posix(TERMINAL_PARENT), posix(UNRESOLVED_PARENT)],
  };
}
function oneTimeGuard() {
  const blockers = [];
  for (const [label, parent] of [["live lease", LIVE_LEASE_PARENT], ["terminal", TERMINAL_PARENT], ["unresolved", UNRESOLVED_PARENT]]) {
    if (!existsSync(parent)) continue;
    assertDirectory(parent, `${label} parent`);
    const entries = readdirSync(parent, { withFileTypes: true });
    if (entries.length > 0) blockers.push({ label, parent: posix(parent), entries: entries.map((entry) => ({ name: entry.name, directory: entry.isDirectory(), symlink: entry.isSymbolicLink() })) });
  }
  assert(blockers.length === 0, `one-time pair/sequence/prelaunch guard is occupied or malformed: ${JSON.stringify(blockers)}`);
  return { clear: true, checkedParents: [posix(LIVE_LEASE_PARENT), posix(TERMINAL_PARENT), posix(UNRESOLVED_PARENT)] };
}
function buildLease(spec, before) {
  const id = leaseId();
  const root = join(LIVE_LEASE_PARENT, id);
  const preStateSha256 = sha256(jsonBytes(before));
  return {
    id,
    root,
    record: {
      schema: "p3-r5-pair-scoped-live-launch-lease/v1",
      recordState: "held",
      createdAt: new Date().toISOString(),
      oneTimeKey: { pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, preLaunchAuthorizationSha256: PRELAUNCH_SHA256 },
      activation: { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
      preLaunchAuthorization: before.prelaunch,
      launchSpecAuthorization: spec.reference,
      exactInvocation: spec.record.launch,
      preStateSha256,
      preState: before,
      baselineSpawnOnly: true,
      currentAutoLaunchForbidden: true,
      expiresAt: null,
      automaticRelease: false,
      output: { leaseId: id, root: posix(root), file: LIVE_LEASE_FILE },
    },
  };
}
function validateLease(lease, spec, before, root = lease.root) {
  const record = lease.record;
  assert(record.schema === "p3-r5-pair-scoped-live-launch-lease/v1" && record.recordState === "held", "live lease state is invalid.");
  exact(record.oneTimeKey, { pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, preLaunchAuthorizationSha256: PRELAUNCH_SHA256 }, "live lease one-time key");
  exact(record.preLaunchAuthorization, before.prelaunch, "live lease pre-launch binding");
  exact(record.launchSpecAuthorization, spec.reference, "live lease launch-spec binding");
  exact(record.exactInvocation, spec.record.launch, "live lease exact invocation");
  assert(record.preStateSha256 === sha256(jsonBytes(before)), "live lease pre-state hash changed.");
  exact(record.preState, before, "live lease pre-state");
  assert(record.baselineSpawnOnly === true && record.currentAutoLaunchForbidden === true && record.expiresAt === null && record.automaticRelease === false, "live lease reuse boundary changed.");
  exact(record.output, { leaseId: lease.id, root: posix(root), file: LIVE_LEASE_FILE }, "live lease output binding");
}
function ensureParent(parent, label) {
  const external = resolve(EXTERNAL_RECORDS_ROOT);
  const normalized = resolve(parent);
  assertDirectory(external, "external coordinator records root");
  assert(external !== normalized && isWithin(external, normalized), `${label} parent escapes coordinator records root.`);
  const created = [];
  let cursor = normalized;
  while (!existsSync(cursor)) {
    assert(isWithin(external, cursor) && resolve(cursor) !== external, `${label} parent escapes coordinator records root.`);
    created.push(cursor);
    cursor = dirname(cursor);
  }
  assertDirectory(cursor, `${label} existing ancestor`);
  for (const directory of created.reverse()) {
    mkdirSync(directory, { recursive: false, mode: 0o700 });
    assertDirectory(directory, `${label} created ancestor`);
  }
  return created;
}
function removeOwnedEmptyParents(created) {
  for (const directory of [...created].reverse()) {
    if (!existsSync(directory)) continue;
    assertDirectory(directory, "rollback parent");
    if (readdirSync(directory).length === 0) rmdirSync(directory);
  }
}
function makeStage(finalRoot, label) {
  const parent = dirname(finalRoot);
  assertDirectory(parent, `${label} parent`);
  const stage = join(parent, `.${basename(finalRoot)}.stage-${randomUUID()}`);
  assert(isWithin(parent, stage) && resolve(stage) !== resolve(parent), `${label} stage escapes parent.`);
  assertAbsent(stage, `${label} stage`);
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  return stage;
}
function removeOwnedStage(stage, finalRoot) {
  if (!stage || !existsSync(stage)) return;
  assert(resolve(dirname(stage)) === resolve(dirname(finalRoot)) && basename(stage).startsWith(`.${basename(finalRoot)}.stage-`), "refusing to remove a stage outside this transaction.");
  rmSync(stage, { recursive: true, force: false });
}
function publishDirectory({ parent, root, label, writeStage, validateStage, revalidate }) {
  assertAbsent(root, `${label} final root`);
  let createdParents = [];
  let stage = null;
  let published = false;
  try {
    createdParents = ensureParent(parent, label);
    stage = makeStage(root, label);
    writeStage(stage);
    validateStage(stage);
    revalidate({ stage, published: false });
    assertAbsent(root, `${label} final root immediately before atomic publication`);
    renameSync(stage, root);
    stage = null;
    published = true;
    try {
      validateStage(root);
      revalidate({ stage: null, published: true });
    } catch (error) {
      throw new PublishedIntegrityError(posix(root), `${label} was atomically published but post-publication integrity validation failed: ${error.message}`);
    }
    return { root: posix(root), published: true };
  } catch (error) {
    try { removeOwnedStage(stage, root); } catch (cleanupError) { error.message = `${error.message} Stage cleanup failed: ${cleanupError.message}`; }
    if (!published) {
      try { removeOwnedEmptyParents(createdParents); } catch (cleanupError) { error.message = `${error.message} Parent cleanup failed: ${cleanupError.message}`; }
    }
    throw error;
  }
}

function assertRecordParentContents(parent, expectedNames, label) {
  const entries = recordParentEntries(parent, label);
  exact(entries.map((entry) => entry.name), [...expectedNames].sort((left, right) => left.localeCompare(right, "en")), label + " entry names");
  assert(entries.every((entry) => entry.directory && !entry.symlink && !entry.file), label + " contains a non-directory or symlink.");
  return entries;
}
function validatePublishedLease(lease, spec, before) {
  const reference = fileReference(join(lease.root, LIVE_LEASE_FILE), "published pair live lease");
  assertTree(lease.root, [{ logicalPath: LIVE_LEASE_FILE, sha256: reference.sha256, bytes: reference.bytes }], "published pair live lease root");
  const actual = { ...lease, record: readJson(join(lease.root, LIVE_LEASE_FILE), "published pair live lease") };
  validateLease(actual, spec, before, lease.root);
  exact(actual.record, lease.record, "published pair live lease bytes");
  return { root: posix(lease.root), reference, record: actual.record };
}
function publishLiveLease(spec, before, lease = buildLease(spec, before)) {
  const bytes = jsonBytes(lease.record);
  const publishedLease = {
    ...lease,
    publication: { root: posix(lease.root), sha256: sha256(bytes), bytes: bytes.length },
  };
  assertAbsent(lease.root, "planned pair live lease root");
  try {
    const publication = publishDirectory({
      parent: LIVE_LEASE_PARENT,
      root: lease.root,
      label: "pair live lease",
      writeStage(stage) {
        writeFileSync(join(stage, LIVE_LEASE_FILE), bytes, { mode: 0o600 });
      },
      validateStage(stage) {
        const reference = fileReference(join(stage, LIVE_LEASE_FILE), "staged pair live lease");
        assert(reference.sha256 === sha256(bytes) && reference.bytes === bytes.length, "staged pair live lease bytes changed.");
        assertTree(stage, [{ logicalPath: LIVE_LEASE_FILE, sha256: reference.sha256, bytes: reference.bytes }], "staged pair live lease root");
        exact(readJson(join(stage, LIVE_LEASE_FILE), "staged pair live lease"), lease.record, "staged pair live lease content");
        validateLease(lease, spec, before, lease.root);
      },
      revalidate({ stage, published }) {
        const rereadSpec = readPublishedLaunchSpec(true);
        exact(rereadSpec.reference, spec.reference, "launch-spec changed while acquiring pair live lease");
        const rereadBefore = collectInitialLaunchState(rereadSpec);
        exact(rereadBefore, before, "pre-spawn state changed while acquiring pair live lease");
        assertRecordParentContents(LIVE_LEASE_PARENT, [published ? basename(lease.root) : basename(stage)], "pair live lease parent");
        assertRecordParentContents(TERMINAL_PARENT, [], "baseline terminal parent");
        assertRecordParentContents(UNRESOLVED_PARENT, [], "baseline unresolved parent");
        if (published) validatePublishedLease(publishedLease, rereadSpec, rereadBefore);
      },
    });
    return { ...publishedLease, publication: { ...publishedLease.publication, root: publication.root } };
  } catch (error) {
    error.lease = publishedLease;
    throw error;
  }
}
function assertLeaseHeldForThisInvocation(lease, spec, before) {
  assertRecordParentContents(LIVE_LEASE_PARENT, [basename(lease.root)], "pair live lease parent before spawn");
  assertRecordParentContents(TERMINAL_PARENT, [], "baseline terminal parent before spawn");
  assertRecordParentContents(UNRESOLVED_PARENT, [], "baseline unresolved parent before spawn");
  return validatePublishedLease(lease, spec, before);
}
function revalidateImmediatelyBeforeSpawn(lease, spec, before) {
  const rereadSpec = readPublishedLaunchSpec(true);
  exact(rereadSpec.reference, spec.reference, "launch-spec changed immediately before Codex spawn");
  exact(rereadSpec.record, spec.record, "launch-spec content changed immediately before Codex spawn");
  const rereadBefore = collectInitialLaunchState(rereadSpec);
  exact(rereadBefore, before, "pre-spawn state changed immediately before Codex spawn");
  const publishedLease = assertLeaseHeldForThisInvocation(lease, rereadSpec, rereadBefore);
  return { spec: rereadSpec, before: rereadBefore, lease: publishedLease };
}
function collectCurrentSerialState() {
  try {
    const prelaunch = validatePrelaunchRecord();
    const activation = validateActivationAndDelivery(prelaunch.record);
    const current = validateCurrentDeliveredNotLaunched(prelaunch.record);
    assertCurrentNotLaunchedState(readJson(CURRENT_DELIVERY_RECEIPT_PATH, "current delivery receipt terminal recheck").result, "current delivery receipt terminal recheck");
    const noProgressOrWorktreeMutation = validateNoProgressOrWorktreeMutation(activation);
    return {
      ok: true,
      prelaunch: prelaunch.reference,
      activation,
      currentDeliveredNotLaunched: current,
      noProgressOrWorktreeMutation,
    };
  } catch (error) {
    return { ok: false, error: serialError(error) };
  }
}
function bufferFromSpawnValue(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value === undefined || value === null) return Buffer.alloc(0);
  return Buffer.from(String(value), "utf8");
}
function executeDirect(command) {
  const startedAt = new Date().toISOString();
  let result;
  let thrown = null;
  try {
    result = spawnSync(command.executable, command.argv, {
      cwd: command.cwd,
      shell: false,
      timeout: command.timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      encoding: "buffer",
      windowsHide: true,
    });
  } catch (error) {
    thrown = error;
  }
  const endedAt = new Date().toISOString();
  const error = thrown ?? result?.error ?? null;
  const pid = Number.isInteger(result?.pid) && result.pid > 0 ? result.pid : null;
  const status = Number.isInteger(result?.status) ? result.status : null;
  const signal = result?.signal ?? null;
  const timedOut = error?.code === "ETIMEDOUT";
  const possiblyStarted = pid !== null;
  const uncertain = timedOut || signal !== null || (error !== null && possiblyStarted) || (error === null && status === null);
  return {
    command: {
      executable: command.executable,
      argv: [...command.argv],
      cwd: command.cwd,
      shell: false,
      timeoutMs: command.timeoutMs,
    },
    startedAt,
    endedAt,
    pid,
    childStarted: possiblyStarted,
    exitCode: status,
    signal,
    timedOut,
    error: serialError(error),
    uncertain,
    stdout: bufferFromSpawnValue(result?.stdout),
    stderr: bufferFromSpawnValue(result?.stderr),
  };
}
function runRoleLaunch(spec) {
  const launch = spec.record.launch;
  assert(launch.shell === false && launch.executable === "codex" && launch.cwd === ROLE_HOME, "launch-spec command changed before Codex spawn.");
  exact(launch.argv, buildExpectedCodexArgv(), "launch-spec argv changed before Codex spawn");
  return executeDirect(launch);
}
function runPinnedReturnCheck(archive) {
  const prelaunch = validatePrelaunchRecord();
  validateActivationAndDelivery(prelaunch.record);
  const plan = fileReference(RETURN_PLAN_PATH, "return plan immediately before activation-pinned check");
  assert(plan.sha256 === RETURN_PLAN_SHA256, "return plan changed immediately before activation-pinned check.");
  const rereadArchive = fileReference(archive.path, "return archive immediately before activation-pinned check");
  exact(rereadArchive, archive, "return archive changed immediately before activation-pinned check");
  const command = {
    executable: process.execPath,
    argv: [RETURN_HELPER_PATH, "--check", RETURN_PLAN_PATH, archive.path, BASELINE_WORKTREE],
    cwd: ROLE_HOME,
    shell: false,
    timeoutMs: LAUNCH_TIMEOUT_MS,
  };
  return executeDirect(command);
}
function observeRoleHomeAfterAttempt() {
  try {
    const strict = inspectRoleHomeAfterLaunch();
    return { strictInventory: true, inventory: strict, archive: strict.archive, error: null };
  } catch (error) {
    let archive = null;
    try {
      const candidate = join(ROLE_HOME, "return.ustar.tar");
      if (existsSync(candidate)) archive = fileReference(candidate, "observed role return archive after failed launch");
    } catch (archiveError) {
      archive = { unavailable: true, error: serialError(archiveError) };
    }
    return { strictInventory: false, inventory: null, archive, error: serialError(error) };
  }
}
function isUncertainProcessOutcome(observation) {
  return observation.uncertain === true;
}
function processSummary(observation) {
  if (!observation) return null;
  return {
    command: observation.command,
    startedAt: observation.startedAt,
    endedAt: observation.endedAt,
    pid: observation.pid,
    childStarted: observation.childStarted,
    exitCode: observation.exitCode,
    signal: observation.signal,
    timedOut: observation.timedOut,
    error: observation.error,
    uncertain: observation.uncertain,
  };
}
function reportReferences(roleProcess, returnCheck) {
  const buffers = [
    [ROLE_STDOUT_FILE, roleProcess?.stdout ?? Buffer.alloc(0)],
    [ROLE_STDERR_FILE, roleProcess?.stderr ?? Buffer.alloc(0)],
    [CHECK_STDOUT_FILE, returnCheck?.stdout ?? Buffer.alloc(0)],
    [CHECK_STDERR_FILE, returnCheck?.stderr ?? Buffer.alloc(0)],
  ];
  return {
    buffers,
    references: buffers.map(([logicalPath, bytes]) => bufferReference(logicalPath, bytes)),
  };
}
function terminalResult(terminalState, roleProcess, returnCheck, roleHomeObservation, currentSerialRecheck) {
  const checkPassed = Boolean(
    returnCheck
      && returnCheck.childStarted
      && returnCheck.exitCode === 0
      && returnCheck.signal === null
      && returnCheck.error === null
      && returnCheck.uncertain === false,
  );
  return {
    terminalState,
    attemptConsumed: true,
    roleLaunchExecuted: roleProcess?.childStarted === true,
    roleExitCode: roleProcess?.exitCode ?? null,
    roleProcessUncertain: roleProcess?.uncertain ?? false,
    strictRoleHomeInventoryPassed: roleHomeObservation?.strictInventory === true,
    returnCheckExecuted: returnCheck !== null,
    returnCheckPassed: checkPassed,
    coordinatorReturnApply: false,
    implementationAppliedToWorktree: false,
    siteMutation: false,
    lifecycleMutation: false,
    browserMeasurement: false,
    figmaMeasurement: false,
    p11Mutation: false,
    currentSerialStateRechecked: currentSerialRecheck?.ok === true,
  };
}
function buildTerminalPublication({
  terminalState,
  spec,
  lease,
  before,
  roleProcess,
  returnCheck,
  roleHomeObservation,
  currentSerialRecheck,
  post,
  reason,
}) {
  assert(["success", "failure"].includes(terminalState), "terminal publication must be success or failure.");
  const reports = reportReferences(roleProcess, returnCheck);
  const recordedAt = new Date().toISOString();
  const archive = roleHomeObservation?.archive ?? null;
  const sidecar = {
    schema: "p3-r5-baseline-seq1-launch-observation/v1",
    terminalState,
    recordedAt,
    preLaunchAuthorization: before.prelaunch,
    launchSpecAuthorization: spec.reference,
    lease: {
      root: posix(lease.root),
      sha256: lease.publication.sha256,
      preStateSha256: lease.record.preStateSha256,
      recordState: lease.record.recordState,
    },
    roleProcess: processSummary(roleProcess),
    returnCheck: processSummary(returnCheck),
    roleHomeObservation,
    currentSerialRecheck,
    archive,
    postLaunchState: post ?? null,
    reports: reports.references,
    reason: reason ?? null,
    validation: {
      archiveUstarAndManifest: terminalState === "success"
        ? "activation-pinned helper --check exited 0"
        : "not asserted as passing",
      helperPath: posix(RETURN_HELPER_PATH),
      helperSha256: RETURN_HELPER_SHA256,
      returnPlan: { path: posix(RETURN_PLAN_PATH), sha256: RETURN_PLAN_SHA256 },
    },
    nonAssertions: {
      p11: "not authorized or changed",
      cleanRoom: "not asserted",
      modelVisibleToolSurface: "not asserted",
      actualFreshContextIdentity: "not asserted",
      browserOrFigmaMeasurement: "not performed",
    },
  };
  const sidecarBytes = jsonBytes(sidecar);
  const sidecarReference = bufferReference(TERMINAL_SIDECAR_FILE, sidecarBytes);
  const id = sha256(Buffer.from(
    "p3-r5-baseline-seq1-terminal\0"
      + terminalState + "\0"
      + PRELAUNCH_SHA256 + "\0"
      + spec.reference.sha256 + "\0"
      + lease.publication.sha256 + "\0"
      + sidecarReference.sha256,
    "utf8",
  ));
  const root = join(TERMINAL_PARENT, id);
  const result = terminalResult(terminalState, roleProcess, returnCheck, roleHomeObservation, currentSerialRecheck);
  const record = {
    schema: "p3-r5-baseline-seq1-launch-terminal/v1",
    recordState: "finalized",
    terminalState,
    recordedAt,
    oneTimeKey: lease.record.oneTimeKey,
    activation: lease.record.activation,
    preLaunchAuthorization: before.prelaunch,
    launchSpecAuthorization: spec.reference,
    lease: {
      root: posix(lease.root),
      sha256: lease.publication.sha256,
      file: LIVE_LEASE_FILE,
      preStateSha256: lease.record.preStateSha256,
    },
    observation: sidecarReference,
    reports: reports.references,
    archive,
    result,
    prelaunchCompletionCandidate: {
      sha256: COMPLETION_CANDIDATE_SHA256,
      meaning: "template-only candidate hash; not a claim about these final completion bytes",
    },
    leaseRelease: {
      effectiveAfterThisTerminalPublication: true,
      physicalDeletePerformed: false,
      recordRetention: "append-only live lease retained as consumed-attempt evidence",
    },
    authorizationBoundary: {
      roleLaunch: true,
      returnApply: false,
      implementationAppliedToWorktree: false,
      siteMutation: false,
      lifecycleMutation: false,
      browserMeasurement: false,
      figmaMeasurement: false,
      p11Mutation: false,
    },
    nonAssertions: {
      p11: "not authorized or changed",
      cleanRoom: "not asserted",
      modelVisibleToolSurface: "not asserted",
      actualFreshContextIdentity: "not asserted",
    },
    output: { recordId: id, root: posix(root), file: TERMINAL_FILE, observationFile: TERMINAL_SIDECAR_FILE },
  };
  const recordBytes = jsonBytes(record);
  const files = [
    [TERMINAL_FILE, recordBytes],
    [TERMINAL_SIDECAR_FILE, sidecarBytes],
    ...reports.buffers,
  ];
  const publication = {
    id,
    root,
    record,
    sidecar,
    files,
    terminalReference: bufferReference(TERMINAL_FILE, recordBytes),
    sidecarReference,
  };
  validateTerminalPublication(publication, terminalState);
  return publication;
}
function validateTerminalPublication(publication, expectedTerminalState) {
  const { record, sidecar, files, terminalReference, sidecarReference } = publication;
  assert(record.schema === "p3-r5-baseline-seq1-launch-terminal/v1" && record.recordState === "finalized", "terminal record state is invalid.");
  assert(record.terminalState === expectedTerminalState && sidecar.terminalState === expectedTerminalState, "terminal state mismatch.");
  exact(record.observation, sidecarReference, "terminal observation binding");
  exact(record.reports, files
    .filter(([logicalPath]) => [ROLE_STDOUT_FILE, ROLE_STDERR_FILE, CHECK_STDOUT_FILE, CHECK_STDERR_FILE].includes(logicalPath))
    .map(([logicalPath, bytes]) => bufferReference(logicalPath, bytes)), "terminal report binding");
  assert(record.output.recordId === publication.id && record.output.root === posix(publication.root), "terminal output binding changed.");
  assert(terminalReference.sha256 === sha256(jsonBytes(record)), "terminal record SHA-256 is invalid.");
  if (expectedTerminalState === "success") {
    assert(record.result.roleLaunchExecuted === true && record.result.roleExitCode === 0, "success terminal has no successful role exit.");
    assert(record.result.strictRoleHomeInventoryPassed === true, "success terminal has no strict role-home inventory.");
    assert(record.result.returnCheckPassed === true, "success terminal has no activation-pinned helper check PASS.");
    assert(record.result.currentSerialStateRechecked === true, "success terminal has no current serial recheck.");
    assert(record.archive && /^[a-f0-9]{64}$/.test(record.archive.sha256), "success terminal has no archive binding.");
  }
}
function validatePublishedTerminal(publication, expectedTerminalState, treeRoot = publication.root) {
  const expectedFiles = publication.files.map(([logicalPath, bytes]) => ({ logicalPath, sha256: sha256(bytes), bytes: bytes.length }));
  assertTree(treeRoot, expectedFiles, "published terminal root");
  const terminalReference = fileReference(join(treeRoot, TERMINAL_FILE), "published terminal record");
  const sidecarReference = fileReference(join(treeRoot, TERMINAL_SIDECAR_FILE), "published terminal observation");
  assert(terminalReference.sha256 === publication.terminalReference.sha256, "published terminal record bytes changed.");
  assert(sidecarReference.sha256 === publication.sidecarReference.sha256, "published terminal observation bytes changed.");
  exact(readJson(join(treeRoot, TERMINAL_FILE), "published terminal record"), publication.record, "published terminal record content");
  exact(readJson(join(treeRoot, TERMINAL_SIDECAR_FILE), "published terminal observation"), publication.sidecar, "published terminal observation content");
  validateTerminalPublication(publication, expectedTerminalState);
}
function publishTerminal(args) {
  const publication = buildTerminalPublication(args);
  assertAbsent(publication.root, "terminal output root");
  const expectedTerminalState = args.terminalState;
  const result = publishDirectory({
    parent: TERMINAL_PARENT,
    root: publication.root,
    label: "baseline terminal launch record",
    writeStage(stage) {
      for (const [logicalPath, bytes] of publication.files) writeFileSync(join(stage, logicalPath), bytes, { mode: 0o600 });
    },
    validateStage(stage) {
      validatePublishedTerminal(publication, expectedTerminalState, stage);
    },
    revalidate({ stage, published }) {
      const rereadSpec = readPublishedLaunchSpec(true, { revalidatePreSpawn: false });
      exact(rereadSpec.reference, args.spec.reference, "launch-spec changed during terminal publication");
      assertRecordParentContents(LIVE_LEASE_PARENT, [basename(args.lease.root)], "pair live lease parent during terminal publication");
      validatePublishedLease(args.lease, rereadSpec, args.before);
      assertRecordParentContents(TERMINAL_PARENT, [published ? basename(publication.root) : basename(stage)], "baseline terminal parent during terminal publication");
      assertRecordParentContents(UNRESOLVED_PARENT, [], "baseline unresolved parent during terminal publication");
      const currentRecheck = collectCurrentSerialState();
      exact(currentRecheck, args.currentSerialRecheck, "current serial state changed during terminal publication");
      if (expectedTerminalState === "success") {
        assert(currentRecheck.ok, "current serial state is invalid at successful terminal publication.");
        const post = collectPostLaunchState(rereadSpec, args.before);
        exact(post, args.post, "post-launch state changed during successful terminal publication");
      }
    },
  });
  return {
    status: "published-" + expectedTerminalState + "-terminal",
    root: result.root,
    record: publication.record,
    terminalState: expectedTerminalState,
  };
}
function buildUnresolvedPublication({ spec, lease, before, roleProcess, returnCheck, reason, currentSerialRecheck, priorTerminalRoot = null }) {
  const recordedAt = new Date().toISOString();
  const observation = {
    schema: "p3-r5-baseline-seq1-launch-unresolved-observation/v1",
    recordedAt,
    reason,
    preLaunchAuthorization: before.prelaunch,
    launchSpecAuthorization: spec.reference,
    lease: { root: posix(lease.root), sha256: lease.publication.sha256, preStateSha256: lease.record.preStateSha256 },
    roleProcess: processSummary(roleProcess),
    returnCheck: processSummary(returnCheck),
    currentSerialRecheck,
    priorTerminalRoot,
    nonAssertions: {
      p11: "not authorized or changed",
      cleanRoom: "not asserted",
      modelVisibleToolSurface: "not asserted",
      actualFreshContextIdentity: "not asserted",
    },
  };
  const observationBytes = jsonBytes(observation);
  const observationReference = bufferReference("unresolved-observation.json", observationBytes);
  const id = sha256(Buffer.from(
    "p3-r5-baseline-seq1-unresolved\0"
      + PRELAUNCH_SHA256 + "\0"
      + spec.reference.sha256 + "\0"
      + lease.publication.sha256 + "\0"
      + observationReference.sha256,
    "utf8",
  ));
  const root = join(UNRESOLVED_PARENT, id);
  const record = {
    schema: "p3-r5-baseline-seq1-launch-unresolved/v1",
    recordState: "finalized",
    state: "unresolved",
    recordedAt,
    oneTimeKey: lease.record.oneTimeKey,
    preLaunchAuthorization: before.prelaunch,
    launchSpecAuthorization: spec.reference,
    lease: { root: posix(lease.root), sha256: lease.publication.sha256, file: LIVE_LEASE_FILE },
    observation: observationReference,
    priorTerminalRoot,
    attemptConsumed: true,
    automaticRetry: false,
    liveLeaseRetained: true,
    output: { recordId: id, root: posix(root), file: UNRESOLVED_FILE, observationFile: "unresolved-observation.json" },
  };
  const recordBytes = jsonBytes(record);
  return {
    id,
    root,
    record,
    observation,
    files: [[UNRESOLVED_FILE, recordBytes], ["unresolved-observation.json", observationBytes]],
    recordReference: bufferReference(UNRESOLVED_FILE, recordBytes),
    observationReference,
  };
}
function validatePublishedUnresolved(publication, treeRoot = publication.root) {
  const expectedFiles = publication.files.map(([logicalPath, bytes]) => ({ logicalPath, sha256: sha256(bytes), bytes: bytes.length }));
  assertTree(treeRoot, expectedFiles, "published unresolved root");
  const recordReference = fileReference(join(treeRoot, UNRESOLVED_FILE), "published unresolved record");
  assert(recordReference.sha256 === publication.recordReference.sha256, "published unresolved record bytes changed.");
  exact(readJson(join(treeRoot, UNRESOLVED_FILE), "published unresolved record"), publication.record, "published unresolved record content");
  assert(publication.record.state === "unresolved" && publication.record.attemptConsumed === true && publication.record.automaticRetry === false && publication.record.liveLeaseRetained === true, "unresolved record boundary changed.");
  exact(publication.record.observation, publication.observationReference, "unresolved observation binding");
  assert(publication.record.output.root === posix(publication.root) && publication.record.output.file === UNRESOLVED_FILE, "unresolved output binding changed.");
}
function publishUnresolved(args) {
  const publication = buildUnresolvedPublication(args);
  assertAbsent(publication.root, "unresolved output root");
  const result = publishDirectory({
    parent: UNRESOLVED_PARENT,
    root: publication.root,
    label: "baseline unresolved launch record",
    writeStage(stage) {
      for (const [logicalPath, bytes] of publication.files) writeFileSync(join(stage, logicalPath), bytes, { mode: 0o600 });
    },
    validateStage(stage) {
      validatePublishedUnresolved(publication, stage);
    },
    revalidate({ stage, published }) {
      const rereadSpec = readPublishedLaunchSpec(true, { revalidatePreSpawn: false });
      exact(rereadSpec.reference, args.spec.reference, "launch-spec changed during unresolved publication");
      assertRecordParentContents(LIVE_LEASE_PARENT, [basename(args.lease.root)], "pair live lease parent during unresolved publication");
      validatePublishedLease(args.lease, rereadSpec, args.before);
      assertRecordParentContents(UNRESOLVED_PARENT, [published ? basename(publication.root) : basename(stage)], "baseline unresolved parent during unresolved publication");
    },
  });
  return { status: "published-unresolved", root: result.root, record: publication.record, terminalState: "unresolved" };
}
function publishTerminalOrUnresolved(args) {
  try {
    return publishTerminal(args);
  } catch (error) {
    const unresolved = publishUnresolved({
      spec: args.spec,
      lease: args.lease,
      before: args.before,
      roleProcess: args.roleProcess,
      returnCheck: args.returnCheck,
      currentSerialRecheck: collectCurrentSerialState(),
      priorTerminalRoot: error instanceof PublishedIntegrityError ? error.root : null,
      reason: {
        type: "terminal-publication-integrity-or-publication-failure",
        error: serialError(error),
        publishedTerminalRetained: error instanceof PublishedIntegrityError,
      },
    });
    return { ...unresolved, terminalPublicationError: serialError(error) };
  }
}
function terminalFailure(spec, lease, before, roleProcess, returnCheck, roleHomeObservation, currentSerialRecheck, reason) {
  return publishTerminalOrUnresolved({
    terminalState: "failure",
    spec,
    lease,
    before,
    roleProcess,
    returnCheck,
    roleHomeObservation,
    currentSerialRecheck,
    post: null,
    reason,
  });
}
function unresolvedOutcome(spec, lease, before, roleProcess, returnCheck, reason) {
  return publishUnresolved({
    spec,
    lease,
    before,
    roleProcess,
    returnCheck,
    currentSerialRecheck: collectCurrentSerialState(),
    reason,
  });
}
function applyFutureAuthorizedLaunch() {
  const spec = readPublishedLaunchSpec(true);
  const before = collectInitialLaunchState(spec);
  oneTimeGuard();
  const preparedLease = buildLease(spec, before);
  let lease;
  try {
    lease = publishLiveLease(spec, before, preparedLease);
  } catch (error) {
    if (error instanceof PublishedIntegrityError && error.lease) {
      return publishUnresolved({
        spec,
        lease: error.lease,
        before,
        roleProcess: null,
        returnCheck: null,
        currentSerialRecheck: collectCurrentSerialState(),
        reason: {
          type: "pair-live-lease-post-publication-integrity-failure",
          error: serialError(error),
          publishedLeaseRetained: true,
        },
      });
    }
    throw error;
  }
  let roleProcess = null;
  let returnCheck = null;
  let roleHomeObservation = null;
  try {
    revalidateImmediatelyBeforeSpawn(lease, spec, before);
  } catch (error) {
    return terminalFailure(
      spec,
      lease,
      before,
      null,
      null,
      null,
      collectCurrentSerialState(),
      { type: "before-spawn-revalidation-failed", error: serialError(error) },
    );
  }
  roleProcess = runRoleLaunch(spec);
  roleHomeObservation = observeRoleHomeAfterAttempt();
  const currentAfterRole = collectCurrentSerialState();
  if (isUncertainProcessOutcome(roleProcess)) {
    return unresolvedOutcome(spec, lease, before, roleProcess, null, {
      type: "role-process-outcome-uncertain",
      error: roleProcess.error,
      timeout: roleProcess.timedOut,
      signal: roleProcess.signal,
    });
  }
  if (!currentAfterRole.ok) {
    return unresolvedOutcome(spec, lease, before, roleProcess, null, {
      type: "current-serial-state-recheck-failed-after-role-process",
      error: currentAfterRole.error,
    });
  }
  if (roleProcess.error !== null || roleProcess.exitCode !== 0) {
    return terminalFailure(spec, lease, before, roleProcess, null, roleHomeObservation, currentAfterRole, {
      type: "role-process-failed",
      error: roleProcess.error,
      exitCode: roleProcess.exitCode,
      signal: roleProcess.signal,
    });
  }
  if (!roleHomeObservation.strictInventory) {
    return terminalFailure(spec, lease, before, roleProcess, null, roleHomeObservation, currentAfterRole, {
      type: "role-home-inventory-or-archive-failed",
      error: roleHomeObservation.error,
    });
  }
  let post;
  try {
    post = collectPostLaunchState(spec, before);
  } catch (error) {
    return terminalFailure(spec, lease, before, roleProcess, null, roleHomeObservation, currentAfterRole, {
      type: "post-role-state-validation-failed",
      error: serialError(error),
    });
  }
  try {
    returnCheck = runPinnedReturnCheck(post.baselineRoleHome.archive);
  } catch (error) {
    return terminalFailure(spec, lease, before, roleProcess, null, roleHomeObservation, currentAfterRole, {
      type: "activation-pinned-return-check-input-validation-failed",
      error: serialError(error),
    });
  }
  const currentAfterCheck = collectCurrentSerialState();
  if (isUncertainProcessOutcome(returnCheck)) {
    return unresolvedOutcome(spec, lease, before, roleProcess, returnCheck, {
      type: "activation-pinned-return-check-outcome-uncertain",
      error: returnCheck.error,
      timeout: returnCheck.timedOut,
      signal: returnCheck.signal,
    });
  }
  if (!currentAfterCheck.ok) {
    return unresolvedOutcome(spec, lease, before, roleProcess, returnCheck, {
      type: "current-serial-state-recheck-failed-after-return-check",
      error: currentAfterCheck.error,
    });
  }
  if (returnCheck.error !== null || returnCheck.exitCode !== 0) {
    return terminalFailure(spec, lease, before, roleProcess, returnCheck, roleHomeObservation, currentAfterCheck, {
      type: "activation-pinned-return-check-failed",
      error: returnCheck.error,
      exitCode: returnCheck.exitCode,
      signal: returnCheck.signal,
    });
  }
  try {
    const postAfterCheck = collectPostLaunchState(spec, before);
    exact(postAfterCheck, post, "post-launch state changed during activation-pinned return check");
  } catch (error) {
    return terminalFailure(spec, lease, before, roleProcess, returnCheck, observeRoleHomeAfterAttempt(), currentAfterCheck, {
      type: "post-return-check-state-validation-failed",
      error: serialError(error),
    });
  }
  return publishTerminalOrUnresolved({
    terminalState: "success",
    spec,
    lease,
    before,
    roleProcess,
    returnCheck,
    roleHomeObservation,
    currentSerialRecheck: currentAfterCheck,
    post,
    reason: null,
  });
}
function dryRun() {
  const spec = readPublishedLaunchSpec(false);
  const authorizationPreSpawnState = collectAuthorizationPreSpawnState();
  const initial = spec.status === "published" ? collectInitialLaunchState(spec) : collectInitialLaunchState(null);
  const guard = oneTimeGuardStatus();
  const status = spec.status !== "published"
    ? "blocked-dry-run-launch-spec-not-published"
    : guard.clear
      ? "validated-dry-run-no-lease-spawn-or-publication"
      : "blocked-dry-run-one-time-guard-occupied";
  return {
    schema: "p3-r5-baseline-seq1-launch-dry-run/v2",
    status,
    externalWritesPerformed: false,
    roleContextCreated: false,
    liveLeaseAcquired: false,
    roleLaunchExecuted: false,
    implementationAppliedToWorktree: false,
    returnApplied: false,
    browserOrFigmaMeasurement: false,
    p11Changed: false,
    launchSpec: spec.status === "published" ? { reference: spec.reference, launch: spec.record.launch } : { status: spec.status },
    authorizationPreSpawnState: { sha256: canonicalSha256(authorizationPreSpawnState), state: authorizationPreSpawnState },
    initialLaunchState: initial,
    oneTimeGuard: guard,
    intendedCodexInvocation: expectedLaunchSpec(),
    futureExternalMutationsOnlyUnderApply: [
      {
        action: "append-only pair-wide live lease publication",
        root: posix(join(LIVE_LEASE_PARENT, leaseId())),
        method: "same-parent stage, validate, atomic rename; published lease remains retained as consumed-attempt evidence",
      },
      {
        action: "direct shell:false Codex child spawn",
        cwd: ROLE_HOME,
        archiveExpectedAt: posix(join(ROLE_HOME, "return.ustar.tar")),
      },
      {
        action: "activation-pinned helper check only",
        argv: [RETURN_HELPER_PATH, "--check", RETURN_PLAN_PATH, posix(join(ROLE_HOME, "return.ustar.tar")), BASELINE_WORKTREE],
        returnApply: false,
      },
      {
        action: "append-only terminal success/failure or unresolved publication",
        roots: [posix(TERMINAL_PARENT), posix(UNRESOLVED_PARENT)],
        method: "same-parent stage, validate, atomic rename; no published-record deletion",
      },
    ],
    nonAssertions: {
      p11: "not authorized or changed",
      cleanRoom: "not asserted",
      modelVisibleToolSurface: "not asserted",
      actualFreshContextIdentity: "not asserted",
    },
  };
}
function expectReject(label, action) {
  try {
    action();
  } catch {
    return label;
  }
  fail("self-test expected rejection: " + label);
}
function selfTest() {
  const expected = expectedLaunchSpec();
  const rejected = [];
  const promptMismatch = { ...expected, argv: [...expected.argv.slice(0, -1), "tampered prompt"] };
  rejected.push(expectReject("mismatched spec prompt", () => exact(promptMismatch, expectedLaunchSpec(), "self-test prompt")));
  const addDir = { ...expected, argv: [...expected.argv.slice(0, -1), "--add-dir", "C:/forbidden", "--", expected.argv.at(-1)] };
  rejected.push(expectReject("add-dir argument", () => {
    assert(!addDir.argv.some((entry) => entry === "--add-dir" || entry.startsWith("--add-dir=")), "self-test add-dir rejected");
  }));
  const shellEnabled = { ...expected, shell: true };
  rejected.push(expectReject("shell true", () => exact(shellEnabled, expectedLaunchSpec(), "self-test shell")));
  const archive = { path: "C:/synthetic/return.ustar.tar", sha256: "a".repeat(64), bytes: 1 };
  const baseTree = {
    files: normalizedInventory([...BASELINE_ATTACHMENTS, { logicalPath: "return.ustar.tar", sha256: archive.sha256, bytes: archive.bytes }]),
    directories: ["input", "input/references"],
    invalidEntries: [],
  };
  strictRoleHomeSnapshot(baseTree, archive, "self-test good inventory");
  rejected.push(expectReject("archive absent", () => strictRoleHomeSnapshot(baseTree, null, "self-test archive absent")));
  rejected.push(expectReject("symlink or special output", () => strictRoleHomeSnapshot({ ...baseTree, invalidEntries: ["output-link"] }, archive, "self-test symlink")));
  const mutatedInput = {
    ...baseTree,
    files: baseTree.files.map((entry) => entry.logicalPath === "input/assignment.json" ? { ...entry, sha256: "b".repeat(64) } : entry),
  };
  rejected.push(expectReject("input mutation", () => strictRoleHomeSnapshot(mutatedInput, archive, "self-test input mutation")));
  const extraOutput = {
    ...baseTree,
    files: [...baseTree.files, { logicalPath: "unexpected.txt", sha256: "c".repeat(64), bytes: 1 }],
  };
  rejected.push(expectReject("extra role-home output", () => strictRoleHomeSnapshot(extraOutput, archive, "self-test extra output")));
  rejected.push(expectReject("current mutation", () => assertCurrentNotLaunchedState({
    roleDelivered: true,
    roleLaunch: true,
    roleLaunched: false,
    implementation: false,
    returnApply: false,
    siteMutation: false,
    lifecycleMutation: false,
    browserOrFigmaMeasurement: false,
    p11Mutation: false,
    p11Changed: false,
  }, "self-test current mutation")));
  const syntheticRole = { childStarted: true, exitCode: 0, uncertain: false };
  const failedCheck = { childStarted: true, exitCode: 1, signal: null, error: null, uncertain: false };
  rejected.push(expectReject("helper check failure cannot be success", () => {
    const result = terminalResult("success", syntheticRole, failedCheck, { strictInventory: true }, { ok: true });
    assert(result.returnCheckPassed === true, "self-test helper check failure rejected");
  }));
  return {
    schema: "p3-r5-baseline-seq1-launch-self-test/v1",
    status: "PASS",
    externalWritesPerformed: false,
    spawnedProcesses: false,
    rejected,
  };
}
function main() {
  if (process.argv.length !== 3 || !["--dry-run", "--self-test", "--apply"].includes(process.argv[2])) {
    fail("Usage: node tools/r5-launch-baseline-seq1.mjs --dry-run|--self-test|--apply");
  }
  const argument = process.argv[2];
  const result = argument === "--dry-run"
    ? dryRun()
    : argument === "--self-test"
      ? selfTest()
      : applyFutureAuthorizedLaunch();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (argument === "--apply" && result.terminalState !== "success") process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try { main(); }
  catch (error) {
    process.stderr.write(`P3 R5 BASELINE ROLE LAUNCH DRY RUN: ${error.message}\n`);
    process.exitCode = 1;
  }
}

export {
  PAIR_ID,
  CONDITION,
  ACTIVATION_ID,
  HANDOFF_ID,
  DELIVERY_SEQUENCE,
  PROTOCOL_SHA256,
  ACTIVATION_ROOT,
  ACTIVATION_RECEIPT_PATH,
  ACTIVATION_RECEIPT_SHA256,
  DELIVERY_RECEIPT_PATH,
  DELIVERY_RECEIPT_SHA256,
  ROLE_HOME,
  CURRENT_HANDOFF_ID,
  CURRENT_ACTIVATION_ID,
  CURRENT_ACTIVATION_ROOT,
  CURRENT_DELIVERY_RECEIPT_PATH,
  CURRENT_DELIVERY_RECEIPT_SHA256,
  CURRENT_ROLE_HOME,
  BASELINE_WORKTREE,
  CURRENT_WORKTREE,
  PRELAUNCH_ROOT,
  PRELAUNCH_FILE,
  PRELAUNCH_PATH,
  PRELAUNCH_SHA256,
  PRELAUNCH_CANDIDATE_SHA256,
  COMPLETION_CANDIDATE_SHA256,
  PROGRESS_ROOT,
  INPUT_STAGING_SHA256,
  BASELINE_ATTACHMENTS,
  CURRENT_ATTACHMENTS,
  AUTHORIZATION_SCOPE,
  PRELAUNCH_EXECUTION,
};
