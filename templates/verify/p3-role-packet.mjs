#!/usr/bin/env node
// Coordinator-only, read-only validation for a P-3 clean-room role packet.
// The role packet is bound to the actual v13 comparison contract and its
// actual owner-approved Decision J.  It never accepts a stand-alone or
// caller-supplied clean-room authorization, so the peer identities to redact
// are derived only after those two authorities bind each other.
//
// Archive attachments are rejected: the coordinator must safely unpack an
// archive into packetRoot first, where every path and regular payload can be
// enumerated.  This helper is deliberately not imported by a P-3 runtime
// command and never writes a contract, ledger, gate state, or runtime record.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const REQUIRED_FORBIDDEN_ARTIFACTS = Object.freeze([
  { id: "comparison-contract", markers: ["fidelity-comparison", "comparison-contract"] },
  { id: "decision-j", markers: ["decision-j", "decision_j", "decision j", "judgment-j", "judgment_j", "judgment j", "owner-decision"] },
  { id: "clean-room-evidence", markers: ["p3-clean-room-", "clean-room-evidence", "clean_room_evidence"] },
  { id: "template", markers: ["fidelity-comparison-template", "comparison-contract-template", "p3-contract-template", "p3-comparison-template"] },
]);
const REQUIRED_FORBIDDEN_ARTIFACT_IDS = new Set(REQUIRED_FORBIDDEN_ARTIFACTS.map((entry) => entry.id));
const ARCHIVE_SUFFIXES = [".tar.gz", ".tgz", ".tar", ".zip", ".7z", ".rar"];
const TAR_BLOCK_SIZE = 512;
const MAX_USTAR_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_USTAR_ENTRY_BYTES = 48 * 1024 * 1024;
const MAX_USTAR_ENTRY_COUNT = 256;
const P3_CONTRACT_VERSION = 13;
const CLEAN_ROOM_PROHIBITED_ARTIFACTS = Object.freeze(["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"]);
const DERIVED_PEER_IDENTITY_FIELDS = Object.freeze([
  "workspaceId",
  "worktreeRoot",
  "implementation.actor",
  "implementation.contextId",
  "review.actor",
  "review.contextId",
  "evidencePath",
  "otherWorkspaceId",
]);
// These are static path classes, not text-substring bans.  Keeping them
// segment/basename-specific lets a normal asset such as
// assets/template-reference.png remain valid while mechanically excluding the
// coordinator-only inputs named by the P-3 clean-room protocol.
const ROLE_INPUT_PATH_EXCLUSIONS = Object.freeze([
  { id: "git-metadata", description: ".git metadata or an embedded bare common-Git directory" },
  { id: "project-mybrain", description: "raw MyBrain project material, including MyBrain/verify" },
  { id: "agent-instructions", description: "AGENTS.md or CLAUDE.md host-instruction files" },
  { id: "project-state", description: "STATE.md project state record" },
  { id: "p3-contract-records", description: "P3-CONTRACT-RECORDS.md" },
  { id: "comparison-contract", description: "P-3 comparison contract or contract template" },
  { id: "decision-j", description: "Owner Decision J record" },
  { id: "clean-room-evidence", description: "P-3 clean-room evidence" },
  { id: "evaluator-record", description: "P-3 evaluator input or baseline record" },
  { id: "figma-gate-state", description: ".figma-gate runtime state" },
  { id: "p3-ledger", description: "P-3 comparison ledger" },
  { id: "p3-pair-lock", description: "P-3 pair lock" },
]);

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

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function stableJsonSha256(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(stable(value)), "utf8"));
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} does not exist: ${filePath}`);
  return parseJsonBytes(readFileSync(filePath), label);
}

function asciiFold(value) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function canonicalFsPath(value) {
  const normalized = resolve(value).replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin" ? asciiFold(normalized) : normalized;
}

function sameFsPath(left, right) {
  return canonicalFsPath(left) === canonicalFsPath(right);
}

function packetRelativePath(value, label) {
  const input = requiredString(value, label);
  if (input.includes("\\")) fail(`${label} must use '/' separators.`);
  if (isAbsolute(input) || /^[A-Za-z]:/.test(input)) fail(`${label} must be relative.`);
  if (input.endsWith("/")) fail(`${label} must name a file or directory, not end with '/'.`);
  const normalized = posix.normalize(input);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized !== input) {
    fail(`${label} must be a normalized relative path without '..'.`);
  }
  return normalized;
}

function repositoryRelativePath(value, label) {
  const input = requiredString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(`${label} must be repository-relative.`);
  const normalized = posix.normalize(input);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    fail(`${label} must not escape the comparison repository.`);
  }
  return normalized;
}

function digest(value, label) {
  const result = requiredString(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`${label} must be a lowercase SHA-256 digest.`);
  return result;
}

function assertWithin(parent, candidate, label) {
  const route = relative(parent, candidate);
  if (route === "" || route === ".." || route.startsWith("../") || route.startsWith("..\\") || isAbsolute(route)) {
    fail(`${label} must stay within the plan directory.`);
  }
}

function isWithin(parent, candidate) {
  const route = relative(parent, candidate);
  return route === "" || (route !== ".." && !route.startsWith("../") && !route.startsWith("..\\") && !isAbsolute(route));
}

function coordinatorFileReference(value, label, planDirectory, packetRoot, planPath) {
  const reference = object(value, label);
  exactKeys(reference, new Set(["path", "sha256"]), label);
  const path = requiredString(reference.path, `${label}.path`);
  const sha256 = digest(reference.sha256, `${label}.sha256`);
  const absolutePath = isAbsolute(path) || win32.isAbsolute(path) ? resolve(path) : resolve(planDirectory, path);
  if (isWithin(packetRoot, absolutePath)) fail(`${label}.path must stay outside packetRoot.`);
  if (sameFsPath(absolutePath, planPath)) fail(`${label}.path must name a separate coordinator-only JSON file.`);
  if (!existsSync(absolutePath)) fail(`${label}.path does not exist: ${path}`);
  const info = lstatSync(absolutePath);
  if (info.isSymbolicLink() || !info.isFile()) fail(`${label}.path must name a real regular file, not a symlink or special file.`);
  const bytes = readFileSync(absolutePath);
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== sha256) fail(`${label} SHA-256 mismatch.`);
  return { path, sha256, absolutePath, bytes, json: parseJsonBytes(bytes, label) };
}

function identityVariants(value, { pathLike = false } = {}) {
  const values = [];
  const seen = new Set();
  const add = (candidate) => {
    if (candidate === "") return;
    const key = asciiFold(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    values.push(candidate);
  };
  add(value);
  if (pathLike) {
    const slashForm = value.replace(/\\/g, "/");
    const canonicalSlashForm = posix.normalize(slashForm);
    const windowsForm = win32.normalize(value);
    add(slashForm);
    add(canonicalSlashForm);
    add(slashForm.replace(/\//g, "\\"));
    add(canonicalSlashForm.replace(/\//g, "\\"));
    add(windowsForm);
    add(windowsForm.replace(/\\/g, "/"));
  }
  for (const candidate of [...values]) add(JSON.stringify(candidate).slice(1, -1));
  return values.map((candidate) => ({ value: candidate, folded: asciiFold(candidate), bytes: Buffer.from(candidate, "utf8") }));
}

function derivedIdentity(field, value, options) {
  return { field, variants: identityVariants(value, options) };
}

function identityHit(value, identities) {
  const folded = asciiFold(value);
  for (const identity of identities) {
    const variant = identity.variants.find((candidate) => folded.includes(candidate.folded));
    if (variant) return { identity, variant };
  }
  return null;
}

function assertNoForbiddenIdentity(value, identities, location) {
  if (identityHit(value, identities)) fail(`Role packet contains a forbidden identity string in ${location}.`);
}

function restrictedArtifactIds(value) {
  const folded = asciiFold(value);
  return REQUIRED_FORBIDDEN_ARTIFACTS
    .filter((artifact) => artifact.markers.some((marker) => folded.includes(marker)))
    .map((artifact) => artifact.id);
}

function assertNoRestrictedArtifact(value, location) {
  const matches = restrictedArtifactIds(value);
  if (matches.length > 0) fail(`Role packet contains a restricted P-3 artifact in ${location}: ${matches.join(", ")}.`);
}

function assertNotArchiveAttachment(value, location) {
  const hasArchiveSegment = value.split("/").some((segment) => {
    const folded = asciiFold(segment);
    return ARCHIVE_SUFFIXES.some((suffix) => folded.endsWith(suffix));
  });
  if (hasArchiveSegment) {
    fail(`Role packet does not accept archive attachments in ${location}; safely unpack the archive into packetRoot before --check.`);
  }
}

function roleInputPathExclusionIds(value) {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment !== "").map(asciiFold);
  const basename = segments.at(-1) || "";
  const ids = new Set();
  if (segments.includes(".git")) ids.add("git-metadata");
  if (segments.includes("mybrain")) ids.add("project-mybrain");
  if (basename === "agents.md" || basename === "claude.md") ids.add("agent-instructions");
  if (basename === "state.md") ids.add("project-state");
  if (basename === "p3-contract-records.md") ids.add("p3-contract-records");
  if (basename === "fidelity-comparison-template.json" || /^fidelity-comparison(?:[-_.][a-z0-9][a-z0-9_.-]*)?\.json$/i.test(basename)) ids.add("comparison-contract");
  if (/^(?:p3-)?(?:owner-)?(?:decision|judgment)[-_]j(?:[-_.][a-z0-9][a-z0-9_.-]*)?\.json$/i.test(basename) || /^p3-owner-decision(?:[-_.][a-z0-9][a-z0-9_.-]*)?\.json$/i.test(basename)) ids.add("decision-j");
  if (/^p3-clean-room(?:[-_.][a-z0-9][a-z0-9_.-]*)?\.json$/i.test(basename) || /^clean-room-evidence(?:[-_.][a-z0-9][a-z0-9_.-]*)?\.json$/i.test(basename)) ids.add("clean-room-evidence");
  if (/^p3-evaluator-(?:input|baseline)(?:[-_.][a-z0-9][a-z0-9_.-]*)?\.json$/i.test(basename)) ids.add("evaluator-record");
  if (segments.includes(".figma-gate")) ids.add("figma-gate-state");
  if (basename === "figma-p3-comparison-ledger.jsonl") ids.add("p3-ledger");
  if (segments.includes("figma-p3-comparison-pair-locks")) ids.add("p3-pair-lock");
  return [...ids];
}

function assertNoRoleInputExcludedPath(value, location) {
  const ids = roleInputPathExclusionIds(value);
  if (ids.length > 0) {
    fail(`Role packet contains a prohibited role-input path in ${location}: ${ids.join(", ")}.`);
  }
}

function canonicalAbsolutePath(value) {
  return canonicalFsPath(value).replace(/\/+$/, "");
}

function absolutePathsOverlap(left, right) {
  const normalizedLeft = canonicalAbsolutePath(left);
  const normalizedRight = canonicalAbsolutePath(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}/`)
    || normalizedRight.startsWith(`${normalizedLeft}/`);
}

