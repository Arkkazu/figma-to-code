#!/usr/bin/env node
// p3-clean-room-probe.mjs — coordinator-only P-3 clean-room evidence helper.
//
// v5 has two deliberately separate views:
//   * a disposable role probe reads only its own opaque plan/inventory/config
//     and the P-7 challenge; it never reads a contract, Decision J, matrix
//     plan, bootstrap output, or coordinator authority;
//   * the coordinator-only evidence validator reads those authorities and
//     verifies the role output after the fact.  A role-side PASS therefore
//     does not by itself become a clean-room claim.
//
// This helper is outside the P-3 runtime contract.  It does not import a
// P-3 evaluator and must not be used as a replacement for owner approval.

import { createHash, randomBytes } from "node:crypto";
import { open, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = 5;
const P3_CONTRACT_VERSION = 13;
const PLAN_KIND = "p3-clean-room-probe-plan-v5";
const INVENTORY_KIND = "p3-clean-room-role-probe-inventory-v5";
const AUTHORITY_KIND = "p3-clean-room-probe-coordinator-authority-v1";
const RUNTIME_CONFIG_KIND = "p3-clean-room-role-runtime-config-v3";
const MATRIX_PLAN_KIND = "p3-clean-room-peer-sentinel-matrix-plan-v3";
const CHALLENGE_KIND = "p3-clean-room-peer-sentinel-challenge-v3";
const EVIDENCE_PLAN_KIND = "p3-clean-room-probe-evidence-plan-v5";
const PHASES = new Set(["before", "after"]);
const STAGES = new Set(["bootstrap", "full"]);
const CONDITIONS = new Set(["baseline", "current"]);
const ROLE_KINDS = new Set(["implementation", "review"]);
const ACCESS_DENIED_CODES = new Set(["EACCES", "EPERM"]);
const PROHIBITED_ARTIFACTS = ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"];
const P10_SPECS = [
  // These are individual stores rather than a generic agent-home directory.
  // A generic directory probe can pass while a historical/context store remains
  // reachable through a sibling file.
  { key: "historyJsonl", id: "P-10-history-jsonl", kind: "file", codexPath: [".codex", "history.jsonl"] },
  { key: "sessions", id: "P-10-sessions", kind: "directory", codexPath: [".codex", "sessions"] },
  { key: "archivedSessions", id: "P-10-archived-sessions", kind: "directory", codexPath: [".codex", "archived_sessions"] },
  { key: "memoriesDirectory", id: "P-10-memories-directory", kind: "directory", codexPath: [".codex", "memories"] },
  { key: "memoriesSqlite", id: "P-10-memories-1-sqlite", kind: "file", codexPath: [".codex", "memories_1.sqlite"] },
  { key: "logsSqlite", id: "P-10-logs-2-sqlite", kind: "file", codexPath: [".codex", "logs_2.sqlite"] },
  { key: "stateSqlite", id: "P-10-state-5-sqlite", kind: "file", codexPath: [".codex", "state_5.sqlite"] },
  { key: "rules", id: "P-10-rules", kind: "directory", codexPath: [".codex", "rules"] },
  { key: "skills", id: "P-10-skills", kind: "directory", codexPath: [".codex", "skills"] },
];
const P10_CLAUDE_PROJECTS_SPEC = { key: "claudeProjectsJsonl", id: "P-10-claude-projects-jsonl", kind: "file", claudeProjectsJsonl: true };
const P12_SPECS = [
  { id: "own-worktree", rootKind: "own-worktree" },
  { id: "other-worktree", rootKind: "other-worktree" },
  { id: "peer-staging-1", rootKind: "peer-staging" },
  { id: "peer-staging-2", rootKind: "peer-staging" },
  { id: "peer-staging-3", rootKind: "peer-staging" },
  { id: "common-git", rootKind: "common-git" },
  { id: "coordinator-scratch", rootKind: "coordinator-scratch" },
];
const OPAQUE_SENTINEL_IDS = new Set(["P-7-peer-sentinel-1", "P-7-peer-sentinel-2", "P-7-peer-sentinel-3"]);
const SELF_PATH = fileURLToPath(import.meta.url);

class ProbeError extends Error {
  constructor(code, { reported = false } = {}) {
    super(code);
    this.code = code;
    this.reported = reported;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function stableHash(value) {
  return sha256(JSON.stringify(stable(value)));
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed, code = "INVALID_PLAN") {
  if (!plainObject(value)) throw new ProbeError(code);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ProbeError(code);
  return value;
}

function nonemptyString(value, code = "INVALID_PLAN") {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new ProbeError(code);
  return value.trim();
}

function identifier(value, code = "INVALID_PLAN") {
  value = nonemptyString(value, code);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(value)) throw new ProbeError(code);
  return value;
}

function opaqueIdentifier(value, prefix, code = "INVALID_PLAN") {
  value = nonemptyString(value, code);
  if (!(new RegExp("^" + prefix + "-[a-f0-9]{32,128}$")).test(value)) throw new ProbeError(code);
  return value;
}

function digest(value, code = "INVALID_PLAN") {
  value = nonemptyString(value, code).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new ProbeError(code);
  return value;
}

function timestamp(value, code = "INVALID_PLAN") {
  value = nonemptyString(value, code);
  if (Number.isNaN(Date.parse(value))) throw new ProbeError(code);
  return value;
}

function absolutePath(value, code = "INVALID_PLAN") {
  value = nonemptyString(value, code);
  if (!isAbsolute(value)) throw new ProbeError(code);
  return resolve(value);
}

function pathKey(pathname) {
  const value = normalize(resolve(pathname)).replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin" ? value.toLowerCase() : value;
}

function samePath(left, right) {
  return pathKey(left) === pathKey(right);
}

function pathIsWithin(directory, pathname, { allowRoot = false } = {}) {
  const relation = relative(resolve(directory), resolve(pathname));
  if (relation === "") return allowRoot;
  return !relation.startsWith("..") && !isAbsolute(relation);
}

function pathsOverlap(left, right) {
  return pathIsWithin(left, right, { allowRoot: true }) || pathIsWithin(right, left, { allowRoot: true });
}

function safeErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "UNKNOWN";
}

function isAccessDenied(error) {
  return ACCESS_DENIED_CODES.has(safeErrorCode(error));
}

function fileRef(value, code = "INVALID_PLAN") {
  exactKeys(value, new Set(["path", "sha256"]), code);
  return { path: absolutePath(value.path, code), sha256: digest(value.sha256, code) };
}

function recordedFile(value, expectedId = null, code = "INVALID_PLAN") {
  exactKeys(value, new Set(["id", "path", "sha256", "exists"]), code);
  const result = { id: nonemptyString(value.id, code), path: absolutePath(value.path, code), sha256: digest(value.sha256, code), exists: value.exists };
  if (result.exists !== true || (expectedId && result.id !== expectedId)) throw new ProbeError(code);
  return result;
}

function recordedDirectory(value, expectedId = null, code = "INVALID_PLAN") {
  exactKeys(value, new Set(["id", "path", "exists"]), code);
  const result = { id: nonemptyString(value.id, code), path: absolutePath(value.path, code), exists: value.exists };
  if (result.exists !== true || (expectedId && result.id !== expectedId)) throw new ProbeError(code);
  return result;
}

function rootDirectory(value, code = "INVALID_PLAN") {
  exactKeys(value, new Set(["path", "exists"]), code);
  const result = { path: absolutePath(value.path, code), exists: value.exists };
  if (result.exists !== true) throw new ProbeError(code);
  return result;
}

function sameRef(left, right) {
  return samePath(left.path, right.path) && left.sha256 === right.sha256;
}

function condition(value, code = "INVALID_PLAN") {
  value = nonemptyString(value, code);
  if (!CONDITIONS.has(value)) throw new ProbeError(code);
  return value;
}

function roleKind(value, code = "INVALID_PLAN") {
  value = nonemptyString(value, code);
  if (!ROLE_KINDS.has(value)) throw new ProbeError(code);
  return value;
}

function roleIdentity(value, code = "INVALID_PLAN") {
  exactKeys(value, new Set(["condition", "roleKind", "actor", "contextId"]), code);
  return {
    condition: condition(value.condition, code),
    roleKind: roleKind(value.roleKind, code),
    actor: nonemptyString(value.actor, code),
    contextId: nonemptyString(value.contextId, code),
  };
}

function sameRole(left, right) {
  return left.condition === right.condition && left.roleKind === right.roleKind && left.actor === right.actor && left.contextId === right.contextId;
}

function recipientCommitment(pairId, role) {
  return stableHash({ pairId, condition: role.condition, roleKind: role.roleKind, actor: role.actor, contextId: role.contextId });
}

function parseCleanRoomAuthorizationUnsafe(raw) {
  exactKeys(raw, new Set(["version", "pairId", "conditions"]));
  if (raw.version !== 1 || !Array.isArray(raw.conditions) || raw.conditions.length !== 2) throw new ProbeError("INVALID_PLAN");
  const conditions = raw.conditions.map((entry) => {
    exactKeys(entry, new Set(["condition", "evidencePath", "workspaceId", "worktreeRoot", "implementation", "review", "otherWorkspaceId", "isolationMechanism", "otherConditionArtifactsAccessible", "prohibitedArtifacts"]));
    const implementation = exactKeys(entry.implementation, new Set(["actor", "contextId"]));
    const review = exactKeys(entry.review, new Set(["actor", "contextId"]));
    if (entry.otherConditionArtifactsAccessible !== false
      || !Array.isArray(entry.prohibitedArtifacts)
      || JSON.stringify(entry.prohibitedArtifacts) !== JSON.stringify(PROHIBITED_ARTIFACTS)) throw new ProbeError("INVALID_PLAN");
    return {
      condition: condition(entry.condition),
      evidencePath: nonemptyString(entry.evidencePath),
      workspaceId: nonemptyString(entry.workspaceId),
      worktreeRoot: absolutePath(entry.worktreeRoot),
      implementation: { actor: nonemptyString(implementation.actor), contextId: nonemptyString(implementation.contextId) },
      review: { actor: nonemptyString(review.actor), contextId: nonemptyString(review.contextId) },
      otherWorkspaceId: nonemptyString(entry.otherWorkspaceId),
      isolationMechanism: nonemptyString(entry.isolationMechanism),
      otherConditionArtifactsAccessible: false,
      prohibitedArtifacts: [...PROHIBITED_ARTIFACTS],
    };
  });
  if (conditions.map((item) => item.condition).sort().join(",") !== "baseline,current") throw new ProbeError("INVALID_PLAN");
  const baseline = conditions.find((item) => item.condition === "baseline");
  const current = conditions.find((item) => item.condition === "current");
  if (!baseline || !current || baseline.workspaceId === current.workspaceId || samePath(baseline.worktreeRoot, current.worktreeRoot)) throw new ProbeError("INVALID_PLAN");
  if (baseline.otherWorkspaceId !== current.workspaceId || current.otherWorkspaceId !== baseline.workspaceId) throw new ProbeError("INVALID_PLAN");
  const contexts = [baseline.implementation.contextId, baseline.review.contextId, current.implementation.contextId, current.review.contextId];
  if (new Set(contexts).size !== 4) throw new ProbeError("INVALID_PLAN");
  return { version: 1, pairId: nonemptyString(raw.pairId), conditions };
}

function parseComparisonContractUnsafe(raw, pathname) {
  if (!plainObject(raw) || !plainObject(raw.shared) || !plainObject(raw.run)) throw new ProbeError("INVALID_PLAN");
  if (raw.version !== P3_CONTRACT_VERSION) {
    if (Number.isInteger(raw.version) && raw.version <= 12) throw new ProbeError("AUTHORITY_CONTRACT_VERSION_V12_OR_EARLIER_REJECTED");
    throw new ProbeError("INVALID_PLAN");
  }
  const authorization = parseCleanRoomAuthorizationUnsafe(raw.shared.cleanRoomAuthorization);
  exactKeys(raw.shared.ownerDecisionJ, new Set(["path", "sha256"]));
  const ownerDecisionJ = {
    path: isAbsolute(raw.shared.ownerDecisionJ.path) ? absolutePath(raw.shared.ownerDecisionJ.path) : resolve(dirname(pathname), nonemptyString(raw.shared.ownerDecisionJ.path)),
    sha256: digest(raw.shared.ownerDecisionJ.sha256),
  };
  const implementation = exactKeys(raw.run.implementation, new Set(["actor", "contextId"]));
  const review = exactKeys(raw.run.review, new Set(["actor", "contextId"]));
  return {
    authorization,
    ownerDecisionJ,
    run: {
      workspaceId: nonemptyString(raw.run.workspaceId),
      implementation: { actor: nonemptyString(implementation.actor), contextId: nonemptyString(implementation.contextId) },
      review: { actor: nonemptyString(review.actor), contextId: nonemptyString(review.contextId) },
    },
  };
}

function parseComparisonContract(raw, pathname) {
  try { return parseComparisonContractUnsafe(raw, pathname); }
  catch (error) {
    if (error instanceof ProbeError && error.code === "AUTHORITY_CONTRACT_VERSION_V12_OR_EARLIER_REJECTED") throw error;
    throw new ProbeError("AUTHORITY_CONTRACT_INVALID");
  }
}

function parseDecisionJUnsafe(raw) {
  if (!plainObject(raw) || raw.version !== 2 || raw.decisionId !== "J") throw new ProbeError("INVALID_PLAN");
  return {
    pairId: nonemptyString(raw.pairId),
    authorization: parseCleanRoomAuthorizationUnsafe(raw.cleanRoomAuthorization),
    authorizationStableJsonSha256: digest(raw.cleanRoomAuthorizationStableJsonSha256),
  };
}

function parseDecisionJ(raw) {
  try { return parseDecisionJUnsafe(raw); }
  catch { throw new ProbeError("AUTHORITY_DECISION_INVALID"); }
}

function p10PathMatchesSpec(pathname, spec) {
  const parts = pathKey(pathname).split("/").filter(Boolean);
  const leaf = parts.at(-1) || "";
  if (spec.codexPath) return spec.codexPath.every((part, index) => parts[parts.length - spec.codexPath.length + index] === part);
  // Claude persists one JSONL per project below .claude/projects.  Requiring
  // both the store path and the .jsonl leaf prevents a different, arbitrary
  // JSONL file from being relabelled as the P-10 conversation source.
  return leaf.endsWith(".jsonl") && parts.some((part, index) => part === ".claude" && parts[index + 1] === "projects");
}

function parseP10Target(value, spec, code) {
  const target = spec.kind === "file"
    ? { ...recordedFile(value, spec.id, code), kind: "file" }
    : { ...recordedDirectory(value, spec.id, code), kind: "directory" };
  if (!p10PathMatchesSpec(target.path, spec)) throw new ProbeError(code);
  return target;
}

function parseP10Targets(value, code = "INVALID_INVENTORY") {
  exactKeys(value, new Set(["targets"]), code);
  if (!plainObject(value.targets)) throw new ProbeError(code);
  const allowedKeys = new Set([...P10_SPECS.map((spec) => spec.key), P10_CLAUDE_PROJECTS_SPEC.key]);
  const keys = Object.keys(value.targets);
  if (keys.some((key) => !allowedKeys.has(key))
    || P10_SPECS.some((spec) => !(spec.key in value.targets))) throw new ProbeError(code);
  const targets = {};
  for (const spec of P10_SPECS) {
    if (!(spec.key in value.targets)) throw new ProbeError(code);
    targets[spec.key] = parseP10Target(value.targets[spec.key], spec, code);
  }
  if (P10_CLAUDE_PROJECTS_SPEC.key in value.targets) {
    targets[P10_CLAUDE_PROJECTS_SPEC.key] = parseP10Target(value.targets[P10_CLAUDE_PROJECTS_SPEC.key], P10_CLAUDE_PROJECTS_SPEC, code);
  }
  return { targets };
}

function p12RecordId(operation, spec) {
  return "P-12-" + operation + "-" + spec.id;
}

function p12RouteCommitment(recipient, target) {
  return stableHash({
    recipientCommitment: recipient,
    id: target.id,
    rootKind: target.rootKind,
    read: { id: target.read.id, path: pathKey(target.read.path), sha256: target.read.sha256 },
    write: { id: target.write.id, path: pathKey(target.write.path), sha256: target.write.sha256 },
  });
}

function p12RoutePath(routeRoot, commitment, operation) {
  return resolve(routeRoot, "p12-" + commitment + "-" + operation + ".sentinel");
}

function parseP12Targets(value, code = "INVALID_INVENTORY") {
  exactKeys(value, new Set(["redactedRouteRoot", "targets"]), code);
  if (!Array.isArray(value.targets) || value.targets.length !== P12_SPECS.length) throw new ProbeError(code);
  const redactedRouteRoot = rootDirectory(value.redactedRouteRoot, code);
  const targets = value.targets.map((entry) => {
    exactKeys(entry, new Set(["id", "rootKind", "routeCommitment", "read", "write"]), code);
    const id = nonemptyString(entry.id, code);
    const spec = P12_SPECS.find((item) => item.id === id);
    if (!spec || nonemptyString(entry.rootKind, code) !== spec.rootKind) throw new ProbeError(code);
    return {
      id,
      rootKind: spec.rootKind,
      routeCommitment: digest(entry.routeCommitment, code),
      read: recordedFile(entry.read, p12RecordId("read", spec), code),
      write: recordedFile(entry.write, p12RecordId("write", spec), code),
    };
  });
  if (new Set(targets.map((item) => item.id)).size !== targets.length) throw new ProbeError(code);
  return { redactedRouteRoot, targets: targets.sort((left, right) => left.id.localeCompare(right.id)) };
}

function parseP7(value, stage, code = "INVALID_INVENTORY") {
  const allowed = stage === "full" ? new Set(["self", "peerSentinelChallenge"]) : new Set(["self"]);
  exactKeys(value, allowed, code);
  exactKeys(value.self, new Set(["id", "coverage", "environmentVariables"]), code);
  const self = {
    id: nonemptyString(value.self.id, code),
    coverage: nonemptyString(value.self.coverage, code),
    environmentVariables: value.self.environmentVariables,
  };
  if (self.id !== "P-7-own-temp-sentinel" || self.coverage !== "P-7"
    || !Array.isArray(self.environmentVariables)
    || JSON.stringify(self.environmentVariables) !== JSON.stringify(["TEMP", "TMP"])) throw new ProbeError(code);
  if (stage !== "full") return { self, peerSentinelChallenge: null };
  return {
    self,
    peerSentinelChallenge: recordedFile(value.peerSentinelChallenge, "P-7-peer-sentinel-challenge", code),
  };
}

function parseRuntimeConfigurationRef(value, code = "INVALID_INVENTORY") {
  exactKeys(value, new Set(["id", "path", "sha256", "exists", "format"]), code);
  const result = {
    id: nonemptyString(value.id, code),
    path: absolutePath(value.path, code),
    sha256: digest(value.sha256, code),
    exists: value.exists,
    format: nonemptyString(value.format, code),
  };
  if (result.exists !== true || result.format !== RUNTIME_CONFIG_KIND) throw new ProbeError(code);
  return result;
}

function parseInventoryUnsafe(raw) {
  if (!plainObject(raw) || raw.version !== VERSION || raw.kind !== INVENTORY_KIND) throw new ProbeError("INVALID_INVENTORY");
  const stage = nonemptyString(raw.stage, "INVALID_INVENTORY");
  if (!STAGES.has(stage)) throw new ProbeError("INVALID_INVENTORY");
  const commonKeys = ["version", "kind", "probeId", "stage", "recipientCommitment", "coordinatorAuthoritySha256", "ownStaging", "p7"];
  const fullKeys = [...commonKeys, "p9SelfControl", "p10", "runtimeConfiguration", "p12"];
  exactKeys(raw, new Set(stage === "full" ? fullKeys : commonKeys), "INVALID_INVENTORY");
  const inventory = {
    version: VERSION,
    kind: INVENTORY_KIND,
    probeId: opaqueIdentifier(raw.probeId, "probe", "INVALID_INVENTORY"),
    stage,
    recipientCommitment: digest(raw.recipientCommitment, "INVALID_INVENTORY"),
    coordinatorAuthoritySha256: digest(raw.coordinatorAuthoritySha256, "INVALID_INVENTORY"),
    ownStaging: rootDirectory(raw.ownStaging, "INVALID_INVENTORY"),
    p7: parseP7(raw.p7, stage, "INVALID_INVENTORY"),
  };
  if (stage === "full") {
    if (!Array.isArray(raw.runtimeConfiguration) || raw.runtimeConfiguration.length === 0) throw new ProbeError("INVALID_INVENTORY");
    inventory.p9SelfControl = recordedFile(raw.p9SelfControl, "P-9-own-staging-known-file", "INVALID_INVENTORY");
    inventory.p10 = parseP10Targets(raw.p10, "INVALID_INVENTORY");
    inventory.runtimeConfiguration = raw.runtimeConfiguration.map((item) => parseRuntimeConfigurationRef(item, "INVALID_INVENTORY"));
    inventory.p12 = parseP12Targets(raw.p12, "INVALID_INVENTORY");
    if (new Set(inventory.runtimeConfiguration.map((item) => item.id)).size !== inventory.runtimeConfiguration.length) throw new ProbeError("INVALID_INVENTORY");
  }
  return inventory;
}

export function parseInventory(raw) {
  try { return parseInventoryUnsafe(raw); }
  catch (error) { throw error instanceof ProbeError ? error : new ProbeError("INVALID_INVENTORY"); }
}

function parseProbePlanUnsafe(raw) {
  exactKeys(raw, new Set(["version", "kind", "probeId", "stage", "ownStaging", "inventory"]));
  if (raw.version !== VERSION || raw.kind !== PLAN_KIND) throw new ProbeError("INVALID_PLAN");
  const stage = nonemptyString(raw.stage);
  if (!STAGES.has(stage)) throw new ProbeError("INVALID_PLAN");
  const ownStaging = rootDirectory(raw.ownStaging);
  const inventory = fileRef(raw.inventory);
  if (!pathIsWithin(ownStaging.path, inventory.path)) throw new ProbeError("PLAN_INVENTORY_OUTSIDE_STAGING");
  return { version: VERSION, kind: PLAN_KIND, probeId: opaqueIdentifier(raw.probeId, "probe"), stage, ownStaging, inventory };
}

function parseProbePlan(raw) {
  try { return parseProbePlanUnsafe(raw); }
  catch { throw new ProbeError("INVALID_PLAN"); }
}

function parseRuntimeConfigurationUnsafe(raw) {
  exactKeys(raw, new Set(["version", "kind", "context", "toolSurface", "claudeProjects"]));
  if (raw.version !== 3 || raw.kind !== RUNTIME_CONFIG_KIND) throw new ProbeError("CONFIG_SCHEMA_INVALID");
  const context = exactKeys(raw.context, new Set(["probeId", "stage", "recipientCommitment"]), "CONFIG_SCHEMA_INVALID");
  const toolSurface = exactKeys(raw.toolSurface, new Set(["mode", "mcpServers", "connectors"]), "CONFIG_SCHEMA_INVALID");
  const projects = exactKeys(raw.claudeProjects, new Set(["state"]), "CONFIG_SCHEMA_INVALID");
  const projectState = nonemptyString(projects.state, "CONFIG_SCHEMA_INVALID");
  if (nonemptyString(toolSurface.mode, "CONFIG_SCHEMA_INVALID") !== "all-disabled"
    || !Array.isArray(toolSurface.mcpServers) || toolSurface.mcpServers.length !== 0
    || !Array.isArray(toolSurface.connectors) || toolSurface.connectors.length !== 0
    || !new Set(["absent", "used"]).has(projectState)) throw new ProbeError("CONFIG_TOOL_SURFACE_NOT_ALL_DISABLED");
  return {
    context: {
      probeId: opaqueIdentifier(context.probeId, "probe", "CONFIG_SCHEMA_INVALID"),
      stage: nonemptyString(context.stage, "CONFIG_SCHEMA_INVALID"),
      recipientCommitment: digest(context.recipientCommitment, "CONFIG_SCHEMA_INVALID"),
    },
    toolSurface: { mode: "all-disabled", mcpServers: [], connectors: [] },
    claudeProjects: { state: projectState },
  };
}

function parseRuntimeConfiguration(raw) {
  try { return parseRuntimeConfigurationUnsafe(raw); }
  catch (error) { throw error instanceof ProbeError ? error : new ProbeError("CONFIG_SCHEMA_INVALID"); }
}

function parseP12SourceTargets(value, code = "INVALID_AUTHORITY") {
  if (!Array.isArray(value) || value.length !== P12_SPECS.length) throw new ProbeError(code);
  const targets = value.map((entry) => {
    exactKeys(entry, new Set(["id", "rootKind", "read", "write"]), code);
    const id = nonemptyString(entry.id, code);
    const spec = P12_SPECS.find((item) => item.id === id);
    if (!spec || nonemptyString(entry.rootKind, code) !== spec.rootKind) throw new ProbeError(code);
    return {
      id,
      rootKind: spec.rootKind,
      read: recordedFile(entry.read, p12RecordId("read", spec), code),
      write: recordedFile(entry.write, p12RecordId("write", spec), code),
    };
  });
  if (new Set(targets.map((item) => item.id)).size !== targets.length) throw new ProbeError(code);
  return targets.sort((left, right) => left.id.localeCompare(right.id));
}

function parseCoordinatorAuthorityUnsafe(raw) {
  exactKeys(raw, new Set(["version", "kind", "authorityBinding", "actualWorktrees", "roleStaging", "commonGit", "coordinatorScratch", "p10", "redactedP12RouteRoot", "p12Sources"]), "INVALID_AUTHORITY");
  if (raw.version !== 1 || raw.kind !== AUTHORITY_KIND || !Array.isArray(raw.actualWorktrees) || !Array.isArray(raw.roleStaging)) throw new ProbeError("INVALID_AUTHORITY");
  const binding = exactKeys(raw.authorityBinding, new Set(["ownerDecisionJ", "conditionContracts", "cleanRoomAuthorizationStableJsonSha256"]), "INVALID_AUTHORITY");
  if (!Array.isArray(binding.conditionContracts) || binding.conditionContracts.length !== 2) throw new ProbeError("INVALID_AUTHORITY");
  const conditionContracts = binding.conditionContracts.map((entry) => {
    exactKeys(entry, new Set(["condition", "path", "sha256"]), "INVALID_AUTHORITY");
    return { condition: condition(entry.condition, "INVALID_AUTHORITY"), path: absolutePath(entry.path, "INVALID_AUTHORITY"), sha256: digest(entry.sha256, "INVALID_AUTHORITY") };
  });
  if (conditionContracts.map((entry) => entry.condition).sort().join(",") !== "baseline,current") throw new ProbeError("INVALID_AUTHORITY");
  const actualWorktrees = raw.actualWorktrees.map((entry) => {
    exactKeys(entry, new Set(["condition", "path", "exists"]), "INVALID_AUTHORITY");
    const result = { condition: condition(entry.condition, "INVALID_AUTHORITY"), ...rootDirectory({ path: entry.path, exists: entry.exists }, "INVALID_AUTHORITY") };
    return result;
  });
  if (actualWorktrees.length !== 2 || new Set(actualWorktrees.map((entry) => entry.condition)).size !== 2) throw new ProbeError("INVALID_AUTHORITY");
  const roleStaging = raw.roleStaging.map((entry) => {
    exactKeys(entry, new Set(["condition", "roleKind", "actor", "contextId", "recipientCommitment", "path", "exists"]), "INVALID_AUTHORITY");
    const role = roleIdentity({ condition: entry.condition, roleKind: entry.roleKind, actor: entry.actor, contextId: entry.contextId }, "INVALID_AUTHORITY");
    return { ...role, recipientCommitment: digest(entry.recipientCommitment, "INVALID_AUTHORITY"), ...rootDirectory({ path: entry.path, exists: entry.exists }, "INVALID_AUTHORITY") };
  });
  if (roleStaging.length !== 4 || new Set(roleStaging.map((entry) => entry.recipientCommitment)).size !== 4) throw new ProbeError("INVALID_AUTHORITY");
  if (!Array.isArray(raw.p12Sources) || raw.p12Sources.length !== 4) throw new ProbeError("INVALID_AUTHORITY");
  const p12Sources = raw.p12Sources.map((entry) => {
    exactKeys(entry, new Set(["recipientCommitment", "targets"]), "INVALID_AUTHORITY");
    return { recipientCommitment: digest(entry.recipientCommitment, "INVALID_AUTHORITY"), targets: parseP12SourceTargets(entry.targets, "INVALID_AUTHORITY") };
  });
  if (new Set(p12Sources.map((entry) => entry.recipientCommitment)).size !== 4) throw new ProbeError("INVALID_AUTHORITY");
  return {
    authorityBinding: {
      ownerDecisionJ: fileRef(binding.ownerDecisionJ, "INVALID_AUTHORITY"),
      conditionContracts,
      cleanRoomAuthorizationStableJsonSha256: digest(binding.cleanRoomAuthorizationStableJsonSha256, "INVALID_AUTHORITY"),
    },
    actualWorktrees,
    roleStaging,
    commonGit: rootDirectory(raw.commonGit, "INVALID_AUTHORITY"),
    coordinatorScratch: rootDirectory(raw.coordinatorScratch, "INVALID_AUTHORITY"),
    p10: parseP10Targets(raw.p10, "INVALID_AUTHORITY"),
    redactedP12RouteRoot: rootDirectory(raw.redactedP12RouteRoot, "INVALID_AUTHORITY"),
    p12Sources,
  };
}

function parseCoordinatorAuthority(raw) {
  try { return parseCoordinatorAuthorityUnsafe(raw); }
  catch (error) { throw error instanceof ProbeError ? error : new ProbeError("INVALID_AUTHORITY"); }
}

function collectIdentityFragments(authorization) {
  const values = [authorization.pairId];
  for (const room of authorization.conditions) {
    // Worktree ancestors are intentionally excluded: the redacted route root
    // may share a host temp parent with every worktree.  Root overlap is
    // checked separately; identity strings below are the values that identify
    // one condition or role to a recipient.
    values.push(room.condition, room.workspaceId, room.otherWorkspaceId, room.evidencePath, room.implementation.actor, room.implementation.contextId, room.review.actor, room.review.contextId);
  }
  const parts = values.flatMap((value) => String(value).replace(/\\/g, "/").split("/"));
  return [...new Set([...values, ...parts].map((value) => String(value).trim().toLowerCase()).filter((value) => value.length >= 4))];
}

function opaqueRoot(pathname, namespace, authorization) {
  const leaf = basename(pathname).toLowerCase();
  if (!(new RegExp("^" + namespace + "-routes-[a-f0-9]{16,64}$")).test(leaf)) return false;
  const normalized = pathKey(pathname);
  return !collectIdentityFragments(authorization).some((fragment) => normalized.includes(fragment));
}

function opaqueP12RouteRoot(pathname, authorization) {
  return opaqueRoot(pathname, "p12", authorization);
}

function opaqueStagingRoot(pathname, authorization) {
  const leaf = basename(pathname).toLowerCase();
  if (!/^role-staging-[a-f0-9]{16,64}$/.test(leaf)) return false;
  const normalized = pathKey(pathname);
  return !collectIdentityFragments(authorization).some((fragment) => normalized.includes(fragment));
}

async function readVerified(io, item, code) {
  let bytes;
  try { bytes = await io.readFile(item.path); }
  catch { throw new ProbeError(code + "_READ_FAILED"); }
  const actual = sha256(bytes);
  if (actual !== item.sha256) throw new ProbeError(code + "_HASH_MISMATCH");
  return Buffer.from(bytes);
}

function parseJson(bytes, code) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new ProbeError(code + "_JSON_INVALID"); }
}

