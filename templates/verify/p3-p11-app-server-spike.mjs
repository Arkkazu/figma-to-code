#!/usr/bin/env node
// P-11 App Server feasibility spike.
//
// This is coordinator-only evidence collection.  It deliberately has no
// authorization decision path: every completed report says NOT_AUTHORIZED.
// It neither imports nor is imported by the P-3 runtime core.

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { open, readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRANSPORT_CAPTURE_VERSION,
  TransportCaptureError,
  startAppServerCapture,
  transportLaunchMatchesPrelaunch,
} from "./p3-p11-app-server-transport-capture.mjs";
import { P11_PROCESS_TREE_VERSION, P11ProcessTreeError, terminateWindowsProcessTree } from "./p3-p11-process-tree.mjs";

export const P11_APP_SERVER_SPIKE_VERSION = 1;
export const P11_APP_SERVER_SPIKE_KIND = "p3-p11-app-server-spike-v1";
export const P11_APP_SERVER_SPIKE_DEFAULT_OVERALL_TIMEOUT_MS = 360000;
const SELF_PATH = fileURLToPath(import.meta.url);
const CAPTURE_PATH = fileURLToPath(new URL("./p3-p11-app-server-transport-capture.mjs", import.meta.url));
const PROCESS_TREE_PATH = fileURLToPath(new URL("./p3-p11-process-tree.mjs", import.meta.url));
const PROCESS_TREE_CLEANUP_TIMEOUT_MS = 10000;
const WORKER_STDIO_LIMIT_BYTES = 65536;
// This helper lives at <repo>/templates/verify.  Derive the protected source
// root from its own immutable module path, never from the caller's cwd.
const TEMPLATE_REPO_ROOT = resolve(dirname(SELF_PATH), "..", "..");
const SAFE_TURN_INPUT = "P-11 feasibility observation only. Return exactly P11_FEASIBILITY_NOOP. Do not use tools, read files, or make changes.";
const ORIGIN_STATES = new Set(["present", "absent", "unobservable"]);
const RAW_INVENTORY_METHODS = new Set(["mcpServerStatus/list", "app/installed", "app/list"]);
const PLUGIN_APP_ORIGINS = new Set(["plugin", "plugin-app", "app"]);
// The feasibility spike deliberately accepts only these explicit response
// fields.  It does not recursively search arbitrary JSON for lookalikes.
const RAW_FIELD_PATHS = Object.freeze({
  inventoryThread: Object.freeze([["threadId"], ["thread", "id"], ["context", "threadId"]]),
  threadStart: Object.freeze([["thread", "id"], ["threadId"]]),
  turnThread: Object.freeze([["threadId"], ["turn", "threadId"], ["turn", "thread", "id"]]),
  inventorySnapshot: Object.freeze([["snapshotId"], ["snapshot", "id"], ["toolSurfaceSnapshotId"]]),
  turnSnapshot: Object.freeze([["snapshotId"], ["turn", "snapshotId"], ["turn", "snapshot", "id"], ["turn", "toolSurfaceSnapshotId"]]),
  processInstance: Object.freeze([["processInstanceId"], ["serverProcessInstanceId"], ["server", "processInstanceId"], ["process", "instanceId"]]),
  entryOrigin: Object.freeze([["origin"], ["toolOrigin"]]),
  entryEnabled: Object.freeze([["enabled"], ["isEnabled"]]),
  entryCallable: Object.freeze([["callable"], ["isCallable"]]),
  installedEnabled: Object.freeze([["enabled"]]),
  installedCallable: Object.freeze([["callable"]]),
  appListEnabled: Object.freeze([["isEnabled"]]),
  appListAccessible: Object.freeze([["isAccessible"]]),
  entryName: Object.freeze([["name"]]),
  appName: Object.freeze([["id"], ["runtimeName"], ["name"]]),
  appId: Object.freeze([["id"]]),
  appDisplayName: Object.freeze([["runtimeName"], ["name"]]),
  projectName: Object.freeze([["id"], ["name"]]),
});

export class P11SpikeError extends Error {
  constructor(code, detail = null) {
    super(code);
    this.code = code;
    this.detail = detail;
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

function exactKeys(value, allowed, code = "SPIKE_PLAN_INVALID") {
  if (!plainObject(value)) throw new P11SpikeError(code);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new P11SpikeError(code);
  return value;
}

function nonemptyString(value, code = "SPIKE_PLAN_INVALID") {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new P11SpikeError(code);
  return value.trim();
}

function identifier(value, code = "SPIKE_PLAN_INVALID") {
  value = nonemptyString(value, code);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value)) throw new P11SpikeError(code);
  return value;
}

function absolutePath(value, code = "SPIKE_PLAN_INVALID") {
  value = nonemptyString(value, code);
  if (!isAbsolute(value)) throw new P11SpikeError(code);
  return resolve(value);
}

function pathKey(pathname) {
  const normalized = resolve(pathname).replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin" ? normalized.toLowerCase() : normalized;
}

function pathIsWithin(root, pathname, { allowRoot = false } = {}) {
  const relation = relative(resolve(root), resolve(pathname));
  if (relation === "") return allowRoot;
  return !relation.startsWith("..") && !isAbsolute(relation);
}

function samePath(left, right) {
  return pathKey(left) === pathKey(right);
}

function pathsOverlap(left, right) {
  return pathIsWithin(left, right, { allowRoot: true }) || pathIsWithin(right, left, { allowRoot: true });
}

function safeError(error) {
  if (error instanceof P11SpikeError || error instanceof TransportCaptureError) return { code: error.code, detail: error.detail ?? null };
  return { code: "SPIKE_UNEXPECTED", detail: null };
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function arrayOfIdentifiers(value, code) {
  if (!Array.isArray(value) || value.length === 0) throw new P11SpikeError(code);
  const result = value.map((item) => identifier(item, code));
  if (new Set(result).size !== result.length) throw new P11SpikeError(code);
  return result;
}

function parseCodeHome(value, code) {
  exactKeys(value, new Set(["path", "profile"]), code);
  const profile = nonemptyString(value.profile, code);
  if (profile !== "real-profile" && profile !== "disposable-profile") throw new P11SpikeError(code);
  return { path: absolutePath(value.path, code), profile };
}

function parseForbiddenRoots(value, code = "SPIKE_PLAN_INVALID") {
  exactKeys(value, new Set(["sourceRoot", "actualWorktrees", "commonGit", "pairLock", "fixedLedger", "figmaGate"]), code);
  if (!Array.isArray(value.actualWorktrees) || value.actualWorktrees.length !== 2) throw new P11SpikeError(code);
  const actualWorktrees = value.actualWorktrees.map((item) => absolutePath(item, code));
  if (samePath(actualWorktrees[0], actualWorktrees[1])) throw new P11SpikeError(code);
  const result = {
    sourceRoot: absolutePath(value.sourceRoot, code),
    actualWorktrees,
    commonGit: absolutePath(value.commonGit, code),
    pairLock: absolutePath(value.pairLock, code),
    fixedLedger: absolutePath(value.fixedLedger, code),
    figmaGate: absolutePath(value.figmaGate, code),
  };
  return result;
}

function parseLaunch(value, code = "SPIKE_PLAN_INVALID") {
  exactKeys(value, new Set(["id", "executable", "args", "versionArgs", "cwd", "codeHome", "sandboxProfile", "model"]), code);
  const args = value.args;
  const versionArgs = value.versionArgs;
  if (!Array.isArray(args) || !Array.isArray(versionArgs) || args.some((item) => typeof item !== "string" || item.includes("\0")) || versionArgs.some((item) => typeof item !== "string" || item.includes("\0"))) throw new P11SpikeError(code);
  if (args.length > 32 || versionArgs.length === 0 || versionArgs.length > 8) throw new P11SpikeError(code);
  return {
    id: identifier(value.id, code),
    executable: absolutePath(value.executable, code),
    args: [...args],
    versionArgs: [...versionArgs],
    cwd: absolutePath(value.cwd, code),
    codeHome: parseCodeHome(value.codeHome, code),
    sandboxProfile: nonemptyString(value.sandboxProfile, code),
    model: value.model === undefined ? null : nonemptyString(value.model, code),
  };
}

function parsePlanUnsafe(raw) {
  exactKeys(raw, new Set(["version", "kind", "coordinatorOnly", "coordinatorScratchRoot", "coordinatorOutputRoot", "outputRoot", "forbiddenRoots", "timeoutMs", "overallTimeoutMs", "catalog", "candidate", "controls"]));
  if (raw.version !== P11_APP_SERVER_SPIKE_VERSION || raw.kind !== P11_APP_SERVER_SPIKE_KIND || raw.coordinatorOnly !== true) throw new P11SpikeError("SPIKE_PLAN_INVALID");
  const timeoutMs = raw.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new P11SpikeError("SPIKE_PLAN_INVALID");
  const overallTimeoutMs = raw.overallTimeoutMs === undefined ? P11_APP_SERVER_SPIKE_DEFAULT_OVERALL_TIMEOUT_MS : raw.overallTimeoutMs;
  if (!Number.isInteger(overallTimeoutMs) || overallTimeoutMs < 1000 || overallTimeoutMs > 600000) throw new P11SpikeError("SPIKE_PLAN_INVALID");
  exactKeys(raw.catalog, new Set(["mcpServers", "pluginApps", "projectStates"]));
  const catalog = {
    mcpServers: arrayOfIdentifiers(raw.catalog.mcpServers, "SPIKE_PLAN_INVALID"),
    pluginApps: arrayOfIdentifiers(raw.catalog.pluginApps, "SPIKE_PLAN_INVALID"),
    projectStates: arrayOfIdentifiers(raw.catalog.projectStates, "SPIKE_PLAN_INVALID"),
  };
  exactKeys(raw.candidate, new Set(["launch"]));
  const candidate = { launch: parseLaunch(raw.candidate.launch) };
  exactKeys(raw.controls, new Set(["negativeToolName", "mcp", "pluginApp", "projectState"]));
  exactKeys(raw.controls.mcp, new Set(["launch", "healthServerName", "healthToolName"]));
  exactKeys(raw.controls.pluginApp, new Set(["launch", "expectedAppId"]));
  exactKeys(raw.controls.projectState, new Set(["trusted", "untrusted", "observable"]));
  exactKeys(raw.controls.projectState.observable, new Set(["origin", "name"]));
  const observableOrigin = nonemptyString(raw.controls.projectState.observable.origin);
  if (observableOrigin !== "mcp" && observableOrigin !== "app") throw new P11SpikeError("SPIKE_PLAN_INVALID");
  const controls = {
    negativeToolName: identifier(raw.controls.negativeToolName),
    mcp: {
      launch: parseLaunch(raw.controls.mcp.launch),
      healthServerName: identifier(raw.controls.mcp.healthServerName),
      healthToolName: identifier(raw.controls.mcp.healthToolName),
    },
    pluginApp: { launch: parseLaunch(raw.controls.pluginApp.launch), expectedAppId: identifier(raw.controls.pluginApp.expectedAppId) },
    projectState: {
      trusted: parseLaunch(raw.controls.projectState.trusted),
      untrusted: parseLaunch(raw.controls.projectState.untrusted),
      observable: { origin: observableOrigin, name: identifier(raw.controls.projectState.observable.name) },
    },
  };
  const launchIds = [candidate.launch, controls.mcp.launch, controls.pluginApp.launch, controls.projectState.trusted, controls.projectState.untrusted].map((item) => item.id);
  if (new Set(launchIds).size !== launchIds.length) throw new P11SpikeError("SPIKE_PLAN_DUPLICATE_LAUNCH_ID");
  const coordinatorScratchRoot = absolutePath(raw.coordinatorScratchRoot);
  const coordinatorOutputRoot = absolutePath(raw.coordinatorOutputRoot);
  const outputRoot = absolutePath(raw.outputRoot);
  const forbiddenRoots = parseForbiddenRoots(raw.forbiddenRoots);
  if (pathsOverlap(coordinatorScratchRoot, coordinatorOutputRoot)) throw new P11SpikeError("SPIKE_COORDINATOR_ROOTS_OVERLAP");
  if (!pathIsWithin(coordinatorOutputRoot, outputRoot, { allowRoot: false })) throw new P11SpikeError("SPIKE_OUTPUT_ROOT_NOT_UNDER_COORDINATOR_OUTPUT");
  const forbidden = new Set([".git", ".figma-gate", "mybrain"]);
  if (outputRoot.split(/[\\/]+/).some((part) => forbidden.has(part.toLowerCase()))) throw new P11SpikeError("SPIKE_OUTPUT_ROOT_FORBIDDEN");
  if (pathsOverlap(outputRoot, forbiddenRoots.sourceRoot)) throw new P11SpikeError("SPIKE_OUTPUT_ROOT_IN_SOURCE_TREE");
  const protectedPaths = [forbiddenRoots.sourceRoot, ...forbiddenRoots.actualWorktrees, forbiddenRoots.commonGit, forbiddenRoots.pairLock, forbiddenRoots.fixedLedger, forbiddenRoots.figmaGate];
  const launchValues = [candidate.launch, controls.mcp.launch, controls.pluginApp.launch, controls.projectState.trusted, controls.projectState.untrusted];
  for (const pathname of [coordinatorScratchRoot, coordinatorOutputRoot, outputRoot]) {
    if (protectedPaths.some((protectedPath) => pathsOverlap(pathname, protectedPath))) throw new P11SpikeError("SPIKE_COORDINATOR_PATH_OVERLAPS_FORBIDDEN_ROOT");
  }
  for (const launch of launchValues) {
    if (launch.sandboxProfile !== "read-only") throw new P11SpikeError("SPIKE_SANDBOX_PROFILE_NOT_READ_ONLY");
    if (!pathIsWithin(coordinatorScratchRoot, launch.cwd, { allowRoot: true })) throw new P11SpikeError("SPIKE_LAUNCH_CWD_OUTSIDE_COORDINATOR_SCRATCH");
    if (protectedPaths.some((protectedPath) => pathsOverlap(launch.cwd, protectedPath))) throw new P11SpikeError("SPIKE_LAUNCH_CWD_OVERLAPS_FORBIDDEN_ROOT");
    if (pathsOverlap(launch.codeHome.path, outputRoot)) throw new P11SpikeError("SPIKE_CODEX_HOME_OVERLAPS_OUTPUT_ROOT");
  }
  return { version: P11_APP_SERVER_SPIKE_VERSION, kind: P11_APP_SERVER_SPIKE_KIND, coordinatorOnly: true, coordinatorScratchRoot, coordinatorOutputRoot, outputRoot, forbiddenRoots, timeoutMs, overallTimeoutMs, catalog, candidate, controls };
}

export function parseP11AppServerSpikePlan(raw) {
  try { return parsePlanUnsafe(raw); }
  catch (error) { throw error instanceof P11SpikeError ? error : new P11SpikeError("SPIKE_PLAN_INVALID"); }
}

async function writeExclusive(pathname, bytes, openFile = open) {
  const handle = await openFile(pathname, "wx", 0o600);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const result = await handle.write(bytes, offset, bytes.byteLength - offset, null);
      if (!result || !Number.isInteger(result.bytesWritten) || result.bytesWritten <= 0) throw new P11SpikeError("SPIKE_ARTIFACT_WRITE_FAILED");
      offset += result.bytesWritten;
    }
  } finally { await handle.close(); }
}

