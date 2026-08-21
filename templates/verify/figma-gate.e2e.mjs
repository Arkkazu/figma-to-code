#!/usr/bin/env node
// P-3 v11 figma-gate CLI regression fixture. Every case uses a disposable
// Git repository and a test-double browser batch. It never starts a browser,
// Figma, P-11, a role, or a pair lifecycle.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
function createWorkflowPreflightStub(mode) {
  const root = mkdtempSync(join(tmpdir(), `figma-gate-workflow-${mode}-`));
  mkdirSync(join(root, "tools"), { recursive: true });
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

function gateArtifactPaths(fixture) {
  return {
    activePath: join(fixture.root, ".figma-gate", "active.json"),
    runtimePath: join(fixture.directory, ".figma-gate", "page-coverage-runtime.json"),
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
    accessibilityPath: join(directory, "accessibility.json"),
    releaseRecordRelativePath: "MyBrain/verify/fixture/release-record.json",
    releaseRecordPath: join(directory, "release-record.json"),
  };
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, "site"), { recursive: true });
  // preflight は scope conflict audit を別プロセスで起動する。実体と両台帳が無いと、
  // このe2eが検証したい内容へ到達する前に落ちる。
  const verifierDirectory = join(root, "MyBrain", "verify");
  for (const name of ["scope-coordination.mjs", "scope-conflict-audit.mjs"]) {
    cpSync(join(dirname(fixturePath), name), join(verifierDirectory, name));
  }
  // 担当者名はこのフィクスチャ固有。台帳で宣言することで、正本に案件の担当者名を
  // 焼き込まずに済む（scope-conflict-audit.mjs の actors 既定を上書きする）。
  writeJson(join(verifierDirectory, "shared-component-ownership.json"), {
    version: 2,
    exclusivePathOwnership: [{ pattern: "**", owner: "fixture-implementation" }],
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
  writeFileSync(join(directory, "search.md"), "fixture search evidence\n", "utf8");
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
  writeJson(fixture.manifestPath, {
    id: "fixture-gate",
    scope: {
      kind: "new",
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
      reject(preflightArgs(fixture), testCase.expected, fixture.root);
      assertNoGateArtifacts(fixture, testCase.label);
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

assertWorkflowPreflightGuards();
assertIdentityArgumentGuards();
assertDirtyPreflightLeavesNoCoverageRuntime();
assertResponsiveHtmlV12SchemaGuards();
assertScopedNodeMapV13Guards();
assertExistingResponsiveHtmlStillValidatesAtPreflight();
assertPreflightDefersPlannedResponsiveHtmlTarget();
assertResponsiveHtmlSourcesAreRequiredAfterPreflight();
assertDeferredResponsiveHtmlStateIsFrozen();
assertLegacyPageCoverageRuntimeIsRejected();
assertResponsiveHtmlSingleDomStillGuardsLaterPhases();
assertPreflightDraftGuardCases();
assertLaterPhaseDraftGuards();
assertReleaseCheckRecordGuards();

for (const root of [localWorkflowRoot, cloudWorkflowRoot, missingWorkflowRoot]) {
  rmSync(root, { recursive: true, force: true });
}

console.log(`figma-gate.e2e: PASS (${assertions} assertions)`);
