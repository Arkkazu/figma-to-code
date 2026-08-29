#!/usr/bin/env node
// Coordinator-only validation and application of a single P-3 role return.
// This helper is deliberately outside fidelity-benchmark.mjs and never writes
// P-3 contracts, ledgers, gate state, or any other runtime record.  A return
// is a plain USTAR archive containing only regular files plus
// return-manifest.json.  The coordinator validates it against a frozen plan
// before an explicit --apply can replace any actual-worktree files.  Its only
// persistent records are coordinator-only progress/proof artifacts; it never
// writes a P-3 contract, lifecycle ledger, gate state, or evaluator input.
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  chmodSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TAR_BLOCK_SIZE = 512;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 48 * 1024 * 1024;
const MAX_ENTRY_COUNT = 64;
const RETURN_MANIFEST_PATH = "return-manifest.json";
const SHARED_POLICY = "shared-delimited-region";
const COMPONENT_POLICY = "component-file";
const RECOVERY_DIRECTORY = ".p3-role-return-recovery";
const RECOVERY_JOURNAL = "journal.json";
const RETURN_PLAN_VERSION = 5;
const RETURN_MANIFEST_VERSION = 4;
const P3_CONTRACT_VERSION = 13;
const FIGMA_GATE_ACTIVE_STATE_VERSION = 5;
const PAIR_LEDGER_NAME = "figma-p3-comparison-ledger.jsonl";
const PAIR_LOCK_DIRECTORY = "figma-p3-comparison-pair-locks";
const PROGRESS_LEDGER_VERSION = 1;
const PROGRESS_LEDGER_KIND = "p3-role-return-progress";
const CHECKPOINT_PROOF_VERSION = 1;
const CHECKPOINT_PROOF_KIND = "p3-role-return-checkpoint-proof";
const FEEDBACK_VERSION = 1;
const FEEDBACK_KIND = "p3-role-return-feedback";
const P3_HERO_LAUREL_PATH = "site/assets/hero/hero-laurel.png";
const P3_HERO_LAUREL_OWNER_SEQUENCE = 3;

function fail(message) { throw new Error(message); }

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  if (value !== value.trim()) fail(`${label} must not have leading or trailing whitespace.`);
  if (value.includes("\0")) fail(`${label} must not contain a NUL character.`);
  return value;
}

function exactKeys(value, allowed, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) fail(`${label} has unsupported field(s): ${unexpected.join(", ")}.`);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readRegularFile(path, "File"));
}

function sha256(value, label) {
  const result = requiredString(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`${label} must be a lowercase SHA-256 digest.`);
  return result;
}

function asciiFold(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function regularPath(value, label) {
  const input = requiredString(value, label);
  if (input.includes("\\")) fail(`${label} must use '/' separators.`);
  if (isAbsolute(input) || /^[A-Za-z]:/.test(input)) fail(`${label} must be relative.`);
  if (!/^[\x21-\x7e]+$/.test(input)) fail(`${label} must use printable ASCII characters only.`);
  const normalized = posix.normalize(input);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized !== input) {
    fail(`${label} must be a normalized relative path without '..'.`);
  }
  for (const segment of input.split("/")) {
    if (segment === "" || segment === "." || segment === "..") fail(`${label} has an invalid path segment.`);
    if (segment.includes(":")) fail(`${label} must not contain ':'.`);
    if (segment.endsWith(".") || segment.endsWith(" ")) fail(`${label} has an NTFS-ambiguous path segment.`);
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(segment)) {
      fail(`${label} has an NTFS-reserved path segment.`);
    }
  }
  return normalized;
}

function assertWithin(parent, candidate, label) {
  const route = relative(parent, candidate);
  if (route === "" || route === ".." || route.startsWith("../") || route.startsWith("..\\") || isAbsolute(route)) {
    fail(`${label} must stay within its declared root.`);
  }
}

function pathsOverlap(left, right) {
  const leftToRight = relative(left, right);
  const rightToLeft = relative(right, left);
  return leftToRight === "" || rightToLeft === "" || (!leftToRight.startsWith("..") && !isAbsolute(leftToRight))
    || (!rightToLeft.startsWith("..") && !isAbsolute(rightToLeft));
}

function assertRealDirectory(path, label) {
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a real directory, not a symlink or special file.`);
  return realpathSync(path);
}

function readRegularFile(path, label) {
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile()) fail(`${label} must be a regular file, not a symlink or special file.`);
  return readFileSync(path);
}

function readJson(path, label) {
  try {
    return JSON.parse(readRegularFile(path, label).toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function stagingTreeEntries(root) {
  const entries = [];
  function walk(directory, prefix) {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareUtf8(left.name, right.name));
    for (const child of children) {
      const childPath = join(directory, child.name);
      const childRelativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const safePath = regularPath(childRelativePath, "inputStaging contains a path");
      const info = lstatSync(childPath);
      if (info.isSymbolicLink()) fail(`inputStaging contains a forbidden symlink: ${safePath}`);
      if (info.isDirectory()) {
        walk(childPath, safePath);
        continue;
      }
      if (!info.isFile()) fail(`inputStaging contains a non-regular file: ${safePath}`);
      entries.push({ path: safePath, sha256: sha256Bytes(readFileSync(childPath)) });
    }
  }
  walk(root, "");
  return entries;
}

export function hashInputStaging(rootValue) {
  const root = assertRealDirectory(resolve(rootValue), "inputStaging.root");
  const hash = createHash("sha256");
  hash.update("p3-role-input-staging/v1\0", "utf8");
  for (const entry of stagingTreeEntries(root)) {
    hash.update(entry.path, "utf8");
    hash.update(Buffer.from([0]));
    hash.update(entry.sha256, "ascii");
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) fail(`${label} must be a positive integer.`);
  return value;
}

function uniquePaths(value, label) {
  const paths = array(value, label).map((entry, index) => regularPath(entry, `${label}[${index}]`));
  const seen = new Set();
  for (const path of paths) {
    const key = asciiFold(path);
    if (seen.has(key)) fail(`${label} must not contain duplicate paths.`);
    seen.add(key);
  }
  return paths;
}

function includesP3HeroLaurel(paths) {
  return paths.some((path) => asciiFold(path) === P3_HERO_LAUREL_PATH);
}

function requiresP3HeroLaurelOwnership(frozenChangeTargets) {
  return includesP3HeroLaurel(frozenChangeTargets);
}

function validateP3HeroLaurelScopeOwnership(scope, frozenChangeTargets, label) {
  if (!requiresP3HeroLaurelOwnership(frozenChangeTargets)) return;
  const listsLaurel = includesP3HeroLaurel(scope.allowedChangeTargets);
  const createsLaurel = includesP3HeroLaurel(scope.attemptOneCreatePaths);
  if (scope.sequence !== P3_HERO_LAUREL_OWNER_SEQUENCE && (listsLaurel || createsLaurel)) {
    fail(`P3 hero-laurel ownership validation failed: ${label} assigns ${P3_HERO_LAUREL_PATH} to sequence ${scope.sequence}; only sequence ${P3_HERO_LAUREL_OWNER_SEQUENCE} may list or create it.`);
  }
  if (scope.sequence === P3_HERO_LAUREL_OWNER_SEQUENCE && (!listsLaurel || !createsLaurel)) {
    fail(`P3 hero-laurel ownership validation failed: ${label} sequence ${P3_HERO_LAUREL_OWNER_SEQUENCE} must list and create ${P3_HERO_LAUREL_PATH}.`);
  }
}

function validateP3HeroLaurelProtocolOwnership(scopes, frozenChangeTargets) {
  if (!requiresP3HeroLaurelOwnership(frozenChangeTargets)) return;
  const owners = scopes.filter((scope) => scope.sequence === P3_HERO_LAUREL_OWNER_SEQUENCE);
  if (owners.length !== 1) {
    fail(`P3 hero-laurel ownership validation failed: componentReturnScopes must contain exactly one sequence ${P3_HERO_LAUREL_OWNER_SEQUENCE} owner for ${P3_HERO_LAUREL_PATH}.`);
  }
  for (const scope of scopes) {
    validateP3HeroLaurelScopeOwnership(scope, frozenChangeTargets, `Coordinator handoff protocol component return scope sequence ${scope.sequence}`);
  }
}

function deriveBootstrapDirectories(createPaths, label) {
  const directories = new Map();
  for (const path of createPaths) {
    if (!path.startsWith("site/")) fail(`${label} may create only paths below site/: ${path}`);
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const directory = segments.slice(0, index).join("/");
      if (!directory.startsWith("site") || (directory !== "site" && !directory.startsWith("site/"))) {
        fail(`${label} derives a bootstrap directory outside site/: ${directory}`);
      }
      directories.set(asciiFold(directory), directory);
    }
  }
  return [...directories.values()].sort((left, right) => {
    const depth = left.split("/").length - right.split("/").length;
    return depth !== 0 ? depth : compareUtf8(left, right);
  });
}

function validateAttemptOneCreatePaths(value, label, allowedChangeTargets) {
  const paths = uniquePaths(value, label);
  const allowed = new Set(allowedChangeTargets.map(asciiFold));
  for (const path of paths) {
    if (!allowed.has(asciiFold(path))) fail(`${label} has a path outside allowedChangeTargets: ${path}`);
  }
  deriveBootstrapDirectories(paths, label);
  return paths;
}

function validateDerivedBootstrapDirectories(value, label, createPaths) {
  const declared = uniquePaths(value, label);
  const expected = deriveBootstrapDirectories(createPaths, label);
  if (!sameSequence(declared, expected)) {
    fail(`${label} must exactly equal the parent-directory set derived from attemptOneCreatePaths.`);
  }
  return expected;
}

function validateBootstrapDelimiterRegions(value, label, checkpointPlan, component) {
  const regions = array(value, label);
  if (regions.length !== checkpointPlan.length) fail(`${label} must include one delimiter region for every frozen checkpoint.`);
  const seenDelimiters = new Set();
  return regions.map((candidate, index) => {
    const region = object(candidate, `${label}[${index}]`);
    exactKeys(region, new Set(["elementId", "startDelimiter", "endDelimiter"]), `${label}[${index}]`);
    const elementId = requiredString(region.elementId, `${label}[${index}].elementId`);
    if (elementId !== checkpointPlan[index]) fail(`${label} must retain frozen checkpointPlan order.`);
    const startDelimiter = requiredString(region.startDelimiter, `${label}[${index}].startDelimiter`);
    const endDelimiter = requiredString(region.endDelimiter, `${label}[${index}].endDelimiter`);
    if (startDelimiter === endDelimiter) fail(`${label}[${index}] delimiters must differ.`);
    for (const delimiter of [startDelimiter, endDelimiter]) {
      if (seenDelimiters.has(delimiter)) fail(`${label} must not reuse a delimiter across checkpoint regions.`);
      seenDelimiters.add(delimiter);
    }
    return { elementId, startDelimiter, endDelimiter };
  });
}

function validatePolicies(value, allowedChangeTargets, checkpointPlan, component, attemptOneCreatePaths) {
  const policies = array(value, "component.filePolicies");
  const allowed = new Set(allowedChangeTargets.map(asciiFold));
  const creationTargets = new Set(attemptOneCreatePaths.map(asciiFold));
  const byPath = new Map();
  for (let index = 0; index < policies.length; index += 1) {
    const candidate = object(policies[index], `component.filePolicies[${index}]`);
    const path = regularPath(candidate.path, `component.filePolicies[${index}].path`);
    if (!allowed.has(asciiFold(path))) fail(`component.filePolicies[${index}].path is outside allowedChangeTargets: ${path}`);
    if (byPath.has(asciiFold(path))) fail(`component.filePolicies has duplicate path: ${path}`);
    const kind = requiredString(candidate.kind, `component.filePolicies[${index}].kind`);
    if (kind === SHARED_POLICY) {
      const isBootstrapTarget = component.attempt === 1 && creationTargets.has(asciiFold(path));
      exactKeys(candidate, new Set(isBootstrapTarget
        ? ["path", "kind", "startDelimiter", "endDelimiter", "bootstrapDelimiterRegions"]
        : ["path", "kind", "startDelimiter", "endDelimiter"]), `component.filePolicies[${index}]`);
      const startDelimiter = requiredString(candidate.startDelimiter, `component.filePolicies[${index}].startDelimiter`);
      const endDelimiter = requiredString(candidate.endDelimiter, `component.filePolicies[${index}].endDelimiter`);
      if (startDelimiter === endDelimiter) fail(`component.filePolicies[${index}] delimiters must differ.`);
      let bootstrapDelimiterRegions = null;
      if (isBootstrapTarget) {
        bootstrapDelimiterRegions = validateBootstrapDelimiterRegions(
          candidate.bootstrapDelimiterRegions,
          `component.filePolicies[${index}].bootstrapDelimiterRegions`,
          checkpointPlan,
          component,
        );
        const own = bootstrapDelimiterRegions.find((region) => region.elementId === component.elementId);
        if (!own || own.startDelimiter !== startDelimiter || own.endDelimiter !== endDelimiter) {
          fail(`component.filePolicies[${index}] delimiters must equal this component's bootstrap delimiter region.`);
        }
      }
      byPath.set(asciiFold(path), { path, kind, startDelimiter, endDelimiter, bootstrapDelimiterRegions });
      continue;
    }
    if (kind === COMPONENT_POLICY) {
      exactKeys(candidate, new Set(["path", "kind"]), `component.filePolicies[${index}]`);
      byPath.set(asciiFold(path), { path, kind });
      continue;
    }
    fail(`component.filePolicies[${index}].kind must be ${JSON.stringify(SHARED_POLICY)} or ${JSON.stringify(COMPONENT_POLICY)}.`);
  }
  if (byPath.size !== allowedChangeTargets.length) fail("component.filePolicies must declare exactly one policy for every allowedChangeTarget.");
  for (const path of allowedChangeTargets) {
    if (!byPath.has(asciiFold(path))) fail(`component.filePolicies is missing a policy for ${path}.`);
  }
  return byPath;
}

function sameSequence(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function stringSequence(value, label) {
  const entries = array(value, label).map((entry, index) => requiredString(entry, `${label}[${index}]`));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry)) fail(`${label} must not contain duplicates.`);
    seen.add(entry);
  }
  return entries;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableHash(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(stable(value)), "utf8"));
}

function canonicalPath(pathname) {
  const normalized = resolve(pathname).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return canonicalPath(left) === canonicalPath(right);
}

function uuid(value, label) {
  const id = requiredString(value, label).toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    fail(`${label} must be a UUID.`);
  }
  return id;
}

function absoluteEvidenceReference(value, label) {
  const reference = object(value, label);
  exactKeys(reference, new Set(["path", "sha256"]), label);
  const pathname = requiredString(reference.path, `${label}.path`);
  if (!isAbsolute(pathname)) fail(`${label}.path must be an absolute coordinator-only path.`);
  return { path: resolve(pathname), sha256: sha256(reference.sha256, `${label}.sha256`) };
}

function readBoundAbsoluteFile(reference, label) {
  const bytes = readRegularFile(reference.path, label);
  const actual = sha256Bytes(bytes);
  if (actual !== reference.sha256) fail(`${label} SHA-256 does not match its coordinator authority reference.`);
  return { path: reference.path, bytes, sha256: actual };
}

function readBoundAbsoluteJson(reference, label) {
  const file = readBoundAbsoluteFile(reference, label);
  let value;
  try {
    value = JSON.parse(file.bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return { ...file, value: object(value, label) };
}

function gitText(worktreeRoot, argumentsList, label) {
  try {
    const output = execFileSync("git", ["-C", worktreeRoot, ...argumentsList], { encoding: "utf8", windowsHide: true }).trim();
    if (!output) fail(`${label} returned no path.`);
    return output;
  } catch (error) {
    fail(`${label} could not be read from the actual worktree: ${error.message}`);
  }
}

function actualGitWorktree(root, label) {
  const topLevel = resolve(root, gitText(root, ["rev-parse", "--show-toplevel"], `${label} Git worktree root`));
  if (!samePath(topLevel, root)) fail(`${label} must be the actual Git worktree root.`);
  const commonGitDirectory = resolve(root, gitText(root, ["rev-parse", "--git-common-dir"], `${label} Git common directory`));
  return { root: canonicalPath(root), commonGitDirectory: canonicalPath(commonGitDirectory) };
}

function parseLedger(bytes, label) {
  let text;
  try {
    text = bytes.toString("utf8");
  } catch (error) {
    fail(`${label} is not UTF-8 text: ${error.message}`);
  }
  const records = [];
  let previous = null;
  for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      fail(`${label} line ${index + 1} is not valid JSON: ${error.message}`);
    }
    object(record, `${label} line ${index + 1}`);
    if (record.version !== 1 || record.sequence !== index + 1 || record.previousSha256 !== previous) {
      fail(`${label} chain is invalid at line ${index + 1}.`);
    }
    const entrySha256 = sha256(record.entrySha256, `${label} line ${index + 1}.entrySha256`);
    const { entrySha256: ignored, ...unsigned } = record;
    if (entrySha256 !== stableHash(unsigned)) fail(`${label} chain hash is invalid at line ${index + 1}.`);
    previous = entrySha256;
    records.push(record);
  }
  if (records.length === 0) fail(`${label} must contain P-3 lifecycle records.`);
  return records;
}

function exactlyOne(records, predicate, label) {
  const matches = records.filter(predicate);
  if (matches.length !== 1) fail(`${label} must contain exactly one matching record.`);
  return matches[0];
}

function evidenceReference(value, label) {
  const evidence = object(value, label);
  exactKeys(evidence, new Set(["path", "sha256"]), label);
  return {
    path: regularPath(evidence.path, `${label}.path`),
    sha256: sha256(evidence.sha256, `${label}.sha256`),
  };
}

// p3-role-packet emits its checked coordinator input reference unchanged in
// the packet manifest.  That reference is necessarily absolute when the
// coordinator plan was stored outside the actual condition worktree.  This
// narrow parser is only for the already checked packet-manifest identity
// authority.  All ordinary P-3 contract and plan evidence remains
// repository-relative through evidenceReference above.
function packetManifestIdentityReference(value, label) {
  const evidence = object(value, label);
  exactKeys(evidence, new Set(["path", "sha256"]), label);
  const pathname = requiredString(evidence.path, `${label}.path`);
  const expectedSha256 = sha256(evidence.sha256, `${label}.sha256`);
  if (!isAbsolute(pathname)) {
    return { path: regularPath(pathname, `${label}.path`), sha256: expectedSha256 };
  }
  const absolutePath = absoluteCoordinatorPath(pathname, `${label}.path`);
  const actualSha256 = sha256Bytes(readRegularFile(absolutePath, label));
  if (actualSha256 !== expectedSha256) {
    fail(`${label} absolute coordinator path SHA-256 does not match its packet-manifest identity reference.`);
  }
  return { path: absolutePath, sha256: expectedSha256 };
}

// Clean-room evidence v2 uses the historical `fileSha256` field for its
// one-way Decision J binding.  Keep that schema separate from ordinary
// coordinator evidence references so an arbitrary extra alias is never
// accepted elsewhere.
function cleanRoomDecisionReference(value, label) {
  const evidence = object(value, label);
  exactKeys(evidence, new Set(["path", "fileSha256"]), label);
  return {
    path: regularPath(evidence.path, `${label}.path`),
    sha256: sha256(evidence.fileSha256, `${label}.fileSha256`),
  };
}

