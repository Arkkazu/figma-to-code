#!/usr/bin/env node
// motion-verify.mjs — Q-08 の hover / open / close / 遷移中間状態をCDPで照合する。
//
// Usage:
//   node MyBrain/verify/motion-verify.mjs <config.json> [url] [report.json]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { navigateAndWait, startCdpBrowser, waitFor } from "./cdp-browser.mjs";

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function fail(message) {
  throw new Error(`MOTION VERIFY: ${message}`);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireStringOrEmpty(value, label) {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  return value === "" ? "" : requireString(value, label);
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function readJson(pathname, label) {
  if (!existsSync(pathname)) fail(`${label} does not exist: ${pathname}`);
  try {
    return JSON.parse(readFileSync(pathname, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function writeJson(pathname, value) {
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveProjectPath(projectRoot, value, label) {
  const relative = requireString(value, label);
  const pathname = resolve(projectRoot, relative);
  const relativePath = pathname.slice(projectRoot.length + 1);
  if (pathname !== projectRoot && (relativePath === "" || relativePath.startsWith(".."))) fail(`${label} must stay inside the project root.`);
  return pathname;
}

function keyboardParams(key, shiftKey = false) {
  const keys = {
    Escape: { code: "Escape", keyCode: 27 },
    Tab: { code: "Tab", keyCode: 9 },
    Enter: { code: "Enter", keyCode: 13, text: "\r" },
    " ": { code: "Space", keyCode: 32, text: " " },
  };
  const definition = keys[key] || { code: key, keyCode: 0 };
  return {
    key,
    code: definition.code,
    windowsVirtualKeyCode: definition.keyCode,
    nativeVirtualKeyCode: definition.keyCode,
    ...(definition.text ? { text: definition.text, unmodifiedText: definition.text } : {}),
    modifiers: shiftKey ? 8 : 0,
  };
}

async function dispatchKey(browser, key, shiftKey = false) {
  const params = keyboardParams(key, shiftKey);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}

async function selectorPoint(browser, selector) {
  const result = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { error: "not-found" };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return { error: "not-visible" };
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!result || result.error) fail(`Cannot interact with ${selector}: ${result?.error ?? "unknown error"}.`);
  return result;
}

async function click(browser, selector) {
  const point = await selectorPoint(browser, selector);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function hover(browser, selector) {
  const point = await selectorPoint(browser, selector);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none" });
}

function validateExpected(value, label) {
  const expected = requireObject(value, label);
  requireString(expected.selector, `${label}.selector`);
  const hasComputed = expected.computed && typeof expected.computed === "object" && !Array.isArray(expected.computed) && Object.keys(expected.computed).length > 0;
  const hasAttributes = expected.attributes && typeof expected.attributes === "object" && !Array.isArray(expected.attributes) && Object.keys(expected.attributes).length > 0;
  if (!hasComputed && !hasAttributes) fail(`${label} needs non-empty computed or attributes expectations.`);
  return expected;
}

function normalizeDestinationLocation(value, label) {
  const location = requireObject(value, label);
  const hasPathname = location.pathname !== undefined;
  const hasSearch = location.search !== undefined;
  const hasHash = location.hash !== undefined;
  if (!hasPathname && !hasSearch && !hasHash) fail(`${label} needs pathname, search, or hash.`);
  const pathname = hasPathname ? requireString(location.pathname, `${label}.pathname`) : "/";
  const search = hasSearch ? requireStringOrEmpty(location.search, `${label}.search`) : "";
  const hash = hasHash ? requireStringOrEmpty(location.hash, `${label}.hash`) : "";
  if (!hasPathname && search === "" && hash === "") fail(`${label} needs a non-empty pathname, search, or hash.`);
  if (!pathname.startsWith("/")) fail(`${label}.pathname must start with "/".`);
  if (search !== "" && !search.startsWith("?")) fail(`${label}.search must be empty or start with "?".`);
  if (hash !== "" && !hash.startsWith("#")) fail(`${label}.hash must be empty or start with "#".`);
  const normalized = new URL(`${pathname}${search}${hash}`, "https://figma-motion-normalize.invalid");
  return {
    ...(hasPathname ? { pathname: normalized.pathname } : {}),
    ...(hasSearch ? { search: normalized.search } : {}),
    ...(hasHash ? { hash: normalized.hash } : {}),
  };
}

function validateDestination(value, label, action) {
  const destination = requireObject(value, label);
  if (action.type !== "click") fail(`${label} is allowed only for action.type "click".`);
  if (!Number.isInteger(destination.timeoutMs) || destination.timeoutMs <= 0) {
    fail(`${label}.timeoutMs must be a positive integer measured for this project.`);
  }
  const hasLocation = destination.location !== undefined;
  const hasVisible = destination.visible !== undefined;
  if (hasLocation === hasVisible) fail(`${label} needs exactly one of location or visible.`);
  if (hasLocation) return { type: "location", timeoutMs: destination.timeoutMs, location: normalizeDestinationLocation(destination.location, `${label}.location`) };
  const visible = requireObject(destination.visible, `${label}.visible`);
  return { type: "visible", timeoutMs: destination.timeoutMs, visible: { selector: requireString(visible.selector, `${label}.visible.selector`) } };
}
function validateConfig(raw) {
  const config = requireObject(raw, "config");
  const viewportPolicy = requireObject(config.viewportPolicy, "config.viewportPolicy");
  if (viewportPolicy.scrollbars !== "hidden" && viewportPolicy.scrollbars !== "visible") fail('config.viewportPolicy.scrollbars must be "hidden" or "visible".');
  const states = requireArray(config.states, "config.states");
  if (states.length === 0) fail("config.states must contain close/open/hover/intermediate state checks.");
  const stateIds = new Set();
  const normalizedStates = [];
  for (const [index, state] of states.entries()) {
    const label = `config.states[${index}]`;
    requireObject(state, label);
    const normalizedState = { ...state };
    const id = requireString(state.id, `${label}.id`);
    if (stateIds.has(id)) fail(`${label}.id duplicates ${id}.`);
    stateIds.add(id);
    if (!["closed", "open", "hover", "intermediate"].includes(state.kind)) fail(`${label}.kind must be closed, open, hover, or intermediate.`);
    const action = state.action === undefined ? { type: "none" } : requireObject(state.action, `${label}.action`);
    if (!["none", "click", "hover", "key"].includes(action.type)) fail(`${label}.action.type must be none, click, hover, or key.`);
    if (action.type !== "none") requireString(action.selector, `${label}.action.selector`);
    if (action.type === "key") requireString(action.key, `${label}.action.key`);
    if (state.destination !== undefined) {
      if (state.kind === "intermediate") fail(`${label}.destination cannot be combined with an intermediate state.`);
      normalizedState.destination = validateDestination(state.destination, `${label}.destination`, action);
    }
    if (state.kind === "intermediate") {
      if (!Number.isInteger(state.sampleAtMs) || state.sampleAtMs <= 0) fail(`${label}.sampleAtMs must be a positive integer for intermediate states.`);
      if (action.type === "none") fail(`${label}.action must start the transition for intermediate states.`);
      requireString(state.transitionSelector, `${label}.transitionSelector`);
      if (!Number.isFinite(state.maxSampleLagMs) || state.maxSampleLagMs < 0) fail(`${label}.maxSampleLagMs must be a non-negative number measured for this execution environment.`);
    }
    if (state.settleMs !== undefined && (!Number.isInteger(state.settleMs) || state.settleMs < 0)) {
      fail(`${label}.settleMs must be a non-negative integer when declared.`);
    }
    const expected = requireArray(state.expected, `${label}.expected`);
    if (expected.length === 0) fail(`${label}.expected must not be empty.`);
    expected.forEach((entry, expectedIndex) => validateExpected(entry, `${label}.expected[${expectedIndex}]`));
    normalizedStates.push(normalizedState);
  }
  return { ...config, viewportPolicy, states: normalizedStates };
}

async function runAction(browser, action) {
  if (action.type === "none") return;
  if (action.type === "click") return click(browser, action.selector);
  if (action.type === "hover") return hover(browser, action.selector);
  if (action.type === "key") {
    const focused = await browser.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(action.selector)}); element?.focus(); return document.activeElement === element; })()`);
    if (!focused) fail(`Cannot focus ${action.selector} for key action.`);
    return dispatchKey(browser, action.key, action.shiftKey === true);
  }
  fail(`Unknown action type: ${action.type}.`);
}

function destinationObservationExpression(destination) {
  const visibleSelector = destination.type === "visible" ? destination.visible.selector : null;
  return `(() => {
    const current = new URL(location.href);
    const locationValue = { href: current.href, pathname: current.pathname, search: current.search, hash: current.hash };
    if (${JSON.stringify(destination.type)} === "location") return { location: locationValue };
    const selector = ${JSON.stringify(visibleSelector)};
    const element = document.querySelector(selector);
    if (!element) return { location: locationValue, visible: { selector, isVisible: false, reason: "not-found" } };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const opacity = Number.parseFloat(style.opacity);
    const isVisible = style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && style.contentVisibility !== "hidden" && Number.isFinite(opacity) && opacity > 0 && rect.width > 0 && rect.height > 0;
    return {
      location: locationValue,
      visible: {
        selector,
        isVisible,
        display: style.display,
        visibility: style.visibility,
        contentVisibility: style.contentVisibility,
        opacity: style.opacity,
        rect: { width: rect.width, height: rect.height },
      },
    };
  })()`;
}

async function observeDestination(browser, destination) {
  return browser.evaluate(destinationObservationExpression(destination));
}

function destinationMatches(destination, observation) {
  if (!observation || !observation.location) return false;
  if (destination.type === "visible") return observation.visible?.isVisible === true;
  return Object.entries(destination.location).every(([key, expected]) => observation.location[key] === expected);
}

function destinationMismatch(destination, before, after, type) {
  if (destination.type === "visible") {
    return { type, expected: { visible: destination.visible.selector }, before, after };
  }
  return { type, expected: { location: destination.location }, before, after };
}

async function waitForDestination(browser, destination, before, startedAtMs) {
  const startedAt = new Date(startedAtMs).toISOString();
  if (destinationMatches(destination, before)) {
    const observedAtMs = Date.now();
    return {
      type: destination.type,
      expected: destination.type === "location" ? { location: destination.location } : { visible: destination.visible },
      before,
      after: before,
      startedAt,
      observedAt: new Date(observedAtMs).toISOString(),
      waitedMs: observedAtMs - startedAtMs,
      timeoutMs: destination.timeoutMs,
      passed: false,
      mismatch: destinationMismatch(destination, before, before, "destination-already-reached"),
    };
  }
  let latest = before;
  try {
    const after = await waitFor(
      async () => {
        latest = await observeDestination(browser, destination);
        return destinationMatches(destination, latest) ? latest : null;
      },
      { timeoutMs: destination.timeoutMs, label: `destination ${destination.type}` }
    );
    const observedAtMs = Date.now();
    return {
      type: destination.type,
      expected: destination.type === "location" ? { location: destination.location } : { visible: destination.visible },
      before,
      after,
      startedAt,
      observedAt: new Date(observedAtMs).toISOString(),
      waitedMs: observedAtMs - startedAtMs,
      timeoutMs: destination.timeoutMs,
      passed: true,
      mismatch: null,
    };
  } catch (error) {
    const observedAtMs = Date.now();
    return {
      type: destination.type,
      expected: destination.type === "location" ? { location: destination.location } : { visible: destination.visible },
      before,
      after: latest,
      startedAt,
      observedAt: new Date(observedAtMs).toISOString(),
      waitedMs: observedAtMs - startedAtMs,
      timeoutMs: destination.timeoutMs,
      passed: false,
      mismatch: { ...destinationMismatch(destination, before, latest, "destination-unreached"), message: error.message },
    };
  }
}
async function installActionClock(browser, action) {
  const eventType = action.type === "click" ? "click" : action.type === "hover" ? "pointerover" : action.type === "key" ? "keydown" : null;
  if (!eventType) return null;
  const clockKey = "__figmaMotionActionStartedAt";
  await browser.evaluate(`(() => {
    const selector = ${JSON.stringify(action.selector)};
    const eventType = ${JSON.stringify(eventType)};
    const clockKey = ${JSON.stringify(clockKey)};
    window[clockKey] = null;
    const handler = (event) => {
      const target = event.target instanceof Element ? event.target.closest(selector) : null;
      if (!target) return;
      window[clockKey] = performance.now();
      document.removeEventListener(eventType, handler, true);
    };
    document.addEventListener(eventType, handler, true);
  })()`);
  return clockKey;
}

async function installTransitionClock(browser, selector) {
  const clockKey = "__figmaMotionTransitionStartedAt";
  await browser.evaluate(`(() => {
    const selector = ${JSON.stringify(selector)};
    const clockKey = ${JSON.stringify(clockKey)};
    const target = document.querySelector(selector);
    if (!target) throw new Error("transition selector not found: " + selector);
    window[clockKey] = null;
    const handler = (event) => {
      if (event.target !== target) return;
      window[clockKey] = { eventType: event.type, propertyName: event.propertyName || event.animationName || null, startedAtMs: performance.now() };
      document.removeEventListener("transitionstart", handler, true);
      document.removeEventListener("animationstart", handler, true);
    };
    document.addEventListener("transitionstart", handler, true);
    document.addEventListener("animationstart", handler, true);
  })()`);
  return clockKey;
}

async function clockValue(browser, clockKey, stateId, label) {
  return waitFor(
    () => browser.evaluate(`window[${JSON.stringify(clockKey)}]`),
    { timeoutMs: 3000, label: `${stateId} ${label}` }
  );
}
function measureExpression(expectations) {
  return `(() => {
    const expectations = ${JSON.stringify(expectations)};
    return expectations.map((expected) => {
      const element = document.querySelector(expected.selector);
      if (!element) return { selector: expected.selector, error: "not-found" };
      const style = getComputedStyle(element);
      const computed = {};
      for (const property of Object.keys(expected.computed || {})) computed[property] = style[property];
      const attributes = {};
      for (const name of Object.keys(expected.attributes || {})) attributes[name] = element.getAttribute(name);
      return { selector: expected.selector, computed, attributes };
    });
  })()`;
}

function intermediateMeasureExpression(expectations, clockKey, sampleAtMs) {
  return `new Promise((resolve) => {
    const expectations = ${JSON.stringify(expectations)};
    const clockKey = ${JSON.stringify(clockKey)};
    const sampleAtMs = ${JSON.stringify(sampleAtMs)};
    const transition = window[clockKey];
    const startedAtMs = transition?.startedAtMs;
    if (!Number.isFinite(startedAtMs)) throw new Error("transition clock was not recorded");
    const measure = () => expectations.map((expected) => {
      const element = document.querySelector(expected.selector);
      if (!element) return { selector: expected.selector, error: "not-found" };
      const style = getComputedStyle(element);
      const computed = {};
      for (const property of Object.keys(expected.computed || {})) computed[property] = style[property];
      const attributes = {};
      for (const name of Object.keys(expected.attributes || {})) attributes[name] = element.getAttribute(name);
      return { selector: expected.selector, computed, attributes };
    });
    const finish = () => {
      const measuredAtMs = performance.now();
      const remainingMs = startedAtMs + sampleAtMs - measuredAtMs;
      if (remainingMs > 0) {
        window.setTimeout(finish, remainingMs);
        return;
      }
      resolve({
        transition,
        transitionStartedAtMs: startedAtMs,
        measuredAtMs,
        elapsedMs: measuredAtMs - startedAtMs,
        values: measure(),
      });
    };
    window.setTimeout(finish, Math.max(0, startedAtMs + sampleAtMs - performance.now()));
  })`;
}
function matchesExpected(actual, expected) {
  const mismatches = [];
  for (const [property, expectedValue] of Object.entries(expected.computed || {})) {
    const actualValue = actual.computed?.[property];
    if (expectedValue && typeof expectedValue === "object" && !Array.isArray(expectedValue)) {
      const minimum = Number(expectedValue.min);
      const maximum = Number(expectedValue.max);
      const numeric = Number.parseFloat(actualValue);
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
        mismatches.push({ type: "computed-range", property, expected: expectedValue, actual: actualValue });
      }
    } else if (String(actualValue) !== String(expectedValue)) {
      mismatches.push({ type: "computed-exact", property, expected: expectedValue, actual: actualValue });
    }
  }
  for (const [attribute, expectedValue] of Object.entries(expected.attributes || {})) {
    const actualValue = actual.attributes?.[attribute] ?? null;
    if (actualValue !== expectedValue) mismatches.push({ type: "attribute", attribute, expected: expectedValue, actual: actualValue });
  }
  return mismatches;
}

function collectTimingMismatches({ actionStartedAtMs, transitionStartedAtMs, sampleLagMs, maxSampleLagMs }) {
  const mismatches = [];
  if (transitionStartedAtMs < actionStartedAtMs) {
    mismatches.push({
      type: "transition-before-action",
      actionStartedAtMs: Number(actionStartedAtMs.toFixed(3)),
      transitionStartedAtMs: Number(transitionStartedAtMs.toFixed(3)),
      actionToTransitionMs: Number((transitionStartedAtMs - actionStartedAtMs).toFixed(3)),
    });
  }
  if (sampleLagMs > maxSampleLagMs) {
    mismatches.push({ type: "sample-lag", expectedMaxMs: maxSampleLagMs, actualMs: Number(sampleLagMs.toFixed(3)) });
  }
  return mismatches;
}

async function runState(browser, config, state) {
  const readiness = state.action?.selector ? [state.action.selector] : [];
  await navigateAndWait(browser, { url: config.url, width: config.viewport.width, height: config.viewport.height, scrollbars: config.viewportPolicy.scrollbars, selectors: readiness });
  const action = state.action || { type: "none" };
  const actionClockKey = state.kind === "intermediate" ? await installActionClock(browser, action) : null;
  const transitionClockKey = state.kind === "intermediate" ? await installTransitionClock(browser, state.transitionSelector) : null;
  const destinationBefore = state.destination ? await observeDestination(browser, state.destination) : null;
  const destinationStartedAtMs = state.destination ? Date.now() : null;
  await runAction(browser, action);
  let actual;
  let timing = null;
  let timingMismatches = [];
  let destination = null;
  let destinationMismatches = [];
  if (state.kind === "intermediate") {
    const actionStartedAtMs = await clockValue(browser, actionClockKey, state.id, "action event");
    const transition = await clockValue(browser, transitionClockKey, state.id, "CSS transition or animation start");
    const sampled = await browser.evaluate(intermediateMeasureExpression(state.expected, transitionClockKey, state.sampleAtMs), { awaitPromise: true });
    actual = sampled.values;
    const sampleLagMs = sampled.elapsedMs - state.sampleAtMs;
    const actionToTransitionMs = sampled.transitionStartedAtMs - actionStartedAtMs;
    timing = {
      actionStartedAtMs,
      transitionStartedAtMs: sampled.transitionStartedAtMs,
      transitionEventType: sampled.transition.eventType,
      transitionPropertyName: sampled.transition.propertyName,
      actionToTransitionMs: Number(actionToTransitionMs.toFixed(3)),
      measuredAtMs: sampled.measuredAtMs,
      elapsedMs: Number(sampled.elapsedMs.toFixed(3)),
      requestedSampleAtMs: state.sampleAtMs,
      maxSampleLagMs: state.maxSampleLagMs,
      sampleLagMs: Number(sampleLagMs.toFixed(3)),
    };
    timingMismatches = collectTimingMismatches({ actionStartedAtMs, transitionStartedAtMs: sampled.transitionStartedAtMs, sampleLagMs, maxSampleLagMs: state.maxSampleLagMs });
  } else {
    if (state.destination) {
      destination = await waitForDestination(browser, state.destination, destinationBefore, destinationStartedAtMs);
      if (!destination.passed) destinationMismatches = [destination.mismatch];
    }
    if (state.settleMs > 0) await delay(state.settleMs);
    if (state.waitFor) {
      const waitSelector = requireString(state.waitFor.selector, `state ${state.id}.waitFor.selector`);
      const expectedAttribute = requireString(state.waitFor.attribute, `state ${state.id}.waitFor.attribute`);
      await waitFor(
        () => browser.evaluate(`document.querySelector(${JSON.stringify(waitSelector)})?.getAttribute(${JSON.stringify(expectedAttribute)}) === ${JSON.stringify(state.waitFor.equals)}`),
        { timeoutMs: 3000, label: `${state.id} ${waitSelector}[${expectedAttribute}]` }
      );
    }
    actual = await browser.evaluate(measureExpression(state.expected));
  }
  const checks = state.expected.map((expected, index) => ({ expected, actual: actual[index], mismatches: actual[index]?.error ? [{ type: "selector", actual: actual[index].error }] : matchesExpected(actual[index], expected) }));
  return {
    id: state.id,
    kind: state.kind,
    sampleAtMs: state.kind === "intermediate" ? state.sampleAtMs : null,
    settleMs: state.kind === "intermediate" ? null : state.settleMs ?? 0,
    timing,
    timingMismatches,
    destination,
    destinationMismatches,
    checks,
    passed: checks.every((check) => check.mismatches.length === 0) && timingMismatches.length === 0 && destinationMismatches.length === 0,
  };
}
function prepareMotionConfig(config, url) {
  const validated = validateConfig(config);
  validated.url = requireString(url || validated.url, "config.url");
  validated.viewport = { width: Number(validated.viewport?.width || 1440), height: Number(validated.viewport?.height || 1600) };
  if (!Number.isInteger(validated.viewport.width) || !Number.isInteger(validated.viewport.height) || validated.viewport.width <= 0 || validated.viewport.height <= 0) {
    fail("config.viewport.width and config.viewport.height must be positive integers.");
  }
  return validated;
}

async function executeMotionInBrowser({ browser, validated, reportPath, projectRoot }) {
  const report = {
    version: 1,
    url: validated.url,
    generatedAt: new Date().toISOString(),
    browserSessionId: browser.sessionId,
    browserPid: browser.browserPid,
    states: [],
    failures: [],
  };
  try {
    for (const state of validated.states) {
      const result = await runState(browser, validated, state);
      report.states.push(result);
      if (!result.passed) {
        report.failures.push({
          type: "motion-state-failed",
          stateId: state.id,
          checks: result.checks.filter((check) => check.mismatches.length > 0),
          timingMismatches: result.timingMismatches,
          destinationMismatches: result.destinationMismatches,
        });
      }
    }
  } catch (error) {
    report.failures.push({ type: "runtime-error", message: error.message });
  }
  const outputPath = reportPath ? resolveProjectPath(projectRoot, reportPath, "reportPath") : resolveProjectPath(projectRoot, validated.reportPath || "MyBrain/verify/reports/motion.json", "config.reportPath");
  writeJson(outputPath, report);
  return { report, reportPath: outputPath, validated };
}

// figma-gate のPC/SP batchから渡されたbrowserを所有しない。別Chromeを起動しない。
export async function runMotionVerificationInBrowser({ browser, config, url, reportPath, projectRoot = process.cwd() }) {
  if (!browser || typeof browser.send !== "function") fail("browser must be a live CDP session.");
  const validated = prepareMotionConfig(config, url);
  return executeMotionInBrowser({ browser, validated, reportPath, projectRoot });
}

export async function runMotionVerification({ config, url, reportPath, projectRoot = process.cwd() }) {
  const validated = prepareMotionConfig(config, url);
  const browser = await startCdpBrowser({ initialWidth: validated.viewport.width, initialHeight: validated.viewport.height, scrollbars: validated.viewportPolicy.scrollbars });
  try {
    return await executeMotionInBrowser({ browser, validated, reportPath, projectRoot });
  } finally {
    await browser.close();
  }
}

async function main() {
  const [configArg, urlArg, reportArg] = process.argv.slice(2);
  if (!configArg) fail("Usage: node MyBrain/verify/motion-verify.mjs <config.json> [url] [report.json]");
  const projectRoot = process.cwd();
  const configPath = resolveProjectPath(projectRoot, configArg, "config path");
  const config = readJson(configPath, "Motion config");
  const { report, reportPath } = await runMotionVerification({ config, url: urlArg, reportPath: reportArg, projectRoot });
  console.log(JSON.stringify({ status: report.failures.length === 0 ? "PASS" : "FAIL", reportPath, failures: report.failures.length }, null, 2));
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}