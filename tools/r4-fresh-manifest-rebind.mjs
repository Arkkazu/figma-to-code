import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PAIR_ID = "open-service-top-hero-v1-20260809";
const CAPTURE_ID = "20260811T023327Z-07b2fcb5021a";
const ORIGINAL_MANIFEST_SHA256 = "3bf9e9b787e7f192f74a3d6ab34d3680e400851eff5da324c53518c63fe04c36";
const PURPOSE = "Frozen saved Figma source export and asset-hash evidence for P-3 pre-pair use; not a gate capture, lifecycle event, or P-11 evidence.";
const BASELINE_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const COORDINATOR_ROOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/reapproval/fresh-manifest-rebind-20260812";
const REGISTRY = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/records/p3-role-handoff-registry-open-service-top-hero-v1-20260809.json";

const rel = {
  manifest: `MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/${CAPTURE_ID}/fresh-gate-manifest.json`,
  nodeEvidence: "MyBrain/verify/figma-node-evidence-open-service-top-hero-v1.json",
  referenceCrops: "MyBrain/verify/reference-crops-open-service-top-hero-v1.json",
  nodeMap: "MyBrain/verify/nodemap-open-service-top-hero-v1.json",
  layerEvidence: "MyBrain/verify/figma-layer-evidence-open-service-top-hero-v1.json",
  spec: "MyBrain/verify/spec-open-service-top-hero-v1.json",
  components: "MyBrain/verify/components-open-service-top-hero-v1.json",
  preImplementation: "MyBrain/verify/p3-pre-implementation-proof-open-service-top-hero-v1.json",
  decisionJ: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  cleanRoomBaseline: "MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-baseline.json",
  cleanRoomCurrent: "MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-current.json",
  currentChangeApproval: "MyBrain/verify/p3-current-change-approval-open-service-top-hero-v1.json",
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  protocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const file = (root, relative) => join(root, ...relative.split("/"));
const readBytes = (pathname) => readFileSync(pathname);
const readJson = (pathname) => JSON.parse(readBytes(pathname).toString("utf8"));
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const jsonHash = (value) => sha256(Buffer.from(serialize(value), "utf8"));
const fileHash = (pathname) => sha256(readBytes(pathname));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const stableHash = (value) => sha256(Buffer.from(JSON.stringify(stable(value)), "utf8"));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const fail = (message) => { throw new Error(message); };

function writeAtomic(pathname, text) {
  mkdirSync(dirname(pathname), { recursive: true });
  const temporary = `${pathname}.r4-fresh-manifest-rebind-${process.pid}.tmp`;
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, pathname);
}

function writeJson(pathname, value) {
  writeAtomic(pathname, serialize(value));
}

function assertSameFiles(left, right, label) {
  if (!equal(left, right)) fail(`${label} differs between baseline and current before the mechanical rebind`);
}

function assertManifestEvidenceBytes(root, manifest) {
  if (!Array.isArray(manifest.files) || !manifest.files.length) fail(`${root} manifest has no saved files array`);
  for (const [index, entry] of manifest.files.entries()) {
    const actual = entry?.actual;
    if (!actual?.sha256 || !entry.path) fail(`${root} manifest files[${index}] lacks path or actual.sha256`);
    const saved = join(dirname(file(root, rel.manifest)), ...String(entry.path).split("/"));
    if (!existsSync(saved)) fail(`${root} saved Figma evidence file is missing: ${entry.path}`);
    if (fileHash(saved) !== actual.sha256) fail(`${root} saved Figma evidence hash differs from manifest at ${entry.path}`);
  }
}

function scanDraftMarkers(value, pointer = "$", errors = []) {
  if (typeof value === "string") {
    if (value.trim().toUpperCase().startsWith("OWNER_INPUT_REQUIRED")) errors.push(`${pointer}: OWNER_INPUT_REQUIRED`);
    if (value.replace(/\\/g, "/").split("/").some((part) => part.toLowerCase() === "p3-drafts")) errors.push(`${pointer}: p3-drafts path`);
    return errors;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanDraftMarkers(entry, `${pointer}/${index}`, errors));
    return errors;
  }
  if (!value || typeof value !== "object") return errors;
  for (const [key, entry] of Object.entries(value)) {
    const child = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    if (key === "_draftOnly" || key === "draftOnly") errors.push(`${child}: draft-only marker`);
    if (key === "status" && typeof entry === "string" && entry.trim().toLowerCase() === "draft") errors.push(`${child}: status:draft`);
    scanDraftMarkers(entry, child, errors);
  }
  return errors;
}