async function writeJsonExclusive(pathname, value, openFile = open) {
  const bytes = Buffer.from(JSON.stringify(stable(value), null, 2) + "\n", "utf8");
  await writeExclusive(pathname, bytes, openFile);
  return { path: pathname, sha256: sha256(bytes), bytes: bytes.byteLength };
}

async function sha256File(pathname, readFileFn = readFile) {
  return sha256(await readFileFn(pathname));
}

async function validateOutputRoot(plan, { statFn = stat, readdirFn = readdir, realpathFn = realpath } = {}) {
  const outputRoot = plan.outputRoot;
  let info;
  try { info = await statFn(outputRoot); }
  catch { throw new P11SpikeError("SPIKE_OUTPUT_ROOT_MISSING"); }
  if (!info.isDirectory()) throw new P11SpikeError("SPIKE_OUTPUT_ROOT_NOT_DIRECTORY");
  const physical = await realpathFn(outputRoot);
  if (pathKey(physical) !== pathKey(outputRoot)) throw new P11SpikeError("SPIKE_OUTPUT_ROOT_REPARSE");
  const entries = await readdirFn(outputRoot);
  if (entries.length !== 0) throw new P11SpikeError("SPIKE_OUTPUT_ROOT_NOT_EMPTY");
  for (const [label, pathname] of [["scratch", plan.coordinatorScratchRoot], ["output", plan.coordinatorOutputRoot]]) {
    let rootInfo;
    try { rootInfo = await statFn(pathname); }
    catch { throw new P11SpikeError("SPIKE_COORDINATOR_" + label.toUpperCase() + "_ROOT_MISSING"); }
    if (!rootInfo.isDirectory()) throw new P11SpikeError("SPIKE_COORDINATOR_" + label.toUpperCase() + "_ROOT_NOT_DIRECTORY");
    const physicalRoot = await realpathFn(pathname);
    if (pathKey(physicalRoot) !== pathKey(pathname)) throw new P11SpikeError("SPIKE_COORDINATOR_" + label.toUpperCase() + "_ROOT_REPARSE");
  }
  const physicalScratch = await realpathFn(plan.coordinatorScratchRoot);
  const physicalCoordinatorOutput = await realpathFn(plan.coordinatorOutputRoot);
  const physicalTemplateRepoRoot = await realpathFn(TEMPLATE_REPO_ROOT);
  let physicalPlanSourceRoot;
  try { physicalPlanSourceRoot = await realpathFn(plan.forbiddenRoots.sourceRoot); }
  catch { throw new P11SpikeError("SPIKE_FORBIDDEN_SOURCE_ROOT_MISSING"); }
  if (!samePath(physicalPlanSourceRoot, physicalTemplateRepoRoot)) throw new P11SpikeError("SPIKE_FORBIDDEN_SOURCE_ROOT_MISMATCH");
  const protectedLexical = [plan.forbiddenRoots.sourceRoot, ...plan.forbiddenRoots.actualWorktrees, plan.forbiddenRoots.commonGit, plan.forbiddenRoots.pairLock, plan.forbiddenRoots.fixedLedger, plan.forbiddenRoots.figmaGate];
  const protectedPhysical = [];
  for (const pathname of protectedLexical) {
    try { protectedPhysical.push(await realpathFn(pathname)); }
    catch {
      // Pair/ledger paths can legitimately be planned but absent.  Their
      // lexical containment was already checked during plan parsing; only
      // existing paths add a reparse-resistant physical check here.
    }
  }
  const physicalCoordinatorRoots = [physicalScratch, physicalCoordinatorOutput, physical];
  if (physicalCoordinatorRoots.some((pathname) => protectedPhysical.some((protectedPath) => pathsOverlap(pathname, protectedPath)))) throw new P11SpikeError("SPIKE_COORDINATOR_PATH_REPARSE_OVERLAPS_FORBIDDEN_ROOT");
  const launchValues = [plan.candidate.launch, plan.controls.mcp.launch, plan.controls.pluginApp.launch, plan.controls.projectState.trusted, plan.controls.projectState.untrusted];
  for (const launch of launchValues) {
    let cwdInfo;
    try { cwdInfo = await statFn(launch.cwd); }
    catch { throw new P11SpikeError("SPIKE_LAUNCH_CWD_MISSING"); }
    if (!cwdInfo.isDirectory()) throw new P11SpikeError("SPIKE_LAUNCH_CWD_NOT_DIRECTORY");
    const physicalCwd = await realpathFn(launch.cwd);
    if (!pathIsWithin(physicalScratch, physicalCwd, { allowRoot: true })) throw new P11SpikeError("SPIKE_LAUNCH_CWD_REPARSE_ESCAPE");
    if (protectedPhysical.some((protectedPath) => pathsOverlap(physicalCwd, protectedPath))) throw new P11SpikeError("SPIKE_LAUNCH_CWD_REPARSE_OVERLAPS_FORBIDDEN_ROOT");
  }
  return {
    outputRoot: { lexical: outputRoot, physical },
    coordinatorScratchRoot: { lexical: plan.coordinatorScratchRoot, physical: physicalScratch },
    coordinatorOutputRoot: { lexical: plan.coordinatorOutputRoot, physical: physicalCoordinatorOutput },
  };
}

function artifactPaths(outputRoot, launchId) {
  const leaf = "p3-p11-" + launchId;
  return {
    prelaunch: resolve(outputRoot, leaf + "-prelaunch.json"),
    rawStdin: resolve(outputRoot, leaf + "-stdin.raw.jsonl"),
    rawStdout: resolve(outputRoot, leaf + "-stdout.raw.jsonl"),
    rawStderr: resolve(outputRoot, leaf + "-stderr.raw.bin"),
  };
}

function assertArtifactsWithin(outputRoot, artifacts) {
  for (const pathname of Object.values(artifacts)) if (!pathIsWithin(outputRoot, pathname)) throw new P11SpikeError("SPIKE_ARTIFACT_PATH_ESCAPE");
}

function processTreeErrorDetail(error) {
  if (error instanceof P11ProcessTreeError) return { code: error.code, detail: error.detail ?? null };
  return { code: "PROCESS_TREE_UNEXPECTED", detail: null };
}

function observeVersionChildClose(child) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };
    child.once("close", (code, signal) => finish(() => resolvePromise({ code, signal })));
    child.once("error", (error) => finish(() => reject(new P11SpikeError("SPIKE_VERSION_PROCESS_ERROR", typeof error?.code === "string" ? error.code : null))));
  });
}

function waitForVersionChildClose(closePromise, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new P11SpikeError("SPIKE_PROCESS_TREE_CLEANUP_FAILED", { close: "TIMEOUT" }))), timeoutMs);
    closePromise.then(
      (result) => finish(() => resolvePromise(result)),
      (error) => finish(() => reject(error)),
    );
  });
}

function versionCommand({ executable, versionArgs, cwd, codeHome }, { spawnFn = spawn, timeoutMs = 10000, terminateProcessTreeFn = terminateWindowsProcessTree } = {}) {
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawnFn(executable, versionArgs, { cwd, env: { ...process.env, CODEX_HOME: codeHome.path }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      reject(new P11SpikeError("SPIKE_VERSION_SPAWN_FAILED", typeof error?.code === "string" ? error.code : null));
      return;
    }
    const stdout = [];
    const stderr = [];
    let done = false;
    const finish = (callback) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback();
    };
    const close = observeVersionChildClose(child);
    close.catch(() => {});
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      void (async () => {
        const cleanupTimeoutMs = Math.min(Math.max(timeoutMs, 1000), 10000);
        let processTreeCleanup;
        try {
          processTreeCleanup = await terminateProcessTreeFn(child.pid, { timeoutMs: cleanupTimeoutMs });
        } catch (error) {
          reject(new P11SpikeError("SPIKE_PROCESS_TREE_CLEANUP_FAILED", { cleanup: processTreeErrorDetail(error) }));
          return;
        }
        if (!processTreeCleanup.requested) {
          reject(new P11SpikeError("SPIKE_PROCESS_TREE_CLEANUP_FAILED", { processTreeCleanup }));
          return;
        }
        try {
          await waitForVersionChildClose(close, cleanupTimeoutMs);
          reject(new P11SpikeError("SPIKE_VERSION_TIMEOUT", { processTreeCleanup }));
        } catch (error) {
          reject(new P11SpikeError("SPIKE_PROCESS_TREE_CLEANUP_FAILED", { processTreeCleanup, close: safeError(error) }));
        }
      })();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", (error) => finish(() => reject(new P11SpikeError("SPIKE_VERSION_PROCESS_ERROR", typeof error?.code === "string" ? error.code : null))));
    child.once("close", (code, signal) => finish(() => {
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      if (code !== 0 || signal !== null || out.byteLength > 32768 || err.byteLength > 32768) {
        reject(new P11SpikeError("SPIKE_VERSION_COMMAND_FAILED", { code, signal }));
        return;
      }
      resolvePromise({ text: out.toString("utf8").trim(), stdoutSha256: sha256(out), stderrSha256: sha256(err) });
    }));
  });
}

