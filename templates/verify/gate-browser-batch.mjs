#!/usr/bin/env node
// gate-browser-batch.mjs — Q-09 PC/SP batchへQ-13/Q-08を同じCDP sessionで接続する実行器。
// Usage: node MyBrain/verify/gate-browser-batch.mjs <job.json> <summary.json>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { navigateAndWait, startCdpBrowser, startP3NetworkTrace } from "./cdp-browser.mjs";
import { normalizeCaptureBatch, runCaptureBatch } from "./checkpoint-capture.mjs";
import { runLayoutVerificationInBrowser } from "./verify-layout.mjs";
import { runAccessibilityVerificationInBrowser } from "./accessibility-verify.mjs";
import { runMotionVerificationInBrowser } from "./motion-verify.mjs";

const projectRoot = process.cwd();

function fail(message) {
  throw new Error(`GATE BROWSER BATCH: ${message}`);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} is required.`);
  return value.trim();
}

function readJson(pathname, label) {
  try {
    return JSON.parse(readFileSync(pathname, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${pathname} (${error.message}).`);
  }
}

function toProjectPath(value, label) {
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(`${label} must be repository-relative.`);
  const absolutePath = resolve(projectRoot, input);
  const relativePath = relative(projectRoot, absolutePath).replace(/\\/g, "/");
  if (relativePath === "" || relativePath.startsWith("../") || isAbsolute(relativePath)) fail(`${label} must stay inside the repository.`);
  return { absolutePath, relativePath };
}

function readConfig(pathInfo, label, expectedScrollbars) {
  const config = readJson(pathInfo.absolutePath, label);
  const scrollbars = config?.viewportPolicy?.scrollbars;
  if (scrollbars !== expectedScrollbars) {
    fail(`${label}.viewportPolicy.scrollbars must equal the Q-09 batch policy (${expectedScrollbars}).`);
  }
  return config;
}

function reportSummary(pathname, report, browser) {
  if (report.browserSessionId !== browser.sessionId || report.browserPid !== browser.browserPid) {
    fail(`report was not produced by the batch CDP session: ${pathname}`);
  }
  return {
    reportPath: relative(projectRoot, pathname).replace(/\\/g, "/"),
    failures: report.failures.length,
    humanReview: Array.isArray(report.humanReview) ? report.humanReview : [],
    browserSessionId: browser.sessionId,
    browserPid: browser.browserPid,
  };
}

function writeJson(pathname, value) {
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// P-3 の比較契約は、Q-09/Q-13/Q-08 と同一のCDP browserが実際に読んだ
// ページを後から突き合わせる。これは通常gateの合否条件ではなく、batch完了時の
// 観測証跡である。DOM本文のハッシュはbrowserではなくNode側で算出する。
function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function observePageIdentity(browser, p3NetworkTrace = null) {
  const observed = await browser.evaluate(`(() => {
    const resourceUrls = [...new Set(
      performance.getEntriesByType("resource")
        .map((entry) => entry && typeof entry.name === "string" ? entry.name : null)
        .filter(Boolean)
    )].sort();
    return {
      loadedUrl: location.href,
      documentHtml: document.documentElement ? document.documentElement.outerHTML : null,
      resourceUrls,
    };
  })()`);
  if (!observed || typeof observed.loadedUrl !== "string" || typeof observed.documentHtml !== "string" || !Array.isArray(observed.resourceUrls)) {
    fail("could not capture page identity from the batch CDP page.");
  }
  const pageIdentity = {
    loadedUrl: observed.loadedUrl,
    documentHtmlSha256: sha256(observed.documentHtml),
    resourceUrls: observed.resourceUrls,
  };
  if (p3NetworkTrace) pageIdentity.network = p3NetworkTrace.finalize({ pageIdentity });
  return pageIdentity;
}

async function runP3Phase(trace, id, operation) {
  if (!trace) return operation();
  const phase = trace.beginPhase(id);
  let operationError = null;
  try {
    return await operation();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await trace.endPhase(phase);
    } catch (traceError) {
      // 実装側の失敗が先に起きていても、P-3でその直後に通信が残った事実を
      // 捨てない。network failureを併記して原因を隠さない。
      if (operationError) {
        operationError.message = `${operationError.message} P-3 network phase ${id} also failed: ${traceError.message}`;
      } else {
        throw traceError;
      }
    }
  }
}

