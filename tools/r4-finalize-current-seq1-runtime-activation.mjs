#!/usr/bin/env node
// P-3 R4 current condition / sequence 1 finalized-activation dry-run.
//
// --dry-run materializes a candidate only in a temporary directory, validates
// the complete coordinator record graph (including a byte-pinned helper
// fixture), then deletes that directory.  --apply is owner-operated and may
// publish only the staged activation and an empty external progress root.
// Neither mode creates a role home, delivers/launches a role, applies a return,
// mutates a site/lifecycle, measures browser/Figma, or changes P-11.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkRolePacket } from "../templates/verify/p3-role-packet.mjs";
import { currentPreparationInternals as I } from "./r4-prepare-current-seq1-runtime-activation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESIGNATED_COORDINATOR_RECORDS_ROOT = "C:/Users/tane1/AppData/Local/p3-coordinator-records";
const RELEASE_FIELDS = Object.freeze([
  ["validator", "return-helper"],
  ["e2e", "return-helper-e2e"],
  ["planTemplate", "return-plan-template"],
  ["manifestTemplate", "return-manifest-template"],
  ["feedbackTemplate", "return-feedback-template"],
  ["protocolTemplate", "protocol-template"],
  ["registryTemplate", "registry-template"],
  ["packetValidator", "packet-helper"],
  ["packetPlanTemplate", "packet-plan-template"],
]);
const IDENTITY_LEAK_SCAN = Object.freeze({
  scanTargets: ["attachment bytes", "attachment names", "archive entry names", "archive entry bytes"],
  forbiddenValueSource: "final cleanRoomAuthorization coordinator-only fields",
  forbiddenFields: ["workspaceId", "worktreeRoot", "implementation.actor", "implementation.contextId", "review.actor", "review.contextId", "otherWorkspaceId", "evidencePath"],
  result: "clear",
});

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
function readRegular(path, label) { assertRegular(path, label); return readFileSync(path); }
function readJson(path, label) { try { return JSON.parse(readRegular(path, label).toString("utf8")); } catch (error) { fail(`${label} is invalid JSON: ${error.message}`); } }
function writeFresh(path, bytes) { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); }
function replaceJson(path, value) { assertRegular(path, "candidate record to replace"); writeFileSync(path, jsonBytes(value), { flag: "w", mode: 0o600 }); }
function listFiles(root) {
  const result = [];
  function visit(directory, prefix = "") {
    assertDirectory(directory, "candidate directory");
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const full = join(directory, entry.name); const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name; const stat = lstatSync(full);
      assert(!stat.isSymbolicLink(), `candidate contains a symbolic link: ${logicalPath}`);
      if (stat.isDirectory()) visit(full, logicalPath); else { assert(stat.isFile(), `candidate has a non-regular entry: ${logicalPath}`); result.push({ logicalPath, sha256: sha256(readFileSync(full)), bytes: stat.size }); }
    }
  }
  visit(root); return result;
}
function safeChild(root, logicalPath, label) { const target = resolve(root, ...logicalPath.split("/")); assert(isWithin(root, target) && target !== resolve(root), `${label} escapes its root.`); return target; }
function removeOwnedTemporary(root, prefix) {
  if (!existsSync(root)) return;
  assert(resolve(root).startsWith(resolve(tmpdir())), "refusing to remove a non-temporary candidate path.");
  assert(dirname(root) === resolve(tmpdir()) && root.split(/[\\/]/).at(-1).startsWith(prefix), "refusing to remove an unowned temporary candidate path.");
  rmSync(root, { recursive: true, force: true, maxRetries: 2 });
}

function finalIdentifiers(inputs, release) {
  const seed = {
    schema: "p3-r4-current-seq1-finalized-runtime-activation/v1",
    pairId: I.PAIR_ID,
    condition: I.CONDITION,
    component: I.COMPONENT,
    sequence: I.SEQUENCE,
    attempt: I.ATTEMPT,
    runtimeDeliverySequence: I.RUNTIME_DELIVERY_SEQUENCE,
    pairCommonProtocol: inputs.pairProtocol.sha256,
    immutableInputs: inputs.immutableInputReferences,
    helperRelease: release.map(({ id, sha256: digest }) => ({ id, sha256: digest })),
  };
  const seedSha256 = I.stableHash(seed);
  const handoffId = sha256(Buffer.from(`p3-r4-current-seq1-finalized-handoff\0${seedSha256}`, "utf8")).slice(0, 32);
  const activationId = sha256(Buffer.from(`p3-r4-current-seq1-finalized-activation\0${seedSha256}\0${handoffId}`, "utf8"));
  return {
    seedSha256,
    handoffId,
    activationId,
    outputRoot: `${I.ACTIVATION_PARENT}/${activationId}`,
    roleHome: `${I.ROLE_HOME_PARENT}/b-impl-r4-reissue-2-${handoffId}`,
    progressRoot: `${I.EXTERNAL_PROGRESS_PARENT}/${activationId}/progress`,
  };
}

