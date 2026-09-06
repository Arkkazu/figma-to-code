#!/usr/bin/env node
// Synchronous PreToolUse adapter. This is a guardrail, not an OS security boundary.
// Hook trust, script integrity and non-hooked tool paths must be managed externally.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { collectScopeLockStateFindings } from "../templates/verify/scope-lock-state.mjs";
import { evaluateWorkflowEnvironment } from "./workflow-preflight.mjs";

export const TOOL = fileURLToPath(import.meta.url);
export const PLAYBOOK_ROOT = resolve(dirname(TOOL), "..");
const CONFIG = ".codex/edit-guard.json";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hash = (path) => digest(readFileSync(path));
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function repositoryRoot(cwd) {
  check(typeof cwd === "string" && isAbsolute(cwd), "Hook cwd must be absolute.");
  let path = realpathSync(cwd);
  for (;;) {
    if (existsSync(resolve(path, ".git"))) return path;
    const parent = dirname(path);
    check(parent !== path, "No Git repository at hook cwd.");
    path = parent;
  }
}

// Resolve relative to the tool's actual cwd, not just the Git root. Reject aliases
// (symlinks/junctions, traversal, ADS, Windows trailing dots/spaces) before writing.
export function checkedPath(root, cwd, value) {
  check(typeof value === "string" && value.length > 0, "Empty edit path.");
  check(!/[\x00-\x1f*?]/.test(value), "Control characters/globs are not edit paths.");
  const portable = value.replaceAll("\\", "/");
  const segments = portable.replace(/^[A-Za-z]:\//, "").split("/");
  check(!segments.some((part) => part === ".." || /[. ]$/.test(part) || part.includes(":")), "Ambiguous/traversing edit path.");
  check(!/^[A-Za-z]:[^/]/.test(portable), "Drive-relative edit path.");
  const absolute = resolve(cwd, value);
  const rel = relative(root, absolute);
  check(rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), "Edit path is outside repository.");
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) {
      // existsSync is false for a dangling link; lstat still finds it.
      try { check(!lstatSync(cursor).isSymbolicLink(), "Symlink edit path denied."); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      continue;
    }
    const stat = lstatSync(cursor);
    check(!stat.isSymbolicLink(), "Symlink/junction edit path denied.");
    check(!stat.isFile() || stat.nlink === 1, "Hard-linked edit path denied.");
    check(same(realpathSync(cursor), cursor), "Resolved edit path differs from declared path.");
  }
  return { absolute, path: rel.replaceAll("\\", "/") };
}

export function patchPaths(patch) {
  check(typeof patch === "string", "apply_patch.command must be text.");
  const lines = patch.replaceAll("\r\n", "\n").trimEnd().split("\n");
  check(lines[0] === "*** Begin Patch" && lines.at(-1) === "*** End Patch", "Unrecognized patch envelope.");
  const paths = [];
  let operation = null;
  for (const line of lines.slice(1, -1)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header) { operation = header[1]; paths.push(header[2]); continue; }
    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (move) { check(operation === "Update", "Move without Update."); paths.push(move[1]); continue; }
    check(operation !== null && (/^[ +\-]/.test(line) || line.startsWith("@@") || line === "*** End of File"), "Unrecognized patch body.");
  }
  check(paths.length > 0, "Patch has no target paths.");
  return [...new Set(paths)];
}

function readLock(root, statePath, expectedScopeId) {
  const stateFile = checkedPath(root, root, statePath);
  const state = json(stateFile.absolute);
  const findings = collectScopeLockStateFindings(state, { repoRoot: root, expectedScopeId, requireEditable: true });
  check(findings.length === 0, findings.join("\n"));
  check(same(realpathSync(state.scope.repoPath), root), "Scope lock belongs to another repository.");
  const begin = state.history.find((entry) => entry.action === "begin");
  check(begin && /^[a-f0-9]{64}$/.test(begin.scopeManifestSha256), "Scope lock has no hashed begin record.");
  const manifest = checkedPath(root, root, begin.scopeManifestPath);
  check(hash(manifest.absolute) === begin.scopeManifestSha256, "Scope manifest changed after begin.");
  return { state, stateFile, begin };
}

