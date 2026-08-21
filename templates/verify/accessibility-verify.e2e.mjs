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
    `globalThis.axe = { run: async () => ({ violations: document.body.dataset.axeMode === 'fail' ? [{ id: 'image-alt', impact: 'critical', nodes: [{ target: ['img#missing-alt'], html: '<img id="missing-alt">', failureSummary: 'Fix alt text' }] }] : [] }) };`
  );
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
    keyboard: { stateFlows: [{ name: "menu", triggerSelector: "#menu-toggle" }], dialogs: [] },
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
  console.log("accessibility-verify E2E PASS");
} finally {
  if (server) await close(server);
  rmSync(repo, { recursive: true, force: true });
}