function assertPublicationTargetsAbsent(ids) {
  for (const [path, label] of [[ids.outputRoot, "current activation root"], [ids.roleHome, "current fresh role home"], [dirname(ids.progressRoot), "current external progress container"], [ids.progressRoot, "current external progress root"]]) {
    assert(!existsSync(path), `${label} must remain absent before publication: ${posix(path)}`);
  }
}

function releaseEntry(release, id) { const found = release.find((entry) => entry.id === id); assert(found, `missing helper release ${id}.`); return found; }
function expectedPairProtocolReleaseReference(release, id) {
  const entry = releaseEntry(release, id);
  return { path: `${I.BASELINE_PUBLISHED_ACTIVATION}/helper-release/${entry.file}`, sha256: entry.sha256 };
}
function pairProtocolReleaseBindings(protocol, release) {
  const result = {};
  for (const [field, id] of RELEASE_FIELDS) {
    const expected = expectedPairProtocolReleaseReference(release, id);
    exact(protocol.returnPackage?.[field], expected, `pair-common protocol returnPackage.${field}`);
    result[field] = { id, ...expected };
  }
  return result;
}

function finalizeDraftBundle(root, inputs, release, ids, approvedAt, publicationTransactionId) {
  // The draft constructor supplies only the redacted packet bytes and the
  // stable coordinator graph.  The records below are rebuilt as final records;
  // no role-visible attachment is changed after packet validation.
  const registryPath = safeChild(root, "registry-current-delivery-1.json", "registry path");
  const registry = readJson(registryPath, "draft current registry");
  registry.recordState = "finalized";
  registry.executionState = false;
  registry.ownerApproved = true;
  registry.ownerApprovedAt = approvedAt;
  registry.approvalBasis = "Owner-approved current-condition R4 runtime activation publication only. This coordinator-only record does not copy to a role home, deliver or launch a role, implement, apply a return, mutate lifecycle, measure browser/Figma, or change P-11.";
  registry.aBIdentical = true;
  registry.aBByteIdentical = true;
  registry.coordinatorOnly = true;
  registry.packetValidation = {
    validator: "helper-release/p3-role-packet.mjs",
    planVersion: 3,
    authoritySource: "actual-v13-comparison-contract-and-owner-approved-decision-j-v2",
    safeArchiveExpansionRequiredBeforeCheck: true,
    archiveAttachmentsAcceptedByValidator: false,
    packetManifestIsCoordinatorOnly: true,
    allAttachmentsRequirePacketManifest: true,
    allAttachmentsRequirePacketCheck: true,
    packetCheckCommand: "node p3-role-packet.mjs --check <coordinator-only-plan.json>",
    packetManifestMustExactlyEnumerateDeliveryAttachments: true,
  };
  const recipient = registry.recipientPackets?.[0];
  assert(recipient && registry.recipientPackets.length === 1, "draft registry does not contain exactly one recipient.");
  recipient.deliverAfter = "both-condition-pair-preflight-pass";
  recipient.packetCheck = { command: "node p3-role-packet.mjs --check <coordinator-only-plan.json>", allAttachmentsCovered: true, result: "PASS" };
  recipient.identityLeakScan = I.clone(IDENTITY_LEAK_SCAN);
  recipient.outsideHostPathInstructionReview = { method: "static coordinator packet-content review", machineValidated: false, reviewer: "coordinator", reviewedAt: approvedAt, result: "clear" };
  recipient.coordinatorEvidencePath = "packet-manifest-current-delivery-1.json";
  replaceJson(registryPath, registry);
  const registrySha256 = sha256(readRegular(registryPath, "final current registry"));

  const returnPlanPath = safeChild(root, "return-plan-current-seq1-attempt1.json", "return plan path");
  const returnPlan = readJson(returnPlanPath, "draft current return plan");
  returnPlan.authority.handoff.registry = { path: "registry-current-delivery-1.json", sha256: registrySha256 };
  replaceJson(returnPlanPath, returnPlan);
  const returnPlanSha256 = sha256(readRegular(returnPlanPath, "final current return plan"));

  const protocol = readJson(safeChild(root, "protocol-current.json", "current protocol"), "candidate pair-common protocol");
  const protocolRelease = pairProtocolReleaseBindings(protocol, release);
  const runtimePath = safeChild(root, "runtime-authority-current-delivery-1.json", "runtime authority path");
  const runtime = readJson(runtimePath, "draft current runtime authority");
  runtime.recordState = "finalized";
  runtime.ownerApproved = true;
  runtime.ownerApprovedAt = approvedAt;
  runtime.approvalBasis = "Owner-approved current-condition R4 runtime activation publication only. Role delivery, launch, implementation, return apply, lifecycle mutation, browser/Figma measurement, and P-11 change remain outside this authority.";
  runtime.activationId = ids.activationId;
  runtime.pairId = I.PAIR_ID;
  runtime.condition = I.CONDITION;
  runtime.state = "finalized-not-delivered";
  runtime.coordinatorOnly = true;
  runtime.publicationTransactionId = publicationTransactionId;
  runtime.recipient = { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: ids.handoffId };
  runtime.helperRelease = release.map(({ id, file, sha256: digest }) => ({ id, path: `helper-release/${file}`, sha256: digest }));
  runtime.runtimeBindings = {
    protocolCurrent: { path: "protocol-current.json", sha256: inputs.pairProtocol.sha256 },
    protocolBaseline: { path: "protocol-baseline.json", sha256: inputs.pairProtocol.sha256 },
    registry: { path: "registry-current-delivery-1.json", sha256: registrySha256 },
    packetPlan: { path: "packet-plan-current-delivery-1.json", sha256: sha256(readRegular(safeChild(root, "packet-plan-current-delivery-1.json", "packet plan"), "packet plan")) },
    packetManifest: { path: "packet-manifest-current-delivery-1.json", sha256: sha256(readRegular(safeChild(root, "packet-manifest-current-delivery-1.json", "packet manifest"), "packet manifest")) },
    returnPlan: { path: "return-plan-current-seq1-attempt1.json", sha256: returnPlanSha256 },
    inputStaging: { path: `packet-staging/${ids.handoffId}/delivery/input`, sha256: I.hashInputStaging(safeChild(root, `packet-staging/${ids.handoffId}/delivery/input`, "input staging")) },
  };
  runtime.immutableInputs = I.clone(inputs.immutableInputReferences);
  runtime.pairCommonProtocol = { sourceActivation: I.BASELINE_PUBLISHED_ACTIVATION, sha256: inputs.pairProtocol.sha256, returnPackage: protocolRelease };
  runtime.freshRoleHome = { path: ids.roleHome, state: "must-remain-absent-until-separate-delivery-authorization" };
  runtime.externalProgress = { root: ids.progressRoot, state: "must-remain-absent-until-publication" };
  runtime.deliveryReceiptRequiredBeforeRoleHomeCopy = true;
  runtime.actualRoleHomeCopy = false;
  runtime.actualRoleLaunch = false;
  runtime.actualImplementation = false;
  runtime.executionBoundary = { pairReadiness: false, pairBegin: false, pairPreflight: false, rolePacket: true, roleDelivery: false, roleLaunch: false, implementation: false, browserMeasurement: false, figmaMeasurement: false, p11: false };
  replaceJson(runtimePath, runtime);
  const runtimeAuthoritySha256 = sha256(readRegular(runtimePath, "final current runtime authority"));

  const draftReceiptPath = safeChild(root, "activation-preparation-receipt.json", "draft receipt path");
  assertRegular(draftReceiptPath, "draft receipt");
  rmSync(draftReceiptPath, { force: false });
  const postBuildImmutableInputs = I.revalidateImmutableInputs(inputs.immutableInputReferences);
  const outputs = listFiles(root);
  const receipt = {
    schema: "p3-r4-current-runtime-activation-receipt/v2",
    recordState: "finalized",
    ownerApproved: true,
    ownerApprovalRecordedAt: approvedAt,
    publicationTransactionId,
    activationId: ids.activationId,
    pairId: I.PAIR_ID,
    condition: I.CONDITION,
    recipient: { roleKind: "implementation", deliverySequence: 1, opaqueHandoffId: ids.handoffId },
    outputRoot: ids.outputRoot,
    immutableInputs: I.clone(inputs.immutableInputReferences),
    prePublicationImmutableInputs: I.clone(inputs.immutableInputReferences),
    postBuildImmutableInputs,
    protocol: { pairCommonSha256: inputs.pairProtocol.sha256, copiedByteForByteFrom: `${I.BASELINE_PUBLISHED_ACTIVATION}/protocol-baseline.json`, returnPackage: protocolRelease },
    release: release.map(({ id, file, sha256: digest, bytes }) => ({ id, path: `helper-release/${file}`, sha256: digest, bytes: bytes.length })),
    packetCheck: { result: "PASS", attachmentCount: 4, manifestSha256: runtime.runtimeBindings.packetManifest.sha256 },
    outputs,
    externalProgress: { root: ids.progressRoot, initialState: "empty-root-no-progress-artifacts", plannedEntries: [], forbiddenAtPublication: ["role-return-progress.jsonl", "checkpoint-proofs", "role-return-progress.lock"] },
    result: { roleHomeCreated: false, roleHomeCopied: false, roleDelivered: false, roleLaunched: false, implementation: false, returnApplied: false, siteCreatedOrMutated: false, lifecycleMutated: false, browserOrFigmaMeasurement: false, p11Changed: false },
    runtimeAuthoritySha256,
  };
  writeFresh(safeChild(root, "activation-receipt.json", "activation receipt path"), jsonBytes(receipt));
  return { registrySha256, returnPlanSha256, runtimeAuthoritySha256, protocolRelease, receipt };
}

