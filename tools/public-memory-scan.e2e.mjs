#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES, listFiles, runCli, scanPublicMemory } from "./public-memory-scan.mjs";

const TOOL_PATH = fileURLToPath(new URL("./public-memory-scan.mjs", import.meta.url));
const fixtureRoot = mkdtempSync(path.join(tmpdir(), "public-memory-scan-"));
const memoryDirectory = path.join(fixtureRoot, "MyBrain", "rules");
mkdirSync(memoryDirectory, { recursive: true });

function write(name, body) {
  writeFileSync(path.join(memoryDirectory, name), body, "utf8");
}

// 正: 公開してよい開発メモだけを含む文書
write(
  "clean.md",
  [
    "# 公開メモ",
    "",
    "- 2026-08-22 06:54 に workflow-preflight を追加した。",
    "- 上位層は `C:\\AI\\vault` と `C:\\AI\\web-development` にあるが、クラウドからは読めない。",
    "- ローカルでは http://localhost:3000 で確認する。比率は 16:9。",
    "- gate contract version 13、Node v22.22.2。",
    "",
  ].join("\n"),
);

// 負: 規則ごとに1件ずつ
write(
  "leaked.md",
  [
    "対象ノードは 2153:21943 で、PC側は 3288:45292。",
    "参照は https://www.figma.com/design/AbCdEf123456 を見ること。",
    "fileKey = AbCdEf1234567890",
    "見出しの高さは 121px、余白は 195px。",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "token: ghp_abcdefghijklmnopqrstuvwxyz0123",
    "api_key: 1234567890abcdef",
    "deploy: sftp://user:hunter2@example.test/path",
    "サーバは 192.168.10.24 にある。",
    "設定は C:\\Users\\someone\\.codex\\AGENTS.md にある。",
    "",
  ].join("\n"),
);

const files = listFiles(["MyBrain"], { root: fixtureRoot });
assert.equal(files.length, 2, "every file under the scan target is inspected");

const scanned = scanPublicMemory(files, { root: fixtureRoot });
assert.equal(scanned.ok, false, "leaked content fails the scan");

const cleanFindings = scanned.findings.filter((finding) => finding.file.endsWith("clean.md"));
assert.deepEqual(cleanFindings, [], `public development notes must not be flagged: ${JSON.stringify(cleanFindings)}`);

const firedRules = new Set(scanned.findings.map((finding) => finding.rule));
for (const rule of RULES) {
  assert.ok(firedRules.has(rule.id), `rule ${rule.id} is exercised by the fixture`);
}

// 秘匿指定の規則は一致値をそのまま出力しない
for (const finding of scanned.findings) {
  const rule = RULES.find((candidate) => candidate.id === finding.rule);
  if (!rule.secret) continue;
  assert.ok(finding.matched.includes("*"), `${rule.id} masks the matched value`);
  assert.ok(!finding.matched.includes("hunter2"), "a masked finding never echoes the secret");
  assert.ok(!/ghp_abcdefghijklmnopqrstuvwxyz0123/.test(finding.matched), "a masked token is not echoed");
}

// node-id は行番号つきで報告する
const nodeIdFinding = scanned.findings.find((finding) => finding.rule === "figma-node-id");
assert.equal(nodeIdFinding.line, 1, "findings carry the line number");

assert.equal(runCli([], { root: fixtureRoot }).exitCode, 2, "the CLI fails on a leaking public memory");
assert.equal(runCli(["--nope"], { root: fixtureRoot }).exitCode, 64, "unknown arguments are rejected");

rmSync(path.join(memoryDirectory, "leaked.md"));
assert.equal(runCli([], { root: fixtureRoot }).exitCode, 0, "the CLI passes once the leak is removed");

// 走査対象が無い環境では何も検査せずPASSする（配布物での実行を壊さない）
assert.equal(runCli(["MyBrain/does-not-exist"], { root: fixtureRoot }).exitCode, 0, "a missing target scans nothing");

// このリポジトリの公開MyBrainが実際に清潔であることを回帰として固定する
const repoRun = spawnSync(process.execPath, [TOOL_PATH], { encoding: "utf8" });
assert.equal(repoRun.status, 0, `this repository's public MyBrain is clean (output=${repoRun.stdout}${repoRun.stderr})`);
assert.equal(JSON.parse(repoRun.stdout).ok, true, "the CLI reports the verdict as JSON");

rmSync(fixtureRoot, { recursive: true, force: true });
process.stdout.write("public-memory-scan.e2e: PASS\n");