function readRelativeRegularFile(root, relativePath, label) {
  const path = resolve(root, ...relativePath.split("/"));
  assertWithin(root, path, label);
  let cursor = root;
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length - 1; index += 1) {
    cursor = join(cursor, segments[index]);
    if (!existsSync(cursor)) fail(`${label} parent directory does not exist: ${segments.slice(0, index + 1).join("/")}`);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} parent directory must be a real directory: ${segments.slice(0, index + 1).join("/")}`);
  }
  const bytes = readRegularFile(path, label);
  return { path, bytes, sha256: sha256Bytes(bytes) };
}

function readBoundRelativeJson(root, reference, label) {
  const file = readRelativeRegularFile(root, reference.path, label);
  if (file.sha256 !== reference.sha256) fail(`${label} SHA-256 does not match its coordinator authority reference.`);
  let value;
  try {
    value = JSON.parse(file.bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return { ...file, value: object(value, label) };
}

function coordinatorReference(value, label) {
  const reference = object(value, label);
  exactKeys(reference, new Set(["path", "sha256"]), label);
  return {
    path: regularPath(reference.path, `${label}.path`),
    sha256: sha256(reference.sha256, `${label}.sha256`),
  };
}

function readBoundCoordinatorJson(planDirectory, reference, label) {
  const file = readRelativeRegularFile(planDirectory, reference.path, label);
  if (file.sha256 !== reference.sha256) fail(`${label} SHA-256 does not match the coordinator return plan.`);
  let value;
  try {
    value = JSON.parse(file.bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return { ...file, value: object(value, label) };
}

function conditionName(value, label) {
  const condition = requiredString(value, label);
  if (condition !== "baseline" && condition !== "current") fail(`${label} must be baseline or current.`);
  return condition;
}

function validateFrozenPaths(value, label) {
  const paths = uniquePaths(value, label);
  if (paths.length === 0) fail(`${label} must contain at least one path.`);
  if (paths.some((path) => path === RECOVERY_DIRECTORY || path.startsWith(`${RECOVERY_DIRECTORY}/`))) {
    fail(`${label} must not include the coordinator recovery directory.`);
  }
  return paths;
}

function exactPathSequence(actual, expected, label) {
  if (!sameSequence(actual, expected)) fail(`${label} must exactly equal the frozen ordered path scope.`);
}

function implementationIdentity(value, label) {
  const identity = object(value, label);
  exactKeys(identity, new Set(["actor", "contextId"]), label);
  return {
    actor: requiredString(identity.actor, `${label}.actor`),
    contextId: requiredString(identity.contextId, `${label}.contextId`),
  };
}

// A v13 pair-preflight is meaningful only when it came from the v13 gate
// state.  Do not reinterpret v4 (or older) state as equivalent: v5 is where
// the condition-local implementation identity and frozen responsive input
// split were first recorded by figma-gate.
function assertV13PreflightState(state, expected, label) {
  if (state.version !== FIGMA_GATE_ACTIVE_STATE_VERSION) {
    fail(`${label} must use v13 figma-gate active state version ${FIGMA_GATE_ACTIVE_STATE_VERSION}; v4 and every earlier active state are rejected without migration.`);
  }
  if (state.phase !== "preflight" || uuid(state.preflightId, `${label}.preflightId`) !== expected.preflightId) {
    fail(`${label} is not the recorded preflight instance.`);
  }
  if (!samePath(requiredString(state.repository, `${label}.repository`), expected.worktreeRoot)) {
    fail(`${label}.repository does not match the actual condition worktree.`);
  }
  if (!samePath(requiredString(state.manifestPath, `${label}.manifestPath`), expected.manifestPath)
    || sha256(state.manifestSha256, `${label}.manifestSha256`) !== expected.manifestSha256) {
    fail(`${label} is not bound to the frozen condition gate manifest.`);
  }
  const actualImplementation = implementationIdentity(state.implementationIdentity, `${label}.implementationIdentity`);
  const expectedImplementation = implementationIdentity(expected.implementationIdentity, `${label}.expectedImplementationIdentity`);
  if (actualImplementation.actor !== expectedImplementation.actor || actualImplementation.contextId !== expectedImplementation.contextId) {
    fail(`${label}.implementationIdentity does not match the condition comparison contract run.implementation.`);
  }
  const responsiveHtml = object(state.responsiveHtml, `${label}.responsiveHtml`);
  exactKeys(responsiveHtml, new Set(["sourceFiles", "deferredSourceFiles"]), `${label}.responsiveHtml`);
  const sourceFiles = uniquePaths(responsiveHtml.sourceFiles, `${label}.responsiveHtml.sourceFiles`);
  const deferredSourceFiles = uniquePaths(responsiveHtml.deferredSourceFiles, `${label}.responsiveHtml.deferredSourceFiles`);
  const responsivePaths = new Set(sourceFiles.map(asciiFold));
  if (deferredSourceFiles.some((path) => !responsivePaths.has(asciiFold(path)))) {
    fail(`${label}.responsiveHtml.deferredSourceFiles must be a subset of sourceFiles.`);
  }
  if (expected.changeTargets) {
    const stateChangeTargets = validateFrozenPaths(state.changeTargets, `${label}.changeTargets`);
    exactPathSequence(stateChangeTargets, expected.changeTargets, `${label}.changeTargets`);
  }
  return actualImplementation;
}

function validateCleanRoomCondition(value, label) {
  const condition = object(value, label);
  const implementation = object(condition.implementation, `${label}.implementation`);
  const review = object(condition.review, `${label}.review`);
  return {
    condition: conditionName(condition.condition, `${label}.condition`),
    workspaceId: requiredString(condition.workspaceId, `${label}.workspaceId`),
    worktreeRoot: requiredString(condition.worktreeRoot, `${label}.worktreeRoot`),
    implementation: {
      actor: requiredString(implementation.actor, `${label}.implementation.actor`),
      contextId: requiredString(implementation.contextId, `${label}.implementation.contextId`),
    },
    review: {
      actor: requiredString(review.actor, `${label}.review.actor`),
      contextId: requiredString(review.contextId, `${label}.review.contextId`),
    },
    evidencePath: regularPath(condition.evidencePath, `${label}.evidencePath`),
  };
}

function canonicalDirectory(path, label) {
  if (!isAbsolute(path)) fail(`${label} must be an absolute directory path.`);
  return assertRealDirectory(resolve(path), label);
}

function validateContractAuthority(authority, targetRoot) {
  const comparisonContract = readBoundRelativeJson(targetRoot, authority.comparisonContract, "Final P-3 v13 comparison contract");
  const contract = comparisonContract.value;
  if (contract.version !== P3_CONTRACT_VERSION) fail("Final P-3 comparison contract.version must be 13; version 12 and every earlier contract are rejected without migration.");
  if (requiredString(contract.pairId, "Final P-3 comparison contract.pairId") !== authority.pairId) {
    fail("Final P-3 comparison contract.pairId does not match the coordinator return plan.");
  }
  if (conditionName(contract.condition, "Final P-3 comparison contract.condition") !== authority.condition) {
    fail("Final P-3 comparison contract.condition does not match the coordinator return plan.");
  }
  const shared = object(contract.shared, "Final P-3 comparison contract.shared");
  const run = object(contract.run, "Final P-3 comparison contract.run");
  const authorization = object(shared.cleanRoomAuthorization, "Final P-3 comparison contract.shared.cleanRoomAuthorization");
  if (authorization.version !== 1 || requiredString(authorization.pairId, "Final P-3 cleanRoomAuthorization.pairId") !== authority.pairId) {
    fail("Final P-3 cleanRoomAuthorization does not bind the coordinator return plan pairId.");
  }
  const authorizationConditions = array(authorization.conditions, "Final P-3 cleanRoomAuthorization.conditions")
    .map((entry, index) => validateCleanRoomCondition(entry, `Final P-3 cleanRoomAuthorization.conditions[${index}]`));
  if (authorizationConditions.length !== 2 || authorizationConditions[0].condition !== "baseline" || authorizationConditions[1].condition !== "current") {
    fail("Final P-3 cleanRoomAuthorization must contain baseline then current conditions.");
  }
  const conditionAuthorization = authorizationConditions.find((entry) => entry.condition === authority.condition);
  const targetCanonical = assertRealDirectory(targetRoot, "actual target root");
  if (!samePath(canonicalDirectory(conditionAuthorization.worktreeRoot, "Final P-3 cleanRoomAuthorization worktreeRoot"), targetCanonical)) {
    fail("actual target root does not match the final P-3 condition worktreeRoot.");
  }
  if (requiredString(run.workspaceId, "Final P-3 comparison contract.run.workspaceId") !== conditionAuthorization.workspaceId) {
    fail("Final P-3 comparison contract.run.workspaceId does not match its clean-room condition authorization.");
  }
  const runImplementation = object(run.implementation, "Final P-3 comparison contract.run.implementation");
  const runReview = object(run.review, "Final P-3 comparison contract.run.review");
  if (requiredString(runImplementation.actor, "Final P-3 comparison contract.run.implementation.actor") !== conditionAuthorization.implementation.actor
    || requiredString(runImplementation.contextId, "Final P-3 comparison contract.run.implementation.contextId") !== conditionAuthorization.implementation.contextId
    || requiredString(runReview.actor, "Final P-3 comparison contract.run.review.actor") !== conditionAuthorization.review.actor
    || requiredString(runReview.contextId, "Final P-3 comparison contract.run.review.contextId") !== conditionAuthorization.review.contextId) {
    fail("Final P-3 comparison contract run identities do not match its clean-room condition authorization.");
  }

  const decisionReference = evidenceReference(shared.ownerDecisionJ, "Final P-3 comparison contract.shared.ownerDecisionJ");
  const decision = readBoundRelativeJson(targetRoot, decisionReference, "Final P-3 owner Decision J");
  if (decision.value.version !== 2 || requiredString(decision.value.pairId, "Final P-3 owner Decision J.pairId") !== authority.pairId
    || decision.value.status !== "approved" || decision.value.ownerApproved !== true) {
    fail("Final P-3 owner Decision J is not the approved decision for this pair.");
  }
  const decisionScope = object(decision.value.scope, "Final P-3 owner Decision J.scope");
  const decisionCheckpointPlan = stringSequence(decisionScope.checkpointPlan, "Final P-3 owner Decision J.scope.checkpointPlan");
  const decisionChangeTargets = validateFrozenPaths(decisionScope.changeTargets, "Final P-3 owner Decision J.scope.changeTargets");
  exactPathSequence(authority.frozenScope.changeTargets, decisionChangeTargets, "Coordinator return plan frozenScope.changeTargets");
  if (!sameSequence(authority.frozenScope.checkpointPlan, decisionCheckpointPlan)) {
    fail("Coordinator return plan frozenScope.checkpointPlan must exactly equal owner Decision J.");
  }
  if (stableHash(decision.value.cleanRoomAuthorization) !== sha256(decision.value.cleanRoomAuthorizationStableJsonSha256, "Final P-3 owner Decision J.cleanRoomAuthorizationStableJsonSha256")
    || stableHash(decision.value.cleanRoomAuthorization) !== stableHash(authorization)) {
    fail("Final P-3 owner Decision J clean-room authorization does not match the final comparison contract.");
  }

  const gate = object(shared.gate, "Final P-3 comparison contract.shared.gate");
  const gateInputs = object(gate.inputs, "Final P-3 comparison contract.shared.gate.inputs");
  const gateManifest = readBoundRelativeJson(targetRoot, evidenceReference(gateInputs.manifest, "Final P-3 comparison contract.shared.gate.inputs.manifest"), "Frozen Figma gate manifest");
  const gateScope = object(gateManifest.value.scope, "Frozen Figma gate manifest.scope");
  const gateChangeTargets = validateFrozenPaths(gateScope.changeTargets, "Frozen Figma gate manifest.scope.changeTargets");
  exactPathSequence(decisionChangeTargets, gateChangeTargets, "Owner Decision J changeTargets");

  const sourceSnapshot = object(shared.sourceSnapshot, "Final P-3 comparison contract.shared.sourceSnapshot");
  const proof = readBoundRelativeJson(targetRoot, evidenceReference(sourceSnapshot.preImplementationProof, "Final P-3 comparison contract.shared.sourceSnapshot.preImplementationProof"), "Approved P-3 pre-implementation proof");
  if (proof.value.version !== 2 || proof.value.status !== "approved" || proof.value.ownerApproved !== true) {
    fail("Approved P-3 pre-implementation proof is not owner-approved version 2.");
  }
  const proofTargets = validateFrozenPaths(proof.value.unimplementedTargetPaths, "Approved P-3 pre-implementation proof.unimplementedTargetPaths");
  exactPathSequence(decisionChangeTargets, proofTargets, "Approved P-3 pre-implementation proof target paths");

  const cleanRoom = object(run.cleanRoom, "Final P-3 comparison contract.run.cleanRoom");
  const cleanRoomEvidenceReference = evidenceReference(cleanRoom.evidence, "Final P-3 comparison contract.run.cleanRoom.evidence");
  if (cleanRoomEvidenceReference.path !== conditionAuthorization.evidencePath) {
    fail("Final P-3 clean-room evidence path does not match the condition authorization.");
  }
  const cleanRoomEvidence = readBoundRelativeJson(targetRoot, cleanRoomEvidenceReference, "Approved P-3 clean-room evidence");
  if (cleanRoomEvidence.value.version !== 2 || cleanRoomEvidence.value.kind !== "p3-clean-room-evidence"
    || cleanRoomEvidence.value.status !== "approved" || cleanRoomEvidence.value.ownerApproved !== true
    || requiredString(cleanRoomEvidence.value.pairId, "Approved P-3 clean-room evidence.pairId") !== authority.pairId
    || conditionName(cleanRoomEvidence.value.condition, "Approved P-3 clean-room evidence.condition") !== authority.condition) {
    fail("Approved P-3 clean-room evidence does not bind this pair and condition.");
  }
  const evidenceDecisionReference = cleanRoomDecisionReference(cleanRoomEvidence.value.ownerDecisionJ, "Approved P-3 clean-room evidence.ownerDecisionJ");
  if (evidenceDecisionReference.path !== decisionReference.path || evidenceDecisionReference.sha256 !== decisionReference.sha256
    || sha256(cleanRoomEvidence.value.cleanRoomAuthorizationStableJsonSha256, "Approved P-3 clean-room evidence.cleanRoomAuthorizationStableJsonSha256") !== stableHash(authorization)
    || stableHash(cleanRoomEvidence.value.conditionAuthorization) !== stableHash(authorization.conditions.find((entry) => entry.condition === authority.condition))) {
    fail("Approved P-3 clean-room evidence does not match the final P-3 contract authorization.");
  }

  return {
    path: authority.comparisonContract.path,
    sha256: comparisonContract.sha256,
    decision: { path: decisionReference.path, sha256: decisionReference.sha256 },
    cleanRoomAuthorizationStableJsonSha256: stableHash(authorization),
    pairId: authority.pairId,
    condition: authority.condition,
    implementation: implementationIdentity(runImplementation, "Final P-3 comparison contract.run.implementation"),
    checkpointPlan: decisionCheckpointPlan,
    changeTargets: decisionChangeTargets,
  };
}

function pairPreflightCondition(value, label) {
  const condition = object(value, label);
  exactKeys(condition, new Set([
    "condition",
    "worktreeRoot",
    "comparisonContract",
    "gateManifest",
    "preflightState",
    "preflightId",
  ]), label);
  const worktreeRoot = requiredString(condition.worktreeRoot, `${label}.worktreeRoot`);
  if (!isAbsolute(worktreeRoot)) fail(`${label}.worktreeRoot must be an absolute actual-worktree path.`);
  const preflightState = evidenceReference(condition.preflightState, `${label}.preflightState`);
  if (preflightState.path !== ".figma-gate/active.json") {
    fail(`${label}.preflightState.path must be the actual .figma-gate/active.json state path.`);
  }
  return {
    condition: conditionName(condition.condition, `${label}.condition`),
    worktreeRoot: resolve(worktreeRoot),
    comparisonContract: evidenceReference(condition.comparisonContract, `${label}.comparisonContract`),
    gateManifest: evidenceReference(condition.gateManifest, `${label}.gateManifest`),
    preflightState,
    preflightId: uuid(condition.preflightId, `${label}.preflightId`),
  };
}

function parsePairPreflightAuthority(value) {
  const authority = object(value, "authority.pairPreflights");
  exactKeys(authority, new Set(["ledger", "conditions"]), "authority.pairPreflights");
  const conditions = array(authority.conditions, "authority.pairPreflights.conditions")
    .map((entry, index) => pairPreflightCondition(entry, `authority.pairPreflights.conditions[${index}]`));
  if (conditions.length !== 2 || conditions[0].condition !== "baseline" || conditions[1].condition !== "current") {
    fail("authority.pairPreflights.conditions must contain baseline then current exactly once.");
  }
  return { ledger: absoluteEvidenceReference(authority.ledger, "authority.pairPreflights.ledger"), conditions };
}

function contractGateReference(contract, label) {
  const shared = object(contract.shared, `${label}.shared`);
  const gate = object(shared.gate, `${label}.shared.gate`);
  const inputs = object(gate.inputs, `${label}.shared.gate.inputs`);
  return evidenceReference(inputs.manifest, `${label}.shared.gate.inputs.manifest`);
}

function worktreeContractPath(worktreeRoot, absoluteContractPath, label) {
  const candidate = relative(worktreeRoot, absoluteContractPath).replace(/\\/g, "/");
  const path = regularPath(candidate, label);
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function readPairPreflightCondition(entry, pairId, targetRoot, ledgerPath) {
  const worktreeRoot = canonicalDirectory(entry.worktreeRoot, `Pair-preflight ${entry.condition} worktreeRoot`);
  const git = actualGitWorktree(worktreeRoot, `Pair-preflight ${entry.condition}`);
  const actualLedgerPath = join(git.commonGitDirectory, PAIR_LEDGER_NAME);
  if (!samePath(actualLedgerPath, ledgerPath)) {
    fail(`Pair-preflight ${entry.condition} ledger must be the actual common-Git P-3 ledger.`);
  }
  const comparison = readBoundRelativeJson(worktreeRoot, entry.comparisonContract, `Pair-preflight ${entry.condition} comparison contract`);
  const contract = comparison.value;
  if (contract.version !== P3_CONTRACT_VERSION || requiredString(contract.pairId, `Pair-preflight ${entry.condition} comparison contract.pairId`) !== pairId
    || conditionName(contract.condition, `Pair-preflight ${entry.condition} comparison contract.condition`) !== entry.condition) {
    fail(`Pair-preflight ${entry.condition} comparison contract is not the actual v13 contract for this pair and condition.`);
  }
  const contractGate = contractGateReference(contract, `Pair-preflight ${entry.condition} comparison contract`);
  if (contractGate.path !== entry.gateManifest.path || contractGate.sha256 !== entry.gateManifest.sha256) {
    fail(`Pair-preflight ${entry.condition} gate manifest does not match its final v13 comparison contract.`);
  }
  const frozenGate = readBoundRelativeJson(worktreeRoot, entry.gateManifest, `Pair-preflight ${entry.condition} frozen gate manifest`);
  const frozenGateScope = object(frozenGate.value.scope, `Pair-preflight ${entry.condition} frozen gate manifest.scope`);
  const frozenGateChangeTargets = validateFrozenPaths(frozenGateScope.changeTargets, `Pair-preflight ${entry.condition} frozen gate manifest.scope.changeTargets`);
  // `active.json` is intentionally mutable after pair-preflight: every real
  // figma-gate checkpoint appends its own evidence to this same state file.
  // The plan SHA remains a historical binding to the pair-preflight ledger;
  // later return attempts therefore validate that historical SHA against the
  // ledger below, while the live state must retain the same preflightId.
  const stateFile = readRelativeRegularFile(worktreeRoot, entry.preflightState.path, `Pair-preflight ${entry.condition} active gate state`);
  let stateValue;
  try {
    stateValue = JSON.parse(stateFile.bytes.toString("utf8"));
  } catch (error) {
    fail(`Pair-preflight ${entry.condition} active gate state is not valid JSON: ${error.message}`);
  }
  const state = { ...stateFile, value: object(stateValue, `Pair-preflight ${entry.condition} active gate state`) };
  const activeImplementationIdentity = assertV13PreflightState(state.value, {
    worktreeRoot,
    manifestPath: resolve(worktreeRoot, ...entry.gateManifest.path.split("/")),
    manifestSha256: entry.gateManifest.sha256,
    preflightId: entry.preflightId,
    implementationIdentity: object(object(contract.run, `Pair-preflight ${entry.condition} comparison contract.run`).implementation, `Pair-preflight ${entry.condition} comparison contract.run.implementation`),
    changeTargets: frozenGateChangeTargets,
  }, `Pair-preflight ${entry.condition} active gate state`);
  const actualTarget = canonicalPath(targetRoot);
  return {
    ...entry,
    worktreeRoot,
    git,
    comparison,
    contract,
    contractStableSha256: stableHash(contract),
    runStableSha256: stableHash(object(contract.run, `Pair-preflight ${entry.condition} comparison contract.run`)),
    contractPath: worktreeContractPath(worktreeRoot, comparison.path, `Pair-preflight ${entry.condition} repository-relative comparison contract path`),
    liveActiveStateSha256: state.sha256,
    implementationIdentity: activeImplementationIdentity,
    isActualTarget: canonicalPath(worktreeRoot) === actualTarget,
  };
}

function validatePairPreflights(authority, targetRoot) {
  const preflights = authority.pairPreflights;
  const ledger = readBoundAbsoluteFile(preflights.ledger, "Coordinator-only frozen P-3 pair ledger");
  const entries = preflights.conditions.map((entry) => readPairPreflightCondition(entry, authority.pairId, targetRoot, ledger.path));
  const own = entries.find((entry) => entry.condition === authority.condition);
  if (!own || !own.isActualTarget) fail("Coordinator return plan condition does not name the actual target worktree in authority.pairPreflights.");
  if (own.comparisonContract.path !== authority.comparisonContract.path || own.comparison.sha256 !== authority.contract.sha256) {
    fail("Coordinator return plan self pair-preflight contract does not exactly match authority.comparisonContract.");
  }
  if (entries.some((entry) => entry.git.commonGitDirectory !== entries[0].git.commonGitDirectory)) {
    fail("Both pair-preflight worktrees must resolve to the same actual common Git directory.");
  }
  if (entries[0].contractPath !== entries[1].contractPath) {
    fail("Both pair-preflight contracts must use the same repository-relative contract path.");
  }
  const records = parseLedger(ledger.bytes, "Coordinator-only frozen P-3 pair ledger");
  const pairRecords = records.filter((record) => record.pairId === authority.pairId);
  if (pairRecords.some((record) => record.kind === "aborted" || record.kind === "completed")) {
    fail(`P-3 pair ${authority.pairId} is terminal and cannot receive a role return.`);
  }
  if (pairRecords.some((record) => record.kind !== "started" && record.kind !== "preflight-recorded")) {
    fail(`P-3 pair ${authority.pairId} has lifecycle records beyond pair-begin and pair-preflight before a role return.`);
  }
  const baseline = entries.find((entry) => entry.condition === "baseline");
  const current = entries.find((entry) => entry.condition === "current");
  const started = exactlyOne(pairRecords, (record) => record.kind === "started", `P-3 pair ${authority.pairId} ledger`);
  if (started.contractVersion !== P3_CONTRACT_VERSION
    || requiredString(started.contractPath, "P-3 pair started contractPath") !== baseline.contractPath
    || sha256(started.baselineContractSha256, "P-3 pair started baselineContractSha256") !== baseline.contractStableSha256
    || sha256(started.baselineRunIntentSha256, "P-3 pair started baselineRunIntentSha256") !== baseline.runStableSha256
    || !samePath(requiredString(started.ledgerPath, "P-3 pair started ledgerPath"), ledger.path)) {
    fail("P-3 pair started ledger record does not bind the actual baseline v13 contract and common-Git ledger.");
  }
  const pairLockPath = join(dirname(ledger.path), PAIR_LOCK_DIRECTORY, `${sha256Bytes(Buffer.from(authority.pairId, "utf8"))}.json`);
  const pairLock = readJson(pairLockPath, "Actual fixed P-3 pair lock");
  if (pairLock.version !== 5 || pairLock.contractVersion !== P3_CONTRACT_VERSION
    || requiredString(pairLock.pairId, "Actual fixed P-3 pair lock.pairId") !== authority.pairId
    || requiredString(pairLock.contractPath, "Actual fixed P-3 pair lock.contractPath") !== baseline.contractPath
    || !samePath(requiredString(pairLock.ledgerPath, "Actual fixed P-3 pair lock.ledgerPath"), ledger.path)) {
    fail("Actual fixed P-3 pair lock does not bind this pair, v13 contract path, and common-Git ledger.");
  }
  for (const entry of entries) {
    const record = exactlyOne(pairRecords, (candidate) => candidate.kind === "preflight-recorded" && candidate.condition === entry.condition,
      `P-3 pair ${authority.pairId} ${entry.condition} pair-preflight ledger`);
    const recordedImplementationIdentity = implementationIdentity(record.implementationIdentity, `P-3 ${entry.condition} pair-preflight implementationIdentity`);
    if (record.contractVersion !== P3_CONTRACT_VERSION
      || recordedImplementationIdentity.actor !== entry.implementationIdentity.actor
      || recordedImplementationIdentity.contextId !== entry.implementationIdentity.contextId
      || requiredString(record.contractPath, `P-3 ${entry.condition} pair-preflight contractPath`) !== entry.contractPath
      || sha256(record.contractSha256, `P-3 ${entry.condition} pair-preflight contractSha256`) !== entry.contractStableSha256
      || sha256(record.runIntentSha256, `P-3 ${entry.condition} pair-preflight runIntentSha256`) !== entry.runStableSha256
      || !samePath(requiredString(record.worktreeRoot, `P-3 ${entry.condition} pair-preflight worktreeRoot`), entry.worktreeRoot)
      || uuid(record.preflightId, `P-3 ${entry.condition} pair-preflight preflightId`) !== entry.preflightId
      || sha256(record.preflightStateSha256, `P-3 ${entry.condition} pair-preflight preflightStateSha256`) !== entry.preflightState.sha256) {
      fail(`P-3 ${entry.condition} pair-preflight ledger record does not bind the actual v13 contract, implementation identity, gate state, and preflight ID.`);
    }
  }
  return {
    ledger: { path: ledger.path, sha256: ledger.sha256 },
    baseline: {
      preflightId: baseline.preflightId,
      contractSha256: baseline.comparison.sha256,
      gateManifestSha256: baseline.gateManifest.sha256,
      historicPreflightStateSha256: baseline.preflightState.sha256,
      liveActiveStateSha256: baseline.liveActiveStateSha256,
    },
    current: {
      preflightId: current.preflightId,
      contractSha256: current.comparison.sha256,
      gateManifestSha256: current.gateManifest.sha256,
      historicPreflightStateSha256: current.preflightState.sha256,
      liveActiveStateSha256: current.liveActiveStateSha256,
    },
  };
}

function normalizeManifestAttachments(value, label, requireRegistryId) {
  const attachments = array(value, label);
  if (attachments.length === 0) fail(`${label} must contain at least one attachment.`);
  const seen = new Set();
  return attachments.map((entry, index) => {
    const attachment = object(entry, `${label}[${index}]`);
    if (requireRegistryId) {
      for (const key of ["attachmentId", "logicalPath", "origin", "sha256"]) {
        if (!(key in attachment)) fail(`${label}[${index}].${key} is required.`);
      }
      requiredString(attachment.attachmentId, `${label}[${index}].attachmentId`);
    }
    const logicalPath = regularPath(attachment.logicalPath, `${label}[${index}].logicalPath`);
    const origin = requiredString(attachment.origin, `${label}[${index}].origin`);
    const digest = sha256(attachment.sha256, `${label}[${index}].sha256`);
    const key = asciiFold(logicalPath);
    if (seen.has(key)) fail(`${label} has duplicate logicalPath: ${logicalPath}`);
    seen.add(key);
    return { logicalPath, origin, sha256: digest };
  }).sort((left, right) => compareUtf8(left.logicalPath, right.logicalPath));
}

function validateConditionLocalDeliveryProgress(value, label) {
  const progress = object(value, label);
  exactKeys(progress, new Set(["version", "scope", "initialDeliverySequence", "increment"]), label);
  if (progress.version !== 1) fail(`${label}.version must be 1.`);
  if (requiredString(progress.scope, `${label}.scope`) !== "per-condition") {
    fail(`${label}.scope must be per-condition.`);
  }
  const initialDeliverySequence = positiveInteger(progress.initialDeliverySequence, `${label}.initialDeliverySequence`);
  const increment = positiveInteger(progress.increment, `${label}.increment`);
  if (initialDeliverySequence !== 1 || increment !== 1) {
    fail(`${label} must fix each condition's initial delivery sequence and increment to 1.`);
  }
  return { version: 1, scope: "per-condition", initialDeliverySequence, increment };
}

