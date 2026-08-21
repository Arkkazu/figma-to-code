#!/usr/bin/env node
// asset-verify.e2e.mjs — Q-05 asset verifier の隔離E2E。

import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startCdpBrowser } from "./cdp-browser.mjs";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "asset-verify-e2e-"));
const verifyDirectory = join(repo, "MyBrain", "verify");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function write(relativePath, value) {
  const pathname = join(repo, relativePath);
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeBinary(relativePath, bytes) {
  const pathname = join(repo, relativePath);
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, bytes);
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

async function canvasFixtures() {
  const browser = await startCdpBrowser({ initialWidth: 32, initialHeight: 32, scrollbars: "hidden" });
  try {
    const values = await browser.evaluate(`(() => {
      const encode = (type, pixels) => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 1;
        const context = canvas.getContext("2d");
        context.putImageData(new ImageData(new Uint8ClampedArray(pixels), 2, 1), 0, 0);
        return canvas.toDataURL(type).split(",")[1];
      };
      const partial = [255, 0, 0, 128, 0, 0, 255, 255];
      const binary = [255, 0, 0, 0, 0, 0, 255, 255];
      return {
        pngPartial: encode("image/png", partial),
        webpPartial: encode("image/webp", partial),
        webpBinary: encode("image/webp", binary),
      };
    })()`);
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Buffer.from(value, "base64")]));
  } finally {
    await browser.close();
  }
}

function rasterFile(path, bytes, mime, alpha) {
  return { path, sha256: sha256(bytes), mime, intrinsic: { width: 2, height: 1 }, alpha };
}

function svgFile(path, bytes) {
  return { path, sha256: sha256(bytes), mime: "image/svg+xml", intrinsic: { width: 30, height: 15 } };
}

function assetConfig(url, fixtures, overrides = {}) {
  const rasterExport = rasterFile("MyBrain/figma/photo.png", fixtures.pngPartial, "image/png", "partial");
  const rasterOutput = rasterFile("assets/photo-final.webp", fixtures.webpPartial, "image/webp", "partial");
  const svgExportBytes = Buffer.from('<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h30v15H0z"/></svg>');
  const svgOutputBytes = Buffer.from('<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M0 0h30v15H0z"/></svg>');
  const config = {
    url,
    reportPath: "MyBrain/verify/reports/assets.json",
    viewport: { width: 320, height: 200 },
    viewportPolicy: { scrollbars: "hidden" },
    assets: [
      {
        id: "transparent-raster",
        kind: "raster",
        figmaExport: rasterExport,
        output: { ...rasterOutput, figmaExportSha256: rasterExport.sha256 },
        usage: { selector: "#photo", render: "img", url: "/assets/photo-final.webp", css: { width: 20, height: 10 } },
      },
      {
        id: "svg-background",
        kind: "svg",
        figmaExport: svgFile("MyBrain/figma/icon.svg", svgExportBytes),
        output: { ...svgFile("assets/icon-final.svg", svgOutputBytes), figmaExportSha256: sha256(svgExportBytes) },
        usage: { selector: "#icon", render: "background-image", url: "/assets/icon-final.svg", css: { width: 30, height: 15 } },
      },
    ],
  };
  return structuredClone(typeof overrides === "function" ? (overrides(config) || config) : config);
}

function mismatch(result, type, assetId = null) {
  return result.report.failures.some((failure) => (assetId === null || failure.assetId === assetId) && failure.mismatches?.some((entry) => entry.type === type));
}

const page = `<!doctype html><html><head><style>
  #photo { display: block; width: 20px; height: 10px; }
  #icon { width: 30px; height: 15px; background-image: url('/assets/icon-final.svg'); }
</style></head><body><img id="photo" src="/assets/photo-final.webp" alt=""><div id="icon"></div></body></html>`;