function expectedPaths(ids) {
  return new Set([
    "activation-receipt.json", "protocol-current.json", "protocol-baseline.json", "registry-current-delivery-1.json", "return-plan-current-seq1-attempt1.json", "runtime-authority-current-delivery-1.json", "packet-plan-current-delivery-1.json", "packet-manifest-current-delivery-1.json",
    `packet-staging/${ids.handoffId}/delivery/input/assignment.json`, `packet-staging/${ids.handoffId}/delivery/input/references/pc-first-view.png`, `packet-staging/${ids.handoffId}/delivery/input/references/sp-first-view.png`, `packet-staging/${ids.handoffId}/delivery/return-authority.json`,
    ...I.RELEASE.map(([, file]) => `helper-release/${file}`),
  ]);
}
function validatePairPreflightPlan(plan, inputs) {
  const expected = [
    { condition: "baseline", worktreeRoot: I.BASELINE.toLowerCase(), comparisonContract: { path: I.REL.contract, sha256: inputs.baselineContract.sha256 }, gateManifest: { path: "MyBrain/verify/gate-open-service-top-hero-v1.json", sha256: inputs.immutableInputs.baselineGateManifest.sha256 }, preflightState: { path: ".figma-gate/active.json", sha256: inputs.immutableInputs.baselinePreflight.sha256 }, preflightId: inputs.records[1].preflightId },
    { condition: "current", worktreeRoot: I.CURRENT.toLowerCase(), comparisonContract: { path: I.REL.contract, sha256: inputs.currentContract.sha256 }, gateManifest: { path: "MyBrain/verify/gate-open-service-top-hero-v1.json", sha256: inputs.immutableInputs.currentGateManifest.sha256 }, preflightState: { path: ".figma-gate/active.json", sha256: inputs.immutableInputs.currentPreflight.sha256 }, preflightId: inputs.records[2].preflightId },
  ];
  exact(plan.authority?.pairPreflights?.conditions, expected, "final current pairPreflights conditions");
}
function validateFinalBundle(root, inputs, release, ids, finalized, publicationTransactionId) {
  const files = listFiles(root);
  exact([...files.map((entry) => entry.logicalPath).sort()], [...expectedPaths(ids)].sort(), "final current activation file inventory");
  assert(files.length === 21, `final current activation must contain exactly 21 regular files, got ${files.length}.`);
  for (const entry of release) {
    const actual = readRegular(safeChild(root, `helper-release/${entry.file}`, `helper ${entry.id}`), `helper ${entry.id}`);
    assert(actual.equals(entry.bytes) && sha256(actual) === entry.sha256, `final current helper release ${entry.id} changed.`);
  }
  const commonProtocol = readRegular(safeChild(root, "protocol-current.json", "current protocol"), "current protocol");
  assert(commonProtocol.equals(readRegular(safeChild(root, "protocol-baseline.json", "baseline protocol"), "baseline protocol")), "current activation protocol copies differ.");
  assert(sha256(commonProtocol) === inputs.pairProtocol.sha256 && commonProtocol.equals(inputs.pairProtocol.bytes), "current activation does not byte-copy the published pair-common protocol.");
  exact(pairProtocolReleaseBindings(JSON.parse(commonProtocol.toString("utf8")), release), finalized.protocolRelease, "pair-common protocol release mapping");
  const freshManifest = checkRolePacket(safeChild(root, "packet-plan-current-delivery-1.json", "packet plan"));
  exact(freshManifest, readJson(safeChild(root, "packet-manifest-current-delivery-1.json", "packet manifest"), "packet manifest"), "current packet manifest");
  assert(freshManifest.attachmentCount === 4, "current finalized packet must contain exactly four attachments.");
  const registry = readJson(safeChild(root, "registry-current-delivery-1.json", "registry"), "registry");
  assert(registry.recordState === "finalized" && registry.executionState === false && registry.ownerApproved === true && registry.aBIdentical === true && registry.aBByteIdentical === true && registry.coordinatorOnly === true, "current registry finalization flags are invalid.");
  assert(registry.recipientPackets?.length === 1 && registry.recipientPackets[0].opaqueHandoffId === ids.handoffId && registry.recipientPackets[0].identityLeakScan?.result === "clear", "current registry recipient or identity scan is invalid.");
  const plan = readJson(safeChild(root, "return-plan-current-seq1-attempt1.json", "return plan"), "return plan");
  assert(plan.authority?.handoff?.opaqueHandoffId === ids.handoffId && plan.authority?.handoff?.deliverySequence === 1, "final current return plan handoff changed.");
  exact(plan.authority.handoff.protocol, { self: { path: "protocol-current.json", sha256: inputs.pairProtocol.sha256 }, peer: { path: "protocol-baseline.json", sha256: inputs.pairProtocol.sha256 } }, "final current return plan pair-common protocol refs");
  validatePairPreflightPlan(plan, inputs);
  const runtime = readJson(safeChild(root, "runtime-authority-current-delivery-1.json", "runtime authority"), "runtime authority");
  assert(runtime.recordState === "finalized" && runtime.ownerApproved === true && runtime.activationId === ids.activationId && runtime.recipient?.opaqueHandoffId === ids.handoffId && runtime.publicationTransactionId === publicationTransactionId, "current runtime authority finalization is invalid.");
  exact(runtime.immutableInputs, inputs.immutableInputReferences, "current runtime authority immutable inputs");
  exact(runtime.helperRelease, release.map(({ id, file, sha256: digest }) => ({ id, path: `helper-release/${file}`, sha256: digest })), "current runtime authority helper release");
  exact(runtime.pairCommonProtocol?.returnPackage, finalized.protocolRelease, "current runtime authority pair-common protocol release binding");
  const receipt = readJson(safeChild(root, "activation-receipt.json", "activation receipt"), "activation receipt");
  assert(receipt.publicationTransactionId === publicationTransactionId, "current activation receipt publication transaction is invalid.");
  exact(receipt.immutableInputs, inputs.immutableInputReferences, "current activation receipt immutable inputs");
  exact(receipt.postBuildImmutableInputs, inputs.immutableInputReferences, "current activation receipt post-build immutable inputs");
  exact(receipt.outputs, files.filter((entry) => entry.logicalPath !== "activation-receipt.json"), "current activation receipt output inventory");
  assert(receipt.result?.roleHomeCreated === false && receipt.result?.roleDelivered === false && receipt.result?.roleLaunched === false && receipt.result?.implementation === false && receipt.result?.returnApplied === false && receipt.result?.siteCreatedOrMutated === false && receipt.result?.lifecycleMutated === false && receipt.result?.browserOrFigmaMeasurement === false && receipt.result?.p11Changed === false, "current activation receipt claims an unauthorized side effect.");
  exact(I.revalidateImmutableInputs(inputs.immutableInputReferences), inputs.immutableInputReferences, "final current immutable source post-validation");
}

