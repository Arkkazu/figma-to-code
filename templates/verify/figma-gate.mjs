#!/usr/bin/env node
import { FIGMA_GATE_CONTRACT_VERSION, assertCheckpointIsCurrent, assertPageCoverageComplete, completeSection, initializePageCoverage, prepareSectionClose, sectionStart } from "./figma-page-coverage.mjs";
import { validateCorrectionReceipt } from "./correction-receipt.mjs";
import { assertResponsiveHtmlSingleDom } from "./responsive-html-guard.mjs";
import { markCoordinationGateActive, markCoordinationGateClosed, withScopePreflightLock } from "./scope-coordination.mjs";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const gateEntrypointPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const command = args[0];
const IMPLEMENTATION_IDENTITY_FLAGS = Object.freeze(["--implementation-actor", "--implementation-context-id"]);
const DISCARD_CHECKPOINTS_FLAG = "--discard-checkpoints";
const stateDirectory = resolve(repoRoot, ".figma-gate");
// 保持中の受領証は scope ごとに1ファイル（active/<manifestId>.json）。
// 1枠（active.json）だと、宣言パスが1つも重ならない scope 同士でも受領証を奪い合い、
// Figma実装がページ単位で全部直列になる。coding gate は同じ理由で per-manifest へ
// 移行済みで、その実装をここへ移植した（2026-08-25）。衝突判定は
// scope-conflict-audit のパス交差に委ねる。
const activeStateDirectory = resolve(stateDirectory, "active");
// 旧1枠形式。移行期間は読むだけで、新規の書き込みはしない。
const legacyStatePath = resolve(stateDirectory, "active.json");
const safeReceiptName = (manifestId) => String(manifestId).replace(/[^A-Za-z0-9._-]/g, "_");
const statePathFor = (manifestId) => resolve(activeStateDirectory, `${safeReceiptName(manifestId)}.json`);
// ベンチマーク追記が、いまどの受領証を触っているかを覚えておく。
// appendBenchmarkAttempt は manifest を引数に取らない位置から呼ばれるため。
let activeReceiptPathInUse = null;

function activeReceiptPaths() {
  if (!existsSync(activeStateDirectory)) return [];
  try {
    return readdirSync(activeStateDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => resolve(activeStateDirectory, name));
  } catch {
    return [];
  }
}