let server;
const responseMimeOverrides = new Map();
const responseStatusOverrides = new Map();
const responseWithoutContentType = new Set();
try {
  mkdirSync(verifyDirectory, { recursive: true });
  copyFileSync(resolve(templateDirectory, "asset-verify.mjs"), join(verifyDirectory, "asset-verify.mjs"));
  copyFileSync(resolve(templateDirectory, "cdp-browser.mjs"), join(verifyDirectory, "cdp-browser.mjs"));
  const fixtures = await canvasFixtures();
  const svgExport = Buffer.from('<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h30v15H0z"/></svg>');
  const svgOutput = Buffer.from('<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M0 0h30v15H0z"/></svg>');
  writeBinary("MyBrain/figma/photo.png", fixtures.pngPartial);
  writeBinary("assets/photo-final.webp", fixtures.webpPartial);
  writeBinary("assets/photo-unreferenced.webp", fixtures.webpPartial);
  writeBinary("MyBrain/figma/icon.svg", svgExport);
  writeBinary("assets/icon-final.svg", svgOutput);

  server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(page);
      return;
    }
    const file = pathname === "/assets/photo-final.webp" ? "assets/photo-final.webp"
      : pathname === "/assets/photo-unreferenced.webp" ? "assets/photo-unreferenced.webp"
        : pathname === "/assets/icon-final.svg" ? "assets/icon-final.svg" : null;
    if (!file) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    const type = responseMimeOverrides.get(pathname) || (file.endsWith(".webp") ? "image/webp" : "image/svg+xml");
    const status = responseStatusOverrides.get(pathname) || 200;
    const headers = responseWithoutContentType.has(pathname) ? {} : { "content-type": type };
    response.writeHead(status, headers);
    response.end(readFileSync(join(repo, file)));
  });
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/`;
  const { runAssetVerification } = await import(pathToFileURL(join(verifyDirectory, "asset-verify.mjs")).href);

  const passConfig = assetConfig(url, fixtures);
  responseMimeOverrides.set("/assets/photo-final.webp", "IMAGE/WEBP; charset=binary");
  responseMimeOverrides.set("/assets/icon-final.svg", "IMAGE/SVG+XML; charset=utf-8");
  const pass = await runAssetVerification({ config: passConfig, projectRoot: repo });
  responseMimeOverrides.clear();
  const passRasterResource = pass.report.assets.find((asset) => asset.id === "transparent-raster")?.usage?.observed?.resource;
  const passSvgResource = pass.report.assets.find((asset) => asset.id === "svg-background")?.usage?.observed?.resource;
  if (pass.report.failures.length !== 0 || pass.report.assets.length !== 2 || pass.report.assets.some((asset) => !asset.passed)
    || passRasterResource?.mime !== "IMAGE/WEBP; charset=binary" || passRasterResource?.normalizedMime !== "image/webp"
    || passSvgResource?.mime !== "IMAGE/SVG+XML; charset=utf-8" || passSvgResource?.normalizedMime !== "image/svg+xml") {
    throw new Error(`transparent WebP and SVG must pass the complete source/output/browser chain with raw and normalized response MIME:\n${JSON.stringify(pass.report, null, 2)}`);
  }

  const hashFailure = await runAssetVerification({
    config: assetConfig(url, fixtures, (config) => { const wrongHash = "0".repeat(64); config.assets[0].figmaExport.sha256 = wrongHash; config.assets[0].output.figmaExportSha256 = wrongHash; return config; }),
    reportPath: "MyBrain/verify/reports/hash-fail.json",
    projectRoot: repo,
  });
  if (!mismatch(hashFailure, "hash")) throw new Error(`Figma export hash mismatch must fail:\n${JSON.stringify(hashFailure.report, null, 2)}`);

  const mimeFailure = await runAssetVerification({
    config: assetConfig(url, fixtures, (config) => { config.assets[0].output.mime = "image/png"; return config; }),
    reportPath: "MyBrain/verify/reports/mime-fail.json",
    projectRoot: repo,
  });
  if (!mismatch(mimeFailure, "mime", "transparent-raster") || mismatch(mimeFailure, "referenced-mime", "transparent-raster") || mimeFailure.report.assets.find((asset) => asset.id === "transparent-raster")?.output?.observed?.mime !== "image/webp") {
    throw new Error(`page MIME must compare to observed output MIME, not the mismatching declaration:\n${JSON.stringify(mimeFailure.report, null, 2)}`);
  }

  responseWithoutContentType.add("/assets/photo-final.webp");
  const missingResponseMimeFailure = await runAssetVerification({
    config: assetConfig(url, fixtures),
    reportPath: "MyBrain/verify/reports/missing-referenced-mime-fail.json",
    projectRoot: repo,
  });
  responseWithoutContentType.clear();
  const missingResponseMimeResource = missingResponseMimeFailure.report.assets.find((asset) => asset.id === "transparent-raster")?.usage?.observed?.resource;
  if (!mismatch(missingResponseMimeFailure, "referenced-mime", "transparent-raster") || missingResponseMimeResource?.mime !== null || missingResponseMimeResource?.normalizedMime !== null) {
    throw new Error(`a successful response without Content-Type must fail referenced MIME:\n${JSON.stringify(missingResponseMimeFailure.report, null, 2)}`);
  }

  responseStatusOverrides.set("/assets/photo-final.webp", 404);
  responseWithoutContentType.add("/assets/photo-final.webp");
  const nonOkResponseFailure = await runAssetVerification({
    config: assetConfig(url, fixtures),
    reportPath: "MyBrain/verify/reports/non-ok-referenced-resource-fail.json",
    projectRoot: repo,
  });
  responseStatusOverrides.clear();
  responseWithoutContentType.clear();
  const nonOkResponseResource = nonOkResponseFailure.report.assets.find((asset) => asset.id === "transparent-raster")?.usage?.observed?.resource;
  if (!mismatch(nonOkResponseFailure, "referenced-resource", "transparent-raster") || mismatch(nonOkResponseFailure, "referenced-mime", "transparent-raster") || nonOkResponseResource?.ok !== false || nonOkResponseResource?.mime !== null || nonOkResponseResource?.normalizedMime !== null) {
    throw new Error(`a non-2xx response must fail referenced resource without a MIME comparison:\n${JSON.stringify(nonOkResponseFailure.report, null, 2)}`);
  }

  responseMimeOverrides.set("/assets/photo-final.webp", "image/png; charset=binary");
  const rasterResponseMimeFailure = await runAssetVerification({
    config: assetConfig(url, fixtures),
    reportPath: "MyBrain/verify/reports/raster-referenced-mime-fail.json",
    projectRoot: repo,
  });
  responseMimeOverrides.clear();
  if (!mismatch(rasterResponseMimeFailure, "referenced-mime", "transparent-raster") || rasterResponseMimeFailure.report.assets[0]?.usage?.observed?.resource?.normalizedMime !== "image/png") {
    throw new Error(`raster page response MIME mismatch must fail:\n${JSON.stringify(rasterResponseMimeFailure.report, null, 2)}`);
  }

  responseMimeOverrides.set("/assets/icon-final.svg", "text/plain; charset=utf-8");
  const svgResponseMimeFailure = await runAssetVerification({
    config: assetConfig(url, fixtures),
    reportPath: "MyBrain/verify/reports/svg-referenced-mime-fail.json",
    projectRoot: repo,
  });
  responseMimeOverrides.clear();
  if (!mismatch(svgResponseMimeFailure, "referenced-mime", "svg-background") || svgResponseMimeFailure.report.assets[1]?.usage?.observed?.resource?.normalizedMime !== "text/plain") {
    throw new Error(`SVG page response MIME mismatch must fail:\n${JSON.stringify(svgResponseMimeFailure.report, null, 2)}`);
  }

  const dimensionFailure = await runAssetVerification({
    config: assetConfig(url, fixtures, (config) => { config.assets[0].output.intrinsic.width = 3; return config; }),
    reportPath: "MyBrain/verify/reports/dimension-fail.json",
    projectRoot: repo,
  });
  if (!mismatch(dimensionFailure, "intrinsic-dimensions")) throw new Error(`intrinsic dimension mismatch must fail:\n${JSON.stringify(dimensionFailure.report, null, 2)}`);

  writeBinary("assets/photo-final.webp", fixtures.webpBinary);
  const alphaFailure = await runAssetVerification({
    config: assetConfig(url, fixtures, (config) => {
      const output = rasterFile("assets/photo-final.webp", fixtures.webpBinary, "image/webp", "binary");
      config.assets[0].output = { ...output, figmaExportSha256: config.assets[0].figmaExport.sha256 };
      return config;
    }),
    reportPath: "MyBrain/verify/reports/alpha-fail.json",
    projectRoot: repo,
  });
  if (!mismatch(alphaFailure, "partial-alpha-degraded")) throw new Error(`partial alpha degradation must fail:\n${JSON.stringify(alphaFailure.report, null, 2)}`);
  writeBinary("assets/photo-final.webp", fixtures.webpPartial);

  const unreferencedFailure = await runAssetVerification({
    config: assetConfig(url, fixtures, (config) => {
      const output = rasterFile("assets/photo-unreferenced.webp", fixtures.webpPartial, "image/webp", "partial");
      config.assets[0].output = { ...output, figmaExportSha256: config.assets[0].figmaExport.sha256 };
      config.assets[0].usage.url = "/assets/photo-unreferenced.webp";
      return config;
    }),
    reportPath: "MyBrain/verify/reports/unreferenced-fail.json",
    projectRoot: repo,
  });
  if (!mismatch(unreferencedFailure, "referenced-url")) throw new Error(`unreferenced transform output must fail:\n${JSON.stringify(unreferencedFailure.report, null, 2)}`);

  const missingFailure = await runAssetVerification({
    config: assetConfig(url, fixtures, (config) => {
      config.assets[0].output.path = "assets/missing.webp";
      return config;
    }),
    reportPath: "MyBrain/verify/reports/missing-fail.json",
    projectRoot: repo,
  });
  if (!missingFailure.report.failures.some((failure) => failure.type === "asset-record-error" && /does not exist/.test(failure.message))) {
    throw new Error(`missing transform output must fail:\n${JSON.stringify(missingFailure.report, null, 2)}`);
  }

  console.log("asset-verify E2E PASS");
} finally {
  if (server) await close(server);
  rmSync(repo, { recursive: true, force: true });
}