async function buildPrelaunchRecord(plan, launch, artifacts, { readFileFn = readFile, spawnFn = spawn, now = () => new Date().toISOString(), terminateProcessTreeFn = terminateWindowsProcessTree } = {}) {
  const [coordinatorSha256, captureSha256, processTreeSha256, appServerSha256, version] = await Promise.all([
    sha256File(SELF_PATH, readFileFn),
    sha256File(CAPTURE_PATH, readFileFn),
    sha256File(PROCESS_TREE_PATH, readFileFn),
    sha256File(launch.executable, readFileFn),
    versionCommand(launch, { spawnFn, timeoutMs: Math.min(plan.timeoutMs, 10000), terminateProcessTreeFn }),
  ]);
  return {
    version: 1,
    kind: "p3-p11-app-server-spike-prelaunch-v1",
    feasibilityOnly: true,
    p11Authorization: "NOT_AUTHORIZED",
    recordedAt: now(),
    planStableJsonSha256: stableHash(plan),
    launchId: launch.id,
    coordinator: { path: SELF_PATH, sha256: coordinatorSha256 },
    // The coordinator is the fixed runner implementation.  It is separate
    // from both the transport capture layer and the App Server binary.
    runner: { path: SELF_PATH, sha256: coordinatorSha256 },
    transportCapture: { path: CAPTURE_PATH, sha256: captureSha256, version: TRANSPORT_CAPTURE_VERSION },
    processTreeCleanup: { path: PROCESS_TREE_PATH, sha256: processTreeSha256, version: P11_PROCESS_TREE_VERSION },
    appServer: {
      executable: launch.executable,
      sha256: appServerSha256,
      version,
      args: [...launch.args],
      cwd: launch.cwd,
      codeHome: { path: launch.codeHome.path, profile: launch.codeHome.profile },
      sandboxProfile: launch.sandboxProfile,
      model: launch.model,
    },
    rawTransportPaths: { stdin: artifacts.rawStdin, stdout: artifacts.rawStdout, stderr: artifacts.rawStderr },
    limitations: {
      timeSource: "coordinator clock; not a trusted time source",
      pid: "PID is only a weak process-identity indicator",
    },
  };
}

function expectedCaptureLaunch(prelaunch) {
  return {
    executable: prelaunch.appServer.executable,
    args: prelaunch.appServer.args,
    cwd: prelaunch.appServer.cwd,
    codeHome: prelaunch.appServer.codeHome.path,
    codeHomeProfile: prelaunch.appServer.codeHome.profile,
    sandboxProfile: prelaunch.appServer.sandboxProfile,
    model: prelaunch.appServer.model,
  };
}

function responseThread(value) {
  if (!plainObject(value) || !plainObject(value.thread)) throw new P11SpikeError("SPIKE_THREAD_START_SCHEMA_INVALID");
  const id = nonemptyString(value.thread.id, "SPIKE_THREAD_START_SCHEMA_INVALID");
  const sessionId = nonemptyString(value.thread.sessionId ?? id, "SPIKE_THREAD_START_SCHEMA_INVALID");
  return { id, sessionId };
}

function responseTurn(value) {
  if (!plainObject(value) || !plainObject(value.turn)) throw new P11SpikeError("SPIKE_TURN_START_SCHEMA_INVALID");
  return { id: nonemptyString(value.turn.id, "SPIKE_TURN_START_SCHEMA_INVALID") };
}

function resultDataPage(value, code) {
  if (!plainObject(value) || !Array.isArray(value.data) || !Object.prototype.hasOwnProperty.call(value, "nextCursor")) throw new P11SpikeError(code);
  const nextCursor = value.nextCursor;
  if (nextCursor !== null && (typeof nextCursor !== "string" || !nextCursor)) throw new P11SpikeError(code);
  return { data: value.data, nextCursor };
}

async function collectPaged(transport, method, params, code) {
  const pages = [];
  const usedInputCursors = new Set();
  let cursor = null;
  let index = 0;
  while (true) {
    const cursorKey = cursor === null ? "<null>" : cursor;
    if (usedInputCursors.has(cursorKey)) throw new P11SpikeError(code + "_CURSOR_REPEATED");
    usedInputCursors.add(cursorKey);
    const { result, wire } = await transport.request(method, { ...params, cursor, limit: 50 });
    const page = resultDataPage(result, code + "_SCHEMA_INVALID");
    pages.push({ index: ++index, cursor, nextCursor: page.nextCursor, responseStableJsonSha256: stableHash(result), wireSha256: wire.wireSha256, data: page.data });
    if (page.nextCursor === null) break;
    if (usedInputCursors.has(page.nextCursor)) throw new P11SpikeError(code + "_NEXT_CURSOR_REPEATED");
    cursor = page.nextCursor;
    if (pages.length > 100) throw new P11SpikeError(code + "_PAGE_LIMIT");
  }
  return {
    pages,
    terminal: pages.at(-1)?.nextCursor === null,
    pageOrderStableJsonSha256: stableHash(pages.map((page) => ({ index: page.index, cursor: page.cursor, nextCursor: page.nextCursor, responseStableJsonSha256: page.responseStableJsonSha256 }))),
  };
}

function collectMcpNames(pages) {
  const names = new Set();
  for (const page of pages) for (const entry of page.data) {
    if (!plainObject(entry)) continue;
    const server = typeof entry.name === "string" ? entry.name : (typeof entry.id === "string" ? entry.id : null);
    if (server) names.add(server);
    if (Array.isArray(entry.tools)) for (const tool of entry.tools) {
      const toolName = plainObject(tool) && typeof tool.name === "string" ? tool.name : null;
      if (server && toolName) names.add(server + "::" + toolName);
    }
  }
  return [...names].sort();
}

function collectAppNames(installed, appPages) {
  const names = new Set();
  for (const app of installed) {
    if (!plainObject(app)) continue;
    for (const key of ["id", "runtimeName"]) if (typeof app[key] === "string" && app[key]) names.add(app[key]);
  }
  for (const page of appPages) for (const app of page.data) {
    if (!plainObject(app)) continue;
    for (const key of ["id", "name"]) if (typeof app[key] === "string" && app[key]) names.add(app[key]);
  }
  return [...names].sort();
}

async function collectThreadInventory(transport, threadId) {
  const [mcp, installedResponse, apps] = await Promise.all([
    collectPaged(transport, "mcpServerStatus/list", { threadId, detail: "full" }, "SPIKE_MCP_PAGINATION"),
    transport.request("app/installed", { threadId, forceRefresh: true }),
    collectPaged(transport, "app/list", { threadId, forceRefetch: true }, "SPIKE_APP_PAGINATION"),
  ]);
  const installedResult = installedResponse.result;
  if (!plainObject(installedResult) || !Array.isArray(installedResult.apps)) throw new P11SpikeError("SPIKE_APP_INSTALLED_SCHEMA_INVALID");
  const mcpNames = collectMcpNames(mcp.pages);
  const appNames = collectAppNames(installedResult.apps, apps.pages);
  const normalized = {
    mcp: { terminal: mcp.terminal, pageOrderStableJsonSha256: mcp.pageOrderStableJsonSha256, pageCount: mcp.pages.length, names: mcpNames },
    apps: { terminal: apps.terminal, pageOrderStableJsonSha256: apps.pageOrderStableJsonSha256, pageCount: apps.pages.length, installedStableJsonSha256: stableHash(installedResult.apps), names: appNames },
  };
  return {
    normalized,
    stableJsonSha256: stableHash(normalized),
    pagination: { mcp, apps },
    installedWireSha256: installedResponse.wire.wireSha256,
  };
}

async function collectPluginListing(transport) {
  try {
    const listing = await collectPaged(transport, "plugin/list", {}, "SPIKE_PLUGIN_PAGINATION");
    return {
      state: "unobservable",
      reason: "PLUGIN_LIST_NOT_THREAD_BOUND_AND_UNDER_DEVELOPMENT",
      pagination: { terminal: listing.terminal, pageCount: listing.pages.length, pageOrderStableJsonSha256: listing.pageOrderStableJsonSha256 },
    };
  } catch (error) {
    return { state: "unobservable", reason: safeError(error).code, pagination: null };
  }
}

function extractMcpCalls(messages) {
  const calls = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!plainObject(value)) return;
    const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
    const server = typeof value.serverName === "string" ? value.serverName : (typeof value.server === "string" ? value.server : null);
    const tool = typeof value.toolName === "string" ? value.toolName : (typeof value.tool === "string" ? value.tool : null);
    if (type.includes("mcp") && type.includes("tool") && server && tool) calls.add(server + "::" + tool);
    for (const child of Object.values(value)) visit(child);
  };
  messages.forEach((entry) => visit(entry.message));
  return [...calls].sort();
}

async function startThread(transport, launch) {
  await transport.request("initialize", {
    clientInfo: { name: "p3-p11-app-server-spike", title: "P-11 feasibility spike", version: String(P11_APP_SERVER_SPIKE_VERSION) },
    capabilities: { experimentalApi: true },
  });
  await transport.notify("initialized", {});
  const params = { cwd: launch.cwd, approvalPolicy: "never", sandbox: launch.sandboxProfile };
  if (launch.model) params.model = launch.model;
  return responseThread((await transport.request("thread/start", params)).result);
}

async function startFeasibilityTurn(transport, threadId, timeoutMs) {
  const turn = responseTurn((await transport.request("turn/start", {
    threadId,
    input: [{ type: "text", text: SAFE_TURN_INPUT }],
    approvalPolicy: "never",
  })).result);
  await transport.waitForNotification((message) => message.method === "turn/completed" && message.params?.turn?.id === turn.id, { timeoutMs });
  return turn;
}

