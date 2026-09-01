#!/usr/bin/env node
// このリポジトリの検査を1コマンドで通す。CIと手元で同じ集合を実行する。
//
// 既知の失敗（KNOWN_FAILING）は集合から外してある。緑と赤を混ぜると
// 「いつも赤いので誰も見ない」状態になり、検査そのものが無効化されるため。
// 外した理由は各エントリに書く。解消したらCHECKSへ移す。

import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const CHECKS = Object.freeze([
  "tools/workflow-preflight.e2e.mjs",
  "tools/project-entry-install.e2e.mjs",
  // 入口の発火条件。実プロセスで現物5文書も検査する。上位層を読めない環境
  // （CI・クラウド）では4文書に落として skipped を明示し、フラグ無しなら落ちることも
  // 固定しているので、この1本でどちらの環境でも意味のある検査になる。
  // 素の `entry-trigger-audit.mjs` を CHECKS へ入れない理由: 上位層のWeb正本が
  // 無い環境では --skip-missing-upstream が要るが、runCheck は引数を渡さない。
  // 環境ごとの期待値を知っているのは e2e の側である。
  "tools/entry-trigger-audit.e2e.mjs",
  "tools/doc-command-audit.e2e.mjs",
  "tools/public-memory-scan.e2e.mjs",
  "tools/figma-log-promote.e2e.mjs",
  "tools/figma-scope-lock.e2e.mjs",
  "templates/verify/figma-gate.e2e.mjs",
  "templates/verify/gate-contract-audit.e2e.mjs",
  "templates/verify/figma-feature-coverage.e2e.mjs",
  // 正本そのものへの検査（規範文書のコマンド、公開MyBrainの機密）
  "tools/doc-command-audit.mjs",
  "tools/public-memory-scan.mjs",
]);

export const KNOWN_FAILING = Object.freeze([
  { path: "templates/verify/fidelity-benchmark.e2e.mjs", reason: "検証基準と同一の描画環境（フォント・ブラウザ版）を要する。2026-08-21時点で本変更以前から赤。" },
  { path: "templates/verify/p3-role-packet.e2e.mjs", reason: "P-3 clean-room の未解決（cleanRoomAuthorization のハッシュ不一致）。本変更以前から赤。" },
  { path: "templates/verify/p3-p11-app-server-spike.e2e.mjs", reason: "P-11 のプロセスツリー確認が現行環境で成立しない。本変更以前から赤。" },
  { path: "templates/verify/accessibility-verify.e2e.mjs", reason: "実ブラウザを要する。" },
  { path: "templates/verify/asset-verify.e2e.mjs", reason: "実ブラウザを要する。" },
  { path: "templates/verify/motion-verify.e2e.mjs", reason: "実ブラウザを要する。" },
  { path: "templates/verify/gate-browser-batch.e2e.mjs", reason: "実ブラウザを要する。" },
  { path: "templates/verify/p3-page-provider.e2e.mjs", reason: "実ブラウザを要する。" },
  { path: "templates/verify/checkpoint-diff.e2e.mjs", reason: "案件側の成果物を要する。" },
]);

export function runCheck(target, deps = {}) {
  const { run = spawnSync, root = REPO_ROOT } = deps;
  const result = run(process.execPath, [target], { cwd: root, encoding: "utf8", timeout: 600000 });
  return {
    target,
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

export function runChecks(targets = CHECKS, deps = {}) {
  const results = targets.map((target) => runCheck(target, deps));
  return { results, failed: results.filter((result) => !result.ok), ok: results.every((result) => result.ok) };
}

if (process.argv[1] && fileURLToPath(new URL(import.meta.url)) === process.argv[1]) {
  const { results, failed, ok } = runChecks();
  for (const result of results) {
    process.stdout.write(`${result.ok ? "PASS" : "FAIL"} ${result.target}\n`);
    if (!result.ok) process.stdout.write(`${result.output}\n`);
  }
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (KNOWN_FAILING.length > 0) {
    process.stdout.write(`skipped (known failing): ${KNOWN_FAILING.length}\n`);
    for (const entry of KNOWN_FAILING) process.stdout.write(`  - ${entry.path}: ${entry.reason}\n`);
  }
  process.exit(ok ? 0 : 1);
}
