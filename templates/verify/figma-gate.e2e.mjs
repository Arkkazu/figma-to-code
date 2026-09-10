#!/usr/bin/env node
// P-3 v11 figma-gate CLI regression fixture. Every case uses a disposable
// Git repository and a test-double browser batch. It never starts a browser,
// Figma, P-11, a role, or a pair lifecycle.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixturePath = fileURLToPath(import.meta.url);
const gatePath = resolve(dirname(fixturePath), "figma-gate.mjs");
const implementationIdentity = Object.freeze({
  actor: "fixture-implementation",
  contextId: "fixture-implementation-context",
});
let assertions = 0;

function assert(condition, label) {
  assertions += 1;
  if (!condition) throw new Error(`fixture failed: ${label}`);
}

// 環境判定 workflow-preflight のテストダブル。実際の C:\\AI\\figma-to-code や
// 上位層 WORKFLOW.md に依存せずに、gateが判定へ委ねていることだけを検査する。
// 工程と停止条件の正本。stubへは実物を複製する。合成した見出しを置くと、正本側で節が
// 改名・移動したときにこのE2Eが素通りしてしまうため（gateは正本のMarkdownから抽出する）。
const PLAYBOOK_PROCESS_DOCS = Object.freeze(["WORKFLOW.md", join("rules", "figma-spec-pipeline.md")]);

// 正本の所在。正本リポジトリ内で走るときは ../.. がそれにあたるが、このE2Eは案件の
// MyBrain/verify/ へ配布される。配布後は ../.. が案件ルートを指し、そこに WORKFLOW.md は
// 無い（2026-08-29 実測：配布後 e2e が ENOENT で落ち、verifier-distribute が巻き戻した）。
// gate 本体と同じ規則で解決する（FIGMA_TO_CODE_ROOT、既定 C:\AI\figma-to-code）。
// 読めない環境で「工程を検査したことにして」通さないよう fail-closed とする。
function resolvePlaybookRoot() {
  const candidates = [
    process.env.FIGMA_TO_CODE_ROOT,
    resolve(dirname(fixturePath), "..", ".."),
    "C:\\AI\\figma-to-code",
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim() === "") continue;
    const root = resolve(candidate);
    if (PLAYBOOK_PROCESS_DOCS.every((relativePath) => existsSync(join(root, relativePath)))) return root;
  }
  throw new Error(
    `fixture failed: 工程と停止条件の正本が見つからない（${PLAYBOOK_PROCESS_DOCS.join(" / ")}）。` +
      "FIGMA_TO_CODE_ROOT で正本の位置を指定する。"
  );
}

const playbookRoot = resolvePlaybookRoot();

function copyPlaybookProcessDocs(root) {
  for (const relativePath of PLAYBOOK_PROCESS_DOCS) {
    const source = join(playbookRoot, relativePath);
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
}

function createWorkflowPreflightStub(mode) {
  const root = mkdtempSync(join(tmpdir(), `figma-gate-workflow-${mode}-`));
  mkdirSync(join(root, "tools"), { recursive: true });
  copyPlaybookProcessDocs(root);
  const exitCode = mode === "local" ? 0 : 2;
  writeFileSync(
    join(root, "tools", "workflow-preflight.mjs"),
    [
      `process.stdout.write(JSON.stringify({ mode: ${JSON.stringify(mode)} }) + "\\n");`,
      `process.exit(process.argv.includes("--assert-local") ? ${exitCode} : 0);`,
      "",
    ].join("\n"),
    "utf8"
  );
  return root;
}

const localWorkflowRoot = createWorkflowPreflightStub("local");
const cloudWorkflowRoot = createWorkflowPreflightStub("cloud-restricted");
const missingWorkflowRoot = mkdtempSync(join(tmpdir(), "figma-gate-workflow-missing-"));

function gate(args, cwd, envOverrides = {}) {
  const result = spawnSync(process.execPath, [gatePath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FIGMA_TO_CODE_ROOT: localWorkflowRoot, ...envOverrides },
  });
  return {
    result,
    output: `${result.stdout || ""}\n${result.stderr || ""}`,
  };
}

function reject(args, expectedText, cwd, envOverrides = {}) {
  const attempt = gate(args, cwd, envOverrides);
  assert(attempt.result.status !== 0, `${args[0]} rejects invalid invocation`);
  assert(
    attempt.output.includes(expectedText),
    `${args.join(" ")} rejects for the expected fail-closed reason (expected=${expectedText}; output=${JSON.stringify(attempt.output)}; spawn=${attempt.result.error?.message || "none"})`
  );
  return attempt;
}

