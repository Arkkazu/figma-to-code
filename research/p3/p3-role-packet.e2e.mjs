#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const templateDirectory = process.env.FIGMA_GATE_TEMPLATE_DIR || dirname(fileURLToPath(import.meta.url));
const script = resolve(templateDirectory, "p3-role-packet.mjs");
const workspace = mkdtempSync(join(tmpdir(), "p3-role-packet-e2e-"));

const forbiddenArtifacts = [
  { id: "comparison-contract", description: "P-3 comparison contract" },
  { id: "decision-j", description: "Decision J record" },
  { id: "clean-room-evidence", description: "Condition clean-room evidence" },
  { id: "template", description: "P-3 template artifact" },
];
const prohibitedArtifacts = ["other-source", "other-diffs", "other-checkpoints", "other-conversation", "other-results"];

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

function stableJsonSha256(value) {
  return digest(Buffer.from(JSON.stringify(stable(value)), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function write(root, relativePath, value) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function putAscii(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "ascii");
  require(bytes.length <= length, `USTAR fixture field is too long: ${value}`);
  bytes.copy(buffer, offset);
}

function putOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, "0");
  require(text.length === length - 1, `USTAR fixture octal field is too long: ${value}`);
  putAscii(buffer, offset, length - 1, text);
  buffer[offset + length - 1] = 0;
}

function ustarHeader(path, bytes, type = "0", options = {}) {
  const header = Buffer.alloc(512, 0);
  putAscii(header, 0, 100, path);
  putOctal(header, 100, 8, type === "5" ? 0o755 : 0o600);
  putOctal(header, 108, 8, 0);
  putOctal(header, 116, 8, 0);
  putOctal(header, 124, 12, bytes.length);
  putOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  if (options.linkname) putAscii(header, 157, 100, options.linkname);
  putAscii(header, 257, 6, options.magic ?? "ustar\0");
  putAscii(header, 263, 2, options.version ?? "00");
  putAscii(header, 265, 32, "coordinator");
  putAscii(header, 297, 32, "coordinator");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = `${checksum.toString(8).padStart(6, "0")}\0 `;
  putAscii(header, 148, 8, checksumText);
  return header;
}

