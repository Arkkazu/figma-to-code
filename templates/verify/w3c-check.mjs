#!/usr/bin/env node
// w3c-check.mjs — 対象URLのHTMLを取得し、W3C Nu Validator で検証して証跡を残す。
//
// ローカル開発URLは外部から到達できないため、取得したHTMLをPOSTして検証する。
// 証跡には検証時点のHTMLソース（PHP/HTMLテンプレート）のSHA-256を併記する。
// これが無いと「いつのソースに対する検証か」が分からず、古い合格証跡を使い回せてしまう。
//
// Usage:
//   node w3c-check.mjs <url> <outJsonPath> <htmlSourcePath...>

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const VALIDATOR = "https://validator.w3.org/nu/?out=json";

function fail(message) {
  console.error(`W3C CHECK: ${message}`);
  process.exit(1);
}

const [, , url, outPath, ...htmlSources] = process.argv;
if (!url || !outPath) fail("Usage: w3c-check.mjs <url> <outJsonPath> <htmlSourcePath...>");
if (htmlSources.length === 0) fail("At least one HTML source path is required so the evidence records what was validated.");

const sourceHashes = {};
for (const relativePath of htmlSources) {
  const absolutePath = resolve(relativePath);
  if (!existsSync(absolutePath)) fail(`HTML source does not exist: ${relativePath}`);
  sourceHashes[relativePath.replace(/\\/g, "/")] = createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function run(args, label, options = {}) {
  const result = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 180000, ...options });
  if (result.error) fail(`${label} could not run: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed with exit ${result.status}: ${(result.stderr || "").slice(0, 300)}`);
  return result.stdout;
}

const htmlPath = resolve(outPath).replace(/\.json$/, "") + ".fetched.html";
mkdirSync(dirname(resolve(outPath)), { recursive: true });
run(["-sL", "--fail", "--max-time", "120", url, "-o", htmlPath], `fetch ${url}`);
const html = readFileSync(htmlPath, "utf8");
if (html.trim() === "") fail(`Fetched HTML is empty: ${url}`);

const raw = run(
  [
    "-s",
    "--max-time", "180",
    "-X", "POST",
    "-H", "Content-Type: text/html; charset=utf-8",
    "-H", "User-Agent: figma-gate-w3c-check",
    "--data-binary", `@${htmlPath}`,
    VALIDATOR,
  ],
  "W3C Nu Validator"
);

let document;
try {
  document = JSON.parse(raw);
} catch (error) {
  fail(`Validator response is not JSON: ${error.message}`);
}
const messages = Array.isArray(document.messages) ? document.messages : [];
const errors = messages.filter((message) => message.type === "error");
const warnings = messages.filter((message) => message.type === "info" && message.subType === "warning");

writeFileSync(
  resolve(outPath),
  `${JSON.stringify(
    {
      version: 1,
      _comment:
        "W3C Nu Validator の実行証跡。ローカルURLは外部から到達できないため、取得したHTMLをPOSTして検証している。" +
        "sourceHashes は検証時点のテンプレートのSHA-256で、close がこれを現在の内容と突き合わせて古い証跡の使い回しを防ぐ。",
      checkedAt: new Date().toISOString(),
      url,
      validator: VALIDATOR,
      htmlBytes: html.length,
      sourceHashes,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors: errors.map((message) => ({ line: message.lastLine ?? null, message: message.message, extract: message.extract ?? null })),
      warnings: warnings.map((message) => ({ line: message.lastLine ?? null, message: message.message })),
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`W3C CHECK: ${url} — Error ${errors.length} / Warning ${warnings.length}`);
for (const error of errors.slice(0, 20)) {
  console.log(`  L${error.lastLine ?? "?"} ${error.message}`);
}
if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`);
console.log(`W3C CHECK: evidence written to ${outPath}`);
if (errors.length > 0) process.exit(1);
