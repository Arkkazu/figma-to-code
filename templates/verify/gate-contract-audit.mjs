#!/usr/bin/env node
// gate-contract-audit.mjs — 案件に残る gate manifest が現行契約を満たしているかを一覧する。
//
// 契約を強化するたび、既存の manifest は自動的に「旧契約」になる。旧契約の scope は
// preflight で落ちるが、落ちること自体は誰も見ていないので、過去の完了報告が現在の基準を
// 満たしていない事実が黙って残る。これを可視化し、未移行を明示宣言でしか放置できなくする。
//
// Usage: node gate-contract-audit.mjs [verifyDir]
//   verifyDir 既定値: MyBrain/verify
//
// 未移行の manifest は MyBrain/verify/legacy-scopes.json で明示的に承認する:
//   { "acknowledged": [ { "manifest": "gate-x.json", "reason": "...", "plannedMigration": "..." } ] }
// 承認のない旧契約 manifest、および旧契約でなくなったのに残っている承認は、どちらも失敗にする。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { FIGMA_GATE_CONTRACT_VERSION } from "./figma-page-coverage.mjs";

const verifyDir = resolve(process.argv[2] || "MyBrain/verify");
const repoRoot = resolve(verifyDir, "..", "..");

// 現行のFigmaファイル。案件の状態なので設定ファイルから読む（環境変数でも上書きできる）。
// 契約の新旧以前に、参照したデザインファイルが現行でなければ、その証跡は
// 現行デザインに対する根拠にならない。実測で24件中12件が別ファイル基準だった。
function readCurrentFigmaFileKey() {
  if (process.env.FIGMA_CURRENT_FILE_KEY) return process.env.FIGMA_CURRENT_FILE_KEY;
  const configPath = join(verifyDir, "figma-project.json");
  if (!existsSync(configPath)) return null;
  const config = readJson(configPath, "figma-project.json");
  const key = config.currentFileKey;
  if (key !== undefined && (typeof key !== "string" || key.trim() === "")) {
    fail("figma-project.json currentFileKey must be a non-empty string when present.");
  }
  return key || null;
}
const currentFigmaFileKey = readCurrentFigmaFileKey();

