#!/usr/bin/env node
// P-3 R5 baseline sequence 1 launch-spec authorization finalizer.
//
// --dry-run is read-only.  --apply (implemented but not invoked by this
// task) publishes exactly one append-only coordinator-only authorization
// record.  It never creates a role context, acquires a live lease, starts
// Codex, creates an archive, applies a return, or mutates either worktree.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  ACTIVATION_ID,
  AUTHORIZATION_SCOPE,
  BASELINE_ATTACHMENTS,
  CONDITION,
  DELIVERY_RECEIPT_PATH,
  DELIVERY_RECEIPT_SHA256,
  DELIVERY_SEQUENCE,
  HANDOFF_ID,
  LAUNCH_TIMEOUT_MS,
  PAIR_ID,
  PRELAUNCH_EXECUTION,
  PRELAUNCH_FILE,
  PRELAUNCH_PATH,
  PRELAUNCH_ROOT,
  PRELAUNCH_SHA256,
  PROTOCOL_SHA256,
  ROLE_HOME,
  ROLE_IMAGE_ARGUMENTS,
  ROLE_PROMPT_SHA256,
  buildExpectedCodexArgv,
  buildRolePrompt,
  collectAuthorizationPreSpawnState,
} from "./r5-launch-baseline-seq1.mjs";