function validateHandoffProtocol(protocol, authority, component, allowedChangeTargets, attemptOneCreatePaths, derivedBootstrapDirectories) {
  if (protocol.value.schema !== "p3-role-handoff-protocol/v2" || protocol.value.recordState !== "finalized"
    || protocol.value.ownerApproved !== true || protocol.value.aBIdentical !== true
    || requiredString(protocol.value.pairId, "Coordinator handoff protocol.pairId") !== authority.pairId) {
    fail("Coordinator handoff protocol is not an owner-approved, A/B-identical finalized record for this pair.");
  }
  const coordinatorOnly = object(protocol.value.coordinatorOnly, "Coordinator handoff protocol.coordinatorOnly");
  for (const key of ["actualWorktree", "commonGitDirectory", "p3Lifecycle", "comparisonContract", "ownerDecisionJ", "cleanRoomEvidence"]) {
    if (coordinatorOnly[key] !== true) fail(`Coordinator handoff protocol.coordinatorOnly.${key} must be true.`);
  }
  const loop = object(protocol.value.implementationLoop, "Coordinator handoff protocol.implementationLoop");
  const scopes = array(loop.componentReturnScopes, "Coordinator handoff protocol.implementationLoop.componentReturnScopes");
  if (scopes.length !== authority.frozenScope.checkpointPlan.length) {
    fail("Coordinator handoff protocol componentReturnScopes must exactly cover the frozen checkpointPlan.");
  }
  const creationOwners = new Map();
  const normalizedScopes = scopes.map((candidate, index) => {
    const scope = object(candidate, `Coordinator handoff protocol component return scope[${index}]`);
    exactKeys(scope, new Set([
      "elementId",
      "sequence",
      "componentDecisionCodePath",
      "allowedChangeTargets",
      "attemptOneCreatePaths",
      "derivedBootstrapDirectories",
    ]), `Coordinator handoff protocol component return scope[${index}]`);
    const elementId = requiredString(scope.elementId, `Coordinator handoff protocol component return scope[${index}].elementId`);
    const sequence = positiveInteger(scope.sequence, `Coordinator handoff protocol component return scope[${index}].sequence`);
    if (sequence !== index + 1 || authority.frozenScope.checkpointPlan[index] !== elementId) {
      fail("Coordinator handoff protocol componentReturnScopes must retain the frozen checkpointPlan order.");
    }
    const scopeAllowedChangeTargets = uniquePaths(scope.allowedChangeTargets, `Coordinator handoff protocol component return scope[${index}].allowedChangeTargets`);
    const scopeAttemptOneCreatePaths = validateAttemptOneCreatePaths(
      scope.attemptOneCreatePaths,
      `Coordinator handoff protocol component return scope[${index}].attemptOneCreatePaths`,
      scopeAllowedChangeTargets,
    );
    const scopeDerivedBootstrapDirectories = validateDerivedBootstrapDirectories(
      scope.derivedBootstrapDirectories,
      `Coordinator handoff protocol component return scope[${index}].derivedBootstrapDirectories`,
      scopeAttemptOneCreatePaths,
    );
    for (const target of scopeAttemptOneCreatePaths) {
      const key = asciiFold(target);
      if (creationOwners.has(key)) {
        fail(`Coordinator handoff protocol attemptOneCreatePaths assigns a target to more than one sequence: ${target}`);
      }
      creationOwners.set(key, { target, sequence, elementId });
    }
    return {
      elementId,
      sequence,
      componentDecisionCodePath: requiredString(scope.componentDecisionCodePath, `Coordinator handoff protocol component return scope[${index}].componentDecisionCodePath`),
      allowedChangeTargets: scopeAllowedChangeTargets,
      attemptOneCreatePaths: scopeAttemptOneCreatePaths,
      derivedBootstrapDirectories: scopeDerivedBootstrapDirectories,
    };
  });
  const frozenTargets = new Map(authority.frozenScope.changeTargets.map((target) => [asciiFold(target), target]));
  validateP3HeroLaurelProtocolOwnership(normalizedScopes, authority.frozenScope.changeTargets);
  if (creationOwners.size !== frozenTargets.size) {
    fail("Coordinator handoff protocol attemptOneCreatePaths must form an exactly-once partition of every frozen changeTarget.");
  }
  for (const [key, target] of frozenTargets) {
    if (!creationOwners.has(key)) {
      fail(`Coordinator handoff protocol attemptOneCreatePaths is missing a frozen changeTarget creator: ${target}`);
    }
  }
  const matches = normalizedScopes.filter((scope) => scope.elementId === component.elementId);
  if (matches.length !== 1) fail("Coordinator handoff protocol must contain exactly one scope for this component elementId.");
  const scope = matches[0];
  if (positiveInteger(scope.sequence, "Coordinator handoff protocol component return scope.sequence") !== component.sequence) {
    fail("Coordinator handoff protocol component sequence does not match the coordinator return plan.");
  }
  if (requiredString(scope.componentDecisionCodePath, "Coordinator handoff protocol component return scope.componentDecisionCodePath") !== component.componentDecisionCodePath) {
    fail("Coordinator handoff protocol componentDecisionCodePath does not match the coordinator return plan.");
  }
  const protocolTargets = uniquePaths(scope.allowedChangeTargets, "Coordinator handoff protocol component return scope.allowedChangeTargets");
  if (!sameSequence(protocolTargets, allowedChangeTargets)) {
    fail("component.allowedChangeTargets must exactly match the coordinator handoff protocol component scope.");
  }
  if (!sameSequence(scope.attemptOneCreatePaths, attemptOneCreatePaths)) {
    fail("component.attemptOneCreatePaths must exactly match the coordinator handoff protocol component scope.");
  }
  if (!sameSequence(scope.derivedBootstrapDirectories, derivedBootstrapDirectories)) {
    fail("component.derivedBootstrapDirectories must exactly match the coordinator handoff protocol component scope.");
  }
  const maxAttemptsPerComponent = positiveInteger(loop.maxAttemptsPerComponent, "Coordinator handoff protocol.implementationLoop.maxAttemptsPerComponent");
  if (component.attempt > maxAttemptsPerComponent) {
    fail("component.attempt exceeds the finalized coordinator handoff protocol maxAttemptsPerComponent.");
  }
  return {
    path: protocol.path,
    sha256: protocol.sha256,
    componentDecisionCodePath: component.componentDecisionCodePath,
    maxAttemptsPerComponent,
    attemptOneCreatePaths: scope.attemptOneCreatePaths,
    derivedBootstrapDirectories: scope.derivedBootstrapDirectories,
  };
}

function validateHandoffAuthority(authority, handoffInput, planDirectory, component, allowedChangeTargets, attemptOneCreatePaths, derivedBootstrapDirectories) {
  const handoff = object(handoffInput, "authority.handoff");
  exactKeys(handoff, new Set(["opaqueHandoffId", "deliverySequence", "deliveryProgress", "protocol", "registry", "packetManifest"]), "authority.handoff");
  const opaqueHandoffId = requiredString(handoff.opaqueHandoffId, "authority.handoff.opaqueHandoffId");
  const deliverySequence = positiveInteger(handoff.deliverySequence, "authority.handoff.deliverySequence");
  const deliveryProgress = validateConditionLocalDeliveryProgress(handoff.deliveryProgress, "authority.handoff.deliveryProgress");
  const protocolReferences = object(handoff.protocol, "authority.handoff.protocol");
  exactKeys(protocolReferences, new Set(["self", "peer"]), "authority.handoff.protocol");
  const selfProtocolReference = coordinatorReference(protocolReferences.self, "authority.handoff.protocol.self");
  const peerProtocolReference = coordinatorReference(protocolReferences.peer, "authority.handoff.protocol.peer");
  const protocol = readBoundCoordinatorJson(planDirectory, selfProtocolReference, "Coordinator A/B-identical handoff protocol");
  const peerProtocol = readBoundCoordinatorJson(planDirectory, peerProtocolReference, "Coordinator peer handoff protocol");
  if (protocol.sha256 !== peerProtocol.sha256 || !protocol.bytes.equals(peerProtocol.bytes)) {
    fail("Coordinator A/B handoff protocol copies must be byte-identical.");
  }
  const protocolBinding = validateHandoffProtocol(protocol, authority, component, allowedChangeTargets, attemptOneCreatePaths, derivedBootstrapDirectories);
  const registry = readBoundCoordinatorJson(planDirectory, coordinatorReference(handoff.registry, "authority.handoff.registry"), "Coordinator handoff registry");
  if (registry.value.schema !== "p3-role-handoff-registry/v2" || registry.value.recordState !== "finalized"
    || registry.value.executionState !== false || registry.value.ownerApproved !== true
    || registry.value.aBIdentical !== true || registry.value.aBByteIdentical !== true
    || registry.value.deliveryMode !== "attachment-only" || registry.value.coordinatorOnly !== true) {
    fail("Coordinator handoff registry is not an owner-approved finalized coordinator-only p3-role-handoff-registry/v2 record.");
  }
  const registryDeliveryProgress = validateConditionLocalDeliveryProgress(
    registry.value.deliveryProgress,
    "Coordinator handoff registry.deliveryProgress",
  );
  if (stableHash(registryDeliveryProgress) !== stableHash(deliveryProgress)) {
    fail("Coordinator handoff registry deliveryProgress does not match the condition-local return plan.");
  }
  const registryProtocol = coordinatorReference(registry.value.protocol, "Coordinator handoff registry.protocol");
  if (registryProtocol.path !== selfProtocolReference.path || registryProtocol.sha256 !== selfProtocolReference.sha256) {
    fail("Coordinator handoff registry protocol does not match the coordinator return-plan protocol.");
  }
  const recipients = array(registry.value.recipientPackets, "Coordinator handoff registry.recipientPackets");
  const matched = recipients.filter((entry) => object(entry, "Coordinator handoff registry.recipientPackets[]").opaqueHandoffId === opaqueHandoffId);
  if (matched.length !== 1) fail("Coordinator handoff registry must contain exactly one matching opaqueHandoffId.");
  const recipient = object(matched[0], "Coordinator handoff registry matching recipient");
  if (requiredString(recipient.roleKind, "Coordinator handoff registry matching recipient.roleKind") !== "implementation"
    || requiredString(recipient.coordinatorConditionBinding, "Coordinator handoff registry matching recipient.coordinatorConditionBinding") !== authority.condition
    || positiveInteger(recipient.deliverySequence, "Coordinator handoff registry matching recipient.deliverySequence") !== deliverySequence) {
    fail("Coordinator handoff registry recipient does not match return-plan condition, role, or delivery sequence.");
  }
  const scan = object(recipient.identityLeakScan, "Coordinator handoff registry matching recipient.identityLeakScan");
  if (scan.result !== "clear") fail("Coordinator handoff registry recipient identityLeakScan.result must be clear.");
  const registryAttachments = normalizeManifestAttachments(recipient.attachments, "Coordinator handoff registry matching recipient.attachments", true);

  const packet = readBoundCoordinatorJson(planDirectory, coordinatorReference(handoff.packetManifest, "authority.handoff.packetManifest"), "Coordinator role packet manifest");
  if (packet.value.version !== 3 || packet.value.kind !== "p3-role-packet-manifest" || packet.value.coordinatorOnly !== true) {
    fail("Coordinator role packet manifest is not a coordinator-only p3-role-packet-manifest version 3.");
  }
  const identityAuthority = object(packet.value.identityAuthority, "Coordinator role packet manifest.identityAuthority");
  if (requiredString(identityAuthority.pairId, "Coordinator role packet manifest.identityAuthority.pairId") !== authority.pairId
    || conditionName(identityAuthority.recipientCondition, "Coordinator role packet manifest.identityAuthority.recipientCondition") !== authority.condition) {
    fail("Coordinator role packet manifest identity authority does not match return-plan pairId and condition.");
  }
  const packetContract = packetManifestIdentityReference(identityAuthority.comparisonContract, "Coordinator role packet manifest.identityAuthority.comparisonContract");
  const packetDecision = packetManifestIdentityReference(identityAuthority.ownerDecisionJ, "Coordinator role packet manifest.identityAuthority.ownerDecisionJ");
  if (packetContract.sha256 !== authority.comparisonContract.sha256
    || packetDecision.sha256 !== authority.contract.decision.sha256
    || sha256(identityAuthority.cleanRoomAuthorizationStableJsonSha256, "Coordinator role packet manifest.identityAuthority.cleanRoomAuthorizationStableJsonSha256") !== authority.contract.cleanRoomAuthorizationStableJsonSha256) {
    fail("Coordinator role packet manifest authority references do not match the final P-3 contract.");
  }
  const packetAttachments = normalizeManifestAttachments(packet.value.roleAttachments, "Coordinator role packet manifest.roleAttachments", false);
  if (registryAttachments.length !== packetAttachments.length
    || registryAttachments.some((entry, index) => entry.logicalPath !== packetAttachments[index].logicalPath
      || entry.origin !== packetAttachments[index].origin || entry.sha256 !== packetAttachments[index].sha256)) {
    fail("Coordinator handoff registry attachments do not exactly match the packet manifest.");
  }
  return {
    opaqueHandoffId,
    deliverySequence,
    deliveryProgress,
    protocol: { ...protocolBinding, peer: { path: peerProtocolReference.path, sha256: peerProtocolReference.sha256 } },
    registry: { path: handoff.registry.path, sha256: registry.sha256 },
    packetManifest: { path: handoff.packetManifest.path, sha256: packet.sha256 },
  };
}

