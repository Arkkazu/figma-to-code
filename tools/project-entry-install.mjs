#!/usr/bin/env node
// 案件リポジトリのルートへ入口2枚（AGENTS.md / CLAUDE.md）を設置・検証する。
//
// Codex は cwd とその祖先の AGENTS.md しか自動読込しない。figma-to-code は案件cwdの
// 祖先ではないため、案件側に入口を置かない限り本リポジトリの規則は届かない。
// 手作業コピーは世代差を生むので、SHA-256 の一致を --check で機械検査する。

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENTRY_FILENAMES = Object.freeze(["AGENTS.md", "CLAUDE.md"]);
export const TEMPLATE_PATH = fileURLToPath(new URL("../templates/project-entry.md", import.meta.url));

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function readTemplate({ readFile = (target) => readFileSync(target, "utf8") } = {}) {
  const text = readFile(TEMPLATE_PATH);
  return { path: TEMPLATE_PATH, text, sha256: sha256(text) };
}

// status: absent（未設置） / drift（内容が正本と違う） / current（一致）
export function inspectProjectEntry(projectRoot, deps = {}) {
  const { readFile = (target) => readFileSync(target, "utf8"), exists = existsSync } = deps;
  const template = readTemplate({ readFile });
  const entries = ENTRY_FILENAMES.map((filename) => {
    const target = path.resolve(projectRoot, filename);
    if (!exists(target)) return { filename, path: target, status: "absent", sha256: null };
    const text = readFile(target);
    const digest = sha256(text);
    return {
      filename,
      path: target,
      status: digest === template.sha256 ? "current" : "drift",
      sha256: digest,
    };
  });
  const stale = entries.filter((entry) => entry.status !== "current");
  return { projectRoot: path.resolve(projectRoot), template, entries, stale, ok: stale.length === 0 };
}

export function installProjectEntry(projectRoot, deps = {}) {
  const { writeFile = (target, text) => writeFileSync(target, text, "utf8") } = deps;
  const inspection = inspectProjectEntry(projectRoot, deps);
  const written = [];
  for (const entry of inspection.stale) {
    writeFile(entry.path, inspection.template.text);
    written.push({ filename: entry.filename, path: entry.path, previousStatus: entry.status });
  }
  return { ...inspection, written, ok: true, stale: [] };
}

function assertProjectRoot(projectRoot, deps) {
  const { exists = existsSync, statPath = statSync } = deps;
  const resolved = path.resolve(projectRoot);
  if (!exists(resolved) || !statPath(resolved).isDirectory()) {
    return `project root is not a directory: ${resolved}`;
  }
  return null;
}

export function runCli(argv, deps = {}) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const positionals = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = flags.filter((flag) => flag !== "--check");

  if (unknown.length > 0) return { exitCode: 64, stdout: "", stderr: `unknown argument: ${unknown[0]}\n` };
  if (positionals.length !== 1) {
    return {
      exitCode: 64,
      stdout: "",
      stderr: "Usage: node tools/project-entry-install.mjs <案件ルート> [--check]\n",
    };
  }

  const rootError = assertProjectRoot(positionals[0], deps);
  if (rootError) return { exitCode: 64, stdout: "", stderr: `${rootError}\n` };

  if (flags.includes("--check")) {
    const inspection = inspectProjectEntry(positionals[0], deps);
    const stdout = `${JSON.stringify({ mode: "check", ...summarize(inspection) }, null, 2)}\n`;
    if (inspection.ok) return { exitCode: 0, stdout, stderr: "" };
    return {
      exitCode: 2,
      stdout,
      stderr:
        "project-entry-install: 案件の入口が正本と一致しない。" +
        "この状態ではfigma-to-codeの規則が案件セッションへ届かない。--check を外して再設置する。\n",
    };
  }

  const installed = installProjectEntry(positionals[0], deps);
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ mode: "install", ...summarize(installed) }, null, 2)}\n`,
    stderr: "",
  };
}

function summarize(result) {
  return {
    projectRoot: result.projectRoot,
    templatePath: result.template.path,
    templateSha256: result.template.sha256,
    entries: result.entries.map(({ filename, status, sha256: digest }) => ({ filename, status, sha256: digest })),
    written: (result.written || []).map((entry) => entry.filename),
    ok: result.ok,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