function findCondition(authorization, desired) {
  const result = authorization.conditions.find((item) => item.condition === desired);
  if (!result) throw new ProbeError("AUTHORITY_CLEAN_ROOM_INVALID");
  return result;
}

function authorizationRole(authorization, desiredCondition, desiredRoleKind) {
  const room = findCondition(authorization, desiredCondition);
  const context = room[desiredRoleKind];
  return { condition: desiredCondition, roleKind: desiredRoleKind, actor: context.actor, contextId: context.contextId };
}

function allAuthorizationRoles(authorization) {
  return ["baseline", "current"].flatMap((item) => [authorizationRole(authorization, item, "implementation"), authorizationRole(authorization, item, "review")]);
}

function assertNoOverlaps(roots, code) {
  for (let index = 0; index < roots.length; index += 1) {
    for (let other = index + 1; other < roots.length; other += 1) if (pathsOverlap(roots[index], roots[other])) throw new ProbeError(code);
  }
}

async function canonicalPath(io, pathname, code) {
  try { return resolve(await (io.realpath || realpath)(pathname)); }
  catch { throw new ProbeError(code); }
}

function expectedP12Roots(authority, authorization, role) {
  const ownRoom = findCondition(authorization, role.condition);
  const otherRoom = findCondition(authorization, role.condition === "baseline" ? "current" : "baseline");
  const peerStaging = authority.roleStaging
    .filter((entry) => entry.recipientCommitment !== role.recipientCommitment)
    .map((entry) => entry.path)
    .sort((left, right) => pathKey(left).localeCompare(pathKey(right)));
  return {
    "own-worktree": [ownRoom.worktreeRoot],
    "other-worktree": [otherRoom.worktreeRoot],
    "peer-staging": peerStaging,
    "common-git": [authority.commonGit.path],
    "coordinator-scratch": [authority.coordinatorScratch.path],
  };
}

