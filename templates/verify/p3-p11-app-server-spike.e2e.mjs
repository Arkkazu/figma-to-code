#!/usr/bin/env node
// Regression coverage for the P-11 App Server feasibility-only spike.
// No Codex account, network, or real App Server is required: each launch uses
// a disposable JSON-RPC fixture subprocess.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const spikePath = resolve("templates/verify/p3-p11-app-server-spike.mjs");
const probePath = resolve("templates/verify/p3-clean-room-probe.mjs");
const capturePath = resolve("templates/verify/p3-p11-app-server-transport-capture.mjs");
const corePaths = [
  resolve("templates/verify/fidelity-benchmark.mjs"),
  resolve("templates/verify/figma-gate.mjs"),
  resolve("templates/verify/p3-page-provider.mjs"),
];
const repoRoot = resolve(".");
const { parseP11AppServerSpikePlan, runP11AppServerSpike, runP11AppServerSpikeSupervised, validateRawThreadStartBinding } = await import(pathToFileURL(spikePath).href);
const { startAppServerCapture } = await import(pathToFileURL(capturePath).href);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function require(condition, message) {
  if (!condition) throw new Error(message);
}

async function removeFixtureTree(pathname) {
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      rmSync(pathname, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

async function expectFailure(action, expected, label) {
  try { await action(); }
  catch (error) {
    if (error?.code === expected) return;
    throw new Error(label + ": expected " + expected + ", got " + (error?.code || error?.message || String(error)));
  }
  throw new Error(label + ": expected failure " + expected);
}

async function waitForFixtureFile(pathname, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(pathname)) {
    if (Date.now() >= deadline) throw new Error("fixture file did not appear: " + pathname);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function requirePidGone(pid, label) {
  require(Number.isInteger(pid) && pid > 0, label + ": invalid PID");
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code === "ESRCH") return;
    throw new Error(label + ": unexpected PID probe error " + (error?.code || error?.message || String(error)));
  }
  throw new Error(label + ": process still exists");
}

function fixtureServerSource() {
  return String.raw`import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
const fixtureMode = process.argv[2] || "candidate";
const rich = fixtureMode.startsWith("rich-");
const malformed = fixtureMode.startsWith("malformed-");
const mode = rich ? fixtureMode.slice("rich-".length) : (malformed ? fixtureMode.slice("malformed-".length) : fixtureMode);
let threadId = null;
let turnStarted = false;
let installedCalls = 0;
let slowInventoryResponsesRemaining = 0;
const fixturePidRecordPath = process.argv[3] || null;
if (mode === "deadline-tree" || mode === "linger-tree-on-eof" || mode === "version-tree") {
  if (typeof fixturePidRecordPath !== "string" || !fixturePidRecordPath) throw new Error("fixture PID record path is required");
  const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  writeFileSync(fixturePidRecordPath, JSON.stringify({ parentPid: process.pid, descendantPid: descendant.pid }) + "\n", "utf8");
}
function send(message) { process.stdout.write(JSON.stringify(message) + "\n"); }
function response(id, result) { send({ id, result }); }
function fieldMode() { return rich || malformed; }
function boundThreadId() { return malformed ? "wrong-thread-" + mode : threadId; }
function candidateMode() { return mode === "candidate" || mode === "candidate-slow-first-inventory" || mode === "candidate-no-project" || mode === "candidate-accessible-only" || mode === "candidate-app-list-unreconciled" || mode === "candidate-app-installed-only" || mode === "candidate-app-id-missing" || mode === "candidate-app-name-id-conflict" || mode === "candidate-app-id-duplicate" || mode === "candidate-app-callability-conflict" || mode === "candidate-missing-app-installed-response"; }
function projectStates() {
  if (!fieldMode()) return undefined;
  if (candidateMode() && mode !== "candidate-no-project") return [{ id: "p3-open-service-top-hero-pilot", origin: "mcp" }];
  if (mode === "project-trusted") return [{ id: "p11-project-trusted-marker", origin: "mcp" }];
  return [];
}
function bound(result) {
  if (!fieldMode()) return result;
  return { ...result, threadId: boundThreadId(), snapshotId: "snapshot-" + mode, processInstanceId: "server-process-" + mode, projectStates: projectStates() };
}
function mcpServer(name, toolName) {
  const tool = fieldMode() ? { name: toolName, origin: "mcp", enabled: true, callable: true } : { name: toolName };
  return fieldMode() ? { name, origin: "mcp", enabled: true, callable: true, tools: [tool] } : { name, tools: [tool] };
}
function installedApp(id, runtimeName) {
  if (!fieldMode()) return { id, runtimeName, enabled: true, callable: true };
  const result = { id, runtimeName, origin: "plugin", enabled: true };
  if (mode !== "candidate-accessible-only") result.callable = true;
  return result;
}
function listedApp(id, name) {
  const result = fieldMode() ? { name, origin: "plugin", isEnabled: true, isAccessible: true } : { name, isEnabled: true, isAccessible: true };
  if (id !== undefined) result.id = id;
  return result;
}
function mcpPage(cursor) {
  if (mode === "candidate-slow-first-inventory") return { data: [mcpServer("GitKraken", "status")], nextCursor: null };
  if (mode === "bad-cursor") return { data: [mcpServer("GitKraken", "status")], nextCursor: "repeat" };
  if (mode === "changing" && turnStarted) return { data: [mcpServer("node_repl", "eval")], nextCursor: null };
  if (cursor === "mcp-2") return { data: [mcpServer("figma", "get_design_context")], nextCursor: null };
  if (mode === "mcp-control") return { data: [mcpServer("p11-health", "ping")], nextCursor: null };
  if (mode === "project-trusted") return { data: [mcpServer("p11-project-trusted-marker", "observe")], nextCursor: null };
  return { data: [mcpServer("GitKraken", "status")], nextCursor: candidateMode() ? "mcp-2" : null };
}
function appInstalled() {
  if (mode === "plugin-control") return { apps: [installedApp("p11-safe-app", "P11 Safe App")] };
  const apps = [installedApp("documents", "Documents")];
  const callIndex = installedCalls++;
  if (candidateMode() && mode !== "candidate-app-list-unreconciled") {
    const browserId = mode === "candidate-app-name-id-conflict" ? "browser-installed" : "browser";
    const browser = installedApp(browserId, "Browser");
    if (mode === "candidate-app-callability-conflict" && callIndex > 0) browser.callable = false;
    apps.push(browser);
  }
  return { apps };
}
function appPage(cursor) {
  if (mode === "candidate-slow-first-inventory") return { data: [listedApp("documents", "Documents")], nextCursor: null };
  if (cursor === "app-2") {
    const browserId = mode === "candidate-app-id-missing" ? undefined : (mode === "candidate-app-name-id-conflict" ? "browser-listed" : "browser");
    return { data: [listedApp(browserId, "Browser")], nextCursor: null };
  }
  if (mode === "candidate-app-id-duplicate") return { data: [listedApp("documents", "Documents"), listedApp("documents", "Documents")], nextCursor: "app-2" };
  if (mode === "candidate-app-installed-only") return { data: [listedApp("documents", "Documents")], nextCursor: null };
  return { data: [listedApp(mode === "plugin-control" ? "p11-safe-app" : "documents", mode === "plugin-control" ? "P11 Safe App" : "Documents")], nextCursor: candidateMode() ? "app-2" : null };
}
function responseMaybeSlowFirstInventory(request, result) {
  if (mode === "candidate-slow-first-inventory" && slowInventoryResponsesRemaining > 0) {
    slowInventoryResponsesRemaining--;
    return setTimeout(() => response(request.id, result), 350);
  }
  return response(request.id, result);
}
if (mode === "linger-on-eof" || mode === "linger-tree-on-eof" || mode === "deadline-tree" || mode === "version-tree") setInterval(() => {}, 1000);
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (mode === "deadline-tree") return;
  if (!Object.prototype.hasOwnProperty.call(request, "id")) return;
  if (request.method === "initialize") return response(request.id, { platformFamily: "fixture", platformOs: "fixture" });
  if (request.method === "capture/backpressure-first") return response(request.id, { payload: "x".repeat(1024 * 1024) });
  if (request.method === "capture/backpressure-second") return response(request.id, { ok: true });
  if (request.method === "thread/start") {
    if (request.params?.sandbox !== "read-only") return send({ id: request.id, error: { code: -32600, message: "invalid sandbox" } });
    const start = () => {
      threadId = "thr-" + mode;
      if (mode === "candidate-slow-first-inventory") slowInventoryResponsesRemaining = 3;
      response(request.id, { thread: { id: threadId, sessionId: "session-" + mode } });
    };
    return mode === "candidate-slow-first-inventory" ? setTimeout(start, 450) : start();
  }
  if (request.method === "mcpServerStatus/list") {
    return responseMaybeSlowFirstInventory(request, bound(mcpPage(request.params.cursor)));
  }
  if (request.method === "app/installed") {
    if (mode === "candidate-missing-app-installed-response") return;
    return responseMaybeSlowFirstInventory(request, bound(appInstalled()));
  }
  if (request.method === "app/list") return responseMaybeSlowFirstInventory(request, bound(appPage(request.params.cursor)));
  if (request.method === "plugin/list") return response(request.id, { data: [{ id: "fixture-plugin" }], nextCursor: null });
  if (request.method === "mcpServer/tool/call") {
    const ok = request.params.threadId === threadId && request.params.serverName === "p11-health" && request.params.toolName === "ping" && JSON.stringify(request.params.arguments) === "{}";
    return ok ? response(request.id, { content: [{ type: "text", text: "pong" }] }) : send({ id: request.id, error: { code: -32602, message: "bad health ping" } });
  }
  if (request.method === "turn/start") {
    const id = "turn-" + mode;
    turnStarted = true;
    const turn = fieldMode() ? { id, status: "inProgress", threadId: boundThreadId(), snapshotId: "snapshot-" + mode } : { id, status: "inProgress" };
    response(request.id, { turn });
    send({ method: "turn/completed", params: { turn: { id, status: "completed" } } });
    return;
  }
  send({ id: request.id, error: { code: -32601, message: "unknown method" } });
});
`;
}

function launch(fixturePath, id, mode, codeHome, cwd, observationMode = "baseline") {
  return {
    id,
    executable: process.execPath,
    args: [fixturePath, observationMode === "baseline" ? mode : observationMode + "-" + mode],
    versionArgs: ["--version"],
    cwd,
    codeHome: { path: codeHome, profile: "disposable-profile" },
    sandboxProfile: "read-only",
    model: "gpt-5.6-terra",
  };
}

function plan(root, fixturePath, candidateMode = "candidate", observationMode = "baseline", timeoutMs = 3000) {
  const codeHomes = ["candidate", "mcp", "plugin", "trusted", "untrusted"].map((name) => join(root, "code-home-" + name));
  for (const pathname of codeHomes) mkdirSync(pathname, { recursive: true });
  const coordinatorScratchRoot = join(root, "coordinator-scratch");
  const coordinatorOutputRoot = join(root, "coordinator-output");
  const outputRoot = join(coordinatorOutputRoot, "run");
  const forbiddenRoot = join(root, "forbidden");
  mkdirSync(coordinatorScratchRoot, { recursive: true });
  mkdirSync(coordinatorOutputRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });
  const actualBaseline = join(forbiddenRoot, "actual-baseline");
  const actualCurrent = join(forbiddenRoot, "actual-current");
  return {
    version: 1,
    kind: "p3-p11-app-server-spike-v1",
    coordinatorOnly: true,
    coordinatorScratchRoot,
    coordinatorOutputRoot,
    outputRoot,
    forbiddenRoots: {
      sourceRoot: repoRoot,
      actualWorktrees: [actualBaseline, actualCurrent],
      commonGit: join(forbiddenRoot, "common-git"),
      pairLock: join(forbiddenRoot, "pair-lock"),
      fixedLedger: join(forbiddenRoot, "fixed-ledger"),
      figmaGate: join(forbiddenRoot, ".figma-gate"),
    },
    timeoutMs,
    catalog: {
      mcpServers: ["GitKraken", "node_repl", "figma", "openaiDeveloperDocs"],
      pluginApps: ["documents", "spreadsheets", "presentations", "browser-use", "pdf", "chrome", "template-creator", "sites", "visualize", "browser"],
      projectStates: ["p3-open-service-top-hero-pilot"],
    },
    candidate: { launch: launch(fixturePath, "candidate", candidateMode, codeHomes[0], coordinatorScratchRoot, observationMode) },
    controls: {
      negativeToolName: "p11-intentionally-absent",
      mcp: { launch: launch(fixturePath, "mcp-control", "mcp-control", codeHomes[1], coordinatorScratchRoot, observationMode), healthServerName: "p11-health", healthToolName: "ping" },
      pluginApp: { launch: launch(fixturePath, "plugin-control", "plugin-control", codeHomes[2], coordinatorScratchRoot, observationMode), expectedAppId: "p11-safe-app" },
      projectState: {
        trusted: launch(fixturePath, "project-trusted", "project-trusted", codeHomes[3], coordinatorScratchRoot, observationMode),
        untrusted: launch(fixturePath, "project-untrusted", "project-untrusted", codeHomes[4], coordinatorScratchRoot, observationMode),
        observable: { origin: "mcp", name: "p11-project-trusted-marker" },
      },
    },
  };
}

