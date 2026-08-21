import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanupSyntheticFixture,
  DESIGN_SOURCE_SHA256,
  FIXED_NON_AUTHORIZING_RESULT,
  GUARD_CONTRACT_FILE_NAME,
  GUARD_CONTRACT_RELEASE_FILE_NAME,
  makeSyntheticFixture,
  TUPLE_ALLOWLIST_FILE_NAME,
} from './r5-ordinal3-ambient-input-provenance-synthetic-validator.mjs';

const VALIDATOR_PATH = fileURLToPath(new URL('./r5-ordinal3-ambient-input-provenance-synthetic-validator.mjs', import.meta.url));
const EXPECTED_SELF_TEST_CHECKS = Object.freeze([
  'valid-contract-release',
  'release-json-bom',
  'release-json-noncanonical',
  'release-json-duplicate-root-key',
  'release-json-duplicate-nested-key',
  'release-effective-true',
  'release-synthetic-only-false',
  'release-unknown-key',
  'release-source-contract-hash-mismatch',
  'release-source-tuple-allowlist-hash-mismatch',
  'release-source-design-hash-mismatch',
  'release-source-schema-hash-mismatch',
  'release-source-validator-hash-mismatch',
  'release-source-e2e-hash-mismatch',
  'release-source-order-mismatch',
  'release-source-missing',
  'release-does-not-authorize-mismatch',
  'release-non-authorizing-result-mismatch',
  'contract-role-launch-authorization',
  'contract-schema-pin-mismatch',
  'contract-tuple-allowlist-pin-mismatch',
  'contract-purpose-mismatch',
  'contract-scope-does-not-amend-mismatch',
  'contract-scope-does-not-create-or-configure-mismatch',
  'contract-surface-meaning-mismatch',
  'contract-write-authorization-mismatch',
  'contract-tuple-required-fields-mismatch',
  'contract-tuple-allowlist-rule-mismatch',
  'contract-tuple-artifact-mode-mismatch',
  'contract-forbidden-surface-class-mismatch',
  'contract-unknown-surface-disposition-mismatch',
  'contract-unknown-operation-disposition-mismatch',
  'contract-forbidden-or-unknown-operation-disposition-mismatch',
  'contract-trace-lifetime-observations-mismatch',
  'contract-trace-lifetime-required-values-mismatch',
  'contract-trace-lifetime-sequence-rules-mismatch',
  'contract-path-opaque-target-requirement-mismatch',
  'contract-path-permitted-evidence-fields-mismatch',
  'contract-path-prohibited-evidence-content-mismatch',
  'contract-path-artifact-filesystem-safety-mismatch',
  'contract-forbidden-locator-leak-disposition-mismatch',
  'contract-independent-verifier-requirements-mismatch',
  'contract-signed-statement-bindings-mismatch',
  'contract-proof-nonce-requirements-mismatch',
  'contract-preinvocation-source-coverage-mismatch',
  'contract-sealed-invocation-requirements-mismatch',
  'contract-runtime-acceptance-preconditions-mismatch',
  'contract-fail-closed-conditions-mismatch',
  'contract-synthetic-fixture-permitted-inputs-mismatch',
  'contract-synthetic-fixture-prohibited-inputs-mismatch',
  'contract-synthetic-fixture-conclusion-mismatch',
  'contract-unknown-key',
  'tuple-allowlist-unknown-operation',
  'tuple-allowlist-surface-operation-mismatch',
  'tuple-allowlist-duplicate-access',
  'external-design-symlink',
  'outside-workspace-fixture-root',
  'design-source-pin-mismatch',
  'fixture-guard-contract-pin-mismatch',
  'fixture-tuple-allowlist-pin-mismatch',
  'fixture-contract-release-pin-mismatch',
  'fixture-reissue-publication-claim',
  'evidence-bundle-bom',
  'evidence-bundle-noncanonical',
  'evidence-bundle-duplicate-key',
  'added-global-instruction-frame',
  'unlisted-parent-frame',
  'unlisted-session-resume-frame',
  'missing-capture-start',
  'late-or-incomplete-capture',
  'forbidden-filesystem-read',
  'incomplete-os-trace',
  'extra-tool-definition',
  'extra-mcp-definition',
  'extra-connector-definition',
  'post-start-inbound-control',
  'duplicate-coverage-ordinal',
  'missing-coverage-record',
  'reordered-coverage-record',
  'unobservable-source-state',
  'provider-asserted-only-source-state',
  'p11-authorization-claim',
  'real-capability-pass-claim',
  'authorizing-result-string',
  'guard-event-gap',
  'unknown-child',
  'forbidden-operation-read',
  'forbidden-operation-resolve',
  'forbidden-operation-list',
  'forbidden-operation-stat',
  'forbidden-operation-readlink',
  'forbidden-operation-open',
  'forbidden-operation-mmap',
  'forbidden-operation-exec',
  'forbidden-operation-child-spawn',
  'forbidden-operation-connect',
  'unknown-surface-connect',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert(result.error === undefined, `${label} could not start: ${result.error?.message ?? 'unknown error'}`);
  assert(result.status === 0, `${label} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error.message}`);
  }
}

