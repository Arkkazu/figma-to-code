#!/usr/bin/env node
// templates/verify/ に同梱している「正本が web-development にあるファイル」が、
// その正本と一致しているかを検査する。
//
// 2026-08-25 実測：templates/verify/scope-conflict-audit.mjs は 397行、
// C:\AI\web-development\verify\scope-conflict-audit.mjs は 471行で、116行ずれていた。
// 案件側は web-development 版と一致していたので、腐っていたのはここの同梱コピーだけである。
// 誰もこの2箇所を突き合わせていなかったため、乖離は静かに残り続けた。
//
// なぜ同梱をやめないか：templates/verify/figma-gate.e2e.mjs が
// scope-coordination.mjs と scope-conflict-audit.mjs をフィクスチャへコピーして使う。
// 絶対パスで web-development を参照すると、上位層を持たないクラウドセッションで
// このリポジトリ内完結のE2Eが回らなくなる（WORKFLOW.md「クラウドセッションでの実行範囲」）。
// そこで同梱は残し、正本を読める環境でだけ一致を機械検査する。
//
// 読めない環境（クラウド）では skipped として exit 0 にする。検査できないことを
// 「一致している」と報告しないため、mode を出力に必ず載せる。

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const VENDORED_DIR = path.join(REPO_ROOT, "templates", "verify");
export const DEFAULT_UPSTREAM_DIR = "C:/AI/web-development/verify";

// 正本が web-development にあり、ここへ同梱しているファイル。
// 追加するときは、なぜ同梱が要るのかを templates/verify/README.md にも書く。
export const VENDORED_FILES = Object.freeze([
  "scope-conflict-audit.mjs",
  "scope-coordination.mjs",
  "responsive-html-guard.mjs",
  "lint-units.mjs",
]);

export function upstreamDir(env = process.env) {
  const configured = env.WEB_DEVELOPMENT_VERIFY_DIR?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_UPSTREAM_DIR;
}

// 改行コードだけの差は乖離としない。配布経路でCRLFになるため。
function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

export function auditVendoredVerifiers(deps = {}) {
  const {
    readFile = (target) => readFileSync(target, "utf8"),
    exists = existsSync,
    stat = statSync,
    vendoredDir = VENDORED_DIR,
    upstream = upstreamDir(),
    files = VENDORED_FILES,
  } = deps;

  let upstreamReadable = false;
  try {
    upstreamReadable = exists(upstream) && stat(upstream).isDirectory();
  } catch {
    upstreamReadable = false;
  }
  if (!upstreamReadable) {
    return {
      mode: "skipped",
      upstream,
      reason: "web-development の verify ディレクトリを読めない。上位層を持たない環境では照合できない。",
      checked: 0,
      findings: [],
      ok: true,
    };
  }

  const findings = [];
  for (const name of files) {
    const vendoredPath = path.join(vendoredDir, name);
    const upstreamPath = path.join(upstream, name);
    if (!exists(vendoredPath)) {
      findings.push({ file: name, rule: "vendored-missing", detail: `同梱コピーが無い: ${vendoredPath}` });
      continue;
    }
    if (!exists(upstreamPath)) {
      findings.push({ file: name, rule: "upstream-missing", detail: `正本が無い: ${upstreamPath}` });
      continue;
    }
    if (normalize(readFile(vendoredPath)) !== normalize(readFile(upstreamPath))) {
      findings.push({
        file: name,
        rule: "vendored-drift",
        detail: `同梱コピーが正本と一致しない。${upstreamPath} から同期する`,
      });
    }
  }
  return { mode: "checked", upstream, checked: files.length, findings, ok: findings.length === 0 };
}

export function runCli(argv, deps = {}) {
  if (argv.length > 0) return { exitCode: 64, stdout: "", stderr: `unknown argument: ${argv[0]}\n` };
  const result = auditVendoredVerifiers(deps);
  const stdout = `${JSON.stringify(result, null, 2)}\n`;
  if (result.ok) return { exitCode: 0, stdout, stderr: "" };
  return {
    exitCode: 2,
    stdout,
    stderr:
      "vendored-verifier-audit: templates/verify/ の同梱コピーが web-development の正本と一致しない。" +
      "正本から同期する。ここで独自に編集しない。\n",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