function accept(args, cwd, envOverrides = {}) {
  const attempt = gate(args, cwd, envOverrides);
  assert(
    attempt.result.status === 0,
    `${args.join(" ")} succeeds in the disposable fixture (output=${JSON.stringify(attempt.output)}; spawn=${attempt.result.error?.message || "none"})`
  );
  return attempt;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function mutateJson(path, mutate) {
  const value = readJson(path);
  mutate(value);
  writeJson(path, value);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", env: { ...process.env } });
  assert(
    result.status === 0,
    `${program} ${args.join(" ")} succeeds in the disposable fixture (output=${JSON.stringify(`${result.stdout || ""}\n${result.stderr || ""}`)})`
  );
}

function preflightArgs(fixture) {
  return [
    "preflight",
    fixture.manifestRelativePath,
    "--implementation-actor",
    implementationIdentity.actor,
    "--implementation-context-id",
    implementationIdentity.contextId,
  ];
}

// 受領証は scope ごとに active/<manifestId>.json へ書かれる（2026-08-25 の per-manifest 移行）。
// fixture は1 scope しか持たないので、active/ にある最初の受領証を見る。
// 受領証がまだ無いときは旧1枠のパスを返す。存在しないことを確かめる検査がそのまま通る。
function resolveActiveReceiptPath(root) {
  const activeDirectory = join(root, ".figma-gate", "active");
  if (existsSync(activeDirectory)) {
    const names = readdirSync(activeDirectory).filter((name) => name.endsWith(".json"));
    if (names.length > 0) return join(activeDirectory, names[0]);
  }
  return join(root, ".figma-gate", "active.json");
}

// page coverage runtime も scope ごとに1ファイル（runtime/<manifest名>.json）。
// 受領証と同じく、まだ無いときは旧1枠のパスを返す。
function resolveRuntimeReceiptPath(directory) {
  const runtimeDirectory = join(directory, ".figma-gate", "runtime");
  if (existsSync(runtimeDirectory)) {
    const names = readdirSync(runtimeDirectory).filter((name) => name.endsWith(".json"));
    if (names.length > 0) return join(runtimeDirectory, names[0]);
  }
  return join(directory, ".figma-gate", "page-coverage-runtime.json");
}

function gateArtifactPaths(fixture) {
  return {
    activePath: resolveActiveReceiptPath(fixture.root),
    runtimePath: resolveRuntimeReceiptPath(fixture.directory),
  };
}

function assertNoGateArtifacts(fixture, label) {
  const paths = gateArtifactPaths(fixture);
  assert(!existsSync(paths.activePath), `${label}: rejected preflight does not create .figma-gate/active.json`);
  assert(!existsSync(paths.runtimePath), `${label}: rejected preflight does not create page-coverage runtime`);
}

function snapshotGateArtifacts(fixture, label) {
  const paths = gateArtifactPaths(fixture);
  assert(existsSync(paths.activePath), `${label}: active gate state exists before the phase regression`);
  assert(existsSync(paths.runtimePath), `${label}: page-coverage runtime exists before the phase regression`);
  return {
    ...paths,
    activeSha256: sha256(paths.activePath),
    runtimeSha256: sha256(paths.runtimePath),
  };
}

function assertGateArtifactsUnchanged(snapshot, label) {
  assert(existsSync(snapshot.activePath), `${label}: active state remains present after a rejected later phase`);
  assert(existsSync(snapshot.runtimePath), `${label}: page-coverage runtime remains present after a rejected later phase`);
  assert(sha256(snapshot.activePath) === snapshot.activeSha256, `${label}: rejected later phase leaves active state byte-identical`);
  assert(sha256(snapshot.runtimePath) === snapshot.runtimeSha256, `${label}: rejected later phase leaves page-coverage runtime byte-identical`);
}

function writeFixtureBrowserBatch(root) {
  const path = join(root, "MyBrain", "verify", "gate-browser-batch.mjs");
  const source = `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [jobPath, summaryPath] = process.argv.slice(2);
const job = JSON.parse(readFileSync(resolve(process.cwd(), jobPath), "utf8"));
const browserSessionId = "fixture-browser-session";
const browserPid = 4242;
for (const kind of ["accessibility", "motion"]) {
  const reportPath = resolve(process.cwd(), job[kind].reportPath);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({ failures: [], browserSessionId, browserPid, humanReview: [] }, null, 2) + "\\n", "utf8");
}
const summary = {
  version: 1,
  status: "PASS",
  browserSessionId,
  browserPid,
  chromeMode: "fixture",
  captures: [],
  layout: { status: "PASS", passCount: 1, failCount: 0, browserSessionId, browserPid },
  accessibility: { reportPath: job.accessibility.reportPath, browserSessionId, browserPid },
  motion: { reportPath: job.motion.reportPath, browserSessionId, browserPid },
};
const resolvedSummaryPath = resolve(process.cwd(), summaryPath);
mkdirSync(dirname(resolvedSummaryPath), { recursive: true });
writeFileSync(resolvedSummaryPath, JSON.stringify(summary, null, 2) + "\\n", "utf8");
`;
  writeFileSync(path, source, "utf8");
}

// WORKFLOW.md「着手前ゲート」の5点を受領証にしたもの。manifestと突き合わせるので、
// fileKey / nodeId / specPath はフィクスチャのmanifestと一致させる必要がある。
// declaredAt は固定値にしない。着手宣言は「いま着手する」記録であり、preflight は 24時間より
// 古い宣言を落とす（2026-08-29 追加）。固定日付にすると、その日を過ぎた瞬間に全ケースが落ちる。
const fixtureDeclaredAt = new Date().toISOString();

function validStartDeclaration() {
  return {
    version: 1,
    scopeId: "fixture-gate",
    declaredAt: fixtureDeclaredAt,
    ownerInstruction: "fixture: ファーストビューをFigmaどおりに実装する（着手宣言の検査用）",
    environmentPreflight: { mode: "local", checkedAt: fixtureDeclaredAt },
    figma: {
      fileKey: "fixture-file",
      nodeIds: { pc: ["fixture-pc-page-root"], sp: ["fixture-sp-page-root"] },
    },
    specPath: "MyBrain/verify/fixture/spec.json",
    scopeLockStatePath: "MyBrain/verify/fixture/scope-lock.state.json",
    outOfScopePaths: ["site/other-view.txt"],
  };
}

// 正規の scope lock state。`figma-scope-lock.mjs` の validateState と
// `scope-lock-state.mjs` の共有契約の両方を満たす最小形。
function validScopeLockState(root) {
  return {
    version: 1,
    kind: "figma-scope-lock-state",
    status: "active",
    scope: {
      version: 1,
      scopeId: "fixture-gate",
      task: "fixture: 着手前ゲートの検査用 scope",
      ownerInstruction: "fixture: ファーストビューをFigmaどおりに実装する（scope lockの検査用）",
      repoPath: root,
      allowedPaths: ["site/view.txt"],
    },
    baseline: [{ path: "site/view.txt", sha256: null }],
    history: [{ action: "begin", at: fixtureDeclaredAt }],
    controlPaths: [
      "MyBrain/verify/fixture/scope-lock.json",
      "MyBrain/verify/fixture/scope-lock.state.json",
    ],
  };
}

function createFixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const directory = join(root, "MyBrain", "verify", "fixture");
  const fixture = {
    root,
    directory,
    manifestRelativePath: "MyBrain/verify/fixture/gate.json",
    manifestPath: join(directory, "gate.json"),
    specPath: join(directory, "spec.json"),
    nodeMapPath: join(directory, "nodemap.json"),
    nodeEvidencePath: join(directory, "node-evidence.json"),
    componentsPath: join(directory, "components.json"),
    componentDecisionPath: join(directory, "component-decisions.json"),
    accessibilityPath: join(directory, "accessibility.json"),
    releaseRecordRelativePath: "MyBrain/verify/fixture/release-record.json",
    releaseRecordPath: join(directory, "release-record.json"),
  };
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, "site"), { recursive: true });
  // preflight は scope conflict audit を別プロセスで起動する。実体と両台帳が無いと、
  // このe2eが検証したい内容へ到達する前に落ちる。
  const verifierDirectory = join(root, "MyBrain", "verify");
  for (const name of ["scope-coordination.mjs", "scope-conflict-audit.mjs", "gate-lease.mjs"]) {
    cpSync(join(dirname(fixturePath), name), join(verifierDirectory, name));
  }
  // 担当者名はこのフィクスチャ固有。台帳で宣言することで、正本に案件の担当者名を
  // 焼き込まずに済む（scope-conflict-audit.mjs の actors 既定を上書きする）。
  writeJson(join(verifierDirectory, "shared-component-ownership.json"), {
    version: 2,
    exclusivePathOwnership: [{ pattern: "**", owner: "fixture-implementation", grantedForScope: "fixture-gate" }],
  });
  writeJson(join(verifierDirectory, "scope-coordination.json"), {
    version: 2,
    actors: ["fixture-implementation"],
    updatedAt: "2026-08-21T00:00:00+09:00",
    scopes: [
      {
        id: "fixture-gate",
        actor: "fixture-implementation",
        implementationContextId: "fixture-implementation-context",
        status: "waiting",
        manifestPath: "MyBrain/verify/fixture/gate.json",
        gates: { figma: "waiting" },
      },
    ],
  });
  writeFileSync(join(root, "site", "view.txt"), "clean declared target\n", "utf8");
  writeFileSync(join(directory, "mapping.md"), "fixture mapping\n", "utf8");
  // 「既存部品ではない」と結論する決定は、何を探したかを証跡に残す（2026-09-01 契約追加）。
  writeFileSync(join(directory, "search.md"), "fixture search evidence\nqueried: fixture-shared-hero\n", "utf8");
  writeFileSync(join(directory, "axe.js"), "/* fixture axe source */\n", "utf8");
  writeFileSync(join(directory, "pc.png"), "fixture pc image\n", "utf8");
  writeFileSync(join(directory, "sp.png"), "fixture sp image\n", "utf8");
  const scopeEvidence = [
    { viewport: "pc", role: "page-root", nodeId: "fixture-pc-page-root" },
    { viewport: "sp", role: "page-root", nodeId: "fixture-sp-page-root" },
    { viewport: "pc", role: "first-view", nodeId: "fixture-pc-first-view" },
    { viewport: "pc", role: "header", nodeId: "fixture-pc-header" },
    { viewport: "sp", role: "first-view", nodeId: "fixture-sp-first-view" },
    { viewport: "sp", role: "header", nodeId: "fixture-sp-header" },
  ].map((entry) => {
    const metadataPath = join(directory, `metadata-${entry.viewport}-${entry.role}.json`);
    const pageRootChildren = entry.role === "page-root"
      ? entry.viewport === "pc"
        ? '<frame id="fixture-pc-first-view" /><instance id="fixture-pc-header" />'
        : '<frame id="fixture-sp-first-view" /><instance id="fixture-sp-header" />'
      : "";
    writeJson(metadataPath, {
      schema: "fixture-figma-metadata/v1",
      fileKey: "fixture-file",
      nodeId: entry.nodeId,
      raw: `<frame id="${entry.nodeId}">${pageRootChildren}</frame>`,
    });
    return {
      ...entry,
      metadataPath: `MyBrain/verify/fixture/metadata-${entry.viewport}-${entry.role}.json`,
      metadataSha256: sha256(metadataPath),
    };
  });
  writeJson(fixture.nodeEvidencePath, {
    schema: "p3-figma-node-evidence/v1",
    fileKey: "fixture-file",
    evidence: scopeEvidence,
  });
  writeJson(join(directory, "layer-evidence.json"), { source: "fixture" });
  writeJson(fixture.componentsPath, {
    components: [{
      elementId: "fixture-component",
      sectionId: "fixture-section",
      selector: ".fixture-root",
      figmaNodeId: "fixture-pc-first-view",
      painted: false,
      viewports: ["pc", "sp"],
      spacingOwnership: { rootPadding: "none", interSectionSpacing: "parent-layout" },
      repeatItems: [],
      repeatItemsReason: "This disposable fixture deliberately has no repeated interface item.",
    }],
  });
  writeJson(join(directory, "component-decisions.json"), {
    version: 1,
    decisions: [{
      elementId: "fixture-component",
      figmaNodeId: "fixture-pc-first-view",
      figmaNodeType: "OTHER",
      decision: "not-applicable",
      codePath: "site/view.txt",
      searchEvidencePath: "MyBrain/verify/fixture/search.md",
      searchQueries: ["fixture-shared-hero"],
      rationale: "Disposable fixture uses an OTHER node and has no reusable component decision.",
    }],
  });
  writeJson(fixture.specPath, {
    viewportPolicy: { scrollbars: "hidden" },
    viewports: [
      { width: 1440, page: { maxScrollWidth: 1440 }, elements: [{ sel: ".fixture-root", width: 1, provenance: { width: "metadata" } }] },
      { width: 375, page: { maxScrollWidth: 375 }, elements: [{ sel: ".fixture-root", width: 1, provenance: { width: "metadata" } }] },
    ],
  });
  const roots = Object.fromEntries(scopeEvidence.map((entry) => [`${entry.viewport}::${entry.role}`, entry]));
  writeJson(fixture.nodeMapPath, {
    version: 2,
    schema: "scoped-roots/v1",
    figma: {
      fileKey: "fixture-file",
      canonicalRootNodeId: "fixture-pc-page-root",
      pairedSpRootNodeId: "fixture-sp-page-root",
      source: "disposable fixture metadata",
    },
    sourceEvidence: {
      nodeEvidencePath: "MyBrain/verify/fixture/node-evidence.json",
      nodeEvidenceSha256: sha256(fixture.nodeEvidencePath),
    },
    scopeRoots: [
      {
        scopeId: "first-view", viewport: "pc", figmaNodeId: "fixture-pc-first-view",
        pageRootNodeId: "fixture-pc-page-root", pairedScopeRootNodeId: "fixture-sp-first-view",
        metadataPath: roots["pc::first-view"].metadataPath, metadataSha256: roots["pc::first-view"].metadataSha256,
      },
      {
        scopeId: "header", viewport: "pc", figmaNodeId: "fixture-pc-header",
        pageRootNodeId: "fixture-pc-page-root", pairedScopeRootNodeId: "fixture-sp-header",
        metadataPath: roots["pc::header"].metadataPath, metadataSha256: roots["pc::header"].metadataSha256,
      },
      {
        scopeId: "first-view", viewport: "sp", figmaNodeId: "fixture-sp-first-view",
        pageRootNodeId: "fixture-sp-page-root", pairedScopeRootNodeId: "fixture-pc-first-view",
        metadataPath: roots["sp::first-view"].metadataPath, metadataSha256: roots["sp::first-view"].metadataSha256,
      },
      {
        scopeId: "header", viewport: "sp", figmaNodeId: "fixture-sp-header",
        pageRootNodeId: "fixture-sp-page-root", pairedScopeRootNodeId: "fixture-pc-header",
        metadataPath: roots["sp::header"].metadataPath, metadataSha256: roots["sp::header"].metadataSha256,
      },
    ],
    inventory: {
      source: "disposable fixture metadata",
      nodes: [
        { figmaNodeId: "fixture-pc-first-view", viewport: "pc", scopeRootNodeId: "fixture-pc-first-view" },
        { figmaNodeId: "fixture-pc-header", viewport: "pc", scopeRootNodeId: "fixture-pc-header" },
        { figmaNodeId: "fixture-sp-first-view", viewport: "sp", scopeRootNodeId: "fixture-sp-first-view" },
        { figmaNodeId: "fixture-sp-header", viewport: "sp", scopeRootNodeId: "fixture-sp-header" },
      ],
    },
    nodes: [
      { figmaNodeId: "fixture-pc-first-view", viewport: "pc", scopeRootNodeId: "fixture-pc-first-view", status: "mapped", selector: ".fixture-root", figmaNodeType: "FRAME" },
      { figmaNodeId: "fixture-pc-header", viewport: "pc", scopeRootNodeId: "fixture-pc-header", status: "mapped", selector: ".fixture-root", figmaNodeType: "FRAME" },
      { figmaNodeId: "fixture-sp-first-view", viewport: "sp", scopeRootNodeId: "fixture-sp-first-view", status: "mapped", selector: ".fixture-root", figmaNodeType: "FRAME" },
      { figmaNodeId: "fixture-sp-header", viewport: "sp", scopeRootNodeId: "fixture-sp-header", status: "mapped", selector: ".fixture-root", figmaNodeType: "FRAME" },
    ],
  });
  const pageCoveragePath = join(directory, "page-coverage.json");
  writeJson(pageCoveragePath, {
    version: 1,
    scopeId: "fixture-gate",
    pageKind: "component-reference",
    pageKindReason: "This disposable regression fixture intentionally has no Figma page design.",
    sections: [{ sectionId: "fixture-section", role: "target", componentIds: ["fixture-component"] }],
    inventory: {
      source: "disposable fixture section inventory",
      sections: [{ sectionId: "fixture-section", figmaNodeIds: { pc: "fixture-pc-first-view", sp: "fixture-sp-first-view" } }],
    },
  });
  writeJson(join(directory, "page-coverage-review.json"), {
    version: 2,
    status: "approved",
    reviewerRole: "independent-reviewer",
    reviewerActor: "fixture-reviewer",
    reviewerContextId: "fixture-review-context",
    reviewedAt: "2026-08-11T00:00:00.000Z",
    pageCoverageSha256: sha256(pageCoveragePath),
  });
  writeJson(fixture.accessibilityPath, {
    viewportPolicy: { scrollbars: "hidden" },
    axe: { sourcePath: "MyBrain/verify/fixture/axe.js" },
  });
  writeJson(join(directory, "motion.json"), { viewportPolicy: { scrollbars: "hidden" } });
  // scope lock の state は着手宣言が「lockを開始してから書かれた」ことの根拠になる。
  //
  // 2026-09-01 まで、この fixture は `{ status, allowedPaths }` だけだった。
  // 正規の validator（figma-scope-lock.mjs の validateState）ならこの形は
  // version 検査で即落ちるが、gate が validator を呼んでいなかったため
  // 488 アサーションのどれにも掛からなかった。E2E が「gate の現在の実装」を
  // 固定していて「契約」を固定していなかった、という一例である。
  // 契約を満たす形へ直し、簡易形は負のケース（scope-lock-minimal-fake）へ回す。
  writeJson(join(directory, "scope-lock.state.json"), validScopeLockState(root));
  writeJson(join(directory, "start-declaration.json"), validStartDeclaration());
  writeJson(fixture.manifestPath, {
    id: "fixture-gate",
    scope: {
      kind: "new",
      startDeclarationPath: "MyBrain/verify/fixture/start-declaration.json",
      changeTargets: ["site/view.txt"],
      generatedTargets: [],
      responsiveHtml: { sourceFiles: ["site/view.txt"], deferredSourceFiles: [], exceptions: [] },
      specPath: "MyBrain/verify/fixture/spec.json",
      mappingPath: "MyBrain/verify/fixture/mapping.md",
      nodeMapPath: "MyBrain/verify/fixture/nodemap.json",
      componentsPath: "MyBrain/verify/fixture/components.json",
      componentDecisionPath: "MyBrain/verify/fixture/component-decisions.json",
      pageCoveragePath: "MyBrain/verify/fixture/page-coverage.json",
      pageCoverageReviewPath: "MyBrain/verify/fixture/page-coverage-review.json",
      accessibilityPath: "MyBrain/verify/fixture/accessibility.json",
      motionPath: "MyBrain/verify/fixture/motion.json",
      verifyUrl: "http://127.0.0.1:41731/",
      checkpointPlan: ["fixture-component"],
    },
    figma: {
      fileKey: "fixture-file",
      nodeEvidencePath: "MyBrain/verify/fixture/node-evidence.json",
      layerEvidencePath: "MyBrain/verify/fixture/layer-evidence.json",
      viewportNodes: [
        { viewport: "pc", nodeId: "fixture-pc-page-root", screenshotPath: "MyBrain/verify/fixture/pc.png" },
        { viewport: "sp", nodeId: "fixture-sp-page-root", screenshotPath: "MyBrain/verify/fixture/sp.png" },
      ],
      layers: [{ nodeId: "fixture-pc-first-view", name: "fixture visible layer", visible: true, observedBy: "disposable fixture" }],
    },
    assets: [],
  });
  writeFixtureBrowserBatch(root);
  run("git", ["init", "--quiet"], root);
  run("git", ["add", "--all"], root);
  run("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "--quiet", "-m", "fixture"], root);
  return fixture;
}

