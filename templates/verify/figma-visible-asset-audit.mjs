import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { navigateAndWait, startCdpBrowser } from "./cdp-browser.mjs";

const root = process.cwd();
const [phase, ledgerArg, urlArg] = process.argv.slice(2);
const reportFlagIndex = process.argv.indexOf("--report");
const reportArg = reportFlagIndex === -1 ? null : process.argv[reportFlagIndex + 1];
const viewportWidths = Object.freeze({ pc: 1440, sp: 375 });
const tolerance = 0.12;

function fail(message) {
  throw new Error(message);
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value;
}

function requireNumber(value, label) {
  if (!Number.isFinite(value)) fail(`${label} must be a finite number.`);
  return value;
}

function equalWithin(actual, expected) {
  return Math.abs(actual - expected) <= tolerance;
}

function ledgerEntries(ledger) {
  if (ledger?.version !== 1 || !Array.isArray(ledger.assets) || ledger.assets.length === 0) {
    fail("Visible asset ledger must use version 1 and contain at least one asset.");
  }

  const entries = [];
  for (const asset of ledger.assets) {
    const id = requireString(asset?.id, "ledger.assets[].id");
    const implementationPath = requireString(asset?.implementationPath, `${id}.implementationPath`);
    const implementationSha256 = requireString(asset?.implementationSha256, `${id}.implementationSha256`).toLowerCase();
    if (!Array.isArray(asset.viewports) || asset.viewports.length === 0) fail(`${id}.viewports must contain PC/SP rows.`);
    for (const viewport of asset.viewports) {
      const name = requireString(viewport?.name, `${id}.viewports[].name`);
      if (!Object.hasOwn(viewportWidths, name)) fail(`${id}.${name} has an unsupported viewport.`);
      const frame = viewport.frame;
      const insetPercent = viewport.insetPercent;
      if (!Array.isArray(frame) || frame.length !== 2 || !Array.isArray(insetPercent) || insetPercent.length !== 4) {
        fail(`${id}.${name} must declare frame[width,height] and insetPercent[top,right,bottom,left].`);
      }
      const exportPath = resolve(root, requireString(viewport.exportPath, `${id}.${name}.exportPath`));
      if (!existsSync(exportPath)) fail(`${id}.${name} Figma export is missing: ${exportPath}`);
      const exportSha256 = requireString(viewport.exportSha256, `${id}.${name}.exportSha256`).toLowerCase();
      if (hashFile(exportPath) !== exportSha256) fail(`${id}.${name} Figma export hash differs: ${exportPath}`);
      entries.push({
        id,
        name,
        implementationPath,
        implementationSha256,
        frameSelector: requireString(viewport.frameSelector, `${id}.${name}.frameSelector`),
        vectorSelector: requireString(viewport.vectorSelector, `${id}.${name}.vectorSelector`),
        frame: frame.map((value, index) => requireNumber(value, `${id}.${name}.frame[${index}]`)),
        insetPercent: insetPercent.map((value, index) => requireNumber(value, `${id}.${name}.insetPercent[${index}]`)),
        figmaLayerId: requireString(viewport.figmaLayerId, `${id}.${name}.figmaLayerId`),
        figmaVectorLayerId: requireString(viewport.figmaVectorLayerId, `${id}.${name}.figmaVectorLayerId`),
      });
    }
  }

  for (const name of Object.keys(viewportWidths)) {
    if (!entries.some((entry) => entry.name === name)) fail(`Visible asset ledger has no ${name} row.`);
  }
  return entries;
}

function assertImplementationFiles(entries) {
  for (const asset of new Map(entries.map((entry) => [entry.id, entry])).values()) {
    const implementationPath = resolve(root, asset.implementationPath);
    if (!existsSync(implementationPath)) fail(`${asset.id} local implementation asset is missing: ${asset.implementationPath}`);
    if (hashFile(implementationPath) !== asset.implementationSha256) {
      fail(`${asset.id} local implementation asset differs from the registered Figma canonical export: ${asset.implementationPath}`);
    }
  }
}

