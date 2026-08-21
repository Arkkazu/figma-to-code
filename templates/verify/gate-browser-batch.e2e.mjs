#!/usr/bin/env node
// gate-browser-batch.e2e.mjs — Q-09 PC/SP batchとQ-13/Q-08の同一CDP session接続を固定する。

import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startHermeticStaticProvider } from "./p3-page-provider.mjs";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "gate-browser-batch-e2e-"));
const verifyDirectory = join(repo, "MyBrain", "verify");
const originalCwd = process.cwd();

function write(relativePath, value) {
  const pathname = join(repo, relativePath);
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeBinary(relativePath, value) {
  const pathname = join(repo, relativePath);
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, value);
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

async function reserveLoopbackPort() {
  const reservation = createServer();
  const port = await listen(reservation);
  await close(reservation);
  return port;
}

const page = `<!doctype html>
<html><head><link rel="stylesheet" href="/fixture.css"><style>
  body { margin: 0; background: #fff; color: #111; font: 16px/1.5 sans-serif; }
  button:focus { outline: 2px solid #005fcc; }
  #panel { width: 160px; height: 40px; opacity: 0; transition: opacity 1s linear; background: #fff; }
  #panel.open { opacity: 1; }
  #low { color: #808080; }
</style></head><body>
  <button id="toggle" aria-expanded="false">Toggle</button>
  <p id="copy">Readable text</p>
  <p id="low">Low contrast text</p>
  <div id="panel">Panel</div>
  <script>
    document.querySelector('#toggle').addEventListener('click', (event) => {
      const open = event.currentTarget.getAttribute('aria-expanded') !== 'true';
      event.currentTarget.setAttribute('aria-expanded', String(open));
      document.querySelector('#panel').classList.toggle('open', open);
    });
  </script>
</body></html>`;

// ページ本文がprovider識別子と同名のmetaを置いても、P-3がDOMを信頼せず
// CDP Networkで観測したresponse headerだけを使うことを固定する。
const pageWithPageControlledMeta = page.replace("</head>", '<meta name="figma-p3-provider" content="page-controlled"><meta name="figma-p3-entry-sha256" content="0"><meta name="figma-p3-bundle-sha256" content="0"></head>');
function hermeticStaticPage({ missingBundleResource = false } = {}) {
  return `<!doctype html>
<html><head><link rel="icon" href="favicon.ico"><link rel="stylesheet" href="fixture.css">${missingBundleResource ? '<link rel="stylesheet" href="missing-bundle.css">' : ""}<style>
  body { margin: 0; background: #fff; color: #111; font: 16px/1.5 sans-serif; }
  button:focus { outline: 2px solid #005fcc; }
  #panel { width: 160px; height: 40px; opacity: 0; transition: opacity 1s linear; background: #fff; }
  #panel.open { opacity: 1; }
</style></head><body>
  <button id="toggle" aria-expanded="false">Toggle</button>
  <p id="copy">Readable text</p>
  <div id="panel">Panel</div>
  <script>
    document.querySelector('#toggle').addEventListener('click', (event) => {
      const open = event.currentTarget.getAttribute('aria-expanded') !== 'true';
      event.currentTarget.setAttribute('aria-expanded', String(open));
      document.querySelector('#panel').classList.toggle('open', open);
    });
  </script>
</body></html>`;
}
// 1 x 1 transparent 32-bit ICO. The positive P-3 fixture must include every
// browser-requested resource rather than silently relying on Chrome not asking
// for a favicon.
const hermeticFavicon = Buffer.from([
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00, 0x30, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  0x28, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);
const providerHeaders = Object.freeze({
  "x-figma-p3-provider": "p3-e2e-marker",
  "x-figma-p3-entry-sha256": "a".repeat(64),
  "x-figma-p3-bundle-sha256": "b".repeat(64),
});
const cspNonce = "p3-e2e-csp-nonce";
const cspPolicy = `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'nonce-${cspNonce}'`;

function baseJob(url, { accessibilityConfig = "MyBrain/verify/accessibility-pass.json", motionConfig = "MyBrain/verify/motion-pass.json", captureJobs = null } = {}) {
  return {
    version: 1,
    url,
    scrollbars: "hidden",
    layout: { specPath: "MyBrain/verify/spec.json" },
    capture: {
      jobs: captureJobs ?? [
        { id: "panel:pc", selector: "#panel", viewport: "pc", viewportWidth: 800, outputPath: "MyBrain/verify/reports/panel-pc.png" },
        { id: "panel:sp", selector: "#panel", viewport: "sp", viewportWidth: 375, outputPath: "MyBrain/verify/reports/panel-sp.png" },
      ],
    },
    accessibility: { configPath: accessibilityConfig, reportPath: "MyBrain/verify/reports/accessibility.json" },
    motion: { configPath: motionConfig, reportPath: "MyBrain/verify/reports/motion.json" },
  };
}

let server;
let externalServer;
const hermeticProviders = [];
try {
  mkdirSync(verifyDirectory, { recursive: true });
  for (const name of [
    "gate-browser-batch.mjs",
    "cdp-browser.mjs",
    "checkpoint-capture.mjs",
    "verify-layout.mjs",
    "accessibility-verify.mjs",
    "motion-verify.mjs",
  ]) {
    copyFileSync(resolve(templateDirectory, name), join(verifyDirectory, name));
  }
  write("MyBrain/verify/axe-fixture.js", "globalThis.axe = { run: async () => ({ violations: [] }) };\n");
  write("MyBrain/verify/spec.json", {
    url: "http://127.0.0.1:0/",
    viewportPolicy: { scrollbars: "hidden" },
    viewports: [
      { width: 800, elements: [{ sel: "#copy", display: "block" }] },
      { width: 375, elements: [{ sel: "#copy", display: "block" }] },
    ],
  });
  const accessibilityBase = {
    viewport: { width: 800, height: 600 },
    viewportPolicy: { scrollbars: "hidden" },
    axe: { sourcePath: "MyBrain/verify/axe-fixture.js" },
    contrast: { targets: [{ id: "copy", selector: "#copy", kind: "text" }] },
    keyboard: { stateFlows: [{ name: "toggle", triggerSelector: "#toggle" }], dialogs: [] },
  };
  write("MyBrain/verify/accessibility-pass.json", accessibilityBase);
  write("MyBrain/verify/accessibility-fail.json", {
    ...accessibilityBase,
    contrast: { targets: [{ id: "low", selector: "#low", kind: "text" }] },
  });
  const motionBase = {
    viewport: { width: 800, height: 600 },
    viewportPolicy: { scrollbars: "hidden" },
    states: [
      { id: "closed", kind: "closed", expected: [{ selector: "#toggle", attributes: { "aria-expanded": "false" } }] },
      {
        id: "intermediate",
        kind: "intermediate",
        sampleAtMs: 80,
        maxSampleLagMs: 500,
        transitionSelector: "#panel",
        action: { type: "click", selector: "#toggle" },
        expected: [{ selector: "#panel", computed: { opacity: { min: 0.01, max: 0.5 } } }],
      },
    ],
  };
  write("MyBrain/verify/motion-pass.json", motionBase);
  write("MyBrain/verify/motion-fail.json", {
    ...motionBase,
    states: [{ id: "wrong-open", kind: "open", action: { type: "click", selector: "#toggle" }, expected: [{ selector: "#toggle", attributes: { "aria-expanded": "false" } }] }],
  });

  externalServer = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    response.end("html { --external-network-should-fail: 1; }");
  });
  const externalPort = await listen(externalServer);
  server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.url === "/fixture.css") {
      response.writeHead(200, { "content-type": "text/css; charset=utf-8", ...providerHeaders });
      response.end("html { color-scheme: light; }");
      return;
    }
    const responseHeaders = {
      "content-type": "text/html; charset=utf-8",
      ...(requestUrl.pathname === "/marker-missing-header" ? {} : providerHeaders),
    };
    let document = requestUrl.pathname.startsWith("/marker") ? pageWithPageControlledMeta : page;
    if (requestUrl.pathname === "/marker-external") {
      document = document.replace("</head>", `<link rel="stylesheet" href="http://127.0.0.1:${externalPort}/external.css"></head>`);
    }
    if (requestUrl.pathname === "/marker-websocket") {
      document = document.replace("</body>", `<script>new WebSocket("ws://127.0.0.1:${externalPort}/socket");</script></body>`);
    }
    if (requestUrl.pathname === "/marker-iframe") {
      document = document.replace("</body>", '<iframe src="/marker-other-document" title="unexpected P-3 document"></iframe></body>');
    }
    if (requestUrl.pathname === "/marker-csp" || requestUrl.pathname === "/marker-webrtc-csp") {
      document = document.replaceAll("<script>", `<script nonce="${cspNonce}">`);
      responseHeaders["content-security-policy"] = cspPolicy;
    }
    if (requestUrl.pathname === "/marker-webrtc-csp") {
      document = document.replace("</body>", `<script nonce="${cspNonce}">try { new RTCPeerConnection(); } catch (_) { /* guard must still record this use */ }</script></body>`);
    }
    response.writeHead(200, responseHeaders);
    response.end(document);
  });
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/`;
  const spec = JSON.parse(readFileSync(join(repo, "MyBrain/verify/spec.json"), "utf8"));
  spec.url = url;
  write("MyBrain/verify/spec.json", spec);

  process.chdir(repo);
  async function expectIdentityRejection(target, identity) {
    const mismatchDirectory = join(verifyDirectory, `${target}-${identity}-mismatch`);
    mkdirSync(mismatchDirectory, { recursive: true });
    copyFileSync(resolve(templateDirectory, "gate-browser-batch.mjs"), join(mismatchDirectory, "gate-browser-batch.mjs"));
    const mismatchedSession = identity === "session" ? "other-session" : "stub-session";
    const mismatchedPid = identity === "pid" ? 654 : 321;
    const identityFor = (kind) => ({
      sessionId: kind === target ? mismatchedSession : "stub-session",
      browserPid: kind === target ? mismatchedPid : 321,
    });
    write(`MyBrain/verify/${target}-${identity}-mismatch/cdp-browser.mjs`, 'export async function startCdpBrowser() { return { sessionId: "stub-session", browserPid: 321, chromeMode: "stub", close: async () => {} }; }\nexport async function navigateAndWait() { return {}; }\nexport async function startP3NetworkTrace() { throw new Error("P-3 network trace must not start for a normal batch job."); }\n');
    const captureIdentity = identityFor("capture");
    write(
      `MyBrain/verify/${target}-${identity}-mismatch/checkpoint-capture.mjs`,
      `export function normalizeCaptureBatch(value) { return value; }\nexport async function runCaptureBatch() { return { browserSessionId: ${JSON.stringify(captureIdentity.sessionId)}, browserPid: ${captureIdentity.browserPid}, captures: [] }; }\n`
    );
    const layoutIdentity = identityFor("layout");
    write(
      `MyBrain/verify/${target}-${identity}-mismatch/verify-layout.mjs`,
      `export async function runLayoutVerificationInBrowser() { return { status: "PASS", passCount: 1, failCount: 0, browserSessionId: ${JSON.stringify(layoutIdentity.sessionId)}, browserPid: ${layoutIdentity.browserPid} }; }\n`
    );
    const reportStub = (functionName, kind) => {
      const reportIdentity = identityFor(kind);
      return `import { mkdirSync, writeFileSync } from "node:fs"; import { dirname, resolve } from "node:path"; export async function ${functionName}({ reportPath }) { const absolutePath = resolve(process.cwd(), reportPath); mkdirSync(dirname(absolutePath), { recursive: true }); const report = { failures: [], humanReview: [], browserSessionId: ${JSON.stringify(reportIdentity.sessionId)}, browserPid: ${reportIdentity.browserPid} }; writeFileSync(absolutePath, JSON.stringify(report)); return { reportPath: absolutePath, report }; }\n`;
    };
    write(`MyBrain/verify/${target}-${identity}-mismatch/accessibility-verify.mjs`, reportStub("runAccessibilityVerificationInBrowser", "accessibility"));
    write(`MyBrain/verify/${target}-${identity}-mismatch/motion-verify.mjs`, reportStub("runMotionVerificationInBrowser", "motion"));
    const { runGateBrowserBatch: runMismatchBatch } = await import(pathToFileURL(join(mismatchDirectory, "gate-browser-batch.mjs")).href);
    const captureJobs = target === "capture"
      ? [{ id: "capture:pc", selector: "#copy", viewport: "pc", viewportWidth: 800, outputPath: `MyBrain/verify/reports/${target}-${identity}.png` }]
      : [];
    const mismatchJob = {
      ...baseJob(url),
      capture: { jobs: captureJobs },
      accessibility: { configPath: "MyBrain/verify/accessibility-pass.json", reportPath: `MyBrain/verify/reports/${target}-${identity}-accessibility.json` },
      motion: { configPath: "MyBrain/verify/motion-pass.json", reportPath: `MyBrain/verify/reports/${target}-${identity}-motion.json` },
    };
    const expectedMessage = target === "layout"
      ? "layout verification was not produced by the batch CDP session"
      : target === "capture"
        ? "capture was not produced by the Q-09 batch CDP session"
        : "report was not produced by the batch CDP session";
    try {
      await runMismatchBatch(mismatchJob);
      throw new Error(`${target} ${identity} mismatch must reject the batch.`);
    } catch (error) {
      if (!String(error.message).includes(expectedMessage)) throw error;
    }
  }
  const { runGateBrowserBatch } = await import(pathToFileURL(join(verifyDirectory, "gate-browser-batch.mjs")).href);
  for (const target of ["layout", "capture", "accessibility", "motion"]) {
    await expectIdentityRejection(target, "session");
    await expectIdentityRejection(target, "pid");
  }
  const pass = await runGateBrowserBatch(baseJob(url));
  if (pass.status !== "PASS" || pass.captures.length !== 2 || pass.accessibility.failures !== 0 || pass.motion.failures !== 0) {
    throw new Error(`expected batch to pass:\n${JSON.stringify(pass, null, 2)}`);
  }
  const sessionIds = new Set([
    pass.browserSessionId,
    ...pass.captures.map((capture) => capture.browserSessionId),
    pass.layout.browserSessionId,
    pass.accessibility.browserSessionId,
    pass.motion.browserSessionId,
  ]);
  if (sessionIds.size !== 1 || ![pass.browserPid, ...pass.captures.map((capture) => capture.browserPid), pass.layout.browserPid, pass.accessibility.browserPid, pass.motion.browserPid].every((pid) => pid === pass.browserPid)) {
    throw new Error(`Q-09/Q-13/Q-08 must use one CDP session and Chrome process:\n${JSON.stringify(pass, null, 2)}`);
  }
  for (const report of ["MyBrain/verify/reports/accessibility.json", "MyBrain/verify/reports/motion.json"]) {
    if (!existsSync(join(repo, report))) throw new Error(`batch report is missing: ${report}`);
  }
  if (pass.p3Hermetic !== false || pass.pageIdentity !== null) {
    throw new Error(`ordinary gate batch must not acquire P-3 page identity evidence:\n${JSON.stringify(pass, null, 2)}`);
  }
  const ordinaryCheckpoint = await runGateBrowserBatch({ ...baseJob(url), checkpointElementId: "ordinary-checkpoint", preflightId: "8f4976f3-4d73-4e28-9a17-4a07acee9f18", p3Hermetic: false });
  if (ordinaryCheckpoint.status !== "PASS" || ordinaryCheckpoint.p3Hermetic !== false || ordinaryCheckpoint.pageIdentity !== null) {
    throw new Error(`ordinary gate checkpoint evidence must not enable P-3 network requirements:\n${JSON.stringify(ordinaryCheckpoint, null, 2)}`);
  }

  const markerUrl = `${url}marker`;
  const markerPass = await runGateBrowserBatch({ ...baseJob(markerUrl), checkpointElementId: "p3-checkpoint", preflightId: "8f4976f3-4d73-4e28-9a17-4a07acee9f18", p3Hermetic: true });
  if (!markerPass.pageIdentity || markerPass.pageIdentity.loadedUrl !== markerUrl || Object.hasOwn(markerPass.pageIdentity, "providerMarker") || Object.hasOwn(markerPass.pageIdentity, "entrySha256") || Object.hasOwn(markerPass.pageIdentity, "bundleMerkleRoot") || !/^[a-f0-9]{64}$/.test(markerPass.pageIdentity.documentHtmlSha256)) {
    throw new Error(`batch must bind P-3 identity through response headers without trusting page-controlled DOM markers:\n${JSON.stringify(markerPass.pageIdentity, null, 2)}`);
  }
  if (markerPass.checkpointElementId !== "p3-checkpoint" || markerPass.preflightId !== "8f4976f3-4d73-4e28-9a17-4a07acee9f18") {
    throw new Error(`P-3 batch identity must bind the checkpoint and preflight instance:\n${JSON.stringify(markerPass, null, 2)}`);
  }
  const network = markerPass.pageIdentity.network;
  if (!network || network.version !== 1 || network.kind !== "p3-hermetic-network-v1" || network.expectedOrigin !== new URL(markerUrl).origin || network.controls?.cacheDisabled !== true || network.controls?.bypassServiceWorker !== true || network.providerHeaders?.providerMarker !== "p3-e2e-marker" || network.providerHeaders?.entrySha256 !== "a".repeat(64) || network.providerHeaders?.bundleMerkleRoot !== "b".repeat(64)) {
    throw new Error(`P-3 batch must retain hermetic CDP network controls and provider headers:\n${JSON.stringify(network, null, 2)}`);
  }
  const expectedPhases = ["q09-layout", "q09-capture", "q13-accessibility", "q08-motion"];
  if (!Array.isArray(network.phases) || network.phases.map((phase) => phase.id).join(",") !== expectedPhases.join(",")) {
    throw new Error(`P-3 network trace must retain all Q-09/Q-13/Q-08 phases:\n${JSON.stringify(network, null, 2)}`);
  }
  for (const phase of network.phases) {
    if (!Array.isArray(phase.resources) || !Array.isArray(phase.documentResponses) || !Array.isArray(phase.navigations) || !Array.isArray(phase.webSockets) || phase.webSockets.length !== 0 || phase.startedAtEpochMs > phase.endedAtEpochMs || phase.navigations.length !== phase.documentResponses.length) {
      throw new Error(`P-3 phase trace is incomplete: ${JSON.stringify(phase, null, 2)}`);
    }
    for (const navigation of phase.navigations) {
      if (!navigation.complete || navigation.mainFrame !== true || navigation.requestedUrl !== markerUrl || navigation.committedUrl !== markerUrl || !navigation.frameId || !navigation.loaderId || navigation.commitObservedAtEpochMs > navigation.loadObservedAtEpochMs || !Array.isArray(navigation.webRtc?.attempts) || navigation.webRtc.attempts.length !== 0) {
        throw new Error(`P-3 navigation must bind a committed/loaded main-frame loader with a clean WebRTC guard: ${JSON.stringify(navigation, null, 2)}`);
      }
      const documentResponse = phase.documentResponses.find((document) => document.frameId === navigation.frameId && document.loaderId === navigation.loaderId && document.responseFrameId === navigation.frameId && document.responseLoaderId === navigation.loaderId);
      if (!documentResponse) throw new Error(`P-3 navigation must have exactly one matching Document request/response: ${JSON.stringify({ phase, navigation }, null, 2)}`);
    }
    for (const resource of phase.resources) {
      if (!resource.url.startsWith(new URL(markerUrl).origin) || !resource.response?.headers || resource.response.headers["x-figma-p3-provider"] !== "p3-e2e-marker" || resource.response.headers["x-figma-p3-entry-sha256"] !== "a".repeat(64) || resource.response.headers["x-figma-p3-bundle-sha256"] !== "b".repeat(64)) {
        throw new Error(`P-3 resource URL/response headers must remain in its static provider trace: ${JSON.stringify(resource, null, 2)}`);
      }
    }
  }
  const cspPass = await runGateBrowserBatch({ ...baseJob(`${url}marker-csp`), checkpointElementId: "p3-csp", preflightId: "8f4976f3-4d73-4e28-9a17-4a07acee9f18", p3Hermetic: true });
  const cspEvidence = cspPass.pageIdentity?.network?.webRtc;
  if (cspPass.status !== "PASS" || !cspEvidence || cspEvidence.kind !== "cdp-pre-document-block-v1" || cspEvidence.cspBypassed !== false || !Array.isArray(cspEvidence.documentContentSecurityPolicies) || !cspEvidence.documentContentSecurityPolicies.every((entry) => entry.value === cspPolicy)) {
    throw new Error(`P-3 WebRTC pre-document block must coexist with, and retain evidence of, the response CSP:\n${JSON.stringify(cspPass, null, 2)}`);
  }
  const emptyCapturePass = await runGateBrowserBatch({ ...baseJob(markerUrl, { captureJobs: [] }), checkpointElementId: "p3-empty-capture", preflightId: "8f4976f3-4d73-4e28-9a17-4a07acee9f18", p3Hermetic: true });
  const emptyCapturePhase = emptyCapturePass.pageIdentity?.network?.phases?.find((phase) => phase.id === "q09-capture");
  if (emptyCapturePass.status !== "PASS" || emptyCapturePass.captures.length !== 0 || !emptyCapturePhase || emptyCapturePhase.documentResponses.length === 0) {
    throw new Error(`P-3 empty capture must issue a provider document probe without changing ordinary capture output:\n${JSON.stringify(emptyCapturePass, null, 2)}`);
  }

  async function expectP3NetworkFailure(pathname, expectedMessage) {
    const failedUrl = new URL(pathname, url).href;
    try {
      await runGateBrowserBatch({ ...baseJob(failedUrl), checkpointElementId: `p3-${pathname}`, preflightId: "8f4976f3-4d73-4e28-9a17-4a07acee9f18", p3Hermetic: true });
      throw new Error(`P-3 ${pathname} must reject invalid network evidence.`);
    } catch (error) {
      if (!String(error.message).includes(expectedMessage)) throw error;
    }
  }
  await expectP3NetworkFailure("/marker-missing-header", "P-3 provider response is missing");
  await expectP3NetworkFailure("/marker-external", "must use the hermetic provider origin");
  await expectP3NetworkFailure("/marker-websocket", "WebSocket traffic is forbidden");
  await expectP3NetworkFailure("/marker-iframe", "requires a 1:1 measured-navigation/document-response count");
  await expectP3NetworkFailure("/marker-webrtc-csp", "WebRTC API use is forbidden");

  // This is intentionally not the hand-written HTTP server above. It proves that
  // the P-3 batch consumes the actual immutable bundle/provider implementation,
  // with the same live Chrome/CDP session for Q-09/Q-13/Q-08.
  async function startRealHermeticFixture(id, { missingBundleResource = false } = {}) {
    const outputRoot = `p3-static/${id}`;
    write(`${outputRoot}/index.html`, hermeticStaticPage({ missingBundleResource }));
    write(`${outputRoot}/fixture.css`, "html { color-scheme: light; }\n");
    writeBinary(`${outputRoot}/favicon.ico`, hermeticFavicon);
    const providerPort = await reserveLoopbackPort();
    const verifyUrl = `http://127.0.0.1:${providerPort}/p3/${id}`;
    const provider = await startHermeticStaticProvider({
      workspaceRoot: repo,
      outputRoot,
      entryPath: "index.html",
      verifyUrl,
      nonce: `${id.length.toString(16).padStart(2, "0")}${"ab".repeat(31)}`,
    });
    hermeticProviders.push(provider);
    return { provider, verifyUrl };
  }

  async function assertActualProviderHeaders(fixture) {
    const expected = {
      "x-figma-p3-provider": fixture.provider.marker,
      "x-figma-p3-entry-sha256": fixture.provider.entrySha256,
      "x-figma-p3-bundle-sha256": fixture.provider.bundle.merkleRoot,
    };
    for (const [resourceUrl, contentType] of [
      [fixture.verifyUrl, "text/html"],
      [new URL("fixture.css", fixture.verifyUrl).href, "text/css"],
      [new URL("favicon.ico", fixture.verifyUrl).href, "image/x-icon"],
    ]) {
      const response = await fetch(resourceUrl);
      if (response.status !== 200) throw new Error(`real hermetic provider must serve ${resourceUrl} with 200, got ${response.status}`);
      for (const [header, value] of Object.entries(expected)) {
        if (response.headers.get(header) !== value) {
          throw new Error(`real hermetic provider response header ${header} does not bind ${resourceUrl}: ${JSON.stringify(response.headers.get(header))}`);
        }
      }
      if (!response.headers.get("content-security-policy") || response.headers.get("cache-control") !== "no-store" || !response.headers.get("content-type")?.startsWith(contentType)) {
        throw new Error(`real hermetic provider response is missing immutable static security headers: ${resourceUrl}`);
      }
    }
  }

  function assertActualHermeticTrace(summary, fixture) {
    if (summary.status !== "PASS" || summary.p3Hermetic !== true || !summary.pageIdentity?.network) {
      throw new Error(`real hermetic provider batch did not return a P-3 PASS trace:\n${JSON.stringify(summary, null, 2)}`);
    }
    if (summary.layout?.failCount !== 0 || summary.captures?.length !== 2 || summary.accessibility?.failures !== 0 || summary.motion?.failures !== 0) {
      throw new Error(`real hermetic provider batch did not complete Q-09/Q-13/Q-08 cleanly:\n${JSON.stringify(summary, null, 2)}`);
    }
    const batchSessionIds = new Set([
      summary.browserSessionId,
      summary.layout?.browserSessionId,
      summary.accessibility?.browserSessionId,
      summary.motion?.browserSessionId,
      ...summary.captures.map((capture) => capture.browserSessionId),
    ]);
    if (batchSessionIds.size !== 1 || [...batchSessionIds][0] !== summary.browserSessionId || ![summary.layout?.browserPid, summary.accessibility?.browserPid, summary.motion?.browserPid, ...summary.captures.map((capture) => capture.browserPid)].every((pid) => pid === summary.browserPid)) {
      throw new Error(`real hermetic provider batch did not use one Chrome/CDP session for Q-09/Q-13/Q-08:\n${JSON.stringify(summary, null, 2)}`);
    }
    if (!Number.isInteger(summary.browserPid) || summary.browserPid <= 0 || !/^cdp-\d+-\d+$/.test(summary.browserSessionId ?? "") || summary.browser?.source !== "CDP Browser.getVersion" || !summary.browser.product || !summary.browser.revision || !summary.browser.userAgent) {
      throw new Error(`real hermetic provider batch did not retain live Chrome/CDP evidence:\n${JSON.stringify(summary, null, 2)}`);
    }
    const network = summary.pageIdentity.network;
    if (network.expectedOrigin !== new URL(fixture.verifyUrl).origin || network.providerHeaders?.providerMarker !== fixture.provider.marker || network.providerHeaders?.entrySha256 !== fixture.provider.entrySha256 || network.providerHeaders?.bundleMerkleRoot !== fixture.provider.bundle.merkleRoot) {
      throw new Error(`real hermetic provider trace headers do not match the provider receipt:\n${JSON.stringify({ provider: fixture.provider, network }, null, 2)}`);
    }
    const phaseIds = ["q09-layout", "q09-capture", "q13-accessibility", "q08-motion"];
    if (network.phases?.map((phase) => phase.id).join(",") !== phaseIds.join(",")) {
      throw new Error(`real hermetic provider must retain Q-09/Q-13/Q-08 phase evidence:\n${JSON.stringify(network, null, 2)}`);
    }
    for (const phase of network.phases) {
      if (!phase.documentResponses?.length || !phase.navigations?.length || phase.resources.length === 0) {
        throw new Error(`real hermetic provider phase is incomplete: ${JSON.stringify(phase, null, 2)}`);
      }
      for (const resource of phase.resources) {
        const response = resource.response;
        if (!response || response.status < 200 || response.status >= 300 || response.headers?.["x-figma-p3-provider"] !== fixture.provider.marker || response.headers?.["x-figma-p3-entry-sha256"] !== fixture.provider.entrySha256 || response.headers?.["x-figma-p3-bundle-sha256"] !== fixture.provider.bundle.merkleRoot) {
          throw new Error(`real hermetic provider resource did not retain its response receipt: ${JSON.stringify({ phase: phase.id, resource }, null, 2)}`);
        }
      }
    }
  }

  const realHermeticFixture = await startRealHermeticFixture("real-pass");
  await assertActualProviderHeaders(realHermeticFixture);
  const realHermeticPass = await runGateBrowserBatch({
    ...baseJob(realHermeticFixture.verifyUrl),
    checkpointElementId: "p3-real-provider-pass",
    preflightId: "8f4976f3-4d73-4e28-9a17-4a07acee9f18",
    p3Hermetic: true,
  });
  assertActualHermeticTrace(realHermeticPass, realHermeticFixture);

  // The missing stylesheet is deliberately referenced by the frozen HTML but is
  // absent from that same provider bundle. A real 404 response must make the CDP
  // trace fail; this is not an external server or a synthetic trace failure.
  const missingResourceFixture = await startRealHermeticFixture("real-missing", { missingBundleResource: true });
  await assertActualProviderHeaders(missingResourceFixture);
  const missingResourceUrl = new URL("missing-bundle.css", missingResourceFixture.verifyUrl).href;
  const missingResourceResponse = await fetch(missingResourceUrl);
  if (missingResourceResponse.status !== 404 || !missingResourceResponse.headers.get("content-security-policy")) {
    throw new Error(`real hermetic provider fixture did not return its missing bundle resource as a protected 404: ${missingResourceUrl} (${missingResourceResponse.status})`);
  }
  try {
    await runGateBrowserBatch({
      ...baseJob(missingResourceFixture.verifyUrl),
      checkpointElementId: "p3-real-provider-missing-resource",
      preflightId: "8f4976f3-4d73-4e28-9a17-4a07acee9f18",
      p3Hermetic: true,
    });
    throw new Error("a static bundle reference to an absent provider resource must fail the P-3 trace.");
  } catch (error) {
    const message = String(error?.message ?? error);
    // Chrome may report an absent stylesheet as a completed 404 response or as
    // a Network.loadingFailed net::ERR_ABORTED before CDP exposes that response.
    // The direct fetch above fixes this exact provider URL as 404; either trace
    // representation must reject the same frozen bundle reference.
    const providerNon2xx = message.includes("P-3 provider response must be 2xx") && message.includes("(404)");
    const abortedProviderResource = message.includes("P-3 network request failed") && message.includes("net::ERR_ABORTED");
    if ((!providerNon2xx && !abortedProviderResource) || !message.includes(missingResourceUrl)) throw error;
  }

  try {
    await runGateBrowserBatch(baseJob(url, { accessibilityConfig: "MyBrain/verify/accessibility-fail.json" }));
    throw new Error("Q-13 contrast failure must reject the gate batch.");
  } catch (error) {
    if (!String(error.message).includes("Q-13 accessibility verification")) throw error;
  }
  try {
    await runGateBrowserBatch(baseJob(url, { motionConfig: "MyBrain/verify/motion-fail.json" }));
    throw new Error("Q-08 state failure must reject the gate batch.");
  } catch (error) {
    if (!String(error.message).includes("Q-08 motion verification")) throw error;
  }
  console.log("gate-browser-batch E2E PASS");
} finally {
  for (const provider of hermeticProviders.reverse()) {
    try { await provider.close(); } catch { /* Preserve the primary E2E failure. */ }
  }
  if (server) await close(server);
  if (externalServer) await close(externalServer);
  try { rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* Windows may retain a transient module handle after PASS. */ }
}
