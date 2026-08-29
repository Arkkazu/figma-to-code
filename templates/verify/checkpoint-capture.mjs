#!/usr/bin/env node
// checkpoint-capture.mjs — condition-based browser capture for Figma checkpoints.
// Legacy: node checkpoint-capture.mjs <url> <selector> <viewportWidth> <outPng>
// Batch:  node checkpoint-capture.mjs --batch <jobs.json> <summary.json>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { captureElement, navigateAndWait, startCdpBrowser } from "./cdp-browser.mjs";

function fail(message) {
  console.error(`CHECKPOINT CAPTURE: ${message}`);
  process.exit(1);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required.`);
  return value;
}

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
  return value;
}

export function normalizeCaptureBatch(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Capture batch must be an object.");
  const url = requireString(document.url, "capture batch url");
  if (!Array.isArray(document.jobs) || document.jobs.length === 0) throw new Error("capture batch jobs must be a non-empty array.");
  const ids = new Set();
  const jobs = document.jobs.map((job, index) => {
    if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error(`capture batch jobs[${index}] must be an object.`);
    const id = requireString(job.id, `capture batch jobs[${index}].id`);
    if (ids.has(id)) throw new Error(`capture batch jobs contains duplicate id: ${id}.`);
    ids.add(id);
    return {
      id,
      selector: requireString(job.selector, `capture batch jobs[${index}].selector`),
      viewport: requireString(job.viewport, `capture batch jobs[${index}].viewport`),
      viewportWidth: requirePositiveNumber(Number(job.viewportWidth), `capture batch jobs[${index}].viewportWidth`),
      outputPath: requireString(job.outputPath, `capture batch jobs[${index}].outputPath`),
    };
  });
  // 遷移・描画完了の待機は cdp-browser 側の遷移用上限に任せる。
  // timeoutMs はCDPプロトコル往復の上限であって、ページ読み込みの上限ではない。
  const timeoutMs = document.timeoutMs === undefined ? 20000 : requirePositiveNumber(Number(document.timeoutMs), "capture batch timeoutMs");
  const scrollbars = document.scrollbars;
  if (scrollbars !== "hidden" && scrollbars !== "visible") {
    // CDP実測と同じ測定幅で撮影しないと、画像差分とレイアウト実測が別条件になる。
    throw new Error('capture batch scrollbars must be "hidden" or "visible" (same value as spec.viewportPolicy.scrollbars).');
  }
  return { url, jobs, timeoutMs, scrollbars };
}

// provided browser を渡すと、呼び出し元が所有する同一CDP sessionを使う。ここでcloseしない。
export async function runCaptureBatch(batch, { browser: providedBrowser = null } = {}) {
  const browser = providedBrowser || await startCdpBrowser({ timeoutMs: batch.timeoutMs, scrollbars: batch.scrollbars });
  const captures = [];
  const jobsByViewport = new Map();
  for (const job of batch.jobs) {
    const key = String(job.viewportWidth);
    if (!jobsByViewport.has(key)) jobsByViewport.set(key, []);
    jobsByViewport.get(key).push(job);
  }

  try {
    for (const jobs of jobsByViewport.values()) {
      const viewportWidth = jobs[0].viewportWidth;
      const readiness = await navigateAndWait(browser, {
        url: batch.url,
        width: viewportWidth,
        selectors: jobs.map((job) => job.selector),
      });
      for (const job of jobs) {
        const capture = await captureElement(browser, job.selector);
        const outputPath = resolve(job.outputPath);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, Buffer.from(capture.base64, "base64"));
        captures.push({
          id: job.id,
          selector: job.selector,
          viewport: job.viewport,
          viewportWidth,
          clip: capture.clip,
          outputPath,
          browserSessionId: browser.sessionId,
          browserPid: browser.browserPid,
          chromeMode: browser.chromeMode,
          readiness,
        });
      }
    }
  } finally {
    if (!providedBrowser) await browser.close();
  }

  return {
    version: 1,
    url: batch.url,
    browserSessionId: captures[0]?.browserSessionId ?? browser.sessionId ?? null,
    browserPid: captures[0]?.browserPid ?? browser.browserPid ?? null,
    chromeMode: captures[0]?.chromeMode ?? browser.chromeMode ?? null,
    captures,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--batch") {
    if (!args[1] || !args[2]) throw new Error("Usage: checkpoint-capture.mjs --batch <jobs.json> <summary.json>");
    const batch = normalizeCaptureBatch(readJson(resolve(args[1]), "Capture jobs"));
    const summary = await runCaptureBatch(batch);
    const summaryPath = resolve(args[2]);
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }

  const [url, selector, viewportWidthArg, outputPath] = args;
  if (!url || !selector || !viewportWidthArg || !outputPath) {
    throw new Error("Usage: checkpoint-capture.mjs <url> <selector> <viewportWidth> <outPng>");
  }
  const batch = normalizeCaptureBatch({
    url,
    jobs: [{ id: "legacy", selector, viewport: "legacy", viewportWidth: Number(viewportWidthArg), outputPath }],
    scrollbars: "hidden",
  });
  const summary = await runCaptureBatch(batch);
  process.stdout.write(`${JSON.stringify(summary.captures[0])}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error.message));
}