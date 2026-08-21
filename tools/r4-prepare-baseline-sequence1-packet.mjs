#!/usr/bin/env node
// Creates and validates one coordinator-only, prepared-but-not-delivered
// packet for the first baseline implementation component.  It deliberately
// never writes a role home, either worktree, lifecycle state, or P-11 record.
import { createHash } from "node:crypto";
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
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkRolePacket } from "../templates/verify/p3-role-packet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAIR_ID = "open-service-top-hero-v1-20260809";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;
const AUTHORITY_ROOT = `${COORDINATOR}/return-authority/v4/c5ec0969c8e5882d51b4d966124f87557138bf1725315fa8b42cd368e1131cad`;
const PREPARATIONS = `${COORDINATOR}/packet-preparations`;

const EXPECTED = Object.freeze({
  baselineContract: "ef4c911cf48951365294cea604a86896c25d7ed656872661cb23cc54dc1c7166",
  currentContract: "06d8d35c5048d48f63c920126371f29073aba9a8c3cbe168cf97bdc33efac342",
  decisionJ: "e1497dee0be929a01d21d520eab743d8c7f71ca7f910deacfafabc83f3440ab5",
  finalProtocol: "a4c0202ee603ea63c4a5d05f35bdda0944305a20ab756358740ba692a8499919",
  baselineAuthority: "616197ba6063f316731da4f07ebb1d2795d2674c3ebe59b26cd91b6a79d71e97",
  ledger: "2986f5b94206cf190c9cb11620341db7be2ef3abd082200389be5d1f39799faf",
  pairLock: "fd5ba36af2299b20bbd735bf072958573221c75858a6598931698094fd006b94",
  baselineActive: "198be81fbe69384e0fc856cb9fd341a65ec926aee3c661ea075ad9fe3783504d",
  currentActive: "b23d366e481d671afab35d3245979d21adafe81ef5749481d46c167707cd4f54",
  p11: "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6",
  pcReference: "c013283c6ea58a621ad224137671c008abd712b6becf76e30c7e19e587399da0",
  spReference: "c6f3c9366260670ba2c58ecf8855a3fa691b81161f3436417419a421c500d427",
});

const REL = Object.freeze({
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  protocol: "protocols/baseline/p3-role-handoff-protocol-v2.json",
  authority: "authorities/baseline/p3-role-return-authority-v1.json",
  ledger: ".git/figma-p3-comparison-ledger.jsonl",
  pairLock: ".git/figma-p3-comparison-pair-locks/55b8f4a26446c19fdfe5c43d2dae08e2b7715e31d1befee1f82257e36c0e4bac.json",
  p11: `records/p3-p11-authorization-${PAIR_ID}.json`,
  pcReference: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/exports/pc-first-view.png",
  spReference: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/exports/sp-first-view.png",
});