function runVerifier(file, argv, cwd) {
  const result = spawnSync(process.execPath, [file, ...argv], { cwd, encoding: "utf8", timeout: 20000, windowsHide: true });
  check(result.status === 0 && !result.error, `Verifier rejected edit: ${result.error?.message || result.stderr || result.stdout || `exit ${result.status}`}`);
}

function protectedPath(path, binding) {
  const lower = path.toLowerCase();
  return [".git", ".codex", ".figma-gate"].some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`)) ||
    lower.startsWith("templates/verify/") || lower.startsWith("mybrain/verify/") ||
    lower.split("/").includes(".figma-gate") ||
    // workflow-preflight.mjs is protected because the `preflight` read op executes it.
    ["tools/codex-edit-guard.mjs", "templates/verify/scope-lock-state.mjs", "tools/figma-scope-lock.mjs",
      "tools/workflow-preflight.mjs", ...binding.controlPaths]
      .some((name) => lower === name.toLowerCase());
}

function assertFigmaBinding(root, binding) {
  const manifest = json(checkedPath(root, root, binding.manifestPath).absolute);
  const declaration = json(checkedPath(root, root, manifest.scope?.startDeclarationPath).absolute);
  check(declaration.scopeId === binding.scopeId &&
    same(checkedPath(root, root, declaration.scopeLockStatePath).absolute,
      checkedPath(root, root, binding.scopeLockStatePath).absolute), "Figma manifest and binding refer to different scope locks.");
}

export function assertBoundEdit(root, sessionId, paths, { verify = runVerifier } = {}) {
  check(typeof sessionId === "string" && sessionId.length > 0, "Missing hook session_id.");
  const config = json(checkedPath(root, root, CONFIG).absolute);
  check(config.version === 1 && config.bindings && Object.hasOwn(config.bindings, sessionId),
    `No binding for session ${sessionId}. Run scope preflight, then bind from the operator terminal; do not invent approval.`);
  const binding = config.bindings[sessionId];
  const { state, begin } = readLock(root, binding.scopeLockStatePath, binding.scopeId);
  check(begin.scopeManifestSha256 === binding.scopeManifestSha256, "Binding refers to another scope manifest.");
  check(JSON.stringify(state.scope.allowedPaths) === JSON.stringify(binding.allowedPaths), "Scope paths changed: rebind after authorized amend.");
  check(JSON.stringify(state.controlPaths) === JSON.stringify(binding.controlPaths), "Scope control paths changed: rebind required.");
  for (const path of paths) {
    checkedPath(root, root, path);
    check(!protectedPath(path, binding), `Guard/control path cannot be edited through this session: ${path}`);
    check(binding.allowedPaths.includes(path), `Out-of-scope edit denied: ${path}`);
  }
  // Use the existing CLI as well as the shared shape validator; do not fork its contract.
  verify(resolve(PLAYBOOK_ROOT, "tools/figma-scope-lock.mjs"), ["assert", binding.scopeLockStatePath, ...paths], root);
  if (binding.kind === "figma") {
    check(typeof binding.manifestPath === "string", "Missing Figma manifest binding.");
    assertFigmaBinding(root, binding);
    verify(resolve(PLAYBOOK_ROOT, "templates/verify/figma-gate.mjs"), ["assert-edit", binding.manifestPath, sessionId, ...paths], root);
  } else {
    check(binding.kind === "playbook" && same(root, realpathSync(PLAYBOOK_ROOT)), "Project edits cannot use playbook-only scope receipts.");
  }
}

// Only this fixed, non-executing reader is admitted as a shell command. No command
// classification by verbs/keywords: npm, interpreters, persistent shells, and MCP
// writes remain denied even if a preflight exists. OS isolation is a separate step.
export function readCommand(request) {
  const safeTool = TOOL.replaceAll("\\", "/");
  check(!/["$`%!\r\n]/.test(safeTool), "Hook installation path is not shell-safe.");
  return `node "${safeTool}" read ${Buffer.from(JSON.stringify(request)).toString("base64url")}`;
}

