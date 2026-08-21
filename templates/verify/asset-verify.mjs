#!/usr/bin/env node
// asset-verify.mjs — Q-05 のFigma export→登録済み出力→実ページ利用を照合する任意の独立検証器。
//
// Usage:
//   node MyBrain/verify/asset-verify.mjs <config.json> [url] [report.json]

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { navigateAndWait, startCdpBrowser } from "./cdp-browser.mjs";

const RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
const ALPHA_CLASSES = new Set(["opaque", "binary", "partial"]);

function fail(message) {
  throw new Error(`ASSET VERIFY: ${message}`);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireSha256(value, label) {
  const hash = requireString(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) fail(`${label} must be a lowercase SHA-256 string.`);
  return hash;
}

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) fail(`${label} must be a positive number.`);
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveProjectPath(projectRoot, value, label, mustExist = true) {
  const supplied = requireString(value, label).replace(/\\/g, "/");
  if (supplied.startsWith("/") || /^[A-Za-z]:\//.test(supplied) || supplied.split("/").includes("..")) {
    fail(`${label} must be a project-relative path.`);
  }
  const pathname = resolve(projectRoot, supplied);
  const relativePath = pathname.slice(projectRoot.length + 1);
  if (pathname === projectRoot || relativePath === "" || relativePath.startsWith("..")) fail(`${label} must stay inside the project root.`);
  if (mustExist && !existsSync(pathname)) fail(`${label} does not exist: ${supplied}`);
  return { pathname, relativePath: relativePath.replace(/\\/g, "/") };
}

function normalizeMime(value, label) {
  const mime = requireString(value, label).toLowerCase();
  if (!RASTER_MIMES.has(mime) && mime !== "image/svg+xml") fail(`${label} has unsupported MIME: ${mime}`);
  return mime;
}

function normalizeResponseMime(value) {
  if (typeof value !== "string") return null;
  const mime = value.split(";", 1)[0].trim().toLowerCase();
  return mime || null;
}

function validateIntrinsic(value, label) {
  const intrinsic = requireObject(value, label);
  return {
    width: requirePositiveNumber(intrinsic.width, `${label}.width`),
    height: requirePositiveNumber(intrinsic.height, `${label}.height`),
  };
}

function validateAssetFile(value, label, kind, projectRoot) {
  const file = requireObject(value, label);
  const path = resolveProjectPath(projectRoot, file.path, `${label}.path`, false);
  const mime = normalizeMime(file.mime, `${label}.mime`);
  if ((kind === "svg") !== (mime === "image/svg+xml")) fail(`${label}.mime must match asset kind ${kind}.`);
  const normalized = {
    path,
    sha256: requireSha256(file.sha256, `${label}.sha256`),
    mime,
    intrinsic: validateIntrinsic(file.intrinsic, `${label}.intrinsic`),
  };
  if (kind === "raster") {
    const alpha = requireString(file.alpha, `${label}.alpha`);
    if (!ALPHA_CLASSES.has(alpha)) fail(`${label}.alpha must be opaque, binary, or partial.`);
    normalized.alpha = alpha;
  }
  return normalized;
}

function validateUsage(value, label) {
  const usage = requireObject(value, label);
  const render = requireString(usage.render, `${label}.render`);
  if (!new Set(["img", "background-image"]).has(render)) fail(`${label}.render must be img or background-image.`);
  const css = requireObject(usage.css, `${label}.css`);
  const tolerance = css.tolerance === undefined ? 0 : css.tolerance;
  if (!Number.isFinite(tolerance) || tolerance < 0) fail(`${label}.css.tolerance must be a non-negative number when declared.`);
  return {
    selector: requireString(usage.selector, `${label}.selector`),
    render,
    url: requireString(usage.url, `${label}.url`),
    css: {
      width: requirePositiveNumber(css.width, `${label}.css.width`),
      height: requirePositiveNumber(css.height, `${label}.css.height`),
      tolerance,
    },
  };
}