function preflightFixture(fixture) {
  accept(preflightArgs(fixture), fixture.root);
}

// オーナー承認でVISUALだけを外した節が、checkpoint から section-close まで通ることを固定する。
//
// なぜ要るか（2026-09-10 実測、rpa-technologies-theme / static-resource-download-20260909）:
// ownerVisualExemption は checkpoint 側だけ実装されており、承認された節は captureEvidence を
// 作らない。ところが assertCheckpointsComplete は painted な節へ無条件に撮影証跡を要求していた。
// そのため**承認経路を通った scope はどれも閉じられず、経路は存在しないのと同じだった**。
// このフィクスチャの唯一の component は painted:false だったため、E2Eはこの経路を一度も通らず
// 欠陥が出荷された。承認の置き場を作るだけでなく、端から端まで通ることを固定する。
function paintedExemptionFixture() {
  const fixture = createFixture("figma-gate-owner-visual-exemption-");
  const cssPath = join(fixture.root, "site", "app.css");
  writeFileSync(cssPath, ".fixture-root { color: #363635; }\n", "utf8");
  const basisRelativePath = "MyBrain/verify/fixture/owner-visual-exemption.json";
  writeJson(join(fixture.directory, "owner-visual-exemption.json"), {
    approvedBy: "owner",
    approvedAt: "2026-09-10",
    selector: ".fixture-root",
    cssPath: "site/app.css",
    cssSha256: sha256(cssPath),
    instruction: "理由を聞いたうえで、このラスター差分を外して配備するよう指示された（フィクスチャ）。",
  });
  mutateJson(fixture.componentsPath, (value) => {
    const component = value.components[0];
    component.painted = true;
    // 0.01 を超える閾値は実測根拠（40文字以上）を要求される。ここで検査したいのは
    // 承認経路であって閾値ではないので、根拠の要らない既定の下限に置く。
    component.visualThreshold = 0.01;
    component.figmaImages = {
      pc: { path: "MyBrain/verify/fixture/pc.png", sha256: sha256(join(fixture.directory, "pc.png")) },
      sp: { path: "MyBrain/verify/fixture/sp.png", sha256: sha256(join(fixture.directory, "sp.png")) },
    };
    component.ownerVisualExemption = { basisPath: basisRelativePath };
  });
  return { fixture, cssPath, basisPath: join(fixture.directory, "owner-visual-exemption.json") };
}

function checkpointExemptedFixture(fixture) {
  preflightFixture(fixture);
  accept(["section-start", fixture.manifestRelativePath, "fixture-section"], fixture.root);
  const attempt = accept(["checkpoint", fixture.manifestRelativePath, "fixture-component"], fixture.root);
  assert(
    attempt.output.includes("VISUAL SKIPPED (owner approved)"),
    "checkpoint reports the owner-approved visual skip instead of silently passing"
  );
  return attempt;
}

function mutateCheckpointRecord(fixture, mutate) {
  mutateJson(resolveActiveReceiptPath(fixture.root), (value) => {
    mutate(value.checkpoints["fixture-component"]);
  });
}

// IHDRだけを持つPNG。preflightの寸法検査はヘッダしか読まないので、これで十分に検査できる。
function writePngHeader(path, width, height) {
  const header = Buffer.alloc(33);
  header.writeUInt32BE(0x89504e47, 0);
  header.writeUInt32BE(0x0d0a1a0a, 4);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  writeFileSync(path, header);
}