function assertPacketRootOutsideActualWorktrees(packetRoot, conditions) {
  for (const condition of conditions) {
    if (absolutePathsOverlap(packetRoot, condition.worktreeRoot)) {
      fail(`packetRoot must not be an actual ${condition.condition} worktree or an ancestor/descendant of one.`);
    }
  }
}

function isBareGitDirectory(directory) {
  try {
    const head = lstatSync(join(directory, "HEAD"));
    const objects = lstatSync(join(directory, "objects"));
    const refs = lstatSync(join(directory, "refs"));
    return !head.isSymbolicLink() && head.isFile()
      && !objects.isSymbolicLink() && objects.isDirectory()
      && !refs.isSymbolicLink() && refs.isDirectory();
  } catch {
    return false;
  }
}

function asciiCaseEquivalent(expected, actual) {
  if (expected === actual) return true;
  if (expected >= 0x41 && expected <= 0x5a) return actual === expected + 0x20;
  if (expected >= 0x61 && expected <= 0x7a) return actual === expected - 0x20;
  return false;
}

function identityBytesHit(bytes, identities) {
  for (const identity of identities) {
    for (const variant of identity.variants) {
      const needle = variant.bytes;
      for (let start = 0; start <= bytes.length - needle.length; start += 1) {
        let matches = true;
        for (let offset = 0; offset < needle.length; offset += 1) {
          if (!asciiCaseEquivalent(needle[offset], bytes[start + offset])) {
            matches = false;
            break;
          }
        }
        if (matches) return { identity, variant };
      }
    }
  }
  return null;
}