function frozen(pathname) {
  return { path: pathname, sha256: null };
}

function setHash(reference, hash) {
  if (!reference || typeof reference !== "object") fail("Expected a frozen reference object");
  reference.sha256 = hash;
}

function pendingRecord(record, target, dependencies) {
  const candidate = clone(record);
  candidate.status = "pending-owner-reapproval";
  candidate.ownerApproved = false;
  candidate.approvedAt = null;
  candidate.approvalBasis = "Pending owner reapproval after the non-draft fresh-manifest marker/purpose repair. This coordinator-only candidate is not a runtime authorization and may not be used for lifecycle, role delivery, implementation, measurement, release, or P-11.";
  candidate.reapproval = {
    kind: "p3-r4-fresh-manifest-rebind",
    target,
    ownerApprovalRequired: true,
    finalRecordMustBeRegeneratedAtApprovalTime: true,
    dependencies,
  };
  return candidate;
}

function candidatePath(condition, basename) {
  return join(COORDINATOR_ROOT, "candidates", condition, basename);
}

function candidateRef(condition, basename, candidate) {
  const pathname = candidatePath(condition, basename);
  return { path: pathname.replace(/\\/g, "/"), sha256: jsonHash(candidate) };
}

function stagedSidecars(root) {
  const originals = {
    manifest: readJson(file(root, rel.manifest)),
    nodeEvidence: readJson(file(root, rel.nodeEvidence)),
    referenceCrops: readJson(file(root, rel.referenceCrops)),
    nodeMap: readJson(file(root, rel.nodeMap)),
    layerEvidence: readJson(file(root, rel.layerEvidence)),
    spec: readJson(file(root, rel.spec)),
    components: readJson(file(root, rel.components)),
  };
  if (fileHash(file(root, rel.manifest)) !== ORIGINAL_MANIFEST_SHA256) fail(`${root} dated manifest does not have the expected pre-repair SHA-256`);
  if (originals.manifest.draftOnly !== true) fail(`${root} dated manifest is not the expected draft-only input`);
  assertManifestEvidenceBytes(root, originals.manifest);

  const next = clone(originals);
  const originalFiles = clone(next.manifest.files);
  delete next.manifest.draftOnly;
  next.manifest.purpose = PURPOSE;
  if (!equal(next.manifest.files, originalFiles)) fail(`${root} manifest files array changed during repair`);
  const expectedManifest = clone(originals.manifest);
  delete expectedManifest.draftOnly;
  expectedManifest.purpose = PURPOSE;
  if (!equal(next.manifest, expectedManifest)) fail(`${root} manifest repair would change an unexpected field`);
  const manifestSha = jsonHash(next.manifest);

  next.nodeEvidence.freshGateManifest.sha256 = manifestSha;
  const nodeEvidenceSha = jsonHash(next.nodeEvidence);
  next.referenceCrops.source.savedRedactedFreshManifest.sha256 = manifestSha;
  const referenceCropsSha = jsonHash(next.referenceCrops);
  next.nodeMap.sourceEvidence.nodeEvidenceSha256 = nodeEvidenceSha;
  const nodeMapSha = jsonHash(next.nodeMap);
  next.layerEvidence.sourceEvidence.nodeEvidenceSha256 = nodeEvidenceSha;
  const layerEvidenceSha = jsonHash(next.layerEvidence);
  next.spec.sourceTextEvidence.nodeMapSha256 = nodeMapSha;
  const specSha = jsonHash(next.spec);
  next.components.sourceTextEvidence.nodeMapSha256 = nodeMapSha;
  const componentsSha = jsonHash(next.components);

  for (const [name, value] of Object.entries(next)) {
    const errors = scanDraftMarkers(value);
    if (errors.length) fail(`${root} ${name} fails recursive draft guard: ${errors.join("; ")}`);
  }
  return { originals, next, hashes: { manifest: manifestSha, nodeEvidence: nodeEvidenceSha, referenceCrops: referenceCropsSha, nodeMap: nodeMapSha, layerEvidence: layerEvidenceSha, spec: specSha, components: componentsSha } };
}

