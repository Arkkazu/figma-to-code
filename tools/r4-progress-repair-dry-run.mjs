#!/usr/bin/env node
// R4 baseline sequence-1 progress-isolation repair: dry-run only.
//
// This tool never creates the candidate coordinator bundle and never touches
// a worktree, common Git directory, role home, archive, or runtime record.
// It builds one append-only fixture below .r4-coordinator-stage, derives the
// production candidate in memory, and invokes p3-role-return --check only.
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ACTIVATION_ID = "f8657db3a6c739184e02a6d411efaee3965dea822508791a46eb9914c2b91a6c";
const PAIR_ID = "open-service-top-hero-v1-20260809";
const HANDOFF_ID = "624e2521f5e3f95d3f0ed3d193349b63";
const ARCHIVE_SHA256 = "b9a96b6d68eb7282c65734971e40b8e7d30f8553a41f47cf2aad585695c70018";
const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PILOT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
// The activation's frozen clean-room records use lower-case drive letters.
// The pinned v5 helper compares realpath strings directly, so keep those
// literals byte-compatible for this read-only fixture invocation.
const BASELINE_ROOT = "c:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT_ROOT = "c:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const ROLE_HOME = "C:/Users/tane1/AppData/Local/p3-role-homes/a-impl";
const ARCHIVE_PATH = `${ROLE_HOME}/return.ustar.tar`;
const ACTIVATION_ROOT = `${PILOT_ROOT}/.git/p3-coordinator/${PAIR_ID}/runtime-activations/v2/${ACTIVATION_ID}`;
const HELPER_PATH = "C:/AI/figma-to-code/research/p3/p3-role-return.mjs";
const PINNED_HELPER_ROOT = `${BASELINE_ROOT}/MyBrain/verify`;
const CANDIDATE_ROOT = "C:/Users/tane1/AppData/Local/p3-coordinator-records/open-service-top-hero-v1-20260809/r4-progress-repair/v1/f8657db3a6c739184e02a6d411efaee3965dea822508791a46eb9914c2b91a6c/baseline-seq1-attempt1";
const FIXTURE_ROOT = `${WORKSPACE_ROOT}/.r4-coordinator-stage/progress-repair-dry-run-${ACTIVATION_ID}-v5`;

function fail(message) {
  throw new Error(message);
}

function toForwardSlash(path) {
  return resolve(path).replace(/\\/g, "/");
}

function isWithin(parent, candidate) {
  const route = relative(resolve(parent), resolve(candidate));
  return route === "" || (!route.startsWith("..") && !isAbsolute(route));
}

function assertOutside(candidate, forbidden, label) {
  for (const root of forbidden) {
    if (isWithin(root, candidate) || isWithin(candidate, root)) {
      fail(`${label} overlaps forbidden root: ${root}`);
    }
  }
}

function assertRegular(path, label) {
  if (!existsSync(path)) fail(`${label} is missing: ${path}`);
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile()) fail(`${label} must be a regular file: ${path}`);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path, label) {
  assertRegular(path, label);
  return sha256Bytes(readFileSync(path));
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function mkdirNew(path) {
  if (existsSync(path)) fail(`dry-run refuses to reuse or overwrite an existing fixture path: ${path}`);
  mkdirSync(path, { recursive: false, mode: 0o700 });
}

function mkdirParentsAndNew(root, relativeDirectory) {
  let current = root;
  for (const segment of relativeDirectory.split("/")) {
    current = resolve(current, segment);
    if (!existsSync(current)) mkdirSync(current, { recursive: false, mode: 0o700 });
  }
  return current;
}

function copyRegular(source, destination, label) {
  assertRegular(source, label);
  const relativeDestination = relative(FIXTURE_ROOT, destination).replace(/\\/g, "/");
  const parent = dirname(relativeDestination).replace(/\\/g, "/");
  mkdirParentsAndNew(FIXTURE_ROOT, parent);
  if (existsSync(destination)) fail(`dry-run refuses to overwrite fixture dependency: ${destination}`);
  copyFileSync(source, destination, 0);
  const sourceHash = sha256File(source, `${label} source`);
  const destinationHash = sha256File(destination, `${label} fixture copy`);
  if (sourceHash !== destinationHash) fail(`${label} fixture copy changed bytes.`);
  return { source: toForwardSlash(source), path: relative(FIXTURE_ROOT, destination).replace(/\\/g, "/"), sha256: sourceHash };
}

function helperFilename(id) {
  const names = {
    "return-helper": "p3-role-return.mjs",
    "return-helper-e2e": "p3-role-return.e2e.mjs",
    "return-plan-template": "p3-role-return-plan-template.json",
    "return-manifest-template": "p3-role-return-manifest-template.json",
    "return-feedback-template": "p3-role-return-feedback-template.json",
    "protocol-template": "p3-role-handoff-protocol-template.json",
    "registry-template": "p3-role-handoff-registry-template.json",
    "packet-helper": "p3-role-packet.mjs",
    "packet-plan-template": "p3-role-packet-plan-template.json",
  };
  if (!names[id]) fail(`runtime authority has an unsupported helper release id: ${id}`);
  return names[id];
}

function diffPaths(left, right, path = "") {
  if (Object.is(left, right)) return [];
  const leftObject = left && typeof left === "object";
  const rightObject = right && typeof right === "object";
  if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) return [path || "<root>"];
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].sort().flatMap((key) => diffPaths(left[key], right[key], path ? `${path}.${key}` : key));
}

