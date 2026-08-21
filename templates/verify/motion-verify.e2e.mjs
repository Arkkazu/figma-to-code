#!/usr/bin/env node
// motion-verify.e2e.mjs — Q-08状態検証器の隔離E2E。

import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "motion-verify-e2e-"));
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

const page = `<!doctype html>
<html><head><style>
  #hover { opacity: 1; transition: opacity 0.01s linear; }
  #hover:hover { opacity: 0.7; }
  #panel { opacity: 0; transition: opacity 1s linear; }
  #panel.open { opacity: 1; }
  #delayed-panel { opacity: 0; transition: opacity 1s linear; }
  #delayed-panel.open { opacity: 1; }
  #animation-panel { opacity: 0; }
  #animation-panel.open { animation: panel-fade 1s linear forwards; }
  @keyframes panel-fade { from { opacity: 0; } to { opacity: 1; } }
</style></head><body>
  <button id="hover">Hover</button>
  <button id="toggle" aria-expanded="false">Open</button>
  <div id="panel">Panel</div>
  <button id="delayed-toggle">Delayed open</button>
  <div id="delayed-panel">Delayed panel</div>
  <button id="animation-toggle">Animate open</button>
  <div id="animation-panel">Animated panel</div>
  <button id="preaction-toggle">Pre-action control</button>
  <div id="preaction-panel">Pre-action panel</div>
  <a id="navigate" href="/details?from=motion#destination">Navigate</a>
  <a id="navigate-empty-search" href="/details#destination">Navigate without query</a>
  <a id="navigate-empty-hash" href="/details?from=motion">Navigate without hash</a>
  <a id="wrong-hash" href="/details?from=motion#other">Wrong hash</a>
  <a id="invisible-route" href="/invisible#destination">Invisible destination</a>
  <button id="show-destination">Show destination</button>
  <div id="visible-destination" style="display:none">Visible destination</div>
  <button id="no-navigate">No navigation</button>
  <script>
    document.querySelector('#toggle').addEventListener('click', (event) => {
      const open = event.currentTarget.getAttribute('aria-expanded') !== 'true';
      event.currentTarget.setAttribute('aria-expanded', String(open));
      document.querySelector('#panel').classList.toggle('open', open);
    });
    document.querySelector('#panel').addEventListener('transitionstart', () => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      let delayedVerifierTimer = false;
      window.setTimeout = (callback, delay, ...args) => {
        if (!delayedVerifierTimer) {
          delayedVerifierTimer = true;
          return nativeSetTimeout(callback, Number(delay) + 100, ...args);
        }
        return nativeSetTimeout(callback, delay, ...args);
      };
    }, { once: true });
    document.querySelector('#delayed-toggle').addEventListener('click', () => {
      window.setTimeout(() => document.querySelector('#delayed-panel').classList.add('open'), 60);
    });
    document.querySelector('#animation-toggle').addEventListener('click', () => {
      document.querySelector('#animation-panel').classList.add('open');
    });
    document.querySelector('#show-destination').addEventListener('click', () => {
      document.querySelector('#visible-destination').style.display = 'block';
    });
    if (new URLSearchParams(location.search).has('preaction')) {
      const nativeAddEventListener = document.addEventListener.bind(document);
      let dispatched = false;
      document.addEventListener = (type, listener, options) => {
        const result = nativeAddEventListener(type, listener, options);
        if (!dispatched && type === 'transitionstart') {
          dispatched = true;
          queueMicrotask(() => {
            const event = new Event('transitionstart', { bubbles: true });
            Object.defineProperty(event, 'propertyName', { value: 'opacity' });
            document.querySelector('#preaction-panel').dispatchEvent(event);
          });
        }
        return result;
      };
    }
  </script>
</body></html>`;

