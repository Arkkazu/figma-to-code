#!/usr/bin/env node
// 公開MyBrain（リポジトリ直下 `MyBrain/`）に、`MyBrain/rules/public-memory-policy.md`
// が禁じた非公開情報が混ざっていないかを機械検査する。push前に実行する。
//
// 対象は既定でリポジトリ直下の `MyBrain/` だけとする。`rules/corrections.md` など
// 正本側には既存の案件固有値が残っており（別scopeで処理する）、それを巻き込むと
// この検査が常時FAILして無視されるようになるため。
//
// 検出できないもの（人間のレビューが要る）: 案件名・クライアント名、CSSセレクタや
// DOM対応の断片、スクリーンショットの内容。これらは検出規則を書けるほど形が
// 定まっていない。この検査のPASSは「機械で見える範囲に無い」ことしか意味しない。

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_SCAN_PATHS = Object.freeze(["MyBrain"]);
export const SKIP_DIRECTORIES = Object.freeze([".git", "node_modules"]);

// secret: 一致部分を伏せて報告する（出力自体が漏洩経路になるため）
export const RULES = Object.freeze([
  { id: "figma-node-id", pattern: /\b\d{2,6}:\d{3,6}\b/g, label: "Figma node-id らしき値" },
  { id: "figma-url", pattern: /figma\.com\/(?:file|design|proto|board)\/[A-Za-z0-9]+/gi, label: "Figma URL" },
  { id: "figma-file-key", pattern: /\bfile[_-]?key\s*[:=]\s*\S+/gi, label: "Figma fileKey", secret: true },
  { id: "design-measurement", pattern: /\b\d{2,4}px\b/g, label: "デザイン実測値" },
  { id: "private-key", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g, label: "秘密鍵", secret: true },
  { id: "token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, label: "アクセストークン", secret: true },
  { id: "credential-assignment", pattern: /\b(?:password|passwd|api[_-]?key|secret|access[_-]?token|authorization)\s*[:=]\s*\S+/gi, label: "資格情報の代入", secret: true },
  { id: "basic-auth-url", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@\S+/gi, label: "Basic認証つきURL", secret: true },
  { id: "ip-address", pattern: /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g, label: "IPアドレス" },
  { id: "user-home-path", pattern: /[A-Za-z]:\\Users\\[^\s\\`"']+/g, label: "利用者固有のホームパス" },
]);

function maskMatch(rule, matched) {
  if (!rule.secret) return matched;
  const head = matched.slice(0, 4);
  return `${head}${"*".repeat(Math.max(matched.length - 4, 3))}`;
}

export function listFiles(targets, deps = {}) {
  const { readDir = readdirSync, stat = statSync, root = REPO_ROOT } = deps;
  const found = [];
  const walk = (target) => {
    const info = stat(target);
    if (info.isDirectory()) {
      if (SKIP_DIRECTORIES.includes(path.basename(target))) return;
      for (const entry of readDir(target)) walk(path.join(target, entry));
      return;
    }
    if (info.isFile()) found.push(target);
  };
  for (const target of targets) {
    const resolved = path.isAbsolute(target) ? target : path.resolve(root, target);
    try {
      walk(resolved);
    } catch {
      // 走査対象が無い配布物では何も検査しない
    }
  }
  return found.sort();
}

export function scanPublicMemory(files, deps = {}) {
  const { readFile = (target) => readFileSync(target, "utf8"), root = REPO_ROOT } = deps;
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = readFile(file);
    } catch {
      continue;
    }
    text.split(/\r?\n/).forEach((line, index) => {
      for (const rule of RULES) {
        for (const match of line.matchAll(rule.pattern)) {
          findings.push({
            file: path.relative(root, file).replace(/\\/g, "/"),
            line: index + 1,
            rule: rule.id,
            label: rule.label,
            matched: maskMatch(rule, match[0]),
          });
        }
      }
    });
  }
  return { scanned: files.length, findings, ok: findings.length === 0 };
}

export function runCli(argv, deps = {}) {
  const unknown = argv.filter((arg) => arg.startsWith("--"));
  if (unknown.length > 0) return { exitCode: 64, stdout: "", stderr: `unknown argument: ${unknown[0]}\n` };

  const root = deps.root || REPO_ROOT;
  const targets = argv.length > 0 ? argv : [...DEFAULT_SCAN_PATHS];
  const result = scanPublicMemory(listFiles(targets, { ...deps, root }), { ...deps, root });
  const stdout = `${JSON.stringify({ targets, ...result }, null, 2)}\n`;
  if (result.ok) return { exitCode: 0, stdout, stderr: "" };
  return {
    exitCode: 2,
    stdout,
    stderr:
      "public-memory-scan: 公開MyBrainに非公開情報らしき記述がある。" +
      "該当行を案件側の非公開 MyBrain へ移すか、値を落としてから push する。\n",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