export function runE2E() {
  runNode(['--check', VALIDATOR_PATH], 'validator syntax check');
  const contractRelease = parseJson(runNode([VALIDATOR_PATH, '--check-contract-release'], 'contract release check'), 'contract release check');
  assert(contractRelease.valid === true && contractRelease.synthetic === true, 'contract release check did not return a valid synthetic-only result');
  assert(contractRelease.recordState === 'review-only' && contractRelease.effective === false, 'contract release check changed review-only state');
  assert(contractRelease.releaseFileName === GUARD_CONTRACT_RELEASE_FILE_NAME, 'contract release check used the wrong release file');
  assert(contractRelease.guardContractFileName === GUARD_CONTRACT_FILE_NAME, 'contract release check used the wrong guard contract');
  assert(contractRelease.tupleAllowlistFileName === TUPLE_ALLOWLIST_FILE_NAME, 'contract release check used the wrong tuple allowlist');
  assert(contractRelease.result === FIXED_NON_AUTHORIZING_RESULT && contractRelease.capabilityProbePass === false && contractRelease.p11Authorization === 'NOT_AUTHORIZED', 'contract release check changed authorization state');
  const selfTest = parseJson(runNode([VALIDATOR_PATH, '--self-test'], 'validator self-test'), 'validator self-test');
  assert(selfTest.status === 'PASS', 'validator self-test did not pass');
  assert(selfTest.synthetic === true, 'validator self-test is not synthetic');
  assert(selfTest.designSourceSha256 === DESIGN_SOURCE_SHA256, 'validator self-test did not pin the design source');
  assert(selfTest.result === FIXED_NON_AUTHORIZING_RESULT, 'validator self-test returned an authorizing result');
  assert(selfTest.capabilityProbePass === false && selfTest.p11Authorization === 'NOT_AUTHORIZED', 'validator self-test changed authorization state');
  assert(JSON.stringify(selfTest.rejectedChecks) === JSON.stringify(EXPECTED_SELF_TEST_CHECKS), 'validator self-test did not execute the exact required malformed-fixture rejections');

  const fixture = makeSyntheticFixture();
  try {
    const checked = parseJson(runNode([VALIDATOR_PATH, '--check', fixture], 'validator CLI check'), 'validator CLI check');
    assert(checked.valid === true && checked.synthetic === true, 'validator CLI did not accept the valid synthetic fixture');
    assert(checked.designSourceSha256 === DESIGN_SOURCE_SHA256, 'validator CLI did not verify the pinned design source');
    assert(checked.result === FIXED_NON_AUTHORIZING_RESULT, 'validator CLI returned an authorizing result');
    assert(checked.capabilityProbePass === false && checked.p11Authorization === 'NOT_AUTHORIZED', 'validator CLI changed authorization state');
  } finally {
    cleanupSyntheticFixture(fixture);
  }

  return {
    status: 'PASS',
    synthetic: true,
    designSourceSha256: DESIGN_SOURCE_SHA256,
    guardContractSha256: contractRelease.guardContractSha256,
    tupleAllowlistSha256: contractRelease.tupleAllowlistSha256,
    contractReleaseSha256: contractRelease.releaseSha256,
    result: FIXED_NON_AUTHORIZING_RESULT,
    capabilityProbePass: false,
    p11Authorization: 'NOT_AUTHORIZED',
  };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(thisFile)) {
  try {
    process.stdout.write(`${JSON.stringify(runE2E(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