function absoluteCoordinatorPath(value, label, { directory = false } = {}) {
  const pathname = requiredString(value, label);
  if (!isAbsolute(pathname)) fail(`${label} must be an absolute coordinator-only path.`);
  const path = resolve(pathname);
  const parent = dirname(path);
  assertRealDirectory(parent, `${label} parent directory`);
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) {
      fail(`${label} must be a real ${directory ? "directory" : "regular file"}, not a symlink or special file.`);
    }
  }
  return path;
}

function parseProgressAuthority(value) {
  const progress = object(value, "authority.progress");
  exactKeys(progress, new Set(["ledgerPath", "checkpointProofDirectory"]), "authority.progress");
  const ledgerPath = absoluteCoordinatorPath(progress.ledgerPath, "authority.progress.ledgerPath");
  if (!ledgerPath.toLowerCase().endsWith(".jsonl")) fail("authority.progress.ledgerPath must end in .jsonl.");
  const checkpointProofDirectory = absoluteCoordinatorPath(progress.checkpointProofDirectory, "authority.progress.checkpointProofDirectory", { directory: true });
  if (!existsSync(checkpointProofDirectory)) {
    // The proof directory is created only by --record-checkpoint.  Its parent
    // was already proven real above; leaving it absent avoids a check-only
    // command changing coordinator state.
    if (existsSync(checkpointProofDirectory)) fail("authority.progress.checkpointProofDirectory is invalid.");
  }
  return { ledgerPath, checkpointProofDirectory };
}

function assertPathOutside(path, forbiddenDirectory, label) {
  if (pathsOverlap(resolve(path), resolve(forbiddenDirectory))) {
    fail(`${label} must stay outside role-visible or runtime-owned directories.`);
  }
}

function isWithinDirectory(parent, candidate) {
  const route = relative(resolve(parent), resolve(candidate));
  return route === "" || (!route.startsWith("..") && !isAbsolute(route));
}

function validateProgressIsolation(progress, authority, inputStagingRoot, planDirectory) {
  const forbidden = [inputStagingRoot, ...authority.pairPreflights.conditions.map((entry) => entry.worktreeRoot)];
  for (const entry of authority.pairPreflights.conditions) {
    const worktree = canonicalDirectory(entry.worktreeRoot, `authority.progress ${entry.condition} actual worktree`);
    forbidden.push(actualGitWorktree(worktree, `authority.progress ${entry.condition}`).commonGitDirectory);
  }
  for (const root of forbidden) {
    assertPathOutside(progress.ledgerPath, root, "authority.progress.ledgerPath");
    assertPathOutside(progress.checkpointProofDirectory, root, "authority.progress.checkpointProofDirectory");
  }
  // The plan and progress store may share a coordinator-only parent, but the
  // plan itself may not be placed under a role input staging tree (checked
  // above).  This explicit comparison makes that boundary auditable.
  if (isWithinDirectory(inputStagingRoot, planDirectory)) {
    fail("Coordinator-only role return plan directory must stay outside component.inputStaging.root.");
  }
  return progress;
}

function validatePlan(planPathValue, targetRootValue) {
  const planPath = resolve(process.cwd(), requiredString(planPathValue, "plan path"));
  const plan = object(readJson(planPath, "Coordinator-only role return plan"), "Coordinator-only role return plan");
  exactKeys(plan, new Set(["version", "kind", "authority", "component"]), "Coordinator-only role return plan");
  if (plan.version !== RETURN_PLAN_VERSION) fail(`Coordinator-only role return plan.version must be ${RETURN_PLAN_VERSION}.`);
  if (plan.kind !== "p3-role-return-plan") fail("Coordinator-only role return plan.kind must be p3-role-return-plan.");
  const planDirectory = dirname(planPath);
  const authorityInput = object(plan.authority, "authority");
  exactKeys(authorityInput, new Set(["pairId", "condition", "comparisonContract", "frozenScope", "pairPreflights", "handoff", "progress"]), "authority");
  const authority = {
    pairId: requiredString(authorityInput.pairId, "authority.pairId"),
    condition: conditionName(authorityInput.condition, "authority.condition"),
    comparisonContract: evidenceReference(authorityInput.comparisonContract, "authority.comparisonContract"),
    frozenScope: object(authorityInput.frozenScope, "authority.frozenScope"),
    pairPreflights: parsePairPreflightAuthority(authorityInput.pairPreflights),
    progress: parseProgressAuthority(authorityInput.progress),
  };
  exactKeys(authority.frozenScope, new Set(["checkpointPlan", "changeTargets"]), "authority.frozenScope");
  authority.frozenScope = {
    checkpointPlan: stringSequence(authority.frozenScope.checkpointPlan, "authority.frozenScope.checkpointPlan"),
    changeTargets: validateFrozenPaths(authority.frozenScope.changeTargets, "authority.frozenScope.changeTargets"),
  };
  const requestedTargetRoot = resolve(process.cwd(), requiredString(targetRootValue, "actual target root"));
  const targetRoot = assertRealDirectory(requestedTargetRoot, "actual target root");
  authority.contract = validateContractAuthority(authority, targetRoot);

  const componentInput = object(plan.component, "component");
  exactKeys(componentInput, new Set([
    "elementId",
    "componentDecisionCodePath",
    "attempt",
    "sequence",
    "inputStaging",
    "allowedChangeTargets",
    "attemptOneCreatePaths",
    "derivedBootstrapDirectories",
    "filePolicies",
  ]), "component");
  const component = {
    elementId: requiredString(componentInput.elementId, "component.elementId"),
    componentDecisionCodePath: requiredString(componentInput.componentDecisionCodePath, "component.componentDecisionCodePath"),
    attempt: positiveInteger(componentInput.attempt, "component.attempt"),
    sequence: positiveInteger(componentInput.sequence, "component.sequence"),
  };
  if (component.sequence > authority.frozenScope.checkpointPlan.length
    || authority.frozenScope.checkpointPlan[component.sequence - 1] !== component.elementId) {
    fail("component sequence and elementId must match the frozen checkpointPlan.");
  }
  const allowedChangeTargets = uniquePaths(componentInput.allowedChangeTargets, "component.allowedChangeTargets");
  if (allowedChangeTargets.length === 0) fail("component.allowedChangeTargets must contain at least one path.");
  const frozenTargetSet = new Set(authority.frozenScope.changeTargets.map(asciiFold));
  for (const path of allowedChangeTargets) {
    if (!frozenTargetSet.has(asciiFold(path))) fail(`component.allowedChangeTargets is outside final frozen changeTargets: ${path}`);
  }
  const attemptOneCreatePaths = validateAttemptOneCreatePaths(
    componentInput.attemptOneCreatePaths,
    "component.attemptOneCreatePaths",
    allowedChangeTargets,
  );
  validateP3HeroLaurelScopeOwnership(
    { sequence: component.sequence, allowedChangeTargets, attemptOneCreatePaths },
    authority.frozenScope.changeTargets,
    "component return plan",
  );
  const derivedBootstrapDirectories = validateDerivedBootstrapDirectories(
    componentInput.derivedBootstrapDirectories,
    "component.derivedBootstrapDirectories",
    attemptOneCreatePaths,
  );
  const inputStaging = object(componentInput.inputStaging, "component.inputStaging");
  exactKeys(inputStaging, new Set(["root", "sha256"]), "component.inputStaging");
  const inputStagingRelativeRoot = regularPath(inputStaging.root, "component.inputStaging.root");
  const inputStagingExpectedSha256 = sha256(inputStaging.sha256, "component.inputStaging.sha256");
  const inputStagingRoot = resolve(planDirectory, inputStagingRelativeRoot);
  assertWithin(planDirectory, inputStagingRoot, "component.inputStaging.root");
  if (relative(inputStagingRoot, planPath) === "" || (!relative(inputStagingRoot, planPath).startsWith("..") && !isAbsolute(relative(inputStagingRoot, planPath)))) {
    fail("Coordinator-only role return plan must not be stored inside component.inputStaging.root.");
  }
  const canonicalInputStagingRoot = assertRealDirectory(inputStagingRoot, "component.inputStaging.root");
  if (pathsOverlap(canonicalInputStagingRoot, targetRoot)) fail("component.inputStaging.root must not overlap the actual target root.");
  const actualInputStagingSha256 = hashInputStaging(canonicalInputStagingRoot);
  if (actualInputStagingSha256 !== inputStagingExpectedSha256) {
    fail("component.inputStaging.sha256 does not match the current inputStaging tree.");
  }
  const filePolicies = validatePolicies(
    componentInput.filePolicies,
    allowedChangeTargets,
    authority.frozenScope.checkpointPlan,
    component,
    attemptOneCreatePaths,
  );
  authority.progress = validateProgressIsolation(authority.progress, authority, canonicalInputStagingRoot, planDirectory);
  authority.handoff = validateHandoffAuthority(
    authority,
    authorityInput.handoff,
    planDirectory,
    component,
    allowedChangeTargets,
    attemptOneCreatePaths,
    derivedBootstrapDirectories,
  );
  authority.preflights = validatePairPreflights(authority, targetRoot);
  return {
    path: planPath,
    sha256: sha256File(planPath),
    authority,
    component: {
      ...component,
      inputStagingRoot: canonicalInputStagingRoot,
      inputStagingSha256: actualInputStagingSha256,
      allowedChangeTargets,
      allowedTargets: new Set(allowedChangeTargets.map(asciiFold)),
      filePolicies,
      attemptOneCreatePaths,
      attemptOneCreateTargetSet: new Set(attemptOneCreatePaths.map(asciiFold)),
      derivedBootstrapDirectories,
    },
  };
}

function allZero(bytes) {
  for (const byte of bytes) if (byte !== 0) return false;
  return true;
}

function tarText(bytes, label) {
  let end = 0;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  for (let index = end; index < bytes.length; index += 1) {
    if (bytes[index] !== 0 && bytes[index] !== 0x20) fail(`${label} has invalid padding.`);
  }
  const content = bytes.subarray(0, end);
  for (const byte of content) {
    if (byte < 0x20 || byte > 0x7e) fail(`${label} must use printable ASCII characters only.`);
  }
  return content.toString("ascii");
}