function normalizeJob(raw) {
  const job = requireObject(raw, "batch job");
  if (job.version !== 1) fail("batch job.version must be 1.");
  const url = requireString(job.url, "batch job.url");
  const scrollbars = job.scrollbars;
  if (scrollbars !== "hidden" && scrollbars !== "visible") fail('batch job.scrollbars must be "hidden" or "visible".');
  const layout = requireObject(job.layout, "batch job.layout");
  const layoutSpec = toProjectPath(layout.specPath, "batch job.layout.specPath");
  const accessibility = requireObject(job.accessibility, "batch job.accessibility");
  const accessibilityConfig = toProjectPath(accessibility.configPath, "batch job.accessibility.configPath");
  const accessibilityReport = toProjectPath(accessibility.reportPath, "batch job.accessibility.reportPath");
  const motion = requireObject(job.motion, "batch job.motion");
  const motionConfig = toProjectPath(motion.configPath, "batch job.motion.configPath");
  const motionReport = toProjectPath(motion.reportPath, "batch job.motion.reportPath");
  const captureDocument = requireObject(job.capture, "batch job.capture");
  if (!Array.isArray(captureDocument.jobs)) fail("batch job.capture.jobs must be an array.");
  const capture = captureDocument.jobs.length === 0
    ? { url, jobs: [], timeoutMs: 20000, scrollbars }
    : normalizeCaptureBatch({ ...captureDocument, url, scrollbars });
  const checkpointElementId = job.checkpointElementId == null ? null : requireString(job.checkpointElementId, "batch job.checkpointElementId");
  const preflightId = job.preflightId == null ? null : requireString(job.preflightId, "batch job.preflightId");
  if ((checkpointElementId === null) !== (preflightId === null)) fail("batch job.checkpointElementId and batch job.preflightId must be supplied together or both omitted.");
  const p3Hermetic = job.p3Hermetic === true;
  if (job.p3Hermetic != null && typeof job.p3Hermetic !== "boolean") fail("batch job.p3Hermetic must be boolean when supplied.");
  if (p3Hermetic && checkpointElementId === null) fail("batch job.p3Hermetic requires checkpointElementId and preflightId.");
  return {
    url,
    scrollbars,
    layoutSpec,
    accessibilityConfig,
    accessibilityReport,
    motionConfig,
    motionReport,
    capture,
    checkpointElementId,
    preflightId,
    p3Hermetic,
  };
}