function validateConfig(raw, projectRoot) {
  const config = requireObject(raw, "config");
  const viewportPolicy = requireObject(config.viewportPolicy, "config.viewportPolicy");
  if (!["hidden", "visible"].includes(viewportPolicy.scrollbars)) fail('config.viewportPolicy.scrollbars must be "hidden" or "visible".');
  const viewport = requireObject(config.viewport, "config.viewport");
  if (!Number.isInteger(viewport.width) || viewport.width <= 0 || !Number.isInteger(viewport.height) || viewport.height <= 0) {
    fail("config.viewport.width and config.viewport.height must be positive integers.");
  }
  if (!Array.isArray(config.assets) || config.assets.length === 0) fail("config.assets must be a non-empty array.");
  const ids = new Set();
  const assets = config.assets.map((rawAsset, index) => {
    const label = `config.assets[${index}]`;
    const asset = requireObject(rawAsset, label);
    const id = requireString(asset.id, `${label}.id`);
    if (ids.has(id)) fail(`${label}.id duplicates ${id}.`);
    ids.add(id);
    const kind = requireString(asset.kind, `${label}.kind`);
    if (!["raster", "svg"].includes(kind)) fail(`${label}.kind must be raster or svg.`);
    const figmaExport = validateAssetFile(asset.figmaExport, `${label}.figmaExport`, kind, projectRoot);
    const output = validateAssetFile(asset.output, `${label}.output`, kind, projectRoot);
    if (figmaExport.path.relativePath === output.path.relativePath) fail(`${label} must register distinct figmaExport.path and output.path.`);
    const registeredInputSha256 = requireSha256(asset.output.figmaExportSha256, `${label}.output.figmaExportSha256`);
    if (registeredInputSha256 !== figmaExport.sha256) {
      fail(`${label}.output.figmaExportSha256 must equal ${label}.figmaExport.sha256.`);
    }
    output.figmaExportSha256 = registeredInputSha256;
    return { id, kind, figmaExport, output, usage: validateUsage(asset.usage, `${label}.usage`) };
  });
  return {
    ...config,
    url: requireString(config.url, "config.url"),
    viewport: { width: viewport.width, height: viewport.height },
    viewportPolicy,
    assets,
  };
}

function detectMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"))) return "image/avif";
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text)) return "image/svg+xml";
  return "application/octet-stream";
}

