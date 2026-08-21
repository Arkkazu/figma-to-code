#!/usr/bin/env node
// Creates only candidate-only, coordinator-only return-authority records for
// P-3 R4.  Default mode is read-only and writes nothing outside this workspace.
// A later, explicit --write-candidates --confirm-candidate-only invocation may
// store the already-reviewed candidates under the common Git coordinator path.
// It never starts lifecycle, creates a role packet/staging, launches a role,
// observes P-11, or materializes a runtime-eligible/owner-approved record.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/${PAIR_ID}`;

const REL = {
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  decision: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  componentDecision: "MyBrain/verify/component-decisions-open-service-top-hero-v1.json",
  centralProtocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
};
const CENTRAL_REGISTRY = `${COORDINATOR}/records/p3-role-handoff-registry-${PAIR_ID}.json`;
const CANDIDATE_SCHEMA = "p3-role-return-authority-candidate/v1";

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function bytesHash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function text(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function jsonHash(value) { return bytesHash(Buffer.from(text(value), "utf8")); }
function posix(pathname) { return normalize(resolve(pathname)).replace(/\\/g, "/"); }
function rootFile(root, relativePath) { return join(root, ...relativePath.split("/")); }
function readBytes(pathname, label) {
  assert(existsSync(pathname), `${label} is missing: ${pathname}`);
  return readFileSync(pathname);
}
function readJson(pathname, label) {
  try { return JSON.parse(readBytes(pathname, label).toString("utf8")); }
  catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}
function reference(root, relativePath, label) {
  const pathname = rootFile(root, relativePath);
  return { path: relativePath, sha256: bytesHash(readBytes(pathname, label)) };
}
function absoluteReference(pathname, label) {
  return { path: posix(pathname), sha256: bytesHash(readBytes(pathname, label)) };
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function stableHash(value) { return bytesHash(Buffer.from(JSON.stringify(stable(value)), "utf8")); }

function requiredString(value, label) {
  assert(typeof value === "string" && value.trim() !== "", `${label} must be a non-empty string.`);
  return value;
}
function exactArray(left, right, label) {
  assert(Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((entry, index) => entry === right[index]), `${label} must be byte-for-byte ordered equal.`);
}
function exactJson(left, right, label) {
  assert(JSON.stringify(left) === JSON.stringify(right), `${label} differ.`);
}

function loadFinalInputs() {
  const baselineContractPath = rootFile(BASELINE, REL.contract);
  const currentContractPath = rootFile(CURRENT, REL.contract);
  const baselineContractBytes = readBytes(baselineContractPath, "Baseline final v13 comparison contract");
  const currentContractBytes = readBytes(currentContractPath, "Current final v13 comparison contract");
  const baselineContract = JSON.parse(baselineContractBytes.toString("utf8"));
  const currentContract = JSON.parse(currentContractBytes.toString("utf8"));
  assert(baselineContract.version === 13 && currentContract.version === 13, "Both comparison contracts must be final v13.");
  assert(baselineContract.pairId === PAIR_ID && currentContract.pairId === PAIR_ID, "Comparison-contract pairId differs.");
  assert(baselineContract.condition === "baseline" && currentContract.condition === "current", "Comparison-contract conditions differ.");

  const decisionPath = rootFile(BASELINE, REL.decision);
  const currentDecisionPath = rootFile(CURRENT, REL.decision);
  const decisionBytes = readBytes(decisionPath, "Baseline approved Decision J");
  const currentDecisionBytes = readBytes(currentDecisionPath, "Current approved Decision J");
  assert(decisionBytes.equals(currentDecisionBytes), "A/B approved Decision J bytes differ.");
  const decision = JSON.parse(decisionBytes.toString("utf8"));
  assert(decision.version === 2 && decision.pairId === PAIR_ID && decision.status === "approved" && decision.ownerApproved === true,
    "Decision J is not the approved final record for this pair.");
  const checkpointPlan = decision.scope?.checkpointPlan;
  const changeTargets = decision.scope?.changeTargets;
  assert(Array.isArray(checkpointPlan) && checkpointPlan.length > 0, "Decision J has no checkpointPlan.");
  assert(Array.isArray(changeTargets) && changeTargets.length > 0, "Decision J has no changeTargets.");
  exactArray(baselineContract.shared?.ownerDecisionJ?.sha256 ? [baselineContract.shared.ownerDecisionJ.sha256] : [], [bytesHash(decisionBytes)], "Baseline contract Decision J hash");
  exactArray(currentContract.shared?.ownerDecisionJ?.sha256 ? [currentContract.shared.ownerDecisionJ.sha256] : [], [bytesHash(decisionBytes)], "Current contract Decision J hash");

  const decisionRef = baselineContract.shared?.gate?.inputs?.componentDecision;
  const currentDecisionRef = currentContract.shared?.gate?.inputs?.componentDecision;
  assert(decisionRef?.path === REL.componentDecision && currentDecisionRef?.path === REL.componentDecision,
    "Final contracts do not name the frozen component-decision record.");
  const componentDecisionBytes = readBytes(rootFile(BASELINE, REL.componentDecision), "Baseline component-decision record");
  const currentComponentDecisionBytes = readBytes(rootFile(CURRENT, REL.componentDecision), "Current component-decision record");
  assert(componentDecisionBytes.equals(currentComponentDecisionBytes), "A/B component-decision bytes differ.");
  const componentDecisionSha256 = bytesHash(componentDecisionBytes);
  assert(decisionRef.sha256 === componentDecisionSha256 && currentDecisionRef.sha256 === componentDecisionSha256,
    "Final contract component-decision SHA-256 differs from the frozen input.");
  const componentDecision = JSON.parse(componentDecisionBytes.toString("utf8"));
  const byElementId = new Map((componentDecision.decisions ?? []).map((entry) => [entry.elementId, entry]));
  assert(byElementId.size === checkpointPlan.length, "Component decision count differs from Decision J checkpointPlan.");
  const components = checkpointPlan.map((elementId, index) => {
    const entry = byElementId.get(elementId);
    assert(entry, `Component decision is missing ${elementId}.`);
    return {
      elementId,
      sequence: index + 1,
      componentDecisionCodePath: requiredString(entry.codePath, `Component decision ${elementId}.codePath`),
    };
  });

  const centralProtocolPath = rootFile(BASELINE, REL.centralProtocol);
  const currentCentralProtocolPath = rootFile(CURRENT, REL.centralProtocol);
  const centralProtocolBytes = readBytes(centralProtocolPath, "Baseline central handoff protocol");
  const currentCentralProtocolBytes = readBytes(currentCentralProtocolPath, "Current central handoff protocol");
  assert(centralProtocolBytes.equals(currentCentralProtocolBytes), "A/B central handoff-protocol bytes differ.");
  const centralProtocol = JSON.parse(centralProtocolBytes.toString("utf8"));
  assert(centralProtocol.schema === "p3-role-handoff-protocol/v1" && centralProtocol.pairId === PAIR_ID,
    "Central handoff protocol is not for this P-3 pair.");
  const componentProtocol = centralProtocol.componentProtocol;
  assert(componentProtocol && Number.isInteger(componentProtocol.maxAttemptsPerComponent) && componentProtocol.maxAttemptsPerComponent > 0,
    "Central handoff protocol has no positive componentProtocol.maxAttemptsPerComponent.");
  exactArray(componentProtocol.checkpointPlan, checkpointPlan, "Central protocol checkpointPlan");
  const regionsByElementId = new Map((componentProtocol.regions ?? []).map((entry) => [entry.elementId, entry]));
  assert(regionsByElementId.size === checkpointPlan.length, "Central protocol region count differs from checkpointPlan.");

  const centralRegistryBytes = readBytes(CENTRAL_REGISTRY, "Central handoff registry");
  const centralRegistry = JSON.parse(centralRegistryBytes.toString("utf8"));
  assert(centralRegistry.schema === "p3-role-handoff-registry/v1" && centralRegistry.pairId === PAIR_ID,
    "Central handoff registry is not for this P-3 pair.");

  const contractRefs = [
    { condition: "baseline", path: posix(baselineContractPath), sha256: bytesHash(baselineContractBytes) },
    { condition: "current", path: posix(currentContractPath), sha256: bytesHash(currentContractBytes) },
  ];
  return {
    decision: { path: REL.decision, sha256: bytesHash(decisionBytes) },
    contracts: contractRefs,
    componentDecision: { path: REL.componentDecision, sha256: componentDecisionSha256 },
    centralProtocol: {
      paths: [posix(centralProtocolPath), posix(currentCentralProtocolPath)],
      sha256: bytesHash(centralProtocolBytes),
    },
    centralRegistry: absoluteReference(CENTRAL_REGISTRY, "Central handoff registry"),
    checkpointPlan,
    changeTargets,
    components,
    regionsByElementId,
    maxAttemptsPerComponent: componentProtocol.maxAttemptsPerComponent,
    stopRule: requiredString(componentProtocol.stopRule, "Central handoff protocol componentProtocol.stopRule"),
    firstSequenceAttempt: componentProtocol.firstSequenceAttempt,
  };
}

function candidateId(inputs) {
  return stableHash({
    schema: CANDIDATE_SCHEMA,
    pairId: PAIR_ID,
    decision: inputs.decision,
    contracts: inputs.contracts,
    componentDecision: inputs.componentDecision,
    centralProtocol: inputs.centralProtocol,
    centralRegistry: inputs.centralRegistry,
  });
}

function componentScopeCandidates(inputs) {
  return inputs.components.map((component) => {
    const region = inputs.regionsByElementId.get(component.elementId);
    assert(region, `Central protocol region is missing ${component.elementId}.`);
    return {
      elementId: component.elementId,
      sequence: component.sequence,
      componentDecisionCodePath: component.componentDecisionCodePath,
      allowedChangeTargets: [],
      ownerInputRequired: {
        field: "allowedChangeTargets",
        requirement: "Freeze one non-empty ordered subset of Decision J scope.changeTargets for this component. It must later exactly equal the component return plan allowlist.",
        allowedUniverse: inputs.changeTargets,
      },
      sharedDelimiterRequirements: {
        html: region.html,
        css: region.css,
        note: "These delimiters are frozen source requirements. The final return plan must select file policies without changing bytes outside the selected component region.",
      },
    };
  });
}

function protocolCandidate(inputs, bundleId) {
  const componentReturnScopes = componentScopeCandidates(inputs);
  return {
    schema: "p3-role-handoff-protocol/v1",
    recordState: "pending-owner-approval",
    executionState: false,
    ownerApproved: false,
    candidateOnly: true,
    runtimeEligible: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    aBIdentical: true,
    aBByteIdentical: true,
    deliveryMode: "attachment-only",
    coordinatorOnly: {
      actualWorktree: true,
      commonGitDirectory: true,
      p3Lifecycle: true,
      comparisonContract: true,
      ownerDecisionJ: true,
      cleanRoomEvidence: true,
    },
    sourceBindings: {
      ownerDecisionJ: inputs.decision,
      comparisonContracts: inputs.contracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry,
    },
    implementationLoop: {
      checkpointPlan: inputs.checkpointPlan,
      componentReturnScopes,
      maxAttemptsPerComponent: inputs.maxAttemptsPerComponent,
      stopRule: inputs.stopRule,
      reviewCannotPreCorrectAttempt: true,
      submissionUnit: "one-component-one-attempt-one-return-archive",
      firstComponentFullCreate: {
        status: "OWNER_INPUT_REQUIRED",
        sequence: 1,
        attempt: 1,
        paths: [],
        requirement: "Decide exactly which currently absent changeTargets are created by sequence 1 / attempt 1. The final plan may permit no other missing target and must preserve the central protocol requirement to initialize all six HTML and CSS regions.",
        centralConstraint: inputs.firstSequenceAttempt,
      },
    },
    finalizationRequirements: [
      "Replace recordState with finalized and set ownerApproved:true only after a separate owner approval of the resolved values.",
      "Remove candidateOnly/runtimeEligible and every ownerInputRequired field before using the protocol as p3-role-return authority.",
      "Resolve every componentReturnScopes[].allowedChangeTargets as a non-empty ordered subset of the frozen Decision J changeTargets.",
      "Resolve firstComponentFullCreate paths and exact file policies without creating a target outside the approved component allowlist.",
      "Make the baseline and current finalized protocol copies byte-identical.",
      "Do not generate a return plan until both actual pair-preflight records exist and the role packet has passed its own check.",
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
    },
  };
}

function registryCandidate(inputs, bundleId, condition, protocolCandidatePath, protocolCandidateSha256) {
  const contract = inputs.contracts.find((entry) => entry.condition === condition);
  assert(contract, `Missing ${condition} contract binding.`);
  return {
    schema: CANDIDATE_SCHEMA,
    kind: "condition-local-return-registry",
    candidateOnly: true,
    runtimeEligible: false,
    pairId: PAIR_ID,
    condition,
    candidateBundleId: bundleId,
    targetSchema: "p3-role-handoff-registry/v1",
    sourceBindings: {
      comparisonContract: contract,
      ownerDecisionJ: inputs.decision,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry,
    },
    candidateRegistry: {
      schema: "p3-role-handoff-registry/v1",
      recordState: "pending-owner-approval",
      executionState: false,
      ownerApproved: false,
      coordinatorOnly: true,
      candidateOnly: true,
      runtimeEligible: false,
      pairId: PAIR_ID,
      condition,
      protocolCandidate: {
        path: protocolCandidatePath,
        sha256: protocolCandidateSha256,
        requirement: "The finalized registry.protocol path must be a relative path from its final return-plan directory and must equal authority.handoff.protocol.self.path in that plan.",
      },
      recipientPackets: [],
      recipientPacketTemplates: inputs.components.map((component) => ({
        elementId: component.elementId,
        sequence: component.sequence,
        roleKind: "implementation",
        coordinatorConditionBinding: condition,
        opaqueHandoffId: null,
        deliverySequence: null,
        packetManifest: null,
        requiredBeforeFinalRegistryEntry: [
          "Generate a random nonsemantic opaqueHandoffId for the actual delivery.",
          "Set the deliverySequence derived from the condition-local progress ledger; do not reuse a prior handoff ID.",
          "Create the packet manifest only after coordinator-safe expansion and p3-role-packet --check PASS.",
          "Record matching attachment logical paths, origins, SHA-256 values, and identityLeakScan.result: clear.",
        ],
      })),
      finalizationRequirements: [
        "Replace recordState with finalized and set ownerApproved:true only after a separate owner approval of resolved target allocation/bootstrap values.",
        "Populate one matching implementation recipientPackets entry only for an actual checked delivery; never fabricate packet hashes, identity-scan results, preflight IDs, or gate-state hashes.",
        "The final registry.protocol must bind the exact byte-identical finalized condition-local protocol copy.",
        "This candidate does not authorize any return plan, packet, role delivery, role launch, implementation, lifecycle command, or measurement.",
      ],
    },
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
    },
  };
}

function buildBundle() {
  const inputs = loadFinalInputs();
  const bundleId = candidateId(inputs);
  const root = `${COORDINATOR}/return-authority-candidates/v1/${bundleId}`;
  const baselineProtocolPath = "protocols/p3-role-return-handoff-protocol-baseline.pending-owner-approval.json";
  const currentProtocolPath = "protocols/p3-role-return-handoff-protocol-current.pending-owner-approval.json";
  const protocol = protocolCandidate(inputs, bundleId);
  const protocolBytes = Buffer.from(text(protocol), "utf8");
  const protocolSha256 = bytesHash(protocolBytes);
  const baselineRegistryPath = "baseline/p3-role-return-registry.pending-owner-approval.json";
  const currentRegistryPath = "current/p3-role-return-registry.pending-owner-approval.json";
  const baselineRegistry = registryCandidate(inputs, bundleId, "baseline", baselineProtocolPath, protocolSha256);
  const currentRegistry = registryCandidate(inputs, bundleId, "current", currentProtocolPath, protocolSha256);
  const files = new Map([
    [baselineProtocolPath, protocolBytes],
    [currentProtocolPath, protocolBytes],
    [baselineRegistryPath, Buffer.from(text(baselineRegistry), "utf8")],
    [currentRegistryPath, Buffer.from(text(currentRegistry), "utf8")],
  ]);
  const fileRefs = [...files.entries()].map(([relativePath, bytes]) => ({
    path: relativePath,
    sha256: bytesHash(bytes),
    bytes: bytes.length,
  }));
  const report = {
    schema: "p3-role-return-authority-candidate-bundle/v1",
    status: "candidate-only",
    runtimeEligible: false,
    pairId: PAIR_ID,
    candidateBundleId: bundleId,
    outputRoot: posix(root),
    externalWritesPerformed: false,
    sourceBindings: {
      ownerDecisionJ: inputs.decision,
      comparisonContracts: inputs.contracts,
      componentDecision: inputs.componentDecision,
      centralProtocol: inputs.centralProtocol,
      centralRegistry: inputs.centralRegistry,
    },
    detectedSchemaIncompatibility: [
      "The central protocol uses recordState: final and ownerAuthorized instead of the p3-role-return requirement recordState: finalized and ownerApproved:true.",
      "The central protocol has coordinatorOnly as a boolean rather than the required coordinatorOnly object with six explicit true fields.",
      "The central protocol exposes componentProtocol/regions rather than implementationLoop.componentReturnScopes with per-component ordered allowlists.",
      "The central registry has prepared delivery placeholders, not the exact per-return packet-manifest/identity-scan binding required by p3-role-return.",
    ],
    artifacts: fileRefs,
    unresolvedOwnerInputs: [
      "For every checkpoint component, choose the exact non-empty ordered allowedChangeTargets subset from Decision J scope.changeTargets.",
      "Choose the sequence 1 / attempt 1 firstComponentFullCreate paths and bootstrap byte policy, including how every initially absent asset target is introduced without expanding scope.",
      "For each actual delivery, generate the opaque handoff ID, deliverySequence, checked packet manifest, attachment hashes, and clear identity-leak result only after the permitted preflight/packet steps.",
    ],
    approvalLanguageJapanese: "P-3 R4 return authority candidate bundle（candidateBundleId: " + bundleId + "）の4候補を、candidate-only・runtimeEligible:false のまま採用します。各componentの ordered allowedChangeTargets、sequence 1 / attempt 1 の firstComponentFullCreate とbootstrap byte policy、各deliveryの opaqueHandoffId・deliverySequence・packet manifest・attachment hash・identityLeakScan 結果は未確定であり、これらを実値で束縛した final condition-local protocol/registry を recordState:\"finalized\"・ownerApproved:true にする承認は別途行います。本承認は pair lifecycle、role packet/delivery/launch、implementation、browser/Figma measurement を開始または承認するものではありません。",
  };
  const reportPath = "return-authority-candidate-bundle.json";
  files.set(reportPath, Buffer.from(text(report), "utf8"));
  validateBundle({ inputs, protocol, baselineRegistry, currentRegistry, files, bundleId, report });
  return { root, files, report, reportPath };
}

function validateBundle(bundle) {
  const baselineProtocol = bundle.files.get("protocols/p3-role-return-handoff-protocol-baseline.pending-owner-approval.json");
  const currentProtocol = bundle.files.get("protocols/p3-role-return-handoff-protocol-current.pending-owner-approval.json");
  assert(baselineProtocol.equals(currentProtocol), "Condition-local protocol candidates must be byte-identical.");
  assert(bundle.protocol.ownerApproved === false && bundle.protocol.runtimeEligible === false && bundle.protocol.candidateOnly === true,
    "Protocol candidate must remain non-runtime and non-approved.");
  assert(bundle.protocol.recordState !== "finalized", "Protocol candidate must not claim finalized state.");
  assert(bundle.protocol.implementationLoop.componentReturnScopes.every((scope) => scope.allowedChangeTargets.length === 0 && scope.ownerInputRequired),
    "Protocol candidate must leave all component allocations explicitly unresolved.");
  for (const registry of [bundle.baselineRegistry, bundle.currentRegistry]) {
    assert(registry.candidateOnly === true && registry.runtimeEligible === false, "Registry candidate must remain non-runtime.");
    assert(registry.candidateRegistry.ownerApproved === false && registry.candidateRegistry.recordState !== "finalized",
      "Candidate registry must not claim final owner approval.");
    assert(registry.candidateRegistry.recipientPackets.length === 0, "Candidate registry must not fabricate recipient packet records.");
  }
  assert(bundle.report.candidateBundleId === bundle.bundleId, "Bundle report ID differs.");
}

function writeAtomically(pathname, bytes) {
  const temporary = `${pathname}.tmp-${process.pid}`;
  writeFileSync(temporary, bytes, { flag: "wx" });
  renameSync(temporary, pathname);
}

function writeCandidates(bundle) {
  const root = resolve(bundle.root);
  assert(!existsSync(root), `Candidate output root already exists; refusing to overwrite: ${root}`);
  for (const [relativePath, bytes] of bundle.files) {
    const pathname = join(root, ...relativePath.split("/"));
    mkdirSync(dirname(pathname), { recursive: true });
    writeAtomically(pathname, bytes);
  }
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.length === 0 || (args.length === 1 && args[0] === "--dry-run") ? "dry-run"
    : (args.length === 2 && args[0] === "--write-candidates" && args[1] === "--confirm-candidate-only") ? "write"
      : null;
  if (!mode) {
    fail("Usage: node r4-return-authority-candidates.mjs --dry-run | --write-candidates --confirm-candidate-only");
  }
  const bundle = buildBundle();
  if (mode === "write") writeCandidates(bundle);
  const report = { ...bundle.report, externalWritesPerformed: mode === "write", reportPath: `${posix(bundle.root)}/${bundle.reportPath}` };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try { main(); }
catch (error) { console.error(`P3 RETURN AUTHORITY CANDIDATES: ${error.message}`); process.exitCode = 1; }
