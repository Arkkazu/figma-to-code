#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VENDORED_FILES, auditVendoredVerifiers, runCli, upstreamDir } from "./vendored-verifier-audit.mjs";

const TOOL_PATH = fileURLToPath(new URL("./vendored-verifier-audit.mjs", import.meta.url));
const roots = [];
function makeDir(name) {
  const directory = mkdtempSync(path.join(tmpdir(), `vendored-verifier-${name}-`));
  roots.push(directory);
  return directory;
}
function write(directory, name, text) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), text, "utf8");
}

try {
  // 正本を読めない環境（クラウド）は skipped。検査できないことを一致と報告しない。
  const skipped = auditVendoredVerifiers({ upstream: path.join(tmpdir(), "vendored-verifier-absent-upstream") });
  assert.equal(skipped.mode, "skipped", "an unreadable upstream is reported as skipped");
  assert.equal(skipped.ok, true, "a skipped audit does not fail the run");
  assert.ok(skipped.reason.length > 0, "the skip states why it could not compare");

  // 一致していれば checked かつ ok
  const vendored = makeDir("vendored");
  const upstream = makeDir("upstream");
  for (const name of VENDORED_FILES) {
    write(vendored, name, `export const x = "${name}";\n`);
    write(upstream, name, `export const x = "${name}";\n`);
  }
  const clean = auditVendoredVerifiers({ vendoredDir: vendored, upstream });
  assert.equal(clean.mode, "checked", "a readable upstream is compared");
  assert.deepEqual(clean.findings, [], "identical copies produce no finding");
  assert.equal(clean.checked, VENDORED_FILES.length, "every vendored file is compared");

  // 改行コードだけの差は乖離としない（配布経路でCRLFになる）
  const crlfVendored = makeDir("crlf");
  for (const name of VENDORED_FILES) write(crlfVendored, name, `export const x = "${name}";\r\n`);
  assert.equal(
    auditVendoredVerifiers({ vendoredDir: crlfVendored, upstream }).ok,
    true,
    "a line-ending-only difference is not drift",
  );

  // 中身がずれたら vendored-drift（2026-08-25 の scope-conflict-audit 116行ずれの再現）
  const drifted = makeDir("drift");
  for (const name of VENDORED_FILES) write(drifted, name, `export const x = "${name}";\n`);
  write(drifted, "scope-conflict-audit.mjs", "export const x = \"stale\";\n");
  const driftResult = auditVendoredVerifiers({ vendoredDir: drifted, upstream });
  assert.equal(driftResult.ok, false, "a diverged vendored copy fails");
  assert.deepEqual(
    driftResult.findings.map((finding) => [finding.file, finding.rule]),
    [["scope-conflict-audit.mjs", "vendored-drift"]],
    `only the diverged file is reported: ${JSON.stringify(driftResult.findings)}`,
  );

  // 片側が欠けている場合も黙って通さない
  const partial = makeDir("partial");
  write(partial, "scope-coordination.mjs", "export const x = \"scope-coordination.mjs\";\n");
  const missing = auditVendoredVerifiers({ vendoredDir: partial, upstream });
  assert.equal(missing.ok, false, "a missing vendored copy fails");
  assert.ok(
    missing.findings.some((finding) => finding.rule === "vendored-missing"),
    `a missing vendored file is named: ${JSON.stringify(missing.findings)}`,
  );

  const upstreamPartial = makeDir("upstream-partial");
  write(upstreamPartial, "scope-conflict-audit.mjs", "export const x = \"scope-conflict-audit.mjs\";\n");
  const upstreamMissing = auditVendoredVerifiers({ vendoredDir: vendored, upstream: upstreamPartial });
  assert.ok(
    upstreamMissing.findings.some((finding) => finding.rule === "upstream-missing"),
    `a missing upstream file is named: ${JSON.stringify(upstreamMissing.findings)}`,
  );

  // 環境変数で正本の場所を差し替えられる
  assert.equal(upstreamDir({ WEB_DEVELOPMENT_VERIFY_DIR: "D:/elsewhere" }), "D:/elsewhere", "the upstream path is overridable");
  assert.ok(upstreamDir({}).length > 0, "a default upstream path exists");

  assert.equal(runCli(["--nope"]).exitCode, 64, "unknown arguments are rejected");
  assert.equal(runCli([], { vendoredDir: drifted, upstream }).exitCode, 2, "the CLI fails on drift");
  assert.equal(runCli([], { vendoredDir: vendored, upstream }).exitCode, 0, "the CLI passes when in sync");

  // このリポジトリ自身が正本と一致していることを回帰として固定する
  const repoRun = spawnSync(process.execPath, [TOOL_PATH], { encoding: "utf8" });
  assert.equal(repoRun.status, 0, `this repository's vendored copies match upstream (${repoRun.stdout}${repoRun.stderr})`);
  const repoResult = JSON.parse(repoRun.stdout);
  assert.ok(["checked", "skipped"].includes(repoResult.mode), "the CLI reports which mode it ran in");
} finally {
  for (const directory of roots.reverse()) rmSync(directory, { recursive: true, force: true });
}

process.stdout.write("vendored-verifier-audit.e2e: PASS\n");