async function runtimeAudit(entries, url) {
  const measurements = [];
  const browser = await startCdpBrowser({ initialWidth: 1440, initialHeight: 1200, scrollbars: "visible" });
  try {
    for (const [name, width] of Object.entries(viewportWidths)) {
      const viewportEntries = entries.filter((entry) => entry.name === name);
      await navigateAndWait(browser, { url, width, selectors: viewportEntries.map((entry) => entry.frameSelector) });
      const rows = await browser.evaluate(`(() => {
        const entries = ${JSON.stringify(viewportEntries.map((entry) => ({ id: entry.id, frameSelector: entry.frameSelector, vectorSelector: entry.vectorSelector })))};
        return entries.map((entry) => {
          const frame = document.querySelector(entry.frameSelector);
          const vector = document.querySelector(entry.vectorSelector);
          const image = vector?.querySelector("img");
          if (!frame || !vector || !image) return { id: entry.id, error: "frame, vector, or image is missing" };
          const frameRect = frame.getBoundingClientRect();
          const vectorRect = vector.getBoundingClientRect();
          return {
            id: entry.id,
            frame: { width: frameRect.width, height: frameRect.height },
            vector: {
              width: vectorRect.width,
              height: vectorRect.height,
              top: vectorRect.top - frameRect.top,
              right: frameRect.right - vectorRect.right,
              bottom: frameRect.bottom - vectorRect.bottom,
              left: vectorRect.left - frameRect.left,
            },
            currentSrc: image.currentSrc,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          };
        });
      })()`);
      for (const entry of viewportEntries) {
        const row = rows.find((candidate) => candidate.id === entry.id);
        if (!row || row.error) fail(`${entry.id}.${name}: ${row?.error || "measurement is missing"}`);
        const [expectedWidth, expectedHeight] = entry.frame;
        const [topPercent, rightPercent, bottomPercent, leftPercent] = entry.insetPercent;
        const expectedVectorWidth = expectedWidth * (1 - (leftPercent + rightPercent) / 100);
        const expectedVectorHeight = expectedHeight * (1 - (topPercent + bottomPercent) / 100);
        const expectedInsets = [expectedHeight * topPercent / 100, expectedWidth * rightPercent / 100, expectedHeight * bottomPercent / 100, expectedWidth * leftPercent / 100];
        const actualInsets = [row.vector.top, row.vector.right, row.vector.bottom, row.vector.left];
        const values = [
          ["frame.width", row.frame.width, expectedWidth], ["frame.height", row.frame.height, expectedHeight],
          ["vector.width", row.vector.width, expectedVectorWidth], ["vector.height", row.vector.height, expectedVectorHeight],
          ["vector.top", actualInsets[0], expectedInsets[0]], ["vector.right", actualInsets[1], expectedInsets[1]],
          ["vector.bottom", actualInsets[2], expectedInsets[2]], ["vector.left", actualInsets[3], expectedInsets[3]],
        ];
        for (const [label, actual, expected] of values) {
          if (!equalWithin(actual, expected)) fail(`${entry.id}.${name} ${label} expected=${expected} actual=${actual}`);
        }
        const expectedPath = `/${entry.implementationPath.replace(/^\/+/, "")}`;
        let actualPath = "";
        try { actualPath = new URL(row.currentSrc).pathname; } catch { fail(`${entry.id}.${name} has an invalid image src.`); }
        if (!actualPath.endsWith(expectedPath) || row.naturalWidth <= 0 || row.naturalHeight <= 0) {
          fail(`${entry.id}.${name} image source or decode failed: ${row.currentSrc}`);
        }
        measurements.push({ id: entry.id, viewport: name, figmaLayerId: entry.figmaLayerId, figmaVectorLayerId: entry.figmaVectorLayerId, ...row });
      }
    }
  } finally {
    await browser.close();
  }
  return measurements;
}

function writeReport(report) {
  if (!reportArg) return;
  const path = resolve(root, reportArg);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

try {
  if (phase !== "preflight" && phase !== "check") fail("Usage: node figma-visible-asset-audit.mjs <preflight|check> <ledger.json> [url] [--report <path>]");
  const ledgerPath = resolve(root, requireString(ledgerArg, "ledger path"));
  const ledger = readJson(ledgerPath, "Visible asset ledger");
  const entries = ledgerEntries(ledger);
  const report = { version: 1, phase, ledgerPath: ledgerArg, generatedAt: new Date().toISOString(), entries: entries.map(({ id, name, figmaLayerId, figmaVectorLayerId, implementationPath }) => ({ id, viewport: name, figmaLayerId, figmaVectorLayerId, implementationPath })) };
  if (phase === "check") {
    const url = requireString(urlArg, "check url");
    assertImplementationFiles(entries);
    report.url = url;
    report.measurements = await runtimeAudit(entries, url);
  }
  report.result = "PASS";
  writeReport(report);
  console.log(`VISIBLE ASSET AUDIT PASS: ${phase} (${entries.length} PC/SP rows)`);
} catch (error) {
  const report = { version: 1, phase: phase || null, ledgerPath: ledgerArg || null, generatedAt: new Date().toISOString(), result: "FAIL", error: error.message };
  try { writeReport(report); } catch {}
  console.error(`VISIBLE ASSET AUDIT FAIL: ${error.message}`);
  process.exitCode = 1;
}
