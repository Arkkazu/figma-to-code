#!/usr/bin/env node
// fidelity-benchmark.mjs — P-3 comparison contract v13
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.cwd();
const statePath = resolve(root, ".figma-gate", "active.json");
const args = process.argv.slice(2);
const command = args[0];
let failureLedger = null;
// Preparation commands may inspect draft records in order to print the exact
// values an owner must approve. No lifecycle command ever enables this mode.
let draftPreparationMode = false;
const GATE = {
  manifest: "manifestSha256", spec: "specSha256", components: "componentsSha256", mapping: "mappingSha256",
  nodeMap: "nodeMapSha256", componentDecision: "componentDecisionSha256", nodeEvidence: "nodeEvidenceSha256",
  layerEvidence: "layerEvidenceSha256", accessibility: "accessibilitySha256", motion: "motionSha256", axeSource: "axeSourceSha256",
};
const EVAL = ["fidelityBenchmark", "figmaGate", "gateBrowserBatch", "verifyLayout", "checkpointCapture", "checkpointDiff", "cdpBrowser", "accessibilityVerify", "motionVerify", "lintUnits", "loopLearn", "loopLearningPolicy"];
const CANONICAL_EVALUATOR_PATHS = Object.freeze({
  fidelityBenchmark: "MyBrain/verify/fidelity-benchmark.mjs",
  figmaGate: "MyBrain/verify/figma-gate.mjs",
  gateBrowserBatch: "MyBrain/verify/gate-browser-batch.mjs",
  verifyLayout: "MyBrain/verify/verify-layout.mjs",
  checkpointCapture: "MyBrain/verify/checkpoint-capture.mjs",
  checkpointDiff: "MyBrain/verify/checkpoint-diff.mjs",
  cdpBrowser: "MyBrain/verify/cdp-browser.mjs",
  accessibilityVerify: "MyBrain/verify/accessibility-verify.mjs",
  motionVerify: "MyBrain/verify/motion-verify.mjs",
  lintUnits: "MyBrain/verify/lint-units.mjs",
  loopLearn: "MyBrain/verify/loop-learn.mjs",
  loopLearningPolicy: "MyBrain/verify/loop-learning-policy.json",
});
const CANONICAL_GATE_PATH = CANONICAL_EVALUATOR_PATHS.figmaGate;
const P3_TRUSTED_RESOLVER_PATH = CANONICAL_EVALUATOR_PATHS.fidelityBenchmark;
const NON_SOURCE_PREFIXES = [".figma-gate/", "MyBrain/", "node_modules/"];
const FORBIDDEN_CLEAN_ROOM = ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"];
const OUTCOMES = new Set(["PASS", "FAIL"]);
const P3_CONTRACT_VERSION = 13;
const P3_FIGMA_GATE_ACTIVE_STATE_VERSION = 5;
const P3_DECISION_CANDIDATE_DRAFT_SCHEMA = "p3-comparison-contract-draft/v13";
const CHROME_FINGERPRINT_SOURCE = "CDP Browser.getVersion";
const CHROME_FINGERPRINT_FIELDS = Object.freeze(["product", "revision", "userAgent"]);
const CHROME_FINGERPRINT_EQUALITY = "within-final-batches-and-across-pair";
export function p3ValidateContractVersion(value) {
  return value === P3_CONTRACT_VERSION
    ? { ok: true, value: P3_CONTRACT_VERSION }
    : { ok: false, error: `version must be ${P3_CONTRACT_VERSION}; v12 and every earlier contract are rejected without migration` };
}
export function p3ValidateFigmaGateActiveStateVersion(value) {
  return value === P3_FIGMA_GATE_ACTIVE_STATE_VERSION
    ? { ok: true, value: P3_FIGMA_GATE_ACTIVE_STATE_VERSION }
    : { ok: false, error: `version ${P3_FIGMA_GATE_ACTIVE_STATE_VERSION}; v4 and every earlier active state are rejected without migration` };
}
export function p3ValidateDecisionCandidateDraftSchema(value) {
  return value === P3_DECISION_CANDIDATE_DRAFT_SCHEMA
    ? { ok: true, value: P3_DECISION_CANDIDATE_DRAFT_SCHEMA }
    : { ok: false, error: `schema must be ${P3_DECISION_CANDIDATE_DRAFT_SCHEMA}; v12 and every earlier candidate schema are rejected without migration` };
}

// The hermetic provider is a P-3-only optional sidecar. It is deliberately
// loaded only by the commands that need static-page serving or receipt
// revalidation, so ordinary required distribution does not acquire a new
// manifest dependency before the owner adopts this draft contract.
async function p3PageProvider() {
  try {
    return await import("./p3-page-provider.mjs");
  } catch (error) {
    fail(`P-3 hermetic page-provider sidecar is unavailable or invalid; copy p3-page-provider.mjs with the P-3 draft before using this command (${error?.message || String(error)})`);
  }
}
const FAILURE_CLASSES = new Set(["SPEC", "LAYOUT", "VISUAL", "OTHER"]);
const AMBIENT_NODE_VARIABLES = ["NODE_OPTIONS", "NODE_PATH", "NODE_PRESERVE_SYMLINKS", "NODE_PRESERVE_SYMLINKS_MAIN"];

function fail(message) {
  if (failureLedger) {
    const active = failureLedger;
    failureLedger = null;
    try { abort(active.path, active.pairId, `automatic abort after comparison-contract failure: ${message}`); }
    catch (error) { console.error(`FIDELITY BENCHMARK: automatic ledger terminal record failed; the fixed pair lock remains unreusable: ${error.message}`); }
  }
  console.error(`FIDELITY BENCHMARK: ${message}`);
  process.exit(1);
}
function object(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`); return value; }
function array(value, label) { if (!Array.isArray(value)) fail(`${label} must be an array`); return value; }
function string(value, label, min = 1) { if (typeof value !== "string" || value.trim().length < min) fail(`${label} must be a string of at least ${min} characters`); return value.trim(); }
function digest(value, label) { value = string(value, label, 64).toLowerCase(); if (!/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a SHA-256 digest`); return value; }
function oid(value, label) { value = string(value, label, 40).toLowerCase(); if (!/^[a-f0-9]{40,64}$/.test(value)) fail(`${label} must be a Git object ID`); return value; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value; }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function stableHash(value) { return hash(JSON.stringify(stable(value))); }
function fileHash(pathname) { return hash(readFileSync(pathname)); }
// APFS is case-insensitive by default. Treat every Darwin filesystem as
// case-insensitive here: a case-sensitive APFS volume can reject a valid
// case-distinct path, but accepting a case variant would weaken the P-3
// source/provider boundary on the usual macOS configuration.
export function p3UsesCaseInsensitivePathComparison(platform = process.platform) { return platform === "win32" || platform === "darwin"; }
function canonical(pathname, platform = process.platform) { const value = normalize(resolve(pathname)).replace(/\\/g, "/"); return p3UsesCaseInsensitivePathComparison(platform) ? value.toLowerCase() : value; }
function samePath(a, b) { return canonical(a) === canonical(b); }
function inside(base, candidate) { const b = canonical(base); const c = canonical(candidate); return c === b || c.startsWith(`${b}/`); }
function jsonPointer(parent, key) { return `${parent}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`; }
function isDraftPath(pathname) {
  const segments = String(pathname).replace(/\\/g, "/").split("/").filter(Boolean);
  return segments.some((segment) => p3UsesCaseInsensitivePathComparison() ? segment.toLowerCase() === "p3-drafts" : segment === "p3-drafts");
}
function assertNoDraftMarkers(value, label, pointer = "") {
  if (typeof value === "string") {
    if (isDraftPath(value)) fail(`${label} contains a forbidden draft path at ${pointer || "/"}`);
    if (value.trim().toUpperCase().startsWith("OWNER_INPUT_REQUIRED")) fail(`${label} contains forbidden owner-input placeholder at ${pointer || "/"}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => assertNoDraftMarkers(entry, label, jsonPointer(pointer, index))); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    const child = jsonPointer(pointer, key);
    if (key === "_draftOnly" || key === "draftOnly") fail(`${label} contains forbidden draft marker at ${child}`);
    if (key === "status" && typeof entry === "string" && entry.trim().toLowerCase() === "draft") fail(`${label} contains forbidden draft status at ${child}`);
    if (typeof entry === "string" && entry.trim().toUpperCase().startsWith("OWNER_INPUT_REQUIRED")) fail(`${label} contains forbidden owner-input placeholder at ${child}`);
    assertNoDraftMarkers(entry, label, child);
  }
}
function readJson(pathname, label) {
  if (!existsSync(pathname)) fail(`${label} does not exist: ${pathname}`);
  try {
    const value = JSON.parse(readFileSync(pathname, "utf8"));
    if (!draftPreparationMode) assertNoDraftMarkers(value, label);
    return value;
  } catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function writeJson(pathname, value) { mkdirSync(dirname(pathname), { recursive: true }); writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function repoFile(value, label) {
  value = string(value, label).replace(/\\/g, "/");
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value)) fail(`${label} must be repository-relative`);
  const absolute = resolve(root, value); const path = relative(root, absolute).replace(/\\/g, "/");
  if (!path || path === ".." || path.startsWith("../")) fail(`${label} escapes the repository`);
  if (!draftPreparationMode && isDraftPath(path)) fail(`${label} must not reference a draft artifact: ${path}`);
  return { path, absolute };
}
function frozen(value, label) {
  value = object(value, label); const file = repoFile(value.path, `${label}.path`); const sha256 = digest(value.sha256, `${label}.sha256`);
  if (!draftPreparationMode && isDraftPath(file.path)) fail(`${label} must not reference a draft artifact: ${file.path}`);
  if (!existsSync(file.absolute)) fail(`${label}.path does not exist: ${file.path}`);
  if (fileHash(file.absolute) !== sha256) fail(`${label} SHA-256 mismatch: ${file.path}`);
  return { path: file.path, sha256 };
}
function frozenMany(value, label, allowEmpty = false) {
  value = array(value, label); if (!allowEmpty && !value.length) fail(`${label} must not be empty`);
  const seen = new Set();
  return value.map((entry, index) => { const item = frozen(entry, `${label}[${index}]`); const key = canonical(resolve(root, item.path)); if (seen.has(key)) fail(`${label} has duplicate path ${item.path}`); seen.add(key); return item; });
}
function gitText(gitArgs, label) {
  try { const value = execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); if (!value) fail(`Git ${label} is empty`); return value; }
  catch (error) { fail(`Comparison contract requires a Git worktree (${label}): ${error.stderr?.toString().trim() || error.message}`); }
}
function gitBytes(gitArgs, label) {
  try { return execFileSync("git", gitArgs, { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { fail(`Could not read Git ${label}: ${error.stderr?.toString().trim() || error.message}`); }
}
function sanitizedNodeEnvironment() {
  const environment = { ...process.env };
  for (const key of AMBIENT_NODE_VARIABLES) delete environment[key];
  return environment;
}
function runNodeAsync(script, scriptArgs, environment, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    let child;
    try { child = spawn(process.execPath, [script, ...scriptArgs], { cwd: root, stdio: "inherit", env: environment }); }
    catch (error) { rejectPromise(error); return; }
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${label} exited with ${signal ? `signal ${signal}` : `status ${code}`}`));
    });
  });
}
function gitNow() {
  const worktreeRoot = gitText(["rev-parse", "--show-toplevel"], "worktree root");
  if (!samePath(worktreeRoot, root)) fail("Comparison contract must run from the Git worktree root");
  return { worktreeRoot: canonical(worktreeRoot), commit: oid(gitText(["rev-parse", "HEAD"], "HEAD"), "Git HEAD"), tree: oid(gitText(["rev-parse", "HEAD^{tree}"], "HEAD tree"), "Git HEAD tree") };
}
function fixedLedger() { return resolve(root, gitText(["rev-parse", "--git-common-dir"], "common Git directory"), "figma-p3-comparison-ledger.jsonl"); }
function fixedPairLock(ledger, pairId) { return resolve(dirname(ledger), "figma-p3-comparison-pair-locks", `${hash(pairId)}.json`); }
function fixedPairLockDirectory(ledger) { return resolve(dirname(ledger), "figma-p3-comparison-pair-locks"); }
function fixedReservationMutex(ledger) { return resolve(dirname(ledger), "figma-p3-comparison-reservation-mutex"); }
function legacyReservationArtifacts(ledger) {
  const directory = resolve(dirname(ledger), "figma-p3-comparison-contract-locks");
  if (!existsSync(directory)) return [];
  try { return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() || entry.isDirectory()).map((entry) => entry.name); }
  catch (error) { throw new Error(`Comparison legacy reservation directory cannot be inspected: ${error.message}`); }
}
function contractKey(value, platform = process.platform) {
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim().replace(/\\/g, "/");
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(input)) return null;
  const absolute = resolve(root, input); const path = relative(root, absolute).replace(/\\/g, "/");
  if (!path || path === ".." || path.startsWith("../")) return null;
  return p3UsesCaseInsensitivePathComparison(platform) ? path.toLowerCase() : path;
}
function parsePairLock(ledger, pathname) {
  let record;
  try { record = JSON.parse(readFileSync(pathname, "utf8")); }
  catch (error) { throw new Error(`Comparison fixed pair lock is not valid JSON: ${pathname}: ${error.message}`); }
  const contractPath = record && typeof record === "object" && !Array.isArray(record) ? contractKey(record.contractPath) : null;
  const legacy = record?.version === 4 && record?.contractVersion === undefined;
  const current = record?.version === 5 && record?.contractVersion === P3_CONTRACT_VERSION;
  if (!record || typeof record !== "object" || Array.isArray(record) || (!legacy && !current) || typeof record.pairId !== "string" || !record.pairId.trim() || !contractPath || typeof record.ledgerPath !== "string" || !samePath(record.ledgerPath, ledger)) throw new Error(`Comparison fixed pair lock is invalid: ${pathname}`);
  return { pathname, legacy, record: { ...record, contractPath } };
}
function allPairLocks(ledger) {
  const directory = fixedPairLockDirectory(ledger);
  if (!existsSync(directory)) return [];
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => parsePairLock(ledger, resolve(directory, entry.name)));
  } catch (error) { throw new Error(error.message || String(error)); }
}
function readPairLock(ledger, pairId) {
  const pathname = fixedPairLock(ledger, pairId);
  if (!existsSync(pathname)) return null;
  try {
    const lock = parsePairLock(ledger, pathname);
    if (lock.record.pairId !== pairId) fail(`Comparison fixed pair lock is invalid for ${pairId}`);
    return lock;
  } catch (error) { fail(error.message || String(error)); }
}
function createPairLock(pathname, record) {
  let descriptor;
  try { descriptor = openSync(pathname, "wx"); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`Comparison pair ${record.pairId} is already reserved and cannot be reused`); throw error; }
  try { writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, "utf8"); }
  finally { closeSync(descriptor); }
}
function reservePair(ledger, pairId, contractPath) {
  contractPath = contractKey(contractPath);
  if (!contractPath) fail(`Comparison pair ${pairId} needs a repository-relative contract path`);
  const pairPath = fixedPairLock(ledger, pairId); const mutex = fixedReservationMutex(ledger); let held = false; let error = null;
  try {
    mkdirSync(fixedPairLockDirectory(ledger), { recursive: true });
    try { mkdirSync(mutex); held = true; }
    catch (cause) { if (cause.code === "EEXIST") throw new Error("Comparison pair reservation is busy or stale; resolve the fixed reservation mutex before retrying"); throw cause; }
    const legacy = legacyReservationArtifacts(ledger); if (legacy.length) throw new Error(`Comparison legacy contract reservation artifacts require forensic resolution before P-3 can continue: ${legacy.join(", ")}`);
    const locks = allPairLocks(ledger);
    if (locks.some((lock) => lock.record.pairId === pairId)) throw new Error(`Comparison pair ${pairId} is already reserved and cannot be reused`);
    if (locks.some((lock) => lock.record.contractPath === contractPath)) throw new Error(`Comparison contract path ${contractPath} is already reserved and cannot be reused`);
    createPairLock(pairPath, { version: 5, contractVersion: P3_CONTRACT_VERSION, pairId, contractPath, ledgerPath: canonical(ledger), reservedAt: new Date().toISOString() });
  } catch (cause) { error = cause?.message || String(cause); }
  finally {
    if (held) {
      try { rmdirSync(mutex); }
      catch (cause) { if (!error) error = `Comparison pair reservation mutex could not be released; resolve it before retrying: ${cause.message}`; }
    }
  }
  if (error) fail(error);
  return pairPath;
}
function requirePairLock(ledger, pairId, contractPath = null) {
  const lock = readPairLock(ledger, pairId); if (!lock) fail(`Comparison pair ${pairId} has no fixed reservation lock`);
  if (lock.legacy) fail(`Comparison pair ${pairId} has a pre-v13 fixed reservation and cannot continue under comparison contract v13`);
  if (contractPath && lock.record.contractPath !== contractPath) fail(`Comparison pair ${pairId} is reserved for ${lock.record.contractPath}, not ${contractPath}`);
  return lock;
}
function sourceSnapshot(raw) {
  raw = object(raw, "Comparison contract shared.sourceSnapshot");
  const archive = frozen(raw.archive, "Comparison contract shared.sourceSnapshot.archive");
  const preImplementationProof = frozen(raw.preImplementationProof, "Comparison contract shared.sourceSnapshot.preImplementationProof");
  const git = object(raw.git, "Comparison contract shared.sourceSnapshot.git");
  const expected = { commit: oid(git.commit, "Comparison source commit"), tree: oid(git.tree, "Comparison source tree") };
  const actual = gitNow();
  if (actual.commit !== expected.commit || actual.tree !== expected.tree) fail("Comparison source snapshot Git commit/tree does not match this worktree");
  assertNoIgnoredRuntimeArtifacts();
  if (hash(gitBytes(["archive", "--format=tar", expected.commit], "source snapshot archive")) !== archive.sha256) fail("Comparison source snapshot archive is not the exact frozen Git tree");
  return { archive, preImplementationProof, git: expected, actual };
}