function tarString(header, offset, length, value, label) { const bytes = Buffer.from(value, "utf8"); assert(bytes.length < length, `${label} exceeds USTAR header capacity.`); bytes.copy(header, offset); }
function tarOctal(header, offset, length, value) { Buffer.from(`${Number(value).toString(8).padStart(length - 1, "0")}\0`, "ascii").copy(header, offset); }
function tarChecksum(header) { let total = 0; for (const byte of header) total += byte; return total; }
function ustarEntry(path, bytes) {
  const header = Buffer.alloc(512, 0); tarString(header, 0, 100, path, "USTAR path"); tarOctal(header, 100, 8, 0o644); tarOctal(header, 108, 8, 0); tarOctal(header, 116, 8, 0); tarOctal(header, 124, 12, bytes.length); tarOctal(header, 136, 12, 0); header.fill(0x20, 148, 156); header[156] = 0x30; Buffer.from("ustar\0", "ascii").copy(header, 257); Buffer.from("00", "ascii").copy(header, 263); tarString(header, 265, 32, "p3", "USTAR user"); tarString(header, 297, 32, "p3", "USTAR group"); Buffer.from(`${tarChecksum(header).toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148); return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512, 0)]);
}
function writeFixtureArchive(root, plan) {
  const files = plan.component.filePolicies.map((policy) => {
    const bytes = Buffer.from(policy.bootstrapDelimiterRegions.map((region) => `${region.startDelimiter}\nfixture ${region.elementId}\n${region.endDelimiter}\n`).join("\n"), "utf8");
    return { path: policy.path, bytes, sha256: sha256(bytes) };
  });
  const manifest = { version: 4, kind: "p3-role-return", handoffId: plan.authority.handoff.opaqueHandoffId, deliverySequence: 1, handoffProtocolSha256: plan.authority.handoff.protocol.self.sha256, component: { elementId: plan.component.elementId, componentDecisionCodePath: plan.component.componentDecisionCodePath, sequence: plan.component.sequence, attempt: plan.component.attempt }, inputStagingSha256: plan.component.inputStaging.sha256, files: files.map((entry) => ({ path: entry.path, sha256: entry.sha256 })) };
  const archivePath = join(root, "fixture-return.ustar.tar");
  writeFresh(archivePath, Buffer.concat([ustarEntry("return-manifest.json", jsonBytes(manifest)), ...files.map((entry) => ustarEntry(entry.path, entry.bytes)), Buffer.alloc(1024, 0)]));
  return archivePath;
}
async function runPinnedReturnValidatorFixture(root, ids) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "p3-r4-current-return-fixture-"));
  try {
    const plan = readJson(safeChild(root, "return-plan-current-seq1-attempt1.json", "fixture return plan"), "fixture return plan");
    plan.authority.progress = { ledgerPath: posix(join(fixtureRoot, "progress", "role-return-progress.jsonl")), checkpointProofDirectory: posix(join(fixtureRoot, "progress", "checkpoint-proofs")) };
    for (const relativePath of ["protocol-current.json", "protocol-baseline.json", "registry-current-delivery-1.json", "packet-manifest-current-delivery-1.json"]) {
      writeFresh(safeChild(fixtureRoot, relativePath, "fixture coordinator artifact"), readRegular(safeChild(root, relativePath, "candidate coordinator artifact"), `candidate ${relativePath}`));
    }
    const inputRoot = safeChild(root, `packet-staging/${ids.handoffId}/delivery/input`, "candidate input root");
    for (const entry of listFiles(inputRoot)) writeFresh(safeChild(fixtureRoot, `packet-staging/${ids.handoffId}/delivery/input/${entry.logicalPath}`, "fixture input"), readRegular(safeChild(inputRoot, entry.logicalPath, "candidate input"), `candidate input ${entry.logicalPath}`));
    mkdirSync(join(fixtureRoot, "progress", "checkpoint-proofs"), { recursive: true, mode: 0o700 });
    const planPath = safeChild(fixtureRoot, "return-plan-current-seq1-attempt1.json", "fixture plan");
    writeFresh(planPath, jsonBytes(plan));
    const archivePath = writeFixtureArchive(fixtureRoot, plan);
    const helperPath = safeChild(root, "helper-release/p3-role-return.mjs", "pinned return helper");
    const { validateRoleReturn } = await import(`${pathToFileURL(helperPath).href}?fixture=${Date.now()}`);
    const result = validateRoleReturn(planPath, archivePath, I.CURRENT);
    assert(result.applyReady === true && result.handoffId === ids.handoffId && result.component?.sequence === 1 && result.component?.attempt === 1 && Array.isArray(result.validatedFiles) && result.validatedFiles.length === 2, "activation-pinned p3-role-return fixture did not validate current sequence 1.");
    return { helperSha256: sha256(readRegular(helperPath, "pinned return helper")), planSha256: result.planSha256, archiveSha256: result.returnArchiveSha256, validatedFileCount: result.validatedFiles.length };
  } finally { removeOwnedTemporary(fixtureRoot, "p3-r4-current-return-fixture-"); }
}

function ownedProgressStageParentPlan() {
  const designatedRoot = resolve(DESIGNATED_COORDINATOR_RECORDS_ROOT);
  const target = resolve(I.EXTERNAL_PROGRESS_PARENT);
  assertDirectory(designatedRoot, "designated coordinator-records root");
  const route = relative(designatedRoot, target);
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\") && !isAbsolute(route), "external progress parent escapes the designated coordinator-records root.");
  const segments = route.split(/[\\/]/);
  for (const segment of segments) assert(segment.length > 0 && segment !== "." && segment !== "..", "external progress parent has an invalid segment.");
  return { designatedRoot, target, segments };
}
function inspectOwnedProgressStageParent() {
  const plan = ownedProgressStageParentPlan();
  let cursor = plan.designatedRoot; const missing = [];
  for (const segment of plan.segments) {
    cursor = join(cursor, segment);
    if (existsSync(cursor)) assertDirectory(cursor, "existing external progress parent segment");
    else missing.push(posix(cursor));
  }
  return { designatedRoot: posix(plan.designatedRoot), target: posix(plan.target), missingDirectories: missing };
}
function ensureOwnedProgressStageParent(createdDirectories) {
  const plan = ownedProgressStageParentPlan();
  let cursor = plan.designatedRoot;
  for (const segment of plan.segments) {
    cursor = join(cursor, segment);
    if (existsSync(cursor)) {
      assertDirectory(cursor, "existing external progress parent segment");
      continue;
    }
    mkdirSync(cursor, { recursive: false, mode: 0o700 });
    assertDirectory(cursor, "created external progress parent segment");
    createdDirectories.push(cursor);
  }
  assert(resolve(cursor) === plan.target, "external progress parent construction did not reach the approved target.");
}
function pruneOwnedEmptyProgressParents(createdDirectories) {
  const designatedRoot = resolve(DESIGNATED_COORDINATOR_RECORDS_ROOT);
  for (const directory of [...createdDirectories].reverse()) {
    const route = relative(designatedRoot, resolve(directory));
    assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\") && !isAbsolute(route), "refusing to prune a directory outside the designated coordinator-records root.");
    if (!existsSync(directory)) continue;
    assertDirectory(directory, "owned external progress parent during rollback");
    assert(readdirSync(directory).length === 0, `owned external progress parent is no longer empty: ${posix(directory)}`);
    rmdirSync(directory);
  }
}
function stageExternalDirectory(finalRoot, label) {
  const parent = dirname(finalRoot);
  assertDirectory(parent, `${label} parent`);
  const stage = join(parent, `.${basename(finalRoot)}.stage-${randomUUID()}`);
  assert(!existsSync(stage), `${label} stage unexpectedly exists.`);
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  return stage;
}
function assertOwnedExternalStage(stage, finalRoot, label) {
  const parent = resolve(dirname(finalRoot)); const route = relative(parent, resolve(stage));
  assert(route !== "" && !route.startsWith("..") && !route.startsWith("..\\") && basename(stage).startsWith(`.${basename(finalRoot)}.stage-`), `refusing to remove an unowned ${label} stage.`);
}
function removeOwnedExternalStage(stage, finalRoot, label) {
  if (!stage || !existsSync(stage)) return;
  assertOwnedExternalStage(stage, finalRoot, label);
  rmSync(stage, { recursive: true, force: false, maxRetries: 2 });
}
function publishStage(stage, finalRoot, label) {
  assertOwnedExternalStage(stage, finalRoot, label);
  assert(!existsSync(finalRoot), `${label} final root appeared before atomic publication.`);
  renameSync(stage, finalRoot);
}
function progressContainer(ids) { return dirname(ids.progressRoot); }
function validateEmptyProgressContainer(container, ids, label) {
  assertDirectory(container, `${label} progress container`);
  exact(readdirSync(container).sort(), ["progress"], `${label} progress-container entries`);
  assertDirectory(ids.progressRoot, `${label} progress root`);
  assert(readdirSync(ids.progressRoot).length === 0, `${label} progress root is not empty.`);
  for (const forbidden of ["role-return-progress.jsonl", "checkpoint-proofs", "role-return-progress.lock"]) {
    assert(!existsSync(join(ids.progressRoot, forbidden)), `${label} progress root contains forbidden artifact ${forbidden}.`);
  }
}
function assertOwnedPublishedActivation(root, ids, publicationTransactionId) {
  assertDirectory(root, "published current activation root");
  exact([...listFiles(root).map((entry) => entry.logicalPath).sort()], [...expectedPaths(ids)].sort(), "published current activation inventory");
  const receipt = readJson(safeChild(root, "activation-receipt.json", "published receipt"), "published receipt");
  const runtime = readJson(safeChild(root, "runtime-authority-current-delivery-1.json", "published runtime authority"), "published runtime authority");
  assert(receipt.activationId === ids.activationId && receipt.outputRoot === ids.outputRoot && receipt.publicationTransactionId === publicationTransactionId, "published receipt does not prove activation ownership.");
  assert(runtime.activationId === ids.activationId && runtime.publicationTransactionId === publicationTransactionId && runtime.recipient?.opaqueHandoffId === ids.handoffId, "published runtime authority does not prove activation ownership.");
}
function removeOwnedPublishedActivation(root, ids, publicationTransactionId) {
  if (!existsSync(root)) return;
  assertOwnedPublishedActivation(root, ids, publicationTransactionId);
  rmSync(root, { recursive: true, force: false, maxRetries: 2 });
}
function assertOwnedPublishedProgress(ids) {
  const container = progressContainer(ids);
  const parent = resolve(dirname(container)); const route = relative(parent, resolve(container));
  assert(route === basename(container) && basename(container) === ids.activationId, "published progress container does not have the expected opaque activation name.");
  validateEmptyProgressContainer(container, ids, "published");
}
function removeOwnedPublishedProgress(ids) {
  const container = progressContainer(ids);
  if (!existsSync(container)) return;
  assertOwnedPublishedProgress(ids);
  rmSync(container, { recursive: true, force: false, maxRetries: 2 });
}
function assertNoProhibitedSideEffects(ids) {
  assert(!existsSync(ids.roleHome), "fresh role home was created unexpectedly.");
  assert(!existsSync(`${I.BASELINE}/site`) && !existsSync(`${I.CURRENT}/site`), "a site directory was created unexpectedly.");
  assert(!existsSync(`${I.BASELINE}/.p3-role-return-recovery`) && !existsSync(`${I.CURRENT}/.p3-role-return-recovery`), "a recovery directory was created unexpectedly.");
}

async function apply() {
  // This path is deliberately never called by the agent.  It is available only
  // to an owner-operated invocation after the dry-run record has been audited.
  const inputs = I.loadInputs();
  const release = I.loadRelease();
  const ids = finalIdentifiers(inputs, release);
  assertPublicationTargetsAbsent(ids);
  assertNoProhibitedSideEffects(ids);
  const approvalTimestamp = new Date().toISOString();
  const publicationTransactionId = randomUUID();
  let activationStage = null; let progressStage = null;
  let activationPublished = false; let progressPublished = false;
  const createdProgressParents = [];
  try {
    activationStage = stageExternalDirectory(ids.outputRoot, "activation");
    I.buildBundle(activationStage, inputs, release, ids);
    const finalized = finalizeDraftBundle(activationStage, inputs, release, ids, approvalTimestamp, publicationTransactionId);
    validateFinalBundle(activationStage, inputs, release, ids, finalized, publicationTransactionId);
    await runPinnedReturnValidatorFixture(activationStage, ids);

    // The designated coordinator-records root already exists.  Only the
    // missing, fixed child chain for this current activation may be created;
    // it is pruned in reverse order if publication does not complete.
    ensureOwnedProgressStageParent(createdProgressParents);
    const progressFinalRoot = progressContainer(ids);
    progressStage = stageExternalDirectory(progressFinalRoot, "external progress");
    mkdirSync(join(progressStage, "progress"), { recursive: false, mode: 0o700 });
    validateEmptyProgressContainer(progressStage, { ...ids, progressRoot: join(progressStage, "progress") }, "staged");

    // Publishing the empty progress container first is safe: failure before
    // activation publication rolls it back.  Both roots are directory renames
    // from a staging sibling on the same parent filesystem.
    publishStage(progressStage, progressFinalRoot, "external progress");
    progressPublished = true; progressStage = null;
    validateEmptyProgressContainer(progressFinalRoot, ids, "published");
    publishStage(activationStage, ids.outputRoot, "activation");
    activationPublished = true; activationStage = null;
    validateFinalBundle(ids.outputRoot, inputs, release, ids, finalized, publicationTransactionId);
    await runPinnedReturnValidatorFixture(ids.outputRoot, ids);
    validateEmptyProgressContainer(progressFinalRoot, ids, "published");
    I.loadInputs();
    assertNoProhibitedSideEffects(ids);
    return {
      status: "published-not-delivered",
      externalWritesPerformed: true,
      ownerApprovalTimestamp: approvalTimestamp,
      publicationTransactionId,
      activation: { activationId: ids.activationId, outputRoot: ids.outputRoot, regularFileCount: 21, opaqueHandoffId: ids.handoffId },
      externalProgress: { root: ids.progressRoot, entries: [] },
      createdProgressParentChain: createdProgressParents.map(posix),
      freshRoleHome: { path: ids.roleHome, created: false },
      prohibitedActions: { roleDelivery: false, roleLaunch: false, implementation: false, returnApply: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false },
    };
  } catch (error) {
    const cleanupFailures = [];
    try { if (activationPublished) removeOwnedPublishedActivation(ids.outputRoot, ids, publicationTransactionId); else removeOwnedExternalStage(activationStage, ids.outputRoot, "activation"); } catch (cleanupError) { cleanupFailures.push(`activation rollback: ${cleanupError.message}`); }
    try { if (progressPublished) removeOwnedPublishedProgress(ids); else removeOwnedExternalStage(progressStage, progressContainer(ids), "external progress"); } catch (cleanupError) { cleanupFailures.push(`progress rollback: ${cleanupError.message}`); }
    try { pruneOwnedEmptyProgressParents(createdProgressParents); } catch (cleanupError) { cleanupFailures.push(`progress-parent rollback: ${cleanupError.message}`); }
    if (cleanupFailures.length) error.message = `${error.message}; ${cleanupFailures.join("; ")}`;
    throw error;
  }
}

async function dryRun() {
  const inputs = I.loadInputs();
  const release = I.loadRelease();
  const ids = finalIdentifiers(inputs, release);
  assertPublicationTargetsAbsent(ids);
  const progressParent = inspectOwnedProgressStageParent();
  const root = mkdtempSync(join(tmpdir(), "p3-r4-current-finalized-activation-"));
  try {
    const approvedAt = new Date().toISOString();
    const publicationTransactionId = `dry-run-${ids.activationId}`;
    I.buildBundle(root, inputs, release, ids);
    const finalized = finalizeDraftBundle(root, inputs, release, ids, approvedAt, publicationTransactionId);
    validateFinalBundle(root, inputs, release, ids, finalized, publicationTransactionId);
    const fixture = await runPinnedReturnValidatorFixture(root, ids);
    assertPublicationTargetsAbsent(ids);
    return {
      status: "validated-dry-run-not-published",
      externalWritesPerformed: false,
      ownerApprovalTimestampCandidate: approvedAt,
      publicationTransactionId,
      activation: { activationId: ids.activationId, outputRoot: ids.outputRoot, condition: I.CONDITION, runtimeDeliverySequence: 1, opaqueHandoffId: ids.handoffId },
      freshRoleHome: { path: ids.roleHome, state: "absent" },
      externalProgress: { root: ids.progressRoot, state: "absent", parentChain: progressParent },
      protocol: { sha256: inputs.pairProtocol.sha256, byteCopiedFrom: `${I.BASELINE_PUBLISHED_ACTIVATION}/protocol-baseline.json`, localReturnPackageHashBindings: finalized.protocolRelease },
      immutableInputs: { count: Object.keys(inputs.immutableInputReferences).length, stableJsonSha256: I.stableHash(inputs.immutableInputReferences), bindings: inputs.immutableInputReferences },
      bundle: { regularFileCount: listFiles(root).length, registrySha256: finalized.registrySha256, returnPlanSha256: finalized.returnPlanSha256, runtimeAuthoritySha256: finalized.runtimeAuthoritySha256 },
      pinnedReturnValidatorFixture: fixture,
      prohibitedActions: { roleDelivery: false, roleLaunch: false, implementation: false, returnApply: false, siteMutation: false, lifecycleMutation: false, browserOrFigmaMeasurement: false, p11Mutation: false },
    };
  } finally { removeOwnedTemporary(root, "p3-r4-current-finalized-activation-"); }
}

async function main() {
  if (process.argv.length !== 3 || !["--dry-run", "--apply"].includes(process.argv[2])) fail("Usage: node tools/r4-finalize-current-seq1-runtime-activation.mjs --dry-run | --apply");
  const result = process.argv[2] === "--dry-run" ? await dryRun() : await apply();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
try { await main(); } catch (error) { process.stderr.write(`P3 R4 CURRENT FINALIZER: ${error.message}\n`); process.exitCode = 1; }