const LAUNCH_SPEC_PARENT = `C:/Users/tane1/AppData/Local/p3-coordinator-records/${PAIR_ID}/r5-baseline-seq1-launch-spec/v1`;
const LAUNCH_SPEC_FILE = "baseline-seq1-launch-spec-authorization.json";
const DELIVERY_RECEIPT_PATH_POSIX = resolve(DELIVERY_RECEIPT_PATH).replace(/\\/g, "/");

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function exact(actual, expected, label) { assert(JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected)), `${label} is not exact.`); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function canonicalJsonBytes(value) { return Buffer.from(JSON.stringify(canonical(value)), "utf8"); }
function posix(path) { return resolve(path).replace(/\\/g, "/"); }
function isWithin(parent, child) {
  const route = relative(resolve(parent), resolve(child));
  return route === "" || (!route.startsWith("..") && !isAbsolute(route));
}
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
function assertOneFileTree(root, filename, reference, label) {
  const tree = listTree(root, label);
  exact(tree.directories, [], `${label} directory inventory`);
  exact(tree.files, [{ logicalPath: filename, sha256: reference.sha256, bytes: reference.bytes }], `${label} regular-file inventory`);
}
function containsAddDirectoryArgument(argv) {
  return argv.some((entry) => entry === "--add-dir" || entry.startsWith("--add-dir="));
}
function expectedLaunchSpec() {
  const prompt = buildRolePrompt();
  const argv = buildExpectedCodexArgv();
  assert(sha256(Buffer.from(prompt, "utf8")) === ROLE_PROMPT_SHA256, "role prompt SHA-256 changed.");
  assert(argv.at(-1) === prompt, "expected Codex argv does not end with the exact role prompt.");
  assert(!containsAddDirectoryArgument(argv), "expected Codex argv must not contain --add-dir.");
  exact(argv.slice(0, -1), ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "workspace-write", "-C", ROLE_HOME, "--skip-git-repo-check", ...ROLE_IMAGE_ARGUMENTS, "--"], "expected Codex launch argv flags");
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
function validatePublishedPrelaunch() {
  const reference = fileReference(PRELAUNCH_PATH, "published baseline pre-launch record");
  assert(reference.sha256 === PRELAUNCH_SHA256, "published baseline pre-launch record SHA-256 changed.");
  assertOneFileTree(PRELAUNCH_ROOT, PRELAUNCH_FILE, reference, "published baseline pre-launch root");
  const record = readJson(PRELAUNCH_PATH, "published baseline pre-launch record");
  assert(record.schema === "p3-r5-role-launch-preauthorization/v1" && record.recordState === "finalized" && record.ownerApproved === true, "published baseline pre-launch state changed.");
  exact(record.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, "published baseline pre-launch activation");
  exact(record.authorizationScope, AUTHORIZATION_SCOPE, "published baseline pre-launch scope");
  exact(record.execution, PRELAUNCH_EXECUTION, "published baseline pre-launch execution");
  assert(record.output?.root === posix(PRELAUNCH_ROOT) && record.output?.file === PRELAUNCH_FILE, "published baseline pre-launch output binding changed.");
  assert(record.bindings?.deliveryReceipt?.path === DELIVERY_RECEIPT_PATH_POSIX && record.bindings?.deliveryReceipt?.sha256 === DELIVERY_RECEIPT_SHA256, "published baseline pre-launch delivery receipt binding changed.");
  assert(record.bindings?.roleHome?.path === ROLE_HOME, "published baseline pre-launch role-home binding changed.");
  exact(record.bindings?.roleHome?.attachments, BASELINE_ATTACHMENTS, "published baseline pre-launch role-home attachments");
  exact(record.bindings?.protocol, {
    baseline: { path: "protocol-baseline.json", sha256: PROTOCOL_SHA256 },
    current: { path: "protocol-current.json", sha256: PROTOCOL_SHA256 },
  }, "published baseline pre-launch protocol binding");
  assert(record.p11?.status === "BLOCKED" && record.p11?.authorization === "NOT_AUTHORIZED" && record.p11?.roleLaunchObserved === false, "published baseline pre-launch P-11 boundary changed.");
  assert(record.ownerAttestedFreshContext?.verificationStatus === "owner-attested, not machine-verifiable" && record.ownerAttestedFreshContext?.actualActor === "REQUIRED_UNSET" && record.ownerAttestedFreshContext?.actualContextId === "REQUIRED_UNSET", "published baseline pre-launch fresh-context claim changed.");
  assert(record.nonElevatedBoundaries?.osIsolation === "not asserted" && record.nonElevatedBoundaries?.modelVisibleToolSurface === "not asserted", "published baseline pre-launch tool-surface boundary changed.");
  return { reference, record };
}
function pinnedPreSpawnState() {
  const state = collectAuthorizationPreSpawnState();
  return { sha256: sha256(canonicalJsonBytes(state)), state };
}
function launchSpecCandidate(prelaunch, preSpawnState = pinnedPreSpawnState()) {
  const launch = expectedLaunchSpec();
  return {
    schema: "p3-r5-role-launch-spec-authorization/v1",
    recordState: "candidate-not-published",
    ownerApproved: false,
    ownerApprovalRecordedAt: "REQUIRED_UNSET",
    approvalBasis: "Requires finalization from the already owner-approved, published baseline sequence-1 pre-launch authorization. This launch-spec record binds one exact coordinator invocation only; it does not create a role context, acquire a lease, start Codex, create an archive, apply a return, change a worktree, measure browser/Figma, or change P-11.",
    preLaunchAuthorization: { path: prelaunch.reference.path, sha256: prelaunch.reference.sha256 },
    activation: { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID },
    bindings: {
      protocolSha256: PROTOCOL_SHA256,
      deliveryReceipt: { path: DELIVERY_RECEIPT_PATH_POSIX, sha256: DELIVERY_RECEIPT_SHA256 },
      roleHome: { path: ROLE_HOME, attachments: BASELINE_ATTACHMENTS },
    },
    // This is the complete pre-spawn state that this authorization approves.
    // It includes the activation outputs / immutable inputs, helper + durable
    // E2E evidence, current serial receipt/home state, return plan, images,
    // progress and worktree absence.  The launcher re-hashes it before spawn.
    preSpawnState,
    launch,
    authorizationScope: { ...AUTHORIZATION_SCOPE },
    execution: {
      launchSpecAuthorized: false,
      liveLeaseAcquired: false,
      roleLaunchExecuted: false,
      implementation: false,
      returnApply: false,
      siteMutation: false,
      lifecycleMutation: false,
      browserMeasurement: false,
      figmaMeasurement: false,
      p11Mutation: false,
    },
    nonAssertions: {
      p11: "not authorized or changed by this record",
      osIsolation: "not asserted",
      cleanRoom: "not asserted",
      modelVisibleToolSurface: "not asserted",
      actualFreshContextIdentity: "not asserted",
    },
    additionalDirectoriesForbidden: true,
    completionReceiptRequiredAfterFutureLaunch: true,
  };
}
function recordId(candidate) {
  const candidateSha256 = sha256(jsonBytes(candidate));
  return sha256(Buffer.from(`p3-r5-baseline-seq1-launch-spec\0${PAIR_ID}\0${ACTIVATION_ID}\0${HANDOFF_ID}\0${PRELAUNCH_SHA256}\0${ROLE_PROMPT_SHA256}\0${candidateSha256}`, "utf8"));
}
function validateCandidate(candidate, prelaunch, preSpawnState, label) {
  assert(candidate.schema === "p3-r5-role-launch-spec-authorization/v1", `${label} schema changed.`);
  exact(candidate.preLaunchAuthorization, { path: prelaunch.reference.path, sha256: prelaunch.reference.sha256 }, `${label} pre-launch binding`);
  exact(candidate.activation, { activationId: ACTIVATION_ID, pairId: PAIR_ID, condition: CONDITION, deliverySequence: DELIVERY_SEQUENCE, opaqueHandoffId: HANDOFF_ID }, `${label} activation`);
  exact(candidate.bindings, {
    protocolSha256: PROTOCOL_SHA256,
    deliveryReceipt: { path: DELIVERY_RECEIPT_PATH_POSIX, sha256: DELIVERY_RECEIPT_SHA256 },
    roleHome: { path: ROLE_HOME, attachments: BASELINE_ATTACHMENTS },
  }, `${label} bindings`);
  exact(candidate.preSpawnState, preSpawnState, `${label} pre-spawn state fingerprint`);
  exact(candidate.launch, expectedLaunchSpec(), `${label} exact launch spec`);
  assert(candidate.launch.shell === false && candidate.launch.cwd === ROLE_HOME && candidate.launch.rolePromptSha256 === ROLE_PROMPT_SHA256, `${label} shell/cwd/prompt binding changed.`);
  assert(candidate.launch.additionalDirectories.length === 0 && !containsAddDirectoryArgument(candidate.launch.argv), `${label} permits --add-dir.`);
  exact(candidate.authorizationScope, AUTHORIZATION_SCOPE, `${label} authorization scope`);
  assert(candidate.additionalDirectoriesForbidden === true && candidate.completionReceiptRequiredAfterFutureLaunch === true, `${label} launch boundary changed.`);
  assert(candidate.nonAssertions?.p11 === "not authorized or changed by this record" && candidate.nonAssertions?.osIsolation === "not asserted" && candidate.nonAssertions?.cleanRoom === "not asserted" && candidate.nonAssertions?.modelVisibleToolSurface === "not asserted" && candidate.nonAssertions?.actualFreshContextIdentity === "not asserted", `${label} non-assertion boundary changed.`);
}
function buildFinalPublication(prelaunch, preSpawnState) {
  const candidate = launchSpecCandidate(prelaunch, preSpawnState);
  validateCandidate(candidate, prelaunch, preSpawnState, "launch-spec candidate");
  const id = recordId(candidate);
  const root = join(LAUNCH_SPEC_PARENT, id);
  const record = {
    ...candidate,
    recordState: "finalized",
    ownerApproved: true,
    ownerApprovalRecordedAt: new Date().toISOString(),
    execution: {
      ...candidate.execution,
      launchSpecAuthorized: true,
    },
    output: { recordId: id, root: posix(root), file: LAUNCH_SPEC_FILE },
  };
  const bytes = jsonBytes(record);
  const publication = { id, root, record, bytes, sha256: sha256(bytes), candidate, candidateSha256: sha256(jsonBytes(candidate)) };
  validateFinalPublication(publication, prelaunch, preSpawnState);
  return publication;
}
function validateFinalPublication(publication, prelaunch, preSpawnState) {
  const { record } = publication;
  assert(record.recordState === "finalized" && record.ownerApproved === true && typeof record.ownerApprovalRecordedAt === "string" && !Number.isNaN(Date.parse(record.ownerApprovalRecordedAt)), "final launch-spec state is invalid.");
  validateCandidate({ ...record, recordState: "candidate-not-published", ownerApproved: false, ownerApprovalRecordedAt: "REQUIRED_UNSET", execution: { ...record.execution, launchSpecAuthorized: false }, output: undefined }, prelaunch, preSpawnState, "final launch-spec content");
  assert(record.execution?.launchSpecAuthorized === true && record.execution?.liveLeaseAcquired === false && record.execution?.roleLaunchExecuted === false && record.execution?.implementation === false && record.execution?.returnApply === false && record.execution?.siteMutation === false && record.execution?.lifecycleMutation === false && record.execution?.browserMeasurement === false && record.execution?.figmaMeasurement === false && record.execution?.p11Mutation === false, "final launch-spec execution state changed.");
  exact(record.output, { recordId: publication.id, root: posix(publication.root), file: LAUNCH_SPEC_FILE }, "final launch-spec output binding");
  assert(publication.sha256 === sha256(publication.bytes), "final launch-spec record SHA-256 is invalid.");
}
function assertNoPriorLaunchSpecAuthorization() {
  if (!existsSync(LAUNCH_SPEC_PARENT)) return;
  assertDirectory(LAUNCH_SPEC_PARENT, "launch-spec parent");
  const entries = readdirSync(LAUNCH_SPEC_PARENT, { withFileTypes: true });
  assert(entries.length === 0, "launch-spec authorization is one-time and its parent already contains a published, staged, or malformed entry.");
}
function ensurePublishParent() {
  const externalRoot = resolve(`C:/Users/tane1/AppData/Local/p3-coordinator-records/${PAIR_ID}`);
  const parent = resolve(LAUNCH_SPEC_PARENT);
  assertDirectory(externalRoot, "external coordinator-records root");
  assert(externalRoot !== parent && isWithin(externalRoot, parent), "launch-spec parent escapes external coordinator records.");
  const missing = [];
  let cursor = parent;
  while (!existsSync(cursor)) {
    assert(isWithin(externalRoot, cursor) && resolve(cursor) !== externalRoot, "launch-spec parent escapes external coordinator records.");
    missing.push(cursor);
    cursor = dirname(cursor);
  }
  assertDirectory(cursor, "launch-spec publication ancestor");
  const created = [...missing].reverse();
  for (const directory of created) {
    mkdirSync(directory, { recursive: false, mode: 0o700 });
    assertDirectory(directory, "created launch-spec publication ancestor");
  }
  return created;
}
function removeOwnedEmptyParents(created) {
  for (const directory of [...created].reverse()) {
    if (!existsSync(directory)) continue;
    assertDirectory(directory, "launch-spec rollback parent");
    if (readdirSync(directory).length === 0) rmdirSync(directory);
  }
}
function createStage(finalRoot) {
  const parent = dirname(finalRoot);
  assertDirectory(parent, "launch-spec publication parent");
  const stage = join(parent, `.${basename(finalRoot)}.stage-${randomUUID()}`);
  assert(isWithin(parent, stage) && resolve(stage) !== resolve(parent), "launch-spec stage escapes parent.");
  assertAbsent(stage, "launch-spec stage root");
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  return stage;
}
function assertOwnedStage(stage, finalRoot) {
  assert(resolve(dirname(stage)) === resolve(dirname(finalRoot)) && basename(stage).startsWith(`.${basename(finalRoot)}.stage-`), "refusing to operate on a stage outside this launch-spec transaction.");
}
function removeOwnedStage(stage, finalRoot) {
  if (!stage || !existsSync(stage)) return;
  assertOwnedStage(stage, finalRoot);
  rmSync(stage, { recursive: true, force: false });
}
function validatePublicationTree(root, publication, label) {
  const reference = fileReference(join(root, LAUNCH_SPEC_FILE), `${label} record`);
  assert(reference.sha256 === publication.sha256 && reference.bytes === publication.bytes.length, `${label} record bytes changed.`);
  assertOneFileTree(root, LAUNCH_SPEC_FILE, reference, label);
  exact(readJson(join(root, LAUNCH_SPEC_FILE), `${label} record`), publication.record, `${label} record content`);
}
function stablePrelaunch() {
  return validatePublishedPrelaunch();
}
function publish(prelaunch, preSpawnState) {
  assertNoPriorLaunchSpecAuthorization();
  const publication = buildFinalPublication(prelaunch, preSpawnState);
  assertAbsent(publication.root, "launch-spec output root");
  let createdParents = [];
  let stage = null;
  let published = false;
  try {
    createdParents = ensurePublishParent();
    stage = createStage(publication.root);
    writeFileSync(join(stage, LAUNCH_SPEC_FILE), publication.bytes, { mode: 0o600 });
    validatePublicationTree(stage, publication, "staged launch-spec publication");
    const stable = stablePrelaunch();
    exact(stable.reference, prelaunch.reference, "pre-launch record changed during launch-spec publication");
    const stableBeforePublish = pinnedPreSpawnState();
    exact(stableBeforePublish, preSpawnState, "pre-spawn state changed before launch-spec publication");
    assertAbsent(publication.root, "launch-spec output root immediately before publication");
    renameSync(stage, publication.root);
    stage = null;
    published = true;
    validatePublicationTree(publication.root, publication, "published launch-spec publication");
    const stablePreSpawnState = pinnedPreSpawnState();
    exact(stablePreSpawnState, preSpawnState, "pre-spawn state changed during launch-spec publication");
    validateFinalPublication(publication, stable, stablePreSpawnState);
    return {
      status: "published-launch-spec-authorization-only",
      externalWritesPerformed: true,
      publication: { recordId: publication.id, root: posix(publication.root), file: LAUNCH_SPEC_FILE, sha256: publication.sha256 },
      roleContextCreated: false,
      liveLeaseAcquired: false,
      roleLaunched: false,
      implementationExecuted: false,
    };
  } catch (error) {
    const rollbackFailures = [];
    try { removeOwnedStage(stage, publication.root); } catch (rollbackError) { rollbackFailures.push(`stage: ${rollbackError.message}`); }
    if (published) {
      rollbackFailures.push(`published record retained append-only at ${posix(publication.root)}; publish a separate integrity/unresolved record before any further action`);
    } else {
      try { removeOwnedEmptyParents(createdParents); } catch (rollbackError) { rollbackFailures.push(`parents: ${rollbackError.message}`); }
    }
    const suffix = rollbackFailures.length ? ` Rollback failures: ${rollbackFailures.join(" | ")}` : "";
    fail(`launch-spec publication failed: ${error.message}.${suffix}`);
  }
}
function dryRun(prelaunch, preSpawnState) {
  assertNoPriorLaunchSpecAuthorization();
  const candidate = launchSpecCandidate(prelaunch, preSpawnState);
  validateCandidate(candidate, prelaunch, preSpawnState, "launch-spec candidate");
  const id = recordId(candidate);
  const root = join(LAUNCH_SPEC_PARENT, id);
  assertDirectory(`C:/Users/tane1/AppData/Local/p3-coordinator-records/${PAIR_ID}`, "external coordinator-records root");
  assertAbsent(root, "planned launch-spec output root");
  return {
    schema: "p3-r5-baseline-seq1-launch-spec-dry-run/v1",
    status: "validated-dry-run-no-publication-or-launch",
    externalWritesPerformed: false,
    roleContextCreated: false,
    liveLeaseAcquired: false,
    roleLaunched: false,
    implementationExecuted: false,
    returnApplied: false,
    p11Changed: false,
    preLaunchAuthorization: prelaunch.reference,
    launchSpec: candidate.launch,
    candidate: { sha256: sha256(jsonBytes(candidate)), record: candidate },
    plannedPublication: {
      recordId: id,
      root: posix(root),
      file: LAUNCH_SPEC_FILE,
      finalRecordSha256: "requires actual ownerApprovalRecordedAt at --apply",
      atomicMethod: "same-parent staging directory then atomic rename; only an unpublished stage may be removed. A published record is retained append-only and any post-publication integrity problem requires a separate unresolved/integrity record.",
    },
  };
}
function main() {
  if (process.argv.length !== 3 || !["--dry-run", "--apply"].includes(process.argv[2])) fail("Usage: node tools/r5-finalize-baseline-seq1-launch-spec.mjs --dry-run|--apply");
  const prelaunch = validatePublishedPrelaunch();
  const preSpawnState = pinnedPreSpawnState();
  const result = process.argv[2] === "--dry-run" ? dryRun(prelaunch, preSpawnState) : publish(prelaunch, preSpawnState);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
try { main(); }
catch (error) {
  process.stderr.write(`P3 R5 BASELINE LAUNCH-SPEC FINALIZER: ${error.message}\n`);
  process.exitCode = 1;
}

export { LAUNCH_SPEC_PARENT, LAUNCH_SPEC_FILE, expectedLaunchSpec, launchSpecCandidate, recordId };
