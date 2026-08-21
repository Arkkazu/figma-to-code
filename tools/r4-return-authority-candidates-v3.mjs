#!/usr/bin/env node
// Read-only generator for the P-3 R4 return-authority v3 proposal candidate.
// It has no write mode. It never starts lifecycle, emits a role packet, launches
// a role, observes P-11, implements a helper, or materializes an approved record.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const SUPERSEDED_V2_BUNDLE_ID = "3b5aeb9b017c7d54d36f519e573e51d4d3c16546b065be6e12436131ab7cf465";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DESIGN_PATH = join(SCRIPT_DIRECTORY, "r4-return-authority-v3-design.json");
const REL = {
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  componentDecision: "MyBrain/verify/component-decisions-open-service-top-hero-v1.json",
  centralProtocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
  centralRegistry: `records/p3-role-handoff-registry-${PAIR_ID}.json`,
};

const EXPECTED_PROPOSED_CREATE_TARGETS = [
  ["site/index.html", "site/styles.css"],
  [
    "site/assets/brand/open-service-wordmark.png",
    "site/assets/brand/open-mark-ellipse.svg",
    "site/assets/brand/open-mark-vector-1.svg",
    "site/assets/brand/open-mark-vector-2.svg",
    "site/assets/brand/open-mark-vector-3.svg",
    "site/assets/brand/open-mark-vector-4.svg",
    "site/assets/brand/open-mark-vector-5.svg",
    "site/assets/brand/open-mark-vector-6.svg",
    "site/assets/icons/header-arrow-download.svg",
    "site/assets/icons/header-arrow-contact.svg"
  ],
  [
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
    "site/assets/hero/hero-shape-4.svg"
  ],
  [],
  [
    "site/assets/icons/hero-arrow-download-pc.svg",
    "site/assets/icons/hero-arrow-contact-pc.svg",
    "site/assets/icons/hero-arrow-download-sp.svg",
    "site/assets/icons/hero-arrow-contact-sp.svg"
  ],
  []
];

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function bytesHash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
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
function fileReference(pathname, label) {
  const bytes = readBytes(pathname, label);
  return { path: posix(pathname), sha256: bytesHash(bytes) };
}
function isOrderedSubset(values, universe) {
  let previous = -1;
  for (const value of values) {
    const index = universe.indexOf(value);
    if (index < 0 || index <= previous) return false;
    previous = index;
  }
  return true;
}
function findKey(value, key, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findKey(value[index], key, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    const nextPath = `${path}.${entryKey}`;
    if (entryKey === key) return nextPath;
    const found = findKey(entryValue, key, nextPath);
    if (found) return found;
  }
  return null;
}
function findOwnerApprovalTrue(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findOwnerApprovalTrue(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, entryValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (key === "ownerApproved" && entryValue === true) return nextPath;
    const found = findOwnerApprovalTrue(entryValue, nextPath);
    if (found) return found;
  }
  return null;
}
function derivedDirectories(targets) {
  const values = new Set();
  for (const target of targets) {
    const parts = target.split("/");
    assert(parts[0] === "site" && parts.length >= 2, `create target is not a file under site/: ${target}`);
    for (let end = 1; end < parts.length; end += 1) values.add(parts.slice(0, end).join("/"));
  }
  return [...values].sort();
}

