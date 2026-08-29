#!/usr/bin/env node
// Isolated P-3 boundary regression.  It passes an explicit platform argument
// to pure helpers; it never rewrites process.platform or host filesystem state.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fidelity = await import(pathToFileURL(resolve("templates/verify/fidelity-benchmark.mjs")).href);
const provider = await import(pathToFileURL(resolve("templates/verify/p3-page-provider.mjs")).href);
const darwin = "darwin";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function requireThrows(callback, expected, message) {
  try { callback(); }
  catch (error) {
    if (String(error.message).includes(expected)) return;
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${error.message}`);
  }
  throw new Error(`${message}: expected a rejection`);
}

for (const module of [fidelity, provider]) {
  require(module.p3UsesCaseInsensitivePathComparison(darwin) === true, "Darwin must use case-insensitive P-3 path comparison");
  require(module.p3UsesCaseInsensitivePathComparison("win32") === true, "Windows must use case-insensitive P-3 path comparison");
  require(module.p3UsesCaseInsensitivePathComparison("linux") === false, "Linux must retain case-sensitive P-3 path comparison");
}

// These are negative boundary cases: on default case-insensitive APFS, changing
// only casing must not turn a MyBrain/.figma-gate/node_modules artifact into a
// source-side artifact that can participate in a P-3 provider snapshot.
for (const pathname of [
  "mybrain/verify/plan.json",
  ".FIGMA-GATE/active.json",
  "Node_Modules/dependency/index.js",
]) {
  require(fidelity.p3SourcePath(pathname, darwin) === false, `Darwin case variant bypassed the source boundary: ${pathname}`);
}
require(fidelity.p3SourcePath("src/MyBrain-not-a-boundary/index.html", darwin) === true, "source boundary must remain segment-based");

const canonicalContract = fidelity.p3ContractKey("MyBrain/verify/P3-Plan.json", darwin);
const caseVariantContract = fidelity.p3ContractKey("mybrain/verify/p3-plan.json", darwin);
require(canonicalContract === caseVariantContract, "Darwin case-variant contract paths must share one fixed reservation key");
require(fidelity.p3CanonicalPath("/tmp/P3/Source", darwin) === fidelity.p3CanonicalPath("/tmp/p3/source", darwin), "fidelity canonical path must collapse Darwin case variants");

require(provider.p3CanonicalPath("/tmp/P3/Source", darwin) === provider.p3CanonicalPath("/tmp/p3/source", darwin), "provider canonical path must collapse Darwin case variants");
require(provider.p3PathWithin("/tmp/P3/Source", "/tmp/p3/source/build", darwin) === true, "provider must retain a case-variant descendant inside the Darwin workspace boundary");
require(provider.p3PathWithin("/tmp/P3/Source", "/tmp/p3/other/build", darwin) === false, "provider must reject a non-descendant despite Darwin case folding");
require(provider.p3RelativeWithin("/tmp/P3/Source", "/tmp/p3/source/Build", darwin) === "build", "provider must derive child segments from the Darwin-canonical boundary");
requireThrows(() => provider.p3RelativeWithin("/tmp/P3/Source", "/tmp/p3/other/build", darwin), "outside its declared root", "provider must reject a non-descendant before deriving child segments");

console.log("p3-path-boundary E2E PASS");
