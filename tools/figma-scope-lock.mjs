#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const [command, ...args] = process.argv.slice(2);

class ScopeLockError extends Error {}

function fail(message) {
  throw new ScopeLockError(message);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object.");
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(label + " must be a non-empty string.");
  return value.trim();
}

function requireIdentifier(value, label) {
  const normalized = requireString(value, label);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    fail(label + " must use letters, numbers, dot, underscore, or hyphen.");
  }
  return normalized;
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(label + " does not exist: " + filePath);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(label + " is not valid JSON: " + error.message);
  }
}

function jsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, jsonText(value), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelativePath(repoPath, value, label) {
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(label + " must be relative to the repository root.");
  if (/[\*\?\[\]\{\}]/.test(input)) fail(label + " must name one exact file; globs are not allowed.");

  const absolutePath = resolve(repoPath, input);
  const normalized = relative(repoPath, absolutePath).replace(/\\/g, "/");
  if (normalized === "" || normalized === "." || normalized.startsWith("../") || isAbsolute(normalized)) {
    fail(label + " must stay inside the repository root.");
  }
  if (normalized.split("/").includes(".git")) fail(label + " must not point into .git.");
  return normalized;
}

function normalizePathArray(repoPath, value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(label + " must be a non-empty array.");
  const paths = value.map(function (entry, index) {
    return normalizeRelativePath(repoPath, entry, label + "[" + index + "]");
  });
  if (new Set(paths).size !== paths.length) fail(label + " must not contain duplicates.");
  return paths.sort();
}

function assertInside(rootPath, candidatePath, label) {
  const normalizedRoot = resolve(rootPath);
  const normalizedCandidate = resolve(candidatePath);
  const pathFromRoot = relative(normalizedRoot, normalizedCandidate);
  if (pathFromRoot === "" || pathFromRoot.startsWith("../") || isAbsolute(pathFromRoot)) {
    fail(label + " must be inside the repository root.");
  }
  return normalizedCandidate;
}

