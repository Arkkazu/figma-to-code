import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const COORDINATOR = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/reapproval/fresh-manifest-rebind-20260812";
const REPORT_PATH = join(COORDINATOR, "reapproval-bundle-report.json");
const REGISTRY = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/records/p3-role-handoff-registry-open-service-top-hero-v1-20260809.json";
const REL = {
  preImplementation: "MyBrain/verify/p3-pre-implementation-proof-open-service-top-hero-v1.json",
  decisionJ: "MyBrain/verify/p3-owner-decision-J-open-service-top-hero-v1-20260809.json",
  cleanRoomBaseline: "MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-baseline.json",
  cleanRoomCurrent: "MyBrain/verify/p3-clean-room-open-service-top-hero-v1-20260809-current.json",
  bApproval: "MyBrain/verify/p3-current-change-approval-open-service-top-hero-v1.json",
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  protocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
  evaluatorBaseline: "MyBrain/verify/p3-evaluator-baseline-open-service-top-hero-v1.json",
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const readJson = (pathname) => JSON.parse(readFileSync(pathname, "utf8"));
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const jsonHash = (value) => sha256(Buffer.from(serialize(value), "utf8"));
const fileHash = (pathname) => sha256(readFileSync(pathname));
const writeJson = (pathname, value) => writeFileSync(pathname, serialize(value), "utf8");
const workspace = (root, relative) => join(root, ...relative.split("/"));
const candidate = (condition, filename) => join(COORDINATOR, "candidates", condition, filename);
const asPath = (pathname) => pathname.replace(/\\/g, "/");
const ref = (pathname) => ({ path: asPath(pathname), sha256: fileHash(pathname) });
const assert = (truth, message) => { if (!truth) throw new Error(message); };

function setPending(candidateRecord, target, dependencies) {
  candidateRecord.status = "pending-owner-reapproval";
  candidateRecord.ownerApproved = false;
  candidateRecord.approvedAt = null;
  candidateRecord.approvalBasis = "Pending owner reapproval after the non-draft fresh-manifest marker/purpose repair. This coordinator-only candidate is not a runtime authorization and may not be used for lifecycle, role delivery, implementation, measurement, release, or P-11.";
  candidateRecord.reapproval = {
    kind: "p3-r4-fresh-manifest-rebind",
    target,
    ownerApprovalRequired: true,
    finalRecordMustBeRegeneratedAtApprovalTime: true,
    dependencies,
  };
  return candidateRecord;
}

function bind(id, recordClass, condition, livePath, oldSha256, replacementCandidate) {
  assert(fileHash(livePath) === oldSha256, `${id} live old SHA changed during repair`);
  assert(fileHash(replacementCandidate.path) === replacementCandidate.sha256, `${id} candidate SHA mismatch`);
  return {
    id,
    recordClass,
    condition,
    live: { path: asPath(livePath), sha256: oldSha256 },
    replacementCandidate,
    replacementMode: "regenerate-atomically-after-owner-reapproval",
  };
}

function main() {
  const report = readJson(REPORT_PATH);
  const oldPending = clone(report.pendingCandidates);
  const hashes = Object.fromEntries(report.changedLiveNonOwnerArtifacts.map((entry) => [entry.path.split("/").at(-1), entry.newSha256]));
  const componentsSha = hashes["components-open-service-top-hero-v1.json"];
  const manifestSha = hashes["fresh-gate-manifest.json"];
  const nodeEvidenceSha = hashes["figma-node-evidence-open-service-top-hero-v1.json"];
  const cropsSha = hashes["reference-crops-open-service-top-hero-v1.json"];
  const nodeMapSha = hashes["nodemap-open-service-top-hero-v1.json"];
  const layerSha = hashes["figma-layer-evidence-open-service-top-hero-v1.json"];
  const specSha = hashes["spec-open-service-top-hero-v1.json"];
  assert(componentsSha && manifestSha && nodeEvidenceSha && cropsSha && nodeMapSha && layerSha && specSha, "Missing repaired factual sidecar hashes");
  const evaluatorSha = "8ba089d6e48ad46eb5c4d7670222103c309b26e9af3ecd8097485f7f87776806";
  assert(fileHash(workspace(BASELINE, REL.evaluatorBaseline)) === evaluatorSha, "baseline evaluator baseline changed unexpectedly");
  assert(fileHash(workspace(CURRENT, REL.evaluatorBaseline)) === evaluatorSha, "current evaluator baseline changed unexpectedly");

  const baselineProof = ref(candidate("baseline", "p3-pre-implementation-proof-open-service-top-hero-v1.pending-owner-reapproval.json"));
  const currentProof = ref(candidate("current", "p3-pre-implementation-proof-open-service-top-hero-v1.pending-owner-reapproval.json"));
  assert(baselineProof.sha256 === currentProof.sha256, "A/B pending preImplementation candidates must remain byte-identical");

  // Decision J is a shared A/B record. Its candidate may not carry a condition-local
  // coordinator path, otherwise the two replacement bytes diverge before approval.
  const sharedDecisionPath = candidate("shared", "p3-owner-decision-J-open-service-top-hero-v1-20260809.pending-owner-reapproval.json");
  const approvedDecision = readJson(workspace(BASELINE, REL.decisionJ));
  const sharedDecision = setPending(clone(approvedDecision), REL.decisionJ, {
    preImplementationProofTarget: REL.preImplementation,
    preImplementationProofCandidateSha256: baselineProof.sha256,
    manifestSha256: manifestSha,
    nodeEvidenceSha256: nodeEvidenceSha,
    referenceCropsSha256: cropsSha,
    nodeMapSha256: nodeMapSha,
    layerEvidenceSha256: layerSha,
    specSha256: specSha,
    componentsSha256: componentsSha,
  });
  sharedDecision.sourceSnapshot.preImplementationProofSha256 = baselineProof.sha256;
  sharedDecision.scope.componentsSha256 = componentsSha;
  sharedDecision.comparisonInputBundleSha256 = null;
  sharedDecision.reapproval.finalDecisionInputPlanRequired = true;
  sharedDecision.reapproval.targetConditions = ["baseline", "current"];
  writeJson(sharedDecisionPath, sharedDecision);
  const sharedDecisionRef = ref(sharedDecisionPath);

  const baselineCleanPath = candidate("baseline", "p3-clean-room-open-service-top-hero-v1-20260809-baseline.pending-owner-reapproval.json");
  const currentCleanPath = candidate("current", "p3-clean-room-open-service-top-hero-v1-20260809-current.pending-owner-reapproval.json");
  for (const pathname of [baselineCleanPath, currentCleanPath]) {
    const value = readJson(pathname);
    value.ownerDecisionJ.fileSha256 = sharedDecisionRef.sha256;
    value.reapproval.dependencies = { ownerDecisionJSharedCandidate: sharedDecisionRef };
    writeJson(pathname, value);
  }
  const baselineClean = ref(baselineCleanPath);
  const currentClean = ref(currentCleanPath);

  const bApprovalPath = candidate("current", "p3-current-change-approval-open-service-top-hero-v1.pending-owner-reapproval.json");
  const bApproval = readJson(bApprovalPath);
  bApproval.ownerDecisionJSha256 = sharedDecisionRef.sha256;
  bApproval.sourceSnapshot.preImplementationProofSha256 = currentProof.sha256;
  bApproval.scope.componentsSha256 = componentsSha;
  bApproval.reapproval.dependencies = { ownerDecisionJSharedCandidate: sharedDecisionRef, preImplementationProofCandidate: currentProof, componentsSha256: componentsSha };
  writeJson(bApprovalPath, bApproval);
  const bApprovalRef = ref(bApprovalPath);

  const baselineContractPath = candidate("baseline", "fidelity-comparison-open-service-top-hero-v1.pending-owner-reapproval.json");
  const currentContractPath = candidate("current", "fidelity-comparison-open-service-top-hero-v1.pending-owner-reapproval.json");
  for (const [condition, pathname, proof, cleanRoom] of [["baseline", baselineContractPath, baselineProof, baselineClean], ["current", currentContractPath, currentProof, currentClean]]) {
    const wrapper = readJson(pathname);
    const contract = wrapper.candidateComparison;
    contract.shared.sourceSnapshot.preImplementationProof.sha256 = proof.sha256;
    contract.shared.ownerDecisionJ.sha256 = sharedDecisionRef.sha256;
    contract.run.cleanRoom.evidence.sha256 = cleanRoom.sha256;
    if (condition === "current") contract.run.evaluatedChange.approvalRecord.sha256 = bApprovalRef.sha256;
    wrapper.reapprovalBinding = {
      sharedDecisionJCandidate: sharedDecisionRef,
      preImplementationProofCandidate: proof,
      cleanRoomCandidate: cleanRoom,
      bOnlyChangeApprovalCandidate: condition === "current" ? bApprovalRef : null,
    };
    writeJson(pathname, wrapper);
  }
  const baselineContract = ref(baselineContractPath);
  const currentContract = ref(currentContractPath);

  const protocolPath = candidate("shared", "p3-role-handoff-protocol-open-service-top-hero-v1.pending-owner-reapproval.json");
  const protocolWrapper = readJson(protocolPath);
  const protocol = protocolWrapper.candidateProtocol;
  protocol.finalBindings.ownerDecisionJ.sha256 = sharedDecisionRef.sha256;
  protocol.finalBindings.preImplementationProof.sha256 = baselineProof.sha256;
  protocol.finalBindings.comparisonContracts[0].sha256 = baselineContract.sha256;
  protocol.finalBindings.comparisonContracts[1].sha256 = currentContract.sha256;
  protocol.finalBindings.cleanRoomEvidence[0].sha256 = baselineClean.sha256;
  protocol.finalBindings.cleanRoomEvidence[1].sha256 = currentClean.sha256;
  protocolWrapper.reapprovalBinding = {
    sharedDecisionJCandidate: sharedDecisionRef,
    preImplementationProofCandidate: baselineProof,
    baselineContractCandidate: baselineContract,
    currentContractCandidate: currentContract,
    baselineCleanRoomCandidate: baselineClean,
    currentCleanRoomCandidate: currentClean,
  };
  writeJson(protocolPath, protocolWrapper);
  const protocolRef = ref(protocolPath);

  const registryPath = candidate("shared", "p3-role-handoff-registry-open-service-top-hero-v1-20260809.pending-owner-reapproval.json");
  const registryWrapper = readJson(registryPath);
  registryWrapper.candidateRegistry.protocol.sha256 = protocolRef.sha256;
  registryWrapper.reapprovalBinding = { handoffProtocolCandidate: protocolRef };
  writeJson(registryPath, registryWrapper);
  const registryRef = ref(registryPath);

  report.pendingCandidates.baseline = { preImplementationProof: baselineProof, decisionJ: sharedDecisionRef, cleanRoomEvidence: baselineClean, comparisonContract: baselineContract };
  report.pendingCandidates.current = { preImplementationProof: currentProof, decisionJ: sharedDecisionRef, cleanRoomEvidence: currentClean, bOnlyChangeApproval: bApprovalRef, comparisonContract: currentContract };
  report.pendingCandidates.shared = { ownerDecisionJ: sharedDecisionRef, handoffProtocol: protocolRef, handoffRegistry: registryRef };
  report.supersededCoordinatorCandidates = [
    { ...oldPending.baseline.decisionJ, reason: "Condition-local Decision J candidate superseded by the shared A/B candidate; it had no live replacement authority." },
    { ...oldPending.current.decisionJ, reason: "Condition-local Decision J candidate superseded by the shared A/B candidate; it had no live replacement authority." },
  ];
  report.reapprovalBindings = [
    bind("baseline-preImplementationProof", "owner-approved", "baseline", workspace(BASELINE, REL.preImplementation), "3ff6c2983b06200fb7d05a37729797bc51dc07695d05f99b11c2514b2856bbc8", baselineProof),
    bind("current-preImplementationProof", "owner-approved", "current", workspace(CURRENT, REL.preImplementation), "3ff6c2983b06200fb7d05a37729797bc51dc07695d05f99b11c2514b2856bbc8", currentProof),
    bind("baseline-ownerDecisionJ", "owner-approved", "baseline", workspace(BASELINE, REL.decisionJ), "09705ca6480d51aba89d72e41d69ff8257e0d95b96b36c235ad8c199181908a2", sharedDecisionRef),
    bind("current-ownerDecisionJ", "owner-approved", "current", workspace(CURRENT, REL.decisionJ), "09705ca6480d51aba89d72e41d69ff8257e0d95b96b36c235ad8c199181908a2", sharedDecisionRef),
    bind("baseline-cleanRoomEvidence", "owner-approved", "baseline", workspace(BASELINE, REL.cleanRoomBaseline), "38c5411cabf6325b3e9ad690e10b7fb40d3a13f1f8d948c4abc24c75f280ca95", baselineClean),
    bind("current-cleanRoomEvidence", "owner-approved", "current", workspace(CURRENT, REL.cleanRoomCurrent), "b209aa15357106febf4e79b765a61b7e5f67e89206992e34ab2f0adaaab237fa", currentClean),
    bind("current-bOnlyChangeApproval", "owner-approved", "current", workspace(CURRENT, REL.bApproval), "ad0cfa4ed2f90bd5e118af27058b9f35e9dad35b3dc2a61cf52126d6b4e316fb", bApprovalRef),
    bind("baseline-comparisonContract", "final-contract", "baseline", workspace(BASELINE, REL.contract), "6d623fbd20ccc6bde4812e4fbdfec6b07b4ffa0b8dbd76d653272b54f6ba862e", baselineContract),
    bind("current-comparisonContract", "final-contract", "current", workspace(CURRENT, REL.contract), "5d3109728338aaac4ea82656eb263ade36288548174cbe547a4fd34bc5dd3430", currentContract),
    bind("baseline-handoffProtocol", "coordinator-final", "baseline", workspace(BASELINE, REL.protocol), "7fbd6dabf6a0faf2b1fa34ac626aca04e53735d5df35a50356cbd9ecd1eff80a", protocolRef),
    bind("current-handoffProtocol", "coordinator-final", "current", workspace(CURRENT, REL.protocol), "7fbd6dabf6a0faf2b1fa34ac626aca04e53735d5df35a50356cbd9ecd1eff80a", protocolRef),
    bind("handoffRegistry", "coordinator-final", "shared", REGISTRY, "704ce401194a181366fae43107f60caa34db5b4768d49b415108f2344469eec0", registryRef),
  ];
  report.bindingAudit = {
    status: "PASS",
    requiredReplacementBindings: report.reapprovalBindings.length,
    boundReplacementBindings: report.reapprovalBindings.length,
    unboundImmutableApprovedRecords: [],
    unaffectedApprovedRecords: [
      {
        conditions: ["baseline", "current"],
        path: REL.evaluatorBaseline,
        sha256: evaluatorSha,
        reason: "No direct or transitive fresh-manifest dependency was found in the audited graph.",
      },
    ],
  };
  report.oneLineOwnerAuthorization = "I authorize atomic regeneration and replacement of every record bound in reapprovalBindings for the P-3 R4 fresh-manifest repair, setting ownerApproved:true only after the final bytes and actual approval timestamps are produced.";
  writeJson(REPORT_PATH, report);
  writeFileSync(join(COORDINATOR, "OWNER-AUTHORIZATION.txt"), `${report.oneLineOwnerAuthorization}\n`, "utf8");
  console.log(JSON.stringify({ reportSha256: fileHash(REPORT_PATH), sharedDecisionJ: sharedDecisionRef, protocol: protocolRef, registry: registryRef, bindingAudit: report.bindingAudit, ownerAuthorization: report.oneLineOwnerAuthorization }, null, 2));
}

main();