async function runObservedLaunch(plan, launch, purpose, dependencies = {}) {
  const {
    readFileFn = readFile,
    spawnFn = spawn,
    openFile = open,
    now = () => new Date().toISOString(),
    captureStart = startAppServerCapture,
    terminateProcessTreeFn = terminateWindowsProcessTree,
  } = dependencies;
  const artifacts = artifactPaths(plan.outputRoot, launch.id);
  assertArtifactsWithin(plan.outputRoot, artifacts);
  const prelaunch = await buildPrelaunchRecord(plan, launch, artifacts, { readFileFn, spawnFn, now, terminateProcessTreeFn });
  const prelaunchArtifact = await writeJsonExclusive(artifacts.prelaunch, prelaunch, openFile);
  let transport;
  let thread = null;
  let first = null;
  let second = null;
  let post = null;
  let turn = null;
  let pluginListing = null;
  let failure = null;
  let rawThreadStartBinding = null;
  let rawAppServerResponseEvidence = null;
  try {
    transport = await captureStart({
      launch: {
        executable: launch.executable,
        args: launch.args,
        cwd: launch.cwd,
        codeHome: launch.codeHome.path,
        codeHomeProfile: launch.codeHome.profile,
        sandboxProfile: launch.sandboxProfile,
        model: launch.model,
      },
      artifacts: { stdin: artifacts.rawStdin, stdout: artifacts.rawStdout, stderr: artifacts.rawStderr },
      timeoutMs: plan.timeoutMs,
      spawnFn,
      openFile,
      now,
      terminateProcessTreeFn,
    });
    if (!transportLaunchMatchesPrelaunch(transport.observedLaunch, expectedCaptureLaunch(prelaunch))) throw new P11SpikeError("SPIKE_PRELAUNCH_TRANSPORT_MISMATCH");
    thread = await startThread(transport, launch);
    first = await collectThreadInventory(transport, thread.id);
    if (purpose === "candidate") {
      second = await collectThreadInventory(transport, thread.id);
      turn = await startFeasibilityTurn(transport, thread.id, plan.timeoutMs);
      post = await collectThreadInventory(transport, thread.id);
      pluginListing = await collectPluginListing(transport);
    }
  } catch (error) {
    failure = safeError(error);
  }
  let capture = null;
  if (transport) {
    try { capture = await transport.close(); }
    catch (error) {
      if (!failure) failure = safeError(error);
      capture = transport.summary();
    }
  }
  if (capture) {
    rawThreadStartBinding = await validateRawThreadStartBinding(capture, prelaunch, readFileFn);
    if (rawThreadStartBinding.state !== "present" && !failure) failure = { code: rawThreadStartBinding.reason, detail: null };
    rawAppServerResponseEvidence = await deriveRawAppServerResponseEvidence(capture, thread?.id ?? null, readFileFn);
  }
  const preRepeat = first && second ? equalJson(first.normalized, second.normalized) : null;
  const prePost = first && post ? equalJson(first.normalized, post.normalized) : null;
  const observedMcpCalls = capture ? extractMcpCalls(capture.messages) : [];
  const candidateMcpNames = first?.normalized.mcp.names ?? [];
  const inventoryExternalCall = observedMcpCalls.filter((name) => !candidateMcpNames.includes(name));
  return {
    launchId: launch.id,
    purpose,
    status: failure ? "unobservable" : "observed",
    failure,
    prelaunch: prelaunchArtifact,
    prelaunchTransportMatch: capture ? transportLaunchMatchesPrelaunch(capture.observedLaunch, expectedCaptureLaunch(prelaunch)) : false,
    rawThreadStartBinding,
    rawAppServerResponseEvidence,
    codeHome: launch.codeHome,
    thread,
    turn,
    inventories: {
      first: first ? inventorySummary(first) : null,
      second: second ? inventorySummary(second) : null,
      post: post ? inventorySummary(post) : null,
      preRepeatStable: preRepeat,
      prePostStable: prePost,
      difference: first && post ? inventoryDifference(first.normalized, post.normalized) : null,
    },
    pluginListing,
    inventoryExternalMcpCalls: inventoryExternalCall,
    capture: capture ? captureSummary(capture) : null,
  };
}

function inventorySummary(inventory) {
  return {
    stableJsonSha256: inventory.stableJsonSha256,
    normalized: inventory.normalized,
    pagination: {
      mcp: { terminal: inventory.pagination.mcp.terminal, pageCount: inventory.pagination.mcp.pages.length, pageOrderStableJsonSha256: inventory.pagination.mcp.pageOrderStableJsonSha256 },
      apps: { terminal: inventory.pagination.apps.terminal, pageCount: inventory.pagination.apps.pages.length, pageOrderStableJsonSha256: inventory.pagination.apps.pageOrderStableJsonSha256 },
    },
  };
}

function inventoryDifference(before, after) {
  const fields = ["mcp", "apps"];
  const result = {};
  for (const field of fields) {
    const left = new Set(before[field].names);
    const right = new Set(after[field].names);
    result[field] = {
      added: [...right].filter((item) => !left.has(item)).sort(),
      removed: [...left].filter((item) => !right.has(item)).sort(),
    };
  }
  return result;
}

function captureSummary(capture) {
  return {
    captureInstanceId: capture.captureInstanceId,
    observedAt: capture.observedAt,
    endedAt: capture.endedAt,
    observedLaunch: capture.observedLaunch,
    process: capture.process,
    processTreeCleanup: capture.processTreeCleanup,
    rawTransport: capture.rawTransport,
    messageCount: capture.messages.length,
  };
}

function rawCode(channel, suffix) {
  return "SPIKE_RAW_" + channel.toUpperCase() + "_" + suffix;
}

function parseRawJsonlRecords(bytes, channel) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0 || bytes.at(-1) !== 0x0a) throw new P11SpikeError(rawCode(channel, "JSONL_INCOMPLETE"));
  const records = [];
  let start = 0;
  for (let offset = 0; offset < bytes.byteLength; offset += 1) {
    if (bytes[offset] !== 0x0a) continue;
    const wire = bytes.subarray(start, offset);
    start = offset + 1;
    if (wire.byteLength === 0) throw new P11SpikeError(rawCode(channel, "JSONL_EMPTY_LINE"));
    const jsonBytes = wire.at(-1) === 0x0d ? wire.subarray(0, -1) : wire;
    let message;
    try { message = JSON.parse(jsonBytes.toString("utf8")); }
    catch { throw new P11SpikeError(rawCode(channel, "JSONL_PARSE_INVALID")); }
    if (!plainObject(message)) throw new P11SpikeError(rawCode(channel, "JSONL_SCHEMA_INVALID"));
    records.push({ sequence: records.length + 1, wireSha256: sha256(wire), message });
  }
  if (start !== bytes.byteLength) throw new P11SpikeError(rawCode(channel, "JSONL_INCOMPLETE"));
  return records;
}

function rpcIdKey(id) {
  if (typeof id === "string" && id) return "string:" + id;
  if (typeof id === "number" && Number.isFinite(id)) return "number:" + String(id);
  throw new P11SpikeError("SPIKE_RAW_RPC_ID_INVALID");
}

function propertyAt(value, path) {
  let current = value;
  for (const key of path) {
    if (!plainObject(current) || !Object.prototype.hasOwnProperty.call(current, key)) return { found: false, value: null };
    current = current[key];
  }
  return { found: true, value: current };
}

function fieldPath(path, prefix = "result") {
  return prefix + "." + path.join(".");
}

function selectedRawString(value, paths, prefix) {
  const found = [];
  let malformed = false;
  for (const path of paths) {
    const result = propertyAt(value, path);
    if (!result.found) continue;
    if (typeof result.value !== "string" || !result.value.trim()) {
      malformed = true;
      continue;
    }
    found.push({ value: result.value.trim(), fieldPath: fieldPath(path, prefix) });
  }
  if (malformed || found.length === 0 || new Set(found.map((item) => item.value)).size !== 1) return null;
  return found[0];
}

function selectedFirstRawString(value, paths, prefix) {
  for (const path of paths) {
    const result = propertyAt(value, path);
    if (!result.found) continue;
    if (typeof result.value !== "string" || !result.value.trim()) return null;
    return { value: result.value.trim(), fieldPath: fieldPath(path, prefix) };
  }
  return null;
}

function selectedRawBoolean(value, paths, prefix) {
  const found = [];
  let malformed = false;
  for (const path of paths) {
    const result = propertyAt(value, path);
    if (!result.found) continue;
    if (typeof result.value !== "boolean") {
      malformed = true;
      continue;
    }
    found.push({ value: result.value, fieldPath: fieldPath(path, prefix) });
  }
  if (malformed || found.length === 0 || new Set(found.map((item) => item.value)).size !== 1) return null;
  return found[0];
}

function rawArtifactReference(ref) {
  return { path: ref.path, sha256: ref.sha256, bytes: ref.bytes };
}

function responseProvenance(pair, rawStdout, path) {
  return {
    requestId: pair.request.message.id,
    requestMethod: pair.request.message.method,
    responseId: pair.response.message.id,
    responseSequence: pair.response.sequence,
    responseWireSha256: pair.response.wireSha256,
    rawStdout: rawArtifactReference(rawStdout),
    fieldPath: path,
  };
}

function rawStringFromPair(pair, paths, rawStdout, prefix = "result") {
  const selected = selectedRawString(pair.result, paths, prefix);
  return selected ? { value: selected.value, provenance: responseProvenance(pair, rawStdout, selected.fieldPath) } : null;
}

function rawBooleanFromPair(pair, paths, rawStdout, prefix) {
  const selected = selectedRawBoolean(pair.result, paths, prefix);
  return selected ? { value: selected.value, provenance: responseProvenance(pair, rawStdout, selected.fieldPath) } : null;
}

async function readVerifiedRawChannel(capture, channel, readFileFn) {
  const reference = capture?.rawTransport?.[channel];
  if (!plainObject(reference) || typeof reference.path !== "string" || typeof reference.sha256 !== "string" || !Number.isInteger(reference.bytes)) throw new P11SpikeError(rawCode(channel, "CAPTURE_MISSING"));
  let bytes;
  try { bytes = await readFileFn(reference.path); }
  catch { throw new P11SpikeError(rawCode(channel, "READ_FAILED")); }
  if (sha256(bytes) !== reference.sha256 || bytes.byteLength !== reference.bytes) throw new P11SpikeError(rawCode(channel, "HASH_MISMATCH"));
  return { artifact: rawArtifactReference(reference), records: parseRawJsonlRecords(bytes, channel) };
}

function rawRequestResponsePairs(stdinRecords, stdoutRecords) {
  const requests = new Map();
  for (const record of stdinRecords) {
    const message = record.message;
    if (!Object.prototype.hasOwnProperty.call(message, "id")) continue;
    const key = rpcIdKey(message.id);
    if (requests.has(key) || typeof message.method !== "string" || !message.method) throw new P11SpikeError("SPIKE_RAW_REQUEST_DUPLICATE_OR_INVALID");
    requests.set(key, record);
  }
  const responses = new Map();
  for (const record of stdoutRecords) {
    const message = record.message;
    if (!Object.prototype.hasOwnProperty.call(message, "id") || !Object.prototype.hasOwnProperty.call(message, "result")) continue;
    const key = rpcIdKey(message.id);
    if (responses.has(key)) throw new P11SpikeError("SPIKE_RAW_RESPONSE_DUPLICATE");
    responses.set(key, record);
  }
  const pairs = [];
  for (const [key, request] of requests) {
    const response = responses.get(key);
    if (!response || !plainObject(response.message.result)) continue;
    pairs.push({ request, response, result: response.message.result });
  }
  return { requests: [...requests.values()], pairs };
}

function rawEvidenceUnavailable(reason, rawTransport = null, responseCount = 0) {
  const missing = { observed: false, reason };
  return {
    state: "unobservable",
    reason,
    rawTransport,
    responseCount,
    threadStart: missing,
    snapshotId: missing,
    processInstanceId: missing,
    origin: missing,
    enabledCallable: missing,
    atomicTurnStartBinding: missing,
    appCollectionReconciliation: missing,
    appListAvailability: missing,
    pluginApp: { observed: false, names: [], reason },
    projectState: { observed: false, names: [], namesByOrigin: {}, reason },
  };
}

function matchingThreadBinding(pair, expectedThreadId, paths, rawStdout) {
  const field = rawStringFromPair(pair, paths, rawStdout);
  return field && field.value === expectedThreadId ? field : null;
}

function uniformRawString(pairs, paths, rawStdout) {
  const fields = pairs.map((pair) => rawStringFromPair(pair, paths, rawStdout));
  if (fields.some((field) => !field) || fields.length === 0) return { observed: false, reason: "RAW_FIELD_MISSING_OR_AMBIGUOUS" };
  if (new Set(fields.map((field) => field.value)).size !== 1) return { observed: false, reason: "RAW_FIELD_NOT_UNIFORM" };
  return { observed: true, value: fields[0].value, provenance: fields.map((field) => field.provenance) };
}

