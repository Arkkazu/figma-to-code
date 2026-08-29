#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const templateDirectory = process.env.FIGMA_GATE_TEMPLATE_DIR || dirname(fileURLToPath(import.meta.url));
const script = resolve(templateDirectory, "p3-role-return.mjs");
const { hashInputStaging } = await import(pathToFileURL(script).href);
const workspace = mkdtempSync(join(tmpdir(), "p3-role-return-e2e-"));

const startDelimiter = "<!-- p3:hero:start -->";
const endDelimiter = "<!-- p3:hero:end -->";
const originalMain = [
  "<!doctype html>",
  "<html>",
  "<body>",
  startDelimiter,
  "<section>old hero</section>",
  endDelimiter,
  "<footer>stable footer</footer>",
  "</body>",
  "</html>",
  "",
].join("\n");
const returnedMain = [
  "<!doctype html>",
  "<html>",
  "<body>",
  startDelimiter,
  "<section>new hero</section>",
  endDelimiter,
  "<footer>stable footer</footer>",
  "</body>",
  "</html>",
  "",
].join("\n");

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function stableDigest(value) {
  return digest(Buffer.from(JSON.stringify(stable(value)), "utf8"));
}

function fixtureBootstrapDirectories(paths) {
  const directories = new Set();
  for (const path of paths) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) directories.add(segments.slice(0, index).join("/"));
  }
  return [...directories].sort((left, right) => {
    const depth = left.split("/").length - right.split("/").length;
    return depth !== 0 ? depth : left.localeCompare(right, "en");
  });
}

function fixtureDelimiterRegions(checkpointPlan) {
  return checkpointPlan.map((elementId) => ({
    elementId,
    startDelimiter: elementId === "hero" ? startDelimiter : `<!-- p3:${elementId}:start -->`,
    endDelimiter: elementId === "hero" ? endDelimiter : `<!-- p3:${elementId}:end -->`,
  }));
}

function fixtureInitialSharedDocument(checkpointPlan) {
  const lines = ["<!doctype html>", "<html>", "<body>"];
  for (const region of fixtureDelimiterRegions(checkpointPlan)) {
    lines.push(region.startDelimiter, `<section>${region.elementId}</section>`, region.endDelimiter);
  }
  lines.push("</body>", "</html>", "");
  return lines.join("\n");
}

function fixtureSharedPolicy(path, checkpointPlan, elementId = "hero", includeBootstrap = false) {
  const region = fixtureDelimiterRegions(checkpointPlan).find((entry) => entry.elementId === elementId);
  const policy = { path, kind: "shared-delimited-region", startDelimiter: region.startDelimiter, endDelimiter: region.endDelimiter };
  if (includeBootstrap) policy.bootstrapDelimiterRegions = fixtureDelimiterRegions(checkpointPlan);
  return policy;
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shaFile(path) {
  return digest(readFileSync(path));
}

function tarText(header, offset, length, text) {
  const value = Buffer.from(text, "ascii");
  require(value.length <= length, `USTAR field is too long: ${text}`);
  value.copy(header, offset);
}

function tarOctal(header, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, "0");
  require(text.length === length - 1, `USTAR octal field overflows: ${value}`);
  tarText(header, offset, length, `${text}\0`);
}

function ustarEntry(path, value, type = "0", linkname = "") {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const header = Buffer.alloc(512);
  tarText(header, 0, 100, path);
  tarOctal(header, 100, 8, 0o644);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, bytes.length);
  tarOctal(header, 136, 12, 0);
  header[156] = type.charCodeAt(0);
  tarText(header, 157, 100, linkname);
  tarText(header, 257, 6, "ustar\0");
  tarText(header, 263, 2, "00");
  tarText(header, 265, 32, "coordinator");
  tarText(header, 297, 32, "coordinator");
  tarOctal(header, 329, 8, 0);
  tarOctal(header, 337, 8, 0);
  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  tarText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc((512 - (bytes.length % 512)) % 512);
  return Buffer.concat([header, bytes, padding]);
}

function writeUstar(path, entries) {
  writeFileSync(path, Buffer.concat([
    ...entries.map((entry) => ustarEntry(entry.path, entry.bytes, entry.type ?? "0", entry.linkname ?? "")),
    Buffer.alloc(1024),
  ]));
}

function makeManifest(caseValue, files, overrides = {}) {
  return {
    version: 4,
    kind: "p3-role-return",
    handoffId: caseValue.plan.authority.handoff.opaqueHandoffId,
    deliverySequence: caseValue.plan.authority.handoff.deliverySequence,
    handoffProtocolSha256: caseValue.plan.authority.handoff.protocol.self.sha256,
    component: {
      elementId: caseValue.plan.component.elementId,
      componentDecisionCodePath: caseValue.plan.component.componentDecisionCodePath,
      sequence: caseValue.plan.component.sequence,
      attempt: caseValue.plan.component.attempt,
    },
    inputStagingSha256: caseValue.plan.component.inputStaging.sha256,
    files: files.map((file) => ({ path: file.path, sha256: file.sha256 ?? digest(file.bytes) })),
    ...overrides,
  };
}

function writeReturnArchive(caseValue, name, files, options = {}) {
  const archivePath = join(caseValue.root, name);
  const manifest = makeManifest(caseValue, files, options.manifestOverrides);
  writeUstar(archivePath, [
    { path: "return-manifest.json", bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8") },
    ...files.map((file) => ({ path: file.path, bytes: file.bytes, type: file.type, linkname: file.linkname })),
    ...(options.extraEntries ?? []),
  ]);
  return archivePath;
}

function evidence(relativePath, absolutePath) {
  return { path: relativePath, sha256: shaFile(absolutePath) };
}

function cleanRoomDecisionEvidence(relativePath, absolutePath, fileSha256Override = null) {
  return {
    path: relativePath,
    fileSha256: fileSha256Override ?? shaFile(absolutePath),
  };
}

function gitText(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true }).trim();
}

function git(root, args) {
  execFileSync("git", ["-C", root, ...args], { stdio: "ignore", windowsHide: true });
}

