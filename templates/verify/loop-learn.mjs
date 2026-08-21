#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const repoRoot = process.cwd();
const [command, ...args] = process.argv.slice(2);

class LearnError extends Error {}

function fail(message) {
  throw new LearnError(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireFiniteNumber(value, label, { minimum = 0 } = {}) {
  if (!Number.isFinite(value) || value < minimum) fail(`${label} must be a finite number greater than or equal to ${minimum}.`);
  return value;
}

function toRepoPath(value, label) {
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(`${label} must be relative to the repository.`);

  const absolutePath = resolve(repoRoot, input);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) fail(`${label} must stay inside the repository.`);

  return {
    absolutePath,
    relativePath: relativePath.replace(/\\/g, "/"),
  };
}

function normalizeRepoPath(value, label) {
  return toRepoPath(value, label).relativePath;
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} does not exist: ${filePath}`);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, jsonText(value), "utf8");
}

function writeImmutableJson(filePath, value, label) {
  const next = jsonText(value);
  if (existsSync(filePath)) {
    const current = readFileSync(filePath, "utf8");
    if (current !== next) fail(`${label} is immutable and already differs: ${filePath}`);
    return false;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, next, "utf8");
  return true;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeIso(value, label) {
  const input = requireString(value, label);
  if (!Number.isFinite(Date.parse(input))) fail(`${label} must be an ISO date-time.`);
  return new Date(input).toISOString();
}

function normalizeStringArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const normalized = value.map((item, index) => normalizeRepoPath(item, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(`${label} must not contain duplicate paths.`);
  return normalized;
}

function normalizeCountRecord(value, label) {
  requireObject(value, label);
  const record = {};
  for (const [key, count] of Object.entries(value)) {
    record[requireString(key, `${label} key`)] = requireFiniteNumber(count, `${label}.${key}`);
  }
  return record;
}

function normalizeViewportRunRecord(value, label) {
  if (value === null || value === undefined) return null;
  requireObject(value, label);
  const entries = Object.entries(value);
  if (entries.length === 0) return {};
  const allCounts = entries.every(([, count]) => Number.isFinite(count));
  if (allCounts) return { __scope__: normalizeCountRecord(value, label) };
  const allComponents = entries.every(([, counts]) => isPlainObject(counts));
  if (!allComponents) fail(`${label} must contain either viewport counts or component viewport-count records.`);
  return Object.fromEntries(entries.map(([componentId, counts]) => [
    requireString(componentId, `${label} component key`),
    normalizeCountRecord(counts, `${label}.${componentId}`),
  ]));
}

function normalizeCapabilities(value, label) {
  if (value === null || value === undefined) return {};
  requireObject(value, label);
  const capabilities = {};
  for (const [key, capability] of Object.entries(value)) {
    const name = requireString(key, `${label} key`);
    if (!["string", "boolean", "number"].includes(typeof capability)) {
      fail(`${label}.${name} must be a string, boolean, or number.`);
    }
    capabilities[name] = capability;
  }
  return capabilities;
}

function validateEvent(raw) {
  requireObject(raw, "Learning event");
  if (raw.version !== 1) fail("Learning event.version must be 1.");

  const scope = requireObject(raw.scope, "Learning event.scope");
  const metrics = requireObject(raw.metrics, "Learning event.metrics");
  const validation = requireObject(raw.validation, "Learning event.validation");
  const observations = requireObject(raw.observations, "Learning event.observations");
  const w3c = requireObject(validation.w3c, "Learning event.validation.w3c");

  const changedPaths = observations.changedPaths === null || observations.changedPaths === undefined
    ? null
    : normalizeStringArray(observations.changedPaths, "Learning event.observations.changedPaths");
  const w3cStatus = requireString(w3c.status, "Learning event.validation.w3c.status");
  if (!["pass", "fail", "not-recorded", "not-required"].includes(w3cStatus)) {
    fail("Learning event.validation.w3c.status is invalid.");
  }

  return {
    version: 1,
    eventId: requireString(raw.eventId, "Learning event.eventId"),
    generatedAt: normalizeIso(raw.generatedAt, "Learning event.generatedAt"),
    source: requireObject(raw.source, "Learning event.source"),
    catalogVersion: requireString(raw.catalogVersion, "Learning event.catalogVersion"),
    scope: {
      id: requireString(scope.id, "Learning event.scope.id"),
      manifestPath: normalizeRepoPath(scope.manifestPath, "Learning event.scope.manifestPath"),
      targets: normalizeStringArray(scope.targets, "Learning event.scope.targets"),
    },
    metrics: {
      scopeElapsedMs: metrics.scopeElapsedMs === null || metrics.scopeElapsedMs === undefined
        ? null
        : requireFiniteNumber(metrics.scopeElapsedMs, "Learning event.metrics.scopeElapsedMs"),
      directViewportRuns: normalizeViewportRunRecord(metrics.directViewportRuns, "Learning event.metrics.directViewportRuns"),
      finalRecheckViewportRuns: normalizeViewportRunRecord(metrics.finalRecheckViewportRuns, "Learning event.metrics.finalRecheckViewportRuns"),
    },
    validation: {
      layoutStatus: requireString(validation.layoutStatus, "Learning event.validation.layoutStatus"),
      w3c: {
        required: w3c.required === true,
        status: w3cStatus,
      },
    },
    observations: {
      changedPaths,
      capabilities: normalizeCapabilities(observations.capabilities, "Learning event.observations.capabilities"),
    },
  };
}

function validateSafeControl(controlId, raw) {
  const control = requireObject(raw, `Safe control ${controlId}`);
  if (control.effect !== "strengthen") fail(`Safe control ${controlId} must use effect: strengthen.`);
  if (control.scope !== "project-local") fail(`Safe control ${controlId} must use scope: project-local.`);
  for (const prohibitedKey of ["patch", "command", "sourceEdit", "canonicalRuleEdit", "humanGateEdit", "networkEdit"]) {
    if (Object.hasOwn(control, prohibitedKey)) fail(`Safe control ${controlId} must not define ${prohibitedKey}.`);
  }

  const requirements = control.requirements === undefined ? {} : normalizeCapabilities(control.requirements, `Safe control ${controlId}.requirements`);
  const conflictsWith = control.conflictsWith === undefined
    ? []
    : control.conflictsWith.map((item, index) => requireString(item, `Safe control ${controlId}.conflictsWith[${index}]`));
  return {
    controlId,
    effect: control.effect,
    scope: control.scope,
    description: requireString(control.description, `Safe control ${controlId}.description`),
    requirements,
    conflictsWith,
  };
}

function validatePolicy(raw) {
  requireObject(raw, "Learning policy");
  if (raw.version !== 1) fail("Learning policy.version must be 1.");
  const mode = requireString(raw.mode, "Learning policy.mode");
  if (!["proposal", "safe-auto"].includes(mode)) fail("Learning policy.mode must be proposal or safe-auto.");

  const limits = requireObject(raw.limits, "Learning policy.limits");
  const signalsRaw = requireObject(raw.signals, "Learning policy.signals");
  const safeControlsRaw = requireObject(raw.safeControls, "Learning policy.safeControls");
  const signals = {};
  for (const [signalId, signalRaw] of Object.entries(signalsRaw)) {
    const signal = requireObject(signalRaw, `Learning policy.signals.${signalId}`);
    const action = requireString(signal.action, `Learning policy.signals.${signalId}.action`);
    if (!["proposal", "safe-auto"].includes(action)) fail(`Learning policy.signals.${signalId}.action is invalid.`);
    signals[signalId] = {
      signalId,
      title: requireString(signal.title, `Learning policy.signals.${signalId}.title`),
      action,
      proposalTarget: signal.proposalTarget === undefined ? null : requireString(signal.proposalTarget, `Learning policy.signals.${signalId}.proposalTarget`),
      controlId: signal.controlId === undefined ? null : requireString(signal.controlId, `Learning policy.signals.${signalId}.controlId`),
    };
    if (action === "proposal" && !signals[signalId].proposalTarget) {
      fail(`Learning policy.signals.${signalId} requires proposalTarget.`);
    }
    if (action === "safe-auto" && !signals[signalId].controlId) {
      fail(`Learning policy.signals.${signalId} requires controlId.`);
    }
  }

  const safeControls = Object.fromEntries(
    Object.entries(safeControlsRaw).map(([controlId, control]) => [controlId, validateSafeControl(controlId, control)])
  );
  for (const signal of Object.values(signals)) {
    if (signal.action === "safe-auto" && !safeControls[signal.controlId]) {
      fail(`Learning policy signal ${signal.signalId} references an unknown safe control: ${signal.controlId}.`);
    }
  }

  let stateRecord = null;
  if (raw.stateRecord !== undefined) {
    const record = requireObject(raw.stateRecord, "Learning policy.stateRecord");
    const modeValue = requireString(record.mode, "Learning policy.stateRecord.mode");
    if (!["on-finding", "always"].includes(modeValue)) fail("Learning policy.stateRecord.mode is invalid.");
    stateRecord = {
      path: normalizeRepoPath(record.path, "Learning policy.stateRecord.path"),
      mode: modeValue,
    };
  }

  return {
    version: 1,
    catalogVersion: requireString(raw.catalogVersion, "Learning policy.catalogVersion"),
    mode,
    limits: {
      scopeElapsedMs: requireFiniteNumber(limits.scopeElapsedMs, "Learning policy.limits.scopeElapsedMs", { minimum: 1 }),
      maxDirectViewportRuns: requireFiniteNumber(limits.maxDirectViewportRuns, "Learning policy.limits.maxDirectViewportRuns", { minimum: 1 }),
    },
    signals,
    safeControls,
    stateRecord,
  };
}

function slug(value) {
  const normalized = String(value)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || sha256(String(value)).slice(0, 12);
}

function eventIdFromGate(manifestId, completedAt) {
  return `figma-${slug(manifestId)}-${completedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

function elapsedMilliseconds(start, end) {
  const elapsed = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed < 0) fail("Figma gate timestamps cannot produce a non-negative duration.");
  return elapsed;
}

function gateViewportRuns(state, key) {
  const metrics = isPlainObject(state.learningMetrics) ? state.learningMetrics : {};
  return normalizeViewportRunRecord(metrics[key], `Figma gate state.learningMetrics.${key}`);
}

function buildEventFromGate(manifestPath, statePath, policy) {
  const manifestInfo = toRepoPath(manifestPath, "manifest path");
  const stateInfo = toRepoPath(statePath, "gate state path");
  const manifest = readJson(manifestInfo.absolutePath, "Figma gate manifest");
  const state = readJson(stateInfo.absolutePath, "Figma gate state");
  requireObject(manifest.scope, "Figma gate manifest.scope");
  if (!["postflight", "closed"].includes(state.phase)) fail("Figma gate state must be postflight or closed before learning.");

  const completedAt = normalizeIso(state.closedAt ?? state.postflightAt, "Figma gate completed timestamp");
  const preflightAt = normalizeIso(state.preflightAt, "Figma gate preflight timestamp");
  const targets = state.changeTargets ?? manifest.scope.changeTargets;
  const normalizedTargets = normalizeStringArray(targets, "Figma gate change targets");
  const capabilities = normalizeCapabilities(state.learningCapabilities, "Figma gate learningCapabilities");
  const w3cState = isPlainObject(state.w3cValidation) ? state.w3cValidation : null;
  const w3cStatus = w3cState && typeof w3cState.status === "string" ? w3cState.status : "not-recorded";
  const htmlChanged = normalizedTargets.some((target) => /\.(?:php|html?)$/i.test(target));

  return validateEvent({
    version: 1,
    eventId: eventIdFromGate(requireString(manifest.id, "Figma gate manifest.id"), completedAt),
    generatedAt: completedAt,
    source: {
      kind: "figma-gate",
      gateSchemaVersion: Number.isFinite(state.version) ? state.version : null,
      gateStatePath: stateInfo.relativePath,
    },
    catalogVersion: policy.catalogVersion,
    scope: {
      id: requireString(manifest.id, "Figma gate manifest.id"),
      manifestPath: manifestInfo.relativePath,
      targets: normalizedTargets,
    },
    metrics: {
      scopeElapsedMs: elapsedMilliseconds(preflightAt, completedAt),
      directViewportRuns: gateViewportRuns(state, "directViewportRuns"),
      finalRecheckViewportRuns: gateViewportRuns(state, "finalRecheckViewportRuns"),
    },
    validation: {
      layoutStatus: "pass",
      w3c: {
        required: htmlChanged,
        status: w3cStatus,
      },
    },
    observations: {
      changedPaths: state.learningObservedChangedPaths ?? null,
      capabilities,
    },
  });
}

function finding(policy, signalId, evidence) {
  const signal = policy.signals[signalId];
  if (!signal) return null;
  return {
    findingId: signalId,
    title: signal.title,
    signalId,
    action: signal.action,
    controlId: signal.controlId,
    proposalTarget: signal.proposalTarget,
    evidence,
    resolution: "pending",
  };
}

function detectFindings(event, policy) {
  const findings = [];
  if (event.metrics.scopeElapsedMs !== null && event.metrics.scopeElapsedMs > policy.limits.scopeElapsedMs) {
    findings.push(finding(policy, "scope-duration-exceeded", {
      actualMs: event.metrics.scopeElapsedMs,
      limitMs: policy.limits.scopeElapsedMs,
    }));
  }

  if (event.observations.changedPaths !== null) {
    const targetSet = new Set(event.scope.targets);
    const outsideTargets = event.observations.changedPaths.filter((path) => !targetSet.has(path));
    if (outsideTargets.length > 0) {
      findings.push(finding(policy, "out-of-scope-change", {
        targets: event.scope.targets,
        outsideTargets,
      }));
    }
  }

  if (event.metrics.directViewportRuns !== null) {
    const repeated = Object.entries(event.metrics.directViewportRuns).flatMap(([componentId, viewportRuns]) =>
      Object.entries(viewportRuns)
        .filter(([, count]) => count > policy.limits.maxDirectViewportRuns)
        .map(([viewport, count]) => ({ componentId, viewport, count }))
    );
    if (repeated.length > 0) {
      findings.push(finding(policy, "repeated-viewport-measurement", {
        repeated,
        limit: policy.limits.maxDirectViewportRuns,
      }));
    }
  }

  if (event.validation.w3c.required && event.validation.w3c.status !== "pass") {
    findings.push(finding(policy, "html-validation-missing", {
      required: true,
      status: event.validation.w3c.status,
      htmlTargets: event.scope.targets.filter((target) => /\.(?:php|html?)$/i.test(target)),
    }));
  }

  return findings.filter(Boolean);
}

function readActiveControls(outputDirectory) {
  const activePath = resolve(outputDirectory.absolutePath, "active-controls.json");
  if (!existsSync(activePath)) {
    return { path: activePath, document: { version: 1, controls: [] } };
  }
  const document = readJson(activePath, "Active learning controls");
  if (document.version !== 1 || !Array.isArray(document.controls)) fail("Active learning controls must use version 1 with controls[].");
  const controls = document.controls.map((control) => validateSafeControl(requireString(control.controlId, "Active control.controlId"), control));
  return {
    path: activePath,
    document: { version: 1, controls },
  };
}

function requirementsMet(requirements, capabilities) {
  return Object.entries(requirements).every(([key, expected]) => capabilities[key] === expected);
}

function createProposal(event, finding, reason) {
  return {
    version: 1,
    proposalId: `${event.eventId}-${finding.signalId}`,
    status: "pending-review",
    createdAt: event.generatedAt,
    eventId: event.eventId,
    signalId: finding.signalId,
    title: finding.title,
    target: finding.proposalTarget ?? "C:\\AI\\figma-to-code\\rules\\self-improvement.md",
    evidence: finding.evidence,
    reason,
    requiredReview: "independent-reviewer + owner approval",
    automaticChange: false,
  };
}

function proposalMarkdown(proposal, eventPath) {
  return [
    `# ルール提案: ${proposal.title}`,
    "",
    `- status: ${proposal.status}`,
    `- proposalId: ${proposal.proposalId}`,
    `- event: ${eventPath}`,
    `- target: ${proposal.target}`,
    `- review: ${proposal.requiredReview}`,
    "",
    "## 根拠",
    "",
    "```json",
    JSON.stringify(proposal.evidence, null, 2),
    "```",
    "",
    "## 提案",
    "",
    `${proposal.reason} 正本ルールは独立レビューとオーナー承認があるまで変更しない。`,
    "",
  ].join("\n");
}

function writeProposal(outputDirectory, proposal, eventPath) {
  const proposalBase = resolve(outputDirectory.absolutePath, "proposals", proposal.proposalId);
  const jsonPath = `${proposalBase}.json`;
  const markdownPath = `${proposalBase}.md`;
  writeImmutableJson(jsonPath, proposal, "Learning proposal");
  const markdown = proposalMarkdown(proposal, eventPath);
  if (existsSync(markdownPath) && readFileSync(markdownPath, "utf8") !== markdown) {
    fail(`Learning proposal Markdown is immutable and already differs: ${markdownPath}`);
  }
  if (!existsSync(markdownPath)) {
    mkdirSync(dirname(markdownPath), { recursive: true });
    writeFileSync(markdownPath, markdown, "utf8");
  }
  return {
    proposalId: proposal.proposalId,
    status: proposal.status,
    jsonPath: relative(repoRoot, jsonPath).replace(/\\/g, "/"),
    markdownPath: relative(repoRoot, markdownPath).replace(/\\/g, "/"),
  };
}

function appendStateRecord(policy, event, summary) {
  if (!policy.stateRecord || (policy.stateRecord.mode === "on-finding" && summary.findings.length === 0)) return null;
  const statePath = toRepoPath(policy.stateRecord.path, "Learning policy.stateRecord.path");
  if (!existsSync(statePath.absolutePath)) fail(`Learning state record does not exist: ${statePath.relativePath}`);
  const marker = `## [Learn ${event.eventId}]`;
  const current = readFileSync(statePath.absolutePath, "utf8");
  if (current.includes(marker)) return statePath.relativePath;

  const findingLabels = summary.findings.length > 0 ? summary.findings.map((item) => item.signalId).join(", ") : "なし";
  const controlLabels = summary.controlsAdded.length > 0 ? summary.controlsAdded.map((item) => item.controlId).join(", ") : "なし";
  const proposalLabels = summary.proposals.length > 0 ? summary.proposals.map((item) => item.proposalId).join(", ") : "なし";
  const block = [
    marker,
    `- event: ${summary.eventPath}`,
    `- 検知: ${findingLabels}`,
    `- 自動適用制御: ${controlLabels}`,
    `- ルール提案: ${proposalLabels}`,
    "",
  ].join("\n");
  writeFileSync(statePath.absolutePath, `${current.replace(/\s*$/, "")}\n\n${block}`, "utf8");
  return statePath.relativePath;
}

function analyze(event, policy, outputDirectory) {
  const eventPath = resolve(outputDirectory.absolutePath, "events", `${event.eventId}.json`);
  writeImmutableJson(eventPath, event, "Learning event");
  const eventRelativePath = relative(repoRoot, eventPath).replace(/\\/g, "/");
  const findings = detectFindings(event, policy);
  const active = readActiveControls(outputDirectory);
  const activeIds = new Set(active.document.controls.map((control) => control.controlId));
  const controlsAdded = [];
  const proposals = [];

  for (const item of findings) {
    if (item.action !== "safe-auto" || policy.mode !== "safe-auto") {
      item.resolution = "pending-review";
      proposals.push(writeProposal(outputDirectory, createProposal(event, item, "このシグナルは正本ルールまたは実行器の変更を要するため。"), eventRelativePath));
      continue;
    }

    const control = policy.safeControls[item.controlId];
    if (!requirementsMet(control.requirements, event.observations.capabilities)) {
      item.resolution = "pending-review";
      const required = JSON.stringify(control.requirements);
      proposals.push(writeProposal(outputDirectory, createProposal(event, item, `safe-auto制御 ${control.controlId} に必要なゲート能力 ${required} が現在の実行器に無いため。`), eventRelativePath));
      continue;
    }

    const conflicting = control.conflictsWith.find((controlId) => activeIds.has(controlId));
    if (conflicting) {
      item.resolution = "pending-review";
      proposals.push(writeProposal(outputDirectory, createProposal(event, item, `既存の安全制御 ${conflicting} と競合するため。`), eventRelativePath));
      continue;
    }

    if (activeIds.has(control.controlId)) {
      item.resolution = "already-active";
      continue;
    }

    const applied = {
      ...control,
      sourceEventId: event.eventId,
      appliedAt: event.generatedAt,
      expires: "independent-reviewer or owner removes it; automatic expiry is prohibited",
    };
    active.document.controls.push(applied);
    activeIds.add(control.controlId);
    item.resolution = "safe-auto";
    controlsAdded.push({ controlId: control.controlId, sourceEventId: event.eventId });
  }

  if (controlsAdded.length > 0) {
    writeJson(active.path, {
      version: 1,
      updatedAt: event.generatedAt,
      controls: active.document.controls,
    });
  }

  const report = {
    version: 1,
    eventId: event.eventId,
    generatedAt: event.generatedAt,
    policy: {
      catalogVersion: policy.catalogVersion,
      mode: policy.mode,
    },
    findings,
    controlsAdded,
    proposals,
  };
  const reportPath = resolve(outputDirectory.absolutePath, "reports", `${event.eventId}.json`);
  writeJson(reportPath, report);

  const summary = {
    version: 1,
    eventId: event.eventId,
    generatedAt: event.generatedAt,
    eventPath: eventRelativePath,
    reportPath: relative(repoRoot, reportPath).replace(/\\/g, "/"),
    findings,
    controlsAdded,
    proposals,
  };
  summary.stateRecordPath = appendStateRecord(policy, event, summary);
  writeJson(resolve(outputDirectory.absolutePath, "latest.json"), summary);
  return summary;
}

function usage() {
  return [
    "Usage:",
    "  node MyBrain/verify/loop-learn.mjs analyze <event.json> <policy.json> <output-dir>",
    "  node MyBrain/verify/loop-learn.mjs from-gate <manifest.json> <gate-state.json> <policy.json> <output-dir>",
  ].join("\n");
}

function main() {
  if (command === "analyze") {
    if (args.length !== 3) fail(usage());
    const eventInfo = toRepoPath(args[0], "event path");
    const policyInfo = toRepoPath(args[1], "policy path");
    const outputDirectory = toRepoPath(args[2], "output directory");
    const policy = validatePolicy(readJson(policyInfo.absolutePath, "Learning policy"));
    const event = validateEvent(readJson(eventInfo.absolutePath, "Learning event"));
    if (event.catalogVersion !== policy.catalogVersion) fail("Learning event.catalogVersion must match the active policy catalogVersion.");
    console.log(JSON.stringify(analyze(event, policy, outputDirectory)));
    return;
  }

  if (command === "from-gate") {
    if (args.length !== 4) fail(usage());
    const policyInfo = toRepoPath(args[2], "policy path");
    const outputDirectory = toRepoPath(args[3], "output directory");
    const policy = validatePolicy(readJson(policyInfo.absolutePath, "Learning policy"));
    const event = buildEventFromGate(args[0], args[1], policy);
    console.log(JSON.stringify(analyze(event, policy, outputDirectory)));
    return;
  }

  fail(usage());
}

try {
  main();
} catch (error) {
  const message = error instanceof LearnError ? error.message : error.stack ?? String(error);
  console.error(`LOOP LEARN: ${message}`);
  process.exitCode = 1;
}