function buildCandidates(condition, root, hashes, candidateRefs) {
  const proofOriginal = readJson(file(root, rel.preImplementation));
  const decisionOriginal = readJson(file(root, rel.decisionJ));
  const cleanRoomRelative = condition === "baseline" ? rel.cleanRoomBaseline : rel.cleanRoomCurrent;
  const cleanRoomOriginal = readJson(file(root, cleanRoomRelative));
  const contractOriginal = readJson(file(root, rel.contract));

  const proof = pendingRecord(proofOriginal, rel.preImplementation, { nodeMapSha256: hashes.nodeMap, referenceCropsSha256: hashes.referenceCrops, componentsSha256: hashes.components });
  proof.frozenNonDraftInputs.nodeMap.sha256 = hashes.nodeMap;
  proof.frozenNonDraftInputs.referenceCrops.sha256 = hashes.referenceCrops;
  proof.frozenNonDraftInputs.components.sha256 = hashes.components;
  proof.scope.componentsSha256 = hashes.components;
  const proofRef = candidateRef(condition, "p3-pre-implementation-proof-open-service-top-hero-v1.pending-owner-reapproval.json", proof);

  const decision = pendingRecord(decisionOriginal, rel.decisionJ, { preImplementationProofCandidate: proofRef, componentsSha256: hashes.components, manifestSha256: hashes.manifest, nodeEvidenceSha256: hashes.nodeEvidence, referenceCropsSha256: hashes.referenceCrops, nodeMapSha256: hashes.nodeMap, layerEvidenceSha256: hashes.layerEvidence, specSha256: hashes.spec });
  decision.sourceSnapshot.preImplementationProofSha256 = proofRef.sha256;
  decision.scope.componentsSha256 = hashes.components;
  decision.comparisonInputBundleSha256 = null;
  decision.reapproval.finalDecisionInputPlanRequired = true;
  const decisionRef = candidateRef(condition, "p3-owner-decision-J-open-service-top-hero-v1-20260809.pending-owner-reapproval.json", decision);

  const cleanRoom = pendingRecord(cleanRoomOriginal, cleanRoomRelative, { ownerDecisionJCandidate: decisionRef });
  cleanRoom.ownerDecisionJ.fileSha256 = decisionRef.sha256;
  const cleanRoomRef = candidateRef(condition, `p3-clean-room-open-service-top-hero-v1-20260809-${condition}.pending-owner-reapproval.json`, cleanRoom);

  let bApproval = null;
  let bApprovalRef = null;
  if (condition === "current") {
    const original = readJson(file(root, rel.currentChangeApproval));
    bApproval = pendingRecord(original, rel.currentChangeApproval, { ownerDecisionJCandidate: decisionRef, preImplementationProofCandidate: proofRef, componentsSha256: hashes.components });
    bApproval.ownerDecisionJSha256 = decisionRef.sha256;
    bApproval.sourceSnapshot.preImplementationProofSha256 = proofRef.sha256;
    bApproval.scope.componentsSha256 = hashes.components;
    bApprovalRef = candidateRef(condition, "p3-current-change-approval-open-service-top-hero-v1.pending-owner-reapproval.json", bApproval);
  }

  const contract = clone(contractOriginal);
  setHash(contract.shared.figma.nodeMap, hashes.nodeMap);
  setHash(contract.shared.figma.metadata, hashes.nodeEvidence);
  setHash(contract.shared.figma.screenshots[0], hashes.referenceCrops);
  setHash(contract.shared.sourceSnapshot.preImplementationProof, proofRef.sha256);
  setHash(contract.shared.scope.specs[0], hashes.spec);
  setHash(contract.shared.gate.inputs.spec, hashes.spec);
  setHash(contract.shared.gate.inputs.components, hashes.components);
  setHash(contract.shared.gate.inputs.nodeMap, hashes.nodeMap);
  setHash(contract.shared.gate.inputs.nodeEvidence, hashes.nodeEvidence);
  setHash(contract.shared.gate.inputs.layerEvidence, hashes.layerEvidence);
  setHash(contract.shared.ownerDecisionJ, decisionRef.sha256);
  setHash(contract.run.cleanRoom.evidence, cleanRoomRef.sha256);
  if (condition === "current") setHash(contract.run.evaluatedChange.approvalRecord, bApprovalRef.sha256);
  const contractCandidate = {
    kind: "p3-r4-reapproval-contract-candidate",
    candidateOnly: true,
    runtimeEligible: false,
    target: rel.contract,
    reason: "The actual contract remains immutable until owner reapproval. This payload contains the mechanically rebound fields but references pending-owner-reapproval records and must be regenerated after final approval timestamps are recorded.",
    candidateComparison: contract,
  };
  const contractRef = candidateRef(condition, "fidelity-comparison-open-service-top-hero-v1.pending-owner-reapproval.json", contractCandidate);

  return { proof, proofRef, decision, decisionRef, cleanRoom, cleanRoomRef, bApproval, bApprovalRef, contractCandidate, contractRef };
}

