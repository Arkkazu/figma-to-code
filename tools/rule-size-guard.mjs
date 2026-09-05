#!/usr/bin/env node
// WORKFLOW.md の「手順書の上限」「必読合計の上限」「蓄積ファイルの上限」を検査する。
//
// なぜラッパが要るか。判定器の正本は C:\AI\web-development\verify\rule-size-audit.mjs で、
// このリポジトリには無い。run-checks の runCheck は `node <target>` を**引数なしで**呼ぶため、
// 設定ファイルを渡せず、正本のパスをそのまま CHECKS へ書くこともできない。
// そのため薄いラッパをここへ置き、設定の場所をこちら側に固定する。
//
// 2026-09-06 実測: この検査は CHECKS に入っておらず、必読合計が 148,853 bytes >
// 上限 143,360 bytes を超えたまま run-checks は 16/16 PASS を出していた。
// 検査を持っていることと、検査していることは別である。
//
// 上位層を読めない環境（CI runner・クラウドセッション。WORKFLOW.md「検査と反映」）では
// skipped として exit 0 にする。検査できないことを「上限内」と報告しないため、
// mode を出力に必ず載せる。tools/vendored-verifier-audit.mjs と同じ約束にそろえている。

import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_UPSTREAM_DIR = "C:/AI/web-development/verify";
export const AUDIT_BASENAME = "rule-size-audit.mjs";
export const DEFAULT_CONFIG = "verify-config/rule-size-audit.config.json";

export function upstreamDir(env = process.env) {
  const configured = env.WEB_DEVELOPMENT_VERIFY_DIR?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_UPSTREAM_DIR;
}

export function auditPath(env = process.env) {
  return path.join(upstreamDir(env), AUDIT_BASENAME);
}

// deps は e2e から差し替えるためだけに開けてある。
export function runRuleSizeGuard(deps = {}) {
  const {
    env = process.env,
    configPath = DEFAULT_CONFIG,
    root = REPO_ROOT,
    exists = existsSync,
    run = spawnSync,
  } = deps;

  const audit = auditPath(env);
  if (!exists(audit)) {
    return {
      mode: "skipped",
      audit,
      reason: "上位層の rule-size-audit.mjs を読めないため検査していない（上限内という意味ではない）",
      exitCode: 0,
      output: "",
    };
  }

  const config = path.join(root, configPath);
  if (!exists(config)) {
    return { mode: "error", audit, config, reason: "設定ファイルが無い", exitCode: 2, output: "" };
  }

  const result = run(process.execPath, [audit, config], { cwd: root, encoding: "utf8" });
  return {
    mode: "checked",
    audit,
    config,
    exitCode: result.status === 0 ? 0 : 2,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

if (process.argv[1] && fileURLToPath(new URL(import.meta.url)) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg.startsWith("-"))) {
    process.stderr.write(`rule-size-guard: unknown argument. usage: node tools/rule-size-guard.mjs [configPath]\n`);
    process.exit(64);
  }
  const outcome = runRuleSizeGuard(args.length > 0 ? { configPath: args[0] } : {});
  process.stdout.write(`${JSON.stringify({ mode: outcome.mode, audit: outcome.audit, ok: outcome.exitCode === 0 }, null, 2)}\n`);
  if (outcome.output) process.stdout.write(`${outcome.output}\n`);
  if (outcome.mode === "skipped") process.stdout.write(`rule-size-guard: ${outcome.reason}\n`);
  if (outcome.exitCode !== 0) {
    process.stderr.write("rule-size-guard: WORKFLOW.md の上限を超えている。必読から外すか、統合して縮める。規則本文を削って数値だけ合わせない。\n");
  }
  process.exit(outcome.exitCode);
}