function rawEntry(pair, value, prefix, namePaths, rawStdout, kind) {
  const isApp = kind === "appInstalled" || kind === "appList";
  const name = isApp ? selectedFirstRawString(value, namePaths, prefix) : selectedRawString(value, namePaths, prefix);
  const appId = isApp ? selectedRawString(value, RAW_FIELD_PATHS.appId, prefix) : null;
  const appDisplayName = isApp ? selectedFirstRawString(value, RAW_FIELD_PATHS.appDisplayName, prefix) : null;
  const origin = selectedRawString(value, RAW_FIELD_PATHS.entryOrigin, prefix);
  const enabled = kind === "appInstalled"
    ? selectedRawBoolean(value, RAW_FIELD_PATHS.installedEnabled, prefix)
    : (kind === "appList" ? null : selectedRawBoolean(value, RAW_FIELD_PATHS.entryEnabled, prefix));
  const callable = kind === "appInstalled"
    ? selectedRawBoolean(value, RAW_FIELD_PATHS.installedCallable, prefix)
    : (kind === "appList" ? null : selectedRawBoolean(value, RAW_FIELD_PATHS.entryCallable, prefix));
  const availabilityEnabled = kind === "appList" ? selectedRawBoolean(value, RAW_FIELD_PATHS.appListEnabled, prefix) : null;
  const availabilityAccessible = kind === "appList" ? selectedRawBoolean(value, RAW_FIELD_PATHS.appListAccessible, prefix) : null;
  return {
    kind,
    name: name?.value ?? null,
    appId: appId ? { value: appId.value, provenance: responseProvenance(pair, rawStdout, appId.fieldPath) } : null,
    appDisplayName: appDisplayName ? { value: appDisplayName.value, provenance: responseProvenance(pair, rawStdout, appDisplayName.fieldPath) } : null,
    origin: origin ? { value: origin.value, provenance: responseProvenance(pair, rawStdout, origin.fieldPath) } : null,
    enabled: enabled ? { value: enabled.value, provenance: responseProvenance(pair, rawStdout, enabled.fieldPath) } : null,
    callable: callable ? { value: callable.value, provenance: responseProvenance(pair, rawStdout, callable.fieldPath) } : null,
    availability: kind === "appList" ? {
      enabled: availabilityEnabled ? { value: availabilityEnabled.value, provenance: responseProvenance(pair, rawStdout, availabilityEnabled.fieldPath) } : null,
      accessible: availabilityAccessible ? { value: availabilityAccessible.value, provenance: responseProvenance(pair, rawStdout, availabilityAccessible.fieldPath) } : null,
    } : null,
    provenance: name ? responseProvenance(pair, rawStdout, name.fieldPath) : null,
  };
}

function collectRawToolEntries(pairs, rawStdout) {
  const entries = [];
  let mcpComplete = true;
  let appComplete = true;
  for (const pair of pairs) {
    const method = pair.request.message.method;
    if (method === "mcpServerStatus/list") {
      if (!Array.isArray(pair.result.data)) {
        mcpComplete = false;
        continue;
      }
      pair.result.data.forEach((server, serverIndex) => {
        const serverPrefix = "result.data[" + serverIndex + "]";
        const serverName = plainObject(server) ? selectedRawString(server, RAW_FIELD_PATHS.entryName, serverPrefix) : null;
        if (!plainObject(server) || !serverName || !Array.isArray(server.tools)) {
          mcpComplete = false;
          return;
        }
        server.tools.forEach((tool, toolIndex) => {
          if (!plainObject(tool)) {
            mcpComplete = false;
            return;
          }
          const entry = rawEntry(pair, tool, serverPrefix + ".tools[" + toolIndex + "]", RAW_FIELD_PATHS.entryName, rawStdout, "mcpTool");
          if (!entry.name) mcpComplete = false;
          entry.name = entry.name ? serverName.value + "::" + entry.name : null;
          entries.push(entry);
        });
      });
      continue;
    }
    const collection = method === "app/installed" ? pair.result.apps : pair.result.data;
    const collectionPath = method === "app/installed" ? "result.apps" : "result.data";
    if (!Array.isArray(collection)) {
      appComplete = false;
      continue;
    }
    collection.forEach((app, index) => {
      if (!plainObject(app)) {
        appComplete = false;
        return;
      }
      const entry = rawEntry(pair, app, collectionPath + "[" + index + "]", RAW_FIELD_PATHS.appName, rawStdout, method === "app/installed" ? "appInstalled" : "appList");
      if (!entry.name) appComplete = false;
      entries.push(entry);
    });
  }
  return { complete: mcpComplete && appComplete, mcpComplete, appComplete, entries };
}

function metadataCapability(entries, key, include = () => true) {
  const applicable = entries.filter(include);
  if (applicable.length === 0 || applicable.some((entry) => !entry[key])) return { observed: false, reason: "RAW_ENTRY_FIELD_MISSING_OR_AMBIGUOUS" };
  return {
    observed: true,
    value: { entryCount: applicable.length, values: [...new Set(applicable.map((entry) => entry[key].value))].sort() },
    provenance: applicable.map((entry) => entry[key].provenance),
  };
}

function collectRawProjectStates(pairs, rawStdout) {
  const entries = [];
  const collectionProvenance = [];
  let complete = true;
  for (const pair of pairs) {
    const hasPlural = Object.prototype.hasOwnProperty.call(pair.result, "projectStates");
    const hasSingle = Object.prototype.hasOwnProperty.call(pair.result, "projectState");
    if (hasPlural === hasSingle) {
      complete = false;
      continue;
    }
    const values = hasPlural ? pair.result.projectStates : [pair.result.projectState];
    const basePath = hasPlural ? "result.projectStates" : "result.projectState";
    if (!Array.isArray(values) || values.some((value) => !plainObject(value))) {
      complete = false;
      continue;
    }
    collectionProvenance.push(responseProvenance(pair, rawStdout, basePath));
    values.forEach((value, index) => {
      const prefix = hasPlural ? basePath + "[" + index + "]" : basePath;
      const name = selectedRawString(value, RAW_FIELD_PATHS.projectName, prefix);
      const origin = selectedRawString(value, RAW_FIELD_PATHS.entryOrigin, prefix);
      if (!name || !origin) {
        complete = false;
        return;
      }
      entries.push({ name: name.value, origin: origin.value, provenance: responseProvenance(pair, rawStdout, name.fieldPath), originProvenance: responseProvenance(pair, rawStdout, origin.fieldPath) });
    });
  }
  const names = [...new Set(entries.map((entry) => entry.name))].sort();
  const namesByOrigin = Object.fromEntries([...new Set(entries.map((entry) => entry.origin))].sort().map((origin) => [origin, [...new Set(entries.filter((entry) => entry.origin === origin).map((entry) => entry.name))].sort()]));
  return { observed: complete && collectionProvenance.length === pairs.length, names, namesByOrigin, provenance: collectionProvenance, entries, reason: complete ? null : "RAW_THREAD_BOUND_PROJECT_STATE_FIELD_MISSING_OR_INVALID" };
}

function rawPluginAppSurface(entries, appComplete) {
  const isApp = (entry) => entry.kind === "appInstalled" || entry.kind === "appList";
  const metadataComplete = appComplete && entries.every((entry) => isApp(entry) ? Boolean(entry.name && entry.origin) : true);
  const names = [...new Set(entries.filter((entry) => isApp(entry) && entry.origin && PLUGIN_APP_ORIGINS.has(entry.origin.value)).map((entry) => entry.name))].sort();
  return {
    observed: metadataComplete && entries.some(isApp),
    names,
    provenance: entries.filter((entry) => isApp(entry) && entry.origin && PLUGIN_APP_ORIGINS.has(entry.origin.value)).map((entry) => entry.provenance),
    reason: metadataComplete ? null : "RAW_THREAD_BOUND_PLUGIN_APP_FIELD_MISSING_OR_INVALID",
  };
}

function rawAppListAvailability(entries, appComplete) {
  const listed = entries.filter((entry) => entry.kind === "appList");
  if (!appComplete || listed.length === 0 || listed.some((entry) => !entry.availability?.enabled || !entry.availability?.accessible)) {
    return { observed: false, reason: "RAW_APP_LIST_AVAILABILITY_FIELD_MISSING_OR_AMBIGUOUS" };
  }
  return {
    observed: true,
    value: {
      entryCount: listed.length,
      enabledValues: [...new Set(listed.map((entry) => entry.availability.enabled.value))].sort(),
      accessibleValues: [...new Set(listed.map((entry) => entry.availability.accessible.value))].sort(),
    },
    provenance: {
      enabled: listed.map((entry) => entry.availability.enabled.provenance),
      accessible: listed.map((entry) => entry.availability.accessible.provenance),
    },
  };
}

// `app/list` availability is deliberately not callability evidence.  A listed
// app may validly be absent from an installed snapshot, so this is not an API
// invariant.  It is instead this feasibility spike's conservative condition:
// such an app cannot silently fall out of the enabled/callable calculation.
function reconcileRawAppCollections(entries, appComplete) {
  const installed = entries.filter((entry) => entry.kind === "appInstalled");
  const listed = entries.filter((entry) => entry.kind === "appList");
  const apps = [...installed, ...listed];
  const rawEntry = (entry) => ({
    id: entry.appId?.value ?? null,
    name: entry.appDisplayName?.value ?? null,
    idProvenance: entry.appId?.provenance ?? null,
    nameProvenance: entry.appDisplayName?.provenance ?? null,
  });
  const ids = (collection) => [...new Set(collection.map((entry) => entry.appId?.value).filter(Boolean))].sort();
  const names = (collection) => [...new Set(collection.map((entry) => entry.appDisplayName?.value).filter(Boolean))].sort();
  const installedIds = ids(installed);
  const listedIds = ids(listed);
  const installedIdSet = new Set(installedIds);
  const listedIdSet = new Set(listedIds);
  const listOnly = listed.filter((entry) => entry.appId && !installedIdSet.has(entry.appId.value));
  const installedOnly = installed.filter((entry) => entry.appId && !listedIdSet.has(entry.appId.value));
  const duplicateIds = new Set();
  const duplicateEntries = [];
  const idsByRawResponse = new Map();
  for (const entry of apps) {
    if (!entry.appId?.provenance) continue;
    const responseKey = entry.kind + ":" + entry.appId.provenance.responseSequence;
    const responseIds = idsByRawResponse.get(responseKey) ?? new Map();
    const duplicate = responseIds.get(entry.appId.value) ?? [];
    duplicate.push(entry);
    responseIds.set(entry.appId.value, duplicate);
    idsByRawResponse.set(responseKey, responseIds);
  }
  for (const responseIds of idsByRawResponse.values()) {
    for (const [id, duplicate] of responseIds) {
      if (duplicate.length > 1) {
        duplicateIds.add(id);
        duplicateEntries.push(...duplicate);
      }
    }
  }
  const idsByDisplayName = new Map();
  for (const entry of apps) {
    if (!entry.appId?.value || !entry.appDisplayName?.value) continue;
    const mapped = idsByDisplayName.get(entry.appDisplayName.value) ?? new Set();
    mapped.add(entry.appId.value);
    idsByDisplayName.set(entry.appDisplayName.value, mapped);
  }
  const conflictingDisplayNames = [...idsByDisplayName.entries()]
    .filter(([, mapped]) => mapped.size > 1)
    .map(([name]) => name)
    .sort();
  const conflictingNameEntries = apps.filter((entry) => conflictingDisplayNames.includes(entry.appDisplayName?.value));
  const installedById = new Map();
  for (const entry of installed) {
    if (!entry.appId?.value || !entry.enabled || !entry.callable) continue;
    const values = installedById.get(entry.appId.value) ?? { enabled: new Set(), callable: new Set(), entries: [] };
    values.enabled.add(entry.enabled.value);
    values.callable.add(entry.callable.value);
    values.entries.push(entry);
    installedById.set(entry.appId.value, values);
  }
  const conflictingCallabilityIds = [...installedById.entries()]
    .filter(([, values]) => values.enabled.size > 1 || values.callable.size > 1)
    .map(([id]) => id)
    .sort();
  const conflictingCallabilityEntries = conflictingCallabilityIds.flatMap((id) => installedById.get(id).entries);
  const missingCanonicalIdEntries = apps.filter((entry) => !entry.appId?.value || !entry.appId?.provenance);
  const reason = !appComplete ? "RAW_APP_COLLECTION_RECONCILIATION_UNAVAILABLE"
    : missingCanonicalIdEntries.length > 0 ? "RAW_APP_COLLECTION_CANONICAL_ID_MISSING_OR_AMBIGUOUS"
      : duplicateIds.size > 0 ? "RAW_APP_COLLECTION_DUPLICATE_CANONICAL_ID"
        : conflictingDisplayNames.length > 0 ? "RAW_APP_COLLECTION_NAME_ID_CONFLICT"
          : conflictingCallabilityIds.length > 0 ? "RAW_APP_INSTALLED_CALLABILITY_NOT_UNIFORM"
            : null;
  return {
    observed: reason === null,
    value: {
      installedEntryCount: installed.length,
      appListEntryCount: listed.length,
      installedCanonicalIdCount: installedIds.length,
      appListCanonicalIdCount: listedIds.length,
      installedIds,
      appListIds: listedIds,
      installedResolvedNames: names(installed),
      appListResolvedNames: names(listed),
      listOnlyIds: ids(listOnly),
      listOnlyNames: names(listOnly),
      installedOnlyIds: ids(installedOnly),
      installedOnlyNames: names(installedOnly),
      duplicateCanonicalIds: [...duplicateIds].sort(),
      conflictingDisplayNames,
      conflictingCallabilityIds,
    },
    provenance: {
      installed: installed.map(rawEntry),
      appList: listed.map(rawEntry),
      listOnly: listOnly.map(rawEntry),
      installedOnly: installedOnly.map(rawEntry),
      duplicateCanonicalIds: duplicateEntries.map(rawEntry),
      conflictingDisplayNames: conflictingNameEntries.map(rawEntry),
      conflictingCallabilityIds: conflictingCallabilityEntries.map(rawEntry),
      missingCanonicalIds: missingCanonicalIdEntries.map(rawEntry),
    },
    reason,
  };
}

