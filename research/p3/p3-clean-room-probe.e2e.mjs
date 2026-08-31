#!/usr/bin/env node
// Regression coverage for p3-clean-room-probe v5.  The full role-side run
// receives no contract, Decision J, matrix plan, bootstrap inventory/output,
// or peer identity.  Coordinator-only validation joins those artifacts later.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const probePath = resolve("research/p3/p3-clean-room-probe.mjs");
const { executeProbe, executePeerSentinelMatrix, validateProbeEvidence, requireP11Authorization } = await import(pathToFileURL(probePath).href);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function error(code) {
  return Object.assign(new Error(code), { code });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function stableHash(value) {
  return sha256(JSON.stringify(stable(value)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pathKey(pathname) {
  const value = resolve(pathname).replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin" ? value.toLowerCase() : value;
}

function ref(pathname, bytes) {
  return { path: pathname, sha256: sha256(bytes) };
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function jsonlBytes(records) {
  return Buffer.from(records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

function file(id, pathname, value) {
  const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, "utf8");
  return { id, path: pathname, sha256: sha256(bytes), exists: true, _bytes: bytes };
}

function directory(id, pathname) {
  return { id, path: pathname, exists: true };
}

function addFile(files, record) {
  files.set(pathKey(record.path), Buffer.from(record._bytes));
  const { _bytes, ...published } = record;
  return published;
}

function p12RecordId(operation, id) {
  return "P-12-" + operation + "-" + id;
}

function opaqueId(prefix, value) {
  return prefix + "-" + sha256("p3-clean-room-e2e:" + value);
}

function p12RouteCommitment(recipient, target) {
  return stableHash({
    recipientCommitment: recipient,
    id: target.id,
    rootKind: target.rootKind,
    read: { id: target.read.id, path: pathKey(target.read.path), sha256: target.read.sha256 },
    write: { id: target.write.id, path: pathKey(target.write.path), sha256: target.write.sha256 },
  });
}

function p12RoutePath(routeRoot, commitment, operation) {
  return join(routeRoot, "p12-" + commitment + "-" + operation + ".sentinel");
}

function recipientCommitment(pairId, role) {
  return stableHash({ pairId, condition: role.condition, roleKind: role.roleKind, actor: role.actor, contextId: role.contextId });
}

function deterministicRandom(size) {
  return Buffer.alloc(size, 0x5a);
}

function room(condition, root) {
  const current = condition === "current";
  return {
    condition,
    evidencePath: "MyBrain/verify/p3-clean-room-" + condition + ".json",
    workspaceId: current ? "workspace-b" : "workspace-a",
    worktreeRoot: root,
    implementation: { actor: current ? "actor-i2" : "actor-i1", contextId: current ? "context-i2" : "context-i1" },
    review: { actor: current ? "actor-r2" : "actor-r1", contextId: current ? "context-r2" : "context-r1" },
    otherWorkspaceId: current ? "workspace-a" : "workspace-b",
    isolationMechanism: "Owner-operated observed-denial probe boundary.",
    otherConditionArtifactsAccessible: false,
    prohibitedArtifacts: ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"],
  };
}

function identity(authorization, condition, roleKind) {
  const selected = authorization.conditions.find((entry) => entry.condition === condition);
  return { condition, roleKind, actor: selected[roleKind].actor, contextId: selected[roleKind].contextId };
}

function fakeIo(fixture, { role = false, full = fixture.full, readAllowed = null, writeAllowed = null, directoryAllowed = null } = {}) {
  const files = new Map([...fixture.files.entries()].map(([key, value]) => [key, Buffer.from(value)]));
  const routeLinks = fixture.routeLinks || new Map();
  const deniedReads = new Set();
  const deniedWrites = new Set();
  const deniedDirectories = new Set();
  if (role && full) {
    for (const target of Object.values(full.inventory.p10.targets)) {
      if (typeof target.sha256 === "string") deniedReads.add(pathKey(target.path));
      else deniedDirectories.add(pathKey(target.path));
    }
    for (const target of full.inventory.p12.targets) {
      deniedReads.add(pathKey(target.read.path));
      deniedWrites.add(pathKey(target.write.path));
    }
    for (const sentinel of full.challenge.sentinels) deniedReads.add(pathKey(sentinel.path));
  }
  if (readAllowed) deniedReads.delete(pathKey(readAllowed));
  if (writeAllowed) deniedWrites.delete(pathKey(writeAllowed));
  if (directoryAllowed) deniedDirectories.delete(pathKey(directoryAllowed));
  const state = { readFileAttempts: [], opens: [], createdTemp: [], tempWrites: 0, protectedWrites: 0 };
  const handle = (pathname, temporary) => ({
    async read(buffer, offset = 0, length = buffer.byteLength, position = 0) {
      const source = files.get(pathKey(pathname)) || Buffer.alloc(0);
      const bytesRead = Math.max(0, Math.min(length, source.byteLength - position));
      if (bytesRead > 0) source.copy(buffer, offset, position, position + bytesRead);
      return { bytesRead, buffer };
    },
    async write(buffer) {
      if (!temporary) {
        state.protectedWrites += 1;
        return { bytesWritten: 0, buffer };
      }
      const bytes = Buffer.from(buffer);
      files.set(pathKey(pathname), bytes);
      state.tempWrites += 1;
      return { bytesWritten: bytes.byteLength, buffer };
    },
    async close() {},
  });
  return {
    state,
    io: {
      async readFile(pathname) {
        const key = pathKey(pathname);
        state.readFileAttempts.push(key);
        const bytes = files.get(key);
        if (!bytes) throw error("ENOENT");
        return Buffer.from(bytes);
      },
      async open(pathname, flags, mode) {
        const key = pathKey(pathname);
        state.opens.push({ pathname: key, flags, mode });
        if (flags === "wx+") {
          if (files.has(key)) throw error("EEXIST");
          state.createdTemp.push(key);
          return handle(pathname, true);
        }
        if (flags === "r" && deniedReads.has(key)) throw error("EACCES");
        if (flags === "r+" && deniedWrites.has(key)) throw error("EPERM");
        if (!files.has(key)) throw error("ENOENT");
        return handle(pathname, false);
      },
      async readdir(pathname) {
        if (deniedDirectories.has(pathKey(pathname))) throw error("EPERM");
        return [Buffer.from("unexpected-directory-entry")];
      },
      async realpath(pathname) { return routeLinks.get(pathKey(pathname)) || resolve(pathname); },
    },
  };
}

async function runProbe(fixture, full, phase) {
  const model = fakeIo(fixture, { role: true, full });
  const observations = [];
  await executeProbe(full.plan, phase, { io: model.io, randomBytesFn: deterministicRandom, environment: full.environment, observe: (record) => observations.push(record) });
  return { model, observations };
}

async function expectFailure(action, expected, label) {
  try { await action(); }
  catch (cause) {
    if (cause?.code === expected) return;
    throw new Error(label + ": expected " + expected + ", got " + (cause?.code || cause?.message || String(cause)));
  }
  throw new Error(label + ": expected failure " + expected);
}

async function buildFixture({ launchPrefix = "", stopBeforeFull = false, claudeProjectsUsed = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "p3-clean-room-probe-v5-"));
  const p = (...parts) => join(root, ...parts);
  const files = new Map();
  const pairId = "pair-cleanroom-e2e";
  const authorization = {
    version: 1,
    pairId,
    conditions: [room("baseline", p("actual", "w-a")), room("current", p("actual", "w-b"))],
  };
  const roles = [
    identity(authorization, "baseline", "implementation"),
    identity(authorization, "baseline", "review"),
    identity(authorization, "current", "implementation"),
    identity(authorization, "current", "review"),
  ];
  const decisionPath = p("authority", "owner-decision.json");
  const decision = { version: 2, decisionId: "J", pairId, status: "draft", ownerApproved: false, cleanRoomAuthorization: authorization, cleanRoomAuthorizationStableJsonSha256: stableHash(authorization) };
  const decisionBytes = jsonBytes(decision);
  const decisionRef = ref(decisionPath, decisionBytes);
  files.set(pathKey(decisionPath), decisionBytes);
  const contracts = new Map();
  for (const condition of ["baseline", "current"]) {
    const roomValue = authorization.conditions.find((entry) => entry.condition === condition);
    const pathname = p("authority", condition + ".contract.json");
    const contract = {
      version: 13,
      shared: { cleanRoomAuthorization: authorization, ownerDecisionJ: { path: "owner-decision.json", sha256: decisionRef.sha256 } },
      run: { workspaceId: roomValue.workspaceId, implementation: roomValue.implementation, review: roomValue.review },
    };
    const bytes = jsonBytes(contract);
    const reference = ref(pathname, bytes);
    files.set(pathKey(pathname), bytes);
    contracts.set(condition, { pathname, contract, reference });
  }
  const p10 = {
    targets: {
      historyJsonl: addFile(files, file("P-10-history-jsonl", p("agent-store", ".codex", "history.jsonl"), "history")),
      sessions: directory("P-10-sessions", p("agent-store", ".codex", "sessions")),
      archivedSessions: directory("P-10-archived-sessions", p("agent-store", ".codex", "archived_sessions")),
      memoriesDirectory: directory("P-10-memories-directory", p("agent-store", ".codex", "memories")),
      memoriesSqlite: addFile(files, file("P-10-memories-1-sqlite", p("agent-store", ".codex", "memories_1.sqlite"), "memories")),
      logsSqlite: addFile(files, file("P-10-logs-2-sqlite", p("agent-store", ".codex", "logs_2.sqlite"), "logs")),
      stateSqlite: addFile(files, file("P-10-state-5-sqlite", p("agent-store", ".codex", "state_5.sqlite"), "state")),
      rules: directory("P-10-rules", p("agent-store", ".codex", "rules")),
      skills: directory("P-10-skills", p("agent-store", ".codex", "skills")),
    },
  };
  if (claudeProjectsUsed) p10.targets.claudeProjectsJsonl = addFile(files, file("P-10-claude-projects-jsonl", p("agent-store", ".claude", "projects", "p3-clean-room-e2e.jsonl"), "project history"));
  const p12RouteRoot = p("routes", "p12-routes-" + "b".repeat(64));
  const roleStaging = roles.map((role, index) => ({ ...role, recipientCommitment: recipientCommitment(pairId, role), path: p("staging", "role-staging-" + sha256("staging:" + index)), exists: true }));
  const p12Sources = roleStaging.map((recipient, recipientIndex) => {
    const ownRoom = authorization.conditions.find((entry) => entry.condition === recipient.condition);
    const otherRoom = authorization.conditions.find((entry) => entry.condition !== recipient.condition);
    const protectedRoots = [
      ["own-worktree", ownRoom.worktreeRoot],
      ["other-worktree", otherRoom.worktreeRoot],
      ...roleStaging.filter((entry) => entry.recipientCommitment !== recipient.recipientCommitment).sort((left, right) => pathKey(left.path).localeCompare(pathKey(right.path))).map((entry, index) => ["peer-staging-" + (index + 1), entry.path]),
      ["common-git", p("coordinator", "git")],
      ["coordinator-scratch", p("coordinator", "scratch")],
    ];
    const targets = protectedRoots.map(([id, rootPath]) => ({
      id,
      rootKind: id.startsWith("peer-staging") ? "peer-staging" : id,
      read: addFile(files, file(p12RecordId("read", id), join(rootPath, "read-" + recipientIndex + "-" + id + ".txt"), "read " + recipientIndex + " " + id)),
      write: addFile(files, file(p12RecordId("write", id), join(rootPath, "write-" + recipientIndex + "-" + id + ".txt"), "write " + recipientIndex + " " + id)),
    }));
    return { recipientCommitment: recipient.recipientCommitment, targets };
  });
  const routeLinks = new Map();
  for (const source of p12Sources) {
    for (const target of source.targets) {
      const commitment = p12RouteCommitment(source.recipientCommitment, target);
      const readRoute = p12RoutePath(p12RouteRoot, commitment, "read");
      const writeRoute = p12RoutePath(p12RouteRoot, commitment, "write");
      files.set(pathKey(readRoute), Buffer.from(files.get(pathKey(target.read.path))));
      files.set(pathKey(writeRoute), Buffer.from(files.get(pathKey(target.write.path))));
      routeLinks.set(pathKey(readRoute), target.read.path);
      routeLinks.set(pathKey(writeRoute), target.write.path);
    }
  }
  const authorityPath = p("authority", "coordinator-authority.json");
  const authority = {
    version: 1,
    kind: "p3-clean-room-probe-coordinator-authority-v1",
    authorityBinding: {
      ownerDecisionJ: clone(decisionRef),
      conditionContracts: [
        { condition: "baseline", ...clone(contracts.get("baseline").reference) },
        { condition: "current", ...clone(contracts.get("current").reference) },
      ],
      cleanRoomAuthorizationStableJsonSha256: stableHash(authorization),
    },
    actualWorktrees: authorization.conditions.map((entry) => ({ condition: entry.condition, path: entry.worktreeRoot, exists: true })),
    roleStaging,
    commonGit: { path: p("coordinator", "git"), exists: true },
    coordinatorScratch: { path: p("coordinator", "scratch"), exists: true },
    p10: clone(p10),
    redactedP12RouteRoot: { path: p12RouteRoot, exists: true },
    p12Sources: clone(p12Sources),
  };
  const authorityBytes = jsonBytes(authority);
  const authorityRef = ref(authorityPath, authorityBytes);
  files.set(pathKey(authorityPath), authorityBytes);
  const bootstrap = new Map();
  for (const role of roles) {
    const staging = roleStaging.find((entry) => entry.recipientCommitment === recipientCommitment(pairId, role));
    const probeId = opaqueId("probe", "bootstrap:" + roleStaging.indexOf(staging));
    const inventory = {
      version: 5,
      kind: "p3-clean-room-role-probe-inventory-v5",
      probeId,
      stage: "bootstrap",
      recipientCommitment: staging.recipientCommitment,
      coordinatorAuthoritySha256: authorityRef.sha256,
      ownStaging: { path: staging.path, exists: true },
      p7: { self: { id: "P-7-own-temp-sentinel", coverage: "P-7", environmentVariables: ["TEMP", "TMP"] } },
    };
    const inventoryPath = join(staging.path, "probe-input", "bootstrap-inventory.json");
    const inventoryBytes = jsonBytes(inventory);
    const inventoryRef = ref(inventoryPath, inventoryBytes);
    files.set(pathKey(inventoryPath), inventoryBytes);
    const plan = { version: 5, kind: "p3-clean-room-probe-plan-v5", probeId, stage: "bootstrap", ownStaging: { path: staging.path, exists: true }, inventory: clone(inventoryRef) };
    const planPath = join(staging.path, "probe-input", "bootstrap-plan.json");
    const planBytes = jsonBytes(plan);
    const planRef = ref(planPath, planBytes);
    files.set(pathKey(planPath), planBytes);
    const observations = [];
    const environment = { TEMP: p("launch-temp", launchPrefix + "t" + roleStaging.indexOf(staging)), TMP: p("launch-temp", launchPrefix + "u" + roleStaging.indexOf(staging)) };
    await executeProbe(plan, "before", { io: fakeIo({ files }).io, randomBytesFn: deterministicRandom, environment, observe: (record) => observations.push(record) });
    const outputPath = p("bootstrap", "output-" + roleStaging.indexOf(staging) + ".jsonl");
    const outputBytes = jsonlBytes(observations);
    const outputRef = ref(outputPath, outputBytes);
    files.set(pathKey(outputPath), outputBytes);
    const sentinel = observations.find((record) => record.observation === "temp-self-sentinel-create-read");
    require(sentinel, "bootstrap sentinel missing");
    for (const source of sentinel.sentinels) files.set(pathKey(source.path), Buffer.alloc(32, 0x5a));
    bootstrap.set(staging.recipientCommitment, { role, staging, inventory, inventoryPath, inventoryRef, plan, planPath, planRef, outputPath, outputRef, observations, sentinel, environment });
  }
  const fixture = { root, p, files, routeLinks, authorization, decision, contracts, authority, authorityPath, authorityRef, p10, roleStaging, bootstrap, fullRuns: [] };
  if (stopBeforeFull) return fixture;
  for (const [recipientIndex, recipient] of roleStaging.entries()) {
    const fullProbeId = opaqueId("probe", "full:" + recipientIndex);
    const matrixPlanPath = p("matrix", "plan-" + recipientIndex + ".json");
    const matrixPlan = {
      version: 3,
      kind: "p3-clean-room-peer-sentinel-matrix-plan-v3",
      matrixId: opaqueId("matrix", "matrix:" + recipientIndex),
      challengeId: opaqueId("challenge", "challenge:" + recipientIndex),
      coordinatorAuthority: clone(authorityRef),
      recipient: { probeId: fullProbeId, recipientCommitment: recipient.recipientCommitment },
      bootstrapEntries: [...bootstrap.values()].filter((entry) => entry.staging.recipientCommitment !== recipient.recipientCommitment).map((entry) => ({ probePlan: clone(entry.planRef), output: clone(entry.outputRef) })),
    };
    const matrixBytes = jsonBytes(matrixPlan);
    const matrixRef = ref(matrixPlanPath, matrixBytes);
    files.set(pathKey(matrixPlanPath), matrixBytes);
    const matrix = await executePeerSentinelMatrix(matrixPlan, { io: fakeIo(fixture).io });
    const challenge = matrix.challenge;
    const challengePath = join(recipient.path, "probe-input", "challenge.json");
    const challengeBytes = jsonBytes(challenge);
    const challengeRef = ref(challengePath, challengeBytes);
    files.set(pathKey(challengePath), challengeBytes);
    const p12Source = p12Sources.find((entry) => entry.recipientCommitment === recipient.recipientCommitment);
    const p12Targets = p12Source.targets.map((source) => {
      const commitment = p12RouteCommitment(recipient.recipientCommitment, source);
      const read = { ...clone(source.read), path: p12RoutePath(p12RouteRoot, commitment, "read") };
      const write = { ...clone(source.write), path: p12RoutePath(p12RouteRoot, commitment, "write") };
      // The route is intentionally opaque to the role.  The coordinator-only
      // authority retains the actual source path and validates its root.
      files.set(pathKey(read.path), Buffer.from(files.get(pathKey(source.read.path))));
      files.set(pathKey(write.path), Buffer.from(files.get(pathKey(source.write.path))));
      return { id: source.id, rootKind: source.rootKind, routeCommitment: commitment, read, write };
    });
    const configPath = join(recipient.path, "probe-input", "runtime-config.json");
    const runtimeConfig = { version: 3, kind: "p3-clean-room-role-runtime-config-v3", context: { probeId: fullProbeId, stage: "full", recipientCommitment: recipient.recipientCommitment }, toolSurface: { mode: "all-disabled", mcpServers: [], connectors: [] }, claudeProjects: { state: claudeProjectsUsed ? "used" : "absent" } };
    const configBytes = jsonBytes(runtimeConfig);
    const configRef = addFile(files, { id: "role-runtime-config", path: configPath, sha256: sha256(configBytes), exists: true, format: "p3-clean-room-role-runtime-config-v3", _bytes: configBytes });
    const inventory = {
      version: 5, kind: "p3-clean-room-role-probe-inventory-v5", probeId: fullProbeId, stage: "full", recipientCommitment: recipient.recipientCommitment, coordinatorAuthoritySha256: authorityRef.sha256,
      ownStaging: { path: recipient.path, exists: true },
      p9SelfControl: addFile(files, file("P-9-own-staging-known-file", join(recipient.path, "known.html"), "known " + recipientIndex)),
      p10: clone(p10), runtimeConfiguration: [configRef], p12: { redactedRouteRoot: { path: p12RouteRoot, exists: true }, targets: p12Targets },
      p7: { self: { id: "P-7-own-temp-sentinel", coverage: "P-7", environmentVariables: ["TEMP", "TMP"] }, peerSentinelChallenge: { id: "P-7-peer-sentinel-challenge", ...clone(challengeRef), exists: true } },
    };
    const inventoryPath = join(recipient.path, "probe-input", "full-inventory.json");
    const inventoryBytes = jsonBytes(inventory);
    const inventoryRef = ref(inventoryPath, inventoryBytes);
    files.set(pathKey(inventoryPath), inventoryBytes);
    const plan = { version: 5, kind: "p3-clean-room-probe-plan-v5", probeId: fullProbeId, stage: "full", ownStaging: { path: recipient.path, exists: true }, inventory: clone(inventoryRef) };
    const planPath = join(recipient.path, "probe-input", "full-plan.json");
    const planBytes = jsonBytes(plan);
    const planRef = ref(planPath, planBytes);
    files.set(pathKey(planPath), planBytes);
    const environment = { TEMP: p("launch-temp", "v" + recipientIndex), TMP: p("launch-temp", "w" + recipientIndex) };
    const full = { recipient, matrixPlan, matrixPlanPath, matrixRef, challenge, challengePath, challengeRef, inventory, inventoryPath, inventoryRef, runtimeConfig, configPath, configRef, p12Targets, plan, planPath, planRef, environment };
    const before = await runProbe(fixture, full, "before");
    const after = await runProbe(fixture, full, "after");
    for (const run of [before, after]) {
      const self = run.observations.find((record) => record.observation === "temp-self-sentinel-create-read");
      require(self, "full self TEMP/TMP sentinel missing");
      for (const source of self.sentinels) files.set(pathKey(source.path), Buffer.alloc(32, 0x5a));
    }
    full.before = { path: p("full", "before-" + recipientIndex + ".jsonl"), bytes: jsonlBytes(before.observations) };
    full.after = { path: p("full", "after-" + recipientIndex + ".jsonl"), bytes: jsonlBytes(after.observations) };
    full.before.ref = ref(full.before.path, full.before.bytes);
    full.after.ref = ref(full.after.path, full.after.bytes);
    files.set(pathKey(full.before.path), full.before.bytes);
    files.set(pathKey(full.after.path), full.after.bytes);
    full.before.model = before.model; full.before.observations = before.observations;
    full.after.model = after.model; full.after.observations = after.observations;
    fixture.fullRuns.push(full);
  }
  fixture.full = fixture.fullRuns[0];
  fixture.recipient = fixture.full.recipient;
  fixture.matrixPlan = fixture.full.matrixPlan; fixture.matrixPlanPath = fixture.full.matrixPlanPath; fixture.matrixRef = fixture.full.matrixRef;
  fixture.challenge = fixture.full.challenge; fixture.challengePath = fixture.full.challengePath; fixture.challengeRef = fixture.full.challengeRef;
  fixture.fullPlan = fixture.full.plan; fixture.fullPlanPath = fixture.full.planPath; fixture.fullPlanRef = fixture.full.planRef;
  fixture.before = fixture.full.before; fixture.after = fixture.full.after;
  fixture.runnerPath = probePath;
  const runnerBytes = readFileSync(probePath);
  fixture.runnerRef = ref(fixture.runnerPath, runnerBytes);
  files.set(pathKey(fixture.runnerPath), runnerBytes);
  fixture.evidencePlan = {
    version: 5, kind: "p3-clean-room-probe-evidence-plan-v5", runner: clone(fixture.runnerRef), coordinatorAuthority: clone(authorityRef),
    matrices: fixture.fullRuns.map((full) => ({ matrixPlan: clone(full.matrixRef), challenge: clone(full.challengeRef) })),
    fullRuns: fixture.fullRuns.map((full) => ({ rolePlan: clone(full.planRef), before: clone(full.before.ref), after: clone(full.after.ref) })),
  };
  return fixture;
}

const roots = [];
try {
  {
    const f = await buildFixture(); roots.push(f.root);
    const result = await validateProbeEvidence(f.evidencePlan, { io: fakeIo(f).io });
    require(result.outcome === "PASS" && result.fullRunCount === 4, "complete before/after evidence did not validate");
    const peerArtifacts = [
      ...[...f.bootstrap.values()].filter((entry) => entry.staging.recipientCommitment !== f.recipient.recipientCommitment).flatMap((entry) => [entry.planPath, entry.inventoryPath, entry.outputPath]),
      f.contracts.get("current").pathname,
      f.authorityPath,
      f.matrixPlanPath,
    ];
    require(peerArtifacts.every((pathname) => !f.before.model.state.readFileAttempts.includes(pathKey(pathname))), "full role-side probe read coordinator or peer artifacts");
    require(f.before.model.state.tempWrites === 2 && f.before.model.state.protectedWrites === 0, "role probe wrote a protected target");
    for (const id of ["P-12-own-worktree", "P-12-other-worktree", "P-12-peer-staging-1", "P-12-peer-staging-2", "P-12-peer-staging-3", "P-12-common-git", "P-12-coordinator-scratch"]) {
      require(f.before.model.state.opens.some((entry) => entry.flags === "r"), "expected read probes are missing");
      require(f.before.model.state.opens.some((entry) => entry.flags === "r+"), "expected write-open probes are missing");
      require(f.before.model, id + " coverage was not exercised");
    }
    require(result.p11Authorization === "NOT_AUTHORIZED", "config-only evidence must not authorize P-11");
    require(f.before.observations.some((record) => record.observation === "runtime-config-schema-accepted" && record.result === "schema-accepted-not-p11"), "runtime configuration schema evidence missing");
    require(!f.before.observations.some((record) => record.coverage === "P-11"), "config-only evidence was mislabeled as P-11");
    await expectFailure(() => Promise.resolve(requireP11Authorization()), "P11_ACTUAL_ROLE_LAUNCH_SURFACE_UNPROVABLE", "P-11 must fail closed without actual launcher proof");
    require(f.before.observations.filter((record) => record.observation === "temp-peer-sentinel-read-deny" && record.result === "denied").length === 3, "P-7 did not deny all original peer TEMP paths");
    const self = f.before.observations.find((record) => record.observation === "temp-self-sentinel-create-read");
    require(self?.sentinels?.length === 2
      && self.sentinels.every((entry) => entry.path.startsWith(entry.environmentVariable === "TEMP" ? f.full.environment.TEMP : f.full.environment.TMP))
      && self.sentinels.every((entry) => !entry.path.startsWith(f.full.plan.ownStaging.path)), "P-7 did not create self sentinels under the actual role TEMP/TMP environment");
    const expectedPeerPaths = [...f.bootstrap.values()]
      .filter((entry) => entry.staging.recipientCommitment !== f.recipient.recipientCommitment)
      .map((entry) => entry.sentinel.sentinels.find((item) => item.environmentVariable === "TEMP").path)
      .sort();
    require(f.challenge.sentinels.map((entry) => entry.path).sort().join("|") === expectedPeerPaths.join("|"), "P-7 challenge did not retain the original peer TEMP sentinel paths");
    require(f.challenge.sentinels.every((entry) => !entry.path.includes("p7-routes-")), "P-7 challenge used an alias instead of an original peer TEMP path");
    const requiredP10 = ["P-10-history-jsonl", "P-10-sessions", "P-10-archived-sessions", "P-10-memories-directory", "P-10-memories-1-sqlite", "P-10-logs-2-sqlite", "P-10-state-5-sqlite", "P-10-rules", "P-10-skills"];
    require(requiredP10.every((id) => f.before.observations.some((record) => record.id === id && record.result === "denied")), "P-10 did not cover every required history/memory target");
    for (const full of f.fullRuns) {
      require(full.before.observations.filter((record) => record.coverage?.startsWith("P-12-") && record.result === "denied").length === 14, "each role must exercise all P-12 read/write routes");
      require(full.after.observations.filter((record) => record.observation === "temp-peer-sentinel-read-deny" && record.result === "denied").length === 3, "each role must exercise all P-7 peer routes");
    }
  }

  // A v12 contract must not be reinterpreted as v13 coordinator authority.
  // The authority and matrix reference are rehashed here so the rejection is
  // specifically the unsupported contract version, not an incidental hash
  // mismatch.
  {
    const f = await buildFixture(); roots.push(f.root);
    const legacy = clone(f.contracts.get("baseline").contract);
    legacy.version = 12;
    const legacyBytes = jsonBytes(legacy);
    f.files.set(pathKey(f.contracts.get("baseline").pathname), legacyBytes);
    f.authority.authorityBinding.conditionContracts.find((entry) => entry.condition === "baseline").sha256 = sha256(legacyBytes);
    const authorityBytes = jsonBytes(f.authority);
    f.files.set(pathKey(f.authorityPath), authorityBytes);
    const matrix = clone(f.matrixPlan);
    matrix.coordinatorAuthority.sha256 = sha256(authorityBytes);
    await expectFailure(() => executePeerSentinelMatrix(matrix, { io: fakeIo(f).io }), "AUTHORITY_CONTRACT_VERSION_V12_OR_EARLIER_REJECTED", "v12 coordinator authority contract");
  }

  // Claude Projects is an optional P-10 target only in the declared used
  // mode, but once used it must survive the complete before/after validator
  // just like every mandatory Codex store.
  {
    const f = await buildFixture({ claudeProjectsUsed: true }); roots.push(f.root);
    const result = await validateProbeEvidence(f.evidencePlan, { io: fakeIo(f).io });
    require(result.outcome === "PASS" && result.fullRunCount === 4, "used Claude Projects evidence did not validate");
    for (const full of f.fullRuns) {
      for (const phase of [full.before, full.after]) {
        require(phase.observations.some((record) => record.id === "P-10-claude-projects-jsonl" && record.coverage === "P-10-claude-projects-jsonl" && record.result === "denied"), "used Claude Projects JSONL was not an evidence-validated P-10 denial");
      }
    }
  }

  // P-10 labels are not aliases: each required target must name the concrete
  // host store named by the clean-room review, before any denied operation is
  // attempted.  A differently named file cannot be relabelled history.jsonl.
  {
    const f = await buildFixture(); roots.push(f.root);
    const badInventory = clone(f.full.inventory);
    badInventory.p10.targets.historyJsonl.path = f.p("agent-store", ".codex", "renamed-history.jsonl");
    const inventoryBytes = jsonBytes(badInventory);
    f.files.set(pathKey(f.full.inventoryPath), inventoryBytes);
    const badPlan = clone(f.full.plan);
    badPlan.inventory.sha256 = sha256(inventoryBytes);
    const model = fakeIo(f, { role: true });
    await expectFailure(() => executeProbe(badPlan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "INVALID_INVENTORY", "P-10 history target must name history.jsonl");
    require(!model.state.opens.some((entry) => entry.pathname === pathKey(badInventory.p10.targets.historyJsonl.path)), "role opened a relabelled P-10 target");
  }

  // The authority may not turn a concrete P-10 host-store path into a
  // symlink/junction alias.  The role must probe the actual declared store.
  {
    const f = await buildFixture(); roots.push(f.root);
    const history = f.authority.p10.targets.historyJsonl.path;
    const model = fakeIo(f);
    model.io.realpath = async (pathname) => pathKey(pathname) === pathKey(history)
      ? f.p("alias-target", "history.jsonl")
      : (f.routeLinks.get(pathKey(pathname)) || resolve(pathname));
    await expectFailure(() => executePeerSentinelMatrix(f.matrixPlan, { io: model.io }), "AUTHORITY_P10_REPARSE_ALIAS", "P-10 concrete host-store path must not be a reparse alias");
  }

  // A hash-pinned inventory may not redirect a role-side raw configuration
  // outside its own opaque staging.  The probe rejects before it reads that
  // external path, even though coordinator validation happens later.
  {
    const f = await buildFixture(); roots.push(f.root);
    const badInventory = clone(f.full.inventory);
    badInventory.runtimeConfiguration[0].path = f.authorityPath;
    const bytes = jsonBytes(badInventory);
    f.files.set(pathKey(f.full.inventoryPath), bytes);
    const badPlan = clone(f.full.plan);
    badPlan.inventory.sha256 = sha256(bytes);
    const model = fakeIo(f, { role: true });
    await expectFailure(() => executeProbe(badPlan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "ROLE_INPUT_OUTSIDE_STAGING", "role must reject an external raw config before reading it");
    require(!model.state.readFileAttempts.includes(pathKey(f.authorityPath)), "role read an external config before containment validation");
  }

  // A lexical role-staging path is not enough: staging itself, its pinned
  // inventory, and every own-staging input are realpath-checked before any
  // relevant content read or temporary-file write.
  {
    const f = await buildFixture(); roots.push(f.root);
    const model = fakeIo(f, { role: true });
    model.io.realpath = async (pathname) => pathKey(pathname) === pathKey(f.full.plan.ownStaging.path) ? f.p("escape", "staging") : (f.routeLinks.get(pathKey(pathname)) || resolve(pathname));
    await expectFailure(() => executeProbe(f.full.plan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "ROLE_STAGING_REPARSE_ROOT", "reparsed role staging root");
    require(model.state.readFileAttempts.length === 0, "role read inventory through a reparsed staging root");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const model = fakeIo(f, { role: true });
    model.io.realpath = async (pathname) => pathKey(pathname) === pathKey(f.full.inventoryPath) ? f.p("escape", "inventory.json") : (f.routeLinks.get(pathKey(pathname)) || resolve(pathname));
    await expectFailure(() => executeProbe(f.full.plan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "ROLE_INVENTORY_REPARSE_ESCAPE", "reparsed role inventory");
    require(model.state.readFileAttempts.length === 0, "role read inventory through a reparsed input path");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const model = fakeIo(f, { role: true });
    model.io.realpath = async (pathname) => pathKey(pathname) === pathKey(f.full.configPath) ? f.p("escape", "config.json") : (f.routeLinks.get(pathKey(pathname)) || resolve(pathname));
    await expectFailure(() => executeProbe(f.full.plan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "ROLE_INPUT_REPARSE_ESCAPE", "reparsed own-staging config");
    require(!model.state.readFileAttempts.includes(pathKey(f.full.configPath)) && model.state.createdTemp.length === 0, "role read config or wrote self TEMP through a reparse point");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const model = fakeIo(f, { role: true });
    const p9 = f.full.inventory.p9SelfControl.path;
    model.io.realpath = async (pathname) => pathKey(pathname) === pathKey(p9) ? f.p("escape", "known.html") : (f.routeLinks.get(pathKey(pathname)) || resolve(pathname));
    await expectFailure(() => executeProbe(f.full.plan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "ROLE_INPUT_REPARSE_ESCAPE", "reparsed P-9 control");
    require(!model.state.readFileAttempts.includes(pathKey(p9)), "role read P-9 through a reparse point");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const model = fakeIo(f, { role: true });
    const challenge = f.full.challengePath;
    model.io.realpath = async (pathname) => pathKey(pathname) === pathKey(challenge) ? f.p("escape", "challenge.json") : (f.routeLinks.get(pathKey(pathname)) || resolve(pathname));
    await expectFailure(() => executeProbe(f.full.plan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "ROLE_INPUT_REPARSE_ESCAPE", "reparsed P-7 challenge");
    require(!model.state.readFileAttempts.includes(pathKey(challenge)), "role read a P-7 challenge through a reparse point");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const model = fakeIo(f, { role: true });
    const badEnvironment = { TEMP: join(f.full.plan.ownStaging.path, "fake-temp"), TMP: f.full.environment.TMP };
    await expectFailure(() => executeProbe(f.full.plan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: badEnvironment }), "P7_LAUNCH_TEMP_OVERLAPS_STAGING", "P-7 must use the actual role TEMP, not staging");
    require(model.state.createdTemp.length === 0, "role wrote a P-7 sentinel before validating TEMP/TMP");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const model = fakeIo(f, { role: true });
    await expectFailure(() => executeProbe(f.full.plan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: { TEMP: f.full.environment.TEMP } }), "P7_LAUNCH_TMP_MISSING", "P-7 requires both actual TEMP and TMP");
    require(model.state.createdTemp.length === 0, "role wrote a P-7 sentinel with a missing TMP environment");
  }

  // P-12 routes cannot reveal actual worktree/staging paths to a role.  They
  // must be deterministic aliases under the dedicated opaque P-12 root.
  {
    const f = await buildFixture(); roots.push(f.root);
    const badInventory = clone(f.full.inventory);
    const actual = f.authority.p12Sources.find((entry) => entry.recipientCommitment === f.recipient.recipientCommitment).targets[0].read.path;
    badInventory.p12.targets[0].read.path = actual;
    const bytes = jsonBytes(badInventory);
    f.files.set(pathKey(f.full.inventoryPath), bytes);
    const badPlan = clone(f.full.plan);
    badPlan.inventory.sha256 = sha256(bytes);
    const model = fakeIo(f, { role: true });
    await expectFailure(() => executeProbe(badPlan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "ROLE_P12_ROUTE_INVALID", "P-12 actual path must not reach the role");
    require(!model.state.opens.some((entry) => entry.pathname === pathKey(actual)), "role opened an actual P-12 source");
  }

  // The role-side preflight rejects an identity-bearing original peer TEMP
  // path before it attempts the denied read.
  {
    const f = await buildFixture(); roots.push(f.root);
    const badChallenge = clone(f.full.challenge);
    badChallenge.sentinels[0].path = f.p("launch-temp", "baseline", "peer.sentinel");
    const bytes = jsonBytes(badChallenge);
    f.files.set(pathKey(f.full.challengePath), bytes);
    const badInventory = clone(f.full.inventory);
    badInventory.p7.peerSentinelChallenge.sha256 = sha256(bytes);
    const inventoryBytes = jsonBytes(badInventory);
    f.files.set(pathKey(f.full.inventoryPath), inventoryBytes);
    const badPlan = clone(f.full.plan);
    badPlan.inventory.sha256 = sha256(inventoryBytes);
    const model = fakeIo(f, { role: true });
    await expectFailure(() => executeProbe(badPlan, "before", { io: model.io, randomBytesFn: deterministicRandom, environment: { TEMP: f.p("launch-temp", "x1"), TMP: f.p("launch-temp", "y1") } }), "P7_CHALLENGE_SENTINEL_PATH_INVALID", "identity-bearing original P-7 peer path");
    require(!model.state.opens.some((entry) => entry.pathname === pathKey(badChallenge.sentinels[0].path)), "role opened an identity-bearing peer sentinel");
  }

  // Opaque IDs are syntax-bound, not free-form carrier fields for pair,
  // condition, actor, context, or path identity.
  {
    const f = await buildFixture(); roots.push(f.root);
    const badMatrix = clone(f.matrixPlan);
    badMatrix.challengeId = "challenge-baseline-leak";
    await expectFailure(() => executePeerSentinelMatrix(badMatrix, { io: fakeIo(f).io }), "MATRIX_PLAN_INVALID", "identity-bearing challenge ID");
  }

  // Coordinator validation resolves declared P-12 roots and source files. A
  // reparse/symlink-style resolution outside the declared root fails closed.
  {
    const f = await buildFixture(); roots.push(f.root);
    const source = f.authority.p12Sources[0].targets[0].read.path;
    const model = fakeIo(f);
    model.io.realpath = async (pathname) => pathKey(pathname) === pathKey(source) ? f.p("escape", "outside.txt") : (f.routeLinks.get(pathKey(pathname)) || resolve(pathname));
    await expectFailure(() => executePeerSentinelMatrix(f.matrixPlan, { io: model.io }), "AUTHORITY_P12_REPARSE_ESCAPE", "P-12 reparse escape");
  }

  // A same-byte copy is not a P-12 source alias.  The coordinator must see
  // the deterministic route resolve to the exact declared source path.
  {
    const f = await buildFixture(); roots.push(f.root);
    const source = f.authority.p12Sources[0];
    const target = source.targets[0];
    const route = p12RoutePath(f.authority.redactedP12RouteRoot.path, p12RouteCommitment(source.recipientCommitment, target), "read");
    f.routeLinks.set(pathKey(route), f.p("copy", "same-bytes.txt"));
    await expectFailure(() => executePeerSentinelMatrix(f.matrixPlan, { io: fakeIo(f).io }), "AUTHORITY_P12_ROUTE_NOT_SOURCE_ALIAS", "P-12 same-byte route copy");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const source = f.authority.p12Sources[0];
    const target = source.targets[0];
    const route = p12RoutePath(f.authority.redactedP12RouteRoot.path, p12RouteCommitment(source.recipientCommitment, target), "read");
    f.files.set(pathKey(route), Buffer.from("tampered-route-bytes", "utf8"));
    await expectFailure(() => executePeerSentinelMatrix(f.matrixPlan, { io: fakeIo(f).io }), "AUTHORITY_P12_ROUTE_HASH_MISMATCH", "P-12 route hash mismatch");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const fakeRunnerPath = f.p("runner", "renamed-probe.mjs");
    const runnerBytes = f.files.get(pathKey(probePath));
    f.files.set(pathKey(fakeRunnerPath), Buffer.from(runnerBytes));
    const evidence = clone(f.evidencePlan);
    evidence.runner = ref(fakeRunnerPath, runnerBytes);
    await expectFailure(() => validateProbeEvidence(evidence, { io: fakeIo(f).io }), "EVIDENCE_RUNNER_MISMATCH", "evidence runner must be the executing helper");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const evidence = clone(f.evidencePlan);
    evidence.matrices.pop(); evidence.fullRuns.pop();
    await expectFailure(() => validateProbeEvidence(evidence, { io: fakeIo(f).io }), "EVIDENCE_FULL_CONTEXT_SET_MISMATCH", "all four fresh full contexts are required");
  }

  // The role parser rejects a path that is not the deterministic opaque route
  // bound to the source commitment.  It never needs peer identity to do so.
  {
    const f = await buildFixture(); roots.push(f.root);
    f.challenge.sentinels[0].path = f.p("routes", "p7-routes-" + "a".repeat(64), "baseline-leak.sentinel");
    const bytes = jsonBytes(f.challenge);
    f.files.set(pathKey(f.challengePath), bytes);
    await expectFailure(() => executeProbe(f.fullPlan, "before", { io: fakeIo(f, { role: true }).io, randomBytesFn: deterministicRandom, environment: { TEMP: f.p("launch-temp", "x2"), TMP: f.p("launch-temp", "y2") } }), "P7_CHALLENGE_HASH_MISMATCH", "tampered challenge bytes are hash pinned");
  }

  // Even if a coordinator rewrites the challenge and records its new hash in
  // the evidence plan, the validator re-derives bootstrap provenance and
  // rejects an unbound commitment.
  {
    const f = await buildFixture(); roots.push(f.root);
    const unbound = clone(f.challenge);
    unbound.provenance.bootstrapEvidenceSetSha256 = "0".repeat(64);
    const bytes = jsonBytes(unbound);
    const pathname = f.p("matrix", "unbound-challenge.json");
    f.files.set(pathKey(pathname), bytes);
    const evidence = clone(f.evidencePlan);
    evidence.matrices[0].challenge = ref(pathname, bytes);
    await expectFailure(() => validateProbeEvidence(evidence, { io: fakeIo(f).io }), "EVIDENCE_MATRIX_CHALLENGE_MISMATCH", "unbound P-7 challenge provenance");
  }

  // The matrix must reject a peer's original absolute launch-TEMP path when
  // it carries a known condition identity.  No opaque alias may hide it.
  {
    const f = await buildFixture({ launchPrefix: "baseline-", stopBeforeFull: true }); roots.push(f.root);
    const recipient = f.roleStaging[0];
    const matrixPlan = {
      version: 3,
      kind: "p3-clean-room-peer-sentinel-matrix-plan-v3",
      matrixId: opaqueId("matrix", "identity-leak"),
      challengeId: opaqueId("challenge", "identity-leak"),
      coordinatorAuthority: clone(f.authorityRef),
      recipient: { probeId: opaqueId("probe", "identity-leak"), recipientCommitment: recipient.recipientCommitment },
      bootstrapEntries: [...f.bootstrap.values()].filter((entry) => entry.staging.recipientCommitment !== recipient.recipientCommitment).map((entry) => ({ probePlan: clone(entry.planRef), output: clone(entry.outputRef) })),
    };
    await expectFailure(() => executePeerSentinelMatrix(matrixPlan, { io: fakeIo(f).io }), "P7_LAUNCH_ENVIRONMENT_IDENTITY_LEAK", "identity-leaking original P-7 TEMP path");
  }

  // The static input schema rejects a non-empty external tool collection, but
  // its successful empty form is never interpreted as P-11 authorization.
  {
    const f = await buildFixture(); roots.push(f.root);
    const badConfig = clone(f.full.runtimeConfig);
    badConfig.toolSurface.mcpServers = [{ id: "escape", enabled: false }];
    const bytes = jsonBytes(badConfig);
    f.files.set(pathKey(f.full.configPath), bytes);
    const badInventory = clone(f.full.inventory);
    badInventory.runtimeConfiguration[0].sha256 = sha256(bytes);
    const inventoryBytes = jsonBytes(badInventory);
    f.files.set(pathKey(f.full.inventoryPath), inventoryBytes);
    const badPlan = clone(f.fullPlan);
    badPlan.inventory.sha256 = sha256(inventoryBytes);
    await expectFailure(() => executeProbe(badPlan, "before", { io: fakeIo(f, { role: true }).io, randomBytesFn: deterministicRandom, environment: f.full.environment }), "CONFIG_TOOL_SURFACE_NOT_ALL_DISABLED", "non-empty runtime tool-surface schema");
  }

  // If a role declares that it uses Claude Projects, P-10 requires the
  // projects JSONL itself as a separate denied-read target.  Declaring the
  // use without that target fails before any P-10/P-12 probe can pass.
  {
    const f = await buildFixture(); roots.push(f.root);
    const usedConfig = clone(f.full.runtimeConfig);
    usedConfig.claudeProjects.state = "used";
    const configBytes = jsonBytes(usedConfig);
    f.files.set(pathKey(f.full.configPath), configBytes);
    const usedInventory = clone(f.full.inventory);
    usedInventory.runtimeConfiguration[0].sha256 = sha256(configBytes);
    const inventoryBytes = jsonBytes(usedInventory);
    f.files.set(pathKey(f.full.inventoryPath), inventoryBytes);
    const usedPlan = clone(f.full.plan);
    usedPlan.inventory.sha256 = sha256(inventoryBytes);
    await expectFailure(() => executeProbe(usedPlan, "before", { io: fakeIo(f, { role: true }).io, randomBytesFn: deterministicRandom, environment: { TEMP: f.p("launch-temp", "x3"), TMP: f.p("launch-temp", "y3") } }), "P10_CLAUDE_PROJECT_COVERAGE_MISMATCH", "Claude Projects use without its JSONL P-10 target");
  }

  {
    const f = await buildFixture(); roots.push(f.root);
    const usedConfig = clone(f.full.runtimeConfig);
    usedConfig.claudeProjects.state = "used";
    const configBytes = jsonBytes(usedConfig);
    f.files.set(pathKey(f.full.configPath), configBytes);
    const usedInventory = clone(f.full.inventory);
    usedInventory.runtimeConfiguration[0].sha256 = sha256(configBytes);
    const projects = file("P-10-claude-projects-jsonl", f.p("agent-store", ".claude", "projects", "p3-clean-room-e2e.jsonl"), "project history");
    usedInventory.p10.targets.claudeProjectsJsonl = addFile(f.files, projects);
    const inventoryBytes = jsonBytes(usedInventory);
    f.files.set(pathKey(f.full.inventoryPath), inventoryBytes);
    const usedPlan = clone(f.full.plan);
    usedPlan.inventory.sha256 = sha256(inventoryBytes);
    const full = { ...f.full, inventory: usedInventory, plan: usedPlan };
    const observations = [];
    await executeProbe(usedPlan, "before", { io: fakeIo(f, { role: true, full }).io, randomBytesFn: deterministicRandom, environment: { TEMP: f.p("launch-temp", "x4"), TMP: f.p("launch-temp", "y4") }, observe: (record) => observations.push(record) });
    require(observations.some((record) => record.id === "P-10-claude-projects-jsonl" && record.result === "denied"), "Claude Projects JSONL was not probed when used");
  }

  // Coordinator authority, not a role inventory self-claim, owns P-12 roots.
  {
    const f = await buildFixture(); roots.push(f.root);
    const badInventory = clone(f.full.inventory);
    badInventory.p12.targets.find((target) => target.id === "own-worktree").read.path = f.p("outside", "read.txt");
    const badBytes = jsonBytes(badInventory);
    const badRef = ref(f.full.inventoryPath, badBytes);
    f.files.set(pathKey(f.full.inventoryPath), badBytes);
    const badPlan = clone(f.fullPlan);
    badPlan.inventory = clone(badRef);
    const planBytes = jsonBytes(badPlan);
    const planRef = ref(f.fullPlanPath, planBytes);
    f.files.set(pathKey(f.fullPlanPath), planBytes);
    const evidence = clone(f.evidencePlan);
    evidence.fullRuns[0].rolePlan = clone(planRef);
    await expectFailure(() => validateProbeEvidence(evidence, { io: fakeIo(f).io }), "P12_TARGET_NOT_COORDINATOR_DERIVED", "P-12 root self-claim outside coordinator authority");
  }

  // A complete JSONL is required for both phases; no boolean field can turn a
  // missing P-10 observation into a pass.
  {
    const f = await buildFixture(); roots.push(f.root);
    const records = JSON.parse("[" + f.after.bytes.toString("utf8").trim().split("\n").join(",") + "]");
    const missing = records.filter((record) => !(record.id === "P-10-history-jsonl" && record.result === "denied")).map((record, index) => ({ ...record, sequence: index + 1 }));
    const bytes = jsonlBytes(missing);
    const pathname = f.p("full", "after-missing-p10.jsonl");
    const reference = ref(pathname, bytes);
    f.files.set(pathKey(pathname), bytes);
    const evidence = clone(f.evidencePlan);
    evidence.fullRuns[0].after = clone(reference);
    await expectFailure(() => validateProbeEvidence(evidence, { io: fakeIo(f).io }), "EVIDENCE_P10_SET_MISMATCH", "missing P-10 after observation");
  }

  // Re-hashing JSONL cannot turn a self-claimed P-9 result into a pass: the
  // observation SHA must equal the inventory's coordinator-verified target.
  {
    const f = await buildFixture(); roots.push(f.root);
    const records = JSON.parse("[" + f.after.bytes.toString("utf8").trim().split("\n").join(",") + "]");
    const record = records.find((item) => item.observation === "self-control-read");
    record.sha256 = "0".repeat(64);
    const bytes = jsonlBytes(records.map((item, index) => ({ ...item, sequence: index + 1 })));
    const pathname = f.p("full", "after-bad-p9.jsonl");
    f.files.set(pathKey(pathname), bytes);
    const evidence = clone(f.evidencePlan);
    evidence.fullRuns[0].after = ref(pathname, bytes);
    await expectFailure(() => validateProbeEvidence(evidence, { io: fakeIo(f).io }), "EVIDENCE_P9_VALUE_MISMATCH", "P-9 JSONL self-claim");
  }

  // Likewise, P-7 provenance fields are values, not labels: a re-hashed
  // transcript cannot replace the coordinator-derived matrix commitment.
  {
    const f = await buildFixture(); roots.push(f.root);
    const records = JSON.parse("[" + f.after.bytes.toString("utf8").trim().split("\n").join(",") + "]");
    const record = records.find((item) => item.observation === "p7-peer-sentinel-provenance");
    record.bootstrapEvidenceSetSha256 = "f".repeat(64);
    const bytes = jsonlBytes(records.map((item, index) => ({ ...item, sequence: index + 1 })));
    const pathname = f.p("full", "after-bad-p7.jsonl");
    f.files.set(pathKey(pathname), bytes);
    const evidence = clone(f.evidencePlan);
    evidence.fullRuns[0].after = ref(pathname, bytes);
    await expectFailure(() => validateProbeEvidence(evidence, { io: fakeIo(f).io }), "EVIDENCE_P7_PROVENANCE_VALUE_MISMATCH", "P-7 JSONL provenance self-claim");
  }

  console.log("p3-clean-room-probe E2E PASS");
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
