#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";

// Draft-only implementation. The repository root is the process cwd so the
// candidate can be run only against an isolated fixture.
const repoRoot = process.cwd();
const [command, ...args] = process.argv.slice(2);

class PromotionError extends Error {}

function fail(message) { throw new PromotionError(message); }
function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function requireObject(value, label) { if (!isPlainObject(value)) fail(`${label} must be an object.`); return value; }
function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}
function requirePositiveInteger(value, label, minimum = 1) {
  if (!Number.isInteger(value) || value < minimum) fail(`${label} must be an integer greater than or equal to ${minimum}.`);
  return value;
}
function requireIdentifier(value, label) {
  const normalized = requireString(value, label);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) fail(`${label} must use letters, numbers, dot, underscore, or hyphen.`);
  return normalized;
}
function toRepoPath(value, label) {
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(`${label} must be relative to the Figma rule root.`);
  const absolutePath = resolve(repoRoot, input);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) fail(`${label} must stay inside the Figma rule root.`);
  return { absolutePath, relativePath: relativePath.replace(/\\/g, "/") };
}
function normalizeRepoPath(value, label, { mustExist = false } = {}) {
  const path = toRepoPath(value, label);
  if (mustExist && !existsSync(path.absolutePath)) fail(`${label} does not exist: ${path.relativePath}`);
  return path.relativePath;
}
function readText(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} does not exist: ${filePath}`);
  return readFileSync(filePath, "utf8");
}
function readJson(filePath, label) {
  try { return JSON.parse(readText(filePath, label)); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, jsonText(value), "utf8");
}
function writeImmutableJson(filePath, value, label) {
  const next = jsonText(value);
  if (existsSync(filePath)) {
    if (readText(filePath, label) !== next) fail(`${label} is immutable and already differs: ${filePath}`);
    return false;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, next, "utf8");
  return true;
}
function writeImmutableText(filePath, text, label) {
  if (existsSync(filePath)) {
    if (readText(filePath, label) !== text) fail(`${label} is immutable and already differs: ${filePath}`);
    return false;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, "utf8");
  return true;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sha256File(path, label) { return sha256(readText(path, label)); }
function normalizeUniqueStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array.`);
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(`${label} must not contain duplicates.`);
  return normalized;
}
function normalizeIdentifierArray(value, label) {
  return normalizeUniqueStringArray(value, label).map((item, index) => requireIdentifier(item, `${label}[${index}]`));
}
function lineNumber(text, index) { return text.slice(0, index).split(/\r?\n/).length; }
function markdownSections(text) {
  const matches = [...text.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return { heading: match[1].trim(), start, end, line: lineNumber(text, start), raw: text.slice(start, end) };
  });
}

function validatePolicy(raw) {
  requireObject(raw, "Log promotion policy");
  if (raw.version !== 4) fail("Log promotion policy.version must be 4.");
  if (requireString(raw.mode, "Log promotion policy.mode") !== "proposal") fail("Log promotion policy.mode must be proposal.");
  const sourceLogs = raw.sourceLogs;
  if (!Array.isArray(sourceLogs) || sourceLogs.length === 0) fail("Log promotion policy.sourceLogs must be a non-empty array.");
  const normalizedSources = sourceLogs.map((source, index) => {
    requireObject(source, `Log promotion policy.sourceLogs[${index}]`);
    const kind = requireString(source.kind, `Log promotion policy.sourceLogs[${index}].kind`);
    if (!["correction", "mistake"].includes(kind)) fail(`Log promotion policy.sourceLogs[${index}].kind is invalid.`);
    return { kind, path: normalizeRepoPath(source.path, `Log promotion policy.sourceLogs[${index}].path`, { mustExist: true }) };
  });
  if (new Set(normalizedSources.map((source) => source.path)).size !== normalizedSources.length) fail("Log promotion policy.sourceLogs must not contain duplicate paths.");
  const allowedRecurrenceKeys = normalizeIdentifierArray(raw.allowedRecurrenceKeys, "Log promotion policy.allowedRecurrenceKeys");
  const allowedRecurrenceKeySet = new Set(allowedRecurrenceKeys);
  const rawAliases = requireObject(raw.recurrenceKeyAliases, "Log promotion policy.recurrenceKeyAliases");
  const recurrenceKeyAliases = new Map();
  for (const legacyInput of Object.keys(rawAliases).sort()) {
    const legacyKey = requireIdentifier(legacyInput, `Log promotion policy.recurrenceKeyAliases key ${legacyInput}`);
    const canonicalKey = requireIdentifier(rawAliases[legacyInput], `Log promotion policy.recurrenceKeyAliases.${legacyKey}`);
    if (legacyKey === canonicalKey || allowedRecurrenceKeySet.has(legacyKey)) fail(`Log promotion policy.recurrenceKeyAliases.${legacyKey} must be a legacy-only alias.`);
    if (!allowedRecurrenceKeySet.has(canonicalKey)) fail(`Log promotion policy.recurrenceKeyAliases.${legacyKey} must target an allowed recurrence key.`);
    recurrenceKeyAliases.set(legacyKey, canonicalKey);
  }
  const allowedRuleTargets = normalizeUniqueStringArray(raw.allowedRuleTargets, "Log promotion policy.allowedRuleTargets")
    .map((path, index) => normalizeRepoPath(path, `Log promotion policy.allowedRuleTargets[${index}]`, { mustExist: true }));
  const allowedVerifierTargets = normalizeUniqueStringArray(raw.allowedVerifierTargets, "Log promotion policy.allowedVerifierTargets")
    .map((path, index) => normalizeRepoPath(path, `Log promotion policy.allowedVerifierTargets[${index}]`, { mustExist: true }));
  const review = requireObject(raw.review, "Log promotion policy.review");
  if (review.requiresIndependentReview !== true || review.requiresOwnerApproval !== true || review.requiresNegativeE2E !== true || review.requiresAtomicPromotionPlan !== true) {
    fail("Log promotion policy.review must require independent review, owner approval, a negative E2E, and an atomic promotion plan.");
  }
  return {
    version: 4,
    mode: "proposal",
    schemaMarker: requireString(raw.schemaMarker, "Log promotion policy.schemaMarker"),
    sourceLogs: normalizedSources,
    recurrenceThreshold: requirePositiveInteger(raw.recurrenceThreshold, "Log promotion policy.recurrenceThreshold", 2),
    allowedRecurrenceKeys,
    allowedRecurrenceKeySet,
    recurrenceKeyAliases,
    allowedRuleTargets,
    allowedVerifierTargets,
    review: {
      loopEngineeringSpec: requireString(review.loopEngineeringSpec, "Log promotion policy.review.loopEngineeringSpec"),
      requiresIndependentReview: true,
      requiresOwnerApproval: true,
      requiresNegativeE2E: true,
      requiresAtomicPromotionPlan: true,
    },
  };
}

