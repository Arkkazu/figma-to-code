#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { deliveryVerdict, evaluateHook, hookReply, hookConfig, install, patchPaths, readCommand, readRequiredDocument, REQUIRED_READING, selftest, TOOL } from "./codex-edit-guard.mjs";

const self = fileURLToPath(import.meta.url);
const root = mkdtempSync(join(tmpdir(), "codex-edit-guard-test-"));
const outside = mkdtempSync(join(tmpdir(), "codex-edit-guard-outside-"));
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value)); };
const patch = (path = "src/allowed.txt") => `*** Begin Patch\n*** Update File: ${path}\n@@\n-before\n+after\n*** End Patch`;
const event = (overrides = {}) => ({ hook_event_name: "PreToolUse", tool_name: "apply_patch", session_id: "session-a", cwd: root, tool_input: { command: patch() }, ...overrides });
const bindingFile = join(root, ".codex/edit-guard.json");
const stateFile = join(root, "control/state.json");
const source = join(root, "src/allowed.txt");
let count = 0;
const test = (name, callback) => { callback(); console.log(`PASS ${++count}: ${name}`); };

try {
  mkdirSync(join(root, ".git"));
  write(source, "before\n");
  write(join(root, "src/outside.txt"), "before\n");
  const before = hash(source);
  if (process.argv[2] === "--negative-only") {
    const module = await import(pathToFileURL(process.argv[3]).href);
    assert.equal(module.evaluateHook(event(), { verify: () => {} }).allowed, false, "preflight missing must block");
  } else {
    test("missing preflight/binding denies edit and dispatch leaves bytes unchanged", () => {
      const verdict = evaluateHook(event());
      if (verdict.allowed) write(source, "after\n");
      assert.equal(verdict.allowed, false);
      assert.equal(hash(source), before);
      assert.equal(hookReply(event()).hookSpecificOutput.permissionDecision, "deny");
    });
    const state = { version: 1, kind: "figma-scope-lock-state", status: "active",
      scope: { version: 1, scopeId: "fixture", repoPath: root, allowedPaths: ["src/allowed.txt", "src/new.txt"] },
      baseline: [], history: [], controlPaths: ["control/manifest.json", "control/state.json"] };
    write(join(root, "control/manifest.json"), state.scope);
    state.history.push({ action: "begin", scopeManifestPath: "control/manifest.json", scopeManifestSha256: hash(join(root, "control/manifest.json")) });
    const config = { version: 1, bindings: { "session-a": { kind: "figma", scopeId: "fixture", scopeLockStatePath: "control/state.json",
      scopeManifestSha256: state.history[0].scopeManifestSha256, allowedPaths: state.scope.allowedPaths, controlPaths: state.controlPaths,
      manifestPath: "control/gate.json" } } };
    write(join(root, "control/gate.json"), { scope: { startDeclarationPath: "control/declaration.json" } });
    write(join(root, "control/declaration.json"), { scopeId: "fixture", scopeLockStatePath: "control/state.json" });
    const reset = () => { write(stateFile, state); write(bindingFile, config); };
    reset();
    const calls = [];
    const deps = { verify: (...args) => calls.push(args) };
    test("allowed edit calls BOTH existing verifiers with session and exact path", () => {
      assert.equal(evaluateHook(event(), deps).allowed, true);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[0][1], ["assert", "control/state.json", "src/allowed.txt"]);
      assert.deepEqual(calls[1][1], ["assert-edit", "control/gate.json", "session-a", "src/allowed.txt"]);
    });
    test("another session cannot reuse the receipt", () => assert.equal(evaluateHook(event({ session_id: "session-b" }), deps).allowed, false));
    test("manifest cannot be paired with a different scope lock", () => {
      write(join(root, "control/declaration.json"), { scopeId: "fixture", scopeLockStatePath: "control/other.json" });
      assert.equal(evaluateHook(event(), deps).allowed, false);
      write(join(root, "control/declaration.json"), { scopeId: "fixture", scopeLockStatePath: "control/state.json" });
    });
    test("out-of-scope add/update/delete/move all deny without dispatch", () => {
      for (const command of [patch("src/outside.txt"), "*** Begin Patch\n*** Add File: src/outside-new.txt\n+new\n*** End Patch",
        "*** Begin Patch\n*** Delete File: src/outside.txt\n*** End Patch",
        "*** Begin Patch\n*** Update File: src/allowed.txt\n*** Move to: src/outside-new.txt\n@@\n-before\n+after\n*** End Patch"]) {
        assert.equal(evaluateHook(event({ tool_input: { command } }), deps).allowed, false);
      }
      assert.equal(hash(source), before);
      assert.equal(existsSync(join(root, "src/outside-new.txt")), false);
    });
    test("new allowed file and allowed rename pass path inspection", () => {
      for (const command of ["*** Begin Patch\n*** Add File: src/new.txt\n+new\n*** End Patch",
        "*** Begin Patch\n*** Update File: src/allowed.txt\n*** Move to: src/new.txt\n@@\n-before\n+after\n*** End Patch"]) {
        assert.equal(evaluateHook(event({ tool_input: { command } }), deps).allowed, true);
      }
    });
    test("relative paths are resolved against nested cwd", () => {
      assert.equal(evaluateHook(event({ cwd: join(root, "src"), tool_input: { command: patch("allowed.txt") } }), deps).allowed, true);
      assert.equal(evaluateHook(event({ cwd: join(root, "src"), tool_input: { command: patch("src/allowed.txt") } }), deps).allowed, false);
    });
    test("blocked/closed state and another scope are refused", () => {
      for (const change of [{ status: "blocked" }, { status: "closed" }, { scope: { ...state.scope, scopeId: "other" } }]) {
        write(stateFile, { ...state, ...change }); assert.equal(evaluateHook(event(), deps).allowed, false);
      }
      reset();
    });
    test("tampered begin manifest and changed allowed paths require rebind", () => {
      write(join(root, "control/manifest.json"), { tampered: true });
      assert.equal(evaluateHook(event(), deps).allowed, false);
      write(join(root, "control/manifest.json"), state.scope);
      write(stateFile, { ...state, scope: { ...state.scope, allowedPaths: [...state.scope.allowedPaths, "src/outside.txt"] } });
      assert.equal(evaluateHook(event(), deps).allowed, false); reset();
    });
    test("verifier error/timeout blocks instead of treating missing output as PASS", () => {
      assert.equal(evaluateHook(event(), { verify: () => { throw new Error("timeout"); } }).allowed, false);
    });
    test("project cannot opt into playbook maintenance to skip Figma", () => {
      write(bindingFile, { ...config, bindings: { "session-a": { ...config.bindings["session-a"], kind: "playbook" } } });
      assert.equal(evaluateHook(event(), deps).allowed, false); reset();
    });
    test("traversal, ADS and Windows alias paths fail closed", () => {
      for (const path of ["../outside", "src/../src/allowed.txt", "src/allowed.txt:stream", "src/allowed.txt.", "C:relative", "src/*"]) {
        assert.equal(evaluateHook(event({ tool_input: { command: patch(path) } }), deps).allowed, false, path);
      }
    });
    test("junction/symlink parent cannot redirect a new file outside repository", () => {
      symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
      assert.equal(evaluateHook(event({ tool_input: { command: patch("linked/target.txt") } }), deps).allowed, false);
      assert.equal(existsSync(join(outside, "target.txt")), false);
    });
    test("shell/interpreter/persistent-session and MCP alternatives are denied", () => {
      for (const command of ["echo changed > src/allowed.txt", "node -e 'require(\"fs\").writeFileSync(\"src/outside.txt\",\"x\")'",
        "powershell", "python -c pass", "npm run build", "git checkout -- src/outside.txt"]) {
        assert.equal(evaluateHook(event({ tool_name: "Bash", tool_input: { command } }), deps).allowed, false);
      }
      for (const name of ["mcp__fs__write_file", "mcp__fs__read_and_write", "write_stdin", "unknown_tool"]) {
        assert.equal(evaluateHook(event({ tool_name: name }), deps).allowed, false);
      }
      assert.equal(hash(source), before);
    });
    test("fixed reader works; shell suffixes and read-op substitution do not", () => {
      const command = readCommand({ op: "read", path: "src/allowed.txt" });
      // Documented canonical payload: `Bash` carries only `tool_input.command`.
      for (const name of ["Bash", "exec_command", "shell_command"]) {
        assert.equal(evaluateHook(event({ tool_name: name, tool_input: { command } })).allowed, true, name);
      }
      assert.equal(evaluateHook(event({ tool_name: "Bash", tool_input: { command, login: false } })).allowed, true);
      for (const extra of [{ shell: "custom-shell" }, { env: { NODE_OPTIONS: "--import=evil.mjs" } }, { tty: true }, { login: true }]) {
        assert.equal(evaluateHook(event({ tool_name: "Bash", tool_input: { command, ...extra } })).allowed, false, JSON.stringify(extra));
      }
      for (const suffix of ["; echo x", " && node evil.mjs", "\nwhoami"]) {
        assert.equal(evaluateHook(event({ tool_name: "Bash", tool_input: { command: command + suffix } })).allowed, false);
      }
      const substituted = evaluateHook(event({ tool_name: "Bash", tool_input: { command: readCommand({ op: "write", path: "src/allowed.txt" }) } }));
      assert.equal(substituted.allowed, false);
      assert.match(substituted.reason, /Unknown read operation/);
      const token = command.split(" ").at(-1);
      const result = spawnSync(process.execPath, [TOOL, "read", token], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "before\n");
    });
    test("preflight op is admitted, runs, and cannot be widened or edited around", () => {
      const command = readCommand({ op: "preflight" });
      assert.equal(evaluateHook(event({ tool_name: "Bash", tool_input: { command } })).allowed, true);
      for (const bad of [{ op: "preflight", path: "src/allowed.txt" }, { op: "preflight", extra: 1 }, { op: "prefl" }]) {
        assert.equal(evaluateHook(event({ tool_name: "Bash", tool_input: { command: readCommand(bad) } })).allowed,
          false, JSON.stringify(bad));
      }
      const result = spawnSync(process.execPath, [TOOL, "read", command.split(" ").at(-1)], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(typeof JSON.parse(result.stdout).mode, "string");
      // The preflight op executes workflow-preflight.mjs, so a session must not be able to edit it.
      // Put it in scope first, otherwise "out of scope" would deny it and hide a lost protection.
      write(stateFile, { ...state, scope: { ...state.scope, allowedPaths: ["tools/workflow-preflight.mjs"] } });
      write(bindingFile, { ...config, bindings: { "session-a": { ...config.bindings["session-a"], allowedPaths: ["tools/workflow-preflight.mjs"] } } });
      const protectedEdit = evaluateHook(event({ tool_input: { command: patch("tools/workflow-preflight.mjs") } }), deps);
      assert.equal(protectedEdit.allowed, false);
      assert.match(protectedEdit.reason, /Guard\/control path cannot be edited/);
      reset();
    });
    test("malformed patch/event/config and malformed stdin return explicit deny", () => {
      assert.throws(() => patchPaths("not a patch"));
      assert.equal(evaluateHook({}).allowed, false);
      write(bindingFile, "bad json"); assert.equal(evaluateHook(event(), deps).allowed, false); reset();
      const result = spawnSync(process.execPath, [TOOL, "hook"], { input: "{", encoding: "utf8", cwd: root });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    });
    test("hook config is synchronous, covers all tools, and installation preserves other hooks", () => {
      assert.equal(hookConfig().hooks.PreToolUse[0].matcher, "*");
      assert.notEqual(hookConfig().hooks.PreToolUse[0].hooks[0].async, true);
      assert.equal(install(root).trusted, "not-verified");
      const installedHash = hash(join(root, ".codex/hooks.json"));
      install(root); assert.equal(hash(join(root, ".codex/hooks.json")), installedHash);
      write(join(root, ".codex/hooks.json"), "other hooks");
      assert.throws(() => install(root), /will not be overwritten/);
      assert.equal(readFileSync(join(root, ".codex/hooks.json"), "utf8"), "other hooks");
    });
    test("every approved required-reading document is delivered whole through the real reader", () => {
      const run = (request) => spawnSync(process.execPath, [TOOL, "read", readCommand(request).split(" ").at(-1)],
        { cwd: root, encoding: "utf8" });
      const admitted = (request) => evaluateHook(event({ tool_name: "Bash", tool_input: { command: readCommand(request) } })).allowed;
      assert.ok(REQUIRED_READING.size > 0);
      let checked = 0;
      for (const [key, entry] of REQUIRED_READING) {
        if (!existsSync(entry.absolute)) continue;
        assert.equal(admitted({ op: "required", path: key }), true, key);
        const result = run({ op: "required", path: key });
        assert.equal(result.status, 0, `${key}: ${result.stderr}`);
        // Whole-document equality, so a truncated or partial delivery cannot pass.
        assert.equal(result.stdout, readFileSync(entry.absolute, "utf8"), key);
        checked += 1;
      }
      assert.ok(checked > 0, "no approved document was present to verify");
      // The list itself is metadata, never a directory listing.
      const listing = JSON.parse(run({ op: "required" }).stdout);
      assert.equal(listing.length, REQUIRED_READING.size);
      assert.ok(listing.every((row) => typeof row.why === "string" && row.why.length > 0));
      // Repository-scoped reading is unchanged.
      assert.equal(admitted({ op: "read", path: "WORKFLOW.md" }), true);
      assert.equal(admitted({ op: "list", path: "tools" }), true);
      assert.equal(admitted({ op: "preflight" }), true);
    });
    test("external reading stays limited to the approved documents", () => {
      const run = (request) => spawnSync(process.execPath, [TOOL, "read", readCommand(request).split(" ").at(-1)],
        { cwd: root, encoding: "utf8" });
      const admitted = (request) => evaluateHook(event({ tool_name: "Bash", tool_input: { command: readCommand(request) } })).allowed;
      // An unapproved neighbour of an approved file, in the same approved directory.
      for (const key of ["vault/rules/corrections-archive.md", "vault/rules/mistakes-archive.md", "vault/rules/", "vault"]) {
        assert.equal(admitted({ op: "required", path: key }), false, key);
      }
      // Traversal, absolute paths and link tricks cannot reach an unapproved document.
      for (const key of ["vault/../vault/rules/lint.md", "vault/rules/../rules/naming.md", "../vault/WORKFLOW.md",
        "C:/AI/vault/WORKFLOW.md", "vault/WORKFLOW.md:stream", "vault/WORKFLOW.md."]) {
        assert.equal(admitted({ op: "required", path: key }), false, key);
      }
      // The old repository-scoped reader still refuses everything outside the repository,
      // including the very documents the approved list delivers, and every external directory.
      for (const path of ["C:/AI/vault/WORKFLOW.md", "C:/AI/vault/rules/corrections.md", "../vault/WORKFLOW.md",
        "C:/Users/tane1/.codex/auth.json"]) {
        assert.notEqual(run({ op: "read", path }).status, 0, path);
      }
      for (const path of ["C:/AI/vault", "C:/AI/vault/rules", "../vault"]) {
        assert.notEqual(run({ op: "list", path }).status, 0, path);
      }
      // A missing or redirected document is never reported as success.
      const fixture = new Map([
        ["vault/absent.md", { id: "vault", relativePath: "absent.md", why: "fixture", absolute: join(outside, "absent.md") }],
        ["vault/linked.md", { id: "vault", relativePath: "linked.md", why: "fixture", absolute: join(outside, "linked.md") }],
        ["vault/present.md", { id: "vault", relativePath: "present.md", why: "fixture", absolute: join(outside, "present.md") }],
        ["vault/dir.md", { id: "vault", relativePath: "dir.md", why: "fixture", absolute: join(outside, "dir-as-doc") }],
      ]);
      write(join(outside, "present.md"), "body\n");
      write(join(outside, "target.md"), "redirected\n");
      mkdirSync(join(outside, "dir-as-doc"), { recursive: true });
      symlinkSync(join(outside, "target.md"), join(outside, "linked.md"), "file");
      assert.equal(readRequiredDocument("vault/present.md", fixture), "body\n");
      assert.throws(() => readRequiredDocument("vault/absent.md", fixture), /ENOENT/);
      assert.throws(() => readRequiredDocument("vault/linked.md", fixture), /Symlinked required-reading document denied/);
      assert.throws(() => readRequiredDocument("vault/dir.md", fixture), /not a regular file/);
      assert.throws(() => readRequiredDocument("vault/unknown.md", fixture), /Not an approved required-reading document/);
      // A junction in the middle of an approved path leaves the file itself a regular file,
      // so only comparing the resolved path against the approved one catches the redirect.
      mkdirSync(join(outside, "real-dir"), { recursive: true });
      write(join(outside, "real-dir/doc.md"), "redirected body\n");
      symlinkSync(join(outside, "real-dir"), join(outside, "junction-dir"), process.platform === "win32" ? "junction" : "dir");
      const redirected = new Map([["vault/doc.md",
        { id: "vault", relativePath: "doc.md", why: "fixture", absolute: join(outside, "junction-dir/doc.md") }]]);
      assert.equal(existsSync(join(outside, "junction-dir/doc.md")), true);
      assert.equal(lstatSync(join(outside, "junction-dir/doc.md")).isFile(), true);
      assert.throws(() => readRequiredDocument("vault/doc.md", redirected), /Resolved path differs from the approved path/);
      // A hard link keeps the approved path and resolves to itself, so only the link count sees it.
      write(join(outside, "hard-source.md"), "hard body\n");
      linkSync(join(outside, "hard-source.md"), join(outside, "hard-link.md"));
      const hardLinked = new Map([["vault/hard.md",
        { id: "vault", relativePath: "hard.md", why: "fixture", absolute: join(outside, "hard-link.md") }]]);
      assert.equal(lstatSync(join(outside, "hard-link.md")).isSymbolicLink(), false);
      assert.throws(() => readRequiredDocument("vault/hard.md", hardLinked), /Hard-linked required-reading document denied/);
    });
    test("delivery is judged on content, not on the exit code alone", () => {
      assert.equal(deliveryVerdict("d", { status: 0, stdout: "abcdef" }, "abcdef").ok, true);
      const truncated = deliveryVerdict("d", { status: 0, stdout: "abc" }, "abcdef");
      assert.equal(truncated.ok, false);
      assert.match(truncated.reason, /does not match the source document/);
      assert.equal(deliveryVerdict("d", { status: 0, stdout: "abcdefg" }, "abcdef").ok, false);
      assert.equal(deliveryVerdict("d", { status: 2, stdout: "", stderr: "boom" }, "abcdef").ok, false);
      assert.equal(deliveryVerdict("d", { status: 0, stdout: "anything" }).ok, true);
    });
    test("approved reading grants no write or execute permission", () => {
      // Reading a document does not make it editable: edits still resolve against the repository.
      for (const path of ["C:/AI/vault/WORKFLOW.md", "C:/AI/vault/rules/corrections.md", "C:/AI/web-development/rules/html.md"]) {
        const verdict = evaluateHook(event({ tool_input: { command: patch(path) } }), deps);
        assert.equal(verdict.allowed, false, path);
        assert.match(verdict.reason, /outside repository|Ambiguous|Drive-relative/);
      }
      // Guard, authorisation config and out-of-scope edits stay refused.
      for (const path of ["tools/codex-edit-guard.mjs", ".codex/edit-guard.json", ".codex/hooks.json", "src/outside.txt"]) {
        assert.equal(evaluateHook(event({ tool_input: { command: patch(path) } }), deps).allowed, false, path);
      }
      // Arbitrary shell and command chaining stay refused.
      const approved = readCommand({ op: "required", path: "vault/WORKFLOW.md" });
      for (const command of [`${approved}; echo x`, `${approved} && node evil.mjs`, "node C:/AI/vault/read.mjs", "type C:\\AI\\vault\\WORKFLOW.md"]) {
        assert.equal(evaluateHook(event({ tool_name: "Bash", tool_input: { command } }), deps).allowed, false, command);
      }
    });
    test("selftest detects both brick directions, and install refuses to arm a failing guard", () => {
      const healthy = selftest();
      assert.equal(healthy.passed, true, JSON.stringify(healthy.results.filter((entry) => !entry.ok)));
      // The delivery check is the whole lesson of 2026-09-06; it must not silently disappear.
      const delivered = healthy.results.filter((entry) => entry.name.startsWith("required reading arrives:"));
      assert.equal(delivered.length, REQUIRED_READING.size, "selftest must cover every approved document");
      for (const [key, entry] of REQUIRED_READING) {
        const covered = delivered.find((candidate) => candidate.name === `required reading arrives: ${key}`);
        assert.ok(covered, `missing delivery check for ${key}`);
        // A present document must be really read and compared; only an absent playbook may skip.
        if (existsSync(entry.absolute)) assert.match(covered.reason, /^ok \(exact match, \d+ chars\)$/, key);
      }
      // Deny-everything is the direction that actually happened: the fixed reader stops working.
      const bricked = selftest({ evaluate: () => ({ allowed: false, reason: "bricked" }) });
      assert.equal(bricked.passed, false);
      const failed = bricked.results.filter((entry) => !entry.ok).map((entry) => entry.name);
      for (const name of ["fixed reader: read", "fixed reader: list", "fixed reader: preflight"]) {
        assert.ok(failed.includes(name), `${name} should fail on a deny-everything guard: ${failed.join(", ")}`);
      }
      // Allow-everything must fail too, otherwise the matrix would bless a disabled guard.
      assert.equal(selftest({ evaluate: () => ({ allowed: true, reason: "open" }) }).passed, false);
      assert.throws(() => install(root, { health: () => ({ passed: false, results: [{ name: "reader", expected: "allow", actual: "deny", ok: false, reason: "r" }] }) }),
        /Refusing to install a guard that fails its own admission matrix/);
    });
    test("mutation: removing the binding check makes the SAME negative test fail", () => {
      const mutationRoot = join(root, "mutant");
      const mutant = join(mutationRoot, "tools/codex-edit-guard.mjs");
      const original = readFileSync(TOOL, "utf8");
      const needle = "    assertBoundEdit(root, event.session_id, paths, deps);";
      assert.equal(original.split(needle).length, 2);
      write(mutant, original.replace(needle, "    // MUTATION: disabled binding enforcement"));
      mkdirSync(join(mutationRoot, "templates/verify"), { recursive: true });
      cpSync(resolve(dirname(TOOL), "../templates/verify/scope-lock-state.mjs"), join(mutationRoot, "templates/verify/scope-lock-state.mjs"));
      cpSync(resolve(dirname(TOOL), "workflow-preflight.mjs"), join(mutationRoot, "tools/workflow-preflight.mjs"));
      const good = spawnSync(process.execPath, [self, "--negative-only", TOOL], { encoding: "utf8" });
      assert.equal(good.status, 0, good.stderr);
      const bad = spawnSync(process.execPath, [self, "--negative-only", mutant], { encoding: "utf8" });
      assert.notEqual(bad.status, 0); assert.match(bad.stderr, /preflight missing must block/);
    });
    console.log(`codex-edit-guard.e2e: PASS (${count} groups; hook protocol replay, not live Codex trust verification)`);
  }
} finally {
  // The only recursive removals are these verified mkdtemp roots, never caller paths.
  for (const path of [root, outside]) {
    assert.ok(dirname(path) === resolve(tmpdir()) && path.includes("codex-edit-guard-"));
    rmSync(path, { recursive: true, force: true });
  }
}
