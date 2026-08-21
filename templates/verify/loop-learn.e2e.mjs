#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const templateDirectory = resolve(import.meta.dirname);
const learnerPath = join(templateDirectory, "loop-learn.mjs");
const policySourcePath = join(templateDirectory, "loop-learning-policy.json");
const root = mkdtempSync(join(tmpdir(), "figma-loop-learn-"));

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(...args) {
  const result = spawnSync(process.execPath, [learnerPath, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return result;
}

function event(eventId, overrides = {}) {
  return {
    version: 1,
    eventId,
    generatedAt: "2026-07-18T12:00:00.000Z",
    source: { kind: "fixture" },
    catalogVersion: "2026-07-18.1",
    scope: {
      id: "fixture-scope",
      manifestPath: "MyBrain/verify/gate-fixture.json",
      targets: ["templates/card.php"],
    },
    metrics: {
      scopeElapsedMs: 1000,
      directViewportRuns: { pc: 1, sp: 1 },
      finalRecheckViewportRuns: { pc: 0, sp: 0 },
    },
    validation: {
      layoutStatus: "pass",
      w3c: { required: false, status: "not-required" },
    },
    observations: {
      changedPaths: ["templates/card.php"],
      capabilities: {
        declaredTargetsOnly: true,
        checkpointCaptureMode: "batch",
      },
    },
    ...overrides,
  };
}

try {
  writeFileSync(join(root, "STATE.md"), "# STATE\n", "utf8");
  writeFileSync(join(root, "policy.json"), readFileSync(policySourcePath, "utf8"), "utf8");

  writeJson(join(root, "safe-event.json"), event("safe-event", {
    observations: {
      changedPaths: ["templates/card.php", "templates/unrelated.php"],
      capabilities: {
        declaredTargetsOnly: true,
        checkpointCaptureMode: "batch",
      },
    },
  }));
  let result = run("analyze", "safe-event.json", "policy.json", "learning");
  assert.equal(result.status, 0, result.stderr);
  let latest = JSON.parse(readFileSync(join(root, "learning", "latest.json"), "utf8"));
  assert.deepEqual(latest.controlsAdded.map((item) => item.controlId), ["scope-freeze"]);
  assert.equal(latest.proposals.length, 0);

  result = run("analyze", "safe-event.json", "policy.json", "learning");
  assert.equal(result.status, 0, result.stderr);
  latest = JSON.parse(readFileSync(join(root, "learning", "latest.json"), "utf8"));
  assert.equal(latest.findings[0].resolution, "already-active");

  writeJson(join(root, "proposal-event.json"), event("proposal-event", {
    metrics: {
      scopeElapsedMs: 1800001,
      directViewportRuns: { pc: 3, sp: 1 },
      finalRecheckViewportRuns: { pc: 0, sp: 0 },
    },
    validation: {
      layoutStatus: "pass",
      w3c: { required: true, status: "not-recorded" },
    },
  }));
  result = run("analyze", "proposal-event.json", "policy.json", "learning");
  assert.equal(result.status, 0, result.stderr);
  latest = JSON.parse(readFileSync(join(root, "learning", "latest.json"), "utf8"));
  assert.deepEqual(latest.controlsAdded.map((item) => item.controlId), ["single-batch-checkpoint"]);
  assert.deepEqual(latest.proposals.map((item) => item.proposalId).sort(), [
    "proposal-event-html-validation-missing",
    "proposal-event-scope-duration-exceeded",
  ]);

  writeJson(join(root, "gate-fixture.json"), {
    id: "gate-fixture",
    scope: { changeTargets: ["templates/card.php"] },
  });
  writeJson(join(root, "gate-state.json"), {
    version: 6,
    phase: "closed",
    preflightAt: "2026-07-18T12:00:00.000Z",
    closedAt: "2026-07-18T12:02:00.000Z",
    changeTargets: ["templates/card.php"],
    learningCapabilities: { declaredTargetsOnly: true, checkpointCaptureMode: "batch" },
    learningMetrics: { directViewportRuns: { pc: 1, sp: 1 }, finalRecheckViewportRuns: { pc: 1, sp: 1 } },
  });
  result = run("from-gate", "gate-fixture.json", "gate-state.json", "policy.json", "learning");
  assert.equal(result.status, 0, result.stderr);
  latest = JSON.parse(readFileSync(join(root, "learning", "latest.json"), "utf8"));
  assert.equal(latest.eventId, "figma-gate-fixture-20260718120200");
  assert.equal(latest.findings.length, 1);
  assert.equal(latest.findings[0].signalId, "html-validation-missing");

  const unsafePolicy = JSON.parse(readFileSync(join(root, "policy.json"), "utf8"));
  unsafePolicy.safeControls["scope-freeze"].scope = "canonical";
  writeJson(join(root, "unsafe-policy.json"), unsafePolicy);
  result = run("analyze", "safe-event.json", "unsafe-policy.json", "unsafe-learning");
  assert.notEqual(result.status, 0, "A policy that touches canonical rules must be rejected.");
  assert.match(result.stderr, /scope: project-local/);

  console.log("loop-learn E2E PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