function tarNumber(bytes, label) {
  let text = "";
  let stopped = false;
  for (const byte of bytes) {
    if (byte === 0 || byte === 0x20) {
      stopped = true;
      continue;
    }
    if (stopped || byte < 0x30 || byte > 0x37) fail(`${label} must be an octal field.`);
    text += String.fromCharCode(byte);
  }
  if (text === "") return 0;
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} is outside the safe range.`);
  return value;
}

function tarChecksum(header) {
  let sum = 0;
  for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  return sum;
}

function tarEntryType(type) {
  if (type === 0 || type === 0x30) return "regular";
  if (type === 0x31) return "hard link";
  if (type === 0x32) return "symlink";
  if (type === 0x35) return "directory";
  if (type === 0x33 || type === 0x34 || type === 0x36) return "special";
  return "unsupported";
}

function parseUstarArchive(archivePathValue) {
  const archivePath = resolve(process.cwd(), requiredString(archivePathValue, "return archive path"));
  const bytes = readRegularFile(archivePath, "Return archive");
  if (bytes.length === 0 || bytes.length % TAR_BLOCK_SIZE !== 0) fail("Return archive must be a non-empty 512-byte-aligned plain USTAR tar.");
  if (bytes.length > MAX_ARCHIVE_BYTES) fail(`Return archive exceeds the ${MAX_ARCHIVE_BYTES}-byte limit.`);
  const entries = [];
  const paths = new Set();
  let offset = 0;
  while (offset < bytes.length) {
    const header = bytes.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (allZero(header)) {
      if (offset + (2 * TAR_BLOCK_SIZE) > bytes.length || !allZero(bytes.subarray(offset + TAR_BLOCK_SIZE, offset + (2 * TAR_BLOCK_SIZE)))) {
        fail("Return archive must end with two zero USTAR blocks.");
      }
      for (let tail = offset + (2 * TAR_BLOCK_SIZE); tail < bytes.length; tail += TAR_BLOCK_SIZE) {
        if (!allZero(bytes.subarray(tail, tail + TAR_BLOCK_SIZE))) fail("Return archive has non-zero data after its end marker.");
      }
      return { path: archivePath, sha256: sha256Bytes(bytes), entries };
    }
    if (entries.length >= MAX_ENTRY_COUNT) fail(`Return archive exceeds the ${MAX_ENTRY_COUNT}-entry limit.`);
    if (!header.subarray(257, 263).equals(Buffer.from("ustar\0", "ascii")) || !header.subarray(263, 265).equals(Buffer.from("00", "ascii"))) {
      fail("Return archive must use plain USTAR headers (ustar\\0 version 00); extensions are not accepted.");
    }
    const expectedChecksum = tarNumber(header.subarray(148, 156), "Return archive header checksum");
    if (expectedChecksum !== tarChecksum(header)) fail("Return archive has an invalid header checksum.");
    const name = tarText(header.subarray(0, 100), "Return archive entry name");
    const prefix = tarText(header.subarray(345, 500), "Return archive entry prefix");
    if (name === "") fail("Return archive entry name must not be empty.");
    const path = regularPath(prefix ? `${prefix}/${name}` : name, "Return archive entry path");
    const type = tarEntryType(header[156]);
    if (type !== "regular") fail(`Return archive contains a forbidden ${type} entry: ${path}`);
    if (!allZero(header.subarray(157, 257))) fail(`Return archive regular entry has a forbidden linkname: ${path}`);
    const size = tarNumber(header.subarray(124, 136), `Return archive entry size (${path})`);
    if (size > MAX_ENTRY_BYTES) fail(`Return archive entry exceeds the ${MAX_ENTRY_BYTES}-byte limit: ${path}`);
    const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    const contentStart = offset + TAR_BLOCK_SIZE;
    const nextOffset = contentStart + paddedSize;
    if (nextOffset > bytes.length) fail(`Return archive entry data is truncated: ${path}`);
    if (!allZero(bytes.subarray(contentStart + size, nextOffset))) {
      fail(`Return archive entry has non-zero padding bytes: ${path}`);
    }
    const key = asciiFold(path);
    if (paths.has(key)) fail(`Return archive contains a duplicate entry: ${path}`);
    paths.add(key);
    entries.push({ path, bytes: bytes.subarray(contentStart, contentStart + size) });
    offset = nextOffset;
  }
  fail("Return archive is missing its two zero USTAR end blocks.");
}

function parseReturnManifest(entry) {
  let manifest;
  try {
    manifest = JSON.parse(entry.bytes.toString("utf8"));
  } catch (error) {
    fail(`return-manifest.json is not valid JSON: ${error.message}`);
  }
  const result = object(manifest, "return-manifest.json");
  exactKeys(result, new Set(["version", "kind", "handoffId", "deliverySequence", "handoffProtocolSha256", "component", "inputStagingSha256", "files"]), "return-manifest.json");
  if (result.version !== RETURN_MANIFEST_VERSION) fail(`return-manifest.json.version must be ${RETURN_MANIFEST_VERSION}.`);
  if (result.kind !== "p3-role-return") fail("return-manifest.json.kind must be p3-role-return.");
  const component = object(result.component, "return-manifest.json.component");
  exactKeys(component, new Set(["elementId", "componentDecisionCodePath", "sequence", "attempt"]), "return-manifest.json.component");
  const files = array(result.files, "return-manifest.json.files");
  if (files.length === 0) fail("return-manifest.json.files must contain at least one file.");
  const paths = new Set();
  const validatedFiles = files.map((candidate, index) => {
    const value = object(candidate, `return-manifest.json.files[${index}]`);
    exactKeys(value, new Set(["path", "sha256"]), `return-manifest.json.files[${index}]`);
    const path = regularPath(value.path, `return-manifest.json.files[${index}].path`);
    if (asciiFold(path) === RETURN_MANIFEST_PATH) fail("return-manifest.json.files must not declare return-manifest.json.");
    const key = asciiFold(path);
    if (paths.has(key)) fail(`return-manifest.json.files contains a duplicate path: ${path}`);
    paths.add(key);
    return { path, sha256: sha256(value.sha256, `return-manifest.json.files[${index}].sha256`) };
  });
  return {
    handoffId: requiredString(result.handoffId, "return-manifest.json.handoffId"),
    deliverySequence: positiveInteger(result.deliverySequence, "return-manifest.json.deliverySequence"),
    component: {
      elementId: requiredString(component.elementId, "return-manifest.json.component.elementId"),
      componentDecisionCodePath: requiredString(component.componentDecisionCodePath, "return-manifest.json.component.componentDecisionCodePath"),
      sequence: positiveInteger(component.sequence, "return-manifest.json.component.sequence"),
      attempt: positiveInteger(component.attempt, "return-manifest.json.component.attempt"),
    },
    handoffProtocolSha256: sha256(result.handoffProtocolSha256, "return-manifest.json.handoffProtocolSha256"),
    inputStagingSha256: sha256(result.inputStagingSha256, "return-manifest.json.inputStagingSha256"),
    files: validatedFiles,
  };
}

function validateArchiveAgainstPlan(archive, plan) {
  const entryByPath = new Map(archive.entries.map((entry) => [asciiFold(entry.path), entry]));
  const manifestEntry = entryByPath.get(RETURN_MANIFEST_PATH);
  if (!manifestEntry) fail("Return archive is missing return-manifest.json.");
  const manifest = parseReturnManifest(manifestEntry);
  if (manifest.handoffId !== plan.authority.handoff.opaqueHandoffId) fail("Return archive handoffId does not match the coordinator plan.");
  if (manifest.deliverySequence !== plan.authority.handoff.deliverySequence) fail("Return archive deliverySequence does not match the coordinator plan.");
  if (manifest.component.elementId !== plan.component.elementId) fail("Return archive component.elementId does not match the coordinator plan.");
  if (manifest.component.componentDecisionCodePath !== plan.component.componentDecisionCodePath) fail("Return archive component.componentDecisionCodePath does not match the coordinator plan.");
  if (manifest.component.sequence !== plan.component.sequence) fail("Return archive component.sequence does not match the coordinator plan.");
  if (manifest.component.attempt !== plan.component.attempt) fail("Return archive component.attempt does not match the coordinator plan.");
  if (manifest.handoffProtocolSha256 !== plan.authority.handoff.protocol.sha256) fail("Return archive handoffProtocolSha256 does not match the coordinator handoff protocol.");
  if (manifest.inputStagingSha256 !== plan.component.inputStagingSha256) {
    fail("Return archive inputStagingSha256 does not match the frozen coordinator input staging tree.");
  }
  const manifestPaths = new Set(manifest.files.map((file) => asciiFold(file.path)));
  for (const entry of archive.entries) {
    if (entry.path === RETURN_MANIFEST_PATH) continue;
    if (!manifestPaths.has(asciiFold(entry.path))) fail(`Return archive contains an undeclared entry: ${entry.path}`);
  }
  for (const file of manifest.files) {
    const entry = entryByPath.get(asciiFold(file.path));
    if (!entry) fail(`return-manifest.json declares a missing archive entry: ${file.path}`);
    if (!plan.component.allowedTargets.has(asciiFold(file.path))) {
      fail(`Return archive changes a path outside component.allowedChangeTargets: ${file.path}`);
    }
    const actualSha256 = sha256Bytes(entry.bytes);
    if (actualSha256 !== file.sha256) fail(`Return archive file SHA-256 mismatch: ${file.path}`);
  }
  return { manifest, entryByPath, manifestSha256: sha256Bytes(manifestEntry.bytes) };
}

function targetFile(root, path, { allowMissingParents = false } = {}) {
  const target = resolve(root, ...path.split("/"));
  assertWithin(root, target, `Target path ${path}`);
  let cursor = root;
  const segments = path.split("/");
  let encounteredMissingParent = false;
  for (let index = 0; index < segments.length - 1; index += 1) {
    cursor = join(cursor, segments[index]);
    if (!existsSync(cursor)) {
      if (!allowMissingParents) fail(`Target parent directory does not exist for ${path}: ${segments.slice(0, index + 1).join("/")}`);
      encounteredMissingParent = true;
      continue;
    }
    const info = lstatSync(cursor);
    if (info.isSymbolicLink() || !info.isDirectory()) fail(`Target parent path is not a real directory for ${path}: ${segments.slice(0, index + 1).join("/")}`);
    if (encounteredMissingParent) fail(`Target parent directory appeared after a missing ancestor for ${path}.`);
  }
  if (!existsSync(target)) return { path: target, exists: false, bytes: null, sha256: null, mode: 0o644 };
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) fail(`Target path must be a regular file, not a symlink or special file: ${path}`);
  const bytes = readFileSync(target);
  return { path: target, exists: true, bytes, sha256: sha256Bytes(bytes), mode: info.mode & 0o777 };
}

function exactlyOneBufferIndex(bytes, needle, label) {
  const first = bytes.indexOf(needle);
  if (first === -1) fail(`${label} is missing.`);
  if (bytes.indexOf(needle, first + needle.length) !== -1) fail(`${label} must occur exactly once.`);
  return first;
}

function assertDelimitedRegionUnchanged(currentBytes, returnedBytes, policy, path) {
  const start = Buffer.from(policy.startDelimiter, "utf8");
  const end = Buffer.from(policy.endDelimiter, "utf8");
  const currentStart = exactlyOneBufferIndex(currentBytes, start, `Current target start delimiter for ${path}`);
  const currentEnd = exactlyOneBufferIndex(currentBytes, end, `Current target end delimiter for ${path}`);
  const returnedStart = exactlyOneBufferIndex(returnedBytes, start, `Returned target start delimiter for ${path}`);
  const returnedEnd = exactlyOneBufferIndex(returnedBytes, end, `Returned target end delimiter for ${path}`);
  if (currentStart + start.length > currentEnd || returnedStart + start.length > returnedEnd) {
    fail(`Component delimiters are out of order for ${path}.`);
  }
  const currentPrefix = currentBytes.subarray(0, currentStart + start.length);
  const returnedPrefix = returnedBytes.subarray(0, returnedStart + start.length);
  const currentSuffix = currentBytes.subarray(currentEnd);
  const returnedSuffix = returnedBytes.subarray(returnedEnd);
  if (!currentPrefix.equals(returnedPrefix) || !currentSuffix.equals(returnedSuffix)) {
    fail(`Return archive changes bytes outside the declared component region: ${path}`);
  }
}

function assertBootstrapDelimitedRegions(returnedBytes, policy, path) {
  const regions = policy.bootstrapDelimiterRegions;
  if (!regions) fail(`New shared delimiter target lacks bootstrap delimiter regions: ${path}`);
  const positions = regions.map((region) => {
    const start = Buffer.from(region.startDelimiter, "utf8");
    const end = Buffer.from(region.endDelimiter, "utf8");
    const startIndex = exactlyOneBufferIndex(returnedBytes, start, `Bootstrap start delimiter for ${path}/${region.elementId}`);
    const endIndex = exactlyOneBufferIndex(returnedBytes, end, `Bootstrap end delimiter for ${path}/${region.elementId}`);
    if (startIndex + start.length > endIndex) fail(`Bootstrap delimiters are out of order for ${path}/${region.elementId}.`);
    return { start: startIndex, end: endIndex + end.length, elementId: region.elementId };
  }).sort((left, right) => left.start - right.start);
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index - 1].end > positions[index].start) {
      fail(`Bootstrap delimiter regions overlap for ${path}: ${positions[index - 1].elementId} and ${positions[index].elementId}.`);
    }
  }
}

function validateTargetOperations(plan, archiveCheck, targetRootValue) {
  const requestedTargetRoot = resolve(process.cwd(), requiredString(targetRootValue, "actual target root"));
  const targetRoot = assertRealDirectory(requestedTargetRoot, "actual target root");
  assertNoPendingRecovery(targetRoot);
  if (pathsOverlap(plan.component.inputStagingRoot, targetRoot)) {
    fail("actual target root must not overlap component.inputStaging.root.");
  }
  const operations = [];
  for (const file of archiveCheck.manifest.files) {
    const entry = archiveCheck.entryByPath.get(asciiFold(file.path));
    const policy = plan.component.filePolicies.get(asciiFold(file.path));
    const attemptOneCreate = plan.component.attempt === 1
      && plan.component.attemptOneCreateTargetSet.has(asciiFold(file.path));
    const target = targetFile(targetRoot, file.path, { allowMissingParents: attemptOneCreate });
    if (policy.kind === SHARED_POLICY) {
      if (!target.exists) {
        if (!attemptOneCreate) fail(`Shared delimiter target does not exist and is not permitted for attempt-one creation: ${file.path}`);
        assertBootstrapDelimitedRegions(entry.bytes, policy, file.path);
      } else {
        assertDelimitedRegionUnchanged(target.bytes, entry.bytes, policy, file.path);
      }
    } else if (!target.exists && !attemptOneCreate) {
      fail(`Component file target does not exist and is not explicitly permitted for attempt-one creation: ${file.path}`);
    }
    operations.push({
      relativePath: file.path,
      targetPath: target.path,
      existed: target.exists,
      originalSha256: target.sha256,
      originalMode: target.mode,
      returnBytes: Buffer.from(entry.bytes),
      returnSha256: file.sha256,
      policy: policy.kind,
    });
  }
  return { targetRoot, operations, bootstrapDirectories: plan.component.derivedBootstrapDirectories };
}

function progressComponent(value, label) {
  const component = object(value, label);
  exactKeys(component, new Set(["elementId", "componentDecisionCodePath", "sequence", "attempt"]), label);
  return {
    elementId: requiredString(component.elementId, `${label}.elementId`),
    componentDecisionCodePath: requiredString(component.componentDecisionCodePath, `${label}.componentDecisionCodePath`),
    sequence: positiveInteger(component.sequence, `${label}.sequence`),
    attempt: positiveInteger(component.attempt, `${label}.attempt`),
  };
}

function progressHandoff(value, label) {
  const handoff = object(value, label);
  exactKeys(handoff, new Set(["opaqueHandoffId", "deliverySequence", "protocolSha256"]), label);
  return {
    opaqueHandoffId: requiredString(handoff.opaqueHandoffId, `${label}.opaqueHandoffId`),
    deliverySequence: positiveInteger(handoff.deliverySequence, `${label}.deliverySequence`),
    protocolSha256: sha256(handoff.protocolSha256, `${label}.protocolSha256`),
  };
}

function progressTargetFiles(value, label) {
  const files = array(value, label);
  if (files.length === 0) fail(`${label} must contain at least one target file.`);
  const seen = new Set();
  return files.map((candidate, index) => {
    const file = object(candidate, `${label}[${index}]`);
    exactKeys(file, new Set(["path", "sha256"]), `${label}[${index}]`);
    const path = regularPath(file.path, `${label}[${index}].path`);
    const key = asciiFold(path);
    if (seen.has(key)) fail(`${label} contains duplicate target paths.`);
    seen.add(key);
    return { path, sha256: sha256(file.sha256, `${label}[${index}].sha256`) };
  }).sort((left, right) => compareUtf8(left.path, right.path));
}

function progressGateState(value, label) {
  const state = object(value, label);
  exactKeys(state, new Set([
    "path",
    "sha256",
    "preflightId",
    "benchmarkAttemptCount",
    "benchmarkAttemptsSha256",
    "componentCheckpointRecordSha256",
  ]), label);
  if (regularPath(state.path, `${label}.path`) !== ".figma-gate/active.json") {
    fail(`${label}.path must be .figma-gate/active.json.`);
  }
  if (!Number.isInteger(state.benchmarkAttemptCount) || state.benchmarkAttemptCount < 0) {
    fail(`${label}.benchmarkAttemptCount must be a non-negative integer.`);
  }
  const checkpointHash = state.componentCheckpointRecordSha256;
  if (checkpointHash !== null) sha256(checkpointHash, `${label}.componentCheckpointRecordSha256`);
  return {
    path: ".figma-gate/active.json",
    sha256: sha256(state.sha256, `${label}.sha256`),
    preflightId: uuid(state.preflightId, `${label}.preflightId`),
    benchmarkAttemptCount: state.benchmarkAttemptCount,
    benchmarkAttemptsSha256: sha256(state.benchmarkAttemptsSha256, `${label}.benchmarkAttemptsSha256`),
    componentCheckpointRecordSha256: checkpointHash,
  };
}

function coordinatorArtifactReference(value, label) {
  const reference = object(value, label);
  exactKeys(reference, new Set(["path", "sha256"]), label);
  const path = requiredString(reference.path, `${label}.path`);
  if (!isAbsolute(path)) fail(`${label}.path must be an absolute coordinator-only path.`);
  return { path: resolve(path), sha256: sha256(reference.sha256, `${label}.sha256`) };
}

function outcome(value, label) {
  if (value !== "PASS" && value !== "FAIL") fail(`${label} must be PASS or FAIL.`);
  return value;
}

function failureClass(value, result, label) {
  if (result === "PASS") {
    if (value !== null) fail(`${label} must be null for PASS.`);
    return null;
  }
  if (!["SPEC", "LAYOUT", "VISUAL", "OTHER"].includes(value)) {
    fail(`${label} must be SPEC, LAYOUT, VISUAL, or OTHER for FAIL.`);
  }
  return value;
}

function progressRecordIdentity(record, label) {
  const targetWorktreeRoot = requiredString(record.targetWorktreeRoot, `${label}.targetWorktreeRoot`);
  if (!isAbsolute(targetWorktreeRoot)) fail(`${label}.targetWorktreeRoot must be absolute.`);
  return {
    pairId: requiredString(record.pairId, `${label}.pairId`),
    condition: conditionName(record.condition, `${label}.condition`),
    targetWorktreeRoot: canonicalPath(targetWorktreeRoot),
    checkpointPlanSha256: sha256(record.checkpointPlanSha256, `${label}.checkpointPlanSha256`),
    component: progressComponent(record.component, `${label}.component`),
    handoff: progressHandoff(record.handoff, `${label}.handoff`),
    planSha256: sha256(record.planSha256, `${label}.planSha256`),
    returnArchiveSha256: sha256(record.returnArchiveSha256, `${label}.returnArchiveSha256`),
    returnManifestSha256: sha256(record.returnManifestSha256, `${label}.returnManifestSha256`),
  };
}

function sameProgressIdentity(left, right) {
  return left.pairId === right.pairId
    && left.condition === right.condition
    && left.targetWorktreeRoot === right.targetWorktreeRoot
    && left.checkpointPlanSha256 === right.checkpointPlanSha256
    && left.component.elementId === right.component.elementId
    && left.component.componentDecisionCodePath === right.component.componentDecisionCodePath
    && left.component.sequence === right.component.sequence
    && left.component.attempt === right.component.attempt
    && left.handoff.opaqueHandoffId === right.handoff.opaqueHandoffId
    && left.handoff.deliverySequence === right.handoff.deliverySequence
    && left.handoff.protocolSha256 === right.handoff.protocolSha256
    && left.planSha256 === right.planSha256
    && left.returnArchiveSha256 === right.returnArchiveSha256
    && left.returnManifestSha256 === right.returnManifestSha256;
}

function identityFromProgressRecord(record) {
  return {
    pairId: record.pairId,
    condition: record.condition,
    targetWorktreeRoot: record.targetWorktreeRoot,
    checkpointPlanSha256: record.checkpointPlanSha256,
    component: record.component,
    handoff: record.handoff,
    planSha256: record.planSha256,
    returnArchiveSha256: record.returnArchiveSha256,
    returnManifestSha256: record.returnManifestSha256,
  };
}

function requireSameProgressIdentity(left, right, label) {
  if (!sameProgressIdentity(left, right)) fail(`${label} does not match the preceding coordinator progress record.`);
}

function progressRecord(value, index, previousSha256) {
  const label = `Coordinator role-return progress ledger line ${index + 1}`;
  const record = object(value, label);
  const event = requiredString(record.event, `${label}.event`);
  const common = new Set([
    "version", "kind", "sequence", "previousSha256", "at", "event",
    "pairId", "condition", "targetWorktreeRoot", "checkpointPlanSha256", "component", "handoff",
    "planSha256", "returnArchiveSha256", "returnManifestSha256", "entrySha256",
  ]);
  const extraByEvent = {
    "return-apply-intent": ["preCheckpointGateState", "returnTargetFiles"],
    "return-applied": ["applyIntentSha256", "preCheckpointGateState", "returnTargetFiles", "application", "multiFileAtomic", "durableFilesystemCommitGuaranteed"],
    "checkpoint-recorded": ["applicationRecordSha256", "checkpointProof", "outcome", "failureClass"],
    "feedback-recorded": ["checkpointRecordSha256", "feedback", "outcome", "failureClass"],
  };
  if (!Object.hasOwn(extraByEvent, event)) fail(`${label}.event is unsupported.`);
  exactKeys(record, new Set([...common, ...extraByEvent[event]]), label);
  if (record.version !== PROGRESS_LEDGER_VERSION || record.kind !== PROGRESS_LEDGER_KIND) {
    fail(`${label} has an unsupported progress schema.`);
  }
  if (record.sequence !== index + 1 || record.previousSha256 !== previousSha256) {
    fail(`${label} chain sequence is invalid.`);
  }
  if (typeof record.at !== "string" || Number.isNaN(Date.parse(record.at))) fail(`${label}.at must be an ISO timestamp.`);
  const entrySha256 = sha256(record.entrySha256, `${label}.entrySha256`);
  const { entrySha256: ignored, ...unsigned } = record;
  if (entrySha256 !== stableHash(unsigned)) fail(`${label} chain hash is invalid.`);
  const identity = progressRecordIdentity(record, label);
  const parsed = { ...record, ...identity, event, entrySha256 };
  if (event === "return-apply-intent") {
    parsed.preCheckpointGateState = progressGateState(record.preCheckpointGateState, `${label}.preCheckpointGateState`);
    parsed.returnTargetFiles = progressTargetFiles(record.returnTargetFiles, `${label}.returnTargetFiles`);
  } else if (event === "return-applied") {
    parsed.applyIntentSha256 = sha256(record.applyIntentSha256, `${label}.applyIntentSha256`);
    parsed.preCheckpointGateState = progressGateState(record.preCheckpointGateState, `${label}.preCheckpointGateState`);
    parsed.returnTargetFiles = progressTargetFiles(record.returnTargetFiles, `${label}.returnTargetFiles`);
    if (record.application !== "recovery-journal-backed-rollback-capable-batch-apply") {
      fail(`${label}.application is unsupported.`);
    }
    if (record.multiFileAtomic !== false || record.durableFilesystemCommitGuaranteed !== false) {
      fail(`${label} must retain the recovery-journal durability caveat.`);
    }
  } else if (event === "checkpoint-recorded") {
    parsed.applicationRecordSha256 = sha256(record.applicationRecordSha256, `${label}.applicationRecordSha256`);
    parsed.checkpointProof = coordinatorArtifactReference(record.checkpointProof, `${label}.checkpointProof`);
    parsed.outcome = outcome(record.outcome, `${label}.outcome`);
    parsed.failureClass = failureClass(record.failureClass, parsed.outcome, `${label}.failureClass`);
  } else {
    parsed.checkpointRecordSha256 = sha256(record.checkpointRecordSha256, `${label}.checkpointRecordSha256`);
    parsed.feedback = coordinatorArtifactReference(record.feedback, `${label}.feedback`);
    parsed.outcome = outcome(record.outcome, `${label}.outcome`);
    parsed.failureClass = failureClass(record.failureClass, parsed.outcome, `${label}.failureClass`);
  }
  return parsed;
}

function readProgressLedger(path) {
  if (!existsSync(path)) return [];
  const bytes = readRegularFile(path, "Coordinator role-return progress ledger");
  const text = bytes.toString("utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const records = [];
  let previousSha256 = null;
  for (const [index, line] of lines.entries()) {
    let candidate;
    try {
      candidate = JSON.parse(line);
    } catch (error) {
      fail(`Coordinator role-return progress ledger line ${index + 1} is not valid JSON: ${error.message}`);
    }
    const record = progressRecord(candidate, index, previousSha256);
    records.push(record);
    previousSha256 = record.entrySha256;
  }
  return records;
}

function initialProgressExpectation(authority) {
  return {
    elementId: authority.frozenScope.checkpointPlan[0],
    sequence: 1,
    attempt: 1,
    deliverySequence: authority.handoff.deliveryProgress.initialDeliverySequence,
  };
}

function nextProgressExpectation(expectation, result, checkpointPlan, deliveryIncrement) {
  if (result === "FAIL") {
    return {
      ...expectation,
      attempt: expectation.attempt + 1,
      deliverySequence: expectation.deliverySequence + deliveryIncrement,
    };
  }
  if (expectation.sequence === checkpointPlan.length) return null;
  return {
    elementId: checkpointPlan[expectation.sequence],
    sequence: expectation.sequence + 1,
    attempt: 1,
    deliverySequence: expectation.deliverySequence + deliveryIncrement,
  };
}

function requireProgressRecordExpected(record, expected, label) {
  if (!expected) fail(`${label} occurs after the finalized component loop is complete.`);
  if (record.component.elementId !== expected.elementId || record.component.sequence !== expected.sequence
    || record.component.attempt !== expected.attempt || record.handoff.deliverySequence !== expected.deliverySequence) {
    fail(`${label} skips, replays, or reorders the required component return attempt.`);
  }
}

function assertProgressAuthorityBinding(record, authority, targetRoot, label) {
  if (record.pairId !== authority.pairId || record.condition !== authority.condition
    || record.targetWorktreeRoot !== canonicalPath(targetRoot)
    || record.checkpointPlanSha256 !== stableHash(authority.frozenScope.checkpointPlan)
    || record.handoff.protocolSha256 !== authority.handoff.protocol.sha256) {
    fail(`${label} is not bound to this final handoff protocol, condition, and actual worktree.`);
  }
}

function progressState(records, authority, targetRoot) {
  let stage = "ready";
  let active = null;
  let expected = initialProgressExpectation(authority);
  const appliedHandoffIds = new Set();
  for (const record of records) {
    assertProgressAuthorityBinding(record, authority, targetRoot, "Coordinator role-return progress record");
    if (stage === "ready") {
      if (record.event !== "return-apply-intent") fail("Coordinator role-return progress requires an apply intent before this event.");
      requireProgressRecordExpected(record, expected, "Coordinator role-return progress apply intent");
      if (appliedHandoffIds.has(record.handoff.opaqueHandoffId)) fail("Coordinator role-return progress replays an already applied opaque handoff ID.");
      stage = "intent";
      active = record;
      continue;
    }
    if (stage === "intent") {
      if (record.event !== "return-applied") fail("Coordinator role-return progress has an unresolved apply intent; recover the worktree and obtain a new coordinator review before any further event.");
      if (record.applyIntentSha256 !== active.entrySha256) fail("Coordinator role-return applied record does not bind its apply intent.");
      requireSameProgressIdentity(record, active, "Coordinator role-return applied record");
      if (stableHash(record.preCheckpointGateState) !== stableHash(active.preCheckpointGateState)
        || stableHash(record.returnTargetFiles) !== stableHash(active.returnTargetFiles)) {
        fail("Coordinator role-return applied record changed its pre-checkpoint state or returned file binding.");
      }
      appliedHandoffIds.add(record.handoff.opaqueHandoffId);
      stage = "applied";
      active = record;
      continue;
    }
    if (stage === "applied") {
      if (record.event !== "checkpoint-recorded") fail("Coordinator role-return progress requires an actual matching figma-gate checkpoint record before further activity.");
      if (record.applicationRecordSha256 !== active.entrySha256) fail("Coordinator role-return checkpoint record does not bind its applied return.");
      requireSameProgressIdentity(record, active, "Coordinator role-return checkpoint record");
      stage = "checkpointed";
      active = record;
      continue;
    }
    if (record.event !== "feedback-recorded") fail("Coordinator role-return progress requires same-condition feedback before the next attempt.");
    if (record.checkpointRecordSha256 !== active.entrySha256) fail("Coordinator role-return feedback does not bind its matching checkpoint record.");
    requireSameProgressIdentity(record, active, "Coordinator role-return feedback record");
    if (record.outcome !== active.outcome || record.failureClass !== active.failureClass) {
      fail("Coordinator role-return feedback changes the actual checkpoint outcome or failure class.");
    }
    expected = nextProgressExpectation(
      expected,
      record.outcome,
      authority.frozenScope.checkpointPlan,
      authority.handoff.deliveryProgress.increment,
    );
    stage = "ready";
    active = null;
  }
  return { stage, active, expected, records };
}

function assertCoordinatorArtifactOutsideRuntime(path, plan, targetRoot, label) {
  const forbidden = [targetRoot, plan.component.inputStagingRoot, ...plan.authority.pairPreflights.conditions.map((entry) => entry.worktreeRoot)];
  for (const entry of plan.authority.pairPreflights.conditions) {
    const worktree = canonicalDirectory(entry.worktreeRoot, `${label} ${entry.condition} actual worktree`);
    forbidden.push(actualGitWorktree(worktree, `${label} ${entry.condition}`).commonGitDirectory);
  }
  for (const root of forbidden) assertPathOutside(path, root, label);
}

function liveGateStateSnapshot(plan, targetRoot) {
  const stateFile = readRelativeRegularFile(targetRoot, ".figma-gate/active.json", "Actual figma-gate active state");
  let state;
  try {
    state = object(JSON.parse(stateFile.bytes.toString("utf8")), "Actual figma-gate active state");
  } catch (error) {
    fail(`Actual figma-gate active state is not valid JSON: ${error.message}`);
  }
  const ownPreflight = plan.authority.preflights[plan.authority.condition];
  const ownAuthority = plan.authority.pairPreflights.conditions.find((entry) => entry.condition === plan.authority.condition);
  if (!ownPreflight || !ownAuthority) fail("Coordinator role-return plan has no actual pair-preflight authority for this condition.");
  const expectedManifestPath = resolve(targetRoot, ...ownAuthority.gateManifest.path.split("/"));
  assertV13PreflightState(state, {
    worktreeRoot: targetRoot,
    manifestPath: expectedManifestPath,
    manifestSha256: ownAuthority.gateManifest.sha256,
    preflightId: ownPreflight.preflightId,
    implementationIdentity: plan.authority.contract.implementation,
    changeTargets: plan.authority.frozenScope.changeTargets,
  }, "Actual figma-gate active state");
  const benchmark = state.benchmark === undefined ? {} : object(state.benchmark, "Actual figma-gate active state.benchmark");
  const attempts = benchmark.attempts === undefined ? [] : array(benchmark.attempts, "Actual figma-gate active state.benchmark.attempts");
  const benchmarkPlan = stringSequence(benchmark.plan, "Actual figma-gate active state.benchmark.plan");
  if (!sameSequence(benchmarkPlan, plan.authority.frozenScope.checkpointPlan)) {
    fail("Actual figma-gate active state benchmark.plan does not match the final frozen checkpointPlan.");
  }
  const checkpoints = state.checkpoints === undefined ? {} : object(state.checkpoints, "Actual figma-gate active state.checkpoints");
  const checkpointRecord = Object.hasOwn(checkpoints, plan.component.elementId)
    ? object(checkpoints[plan.component.elementId], `Actual figma-gate checkpoint (${plan.component.elementId})`)
    : null;
  return {
    path: ".figma-gate/active.json",
    sha256: stateFile.sha256,
    preflightId: ownPreflight.preflightId,
    benchmarkAttemptCount: attempts.length,
    benchmarkAttemptsSha256: stableHash(attempts),
    componentCheckpointRecordSha256: checkpointRecord === null ? null : stableHash(checkpointRecord),
    attempts,
    checkpointRecord,
    state,
  };
}

function progressIdentityForValidation(plan, archive, archiveCheck, targetRoot) {
  return {
    pairId: plan.authority.pairId,
    condition: plan.authority.condition,
    targetWorktreeRoot: canonicalPath(targetRoot),
    checkpointPlanSha256: stableHash(plan.authority.frozenScope.checkpointPlan),
    component: {
      elementId: plan.component.elementId,
      componentDecisionCodePath: plan.component.componentDecisionCodePath,
      sequence: plan.component.sequence,
      attempt: plan.component.attempt,
    },
    handoff: {
      opaqueHandoffId: plan.authority.handoff.opaqueHandoffId,
      deliverySequence: plan.authority.handoff.deliverySequence,
      protocolSha256: plan.authority.handoff.protocol.sha256,
    },
    planSha256: plan.sha256,
    returnArchiveSha256: archive.sha256,
    returnManifestSha256: archiveCheck.manifestSha256,
  };
}

function sameProgressIdentityToPlan(identity, plan, targetRoot) {
  return identity.pairId === plan.authority.pairId
    && identity.condition === plan.authority.condition
    && identity.targetWorktreeRoot === canonicalPath(targetRoot)
    && identity.checkpointPlanSha256 === stableHash(plan.authority.frozenScope.checkpointPlan)
    && identity.component.elementId === plan.component.elementId
    && identity.component.componentDecisionCodePath === plan.component.componentDecisionCodePath
    && identity.component.sequence === plan.component.sequence
    && identity.component.attempt === plan.component.attempt
    && identity.handoff.opaqueHandoffId === plan.authority.handoff.opaqueHandoffId
    && identity.handoff.deliverySequence === plan.authority.handoff.deliverySequence
    && identity.handoff.protocolSha256 === plan.authority.handoff.protocol.sha256
    && identity.planSha256 === plan.sha256;
}

function validateProgressForReturn(plan, archive, archiveCheck, targetRoot, operations) {
  const records = readProgressLedger(plan.authority.progress.ledgerPath);
  const state = progressState(records, plan.authority, targetRoot);
  verifyRecordedProgressArtifacts(records, plan, targetRoot);
  if (state.stage !== "ready") {
    fail("Coordinator role-return progress blocks another return until the prior apply has an actual checkpoint and same-condition feedback record.");
  }
  if (!state.expected) fail("Coordinator role-return progress has completed the frozen checkpoint plan; no replay return is allowed.");
  const identity = progressIdentityForValidation(plan, archive, archiveCheck, targetRoot);
  requireProgressRecordExpected({ component: identity.component, handoff: identity.handoff }, state.expected, "Coordinator role-return plan");
  const gateState = liveGateStateSnapshot(plan, targetRoot);
  if (gateState.componentCheckpointRecordSha256 !== null) {
    fail("Coordinator role-return plan cannot apply over an existing figma-gate checkpoint for its current component.");
  }
  return {
    ledgerPath: plan.authority.progress.ledgerPath,
    checkpointProofDirectory: plan.authority.progress.checkpointProofDirectory,
    identity,
    preCheckpointGateState: {
      path: gateState.path,
      sha256: gateState.sha256,
      preflightId: gateState.preflightId,
      benchmarkAttemptCount: gateState.benchmarkAttemptCount,
      benchmarkAttemptsSha256: gateState.benchmarkAttemptsSha256,
      componentCheckpointRecordSha256: gateState.componentCheckpointRecordSha256,
    },
    returnTargetFiles: operations.map((operation) => ({ path: operation.relativePath, sha256: operation.returnSha256 }))
      .sort((left, right) => compareUtf8(left.path, right.path)),
    priorProgressEntrySha256: state.records.length ? state.records.at(-1).entrySha256 : null,
  };
}

export function validateRoleReturn(planPathValue, archivePathValue, targetRootValue) {
  const plan = validatePlan(planPathValue, targetRootValue);
  const archive = parseUstarArchive(archivePathValue);
  const archiveCheck = validateArchiveAgainstPlan(archive, plan);
  const target = validateTargetOperations(plan, archiveCheck, targetRootValue);
  const progress = validateProgressForReturn(plan, archive, archiveCheck, target.targetRoot, target.operations);
  return {
    version: 5,
    kind: "p3-role-return-validation",
    coordinatorOnly: true,
    planSha256: plan.sha256,
    returnArchiveSha256: archive.sha256,
    authority: {
      pairId: plan.authority.pairId,
      condition: plan.authority.condition,
      comparisonContract: plan.authority.contract,
      frozenScope: {
        checkpointPlan: plan.authority.frozenScope.checkpointPlan,
        changeTargets: plan.authority.frozenScope.changeTargets,
      },
      handoff: plan.authority.handoff,
      pairPreflights: plan.authority.preflights,
      progress: {
        ledgerPath: progress.ledgerPath,
        checkpointProofDirectory: progress.checkpointProofDirectory,
        priorProgressEntrySha256: progress.priorProgressEntrySha256,
      },
    },
    handoffId: plan.authority.handoff.opaqueHandoffId,
    component: {
      elementId: plan.component.elementId,
      componentDecisionCodePath: plan.component.componentDecisionCodePath,
      attempt: plan.component.attempt,
      sequence: plan.component.sequence,
    },
    inputStagingSha256: plan.component.inputStagingSha256,
    validatedFiles: target.operations.map((operation) => ({
      path: operation.relativePath,
      sha256: operation.returnSha256,
      priorTarget: operation.existed ? "existing-regular-file" : "attempt-one-create",
      policy: operation.policy,
    })),
    applyReady: true,
    _internal: {
      targetRoot: target.targetRoot,
      operations: target.operations,
      bootstrapDirectories: target.bootstrapDirectories,
      plan,
      archive,
      archiveCheck,
      progress,
    },
  };
}

function assertUnchangedTarget(operation) {
  if (!existsSync(operation.targetPath)) {
    if (operation.existed) fail(`Target changed after validation before apply: ${operation.relativePath}`);
    return;
  }
  if (!operation.existed) fail(`Target changed after validation before apply: ${operation.relativePath}`);
  const info = lstatSync(operation.targetPath);
  if (info.isSymbolicLink() || !info.isFile()) fail(`Target changed to a non-regular file after validation before apply: ${operation.relativePath}`);
  if (sha256Bytes(readFileSync(operation.targetPath)) !== operation.originalSha256) {
    fail(`Target changed after validation before apply: ${operation.relativePath}`);
  }
}

function recoveryRootPath(targetRoot) {
  return join(targetRoot, RECOVERY_DIRECTORY);
}

function assertRecoveryDirectory(targetRoot, create) {
  const root = recoveryRootPath(targetRoot);
  if (!existsSync(root)) {
    if (!create) return null;
    mkdirSync(root, { recursive: false, mode: 0o700 });
  }
  const info = lstatSync(root);
  if (info.isSymbolicLink() || !info.isDirectory()) fail("P3 role return recovery root must be a real directory.");
  return root;
}

function flushFile(path) {
  const descriptor = openSync(path, "r");
  try {
    try {
      fsyncSync(descriptor);
    } catch (error) {
      // Windows filesystems used for coordinator staging can reject fsync with
      // EPERM.  The journal is still written and recovered, but the public
      // result deliberately calls this rollback-capable rather than durable.
      if (!["EPERM", "EINVAL", "ENOTSUP", "ENOSYS"].includes(error?.code)) throw error;
    }
  } finally {
    closeSync(descriptor);
  }
}

function progressLockDirectory(ledgerPath) {
  return `${ledgerPath}.lock`;
}

function withProgressLock(ledgerPath, action) {
  const lockDirectory = progressLockDirectory(ledgerPath);
  if (existsSync(lockDirectory)) {
    fail("Coordinator role-return progress ledger is locked or was interrupted; do not bypass the coordinator-only lock.");
  }
  mkdirSync(lockDirectory, { recursive: false, mode: 0o700 });
  try {
    const info = lstatSync(lockDirectory);
    if (info.isSymbolicLink() || !info.isDirectory()) fail("Coordinator role-return progress lock must be a real directory.");
    return action();
  } finally {
    if (existsSync(lockDirectory)) {
      const info = lstatSync(lockDirectory);
      if (info.isSymbolicLink() || !info.isDirectory() || readdirSync(lockDirectory).length !== 0) {
        fail("Coordinator role-return progress lock cleanup refused because the lock changed unexpectedly.");
      }
      rmdirSync(lockDirectory);
    }
  }
}

function appendProgressRecord(ledgerPath, event, identity, fields) {
  absoluteCoordinatorPath(ledgerPath, "Coordinator role-return progress ledger");
  const records = readProgressLedger(ledgerPath);
  const record = {
    version: PROGRESS_LEDGER_VERSION,
    kind: PROGRESS_LEDGER_KIND,
    sequence: records.length + 1,
    previousSha256: records.length ? records.at(-1).entrySha256 : null,
    at: new Date().toISOString(),
    event,
    ...identity,
    ...fields,
  };
  record.entrySha256 = stableHash(record);
  const descriptor = openSync(ledgerPath, "a", 0o600);
  try {
    writeSync(descriptor, `${JSON.stringify(record)}\n`, undefined, "utf8");
    try {
      fsyncSync(descriptor);
    } catch (error) {
      // Match the recovery-journal caveat: this is best-effort persistence on
      // Windows, not a claim of a durable filesystem commit.
      if (!["EPERM", "EINVAL", "ENOTSUP", "ENOSYS"].includes(error?.code)) throw error;
    }
  } finally {
    closeSync(descriptor);
  }
  return progressRecord(record, records.length, record.previousSha256);
}

function progressReportRecord(record) {
  const { entrySha256, event, component, handoff } = record;
  return { event, entrySha256, component, handoff };
}

function recoveryTransactions(targetRoot) {
  const recoveryRoot = assertRecoveryDirectory(targetRoot, false);
  if (!recoveryRoot) return [];
  const names = readdirSync(recoveryRoot, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  const transactions = [];
  for (const entry of names) {
    if (!/^txn-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.name)) {
      fail(`P3 role return recovery root contains an unexpected entry: ${entry.name}`);
    }
    const transactionRoot = join(recoveryRoot, entry.name);
    const info = lstatSync(transactionRoot);
    if (info.isSymbolicLink() || !info.isDirectory()) fail(`P3 role return transaction must be a real directory: ${entry.name}`);
    transactions.push({ recoveryRoot, transactionRoot, transactionId: entry.name.slice(4) });
  }
  return transactions;
}

function readJournal(transaction, targetRoot) {
  const journalPath = join(transaction.transactionRoot, RECOVERY_JOURNAL);
  const journal = object(readJson(journalPath, "P3 role return recovery journal"), "P3 role return recovery journal");
  if (journal.version !== 1 && journal.version !== 2) {
    fail("P3 role return recovery journal has an unsupported schema.");
  }
  exactKeys(
    journal,
    new Set(journal.version === 1
      ? ["version", "kind", "targetRoot", "transactionId", "state", "operations"]
      : ["version", "kind", "targetRoot", "transactionId", "state", "operations", "directories"]),
    "P3 role return recovery journal",
  );
  if (journal.kind !== "p3-role-return-recovery-journal") fail("P3 role return recovery journal has an unsupported schema.");
  if (requiredString(journal.transactionId, "P3 role return recovery journal.transactionId") !== transaction.transactionId) {
    fail("P3 role return recovery journal transactionId does not match its directory.");
  }
  if (!samePath(canonicalDirectory(requiredString(journal.targetRoot, "P3 role return recovery journal.targetRoot"), "P3 role return recovery journal.targetRoot"), targetRoot)) {
    fail("P3 role return recovery journal targetRoot does not match the requested actual target root.");
  }
  if (!["prepared", "staged", "applying", "committed"].includes(journal.state)) {
    fail("P3 role return recovery journal.state is invalid.");
  }
  const operations = array(journal.operations, "P3 role return recovery journal.operations");
  if (operations.length === 0) fail("P3 role return recovery journal.operations must not be empty.");
  const seen = new Set();
  const normalizedOperations = operations.map((entry, index) => {
    const operation = object(entry, `P3 role return recovery journal.operations[${index}]`);
    exactKeys(operation, new Set(["relativePath", "existed", "originalSha256", "originalMode", "returnSha256", "stagingName", "backupName", "state"]), `P3 role return recovery journal.operations[${index}]`);
    const relativePath = regularPath(operation.relativePath, `P3 role return recovery journal.operations[${index}].relativePath`);
    const key = asciiFold(relativePath);
    if (seen.has(key)) fail("P3 role return recovery journal has duplicate target paths.");
    seen.add(key);
    if (typeof operation.existed !== "boolean") fail(`P3 role return recovery journal.operations[${index}].existed must be a boolean.`);
    if (operation.existed) sha256(operation.originalSha256, `P3 role return recovery journal.operations[${index}].originalSha256`);
    else if (operation.originalSha256 !== null) fail(`P3 role return recovery journal.operations[${index}].originalSha256 must be null for new files.`);
    if (!Number.isInteger(operation.originalMode) || operation.originalMode < 0 || operation.originalMode > 0o777) {
      fail(`P3 role return recovery journal.operations[${index}].originalMode is invalid.`);
    }
    const stagingName = requiredString(operation.stagingName, `P3 role return recovery journal.operations[${index}].stagingName`);
    const backupName = requiredString(operation.backupName, `P3 role return recovery journal.operations[${index}].backupName`);
    if (stagingName !== `replacement-${index}` || backupName !== `backup-${index}` || !/^[a-z0-9-]+$/.test(stagingName) || !/^[a-z0-9-]+$/.test(backupName)) {
      fail("P3 role return recovery journal staging and backup names are invalid.");
    }
    if (!["pending", "moving-original", "original-moved", "moving-replacement", "replacement-moved"].includes(operation.state)) {
      fail(`P3 role return recovery journal.operations[${index}].state is invalid.`);
    }
    return {
      ...operation,
      relativePath,
      returnSha256: sha256(operation.returnSha256, `P3 role return recovery journal.operations[${index}].returnSha256`),
    };
  });
  const directories = journal.version === 1 ? [] : array(journal.directories, "P3 role return recovery journal.directories").map((entry, index) => {
    const directory = object(entry, `P3 role return recovery journal.directories[${index}]`);
    exactKeys(directory, new Set(["relativePath", "existedAtIntent", "createdByThisTransaction", "state"]), `P3 role return recovery journal.directories[${index}]`);
    const relativePath = regularPath(directory.relativePath, `P3 role return recovery journal.directories[${index}].relativePath`);
    if (relativePath !== "site" && !relativePath.startsWith("site/")) {
      fail(`P3 role return recovery journal directory is outside site/: ${relativePath}`);
    }
    if (typeof directory.existedAtIntent !== "boolean" || typeof directory.createdByThisTransaction !== "boolean") {
      fail(`P3 role return recovery journal.directories[${index}] intent flags must be boolean.`);
    }
    if (!["pending", "already-existed", "mkdir-intent", "created"].includes(directory.state)) {
      fail(`P3 role return recovery journal.directories[${index}].state is invalid.`);
    }
    if (directory.existedAtIntent && (directory.createdByThisTransaction || directory.state !== "already-existed")) {
      fail(`P3 role return recovery journal.directories[${index}] contradicts an existing directory intent.`);
    }
    if (!directory.existedAtIntent && directory.createdByThisTransaction !== (directory.state === "created")) {
      fail(`P3 role return recovery journal.directories[${index}] createdByThisTransaction does not match state.`);
    }
    return { relativePath, existedAtIntent: directory.existedAtIntent, createdByThisTransaction: directory.createdByThisTransaction, state: directory.state };
  });
  const expectedDirectories = [...directories].sort((left, right) => {
    const depth = left.relativePath.split("/").length - right.relativePath.split("/").length;
    return depth !== 0 ? depth : compareUtf8(left.relativePath, right.relativePath);
  });
  if (!sameSequence(directories.map((entry) => entry.relativePath), expectedDirectories.map((entry) => entry.relativePath))) {
    fail("P3 role return recovery journal.directories must be in parent-before-child order.");
  }
  const directoryKeys = new Set();
  for (const directory of directories) {
    const key = asciiFold(directory.relativePath);
    if (directoryKeys.has(key)) fail("P3 role return recovery journal has duplicate bootstrap directories.");
    directoryKeys.add(key);
  }
  return { ...journal, operations: normalizedOperations, directories, path: journalPath };
}

function writeJournal(transaction, journal, initial = false) {
  const document = {
    version: journal.version,
    kind: journal.kind,
    targetRoot: journal.targetRoot,
    transactionId: journal.transactionId,
    state: journal.state,
    operations: journal.operations.map(({ relativePath, existed, originalSha256, originalMode, returnSha256, stagingName, backupName, state }) => ({
      relativePath,
      existed,
      originalSha256,
      originalMode,
      returnSha256,
      stagingName,
      backupName,
      state,
    })),
  };
  if (journal.version === 2) {
    document.directories = journal.directories.map(({ relativePath, existedAtIntent, createdByThisTransaction, state }) => ({
      relativePath,
      existedAtIntent,
      createdByThisTransaction,
      state,
    }));
  }
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
  const journalPath = join(transaction.transactionRoot, RECOVERY_JOURNAL);
  if (initial) {
    writeFileSync(journalPath, bytes, { flag: "wx", mode: 0o600 });
    flushFile(journalPath);
    return;
  }
  const nextPath = join(transaction.transactionRoot, "journal.next.json");
  if (existsSync(nextPath)) fail("P3 role return recovery journal has an unexpected pending replacement.");
  writeFileSync(nextPath, bytes, { flag: "wx", mode: 0o600 });
  flushFile(nextPath);
  renameSync(nextPath, journalPath);
  flushFile(journalPath);
}

function transactionFile(transaction, name, label) {
  if (!/^[a-z0-9-]+$/.test(name)) fail(`${label} has an invalid transaction filename.`);
  const path = join(transaction.transactionRoot, name);
  assertWithin(transaction.transactionRoot, path, label);
  return path;
}

function readTransactionRegularFile(path, expectedSha256, label) {
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile()) fail(`${label} must be a regular file.`);
  const bytes = readFileSync(path);
  if (sha256Bytes(bytes) !== expectedSha256) fail(`${label} SHA-256 does not match the recovery journal.`);
  return { path, bytes };
}

function removeTransactionFile(path, expectedSha256, label) {
  const file = readTransactionRegularFile(path, expectedSha256, label);
  if (file) unlinkSync(path);
}

function assertTransactionLayout(transaction, journal) {
  const expected = new Set([RECOVERY_JOURNAL, "journal.next.json"]);
  for (const operation of journal.operations) {
    expected.add(operation.stagingName);
    expected.add(operation.backupName);
  }
  for (const entry of readdirSync(transaction.transactionRoot, { withFileTypes: true })) {
    if (!expected.has(entry.name)) fail(`P3 role return transaction contains an unexpected entry: ${entry.name}`);
    const path = join(transaction.transactionRoot, entry.name);
    const info = lstatSync(path);
    if (info.isSymbolicLink() || !info.isFile()) fail(`P3 role return transaction contains a non-regular entry: ${entry.name}`);
  }
}

function removeTransactionDirectory(transaction) {
  const names = readdirSync(transaction.transactionRoot);
  if (names.length !== 0) fail("P3 role return transaction cleanup refused because unexpected files remain.");
  rmdirSync(transaction.transactionRoot);
  const rootNames = readdirSync(transaction.recoveryRoot);
  if (rootNames.length === 0) rmdirSync(transaction.recoveryRoot);
}

function currentTransactionTarget(targetRoot, operation) {
  return targetFile(targetRoot, operation.relativePath);
}

function transactionBootstrapDirectory(targetRoot, relativePath) {
  const path = resolve(targetRoot, ...relativePath.split("/"));
  assertWithin(targetRoot, path, `P3 role return bootstrap directory ${relativePath}`);
  return path;
}

function assertRealBootstrapDirectory(path, label) {
  if (!existsSync(path)) return false;
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a real directory, not a symlink or special file.`);
  return true;
}