function buildSharedCandidates(baseCandidates, currentCandidates) {
  const baselineProtocol = readJson(file(BASELINE_ROOT, rel.protocol));
  const currentProtocol = readJson(file(CURRENT_ROOT, rel.protocol));
  assertSameFiles(baselineProtocol, currentProtocol, "Existing handoff protocol");
  const protocol = clone(baselineProtocol);
  protocol.recordState = "pending-owner-reapproval";
  protocol.ownerAuthorized = false;
  protocol.authorizationBasis = "Pending fresh-manifest reapproval; this coordinator-only candidate is not a role-delivery authorization.";
  protocol.finalBindings.ownerDecisionJ.sha256 = baseCandidates.decisionRef.sha256;
  protocol.finalBindings.preImplementationProof.sha256 = baseCandidates.proofRef.sha256;
  protocol.finalBindings.comparisonContracts[0].sha256 = baseCandidates.contractRef.sha256;
  protocol.finalBindings.comparisonContracts[1].sha256 = currentCandidates.contractRef.sha256;
  protocol.finalBindings.cleanRoomEvidence[0].sha256 = baseCandidates.cleanRoomRef.sha256;
  protocol.finalBindings.cleanRoomEvidence[1].sha256 = currentCandidates.cleanRoomRef.sha256;
  protocol.reapproval = {
    kind: "p3-r4-fresh-manifest-rebind",
    ownerApprovalRequired: true,
    finalProtocolMustBeRegeneratedAfterFinalRecordHashesExist: true,
  };
  const protocolWrapper = {
    kind: "p3-r4-reapproval-handoff-protocol-candidate",
    candidateOnly: true,
    runtimeEligible: false,
    target: rel.protocol,
    candidateProtocol: protocol,
  };
  const protocolRef = candidateRef("shared", "p3-role-handoff-protocol-open-service-top-hero-v1.pending-owner-reapproval.json", protocolWrapper);

  const registryOriginal = readJson(REGISTRY);
  const registry = clone(registryOriginal);
  registry.recordState = "pending-owner-reapproval";
  registry.ownerAuthorized = false;
  registry.protocol.sha256 = protocolRef.sha256;
  registry.reapproval = {
    kind: "p3-r4-fresh-manifest-rebind",
    ownerApprovalRequired: true,
    finalRegistryMustBeRegeneratedAfterFinalProtocolHashExists: true,
  };
  const registryWrapper = {
    kind: "p3-r4-reapproval-handoff-registry-candidate",
    candidateOnly: true,
    runtimeEligible: false,
    target: REGISTRY.replace(/\\/g, "/"),
    candidateRegistry: registry,
  };
  const registryRef = candidateRef("shared", "p3-role-handoff-registry-open-service-top-hero-v1-20260809.pending-owner-reapproval.json", registryWrapper);
  return { protocolWrapper, protocolRef, registryWrapper, registryRef };
}

function writeCandidates(condition, candidates) {
  writeJson(candidatePath(condition, "p3-pre-implementation-proof-open-service-top-hero-v1.pending-owner-reapproval.json"), candidates.proof);
  writeJson(candidatePath(condition, "p3-owner-decision-J-open-service-top-hero-v1-20260809.pending-owner-reapproval.json"), candidates.decision);
  writeJson(candidatePath(condition, `p3-clean-room-open-service-top-hero-v1-20260809-${condition}.pending-owner-reapproval.json`), candidates.cleanRoom);
  if (candidates.bApproval) writeJson(candidatePath(condition, "p3-current-change-approval-open-service-top-hero-v1.pending-owner-reapproval.json"), candidates.bApproval);
  writeJson(candidatePath(condition, "fidelity-comparison-open-service-top-hero-v1.pending-owner-reapproval.json"), candidates.contractCandidate);
}

