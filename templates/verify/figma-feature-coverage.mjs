#!/usr/bin/env node
// figma-feature-coverage.mjs — Figma機能の予防的カバレッジ監査（P-5）
//
// 目的: Figma機能ごとに「取得 → spec化 → 変換 → 検証」の根拠を同じ図へ固定し、
//       未対応・検証不能・根拠不足を失敗発生前に改善提案として出す。
//
// 使い方:
//   node MyBrain/verify/figma-feature-coverage.mjs audit <catalog.json> [out.json] [--strict]
//
// audit は、監査器自体が実行できた場合に0を返す。--strict は発見した提案を
// 未解消のまま通過させないためのCI向けモードであり、案件のfigma-gateには接続しない。
// 正本や実行器の変更は、出力された proposal を独立レビューとowner承認で評価してから行う。

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const STAGES = ["acquisition", "specification", "conversion", "verification"];
const STAGE_LABELS = {
  acquisition: "取得",
  specification: "spec化",
  conversion: "変換",
  verification: "検証",
};
const GAP_STATUSES = new Set(["uncovered", "unverifiable", "insufficient-evidence"]);
const DECLARED_STATUSES = new Set(["covered", "uncovered", "unverifiable"]);

function fail(message) {
  throw new Error(`FIGMA FEATURE COVERAGE: ${message}`);
}

function requireString(value, label, minimum = 1) {
  if (typeof value !== "string" || value.trim().length < minimum) fail(`${label} must be a string of at least ${minimum} characters`);
  return value.trim();
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} does not exist: ${filePath}`);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function repoPath(value, label, mustExist = true) {
  const supplied = requireString(value, label).replace(/\\/g, "/");
  if (supplied.startsWith("/") || /^[A-Za-z]:\//.test(supplied) || supplied.split("/").includes("..")) {
    fail(`${label} must be a repository-relative path: ${supplied}`);
  }
  const absolutePath = resolve(repoRoot, supplied);
  const rootWithSeparator = repoRoot.endsWith(sep) ? repoRoot : `${repoRoot}${sep}`;
  if (absolutePath !== repoRoot && !absolutePath.startsWith(rootWithSeparator)) fail(`${label} escapes the repository: ${supplied}`);
  if (mustExist && !existsSync(absolutePath)) fail(`${label} does not exist: ${supplied}`);
  return { absolutePath, relativePath: relative(repoRoot, absolutePath).replace(/\\/g, "/") };
}

function lineOf(text, needle) {
  const offset = text.indexOf(needle);
  if (offset < 0) return null;
  return text.slice(0, offset).split("\n").length;
}

function validateEvidence(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${label} must be an object`);
  const path = repoPath(raw.path, `${label}.path`);
  const needle = requireString(raw.needle, `${label}.needle`, 20);
  return { path, needle };
}

