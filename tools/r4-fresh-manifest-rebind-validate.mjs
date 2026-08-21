import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const BASELINE = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-baseline";
const CURRENT = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-current";
const COORDINATOR = "C:/docker-project/rpa-technologies/p3-open-service-top-hero-pilot/.git/p3-coordinator/open-service-top-hero-v1-20260809/reapproval/fresh-manifest-rebind-20260812";
const REPORT = join(COORDINATOR, "reapproval-bundle-report.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = (pathname) => sha256(readFileSync(pathname));
const readJson = (pathname) => JSON.parse(readFileSync(pathname, "utf8"));
const writeJson = (pathname, value) => writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const rel = {
  manifest: "MyBrain/verify/figma/open-service-top-hero-v1/fresh-gate/20260811T023327Z-07b2fcb5021a/fresh-gate-manifest.json",
  nodeEvidence: "MyBrain/verify/figma-node-evidence-open-service-top-hero-v1.json",
  referenceCrops: "MyBrain/verify/reference-crops-open-service-top-hero-v1.json",
  nodeMap: "MyBrain/verify/nodemap-open-service-top-hero-v1.json",
  layerEvidence: "MyBrain/verify/figma-layer-evidence-open-service-top-hero-v1.json",
  spec: "MyBrain/verify/spec-open-service-top-hero-v1.json",
  components: "MyBrain/verify/components-open-service-top-hero-v1.json",
};
const joinRel = (root, relative) => join(root, ...relative.split("/"));
const scan = (value, pointer = "$", errors = []) => {
  if (typeof value === "string") {
    if (value.trim().toUpperCase().startsWith("OWNER_INPUT_REQUIRED")) errors.push(`${pointer}: OWNER_INPUT_REQUIRED`);
    if (value.replace(/\\/g, "/").split("/").some((entry) => entry.toLowerCase() === "p3-drafts")) errors.push(`${pointer}: p3-drafts path`);
    return errors;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => scan(entry, `${pointer}/${index}`, errors)); return errors; }
  if (!value || typeof value !== "object") return errors;
  for (const [key, entry] of Object.entries(value)) {
    const child = `${pointer}/${key}`;
    if (key === "_draftOnly" || key === "draftOnly") errors.push(`${child}: draft marker`);
    if (key === "status" && typeof entry === "string" && entry.trim().toLowerCase() === "draft") errors.push(`${child}: draft status`);
    scan(entry, child, errors);
  }
  return errors;
};

const report = readJson(REPORT);
const expected = Object.fromEntries(report.changedLiveNonOwnerArtifacts.map((entry) => [entry.path, entry.newSha256]));
const conditions = {};
for (const [condition, root] of [["baseline", BASELINE], ["current", CURRENT]]) {
  conditions[condition] = { hashes: {}, draftGuardErrors: [], savedEvidenceHashErrors: [] };
  for (const relative of Object.values(rel)) {
    const pathname = joinRel(root, relative);
    conditions[condition].hashes[relative] = hashFile(pathname);
    if (relative !== rel.manifest && conditions[condition].hashes[relative] !== expected[relative]) throw new Error(`${condition} ${relative} SHA differs from coordinator report`);
    const document = readJson(pathname);
    conditions[condition].draftGuardErrors.push(...scan(document).map((error) => `${relative}${error}`));
    if (relative === rel.manifest) {
      if (document.draftOnly !== undefined) throw new Error(`${condition} manifest still has draftOnly`);
      if (document.purpose !== report.purpose) throw new Error(`${condition} manifest purpose differs from repaired purpose`);
      for (const entry of document.files) {
        const evidencePath = join(dirname(pathname), ...entry.path.split("/"));
        if (!existsSync(evidencePath) || hashFile(evidencePath) !== entry.actual.sha256) conditions[condition].savedEvidenceHashErrors.push(entry.path);
      }
    }
  }
  if (conditions[condition].draftGuardErrors.length || conditions[condition].savedEvidenceHashErrors.length) throw new Error(`${condition} post-repair guard failure`);
}
for (const relative of Object.values(rel)) {
  if (conditions.baseline.hashes[relative] !== conditions.current.hashes[relative]) throw new Error(`A/B differ at ${relative}`);
}

const result = spawnSync(process.execPath, ["MyBrain/verify/fidelity-benchmark.mjs", "p3-decision-input-plan", "MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json"], { cwd: BASELINE, encoding: "utf8" });
const combined = `${result.stdout || ""}${result.stderr || ""}`.trim();
const expectedFailure = result.status === 1 && combined.includes("shared.figma.nodeMap SHA-256 mismatch");
if (!expectedFailure) throw new Error(`Unexpected read-only p3-decision-input-plan result: exit=${result.status}; ${combined}`);

report.postRepairValidation = {
  liveAandBByteIdentical: true,
  recursiveDraftGuard: { passed: true, baselineErrors: [], currentErrors: [] },
  savedEvidenceBytes: { passed: true, baselineErrors: [], currentErrors: [] },
  p3DecisionInputPlan: {
    command: "node MyBrain/verify/fidelity-benchmark.mjs p3-decision-input-plan MyBrain/verify/fidelity-comparison-open-service-top-hero-v1.json",
    mode: "read-only current-contract audit",
    exitCode: result.status,
    expectedFailure: true,
    message: combined,
    interpretation: "The immutable existing contract still carries the pre-repair node-map hash, so it correctly refuses the repaired live sidecar. No pair lifecycle state was created.",
  },
  syntheticNonDraftPlan: {
    created: false,
    reason: "Not created. A passing synthetic plan would require representing pending replacement records as ownerApproved:true before the owner approval time exists, which would fabricate authorization.",
  },
};
writeJson(REPORT, report);
console.log(JSON.stringify({ reportSha256: hashFile(REPORT), validation: report.postRepairValidation }, null, 2));
