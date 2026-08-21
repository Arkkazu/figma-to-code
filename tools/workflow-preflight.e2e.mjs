#!/usr/bin/env node

import assert from "node:assert/strict";
import { evaluateWorkflowEnvironment, REQUIRED_LOCAL_WORKFLOWS } from "./workflow-preflight.mjs";

const readable = () => true;

assert.equal(
  evaluateWorkflowEnvironment({ env: { CLAUDE_CODE_REMOTE: "true" }, canReadPath: readable }).mode,
  "cloud-restricted",
  "Claude cloud must be restricted",
);
assert.equal(
  evaluateWorkflowEnvironment({ env: { CODEX_CI: "1" }, canReadPath: readable }).mode,
  "cloud-restricted",
  "Codex cloud must be restricted",
);
assert.equal(
  evaluateWorkflowEnvironment({ env: {}, canReadPath: () => false }).mode,
  "cloud-restricted",
  "missing parent workflows must fail safe",
);
assert.deepEqual(
  evaluateWorkflowEnvironment({ env: {}, canReadPath: (path) => REQUIRED_LOCAL_WORKFLOWS.includes(path) }),
  { mode: "local", signals: [], missingLocalWorkflows: [] },
  "a local environment with both parent workflows must proceed",
);

process.stdout.write("workflow-preflight.e2e: PASS\n");