// Windowsではドライブレターの大小が実行経路で揺れる（C: と c:）。受領証の探索に
// 単純な文字列一致を使うと、同じmanifestなのに「受領証が無い」と判定しうる。
// coding gate が worktreeRoot を小文字化して扱うのと同じ方針で吸収する。
function samePathValue(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

// 対象manifestの受領証ファイルを探す。新形式を先に見て、無ければ旧1枠が同じ
// manifestを指しているときだけ採用する。移行中に旧受領証を持っているscopeを壊さない。
function activeStatePathForManifest(absoluteManifestPath) {
  for (const receiptPath of [...activeReceiptPaths(), legacyStatePath]) {
    if (!existsSync(receiptPath)) continue;
    try {
      const candidate = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (candidate && samePathValue(candidate.manifestPath, absoluteManifestPath)) return receiptPath;
    } catch {
      // 壊れた受領証は「無い」として扱う。読めないものを根拠にしない。
    }
  }
  return null;
}

function readActiveState(absoluteManifestPath, label) {
  const receiptPath = activeStatePathForManifest(absoluteManifestPath);
  if (!receiptPath) {
    fail(`${label} requires an active Figma gate receipt for this manifest. Run preflight first.`);
  }
  activeReceiptPathInUse = receiptPath;
  return readJson(receiptPath, "Active Figma gate state");
}
// v13 adds a scoped Figma-inventory topology.  Active state version 4 (the
// v12 state schema) has no assertion that its node-map used that topology, so
// it must never advance.
const FIGMA_GATE_STATE_VERSION = 5;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const phpCommand = process.platform === "win32" ? "php.exe" : "php";
const learningScriptRelativePath = "MyBrain/verify/loop-learn.mjs";
const learningPolicyRelativePath = "MyBrain/verify/loop-learning-policy.json";
const learningOutputRelativePath = "MyBrain/verify/learning";
const learningInputPath = resolve(stateDirectory, "learning-input.json");
const learningCapabilities = Object.freeze({
  declaredTargetsOnly: true,
  checkpointCaptureMode: "batch",
});
// ワンショット忠実度ベンチマーク（P-3）用の試行記録。
// checkpoint は測定の前に試行を state へ書くため回数は FAIL 時も残るが、
// 「何が落ちたか」は fail() が process.exit するため失われていた。
// process.exit は finally を実行しないので、fail() 自身が記録してから終了する。
let pendingBenchmarkAttempt = null;

function benchmarkFailureClass(message) {
  const matched = /\b(SPEC|LAYOUT|VISUAL)\s+FAIL\b/.exec(message);
  return matched ? matched[1] : "OTHER";
}

function appendBenchmarkAttempt(entry) {
  // ベンチマークの記録失敗が、本来の合否判定を隠してはならない。
  try {
    const receiptPath = activeReceiptPathInUse;
    if (!receiptPath || !existsSync(receiptPath)) return;
    const state = JSON.parse(readFileSync(receiptPath, "utf8"));
    const benchmark = state.benchmark && typeof state.benchmark === "object" ? state.benchmark : {};
    const attempts = Array.isArray(benchmark.attempts) ? benchmark.attempts : [];
    attempts.push(entry);
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${JSON.stringify({ ...state, benchmark: { ...benchmark, attempts } }, null, 2)}\n`, "utf8");
  } catch {
    // 記録できない場合は黙って諦める（合否には影響させない）
  }
}

function fail(message) {
  if (pendingBenchmarkAttempt) {
    const attempt = pendingBenchmarkAttempt;
    pendingBenchmarkAttempt = null;
    appendBenchmarkAttempt({
      ...attempt,
      outcome: "FAIL",
      failureClass: benchmarkFailureClass(message),
      message: String(message).slice(0, 300),
      at: new Date().toISOString(),
    });
  }
  console.error(`FIGMA GATE: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`FIGMA GATE: ${message}`);
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// 検証器そのものの版を証跡へ刻む。
//
// 2026-08-26 実測：稼働中のセッションが古い figma-page-coverage.mjs で digest を計算し、
// 承認と一致しないまま停止した。症状（digest 不一致）だけが見え、原因（検証器の世代差）は
// どこにも出ていなかったため、レビュー要件の問題と誤認された。
// エントリのハッシュだけでは、gate が読み込む他モジュールの差し替えを検出できない。
const VERIFIER_MODULES = Object.freeze([
  "figma-page-coverage.mjs",
  "correction-receipt.mjs",
  "responsive-html-guard.mjs",
  "scope-coordination.mjs",
  "scope-conflict-audit.mjs",
  "gate-browser-batch.mjs",
  "verify-layout.mjs",
  "accessibility-verify.mjs",
  "motion-verify.mjs",
  "checkpoint-capture.mjs",
  "checkpoint-diff.mjs",
  "cdp-browser.mjs",
]);

function verifierModuleHashes() {
  const directory = dirname(gateEntrypointPath);
  const hashes = {};
  for (const name of [...VERIFIER_MODULES].sort()) {
    const modulePath = resolve(directory, name);
    // 案件によっては未配布のモジュールがある。無いものは "missing" と記録して、
    // 「あったものが消えた」「無かったものが増えた」を後から区別できるようにする。
    hashes[name] = existsSync(modulePath) ? hashFile(modulePath) : "missing";
  }
  return hashes;
}

function gateRuntimeEvidence() {
  return {
    entryPath: gateEntrypointPath,
    entrySha256: hashFile(gateEntrypointPath),
    contractVersion: FIGMA_GATE_CONTRACT_VERSION,
    modules: verifierModuleHashes(),
  };
}

// preflight で凍結した検証器と、いま動いている検証器を突き合わせる。
// close / release-check は受領証を書く工程なので止める。途中フェーズは報告に留める
// （止めても実装役は前に進めず、原因が見えれば自分で直せるため）。
function assertVerifierRuntimeUnchanged(state, phase) {
  const frozen = state.runtime && typeof state.runtime === "object" ? state.runtime : null;
  if (!frozen || !frozen.modules || typeof frozen.modules !== "object") {
    // 版を持たない古い受領証。判定材料が無いので黙って通す（移行互換）。
    return;
  }
  const current = verifierModuleHashes();
  const changed = [];
  if (typeof frozen.entrySha256 === "string" && frozen.entrySha256 !== hashFile(gateEntrypointPath)) {
    changed.push(`figma-gate.mjs: 凍結 ${frozen.entrySha256.slice(0, 12)}… → 現在 ${hashFile(gateEntrypointPath).slice(0, 12)}…`);
  }
  for (const [name, frozenHash] of Object.entries(frozen.modules)) {
    const currentHash = current[name] ?? "missing";
    if (frozenHash !== currentHash) {
      const format = (value) => (value === "missing" ? "(未配布)" : `${value.slice(0, 12)}…`);
      changed.push(`${name}: 凍結 ${format(frozenHash)} → 現在 ${format(currentHash)}`);
    }
  }
  if (changed.length === 0) return;

  const detail =
    `検証器が preflight 後に差し替わっています（${phase}）。\n` +
    changed.map((line) => `  - ${line}`).join("\n") + "\n" +
    "  凍結時と別の検証器で判定すると、受領証がどの契約の下で通ったのか特定できません。\n" +
    "  preflight を引き直してください。引き直すと現在の検証器で凍結し直します。";

  if (phase === "close" || phase === "release-check") fail(`SPEC FAIL: ${detail}`);
  pass(detail);
}

function hashFile(filePath) {
  return hashBuffer(readFileSync(filePath));
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    fail(`${label} does not exist: ${filePath}`);
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

// P-3 の承認前下書きは、通常の manifest 形状を満たしていても実行入力に
// 使えない。ここでは文字列の部分一致を使わず、予約ディレクトリと構造化された
// 明示 marker だけを拒否する。画像・asset・changeTarget/output path は対象外で、
// この helper を frozen JSON input/evidence の読取箇所だけから呼ぶ。
const DRAFT_INPUT_PATH_SEGMENT = "p3-drafts";
const DRAFT_MARKER_KEYS = new Set(["_draftOnly", "draftOnly"]);
const OWNER_INPUT_REQUIRED = "OWNER_INPUT_REQUIRED";

function draftPathCaseInsensitive() {
  return process.platform === "win32" || process.platform === "darwin";
}

function isDraftInputPathSegment(value) {
  return draftPathCaseInsensitive() ? value.toLowerCase() === DRAFT_INPUT_PATH_SEGMENT : value === DRAFT_INPUT_PATH_SEGMENT;
}

function assertNoDraftInputPath(value, label) {
  const input = requireString(value, label);
  const absolutePath = isAbsolute(input) ? resolve(input) : resolve(repoRoot, input);
  const pathFromRoot = relative(repoRoot, absolutePath).replace(/\\/g, "/");
  // 外部の証跡pathは既存契約で許される。予約名の判定は repository 内だけに限定する。
  if (pathFromRoot === ".." || pathFromRoot.startsWith("../") || isAbsolute(pathFromRoot)) return;
  if (pathFromRoot.split("/").some(isDraftInputPathSegment)) {
    fail(`${label} must not use the reserved draft input directory p3-drafts: ${pathFromRoot}`);
  }
}

function jsonPointerSegment(key) {
  return String(key).replace(/~/g, "~0").replace(/\//g, "~1");
}

function assertNoDraftMarkers(value, label, pointer = "$") {
  if (typeof value === "string") {
    if (value.trim().toUpperCase().startsWith(OWNER_INPUT_REQUIRED)) {
      fail(`${label} contains the owner-input-required marker at ${pointer}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDraftMarkers(entry, label, `${pointer}/${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    const child = `${pointer}/${jsonPointerSegment(key)}`;
    if (DRAFT_MARKER_KEYS.has(key)) {
      fail(`${label} contains the draft-only marker ${key} at ${child}`);
    }
    if (key === "OWNER_INPUT_REQUIRED" || (typeof entry === "string" && entry.trim().toUpperCase().startsWith(OWNER_INPUT_REQUIRED))) {
      fail(`${label} contains the owner-input-required marker at ${child}`);
    }
    if (key === "status" && typeof entry === "string" && entry.trim().toLowerCase() === "draft") {
      fail(`${label} contains status:draft at ${child}`);
    }
    assertNoDraftMarkers(entry, label, child);
  }
}

function readExecutionJson(filePath, label) {
  assertNoDraftInputPath(filePath, label);
  const document = readJson(filePath, label);
  assertNoDraftMarkers(document, label);
  return document;
}

function inputRepoPath(value, label) {
  const path = toRepoPath(value, label);
  assertNoDraftInputPath(path.absolutePath, label);
  return path;
}

function readJsonEvidenceIfDeclared(path, label) {
  assertNoDraftInputPath(path, label);
  if (/\.json$/i.test(path)) readExecutionJson(path, label);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is required.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} is required.`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }
  return value;
}

// v13: implementation identity is condition-specific runtime input, not a
// shared manifest field. Keep the shape closed so a future alias cannot make
// an A/B-shared manifest carry a hidden condition-specific value.
function requireImplementationIdentity(value, label) {
  const identity = requireObject(value, label);
  const unexpected = Object.keys(identity).filter((key) => key !== "actor" && key !== "contextId");
  if (unexpected.length > 0) {
    fail(`${label} has unknown field(s): ${unexpected.join(", ")}.`);
  }
  return {
    actor: requireString(identity.actor, `${label}.actor`),
    contextId: requireString(identity.contextId, `${label}.contextId`),
  };
}

function rejectManifestImplementationIdentity(scope) {
  for (const field of ["implementationActor", "implementationContextId", "implementationIdentity", "implementation"]) {
    if (Object.hasOwn(scope, field)) {
      fail(`manifest.scope.${field} is not allowed in v13; supply implementation identity only to preflight flags.`);
    }
  }
}

function requireActiveImplementationIdentity(state, phase) {
  if (state.version !== FIGMA_GATE_STATE_VERSION) {
    fail(`${phase} requires active Figma gate state version ${FIGMA_GATE_STATE_VERSION} with implementationIdentity, frozen responsiveHtml, and scoped-roots/v1 node-map inputs; active state version 4 (v12) is rejected, so re-run preflight.`);
  }
  return requireImplementationIdentity(
    state.implementationIdentity,
    `Active Figma gate state implementationIdentity (${phase}; re-run preflight)`
  );
}

function parsePreflightArguments(rawArgs) {
  // 実行済みcheckpointを持つ自分の受領証を引き直すときだけ付ける。
  // 何を破棄するかは scope-conflict-audit が列挙して出力する。検証を省く指定ではない。
  const discardCheckpoints = rawArgs.includes(DISCARD_CHECKPOINTS_FLAG);
  const args = rawArgs.filter((value) => value !== DISCARD_CHECKPOINTS_FLAG);
  const manifestPath = requireString(args[0], "manifest path");
  const optionArgs = args.slice(1);
  if (optionArgs.length % 2 !== 0) {
    fail("preflight implementation identity flags require a value.");
  }
  const values = {};
  for (let index = 0; index < optionArgs.length; index += 2) {
    const flag = optionArgs[index];
    const value = optionArgs[index + 1];
    if (!IMPLEMENTATION_IDENTITY_FLAGS.includes(flag)) {
      fail(`preflight accepts only ${IMPLEMENTATION_IDENTITY_FLAGS.join(" and ")} after the manifest path.`);
    }
    if (Object.hasOwn(values, flag)) {
      fail(`preflight received duplicate implementation identity flag: ${flag}.`);
    }
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
      fail(`preflight ${flag} requires a non-empty value.`);
    }
    values[flag] = value;
  }
  if (Object.keys(values).length !== IMPLEMENTATION_IDENTITY_FLAGS.length) {
    fail(`preflight requires exactly ${IMPLEMENTATION_IDENTITY_FLAGS.join(" and ")} once each.`);
  }
  return {
    manifestPath,
    discardCheckpoints,
    implementationIdentity: {
      actor: values["--implementation-actor"],
      contextId: values["--implementation-context-id"],
    },
  };
}

function rejectImplementationIdentityFlagsOutsidePreflight(phase, rawArgs) {
  const forbidden = rawArgs.find(
    (value) =>
      typeof value === "string" &&
      IMPLEMENTATION_IDENTITY_FLAGS.some((flag) => value === flag || value.startsWith(`${flag}=`))
  );
  if (forbidden) {
    fail(`${phase} rejects ${forbidden}; implementation identity is read only from active preflight state.`);
  }
}

function toRepoPath(value, label) {
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) {
    fail(`${label} must be relative to the repository.`);
  }

  const absolutePath = resolve(repoRoot, input);
  const pathFromRoot = relative(repoRoot, absolutePath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    fail(`${label} must stay inside the repository.`);
  }

  return { relativePath: pathFromRoot.replace(/\\/g, "/"), absolutePath };
}

function toEvidencePath(value, label) {
  const input = requireString(value, label);
  const absolutePath = isAbsolute(input) ? input : resolve(repoRoot, input);
  if (!existsSync(absolutePath)) {
    fail(`${label} does not exist: ${absolutePath}`);
  }
  return absolutePath;
}

function readLearningControlSnapshot() {
  const controlsPath = resolve(repoRoot, learningOutputRelativePath, "active-controls.json");
  if (!existsSync(controlsPath)) {
    return {
      path: relative(repoRoot, controlsPath).replace(/\\/g, "/"),
      sha256: null,
      controls: [],
    };
  }

  const document = readJson(controlsPath, "Active learning controls");
  if (document.version !== 1 || !Array.isArray(document.controls)) {
    fail("Active learning controls must use version 1 with controls[].");
  }
  const controls = document.controls.map((control, index) => {
    requireObject(control, `Active learning controls[${index}]`);
    const controlId = requireString(control.controlId, `Active learning controls[${index}].controlId`);
    if (control.effect !== "strengthen" || control.scope !== "project-local") {
      fail(`Active learning control ${controlId} is not a project-local strengthening control.`);
    }
    const requirements = control.requirements === undefined ? {} : requireObject(control.requirements, `Active learning control ${controlId}.requirements`);
    for (const [capability, expected] of Object.entries(requirements)) {
      if (learningCapabilities[capability] !== expected) {
        fail(`Active learning control ${controlId} requires ${capability}=${JSON.stringify(expected)}. Update the verification tool before the next preflight.`);
      }
    }
    return {
      controlId,
      effect: control.effect,
      scope: control.scope,
      requirements,
    };
  });

  return {
    path: relative(repoRoot, controlsPath).replace(/\\/g, "/"),
    sha256: hashFile(controlsPath),
    controls,
  };
}

function initialLearningMetrics() {
  return {
    directViewportRuns: {},
    finalRecheckViewportRuns: {},
  };
}

function recordLearningCheckpointAttempt(state, component, { finalRecheck = false, release = null } = {}) {
  if (release) return state;
  const current = state.learningMetrics && typeof state.learningMetrics === "object"
    ? state.learningMetrics
    : initialLearningMetrics();
  const metricKey = finalRecheck ? "finalRecheckViewportRuns" : "directViewportRuns";
  const metrics = {
    ...initialLearningMetrics(),
    ...current,
    [metricKey]: {
      ...(current[metricKey] || {}),
    },
  };
  const componentRuns = {
    ...(metrics[metricKey][component.elementId] || {}),
  };
  for (const viewport of component.viewports) {
    componentRuns[viewport] = (componentRuns[viewport] || 0) + 1;
  }
  metrics[metricKey][component.elementId] = componentRuns;
  return { ...state, learningMetrics: metrics };
}

function runPostflightLearning(manifestPath, closedState) {
  const learningScriptPath = resolve(repoRoot, learningScriptRelativePath);
  const learningPolicyPath = resolve(repoRoot, learningPolicyRelativePath);
  if (!existsSync(learningScriptPath) || !existsSync(learningPolicyPath)) {
    fail("Self-improvement files are required. Copy loop-learn.mjs and loop-learning-policy.json into MyBrain/verify/.");
  }

  mkdirSync(stateDirectory, { recursive: true });
  writeFileSync(learningInputPath, `${JSON.stringify(closedState, null, 2)}\n`, "utf8");
  run(
    "node",
    [
      learningScriptRelativePath,
      "from-gate",
      relative(repoRoot, manifestPath).replace(/\\/g, "/"),
      relative(repoRoot, learningInputPath).replace(/\\/g, "/"),
      learningPolicyRelativePath,
      learningOutputRelativePath,
    ],
    "postflight self-improvement analysis"
  );
  const latestPath = resolve(repoRoot, learningOutputRelativePath, "latest.json");
  const latest = readJson(latestPath, "Self-improvement latest result");
  return {
    eventId: requireString(latest.eventId, "Self-improvement eventId"),
    eventPath: requireString(latest.eventPath, "Self-improvement eventPath"),
    reportPath: requireString(latest.reportPath, "Self-improvement reportPath"),
    controlsAdded: Array.isArray(latest.controlsAdded) ? latest.controlsAdded : [],
    proposals: Array.isArray(latest.proposals) ? latest.proposals : [],
  };
}
function validateGateVerificationConfig(scope, specDocument) {
  const expectedScrollbars = specDocument.viewportPolicy?.scrollbars;
  const accessibilityPath = inputRepoPath(scope.accessibilityPath, "manifest.scope.accessibilityPath");
  const motionPath = inputRepoPath(scope.motionPath, "manifest.scope.motionPath");
  toEvidencePath(accessibilityPath.absolutePath, "manifest.scope.accessibilityPath");
  toEvidencePath(motionPath.absolutePath, "manifest.scope.motionPath");

  const accessibility = readExecutionJson(accessibilityPath.absolutePath, "Accessibility config");
  requireObject(accessibility, "Accessibility config");
  const accessibilityPolicy = requireObject(accessibility.viewportPolicy, "Accessibility config.viewportPolicy");
  if (accessibilityPolicy.scrollbars !== expectedScrollbars) {
    fail(`Accessibility config viewportPolicy.scrollbars must equal spec.viewportPolicy.scrollbars (${expectedScrollbars}).`);
  }
  const axe = requireObject(accessibility.axe, "Accessibility config.axe");
  const axeSourcePath = inputRepoPath(axe.sourcePath, "Accessibility config.axe.sourcePath");
  toEvidencePath(axeSourcePath.absolutePath, "Accessibility config.axe.sourcePath");

  const motion = readExecutionJson(motionPath.absolutePath, "Motion config");
  requireObject(motion, "Motion config");
  const motionPolicy = requireObject(motion.viewportPolicy, "Motion config.viewportPolicy");
  if (motionPolicy.scrollbars !== expectedScrollbars) {
    fail(`Motion config viewportPolicy.scrollbars must equal spec.viewportPolicy.scrollbars (${expectedScrollbars}).`);
  }

  return {
    accessibilityPath,
    motionPath,
    axeSourcePath,
  };
}

function assertNoDraftPageCoverageInputs(scope) {
  const coveragePath = inputRepoPath(scope.pageCoveragePath, "manifest.scope.pageCoveragePath");
  const reviewPath = inputRepoPath(scope.pageCoverageReviewPath, "manifest.scope.pageCoverageReviewPath");
  const coverage = readExecutionJson(coveragePath.absolutePath, "Page coverage");
  readExecutionJson(reviewPath.absolutePath, "Page coverage review");
  // figma-page-coverage.mjs resolves page metadata relative to the coverage
  // document. Scan that JSON evidence too when it is declared, without
  // treating screenshots or exported assets as draft-controlled text inputs.
  if (coverage.pages && typeof coverage.pages === "object" && !Array.isArray(coverage.pages)) {
    for (const [viewport, page] of Object.entries(coverage.pages)) {
      if (!page || typeof page !== "object" || typeof page.metadataPath !== "string" || !page.metadataPath.trim()) continue;
      const metadataPath = resolve(dirname(coveragePath.absolutePath), page.metadataPath);
      toEvidencePath(metadataPath, `Page coverage ${viewport} metadataPath`);
      readJsonEvidenceIfDeclared(metadataPath, `Page coverage ${viewport} metadataPath`);
    }
  }
}
// 着手宣言（WORKFLOW.md「着手前ゲート」）を受領証にする。
//
// この体系は、訂正・close・scope lock・凍結入力のすべてが受領証で担保されているのに、
// 着手宣言だけがチャット上の発言のままだった。そのため「宣言せずに着手した」ことが
// 原理的に検出できず、事後に「宣言したつもり」を書き足すことも防げなかった。
//
// 検査は宣言の中身をmanifestと突き合わせる形にする。非空文字列であればよい欄を並べても
// 通ってしまうと、先行scopeの宣言を複製したまま提出できてしまうため（page coverage の
// scopeId 一致検査で同じ回避策を塞いだのと同じ理由。2026-08-03）。
//
// これが担保するのは「5点が凍結された成果物として存在し、manifestと整合していること」
// までである。宣言の内容が真実かどうかは検査できない。
function validateStartDeclaration(scope, context) {
  const declarationPath = inputRepoPath(scope.startDeclarationPath, "manifest.scope.startDeclarationPath");
  if (!existsSync(declarationPath.absolutePath)) {
    fail(`SPEC FAIL: start declaration does not exist: ${declarationPath.relativePath}`);
  }
  const label = "Start declaration";
  const document = readExecutionJson(declarationPath.absolutePath, label);
  requireObject(document, label);
  if (document.version !== 1) fail(`${label}.version must be 1.`);

  // 1点目: 環境判定。
  const environment = requireObject(document.environmentPreflight, `${label}.environmentPreflight`);
  const mode = requireString(environment.mode, `${label}.environmentPreflight.mode`);
  if (mode !== "local") {
    fail(`${label}.environmentPreflight.mode must be "local"; Figma実装scopeは上位層を読める環境でしか開始できない。`);
  }

  // 複製の禁止。scopeIdとfileKeyがmanifestと一致しない宣言は、別scopeの写しである。
  const scopeId = requireString(document.scopeId, `${label}.scopeId`);
  if (scopeId !== context.scopeId) {
    fail(`${label}.scopeId must match manifest.id (${context.scopeId}); got ${scopeId}.`);
  }

  // 2点目: fileKey と PC/SP の node-id。manifest.figma.viewportNodes と突き合わせる。
  const figma = requireObject(document.figma, `${label}.figma`);
  const fileKey = requireString(figma.fileKey, `${label}.figma.fileKey`);
  if (fileKey !== context.fileKey) {
    fail(`${label}.figma.fileKey must match manifest.figma.fileKey (${context.fileKey}); got ${fileKey}.`);
  }
  const declaredNodeIds = requireObject(figma.nodeIds, `${label}.figma.nodeIds`);
  for (const viewport of ["pc", "sp"]) {
    const ids = requireArray(declaredNodeIds[viewport], `${label}.figma.nodeIds.${viewport}`);
    const known = context.nodeIdsByViewport.get(viewport) ?? new Set();
    for (const [index, value] of ids.entries()) {
      const nodeId = requireString(value, `${label}.figma.nodeIds.${viewport}[${index}]`);
      if (!known.has(nodeId)) {
        fail(
          `${label}.figma.nodeIds.${viewport} declares a node that manifest.figma.viewportNodes does not contain: ${nodeId}. ` +
            "宣言したnodeと実装対象のnodeが違う。"
        );
      }
    }
  }

  // 3点目: specの所在。manifestのspecPathと一致させる。
  const declaredSpecPath = requireString(document.specPath, `${label}.specPath`).replace(/\\/g, "/");
  if (declaredSpecPath !== context.specRelativePath) {
    fail(`${label}.specPath must match manifest.scope.specPath (${context.specRelativePath}); got ${declaredSpecPath}.`);
  }

  // 4点目: scope lockの開始と、今回のscope外パス。
  const scopeLockStatePath = inputRepoPath(document.scopeLockStatePath, `${label}.scopeLockStatePath`);
  if (!existsSync(scopeLockStatePath.absolutePath)) {
    fail(`${label}.scopeLockStatePath does not exist: ${scopeLockStatePath.relativePath}. scope lockを開始してから宣言する。`);
  }
  if (!Array.isArray(document.outOfScopePaths)) {
    fail(`${label}.outOfScopePaths must be an array (今回のscope外パス。無い場合は空配列)。`);
  }
  for (const [index, value] of document.outOfScopePaths.entries()) {
    const normalized = requireString(value, `${label}.outOfScopePaths[${index}]`).replace(/\\/g, "/");
    if (context.changeTargetPaths.has(normalized)) {
      fail(`${label}.outOfScopePaths[${index}] is also a changeTarget: ${normalized}. scope内と外の両方には置けない。`);
    }
  }

  // オーナー指示の写し。scope lock manifestの ownerInstruction と同じ役割を持たせる。
  const ownerInstruction = requireString(document.ownerInstruction, `${label}.ownerInstruction`);
  if (ownerInstruction.trim().length < 20) {
    fail(`${label}.ownerInstruction must record what the owner actually asked for (>=20 chars).`);
  }

  const declaredAt = requireString(document.declaredAt, `${label}.declaredAt`);
  if (Number.isNaN(Date.parse(declaredAt))) {
    fail(`${label}.declaredAt must be an ISO 8601 timestamp; got ${declaredAt}.`);
  }

  return {
    relativePath: declarationPath.relativePath,
    absolutePath: declarationPath.absolutePath,
    scopeId,
    declaredAt,
  };
}

function validateManifest(manifest, phase, implementationIdentityInput) {
  assertNoDraftMarkers(manifest, "Manifest");
  requireObject(manifest, "manifest");
  requireString(manifest.id, "manifest.id");
  requireObject(manifest.scope, "manifest.scope");

  const scope = manifest.scope;
  rejectManifestImplementationIdentity(scope);
  const implementationIdentity = requireImplementationIdentity(implementationIdentityInput, "implementation identity");
  const scopeKind = scope.kind === undefined ? "new" : requireString(scope.kind, "manifest.scope.kind");
  if (!["new", "correction"].includes(scopeKind)) {
    fail("manifest.scope.kind must be new or correction.");
  }
  let correctionReceipt = null;
  if (scopeKind === "correction") {
    try {
      correctionReceipt = validateCorrectionReceipt(repoRoot, scope.correctionReceiptPath);
    } catch (error) {
      fail(`Owner correction receipt rejected: ${error.message}`);
    }
  }
  const changeTargets = requireArray(scope.changeTargets, "manifest.scope.changeTargets").map((target) => {
    const pathInfo = toRepoPath(target, "manifest.scope.changeTargets[]");
    if ((phase === "close" || phase === "release-check") && !existsSync(pathInfo.absolutePath)) {
      fail(`Change target does not exist after implementation: ${pathInfo.relativePath}`);
    }
    return pathInfo;
  });

  const uniqueTargets = new Set(changeTargets.map(({ relativePath }) => relativePath));
  if (uniqueTargets.size !== changeTargets.length) {
    fail("manifest.scope.changeTargets contains duplicates.");
  }

  // ビルド生成物は常にdirtyになりうるため、宣言されたものだけを編集前判定から除外する。
  const declaredGenerated = scope.generatedTargets === undefined ? [] : scope.generatedTargets;
  if (!Array.isArray(declaredGenerated)) fail("manifest.scope.generatedTargets must be an array when supplied.");
  const generatedTargets = declaredGenerated.map((value, index) => {
    const label = `manifest.scope.generatedTargets[${index}]`;
    const normalized = requireString(value, label).replace(/\\/g, "/").replace(/\/+$/, "");
    if (normalized === "" || normalized === "." || normalized === "/" || normalized.startsWith("..")) {
      fail(`${label} must be a real repository-relative file path: ${value}`);
    }
    if (!uniqueTargets.has(normalized)) {
      fail(`${label} must also be listed in manifest.scope.changeTargets: ${normalized}`);
    }
    return normalized;
  });

  // 編集済みのまま開始できる唯一の経路。オーナーの明示承認と対象パスの列挙を必須にする。
  let preEditApproval = null;
  if (scope.preEditApproval !== undefined) {
    const approval = requireObject(scope.preEditApproval, "manifest.scope.preEditApproval");
    const instruction = requireString(approval.instruction, "manifest.scope.preEditApproval.instruction");
    const approvedPaths = requireArray(approval.paths, "manifest.scope.preEditApproval.paths").map((value, index) => {
      const label = `manifest.scope.preEditApproval.paths[${index}]`;
      const normalized = requireString(value, label).replace(/\\/g, "/");
      if (!uniqueTargets.has(normalized)) {
        fail(`${label} must also be listed in manifest.scope.changeTargets: ${normalized}`);
      }
      return normalized;
    });
    preEditApproval = { instruction, paths: approvedPaths };
  }

  // Figmaで可視のvectorが実装から落ちていないかを台帳と突き合わせる監査。
  // 既存manifestを一斉に落とさないため、いまは宣言した案件だけで動く任意項目にしている。
  // 既存manifestの移行が済んだら必須へ上げる。
  let visibleAssetAuditPath = null;
  if (scope.visibleAssetAuditPath !== undefined) {
    const auditPath = toRepoPath(scope.visibleAssetAuditPath, "manifest.scope.visibleAssetAuditPath");
    toEvidencePath(auditPath.absolutePath, "manifest.scope.visibleAssetAuditPath");
    visibleAssetAuditPath = auditPath.relativePath;
  }

  // HTML/PHPを変更するscopeは W3C 証跡のパスを宣言する。
  // 実行できない事情がある場合だけ w3cSkip に理由を書く（合格にはならず未実施として残る）。
  const w3cEvidencePath = scope.w3cEvidencePath === undefined ? null : requireString(scope.w3cEvidencePath, "manifest.scope.w3cEvidencePath");
  let w3cSkip = null;
  if (scope.w3cSkip !== undefined) {
    const skip = requireObject(scope.w3cSkip, "manifest.scope.w3cSkip");
    const reason = requireString(skip.reason, "manifest.scope.w3cSkip.reason");
    if (reason.trim().length < 20) fail("manifest.scope.w3cSkip.reason must explain (>=20 chars) why W3C validation cannot be run.");
    if (w3cEvidencePath) fail("manifest.scope must not declare both w3cEvidencePath and w3cSkip.");
    w3cSkip = { reason };
  }
  // 宣言の有無は manifest を読んだ時点で決まるので、ここで落とす。
  // 以前はこの要求が close の中でしか効いておらず、close できないと確定している manifest が
  // preflight を素通りしていた。実装とcheckpointを全部終えたあとで初めて落ち、
  // manifest は preflight の凍結入力なので直すには全工程のやり直しになる。
  // 証跡ファイル自体は編集後にしか作れないため、ここで要求するのは「宣言」だけ。
  // 中身の照合は close の assertW3cValidation が行う。
  const htmlChangeTargets = changeTargets
    .map(({ relativePath }) => relativePath)
    .filter((relativePath) => /\.(?:php|html?)$/i.test(relativePath));
  if (htmlChangeTargets.length > 0 && !w3cEvidencePath && !w3cSkip) {
    fail(
      `manifest.scope changes HTML output (${htmlChangeTargets.join(", ")}), so it must declare either ` +
        `w3cEvidencePath (where the W3C result will be written) or w3cSkip.reason (>=20 chars). ` +
        `Declare it now: close requires it, and the manifest is frozen at preflight.`
    );
  }

  const specPath = inputRepoPath(scope.specPath, "manifest.scope.specPath");
  const mappingPath = inputRepoPath(scope.mappingPath, "manifest.scope.mappingPath");
  toEvidencePath(specPath.absolutePath, "manifest.scope.specPath");
  toEvidencePath(mappingPath.absolutePath, "manifest.scope.mappingPath");
  // 人間用のMarkdown対応表はハッシュ固定のみで内容を検査できない。
  // Figma子ノード単位のカバレッジを機械検査するため、機械可読なnode mapを併置して必須とする。
  const nodeMapPath = inputRepoPath(scope.nodeMapPath, "manifest.scope.nodeMapPath");
  toEvidencePath(nodeMapPath.absolutePath, "manifest.scope.nodeMapPath");

  const componentsPath = inputRepoPath(scope.componentsPath, "manifest.scope.componentsPath");
  toEvidencePath(componentsPath.absolutePath, "manifest.scope.componentsPath");
  const components = validateComponentManifest(readExecutionJson(componentsPath.absolutePath, "Component manifest"));
  const componentDecisionPath = inputRepoPath(scope.componentDecisionPath, "manifest.scope.componentDecisionPath");
  toEvidencePath(componentDecisionPath.absolutePath, "manifest.scope.componentDecisionPath");
  validateComponentDecisionManifest(componentDecisionPath.absolutePath, components, changeTargets, implementationIdentity);

  const responsiveHtml = requireObject(scope.responsiveHtml, "manifest.scope.responsiveHtml");
  const responsiveHtmlKeys = Object.keys(responsiveHtml);
  const expectedResponsiveHtmlKeys = new Set(["sourceFiles", "deferredSourceFiles", "exceptions"]);
  const unknownResponsiveHtmlKeys = responsiveHtmlKeys.filter((key) => !expectedResponsiveHtmlKeys.has(key));
  const missingResponsiveHtmlKeys = [...expectedResponsiveHtmlKeys].filter((key) => !Object.hasOwn(responsiveHtml, key));
  if (unknownResponsiveHtmlKeys.length > 0 || missingResponsiveHtmlKeys.length > 0) {
    fail(
      "manifest.scope.responsiveHtml must contain exactly sourceFiles, deferredSourceFiles, and exceptions." +
        `${missingResponsiveHtmlKeys.length > 0 ? ` Missing: ${missingResponsiveHtmlKeys.join(", ")}.` : ""}` +
        `${unknownResponsiveHtmlKeys.length > 0 ? ` Unknown: ${unknownResponsiveHtmlKeys.join(", ")}.` : ""}`
    );
  }
  const responsiveHtmlSources = requireArray(responsiveHtml.sourceFiles, "manifest.scope.responsiveHtml.sourceFiles").map((filePath) =>
    toRepoPath(filePath, "manifest.scope.responsiveHtml.sourceFiles[]")
  );
  if (new Set(responsiveHtmlSources.map(({ relativePath }) => relativePath)).size !== responsiveHtmlSources.length) {
    fail("manifest.scope.responsiveHtml.sourceFiles contains duplicates.");
  }
  const deferredResponsiveHtmlSources = responsiveHtml.deferredSourceFiles;
  if (!Array.isArray(deferredResponsiveHtmlSources)) {
    fail("manifest.scope.responsiveHtml.deferredSourceFiles must be an array.");
  }
  const validatedDeferredResponsiveHtmlSources = deferredResponsiveHtmlSources.map((filePath) =>
    toRepoPath(filePath, "manifest.scope.responsiveHtml.deferredSourceFiles[]")
  );
  if (new Set(validatedDeferredResponsiveHtmlSources.map(({ relativePath }) => relativePath)).size !== validatedDeferredResponsiveHtmlSources.length) {
    fail("manifest.scope.responsiveHtml.deferredSourceFiles contains duplicates.");
  }
  const responsiveHtmlSourcePaths = new Set(responsiveHtmlSources.map(({ relativePath }) => relativePath));
  const changeTargetPaths = new Set(changeTargets.map(({ relativePath }) => relativePath));
  const deferredOutsideSources = validatedDeferredResponsiveHtmlSources.filter(({ relativePath }) => !responsiveHtmlSourcePaths.has(relativePath));
  if (deferredOutsideSources.length > 0) {
    fail(
      "manifest.scope.responsiveHtml.deferredSourceFiles must be declared in sourceFiles: " +
        deferredOutsideSources.map(({ relativePath }) => relativePath).join(", ")
    );
  }
  const deferredOutsideTargets = validatedDeferredResponsiveHtmlSources.filter(({ relativePath }) => !changeTargetPaths.has(relativePath));
  if (deferredOutsideTargets.length > 0) {
    fail(
      "manifest.scope.responsiveHtml.deferredSourceFiles must be declared changeTargets: " +
        deferredOutsideTargets.map(({ relativePath }) => relativePath).join(", ")
    );
  }
  if (phase === "preflight") {
    const alreadyExistingDeferredSources = validatedDeferredResponsiveHtmlSources.filter(({ absolutePath }) => existsSync(absolutePath));
    if (alreadyExistingDeferredSources.length > 0) {
      fail(
        "manifest.scope.responsiveHtml.deferredSourceFiles must be absent at preflight: " +
          alreadyExistingDeferredSources.map(({ relativePath }) => relativePath).join(", ")
      );
    }
  }
  const responsiveHtmlExceptions = responsiveHtml.exceptions;
  if (!Array.isArray(responsiveHtmlExceptions)) {
    fail("manifest.scope.responsiveHtml.exceptions must be an array.");
  }
  const validatedResponsiveHtmlExceptions = responsiveHtmlExceptions.map((entry, index) => {
    requireObject(entry, `manifest.scope.responsiveHtml.exceptions[${index}]`);
    return {
      sourceFile: toRepoPath(entry.sourceFile, `manifest.scope.responsiveHtml.exceptions[${index}].sourceFile`).relativePath,
      baseClass: requireString(entry.baseClass, `manifest.scope.responsiveHtml.exceptions[${index}].baseClass`),
      reason: requireString(entry.reason, `manifest.scope.responsiveHtml.exceptions[${index}].reason`),
    };
  });

  const deferredResponsiveHtmlSourcePaths = new Set(validatedDeferredResponsiveHtmlSources.map(({ relativePath }) => relativePath));
  try {
    assertResponsiveHtmlSingleDom(
      phase === "preflight"
        ? responsiveHtmlSources.filter(({ relativePath }) => !deferredResponsiveHtmlSourcePaths.has(relativePath))
        : responsiveHtmlSources,
      validatedResponsiveHtmlExceptions
    );
  } catch (error) {
    fail(error.message);
  }

  const checkpointPlan = requireArray(scope.checkpointPlan, "manifest.scope.checkpointPlan").map((elementId, index) =>
    requireString(elementId, `manifest.scope.checkpointPlan[${index}]`)
  );
  if (new Set(checkpointPlan).size !== checkpointPlan.length) {
    fail("manifest.scope.checkpointPlan contains duplicates.");
  }
  const componentIds = components.map((component) => component.elementId);
  const missingFromPlan = componentIds.filter((elementId) => !checkpointPlan.includes(elementId));
  const unknownInPlan = checkpointPlan.filter((elementId) => !componentIds.includes(elementId));
  if (missingFromPlan.length > 0 || unknownInPlan.length > 0) {
    fail(
      `manifest.scope.checkpointPlan must exactly match the component manifest.${missingFromPlan.length > 0 ? ` Missing: ${missingFromPlan.join(", ")}.` : ""}${unknownInPlan.length > 0 ? ` Unknown: ${unknownInPlan.join(", ")}.` : ""}`
    );
  }

  assertNoDraftPageCoverageInputs(scope);

  const specDocument = readExecutionJson(specPath.absolutePath, "Spec");
  const nodeMapDocument = readExecutionJson(nodeMapPath.absolutePath, "Node map");
  assertSpecCoversComponents(specDocument, components);
  assertSpecCoversRepeatItems(specDocument, components, nodeMapDocument);
  assertSpecProvenance(specDocument);
  assertVariableTextHeight(specDocument);
  if (specDocument.viewportPolicy?.scrollbars !== "hidden" && specDocument.viewportPolicy?.scrollbars !== "visible") {
    fail('SPEC FAIL: spec.viewportPolicy.scrollbars must be "hidden" or "visible". Declare how the measured viewport width treats scrollbars.');
  }
  // 判断F: Q-13/Q-08設定とaxe sourceをpreflightで固定する。checkpoint/closeは同一CDP batchでのみ実行する。
  const verificationConfigs = validateGateVerificationConfig(scope, specDocument);

  const figma = requireObject(manifest.figma, "manifest.figma");
  requireString(figma.fileKey, "manifest.figma.fileKey");
  const nodeEvidencePath = toEvidencePath(figma.nodeEvidencePath, "manifest.figma.nodeEvidencePath");
  const layerEvidencePath = toEvidencePath(figma.layerEvidencePath, "manifest.figma.layerEvidencePath");
  const nodeEvidenceDocument = readExecutionJson(nodeEvidencePath, "Figma node evidence");
  readJsonEvidenceIfDeclared(layerEvidencePath, "manifest.figma.layerEvidencePath");
  const nodes = requireArray(figma.viewportNodes, "manifest.figma.viewportNodes");
  const nodeViewports = new Set();
  const nodeIdsByViewport = new Map();
  for (const node of nodes) {
    requireObject(node, "manifest.figma.viewportNodes[]");
    const declaredNodeId = requireString(node.nodeId, "manifest.figma.viewportNodes[].nodeId");
    const declaredViewport = requireString(node.viewport, "manifest.figma.viewportNodes[].viewport");
    toEvidencePath(node.screenshotPath, "manifest.figma.viewportNodes[].screenshotPath");
    nodeViewports.add(declaredViewport);
    if (!nodeIdsByViewport.has(declaredViewport)) nodeIdsByViewport.set(declaredViewport, new Set());
    nodeIdsByViewport.get(declaredViewport).add(declaredNodeId);
  }
  for (const viewport of ["pc", "sp"]) {
    if (!nodeViewports.has(viewport)) {
      fail(`manifest.figma.viewportNodes must include the ${viewport} node.`);
    }
  }

  // 着手宣言はmanifest・spec・Figma nodeが揃ってからでないと突き合わせられないため、
  // ここで検査する。宣言そのものは編集前に書かれている必要がある。
  const startDeclaration = validateStartDeclaration(scope, {
    scopeId: manifest.id,
    fileKey: figma.fileKey,
    specRelativePath: specPath.relativePath,
    nodeIdsByViewport,
    changeTargetPaths: uniqueTargets,
  });

  const layers = requireArray(figma.layers, "manifest.figma.layers");
  const visibleLayerIds = new Set();
  for (const layer of layers) {
    requireObject(layer, "manifest.figma.layers[]");
    requireString(layer.nodeId, "manifest.figma.layers[].nodeId");
    requireString(layer.name, "manifest.figma.layers[].name");
    if (typeof layer.visible !== "boolean") {
      fail("manifest.figma.layers[].visible must be boolean.");
    }
    requireString(layer.observedBy, "manifest.figma.layers[].observedBy");
    if (layer.visible) {
      visibleLayerIds.add(layer.nodeId);
    }
  }
  if (visibleLayerIds.size === 0) {
    fail("manifest.figma.layers must record at least one visible layer.");
  }

  assertNodeMapCoverage(
    nodeMapDocument,
    specDocument,
    components,
    nodeEvidenceDocument,
    nodeEvidencePath,
    figma.fileKey
  );

  // Pages without exported Figma assets must not invent a dummy asset.
  const assets = manifest.assets === undefined ? [] : manifest.assets;
  if (!Array.isArray(assets)) {
    fail("manifest.assets must be an array when supplied.");
  }
  for (const asset of assets) {
    requireObject(asset, "manifest.assets[]");
    const visibleLayerId = requireString(asset.visibleLayerId, "manifest.assets[].visibleLayerId");
    if (!visibleLayerIds.has(visibleLayerId)) {
      fail(`Asset is not tied to a recorded visible layer: ${visibleLayerId}`);
    }
    const figmaAssetUrl = requireString(asset.figmaAssetUrl, "manifest.assets[].figmaAssetUrl");
    if (!/^https:\/\/www\.figma\.com\/api\/mcp\/asset\//.test(figmaAssetUrl)) {
      fail("manifest.assets[].figmaAssetUrl must be an exported Figma MCP asset URL.");
    }
    requireString(asset.exportFormat, "manifest.assets[].exportFormat");
    const exportPath = toEvidencePath(asset.exportPath, "manifest.assets[].exportPath");
    const expectedHash = requireString(asset.exportSha256, "manifest.assets[].exportSha256");
    if (hashFile(exportPath) !== expectedHash) {
      fail(`Figma asset export hash does not match: ${exportPath}`);
    }
    const localPath = toRepoPath(asset.localPath, "manifest.assets[].localPath");
    if (phase === "close") {
      if (!existsSync(localPath.absolutePath)) {
        fail(`Exported local asset is missing: ${localPath.relativePath}`);
      }
      if (hashFile(localPath.absolutePath) !== expectedHash) {
        fail(`Local asset differs from the verified Figma export: ${localPath.relativePath}`);
      }
    }
  }


  return {
    id: manifest.id,
    scopeKind,
    correctionReceipt,
    startDeclaration,
    specPath: specPath.relativePath,
    mappingPath: mappingPath.relativePath,
    mappingAbsolutePath: mappingPath.absolutePath,
    nodeMapPath: nodeMapPath.relativePath,
    nodeMapAbsolutePath: nodeMapPath.absolutePath,
    componentDecisionPath: componentDecisionPath.relativePath,
    componentDecisionAbsolutePath: componentDecisionPath.absolutePath,
    nodeEvidencePath,
    layerEvidencePath,
    changeTargets: changeTargets.map(({ relativePath, absolutePath }) => ({ relativePath, absolutePath })),
    generatedTargets,
    visibleAssetAuditPath,
    preEditApproval,
    responsiveHtmlSourceFiles: responsiveHtmlSources.map(({ relativePath }) => relativePath),
    deferredResponsiveHtmlSourceFiles: validatedDeferredResponsiveHtmlSources.map(({ relativePath }) => relativePath),
    w3cEvidencePath,
    w3cSkip,
    scssFiles: (scope.scssFiles || []).map((filePath) => toRepoPath(filePath, "manifest.scope.scssFiles[]")),
    phpFiles: (scope.phpFiles || []).map((filePath) => toRepoPath(filePath, "manifest.scope.phpFiles[]")),
    verifyUrl: requireString(scope.verifyUrl, "manifest.scope.verifyUrl (required: checkpoint and close both measure against it)"),
    checkpointPlan,
    components,
    implementationIdentity,
    specAbsolutePath: specPath.absolutePath,
    componentsAbsolutePath: componentsPath.absolutePath,
    accessibilityPath: verificationConfigs.accessibilityPath.relativePath,
    accessibilityAbsolutePath: verificationConfigs.accessibilityPath.absolutePath,
    motionPath: verificationConfigs.motionPath.relativePath,
    motionAbsolutePath: verificationConfigs.motionPath.absolutePath,
    axeSourcePath: verificationConfigs.axeSourcePath.relativePath,
    axeSourceAbsolutePath: verificationConfigs.axeSourcePath.absolutePath,
  };
}

const CHECKPOINT_RECT_TOLERANCE_PX = 1.5;
const CHECKPOINT_VISUAL_THRESHOLD_MAX = 0.05;
// 1%を超える閾値は「実測した下限」がなければ認めない。根拠なしの緩和はゲートを無力化するため、
// visualThresholdBasis に測定内容を書かせて機械的に強制する（spec/09 §3-3）。
const CHECKPOINT_VISUAL_THRESHOLD_STRICT = 0.01;
const SELECTOR_BOUNDARY_CHARS = [" ", ">", "+", "~", ":", ".", "[", "_", ","];
function validateVisualMask(value, label) {
  if (value === undefined) return null;
  const mask = requireObject(value, label);
  const path = toEvidencePath(mask.path, `${label}.path`);
  const sha256 = requireString(mask.sha256, `${label}.sha256`);
  if (hashFile(path) !== sha256) fail(`${label} hash mismatch: ${path}`);
  const mode = mask.mode === undefined ? "exclude" : requireString(mask.mode, `${label}.mode`);
  if (mode !== "exclude") fail(`${label}.mode must be "exclude".`);
  return { path, sha256, mode };
}

function validateComponentManifest(document) {
  requireObject(document, "component manifest");
  const entries = requireArray(document.components, "components");
  const seenIds = new Set();
  const seenSelectors = new Set();
  const components = entries.map((entry, index) => {
    requireObject(entry, `components[${index}]`);
    const elementId = requireString(entry.elementId, `components[${index}].elementId`);
    const selector = requireString(entry.selector, `components[${index}].selector`);
    const figmaNodeId = requireString(entry.figmaNodeId, `components[${index}].figmaNodeId`);
    if (typeof entry.painted !== "boolean") {
      fail(`components[${index}].painted must be boolean.`);
    }
    let visualThreshold = null;
    if (entry.painted) {
      visualThreshold = entry.visualThreshold;
      if (!Number.isFinite(visualThreshold) || visualThreshold <= 0 || visualThreshold > CHECKPOINT_VISUAL_THRESHOLD_MAX) {
        fail(`components[${index}].visualThreshold must be a finite number in (0, ${CHECKPOINT_VISUAL_THRESHOLD_MAX}] for painted components.`);
      }
    }
    // 密度の高い日本語テキストが占める割合はPCとSPで大きく違い、Figma書き出しとブラウザのラスタライズ差の
    // 下限も別々になる。片方に合わせた単一閾値は、もう片方を素通しにする。
    let visualThresholds = null;
    if (entry.visualThresholds !== undefined) {
      if (!entry.painted) {
        fail(`components[${index}].visualThresholds is only meaningful for painted components.`);
      }
      const declared = requireObject(entry.visualThresholds, `components[${index}].visualThresholds`);
      visualThresholds = {};
      for (const [viewport, value] of Object.entries(declared)) {
        if (!["pc", "sp"].includes(viewport)) {
          fail(`components[${index}].visualThresholds has an unknown viewport: ${viewport}`);
        }
        if (!Number.isFinite(value) || value <= 0 || value > CHECKPOINT_VISUAL_THRESHOLD_MAX) {
          fail(`components[${index}].visualThresholds.${viewport} must be a finite number in (0, ${CHECKPOINT_VISUAL_THRESHOLD_MAX}].`);
        }
        visualThresholds[viewport] = value;
      }
    }
    let visualThresholdBasis = null;
    if (entry.painted) {
      const effective = [visualThreshold, ...Object.values(visualThresholds || {})];
      const loosened = effective.filter((value) => value > CHECKPOINT_VISUAL_THRESHOLD_STRICT);
      if (loosened.length > 0) {
        visualThresholdBasis = entry.visualThresholdBasis;
        if (typeof visualThresholdBasis !== "string" || visualThresholdBasis.trim().length < 40) {
          fail(
            `components[${index}].visualThresholdBasis is required (>=40 chars) because a threshold exceeds ${CHECKPOINT_VISUAL_THRESHOLD_STRICT}. State the measured floor and how it was obtained. Loosened: ${loosened.join(", ")}`
          );
        }
      }
    }
    let viewports = ["pc", "sp"];
    if (entry.viewports !== undefined) {
      viewports = requireArray(entry.viewports, `components[${index}].viewports`).map((viewport, viewportIndex) =>
        requireString(viewport, `components[${index}].viewports[${viewportIndex}]`)
      );
      if (viewports.some((viewport) => !["pc", "sp"].includes(viewport)) || new Set(viewports).size !== viewports.length) {
        fail(`components[${index}].viewports must be a unique subset of ["pc", "sp"].`);
      }
    }
    const spacingOwnership = requireObject(entry.spacingOwnership, `components[${index}].spacingOwnership`);
    const rootPadding = requireString(spacingOwnership.rootPadding, `components[${index}].spacingOwnership.rootPadding`);
    if (!["none", "internal"].includes(rootPadding)) {
      fail(`components[${index}].spacingOwnership.rootPadding must be none or internal. Component roots must not own external section spacing: ${elementId}`);
    }
    const interSectionSpacing = requireString(spacingOwnership.interSectionSpacing, `components[${index}].spacingOwnership.interSectionSpacing`);
    if (!["parent-layout", "not-applicable"].includes(interSectionSpacing)) {
      fail(`components[${index}].spacingOwnership.interSectionSpacing must be parent-layout or not-applicable: ${elementId}`);
    }

    // Repeated UI requires one Figma node and one spec selector for every visible item.
    if (!Array.isArray(entry.repeatItems)) fail(`components[${index}].repeatItems must be an array.`);
    const repeatItems = entry.repeatItems;
    if (repeatItems.length === 0 && (typeof entry.repeatItemsReason !== "string" || entry.repeatItemsReason.trim().length < 20)) fail(`components[${index}].repeatItemsReason is required (>=20 chars) when repeatItems is empty.`);
    const repeatIds = new Set();
    const normalizedRepeatItems = repeatItems.map((item, itemIndex) => {
      const label = `components[${index}].repeatItems[${itemIndex}]`;
      requireObject(item, label);
      const itemId = requireString(item.itemId, `${label}.itemId`);
      if (repeatIds.has(itemId)) fail(`${label}.itemId duplicates ${itemId}.`);
      repeatIds.add(itemId);
      const figmaNodeIds = requireObject(item.figmaNodeIds, `${label}.figmaNodeIds`);
      const selectors = requireObject(item.selectors, `${label}.selectors`);
      for (const viewport of ["pc", "sp"]) {
        requireString(figmaNodeIds[viewport], `${label}.figmaNodeIds.${viewport}`);
        requireString(selectors[viewport], `${label}.selectors.${viewport}`);
      }
      return { itemId, figmaNodeIds: { pc: figmaNodeIds.pc, sp: figmaNodeIds.sp }, selectors: { pc: selectors.pc, sp: selectors.sp } };
    });

    let figmaImages = null;
    if (entry.painted) {
      const declaredImages = requireObject(entry.figmaImages, `components[${index}].figmaImages (painted components must register Figma reference images at preflight)`);
      figmaImages = {};
      for (const viewport of viewports) {
        const image = requireObject(declaredImages[viewport], `components[${index}].figmaImages.${viewport}`);
        const imagePath = toEvidencePath(image.path, `components[${index}].figmaImages.${viewport}.path`);
        const expectedHash = requireString(image.sha256, `components[${index}].figmaImages.${viewport}.sha256`);
        if (hashFile(imagePath) !== expectedHash) {
          fail(`components[${index}].figmaImages.${viewport} hash mismatch: ${imagePath}`);
        }
        const mask = validateVisualMask(image.mask, `components[${index}].figmaImages.${viewport}.mask`);
        figmaImages[viewport] = { path: imagePath, sha256: expectedHash, mask };
      }
    }
    if (seenIds.has(elementId)) {
      fail(`components contains a duplicate elementId: ${elementId}`);
    }
    if (seenSelectors.has(selector)) {
      fail(`components contains a duplicate selector: ${selector}`);
    }
    seenIds.add(elementId);
    seenSelectors.add(selector);
    if (visualThresholds) {
      for (const viewport of Object.keys(visualThresholds)) {
        if (!viewports.includes(viewport)) {
          fail(`components[${index}].visualThresholds.${viewport} is declared but that viewport is not in viewports.`);
        }
      }
    }
    return {
      elementId,
      selector,
      figmaNodeId,
      painted: entry.painted,
      visualThreshold,
      visualThresholds,
      visualThresholdBasis,
      viewports,
      figmaImages,
      spacingOwnership: { rootPadding, interSectionSpacing },
      repeatItems: normalizedRepeatItems,
    };
  });
  return components;
}

function validateComponentDecisionManifest(decisionPath, components, changeTargets, implementationIdentity) {
  const document = readExecutionJson(decisionPath, "Component decision manifest");
  requireObject(document, "component decision manifest");
  if (document.version !== 1) {
    fail("component decision manifest.version must be 1.");
  }
  const entries = requireArray(document.decisions, "component decision manifest.decisions");
  const componentById = new Map(components.map((component) => [component.elementId, component]));
  const changeTargetPaths = new Set(changeTargets.map((target) => target.relativePath));
  const seenIds = new Set();

  for (const [index, entry] of entries.entries()) {
    requireObject(entry, `component decision manifest.decisions[${index}]`);
    const elementId = requireString(entry.elementId, `component decision manifest.decisions[${index}].elementId`);
    const component = componentById.get(elementId);
    if (!component) fail(`component decision references an unknown elementId: ${elementId}`);
    if (seenIds.has(elementId)) fail(`component decision manifest has a duplicate elementId: ${elementId}`);
    seenIds.add(elementId);
    if (requireString(entry.figmaNodeId, `component decision manifest.decisions[${index}].figmaNodeId`) !== component.figmaNodeId) {
      fail(`component decision figmaNodeId does not match the component manifest: ${elementId}`);
    }

    const figmaNodeType = requireString(entry.figmaNodeType, `component decision manifest.decisions[${index}].figmaNodeType`);
    if (!["COMPONENT", "INSTANCE", "OTHER"].includes(figmaNodeType)) {
      fail(`component decision figmaNodeType must be COMPONENT, INSTANCE, or OTHER: ${elementId}`);
    }
    const decision = requireString(entry.decision, `component decision manifest.decisions[${index}].decision`);
    if (!["reuse", "extend", "new", "not-applicable"].includes(decision)) {
      fail(`component decision must be reuse, extend, new, or not-applicable: ${elementId}`);
    }
    if ((figmaNodeType === "COMPONENT" || figmaNodeType === "INSTANCE") && decision === "not-applicable") {
      fail(`Figma COMPONENT/INSTANCE requires reuse, extend, or new: ${elementId}`);
    }
    if (figmaNodeType === "OTHER" && decision !== "not-applicable") {
      fail(`Only Figma COMPONENT/INSTANCE may use a component decision: ${elementId}`);
    }

    const codePath = toRepoPath(entry.codePath, `component decision codePath (${elementId})`);
    const searchEvidencePath = toRepoPath(entry.searchEvidencePath, `component decision searchEvidencePath (${elementId})`);
    toEvidencePath(searchEvidencePath.absolutePath, `component decision searchEvidencePath (${elementId})`);
    requireString(entry.rationale, `component decision rationale (${elementId})`);

    if (decision === "reuse" || decision === "extend") {
      if (!existsSync(codePath.absolutePath)) fail(`reuse/extend decision must point to an existing code path: ${elementId}`);
    }
    if (decision === "new") {
      if (!changeTargetPaths.has(codePath.relativePath)) fail(
`new decision codePath must be declared in scope.changeTargets: ${elementId}`);
      if (entry.independentApproved !== true) fail(
`new decision requires independentApproved: true before section-start: ${elementId}`);
      const reviewerActor = requireString(entry.reviewerActor, 
`new decision reviewerActor (${elementId})`);
      const reviewerContextId = requireString(entry.reviewerContextId, 
`new decision reviewerContextId (${elementId})`);
      if (reviewerActor === implementationIdentity.actor && reviewerContextId === implementationIdentity.contextId) {
        fail(
`new decision review must be performed by a different actor or a different context: ${elementId}`);
      }
      requireString(entry.reviewedAt, 
`new decision reviewedAt (${elementId})`);
      const reviewEvidencePath = toRepoPath(entry.reviewEvidencePath, 
`new decision reviewEvidencePath (${elementId})`);
      toEvidencePath(reviewEvidencePath.absolutePath, 
`new decision reviewEvidencePath (${elementId})`);
    }
  }

  const missing = components.map((component) => component.elementId).filter((elementId) => !seenIds.has(elementId));
  if (missing.length > 0 || seenIds.size !== components.length) {
    fail(`component decision manifest must cover every component exactly once.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}`);
  }
}
function widthClass(width) {
  return width <= 767 ? "sp" : "pc";
}

function selectorCoveredBy(specSelector, componentSelector) {
  if (specSelector === componentSelector) {
    return true;
  }
  if (!specSelector.startsWith(componentSelector)) {
    return false;
  }
  return SELECTOR_BOUNDARY_CHARS.includes(specSelector.charAt(componentSelector.length));
}

// Every spec expectation must carry the Figma source it came from.
// An expectation without provenance is an estimate, and estimates must never become PASS criteria
// (recurrence key: unverified-figma-value / rules/corrections.md 2026-07-09, rules/mistakes.md 2026-06-25).
const SPEC_PROVENANCE_SOURCES = new Set([
  "metadata",
  "design_context",
  "variable_defs",
  "screenshot",
  "asset",
  "rest",
  "scale-conversion",
  "owner-decision",
]);
const SPEC_NON_MEASURED_KEYS = new Set(["sel", "note", "provenance", "textPatternReason"]);
const SPEC_TEXT_KEYS = ["text", "innerText", "textPattern", "lineCount"];
// 固定高さを許す根拠を note に書くときの目印。自由記述キーを足すと provenance 検査が
// 「provenance の無い測定値」として落とすため、記録先は note に限られる。
const FIXED_HEIGHT_REASON_MARKER = "fixed-height-reason:";

function parsePxValue(value) {
  if (typeof value !== "string") return null;
  const matched = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return matched ? Number(matched[1]) : null;
}

// Figmaの矩形高さをCSSの固定 height へ直写する事故を spec の段階で捕まえる。
// ゲートは実測高さがspecと合うことしか見ないため、padding込みの矩形高さを height に
// 焼き付けた実装でも、Figmaのダミー文言のままなら PASS してしまう。文字量が変われば崩れる。
// 正本は C:\AI\web-development\rules\css-values.md の「可変テキスト要素の高さ」。
function assertVariableTextHeight(spec) {
  const tolerance = Number.isFinite(spec.tolerance) ? spec.tolerance : CHECKPOINT_RECT_TOLERANCE_PX;
  const offenders = [];
  for (const viewport of requireArray(spec.viewports, "spec.viewports")) {
    const viewportLabel = Number.isFinite(viewport.width) ? `${viewport.width}px` : "viewport";
    for (const element of requireArray(viewport.elements, "spec.viewports[].elements")) {
      const isTextElement = SPEC_TEXT_KEYS.some((key) => element[key] !== undefined);
      if (!isTextElement) continue;
      // 範囲指定（[min, max]）は文字量で伸びる前提の書き方なので対象外にする。
      // ただし幅の無いレンジ（[64, 64]）は実質固定値なので、単一値と同じに扱う。
      // レンジ形式にするだけで検査を外せる抜け道を残さない。
      let declaredHeight = null;
      if (typeof element.height === "number") {
        declaredHeight = element.height;
      } else if (Array.isArray(element.height) && element.height.length === 2) {
        const [min, max] = element.height;
        if (Number.isFinite(min) && Number.isFinite(max) && Math.abs(max - min) <= tolerance) declaredHeight = min;
      }
      if (declaredHeight === null) continue;
      // 高さが行ボックスそのもの（line-height x 行数）なら、paddingを焼き付けた固定枠ではない。
      const lineHeight = parsePxValue(element.lineHeight);
      const lineCount = element.lineCount;
      if (lineHeight !== null && Number.isFinite(lineCount) && Math.abs(declaredHeight - lineHeight * lineCount) <= tolerance) {
        continue;
      }
      const note = typeof element.note === "string" ? element.note : "";
      const markerIndex = note.indexOf(FIXED_HEIGHT_REASON_MARKER);
      if (markerIndex >= 0 && note.slice(markerIndex + FIXED_HEIGHT_REASON_MARKER.length).trim().length > 0) continue;
      offenders.push(`${viewportLabel} ${element.sel}.height = ${JSON.stringify(element.height)}`);
    }
  }
  if (offenders.length > 0) {
    fail(
      `SPEC FAIL: a text element declares a single fixed height that is not explained by lineHeight x lineCount. ` +
        `Figma rect heights include padding; writing them into CSS height breaks as soon as the wording changes. ` +
        `Use a [min, max] range and build the height with padding / min-height / line-height, ` +
        `or record why the content cannot vary in note as "${FIXED_HEIGHT_REASON_MARKER} <reason>". Offending: ${offenders.join(" / ")}`
    );
  }
}

function assertSpecProvenance(spec) {
  requireObject(spec, "spec");
  const missing = [];
  const unknown = [];
  const stale = [];
  // 期待値を持たない要素・要素を持たないviewportは、比較する対象がゼロなので合格しても何も保証しない。
  // 「N件PASS」という証跡だけが残り、検証したように見えるのが最も危ない（実測で、あるscopeは
  // 15要素すべてが sel と note だけの状態で合格していた）。
  // viewport / elements が空の場合は requireArray が非空を要求して先に落とす。
  const assertionless = [];
  for (const viewport of requireArray(spec.viewports, "spec.viewports")) {
    requireObject(viewport, "spec.viewports[]");
    const viewportLabel = Number.isFinite(viewport.width) ? `${viewport.width}px` : "viewport";
    for (const element of requireArray(viewport.elements, "spec.viewports[].elements")) {
      requireObject(element, "spec.viewports[].elements[]");
      const selector = requireString(element.sel, "spec.viewports[].elements[].sel");
      const measuredKeys = Object.keys(element).filter((key) => !SPEC_NON_MEASURED_KEYS.has(key));
      if (measuredKeys.length === 0) {
        assertionless.push(`${viewportLabel} ${selector}`);
        continue;
      }
      const provenance = element.provenance;
      if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
        missing.push(`${viewportLabel} ${selector}: provenance object for ${measuredKeys.join(", ")}`);
        continue;
      }
      for (const key of measuredKeys) {
        const source = provenance[key];
        if (typeof source !== "string" || source.trim() === "") {
          missing.push(`${viewportLabel} ${selector}.${key}`);
          continue;
        }
        if (!SPEC_PROVENANCE_SOURCES.has(source)) {
          unknown.push(`${viewportLabel} ${selector}.${key} = "${source}"`);
        }
      }
      for (const key of Object.keys(provenance)) {
        if (!measuredKeys.includes(key)) {
          stale.push(`${viewportLabel} ${selector}.${key}`);
        }
      }
    }
  }
  if (assertionless.length > 0) {
    fail(
      `SPEC FAIL: these spec elements declare no expectation, so they verify nothing while still counting as coverage. ` +
        `Give each one at least one measured value (width / height / topInSection / computed style etc.), or remove it: ${assertionless.join(" / ")}`
    );
  }
  if (missing.length > 0) {
    fail(
      `SPEC FAIL: every spec expectation needs a provenance tag naming the Figma source it was taken from. Missing: ${missing.join(" / ")}`
    );
  }
  if (unknown.length > 0) {
    fail(
      `SPEC FAIL: unknown provenance source. Allowed: ${[...SPEC_PROVENANCE_SOURCES].join(", ")}. Estimated or inferred values must not be used as PASS criteria. Offending: ${unknown.join(" / ")}`
    );
  }
  if (stale.length > 0) {
    fail(
      `SPEC FAIL: provenance refers to expectations that no longer exist in the spec (rename or stale entry): ${stale.join(" / ")}`
    );
  }
}

function assertSpecCoversRepeatItems(spec, components, nodeMap) {
  const repeated = components.filter((component) => component.repeatItems.length > 0);
  if (!repeated.length) return;
  const byViewport = new Map();
  for (const viewport of requireArray(spec.viewports, "spec.viewports")) {
    const key = requireString(viewport.repeatViewport, "spec.viewports[].repeatViewport (pc or sp when repeatItems are declared)");
    if (!["pc", "sp"].includes(key)) fail("spec.viewports[].repeatViewport must be pc or sp.");
    if (!byViewport.has(key)) byViewport.set(key, new Set());
    for (const element of requireArray(viewport.elements, "spec.viewports[].elements")) byViewport.get(key).add(requireString(element.sel, "spec.viewports[].elements[].sel"));
  }
  for (const key of ["pc", "sp"]) if (!byViewport.has(key)) fail(`SPEC FAIL: repeatItems require at least one ${key} spec viewport.`);
  const nodes = new Set(requireArray(requireObject(nodeMap.inventory, "node map.inventory").nodes, "node map.inventory.nodes").map((entry) => `${entry.viewport}::${entry.figmaNodeId}`));
  const missingSelectors=[]; const unknownNodes=[];
  for (const component of repeated) for (const item of component.repeatItems) for (const key of ["pc", "sp"]) {
    if (!byViewport.get(key).has(item.selectors[key])) missingSelectors.push(`${component.elementId}/${item.itemId}/${key}: ${item.selectors[key]}`);
    if (!nodes.has(`${key}::${item.figmaNodeIds[key]}`)) unknownNodes.push(`${component.elementId}/${item.itemId}/${key}: ${item.figmaNodeIds[key]}`);
  }
  if (missingSelectors.length) fail(`SPEC FAIL: repeated item selector is missing from its viewport spec: ${missingSelectors.join(" / ")}`);
  if (unknownNodes.length) fail(`SPEC FAIL: repeated item Figma node is absent from node map inventory: ${unknownNodes.join(" / ")}`);
}
function assertSpecCoversComponents(spec, components) {
  requireObject(spec, "spec");
  const viewports = requireArray(spec.viewports, "spec.viewports");
  const specSelectors = new Set();
  for (const viewport of viewports) {
    requireObject(viewport, "spec.viewports[]");
    for (const element of requireArray(viewport.elements, "spec.viewports[].elements")) {
      requireObject(element, "spec.viewports[].elements[]");
      specSelectors.add(requireString(element.sel, "spec.viewports[].elements[].sel"));
    }
  }

  const orphanSpecSelectors = [...specSelectors].filter(
    (specSelector) => !components.some((component) => selectorCoveredBy(specSelector, component.selector))
  );
  if (orphanSpecSelectors.length > 0) {
    fail(
      `Every spec element must belong to a component (add it to the component manifest): ${orphanSpecSelectors.join(", ")}`
    );
  }

  const unmeasuredComponents = components.filter(
    (component) => ![...specSelectors].some((specSelector) => selectorCoveredBy(specSelector, component.selector))
  );
  if (unmeasuredComponents.length > 0) {
    fail(
      `Every component must be measured by at least one spec element: ${unmeasuredComponents.map((component) => component.elementId).join(", ")}`
    );
  }
}

const NODE_MAP_STATUSES = new Set(["mapped", "figma-only", "dom-only"]);
// get_metadata が返すノード種別。TEXT は文言の検証を必須にするため区別する。
const NODE_MAP_FIGMA_TYPES = new Set(["TEXT", "FRAME", "INSTANCE", "COMPONENT", "GROUP", "VECTOR", "RECTANGLE", "IMAGE", "OTHER"]);

function collectSpecSelectors(spec) {
  requireObject(spec, "spec");
  const selectors = new Set();
  for (const viewport of requireArray(spec.viewports, "spec.viewports")) {
    requireObject(viewport, "spec.viewports[]");
    for (const element of requireArray(viewport.elements, "spec.viewports[].elements")) {
      requireObject(element, "spec.viewports[].elements[]");
      selectors.add(requireString(element.sel, "spec.viewports[].elements[].sel"));
    }
  }
  return [...selectors];
}

const SCOPED_NODE_MAP_VERSION = 2;
const SCOPED_NODE_MAP_SCHEMA = "scoped-roots/v1";
const SCOPED_NODE_MAP_SCOPE_IDS = Object.freeze(["first-view", "header"]);

function assertExactKeys(value, label, expectedKeys) {
  const object = requireObject(value, label);
  const expected = new Set(expectedKeys);
  const unknown = Object.keys(object).filter((key) => !expected.has(key));
  const missing = expectedKeys.filter((key) => !Object.hasOwn(object, key));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      `${label} must contain exactly ${expectedKeys.join(", ")}.` +
        `${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}` +
        `${unknown.length > 0 ? ` Unknown: ${unknown.join(", ")}.` : ""}`
    );
  }
  return object;
}

function requireScopedNodeMapEvidence(nodeEvidence, nodeEvidencePath, fileKey, canonicalRootNodeId, pairedSpRootNodeId) {
  const evidence = requireObject(nodeEvidence, "Figma node evidence");
  if (evidence.schema !== "p3-figma-node-evidence/v1") {
    fail("Figma node evidence must use schema p3-figma-node-evidence/v1 for scoped-roots/v1 node maps.");
  }
  if (requireString(evidence.fileKey, "Figma node evidence.fileKey") !== fileKey) {
    fail("Figma node evidence.fileKey must equal node map.figma.fileKey.");
  }
  const entries = requireArray(evidence.evidence, "Figma node evidence.evidence");
  const normalized = entries.map((entry, index) => {
    const label = `Figma node evidence.evidence[${index}]`;
    requireObject(entry, label);
    const viewport = requireString(entry.viewport, `${label}.viewport`);
    if (!['pc', 'sp'].includes(viewport)) fail(`${label}.viewport must be \"pc\" or \"sp\".`);
    const role = requireString(entry.role, `${label}.role`);
    const figmaNodeId = requireString(entry.nodeId, `${label}.nodeId`);
    const metadataPathValue = requireString(entry.metadataPath, `${label}.metadataPath`);
    const metadataSha256 = requireString(entry.metadataSha256, `${label}.metadataSha256`);
    assertNoDraftInputPath(metadataPathValue, `${label}.metadataPath`);
    const metadataPath = toEvidencePath(metadataPathValue, `${label}.metadataPath`);
    if (hashFile(metadataPath) !== metadataSha256) {
      fail(`${label}.metadataSha256 does not match its saved metadata bytes.`);
    }
    const metadata = readExecutionJson(metadataPath, `${label} metadata`);
    const raw = requireString(metadata.raw, `${label} metadata.raw`);
    return { viewport, role, figmaNodeId, metadataPathValue, metadataSha256, raw };
  });

  const unique = (viewport, role, nodeId, label) => {
    const matching = normalized.filter(
      (entry) => entry.viewport === viewport && entry.role === role && entry.figmaNodeId === nodeId
    );
    if (matching.length !== 1) {
      fail(
        `${label} must have exactly one matching Figma node evidence record ` +
          `(viewport=${viewport}, role=${role}, nodeId=${nodeId}); found ${matching.length}.`
      );
    }
    return matching[0];
  };

  // The PC canonical root and its SP counterpart are evidence-backed page
  // roots, not entries to be silently inferred from a partial child list.
  const canonicalPc = unique("pc", "page-root", canonicalRootNodeId, "node map.figma.canonicalRootNodeId");
  const pairedSp = unique("sp", "page-root", pairedSpRootNodeId, "node map.figma.pairedSpRootNodeId");
  return { entries: normalized, canonicalPc, pairedSp, nodeEvidencePath };
}

function metadataRawContainsNodeId(raw, nodeId) {
  const escapedNodeId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bid=(?:\"|')${escapedNodeId}(?:\"|')`).test(raw);
}

function validateScopedNodeMapTopology(nodeMap, nodeEvidence, nodeEvidencePath, expectedFigmaFileKey) {
  requireObject(nodeMap, "node map");
  if (nodeMap.version !== SCOPED_NODE_MAP_VERSION || nodeMap.schema !== SCOPED_NODE_MAP_SCHEMA) {
    fail(
      `node map must use version ${SCOPED_NODE_MAP_VERSION} schema ${SCOPED_NODE_MAP_SCHEMA}; ` +
        "root-wide v12 node maps are rejected."
    );
  }

  const figma = assertExactKeys(
    nodeMap.figma,
    "node map.figma",
    ["fileKey", "canonicalRootNodeId", "pairedSpRootNodeId", "source"]
  );
  const fileKey = requireString(figma.fileKey, "node map.figma.fileKey");
  if (fileKey !== expectedFigmaFileKey) {
    fail("node map.figma.fileKey must equal manifest.figma.fileKey.");
  }
  const canonicalRootNodeId = requireString(figma.canonicalRootNodeId, "node map.figma.canonicalRootNodeId");
  const pairedSpRootNodeId = requireString(figma.pairedSpRootNodeId, "node map.figma.pairedSpRootNodeId");
  if (canonicalRootNodeId === pairedSpRootNodeId) {
    fail("node map.figma.canonicalRootNodeId and pairedSpRootNodeId must be distinct PC/SP page roots.");
  }
  requireString(figma.source, "node map.figma.source (how the scoped roots were obtained, e.g. get_metadata)");

  const sourceEvidence = assertExactKeys(
    nodeMap.sourceEvidence,
    "node map.sourceEvidence",
    ["nodeEvidencePath", "nodeEvidenceSha256"]
  );
  const expectedEvidencePath = relative(repoRoot, nodeEvidencePath).split(String.fromCharCode(92)).join("/");
  if (requireString(sourceEvidence.nodeEvidencePath, "node map.sourceEvidence.nodeEvidencePath") !== expectedEvidencePath) {
    fail("node map.sourceEvidence.nodeEvidencePath must equal manifest.figma.nodeEvidencePath after repository normalization.");
  }
  if (requireString(sourceEvidence.nodeEvidenceSha256, "node map.sourceEvidence.nodeEvidenceSha256") !== hashFile(nodeEvidencePath)) {
    fail("node map.sourceEvidence.nodeEvidenceSha256 does not match manifest.figma.nodeEvidencePath bytes.");
  }
  const evidence = requireScopedNodeMapEvidence(
    nodeEvidence,
    nodeEvidencePath,
    fileKey,
    canonicalRootNodeId,
    pairedSpRootNodeId
  );

  const scopeRoots = requireArray(nodeMap.scopeRoots, "node map.scopeRoots");
  if (scopeRoots.length !== 4) {
    fail("node map.scopeRoots must contain exactly four scoped roots: PC/SP first-view and header.");
  }
  const scopeRootByViewportAndScope = new Map();
  const scopeRootByViewportAndNode = new Map();
  for (const [index, entry] of scopeRoots.entries()) {
    const label = `node map.scopeRoots[${index}]`;
    const root = assertExactKeys(
      entry,
      label,
      ["scopeId", "viewport", "figmaNodeId", "pageRootNodeId", "pairedScopeRootNodeId", "metadataPath", "metadataSha256"]
    );
    const scopeId = requireString(root.scopeId, `${label}.scopeId`);
    if (!SCOPED_NODE_MAP_SCOPE_IDS.includes(scopeId)) {
      fail(`${label}.scopeId must be one of: ${SCOPED_NODE_MAP_SCOPE_IDS.join(", ")}.`);
    }
    const viewport = requireString(root.viewport, `${label}.viewport`);
    if (!["pc", "sp"].includes(viewport)) fail(`${label}.viewport must be \"pc\" or \"sp\".`);
    const figmaNodeId = requireString(root.figmaNodeId, `${label}.figmaNodeId`);
    const pageRootNodeId = requireString(root.pageRootNodeId, `${label}.pageRootNodeId`);
    const expectedPageRoot = viewport === "pc" ? canonicalRootNodeId : pairedSpRootNodeId;
    if (pageRootNodeId !== expectedPageRoot) {
      fail(`${label}.pageRootNodeId must bind the ${viewport.toUpperCase()} scoped root to its declared page root ${expectedPageRoot}.`);
    }
    const pairedScopeRootNodeId = requireString(root.pairedScopeRootNodeId, `${label}.pairedScopeRootNodeId`);
    const metadataPath = requireString(root.metadataPath, `${label}.metadataPath`);
    const metadataSha256 = requireString(root.metadataSha256, `${label}.metadataSha256`);
    assertNoDraftInputPath(metadataPath, `${label}.metadataPath`);
    const metadataAbsolutePath = toEvidencePath(metadataPath, `${label}.metadataPath`);
    if (hashFile(metadataAbsolutePath) !== metadataSha256) {
      fail(`${label}.metadataSha256 does not match its saved metadata bytes.`);
    }
    const expectedEvidence = evidence.entries.filter(
      (item) => item.viewport === viewport && item.role === scopeId && item.figmaNodeId === figmaNodeId
    );
    if (expectedEvidence.length !== 1) {
      fail(`${label} must have exactly one matching source-evidence record for ${viewport}/${scopeId}/${figmaNodeId}.`);
    }
    if (
      expectedEvidence[0].metadataPathValue !== metadataPath ||
      expectedEvidence[0].metadataSha256 !== metadataSha256
    ) {
      fail(`${label} metadataPath and metadataSha256 must exactly match its node-evidence record.`);
    }
    const pageRootEvidence = viewport === "pc" ? evidence.canonicalPc : evidence.pairedSp;
    if (!metadataRawContainsNodeId(pageRootEvidence.raw, figmaNodeId)) {
      fail(
        `${label}.figmaNodeId is not present in the saved ${viewport.toUpperCase()} page-root metadata bytes ` +
          `for ${pageRootNodeId}; scoped-root ancestry cannot be inferred.`
      );
    }
    const scopeKey = `${viewport}::${scopeId}`;
    if (scopeRootByViewportAndScope.has(scopeKey)) {
      fail(`${label} duplicates scoped root ${scopeKey}.`);
    }
    const nodeKey = `${viewport}::${figmaNodeId}`;
    if (scopeRootByViewportAndNode.has(nodeKey)) {
      fail(`${label} duplicates a scoped root node: ${nodeKey}.`);
    }
    const normalized = { scopeId, viewport, figmaNodeId, pageRootNodeId, pairedScopeRootNodeId };
    scopeRootByViewportAndScope.set(scopeKey, normalized);
    scopeRootByViewportAndNode.set(nodeKey, normalized);
  }

  for (const scopeId of SCOPED_NODE_MAP_SCOPE_IDS) {
    const pc = scopeRootByViewportAndScope.get(`pc::${scopeId}`);
    const sp = scopeRootByViewportAndScope.get(`sp::${scopeId}`);
    if (!pc || !sp) {
      fail(`node map.scopeRoots must contain exactly one PC and one SP root for ${scopeId}.`);
    }
    if (pc.pairedScopeRootNodeId !== sp.figmaNodeId || sp.pairedScopeRootNodeId !== pc.figmaNodeId) {
      fail(`node map.scopeRoots ${scopeId} PC/SP entries must name each other as pairedScopeRootNodeId.`);
    }
  }

  return {
    canonicalRootNodeId,
    pairedSpRootNodeId,
    scopeRootByViewportAndScope,
    scopeRootByViewportAndNode,
  };
}

// Figma子ノード単位のカバレッジ検査。
// component単位の検査（assertSpecCoversComponents）では、親のgapや中間wrapperのように
// componentに昇格していないFigmaノードの測定漏れを検出できないため、node mapで補う。
function assertNodeMapCoverage(nodeMap, spec, components, nodeEvidence, nodeEvidencePath, expectedFigmaFileKey) {
  const topology = validateScopedNodeMapTopology(nodeMap, nodeEvidence, nodeEvidencePath, expectedFigmaFileKey);

  // node-inventory: four scoped roots配下に実在するノードの全件。page-inventory と同じ考え方を1階層下へ適用する。
  // これが無いと「登録したノードが測られているか」しか検査できず、
  // そもそも登録しなかったノードは何も言われない。宣言したものだけが正しいという偏った証跡になる。
  const inventory = requireObject(nodeMap.inventory, "node map.inventory (every node under the root, so nothing can be silently left out)");
  requireString(inventory.source, "node map.inventory.source (how the node list was obtained, e.g. get_metadata)");
  const inventoryKeys = new Set();
  const inventoryScopeByNodeKey = new Map();
  for (const [index, entry] of requireArray(inventory.nodes, "node map.inventory.nodes").entries()) {
    const label = `node map.inventory.nodes[${index}]`;
    requireObject(entry, label);
    const figmaNodeId = requireString(entry.figmaNodeId, `${label}.figmaNodeId`);
    const viewport = requireString(entry.viewport, `${label}.viewport`);
    if (!["pc", "sp"].includes(viewport)) fail(`${label}.viewport must be "pc" or "sp".`);
    const scopeRootNodeId = requireString(entry.scopeRootNodeId, `${label}.scopeRootNodeId`);
    const scopeRoot = topology.scopeRootByViewportAndNode.get(`${viewport}::${scopeRootNodeId}`);
    if (!scopeRoot) {
      fail(`${label}.scopeRootNodeId must identify a declared ${viewport.toUpperCase()} scope root: ${scopeRootNodeId}.`);
    }
    const nodeKey = `${viewport}::${figmaNodeId}`;
    const existingScope = inventoryScopeByNodeKey.get(nodeKey);
    if (existingScope && existingScope !== scopeRootNodeId) {
      fail(`${label} assigns ${nodeKey} to multiple scope roots (${existingScope}, ${scopeRootNodeId}). Scoped inventories must not overlap.`);
    }
    inventoryScopeByNodeKey.set(nodeKey, scopeRootNodeId);
    const key = `${viewport}::${scopeRootNodeId}::${figmaNodeId}`;
    if (inventoryKeys.has(key)) fail(`${label} duplicates an existing inventory entry: ${key}`);
    inventoryKeys.add(key);
  }

  const entries = requireArray(nodeMap.nodes, "node map.nodes");
  const seen = new Set();
  const figmaNodeIds = new Set();
  const mappedSelectors = new Set();
  const tracedSelectors = new Set();
  const textSelectors = new Set();

  for (const [index, entry] of entries.entries()) {
    const label = `node map.nodes[${index}]`;
    requireObject(entry, label);
    const figmaNodeId = requireString(entry.figmaNodeId, `${label}.figmaNodeId`);
    const viewport = requireString(entry.viewport, `${label}.viewport`);
    if (!["pc", "sp"].includes(viewport)) fail(`${label}.viewport must be "pc" or "sp".`);
    const scopeRootNodeId = requireString(entry.scopeRootNodeId, `${label}.scopeRootNodeId`);
    if (!topology.scopeRootByViewportAndNode.has(`${viewport}::${scopeRootNodeId}`)) {
      fail(`${label}.scopeRootNodeId must identify a declared ${viewport.toUpperCase()} scope root: ${scopeRootNodeId}.`);
    }
    const status = requireString(entry.status, `${label}.status`);
    if (!NODE_MAP_STATUSES.has(status)) {
      fail(`${label}.status must be one of: mapped, figma-only, dom-only.`);
    }
    const key = `${viewport}::${scopeRootNodeId}::${figmaNodeId}`;
    if (seen.has(key)) fail(`${label} duplicates an existing entry: ${key}`);
    seen.add(key);
    figmaNodeIds.add(figmaNodeId);

    if (status === "mapped") {
      const selector = requireString(entry.selector, `${label}.selector is required when status is "mapped"`);
      mappedSelectors.add(selector);
      tracedSelectors.add(selector);
      // Figma上テキストであるノードは、文言が一致して初めて実装したことになる。
      // 幾何値だけをspecに書いて文言を書かない実装が、数値は全一致なのに
      // ラベルと注記が33箇所ずれたまま合格した（rules/corrections.md 2026-08-04）。
      if (entry.figmaNodeType !== undefined) {
        const nodeType = requireString(entry.figmaNodeType, `${label}.figmaNodeType`);
        if (!NODE_MAP_FIGMA_TYPES.has(nodeType)) {
          fail(`${label}.figmaNodeType must be one of: ${[...NODE_MAP_FIGMA_TYPES].join(", ")}`);
        }
        if (nodeType === "TEXT") textSelectors.add(selector);
      }
      continue;
    }
    // 未対応は理由を必須にする。「FigmaにあるがDOMにない」「DOMにあるがFigmaにない」の黙認を防ぐ。
    requireString(entry.reason, `${label}.reason is required when status is "${status}"`);
    if (status === "dom-only") {
      tracedSelectors.add(requireString(entry.selector, `${label}.selector is required when status is "dom-only"`));
    }
  }

  for (const viewport of ["pc", "sp"]) {
    if (!entries.some((entry) => entry.viewport === viewport)) {
      fail(`node map must cover both viewports independently. Missing: ${viewport}`);
    }
  }

  // 双方向に検査する。分類漏れ（実在するのに未登録）も、実在しないノードの登録も止める。
  const unclassified = [...inventoryKeys].filter((key) => !seen.has(key));
  if (unclassified.length > 0) {
    fail(
      `node map does not classify every Figma node within the declared scoped roots. ` +
        `Each one must be mapped, figma-only, or dom-only — leaving it out hides it from the evidence. ` +
        `Missing: ${unclassified.slice(0, 20).join(", ")}${unclassified.length > 20 ? ` (and ${unclassified.length - 20} more)` : ""}`
    );
  }
  const notInInventory = [...seen].filter((key) => !inventoryKeys.has(key));
  if (notInInventory.length > 0) {
    fail(
      `node map registers nodes that are not in the inventory (invented or stale): ` +
        `${notInInventory.slice(0, 20).join(", ")}${notInInventory.length > 20 ? ` (and ${notInInventory.length - 20} more)` : ""}`
    );
  }

  for (const scopeRoot of topology.scopeRootByViewportAndScope.values()) {
    const rootKey = `${scopeRoot.viewport}::${scopeRoot.figmaNodeId}::${scopeRoot.figmaNodeId}`;
    if (!inventoryKeys.has(rootKey)) {
      fail(
        `node map inventory must include the declared ${scopeRoot.viewport.toUpperCase()} ${scopeRoot.scopeId} scope root ` +
          `${scopeRoot.figmaNodeId} within itself.`
      );
    }
    if (!seen.has(rootKey)) {
      fail(
        `node map nodes must classify the declared ${scopeRoot.viewport.toUpperCase()} ${scopeRoot.scopeId} scope root ` +
          `${scopeRoot.figmaNodeId} within itself.`
      );
    }
  }

  const missingComponents = components.filter((component) => !figmaNodeIds.has(component.figmaNodeId));
  if (missingComponents.length > 0) {
    fail(
      `node map is missing Figma nodes declared in the component manifest: ${missingComponents
        .map((component) => `${component.elementId}(${component.figmaNodeId})`)
        .join(", ")}`
    );
  }

  const specSelectors = collectSpecSelectors(spec);
  const unmeasured = [...mappedSelectors].filter(
    (selector) => !specSelectors.some((specSelector) => selectorCoveredBy(specSelector, selector))
  );
  if (unmeasured.length > 0) {
    fail(`Every mapped Figma node must be measured by at least one spec element: ${unmeasured.join(", ")}`);
  }

  const untraced = specSelectors.filter(
    (specSelector) => ![...tracedSelectors].some((traced) => selectorCoveredBy(specSelector, traced))
  );
  if (untraced.length > 0) {
    fail(`Every spec element must trace to a node map entry (mapped or dom-only): ${untraced.join(", ")}`);
  }

  // Figma上テキストのノードは、幾何値が合っていても文言が違えば実装できていない。
  // node map が TEXT と宣言した対応先は、spec で text を検証する。
  // 件数・日付のように実データで変わる文言は text で固定できない。その場合だけ textPattern（正規表現）を
  // 認めるが、逃げ道にしないため「なぜ動的か」の宣言（textPatternReason）を必須にする。
  const assertsText = new Set();
  const patternWithoutReason = [];
  const bothTextAndPattern = [];
  for (const viewport of spec.viewports || []) {
    for (const element of viewport.elements || []) {
      const hasText = typeof element.text === "string";
      const hasPattern = typeof element.textPattern === "string";
      if (hasText || hasPattern) assertsText.add(element.sel);
      if (hasText && hasPattern) bothTextAndPattern.push(element.sel);
      if (!hasPattern) continue;
      try {
        new RegExp(element.textPattern);
      } catch (error) {
        fail(`SPEC FAIL: ${element.sel} textPattern is not a valid regular expression: ${error.message}`);
      }
      if (typeof element.textPatternReason !== "string" || element.textPatternReason.trim().length < 20) {
        patternWithoutReason.push(element.sel);
      }
    }
  }
  if (bothTextAndPattern.length > 0) {
    fail(
      `SPEC FAIL: these elements declare both "text" and "textPattern", so it is unclear whether the wording is fixed ` +
        `or data-driven: ${bothTextAndPattern.join(", ")}`
    );
  }
  if (patternWithoutReason.length > 0) {
    fail(
      `SPEC FAIL: "textPattern" replaces an exact wording check, so it needs textPatternReason (>=20 chars) stating ` +
        `why the wording is data-driven and what the Figma evidence shows: ${patternWithoutReason.join(", ")}`
    );
  }
  const textWithoutAssertion = [...textSelectors].filter((selector) => !assertsText.has(selector));
  if (textWithoutAssertion.length > 0) {
    fail(
      `SPEC FAIL: these selectors map to Figma TEXT nodes but the spec never checks their wording. ` +
        `Geometry can match while the wording differs, and that ships as "verified". Add a "text" expectation ` +
        `(or "textPattern" + "textPatternReason" if the wording is data-driven) for: ${textWithoutAssertion.join(", ")}`
    );
  }
}

// 「編集前ゲート」の実効化。
// preflight が変更対象のソース状態を基準化しないと、先に編集してから preflight を実行しても全工程が通る。
// gitの作業ツリー状態で「preflight時点で既に編集されていたか」を判定する。
function runGitLines(gitArgs, label) {
  const result = spawnSync("git", gitArgs, { cwd: repoRoot, encoding: "utf8", shell: false });
  if (result.error) fail(`SPEC FAIL: git could not start (${label}): ${result.error.message}`);
  if (result.status !== 0) {
    fail(`SPEC FAIL: git ${gitArgs.join(" ")} failed (${label}).${result.stderr ? `\n${result.stderr.trim()}` : ""}`);
  }
  const output = result.stdout.trim();
  if (output === "") return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function assertGitRepositoryRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: repoRoot, encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) {
    fail("SPEC FAIL: figma-gate requires a Git working tree to prove that edits happened after preflight.");
  }
  const top = result.stdout.trim().replace(/\\/g, "/");
  if (!top) fail("SPEC FAIL: figma-gate requires a Git working tree to prove that edits happened after preflight.");
  // Windowsはドライブレターの大小が揺れる（cwdは c:\ 、git は C:\ を返すことがある）。
  // 大小だけの差でFAILさせない。Linux/macOSはパスが大小を区別するため比較を変えない。
  const normalizePath = (value) => {
    const normalized = resolve(value).replace(/\\/g, "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  if (normalizePath(top) !== normalizePath(repoRoot)) {
    fail(`SPEC FAIL: figma-gate must run at the Git repository root. repoRoot=${repoRoot} gitRoot=${resolve(top)}`);
  }
}

// P-3 comparison records the identity observed by the real preflight. This adds
// evidence only; existing preflight eligibility remains unchanged.
function gitIdentityAtPreflight() {
  assertGitRepositoryRoot();
  const readOid = (args, label) => {
    const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", shell: false });
    const value = result.status === 0 ? result.stdout.trim().toLowerCase() : "";
    if (!/^[a-f0-9]{40,64}$/.test(value)) fail(`SPEC FAIL: could not record Git ${label} at preflight.`);
    return value;
  };
  return {
    worktreeRoot: resolve(repoRoot).replace(/\\/g, "/"),
    commit: readOid(["rev-parse", "HEAD"], "HEAD"),
    tree: readOid(["rev-parse", "HEAD^{tree}"], "HEAD tree"),
  };
}

function gitDirtyPaths() {
  const paths = new Set();
  for (const gitArgs of [
    ["diff", "--name-only", "--no-renames"],
    ["diff", "--cached", "--name-only", "--no-renames"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    for (const path of runGitLines(gitArgs, "dirty paths")) paths.add(path);
  }
  return paths;
}

// 完了済みscopeが残した検証済み内容のハッシュを集める。
// 未コミットのまま次のscopeへ進むのは通常の運用であり、その dirty は
// 「編集してからゲートを通す」不正とは性質が違う。両者を機械的に区別できないと
// preEditApproval（オーナー承認の抜け穴）を毎回使うことになり、ゲートが形骸化する。
function closedScopeFileHashes() {
  const checkpointsRoot = resolve(repoRoot, "MyBrain/verify/checkpoints");
  const byPath = new Map();
  if (!existsSync(checkpointsRoot)) return byPath;
  for (const entry of readdirSync(checkpointsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const reportPath = resolve(checkpointsRoot, entry.name, "close-report.json");
    if (!existsSync(reportPath)) continue;
    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch {
      continue;
    }
    // 合格していない証跡は根拠にしない。
    const result = report.result;
    if (!result || result.specFail !== 0 || result.layoutFail !== 0 || result.visualFail !== 0) continue;
    const hashes = report.fileHashes;
    if (!hashes || typeof hashes !== "object") continue;
    for (const [relativePath, sha256] of Object.entries(hashes)) {
      if (typeof sha256 !== "string") continue;
      if (!byPath.has(relativePath)) byPath.set(relativePath, new Map());
      byPath.get(relativePath).set(sha256, report.manifestId || entry.name);
    }
  }
  return byPath;
}

function assertTargetsUneditedBeforePreflight(validated) {
  assertGitRepositoryRoot();
  const dirty = gitDirtyPaths();
  const generated = new Set(validated.generatedTargets);
  const approved = new Set(validated.preEditApproval ? validated.preEditApproval.paths : []);
  const closedHashes = closedScopeFileHashes();

  // dirty の中身が完了済みscopeの合格時点と一致するなら、未検証の編集ではないので承認は要らない。
  const carriedOver = new Map();
  for (const { relativePath, absolutePath } of validated.changeTargets) {
    if (!dirty.has(relativePath) || generated.has(relativePath)) continue;
    const candidates = closedHashes.get(relativePath);
    if (!candidates) continue;
    const owner = candidates.get(hashFile(absolutePath));
    if (owner) carriedOver.set(relativePath, owner);
  }

  const violations = validated.changeTargets
    .map(({ relativePath }) => relativePath)
    .filter(
      (relativePath) =>
        dirty.has(relativePath) && !generated.has(relativePath) && !approved.has(relativePath) && !carriedOver.has(relativePath)
    );

  if (violations.length > 0) {
    fail(
      `SPEC FAIL: these change targets were already edited before preflight: ${violations.join(", ")}.\n` +
        `The gate must run before the first source edit. Revert them and re-run preflight, declare build output in ` +
        `manifest.scope.generatedTargets, or record explicit owner approval in manifest.scope.preEditApproval.\n` +
        `If the change is the verified output of an earlier closed scope, close that scope so its close-report records ` +
        `fileHashes; preflight then accepts the carried-over content without an approval.`
    );
  }

  for (const [relativePath, owner] of carriedOver) {
    pass(`Pre-edit: ${relativePath} matches the verified output of closed scope ${owner} (no approval needed)`);
  }

  return {
    capturedAt: new Date().toISOString(),
    dirtyPaths: [...dirty].sort(),
    // 引き継ぎと判定した根拠を証跡に残す。どのscopeの成果と一致したかを後から追える。
    carriedOverFromClosedScopes: Object.fromEntries([...carriedOver.entries()].sort()),
    changeTargetStatus: Object.fromEntries(
      validated.changeTargets.map(({ relativePath }) => {
        if (!dirty.has(relativePath)) return [relativePath, "clean"];
        if (generated.has(relativePath)) return [relativePath, "generated-dirty"];
        if (carriedOver.has(relativePath)) return [relativePath, "carried-over-from-closed-scope"];
        return [relativePath, "approved-dirty"];
      })
    ),
  };
}

// 必読規則は全層で約2,000行あり、全文の任意読みに依存すると守られない。
// preflight が「今回のscopeに効く規則」だけを列挙し、読む量を変更内容に比例させる。
// パスはプレイブック相対で出力する（環境固有の絶対パスを配布物へ埋めない）。
const RULE_INDEX = [
  { when: "always", refs: ["figma-to-code/rules/figma-spec-pipeline.md（フェーズ0の固定チェックリスト / フェーズ3Bの実行順）", "figma-to-code/rules/figma-scope-lock.md"] },
  { when: "scss", refs: ["web-development/rules/scss.md", "web-development/rules/css-values.md", "web-development/rules/breakpoints.md", "web-development/rules/browser-compatibility.md"] },
  { when: "html", refs: ["web-development/rules/w3c-validation.md", "web-development/rules/accessibility.md"] },
  { when: "js", refs: ["web-development/rules/browser-compatibility.md"] },
  { when: "asset", refs: ["figma-to-code/rules/figma-image-export.md"] },
  { when: "painted", refs: ["figma-to-code/spec/05-assets.md"] },
];

// 測定幅の規約。specの宣言を唯一の正とし、実測と撮影で同じ条件を使う。
function readSpecScrollbars(validated) {
  const spec = readJson(validated.specAbsolutePath, "Spec");
  const scrollbars = spec.viewportPolicy?.scrollbars;
  if (scrollbars !== "hidden" && scrollbars !== "visible") {
    fail('SPEC FAIL: spec.viewportPolicy.scrollbars must be "hidden" or "visible". Declare how the measured viewport width treats scrollbars.');
  }
  return scrollbars;
}

function applicableRuleRefs(validated) {
  const kinds = new Set(["always"]);
  for (const { relativePath } of validated.changeTargets) {
    if (relativePath.endsWith(".scss")) kinds.add("scss");
    if (/\.(php|html?)$/i.test(relativePath)) kinds.add("html");
    if (/\.(m?js|cjs)$/i.test(relativePath)) kinds.add("js");
    if (/\.(svg|png|jpe?g|webp|avif)$/i.test(relativePath)) kinds.add("asset");
  }
  if (validated.components.some((component) => component.painted)) kinds.add("painted");

  const refs = new Set();
  for (const entry of RULE_INDEX) {
    if (kinds.has(entry.when)) entry.refs.forEach((ref) => refs.add(ref));
  }
  return [...refs];
}

// 工程と停止条件の正本は Markdown 側（WORKFLOW.md / rules/figma-spec-pipeline.md）にある。
// gateが自前の表を持つと必ずそこが古くなるため（2026-08-24 doc-command-audit の教訓：
// 正解集合は実装から導出する）、ここでは正本のMarkdownから抽出する。抽出できない場合は
// 「工程を出力しないまま通す」より落とすほうが安全なので fail-closed とする。
const PLAYBOOK_START_GATE_HEADING = "## 着手前ゲート";
const PLAYBOOK_STOP_HEADING = "## 停止・未確認として報告する条件";
const PLAYBOOK_CHECKLIST_ANCHOR = "固定チェックリスト";
const PLAYBOOK_PIPELINE_RULE = "rules/figma-spec-pipeline.md";

function readPlaybookDocument(relativePath) {
  const absolute = resolve(FIGMA_TO_CODE_ROOT, relativePath);
  if (!existsSync(absolute)) {
    fail(
      `SPEC FAIL: playbook document not found: ${absolute}. ` +
        "工程と停止条件の正本を読めないため開始できない。FIGMA_TO_CODE_ROOT で正本の位置を指定する。"
    );
  }
  return readFileSync(absolute, "utf8");
}

// 見出し直下から次の同レベル見出しまでを返す。見出しは日付注記が付くことがあるので前方一致で探す。
function playbookSectionLines(markdown, headingPrefix, label) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (start === -1) {
    fail(`SPEC FAIL: ${label} の節「${headingPrefix}」が正本に見つからない。工程の正本が移動・改名した可能性がある。`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function readStartGatePoints() {
  const lines = playbookSectionLines(readPlaybookDocument("WORKFLOW.md"), PLAYBOOK_START_GATE_HEADING, "着手前ゲート");
  const points = lines.filter((line) => /^\d+\.\s+\S/.test(line)).map((line) => line.trim());
  if (points.length === 0) {
    fail(`SPEC FAIL: 着手前ゲートの番号付き項目を抽出できない（${PLAYBOOK_START_GATE_HEADING}）。`);
  }
  return points;
}

function readStopConditions() {
  const lines = playbookSectionLines(readPlaybookDocument(PLAYBOOK_PIPELINE_RULE), PLAYBOOK_STOP_HEADING, "停止条件");
  const conditions = lines.filter((line) => /^-\s+\S/.test(line)).map((line) => line.replace(/^-\s+/, "").trim());
  if (conditions.length === 0) {
    fail(`SPEC FAIL: 停止条件の箇条書きを抽出できない（${PLAYBOOK_STOP_HEADING}）。`);
  }
  return conditions;
}

function readPhaseChecklist() {
  const markdown = readPlaybookDocument(PLAYBOOK_PIPELINE_RULE);
  const anchor = markdown.indexOf(PLAYBOOK_CHECKLIST_ANCHOR);
  if (anchor === -1) {
    fail(`SPEC FAIL: 「${PLAYBOOK_CHECKLIST_ANCHOR}」が ${PLAYBOOK_PIPELINE_RULE} に見つからない。`);
  }
  const fenceOpen = markdown.indexOf("```text", anchor);
  if (fenceOpen === -1) {
    fail(`SPEC FAIL: 「${PLAYBOOK_CHECKLIST_ANCHOR}」直後の text ブロックが見つからない。`);
  }
  const bodyStart = fenceOpen + "```text".length;
  const fenceClose = markdown.indexOf("```", bodyStart);
  if (fenceClose === -1) {
    fail(`SPEC FAIL: 「${PLAYBOOK_CHECKLIST_ANCHOR}」の text ブロックが閉じていない。`);
  }
  const items = markdown
    .slice(bodyStart, fenceClose)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("[ ]"));
  if (items.length === 0) {
    fail(`SPEC FAIL: 「${PLAYBOOK_CHECKLIST_ANCHOR}」から項目を抽出できない。`);
  }
  return items;
}

// 着手時点の入口。manifestもspecもまだ無い段階で呼ぶため、引数を取らない。
// これはゲートではなく工程の出力であり、編集の許可を与えない。
function start() {
  assertWorkflowEnvironment();
  const gatePoints = readStartGatePoints();
  const checklist = readPhaseChecklist();
  const stopConditions = readStopConditions();

  console.log("FIGMA GATE: start — 着手前に読む工程と停止条件（正本から抽出。これはゲートではない）");
  console.log(`\n[1] 着手前ゲート（WORKFLOW.md）— この${gatePoints.length}点を報告するまでソースを1行も編集しない`);
  for (const point of gatePoints) console.log(`  ${point}`);
  console.log(`\n[2] フェーズ0の固定チェックリスト（${checklist.length}項目）— 全項目を満たすまで「完了」「Figmaどおり」と報告しない`);
  for (const item of checklist) console.log(`  ${item}`);
  console.log(`\n[3] 停止・未確認として報告する条件（${stopConditions.length}件）— どれかに当たったら進めない`);
  for (const condition of stopConditions) console.log(`  - ${condition}`);
  console.log("\n[4] 次に実行するコマンド");
  console.log("  node C:/AI/figma-to-code/tools/workflow-preflight.mjs --assert-local");
  console.log("  npm run figma:gate -- preflight <manifest.json> --implementation-actor <actor> --implementation-context-id <context>");
  console.log("\nFIGMA GATE: start は工程を出力しただけで、preflight の代わりにならない。編集はまだ許可されていない。");
}

function runCapture(program, programArgs, label, failureClass = null) {
  const result = spawnSync(program, programArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    fail(`${failureClass ? `${failureClass} FAIL: ` : ""}${label} failed.${result.stderr ? `\n${result.stderr.trim()}` : ""}`);
  }
  return result.stdout;
}

function indexCaptureSummary(summary, expectedJobs, label) {
  requireObject(summary, label);
  if (summary.version !== 1) fail(`${label}.version must be 1.`);
  const browserSessionId = requireString(summary.browserSessionId, `${label}.browserSessionId`);
  const browserPid = summary.browserPid;
  if (!Number.isInteger(browserPid) || browserPid <= 0) fail(`${label}.browserPid must be a positive integer.`);
  const chromeMode = requireString(summary.chromeMode, `${label}.chromeMode`);
  const captures = Array.isArray(summary.captures) ? summary.captures : (() => { fail(`${label}.captures must be an array.`); })();
  if (captures.length !== expectedJobs.length) fail(`${label}.captures length differs from requested capture jobs.`);

  const expectedById = new Map(expectedJobs.map((job) => [job.id, job]));
  const indexed = new Map();
  for (const [index, capture] of captures.entries()) {
    requireObject(capture, `${label}.captures[${index}]`);
    const id = requireString(capture.id, `${label}.captures[${index}].id`);
    const expected = expectedById.get(id);
    if (!expected) fail(`${label} contains an unexpected capture: ${id}.`);
    if (indexed.has(id)) fail(`${label} contains duplicate capture: ${id}.`);
    if (requireString(capture.selector, `${label}.captures[${index}].selector`) !== expected.selector) {
      fail(`${label} selector differs from the requested job: ${id}.`);
    }
    if (requireString(capture.viewport, `${label}.captures[${index}].viewport`) !== expected.viewport) {
      fail(`${label} viewport differs from the requested job: ${id}.`);
    }
    if (Number(capture.viewportWidth) !== expected.viewportWidth) {
      fail(`${label} viewport width differs from the requested job: ${id}.`);
    }
    const outputPath = resolve(requireString(capture.outputPath, `${label}.captures[${index}].outputPath`));
    if (outputPath !== expected.outputPath) fail(`${label} output path differs from the requested job: ${id}.`);
    if (requireString(capture.browserSessionId, `${label}.captures[${index}].browserSessionId`) !== browserSessionId) {
      fail(`${label} split the checkpoint across browser sessions: ${id}.`);
    }
    if (Number(capture.browserPid) !== browserPid) fail(`${label} split the checkpoint across browser processes: ${id}.`);
    indexed.set(id, { ...capture, outputPath });
  }
  for (const job of expectedJobs) {
    if (!indexed.has(job.id)) fail(`${label} is missing the requested capture: ${job.id}.`);
  }
  return { browserSessionId, browserPid, chromeMode, captures: indexed };
}

function indexGateLayoutEvidence(summary, captureResult, label) {
  const layout = requireObject(summary.layout, `${label}.layout`);
  if (layout.status !== "PASS") fail(`${label}.layout.status must be PASS.`);
  if (!Number.isInteger(layout.passCount) || layout.passCount < 0) fail(`${label}.layout.passCount must be a non-negative integer.`);
  if (!Number.isInteger(layout.failCount) || layout.failCount !== 0) fail(`${label}.layout.failCount must be 0.`);
  if (requireString(layout.browserSessionId, `${label}.layout.browserSessionId`) !== captureResult.browserSessionId) {
    fail(`${label} layout verification used a CDP session different from the Q-09 PC/SP batch.`);
  }
  if (Number(layout.browserPid) !== captureResult.browserPid) {
    fail(`${label} layout verification used a Chrome process different from the Q-09 PC/SP batch.`);
  }
  return {
    passCount: layout.passCount,
    failCount: layout.failCount,
    browserSessionId: captureResult.browserSessionId,
    browserPid: captureResult.browserPid,
  };
}
function indexGateVerificationEvidence(summary, kind, expectedConfigPath, expectedReportPath, captureResult) {
  const entry = requireObject(summary[kind], `gate browser batch.${kind}`);
  const reportPath = resolve(requireString(entry.reportPath, `gate browser batch.${kind}.reportPath`));
  if (reportPath !== expectedReportPath) {
    fail(`gate browser batch ${kind} report path differs from the requested path.`);
  }
  if (requireString(entry.browserSessionId, `gate browser batch.${kind}.browserSessionId`) !== captureResult.browserSessionId) {
    fail(`gate browser batch ${kind} used a CDP session different from the Q-09 PC/SP batch.`);
  }
  if (Number(entry.browserPid) !== captureResult.browserPid) {
    fail(`gate browser batch ${kind} used a Chrome process different from the Q-09 PC/SP batch.`);
  }
  if (!existsSync(reportPath)) fail(`gate browser batch ${kind} report is missing: ${reportPath}`);
  const report = readJson(reportPath, `${kind} report`);
  if (!Array.isArray(report.failures)) fail(`${kind} report has no failures array: ${reportPath}`);
  if (report.failures.length > 0) fail(`SPEC FAIL: ${kind} report contains ${report.failures.length} failure(s): ${reportPath}`);
  if (report.browserSessionId !== captureResult.browserSessionId || Number(report.browserPid) !== captureResult.browserPid) {
    fail(`${kind} report was not produced by the Q-09 PC/SP batch CDP session.`);
  }
  return {
    configPath: expectedConfigPath,
    configSha256: hashFile(resolve(repoRoot, expectedConfigPath)),
    reportPath,
    reportSha256: hashFile(reportPath),
    browserSessionId: captureResult.browserSessionId,
    browserPid: captureResult.browserPid,
    humanReview: kind === "accessibility" && Array.isArray(report.humanReview) ? report.humanReview : [],
  };
}

function assertGateVerificationEvidence(elementId, kind, evidence, validated, batchEvidence) {
  const item = requireObject(evidence, `checkpoint ${kind} evidence (${elementId})`);
  const expectedConfigPath = kind === "accessibility" ? validated.accessibilityPath : validated.motionPath;
  if (requireString(item.configPath, `checkpoint ${kind} config path (${elementId})`) !== expectedConfigPath) {
    fail(`Checkpoint ${kind} config differs from the frozen manifest: ${elementId}`);
  }
  assertRecordedFile(elementId, `${kind} config`, resolve(repoRoot, item.configPath), item.configSha256);
  assertRecordedFile(elementId, `${kind} report`, item.reportPath, item.reportSha256);
  const evidenceSessionId = requireString(item.browserSessionId, `checkpoint ${kind} browser session (${elementId})`);
  if (evidenceSessionId !== requireString(batchEvidence.browserSessionId, `checkpoint browser batch session (${elementId})`)) {
    fail(`Checkpoint ${kind} evidence is not tied to the Q-09/Q-13/Q-08 browser batch: ${elementId}`);
  }
  if (Number(item.browserPid) !== Number(batchEvidence.browserPid)) {
    fail(`Checkpoint ${kind} evidence used a Chrome process different from the Q-09/Q-13/Q-08 browser batch: ${elementId}`);
  }
  if (kind === "accessibility") {
    assertRecordedFile(elementId, "axe source", validated.axeSourceAbsolutePath, hashFile(validated.axeSourceAbsolutePath));
  }
}

function assertFrozenResponsiveHtmlInputs(state, validated, phase) {
  const frozen = requireObject(state.responsiveHtml, "Active Figma gate state responsiveHtml (re-run preflight)");
  const expectedKeys = new Set(["sourceFiles", "deferredSourceFiles"]);
  const unknownKeys = Object.keys(frozen).filter((key) => !expectedKeys.has(key));
  const missingKeys = [...expectedKeys].filter((key) => !Object.hasOwn(frozen, key));
  if (unknownKeys.length > 0 || missingKeys.length > 0) {
    fail(
      "Active Figma gate state responsiveHtml must contain exactly sourceFiles and deferredSourceFiles; re-run preflight." +
        `${missingKeys.length > 0 ? ` Missing: ${missingKeys.join(", ")}.` : ""}` +
        `${unknownKeys.length > 0 ? ` Unknown: ${unknownKeys.join(", ")}.` : ""}`
    );
  }
  const actual = {
    sourceFiles: frozen.sourceFiles,
    deferredSourceFiles: frozen.deferredSourceFiles,
  };
  for (const [key, expected] of Object.entries({
    sourceFiles: validated.responsiveHtmlSourceFiles,
    deferredSourceFiles: validated.deferredResponsiveHtmlSourceFiles,
  })) {
    if (!Array.isArray(actual[key]) || actual[key].some((value) => typeof value !== "string")) {
      fail(`Active Figma gate state responsiveHtml.${key} must be a string array; re-run preflight.`);
    }
    if (actual[key].length !== expected.length || actual[key].some((value, index) => value !== expected[index])) {
      fail(`Responsive HTML ${key} differs from the preflight-frozen state (${phase} rejected); re-run preflight.`);
    }
  }
}

function assertFrozenInputs(state, validated, absoluteManifestPath, phase) {
  assertFrozenResponsiveHtmlInputs(state, validated, phase);
  const frozen = [
    ["manifestSha256", absoluteManifestPath, "gate manifest"],
    ["specSha256", validated.specAbsolutePath, "spec"],
    ["componentsSha256", validated.componentsAbsolutePath, "component manifest"],
    ["mappingSha256", validated.mappingAbsolutePath, "DOM mapping"],
    ["nodeMapSha256", validated.nodeMapAbsolutePath, "Figma node map"],
    ["componentDecisionSha256", validated.componentDecisionAbsolutePath, "component decision manifest"],
    ["nodeEvidenceSha256", validated.nodeEvidencePath, "Figma node evidence"],
    ["layerEvidenceSha256", validated.layerEvidencePath, "Figma layer evidence"],
    ["accessibilitySha256", validated.accessibilityAbsolutePath, "accessibility config"],
    ["motionSha256", validated.motionAbsolutePath, "motion config"],
    ["axeSourceSha256", validated.axeSourceAbsolutePath, "axe source"],
    ["startDeclarationSha256", validated.startDeclaration.absolutePath, "start declaration"],
  ];
  if (validated.correctionReceipt) {
    frozen.push(["correctionReceiptSha256", validated.correctionReceipt.absolutePath, "owner correction receipt"]);
  }
  for (const [key, filePath, label] of frozen) {
    const expectedHash = requireString(state[key], `Active gate state ${key} (re-run preflight)`);
    if (hashFile(filePath) !== expectedHash) {
      fail(
        `${label} changed after preflight (${phase} rejected). Plan inputs are frozen at preflight; re-run preflight to change them.`
      );
    }
  }
}

function requireFrozenPreflight(manifestPath, phase) {
  const absoluteManifestPath = resolve(repoRoot, requireString(manifestPath, "manifest path"));
  const state = readActiveState(absoluteManifestPath, "Figma gate");
  if (state.phase !== "preflight" || state.manifestPath !== absoluteManifestPath) {
    fail(`${phase} requires an active preflight state for the same manifest.`);
  }
  const implementationIdentity = requireActiveImplementationIdentity(state, phase);
  assertVerifierRuntimeUnchanged(state, phase);
  const manifest = readExecutionJson(absoluteManifestPath, "Manifest");
  const validated = validateManifest(manifest, phase, implementationIdentity);
  assertFrozenInputs(state, validated, absoluteManifestPath, phase);
  return { absoluteManifestPath, state, validated, implementationIdentity };
}

// The gate itself measures, captures, and compares each checkpoint. It does not accept self-reported evidence.
//   1. Generate a filtered spec and run CDP layout verification.
//   2. Capture browser output for painted elements by viewport.
//   3. Compare each capture with the preflight-frozen Figma reference image.
//   4. Recompute the pixel diff and enforce the component threshold.
function checkpoint(manifestPath, elementIdArg, { finalRecheck = false, release = null } = {}) {
  const absoluteManifestPath = resolve(repoRoot, requireString(manifestPath, "manifest path"));
  const state = readActiveState(absoluteManifestPath, "Figma gate");
  const expectedStatePhase = release ? "closed" : "preflight";
  if (state.phase !== expectedStatePhase || state.manifestPath !== absoluteManifestPath) {
    fail(`${release ? "Release checkpoints" : "Checkpoints"} require an active ${expectedStatePhase} state for the same manifest.`);
  }
  const implementationIdentity = requireActiveImplementationIdentity(state, release ? "release-checkpoint" : "checkpoint");
  assertVerifierRuntimeUnchanged(state, release ? "release-checkpoint" : "checkpoint");

  const manifest = readExecutionJson(absoluteManifestPath, "Manifest");
  const validated = validateManifest(manifest, release ? "release-check" : "checkpoint", implementationIdentity);
  assertFrozenInputs(state, validated, absoluteManifestPath, release ? "release-check" : "checkpoint");
  const verifyUrl = release ? release.publicUrl : validated.verifyUrl;
  const checkpointKey = release ? "releaseCheckpoints" : "checkpoints";

  const elementId = requireString(elementIdArg, "elementId");
  if (!finalRecheck) {
    assertCheckpointIsCurrent(manifestPath, implementationIdentity, elementId);
  }
  const component = validated.components.find((candidate) => candidate.elementId === elementId);
  if (!component) {
    fail(`elementId is not in the component manifest: ${elementId}`);
  }

  const stateWithLearningMetrics = recordLearningCheckpointAttempt(state, component, { finalRecheck, release });
  if (!release) writeState(stateWithLearningMetrics);

  // 忠実度ベンチマーク（P-3）: この試行の識別情報を先に持たせ、fail() 時に分類ごと記録させる。
  // release-check は公開後の照合であり初回実装の忠実度ではないため対象外にする。
  if (!release) {
    const attemptMetricKey = finalRecheck ? "finalRecheckViewportRuns" : "directViewportRuns";
    const attemptRuns = (stateWithLearningMetrics.learningMetrics || {})[attemptMetricKey] || {};
    const componentRuns = Object.values(attemptRuns[elementId] || {}).map((value) => Number(value) || 0);
    pendingBenchmarkAttempt = {
      elementId,
      viewports: [...component.viewports],
      painted: component.painted,
      attempt: componentRuns.length > 0 ? Math.max(...componentRuns) : 1,
      finalRecheck,
    };
  }

  const checkpointDirectory = resolve(repoRoot, "MyBrain/verify/checkpoints", validated.id);
  mkdirSync(checkpointDirectory, { recursive: true });

  // Q-09のPC/SPレイアウト・撮影、Q-13、Q-08を一つのCDP sessionで実行する。
  // 実行器を別プロセスで順に呼ぶとChromeが分かれ、状態・描画・viewport条件を後付けで
  // 結び付けるだけになるため、gate-browser-batchだけがChromeを起動する。
  const spec = readJson(validated.specAbsolutePath, "Spec");
  const filteredViewports = [];
  const coveredClasses = new Set();
  const viewportWidths = {};
  for (const viewport of requireArray(spec.viewports, "spec.viewports")) {
    const elements = requireArray(viewport.elements, "spec.viewports[].elements").filter((element) =>
      selectorCoveredBy(requireString(element.sel, "spec.viewports[].elements[].sel"), component.selector)
    );
    if (elements.length > 0) {
      filteredViewports.push({ width: viewport.width, elements });
      const cls = widthClass(viewport.width);
      coveredClasses.add(cls);
      if (!(cls in viewportWidths)) viewportWidths[cls] = viewport.width;
    }
  }
  const unmeasurable = component.viewports.filter((viewport) => !coveredClasses.has(viewport));
  if (unmeasurable.length > 0) {
    fail(`SPEC FAIL: checkpoint ${elementId} has no measurable elements for viewport(s): ${unmeasurable.join(", ")}.`);
  }
  const filteredSpecPath = resolve(checkpointDirectory, `${elementId}-spec.json`);
  writeFileSync(
    filteredSpecPath,
    `${JSON.stringify({
      url: verifyUrl,
      tolerance: spec.tolerance ?? CHECKPOINT_RECT_TOLERANCE_PX,
      viewportPolicy: spec.viewportPolicy,
      viewports: filteredViewports,
    }, null, 2)}\n`,
    "utf8"
  );

  const captureJobs = component.painted
    ? component.viewports.map((viewport) => {
        const browserImagePath = resolve(checkpointDirectory, `${elementId}-browser-${viewport}.png`);
        return {
          id: `${elementId}:${viewport}`,
          selector: component.selector,
          viewport,
          viewportWidth: viewportWidths[viewport],
          outputPath: relative(repoRoot, browserImagePath).replace(/\\/g, "/"),
        };
      })
    : [];
  const expectedCaptureJobs = captureJobs.map((job) => ({ ...job, outputPath: resolve(repoRoot, job.outputPath) }));
  const captureJobsPath = resolve(checkpointDirectory, `${elementId}-capture-jobs.json`);
  const batchJobPath = resolve(checkpointDirectory, `${elementId}-browser-batch.json`);
  const batchSummaryPath = resolve(checkpointDirectory, `${elementId}-browser-batch-summary.json`);
  const accessibilityReportPath = resolve(checkpointDirectory, `${elementId}-accessibility.json`);
  const motionReportPath = resolve(checkpointDirectory, `${elementId}-motion.json`);
  const captureDocument = {
    version: 1,
    url: verifyUrl,
    scrollbars: readSpecScrollbars(validated),
    jobs: captureJobs,
  };
  writeFileSync(captureJobsPath, `${JSON.stringify(captureDocument, null, 2)}\n`, "utf8");
  const p3Hermetic = process.env.FIGMA_P3_HERMETIC_PROVIDER === "1";
  const batchJob = {
    version: 1,
    url: verifyUrl,
    ...(p3Hermetic ? {
      checkpointElementId: elementId,
      preflightId: requireString(stateWithLearningMetrics.preflightId, "active state preflightId"),
      p3Hermetic: true,
    } : {}),
    scrollbars: readSpecScrollbars(validated),
    layout: { specPath: relative(repoRoot, filteredSpecPath).replace(/\\/g, "/") },
    capture: captureDocument,
    accessibility: {
      configPath: validated.accessibilityPath,
      reportPath: relative(repoRoot, accessibilityReportPath).replace(/\\/g, "/"),
    },
    motion: {
      configPath: validated.motionPath,
      reportPath: relative(repoRoot, motionReportPath).replace(/\\/g, "/"),
    },
  };
  writeFileSync(batchJobPath, `${JSON.stringify(batchJob, null, 2)}\n`, "utf8");
  runCapture(
    "node",
    [
      "MyBrain/verify/gate-browser-batch.mjs",
      relative(repoRoot, batchJobPath).replace(/\\/g, "/"),
      relative(repoRoot, batchSummaryPath).replace(/\\/g, "/"),
    ],
    `checkpoint Q-09/Q-13/Q-08 browser batch (${elementId} / PC+SP)`
  );
  assertFrozenInputs(stateWithLearningMetrics, validated, absoluteManifestPath, release ? "release-check" : "checkpoint");
  const batchSummary = readJson(batchSummaryPath, `gate browser batch summary (${elementId})`);
  if (batchSummary.status !== "PASS") fail(`SPEC FAIL: gate browser batch did not pass for ${elementId}.`);
  const captureResult = indexCaptureSummary(batchSummary, expectedCaptureJobs, `gate browser batch summary (${elementId})`);
  const layoutEvidence = indexGateLayoutEvidence(batchSummary, captureResult, `gate browser batch summary (${elementId})`);
  const accessibilityEvidence = indexGateVerificationEvidence(
    batchSummary,
    "accessibility",
    validated.accessibilityPath,
    accessibilityReportPath,
    captureResult
  );
  const motionEvidence = indexGateVerificationEvidence(
    batchSummary,
    "motion",
    validated.motionPath,
    motionReportPath,
    captureResult
  );
  const batchEvidence = {
    batchJobPath,
    batchJobSha256: hashFile(batchJobPath),
    batchSummaryPath,
    batchSummarySha256: hashFile(batchSummaryPath),
    browserSessionId: captureResult.browserSessionId,
    browserPid: captureResult.browserPid,
    chromeMode: captureResult.chromeMode,
    layoutEvidence,
  };

  let visual = null;
  let captureEvidence = null;
  if (component.painted) {
    visual = {};
    captureEvidence = {
      captureJobsPath,
      captureJobsSha256: hashFile(captureJobsPath),
      captureSummaryPath: batchSummaryPath,
      captureSummarySha256: hashFile(batchSummaryPath),
      browserSessionId: captureResult.browserSessionId,
      browserPid: captureResult.browserPid,
      chromeMode: captureResult.chromeMode,
    };
    for (const viewport of component.viewports) {
      const capture = captureResult.captures.get(`${elementId}:${viewport}`);
      const browserImagePath = capture.outputPath;
      if (!existsSync(browserImagePath)) fail(`VISUAL FAIL: checkpoint browser image is missing: ${browserImagePath}`);

      const figmaImage = component.figmaImages[viewport];
      if (hashFile(figmaImage.path) !== figmaImage.sha256) {
        fail(`SPEC FAIL: Figma reference image changed after preflight registration: ${figmaImage.path}`);
      }
      if (figmaImage.mask && hashFile(figmaImage.mask.path) !== figmaImage.mask.sha256) {
        fail(`SPEC FAIL: Figma visual mask changed after preflight registration: ${figmaImage.mask.path}`);
      }

      const diffOptionsPath = resolve(checkpointDirectory, `${elementId}-diff-options-${viewport}.json`);
      const diffOptions = {
        version: 1,
        mask: figmaImage.mask ? { path: figmaImage.mask.path, sha256: figmaImage.mask.sha256, mode: figmaImage.mask.mode } : null,
      };
      writeFileSync(diffOptionsPath, `${JSON.stringify(diffOptions, null, 2)}\n`, "utf8");
      const diffImagePath = resolve(checkpointDirectory, `${elementId}-diff-${viewport}.png`);
      const stdout = runCapture(
        "node",
        [
          "MyBrain/verify/checkpoint-diff.mjs",
          figmaImage.path,
          browserImagePath,
          diffImagePath,
          relative(repoRoot, diffOptionsPath).replace(/\\/g, "/"),
        ],
        `checkpoint pixel diff (${elementId} / ${viewport})`,
        "VISUAL"
      );
      let diffResult;
      try {
        diffResult = JSON.parse(stdout.trim().split("\n").pop());
      } catch (error) {
        fail(`VISUAL FAIL: checkpoint-diff output is not JSON: ${error.message}`);
      }
      if (!Number.isFinite(diffResult.ratio)) fail("VISUAL FAIL: checkpoint-diff did not report a finite ratio.");
      if (figmaImage.mask) {
        if (!diffResult.mask || diffResult.mask.sha256 !== figmaImage.mask.sha256 || diffResult.mask.mode !== figmaImage.mask.mode) {
          fail(`VISUAL FAIL: checkpoint-diff did not use the frozen mask for ${elementId} / ${viewport}.`);
        }
      } else if (diffResult.mask) {
        fail(`VISUAL FAIL: checkpoint-diff used an undeclared mask for ${elementId} / ${viewport}.`);
      }
      const effectiveThreshold =
        component.visualThresholds && component.visualThresholds[viewport] !== undefined
          ? component.visualThresholds[viewport]
          : component.visualThreshold;
      if (diffResult.ratio > effectiveThreshold) {
        fail(
          `VISUAL FAIL: checkpoint ${elementId} / ${viewport} recomputed diff ratio ${diffResult.ratio.toFixed(5)} > threshold ${effectiveThreshold} (diff image: ${diffImagePath})`
        );
      }
      visual[viewport] = {
        figmaImagePath: figmaImage.path,
        figmaImageSha256: figmaImage.sha256,
        mask: figmaImage.mask ? { path: figmaImage.mask.path, sha256: figmaImage.mask.sha256, mode: figmaImage.mask.mode } : null,
        browserImagePath,
        browserImageSha256: hashFile(browserImagePath),
        diffOptionsPath,
        diffOptionsSha256: hashFile(diffOptionsPath),
        diffImagePath,
        diffImageSha256: hashFile(diffImagePath),
        comparedPixels: diffResult.comparedPixels ?? null,
        maskedPixels: diffResult.maskedPixels ?? 0,
        recomputedRatio: diffResult.ratio,
        threshold: effectiveThreshold,
        thresholdBasis: effectiveThreshold > CHECKPOINT_VISUAL_THRESHOLD_STRICT ? component.visualThresholdBasis : null,
      };
    }
  }  const checkpoints = stateWithLearningMetrics[checkpointKey] && typeof stateWithLearningMetrics[checkpointKey] === "object" ? stateWithLearningMetrics[checkpointKey] : {};
  checkpoints[elementId] = {
    passedAt: new Date().toISOString(),
    measuredSpecPath: filteredSpecPath,
    measuredSpecSha256: hashFile(filteredSpecPath),
    batchEvidence,
    accessibilityEvidence,
    motionEvidence,
    captureEvidence,
    visual,
  };

  // 忠実度ベンチマーク（P-3）: 成功した試行を同じ書き込みで記録する。
  // state は checkpoint 呼び出しごとにディスクから読み直しているため、
  // 直前のFAILで追記された試行を取りこぼさない。
  const benchmarkRecord = stateWithLearningMetrics.benchmark && typeof stateWithLearningMetrics.benchmark === "object"
    ? stateWithLearningMetrics.benchmark
    : {};
  const benchmarkAttempts = Array.isArray(benchmarkRecord.attempts) ? [...benchmarkRecord.attempts] : [];
  if (pendingBenchmarkAttempt) {
    benchmarkAttempts.push({
      ...pendingBenchmarkAttempt,
      outcome: "PASS",
      failureClass: null,
      at: new Date().toISOString(),
    });
    pendingBenchmarkAttempt = null;
  }

  writeState({
    ...stateWithLearningMetrics,
    [checkpointKey]: checkpoints,
    benchmark: { ...benchmarkRecord, attempts: benchmarkAttempts },
  });
  const remaining = validated.checkpointPlan.filter((planElementId) => !Object.hasOwn(checkpoints, planElementId));
  pass(`${release ? "Release checkpoint" : "Checkpoint"} PASS: ${elementId} — SPEC FAIL 0 / LAYOUT FAIL 0 / VISUAL FAIL 0 (${validated.checkpointPlan.length - remaining.length}/${validated.checkpointPlan.length} done${remaining.length > 0 ? `, remaining: ${remaining.join(", ")}` : ""})`);
}

// release-checkは公開URLの全layout specをQ-13/Q-08と同じbrowser batchで再測定する。
// componentごとのrelease checkpointだけでは、全体specを一度に照合した公開証跡にならないため、
// ここで全viewport・全selectorを一つのCDP sessionへ載せる。単体verify-layoutは起動しない。
function runReleaseFullPageBrowserBatch(validated, publicUrl, frozenState, absoluteManifestPath) {
  const checkpointDirectory = resolve(repoRoot, "MyBrain/verify/checkpoints", validated.id);
  mkdirSync(checkpointDirectory, { recursive: true });
  const sourceSpec = readJson(validated.specAbsolutePath, "release layout spec source");
  const layoutSpecPath = resolve(checkpointDirectory, "release-full-page-spec.json");
  writeFileSync(layoutSpecPath, `${JSON.stringify({ ...sourceSpec, url: publicUrl }, null, 2)}\n`, "utf8");

  const captureDocument = {
    version: 1,
    url: publicUrl,
    scrollbars: readSpecScrollbars(validated),
    jobs: [],
  };
  const captureJobsPath = resolve(checkpointDirectory, "release-full-page-capture-jobs.json");
  const batchJobPath = resolve(checkpointDirectory, "release-full-page-browser-batch.json");
  const batchSummaryPath = resolve(checkpointDirectory, "release-full-page-browser-batch-summary.json");
  const accessibilityReportPath = resolve(checkpointDirectory, "release-full-page-accessibility.json");
  const motionReportPath = resolve(checkpointDirectory, "release-full-page-motion.json");
  writeFileSync(captureJobsPath, `${JSON.stringify(captureDocument, null, 2)}\n`, "utf8");
  const batchJob = {
    version: 1,
    url: publicUrl,
    scrollbars: readSpecScrollbars(validated),
    layout: { specPath: relative(repoRoot, layoutSpecPath).replace(/\\/g, "/") },
    capture: captureDocument,
    accessibility: {
      configPath: validated.accessibilityPath,
      reportPath: relative(repoRoot, accessibilityReportPath).replace(/\\/g, "/"),
    },
    motion: {
      configPath: validated.motionPath,
      reportPath: relative(repoRoot, motionReportPath).replace(/\\/g, "/"),
    },
  };
  writeFileSync(batchJobPath, `${JSON.stringify(batchJob, null, 2)}\n`, "utf8");
  runCapture(
    "node",
    [
      "MyBrain/verify/gate-browser-batch.mjs",
      relative(repoRoot, batchJobPath).replace(/\\/g, "/"),
      relative(repoRoot, batchSummaryPath).replace(/\\/g, "/"),
    ],
    "release-check Q-09/Q-13/Q-08 full-page browser batch"
  );
  assertFrozenInputs(frozenState, validated, absoluteManifestPath, "release-check");
  const batchSummary = readJson(batchSummaryPath, "release full-page browser batch summary");
  if (batchSummary.status !== "PASS") fail("SPEC FAIL: release full-page browser batch did not pass.");
  const captureResult = indexCaptureSummary(batchSummary, [], "release full-page browser batch summary");
  const layoutEvidence = indexGateLayoutEvidence(batchSummary, captureResult, "release full-page browser batch summary");
  const accessibilityEvidence = indexGateVerificationEvidence(
    batchSummary,
    "accessibility",
    validated.accessibilityPath,
    accessibilityReportPath,
    captureResult
  );
  const motionEvidence = indexGateVerificationEvidence(
    batchSummary,
    "motion",
    validated.motionPath,
    motionReportPath,
    captureResult
  );
  return {
    layoutSpecPath,
    layoutSpecSha256: hashFile(layoutSpecPath),
    captureJobsPath,
    captureJobsSha256: hashFile(captureJobsPath),
    batchJobPath,
    batchJobSha256: hashFile(batchJobPath),
    batchSummaryPath,
    batchSummarySha256: hashFile(batchSummaryPath),
    browserSessionId: captureResult.browserSessionId,
    browserPid: captureResult.browserPid,
    chromeMode: captureResult.chromeMode,
    layoutEvidence,
    accessibilityEvidence,
    motionEvidence,
  };
}
function assertRecordedFile(elementId, label, filePath, expectedSha256) {
  const path = requireString(filePath, `checkpoint record ${label} path (${elementId})`);
  const expected = requireString(expectedSha256, `checkpoint record ${label} sha256 (${elementId})`);
  if (!existsSync(path)) {
    fail(`Checkpoint ${label} file is missing for ${elementId}: ${path}`);
  }
  if (hashFile(path) !== expected) {
    fail(`Checkpoint ${label} changed after registration: ${elementId} (${path})`);
  }
}

function assertCheckpointsComplete(state, plan, components, validated, checkpointKey = "checkpoints") {
  const checkpoints = state[checkpointKey] && typeof state[checkpointKey] === "object" ? state[checkpointKey] : {};
  const missing = plan.filter((elementId) => !Object.hasOwn(checkpoints, elementId));
  if (missing.length > 0) {
    fail(`Checkpoint evidence is missing for: ${missing.join(", ")}. Run "figma-gate checkpoint" for each component before close.`);
  }
  // Validate the evidence files that the gate itself created for every checkpoint.
  for (const [elementId, record] of Object.entries(checkpoints)) {
    requireObject(record, `checkpoint record (${elementId})`);
    assertRecordedFile(elementId, "measured spec", record.measuredSpecPath, record.measuredSpecSha256);
    const batchEvidence = requireObject(record.batchEvidence, `checkpoint browser batch evidence (${elementId})`);
    assertRecordedFile(elementId, "browser batch job", batchEvidence.batchJobPath, batchEvidence.batchJobSha256);
    assertRecordedFile(elementId, "browser batch summary", batchEvidence.batchSummaryPath, batchEvidence.batchSummarySha256);
    if (requireString(batchEvidence.browserSessionId, `checkpoint browser batch session (${elementId})`) === "") {
      fail(`Checkpoint browser batch session is empty: ${elementId}`);
    }
    const layoutEvidence = requireObject(batchEvidence.layoutEvidence, `checkpoint layout evidence (${elementId})`);
    if (requireString(layoutEvidence.browserSessionId, `checkpoint layout session (${elementId})`) !== batchEvidence.browserSessionId || Number(layoutEvidence.browserPid) !== Number(batchEvidence.browserPid)) {
      fail(`Checkpoint layout evidence is not tied to the Q-09/Q-13/Q-08 browser batch: ${elementId}`);
    }
    if (!Number.isInteger(layoutEvidence.failCount) || layoutEvidence.failCount !== 0) {
      fail(`Checkpoint layout evidence has unresolved mismatches: ${elementId}`);
    }
    assertGateVerificationEvidence(elementId, "accessibility", record.accessibilityEvidence, validated, batchEvidence);
    assertGateVerificationEvidence(elementId, "motion", record.motionEvidence, validated, batchEvidence);
    const component = components.find((candidate) => candidate.elementId === elementId);
    if (component && component.painted) {
      const captureEvidence = requireObject(record.captureEvidence, `checkpoint record capture evidence (${elementId})`);
      assertRecordedFile(elementId, "capture jobs", captureEvidence.captureJobsPath, captureEvidence.captureJobsSha256);
      assertRecordedFile(elementId, "capture summary", captureEvidence.captureSummaryPath, captureEvidence.captureSummarySha256);
      if (requireString(captureEvidence.browserSessionId, `checkpoint capture session (${elementId})`) !== batchEvidence.browserSessionId || Number(captureEvidence.browserPid) !== Number(batchEvidence.browserPid)) {
        fail(`Checkpoint capture evidence is not tied to the Q-09/Q-13/Q-08 browser batch: ${elementId}`);
      }
      const visual = requireObject(record.visual, `checkpoint record visual (${elementId} is painted)`);
      for (const viewport of component.viewports) {
        const viewportRecord = requireObject(visual[viewport], `checkpoint record visual.${viewport} (${elementId})`);
        if (viewportRecord.figmaImageSha256 !== component.figmaImages[viewport].sha256) {
          fail(`Checkpoint used a Figma image that differs from the frozen registration: ${elementId} / ${viewport}`);
        }
        assertRecordedFile(elementId, `browser image (${viewport})`, viewportRecord.browserImagePath, viewportRecord.browserImageSha256);
        assertRecordedFile(elementId, `diff options (${viewport})`, viewportRecord.diffOptionsPath, viewportRecord.diffOptionsSha256);
        assertRecordedFile(elementId, `diff image (${viewport})`, viewportRecord.diffImagePath, viewportRecord.diffImageSha256);
        const declaredMask = component.figmaImages[viewport].mask;
        if (declaredMask) {
          const recordedMask = requireObject(viewportRecord.mask, `checkpoint record mask (${elementId} / ${viewport})`);
          if (recordedMask.path !== declaredMask.path || recordedMask.sha256 !== declaredMask.sha256 || recordedMask.mode !== declaredMask.mode) {
            fail(`Checkpoint mask differs from frozen manifest: ${elementId} / ${viewport}`);
          }
          if (hashFile(recordedMask.path) !== recordedMask.sha256) {
            fail(`Checkpoint mask changed after registration: ${elementId} / ${viewport}`);
          }
        } else if (viewportRecord.mask !== null) {
          fail(`Checkpoint has an undeclared visual mask: ${elementId} / ${viewport}`);
        }
      }
    }
  }
}

function writeState(state) {
  const manifestId = requireString(state.manifestId, "Figma gate state manifestId");
  const receiptPath = statePathFor(manifestId);
  mkdirSync(activeStateDirectory, { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  activeReceiptPathInUse = receiptPath;
  // 旧1枠に同じ scope の受領証が残っていると、二重に保持しているように見える。
  // 新形式へ書き写したので取り下げる。別scopeの旧受領証には触れない。
  if (existsSync(legacyStatePath)) {
    try {
      const legacy = JSON.parse(readFileSync(legacyStatePath, "utf8"));
      if (legacy && legacy.manifestId === manifestId) rmSync(legacyStatePath, { force: true });
    } catch {
      // 読めない旧受領証は残す。判断材料が無いまま削除しない。
    }
  }
}

// HTML/PHPを変更したscopeはW3C検証が必須。規則には書いてあったが検査が無く、
// postflight が「未実施」を検出しても close は素通りしていた。実測でError 74件が残っていた。
// 検出する仕組みと止める仕組みが別々だと、合格証跡には現れないので問題なしと読まれる。
function assertW3cValidation(validated) {
  const htmlTargets = validated.changeTargets
    .map(({ relativePath }) => relativePath)
    .filter((relativePath) => /\.(?:php|html?)$/i.test(relativePath));

  if (htmlTargets.length === 0) {
    return { required: false, status: "not-required", htmlTargets: [] };
  }

  if (validated.w3cSkip) {
    // 実行できない事情がある場合の逃げ道。合格にはせず「未実施」として証跡へ残し、
    // 完了報告の未確認リストへ機械的に転記できるようにする。
    pass(`W3C: not executed — recorded as unverified. Reason: ${validated.w3cSkip.reason}`);
    return { required: true, status: "not-recorded", htmlTargets, skipReason: validated.w3cSkip.reason };
  }

  const evidencePath = toEvidencePath(validated.w3cEvidencePath, "manifest.scope.w3cEvidencePath");
  assertNoDraftInputPath(evidencePath, "manifest.scope.w3cEvidencePath");
  const evidence = readExecutionJson(evidencePath, "W3C evidence");
  if (evidence.url !== validated.verifyUrl) {
    fail(`SPEC FAIL: W3C evidence was taken against a different URL: ${evidence.url} (scope verifyUrl is ${validated.verifyUrl})`);
  }
  // 古い合格証跡の使い回しを防ぐ。検証時点のテンプレート内容と現在の内容が一致していること。
  const recorded = evidence.sourceHashes && typeof evidence.sourceHashes === "object" ? evidence.sourceHashes : null;
  if (!recorded) fail("SPEC FAIL: W3C evidence has no sourceHashes; it cannot be tied to the validated source.");
  const stale = [];
  for (const relativePath of htmlTargets) {
    const expected = recorded[relativePath];
    if (typeof expected !== "string") {
      stale.push(`${relativePath} (not covered by the evidence)`);
      continue;
    }
    if (hashFile(resolve(repoRoot, relativePath)) !== expected) stale.push(`${relativePath} (changed after the check)`);
  }
  if (stale.length > 0) {
    fail(`SPEC FAIL: the W3C evidence does not match the current HTML sources: ${stale.join(", ")}. Re-run the check.`);
  }
  if (!Number.isInteger(evidence.errorCount)) fail("SPEC FAIL: W3C evidence has no errorCount.");
  if (evidence.errorCount > 0) {
    const head = (evidence.errors || []).slice(0, 5).map((error) => `L${error.line ?? "?"} ${error.message}`);
    fail(`SPEC FAIL: W3C reports ${evidence.errorCount} error(s) for ${evidence.url}.\n  ${head.join("\n  ")}`);
  }
  pass(`W3C: 0 errors for ${evidence.url} (checked ${evidence.checkedAt})`);
  return {
    required: true,
    status: "pass",
    htmlTargets,
    evidencePath: relative(repoRoot, evidencePath).replace(/\\/g, "/"),
    checkedAt: evidence.checkedAt ?? null,
    warningCount: evidence.warningCount ?? null,
  };
}

function run(program, programArgs, label, failureClass = null) {
  pass(`Running ${label}`);
  // Node 22 は .cmd / .bat を shell なしで起動できない（CVE-2024-27980 の修正で EINVAL になる）。
  // その場合だけ shell を使い、引数は明示的に引用してシェル解釈を防ぐ。
  const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(program);
  const quote = (value) => (/^[\w.:\\/=-]+$/.test(value) ? value : `"${String(value).replace(/(["\\])/g, "\\$1")}"`);
  const result = needsShell
    ? spawnSync(`${quote(program)} ${programArgs.map(quote).join(" ")}`, {
        cwd: repoRoot,
        stdio: "inherit",
        shell: true,
      })
    : spawnSync(program, programArgs, {
        cwd: repoRoot,
        stdio: "inherit",
        shell: false,
      });
  if (result.error) {
    fail(`${failureClass ? `${failureClass} FAIL: ` : ""}${label} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${failureClass ? `${failureClass} FAIL: ` : ""}${label} failed.`);
  }
}

// 上位層（共通Vault / Web Development）の WORKFLOW.md を読めない環境で実装scopeを
// 開始すると、規則を読まないまま「読んだことにして」進む経路が開く。環境判定は
// figma-to-code 正本の tools/workflow-preflight.mjs が持つため、gateはそれを起動して
// 判定を委ねる。見つからない場合も fail-closed とする（規則の所在が不明な環境で
// Figma実装を始めないため）。FIGMA_TO_CODE_ROOT は正本の位置が既定と異なる環境と、
// このgateのフィクスチャのためにある。
const FIGMA_TO_CODE_ROOT = process.env.FIGMA_TO_CODE_ROOT || "C:\\AI\\figma-to-code";

function assertWorkflowEnvironment() {
  const toolPath = resolve(FIGMA_TO_CODE_ROOT, "tools", "workflow-preflight.mjs");
  if (!existsSync(toolPath)) {
    fail(
      `SPEC FAIL: workflow-preflight not found at ${toolPath}. ` +
        "Figma実装scopeは、上位層の規則を読める環境でしか開始できない。" +
        "figma-to-code 正本の位置が既定と異なる場合は FIGMA_TO_CODE_ROOT で指定する。"
    );
  }
  const result = spawnSync(process.execPath, [toolPath, "--assert-local"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    fail(`SPEC FAIL: workflow-preflight could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `SPEC FAIL: workflow-preflight rejected this environment (exit ${result.status}). ` +
        "上位層の WORKFLOW.md を読めないため、Figma実装scopeのpreflightを開始できない。\n" +
        `${(result.stdout || "").trim()}${(result.stderr || "").trim()}`
    );
  }
  return toolPath;
}

function preflight(manifestPath, implementationIdentityInput, { discardCheckpoints = false } = {}) {
  // 規則の所在と上位層の可読性は、manifestを読むより前の前提条件とする。
  assertWorkflowEnvironment();
  const absoluteManifestPath = resolve(repoRoot, requireString(manifestPath, "manifest path"));
  const manifest = readExecutionJson(absoluteManifestPath, "Manifest");
  const implementationIdentity = requireImplementationIdentity(implementationIdentityInput, "preflight implementation identity");
  const validated = validateManifest(manifest, "preflight", implementationIdentity);

  const learningControls = readLearningControlSnapshot();
  // 最後に実行する。manifest / spec / node map の検査で落ちる経路の失敗理由を変えないため。
  const preEdit = assertTargetsUneditedBeforePreflight(validated);
  const applicableRules = applicableRuleRefs(validated);
  // 規則の所在だけを出しても、落ちるのは「どこで止まるか」のほうである（実測：工程名は
  // 言えても停止条件が1件も出てこない要約が出た）。停止条件も同じ場所で出す。
  const stopConditions = readStopConditions();
  const relativeManifestPath = relative(repoRoot, absoluteManifestPath).replace(/\\/g, "/");
  // 受領証は gate 種別ごとに1枠しかない。衝突判定から受領証作成までを同一の排他ロック内で
  // 行わないと、二つのpreflightがどちらも「衝突なし」と判定したあとで、片方がもう片方の
  // 受領証とpage coverage runtimeを黙って上書きできてしまう。
  //
  // identityは v13 の規約どおり実行時フラグ由来のものを渡す。manifest には書かせない。
  try {
    withScopePreflightLock(
      { root: repoRoot, gateKind: "figma", manifestPath: relativeManifestPath },
      () => {
        run(
          "node",
          [
            "MyBrain/verify/scope-conflict-audit.mjs",
            "--gate", "figma",
            "--actor", implementationIdentity.actor,
            "--context-id", implementationIdentity.contextId,
            ...(discardCheckpoints ? [DISCARD_CHECKPOINTS_FLAG] : []),
            relativeManifestPath,
          ],
          "scope conflict audit",
          "SPEC"
        );
        if (validated.visibleAssetAuditPath) {
          run(
            "node",
            ["MyBrain/verify/figma-visible-asset-audit.mjs", "preflight", validated.visibleAssetAuditPath],
            "visible asset audit preflight",
            "SPEC"
          );
        }
        markCoordinationGateActive({
          root: repoRoot,
          scopeId: validated.id,
          gateKind: "figma",
          actor: implementationIdentity.actor,
          contextId: implementationIdentity.contextId,
          manifestPath: relativeManifestPath,
        });
        // Do not create mutable page-coverage runtime until every ordinary
        // preflight eligibility check has passed. In particular, a dirty/Git
        // rejection must not replace the runtime that belongs to an earlier active
        // preflight with a different condition identity.
        initializePageCoverage(manifestPath, implementationIdentity);
        writeState(preflightState());
      }
    );
  } catch (error) {
    fail(`SPEC FAIL: scope conflict preflight guard failed: ${error.message}`);
  }
  pass(`Rules that apply to this scope (read before editing):\n  - ${applicableRules.join("\n  - ")}`);
  pass(`Stop conditions for this scope (do not proceed when any applies):\n  - ${stopConditions.join("\n  - ")}`);
  pass("Preflight evidence is complete. Source edits may begin.");

  // 受領証の中身。ロック内で一度だけ書く。宣言は巻き上げられるので使用箇所より後で構わない。
  function preflightState() {
    return {
    version: FIGMA_GATE_STATE_VERSION,
    phase: "preflight",
    repository: repoRoot,
    runtime: gateRuntimeEvidence(),
    git: gitIdentityAtPreflight(),
    manifestPath: absoluteManifestPath,
    manifestSha256: hashFile(absoluteManifestPath),
    specSha256: hashFile(validated.specAbsolutePath),
    componentsSha256: hashFile(validated.componentsAbsolutePath),
    mappingSha256: hashFile(validated.mappingAbsolutePath),
    nodeMapSha256: hashFile(validated.nodeMapAbsolutePath),
    componentDecisionSha256: hashFile(validated.componentDecisionAbsolutePath),
    nodeEvidenceSha256: hashFile(validated.nodeEvidencePath),
    layerEvidenceSha256: hashFile(validated.layerEvidencePath),
    accessibilitySha256: hashFile(validated.accessibilityAbsolutePath),
    motionSha256: hashFile(validated.motionAbsolutePath),
    axeSourceSha256: hashFile(validated.axeSourceAbsolutePath),
    correctionReceiptSha256: validated.correctionReceipt ? hashFile(validated.correctionReceipt.absolutePath) : null,
    correctionReceiptId: validated.correctionReceipt ? validated.correctionReceipt.id : null,
    startDeclarationSha256: hashFile(validated.startDeclaration.absolutePath),
    startDeclarationPath: validated.startDeclaration.relativePath,
    startDeclaredAt: validated.startDeclaration.declaredAt,
    manifestId: validated.id,
    implementationIdentity,
    changeTargets: validated.changeTargets.map(({ relativePath }) => relativePath),
    responsiveHtml: {
      sourceFiles: [...validated.responsiveHtmlSourceFiles],
      deferredSourceFiles: [...validated.deferredResponsiveHtmlSourceFiles],
    },
    learningCapabilities,
    learningControls,
    learningMetrics: initialLearningMetrics(),
    // 忠実度ベンチマーク（P-3）: 分母を「試行が記録されたcomponent」ではなく
    // scope開始時に凍結した対象集合にする。実装途中でreportしても未着手componentが
    // 分母から落ちて初回PASS率が過大に出ることを防ぐ。
    benchmark: { plan: [...validated.checkpointPlan], attempts: [] },
    preEdit,
    applicableRules,
    stopConditions,
    preflightId: randomUUID(),
    preflightAt: new Date().toISOString(),
    };
  }
}

function close(manifestPath) {
  const absoluteManifestPath = resolve(repoRoot, requireString(manifestPath, "manifest path"));
  const state = readActiveState(absoluteManifestPath, "Figma gate");
  if (state.phase !== "preflight" || state.manifestPath !== absoluteManifestPath) {
    fail("A matching preflight state is required before close.");
  }
  const implementationIdentity = requireActiveImplementationIdentity(state, "close");
  assertVerifierRuntimeUnchanged(state, "close");
  const manifest = readExecutionJson(absoluteManifestPath, "Manifest");
  const validated = validateManifest(manifest, "close", implementationIdentity);
  assertFrozenInputs(state, validated, absoluteManifestPath, "close");
  const expectedTargets = state.changeTargets.join("\n");
  const actualTargets = validated.changeTargets.map(({ relativePath }) => relativePath).join("\n");
  if (expectedTargets !== actualTargets) {
    fail("Change targets differ from the preflight manifest.");
  }

  const pageCoverageSummary = assertPageCoverageComplete(manifestPath, implementationIdentity);

  // W3C は証跡の照合だけなので、ブラウザ再測定より先に見る。
  // 後段に置くと、証跡不備で落ちるたびに高コストな再測定が空回りする。
  const w3cValidation = assertW3cValidation(validated);

  // ビルド生成物を含む最終状態を先に作り、その後にQ-09/Q-13/Q-08を同一CDP batchで再測定する。
  // build後にverify-layoutだけを別Chromeで後付け実行する経路は作らない。
  if (validated.scssFiles.length > 0) {
    run(npmCommand, ["run", "sass:build"], "Sass build");
    run("node", ["MyBrain/verify/lint-units.mjs", ...validated.scssFiles.map(({ relativePath }) => relativePath)], "SCSS unit lint");
  }
  for (const phpFile of validated.phpFiles) {
    run(phpCommand, ["-l", phpFile.relativePath], `PHP lint: ${phpFile.relativePath}`);
  }
  // Shared CSS and templates can change a component after its first checkpoint.
  // Re-measure, re-diff, accessibility, and motion for every component in the final page state.
  for (const elementId of validated.checkpointPlan) {
    checkpoint(manifestPath, elementId, { finalRecheck: true });
  }
  const finalState = readActiveState(absoluteManifestPath, "Figma gate");
  assertCheckpointsComplete(finalState, validated.checkpointPlan, validated.components, validated);

  const closeReportDirectory = resolve(repoRoot, "MyBrain/verify/checkpoints", validated.id);
  mkdirSync(closeReportDirectory, { recursive: true });
  const closeReportPath = resolve(closeReportDirectory, "close-report.json");
  const closeReport = {
    version: 1,
    contractVersion: FIGMA_GATE_CONTRACT_VERSION,
    manifestId: validated.id,
    status: "PASS",
    generatedAt: new Date().toISOString(),
    verifyUrl: validated.verifyUrl,
    result: { specFail: 0, layoutFail: 0, visualFail: 0 },
    // W3C の実施状況。not-recorded の場合は完了報告の未確認リストへ転記する。
    w3cValidation,
    // 変更対象の最終ハッシュを合格証跡へ残す。
    // 後続scopeのpreflightが「作業ツリーのdirtyは完了済みscopeの検証済み成果か」を
    // 機械判定できるようにするため。これが無いとオーナー承認の抜け穴を常用することになる。
    fileHashes: Object.fromEntries(
      validated.changeTargets.map(({ relativePath, absolutePath }) => [relativePath, hashFile(absolutePath)])
    ),
    // 分母と対象外を必ず持たせる。「N passed / 0 failed」がページ全体の保証に見える誤読を防ぐ。
    coverage: {
      declaredComponents: validated.components.length,
      checkpointPlanned: validated.checkpointPlan.length,
      targetSections: pageCoverageSummary.targetSectionCount,
      verifiedSections: pageCoverageSummary.verifiedSectionCount,
      targetSectionIds: pageCoverageSummary.targetSectionIds,
      outOfScopeSectionIds: pageCoverageSummary.outOfScopeSectionIds,
      scopeNote:
        "この結果は宣言済みのtargetセクションとcomponentに対する合格である。outOfScopeSectionIds と、specに登録していない要素は検証対象外。",
    },
    checkpoints: validated.checkpointPlan.map((elementId) => ({
      elementId,
      status: "PASS",
      passedAt: finalState.checkpoints[elementId]?.passedAt ?? null,
      visual: finalState.checkpoints[elementId]?.visual ?? null,
      accessibility: finalState.checkpoints[elementId]?.accessibilityEvidence ?? null,
      motion: finalState.checkpoints[elementId]?.motionEvidence ?? null,
    })),
  };
  writeFileSync(closeReportPath, `${JSON.stringify(closeReport, null, 2)}\n`, "utf8");
  const fileHashes = Object.fromEntries(validated.changeTargets.map(({ relativePath, absolutePath }) => [relativePath, hashFile(absolutePath)]));
  const closedState = {
    ...finalState,
    phase: "closed",
    // postflight の学習分析はここを読む。書かれていないと常に not-recorded になり、
    // 実際にW3Cを実施しても「未実施」と報告され続ける。
    w3cValidation,
    fileHashes,
    closeReport: {
      path: closeReportPath,
      sha256: hashFile(closeReportPath),
    },
    closedAt: new Date().toISOString(),
  };
  const learning = runPostflightLearning(absoluteManifestPath, closedState);
  writeState({ ...closedState, learning });
  // 台帳を閉じるのは受領証を書いたあと。先に閉じると、close検査が落ちたときに
  // 台帳だけ closed になり、実際には未検証のscopeが空き枠として見えてしまう。
  try {
    markCoordinationGateClosed({
      root: repoRoot,
      scopeId: validated.id,
      gateKind: "figma",
      actor: implementationIdentity.actor,
      contextId: implementationIdentity.contextId,
      manifestPath: relative(repoRoot, absoluteManifestPath).replace(/\\/g, "/"),
    });
  } catch (error) {
    fail(`Scope coordination close update failed: ${error.message}`);
  }
  pass(
    `Scope close PASS: SPEC FAIL 0 / LAYOUT FAIL 0 / VISUAL FAIL 0 ` +
      `— components ${validated.checkpointPlan.length}/${validated.components.length}, ` +
      `target sections ${pageCoverageSummary.verifiedSectionCount}/${pageCoverageSummary.targetSectionCount}` +
      `${pageCoverageSummary.outOfScopeSectionIds.length > 0 ? `, out of scope: ${pageCoverageSummary.outOfScopeSectionIds.join(", ")}` : ""}. ` +
      `Report: ${closeReportPath}`
  );
}

function validateReleaseRecord(releaseRecord) {
  requireObject(releaseRecord, "release check record");
  if (releaseRecord.version !== 1 || releaseRecord.status !== "pending") {
    fail("release check record must use version 1 with status pending before execution.");
  }
  if (releaseRecord.ownerApproved !== true) {
    fail("release check requires ownerApproved: true.");
  }
  requireString(releaseRecord.ownerApprovedAt, "release check ownerApprovedAt");
  requireString(releaseRecord.deploymentId, "release check deploymentId");
  const publicUrl = requireString(releaseRecord.publicUrl, "release check publicUrl");
  let parsedUrl;
  try {
    parsedUrl = new URL(publicUrl);
  } catch {
    fail("release check publicUrl must be a valid HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    fail("release check publicUrl must use HTTPS.");
  }
  return { ...releaseRecord, publicUrl: parsedUrl.href };
}

function releaseCheck(manifestPath, releaseRecordPathArg) {
  const absoluteManifestPath = resolve(repoRoot, requireString(manifestPath, "manifest path"));
  const state = readActiveState(absoluteManifestPath, "Figma gate");
  if (state.phase !== "closed" || state.manifestPath !== absoluteManifestPath) {
    fail("release-check requires a successful close for the same manifest.");
  }
  const implementationIdentity = requireActiveImplementationIdentity(state, "release-check");
  assertVerifierRuntimeUnchanged(state, "release-check");
  const manifest = readExecutionJson(absoluteManifestPath, "Manifest");
  const validated = validateManifest(manifest, "release-check", implementationIdentity);
  assertFrozenInputs(state, validated, absoluteManifestPath, "release-check");
  // release-check does not advance page coverage, but it must still prove that
  // the persisted coverage runtime is the same condition's v11 identity.
  assertPageCoverageComplete(manifestPath, implementationIdentity);

  const releaseRecordPath = inputRepoPath(releaseRecordPathArg, "release check record path");
  const releaseRecord = validateReleaseRecord(readExecutionJson(releaseRecordPath.absolutePath, "Release check record"));
  for (const elementId of validated.checkpointPlan) {
    checkpoint(manifestPath, elementId, { finalRecheck: true, release: { publicUrl: releaseRecord.publicUrl } });
  }
  const finalState = readActiveState(absoluteManifestPath, "Figma gate");
  assertCheckpointsComplete(finalState, validated.checkpointPlan, validated.components, validated, "releaseCheckpoints");
  const releaseBrowserBatchEvidence = runReleaseFullPageBrowserBatch(validated, releaseRecord.publicUrl, state, absoluteManifestPath);

  const executedAt = new Date().toISOString();
  const passedRecord = {
    ...releaseRecord,
    status: "passed",
    executedAt,
    manifestId: validated.id,
    frozenInputs: {
      manifestSha256: state.manifestSha256,
      specSha256: state.specSha256,
      componentsSha256: state.componentsSha256,
      mappingSha256: state.mappingSha256,
      nodeMapSha256: state.nodeMapSha256,
      componentDecisionSha256: state.componentDecisionSha256,
      nodeEvidenceSha256: state.nodeEvidenceSha256,
      layerEvidenceSha256: state.layerEvidenceSha256,
      accessibilitySha256: state.accessibilitySha256,
      motionSha256: state.motionSha256,
      axeSourceSha256: state.axeSourceSha256,
    },
    browserBatchEvidence: releaseBrowserBatchEvidence,
    verifiedComponents: validated.checkpointPlan,
  };
  writeFileSync(releaseRecordPath.absolutePath, `${JSON.stringify(passedRecord, null, 2)}\n`, "utf8");
  writeState({
    ...finalState,
    phase: "closed",
    releaseCheck: {
      recordPath: releaseRecordPath.relativePath,
      recordSha256: hashFile(releaseRecordPath.absolutePath),
      publicUrl: releaseRecord.publicUrl,
      deploymentId: releaseRecord.deploymentId,
      executedAt,
      browserBatchEvidence: releaseBrowserBatchEvidence,
    },
  });
  pass("Release check completed. Record the passed release record in STATE.md before reporting public completion.");
}

if (command === "start") {
  start();
} else if (command === "preflight") {
  const parsed = parsePreflightArguments(args.slice(1));
  preflight(parsed.manifestPath, parsed.implementationIdentity, { discardCheckpoints: parsed.discardCheckpoints });
} else if (command === "checkpoint") {
  rejectImplementationIdentityFlagsOutsidePreflight("checkpoint", args.slice(1));
  checkpoint(args[1], args[2]);
} else if (command === "section-start") {
  rejectImplementationIdentityFlagsOutsidePreflight("section-start", args.slice(1));
  if (!args[2]) fail("section-start requires a sectionId");
  const active = requireFrozenPreflight(args[1], "section-start");
  sectionStart(args[1], active.implementationIdentity, args[2]);
} else if (command === "section-close") {
  rejectImplementationIdentityFlagsOutsidePreflight("section-close", args.slice(1));
  if (!args[2]) fail("section-close requires a sectionId");
  const active = requireFrozenPreflight(args[1], "section-close");
  const prepared = prepareSectionClose(args[1], active.implementationIdentity, args[2]);
  if (active.absoluteManifestPath !== prepared.absoluteManifestPath) {
    fail("section-close manifest changed after preflight.");
  }
  assertCheckpointsComplete(
    active.state,
    prepared.checkpointPlan,
    active.validated.components,
    active.validated
  );
  completeSection(args[1], active.implementationIdentity, args[2]);
} else if (command === "close") {
  rejectImplementationIdentityFlagsOutsidePreflight("close", args.slice(1));
  close(args[1]);
} else if (command === "release-check") {
  rejectImplementationIdentityFlagsOutsidePreflight("release-check", args.slice(1));
  if (!args[2]) fail("release-check requires a release record path");
  releaseCheck(args[1], args[2]);
} else if (command === "versions") {
  // いま動いている検証器の版を出す。世代差を疑ったときに、症状ではなく原因を直接見るための出口。
  // 受領証を渡すと、凍結時との差分も並べる。
  const modules = verifierModuleHashes();
  console.log(`contractVersion: ${FIGMA_GATE_CONTRACT_VERSION}`);
  console.log(`figma-gate.mjs : ${hashFile(gateEntrypointPath)}`);
  for (const [name, value] of Object.entries(modules)) {
    console.log(`${name.padEnd(31)}: ${value}`);
  }
  if (args[1]) {
    const absoluteManifestPath = resolve(repoRoot, args[1]);
    const receiptPath = activeStatePathForManifest(absoluteManifestPath);
    if (!receiptPath) {
      console.log("\n受領証なし（このmanifestの preflight はまだ実行されていません）");
    } else {
      const state = readJson(receiptPath, "Active Figma gate state");
      const frozen = state.runtime?.modules;
      if (!frozen) {
        console.log("\nこの受領証は検証器の版を持ちません（版を記録する前に preflight したもの）。");
      } else {
        const differences = Object.entries(frozen).filter(([name, value]) => (modules[name] ?? "missing") !== value);
        console.log(`\n凍結時との差分: ${differences.length === 0 ? "なし" : differences.length + "件"}`);
        for (const [name, value] of differences) {
          console.log(`  ${name}: 凍結 ${String(value).slice(0, 12)}… → 現在 ${String(modules[name] ?? "missing").slice(0, 12)}…`);
        }
      }
    }
  }
} else {
  console.error("Usage: node MyBrain/verify/figma-gate.mjs start | versions [manifest.json] | preflight <manifest.json> --implementation-actor <actor> --implementation-context-id <context> [--discard-checkpoints] | <checkpoint|section-start|section-close|close|release-check> <manifest.json> [elementId-or-release-record]");
  process.exit(1);
}