function rootForP12Target(roots, target, code) {
  const matches = (roots[target.rootKind] || []).filter((root) => pathIsWithin(root, target.read.path) && pathIsWithin(root, target.write.path));
  if (matches.length !== 1) throw new ProbeError(code);
  return matches[0];
}

async function validateAuthorityPhysicalLayout(authority, authorization, io) {
  const declaredRoots = [
    ...authority.actualWorktrees.map((entry) => entry.path),
    ...authority.roleStaging.map((entry) => entry.path),
    authority.commonGit.path,
    authority.coordinatorScratch.path,
    authority.redactedP12RouteRoot.path,
  ];
  const canonicalRoots = [];
  for (const pathname of declaredRoots) canonicalRoots.push(await canonicalPath(io, pathname, "AUTHORITY_REALPATH_FAILED"));
  assertNoOverlaps(canonicalRoots, "AUTHORITY_REALPATH_OVERLAP");
  for (const target of Object.values(authority.p10.targets)) {
    const physicalTarget = await canonicalPath(io, target.path, "AUTHORITY_P10_REALPATH_FAILED");
    // P-10 must name the actual host conversation/history store, not a
    // coordinator-selected junction or symlink whose leaf merely resembles
    // one.  The role later attempts this exact absolute path.
    if (!samePath(physicalTarget, target.path)) throw new ProbeError("AUTHORITY_P10_REPARSE_ALIAS");
    if (canonicalRoots.some((root) => pathIsWithin(root, physicalTarget, { allowRoot: true }))) throw new ProbeError("AUTHORITY_P10_PROTECTED_ROOT_OVERLAP");
  }
  return { canonicalRoots };
}

async function validateAuthorityP12Sources(authority, authorization, io) {
  const seenFiles = new Set();
  for (const source of authority.p12Sources) {
    const role = authority.roleStaging.find((entry) => entry.recipientCommitment === source.recipientCommitment);
    if (!role) throw new ProbeError("AUTHORITY_P12_SOURCE_RECIPIENT_MISMATCH");
    const roots = expectedP12Roots(authority, authorization, role);
    const peerRoots = [];
    for (const target of source.targets) {
      const root = rootForP12Target(roots, target, "AUTHORITY_P12_SOURCE_ROOT_MISMATCH");
      if (target.rootKind === "peer-staging") peerRoots.push(root);
      const physicalRoot = await canonicalPath(io, root, "AUTHORITY_P12_REALPATH_FAILED");
      const physicalRead = await canonicalPath(io, target.read.path, "AUTHORITY_P12_REALPATH_FAILED");
      const physicalWrite = await canonicalPath(io, target.write.path, "AUTHORITY_P12_REALPATH_FAILED");
      if (!pathIsWithin(physicalRoot, physicalRead) || !pathIsWithin(physicalRoot, physicalWrite)) throw new ProbeError("AUTHORITY_P12_REPARSE_ESCAPE");
      await readVerified(io, target.read, "AUTHORITY_P12_SOURCE");
      await readVerified(io, target.write, "AUTHORITY_P12_SOURCE");
      const commitment = p12RouteCommitment(source.recipientCommitment, target);
      const routeRead = p12RoutePath(authority.redactedP12RouteRoot.path, commitment, "read");
      const routeWrite = p12RoutePath(authority.redactedP12RouteRoot.path, commitment, "write");
      const physicalRouteRead = await canonicalPath(io, routeRead, "AUTHORITY_P12_ROUTE_REALPATH_FAILED");
      const physicalRouteWrite = await canonicalPath(io, routeWrite, "AUTHORITY_P12_ROUTE_REALPATH_FAILED");
      if (!samePath(physicalRouteRead, physicalRead) || !samePath(physicalRouteWrite, physicalWrite)) throw new ProbeError("AUTHORITY_P12_ROUTE_NOT_SOURCE_ALIAS");
      await readVerified(io, { path: routeRead, sha256: target.read.sha256 }, "AUTHORITY_P12_ROUTE");
      await readVerified(io, { path: routeWrite, sha256: target.write.sha256 }, "AUTHORITY_P12_ROUTE");
      for (const pathname of [target.read.path, target.write.path]) {
        if (seenFiles.has(pathKey(pathname))) throw new ProbeError("AUTHORITY_P12_SOURCE_DUPLICATE");
        seenFiles.add(pathKey(pathname));
      }
    }
    if (new Set(peerRoots.map(pathKey)).size !== 3) throw new ProbeError("AUTHORITY_P12_PEER_SOURCE_SET_MISMATCH");
  }
}