const COMPONENT = Object.freeze({
  elementId: "open-service-top-hero",
  sequence: 1,
  attempt: 1,
  componentDecisionCodePath: "site/index.html",
  allowedChangeTargets: ["site/index.html", "site/styles.css"],
  attemptOneCreatePaths: ["site/index.html", "site/styles.css"],
  derivedBootstrapDirectories: ["site"],
});
const PROTOCOL_SEQUENCE_ONE = Object.freeze({
  elementId: COMPONENT.elementId,
  sequence: COMPONENT.sequence,
  componentDecisionCodePath: COMPONENT.componentDecisionCodePath,
  allowedChangeTargets: COMPONENT.allowedChangeTargets,
  attemptOneCreatePaths: COMPONENT.attemptOneCreatePaths,
  derivedBootstrapDirectories: COMPONENT.derivedBootstrapDirectories,
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
function stableSha256(value) { return sha256(Buffer.from(JSON.stringify(canonical(value)), "utf8")); }
function toPosix(value) { return resolve(value).replace(/\\/g, "/"); }
function readRegular(pathname, label) {
  assert(existsSync(pathname), `${label} is missing: ${pathname}`);
  const info = lstatSync(pathname);
  assert(!info.isSymbolicLink() && info.isFile(), `${label} must be a regular file.`);
  return readFileSync(pathname);
}
function readJson(pathname, label) {
  try { return JSON.parse(readRegular(pathname, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function verifiedFile(pathname, expected, label) {
  const bytes = readRegular(pathname, label);
  const digest = sha256(bytes);
  assert(digest === expected, `${label} SHA-256 changed: expected ${expected}, got ${digest}.`);
  return { path: toPosix(pathname), sha256: digest, bytes };
}
function ref(pathname, expected, label) {
  const value = verifiedFile(pathname, expected, label);
  return { path: value.path, sha256: value.sha256 };
}
function assertAbsent(pathname, label) {
  assert(!existsSync(pathname), `${label} already exists: ${pathname}`);
}
function writeNew(pathname, bytes) {
  const parent = dirname(pathname);
  mkdirSync(parent, { recursive: true });
  writeFileSync(pathname, bytes, { flag: "wx", mode: 0o600 });
}
function listFiles(root) {
  const entries = [];
  function walk(directory, prefix = "") {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "variant" }));
    for (const child of children) {
      const full = join(directory, child.name);
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      const info = lstatSync(full);
      assert(!info.isSymbolicLink(), `staged bundle contains a symbolic link: ${path}`);
      if (info.isDirectory()) walk(full, path);
      else {
        assert(info.isFile(), `staged bundle contains a non-regular entry: ${path}`);
        entries.push({ path, sha256: sha256(readFileSync(full)), bytes: info.size });
      }
    }
  }
  walk(root);
  return entries;
}
function inputPaths() {
  return {
    baselineContract: join(BASELINE, ...REL.contract.split("/")),
    currentContract: join(CURRENT, ...REL.contract.split("/")),
    baselineDecision: join(BASELINE, ...REL.decision.split("/")),
    currentDecision: join(CURRENT, ...REL.decision.split("/")),
    protocol: join(AUTHORITY_ROOT, ...REL.protocol.split("/")),
    authority: join(AUTHORITY_ROOT, ...REL.authority.split("/")),
    ledger: join(PILOT, ...REL.ledger.split("/")),
    pairLock: join(PILOT, ...REL.pairLock.split("/")),
    baselineActive: join(BASELINE, ".figma-gate", "active.json"),
    currentActive: join(CURRENT, ".figma-gate", "active.json"),
    p11: join(COORDINATOR, ...REL.p11.split("/")),
    pcReference: join(BASELINE, ...REL.pcReference.split("/")),
    spReference: join(BASELINE, ...REL.spReference.split("/")),
  };
}

function validateInputs() {
  const paths = inputPaths();
  const baselineContract = verifiedFile(paths.baselineContract, EXPECTED.baselineContract, "baseline final v13 contract");
  const currentContract = verifiedFile(paths.currentContract, EXPECTED.currentContract, "current final v13 contract");
  const baselineDecision = verifiedFile(paths.baselineDecision, EXPECTED.decisionJ, "baseline owner Decision J");
  const currentDecision = verifiedFile(paths.currentDecision, EXPECTED.decisionJ, "current owner Decision J");
  const protocol = verifiedFile(paths.protocol, EXPECTED.finalProtocol, "final v2 baseline protocol");
  const authority = verifiedFile(paths.authority, EXPECTED.baselineAuthority, "final baseline condition-local authority");
  const ledger = verifiedFile(paths.ledger, EXPECTED.ledger, "pair lifecycle ledger");
  const pairLock = verifiedFile(paths.pairLock, EXPECTED.pairLock, "pair lock");
  const baselineActive = verifiedFile(paths.baselineActive, EXPECTED.baselineActive, "baseline preflight active state");
  const currentActive = verifiedFile(paths.currentActive, EXPECTED.currentActive, "current preflight active state");
  const p11 = verifiedFile(paths.p11, EXPECTED.p11, "P-11 blocked record");
  const pcReference = verifiedFile(paths.pcReference, EXPECTED.pcReference, "PC reference export");
  const spReference = verifiedFile(paths.spReference, EXPECTED.spReference, "SP reference export");

  const baselineContractValue = JSON.parse(baselineContract.bytes.toString("utf8"));
  const currentContractValue = JSON.parse(currentContract.bytes.toString("utf8"));
  const decisionValue = JSON.parse(baselineDecision.bytes.toString("utf8"));
  const protocolValue = JSON.parse(protocol.bytes.toString("utf8"));
  const authorityValue = JSON.parse(authority.bytes.toString("utf8"));
  const ledgerLines = ledger.bytes.toString("utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const p11Value = JSON.parse(p11.bytes.toString("utf8"));

  assert(baselineContractValue.version === 13 && baselineContractValue.condition === "baseline" && baselineContractValue.pairId === PAIR_ID,
    "baseline final contract no longer binds the active pair.");
  assert(currentContractValue.version === 13 && currentContractValue.condition === "current" && currentContractValue.pairId === PAIR_ID,
    "current final contract no longer binds the active pair.");
  assert(baselineContractValue.shared?.ownerDecisionJ?.sha256 === EXPECTED.decisionJ
    && currentContractValue.shared?.ownerDecisionJ?.sha256 === EXPECTED.decisionJ,
  "final contracts no longer bind the frozen owner Decision J.");
  assert(baselineDecision.bytes.equals(currentDecision.bytes), "A/B owner Decision J bytes differ.");
  assert(decisionValue.version === 2 && decisionValue.decisionId === "J" && decisionValue.status === "approved" && decisionValue.ownerApproved === true,
    "owner Decision J is not an approved v2 record.");
  assert(protocolValue.schema === "p3-role-handoff-protocol/v2" && protocolValue.recordState === "finalized"
    && protocolValue.ownerApproved === true && protocolValue.executionState === false && protocolValue.aBByteIdentical === true,
  "final v2 protocol is not the finalized inert allocation record.");
  assert(authorityValue.schema === "p3-role-return-authority/v1" && authorityValue.condition === "baseline"
    && authorityValue.recordState === "finalized" && authorityValue.ownerApproved === true
    && authorityValue.runtimeEligible === false && authorityValue.packetAuthority?.status === "NOT_CREATED"
    && authorityValue.deliveryAuthority?.status === "NOT_AUTHORIZED",
  "baseline authority no longer has the expected inert pre-packet state.");
  assert(Array.isArray(ledgerLines) && ledgerLines.length === 3
    && ledgerLines[0].kind === "started" && ledgerLines[1].kind === "preflight-recorded" && ledgerLines[1].condition === "baseline"
    && ledgerLines[2].kind === "preflight-recorded" && ledgerLines[2].condition === "current",
  "pair lifecycle ledger does not contain exactly begin and both preflight records.");
  assert(p11Value.status === "BLOCKED" && (p11Value.authorization === "NOT_AUTHORIZED" || p11Value.p11Authorization === "NOT_AUTHORIZED"),
    "P-11 is no longer BLOCKED/NOT_AUTHORIZED.");
  assertAbsent(join(BASELINE, "site"), "baseline site directory");
  assertAbsent(join(CURRENT, "site"), "current site directory");

  const scopes = protocolValue.implementationLoop?.componentReturnScopes;
  assert(Array.isArray(scopes) && scopes.length === 6, "final protocol scope inventory is invalid.");
  const first = scopes[0];
  assert(JSON.stringify(first) === JSON.stringify(PROTOCOL_SEQUENCE_ONE), "final protocol sequence 1 allocation differs from the approved assignment.");
  const delimiters = protocolValue.implementationLoop?.frozenDelimiterBindings;
  assert(Array.isArray(delimiters) && delimiters.length === 6, "final protocol delimiter inventory is invalid.");
  return {
    paths,
    inputs: { baselineContract, currentContract, baselineDecision, protocol, authority, ledger, pairLock, baselineActive, currentActive, p11, pcReference, spReference },
    delimiters,
  };
}

function ids(inputs) {
  const preparationId = stableSha256({
    kind: "p3-r4-baseline-sequence-1-packet-preparation/v1",
    pairId: PAIR_ID,
    protocol: inputs.protocol.sha256,
    authority: inputs.authority.sha256,
    decision: inputs.baselineDecision.sha256,
    pcReference: inputs.pcReference.sha256,
    spReference: inputs.spReference.sha256,
  });
  const handoffId = sha256(Buffer.from(`p3-r4-baseline-sequence-1-packet\0${preparationId}`, "utf8")).slice(0, 32);
  return { preparationId, handoffId };
}

function assignmentPayload({ handoffId, protocolSha256, delimiters }) {
  return {
    schema: "p3-role-component-assignment/v1",
    kind: "prepared-implementation-component-assignment",
    scopeId: "open-service-top-hero-v1",
    handoff: {
      opaqueHandoffId: handoffId,
      deliverySequence: 1,
      handoffProtocolSha256: protocolSha256,
    },
    component: {
      elementId: COMPONENT.elementId,
      sequence: COMPONENT.sequence,
      attempt: COMPONENT.attempt,
      componentDecisionCodePath: COMPONENT.componentDecisionCodePath,
    },
    changeAuthority: {
      allowedChangeTargets: COMPONENT.allowedChangeTargets,
      attemptOneCreatePaths: COMPONENT.attemptOneCreatePaths,
      derivedBootstrapDirectories: COMPONENT.derivedBootstrapDirectories,
      laterAttemptCreationAllowed: false,
      outOfScopePathChangeAllowed: false,
    },
    bootstrapRequirement: {
      createOnly: COMPONENT.attemptOneCreatePaths,
      mustInitializeEveryFrozenDelimiterRegion: true,
      delimiterRegions: delimiters,
    },
    referenceImages: [
      { logicalPath: "references/pc-first-view.png", viewport: "pc", width: 1440, height: 850 },
      { logicalPath: "references/sp-first-view.png", viewport: "sp", width: 375, height: 850 },
    ],
    returnBoundary: {
      concreteReturnPlanIncluded: false,
      returnArchiveSubmissionAuthorized: false,
      nextCoordinatorActionRequired: "A separate owner-authorized, checked concrete return-plan authority is required before any implementation or return archive submission.",
    },
  };
}

function boundaryPayload() {
  return {
    schema: "p3-role-packet-boundary/v1",
    status: "prepared-not-delivered",
    deliveryMode: "attachment-only",
    permittedByThisPacketPreparation: ["coordinator-only packet assembly", "coordinator-only packet validation"],
    notPermittedByThisPacketPreparation: [
      "copy to role home",
      "role delivery",
      "role launch",
      "implementation",
      "worktree mutation",
      "browser measurement",
      "Figma measurement",
      "P-11 authorization or change",
    ],
    roleInputBoundary: {
      peerConditionIdentityIncluded: false,
      comparisonContractIncluded: false,
      ownerDecisionJIncluded: false,
      cleanRoomEvidenceIncluded: false,
      coordinatorPathInstructionsIncluded: false,
      gitMetadataIncluded: false,
    },
  };
}

function ownerAuthorizationPayload({ preparationId, handoffId, inputs, createdAt }) {
  return {
    schema: "p3-r4-packet-preparation-authorization/v1",
    recordState: "finalized",
    ownerAuthorized: true,
    recordedAt: createdAt,
    pairId: PAIR_ID,
    preparationId,
    opaqueHandoffId: handoffId,
    scope: "baseline implementation sequence 1 packet preparation and p3-role-packet validation only",
    authorizationBasis: "Owner instruction to complete R4 lifecycle work, constrained by the previously owner-approved final v2 return authority; this record creates no role delivery or execution authority.",
    allowed: ["coordinator-only staging", "coordinator-only packet plan", "coordinator-only packet manifest", "p3-role-packet --check"],
    prohibited: ["role-home copy", "role delivery", "role launch", "site creation or mutation", "pair lifecycle mutation", "browser/Figma measurement", "P-11 change"],
    frozenAuthority: {
      finalProtocol: { path: inputs.protocol.path, sha256: inputs.protocol.sha256 },
      baselineConditionAuthority: { path: inputs.authority.path, sha256: inputs.authority.sha256 },
      baselineContract: { path: inputs.baselineContract.path, sha256: inputs.baselineContract.sha256 },
      ownerDecisionJ: { path: inputs.baselineDecision.path, sha256: inputs.baselineDecision.sha256 },
    },
  };
}

function packetPlan({ planDirectory, packetRoot, inputs, handoffId }) {
  const relativePacketRoot = relative(planDirectory, packetRoot).replace(/\\/g, "/");
  assert(!relativePacketRoot.startsWith(".."), "packet root must be below the plan directory.");
  const attachments = listFiles(packetRoot).map((entry) => ({
    logicalPath: entry.path,
    path: entry.path,
    sha256: entry.sha256,
    origin: entry.path.startsWith("references/")
      ? "saved frozen Figma reference export copied by the coordinator"
      : "coordinator-authored redacted sequence-1 packet input",
  }));
  return {
    version: 3,
    kind: "p3-role-packet-plan",
    packetRoot: relativePacketRoot,
    roleAttachments: attachments,
    identityAuthority: {
      comparisonContract: { path: inputs.baselineContract.path, sha256: inputs.baselineContract.sha256 },
      ownerDecisionJ: { path: inputs.baselineDecision.path, sha256: inputs.baselineDecision.sha256 },
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

function writePacketFiles(packetRoot, context) {
  writeNew(join(packetRoot, "assignment", "sequence-1.json"), jsonBytes(assignmentPayload(context)));
  writeNew(join(packetRoot, "assignment", "role-boundary.json"), jsonBytes(boundaryPayload()));
  writeNew(join(packetRoot, "references", "pc-first-view.png"), context.inputs.pcReference.bytes);
  writeNew(join(packetRoot, "references", "sp-first-view.png"), context.inputs.spReference.bytes);
}

function buildIn(root, context, { createdAt, finalRoot }) {
  const packetRoot = join(root, "packet-staging", context.handoffId);
  const planPath = join(root, "packet-plan.json");
  const manifestPath = join(root, "packet-manifest.json");
  const authorizationPath = join(root, "owner-authorization-record.json");
  writePacketFiles(packetRoot, context);
  const plan = packetPlan({ planDirectory: root, packetRoot, inputs: context.inputs, handoffId: context.handoffId });
  writeNew(planPath, jsonBytes(plan));
  const manifest = checkRolePacket(planPath);
  writeNew(manifestPath, jsonBytes(manifest));
  writeNew(authorizationPath, jsonBytes(ownerAuthorizationPayload({
    preparationId: context.preparationId,
    handoffId: context.handoffId,
    inputs: context.inputs,
    createdAt,
  })));

  const finalFilesBeforeReport = listFiles(root);
  const report = {
    schema: "p3-r4-baseline-sequence-1-packet-preparation-report/v1",
    recordState: "finalized",
    preparationId: context.preparationId,
    createdAt,
    pairId: PAIR_ID,
    recipient: { roleKind: "implementation", condition: "baseline", deliverySequence: 1, opaqueHandoffId: context.handoffId },
    outputRoot: toPosix(finalRoot),
    packetPlan: { path: "packet-plan.json", sha256: sha256(readFileSync(planPath)) },
    packetManifest: { path: "packet-manifest.json", sha256: sha256(readFileSync(manifestPath)) },
    packetValidation: {
      command: "node p3-role-packet.mjs --check <coordinator-only-packet-plan>",
      result: "PASS",
      manifest,
    },
    frozenInputs: {
      finalProtocol: { path: context.inputs.protocol.path, sha256: context.inputs.protocol.sha256 },
      baselineConditionAuthority: { path: context.inputs.authority.path, sha256: context.inputs.authority.sha256 },
      baselineContract: { path: context.inputs.baselineContract.path, sha256: context.inputs.baselineContract.sha256 },
      currentContract: { path: context.inputs.currentContract.path, sha256: context.inputs.currentContract.sha256 },
      ownerDecisionJ: { path: context.inputs.baselineDecision.path, sha256: context.inputs.baselineDecision.sha256 },
      lifecycleLedger: { path: context.inputs.ledger.path, sha256: context.inputs.ledger.sha256 },
      pairLock: { path: context.inputs.pairLock.path, sha256: context.inputs.pairLock.sha256 },
      baselinePreflightState: { path: context.inputs.baselineActive.path, sha256: context.inputs.baselineActive.sha256 },
      currentPreflightState: { path: context.inputs.currentActive.path, sha256: context.inputs.currentActive.sha256 },
      p11BlockedRecord: { path: context.inputs.p11.path, sha256: context.inputs.p11.sha256 },
    },
    packetAttachments: manifest.roleAttachments.map(({ logicalPath, path, sha256: attachmentSha256, origin }) => ({ logicalPath, path, sha256: attachmentSha256, origin })),
    immutableBoundary: {
      roleHomeCopied: false,
      roleDelivered: false,
      roleLaunched: false,
      siteCreatedOrMutated: false,
      lifecycleMutated: false,
      browserOrFigmaMeasurement: false,
      p11Changed: false,
      concreteReturnPlanCreated: false,
      runtimeRegistryCreated: false,
    },
    stagedFilesBeforeReport: finalFilesBeforeReport,
  };
  writeNew(join(root, "preparation-report.json"), jsonBytes(report));
  return { packetRoot, planPath, manifestPath, reportPath: join(root, "preparation-report.json"), manifest, report };
}

function validateFinalBundle(root, expected) {
  const actual = listFiles(root);
  const expectedPaths = [
    "owner-authorization-record.json",
    "packet-manifest.json",
    "packet-plan.json",
    "packet-staging/" + expected.handoffId + "/assignment/role-boundary.json",
    "packet-staging/" + expected.handoffId + "/assignment/sequence-1.json",
    "packet-staging/" + expected.handoffId + "/references/pc-first-view.png",
    "packet-staging/" + expected.handoffId + "/references/sp-first-view.png",
    "preparation-report.json",
  ].sort();
  assert(JSON.stringify(actual.map((entry) => entry.path).sort()) === JSON.stringify(expectedPaths), "final packet preparation inventory changed.");
  const manifest = checkRolePacket(join(root, "packet-plan.json"));
  const persistedManifest = readRegular(join(root, "packet-manifest.json"), "persisted packet manifest");
  assert(persistedManifest.equals(jsonBytes(manifest)), "persisted packet manifest differs from a fresh packet check.");
  const report = readJson(join(root, "preparation-report.json"), "preparation report");
  assert(report.packetValidation?.result === "PASS" && report.immutableBoundary?.roleDelivered === false
    && report.immutableBoundary?.siteCreatedOrMutated === false && report.immutableBoundary?.p11Changed === false,
  "persisted preparation report claims an invalid execution boundary.");
  return { manifest, files: actual };
}

function makeContext() {
  const validated = validateInputs();
  const identifiers = ids(validated.inputs);
  const outputRoot = join(PREPARATIONS, identifiers.preparationId);
  assertAbsent(outputRoot, "final packet preparation root");
  return { ...validated, ...identifiers, outputRoot };
}

function dryRun() {
  const context = makeContext();
  const temporary = mkdtempSync(join(tmpdir(), "p3-r4-packet-preparation-"));
  try {
    const createdAt = new Date().toISOString();
    const result = buildIn(temporary, context, { createdAt, finalRoot: context.outputRoot });
    const validation = validateFinalBundle(temporary, context);
    const report = {
      mode: "dry-run",
      preparationId: context.preparationId,
      opaqueHandoffId: context.handoffId,
      wouldCreateRoot: toPosix(context.outputRoot),
      packetManifestSha256: sha256(readFileSync(result.manifestPath)),
      packetCheck: "PASS",
      attachmentCount: validation.manifest.attachmentCount,
      files: validation.files,
      boundary: { roleDelivery: false, roleLaunch: false, site: false, lifecycle: false, p11: false },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 0 });
  }
}

function finalize() {
  const context = makeContext();
  mkdirSync(PREPARATIONS, { recursive: true });
  const stage = join(PREPARATIONS, `.${context.preparationId}.stage`);
  assertAbsent(stage, "packet preparation staging root");
  const createdAt = new Date().toISOString();
  try {
    const result = buildIn(stage, context, { createdAt, finalRoot: context.outputRoot });
    validateFinalBundle(stage, context);
    renameSync(stage, context.outputRoot);
    const validation = validateFinalBundle(context.outputRoot, context);
    const outcome = {
      mode: "finalized",
      preparationId: context.preparationId,
      opaqueHandoffId: context.handoffId,
      outputRoot: toPosix(context.outputRoot),
      packetPlan: { path: toPosix(join(context.outputRoot, "packet-plan.json")), sha256: sha256(readFileSync(join(context.outputRoot, "packet-plan.json"))) },
      packetManifest: { path: toPosix(join(context.outputRoot, "packet-manifest.json")), sha256: sha256(readFileSync(join(context.outputRoot, "packet-manifest.json"))) },
      packetCheck: { result: "PASS", attachmentCount: validation.manifest.attachmentCount },
      files: validation.files,
      boundary: { roleHomeCopied: false, roleDelivered: false, roleLaunched: false, siteCreatedOrMutated: false, lifecycleMutated: false, p11Changed: false },
    };
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  } catch (error) {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true, maxRetries: 0 });
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--finalize"].includes(args[0])) {
    fail("Usage: node tools/r4-prepare-baseline-sequence1-packet.mjs --dry-run | --finalize");
  }
  if (args[0] === "--dry-run") dryRun();
  else finalize();
}

try { main(); }
catch (error) {
  process.stderr.write(`P3 R4 BASELINE SEQUENCE 1 PACKET: ${error.message}\n`);
  process.exitCode = 1;
}
