#!/usr/bin/env node
// 規範文書に書かれたコマンドが、書いてあるとおり実行して通る形になっているかを検査する。
// 検査は4つ。(1) figma:gate preflight がゲートの実引数契約と一致しているか、
// (2) node / npm のコマンド行がWindowsのバックスラッシュ絶対パスを使っていないか、
// (3) 文書が呼ぶゲートのサブコマンドが実在するか、
// (4) 第2引数を必須とするサブコマンドに、その引数が書かれているか。
// (3)(4) の正解集合は templates/verify/figma-gate.mjs の実装から導出する。手で表を持つと古くなる。
//
// 2026-08-21 実測：rules/figma-spec-pipeline.md と templates/LOOP.md は
// `--implementation-actor` / `--implementation-context-id` を欠いた形を書いていた。
// gate は v13 でこの2つを必須にしているため、書いてあるとおりに実行すると
// `preflight requires exactly ...` で即FAILする。案件側はこの記述を写すので、
// ゲートを通せない案件が生まれ、ゲートを飛ばして実装する経路が開く。
// 2026-08-22 実測：Git Bash（MSYS）では `node C:\AI\figma-to-code\tools\x.mjs` の
// バックスラッシュがエスケープとして解釈され、`AIfigma-to-codetoolsx.mjs` を探して
// MODULE_NOT_FOUND で落ちる。`C:/AI/...` はPowerShell・cmd・Git Bashのいずれでも通る。
// 2026-08-24 実測：案件 LOOP.md が `npm run figma:gate -- page-complete ...` をゴール条件の
// 判定方法として書いていたが、`page-complete` は案件gateにも正本テンプレートにも実装が無い。
// 引数契約とパス表記の検査を通っても、存在しないサブコマンドは素通りしていた。同じ実測で
// `section-close` が必須にする `<sectionId>` を欠いた記述も見つかった。これが3・4件目である。
// 走査範囲も広げる。案件側の LOOP.md / MyBrain/ は本リポジトリの外にあるため、追加ルートを
// 引数で受け取れないと、案件に書かれた実行不能コマンドを検出できない。
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
export const COMMAND_LINE = /^(?:node|npm)\s/;
export const WINDOWS_BACKSLASH_PATH = /[A-Za-z]:(?:\\[^\s\\`"']+)+/;
export const GATE_INVOCATION = /(?:figma:gate\s+--\s+|figma-gate\.mjs\s+)([a-z][a-z-]*)/;
export const GATE_SOURCE = fileURLToPath(new URL("../templates/verify/figma-gate.mjs", import.meta.url));
export const SKIP_DIRS = Object.freeze(["node_modules", ".git", "vendor", "checkpoints", "evidence", "learning", "_retired"]);
export const SKIP_DOCS = /^(?:STATE|AUDIT|REVIEW)[-.]/;

// サブコマンドと必須引数の正解集合はゲートの実装から導出する。手で表を持つとここが古くなる。
export function readGateContract(deps = {}) {
  const { readFile = (target) => readFileSync(target, "utf8"), gateSource = GATE_SOURCE } = deps;
  const source = readFile(gateSource);
  const subcommands = new Set();
  for (const match of source.matchAll(/command\s*===\s*"([a-z][a-z-]*)"/g)) subcommands.add(match[1]);
  const requiresSecondArg = new Set();
  for (const match of source.matchAll(/!args\[2\]\)\s*fail\("([a-z][a-z-]*) requires/g)) requiresSecondArg.add(match[1]);
  return { subcommands, requiresSecondArg };
}

function walkMarkdown(directory, found, deps) {
  const { readDir = readdirSync, stat = statSync } = deps;
  for (const entry of readDir(directory)) {
    if (SKIP_DIRS.includes(entry)) continue;
    const target = path.join(directory, entry);
    if (stat(target).isDirectory()) walkMarkdown(target, found, deps);
    else if (entry.endsWith(".md") && !SKIP_DOCS.test(entry)) found.push(target);
  }
}

export function listDocs(root = REPO_ROOT, deps = {}) {
  const { stat = statSync } = deps;
  const found = [];
  for (const directory of DOC_ROOTS) {
    const target = path.join(root, directory);
    try {
      if (stat(target).isDirectory()) walkMarkdown(target, found, deps);
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

// 追加ルートはファイルでもディレクトリでもよい。案件側の LOOP.md や MyBrain/ を直接指す。
export function listExtraDocs(targets, deps = {}) {
  const { stat = statSync } = deps;
  const found = [];
  for (const entry of targets) {
    const target = path.resolve(entry);
    const info = stat(target);
    if (info.isDirectory()) walkMarkdown(target, found, deps);
    else if (target.endsWith(".md")) found.push(target);
  }
  return found.sort();
}

export function auditGateCommandDocs(files, deps = {}) {
  const { readFile = (target) => readFileSync(target, "utf8"), root = REPO_ROOT } = deps;
  const contract = readGateContract(deps);
  const violations = [];
  for (const file of files) {
    const lines = readFile(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      const location = { file: path.relative(root, file).replace(/\\/g, "/"), line: index + 1, text: line.trim() };

      if (PREFLIGHT_COMMAND.test(line)) {
        const missing = REQUIRED_FLAGS.filter((flag) => !line.includes(flag));
        if (missing.length > 0) violations.push({ ...location, rule: "gate-contract", missing });
      }

      // コマンド行だけを見る。散文中のWindowsパス表記は所在の説明であって実行しない。
      if (COMMAND_LINE.test(line.trim()) && WINDOWS_BACKSLASH_PATH.test(line)) {
        violations.push({
          ...location,
          rule: "windows-backslash-command",
          missing: [],
          hint: "Git Bash がバックスラッシュを食うため `C:/AI/...` と書く",
        });
      }

      const invocation = GATE_INVOCATION.exec(line);
      if (invocation) {
        const subcommand = invocation[1];
        if (!contract.subcommands.has(subcommand)) {
          violations.push({
            ...location,
            rule: "unknown-gate-subcommand",
            missing: [subcommand],
            hint: `実在するのは ${[...contract.subcommands].sort().join(" / ")}`,
          });
        } else if (contract.requiresSecondArg.has(subcommand)) {
          const after = line.slice(invocation.index + invocation[0].length);
          const operands = after.split(/\s+/).filter((token) => token && !token.startsWith("--"));
          if (operands.length < 2) {
            violations.push({
              ...location,
              rule: "missing-gate-operand",
              missing: [subcommand],
              hint: `${subcommand} は <manifest> のあとに第2引数が必須`,
            });
          }
        }
      }
    });
  }
  return { checked: files.length, violations, ok: violations.length === 0 };
}

export function runCli(argv, deps = {}) {
  const unknown = argv.filter((arg) => arg.startsWith("--"));
  if (unknown.length > 0) return { exitCode: 64, stdout: "", stderr: `unknown argument: ${unknown[0]}\n` };
  const root = deps.root || REPO_ROOT;
  let files;
  try {
    files = [...listDocs(root, deps), ...listExtraDocs(argv, deps)];
  } catch (error) {
    return { exitCode: 64, stdout: "", stderr: `${error.message}\n` };
  }
  const result = auditGateCommandDocs(files, { ...deps, root });
  const stdout = `${JSON.stringify(result, null, 2)}\n`;
  if (result.ok) return { exitCode: 0, stdout, stderr: "" };
  return {
    exitCode: 2,
    stdout,
    stderr:
      "doc-command-audit: 書かれているとおりに実行すると落ちるコマンドが規範文書にある。" +
      "ゲートの引数契約、シェルに依存しないパス表記、実在するサブコマンドと必須引数へ揃える。\n",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