function gitCommonDirectory(worktree) {
  const result = spawnSync("git", ["-C", worktree, "rev-parse", "--git-common-dir"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) fail(`could not read common Git directory for ${worktree}: ${result.stderr || result.error || "unknown error"}`);
  const reported = result.stdout.trim();
  if (!reported) fail(`Git returned no common directory for ${worktree}.`);
  return toForwardSlash(resolve(worktree, reported));
}

function writeNew(path, bytes, label) {
  if (existsSync(path)) fail(`dry-run refuses to overwrite ${label}: ${path}`);
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  return sha256Bytes(bytes);
}

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") {
    fail("Usage: node tools/r4-progress-repair-dry-run.mjs --dry-run");
  }

  assertRegular(`${ACTIVATION_ROOT}/return-plan-baseline-seq1-attempt1.json`, "source return plan");
  assertRegular(ARCHIVE_PATH, "submitted return archive");
  const archiveSha256 = sha256File(ARCHIVE_PATH, "submitted return archive");
  if (archiveSha256 !== ARCHIVE_SHA256) fail("submitted return archive SHA-256 differs from the reported immutable value.");

  const commonGitDirectories = [gitCommonDirectory(BASELINE_ROOT), gitCommonDirectory(CURRENT_ROOT)];
  assertOutside(CANDIDATE_ROOT, [PILOT_ROOT, BASELINE_ROOT, CURRENT_ROOT, ROLE_HOME, ...commonGitDirectories], "candidate output root");

  const sourcePlanPath = `${ACTIVATION_ROOT}/return-plan-baseline-seq1-attempt1.json`;
  const sourcePlanBytes = readFileSync(sourcePlanPath);
  const sourcePlan = readJson(sourcePlanPath, "source return plan");
  const canonicalSource = Buffer.from(`${JSON.stringify(sourcePlan, null, 2)}\n`, "utf8");
  if (!sourcePlanBytes.equals(canonicalSource)) fail("source return plan is not canonical two-space JSON; refusing a line-exact repair assertion.");

  const candidatePlan = JSON.parse(JSON.stringify(sourcePlan));
  candidatePlan.authority.progress = {
    ledgerPath: `${CANDIDATE_ROOT}/progress/role-return-progress.jsonl`,
    checkpointProofDirectory: `${CANDIDATE_ROOT}/progress/checkpoint-proofs`,
  };
  const changedPaths = diffPaths(sourcePlan, candidatePlan);
  const allowedChanges = ["authority.progress.checkpointProofDirectory", "authority.progress.ledgerPath"];
  if (JSON.stringify(changedPaths) !== JSON.stringify(allowedChanges)) {
    fail(`repair changed fields other than authority.progress: ${changedPaths.join(", ")}`);
  }
  const candidatePlanBytes = Buffer.from(`${JSON.stringify(candidatePlan, null, 2)}\n`, "utf8");
  const sourceLines = sourcePlanBytes.toString("utf8").split("\n");
  const candidateLines = candidatePlanBytes.toString("utf8").split("\n");
  const changedLineCount = sourceLines.reduce((count, line, index) => count + (line === candidateLines[index] ? 0 : 1), 0);
  if (sourceLines.length !== candidateLines.length || changedLineCount !== 2) {
    fail("repair is not a two-line authority.progress-only byte-level replacement.");
  }

  mkdirNew(FIXTURE_ROOT);
  mkdirParentsAndNew(FIXTURE_ROOT, "progress");
  const fixturePlan = JSON.parse(JSON.stringify(sourcePlan));
  fixturePlan.authority.progress = {
    ledgerPath: `${toForwardSlash(FIXTURE_ROOT)}/progress/role-return-progress.jsonl`,
    checkpointProofDirectory: `${toForwardSlash(FIXTURE_ROOT)}/progress/checkpoint-proofs`,
  };
  const fixtureChangedPaths = diffPaths(sourcePlan, fixturePlan);
  if (JSON.stringify(fixtureChangedPaths) !== JSON.stringify(allowedChanges)) fail("fixture plan changes fields outside authority.progress.");

  const dependencies = [
    ["activation-receipt.json", "activation-receipt.json"],
    ["runtime-authority-baseline-delivery-1.json", "runtime-authority-baseline-delivery-1.json"],
    ["protocol-baseline.json", "protocol-baseline.json"],
    ["protocol-current.json", "protocol-current.json"],
    ["registry-baseline-delivery-1.json", "registry-baseline-delivery-1.json"],
    ["packet-manifest-baseline-delivery-1.json", "packet-manifest-baseline-delivery-1.json"],
    ["packet-plan-baseline-delivery-1.json", "packet-plan-baseline-delivery-1.json"],
    ["delivery-receipts/baseline-implementation-delivery-1-624e2521f5e3f95d3f0ed3d193349b63.json", "delivery-receipts/baseline-implementation-delivery-1-624e2521f5e3f95d3f0ed3d193349b63.json"],
    ["packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/return-authority.json", "packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/return-authority.json"],
    ["packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/input/assignment.json", "packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/input/assignment.json"],
    ["packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/input/references/pc-first-view.png", "packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/input/references/pc-first-view.png"],
    ["packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/input/references/sp-first-view.png", "packet-staging/624e2521f5e3f95d3f0ed3d193349b63/delivery/input/references/sp-first-view.png"],
  ];
  const copiedDependencies = dependencies.map(([sourceRelative, destinationRelative]) => copyRegular(
    `${ACTIVATION_ROOT}/${sourceRelative}`,
    resolve(FIXTURE_ROOT, destinationRelative),
    `immutable dependency ${sourceRelative}`,
  ));
  const sourcePlanCopy = copyRegular(
    sourcePlanPath,
    resolve(FIXTURE_ROOT, "source-records/return-plan-baseline-seq1-attempt1.json"),
    "immutable source return plan",
  );
  const fixturePlanPath = `${FIXTURE_ROOT}/return-plan-baseline-seq1-attempt1.json`;
  const fixturePlanSha256 = writeNew(fixturePlanPath, Buffer.from(`${JSON.stringify(fixturePlan, null, 2)}\n`, "utf8"), "fixture repair plan");

  const runtimeAuthority = readJson(`${ACTIVATION_ROOT}/runtime-authority-baseline-delivery-1.json`, "runtime authority");
  const helperRelease = runtimeAuthority.helperRelease;
  if (!Array.isArray(helperRelease) || helperRelease.length === 0) fail("runtime authority has no helper release.");
  const copiedHelperRelease = helperRelease.map((entry) => {
    const filename = helperFilename(entry.id);
    const source = `${PINNED_HELPER_ROOT}/${filename}`;
    const actualSha256 = sha256File(source, `pinned helper release ${entry.id}`);
    if (actualSha256 !== entry.sha256) fail(`pinned helper release ${entry.id} does not match the activation binding.`);
    return copyRegular(source, resolve(FIXTURE_ROOT, "helper-release", filename), `pinned helper release ${entry.id}`);
  });
  const pinnedHelper = helperRelease.find((entry) => entry.id === "return-helper");
  if (!pinnedHelper) fail("runtime authority is missing the return-helper release.");
  const pinnedHelperPath = `${FIXTURE_ROOT}/helper-release/p3-role-return.mjs`;
  const pinnedHelperHash = sha256File(pinnedHelperPath, "fixture pinned return helper");
  if (pinnedHelperHash !== pinnedHelper.sha256) fail("fixture pinned return helper does not match the activation binding.");
  const genericHelperHash = sha256File(HELPER_PATH, "current generic return helper");

  const sourceCheck = spawnSync(process.execPath, [pinnedHelperPath, "--check", sourcePlanPath, ARCHIVE_PATH, BASELINE_ROOT], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  const expectedSourceFailure = "authority.progress.ledgerPath must stay outside role-visible or runtime-owned directories.";
  if (sourceCheck.status === 0 || !sourceCheck.stderr.includes(expectedSourceFailure)) {
    fail(`source return plan did not fail only at the expected progress-isolation boundary: ${sourceCheck.stderr || sourceCheck.stdout || "unknown result"}`);
  }

  const check = spawnSync(process.execPath, [pinnedHelperPath, "--check", fixturePlanPath, ARCHIVE_PATH, BASELINE_ROOT], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (check.status !== 0) fail(`fixture p3-role-return --check failed: ${check.stderr || check.error || "unknown error"}`);
  let validation;
  try {
    validation = JSON.parse(check.stdout);
  } catch (error) {
    fail(`fixture p3-role-return --check did not return JSON: ${error.message}`);
  }
  if (validation.planSha256 !== fixturePlanSha256 || validation.returnArchiveSha256 !== ARCHIVE_SHA256) {
    fail("fixture validation did not bind the generated fixture plan and submitted archive.");
  }

  const proposal = {
    version: 1,
    kind: "p3-r4-progress-repair-dry-run",
    status: "dry-run-success",
    ownerApproval: "not-created",
    activation: { id: ACTIVATION_ID, root: ACTIVATION_ROOT },
    pairId: PAIR_ID,
    condition: "baseline",
    handoffId: HANDOFF_ID,
    submittedArchive: { path: ARCHIVE_PATH, sha256: ARCHIVE_SHA256 },
    candidateOutputRoot: CANDIDATE_ROOT,
    candidatePlan: {
      path: "return-plan-baseline-seq1-attempt1.json",
      sha256: sha256Bytes(candidatePlanBytes),
      sourcePlanSha256: sha256Bytes(sourcePlanBytes),
      changedFields: allowedChanges,
      changedLineCount,
      progress: candidatePlan.authority.progress,
    },
    fixture: {
      root: toForwardSlash(FIXTURE_ROOT),
      planSha256: fixturePlanSha256,
      progress: fixturePlan.authority.progress,
      p3RoleReturnCheck: {
        result: "PASS",
        returnArchiveSha256: validation.returnArchiveSha256,
        inputStagingSha256: validation.inputStagingSha256,
        priorProgressEntrySha256: validation.authority.progress.priorProgressEntrySha256,
      },
    },
    sourcePlanCheck: {
      result: "EXPECTED_FAIL",
      reason: expectedSourceFailure,
    },
    preservedDependencies: [...copiedDependencies, sourcePlanCopy, ...copiedHelperRelease],
    helper: {
      activationPinnedSource: `${PINNED_HELPER_ROOT}/p3-role-return.mjs`,
      sha256: pinnedHelperHash,
      candidateBundlePath: "helper-release/p3-role-return.mjs",
      genericPathObserved: HELPER_PATH,
      genericPathObservedSha256: genericHelperHash,
      genericMatchesActivationBinding: genericHelperHash === pinnedHelperHash,
    },
    requiredFutureRecords: [
      "repair-authority-baseline-seq1-attempt1.json: owner-approved append-only repair authority binding the source activation, submitted archive, candidate plan, and candidate output root",
      "return-plan-baseline-seq1-attempt1.json: candidate plan with only authority.progress changed",
      "copy-integrity-manifest.json: every preserved dependency path and SHA-256",
      "source-records/return-plan-baseline-seq1-attempt1.json: immutable source plan copy",
      "helper-release/: byte-identical copies of the activation-pinned helper release; future validation and apply must use helper-release/p3-role-return.mjs rather than rely on the generic path's then-current bytes",
      "progress/: empty coordinator progress root before the first --apply; no progress record is created by this dry-run",
    ],
    prohibitedByThisDryRun: [
      "candidate output-root creation",
      "ownerApproved final-record generation",
      "archive application",
      "generic helper mutation",
      "worktree, common-Git, role-home, lifecycle, Figma, browser, or P-11 mutation",
    ],
  };
  const reportPath = `${FIXTURE_ROOT}/dry-run-report.json`;
  const reportSha256 = writeNew(reportPath, Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`, "utf8"), "dry-run report");
  process.stdout.write(`${JSON.stringify({
    result: "PASS",
    fixtureRoot: toForwardSlash(FIXTURE_ROOT),
    dryRunReport: { path: toForwardSlash(reportPath), sha256: reportSha256 },
    sourcePlanSha256: sha256Bytes(sourcePlanBytes),
    candidatePlanSha256: sha256Bytes(candidatePlanBytes),
    fixturePlanSha256,
    submittedArchiveSha256: ARCHIVE_SHA256,
    helperSha256: pinnedHelperHash,
    genericHelperObservedSha256: genericHelperHash,
    copiedDependencyCount: copiedDependencies.length + 1 + copiedHelperRelease.length,
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`R4 PROGRESS REPAIR DRY-RUN: ${error.message}\n`);
  process.exitCode = 1;
}
