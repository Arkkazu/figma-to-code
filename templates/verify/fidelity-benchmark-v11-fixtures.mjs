#!/usr/bin/env node
// v13 contract compatibility fixtures. The historical filename is retained
// so this fixture explicitly proves that v12 and older contracts are rejected.
// It imports validators only; it never
// starts a pair, launches a browser/provider, calls Figma, or touches P-11.
import {
  p3ChromeFingerprintsEqual,
  p3ValidateActiveImplementationIdentity,
  p3ValidateChromeFingerprint,
  p3ValidateChromePolicy,
  p3ValidateContractVersion,
  p3ValidateDecisionCandidateDraftSchema,
  p3ValidateFigmaGateActiveStateVersion,
  p3ValidateImplementationIdentity,
} from "./fidelity-benchmark.mjs";

let assertions = 0;
function assert(condition, label) {
  assertions += 1;
  if (!condition) throw new Error(`fixture failed: ${label}`);
}
function accepts(result, label) { assert(result?.ok === true, label); return result.value; }
function rejects(result, label) { assert(result?.ok === false, label); }

const policy = {
  version: 1,
  source: "CDP Browser.getVersion",
  fields: ["product", "revision", "userAgent"],
  equality: "within-final-batches-and-across-pair",
};
const fingerprint = {
  source: "CDP Browser.getVersion",
  product: "Chrome/140.0.0.0",
  revision: "a1b2c3d4",
  userAgent: "Mozilla/5.0 fixture",
};
const identity = { actor: "codex", contextId: "p3-v13-fixture-implementation" };

accepts(p3ValidateContractVersion(13), "v13 contract version is accepted");
rejects(p3ValidateContractVersion(12), "v12 contract version is rejected without migration");
rejects(p3ValidateContractVersion(11), "v11 contract version is rejected without migration");
accepts(p3ValidateFigmaGateActiveStateVersion(5), "v13 figma-gate active state version 5 is accepted");
rejects(p3ValidateFigmaGateActiveStateVersion(4), "v4 figma-gate active state is rejected without migration");
rejects(p3ValidateFigmaGateActiveStateVersion(3), "v3 figma-gate active state is rejected without migration");
accepts(p3ValidateDecisionCandidateDraftSchema("p3-comparison-contract-draft/v13"), "v13 decision candidate envelope schema is accepted");
rejects(p3ValidateDecisionCandidateDraftSchema("p3-comparison-contract-draft/v12"), "v12 decision candidate envelope schema is rejected without migration");
accepts(p3ValidateChromePolicy(policy), "closed Chrome policy is accepted");
rejects(p3ValidateChromePolicy({ ...policy, equality: "future-equality" }), "unknown Chrome equality is rejected");
rejects(p3ValidateChromePolicy({ ...policy, source: "Browser.getVersion" }), "wrong Chrome source is rejected");
rejects(p3ValidateChromePolicy({ ...policy, fields: ["revision", "product", "userAgent"] }), "reordered Chrome fields are rejected");
rejects(p3ValidateChromePolicy({ ...policy, fields: ["product", "revision"] }), "missing Chrome field is rejected");
rejects(p3ValidateChromePolicy({ ...policy, extra: true }), "unknown Chrome policy key is rejected");
accepts(p3ValidateChromeFingerprint(fingerprint), "non-empty final CDP fingerprint is accepted");
rejects(p3ValidateChromeFingerprint({ ...fingerprint, product: "" }), "empty fingerprint value is rejected");
rejects(p3ValidateChromeFingerprint({ ...fingerprint, extra: true }), "unknown fingerprint key is rejected");
assert(p3ChromeFingerprintsEqual(fingerprint, { ...fingerprint }), "equal final fingerprints compare equal");
assert(!p3ChromeFingerprintsEqual(fingerprint, { ...fingerprint, revision: "changed" }), "different final fingerprints compare unequal");
accepts(p3ValidateImplementationIdentity(identity), "condition implementation identity is accepted");
rejects(p3ValidateImplementationIdentity({ actor: "codex" }), "identity without contextId is rejected");
rejects(p3ValidateImplementationIdentity({ ...identity, extra: true }), "identity with unknown key is rejected");
accepts(p3ValidateActiveImplementationIdentity({ implementationIdentity: identity }, identity), "active state identity equals condition run identity");
rejects(p3ValidateActiveImplementationIdentity({}, identity), "legacy active state without implementationIdentity is rejected");
rejects(p3ValidateActiveImplementationIdentity({ implementationIdentity: { ...identity, contextId: "p3-v13-fixture-other" } }, identity), "active state identity mismatch is rejected");

console.log(`fidelity-benchmark-v13-compatibility-fixtures: PASS (${assertions} assertions)`);