function parseReadCommand(command) {
  check(typeof command === "string", "Missing shell command.");
  const token = command.split(" ").at(-1);
  check(/^[A-Za-z0-9_-]+$/.test(token), "Arbitrary shell execution is not admitted.");
  let request;
  try { request = JSON.parse(Buffer.from(token, "base64url").toString()); }
  catch { throw new Error("Arbitrary shell execution is not admitted."); }
  check(command === readCommand(request), "Only the fixed read-only reader is admitted; use an operator terminal for builds/gates.");
  validateReadRequest(request);
  return request;
}

function validateReadRequest(request) {
  check(request && ["read", "list", "preflight"].includes(request.op), "Unknown read operation.");
  // `preflight` takes no path. It only reports the workflow environment, so the executed
  // file stays this guard, which protectedPath already refuses to edit through a session.
  if (request.op === "preflight") {
    check(Object.keys(request).every((key) => key === "op"), "Unknown read parameter.");
    return;
  }
  check(typeof request.path === "string", "Read path is required.");
  check(Object.keys(request).every((key) => ["op", "path"].includes(key)), "Unknown read parameter.");
}

export function evaluateHook(event, deps = {}) {
  try {
    check(event?.hook_event_name === "PreToolUse", "Unsupported hook event.");
    const root = repositoryRoot(event.cwd);
    if (["view_image", "update_plan", "request_user_input", "request_user_input_async"].includes(event.tool_name)) {
      return { allowed: true, reason: "Non-writing local tool." };
    }
    if (["Bash", "exec_command", "shell_command"].includes(event.tool_name)) {
      const input = event.tool_input;
      // The documented canonical PreToolUse payload carries only `tool_input.command`
      // (learn.chatgpt.com/codex/hooks.md), so `login` is absent in practice. Requiring
      // login===false denied every read, including the fixed reader. Reject an explicitly
      // requested login/persistent shell instead; admission still rests on the exact
      // command match below, not on these flags.
      check(input && input.login !== true && input.tty !== true, "Reader must not request a login or persistent TTY shell.");
      check(Object.keys(input).every((key) => ["command", "cmd", "workdir", "login", "tty", "yield_time_ms", "max_output_tokens"].includes(key)),
        "Shell/environment/permission overrides are not admitted.");
      if (input.workdir !== undefined) check(same(realpathSync(input.workdir), realpathSync(event.cwd)), "Reader workdir must match hook cwd.");
      parseReadCommand(event.tool_input?.command ?? event.tool_input?.cmd);
      return { allowed: true, reason: "Fixed read-only command." };
    }
    check(["apply_patch", "Edit", "Write"].includes(event.tool_name), "Unclassified tool/MCP execution denied; no writable alternate route is admitted.");
    const paths = patchPaths(event.tool_input?.command ?? event.tool_input?.patch)
      .map((path) => checkedPath(root, event.cwd, path).path);
    assertBoundEdit(root, event.session_id, paths, deps);
    return { allowed: true, reason: "Matching active scope and frozen inputs." };
  } catch (error) {
    return { allowed: false, reason: `EDIT GUARD: ${error.message}` };
  }
}

export function hookReply(event, deps) {
  const verdict = evaluateHook(event, deps);
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: verdict.allowed ? "allow" : "deny",
      permissionDecisionReason: verdict.reason,
    },
  };
}

export function hookConfig() {
  const script = TOOL.replaceAll("\\", "/");
  check(!/["$`%!\r\n]/.test(script), "Hook installation path is not shell-safe.");
  return {
    description: "Synchronous edit guard. Trust via /hooks; untrusted hooks do not enforce policy.",
    hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `node "${script}" hook`, timeout: 60 }] }] },
  };
}