function rollbackBootstrapDirectories(transaction, journal, targetRoot) {
  for (const directory of [...journal.directories].reverse()) {
    const path = transactionBootstrapDirectory(targetRoot, directory.relativePath);
    if (!directory.existedAtIntent && directory.state === "mkdir-intent" && existsSync(path)) {
      // The intent was flushed before mkdir and the directory was proven absent
      // at that point.  An empty real directory is therefore the recoverable
      // post-mkdir/pre-state-update interruption case.  Persist the recovered
      // ownership fact before deleting it; a non-empty directory remains
      // fail-closed because it may contain concurrent external bytes.
      if (!assertRealBootstrapDirectory(path, `P3 role return transaction-intended bootstrap directory ${directory.relativePath}`)) {
        fail(`P3 role return recovery cannot prove its transaction-intended bootstrap directory exists: ${directory.relativePath}`);
      }
      if (readdirSync(path).length !== 0) {
        fail(`P3 role return recovery refused to remove a non-empty transaction-intended bootstrap directory: ${directory.relativePath}`);
      }
      directory.createdByThisTransaction = true;
      directory.state = "created";
      writeJournal(transaction, journal);
    }
    if (directory.createdByThisTransaction) {
      if (!assertRealBootstrapDirectory(path, `P3 role return created bootstrap directory ${directory.relativePath}`)) {
        fail(`P3 role return recovery cannot prove its created bootstrap directory still exists: ${directory.relativePath}`);
      }
      if (readdirSync(path).length !== 0) {
        fail(`P3 role return recovery refused to remove a non-empty created bootstrap directory: ${directory.relativePath}`);
      }
      rmdirSync(path);
      continue;
    }
    if (directory.existedAtIntent) {
      if (!assertRealBootstrapDirectory(path, `P3 role return pre-existing bootstrap directory ${directory.relativePath}`)) {
        fail(`P3 role return recovery cannot prove a pre-existing bootstrap directory remains: ${directory.relativePath}`);
      }
      continue;
    }
    // A pending state has no durable mkdir intent.  An extant path is unknown
    // and is intentionally never removed by recovery.
    if (existsSync(path)) {
      assertRealBootstrapDirectory(path, `P3 role return unknown bootstrap directory ${directory.relativePath}`);
      fail(`P3 role return recovery found an unproven bootstrap directory and remains fail-closed: ${directory.relativePath}`);
    }
  }
}