function fail(message) {
  console.error(`GATE CONTRACT AUDIT: ${message}`);
  process.exit(1);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${path} (${error.message})`);
  }
}

// 現行契約が manifest / spec に要求する項目。契約を足したらここに足す。
function contractGaps(manifest, manifestPath) {
  const gaps = [];
  const scope = manifest.scope;
  if (!scope || typeof scope !== "object") return ["scope"];
  for (const key of ["specPath", "nodeMapPath", "componentsPath", "componentDecisionPath", "pageCoveragePath", "accessibilityPath", "motionPath"]) {
    if (typeof scope[key] !== "string" || scope[key].trim() === "") gaps.push(key);
  }
  if (typeof scope.specPath === "string" && scope.specPath.trim() !== "") {
    const specPath = resolve(repoRoot, scope.specPath);
    if (!existsSync(specPath)) {
      gaps.push("spec file missing");
    } else {
      const spec = readJson(specPath, `spec of ${basename(manifestPath)}`);
      if (!spec.viewportPolicy || typeof spec.viewportPolicy.scrollbars !== "string") {
        gaps.push("viewportPolicy.scrollbars");
      }
      let withoutProvenance = 0;
      // 可変テキスト要素の固定高さ（2026-08-06の契約強化）。preflightで落ちるだけでは
      // 「どのspecが未移行か」が事前に見えないため、ここで件数を出す。判定条件は
      // figma-gate.mjs の assertVariableTextHeight と同じにする。
      let fixedTextHeights = 0;
      const tolerance = Number.isFinite(spec.tolerance) ? spec.tolerance : 1.5;
      const parsePx = (value) => {
        const matched = typeof value === "string" ? /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim()) : null;
        return matched ? Number(matched[1]) : null;
      };
      for (const viewport of spec.viewports || []) {
        for (const element of viewport.elements || []) {
          if (!element.provenance || typeof element.provenance !== "object") withoutProvenance += 1;
          if (!["text", "innerText", "textPattern", "lineCount"].some((key) => element[key] !== undefined)) continue;
          let height = null;
          if (typeof element.height === "number") {
            height = element.height;
          } else if (Array.isArray(element.height) && element.height.length === 2) {
            const [min, max] = element.height;
            if (Number.isFinite(min) && Number.isFinite(max) && Math.abs(max - min) <= tolerance) height = min;
          }
          if (height === null) continue;
          const lineHeight = parsePx(element.lineHeight);
          if (lineHeight !== null && Number.isFinite(element.lineCount) && Math.abs(height - lineHeight * element.lineCount) <= tolerance) continue;
          const note = typeof element.note === "string" ? element.note : "";
          const markerIndex = note.indexOf("fixed-height-reason:");
          if (markerIndex >= 0 && note.slice(markerIndex + "fixed-height-reason:".length).trim().length > 0) continue;
          fixedTextHeights += 1;
        }
      }
      if (withoutProvenance > 0) gaps.push(`provenance x${withoutProvenance}`);
      if (fixedTextHeights > 0) gaps.push(`可変テキスト要素の固定height x${fixedTextHeights}`);
    }
  }
  if (typeof scope.accessibilityPath === "string" && scope.accessibilityPath.trim() !== "") {
    const accessibilityPath = resolve(repoRoot, scope.accessibilityPath);
    if (!existsSync(accessibilityPath)) {
      gaps.push("accessibility config file missing");
    } else {
      const accessibility = readJson(accessibilityPath, `accessibility config of ${basename(manifestPath)}`);
      const axeSource = accessibility?.axe?.sourcePath;
      if (typeof axeSource !== "string" || axeSource.trim() === "") {
        gaps.push("accessibility axe.sourcePath");
      } else if (!existsSync(resolve(repoRoot, axeSource))) {
        gaps.push("accessibility axe source missing");
      }
    }
  }
  if (typeof scope.motionPath === "string" && scope.motionPath.trim() !== "" && !existsSync(resolve(repoRoot, scope.motionPath))) {
    gaps.push("motion config file missing");
  }  return gaps;
}

if (!existsSync(verifyDir)) fail(`verify directory does not exist: ${verifyDir}`);
const manifestNames = readdirSync(verifyDir).filter((name) => /^gate-.*\.json$/.test(name)).sort();
if (manifestNames.length === 0) fail(`no gate manifests found in ${verifyDir}`);

// close-report が現行契約の下で作られたかを見る。契約を上げると既存のcloseは自動的に古くなるため、
// manifestの項目が揃っていても「通し直しが必要」な状態を検出する必要がある。
function closeReportContract(manifest) {
  const id = manifest.id;
  if (typeof id !== "string" || id.trim() === "") return null;
  const path = resolve(repoRoot, "MyBrain/verify/checkpoints", id, "close-report.json");
  if (!existsSync(path)) return { state: "none" };
  const report = readJson(path, `close-report of ${id}`);
  const version = Number.isInteger(report.contractVersion) ? report.contractVersion : 0;
  return { state: version >= FIGMA_GATE_CONTRACT_VERSION ? "current" : "stale", version };
}

const results = manifestNames.map((name) => {
  const path = join(verifyDir, name);
  const manifest = readJson(path, `manifest ${name}`);
  const fileKey = (manifest.figma && manifest.figma.fileKey) || null;
  return {
    name,
    gaps: contractGaps(manifest, path),
    close: closeReportContract(manifest),
    fileKey,
    supersededFile: Boolean(currentFigmaFileKey) && fileKey !== currentFigmaFileKey,
  };
});

// 参照デザインが現行でないものは、契約の欠落とは別枠で数える。
// 「契約を満たせば正しい」と読めてしまうと、根拠が古いことが埋もれる。
const superseded = currentFigmaFileKey ? results.filter((entry) => entry.supersededFile) : [];
// manifestの項目が揃っていても、closeが旧契約の下なら「現行契約で検証済み」とは言えない。
for (const entry of results) {
  if (entry.gaps.length === 0 && entry.close && entry.close.state === "stale") {
    entry.gaps.push(`close-report contractVersion ${entry.close.version} < ${FIGMA_GATE_CONTRACT_VERSION}`);
  }
}
const legacy = results.filter((entry) => entry.gaps.length > 0);
const current = results.filter((entry) => entry.gaps.length === 0);

const acknowledgementPath = join(verifyDir, "legacy-scopes.json");
const acknowledged = new Map();
if (existsSync(acknowledgementPath)) {
  const document = readJson(acknowledgementPath, "legacy-scopes.json");
  const entries = document.acknowledged;
  if (!Array.isArray(entries)) fail("legacy-scopes.json must have an acknowledged array.");
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") fail("legacy-scopes.json acknowledged entry must be an object.");
    const manifest = entry.manifest;
    if (typeof manifest !== "string" || manifest.trim() === "") fail("legacy-scopes.json entry needs manifest.");
    if (acknowledged.has(manifest)) fail(`legacy-scopes.json has a duplicate manifest: ${manifest}`);
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 20) {
      fail(`legacy-scopes.json needs reason (>=20 chars) for ${manifest}`);
    }
    if (typeof entry.plannedMigration !== "string" || entry.plannedMigration.trim() === "") {
      fail(`legacy-scopes.json needs plannedMigration for ${manifest}`);
    }
    acknowledged.set(manifest, entry);
  }
}

console.log(`gate manifests: ${results.length}  現行契約: ${current.length}  旧契約: ${legacy.length}`);
if (currentFigmaFileKey) {
  console.log(`現行Figmaファイル: ${currentFigmaFileKey}  参照が別ファイル: ${superseded.length}件`);
  for (const entry of superseded) {
    console.log(`  [参照が旧ファイル] ${entry.name}  fileKey=${entry.fileKey || "(なし)"}`);
  }
} else {
  console.log("現行Figmaファイル未指定（FIGMA_CURRENT_FILE_KEY を設定すると参照ファイルの照合も行う）");
}
for (const entry of legacy) {
  const mark = acknowledged.has(entry.name) ? "承認済" : "未承認";
  console.log(`  [${mark}] ${entry.name}`);
  console.log(`      欠落: ${entry.gaps.join(", ")}`);
}
for (const entry of current) {
  const closeState = entry.close ? entry.close.state : "none";
  const note = closeState === "current" ? "close済 (contract " + FIGMA_GATE_CONTRACT_VERSION + ")" : "close未実行";
  console.log(`  [現行] ${entry.name}  ${note}`);
}

const legacyNames = new Set(legacy.map((entry) => entry.name));
const unacknowledged = legacy.filter((entry) => !acknowledged.has(entry.name)).map((entry) => entry.name);
const stale = [...acknowledged.keys()].filter((name) => !legacyNames.has(name));

// 退避（_retired）した manifest は監査の一覧から消えるが、退避理由が
// 「参照デザインが現行でない」なら、そのページの検証義務は残っている。
// 台帳に書いただけでは読まれないので、監査の出力に必ず載せる。
if (existsSync(acknowledgementPath)) {
  const document = readJson(acknowledgementPath, "legacy-scopes.json");
  const retired = Array.isArray(document.retired) ? document.retired : [];
  const pending = Array.isArray(document.pendingPageVerification) ? document.pendingPageVerification : [];
  if (retired.length > 0) console.log(`\n退避済み manifest: ${retired.length}件（MyBrain/verify/_retired/）`);
  if (pending.length > 0) {
    console.log(`現行ファイルでの再検証が必要なページ: ${pending.length}件`);
    for (const entry of pending) {
      const page = typeof entry.page === "string" ? entry.page : "(page未記載)";
      const count = Array.isArray(entry.supersededManifests) ? entry.supersededManifests.length : 0;
      console.log(`  [未検証] ${page}  旧manifest ${count}件  verifyUrl=${entry.currentVerifyUrl || "未確認"}`);
    }
  }
}

if (unacknowledged.length > 0) {
  fail(
    `these manifests are on an older contract and are not acknowledged in legacy-scopes.json: ${unacknowledged.join(", ")}. ` +
      `A scope closed under an older contract has not been verified to the current one; declare it explicitly instead of leaving it silent.`
  );
}
if (stale.length > 0) {
  fail(`legacy-scopes.json acknowledges manifests that already meet the current contract (remove them): ${stale.join(", ")}`);
}
console.log("GATE CONTRACT AUDIT PASS");