function runGit(repoPath, gitArgs) {
  const result = spawnSync("git", ["-C", repoPath].concat(gitArgs), {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) fail("git failed to start: " + result.error.message);
  if (result.status !== 0) {
    fail("git " + gitArgs.join(" ") + " failed: " + (result.stderr || result.stdout || "unknown error").trim());
  }
  return result.stdout;
}

function gitRoot(repoPath) {
  const root = runGit(repoPath, ["rev-parse", "--show-toplevel"]).trim();
  if (root === "") fail("git repository root could not be determined.");
  const normalizedRoot = resolve(root);
  if (relative(normalizedRoot, resolve(repoPath)) !== "" || relative(resolve(repoPath), normalizedRoot) !== "") {
    fail("scope.repoPath must be the Git repository root.");
  }
  return normalizedRoot;
}

function gitPathLines(repoPath, gitArgs) {
  const output = runGit(repoPath, gitArgs).trim();
  if (output === "") return [];
  return output.split(/\r?\n/).map(function (entry) {
    return normalizeRelativePath(repoPath, entry, "git changed path");
  });
}

function dirtyPaths(repoPath) {
  const paths = new Set();
  [
    ["diff", "--name-only", "--no-renames"],
    ["diff", "--cached", "--name-only", "--no-renames"],
    ["ls-files", "--others", "--exclude-standard"],
  ].forEach(function (gitArgs) {
    gitPathLines(repoPath, gitArgs).forEach(function (path) {
      paths.add(path);
    });
  });
  return [...paths].sort();
}

function fileHash(repoPath, repoRelativePath) {
  const absolutePath = resolve(repoPath, repoRelativePath);
  if (!existsSync(absolutePath)) return null;
  const stats = lstatSync(absolutePath);
  if (!stats.isFile()) fail("Changed path is not a regular file: " + repoRelativePath);
  return sha256(readFileSync(absolutePath));
}

function dirtySnapshot(repoPath) {
  return dirtyPaths(repoPath).map(function (path) {
    return { path: path, sha256: fileHash(repoPath, path) };
  });
}

function repoPathFromAbsolute(repoPath, absolutePath, label) {
  return normalizeRelativePath(repoPath, relative(repoPath, absolutePath), label);
}

function validateScope(raw, configPath) {
  requireObject(raw, "Scope manifest");
  if (raw.version !== 1) fail("Scope manifest.version must be 1.");

  const repoPath = resolve(requireString(raw.repoPath, "Scope manifest.repoPath"));
  if (!existsSync(repoPath)) fail("Scope manifest.repoPath does not exist: " + repoPath);
  const configAbsolutePath = resolve(configPath);
  assertInside(repoPath, configAbsolutePath, "Scope manifest file");

  const scope = {
    version: 1,
    scopeId: requireIdentifier(raw.scopeId, "Scope manifest.scopeId"),
    task: requireString(raw.task, "Scope manifest.task"),
    ownerInstruction: requireString(raw.ownerInstruction, "Scope manifest.ownerInstruction"),
    repoPath: repoPath,
    allowedPaths: normalizePathArray(repoPath, raw.allowedPaths, "Scope manifest.allowedPaths"),
  };

  gitRoot(scope.repoPath);
  return scope;
}

function validateState(raw, statePath) {
  requireObject(raw, "Scope lock state");
  if (raw.version !== 1 || raw.kind !== "figma-scope-lock-state") {
    fail("Scope lock state has an unsupported version or kind.");
  }

  const scope = validateScope(raw.scope, statePath);
  const stateAbsolutePath = assertInside(scope.repoPath, statePath, "Scope lock state file");
  if (!Array.isArray(raw.baseline)) fail("Scope lock state.baseline must be an array.");

  const baseline = raw.baseline.map(function (entry, index) {
    requireObject(entry, "Scope lock state.baseline[" + index + "]");
    const path = normalizeRelativePath(scope.repoPath, entry.path, "Scope lock state.baseline[" + index + "].path");
    if (entry.sha256 !== null && typeof entry.sha256 !== "string") {
      fail("Scope lock state.baseline[" + index + "].sha256 must be a SHA-256 string or null.");
    }
    return { path: path, sha256: entry.sha256 };
  });
  if (new Set(baseline.map(function (entry) { return entry.path; })).size !== baseline.length) {
    fail("Scope lock state.baseline must not contain duplicate paths.");
  }

  if (!["active", "blocked"].includes(raw.status)) fail("Scope lock state.status must be active or blocked.");
  if (!Array.isArray(raw.history)) fail("Scope lock state.history must be an array.");
  if (!Array.isArray(raw.controlPaths) || raw.controlPaths.length < 2) {
    fail("Scope lock state.controlPaths must contain the manifest and state files.");
  }
  const controlPaths = raw.controlPaths.map(function (entry, index) {
    return normalizeRelativePath(scope.repoPath, entry, "Scope lock state.controlPaths[" + index + "]");
  });
  if (new Set(controlPaths).size !== controlPaths.length) {
    fail("Scope lock state.controlPaths must not contain duplicate paths.");
  }

  return {
    statePath: stateAbsolutePath,
    raw: raw,
    scope: scope,
    baseline: baseline,
    controlPaths: controlPaths,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function loadState(stateInputPath) {
  const raw = readJson(resolve(stateInputPath), "Scope lock state");
  return validateState(raw, resolve(stateInputPath));
}

function saveState(state) {
  writeJson(state.statePath, state.raw);
}

function begin(scopeInputPath, stateInputPath) {
  const scopePath = resolve(scopeInputPath);
  const scope = validateScope(readJson(scopePath, "Scope manifest"), scopePath);
  const statePath = assertInside(scope.repoPath, resolve(stateInputPath), "Scope lock state file");
  if (existsSync(statePath)) fail("Scope lock state already exists and is immutable at begin: " + statePath);

  const controlPaths = [
    repoPathFromAbsolute(scope.repoPath, scopePath, "Scope manifest file"),
    repoPathFromAbsolute(scope.repoPath, statePath, "Scope lock state file"),
  ].sort();

  const state = {
    version: 1,
    kind: "figma-scope-lock-state",
    controlPaths: controlPaths,
    scope: {
      version: scope.version,
      scopeId: scope.scopeId,
      task: scope.task,
      ownerInstruction: scope.ownerInstruction,
      repoPath: scope.repoPath,
      allowedPaths: scope.allowedPaths,
    },
    createdAt: nowIso(),
    status: "active",
    baseline: dirtySnapshot(scope.repoPath),
    history: [
      {
        action: "begin",
        at: nowIso(),
        scopeManifestSha256: sha256(readFileSync(scopePath)),
      },
    ],
  };

  writeJson(statePath, state);
  console.log("PASS scope-lock begin: " + scope.scopeId + " with " + scope.allowedPaths.length + " allowed path(s).");
}

function assertEdit(stateInputPath, inputPaths) {
  if (inputPaths.length === 0) fail("assert requires at least one proposed edit path.");
  const state = loadState(stateInputPath);
  if (state.raw.status !== "active") fail("Scope lock is blocked; do not edit until the owner resolves the scope violation.");

  inputPaths.forEach(function (inputPath, index) {
    const normalized = normalizeRelativePath(state.scope.repoPath, inputPath, "assert path[" + index + "]");
    if (!state.scope.allowedPaths.includes(normalized)) {
      fail("Out-of-scope edit denied: " + normalized + ". Obtain explicit owner approval and amend before editing.");
    }
  });

  console.log("PASS scope-lock assert: all proposed edit path(s) are allowed.");
}

function verify(stateInputPath) {
  const state = loadState(stateInputPath);
  if (state.raw.status !== "active") fail("Scope lock is blocked; do not continue verification or editing.");

  const baselineMap = new Map(state.baseline.map(function (entry) {
    return [entry.path, entry.sha256];
  }));
  const current = dirtySnapshot(state.scope.repoPath);
  const currentMap = new Map(current.map(function (entry) {
    return [entry.path, entry.sha256];
  }));
  const paths = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const observedChanges = [...paths].sort().map(function (path) {
    const beforeSha256 = baselineMap.has(path) ? baselineMap.get(path) : null;
    const afterSha256 = currentMap.has(path) ? currentMap.get(path) : null;
    if (!baselineMap.has(path) || beforeSha256 !== afterSha256) {
      return { path: path, beforeSha256: beforeSha256, afterSha256: afterSha256 };
    }
    return null;
  }).filter(Boolean);

  const controlPathSet = new Set(state.controlPaths);
  const controlChanges = observedChanges.filter(function (entry) {
    return controlPathSet.has(entry.path);
  });
  const sourceChanges = observedChanges.filter(function (entry) {
    return !controlPathSet.has(entry.path);
  });
  const outOfScopePaths = sourceChanges
    .filter(function (entry) { return !state.scope.allowedPaths.includes(entry.path); })
    .map(function (entry) { return entry.path; });

  const result = {
    action: "verify",
    at: nowIso(),
    changedPaths: sourceChanges,
    controlChanges: controlChanges,
    outOfScopePaths: outOfScopePaths,
    result: outOfScopePaths.length === 0 ? "pass" : "fail",
  };
  state.raw.history.push(result);

  if (outOfScopePaths.length > 0) {
    state.raw.status = "blocked";
    state.raw.blocked = {
      at: result.at,
      reason: "out-of-scope-path",
      paths: outOfScopePaths,
    };
    saveState(state);
    fail("Scope violation detected: " + outOfScopePaths.join(", ") + ". The scope is now blocked; do not auto-revert or auto-amend.");
  }

  saveState(state);
  console.log("PASS scope-lock verify: " + observedChanges.length + " changed path(s), all in scope.");
}

function amend(stateInputPath, amendmentInputPath) {
  const state = loadState(stateInputPath);
  if (state.raw.status !== "active") {
    fail("Blocked scope locks cannot be amended. Stop and obtain an owner decision before creating a new scope.");
  }

  const amendmentPath = assertInside(state.scope.repoPath, resolve(amendmentInputPath), "Scope amendment file");
  const raw = readJson(amendmentPath, "Scope amendment");
  requireObject(raw, "Scope amendment");
  if (raw.version !== 1) fail("Scope amendment.version must be 1.");
  if (requireIdentifier(raw.scopeId, "Scope amendment.scopeId") !== state.scope.scopeId) {
    fail("Scope amendment.scopeId must match the active scope.");
  }

  const approval = requireObject(raw.ownerApproval, "Scope amendment.ownerApproval");
  if (requireString(approval.status, "Scope amendment.ownerApproval.status") !== "approved") {
    fail("Scope amendment.ownerApproval.status must be approved.");
  }
  if (requireString(approval.approvedBy, "Scope amendment.ownerApproval.approvedBy") !== "owner") {
    fail("Scope amendment.ownerApproval.approvedBy must be owner.");
  }
  requireString(approval.approvedAt, "Scope amendment.ownerApproval.approvedAt");
  requireString(approval.instruction, "Scope amendment.ownerApproval.instruction");

  const amendmentRepoPath = repoPathFromAbsolute(state.scope.repoPath, amendmentPath, "Scope amendment file");
  const addAllowedPaths = normalizePathArray(state.scope.repoPath, raw.addAllowedPaths, "Scope amendment.addAllowedPaths");
  const additions = addAllowedPaths.filter(function (path) {
    return !state.scope.allowedPaths.includes(path);
  });
  if (additions.length === 0) fail("Scope amendment must add at least one new path.");

  state.raw.scope.allowedPaths = state.scope.allowedPaths.concat(additions).sort();
  if (!state.controlPaths.includes(amendmentRepoPath)) {
    state.raw.controlPaths = state.controlPaths.concat([amendmentRepoPath]).sort();
  }
  state.raw.history.push({
    action: "amend",
    at: nowIso(),
    amendmentSha256: sha256(readFileSync(amendmentPath)),
    addedPaths: additions,
    ownerApproval: {
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      instruction: approval.instruction,
    },
  });
  saveState(state);
  console.log("PASS scope-lock amend: " + additions.length + " path(s) added after explicit owner approval.");
}

function showStatus(stateInputPath) {
  const state = loadState(stateInputPath);
  console.log(JSON.stringify({
    scopeId: state.scope.scopeId,
    status: state.raw.status,
    allowedPaths: state.raw.scope.allowedPaths,
    latest: state.raw.history[state.raw.history.length - 1] || null,
  }, null, 2));
}

function usage() {
  console.error("Usage:");
  console.error("  node figma-scope-lock.mjs begin <scope.json> <state.json>");
  console.error("  node figma-scope-lock.mjs assert <state.json> <relative-path> [relative-path...]");
  console.error("  node figma-scope-lock.mjs verify <state.json>");
  console.error("  node figma-scope-lock.mjs amend <state.json> <amendment.json>");
  console.error("  node figma-scope-lock.mjs status <state.json>");
}

try {
  if (command === "begin" && args.length === 2) {
    begin(args[0], args[1]);
  } else if (command === "assert" && args.length >= 2) {
    assertEdit(args[0], args.slice(1));
  } else if (command === "verify" && args.length === 1) {
    verify(args[0]);
  } else if (command === "amend" && args.length === 2) {
    amend(args[0], args[1]);
  } else if (command === "status" && args.length === 1) {
    showStatus(args[0]);
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error("ERROR scope-lock: " + error.message);
  process.exitCode = 1;
}