function validateProposal(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${label} must be an object`);
  const title = requireString(raw.title, `${label}.title`, 12);
  const summary = requireString(raw.summary, `${label}.summary`, 20);
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) fail(`${label}.targets must be a non-empty array`);
  const targets = raw.targets.map((target, index) => {
    const value = requireString(target, `${label}.targets[${index}]`);
    // 改善候補には新規ファイルもあり得る。ここでは存在を要求せず、相対パスだけ固定する。
    return repoPath(value, `${label}.targets[${index}]`, false).relativePath;
  });
  if (new Set(targets).size !== targets.length) fail(`${label}.targets must be unique`);
  if (raw.negativeE2ERequired !== true) fail(`${label}.negativeE2ERequired must be true`);
  return { title, summary, targets, negativeE2ERequired: true };
}

function evaluateStage(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${label} must be an object`);
  const declaredStatus = requireString(raw.status, `${label}.status`);
  if (!DECLARED_STATUSES.has(declaredStatus)) {
    fail(`${label}.status must be covered, uncovered, or unverifiable`);
  }

  if (declaredStatus === "covered") {
    if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) fail(`${label}.evidence must be a non-empty array for covered stage`);
    const evidence = raw.evidence.map((entry, index) => validateEvidence(entry, `${label}.evidence[${index}]`));
    const checkedEvidence = evidence.map((entry) => {
      const text = readFileSync(entry.path.absolutePath, "utf8");
      const line = lineOf(text, entry.needle);
      return {
        path: entry.path.relativePath,
        needle: entry.needle,
        line,
        sha256: sha256(text),
        found: line !== null,
      };
    });
    const missingEvidence = checkedEvidence.filter((entry) => !entry.found);
    if (missingEvidence.length > 0) {
const proposal = raw.proposal === undefined
        ? {
            title: "カタログの根拠を実行可能な状態へ復旧する",
            summary: "coveredと宣言した根拠文字列が現在の正本または実行器に存在しない。対応する実装・文書・カタログのどれが変わったかを独立レビューで特定し、負のE2Eを添えて更新する。",
            targets: [...new Set(missingEvidence.map((entry) => entry.path))],
            negativeE2ERequired: true,
          }
        : validateProposal(raw.proposal, `${label}.proposal`);
      return {
        declaredStatus,
        status: "insufficient-evidence",
        reason: `根拠文字列が現在の正本に見つからない: ${missingEvidence.map((entry) => `${entry.path}:${entry.needle}`).join(" / ")}`,
        evidence: checkedEvidence,
        proposal,
      };
    }
    return { declaredStatus, status: "covered", evidence: checkedEvidence };
  }

  const reason = requireString(raw.reason, `${label}.reason`, 20);
  const proposal = validateProposal(raw.proposal, `${label}.proposal`);
  return { declaredStatus, status: declaredStatus, reason, evidence: [], proposal };
}

function graphId(value) {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

function mermaidLabel(value) {
  return value.replace(/["\n\r]/g, " ");
}

function featureProposal(feature, stage, result) {
  const proposal = result.proposal;
  const fingerprint = sha256(`${feature.id}:${stage}:${result.status}:${proposal.targets.join(",")}`).slice(0, 12);
  return {
    id: `feature-gap-${feature.id}-${stage}-${fingerprint}`,
    status: "pending-independent-review",
    category: result.status,
    feature: { id: feature.id, name: feature.name },
    missingStage: stage,
    reason: result.reason,
    requiredChange: {
      title: proposal.title,
      summary: proposal.summary,
      targets: proposal.targets,
      negativeE2ERequired: true,
    },
    requiredReview: "independent-reviewer + owner approval",
    note: "この提案は正本・gate・specを自動変更しない。実装後に負のE2E、独立批評、owner承認をそろえてから昇格する。",
  };
}

export function auditFeatureCoverage(catalog, { catalogPath = "<in-memory>" } = {}) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) fail("catalog must be an object");
  if (catalog.version !== 1) fail("catalog.version must be 1");
  const catalogId = requireString(catalog.catalogId, "catalog.catalogId");
  const scope = requireString(catalog.scope, "catalog.scope", 20);
  if (!Array.isArray(catalog.features) || catalog.features.length === 0) fail("catalog.features must be a non-empty array");

  const seenIds = new Set();
  const features = [];
  const proposals = [];
  const graphNodes = [];
  const graphEdges = [];
  const mermaid = ["flowchart LR"];

  for (const [index, rawFeature] of catalog.features.entries()) {
    const label = `catalog.features[${index}]`;
    if (!rawFeature || typeof rawFeature !== "object" || Array.isArray(rawFeature)) fail(`${label} must be an object`);
    const id = requireString(rawFeature.id, `${label}.id`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`${label}.id must use lowercase letters, digits, and hyphens`);
    if (seenIds.has(id)) fail(`catalog.features has duplicate id: ${id}`);
    seenIds.add(id);
    const name = requireString(rawFeature.name, `${label}.name`, 4);
    const source = requireString(rawFeature.source, `${label}.source`, 20);
    if (!rawFeature.stages || typeof rawFeature.stages !== "object" || Array.isArray(rawFeature.stages)) fail(`${label}.stages must be an object`);

    const feature = { id, name, source, stages: {} };
    const featureNodeId = `feature_${graphId(id)}`;
    graphNodes.push({ id: featureNodeId, type: "feature", label: name, status: "covered" });
    mermaid.push(`  ${featureNodeId}["${mermaidLabel(name)}"]`);
    let featureStatus = "covered";

    for (const stage of STAGES) {
      if (!(stage in rawFeature.stages)) fail(`${label}.stages.${stage} is required`);
      const result = evaluateStage(rawFeature.stages[stage], `${label}.stages.${stage}`);
      feature.stages[stage] = result;
      const stageNodeId = `${featureNodeId}_${stage}`;
      graphNodes.push({
        id: stageNodeId,
        type: "stage",
        featureId: id,
        stage,
        label: STAGE_LABELS[stage],
        status: result.status,
      });
      graphEdges.push({ from: stage === "acquisition" ? featureNodeId : `${featureNodeId}_${STAGES[STAGES.indexOf(stage) - 1]}`, to: stageNodeId, status: result.status });
      mermaid.push(`  ${stage === "acquisition" ? featureNodeId : `${featureNodeId}_${STAGES[STAGES.indexOf(stage) - 1]}`} --> ${stageNodeId}["${STAGE_LABELS[stage]}: ${result.status}"]`);
      if (GAP_STATUSES.has(result.status)) {
        featureStatus = result.status;
        proposals.push(featureProposal(feature, stage, result));
        mermaid.push(`  class ${stageNodeId} gap`);
      } else {
        mermaid.push(`  class ${stageNodeId} pass`);
      }
    }
    graphNodes.find((node) => node.id === featureNodeId).status = featureStatus;
    feature.status = featureStatus;
    features.push(feature);
  }

  mermaid.push("  classDef pass fill:#d9f7e8,stroke:#1d7a46,color:#123d25");
  mermaid.push("  classDef gap fill:#ffe8e8,stroke:#b42318,color:#5c1111");
  const findings = proposals.length;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    catalog: { id: catalogId, path: catalogPath, scope },
    result: {
      featureCount: features.length,
      fullyCoveredFeatures: features.filter((feature) => feature.status === "covered").length,
      findings,
      pass: findings === 0,
      note: "pass は監査カタログ上の4段根拠が全て見つかったことを示す。Figmaページを使う初回実装の忠実度・実測値を示すものではない。",
    },
    features,
    graph: { format: "mermaid", direction: "LR", nodes: graphNodes, edges: graphEdges, mermaid: `${mermaid.join("\n")}\n` },
    proposals,
  };
}