function plainUstar(entries) {
  const blocks = [];
  for (const entry of entries) {
    const bytes = Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes ?? "", "utf8");
    blocks.push(ustarHeader(entry.path, bytes, entry.type ?? "0", entry));
    blocks.push(bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

function attachment(path, logicalPath = path, origin = "same-condition coordinator input") {
  const target = join(this.packetRoot, path);
  return { logicalPath, path, sha256: digest(readFileSync(target)), origin };
}

function cleanRoomAuthorization() {
  return {
    version: 1,
    pairId: "p3-role-packet-e2e",
    conditions: [
      {
        condition: "baseline",
        evidencePath: "MyBrain/verify/p3-baseline-evidence.json",
        workspaceId: "baseline-workspace-id",
        worktreeRoot: "c:/p3-role-packet-e2e/baseline",
        implementation: { actor: "baseline-implementation-actor", contextId: "baseline-implementation-context" },
        review: { actor: "baseline-review-actor", contextId: "baseline-review-context" },
        otherWorkspaceId: "current-workspace-id",
        isolationMechanism: "Owner-operated procedural boundary with side-only staging and coordinator-only lifecycle.",
        otherConditionArtifactsAccessible: false,
        prohibitedArtifacts,
      },
      {
        condition: "current",
        evidencePath: "MyBrain/verify/p3-current-evidence.json",
        workspaceId: "current-workspace-id",
        worktreeRoot: "c:/p3-role-packet-e2e/current",
        implementation: { actor: "current-implementation-actor", contextId: "current-implementation-context" },
        review: { actor: "current-review-actor", contextId: "current-review-context" },
        otherWorkspaceId: "baseline-workspace-id",
        isolationMechanism: "Owner-operated procedural boundary with side-only staging and coordinator-only lifecycle.",
        otherConditionArtifactsAccessible: false,
        prohibitedArtifacts,
      },
    ],
  };
}

function makeDecision(authorization) {
  return {
    version: 2,
    decisionId: "J",
    status: "approved",
    ownerApproved: true,
    pairId: authorization.pairId,
    cleanRoomAuthorization: clone(authorization),
    cleanRoomAuthorizationStableJsonSha256: stableJsonSha256(authorization),
  };
}

function createCase(name, files, attachmentFactory, options = {}) {
  const root = join(workspace, name);
  const packetRoot = join(root, "packet");
  for (const [relativePath, value] of Object.entries(files)) write(packetRoot, relativePath, value);
  const context = { packetRoot };
  const attachments = attachmentFactory.call(context);
  const authorization = options.authorization ?? cleanRoomAuthorization();
  const decision = options.decision ?? makeDecision(authorization);
  const decisionPath = join(root, "owner-decision-j.json");
  writeJson(decisionPath, decision);
  const contract = options.contract ?? {
    version: 13,
    pairId: authorization.pairId,
    condition: options.recipientCondition ?? "baseline",
    shared: {
      cleanRoomAuthorization: clone(authorization),
      ownerDecisionJ: { path: "owner-decision-j.json", sha256: digest(readFileSync(decisionPath)) },
    },
    run: { workspaceId: "recipient-workspace" },
  };
  const contractPath = join(root, "comparison-contract.json");
  writeJson(contractPath, contract);
  const plan = {
    version: 3,
    kind: "p3-role-packet-plan",
    packetRoot: "packet",
    roleAttachments: attachments,
    identityAuthority: {
      comparisonContract: { path: "comparison-contract.json", sha256: digest(readFileSync(contractPath)) },
      ownerDecisionJ: { path: "owner-decision-j.json", sha256: digest(readFileSync(decisionPath)) },
      recipientCondition: options.recipientCondition ?? "baseline",
    },
    forbiddenArtifacts,
  };
  const planPath = join(root, "coordinator-only-plan.json");
  writeJson(planPath, plan);
  return { root, packetRoot, planPath, plan, authorization, decision, decisionPath, contract, contractPath };
}

function savePlan(caseValue) {
  writeJson(caseValue.planPath, caseValue.plan);
}

function saveContract(caseValue) {
  writeJson(caseValue.contractPath, caseValue.contract);
  caseValue.plan.identityAuthority.comparisonContract.sha256 = digest(readFileSync(caseValue.contractPath));
  savePlan(caseValue);
}

function saveDecision(caseValue) {
  writeJson(caseValue.decisionPath, caseValue.decision);
  caseValue.contract.shared.ownerDecisionJ.sha256 = digest(readFileSync(caseValue.decisionPath));
  caseValue.plan.identityAuthority.ownerDecisionJ.sha256 = digest(readFileSync(caseValue.decisionPath));
  saveContract(caseValue);
}

function run(planPath, expectedSuccess) {
  const result = spawnSync(process.execPath, [script, "--check", planPath], { cwd: workspace, encoding: "utf8" });
  const spawnError = result.error ? `\nspawn error: ${result.error.message}` : "";
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}${spawnError}`;
  if (expectedSuccess && result.status !== 0) throw new Error(`expected pass: ${output}`);
  if (!expectedSuccess && result.status === 0) throw new Error(`expected rejection: ${output}`);
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", output };
}

function runExpand(archivePath, destination, expectedSuccess) {
  const result = spawnSync(process.execPath, [script, "--expand-ustar", archivePath, destination], { cwd: workspace, encoding: "utf8" });
  const spawnError = result.error ? `\nspawn error: ${result.error.message}` : "";
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}${spawnError}`;
  if (expectedSuccess && result.status !== 0) throw new Error(`expected expansion pass: ${output}`);
  if (!expectedSuccess && result.status === 0) throw new Error(`expected expansion rejection: ${output}`);
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", output };
}

function expectRejected(caseValue, expected) {
  const result = run(caseValue.planPath, false);
  require(result.output.includes(expected), `wrong rejection; expected ${JSON.stringify(expected)}, got ${result.output}`);
}

try {
  const peer = cleanRoomAuthorization().conditions[1];
  const positive = createCase("positive", {
    "brief.txt": "Implement only the supplied component. This template reference is a normal image asset.\n",
    "metadata.json": `${JSON.stringify({ component: "hero", checkpoints: ["frozen"] })}\n`,
    "assets/reference.bin": Buffer.from([0xff, 0x00, 0x80, 0x01]),
    "assets/template-reference.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }, function makeAttachments() {
    return [
      attachment.call(this, "brief.txt", "assignment/brief.txt"),
      attachment.call(this, "metadata.json", "assignment/metadata.json"),
      attachment.call(this, "assets/reference.bin", "assets/reference.bin"),
      attachment.call(this, "assets/template-reference.png", "assets/template-reference.png"),
    ];
  });
  const positivePaths = ["brief.txt", "metadata.json", "assets/reference.bin", "assets/template-reference.png"];
  const positiveBefore = new Map(positivePaths.map((path) => [path, digest(readFileSync(join(positive.packetRoot, path)))]));
  const positiveResult = run(positive.planPath, true);
  require(positiveResult.stderr === "", `positive check must not write stderr: ${positiveResult.stderr}`);
  const manifest = JSON.parse(positiveResult.stdout);
  require(manifest.version === 3, "positive check did not emit the version 3 coordinator manifest");
  require(manifest.kind === "p3-role-packet-manifest", "positive check did not emit the coordinator manifest");
  require(manifest.coordinatorOnly === true, "manifest must be marked coordinator-only");
  require(manifest.attachmentCount === 4, "positive manifest attachment count is wrong");
  require(manifest.identityAuthority?.recipientCondition === "baseline" && manifest.identityAuthority?.peerCondition === "current", "positive manifest did not bind the actual comparison contract authority");
  require(manifest.identityAuthority?.comparisonContract?.sha256 === positive.plan.identityAuthority.comparisonContract.sha256, "positive manifest did not report the bound comparison contract");
  require(manifest.identityAuthority?.ownerDecisionJ?.sha256 === positive.plan.identityAuthority.ownerDecisionJ.sha256, "positive manifest did not report the bound owner Decision J");
  require(manifest.identityAuthority?.cleanRoomAuthorizationStableJsonSha256 === stableJsonSha256(positive.authorization), "positive manifest did not report the stable authorization hash");
  require(manifest.identityAuthority?.derivedPeerIdentityFields?.join(",") === "workspaceId,worktreeRoot,implementation.actor,implementation.contextId,review.actor,review.contextId,evidencePath,otherWorkspaceId", "positive manifest did not report the required mechanically derived peer identity fields");
  require(manifest.roleInputPathExclusions?.map((entry) => entry.id).join(",") === "git-metadata,project-mybrain,agent-instructions,project-state,p3-contract-records,comparison-contract,decision-j,clean-room-evidence,evaluator-record,figma-gate-state,p3-ledger,p3-pair-lock", "positive manifest did not report the complete static role-input exclusions");
  require(manifest.roleAttachments[2].scan.payloadScan === "authority-fingerprints-strict-json-source-class-raw-bytes-and-recursive-json-identities", "binary attachment must use the authority-bound payload scan");
  require(manifest.roleAttachments[2].scan.forbiddenIdentity.payload === "clear" && manifest.roleAttachments[2].scan.forbiddenIdentity.jsonPayload === "not-json", "binary payload scan result is wrong");
  require(manifest.roleAttachments[1].scan.restrictedArtifact.jsonSourceClass === "clear", "ordinary JSON must not be classified as a restricted P-3 source");
  require(manifest.scan.authorityBinding === "comparison-contract-and-owner-decision-j-clear", "authority binding scan result is wrong");
  require(!existsSync(join(positive.root, ".figma-gate")), "role packet check must not create P-3 runtime state");
  for (const path of positivePaths) {
    require(positiveBefore.get(path) === digest(readFileSync(join(positive.packetRoot, path))), `role packet check changed attachment ${path}`);
  }

  const legacyAuthority = createCase("legacy-v12-authority", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  legacyAuthority.contract.version = 12;
  saveContract(legacyAuthority);
  expectRejected(legacyAuthority, "version 12 and every earlier contract are rejected without migration");

  const ustarRoot = join(workspace, "ustar-expansion");
  mkdirSync(ustarRoot, { recursive: true });
  const ustarArchive = join(ustarRoot, "safe-input.ustar.tar");
  writeFileSync(ustarArchive, plainUstar([
    { path: "assets", bytes: Buffer.alloc(0), type: "5" },
    { path: "brief.txt", bytes: "same-condition brief\n" },
    { path: "assets/reference.bin", bytes: Buffer.from([0xff, 0x00, 0x80, 0x01]) },
  ]));
  const expandedRoot = join(ustarRoot, "expanded");
  const expanded = runExpand(ustarArchive, expandedRoot, true);
  require(expanded.stderr === "", `USTAR expansion must not write stderr: ${expanded.stderr}`);
  const expansionManifest = JSON.parse(expanded.stdout);
  require(expansionManifest.kind === "p3-role-packet-ustar-expansion-manifest" && expansionManifest.coordinatorOnly === true, "USTAR expansion did not emit a coordinator-only manifest");
  require(expansionManifest.regularFileCount === 2 && expansionManifest.entries.map((entry) => entry.path).join(",") === "assets/reference.bin,brief.txt", "USTAR expansion manifest did not enumerate regular files deterministically");
  require(readFileSync(join(expandedRoot, "brief.txt"), "utf8") === "same-condition brief\n", "USTAR expansion changed a text payload");
  require(digest(readFileSync(join(expandedRoot, "assets/reference.bin"))) === digest(Buffer.from([0xff, 0x00, 0x80, 0x01])), "USTAR expansion changed a binary payload");

  const invalidUstar = join(ustarRoot, "invalid.tar");
  writeFileSync(invalidUstar, Buffer.from("not a tar archive\n", "utf8"));
  require(runExpand(invalidUstar, join(ustarRoot, "invalid-output"), false).output.includes("complete 512-byte blocks"), "arbitrary non-USTAR input must be rejected");

  for (const [name, archive, expected] of [
    ["traversal", plainUstar([{ path: "../escape.txt", bytes: "blocked\n" }]), "without '..'"],
    ["symlink", plainUstar([{ path: "link", bytes: Buffer.alloc(0), type: "2", linkname: "target" }]), "links, PAX/GNU extensions, and special files"],
    ["pax", plainUstar([{ path: "PaxHeader", bytes: "path=brief.txt\n", type: "x" }]), "links, PAX/GNU extensions, and special files"],
    ["gnu", plainUstar([{ path: "brief.txt", bytes: "blocked\n", magic: "ustar ", version: " \0" }]), "only plain USTAR archives"],
    ["prohibited-git", plainUstar([{ path: ".git/config", bytes: "blocked\n" }]), "prohibited role-input path"],
    ["prohibited-state", plainUstar([{ path: "STATE.md", bytes: "blocked\n" }]), "prohibited role-input path"],
    ["nested-archive", plainUstar([{ path: "assets/replay.tar", bytes: "blocked\n" }]), "does not accept archive attachments"],
  ]) {
    const archivePath = join(ustarRoot, `${name}.ustar.tar`);
    writeFileSync(archivePath, archive);
    const result = runExpand(archivePath, join(ustarRoot, `${name}-output`), false);
    require(result.output.includes(expected), `USTAR ${name} rejection was not specific: ${result.output}`);
  }

  const payloadIdentity = createCase("identity-payload", {
    "brief.txt": `Do not expose ${peer.workspaceId} to the role.\n`,
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  expectRejected(payloadIdentity, "forbidden identity string in attachment payload");

  const binaryIdentity = createCase("identity-binary", {
    "asset.bin": Buffer.concat([
      Buffer.from([0xff, 0x00, 0x80]),
      Buffer.from(peer.implementation.actor, "utf8"),
      Buffer.from([0x01, 0xfe]),
    ]),
  }, function makeAttachments() { return [attachment.call(this, "asset.bin")]; });
  expectRejected(binaryIdentity, "forbidden identity string in attachment payload");

  const escapedPeerWindowsWorktree = createCase("identity-json-escaped-windows-worktree", {
    "payload.json": `${JSON.stringify({ neutral: { root: peer.worktreeRoot.replaceAll("/", "\\") } })}\n`,
  }, function makeAttachments() { return [attachment.call(this, "payload.json")]; });
  expectRejected(escapedPeerWindowsWorktree, "forbidden identity string in attachment payload");

  const unicodeEscapedPeerWindowsWorktree = createCase("identity-json-unicode-escaped-windows-worktree", {
    "payload.json": `{"neutral":{"root":"${peer.worktreeRoot.replaceAll("/", "\\u005c")}"}}\n`,
  }, function makeAttachments() { return [attachment.call(this, "payload.json")]; });
  expectRejected(unicodeEscapedPeerWindowsWorktree, "forbidden identity string in JSON attachment payload");

  const canonicalCaseVariant = createCase("identity-canonical-case-variant", {
    "brief.txt": peer.worktreeRoot.replaceAll("/", "\\").toUpperCase(),
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  expectRejected(canonicalCaseVariant, "forbidden identity string in attachment payload");

  const archiveAttachment = createCase("archive-attachment", {
    "return.tar": Buffer.from("not parsed as an archive\n", "utf8"),
  }, function makeAttachments() { return [attachment.call(this, "return.tar")]; });
  expectRejected(archiveAttachment, "does not accept archive attachments");

  const pathIdentity = createCase("identity-path", {
    "current-workspace-id/brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "current-workspace-id/brief.txt", "assignment/brief.txt")]; });
  expectRejected(pathIdentity, "forbidden identity string in an attachment path");

  const logicalIdentity = createCase("identity-logical", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt", "current-workspace-id/brief.txt")]; });
  expectRejected(logicalIdentity, "forbidden identity string in an attachment logicalPath");

  const stateLogicalPath = createCase("state-logical-path", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt", "STATE.md")]; });
  expectRejected(stateLogicalPath, "prohibited role-input path");

  for (const [name, filename] of [
    ["comparison-contract", "fidelity-comparison-baseline.json"],
    ["decision-j", "p3-owner-decision-J-v2.json"],
    ["clean-room", "p3-clean-room-baseline.json"],
    ["template", "p3-contract-template.json"],
  ]) {
    const restricted = createCase(`restricted-${name}`, { [filename]: "{}\n" }, function makeAttachments() {
      return [attachment.call(this, filename)];
    });
    const result = run(restricted.planPath, false);
    require(result.output.includes("restricted P-3 artifact") || result.output.includes("prohibited role-input path"), `restricted ${name} path did not fail closed: ${result.output}`);
  }

  for (const [name, filename] of [
    ["git", ".git/config"],
    ["mybrain", "MyBrain/verify/raw-input.json"],
    ["agents", "AGENTS.md"],
    ["claude", "CLAUDE.md"],
    ["state", "records/STATE.md"],
    ["contract-records", "P3-CONTRACT-RECORDS.md"],
    ["evaluator-input", "p3-evaluator-input-record.json"],
    ["evaluator-baseline", "p3-evaluator-baseline-pilot.json"],
    ["figma-gate", ".figma-gate/active.json"],
    ["ledger", "figma-p3-comparison-ledger.jsonl"],
    ["pair-lock", "figma-p3-comparison-pair-locks/pair-id.lock"],
  ]) {
    const restricted = createCase(`role-input-${name}`, { [filename]: "neutral packet payload\n" }, function makeAttachments() {
      return [attachment.call(this, filename)];
    });
    expectRejected(restricted, "prohibited role-input path");
  }

  const bareCommonGit = createCase("embedded-bare-common-git", {
    "common-git/HEAD": "ref: refs/heads/main\n",
    "common-git/objects/placeholder": "object\n",
    "common-git/refs/heads/main": "deadbeef\n",
  }, function makeAttachments() {
    return [
      attachment.call(this, "common-git/HEAD"),
      attachment.call(this, "common-git/objects/placeholder"),
      attachment.call(this, "common-git/refs/heads/main"),
    ];
  });
  expectRejected(bareCommonGit, "prohibited role-input path");

  const actualWorktreeOverlap = createCase("actual-worktree-overlap", {
    "brief.txt": "neutral packet payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  actualWorktreeOverlap.authorization.conditions[0].worktreeRoot = actualWorktreeOverlap.packetRoot.replaceAll("\\", "/").toLowerCase();
  actualWorktreeOverlap.decision = makeDecision(actualWorktreeOverlap.authorization);
  actualWorktreeOverlap.contract.shared.cleanRoomAuthorization = clone(actualWorktreeOverlap.authorization);
  actualWorktreeOverlap.decision.cleanRoomAuthorization = clone(actualWorktreeOverlap.contract.shared.cleanRoomAuthorization);
  actualWorktreeOverlap.decision.cleanRoomAuthorizationStableJsonSha256 = stableJsonSha256(actualWorktreeOverlap.contract.shared.cleanRoomAuthorization);
  saveDecision(actualWorktreeOverlap);
  expectRejected(actualWorktreeOverlap, "must not be an actual baseline worktree");

  const renamedExactContract = createCase("renamed-exact-contract-payload", {
    "neutral.json": "placeholder\n",
  }, function makeAttachments() { return [attachment.call(this, "neutral.json")]; });
  writeFileSync(join(renamedExactContract.packetRoot, "neutral.json"), readFileSync(renamedExactContract.contractPath));
  renamedExactContract.plan.roleAttachments[0].sha256 = digest(readFileSync(join(renamedExactContract.packetRoot, "neutral.json")));
  savePlan(renamedExactContract);
  expectRejected(renamedExactContract, "comparison-contract source fingerprint");

  const renamedLegacyContract = createCase("renamed-legacy-v10-contract-payload", {
    "neutral.json": "placeholder\n",
  }, function makeAttachments() { return [attachment.call(this, "neutral.json")]; });
  const legacyContractPayload = clone(renamedLegacyContract.contract);
  legacyContractPayload.version = 10;
  writeJson(join(renamedLegacyContract.packetRoot, "neutral.json"), legacyContractPayload);
  renamedLegacyContract.plan.roleAttachments[0].sha256 = digest(readFileSync(join(renamedLegacyContract.packetRoot, "neutral.json")));
  savePlan(renamedLegacyContract);
  expectRejected(renamedLegacyContract, "comparison-contract JSON source class");

  const renamedSemanticDecision = createCase("renamed-semantic-decision-payload", {
    "neutral.json": "placeholder\n",
  }, function makeAttachments() { return [attachment.call(this, "neutral.json")]; });
  const semanticallyDecisionJ = clone(renamedSemanticDecision.decision);
  semanticallyDecisionJ.coordinatorNote = "byte-distinct but still a Decision J record";
  writeJson(join(renamedSemanticDecision.packetRoot, "neutral.json"), semanticallyDecisionJ);
  renamedSemanticDecision.plan.roleAttachments[0].sha256 = digest(readFileSync(join(renamedSemanticDecision.packetRoot, "neutral.json")));
  savePlan(renamedSemanticDecision);
  expectRejected(renamedSemanticDecision, "decision-j JSON source class");

  const renamedSemanticEvaluator = createCase("renamed-semantic-evaluator-payload", {
    "neutral.json": `${JSON.stringify({
      version: 2,
      status: "approved",
      ownerApproved: true,
      approvedAt: "2026-08-10T00:00:00.000Z",
      basis: "owner-approved evaluator baseline",
      artifacts: [{ key: "gate", path: "MyBrain/verify/figma-gate.mjs", sha256: "a".repeat(64) }],
      executionBundleSha256: "b".repeat(64),
    })}\n`,
  }, function makeAttachments() { return [attachment.call(this, "neutral.json")]; });
  expectRejected(renamedSemanticEvaluator, "evaluator-record JSON source class");

  const checksumMismatch = createCase("checksum-mismatch", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() {
    return [{ ...attachment.call(this, "brief.txt"), sha256: "0".repeat(64) }];
  });
  expectRejected(checksumMismatch, "Attachment SHA-256 mismatch");

  const unspecified = createCase("unspecified", {
    "brief.txt": "neutral payload\n",
    "undeclared.txt": "this file must be rejected\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  expectRejected(unspecified, "not declared in roleAttachments");

  const duplicate = createCase("duplicate", {
    "brief.txt": "neutral payload\n",
    "another.txt": "neutral payload two\n",
  }, function makeAttachments() {
    return [
      attachment.call(this, "brief.txt", "assignment.txt"),
      attachment.call(this, "another.txt", "assignment.txt"),
    ];
  });
  expectRejected(duplicate, "duplicate logicalPath");

  const contractShaMismatch = createCase("contract-sha-mismatch", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  contractShaMismatch.plan.identityAuthority.comparisonContract.sha256 = "0".repeat(64);
  savePlan(contractShaMismatch);
  expectRejected(contractShaMismatch, "identityAuthority.comparisonContract SHA-256 mismatch");

  const decisionShaMismatch = createCase("decision-sha-mismatch", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  decisionShaMismatch.plan.identityAuthority.ownerDecisionJ.sha256 = "0".repeat(64);
  savePlan(decisionShaMismatch);
  expectRejected(decisionShaMismatch, "identityAuthority.ownerDecisionJ SHA-256 mismatch");

  const contractDecisionMismatch = createCase("contract-decision-mismatch", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  contractDecisionMismatch.contract.shared.ownerDecisionJ.sha256 = "0".repeat(64);
  saveContract(contractDecisionMismatch);
  expectRejected(contractDecisionMismatch, "must exactly match Comparison contract shared.ownerDecisionJ.sha256");

  const contractDecisionPathMismatch = createCase("contract-decision-path-mismatch", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  contractDecisionPathMismatch.contract.shared.ownerDecisionJ.path = "other-owner-decision-j.json";
  saveContract(contractDecisionPathMismatch);
  expectRejected(contractDecisionPathMismatch, "must resolve from one unambiguous comparison repository root");

  const inconsistentDecisionPlan = createCase("inconsistent-decision-plan", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  inconsistentDecisionPlan.decision.cleanRoomAuthorization.conditions[1].workspaceId = "different-current-workspace-id";
  inconsistentDecisionPlan.decision.cleanRoomAuthorization.conditions[0].otherWorkspaceId = "different-current-workspace-id";
  inconsistentDecisionPlan.decision.cleanRoomAuthorizationStableJsonSha256 = stableJsonSha256(inconsistentDecisionPlan.decision.cleanRoomAuthorization);
  saveDecision(inconsistentDecisionPlan);
  expectRejected(inconsistentDecisionPlan, "cleanRoomAuthorization differs from Comparison contract shared.cleanRoomAuthorization");

  const conditionMismatch = createCase("recipient-condition-mismatch", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  conditionMismatch.plan.identityAuthority.recipientCondition = "current";
  savePlan(conditionMismatch);
  expectRejected(conditionMismatch, "recipientCondition must match Comparison contract.condition");

  const standaloneAuthority = createCase("standalone-authority-rejected", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  standaloneAuthority.plan.identityAuthority.path = "clean-room-authorization.json";
  savePlan(standaloneAuthority);
  expectRejected(standaloneAuthority, "unsupported field(s): path");

  const manualIdentityList = createCase("manual-identity-list-rejected", {
    "brief.txt": "neutral payload\n",
  }, function makeAttachments() { return [attachment.call(this, "brief.txt")]; });
  manualIdentityList.plan.forbiddenIdentityStrings = [peer.workspaceId];
  savePlan(manualIdentityList);
  expectRejected(manualIdentityList, "unsupported field(s): forbiddenIdentityStrings");

  console.log("p3-role-packet E2E PASS");
} finally {
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
}
