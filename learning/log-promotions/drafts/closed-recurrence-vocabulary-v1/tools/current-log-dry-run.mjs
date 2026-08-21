#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const draftRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(draftRoot, "..", "..", "..", "..");
const candidateTool = resolve(toolDirectory, "figma-log-promote.v4-candidate.mjs");
const candidatePolicy = resolve(draftRoot, "rules", "log-promotion-policy.v4-candidate.json");
const sourcePaths = ["rules/corrections.md", "rules/mistakes.md"];
const hash = (text) => createHash("sha256").update(text).digest("hex");
const read = (path) => readFileSync(path, "utf8");
const write = (root, relativePath, text) => {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
};

function sections(text) {
  const matches = [...text.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => ({
    start: match.index,
    end: index + 1 < matches.length ? matches[index + 1].index : text.length,
    raw: text.slice(match.index, index + 1 < matches.length ? matches[index + 1].index : text.length),
  }));
}

function markerOnly(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error("source log is missing the schema marker");
  let next = text;
  for (const section of sections(text).filter((item) => item.start < markerIndex && !item.raw.includes("<!-- loop-log:" )).reverse()) {
    next = `${next.slice(0, section.start)}${next.slice(section.end)}`;
  }
  return next;
}

function ensurePolicyTargets(root, policy) {
  for (const path of [...policy.allowedRuleTargets, ...policy.allowedVerifierTargets]) {
    if (existsSync(resolve(root, path))) continue;
    write(root, path, path.endsWith(".mjs") ? "export {};\n" : "# fixture target\n");
  }
}