// This function deliberately derives every capability from raw stdout which
// has been re-read and hash/byte-count verified.  The transport's parsed
// projection is not accepted as the source of these observations.
export async function deriveRawAppServerResponseEvidence(capture, expectedThreadId, readFileFn = readFile) {
  let stdin;
  let stdout;
  try {
    stdin = await readVerifiedRawChannel(capture, "stdin", readFileFn);
    stdout = await readVerifiedRawChannel(capture, "stdout", readFileFn);
    if (typeof expectedThreadId !== "string" || !expectedThreadId) return rawEvidenceUnavailable("RAW_THREAD_ID_UNAVAILABLE", { stdin: stdin.artifact, stdout: stdout.artifact }, stdout.records.length);
    const rpc = rawRequestResponsePairs(stdin.records, stdout.records);
    const threadStarts = rpc.pairs.filter((pair) => pair.request.message.method === "thread/start");
    if (threadStarts.length !== 1) return rawEvidenceUnavailable("RAW_THREAD_START_RESPONSE_MISSING_OR_DUPLICATE", { stdin: stdin.artifact, stdout: stdout.artifact }, stdout.records.length);
    const threadStart = matchingThreadBinding(threadStarts[0], expectedThreadId, RAW_FIELD_PATHS.threadStart, stdout.artifact);
    if (!threadStart) return rawEvidenceUnavailable("RAW_THREAD_START_RESPONSE_NOT_BOUND", { stdin: stdin.artifact, stdout: stdout.artifact }, stdout.records.length);
    const requests = rpc.requests.filter((record) => RAW_INVENTORY_METHODS.has(record.message.method) && record.message.params?.threadId === expectedThreadId);
    const responses = rpc.pairs.filter((pair) => RAW_INVENTORY_METHODS.has(pair.request.message.method) && pair.request.message.params?.threadId === expectedThreadId);
    const observedMethods = new Set(responses.map((pair) => pair.request.message.method));
    if ([...RAW_INVENTORY_METHODS].some((method) => !observedMethods.has(method))) return rawEvidenceUnavailable("RAW_THREAD_BOUND_INVENTORY_METHOD_SET_INCOMPLETE", { stdin: stdin.artifact, stdout: stdout.artifact }, stdout.records.length);
    if (requests.length === 0 || requests.length !== responses.length) return rawEvidenceUnavailable("RAW_THREAD_BOUND_INVENTORY_RESPONSE_MISSING", { stdin: stdin.artifact, stdout: stdout.artifact }, stdout.records.length);
    const bindings = responses.map((pair) => matchingThreadBinding(pair, expectedThreadId, RAW_FIELD_PATHS.inventoryThread, stdout.artifact));
    if (bindings.some((binding) => !binding)) return rawEvidenceUnavailable("RAW_THREAD_BOUND_INVENTORY_RESPONSE_NOT_BOUND", { stdin: stdin.artifact, stdout: stdout.artifact }, stdout.records.length);
    const entries = collectRawToolEntries(responses, stdout.artifact);
    const snapshotId = uniformRawString(responses, RAW_FIELD_PATHS.inventorySnapshot, stdout.artifact);
    const processInstanceId = uniformRawString(responses, RAW_FIELD_PATHS.processInstance, stdout.artifact);
    const origin = entries.complete ? metadataCapability(entries.entries, "origin") : { observed: false, reason: "RAW_TOOL_ENTRY_SCHEMA_INCOMPLETE" };
    const callabilityEntry = (entry) => entry.kind === "mcpTool" || entry.kind === "appInstalled";
    const enabled = entries.complete ? metadataCapability(entries.entries, "enabled", callabilityEntry) : { observed: false, reason: "RAW_TOOL_ENTRY_SCHEMA_INCOMPLETE" };
    const callable = entries.complete ? metadataCapability(entries.entries, "callable", callabilityEntry) : { observed: false, reason: "RAW_TOOL_ENTRY_SCHEMA_INCOMPLETE" };
    const appCollectionReconciliation = reconcileRawAppCollections(entries.entries, entries.appComplete);
    const enabledCallable = !appCollectionReconciliation.observed ? {
      observed: false,
      reason: appCollectionReconciliation.reason,
      appCollectionReconciliation,
    } : appCollectionReconciliation.value.listOnlyIds.length > 0 ? {
      observed: false,
      reason: "APP_LIST_ENTRY_WITHOUT_INSTALLED_CALLABILITY",
      appCollectionReconciliation,
    } : enabled.observed && callable.observed ? {
      observed: true,
      value: {
        inventoryEntryCount: entries.entries.length,
        callabilityEntryCount: enabled.value.entryCount,
        enabledValues: enabled.value.values,
        callableValues: callable.value.values,
        appCollectionReconciliation: appCollectionReconciliation.value,
      },
      provenance: {
        enabled: enabled.provenance,
        callable: callable.provenance,
        appCollectionReconciliation: appCollectionReconciliation.provenance,
      },
      appCollectionReconciliation,
    } : {
      observed: false,
      reason: enabled.reason ?? callable.reason ?? "RAW_ENABLED_CALLABLE_FIELD_MISSING_OR_AMBIGUOUS",
      appCollectionReconciliation,
    };
    const projectState = collectRawProjectStates(responses, stdout.artifact);
    const pluginApp = rawPluginAppSurface(entries.entries, entries.appComplete);
    const appListAvailability = rawAppListAvailability(entries.entries, entries.appComplete);
    const turnPairs = rpc.pairs.filter((pair) => pair.request.message.method === "turn/start" && pair.request.message.params?.threadId === expectedThreadId);
    const turnBinding = turnPairs.length === 1 ? matchingThreadBinding(turnPairs[0], expectedThreadId, RAW_FIELD_PATHS.turnThread, stdout.artifact) : null;
    const turnSnapshot = turnPairs.length === 1 ? rawStringFromPair(turnPairs[0], RAW_FIELD_PATHS.turnSnapshot, stdout.artifact) : null;
    const atomicTurnStartBinding = turnBinding && turnSnapshot && snapshotId.observed && turnSnapshot.value === snapshotId.value ? {
      observed: true,
      value: { threadId: expectedThreadId, snapshotId: turnSnapshot.value },
      provenance: { turnThread: turnBinding.provenance, turnSnapshot: turnSnapshot.provenance, inventorySnapshot: snapshotId.provenance },
    } : { observed: false, reason: "RAW_TURN_START_SNAPSHOT_BINDING_MISSING_OR_INCONSISTENT" };
    return {
      state: "observed",
      reason: null,
      rawTransport: { stdin: stdin.artifact, stdout: stdout.artifact },
      responseCount: stdout.records.length,
      threadStart: { observed: true, value: expectedThreadId, provenance: threadStart.provenance },
      inventory: {
        requestCount: requests.length,
        responseCount: responses.length,
        threadBound: true,
        provenance: bindings.map((binding) => binding.provenance),
      },
      snapshotId,
      processInstanceId,
      origin,
      enabledCallable,
      appCollectionReconciliation,
      appListAvailability,
      atomicTurnStartBinding,
      pluginApp,
      projectState,
    };
  } catch (error) {
    const rawTransport = stdin && stdout ? { stdin: stdin.artifact, stdout: stdout.artifact } : null;
    return rawEvidenceUnavailable(safeError(error).code, rawTransport, stdout?.records.length ?? 0);
  }
}

export async function validateRawThreadStartBinding(capture, prelaunch, readFileFn = readFile) {
  if (!capture?.rawTransport?.stdin?.path) return { state: "unobservable", reason: "SPIKE_RAW_STDIN_CAPTURE_MISSING" };
  let bytes;
  try { bytes = await readFileFn(capture.rawTransport.stdin.path); }
  catch { return { state: "unobservable", reason: "SPIKE_RAW_STDIN_READ_FAILED" }; }
  if (sha256(bytes) !== capture.rawTransport.stdin.sha256 || bytes.byteLength !== capture.rawTransport.stdin.bytes) return { state: "unobservable", reason: "SPIKE_RAW_STDIN_HASH_MISMATCH" };
  let requests;
  try { requests = parseRawJsonlRecords(bytes, "stdin").map((record) => record.message); }
  catch (error) { return { state: "unobservable", reason: safeError(error).code }; }
  const starts = requests.filter((item) => item.method === "thread/start" && Object.prototype.hasOwnProperty.call(item, "id"));
  if (starts.length !== 1 || !plainObject(starts[0].params)) return { state: "unobservable", reason: "SPIKE_RAW_THREAD_START_MISSING_OR_DUPLICATE" };
  const params = starts[0].params;
  const expected = prelaunch.appServer;
  const modelMatches = expected.model === null ? !Object.prototype.hasOwnProperty.call(params, "model") : params.model === expected.model;
  const matches = params.cwd === expected.cwd
    && params.sandbox === expected.sandboxProfile
    && params.approvalPolicy === "never"
    && modelMatches;
  return {
    state: matches ? "present" : "unobservable",
    reason: matches ? null : "SPIKE_RAW_THREAD_START_PRELAUNCH_MISMATCH",
    requestStableJsonSha256: stableHash(starts[0]),
    checked: { cwd: params.cwd ?? null, sandbox: params.sandbox ?? null, approvalPolicy: params.approvalPolicy ?? null, model: Object.prototype.hasOwnProperty.call(params, "model") ? params.model : null },
  };
}

async function runMcpControl(plan, launch, healthServerName, healthToolName, dependencies) {
  const observation = await runObservedLaunch(plan, launch, "mcp-control", dependencies);
  let ping = { state: "unobservable", reason: observation.failure?.code ?? "CONTROL_LAUNCH_UNOBSERVABLE" };
  if (observation.status === "observed") {
    const names = observation.inventories.first.normalized.mcp.names;
    const expectedTool = healthServerName + "::" + healthToolName;
    if (names.includes(healthServerName) && names.includes(expectedTool)) {
      // The control launch is recreated only to make the side-effect-free
      // ping visible as a separate raw transport.  The server/tool names are
      // fixed by the plan; arbitrary tool invocation is intentionally absent.
      const pingObservation = await runMcpPing(plan, launch, healthServerName, healthToolName, dependencies);
      ping = pingObservation;
    } else ping = { state: "unobservable", reason: "MCP_HEALTH_NOT_IN_INVENTORY" };
  }
  return { observation, ping, passed: ping.state === "present" };
}

