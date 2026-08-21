#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLOUD_ENV_SIGNALS,
  LOCAL_WORKFLOW_SOURCES,
  MIN_WORKFLOW_BYTES,
  evaluateWorkflowEnvironment,
  runCli,
} from "./workflow-preflight.mjs";

const TOOL_PATH = fileURLToPath(new URL("./workflow-preflight.mjs", import.meta.url));
const VALID_WORKFLOW = `# WORKFLOW.md\n\n${"上位層の規則本文。".repeat(40)}\n`;
const readableAll = () => VALID_WORKFLOW;

assert.ok(
  Buffer.byteLength(VALID_WORKFLOW, "utf8") >= MIN_WORKFLOW_BYTES,
  "fixture must clear the minimum size",
);

// 明示シグナル：エージェント別の環境変数はいずれも cloud-restricted に落とす
for (const signal of CLOUD_ENV_SIGNALS) {
  assert.equal(
    evaluateWorkflowEnvironment({ env: { [signal.key]: signal.value }, readPath: readableAll }).mode,
    "cloud-restricted",
    `${signal.key} must be restricted`,
  );
}

// 正本はファイルの実読：シグナルが無くても上位層を読めなければ cloud-restricted
assert.equal(
  evaluateWorkflowEnvironment({ env: {}, readPath: () => null }).mode,
  "cloud-restricted",
  "missing parent workflows must fail safe",
);

// 空ファイル・プレースホルダで local と誤認しない（偽localの回帰）
assert.equal(
  evaluateWorkflowEnvironment({ env: {}, readPath: () => "" }).mode,
  "cloud-restricted",
  "an empty placeholder must not be accepted as a parent workflow",
);
assert.equal(
  evaluateWorkflowEnvironment({ env: {}, readPath: () => "# WORKFLOW.md\n" }).mode,
  "cloud-restricted",
  "a stub shorter than the minimum must not be accepted",
);
assert.equal(
  evaluateWorkflowEnvironment({ env: {}, readPath: () => "本文だけで見出しが無い。".repeat(40) }).mode,
  "cloud-restricted",
  "a file without a markdown heading must not be accepted",
);

// 片方だけ読めても local にしない
assert.equal(
  evaluateWorkflowEnvironment({
    env: {},
    readPath: (target) => (target === LOCAL_WORKFLOW_SOURCES[0].defaultPath ? VALID_WORKFLOW : null),
  }).mode,
  "cloud-restricted",
  "one readable parent workflow is not enough",
);

// 両方そろえば local。unusable は空になる
const localResult = evaluateWorkflowEnvironment({ env: {}, readPath: readableAll });
assert.equal(localResult.mode, "local", "a local environment with both parent workflows must proceed");
assert.deepEqual(localResult.signals, [], "a local environment carries no cloud signal");
assert.deepEqual(localResult.unusableLocalWorkflows, [], "a local environment has no unusable workflow");
assert.deepEqual(
  localResult.localWorkflows.map((workflow) => workflow.status),
  ["ok", "ok"],
  "both parent workflows are reported ok",
);

// 上位層の位置は環境変数で上書きできる（Windows固定パス以外のローカル環境）
const overrideEnv = Object.fromEntries(
  LOCAL_WORKFLOW_SOURCES.map((source) => [source.envKey, `/srv/${source.id}/WORKFLOW.md`]),
);
const overridden = evaluateWorkflowEnvironment({
  env: overrideEnv,
  readPath: (target) => (target.startsWith("/srv/") ? VALID_WORKFLOW : null),
});
assert.equal(overridden.mode, "local", "overridden parent workflow paths must be honored");
assert.deepEqual(
  overridden.localWorkflows.map((workflow) => workflow.path),
  Object.values(overrideEnv),
  "the overridden paths are the ones inspected",
);

// CLI契約：--assert-local は cloud-restricted を非0で落とす
assert.equal(runCli([], { env: {}, readPath: () => null }).exitCode, 0, "the default run stays informational");
assert.equal(
  runCli(["--assert-local"], { env: {}, readPath: () => null }).exitCode,
  2,
  "--assert-local must exit non-zero when the upper layers are unreadable",
);
assert.equal(
  runCli(["--assert-local"], { env: {}, readPath: readableAll }).exitCode,
  0,
  "--assert-local must exit 0 in a local environment",
);
assert.equal(runCli(["--nope"], { env: {}, readPath: readableAll }).exitCode, 64, "unknown arguments are rejected");

// 実プロセス：エントリポイント（main判定と終了コード）を実行して固定する
const fixtureDir = mkdtempSync(path.join(tmpdir(), "workflow-preflight-"));
const fixtureEnv = { PATH: process.env.PATH ?? "" };
for (const source of LOCAL_WORKFLOW_SOURCES) {
  const fixturePath = path.join(fixtureDir, `${source.id}-WORKFLOW.md`);
  writeFileSync(fixturePath, VALID_WORKFLOW);
  fixtureEnv[source.envKey] = fixturePath;
}

const localRun = spawnSync(process.execPath, [TOOL_PATH, "--assert-local"], { env: fixtureEnv, encoding: "utf8" });
assert.equal(localRun.status, 0, "the CLI exits 0 for a local environment");
assert.equal(JSON.parse(localRun.stdout).mode, "local", "the CLI prints the local verdict as JSON");

const cloudRun = spawnSync(process.execPath, [TOOL_PATH, "--assert-local"], {
  env: { ...fixtureEnv, CLAUDE_CODE_REMOTE: "true" },
  encoding: "utf8",
});
assert.equal(cloudRun.status, 2, "the CLI exits 2 for a cloud session even when parent workflows are readable");
assert.equal(JSON.parse(cloudRun.stdout).mode, "cloud-restricted", "the CLI prints the cloud verdict as JSON");

process.stdout.write("workflow-preflight.e2e: PASS\n");
