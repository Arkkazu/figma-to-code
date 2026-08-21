#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_FLAGS, auditGateCommandDocs, listDocs, runCli } from "./doc-command-audit.mjs";

const TOOL_PATH = fileURLToPath(new URL("./doc-command-audit.mjs", import.meta.url));
const fixtureRoot = mkdtempSync(path.join(tmpdir(), "doc-command-audit-"));
const rulesDirectory = path.join(fixtureRoot, "rules");
mkdirSync(rulesDirectory, { recursive: true });

const currentForm = `npm run figma:gate -- preflight MyBrain/verify/gate-x.json ${REQUIRED_FLAGS[0]} <actor> ${REQUIRED_FLAGS[1]} <context>`;
writeFileSync(path.join(rulesDirectory, "current.md"), `# 現行契約\n\n${currentForm}\n`, "utf8");
writeFileSync(
  path.join(rulesDirectory, "stale.md"),
  "# 旧契約\n\nnpm run figma:gate -- preflight MyBrain/verify/gate-x.json\n",
  "utf8",
);
writeFileSync(
  path.join(rulesDirectory, "partial.md"),
  `# 片方だけ\n\nnode MyBrain/verify/figma-gate.mjs preflight gate.json ${REQUIRED_FLAGS[0]} someone\n`,
  "utf8",
);
writeFileSync(
  path.join(rulesDirectory, "unrelated.md"),
  [
    "# 無関係",
    "",
    "npm run figma:gate -- close MyBrain/verify/gate-x.json",
    "preflight という語だけの行",
    "上位層は `C:\\AI\\vault\\WORKFLOW.md` にある（散文中のパス表記は実行しない）。",
    "node C:/AI/figma-to-code/tools/workflow-preflight.mjs",
    "",
  ].join("\n"),
  "utf8",
);
writeFileSync(
  path.join(rulesDirectory, "backslash.md"),
  "# シェル依存\n\nnode C:\\AI\\figma-to-code\\tools\\workflow-preflight.mjs\n",
  "utf8",
);

const docs = listDocs(fixtureRoot);
assert.equal(docs.length, 5, "every markdown document under the doc roots is inspected");

const audited = auditGateCommandDocs(docs, { root: fixtureRoot });
assert.equal(audited.ok, false, "a stale command form is a violation");
assert.deepEqual(
  audited.violations
    .filter((violation) => violation.rule === "gate-contract")
    .map((violation) => path.basename(violation.file))
    .sort(),
  ["partial.md", "stale.md"],
  "only the documents whose preflight command misses a required flag are reported",
);

// Git Bash で落ちるバックスラッシュ絶対パスを、コマンド行だけで検出する
const shellViolations = audited.violations.filter((violation) => violation.rule === "windows-backslash-command");
assert.deepEqual(
  shellViolations.map((violation) => path.basename(violation.file)),
  ["backslash.md"],
  `only command lines with a backslash path are reported: ${JSON.stringify(shellViolations)}`,
);
assert.ok(shellViolations[0].hint.includes("C:/AI/"), "the finding names the portable form");
assert.deepEqual(
  audited.violations.find((violation) => violation.file.endsWith("stale.md") && violation.rule === "gate-contract").missing,
  [...REQUIRED_FLAGS],
  "both missing flags are named",
);
assert.deepEqual(
  audited.violations.find((violation) => violation.file.endsWith("partial.md") && violation.rule === "gate-contract").missing,
  [REQUIRED_FLAGS[1]],
  "a half-migrated command reports only the flag it still lacks",
);

// close や本文中の語は誤検出しない
assert.equal(
  auditGateCommandDocs([path.join(rulesDirectory, "unrelated.md")], { root: fixtureRoot }).ok,
  true,
  "close commands, prose paths, and forward-slash command lines are not flagged",
);

assert.equal(runCli([], { root: fixtureRoot }).exitCode, 2, "the CLI fails on a stale document set");
assert.equal(runCli(["--nope"], { root: fixtureRoot }).exitCode, 64, "unknown arguments are rejected");

// 正本そのものが契約と一致していることを回帰として固定する
const repoRun = spawnSync(process.execPath, [TOOL_PATH], { encoding: "utf8" });
assert.equal(
  repoRun.status,
  0,
  `this repository documents the current gate contract (output=${repoRun.stdout}${repoRun.stderr})`,
);
assert.equal(JSON.parse(repoRun.stdout).ok, true, "the CLI reports the verdict as JSON");

rmSync(fixtureRoot, { recursive: true, force: true });
process.stdout.write("doc-command-audit.e2e: PASS\n");