async function runMcpPing(plan, sourceLaunch, healthServerName, healthToolName, { readFileFn = readFile, spawnFn = spawn, openFile = open, now = () => new Date().toISOString(), captureStart = startAppServerCapture, terminateProcessTreeFn = terminateWindowsProcessTree } = {}) {
  // A separate id prevents raw artifact reuse.  It is the same configured
  // launch recipe but must not reuse a role/candidate launch.
  const launch = { ...sourceLaunch, id: sourceLaunch.id + "-ping" };
  const artifacts = artifactPaths(plan.outputRoot, launch.id);
  assertArtifactsWithin(plan.outputRoot, artifacts);
  const prelaunch = await buildPrelaunchRecord(plan, launch, artifacts, { readFileFn, spawnFn, now, terminateProcessTreeFn });
  const prelaunchArtifact = await writeJsonExclusive(artifacts.prelaunch, prelaunch, openFile);
  let transport;
  let thread = null;
  let failure = null;
  try {
    transport = await captureStart({
      launch: { executable: launch.executable, args: launch.args, cwd: launch.cwd, codeHome: launch.codeHome.path, codeHomeProfile: launch.codeHome.profile, sandboxProfile: launch.sandboxProfile, model: launch.model },
      artifacts: { stdin: artifacts.rawStdin, stdout: artifacts.rawStdout, stderr: artifacts.rawStderr },
      timeoutMs: plan.timeoutMs,
      spawnFn,
      openFile,
      now,
      terminateProcessTreeFn,
    });
    if (!transportLaunchMatchesPrelaunch(transport.observedLaunch, expectedCaptureLaunch(prelaunch))) throw new P11SpikeError("SPIKE_PRELAUNCH_TRANSPORT_MISMATCH");
    thread = await startThread(transport, launch);
    const inventory = await collectThreadInventory(transport, thread.id);
    const expected = healthServerName + "::" + healthToolName;
    if (!inventory.normalized.mcp.names.includes(expected)) throw new P11SpikeError("SPIKE_MCP_HEALTH_NOT_OBSERVED");
    await transport.request("mcpServer/tool/call", { threadId: thread.id, serverName: healthServerName, toolName: healthToolName, arguments: {} });
  } catch (error) { failure = safeError(error); }
  let capture = null;
  if (transport) {
    try { capture = await transport.close(); }
    catch (error) { if (!failure) failure = safeError(error); capture = transport.summary(); }
  }
  return {
    state: failure ? "unobservable" : "present",
    reason: failure?.code ?? null,
    prelaunch: prelaunchArtifact,
    thread,
    capture: capture ? captureSummary(capture) : null,
  };
}

async function runPluginAppControl(plan, launch, expectedAppId, dependencies) {
  const observation = await runObservedLaunch(plan, launch, "plugin-app-control", dependencies);
  const surface = observation.rawAppServerResponseEvidence?.pluginApp;
  const appNames = surface?.names ?? [];
  const observed = observation.status === "observed" && surface?.observed === true && appNames.includes(expectedAppId);
  return {
    observation,
    state: observed ? "present" : "unobservable",
    reason: observed ? null : (surface?.reason ?? observation.failure?.code ?? "PLUGIN_APP_CONTROL_NOT_IN_THREAD_BOUND_RAW_INVENTORY"),
  };
}

async function runProjectStateControl(plan, controls, dependencies) {
  const trusted = await runObservedLaunch(plan, controls.trusted, "project-state-trusted-control", dependencies);
  const untrusted = await runObservedLaunch(plan, controls.untrusted, "project-state-untrusted-control", dependencies);
  const trustedSurface = trusted.rawAppServerResponseEvidence?.projectState;
  const untrustedSurface = untrusted.rawAppServerResponseEvidence?.projectState;
  const trustedNames = trustedSurface?.namesByOrigin?.[controls.observable.origin] ?? [];
  const untrustedNames = untrustedSurface?.namesByOrigin?.[controls.observable.origin] ?? [];
  const observed = trusted.status === "observed" && untrusted.status === "observed"
    && trustedSurface?.observed === true && untrustedSurface?.observed === true
    && trustedNames.includes(controls.observable.name) && !untrustedNames.includes(controls.observable.name);
  return {
    trusted,
    untrusted,
    state: observed ? "present" : "unobservable",
    observable: controls.observable,
    reason: observed ? null : "PROJECT_STATE_CONTROL_DIFFERENCE_NOT_OBSERVED",
  };
}

function targetState(target, names, { observable, positiveControl, negativeControl }) {
  if (!observable) return { id: target, state: "unobservable", reason: "ORIGIN_CLASS_NOT_COMPLETELY_OBSERVABLE" };
  if (names.includes(target)) return { id: target, state: "present", reason: null };
  if (positiveControl && negativeControl) return { id: target, state: "absent", reason: "ABSENT_IN_COMPLETE_OBSERVED_CLASS" };
  return { id: target, state: "unobservable", reason: "CONTROLS_INCOMPLETE" };
}

function aggregateState(targets) {
  if (targets.some((item) => item.state === "present")) return "present";
  if (targets.length > 0 && targets.every((item) => item.state === "absent")) return "absent";
  return "unobservable";
}

function originResults(plan, candidate, controls) {
  const mcpNames = candidate.inventories.first?.normalized.mcp.names ?? [];
  const appNames = candidate.inventories.first?.normalized.apps.names ?? [];
  const rawPluginApp = candidate.rawAppServerResponseEvidence?.pluginApp;
  const rawProjectState = candidate.rawAppServerResponseEvidence?.projectState;
  const paginationComplete = candidate.status === "observed"
    && candidate.inventories.first?.pagination.mcp.terminal === true
    && candidate.inventories.first?.pagination.apps.terminal === true
    && candidate.inventories.preRepeatStable === true;
  const negativeAbsent = !mcpNames.includes(plan.controls.negativeToolName) && !appNames.includes(plan.controls.negativeToolName);
  const mcpObservable = paginationComplete
    && candidate.inventories.prePostStable === true
    && candidate.rawThreadStartBinding?.state === "present"
    && controls.mcp.passed
    && negativeAbsent
    && candidate.prelaunchTransportMatch === true;
  const mcpTargets = plan.catalog.mcpServers.map((target) => targetState(target, mcpNames, { observable: mcpObservable, positiveControl: controls.mcp.passed, negativeControl: negativeAbsent }));
  const pluginObservable = paginationComplete
    && candidate.inventories.prePostStable === true
    && candidate.rawThreadStartBinding?.state === "present"
    && candidate.prelaunchTransportMatch === true
    && rawPluginApp?.observed === true
    && controls.pluginApp.state === "present"
    && negativeAbsent;
  const pluginTargets = plan.catalog.pluginApps.map((target) => targetState(target, rawPluginApp?.names ?? [], { observable: pluginObservable, positiveControl: controls.pluginApp.state === "present", negativeControl: negativeAbsent }));
  const projectObservable = paginationComplete
    && candidate.inventories.prePostStable === true
    && candidate.rawThreadStartBinding?.state === "present"
    && candidate.prelaunchTransportMatch === true
    && rawProjectState?.observed === true
    && controls.projectState.state === "present"
    && negativeAbsent;
  const projectTargets = plan.catalog.projectStates.map((target) => targetState(target, rawProjectState?.names ?? [], { observable: projectObservable, positiveControl: controls.projectState.state === "present", negativeControl: negativeAbsent }));
  const result = [
    {
      class: "mcpServer",
      state: aggregateState(mcpTargets),
      targets: mcpTargets,
      controls: { positive: controls.mcp.passed ? "present" : "unobservable", negative: negativeAbsent ? "present" : "unobservable", paginationComplete },
    },
    {
      class: "pluginApp",
      state: aggregateState(pluginTargets),
      targets: pluginTargets,
      controls: { positive: controls.pluginApp.state, negative: negativeAbsent ? "present" : "unobservable", rawThreadBoundSurface: rawPluginApp?.observed === true ? "present" : "unobservable", pluginListing: candidate.pluginListing?.state ?? "unobservable" },
    },
    {
      class: "projectState",
      state: aggregateState(projectTargets),
      targets: projectTargets,
      controls: { positive: controls.projectState.state, negative: negativeAbsent ? "present" : "unobservable", rawThreadBoundSurface: rawProjectState?.observed === true ? "present" : "unobservable" },
    },
  ];
  if (result.some((item) => !ORIGIN_STATES.has(item.state))) throw new P11SpikeError("SPIKE_ORIGIN_STATE_INVALID");
  return result;
}

function requiredApiCapabilities(candidate) {
  const pre = candidate.inventories.first;
  const raw = candidate.rawAppServerResponseEvidence;
  return {
    snapshotId: raw?.snapshotId?.observed === true ? { observed: true, value: raw.snapshotId.value, provenance: raw.snapshotId.provenance } : { observed: false, reason: "NO_ATOMIC_MODEL_VISIBLE_SURFACE_SNAPSHOT_ID" },
    processInstanceId: raw?.processInstanceId?.observed === true ? { observed: true, value: raw.processInstanceId.value, provenance: raw.processInstanceId.provenance } : { observed: false, reason: "CAPTURE_UUID_AND_PID_ARE_NOT_SERVER_ATTESTED_PROCESS_INSTANCE_ID" },
    threadId: { observed: Boolean(candidate.thread?.id), value: candidate.thread?.id ?? null },
    turnId: { observed: Boolean(candidate.turn?.id), value: candidate.turn?.id ?? null },
    origin: raw?.origin?.observed === true ? { observed: true, value: raw.origin.value, provenance: raw.origin.provenance } : { observed: false, reason: pre ? "ONLY_PARTIAL_MCP_AND_APP_ORIGINS_OBSERVED" : "NO_THREAD_INVENTORY" },
    enabledCallable: raw?.enabledCallable?.observed === true
      ? { observed: true, value: raw.enabledCallable.value, provenance: raw.enabledCallable.provenance }
      : {
        observed: false,
        reason: raw?.enabledCallable?.reason ?? (pre ? "APP_RUNTIME_ENABLED_CALLABLE_DOES_NOT_COVER_COMPLETE_TOOL_SURFACE" : "NO_APP_RUNTIME_SNAPSHOT"),
        appCollectionReconciliation: raw?.appCollectionReconciliation ?? raw?.enabledCallable?.appCollectionReconciliation ?? null,
      },
    completePagination: { observed: candidate.inventories.preRepeatStable === true && pre?.pagination.mcp.terminal === true && pre?.pagination.apps.terminal === true },
    atomicTurnStartBinding: raw?.atomicTurnStartBinding?.observed === true ? { observed: true, value: raw.atomicTurnStartBinding.value, provenance: raw.atomicTurnStartBinding.provenance } : { observed: false, reason: "PRE_POST_TWO_POINT_OBSERVATION_IS_NOT_ATOMIC_TURN_BINDING" },
  };
}

function reportOutcome(candidate, originClasses) {
  const reasons = [];
  if (candidate.status !== "observed") reasons.push(candidate.failure?.code ?? "CANDIDATE_UNOBSERVABLE");
  if (candidate.inventories.preRepeatStable !== true) reasons.push("PRE_TURN_INVENTORY_NOT_REPRODUCIBLE");
  if (candidate.inventories.prePostStable === false) reasons.push("SURFACE_CHANGED_ACROSS_TURN");
  if (candidate.inventoryExternalMcpCalls.length > 0) reasons.push("INVENTORY_EXTERNAL_MCP_CALL_OBSERVED");
  if (originClasses.some((item) => item.state === "unobservable")) reasons.push("ORIGIN_CLASS_UNOBSERVABLE");
  reasons.push("NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API");
  return { state: "NOT_AUTHORIZED", reasons: [...new Set(reasons)] };
}