const detailsPage = `<!doctype html><body><div id="destination" style="display:block">Destination</div></body>`;
const invisiblePage = `<!doctype html><body><div id="invisible-target" style="display:none">Invisible destination</div></body>`;
let server;
try {
  mkdirSync(verifyDirectory, { recursive: true });
  copyFileSync(resolve(templateDirectory, "motion-verify.mjs"), join(verifyDirectory, "motion-verify.mjs"));
  copyFileSync(resolve(templateDirectory, "cdp-browser.mjs"), join(verifyDirectory, "cdp-browser.mjs"));
  server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(pathname === "/details" ? detailsPage : pathname === "/invisible" ? invisiblePage : page);
  });
  const port = await listen(server);
  const { runMotionVerification } = await import(pathToFileURL(join(verifyDirectory, "motion-verify.mjs")).href);
  const config = {
    url: `http://127.0.0.1:${port}/`,
    viewport: { width: 800, height: 600 },
    viewportPolicy: { scrollbars: "hidden" },
    states: [
      {
        id: "closed",
        kind: "closed",
        expected: [{ selector: "#toggle", attributes: { "aria-expanded": "false" } }],
      },
      {
        id: "hover",
        kind: "hover",
        settleMs: 30,
        action: { type: "hover", selector: "#hover" },
        expected: [{ selector: "#hover", computed: { opacity: "0.7" } }],
      },
      {
        id: "open",
        kind: "open",
        action: { type: "click", selector: "#toggle" },
        waitFor: { selector: "#toggle", attribute: "aria-expanded", equals: "true" },
        expected: [{ selector: "#toggle", attributes: { "aria-expanded": "true" } }],
      },
      {
        id: "intermediate",
        kind: "intermediate",
        sampleAtMs: 80,
        maxSampleLagMs: 500,
        transitionSelector: "#panel",
        action: { type: "click", selector: "#toggle" },
        expected: [{ selector: "#panel", computed: { opacity: { min: 0.01, max: 0.5 } } }],
      },
      {
        id: "delayed-intermediate",
        kind: "intermediate",
        sampleAtMs: 80,
        maxSampleLagMs: 500,
        transitionSelector: "#delayed-panel",
        action: { type: "click", selector: "#delayed-toggle" },
        expected: [{ selector: "#delayed-panel", computed: { opacity: { min: 0.01, max: 0.5 } } }],
      },
      {
        id: "animation-intermediate",
        kind: "intermediate",
        sampleAtMs: 80,
        maxSampleLagMs: 500,
        transitionSelector: "#animation-panel",
        action: { type: "click", selector: "#animation-toggle" },
        expected: [{ selector: "#animation-panel", computed: { opacity: { min: 0.01, max: 0.5 } } }],
      },
      {
        id: "click-location-destination",
        kind: "open",
        action: { type: "click", selector: "#navigate" },
        destination: { timeoutMs: 1000, location: { pathname: "/details", search: "?from=motion", hash: "#destination" } },
        expected: [{ selector: "#destination", computed: { display: "block" } }],
      },
      {
        id: "click-empty-search-destination",
        kind: "open",
        action: { type: "click", selector: "#navigate-empty-search" },
        destination: { timeoutMs: 1000, location: { pathname: "/details", search: "", hash: "#destination" } },
        expected: [{ selector: "#destination", computed: { display: "block" } }],
      },
      {
        id: "click-empty-hash-destination",
        kind: "open",
        action: { type: "click", selector: "#navigate-empty-hash" },
        destination: { timeoutMs: 1000, location: { pathname: "/details", search: "?from=motion", hash: "" } },
        expected: [{ selector: "#destination", computed: { display: "block" } }],
      },
      {
        id: "click-visible-destination",
        kind: "open",
        action: { type: "click", selector: "#show-destination" },
        destination: { timeoutMs: 1000, visible: { selector: "#visible-destination" } },
        expected: [{ selector: "#visible-destination", computed: { display: "block" } }],
      },
    ],
  };
  const pass = await runMotionVerification({ config, reportPath: "MyBrain/verify/reports/pass.json", projectRoot: repo });
  if (pass.report.failures.length !== 0) throw new Error(`expected motion fixture to pass:\n${JSON.stringify(pass.report, null, 2)}`);
  const repeated = await runMotionVerification({ config, reportPath: "MyBrain/verify/reports/repeated-pass.json", projectRoot: repo });
  if (repeated.report.failures.length !== 0) throw new Error(`the same destination config must remain reusable across browser batches:\n${JSON.stringify(repeated.report, null, 2)}`);
  const intermediate = pass.report.states.find((state) => state.id === "intermediate");
  const timing = intermediate?.timing;
  if (!timing || ![timing.actionStartedAtMs, timing.transitionStartedAtMs, timing.measuredAtMs, timing.elapsedMs, timing.sampleLagMs, timing.actionToTransitionMs].every(Number.isFinite) || timing.elapsedMs < 80 || timing.measuredAtMs < timing.transitionStartedAtMs || timing.sampleLagMs < 50 || timing.sampleLagMs > timing.maxSampleLagMs || timing.transitionEventType !== "transitionstart") {
    throw new Error(`intermediate state must report and enforce transition-clock timing:\n${JSON.stringify(intermediate, null, 2)}`);
  }
  const delayed = pass.report.states.find((state) => state.id === "delayed-intermediate");
  if (!delayed?.timing || delayed.timing.actionToTransitionMs < 50) {
    throw new Error(`transition start must be measured separately from the action event:\n${JSON.stringify(delayed, null, 2)}`);
  }
  const animation = pass.report.states.find((state) => state.id === "animation-intermediate");
  if (!animation?.timing || animation.timing.transitionEventType !== "animationstart" || animation.timing.elapsedMs < 80 || animation.timing.measuredAtMs < animation.timing.transitionStartedAtMs) {
    throw new Error(`animationstart must be sampled and reported as an intermediate state:\n${JSON.stringify(animation, null, 2)}`);
  }

  const locationDestination = pass.report.states.find((state) => state.id === "click-location-destination")?.destination;
  if (!locationDestination?.passed || locationDestination.before?.location?.pathname !== "/" || locationDestination.after?.location?.pathname !== "/details" || locationDestination.after?.location?.search !== "?from=motion" || locationDestination.after?.location?.hash !== "#destination" || !Number.isFinite(locationDestination.waitedMs) || !locationDestination.startedAt || !locationDestination.observedAt) {
    throw new Error(`click location destination must report normalized before/after URL and wait timing:\n${JSON.stringify(locationDestination, null, 2)}`);
  }
  const emptySearchDestination = pass.report.states.find((state) => state.id === "click-empty-search-destination")?.destination;
  if (!emptySearchDestination?.passed || emptySearchDestination.after?.location?.search !== "" || emptySearchDestination.after?.location?.hash !== "#destination") {
    throw new Error(`an explicit empty search must be compared as an empty URL component:\n${JSON.stringify(emptySearchDestination, null, 2)}`);
  }
  const emptyHashDestination = pass.report.states.find((state) => state.id === "click-empty-hash-destination")?.destination;
  if (!emptyHashDestination?.passed || emptyHashDestination.after?.location?.search !== "?from=motion" || emptyHashDestination.after?.location?.hash !== "") {
    throw new Error(`an explicit empty hash must be compared as an empty URL component:\n${JSON.stringify(emptyHashDestination, null, 2)}`);
  }
  const visibleDestination = pass.report.states.find((state) => state.id === "click-visible-destination")?.destination;
  if (!visibleDestination?.passed || visibleDestination.before?.visible?.isVisible !== false || visibleDestination.after?.visible?.isVisible !== true || visibleDestination.after?.visible?.selector !== "#visible-destination") {
    throw new Error(`click visible destination must require a newly rendered target:\n${JSON.stringify(visibleDestination, null, 2)}`);
  }
  const lagFailureConfig = structuredClone(config);
  lagFailureConfig.states = [lagFailureConfig.states.find((state) => state.id === "intermediate")];
  lagFailureConfig.states[0].maxSampleLagMs = 0;
  const lagFailure = await runMotionVerification({ config: lagFailureConfig, reportPath: "MyBrain/verify/reports/lag-fail.json", projectRoot: repo });
  const lagTiming = lagFailure.report.states[0]?.timing;
  if (lagFailure.report.failures.length !== 1 || lagFailure.report.failures[0].timingMismatches?.[0]?.type !== "sample-lag" || !lagTiming || lagTiming.sampleLagMs < 50) {
    throw new Error(`deterministic sample lag above the configured maximum must fail:\n${JSON.stringify(lagFailure.report, null, 2)}`);
  }

  const preActionFailureConfig = {
    ...config,
    url: `${config.url}?preaction=1`,
    states: [
      {
        id: "transition-before-action",
        kind: "intermediate",
        sampleAtMs: 80,
        maxSampleLagMs: 500,
        transitionSelector: "#preaction-panel",
        action: { type: "click", selector: "#preaction-toggle" },
        expected: [{ selector: "#preaction-panel", computed: { opacity: "1" } }],
      },
    ],
  };
  const preActionFailure = await runMotionVerification({ config: preActionFailureConfig, reportPath: "MyBrain/verify/reports/preaction-fail.json", projectRoot: repo });
  const preActionTiming = preActionFailure.report.states[0]?.timing;
  if (preActionFailure.report.failures.length !== 1 || preActionFailure.report.failures[0].timingMismatches?.[0]?.type !== "transition-before-action" || !preActionTiming || preActionTiming.actionToTransitionMs >= 0) {
    throw new Error(`CSS start before the action event must fail:\n${JSON.stringify(preActionFailure.report, null, 2)}`);
  }

  const failureConfig = structuredClone(config);
  failureConfig.states[1].expected[0].computed.opacity = "0.5";
  const failure = await runMotionVerification({ config: failureConfig, reportPath: "MyBrain/verify/reports/fail.json", projectRoot: repo });
  if (failure.report.failures.length !== 1 || failure.report.failures[0].type !== "motion-state-failed") {
    throw new Error(`expected wrong hover expectation to fail:\n${JSON.stringify(failure.report, null, 2)}`);
  }
  const noNavigationFailure = await runMotionVerification({
    config: {
      ...config,
      states: [{
        id: "destination-no-navigation",
        kind: "open",
        action: { type: "click", selector: "#no-navigate" },
        destination: { timeoutMs: 180, location: { pathname: "/details", hash: "#destination" } },
        expected: [{ selector: "#no-navigate", attributes: { "data-fixture": null } }],
      }],
    },
    reportPath: "MyBrain/verify/reports/destination-no-navigation.json",
    projectRoot: repo,
  });
  if (noNavigationFailure.report.failures.length !== 1 || noNavigationFailure.report.failures[0].destinationMismatches?.[0]?.type !== "destination-unreached") {
    throw new Error(`click without navigation must fail the destination contract:\n${JSON.stringify(noNavigationFailure.report, null, 2)}`);
  }

  const wrongHashFailure = await runMotionVerification({
    config: {
      ...config,
      states: [{
        id: "destination-wrong-hash",
        kind: "open",
        action: { type: "click", selector: "#wrong-hash" },
        destination: { timeoutMs: 180, location: { pathname: "/details", search: "?from=motion", hash: "#destination" } },
        expected: [{ selector: "#destination", computed: { display: "block" } }],
      }],
    },
    reportPath: "MyBrain/verify/reports/destination-wrong-hash.json",
    projectRoot: repo,
  });
  if (wrongHashFailure.report.failures.length !== 1 || wrongHashFailure.report.failures[0].destinationMismatches?.[0]?.type !== "destination-unreached") {
    throw new Error(`wrong destination hash must fail:\n${JSON.stringify(wrongHashFailure.report, null, 2)}`);
  }

  const extraQueryFailure = await runMotionVerification({
    config: {
      ...config,
      states: [{
        id: "destination-extra-query",
        kind: "open",
        action: { type: "click", selector: "#navigate" },
        destination: { timeoutMs: 180, location: { pathname: "/details", search: "", hash: "#destination" } },
        expected: [{ selector: "#destination", computed: { display: "block" } }],
      }],
    },
    reportPath: "MyBrain/verify/reports/destination-extra-query.json",
    projectRoot: repo,
  });
  if (extraQueryFailure.report.failures.length !== 1 || extraQueryFailure.report.failures[0].destinationMismatches?.[0]?.type !== "destination-unreached") {
    throw new Error(`an unexpected query must fail an explicit empty search contract:\n${JSON.stringify(extraQueryFailure.report, null, 2)}`);
  }

  const extraHashFailure = await runMotionVerification({
    config: {
      ...config,
      states: [{
        id: "destination-extra-hash",
        kind: "open",
        action: { type: "click", selector: "#wrong-hash" },
        destination: { timeoutMs: 180, location: { pathname: "/details", search: "?from=motion", hash: "" } },
        expected: [{ selector: "#destination", computed: { display: "block" } }],
      }],
    },
    reportPath: "MyBrain/verify/reports/destination-extra-hash.json",
    projectRoot: repo,
  });
  if (extraHashFailure.report.failures.length !== 1 || extraHashFailure.report.failures[0].destinationMismatches?.[0]?.type !== "destination-unreached") {
    throw new Error(`an unexpected hash must fail an explicit empty hash contract:\n${JSON.stringify(extraHashFailure.report, null, 2)}`);
  }

  const invisibleFailure = await runMotionVerification({
    config: {
      ...config,
      states: [{
        id: "destination-invisible",
        kind: "open",
        action: { type: "click", selector: "#invisible-route" },
        destination: { timeoutMs: 180, visible: { selector: "#invisible-target" } },
        expected: [{ selector: "#invisible-target", computed: { display: "none" } }],
      }],
    },
    reportPath: "MyBrain/verify/reports/destination-invisible.json",
    projectRoot: repo,
  });
  if (invisibleFailure.report.failures.length !== 1 || invisibleFailure.report.failures[0].destinationMismatches?.[0]?.type !== "destination-unreached") {
    throw new Error(`invisible destination selector must fail:\n${JSON.stringify(invisibleFailure.report, null, 2)}`);
  }

  let nonClickRejected = false;
  try {
    await runMotionVerification({
      config: {
        ...config,
        states: [{
          id: "destination-hover-rejected",
          kind: "hover",
          action: { type: "hover", selector: "#hover" },
          destination: { timeoutMs: 180, visible: { selector: "#visible-destination" } },
          expected: [{ selector: "#hover", computed: { opacity: "0.7" } }],
        }],
      },
      reportPath: "MyBrain/verify/reports/destination-hover-rejected.json",
      projectRoot: repo,
    });
  } catch (error) {
    nonClickRejected = /allowed only for action.type/.test(error.message);
  }
  if (!nonClickRejected) throw new Error("destination must reject hover actions.");

  let keyRejected = false;
  try {
    await runMotionVerification({
      config: {
        ...config,
        states: [{
          id: "destination-key-rejected",
          kind: "open",
          action: { type: "key", selector: "#toggle", key: "Enter" },
          destination: { timeoutMs: 180, visible: { selector: "#visible-destination" } },
          expected: [{ selector: "#toggle", attributes: { "aria-expanded": "false" } }],
        }],
      },
      reportPath: "MyBrain/verify/reports/destination-key-rejected.json",
      projectRoot: repo,
    });
  } catch (error) {
    keyRejected = /allowed only for action.type/.test(error.message);
  }
  if (!keyRejected) throw new Error("destination must reject key actions.");

  let noActionRejected = false;
  try {
    await runMotionVerification({
      config: {
        ...config,
        states: [{
          id: "destination-none-rejected",
          kind: "closed",
          destination: { timeoutMs: 180, visible: { selector: "#visible-destination" } },
          expected: [{ selector: "#toggle", attributes: { "aria-expanded": "false" } }],
        }],
      },
      reportPath: "MyBrain/verify/reports/destination-none-rejected.json",
      projectRoot: repo,
    });
  } catch (error) {
    noActionRejected = /allowed only for action.type/.test(error.message);
  }
  if (!noActionRejected) throw new Error("destination must reject action.type none.");

  let intermediateDestinationRejected = false;
  try {
    await runMotionVerification({
      config: {
        ...config,
        states: [{
          id: "destination-intermediate-rejected",
          kind: "intermediate",
          action: { type: "click", selector: "#toggle" },
          destination: { timeoutMs: 180, visible: { selector: "#visible-destination" } },
          expected: [{ selector: "#toggle", attributes: { "aria-expanded": "false" } }],
        }],
      },
      reportPath: "MyBrain/verify/reports/destination-intermediate-rejected.json",
      projectRoot: repo,
    });
  } catch (error) {
    intermediateDestinationRejected = /cannot be combined with an intermediate state/.test(error.message);
  }
  if (!intermediateDestinationRejected) throw new Error("destination must reject intermediate states.");

  let emptyLocationRejected = false;
  try {
    await runMotionVerification({
      config: {
        ...config,
        states: [{
          id: "destination-empty-location-rejected",
          kind: "open",
          action: { type: "click", selector: "#navigate" },
          destination: { timeoutMs: 180, location: { search: "" } },
          expected: [{ selector: "#destination", computed: { display: "block" } }],
        }],
      },
      reportPath: "MyBrain/verify/reports/destination-empty-location-rejected.json",
      projectRoot: repo,
    });
  } catch (error) {
    emptyLocationRejected = /needs a non-empty pathname, search, or hash/.test(error.message);
  }
  if (!emptyLocationRejected) throw new Error("destination location must not accept only an empty component.");

  const alreadyReachedFailure = await runMotionVerification({
    config: {
      ...config,
      states: [{
        id: "destination-already-reached",
        kind: "open",
        action: { type: "click", selector: "#no-navigate" },
        destination: { timeoutMs: 180, location: { pathname: "/", search: "", hash: "" } },
        expected: [{ selector: "#no-navigate", attributes: { "data-fixture": null } }],
      }],
    },
    reportPath: "MyBrain/verify/reports/destination-already-reached.json",
    projectRoot: repo,
  });
  if (alreadyReachedFailure.report.failures.length !== 1 || alreadyReachedFailure.report.failures[0].destinationMismatches?.[0]?.type !== "destination-already-reached") {
    throw new Error(`an already-reached destination must fail:\n${JSON.stringify(alreadyReachedFailure.report, null, 2)}`);
  }
  console.log("motion-verify E2E PASS");
} finally {
  if (server) await close(server);
  rmSync(repo, { recursive: true, force: true });
}