#!/usr/bin/env node
// checkpoint-diff.e2e.mjs — verifies transparency normalization through the synced runtime copy.

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeScript = resolve(process.cwd(), "MyBrain", "verify", "checkpoint-diff.mjs");
const canonicalScript = resolve(templateDirectory, "checkpoint-diff.mjs");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (!existsSync(runtimeScript)) throw new Error(`Synced checkpoint diff is missing: ${runtimeScript}`);
if (sha256(canonicalScript) !== sha256(runtimeScript)) {
  throw new Error("checkpoint-diff source and synced runtime copy differ.");
}

const runtimeRequire = createRequire(resolve(process.cwd(), "package.json"));
const { PNG } = runtimeRequire("pngjs");
const fixtureDirectory = mkdtempSync(join(process.cwd(), ".checkpoint-diff-e2e-"));

function writePng(path, rgba) {
  const image = new PNG({ width: 2, height: 1 });
  image.data.set(rgba);
  writeFileSync(path, PNG.sync.write(image));
}

function runDiff(id, figmaRgba, browserRgba) {
  const figmaPath = join(fixtureDirectory, `${id}-figma.png`);
  const browserPath = join(fixtureDirectory, `${id}-browser.png`);
  const diffPath = join(fixtureDirectory, `${id}-diff.png`);
  writePng(figmaPath, figmaRgba);
  writePng(browserPath, browserRgba);
  const result = spawnSync(process.execPath, [runtimeScript, figmaPath, browserPath, diffPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`checkpoint diff ${id} failed (status=${result.status}, error=${result.error?.message ?? "none"}):\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  if (!existsSync(diffPath)) throw new Error(`checkpoint diff ${id} did not write a diff image.`);
  return JSON.parse(result.stdout.trim());
}

try {
  const transparentFigma = runDiff(
    "transparent-figma",
    [0, 0, 0, 0, 0, 128, 255, 128],
    [255, 255, 255, 255, 127, 191, 255, 255],
  );
  if (transparentFigma.diffPixels !== 0 || transparentFigma.alphaNormalization.figmaFlattenedPixels !== 2 || transparentFigma.alphaNormalization.browserFlattenedPixels !== 0) {
    throw new Error(`transparent Figma pixels were not normalized as white canvas: ${JSON.stringify(transparentFigma)}`);
  }

  const transparentBrowser = runDiff(
    "transparent-browser",
    [255, 255, 255, 255, 20, 40, 60, 255],
    [0, 0, 0, 0, 20, 40, 60, 255],
  );
  if (transparentBrowser.diffPixels !== 0 || transparentBrowser.alphaNormalization.figmaFlattenedPixels !== 0 || transparentBrowser.alphaNormalization.browserFlattenedPixels !== 1) {
    throw new Error(`transparent browser pixels were not normalized as white canvas: ${JSON.stringify(transparentBrowser)}`);
  }

  const opaqueEqual = runDiff(
    "opaque-equal",
    [1, 2, 3, 255, 4, 5, 6, 255],
    [1, 2, 3, 255, 4, 5, 6, 255],
  );
  if (opaqueEqual.diffPixels !== 0 || opaqueEqual.alphaNormalization.figmaFlattenedPixels !== 0 || opaqueEqual.alphaNormalization.browserFlattenedPixels !== 0) {
    throw new Error(`opaque pixels changed during normalization: ${JSON.stringify(opaqueEqual)}`);
  }

  const actualDifference = runDiff(
    "actual-difference",
    [0, 0, 0, 0, 0, 0, 0, 0],
    [255, 255, 255, 255, 0, 0, 0, 255],
  );
  if (actualDifference.diffPixels === 0) {
    throw new Error(`normalization hid an actual visible difference: ${JSON.stringify(actualDifference)}`);
  }
  console.log("checkpoint-diff E2E PASS");
} finally {
  rmSync(fixtureDirectory, { recursive: true, force: true });
}