// Canonical admission matrix, evaluated against this module as it stands on disk. It exists
// because a guard that denies EVERYTHING is as broken as one that allows everything, and the
// deny side alone was covered when the fixed reader was bricked (rules/codex-edit-guard-repair.md).
// It needs no binding, no scope lock and no hook, so it still runs when the guard is bricked.
export function selftest({ cwd = PLAYBOOK_ROOT, evaluate = evaluateHook } = {}) {
  const session = `selftest-${Date.now()}`;
  const reader = (request) => readCommand(request);
  const shell = (command, extra = {}) =>
    ({ hook_event_name: "PreToolUse", tool_name: "Bash", session_id: session, cwd, tool_input: { command, ...extra } });
  const edit = (path) => ({ hook_event_name: "PreToolUse", tool_name: "apply_patch", session_id: session, cwd,
    tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+x\n*** End Patch` } });
  const read = reader({ op: "read", path: "WORKFLOW.md" });
  const cases = [
    ["allow", "fixed reader: read", shell(read)],
    ["allow", "fixed reader: list", shell(reader({ op: "list", path: "tools" }))],
    ["allow", "fixed reader: preflight", shell(reader({ op: "preflight" }))],
    ["deny", "arbitrary command", shell("node tools/workflow-preflight.mjs")],
    ["deny", "reader with an appended command", shell(`${read}; echo x`)],
    ["deny", "reader requesting a login shell", shell(read, { login: true })],
    ["deny", "unclassified tool", { hook_event_name: "PreToolUse", tool_name: "mcp__fs__write_file", session_id: session, cwd, tool_input: {} }],
    ["deny", "unbound edit", edit("MyBrain/reports/selftest-probe.json")],
    ["deny", "unbound edit of the guard itself", edit("tools/codex-edit-guard.mjs")],
  ];
  const results = cases.map(([expected, name, event]) => {
    const verdict = evaluate(event);
    const actual = verdict.allowed ? "allow" : "deny";
    return { name, expected, actual, ok: actual === expected, reason: verdict.reason };
  });
  // Admitting the reader is not enough: a reader that cannot run leaves the agent just as stuck.
  const run = spawnSync(process.execPath, [TOOL, "read", reader({ op: "preflight" }).split(" ").at(-1)],
    { cwd, encoding: "utf8", timeout: 20000, windowsHide: true });
  results.push({ name: "fixed reader actually executes", expected: "exit 0", actual: `exit ${run.status}`,
    ok: run.status === 0, reason: run.status === 0 ? "ok" : (run.stderr || run.error?.message || "").trim() });
  return { passed: results.every((entry) => entry.ok), results };
}

export function install(root, { health = selftest } = {}) {
  root = repositoryRoot(root);
  // Never arm a guard that cannot pass its own matrix; that is how the repo got bricked.
  const report = health();
  check(report.passed, `Refusing to install a guard that fails its own admission matrix:\n${report.results
    .filter((entry) => !entry.ok).map((entry) => `  ${entry.name}: expected ${entry.expected}, got ${entry.actual} (${entry.reason})`).join("\n")}`);
  const target = checkedPath(root, root, ".codex/hooks.json").absolute;
  const desired = `${JSON.stringify(hookConfig(), null, 2)}\n`;
  if (existsSync(target)) check(readFileSync(target, "utf8") === desired, "Existing hooks.json differs. Merge explicitly; it will not be overwritten.");
  else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, desired, { flag: "wx" }); }
  return { installed: target, trusted: "not-verified", next: "Review and trust the exact hook in /hooks, then perform a live denied-edit probe." };
}

export function bind(root, sessionId, statePath, manifestPath) {
  root = repositoryRoot(root);
  check(typeof sessionId === "string" && sessionId.length > 0, "Session id required.");
  const { state, stateFile, begin } = readLock(root, statePath);
  const kind = same(root, realpathSync(PLAYBOOK_ROOT)) ? "playbook" : "figma";
  if (kind === "figma") {
    check(typeof manifestPath === "string", "Project binding requires an actual Figma preflight manifest.");
    checkedPath(root, root, manifestPath);
    runVerifier(resolve(PLAYBOOK_ROOT, "templates/verify/figma-gate.mjs"), ["assert-edit", manifestPath, sessionId, ...state.scope.allowedPaths], root);
  } else check(manifestPath === undefined, "Do not create a Figma manifest in public playbook memory.");
  const target = checkedPath(root, root, CONFIG).absolute;
  const config = existsSync(target) ? json(target) : { version: 1, bindings: {} };
  check(config.version === 1 && config.bindings && typeof config.bindings === "object" && !Array.isArray(config.bindings), "Invalid binding configuration.");
  check(!Object.hasOwn(config.bindings, sessionId), "Binding exists. Retire it explicitly before changing task/scope.");
  const binding = { kind, scopeId: state.scope.scopeId, scopeLockStatePath: stateFile.path,
    scopeManifestSha256: begin.scopeManifestSha256, allowedPaths: state.scope.allowedPaths,
    controlPaths: state.controlPaths, ...(manifestPath ? { manifestPath } : {}) };
  if (kind === "figma") assertFigmaBinding(root, binding);
  for (const path of binding.allowedPaths) { checkedPath(root, root, path); check(!protectedPath(path, binding), `Protected binding path: ${path}`); }
  Object.defineProperty(config.bindings, sessionId, { value: binding, enumerable: true });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  return { bound: sessionId, scopeId: binding.scopeId, kind, authority: "operator-selected scope; not proof of owner identity" };
}

export function unbind(root, sessionId) {
  root = repositoryRoot(root);
  const target = checkedPath(root, root, CONFIG).absolute;
  const config = json(target);
  check(config.version === 1 && config.bindings && Object.hasOwn(config.bindings, sessionId), "No binding to retire.");
  config.retired ??= [];
  check(Array.isArray(config.retired), "Invalid retired binding history.");
  config.retired.push({ sessionId, at: new Date().toISOString(), binding: config.bindings[sessionId] });
  delete config.bindings[sessionId];
  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  return { retired: sessionId };
}

function main(argv) {
  if (argv[0] === "hook") {
    try { console.log(JSON.stringify(hookReply(JSON.parse(readFileSync(0, "utf8"))))); }
    catch (error) {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `EDIT GUARD: ${error.message}` } }));
    }
  } else if (argv[0] === "install" && argv.length === 2) console.log(JSON.stringify(install(argv[1]), null, 2));
  else if (argv[0] === "bind" && [4, 5].includes(argv.length)) console.log(JSON.stringify(bind(argv[1], argv[2], argv[3], argv[4]), null, 2));
  else if (argv[0] === "unbind" && argv.length === 3) console.log(JSON.stringify(unbind(argv[1], argv[2]), null, 2));
  else if (argv[0] === "read-command" && argv.length === 3) console.log(readCommand({ op: argv[1], path: argv[2] }));
  else if (argv[0] === "read-command" && argv.length === 2 && argv[1] === "preflight") console.log(readCommand({ op: "preflight" }));
  else if (argv[0] === "selftest" && argv.length === 1) {
    const report = selftest();
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 3;
  }
  else if (argv[0] === "read" && argv.length === 2) {
    const request = JSON.parse(Buffer.from(argv[1], "base64url").toString());
    validateReadRequest(request);
    if (request.op === "preflight") return void console.log(JSON.stringify(evaluateWorkflowEnvironment(), null, 2));
    const root = repositoryRoot(process.cwd());
    const file = request.path === "." ? { absolute: root } : checkedPath(root, process.cwd(), request.path);
    if (request.op === "read") process.stdout.write(readFileSync(file.absolute, "utf8"));
    else console.log(JSON.stringify(readdirSync(file.absolute), null, 2));
  } else throw new Error("Usage: codex-edit-guard.mjs hook | selftest | install <repo> | bind <repo> <session-id> <scope-state> [figma-manifest] | unbind <repo> <session-id> | read-command <read|list> <path> | read-command preflight");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`EDIT GUARD: ${error.message}`); process.exitCode = 2; }
}
