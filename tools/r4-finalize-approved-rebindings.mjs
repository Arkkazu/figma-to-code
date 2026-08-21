import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";

const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const PILOT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot";
const COORDINATOR = `${PILOT}/.git/p3-coordinator/open-service-top-hero-v1-20260809/reapproval/fresh-manifest-rebind-20260812`;
const REPORT_PATH = `${COORDINATOR}/reapproval-bundle-report.json`;
const P11_PATH = `${PILOT}/.git/p3-coordinator/open-service-top-hero-v1-20260809/records/p3-p11-authorization-open-service-top-hero-v1-20260809.json`;
const REGISTRY_PATH = `${PILOT}/.git/p3-coordinator/open-service-top-hero-v1-20260809/records/p3-role-handoff-registry-open-service-top-hero-v1-20260809.json`;
const PAIR_ID = "open-service-top-hero-v1-20260809";
const EVAL = ["fidelityBenchmark", "figmaGate", "gateBrowserBatch", "verifyLayout", "checkpointCapture", "checkpointDiff", "cdpBrowser", "accessibilityVerify", "motionVerify", "lintUnits", "loopLearn", "loopLearningPolicy"];
const GATE_KEYS = ["manifest", "spec", "components", "mapping", "nodeMap", "componentDecision", "nodeEvidence", "layerEvidence", "accessibility", "motion", "axeSource"];
const REL = {
  manifest: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/fresh-gate-manifest.json",
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
  bApproval: "MyBrain/verify/p3-current-change-approval-open-service-top-hero-v1.json",
  contract: "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
  protocol: "MyBrain/verify/p3-role-handoff-protocol-open-service-top-hero-v1.json",
};
const P11_SHA256 = "f86935f5bfe372b3a6db25aef399ec83e77d9f6d228c69eabffb6896ec5e6fe6";

const fail = (message) => { throw new Error(message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => `${JSON.stringify(value, null, 2)}\n`;
const jsonHash = (value) => sha256(Buffer.from(text(value), "utf8"));
const fileHash = (pathname) => sha256(readFileSync(pathname));
const readJson = (pathname) => JSON.parse(readFileSync(pathname, "utf8"));
const rootFile = (root, relativePath) => join(root, ...relativePath.split("/"));
const candidatePath = (condition, filename) => join(COORDINATOR, "candidates", condition, filename);
const normalized = (pathname) => normalize(resolve(pathname)).replace(/\\/g, "/").toLowerCase();
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const stableHash = (value) => sha256(Buffer.from(JSON.stringify(stable(value)), "utf8"));
const frozen = (reference) => ({ path: reference.path, sha256: reference.sha256 });
const refFor = (pathname) => ({ path: pathname.replace(/\\/g, "/"), sha256: fileHash(pathname) });
const assert = (condition, message) => { if (!condition) fail(message); };

function materialize(candidate, approvedAt, approvalBasis) {
  const value = clone(candidate);
  delete value.reapproval;
  value.status = "approved";
  value.ownerApproved = true;
  value.approvedAt = approvedAt;
  value.approvalBasis = approvalBasis;
  return value;
}

function nextActualTimestamp(clock) {
  const now = Date.now();
  clock.value = Math.max(now, clock.value + 1);
  return new Date(clock.value).toISOString();
}

function draftMarkerErrors(value, pointer = "$", errors = []) {
  if (typeof value === "string") {
    if (value.trim().toUpperCase().startsWith("OWNER_INPUT_REQUIRED")) errors.push(`${pointer}: OWNER_INPUT_REQUIRED`);
    if (value.replace(/\\/g, "/").split("/").some((segment) => segment.toLowerCase() === "p3-drafts")) errors.push(`${pointer}: p3-drafts path`);
    if (value.includes("pending-owner-reapproval")) errors.push(`${pointer}: pending reapproval marker`);
    return errors;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => draftMarkerErrors(entry, `${pointer}/${index}`, errors));
    return errors;
  }
  if (!value || typeof value !== "object") return errors;
  for (const [key, entry] of Object.entries(value)) {
    const child = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    if (key === "_draftOnly" || key === "draftOnly") errors.push(`${child}: draft-only marker`);
    if (key === "status" && typeof entry === "string" && entry.trim().toLowerCase() === "draft") errors.push(`${child}: status:draft`);
    draftMarkerErrors(entry, child, errors);
  }
  return errors;
}

function assertReference(pathname, reference, label) {
  assert(reference && typeof reference === "object" && typeof reference.path === "string" && typeof reference.sha256 === "string", `${label} is not a frozen reference`);
  const resolved = isAbsolute(reference.path) ? reference.path : rootFile(pathname, reference.path);
  assert(existsSync(resolved), `${label} target is absent: ${reference.path}`);
  assert(fileHash(resolved) === reference.sha256, `${label} SHA-256 mismatch: ${reference.path}`);
}

function verifyReferenceTree(root, value, label, seen = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => verifyReferenceTree(root, entry, `${label}[${index}]`, seen));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.path === "string" && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256)) {
    const pathname = isAbsolute(value.path) ? value.path : rootFile(root, value.path);
    const key = normalized(pathname);
    if (!seen.has(key)) {
      seen.add(key);
      assert(existsSync(pathname), `${label} frozen reference missing: ${value.path}`);
      assert(fileHash(pathname) === value.sha256.toLowerCase(), `${label} frozen reference SHA mismatch: ${value.path}`);
    }
  }
  for (const [key, entry] of Object.entries(value)) verifyReferenceTree(root, entry, `${label}.${key}`, seen);
}