export async function runP11AppServerSpike(rawPlan, dependencies = {}) {
  const plan = parseP11AppServerSpikePlan(rawPlan);
  await validateOutputRoot(plan, dependencies);
  const candidate = await runObservedLaunch(plan, plan.candidate.launch, "candidate", dependencies);
  const mcp = await runMcpControl(plan, plan.controls.mcp.launch, plan.controls.mcp.healthServerName, plan.controls.mcp.healthToolName, dependencies);
  const pluginApp = await runPluginAppControl(plan, plan.controls.pluginApp.launch, plan.controls.pluginApp.expectedAppId, dependencies);
  const projectState = await runProjectStateControl(plan, plan.controls.projectState, dependencies);
  const controls = { mcp, pluginApp, projectState };
  const originClasses = originResults(plan, candidate, controls);
  const report = {
    version: P11_APP_SERVER_SPIKE_VERSION,
    kind: "p3-p11-app-server-spike-report-v1",
    feasibilityOnly: true,
    p11Authorization: "NOT_AUTHORIZED",
    coordinatorOnly: true,
    planStableJsonSha256: stableHash(plan),
    candidate,
    controls,
    originClasses,
    requiredApiCapabilities: requiredApiCapabilities(candidate),
    outcome: reportOutcome(candidate, originClasses),
    limitations: [
      "Capture timestamps are not a trusted time source.",
      "PID is only a weak process-identity indicator.",
      "An inventory-external call can refute completeness but cannot prove completeness when absent.",
      "The feasibility-turn prompt suppresses tool use; absence of inventory-external calls is only absence of a refutation signal, not evidence of inventory completeness.",
      "This report does not create isolationMechanism, clean-room, owner approval, or pair-lifecycle evidence.",
    ],
  };
  const reportPath = resolve(plan.outputRoot, "p3-p11-app-server-spike-report.json");
  if (!pathIsWithin(plan.outputRoot, reportPath)) throw new P11SpikeError("SPIKE_REPORT_PATH_ESCAPE");
  const artifact = await writeJsonExclusive(reportPath, report, dependencies.openFile ?? open);
  return { report, artifact };
}

function captureBoundedStream(stream, limit = WORKER_STDIO_LIMIT_BYTES) {
  const chunks = [];
  let retained = 0;
  let total = 0;
  let truncated = false;
  stream?.on("data", (chunk) => {
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (retained >= limit) {
      truncated = true;
      return;
    }
    const portion = bytes.subarray(0, Math.min(bytes.byteLength, limit - retained));
    chunks.push(portion);
    retained += portion.byteLength;
    if (portion.byteLength !== bytes.byteLength) truncated = true;
  });
  return {
    result() {
      return { bytes: total, retainedBytes: retained, truncated, value: Buffer.concat(chunks) };
    },
  };
}

function observeSupervisorWorkerClose(child) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };
    child.once("close", (exitCode, signal) => finish({ state: "closed", exitCode, signal }));
    child.once("error", (error) => finish({ state: "error", code: typeof error?.code === "string" ? error.code : null }));
  });
}

function waitForSupervisorWorkerClose(closePromise, timeoutMs) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(value);
    };
    const timer = setTimeout(() => finish({ state: "timeout" }), timeoutMs);
    closePromise.then(finish);
  });
}

async function assertFrozenCoordinatorOutputRoot(plan, frozen, realpathFn = realpath) {
  let current;
  try { current = await realpathFn(plan.coordinatorOutputRoot); }
  catch { throw new P11SpikeError("SPIKE_SUPERVISOR_OUTPUT_ROOT_CHANGED"); }
  if (!samePath(current, frozen.coordinatorOutputRoot.physical)) throw new P11SpikeError("SPIKE_SUPERVISOR_OUTPUT_ROOT_CHANGED");
  return current;
}

function coordinatorArtifactPath(plan, prefix) {
  const pathname = resolve(plan.coordinatorOutputRoot, prefix + "-" + randomUUID() + ".json");
  if (!pathIsWithin(plan.coordinatorOutputRoot, pathname) || pathIsWithin(plan.outputRoot, pathname, { allowRoot: true })) throw new P11SpikeError("SPIKE_SUPERVISOR_ARTIFACT_PATH_ESCAPE");
  return pathname;
}

function timeoutReceipt(plan, frozenPlan, worker, cleanup, now) {
  const reasons = ["SPIKE_OVERALL_DEADLINE_EXCEEDED"];
  if (cleanup.state !== "confirmed") reasons.push("SPIKE_PROCESS_TREE_CLEANUP_FAILED");
  reasons.push("NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API");
  return {
    version: 1,
    kind: "p3-p11-app-server-spike-timeout-receipt-v1",
    feasibilityOnly: true,
    p11Authorization: "NOT_AUTHORIZED",
    coordinatorOnly: true,
    recordedAt: now(),
    planStableJsonSha256: stableHash(plan),
    frozenPlan,
    supervisor: {
      path: SELF_PATH,
      processTreeHelper: { path: PROCESS_TREE_PATH, version: P11_PROCESS_TREE_VERSION },
    },
    deadline: { overallTimeoutMs: plan.overallTimeoutMs, state: "expired" },
    worker: {
      pid: worker.pid ?? null,
      pidLimit: "PID is only a weak process-identity indicator",
      close: cleanup.workerClose,
    },
    cleanup,
    candidate: { status: "unobservable", reason: "SPIKE_OVERALL_DEADLINE_EXCEEDED" },
    report: { state: "not-used-after-timeout" },
    outcome: { state: "NOT_AUTHORIZED", reasons },
    limitations: [
      "The timeout receipt does not parse or interpret partial raw transport artifacts.",
      "A timeout receipt is not a P-11 authorization mechanism or role-launch evidence.",
    ],
  };
}

/**
 * Public CLI supervisor.  The existing in-process `runP11AppServerSpike`
 * export remains available for dependency-injected fixture tests.  Actual
 * `--plan` CLI execution runs that worker under one bounded process tree.
 */
export async function runP11AppServerSpikeSupervised(planPath, dependencies = {}) {
  const {
    readFileFn = readFile,
    openFile = open,
    spawnFn = spawn,
    realpathFn = realpath,
    statFn = stat,
    readdirFn = readdir,
    now = () => new Date().toISOString(),
    terminateProcessTreeFn = terminateWindowsProcessTree,
  } = dependencies;
  const rawPlan = await parseJsonFile(planPath, readFileFn);
  const plan = parseP11AppServerSpikePlan(rawPlan);
  const frozenPaths = await validateOutputRoot(plan, { realpathFn, statFn, readdirFn });
  const frozenPlanPath = coordinatorArtifactPath(plan, "p3-p11-app-server-spike-worker-plan");
  await assertFrozenCoordinatorOutputRoot(plan, frozenPaths, realpathFn);
  const frozenPlan = await writeJsonExclusive(frozenPlanPath, plan, openFile);
  // The worker must not be spawned until the coordinator output root has
  // been checked again after the freeze-copy was committed.
  await assertFrozenCoordinatorOutputRoot(plan, frozenPaths, realpathFn);
  let worker;
  try {
    worker = spawnFn(process.execPath, [SELF_PATH, "--worker", "--plan", frozenPlan.path], {
      cwd: plan.coordinatorScratchRoot,
      env: { ...process.env },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new P11SpikeError("SPIKE_SUPERVISOR_WORKER_SPAWN_FAILED", typeof error?.code === "string" ? error.code : null);
  }
  const stdout = captureBoundedStream(worker.stdout);
  const stderr = captureBoundedStream(worker.stderr);
  const workerClose = observeSupervisorWorkerClose(worker);
  const workerResult = await waitForSupervisorWorkerClose(workerClose, plan.overallTimeoutMs);
  if (workerResult.state !== "timeout") {
    return { state: "completed", plan, frozenPlan, worker: workerResult, stdout: stdout.result(), stderr: stderr.result() };
  }
  if (worker.exitCode !== null || worker.signalCode !== null) {
    const racedClose = await waitForSupervisorWorkerClose(workerClose, PROCESS_TREE_CLEANUP_TIMEOUT_MS);
    if (racedClose.state !== "timeout") return { state: "completed", plan, frozenPlan, worker: racedClose, stdout: stdout.result(), stderr: stderr.result() };
  }
  let treeRequest = null;
  let treeError = null;
  try {
    treeRequest = await terminateProcessTreeFn(worker.pid, { timeoutMs: PROCESS_TREE_CLEANUP_TIMEOUT_MS });
  } catch (error) {
    treeError = processTreeErrorDetail(error);
    try { worker.kill(); } catch {}
  }
  const cleanupClose = await waitForSupervisorWorkerClose(workerClose, PROCESS_TREE_CLEANUP_TIMEOUT_MS);
  const cleanup = {
    state: treeRequest?.requested === true && cleanupClose.state === "closed" ? "confirmed" : "failed",
    processTreeRequest: treeRequest,
    processTreeError: treeError,
    workerClose: cleanupClose,
  };
  if (cleanup.state !== "confirmed") {
    try { worker.stdout?.destroy(); } catch {}
    try { worker.stderr?.destroy(); } catch {}
    try { worker.unref(); } catch {}
  }
  await assertFrozenCoordinatorOutputRoot(plan, frozenPaths, realpathFn);
  const receiptPath = coordinatorArtifactPath(plan, "p3-p11-app-server-spike-timeout-receipt");
  const receipt = timeoutReceipt(plan, frozenPlan, worker, cleanup, now);
  const artifact = await writeJsonExclusive(receiptPath, receipt, openFile);
  // Do not return a receipt merely because this process wrote it.  Recheck
  // the frozen root and verify the exact bytes that remain at that path.
  await assertFrozenCoordinatorOutputRoot(plan, frozenPaths, realpathFn);
  let receiptBytes;
  try { receiptBytes = await readFileFn(artifact.path); }
  catch { throw new P11SpikeError("SPIKE_SUPERVISOR_RECEIPT_READBACK_FAILED"); }
  if (receiptBytes.byteLength !== artifact.bytes || sha256(receiptBytes) !== artifact.sha256) {
    throw new P11SpikeError("SPIKE_SUPERVISOR_RECEIPT_READBACK_MISMATCH");
  }
  await assertFrozenCoordinatorOutputRoot(plan, frozenPaths, realpathFn);
  return { state: "timed-out", plan, frozenPlan, receipt, artifact, worker: cleanupClose, stdout: stdout.result(), stderr: stderr.result() };
}

async function parseJsonFile(pathname, readFileFn = readFile) {
  let bytes;
  try { bytes = await readFileFn(pathname); }
  catch { throw new P11SpikeError("SPIKE_PLAN_READ_FAILED"); }
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new P11SpikeError("SPIKE_PLAN_JSON_INVALID"); }
}

async function workerMain(args) {
  try {
    if (args.length !== 2 || args[0] !== "--plan" || !isAbsolute(args[1])) throw new P11SpikeError("USAGE");
    const { report, artifact } = await runP11AppServerSpike(await parseJsonFile(resolve(args[1])));
    console.log(JSON.stringify({ kind: report.kind, feasibilityOnly: true, p11Authorization: "NOT_AUTHORIZED", outcome: report.outcome.state, report: artifact }));
  } catch (error) {
    console.log(JSON.stringify({ kind: "p3-p11-app-server-spike-observation", feasibilityOnly: true, p11Authorization: "NOT_AUTHORIZED", outcome: "REJECTED", reason: safeError(error).code }));
    process.exitCode = 1;
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--worker") {
      await workerMain(args.slice(1));
      return;
    }
    if (args.length !== 2 || args[0] !== "--plan" || !isAbsolute(args[1])) throw new P11SpikeError("USAGE");
    const result = await runP11AppServerSpikeSupervised(resolve(args[1]));
    if (result.state === "timed-out") {
      console.log(JSON.stringify({ kind: result.receipt.kind, feasibilityOnly: true, p11Authorization: "NOT_AUTHORIZED", outcome: "NOT_AUTHORIZED", reason: result.receipt.outcome.reasons[0], receipt: result.artifact }));
      process.exitCode = 1;
      return;
    }
    if (result.stdout.truncated || result.worker.state !== "closed" || (result.worker.exitCode !== 0 && result.stdout.bytes === 0)) throw new P11SpikeError("SPIKE_SUPERVISOR_WORKER_RESULT_INVALID");
    process.stdout.write(result.stdout.value);
    if (result.worker.exitCode !== 0 || result.worker.signal !== null) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ kind: "p3-p11-app-server-spike-observation", feasibilityOnly: true, p11Authorization: "NOT_AUTHORIZED", outcome: "REJECTED", reason: safeError(error).code }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathKey(fileURLToPath(import.meta.url)) === pathKey(process.argv[1])) await main();