async function loadCoordinatorAuthority(ref, io) {
  const raw = parseJson(await readVerified(io, ref, "COORDINATOR_AUTHORITY"), "COORDINATOR_AUTHORITY");
  const authority = parseCoordinatorAuthority(raw);
  const decision = parseDecisionJ(parseJson(await readVerified(io, authority.authorityBinding.ownerDecisionJ, "AUTHORITY_DECISION"), "AUTHORITY_DECISION"));
  const decisionHash = stableHash(decision.authorization);
  if (decision.authorizationStableJsonSha256 !== decisionHash || authority.authorityBinding.cleanRoomAuthorizationStableJsonSha256 !== decisionHash) throw new ProbeError("AUTHORITY_DECISION_HASH_MISMATCH");
  const contracts = new Map();
  for (const reference of authority.authorityBinding.conditionContracts) {
    const contract = parseComparisonContract(parseJson(await readVerified(io, reference, "AUTHORITY_CONTRACT"), "AUTHORITY_CONTRACT"), reference.path);
    if (!sameRef(contract.ownerDecisionJ, authority.authorityBinding.ownerDecisionJ)
      || stableHash(contract.authorization) !== decisionHash
      || contract.authorization.pairId !== decision.pairId) throw new ProbeError("AUTHORITY_CONTRACT_MISMATCH");
    const room = findCondition(decision.authorization, reference.condition);
    if (contract.run.workspaceId !== room.workspaceId
      || contract.run.implementation.actor !== room.implementation.actor
      || contract.run.implementation.contextId !== room.implementation.contextId
      || contract.run.review.actor !== room.review.actor
      || contract.run.review.contextId !== room.review.contextId) throw new ProbeError("AUTHORITY_CONTRACT_RUN_MISMATCH");
    contracts.set(reference.condition, { reference, contract });
  }
  for (const room of decision.authorization.conditions) {
    const actual = authority.actualWorktrees.find((entry) => entry.condition === room.condition);
    if (!actual || !samePath(actual.path, room.worktreeRoot)) throw new ProbeError("AUTHORITY_WORKTREE_MISMATCH");
  }
  const expectedRoles = allAuthorizationRoles(decision.authorization);
  if (authority.roleStaging.length !== expectedRoles.length
    || expectedRoles.some((role) => !authority.roleStaging.some((entry) => sameRole(entry, role) && entry.recipientCommitment === recipientCommitment(decision.pairId, role)))) throw new ProbeError("AUTHORITY_ROLE_STAGING_MISMATCH");
  const allRoots = [
    ...authority.actualWorktrees.map((entry) => entry.path),
    ...authority.roleStaging.map((entry) => entry.path),
    authority.commonGit.path,
    authority.coordinatorScratch.path,
    authority.redactedP12RouteRoot.path,
  ];
  assertNoOverlaps(allRoots, "AUTHORITY_ROOT_OVERLAP");
  if (!opaqueP12RouteRoot(authority.redactedP12RouteRoot.path, decision.authorization)) throw new ProbeError("P12_ROUTE_ROOT_IDENTITY_LEAK");
  if (authority.roleStaging.some((entry) => !opaqueStagingRoot(entry.path, decision.authorization))) throw new ProbeError("AUTHORITY_STAGING_IDENTITY_LEAK");
  const p10Paths = Object.values(authority.p10.targets).map((item) => item.path);
  if (new Set(p10Paths.map(pathKey)).size !== p10Paths.length) throw new ProbeError("AUTHORITY_DUPLICATE_P10_TARGET");
  await validateAuthorityPhysicalLayout(authority, decision.authorization, io);
  await validateAuthorityP12Sources(authority, decision.authorization, io);
  return { ref, authority, decision, authorization: decision.authorization, authorizationHash: decisionHash, contracts };
}

function sameRecordedTarget(left, right) {
  return left.id === right.id && samePath(left.path, right.path) && left.exists === right.exists && ("sha256" in left ? left.sha256 === right.sha256 : !("sha256" in right));
}

function configurationSetHash(configuration) {
  return stableHash(configuration.map((item) => ({ id: item.id, path: item.path, sha256: item.sha256, format: item.format })).sort((left, right) => left.id.localeCompare(right.id)));
}

function validateInventoryAgainstAuthority(plan, inventory, authorityState) {
  if (plan.probeId !== inventory.probeId || plan.stage !== inventory.stage) throw new ProbeError("INVENTORY_PROBE_MISMATCH");
  if (!samePath(plan.ownStaging.path, inventory.ownStaging.path)) throw new ProbeError("PLAN_STAGING_MISMATCH");
  if (inventory.coordinatorAuthoritySha256 !== authorityState.ref.sha256) throw new ProbeError("INVENTORY_AUTHORITY_HASH_MISMATCH");
  const role = authorityState.authority.roleStaging.find((entry) => entry.recipientCommitment === inventory.recipientCommitment);
  if (!role || !samePath(inventory.ownStaging.path, role.path)) throw new ProbeError("INVENTORY_RECIPIENT_STAGING_MISMATCH");
  if (plan.stage === "bootstrap") return { role };
  if (!pathIsWithin(role.path, inventory.p9SelfControl.path)
    || inventory.runtimeConfiguration.some((item) => !pathIsWithin(role.path, item.path))) throw new ProbeError("INVENTORY_OWN_INPUT_OUTSIDE_STAGING");
  for (const spec of P10_SPECS) if (!sameRecordedTarget(inventory.p10.targets[spec.key], authorityState.authority.p10.targets[spec.key])) throw new ProbeError("P10_TARGET_NOT_COORDINATOR_DERIVED");
  const inventoryProjects = inventory.p10.targets[P10_CLAUDE_PROJECTS_SPEC.key];
  const authorityProjects = authorityState.authority.p10.targets[P10_CLAUDE_PROJECTS_SPEC.key];
  if (Boolean(inventoryProjects) !== Boolean(authorityProjects)
    || (inventoryProjects && !sameRecordedTarget(inventoryProjects, authorityProjects))) throw new ProbeError("P10_CLAUDE_PROJECT_TARGET_NOT_COORDINATOR_DERIVED");
  const source = authorityState.authority.p12Sources.find((entry) => entry.recipientCommitment === inventory.recipientCommitment);
  if (!source) throw new ProbeError("P12_SOURCE_NOT_COORDINATOR_DERIVED");
  if (!samePath(inventory.p12.redactedRouteRoot.path, authorityState.authority.redactedP12RouteRoot.path)) throw new ProbeError("P12_ROUTE_ROOT_NOT_COORDINATOR_DERIVED");
  const peerTargets = inventory.p12.targets.filter((item) => item.rootKind === "peer-staging");
  if (peerTargets.length !== 3) throw new ProbeError("P12_PEER_STAGING_SET_MISMATCH");
  for (const target of inventory.p12.targets) {
    const sourceTarget = source.targets.find((item) => item.id === target.id);
    if (!sourceTarget || target.rootKind !== sourceTarget.rootKind) throw new ProbeError("P12_TARGET_NOT_COORDINATOR_DERIVED");
    const commitment = p12RouteCommitment(inventory.recipientCommitment, sourceTarget);
    if (target.routeCommitment !== commitment
      || !samePath(target.read.path, p12RoutePath(inventory.p12.redactedRouteRoot.path, commitment, "read"))
      || !samePath(target.write.path, p12RoutePath(inventory.p12.redactedRouteRoot.path, commitment, "write"))
      || target.read.sha256 !== sourceTarget.read.sha256
      || target.write.sha256 !== sourceTarget.write.sha256) throw new ProbeError("P12_TARGET_NOT_COORDINATOR_DERIVED");
  }
  if (!inventory.p7.peerSentinelChallenge
    || !pathIsWithin(role.path, inventory.p7.peerSentinelChallenge.path)) throw new ProbeError("P7_CHALLENGE_NOT_COORDINATOR_DERIVED");
  const filePaths = [inventory.p9SelfControl, ...Object.values(inventory.p10.targets).filter((item) => item.kind === "file"), ...inventory.runtimeConfiguration, ...inventory.p12.targets.flatMap((item) => [item.read, item.write]), inventory.p7.peerSentinelChallenge].map((item) => item.path);
  if (new Set(filePaths.map(pathKey)).size !== filePaths.length) throw new ProbeError("INVENTORY_DUPLICATE_FILE_TARGET");
  return { role };
}

function observationFactory(plan, phase, observe) {
  let sequence = 0;
  return (record) => observe({ version: VERSION, type: "p3-clean-room-probe-observation", at: new Date().toISOString(), sequence: ++sequence, probeId: plan.probeId, phase, stage: plan.stage, ...record });
}

function failObservation(emit, record, code) {
  emit({ ...record, outcome: "FAIL", result: "failed" });
  throw new ProbeError(code, { reported: true });
}

async function verifiedBytes(emit, io, item, { observation, errorPrefix, extra = {} }) {
  let bytes;
  try { bytes = await io.readFile(item.path); }
  catch (error) { return failObservation(emit, { observation, id: item.id, ...extra, errorCode: safeErrorCode(error) }, errorPrefix + "_READ_FAILED"); }
  const actual = sha256(bytes);
  if (actual !== item.sha256) return failObservation(emit, { observation, id: item.id, ...extra, expectedSha256: item.sha256, actualSha256: actual }, errorPrefix + "_HASH_MISMATCH");
  emit({ observation, id: item.id, sha256: actual, outcome: "PASS", ...extra });
  return Buffer.from(bytes);
}

function parseJsonOrFail(emit, bytes, observation, code, extra = {}) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { return failObservation(emit, { observation, ...extra }, code); }
}

async function loadRoleInputs(plan, io) {
  const inventoryBytes = await readVerified(io, plan.inventory, "INVENTORY");
  const inventory = parseInventory(parseJson(inventoryBytes, "INVENTORY"));
  if (inventory.probeId !== plan.probeId || inventory.stage !== plan.stage || !samePath(plan.ownStaging.path, inventory.ownStaging.path)) throw new ProbeError("INVENTORY_PROBE_MISMATCH");
  return inventory;
}

async function validateRolePlanPhysicalInput(plan, io) {
  const physicalStaging = await canonicalPath(io, plan.ownStaging.path, "ROLE_STAGING_REALPATH_FAILED");
  // A role input root must itself not be a junction/symlink.  Otherwise a
  // lexically self-staging plan could make the first inventory read external.
  if (!samePath(physicalStaging, plan.ownStaging.path)) throw new ProbeError("ROLE_STAGING_REPARSE_ROOT");
  const physicalInventory = await canonicalPath(io, plan.inventory.path, "ROLE_INVENTORY_REALPATH_FAILED");
  if (!pathIsWithin(physicalStaging, physicalInventory)) throw new ProbeError("ROLE_INVENTORY_REPARSE_ESCAPE");
  return physicalStaging;
}

function localOpaqueRouteRoot(pathname, namespace) {
  return (new RegExp("^" + namespace + "-routes-[a-f0-9]{16,64}$")).test(basename(pathname).toLowerCase());
}

function routeIdentityLexeme(pathname) {
  // A disposable role does not receive the authority's exact identity
  // fragments.  Reject the reserved carrier words locally before opening a
  // challenge; the coordinator additionally scans the exact J-derived
  // fragments before it accepts any evidence.
  return /(^|[\\/._-])(baseline|current|pair|workspace|actor|context|worktree|coordinator|peer|scratch|decision|contract|bootstrap)(?=$|[\\/._-])/i.test(pathKey(pathname));
}

async function validateRoleSideInputs(plan, inventory, io, physicalStaging) {
  const staging = plan.ownStaging.path;
  if (!/^role-staging-[a-f0-9]{16,64}$/.test(basename(staging).toLowerCase())
    || !pathIsWithin(staging, plan.inventory.path)) throw new ProbeError("ROLE_INPUT_STAGING_INVALID");
  if (plan.stage === "bootstrap") return;
  const roleLocalFiles = [inventory.p9SelfControl, ...inventory.runtimeConfiguration, inventory.p7.peerSentinelChallenge];
  if (roleLocalFiles.some((item) => !pathIsWithin(staging, item.path))
    || !localOpaqueRouteRoot(inventory.p12.redactedRouteRoot.path, "p12")
    || routeIdentityLexeme(inventory.p12.redactedRouteRoot.path)
    || pathsOverlap(staging, inventory.p12.redactedRouteRoot.path)
    || Object.values(inventory.p10.targets).some((item) => pathIsWithin(staging, item.path, { allowRoot: true }))) throw new ProbeError("ROLE_INPUT_OUTSIDE_STAGING");
  for (const target of inventory.p12.targets) {
    if (!samePath(target.read.path, p12RoutePath(inventory.p12.redactedRouteRoot.path, target.routeCommitment, "read"))
      || !samePath(target.write.path, p12RoutePath(inventory.p12.redactedRouteRoot.path, target.routeCommitment, "write"))
      || pathIsWithin(staging, target.read.path, { allowRoot: true })
      || pathIsWithin(staging, target.write.path, { allowRoot: true })) throw new ProbeError("ROLE_P12_ROUTE_INVALID");
  }
  // Resolve only own-staging inputs.  P-10/P-12 routes intentionally remain
  // un-resolved on the role side: resolving them could disclose a protected
  // source path, and their access denial is what the probe measures.
  const ownInputPaths = [inventory.p9SelfControl.path, ...inventory.runtimeConfiguration.map((item) => item.path), inventory.p7.peerSentinelChallenge.path];
  for (const pathname of ownInputPaths) {
    const physical = await canonicalPath(io, pathname, "ROLE_INPUT_REALPATH_FAILED");
    if (!pathIsWithin(physicalStaging, physical, { allowRoot: true })) throw new ProbeError("ROLE_INPUT_REPARSE_ESCAPE");
  }
}

function assertClaudeProjectP10Coverage(inventory, parsed, code) {
  const states = new Set(parsed.map((config) => config.claudeProjects.state));
  if (states.size !== 1) throw new ProbeError(code);
  const used = states.has("used");
  const target = inventory.p10.targets[P10_CLAUDE_PROJECTS_SPEC.key];
  if (used !== Boolean(target)) throw new ProbeError(code);
  return used ? "used" : "absent";
}

