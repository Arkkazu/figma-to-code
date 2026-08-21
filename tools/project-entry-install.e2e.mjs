#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTRY_FILENAMES,
  TEMPLATE_PATH,
  inspectProjectEntry,
  installProjectEntry,
  runCli,
  sha256,
} from "./project-entry-install.mjs";

const TOOL_PATH = fileURLToPath(new URL("./project-entry-install.mjs", import.meta.url));
const templateText = readFileSync(TEMPLATE_PATH, "utf8");
const roots = [];

function newRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "project-entry-"));
  roots.push(root);
  return root;
}

// 未設置の案件では、両方の入口が absent として報告される
const empty = newRoot();
const beforeInstall = inspectProjectEntry(empty);
assert.equal(beforeInstall.ok, false, "an empty project root is not compliant");
assert.deepEqual(
  beforeInstall.entries.map((entry) => entry.status),
  ["absent", "absent"],
  "both entry files are reported absent",
);

// 設置すると2枚とも正本と同一内容になる
const installed = installProjectEntry(empty);
assert.deepEqual(installed.written.map((entry) => entry.filename), [...ENTRY_FILENAMES], "both entries are written");
for (const filename of ENTRY_FILENAMES) {
  assert.equal(
    readFileSync(path.join(empty, filename), "utf8"),
    templateText,
    `${filename} matches the source of truth byte for byte`,
  );
}
assert.equal(inspectProjectEntry(empty).ok, true, "a freshly installed project root is compliant");

// 手編集・世代差は drift として検出する（手作業コピーの世代差を機械検査する目的）
writeFileSync(path.join(empty, "AGENTS.md"), `${templateText}\n手で足した行\n`, "utf8");
const drifted = inspectProjectEntry(empty);
assert.equal(drifted.ok, false, "an edited entry file breaks compliance");
assert.equal(
  drifted.entries.find((entry) => entry.filename === "AGENTS.md").status,
  "drift",
  "the edited entry is reported as drift",
);
assert.equal(
  drifted.template.sha256,
  sha256(templateText),
  "the reported template digest is the digest of the template file",
);

// 再設置で drift を解消し、再実行は冪等
installProjectEntry(empty);
assert.equal(inspectProjectEntry(empty).ok, true, "reinstalling repairs drift");
assert.deepEqual(installProjectEntry(empty).written, [], "a second install writes nothing");

// CLI契約：--check は未設置・drift を非0で落とす
const fresh = newRoot();
assert.equal(runCli([fresh, "--check"]).exitCode, 2, "--check fails on a project without the entry files");
assert.equal(runCli([fresh]).exitCode, 0, "install succeeds");
assert.equal(runCli([fresh, "--check"]).exitCode, 0, "--check passes after install");
writeFileSync(path.join(fresh, "CLAUDE.md"), "古い世代の入口\n", "utf8");
assert.equal(runCli([fresh, "--check"]).exitCode, 2, "--check fails on a stale generation");

// cwdになりうる場所が複数ある案件（リポジトリのルートとテーマディレクトリなど）
const repoRoot = newRoot();
const themeRoot = path.join(repoRoot, "wp-content", "themes", "fixture-theme");
mkdirSync(themeRoot, { recursive: true });
assert.equal(runCli([repoRoot, themeRoot, "--check"]).exitCode, 2, "--check fails while any directory is missing the entries");
assert.equal(runCli([repoRoot, themeRoot]).exitCode, 0, "both directories are installed in one run");
for (const root of [repoRoot, themeRoot]) {
  for (const filename of ENTRY_FILENAMES) {
    assert.equal(readFileSync(path.join(root, filename), "utf8"), templateText, `${root} carries the same entry`);
  }
}
assert.equal(runCli([repoRoot, themeRoot, "--check"]).exitCode, 0, "--check passes once every directory is current");
writeFileSync(path.join(themeRoot, "AGENTS.md"), "# 案件入口\n\n古い世代の入口\n", "utf8");
assert.equal(
  runCli([repoRoot, themeRoot, "--check"]).exitCode,
  2,
  "--check fails when one of the directories drifts",
);
assert.equal(JSON.parse(runCli([repoRoot, themeRoot, "--check"]).stdout).roots.length, 2, "every directory is reported");

assert.equal(runCli([]).exitCode, 64, "at least one directory is required");
assert.equal(runCli([fresh, "--nope"]).exitCode, 64, "unknown arguments are rejected");
assert.equal(
  runCli([path.join(fresh, "does-not-exist")]).exitCode,
  64,
  "a missing project root is rejected before writing anything",
);

// 実プロセス：エントリポイントと終了コードを固定する
const spawned = newRoot();
const checkBefore = spawnSync(process.execPath, [TOOL_PATH, spawned, "--check"], { encoding: "utf8" });
assert.equal(checkBefore.status, 2, "the CLI exits 2 before installation");
assert.equal(JSON.parse(checkBefore.stdout).ok, false, "the CLI reports the failure as JSON");

const install = spawnSync(process.execPath, [TOOL_PATH, spawned], { encoding: "utf8" });
assert.equal(install.status, 0, "the CLI installs successfully");
assert.deepEqual(
  JSON.parse(install.stdout).roots[0].written,
  [...ENTRY_FILENAMES],
  "the CLI reports what it wrote",
);

const checkAfter = spawnSync(process.execPath, [TOOL_PATH, spawned, "--check"], { encoding: "utf8" });
assert.equal(checkAfter.status, 0, "the CLI exits 0 once the entries are current");

for (const root of roots) rmSync(root, { recursive: true, force: true });
process.stdout.write("project-entry-install.e2e: PASS\n");