function requireRelativeRepositoryPath(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty relative path`);
  const normalized = value.replace(/\\/g, "/");
  const absolute = resolve(repositoryRoot, normalized);
  const relativePath = relative(repositoryRoot, absolute);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error(`${label} escapes the repository root`);
  return normalized;
}

function artifact(relativePath, kind) {
  const path = requireRelativeRepositoryPath(relativePath, kind);
  const text = read(resolve(repositoryRoot, path));
  return { kind, path, sha256: hash(text), bytes: Buffer.byteLength(text), text };
}

function publicArtifact({ kind, path, sha256, bytes }) {
  return { kind, path, sha256, bytes };
}

function collectHistoricalInputs() {
  const current = artifact("learning/log-promotions/proposals/current.json", "current-index");
  const index = JSON.parse(current.text);
  const all = [current];
  const seen = new Set([current.path]);
  const append = (path, kind) => {
    const normalized = requireRelativeRepositoryPath(path, kind);
    if (seen.has(normalized)) return;
    if (!existsSync(resolve(repositoryRoot, normalized))) throw new Error(`${kind} is missing: ${normalized}`);
    seen.add(normalized);
    all.push(artifact(normalized, kind));
  };
  const closedProposalIds = new Set();
  const closedClosureIds = new Set();
  for (const entry of Object.values(index.recurrenceKeys || {})) {
    for (const closed of entry.closed || []) {
      append(closed.proposalPath, "closed-proposal");
      closedProposalIds.add(closed.proposalId);
      if (closed.closureId) closedClosureIds.add(closed.closureId);
    }
  }
  const closureDirectory = resolve(repositoryRoot, "learning/log-promotions/closures");
  if (existsSync(closureDirectory)) {
    for (const name of readdirSync(closureDirectory).filter((item) => item.endsWith(".json")).sort()) {
      const relativePath = `learning/log-promotions/closures/${name}`;
      const receipt = JSON.parse(read(resolve(repositoryRoot, relativePath)));
      if (!closedProposalIds.has(receipt.proposal?.id) && !closedClosureIds.has(receipt.closure?.id)) continue;
      append(relativePath, "closure-receipt");
      if (receipt.closure?.path) append(receipt.closure.path, "closure-input");
    }
  }
  return all;
}

function copyHistoricalInputs(root, inputs) {
  for (const input of inputs) write(root, input.path, input.text);
}

function artifactInvariant(inputs) {
  return inputs.map((input) => {
    const after = read(resolve(repositoryRoot, input.path));
    const afterSha256 = hash(after);
    return {
      ...publicArtifact(input),
      afterSha256,
      byteInvariant: input.sha256 === afterSha256 && input.bytes === Buffer.byteLength(after),
    };
  });
}

function summarize(root, result, before, sourceText) {
  const after = Object.fromEntries(sourcePaths.map((path) => [path, hash(read(resolve(root, path)))]));
  const output = { exitCode: result.status, stdout: (result.stdout || "").trim(), stderr: (result.stderr || "").trim() };
  if (result.status !== 0) return { execution: output, sourceByteInvariant: Object.keys(before).every((path) => before[path] === after[path]) };
  const latest = JSON.parse(read(resolve(root, "learning/log-promotions/latest.json")));
  const report = JSON.parse(read(resolve(root, latest.reportPath)));
  const proposals = latest.proposalPaths.map((path) => {
    const proposal = JSON.parse(read(resolve(root, path)));
    return { id: proposal.id, path, recurrenceKey: proposal.recurrence.key, evidenceCount: proposal.recurrence.evidence.length };
  }).sort((a, b) => a.recurrenceKey.localeCompare(b.recurrenceKey));
  const proposalFamilies = proposals.map((proposal) => proposal.recurrenceKey);
  return {
    execution: output,
    sourceByteInvariant: Object.keys(before).every((path) => before[path] === after[path]),
    status: latest.status,
    recordCount: report.recordCount,
    nonPromotableCount: report.nonPromotableCount,
    unassignedLegacyCount: report.unassignedLegacyCount,
    unassignedLegacyKeys: report.unassignedLegacy.map((item) => item.sourceRecurrenceKey).sort(),
    unclassifiedCount: report.unclassifiedCount,
    proposalCount: latest.proposalPaths.length,
    proposalFamilies,
    proposals,
    closedProposalIds: latest.closedProposalIds,
    sourceText,
  };
}

function executeFixture({ mode, policy, originalSources, historicalInputs }) {
  const root = mkdtempSync(join(tmpdir(), `closed-recurrence-${mode}-`));
  try {
    ensurePolicyTargets(root, policy);
    write(root, "rules/log-promotion-policy.json", `${JSON.stringify(policy, null, 2)}\n`);
    const materialized = Object.fromEntries(sourcePaths.map((path) => [
      path,
      mode === "marker-only" ? markerOnly(originalSources[path], policy.schemaMarker) : originalSources[path],
    ]));
    for (const path of sourcePaths) write(root, path, materialized[path]);
    copyHistoricalInputs(root, historicalInputs);
    const before = Object.fromEntries(sourcePaths.map((path) => [path, hash(materialized[path]) ]));
    const result = spawnSync(process.execPath, [candidateTool, "scan", "rules/log-promotion-policy.json", "learning/log-promotions"], { cwd: root, encoding: "utf8" });
    if (result.error) throw new Error(`isolated ${mode} scan could not start: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`isolated ${mode} scan failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
    return summarize(root, result, before, mode === "marker-only" ? "marker-only projection" : "strict source copy");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

try {
  const policyText = read(candidatePolicy);
  const policy = JSON.parse(policyText);
  const originalSources = Object.fromEntries(sourcePaths.map((path) => [path, read(resolve(repositoryRoot, path))]));
  const originalBefore = Object.fromEntries(sourcePaths.map((path) => [path, hash(originalSources[path])]));
  const historicalInputs = collectHistoricalInputs();
  const strict = executeFixture({ mode: "strict", policy, originalSources, historicalInputs });
  const projection = executeFixture({ mode: "marker-only", policy, originalSources, historicalInputs });
  const originalAfter = Object.fromEntries(sourcePaths.map((path) => [path, hash(read(resolve(repositoryRoot, path)))]));
  const canonicalSources = sourcePaths.map((path) => ({
    path,
    beforeSha256: originalBefore[path],
    afterSha256: originalAfter[path],
    byteInvariant: originalBefore[path] === originalAfter[path],
  }));
  const historicalInputInvariant = artifactInvariant(historicalInputs);
  const result = {
    version: 1,
    kind: "isolated-log-promotion-v4-dry-run",
    candidatePolicySha256: hash(policyText),
    canonicalCommandsInvoked: [],
    canonicalSourceByteInvariant: canonicalSources.every((item) => item.byteInvariant),
    canonicalSources,
    canonicalHistoricalInputByteInvariant: historicalInputInvariant.every((item) => item.byteInvariant),
    canonicalHistoricalInputs: historicalInputInvariant,
    strict,
    markerOnlyProjection: projection,
    closureInterpretation: "A pending proposal in the marker-only projection has a changed full evidence set. It does not mutate or reopen the closed historical proposal; exact historical evidence remains suppressed by the candidate closure-equivalence regression.",
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`dry-run failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
}