async function deriveRuntimeConfigurationSchema(plan, inventory, emit, io, common) {
  const parsed = [];
  for (const item of inventory.runtimeConfiguration) {
    const bytes = await verifiedBytes(emit, io, item, { observation: "runtime-config-sha256", errorPrefix: "CONFIG", extra: common });
    const raw = parseJsonOrFail(emit, bytes, "runtime-config-json", "CONFIG_JSON_INVALID", { id: item.id, ...common });
    let config;
    try { config = parseRuntimeConfiguration(raw); }
    catch (error) { return failObservation(emit, { observation: "runtime-config-schema", id: item.id, ...common }, error instanceof ProbeError ? error.code : "CONFIG_SCHEMA_INVALID"); }
    if (config.context.probeId !== plan.probeId || config.context.stage !== plan.stage || config.context.recipientCommitment !== inventory.recipientCommitment) return failObservation(emit, { observation: "runtime-config-context", id: item.id, ...common }, "CONFIG_CONTEXT_MISMATCH");
    parsed.push(config);
  }
  let claudeProjectState;
  try { claudeProjectState = assertClaudeProjectP10Coverage(inventory, parsed, "P10_CLAUDE_PROJECT_COVERAGE_MISMATCH"); }
  catch (error) { return failObservation(emit, { observation: "runtime-config-project-coverage", ...common }, error instanceof ProbeError ? error.code : "P10_CLAUDE_PROJECT_COVERAGE_MISMATCH"); }
  const result = {
    configurationSetSha256: configurationSetHash(inventory.runtimeConfiguration),
    toolSurfaceSha256: stableHash({ mode: "all-disabled", mcpServers: [], connectors: [] }),
    claudeProjectStateSha256: stableHash({ state: claudeProjectState }),
  };
  // This is intentionally not P-11 evidence.  It verifies only a role-side
  // input schema.  `--require-p11-authorization` remains fail-closed because
  // this helper cannot derive an agent host's actual MCP/tool inventory from
  // that JSON file.
  emit({ observation: "runtime-config-schema-accepted", coverage: "configuration", result: "schema-accepted-not-p11", ...result, outcome: "PASS", ...common });
  return result;
}

async function denyFileRead(emit, io, item, observation) {
  let handle;
  try {
    handle = await io.open(item.path, "r");
    await handle.read(Buffer.alloc(1), 0, 1, 0);
  } catch (error) {
    if (isAccessDenied(error)) {
      emit({ ...observation, id: item.id, outcome: "PASS", result: "denied", errorCode: safeErrorCode(error) });
      return;
    }
    return failObservation(emit, { ...observation, id: item.id, errorCode: safeErrorCode(error) }, "READ_DENY_UNVERIFIED");
  } finally {
    if (handle) try { await handle.close(); } catch { /* successful access fails below */ }
  }
  return failObservation(emit, { ...observation, id: item.id }, "READ_UNEXPECTEDLY_ALLOWED");
}

async function denyDirectoryRead(emit, io, item, observation) {
  try { await io.readdir(item.path, { encoding: "buffer" }); }
  catch (error) {
    if (isAccessDenied(error)) {
      emit({ ...observation, id: item.id, outcome: "PASS", result: "denied", errorCode: safeErrorCode(error) });
      return;
    }
    return failObservation(emit, { ...observation, id: item.id, errorCode: safeErrorCode(error) }, "DIRECTORY_DENY_UNVERIFIED");
  }
  return failObservation(emit, { ...observation, id: item.id }, "DIRECTORY_UNEXPECTEDLY_ALLOWED");
}

async function denyWriteOpen(emit, io, item, observation) {
  let handle;
  try { handle = await io.open(item.path, "r+"); }
  catch (error) {
    if (isAccessDenied(error)) {
      emit({ ...observation, id: item.id, outcome: "PASS", result: "denied", errorCode: safeErrorCode(error) });
      return;
    }
    return failObservation(emit, { ...observation, id: item.id, errorCode: safeErrorCode(error) }, "WRITE_DENY_UNVERIFIED");
  } finally {
    if (handle) try { await handle.close(); } catch { /* successful access fails below */ }
  }
  return failObservation(emit, { ...observation, id: item.id }, "WRITE_UNEXPECTEDLY_ALLOWED");
}

function randomBuffer(randomBytesFn, size) {
  const value = randomBytesFn(size);
  if (!(value instanceof Uint8Array) || value.byteLength !== size) throw new ProbeError("TEMP_RANDOM_FAILED");
  return Buffer.from(value);
}

async function deriveLaunchTempEnvironment(io, ownStaging, environment) {
  const temp = absolutePath(environment?.TEMP, "P7_LAUNCH_TEMP_MISSING");
  const tmp = absolutePath(environment?.TMP, "P7_LAUNCH_TMP_MISSING");
  const physicalTemp = await canonicalPath(io, temp, "P7_LAUNCH_TEMP_REALPATH_FAILED");
  const physicalTmp = await canonicalPath(io, tmp, "P7_LAUNCH_TMP_REALPATH_FAILED");
  const physicalStaging = await canonicalPath(io, ownStaging, "P7_LAUNCH_STAGING_REALPATH_FAILED");
  if (pathsOverlap(physicalStaging, physicalTemp) || pathsOverlap(physicalStaging, physicalTmp)) throw new ProbeError("P7_LAUNCH_TEMP_OVERLAPS_STAGING");
  const result = {
    TEMP: temp,
    TMP: tmp,
    TEMPRealpath: physicalTemp,
    TMPRealpath: physicalTmp,
  };
  return { ...result, sha256: stableHash(result) };
}

async function createOneLaunchTempSentinel(emit, io, directory, variable, randomBytesFn, common) {
  let pathname;
  let handle;
  let payload;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = randomBuffer(randomBytesFn, 24).toString("hex");
    pathname = resolve(directory, ".p3-clean-room-probe-" + variable.toLowerCase() + "-" + token + ".sentinel");
    if (!pathIsWithin(directory, pathname)) throw new ProbeError("TEMP_PATH_INVALID");
    payload = randomBuffer(randomBytesFn, 32);
    try { handle = await io.open(pathname, "wx+", 0o600); break; }
    catch (error) {
      if (safeErrorCode(error) === "EEXIST") continue;
      return failObservation(emit, { observation: "temp-self-sentinel-create-read", id: "P-7-own-temp-sentinel", coverage: "P-7", ...common, errorCode: safeErrorCode(error), environmentVariable: variable }, "TEMP_SELF_CREATE_FAILED");
    }
  }
  if (!handle || !pathname || !payload) return failObservation(emit, { observation: "temp-self-sentinel-create-read", id: "P-7-own-temp-sentinel", coverage: "P-7", ...common, environmentVariable: variable }, "TEMP_SELF_CREATE_FAILED");
  try {
    const written = await handle.write(payload, 0, payload.byteLength, 0);
    const actual = Buffer.alloc(payload.byteLength);
    const read = await handle.read(actual, 0, actual.byteLength, 0);
    if (written?.bytesWritten !== payload.byteLength || read?.bytesRead !== payload.byteLength || sha256(actual) !== sha256(payload)) return failObservation(emit, { observation: "temp-self-sentinel-create-read", id: "P-7-own-temp-sentinel", coverage: "P-7", ...common, environmentVariable: variable }, "TEMP_SELF_READ_FAILED");
    return { environmentVariable: variable, path: pathname, sha256: sha256(actual) };
  } catch (error) {
    if (error instanceof ProbeError) throw error;
    return failObservation(emit, { observation: "temp-self-sentinel-create-read", id: "P-7-own-temp-sentinel", coverage: "P-7", ...common, errorCode: safeErrorCode(error), environmentVariable: variable }, "TEMP_SELF_WRITE_FAILED");
  } finally {
    try { await handle.close(); } catch { /* no successful output after close failure is claimed */ }
  }
}

async function createAndVerifyLaunchTempSentinels(emit, io, self, launchEnvironment, randomBytesFn, common) {
  const sentinels = [];
  for (const variable of self.environmentVariables) {
    const sentinel = await createOneLaunchTempSentinel(emit, io, launchEnvironment[variable], variable, randomBytesFn, common);
    sentinels.push(sentinel);
  }
  if (new Set(sentinels.map((item) => pathKey(item.path))).size !== sentinels.length) throw new ProbeError("TEMP_SENTINEL_PATH_DUPLICATE");
  emit({
    observation: "temp-self-sentinel-create-read",
    id: self.id,
    coverage: "P-7",
    launchEnvironment: {
      TEMP: launchEnvironment.TEMP,
      TMP: launchEnvironment.TMP,
      TEMPRealpath: launchEnvironment.TEMPRealpath,
      TMPRealpath: launchEnvironment.TMPRealpath,
      sha256: launchEnvironment.sha256,
    },
    sentinels,
    outcome: "PASS",
    ...common,
  });
  return { launchEnvironment, sentinels };
}

function parsePeerSentinelChallengeUnsafe(raw) {
  exactKeys(raw, new Set(["version", "kind", "challengeId", "recipient", "sentinels", "provenance"]), "P7_CHALLENGE_INVALID");
  if (raw.version !== 3 || raw.kind !== CHALLENGE_KIND || !Array.isArray(raw.sentinels) || raw.sentinels.length !== 3) throw new ProbeError("P7_CHALLENGE_INVALID");
  const recipient = exactKeys(raw.recipient, new Set(["probeId", "recipientCommitment"]), "P7_CHALLENGE_INVALID");
  const provenance = exactKeys(raw.provenance, new Set(["matrixPlanStableJsonSha256", "coordinatorAuthoritySha256", "bootstrapEvidenceSetSha256", "recipientCommitment"]), "P7_CHALLENGE_INVALID");
  const sentinels = raw.sentinels.map((entry) => {
    exactKeys(entry, new Set(["id", "path", "sha256", "sourceCommitment"]), "P7_CHALLENGE_INVALID");
    return { id: nonemptyString(entry.id, "P7_CHALLENGE_INVALID"), path: absolutePath(entry.path, "P7_CHALLENGE_INVALID"), sha256: digest(entry.sha256, "P7_CHALLENGE_INVALID"), sourceCommitment: digest(entry.sourceCommitment, "P7_CHALLENGE_INVALID") };
  });
  if (new Set(sentinels.map((item) => item.id)).size !== 3 || new Set(sentinels.map((item) => pathKey(item.path))).size !== 3 || sentinels.some((item) => !OPAQUE_SENTINEL_IDS.has(item.id))) throw new ProbeError("P7_CHALLENGE_INVALID");
  return {
    challengeId: opaqueIdentifier(raw.challengeId, "challenge", "P7_CHALLENGE_INVALID"),
    recipient: { probeId: opaqueIdentifier(recipient.probeId, "probe", "P7_CHALLENGE_INVALID"), recipientCommitment: digest(recipient.recipientCommitment, "P7_CHALLENGE_INVALID") },
    sentinels: sentinels.sort((left, right) => left.id.localeCompare(right.id)),
    provenance: {
      matrixPlanStableJsonSha256: digest(provenance.matrixPlanStableJsonSha256, "P7_CHALLENGE_INVALID"),
      coordinatorAuthoritySha256: digest(provenance.coordinatorAuthoritySha256, "P7_CHALLENGE_INVALID"),
      bootstrapEvidenceSetSha256: digest(provenance.bootstrapEvidenceSetSha256, "P7_CHALLENGE_INVALID"),
      recipientCommitment: digest(provenance.recipientCommitment, "P7_CHALLENGE_INVALID"),
    },
  };
}

function parsePeerSentinelChallenge(raw) {
  try { return parsePeerSentinelChallengeUnsafe(raw); }
  catch (error) { throw error instanceof ProbeError ? error : new ProbeError("P7_CHALLENGE_INVALID"); }
}

function validateRoleChallenge(challenge, plan, inventory) {
  if (challenge.recipient.probeId !== plan.probeId
    || challenge.recipient.recipientCommitment !== inventory.recipientCommitment
    || challenge.provenance.recipientCommitment !== inventory.recipientCommitment
    || challenge.provenance.coordinatorAuthoritySha256 !== inventory.coordinatorAuthoritySha256) throw new ProbeError("P7_CHALLENGE_RECIPIENT_MISMATCH");
  for (const sentinel of challenge.sentinels) {
    // The peer receives the source role's *original* absolute launch-TEMP
    // sentinel path.  It is deliberately not a coordinator-owned alias.
    if (!isAbsolute(sentinel.path)
      || routeIdentityLexeme(sentinel.path)
      || pathIsWithin(inventory.ownStaging.path, sentinel.path, { allowRoot: true })) throw new ProbeError("P7_CHALLENGE_SENTINEL_PATH_INVALID");
  }
}

async function verifyRoleChallenge(plan, inventory, emit, io, common) {
  const item = inventory.p7.peerSentinelChallenge;
  const bytes = await verifiedBytes(emit, io, item, { observation: "p7-peer-sentinel-challenge-sha256", errorPrefix: "P7_CHALLENGE", extra: common });
  let challenge;
  try { challenge = parsePeerSentinelChallenge(parseJsonOrFail(emit, bytes, "p7-peer-sentinel-challenge-json", "P7_CHALLENGE_JSON_INVALID", common)); }
  catch (error) { return failObservation(emit, { observation: "p7-peer-sentinel-challenge-schema", ...common }, error instanceof ProbeError ? error.code : "P7_CHALLENGE_INVALID"); }
  try { validateRoleChallenge(challenge, plan, inventory); }
  catch (error) { return failObservation(emit, { observation: "p7-peer-sentinel-challenge-provenance", ...common }, error instanceof ProbeError ? error.code : "P7_CHALLENGE_INVALID"); }
  emit({ observation: "p7-peer-sentinel-provenance", coverage: "P-7", challengeId: challenge.challengeId, matrixPlanStableJsonSha256: challenge.provenance.matrixPlanStableJsonSha256, coordinatorAuthoritySha256: challenge.provenance.coordinatorAuthoritySha256, bootstrapEvidenceSetSha256: challenge.provenance.bootstrapEvidenceSetSha256, outcome: "PASS", ...common });
  for (const sentinel of challenge.sentinels) await denyFileRead(emit, io, sentinel, { observation: "temp-peer-sentinel-read-deny", coverage: "P-7", challengeId: challenge.challengeId, ...common });
  return challenge;
}