function readSvgIntrinsic(bytes, label) {
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const match = text.match(/<svg\b([^>]*)>/i);
  if (!match) fail(`${label} is not an SVG root element.`);
  const viewBox = match[1].match(/\bviewBox\s*=\s*(["'])(.*?)\1/i)?.[2];
  if (!viewBox) fail(`${label} must declare a viewBox for the SVG contract.`);
  const values = viewBox.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) {
    fail(`${label} has an invalid viewBox.`);
  }
  return { width: values[2], height: values[3], viewBox: values };
}

function rasterAnalysisExpression(bytes, mime) {
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  return `new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let alpha = "opaque";
        for (let index = 3; index < pixels.length; index += 4) {
          const value = pixels[index];
          if (value !== 255) alpha = "binary";
          if (value !== 0 && value !== 255) { alpha = "partial"; break; }
        }
        resolve({ width: image.naturalWidth, height: image.naturalHeight, alpha });
      } catch (error) {
        reject(new Error(error.message));
      }
    };
    image.onerror = () => reject(new Error("browser could not decode raster bytes"));
    image.src = ${JSON.stringify(dataUrl)};
  })`;
}

async function observeFile(browser, file, kind, label) {
  if (!existsSync(file.path.pathname)) fail(`${label}.path does not exist: ${file.path.relativePath}`);
  const bytes = readFileSync(file.path.pathname);
  const mime = detectMime(bytes);
  const common = { path: file.path.relativePath, sha256: sha256(bytes), mime };
  if (kind === "svg") return { ...common, intrinsic: readSvgIntrinsic(bytes, label) };
  if (!RASTER_MIMES.has(mime)) fail(`${label}.path is not a supported raster file: ${file.path.relativePath} (${mime}).`);
  const raster = await browser.evaluate(rasterAnalysisExpression(bytes, mime), { awaitPromise: true });
  if (!raster || !Number.isFinite(raster.width) || !Number.isFinite(raster.height) || !ALPHA_CLASSES.has(raster.alpha)) {
    fail(`${label}.path could not be decoded into intrinsic dimensions and alpha classification.`);
  }
  return { ...common, intrinsic: { width: raster.width, height: raster.height }, alpha: raster.alpha };
}

function sameNumber(actual, expected) {
  return Number.isFinite(actual) && Number.isFinite(expected) && actual === expected;
}

function fileMismatches(declared, observed, label, kind) {
  const mismatches = [];
  if (declared.sha256 !== observed.sha256) mismatches.push({ type: "hash", label, expected: declared.sha256, actual: observed.sha256 });
  if (declared.mime !== observed.mime) mismatches.push({ type: "mime", label, expected: declared.mime, actual: observed.mime });
  if (!sameNumber(declared.intrinsic.width, observed.intrinsic.width) || !sameNumber(declared.intrinsic.height, observed.intrinsic.height)) {
    mismatches.push({ type: "intrinsic-dimensions", label, expected: declared.intrinsic, actual: observed.intrinsic });
  }
  if (kind === "raster" && declared.alpha !== observed.alpha) mismatches.push({ type: "alpha", label, expected: declared.alpha, actual: observed.alpha });
  return mismatches;
}

function usageExpression(usage) {
  return `(async () => {
    const selector = ${JSON.stringify(usage.selector)};
    const render = ${JSON.stringify(usage.render)};
    const element = document.querySelector(selector);
    if (!element) return { error: "not-found" };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    let rawUrl = null;
    if (render === "img") {
      if (!(element instanceof HTMLImageElement)) return { error: "not-img" };
      rawUrl = element.currentSrc || element.getAttribute("src");
    } else {
      const image = style.backgroundImage;
      const match = image.match(/^url\\((["']?)(.*?)\\1\\)$/);
      if (!match) return { error: "background-image-is-not-one-url", backgroundImage: image };
      rawUrl = match[2];
    }
    if (!rawUrl) return { error: "missing-url" };
    const actualUrl = new URL(rawUrl, document.baseURI).href;
    let resource = null;
    try {
      const response = await fetch(actualUrl, { cache: "no-store" });
      const bytes = await response.arrayBuffer();
      let hash = null;
      let bytesBase64 = null;
      if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        hash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
      } else {
        const raw = new Uint8Array(bytes);
        let binary = "";
        for (let offset = 0; offset < raw.length; offset += 8192) binary += String.fromCharCode(...raw.subarray(offset, offset + 8192));
        bytesBase64 = btoa(binary);
      }
      const contentType = response.headers.get("content-type");
      resource = { ok: response.ok, status: response.status, mime: contentType, sha256: hash, bytesBase64 };
    } catch (error) {
      resource = { error: error.message };
    }
    return { actualUrl, css: { width: rect.width, height: rect.height }, resource };
  })()`;
}

async function observeUsage(browser, usage, configUrl) {
  const observed = await browser.evaluate(usageExpression(usage), { awaitPromise: true });
  if (observed?.resource?.bytesBase64) {
    observed.resource.sha256 = sha256(Buffer.from(observed.resource.bytesBase64, "base64"));
    delete observed.resource.bytesBase64;
  }
  if (observed?.resource) observed.resource.normalizedMime = normalizeResponseMime(observed.resource.mime);
  const expectedUrl = new URL(usage.url, configUrl).href;
  const mismatches = [];
  if (!observed || observed.error) {
    mismatches.push({ type: "usage", selector: usage.selector, actual: observed?.error || "unknown" });
    return { expectedUrl, observed, mismatches };
  }
  if (observed.actualUrl !== expectedUrl) mismatches.push({ type: "referenced-url", expected: expectedUrl, actual: observed.actualUrl });
  if (Math.abs(observed.css.width - usage.css.width) > usage.css.tolerance || Math.abs(observed.css.height - usage.css.height) > usage.css.tolerance) {
    mismatches.push({ type: "css-dimensions", expected: usage.css, actual: observed.css });
  }
  if (!observed.resource?.ok || !observed.resource?.sha256) mismatches.push({ type: "referenced-resource", actual: observed.resource });
  return { expectedUrl, observed, mismatches };
}

async function verifyAsset(browser, asset, configUrl) {
  const figmaExport = await observeFile(browser, asset.figmaExport, asset.kind, `asset ${asset.id}.figmaExport`);
  const output = await observeFile(browser, asset.output, asset.kind, `asset ${asset.id}.output`);
  const usage = await observeUsage(browser, asset.usage, configUrl);
  const mismatches = [
    ...fileMismatches(asset.figmaExport, figmaExport, "figma-export", asset.kind),
    ...fileMismatches(asset.output, output, "output", asset.kind),
    ...usage.mismatches,
  ];
  if (asset.output.figmaExportSha256 !== figmaExport.sha256) {
    mismatches.push({ type: "registered-input-hash", expected: asset.output.figmaExportSha256, actual: figmaExport.sha256 });
  }
  if (usage.observed?.resource?.sha256 && usage.observed.resource.sha256 !== output.sha256) {
    mismatches.push({ type: "referenced-hash", expected: output.sha256, actual: usage.observed.resource.sha256 });
  }
  if (usage.observed?.resource?.ok && usage.observed.resource.normalizedMime !== output.mime) {
    mismatches.push({ type: "referenced-mime", expected: output.mime, actual: usage.observed.resource.normalizedMime, contentType: usage.observed.resource.mime });
  }
  if (asset.kind === "raster" && figmaExport.alpha === "partial" && output.alpha !== "partial") {
    mismatches.push({ type: "partial-alpha-degraded", expected: "partial", actual: output.alpha });
  }
  return {
    id: asset.id,
    kind: asset.kind,
    figmaExport: { declared: asset.figmaExport, observed: figmaExport },
    output: { declared: asset.output, observed: output, registeredInputSha256: asset.output.figmaExportSha256 },
    usage,
    mismatches,
    passed: mismatches.length === 0,
  };
}

function prepareConfig(config, url, projectRoot) {
  const validated = validateConfig(config, projectRoot);
  validated.url = requireString(url || validated.url, "config.url");
  return validated;
}

async function executeAssetVerification({ browser, validated, reportPath, projectRoot }) {
  const report = {
    version: 1,
    url: validated.url,
    generatedAt: new Date().toISOString(),
    browserSessionId: browser.sessionId,
    browserPid: browser.browserPid,
    assets: [],
    failures: [],
  };
  try {
    await navigateAndWait(browser, {
      url: validated.url,
      width: validated.viewport.width,
      height: validated.viewport.height,
      scrollbars: validated.viewportPolicy.scrollbars,
      selectors: validated.assets.map((asset) => asset.usage.selector),
    });
    for (const asset of validated.assets) {
      try {
        const result = await verifyAsset(browser, asset, validated.url);
        report.assets.push(result);
        if (!result.passed) report.failures.push({ type: "asset-record-failed", assetId: asset.id, mismatches: result.mismatches });
      } catch (error) {
        report.failures.push({ type: "asset-record-error", assetId: asset.id, message: error.message });
      }
    }
  } catch (error) {
    report.failures.push({ type: "runtime-error", message: error.message });
  }
  const outputPath = reportPath
    ? resolveProjectPath(projectRoot, reportPath, "reportPath", false).pathname
    : resolveProjectPath(projectRoot, validated.reportPath || "MyBrain/verify/reports/assets.json", "config.reportPath", false).pathname;
  writeJson(outputPath, report);
  return { report, reportPath: outputPath, validated };
}

export async function runAssetVerification({ config, url, reportPath, projectRoot = process.cwd() }) {
  const validated = prepareConfig(config, url, projectRoot);
  const browser = await startCdpBrowser({ initialWidth: validated.viewport.width, initialHeight: validated.viewport.height, scrollbars: validated.viewportPolicy.scrollbars });
  try {
    return await executeAssetVerification({ browser, validated, reportPath, projectRoot });
  } finally {
    await browser.close();
  }
}

async function main() {
  const [configArg, urlArg, reportArg] = process.argv.slice(2);
  if (!configArg) fail("Usage: node MyBrain/verify/asset-verify.mjs <config.json> [url] [report.json]");
  const projectRoot = process.cwd();
  const configPath = resolveProjectPath(projectRoot, configArg, "config path");
  const config = readJson(configPath.pathname, "Asset config");
  const { report, reportPath } = await runAssetVerification({ config, url: urlArg, reportPath: reportArg, projectRoot });
  console.log(JSON.stringify({ status: report.failures.length === 0 ? "PASS" : "FAIL", reportPath, failures: report.failures.length }, null, 2));
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