function resolveStoredRecurrenceKey(policy, sourceRecurrenceKey) {
  if (policy.allowedRecurrenceKeySet.has(sourceRecurrenceKey)) {
    return { sourceRecurrenceKey, canonicalRecurrenceKey: sourceRecurrenceKey, aliasApplied: false };
  }
  const canonicalRecurrenceKey = policy.recurrenceKeyAliases.get(sourceRecurrenceKey);
  if (canonicalRecurrenceKey) return { sourceRecurrenceKey, canonicalRecurrenceKey, aliasApplied: true };
  return null;
}
function requireNewRecordRecurrenceKey(policy, value, label) {
  const recurrenceKey = requireIdentifier(value, label);
  if (!policy.allowedRecurrenceKeySet.has(recurrenceKey)) {
    fail(`${label} must be one of Log promotion policy.allowedRecurrenceKeys; legacy aliases are read-only.`);
  }
  return recurrenceKey;
}
function assertAllowedTargets(ruleTargets, verifierTargets, policy, label) {
  for (const path of ruleTargets) if (!policy.allowedRuleTargets.includes(path)) fail(`${label} targets a non-approved rule path: ${path}`);
  for (const path of verifierTargets) if (!policy.allowedVerifierTargets.includes(path)) fail(`${label} targets a non-approved verifier path: ${path}`);
}
function requireNonPromotableReason(value, label) {
  const normalized = assertNoProjectFacts(value, label);
  if ([...normalized].length < 20) fail(`${label} must be at least 20 characters.`);
  return normalized;
}

function parseMetadata(section, source, policy) {
  const matches = [...section.raw.matchAll(/<!--\s*loop-log:\s*(\{[\s\S]*?\})\s*-->/g)];
  if (matches.length > 1) fail(`${source.path}:${section.line} must contain at most one loop-log metadata comment.`);
  if (matches.length === 0) return null;
  let raw;
  try { raw = JSON.parse(matches[0][1]); }
  catch (error) { fail(`${source.path}:${section.line} loop-log metadata is not valid JSON: ${error.message}`); }
  requireObject(raw, `${source.path}:${section.line} loop-log metadata`);
  const id = requireIdentifier(raw.id, `${source.path}:${section.line} loop-log.id`);
  const kind = requireString(raw.kind, `${source.path}:${section.line} loop-log.kind`);
  if (kind !== source.kind) fail(`${source.path}:${section.line} loop-log.kind must be ${source.kind}.`);
  if (requireString(raw.action, `${source.path}:${section.line} loop-log.action`) !== "strengthen") fail(`${source.path}:${section.line} loop-log.action must be strengthen.`);
  const failureClass = requireIdentifier(raw.failureClass, `${source.path}:${section.line} loop-log.failureClass`);
  const sourceRecurrenceKey = requireIdentifier(raw.recurrenceKey, `${source.path}:${section.line} loop-log.recurrenceKey`);
  const resolution = resolveStoredRecurrenceKey(policy, sourceRecurrenceKey);
  const promotability = raw.promotability === undefined ? "promotable" : requireString(raw.promotability, `${source.path}:${section.line} loop-log.promotability`);
  if (!["promotable", "non-promotable"].includes(promotability)) fail(`${source.path}:${section.line} loop-log.promotability must be promotable or non-promotable.`);
  const base = {
    id,
    kind,
    failureClass,
    sourceRecurrenceKey,
    recurrenceKey: resolution?.canonicalRecurrenceKey ?? null,
    aliasApplied: resolution?.aliasApplied ?? false,
    action: "strengthen",
    promotability,
  };
  if (promotability === "non-promotable") {
    if (raw.ruleTargets !== undefined || raw.verifierTargets !== undefined) fail(`${source.path}:${section.line} non-promotable loop-log must not assign ruleTargets or verifierTargets.`);
    return { ...base, nonPromotableReason: requireNonPromotableReason(raw.nonPromotableReason, `${source.path}:${section.line} loop-log.nonPromotableReason`) };
  }
  const ruleTargets = normalizeUniqueStringArray(raw.ruleTargets, `${source.path}:${section.line} loop-log.ruleTargets`)
    .map((path, index) => normalizeRepoPath(path, `${source.path}:${section.line} loop-log.ruleTargets[${index}]`, { mustExist: true }));
  const verifierTargets = normalizeUniqueStringArray(raw.verifierTargets, `${source.path}:${section.line} loop-log.verifierTargets`)
    .map((path, index) => normalizeRepoPath(path, `${source.path}:${section.line} loop-log.verifierTargets[${index}]`, { mustExist: true }));
  assertAllowedTargets(ruleTargets, verifierTargets, policy, `${source.path}:${section.line}`);
  return { ...base, ruleTargets, verifierTargets };
}

