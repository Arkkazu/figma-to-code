#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_FLAGS, auditGateCommandDocs, listDocs, readGateContract, runCli } from "./doc-command-audit.mjs";

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
// 2026-08-24 追加：存在しないサブコマンドと、必須の第2引数を欠いた呼び出し
writeFileSync(
  path.join(rulesDirectory, "unknown-subcommand.md"),
  "# 実装の無いサブコマンド\n\nnpm run figma:gate -- page-complete MyBrain/verify/page-coverage-top.json\n",
  "utf8",
);
writeFileSync(
  path.join(rulesDirectory, "missing-operand.md"),
  "# 第2引数なし\n\nnpm run figma:gate -- section-close MyBrain/verify/gate-x.json\n",
  "utf8",
);
writeFileSync(
  path.join(rulesDirectory, "operand-ok.md"),
  "# 第2引数あり\n\nnpm run figma:gate -- section-close MyBrain/verify/gate-x.json hero-01\n",
  "utf8",
);

const contract = readGateContract();
assert.ok(contract.subcommands.has("section-close"), "the contract is derived from the gate implementation");
assert.ok(!contract.subcommands.has("page-complete"), "page-complete is not implemented by the gate");
assert.ok(contract.requiresSecondArg.has("section-close"), "section-close requires a sectionId");
assert.ok(!contract.requiresSecondArg.has("close"), "close takes only the manifest");

const docs = listDocs(fixtureRoot);
assert.equal(docs.length, 8, "every markdown document under the doc roots is inspected");

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

// 存在しないサブコマンドを検出する（2026-08-24 の page-complete 実測）
const unknownViolations = audited.violations.filter((violation) => violation.rule === "unknown-gate-subcommand");
assert.deepEqual(
  unknownViolations.map((violation) => path.basename(violation.file)),
  ["unknown-subcommand.md"],
  `only the document naming an unimplemented subcommand is reported: ${JSON.stringify(unknownViolations)}`,
);
assert.deepEqual(unknownViolations[0].missing, ["page-complete"], "the finding names the missing subcommand");
assert.ok(unknownViolations[0].hint.includes("section-close"), "the finding lists the subcommands that do exist");

// 必須の第2引数の欠落を検出する（section-close requires a sectionId）
const operandViolations = audited.violations.filter((violation) => violation.rule === "missing-gate-operand");
assert.deepEqual(
  operandViolations.map((violation) => path.basename(violation.file)),
  ["missing-operand.md"],
  `a section-close written with the manifest alone is reported: ${JSON.stringify(operandViolations)}`,
);
assert.equal(
  auditGateCommandDocs([path.join(rulesDirectory, "operand-ok.md")], { root: fixtureRoot }).ok,
  true,
  "section-close with a sectionId is accepted",
);

// close や本文中の語は誤検出しない
assert.equal(
  auditGateCommandDocs([path.join(rulesDirectory, "unrelated.md")], { root: fixtureRoot }).ok,
  true,
  "close commands, prose paths, and forward-slash command lines are not flagged",
);

assert.equal(runCli([], { root: fixtureRoot }).exitCode, 2, "the CLI fails on a stale document set");
assert.equal(runCli(["--nope"], { root: fixtureRoot }).exitCode, 64, "unknown flags are rejected");

// 追加ルート：本リポジトリの外にある案件文書を走査できる（2026-08-24 追加）
const projectRoot = mkdtempSync(path.join(tmpdir(), "doc-command-audit-project-"));
const projectDocs = path.join(projectRoot, "MyBrain");
mkdirSync(projectDocs, { recursive: true });
writeFileSync(
  path.join(projectRoot, "LOOP.md"),
  "# 案件LOOP\n\nnpm run figma:gate -- page-complete MyBrain/verify/page-coverage-top.json\n",
  "utf8",
);
writeFileSync(path.join(projectDocs, "WORKFLOW.md"), "# 案件規則\n\nnpm run figma:gate -- close gate.json\n", "utf8");

const cleanRoot = mkdtempSync(path.join(tmpdir(), "doc-command-audit-clean-"));
mkdirSync(path.join(cleanRoot, "rules"), { recursive: true });
writeFileSync(path.join(cleanRoot, "rules", "ok.md"), `# 現行\n\n${currentForm}\n`, "utf8");

const withoutExtra = runCli([], { root: cleanRoot });
assert.equal(withoutExtra.exitCode, 0, "the clean repository passes on its own");
const withExtraFile = runCli([path.join(projectRoot, "LOOP.md")], { root: cleanRoot });
assert.equal(withExtraFile.exitCode, 2, "an extra file outside the repository is audited");
assert.equal(
  JSON.parse(withExtraFile.stdout).violations[0].rule,
  "unknown-gate-subcommand",
  "the project document's unimplemented subcommand is what fails it",
);
const withExtraDirectory = runCli([projectRoot], { root: cleanRoot });
assert.equal(withExtraDirectory.exitCode, 2, "an extra directory is walked recursively");
assert.equal(
  JSON.parse(withExtraDirectory.stdout).checked,
  3,
  "the clean document plus both project documents are counted",
);
assert.equal(runCli([path.join(projectRoot, "missing.md")], { root: cleanRoot }).exitCode, 64, "a missing extra target is rejected");

// 正本そのものが契約と一致していることを回帰として固定する
const repoRun = spawnSync(process.execPath, [TOOL_PATH], { encoding: "utf8" });
assert.equal(
  repoRun.status,
  0,
  `this repository documents the current gate contract (output=${repoRun.stdout}${repoRun.stderr})`,
);
assert.equal(JSON.parse(repoRun.stdout).ok, true, "the CLI reports the verdict as JSON");

rmSync(fixtureRoot, { recursive: true, force: true });
rmSync(projectRoot, { recursive: true, force: true });
rmSync(cleanRoot, { recursive: true, force: true });
process.stdout.write("doc-command-audit.e2e: PASS\n");