export async function runGateBrowserBatch(rawJob) {
  const job = normalizeJob(rawJob);
  const layoutSpec = readJson(job.layoutSpec.absolutePath, "layout spec");
  if (layoutSpec?.viewportPolicy?.scrollbars !== job.scrollbars) {
    fail("layout spec viewportPolicy.scrollbars must equal batch job.scrollbars.");
  }
  const accessibilityConfig = readConfig(job.accessibilityConfig, "accessibility config", job.scrollbars);
  const motionConfig = readConfig(job.motionConfig, "motion config", job.scrollbars);
  const browser = await startCdpBrowser({ scrollbars: job.scrollbars });
  let p3NetworkTrace = null;
  const summary = {
    version: 1,
    status: "FAIL",
    url: job.url,
    browserSessionId: browser.sessionId,
    browserPid: browser.browserPid,
    chromeMode: browser.chromeMode,
    nodeVersion: process.version,
    browser: browser.browserVersion,
    checkpointElementId: job.checkpointElementId,
    preflightId: job.preflightId,
    p3Hermetic: job.p3Hermetic,
    captures: [],
    layout: null,
    accessibility: null,
    motion: null,
    pageIdentity: null,
  };
  try {
    // P-3親が明示したbatchだけがNetwork証跡を必須にする。
    // 通常gateはcheckpoint evidenceを持っていても既存のnetwork設定・FAIL条件のまま。
    if (job.p3Hermetic) {
      p3NetworkTrace = await startP3NetworkTrace(browser, { expectedUrl: job.url });
    }
    summary.layout = await runP3Phase(p3NetworkTrace, "q09-layout", () => runLayoutVerificationInBrowser({ browser, spec: layoutSpec, url: job.url }));
    if (summary.layout.browserSessionId !== browser.sessionId || Number(summary.layout.browserPid) !== browser.browserPid) {
      fail("layout verification was not produced by the batch CDP session.");
    }
    if (summary.layout.failCount > 0) fail(`LAYOUT FAIL: Q-09 has ${summary.layout.failCount} layout mismatch(es).`);

    const capture = await runP3Phase(p3NetworkTrace, "q09-capture", async () => (job.capture.jobs.length === 0
      ? (p3NetworkTrace
        ? (await navigateAndWait(browser, { url: job.url, width: 1440 }), { version: 1, url: job.url, browserSessionId: browser.sessionId, browserPid: browser.browserPid, chromeMode: browser.chromeMode, captures: [], p3NetworkProbe: true })
        : { version: 1, url: job.url, browserSessionId: browser.sessionId, browserPid: browser.browserPid, chromeMode: browser.chromeMode, captures: [] })
      : runCaptureBatch(job.capture, { browser })));
    if (capture.browserSessionId !== browser.sessionId || capture.browserPid !== browser.browserPid) {
      fail("capture was not produced by the Q-09 batch CDP session.");
    }
    summary.captures = capture.captures;

    const accessibility = await runP3Phase(p3NetworkTrace, "q13-accessibility", () => runAccessibilityVerificationInBrowser({
      browser,
      config: accessibilityConfig,
      url: job.url,
      reportPath: job.accessibilityReport.relativePath,
      projectRoot,
    }));
    summary.accessibility = reportSummary(accessibility.reportPath, accessibility.report, browser);
    if (accessibility.report.failures.length > 0) {
      fail(`SPEC FAIL: Q-13 accessibility verification found ${accessibility.report.failures.length} failure(s).`);
    }

    const motion = await runP3Phase(p3NetworkTrace, "q08-motion", () => runMotionVerificationInBrowser({
      browser,
      config: motionConfig,
      url: job.url,
      reportPath: job.motionReport.relativePath,
      projectRoot,
    }));
    summary.motion = reportSummary(motion.reportPath, motion.report, browser);
    if (motion.report.failures.length > 0) {
      fail(`SPEC FAIL: Q-08 motion verification found ${motion.report.failures.length} failure(s).`);
    }
    if (p3NetworkTrace) summary.pageIdentity = await observePageIdentity(browser, p3NetworkTrace);
    summary.status = "PASS";
    return summary;
  } finally {
    p3NetworkTrace?.close();
    await browser.close();
  }
}

async function main() {
  const [jobArg, summaryArg] = process.argv.slice(2);
  if (!jobArg || !summaryArg) fail("Usage: node gate-browser-batch.mjs <job.json> <summary.json>");
  const jobPath = toProjectPath(jobArg, "job path");
  const summaryPath = toProjectPath(summaryArg, "summary path");
  let summary;
  try {
    summary = await runGateBrowserBatch(readJson(jobPath.absolutePath, "batch job"));
  } catch (error) {
    const message = error?.message || String(error);
    writeJson(summaryPath.absolutePath, { version: 1, status: "FAIL", error: message });
    throw error;
  }
  writeJson(summaryPath.absolutePath, summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