function rollbackJournal(transaction, journal, targetRoot) {
  assertTransactionLayout(transaction, journal);
  for (const operation of [...journal.operations].reverse()) {
    const target = currentTransactionTarget(targetRoot, operation);
    const backupPath = transactionFile(transaction, operation.backupName, "P3 role return backup");
    const stagingPath = transactionFile(transaction, operation.stagingName, "P3 role return staged replacement");
    const backup = operation.existed ? readTransactionRegularFile(backupPath, operation.originalSha256, "P3 role return backup") : null;
    if (!operation.existed && existsSync(backupPath)) fail("P3 role return recovery found a backup for a new target.");
    if (operation.existed) {
      if (backup) {
        if (target.exists) {
          if (target.sha256 !== operation.returnSha256) fail(`P3 role return recovery refused to overwrite a changed target: ${operation.relativePath}`);
          unlinkSync(target.path);
        }
        renameSync(backupPath, target.path);
      } else if (!target.exists || target.sha256 !== operation.originalSha256) {
        fail(`P3 role return recovery cannot prove the original target is intact: ${operation.relativePath}`);
      }
    } else if (target.exists) {
      if (target.sha256 !== operation.returnSha256) fail(`P3 role return recovery refused to remove a changed new target: ${operation.relativePath}`);
      unlinkSync(target.path);
    }
    removeTransactionFile(stagingPath, operation.returnSha256, "P3 role return staged replacement");
  }
  rollbackBootstrapDirectories(transaction, journal, targetRoot);
  const journalPath = join(transaction.transactionRoot, RECOVERY_JOURNAL);
  if (existsSync(journalPath)) unlinkSync(journalPath);
  const nextPath = join(transaction.transactionRoot, "journal.next.json");
  if (existsSync(nextPath)) unlinkSync(nextPath);
  removeTransactionDirectory(transaction);
}

function finalizeCommittedJournal(transaction, journal, targetRoot) {
  assertTransactionLayout(transaction, journal);
  for (const operation of journal.operations) {
    const target = currentTransactionTarget(targetRoot, operation);
    if (!target.exists || target.sha256 !== operation.returnSha256) {
      fail(`P3 role return committed recovery cannot prove the returned target is intact: ${operation.relativePath}`);
    }
    const backupPath = transactionFile(transaction, operation.backupName, "P3 role return backup");
    const stagingPath = transactionFile(transaction, operation.stagingName, "P3 role return staged replacement");
    if (operation.existed) removeTransactionFile(backupPath, operation.originalSha256, "P3 role return backup");
    else if (existsSync(backupPath)) fail("P3 role return committed recovery found a backup for a new target.");
    if (existsSync(stagingPath)) fail("P3 role return committed recovery found an unapplied staged replacement.");
  }
  const journalPath = join(transaction.transactionRoot, RECOVERY_JOURNAL);
  if (existsSync(journalPath)) unlinkSync(journalPath);
  const nextPath = join(transaction.transactionRoot, "journal.next.json");
  if (existsSync(nextPath)) unlinkSync(nextPath);
  removeTransactionDirectory(transaction);
}

function recoverPendingTransactions(targetRoot) {
  const transactions = recoveryTransactions(targetRoot);
  const recovered = [];
  for (const transaction of transactions) {
    const journal = readJournal(transaction, targetRoot);
    if (journal.state === "committed") {
      finalizeCommittedJournal(transaction, journal, targetRoot);
      recovered.push({ transactionId: transaction.transactionId, action: "finalized-committed" });
    } else {
      rollbackJournal(transaction, journal, targetRoot);
      recovered.push({ transactionId: transaction.transactionId, action: "rolled-back-interrupted" });
    }
  }
  return recovered;
}

function assertNoPendingRecovery(targetRoot) {
  const transactions = recoveryTransactions(targetRoot);
  if (transactions.length > 0) {
    fail("actual target root has pending P3 role return recovery journals; run --recover or --apply before --check.");
  }
}

function createTransaction(targetRoot, operations, bootstrapDirectories) {
  const recoveryRoot = assertRecoveryDirectory(targetRoot, true);
  const transactionId = randomUUID();
  const transactionRoot = join(recoveryRoot, `txn-${transactionId}`);
  mkdirSync(transactionRoot, { recursive: false, mode: 0o700 });
  const transaction = { recoveryRoot, transactionRoot, transactionId };
  const journal = {
    version: 2,
    kind: "p3-role-return-recovery-journal",
    targetRoot,
    transactionId,
    state: "prepared",
    operations: operations.map((operation, index) => ({
      relativePath: operation.relativePath,
      existed: operation.existed,
      originalSha256: operation.originalSha256,
      originalMode: operation.originalMode,
      returnSha256: operation.returnSha256,
      stagingName: `replacement-${index}`,
      backupName: `backup-${index}`,
      state: "pending",
    })),
    directories: bootstrapDirectories.map((relativePath) => {
      const path = transactionBootstrapDirectory(targetRoot, relativePath);
      const existedAtIntent = assertRealBootstrapDirectory(path, `P3 role return bootstrap directory ${relativePath}`);
      return {
        relativePath,
        existedAtIntent,
        createdByThisTransaction: false,
        state: existedAtIntent ? "already-existed" : "pending",
      };
    }),
  };
  // The v2 journal, including every planned mkdir, is durable-ish before any
  // bootstrap directory is created.  A crash between mkdir and the following
  // journal update is deliberately recovered fail-closed rather than guessed.
  writeJournal(transaction, journal, true);
  return { transaction, journal };
}

function maybeTestDirectoryCrash(completedDirectories) {
  if (process.env.NODE_ENV === "test" && process.env.P3_ROLE_RETURN_TEST_CRASH_AFTER_MKDIR === String(completedDirectories)) {
    process.stderr.write("P3 ROLE RETURN: test-only simulated interruption after bootstrap mkdir.\n");
    process.exit(87);
  }
}

function bootstrapJournalDirectories(transaction, journal, targetRoot) {
  let created = 0;
  for (const directory of journal.directories) {
    const path = transactionBootstrapDirectory(targetRoot, directory.relativePath);
    if (directory.existedAtIntent) {
      if (!assertRealBootstrapDirectory(path, `P3 role return pre-existing bootstrap directory ${directory.relativePath}`)) {
        fail(`Pre-existing bootstrap directory disappeared before apply: ${directory.relativePath}`);
      }
      continue;
    }
    directory.state = "mkdir-intent";
    writeJournal(transaction, journal);
    if (existsSync(path)) {
      assertRealBootstrapDirectory(path, `P3 role return unexpected bootstrap directory ${directory.relativePath}`);
      fail(`Bootstrap directory appeared after its journal intent: ${directory.relativePath}`);
    }
    mkdirSync(path, { recursive: false, mode: 0o755 });
    created += 1;
    maybeTestDirectoryCrash(created);
    directory.createdByThisTransaction = true;
    directory.state = "created";
    writeJournal(transaction, journal);
  }
}

function stageJournalReplacements(transaction, journal, operations) {
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    const stagedPath = transactionFile(transaction, journal.operations[index].stagingName, "P3 role return staged replacement");
    writeFileSync(stagedPath, operation.returnBytes, { flag: "wx", mode: operation.existed ? operation.originalMode : 0o644 });
    chmodSync(stagedPath, operation.existed ? operation.originalMode : 0o644);
    flushFile(stagedPath);
    if (sha256Bytes(readFileSync(stagedPath)) !== operation.returnSha256) fail(`Safe staging hash mismatch: ${operation.relativePath}`);
  }
  journal.state = "staged";
  writeJournal(transaction, journal);
}

function maybeTestCrash(completedOperations) {
  if (process.env.NODE_ENV === "test" && process.env.P3_ROLE_RETURN_TEST_CRASH_AFTER_OPERATION === String(completedOperations)) {
    process.stderr.write("P3 ROLE RETURN: test-only simulated interruption after replacement.\n");
    process.exit(86);
  }
}

function applyOperations(validation) {
  const { targetRoot, operations, bootstrapDirectories } = validation._internal;
  const { transaction, journal } = createTransaction(targetRoot, operations, bootstrapDirectories);
  let committed = false;
  try {
    bootstrapJournalDirectories(transaction, journal, targetRoot);
    stageJournalReplacements(transaction, journal, operations);
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      const journalOperation = journal.operations[index];
      assertUnchangedTarget(operation);
      journal.state = "applying";
      journalOperation.state = "moving-original";
      writeJournal(transaction, journal);
      const backupPath = transactionFile(transaction, journalOperation.backupName, "P3 role return backup");
      if (operation.existed) {
        renameSync(operation.targetPath, backupPath);
        if (sha256Bytes(readFileSync(backupPath)) !== operation.originalSha256) {
          fail(`Target changed after validation before apply: ${operation.relativePath}`);
        }
      }
      journalOperation.state = "original-moved";
      writeJournal(transaction, journal);
      journalOperation.state = "moving-replacement";
      writeJournal(transaction, journal);
      const stagedPath = transactionFile(transaction, journalOperation.stagingName, "P3 role return staged replacement");
      renameSync(stagedPath, operation.targetPath);
      if (sha256Bytes(readFileSync(operation.targetPath)) !== operation.returnSha256) {
        fail(`Applied replacement hash mismatch: ${operation.relativePath}`);
      }
      journalOperation.state = "replacement-moved";
      writeJournal(transaction, journal);
      maybeTestCrash(index + 1);
    }
    journal.state = "committed";
    writeJournal(transaction, journal);
    committed = true;
    finalizeCommittedJournal(transaction, journal, targetRoot);
  } catch (error) {
    if (committed) {
      fail(`Role return applied but recovery journal cleanup remains required: ${error.message}`);
    }
    try {
      rollbackJournal(transaction, journal, targetRoot);
    } catch (rollbackError) {
      fail(`Role return apply failed: ${error.message}; recovery journal requires coordinator attention: ${rollbackError.message}`);
    }
    fail(`Role return apply failed and was rolled back: ${error.message}`);
  }
}

function requireBoundAbsoluteFile(pathValue, expectedSha256, label) {
  const pathname = requiredString(pathValue, `${label}.path`);
  if (!isAbsolute(pathname)) fail(`${label}.path must be absolute.`);
  const bytes = readRegularFile(resolve(pathname), label);
  if (sha256Bytes(bytes) !== sha256(expectedSha256, `${label}.sha256`)) {
    fail(`${label} SHA-256 does not match the actual checkpoint proof.`);
  }
  return resolve(pathname);
}

function verifiedActualCheckpointRecord(value, label) {
  const record = object(value, label);
  const passedAt = requiredString(record.passedAt, `${label}.passedAt`);
  if (Number.isNaN(Date.parse(passedAt))) fail(`${label}.passedAt must be an ISO timestamp.`);
  requireBoundAbsoluteFile(record.measuredSpecPath, record.measuredSpecSha256, `${label}.measuredSpec`);
  const batch = object(record.batchEvidence, `${label}.batchEvidence`);
  requireBoundAbsoluteFile(batch.batchJobPath, batch.batchJobSha256, `${label}.batchJob`);
  requireBoundAbsoluteFile(batch.batchSummaryPath, batch.batchSummarySha256, `${label}.batchSummary`);
  requiredString(batch.browserSessionId, `${label}.batchEvidence.browserSessionId`);
  if (!Number.isInteger(Number(batch.browserPid))) fail(`${label}.batchEvidence.browserPid must be an integer.`);
  return stableHash(record);
}

function benchmarkAttemptResult(value, label) {
  const attempt = object(value, label);
  const result = outcome(attempt.outcome, `${label}.outcome`);
  if (attempt.finalRecheck === true || attempt.release === true) {
    fail(`${label} is not a direct implementation checkpoint attempt.`);
  }
  const parsed = {
    elementId: requiredString(attempt.elementId, `${label}.elementId`),
    attempt: positiveInteger(attempt.attempt, `${label}.attempt`),
    outcome: result,
    failureClass: failureClass(attempt.failureClass, result, `${label}.failureClass`),
    sha256: stableHash(attempt),
  };
  if (typeof attempt.at !== "string" || Number.isNaN(Date.parse(attempt.at))) fail(`${label}.at must be an ISO timestamp.`);
  return parsed;
}

