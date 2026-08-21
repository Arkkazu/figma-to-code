#!/usr/bin/env node
// checkpoint-diff.mjs — deterministic pixel diff with an optional alpha mask.
// Usage: node checkpoint-diff.mjs <imageA.png> <imageB.png> <diffOut.png> [options.json]

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function fail(message) {
  console.error(`CHECKPOINT DIFF: ${message}`);
  process.exit(1);
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readPng(path, PNG) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) fail(`Image does not exist: ${absolutePath}`);
  try {
    return { absolutePath, image: PNG.sync.read(readFileSync(absolutePath)) };
  } catch (error) {
    fail(`Not a readable PNG: ${absolutePath} (${error.message})`);
  }
}

function readOptions(path) {
  if (!path) return { mask: null };
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) fail(`Diff options file does not exist: ${absolutePath}`);
  let document;
  try {
    document = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(`Diff options file is not valid JSON: ${error.message}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) fail("Diff options must be an object.");
  if (document.mask === undefined || document.mask === null) return { mask: null };
  if (!document.mask || typeof document.mask !== "object" || Array.isArray(document.mask)) fail("Diff options mask must be an object.");
  if (typeof document.mask.path !== "string" || document.mask.path.trim() === "") fail("Diff options mask.path is required.");
  if (document.mask.mode !== undefined && document.mask.mode !== "exclude") fail('Diff options mask.mode must be "exclude".');
  return {
    mask: {
      path: document.mask.path,
      sha256: document.mask.sha256 === undefined ? null : document.mask.sha256,
      mode: document.mask.mode || "exclude",
    },
  };
}

const [, , inputA, inputB, diffOut, optionsPath] = process.argv;
if (!inputA || !inputB || !diffOut) {
  fail("Usage: checkpoint-diff.mjs <imageA.png> <imageB.png> <diffOut.png> [options.json]");
}

let pixelmatch;
let PNG;
try {
  const pixelmatchModule = await import("pixelmatch");
  pixelmatch = pixelmatchModule.default ?? pixelmatchModule;
  const pngModule = await import("pngjs");
  PNG = pngModule.PNG ?? pngModule.default?.PNG;
} catch (error) {
  fail(`pixelmatch / pngjs could not be loaded. Run "npm i -D pixelmatch pngjs" in the project. (${error.message})`);
}
if (typeof pixelmatch !== "function" || !PNG) fail("pixelmatch / pngjs resolved to unexpected exports.");

const first = readPng(inputA, PNG);
const second = readPng(inputB, PNG);
// 端数レイアウト（例: 857.508px）はFigma書き出しとブラウザ撮影で1pxの丸め差が出る。
// 1px以内は同一範囲とみなし、共通の最小サイズへクロップして正規化する（spec/09 §2-2）。
// 2px以上の差は正規化ではなく撮影条件の誤りなので従来どおり停止する。
const widthGap = Math.abs(first.image.width - second.image.width);
const heightGap = Math.abs(first.image.height - second.image.height);
if (widthGap > 1 || heightGap > 1) {
  fail(`Image dimensions differ: ${first.image.width}x${first.image.height} vs ${second.image.width}x${second.image.height}. Normalize both to the same logical size before diffing.`);
}
const cropWidth = Math.min(first.image.width, second.image.width);
const cropHeight = Math.min(first.image.height, second.image.height);
const roundingCrop = widthGap > 0 || heightGap > 0
  ? { appliedTo: "both", width: cropWidth, height: cropHeight, widthGap, heightGap }
  : null;
function cropTo(png, targetWidth, targetHeight) {
  if (png.width === targetWidth && png.height === targetHeight) return png;
  const cropped = new PNG({ width: targetWidth, height: targetHeight });
  PNG.bitblt(png, cropped, 0, 0, targetWidth, targetHeight, 0, 0);
  return cropped;
}
first.image = cropTo(first.image, cropWidth, cropHeight);
second.image = cropTo(second.image, cropWidth, cropHeight);

// Figmaの透過PNGは白いキャンバス上で表示されるが、生RGBAのままでは透明黒として比較される。
// 透過領域を白へ合成してから比較し、キャンバス差を実装差として数えない。
function flattenTransparentPixels(data) {
  let flattenedPixels = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (alpha === 255) continue;
    const foreground = alpha / 255;
    const background = 1 - foreground;
    data[offset] = Math.round(data[offset] * foreground + 255 * background);
    data[offset + 1] = Math.round(data[offset + 1] * foreground + 255 * background);
    data[offset + 2] = Math.round(data[offset + 2] * foreground + 255 * background);
    data[offset + 3] = 255;
    flattenedPixels += 1;
  }
  return flattenedPixels;
}

const figmaFlattenedPixels = flattenTransparentPixels(first.image.data);
const browserData = Buffer.from(second.image.data);
const browserFlattenedPixels = flattenTransparentPixels(browserData);

const options = readOptions(optionsPath);
let mask = null;
if (options.mask) {
  const loadedMask = readPng(options.mask.path, PNG);
  if (loadedMask.image.width !== first.image.width || loadedMask.image.height !== first.image.height) {
    fail(`Mask dimensions differ: ${loadedMask.image.width}x${loadedMask.image.height} vs ${first.image.width}x${first.image.height}.`);
  }
  const sha256 = hashFile(loadedMask.absolutePath);
  if (options.mask.sha256 && options.mask.sha256 !== sha256) fail(`Mask SHA-256 differs from the declared value: ${loadedMask.absolutePath}`);
  mask = { ...options.mask, absolutePath: loadedMask.absolutePath, sha256, image: loadedMask.image };
}

const { width, height } = first.image;
const totalPixels = width * height;
let maskedPixels = 0;
if (mask) {
  for (let offset = 0; offset < mask.image.data.length; offset += 4) {
    if (mask.image.data[offset + 3] === 0) continue;
    maskedPixels += 1;
    browserData[offset] = first.image.data[offset];
    browserData[offset + 1] = first.image.data[offset + 1];
    browserData[offset + 2] = first.image.data[offset + 2];
    browserData[offset + 3] = first.image.data[offset + 3];
  }
  if (maskedPixels === 0 || maskedPixels === totalPixels) fail("Mask must exclude at least one pixel and leave at least one pixel comparable.");
}

const diff = new PNG({ width, height });
const diffPixels = pixelmatch(first.image.data, browserData, diff.data, width, height, {
  threshold: 0.1,
  includeAA: false,
  alpha: 0.5,
});
if (mask) {
  for (let offset = 0; offset < mask.image.data.length; offset += 4) {
    if (mask.image.data[offset + 3] === 0) continue;
    diff.data[offset] = 0;
    diff.data[offset + 1] = 0;
    diff.data[offset + 2] = 0;
    diff.data[offset + 3] = 0;
  }
}

const diffOutAbsolute = resolve(diffOut);
mkdirSync(dirname(diffOutAbsolute), { recursive: true });
writeFileSync(diffOutAbsolute, PNG.sync.write(diff));
const comparedPixels = totalPixels - maskedPixels;
process.stdout.write(
  `${JSON.stringify({
    width,
    height,
    totalPixels,
    comparedPixels,
    maskedPixels,
    diffPixels,
    ratio: diffPixels / comparedPixels,
    mask: mask ? { path: mask.absolutePath, sha256: mask.sha256, mode: mask.mode } : null,
    roundingCrop,
    alphaNormalization: {
      canvasColor: "#ffffff",
      figmaFlattenedPixels,
      browserFlattenedPixels,
    },
  })}\n`
);