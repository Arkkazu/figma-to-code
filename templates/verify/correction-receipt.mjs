#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = process.cwd();

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required.`);
  return value.trim();
}

function repoPath(root, value, label) {
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) throw new Error(`${label} must be relative to the repository.`);
  const absolutePath = resolve(root, input);
  const pathFromRoot = relative(root, absolutePath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) throw new Error(`${label} must stay within the repository.`);
  return { absolutePath, relativePath: pathFromRoot.replace(/\\/g, "/") };
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) throw new Error(`${label} does not exist: ${filePath}`);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertEntry(logPath, entryId) {
  if (!existsSync(logPath)) throw new Error(`Project correction log does not exist: ${logPath}`);
  const marker = `<!-- correction-id: ${entryId} -->`;
  if (!readFileSync(logPath, "utf8").includes(marker)) {
    throw new Error(`Project correction log is missing ${marker}`);
  }
}

export function validateCorrectionReceipt(root, receiptPathValue) {
  const receiptPath = repoPath(root, receiptPathValue, "manifest.scope.correctionReceiptPath");
  const receipt = readJson(receiptPath.absolutePath, "Owner correction receipt");
  if (receipt.version !== 1 || receipt.status !== "recorded") {
    throw new Error("Owner correction receipt must use version 1 with status recorded.");
  }
  const id = requireString(receipt.id, "Owner correction receipt.id");
  if (!/^CR-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error("Owner correction receipt.id must start with CR- and use only letters, numbers, dot, underscore, or hyphen.");
  }
  const classification = requireString(receipt.classification, "Owner correction receipt.classification");
  if (!["project-only", "cross-project"].includes(classification)) {
    throw new Error("Owner correction receipt.classification must be project-only or cross-project.");
  }
  const logPath = repoPath(root, receipt.projectCorrectionLogPath, "Owner correction receipt.projectCorrectionLogPath");
  assertEntry(logPath.absolutePath, id);
  const expectedLogHash = requireString(receipt.projectCorrectionLogSha256, "Owner correction receipt.projectCorrectionLogSha256");
  const actualLogHash = sha256(logPath.absolutePath);
  if (expectedLogHash !== actualLogHash) {
    throw new Error("Project correction log changed after the owner correction receipt was recorded. Re-record the receipt before preflight.");
  }
  requireString(receipt.recordedAt, "Owner correction receipt.recordedAt");
  return {
    id,
    classification,
    absolutePath: receiptPath.absolutePath,
    relativePath: receiptPath.relativePath,
    receiptSha256: sha256(receiptPath.absolutePath),
    projectCorrectionLogPath: logPath.relativePath,
    projectCorrectionLogSha256: actualLogHash,
  };
}

function record(receiptPathValue, logPathValue, entryIdValue, classificationValue) {
  const receiptPath = repoPath(repoRoot, receiptPathValue, "receipt path");
  const logPath = repoPath(repoRoot, logPathValue, "project correction log path");
  const id = requireString(entryIdValue, "correction id");
  const classification = requireString(classificationValue, "classification");
  if (!["project-only", "cross-project"].includes(classification)) {
    throw new Error("classification must be project-only or cross-project.");
  }
  if (!/^CR-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error("correction id must start with CR- and use only letters, numbers, dot, underscore, or hyphen.");
  }
  assertEntry(logPath.absolutePath, id);
  mkdirSync(dirname(receiptPath.absolutePath), { recursive: true });
  writeFileSync(receiptPath.absolutePath, `${JSON.stringify({
    version: 1,
    status: "recorded",
    id,
    classification,
    recordedAt: new Date().toISOString(),
    projectCorrectionLogPath: logPath.relativePath,
    projectCorrectionLogSha256: sha256(logPath.absolutePath),
  }, null, 2)}\n`, "utf8");
  const validated = validateCorrectionReceipt(repoRoot, receiptPath.relativePath);
  console.log(`CORRECTION RECEIPT PASS: ${validated.id} (${validated.classification})`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "record" && args.length === 4) {
      record(...args);
      return;
    }
    if (command === "assert" && args.length === 1) {
      const validated = validateCorrectionReceipt(repoRoot, args[0]);
      console.log(`CORRECTION RECEIPT PASS: ${validated.id} (${validated.classification})`);
      return;
    }
    throw new Error("Usage: node correction-receipt.mjs record <receipt.json> <project-corrections.md> <CR-id> <project-only|cross-project> | assert <receipt.json>");
  } catch (error) {
    console.error(`CORRECTION RECEIPT: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();