function normalizeCleanRoomAuthorization(raw) {
  const conditions = raw.conditions.map((entry) => ({
    condition: entry.condition,
    evidencePath: entry.evidencePath.replace(/\\/g, "/"),
    workspaceId: entry.workspaceId,
    worktreeRoot: normalized(entry.worktreeRoot),
    implementation: { actor: entry.implementation.actor, contextId: entry.implementation.contextId },
    review: { actor: entry.review.actor, contextId: entry.review.contextId },
    otherWorkspaceId: entry.otherWorkspaceId,
    isolationMechanism: entry.isolationMechanism,
    otherConditionArtifactsAccessible: entry.otherConditionArtifactsAccessible,
    prohibitedArtifacts: [...entry.prohibitedArtifacts],
  }));
  return { version: 1, pairId: raw.pairId, conditions };
}

function frozenScope(root, contract) {
  const manifest = readJson(rootFile(root, contract.shared.gate.inputs.manifest.path));
  const componentsDocument = readJson(rootFile(root, contract.shared.gate.inputs.components.path));
  const decisionsDocument = readJson(rootFile(root, manifest.scope.componentDecisionPath));
  const decisions = new Map(decisionsDocument.decisions.map((entry) => [entry.elementId, entry]));
  const components = componentsDocument.components.map((entry) => {
    const decision = decisions.get(entry.elementId);
    assert(decision, `Missing component decision for ${entry.elementId}`);
    return { elementId: entry.elementId, selector: entry.selector, figmaNodeId: entry.figmaNodeId, codePath: decision.codePath };
  }).sort((a, b) => a.elementId.localeCompare(b.elementId));
  assert(decisions.size === components.length, "Component decision count differs from frozen component scope");
  const coverage = readJson(rootFile(root, contract.shared.scope.pageCoverage.path));
  return {
    verifyUrl: manifest.scope.verifyUrl,
    checkpointPlan: [...manifest.scope.checkpointPlan],
    changeTargets: [...manifest.scope.changeTargets],
    targetSectionIds: coverage.sections.filter((entry) => entry.role === "target").map((entry) => entry.sectionId),
    components,
  };
}

function provider(contract, scope) {
  const source = contract.shared.pageProvider;
  return {
    kind: source.kind,
    outputRoot: source.outputRoot,
    entryPath: source.entryPath,
    entryTargetPath: `${source.outputRoot}/${source.entryPath}`,
    targetPaths: [...scope.changeTargets].sort(),
    verifyUrl: new URL(scope.verifyUrl).href,
  };
}

function decisionBundle(root, contract, evaluatorExecutionBundleSha256) {
  const raw = contract.shared;
  const figma = {
    fileKey: raw.figma.fileKey,
    rootNodeId: raw.figma.rootNodeId,
    nodeMap: frozen(raw.figma.nodeMap),
    metadata: frozen(raw.figma.metadata),
    designContexts: raw.figma.designContexts.map(frozen),
    screenshots: raw.figma.screenshots.map(frozen),
    assets: raw.figma.assets.map(frozen),
  };
  const sourceSnapshot = {
    archive: frozen(raw.sourceSnapshot.archive),
    preImplementationProof: frozen(raw.sourceSnapshot.preImplementationProof),
    git: { commit: raw.sourceSnapshot.git.commit, tree: raw.sourceSnapshot.git.tree },
  };
  const scope = {
    specs: raw.scope.specs.map(frozen),
    pageCoverage: frozen(raw.scope.pageCoverage),
    masks: raw.scope.masks.map(frozen),
    thresholds: frozen(raw.scope.thresholds),
    frozen: frozenScope(root, contract),
  };
  const inputs = {};
  for (const key of GATE_KEYS) inputs[key] = frozen(raw.gate.inputs[key]);
  const roots = {};
  for (const key of EVAL) roots[key] = frozen(raw.evaluator[key]);
  const cleanRoomAuthorization = normalizeCleanRoomAuthorization(raw.cleanRoomAuthorization);
  return {
    version: 1,
    figma,
    sourceSnapshot,
    scope,
    gate: { manifestId: raw.gate.manifestId, inputs },
    evaluator: { roots, baselineRecord: frozen(raw.evaluator.baselineRecord), executionBundleSha256: evaluatorExecutionBundleSha256 },
    environment: { nodeVersion: raw.environment.nodeVersion, nodeExecArgv: [...raw.environment.nodeExecArgv], chrome: clone(raw.environment.chrome) },
    pageProvider: provider(contract, scope.frozen),
    cleanRoomAuthorization,
  };
}