// 比較画像の画素寸法が spec の宣言と食い違ったまま preflight を通らないことを固定する。
//
// なぜ要るか（2026-09-10 実測）: カードの比較画像がコンポーネント単体ノードの固有寸法で
// 書き出され、ページ配置後の寸法と食い違っていた。この食い違いは checkpoint のピクセル差分まで
// 進んで初めて現れ、そこへ到達するには直前の全チェックポイントを通す必要がある。
// 寸法は preflight の時点で分かるので、ここで落ちることを固定する。
function assertFigmaReferenceImageSizeIsCheckedAtPreflight() {
  const paintedFixture = (imageWidth, imageHeight, maskSize) => {
    const fixture = createFixture("figma-gate-reference-image-size-");
    const pcPng = join(fixture.directory, "reference-pc.png");
    writePngHeader(pcPng, imageWidth, imageHeight);
    const images = { pc: { path: "MyBrain/verify/fixture/reference-pc.png", sha256: sha256(pcPng) } };
    if (maskSize) {
      const maskPng = join(fixture.directory, "reference-pc-mask.png");
      writePngHeader(maskPng, maskSize.width, maskSize.height);
      images.pc.mask = { path: "MyBrain/verify/fixture/reference-pc-mask.png", sha256: sha256(maskPng), mode: "exclude" };
    }
    mutateJson(fixture.componentsPath, (value) => {
      const component = value.components[0];
      component.painted = true;
      component.visualThreshold = 0.01;
      component.viewports = ["pc"];
      component.figmaImages = images;
    });
    return fixture;
  };

  // spec は .fixture-root を width 1 で宣言している。同じ寸法の参照画像は通る。
  {
    const fixture = paintedFixture(1, 1, null);
    accept(preflightArgs(fixture), fixture.root);
    rmSync(fixture.root, { recursive: true, force: true });
  }

  // 別寸法の参照画像は preflight で落ちる。checkpoint まで持ち越さない。
  {
    const fixture = paintedFixture(384, 453, null);
    reject(preflightArgs(fixture), "but spec declares", fixture.root);
    rmSync(fixture.root, { recursive: true, force: true });
  }

  // マスクは比較画像と同じ画素寸法でなければ差分計算に使えない。
  {
    const fixture = paintedFixture(1, 1, { width: 1, height: 2 });
    reject(preflightArgs(fixture), "mask is 1x2 but the reference image is 1x1", fixture.root);
    rmSync(fixture.root, { recursive: true, force: true });
  }

  // PNG以外を比較画像として登録できない（拡張子ではなく実体で判定する）。
  {
    const fixture = createFixture("figma-gate-reference-image-not-png-");
    mutateJson(fixture.componentsPath, (value) => {
      const component = value.components[0];
      component.painted = true;
      component.visualThreshold = 0.01;
      component.viewports = ["pc"];
      component.figmaImages = {
        pc: { path: "MyBrain/verify/fixture/pc.png", sha256: sha256(join(fixture.directory, "pc.png")) },
      };
    });
    reject(preflightArgs(fixture), "must be a PNG with a readable IHDR header", fixture.root);
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertOwnerVisualExemptionClosesAndGuards() {
  // 正の経路: 承認された節は撮影証跡が無いまま section-close まで通る。
  {
    const { fixture } = paintedExemptionFixture();
    checkpointExemptedFixture(fixture);
    const record = readJson(resolveActiveReceiptPath(fixture.root)).checkpoints["fixture-component"];
    assert(
      record.captureEvidence === null || record.captureEvidence === undefined,
      "an owner-exempted checkpoint records no capture evidence"
    );
    assert(
      record.visual && record.visual.ownerApprovedSkip && record.visual.ownerApprovedSkip.selector === ".fixture-root",
      "an owner-exempted checkpoint records who approved which selector"
    );
    accept(["section-close", fixture.manifestRelativePath, "fixture-section"], fixture.root);
    rmSync(fixture.root, { recursive: true, force: true });
  }

  // 負の経路: 承認の記録を書き換えたら閉じられない。素通りさせないことを固定する。
  const tampering = [
    {
      label: "selector",
      mutate: (record) => { record.visual.ownerApprovedSkip.selector = ".tampered"; },
      expected: "does not match the approved selector",
    },
    {
      label: "cssSha256",
      mutate: (record) => { record.visual.ownerApprovedSkip.cssSha256 = "0".repeat(64); },
      expected: "recorded against different CSS",
    },
    {
      label: "smuggled capture evidence",
      mutate: (record) => { record.captureEvidence = { captureJobsPath: "site/view.txt" }; },
      expected: "recorded capture evidence for an owner-exempted component",
    },
    {
      label: "missing skip record",
      mutate: (record) => { delete record.visual.ownerApprovedSkip; },
      expected: "checkpoint record visual.ownerApprovedSkip",
    },
  ];
  for (const entry of tampering) {
    const { fixture } = paintedExemptionFixture();
    checkpointExemptedFixture(fixture);
    mutateCheckpointRecord(fixture, entry.mutate);
    reject(
      ["section-close", fixture.manifestRelativePath, "fixture-section"],
      entry.expected,
      fixture.root
    );
    rmSync(fixture.root, { recursive: true, force: true });
  }

  // 承認は承認時点のCSSに対して与えられている。あとからCSSを触れば失効する。
  {
    const { fixture, cssPath } = paintedExemptionFixture();
    writeFileSync(cssPath, ".fixture-root { color: #000000; }\n", "utf8");
    reject(preflightArgs(fixture), "the approved CSS changed after the owner's decision", fixture.root);
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function prepareClosedReleaseFixture(fixture) {
  preflightFixture(fixture);
  const paths = gateArtifactPaths(fixture);
  const state = readJson(paths.activePath);
  state.phase = "closed";
  writeJson(paths.activePath, state);
  const runtime = readJson(paths.runtimePath);
  for (const section of runtime.sections) {
    if (section.role === "target") section.state = "verified";
  }
  writeJson(paths.runtimePath, runtime);
}

// fixture の決定は not-applicable なので、`new` の経路を通すには変える。
// 承認フィールド（independentApproved / reviewerActor / reviewerContextId /
// reviewedAt / reviewEvidencePath）は**1つも書かない**。2026-09-04 に廃止したため、
// 書かなくても通ることがこの fixture の主張である。
function makeNewDecisionWithoutReview(fixture) {
  mutateJson(fixture.componentDecisionPath, (value) => {
    const decision = value.decisions[0];
    decision.figmaNodeType = "COMPONENT";
    decision.decision = "new";
  });
}

function assertPreflightDraftGuardCases() {
  const pathSegment = process.platform === "win32" || process.platform === "darwin" ? "P3-DRAFTS" : "p3-drafts";
  const cases = [
    {
      label: "manifest draft-only marker",
      expected: "Manifest contains the draft-only marker _draftOnly",
      mutate: (fixture) => mutateJson(fixture.manifestPath, (value) => { value._draftOnly = true; }),
    },
    {
      label: "spec status draft",
      expected: "Spec contains status:draft",
      mutate: (fixture) => mutateJson(fixture.specPath, (value) => { value.status = "draft"; }),
    },
    // 2026-09-01 追加。「既存部品ではない」と結論する決定は、探した証跡と結び付いていなければ
    // 意味がない。実測（static-resource-detail）: 背景ヒーローが「ページ固有」と判定されたが、
    // 証跡に detail-hero を探した記録は無く、既存の共通 detail-hero を見落として新設していた。
    {
      label: "not-applicable なのに searchQueries が無い",
      expected: "searchQueries (fixture-component) must be a non-empty array",
      mutate: (fixture) => mutateJson(fixture.componentDecisionPath, (value) => {
        delete value.decisions[0].searchQueries;
      }),
    },
    {
      label: "宣言した検索語が証跡に記録されていない",
      expected: "searchQueries are not present in the search evidence",
      mutate: (fixture) => mutateJson(fixture.componentDecisionPath, (value) => {
        value.decisions[0].searchQueries = ["never-searched-token"];
      }),
    },
    // 2026-09-04。`new` 決定に独立レビュー承認を要求しない（オーナー指示）。
    // 承認フィールドを1つも持たない決定が通ることを固定する。ここが落ちるようになったら、
    // 廃止したはずの承認要求がどこかで復活している。
    {
      label: "new 決定は独立レビュー承認なしで通る",
      expected: null,
      mutate: (fixture) => makeNewDecisionWithoutReview(fixture),
    },
    // 承認を外しても、「何を探したか」の裏取りは残っている。
    {
      label: "new 決定でも宣言した検索語が証跡に無ければ落ちる",
      expected: "searchQueries are not present in the search evidence",
      mutate: (fixture) => {
        makeNewDecisionWithoutReview(fixture);
        mutateJson(fixture.componentDecisionPath, (value) => {
          value.decisions[0].searchQueries = ["never-searched-token"];
        });
      },
    },
    // 新設先が宣言済みの changeTargets かの検査も残っている。
    {
      label: "new 決定の codePath が changeTargets に無ければ落ちる",
      expected: "new decision codePath must be declared in scope.changeTargets",
      mutate: (fixture) => {
        makeNewDecisionWithoutReview(fixture);
        mutateJson(fixture.componentDecisionPath, (value) => {
          value.decisions[0].codePath = "site/undeclared.txt";
        });
      },
    },
    // 2026-09-01 追加。寸法だけを検査して位置を検査しない要素は、置き場所の誤りを見逃す。
    // 実測（static-resource-detail）: PCパンくずが width/height/display だけで、
    // margin-top と top の二重適用により y=64 が y=128 になってもPASSした。
    {
      label: "Figma nodeを引くのに位置を検査していない要素",
      expected: "寸法だけを検査して位置を検査していません",
      mutate: (fixture) => mutateJson(fixture.specPath, (value) => {
        value.viewports[0].elements[0].note = "Figma 2585:30280 Breadcrumbs_pc";
      }),
    },
    // 位置を1つでも検査していれば通る。過剰な要求にしない。
    {
      label: "位置を検査していれば通る（negativeの対称確認）",
      expected: null,
      mutate: (fixture) => mutateJson(fixture.specPath, (value) => {
        value.viewports[0].elements[0].note = "Figma 2585:30280 Breadcrumbs_pc";
        value.viewports[0].elements[0].topInSection = 64;
        value.viewports[0].elements[0].provenance.topInSection = "design_context";
      }),
    },
    {
      label: "component manifest draft-only marker",
      expected: "Component manifest contains the draft-only marker draftOnly",
      mutate: (fixture) => mutateJson(fixture.componentsPath, (value) => { value.draftOnly = true; }),
    },
    {
      label: "accessibility exact owner-input-required marker",
      expected: "Accessibility config contains the owner-input-required marker",
      mutate: (fixture) => mutateJson(fixture.accessibilityPath, (value) => { value.fixtureOwnerValue = "OWNER_INPUT_REQUIRED"; }),
    },
    {
      label: "accessibility prefixed owner-input-required marker",
      expected: "Accessibility config contains the owner-input-required marker",
      mutate: (fixture) => mutateJson(fixture.accessibilityPath, (value) => { value.fixtureOwnerValue = "OWNER_INPUT_REQUIRED: fixture"; }),
    },
    {
      label: "reserved p3-drafts input path",
      expected: "reserved draft input directory p3-drafts",
      mutate: (fixture) => mutateJson(fixture.manifestPath, (value) => { value.scope.specPath = `MyBrain/verify/${pathSegment}/spec.json`; }),
    },
    {
      label: "checkpoint-plan owner-input-required array placeholder",
      expected: "Manifest contains the owner-input-required marker",
      mutate: (fixture) => mutateJson(fixture.manifestPath, (value) => { value.scope.checkpointPlan = ["OWNER_INPUT_REQUIRED: fixture checkpoint"]; }),
    },
  ];
  for (const testCase of cases) {
    const fixture = createFixture("p3-figma-gate-draft-preflight-");
    try {
      testCase.mutate(fixture);
      // expected: null は「この変異では落ちない」ことを固定する対称ケース。
      // 落とす検査を足したとき、正しい書き方まで巻き込んでいないかを同じ場所で確かめる。
      if (testCase.expected === null) {
        accept(preflightArgs(fixture), fixture.root);
      } else {
        reject(preflightArgs(fixture), testCase.expected, fixture.root);
        assertNoGateArtifacts(fixture, testCase.label);
      }
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
}

function assertLaterPhaseDraftGuards() {
  const cases = [
    {
      label: "section-start accessibility draft-only marker",
      expected: "Accessibility config contains the draft-only marker draftOnly",
      args: (fixture) => ["section-start", fixture.manifestRelativePath, "fixture-section"],
      mutate: (fixture) => mutateJson(fixture.accessibilityPath, (value) => { value.draftOnly = true; }),
    },
    {
      label: "checkpoint manifest owner-input-required marker",
      expected: "Manifest contains the owner-input-required marker",
      args: (fixture) => ["checkpoint", fixture.manifestRelativePath, "fixture-component"],
      mutate: (fixture) => mutateJson(fixture.manifestPath, (value) => { value.scope.checkpointPlan[0] = "OWNER_INPUT_REQUIRED: fixture checkpoint"; }),
      assertNoCheckpointOutput: true,
    },
    {
      label: "close manifest draft-only marker",
      expected: "Manifest contains the draft-only marker _draftOnly",
      args: (fixture) => ["close", fixture.manifestRelativePath],
      mutate: (fixture) => mutateJson(fixture.manifestPath, (value) => { value._draftOnly = true; }),
    },
  ];
  for (const testCase of cases) {
    const fixture = createFixture("p3-figma-gate-draft-phase-");
    try {
      preflightFixture(fixture);
      const before = snapshotGateArtifacts(fixture, testCase.label);
      testCase.mutate(fixture);
      reject(testCase.args(fixture), testCase.expected, fixture.root);
      assertGateArtifactsUnchanged(before, testCase.label);
      if (testCase.assertNoCheckpointOutput) {
        assert(
          !existsSync(join(fixture.root, "MyBrain", "verify", "checkpoints", "fixture-gate")),
          `${testCase.label}: draft rejection happens before any browser-checkpoint output is written`
        );
      }
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
}

function validReleaseRecord() {
  return {
    version: 1,
    status: "pending",
    ownerApproved: true,
    ownerApprovedAt: "2026-08-12T00:00:00.000Z",
    deploymentId: "fixture-release",
    publicUrl: "https://release.example.test/",
  };
}

function assertReleaseCheckRecordGuards() {
  const rejectedFixture = createFixture("p3-figma-gate-release-draft-");
  try {
    prepareClosedReleaseFixture(rejectedFixture);
    writeJson(rejectedFixture.releaseRecordPath, { ...validReleaseRecord(), draftOnly: true });
    const before = snapshotGateArtifacts(rejectedFixture, "release-check draft record");
    const releaseRecordSha256 = sha256(rejectedFixture.releaseRecordPath);
    reject(
      ["release-check", rejectedFixture.manifestRelativePath, rejectedFixture.releaseRecordRelativePath],
      "Release check record contains the draft-only marker draftOnly",
      rejectedFixture.root
    );
    assertGateArtifactsUnchanged(before, "release-check draft record");
    assert(
      sha256(rejectedFixture.releaseRecordPath) === releaseRecordSha256,
      "release-check draft record remains byte-identical after rejection"
    );
  } finally {
    rmSync(rejectedFixture.root, { recursive: true, force: true });
  }

  const acceptedFixture = createFixture("p3-figma-gate-release-pass-");
  try {
    prepareClosedReleaseFixture(acceptedFixture);
    writeJson(acceptedFixture.releaseRecordPath, validReleaseRecord());
    accept(
      ["release-check", acceptedFixture.manifestRelativePath, acceptedFixture.releaseRecordRelativePath],
      acceptedFixture.root
    );
    const releaseRecord = readJson(acceptedFixture.releaseRecordPath);
    const state = readJson(gateArtifactPaths(acceptedFixture).activePath);
    assert(releaseRecord.status === "passed", "valid release record reaches passed state through the CLI");
    assert(typeof releaseRecord.executedAt === "string" && releaseRecord.executedAt.length > 0, "valid release record records execution time");
    assert(releaseRecord.browserBatchEvidence?.chromeMode === "fixture", "valid release record records the disposable browser-batch evidence");
    assert(state.releaseCheck?.recordPath === acceptedFixture.releaseRecordRelativePath, "active state records the passed release record path");
  } finally {
    rmSync(acceptedFixture.root, { recursive: true, force: true });
  }
}

function assertIdentityArgumentGuards() {
  const root = mkdtempSync(join(tmpdir(), "p3-figma-gate-identity-"));
  try {
    // The preflight parser must reject malformed identity input before it opens
    // a manifest or can create a gate state.
    reject(["preflight", "missing.json"], "preflight requires exactly", root);
    reject(
      ["preflight", "missing.json", "--implementation-actor", "codex", "--implementation-actor", "duplicate", "--implementation-context-id", "ctx"],
      "preflight received duplicate implementation identity flag",
      root
    );
    reject(
      ["preflight", "missing.json", "--implementation-actor", "codex", "--implementation-context-id", "ctx", "--unexpected", "value"],
      "preflight accepts only",
      root
    );

    // Condition identity is a preflight-only input. Every later CLI phase must
    // reject it before it reads state, a manifest, release input, or a browser.
    for (const [phase, phaseArgs] of [
      ["checkpoint", ["missing.json", "fixture-element"]],
      ["section-start", ["missing.json", "fixture-section"]],
      ["section-close", ["missing.json", "fixture-section"]],
      ["close", ["missing.json"]],
      ["release-check", ["missing.json", "fixture-release.json"]],
    ]) {
      reject(
        [phase, ...phaseArgs, "--implementation-actor", "codex", "--implementation-context-id", "ctx"],
        `${phase} rejects --implementation-actor`,
        root
      );
    }

    // Active state version 4 (the v12 state schema) cannot advance under the
    // v13 scoped-roots state schema. The manifest itself intentionally needs no valid schema because
    // state-version rejection happens first.
    const legacyRoot = mkdtempSync(join(tmpdir(), "p3-figma-gate-legacy-state-"));
    try {
      const legacyManifest = join(legacyRoot, "fixture-manifest.json");
      writeJson(legacyManifest, {});
      mkdirSync(join(legacyRoot, ".figma-gate"), { recursive: true });
      writeJson(join(legacyRoot, ".figma-gate", "active.json"), {
        version: 4,
        phase: "preflight",
        manifestPath: legacyManifest,
        implementationIdentity,
      });
      reject(
        ["checkpoint", "fixture-manifest.json", "fixture-element"],
        "checkpoint requires active Figma gate state version 5 with implementationIdentity, frozen responsiveHtml, and scoped-roots/v1 node-map inputs; active state version 4 (v12) is rejected",
        legacyRoot
      );
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true });
    }

    // The shared manifest must not reintroduce a condition-specific identity.
    // This is tested before any unrelated manifest validation occurs.
    const identityManifest = join(root, "identity-manifest.json");
    writeJson(identityManifest, { id: "fixture", scope: { implementationActor: "codex" } });
    reject(
      ["preflight", "identity-manifest.json", "--implementation-actor", "codex", "--implementation-context-id", "ctx"],
      "manifest.scope.implementationActor is not allowed in v13",
      root
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// 他scopeが受領証を保持しているときの preflight の扱い。2026-08-25 の独立レビューで
// この検査が figma-gate.e2e に無いことが判明し、案件側の旧e2eから書き直して持ち込んだ。
//
// 当初は「保持者がいれば必ず止まる」を固定していた。これは受領証が1枠（active.json）
// だった頃の契約である。同じ 2026-08-25 に、オーナー指摘 concurrent-scope-blocked-by-
// repo-wide-baseline を受けて受領証を scope ごと（active/<manifestId>.json）へ分け、
// 判定を scope-conflict-audit のパス交差へ寄せた。枠の奪い合いが構造的に起きなくなった
// ため、交差しない他scopeを止める理由は無くなっている。
//
// そこで固定する性質を2つに分ける。どちらの場合も、保持中の受領証を書き換えないこと
// （独立レビューが守りたかった性質）は変わらない。
//   1. 宣言パスが交差しない … preflightは通り、保持中の受領証はバイト単位で不変
//   2. 宣言パスが交差する  … preflightは交差パスを名指しして止まり、成果物を残さない
function assertHeldReceiptBlocksPreflight() {
  // 受領証は scope ごとに1ファイル。保持者の受領証を実形式で置く。
  const heldReceiptRelativePath = join(".figma-gate", "active", "another-scope-holding-the-receipt.json");

  // 受領証が指す先が実在しないと、保持の検査へ到達する前に別の理由で落ちる。
  // 保持者の識別は state.manifestId から行われる（scope-conflict-audit.mjs）。
  function placeHeldReceipt(fixture, heldChangeTargets) {
    const heldManifestPath = join(fixture.root, "another-scope-manifest.json");
    writeJson(heldManifestPath, {
      id: "another-scope-holding-the-receipt",
      scope: { changeTargets: heldChangeTargets, deleteTargets: [] },
    });
    const heldReceiptPath = join(fixture.root, heldReceiptRelativePath);
    mkdirSync(dirname(heldReceiptPath), { recursive: true });
    writeJson(heldReceiptPath, {
      version: 5,
      phase: "preflight",
      manifestId: "another-scope-holding-the-receipt",
      manifestPath: heldManifestPath,
    });
    return { heldReceiptPath, heldSha256: sha256(heldReceiptPath) };
  }

  // 1. 交差しないので並行して進める。保持中の受領証は触らない。
  const parallel = createFixture("p3-figma-gate-held-receipt-parallel-");
  try {
    const { heldReceiptPath, heldSha256 } = placeHeldReceipt(parallel, ["site/another-scope.txt"]);
    const attempt = accept(preflightArgs(parallel), parallel.root);
    assert(
      attempt.output.includes("Running scope conflict audit"),
      "held receipt (disjoint): preflight reaches the scope conflict audit"
    );
    assert(
      attempt.output.includes("宣言パスが交差しないため並行して進めます"),
      `held receipt (disjoint): preflight reports why it may proceed (output=${JSON.stringify(attempt.output)})`
    );
    assert(
      sha256(heldReceiptPath) === heldSha256,
      "held receipt (disjoint): an accepted preflight leaves another scope's receipt byte-identical"
    );
  } finally {
    rmSync(parallel.root, { recursive: true, force: true });
  }

  // 2. 交差するので止まる。交差パスを名指しし、成果物を残さない。
  const conflicting = createFixture("p3-figma-gate-held-receipt-conflict-");
  try {
    // フィクスチャ自身の changeTargets は site/view.txt。保持者を同じパスに重ねる。
    const { heldReceiptPath, heldSha256 } = placeHeldReceipt(conflicting, ["site/view.txt"]);
    const attempt = reject(
      preflightArgs(conflicting),
      "Figma gate受領証は another-scope-holding-the-receipt が保持中で、次の宣言パスが交差します: site/view.txt。",
      conflicting.root
    );
    assert(
      attempt.output.includes("Running scope conflict audit"),
      "held receipt (overlapping): preflight reaches the scope conflict audit instead of stopping earlier"
    );
    assert(
      sha256(heldReceiptPath) === heldSha256,
      "held receipt (overlapping): a rejected preflight leaves another scope's receipt byte-identical"
    );
    assert(
      !existsSync(resolveRuntimeReceiptPath(conflicting.directory)),
      "held receipt (overlapping): a rejected preflight does not create page-coverage runtime"
    );
  } finally {
    rmSync(conflicting.root, { recursive: true, force: true });
  }
}

function assertDirtyPreflightLeavesNoCoverageRuntime() {
  const fixture = createFixture("p3-figma-gate-dirty-preflight-");
  try {
    writeFileSync(join(fixture.root, "site", "view.txt"), "dirty declared target\n", "utf8");
    reject(preflightArgs(fixture), "these change targets were already edited before preflight", fixture.root);
    assertNoGateArtifacts(fixture, "dirty preflight");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertResponsiveHtmlV12SchemaGuards() {
  const cases = [
    {
      label: "v11 responsive schema without deferredSourceFiles",
      expected: "manifest.scope.responsiveHtml must contain exactly sourceFiles, deferredSourceFiles, and exceptions.",
      mutate: (value) => { delete value.scope.responsiveHtml.deferredSourceFiles; },
    },
    {
      label: "responsive schema unknown field",
      expected: "manifest.scope.responsiveHtml must contain exactly sourceFiles, deferredSourceFiles, and exceptions.",
      mutate: (value) => { value.scope.responsiveHtml.untrustedBypass = true; },
    },
    {
      label: "deferred source outside sourceFiles",
      expected: "manifest.scope.responsiveHtml.deferredSourceFiles must be declared in sourceFiles: site/new.html",
      mutate: (value) => { value.scope.responsiveHtml.deferredSourceFiles = ["site/new.html"]; },
    },
    {
      label: "deferred source outside changeTargets",
      expected: "manifest.scope.responsiveHtml.deferredSourceFiles must be declared changeTargets: site/other.html",
      mutate: (value) => {
        value.scope.responsiveHtml.sourceFiles = ["site/view.txt", "site/other.html"];
        value.scope.responsiveHtml.deferredSourceFiles = ["site/other.html"];
      },
    },
    {
      label: "deferred source already exists at preflight",
      expected: "manifest.scope.responsiveHtml.deferredSourceFiles must be absent at preflight: site/view.txt",
      mutate: (value) => { value.scope.responsiveHtml.deferredSourceFiles = ["site/view.txt"]; },
    },
  ];
  for (const testCase of cases) {
    const fixture = createFixture("p3-figma-gate-responsive-schema-");
    try {
      mutateJson(fixture.manifestPath, testCase.mutate);
      reject(preflightArgs(fixture), testCase.expected, fixture.root);
      assertNoGateArtifacts(fixture, testCase.label);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
}

function assertScopedNodeMapV13Guards() {
  const cases = [
    {
      label: "root-wide v12 node map",
      expected: "node map must use version 2 schema scoped-roots/v1; root-wide v12 node maps are rejected.",
      mutate: (value) => {
        value.version = 1;
        delete value.schema;
        value.figma = { fileKey: "fixture-file", rootNodeId: "fixture-pc-page-root", source: "legacy root-wide fixture" };
        delete value.sourceEvidence;
        delete value.scopeRoots;
        for (const entry of value.inventory.nodes) delete entry.scopeRootNodeId;
        for (const entry of value.nodes) delete entry.scopeRootNodeId;
      },
    },
    {
      label: "missing scoped root",
      expected: "node map.scopeRoots must contain exactly four scoped roots: PC/SP first-view and header.",
      mutate: (value) => { value.scopeRoots.pop(); },
    },
    {
      label: "duplicate scoped root topology",
      expected: "duplicates scoped root sp::first-view",
      mutate: (value) => { value.scopeRoots[3] = { ...value.scopeRoots[2] }; },
    },
    {
      label: "unpaired PC/SP scope roots",
      expected: "node map.scopeRoots first-view PC/SP entries must name each other as pairedScopeRootNodeId.",
      mutate: (value) => { value.scopeRoots[0].pairedScopeRootNodeId = "fixture-sp-header"; },
    },
    {
      label: "canonical root lacks PC page-root source evidence",
      expected: "node map.figma.canonicalRootNodeId must have exactly one matching Figma node evidence record",
      mutate: (value) => { value.figma.canonicalRootNodeId = "fixture-pc-first-view"; },
    },
    {
      label: "node evidence binding hash mismatch",
      expected: "node map.sourceEvidence.nodeEvidenceSha256 does not match manifest.figma.nodeEvidencePath bytes.",
      mutate: (value) => { value.sourceEvidence.nodeEvidenceSha256 = "0".repeat(64); },
    },
    {
      label: "inventory node without a classification within a scoped root",
      expected: "node map does not classify every Figma node within the declared scoped roots.",
      mutate: (value) => {
        value.inventory.nodes.push({
          figmaNodeId: "fixture-pc-unclassified-child",
          viewport: "pc",
          scopeRootNodeId: "fixture-pc-first-view",
        });
      },
    },
    {
      label: "node assigned to an undeclared scoped root",
      expected: "node map.nodes[0].scopeRootNodeId must identify a declared PC scope root: fixture-pc-unknown-root.",
      mutate: (value) => { value.nodes[0].scopeRootNodeId = "fixture-pc-unknown-root"; },
    },
  ];
  for (const testCase of cases) {
    const fixture = createFixture("p3-figma-gate-scoped-node-map-");
    try {
      mutateJson(fixture.nodeMapPath, testCase.mutate);
      reject(preflightArgs(fixture), testCase.expected, fixture.root);
      assertNoGateArtifacts(fixture, testCase.label);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  const ancestryFixture = createFixture("p3-figma-gate-scoped-node-map-ancestry-");
  try {
    const pageRootMetadataPath = join(ancestryFixture.directory, "metadata-pc-page-root.json");
    mutateJson(pageRootMetadataPath, (value) => {
      value.raw = '<frame id="fixture-pc-page-root" />';
    });
    mutateJson(ancestryFixture.nodeEvidencePath, (value) => {
      const pageRoot = value.evidence.find((entry) => entry.viewport === "pc" && entry.role === "page-root");
      pageRoot.metadataSha256 = sha256(pageRootMetadataPath);
    });
    mutateJson(ancestryFixture.nodeMapPath, (value) => {
      value.sourceEvidence.nodeEvidenceSha256 = sha256(ancestryFixture.nodeEvidencePath);
    });
    reject(
      preflightArgs(ancestryFixture),
      "node map.scopeRoots[0].figmaNodeId is not present in the saved PC page-root metadata bytes",
      ancestryFixture.root
    );
    assertNoGateArtifacts(ancestryFixture, "scope-root ancestry absent from saved page-root metadata");
  } finally {
    rmSync(ancestryFixture.root, { recursive: true, force: true });
  }
}

function assertExistingResponsiveHtmlStillValidatesAtPreflight() {
  const fixture = createFixture("p3-figma-gate-responsive-existing-");
  try {
    writeFileSync(
      join(fixture.root, "site", "view.txt"),
      '<p class="fixture-copy-pc">same fixture copy</p><p class="fixture-copy-sp">same fixture copy</p>\n',
      "utf8"
    );
    reject(preflightArgs(fixture), "PC/SP duplicate HTML content is prohibited.", fixture.root);
    assertNoGateArtifacts(fixture, "existing responsive source at preflight");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertPreflightDefersPlannedResponsiveHtmlTarget() {
  const fixture = createFixture("p3-figma-gate-responsive-planned-");
  try {
    mutateJson(fixture.manifestPath, (value) => {
      value.scope.changeTargets = ["site/new.html"];
      value.scope.responsiveHtml.sourceFiles = ["site/new.html"];
      value.scope.responsiveHtml.deferredSourceFiles = ["site/new.html"];
      value.scope.w3cSkip = { reason: "Disposable fixture has no web server for W3C validation." };
    });
    preflightFixture(fixture);
    const paths = gateArtifactPaths(fixture);
    const state = readJson(paths.activePath);
    const runtime = readJson(paths.runtimePath);
    assert(existsSync(paths.activePath), "planned missing responsive source: preflight creates active state");
    assert(existsSync(paths.runtimePath), "planned missing responsive source: preflight creates page-coverage runtime");
    assert(state.version === 5, "planned missing responsive source: preflight writes v13 active gate state");
    assert(
      JSON.stringify(state.responsiveHtml) === JSON.stringify({ sourceFiles: ["site/new.html"], deferredSourceFiles: ["site/new.html"] }),
      "planned missing responsive source: active state freezes the exact deferred-source declaration"
    );
    assert(runtime.version === 3, "planned missing responsive source: preflight writes v12 page-coverage runtime");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertResponsiveHtmlSourcesAreRequiredAfterPreflight() {
  const fixture = createFixture("p3-figma-gate-responsive-later-");
  const responsiveSourcePath = join(fixture.root, "site", "responsive.html");
  try {
    writeFileSync(responsiveSourcePath, '<main class="fixture-root">fixture responsive source</main>\n', "utf8");
    mutateJson(fixture.manifestPath, (value) => {
      value.scope.responsiveHtml.sourceFiles = ["site/responsive.html"];
      value.scope.responsiveHtml.deferredSourceFiles = [];
    });
    preflightFixture(fixture);
    const before = snapshotGateArtifacts(fixture, "missing responsive source after preflight");
    rmSync(responsiveSourcePath, { force: true });
    for (const [label, args] of [
      ["checkpoint", ["checkpoint", fixture.manifestRelativePath, "fixture-component"]],
      ["section-close", ["section-close", fixture.manifestRelativePath, "fixture-section"]],
      ["close", ["close", fixture.manifestRelativePath]],
    ]) {
      reject(args, "Responsive HTML source does not exist: site/responsive.html", fixture.root);
      assertGateArtifactsUnchanged(before, `missing responsive source at ${label}`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertDeferredResponsiveHtmlStateIsFrozen() {
  const fixture = createFixture("p3-figma-gate-responsive-frozen-");
  try {
    mutateJson(fixture.manifestPath, (value) => {
      value.scope.changeTargets = ["site/new.html"];
      value.scope.responsiveHtml.sourceFiles = ["site/new.html"];
      value.scope.responsiveHtml.deferredSourceFiles = ["site/new.html"];
      value.scope.w3cSkip = { reason: "Disposable fixture has no web server for W3C validation." };
    });
    preflightFixture(fixture);
    writeFileSync(join(fixture.root, "site", "new.html"), '<main class="fixture-root">created source</main>\n', "utf8");
    const paths = gateArtifactPaths(fixture);
    mutateJson(paths.activePath, (value) => { value.responsiveHtml.deferredSourceFiles = []; });
    const before = snapshotGateArtifacts(fixture, "frozen deferred-source state");
    reject(
      ["checkpoint", fixture.manifestRelativePath, "fixture-component"],
      "Responsive HTML deferredSourceFiles differs from the preflight-frozen state (checkpoint rejected); re-run preflight.",
      fixture.root
    );
    assertGateArtifactsUnchanged(before, "frozen deferred-source state");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertLegacyPageCoverageRuntimeIsRejected() {
  const fixture = createFixture("p3-figma-gate-legacy-coverage-");
  try {
    preflightFixture(fixture);
    const paths = gateArtifactPaths(fixture);
    mutateJson(paths.runtimePath, (value) => { value.version = 2; });
    const before = snapshotGateArtifacts(fixture, "legacy page-coverage runtime");
    reject(
      ["section-start", fixture.manifestRelativePath, "fixture-section"],
      "page coverage runtime must use version 3 with implementationIdentity; re-run preflight",
      fixture.root
    );
    assertGateArtifactsUnchanged(before, "legacy page-coverage runtime");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertResponsiveHtmlSingleDomStillGuardsLaterPhases() {
  const fixture = createFixture("p3-figma-gate-responsive-single-dom-");
  try {
    preflightFixture(fixture);
    writeFileSync(
      join(fixture.root, "site", "view.txt"),
      '<p class="fixture-copy-pc">same fixture copy</p><p class="fixture-copy-sp">same fixture copy</p>\n',
      "utf8"
    );
    const before = snapshotGateArtifacts(fixture, "responsive single-DOM checkpoint");
    reject(
      ["checkpoint", fixture.manifestRelativePath, "fixture-component"],
      "PC/SP duplicate HTML content is prohibited.",
      fixture.root
    );
    assertGateArtifactsUnchanged(before, "responsive single-DOM checkpoint");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// 上位層を読めない環境では、manifestの中身に関係なくpreflightを開始させない。
function assertWorkflowPreflightGuards() {
  const fixture = createFixture("figma-gate-workflow-preflight-");
  try {
    assertNoGateArtifacts(fixture, "before the workflow-preflight guard");
    reject(
      preflightArgs(fixture),
      "workflow-preflight rejected this environment",
      fixture.root,
      { FIGMA_TO_CODE_ROOT: cloudWorkflowRoot }
    );
    assertNoGateArtifacts(fixture, "after a cloud-restricted workflow-preflight verdict");

    reject(
      preflightArgs(fixture),
      "workflow-preflight not found",
      fixture.root,
      { FIGMA_TO_CODE_ROOT: missingWorkflowRoot }
    );
    assertNoGateArtifacts(fixture, "after an unreachable workflow-preflight");

    // 同じmanifestが、判定がlocalなら通ることまで示す（拒否理由が環境判定であることの確認）
    accept(preflightArgs(fixture), fixture.root);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// 着手宣言（WORKFLOW.md「着手前ゲート」の5点）を受領証として要求し、manifestと
// 突き合わせる。非空文字列が並んでいるだけの複製が通らないことまで固定する。
function assertStartDeclarationGuards() {
  const declarationRelativePath = "MyBrain/verify/fixture/start-declaration.json";
  const cases = [
    {
      label: "startDeclarationPath 未宣言",
      expected: "manifest.scope.startDeclarationPath is required",
      mutate: (fixture) => mutateJson(fixture.manifestPath, (value) => { delete value.scope.startDeclarationPath; }),
    },
    {
      label: "宣言ファイルが実在しない",
      expected: "start declaration does not exist",
      mutate: (fixture) => rmSync(join(fixture.directory, "start-declaration.json")),
    },
    {
      label: "別scopeの宣言を複製",
      expected: "must match manifest.id",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.scopeId = "another-scope"; }),
    },
    {
      label: "fileKeyがmanifestと違う",
      expected: "must match manifest.figma.fileKey",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.figma.fileKey = "other-file"; }),
    },
    {
      label: "宣言したnodeが実装対象に無い",
      expected: "manifest.figma.viewportNodes does not contain",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.figma.nodeIds.pc = ["fixture-pc-unrelated"]; }),
    },
    {
      label: "SP側のnodeを宣言していない",
      expected: "figma.nodeIds.sp",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.figma.nodeIds.sp = []; }),
    },
    {
      label: "specの所在がmanifestと違う",
      expected: "must match manifest.scope.specPath",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.specPath = "MyBrain/verify/fixture/other-spec.json"; }),
    },
    {
      label: "scope lockを開始していない",
      expected: "scopeLockStatePath does not exist",
      mutate: (fixture) => rmSync(join(fixture.directory, "scope-lock.state.json")),
    },
    // ここから scope lock state の構造契約（2026-09-01 追加）。
    // それまで gate は存在確認しかしておらず、下記はすべて preflight を通っていた。
    {
      label: "scope lock state が最小の偽物（旧fixtureの形）",
      expected: 'state.kind は "figma-scope-lock-state"',
      mutate: (fixture) =>
        writeJson(join(fixture.directory, "scope-lock.state.json"), {
          status: "active",
          allowedPaths: ["site/view.txt"],
        }),
    },
    {
      label: "scope lock state が blocked",
      expected: "この状態で編集工程を進めてはならない",
      mutate: (fixture) => mutateJson(join(fixture.directory, "scope-lock.state.json"), (value) => { value.status = "blocked"; }),
    },
    {
      label: "scope lock state が別scopeのもの",
      expected: "scopeId が対象scopeと一致しない",
      mutate: (fixture) => mutateJson(join(fixture.directory, "scope-lock.state.json"), (value) => { value.scope.scopeId = "other-scope"; }),
    },
    {
      label: "scope lock state ではなく scope manifest を指している",
      expected: 'state.kind は "figma-scope-lock-state"',
      mutate: (fixture) =>
        writeJson(join(fixture.directory, "scope-lock.state.json"), {
          version: 1,
          scopeId: "fixture-gate",
          task: "fixture",
          ownerInstruction: "fixture: manifestをstateとして宣言した場合",
          repoPath: fixture.root,
          allowedPaths: ["site/view.txt"],
        }),
    },
    {
      label: "scope lock state の status が未知の値",
      expected: "state.status は active か blocked",
      mutate: (fixture) => mutateJson(join(fixture.directory, "scope-lock.state.json"), (value) => { value.status = "verified"; }),
    },
    {
      label: "scope lock state の controlPaths が1件しかない",
      expected: "controlPaths は manifest と state を含む2要素以上",
      mutate: (fixture) => mutateJson(join(fixture.directory, "scope-lock.state.json"), (value) => { value.controlPaths = value.controlPaths.slice(0, 1); }),
    },
    {
      label: "scope lock state の baseline が配列でない",
      expected: "state.baseline は配列",
      mutate: (fixture) => mutateJson(join(fixture.directory, "scope-lock.state.json"), (value) => { value.baseline = {}; }),
    },
    {
      label: "scope lock state の baseline に重複パスがある",
      expected: "baseline に重複したパスがある",
      mutate: (fixture) =>
        mutateJson(join(fixture.directory, "scope-lock.state.json"), (value) => {
          value.baseline = [{ path: "site/view.txt", sha256: null }, { path: "site/view.txt", sha256: null }];
        }),
    },
    {
      label: "scope lock state の allowedPaths が空",
      expected: "allowedPaths は非空配列",
      mutate: (fixture) => mutateJson(join(fixture.directory, "scope-lock.state.json"), (value) => { value.scope.allowedPaths = []; }),
    },
    {
      label: "scope外パスがchangeTargetでもある",
      expected: "is also a changeTarget",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.outOfScopePaths = ["site/view.txt"]; }),
    },
    {
      label: "オーナー指示が実質空",
      expected: "ownerInstruction must record",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.ownerInstruction = "直して"; }),
    },
    {
      label: "環境判定がlocalでない",
      expected: 'environmentPreflight.mode must be "local"',
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.environmentPreflight.mode = "cloud-restricted"; }),
    },
    {
      label: "declaredAtが時刻でない",
      expected: "declaredAt must be an ISO 8601 timestamp",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => { value.declaredAt = "きのう"; }),
    },
    // 2026-08-29 追加。着手宣言を「ゲートを通す書類」として使い回す経路を塞ぐ。
    // 実測（rpa-technologies-theme）: 新しい依頼に対し、3日前の依頼文と3日前の日付を書いた
    // 宣言が作られた。形式はすべて満たすが、目の前の依頼を表していない。
    {
      label: "declaredAtが24時間より古い（前回の宣言の使い回し）",
      expected: "着手宣言は着手時点の記録なので、24時間より古い宣言で preflight は通せない",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => {
        value.declaredAt = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      }),
    },
    {
      label: "declaredAtが未来（時計をずらして鮮度検査を通す）",
      expected: "着手宣言は着手時点の記録であり、未来の日付では作れない",
      mutate: (fixture) => mutateJson(join(fixture.directory, "start-declaration.json"), (value) => {
        value.declaredAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      }),
    },
    {
      label: "ownerInstructionが別scopeの宣言の写し",
      expected: "別scopeの依頼文を写している",
      mutate: (fixture) => {
        const other = validStartDeclaration();
        other.scopeId = "another-scope-declaration";
        writeJson(join(fixture.directory, "start-another-scope.json"), other);
      },
    },
  ];

  for (const testCase of cases) {
    const fixture = createFixture("figma-gate-start-declaration-");
    try {
      testCase.mutate(fixture);
      reject(preflightArgs(fixture), testCase.expected, fixture.root);
      assertNoGateArtifacts(fixture, `after rejecting: ${testCase.label}`);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  // 正しい宣言は通り、受領証へ凍結される。preflight後の書き換えは後続phaseで落ちる。
  const fixture = createFixture("figma-gate-start-declaration-frozen-");
  try {
    const declarationPath = join(fixture.directory, "start-declaration.json");
    const before = sha256(declarationPath);
    accept(preflightArgs(fixture), fixture.root);
    const state = readJson(resolveActiveReceiptPath(fixture.root));
    assert(state.startDeclarationSha256 === before, "preflight freezes the start declaration hash");
    assert(state.startDeclarationPath === declarationRelativePath, "preflight records the start declaration path");
    assert(state.startDeclaredAt === fixtureDeclaredAt, "preflight records when the scope was declared");

    mutateJson(declarationPath, (value) => { value.ownerInstruction = "fixture: 宣言をpreflight後に書き換えた（凍結違反の検査）"; });
    reject(["section-start", fixture.manifestRelativePath, "fixture-section"], "start declaration changed after preflight", fixture.root);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// 工程と停止条件は正本のMarkdownから抽出する。抽出できない環境では通さない。
function assertProcessOutputGuards() {
  const fixture = createFixture("figma-gate-process-output-");
  try {
    // start は着手時点の入口。manifestもspecも無い段階で呼べる。
    const started = gate(["start"], fixture.root);
    assert(started.result.status === 0, "start exits 0");
    assert(started.output.includes("着手前ゲート"), "start prints the pre-start gate points");
    assert(started.output.includes("固定チェックリスト"), "start prints the phase 0 checklist");
    assert(started.output.includes("停止・未確認として報告する条件"), "start prints the stop conditions");
    assert(started.output.includes("URLにnode-idがない"), "start prints stop conditions from the canonical rule text");
    assert(
      started.output.includes("preflight の代わりにならない"),
      "start states that it does not authorize source edits"
    );
    assertNoGateArtifacts(fixture, "after start");

    // preflight は規則の所在だけでなく停止条件も出す。
    const preflighted = gate(preflightArgs(fixture), fixture.root);
    assert(preflighted.result.status === 0, "preflight still succeeds with stop conditions attached");
    assert(preflighted.output.includes("Stop conditions for this scope"), "preflight prints the stop conditions");
    const state = readJson(resolveActiveReceiptPath(fixture.root));
    assert(Array.isArray(state.stopConditions) && state.stopConditions.length > 0, "preflight records the stop conditions in the receipt");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }

  // 正本側の節が改名・欠落したら、工程を出さないまま通すのではなく落ちる。
  const brokenRoot = createWorkflowPreflightStub("local");
  const pipelinePath = join(brokenRoot, "rules", "figma-spec-pipeline.md");
  writeFileSync(pipelinePath, readFileSync(pipelinePath, "utf8").replace("## 停止・未確認として報告する条件", "## 停止条件（改名）"), "utf8");
  const brokenFixture = createFixture("figma-gate-process-missing-section-");
  try {
    reject(["start"], "が正本に見つからない", brokenFixture.root, { FIGMA_TO_CODE_ROOT: brokenRoot });
    reject(preflightArgs(brokenFixture), "が正本に見つからない", brokenFixture.root, { FIGMA_TO_CODE_ROOT: brokenRoot });
    assertNoGateArtifacts(brokenFixture, "after the canonical stop-condition section went missing");
  } finally {
    rmSync(brokenFixture.root, { recursive: true, force: true });
    rmSync(brokenRoot, { recursive: true, force: true });
  }
}

// 正本リポジトリのルートで実行すると、案件側を指す `MyBrain/...` が正本側の公開メモリ
// `MyBrain/`（2026-08-22 追加）へ解決される。`MyBrain/README.md` の「ここに verify/ を作るな」
// だけでは読み手の注意に頼ることになるため、機械で止まることをここで確かめる。
function assertPlaybookRootGuard() {
  const playbookRootFixture = createWorkflowPreflightStub("local");
  const projectFixture = createFixture("figma-gate-playbook-root-");
  try {
    // cwd が正本ルートと一致する呼び出しは、サブコマンドを問わず落ちる。
    for (const args of [
      ["start"],
      ["preflight", "MyBrain/verify/gate-x.json"],
      ["close", "MyBrain/verify/gate-x.json"],
    ]) {
      reject(args, "not at the figma-to-code playbook root", playbookRootFixture, {
        FIGMA_TO_CODE_ROOT: playbookRootFixture,
      });
    }
    // 落ちる前に正本側を触っていない（`MyBrain/` を作らない）。
    assert(
      !existsSync(join(playbookRootFixture, "MyBrain")),
      "the playbook-root guard creates no MyBrain/ in the playbook root"
    );
    // 案件ルートでの通常の呼び出しは、この検査で落ちない。
    const started = gate(["start"], projectFixture.root);
    assert(started.result.status === 0, "start still succeeds at a project repository root");
    assert(
      !started.output.includes("not at the figma-to-code playbook root"),
      "the playbook-root guard does not fire at a project repository root"
    );
    // `versions` は正本側で検証器の版を確認する用途があるため対象外にしている。
    const versions = gate(["versions"], playbookRootFixture, { FIGMA_TO_CODE_ROOT: playbookRootFixture });
    assert(versions.result.status === 0, "versions stays usable at the playbook root");
  } finally {
    rmSync(projectFixture.root, { recursive: true, force: true });
    rmSync(playbookRootFixture, { recursive: true, force: true });
  }
}

function assertEditHookIntegration() {
  const fixture = createFixture("figma-gate-edit-hook-");
  const guard = join(playbookRoot, "tools/codex-edit-guard.mjs");
  const lockPath = join(fixture.directory, "scope-lock.state.json");
  const scopePath = join(fixture.directory, "scope-lock.json");
  const args = ["assert-edit", fixture.manifestRelativePath, implementationIdentity.contextId, "site/view.txt"];
  function guardCli(argv, input) {
    const result = spawnSync(process.execPath, [guard, ...argv], {
      cwd: fixture.root, encoding: "utf8", input,
      env: { ...process.env, FIGMA_TO_CODE_ROOT: localWorkflowRoot },
    });
    assert(result.status === 0, `real hook CLI succeeds: ${result.stderr || result.error || result.stdout}`);
    return JSON.parse(result.stdout);
  }
  const event = { hook_event_name: "PreToolUse", tool_name: "apply_patch", cwd: fixture.root,
    session_id: implementationIdentity.contextId,
    tool_input: { command: "*** Begin Patch\n*** Update File: site/view.txt\n@@\n-before\n+after\n*** End Patch" } };
  const hook = () => guardCli(["hook"], JSON.stringify(event)).hookSpecificOutput.permissionDecision;
  try {
    writeJson(scopePath, validScopeLockState(fixture.root).scope);
    // These are disposable fixture paths under a verified temp directory only.
    assert(dirname(fixture.root) === resolve(tmpdir()), "edit-hook fixture is inside tmpdir");
    rmSync(lockPath);
    run(process.execPath, [join(playbookRoot, "tools/figma-scope-lock.mjs"), "begin", scopePath, lockPath], fixture.root);
    const noPreflight = gate(args, fixture.root);
    assert(noPreflight.result.status !== 0, "assert-edit without preflight rejects");
    assert(hook() === "deny", "real hook without binding denies");
    accept(preflightArgs(fixture), fixture.root);
    const snapshot = snapshotGateArtifacts(fixture, "edit-hook");
    const sourceHash = sha256(join(fixture.root, "site/view.txt"));
    accept(args, fixture.root);
    reject(["assert-edit", fixture.manifestRelativePath, "another-context", "site/view.txt"], "another session/context", fixture.root);
    reject([...args.slice(0, 3), "site/other-view.txt"], "both scope lock and changeTargets", fixture.root);
    guardCli(["bind", fixture.root, implementationIdentity.contextId, lockPath, fixture.manifestRelativePath]);
    assert(hook() === "allow", "real hook connects scope-lock assert AND figma-gate assert-edit");
    const lockBytes = readFileSync(lockPath);
    mutateJson(lockPath, (state) => { state.status = "blocked"; });
    assert(hook() === "deny", "real blocked lock denies hook");
    writeFileSync(lockPath, lockBytes);
    const specBytes = readFileSync(fixture.specPath);
    writeFileSync(fixture.specPath, Buffer.concat([specBytes, Buffer.from("\n")]));
    assert(hook() === "deny", "real frozen spec hash change denies hook");
    writeFileSync(fixture.specPath, specBytes);
    const activeBytes = readFileSync(snapshot.activePath);
    for (const mutate of [
      (state) => { state.phase = "closed"; },
      (state) => { delete state.runtime; },
      (state) => { state.runtime.entrySha256 = "0".repeat(64); },
      (state) => { delete state.runtime.modules[Object.keys(state.runtime.modules)[0]]; },
    ]) {
      mutateJson(snapshot.activePath, mutate);
      assert(hook() === "deny", "closed/incomplete/changed runtime cannot authorize an edit");
      writeFileSync(snapshot.activePath, activeBytes);
    }
    assert(hook() === "allow", "restored matching inputs allow the same request");
    guardCli(["unbind", fixture.root, implementationIdentity.contextId]);
    assert(hook() === "deny", "retired binding can no longer authorize edits");
    assert(readJson(join(fixture.root, ".codex/edit-guard.json")).retired.length === 1, "retirement preserves previous binding history");
    assertGateArtifactsUnchanged(snapshot, "assert-edit is read-only");
    assert(sha256(join(fixture.root, "site/view.txt")) === sourceHash, "hook replay does not dispatch or mutate source");
  } finally {
    assert(dirname(fixture.root) === resolve(tmpdir()), "cleanup target remains within tmpdir");
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// このE2Eは毎回100秒前後かかる（1ケースごとに使い捨てGitリポジトリを作り、実gateを起動するため）。
// 従来は完了行まで一切出力が無く、2026-08-29 の独立検証は90秒で打ち切って「未合格・未確認」と報告した。
// 実際には101秒でPASSしていた。無反応に見える時間を作らないよう、所要目安と各段の進捗を出す。
const STEPS = [
  ["edit hook + real verifier integration (protocol replay)", assertEditHookIntegration],
  ["workflow preflight guards", assertWorkflowPreflightGuards],
  ["start declaration guards", assertStartDeclarationGuards],
  ["process output guards", assertProcessOutputGuards],
  ["playbook root guard", assertPlaybookRootGuard],
  ["identity argument guards", assertIdentityArgumentGuards],
  ["held receipt vs scope conflict", assertHeldReceiptBlocksPreflight],
  ["dirty preflight leaves no runtime", assertDirtyPreflightLeavesNoCoverageRuntime],
  ["responsiveHtml v12 schema", assertResponsiveHtmlV12SchemaGuards],
  ["scoped node-map v13", assertScopedNodeMapV13Guards],
  ["existing responsiveHtml at preflight", assertExistingResponsiveHtmlStillValidatesAtPreflight],
  ["deferred responsiveHtml target", assertPreflightDefersPlannedResponsiveHtmlTarget],
  ["responsiveHtml sources after preflight", assertResponsiveHtmlSourcesAreRequiredAfterPreflight],
  ["deferred responsiveHtml frozen", assertDeferredResponsiveHtmlStateIsFrozen],
  ["legacy page-coverage runtime rejected", assertLegacyPageCoverageRuntimeIsRejected],
  ["responsiveHtml single DOM later phases", assertResponsiveHtmlSingleDomStillGuardsLaterPhases],
  ["preflight draft guards", assertPreflightDraftGuardCases],
  ["later phase draft guards", assertLaterPhaseDraftGuards],
  ["release-check record guards", assertReleaseCheckRecordGuards],
  ["reference image size at preflight", assertFigmaReferenceImageSizeIsCheckedAtPreflight],
  ["owner visual exemption end to end", assertOwnerVisualExemptionClosesAndGuards],
];

const startedAt = Date.now();
const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(0)}s`;
console.log(
  `figma-gate.e2e: 開始（${STEPS.length} 段 / 実測の目安 約100秒）。` +
    "完了行 'figma-gate.e2e: PASS' が出るまで待つこと。途中で打ち切った場合は「打ち切り」であり、不合格ではない。"
);

STEPS.forEach(([label, step], index) => {
  step();
  console.log(`  [${String(index + 1).padStart(2, " ")}/${STEPS.length}] ${elapsed().padStart(4, " ")} ${label}`);
});

for (const root of [localWorkflowRoot, cloudWorkflowRoot, missingWorkflowRoot]) {
  rmSync(root, { recursive: true, force: true });
}

console.log(`figma-gate.e2e: PASS (${assertions} assertions, ${elapsed()})`);
