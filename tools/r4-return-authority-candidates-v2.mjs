#!/usr/bin/env node
// Read-only generator for the P-3 R4 return-authority v2 design candidate.
// It deliberately has no write mode.  It never starts lifecycle, emits a role
// packet, launches a role, observes P-11, or materializes an approvable record.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const SUPERSEDED_BUNDLE_ID = "400acd6c1c1e3d8bd7449310b2e0e55c59b8bb2e5bd2358ee5fd7d1ca6d1da14";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DESIGN_PATH = join(SCRIPT_DIRECTORY, "r4-return-authority-v2-design.json");

const REL = {
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  componentDecision: "MyBrain/verify/component-decisions-open-service-top-hero-v1.json",
  centralProtocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
  centralRegistry: `records/p3-role-handoff-registry-${PAIR_ID}.json`,
};

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function bytesHash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function stableHash(value) { return bytesHash(Buffer.from(JSON.stringify(stable(value)), "utf8")); }
function posix(pathname) { return normalize(resolve(pathname)).replace(/\\/g, "/"); }
function rootFile(root, relativePath) { return join(root, ...relativePath.split("/")); }
function readBytes(pathname, label) {
  try { return readFileSync(pathname); }
  catch (error) { fail(`${label} is unreadable: ${pathname} (${error.message})`); }
}
function readJson(pathname, label) {
  try { return JSON.parse(readBytes(pathname, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function equalArrays(left, right, label) {
  assert(Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => value === right[index]), `${label} must be ordered-equal.`);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fileReference(pathname, label) {
  const bytes = readBytes(pathname, label);
  return { path: posix(pathname), sha256: bytesHash(bytes) };
}

function loadDesign() {
  const bytes = readBytes(DESIGN_PATH, "v2 candidate design");
  const design = readJson(DESIGN_PATH, "v2 candidate design");
  assert(design.schema === "p3-role-return-authority-candidate-design/v2", "v2 design schema differs.");
  assert(design.pairId === PAIR_ID, "v2 design pairId differs.");
  assert(design.candidateOnly === true && design.runtimeEligible === false && design.ownerApproved === false,
    "v2 design must remain candidate-only, non-runtime, and unapproved.");
  assert(design.supersedes?.candidateBundleId === SUPERSEDED_BUNDLE_ID, "v2 design does not supersede the rejected bundle.");
  assert(design.perSequenceBootstrap?.model === "scope-preserving-per-sequence-bootstrap",
    "v2 design must use per-sequence bootstrap.");
  assert(design.perSequenceBootstrap?.rejectedModel === "sequence-1-attempt-1-all-28-firstComponentFullCreate",
    "v2 design must reject the sequence-1 all-target model.");
  const sequences = design.perSequenceBootstrap?.sequences;
  assert(Array.isArray(sequences) && sequences.length === 6, "v2 design must contain six unresolved sequence allocations.");
  sequences.forEach((entry, index) => {
    assert(entry.sequence === index + 1 && Array.isArray(entry.createTargets) && entry.createTargets.length === 0,
      `v2 design sequence ${index + 1} must contain no resolved createTargets.`);
    assert(entry.allocationStatus === "OWNER_INPUT_REQUIRED", `v2 design sequence ${index + 1} must remain owner-input-required.`);
  });
  return { design, sha256: bytesHash(bytes) };
}

function loadFinalInputs() {
  const baselineContractPath = rootFile(BASELINE, REL.contract);
  const currentContractPath = rootFile(CURRENT, REL.contract);
  const baselineContractBytes = readBytes(baselineContractPath, "baseline comparison contract");
  const currentContractBytes = readBytes(currentContractPath, "current comparison contract");
  const baselineContract = JSON.parse(baselineContractBytes.toString("utf8"));
  const currentContract = JSON.parse(currentContractBytes.toString("utf8"));
  assert(baselineContract.pairId === PAIR_ID && currentContract.pairId === PAIR_ID, "comparison-contract pairId differs.");
  assert(baselineContract.condition === "baseline" && currentContract.condition === "current", "comparison-contract conditions differ.");

  const decisionPath = rootFile(BASELINE, REL.decision);
  const currentDecisionPath = rootFile(CURRENT, REL.decision);
  const decisionBytes = readBytes(decisionPath, "baseline Decision J");
  const currentDecisionBytes = readBytes(currentDecisionPath, "current Decision J");
  assert(decisionBytes.equals(currentDecisionBytes), "baseline/current Decision J bytes differ.");
  const decision = JSON.parse(decisionBytes.toString("utf8"));
  assert(decision.pairId === PAIR_ID && decision.status === "approved" && decision.ownerApproved === true,
    "Decision J is not the approved final record for this pair.");
  const checkpointPlan = decision.scope?.checkpointPlan;
  const changeTargets = decision.scope?.changeTargets;
  assert(Array.isArray(checkpointPlan) && checkpointPlan.length === 6, "Decision J must have the frozen six-component checkpoint plan.");
  assert(Array.isArray(changeTargets) && changeTargets.length === 28, "Decision J must have the frozen 28 change targets.");
  assert(new Set(checkpointPlan).size === checkpointPlan.length, "Decision J checkpoint plan contains duplicates.");
  assert(new Set(changeTargets).size === changeTargets.length, "Decision J changeTargets contains duplicates.");
  assert(changeTargets.every((entry) => typeof entry === "string" && entry.startsWith("site/") && !entry.includes("..")),
    "Decision J changeTargets must be relative site/ paths without traversal.");
  assert(baselineContract.shared?.ownerDecisionJ?.sha256 === bytesHash(decisionBytes)
    && currentContract.shared?.ownerDecisionJ?.sha256 === bytesHash(decisionBytes),
  "comparison contracts do not bind the final Decision J bytes.");

  const componentDecisionPath = rootFile(BASELINE, REL.componentDecision);
  const currentComponentDecisionPath = rootFile(CURRENT, REL.componentDecision);
  const componentDecisionBytes = readBytes(componentDecisionPath, "baseline component-decision record");
  const currentComponentDecisionBytes = readBytes(currentComponentDecisionPath, "current component-decision record");
  assert(componentDecisionBytes.equals(currentComponentDecisionBytes), "baseline/current component-decision bytes differ.");
  const componentDecision = JSON.parse(componentDecisionBytes.toString("utf8"));
  const componentById = new Map((componentDecision.decisions ?? []).map((entry) => [entry.elementId, entry]));
  assert(componentById.size === checkpointPlan.length, "component-decision count differs from checkpoint plan.");

  const protocolPath = rootFile(BASELINE, REL.centralProtocol);
  const currentProtocolPath = rootFile(CURRENT, REL.centralProtocol);
  const protocolBytes = readBytes(protocolPath, "baseline central handoff protocol");
  const currentProtocolBytes = readBytes(currentProtocolPath, "current central handoff protocol");
  assert(protocolBytes.equals(currentProtocolBytes), "baseline/current central handoff protocol bytes differ.");
  const protocol = JSON.parse(protocolBytes.toString("utf8"));
  assert(protocol.pairId === PAIR_ID, "central handoff protocol pairId differs.");
  equalArrays(protocol.componentProtocol?.checkpointPlan, checkpointPlan, "central protocol checkpoint plan");
  const regionsByElementId = new Map((protocol.componentProtocol?.regions ?? []).map((entry) => [entry.elementId, entry]));
  assert(regionsByElementId.size === checkpointPlan.length, "central protocol region count differs from checkpoint plan.");

  const registryPath = `${COORDINATOR}/${REL.centralRegistry}`;
  return {
    decision: { path: REL.decision, sha256: bytesHash(decisionBytes) },
    comparisonContracts: [
      { condition: "baseline", path: posix(baselineContractPath), sha256: bytesHash(baselineContractBytes) },
      { condition: "current", path: posix(currentContractPath), sha256: bytesHash(currentContractBytes) },
    ],
    componentDecision: { path: REL.componentDecision, sha256: bytesHash(componentDecisionBytes) },
    centralProtocol: { path: REL.centralProtocol, sha256: bytesHash(protocolBytes) },
    centralRegistry: fileReference(registryPath, "central handoff registry"),
    checkpointPlan,
    changeTargets,
    components: checkpointPlan.map((elementId, index) => {
      const component = componentById.get(elementId);
      const region = regionsByElementId.get(elementId);
      assert(component && region, `component ${elementId} is absent from a frozen source input.`);
      assert(typeof component.codePath === "string" && component.codePath.trim() !== "",
        `component ${elementId} has no frozen codePath.`);
      assert(region.html !== undefined && region.css !== undefined,
        `central protocol region ${elementId} lacks an HTML or CSS delimiter binding.`);
      return {
        elementId,
        sequence: index + 1,
        codePath: component.codePath,
        delimiterBindings: { html: region.html, css: region.css },
      };
    }),
  };
}

function candidateId(designSha256, inputs) {
  return stableHash({
    schema: "p3-role-return-authority-candidate-bundle/v2",
    pairId: PAIR_ID,
    supersedesCandidateBundleId: SUPERSEDED_BUNDLE_ID,
    designSha256,
    inputs: {
      decision: inputs.decision,
      comparisonContracts: inputs.comparisonContracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry,
    },
  });
}

function buildProtocolCandidate(design, inputs, bundleId) {
  const allocationBySequence = new Map(design.perSequenceBootstrap.sequences.map((entry) => [entry.sequence, entry]));
  const componentReturnScopes = inputs.components.map((component) => {
    const allocation = allocationBySequence.get(component.sequence);
    assert(allocation, `v2 design allocation is missing sequence ${component.sequence}.`);
    return {
      elementId: component.elementId,
      sequence: component.sequence,
      componentDecisionCodePath: component.codePath,
      allowedChangeTargets: [],
      allowedChangeTargetsStatus: "OWNER_INPUT_REQUIRED",
      allowedChangeTargetsUniverse: inputs.changeTargets,
      createTargets: clone(allocation.createTargets),
      createTargetsStatus: allocation.allocationStatus,
      allocationRequirement: allocation.requirement,
      delimiterBindings: component.delimiterBindings,
    };
  });
  return {
    schema: "p3-role-return-authority-candidate/v2",
    recordState: "candidate-only",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_BUNDLE_ID,
    aBByteIdenticalRequired: true,
    deliveryMode: "attachment-only",
    sourceBindings: {
      ownerDecisionJ: inputs.decision,
      comparisonContracts: inputs.comparisonContracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry,
    },
    implementationLoop: {
      checkpointPlan: inputs.checkpointPlan,
      componentReturnScopes,
      perSequenceBootstrap: clone(design.perSequenceBootstrap),
      bootstrapDirectories: clone(design.bootstrapDirectories),
      journalV2: clone(design.journalV2),
      negativeTestRequirements: clone(design.negativeTestRequirements),
    },
    finalizationRequirements: clone(design.finalizationRequirements),
    executionBoundary: clone(design.executionBoundary),
  };
}

function buildRegistryCandidate(inputs, bundleId, condition, protocolVirtualPath, protocolSha256) {
  const contract = inputs.comparisonContracts.find((entry) => entry.condition === condition);
  assert(contract, `comparison-contract binding is missing for ${condition}.`);
  return {
    schema: "p3-role-return-authority-candidate/v2",
    kind: "condition-local-return-registry",
    recordState: "candidate-only",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    condition,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_BUNDLE_ID,
    sourceBindings: {
      comparisonContract: contract,
      ownerDecisionJ: inputs.decision,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry,
    },
    protocolCandidate: { path: protocolVirtualPath, sha256: protocolSha256 },
    recipientPackets: [],
    finalizationRequirements: [
      "No recipient packet, opaqueHandoffId, deliverySequence, packet-manifest hash, attachment hash, or identityLeakScan result exists in this candidate.",
      "Populate delivery facts only after the permitted preflight and packet checks, in a later separately approved final record.",
      "This candidate cannot authorize lifecycle, role delivery/launch, implementation, browser/Figma measurement, or P-11."
    ],
    executionBoundary: {
      pairReadiness: false,
      pairBegin: false,
      pairPreflight: false,
      rolePacket: false,
      roleDelivery: false,
      roleLaunch: false,
      implementation: false,
      browserMeasurement: false,
      figmaMeasurement: false,
      p11: false,
    },
  };
}

function findForbiddenKey(value, key, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], key, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    const nextPath = `${path}.${entryKey}`;
    if (entryKey === key) return nextPath;
    const found = findForbiddenKey(entryValue, key, nextPath);
    if (found) return found;
  }
  return null;
}

function findTrueOwnerApproval(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findTrueOwnerApproval(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, entryValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (key === "ownerApproved" && entryValue === true) return nextPath;
    const found = findTrueOwnerApproval(entryValue, nextPath);
    if (found) return found;
  }
  return null;
}

function validateCandidate(protocol, registries, design) {
  assert(protocol.candidateOnly === true && protocol.runtimeEligible === false && protocol.ownerApproved === false,
    "protocol candidate must remain candidate-only, non-runtime, and unapproved.");
  assert(protocol.recordState === "candidate-only", "protocol candidate must not claim a finalized state.");
  assert(!findForbiddenKey(protocol, "firstComponentFullCreate"), "v2 protocol candidate must not contain firstComponentFullCreate.");
  assert(!findTrueOwnerApproval(protocol), "v2 protocol candidate must not contain ownerApproved:true.");
  for (const scope of protocol.implementationLoop.componentReturnScopes) {
    assert(scope.allowedChangeTargets.length === 0 && scope.createTargets.length === 0,
      `sequence ${scope.sequence} has a resolved allocation in a candidate-only bundle.`);
    assert(scope.allowedChangeTargetsStatus === "OWNER_INPUT_REQUIRED" && scope.createTargetsStatus === "OWNER_INPUT_REQUIRED",
      `sequence ${scope.sequence} allocation status must remain owner-input-required.`);
  }
  for (const registry of registries) {
    assert(registry.candidateOnly === true && registry.runtimeEligible === false && registry.ownerApproved === false,
      `registry candidate ${registry.condition} must remain non-runtime and unapproved.`);
    assert(registry.recipientPackets.length === 0, `registry candidate ${registry.condition} must not fabricate delivery facts.`);
    assert(!findTrueOwnerApproval(registry), `registry candidate ${registry.condition} must not contain ownerApproved:true.`);
  }
  assert(design.executionBoundary.roleLaunch === false && design.executionBoundary.p11 === false,
    "v2 design must not authorize role launch or P-11.");
}

function buildBundle() {
  const { design, sha256: designSha256 } = loadDesign();
  const inputs = loadFinalInputs();
  const bundleId = candidateId(designSha256, inputs);
  const baselineProtocolPath = "protocols/p3-role-return-handoff-protocol-baseline.candidate-only.json";
  const currentProtocolPath = "protocols/p3-role-return-handoff-protocol-current.candidate-only.json";
  const protocol = buildProtocolCandidate(design, inputs, bundleId);
  const protocolBytes = Buffer.from(jsonText(protocol), "utf8");
  const protocolSha256 = bytesHash(protocolBytes);
  const baselineRegistryPath = "baseline/p3-role-return-registry.candidate-only.json";
  const currentRegistryPath = "current/p3-role-return-registry.candidate-only.json";
  const baselineRegistry = buildRegistryCandidate(inputs, bundleId, "baseline", baselineProtocolPath, protocolSha256);
  const currentRegistry = buildRegistryCandidate(inputs, bundleId, "current", currentProtocolPath, protocolSha256);
  validateCandidate(protocol, [baselineRegistry, currentRegistry], design);
  const files = [
    { path: baselineProtocolPath, bytes: protocolBytes },
    { path: currentProtocolPath, bytes: protocolBytes },
    { path: baselineRegistryPath, bytes: Buffer.from(jsonText(baselineRegistry), "utf8") },
    { path: currentRegistryPath, bytes: Buffer.from(jsonText(currentRegistry), "utf8") },
  ].map((entry) => ({ path: entry.path, sha256: bytesHash(entry.bytes), bytes: entry.bytes.length }));
  return {
    schema: "p3-role-return-authority-candidate-bundle/v2",
    status: "candidate-only",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_BUNDLE_ID,
    workspaceDesign: {
      path: "tools/r4-return-authority-v2-design.json",
      sha256: designSha256,
    },
    sourceBindings: {
      ownerDecisionJ: inputs.decision,
      comparisonContracts: inputs.comparisonContracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry,
    },
    outputMaterialization: "stdout-only",
    externalWritesPerformed: false,
    artifacts: files,
    unresolved: [
      "All six per-sequence allowedChangeTargets and createTargets allocations remain unresolved.",
      "Derived bootstrap directories remain unresolved because no createTargets allocation is final.",
      "No helper implementation, fixture result, delivery binding, lifecycle action, role action, measurement, or P-11 observation exists in this candidate."
    ],
    nextStep: "Independent design review only. Do not implement helpers or final records until the reviewer passes the v2 candidate and the owner separately approves actual final bytes.",
  };
}

function main() {
  const args = process.argv.slice(2);
  if (!(args.length === 0 || (args.length === 1 && args[0] === "--dry-run"))) {
    fail("Usage: node r4-return-authority-candidates-v2.mjs --dry-run");
  }
  process.stdout.write(`${JSON.stringify(buildBundle(), null, 2)}\n`);
}

try { main(); }
catch (error) { console.error(`P3 RETURN AUTHORITY V2 CANDIDATE: ${error.message}`); process.exitCode = 1; }
