#!/usr/bin/env node
// rule-size-guard の負のE2E。
//
// rules/loop-execution.md「独立レビューを工程にしない」が定めるとおり、新しい検査を
// 足したら**壊れる方向で実際に落ちること**を確かめる。上限内の設定でPASSするだけの
// 試験は、検査が無効化されていても通ってしまう。

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG, REPO_ROOT, auditPath, runRuleSizeGuard, upstreamDir } from "./rule-size-guard.mjs";

const TOOL_PATH = fileURLToPath(new URL("./rule-size-guard.mjs", import.meta.url));
const roots = [];

function tempRoot(label) {
  const dir = mkdtempSync(path.join(tmpdir(), `rule-size-guard-${label}-`));
  roots.push(dir);
  return dir;
}

function runCli(args, env = {}) {
  const result = spawnSync(process.execPath, [TOOL_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { exitCode: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

try {
  // 正本の場所は環境変数で差し替えられる
  assert.equal(upstreamDir({ WEB_DEVELOPMENT_VERIFY_DIR: "D:/elsewhere" }), "D:/elsewhere", "the upstream path is overridable");
  assert.ok(upstreamDir({}).length > 0, "a default upstream path exists");
  assert.ok(auditPath({}).endsWith("rule-size-audit.mjs"), "the audit basename is fixed");

  assert.equal(runCli(["--nope"]).exitCode, 64, "unknown arguments are rejected");

  // 上位層を読めない環境では skipped で通る。「上限内」とは報告しない。
  const missing = tempRoot("missing");
  const skipped = runRuleSizeGuard({ env: { WEB_DEVELOPMENT_VERIFY_DIR: path.join(missing, "nope") } });
  assert.equal(skipped.mode, "skipped", "an unreadable upstream yields skipped");
  assert.equal(skipped.exitCode, 0, "skipped does not fail the suite");
  assert.match(skipped.reason, /上限内という意味ではない/, "skipped says it is not a pass");

  // 設定が無ければ黙って通さない
  const noConfig = runRuleSizeGuard({ configPath: "verify-config/does-not-exist.json" });
  assert.notEqual(noConfig.exitCode, 0, "a missing config is not silently passed");

  // 負のテスト: 上限を実測値より小さくすると、実際に落ちる。
  // ここが通らなければ、この検査は繋がっていても何も守っていない。
  const overLimit = tempRoot("over");
  mkdirSync(path.join(overLimit, "verify-config"), { recursive: true });
  const strictConfig = path.join("verify-config", "rule-size-guard-e2e-strict.json");
  const strictPath = path.join(REPO_ROOT, strictConfig);
  writeFileSync(
    strictPath,
    JSON.stringify({
      version: 1,
      files: [{ path: "WORKFLOW.md", maxLines: 250, maxBytes: 1 }],
      totals: { label: "負のE2E", maxBytes: 1, paths: ["WORKFLOW.md"] },
    }),
    "utf8",
  );
  try {
    const failed = runRuleSizeGuard({ configPath: strictConfig });
    if (failed.mode === "checked") {
      assert.notEqual(failed.exitCode, 0, `an over-limit config must fail (${failed.output})`);
    }
  } finally {
    rmSync(strictPath, { force: true });
  }

  // このリポジトリ自身が上限内であることを回帰として固定する
  const repoRun = spawnSync(process.execPath, [TOOL_PATH], { encoding: "utf8", cwd: REPO_ROOT });
  assert.equal(repoRun.status, 0, `this repository is within the WORKFLOW.md limits (${repoRun.stdout}${repoRun.stderr})`);
  const repoResult = JSON.parse(repoRun.stdout.slice(0, repoRun.stdout.indexOf("}") + 1) + "");
  assert.ok(["checked", "skipped"].includes(repoResult.mode), "the CLI reports which mode it ran in");
  assert.equal(DEFAULT_CONFIG, "verify-config/rule-size-audit.config.json", "the default config path is fixed");
} finally {
  for (const directory of roots.reverse()) rmSync(directory, { recursive: true, force: true });
}

process.stdout.write("rule-size-guard.e2e: PASS\n");
