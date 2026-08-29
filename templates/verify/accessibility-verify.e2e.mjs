#!/usr/bin/env node
// accessibility-verify.e2e.mjs — Q-13検証器の隔離E2E。
// 実axe-coreの正しさではなく、ローカルsource注入・違反FAIL・CDPキーボード走査の契約を固定する。

import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "accessibility-verify-e2e-"));
const verifyDirectory = join(repo, "MyBrain", "verify");

function write(relativePath, value) {
  const pathname = join(repo, relativePath);
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address().port));
  });
}

function close(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

const page = (axeMode) => `<!doctype html>
<html><head><style>
  body { background: #ffffff; color: #111111; font: 16px/1.5 sans-serif; }
  button, a { color: #111111; background: #ffffff; }
  button:focus, a:focus { outline: 2px solid #005fcc; outline-offset: 2px; }
  #menu[hidden] { display: none; }
  .contrast-case { position: relative; width: 260px; min-height: 32px; margin: 8px; background: #ffffff; }
  .contrast-case p { position: relative; margin: 0; }
  #image-case { background-image: linear-gradient(90deg, #ffffff, #eeeeee); }
  #blend-case { mix-blend-mode: multiply; }
  #background-shell { background-image: linear-gradient(90deg, #111111, #333333); }
  #opaque-cover { background: #ffffff; }
  #opacity-case { opacity: 0.5; }
  #opacity-copy { color: #707070; }
  #ui-opacity-copy { opacity: 0.5; border: 2px solid #707070; }
  #ui-image-copy { background-image: linear-gradient(90deg, #ffffff, #eeeeee); border: 2px solid #111111; }
  #ui-blend-copy { mix-blend-mode: multiply; border: 2px solid #111111; }
  .painted-overlay { position: absolute; z-index: 1; }
  #overlap-image { inset: 0; width: 100%; height: 100%; }
  #overlap-gradient { left: 0; top: 0; bottom: 0; width: 64px; background-image: linear-gradient(90deg, #111111, #333333); }
  #overlap-video, #overlap-canvas { inset: 0; width: 100%; height: 100%; }
</style></head><body data-axe-mode="${axeMode}">
  <button id="menu-toggle" aria-expanded="false">Menu</button>
  <nav id="menu" hidden><a href="#first">First</a><button id="last">Last</button></nav>
  <!-- 初期展開済みのアコーディオン。意図的に開いた状態で描画される正当な実装で、
       案件の共有検索アコーディオン（search-controls.php が aria-expanded="true" と is-open を出力）
       と同じ形。旧実装はこれを検証できずタイムアウトした（2026-08-29 実測）。 -->
  <button id="accordion-open" aria-expanded="true" aria-controls="accordion-panel">Filters</button>
  <div id="accordion-panel"><a href="#acc-first">Acc first</a><button id="acc-last">Acc last</button></div>
  <div id="plain-case" class="contrast-case"><p id="copy">Readable copy</p></div>
  <div id="image-case" class="contrast-case"><p id="image-copy">Image background copy</p></div>
  <div id="blend-case" class="contrast-case"><p id="blend-copy">Blend copy</p></div>
  <div id="background-shell"><div id="opaque-cover" class="contrast-case"><p id="opaque-covered-copy">Covered background copy</p></div></div>
  <div id="opacity-case" class="contrast-case"><p id="opacity-copy">Opacity contrast copy</p></div>
  <div class="contrast-case"><button id="ui-opacity-copy">Opacity UI border</button></div>
  <div class="contrast-case"><button id="ui-image-copy">Image UI border</button></div>
  <div class="contrast-case"><button id="ui-blend-copy">Blend UI border</button></div>
  <div id="overlap-image-case" class="contrast-case"><p id="overlap-image-copy">Image overlay copy</p><img id="overlap-image" class="painted-overlay" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div>
  <div id="overlap-gradient-case" class="contrast-case"><p id="overlap-gradient-copy">Partial gradient overlay copy</p><div id="overlap-gradient" class="painted-overlay"></div></div>
  <div id="overlap-video-case" class="contrast-case"><p id="overlap-video-copy">Video overlay copy</p><video id="overlap-video" class="painted-overlay"></video></div>
  <div id="overlap-canvas-case" class="contrast-case"><p id="overlap-canvas-copy">Canvas overlay copy</p><canvas id="overlap-canvas" class="painted-overlay"></canvas></div>
  <div class="contrast-case"><p id="unresolved-opacity-copy">Unresolved opacity copy</p></div>
  <div class="contrast-case"><p id="unresolved-color-copy">Unresolved color copy</p></div>
  <div class="contrast-case"><p id="hidden-copy" hidden>Hidden copy</p></div>
  <script>
    const toggle = document.querySelector('#menu-toggle');
    const menu = document.querySelector('#menu');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
    });
    const accordion = document.querySelector('#accordion-open');
    const panel = document.querySelector('#accordion-panel');
    accordion.addEventListener('click', () => {
      const open = accordion.getAttribute('aria-expanded') !== 'true';
      accordion.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    window.getComputedStyle = (element, pseudoElement) => {
      const style = nativeGetComputedStyle(element, pseudoElement);
      if (!element || !['unresolved-opacity-copy', 'unresolved-color-copy'].includes(element.id)) return style;
      return new Proxy(style, {
        get(target, property) {
          if (element.id === 'unresolved-opacity-copy' && property === 'opacity') return 'not-a-number';
          if (element.id === 'unresolved-color-copy' && property === 'color') return 'not-a-color';
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
  </script>
</body></html>`;

let server;
try {
  mkdirSync(verifyDirectory, { recursive: true });
  copyFileSync(resolve(templateDirectory, "accessibility-verify.mjs"), join(verifyDirectory, "accessibility-verify.mjs"));
  copyFileSync(resolve(templateDirectory, "cdp-browser.mjs"), join(verifyDirectory, "cdp-browser.mjs"));
  write(
    "MyBrain/verify/axe-fixture.js",
    `const imageAlt = { id: 'image-alt', impact: 'critical', nodes: [{ target: ['img#missing-alt'], html: '<img id="missing-alt">', failureSummary: 'Fix alt text' }] };
const colorContrast = { id: 'color-contrast', impact: 'serious', nodes: [
  { target: ['.brand-a'], html: '<span class="brand-a">a</span>', failureSummary: 'foreground color: #e8374a' },
  { target: ['.brand-b'], html: '<span class="brand-b">b</span>', failureSummary: 'foreground color: #757573' }
] };
globalThis.axe = { run: async () => {
  const mode = document.body.dataset.axeMode;
  if (mode === 'fail') return { violations: [imageAlt] };
  if (mode === 'color') return { violations: [colorContrast, imageAlt] };
  return { violations: [] };
} };`
  );
  write("MyBrain/rules/no-color-check.md", "# 色検査を行わない\n\nオーナー判断の根拠ファイル（e2eフィクスチャ）。\n");
  server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page(url.searchParams.get("axe") || "pass"));
  });
  const port = await listen(server);
  const { runAccessibilityVerification } = await import(pathToFileURL(join(verifyDirectory, "accessibility-verify.mjs")).href);
  const config = {
    viewport: { width: 800, height: 600 },
    viewportPolicy: { scrollbars: "hidden" },
    axe: { sourcePath: "MyBrain/verify/axe-fixture.js" },
    contrast: {
      targets: [
        { id: "copy", selector: "#copy", kind: "text" },
        { id: "image-copy", selector: "#image-copy", kind: "text" },
        { id: "blend-copy", selector: "#blend-copy", kind: "text" },
        { id: "opaque-covered-copy", selector: "#opaque-covered-copy", kind: "text" },
        { id: "ui-image-copy", selector: "#ui-image-copy", kind: "ui", foregroundProperty: "borderTopColor", backgroundScope: "behind" },
        { id: "ui-blend-copy", selector: "#ui-blend-copy", kind: "ui", foregroundProperty: "borderTopColor", backgroundScope: "behind" },
        { id: "overlap-image-copy", selector: "#overlap-image-copy", kind: "text" },
        { id: "overlap-gradient-copy", selector: "#overlap-gradient-copy", kind: "text" },
        { id: "overlap-video-copy", selector: "#overlap-video-copy", kind: "text" },
        { id: "overlap-canvas-copy", selector: "#overlap-canvas-copy", kind: "text" },
        { id: "unresolved-opacity-copy", selector: "#unresolved-opacity-copy", kind: "text" },
        { id: "unresolved-color-copy", selector: "#unresolved-color-copy", kind: "text" },
        { id: "hidden-copy", selector: "#hidden-copy", kind: "text" }
      ]
    },
    keyboard: {
      stateFlows: [
        { name: "menu", triggerSelector: "#menu-toggle" },
        // 初期展開済み。閉じた状態から始まる前提の固定手順では検証できない。
        { name: "accordion", triggerSelector: "#accordion-open" },
      ],
      dialogs: [],
    },
  };
  const pass = await runAccessibilityVerification({
    config: { ...config, url: `http://127.0.0.1:${port}/?axe=pass` },
    reportPath: "MyBrain/verify/reports/pass.json",
    projectRoot: repo,
  });
  const expectedHuman = new Map([
    ["image-copy", "background-image-or-gradient"],
    ["blend-copy", "blend-mode"],
    ["ui-image-copy", "background-image-or-gradient"],
    ["ui-blend-copy", "blend-mode"],
    ["overlap-image-copy", "img-overlaps-target"],
    ["overlap-gradient-copy", "background-image-or-gradient"],
    ["overlap-video-copy", "video-overlaps-target"],
    ["overlap-canvas-copy", "canvas-overlaps-target"],
    ["unresolved-opacity-copy", "color-or-opacity-not-resolved"],
    ["unresolved-color-copy", "color-not-resolved-to-rgba"],
    ["hidden-copy", "target-not-visible"],
  ]);
  for (const [targetId, reason] of expectedHuman) {
    const actual = pass.report.contrast.humanReview.find((entry) => entry.targetId === targetId);
    if (!actual || actual.reason !== reason) throw new Error(`expected ${targetId} to enter humanReview as ${reason}:\n${JSON.stringify(pass.report.contrast, null, 2)}`);
  }
  if (pass.report.contrast.humanReview.some((entry) => entry.targetId === "opaque-covered-copy")) {
    throw new Error(`opaque background must shield an ancestor image from contrast humanReview:\n${JSON.stringify(pass.report.contrast, null, 2)}`);
  }
  if (pass.report.failures.length !== 0 || pass.report.axe.unapprovedViolations.length !== 0 || pass.report.keyboard.failures.length !== 0) {
    throw new Error(`expected accessible fixture to pass:\n${JSON.stringify(pass.report, null, 2)}`);
  }

  const opacityFailureConfig = structuredClone(config);
  opacityFailureConfig.contrast.targets = [
    { id: "opacity-copy", selector: "#opacity-copy", kind: "text" },
    { id: "ui-opacity-copy", selector: "#ui-opacity-copy", kind: "ui", foregroundProperty: "borderTopColor", backgroundScope: "behind" },
  ];
  const opacityFailure = await runAccessibilityVerification({
    config: { ...opacityFailureConfig, url: `http://127.0.0.1:${port}/?axe=pass` },
    reportPath: "MyBrain/verify/reports/opacity-fail.json",
    projectRoot: repo,
  });
  const opacityFailureIds = opacityFailure.report.contrast.failures.map((entry) => entry.targetId).sort();
  if (JSON.stringify(opacityFailureIds) !== JSON.stringify(["opacity-copy", "ui-opacity-copy"])) {
    throw new Error(`expected text and UI opacity-reduced contrast to fail:\n${JSON.stringify(opacityFailure.report.contrast, null, 2)}`);
  }
  const failure = await runAccessibilityVerification({
    config: { ...config, url: `http://127.0.0.1:${port}/?axe=fail` },
    reportPath: "MyBrain/verify/reports/fail.json",
    projectRoot: repo,
  });
  if (failure.report.failures.length === 0 || failure.report.axe.unapprovedViolations.length !== 1 || failure.report.failures[0].type !== "axe-violation") {
    throw new Error(`expected axe violation to fail:\n${JSON.stringify(failure.report, null, 2)}`);
  }
  // ===== colorChecks: オーナー承認による色検査の停止 =====
  //
  // 負のテストが本体である。停止できることより、**エージェントが独断で停止できないこと**と、
  // **停止しても色以外は落ち続けること**を確かめないと、この口は単なる検査の抜け道になる。

  const approvedColorChecks = {
    status: "disabled",
    specPath: "MyBrain/rules/no-color-check.md",
    reason: "ブランド色がAAを僅かに下回るため、案件単位で色検査を停止する",
    ownerApproval: { status: "approved", by: "owner", reference: "MyBrain/rules/no-color-check.md" },
  };

  // 「何かが投げられた」では負のテストにならない。落ちた理由まで固定する。
  async function expectRejected(label, patch, expectedFragment) {
    let threw = null;
    try {
      await runAccessibilityVerification({
        config: { ...structuredClone(config), url: `http://127.0.0.1:${port}/?axe=color`, ...patch },
        reportPath: "MyBrain/verify/reports/rejected.json",
        projectRoot: repo,
      });
    } catch (error) { threw = error; }
    if (!threw) throw new Error(`expected ${label} to be rejected`);
    if (!threw.message.includes(expectedFragment)) {
      throw new Error(`${label} was rejected for the wrong reason.\n  expected to contain: ${expectedFragment}\n  actual: ${threw.message}`);
    }
    return threw;
  }

  // 1. 停止すると色の違反は無視され、色以外は落ち続ける
  const disabledConfig = structuredClone(config);
  disabledConfig.colorChecks = approvedColorChecks;
  disabledConfig.contrast.targets = [
    { id: "opacity-copy", selector: "#opacity-copy", kind: "text" },
    { id: "ui-opacity-copy", selector: "#ui-opacity-copy", kind: "ui", foregroundProperty: "borderTopColor", backgroundScope: "behind" },
  ];
  const disabled = await runAccessibilityVerification({
    config: { ...disabledConfig, url: `http://127.0.0.1:${port}/?axe=color` },
    reportPath: "MyBrain/verify/reports/color-disabled.json",
    projectRoot: repo,
  });
  if (disabled.report.axe.colorChecksDisabled?.skippedNodeCount !== 2) {
    throw new Error(`expected 2 color-contrast nodes to be skipped:\n${JSON.stringify(disabled.report.axe, null, 2)}`);
  }
  if (disabled.report.axe.unapprovedViolations.length !== 1 || disabled.report.axe.unapprovedViolations[0].violation.id !== "image-alt") {
    throw new Error(`expected non-color violations to survive:\n${JSON.stringify(disabled.report.axe.unapprovedViolations, null, 2)}`);
  }
  if (disabled.report.contrast.disabled !== true || disabled.report.contrast.failures.length !== 0 || disabled.report.contrast.entries.length !== 0) {
    throw new Error(`expected contrast measurement to be skipped entirely:\n${JSON.stringify(disabled.report.contrast, null, 2)}`);
  }
  if (!disabled.report.failures.some((entry) => entry.type === "axe-violation")) {
    throw new Error("expected the image-alt failure to keep failing the run");
  }
  if (disabled.report.colorChecks?.ownerApproval?.by !== "owner") {
    throw new Error("expected the owner approval to be recorded in the report");
  }

  // 2. 停止していれば contrast.targets は空でよい。有効なら空は拒否される
  const emptyTargets = structuredClone(disabledConfig);
  emptyTargets.contrast.targets = [];
  const emptyTargetsRun = await runAccessibilityVerification({
    config: { ...emptyTargets, url: `http://127.0.0.1:${port}/?axe=pass` },
    reportPath: "MyBrain/verify/reports/color-disabled-empty.json",
    projectRoot: repo,
  });
  if (emptyTargetsRun.report.failures.length !== 0) {
    throw new Error(`expected an empty target list to be accepted while colour checks are off:\n${JSON.stringify(emptyTargetsRun.report, null, 2)}`);
  }
  await expectRejected("empty contrast.targets while colour checks are enabled", { contrast: { targets: [] } }, "config.contrast.targets must contain");

  // 3. 【負のテスト】承認記録が無い停止は拒否する
  await expectRejected("colorChecks without ownerApproval", { colorChecks: { ...approvedColorChecks, ownerApproval: undefined } }, "config.colorChecks.ownerApproval");
  await expectRejected("colorChecks with a pending approval", {
    colorChecks: { ...approvedColorChecks, ownerApproval: { status: "pending", by: "agent", reference: "x" } },
  }, 'config.colorChecks.ownerApproval.status must be "approved"');

  // 4. 【負のテスト】根拠ファイルが実在しない停止は拒否する
  await expectRejected("colorChecks with a missing specPath", { colorChecks: { ...approvedColorChecks, specPath: "MyBrain/rules/does-not-exist.md" } }, "config.colorChecks.specPath does not exist");

  // 5. 【負のテスト】理由が短い停止は拒否する
  await expectRejected("colorChecks with a short reason", { colorChecks: { ...approvedColorChecks, reason: "不要" } }, "config.colorChecks.reason must state the reason");

  // 6. 【負のテスト】この口が任意ルールの汎用スイッチになっていないこと
  await expectRejected("axe.disableRules is still refused", {
    colorChecks: approvedColorChecks,
    axe: { sourcePath: "MyBrain/verify/axe-fixture.js", disableRules: ["image-alt"] },
  }, "config.axe must not disable, exclude, or override axe rules");
  await expectRejected("unknown colorChecks.status", { colorChecks: { ...approvedColorChecks, status: "off" } }, 'config.colorChecks.status must be "enabled" or "disabled"');

  // 7. 宣言しなければ従来どおり色検査は有効
  const stillEnabled = await runAccessibilityVerification({
    config: { ...structuredClone(config), url: `http://127.0.0.1:${port}/?axe=color` },
    reportPath: "MyBrain/verify/reports/color-enabled.json",
    projectRoot: repo,
  });
  if (stillEnabled.report.axe.colorChecksDisabled !== null || stillEnabled.report.axe.unapprovedViolations.length !== 3) {
    throw new Error(`expected colour checks to stay on by default:\n${JSON.stringify(stillEnabled.report.axe, null, 2)}`);
  }

  console.log("accessibility-verify E2E PASS");
} finally {
  if (server) await close(server);
  rmSync(repo, { recursive: true, force: true });
}