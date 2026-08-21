#!/usr/bin/env node

import { accessSync, constants } from "node:fs";
import process from "node:process";

export const REQUIRED_LOCAL_WORKFLOWS = [
  "C:\\AI\\vault\\WORKFLOW.md",
  "C:\\AI\\web-development\\WORKFLOW.md",
];

function canRead(path) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function evaluateWorkflowEnvironment({ env = process.env, canReadPath = canRead } = {}) {
  const signals = [];
  if (env.CLAUDE_CODE_REMOTE === "true") signals.push("CLAUDE_CODE_REMOTE=true");
  if (env.CODEX_CI === "1") signals.push("CODEX_CI=1");

  const missingLocalWorkflows = REQUIRED_LOCAL_WORKFLOWS.filter((path) => !canReadPath(path));
  if (signals.length > 0 || missingLocalWorkflows.length > 0) {
    return { mode: "cloud-restricted", signals, missingLocalWorkflows };
  }

  return { mode: "local", signals, missingLocalWorkflows: [] };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = evaluateWorkflowEnvironment();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