function assertNoForbiddenIdentityBytes(bytes, identities, location) {
  if (identityBytesHit(bytes, identities)) fail(`Role packet contains a forbidden identity string in ${location}.`);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

// Payload classification deliberately uses a narrow P-3 record signature.
// It does not reject ordinary wording such as "template" or "clean room" in
// a brief; it rejects a full JSON document only when its authoritative fields
// identify the document class.
function p3ContractVersionArtifact(value) {
  return Number.isInteger(value) && value >= 1 && value <= P3_CONTRACT_VERSION;
}

function restrictedJsonArtifactId(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const shared = value.shared;
  if (p3ContractVersionArtifact(value.version)
    && typeof value.pairId === "string"
    && (value.condition === "baseline" || value.condition === "current")
    && shared && typeof shared === "object" && !Array.isArray(shared)
    && shared.cleanRoomAuthorization && typeof shared.cleanRoomAuthorization === "object"
    && shared.ownerDecisionJ && typeof shared.ownerDecisionJ === "object"
    && value.run && typeof value.run === "object") {
    return "comparison-contract";
  }
  if (value.version === 2
    && value.decisionId === "J"
    && typeof value.pairId === "string"
    && value.cleanRoomAuthorization && typeof value.cleanRoomAuthorization === "object"
    && typeof value.cleanRoomAuthorizationStableJsonSha256 === "string") {
    return "decision-j";
  }
  if (value.version === 2
    && value.kind === "p3-clean-room-evidence"
    && (value.condition === "baseline" || value.condition === "current")
    && value.conditionAuthorization && typeof value.conditionAuthorization === "object"
    && value.ownerDecisionJ && typeof value.ownerDecisionJ === "object") {
    return "clean-room-evidence";
  }
  if (p3ContractVersionArtifact(value.version)
    && typeof value._schemaRequirements === "string"
    && value._preparation && typeof value._preparation === "object"
    && value._lifecycle && typeof value._lifecycle === "object"
    && value._currentVariant && typeof value._currentVariant === "object"
    && shared && typeof shared === "object" && !Array.isArray(shared)
    && shared.cleanRoomAuthorization && typeof shared.cleanRoomAuthorization === "object"
    && shared.ownerDecisionJ && typeof shared.ownerDecisionJ === "object") {
    return "template";
  }
  if (value.version === 2
    && (value.status === "draft" || value.status === "approved")
    && typeof value.ownerApproved === "boolean"
    && typeof value.approvedAt === "string"
    && typeof value.basis === "string"
    && typeof value.executionBundleSha256 === "string"
    && Array.isArray(value.artifacts)
    && value.artifacts.length > 0
    && value.artifacts.every((artifact) => artifact && typeof artifact === "object" && !Array.isArray(artifact)
      && typeof artifact.key === "string" && typeof artifact.path === "string" && typeof artifact.sha256 === "string")) {
    return "evaluator-record";
  }
  if (value.version === 1
    && typeof value.input === "string"
    && typeof value.evaluatorRootsSha256 === "string"
    && typeof value.executionBundleSha256 === "string"
    && Array.isArray(value.executionBundle)
    && value.baselineRecordTemplate && typeof value.baselineRecordTemplate === "object"
    && !Array.isArray(value.baselineRecordTemplate)
    && typeof value.baselineRecordTemplate.executionBundleSha256 === "string"
    && Array.isArray(value.baselineRecordTemplate.artifacts)) {
    return "evaluator-record";
  }
  return null;
}

function assertNoRestrictedPayload(bytes, restrictedFingerprints, attachmentPath) {
  const actualSha256 = sha256Bytes(bytes);
  const sourceFingerprint = restrictedFingerprints.find((entry) => entry.sha256 === actualSha256);
  if (sourceFingerprint) {
    fail(`Role packet contains a restricted P-3 artifact in attachment payload (${attachmentPath}): ${sourceFingerprint.id} source fingerprint.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return "not-json";
  }
  const semanticId = restrictedJsonArtifactId(parsed);
  if (semanticId) {
    fail(`Role packet contains a restricted P-3 artifact in attachment payload (${attachmentPath}): ${semanticId} JSON source class.`);
  }
  return "clear";
}

function inspectJsonPayload(bytes, identities, attachmentPath) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "not-json";
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "not-json";
  }
  const pending = [{ value: parsed, location: "$" }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current.value === "string") {
      assertNoForbiddenIdentity(current.value, identities, `JSON attachment payload (${attachmentPath}) at ${current.location}`);
    } else if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: current.value[index], location: `${current.location}[${index}]` });
      }
    } else if (current.value && typeof current.value === "object") {
      for (const [key, child] of Object.entries(current.value)) {
        assertNoForbiddenIdentity(key, identities, `JSON attachment payload (${attachmentPath}) object key at ${current.location}`);
        pending.push({ value: child, location: `${current.location}.${key}` });
      }
    }
  }
  return "clear";
}

function assertPacketDirectory(packetRoot) {
  if (!existsSync(packetRoot)) fail(`packetRoot does not exist: ${packetRoot}`);
  const info = lstatSync(packetRoot);
  if (info.isSymbolicLink() || !info.isDirectory()) fail("packetRoot must be a real directory, not a symlink or special file.");
}

function listPacketFiles(packetRoot, identities) {
  const files = [];
  function walk(directory, prefix) {
    if (isBareGitDirectory(directory)) {
      fail(`packetRoot contains a prohibited role-input path in ${prefix || "."}: git-metadata.`);
    }
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "variant" }));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = resolve(directory, entry.name);
      const info = lstatSync(absolutePath);
      if (info.isSymbolicLink()) fail(`packetRoot contains a forbidden symlink: ${relativePath}`);
      if (info.isDirectory()) {
        assertNoForbiddenIdentity(relativePath, identities, "a packet directory path");
        assertNoRoleInputExcludedPath(relativePath, "a packet directory path");
        assertNoRestrictedArtifact(relativePath, "a packet directory path");
        assertNotArchiveAttachment(relativePath, "a packet directory path");
        walk(absolutePath, relativePath);
        continue;
      }
      if (!info.isFile()) fail(`packetRoot contains a non-regular file: ${relativePath}`);
      assertNoForbiddenIdentity(relativePath, identities, "an attachment path");
      assertNoRoleInputExcludedPath(relativePath, "an attachment path");
      assertNoRestrictedArtifact(relativePath, "an attachment path");
      assertNotArchiveAttachment(relativePath, "an attachment path");
      files.push({ relativePath, absolutePath });
    }
  }
  walk(packetRoot, "");
  return files;
}

function validateForbiddenArtifacts(value) {
  const entries = array(value, "forbiddenArtifacts");
  if (entries.length !== REQUIRED_FORBIDDEN_ARTIFACTS.length) {
    fail(`forbiddenArtifacts must contain exactly these IDs: ${REQUIRED_FORBIDDEN_ARTIFACTS.map((entry) => entry.id).join(", ")}.`);
  }
  const metadata = new Map();
  for (const candidate of entries) {
    const entry = object(candidate, "forbiddenArtifacts entry");
    exactKeys(entry, new Set(["id", "description"]), "forbiddenArtifacts entry");
    const id = requiredString(entry.id, "forbiddenArtifacts[].id");
    const description = requiredString(entry.description, `forbiddenArtifacts[${id}].description`);
    if (!REQUIRED_FORBIDDEN_ARTIFACT_IDS.has(id)) fail(`forbiddenArtifacts contains an unsupported ID: ${id}.`);
    if (metadata.has(id)) fail(`forbiddenArtifacts contains duplicate ID: ${id}.`);
    metadata.set(id, { id, description });
  }
  for (const artifact of REQUIRED_FORBIDDEN_ARTIFACTS) {
    if (!metadata.has(artifact.id)) fail(`forbiddenArtifacts is missing required ID: ${artifact.id}.`);
  }
  return REQUIRED_FORBIDDEN_ARTIFACTS.map((artifact) => metadata.get(artifact.id));
}

function authorityContext(value, label) {
  const entry = object(value, label);
  exactKeys(entry, new Set(["actor", "contextId"]), label);
  return {
    actor: requiredString(entry.actor, `${label}.actor`),
    contextId: requiredString(entry.contextId, `${label}.contextId`),
  };
}

function authorityCondition(value, label) {
  const entry = object(value, label);
  exactKeys(entry, new Set([
    "condition",
    "evidencePath",
    "workspaceId",
    "worktreeRoot",
    "implementation",
    "review",
    "otherWorkspaceId",
    "isolationMechanism",
    "otherConditionArtifactsAccessible",
    "prohibitedArtifacts",
  ]), label);
  const condition = requiredString(entry.condition, `${label}.condition`);
  if (condition !== "baseline" && condition !== "current") fail(`${label}.condition must be baseline or current.`);
  const evidencePath = repositoryRelativePath(entry.evidencePath, `${label}.evidencePath`);
  const workspaceId = requiredString(entry.workspaceId, `${label}.workspaceId`);
  const declaredWorktreeRoot = requiredString(entry.worktreeRoot, `${label}.worktreeRoot`);
  if (!isAbsolute(declaredWorktreeRoot) && !win32.isAbsolute(declaredWorktreeRoot)) fail(`${label}.worktreeRoot must be an absolute path.`);
  // Match fidelity-benchmark.mjs cleanRoomWorktree(): Decision J stores the
  // stable hash of this canonical absolute form, not its incidental slash or
  // case spelling in the source JSON.
  const worktreeRoot = canonicalFsPath(declaredWorktreeRoot);
  const implementation = authorityContext(entry.implementation, `${label}.implementation`);
  const review = authorityContext(entry.review, `${label}.review`);
  const otherWorkspaceId = requiredString(entry.otherWorkspaceId, `${label}.otherWorkspaceId`);
  requiredString(entry.isolationMechanism, `${label}.isolationMechanism`);
  if (entry.otherConditionArtifactsAccessible !== false) fail(`${label}.otherConditionArtifactsAccessible must be false.`);
  const prohibitedArtifacts = array(entry.prohibitedArtifacts, `${label}.prohibitedArtifacts`)
    .map((candidate, index) => requiredString(candidate, `${label}.prohibitedArtifacts[${index}]`));
  if (prohibitedArtifacts.length !== CLEAN_ROOM_PROHIBITED_ARTIFACTS.length
    || prohibitedArtifacts.some((candidate, index) => candidate !== CLEAN_ROOM_PROHIBITED_ARTIFACTS[index])) {
    fail(`${label}.prohibitedArtifacts must match the P-3 clean-room prohibited artifact list.`);
  }
  if (implementation.actor === review.actor && implementation.contextId === review.contextId) {
    fail(`${label}.implementation and review must differ by actor or contextId.`);
  }
  return {
    condition,
    evidencePath,
    workspaceId,
    worktreeRoot,
    implementation,
    review,
    otherWorkspaceId,
    isolationMechanism: entry.isolationMechanism,
    otherConditionArtifactsAccessible: false,
    prohibitedArtifacts,
  };
}

function authorityPathKey(value) {
  return asciiFold(posix.normalize(value.replace(/\\/g, "/")));
}

function cleanRoomAuthorization(value, pairId, label) {
  const authorization = object(value, label);
  exactKeys(authorization, new Set(["version", "pairId", "conditions"]), label);
  if (authorization.version !== 1) fail(`${label}.version must be 1.`);
  if (requiredString(authorization.pairId, `${label}.pairId`) !== pairId) fail(`${label}.pairId must bind the comparison pairId.`);
  const conditions = array(authorization.conditions, `${label}.conditions`)
    .map((entry, index) => authorityCondition(entry, `${label}.conditions[${index}]`));
  if (conditions.length !== 2 || conditions.map((entry) => entry.condition).join(",") !== "baseline,current") {
    fail(`${label}.conditions must contain baseline and current in that order.`);
  }
  const baseline = conditions[0];
  const current = conditions[1];
  if (baseline.workspaceId === current.workspaceId || authorityPathKey(baseline.worktreeRoot) === authorityPathKey(current.worktreeRoot)) {
    fail(`${label} must use separate baseline/current workspaceId and worktreeRoot values.`);
  }
  if (baseline.otherWorkspaceId !== current.workspaceId || current.otherWorkspaceId !== baseline.workspaceId) {
    fail(`${label} otherWorkspaceId values must be mutually reciprocal.`);
  }
  if (authorityPathKey(baseline.evidencePath) === authorityPathKey(current.evidencePath)) {
    fail(`${label} must use separate baseline/current evidencePath values.`);
  }
  const contextIds = [baseline.implementation.contextId, baseline.review.contextId, current.implementation.contextId, current.review.contextId];
  if (new Set(contextIds).size !== contextIds.length) fail(`${label} must use four distinct implementation/review contextId values.`);
  return { version: 1, pairId, conditions: [baseline, current] };
}

function contractRepositoryRoot(contractAbsolutePath, declaredDecisionPath, decisionAbsolutePath) {
  const candidates = [];
  let candidate = dirname(contractAbsolutePath);
  while (true) {
    if (sameFsPath(resolve(candidate, declaredDecisionPath), decisionAbsolutePath)) candidates.push(candidate);
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  if (candidates.length !== 1) {
    fail("Comparison contract ownerDecisionJ.path must resolve from one unambiguous comparison repository root to the supplied ownerDecisionJ.path.");
  }
  return candidates[0];
}

function validateIdentityAuthority(value, planDirectory, packetRoot, planPath) {
  const input = object(value, "identityAuthority");
  exactKeys(input, new Set(["comparisonContract", "ownerDecisionJ", "recipientCondition"]), "identityAuthority");
  const recipientCondition = requiredString(input.recipientCondition, "identityAuthority.recipientCondition");
  if (recipientCondition !== "baseline" && recipientCondition !== "current") {
    fail("identityAuthority.recipientCondition must be baseline or current.");
  }
  const comparisonContract = coordinatorFileReference(input.comparisonContract, "identityAuthority.comparisonContract", planDirectory, packetRoot, planPath);
  const ownerDecisionJ = coordinatorFileReference(input.ownerDecisionJ, "identityAuthority.ownerDecisionJ", planDirectory, packetRoot, planPath);

  const contract = object(comparisonContract.json, "Comparison contract");
  if (contract.version !== P3_CONTRACT_VERSION) fail("identityAuthority.comparisonContract must reference the current version 13 comparison contract; version 12 and every earlier contract are rejected without migration.");
  const pairId = requiredString(contract.pairId, "Comparison contract.pairId");
  const condition = requiredString(contract.condition, "Comparison contract.condition");
  if (condition !== "baseline" && condition !== "current") fail("Comparison contract.condition must be baseline or current.");
  if (condition !== recipientCondition) fail("identityAuthority.recipientCondition must match Comparison contract.condition.");
  const shared = object(contract.shared, "Comparison contract.shared");
  const authorization = cleanRoomAuthorization(shared.cleanRoomAuthorization, pairId, "Comparison contract shared.cleanRoomAuthorization");
  const contractDecisionReference = object(shared.ownerDecisionJ, "Comparison contract shared.ownerDecisionJ");
  exactKeys(contractDecisionReference, new Set(["path", "sha256"]), "Comparison contract shared.ownerDecisionJ");
  const contractDecisionPath = repositoryRelativePath(contractDecisionReference.path, "Comparison contract shared.ownerDecisionJ.path");
  const contractDecisionSha256 = digest(contractDecisionReference.sha256, "Comparison contract shared.ownerDecisionJ.sha256");
  if (contractDecisionSha256 !== ownerDecisionJ.sha256) {
    fail("identityAuthority.ownerDecisionJ SHA-256 must exactly match Comparison contract shared.ownerDecisionJ.sha256.");
  }
  contractRepositoryRoot(comparisonContract.absolutePath, contractDecisionPath, ownerDecisionJ.absolutePath);

  const decision = object(ownerDecisionJ.json, "Owner Decision J record");
  if (decision.version !== 2 || decision.decisionId !== "J" || decision.status !== "approved" || decision.ownerApproved !== true) {
    fail("identityAuthority.ownerDecisionJ must reference an owner-approved Decision J version 2 record.");
  }
  if (requiredString(decision.pairId, "Owner Decision J record.pairId") !== pairId) {
    fail("Owner Decision J record.pairId must match Comparison contract.pairId.");
  }
  const approvedAuthorization = cleanRoomAuthorization(decision.cleanRoomAuthorization, pairId, "Owner Decision J record.cleanRoomAuthorization");
  const authorizationStableJsonSha256 = stableJsonSha256(authorization);
  if (stableJsonSha256(approvedAuthorization) !== authorizationStableJsonSha256) {
    fail("Owner Decision J record cleanRoomAuthorization differs from Comparison contract shared.cleanRoomAuthorization.");
  }
  if (digest(decision.cleanRoomAuthorizationStableJsonSha256, "Owner Decision J record.cleanRoomAuthorizationStableJsonSha256") !== authorizationStableJsonSha256) {
    fail("Owner Decision J record cleanRoomAuthorizationStableJsonSha256 differs from the bound comparison authorization.");
  }

  const peer = recipientCondition === "baseline" ? authorization.conditions[1] : authorization.conditions[0];
  const identities = [
    derivedIdentity("workspaceId", peer.workspaceId),
    derivedIdentity("worktreeRoot", peer.worktreeRoot, { pathLike: true }),
    derivedIdentity("implementation.actor", peer.implementation.actor),
    derivedIdentity("implementation.contextId", peer.implementation.contextId),
    derivedIdentity("review.actor", peer.review.actor),
    derivedIdentity("review.contextId", peer.review.contextId),
    derivedIdentity("evidencePath", peer.evidencePath, { pathLike: true }),
    derivedIdentity("otherWorkspaceId", peer.otherWorkspaceId),
  ];
  return {
    comparisonContract,
    ownerDecisionJ,
    recipientCondition,
    pairId,
    peerCondition: peer.condition,
    authorizationStableJsonSha256,
    identities,
    conditions: authorization.conditions,
    restrictedFingerprints: [
      { id: "comparison-contract", sha256: comparisonContract.sha256 },
      { id: "decision-j", sha256: ownerDecisionJ.sha256 },
    ],
  };
}

function validateAttachment(candidate, index, identities) {
  const entry = object(candidate, `roleAttachments[${index}]`);
  exactKeys(entry, new Set(["logicalPath", "path", "sha256", "origin"]), `roleAttachments[${index}]`);
  const logicalPath = packetRelativePath(entry.logicalPath, `roleAttachments[${index}].logicalPath`);
  const path = packetRelativePath(entry.path, `roleAttachments[${index}].path`);
  const sha256 = digest(entry.sha256, `roleAttachments[${index}].sha256`);
  const origin = requiredString(entry.origin, `roleAttachments[${index}].origin`);
  assertNoForbiddenIdentity(logicalPath, identities, "an attachment logicalPath");
  assertNoForbiddenIdentity(path, identities, "an attachment path");
  assertNoRoleInputExcludedPath(logicalPath, "an attachment logicalPath");
  assertNoRoleInputExcludedPath(path, "an attachment path");
  assertNoRestrictedArtifact(logicalPath, "an attachment logicalPath");
  assertNoRestrictedArtifact(path, "an attachment path");
  assertNotArchiveAttachment(logicalPath, "an attachment logicalPath");
  assertNotArchiveAttachment(path, "an attachment path");
  return { logicalPath, path, sha256, origin };
}

export function checkRolePacket(planPathValue) {
  const planPath = resolve(process.cwd(), requiredString(planPathValue, "plan path"));
  const plan = object(readJson(planPath, "Coordinator-only role packet plan"), "Coordinator-only role packet plan");
  exactKeys(plan, new Set(["version", "kind", "packetRoot", "roleAttachments", "identityAuthority", "forbiddenArtifacts"]), "Coordinator-only role packet plan");
  if (plan.version !== 3) fail("Coordinator-only role packet plan.version must be 3.");
  if (plan.kind !== "p3-role-packet-plan") fail("Coordinator-only role packet plan.kind must be p3-role-packet-plan.");
  const packetRootPath = packetRelativePath(plan.packetRoot, "packetRoot");
  const planDirectory = dirname(planPath);
  const packetRoot = resolve(planDirectory, packetRootPath);
  assertWithin(planDirectory, packetRoot, "packetRoot");
  if (isWithin(packetRoot, planPath)) fail("Coordinator-only role packet plan must not be stored inside packetRoot.");
  assertPacketDirectory(packetRoot);

  const forbiddenArtifacts = validateForbiddenArtifacts(plan.forbiddenArtifacts);
  const identityAuthority = validateIdentityAuthority(plan.identityAuthority, planDirectory, packetRoot, planPath);
  assertPacketRootOutsideActualWorktrees(packetRoot, identityAuthority.conditions);
  const identities = identityAuthority.identities;
  const attachmentsInput = array(plan.roleAttachments, "roleAttachments");
  if (attachmentsInput.length === 0) fail("roleAttachments must contain at least one attachment.");

  const attachments = attachmentsInput.map((entry, index) => validateAttachment(entry, index, identities));
  const logicalPaths = new Set();
  const paths = new Set();
  for (const attachment of attachments) {
    const logicalKey = asciiFold(attachment.logicalPath);
    const pathKey = asciiFold(attachment.path);
    if (logicalPaths.has(logicalKey)) fail(`roleAttachments contains duplicate logicalPath: ${attachment.logicalPath}.`);
    if (paths.has(pathKey)) fail(`roleAttachments contains duplicate path: ${attachment.path}.`);
    logicalPaths.add(logicalKey);
    paths.add(pathKey);
  }

  const discoveredFiles = listPacketFiles(packetRoot, identities);
  const discoveredByPath = new Map(discoveredFiles.map((entry) => [entry.relativePath, entry]));
  for (const attachment of attachments) {
    if (!discoveredByPath.has(attachment.path)) fail(`roleAttachments references a missing packet file: ${attachment.path}.`);
  }
  const declaredPaths = new Set(attachments.map((entry) => entry.path));
  for (const file of discoveredFiles) {
    if (!declaredPaths.has(file.relativePath)) fail(`packetRoot file is not declared in roleAttachments: ${file.relativePath}.`);
  }

  const manifestAttachments = attachments.map((attachment) => {
    const file = discoveredByPath.get(attachment.path);
    const bytes = readFileSync(file.absolutePath);
    const actualSha256 = sha256Bytes(bytes);
    if (actualSha256 !== attachment.sha256) fail(`Attachment SHA-256 mismatch: ${attachment.path}.`);
    const restrictedJsonPayload = assertNoRestrictedPayload(bytes, identityAuthority.restrictedFingerprints, attachment.path);
    assertNoForbiddenIdentityBytes(bytes, identities, `attachment payload (${attachment.path})`);
    const jsonPayload = inspectJsonPayload(bytes, identities, attachment.path);
    return {
      logicalPath: attachment.logicalPath,
      path: attachment.path,
      sha256: actualSha256,
      origin: attachment.origin,
      scan: {
        restrictedArtifact: {
          path: "clear",
          sourceFingerprints: "clear",
          jsonSourceClass: restrictedJsonPayload,
        },
        forbiddenIdentity: {
          logicalPath: "clear",
          path: "clear",
          payload: "clear",
          rawBytes: "clear",
          jsonPayload,
        },
        payloadScan: "authority-fingerprints-strict-json-source-class-raw-bytes-and-recursive-json-identities",
      },
    };
  });

  return {
    version: 3,
    kind: "p3-role-packet-manifest",
    coordinatorOnly: true,
    planSha256: sha256File(planPath),
    identityAuthority: {
      comparisonContract: { path: identityAuthority.comparisonContract.path, sha256: identityAuthority.comparisonContract.sha256 },
      ownerDecisionJ: { path: identityAuthority.ownerDecisionJ.path, sha256: identityAuthority.ownerDecisionJ.sha256 },
      pairId: identityAuthority.pairId,
      recipientCondition: identityAuthority.recipientCondition,
      peerCondition: identityAuthority.peerCondition,
      cleanRoomAuthorizationStableJsonSha256: identityAuthority.authorizationStableJsonSha256,
      derivedPeerIdentityFields: [...DERIVED_PEER_IDENTITY_FIELDS],
    },
    packetRoot: packetRootPath,
    attachmentCount: manifestAttachments.length,
    roleAttachments: manifestAttachments,
    forbiddenArtifacts,
    roleInputPathExclusions: ROLE_INPUT_PATH_EXCLUSIONS.map(({ id, description }) => ({ id, description })),
    scan: {
      authorityBinding: "comparison-contract-and-owner-decision-j-clear",
      derivedPeerIdentity: "clear",
      roleInputPathExclusions: "clear",
      attachmentCompleteness: "clear",
      duplicateAttachments: "clear",
      checksums: "clear",
    },
  };
}

function byteRangeIsZero(bytes, start, length) {
  for (let index = start; index < start + length; index += 1) {
    if (bytes[index] !== 0) return false;
  }
  return true;
}

function ustarText(header, start, length, label) {
  const end = start + length;
  let terminator = end;
  for (let index = start; index < end; index += 1) {
    const byte = header[index];
    if (byte === 0) {
      terminator = index;
      break;
    }
    if (byte < 0x20 || byte > 0x7e) fail(`${label} must use printable ASCII characters only.`);
  }
  for (let index = terminator; index < end; index += 1) {
    if (header[index] !== 0) fail(`${label} must use NUL padding only.`);
  }
  return header.subarray(start, terminator).toString("ascii");
}

function ustarOctal(header, start, length, label) {
  const end = start + length;
  let value = 0;
  let sawDigit = false;
  let padding = false;
  for (let index = start; index < end; index += 1) {
    const byte = header[index];
    if (byte === 0 || byte === 0x20) {
      padding = true;
      continue;
    }
    if (padding || byte < 0x30 || byte > 0x37) fail(`${label} must be a NUL/space-padded octal field.`);
    sawDigit = true;
    value = (value * 8) + (byte - 0x30);
    if (!Number.isSafeInteger(value)) fail(`${label} exceeds safe integer range.`);
  }
  if (!sawDigit) return 0;
  return value;
}

function verifyUstarChecksum(header) {
  const expected = ustarOctal(header, 148, 8, "USTAR header checksum");
  let actual = 0;
  for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (expected !== actual) fail("USTAR header checksum does not match.");
}

function ustarRelativePath(value, label) {
  if (value.length === 0) fail(`${label} must not be empty.`);
  if (!/^[\x20-\x7e]+$/.test(value)) fail(`${label} must use printable ASCII characters only.`);
  const path = packetRelativePath(value, label);
  for (const segment of path.split("/")) {
    if (segment.includes(":")) fail(`${label} must not contain ':'.`);
    if (segment.endsWith(".") || segment.endsWith(" ")) fail(`${label} has an NTFS-ambiguous path segment.`);
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(segment)) fail(`${label} has an NTFS-reserved path segment.`);
  }
  return path;
}

function ustarEntryPath(header, type) {
  const name = ustarText(header, 0, 100, "USTAR entry name");
  const prefix = ustarText(header, 345, 155, "USTAR entry prefix");
  let path = prefix === "" ? name : `${prefix}/${name}`;
  if (type === "directory" && path.endsWith("/")) path = path.slice(0, -1);
  if (type === "regular" && path.endsWith("/")) fail("USTAR regular-file entry path must not end with '/'.");
  return ustarRelativePath(path, "USTAR entry path");
}

function parsePlainUstarArchive(bytes) {
  if (bytes.length < TAR_BLOCK_SIZE * 2 || bytes.length % TAR_BLOCK_SIZE !== 0) {
    fail("USTAR archive must contain complete 512-byte blocks and two terminal zero blocks.");
  }
  const entries = [];
  const caseFoldedPaths = new Map();
  let offset = 0;
  let terminated = false;
  while (offset < bytes.length) {
    const header = bytes.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (byteRangeIsZero(header, 0, TAR_BLOCK_SIZE)) {
      if (offset + TAR_BLOCK_SIZE >= bytes.length || !byteRangeIsZero(bytes, offset + TAR_BLOCK_SIZE, TAR_BLOCK_SIZE)) {
        fail("USTAR archive must end with two consecutive zero blocks.");
      }
      if (!byteRangeIsZero(bytes, offset, bytes.length - offset)) fail("USTAR archive has non-zero data after its terminal zero blocks.");
      terminated = true;
      break;
    }
    if (offset + TAR_BLOCK_SIZE > bytes.length) fail("USTAR archive header is truncated.");
    if (header.subarray(257, 263).toString("ascii") !== "ustar\0" || header.subarray(263, 265).toString("ascii") !== "00") {
      fail("Role packet expansion accepts only plain USTAR archives (no GNU, PAX, ZIP, or compressed formats).");
    }
    verifyUstarChecksum(header);
    const typeByte = header[156];
    const type = typeByte === 0 || typeByte === 0x30 ? "regular" : typeByte === 0x35 ? "directory" : null;
    if (type === null) fail("USTAR archive permits only regular-file and directory entries; links, PAX/GNU extensions, and special files are rejected.");
    if (!byteRangeIsZero(header, 157, 100)) fail("USTAR linkname must be empty; links are rejected.");
    const size = ustarOctal(header, 124, 12, "USTAR entry size");
    if (size > MAX_USTAR_ENTRY_BYTES) fail(`USTAR entry exceeds ${MAX_USTAR_ENTRY_BYTES} bytes.`);
    if (type === "directory" && size !== 0) fail("USTAR directory entries must have zero payload bytes.");
    const path = ustarEntryPath(header, type);
    assertNoRoleInputExcludedPath(path, "a USTAR entry path");
    assertNoRestrictedArtifact(path, "a USTAR entry path");
    assertNotArchiveAttachment(path, "a USTAR entry path");
    const key = asciiFold(path);
    if (caseFoldedPaths.has(key)) fail(`USTAR archive has duplicate or case-colliding entry path: ${path}.`);
    caseFoldedPaths.set(key, { path, type });
    const dataStart = offset + TAR_BLOCK_SIZE;
    const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    const nextOffset = dataStart + paddedSize;
    if (nextOffset > bytes.length) fail(`USTAR entry payload is truncated: ${path}.`);
    if (!byteRangeIsZero(bytes, dataStart + size, paddedSize - size)) fail(`USTAR entry padding must be zero-filled: ${path}.`);
    entries.push({ path, type, bytes: bytes.subarray(dataStart, dataStart + size) });
    if (entries.length > MAX_USTAR_ENTRY_COUNT) fail(`USTAR archive exceeds ${MAX_USTAR_ENTRY_COUNT} entries.`);
    offset = nextOffset;
  }
  if (!terminated) fail("USTAR archive is missing its terminal zero blocks.");
  for (const entry of entries) {
    const segments = entry.path.split("/");
    for (let length = 1; length < segments.length; length += 1) {
      const parent = segments.slice(0, length).join("/");
      const existing = caseFoldedPaths.get(asciiFold(parent));
      if (existing && existing.type !== "directory") {
        fail(`USTAR archive places an entry below a regular file: ${existing.path}.`);
      }
    }
    if (entry.type !== "directory") {
      const descendantPrefix = `${asciiFold(entry.path)}/`;
      if ([...caseFoldedPaths.keys()].some((key) => key.startsWith(descendantPrefix))) {
        fail(`USTAR archive uses one path as both a regular file and a directory: ${entry.path}.`);
      }
    }
  }
  return entries;
}

export function expandPlainUstarRolePacket(archivePathValue, destinationPathValue) {
  const archivePath = resolve(process.cwd(), requiredString(archivePathValue, "USTAR archive path"));
  if (!existsSync(archivePath)) fail(`USTAR archive does not exist: ${archivePath}`);
  const archiveInfo = lstatSync(archivePath);
  if (archiveInfo.isSymbolicLink() || !archiveInfo.isFile()) fail("USTAR archive must be a real regular file, not a symlink or special file.");
  if (archiveInfo.size > MAX_USTAR_ARCHIVE_BYTES) fail(`USTAR archive exceeds ${MAX_USTAR_ARCHIVE_BYTES} bytes.`);
  const archive = readFileSync(archivePath);
  const entries = parsePlainUstarArchive(archive);

  const destination = resolve(process.cwd(), requiredString(destinationPathValue, "USTAR expansion destination"));
  if (existsSync(destination)) fail("USTAR expansion destination must not already exist.");
  const parent = dirname(destination);
  if (!existsSync(parent)) fail("USTAR expansion destination parent must already exist.");
  const parentInfo = lstatSync(parent);
  if (parentInfo.isSymbolicLink() || !parentInfo.isDirectory()) fail("USTAR expansion destination parent must be a real directory, not a symlink or special file.");

  let created = false;
  try {
    mkdirSync(destination);
    created = true;
    for (const entry of entries.filter((candidate) => candidate.type === "directory").sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "variant" }))) {
      const directory = join(destination, entry.path);
      mkdirSync(directory, { recursive: true });
      const info = lstatSync(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) fail(`USTAR expansion created an invalid directory: ${entry.path}.`);
    }
    for (const entry of entries.filter((candidate) => candidate.type === "regular").sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "variant" }))) {
      const target = join(destination, entry.path);
      const parentDirectory = dirname(target);
      mkdirSync(parentDirectory, { recursive: true });
      const parentInfoAfterCreate = lstatSync(parentDirectory);
      if (parentInfoAfterCreate.isSymbolicLink() || !parentInfoAfterCreate.isDirectory()) fail(`USTAR expansion encountered an invalid parent directory for ${entry.path}.`);
      writeFileSync(target, entry.bytes, { flag: "wx", mode: 0o600 });
      const info = lstatSync(target);
      if (info.isSymbolicLink() || !info.isFile()) fail(`USTAR expansion created an invalid regular file: ${entry.path}.`);
    }
  } catch (error) {
    if (created) rmSync(destination, { recursive: true, force: true });
    throw error;
  }

  const regularEntries = entries
    .filter((entry) => entry.type === "regular")
    .sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "variant" }));
  return {
    version: 1,
    kind: "p3-role-packet-ustar-expansion-manifest",
    coordinatorOnly: true,
    archiveSha256: sha256Bytes(archive),
    archiveBytes: archive.length,
    destination,
    entryCount: entries.length,
    regularFileCount: regularEntries.length,
    entries: regularEntries.map((entry) => ({ path: entry.path, sha256: sha256Bytes(entry.bytes), bytes: entry.bytes.length })),
    scan: {
      format: "plain-ustar-v1",
      traversal: "clear",
      linksAndSpecialFiles: "clear",
      paxAndGnuExtensions: "clear",
      duplicateAndCaseCollidingPaths: "clear",
      roleInputPathExclusions: "clear",
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  try {
    if (args.length === 2 && args[0] === "--check") {
      process.stdout.write(`${JSON.stringify(checkRolePacket(args[1]), null, 2)}\n`);
      return;
    }
    if (args.length === 3 && args[0] === "--expand-ustar") {
      process.stdout.write(`${JSON.stringify(expandPlainUstarRolePacket(args[1], args[2]), null, 2)}\n`);
      return;
    }
    fail("Usage: node p3-role-packet.mjs --check <coordinator-only-plan.json> | --expand-ustar <plain-ustar.tar> <new-inspection-directory>. Archive attachments (.tar, .tgz, .tar.gz, .zip, .7z, .rar) are rejected by --check; --expand-ustar accepts only a verified plain USTAR archive.");
  } catch (error) {
    console.error(`P3 ROLE PACKET: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