function loadDesign() {
  const bytes = readBytes(DESIGN_PATH, "v3 proposal design");
  const design = readJson(DESIGN_PATH, "v3 proposal design");
  assert(design.schema === "p3-role-return-authority-candidate-design/v3", "v3 design schema differs.");
  assert(design.pairId === PAIR_ID, "v3 design pairId differs.");
  assert(design.status === "candidate-only" && design.proposalStatus === "proposed-pending-owner-approval"
    && design.candidateOnly === true && design.runtimeEligible === false && design.ownerApproved === false,
  "v3 design must be candidate-only, proposed-pending-owner-approval, non-runtime, and unapproved.");
  assert(design.supersedes?.candidateBundleId === SUPERSEDED_V2_BUNDLE_ID, "v3 design does not supersede v2.");
  assert(design.perSequenceBootstrap?.model === "scope-preserving-per-sequence-bootstrap", "v3 uses the wrong bootstrap model.");
  assert(design.perSequenceBootstrap?.proposalStatus === "proposed-pending-owner-approval", "v3 mapping is not marked proposed.");
  assert(design.perSequenceBootstrap?.rejectedModel === "sequence-1-attempt-1-all-28-firstComponentFullCreate", "v3 must reject the seq1/all28 model.");
  assert(!findKey(design, "firstComponentFullCreate"), "v3 design must not contain firstComponentFullCreate.");
  const sequences = design.perSequenceBootstrap?.sequences;
  assert(Array.isArray(sequences) && sequences.length === 6, "v3 design must have six sequence mappings.");
  sequences.forEach((entry, index) => {
    assert(entry.sequence === index + 1 && entry.allocationStatus === "PROPOSED_PENDING_OWNER_APPROVAL",
      `sequence ${index + 1} is not a proposed-pending-owner-approval mapping.`);
    equalArrays(entry.proposedCreateTargets, EXPECTED_PROPOSED_CREATE_TARGETS[index], `v3 exact proposed createTargets for sequence ${index + 1}`);
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
  assert(Array.isArray(checkpointPlan) && checkpointPlan.length === 6, "Decision J must have six checkpoint components.");
  assert(Array.isArray(changeTargets) && changeTargets.length === 28, "Decision J must have 28 frozen change targets.");
  assert(new Set(checkpointPlan).size === checkpointPlan.length && new Set(changeTargets).size === changeTargets.length,
    "Decision J contains duplicate checkpoint components or change targets.");
  assert(changeTargets.every((target) => typeof target === "string" && target.startsWith("site/") && !target.includes("..")),
    "Decision J contains a non-site or traversal change target.");
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

  const centralProtocolPath = rootFile(BASELINE, REL.centralProtocol);
  const currentCentralProtocolPath = rootFile(CURRENT, REL.centralProtocol);
  const centralProtocolBytes = readBytes(centralProtocolPath, "baseline central handoff protocol");
  const currentCentralProtocolBytes = readBytes(currentCentralProtocolPath, "current central handoff protocol");
  assert(centralProtocolBytes.equals(currentCentralProtocolBytes), "baseline/current central handoff protocol bytes differ.");
  const centralProtocol = JSON.parse(centralProtocolBytes.toString("utf8"));
  assert(centralProtocol.pairId === PAIR_ID, "central handoff protocol pairId differs.");
  equalArrays(centralProtocol.componentProtocol?.checkpointPlan, checkpointPlan, "central protocol checkpoint plan");
  const regionsById = new Map((centralProtocol.componentProtocol?.regions ?? []).map((entry) => [entry.elementId, entry]));
  assert(regionsById.size === checkpointPlan.length, "central protocol regions differ from checkpoint plan.");

  return {
    decision: { path: REL.decision, sha256: bytesHash(decisionBytes) },
    comparisonContracts: [
      { condition: "baseline", path: posix(baselineContractPath), sha256: bytesHash(baselineContractBytes) },
      { condition: "current", path: posix(currentContractPath), sha256: bytesHash(currentContractBytes) }
    ],
    componentDecision: { path: REL.componentDecision, sha256: bytesHash(componentDecisionBytes) },
    centralProtocol: { path: REL.centralProtocol, sha256: bytesHash(centralProtocolBytes) },
    centralRegistry: fileReference(`${COORDINATOR}/${REL.centralRegistry}`, "central handoff registry"),
    checkpointPlan,
    changeTargets,
    components: checkpointPlan.map((elementId, index) => {
      const component = componentById.get(elementId);
      const region = regionsById.get(elementId);
      assert(component && typeof component.codePath === "string" && component.codePath.trim() !== "",
        `component ${elementId} has no frozen codePath.`);
      assert(region && region.html !== undefined && region.css !== undefined,
        `component ${elementId} has no frozen delimiter bindings.`);
      return { elementId, sequence: index + 1, codePath: component.codePath, delimiters: { html: region.html, css: region.css } };
    })
  };
}

function validateProposedAllocation(design, inputs) {
  const sequences = design.perSequenceBootstrap.sequences;
  equalArrays(sequences.map((entry) => entry.elementId), inputs.checkpointPlan, "v3 sequence element IDs");
  const allCreated = [];
  for (const entry of sequences) {
    assert(entry.proposedAllowedChangeTargets.length > 0, `sequence ${entry.sequence} has no proposed allowlist.`);
    assert(isOrderedSubset(entry.proposedAllowedChangeTargets, inputs.changeTargets),
      `sequence ${entry.sequence} proposed allowlist is not an ordered subset of Decision J changeTargets.`);
    assert(isOrderedSubset(entry.proposedCreateTargets, entry.proposedAllowedChangeTargets),
      `sequence ${entry.sequence} proposed createTargets is not an ordered subset of its allowlist.`);
    allCreated.push(...entry.proposedCreateTargets);
  }
  assert(allCreated.length === inputs.changeTargets.length, "proposed createTargets count does not equal the 28 frozen targets.");
  assert(new Set(allCreated).size === allCreated.length, "proposed createTargets overlap across sequences.");
  assert(inputs.changeTargets.every((target) => allCreated.includes(target)), "proposed createTargets omit a frozen Decision J target.");
  const derivedGlobal = derivedDirectories(allCreated);
  equalArrays(derivedGlobal, ["site", "site/assets", "site/assets/brand", "site/assets/hero", "site/assets/icons"],
    "derived global bootstrap directories");
  return sequences.map((entry) => ({
    sequence: entry.sequence,
    elementId: entry.elementId,
    proposedAllowedChangeTargets: clone(entry.proposedAllowedChangeTargets),
    proposedCreateTargets: clone(entry.proposedCreateTargets),
    derivedBootstrapDirectories: derivedDirectories(entry.proposedCreateTargets),
    allocationStatus: entry.allocationStatus
  }));
}

function candidateId(designSha256, inputs) {
  return stableHash({
    schema: "p3-role-return-authority-candidate-bundle/v3",
    pairId: PAIR_ID,
    supersedesCandidateBundleId: SUPERSEDED_V2_BUNDLE_ID,
    designSha256,
    sourceBindings: {
      decision: inputs.decision,
      comparisonContracts: inputs.comparisonContracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry
    }
  });
}

function buildProtocolCandidate(design, inputs, allocation, bundleId) {
  const bySequence = new Map(allocation.map((entry) => [entry.sequence, entry]));
  return {
    schema: "p3-role-return-authority-candidate/v3",
    recordState: "candidate-only",
    proposalStatus: "proposed-pending-owner-approval",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_V2_BUNDLE_ID,
    aBByteIdenticalRequired: true,
    deliveryMode: "attachment-only",
    sourceBindings: {
      ownerDecisionJ: inputs.decision,
      comparisonContracts: inputs.comparisonContracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry
    },
    implementationLoop: {
      checkpointPlan: inputs.checkpointPlan,
      componentReturnScopes: inputs.components.map((component) => {
        const map = bySequence.get(component.sequence);
        return {
          elementId: component.elementId,
          sequence: component.sequence,
          componentDecisionCodePath: component.codePath,
          proposedAllowedChangeTargets: map.proposedAllowedChangeTargets,
          proposedCreateTargets: map.proposedCreateTargets,
          derivedBootstrapDirectories: map.derivedBootstrapDirectories,
          allocationStatus: map.allocationStatus,
          delimiterBindings: component.delimiters
        };
      }),
      perSequenceBootstrap: clone(design.perSequenceBootstrap),
      bootstrapDirectories: clone(design.bootstrapDirectories),
      journalV2: clone(design.journalV2),
      negativeTestRequirements: clone(design.negativeTestRequirements)
    },
    finalizationRequirements: clone(design.finalizationRequirements),
    executionBoundary: clone(design.executionBoundary)
  };
}

function buildRegistryCandidate(inputs, bundleId, condition, protocolPath, protocolSha256) {
  const contract = inputs.comparisonContracts.find((entry) => entry.condition === condition);
  assert(contract, `missing ${condition} contract binding.`);
  return {
    schema: "p3-role-return-authority-candidate/v3",
    kind: "condition-local-return-registry",
    recordState: "candidate-only",
    proposalStatus: "proposed-pending-owner-approval",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    condition,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_V2_BUNDLE_ID,
    sourceBindings: {
      comparisonContract: contract,
      ownerDecisionJ: inputs.decision,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry
    },
    protocolCandidate: { path: protocolPath, sha256: protocolSha256 },
    recipientPackets: [],
    finalizationRequirements: [
      "This is a proposed-pending-owner-approval candidate, not an authority record.",
      "No recipient packet, opaqueHandoffId, deliverySequence, packet-manifest hash, attachment hash, or identityLeakScan result exists in this candidate.",
      "Populate delivery facts only after separately approved final records, permitted preflight, and packet checks.",
      "This candidate cannot authorize lifecycle, role delivery/launch, implementation, browser/Figma measurement, or P-11."
    ],
    executionBoundary: clone({
      pairReadiness: false, pairBegin: false, pairPreflight: false, rolePacket: false,
      roleDelivery: false, roleLaunch: false, implementation: false,
      browserMeasurement: false, figmaMeasurement: false, p11: false
    })
  };
}

function validateCandidate(protocol, registries) {
  assert(protocol.candidateOnly === true && protocol.runtimeEligible === false && protocol.ownerApproved === false,
    "protocol candidate is not safely non-runtime/unapproved.");
  assert(protocol.recordState === "candidate-only" && protocol.proposalStatus === "proposed-pending-owner-approval",
    "protocol candidate claims a non-candidate state.");
  assert(!findKey(protocol, "firstComponentFullCreate"), "protocol candidate contains a legacy all-target creation field.");
  assert(!findOwnerApprovalTrue(protocol), "protocol candidate contains ownerApproved:true.");
  for (const registry of registries) {
    assert(registry.candidateOnly === true && registry.runtimeEligible === false && registry.ownerApproved === false,
      `registry candidate ${registry.condition} is not safely non-runtime/unapproved.`);
    assert(registry.recipientPackets.length === 0, `registry candidate ${registry.condition} fabricates packet facts.`);
    assert(!findOwnerApprovalTrue(registry), `registry candidate ${registry.condition} contains ownerApproved:true.`);
  }
}

function buildBundle() {
  const { design, sha256: designSha256 } = loadDesign();
  const inputs = loadFinalInputs();
  const allocation = validateProposedAllocation(design, inputs);
  const bundleId = candidateId(designSha256, inputs);
  const protocol = buildProtocolCandidate(design, inputs, allocation, bundleId);
  const protocolBytes = Buffer.from(jsonText(protocol), "utf8");
  const protocolSha256 = bytesHash(protocolBytes);
  const baselineRegistry = buildRegistryCandidate(inputs, bundleId, "baseline", "protocols/p3-role-return-handoff-protocol-baseline.proposed.json", protocolSha256);
  const currentRegistry = buildRegistryCandidate(inputs, bundleId, "current", "protocols/p3-role-return-handoff-protocol-current.proposed.json", protocolSha256);
  validateCandidate(protocol, [baselineRegistry, currentRegistry]);
  const files = [
    ["protocols/p3-role-return-handoff-protocol-baseline.proposed.json", protocolBytes],
    ["protocols/p3-role-return-handoff-protocol-current.proposed.json", protocolBytes],
    ["baseline/p3-role-return-registry.proposed.json", Buffer.from(jsonText(baselineRegistry), "utf8")],
    ["current/p3-role-return-registry.proposed.json", Buffer.from(jsonText(currentRegistry), "utf8")]
  ].map(([path, bytes]) => ({ path, sha256: bytesHash(bytes), bytes: bytes.length }));
  return {
    schema: "p3-role-return-authority-candidate-bundle/v3",
    status: "candidate-only",
    proposalStatus: "proposed-pending-owner-approval",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_V2_BUNDLE_ID,
    workspaceDesign: { path: "tools/r4-return-authority-v3-design.json", sha256: designSha256 },
    sourceBindings: {
      ownerDecisionJ: inputs.decision,
      comparisonContracts: inputs.comparisonContracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry
    },
    proposedAllocation: allocation,
    outputMaterialization: "stdout-only",
    externalWritesPerformed: false,
    artifacts: files,
    unresolved: [
      "The exact mapping is proposed-pending-owner-approval and cannot be used as runtime authority.",
      "No helper implementation, fixture result, final record, delivery binding, lifecycle action, role action, measurement, or P-11 observation exists in this candidate."
    ],
    nextStep: "Independent design review only. Do not implement helpers or final records until v3 passes independent review and the owner separately approves actual final bytes."
  };
}

function main() {
  const args = process.argv.slice(2);
  if (!(args.length === 0 || (args.length === 1 && args[0] === "--dry-run"))) {
    fail("Usage: node r4-return-authority-candidates-v3.mjs --dry-run");
  }
  process.stdout.write(`${JSON.stringify(buildBundle(), null, 2)}\n`);
}

try { main(); }
catch (error) { console.error(`P3 RETURN AUTHORITY V3 CANDIDATE: ${error.message}`); process.exitCode = 1; }
