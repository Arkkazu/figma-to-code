#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

// 上位層 WORKFLOW.md の既定位置。ローカルのルート位置が異なる環境では envKey で上書きする。
export const LOCAL_WORKFLOW_SOURCES = [
  {
    id: "vault",
    defaultPath: "C:\\AI\\vault\\WORKFLOW.md",
    envKey: "FIGMA_TO_CODE_VAULT_WORKFLOW",
  },
  {
    id: "web-development",
    defaultPath: "C:\\AI\\web-development\\WORKFLOW.md",
    envKey: "FIGMA_TO_CODE_WEB_DEVELOPMENT_WORKFLOW",
  },
];

// 空ファイル・プレースホルダを `local` と誤認しないための下限。世代差の検出はできない。
export const MIN_WORKFLOW_BYTES = 200;

// 明示シグナルは診断情報であり、判定の正本は上位層ファイルの実読である。
export const CLOUD_ENV_SIGNALS = [
  { key: "CLAUDE_CODE_REMOTE", value: "true", measured: "2026-08-21 Claude Codeクラウドで実測" },
  { key: "CODEX_CI", value: "1", measured: null },
];

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function inspectWorkflow(source, env, readPath) {
  const path = env[source.envKey] || source.defaultPath;
  const text = readPath(path);
  if (text === null) return { id: source.id, path, status: "missing" };
  if (Buffer.byteLength(text, "utf8") < MIN_WORKFLOW_BYTES) {
    return { id: source.id, path, status: "too-short" };
  }
  if (!/^#\s+\S/m.test(text)) return { id: source.id, path, status: "no-heading" };
  return { id: source.id, path, status: "ok" };
}

export function evaluateWorkflowEnvironment({ env = process.env, readPath = readText } = {}) {
  const signals = CLOUD_ENV_SIGNALS.filter((signal) => env[signal.key] === signal.value).map(
    (signal) => `${signal.key}=${signal.value}`,
  );

  const localWorkflows = LOCAL_WORKFLOW_SOURCES.map((source) => inspectWorkflow(source, env, readPath));
  const unusableLocalWorkflows = localWorkflows.filter((workflow) => workflow.status !== "ok");

  const mode = unusableLocalWorkflows.length > 0 ? "cloud-restricted" : "local";
  return { mode, signals, localWorkflows, unusableLocalWorkflows };
}

export function runCli(argv, { env = process.env, readPath = readText } = {}) {
  const unknown = argv.filter((arg) => arg !== "--assert-local");
  if (unknown.length > 0) {
    return { exitCode: 64, stdout: "", stderr: `unknown argument: ${unknown[0]}\n` };
  }

  const result = evaluateWorkflowEnvironment({ env, readPath });
  const stdout = `${JSON.stringify(result, null, 2)}\n`;
  if (argv.includes("--assert-local") && result.mode !== "local") {
    return {
      exitCode: 2,
      stdout,
      stderr: "workflow-preflight: cloud-restricted. 上位層を読めないため、この判定を要求する工程は開始できない。\n",
    };
  }
  return { exitCode: 0, stdout, stderr: "" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