/** Execute one disposable role-side probe. It deliberately does not load authority. */
export async function executeProbe(rawPlan, phase, { io = { readFile, readdir, open }, observe = () => {}, randomBytesFn = randomBytes, environment = process.env } = {}) {
  if (!PHASES.has(phase)) throw new ProbeError("INVALID_PHASE");
  const plan = parseProbePlan(rawPlan);
  const emit = observationFactory(plan, phase, observe);
  const physicalStaging = await validateRolePlanPhysicalInput(plan, io);
  const inventory = await loadRoleInputs(plan, io);
  // This preflight runs before the role reads a runtime configuration, P-9
  // target, P-12 route, or P-7 challenge.  It makes inventory-pinned role
  // inputs self-staging-local and keeps all denied routes outside that root.
  await validateRoleSideInputs(plan, inventory, io, physicalStaging);
  // P-7 intentionally reads the actual environment inherited by this role
  // launch.  A coordinator-declared staging directory is not accepted as a
  // substitute for TEMP/TMP.
  const launchEnvironment = await deriveLaunchTempEnvironment(io, plan.ownStaging.path, environment);
  const common = {
    binding: {
      rolePlanStableJsonSha256: stableHash(plan),
      inventorySha256: plan.inventory.sha256,
      coordinatorAuthoritySha256: inventory.coordinatorAuthoritySha256,
      recipientCommitment: inventory.recipientCommitment,
      p7LaunchEnvironmentSha256: launchEnvironment.sha256,
    },
  };
  if (plan.stage === "full") {
    // These values are derivable from the hash-pinned inventory before the
    // first JSONL line is emitted.  Populate them up front so streamed CLI
    // output and in-memory E2E observations have identical bindings.
    common.binding.configurationSetSha256 = configurationSetHash(inventory.runtimeConfiguration);
    common.binding.toolSurfaceSha256 = stableHash({ mode: "all-disabled", mcpServers: [], connectors: [] });
  }
  emit({ observation: "role-plan-inventory-sha256", id: "role-probe-inventory", sha256: plan.inventory.sha256, outcome: "PASS", ...common });
  if (plan.stage === "bootstrap") {
    await createAndVerifyLaunchTempSentinels(emit, io, inventory.p7.self, launchEnvironment, randomBytesFn, common);
    emit({ observation: "probe-complete", outcome: "PASS", result: "complete", ...common });
    return { plan, inventory };
  }
  const configuration = await deriveRuntimeConfigurationSchema(plan, inventory, emit, io, common);
  if (configuration.configurationSetSha256 !== common.binding.configurationSetSha256 || configuration.toolSurfaceSha256 !== common.binding.toolSurfaceSha256) throw new ProbeError("CONFIG_DERIVATION_MISMATCH");
  await verifiedBytes(emit, io, inventory.p9SelfControl, { observation: "self-control-read", errorPrefix: "P9_SELF_CONTROL", extra: { coverage: "P-9", ...common } });
  await createAndVerifyLaunchTempSentinels(emit, io, inventory.p7.self, launchEnvironment, randomBytesFn, common);
  for (const item of Object.values(inventory.p10.targets)) {
    if (item.kind === "file") await denyFileRead(emit, io, item, { observation: "read-deny-file", coverage: item.id, ...common });
    else await denyDirectoryRead(emit, io, item, { observation: "read-deny-directory", coverage: item.id, ...common });
  }
  for (const target of inventory.p12.targets) {
    await denyFileRead(emit, io, target.read, { observation: "read-deny-file", coverage: "P-12-" + target.id, ...common });
    await denyWriteOpen(emit, io, target.write, { observation: "write-open-deny", coverage: "P-12-" + target.id, ...common });
  }
  await verifyRoleChallenge(plan, inventory, emit, io, common);
  emit({ observation: "probe-complete", outcome: "PASS", result: "complete", ...common });
  return { plan, inventory, configuration };
}

function parseMatrixPlanUnsafe(raw) {
  exactKeys(raw, new Set(["version", "kind", "matrixId", "challengeId", "coordinatorAuthority", "recipient", "bootstrapEntries"]), "MATRIX_PLAN_INVALID");
  if (raw.version !== 3 || raw.kind !== MATRIX_PLAN_KIND || !Array.isArray(raw.bootstrapEntries)) throw new ProbeError("MATRIX_PLAN_INVALID");
  const recipient = exactKeys(raw.recipient, new Set(["probeId", "recipientCommitment"]), "MATRIX_PLAN_INVALID");
  const entries = raw.bootstrapEntries.map((entry) => {
    exactKeys(entry, new Set(["probePlan", "output"]), "MATRIX_PLAN_INVALID");
    return { probePlan: fileRef(entry.probePlan, "MATRIX_PLAN_INVALID"), output: fileRef(entry.output, "MATRIX_PLAN_INVALID") };
  });
  return {
    matrixId: opaqueIdentifier(raw.matrixId, "matrix", "MATRIX_PLAN_INVALID"),
    challengeId: opaqueIdentifier(raw.challengeId, "challenge", "MATRIX_PLAN_INVALID"),
    coordinatorAuthority: fileRef(raw.coordinatorAuthority, "MATRIX_PLAN_INVALID"),
    recipient: { probeId: opaqueIdentifier(recipient.probeId, "probe", "MATRIX_PLAN_INVALID"), recipientCommitment: digest(recipient.recipientCommitment, "MATRIX_PLAN_INVALID") },
    bootstrapEntries: entries,
  };
}

function parseMatrixPlan(raw) {
  try { return parseMatrixPlanUnsafe(raw); }
  catch (error) { throw error instanceof ProbeError ? error : new ProbeError("MATRIX_PLAN_INVALID"); }
}

function parseJsonl(bytes, code) {
  const lines = Buffer.from(bytes).toString("utf8").split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) throw new ProbeError(code);
  try { return lines.map((line) => JSON.parse(line)); }
  catch { throw new ProbeError(code); }
}

function assertObservationBase(records, plan, inventory, phase, code) {
  const planHash = stableHash(plan);
  const expectedBinding = {
    rolePlanStableJsonSha256: planHash,
    inventorySha256: plan.inventory.sha256,
    coordinatorAuthoritySha256: inventory.coordinatorAuthoritySha256,
    recipientCommitment: inventory.recipientCommitment,
  };
  if (records.some((record, index) => !plainObject(record)
    || record.version !== VERSION || record.type !== "p3-clean-room-probe-observation"
    || record.sequence !== index + 1 || record.probeId !== plan.probeId || record.phase !== phase || record.stage !== plan.stage
    || !plainObject(record.binding)
    || Object.entries(expectedBinding).some(([key, value]) => record.binding[key] !== value)
    || typeof record.binding.p7LaunchEnvironmentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.binding.p7LaunchEnvironmentSha256)
    || record.outcome !== "PASS" || typeof record.observation !== "string" || typeof record.at !== "string" || Number.isNaN(Date.parse(record.at)))) throw new ProbeError(code);
}

function exactlyOne(records, predicate, code) {
  const matches = records.filter(predicate);
  if (matches.length !== 1) throw new ProbeError(code);
  return matches[0];
}

function p7PathContainsKnownIdentity(pathname, authorization) {
  const normalized = pathKey(pathname);
  return collectIdentityFragments(authorization).some((fragment) => normalized.includes(fragment));
}

function p7ProtectedRoots(authority) {
  return [
    ...authority.actualWorktrees.map((entry) => entry.path),
    ...authority.roleStaging.map((entry) => entry.path),
    authority.commonGit.path,
    authority.coordinatorScratch.path,
    authority.redactedP12RouteRoot.path,
  ];
}

async function validateP7LaunchRecord(record, authorityState, io, code) {
  const launch = exactKeys(record.launchEnvironment, new Set(["TEMP", "TMP", "TEMPRealpath", "TMPRealpath", "sha256"]), code);
  const expectedLaunch = {
    TEMP: absolutePath(launch.TEMP, code),
    TMP: absolutePath(launch.TMP, code),
    TEMPRealpath: absolutePath(launch.TEMPRealpath, code),
    TMPRealpath: absolutePath(launch.TMPRealpath, code),
  };
  if (digest(launch.sha256, code) !== stableHash(expectedLaunch)
    || record.binding?.p7LaunchEnvironmentSha256 !== launch.sha256) throw new ProbeError(code);
  if (p7PathContainsKnownIdentity(expectedLaunch.TEMP, authorityState.authorization)
    || p7PathContainsKnownIdentity(expectedLaunch.TMP, authorityState.authorization)
    || p7PathContainsKnownIdentity(expectedLaunch.TEMPRealpath, authorityState.authorization)
    || p7PathContainsKnownIdentity(expectedLaunch.TMPRealpath, authorityState.authorization)) throw new ProbeError("P7_LAUNCH_ENVIRONMENT_IDENTITY_LEAK");
  const sentinels = record.sentinels;
  if (!Array.isArray(sentinels) || sentinels.length !== 2) throw new ProbeError(code);
  const byVariable = new Map();
  for (const raw of sentinels) {
    exactKeys(raw, new Set(["environmentVariable", "path", "sha256"]), code);
    const variable = nonemptyString(raw.environmentVariable, code);
    if (!new Set(["TEMP", "TMP"]).has(variable) || byVariable.has(variable)) throw new ProbeError(code);
    const pathname = absolutePath(raw.path, code);
    const contentSha256 = digest(raw.sha256, code);
    const directory = expectedLaunch[variable];
    if (!pathIsWithin(directory, pathname)
      || p7PathContainsKnownIdentity(pathname, authorityState.authorization)
      || p7ProtectedRoots(authorityState.authority).some((root) => pathIsWithin(root, pathname, { allowRoot: true }))) throw new ProbeError("P7_LAUNCH_SENTINEL_IDENTITY_LEAK");
    const physical = await canonicalPath(io, pathname, "P7_LAUNCH_SENTINEL_REALPATH_FAILED");
    if (!samePath(physical, pathname)) throw new ProbeError("P7_LAUNCH_SENTINEL_ALIAS_FORBIDDEN");
    await readVerified(io, { path: pathname, sha256: contentSha256 }, "P7_LAUNCH_SENTINEL");
    byVariable.set(variable, { environmentVariable: variable, path: pathname, sha256: contentSha256 });
  }
  if (!byVariable.has("TEMP") || !byVariable.has("TMP")) throw new ProbeError(code);
  return { launch: { ...expectedLaunch, sha256: launch.sha256 }, sentinels: byVariable };
}

async function validateBootstrapOutput(bytes, plan, inventory, outputRef, authorityState, io) {
  const records = parseJsonl(bytes, "MATRIX_BOOTSTRAP_OUTPUT_INVALID");
  assertObservationBase(records, plan, inventory, "before", "MATRIX_BOOTSTRAP_OUTPUT_IDENTITY_MISMATCH");
  const allowed = new Set(["role-plan-inventory-sha256", "temp-self-sentinel-create-read", "probe-complete"]);
  if (records.length !== 3 || records.some((record) => !allowed.has(record.observation))) throw new ProbeError("MATRIX_BOOTSTRAP_OUTPUT_INVALID");
  exactlyOne(records, (record) => record.observation === "role-plan-inventory-sha256" && record.id === "role-probe-inventory" && record.sha256 === plan.inventory.sha256, "MATRIX_BOOTSTRAP_OUTPUT_INCOMPLETE");
  const sentinel = exactlyOne(records, (record) => record.observation === "temp-self-sentinel-create-read" && record.id === "P-7-own-temp-sentinel" && record.coverage === "P-7", "MATRIX_BOOTSTRAP_OUTPUT_INCOMPLETE");
  exactlyOne(records, (record) => record.observation === "probe-complete" && record.result === "complete", "MATRIX_BOOTSTRAP_OUTPUT_INCOMPLETE");
  const launch = await validateP7LaunchRecord(sentinel, authorityState, io, "MATRIX_BOOTSTRAP_SENTINEL_PATH_INVALID");
  if (records.some((record) => record.binding.p7LaunchEnvironmentSha256 !== launch.launch.sha256)) throw new ProbeError("MATRIX_BOOTSTRAP_LAUNCH_ENVIRONMENT_MISMATCH");
  return { ...launch, outputSha256: outputRef.sha256 };
}