function writeSharedCandidates(candidates) {
  writeJson(candidatePath("shared", "p3-role-handoff-protocol-open-service-top-hero-v1.pending-owner-reapproval.json"), candidates.protocolWrapper);
  writeJson(candidatePath("shared", "p3-role-handoff-registry-open-service-top-hero-v1-20260809.pending-owner-reapproval.json"), candidates.registryWrapper);
}

function writeLiveSidecars(root, staged) {
  writeJson(file(root, rel.manifest), staged.next.manifest);
  writeJson(file(root, rel.nodeEvidence), staged.next.nodeEvidence);
  writeJson(file(root, rel.referenceCrops), staged.next.referenceCrops);
  writeJson(file(root, rel.nodeMap), staged.next.nodeMap);
  writeJson(file(root, rel.layerEvidence), staged.next.layerEvidence);
  writeJson(file(root, rel.spec), staged.next.spec);
  writeJson(file(root, rel.components), staged.next.components);
  if (fileHash(file(root, rel.manifest)) !== staged.hashes.manifest) fail(`${root} manifest write hash mismatch`);
  if (fileHash(file(root, rel.nodeEvidence)) !== staged.hashes.nodeEvidence) fail(`${root} node evidence write hash mismatch`);
  if (fileHash(file(root, rel.referenceCrops)) !== staged.hashes.referenceCrops) fail(`${root} reference crop write hash mismatch`);
  if (fileHash(file(root, rel.nodeMap)) !== staged.hashes.nodeMap) fail(`${root} node map write hash mismatch`);
  if (fileHash(file(root, rel.layerEvidence)) !== staged.hashes.layerEvidence) fail(`${root} layer evidence write hash mismatch`);
  if (fileHash(file(root, rel.spec)) !== staged.hashes.spec) fail(`${root} spec write hash mismatch`);
  if (fileHash(file(root, rel.components)) !== staged.hashes.components) fail(`${root} components write hash mismatch`);
  assertManifestEvidenceBytes(root, readJson(file(root, rel.manifest)));
}

function reportChanged(originals, hashes) {
  const rows = [];
  for (const [key, relative] of Object.entries({ manifest: rel.manifest, nodeEvidence: rel.nodeEvidence, referenceCrops: rel.referenceCrops, nodeMap: rel.nodeMap, layerEvidence: rel.layerEvidence, spec: rel.spec, components: rel.components })) {
    rows.push({ path: relative, oldSha256: jsonHash(originals[key]), newSha256: hashes[key] });
  }
  return rows;
}

