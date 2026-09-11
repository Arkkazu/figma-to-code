#!/usr/bin/env node
// gate-contract-audit.e2e.mjs — contract v3の未接続manifestを台帳付きで検出する。

import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "gate-contract-audit-e2e-"));
const verifyDirectory = join(repo, "MyBrain", "verify");

function write(name, value) {
  const path = join(verifyDirectory, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function audit() {
  return spawnSync(process.execPath, [join(verifyDirectory, "gate-contract-audit.mjs")], { cwd: repo, encoding: "utf8" });
}

try {
  mkdirSync(verifyDirectory, { recursive: true });
  for (const name of ["gate-contract-audit.mjs", "figma-page-coverage.mjs", "viewport-contract.mjs"]) {
    copyFileSync(resolve(templateDirectory, name), join(verifyDirectory, name));
  }
  write("gate-legacy.json", {
    id: "legacy",
    scope: {
      specPath: "MyBrain/verify/spec.json",
      nodeMapPath: "MyBrain/verify/nodemap.json",
      componentsPath: "MyBrain/verify/components.json",
      componentDecisionPath: "MyBrain/verify/component-decisions.json",
      pageCoveragePath: "MyBrain/verify/page-coverage.json",
    },
    figma: { fileKey: "file" },
  });
  write("spec.json", { viewportPolicy: { scrollbars: "hidden" }, viewports: [] });
  write("nodemap.json", {});
  write("components.json", {});
  write("component-decisions.json", {});
  write("page-coverage.json", {});
  write("legacy-scopes.json", {
    acknowledged: [{ manifest: "gate-legacy.json", reason: "contract v3へ移行するまで未接続の検証設定を台帳で明示する。", plannedMigration: "next scope" }],
  });

  const acknowledged = audit();
  const acknowledgedOutput = `${acknowledged.stdout}\n${acknowledged.stderr}`;
  if (acknowledged.status !== 0 || !acknowledgedOutput.includes("accessibilityPath") || !acknowledgedOutput.includes("motionPath") || !acknowledgedOutput.includes("[承認済] gate-legacy.json")) {
    throw new Error(`audit must list v3-unconnected manifests with an acknowledgement:\n${acknowledgedOutput}\nspawn error: ${acknowledged.error?.message || "(none)"}`);
  }

  write("legacy-scopes.json", { acknowledged: [] });
  const unacknowledged = audit();
  const unacknowledgedOutput = `${unacknowledged.stdout}\n${unacknowledged.stderr}`;
  if (unacknowledged.status === 0 || !unacknowledgedOutput.includes("older contract") || !unacknowledgedOutput.includes("gate-legacy.json")) {
    throw new Error(`audit must reject an unacknowledged v3-unconnected manifest:\n${unacknowledgedOutput}`);
  }
  write("legacy-scopes.json", { acknowledged: [{ manifest: "gate-legacy.json", reason: "既存の旧契約は履歴として保持し、可変幅の検証対象とは別に扱う。", plannedMigration: "next scope" }] });
  const designs = ["pc", "tablet", "narrow", "sp"].map((viewport, index) => ({ viewport, width: [1440, 1024, 768, 375][index], nodeId: `fixture-${viewport}`, source: "provided" }));
  const spec = { viewportPolicy: { scrollbars: "hidden" }, viewports: designs.map(({ viewport, width }) => ({ id: viewport, width, elements: [] })) };
  write("gate-designs.json", { id: "designs", figma: { designs, viewportNodes: designs.map(({ viewport, nodeId }) => ({ viewport, nodeId })) }, scope: {
    specPath: "MyBrain/verify/designs-spec.json", nodeMapPath: "MyBrain/verify/nodemap.json", componentsPath: "MyBrain/verify/components.json",
    componentDecisionPath: "MyBrain/verify/component-decisions.json", pageCoveragePath: "MyBrain/verify/page-coverage.json",
    accessibilityPath: "MyBrain/verify/accessibility.json", motionPath: "MyBrain/verify/motion.json", startDeclarationPath: "MyBrain/verify/start.json",
  } });
  write("designs-spec.json", spec);
  write("accessibility.json", { axe: { sourcePath: "MyBrain/verify/axe-fixture.js" } });
  write("axe-fixture.js", "// fixture"); write("motion.json", {});
  const validDesigns = audit();
  if (validDesigns.status !== 0) throw new Error(`audit must accept complete design viewport contract: ${validDesigns.stdout}\n${validDesigns.stderr}`);
  for (const mode of ["missing", "width"]) {
    const invalid = structuredClone(spec);
    if (mode === "missing") invalid.viewports.splice(1, 1); else invalid.viewports[1].width += 1;
    write("designs-spec.json", invalid);
    const result = audit(); const output = `${result.stdout}\n${result.stderr}`;
    if (result.status === 0 || !output.includes("viewport contract:") || !output.includes("gate-designs.json")) throw new Error(`audit must reject ${mode} viewport contract: ${output}`);
  }
  console.log("gate-contract-audit E2E PASS (legacy + variable viewport contract)");
} finally {
  try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* temp cleanup is best effort on Windows. */ }
}