function sourceCommitment(entry, sentinel) {
  return stableHash({
    bootstrapPlanStableJsonSha256: stableHash(entry.plan),
    bootstrapInventorySha256: entry.plan.inventory.sha256,
    bootstrapOutputSha256: entry.output.sha256,
    launchEnvironmentSha256: sentinel.launch.sha256,
    sourcePathSha256: sha256(Buffer.from(pathKey(sentinel.sentinels.get("TEMP").path), "utf8")),
    sourceContentSha256: sentinel.sentinels.get("TEMP").sha256,
    tmpSourcePathSha256: sha256(Buffer.from(pathKey(sentinel.sentinels.get("TMP").path), "utf8")),
    tmpSourceContentSha256: sentinel.sentinels.get("TMP").sha256,
  });
}

/** Coordinator-only: validates bootstrap outputs and emits an opaque challenge. */
export async function executePeerSentinelMatrix(rawPlan, { io = { readFile } } = {}) {
  const plan = parseMatrixPlan(rawPlan);
  const authorityState = await loadCoordinatorAuthority(plan.coordinatorAuthority, io);
  const recipient = authorityState.authority.roleStaging.find((entry) => entry.recipientCommitment === plan.recipient.recipientCommitment);
  if (!recipient) throw new ProbeError("MATRIX_RECIPIENT_MISMATCH");
  const peers = authorityState.authority.roleStaging.filter((entry) => entry.recipientCommitment !== recipient.recipientCommitment);
  if (plan.bootstrapEntries.length !== peers.length) throw new ProbeError("MATRIX_PEER_SET_MISMATCH");
  const entries = [];
  for (const source of plan.bootstrapEntries) {
    const planBytes = await readVerified(io, source.probePlan, "MATRIX_BOOTSTRAP_PLAN");
    const bootstrapPlan = parseProbePlan(parseJson(planBytes, "MATRIX_BOOTSTRAP_PLAN"));
    if (bootstrapPlan.stage !== "bootstrap") throw new ProbeError("MATRIX_BOOTSTRAP_PLAN_STAGE_MISMATCH");
    const inventoryBytes = await readVerified(io, bootstrapPlan.inventory, "MATRIX_BOOTSTRAP_INVENTORY");
    const inventory = parseInventory(parseJson(inventoryBytes, "MATRIX_BOOTSTRAP_INVENTORY"));
    if (inventory.stage !== "bootstrap") throw new ProbeError("MATRIX_BOOTSTRAP_INVENTORY_STAGE_MISMATCH");
    const binding = validateInventoryAgainstAuthority(bootstrapPlan, inventory, authorityState);
    if (!pathIsWithin(binding.role.path, source.probePlan.path)) throw new ProbeError("MATRIX_BOOTSTRAP_PLAN_OUTSIDE_STAGING");
    const physicalRoleStaging = await canonicalPath(io, binding.role.path, "MATRIX_BOOTSTRAP_STAGING_REALPATH_FAILED");
    const physicalPlan = await canonicalPath(io, source.probePlan.path, "MATRIX_BOOTSTRAP_PLAN_REALPATH_FAILED");
    if (!pathIsWithin(physicalRoleStaging, physicalPlan)) throw new ProbeError("MATRIX_BOOTSTRAP_PLAN_REPARSE_ESCAPE");
    if (binding.role.recipientCommitment === recipient.recipientCommitment || !peers.some((peer) => peer.recipientCommitment === binding.role.recipientCommitment)) throw new ProbeError("MATRIX_PEER_SET_MISMATCH");
    const outputBytes = await readVerified(io, source.output, "MATRIX_BOOTSTRAP_OUTPUT");
    const sentinel = await validateBootstrapOutput(outputBytes, bootstrapPlan, inventory, source.output, authorityState, io);
    entries.push({ role: binding.role, plan: bootstrapPlan, output: source.output, sentinel });
  }
  if (new Set(entries.map((entry) => entry.role.recipientCommitment)).size !== peers.length || peers.some((peer) => !entries.some((entry) => entry.role.recipientCommitment === peer.recipientCommitment))) throw new ProbeError("MATRIX_PEER_SET_MISMATCH");
  const committed = entries.map((entry) => ({ ...entry, sourceCommitment: sourceCommitment(entry, entry.sentinel) })).sort((left, right) => left.sourceCommitment.localeCompare(right.sourceCommitment));
  const bootstrapEvidenceSetSha256 = stableHash(committed.map((entry) => entry.sourceCommitment));
  const sentinels = [];
  for (let index = 0; index < committed.length; index += 1) {
    const entry = committed[index];
    const sourceSentinel = entry.sentinel.sentinels.get("TEMP");
    // This is the source role's original absolute TEMP path, never an alias.
    sentinels.push({ id: "P-7-peer-sentinel-" + (index + 1), path: sourceSentinel.path, sha256: sourceSentinel.sha256, sourceCommitment: entry.sourceCommitment });
  }
  const challenge = {
    version: 3,
    kind: CHALLENGE_KIND,
    challengeId: plan.challengeId,
    recipient: { probeId: plan.recipient.probeId, recipientCommitment: plan.recipient.recipientCommitment },
    sentinels,
    provenance: {
      matrixPlanStableJsonSha256: stableHash(rawPlan),
      coordinatorAuthoritySha256: plan.coordinatorAuthority.sha256,
      bootstrapEvidenceSetSha256,
      recipientCommitment: plan.recipient.recipientCommitment,
    },
  };
  return { plan, authorityState, challenge, bootstrapEvidenceSetSha256 };
}

function parseEvidencePlanUnsafe(raw) {
  exactKeys(raw, new Set(["version", "kind", "runner", "coordinatorAuthority", "matrices", "fullRuns"]), "EVIDENCE_PLAN_INVALID");
  if (raw.version !== 5 || raw.kind !== EVIDENCE_PLAN_KIND || !Array.isArray(raw.matrices) || !Array.isArray(raw.fullRuns) || raw.fullRuns.length === 0) throw new ProbeError("EVIDENCE_PLAN_INVALID");
  const matrices = raw.matrices.map((entry) => {
    exactKeys(entry, new Set(["matrixPlan", "challenge"]), "EVIDENCE_PLAN_INVALID");
    return { matrixPlan: fileRef(entry.matrixPlan, "EVIDENCE_PLAN_INVALID"), challenge: fileRef(entry.challenge, "EVIDENCE_PLAN_INVALID") };
  });
  const fullRuns = raw.fullRuns.map((entry) => {
    exactKeys(entry, new Set(["rolePlan", "before", "after"]), "EVIDENCE_PLAN_INVALID");
    return { rolePlan: fileRef(entry.rolePlan, "EVIDENCE_PLAN_INVALID"), before: fileRef(entry.before, "EVIDENCE_PLAN_INVALID"), after: fileRef(entry.after, "EVIDENCE_PLAN_INVALID") };
  });
  return { runner: fileRef(raw.runner, "EVIDENCE_PLAN_INVALID"), coordinatorAuthority: fileRef(raw.coordinatorAuthority, "EVIDENCE_PLAN_INVALID"), matrices, fullRuns };
}

function parseEvidencePlan(raw) {
  try { return parseEvidencePlanUnsafe(raw); }
  catch (error) { throw error instanceof ProbeError ? error : new ProbeError("EVIDENCE_PLAN_INVALID"); }
}

async function validateFullOutput(bytes, plan, inventory, phase, configuration, challenge, authorityState, io) {
  const records = parseJsonl(bytes, "EVIDENCE_FULL_OUTPUT_INVALID");
  assertObservationBase(records, plan, inventory, phase, "EVIDENCE_FULL_OUTPUT_BINDING_MISMATCH");
  const baseBinding = {
    configurationSetSha256: configuration.configurationSetSha256,
    toolSurfaceSha256: configuration.toolSurfaceSha256,
  };
  if (records.some((record) => Object.entries(baseBinding).some(([key, value]) => record.binding[key] !== value))) throw new ProbeError("EVIDENCE_FULL_OUTPUT_CONFIGURATION_MISMATCH");
  const allowed = new Set(["role-plan-inventory-sha256", "runtime-config-sha256", "runtime-config-schema-accepted", "self-control-read", "temp-self-sentinel-create-read", "read-deny-file", "read-deny-directory", "write-open-deny", "p7-peer-sentinel-challenge-sha256", "p7-peer-sentinel-provenance", "temp-peer-sentinel-read-deny", "probe-complete"]);
  if (records.some((record) => !allowed.has(record.observation))) throw new ProbeError("EVIDENCE_FULL_OUTPUT_UNKNOWN_OBSERVATION");
  exactlyOne(records, (record) => record.observation === "role-plan-inventory-sha256" && record.id === "role-probe-inventory" && record.sha256 === plan.inventory.sha256, "EVIDENCE_PLAN_INVENTORY_VALUE_MISMATCH");
  if (records.filter((record) => record.observation === "runtime-config-sha256").length !== inventory.runtimeConfiguration.length) throw new ProbeError("EVIDENCE_RUNTIME_CONFIG_SET_MISMATCH");
  for (const item of inventory.runtimeConfiguration) {
    exactlyOne(records, (record) => record.observation === "runtime-config-sha256" && record.id === item.id && record.sha256 === item.sha256, "EVIDENCE_RUNTIME_CONFIG_VALUE_MISMATCH");
  }
  // A static empty config is deliberately not P-11.  It may establish only
  // that the probe-input schema was parsed.  The explicit P-11 authorization
  // command below remains fail-closed.
  exactlyOne(records, (record) => record.observation === "runtime-config-schema-accepted"
    && record.coverage === "configuration"
    && record.result === "schema-accepted-not-p11"
    && record.configurationSetSha256 === configuration.configurationSetSha256
    && record.toolSurfaceSha256 === configuration.toolSurfaceSha256
    && record.claudeProjectStateSha256 === configuration.claudeProjectStateSha256, "EVIDENCE_P11_VALUE_MISMATCH");
  exactlyOne(records, (record) => record.observation === "self-control-read"
    && record.coverage === "P-9"
    && record.id === inventory.p9SelfControl.id
    && record.sha256 === inventory.p9SelfControl.sha256, "EVIDENCE_P9_VALUE_MISMATCH");
  const selfSentinel = exactlyOne(records, (record) => record.observation === "temp-self-sentinel-create-read"
    && record.id === "P-7-own-temp-sentinel"
    && record.coverage === "P-7", "EVIDENCE_P7_SELF_INCOMPLETE");
  const selfLaunch = await validateP7LaunchRecord(selfSentinel, authorityState, io, "EVIDENCE_P7_SELF_INCOMPLETE");
  if (records.some((record) => record.binding.p7LaunchEnvironmentSha256 !== selfLaunch.launch.sha256)) throw new ProbeError("EVIDENCE_P7_LAUNCH_ENVIRONMENT_MISMATCH");
  const p10Targets = Object.values(inventory.p10.targets);
  const p10FileCount = p10Targets.filter((item) => item.kind === "file").length;
  const p10DirectoryCount = p10Targets.filter((item) => item.kind === "directory").length;
  if (records.filter((record) => record.observation === "read-deny-file" && String(record.coverage).startsWith("P-10-")).length !== p10FileCount
    || records.filter((record) => record.observation === "read-deny-directory" && String(record.coverage).startsWith("P-10-")).length !== p10DirectoryCount) throw new ProbeError("EVIDENCE_P10_SET_MISMATCH");
  for (const target of p10Targets) {
    exactlyOne(records, (record) => record.id === target.id
      && record.coverage === target.id
      && record.result === "denied"
      && ACCESS_DENIED_CODES.has(record.errorCode)
      && record.observation === (target.kind === "file" ? "read-deny-file" : "read-deny-directory"), "EVIDENCE_P10_INCOMPLETE");
  }
  if (records.filter((record) => record.observation === "read-deny-file" && String(record.coverage).startsWith("P-12-")).length !== inventory.p12.targets.length
    || records.filter((record) => record.observation === "write-open-deny" && String(record.coverage).startsWith("P-12-")).length !== inventory.p12.targets.length) throw new ProbeError("EVIDENCE_P12_SET_MISMATCH");
  for (const target of inventory.p12.targets) {
    exactlyOne(records, (record) => record.id === target.read.id && record.coverage === "P-12-" + target.id && record.observation === "read-deny-file" && record.result === "denied" && ACCESS_DENIED_CODES.has(record.errorCode), "EVIDENCE_P12_READ_INCOMPLETE");
    exactlyOne(records, (record) => record.id === target.write.id && record.coverage === "P-12-" + target.id && record.observation === "write-open-deny" && record.result === "denied" && ACCESS_DENIED_CODES.has(record.errorCode), "EVIDENCE_P12_WRITE_INCOMPLETE");
  }
  exactlyOne(records, (record) => record.observation === "p7-peer-sentinel-challenge-sha256"
    && record.id === "P-7-peer-sentinel-challenge"
    && record.sha256 === inventory.p7.peerSentinelChallenge.sha256, "EVIDENCE_P7_CHALLENGE_VALUE_MISMATCH");
  exactlyOne(records, (record) => record.observation === "p7-peer-sentinel-provenance"
    && record.coverage === "P-7"
    && record.challengeId === challenge.challengeId
    && record.matrixPlanStableJsonSha256 === challenge.provenance.matrixPlanStableJsonSha256
    && record.coordinatorAuthoritySha256 === challenge.provenance.coordinatorAuthoritySha256
    && record.bootstrapEvidenceSetSha256 === challenge.provenance.bootstrapEvidenceSetSha256, "EVIDENCE_P7_PROVENANCE_VALUE_MISMATCH");
  if (records.filter((record) => record.observation === "temp-peer-sentinel-read-deny").length !== OPAQUE_SENTINEL_IDS.size) throw new ProbeError("EVIDENCE_P7_PEER_SET_MISMATCH");
  for (const id of OPAQUE_SENTINEL_IDS) exactlyOne(records, (record) => record.observation === "temp-peer-sentinel-read-deny"
    && record.id === id
    && record.coverage === "P-7"
    && record.challengeId === challenge.challengeId
    && record.result === "denied"
    && ACCESS_DENIED_CODES.has(record.errorCode), "EVIDENCE_P7_PEER_INCOMPLETE");
  exactlyOne(records, (record) => record.observation === "probe-complete" && record.result === "complete", "EVIDENCE_FULL_OUTPUT_INCOMPLETE");
  const expectedRecordCount = 1 + inventory.runtimeConfiguration.length + 1 + 1 + 1 + p10Targets.length + (inventory.p12.targets.length * 2) + 1 + 1 + OPAQUE_SENTINEL_IDS.size + 1;
  if (records.length !== expectedRecordCount) throw new ProbeError("EVIDENCE_FULL_OUTPUT_EXTRA_OR_MISSING");
  return records;
}