function refreshContract(wrapper, root, condition, sidecars, finalRefs) {
  const contract = clone(wrapper.candidateComparison);
  assert(contract.pairId === PAIR_ID && contract.condition === condition, `${condition} contract candidate identity differs`);
  contract.shared.figma.nodeMap.sha256 = sidecars.nodeMap;
  contract.shared.figma.metadata.sha256 = sidecars.nodeEvidence;
  contract.shared.figma.screenshots[0].sha256 = sidecars.referenceCrops;
  contract.shared.scope.specs[0].sha256 = sidecars.spec;
  contract.shared.gate.inputs.spec.sha256 = sidecars.spec;
  contract.shared.gate.inputs.components.sha256 = sidecars.components;
  contract.shared.gate.inputs.nodeMap.sha256 = sidecars.nodeMap;
  contract.shared.gate.inputs.nodeEvidence.sha256 = sidecars.nodeEvidence;
  contract.shared.gate.inputs.layerEvidence.sha256 = sidecars.layerEvidence;
  contract.shared.sourceSnapshot.preImplementationProof.sha256 = finalRefs.preImplementation.sha256;
  contract.shared.ownerDecisionJ.sha256 = finalRefs.decisionJ.sha256;
  contract.run.cleanRoom.evidence.sha256 = finalRefs.cleanRoom.sha256;
  if (condition === "current") contract.run.evaluatedChange.approvalRecord.sha256 = finalRefs.bApproval.sha256;
  return contract;
}

