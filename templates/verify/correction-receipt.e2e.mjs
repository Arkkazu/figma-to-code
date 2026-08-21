#!/usr/bin/env node
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const templateDirectory = process.env.FIGMA_GATE_TEMPLATE_DIR || dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "correction-receipt-e2e-"));
const script = resolve(templateDirectory, "correction-receipt.mjs");

function write(relativePath, value) {
  const target = join(repo, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, "utf8");
}

function run(expectedSuccess, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (expectedSuccess && result.status !== 0) throw new Error(`expected pass: ${output}`);
  if (!expectedSuccess && result.status === 0) throw new Error(`expected rejection: ${output}`);
  return output;
}

try {
  write("MyBrain/rules/corrections.md", "# Corrections\n\n<!-- correction-id: CR-20260719-receipt-gate -->\n## correction\n");
  run(true, "record", "MyBrain/verify/corrections/CR-20260719-receipt-gate.json", "MyBrain/rules/corrections.md", "CR-20260719-receipt-gate", "project-only");
  run(true, "assert", "MyBrain/verify/corrections/CR-20260719-receipt-gate.json");
  write("MyBrain/rules/corrections.md", "# Corrections\n\n<!-- correction-id: CR-20260719-receipt-gate -->\n## changed after receipt\n");
  const rejected = run(false, "assert", "MyBrain/verify/corrections/CR-20260719-receipt-gate.json");
  if (!rejected.includes("changed after the owner correction receipt")) throw new Error(`wrong rejection: ${rejected}`);
  console.log("correction-receipt E2E PASS");
} finally {
  if (existsSync(repo)) rmSync(repo, { recursive: true, force: true });
}