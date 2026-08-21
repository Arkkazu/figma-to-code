#!/usr/bin/env node
// Read-only generator for the P-3 R4 return-authority v4 proposal candidate.
// It writes no files and never starts lifecycle, emits a packet, launches a
// role, applies a return, observes P-11, implements a helper, or finalizes a
// record. The only accepted mode is --dry-run.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const SUPERSEDED_V3_BUNDLE_ID = "16d6b15b3cdea03c0a66794003a27f699327d4ce7b8e0c066f1e1f5dc002fa09";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DESIGN_PATH = join(SCRIPT_DIRECTORY, "r4-return-authority-v4-design.json");
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;
const REL = {
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  componentDecision: "MyBrain/verify/component-decisions-open-service-top-hero-v1.json",
  centralProtocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
  centralRegistry: `records/p3-role-handoff-registry-${PAIR_ID}.json`
};
const HERO_LAUREL = "site/assets/hero/hero-laurel.png";
const EXPECTED_CREATE_TARGETS = [
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
    HERO_LAUREL,
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
const REQUIRED_NEGATIVES = Array.from({ length: 15 }, (_, index) => `N-${index + 1}`);
const REQUIRED_RETAINED_NEGATIVES = ["V4-R-1", "V4-R-2", "V4-R-3"];

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function stableHash(value) { return hash(Buffer.from(JSON.stringify(stable(value)), "utf8")); }
function posix(pathname) { return normalize(resolve(pathname)).replace(/\\/g, "/"); }
function rootFile(root, relativePath) { return join(root, ...relativePath.split("/")); }
function readBytes(pathname, label) {
  try { return readFileSync(pathname); }
  catch (error) { fail(`${label} is unreadable: ${posix(pathname)} (${error.message})`); }
}
function readJson(pathname, label) {
  try { return JSON.parse(readBytes(pathname, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function fileReference(pathname, label) {
  const bytes = readBytes(pathname, label);
  return { path: posix(pathname), sha256: hash(bytes) };
}
function orderedEqual(left, right, label) {
  assert(Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => value === right[index]), `${label} must be ordered-equal.`);
}
function orderedSubset(values, universe) {
  let previous = -1;
  for (const value of values) {
    const index = universe.indexOf(value);
    if (index < 0 || index <= previous) return false;
    previous = index;
  }
  return true;
}
function findKey(value, needle, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findKey(value[index], needle, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (key === needle) return next;
    const found = findKey(child, needle, next);
    if (found) return found;
  }
  return null;
}
function findOwnerApproved(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findOwnerApproved(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (key === "ownerApproved" && child === true) return next;
    const found = findOwnerApproved(child, next);
    if (found) return found;
  }
  return null;
}
function derivedDirectories(targets) {
  const directories = new Set();
  for (const target of targets) {
    const parts = target.split("/");
    assert(parts[0] === "site" && parts.length >= 2, `target is not a file below site/: ${target}`);
    for (let end = 1; end < parts.length; end += 1) directories.add(parts.slice(0, end).join("/"));
  }
  return [...directories].sort();
}

function loadDesign() {
  const bytes = readBytes(DESIGN_PATH, "v4 proposal design");
  const design = JSON.parse(bytes.toString("utf8"));
  assert(design.schema === "p3-role-return-authority-candidate-design/v4", "v4 design schema differs.");
  assert(design.status === "candidate-only" && design.proposalStatus === "proposed-pending-owner-approval"
    && design.candidateOnly === true && design.runtimeEligible === false && design.ownerApproved === false,
  "v4 design must remain candidate-only, non-runtime, and unapproved.");
  assert(design.pairId === PAIR_ID, "v4 design pairId differs.");
  assert(design.supersedes?.candidateBundleId === SUPERSEDED_V3_BUNDLE_ID, "v4 design does not supersede v3.");
  assert(design.perSequenceBootstrap?.conditionInvariant === true, "v4 allocation must explicitly be condition-invariant.");
  assert(!findKey(design, "firstComponentFullCreate"), "v4 design must not contain firstComponentFullCreate.");
  const sequences = design.perSequenceBootstrap?.sequences;
  assert(Array.isArray(sequences) && sequences.length === 6, "v4 design must have exactly six sequences.");
  sequences.forEach((sequence, index) => {
    assert(sequence.sequence === index + 1 && sequence.allocationStatus === "PROPOSED_PENDING_OWNER_APPROVAL",
      `sequence ${index + 1} is not a proposed mapping.`);
    orderedEqual(sequence.proposedCreateTargets, EXPECTED_CREATE_TARGETS[index], `v4 exact createTargets for sequence ${index + 1}`);
  });
  const sixth = sequences[5];
  assert(!sixth.proposedAllowedChangeTargets.includes(HERO_LAUREL), "sequence 6 must exclude hero-laurel.png from its allowedChangeTargets.");
  assert(!sixth.proposedCreateTargets.includes(HERO_LAUREL), "sequence 6 must not create hero-laurel.png.");
  const third = sequences[2];
  assert(third.proposedAllowedChangeTargets.includes(HERO_LAUREL) && third.proposedCreateTargets.includes(HERO_LAUREL),
    "sequence 3 must own creation and changes for hero-laurel.png.");
  const negativeIds = (design.negativeTestRequirements ?? []).map((entry) => entry.id);
  orderedEqual(negativeIds, REQUIRED_NEGATIVES, "v4 N-1 through N-15 list");
  const retainedIds = (design.retainedV4NegativeTests ?? []).map((entry) => entry.id);
  orderedEqual(retainedIds, REQUIRED_RETAINED_NEGATIVES, "retained v4 negative-test list");
  assert(design.journalV2?.constraints?.includes("Rollback deletes journaled directories in the reverse order of their creation."),
    "journal v2 must explicitly require reverse-order deletion.");
  return { design, designSha256: hash(bytes) };
}

function loadFinalInputs() {
  const baselineContractPath = rootFile(BASELINE, REL.contract);
  const currentContractPath = rootFile(CURRENT, REL.contract);
  const baselineContractBytes = readBytes(baselineContractPath, "baseline comparison contract");
  const currentContractBytes = readBytes(currentContractPath, "current comparison contract");
  const baselineContract = JSON.parse(baselineContractBytes.toString("utf8"));
  const currentContract = JSON.parse(currentContractBytes.toString("utf8"));
  assert(baselineContract.pairId === PAIR_ID && currentContract.pairId === PAIR_ID, "comparison-contract pairId differs.");
  assert(baselineContract.condition === "baseline" && currentContract.condition === "current", "comparison-contract condition differs.");

  const decisionPath = rootFile(BASELINE, REL.decision);
  const currentDecisionPath = rootFile(CURRENT, REL.decision);
  const decisionBytes = readBytes(decisionPath, "baseline Decision J");
  const currentDecisionBytes = readBytes(currentDecisionPath, "current Decision J");
  assert(decisionBytes.equals(currentDecisionBytes), "baseline/current Decision J bytes differ.");
  const decision = JSON.parse(decisionBytes.toString("utf8"));
  assert(decision.pairId === PAIR_ID && decision.status === "approved" && decision.ownerApproved === true,
    "Decision J is not an approved final record for this pair.");
  const checkpointPlan = decision.scope?.checkpointPlan;
  const changeTargets = decision.scope?.changeTargets;
  assert(Array.isArray(checkpointPlan) && checkpointPlan.length === 6, "Decision J must have six checkpoints.");
  assert(Array.isArray(changeTargets) && changeTargets.length === 28, "Decision J must have 28 frozen change targets.");
  assert(new Set(checkpointPlan).size === checkpointPlan.length && new Set(changeTargets).size === changeTargets.length,
    "Decision J has duplicate checkpoints or targets.");
  assert(changeTargets.every((target) => typeof target === "string" && target.startsWith("site/") && !target.includes("..")),
    "Decision J target is not a relative site/ path.");
  assert(baselineContract.shared?.ownerDecisionJ?.sha256 === hash(decisionBytes)
    && currentContract.shared?.ownerDecisionJ?.sha256 === hash(decisionBytes),
  "comparison contracts do not bind the Decision J bytes.");

  const componentPath = rootFile(BASELINE, REL.componentDecision);
  const currentComponentPath = rootFile(CURRENT, REL.componentDecision);
  const componentBytes = readBytes(componentPath, "baseline component decision");
  const currentComponentBytes = readBytes(currentComponentPath, "current component decision");
  assert(componentBytes.equals(currentComponentBytes), "baseline/current component-decision bytes differ.");
  const components = JSON.parse(componentBytes.toString("utf8"));
  const componentById = new Map((components.decisions ?? []).map((entry) => [entry.elementId, entry]));

  const protocolPath = rootFile(BASELINE, REL.centralProtocol);
  const currentProtocolPath = rootFile(CURRENT, REL.centralProtocol);
  const protocolBytes = readBytes(protocolPath, "baseline central handoff protocol");
  const currentProtocolBytes = readBytes(currentProtocolPath, "current central handoff protocol");
  assert(protocolBytes.equals(currentProtocolBytes), "baseline/current central handoff protocol bytes differ.");
  const protocol = JSON.parse(protocolBytes.toString("utf8"));
  assert(protocol.pairId === PAIR_ID, "central handoff protocol pairId differs.");
  orderedEqual(protocol.componentProtocol?.checkpointPlan, checkpointPlan, "central protocol checkpoint plan");
  const regionsById = new Map((protocol.componentProtocol?.regions ?? []).map((entry) => [entry.elementId, entry]));

  return {
    decision: { path: posix(decisionPath), sha256: hash(decisionBytes) },
    comparisonContracts: [
      { condition: "baseline", path: posix(baselineContractPath), sha256: hash(baselineContractBytes) },
      { condition: "current", path: posix(currentContractPath), sha256: hash(currentContractBytes) }
    ],
    componentDecision: { path: posix(componentPath), sha256: hash(componentBytes) },
    centralProtocol: { path: posix(protocolPath), sha256: hash(protocolBytes) },
    centralRegistry: fileReference(`${COORDINATOR}/${REL.centralRegistry}`, "central handoff registry"),
    checkpointPlan,
    changeTargets,
    components: checkpointPlan.map((elementId, index) => {
      const component = componentById.get(elementId);
      const region = regionsById.get(elementId);
      assert(component?.codePath, `component ${elementId} lacks frozen codePath.`);
      assert(region && region.html !== undefined && region.css !== undefined,
        `component ${elementId} lacks frozen delimiter bindings.`);
      return { elementId, sequence: index + 1, codePath: component.codePath, delimiters: { html: region.html, css: region.css } };
    })
  };
}

function validateAllocation(design, inputs) {
  const sequences = design.perSequenceBootstrap.sequences;
  orderedEqual(sequences.map((entry) => entry.elementId), inputs.checkpointPlan, "sequence element IDs");
  const allCreated = [];
  for (const entry of sequences) {
    assert(orderedSubset(entry.proposedAllowedChangeTargets, inputs.changeTargets),
      `sequence ${entry.sequence} allowlist is not an ordered Decision J subset.`);
    assert(orderedSubset(entry.proposedCreateTargets, entry.proposedAllowedChangeTargets),
      `sequence ${entry.sequence} create set is not an ordered allowlist subset.`);
    allCreated.push(...entry.proposedCreateTargets);
  }
  assert(allCreated.length === inputs.changeTargets.length, "creation sets do not contain exactly 28 targets.");
  assert(new Set(allCreated).size === allCreated.length, "creation sets overlap.");
  assert(inputs.changeTargets.every((target) => allCreated.includes(target)), "creation sets omit a Decision J target.");
  assert(allCreated.filter((target) => target === HERO_LAUREL).length === 1, "hero-laurel.png must have exactly one creator.");
  orderedEqual(derivedDirectories(allCreated), ["site", "site/assets", "site/assets/brand", "site/assets/hero", "site/assets/icons"],
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
    schema: "p3-role-return-authority-candidate-bundle/v4",
    pairId: PAIR_ID,
    supersedesCandidateBundleId: SUPERSEDED_V3_BUNDLE_ID,
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
  const allocationBySequence = new Map(allocation.map((entry) => [entry.sequence, entry]));
  return {
    schema: "p3-role-return-authority-candidate/v4",
    recordState: "candidate-only",
    proposalStatus: "proposed-pending-owner-approval",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_V3_BUNDLE_ID,
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
        const map = allocationBySequence.get(component.sequence);
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
      negativeTestRequirements: clone(design.negativeTestRequirements),
      retainedV4NegativeTests: clone(design.retainedV4NegativeTests)
    },
    finalizationRequirements: clone(design.finalizationRequirements),
    executionBoundary: clone(design.executionBoundary)
  };
}

function buildConditionRegistry(inputs, bundleId, condition, protocolPath, protocolSha256) {
  const contract = inputs.comparisonContracts.find((entry) => entry.condition === condition);
  assert(contract, `missing ${condition} comparison contract binding.`);
  return {
    schema: "p3-role-return-authority-candidate/v4",
    kind: "condition-local-return-registry",
    recordState: "candidate-only",
    proposalStatus: "proposed-pending-owner-approval",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    condition,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_V3_BUNDLE_ID,
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
      "This is a proposed-pending-owner-approval candidate, not a runtime authority.",
      "No recipient packet, opaqueHandoffId, deliverySequence, packet-manifest hash, attachment hash, or identityLeakScan result exists in this candidate.",
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
  assert(!findKey(protocol, "firstComponentFullCreate"), "protocol candidate contains legacy firstComponentFullCreate.");
  assert(!findOwnerApproved(protocol), "protocol candidate contains ownerApproved:true.");
  for (const registry of registries) {
    assert(registry.candidateOnly === true && registry.runtimeEligible === false && registry.ownerApproved === false,
      `registry candidate ${registry.condition} is not safely non-runtime/unapproved.`);
    assert(registry.recipientPackets.length === 0, `registry candidate ${registry.condition} fabricates packet facts.`);
    assert(!findOwnerApproved(registry), `registry candidate ${registry.condition} contains ownerApproved:true.`);
  }
}

function buildBundle() {
  const { design, designSha256 } = loadDesign();
  const inputs = loadFinalInputs();
  const allocation = validateAllocation(design, inputs);
  const bundleId = candidateId(designSha256, inputs);
  const protocol = buildProtocolCandidate(design, inputs, allocation, bundleId);
  const protocolBytes = Buffer.from(jsonText(protocol), "utf8");
  const protocolSha256 = hash(protocolBytes);
  const baselineRegistry = buildConditionRegistry(inputs, bundleId, "baseline", "protocols/p3-role-return-handoff-protocol-baseline.proposed.json", protocolSha256);
  const currentRegistry = buildConditionRegistry(inputs, bundleId, "current", "protocols/p3-role-return-handoff-protocol-current.proposed.json", protocolSha256);
  validateCandidate(protocol, [baselineRegistry, currentRegistry]);
  const artifacts = [
    ["protocols/p3-role-return-handoff-protocol-baseline.proposed.json", protocolBytes],
    ["protocols/p3-role-return-handoff-protocol-current.proposed.json", protocolBytes],
    ["baseline/p3-role-return-registry.proposed.json", Buffer.from(jsonText(baselineRegistry), "utf8")],
    ["current/p3-role-return-registry.proposed.json", Buffer.from(jsonText(currentRegistry), "utf8")]
  ].map(([path, bytes]) => ({ path, sha256: hash(bytes), bytes: bytes.length }));
  return {
    schema: "p3-role-return-authority-candidate-bundle/v4",
    status: "candidate-only",
    proposalStatus: "proposed-pending-owner-approval",
    candidateOnly: true,
    runtimeEligible: false,
    ownerApproved: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    supersedesCandidateBundleId: SUPERSEDED_V3_BUNDLE_ID,
    workspaceDesign: { path: posix(DESIGN_PATH), sha256: designSha256 },
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
    artifacts,
    unresolved: [
      "The mapping is proposed-pending-owner-approval and cannot be used as runtime authority.",
      "No helper implementation, fixture result, final record, delivery binding, lifecycle action, role action, measurement, or P-11 observation exists in this candidate."
    ],
    nextStep: "Independent post-implementation audit only after helper implementation and pure fixture results; do not finalize records or execute lifecycle from this candidate."
  };
}

function main() {
  const args = process.argv.slice(2);
  if (!(args.length === 1 && args[0] === "--dry-run")) fail("Usage: node r4-return-authority-candidates-v4.mjs --dry-run");
  process.stdout.write(`${JSON.stringify(buildBundle(), null, 2)}\n`);
}

try { main(); }
catch (error) { console.error(`P3 RETURN AUTHORITY V4 CANDIDATE: ${error.message}`); process.exitCode = 1; }