function stagePayloads(report) {
  const byId = new Map(report.reapprovalBindings.map((binding) => [binding.id, binding]));
  const binding = (id) => {
    const found = byId.get(id);
    assert(found, `Missing reapproval binding ${id}`);
    assert(fileHash(found.live.path) === found.live.sha256, `Live precondition diverged: ${id}`);
    assert(fileHash(found.replacementCandidate.path) === found.replacementCandidate.sha256, `Candidate precondition diverged: ${id}`);
    return found;
  };
  const needed = ["baseline-preImplementationProof", "current-preImplementationProof", "baseline-ownerDecisionJ", "current-ownerDecisionJ", "baseline-cleanRoomEvidence", "current-cleanRoomEvidence", "current-bOnlyChangeApproval", "baseline-comparisonContract", "current-comparisonContract", "baseline-handoffProtocol", "current-handoffProtocol", "handoffRegistry"];
  assert(byId.size === needed.length && needed.every((id) => byId.has(id)), "reapprovalBindings are not exactly the authorized 12 records");
  const bindings = Object.fromEntries(needed.map((id) => [id, binding(id)]));

  const sidecarEntries = Object.fromEntries(report.changedLiveNonOwnerArtifacts.map((entry) => [entry.path, entry]));
  const sidecar = {};
  for (const [key, relativePath] of Object.entries({ manifest: REL.manifest, nodeEvidence: REL.nodeEvidence, referenceCrops: REL.referenceCrops, nodeMap: REL.nodeMap, layerEvidence: REL.layerEvidence, spec: REL.spec, components: REL.components })) {
    const entry = sidecarEntries[relativePath];
    assert(entry, `Report lacks sidecar entry ${relativePath}`);
    const base = rootFile(BASELINE, relativePath); const current = rootFile(CURRENT, relativePath);
    assert(fileHash(base) === entry.newSha256 && fileHash(current) === entry.newSha256, `A/B sidecar precondition diverged: ${relativePath}`);
    sidecar[key] = entry.newSha256;
  }

  assert(fileHash(P11_PATH) === P11_SHA256, "P-11 record precondition diverged");
  const p11 = readJson(P11_PATH);
  assert(p11.status === "BLOCKED" && p11.authorization === "NOT_AUTHORIZED", "P-11 record is not BLOCKED / NOT_AUTHORIZED");
  const roleHomes = ["a-impl", "a-review", "b-impl", "b-review"].map((name) => `C:/Users/tane1/AppData/Local/p3-role-homes/${name}`);
  const roleHomeFingerprints = roleHomes.map((pathname) => {
    assert(existsSync(pathname), `Role home is absent: ${pathname}`);
    const config = join(pathname, "config.toml");
    assert(!existsSync(config), `Role home has forbidden config.toml: ${pathname}`);
    return { path: pathname, configTomlPresent: false };
  });

  const clock = { value: Date.now() - 1 };
  const preApprovedAt = nextActualTimestamp(clock);
  const decisionApprovedAt = nextActualTimestamp(clock);
  const cleanApprovedAt = nextActualTimestamp(clock);
  const changeApprovedAt = nextActualTimestamp(clock);
  const proofCandidate = readJson(bindings["baseline-preImplementationProof"].replacementCandidate.path);
  const currentProofCandidate = readJson(bindings["current-preImplementationProof"].replacementCandidate.path);
  assert(JSON.stringify(proofCandidate) === JSON.stringify(currentProofCandidate), "A/B preImplementation candidates differ");
  const finalProof = materialize(proofCandidate, preApprovedAt, "Owner reapproved the frozen non-draft P-3 planning inputs after the R4 fresh-manifest repair. This record does not assert pair lifecycle, role delivery, implementation, browser/Figma observation, release, or P-11 authorization.");
  const finalProofSha = jsonHash(finalProof);

  const decisionCandidate = readJson(bindings["baseline-ownerDecisionJ"].replacementCandidate.path);
  assert(JSON.stringify(decisionCandidate) === JSON.stringify(readJson(bindings["current-ownerDecisionJ"].replacementCandidate.path)), "A/B Decision J candidates differ");
  const finalDecision = materialize(decisionCandidate, decisionApprovedAt, "Owner reapproved Decision J against the regenerated final P-3 input bundle after the R4 fresh-manifest repair. This authorizes only the specified non-public pilot planning boundary; it does not start lifecycle, role delivery, implementation, browser/Figma observation, release, or P-11.");
  finalDecision.sourceSnapshot.preImplementationProofSha256 = finalProofSha;
  finalDecision.scope.componentsSha256 = sidecar.components;
  const authorization = normalizeCleanRoomAuthorization(finalDecision.cleanRoomAuthorization);
  finalDecision.cleanRoomAuthorization = authorization;
  finalDecision.cleanRoomAuthorizationStableJsonSha256 = stableHash(authorization);

  // Build an initial contract whose references not included in Decision J's bundle
  // already point to their final frozen files. Decision J itself is not in that bundle.
  const baselineContractWrapper = readJson(bindings["baseline-comparisonContract"].replacementCandidate.path);
  const currentContractWrapper = readJson(bindings["current-comparisonContract"].replacementCandidate.path);
  const provisionalRefs = { preImplementation: { path: REL.preImplementation, sha256: finalProofSha }, decisionJ: { path: REL.decisionJ, sha256: "0".repeat(64) }, cleanRoom: { path: "", sha256: "0".repeat(64) }, bApproval: { path: REL.bApproval, sha256: "0".repeat(64) } };
  const provisionalBaseline = refreshContract(baselineContractWrapper, BASELINE, "baseline", sidecar, provisionalRefs);
  const provisionalCurrent = refreshContract(currentContractWrapper, CURRENT, "current", sidecar, provisionalRefs);
  const bundleBaseline = decisionBundle(BASELINE, provisionalBaseline, finalDecision.evaluatorExecutionBundleSha256);
  const bundleCurrent = decisionBundle(CURRENT, provisionalCurrent, finalDecision.evaluatorExecutionBundleSha256);
  assert(stableHash(bundleBaseline) === stableHash(bundleCurrent), "A/B Decision J input bundle differs before final replacement");
  finalDecision.comparisonInputBundleSha256 = stableHash(bundleBaseline);
  const finalDecisionSha = jsonHash(finalDecision);

  const cleanBaselineCandidate = readJson(bindings["baseline-cleanRoomEvidence"].replacementCandidate.path);
  const cleanCurrentCandidate = readJson(bindings["current-cleanRoomEvidence"].replacementCandidate.path);
  const finalCleanBaseline = materialize(cleanBaselineCandidate, cleanApprovedAt, "Owner reapproved the attachment-only clean-room boundary for baseline after the R4 fresh-manifest repair. This record binds the reapproved Decision J and does not evidence a role launch, lifecycle, implementation, browser/Figma observation, or P-11 authorization.");
  const finalCleanCurrent = materialize(cleanCurrentCandidate, cleanApprovedAt, "Owner reapproved the attachment-only clean-room boundary for current after the R4 fresh-manifest repair. This record binds the reapproved Decision J and does not evidence a role launch, lifecycle, implementation, browser/Figma observation, or P-11 authorization.");
  for (const clean of [finalCleanBaseline, finalCleanCurrent]) {
    clean.ownerDecisionJ.fileSha256 = finalDecisionSha;
    clean.cleanRoomAuthorizationStableJsonSha256 = finalDecision.cleanRoomAuthorizationStableJsonSha256;
  }
  const finalCleanBaselineSha = jsonHash(finalCleanBaseline);
  const finalCleanCurrentSha = jsonHash(finalCleanCurrent);

  const changeCandidate = readJson(bindings["current-bOnlyChangeApproval"].replacementCandidate.path);
  const finalChange = materialize(changeCandidate, changeApprovedAt, "Owner reapproved hero-asset-provenance-and-responsive-geometry only for the current/B condition under the reapproved Decision J after the R4 fresh-manifest repair. This is planning authorization only; it does not assert implementation, role delivery, browser/Figma observation, lifecycle, or P-11 authorization.");
  finalChange.ownerDecisionJSha256 = finalDecisionSha;
  finalChange.sourceSnapshot.preImplementationProofSha256 = finalProofSha;
  finalChange.scope.componentsSha256 = sidecar.components;
  const finalChangeSha = jsonHash(finalChange);

  const finalBaselineContract = refreshContract(baselineContractWrapper, BASELINE, "baseline", sidecar, {
    preImplementation: { path: REL.preImplementation, sha256: finalProofSha },
    decisionJ: { path: REL.decisionJ, sha256: finalDecisionSha },
    cleanRoom: { path: REL.cleanRoomBaseline, sha256: finalCleanBaselineSha },
    bApproval: { path: REL.bApproval, sha256: finalChangeSha },
  });
  const finalCurrentContract = refreshContract(currentContractWrapper, CURRENT, "current", sidecar, {
    preImplementation: { path: REL.preImplementation, sha256: finalProofSha },
    decisionJ: { path: REL.decisionJ, sha256: finalDecisionSha },
    cleanRoom: { path: REL.cleanRoomCurrent, sha256: finalCleanCurrentSha },
    bApproval: { path: REL.bApproval, sha256: finalChangeSha },
  });
  const finalBaselineContractSha = jsonHash(finalBaselineContract);
  const finalCurrentContractSha = jsonHash(finalCurrentContract);

  const protocolWrapper = readJson(bindings["baseline-handoffProtocol"].replacementCandidate.path);
  assert(JSON.stringify(protocolWrapper) === JSON.stringify(readJson(bindings["current-handoffProtocol"].replacementCandidate.path)), "A/B protocol candidates differ");
  const finalProtocol = clone(protocolWrapper.candidateProtocol);
  finalProtocol.recordState = "final";
  finalProtocol.executionState = false;
  finalProtocol.ownerAuthorized = true;
  finalProtocol.authorizationBasis = "Owner authorized the atomic R4 fresh-manifest reapproval replacement chain. This coordinator protocol does not itself execute pair lifecycle, role delivery, implementation, browser/Figma observation, or P-11.";
  finalProtocol.finalBindings.ownerDecisionJ.sha256 = finalDecisionSha;
  finalProtocol.finalBindings.preImplementationProof.sha256 = finalProofSha;
  finalProtocol.finalBindings.comparisonContracts[0].sha256 = finalBaselineContractSha;
  finalProtocol.finalBindings.comparisonContracts[1].sha256 = finalCurrentContractSha;
  finalProtocol.finalBindings.cleanRoomEvidence[0].sha256 = finalCleanBaselineSha;
  finalProtocol.finalBindings.cleanRoomEvidence[1].sha256 = finalCleanCurrentSha;
  const finalProtocolSha = jsonHash(finalProtocol);

  const registryWrapper = readJson(bindings.handoffRegistry.replacementCandidate.path);
  const finalRegistry = clone(registryWrapper.candidateRegistry);
  finalRegistry.recordState = "final";
  finalRegistry.executionState = false;
  finalRegistry.ownerAuthorized = true;
  finalRegistry.protocol.sha256 = finalProtocolSha;
  const finalRegistrySha = jsonHash(finalRegistry);

  const replacements = [
    { id: "baseline-preImplementationProof", path: bindings["baseline-preImplementationProof"].live.path, value: finalProof },
    { id: "current-preImplementationProof", path: bindings["current-preImplementationProof"].live.path, value: finalProof },
    { id: "baseline-ownerDecisionJ", path: bindings["baseline-ownerDecisionJ"].live.path, value: finalDecision },
    { id: "current-ownerDecisionJ", path: bindings["current-ownerDecisionJ"].live.path, value: finalDecision },
    { id: "baseline-cleanRoomEvidence", path: bindings["baseline-cleanRoomEvidence"].live.path, value: finalCleanBaseline },
    { id: "current-cleanRoomEvidence", path: bindings["current-cleanRoomEvidence"].live.path, value: finalCleanCurrent },
    { id: "current-bOnlyChangeApproval", path: bindings["current-bOnlyChangeApproval"].live.path, value: finalChange },
    { id: "baseline-comparisonContract", path: bindings["baseline-comparisonContract"].live.path, value: finalBaselineContract },
    { id: "current-comparisonContract", path: bindings["current-comparisonContract"].live.path, value: finalCurrentContract },
    { id: "baseline-handoffProtocol", path: bindings["baseline-handoffProtocol"].live.path, value: finalProtocol },
    { id: "current-handoffProtocol", path: bindings["current-handoffProtocol"].live.path, value: finalProtocol },
    { id: "handoffRegistry", path: bindings.handoffRegistry.live.path, value: finalRegistry },
  ].map((entry) => ({ ...entry, bytes: Buffer.from(text(entry.value), "utf8"), sha256: jsonHash(entry.value) }));
  for (const replacement of replacements) {
    const bindingRecord = bindings[replacement.id];
    assert(replacement.path === bindingRecord.live.path, `${replacement.id} target is outside reapprovalBindings`);
  }
  return {
    bindings,
    sidecar,
    p11Hash: fileHash(P11_PATH),
    roleHomeFingerprints,
    timestamps: { preImplementation: preApprovedAt, decisionJ: decisionApprovedAt, cleanRoom: cleanApprovedAt, bOnlyChangeApproval: changeApprovedAt },
    replacements,
    final: {
      proofSha: finalProofSha,
      decisionSha: finalDecisionSha,
      cleanBaselineSha: finalCleanBaselineSha,
      cleanCurrentSha: finalCleanCurrentSha,
      changeSha: finalChangeSha,
      baselineContractSha: finalBaselineContractSha,
      currentContractSha: finalCurrentContractSha,
      protocolSha: finalProtocolSha,
      registrySha: finalRegistrySha,
      decisionInputBundleSha: finalDecision.comparisonInputBundleSha256,
      decisionAuthorizationSha: finalDecision.cleanRoomAuthorizationStableJsonSha256,
    },
  };
}

