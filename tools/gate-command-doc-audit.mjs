#!/usr/bin/env node
// 規範文書に書かれた figma:gate preflight のコマンド形が、ゲートの実引数契約と
// 一致しているかを検査する。
//
// 2026-08-21 実測：rules/figma-spec-pipeline.md と templates/LOOP.md は
// `--implementation-actor` / `--implementation-context-id` を欠いた形を書いていた。
// gate は v13 でこの2つを必須にしているため、書いてあるとおりに実行すると
// `preflight requires exactly ...` で即FAILする。案件側はこの記述を写すので、
// ゲートを通せない案件が生まれ、ゲートを飛ばして実装する経路が開く。
// 記録（STATE.md / AUDIT-*.md / REVIEW-*.md）は履歴なので対象にしない。

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DOC_ROOTS = Object.freeze(["rules", "templates", "spec", "references"]);
export const ROOT_DOCS = Object.freeze(["WORKFLOW.md", "README.md", "AGENTS.md", "CLAUDE.md", "LOOP.md"]);
export const PREFLIGHT_COMMAND = /(?:figma:gate\s+--\s+preflight|figma-gate\.mjs\s+preflight)/;
export const REQUIRED_FLAGS = Object.freeze(["--implementation-actor", "--implementation-context-id"]);

export function listDocs(root = REPO_ROOT, deps = {}) {
  const { readDir = readdirSync, stat = statSync } = deps;
  const found = [];
  const walk = (directory) => {
    for (const entry of readDir(directory)) {
      const target = path.join(directory, entry);
      if (stat(target).isDirectory()) walk(target);
      else if (entry.endsWith(".md")) found.push(target);
    }
  };
  for (const directory of DOC_ROOTS) {
    const target = path.join(root, directory);
    try {
      if (stat(target).isDirectory()) walk(target);
    } catch {
      // 配布先によっては存在しないディレクトリがある
    }
  }
  for (const doc of ROOT_DOCS) {
    const target = path.join(root, doc);
    try {
      if (stat(target).isFile()) found.push(target);
    } catch {
      // 同上
    }
  }
  return found.sort();
}

export function auditGateCommandDocs(files, deps = {}) {
  const { readFile = (target) => readFileSync(target, "utf8"), root = REPO_ROOT } = deps;
  const violations = [];
  for (const file of files) {
    const lines = readFile(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!PREFLIGHT_COMMAND.test(line)) return;
      const missing = REQUIRED_FLAGS.filter((flag) => !line.includes(flag));
      if (missing.length === 0) return;
      violations.push({
        file: path.relative(root, file).replace(/\\/g, "/"),
        line: index + 1,
        missing,
        text: line.trim(),
      });
    });
  }
  return { checked: files.length, violations, ok: violations.length === 0 };
}

export function runCli(argv, deps = {}) {
  if (argv.length > 0) return { exitCode: 64, stdout: "", stderr: `unknown argument: ${argv[0]}\n` };
  const root = deps.root || REPO_ROOT;
  const result = auditGateCommandDocs(listDocs(root, deps), { ...deps, root });
  const stdout = `${JSON.stringify(result, null, 2)}\n`;
  if (result.ok) return { exitCode: 0, stdout, stderr: "" };
  return {
    exitCode: 2,
    stdout,
    stderr:
      "gate-command-doc-audit: 書かれているとおりに実行するとゲートが引数エラーで落ちる。" +
      "規範文書のコマンド形をゲートの契約に合わせる。\n",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