function canonical(path) {
  const value = resolve(path).replace(/\\/g, "/");
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function mixedDriveLetterCase(path) {
  if (process.platform !== "win32") throw new Error("mixedDriveLetterCase is only valid on Windows.");
  const value = resolve(path);
  require(/^[A-Za-z]:/.test(value), `Windows fixture path does not have a drive letter: ${value}`);
  const drive = value[0];
  return `${drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()}${value.slice(1)}`;
}

function fixtureUuid(seed) {
  const value = digest(seed);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function appendLedger(path, value) {
  const records = existsSync(path)
    ? readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const record = {
    version: 1,
    sequence: records.length + 1,
    previousSha256: records.length ? records.at(-1).entrySha256 : null,
    at: `2026-08-10T00:00:0${records.length}Z`,
    ...value,
  };
  record.entrySha256 = stableDigest(record);
  writeFileSync(path, `${records.map((entry) => JSON.stringify(entry)).join("\n")}${records.length ? "\n" : ""}${JSON.stringify(record)}\n`, "utf8");
  return record;
}

function initializeActualPair(caseValue) {
  const peerRoot = join(caseValue.root, "peer-worktree");
  git(caseValue.targetRoot, ["init", "--quiet"]);
  git(caseValue.targetRoot, ["config", "user.email", "p3-return-e2e@example.invalid"]);
  git(caseValue.targetRoot, ["config", "user.name", "P3 Return E2E"]);
  git(caseValue.targetRoot, ["add", "--all"]);
  git(caseValue.targetRoot, ["commit", "--quiet", "-m", "fixture source"]);
  git(caseValue.targetRoot, ["worktree", "add", "--detach", "--quiet", peerRoot, "HEAD"]);
  return peerRoot;
}

function createRuntimeAuthority(caseValue) {
  const { targetRoot, peerRoot, condition, pairId, frozenTargets, checkpointPlan } = caseValue;
  const otherCondition = condition === "baseline" ? "current" : "baseline";
  const selfWorktreeRoot = caseValue.mixedDriveCaseCleanRoomWorktreeRoot ? mixedDriveLetterCase(targetRoot) : targetRoot;
  const relativeBase = {
    gate: "MyBrain/verify/return-e2e/gate.json",
    proof: "MyBrain/verify/return-e2e/proof.json",
    decision: "MyBrain/verify/return-e2e/decision.json",
    contract: "MyBrain/verify/return-e2e/final-v13-contract.json",
    preflightState: ".figma-gate/active.json",
  };
  const rootFor = (namedCondition) => (namedCondition === condition ? targetRoot : peerRoot);
  const entryFor = (namedCondition) => {
    const root = rootFor(namedCondition);
    const relative = { ...relativeBase, clean: `MyBrain/verify/return-e2e/clean-${namedCondition}.json` };
    const absolute = Object.fromEntries(Object.entries(relative).map(([key, value]) => [key, join(root, ...value.split("/"))]));
    return { condition: namedCondition, root, relative, absolute, preflightId: fixtureUuid(`${pairId}-${namedCondition}`) };
  };
  const selfEntry = entryFor(condition);
  const peerEntry = entryFor(otherCondition);
  const entriesByCondition = Object.fromEntries([[selfEntry.condition, selfEntry], [peerEntry.condition, peerEntry]]);
  const self = {
    condition,
    evidencePath: selfEntry.relative.clean,
    workspaceId: `workspace-${condition}-${pairId}`,
    worktreeRoot: selfWorktreeRoot,
    implementation: { actor: `implementation-${condition}`, contextId: `implementation-context-${condition}` },
    review: { actor: `review-${condition}`, contextId: `review-context-${condition}` },
    otherWorkspaceId: `workspace-${otherCondition}-${pairId}`,
    isolationMechanism: "coordinator-only test fixture",
    otherConditionArtifactsAccessible: false,
    prohibitedArtifacts: ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"],
  };
  const peer = {
    ...self,
    condition: otherCondition,
    evidencePath: peerEntry.relative.clean,
    workspaceId: self.otherWorkspaceId,
    worktreeRoot: peerRoot,
    implementation: { actor: `implementation-${otherCondition}`, contextId: `implementation-context-${otherCondition}` },
    review: { actor: `review-${otherCondition}`, contextId: `review-context-${otherCondition}` },
    otherWorkspaceId: self.workspaceId,
  };
  const authorization = { version: 1, pairId, conditions: condition === "baseline" ? [self, peer] : [peer, self] };
  const authorizationByCondition = Object.fromEntries(authorization.conditions.map((entry) => [entry.condition, entry]));
  for (const namedCondition of ["baseline", "current"]) {
    const entry = entriesByCondition[namedCondition];
    writeJson(entry.absolute.gate, { version: 1, scope: { changeTargets: frozenTargets } });
    writeJson(entry.absolute.proof, {
      version: 2,
      status: "approved",
      ownerApproved: true,
      unimplementedTargetPaths: frozenTargets,
    });
    writeJson(entry.absolute.decision, {
      version: 2,
      decisionId: "J",
      pairId,
      status: "approved",
      ownerApproved: true,
      scope: { checkpointPlan, changeTargets: frozenTargets },
      cleanRoomAuthorization: authorization,
      cleanRoomAuthorizationStableJsonSha256: stableDigest(authorization),
    });
    writeJson(entry.absolute.clean, {
      version: 2,
      kind: "p3-clean-room-evidence",
      status: "approved",
      ownerApproved: true,
      pairId,
      condition: namedCondition,
      ownerDecisionJ: cleanRoomDecisionEvidence(
        entry.relative.decision,
        entry.absolute.decision,
        caseValue.cleanRoomDecisionFileSha256Override,
      ),
      cleanRoomAuthorizationStableJsonSha256: stableDigest(authorization),
      conditionAuthorization: authorizationByCondition[namedCondition],
    });
    const conditionAuthorization = authorizationByCondition[namedCondition];
    writeJson(entry.absolute.contract, {
      version: 13,
      pairId,
      condition: namedCondition,
      shared: {
        cleanRoomAuthorization: authorization,
        ownerDecisionJ: evidence(entry.relative.decision, entry.absolute.decision),
        gate: { inputs: { manifest: evidence(entry.relative.gate, entry.absolute.gate) } },
        sourceSnapshot: { preImplementationProof: evidence(entry.relative.proof, entry.absolute.proof) },
      },
      run: {
        workspaceId: conditionAuthorization.workspaceId,
        implementation: conditionAuthorization.implementation,
        review: conditionAuthorization.review,
        cleanRoom: { evidence: evidence(entry.relative.clean, entry.absolute.clean) },
      },
    });
    writeJson(entry.absolute.preflightState, {
      version: 5,
      phase: "preflight",
      repository: canonical(entry.root),
      preflightId: entry.preflightId,
      manifestPath: entry.absolute.gate,
      manifestSha256: shaFile(entry.absolute.gate),
      implementationIdentity: conditionAuthorization.implementation,
      changeTargets: frozenTargets,
      // Real v5 preflight state records the files to inspect in sourceFiles
      // and marks the deferred subset within that same frozen list.
      responsiveHtml: { sourceFiles: frozenTargets, deferredSourceFiles: frozenTargets },
      benchmark: { plan: checkpointPlan, attempts: [] },
      checkpoints: {},
    });
  }
  const commonGitDirectory = resolve(targetRoot, gitText(targetRoot, ["rev-parse", "--git-common-dir"]));
  const ledgerPath = join(commonGitDirectory, "figma-p3-comparison-ledger.jsonl");
  const contractPath = process.platform === "win32" ? relativeBase.contract.toLowerCase() : relativeBase.contract;
  const baseline = entriesByCondition.baseline;
  const current = entriesByCondition.current;
  const baselineContract = JSON.parse(readFileSync(baseline.absolute.contract, "utf8"));
  const currentContract = JSON.parse(readFileSync(current.absolute.contract, "utf8"));
  const pairLockPath = join(commonGitDirectory, "figma-p3-comparison-pair-locks", `${digest(pairId)}.json`);
  writeJson(pairLockPath, {
    version: 5,
    contractVersion: 13,
    pairId,
    contractPath,
    ledgerPath: canonical(ledgerPath),
    reservedAt: "2026-08-10T00:00:00Z",
  });
  appendLedger(ledgerPath, {
    kind: "started",
    contractVersion: 13,
    pairId,
    contractPath,
    baselineContractSha256: stableDigest(baselineContract),
    baselineRunIntentSha256: stableDigest(baselineContract.run),
    ledgerPath: canonical(ledgerPath),
  });
  if (caseValue.withPairPreflights !== false) {
    for (const entry of [baseline, current]) {
      const contract = entry.condition === "baseline" ? baselineContract : currentContract;
      appendLedger(ledgerPath, {
        kind: "preflight-recorded",
        contractVersion: 13,
        pairId,
        condition: entry.condition,
        contractPath,
        contractSha256: stableDigest(contract),
        runIntentSha256: stableDigest(contract.run),
        worktreeRoot: canonical(entry.root),
        implementationIdentity: contract.run.implementation,
        preflightId: entry.preflightId,
        preflightStateSha256: shaFile(entry.absolute.preflightState),
      });
    }
  }
  for (const entry of Object.values(entriesByCondition)) {
    entry.preflightStateEvidence = evidence(entry.relative.preflightState, entry.absolute.preflightState);
  }
  return {
    relative: selfEntry.relative,
    absolute: selfEntry.absolute,
    authorization,
    entries: entriesByCondition,
    ledgerPath,
    pairLockPath,
  };
}

function writeCoordinatorArtifacts(caseValue) {
  const coordinator = join(caseValue.root, "coordinator");
  const protocolPaths = {
    baseline: join(coordinator, "handoff-protocol-baseline.json"),
    current: join(coordinator, "handoff-protocol-current.json"),
  };
  const protocolPath = protocolPaths[caseValue.condition];
  const registryPath = join(coordinator, "registry.json");
  const packetPath = join(coordinator, "packet-manifest.json");
  const protocol = {
    schema: "p3-role-handoff-protocol/v2",
    recordState: "finalized",
    ownerApproved: true,
    pairId: caseValue.pairId,
    aBIdentical: true,
    coordinatorOnly: {
      actualWorktree: true,
      commonGitDirectory: true,
      p3Lifecycle: true,
      comparisonContract: true,
      ownerDecisionJ: true,
      cleanRoomEvidence: true,
    },
    implementationLoop: {
      componentReturnScopes: caseValue.protocolComponentReturnScopes,
      maxAttemptsPerComponent: caseValue.maxAttemptsPerComponent,
    },
  };
  writeJson(protocolPaths.baseline, protocol);
  writeJson(protocolPaths.current, protocol);
  const attachment = {
    logicalPath: "assignment/component-001.json",
    path: "assignment/component-001.json",
    origin: "coordinator-redacted-component-assignment",
    sha256: digest("role-packet-attachment-v1"),
  };
  const contractEvidence = evidence(caseValue.runtime.relative.contract, caseValue.runtime.absolute.contract);
  const decisionEvidence = evidence(caseValue.runtime.relative.decision, caseValue.runtime.absolute.decision);
  const packet = {
    version: 3,
    kind: "p3-role-packet-manifest",
    coordinatorOnly: true,
    planSha256: "a".repeat(64),
    identityAuthority: {
      comparisonContract: contractEvidence,
      ownerDecisionJ: decisionEvidence,
      pairId: caseValue.pairId,
      recipientCondition: caseValue.condition,
      peerCondition: caseValue.condition === "baseline" ? "current" : "baseline",
      cleanRoomAuthorizationStableJsonSha256: stableDigest(caseValue.runtime.authorization),
      derivedPeerIdentityFields: ["workspaceId", "worktreeRoot"],
    },
    packetRoot: "redacted-role-packet",
    attachmentCount: 1,
    roleAttachments: [{ ...attachment, scan: { restrictedArtifact: "clear" } }],
    forbiddenArtifacts: [],
    scan: { derivedPeerIdentity: "clear", attachmentCompleteness: "clear", duplicateAttachments: "clear", checksums: "clear" },
  };
  writeJson(packetPath, packet);
  const registry = {
    schema: "p3-role-handoff-registry/v2",
    recordState: "finalized",
    executionState: false,
    ownerApproved: true,
    aBIdentical: true,
    aBByteIdentical: true,
    deliveryMode: "attachment-only",
    deliveryProgress: { ...caseValue.deliveryProgress },
    coordinatorOnly: true,
    protocol: { path: `handoff-protocol-${caseValue.condition}.json`, sha256: shaFile(protocolPath) },
    recipientPackets: [{
      opaqueHandoffId: caseValue.handoffId,
      roleKind: "implementation",
      coordinatorConditionBinding: caseValue.condition,
      deliverySequence: caseValue.deliverySequence,
      deliverAfter: "both-condition-pair-preflight-pass",
      attachments: [{ attachmentId: "attachment-001", ...attachment }],
      identityLeakScan: { result: "clear" },
      coordinatorEvidencePath: "coordinator-only-evidence.json",
    }],
  };
  writeJson(registryPath, registry);
  return { coordinator, protocolPaths, protocolPath, registryPath, packetPath };
}

function writePlan(caseValue) {
  const { coordinator, protocolPaths, registryPath, packetPath } = caseValue.coordinator;
  const pairPreflightConditions = ["baseline", "current"].map((namedCondition) => {
    const entry = caseValue.runtime.entries[namedCondition];
    return {
      condition: namedCondition,
      worktreeRoot: entry.root,
      comparisonContract: evidence(entry.relative.contract, entry.absolute.contract),
      gateManifest: evidence(entry.relative.gate, entry.absolute.gate),
      preflightState: entry.preflightStateEvidence,
      preflightId: entry.preflightId,
    };
  });
  const plan = {
    version: 5,
    kind: "p3-role-return-plan",
    authority: {
      pairId: caseValue.pairId,
      condition: caseValue.condition,
      comparisonContract: evidence(caseValue.runtime.relative.contract, caseValue.runtime.absolute.contract),
      frozenScope: { checkpointPlan: caseValue.checkpointPlan, changeTargets: caseValue.frozenTargets },
      pairPreflights: {
        ledger: { path: caseValue.runtime.ledgerPath, sha256: shaFile(caseValue.runtime.ledgerPath) },
        conditions: pairPreflightConditions,
      },
      progress: {
        ledgerPath: join(coordinator, "progress.jsonl"),
        checkpointProofDirectory: join(coordinator, "checkpoint-proofs"),
      },
      handoff: {
        opaqueHandoffId: caseValue.handoffId,
        deliverySequence: caseValue.deliverySequence,
        deliveryProgress: { ...caseValue.deliveryProgress },
        protocol: {
          self: {
            path: `handoff-protocol-${caseValue.condition}.json`,
            sha256: shaFile(protocolPaths[caseValue.condition]),
          },
          peer: {
            path: `handoff-protocol-${caseValue.condition === "baseline" ? "current" : "baseline"}.json`,
            sha256: shaFile(protocolPaths[caseValue.condition === "baseline" ? "current" : "baseline"]),
          },
        },
        registry: { path: "registry.json", sha256: shaFile(registryPath) },
        packetManifest: { path: "packet-manifest.json", sha256: shaFile(packetPath) },
      },
    },
    component: {
      elementId: "hero",
      componentDecisionCodePath: caseValue.componentDecisionCodePath,
      attempt: 1,
      sequence: 1,
      inputStaging: { root: "input-staging", sha256: hashInputStaging(caseValue.inputStaging) },
      allowedChangeTargets: caseValue.allowedChangeTargets,
      attemptOneCreatePaths: caseValue.attemptOneCreatePaths,
      derivedBootstrapDirectories: caseValue.derivedBootstrapDirectories,
      filePolicies: caseValue.filePolicies,
    },
  };
  const planPath = join(coordinator, "coordinator-only-return-plan.json");
  writeJson(planPath, plan);
  caseValue.plan = plan;
  caseValue.planPath = planPath;
}

function refreshPlan(caseValue) {
  writePlan(caseValue);
}

function recordActualCheckpoint(caseValue, outcome = "PASS", failureClass = null) {
  const statePath = caseValue.runtime.absolute.preflightState;
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const checkpointRoot = join(caseValue.targetRoot, "MyBrain", "verify", "checkpoints", "return-e2e");
  const attempt = {
    elementId: caseValue.plan.component.elementId,
    attempt: caseValue.plan.component.attempt,
    painted: true,
    finalRecheck: false,
    outcome,
    failureClass,
    at: "2026-08-10T00:01:00.000Z",
  };
  state.benchmark = state.benchmark ?? { attempts: [] };
  state.benchmark.attempts.push(attempt);
  state.checkpoints = state.checkpoints ?? {};
  if (outcome === "PASS") {
    const measuredSpecPath = join(checkpointRoot, `${caseValue.plan.component.elementId}-spec.json`);
    const batchJobPath = join(checkpointRoot, `${caseValue.plan.component.elementId}-browser-batch.json`);
    const batchSummaryPath = join(checkpointRoot, `${caseValue.plan.component.elementId}-browser-batch-summary.json`);
    write(measuredSpecPath, "{\"status\":\"PASS\"}\n");
    write(batchJobPath, "{\"job\":\"PASS\"}\n");
    write(batchSummaryPath, "{\"status\":\"PASS\"}\n");
    state.checkpoints[caseValue.plan.component.elementId] = {
      passedAt: "2026-08-10T00:01:00.000Z",
      measuredSpecPath,
      measuredSpecSha256: shaFile(measuredSpecPath),
      batchEvidence: {
        batchJobPath,
        batchJobSha256: shaFile(batchJobPath),
        batchSummaryPath,
        batchSummarySha256: shaFile(batchSummaryPath),
        browserSessionId: "return-e2e-session",
        browserPid: 12345,
      },
    };
  }
  writeJson(statePath, state);
}

function writeSameConditionFeedback(caseValue, name, checkpointReport, message = "same-condition gate result") {
  const path = join(caseValue.coordinator.coordinator, name);
  writeJson(path, {
    version: 1,
    kind: "p3-role-return-feedback",
    handoffId: caseValue.plan.authority.handoff.opaqueHandoffId,
    component: {
      elementId: caseValue.plan.component.elementId,
      componentDecisionCodePath: caseValue.plan.component.componentDecisionCodePath,
      sequence: caseValue.plan.component.sequence,
      attempt: caseValue.plan.component.attempt,
    },
    checkpointProofSha256: checkpointReport.checkpointProof.sha256,
    outcome: checkpointReport.outcome,
    failureClass: checkpointReport.failureClass,
    sameCondition: true,
    feedback: { kind: "same-condition-gate-result", message },
  });
  return path;
}

function prepareDelivery(caseValue, {
  elementId,
  componentDecisionCodePath,
  sequence,
  attempt,
  deliverySequence,
  allowedChangeTargets,
  filePolicies,
}) {
  caseValue.handoffId = `opaque-handoff-${caseValue.condition}-${caseValue.pairId}-delivery-${deliverySequence}`;
  caseValue.deliverySequence = deliverySequence;
  caseValue.componentDecisionCodePath = componentDecisionCodePath;
  caseValue.allowedChangeTargets = allowedChangeTargets;
  caseValue.filePolicies = filePolicies;
  const protocolScope = caseValue.protocolComponentReturnScopes.find((scope) => scope.elementId === elementId);
  require(protocolScope, `missing protocol scope for ${elementId}`);
  caseValue.attemptOneCreatePaths = protocolScope.attemptOneCreatePaths;
  caseValue.derivedBootstrapDirectories = protocolScope.derivedBootstrapDirectories;
  caseValue.coordinator = writeCoordinatorArtifacts(caseValue);
  writePlan(caseValue);
  caseValue.plan.component.elementId = elementId;
  caseValue.plan.component.componentDecisionCodePath = componentDecisionCodePath;
  caseValue.plan.component.sequence = sequence;
  caseValue.plan.component.attempt = attempt;
  writeJson(caseValue.planPath, caseValue.plan);
}

function createCase(name, options = {}) {
  const root = join(workspace, name);
  const targetRoot = join(root, "actual-target");
  const inputStaging = join(root, "coordinator", "input-staging");
  const condition = options.condition ?? "baseline";
  const pairId = options.pairId ?? `p3-role-return-${name}`;
  const frozenTargets = options.frozenTargets ?? ["site/index.html", "site/assets/hero/hero.js", "site/assets/icons/cards.js"];
  const checkpointPlan = options.checkpointPlan ?? ["hero", "cards"];
  write(join(inputStaging, "assignment.txt"), "same-condition assignment\n");
  write(join(inputStaging, "reference.bin"), Buffer.from([0xff, 0x00, 0x80, 0x01]));
  write(join(targetRoot, "site/index.html"), originalMain);
  write(join(targetRoot, "site/assets/hero/hero.js"), "export const hero = 'old';\n");
  write(join(targetRoot, "site/assets/icons/cards.js"), "export const cards = 'old';\n");
  if (options.prepareTarget) options.prepareTarget(targetRoot);
  const caseValue = {
    root,
    targetRoot,
    inputStaging,
    condition,
    pairId,
    handoffId: `opaque-handoff-${condition}-${name}`,
    deliverySequence: options.deliverySequence ?? 1,
    deliveryProgress: options.deliveryProgress ?? {
      version: 1,
      scope: "per-condition",
      initialDeliverySequence: 1,
      increment: 1,
    },
    cleanRoomDecisionFileSha256Override: options.cleanRoomDecisionFileSha256Override ?? null,
    frozenTargets,
    checkpointPlan,
    allowedChangeTargets: options.allowedChangeTargets ?? ["site/index.html", "site/assets/hero/hero.js"],
    filePolicies: options.filePolicies ?? [
      fixtureSharedPolicy("site/index.html", checkpointPlan, "hero", true),
      { path: "site/assets/hero/hero.js", kind: "component-file" },
    ],
    componentDecisionCodePath: options.componentDecisionCodePath ?? "site/index.html#p3:hero",
    attemptOneCreatePaths: options.attemptOneCreatePaths ?? ["site/index.html", "site/assets/hero/hero.js"],
    derivedBootstrapDirectories: options.derivedBootstrapDirectories ?? fixtureBootstrapDirectories(options.attemptOneCreatePaths ?? ["site/index.html", "site/assets/hero/hero.js"]),
    maxAttemptsPerComponent: options.maxAttemptsPerComponent ?? 3,
    withPairPreflights: options.withPairPreflights ?? true,
    mixedDriveCaseCleanRoomWorktreeRoot: options.mixedDriveCaseCleanRoomWorktreeRoot ?? false,
  };
  caseValue.protocolComponentReturnScopes = options.protocolComponentReturnScopes ?? [
    {
      elementId: "hero",
      sequence: 1,
      componentDecisionCodePath: caseValue.componentDecisionCodePath,
      allowedChangeTargets: caseValue.allowedChangeTargets,
      attemptOneCreatePaths: caseValue.attemptOneCreatePaths,
      derivedBootstrapDirectories: caseValue.derivedBootstrapDirectories,
    },
    ...(caseValue.frozenTargets.includes("site/assets/icons/cards.js") ? [{
      elementId: "cards",
      sequence: 2,
      componentDecisionCodePath: "site/assets/icons/cards.js#p3:cards",
      allowedChangeTargets: ["site/assets/icons/cards.js"],
      attemptOneCreatePaths: ["site/assets/icons/cards.js"],
      derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/icons/cards.js"]),
    }] : []),
  ];
  caseValue.peerRoot = initializeActualPair(caseValue);
  caseValue.runtime = createRuntimeAuthority(caseValue);
  caseValue.coordinator = writeCoordinatorArtifacts(caseValue);
  writePlan(caseValue);
  return caseValue;
}

function run(mode, caseValue, archivePath, expectedSuccess, options = {}) {
  const targetRoot = options.targetRoot ?? caseValue.targetRoot;
  const args = mode === "--recover"
    ? [script, "--recover", targetRoot]
    : mode === "--record-checkpoint"
      ? [script, mode, caseValue.planPath, targetRoot]
      : mode === "--record-feedback"
        ? [script, mode, caseValue.planPath, archivePath, targetRoot]
        : [script, mode, caseValue.planPath, archivePath, targetRoot];
  const result = spawnSync(process.execPath, args, {
    cwd: workspace,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
  const spawnError = result.error ? `\nspawn error: ${result.error.message}` : "";
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}${spawnError}`;
  if (expectedSuccess && result.status !== 0) throw new Error(`expected pass: ${output}`);
  if (!expectedSuccess && result.status === 0) throw new Error(`expected rejection: ${output}`);
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", output };
}

function expectRejected(mode, caseValue, archivePath, expected, options = {}) {
  const result = run(mode, caseValue, archivePath, false, options);
  require(result.output.includes(expected), `wrong rejection; expected ${JSON.stringify(expected)}, got ${result.output}`);
}

function runN14LaurelOwnershipFixture() {
  // This focused fixture retains the actual six-sequence/28-target P-3 map.
  // It injects hero-laurel.png into both seq6 scope lists, then tries a
  // component-file replacement.  Ownership validation must reject before
  // archive application or any generic allowlist fallback.
  const shared = ["site/index.html", "site/styles.css"];
  const brand = [
    "open-service-wordmark.png",
    "open-mark-ellipse.svg",
    "open-mark-vector-1.svg",
    "open-mark-vector-2.svg",
    "open-mark-vector-3.svg",
    "open-mark-vector-4.svg",
    "open-mark-vector-5.svg",
    "open-mark-vector-6.svg",
  ].map((name) => `site/assets/brand/${name}`);
  const headerIcons = ["header-arrow-download.svg", "header-arrow-contact.svg"].map((name) => `site/assets/icons/${name}`);
  const hero = [
    "hero-photo.jpg",
    "hero-graphic.png",
    "hero-contact.png",
    "hero-laurel.png",
    "hero-vector-1.svg",
    "hero-vector-2.svg",
    "hero-vector-3.svg",
    "hero-mask.svg",
    "hero-shape-1.svg",
    "hero-shape-2.svg",
    "hero-shape-3.svg",
    "hero-shape-4.svg",
  ].map((name) => `site/assets/hero/${name}`);
  const actionIcons = [
    "hero-arrow-download-pc.svg",
    "hero-arrow-contact-pc.svg",
    "hero-arrow-download-sp.svg",
    "hero-arrow-contact-sp.svg",
  ].map((name) => `site/assets/icons/${name}`);
  const checkpointPlan = [
    "open-service-top-hero",
    "open-service-header",
    "open-service-hero-visual",
    "open-service-hero-copy",
    "open-service-hero-actions",
    "open-service-hero-stats",
  ];
  const scope = (sequence, allowedChangeTargets, attemptOneCreatePaths) => ({
    elementId: checkpointPlan[sequence - 1],
    sequence,
    componentDecisionCodePath: `site/index.html#p3:${checkpointPlan[sequence - 1]}`,
    allowedChangeTargets,
    attemptOneCreatePaths,
    derivedBootstrapDirectories: fixtureBootstrapDirectories(attemptOneCreatePaths),
  });
  const protocolComponentReturnScopes = [
    scope(1, shared, shared),
    scope(2, [...shared, ...brand, ...headerIcons], [...brand, ...headerIcons]),
    scope(3, [...shared, ...hero], hero),
    scope(4, shared, []),
    scope(5, [...shared, ...actionIcons], actionIcons),
    scope(6, [...shared, "site/assets/hero/hero-laurel.png"], []),
  ];
  const frozenTargets = [...shared, ...brand, ...headerIcons, ...hero, ...actionIcons];
  require(frozenTargets.length === 28, "N-14 fixture must retain all 28 frozen P-3 targets");
  const caseValue = createCase("n14-laurel-ownership-only", {
    frozenTargets,
    checkpointPlan,
    allowedChangeTargets: shared,
    attemptOneCreatePaths: shared,
    derivedBootstrapDirectories: fixtureBootstrapDirectories(shared),
    filePolicies: [
      fixtureSharedPolicy("site/index.html", checkpointPlan, checkpointPlan[0], true),
      fixtureSharedPolicy("site/styles.css", checkpointPlan, checkpointPlan[0], true),
    ],
    componentDecisionCodePath: `site/index.html#p3:${checkpointPlan[0]}`,
    protocolComponentReturnScopes,
    prepareTarget(targetRoot) { write(join(targetRoot, "site/assets/hero/hero-laurel.png"), "old laurel\n"); },
  });
  caseValue.plan.component.elementId = checkpointPlan[5];
  caseValue.plan.component.componentDecisionCodePath = `site/index.html#p3:${checkpointPlan[5]}`;
  caseValue.plan.component.sequence = 6;
  caseValue.plan.component.attempt = 1;
  caseValue.plan.component.allowedChangeTargets = [...shared, "site/assets/hero/hero-laurel.png"];
  caseValue.plan.component.attemptOneCreatePaths = [];
  caseValue.plan.component.derivedBootstrapDirectories = [];
  caseValue.plan.component.filePolicies = [
    fixtureSharedPolicy("site/index.html", checkpointPlan, checkpointPlan[5], false),
    fixtureSharedPolicy("site/styles.css", checkpointPlan, checkpointPlan[5], false),
    { path: "site/assets/hero/hero-laurel.png", kind: "component-file" },
  ];
  writeJson(caseValue.planPath, caseValue.plan);
  const archive = writeReturnArchive(caseValue, "n14-only.ustar.tar", [
    { path: "site/assets/hero/hero-laurel.png", bytes: "forbidden replacement\n" },
  ]);
  expectRejected("--check", caseValue, archive, "P3 hero-laurel ownership validation failed");
}

if (process.env.P3_ROLE_RETURN_E2E_N14_ONLY === "1") {
  try {
    runN14LaurelOwnershipFixture();
    console.log("p3-role-return N-14 focused E2E PASS");
  } finally {
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
  }
  process.exit(0);
}

try {
  const positive = createCase("positive");
  const actualR3CleanRoomEvidence = JSON.parse(readFileSync(positive.runtime.absolute.clean, "utf8"));
  require(Object.keys(actualR3CleanRoomEvidence.ownerDecisionJ).sort().join(",") === "fileSha256,path"
    && actualR3CleanRoomEvidence.ownerDecisionJ.fileSha256 === shaFile(positive.runtime.absolute.decision),
  "fixture must retain the actual R3 clean-room ownerDecisionJ {path,fileSha256} shape");
  const positiveArchive = writeReturnArchive(positive, "positive.ustar.tar", [
    { path: "site/index.html", bytes: returnedMain },
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" },
  ]);
  const beforeCheckMain = readFileSync(join(positive.targetRoot, "site/index.html"));
  const beforeCheckComponent = readFileSync(join(positive.targetRoot, "site/assets/hero/hero.js"));
  const checked = run("--check", positive, positiveArchive, true);
  const checkReport = JSON.parse(checked.stdout);
  require(checkReport.version === 5 && checkReport.kind === "p3-role-return-validation", "positive check did not emit a v5 return validation report");
  require(checkReport.authority.pairId === positive.pairId && checkReport.authority.condition === "baseline", "positive check lost pair/condition authority binding");
  require(checkReport.authority.frozenScope.changeTargets.length === 3, "positive check lost frozen changeTargets binding");
  require(checkReport.authority.pairPreflights.baseline.preflightId && checkReport.authority.pairPreflights.current.preflightId, "positive check lost both actual pair-preflight bindings");
  require(readFileSync(join(positive.targetRoot, "site/index.html")).equals(beforeCheckMain), "--check changed a shared target");
  require(readFileSync(join(positive.targetRoot, "site/assets/hero/hero.js")).equals(beforeCheckComponent), "--check changed a component target");

  if (process.platform === "win32") {
    const mixedDriveCheck = createCase("windows-mixed-drive-case-check", { mixedDriveCaseCleanRoomWorktreeRoot: true });
    const mixedDriveAuthorization = mixedDriveCheck.runtime.authorization.conditions.find((entry) => entry.condition === mixedDriveCheck.condition);
    require(mixedDriveAuthorization.worktreeRoot === mixedDriveLetterCase(mixedDriveCheck.targetRoot)
      && mixedDriveAuthorization.worktreeRoot !== mixedDriveCheck.targetRoot,
    "Windows mixed-drive check fixture did not preserve a distinct drive-letter case in clean-room authority.");
    const mixedDriveCheckArchive = writeReturnArchive(mixedDriveCheck, "windows-mixed-drive-case-check.ustar.tar", [
      { path: "site/assets/hero/hero.js", bytes: "export const hero = 'mixed-drive-check';\n" },
    ]);
    require(JSON.parse(run("--check", mixedDriveCheck, mixedDriveCheckArchive, true).stdout).applyReady === true,
      "Windows mixed-drive clean-room worktree path did not pass --check.");

    const mixedDriveRecover = createCase("windows-mixed-drive-case-recover");
    const mixedDriveRecoverId = fixtureUuid("windows-mixed-drive-case-recover");
    const mixedDriveJournalDirectory = join(mixedDriveRecover.targetRoot, ".p3-role-return-recovery", `txn-${mixedDriveRecoverId}`);
    mkdirSync(mixedDriveJournalDirectory, { recursive: true });
    writeJson(join(mixedDriveJournalDirectory, "journal.json"), {
      version: 1,
      kind: "p3-role-return-recovery-journal",
      targetRoot: mixedDriveLetterCase(mixedDriveRecover.targetRoot),
      transactionId: mixedDriveRecoverId,
      state: "prepared",
      operations: [{
        relativePath: "site/assets/hero/hero.js",
        existed: true,
        originalSha256: shaFile(join(mixedDriveRecover.targetRoot, "site/assets/hero/hero.js")),
        originalMode: 0o644,
        returnSha256: digest("windows-mixed-drive-recover"),
        stagingName: "replacement-0",
        backupName: "backup-0",
        state: "pending",
      }],
    });
    require(JSON.parse(run("--recover", mixedDriveRecover, null, true).stdout).recovered.length === 1,
      "Windows mixed-drive recovery journal was not recovered.");
    require(!existsSync(join(mixedDriveRecover.targetRoot, ".p3-role-return-recovery")),
      "Windows mixed-drive recovery journal was not cleaned up.");
  }

  // The actual v5 shape permits overlap: every deferred source is a member of
  // sourceFiles.  This positive check would fail if the old no-overlap rule
  // returned, while the following negative rejects an out-of-scope deferred
  // source.
  const responsiveSubset = createCase("responsive-deferred-subset-positive");
  const responsiveSubsetState = JSON.parse(readFileSync(responsiveSubset.runtime.absolute.preflightState, "utf8"));
  require(responsiveSubsetState.responsiveHtml.deferredSourceFiles.every((path) => responsiveSubsetState.responsiveHtml.sourceFiles.includes(path)),
    "fixture must model deferredSourceFiles as a sourceFiles subset");
  const responsiveSubsetArchive = writeReturnArchive(responsiveSubset, "responsive-deferred-subset-positive.ustar.tar", [
    { path: "site/index.html", bytes: returnedMain },
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'responsive-subset';\n" },
  ]);
  require(JSON.parse(run("--check", responsiveSubset, responsiveSubsetArchive, true).stdout).applyReady === true,
    "responsive deferred subset preflight state did not pass");

  const responsiveNonSubset = createCase("responsive-deferred-non-subset-rejected");
  const responsiveNonSubsetState = JSON.parse(readFileSync(responsiveNonSubset.runtime.absolute.preflightState, "utf8"));
  responsiveNonSubsetState.responsiveHtml.deferredSourceFiles = ["site/not-a-source.html"];
  writeJson(responsiveNonSubset.runtime.absolute.preflightState, responsiveNonSubsetState);
  const responsiveNonSubsetArchive = writeReturnArchive(responsiveNonSubset, "responsive-deferred-non-subset-rejected.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "responsive non-subset\n" },
  ]);
  expectRejected("--check", responsiveNonSubset, responsiveNonSubsetArchive, "deferredSourceFiles must be a subset of sourceFiles");

  // A checked packet manifest preserves the coordinator plan's absolute
  // identity-authority references when the plan lives outside the condition
  // worktree.  The runtime helper accepts that one packet-manifest shape,
  // binds its on-disk bytes, and still leaves ordinary plan evidence relative.
  const absolutePacketIdentity = createCase("packet-manifest-absolute-identity");
  const absolutePacket = JSON.parse(readFileSync(absolutePacketIdentity.coordinator.packetPath, "utf8"));
  absolutePacket.identityAuthority.comparisonContract.path = absolutePacketIdentity.runtime.absolute.contract;
  absolutePacket.identityAuthority.ownerDecisionJ.path = absolutePacketIdentity.runtime.absolute.decision;
  writeJson(absolutePacketIdentity.coordinator.packetPath, absolutePacket);
  refreshPlan(absolutePacketIdentity);
  const absolutePacketArchive = writeReturnArchive(absolutePacketIdentity, "packet-manifest-absolute-identity.ustar.tar", [
    { path: "site/index.html", bytes: returnedMain },
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'absolute-packet-identity';\n" },
  ]);
  const absolutePacketCheck = JSON.parse(run("--check", absolutePacketIdentity, absolutePacketArchive, true).stdout);
  require(absolutePacketCheck.applyReady === true && absolutePacketCheck.authority.handoff.packetManifest.sha256 === shaFile(absolutePacketIdentity.coordinator.packetPath),
    "absolute packet-manifest identity authority did not retain its checked binding");

  const ordinaryAbsoluteEvidence = createCase("ordinary-absolute-evidence-rejected");
  ordinaryAbsoluteEvidence.plan.authority.comparisonContract.path = ordinaryAbsoluteEvidence.runtime.absolute.contract;
  writeJson(ordinaryAbsoluteEvidence.planPath, ordinaryAbsoluteEvidence.plan);
  const ordinaryAbsoluteArchive = writeReturnArchive(ordinaryAbsoluteEvidence, "ordinary-absolute-evidence-rejected.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "ordinary absolute evidence\n" },
  ]);
  expectRejected("--check", ordinaryAbsoluteEvidence, ordinaryAbsoluteArchive, "authority.comparisonContract.path must");

  const actualR3DecisionHashMismatch = createCase("actual-r3-decision-hash-mismatch", {
    cleanRoomDecisionFileSha256Override: "0".repeat(64),
  });
  const actualR3DecisionHashMismatchArchive = writeReturnArchive(actualR3DecisionHashMismatch, "actual-r3-decision-hash-mismatch.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "actual R3 decision hash mismatch\n" },
  ]);
  expectRejected("--check", actualR3DecisionHashMismatch, actualR3DecisionHashMismatchArchive, "Approved P-3 clean-room evidence does not match the final P-3 contract authorization");

  // The initial delivery is independently sequence 1 for each condition.  It
  // is not a single global sequence where current inherits baseline's count.
  const currentInitialDelivery = createCase("current-initial-delivery", { condition: "current" });
  const currentInitialArchive = writeReturnArchive(currentInitialDelivery, "current-initial.ustar.tar", [
    { path: "site/index.html", bytes: returnedMain },
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'current-initial';\n" },
  ]);
  const currentInitialCheck = JSON.parse(run("--check", currentInitialDelivery, currentInitialArchive, true).stdout);
  require(currentInitialCheck.authority.condition === "current"
    && currentInitialCheck.authority.handoff.deliverySequence === 1
    && currentInitialCheck.authority.handoff.deliveryProgress.scope === "per-condition",
  "current condition did not begin at its independent per-condition delivery sequence 1");

  const legacyContract = createCase("legacy-v12-contract");
  const legacyContractValue = JSON.parse(readFileSync(legacyContract.runtime.absolute.contract, "utf8"));
  legacyContractValue.version = 12;
  writeJson(legacyContract.runtime.absolute.contract, legacyContractValue);
  legacyContract.plan.authority.comparisonContract.sha256 = shaFile(legacyContract.runtime.absolute.contract);
  writeJson(legacyContract.planPath, legacyContract.plan);
  const legacyContractArchive = writeReturnArchive(legacyContract, "legacy-v12-contract.ustar.tar", [
    { path: "site/index.html", bytes: returnedMain },
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" },
  ]);
  expectRejected("--check", legacyContract, legacyContractArchive, "version 12 and every earlier contract are rejected without migration");

  const legacyGateState = createCase("legacy-v4-gate-state");
  const legacyGateStateValue = JSON.parse(readFileSync(legacyGateState.runtime.absolute.preflightState, "utf8"));
  legacyGateStateValue.version = 4;
  writeJson(legacyGateState.runtime.absolute.preflightState, legacyGateStateValue);
  const legacyGateStateArchive = writeReturnArchive(legacyGateState, "legacy-v4-gate-state.ustar.tar", [
    { path: "site/index.html", bytes: returnedMain },
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" },
  ]);
  expectRejected("--check", legacyGateState, legacyGateStateArchive, "must use v13 figma-gate active state version 5");

  // Retained legacy v4 negative: the removed firstComponentFullCreate runtime
  // field is not silently accepted by the v5 plan schema.
  const legacyFirstComponentFullCreate = createCase("legacy-first-component-full-create");
  legacyFirstComponentFullCreate.plan.component.firstComponentFullCreate = { enabled: true, paths: ["site/assets/hero/hero.js"] };
  writeJson(legacyFirstComponentFullCreate.planPath, legacyFirstComponentFullCreate.plan);
  const legacyFirstComponentArchive = writeReturnArchive(legacyFirstComponentFullCreate, "legacy-first-component-full-create.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" },
  ]);
  expectRejected("--check", legacyFirstComponentFullCreate, legacyFirstComponentArchive, "component has unsupported field(s): firstComponentFullCreate");

  const applied = run("--apply", positive, positiveArchive, true);
  const applyReport = JSON.parse(applied.stdout);
  require(applied.status === 0 && applyReport.application === "recovery-journal-backed-rollback-capable-batch-apply" && applyReport.multiFileAtomic === false, "--apply misreported rollback-capable batch behavior");
  require(readFileSync(join(positive.targetRoot, "site/index.html")).toString("utf8") === returnedMain, "--apply did not replace the permitted shared region");
  require(readFileSync(join(positive.targetRoot, "site/assets/hero/hero.js")).toString("utf8") === "export const hero = 'new';\n", "--apply did not replace the component file");
  expectRejected("--check", positive, positiveArchive, "blocks another return until the prior apply has an actual checkpoint");
  expectRejected("--record-checkpoint", positive, null, "does not contain exactly one new checkpoint result");
  recordActualCheckpoint(positive, "PASS");
  const checkpointed = run("--record-checkpoint", positive, null, true);
  const checkpointReport = JSON.parse(checkpointed.stdout);
  require(checkpointReport.kind === "p3-role-return-checkpoint-recording" && checkpointReport.outcome === "PASS", "checkpoint recording did not bind the actual PASS state");
  expectRejected("--check", positive, positiveArchive, "blocks another return until the prior apply has an actual checkpoint");
  const wrongFeedback = writeSameConditionFeedback(positive, "wrong-feedback.json", checkpointReport);
  const wrongFeedbackValue = JSON.parse(readFileSync(wrongFeedback, "utf8"));
  wrongFeedbackValue.component.attempt = 2;
  writeJson(wrongFeedback, wrongFeedbackValue);
  expectRejected("--record-feedback", positive, wrongFeedback, "does not match the actual checkpoint proof");
  const feedbackPath = writeSameConditionFeedback(positive, "same-condition-feedback.json", checkpointReport);
  const feedbacked = run("--record-feedback", positive, feedbackPath, true);
  const feedbackReport = JSON.parse(feedbacked.stdout);
  require(feedbackReport.kind === "p3-role-return-feedback-recording" && feedbackReport.outcome === "PASS", "same-condition feedback was not recorded");
  expectRejected("--check", positive, positiveArchive, "skips, replays, or reorders");
  prepareDelivery(positive, {
    elementId: "cards",
    componentDecisionCodePath: "site/assets/icons/cards.js#p3:cards",
    sequence: 2,
    attempt: 1,
    deliverySequence: 2,
    allowedChangeTargets: ["site/assets/icons/cards.js"],
    filePolicies: [{ path: "site/assets/icons/cards.js", kind: "component-file" }],
  });
  const cardsArchive = writeReturnArchive(positive, "cards-attempt-1.ustar.tar", [{ path: "site/assets/icons/cards.js", bytes: "export const cards = 'new';\n" }]);
  run("--check", positive, cardsArchive, true);

  const retryOrdering = createCase("retry-ordering");
  const retryArchive = writeReturnArchive(retryOrdering, "retry-attempt-1.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'retry-1';\n" }]);
  run("--apply", retryOrdering, retryArchive, true);
  recordActualCheckpoint(retryOrdering, "FAIL", "VISUAL");
  const retryCheckpoint = JSON.parse(run("--record-checkpoint", retryOrdering, null, true).stdout);
  const retryFeedbackPath = writeSameConditionFeedback(retryOrdering, "retry-feedback.json", retryCheckpoint);
  run("--record-feedback", retryOrdering, retryFeedbackPath, true);
  prepareDelivery(retryOrdering, {
    elementId: "hero",
    componentDecisionCodePath: "site/index.html#p3:hero",
    sequence: 1,
    attempt: 3,
    deliverySequence: 2,
    allowedChangeTargets: ["site/index.html", "site/assets/hero/hero.js"],
    filePolicies: [
      { path: "site/index.html", kind: "shared-delimited-region", startDelimiter, endDelimiter },
      { path: "site/assets/hero/hero.js", kind: "component-file" },
    ],
  });
  const skippedRetryArchive = writeReturnArchive(retryOrdering, "retry-attempt-3.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'retry-3';\n" }]);
  expectRejected("--check", retryOrdering, skippedRetryArchive, "skips, replays, or reorders");
  retryOrdering.plan.component.attempt = 2;
  writeJson(retryOrdering.planPath, retryOrdering.plan);
  const retryAttemptTwoArchive = writeReturnArchive(retryOrdering, "retry-attempt-2.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'retry-2';\n" }]);
  run("--check", retryOrdering, retryAttemptTwoArchive, true);

  const mismatchedActualCheckpoint = createCase("mismatched-actual-checkpoint");
  const mismatchedActualArchive = writeReturnArchive(mismatchedActualCheckpoint, "mismatched-actual-checkpoint.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  run("--apply", mismatchedActualCheckpoint, mismatchedActualArchive, true);
  recordActualCheckpoint(mismatchedActualCheckpoint, "FAIL", "LAYOUT");
  const mismatchedState = JSON.parse(readFileSync(mismatchedActualCheckpoint.runtime.absolute.preflightState, "utf8"));
  mismatchedState.benchmark.attempts.at(-1).attempt = 2;
  writeJson(mismatchedActualCheckpoint.runtime.absolute.preflightState, mismatchedState);
  expectRejected("--record-checkpoint", mismatchedActualCheckpoint, null, "does not match the applied return component and attempt");

  const applyBeforePreflights = createCase("apply-before-both-preflights", { withPairPreflights: false });
  const applyBeforePreflightsArchive = writeReturnArchive(applyBeforePreflights, "apply-before-both-preflights.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  expectRejected("--apply", applyBeforePreflights, applyBeforePreflightsArchive, "baseline pair-preflight ledger must contain exactly one matching record");
  require(readFileSync(join(applyBeforePreflights.targetRoot, "site/assets/hero/hero.js")).toString("utf8") === "export const hero = 'old';\n", "--apply before both pair-preflights changed the actual target");

  const prematureLaterComponent = createCase("premature-later-component");
  const prematureLaterArchive = writeReturnArchive(prematureLaterComponent, "premature-later-component.ustar.tar", [{ path: "site/assets/icons/cards.js", bytes: "export const cards = 'new';\n" }]);
  expectRejected("--check", prematureLaterComponent, prematureLaterArchive, "outside component.allowedChangeTargets");
  require(readFileSync(join(prematureLaterComponent.targetRoot, "site/assets/icons/cards.js")).toString("utf8") === "export const cards = 'old';\n", "first component return changed a later component target");

  const decisionCodePathMismatch = createCase("decision-code-path-mismatch");
  decisionCodePathMismatch.plan.component.componentDecisionCodePath = "site/assets/icons/cards.js#p3:cards";
  writeJson(decisionCodePathMismatch.planPath, decisionCodePathMismatch.plan);
  const decisionCodePathArchive = writeReturnArchive(decisionCodePathMismatch, "decision-code-path-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  expectRejected("--check", decisionCodePathMismatch, decisionCodePathArchive, "componentDecisionCodePath does not match the coordinator return plan");

  const protocolScopeMismatch = createCase("protocol-scope-mismatch");
  const protocolScope = JSON.parse(readFileSync(protocolScopeMismatch.coordinator.protocolPath, "utf8"));
  protocolScope.implementationLoop.componentReturnScopes[0].allowedChangeTargets = ["site/assets/hero/hero.js"];
  writeJson(protocolScopeMismatch.coordinator.protocolPaths.baseline, protocolScope);
  writeJson(protocolScopeMismatch.coordinator.protocolPaths.current, protocolScope);
  const protocolScopeRegistry = JSON.parse(readFileSync(protocolScopeMismatch.coordinator.registryPath, "utf8"));
  protocolScopeRegistry.protocol.sha256 = shaFile(protocolScopeMismatch.coordinator.protocolPath);
  writeJson(protocolScopeMismatch.coordinator.registryPath, protocolScopeRegistry);
  refreshPlan(protocolScopeMismatch);
  const protocolScopeArchive = writeReturnArchive(protocolScopeMismatch, "protocol-scope-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  expectRejected("--check", protocolScopeMismatch, protocolScopeArchive, "attemptOneCreatePaths has a path outside allowedChangeTargets");

  // N-15: baseline/current handoff protocol bytes must be identical.
  const pairProtocolMismatch = createCase("pair-protocol-byte-mismatch");
  const peerProtocolPath = pairProtocolMismatch.coordinator.protocolPaths.current;
  const peerProtocol = JSON.parse(readFileSync(peerProtocolPath, "utf8"));
  peerProtocol.aBIdentical = false;
  writeJson(peerProtocolPath, peerProtocol);
  refreshPlan(pairProtocolMismatch);
  const pairProtocolArchive = writeReturnArchive(pairProtocolMismatch, "pair-protocol-byte-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  expectRejected("--check", pairProtocolMismatch, pairProtocolArchive, "Coordinator A/B handoff protocol copies must be byte-identical");

  const manifestProtocolMismatch = createCase("manifest-protocol-mismatch");
  const manifestProtocolArchive = writeReturnArchive(manifestProtocolMismatch, "manifest-protocol-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }], {
    manifestOverrides: { handoffProtocolSha256: "0".repeat(64) },
  });
  expectRejected("--check", manifestProtocolMismatch, manifestProtocolArchive, "handoffProtocolSha256 does not match the coordinator handoff protocol");

  const firstCreate = createCase("attempt-one-create", {
    frozenTargets: ["site/assets/brand/brand.css"],
    checkpointPlan: ["hero"],
    allowedChangeTargets: ["site/assets/brand/brand.css"],
    attemptOneCreatePaths: ["site/assets/brand/brand.css"],
    derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/brand/brand.css"]),
    filePolicies: [{ path: "site/assets/brand/brand.css", kind: "component-file" }],
  });
  const firstCreateArchive = writeReturnArchive(firstCreate, "attempt-one-create.ustar.tar", [{ path: "site/assets/brand/brand.css", bytes: ".hero { color: red; }\n" }]);
  run("--apply", firstCreate, firstCreateArchive, true);
  require(readFileSync(join(firstCreate.targetRoot, "site/assets/brand/brand.css")).toString("utf8") === ".hero { color: red; }\n", "attempt-one target creation was not applied");

  // N-1: a plan cannot create outside its own allowlist.
  const n1OutsideOwnAllowlist = createCase("n1-outside-own-allowlist", {
    frozenTargets: ["site/assets/brand/brand.css", "site/assets/hero/hero.css"],
    checkpointPlan: ["hero", "cards"],
    allowedChangeTargets: ["site/assets/brand/brand.css"],
    attemptOneCreatePaths: ["site/assets/hero/hero.css"],
    derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/hero/hero.css"]),
    filePolicies: [{ path: "site/assets/brand/brand.css", kind: "component-file" }],
    protocolComponentReturnScopes: [
      {
        elementId: "hero",
        sequence: 1,
        componentDecisionCodePath: "site/index.html#p3:hero",
        allowedChangeTargets: ["site/assets/brand/brand.css"],
        attemptOneCreatePaths: ["site/assets/hero/hero.css"],
        derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/hero/hero.css"]),
      },
      {
        elementId: "cards",
        sequence: 2,
        componentDecisionCodePath: "site/assets/icons/cards.js#p3:cards",
        allowedChangeTargets: ["site/assets/hero/hero.css"],
        attemptOneCreatePaths: ["site/assets/brand/brand.css"],
        derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/brand/brand.css"]),
      },
    ],
  });
  const n1Archive = writeReturnArchive(n1OutsideOwnAllowlist, "n1.ustar.tar", [{ path: "site/assets/brand/brand.css", bytes: "n1\n" }]);
  expectRejected("--check", n1OutsideOwnAllowlist, n1Archive, "attemptOneCreatePaths has a path outside allowedChangeTargets");

  // N-2: a retry cannot create a missing target even when the plan declares it.
  const n2RetryCreate = createCase("n2-retry-create", {
    frozenTargets: ["site/assets/brand/brand.css"],
    checkpointPlan: ["hero"],
    allowedChangeTargets: ["site/assets/brand/brand.css"],
    attemptOneCreatePaths: ["site/assets/brand/brand.css"],
    derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/brand/brand.css"]),
    filePolicies: [{ path: "site/assets/brand/brand.css", kind: "component-file" }],
    prepareTarget(targetRoot) { mkdirSync(join(targetRoot, "site", "assets", "brand"), { recursive: true }); },
  });
  n2RetryCreate.plan.component.attempt = 2;
  writeJson(n2RetryCreate.planPath, n2RetryCreate.plan);
  const n2Archive = writeReturnArchive(n2RetryCreate, "n2.ustar.tar", [{ path: "site/assets/brand/brand.css", bytes: "n2\n" }]);
  expectRejected("--check", n2RetryCreate, n2Archive, "does not exist and is not explicitly permitted for attempt-one creation");

  // N-3/N-4: global protocol partition rejects a creator reassignment or duplicate creator.
  const n3RecreatedTarget = createCase("n3-recreated-target", {
    frozenTargets: ["site/assets/brand/brand.css", "site/assets/hero/hero.css"],
    checkpointPlan: ["hero", "cards"],
    allowedChangeTargets: ["site/assets/brand/brand.css"],
    attemptOneCreatePaths: ["site/assets/brand/brand.css"],
    derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/brand/brand.css"]),
    filePolicies: [{ path: "site/assets/brand/brand.css", kind: "component-file" }],
    protocolComponentReturnScopes: [
      {
        elementId: "hero",
        sequence: 1,
        componentDecisionCodePath: "site/index.html#p3:hero",
        allowedChangeTargets: ["site/assets/brand/brand.css"],
        attemptOneCreatePaths: ["site/assets/brand/brand.css"],
        derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/brand/brand.css"]),
      },
      {
        elementId: "cards",
        sequence: 2,
        componentDecisionCodePath: "site/assets/icons/cards.js#p3:cards",
        allowedChangeTargets: ["site/assets/hero/hero.css", "site/assets/brand/brand.css"],
        attemptOneCreatePaths: ["site/assets/hero/hero.css", "site/assets/brand/brand.css"],
        derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/hero/hero.css", "site/assets/brand/brand.css"]),
      },
    ],
  });
  const n3Archive = writeReturnArchive(n3RecreatedTarget, "n3.ustar.tar", [{ path: "site/assets/brand/brand.css", bytes: "n3\n" }]);
  expectRejected("--check", n3RecreatedTarget, n3Archive, "assigns a target to more than one sequence");

  // N-4: duplicate creation paths inside one sequence are rejected.
  const n4DuplicateWithinSequence = createCase("n4-duplicate-within-sequence");
  n4DuplicateWithinSequence.plan.component.attemptOneCreatePaths = ["site/index.html", "site/index.html"];
  n4DuplicateWithinSequence.plan.component.derivedBootstrapDirectories = fixtureBootstrapDirectories(["site/index.html"]);
  writeJson(n4DuplicateWithinSequence.planPath, n4DuplicateWithinSequence.plan);
  const n4Archive = writeReturnArchive(n4DuplicateWithinSequence, "n4.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "n4\n" }]);
  expectRejected("--check", n4DuplicateWithinSequence, n4Archive, "component.attemptOneCreatePaths must not contain duplicate paths");

  // N-5: derived bootstrap directories may never escape site/.
  const n5OutsideSite = createCase("n5-bootstrap-outside-site", {
    frozenTargets: ["other/outside.js"],
    checkpointPlan: ["hero"],
    allowedChangeTargets: ["other/outside.js"],
    attemptOneCreatePaths: ["other/outside.js"],
    derivedBootstrapDirectories: ["other"],
    filePolicies: [{ path: "other/outside.js", kind: "component-file" }],
  });
  const n5Archive = writeReturnArchive(n5OutsideSite, "n5.ustar.tar", [{ path: "other/outside.js", bytes: "n5\n" }]);
  expectRejected("--check", n5OutsideSite, n5Archive, "may create only paths below site/");

  // N-6/N-7: protocol-plan creation mismatch and incomplete global partition fail.
  const n6ProtocolPlanMismatch = createCase("n6-protocol-plan-mismatch");
  n6ProtocolPlanMismatch.plan.component.attemptOneCreatePaths = ["site/assets/hero/hero.js"];
  n6ProtocolPlanMismatch.plan.component.derivedBootstrapDirectories = fixtureBootstrapDirectories(["site/assets/hero/hero.js"]);
  n6ProtocolPlanMismatch.plan.component.filePolicies = [
    fixtureSharedPolicy("site/index.html", n6ProtocolPlanMismatch.checkpointPlan, "hero", false),
    { path: "site/assets/hero/hero.js", kind: "component-file" },
  ];
  writeJson(n6ProtocolPlanMismatch.planPath, n6ProtocolPlanMismatch.plan);
  const n6Archive = writeReturnArchive(n6ProtocolPlanMismatch, "n6.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "n6\n" }]);
  expectRejected("--check", n6ProtocolPlanMismatch, n6Archive, "component.attemptOneCreatePaths must exactly match");
  const n7IncompletePartition = createCase("n7-incomplete-partition");
  n7IncompletePartition.protocolComponentReturnScopes[1].attemptOneCreatePaths = [];
  n7IncompletePartition.protocolComponentReturnScopes[1].derivedBootstrapDirectories = [];
  n7IncompletePartition.coordinator = writeCoordinatorArtifacts(n7IncompletePartition);
  refreshPlan(n7IncompletePartition);
  const n7Archive = writeReturnArchive(n7IncompletePartition, "n7.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "n7\n" }]);
  expectRejected("--check", n7IncompletePartition, n7Archive, "must form an exactly-once partition");

  // N-14: use the real six-sequence P-3 allocation.  Sequence 3 creates and
  // owns hero-laurel.png; sequence 6 improperly adds it to its matching plan
  // and protocol allowlists, then attempts a component-file replacement.
  const n14CheckpointPlan = [
    "open-service-top-hero",
    "open-service-header",
    "open-service-hero-visual",
    "open-service-hero-copy",
    "open-service-hero-actions",
    "open-service-hero-stats",
  ];
  const n14FrozenTargets = [
    "site/index.html",
    "site/styles.css",
    "site/assets/brand/open-service-wordmark.png",
    "site/assets/brand/open-mark-ellipse.svg",
    "site/assets/brand/open-mark-vector-1.svg",
    "site/assets/brand/open-mark-vector-2.svg",
    "site/assets/brand/open-mark-vector-3.svg",
    "site/assets/brand/open-mark-vector-4.svg",
    "site/assets/brand/open-mark-vector-5.svg",
    "site/assets/brand/open-mark-vector-6.svg",
    "site/assets/icons/header-arrow-download.svg",
    "site/assets/icons/header-arrow-contact.svg",
    "site/assets/hero/hero-photo.jpg",
    "site/assets/hero/hero-graphic.png",
    "site/assets/hero/hero-contact.png",
    "site/assets/hero/hero-laurel.png",
    "site/assets/hero/hero-vector-1.svg",
    "site/assets/hero/hero-vector-2.svg",
    "site/assets/hero/hero-vector-3.svg",
    "site/assets/hero/hero-mask.svg",
    "site/assets/hero/hero-shape-1.svg",
    "site/assets/hero/hero-shape-2.svg",
    "site/assets/hero/hero-shape-3.svg",
    "site/assets/hero/hero-shape-4.svg",
    "site/assets/icons/hero-arrow-download-pc.svg",
    "site/assets/icons/hero-arrow-contact-pc.svg",
    "site/assets/icons/hero-arrow-download-sp.svg",
    "site/assets/icons/hero-arrow-contact-sp.svg",
  ];
  const n14SharedTargets = ["site/index.html", "site/styles.css"];
  const n14ProtocolComponentReturnScopes = [
    {
      elementId: "open-service-top-hero",
      sequence: 1,
      componentDecisionCodePath: "site/index.html#p3:open-service-top-hero",
      allowedChangeTargets: n14SharedTargets,
      attemptOneCreatePaths: n14SharedTargets,
      derivedBootstrapDirectories: fixtureBootstrapDirectories(n14SharedTargets),
    },
    {
      elementId: "open-service-header",
      sequence: 2,
      componentDecisionCodePath: "site/index.html#p3:open-service-header",
      allowedChangeTargets: [
        ...n14SharedTargets,
        "site/assets/brand/open-service-wordmark.png",
        "site/assets/brand/open-mark-ellipse.svg",
        "site/assets/brand/open-mark-vector-1.svg",
        "site/assets/brand/open-mark-vector-2.svg",
        "site/assets/brand/open-mark-vector-3.svg",
        "site/assets/brand/open-mark-vector-4.svg",
        "site/assets/brand/open-mark-vector-5.svg",
        "site/assets/brand/open-mark-vector-6.svg",
        "site/assets/icons/header-arrow-download.svg",
        "site/assets/icons/header-arrow-contact.svg",
      ],
      attemptOneCreatePaths: [
        "site/assets/brand/open-service-wordmark.png",
        "site/assets/brand/open-mark-ellipse.svg",
        "site/assets/brand/open-mark-vector-1.svg",
        "site/assets/brand/open-mark-vector-2.svg",
        "site/assets/brand/open-mark-vector-3.svg",
        "site/assets/brand/open-mark-vector-4.svg",
        "site/assets/brand/open-mark-vector-5.svg",
        "site/assets/brand/open-mark-vector-6.svg",
        "site/assets/icons/header-arrow-download.svg",
        "site/assets/icons/header-arrow-contact.svg",
      ],
      derivedBootstrapDirectories: fixtureBootstrapDirectories([
        "site/assets/brand/open-service-wordmark.png",
        "site/assets/brand/open-mark-ellipse.svg",
        "site/assets/brand/open-mark-vector-1.svg",
        "site/assets/brand/open-mark-vector-2.svg",
        "site/assets/brand/open-mark-vector-3.svg",
        "site/assets/brand/open-mark-vector-4.svg",
        "site/assets/brand/open-mark-vector-5.svg",
        "site/assets/brand/open-mark-vector-6.svg",
        "site/assets/icons/header-arrow-download.svg",
        "site/assets/icons/header-arrow-contact.svg",
      ]),
    },
    {
      elementId: "open-service-hero-visual",
      sequence: 3,
      componentDecisionCodePath: "site/index.html#p3:open-service-hero-visual",
      allowedChangeTargets: [
        ...n14SharedTargets,
        "site/assets/hero/hero-photo.jpg",
        "site/assets/hero/hero-graphic.png",
        "site/assets/hero/hero-contact.png",
        "site/assets/hero/hero-laurel.png",
        "site/assets/hero/hero-vector-1.svg",
        "site/assets/hero/hero-vector-2.svg",
        "site/assets/hero/hero-vector-3.svg",
        "site/assets/hero/hero-mask.svg",
        "site/assets/hero/hero-shape-1.svg",
        "site/assets/hero/hero-shape-2.svg",
        "site/assets/hero/hero-shape-3.svg",
        "site/assets/hero/hero-shape-4.svg",
      ],
      attemptOneCreatePaths: [
        "site/assets/hero/hero-photo.jpg",
        "site/assets/hero/hero-graphic.png",
        "site/assets/hero/hero-contact.png",
        "site/assets/hero/hero-laurel.png",
        "site/assets/hero/hero-vector-1.svg",
        "site/assets/hero/hero-vector-2.svg",
        "site/assets/hero/hero-vector-3.svg",
        "site/assets/hero/hero-mask.svg",
        "site/assets/hero/hero-shape-1.svg",
        "site/assets/hero/hero-shape-2.svg",
        "site/assets/hero/hero-shape-3.svg",
        "site/assets/hero/hero-shape-4.svg",
      ],
      derivedBootstrapDirectories: fixtureBootstrapDirectories([
        "site/assets/hero/hero-photo.jpg",
        "site/assets/hero/hero-graphic.png",
        "site/assets/hero/hero-contact.png",
        "site/assets/hero/hero-laurel.png",
        "site/assets/hero/hero-vector-1.svg",
        "site/assets/hero/hero-vector-2.svg",
        "site/assets/hero/hero-vector-3.svg",
        "site/assets/hero/hero-mask.svg",
        "site/assets/hero/hero-shape-1.svg",
        "site/assets/hero/hero-shape-2.svg",
        "site/assets/hero/hero-shape-3.svg",
        "site/assets/hero/hero-shape-4.svg",
      ]),
    },
    {
      elementId: "open-service-hero-copy",
      sequence: 4,
      componentDecisionCodePath: "site/index.html#p3:open-service-hero-copy",
      allowedChangeTargets: n14SharedTargets,
      attemptOneCreatePaths: [],
      derivedBootstrapDirectories: [],
    },
    {
      elementId: "open-service-hero-actions",
      sequence: 5,
      componentDecisionCodePath: "site/index.html#p3:open-service-hero-actions",
      allowedChangeTargets: [
        ...n14SharedTargets,
        "site/assets/icons/hero-arrow-download-pc.svg",
        "site/assets/icons/hero-arrow-contact-pc.svg",
        "site/assets/icons/hero-arrow-download-sp.svg",
        "site/assets/icons/hero-arrow-contact-sp.svg",
      ],
      attemptOneCreatePaths: [
        "site/assets/icons/hero-arrow-download-pc.svg",
        "site/assets/icons/hero-arrow-contact-pc.svg",
        "site/assets/icons/hero-arrow-download-sp.svg",
        "site/assets/icons/hero-arrow-contact-sp.svg",
      ],
      derivedBootstrapDirectories: fixtureBootstrapDirectories([
        "site/assets/icons/hero-arrow-download-pc.svg",
        "site/assets/icons/hero-arrow-contact-pc.svg",
        "site/assets/icons/hero-arrow-download-sp.svg",
        "site/assets/icons/hero-arrow-contact-sp.svg",
      ]),
    },
    {
      elementId: "open-service-hero-stats",
      sequence: 6,
      componentDecisionCodePath: "site/index.html#p3:open-service-hero-stats",
      allowedChangeTargets: [...n14SharedTargets, "site/assets/hero/hero-laurel.png"],
      attemptOneCreatePaths: [],
      derivedBootstrapDirectories: [],
    },
  ];
  const n14LaurelReadOnly = createCase("n14-laurel-read-only", {
    frozenTargets: n14FrozenTargets,
    checkpointPlan: n14CheckpointPlan,
    allowedChangeTargets: n14SharedTargets,
    attemptOneCreatePaths: n14SharedTargets,
    derivedBootstrapDirectories: fixtureBootstrapDirectories(n14SharedTargets),
    filePolicies: [
      fixtureSharedPolicy("site/index.html", n14CheckpointPlan, "open-service-top-hero", true),
      fixtureSharedPolicy("site/styles.css", n14CheckpointPlan, "open-service-top-hero", true),
    ],
    componentDecisionCodePath: "site/index.html#p3:open-service-top-hero",
    protocolComponentReturnScopes: n14ProtocolComponentReturnScopes,
    prepareTarget(targetRoot) { write(join(targetRoot, "site/assets/hero/hero-laurel.png"), "old laurel\n"); },
  });
  n14LaurelReadOnly.plan.component.elementId = "open-service-hero-stats";
  n14LaurelReadOnly.plan.component.componentDecisionCodePath = "site/index.html#p3:open-service-hero-stats";
  n14LaurelReadOnly.plan.component.sequence = 6;
  n14LaurelReadOnly.plan.component.attempt = 1;
  n14LaurelReadOnly.plan.component.allowedChangeTargets = [...n14SharedTargets, "site/assets/hero/hero-laurel.png"];
  n14LaurelReadOnly.plan.component.attemptOneCreatePaths = [];
  n14LaurelReadOnly.plan.component.derivedBootstrapDirectories = [];
  n14LaurelReadOnly.plan.component.filePolicies = [
    fixtureSharedPolicy("site/index.html", n14CheckpointPlan, "open-service-hero-stats", false),
    fixtureSharedPolicy("site/styles.css", n14CheckpointPlan, "open-service-hero-stats", false),
    { path: "site/assets/hero/hero-laurel.png", kind: "component-file" },
  ];
  writeJson(n14LaurelReadOnly.planPath, n14LaurelReadOnly.plan);
  const n14Archive = writeReturnArchive(n14LaurelReadOnly, "n14.ustar.tar", [{ path: "site/assets/hero/hero-laurel.png", bytes: "forbidden replacement\n" }]);
  expectRejected("--check", n14LaurelReadOnly, n14Archive, "P3 hero-laurel ownership validation failed");

  // N-8: a non-empty directory asserted as transaction-created is never removed.
  const n8NonEmptyDirectory = createCase("n8-nonempty-bootstrap-directory");
  const n8Id = fixtureUuid("n8-nonempty-bootstrap-directory");
  const n8JournalDirectory = join(n8NonEmptyDirectory.targetRoot, ".p3-role-return-recovery", `txn-${n8Id}`);
  mkdirSync(n8JournalDirectory, { recursive: true });
  write(join(n8NonEmptyDirectory.targetRoot, "site", "unexpected.txt"), "must remain\n");
  writeJson(join(n8JournalDirectory, "journal.json"), {
    version: 2,
    kind: "p3-role-return-recovery-journal",
    targetRoot: n8NonEmptyDirectory.targetRoot,
    transactionId: n8Id,
    state: "prepared",
    operations: [{
      relativePath: "site/assets/hero/hero.js",
      existed: true,
      originalSha256: shaFile(join(n8NonEmptyDirectory.targetRoot, "site/assets/hero/hero.js")),
      originalMode: 0o644,
      returnSha256: digest("n8-return"),
      stagingName: "replacement-0",
      backupName: "backup-0",
      state: "pending",
    }],
    directories: [{ relativePath: "site", existedAtIntent: false, createdByThisTransaction: true, state: "created" }],
  });
  expectRejected("--recover", n8NonEmptyDirectory, null, "refused to remove a non-empty created bootstrap directory");
  require(existsSync(join(n8NonEmptyDirectory.targetRoot, "site", "unexpected.txt")), "N-8 recovery removed a non-empty bootstrap directory");

  // N-9: a directory not listed by a journal is not touched by recovery.
  const n9UnknownDirectory = createCase("n9-unknown-directory");
  const n9Path = join(n9UnknownDirectory.targetRoot, "site", "assets", "unknown");
  mkdirSync(n9Path, { recursive: true });
  run("--recover", n9UnknownDirectory, null, true);
  require(existsSync(n9Path), "N-9 recovery removed a directory that was not present in a recovery journal");

  // N-10: crash after mkdir but before the created-state write recovers the empty intended directory.
  const n10MkdirCrash = createCase("n10-mkdir-crash", {
    frozenTargets: ["site/assets/brand/new.css"],
    checkpointPlan: ["hero"],
    allowedChangeTargets: ["site/assets/brand/new.css"],
    attemptOneCreatePaths: ["site/assets/brand/new.css"],
    derivedBootstrapDirectories: fixtureBootstrapDirectories(["site/assets/brand/new.css"]),
    filePolicies: [{ path: "site/assets/brand/new.css", kind: "component-file" }],
  });
  const n10Archive = writeReturnArchive(n10MkdirCrash, "n10.ustar.tar", [{ path: "site/assets/brand/new.css", bytes: "n10\n" }]);
  const n10Crash = run("--apply", n10MkdirCrash, n10Archive, false, { env: { NODE_ENV: "test", P3_ROLE_RETURN_TEST_CRASH_AFTER_MKDIR: "1" } });
  require(n10Crash.status === 87, `N-10 expected test-only mkdir interruption status 87, got ${n10Crash.status}`);
  const n10Recovery = run("--recover", n10MkdirCrash, null, true);
  require(JSON.parse(n10Recovery.stdout).recovered.length === 1, "N-10 recover did not process the interrupted transaction");
  require(!existsSync(join(n10MkdirCrash.targetRoot, "site", "assets", "brand")), "N-10 recover did not remove the empty transaction-intended bootstrap directory");

  // N-11: v1 recovery journals remain readable and recoverable under v2 code.
  const n11V1Journal = createCase("n11-v1-journal");
  const n11Id = fixtureUuid("n11-v1-journal");
  const n11JournalDirectory = join(n11V1Journal.targetRoot, ".p3-role-return-recovery", `txn-${n11Id}`);
  mkdirSync(n11JournalDirectory, { recursive: true });
  writeJson(join(n11JournalDirectory, "journal.json"), {
    version: 1,
    kind: "p3-role-return-recovery-journal",
    targetRoot: n11V1Journal.targetRoot,
    transactionId: n11Id,
    state: "prepared",
    operations: [{
      relativePath: "site/assets/hero/hero.js",
      existed: true,
      originalSha256: shaFile(join(n11V1Journal.targetRoot, "site/assets/hero/hero.js")),
      originalMode: 0o644,
      returnSha256: digest("n11-return"),
      stagingName: "replacement-0",
      backupName: "backup-0",
      state: "pending",
    }],
  });
  run("--recover", n11V1Journal, null, true);
  require(!existsSync(join(n11V1Journal.targetRoot, ".p3-role-return-recovery")), "N-11 v1 recovery journal was not cleaned up");

  // N-12: a v2 journal missing mandatory directory state fails closed.
  const n12IncompleteV2Journal = createCase("n12-incomplete-v2-journal");
  const n12Id = fixtureUuid("n12-incomplete-v2-journal");
  const n12JournalDirectory = join(n12IncompleteV2Journal.targetRoot, ".p3-role-return-recovery", `txn-${n12Id}`);
  mkdirSync(n12JournalDirectory, { recursive: true });
  writeJson(join(n12JournalDirectory, "journal.json"), {
    version: 2,
    kind: "p3-role-return-recovery-journal",
    targetRoot: n12IncompleteV2Journal.targetRoot,
    transactionId: n12Id,
    state: "prepared",
    operations: [{
      relativePath: "site/assets/hero/hero.js",
      existed: true,
      originalSha256: shaFile(join(n12IncompleteV2Journal.targetRoot, "site/assets/hero/hero.js")),
      originalMode: 0o644,
      returnSha256: digest("n12-return"),
      stagingName: "replacement-0",
      backupName: "backup-0",
      state: "pending",
    }],
  });
  expectRejected("--recover", n12IncompleteV2Journal, null, "recovery journal.directories must be an array");

  const traversal = createCase("archive-traversal");
  const traversalArchive = join(traversal.root, "traversal.ustar.tar");
  writeUstar(traversalArchive, [{ path: "../escape.txt", bytes: "escape\n" }]);
  expectRejected("--check", traversal, traversalArchive, "normalized relative path without '..'");

  const symlink = createCase("archive-symlink");
  const symlinkArchive = join(symlink.root, "symlink.ustar.tar");
  writeUstar(symlinkArchive, [{ path: "link.txt", bytes: "", type: "2", linkname: "target.txt" }]);
  expectRejected("--check", symlink, symlinkArchive, "forbidden symlink entry");

  const special = createCase("archive-special");
  const specialArchive = join(special.root, "special.ustar.tar");
  writeUstar(specialArchive, [{ path: "device.txt", bytes: "", type: "3" }]);
  expectRejected("--check", special, specialArchive, "forbidden special entry");

  const undeclared = createCase("undeclared");
  const undeclaredArchive = writeReturnArchive(undeclared, "undeclared.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }], {
    extraEntries: [{ path: "src/extra.js", bytes: "export const extra = true;\n" }],
  });
  expectRejected("--check", undeclared, undeclaredArchive, "contains an undeclared entry");

  const outsideAllowed = createCase("outside-allowed");
  const outsideAllowedArchive = writeReturnArchive(outsideAllowed, "outside-allowed.ustar.tar", [{ path: "other/outside.js", bytes: "export const outside = true;\n" }]);
  expectRejected("--check", outsideAllowed, outsideAllowedArchive, "outside component.allowedChangeTargets");

  const duplicate = createCase("duplicate");
  const duplicateArchive = writeReturnArchive(duplicate, "duplicate.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }], {
    extraEntries: [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'duplicate';\n" }],
  });
  expectRejected("--check", duplicate, duplicateArchive, "contains a duplicate entry");

  const hashMismatch = createCase("hash-mismatch");
  const hashMismatchArchive = writeReturnArchive(hashMismatch, "hash-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n", sha256: "0".repeat(64) }]);
  expectRejected("--check", hashMismatch, hashMismatchArchive, "file SHA-256 mismatch");

  const inputMismatch = createCase("input-mismatch");
  const inputMismatchArchive = writeReturnArchive(inputMismatch, "input-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }], {
    manifestOverrides: { inputStagingSha256: "0".repeat(64) },
  });
  expectRejected("--check", inputMismatch, inputMismatchArchive, "inputStagingSha256 does not match");

  const stagingMutation = createCase("staging-mutation");
  const stagingMutationArchive = writeReturnArchive(stagingMutation, "staging-mutation.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  write(join(stagingMutation.inputStaging, "assignment.txt"), "changed after the coordinator freeze\n");
  expectRejected("--check", stagingMutation, stagingMutationArchive, "does not match the current inputStaging tree");

  const outsideRegion = createCase("outside-region");
  const changedOutside = returnedMain.replace("<!doctype html>", "<!doctype CHANGED>");
  const outsideRegionArchive = writeReturnArchive(outsideRegion, "outside-region.ustar.tar", [{ path: "site/index.html", bytes: changedOutside }]);
  expectRejected("--check", outsideRegion, outsideRegionArchive, "changes bytes outside the declared component region");

  const partialApply = createCase("partial-apply");
  const partialBeforeComponent = readFileSync(join(partialApply.targetRoot, "site/assets/hero/hero.js"));
  const partialBeforeMain = readFileSync(join(partialApply.targetRoot, "site/index.html"));
  const partialArchive = writeReturnArchive(partialApply, "partial-apply.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" },
    { path: "site/index.html", bytes: changedOutside },
  ]);
  expectRejected("--apply", partialApply, partialArchive, "changes bytes outside the declared component region");
  require(readFileSync(join(partialApply.targetRoot, "site/assets/hero/hero.js")).equals(partialBeforeComponent), "rejected multi-file --apply partially changed the first target");
  require(readFileSync(join(partialApply.targetRoot, "site/index.html")).equals(partialBeforeMain), "rejected multi-file --apply changed the invalid target");

  const sequenceMismatch = createCase("sequence-mismatch");
  const sequenceArchive = writeReturnArchive(sequenceMismatch, "sequence-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }], {
    manifestOverrides: { component: { elementId: "hero", componentDecisionCodePath: sequenceMismatch.componentDecisionCodePath, sequence: 2, attempt: 1 } },
  });
  expectRejected("--check", sequenceMismatch, sequenceArchive, "component.sequence does not match");

  const attemptMismatch = createCase("attempt-mismatch");
  const attemptArchive = writeReturnArchive(attemptMismatch, "attempt-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }], {
    manifestOverrides: { component: { elementId: "hero", componentDecisionCodePath: attemptMismatch.componentDecisionCodePath, sequence: 1, attempt: 2 } },
  });
  expectRejected("--check", attemptMismatch, attemptArchive, "component.attempt does not match");

  const checkpointMismatch = createCase("checkpoint-mismatch");
  checkpointMismatch.plan.component.elementId = "cards";
  writeJson(checkpointMismatch.planPath, checkpointMismatch.plan);
  const checkpointArchive = writeReturnArchive(checkpointMismatch, "checkpoint-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  expectRejected("--check", checkpointMismatch, checkpointArchive, "component sequence and elementId must match the frozen checkpointPlan");

  const scopeMismatch = createCase("scope-mismatch");
  scopeMismatch.allowedChangeTargets = ["other/outside.js"];
  scopeMismatch.filePolicies = [{ path: "other/outside.js", kind: "component-file" }];
  refreshPlan(scopeMismatch);
  const scopeArchive = writeReturnArchive(scopeMismatch, "scope-mismatch.ustar.tar", [{ path: "other/outside.js", bytes: "export const outside = true;\n" }]);
  expectRejected("--check", scopeMismatch, scopeArchive, "outside final frozen changeTargets");

  const contractMutation = createCase("contract-mutation");
  const contractMutationArchive = writeReturnArchive(contractMutation, "contract-mutation.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  const contractValue = JSON.parse(readFileSync(contractMutation.runtime.absolute.contract, "utf8"));
  contractValue.pairId = "p3-other-pair";
  writeJson(contractMutation.runtime.absolute.contract, contractValue);
  expectRejected("--check", contractMutation, contractMutationArchive, "SHA-256 does not match");

  const conditionMismatch = createCase("condition-mismatch");
  const conditionArchive = writeReturnArchive(conditionMismatch, "condition-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  conditionMismatch.plan.authority.condition = "current";
  writeJson(conditionMismatch.planPath, conditionMismatch.plan);
  expectRejected("--check", conditionMismatch, conditionArchive, "comparison contract.condition does not match");

  const handoffMismatch = createCase("handoff-mismatch");
  const handoffArchive = writeReturnArchive(handoffMismatch, "handoff-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  const currentReplay = createCase("handoff-current-replay", { condition: "current" });
  expectRejected("--check", currentReplay, handoffArchive, "handoffId does not match");

  const registryMismatch = createCase("registry-mismatch");
  const registryArchive = writeReturnArchive(registryMismatch, "registry-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  const registry = JSON.parse(readFileSync(registryMismatch.coordinator.registryPath, "utf8"));
  registry.recipientPackets[0].coordinatorConditionBinding = "current";
  writeJson(registryMismatch.coordinator.registryPath, registry);
  refreshPlan(registryMismatch);
  expectRejected("--check", registryMismatch, registryArchive, "recipient does not match return-plan condition");

  // A runtime registry must be the finalized, owner-approved v2 record.  Each
  // mutation refreshes the plan hash so this proves record-state validation,
  // rather than only stale reference rejection.
  const legacyRegistry = createCase("legacy-registry");
  const legacyRegistryArchive = writeReturnArchive(legacyRegistry, "legacy-registry.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "legacy registry\n" }]);
  const legacyRegistryValue = JSON.parse(readFileSync(legacyRegistry.coordinator.registryPath, "utf8"));
  legacyRegistryValue.schema = "p3-role-handoff-registry/v1";
  writeJson(legacyRegistry.coordinator.registryPath, legacyRegistryValue);
  refreshPlan(legacyRegistry);
  expectRejected("--check", legacyRegistry, legacyRegistryArchive, "owner-approved finalized coordinator-only p3-role-handoff-registry/v2 record");

  const draftRegistry = createCase("draft-registry");
  const draftRegistryArchive = writeReturnArchive(draftRegistry, "draft-registry.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "draft registry\n" }]);
  const draftRegistryValue = JSON.parse(readFileSync(draftRegistry.coordinator.registryPath, "utf8"));
  draftRegistryValue.recordState = "draft";
  writeJson(draftRegistry.coordinator.registryPath, draftRegistryValue);
  refreshPlan(draftRegistry);
  expectRejected("--check", draftRegistry, draftRegistryArchive, "owner-approved finalized coordinator-only p3-role-handoff-registry/v2 record");

  const unapprovedRegistry = createCase("unapproved-registry");
  const unapprovedRegistryArchive = writeReturnArchive(unapprovedRegistry, "unapproved-registry.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "unapproved registry\n" }]);
  const unapprovedRegistryValue = JSON.parse(readFileSync(unapprovedRegistry.coordinator.registryPath, "utf8"));
  unapprovedRegistryValue.ownerApproved = false;
  writeJson(unapprovedRegistry.coordinator.registryPath, unapprovedRegistryValue);
  refreshPlan(unapprovedRegistry);
  expectRejected("--check", unapprovedRegistry, unapprovedRegistryArchive, "owner-approved finalized coordinator-only p3-role-handoff-registry/v2 record");

  // N-16: a legacy global count (current beginning at 3) is rejected even
  // when the v2 registry and plan agree with each other.  The empty current
  // progress ledger requires its own initial delivery sequence of 1.
  const globalCurrentSequence = createCase("global-current-sequence", {
    condition: "current",
    deliverySequence: 3,
  });
  const globalCurrentArchive = writeReturnArchive(globalCurrentSequence, "global-current-sequence.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "global current sequence\n" },
  ]);
  expectRejected("--check", globalCurrentSequence, globalCurrentArchive, "skips, replays, or reorders the required component return attempt");

  const globalDeliveryScope = createCase("global-delivery-scope");
  globalDeliveryScope.plan.authority.handoff.deliveryProgress.scope = "global";
  writeJson(globalDeliveryScope.planPath, globalDeliveryScope.plan);
  const globalDeliveryScopeArchive = writeReturnArchive(globalDeliveryScope, "global-delivery-scope.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "global scope\n" },
  ]);
  expectRejected("--check", globalDeliveryScope, globalDeliveryScopeArchive, "authority.handoff.deliveryProgress.scope must be per-condition");

  const registryGlobalDeliveryScope = createCase("registry-global-delivery-scope");
  const registryGlobalDeliveryScopeArchive = writeReturnArchive(registryGlobalDeliveryScope, "registry-global-delivery-scope.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "registry global scope\n" },
  ]);
  const registryGlobalDeliveryScopeValue = JSON.parse(readFileSync(registryGlobalDeliveryScope.coordinator.registryPath, "utf8"));
  registryGlobalDeliveryScopeValue.deliveryProgress.scope = "global";
  writeJson(registryGlobalDeliveryScope.coordinator.registryPath, registryGlobalDeliveryScopeValue);
  refreshPlan(registryGlobalDeliveryScope);
  expectRejected("--check", registryGlobalDeliveryScope, registryGlobalDeliveryScopeArchive, "Coordinator handoff registry.deliveryProgress.scope must be per-condition");

  const packetMismatch = createCase("packet-mismatch");
  const packetArchive = writeReturnArchive(packetMismatch, "packet-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  const packet = JSON.parse(readFileSync(packetMismatch.coordinator.packetPath, "utf8"));
  packet.identityAuthority.pairId = "p3-wrong-pair";
  writeJson(packetMismatch.coordinator.packetPath, packet);
  refreshPlan(packetMismatch);
  expectRejected("--check", packetMismatch, packetArchive, "identity authority does not match return-plan pairId and condition");

  const packetAuthorityMismatch = createCase("packet-authority-mismatch");
  const packetAuthorityArchive = writeReturnArchive(packetAuthorityMismatch, "packet-authority-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  const packetAuthority = JSON.parse(readFileSync(packetAuthorityMismatch.coordinator.packetPath, "utf8"));
  packetAuthority.identityAuthority.comparisonContract.sha256 = "0".repeat(64);
  writeJson(packetAuthorityMismatch.coordinator.packetPath, packetAuthority);
  refreshPlan(packetAuthorityMismatch);
  expectRejected("--check", packetAuthorityMismatch, packetAuthorityArchive, "authority references do not match the final P-3 contract");

  // N-13: condition-local packet authority requires a clear identity leak scan and exact attachment hashes.
  const n13IdentityLeak = createCase("n13-identity-leak-scan");
  const n13IdentityArchive = writeReturnArchive(n13IdentityLeak, "n13-identity.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "n13\n" }]);
  const n13Registry = JSON.parse(readFileSync(n13IdentityLeak.coordinator.registryPath, "utf8"));
  n13Registry.recipientPackets[0].identityLeakScan.result = "leaked";
  writeJson(n13IdentityLeak.coordinator.registryPath, n13Registry);
  refreshPlan(n13IdentityLeak);
  expectRejected("--check", n13IdentityLeak, n13IdentityArchive, "identityLeakScan.result must be clear");
  const n13AttachmentMismatch = createCase("n13-attachment-hash");
  const n13AttachmentArchive = writeReturnArchive(n13AttachmentMismatch, "n13-attachments.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "n13\n" }]);
  const n13Packet = JSON.parse(readFileSync(n13AttachmentMismatch.coordinator.packetPath, "utf8"));
  n13Packet.roleAttachments[0].sha256 = "0".repeat(64);
  writeJson(n13AttachmentMismatch.coordinator.packetPath, n13Packet);
  refreshPlan(n13AttachmentMismatch);
  expectRejected("--check", n13AttachmentMismatch, n13AttachmentArchive, "registry attachments do not exactly match the packet manifest");

  const rootMismatch = createCase("worktree-root-mismatch");
  const rootArchive = writeReturnArchive(rootMismatch, "worktree-root-mismatch.ustar.tar", [{ path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" }]);
  const alternateRoot = join(rootMismatch.root, "actual-target-alternate");
  for (const relativePath of Object.values(rootMismatch.runtime.relative)) {
    write(join(alternateRoot, ...relativePath.split("/")), readFileSync(join(rootMismatch.targetRoot, ...relativePath.split("/"))));
  }
  write(join(alternateRoot, "site/index.html"), originalMain);
  write(join(alternateRoot, "site/assets/hero/hero.js"), "export const hero = 'old';\n");
  expectRejected("--check", rootMismatch, rootArchive, "does not match the final P-3 condition worktreeRoot", { targetRoot: alternateRoot });

  const interrupted = createCase("interrupted-recovery");
  const interruptedArchive = writeReturnArchive(interrupted, "interrupted-recovery.ustar.tar", [
    { path: "site/assets/hero/hero.js", bytes: "export const hero = 'new';\n" },
    { path: "site/index.html", bytes: returnedMain },
  ]);
  const crash = run("--apply", interrupted, interruptedArchive, false, {
    env: { NODE_ENV: "test", P3_ROLE_RETURN_TEST_CRASH_AFTER_OPERATION: "1" },
  });
  require(crash.status === 86, `test-only interruption used an unexpected exit status: ${crash.status}`);
  require(readFileSync(join(interrupted.targetRoot, "site/assets/hero/hero.js")).toString("utf8") === "export const hero = 'new';\n", "simulated interruption did not leave its first replacement in place");
  expectRejected("--check", interrupted, interruptedArchive, "pending P3 role return recovery journals");
  const recovered = run("--recover", interrupted, null, true);
  const recoveryReport = JSON.parse(recovered.stdout);
  require(recoveryReport.recovered.length === 1 && recoveryReport.recovered[0].action === "rolled-back-interrupted", "--recover did not roll back the interrupted transaction");
  require(readFileSync(join(interrupted.targetRoot, "site/assets/hero/hero.js")).toString("utf8") === "export const hero = 'old';\n", "recovery did not restore the first target");
  require(readFileSync(join(interrupted.targetRoot, "site/index.html")).toString("utf8") === originalMain, "recovery changed an untouched target");
  require(!existsSync(join(interrupted.targetRoot, ".p3-role-return-recovery")), "recovery left a journal directory after rollback");
  expectRejected("--apply", interrupted, interruptedArchive, "blocks another return until the prior apply has an actual checkpoint");

  console.log("p3-role-return E2E PASS");
} finally {
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
}