async function readRolePlan(ref, io) {
  const bytes = await readVerified(io, ref, "EVIDENCE_ROLE_PLAN");
  return { raw: parseJson(bytes, "EVIDENCE_ROLE_PLAN"), plan: parseProbePlan(parseJson(bytes, "EVIDENCE_ROLE_PLAN")) };
}

async function deriveConfigurationCoordinator(plan, inventory, io) {
  const parsed = [];
  for (const item of inventory.runtimeConfiguration) {
    const config = parseRuntimeConfiguration(parseJson(await readVerified(io, item, "EVIDENCE_RUNTIME_CONFIG"), "EVIDENCE_RUNTIME_CONFIG"));
    if (config.context.probeId !== plan.probeId || config.context.stage !== plan.stage || config.context.recipientCommitment !== inventory.recipientCommitment) throw new ProbeError("EVIDENCE_RUNTIME_CONFIG_CONTEXT_MISMATCH");
    parsed.push(config);
  }
  const claudeProjectState = assertClaudeProjectP10Coverage(inventory, parsed, "EVIDENCE_P10_CLAUDE_PROJECT_COVERAGE_MISMATCH");
  return {
    configurationSetSha256: configurationSetHash(inventory.runtimeConfiguration),
    toolSurfaceSha256: stableHash({ mode: "all-disabled", mcpServers: [], connectors: [] }),
    claudeProjectStateSha256: stableHash({ state: claudeProjectState }),
  };
}

async function validateChallengeAgainstMatrix(inventory, plan, expected, io) {
  const bytes = await readVerified(io, inventory.p7.peerSentinelChallenge, "EVIDENCE_P7_CHALLENGE");
  const actualRaw = parseJson(bytes, "EVIDENCE_P7_CHALLENGE");
  const actual = parsePeerSentinelChallenge(actualRaw);
  validateRoleChallenge(actual, plan, inventory);
  if (stableHash(actual) !== stableHash(parsePeerSentinelChallenge(expected.challenge))) throw new ProbeError("EVIDENCE_P7_MATRIX_CHALLENGE_MISMATCH");
  return actual;
}

/**
 * Coordinator-only validator for complete before/after evidence.  No coverage
 * boolean is trusted: every required observation is re-derived and required.
 */
export async function validateProbeEvidence(rawEvidencePlan, { io = { readFile, readdir, open } } = {}) {
  const evidence = parseEvidencePlan(rawEvidencePlan);
  await readVerified(io, evidence.runner, "EVIDENCE_RUNNER");
  const selfSha256 = sha256(await readFile(SELF_PATH));
  if (!samePath(evidence.runner.path, SELF_PATH) || evidence.runner.sha256 !== selfSha256) throw new ProbeError("EVIDENCE_RUNNER_MISMATCH");
  const authorityState = await loadCoordinatorAuthority(evidence.coordinatorAuthority, io);
  const expectedContextCount = authorityState.authority.roleStaging.length;
  if (evidence.matrices.length !== expectedContextCount || evidence.fullRuns.length !== expectedContextCount) throw new ProbeError("EVIDENCE_FULL_CONTEXT_SET_MISMATCH");
  const matrices = new Map();
  for (const item of evidence.matrices) {
    const matrixRaw = parseJson(await readVerified(io, item.matrixPlan, "EVIDENCE_MATRIX_PLAN"), "EVIDENCE_MATRIX_PLAN");
    const matrixPlan = parseMatrixPlan(matrixRaw);
    if (!sameRef(matrixPlan.coordinatorAuthority, evidence.coordinatorAuthority)) throw new ProbeError("EVIDENCE_MATRIX_AUTHORITY_MISMATCH");
    const result = await executePeerSentinelMatrix(matrixRaw, { io });
    const actual = parsePeerSentinelChallenge(parseJson(await readVerified(io, item.challenge, "EVIDENCE_MATRIX_CHALLENGE"), "EVIDENCE_MATRIX_CHALLENGE"));
    if (stableHash(actual) !== stableHash(parsePeerSentinelChallenge(result.challenge))) throw new ProbeError("EVIDENCE_MATRIX_CHALLENGE_MISMATCH");
    const key = result.challenge.recipient.probeId + ":" + result.challenge.recipient.recipientCommitment;
    if (matrices.has(key)) throw new ProbeError("EVIDENCE_DUPLICATE_MATRIX_RECIPIENT");
    matrices.set(key, result);
  }
  if (matrices.size !== expectedContextCount) throw new ProbeError("EVIDENCE_MATRIX_CONTEXT_SET_MISMATCH");
  const summaries = [];
  const observedRecipients = new Set();
  for (const run of evidence.fullRuns) {
    const { plan } = await readRolePlan(run.rolePlan, io);
    if (plan.stage !== "full") throw new ProbeError("EVIDENCE_FULL_PLAN_STAGE_MISMATCH");
    const inventory = parseInventory(parseJson(await readVerified(io, plan.inventory, "EVIDENCE_INVENTORY"), "EVIDENCE_INVENTORY"));
    const role = validateInventoryAgainstAuthority(plan, inventory, authorityState).role;
    if (!pathIsWithin(role.path, run.rolePlan.path)) throw new ProbeError("EVIDENCE_ROLE_PLAN_OUTSIDE_STAGING");
    const physicalRoleStaging = await canonicalPath(io, role.path, "EVIDENCE_ROLE_STAGING_REALPATH_FAILED");
    const physicalPlan = await canonicalPath(io, run.rolePlan.path, "EVIDENCE_ROLE_PLAN_REALPATH_FAILED");
    if (!pathIsWithin(physicalRoleStaging, physicalPlan)) throw new ProbeError("EVIDENCE_ROLE_PLAN_REPARSE_ESCAPE");
    const key = plan.probeId + ":" + inventory.recipientCommitment;
    const matrix = matrices.get(key);
    if (!matrix || role.recipientCommitment !== inventory.recipientCommitment) throw new ProbeError("EVIDENCE_P7_MATRIX_MISSING");
    if (observedRecipients.has(inventory.recipientCommitment)) throw new ProbeError("EVIDENCE_DUPLICATE_FULL_RECIPIENT");
    observedRecipients.add(inventory.recipientCommitment);
    const challenge = await validateChallengeAgainstMatrix(inventory, plan, matrix, io);
    const configuration = await deriveConfigurationCoordinator(plan, inventory, io);
    if (samePath(run.before.path, run.after.path) || run.before.sha256 === run.after.sha256) throw new ProbeError("EVIDENCE_PHASE_ARTIFACT_REUSED");
    const beforeRecords = await validateFullOutput(await readVerified(io, run.before, "EVIDENCE_BEFORE_JSONL"), plan, inventory, "before", configuration, challenge, authorityState, io);
    const afterRecords = await validateFullOutput(await readVerified(io, run.after, "EVIDENCE_AFTER_JSONL"), plan, inventory, "after", configuration, challenge, authorityState, io);
    if (beforeRecords[0].binding.p7LaunchEnvironmentSha256 !== afterRecords[0].binding.p7LaunchEnvironmentSha256) throw new ProbeError("EVIDENCE_P7_LAUNCH_ENVIRONMENT_CHANGED");
    summaries.push({ probeId: plan.probeId, recipientCommitment: inventory.recipientCommitment, beforeSha256: run.before.sha256, afterSha256: run.after.sha256, configurationSetSha256: configuration.configurationSetSha256 });
  }
  if (observedRecipients.size !== expectedContextCount
    || authorityState.authority.roleStaging.some((role) => !observedRecipients.has(role.recipientCommitment))
    || matrices.size !== observedRecipients.size) throw new ProbeError("EVIDENCE_FULL_CONTEXT_SET_MISMATCH");
  // P-7/P-9/P-10/P-12 are finite, mechanically checked observations.  P-11
  // is intentionally excluded: this helper cannot establish a Codex host's
  // actual tool surface merely from a static config or self-authored log.
  return { version: VERSION, kind: "p3-clean-room-probe-evidence-validation-v5", outcome: "PASS", p11Authorization: "NOT_AUTHORIZED", fullRunCount: summaries.length, summaries };
}

/**
 * P-11 is fail-closed in v5.  The current Codex CLI has `--ignore-user-config`
 * and `--ephemeral`, but no machine-readable tool-surface inventory tied to
 * that same launch.  A config file or a prose/transcript assertion therefore
 * cannot authorize a clean room.  Keep this explicit command in the
 * coordinator checklist so a lifecycle cannot silently reinterpret v5's
 * finite probe PASS as P-11 PASS.
 */
export function requireP11Authorization() {
  throw new ProbeError("P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE");
}

async function parseJsonFile(pathname, code) {
  let bytes;
  try { bytes = await readFile(pathname); }
  catch { throw new ProbeError(code + "_READ_FAILED"); }
  return parseJson(bytes, code);
}

async function main() {
  let sequence = 0;
  const emit = (record) => console.log(JSON.stringify({ version: VERSION, type: "p3-clean-room-probe-observation", at: new Date().toISOString(), sequence: ++sequence, ...record }));
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--matrix") {
      const [, matrixPath, outputPath] = args;
      if (args.length !== 3 || !isAbsolute(matrixPath) || !isAbsolute(outputPath)) throw new ProbeError("USAGE");
      const raw = await parseJsonFile(resolve(matrixPath), "MATRIX_PLAN");
      const result = await executePeerSentinelMatrix(raw);
      const output = Buffer.from(JSON.stringify(stable(result.challenge), null, 2) + "\n", "utf8");
      try { await writeFile(resolve(outputPath), output, { flag: "wx", mode: 0o600 }); }
      catch { throw new ProbeError("MATRIX_CHALLENGE_WRITE_FAILED"); }
      emit({ observation: "peer-sentinel-matrix", coverage: "P-7", matrixId: result.plan.matrixId, challengeId: result.challenge.challengeId, challengeSha256: sha256(output), outcome: "PASS", result: "created" });
      return;
    }
    if (args[0] === "--validate-evidence") {
      const [, evidencePath] = args;
      if (args.length !== 2 || !isAbsolute(evidencePath)) throw new ProbeError("USAGE");
      const result = await validateProbeEvidence(await parseJsonFile(resolve(evidencePath), "EVIDENCE_PLAN"));
      emit({ observation: "probe-evidence-validation", coverage: "P-7/P-9/P-10/P-12", p11Authorization: result.p11Authorization, outcome: "PASS", result: "complete", fullRunCount: result.fullRunCount });
      return;
    }
    if (args[0] === "--require-p11-authorization") {
      if (args.length !== 1) throw new ProbeError("USAGE");
      requireP11Authorization();
    }
    const [planPath, phase] = args;
    if (args.length !== 2 || !isAbsolute(planPath)) throw new ProbeError("USAGE");
    const rawPlan = await parseJsonFile(resolve(planPath), "PLAN");
    const parsedPlan = parseProbePlan(rawPlan);
    if (!pathIsWithin(parsedPlan.ownStaging.path, resolve(planPath))) throw new ProbeError("ROLE_PLAN_OUTSIDE_STAGING");
    const physicalStaging = await canonicalPath({ realpath }, parsedPlan.ownStaging.path, "ROLE_STAGING_REALPATH_FAILED");
    const physicalPlan = await canonicalPath({ realpath }, resolve(planPath), "ROLE_PLAN_REALPATH_FAILED");
    if (!samePath(physicalStaging, parsedPlan.ownStaging.path) || !pathIsWithin(physicalStaging, physicalPlan)) throw new ProbeError("ROLE_PLAN_REPARSE_ESCAPE");
    await executeProbe(rawPlan, phase, { observe: emit });
  } catch (error) {
    if (!(error instanceof ProbeError) || !error.reported) emit({ observation: "probe", outcome: "FAIL", result: "rejected", reason: error instanceof ProbeError ? error.code : "UNEXPECTED" });
    process.exitCode = 1;
  }
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) await main();