function main() {
  const baseline = stagedSidecars(BASELINE_ROOT);
  const current = stagedSidecars(CURRENT_ROOT);
  for (const key of Object.keys(baseline.originals)) assertSameFiles(baseline.originals[key], current.originals[key], `Initial ${key}`);
  if (!equal(baseline.next, current.next)) fail("The staged A/B factual sidecars are not byte-identical");
  if (!equal(baseline.hashes, current.hashes)) fail("The staged A/B sidecar hashes differ");

  const baseCandidates = buildCandidates("baseline", BASELINE_ROOT, baseline.hashes);
  const currentCandidates = buildCandidates("current", CURRENT_ROOT, current.hashes);
  const sharedCandidates = buildSharedCandidates(baseCandidates, currentCandidates);
  writeCandidates("baseline", baseCandidates);
  writeCandidates("current", currentCandidates);
  writeSharedCandidates(sharedCandidates);

  // The live non-owner records are updated only after the full coordinator-only candidate
  // set exists. Approved records and the coordinator registry remain untouched.
  writeLiveSidecars(BASELINE_ROOT, baseline);
  writeLiveSidecars(CURRENT_ROOT, current);

  const liveInputs = [rel.manifest, rel.nodeEvidence, rel.referenceCrops, rel.nodeMap, rel.layerEvidence, rel.spec, rel.components];
  const draftGuard = {};
  for (const [condition, root] of [["baseline", BASELINE_ROOT], ["current", CURRENT_ROOT]]) {
    draftGuard[condition] = [];
    for (const relative of liveInputs) {
      const errors = scanDraftMarkers(readJson(file(root, relative)));
      if (errors.length) draftGuard[condition].push({ path: relative, errors });
    }
    if (draftGuard[condition].length) fail(`${condition} post-write recursive draft guard failed`);
  }

  const report = {
    schema: "p3-r4-fresh-manifest-reapproval-bundle/v1",
    pairId: PAIR_ID,
    captureId: CAPTURE_ID,
    operation: "mechanical removal of the dated fresh-manifest draft marker and correction of its purpose; saved Figma evidence bytes and files[] are preserved",
    executionBoundary: {
      pairReadiness: false,
      pairBegin: false,
      pairPreflight: false,
      roleDelivery: false,
      implementation: false,
      browserMeasurement: false,
      figmaMeasurement: false,
      p11: "BLOCKED / NOT_AUTHORIZED",
    },
    originalManifestSha256: ORIGINAL_MANIFEST_SHA256,
    repairedManifestSha256: baseline.hashes.manifest,
    purpose: PURPOSE,
    filesArrayPreserved: true,
    savedEvidenceFileHashesVerified: true,
    liveAandBByteIdentical: true,
    changedLiveNonOwnerArtifacts: reportChanged(baseline.originals, baseline.hashes),
    immutableApprovedRecords: [
      rel.preImplementation,
      rel.decisionJ,
      rel.cleanRoomBaseline,
      rel.cleanRoomCurrent,
      rel.currentChangeApproval,
      rel.contract,
      rel.protocol,
      "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/records/p3-role-handoff-registry-open-service-top-hero-v1-20260809.json",
    ],
    pendingCandidates: {
      baseline: {
        preImplementationProof: baseCandidates.proofRef,
        decisionJ: baseCandidates.decisionRef,
        cleanRoomEvidence: baseCandidates.cleanRoomRef,
        comparisonContract: baseCandidates.contractRef,
      },
      current: {
        preImplementationProof: currentCandidates.proofRef,
        decisionJ: currentCandidates.decisionRef,
        cleanRoomEvidence: currentCandidates.cleanRoomRef,
        bOnlyChangeApproval: currentCandidates.bApprovalRef,
        comparisonContract: currentCandidates.contractRef,
      },
      shared: {
        handoffProtocol: sharedCandidates.protocolRef,
        handoffRegistry: sharedCandidates.registryRef,
      },
    },
    reapprovalOrder: [
      "owner-approved baseline/current preImplementationProof replacements with actual approval timestamps",
      "owner-approved shared Decision J replacement regenerated by p3-decision-input-plan",
      "owner-approved baseline/current clean-room evidence replacements",
      "owner-approved current B-only change approval replacement",
      "baseline/current comparison contract replacements",
      "A/B handoff protocol and coordinator registry rebind",
    ],
    exactHashLimitation: "The candidate hashes above are exact for pending-owner-reapproval artifacts only. Final owner-approved transitive hashes must be regenerated atomically after the owner approval time is recorded; precomputing them now would fabricate an approval timestamp.",
    draftGuard: { recursiveChangedLiveInputs: draftGuard, passed: true },
    oneLineOwnerAuthorization: "I authorize atomic regeneration and replacement of the P-3 R4 fresh-manifest reapproval chain described by this coordinator bundle, setting ownerApproved:true only after the final bytes and actual approval timestamps are produced.",
  };
  writeJson(join(COORDINATOR_ROOT, "reapproval-bundle-report.json"), report);
  writeAtomic(join(COORDINATOR_ROOT, "OWNER-AUTHORIZATION.txt"), `${report.oneLineOwnerAuthorization}\n`);
  console.log(JSON.stringify({ coordinatorRoot: COORDINATOR_ROOT, reportSha256: fileHash(join(COORDINATOR_ROOT, "reapproval-bundle-report.json")), repairedManifestSha256: baseline.hashes.manifest, sidecars: baseline.hashes, pendingCandidates: report.pendingCandidates, draftGuard: report.draftGuard, ownerAuthorization: report.oneLineOwnerAuthorization }, null, 2));
}

main();
