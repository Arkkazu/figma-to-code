import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selfTest, validateEvidenceBundle } from './r5-ordinal3-nonattached-output-evidence-validator.mjs';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const emptyBundle = mkdtempSync(join(tmpdir(), 'r5-nonattached-validator-e2e-'));
const EXPECTED_SELF_TEST_CHECKS = Object.freeze([
  'json-bom',
  'json-nul',
  'json-invalid-utf8',
  'json-noncanonical',
  'json-duplicate-root-key',
  'json-duplicate-nested-key',
  'artifact-hash-mismatch',
  'unapproved-capability-pass',
  'persistent-output-exposure',
  'non-synthetic-evidence-bundle',
  'artifact-reuse',
  'actual-output-locator-disclosure',
  'junction-ancestor',
]);

try {
  const selfTestResult = selfTest(workspaceRoot);
  if (selfTestResult.status !== 'self-test-pass') throw new Error('self-test did not pass');
  if (JSON.stringify(selfTestResult.checks) !== JSON.stringify(EXPECTED_SELF_TEST_CHECKS)) throw new Error('self-test did not execute the exact canonical JSON rejection suite');
  let rejected = false;
  try {
    validateEvidenceBundle(emptyBundle, workspaceRoot);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('empty evidence bundle was accepted');
  process.stdout.write('r5 nonattached output evidence validator E2E PASS\n');
} finally {
  rmSync(emptyBundle, { recursive: true, force: true, maxRetries: 3 });
}