function actualCheckpointResult(plan, targetRoot, appliedRecord) {
  const before = appliedRecord.preCheckpointGateState;
  const after = liveGateStateSnapshot(plan, targetRoot);
  if (after.sha256 === before.sha256
    || after.preflightId !== before.preflightId
    || after.benchmarkAttemptCount !== before.benchmarkAttemptCount + 1
    || stableHash(after.attempts.slice(0, before.benchmarkAttemptCount)) !== before.benchmarkAttemptsSha256) {
    fail("Actual figma-gate state does not contain exactly one new checkpoint result after this applied return.");
  }
  const attempt = benchmarkAttemptResult(after.attempts.at(-1), "Actual figma-gate checkpoint benchmark attempt");
  if (attempt.elementId !== plan.component.elementId || attempt.attempt !== plan.component.attempt) {
    fail("Actual figma-gate checkpoint result does not match the applied return component and attempt.");
  }
  let checkpointRecordSha256 = null;
  if (attempt.outcome === "PASS") {
    if (!after.checkpointRecord || before.componentCheckpointRecordSha256 !== null) {
      fail("Actual figma-gate PASS checkpoint record is missing or predates the applied return.");
    }
    checkpointRecordSha256 = verifiedActualCheckpointRecord(after.checkpointRecord, `Actual figma-gate checkpoint (${plan.component.elementId})`);
    if (checkpointRecordSha256 !== after.componentCheckpointRecordSha256) {
      fail("Actual figma-gate checkpoint record changed while producing the coordinator proof.");
    }
  } else if (after.componentCheckpointRecordSha256 !== before.componentCheckpointRecordSha256) {
    fail("Actual figma-gate FAIL result unexpectedly changed the component checkpoint record.");
  }
  return {
    gateState: {
      path: after.path,
      sha256: after.sha256,
      preflightId: after.preflightId,
      benchmarkAttemptCount: after.benchmarkAttemptCount,
      benchmarkAttemptsSha256: after.benchmarkAttemptsSha256,
      componentCheckpointRecordSha256: after.componentCheckpointRecordSha256,
    },
    benchmarkAttemptIndex: before.benchmarkAttemptCount,
    benchmarkAttemptSha256: attempt.sha256,
    checkpointRecordSha256,
    outcome: attempt.outcome,
    failureClass: attempt.failureClass,
  };
}

function checkpointProofDocument(value, label) {
  const document = object(value, label);
  exactKeys(document, new Set([
    "version", "kind", "coordinatorOnly", "pairId", "condition", "targetWorktreeRoot", "checkpointPlanSha256",
    "component", "handoff", "applicationRecordSha256", "gateState", "benchmarkAttemptIndex", "benchmarkAttemptSha256",
    "checkpointRecordSha256", "outcome", "failureClass",
  ]), label);
  if (document.version !== CHECKPOINT_PROOF_VERSION || document.kind !== CHECKPOINT_PROOF_KIND || document.coordinatorOnly !== true) {
    fail(`${label} has an unsupported coordinator checkpoint proof schema.`);
  }
  const identity = progressRecordIdentity({ ...document, planSha256: "0".repeat(64), returnArchiveSha256: "0".repeat(64), returnManifestSha256: "0".repeat(64) }, label);
  // The proof intentionally excludes plan/archive values from its public
  // schema; those stay in the progress ledger.  Retain only the authority
  // fields shared by both artifacts.
  if (!Number.isInteger(document.benchmarkAttemptIndex) || document.benchmarkAttemptIndex < 0) {
    fail(`${label}.benchmarkAttemptIndex must be a non-negative integer.`);
  }
  const result = outcome(document.outcome, `${label}.outcome`);
  const checkpointHash = document.checkpointRecordSha256;
  if (result === "PASS") sha256(checkpointHash, `${label}.checkpointRecordSha256`);
  else if (checkpointHash !== null) fail(`${label}.checkpointRecordSha256 must be null for FAIL.`);
  return {
    ...document,
    pairId: identity.pairId,
    condition: identity.condition,
    targetWorktreeRoot: identity.targetWorktreeRoot,
    checkpointPlanSha256: identity.checkpointPlanSha256,
    component: identity.component,
    handoff: identity.handoff,
    applicationRecordSha256: sha256(document.applicationRecordSha256, `${label}.applicationRecordSha256`),
    gateState: progressGateState(document.gateState, `${label}.gateState`),
    benchmarkAttemptSha256: sha256(document.benchmarkAttemptSha256, `${label}.benchmarkAttemptSha256`),
    checkpointRecordSha256: checkpointHash,
    outcome: result,
    failureClass: failureClass(document.failureClass, result, `${label}.failureClass`),
  };
}

function writeCheckpointProof(directory, value) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: false, mode: 0o700 });
  const root = assertRealDirectory(directory, "Coordinator checkpoint-proof directory");
  const filename = `checkpoint-${value.component.sequence}-${value.component.attempt}-${value.applicationRecordSha256.slice(0, 16)}.json`;
  const path = join(root, filename);
  assertWithin(root, path, "Coordinator checkpoint-proof output");
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  flushFile(path);
  return { path, sha256: sha256Bytes(bytes) };
}

function readCheckpointProof(reference, plan, targetRoot, label) {
  assertCoordinatorArtifactOutsideRuntime(reference.path, plan, targetRoot, `${label}.path`);
  const bytes = readRegularFile(reference.path, label);
  if (sha256Bytes(bytes) !== reference.sha256) fail(`${label} SHA-256 does not match its progress-ledger reference.`);
  let document;
  try {
    document = checkpointProofDocument(JSON.parse(bytes.toString("utf8")), label);
  } catch (error) {
    if (error instanceof Error) throw error;
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return document;
}

function feedbackDocument(value, label) {
  const feedback = object(value, label);
  exactKeys(feedback, new Set([
    "version", "kind", "handoffId", "component", "checkpointProofSha256", "outcome", "failureClass", "sameCondition", "feedback",
  ]), label);
  if (feedback.version !== FEEDBACK_VERSION || feedback.kind !== FEEDBACK_KIND || feedback.sameCondition !== true) {
    fail(`${label} must be a same-condition p3-role-return-feedback version 1 record.`);
  }
  const delivery = object(feedback.component, `${label}.component`);
  const parsedComponent = progressComponent(delivery, `${label}.component`);
  const result = outcome(feedback.outcome, `${label}.outcome`);
  const message = object(feedback.feedback, `${label}.feedback`);
  exactKeys(message, new Set(["kind", "message"]), `${label}.feedback`);
  if (requiredString(message.kind, `${label}.feedback.kind`) !== "same-condition-gate-result") {
    fail(`${label}.feedback.kind must be same-condition-gate-result.`);
  }
  requiredString(message.message, `${label}.feedback.message`);
  return {
    handoffId: requiredString(feedback.handoffId, `${label}.handoffId`),
    component: parsedComponent,
    checkpointProofSha256: sha256(feedback.checkpointProofSha256, `${label}.checkpointProofSha256`),
    outcome: result,
    failureClass: failureClass(feedback.failureClass, result, `${label}.failureClass`),
  };
}

function readFeedback(reference, plan, targetRoot, label) {
  assertCoordinatorArtifactOutsideRuntime(reference.path, plan, targetRoot, `${label}.path`);
  const bytes = readRegularFile(reference.path, label);
  if (sha256Bytes(bytes) !== reference.sha256) fail(`${label} SHA-256 does not match its progress-ledger reference.`);
  try {
    return feedbackDocument(JSON.parse(bytes.toString("utf8")), label);
  } catch (error) {
    if (error instanceof Error) throw error;
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function verifyRecordedProgressArtifacts(records, plan, targetRoot) {
  const checkpoints = new Map();
  for (const record of records) {
    if (record.event === "checkpoint-recorded") {
      const proof = readCheckpointProof(record.checkpointProof, plan, targetRoot, "Coordinator checkpoint proof");
      if (proof.applicationRecordSha256 !== record.applicationRecordSha256
        || proof.pairId !== record.pairId || proof.condition !== record.condition
        || proof.targetWorktreeRoot !== record.targetWorktreeRoot
        || proof.checkpointPlanSha256 !== record.checkpointPlanSha256
        || proof.component.elementId !== record.component.elementId
        || proof.component.componentDecisionCodePath !== record.component.componentDecisionCodePath
        || proof.component.sequence !== record.component.sequence
        || proof.component.attempt !== record.component.attempt
        || proof.handoff.opaqueHandoffId !== record.handoff.opaqueHandoffId
        || proof.handoff.deliverySequence !== record.handoff.deliverySequence
        || proof.handoff.protocolSha256 !== record.handoff.protocolSha256
        || proof.outcome !== record.outcome || proof.failureClass !== record.failureClass) {
        fail("Coordinator checkpoint proof does not exactly bind its progress ledger record.");
      }
      checkpoints.set(record.entrySha256, record);
    } else if (record.event === "feedback-recorded") {
      const checkpoint = checkpoints.get(record.checkpointRecordSha256);
      if (!checkpoint) fail("Coordinator feedback record has no prior matching checkpoint proof.");
      const feedback = readFeedback(record.feedback, plan, targetRoot, "Coordinator same-condition feedback");
      if (feedback.handoffId !== record.handoff.opaqueHandoffId
        || feedback.component.elementId !== record.component.elementId
        || feedback.component.componentDecisionCodePath !== record.component.componentDecisionCodePath
        || feedback.component.sequence !== record.component.sequence
        || feedback.component.attempt !== record.component.attempt
        || feedback.checkpointProofSha256 !== checkpoint.checkpointProof.sha256
        || feedback.outcome !== record.outcome || feedback.failureClass !== record.failureClass) {
        fail("Coordinator same-condition feedback does not exactly bind its checkpoint result.");
      }
    }
  }
}

function planForProgressAction(planPathValue, targetRootValue) {
  const plan = validatePlan(planPathValue, targetRootValue);
  const targetRoot = assertRealDirectory(resolve(process.cwd(), requiredString(targetRootValue, "actual target root")), "actual target root");
  return { plan, targetRoot };
}

function assertAppliedRecordMatchesPlan(record, plan, targetRoot) {
  if (!sameProgressIdentityToPlan(record, plan, targetRoot)) {
    fail("Coordinator progress action plan does not exactly match the applied handoff component, sequence, attempt, and delivery.");
  }
}

export function recordRoleReturnCheckpoint(planPathValue, targetRootValue) {
  const first = planForProgressAction(planPathValue, targetRootValue);
  return withProgressLock(first.plan.authority.progress.ledgerPath, () => {
    const { plan, targetRoot } = planForProgressAction(planPathValue, targetRootValue);
    const records = readProgressLedger(plan.authority.progress.ledgerPath);
    const state = progressState(records, plan.authority, targetRoot);
    verifyRecordedProgressArtifacts(records, plan, targetRoot);
    if (state.stage !== "applied" || !state.active) {
      fail("Coordinator role-return checkpoint recording requires exactly one applied return and no prior checkpoint or feedback record.");
    }
    assertAppliedRecordMatchesPlan(state.active, plan, targetRoot);
    const result = actualCheckpointResult(plan, targetRoot, state.active);
    const proofValue = {
      version: CHECKPOINT_PROOF_VERSION,
      kind: CHECKPOINT_PROOF_KIND,
      coordinatorOnly: true,
      pairId: state.active.pairId,
      condition: state.active.condition,
      targetWorktreeRoot: state.active.targetWorktreeRoot,
      checkpointPlanSha256: state.active.checkpointPlanSha256,
      component: state.active.component,
      handoff: state.active.handoff,
      applicationRecordSha256: state.active.entrySha256,
      gateState: result.gateState,
      benchmarkAttemptIndex: result.benchmarkAttemptIndex,
      benchmarkAttemptSha256: result.benchmarkAttemptSha256,
      checkpointRecordSha256: result.checkpointRecordSha256,
      outcome: result.outcome,
      failureClass: result.failureClass,
    };
    const proof = writeCheckpointProof(plan.authority.progress.checkpointProofDirectory, proofValue);
    const record = appendProgressRecord(plan.authority.progress.ledgerPath, "checkpoint-recorded", identityFromProgressRecord(state.active), {
      applicationRecordSha256: state.active.entrySha256,
      checkpointProof: proof,
      outcome: result.outcome,
      failureClass: result.failureClass,
    });
    return {
      version: 1,
      kind: "p3-role-return-checkpoint-recording",
      coordinatorOnly: true,
      progress: progressReportRecord(record),
      checkpointProof: proof,
      outcome: result.outcome,
      failureClass: result.failureClass,
    };
  });
}

export function recordRoleReturnFeedback(planPathValue, feedbackPathValue, targetRootValue) {
  const first = planForProgressAction(planPathValue, targetRootValue);
  return withProgressLock(first.plan.authority.progress.ledgerPath, () => {
    const { plan, targetRoot } = planForProgressAction(planPathValue, targetRootValue);
    const feedbackPath = absoluteCoordinatorPath(resolve(process.cwd(), requiredString(feedbackPathValue, "same-condition feedback path")), "same-condition feedback");
    assertCoordinatorArtifactOutsideRuntime(feedbackPath, plan, targetRoot, "same-condition feedback");
    const feedbackReference = { path: feedbackPath, sha256: sha256File(feedbackPath) };
    const feedback = readFeedback(feedbackReference, plan, targetRoot, "same-condition feedback");
    const records = readProgressLedger(plan.authority.progress.ledgerPath);
    const state = progressState(records, plan.authority, targetRoot);
    verifyRecordedProgressArtifacts(records, plan, targetRoot);
    if (state.stage !== "checkpointed" || !state.active) {
      fail("Coordinator same-condition feedback requires exactly one recorded matching checkpoint result.");
    }
    assertAppliedRecordMatchesPlan(state.active, plan, targetRoot);
    if (feedback.handoffId !== state.active.handoff.opaqueHandoffId
      || feedback.component.elementId !== state.active.component.elementId
      || feedback.component.componentDecisionCodePath !== state.active.component.componentDecisionCodePath
      || feedback.component.sequence !== state.active.component.sequence
      || feedback.component.attempt !== state.active.component.attempt
      || feedback.checkpointProofSha256 !== state.active.checkpointProof.sha256
      || feedback.outcome !== state.active.outcome || feedback.failureClass !== state.active.failureClass) {
      fail("Same-condition feedback does not match the actual checkpoint proof and applied return.");
    }
    const record = appendProgressRecord(plan.authority.progress.ledgerPath, "feedback-recorded", identityFromProgressRecord(state.active), {
      checkpointRecordSha256: state.active.entrySha256,
      feedback: feedbackReference,
      outcome: feedback.outcome,
      failureClass: feedback.failureClass,
    });
    return {
      version: 1,
      kind: "p3-role-return-feedback-recording",
      coordinatorOnly: true,
      progress: progressReportRecord(record),
      feedback: feedbackReference,
      outcome: feedback.outcome,
      failureClass: feedback.failureClass,
    };
  });
}

export function recoverRoleReturn(targetRootValue) {
  const requestedTargetRoot = resolve(process.cwd(), requiredString(targetRootValue, "actual target root"));
  const targetRoot = assertRealDirectory(requestedTargetRoot, "actual target root");
  return {
    version: 1,
    kind: "p3-role-return-recovery",
    coordinatorOnly: true,
    targetRoot,
    recovered: recoverPendingTransactions(targetRoot),
  };
}

export function applyRoleReturn(planPathValue, archivePathValue, targetRootValue) {
  const recovery = recoverRoleReturn(targetRootValue);
  const initial = validateRoleReturn(planPathValue, archivePathValue, targetRootValue);
  return withProgressLock(initial._internal.progress.ledgerPath, () => {
    // Revalidate after obtaining the coordinator-only lock.  A second
    // coordinator process cannot turn a checked return into a later attempt
    // between --check and --apply.
    const validation = validateRoleReturn(planPathValue, archivePathValue, targetRootValue);
    const intent = appendProgressRecord(validation._internal.progress.ledgerPath, "return-apply-intent", validation._internal.progress.identity, {
      preCheckpointGateState: validation._internal.progress.preCheckpointGateState,
      returnTargetFiles: validation._internal.progress.returnTargetFiles,
    });
    // If this throws (including a process interruption), the durable-ish
    // intent remains.  Recovery can restore worktree bytes, but it cannot
    // silently advance the first-try sequence; the next action fails closed
    // until a coordinator resolves the interrupted intent outside this helper.
    applyOperations(validation);
    const afterApplyGateState = liveGateStateSnapshot(validation._internal.plan, validation._internal.targetRoot);
    const afterComparable = {
      path: afterApplyGateState.path,
      sha256: afterApplyGateState.sha256,
      preflightId: afterApplyGateState.preflightId,
      benchmarkAttemptCount: afterApplyGateState.benchmarkAttemptCount,
      benchmarkAttemptsSha256: afterApplyGateState.benchmarkAttemptsSha256,
      componentCheckpointRecordSha256: afterApplyGateState.componentCheckpointRecordSha256,
    };
    if (stableHash(afterComparable) !== stableHash(validation._internal.progress.preCheckpointGateState)) {
      fail("Actual figma-gate state changed while applying a role return; the durable progress intent remains blocked for coordinator review.");
    }
    const applied = appendProgressRecord(validation._internal.progress.ledgerPath, "return-applied", validation._internal.progress.identity, {
      applyIntentSha256: intent.entrySha256,
      preCheckpointGateState: validation._internal.progress.preCheckpointGateState,
      returnTargetFiles: validation._internal.progress.returnTargetFiles,
      application: "recovery-journal-backed-rollback-capable-batch-apply",
      multiFileAtomic: false,
      durableFilesystemCommitGuaranteed: false,
    });
    const { _internal, ...report } = validation;
    return {
      ...report,
      applied: true,
      application: "recovery-journal-backed-rollback-capable-batch-apply",
      multiFileAtomic: false,
      durableFilesystemCommitGuaranteed: false,
      recoveredBeforeApply: recovery.recovered,
      progress: {
        intent: progressReportRecord(intent),
        applied: progressReportRecord(applied),
        note: "An interrupted apply remains fail-closed after recovery; this helper does not claim a durable filesystem commit or multi-file atomic transaction.",
      },
    };
  });
}

function publicReport(validation) {
  const { _internal, ...report } = validation;
  return report;
}

function main() {
  const args = process.argv.slice(2);
  try {
    if (args.length === 2 && args[0] === "--recover") {
      process.stdout.write(`${JSON.stringify(recoverRoleReturn(args[1]), null, 2)}\n`);
      return;
    }
    if (args.length === 3 && args[0] === "--record-checkpoint") {
      process.stdout.write(`${JSON.stringify(recordRoleReturnCheckpoint(args[1], args[2]), null, 2)}\n`);
      return;
    }
    if (args.length === 4 && args[0] === "--record-feedback") {
      process.stdout.write(`${JSON.stringify(recordRoleReturnFeedback(args[1], args[2], args[3]), null, 2)}\n`);
      return;
    }
    if (args.length !== 4 || (args[0] !== "--check" && args[0] !== "--apply")) {
      fail("Usage: node p3-role-return.mjs --check|--apply <coordinator-only-plan.json> <return.ustar.tar> <actual-target-root>; node p3-role-return.mjs --record-checkpoint <coordinator-only-plan.json> <actual-target-root>; node p3-role-return.mjs --record-feedback <coordinator-only-plan.json> <same-condition-feedback.json> <actual-target-root>; or node p3-role-return.mjs --recover <actual-target-root>");
    }
    const report = args[0] === "--apply"
      ? applyRoleReturn(args[1], args[2], args[3])
      : publicReport(validateRoleReturn(args[1], args[2], args[3]));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.error(`P3 ROLE RETURN: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