function scanSourceLog(source, policy) {
  const absolutePath = toRepoPath(source.path, `Source log ${source.path}`).absolutePath;
  const text = readText(absolutePath, `Source log ${source.path}`);
  const markerIndex = text.indexOf(policy.schemaMarker);
  if (markerIndex < 0) fail(`Source log ${source.path} is missing schema marker: ${policy.schemaMarker}`);
  if (text.indexOf(policy.schemaMarker, markerIndex + policy.schemaMarker.length) >= 0) fail(`Source log ${source.path} contains the schema marker more than once.`);
  const records = [];
  const nonPromotable = [];
  const unclassified = [];
  const unassignedLegacy = [];
  for (const section of markdownSections(text)) {
    const metadata = parseMetadata(section, source, policy);
    const isNewEntry = section.start < markerIndex;
    if (!metadata) {
      if (isNewEntry) unclassified.push({ path: source.path, kind: source.kind, heading: section.heading, line: section.line, sha256: sha256(section.raw), reason: "missing-loop-log-metadata" });
      continue;
    }
    const sourceEvidence = { path: source.path, heading: section.heading, line: section.line, sha256: sha256(section.raw) };
    if (metadata.recurrenceKey === null) {
      // Historical markers are append-only. They are reported, excluded from
      // aggregation, and do not turn a pre-v4 key into a new unclassified log.
      unassignedLegacy.push({
        id: metadata.id,
        kind: metadata.kind,
        failureClass: metadata.failureClass,
        sourceRecurrenceKey: metadata.sourceRecurrenceKey,
        promotability: metadata.promotability,
        source: sourceEvidence,
      });
      continue;
    }
    if (metadata.promotability === "non-promotable") {
      nonPromotable.push({
        id: metadata.id,
        kind: metadata.kind,
        failureClass: metadata.failureClass,
        sourceRecurrenceKey: metadata.sourceRecurrenceKey,
        recurrenceKey: metadata.recurrenceKey,
        aliasApplied: metadata.aliasApplied,
        reason: metadata.nonPromotableReason,
        source: sourceEvidence,
      });
      continue;
    }
    records.push({ ...metadata, source: sourceEvidence });
  }
  return { records, nonPromotable, unclassified, unassignedLegacy };
}
function scanAllSourceLogs(policy) {
  const records = [];
  const nonPromotable = [];
  const unclassified = [];
  const unassignedLegacy = [];
  for (const source of policy.sourceLogs) {
    const result = scanSourceLog(source, policy);
    records.push(...result.records);
    nonPromotable.push(...result.nonPromotable);
    unclassified.push(...result.unclassified);
    unassignedLegacy.push(...result.unassignedLegacy);
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  nonPromotable.sort((a, b) => a.id.localeCompare(b.id));
  unassignedLegacy.sort((a, b) => a.id.localeCompare(b.id));
  const allIds = [...records, ...nonPromotable, ...unassignedLegacy].map((record) => record.id);
  if (new Set(allIds).size !== allIds.length) fail("loop-log ids must be globally unique across all source logs.");
  return { records, nonPromotable, unclassified, unassignedLegacy };
}

function proposalMarkdown(proposal) {
  const lines = [
    `# ${proposal.id}`,
    "",
    "## Status",
    "",
    `- ${proposal.status}`,
    "",
    "## Recurrence evidence",
    "",
    `- recurrence family: ${proposal.recurrence.key}`,
    `- source failure classes: ${proposal.recurrence.sourceFailureClasses.join(", ")}`,
    `- evidence count: ${proposal.recurrence.evidence.length} / threshold ${proposal.recurrence.threshold}`,
    ...proposal.recurrence.evidence.map((evidence) => `- ${evidence.id}: ${evidence.source.path}:${evidence.source.line} (${evidence.source.sha256})`),
    "",
    "## Required change",
    "",
    "- Strengthen the listed rule only; do not weaken validation, human gates, allowlists, stop conditions, budgets, or network policy.",
    ...proposal.requiredChange.ruleTargets.map((target) => `- Rule target: ${target}`),
    ...proposal.requiredChange.verifierTargets.map((target) => `- Verifier target: ${target}`),
    "- Add a negative E2E that reproduces the failure class before promotion.",
    "",
    "## Promotion gate",
    "",
    "- Independent reviewer must record PASS for evidence, non-weakening, target scope, and negative E2E.",
    "- Owner approval is required before a canonical rule or verifier is changed.",
    `- Loop Engineering review target: ${proposal.review.loopEngineeringSpec}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}
function buildProposal(group, policy) {
  const evidence = [...group.records].sort((a, b) => a.id.localeCompare(b.id));
  const proposalEvidence = evidence.map((record) => ({ ...record, source: { path: record.source.path, heading: record.source.heading, line: record.source.line, sha256: record.source.sha256 } }));
  const ruleTargets = [...new Set(evidence.flatMap((record) => record.ruleTargets))].sort();
  const verifierTargets = [...new Set(evidence.flatMap((record) => record.verifierTargets))].sort();
  const sourceFailureClasses = [...group.sourceFailureClasses].sort();
  const signature = sha256(JSON.stringify({
    policyVersion: policy.version,
    proposalSchemaVersion: 1,
    promotionPlanRequired: true,
    recurrenceFamily: group.key,
    sourceFailureClasses,
    evidence: proposalEvidence.map((record) => ({ id: record.id, failureClass: record.failureClass, sourceRecurrenceKey: record.sourceRecurrenceKey, source: record.source })),
    ruleTargets,
    verifierTargets,
  })).slice(0, 16);
  return {
    version: 1,
    id: `figma-log-${group.key}-${signature}`,
    status: "pending-review",
    generatedBy: "figma-log-promote.mjs",
    recurrence: {
      key: group.key,
      // v1 compatibility field: v4 candidates make the family explicit here.
      failureClass: group.key,
      sourceFailureClasses,
      threshold: policy.recurrenceThreshold,
      evidence: proposalEvidence,
    },
    requiredChange: { action: "strengthen", ruleTargets, verifierTargets, negativeE2ERequired: true },
    review: {
      loopEngineeringSpec: policy.review.loopEngineeringSpec,
      requiresIndependentReview: true,
      requiresOwnerApproval: true,
      applyAllowed: false,
      promotionPlanRequired: true,
    },
  };
}

function normalizeEvidenceForFingerprint(evidence, label) {
  if (!Array.isArray(evidence) || evidence.length === 0) fail(`${label} must be a non-empty array.`);
  const normalized = evidence.map((record, index) => {
    const item = requireObject(record, `${label}[${index}]`);
    const source = requireObject(item.source, `${label}[${index}].source`);
    const ruleTargets = item.ruleTargets === undefined ? [] : normalizeUniqueStringArray(item.ruleTargets, `${label}[${index}].ruleTargets`).sort();
    const verifierTargets = item.verifierTargets === undefined ? [] : normalizeUniqueStringArray(item.verifierTargets, `${label}[${index}].verifierTargets`).sort();
    return {
      id: requireIdentifier(item.id, `${label}[${index}].id`),
      failureClass: requireIdentifier(item.failureClass, `${label}[${index}].failureClass`),
      sourceRecurrenceKey: requireIdentifier(item.sourceRecurrenceKey ?? item.recurrenceKey, `${label}[${index}].recurrenceKey`),
      ruleTargets,
      verifierTargets,
      source: {
        path: normalizeRepoPath(source.path, `${label}[${index}].source.path`, { mustExist: true }),
        heading: requireString(source.heading, `${label}[${index}].source.heading`),
        sha256: requireSha256(source.sha256, `${label}[${index}].source.sha256`),
      },
    };
  });
  if (new Set(normalized.map((record) => record.id)).size !== normalized.length) fail(`${label} ids must be unique.`);
  return normalized.sort((a, b) => a.id.localeCompare(b.id));
}
function closureFingerprint(policy, recurrenceKey, evidence, ruleTargets, verifierTargets) {
  const resolution = resolveStoredRecurrenceKey(policy, recurrenceKey);
  if (!resolution) return null;
  const normalizedEvidence = normalizeEvidenceForFingerprint(evidence, "Closure equivalence evidence");
  const sourceFailureClasses = [...new Set(normalizedEvidence.map((item) => item.failureClass))].sort();
  return sha256(JSON.stringify({
    canonicalRecurrenceKey: resolution.canonicalRecurrenceKey,
    sourceFailureClasses,
    evidence: normalizedEvidence,
    ruleTargets: [...ruleTargets].sort(),
    verifierTargets: [...verifierTargets].sort(),
  }));
}
function loadClosedEquivalentProposals(policy, recurrenceIndex) {
  const byFingerprint = new Map();
  for (const [indexKey, rawEntry] of Object.entries(recurrenceIndex)) {
    const entry = requireObject(rawEntry, `Log proposal current index recurrenceKeys.${indexKey}`);
    const closed = entry.closed === undefined ? [] : entry.closed;
    if (!Array.isArray(closed)) fail(`Log proposal current index recurrenceKeys.${indexKey}.closed must be an array.`);
    for (const rawClosed of closed) {
      const closedEntry = requireObject(rawClosed, `Log proposal current index recurrenceKeys.${indexKey}.closed entry`);
      const proposalId = requireIdentifier(closedEntry.proposalId, "Closed proposal id");
      const proposalPath = normalizeRepoPath(closedEntry.proposalPath, "Closed proposal path", { mustExist: true });
      const expectedSha256 = requireSha256(closedEntry.proposalSha256, "Closed proposal SHA-256");
      const proposalText = readText(resolve(repoRoot, proposalPath), "Closed proposal");
      if (sha256(proposalText) !== expectedSha256) fail(`Closed proposal SHA-256 mismatch: ${proposalPath}`);
      const proposal = validateProposal(JSON.parse(proposalText), policy);
      if (proposal.id !== proposalId) fail(`Closed proposal id does not match immutable proposal: ${proposalPath}`);
      const fingerprint = closureFingerprint(policy, proposal.recurrenceKey, proposal.evidence, proposal.requiredChange.ruleTargets, proposal.requiredChange.verifierTargets);
      if (!fingerprint) continue;
      const items = byFingerprint.get(fingerprint) || [];
      items.push({ proposalId, indexKey, proposalPath, proposalSha256: expectedSha256 });
      byFingerprint.set(fingerprint, items);
    }
  }
  return byFingerprint;
}

function scan(policyPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policyText = readText(policyPath.absolutePath, "Log promotion policy");
  const policy = validatePolicy(JSON.parse(policyText));
  const all = scanAllSourceLogs(policy);
  const { records, nonPromotable, unclassified, unassignedLegacy } = all;
  const currentIndexPath = resolve(outputPath.absolutePath, "proposals", "current.json");
  const previousIndex = existsSync(currentIndexPath) ? JSON.parse(readText(currentIndexPath, "Log proposal current index")) : { recurrenceKeys: {} };
  const recurrenceIndex = { ...(previousIndex.recurrenceKeys || {}) };
  const closedEquivalent = loadClosedEquivalentProposals(policy, recurrenceIndex);
  const closedProposalState = Object.entries(recurrenceIndex)
    .flatMap(([recurrenceKey, entry]) => (entry.closed || []).map((item) => ({ recurrenceKey, closureId: item.closureId, proposalId: item.proposalId, proposalSha256: item.proposalSha256 })))
    .sort((a, b) => `${a.recurrenceKey}:${a.proposalId}`.localeCompare(`${b.recurrenceKey}:${b.proposalId}`));
  const intakeIdentity = {
    promotionOutputVersion: 4,
    policySha256: sha256(policyText),
    records: records.map((record) => ({ id: record.id, source: record.source })),
    nonPromotable,
    unclassified,
    unassignedLegacy,
    closedProposalState,
  };
  const intakeId = `figma-log-intake-${sha256(JSON.stringify(intakeIdentity)).slice(0, 16)}`;
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.recurrenceKey) || { key: record.recurrenceKey, sourceFailureClasses: new Set(), records: [] };
    group.sourceFailureClasses.add(record.failureClass);
    group.records.push(record);
    groups.set(record.recurrenceKey, group);
  }
  const proposals = [];
  const closedProposalIds = [];
  if (unclassified.length === 0) {
    for (const group of [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      if (group.records.length < policy.recurrenceThreshold) continue;
      const proposal = buildProposal(group, policy);
      const fingerprint = closureFingerprint(policy, proposal.recurrence.key, proposal.recurrence.evidence, proposal.requiredChange.ruleTargets, proposal.requiredChange.verifierTargets);
      const closed = fingerprint ? closedEquivalent.get(fingerprint) || [] : [];
      if (closed.length > 0) {
        closedProposalIds.push(...closed.map((entry) => entry.proposalId));
        continue;
      }
      proposals.push(proposal);
    }
  }
  const status = unclassified.length > 0 ? "waiting-human" : proposals.length > 0 ? "pending-review" : "no-recurring-failure";
  const intakePath = resolve(outputPath.absolutePath, "intake", `${intakeId}.json`);
  const intake = {
    version: 1,
    id: intakeId,
    status,
    policyPath: policyPath.relativePath,
    policySha256: intakeIdentity.policySha256,
    records: intakeIdentity.records,
    nonPromotable,
    unclassified,
    unassignedLegacy,
    proposalIds: proposals.map((proposal) => proposal.id),
    closedProposalIds: [...new Set(closedProposalIds)].sort(),
  };
  writeImmutableJson(intakePath, intake, "Log intake");
  const proposalPaths = [];
  for (const proposal of proposals) {
    const jsonPath = resolve(outputPath.absolutePath, "proposals", `${proposal.id}.json`);
    const markdownPath = resolve(outputPath.absolutePath, "proposals", `${proposal.id}.md`);
    writeImmutableJson(jsonPath, proposal, `Log proposal ${proposal.id}`);
    writeImmutableText(markdownPath, proposalMarkdown(proposal), `Log proposal ${proposal.id} markdown`);
    proposalPaths.push(relative(repoRoot, jsonPath).replace(/\\/g, "/"));
  }
  const report = {
    version: 1,
    id: `${intakeId}-report`,
    status,
    intakePath: relative(repoRoot, intakePath).replace(/\\/g, "/"),
    recordCount: records.length,
    nonPromotableCount: nonPromotable.length,
    nonPromotable,
    unclassifiedCount: unclassified.length,
    unassignedLegacyCount: unassignedLegacy.length,
    unassignedLegacy,
    proposalPaths,
    closedProposalIds: intake.closedProposalIds,
    promotionRule: "Canonical rules and verifier code remain unchanged until independent review, negative E2E, and owner approval are recorded.",
  };
  const reportPath = resolve(outputPath.absolutePath, "reports", `${intakeId}.json`);
  writeImmutableJson(reportPath, report, "Log promotion report");
  writeJson(resolve(outputPath.absolutePath, "latest.json"), {
    version: 1,
    status,
    intakePath: report.intakePath,
    reportPath: relative(repoRoot, reportPath).replace(/\\/g, "/"),
    proposalPaths,
    nonPromotableCount: nonPromotable.length,
    unclassifiedCount: unclassified.length,
    unassignedLegacyCount: unassignedLegacy.length,
    closedProposalIds: intake.closedProposalIds,
  });
  for (const proposal of proposals) {
    const key = proposal.recurrence.key;
    const previous = recurrenceIndex[key] || { current: null, superseded: [], closed: [] };
    const superseded = [...new Set([...(previous.superseded || []), ...(previous.current && previous.current !== proposal.id ? [previous.current] : [])])].sort();
    const closed = Array.isArray(previous.closed) ? previous.closed : [];
    recurrenceIndex[key] = { current: proposal.id, superseded, ...(closed.length > 0 ? { closed } : {}) };
  }
  writeJson(currentIndexPath, {
    version: 1,
    updatedAt: new Date().toISOString(),
    note: "Mutable index. Proposal files stay immutable; this records the current proposal, superseded proposals, and completed-outside-promotion closures per recurrence key.",
    recurrenceKeys: recurrenceIndex,
  });
  console.log(`PASS ${status}: ${records.length} promotable record(s), ${nonPromotable.length} non-promotable record(s), ${unassignedLegacy.length} unassigned legacy record(s), ${unclassified.length} unclassified new record(s), ${proposals.length} proposal(s).`);
}

function requireSha256(value, label) {
  const normalized = requireString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) fail(`${label} must be a SHA-256 hex digest.`);
  return normalized;
}
function assertNoProjectFacts(value, label) {
  const normalized = requireString(value, label);
  if (/\r|\n/.test(normalized)) fail(`${label} must be one line.`);
  if (/(?:https?:\/\/|(?:[A-Za-z]:[\\/])|node-id|figma\.com|localhost|wp-content)/i.test(normalized)) fail(`${label} must not contain project-specific URLs, paths, node ids, or asset references.`);
  return normalized;
}
function sourceForKind(policy, kind) {
  const source = policy.sourceLogs.find((item) => item.kind === kind);
  if (!source) fail(`Log promotion policy has no source log for kind: ${kind}`);
  return source;
}
function validateRecordEntry(raw, policy) {
  requireObject(raw, "Log record");
  if (raw.version !== 1) fail("Log record.version must be 1.");
  const kind = requireString(raw.kind, "Log record.kind");
  if (!["correction", "mistake"].includes(kind)) fail("Log record.kind must be correction or mistake.");
  const occurredOn = requireString(raw.occurredOn, "Log record.occurredOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) fail("Log record.occurredOn must use YYYY-MM-DD.");
  const promotability = raw.promotability === undefined ? "promotable" : requireString(raw.promotability, "Log record.promotability");
  if (!["promotable", "non-promotable"].includes(promotability)) fail("Log record.promotability must be promotable or non-promotable.");
  const recurrenceKey = requireNewRecordRecurrenceKey(policy, raw.recurrenceKey, "Log record.recurrenceKey");
  const base = {
    version: 1,
    id: requireIdentifier(raw.id, "Log record.id"),
    kind,
    occurredOn,
    failureClass: requireIdentifier(raw.failureClass, "Log record.failureClass"),
    recurrenceKey,
    promotability,
    summary: assertNoProjectFacts(raw.summary, "Log record.summary"),
    prevention: assertNoProjectFacts(raw.prevention, "Log record.prevention"),
  };
  if (promotability === "non-promotable") {
    if (raw.ruleTargets !== undefined || raw.verifierTargets !== undefined) fail("Log record non-promotable entries must not assign ruleTargets or verifierTargets.");
    return { ...base, nonPromotableReason: requireNonPromotableReason(raw.nonPromotableReason, "Log record.nonPromotableReason") };
  }
  const ruleTargets = normalizeUniqueStringArray(raw.ruleTargets, "Log record.ruleTargets").map((path, index) => normalizeRepoPath(path, `Log record.ruleTargets[${index}]`, { mustExist: true }));
  const verifierTargets = normalizeUniqueStringArray(raw.verifierTargets, "Log record.verifierTargets").map((path, index) => normalizeRepoPath(path, `Log record.verifierTargets[${index}]`, { mustExist: true }));
  assertAllowedTargets(ruleTargets, verifierTargets, policy, "Log record");
  return { ...base, ruleTargets, verifierTargets };
}
function findSingleMarker(text, marker, label) {
  const index = text.indexOf(marker);
  if (index < 0) fail(`${label} is missing schema marker: ${marker}`);
  if (text.indexOf(marker, index + marker.length) >= 0) fail(`${label} contains the schema marker more than once.`);
  return index;
}
function record(policyPathArg, entryPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const entryPath = toRepoPath(entryPathArg, "Log record path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const entry = validateRecordEntry(readJson(entryPath.absolutePath, "Log record"), policy);
  const existing = scanAllSourceLogs(policy);
  if ([...existing.records, ...existing.nonPromotable, ...existing.unassignedLegacy].some((item) => item.id === entry.id)) fail(`Log record.id already exists: ${entry.id}`);
  const source = sourceForKind(policy, entry.kind);
  const sourcePath = toRepoPath(source.path, `Source log ${source.path}`);
  const sourceText = readText(sourcePath.absolutePath, `Source log ${source.path}`);
  const markerIndex = findSingleMarker(sourceText, policy.schemaMarker, `Source log ${source.path}`);
  const metadata = {
    id: entry.id,
    kind: entry.kind,
    failureClass: entry.failureClass,
    recurrenceKey: entry.recurrenceKey,
    action: "strengthen",
    promotability: entry.promotability,
    ...(entry.promotability === "non-promotable" ? { nonPromotableReason: entry.nonPromotableReason } : { ruleTargets: entry.ruleTargets, verifierTargets: entry.verifierTargets }),
  };
  const block = [`## ${entry.occurredOn}: ${entry.failureClass}`, `<!-- loop-log: ${JSON.stringify(metadata)} -->`, `- 指摘：${entry.summary}`, `- 今後：${entry.prevention}`].join("\n");
  const nextText = `${sourceText.slice(0, markerIndex).replace(/\s*$/, "")}\n\n${block}\n\n${sourceText.slice(markerIndex)}`;
  writeFileSync(sourcePath.absolutePath, nextText, "utf8");
  try { scan(policyPath.relativePath, outputPath.relativePath); }
  catch (error) { writeFileSync(sourcePath.absolutePath, sourceText, "utf8"); throw error; }
  console.log(`PASS record: ${entry.id}`);
}

function validateProposal(raw, policy) {
  requireObject(raw, "Log promotion proposal");
  if (raw.version !== 1) fail("Log promotion proposal.version must be 1.");
  if (requireString(raw.status, "Log promotion proposal.status") !== "pending-review") fail("Log promotion proposal.status must be pending-review.");
  const recurrence = requireObject(raw.recurrence, "Log promotion proposal.recurrence");
  const requiredChange = requireObject(raw.requiredChange, "Log promotion proposal.requiredChange");
  if (requireString(requiredChange.action, "Log promotion proposal.requiredChange.action") !== "strengthen") fail("Log promotion proposal.requiredChange.action must be strengthen.");
  if (requiredChange.negativeE2ERequired !== true) fail("Log promotion proposal requires a negative E2E.");
  const ruleTargets = normalizeUniqueStringArray(requiredChange.ruleTargets, "Log promotion proposal.requiredChange.ruleTargets").map((path, index) => normalizeRepoPath(path, `Log promotion proposal.requiredChange.ruleTargets[${index}]`, { mustExist: true }));
  const verifierTargets = normalizeUniqueStringArray(requiredChange.verifierTargets, "Log promotion proposal.requiredChange.verifierTargets").map((path, index) => normalizeRepoPath(path, `Log promotion proposal.requiredChange.verifierTargets[${index}]`, { mustExist: true }));
  assertAllowedTargets(ruleTargets, verifierTargets, policy, "Log promotion proposal");
  const recurrenceKey = requireIdentifier(recurrence.key, "Log promotion proposal.recurrence.key");
  const failureClass = requireIdentifier(recurrence.failureClass, "Log promotion proposal.recurrence.failureClass");
  const sourceFailureClasses = recurrence.sourceFailureClasses === undefined ? [failureClass] : normalizeIdentifierArray(recurrence.sourceFailureClasses, "Log promotion proposal.recurrence.sourceFailureClasses");
  const evidence = normalizeEvidenceForFingerprint(recurrence.evidence, "Log promotion proposal.recurrence.evidence");
  if (evidence.length < policy.recurrenceThreshold) fail("Log promotion proposal.recurrence.evidence does not meet the threshold.");
  return {
    version: 1,
    id: requireIdentifier(raw.id, "Log promotion proposal.id"),
    recurrenceKey,
    canonicalRecurrenceKey: resolveStoredRecurrenceKey(policy, recurrenceKey)?.canonicalRecurrenceKey ?? null,
    failureClass,
    sourceFailureClasses,
    threshold: requirePositiveInteger(recurrence.threshold, "Log promotion proposal.recurrence.threshold", 2),
    evidence,
    requiredChange: { ruleTargets, verifierTargets },
  };
}
function readProposal(policy, proposalPathArg) {
  const proposalPath = toRepoPath(proposalPathArg, "Proposal path");
  const proposalText = readText(proposalPath.absolutePath, "Log promotion proposal");
  const proposal = validateProposal(JSON.parse(proposalText), policy);
  const currentIndexPath = resolve(dirname(proposalPath.absolutePath), "current.json");
  if (existsSync(currentIndexPath)) {
    const index = JSON.parse(readText(currentIndexPath, "Log proposal current index"));
    const entry = (index.recurrenceKeys || {})[proposal.recurrenceKey];
    if (entry && entry.current !== proposal.id) {
      const closed = (entry.closed || []).find((item) => item.proposalId === proposal.id);
      if (closed) fail(`Proposal is closed outside promotion for recurrence key ${proposal.recurrenceKey}: ${proposal.id}.`);
      fail(`Proposal is not current for recurrence key ${proposal.recurrenceKey}: ${proposal.id}. Current proposal is ${entry.current || "none"}.`);
    }
  }
  const currentRecords = new Map(scanAllSourceLogs(policy).records.map((record) => [record.id, record]));
  for (const evidence of proposal.evidence) {
    const current = currentRecords.get(evidence.id);
    if (!current) fail(`Proposal evidence is no longer present in the source logs: ${evidence.id}`);
    if (current.source.sha256 !== evidence.source.sha256 || current.source.path !== evidence.source.path || current.source.heading !== evidence.source.heading) fail(`Proposal evidence changed after generation: ${evidence.id}`);
  }
  return { path: proposalPath, text: proposalText, sha256: sha256(proposalText), proposal };
}

function requirePass(value, label) { if (requireString(value, label) !== "PASS") fail(`${label} must be PASS.`); }
function normalizeActor(raw, label) {
  const actor = requireObject(raw, label);
  return { actor: requireIdentifier(actor.actor, `${label}.actor`), contextId: requireIdentifier(actor.contextId, `${label}.contextId`) };
}
function executeNode(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed with exit ${result.status}: ${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`);
  return { stdoutSha256: sha256(`${result.stdout ?? ""}\n${result.stderr ?? ""}`) };
}
function validateReview(raw, policy, proposalInfo) {
  requireObject(raw, "Promotion review");
  if (raw.version !== 1) fail("Promotion review.version must be 1.");
  if (requireIdentifier(raw.proposalId, "Promotion review.proposalId") !== proposalInfo.proposal.id) fail("Promotion review.proposalId does not match the proposal.");
  if (normalizeRepoPath(raw.proposalPath, "Promotion review.proposalPath", { mustExist: true }) !== proposalInfo.path.relativePath) fail("Promotion review.proposalPath does not match the proposal path.");
  if (requireSha256(raw.proposalSha256, "Promotion review.proposalSha256") !== proposalInfo.sha256) fail("Promotion review.proposalSha256 does not match the proposal.");
  const implementation = normalizeActor(raw.implementation, "Promotion review.implementation");
  const reviewer = normalizeActor(raw.reviewer, "Promotion review.reviewer");
  if (implementation.actor === reviewer.actor && implementation.contextId === reviewer.contextId) fail("Promotion review must use an independent reviewer actor or context.");
  const checks = requireObject(raw.checks, "Promotion review.checks");
  for (const key of ["evidenceIntegrity", "recurrenceThreshold", "projectFactsExcluded", "strengthensOnly", "guardrailsUnchanged"]) requirePass(checks[key], `Promotion review.checks.${key}`);
  const negativeE2E = requireObject(raw.negativeE2E, "Promotion review.negativeE2E");
  const negativePath = normalizeRepoPath(negativeE2E.path, "Promotion review.negativeE2E.path", { mustExist: true });
  if (!negativePath.endsWith(".e2e.mjs") || !proposalInfo.proposal.requiredChange.verifierTargets.includes(negativePath)) fail("Promotion review.negativeE2E.path must be an approved verifier target in the proposal.");
  if (requireSha256(negativeE2E.sha256, "Promotion review.negativeE2E.sha256") !== sha256File(resolve(repoRoot, negativePath), "Promotion negative E2E")) fail("Promotion review.negativeE2E.sha256 does not match the current test file.");
  requirePass(negativeE2E.result, "Promotion review.negativeE2E.result");
  const ownerApproval = requireObject(raw.ownerApproval, "Promotion review.ownerApproval");
  const status = requireString(ownerApproval.status, "Promotion review.ownerApproval.status");
  if (!["pending", "approved"].includes(status)) fail("Promotion review.ownerApproval.status must be pending or approved.");
  return { implementation, reviewer, negativeE2E: { path: negativePath, sha256: sha256File(resolve(repoRoot, negativePath), "Promotion negative E2E") }, ownerApproval: { status, owner: requireIdentifier(ownerApproval.owner, "Promotion review.ownerApproval.owner"), approvedAt: status === "approved" ? requireString(ownerApproval.approvedAt, "Promotion review.ownerApproval.approvedAt") : null } };
}
function reviewPromotion(policyPathArg, proposalPathArg, reviewPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const proposalInfo = readProposal(policy, proposalPathArg);
  const reviewPath = toRepoPath(reviewPathArg, "Promotion review path");
  const reviewText = readText(reviewPath.absolutePath, "Promotion review");
  const review = validateReview(JSON.parse(reviewText), policy, proposalInfo);
  const e2e = executeNode([resolve(repoRoot, review.negativeE2E.path)], "Promotion negative E2E");
  const status = review.ownerApproval.status === "approved" ? "ready-to-apply" : "waiting-owner";
  const receipt = { version: 1, id: `promotion-review-${proposalInfo.proposal.id}-${sha256(reviewText).slice(0, 16)}`, status, proposal: { id: proposalInfo.proposal.id, path: proposalInfo.path.relativePath, sha256: proposalInfo.sha256 }, review: { path: reviewPath.relativePath, sha256: sha256(reviewText), implementation: review.implementation, reviewer: review.reviewer }, negativeE2E: { path: review.negativeE2E.path, sha256: review.negativeE2E.sha256, execution: e2e }, ownerApproval: review.ownerApproval, generatedAt: new Date().toISOString() };
  const receiptPath = resolve(outputPath.absolutePath, "reviews", `${receipt.id}.json`);
  writeImmutableJson(receiptPath, receipt, "Promotion review receipt");
  writeJson(resolve(outputPath.absolutePath, "latest-review.json"), { version: 1, status, receiptPath: relative(repoRoot, receiptPath).replace(/\\/g, "/") });
  console.log(`PASS review ${status}: ${receipt.id}`);
}

function validatePromotionPlan(raw, proposalInfo, receiptInfo) {
  requireObject(raw, "Promotion plan");
  if (raw.version !== 1) fail("Promotion plan.version must be 1.");
  if (requireIdentifier(raw.proposalId, "Promotion plan.proposalId") !== proposalInfo.proposal.id) fail("Promotion plan.proposalId does not match the proposal.");
  if (normalizeRepoPath(raw.proposalPath, "Promotion plan.proposalPath", { mustExist: true }) !== proposalInfo.path.relativePath) fail("Promotion plan.proposalPath does not match the proposal path.");
  if (requireSha256(raw.proposalSha256, "Promotion plan.proposalSha256") !== proposalInfo.sha256) fail("Promotion plan.proposalSha256 does not match the proposal.");
  if (normalizeRepoPath(raw.reviewReceiptPath, "Promotion plan.reviewReceiptPath", { mustExist: true }) !== receiptInfo.path.relativePath) fail("Promotion plan.reviewReceiptPath does not match the review receipt.");
  if (requireSha256(raw.reviewReceiptSha256, "Promotion plan.reviewReceiptSha256") !== receiptInfo.sha256) fail("Promotion plan.reviewReceiptSha256 does not match the review receipt.");
  if (!Array.isArray(raw.patches) || raw.patches.length === 0) fail("Promotion plan.patches must be a non-empty array.");
  const allowedTargets = new Set([...proposalInfo.proposal.requiredChange.ruleTargets, ...proposalInfo.proposal.requiredChange.verifierTargets]);
  const patches = raw.patches.map((rawPatch, index) => {
    const patch = requireObject(rawPatch, `Promotion plan.patches[${index}]`);
    const path = normalizeRepoPath(patch.path, `Promotion plan.patches[${index}].path`, { mustExist: true });
    if (!allowedTargets.has(path)) fail(`Promotion plan patch targets a path not approved by the proposal: ${path}`);
    const find = typeof patch.find === "string" && patch.find !== "" ? patch.find : fail(`Promotion plan.patches[${index}].find must be a non-empty string.`);
    const replace = typeof patch.replace === "string" && patch.replace !== "" ? patch.replace : fail(`Promotion plan.patches[${index}].replace must be a non-empty string.`);
    if (find === replace) fail(`Promotion plan.patches[${index}] does not change its target.`);
    return { path, expectedSha256: requireSha256(patch.expectedSha256, `Promotion plan.patches[${index}].expectedSha256`), find, replace };
  });
  if (new Set(patches.map((patch) => patch.path)).size !== patches.length) fail("Promotion plan may patch each target path only once.");
  return { id: requireIdentifier(raw.id, "Promotion plan.id"), patches };
}
function applyPromotion(policyPathArg, proposalPathArg, receiptPathArg, planPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const proposalInfo = readProposal(policy, proposalPathArg);
  const receiptPath = toRepoPath(receiptPathArg, "Promotion review receipt path");
  const receiptText = readText(receiptPath.absolutePath, "Promotion review receipt");
  const receipt = requireObject(JSON.parse(receiptText), "Promotion review receipt");
  if (receipt.version !== 1 || requireString(receipt.status, "Promotion review receipt.status") !== "ready-to-apply") fail("Promotion review receipt must be ready-to-apply.");
  if (requireIdentifier(receipt.proposal.id, "Promotion review receipt.proposal.id") !== proposalInfo.proposal.id || requireSha256(receipt.proposal.sha256, "Promotion review receipt.proposal.sha256") !== proposalInfo.sha256) fail("Promotion review receipt does not match the proposal.");
  const receiptNegativePath = normalizeRepoPath(receipt.negativeE2E.path, "Promotion review receipt.negativeE2E.path", { mustExist: true });
  if (!proposalInfo.proposal.requiredChange.verifierTargets.includes(receiptNegativePath)) fail("Promotion review receipt negative E2E is not approved by the proposal.");
  if (requireSha256(receipt.negativeE2E.sha256, "Promotion review receipt.negativeE2E.sha256") !== sha256File(resolve(repoRoot, receiptNegativePath), "Promotion negative E2E")) fail("Promotion review receipt negative E2E changed after review.");
  const receiptInfo = { path: receiptPath, sha256: sha256(receiptText) };
  const planPath = toRepoPath(planPathArg, "Promotion plan path");
  const planText = readText(planPath.absolutePath, "Promotion plan");
  const plan = validatePromotionPlan(JSON.parse(planText), proposalInfo, receiptInfo);
  const updates = plan.patches.map((patch) => {
    const absolutePath = resolve(repoRoot, patch.path);
    const before = readText(absolutePath, `Promotion target ${patch.path}`);
    if (sha256(before) !== patch.expectedSha256) fail(`Promotion target changed since the plan was authored: ${patch.path}`);
    const matchCount = before.split(patch.find).length - 1;
    if (matchCount !== 1) fail(`Promotion plan find text must occur exactly once in ${patch.path}; found ${matchCount}.`);
    return { ...patch, absolutePath, before, after: before.replace(patch.find, patch.replace) };
  });
  try {
    for (const update of updates) writeFileSync(update.absolutePath, update.after, "utf8");
    for (const update of updates.filter((item) => item.path.endsWith(".mjs"))) executeNode(["--check", update.absolutePath], `Promotion syntax check ${update.path}`);
    const e2e = executeNode([resolve(repoRoot, receiptNegativePath)], "Promotion negative E2E");
    const promotion = { version: 1, id: `promotion-${plan.id}-${sha256(`${proposalInfo.sha256}:${receiptInfo.sha256}:${planText}`).slice(0, 16)}`, status: "promoted", proposal: { id: proposalInfo.proposal.id, path: proposalInfo.path.relativePath, sha256: proposalInfo.sha256 }, reviewReceipt: { path: receiptInfo.path.relativePath, sha256: receiptInfo.sha256 }, plan: { id: plan.id, path: planPath.relativePath, sha256: sha256(planText) }, patches: updates.map((update) => ({ path: update.path, beforeSha256: sha256(update.before), afterSha256: sha256(update.after) })), validation: { negativeE2E: { path: receiptNegativePath, execution: e2e } }, appliedAt: new Date().toISOString() };
    const promotionPath = resolve(outputPath.absolutePath, "promotions", `${promotion.id}.json`);
    writeImmutableJson(promotionPath, promotion, "Promotion receipt");
    writeJson(resolve(outputPath.absolutePath, "latest-promotion.json"), { version: 1, status: "promoted", promotionPath: relative(repoRoot, promotionPath).replace(/\\/g, "/") });
    console.log(`PASS apply: ${promotion.id}`);
  } catch (error) {
    for (const update of updates) writeFileSync(update.absolutePath, update.before, "utf8");
    const message = error instanceof Error ? error.message : String(error);
    fail(`Promotion failed and was rolled back: ${message}`);
  }
}

function validateClosure(raw, proposalInfo) {
  requireObject(raw, "Promotion closure");
  if (raw.version !== 1) fail("Promotion closure.version must be 1.");
  const id = requireIdentifier(raw.id, "Promotion closure.id");
  if (requireIdentifier(raw.proposalId, "Promotion closure.proposalId") !== proposalInfo.proposal.id) fail("Promotion closure.proposalId does not match the proposal.");
  if (normalizeRepoPath(raw.proposalPath, "Promotion closure.proposalPath", { mustExist: true }) !== proposalInfo.path.relativePath) fail("Promotion closure.proposalPath does not match the proposal path.");
  if (requireSha256(raw.proposalSha256, "Promotion closure.proposalSha256") !== proposalInfo.sha256) fail("Promotion closure.proposalSha256 does not match the proposal.");
  if (requireString(raw.disposition, "Promotion closure.disposition") !== "completed-outside-promotion") fail("Promotion closure.disposition must be completed-outside-promotion.");
  const ownerApproval = requireObject(raw.ownerApproval, "Promotion closure.ownerApproval");
  if (requireString(ownerApproval.status, "Promotion closure.ownerApproval.status") !== "approved") fail("Promotion closure.ownerApproval.status must be approved.");
  return { id, disposition: "completed-outside-promotion", reason: requireNonPromotableReason(raw.reason, "Promotion closure.reason"), ownerApproval: { status: "approved", owner: requireIdentifier(ownerApproval.owner, "Promotion closure.ownerApproval.owner"), approvedAt: requireString(ownerApproval.approvedAt, "Promotion closure.ownerApproval.approvedAt") } };
}
function closeProposal(policyPathArg, proposalPathArg, closurePathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const proposalInfo = readProposal(policy, proposalPathArg);
  const closurePath = toRepoPath(closurePathArg, "Promotion closure path");
  const closureText = readText(closurePath.absolutePath, "Promotion closure");
  let rawClosure;
  try { rawClosure = JSON.parse(closureText); }
  catch (error) { fail(`Promotion closure is not valid JSON: ${error.message}`); }
  const closure = validateClosure(rawClosure, proposalInfo);
  const currentIndexPath = resolve(outputPath.absolutePath, "proposals", "current.json");
  if (!existsSync(currentIndexPath)) fail("Log proposal current index does not exist.");
  const index = JSON.parse(readText(currentIndexPath, "Log proposal current index"));
  const recurrenceKeys = { ...(index.recurrenceKeys || {}) };
  const entry = recurrenceKeys[proposalInfo.proposal.recurrenceKey];
  if (!entry || entry.current !== proposalInfo.proposal.id) fail(`Promotion closure requires the current proposal for recurrence key ${proposalInfo.proposal.recurrenceKey}.`);
  const priorClosed = Array.isArray(entry.closed) ? entry.closed : [];
  if (priorClosed.some((item) => item.proposalId === proposalInfo.proposal.id)) fail(`Promotion closure already exists for proposal: ${proposalInfo.proposal.id}`);
  const closedAt = new Date().toISOString();
  const closed = [...priorClosed, { closureId: closure.id, proposalId: proposalInfo.proposal.id, proposalPath: proposalInfo.path.relativePath, proposalSha256: proposalInfo.sha256, disposition: closure.disposition, reason: closure.reason, ownerApproval: closure.ownerApproval, closedAt }];
  recurrenceKeys[proposalInfo.proposal.recurrenceKey] = { current: null, superseded: [...new Set([...(entry.superseded || []), proposalInfo.proposal.id])].sort(), closed };
  writeJson(currentIndexPath, { version: 1, updatedAt: closedAt, note: "Mutable index. Proposal files stay immutable; this records the current proposal, superseded proposals, and completed-outside-promotion closures per recurrence key.", recurrenceKeys });
  const receipt = { version: 1, id: `promotion-closure-${closure.id}-${sha256(closureText).slice(0, 16)}`, status: "completed-outside-promotion", proposal: { id: proposalInfo.proposal.id, path: proposalInfo.path.relativePath, sha256: proposalInfo.sha256 }, closure: { ...closure, path: closurePath.relativePath, sha256: sha256(closureText), closedAt } };
  const receiptPath = resolve(outputPath.absolutePath, "closures", `${receipt.id}.json`);
  writeImmutableJson(receiptPath, receipt, "Promotion closure receipt");
  writeJson(resolve(outputPath.absolutePath, "latest-closure.json"), { version: 1, status: receipt.status, closurePath: relative(repoRoot, receiptPath).replace(/\\/g, "/") });
  console.log(`PASS close ${closure.disposition}: ${proposalInfo.proposal.id}`);
}

function usage() {
  console.error([
    "Usage:",
    "  node figma-log-promote.v4-candidate.mjs record <policy.json> <record.json> <output-dir>",
    "  node figma-log-promote.v4-candidate.mjs scan <policy.json> <output-dir>",
    "  node figma-log-promote.v4-candidate.mjs review <policy.json> <proposal.json> <review.json> <output-dir>",
    "  node figma-log-promote.v4-candidate.mjs apply <policy.json> <proposal.json> <review-receipt.json> <promotion-plan.json> <output-dir>",
    "  node figma-log-promote.v4-candidate.mjs close <policy.json> <proposal.json> <closure.json> <output-dir>",
  ].join("\n"));
}

try {
  if (command === "record" && args.length === 3) record(args[0], args[1], args[2]);
  else if (command === "scan" && args.length === 2) scan(args[0], args[1]);
  else if (command === "review" && args.length === 4) reviewPromotion(args[0], args[1], args[2], args[3]);
  else if (command === "apply" && args.length === 5) applyPromotion(args[0], args[1], args[2], args[3], args[4]);
  else if (command === "close" && args.length === 4) closeProposal(args[0], args[1], args[2], args[3]);
  else { usage(); process.exit(1); }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