function target(report, className, id) {
  const origin = report.originClasses.find((item) => item.class === className);
  require(origin, "missing origin class " + className);
  const found = origin.targets.find((item) => item.id === id);
  require(found, "missing target " + id);
  return found;
}

function assertRawArtifact(ref) {
  const bytes = readFileSync(ref.path);
  require(sha256(bytes) === ref.sha256, "raw artifact hash mismatch: " + ref.path);
  require(bytes.byteLength === ref.bytes, "raw artifact byte count mismatch: " + ref.path);
}

function requireNotAuthorized(result, label) {
  require(result.report.p11Authorization === "NOT_AUTHORIZED" && result.report.outcome.state === "NOT_AUTHORIZED", label + " changed P-11 authorization");
  require(result.report.outcome.reasons.includes("NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API"), label + " removed unconditional NOT_AUTHORIZED reason");
}

const roots = [];
try {
  const root = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-"));
  roots.push(root);
  const fixturePath = join(root, "fixture-app-server.mjs");
  writeFileSync(fixturePath, fixtureServerSource(), "utf8");
  const sourceProbeBefore = sha256(readFileSync(probePath));
  const coreBefore = new Map(corePaths.map((pathname) => [pathname, sha256(readFileSync(pathname))]));
  const result = await runP11AppServerSpike(plan(root, fixturePath));
  const { report, artifact } = result;
  const savedReport = JSON.parse(readFileSync(artifact.path, "utf8"));
  require(report.feasibilityOnly === true && report.p11Authorization === "NOT_AUTHORIZED", "positive P-11 authorization appeared");
  require(savedReport.feasibilityOnly === true && savedReport.p11Authorization === "NOT_AUTHORIZED", "saved report changed authorization state");
  require(report.outcome.state === "NOT_AUTHORIZED", "outcome must remain NOT_AUTHORIZED");
  require(report.candidate.status === "observed", "candidate observation must succeed in fixture");
  require(report.candidate.prelaunchTransportMatch === true, "prelaunch/capture launch binding missing");
  require(report.candidate.rawThreadStartBinding?.state === "present", "raw thread/start did not bind cwd/sandbox/model to prelaunch");
  const candidateRawStdin = readFileSync(report.candidate.capture.rawTransport.stdin.path, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const candidateThreadStart = candidateRawStdin.find((entry) => entry.method === "thread/start");
  require(candidateThreadStart?.params?.sandbox === "read-only", "thread/start did not use the App Server read-only wire value");
  require(report.candidate.inventories.preRepeatStable === true, "two pre-turn inventories did not reproduce");
  require(report.candidate.inventories.prePostStable === true, "pre/post fixture inventory unexpectedly changed");
  require(report.candidate.inventories.first.pagination.mcp.pageCount === 2, "MCP pagination was not fully traversed");
  require(report.candidate.inventories.first.pagination.apps.pageCount === 2, "app pagination was not fully traversed");
  require(report.limitations.includes("The feasibility-turn prompt suppresses tool use; absence of inventory-external calls is only absence of a refutation signal, not evidence of inventory completeness."), "tool-suppression limitation is missing");
  require(report.controls.mcp.passed === true, "MCP positive control/ping did not pass: " + JSON.stringify(report.controls.mcp));
  require(report.controls.pluginApp.state === "unobservable", "baseline plugin/app control must not infer thread-bound raw inventory");
  require(report.controls.projectState.state === "unobservable", "baseline project control must not infer thread-bound raw inventory");
  require(target(report, "mcpServer", "GitKraken").state === "present", "observed MCP server was not present");
  require(target(report, "mcpServer", "node_repl").state === "absent", "complete MCP control did not permit observed-class absence");
  require(target(report, "pluginApp", "documents").state === "unobservable", "plugin/app must not be inferred from app snapshot");
  require(target(report, "projectState", "p3-open-service-top-hero-pilot").state === "unobservable", "project trusted state must not be inferred from control only");
  require(report.candidate.rawAppServerResponseEvidence.state === "unobservable", "baseline raw response lacking thread fields became observable");
  require(report.requiredApiCapabilities.atomicTurnStartBinding.observed === false, "two observations must not claim atomic turn binding");
  require(report.requiredApiCapabilities.snapshotId.observed === false, "missing snapshot API must stay unobserved");
  require(report.requiredApiCapabilities.processInstanceId.observed === false, "missing server process ID must stay unobserved");
  require(report.requiredApiCapabilities.origin.observed === false, "missing raw origin fields must stay unobserved");
  require(report.requiredApiCapabilities.enabledCallable.observed === false, "missing raw enabled/callable fields must stay unobserved");
  require(report.candidate.capture.rawTransport.stdin.bytes > 0 && report.candidate.capture.rawTransport.stdout.bytes > 0, "transport capture is empty");
  assertRawArtifact(report.candidate.capture.rawTransport.stdin);
  assertRawArtifact(report.candidate.capture.rawTransport.stdout);
  assertRawArtifact(report.candidate.capture.rawTransport.stderr);
  const candidatePrelaunch = JSON.parse(readFileSync(report.candidate.prelaunch.path, "utf8"));
  require(candidatePrelaunch.feasibilityOnly === true && candidatePrelaunch.p11Authorization === "NOT_AUTHORIZED", "prelaunch record exposes authorization path");
  require(candidatePrelaunch.transportCapture.path.endsWith("p3-p11-app-server-transport-capture.mjs"), "capture layer identity not fixed pre-launch");
  require(candidatePrelaunch.processTreeCleanup?.path.endsWith("p3-p11-process-tree.mjs"), "process-tree cleanup helper identity not fixed pre-launch");
  require(sourceProbeBefore === sha256(readFileSync(probePath)), "spike changed p3-clean-room-probe.mjs");
  for (const pathname of corePaths) {
    require(coreBefore.get(pathname) === sha256(readFileSync(pathname)), "spike changed P-3 runtime core: " + pathname);
    require(!readFileSync(pathname, "utf8").includes("p3-p11-app-server"), "P-3 runtime core imports spike: " + pathname);
  }

  // The public CLI path runs the same observation in a worker under a
  // supervisor.  A normal disposable run must retain the existing report
  // contract and worker output without entering the timeout receipt path.
  const supervisedRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-supervised-"));
  roots.push(supervisedRoot);
  const supervisedFixture = join(supervisedRoot, "fixture-app-server.mjs");
  const supervisedPlanPath = join(supervisedRoot, "input-plan.json");
  writeFileSync(supervisedFixture, fixtureServerSource(), "utf8");
  const supervisedPlan = plan(supervisedRoot, supervisedFixture);
  writeFileSync(supervisedPlanPath, JSON.stringify(supervisedPlan, null, 2) + "\n", "utf8");
  const supervised = await runP11AppServerSpikeSupervised(supervisedPlanPath);
  require(supervised.state === "completed" && supervised.worker.state === "closed" && supervised.worker.exitCode === 0, "supervised normal fixture did not complete");
  require(supervised.plan.overallTimeoutMs === 360000, "omitted overallTimeoutMs did not normalize to the v1 default");
  require(supervised.stdout.truncated === false, "supervised normal worker stdout was truncated");
  const supervisedConsole = JSON.parse(supervised.stdout.value.toString("utf8"));
  require(supervisedConsole.feasibilityOnly === true && supervisedConsole.p11Authorization === "NOT_AUTHORIZED" && supervisedConsole.outcome === "NOT_AUTHORIZED", "supervised normal worker changed authorization output");
  const supervisedReport = JSON.parse(readFileSync(supervisedConsole.report.path, "utf8"));
  require(supervisedReport.p11Authorization === "NOT_AUTHORIZED" && supervisedReport.outcome.state === "NOT_AUTHORIZED", "supervised normal report changed authorization");
  require(dirname(supervised.frozenPlan.path) === supervisedPlan.coordinatorOutputRoot, "supervisor freeze plan escaped coordinator output root");

  // A parent fixture and its Node grandchild both remain alive and ignore
  // requests.  The outer deadline must produce a coordinator-only receipt
  // and `taskkill /t` must leave neither process behind.
  const deadlineRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-deadline-tree-"));
  roots.push(deadlineRoot);
  const deadlineFixture = join(deadlineRoot, "fixture-app-server.mjs");
  const deadlinePidRecord = join(deadlineRoot, "deadline-tree-pids.json");
  const deadlinePlanPath = join(deadlineRoot, "input-plan.json");
  writeFileSync(deadlineFixture, fixtureServerSource(), "utf8");
  const deadlinePlan = plan(deadlineRoot, deadlineFixture, "deadline-tree", "baseline", 5000);
  deadlinePlan.overallTimeoutMs = 1000;
  deadlinePlan.candidate.launch.args = [deadlineFixture, "deadline-tree", deadlinePidRecord];
  writeFileSync(deadlinePlanPath, JSON.stringify(deadlinePlan, null, 2) + "\n", "utf8");
  const deadline = await runP11AppServerSpikeSupervised(deadlinePlanPath);
  require(deadline.state === "timed-out", "outer deadline did not return a timeout receipt");
  require(deadline.receipt.feasibilityOnly === true && deadline.receipt.p11Authorization === "NOT_AUTHORIZED", "outer deadline receipt changed authorization");
  require(deadline.receipt.outcome.state === "NOT_AUTHORIZED" && deadline.receipt.outcome.reasons.includes("SPIKE_OVERALL_DEADLINE_EXCEEDED"), "outer deadline reason missing");
  require(deadline.receipt.report.state === "not-used-after-timeout", "outer deadline interpreted a partial report");
  require(deadline.receipt.cleanup.state === "confirmed", "outer deadline did not confirm worker process-tree cleanup");
  require(dirname(deadline.artifact.path) === deadlinePlan.coordinatorOutputRoot, "timeout receipt is not outside outputRoot at coordinatorOutputRoot");
  require(!deadline.artifact.path.startsWith(deadlinePlan.outputRoot), "timeout receipt was written inside outputRoot");
  const deadlineReceiptBytes = readFileSync(deadline.artifact.path);
  require(deadline.artifact.bytes === deadlineReceiptBytes.byteLength && deadline.artifact.sha256 === sha256(deadlineReceiptBytes), "timeout receipt readback does not match its artifact reference");
  require(!existsSync(join(deadlinePlan.outputRoot, "p3-p11-app-server-spike-report.json")), "outer deadline created a report after timeout");
  await waitForFixtureFile(deadlinePidRecord);
  const deadlinePids = JSON.parse(readFileSync(deadlinePidRecord, "utf8"));
  requirePidGone(deadline.receipt.worker.pid, "outer deadline worker");
  requirePidGone(deadlinePids.parentPid, "outer deadline fixture parent");
  requirePidGone(deadlinePids.descendantPid, "outer deadline fixture descendant");

  // The prelaunch `versionArgs` command is also a spawned process tree.
  // Its own timeout must terminate a hanging fixture parent and grandchild,
  // rather than only signalling the direct Node child.
  const versionRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-version-tree-"));
  roots.push(versionRoot);
  const versionFixture = join(versionRoot, "fixture-app-server.mjs");
  const versionPidRecord = join(versionRoot, "version-tree-pids.json");
  writeFileSync(versionFixture, fixtureServerSource(), "utf8");
  const versionPlan = plan(versionRoot, versionFixture, "candidate", "baseline", 200);
  versionPlan.candidate.launch.versionArgs = [versionFixture, "version-tree", versionPidRecord];
  await expectFailure(() => runP11AppServerSpike(versionPlan), "SPIKE_VERSION_TIMEOUT", "version command tree timeout");
  await waitForFixtureFile(versionPidRecord);
  const versionPids = JSON.parse(readFileSync(versionPidRecord, "utf8"));
  requirePidGone(versionPids.parentPid, "version timeout fixture parent");
  requirePidGone(versionPids.descendantPid, "version timeout fixture descendant");

  // The child can outlive the launch deadline cumulatively while every RPC
  // remains individually timely.  The capture must remain alive through the
  // first inventory rather than killing the child at the spawn-relative time.
  const slowRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-slow-first-inventory-"));
  roots.push(slowRoot);
  const slowFixture = join(slowRoot, "fixture-app-server.mjs");
  writeFileSync(slowFixture, fixtureServerSource(), "utf8");
  const slow = await runP11AppServerSpike(plan(slowRoot, slowFixture, "candidate-slow-first-inventory", "baseline", 700));
  require(slow.report.candidate.status === "observed" && slow.report.candidate.failure === null, "cumulative but per-RPC-timely inventory must remain observed");
  require(slow.report.candidate.thread !== null && slow.report.candidate.inventories.first !== null, "slow first inventory did not reach a thread-bound inventory");
  require(!slow.report.outcome.reasons.includes("CAPTURE_CHILD_EXIT_TIMEOUT"), "spawn-relative lifetime timer interrupted a timely inventory");
  requireNotAuthorized(slow, "slow first inventory fixture");

  // The exit deadline still applies after stdin EOF: a child that ignores
  // shutdown must be killed rather than making close() wait indefinitely.
  const lingerRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-linger-on-eof-"));
  roots.push(lingerRoot);
  const lingerFixture = join(lingerRoot, "fixture-app-server.mjs");
  const lingerArtifacts = join(lingerRoot, "artifacts");
  const lingerHome = join(lingerRoot, "code-home");
  const lingerPidRecord = join(lingerRoot, "linger-tree-pids.json");
  mkdirSync(lingerArtifacts, { recursive: true });
  mkdirSync(lingerHome, { recursive: true });
  writeFileSync(lingerFixture, fixtureServerSource(), "utf8");
  const lingerTransport = await startAppServerCapture({
    launch: { executable: process.execPath, args: [lingerFixture, "linger-tree-on-eof", lingerPidRecord], cwd: lingerRoot, codeHome: lingerHome, codeHomeProfile: "disposable-profile", sandboxProfile: "read-only", model: "gpt-5.6-terra" },
    artifacts: { stdin: join(lingerArtifacts, "stdin.raw.jsonl"), stdout: join(lingerArtifacts, "stdout.raw.jsonl"), stderr: join(lingerArtifacts, "stderr.raw.bin") },
    timeoutMs: 100,
  });
  await waitForFixtureFile(lingerPidRecord);
  await expectFailure(() => lingerTransport.close(), "CAPTURE_CHILD_EXIT_TIMEOUT", "close must bound a child that ignores stdin EOF");
  const lingerPids = JSON.parse(readFileSync(lingerPidRecord, "utf8"));
  requirePidGone(lingerPids.parentPid, "EOF timeout fixture parent");
  requirePidGone(lingerPids.descendantPid, "EOF timeout fixture descendant");
  require(lingerTransport.summary().processTreeCleanup?.requested === true, "EOF timeout did not record a process-tree cleanup request");

  // Raw stdout persistence can be slower than JSON-RPC.  It must not put a
  // later stdin send behind that unrelated channel's write queue: otherwise a
  // per-RPC timeout rejects only an internal promise while request() remains
  // stuck awaiting send(), and the coordinator can never reach close/report.
  const backpressureRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-backpressure-"));
  roots.push(backpressureRoot);
  const backpressureFixture = join(backpressureRoot, "fixture-app-server.mjs");
  const backpressureArtifacts = join(backpressureRoot, "artifacts");
  const backpressureHome = join(backpressureRoot, "code-home");
  mkdirSync(backpressureArtifacts, { recursive: true });
  mkdirSync(backpressureHome, { recursive: true });
  writeFileSync(backpressureFixture, fixtureServerSource(), "utf8");
  const stdoutPath = join(backpressureArtifacts, "stdout.raw.jsonl");
  let releaseStdoutWrite;
  const stdoutWriteGate = new Promise((resolve) => { releaseStdoutWrite = resolve; });
  let markStdoutWriteStarted;
  const stdoutWriteStarted = new Promise((resolve) => { markStdoutWriteStarted = resolve; });
  let stdoutWriteMarked = false;
  const gatedOpenFile = async (pathname, flags, mode) => {
    const handle = await open(pathname, flags, mode);
    if (pathname !== stdoutPath) return handle;
    return {
      async write(...args) {
        if (!stdoutWriteMarked) {
          stdoutWriteMarked = true;
          markStdoutWriteStarted();
        }
        await stdoutWriteGate;
        return handle.write(...args);
      },
      close() { return handle.close(); },
    };
  };
  const backpressureTransport = await startAppServerCapture({
    launch: { executable: process.execPath, args: [backpressureFixture, "capture-backpressure"], cwd: process.cwd(), codeHome: backpressureHome, codeHomeProfile: "disposable-profile", sandboxProfile: "read-only", model: "gpt-5.6-terra" },
    artifacts: { stdin: join(backpressureArtifacts, "stdin.raw.jsonl"), stdout: stdoutPath, stderr: join(backpressureArtifacts, "stderr.raw.bin") },
    timeoutMs: 100,
    openFile: gatedOpenFile,
  });
  try {
    const firstBackpressureResponse = await backpressureTransport.request("capture/backpressure-first", {}, { timeoutMs: 1000 });
    require(typeof firstBackpressureResponse.result?.payload === "string", "backpressure fixture did not return the first response");
    await stdoutWriteStarted;
    const secondBackpressureRequest = backpressureTransport.request("capture/backpressure-second", {}, { timeoutMs: 100 });
    const secondBackpressureOutcome = await Promise.race([
      secondBackpressureRequest.then((response) => response.result?.ok === true ? "response" : "invalid-response", () => "rpc-error"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 250)),
    ]);
    require(secondBackpressureOutcome === "response", "stdout backpressure blocked a later stdin request: " + secondBackpressureOutcome);
    await secondBackpressureRequest;
  } finally {
    releaseStdoutWrite();
  }
  const backpressureCapture = await backpressureTransport.close();
  require(backpressureCapture.process.exitCode !== null || backpressureCapture.process.signal !== null, "backpressure child did not exit after close");
  assertRawArtifact(backpressureCapture.rawTransport.stdin);
  assertRawArtifact(backpressureCapture.rawTransport.stdout);
  assertRawArtifact(backpressureCapture.rawTransport.stderr);

  // A future thread-bound App Server response can be observed by this spike,
  // but it still cannot authorize P-11.  Every positive field retains a raw
  // request/response provenance chain rather than a normalized projection.
  const richRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-rich-"));
  roots.push(richRoot);
  const richFixture = join(richRoot, "fixture-app-server.mjs");
  writeFileSync(richFixture, fixtureServerSource(), "utf8");
  const rich = await runP11AppServerSpike(plan(richRoot, richFixture, "candidate", "rich"));
  require(rich.report.p11Authorization === "NOT_AUTHORIZED" && rich.report.outcome.state === "NOT_AUTHORIZED", "rich raw fields changed P-11 authorization");
  require(rich.report.outcome.reasons.includes("NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API"), "rich raw fields removed unconditional NOT_AUTHORIZED reason");
  for (const capability of ["snapshotId", "processInstanceId", "origin", "enabledCallable", "atomicTurnStartBinding"]) {
    require(rich.report.requiredApiCapabilities[capability].observed === true, "rich fixture did not observe " + capability);
  }
  require(rich.report.requiredApiCapabilities.snapshotId.value === "snapshot-candidate", "rich snapshot ID value missing");
  require(rich.report.requiredApiCapabilities.processInstanceId.value === "server-process-candidate", "rich process instance ID value missing");
  const snapshotProvenance = rich.report.requiredApiCapabilities.snapshotId.provenance[0];
  require(snapshotProvenance.responseId !== undefined && Number.isInteger(snapshotProvenance.responseSequence) && typeof snapshotProvenance.responseWireSha256 === "string" && typeof snapshotProvenance.rawStdout.sha256 === "string" && snapshotProvenance.fieldPath === "result.snapshotId", "snapshot raw response provenance incomplete");
  const atomicProvenance = rich.report.requiredApiCapabilities.atomicTurnStartBinding.provenance.turnSnapshot;
  require(atomicProvenance.responseId !== undefined && atomicProvenance.fieldPath === "result.turn.snapshotId", "turn snapshot provenance incomplete");
  const callableProvenance = rich.report.requiredApiCapabilities.enabledCallable.provenance.callable;
  require(callableProvenance.some((item) => item.requestMethod === "app/installed" && item.fieldPath.includes(".callable")), "installed callable provenance missing");
  require(callableProvenance.every((item) => item.requestMethod !== "app/list"), "app/list availability metadata became callability evidence");
  const richReconciliation = rich.report.candidate.rawAppServerResponseEvidence.appCollectionReconciliation;
  require(richReconciliation.observed === true, "rich app collection reconciliation was not observed");
  require(richReconciliation.value.installedCanonicalIdCount === 2 && richReconciliation.value.appListCanonicalIdCount === 2, "rich app collection ID counts are not reconciled");
  require(richReconciliation.value.listOnlyIds.length === 0 && richReconciliation.value.installedOnlyIds.length === 0, "rich app collection has an unreconciled ID");
  require(richReconciliation.provenance.installed.every((item) => item.idProvenance?.requestMethod === "app/installed") && richReconciliation.provenance.appList.every((item) => item.idProvenance?.requestMethod === "app/list"), "app collection reconciliation provenance is not raw-ID-method-specific");
  const richCallability = rich.report.requiredApiCapabilities.enabledCallable.value;
  require(richCallability.inventoryEntryCount > richCallability.callabilityEntryCount, "inventory and callability entry counts were not separated");
  require(rich.report.candidate.rawAppServerResponseEvidence.appListAvailability.observed === true, "rich app/list availability metadata was not recorded separately");
  require(rich.report.candidate.rawAppServerResponseEvidence.appListAvailability.value.entryCount === richReconciliation.value.appListEntryCount, "app/list availability count is not separately recorded from callability count");
  const availabilityProvenance = rich.report.candidate.rawAppServerResponseEvidence.appListAvailability.provenance.accessible[0];
  require(availabilityProvenance.requestMethod === "app/list" && availabilityProvenance.fieldPath.includes(".isAccessible"), "app/list isAccessible provenance missing");
  require(target(rich.report, "pluginApp", "documents").state === "present", "rich thread-bound plugin/app target was not present");
  require(target(rich.report, "pluginApp", "spreadsheets").state === "absent", "rich thread-bound plugin/app target was not absent");
  require(target(rich.report, "projectState", "p3-open-service-top-hero-pilot").state === "present", "rich thread-bound project state was not present");

  // Each raw inventory method must have a thread-bound request/response pair.
  // An unpaired app/installed request cannot silently narrow enabled/callable
  // coverage to MCP or app/list entries.
  const missingInstalledResponseRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-missing-installed-response-"));
  roots.push(missingInstalledResponseRoot);
  const missingInstalledResponseFixture = join(missingInstalledResponseRoot, "fixture-app-server.mjs");
  writeFileSync(missingInstalledResponseFixture, fixtureServerSource(), "utf8");
  const missingInstalledResponse = await runP11AppServerSpike(plan(missingInstalledResponseRoot, missingInstalledResponseFixture, "candidate-missing-app-installed-response", "rich"));
  const missingInstalledRawEvidence = missingInstalledResponse.report.candidate.rawAppServerResponseEvidence;
  require(missingInstalledRawEvidence.state === "unobservable", "unpaired app/installed request became raw inventory evidence");
  require(missingInstalledRawEvidence.reason === "RAW_THREAD_BOUND_INVENTORY_METHOD_SET_INCOMPLETE", "missing app/installed pair reason missing");
  require(missingInstalledResponse.report.requiredApiCapabilities.enabledCallable.observed === false, "missing app/installed pair observed enabled/callable coverage");
  requireNotAuthorized(missingInstalledResponse, "missing app/installed pair fixture");

  // `app/list` availability (`isEnabled` / `isAccessible`) does not make an
  // app callable.  The installed response must itself attest `callable`.
  const accessibleOnlyRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-accessible-only-"));
  roots.push(accessibleOnlyRoot);
  const accessibleOnlyFixture = join(accessibleOnlyRoot, "fixture-app-server.mjs");
  writeFileSync(accessibleOnlyFixture, fixtureServerSource(), "utf8");
  const accessibleOnly = await runP11AppServerSpike(plan(accessibleOnlyRoot, accessibleOnlyFixture, "candidate-accessible-only", "rich"));
  require(accessibleOnly.report.candidate.rawAppServerResponseEvidence.appListAvailability.observed === true, "isAccessible-only fixture did not retain separate availability evidence");
  require(accessibleOnly.report.requiredApiCapabilities.enabledCallable.observed === false, "isAccessible-only app/list metadata became callable evidence");
  require(accessibleOnly.report.requiredApiCapabilities.enabledCallable.reason !== "APP_LIST_ENTRY_WITHOUT_INSTALLED_CALLABILITY", "isAccessible-only fixture is confounded by an unreconciled app/list entry");
  require(accessibleOnly.report.p11Authorization === "NOT_AUTHORIZED" && accessibleOnly.report.outcome.state === "NOT_AUTHORIZED", "isAccessible-only fixture changed P-11 authorization");
  require(accessibleOnly.report.outcome.reasons.includes("NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API"), "isAccessible-only fixture removed unconditional NOT_AUTHORIZED reason");

  // An app listed by app/list without a same-ID app/installed entry has
  // availability metadata only.  It must fail the callability completeness
  // check rather than being silently excluded from the calculation.
  const unreconciledRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-unreconciled-"));
  roots.push(unreconciledRoot);
  const unreconciledFixture = join(unreconciledRoot, "fixture-app-server.mjs");
  writeFileSync(unreconciledFixture, fixtureServerSource(), "utf8");
  const unreconciled = await runP11AppServerSpike(plan(unreconciledRoot, unreconciledFixture, "candidate-app-list-unreconciled", "rich"));
  const unreconciledCollections = unreconciled.report.candidate.rawAppServerResponseEvidence.appCollectionReconciliation;
  require(unreconciledCollections.observed === true, "unreconciled app collections did not retain raw reconciliation evidence");
  require(unreconciledCollections.value.installedCanonicalIdCount === 1 && unreconciledCollections.value.appListCanonicalIdCount === 2, "unreconciled app collection counts are not recorded");
  require(unreconciledCollections.value.listOnlyIds.length === 1 && unreconciledCollections.value.listOnlyIds[0] === "browser", "unreconciled app/list ID was not recorded");
  require(unreconciledCollections.value.listOnlyNames.length === 1 && unreconciledCollections.value.listOnlyNames[0] === "Browser", "unreconciled app/list display name was not recorded");
  require(unreconciledCollections.provenance.listOnly.length > 0 && unreconciledCollections.provenance.listOnly.every((item) => item.idProvenance?.requestMethod === "app/list" && item.idProvenance.fieldPath.includes(".id")), "unreconciled app/list provenance is not raw-ID-derived");
  require(unreconciled.report.requiredApiCapabilities.enabledCallable.observed === false, "app/list-only entry became callable-complete");
  require(unreconciled.report.requiredApiCapabilities.enabledCallable.reason === "APP_LIST_ENTRY_WITHOUT_INSTALLED_CALLABILITY", "app/list-only entry reason missing");
  require(unreconciled.report.requiredApiCapabilities.enabledCallable.appCollectionReconciliation?.value?.listOnlyIds?.includes("browser"), "required capability report omitted reconciliation evidence");
  require(unreconciled.report.p11Authorization === "NOT_AUTHORIZED" && unreconciled.report.outcome.state === "NOT_AUTHORIZED", "unreconciled app/list fixture changed P-11 authorization");
  require(unreconciled.report.outcome.reasons.includes("NO_ATOMIC_COMPLETE_MODEL_VISIBLE_TOOL_SURFACE_API"), "unreconciled app/list fixture removed unconditional NOT_AUTHORIZED reason");

  // An installed-only app does not invalidate callability coverage: this
  // helper records it separately without treating app/list as an API subset.
  const installedOnlyRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-installed-only-"));
  roots.push(installedOnlyRoot);
  const installedOnlyFixture = join(installedOnlyRoot, "fixture-app-server.mjs");
  writeFileSync(installedOnlyFixture, fixtureServerSource(), "utf8");
  const installedOnly = await runP11AppServerSpike(plan(installedOnlyRoot, installedOnlyFixture, "candidate-app-installed-only", "rich"));
  const installedOnlyCollections = installedOnly.report.candidate.rawAppServerResponseEvidence.appCollectionReconciliation;
  require(installedOnlyCollections.observed === true, "installed-only app collection was not reconciled");
  require(installedOnlyCollections.value.listOnlyIds.length === 0, "installed-only fixture produced a list-only ID");
  require(installedOnlyCollections.value.installedOnlyIds.length === 1 && installedOnlyCollections.value.installedOnlyIds[0] === "browser", "installed-only browser ID was not recorded");
  require(installedOnlyCollections.provenance.installedOnly.length > 0 && installedOnlyCollections.provenance.installedOnly.every((item) => item.id === "browser" && item.idProvenance?.requestMethod === "app/installed"), "installed-only browser provenance is not raw app/installed evidence");
  require(installedOnly.report.requiredApiCapabilities.enabledCallable.observed === true, "installed-only app incorrectly failed enabled/callable coverage");
  requireNotAuthorized(installedOnly, "installed-only app fixture");

  // Canonical IDs must be present.  A display name is diagnostic metadata and
  // is never a fallback identity for reconciliation.
  const missingIdRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-missing-id-"));
  roots.push(missingIdRoot);
  const missingIdFixture = join(missingIdRoot, "fixture-app-server.mjs");
  writeFileSync(missingIdFixture, fixtureServerSource(), "utf8");
  const missingId = await runP11AppServerSpike(plan(missingIdRoot, missingIdFixture, "candidate-app-id-missing", "rich"));
  const missingIdCollections = missingId.report.candidate.rawAppServerResponseEvidence.appCollectionReconciliation;
  require(missingIdCollections.observed === false && missingIdCollections.reason === "RAW_APP_COLLECTION_CANONICAL_ID_MISSING_OR_AMBIGUOUS", "missing app canonical ID did not fail reconciliation");
  require(missingIdCollections.provenance.missingCanonicalIds.some((item) => item.id === null && item.name === "Browser" && item.nameProvenance?.requestMethod === "app/list"), "missing app canonical ID did not retain raw display-name provenance");
  require(missingId.report.requiredApiCapabilities.enabledCallable.observed === false && missingId.report.requiredApiCapabilities.enabledCallable.reason === "RAW_APP_COLLECTION_CANONICAL_ID_MISSING_OR_AMBIGUOUS", "missing app canonical ID did not fail enabled/callable capability");
  requireNotAuthorized(missingId, "missing app canonical ID fixture");

  // Equal display names with different raw IDs are a contradictory identity,
  // not a reconciliation success through a display-name fallback.
  const nameConflictRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-name-id-conflict-"));
  roots.push(nameConflictRoot);
  const nameConflictFixture = join(nameConflictRoot, "fixture-app-server.mjs");
  writeFileSync(nameConflictFixture, fixtureServerSource(), "utf8");
  const nameConflict = await runP11AppServerSpike(plan(nameConflictRoot, nameConflictFixture, "candidate-app-name-id-conflict", "rich"));
  const nameConflictCollections = nameConflict.report.candidate.rawAppServerResponseEvidence.appCollectionReconciliation;
  require(nameConflictCollections.observed === false && nameConflictCollections.reason === "RAW_APP_COLLECTION_NAME_ID_CONFLICT", "same display name with different app IDs did not fail reconciliation");
  require(nameConflictCollections.value.conflictingDisplayNames.includes("Browser"), "name/ID conflict display name was not recorded");
  require(nameConflictCollections.provenance.conflictingDisplayNames.some((item) => item.id === "browser-installed" && item.idProvenance?.requestMethod === "app/installed") && nameConflictCollections.provenance.conflictingDisplayNames.some((item) => item.id === "browser-listed" && item.idProvenance?.requestMethod === "app/list"), "name/ID conflict did not retain both raw-ID provenances");
  require(nameConflict.report.requiredApiCapabilities.enabledCallable.observed === false && nameConflict.report.requiredApiCapabilities.enabledCallable.reason === "RAW_APP_COLLECTION_NAME_ID_CONFLICT", "name/ID conflict did not fail enabled/callable capability");
  requireNotAuthorized(nameConflict, "name/ID conflict fixture");

  // Duplicated canonical IDs within one raw response/page are invalid.  The
  // same ID across separate pre/post inventories remains allowed.
  const duplicateIdRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-duplicate-id-"));
  roots.push(duplicateIdRoot);
  const duplicateIdFixture = join(duplicateIdRoot, "fixture-app-server.mjs");
  writeFileSync(duplicateIdFixture, fixtureServerSource(), "utf8");
  const duplicateId = await runP11AppServerSpike(plan(duplicateIdRoot, duplicateIdFixture, "candidate-app-id-duplicate", "rich"));
  const duplicateIdCollections = duplicateId.report.candidate.rawAppServerResponseEvidence.appCollectionReconciliation;
  require(duplicateIdCollections.observed === false && duplicateIdCollections.reason === "RAW_APP_COLLECTION_DUPLICATE_CANONICAL_ID", "duplicate app canonical ID did not fail reconciliation");
  require(duplicateIdCollections.value.duplicateCanonicalIds.includes("documents"), "duplicate canonical ID was not recorded");
  require(duplicateIdCollections.provenance.duplicateCanonicalIds.every((item) => item.idProvenance?.requestMethod === "app/list"), "duplicate canonical ID provenance is not app/list raw evidence");
  require(duplicateId.report.requiredApiCapabilities.enabledCallable.observed === false && duplicateId.report.requiredApiCapabilities.enabledCallable.reason === "RAW_APP_COLLECTION_DUPLICATE_CANONICAL_ID", "duplicate app canonical ID did not fail enabled/callable capability");
  requireNotAuthorized(duplicateId, "duplicate app canonical ID fixture");

  // Repeated inventories may repeat the same app ID, but its installed
  // enabled/callable values must not contradict one another.
  const callabilityConflictRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-callability-conflict-"));
  roots.push(callabilityConflictRoot);
  const callabilityConflictFixture = join(callabilityConflictRoot, "fixture-app-server.mjs");
  writeFileSync(callabilityConflictFixture, fixtureServerSource(), "utf8");
  const callabilityConflict = await runP11AppServerSpike(plan(callabilityConflictRoot, callabilityConflictFixture, "candidate-app-callability-conflict", "rich"));
  const callabilityConflictCollections = callabilityConflict.report.candidate.rawAppServerResponseEvidence.appCollectionReconciliation;
  require(callabilityConflictCollections.observed === false && callabilityConflictCollections.reason === "RAW_APP_INSTALLED_CALLABILITY_NOT_UNIFORM", "contradictory installed callability did not fail reconciliation");
  require(callabilityConflictCollections.value.conflictingCallabilityIds.includes("browser"), "contradictory installed callability ID was not recorded");
  require(callabilityConflictCollections.provenance.conflictingCallabilityIds.every((item) => item.idProvenance?.requestMethod === "app/installed"), "contradictory callability provenance is not app/installed raw evidence");
  require(callabilityConflict.report.requiredApiCapabilities.enabledCallable.observed === false && callabilityConflict.report.requiredApiCapabilities.enabledCallable.reason === "RAW_APP_INSTALLED_CALLABILITY_NOT_UNIFORM", "contradictory installed callability did not fail enabled/callable capability");
  requireNotAuthorized(callabilityConflict, "contradictory installed callability fixture");

  // A complete, empty thread-bound project-state list may establish absence
  // only when its raw positive and negative controls are also present.
  const richAbsentRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-rich-absent-"));
  roots.push(richAbsentRoot);
  const richAbsentFixture = join(richAbsentRoot, "fixture-app-server.mjs");
  writeFileSync(richAbsentFixture, fixtureServerSource(), "utf8");
  const richAbsent = await runP11AppServerSpike(plan(richAbsentRoot, richAbsentFixture, "candidate-no-project", "rich"));
  require(target(richAbsent.report, "projectState", "p3-open-service-top-hero-pilot").state === "absent", "rich empty project-state list did not establish controlled absence");
  require(richAbsent.report.p11Authorization === "NOT_AUTHORIZED" && richAbsent.report.outcome.state === "NOT_AUTHORIZED", "rich project absence changed P-11 authorization");

  // Lookalike fields with a mismatched response thread ID are not evidence.
  const malformedRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-malformed-"));
  roots.push(malformedRoot);
  const malformedFixture = join(malformedRoot, "fixture-app-server.mjs");
  writeFileSync(malformedFixture, fixtureServerSource(), "utf8");
  const malformed = await runP11AppServerSpike(plan(malformedRoot, malformedFixture, "candidate", "malformed"));
  require(malformed.report.candidate.rawAppServerResponseEvidence.state === "unobservable", "mismatched raw response thread ID became observable");
  for (const capability of ["snapshotId", "processInstanceId", "origin", "enabledCallable", "atomicTurnStartBinding"]) {
    require(malformed.report.requiredApiCapabilities[capability].observed === false, "mismatched raw response thread ID observed " + capability);
  }
  require(target(malformed.report, "pluginApp", "documents").state === "unobservable", "mismatched raw plugin/app response became observed");
  require(target(malformed.report, "projectState", "p3-open-service-top-hero-pilot").state === "unobservable", "mismatched raw project response became observed");
  require(malformed.report.p11Authorization === "NOT_AUTHORIZED" && malformed.report.outcome.state === "NOT_AUTHORIZED", "malformed raw response changed P-11 authorization");

  // A syntactically valid but non-reproducible cursor stream never becomes an
  // observed absence.  The report remains feasibility-only and fail-closed.
  const badRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-bad-"));
  roots.push(badRoot);
  const badFixture = join(badRoot, "fixture-app-server.mjs");
  writeFileSync(badFixture, fixtureServerSource(), "utf8");
  const bad = await runP11AppServerSpike(plan(badRoot, badFixture, "bad-cursor"));
  require(bad.report.p11Authorization === "NOT_AUTHORIZED", "cursor failure changed P-11 authorization");
  require(bad.report.candidate.status === "unobservable", "repeated cursor must fail candidate observation");
  require(target(bad.report, "mcpServer", "node_repl").state === "unobservable", "failed pagination must not become absence");

  // A stable pre-turn pair is insufficient when the post-turn surface differs:
  // no missing MCP target may be labelled absent.
  const changingRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-changing-"));
  roots.push(changingRoot);
  const changingFixture = join(changingRoot, "fixture-app-server.mjs");
  writeFileSync(changingFixture, fixtureServerSource(), "utf8");
  const changing = await runP11AppServerSpike(plan(changingRoot, changingFixture, "changing"));
  require(changing.report.candidate.inventories.prePostStable === false, "changing fixture did not expose post-turn drift");
  require(target(changing.report, "mcpServer", "openaiDeveloperDocs").state === "unobservable", "post-turn drift must prevent observed-class absence");

  // The raw stdin is re-read after capture.  A semantically altered
  // thread/start record cannot be repaired by a matching prelaunch record.
  const badRawPath = join(root, "bad-thread-start.raw.jsonl");
  const badRaw = Buffer.from(JSON.stringify({ method: "thread/start", id: 2, params: { cwd: join(root, "wrong"), sandbox: "read-only", approvalPolicy: "never" } }) + "\n", "utf8");
  writeFileSync(badRawPath, badRaw);
  const rawBinding = await validateRawThreadStartBinding({ rawTransport: { stdin: { path: badRawPath, sha256: sha256(badRaw), bytes: badRaw.byteLength } } }, candidatePrelaunch);
  require(rawBinding.state === "unobservable" && rawBinding.reason === "SPIKE_RAW_THREAD_START_PRELAUNCH_MISMATCH", "raw thread/start mismatch was accepted");
  const rawHashMismatch = await validateRawThreadStartBinding({ rawTransport: { stdin: { path: badRawPath, sha256: "0".repeat(64), bytes: badRaw.byteLength } } }, candidatePrelaunch);
  require(rawHashMismatch.state === "unobservable" && rawHashMismatch.reason === "SPIKE_RAW_STDIN_HASH_MISMATCH", "raw stdin hash mismatch was accepted");

  // The coordinator refuses a capture layer whose independently observed
  // spawn parameters differ from the already-written prelaunch record.
  const mismatchRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-mismatch-"));
  roots.push(mismatchRoot);
  const mismatchFixture = join(mismatchRoot, "fixture-app-server.mjs");
  writeFileSync(mismatchFixture, fixtureServerSource(), "utf8");
  const mismatch = await runP11AppServerSpike(plan(mismatchRoot, mismatchFixture), {
    captureStart: async (args) => {
      const transport = await startAppServerCapture(args);
      transport.observedLaunch = { ...transport.observedLaunch, cwd: join(mismatchRoot, "wrong-cwd") };
      return transport;
    },
  });
  require(mismatch.report.candidate.status === "unobservable", "prelaunch/capture mismatch was accepted");
  require(mismatch.report.candidate.failure?.code === "SPIKE_PRELAUNCH_TRANSPORT_MISMATCH", "prelaunch/capture mismatch reason missing");

  const invalid = plan(root, fixturePath);
  invalid.outputRoot = resolve("templates", "verify", "p3-p11-unsafe-output");
  invalid.coordinatorOutputRoot = resolve("templates", "verify");
  await expectFailure(() => Promise.resolve(parseP11AppServerSpikePlan(invalid)), "SPIKE_OUTPUT_ROOT_IN_SOURCE_TREE", "source-tree output path");
  const originalCwd = process.cwd();
  const alternateCwd = join(root, "alternate-cwd");
  mkdirSync(alternateCwd, { recursive: true });
  try {
    process.chdir(alternateCwd);
    const differentCwdSourceOutput = plan(root, fixturePath);
    differentCwdSourceOutput.coordinatorOutputRoot = join(repoRoot, "templates", "verify");
    differentCwdSourceOutput.outputRoot = join(differentCwdSourceOutput.coordinatorOutputRoot, "p3-p11-unsafe-output-from-alternate-cwd");
    await expectFailure(() => Promise.resolve(parseP11AppServerSpikePlan(differentCwdSourceOutput)), "SPIKE_OUTPUT_ROOT_IN_SOURCE_TREE", "source-tree output path from alternate cwd");
  } finally {
    process.chdir(originalCwd);
  }
  const wrongSourceRoot = mkdtempSync(join(tmpdir(), "p3-p11-app-server-spike-source-root-"));
  roots.push(wrongSourceRoot);
  const wrongSourceFixture = join(wrongSourceRoot, "fixture-app-server.mjs");
  writeFileSync(wrongSourceFixture, fixtureServerSource(), "utf8");
  const wrongSourcePlan = plan(wrongSourceRoot, wrongSourceFixture);
  const nonRepoSourceRoot = join(wrongSourceRoot, "not-the-template-repo-root");
  mkdirSync(nonRepoSourceRoot, { recursive: true });
  wrongSourcePlan.forbiddenRoots.sourceRoot = nonRepoSourceRoot;
  await expectFailure(() => runP11AppServerSpike(wrongSourcePlan), "SPIKE_FORBIDDEN_SOURCE_ROOT_MISMATCH", "source root must be helper-derived repository root");
  const dangerousSandbox = plan(root, fixturePath);
  dangerousSandbox.candidate.launch.sandboxProfile = "workspace-write";
  await expectFailure(() => Promise.resolve(parseP11AppServerSpikePlan(dangerousSandbox)), "SPIKE_SANDBOX_PROFILE_NOT_READ_ONLY", "dangerous sandbox profile");
  const legacySandbox = plan(root, fixturePath);
  legacySandbox.candidate.launch.sandboxProfile = "readOnly";
  await expectFailure(() => Promise.resolve(parseP11AppServerSpikePlan(legacySandbox)), "SPIKE_SANDBOX_PROFILE_NOT_READ_ONLY", "legacy camelCase sandbox profile");
  const outsideScratch = plan(root, fixturePath);
  outsideScratch.candidate.launch.cwd = join(root, "outside-coordinator-scratch");
  await expectFailure(() => Promise.resolve(parseP11AppServerSpikePlan(outsideScratch)), "SPIKE_LAUNCH_CWD_OUTSIDE_COORDINATOR_SCRATCH", "launch cwd outside coordinator scratch");
  const forbiddenCoordinatorPath = plan(root, fixturePath);
  forbiddenCoordinatorPath.coordinatorScratchRoot = forbiddenCoordinatorPath.forbiddenRoots.actualWorktrees[0];
  for (const candidateLaunch of [forbiddenCoordinatorPath.candidate.launch, forbiddenCoordinatorPath.controls.mcp.launch, forbiddenCoordinatorPath.controls.pluginApp.launch, forbiddenCoordinatorPath.controls.projectState.trusted, forbiddenCoordinatorPath.controls.projectState.untrusted]) candidateLaunch.cwd = forbiddenCoordinatorPath.coordinatorScratchRoot;
  await expectFailure(() => Promise.resolve(parseP11AppServerSpikePlan(forbiddenCoordinatorPath)), "SPIKE_COORDINATOR_PATH_OVERLAPS_FORBIDDEN_ROOT", "forbidden coordinator/launch path");
  const forbiddenOutput = plan(root, fixturePath);
  forbiddenOutput.coordinatorOutputRoot = join(root, "forbidden");
  forbiddenOutput.outputRoot = join(forbiddenOutput.coordinatorOutputRoot, "actual-baseline", "spike-output");
  await expectFailure(() => Promise.resolve(parseP11AppServerSpikePlan(forbiddenOutput)), "SPIKE_COORDINATOR_PATH_OVERLAPS_FORBIDDEN_ROOT", "forbidden output path");
  console.log("p3-p11-app-server-spike E2E PASS");
} finally {
  for (const root of roots) await removeFixtureTree(root);
}
