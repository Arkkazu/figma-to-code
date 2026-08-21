#!/usr/bin/env node
// figma-feature-coverage.e2e.mjs — P-5監査器の隔離E2E

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const script = resolve(templateDirectory, "figma-feature-coverage.mjs");
const repo = mkdtempSync(join(tmpdir(), "figma-feature-coverage-e2e-"));

function write(relativePath, value) {
  const absolute = join(repo, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(...args) {
  return execFileSync(process.execPath, [script, ...args], { cwd: repo, encoding: "utf8" });
}

function runFailure(expected, ...args) {
  try {
    execFileSync(process.execPath, [script, ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`;
    if (!output.includes(expected)) throw new Error(`expected failure containing ${JSON.stringify(expected)}; got: ${output}`);
    return;
  }
  throw new Error(`expected failure containing ${JSON.stringify(expected)}, but command succeeded`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function covered(needle) {
  return { status: "covered", evidence: [{ path: "evidence.md", needle }] };
}

function gap(status, title) {
  return {
    status,
    reason: "この隔離fixtureでは意図的に対応経路を欠落させ、改善提案が出ることを検査する。",
    proposal: {
      title,
      summary: "対応経路を追加したうえで、対応しない実装が落ちる負のE2Eを同時に固定する。",
      targets: ["verify/new-capability.mjs"],
      negativeE2ERequired: true,
    },
  };
}

try {
  const evidence = {
    acquisition: "acquisition evidence records a complete source statement",
    specification: "specification evidence records a complete rule statement",
    conversion: "conversion evidence records a complete implementation statement",
    verification: "verification evidence records a complete execution statement",
  };
  write("evidence.md", `${Object.values(evidence).join("\n")}\n`);
  write("verify/new-capability.mjs", "// target\n");
  const base = {
    version: 1,
    catalogId: "coverage-e2e",
    scope: "隔離E2Eで4段カバレッジと改善提案の生成を検査するカタログ。",
    features: [
      {
        id: "covered-feature",
        name: "完全被覆機能",
        source: "隔離fixtureの正常系を固定するための機能。",
        stages: { acquisition: covered(evidence.acquisition), specification: covered(evidence.specification), conversion: covered(evidence.conversion), verification: covered(evidence.verification) },
      },
      {
        id: "gap-feature",
        name: "検証不能機能",
        source: "隔離fixtureの提案生成を固定するための機能。",
        stages: { acquisition: covered(evidence.acquisition), specification: covered(evidence.specification), conversion: covered(evidence.conversion), verification: gap("unverifiable", "検証器の対応経路を追加する") },
      },
    ],
  };
  write("catalog.json", base);
  const output = run("audit", "catalog.json", "out/report.json");
  check(output.includes("features 2, fully covered 1, findings 1"), `unexpected audit output: ${output}`);
  const report = JSON.parse(readFileSync(join(repo, "out/report.json"), "utf8"));
  check(report.result.featureCount === 2, "feature count must be two");
  check(report.result.fullyCoveredFeatures === 1 && report.result.findings === 1, "positive and gap features must be counted separately");
  check(report.proposals.length === 1 && report.proposals[0].category === "unverifiable", "unverifiable stage must create a proposal");
  check(report.graph.mermaid.includes("flowchart LR") && report.graph.nodes.length === 10, "report must contain the four-stage graph");
  check(readFileSync(join(repo, "out/report.mmd"), "utf8").includes("flowchart LR"), "Mermaid graph companion must be written");

  // 負の経路: 1文字などの短いneedleではcoveredを宣言できない。
  const shortNeedle = structuredClone(base);
  shortNeedle.features[0].stages.acquisition = covered("short");
  write("short-needle.json", shortNeedle);
  runFailure("at least 20 characters", "audit", "short-needle.json");

  // 負の経路: 根拠が消えたcovered宣言はPASS扱いにせず、根拠不足の提案へ変える。
  base.features[0].stages.verification = {
    status: "covered",
    evidence: [{ path: "evidence.md", needle: "missing evidence needle intentionally absent" }],
    proposal: {
      title: "検証根拠を実行可能な状態へ復旧する",
      summary: "存在しない根拠をcoveredとして扱わず、実在する検証器と負のE2Eを根拠にカタログを更新する。",
      targets: ["verify/new-capability.mjs"],
      negativeE2ERequired: true,
    },
  };
  base.features.splice(1, 1);
  write("missing-evidence.json", base);
  run("audit", "missing-evidence.json", "out/missing.json");
  const missing = JSON.parse(readFileSync(join(repo, "out/missing.json"), "utf8"));
  check(missing.result.findings === 1, "missing evidence must become a finding");
  check(missing.proposals[0].category === "insufficient-evidence", "missing evidence must not be reported as covered");
  runFailure("strict mode failed", "audit", "missing-evidence.json", "out/strict.json", "--strict");

  // path traversalは証跡を外部ファイルで捏造できるため、入力時点で拒否する。
  base.features[0].stages.verification = { status: "covered", evidence: [{ path: "../outside.md", needle: "unsafe external evidence must not be read" }] };
  write("unsafe.json", base);
  runFailure("repository-relative path", "audit", "unsafe.json");

  console.log("figma-feature-coverage E2E PASS");
} finally {
  rmSync(repo, { recursive: true, force: true });
}