function atomicWrite(pathname, bytes) {
  const temporary = `${pathname}.r4-final-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, pathname);
}

function commitTransaction(plan) {
  const originals = new Map(plan.replacements.map((entry) => [entry.path, readFileSync(entry.path)]));
  let committed = false;
  try {
    for (const replacement of plan.replacements) atomicWrite(replacement.path, replacement.bytes);
    committed = true;
    return originals;
  } catch (error) {
    const restoreErrors = [];
    for (const [pathname, bytes] of originals) {
      try { atomicWrite(pathname, bytes); }
      catch (restoreError) { restoreErrors.push(`${pathname}: ${restoreError.message}`); }
    }
    const suffix = restoreErrors.length ? `; rollback errors: ${restoreErrors.join(" | ")}` : "; all changed files rolled back";
    throw new Error(`Atomic replacement failed: ${error.message}${suffix}`);
  }
}

function rollback(originals) {
  const errors = [];
  for (const [pathname, bytes] of originals) {
    try { atomicWrite(pathname, bytes); }
    catch (error) { errors.push(`${pathname}: ${error.message}`); }
  }
  if (errors.length) fail(`Post-commit validation failed and rollback was incomplete: ${errors.join(" | ")}`);
}

function validateLive(plan) {
  for (const replacement of plan.replacements) {
    assert(fileHash(replacement.path) === replacement.sha256, `Final replacement SHA mismatch: ${replacement.id}`);
    const errors = draftMarkerErrors(readJson(replacement.path));
    assert(!errors.length, `Final runtime guard marker(s) in ${replacement.id}: ${errors.join("; ")}`);
  }
  for (const [key, relativePath] of Object.entries({ manifest: REL.manifest, nodeEvidence: REL.nodeEvidence, referenceCrops: REL.referenceCrops, nodeMap: REL.nodeMap, layerEvidence: REL.layerEvidence, spec: REL.spec, components: REL.components })) {
    const baselineHash = fileHash(rootFile(BASELINE, relativePath));
    const currentHash = fileHash(rootFile(CURRENT, relativePath));
    assert(baselineHash === plan.sidecar[key] && currentHash === plan.sidecar[key], `Factual sidecar changed or A/B diverged: ${relativePath}`);
  }
  const proofA = readJson(rootFile(BASELINE, REL.preImplementation)); const proofB = readJson(rootFile(CURRENT, REL.preImplementation));
  const decisionA = readJson(rootFile(BASELINE, REL.decisionJ)); const decisionB = readJson(rootFile(CURRENT, REL.decisionJ));
  const protocolA = readJson(rootFile(BASELINE, REL.protocol)); const protocolB = readJson(rootFile(CURRENT, REL.protocol));
  assert(JSON.stringify(proofA) === JSON.stringify(proofB), "A/B final preImplementation records differ");
  assert(JSON.stringify(decisionA) === JSON.stringify(decisionB), "A/B final Decision J records differ");
  assert(JSON.stringify(protocolA) === JSON.stringify(protocolB), "A/B final handoff protocols differ");
  assert(fileHash(rootFile(BASELINE, REL.preImplementation)) === plan.final.proofSha, "Final preImplementation SHA differs");
  assert(fileHash(rootFile(BASELINE, REL.decisionJ)) === plan.final.decisionSha, "Final Decision J SHA differs");
  assert(fileHash(rootFile(BASELINE, REL.protocol)) === plan.final.protocolSha, "Final protocol SHA differs");
  assert(fileHash(REGISTRY_PATH) === plan.final.registrySha, "Final registry SHA differs");

  const cleanA = readJson(rootFile(BASELINE, REL.cleanRoomBaseline)); const cleanB = readJson(rootFile(CURRENT, REL.cleanRoomCurrent));
  const change = readJson(rootFile(CURRENT, REL.bApproval));
  assert(Date.parse(proofA.approvedAt) <= Date.parse(decisionA.approvedAt), "PreImplementation approval is later than Decision J");
  assert(Date.parse(decisionA.approvedAt) < Date.parse(cleanA.approvedAt) && Date.parse(decisionA.approvedAt) < Date.parse(cleanB.approvedAt), "Decision J is not earlier than clean-room approval");
  assert(Date.parse(decisionA.approvedAt) < Date.parse(change.approvedAt), "Decision J is not earlier than B-only approval");
  assert(cleanA.ownerDecisionJ.fileSha256 === plan.final.decisionSha && cleanB.ownerDecisionJ.fileSha256 === plan.final.decisionSha, "Clean-room records do not bind final Decision J");
  assert(cleanA.cleanRoomAuthorizationStableJsonSha256 === decisionA.cleanRoomAuthorizationStableJsonSha256 && cleanB.cleanRoomAuthorizationStableJsonSha256 === decisionA.cleanRoomAuthorizationStableJsonSha256, "Clean-room authorization hash differs from final Decision J");
  assert(change.ownerDecisionJSha256 === plan.final.decisionSha && change.sourceSnapshot.preImplementationProofSha256 === plan.final.proofSha, "B-only approval does not bind final Decision J/preImplementation");
  assert(stableHash(normalizeCleanRoomAuthorization(decisionA.cleanRoomAuthorization)) === decisionA.cleanRoomAuthorizationStableJsonSha256, "Decision J clean-room authorization stable hash differs");

  const baselineContract = readJson(rootFile(BASELINE, REL.contract)); const currentContract = readJson(rootFile(CURRENT, REL.contract));
  for (const [root, contract, condition] of [[BASELINE, baselineContract, "baseline"], [CURRENT, currentContract, "current"]]) {
    verifyReferenceTree(root, contract, `${condition} final contract`);
    assert(contract.shared.ownerDecisionJ.sha256 === plan.final.decisionSha, `${condition} contract Decision J reference differs`);
    assert(contract.shared.sourceSnapshot.preImplementationProof.sha256 === plan.final.proofSha, `${condition} contract preImplementation reference differs`);
  }
  assert(baselineContract.run.cleanRoom.evidence.sha256 === plan.final.cleanBaselineSha, "baseline contract clean-room reference differs");
  assert(currentContract.run.cleanRoom.evidence.sha256 === plan.final.cleanCurrentSha, "current contract clean-room reference differs");
  assert(currentContract.run.evaluatedChange.approvalRecord.sha256 === plan.final.changeSha, "current contract B-only approval reference differs");
  verifyReferenceTree(BASELINE, proofA, "baseline final preImplementation");
  verifyReferenceTree(CURRENT, proofB, "current final preImplementation");
  verifyReferenceTree(BASELINE, protocolA, "baseline final protocol");
  const registry = readJson(REGISTRY_PATH);
  verifyReferenceTree(PILOT, registry, "final registry");
  assert(protocolA.finalBindings.ownerDecisionJ.sha256 === plan.final.decisionSha, "Protocol Decision J binding differs");
  assert(protocolA.finalBindings.preImplementationProof.sha256 === plan.final.proofSha, "Protocol preImplementation binding differs");
  assert(protocolA.finalBindings.comparisonContracts[0].sha256 === plan.final.baselineContractSha && protocolA.finalBindings.comparisonContracts[1].sha256 === plan.final.currentContractSha, "Protocol contract bindings differ");
  assert(protocolA.finalBindings.cleanRoomEvidence[0].sha256 === plan.final.cleanBaselineSha && protocolA.finalBindings.cleanRoomEvidence[1].sha256 === plan.final.cleanCurrentSha, "Protocol clean-room bindings differ");
  assert(registry.protocol.sha256 === plan.final.protocolSha, "Registry protocol binding differs");
  assert(fileHash(P11_PATH) === plan.p11Hash && fileHash(P11_PATH) === P11_SHA256, "P-11 record changed");
  const p11 = readJson(P11_PATH);
  assert(p11.status === "BLOCKED" && p11.authorization === "NOT_AUTHORIZED", "P-11 status changed");
  for (const roleHome of plan.roleHomeFingerprints) assert(existsSync(roleHome.path) && !existsSync(join(roleHome.path, "config.toml")), `Role home changed: ${roleHome.path}`);
  return { baselineContract, currentContract, decision: decisionA };
}

function validateDecisionInputPlan(root, expectedBundleSha) {
  const result = spawnSync(process.execPath, ["MyBrain/verify/fidelity-benchmark.mjs", "p3-decision-input-plan", "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json"], { cwd: root, encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `Read-only p3-decision-input-plan failed in ${root}: ${output}`);
  let plan;
  try { plan = JSON.parse(result.stdout); }
  catch { fail(`Read-only p3-decision-input-plan emitted invalid JSON in ${root}: ${output}`); }
  assert(plan.comparisonInputBundleSha256 === expectedBundleSha, `Decision J bundle differs from p3-decision-input-plan in ${root}`);
  return { comparisonInputBundleSha256: plan.comparisonInputBundleSha256, cleanRoomAuthorizationStableJsonSha256: plan.cleanRoomAuthorizationStableJsonSha256 };
}

function main() {
  const report = readJson(REPORT_PATH);
  assert(report.pairId === PAIR_ID, "Reapproval report pairId differs");
  assert(report.bindingAudit?.status === "PASS" && report.bindingAudit.boundReplacementBindings === 12 && report.bindingAudit.unboundImmutableApprovedRecords?.length === 0, "Reapproval binding audit is not final PASS");
  const plan = stagePayloads(report);
  const originals = commitTransaction(plan);
  try {
    const live = validateLive(plan);
    const baselineDecisionPlan = validateDecisionInputPlan(BASELINE, plan.final.decisionInputBundleSha);
    const currentDecisionPlan = validateDecisionInputPlan(CURRENT, plan.final.decisionInputBundleSha);
    assert(baselineDecisionPlan.comparisonInputBundleSha256 === currentDecisionPlan.comparisonInputBundleSha256, "A/B p3-decision-input-plan bundle differs");
    assert(baselineDecisionPlan.cleanRoomAuthorizationStableJsonSha256 === live.decision.cleanRoomAuthorizationStableJsonSha256, "Decision input plan authorization hash differs from final Decision J");
    console.log(JSON.stringify({
      status: "PASS",
      operation: "atomic-replacement-complete",
      pairId: PAIR_ID,
      replacedBindingIds: plan.replacements.map((entry) => entry.id),
      approvalTimestamps: plan.timestamps,
      finalHashes: plan.final,
      validation: {
        aBSharedByteEquality: ["preImplementationProof", "ownerDecisionJ", "handoffProtocol"],
        recursiveRuntimeGuardMarkers: "PASS",
        directRecursiveHashes: "PASS",
        decisionToCleanRoomAndBChronology: "PASS",
        p3DecisionInputPlanBaseline: "PASS",
        p3DecisionInputPlanCurrent: "PASS",
        p11: "BLOCKED / NOT_AUTHORIZED preserved",
        roleHomes: "unchanged; config.toml absent",
        lifecycleCommandsExecuted: false,
      },
    }, null, 2));
  } catch (error) {
    rollback(originals);
    throw error;
  }
}

main();