function ledgerHash(record) { const { entrySha256, ...unsigned } = record; return stableHash(unsigned); }
function readLedger(pathname) {
  if (!existsSync(pathname)) return [];
  let previous = null;
  return readFileSync(pathname, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    let record; try { record = JSON.parse(line); } catch (error) { fail(`Comparison pair ledger JSONL line ${index + 1}: ${error.message}`); }
    if (record.version !== 1 || record.sequence !== index + 1 || record.previousSha256 !== previous || digest(record.entrySha256, `Comparison pair ledger line ${index + 1} hash`) !== ledgerHash(record)) fail(`Comparison pair ledger chain is invalid at line ${index + 1}`);
    previous = record.entrySha256; return record;
  });
}
function appendLedger(pathname, value) {
  if (process.env.FIGMA_P3_TEST_FAIL_LEDGER_APPEND === "1") throw new Error("Comparison ledger append test injection");
  const records = readLedger(pathname); const record = { version: 1, sequence: records.length + 1, previousSha256: records.length ? records.at(-1).entrySha256 : null, at: new Date().toISOString(), ...value };
  record.entrySha256 = ledgerHash(record); mkdirSync(dirname(pathname), { recursive: true }); appendFileSync(pathname, `${JSON.stringify(record)}\n`, "utf8"); return record;
}
function pair(pathname, pairId) {
  const records = readLedger(pathname).filter((record) => record.pairId === pairId);
  const one = (kind, condition) => records.filter((record) => record.kind === kind && (condition === undefined || record.condition === condition));
  const groups = { started: one("started"), baseline: one("condition-recorded", "baseline"), current: one("condition-recorded", "current"), baselinePreflight: one("preflight-recorded", "baseline"), currentPreflight: one("preflight-recorded", "current"), baselineProviderClose: one("provider-close-recorded", "baseline"), currentProviderClose: one("provider-close-recorded", "current"), terminal: records.filter((record) => record.kind === "aborted" || record.kind === "completed") };
  if (Object.values(groups).some((entries) => entries.length > 1)) fail(`Comparison pair ledger has duplicate lifecycle records for ${pairId}`);
  return { records, started: groups.started[0], base: groups.baseline[0], current: groups.current[0], bp: groups.baselinePreflight[0], cp: groups.currentPreflight[0], bc: groups.baselineProviderClose[0], cc: groups.currentProviderClose[0], terminal: groups.terminal[0] };
}
function armFailureLedgerForContract(argument) {
  const contractPath = contractKey(argument); if (!contractPath) return null;
  const ledger = fixedLedger(); let locks;
  try { locks = allPairLocks(ledger).filter((lock) => !lock.legacy && lock.record.contractPath === contractPath); }
  catch (error) { fail(error.message || String(error)); }
  if (locks.length > 1) fail(`Comparison contract path ${contractPath} has multiple fixed reservations`);
  if (!locks.length) return null;
  return armFailureLedgerForPair(ledger, locks[0].record.pairId);
}
function armFailureLedgerForPair(ledger, pairId) {
  const lifecycle = pair(ledger, pairId);
  if (lifecycle.started && !lifecycle.terminal) { failureLedger = { path: ledger, pairId }; return { ledger, pairId }; }
  return null;
}
function abort(pathname, pairId, reason) { const lifecycle = pair(pathname, pairId); if (!lifecycle.terminal) appendLedger(pathname, { kind: "aborted", pairId, reason: string(reason, "pair abort reason", 20) }); }
function rawContract(argument) {
  const file = repoFile(argument, "comparison contract path");
  if (!draftPreparationMode && isDraftPath(file.path)) fail(`Comparison contract path must not reference a draft artifact: ${file.path}`);
  const raw = object(readJson(file.absolute, "Comparison contract"), "Comparison contract");
  const version = p3ValidateContractVersion(raw.version); if (!version.ok) fail(`Comparison contract ${version.error}`);
  const pairId = string(raw.pairId, "Comparison contract pairId", 3); const condition = string(raw.condition, "Comparison contract condition");
  if (condition !== "baseline" && condition !== "current") fail("Comparison contract condition must be baseline or current");
  return { raw, pairId, condition, ledger: fixedLedger(), contractPath: contractKey(file.path) };
}
function rawDecisionCandidateContract(argument) {
  const file = repoFile(argument, "P-3 decision candidate comparison contract");
  if (!isDraftPath(file.path)) fail("P-3 decision candidate comparison contract must be a p3-drafts artifact");
  const envelope = object(readJson(file.absolute, "P-3 decision candidate comparison contract"), "P-3 decision candidate comparison contract");
  if (Object.prototype.hasOwnProperty.call(envelope, "version")) fail("P-3 decision candidate comparison contract must not carry a runtime contract version");
  const schema = p3ValidateDecisionCandidateDraftSchema(envelope.schema);
  if (!schema.ok) fail(`P-3 decision candidate comparison contract ${schema.error}`);
  if (envelope.draftOnly !== true || envelope.status !== "draft" || envelope.ownerApproved !== false) fail("P-3 decision candidate comparison contract must be a v13 draft-only envelope");
  const pairId = string(envelope.pairIdCandidate, "P-3 decision candidate comparison contract pairIdCandidate", 3); const condition = string(envelope.condition, "P-3 decision candidate comparison contract condition");
  if (condition !== "baseline" && condition !== "current") fail("P-3 decision candidate comparison contract condition must be baseline or current");
  const raw = object(envelope.candidateComparison, "P-3 decision candidate comparison payload"); const allowed = new Set(["version", "pairId", "condition", "shared"]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) fail(`P-3 decision candidate comparison payload has unsupported entry ${key}`);
  const version = p3ValidateContractVersion(raw.version); if (!version.ok) fail(`P-3 decision candidate comparison payload ${version.error}`);
  if (string(raw.pairId, "P-3 decision candidate comparison payload pairId", 3) !== pairId || string(raw.condition, "P-3 decision candidate comparison payload condition") !== condition) fail("P-3 decision candidate comparison payload must match its draft envelope pairIdCandidate and condition");
  object(raw.shared, "P-3 decision candidate comparison payload shared");
  return { file, envelope, raw, pairId, condition };
}
// A runtime contract must never turn a draft packet into a lifecycle
// reservation merely because its ordinary schema happens to be complete.  Do
// a marker/path-only pass over every JSON authority that the contract will use
// before pair-begin creates its immutable reservation.  This deliberately
// does not validate the records' hashes or approval semantics here: ordinary
// authorization failures still terminate a reserved started pair, while an
// explicitly marked draft is rejected before there is a pair to reserve.
function assertNoDraftRuntimeReference(value, label) {
  const reference = object(value, label);
  const file = repoFile(reference.path, `${label}.path`);
  if (file.path.toLowerCase().endsWith(".json")) readJson(file.absolute, label);
}
function assertNoDraftRuntimeReferences(raw) {
  if (draftPreparationMode) return;
  const seenReferences = new Set(); const seenJson = new Set();
  const scanJson = (pathname, label) => {
    const key = canonical(pathname); if (seenJson.has(key)) return;
    seenJson.add(key); visit(readJson(pathname, label), label);
  };
  const maybeJsonPath = (value, label) => {
    if (typeof value !== "string" || !value.trim().toLowerCase().endsWith(".json") || /^(?:[A-Za-z]:[\\/]|[\\/]|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/.test(value.trim())) return;
    const absolute = resolve(root, value.trim()); const relativePath = relative(root, absolute).replace(/\\/g, "/");
    if (!relativePath || relativePath === ".." || relativePath.startsWith("../") || !existsSync(absolute)) return;
    scanJson(absolute, label);
  };
  const visit = (value, label) => {
    if (typeof value === "string") { maybeJsonPath(value, label); return; }
    if (Array.isArray(value)) { value.forEach((entry, index) => visit(entry, `${label}[${index}]`)); return; }
    if (!value || typeof value !== "object") return;
    if (Object.prototype.hasOwnProperty.call(value, "path") && Object.prototype.hasOwnProperty.call(value, "sha256")) {
      // Every frozen authority—including binary artifacts and evaluator roots—
      // receives a path boundary check. JSON authorities additionally receive
      // the recursive draft-marker check in assertNoDraftRuntimeReference().
      const path = typeof value.path === "string" ? value.path : "";
      const key = `${label}\u0000${path}`;
      if (!seenReferences.has(key)) { seenReferences.add(key); assertNoDraftRuntimeReference(value, label); }
    }
    for (const [key, entry] of Object.entries(value)) visit(entry, `${label}.${key}`);
  };
  visit(raw, "Comparison contract");
}
function conditionIntent(raw) {
  return { contractSha256: stableHash(raw), runIntentSha256: stableHash(object(raw.run, "Comparison contract run")) };
}
function cleanPreflight(state) {
  const preEdit = object(state.preEdit, "Active Figma gate state preEdit");
  const dirtyPaths = array(preEdit.dirtyPaths, "Active Figma gate state preEdit.dirtyPaths");
  const statuses = object(preEdit.changeTargetStatus, "Active Figma gate state preEdit.changeTargetStatus");
  if (dirtyPaths.length) fail("Comparison report requires a clean Git working tree at preflight");
  const entries = Object.entries(statuses); if (!entries.length) fail("Comparison report requires a clean change target at preflight");
  for (const [pathname, status] of entries) if (status !== "clean") fail(`Comparison report requires clean preflight targets; ${pathname} is ${JSON.stringify(status)}`);
  const preflightAt = string(state.preflightAt, "Active Figma gate state preflightAt", 20); if (Number.isNaN(Date.parse(preflightAt))) fail("Active Figma gate state preflightAt must be an ISO timestamp");
  return { dirtyPaths: [], changeTargetStatus: Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))), preflightAt };
}
function preflightGit(state, source) {
  const git = object(state.git, "Active Figma gate state preflight Git identity");
  const current = { worktreeRoot: string(git.worktreeRoot, "Active Figma gate state git.worktreeRoot", 3), commit: oid(git.commit, "Active Figma gate state git.commit"), tree: oid(git.tree, "Active Figma gate state git.tree") };
  if (!samePath(current.worktreeRoot, root)) fail("Active Figma gate preflight Git worktree differs from this worktree");
  if (current.commit !== source.git.commit || current.tree !== source.git.tree) fail("Active Figma gate preflight Git identity does not match the frozen source snapshot");
  return current;
}
function frozenGate(raw, figma) {
  raw = object(raw, "Comparison contract shared.gate");
  const manifestId = string(raw.manifestId, "Comparison contract shared.gate.manifestId", 3); const sourceInputs = object(raw.inputs, "Comparison contract shared.gate.inputs"); const inputs = {};
  for (const key of Object.keys(GATE)) inputs[key] = frozen(sourceInputs[key], `Comparison contract shared.gate.inputs.${key}`);
  if (inputs.nodeMap.path !== figma.nodeMap.path || inputs.nodeMap.sha256 !== figma.nodeMap.sha256) fail("Comparison gate nodeMap must equal the Figma nodeMap");
  return { manifestId, inputs };
}
function assertFigmaNodeMapBinding(nodeMap, figma) {
  if (nodeMap.version !== 2 || nodeMap.schema !== "scoped-roots/v1") fail("Comparison node map must use version 2 schema scoped-roots/v1");
  const nodeFigma = object(nodeMap.figma, "Comparison node map.figma");
  const canonicalRootNodeId = string(nodeFigma.canonicalRootNodeId, "Comparison node map.figma.canonicalRootNodeId", 3);
  if (nodeFigma.fileKey !== figma.fileKey || canonicalRootNodeId !== figma.rootNodeId) {
    fail("Comparison Figma fileKey/canonicalRootNodeId must match frozen node map v2");
  }
  return { canonicalRootNodeId };
}
function gateInputs(raw, state, figma, source, expectedImplementation) {
  const gate = frozenGate(raw, figma);
  if (state.phase !== "closed") fail("Comparison report requires a completed figma-gate close state");
  const stateVersion = p3ValidateFigmaGateActiveStateVersion(state.version);
  if (!stateVersion.ok) fail(`Comparison report requires a v13 figma-gate active state ${stateVersion.error}`);
  if (!samePath(string(state.repository, "Active Figma gate state repository"), root)) fail("Active Figma gate state repository does not match this Git worktree");
  if (state.manifestId !== gate.manifestId) fail("Active Figma gate state manifestId does not match the comparison contract");
  for (const [key, stateKey] of Object.entries(GATE)) if (digest(state[stateKey], `Active Figma gate state ${stateKey}`) !== gate.inputs[key].sha256) fail(`Active Figma gate state ${stateKey} does not match frozen ${key}`);
  const implementationIdentity = activeImplementationIdentity(state, expectedImplementation, "Active Figma gate state");
  preflightGit(state, source); return { ...gate, implementationIdentity };
}
function exact(left, right, label) {
  const a = [...left].sort(); const b = [...right].sort();
  if (new Set(a).size !== a.length || new Set(b).size !== b.length || a.join("\n") !== b.join("\n")) fail(`${label} does not exactly match the frozen checkpoint/change-target plan`);
}
function p3ExactKeys(value, expected) {
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
function p3NonEmptyString(value) { return typeof value === "string" && value.trim().length > 0 ? value.trim() : null; }
export function p3ValidateImplementationIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "must be an object" };
  if (!p3ExactKeys(value, ["actor", "contextId"])) return { ok: false, error: "must contain exactly actor and contextId" };
  const actor = p3NonEmptyString(value.actor); const contextId = p3NonEmptyString(value.contextId);
  if (!actor || actor.length < 2) return { ok: false, error: "actor must be a non-empty string of at least 2 characters" };
  if (!contextId || contextId.length < 3) return { ok: false, error: "contextId must be a non-empty string of at least 3 characters" };
  return { ok: true, value: { actor, contextId } };
}
export function p3ValidateActiveImplementationIdentity(state, expected) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return { ok: false, error: "active state must be an object" };
  const actual = p3ValidateImplementationIdentity(state.implementationIdentity);
  if (!actual.ok) return { ok: false, error: `active state implementationIdentity ${actual.error}` };
  const wanted = p3ValidateImplementationIdentity(expected);
  if (!wanted.ok) return { ok: false, error: `expected implementation identity ${wanted.error}` };
  if (actual.value.actor !== wanted.value.actor || actual.value.contextId !== wanted.value.contextId) return { ok: false, error: "active state implementationIdentity does not match the condition run.implementation" };
  return { ok: true, value: actual.value };
}
function activeImplementationIdentity(state, expected, label) {
  const result = p3ValidateActiveImplementationIdentity(state, expected);
  if (!result.ok) fail(`${label} ${result.error}`);
  return result.value;
}
export function p3ValidateChromePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "must be an object" };
  if (!p3ExactKeys(value, ["version", "source", "fields", "equality"])) return { ok: false, error: "must contain exactly version, source, fields, and equality" };
  if (value.version !== 1) return { ok: false, error: "version must be 1" };
  if (value.source !== CHROME_FINGERPRINT_SOURCE) return { ok: false, error: `source must be ${CHROME_FINGERPRINT_SOURCE}` };
  if (!Array.isArray(value.fields) || value.fields.length !== CHROME_FINGERPRINT_FIELDS.length || value.fields.some((field, index) => field !== CHROME_FINGERPRINT_FIELDS[index])) return { ok: false, error: "fields must exactly equal [product, revision, userAgent] in that order" };
  if (value.equality !== CHROME_FINGERPRINT_EQUALITY) return { ok: false, error: `equality must be ${CHROME_FINGERPRINT_EQUALITY}` };
  return { ok: true, value: { version: 1, source: CHROME_FINGERPRINT_SOURCE, fields: [...CHROME_FINGERPRINT_FIELDS], equality: CHROME_FINGERPRINT_EQUALITY } };
}
function chromePolicy(value, label) {
  const result = p3ValidateChromePolicy(value);
  if (!result.ok) fail(`${label} ${result.error}`);
  return result.value;
}
export function p3ValidateChromeFingerprint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "must be an object" };
  if (!p3ExactKeys(value, ["source", ...CHROME_FINGERPRINT_FIELDS])) return { ok: false, error: "must contain exactly source, product, revision, and userAgent" };
  if (value.source !== CHROME_FINGERPRINT_SOURCE) return { ok: false, error: `source must be ${CHROME_FINGERPRINT_SOURCE}` };
  const normalized = { source: CHROME_FINGERPRINT_SOURCE };
  for (const field of CHROME_FINGERPRINT_FIELDS) {
    const entry = p3NonEmptyString(value[field]);
    if (!entry) return { ok: false, error: `${field} must be a non-empty string` };
    normalized[field] = entry;
  }
  return { ok: true, value: normalized };
}
export function p3ChromeFingerprintsEqual(left, right) {
  const a = p3ValidateChromeFingerprint(left); const b = p3ValidateChromeFingerprint(right);
  return a.ok && b.ok && a.value.source === b.value.source && CHROME_FINGERPRINT_FIELDS.every((field) => a.value[field] === b.value[field]);
}
function chromeFingerprint(value, label) {
  const result = p3ValidateChromeFingerprint(value);
  if (!result.ok) fail(`${label} ${result.error}`);
  return result.value;
}
function normalizedComponentScope(gate, componentsDocument) {
  const components = array(componentsDocument.components, "Frozen component manifest components");
  const decisionsDocument = object(readJson(resolve(root, gate.inputs.componentDecision.path), "Frozen component decision manifest"), "Frozen component decision manifest");
  const decisions = array(decisionsDocument.decisions, "Frozen component decision manifest decisions");
  const byId = new Map();
  for (const [index, entry] of decisions.entries()) {
    const decision = object(entry, `Frozen component decision manifest decisions[${index}]`);
    const elementId = string(decision.elementId, `Frozen component decision manifest decisions[${index}].elementId`);
    if (byId.has(elementId)) fail(`Frozen component decision manifest duplicates ${elementId}`);
    byId.set(elementId, decision);
  }
  const seen = new Set();
  const normalized = components.map((entry, index) => {
    const component = object(entry, `Frozen component manifest components[${index}]`);
    const elementId = string(component.elementId, `Frozen component manifest components[${index}].elementId`);
    const selector = string(component.selector, `Frozen component manifest components[${index}].selector`, 2);
    const figmaNodeId = string(component.figmaNodeId, `Frozen component manifest components[${index}].figmaNodeId`, 3);
    if (seen.has(elementId)) fail(`Frozen component manifest duplicates ${elementId}`); seen.add(elementId);
    const decision = byId.get(elementId); if (!decision) fail(`Frozen component decision manifest lacks ${elementId}`);
    if (string(decision.figmaNodeId, `Frozen component decision ${elementId}.figmaNodeId`, 3) !== figmaNodeId) fail(`Frozen component decision Figma node differs for ${elementId}`);
    return { elementId, selector, figmaNodeId, codePath: repoFile(decision.codePath, `Frozen component decision ${elementId}.codePath`).path };
  });
  if (byId.size !== normalized.length) fail("Frozen component decision manifest has entries outside the checkpoint plan");
  return normalized.sort((a, b) => a.elementId.localeCompare(b.elementId));
}
function frozenScope(gate, scope) {
  const manifest = object(readJson(resolve(root, gate.inputs.manifest.path), "Frozen gate manifest"), "Frozen gate manifest");
  if (manifest.id !== gate.manifestId) fail("Frozen gate manifest id does not match the comparison gate manifestId");
  const rawScope = object(manifest.scope, "Frozen gate manifest scope");
  for (const key of ["implementationActor", "implementationContextId", "implementationIdentity", "implementation"]) {
    if (Object.prototype.hasOwnProperty.call(rawScope, key)) fail(`Frozen gate manifest scope must be shared and identity-free; remove ${key}`);
  }
  const verifyUrl = string(rawScope.verifyUrl, "Frozen gate manifest scope.verifyUrl", 8);
  const checkpointPlan = array(rawScope.checkpointPlan, "Frozen gate manifest scope.checkpointPlan").map((id, index) => string(id, `Frozen gate manifest scope.checkpointPlan[${index}]`));
  const changeTargets = array(rawScope.changeTargets, "Frozen gate manifest scope.changeTargets").map((entry, index) => repoFile(entry, `Frozen gate manifest scope.changeTargets[${index}]`).path);
  const components = object(readJson(resolve(root, gate.inputs.components.path), "Frozen component manifest"), "Frozen component manifest");
  const componentScope = normalizedComponentScope(gate, components);
  exact(checkpointPlan, componentScope.map((component) => component.elementId), "Frozen gate checkpoint plan and component manifest");
  for (const component of componentScope) if (!changeTargets.includes(component.codePath)) fail(`Frozen component ${component.elementId} codePath is outside the frozen changeTargets: ${component.codePath}`);
  const coveragePath = repoFile(rawScope.pageCoveragePath, "Frozen gate manifest scope.pageCoveragePath");
  if (coveragePath.path !== scope.pageCoverage.path) fail("Frozen gate manifest pageCoveragePath does not equal the comparison page coverage");
  const coverage = object(readJson(resolve(root, scope.pageCoverage.path), "Frozen page coverage"), "Frozen page coverage");
  const targetSectionIds = array(coverage.sections, "Frozen page coverage sections").filter((section, index) => object(section, `Frozen page coverage sections[${index}]`).role === "target").map((section, index) => string(section.sectionId, `Frozen page coverage target section[${index}].sectionId`));
  if (!targetSectionIds.length) fail("Frozen page coverage must contain at least one target section");
  return { verifyUrl, checkpointPlan, changeTargets, targetSectionIds, components: componentScope };
}
function sameComponentScope(left, right, label) {
  const normalize = (entries, side) => array(entries, side).map((entry, index) => {
    entry = object(entry, `${side}[${index}]`);
    return { elementId: string(entry.elementId, `${side}[${index}].elementId`), selector: string(entry.selector, `${side}[${index}].selector`, 2), figmaNodeId: string(entry.figmaNodeId, `${side}[${index}].figmaNodeId`, 3), codePath: repoFile(entry.codePath, `${side}[${index}].codePath`).path };
  }).sort((a, b) => a.elementId.localeCompare(b.elementId));
  const a = normalize(left, `${label} declared components`); const b = normalize(right, `${label} frozen components`);
  if (new Set(a.map((entry) => entry.elementId)).size !== a.length || stableHash(a) !== stableHash(b)) fail(`${label} must exactly equal the frozen component selector/code-path scope`);
  return b;
}
function sourcePath(pathname, platform = process.platform) {
  const normalized = string(pathname, "Comparison source path", 1).replace(/\\/g, "/").replace(/^\.\//, "");
  const candidate = p3UsesCaseInsensitivePathComparison(platform) ? normalized.toLowerCase() : normalized;
  return !NON_SOURCE_PREFIXES.some((prefix) => {
    const boundary = p3UsesCaseInsensitivePathComparison(platform) ? prefix.toLowerCase() : prefix;
    return candidate === boundary.slice(0, -1) || candidate.startsWith(boundary);
  });
}
function ignoredRuntimeArtifacts() {
  let output;
  try { output = execFileSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { fail(`Comparison source snapshot could not enumerate ignored worktree artifacts: ${error.stderr?.toString().trim() || error.message}`); }
  return output.split(/\r?\n/).filter((pathname) => pathname && sourcePath(pathname));
}
function assertNoIgnoredRuntimeArtifacts() {
  const paths = ignoredRuntimeArtifacts();
  if (paths.length) fail(`Comparison source snapshot has ignored runtime artifact(s) outside the frozen source boundary: ${paths.join(", ")}`);
}
function gitSourceMatches(commit, literal) {
  const exclusions = NON_SOURCE_PREFIXES.map((prefix) => p3UsesCaseInsensitivePathComparison() ? `:(exclude,icase)${prefix}**` : `:(exclude)${prefix}**`);
  try {
    const output = execFileSync("git", ["grep", "-F", "-l", literal, commit, "--", ".", ...exclusions], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
  } catch (error) {
    if (error.status === 1) return [];
    fail(`Pre-implementation proof could not search the frozen source tree: ${error.stderr?.toString().trim() || error.message}`);
  }
}
function gitTreeHasPath(commit, pathname) {
  try { execFileSync("git", ["cat-file", "-e", `${commit}:${pathname}`], { cwd: root, stdio: "ignore" }); return true; }
  catch { return false; }
}
function worktreeSourceMatch(literal) {
  let output;
  try {
    const visible = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const ignored = execFileSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    output = `${visible}\n${ignored}`;
  }
  catch (error) { fail(`Pre-implementation proof could not enumerate the worktree source: ${error.stderr?.toString().trim() || error.message}`); }
  const needle = Buffer.from(literal);
  for (const pathname of output.split(/\r?\n/).filter(Boolean)) {
    if (!sourcePath(pathname)) continue;
    const absolute = resolve(root, pathname);
    if (existsSync(absolute) && readFileSync(absolute).includes(needle)) return pathname;
  }
  return null;
}
function validatedPreImplementationProof(record, source, gate, scope, label = "Pre-implementation proof") {
  const declaredSource = object(record.sourceSnapshot, `${label} sourceSnapshot`);
  if (oid(declaredSource.commit, `${label} sourceSnapshot.commit`) !== source.git.commit || oid(declaredSource.tree, `${label} sourceSnapshot.tree`) !== source.git.tree || digest(declaredSource.archiveSha256, `${label} sourceSnapshot.archiveSha256`) !== source.archive.sha256) fail(`${label} source snapshot differs from the frozen archive`);
  const declaredScope = object(record.scope, `${label} scope`);
  if (digest(declaredScope.manifestSha256, `${label} scope.manifestSha256`) !== gate.inputs.manifest.sha256 || digest(declaredScope.componentsSha256, `${label} scope.componentsSha256`) !== gate.inputs.components.sha256 || digest(declaredScope.pageCoverageSha256, `${label} scope.pageCoverageSha256`) !== scope.pageCoverage.sha256) fail(`${label} scope inputs differ from the frozen comparison inputs`);
  exact(array(declaredScope.checkpointPlan, `${label} scope.checkpointPlan`), scope.frozen.checkpointPlan, `${label} checkpoint plan`);
  const unimplementedTargetPaths = array(record.unimplementedTargetPaths, `${label} unimplementedTargetPaths`).map((pathname, index) => repoFile(pathname, `${label} unimplementedTargetPaths[${index}]`).path);
  exact(unimplementedTargetPaths, scope.frozen.changeTargets, `${label} unimplemented target paths`);
  for (const target of unimplementedTargetPaths) if (gitTreeHasPath(source.git.commit, target)) fail(`${label} source snapshot already contains implementation target ${target}`);
  const components = sameComponentScope(record.unimplementedComponents, scope.frozen.components, label);
  for (const component of components) {
    const matches = gitSourceMatches(source.git.commit, component.selector);
    if (matches.length) fail(`${label} source snapshot already renders ${component.elementId} selector ${component.selector}: ${matches.join(", ")}`);
  }
  return { components, unimplementedTargetPaths };
}
function preImplementationProof(source, gate, scope) {
  const proof = source.preImplementationProof;
  const record = object(readJson(resolve(root, proof.path), "Pre-implementation proof"), "Pre-implementation proof");
  if (record.version !== 2 || record.status !== "approved" || record.ownerApproved !== true) fail("Comparison source snapshot requires an owner-approved pre-implementation proof version 2");
  const approvedAt = string(record.approvedAt, "Pre-implementation proof approvedAt", 20); if (Number.isNaN(Date.parse(approvedAt))) fail("Pre-implementation proof approvedAt must be an ISO timestamp");
  const { components, unimplementedTargetPaths } = validatedPreImplementationProof(record, source, gate, scope);
  return { record: proof, approvedAt, components, unimplementedTargetPaths };
}
function unimplementedWorktree(preImplementation) {
  for (const target of preImplementation.unimplementedTargetPaths) {
    const file = repoFile(target, `Comparison preflight unimplemented target ${target}`);
    if (existsSync(file.absolute)) fail(`Comparison preflight worktree already contains implementation target ${target}`);
  }
  for (const component of preImplementation.components) {
    const match = worktreeSourceMatch(component.selector);
    if (match) fail(`Comparison preflight worktree already renders ${component.elementId} selector ${component.selector}: ${match}`);
  }
}
function finalChangedSourcePaths(source) {
  let tracked; let untracked;
  try {
    tracked = execFileSync("git", ["diff", "--name-only", "--relative", source.git.commit], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) { fail(`Comparison final change scope could not enumerate the worktree: ${error.stderr?.toString().trim() || error.message}`); }
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).filter((pathname) => pathname && sourcePath(pathname)))].sort();
}
function finalChangeScope(source, scope) {
  assertNoIgnoredRuntimeArtifacts();
  exact(finalChangedSourcePaths(source), scope.changeTargets, "Comparison final Git change scope and frozen change targets");
}
function preImplementationSourceScope(source) {
  const changed = finalChangedSourcePaths(source);
  if (changed.length) fail(`Comparison pair readiness requires no source changes before implementation: ${changed.join(", ")}`);
  return changed;
}
function closeRecord(raw, state, gate, scope) {
  raw = object(raw, "Comparison contract run.close");
  const planned = repoFile(raw.path, "Comparison contract run.close.path"); const stateClose = object(state.closeReport, "Active Figma gate state closeReport");
  const recordedSha256 = digest(stateClose.sha256, "Active Figma gate state closeReport.sha256");
  if (!samePath(string(stateClose.path, "Active Figma gate state closeReport.path"), resolve(root, planned.path)) || !existsSync(resolve(root, planned.path)) || fileHash(resolve(root, planned.path)) !== recordedSha256) fail("Active Figma gate close report does not match the preflight-declared close path and active-state hash");
  const record = { path: planned.path, sha256: recordedSha256 }; const close = object(readJson(resolve(root, record.path), "Comparison close report"), "Comparison close report"); const result = object(close.result, "Comparison close report result");
  if (close.version !== 1 || close.status !== "PASS" || close.manifestId !== gate.manifestId) fail("Comparison close report must be PASS for the frozen manifest");
  for (const key of ["specFail", "layoutFail", "visualFail"]) if (result[key] !== 0) fail(`Comparison close report ${key} must be 0`);
  exact(array(state.benchmark?.plan, "Active Figma gate state benchmark.plan"), scope.checkpointPlan, "Active Figma gate state benchmark.plan");
  exact(array(close.checkpoints, "Comparison close report checkpoints").map((entry, index) => { const checkpoint = object(entry, `Comparison close report checkpoints[${index}]`); if (checkpoint.status !== "PASS") fail("Comparison close report must show PASS for every checkpoint"); return string(checkpoint.elementId, `Comparison close report checkpoints[${index}].elementId`); }), scope.checkpointPlan, "Comparison close report checkpoints");
  exact(Object.keys(object(state.checkpoints, "Active Figma gate state checkpoints")), scope.checkpointPlan, "Active Figma gate state checkpoints");
  exact(array(object(close.coverage, "Comparison close report coverage").targetSectionIds, "Comparison close report coverage.targetSectionIds"), scope.targetSectionIds, "Comparison close report coverage.targetSectionIds");
  const closeHashes = object(close.fileHashes, "Comparison close report fileHashes"); const stateHashes = object(state.fileHashes, "Active Figma gate state fileHashes");
  exact(Object.keys(closeHashes), scope.changeTargets, "Comparison close report fileHashes"); exact(Object.keys(stateHashes), scope.changeTargets, "Active Figma gate state fileHashes"); exact(array(state.changeTargets, "Active Figma gate state changeTargets"), scope.changeTargets, "Active Figma gate state changeTargets");
  for (const target of scope.changeTargets) {
    const closeHash = digest(closeHashes[target], `Comparison close report fileHashes.${target}`); const stateHash = digest(stateHashes[target], `Active Figma gate state fileHashes.${target}`);
    if (closeHash !== stateHash) fail(`Comparison final file hash differs between close report and active state: ${target}`);
    const file = repoFile(target, `Comparison final change target ${target}`); if (!existsSync(file.absolute) || fileHash(file.absolute) !== closeHash) fail(`Comparison final file hash does not match the current file: ${target}`);
  }
  return { record, checkpoints: [...scope.checkpointPlan], targetSectionIds: [...scope.targetSectionIds] };
}
function withoutComments(source) {
  let result = ""; let quote = null;
  for (let index = 0; index < source.length;) {
    const char = source[index]; const next = source[index + 1];
    if (quote) {
      result += char;
      if (char === "\\") { if (next !== undefined) { result += next; index += 2; continue; } }
      else if (char === quote) quote = null;
      index += 1; continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; result += char; index += 1; continue; }
    if (char === "/" && next === "/") { while (index < source.length && source[index] !== "\n") { result += " "; index += 1; } continue; }
    if (char === "/" && next === "*") { result += "  "; index += 2; while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) { result += source[index] === "\n" ? "\n" : " "; index += 1; } if (index < source.length) { result += "  "; index += 2; } continue; }
    result += char; index += 1;
  }
  return result;
}
function literalArgument(source, index, label) {
  while (/\s/.test(source[index] || "")) index += 1;
  const quote = source[index]; if (quote !== "'" && quote !== '"') fail(`${label} has a dynamic import or require; static execution bundle evidence requires a literal module specifier`);
  let value = ""; index += 1;
  while (index < source.length) {
    const char = source[index];
    if (char === quote) { index += 1; while (/\s/.test(source[index] || "")) index += 1; if (source[index] !== ")") fail(`${label} has an unsupported import or require argument list`); return { specifier: value, end: index + 1 }; }
    if (char === "\\") { const escaped = source[index + 1]; if (escaped !== quote && escaped !== "\\") fail(`${label} has an unsupported escaped module specifier`); value += escaped; index += 2; continue; }
    value += char; index += 1;
  }
  fail(`${label} has an unterminated import or require argument`);
}
function callEntries(source, pattern, label, mode) {
  const entries = [];
  for (const match of source.matchAll(pattern)) { const argument = literalArgument(source, match.index + match[0].length, label); entries.push({ specifier: argument.specifier, mode, start: match.index, end: argument.end }); }
  return entries;
}
function skipWhitespace(source, index) { while (/\s/.test(source[index] || "")) index += 1; return index; }
function skipTrivia(source, index, label) {
  for (;;) {
    index = skipWhitespace(source, index);
    if (source[index] === "/" && source[index + 1] === "/") { index += 2; while (index < source.length && source[index] !== "\n") index += 1; continue; }
    if (source[index] === "/" && source[index + 1] === "*") {
      index += 2; while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      if (index >= source.length) fail(`${label} has an unterminated block comment`);
      index += 2; continue;
    }
    return index;
  }
}
function identifier(source, index) {
  const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(index));
  return match ? { value: match[0], end: index + match[0].length } : null;
}
function skipQuoted(source, index, label) {
  const quote = source[index]; let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") { cursor += 2; continue; }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  fail(`${label} has an unterminated string literal`);
}
function skipTemplateExpression(source, index, label) {
  let cursor = index; let depth = 1;
  while (cursor < source.length) {
    const char = source[cursor]; const next = source[cursor + 1];
    if (char === "'" || char === '"') { cursor = skipQuoted(source, cursor, label); continue; }
    if (char === "`") { cursor = skipTemplateLiteral(source, cursor, label); continue; }
    if (char === "/" && next === "/") { cursor += 2; while (cursor < source.length && source[cursor] !== "\n") cursor += 1; continue; }
    if (char === "/" && next === "*") { cursor += 2; while (cursor < source.length && !(source[cursor] === "*" && source[cursor + 1] === "/")) cursor += 1; if (cursor >= source.length) fail(`${label} has an unterminated template-expression comment`); cursor += 2; continue; }
    if (char === "{") { depth += 1; cursor += 1; continue; }
    if (char === "}") { depth -= 1; cursor += 1; if (!depth) return cursor; continue; }
    const token = identifier(source, cursor);
    if (token) {
      if (token.value === "require" || token.value === "module") fail(`${label} has a template-literal module loader; static execution bundle evidence requires a direct literal module call`);
      cursor = token.end; continue;
    }
    cursor += 1;
  }
  fail(`${label} has an unterminated template expression`);
}
function skipTemplateLiteral(source, index, label) {
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") { cursor += 2; continue; }
    if (char === "`") return cursor + 1;
    if (char === "$" && source[cursor + 1] === "{") { cursor = skipTemplateExpression(source, cursor + 2, label); continue; }
    cursor += 1;
  }
  fail(`${label} has an unterminated template literal`);
}
function previousNonWhitespace(source, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) if (!/\s/.test(source[cursor])) return source[cursor];
  return null;
}
function regexLiteralStart(source, index) {
  const previous = previousNonWhitespace(source, index);
  if (previous === null || "([{:;,=!?&|+-*%^~<>".includes(previous)) return true;
  const before = source.slice(0, index);
  const word = /([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(before)?.[1];
  return ["return", "throw", "case", "delete", "void", "typeof", "new", "in", "of", "yield", "await"].includes(word);
}
function skipRegexLiteral(source, index, label) {
  let cursor = index + 1; let characterClass = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") { cursor += 2; continue; }
    if (char === "[") { characterClass = true; cursor += 1; continue; }
    if (char === "]") { characterClass = false; cursor += 1; continue; }
    if (char === "/" && !characterClass) { cursor += 1; while (/[A-Za-z]/.test(source[cursor] || "")) cursor += 1; return cursor; }
    if (char === "\n" || char === "\r") fail(`${label} has an unterminated regular-expression literal`);
    cursor += 1;
  }
  fail(`${label} has an unterminated regular-expression literal`);
}
function assertDirectRequirePropertyPolicy(specifier, property, label) {
  // A direct property of a literal require remains statically attributable to
  // that literal module.  `process`, however, exposes loader primitives that
  // can be aliased and invoked later, beyond the parser's import closure.
  // `module`/`node:module` are loader APIs in their entirety.  Do not let the
  // narrow property compatibility exception reopen either route.
  if (["process", "node:process"].includes(specifier) && ["getBuiltinModule", "binding", "mainModule", "dlopen"].includes(property)) fail(`${label} has a forbidden direct runtime loader property ${specifier}.${property}; static execution bundle evidence requires no dynamic loader API outside the trusted P-3 resolver`);
  if (["module", "node:module"].includes(specifier)) fail(`${label} has a forbidden direct runtime loader property ${specifier}.${property}; static execution bundle evidence requires no dynamic loader API outside the trusted P-3 resolver`);
}
function directRequireCall(source, start, afterRequire, label, allowStaticProperty = true) {
  let cursor = skipWhitespace(source, afterRequire);
  let resolveCall = false;
  if (source[cursor] === ".") {
    cursor = skipWhitespace(source, cursor + 1); const property = identifier(source, cursor);
    if (!property || property.value !== "resolve") return null;
    resolveCall = true;
    cursor = skipWhitespace(source, property.end);
  }
  if (source[cursor] !== "(") return null;
  const argument = literalArgument(source, cursor + 1, label); const next = skipTrivia(source, argument.end, label);
  if (source.slice(next, next + 2) === "?." || source[next] === "[") fail(`${label} has an indirect require result; static execution bundle evidence requires a direct literal module call`);
  if (source[next] === ".") {
    if (!allowStaticProperty || resolveCall) fail(`${label} has an indirect require result; static execution bundle evidence requires a direct literal module call`);
    const property = identifier(source, skipTrivia(source, next + 1, label));
    if (!property) fail(`${label} has an indirect require result; static execution bundle evidence requires a direct literal module call`);
    assertDirectRequirePropertyPolicy(argument.specifier, property.value, label);
    const afterProperty = skipTrivia(source, property.end, label);
    // A single named property of a direct literal require is static too (for
    // example require("assert").ok).  Do not permit a chain, bracket access,
    // optional chaining, direct invocation, or a constructor escape because
    // those would turn this narrow exception back into runtime code/loading.
    if (property.value === "constructor" || source[afterProperty] === "." || source[afterProperty] === "[" || source[afterProperty] === "(" || source[afterProperty] === "`" || source.slice(afterProperty, afterProperty + 2) === "?.") fail(`${label} has an indirect require result; static execution bundle evidence requires a direct literal module call`);
    return { specifier: argument.specifier, mode: "require", start, end: property.end };
  }
  return { specifier: argument.specifier, mode: "require", start, end: argument.end };
}
function cjsSpecifiers(source, label) {
  const entries = [];
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (char === "/" && source[index + 1] === "/") { index += 2; while (index < source.length && source[index] !== "\n") index += 1; continue; }
    if (char === "/" && source[index + 1] === "*") { index += 2; while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1; if (index >= source.length) fail(`${label} has an unterminated block comment`); index += 2; continue; }
    if (char === "'" || char === '"') { index = skipQuoted(source, index, label); continue; }
    if (char === "`") { index = skipTemplateLiteral(source, index, label); continue; }
    if (char === "/" && source[index + 1] !== "/" && source[index + 1] !== "*" && regexLiteralStart(source, index)) { index = skipRegexLiteral(source, index, label); continue; }
    const token = identifier(source, index);
    if (!token) { index += 1; continue; }
    if (token.value === "require") {
      const previous = previousNonWhitespace(source, index);
      if (previous === "." || previous === "?" || previous === "]" || previous === ")" || previous === "}") fail(`${label} aliases or indirectly references require; static execution bundle evidence requires a direct literal module call`);
      const call = directRequireCall(source, index, token.end, label);
      if (!call) fail(`${label} aliases or indirectly references require; static execution bundle evidence requires a direct literal module call`);
      entries.push(call); index = call.end; continue;
    }
    if (token.value === "module") {
      let cursor = skipWhitespace(source, token.end);
      if (source[cursor] !== ".") fail(`${label} aliases or indirectly references module; static execution bundle evidence requires a direct literal module call`);
      cursor = skipWhitespace(source, cursor + 1); const property = identifier(source, cursor);
      if (!property) fail(`${label} aliases or indirectly references module; static execution bundle evidence requires a direct literal module call`);
      if (property.value === "exports") { index = property.end; continue; }
      if (property.value !== "require") fail(`${label} aliases or indirectly references module; static execution bundle evidence requires a direct literal module call`);
      const call = directRequireCall(source, token.start ?? index, property.end, label, false);
      if (!call) fail(`${label} aliases or indirectly references require; static execution bundle evidence requires a direct literal module call`);
      entries.push(call); index = call.end; continue;
    }
    index = token.end;
  }
  return entries;
}
function assertStaticLoaderPolicy(pathname, source) {
  // fidelity-benchmark itself is the deliberately small trusted computing base:
  // it uses createRequire only to resolve a dependency that this very verifier
  // immediately hashes. Every other evaluator dependency must be statically
  // closed; runtime loaders would make the execution bundle incomplete.
  if (samePath(pathname, resolve(root, P3_TRUSTED_RESOLVER_PATH))) return;
  const label = `Comparison evaluator ${relative(root, pathname).replace(/\\/g, "/")}`;
  const code = withoutComments(source);
  const forbidden = [
    [/\beval\s*\(/, "eval"],
    [/\b(?:new\s+)?Function\s*\(/, "Function constructor"],
    [/\b(?:AsyncFunction|GeneratorFunction|AsyncGeneratorFunction)\s*\(/, "dynamic function constructor"],
    [/\bcreateRequire\s*\(/, "createRequire"],
    [/\bprocess\s*\.\s*(?:getBuiltinModule|mainModule|binding|dlopen)\b/, "process runtime module loader"],
    [/\b(?:module|Module)\s*\.\s*(?:constructor|_load|register|registerHooks)\b/, "Module runtime loader"],
    [/\b(?:require|module)\s*\.\s*(?:cache|extensions)\b/, "mutable CommonJS loader state"],
    [/\.constructor\s*\.\s*constructor\b/, "constructor-based dynamic code loader"],
    [/\b(?:globalThis|global|process|module)\s*\[/, "bracket-based runtime loader lookup"],
    [/\bReflect\s*\.\s*get\s*\(/, "Reflect runtime loader lookup"],
    [/\b(?:new\s+)?Worker\s*\(/, "worker runtime loader"],
    [/\bimport\s*\.\s*meta\s*\.\s*resolve\b/, "runtime import resolver"],
  ];
  for (const [pattern, name] of forbidden) if (pattern.test(code)) fail(`${label} uses forbidden ${name}; static execution bundle evidence requires no dynamic loader API outside the trusted P-3 resolver`);
}
function assertStaticBuiltinPolicy(pathname, specifier, label) {
  if (samePath(pathname, resolve(root, P3_TRUSTED_RESOLVER_PATH))) return;
  if (["node:module", "module", "node:vm", "vm", "node:worker_threads", "worker_threads"].includes(specifier)) fail(`${label} imports forbidden runtime loader builtin ${specifier}; static execution bundle evidence requires no dynamic loader API outside the trusted P-3 resolver`);
}
function importSpecifiers(pathname) {
  const label = `Comparison evaluator ${relative(root, pathname).replace(/\\/g, "/")}`; const rawSource = readFileSync(pathname, "utf8"); const source = withoutComments(rawSource); assertStaticLoaderPolicy(pathname, rawSource); const entries = [];
  const patterns = [/\bimport\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g, /\bexport\s+(?:[^'";]*?\s+from\s+)["']([^"']+)["']/g];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) entries.push({ specifier: match[1], mode: "import" });
  entries.push(...callEntries(source, /\bimport\s*\(/g, label, "import"));
  // fidelity-benchmark.mjs is the explicitly frozen resolver TCB. It uses
  // Node resolver primitives itself, so its own source is bound by the root
  // SHA/baseline/J bundle rather than by the closure's CJS-loader policy.
  // Native .mjs modules have no CommonJS require/module bindings. Scanning
  // them as CommonJS both adds no executable dependency information and can
  // misread valid ESM regular expressions/templates. CJS closure analysis is
  // therefore limited to non-.mjs files; createRequire is separately banned
  // in every non-TCB evaluator dependency.
  if (!samePath(pathname, resolve(root, P3_TRUSTED_RESOLVER_PATH)) && !pathname.toLowerCase().endsWith(".mjs")) entries.push(...cjsSpecifiers(rawSource, label));
  const unique = new Map(); for (const entry of entries) unique.set(`${entry.mode}\\u0000${entry.specifier}`, { specifier: entry.specifier, mode: entry.mode }); return [...unique.values()];
}
function resolveEsmSpecifier(fromPath, specifier) {
  const resolver = "console.log(import.meta.resolve(process.argv[2], process.argv[1]));";
  const output = execFileSync(process.execPath, ["--experimental-import-meta-resolve", "--input-type=module", "--eval", resolver, pathToFileURL(fromPath).href, specifier], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: sanitizedNodeEnvironment() }).trim();
  if (!output.startsWith("file:")) throw new Error(`ESM import did not resolve to a file URL: ${output}`);
  return fileURLToPath(output);
}
function resolveSpecifier(fromPath, specifier, mode, label) {
  try { return mode === "import" ? resolveEsmSpecifier(fromPath, specifier) : createRequire(pathToFileURL(fromPath)).resolve(specifier); }
  catch (error) { fail(`${label} cannot resolve ${mode} ${specifier}: ${error.stderr?.toString().trim() || error.message}`); }
}
function localImport(pathname, specifier, mode, label) {
  const resolved = resolveSpecifier(pathname, specifier, mode, label);
  if (!resolved || !inside(root, resolved) || !existsSync(resolved) || !statSync(resolved).isFile()) fail(`${label} has an unresolved or out-of-repository local ${mode}: ${specifier}`);
  if (resolved.endsWith(".node")) fail(`${label} resolves a native addon; static execution bundle evidence requires JavaScript-only dependencies`);
  return resolved;
}
function packageRecord(fromPath, specifier, mode) {
  const resolved = resolveSpecifier(fromPath, specifier, mode, "Comparison evaluator");
  if (!inside(root, resolved)) fail(`Comparison evaluator bare import resolves outside the worktree: ${specifier}`);
  if (resolved.endsWith(".node")) fail(`Comparison evaluator bare import resolves a native addon: ${specifier}`);
  let directory = dirname(resolved); let packagePath = null;
  while (inside(root, directory)) { const candidate = resolve(directory, "package.json"); if (existsSync(candidate)) { packagePath = candidate; break; } const parent = dirname(directory); if (parent === directory) break; directory = parent; }
  if (!packagePath) fail(`Comparison evaluator bare import has no package.json: ${specifier}`);
  const packageJson = object(readJson(packagePath, `Comparison evaluator package ${specifier}`), `Comparison evaluator package ${specifier}`); const packageJsonPath = relative(root, packagePath).replace(/\\/g, "/");
  if (!packageJsonPath.startsWith("node_modules/") || !packageJsonPath.endsWith("/package.json")) fail(`Comparison evaluator bare import package is not a worktree node_modules package: ${specifier}`);
  return { fromPath: relative(root, fromPath).replace(/\\/g, "/"), mode, specifier, resolvedPath: relative(root, resolved).replace(/\\/g, "/"), resolvedSha256: fileHash(resolved), packageJsonPath, packageJsonSha256: fileHash(packagePath), lockKey: packageJsonPath.slice(0, -"/package.json".length), version: string(packageJson.version, `Comparison evaluator package ${specifier} version`) };
}
function gateRuntimeArtifactPaths() {
  const source = readFileSync(resolve(root, CANONICAL_GATE_PATH), "utf8"); const found = new Set();
  const pattern = /["'](MyBrain\/verify\/[A-Za-z0-9._-]+\.(?:mjs|json))["']/g;
  for (const match of source.matchAll(pattern)) found.add(match[1]);
  return [...found].sort();
}
function validatedEvaluatorBaseline(document, roots, label = "Comparison evaluator baseline record") {
  const basis = string(document.basis, `${label} basis`, 20); const artifacts = array(document.artifacts, `${label} artifacts`); const baselineRoots = {};
  for (const [index, rawArtifact] of artifacts.entries()) { const artifact = object(rawArtifact, `${label} artifacts[${index}]`); const key = string(artifact.key, `${label} artifacts[${index}].key`); if (!EVAL.includes(key)) fail(`${label} has unsupported artifact ${key}`); if (baselineRoots[key]) fail(`${label} duplicates artifact ${key}`); baselineRoots[key] = { path: repoFile(artifact.path, `${label} artifacts[${index}].path`).path, sha256: digest(artifact.sha256, `${label} artifacts[${index}].sha256`) }; }
  if (Object.keys(baselineRoots).length !== EVAL.length || EVAL.some((key) => !baselineRoots[key])) fail(`${label} must enumerate every canonical evaluator artifact`);
  if (stableHash(baselineRoots) !== stableHash(roots)) fail(`${label} artifacts differ from the frozen canonical evaluators`);
  return { basis };
}
function evaluatorBaseline(raw, roots) {
  const record = frozen(raw, "Comparison contract shared.evaluator.baselineRecord"); const document = object(readJson(resolve(root, record.path), "Comparison evaluator baseline record"), "Comparison evaluator baseline record");
  if (document.version !== 2 || document.status !== "approved" || document.ownerApproved !== true) fail("Comparison evaluator baseline record must be owner-approved version 2");
  const approvedAt = string(document.approvedAt, "Comparison evaluator baseline record approvedAt", 20); if (Number.isNaN(Date.parse(approvedAt))) fail("Comparison evaluator baseline record approvedAt must be an ISO timestamp");
  const { basis } = validatedEvaluatorBaseline(document, roots);
  return { record, document, approvedAt, basis };
}
function evaluatorExecutionBundle(evidence) {
  return {
    version: 1,
    canonicalRoots: EVAL.map((key) => ({ key, ...evidence.roots[key] })),
    gateRuntimeArtifacts: evidence.runtimeArtifacts.map((pathname) => {
      const key = EVAL.find((candidate) => CANONICAL_EVALUATOR_PATHS[candidate] === pathname);
      if (!key) fail(`Comparison figma-gate runtime artifact ${pathname} has no canonical evaluator declaration`);
      return { key, ...evidence.roots[key] };
    }),
    staticImportClosure: evidence.closure,
    packageLock: evidence.packageLock,
    resolvedBarePackages: evidence.packages,
  };
}
function evaluatorFoundation(raw) {
  raw = object(raw, "Comparison contract shared.evaluator"); const roots = {}; for (const key of EVAL) roots[key] = frozen(raw[key], `Comparison contract shared.evaluator.${key}`);
  for (const key of EVAL) if (roots[key].path !== CANONICAL_EVALUATOR_PATHS[key]) fail(`Comparison ${key} must use the canonical installed artifact ${CANONICAL_EVALUATOR_PATHS[key]}`);
  const packageLock = frozen(raw.packageLock, "Comparison contract shared.evaluator.packageLock"); if (packageLock.path !== "package-lock.json") fail("Comparison evaluator packageLock must be the repository package-lock.json"); const lock = object(readJson(resolve(root, packageLock.path), "Comparison evaluator package lock"), "Comparison evaluator package lock");
  if (!Number.isInteger(lock.lockfileVersion) || lock.lockfileVersion < 2) fail("Comparison evaluator package lock must be an npm lockfile version 2 or later"); const lockedPackages = object(lock.packages, "Comparison evaluator package lock packages");
  for (const key of Object.keys(raw)) if (!EVAL.includes(key) && key !== "packageLock" && key !== "baselineRecord") fail(`Comparison contract shared.evaluator has unsupported entry ${key}`);
  const runtimeArtifacts = gateRuntimeArtifactPaths(); for (const pathname of runtimeArtifacts) { const key = EVAL.find((candidate) => CANONICAL_EVALUATOR_PATHS[candidate] === pathname); if (!key) fail(`Comparison figma-gate runtime artifact ${pathname} has no canonical evaluator declaration`); if (roots[key].path !== pathname) fail(`Comparison figma-gate runtime artifact ${pathname} is not declared frozen`); }
  const done = new Map(); const packages = new Map(); const queue = Object.values(roots).filter((entry) => entry.path.endsWith(".mjs")).map((entry) => resolve(root, entry.path));
  while (queue.length) { const pathname = queue.pop(); const relativePath = relative(root, pathname).replace(/\\/g, "/"); if (done.has(relativePath)) continue; if (!existsSync(pathname)) fail(`Comparison evaluator dependency does not exist: ${relativePath}`); done.set(relativePath, { path: relativePath, sha256: fileHash(pathname) }); for (const entry of importSpecifiers(pathname)) { assertStaticBuiltinPolicy(pathname, entry.specifier, `Comparison evaluator ${relativePath}`); if (entry.specifier.startsWith(".")) queue.push(localImport(pathname, entry.specifier, entry.mode, `Comparison evaluator ${relativePath}`)); else if (isBuiltin(entry.specifier)) continue; else if (entry.specifier.startsWith("node:")) fail(`Comparison evaluator has an unknown Node builtin import: ${entry.specifier}`); else { const pkg = packageRecord(pathname, entry.specifier, entry.mode); packages.set(`${pkg.fromPath}\\u0000${entry.mode}\\u0000${entry.specifier}\\u0000${pkg.resolvedPath}`, pkg); queue.push(resolve(root, pkg.resolvedPath)); } } }
  const resolvedPackages = [...packages.values()].sort((a, b) => a.fromPath.localeCompare(b.fromPath) || a.specifier.localeCompare(b.specifier) || a.mode.localeCompare(b.mode) || a.resolvedPath.localeCompare(b.resolvedPath));
  for (const entry of resolvedPackages) { const locked = object(lockedPackages[entry.lockKey], `Comparison evaluator package lock packages.${entry.lockKey}`); if (string(locked.version, `Comparison evaluator package lock packages.${entry.lockKey}.version`) !== entry.version) fail(`Comparison evaluator package lock version does not match resolved ${entry.specifier}`); }
  const evidence = { roots, runtimeArtifacts, packageLock, closure: [...done.values()].sort((a, b) => a.path.localeCompare(b.path)), packages: resolvedPackages };
  evidence.executionBundleSha256 = stableHash(evaluatorExecutionBundle(evidence));
  return evidence;
}
function evaluator(raw) {
  const evidence = evaluatorFoundation(raw); const baseline = evaluatorBaseline(raw.baselineRecord, evidence.roots); evidence.baseline = baseline;
  if (digest(baseline.document.executionBundleSha256, "Comparison evaluator baseline record executionBundleSha256") !== evidence.executionBundleSha256) fail("Comparison evaluator baseline record execution bundle differs from the frozen canonical evaluators");
  return evidence;
}
function draftCandidateRecord(argument, label) {
  const file = repoFile(argument, `${label} path`);
  if (!isDraftPath(file.path)) fail(`${label} must be a p3-drafts artifact`);
  const document = object(readJson(file.absolute, label), label);
  if (document.version !== 2 || document.status !== "draft" || document.ownerApproved !== false) fail(`${label} must be a version 2 draft record with ownerApproved false`);
  return { record: { path: file.path, sha256: fileHash(file.absolute) }, document };
}
function declaredDraftCandidate(declared, candidate, label) {
  const frozenRecord = frozen(declared, label);
  if (!isDraftPath(frozenRecord.path)) fail(`${label} must reference a p3-drafts artifact`);
  if (frozenRecord.path !== candidate.record.path || frozenRecord.sha256 !== candidate.record.sha256) fail(`${label} must exactly match its explicit draft candidate`);
  return frozenRecord;
}
function draftPreImplementationProof(candidate, source, gate, scope) {
  const { components, unimplementedTargetPaths } = validatedPreImplementationProof(candidate.document, source, gate, scope, "P-3 decision candidate pre-implementation proof");
  return { record: candidate.record, components, unimplementedTargetPaths };
}
function draftEvaluatorBaseline(candidate, roots) {
  const { basis } = validatedEvaluatorBaseline(candidate.document, roots, "P-3 decision candidate evaluator baseline");
  return { record: candidate.record, document: candidate.document, basis };
}
function candidateEvaluator(raw, candidate) {
  const evidence = evaluatorFoundation(raw);
  declaredDraftCandidate(raw.baselineRecord, candidate, "Comparison contract shared.evaluator.baselineRecord");
  const baseline = draftEvaluatorBaseline(candidate, evidence.roots);
  if (digest(baseline.document.executionBundleSha256, "P-3 decision candidate evaluator baseline executionBundleSha256") !== evidence.executionBundleSha256) fail("P-3 decision candidate evaluator baseline execution bundle differs from the frozen canonical evaluators");
  evidence.baseline = baseline;
  return evidence;
}
function canonicalGate(evaluatorEvidence) {
  const entry = evaluatorEvidence.roots.figmaGate;
  if (entry.path !== CANONICAL_GATE_PATH) fail(`Comparison figma-gate must use the canonical installed entry ${CANONICAL_GATE_PATH}`);
  return resolve(root, CANONICAL_GATE_PATH);
}
function gateRuntime(state, evaluatorEvidence) {
  const runtime = object(state.runtime, "Active Figma gate runtime evidence");
  const entry = canonicalGate(evaluatorEvidence);
  if (!samePath(string(runtime.entryPath, "Active Figma gate runtime entryPath", 3), entry)) fail("Active Figma gate runtime entry is not the canonical installed figma-gate");
  if (digest(runtime.entrySha256, "Active Figma gate runtime entrySha256") !== evaluatorEvidence.roots.figmaGate.sha256) fail("Active Figma gate runtime hash does not match the frozen canonical figma-gate");
  return { entryPath: canonical(entry), entrySha256: evaluatorEvidence.roots.figmaGate.sha256 };
}
function preflightInstance(state, evaluatorEvidence) {
  const id = string(state.preflightId, "Active Figma gate preflightId", 36).toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) fail("Active Figma gate preflightId must be a UUID");
  const at = string(state.preflightAt, "Active Figma gate preflightAt", 20);
  if (Number.isNaN(Date.parse(at))) fail("Active Figma gate preflightAt must be an ISO timestamp");
  return { id, at, runtime: gateRuntime(state, evaluatorEvidence) };
}function recorded(pathname, sha256, label) { const resolved = isAbsolute(pathname) ? normalize(pathname) : resolve(root, pathname); if (!inside(root, resolved) || !existsSync(resolved) || fileHash(resolved) !== digest(sha256, `${label} SHA-256`)) fail(`${label} is missing, outside the worktree, or changed after figma-gate recorded it`); return resolved; }
function hermeticNetworkEvidence(raw, expectedProvider, scope, elementId) {
  const network = object(raw, `Active Figma gate checkpoint ${elementId} P-3 CDP network evidence`);
  if (network.version !== 1 || network.kind !== "p3-hermetic-network-v1") fail(`Active Figma gate checkpoint ${elementId} lacks P-3 hermetic CDP network evidence`);
  const origin = new URL(scope.verifyUrl).origin;
  if (string(network.expectedOrigin, `Active Figma gate checkpoint ${elementId} network expectedOrigin`, 8) !== origin) fail(`Active Figma gate checkpoint ${elementId} P-3 network evidence has a different provider origin`);
  const controls = object(network.controls, `Active Figma gate checkpoint ${elementId} P-3 network controls`);
  if (controls.cacheDisabled !== true || controls.bypassServiceWorker !== true) fail(`Active Figma gate checkpoint ${elementId} P-3 network evidence did not disable cache and service workers`);
  const headers = object(network.providerHeaders, `Active Figma gate checkpoint ${elementId} P-3 provider response headers`);
  if (string(headers.providerMarker, `Active Figma gate checkpoint ${elementId} P-3 provider marker`, 64).toLowerCase() !== expectedProvider.marker || digest(headers.entrySha256, `Active Figma gate checkpoint ${elementId} P-3 provider entry SHA-256`) !== expectedProvider.entrySha256 || digest(headers.bundleMerkleRoot, `Active Figma gate checkpoint ${elementId} P-3 provider bundle SHA-256`) !== expectedProvider.bundleMerkleRoot) fail(`Active Figma gate checkpoint ${elementId} P-3 response headers differ from the frozen provider bundle`);
  const requiredPhases = ["q09-layout", "q09-capture", "q13-accessibility", "q08-motion"];
  const phases = array(network.phases, `Active Figma gate checkpoint ${elementId} P-3 network phases`);
  exact(phases.map((phase, index) => string(object(phase, `Active Figma gate checkpoint ${elementId} P-3 network phases[${index}]`).id, `Active Figma gate checkpoint ${elementId} P-3 network phase id`)), requiredPhases, `Active Figma gate checkpoint ${elementId} P-3 network phase plan`);
  const normalizedPhases = phases.map((value, index) => {
    const phase = object(value, `Active Figma gate checkpoint ${elementId} P-3 network phase ${requiredPhases[index]}`);
    if (!Number.isFinite(phase.startedAtEpochMs) || !Number.isFinite(phase.endedAtEpochMs) || phase.startedAtEpochMs > phase.endedAtEpochMs) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} has invalid timestamps`);
    if (array(phase.webSockets, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} webSockets`).length) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} contains WebSocket traffic`);
    const resources = array(phase.resources, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} resources`);
    const documents = array(phase.documentResponses, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} document responses`);
    if (!resources.length || !documents.length) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} lacks a provider document response`);
    let documentResources = 0;
    for (const [resourceIndex, value] of resources.entries()) {
      const resource = object(value, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} resource ${resourceIndex}`);
      const requestUrl = string(resource.url, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} request URL`, 1); let request;
      try { request = new URL(requestUrl); } catch { fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} has an invalid request URL`); }
      if (request.protocol !== "data:" && request.origin !== origin) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} measured an external request: ${requestUrl}`);
      if (resource.completion !== "finished") fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} resource did not finish`);
      if (request.protocol === "data:") continue;
      const response = object(resource.response, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} response`);
      const responseUrl = string(response.url, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} response URL`, 1); let responseLocation;
      try { responseLocation = new URL(responseUrl); } catch { fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} has an invalid response URL`); }
      if (responseLocation.origin !== origin || !Number.isFinite(response.status) || response.status < 200 || response.status >= 300 || response.fromDiskCache === true || response.fromServiceWorker === true || response.fromPrefetchCache === true) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} resource is not a direct successful provider response`);
      const responseHeaders = object(response.headers, `Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} response headers`);
      if (string(responseHeaders["x-figma-p3-provider"], `Active Figma gate checkpoint ${elementId} P-3 network provider response header`, 64).toLowerCase() !== expectedProvider.marker || digest(responseHeaders["x-figma-p3-entry-sha256"], `Active Figma gate checkpoint ${elementId} P-3 network entry response header`) !== expectedProvider.entrySha256 || digest(responseHeaders["x-figma-p3-bundle-sha256"], `Active Figma gate checkpoint ${elementId} P-3 network bundle response header`) !== expectedProvider.bundleMerkleRoot) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} response headers differ from the frozen provider bundle`);
      if (resource.resourceType === "Document") {
        if (request.href !== scope.verifyUrl || responseLocation.href !== scope.verifyUrl) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} measured a different document URL`);
        documentResources += 1;
      }
    }
    if (documentResources !== documents.length) fail(`Active Figma gate checkpoint ${elementId} P-3 network phase ${phase.id} document response list does not match traced document resources`);
    return phase;
  });
  return { version: network.version, kind: network.kind, expectedOrigin: origin, controls: { cacheDisabled: true, bypassServiceWorker: true }, providerHeaders: { providerMarker: expectedProvider.marker, entrySha256: expectedProvider.entrySha256, bundleMerkleRoot: expectedProvider.bundleMerkleRoot }, phases: normalizedPhases };
}
function validateHermeticPageIdentity(summary, expectedProvider, scope, elementId) {
  const page = object(summary.pageIdentity, `Active Figma gate checkpoint ${elementId} page identity`);
  if (string(page.loadedUrl, `Active Figma gate checkpoint ${elementId} page identity loadedUrl`, 8) !== scope.verifyUrl) fail(`Active Figma gate checkpoint ${elementId} did not measure the P-3-owned hermetic page provider URL`);
  const origin = new URL(scope.verifyUrl).origin;
  const resources = array(page.resourceUrls, `Active Figma gate checkpoint ${elementId} page identity resourceUrls`).map((value, index) => string(value, `Active Figma gate checkpoint ${elementId} page identity resourceUrls[${index}]`, 1));
  if (new Set(resources).size !== resources.length || resources.join("\n") !== [...resources].sort().join("\n")) fail(`Active Figma gate checkpoint ${elementId} page identity resourceUrls must be unique and sorted`);
  for (const resource of resources) {
    if (resource.startsWith("data:")) continue;
    let url;
    try { url = new URL(resource); }
    catch { fail(`Active Figma gate checkpoint ${elementId} page identity has an invalid resource URL`); }
    if (url.origin !== origin) fail(`Active Figma gate checkpoint ${elementId} measured a resource outside the P-3-owned hermetic provider: ${resource}`);
  }
  const network = hermeticNetworkEvidence(page.network, expectedProvider, scope, elementId);
  return { documentHtmlSha256: digest(page.documentHtmlSha256, `Active Figma gate checkpoint ${elementId} page identity documentHtmlSha256`), resourceUrls: resources, network };
}
function chromeMeasurements(state, policyRaw, scope, expectedProvider = null) {
  const policy = chromePolicy(policyRaw, "Comparison contract shared.environment.chrome");
  const checkpoints = object(state.checkpoints, "Active Figma gate state checkpoints"); const output = []; const usedSummaries = new Set(); let fingerprint = null;
  for (const elementId of scope.checkpointPlan) {
    const checkpoint = object(checkpoints[elementId], `Active Figma gate checkpoint ${elementId}`);
    const evidence = object(checkpoint.batchEvidence, `Active Figma gate checkpoint ${elementId} batch evidence`);
    const summaryPath = recorded(string(evidence.batchSummaryPath, `Active Figma gate checkpoint ${elementId} batch summary path`, 3), evidence.batchSummarySha256, `Active Figma gate checkpoint ${elementId} batch summary`);
    const summaryKey = canonical(summaryPath); if (usedSummaries.has(summaryKey)) fail(`Active Figma gate checkpoint ${elementId} reuses a browser batch summary from another checkpoint`); usedSummaries.add(summaryKey);
    const summary = object(readJson(summaryPath, `Active Figma gate checkpoint ${elementId} batch summary`), `Active Figma gate checkpoint ${elementId} batch summary`);
    if (summary.version !== 1 || summary.status !== "PASS" || summary.url !== scope.verifyUrl || summary.browserSessionId !== evidence.browserSessionId || Number(summary.browserPid) !== Number(evidence.browserPid) || summary.nodeVersion !== process.version) fail(`Active Figma gate checkpoint ${elementId} batch summary is not the recorded PASS CDP measurement for the frozen verifyUrl`);
    if (expectedProvider && (summary.p3Hermetic !== true || summary.checkpointElementId !== elementId || summary.preflightId !== state.preflightId)) fail(`Active Figma gate checkpoint ${elementId} browser batch does not bind this exact P-3 preflight and checkpoint`);
    const browser = object(summary.browser, `Active Figma gate checkpoint ${elementId} CDP Browser.getVersion evidence`);
    const observed = { source: browser.source };
    for (const field of policy.fields) observed[field] = browser[field];
    const measured = chromeFingerprint(observed, `Active Figma gate checkpoint ${elementId} CDP Browser.getVersion evidence`);
    if (measured.source !== policy.source) fail(`Active Figma gate checkpoint ${elementId} Chrome fingerprint source does not match the frozen policy`);
    if (fingerprint && !p3ChromeFingerprintsEqual(fingerprint, measured)) fail(`Comparison Chrome fingerprint changed between final batches at checkpoint ${elementId}`);
    fingerprint ??= measured;
    for (const kind of ["layout", "accessibility", "motion"]) {
      const batch = object(summary[kind], `Active Figma gate checkpoint ${elementId} ${kind} batch evidence`);
      if (batch.browserSessionId !== summary.browserSessionId || Number(batch.browserPid) !== Number(summary.browserPid)) fail(`Active Figma gate checkpoint ${elementId} ${kind} did not use the measured Q-09/Q-13/Q-08 CDP session`);
    }
    const pageIdentity = expectedProvider ? validateHermeticPageIdentity(summary, expectedProvider, scope, elementId) : null;
    output.push({ elementId, summaryPath: relative(root, summaryPath).replace(/\\/g, "/"), summarySha256: evidence.batchSummarySha256, browserSessionId: summary.browserSessionId, browserPid: summary.browserPid, pageIdentity, ...measured });
  }
  if (!fingerprint) fail("Comparison Chrome fingerprint requires at least one final batch summary");
  return { measurements: output, fingerprint };
}
function hermeticPageProvider(raw, scope) {
  raw = object(raw, "Comparison contract shared.pageProvider");
  if (raw.kind !== "hermetic-static-v1") fail("Comparison P-3 page provider must use kind hermetic-static-v1; dynamic and pre-existing servers are not comparison evidence");
  const output = repoFile(raw.outputRoot, "Comparison contract shared.pageProvider.outputRoot");
  if (!sourcePath(output.path) || output.path === "" || output.path === ".") fail("Comparison hermetic page provider outputRoot must be a real source-side descendant, not MyBrain, .figma-gate, or node_modules");
  const entryPath = string(raw.entryPath, "Comparison contract shared.pageProvider.entryPath", 1).replace(/\\/g, "/");
  if (entryPath.startsWith("/") || entryPath.split("/").some((part) => !part || part === "." || part === "..")) fail("Comparison hermetic page provider entryPath must be output-root-relative without traversal");
  if (!/\.html?$/i.test(entryPath)) fail("Comparison hermetic page provider entryPath must be an HTML document so P-3 can bind response-header provider evidence");
  const targetPaths = [...scope.changeTargets].sort();
  if (!targetPaths.length || targetPaths.some((pathname) => !inside(output.absolute, resolve(root, pathname)) || samePath(output.absolute, resolve(root, pathname)))) {
    fail("Comparison hermetic page provider outputRoot must contain every frozen changeTarget and no target may be the outputRoot itself");
  }
  const entry = repoFile(`${output.path}/${entryPath}`, "Comparison hermetic page provider entry file");
  if (!targetPaths.some((pathname) => samePath(resolve(root, pathname), entry.absolute))) {
    fail("Comparison hermetic page provider entry file must be one of the frozen changeTargets");
  }
  let verify;
  try { verify = new URL(scope.verifyUrl); }
  catch { fail("Comparison hermetic page provider requires a valid frozen verifyUrl"); }
  if (verify.protocol !== "http:" || verify.hostname !== "127.0.0.1" || !verify.port || verify.username || verify.password || verify.hash || scope.verifyUrl !== verify.href) fail("Comparison hermetic page provider requires the frozen verifyUrl to be a canonical exact http://127.0.0.1:<port>/ URL without credentials or hash");
  const extra = Object.keys(raw).filter((key) => !["kind", "outputRoot", "entryPath"].includes(key));
  if (extra.length) fail(`Comparison contract shared.pageProvider has unsupported entry ${extra[0]}`);
  return { kind: raw.kind, outputRoot: output.path, entryPath, entryTargetPath: entry.path, targetPaths, verifyUrl: verify.href };
}
function assertHermeticBundleScope(bundle, pageProvider, label) {
  const entries = array(object(bundle, label).entries, `${label}.entries`);
  const paths = entries.map((entry, index) => {
    const relativePath = string(object(entry, `${label}.entries[${index}]`).path, `${label}.entries[${index}].path`, 1).replace(/\\/g, "/");
    return repoFile(`${pageProvider.outputRoot}/${relativePath}`, `${label}.entries[${index}].path`).path;
  }).sort();
  exact(paths, pageProvider.targetPaths, `${label} file paths and frozen changeTargets`);
  return paths;
}
function pageProviderReceiptPath(raw) {
  raw = object(raw, "Comparison contract run");
  return repoFile(raw.pageProviderReceiptPath, "Comparison contract run.pageProviderReceiptPath");
}
function cleanRoomWorktree(value, label) {
  const pathname = string(value, label, 3);
  if (!isAbsolute(pathname)) fail(`${label} must be an absolute worktree path`);
  return canonical(pathname);
}
function cleanRoomCondition(raw, label, pairId) {
  raw = object(raw, label);
  const allowed = new Set(["condition", "evidencePath", "workspaceId", "worktreeRoot", "implementation", "review", "otherWorkspaceId", "isolationMechanism", "otherConditionArtifactsAccessible", "prohibitedArtifacts"]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) fail(`${label} has unsupported entry ${key}`);
  const condition = string(raw.condition, `${label}.condition`);
  if (condition !== "baseline" && condition !== "current") fail(`${label}.condition must be baseline or current`);
  const evidencePath = repoFile(raw.evidencePath, `${label}.evidencePath`).path;
  if (!draftPreparationMode && isDraftPath(evidencePath)) fail(`${label}.evidencePath must not reference a draft artifact: ${evidencePath}`);
  const workspaceId = string(raw.workspaceId, `${label}.workspaceId`, 3);
  const worktreeRoot = cleanRoomWorktree(raw.worktreeRoot, `${label}.worktreeRoot`);
  const implementation = object(raw.implementation, `${label}.implementation`);
  const review = object(raw.review, `${label}.review`);
  const normalized = {
    condition,
    evidencePath,
    workspaceId,
    worktreeRoot,
    implementation: { actor: string(implementation.actor, `${label}.implementation.actor`, 2), contextId: string(implementation.contextId, `${label}.implementation.contextId`, 3) },
    review: { actor: string(review.actor, `${label}.review.actor`, 2), contextId: string(review.contextId, `${label}.review.contextId`, 3) },
    otherWorkspaceId: string(raw.otherWorkspaceId, `${label}.otherWorkspaceId`, 3),
    isolationMechanism: string(raw.isolationMechanism, `${label}.isolationMechanism`, 20),
    otherConditionArtifactsAccessible: raw.otherConditionArtifactsAccessible,
    prohibitedArtifacts: array(raw.prohibitedArtifacts, `${label}.prohibitedArtifacts`),
  };
  if (normalized.otherConditionArtifactsAccessible !== false) fail(`${label} must explicitly deny access to the other condition artifacts`);
  exact(normalized.prohibitedArtifacts, FORBIDDEN_CLEAN_ROOM, `${label}.prohibitedArtifacts`);
  if (normalized.implementation.actor === normalized.review.actor && normalized.implementation.contextId === normalized.review.contextId) fail(`${label} review must differ from implementation by actor or context`);
  return normalized;
}
function cleanRoomAuthorization(raw, pairId, label = "Comparison contract shared.cleanRoomAuthorization") {
  raw = object(raw, label);
  const allowed = new Set(["version", "pairId", "conditions"]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) fail(`${label} has unsupported entry ${key}`);
  if (raw.version !== 1 || raw.pairId !== pairId) fail(`${label} must be version 1 and bind this pairId`);
  const conditions = array(raw.conditions, `${label}.conditions`).map((entry, index) => cleanRoomCondition(entry, `${label}.conditions[${index}]`, pairId));
  if (conditions.length !== 2) fail(`${label}.conditions must contain exactly baseline and current`);
  exact(conditions.map((entry) => entry.condition), ["baseline", "current"], `${label}.conditions`);
  const baseline = conditions.find((entry) => entry.condition === "baseline");
  const current = conditions.find((entry) => entry.condition === "current");
  if (baseline.workspaceId === current.workspaceId || samePath(baseline.worktreeRoot, current.worktreeRoot)) fail(`${label} must use separate baseline/current worktree and workspace`);
  if (baseline.otherWorkspaceId !== current.workspaceId || current.otherWorkspaceId !== baseline.workspaceId) fail(`${label} otherWorkspaceId declarations must be mutually reciprocal`);
  if (samePath(resolve(root, baseline.evidencePath), resolve(root, current.evidencePath))) fail(`${label} must use separate baseline/current clean-room evidence paths`);
  const contexts = [baseline.implementation.contextId, baseline.review.contextId, current.implementation.contextId, current.review.contextId];
  if (new Set(contexts).size !== contexts.length) fail(`${label} must use four distinct implementation/review contexts`);
  return { version: 1, pairId, conditions: [baseline, current] };
}
function cleanRoomConditionFor(authorization, condition) {
  const entry = authorization.conditions.find((candidate) => candidate.condition === condition);
  if (!entry) fail(`Comparison clean-room authorization lacks ${condition}`);
  return entry;
}
function decisionInputBundle(figma, source, scope, gate, evaluatorEvidence, environment, pageProvider, cleanRoomAuthorization) {
  return {
    version: 1,
    figma,
    sourceSnapshot: { archive: source.archive, preImplementationProof: source.preImplementationProof, git: source.git },
    scope: { specs: scope.specs, pageCoverage: scope.pageCoverage, masks: scope.masks, thresholds: scope.thresholds, frozen: scope.frozen },
    gate: { manifestId: gate.manifestId, inputs: gate.inputs },
    evaluator: { roots: evaluatorEvidence.roots, baselineRecord: evaluatorEvidence.baseline.record, executionBundleSha256: evaluatorEvidence.executionBundleSha256 },
    environment,
    pageProvider,
    cleanRoomAuthorization,
  };
}
function decisionJ(raw, figma, source, gate, scope, evaluatorEvidence, environment, pageProvider, authorizationPlan, pairId) {
  const record = frozen(raw, "Comparison contract shared.ownerDecisionJ"); const approval = object(readJson(resolve(root, record.path), "Owner decision J record"), "Owner decision J record");
  if (approval.version !== 2 || approval.decisionId !== "J" || approval.status !== "approved" || approval.ownerApproved !== true) fail("Comparison requires an owner-approved decision J record version 2");
  if (approval.pairId !== pairId) fail("Owner decision J record must bind this one P-3 pilot pairId");
  const approvedAt = string(approval.approvedAt, "Owner decision J record approvedAt", 20); if (Number.isNaN(Date.parse(approvedAt))) fail("Owner decision J record approvedAt must be an ISO timestamp");
  const approvedFigma = object(approval.figma, "Owner decision J record figma"); if (approvedFigma.fileKey !== figma.fileKey || approvedFigma.rootNodeId !== figma.rootNodeId) fail("Owner decision J record Figma target differs from the frozen comparison target");
  const approvedSource = object(approval.sourceSnapshot, "Owner decision J record sourceSnapshot"); if (oid(approvedSource.commit, "Owner decision J record sourceSnapshot.commit") !== source.git.commit || oid(approvedSource.tree, "Owner decision J record sourceSnapshot.tree") !== source.git.tree || digest(approvedSource.archiveSha256, "Owner decision J record sourceSnapshot.archiveSha256") !== source.archive.sha256 || digest(approvedSource.preImplementationProofSha256, "Owner decision J record sourceSnapshot.preImplementationProofSha256") !== source.preImplementationProof.sha256) fail("Owner decision J record source snapshot differs from the frozen comparison input");
  const approvedScope = object(approval.scope, "Owner decision J record scope");
  if (digest(approvedScope.manifestSha256, "Owner decision J record scope.manifestSha256") !== gate.inputs.manifest.sha256 || digest(approvedScope.componentsSha256, "Owner decision J record scope.componentsSha256") !== gate.inputs.components.sha256 || digest(approvedScope.pageCoverageSha256, "Owner decision J record scope.pageCoverageSha256") !== scope.pageCoverage.sha256) fail("Owner decision J record scope inputs differ from the frozen comparison inputs");
  exact(array(approvedScope.checkpointPlan, "Owner decision J record scope.checkpointPlan"), scope.frozen.checkpointPlan, "Owner decision J checkpoint plan"); exact(array(approvedScope.changeTargets, "Owner decision J record scope.changeTargets"), scope.frozen.changeTargets, "Owner decision J change targets"); exact(array(approvedScope.targetSectionIds, "Owner decision J record scope.targetSectionIds"), scope.frozen.targetSectionIds, "Owner decision J target sections");
  if (digest(approval.evaluatorRootsSha256, "Owner decision J record evaluatorRootsSha256") !== stableHash(evaluatorEvidence.roots)) fail("Owner decision J record evaluator roots differ from the frozen canonical evaluators");
  if (digest(approval.evaluatorBaselineSha256, "Owner decision J record evaluatorBaselineSha256") !== evaluatorEvidence.baseline.record.sha256) fail("Owner decision J record evaluator baseline differs from the frozen canonical evaluators");
  if (digest(approval.evaluatorExecutionBundleSha256, "Owner decision J record evaluatorExecutionBundleSha256") !== evaluatorEvidence.executionBundleSha256) fail("Owner decision J record evaluator execution bundle differs from the frozen canonical evaluators");
  const approvedAuthorization = cleanRoomAuthorization(approval.cleanRoomAuthorization, pairId, "Owner decision J record cleanRoomAuthorization");
  const authorizationSha256 = stableHash(authorizationPlan);
  if (stableHash(approvedAuthorization) !== authorizationSha256) fail("Owner decision J record clean-room authorization differs from the frozen comparison authorization");
  if (digest(approval.cleanRoomAuthorizationStableJsonSha256, "Owner decision J record cleanRoomAuthorizationStableJsonSha256") !== authorizationSha256) fail("Owner decision J record clean-room authorization hash differs from the frozen comparison authorization");
  if (digest(approval.comparisonInputBundleSha256, "Owner decision J record comparisonInputBundleSha256") !== stableHash(decisionInputBundle(figma, source, scope, gate, evaluatorEvidence, environment, pageProvider, authorizationPlan))) fail("Owner decision J record comparison input bundle differs from the frozen P-3 input");
  return { record, approvedAt, cleanRoomAuthorization: authorizationPlan, cleanRoomAuthorizationStableJsonSha256: authorizationSha256 };
}
function approvedChange(raw, condition, pairId, source, gate, scope, ownerDecision) {
  const change = object(raw, "Comparison contract run.evaluatedChange"); const id = string(change.id, "Comparison contract run.evaluatedChange.id", 2);
  if (condition === "baseline") { if (id !== "baseline") fail("Baseline comparison contract must use evaluatedChange.id = baseline"); return { id, approvalRecord: null }; }
  if (id === "baseline") fail("Current comparison contract must name an owner-approved improvement");
  const proof = frozen(change.approvalRecord, "Comparison contract current evaluatedChange.approvalRecord"); const record = object(readJson(resolve(root, proof.path), "Current comparison change approval"), "Current comparison change approval");
  if (record.version !== 1 || record.status !== "approved" || record.ownerApproved !== true || record.pairId !== pairId || record.evaluatedChangeId !== id) fail("Current comparison change approval must be owner-approved and bind this pair and evaluated change");
  const approvedAt = string(record.approvedAt, "Current comparison change approval approvedAt", 20); if (Number.isNaN(Date.parse(approvedAt))) fail("Current comparison change approval approvedAt must be an ISO timestamp");
  if (digest(record.ownerDecisionJSha256, "Current comparison change approval ownerDecisionJSha256") !== ownerDecision.record.sha256) fail("Current comparison change approval does not bind the owner decision J record");
  const declaredSource = object(record.sourceSnapshot, "Current comparison change approval sourceSnapshot");
  if (oid(declaredSource.commit, "Current comparison change approval sourceSnapshot.commit") !== source.git.commit || oid(declaredSource.tree, "Current comparison change approval sourceSnapshot.tree") !== source.git.tree || digest(declaredSource.archiveSha256, "Current comparison change approval sourceSnapshot.archiveSha256") !== source.archive.sha256 || digest(declaredSource.preImplementationProofSha256, "Current comparison change approval sourceSnapshot.preImplementationProofSha256") !== source.preImplementationProof.sha256) fail("Current comparison change approval source snapshot differs from the frozen comparison input");
  const declaredScope = object(record.scope, "Current comparison change approval scope");
  if (digest(declaredScope.manifestSha256, "Current comparison change approval scope.manifestSha256") !== gate.inputs.manifest.sha256 || digest(declaredScope.componentsSha256, "Current comparison change approval scope.componentsSha256") !== gate.inputs.components.sha256 || digest(declaredScope.pageCoverageSha256, "Current comparison change approval scope.pageCoverageSha256") !== scope.pageCoverage.sha256) fail("Current comparison change approval scope inputs differ from the frozen comparison inputs");
  exact(array(declaredScope.checkpointPlan, "Current comparison change approval scope.checkpointPlan"), scope.frozen.checkpointPlan, "Current comparison change approval checkpoint plan"); exact(array(declaredScope.changeTargets, "Current comparison change approval scope.changeTargets"), scope.frozen.changeTargets, "Current comparison change approval change targets"); exact(array(declaredScope.targetSectionIds, "Current comparison change approval scope.targetSectionIds"), scope.frozen.targetSectionIds, "Current comparison change approval target sections");
  return { id, approvalRecord: proof, approvedAt };
}
function runIdentity(raw, ledger, source) {
  const runRaw = object(raw, "Comparison contract run"); const run = { workspaceId: string(runRaw.workspaceId, "Comparison contract run.workspaceId", 3), implementation: { actor: string(runRaw.implementation?.actor, "Comparison contract run.implementation.actor", 2), contextId: string(runRaw.implementation?.contextId, "Comparison contract run.implementation.contextId", 3) }, review: { actor: string(runRaw.review?.actor, "Comparison contract run.review.actor", 2), contextId: string(runRaw.review?.contextId, "Comparison contract run.review.contextId", 3) }, initialSourceSnapshotSha256: digest(runRaw.initialSourceSnapshotSha256, "Comparison contract run.initialSourceSnapshotSha256"), ledgerPath: canonical(ledger), git: source.actual };
  if (run.initialSourceSnapshotSha256 !== source.archive.sha256) fail("Comparison initial source snapshot does not match the frozen source archive"); if (run.implementation.actor === run.review.actor && run.implementation.contextId === run.review.contextId) fail("Comparison review must differ from implementation by actor or context"); return { raw: runRaw, run };
}
function nodeRuntime(raw) {
  const expected = array(raw.nodeExecArgv, "Comparison contract shared.environment.nodeExecArgv").map((value, index) => string(value, `Comparison contract shared.environment.nodeExecArgv[${index}]`));
  if (expected.length || process.execArgv.length) fail("Comparison contract requires a bare Node process with no execArgv; preload, loader, condition, and resolver flags are not P-3 evidence");
  for (const key of AMBIENT_NODE_VARIABLES) if (process.env[key]) fail(`Comparison contract rejects ambient ${key}; use a frozen evaluator or an owner-approved contract revision instead`);
  return [];
}
function preparedSharedInputs(raw, pairId) {
  const sharedRaw = object(raw.shared, "Comparison contract shared"); const environmentRaw = object(sharedRaw.environment, "Comparison contract shared.environment"); const environment = { nodeVersion: string(environmentRaw.nodeVersion, "Comparison contract shared.environment.nodeVersion", 2), nodeExecArgv: nodeRuntime(environmentRaw), chrome: chromePolicy(environmentRaw.chrome, "Comparison contract shared.environment.chrome") }; if (environment.nodeVersion !== process.version) fail(`Comparison contract Node version mismatch: expected ${environment.nodeVersion}, got ${process.version}`); const figmaRaw = object(sharedRaw.figma, "Comparison contract shared.figma");
  const figma = { fileKey: string(figmaRaw.fileKey, "Comparison contract shared.figma.fileKey", 3), rootNodeId: string(figmaRaw.rootNodeId, "Comparison contract shared.figma.rootNodeId", 3), nodeMap: frozen(figmaRaw.nodeMap, "Comparison contract shared.figma.nodeMap"), metadata: frozen(figmaRaw.metadata, "Comparison contract shared.figma.metadata"), designContexts: frozenMany(figmaRaw.designContexts, "Comparison contract shared.figma.designContexts"), screenshots: frozenMany(figmaRaw.screenshots, "Comparison contract shared.figma.screenshots"), assets: frozenMany(figmaRaw.assets, "Comparison contract shared.figma.assets", true) };
  const nodeMap = object(readJson(resolve(root, figma.nodeMap.path), "Comparison node map"), "Comparison node map"); assertFigmaNodeMapBinding(nodeMap, figma);
  const source = sourceSnapshot(sharedRaw.sourceSnapshot); const scopeRaw = object(sharedRaw.scope, "Comparison contract shared.scope"); const scope = { specs: frozenMany(scopeRaw.specs, "Comparison contract shared.scope.specs"), pageCoverage: frozen(scopeRaw.pageCoverage, "Comparison contract shared.scope.pageCoverage"), masks: frozenMany(scopeRaw.masks, "Comparison contract shared.scope.masks", true), thresholds: frozen(scopeRaw.thresholds, "Comparison contract shared.scope.thresholds") };
  const gate = frozenGate(sharedRaw.gate, figma); scope.frozen = frozenScope(gate, scope); const pageProvider = hermeticPageProvider(sharedRaw.pageProvider, scope.frozen); const preImplementation = preImplementationProof(source, gate, scope); const evaluatorEvidence = evaluator(sharedRaw.evaluator); const cleanRoomAuthorizationPlan = cleanRoomAuthorization(sharedRaw.cleanRoomAuthorization, pairId);
  return { sharedRaw, figma, source, scope, gate, pageProvider, preImplementation, evaluatorEvidence, environment, cleanRoomAuthorizationPlan };
}
function preparedDecisionCandidateInputs(raw, pairId, preImplementationArgument, evaluatorBaselineArgument) {
  const sharedRaw = object(raw.shared, "Comparison contract shared"); const environmentRaw = object(sharedRaw.environment, "Comparison contract shared.environment"); const environment = { nodeVersion: string(environmentRaw.nodeVersion, "Comparison contract shared.environment.nodeVersion", 2), nodeExecArgv: nodeRuntime(environmentRaw), chrome: chromePolicy(environmentRaw.chrome, "Comparison contract shared.environment.chrome") }; if (environment.nodeVersion !== process.version) fail(`Comparison contract Node version mismatch: expected ${environment.nodeVersion}, got ${process.version}`); const figmaRaw = object(sharedRaw.figma, "Comparison contract shared.figma");
  const figma = { fileKey: string(figmaRaw.fileKey, "Comparison contract shared.figma.fileKey", 3), rootNodeId: string(figmaRaw.rootNodeId, "Comparison contract shared.figma.rootNodeId", 3), nodeMap: frozen(figmaRaw.nodeMap, "Comparison contract shared.figma.nodeMap"), metadata: frozen(figmaRaw.metadata, "Comparison contract shared.figma.metadata"), designContexts: frozenMany(figmaRaw.designContexts, "Comparison contract shared.figma.designContexts"), screenshots: frozenMany(figmaRaw.screenshots, "Comparison contract shared.figma.screenshots"), assets: frozenMany(figmaRaw.assets, "Comparison contract shared.figma.assets", true) };
  const nodeMap = object(readJson(resolve(root, figma.nodeMap.path), "Comparison node map"), "Comparison node map"); assertFigmaNodeMapBinding(nodeMap, figma);
  const source = sourceSnapshot(sharedRaw.sourceSnapshot); const scopeRaw = object(sharedRaw.scope, "Comparison contract shared.scope"); const scope = { specs: frozenMany(scopeRaw.specs, "Comparison contract shared.scope.specs"), pageCoverage: frozen(scopeRaw.pageCoverage, "Comparison contract shared.scope.pageCoverage"), masks: frozenMany(scopeRaw.masks, "Comparison contract shared.scope.masks", true), thresholds: frozen(scopeRaw.thresholds, "Comparison contract shared.scope.thresholds") };
  const gate = frozenGate(sharedRaw.gate, figma); scope.frozen = frozenScope(gate, scope); const pageProvider = hermeticPageProvider(sharedRaw.pageProvider, scope.frozen);
  const preImplementationCandidate = draftCandidateRecord(preImplementationArgument, "P-3 decision candidate pre-implementation proof"); declaredDraftCandidate(source.preImplementationProof, preImplementationCandidate, "Comparison contract shared.sourceSnapshot.preImplementationProof"); const preImplementation = draftPreImplementationProof(preImplementationCandidate, source, gate, scope);
  const evaluatorBaselineCandidate = draftCandidateRecord(evaluatorBaselineArgument, "P-3 decision candidate evaluator baseline"); const evaluatorEvidence = candidateEvaluator(sharedRaw.evaluator, evaluatorBaselineCandidate); const cleanRoomAuthorizationPlan = cleanRoomAuthorization(sharedRaw.cleanRoomAuthorization, pairId);
  return { sharedRaw, figma, source, scope, gate, pageProvider, preImplementation, evaluatorEvidence, environment, cleanRoomAuthorizationPlan };
}
function authorize(raw, pairId, condition, ledger) {
  const prepared = preparedSharedInputs(raw, pairId); const { sharedRaw, figma, source, scope, gate, pageProvider, preImplementation, evaluatorEvidence, environment, cleanRoomAuthorizationPlan } = prepared; const ownerDecisionJ = decisionJ(sharedRaw.ownerDecisionJ, figma, source, gate, scope, evaluatorEvidence, environment, pageProvider, cleanRoomAuthorizationPlan, pairId);
  const identity = runIdentity(raw.run, ledger, source); identity.run.pageProviderReceiptPath = pageProviderReceiptPath(identity.raw); identity.run.cleanRoom = cleanRoom(identity.raw.cleanRoom, condition, pairId, identity.run, ownerDecisionJ); identity.run.evaluatedChange = approvedChange(identity.raw.evaluatedChange, condition, pairId, source, gate, scope, ownerDecisionJ);
  const shared = { figma, sourceSnapshot: { archive: source.archive, preImplementationProof: source.preImplementationProof, git: source.git }, scope, gate, pageProvider, preImplementation, ownerDecisionJ, cleanRoomAuthorization: cleanRoomAuthorizationPlan, evaluator: evaluatorEvidence, environment };
  return { sharedRaw, figma, source, scope, gate, pageProvider, preImplementation, ownerDecisionJ, cleanRoomAuthorization: cleanRoomAuthorizationPlan, evaluatorEvidence, environment, rawRun: identity.raw, run: identity.run, shared };
}
function cleanRoom(raw, condition, pairId, run, ownerDecision) {
  raw = object(raw, "Comparison contract run.cleanRoom");
  const keys = Object.keys(raw); if (keys.length !== 1 || keys[0] !== "evidence") fail("Comparison contract run.cleanRoom must contain only the frozen condition evidence");
  const evidence = frozen(raw.evidence, "Comparison contract run.cleanRoom.evidence");
  const declaration = object(readJson(resolve(root, evidence.path), "Comparison clean-room evidence"), "Comparison clean-room evidence");
  if (declaration.version !== 2 || declaration.kind !== "p3-clean-room-evidence" || declaration.status !== "approved" || declaration.ownerApproved !== true || declaration.pairId !== pairId || declaration.condition !== condition) fail("Comparison clean-room evidence must be owner-approved version 2 for this pair and condition");
  const approvedAt = string(declaration.approvedAt, "Comparison clean-room evidence approvedAt", 20);
  if (Number.isNaN(Date.parse(approvedAt)) || Date.parse(approvedAt) < Date.parse(ownerDecision.approvedAt)) fail("Comparison clean-room evidence approvedAt must be an ISO timestamp no earlier than owner decision J approval");
  const decision = object(declaration.ownerDecisionJ, "Comparison clean-room evidence ownerDecisionJ");
  const decisionPath = repoFile(decision.path, "Comparison clean-room evidence ownerDecisionJ.path").path;
  if (decisionPath !== ownerDecision.record.path || digest(decision.fileSha256, "Comparison clean-room evidence ownerDecisionJ.fileSha256") !== ownerDecision.record.sha256) fail("Comparison clean-room evidence does not bind this exact owner decision J record");
  if (digest(declaration.cleanRoomAuthorizationStableJsonSha256, "Comparison clean-room evidence cleanRoomAuthorizationStableJsonSha256") !== ownerDecision.cleanRoomAuthorizationStableJsonSha256) fail("Comparison clean-room evidence authorization hash differs from owner decision J");
  const declaredCondition = cleanRoomCondition(declaration.conditionAuthorization, "Comparison clean-room evidence conditionAuthorization", pairId);
  const authorizedCondition = cleanRoomConditionFor(ownerDecision.cleanRoomAuthorization, condition);
  if (stableHash(declaredCondition) !== stableHash(authorizedCondition)) fail("Comparison clean-room evidence condition authorization differs from owner decision J");
  if (evidence.path !== authorizedCondition.evidencePath || run.workspaceId !== authorizedCondition.workspaceId || !samePath(run.git.worktreeRoot, authorizedCondition.worktreeRoot) || !samePath(root, authorizedCondition.worktreeRoot) || run.implementation.actor !== authorizedCondition.implementation.actor || run.implementation.contextId !== authorizedCondition.implementation.contextId || run.review.actor !== authorizedCondition.review.actor || run.review.contextId !== authorizedCondition.review.contextId) fail("Comparison clean-room evidence does not bind this exact condition, worktree, implementation, and review context");
  return { evidence, approvedAt, authorizationStableJsonSha256: ownerDecision.cleanRoomAuthorizationStableJsonSha256, conditionAuthorization: authorizedCondition, isolationMechanism: authorizedCondition.isolationMechanism, prohibitedArtifacts: [...FORBIDDEN_CLEAN_ROOM], otherConditionArtifactsAccessible: false, otherWorkspaceId: authorizedCondition.otherWorkspaceId };
}
function decisionLedgerBindings(ownerDecision) {
  return {
    contractVersion: P3_CONTRACT_VERSION,
    ownerDecisionJFileSha256: ownerDecision.record.sha256,
    cleanRoomAuthorizationStableJsonSha256: ownerDecision.cleanRoomAuthorizationStableJsonSha256,
  };
}
function cleanRoomLedgerBindings(run) {
  return {
    cleanRoomEvidencePath: run.cleanRoom.evidence.path,
    cleanRoomEvidenceSha256: run.cleanRoom.evidence.sha256,
    cleanRoomEvidenceApprovedAt: run.cleanRoom.approvedAt,
  };
}
function matchesDecisionLedger(record, ownerDecision) {
  return record?.contractVersion === P3_CONTRACT_VERSION && record.ownerDecisionJFileSha256 === ownerDecision.record.sha256 && record.cleanRoomAuthorizationStableJsonSha256 === ownerDecision.cleanRoomAuthorizationStableJsonSha256;
}
function matchesCleanRoomLedger(record, run) {
  return record?.cleanRoomEvidencePath === run.cleanRoom.evidence.path && record.cleanRoomEvidenceSha256 === run.cleanRoom.evidence.sha256 && record.cleanRoomEvidenceApprovedAt === run.cleanRoom.approvedAt;
}
function matchesImplementationLedger(record, run) {
  const result = p3ValidateImplementationIdentity(record?.implementationIdentity);
  return result.ok && result.value.actor === run.implementation.actor && result.value.contextId === run.implementation.contextId;
}
function release(raw, state, gate) {
  raw = object(raw, "Comparison contract run.release"); const status = string(raw.status, "Comparison contract run.release.status");
  if (status === "not-applicable") return { status, reason: string(raw.reason, "Comparison contract run.release.reason", 20) };
  if (status !== "required") fail("Comparison contract run.release.status must be required or not-applicable");
  const record = frozen(raw.record, "Comparison contract run.release.record"); const releaseRecord = object(readJson(resolve(root, record.path), "Comparison passed release record"), "Comparison passed release record");
  if (releaseRecord.version !== 1 || releaseRecord.status !== "passed" || releaseRecord.manifestId !== gate.manifestId || releaseRecord.ownerApproved !== true) fail("Comparison release record must be owner-approved and passed for the frozen manifest");
  for (const key of ["ownerApprovedAt", "executedAt"]) if (Number.isNaN(Date.parse(string(releaseRecord[key], `Comparison release record ${key}`, 20)))) fail(`Comparison release record ${key} must be an ISO timestamp`);
  let url; try { url = new URL(string(releaseRecord.publicUrl, "Comparison release record publicUrl", 8)); } catch { fail("Comparison release record publicUrl must be valid HTTPS"); } if (url.protocol !== "https:") fail("Comparison release record publicUrl must use HTTPS");
  const deploymentId = string(releaseRecord.deploymentId, "Comparison release record deploymentId"); const stateRelease = object(state.releaseCheck, "Active Figma gate state releaseCheck");
  if (digest(stateRelease.recordSha256, "Active Figma gate state releaseCheck.recordSha256") !== record.sha256 || stateRelease.deploymentId !== deploymentId || stateRelease.publicUrl !== releaseRecord.publicUrl) fail("Active Figma gate release-check does not match the passed release record");
  const inputs = object(releaseRecord.frozenInputs, "Comparison passed release record frozenInputs"); for (const [key, stateKey] of Object.entries(GATE)) if (digest(inputs[stateKey], `Comparison passed release record frozenInputs.${stateKey}`) !== gate.inputs[key].sha256) fail(`Comparison passed release record ${stateKey} does not match frozen input`);
  return { status, record, deploymentId, publicUrl: releaseRecord.publicUrl };
}
async function providerCloseRecord(run, lifecycle, pairId, condition, source, scope, pageProvider, state, intent) {
  const ledgerRecord = condition === "baseline" ? lifecycle.bc : lifecycle.cc;
  if (!ledgerRecord) fail(`Comparison pair ${pairId} lacks the required P-3-owned hermetic provider close for ${condition}`);
  const planned = run.pageProviderReceiptPath;
  if (ledgerRecord.receiptPath !== planned.path || !existsSync(planned.absolute) || fileHash(planned.absolute) !== digest(ledgerRecord.receiptSha256, `Comparison pair ${pairId} provider close receipt SHA-256`)) fail(`Comparison pair ${pairId} hermetic provider receipt is missing or differs from the fixed provider-close record`);
  const receipt = object(readJson(planned.absolute, "Comparison hermetic provider receipt"), "Comparison hermetic provider receipt");
  if (receipt.version !== 1 || receipt.kind !== "hermetic-static-v1" || receipt.pairId !== pairId || receipt.condition !== condition || receipt.contractSha256 !== intent.contractSha256 || receipt.runIntentSha256 !== intent.runIntentSha256 || !samePath(string(receipt.worktreeRoot, "Comparison hermetic provider receipt worktreeRoot", 3), root) || receipt.verifyUrl !== scope.frozen.verifyUrl) fail(`Comparison pair ${pairId} hermetic provider receipt does not bind this exact condition and worktree`);
  const receiptSource = object(receipt.sourceSnapshot, "Comparison hermetic provider receipt sourceSnapshot");
  if (oid(receiptSource.commit, "Comparison hermetic provider receipt sourceSnapshot.commit") !== source.git.commit || oid(receiptSource.tree, "Comparison hermetic provider receipt sourceSnapshot.tree") !== source.git.tree || digest(receiptSource.archiveSha256, "Comparison hermetic provider receipt sourceSnapshot.archiveSha256") !== source.archive.sha256) fail("Comparison hermetic provider receipt source snapshot differs from the frozen source archive");
  const preflight = condition === "baseline" ? lifecycle.bp : lifecycle.cp;
  if (!preflight || !matchesImplementationLedger(preflight, run) || receipt.preflightId !== preflight.preflightId || digest(receipt.preflightStateSha256, "Comparison hermetic provider receipt preflightStateSha256") !== digest(preflight.preflightStateSha256, "Comparison pair preflight state SHA-256")) fail("Comparison hermetic provider receipt does not bind the recorded pair-preflight state and implementation identity");
  const provider = object(receipt.provider, "Comparison hermetic provider receipt provider");
  const marker = string(provider.marker, "Comparison hermetic provider receipt provider.marker", 64).toLowerCase(); if (!/^[a-f0-9]{64}$/.test(marker)) fail("Comparison hermetic provider receipt provider.marker must be a 256-bit hexadecimal value");
  if (provider.outputRoot !== pageProvider.outputRoot || provider.entryPath !== pageProvider.entryPath || provider.verifyUrl !== pageProvider.verifyUrl || !Number.isInteger(provider.providerPid) || provider.providerPid <= 0) fail("Comparison hermetic provider receipt provider differs from the frozen P-3 provider declaration");
  const bundle = object(receipt.bundle, "Comparison hermetic provider receipt bundle"); const { collectStaticBundle } = await p3PageProvider(); const actualBundle = collectStaticBundle({ workspaceRoot: root, outputRoot: pageProvider.outputRoot }); assertHermeticBundleScope(actualBundle, pageProvider, "Comparison hermetic provider receipt bundle");
  if (bundle.version !== 1 || bundle.kind !== "hermetic-static-v1" || bundle.outputRoot !== actualBundle.outputRoot || digest(bundle.merkleRoot, "Comparison hermetic provider receipt bundle.merkleRoot") !== actualBundle.merkleRoot || stableHash(array(bundle.entries, "Comparison hermetic provider receipt bundle.entries")) !== stableHash(actualBundle.entries)) fail("Comparison hermetic provider bundle changed after the P-3-owned close measurement");
  const entry = resolve(root, pageProvider.outputRoot, pageProvider.entryPath); if (!existsSync(entry) || fileHash(entry) !== digest(receipt.entrySha256, "Comparison hermetic provider receipt entrySha256")) fail("Comparison hermetic provider entry document differs from the P-3-owned close measurement");
  const summaries = array(receipt.summaries, "Comparison hermetic provider receipt summaries"); exact(summaries.map((entry, index) => string(object(entry, `Comparison hermetic provider receipt summaries[${index}]`).elementId, `Comparison hermetic provider receipt summaries[${index}].elementId`)), scope.frozen.checkpointPlan, "Comparison hermetic provider receipt checkpoint summaries");
  const receiptChromeFingerprint = chromeFingerprint(receipt.chromeFingerprint, "Comparison hermetic provider receipt chromeFingerprint");
  return { record: { path: planned.path, sha256: digest(ledgerRecord.receiptSha256, `Comparison pair ${pairId} provider receipt SHA-256`) }, marker, entrySha256: digest(receipt.entrySha256, "Comparison hermetic provider receipt entrySha256"), bundleMerkleRoot: actualBundle.merkleRoot, summaries, chromeFingerprint: receiptChromeFingerprint };
}
function p3JsonHash(argument) {
  const previous = draftPreparationMode; draftPreparationMode = true;
  try {
    const file = repoFile(argument, "P-3 JSON hash input"); const value = readJson(file.absolute, "P-3 JSON hash input");
    console.log(JSON.stringify({ version: 1, path: file.path, fileSha256: fileHash(file.absolute), stableJsonSha256: stableHash(value) }, null, 2));
  } finally { draftPreparationMode = previous; }
}
function p3EvaluatorPlan(argument) {
  const previous = draftPreparationMode; draftPreparationMode = true;
  try {
    const file = repoFile(argument, "P-3 evaluator plan input"); const document = object(readJson(file.absolute, "P-3 evaluator plan input"), "P-3 evaluator plan input"); const raw = document.shared && typeof document.shared === "object" && !Array.isArray(document.shared) ? document.shared.evaluator : document; const evidence = evaluatorFoundation(raw);
    const baselineRecordTemplate = { version: 2, status: "draft", ownerApproved: false, approvedAt: "REPLACE-with-owner-approval-ISO-8601", basis: "REPLACE-with-owner-approved-evaluator-baseline-basis", artifacts: EVAL.map((key) => ({ key, ...evidence.roots[key] })), executionBundleSha256: evidence.executionBundleSha256 };
    console.log(JSON.stringify({ version: 1, input: file.path, evaluatorRootsSha256: stableHash(evidence.roots), executionBundleSha256: evidence.executionBundleSha256, executionBundle: evaluatorExecutionBundle(evidence), baselineRecordTemplate }, null, 2));
  } finally { draftPreparationMode = previous; }
}
function buildOwnerDecisionJTemplate(pairId, figma, source, scope, gate, evaluatorEvidence, cleanRoomAuthorizationPlan, comparisonInputBundle) {
  return {
    version: 2,
    decisionId: "J",
    status: "draft",
    ownerApproved: false,
    pairId,
    approvedAt: "REPLACE-with-owner-approval-ISO-8601",
    figma: { fileKey: figma.fileKey, rootNodeId: figma.rootNodeId },
    sourceSnapshot: { commit: source.git.commit, tree: source.git.tree, archiveSha256: source.archive.sha256, preImplementationProofSha256: source.preImplementationProof.sha256 },
    scope: { manifestSha256: gate.inputs.manifest.sha256, componentsSha256: gate.inputs.components.sha256, pageCoverageSha256: scope.pageCoverage.sha256, checkpointPlan: scope.frozen.checkpointPlan, changeTargets: scope.frozen.changeTargets, targetSectionIds: scope.frozen.targetSectionIds },
    evaluatorRootsSha256: stableHash(evaluatorEvidence.roots),
    evaluatorBaselineSha256: evaluatorEvidence.baseline.record.sha256,
    evaluatorExecutionBundleSha256: evaluatorEvidence.executionBundleSha256,
    cleanRoomAuthorization: cleanRoomAuthorizationPlan,
    cleanRoomAuthorizationStableJsonSha256: stableHash(cleanRoomAuthorizationPlan),
    comparisonInputBundleSha256: stableHash(comparisonInputBundle),
  };
}
function p3DecisionInputPlan(argument) {
  const previous = draftPreparationMode; draftPreparationMode = true;
  try {
    const { raw, pairId } = rawContract(argument); const { figma, source, scope, gate, pageProvider, evaluatorEvidence, environment, cleanRoomAuthorizationPlan } = preparedSharedInputs(raw, pairId);
    const comparisonInputBundle = decisionInputBundle(figma, source, scope, gate, evaluatorEvidence, environment, pageProvider, cleanRoomAuthorizationPlan);
    const ownerDecisionJTemplate = buildOwnerDecisionJTemplate(pairId, figma, source, scope, gate, evaluatorEvidence, cleanRoomAuthorizationPlan, comparisonInputBundle);
    console.log(JSON.stringify({ version: 1, pairId, comparisonInputBundleSha256: ownerDecisionJTemplate.comparisonInputBundleSha256, cleanRoomAuthorizationStableJsonSha256: ownerDecisionJTemplate.cleanRoomAuthorizationStableJsonSha256, comparisonInputBundle, ownerDecisionJTemplate }, null, 2));
  } finally { draftPreparationMode = previous; }
}
function p3DecisionCandidatePlan(argument, preImplementationArgument, evaluatorBaselineArgument) {
  const previous = draftPreparationMode; draftPreparationMode = true;
  try {
    const { file: contract, raw, pairId } = rawDecisionCandidateContract(argument); const { figma, source, scope, gate, pageProvider, evaluatorEvidence, environment, cleanRoomAuthorizationPlan } = preparedDecisionCandidateInputs(raw, pairId, preImplementationArgument, evaluatorBaselineArgument);
    const comparisonInputBundle = decisionInputBundle(figma, source, scope, gate, evaluatorEvidence, environment, pageProvider, cleanRoomAuthorizationPlan);
    const finalFieldTemplate = buildOwnerDecisionJTemplate(pairId, figma, source, scope, gate, evaluatorEvidence, cleanRoomAuthorizationPlan, comparisonInputBundle);
    const { comparisonInputBundleSha256: comparisonInputBundleCandidateSha256, ...ownerDecisionJCandidateTemplate } = finalFieldTemplate;
    ownerDecisionJCandidateTemplate.kind = "p3-owner-decision-j-candidate";
    ownerDecisionJCandidateTemplate.draftOnly = true;
    ownerDecisionJCandidateTemplate.candidateOnly = true;
    ownerDecisionJCandidateTemplate.runtimeEligible = false;
    ownerDecisionJCandidateTemplate.status = "candidate";
    ownerDecisionJCandidateTemplate.comparisonInputBundleCandidateSha256 = comparisonInputBundleCandidateSha256;
    console.log(JSON.stringify({ version: 1, kind: "p3-decision-j-candidate-plan", readOnly: true, candidateOnly: true, runtimeEligible: false, pairId, candidateInputs: { comparisonContract: { path: contract.path, sha256: fileHash(contract.absolute) }, preImplementationProof: source.preImplementationProof, evaluatorBaseline: evaluatorEvidence.baseline.record }, comparisonInputBundleCandidateSha256, cleanRoomAuthorizationStableJsonSha256: ownerDecisionJCandidateTemplate.cleanRoomAuthorizationStableJsonSha256, comparisonInputBundleCandidate: comparisonInputBundle, ownerDecisionJCandidateTemplate, requiresFinalRegeneration: ["owner-approved non-draft preImplementationProof", "owner-approved non-draft evaluator baseline", "p3-decision-input-plan"], mayNotBeUsedFor: ["pair-readiness", "pair-begin", "pair-preflight", "pair-close", "report", "compare"] }, null, 2));
  } finally { draftPreparationMode = previous; }
}
function readinessStage(value) {
  const stage = string(value, "pair-readiness stage");
  if (stage !== "pre-begin" && stage !== "pre-close") fail("pair-readiness stage must be pre-begin or pre-close");
  return stage;
}
function activeReadinessLifecycle(ledger, pairId, condition, intent, source, evaluatorEvidence, run, ownerDecision) {
  requirePairLock(ledger, pairId);
  const lifecycle = pair(ledger, pairId);
  if (!lifecycle.started || lifecycle.terminal) fail(`Comparison pair ${pairId} is not active for pre-close pair-readiness`);
  const preflight = condition === "baseline" ? lifecycle.bp : lifecycle.cp;
  if (!preflight || preflight.contractSha256 !== intent.contractSha256 || preflight.runIntentSha256 !== intent.runIntentSha256 || preflight.sourceCommit !== source.git.commit || preflight.sourceTree !== source.git.tree || preflight.sourceArchiveSha256 !== source.archive.sha256 || preflight.evaluatorExecutionBundleSha256 !== evaluatorEvidence.executionBundleSha256 || !samePath(preflight.worktreeRoot, root) || !matchesDecisionLedger(preflight, ownerDecision) || !matchesCleanRoomLedger(preflight, run) || !matchesImplementationLedger(preflight, run)) fail(`Comparison pair ${pairId} lacks a matching ${condition} pair-preflight before pre-close pair-readiness`);
  return preflight;
}
async function pairReadiness(argument, stageArgument) {
  // This command is deliberately read-only: it never reserves a pair, writes
  // a ledger or lock, starts figma-gate, or creates an active state. pre-begin
  // validates only facts that exist before implementation. pre-close validates
  // the implemented worktree immediately before pair-close.
  const { raw, pairId, condition, ledger, contractPath } = rawContract(argument);
  const stage = readinessStage(stageArgument);
  const intent = conditionIntent(raw);
  assertNoIgnoredRuntimeArtifacts();
  const authorization = authorize(raw, pairId, condition, ledger);
  const { source, scope, pageProvider, preImplementation, evaluatorEvidence, run, ownerDecisionJ } = authorization;
  const structuralProviderAlignment = {
    status: "verified",
    verifiedAtStage: stage,
    outputRoot: pageProvider.outputRoot,
    entryPath: pageProvider.entryPath,
    entryTargetPath: pageProvider.entryTargetPath,
    targetPaths: [...pageProvider.targetPaths],
    verifyUrl: pageProvider.verifyUrl,
  };
  const base = {
    version: 1,
    kind: "p3-pair-readiness",
    stage,
    readOnly: true,
    sideEffects: {
      ledger: { created: false, modified: false },
      pairLock: { created: false, modified: false },
      gateState: { created: false, modified: false },
    },
    contract: { path: contractPath, pairId, condition },
    sourceSnapshot: { commit: source.git.commit, tree: source.git.tree, archiveSha256: source.archive.sha256 },
    pageProvider: { structuralAlignment: structuralProviderAlignment },
  };
  if (stage === "pre-begin") {
    unimplementedWorktree(preImplementation);
    const changedSourcePaths = preImplementationSourceScope(source);
    console.log(JSON.stringify({
      ...base,
      preImplementation: {
        unimplementedTargetPaths: [...preImplementation.unimplementedTargetPaths],
        sourceWorktree: { status: "verified-clean-before-implementation", changedSourcePaths },
      },
      pageProvider: {
        ...base.pageProvider,
        snapshotBundle: {
          status: "deferred-until-pair-close",
          reason: "The target implementation files must be absent before pair-begin; bundle bytes and their final equality with changeTargets are checked only after implementation by pre-close pair-readiness and pair-close.",
        },
      },
      finalChangeScope: {
        status: "deferred-until-pair-close",
        frozenChangeTargets: [...scope.frozen.changeTargets],
        reason: "The final changed-source set does not exist before implementation. This read-only pre-begin check verifies a clean starting source worktree but does not claim finalChangeScope PASS.",
      },
    }, null, 2));
    return;
  }
  const preflight = activeReadinessLifecycle(ledger, pairId, condition, intent, source, evaluatorEvidence, run, ownerDecisionJ);
  finalChangeScope(source, scope.frozen);
  const { collectStaticBundle } = await p3PageProvider();
  const bundle = collectStaticBundle({ workspaceRoot: root, outputRoot: pageProvider.outputRoot });
  assertHermeticBundleScope(bundle, pageProvider, "Comparison pre-close provider snapshot bundle");
  const entry = resolve(root, pageProvider.outputRoot, pageProvider.entryPath);
  if (!existsSync(entry)) fail("Comparison pre-close provider entry document is missing");
  console.log(JSON.stringify({
    ...base,
    preflight: { id: preflight.preflightId, at: preflight.preflightAt },
    pageProvider: {
      ...base.pageProvider,
      snapshotBundle: {
        status: "verified-before-pair-close",
        merkleRoot: bundle.merkleRoot,
        entries: bundle.entries,
        entrySha256: fileHash(entry),
      },
    },
    finalChangeScope: {
      status: "verified-before-pair-close",
      frozenChangeTargets: [...scope.frozen.changeTargets],
    },
  }, null, 2));
}
function begin(argument) {
  const { raw, pairId, condition, ledger, contractPath } = rawContract(argument); const intent = conditionIntent(raw); if (condition !== "baseline") fail("pair-begin must use the baseline contract"); assertNoIgnoredRuntimeArtifacts(); assertNoDraftRuntimeReferences(raw); if (pair(ledger, pairId).records.length) fail(`Comparison pair ${pairId} is already recorded and cannot be reused`); reservePair(ledger, pairId, contractPath);
  failureLedger = { path: ledger, pairId }; const authorization = authorize(raw, pairId, condition, ledger); unimplementedWorktree(authorization.preImplementation); const { sharedRaw, source, evaluatorEvidence, ownerDecisionJ, run } = authorization;
  appendLedger(ledger, { kind: "started", pairId, contractPath, baselineContractSha256: intent.contractSha256, baselineRunIntentSha256: intent.runIntentSha256, sharedIntentSha256: stableHash(sharedRaw), evaluatorRootsSha256: stableHash(evaluatorEvidence.roots), evaluatorBaselineSha256: evaluatorEvidence.baseline.record.sha256, evaluatorExecutionBundleSha256: evaluatorEvidence.executionBundleSha256, evaluatorRuntimeArtifactsSha256: stableHash(evaluatorEvidence.runtimeArtifacts), evaluatorClosureSha256: stableHash(evaluatorEvidence.closure), evaluatorPackagesSha256: stableHash(evaluatorEvidence.packages), ...decisionLedgerBindings(ownerDecisionJ), baselineCleanRoomEvidencePath: run.cleanRoom.evidence.path, baselineCleanRoomEvidenceSha256: run.cleanRoom.evidence.sha256, baselineCleanRoomEvidenceApprovedAt: run.cleanRoom.approvedAt, sourceCommit: source.git.commit, sourceTree: source.git.tree, sourceArchiveSha256: source.archive.sha256, ledgerPath: canonical(ledger), startedByWorktree: canonical(root) });
  failureLedger = null; console.log(`FIDELITY BENCHMARK: pair ${pairId} started -> ${ledger}`);
}
function abortCommand(argument, reason) { armFailureLedgerForContract(argument); const { pairId, ledger, contractPath } = rawContract(argument); armFailureLedgerForPair(ledger, pairId); requirePairLock(ledger, pairId, contractPath); const lifecycle = pair(ledger, pairId); if (!lifecycle.started) fail(`Comparison pair ${pairId} was not started`); if (lifecycle.terminal) fail(`Comparison pair ${pairId} is already terminal and cannot be replaced`); abort(ledger, pairId, reason); failureLedger = null; console.log(`FIDELITY BENCHMARK: pair ${pairId} aborted -> ${ledger}`); }
async function contract(argument, state, statePlan) {
  if (!argument) return null;
  armFailureLedgerForContract(argument); const { raw, pairId, condition, ledger, contractPath } = rawContract(argument); const intent = conditionIntent(raw); armFailureLedgerForPair(ledger, pairId); requirePairLock(ledger, pairId, contractPath); failureLedger = { path: ledger, pairId };
  const authorization = authorize(raw, pairId, condition, ledger); const { sharedRaw, figma, source, scope, gate, pageProvider, preImplementation, ownerDecisionJ, evaluatorEvidence, environment, rawRun, run, shared } = authorization;
  const activeGate = gateInputs(sharedRaw.gate, state, figma, source, run.implementation); run.gateImplementationIdentity = activeGate.implementationIdentity; run.preflightInstance = preflightInstance(state, evaluatorEvidence); run.gateRuntime = run.preflightInstance.runtime; if (activeGate.manifestId !== gate.manifestId || stableHash(activeGate.inputs) !== stableHash(gate.inputs)) fail("Active Figma gate inputs differ from the preflight-authorized comparison inputs");
  finalChangeScope(source, scope.frozen);
  exact(statePlan, scope.frozen.checkpointPlan, "Active Figma gate benchmark plan and frozen gate manifest");
  const lifecycle = pair(ledger, pairId); const preflight = condition === "baseline" ? lifecycle.bp : lifecycle.cp;
  if (!lifecycle.started || lifecycle.terminal || lifecycle.started.sharedIntentSha256 !== stableHash(sharedRaw) || lifecycle.started.evaluatorRootsSha256 !== stableHash(evaluatorEvidence.roots) || lifecycle.started.evaluatorBaselineSha256 !== evaluatorEvidence.baseline.record.sha256 || lifecycle.started.evaluatorExecutionBundleSha256 !== evaluatorEvidence.executionBundleSha256 || lifecycle.started.evaluatorRuntimeArtifactsSha256 !== stableHash(evaluatorEvidence.runtimeArtifacts) || lifecycle.started.evaluatorClosureSha256 !== stableHash(evaluatorEvidence.closure) || lifecycle.started.evaluatorPackagesSha256 !== stableHash(evaluatorEvidence.packages) || !matchesDecisionLedger(lifecycle.started, ownerDecisionJ) || lifecycle.started.baselineCleanRoomEvidencePath === undefined || lifecycle.started.baselineCleanRoomEvidenceSha256 === undefined || lifecycle.started.baselineCleanRoomEvidenceApprovedAt === undefined || (condition === "baseline" && (lifecycle.started.baselineCleanRoomEvidencePath !== run.cleanRoom.evidence.path || lifecycle.started.baselineCleanRoomEvidenceSha256 !== run.cleanRoom.evidence.sha256 || lifecycle.started.baselineCleanRoomEvidenceApprovedAt !== run.cleanRoom.approvedAt))) fail(`Comparison pair ${pairId} is not an active matching pair-begin record`);
  if (!preflight || preflight.contractSha256 !== intent.contractSha256 || preflight.runIntentSha256 !== intent.runIntentSha256 || preflight.sourceCommit !== source.git.commit || preflight.sourceTree !== source.git.tree || preflight.sourceArchiveSha256 !== source.archive.sha256 || preflight.evaluatorExecutionBundleSha256 !== evaluatorEvidence.executionBundleSha256 || !samePath(preflight.worktreeRoot, root) || !matchesDecisionLedger(preflight, ownerDecisionJ) || !matchesCleanRoomLedger(preflight, run) || !matchesImplementationLedger(preflight, run) || preflight.preflightCommit !== state.git.commit || preflight.preflightTree !== state.git.tree) fail(`Comparison pair is missing a matching ${condition} pair-preflight record`);
  if (preflight.preflightId !== run.preflightInstance.id || preflight.preflightAt !== run.preflightInstance.at || preflight.runtimeEntrySha256 !== run.preflightInstance.runtime.entrySha256) fail("Active Figma gate preflight instance differs from the recorded pair-preflight");
  run.close = closeRecord(rawRun.close, state, gate, scope.frozen); run.pageProvider = await providerCloseRecord(run, lifecycle, pairId, condition, source, scope, pageProvider, state, intent); const chrome = chromeMeasurements(state, environment.chrome, scope.frozen, run.pageProvider); run.chromeMeasurements = chrome.measurements; run.chromeFingerprint = chrome.fingerprint; if (!p3ChromeFingerprintsEqual(run.pageProvider.chromeFingerprint, run.chromeFingerprint)) fail("Comparison hermetic provider receipt Chrome fingerprint does not match the final CDP browser batches"); exact(run.pageProvider.summaries.map((entry) => entry.elementId), run.chromeMeasurements.map((entry) => entry.elementId), "Comparison hermetic provider receipt and browser summary checkpoints"); for (const measurement of run.chromeMeasurements) { const receiptSummary = run.pageProvider.summaries.find((entry) => entry.elementId === measurement.elementId); if (!receiptSummary || receiptSummary.summaryPath !== measurement.summaryPath || receiptSummary.summarySha256 !== measurement.summarySha256) fail("Comparison hermetic provider receipt summary does not match the final CDP browser batch"); } run.release = release(rawRun.release, state, gate);
  if (condition === "baseline" ? lifecycle.base : lifecycle.current) fail(`Comparison pair ${pairId} already has a ${condition} report and cannot be replaced`);
  return { version: P3_CONTRACT_VERSION, pairId, condition, contractPath, shared, sharedSha256: stableHash(shared), sharedIntentSha256: stableHash(sharedRaw), evaluatorExecutionBundleSha256: evaluatorEvidence.executionBundleSha256, checkpointPlanSha256: stableHash(scope.frozen.checkpointPlan), ...decisionLedgerBindings(ownerDecisionJ), ...cleanRoomLedgerBindings(run), cleanPreflight: cleanPreflight(state), run, contractSha256: intent.contractSha256, runIntentSha256: intent.runIntentSha256 };
}
function pairPreflight(argument, manifestArgument) {
  armFailureLedgerForContract(argument); const { raw, pairId, condition, ledger, contractPath } = rawContract(argument); const intent = conditionIntent(raw); armFailureLedgerForPair(ledger, pairId); requirePairLock(ledger, pairId, contractPath); failureLedger = { path: ledger, pairId }; assertNoIgnoredRuntimeArtifacts(); const lifecycle = pair(ledger, pairId); if (!lifecycle.started || lifecycle.terminal || (condition === "baseline" ? lifecycle.bp : lifecycle.cp)) fail(`Comparison pair ${pairId} is not active for pair-preflight`);
  const authorization = authorize(raw, pairId, condition, ledger); unimplementedWorktree(authorization.preImplementation); const { sharedRaw, source, gate, evaluatorEvidence, ownerDecisionJ, run } = authorization; if (lifecycle.started.sharedIntentSha256 !== stableHash(sharedRaw) || lifecycle.started.evaluatorRootsSha256 !== stableHash(evaluatorEvidence.roots) || lifecycle.started.evaluatorBaselineSha256 !== evaluatorEvidence.baseline.record.sha256 || lifecycle.started.evaluatorExecutionBundleSha256 !== evaluatorEvidence.executionBundleSha256 || !matchesDecisionLedger(lifecycle.started, ownerDecisionJ) || lifecycle.started.baselineCleanRoomEvidencePath === undefined || lifecycle.started.baselineCleanRoomEvidenceSha256 === undefined || lifecycle.started.baselineCleanRoomEvidenceApprovedAt === undefined) fail(`Comparison pair ${pairId} is not an active matching pair-begin record`); const manifest = gate.inputs.manifest; const requested = repoFile(manifestArgument, "pair-preflight manifest path"); if (requested.path !== manifest.path) fail("pair-preflight manifest path does not match the frozen gate manifest"); const script = canonicalGate(evaluatorEvidence);
  if (condition === "baseline" && (lifecycle.started.baselineContractSha256 !== intent.contractSha256 || lifecycle.started.baselineRunIntentSha256 !== intent.runIntentSha256)) fail(`Comparison pair ${pairId} baseline contract changed after pair-begin`);
  const childEnvironment = sanitizedNodeEnvironment();
  try { execFileSync(process.execPath, [script, "preflight", requested.path, "--implementation-actor", run.implementation.actor, "--implementation-context-id", run.implementation.contextId], { cwd: root, stdio: "inherit", env: childEnvironment }); } catch (error) { fail(`figma-gate preflight failed for comparison pair ${pairId}: ${error.message}`); }
  const state = readJson(statePath, "Active Figma gate state after pair-preflight"); const stateVersion = p3ValidateFigmaGateActiveStateVersion(state.version); if (state.phase !== "preflight" || !stateVersion.ok) fail("pair-preflight did not produce a v13 figma-gate active state version 5; v4 and every earlier active state are rejected without migration"); const implementationIdentity = activeImplementationIdentity(state, run.implementation, "Active Figma gate preflight state"); const instance = preflightInstance(state, evaluatorEvidence); const git = preflightGit(state, source); cleanPreflight(state);
  appendLedger(ledger, { kind: "preflight-recorded", pairId, condition, contractPath, contractSha256: intent.contractSha256, runIntentSha256: intent.runIntentSha256, worktreeRoot: canonical(root), sourceCommit: source.git.commit, sourceTree: source.git.tree, sourceArchiveSha256: source.archive.sha256, evaluatorExecutionBundleSha256: evaluatorEvidence.executionBundleSha256, ...decisionLedgerBindings(ownerDecisionJ), ...cleanRoomLedgerBindings(run), implementationIdentity, preflightCommit: git.commit, preflightTree: git.tree, preflightId: instance.id, preflightAt: instance.at, runtimeEntrySha256: instance.runtime.entrySha256, preflightStateSha256: fileHash(statePath) }); failureLedger = null; console.log(`FIDELITY BENCHMARK: pair ${pairId} ${condition} preflight recorded`);
}
async function pairClose(argument, manifestArgument) {
  armFailureLedgerForContract(argument); const { raw, pairId, condition, ledger, contractPath } = rawContract(argument); const intent = conditionIntent(raw); armFailureLedgerForPair(ledger, pairId); requirePairLock(ledger, pairId, contractPath); failureLedger = { path: ledger, pairId };
  const lifecycle = pair(ledger, pairId); if (!lifecycle.started || lifecycle.terminal || (condition === "baseline" ? lifecycle.bc : lifecycle.cc)) fail(`Comparison pair ${pairId} is not active for the P-3-owned hermetic provider close`);
  const authorization = authorize(raw, pairId, condition, ledger); const { sharedRaw, figma, source, scope, gate, pageProvider, evaluatorEvidence, environment, rawRun, run, ownerDecisionJ } = authorization;
  const preflight = condition === "baseline" ? lifecycle.bp : lifecycle.cp; if (!preflight || preflight.contractSha256 !== intent.contractSha256 || preflight.runIntentSha256 !== intent.runIntentSha256 || preflight.sourceCommit !== source.git.commit || preflight.sourceTree !== source.git.tree || preflight.sourceArchiveSha256 !== source.archive.sha256 || preflight.evaluatorExecutionBundleSha256 !== evaluatorEvidence.executionBundleSha256 || !samePath(preflight.worktreeRoot, root) || !matchesDecisionLedger(preflight, ownerDecisionJ) || !matchesCleanRoomLedger(preflight, run) || !matchesImplementationLedger(preflight, run)) fail(`Comparison pair ${pairId} lacks a matching ${condition} pair-preflight before provider close`);
  // These checks must run before opening the P-3 provider or invoking
  // figma-gate close. A source-side file outside the frozen changeTargets is
  // not a measurement failure: it makes the pair invalid and must leave no
  // close/receipt evidence.
  finalChangeScope(source, scope.frozen);
  const manifest = gate.inputs.manifest; const requested = repoFile(manifestArgument, "pair-close manifest path"); if (requested.path !== manifest.path) fail("pair-close manifest path does not match the frozen gate manifest"); if (existsSync(run.pageProviderReceiptPath.absolute)) fail(`Comparison pair ${pairId} hermetic provider receipt path already exists and cannot be replaced`);
  const { collectStaticBundle, startHermeticStaticProvider } = await p3PageProvider(); const launchBundle = collectStaticBundle({ workspaceRoot: root, outputRoot: pageProvider.outputRoot }); assertHermeticBundleScope(launchBundle, pageProvider, "P-3 provider snapshot bundle");
  const provider = await startHermeticStaticProvider({ workspaceRoot: root, outputRoot: pageProvider.outputRoot, entryPath: pageProvider.entryPath, verifyUrl: pageProvider.verifyUrl });
  try {
    // The launch bundle already passed assertHermeticBundleScope(). Compare
    // the provider's own snapshot with that checked bundle without calling
    // fail() first: fail() exits immediately, so the server must close before
    // emitting a terminal ledger record on this race-path.
    if (provider.bundle.outputRoot !== launchBundle.outputRoot || provider.bundle.merkleRoot !== launchBundle.merkleRoot || stableHash(provider.bundle.entries) !== stableHash(launchBundle.entries)) {
      await provider.close();
      fail("P-3 provider snapshot bundle changed between pre-launch scope validation and provider launch");
    }
    const script = canonicalGate(evaluatorEvidence); const childEnvironment = { ...sanitizedNodeEnvironment(), FIGMA_P3_HERMETIC_PROVIDER: "1" };
    try { await runNodeAsync(script, ["close", requested.path], childEnvironment, "figma-gate close"); }
    catch (error) { throw new Error(`figma-gate close failed for comparison pair ${pairId}: ${error.message}`); }
    const bundle = await provider.assertBundleUnchanged();
    if (bundle.outputRoot !== launchBundle.outputRoot || bundle.merkleRoot !== launchBundle.merkleRoot || stableHash(bundle.entries) !== stableHash(launchBundle.entries)) {
      await provider.close();
      fail("P-3 provider snapshot bundle changed after provider launch");
    }
    const state = readJson(statePath, "Active Figma gate state after P-3 provider close"); if (state.phase !== "closed") fail("P-3 provider close did not produce a closed figma-gate state"); gateInputs(sharedRaw.gate, state, figma, source, run.implementation); finalChangeScope(source, scope.frozen); const close = closeRecord(rawRun.close, state, gate, scope.frozen); const entry = resolve(root, pageProvider.outputRoot, pageProvider.entryPath); const entrySha256 = fileHash(entry); const expectedProvider = { marker: provider.marker, entrySha256, bundleMerkleRoot: bundle.merkleRoot }; const chrome = chromeMeasurements(state, environment.chrome, scope.frozen, expectedProvider); const summaries = chrome.measurements.map(({ elementId, summaryPath, summarySha256 }) => ({ elementId, summaryPath, summarySha256 }));
    const receipt = { version: 1, kind: "hermetic-static-v1", pairId, condition, contractSha256: intent.contractSha256, runIntentSha256: intent.runIntentSha256, worktreeRoot: canonical(root), verifyUrl: pageProvider.verifyUrl, sourceSnapshot: { commit: source.git.commit, tree: source.git.tree, archiveSha256: source.archive.sha256 }, preflightId: preflight.preflightId, preflightStateSha256: preflight.preflightStateSha256, provider: { kind: pageProvider.kind, verifyUrl: pageProvider.verifyUrl, outputRoot: pageProvider.outputRoot, entryPath: pageProvider.entryPath, providerPid: provider.providerPid, marker: provider.marker }, entrySha256, bundle, summaries, chromeFingerprint: chrome.fingerprint, closeRecord: close.record };
    writeJson(run.pageProviderReceiptPath.absolute, receipt); const receiptSha256 = fileHash(run.pageProviderReceiptPath.absolute); appendLedger(ledger, { kind: "provider-close-recorded", pairId, condition, contractPath, contractSha256: intent.contractSha256, runIntentSha256: intent.runIntentSha256, receiptPath: run.pageProviderReceiptPath.path, receiptSha256, bundleMerkleRoot: bundle.merkleRoot, providerMarker: provider.marker, preflightId: preflight.preflightId }); failureLedger = null; console.log(`FIDELITY BENCHMARK: pair ${pairId} ${condition} hermetic provider close recorded`);
  } finally {
    await provider.close();
  }
}
function invalidAttempt(attempt) {
  if (!attempt || typeof attempt !== "object") return "not an object";
  if (typeof attempt.elementId !== "string" || !attempt.elementId) return "elementId is missing";
  if (!OUTCOMES.has(attempt.outcome)) return "outcome must be PASS or FAIL";
  if (attempt.outcome === "FAIL" && !FAILURE_CLASSES.has(attempt.failureClass)) return "FAIL needs failureClass SPEC/LAYOUT/VISUAL/OTHER";
  if (attempt.outcome === "PASS" && attempt.failureClass != null) return "PASS must not carry failureClass";
  if (typeof attempt.at !== "string" || Number.isNaN(Date.parse(attempt.at))) return "at is not an ISO timestamp";
  return null;
}
async function build(state, comparisonArgument) {
  const plan = Array.isArray(state.benchmark?.plan) ? state.benchmark.plan.filter((entry) => typeof entry === "string") : null;
  if (plan && (!plan.length || new Set(plan).size !== plan.length)) fail("Active Figma gate benchmark.plan must be a non-empty unique component plan");
  const comparison = await contract(comparisonArgument, state, plan || []); const rejected = []; const valid = [];
  for (const [index, attempt] of (Array.isArray(state.benchmark?.attempts) ? state.benchmark.attempts : []).entries()) { const reason = invalidAttempt(attempt); if (reason) rejected.push({ index, reason }); else if (!attempt.finalRecheck && !attempt.release) valid.push(attempt); }
  const components = new Map(); const seed = (elementId, painted) => { if (!components.has(elementId)) components.set(elementId, { elementId, painted: painted === true, attempts: 0, firstOutcome: null, firstFailureClass: null, passed: false, failureClasses: [], planned: plan === null ? null : plan.includes(elementId) }); return components.get(elementId); };
  for (const elementId of plan || []) seed(elementId, false);
  for (const attempt of valid) { const component = seed(attempt.elementId, attempt.painted); component.attempts += 1; if (attempt.painted) component.painted = true; if (component.firstOutcome === null) { component.firstOutcome = attempt.outcome; component.firstFailureClass = attempt.failureClass ?? null; } if (attempt.outcome === "PASS") component.passed = true; else component.failureClasses.push(attempt.failureClass); }
  const items = [...components.values()].sort((a, b) => a.elementId.localeCompare(b.elementId)); const planned = plan === null ? items.length : plan.length; const attempted = items.filter((item) => item.attempts).length; const firstPass = items.filter((item) => item.firstOutcome === "PASS").length; const eventualPass = items.filter((item) => item.passed).length; const allFailureClasses = {}; const firstAttemptFailureClasses = {};
  for (const item of items) for (const failureClass of item.failureClasses) { allFailureClasses[failureClass] = (allFailureClasses[failureClass] || 0) + 1; if (item.firstOutcome === "FAIL") firstAttemptFailureClasses[item.firstFailureClass] = (firstAttemptFailureClasses[item.firstFailureClass] || 0) + 1; }
  const direct = state.learningMetrics?.directViewportRuns ?? {}; const attemptCountMismatches = [];
  for (const item of items) { const counts = Object.values(direct[item.elementId] ?? {}).map(Number); const expected = counts.length ? Math.max(...counts) : 0; if (expected !== item.attempts) attemptCountMismatches.push({ elementId: item.elementId, learningMetrics: expected, benchmark: item.attempts }); }
  const total = items.reduce((sum, item) => sum + item.attempts, 0); const rounds = items.filter((item) => item.attempts).map((item) => item.attempts);
  return { version: 6, generatedAt: new Date().toISOString(), manifestId: state.manifestId ?? null, source: ".figma-gate/active.json", comparison, metrics: { plannedComponents: planned, attemptedComponents: attempted, notAttemptedComponents: planned - attempted, firstTryPassComponents: firstPass, firstTryPassRate: planned ? Number((firstPass / planned).toFixed(4)) : null, eventuallyPassedComponents: eventualPass, totalCheckpointAttempts: total, meanAttemptsPerComponent: rounds.length ? Number((total / rounds.length).toFixed(3)) : null, maxAttemptsForOneComponent: rounds.length ? Math.max(...rounds) : null, firstAttemptFailureClasses, allFailureClasses }, integrity: { planRecorded: plan !== null, rejectedAttempts: rejected, unplannedComponents: items.filter((item) => item.planned === false).map((item) => item.elementId), attemptCountMismatches, tamperEvident: false }, components: items, note: "finalRecheck and release-check are excluded from first-implementation fidelity aggregation. This report does not determine pass/fail." };
}
async function report(outputArgument, comparisonArgument) {
  if (comparisonArgument) { armFailureLedgerForContract(comparisonArgument); const meta = rawContract(comparisonArgument); armFailureLedgerForPair(meta.ledger, meta.pairId); requirePairLock(meta.ledger, meta.pairId, meta.contractPath); failureLedger = { path: meta.ledger, pairId: meta.pairId }; }
  const state = readJson(statePath, "Active Figma gate state"); const result = await build(state, comparisonArgument); const output = resolve(root, outputArgument || `MyBrain/verify/benchmark/${result.manifestId || "unknown"}.json`); writeJson(output, result);
  if (result.comparison) { const ledger = fixedLedger(); const lifecycle = pair(ledger, result.comparison.pairId); if (!lifecycle.started || lifecycle.terminal || (result.comparison.condition === "baseline" ? lifecycle.base : lifecycle.current)) fail(`Comparison pair ${result.comparison.pairId} cannot record another ${result.comparison.condition} report`); appendLedger(ledger, { kind: "condition-recorded", pairId: result.comparison.pairId, condition: result.comparison.condition, contractPath: result.comparison.contractPath, contractSha256: result.comparison.contractSha256, runIntentSha256: result.comparison.runIntentSha256, sharedSha256: result.comparison.sharedSha256, ...decisionLedgerBindings({ record: { sha256: result.comparison.ownerDecisionJFileSha256 }, cleanRoomAuthorizationStableJsonSha256: result.comparison.cleanRoomAuthorizationStableJsonSha256 }), cleanRoomEvidencePath: result.comparison.cleanRoomEvidencePath, cleanRoomEvidenceSha256: result.comparison.cleanRoomEvidenceSha256, cleanRoomEvidenceApprovedAt: result.comparison.cleanRoomEvidenceApprovedAt, reportSha256: fileHash(output), worktreeRoot: result.comparison.run.git.worktreeRoot }); failureLedger = null; }
  const rate = result.metrics.firstTryPassRate === null ? "n/a" : `${(result.metrics.firstTryPassRate * 100).toFixed(1)}%`; console.log(`FIDELITY BENCHMARK: first-try PASS ${result.metrics.firstTryPassComponents}/${result.metrics.plannedComponents} (${rate}), not attempted ${result.metrics.notAttemptedComponents}, attempts ${result.metrics.totalCheckpointAttempts} -> ${output}`);
}
function reject(message) { fail(`compare rejected: ${message}`); }
function comparable(report, label) {
  const comparison = report.comparison; if (!comparison || typeof comparison !== "object") reject(`${label} is missing a comparison contract report`);
  if (comparison.version !== P3_CONTRACT_VERSION) reject(`${label} does not use comparison contract v${P3_CONTRACT_VERSION} evidence`);
  const integrity = report.integrity || {}; if (integrity.planRecorded !== true || !Array.isArray(integrity.rejectedAttempts) || integrity.rejectedAttempts.length || !Array.isArray(integrity.unplannedComponents) || integrity.unplannedComponents.length || !Array.isArray(integrity.attemptCountMismatches) || integrity.attemptCountMismatches.length) reject(`${label} has integrity anomalies`);
  if (report.metrics?.plannedComponents <= 0 || report.metrics?.notAttemptedComponents !== 0) reject(`${label} is incomplete`);
  if (report.metrics?.eventuallyPassedComponents !== report.metrics?.plannedComponents || !Array.isArray(report.components) || report.components.some((component) => component?.attempts < 1 || component?.passed !== true)) reject(`${label} did not eventually PASS every planned component`);
  if (!comparison.cleanPreflight || comparison.cleanPreflight.dirtyPaths?.length || Object.values(comparison.cleanPreflight.changeTargetStatus || {}).some((status) => status !== "clean")) reject(`${label} did not start from clean preflight`);
  if (!comparison.run?.close?.record || !comparison.run?.pageProvider?.record || !comparison.run?.git?.worktreeRoot || !Array.isArray(comparison.run?.chromeMeasurements) || !comparison.run.chromeMeasurements.length || !comparison.run?.cleanRoom?.evidence || typeof comparison.ownerDecisionJFileSha256 !== "string" || typeof comparison.cleanRoomAuthorizationStableJsonSha256 !== "string" || comparison.cleanRoomEvidencePath !== comparison.run.cleanRoom.evidence.path || comparison.cleanRoomEvidenceSha256 !== comparison.run.cleanRoom.evidence.sha256 || comparison.cleanRoomEvidenceApprovedAt !== comparison.run.cleanRoom.approvedAt) reject(`${label} lacks bound P-3 provider, owner decision, or clean-room evidence`);
  const runIdentity = p3ValidateImplementationIdentity(comparison.run.implementation); const gateIdentity = p3ValidateImplementationIdentity(comparison.run.gateImplementationIdentity);
  if (!runIdentity.ok || !gateIdentity.ok || runIdentity.value.actor !== gateIdentity.value.actor || runIdentity.value.contextId !== gateIdentity.value.contextId) reject(`${label} report gate implementation identity does not match condition run.implementation`);
  const policy = p3ValidateChromePolicy(comparison.shared?.environment?.chrome); if (!policy.ok) reject(`${label} report Chrome policy is invalid: ${policy.error}`);
  const fingerprint = p3ValidateChromeFingerprint(comparison.run.chromeFingerprint); const providerFingerprint = p3ValidateChromeFingerprint(comparison.run.pageProvider.chromeFingerprint);
  if (!fingerprint.ok || !providerFingerprint.ok || !p3ChromeFingerprintsEqual(fingerprint.value, providerFingerprint.value)) reject(`${label} lacks one condition-local final CDP Chrome fingerprint`);
  for (const [index, measurement] of comparison.run.chromeMeasurements.entries()) {
    const observed = p3ValidateChromeFingerprint({ source: measurement?.source, product: measurement?.product, revision: measurement?.revision, userAgent: measurement?.userAgent });
    if (!observed.ok || !p3ChromeFingerprintsEqual(observed.value, fingerprint.value)) reject(`${label} final CDP Chrome measurement ${index} differs from the condition fingerprint`);
  }
  return comparison;
}
function compare(baselineArgument, currentArgument, baselineContractArgument) {
  if (!baselineArgument || !currentArgument || !baselineContractArgument) fail("compare requires <baseline.json> <current.json> <baseline-comparison.json>");
  armFailureLedgerForContract(baselineContractArgument); const meta = rawContract(baselineContractArgument); armFailureLedgerForPair(meta.ledger, meta.pairId); if (meta.condition !== "baseline") fail("compare requires a baseline comparison contract as its third argument"); requirePairLock(meta.ledger, meta.pairId, meta.contractPath); failureLedger = { path: meta.ledger, pairId: meta.pairId };
  const baselinePath = resolve(root, baselineArgument); const currentPath = resolve(root, currentArgument); const baseline = readJson(baselinePath, "Baseline benchmark"); const current = readJson(currentPath, "Current benchmark"); const base = comparable(baseline, "baseline"); const now = comparable(current, "current");
  if (base.contractSha256 !== stableHash(meta.raw)) reject("baseline report does not match the fixed compare contract");
  if (base.condition !== "baseline" || now.condition !== "current" || base.pairId !== now.pairId || base.pairId !== meta.pairId) reject("report conditions or pairId differ");
  if (base.sharedSha256 !== now.sharedSha256 || base.checkpointPlanSha256 !== now.checkpointPlanSha256 || base.ownerDecisionJFileSha256 !== now.ownerDecisionJFileSha256 || base.cleanRoomAuthorizationStableJsonSha256 !== now.cleanRoomAuthorizationStableJsonSha256) reject("frozen shared evidence, owner decision, clean-room authorization, or checkpoint plan differs");
  if (!p3ChromeFingerprintsEqual(base.run.chromeFingerprint, now.run.chromeFingerprint)) reject("condition-local final CDP Chrome fingerprints differ across the A/B pair");
  if (base.run.workspaceId === now.run.workspaceId || samePath(base.run.git.worktreeRoot, now.run.git.worktreeRoot) || new Set([base.run.implementation.contextId, base.run.review.contextId, now.run.implementation.contextId, now.run.review.contextId]).size !== 4) reject("clean-room workspace or context is shared");
  if (base.run.cleanRoom.otherWorkspaceId !== now.run.workspaceId || now.run.cleanRoom.otherWorkspaceId !== base.run.workspaceId || base.run.cleanRoom.otherConditionArtifactsAccessible !== false || now.run.cleanRoom.otherConditionArtifactsAccessible !== false || base.run.cleanRoom.evidence.sha256 === now.run.cleanRoom.evidence.sha256 || base.cleanRoomEvidencePath === now.cleanRoomEvidencePath) reject("clean-room declarations do not bind mutually isolated A/B worktrees");
  if (base.run.release.status !== now.run.release.status || base.run.ledgerPath !== now.run.ledgerPath || !samePath(base.run.ledgerPath, fixedLedger()) || base.run.pageProvider.marker === now.run.pageProvider.marker) reject("release applicability, P-3 provider evidence, or fixed ledger differs");
  const lifecycle = pair(fixedLedger(), base.pairId);
  if (!matchesImplementationLedger(lifecycle.bp, base.run) || !matchesImplementationLedger(lifecycle.cp, now.run)) reject("pair-preflight identity does not match its condition run.implementation");
  if (!lifecycle.started || lifecycle.terminal || !lifecycle.base || !lifecycle.current || !lifecycle.bc || !lifecycle.cc || lifecycle.started.baselineContractSha256 !== base.contractSha256 || lifecycle.started.baselineRunIntentSha256 !== base.runIntentSha256 || lifecycle.bp?.contractSha256 !== base.contractSha256 || lifecycle.bp?.runIntentSha256 !== base.runIntentSha256 || lifecycle.cp?.contractSha256 !== now.contractSha256 || lifecycle.cp?.runIntentSha256 !== now.runIntentSha256 || lifecycle.bc.receiptSha256 !== base.run.pageProvider.record.sha256 || lifecycle.cc.receiptSha256 !== now.run.pageProvider.record.sha256 || lifecycle.base.contractSha256 !== base.contractSha256 || lifecycle.base.runIntentSha256 !== base.runIntentSha256 || lifecycle.current.contractSha256 !== now.contractSha256 || lifecycle.current.runIntentSha256 !== now.runIntentSha256 || lifecycle.started.sharedIntentSha256 !== base.sharedIntentSha256 || lifecycle.started.sharedIntentSha256 !== now.sharedIntentSha256 || lifecycle.started.evaluatorExecutionBundleSha256 !== base.evaluatorExecutionBundleSha256 || lifecycle.started.evaluatorExecutionBundleSha256 !== now.evaluatorExecutionBundleSha256 || !matchesDecisionLedger(lifecycle.started, { record: { sha256: base.ownerDecisionJFileSha256 }, cleanRoomAuthorizationStableJsonSha256: base.cleanRoomAuthorizationStableJsonSha256 }) || lifecycle.started.baselineCleanRoomEvidencePath !== base.cleanRoomEvidencePath || lifecycle.started.baselineCleanRoomEvidenceSha256 !== base.cleanRoomEvidenceSha256 || lifecycle.started.baselineCleanRoomEvidenceApprovedAt !== base.cleanRoomEvidenceApprovedAt || !matchesDecisionLedger(lifecycle.bp, { record: { sha256: base.ownerDecisionJFileSha256 }, cleanRoomAuthorizationStableJsonSha256: base.cleanRoomAuthorizationStableJsonSha256 }) || !matchesCleanRoomLedger(lifecycle.bp, { cleanRoom: { evidence: { path: base.cleanRoomEvidencePath, sha256: base.cleanRoomEvidenceSha256 }, approvedAt: base.cleanRoomEvidenceApprovedAt } }) || !matchesDecisionLedger(lifecycle.cp, { record: { sha256: now.ownerDecisionJFileSha256 }, cleanRoomAuthorizationStableJsonSha256: now.cleanRoomAuthorizationStableJsonSha256 }) || !matchesCleanRoomLedger(lifecycle.cp, { cleanRoom: { evidence: { path: now.cleanRoomEvidencePath, sha256: now.cleanRoomEvidenceSha256 }, approvedAt: now.cleanRoomEvidenceApprovedAt } }) || !matchesDecisionLedger(lifecycle.base, { record: { sha256: base.ownerDecisionJFileSha256 }, cleanRoomAuthorizationStableJsonSha256: base.cleanRoomAuthorizationStableJsonSha256 }) || !matchesCleanRoomLedger(lifecycle.base, { cleanRoom: { evidence: { path: base.cleanRoomEvidencePath, sha256: base.cleanRoomEvidenceSha256 }, approvedAt: base.cleanRoomEvidenceApprovedAt } }) || !matchesDecisionLedger(lifecycle.current, { record: { sha256: now.ownerDecisionJFileSha256 }, cleanRoomAuthorizationStableJsonSha256: now.cleanRoomAuthorizationStableJsonSha256 }) || !matchesCleanRoomLedger(lifecycle.current, { cleanRoom: { evidence: { path: now.cleanRoomEvidencePath, sha256: now.cleanRoomEvidenceSha256 }, approvedAt: now.cleanRoomEvidenceApprovedAt } }) || lifecycle.base.reportSha256 !== fileHash(baselinePath) || lifecycle.current.reportSha256 !== fileHash(currentPath)) reject("pair ledger is not an active matching A/B pair");
  appendLedger(fixedLedger(), { kind: "completed", pairId: base.pairId, baselineReportSha256: lifecycle.base.reportSha256, currentReportSha256: lifecycle.current.reportSha256 }); failureLedger = null; console.log(`FIDELITY BENCHMARK compare: pairId ${base.pairId}`); console.log("  This one pair is a pilot; tamperEvident: false means it is not proof of a general improvement effect.");
}
async function main() {
  if (command === "p3-json-hash") p3JsonHash(args[1]);
  else if (command === "p3-evaluator-plan") p3EvaluatorPlan(args[1]);
  else if (command === "p3-decision-input-plan") p3DecisionInputPlan(args[1]);
  else if (command === "p3-decision-candidate-plan") p3DecisionCandidatePlan(args[1], args[2], args[3]);
  else if (command === "pair-readiness") await pairReadiness(args[1], args[2]);
  else if (command === "report") await report(args[1], args[2]);
  else if (command === "compare") compare(args[1], args[2], args[3]);
  else if (command === "pair-begin") begin(args[1]);
  else if (command === "pair-preflight") pairPreflight(args[1], args[2]);
  else if (command === "pair-close") await pairClose(args[1], args[2]);
  else if (command === "pair-abort") abortCommand(args[1], args[2]);
  else { console.error("Usage: node MyBrain/verify/fidelity-benchmark.mjs p3-json-hash <json> | p3-evaluator-plan <evaluator.json> | p3-decision-input-plan <comparison.json> | p3-decision-candidate-plan <draft-comparison.json> <draft-pre-implementation.json> <draft-evaluator-baseline.json> | pair-readiness <comparison.json> <pre-begin|pre-close> | report [out.json] [comparison.json] | compare <baseline.json> <current.json> <baseline-comparison.json> | pair-begin <baseline-comparison.json> | pair-preflight <comparison.json> <gate-manifest.json> | pair-close <comparison.json> <gate-manifest.json> | pair-abort <comparison.json> <reason>"); process.exit(1); }
}
// Export only deterministic path-boundary helpers. The isolated regression can
// exercise Darwin behavior without mutating process.platform or invoking the
// comparison CLI lifecycle.
export { canonical as p3CanonicalPath, contractKey as p3ContractKey, sourcePath as p3SourcePath };

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  main().catch((error) => fail(error?.message || String(error)));
}