function usage() {
  console.error("Usage: node MyBrain/verify/figma-feature-coverage.mjs audit <catalog.json> [out.json] [--strict]");
}

function main(args) {
  if (args[0] !== "audit" || !args[1]) {
    usage();
    process.exit(1);
  }
  const strict = args.includes("--strict");
  const positional = args.slice(1).filter((value) => value !== "--strict");
  if (positional.length > 2) fail("audit accepts <catalog.json> [out.json] and optional --strict");
  const catalogPath = repoPath(positional[0], "catalog path");
  const catalog = readJson(catalogPath.absolutePath, "Coverage catalog");
  const report = auditFeatureCoverage(catalog, { catalogPath: catalogPath.relativePath });
  const outputPath = repoPath(positional[1] || "learning/feature-coverage/latest.json", "output path", false);
  writeJson(outputPath.absolutePath, report);
  const graphPath = outputPath.absolutePath.replace(/\.json$/i, "") + ".mmd";
  writeText(graphPath, report.graph.mermaid);
  const graphRelativePath = relative(repoRoot, graphPath).replace(/\\/g, "/");
  console.log(
    `FIGMA FEATURE COVERAGE: features ${report.result.featureCount}, fully covered ${report.result.fullyCoveredFeatures}, ` +
      `findings ${report.result.findings} -> ${outputPath.relativePath}`
  );
  console.log(`  Mermaid graph -> ${graphRelativePath}`);
  if (report.proposals.length > 0) {
    console.log(`  pending independent review: ${report.proposals.map((proposal) => proposal.id).join(", ")}`);
  }
  if (strict && report.result.findings > 0) {
    process.exitCode = 1;
    console.error("FIGMA FEATURE COVERAGE: strict mode failed because improvement proposals remain.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
