import { createHash, randomBytes } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
export const TOOLS_ROOT = dirname(MODULE_PATH);
export const WORKSPACE_ROOT = dirname(TOOLS_ROOT);
export const DESIGN_FILE_NAME = 'r5-ordinal3-ambient-input-provenance-synthetic-probe-design.md';
export const DESIGN_SOURCE_SHA256 = '14b2e343ed3652704f6b14a6be8f68648098fdb5f851e6775b6d48c61f12f6ad';
export const ISOLATION_SCHEMA_FILE_NAME = 'r5-ordinal3-os-isolation-proof-schema.json';
export const ISOLATION_SCHEMA_SHA256 = 'c17a30f3fd2b84c897635b0f0eb645e3633d3b19418d99c41a7cd8fb5d031403';
export const GUARD_CONTRACT_FILE_NAME = 'r5-ordinal3-role-read-boundary-guard-contract.json';
export const GUARD_CONTRACT_SOURCE_SHA256 = 'c874c8d60908168522935bbc82ffcf09bb9ac28663ba7911f9a6863f6d6873d7';
export const TUPLE_ALLOWLIST_FILE_NAME = 'r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist.json';
export const TUPLE_ALLOWLIST_SOURCE_SHA256 = '6625915372c44f54693f06d93fe9b516b9ad375e59ff101f6caad46588e1bb57';
export const GUARD_CONTRACT_RELEASE_FILE_NAME = 'r5-ordinal3-role-read-boundary-guard-contract-release-draft.json';
export const VALIDATOR_FILE_NAME = basename(MODULE_PATH);
export const VALIDATOR_E2E_FILE_NAME = 'r5-ordinal3-ambient-input-provenance-synthetic-validator.e2e.mjs';
export const FIXED_NON_AUTHORIZING_RESULT = 'SYNTHETIC_ONLY__NO_REAL_RUNTIME_OR_P11_AUTHORIZATION';

const FIXTURE_PREFIX = '.r5-ambient-provenance-';
const ALLOWED_SURFACE_CLASSES = Object.freeze([
  'runtime-base',
  'exact-attachments',
  'ephemeral-scratch',
  'guard-dependencies',
]);
const ACCESS_OPERATIONS = Object.freeze([
  'read',
  'resolve',
  'list',
  'stat',
  'readlink',
  'open',
  'mmap',
  'exec',
  'child-spawn',
  'connect',
]);
const ALLOWED_OPERATIONS_BY_SURFACE = Object.freeze({
  'runtime-base': Object.freeze([...ACCESS_OPERATIONS]),
  'exact-attachments': Object.freeze(ACCESS_OPERATIONS.slice(0, 7)),
  'ephemeral-scratch': Object.freeze(ACCESS_OPERATIONS.slice(0, 7)),
  'guard-dependencies': Object.freeze(ACCESS_OPERATIONS.slice(0, 9)),
});
const NO_AUTHORIZATION_ACTIONS = Object.freeze([
  'reissue publication',
  'role delivery',
  'role launch',
  'implementation',
  'return check',
  'return apply',
  'site or lifecycle mutation',
  'browser or Figma measurement',
  'accessibility work',
  'motion work',
  'gate work',
  'P-11 change',
  'provider or runtime provisioning',
  'sandbox or VM configuration',
]);
const NON_AUTHORIZING_CLAIM_BOOLEAN_KEYS = Object.freeze([
  'roleDeliveryAuthorized',
  'roleLaunchAuthorized',
  'implementationAuthorized',
  'returnCheckAuthorized',
  'returnApplyAuthorized',
  'measurementAuthorized',
  'accessibilityAuthorized',
  'motionAuthorized',
  'gateAuthorized',
  'reissuePublicationAuthorized',
  'siteLifecycleMutationAuthorized',
  'providerOrRuntimeProvisioningAuthorized',
]);
const GUARD_CONTRACT_NON_AUTHORIZING_KEYS = Object.freeze([
  'fixedResult',
  'capabilityProbePass',
  'p11Authorization',
  ...NON_AUTHORIZING_CLAIM_BOOLEAN_KEYS,
]);
const CONTRACT_RELEASE_SOURCE_FILE_NAMES = Object.freeze([
  GUARD_CONTRACT_FILE_NAME,
  TUPLE_ALLOWLIST_FILE_NAME,
  DESIGN_FILE_NAME,
  ISOLATION_SCHEMA_FILE_NAME,
  VALIDATOR_FILE_NAME,
  VALIDATOR_E2E_FILE_NAME,
]);
const REQUIRED_FINAL_STATEMENT = 'role read-boundary guard contract: synthetic workspace-only draft; no real runtime was tested; P-11 remains NOT_AUTHORIZED; no delivery, launch, implementation, return, measurement, accessibility, motion, or gate action is authorized.';
const TUPLE_ALLOWLIST_REQUIRED_FINAL_STATEMENT = 'synthetic tuple allowlist only; no real runtime, role delivery, role launch, implementation, return, measurement, or P-11 authorization is created.';
const REQUIRED_SOURCE_CLASSES = Object.freeze([
  'platform-instructions',
  'launch-and-bootstrap',
  'session-and-history',
  'configuration-and-extensions',
  'tool-and-integration-definitions',
  'os-and-device-surfaces',
  'network-and-control-planes',
  'attachments-and-runtime-base',
]);
const EXPECTED_SOURCE = Object.freeze({
  'platform-instructions': { disposition: 'not-delivered', frameCount: 0 },
  'launch-and-bootstrap': { disposition: 'not-delivered', frameCount: 0 },
  'session-and-history': { disposition: 'not-delivered', frameCount: 0 },
  'configuration-and-extensions': { disposition: 'not-delivered', frameCount: 0 },
  'tool-and-integration-definitions': { disposition: 'not-delivered', frameCount: 0 },
  'os-and-device-surfaces': { disposition: 'not-delivered', frameCount: 0 },
  'network-and-control-planes': { disposition: 'not-delivered', frameCount: 0 },
  'attachments-and-runtime-base': { disposition: 'delivered', frameCount: 1 },
});
const EXPECTED_ARTIFACTS = Object.freeze({
  sourceCoverageManifest: {
    fileName: 'source-coverage-manifest.json',
    sourceIdentity: 'synthetic-control-plane-fixture',
  },
  sealedInvocationEnvelope: {
    fileName: 'sealed-invocation-envelope.json',
    sourceIdentity: 'synthetic-input-capture-fixture',
  },
  captureStatement: {
    fileName: 'capture-statement.json',
    sourceIdentity: 'synthetic-input-capture-fixture',
  },
  localAccessTrace: {
    fileName: 'local-access-trace.json',
    sourceIdentity: 'synthetic-guard-fixture',
  },
  toolSurfaceTrace: {
    fileName: 'tool-surface-trace.json',
    sourceIdentity: 'synthetic-tool-trace-fixture',
  },
  lifetimeTrace: {
    fileName: 'lifetime-trace.json',
    sourceIdentity: 'synthetic-guard-fixture',
  },
});

export class AmbientInputValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AmbientInputValidationError';
  }
}

function fail(message) {
  throw new AmbientInputValidationError(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(value, 'utf8'));
}

function sha256Json(value) {
  return sha256Text(JSON.stringify(value));
}

function canonicalDocumentBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertExactCanonicalDocumentHash(value, expectedSha256, label) {
  assert(
    sha256Bytes(canonicalDocumentBytes(value)) === expectedSha256,
    `${label} exact canonical value pin mismatch`,
  );
}

function fixedHash(label) {
  return sha256Text(`ambient-input-provenance-synthetic-v1:${label}`);
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function assertHash(value, label) {
  assert(isSha256(value), `${label} must be a lowercase SHA-256`);
}

function assertObject(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}

function exactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has unexpected or missing keys`);
}

function assertExactStringArray(value, expectedValues, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  assert(value.length === expectedValues.length && value.every((item, index) => item === expectedValues[index]), `${label} has an unexpected, missing, duplicate, or reordered value`);
}

function assertBoolean(value, label) {
  assert(typeof value === 'boolean', `${label} must be boolean`);
}

function assertNonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
}

function assertOpaqueId(value, label) {
  assert(typeof value === 'string' && /^synthetic-[a-z0-9-]+$/.test(value), `${label} must be a synthetic opaque identifier`);
}

function nativeRealpath(path) {
  return realpathSync.native ? realpathSync.native(path) : realpathSync(path);
}

function isWithin(parentPath, childPath) {
  const relation = relative(parentPath, childPath);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function assertNoLinkComponents(rootPath, targetPath, label) {
  const canonicalRoot = resolve(rootPath);
  const resolvedTarget = resolve(targetPath);
  const relation = relative(canonicalRoot, resolvedTarget);
  assert(isWithin(canonicalRoot, resolvedTarget), `${label} escapes its root`);
  try {
    const rootStatus = lstatSync(canonicalRoot);
    assert(!rootStatus.isSymbolicLink() && rootStatus.isDirectory(), `${label} root is not a regular directory`);
    let current = canonicalRoot;
    for (const segment of relation.split(/[\\/]+/)) {
      if (!segment) continue;
      current = join(current, segment);
      const status = lstatSync(current);
      assert(!status.isSymbolicLink(), `${label} contains a symbolic link or junction`);
    }
  } catch (error) {
    if (error instanceof AmbientInputValidationError) throw error;
    fail(`${label} has a missing or unreadable path component`);
  }
}

function assertSafeDirectory(path, label) {
  const status = lstatSync(path);
  assert(!status.isSymbolicLink() && status.isDirectory(), `${label} must be a non-link directory`);
}

function assertSafeRegularFile(rootPath, filePath, label) {
  assertNoLinkComponents(rootPath, filePath, label);
  const status = lstatSync(filePath);
  assert(!status.isSymbolicLink() && status.isFile(), `${label} must be a regular non-link file`);
  const finalStatus = statSync(filePath);
  assert(
    typeof finalStatus.nlink === 'number'
      && Number.isInteger(finalStatus.nlink)
      && finalStatus.nlink >= 1,
    `${label} hard-link count is unobservable`,
  );
  assert(finalStatus.nlink === 1, `${label} must not be hard-linked`);
}

function assertExactEntries(directoryPath, expectedNames, label) {
  assertSafeDirectory(directoryPath, label);
  const actual = readdirSync(directoryPath).sort();
  const expected = [...expectedNames].sort();
  assert(actual.length === expected.length && actual.every((name, index) => name === expected[index]), `${label} has an unexpected or missing entry`);
}

function assertFixtureRoot(fixtureRoot) {
  assert(typeof fixtureRoot === 'string' && fixtureRoot.length > 0, 'fixture root is required');
  const workspaceReal = nativeRealpath(WORKSPACE_ROOT);
  const resolved = resolve(fixtureRoot);
  assert(isWithin(workspaceReal, resolved) && resolve(workspaceReal) !== resolve(resolved), 'fixture root must be a child of this workspace');
  assertNoLinkComponents(workspaceReal, resolved, 'fixture root');
  const fixtureReal = nativeRealpath(resolved);
  assert(isWithin(workspaceReal, fixtureReal) && workspaceReal !== fixtureReal, 'fixture root resolves outside this workspace');
  assertSafeDirectory(fixtureReal, 'fixture root');
  assert(basename(fixtureReal).startsWith(FIXTURE_PREFIX), 'fixture root does not have the synthetic fixture prefix');
  assertExactEntries(fixtureReal, ['artifacts', 'evidence-bundle.json'], 'fixture root');
  return fixtureReal;
}

function isJsonWhitespace(character) {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function assertNoDuplicateJsonKeys(text, label) {
  let index = 0;

  const skipWhitespace = () => {
    while (index < text.length && isJsonWhitespace(text[index])) index += 1;
  };
  const expect = (character, message) => {
    assert(text[index] === character, `${label} ${message}`);
    index += 1;
  };
  const parseString = () => {
    assert(text[index] === '"', `${label} contains an invalid JSON string`);
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch (error) {
          fail(`${label} contains an invalid JSON string: ${error.message}`);
        }
      }
      if (character === '\\') {
        index += 1;
        assert(index < text.length, `${label} contains an unterminated JSON escape`);
        const escape = text[index];
        assert('"\\/bfnrtu'.includes(escape), `${label} contains an invalid JSON escape`);
        if (escape === 'u') {
          assert(index + 4 < text.length, `${label} contains a truncated JSON unicode escape`);
          for (let offset = 1; offset <= 4; offset += 1) {
            assert(/[0-9a-fA-F]/.test(text[index + offset]), `${label} contains an invalid JSON unicode escape`);
          }
          index += 5;
        } else {
          index += 1;
        }
        continue;
      }
      assert(character.charCodeAt(0) >= 0x20, `${label} contains an unescaped control character`);
      index += 1;
    }
    fail(`${label} contains an unterminated JSON string`);
  };
  const parseValue = () => {
    skipWhitespace();
    const character = text[index];
    if (character === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      while (true) {
        skipWhitespace();
        const key = parseString();
        assert(!keys.has(key), `${label} contains a duplicate JSON key: ${key}`);
        keys.add(key);
        skipWhitespace();
        expect(':', 'contains an object key without a colon');
        parseValue();
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return;
        }
        expect(',', 'contains an object member without a comma');
      }
    }
    if (character === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      while (true) {
        parseValue();
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        expect(',', 'contains an array member without a comma');
      }
    }
    if (character === '"') {
      parseString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    assert(number !== null, `${label} contains an invalid JSON value`);
    index += number[0].length;
  };

  parseValue();
  skipWhitespace();
  assert(index === text.length, `${label} contains trailing JSON data`);
}

function parseCanonicalJsonBytes(bytes, label) {
  assert(Buffer.isBuffer(bytes), `${label} must be read as bytes`);
  assert(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM`);
  assert(!bytes.includes(0), `${label} must not contain a NUL byte`);
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `${label} is not valid UTF-8`);
  assertNoDuplicateJsonKeys(text, label);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  assert(`${JSON.stringify(value, null, 2)}\n` === text, `${label} must use canonical UTF-8 JSON`);
  return value;
}

function readCanonicalJsonAtPath(rootPath, fullPath, label) {
  assertSafeRegularFile(rootPath, fullPath, label);
  return parseCanonicalJsonBytes(readFileSync(fullPath), label);
}

function readJsonFile(rootPath, relativePath, label) {
  return readCanonicalJsonAtPath(rootPath, join(rootPath, relativePath), label);
}

function writeJsonFile(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
}

function fileSha256(path) {
  return sha256Bytes(readFileSync(path));
}

function assertPinnedDesignFile(candidatePath = join(TOOLS_ROOT, DESIGN_FILE_NAME), label = 'ambient-input provenance design source') {
  const workspaceReal = nativeRealpath(WORKSPACE_ROOT);
  const resolved = resolve(candidatePath);
  assert(isWithin(workspaceReal, resolved) && resolve(workspaceReal) !== resolve(resolved), `${label} must be a child of this workspace`);
  assertNoLinkComponents(workspaceReal, resolved, label);
  const designReal = nativeRealpath(resolved);
  assert(isWithin(workspaceReal, designReal) && workspaceReal !== designReal, `${label} resolves outside this workspace`);
  assertSafeRegularFile(workspaceReal, designReal, label);
  const actual = fileSha256(designReal);
  assert(actual === DESIGN_SOURCE_SHA256, 'ambient-input provenance design source does not match the pinned SHA-256');
  return designReal;
}

function assertDesignPinned() {
  return assertPinnedDesignFile();
}

function assertNonAuthorizingResult(value, label) {
  exactKeys(value, GUARD_CONTRACT_NON_AUTHORIZING_KEYS, label);
  assert(value.fixedResult === FIXED_NON_AUTHORIZING_RESULT, `${label} uses a non-fixed or authorizing result string`);
  assert(value.capabilityProbePass === false, `${label} claims capability PASS`);
  assert(value.p11Authorization === 'NOT_AUTHORIZED', `${label} changes P-11 authorization`);
  for (const key of NON_AUTHORIZING_CLAIM_BOOLEAN_KEYS) {
    assert(value[key] === false, `${label} authorizes ${key}`);
  }
}

function validateSyntheticTupleAllowlistDocument(tupleAllowlist) {
  exactKeys(tupleAllowlist, [
    'version',
    'kind',
    'recordState',
    'effective',
    'syntheticOnly',
    'tuples',
    'requiredFinalStatement',
  ], 'synthetic tuple allowlist');
  assert(tupleAllowlist.version === 1, 'synthetic tuple allowlist has the wrong version');
  assert(tupleAllowlist.kind === 'p3-r5-ordinal3-role-read-boundary-guard-synthetic-tuple-allowlist', 'synthetic tuple allowlist has the wrong kind');
  assert(tupleAllowlist.recordState === 'review-only' && tupleAllowlist.effective === false && tupleAllowlist.syntheticOnly === true, 'synthetic tuple allowlist is not review-only synthetic data');
  assert(tupleAllowlist.requiredFinalStatement === TUPLE_ALLOWLIST_REQUIRED_FINAL_STATEMENT, 'synthetic tuple allowlist required final statement mismatch');
  assert(Array.isArray(tupleAllowlist.tuples) && tupleAllowlist.tuples.length > 0, 'synthetic tuple allowlist has no tuples');
  const seenTuples = new Set();
  tupleAllowlist.tuples.forEach((tuple, index) => {
    exactKeys(tuple, ['sequence', 'actorOpaqueId', 'surfaceClass', 'targetOpaqueId', 'operation', 'outcome'], `synthetic tuple allowlist tuple ${index}`);
    assert(tuple.sequence === index + 1, `synthetic tuple allowlist tuple ${index} has a sequence gap, duplicate, or reordering`);
    assertOpaqueId(tuple.actorOpaqueId, `synthetic tuple allowlist tuple ${index} actor`);
    assert(ALLOWED_SURFACE_CLASSES.includes(tuple.surfaceClass), `synthetic tuple allowlist tuple ${index} uses a forbidden surface`);
    assert(ACCESS_OPERATIONS.includes(tuple.operation), `synthetic tuple allowlist tuple ${index} uses an unknown operation`);
    assert(
      ALLOWED_OPERATIONS_BY_SURFACE[tuple.surfaceClass].includes(tuple.operation),
      `synthetic tuple allowlist tuple ${index} performs ${tuple.operation} on ${tuple.surfaceClass} outside the permitted operation matrix`,
    );
    assertOpaqueId(tuple.targetOpaqueId, `synthetic tuple allowlist tuple ${index} target`);
    assert(tuple.outcome === 'allowed', `synthetic tuple allowlist tuple ${index} has an unsupported outcome`);
    const tupleKey = JSON.stringify([tuple.actorOpaqueId, tuple.surfaceClass, tuple.targetOpaqueId, tuple.operation]);
    assert(!seenTuples.has(tupleKey), `synthetic tuple allowlist tuple ${index} duplicates an access tuple`);
    seenTuples.add(tupleKey);
  });
}

function validateGuardContractDocument(contract) {
  exactKeys(contract, [
    'version',
    'kind',
    'status',
    'recordState',
    'effective',
    'validatorEnforcement',
    'purpose',
    'derivedFrom',
    'schemaRelation',
    'scope',
    'nonAuthorizingResult',
    'guardContract',
    'traceLifetimeContract',
    'pathAndEvidenceSafety',
    'requiredFutureRuntimeBindings',
    'failClosedConditions',
    'syntheticFixtureBoundary',
    'requiredFinalStatement',
  ], 'guard contract');
  assert(contract.version === 1, 'guard contract has the wrong version');
  assert(contract.kind === 'p3-r5-ordinal3-role-read-boundary-guard-contract', 'guard contract has the wrong kind');
  assert(contract.status === 'review-only-synthetic-draft-not-evidence', 'guard contract changes its review-only status');
  assert(contract.recordState === 'review-only', 'guard contract has a non-review record state');
  assert(contract.effective === false, 'guard contract is unexpectedly effective');
  assert(contract.validatorEnforcement === 'synthetic-validator-release-only', 'guard contract claims an unsupported validator enforcement mode');
  exactKeys(contract.derivedFrom, ['fileName', 'sha256'], 'guard contract derived-from pin');
  assert(contract.derivedFrom.fileName === DESIGN_FILE_NAME && contract.derivedFrom.sha256 === DESIGN_SOURCE_SHA256, 'guard contract derived-from pin mismatch');
  exactKeys(contract.schemaRelation, ['mode', 'fileName', 'sha256'], 'guard contract schema relation');
  assert(contract.schemaRelation.mode === 'no-amendment', 'guard contract attempts to amend the isolation schema');
  assert(contract.schemaRelation.fileName === ISOLATION_SCHEMA_FILE_NAME && contract.schemaRelation.sha256 === ISOLATION_SCHEMA_SHA256, 'guard contract schema relation mismatch');
  exactKeys(contract.scope, ['workspaceOnly', 'p3Free', 'syntheticOnly', 'doesNotAmend', 'doesNotCreateOrConfigure'], 'guard contract scope');
  assert(contract.scope.workspaceOnly === true && contract.scope.p3Free === true && contract.scope.syntheticOnly === true, 'guard contract scope expands beyond workspace-only synthetic work');
  assert(Array.isArray(contract.scope.doesNotAmend) && contract.scope.doesNotAmend.length > 0, 'guard contract omits its no-amendment boundary');
  assert(Array.isArray(contract.scope.doesNotCreateOrConfigure), 'guard contract omits its no-create boundary');
  for (const forbiddenAction of ['role delivery', 'role launch', 'implementation', 'P-11 change']) {
    assert(contract.scope.doesNotCreateOrConfigure.includes(forbiddenAction), `guard contract scope omits ${forbiddenAction}`);
  }
  assertNonAuthorizingResult(contract.nonAuthorizingResult, 'guard contract non-authorizing result');
  exactKeys(contract.guardContract, [
    'knownSurfaceClasses',
    'knownOperationValues',
    'writeAuthorization',
    'tupleAllowlistRequired',
    'forbiddenSurfaceClass',
    'unknownSurfaceClassDisposition',
    'unknownOperationDisposition',
    'forbiddenOrUnknownOperationDisposition',
  ], 'guard contract policy');
  assert(Array.isArray(contract.guardContract.knownSurfaceClasses), 'guard contract known surfaces must be an array');
  assert(contract.guardContract.knownSurfaceClasses.length === ALLOWED_SURFACE_CLASSES.length, 'guard contract surface count mismatch');
  contract.guardContract.knownSurfaceClasses.forEach((surface, index) => {
    exactKeys(surface, ['id', 'meaning', 'permittedOperationValues'], `guard contract surface ${index}`);
    const expectedId = ALLOWED_SURFACE_CLASSES[index];
    assert(surface.id === expectedId, `guard contract surface ${index} is missing, duplicated, or reordered`);
    assertExactStringArray(surface.permittedOperationValues, ALLOWED_OPERATIONS_BY_SURFACE[expectedId], `guard contract surface ${expectedId} operations`);
  });
  assertExactStringArray(contract.guardContract.knownOperationValues, ACCESS_OPERATIONS, 'guard contract known operations');
  exactKeys(contract.guardContract.tupleAllowlistRequired, ['requiredFields', 'rule', 'syntheticArtifact'], 'guard contract tuple allowlist');
  assertExactStringArray(contract.guardContract.tupleAllowlistRequired.requiredFields, ['actorOpaqueId', 'surfaceClass', 'targetOpaqueId', 'operation'], 'guard contract tuple fields');
  exactKeys(contract.guardContract.tupleAllowlistRequired.syntheticArtifact, ['fileName', 'sha256', 'mode'], 'guard contract synthetic tuple allowlist artifact');
  assert(contract.guardContract.tupleAllowlistRequired.syntheticArtifact.fileName === TUPLE_ALLOWLIST_FILE_NAME, 'guard contract names the wrong synthetic tuple allowlist artifact');
  assert(contract.guardContract.tupleAllowlistRequired.syntheticArtifact.sha256 === TUPLE_ALLOWLIST_SOURCE_SHA256, 'guard contract synthetic tuple allowlist artifact hash mismatch');
  assert(contract.guardContract.tupleAllowlistRequired.syntheticArtifact.mode === 'synthetic-fixture-fixed-policy-not-runtime-authorization', 'guard contract synthetic tuple allowlist mode is unsupported');
  assert(contract.guardContract.forbiddenSurfaceClass === 'forbidden-nonruntime-data', 'guard contract has the wrong forbidden surface class');
  assert(contract.guardContract.unknownSurfaceClassDisposition === 'fail' && contract.guardContract.unknownOperationDisposition === 'fail', 'guard contract does not fail closed for unknown access');
  assert(contract.requiredFinalStatement === REQUIRED_FINAL_STATEMENT, 'guard contract required final statement mismatch');
  // The release source pin protects the on-disk byte stream.  This second
  // assertion deliberately protects callers of this object-level validator:
  // every reviewed guard-contract value, including fields that are not needed
  // to construct the synthetic fixture, must remain exactly canonical.
  assertExactCanonicalDocumentHash(contract, GUARD_CONTRACT_SOURCE_SHA256, 'guard contract');
}

function assertFixedReleaseSourceFileName(fileName, label) {
  assert(typeof fileName === 'string' && CONTRACT_RELEASE_SOURCE_FILE_NAMES.includes(fileName), `${label} has an unsupported source file name`);
  assert(fileName === basename(fileName), `${label} source file name must not contain a path`);
  return join(TOOLS_ROOT, fileName);
}

function validateContractReleaseDocument(release) {
  exactKeys(release, [
    'version',
    'kind',
    'recordState',
    'effective',
    'syntheticOnly',
    'scope',
    'sourceFiles',
    'nonAuthorizingResult',
    'doesNotAuthorize',
    'requiredFinalStatement',
  ], 'guard contract release');
  assert(release.version === 1, 'guard contract release has the wrong version');
  assert(release.kind === 'p3-r5-ordinal3-role-read-boundary-guard-contract-release', 'guard contract release has the wrong kind');
  assert(release.recordState === 'review-only', 'guard contract release has a non-review record state');
  assert(release.effective === false && release.syntheticOnly === true, 'guard contract release is not synthetic review-only');
  exactKeys(release.scope, ['workspaceOnly', 'p3Free'], 'guard contract release scope');
  assert(release.scope.workspaceOnly === true && release.scope.p3Free === true, 'guard contract release scope expands beyond the workspace-only P-3-free boundary');
  assertNonAuthorizingResult(release.nonAuthorizingResult, 'guard contract release non-authorizing result');
  assertExactStringArray(release.doesNotAuthorize, NO_AUTHORIZATION_ACTIONS, 'guard contract release does-not-authorize list');
  assert(release.requiredFinalStatement === REQUIRED_FINAL_STATEMENT, 'guard contract release required final statement mismatch');
  assert(Array.isArray(release.sourceFiles) && release.sourceFiles.length === CONTRACT_RELEASE_SOURCE_FILE_NAMES.length, 'guard contract release has the wrong source file count');

  const sourceHashes = {};
  release.sourceFiles.forEach((source, index) => {
    exactKeys(source, ['fileName', 'sha256'], `guard contract release source ${index}`);
    const expectedFileName = CONTRACT_RELEASE_SOURCE_FILE_NAMES[index];
    assert(source.fileName === expectedFileName, `guard contract release source ${index} is missing, duplicated, or reordered`);
    assertHash(source.sha256, `guard contract release source ${index} hash`);
    const sourcePath = assertFixedReleaseSourceFileName(source.fileName, `guard contract release source ${index}`);
    assertSafeRegularFile(WORKSPACE_ROOT, sourcePath, `guard contract release source ${index}`);
    const actualSha256 = fileSha256(sourcePath);
    assert(actualSha256 === source.sha256, `guard contract release source ${index} raw hash mismatch`);
    sourceHashes[source.fileName] = actualSha256;
  });
  assert(sourceHashes[GUARD_CONTRACT_FILE_NAME] === GUARD_CONTRACT_SOURCE_SHA256, 'guard contract release contract source pin mismatch');
  assert(sourceHashes[TUPLE_ALLOWLIST_FILE_NAME] === TUPLE_ALLOWLIST_SOURCE_SHA256, 'guard contract release tuple allowlist source pin mismatch');
  assert(sourceHashes[DESIGN_FILE_NAME] === DESIGN_SOURCE_SHA256, 'guard contract release design source pin mismatch');
  assert(sourceHashes[ISOLATION_SCHEMA_FILE_NAME] === ISOLATION_SCHEMA_SHA256, 'guard contract release schema source pin mismatch');

  const contractPath = join(TOOLS_ROOT, GUARD_CONTRACT_FILE_NAME);
  const contract = readCanonicalJsonAtPath(WORKSPACE_ROOT, contractPath, 'guard contract source');
  validateGuardContractDocument(contract);
  const tupleAllowlistPath = join(TOOLS_ROOT, TUPLE_ALLOWLIST_FILE_NAME);
  const tupleAllowlist = readCanonicalJsonAtPath(WORKSPACE_ROOT, tupleAllowlistPath, 'synthetic tuple allowlist source');
  validateSyntheticTupleAllowlistDocument(tupleAllowlist);
  return { sourceHashes, contract, tupleAllowlist };
}

export function validateContractRelease() {
  const releasePath = join(TOOLS_ROOT, GUARD_CONTRACT_RELEASE_FILE_NAME);
  const release = readCanonicalJsonAtPath(WORKSPACE_ROOT, releasePath, 'guard contract release');
  const releaseSha256 = fileSha256(releasePath);
  const { sourceHashes, tupleAllowlist } = validateContractReleaseDocument(release);
  const result = {
    valid: true,
    synthetic: true,
    recordState: 'review-only',
    effective: false,
    releaseFileName: GUARD_CONTRACT_RELEASE_FILE_NAME,
    releaseSha256,
    guardContractFileName: GUARD_CONTRACT_FILE_NAME,
    guardContractSha256: sourceHashes[GUARD_CONTRACT_FILE_NAME],
    tupleAllowlistFileName: TUPLE_ALLOWLIST_FILE_NAME,
    tupleAllowlistSha256: sourceHashes[TUPLE_ALLOWLIST_FILE_NAME],
    designSourceSha256: DESIGN_SOURCE_SHA256,
    result: FIXED_NON_AUTHORIZING_RESULT,
    capabilityProbePass: false,
    p11Authorization: 'NOT_AUTHORIZED',
  };
  Object.defineProperty(result, 'tupleAllowlist', { value: tupleAllowlist, enumerable: false });
  return result;
}

function sourceDescriptor(sourceClass, expectedDisposition, expectedFrameCount) {
  return {
    version: 1,
    synthetic: true,
    sourceClass,
    expectedDisposition,
    expectedFrameCount,
  };
}

function expectedSourceRecord(sourceClass, coverageOrdinal) {
  const expected = EXPECTED_SOURCE[sourceClass];
  return {
    sourceClass,
    sourceInstanceOpaqueId: `synthetic-source-${coverageOrdinal}`,
    expectedDisposition: expected.disposition,
    canonicalDescriptorSha256: sha256Json(sourceDescriptor(sourceClass, expected.disposition, expected.frameCount)),
    originWitnessSha256: fixedHash(`origin:${sourceClass}`),
    deliveryEvidenceSha256: fixedHash(`delivery:${sourceClass}:${expected.disposition}:${expected.frameCount}`),
    capturedBeforeModelStart: true,
    coverageOrdinal,
    sourceState: 'observable',
    expectedFrameCount: expected.frameCount,
  };
}

function accessEventFromTuple(tuple) {
  return {
    sequence: tuple.sequence,
    actor: tuple.actorOpaqueId,
    operation: tuple.operation,
    surfaceClass: tuple.surfaceClass,
    outcome: tuple.outcome,
    targetOpaqueId: tuple.targetOpaqueId,
  };
}

function expectedAttachmentFrame() {
  return {
    sequence: 1,
    sourceClass: 'attachments-and-runtime-base',
    frameType: 'attachment-descriptor-set',
    payloadSha256: fixedHash('attachment-descriptor-set'),
    byteLength: 0,
  };
}

function validateClaims(claims) {
  exactKeys(claims, [
    'syntheticOnly',
    'capabilityProbePass',
    'p11Authorization',
    'roleDeliveryAuthorized',
    'roleLaunchAuthorized',
    'implementationAuthorized',
    'returnCheckAuthorized',
    'returnApplyAuthorized',
    'measurementAuthorized',
    'accessibilityAuthorized',
    'motionAuthorized',
    'gateAuthorized',
    'reissuePublicationAuthorized',
    'siteLifecycleMutationAuthorized',
    'providerOrRuntimeProvisioningAuthorized',
    'result',
  ], 'claims');
  assert(claims.syntheticOnly === true, 'claims must remain synthetic-only');
  assert(claims.capabilityProbePass === false, 'synthetic evidence cannot claim capability PASS');
  assert(claims.p11Authorization === 'NOT_AUTHORIZED', 'claims change P-11 authorization');
  for (const key of NON_AUTHORIZING_CLAIM_BOOLEAN_KEYS) {
    assert(claims[key] === false, `claims authorize ${key}`);
  }
  assert(claims.result === FIXED_NON_AUTHORIZING_RESULT, 'claims use a non-fixed or authorizing result string');
}

function readArtifacts(fixtureRoot, bundle) {
  exactKeys(bundle.artifacts, Object.keys(EXPECTED_ARTIFACTS), 'artifacts');
  const artifactsDirectory = join(fixtureRoot, 'artifacts');
  assertNoLinkComponents(fixtureRoot, artifactsDirectory, 'artifacts directory');
  assertExactEntries(artifactsDirectory, Object.values(EXPECTED_ARTIFACTS).map((item) => item.fileName), 'artifacts directory');
  const result = {};

  for (const [artifactKey, expected] of Object.entries(EXPECTED_ARTIFACTS)) {
    const envelope = bundle.artifacts[artifactKey];
    exactKeys(envelope, ['fileName', 'sha256', 'sourceIdentity'], `artifacts.${artifactKey}`);
    assert(envelope.fileName === expected.fileName, `artifacts.${artifactKey} has the wrong file name`);
    assert(envelope.sourceIdentity === expected.sourceIdentity, `artifacts.${artifactKey} has the wrong source identity`);
    assertHash(envelope.sha256, `artifacts.${artifactKey}.sha256`);
    const artifactPath = join(artifactsDirectory, expected.fileName);
    assertSafeRegularFile(fixtureRoot, artifactPath, `artifacts.${artifactKey}`);
    assert(fileSha256(artifactPath) === envelope.sha256, `artifacts.${artifactKey} hash mismatch`);
    result[artifactKey] = readJsonFile(fixtureRoot, join('artifacts', expected.fileName), `artifacts.${artifactKey}`);
  }
  return result;
}

function validateSourceCoverageManifest(manifest, proofNonce) {
  exactKeys(manifest, ['version', 'kind', 'synthetic', 'proofNonce', 'sourceRecords'], 'source coverage manifest');
  assert(manifest.version === 1, 'source coverage manifest has the wrong version');
  assert(manifest.kind === 'ambient-input-provenance-synthetic-source-coverage-manifest', 'source coverage manifest has the wrong kind');
  assert(manifest.synthetic === true, 'source coverage manifest is not synthetic');
  assert(manifest.proofNonce === proofNonce, 'source coverage manifest nonce mismatch');
  assert(Array.isArray(manifest.sourceRecords) && manifest.sourceRecords.length === REQUIRED_SOURCE_CLASSES.length, 'source coverage manifest has the wrong record count');

  manifest.sourceRecords.forEach((record, index) => {
    const sourceClass = REQUIRED_SOURCE_CLASSES[index];
    exactKeys(record, [
      'sourceClass',
      'sourceInstanceOpaqueId',
      'expectedDisposition',
      'canonicalDescriptorSha256',
      'originWitnessSha256',
      'deliveryEvidenceSha256',
      'capturedBeforeModelStart',
      'coverageOrdinal',
      'sourceState',
      'expectedFrameCount',
    ], `source coverage record ${index}`);
    const expected = expectedSourceRecord(sourceClass, index + 1);
    assert(record.sourceClass === expected.sourceClass, `source coverage record ${index} has an unlisted, missing, or reordered source class`);
    assert(record.sourceInstanceOpaqueId === expected.sourceInstanceOpaqueId, `source coverage record ${index} has a non-opaque source identifier`);
    assert(record.expectedDisposition === expected.expectedDisposition, `source coverage record ${index} has the wrong disposition`);
    assert(record.canonicalDescriptorSha256 === expected.canonicalDescriptorSha256, `source coverage record ${index} descriptor hash mismatch`);
    assert(record.originWitnessSha256 === expected.originWitnessSha256, `source coverage record ${index} origin witness mismatch`);
    assert(record.deliveryEvidenceSha256 === expected.deliveryEvidenceSha256, `source coverage record ${index} delivery evidence mismatch`);
    assert(record.capturedBeforeModelStart === true, `source coverage record ${index} was not captured before model start`);
    assert(record.coverageOrdinal === expected.coverageOrdinal, `source coverage record ${index} has a duplicate, missing, or reordered coverage ordinal`);
    assert(record.sourceState === 'observable', `source coverage record ${index} is unobservable or provider-asserted-only`);
    assert(record.expectedFrameCount === expected.expectedFrameCount, `source coverage record ${index} has the wrong frame count`);
  });
}

function validateInvocationEnvelope(envelope, proofNonce, manifest) {
  exactKeys(envelope, ['version', 'kind', 'synthetic', 'proofNonce', 'frames'], 'sealed invocation envelope');
  assert(envelope.version === 1, 'sealed invocation envelope has the wrong version');
  assert(envelope.kind === 'ambient-input-provenance-synthetic-sealed-invocation-envelope', 'sealed invocation envelope has the wrong kind');
  assert(envelope.synthetic === true, 'sealed invocation envelope is not synthetic');
  assert(envelope.proofNonce === proofNonce, 'sealed invocation envelope nonce mismatch');
  assert(Array.isArray(envelope.frames), 'sealed invocation envelope frames must be an array');
  const expectedFrameCount = manifest.sourceRecords.reduce((total, record) => total + record.expectedFrameCount, 0);
  assert(envelope.frames.length === expectedFrameCount, 'sealed invocation envelope contains an extra or missing frame');

  envelope.frames.forEach((frame, index) => {
    exactKeys(frame, ['sequence', 'sourceClass', 'frameType', 'payloadSha256', 'byteLength'], `sealed invocation frame ${index}`);
    const expected = expectedAttachmentFrame();
    assert(frame.sequence === index + 1, `sealed invocation frame ${index} has a sequence gap`);
    assert(frame.sourceClass === expected.sourceClass, `sealed invocation frame ${index} comes from a forbidden or unlisted source`);
    assert(frame.frameType === expected.frameType, `sealed invocation frame ${index} has an unlisted frame type`);
    assert(frame.payloadSha256 === expected.payloadSha256, `sealed invocation frame ${index} payload hash mismatch`);
    assert(frame.byteLength === expected.byteLength, `sealed invocation frame ${index} byte length mismatch`);
  });
}

function validateCaptureStatement(statement, proofNonce, artifactEnvelopes) {
  exactKeys(statement, [
    'version',
    'kind',
    'synthetic',
    'proofNonce',
    'runtimeInstanceMeasurementSha256',
    'runtimeConfigurationSha256',
    'runnerAndAdapterSha256',
    'sourceCoverageManifestSha256',
    'sealedInvocationEnvelopeSha256',
    'toolSurfaceManifestSha256',
    'inputCaptureAgentSha256',
    'captureStartedBeforeModelStart',
    'noUncapturedFramesObserved',
    'captureState',
  ], 'capture statement');
  assert(statement.version === 1, 'capture statement has the wrong version');
  assert(statement.kind === 'ambient-input-provenance-synthetic-capture-statement', 'capture statement has the wrong kind');
  assert(statement.synthetic === true, 'capture statement is not synthetic');
  assert(statement.proofNonce === proofNonce, 'capture statement nonce mismatch');
  for (const [key, label] of [
    ['runtimeInstanceMeasurementSha256', 'runtime measurement'],
    ['runtimeConfigurationSha256', 'runtime configuration'],
    ['runnerAndAdapterSha256', 'runner and adapter'],
    ['inputCaptureAgentSha256', 'input capture agent'],
  ]) {
    assert(statement[key] === fixedHash(label), `capture statement ${key} mismatch`);
  }
  assert(statement.sourceCoverageManifestSha256 === artifactEnvelopes.sourceCoverageManifest.sha256, 'capture statement source coverage binding mismatch');
  assert(statement.sealedInvocationEnvelopeSha256 === artifactEnvelopes.sealedInvocationEnvelope.sha256, 'capture statement invocation envelope binding mismatch');
  assert(statement.toolSurfaceManifestSha256 === artifactEnvelopes.toolSurfaceTrace.sha256, 'capture statement tool surface binding mismatch');
  assert(statement.captureStartedBeforeModelStart === true, 'capture did not start before model start');
  assert(statement.noUncapturedFramesObserved === true, 'capture observed uncaptured frames');
  assert(statement.captureState === 'synthetic-fixture-only', 'capture statement is not fixed to a synthetic fixture');
}

function validateLocalAccessTrace(trace, proofNonce, tupleAllowlist) {
  exactKeys(trace, [
    'version',
    'kind',
    'synthetic',
    'proofNonce',
    'guardStartedBeforeModelStart',
    'guardStoppedAfterModelStop',
    'eventGapCount',
    'unknownChildCount',
    'traceCompleteness',
    'accessEvents',
  ], 'local access trace');
  assert(trace.version === 1, 'local access trace has the wrong version');
  assert(trace.kind === 'ambient-input-provenance-synthetic-local-access-trace', 'local access trace has the wrong kind');
  assert(trace.synthetic === true, 'local access trace is not synthetic');
  assert(trace.proofNonce === proofNonce, 'local access trace nonce mismatch');
  assert(trace.guardStartedBeforeModelStart === true, 'local guard did not start before model start');
  assert(trace.guardStoppedAfterModelStop === true, 'local guard did not stop after model stop');
  assert(trace.eventGapCount === 0, 'local guard reported an event gap');
  assert(trace.unknownChildCount === 0, 'local guard reported an unknown child');
  assert(trace.traceCompleteness === 'complete', 'local access trace is incomplete');
  assert(Array.isArray(trace.accessEvents), 'local access events must be an array');
  assert(trace.accessEvents.length === tupleAllowlist.tuples.length, 'local access trace has an unexpected event count');

  trace.accessEvents.forEach((event, index) => {
    exactKeys(event, ['sequence', 'actor', 'operation', 'surfaceClass', 'outcome', 'targetOpaqueId'], `local access event ${index}`);
    assert(ACCESS_OPERATIONS.includes(event.operation), `local access event ${index} has an unlisted operation`);
    assert(ALLOWED_SURFACE_CLASSES.includes(event.surfaceClass), `local access event ${index} performs ${event.operation} on a forbidden or unknown surface class`);
    assertOpaqueId(event.targetOpaqueId, `local access event ${index} target`);
    const expected = accessEventFromTuple(tupleAllowlist.tuples[index]);
    assert(JSON.stringify(event) === JSON.stringify(expected), `local access event ${index} is unexpected or violates the fixed synthetic policy`);
  });
}

function validateToolSurfaceTrace(trace, proofNonce) {
  exactKeys(trace, [
    'version',
    'kind',
    'synthetic',
    'proofNonce',
    'traceCompleteness',
    'declaredToolDefinitionCount',
    'observedToolDefinitionCount',
    'observedToolInvocationCount',
    'unknownToolDefinitionCount',
    'unknownToolInvocationCount',
    'connectorDefinitionCount',
    'mcpDefinitionCount',
    'browserIntegrationCount',
  ], 'tool surface trace');
  assert(trace.version === 1, 'tool surface trace has the wrong version');
  assert(trace.kind === 'ambient-input-provenance-synthetic-tool-surface-trace', 'tool surface trace has the wrong kind');
  assert(trace.synthetic === true, 'tool surface trace is not synthetic');
  assert(trace.proofNonce === proofNonce, 'tool surface trace nonce mismatch');
  assert(trace.traceCompleteness === 'complete', 'tool surface trace is incomplete');
  for (const key of [
    'declaredToolDefinitionCount',
    'observedToolDefinitionCount',
    'observedToolInvocationCount',
    'unknownToolDefinitionCount',
    'unknownToolInvocationCount',
    'connectorDefinitionCount',
    'mcpDefinitionCount',
    'browserIntegrationCount',
  ]) {
    assert(trace[key] === 0, `tool surface trace reports ${key}`);
  }
}

function validateLifetimeTrace(trace, proofNonce, localAccessTrace) {
  exactKeys(trace, [
    'version',
    'kind',
    'synthetic',
    'proofNonce',
    'modelStartObserved',
    'modelStopObserved',
    'guardStartedBeforeModelStart',
    'guardStoppedAfterModelStop',
    'eventGapCount',
    'unknownChildCount',
    'postStartInboundControlCount',
    'unknownNetworkEndpointCount',
    'traceCompleteness',
  ], 'lifetime trace');
  assert(trace.version === 1, 'lifetime trace has the wrong version');
  assert(trace.kind === 'ambient-input-provenance-synthetic-lifetime-trace', 'lifetime trace has the wrong kind');
  assert(trace.synthetic === true, 'lifetime trace is not synthetic');
  assert(trace.proofNonce === proofNonce, 'lifetime trace nonce mismatch');
  assert(trace.modelStartObserved === true && trace.modelStopObserved === true, 'lifetime trace did not observe model start and stop');
  assert(trace.guardStartedBeforeModelStart === true && trace.guardStoppedAfterModelStop === true, 'lifetime trace does not cover the guard lifetime');
  assert(trace.eventGapCount === 0 && trace.unknownChildCount === 0, 'lifetime trace has an event gap or unknown child');
  assert(trace.postStartInboundControlCount === 0, 'lifetime trace observed post-start inbound control');
  assert(trace.unknownNetworkEndpointCount === 0, 'lifetime trace observed an unknown network endpoint');
  assert(trace.traceCompleteness === 'complete', 'lifetime trace is incomplete');
  assert(trace.guardStartedBeforeModelStart === localAccessTrace.guardStartedBeforeModelStart, 'guard start evidence disagrees across traces');
  assert(trace.guardStoppedAfterModelStop === localAccessTrace.guardStoppedAfterModelStop, 'guard stop evidence disagrees across traces');
  assert(trace.eventGapCount === localAccessTrace.eventGapCount, 'event-gap evidence disagrees across traces');
  assert(trace.unknownChildCount === localAccessTrace.unknownChildCount, 'unknown-child evidence disagrees across traces');
}

export function validateSyntheticFixture(fixtureRoot) {
  assertDesignPinned();
  const release = validateContractRelease();
  const root = assertFixtureRoot(fixtureRoot);
  const bundle = readJsonFile(root, 'evidence-bundle.json', 'evidence bundle');
  exactKeys(bundle, ['version', 'kind', 'recordState', 'synthetic', 'proofNonce', 'design', 'guardContract', 'tupleAllowlist', 'contractRelease', 'artifacts', 'claims'], 'evidence bundle');
  assert(bundle.version === 1, 'evidence bundle has the wrong version');
  assert(bundle.kind === 'ambient-input-provenance-synthetic-evidence', 'evidence bundle has the wrong kind');
  assert(bundle.recordState === 'synthetic-collected', 'evidence bundle has a non-synthetic record state');
  assert(bundle.synthetic === true, 'evidence bundle is not synthetic');
  assert(typeof bundle.proofNonce === 'string' && /^synthetic-nonce-[a-f0-9]{32}$/.test(bundle.proofNonce), 'evidence bundle has an invalid proof nonce');
  exactKeys(bundle.design, ['fileName', 'sha256'], 'evidence bundle design pin');
  assert(bundle.design.fileName === DESIGN_FILE_NAME, 'evidence bundle pins the wrong design source');
  assert(bundle.design.sha256 === DESIGN_SOURCE_SHA256, 'evidence bundle design pin mismatch');
  exactKeys(bundle.guardContract, ['fileName', 'sha256'], 'evidence bundle guard contract pin');
  assert(bundle.guardContract.fileName === release.guardContractFileName, 'evidence bundle pins the wrong guard contract');
  assert(bundle.guardContract.sha256 === release.guardContractSha256, 'evidence bundle guard contract pin mismatch');
  exactKeys(bundle.tupleAllowlist, ['fileName', 'sha256'], 'evidence bundle tuple allowlist pin');
  assert(bundle.tupleAllowlist.fileName === release.tupleAllowlistFileName, 'evidence bundle pins the wrong tuple allowlist');
  assert(bundle.tupleAllowlist.sha256 === release.tupleAllowlistSha256, 'evidence bundle tuple allowlist pin mismatch');
  exactKeys(bundle.contractRelease, ['fileName', 'sha256'], 'evidence bundle contract release pin');
  assert(bundle.contractRelease.fileName === release.releaseFileName, 'evidence bundle pins the wrong contract release');
  assert(bundle.contractRelease.sha256 === release.releaseSha256, 'evidence bundle contract release pin mismatch');
  validateClaims(bundle.claims);

  const artifacts = readArtifacts(root, bundle);
  validateSourceCoverageManifest(artifacts.sourceCoverageManifest, bundle.proofNonce);
  validateInvocationEnvelope(artifacts.sealedInvocationEnvelope, bundle.proofNonce, artifacts.sourceCoverageManifest);
  validateCaptureStatement(artifacts.captureStatement, bundle.proofNonce, bundle.artifacts);
  validateLocalAccessTrace(artifacts.localAccessTrace, bundle.proofNonce, release.tupleAllowlist);
  validateToolSurfaceTrace(artifacts.toolSurfaceTrace, bundle.proofNonce);
  validateLifetimeTrace(artifacts.lifetimeTrace, bundle.proofNonce, artifacts.localAccessTrace);

  return {
    valid: true,
    synthetic: true,
    designSourceSha256: DESIGN_SOURCE_SHA256,
    guardContractSha256: release.guardContractSha256,
    tupleAllowlistSha256: release.tupleAllowlistSha256,
    contractReleaseSha256: release.releaseSha256,
    result: FIXED_NON_AUTHORIZING_RESULT,
    capabilityProbePass: false,
    p11Authorization: 'NOT_AUTHORIZED',
  };
}

function createArtifacts(proofNonce, tupleAllowlist) {
  const sourceCoverageManifest = {
    version: 1,
    kind: 'ambient-input-provenance-synthetic-source-coverage-manifest',
    synthetic: true,
    proofNonce,
    sourceRecords: REQUIRED_SOURCE_CLASSES.map((sourceClass, index) => expectedSourceRecord(sourceClass, index + 1)),
  };
  const sealedInvocationEnvelope = {
    version: 1,
    kind: 'ambient-input-provenance-synthetic-sealed-invocation-envelope',
    synthetic: true,
    proofNonce,
    frames: [expectedAttachmentFrame()],
  };
  const localAccessTrace = {
    version: 1,
    kind: 'ambient-input-provenance-synthetic-local-access-trace',
    synthetic: true,
    proofNonce,
    guardStartedBeforeModelStart: true,
    guardStoppedAfterModelStop: true,
    eventGapCount: 0,
    unknownChildCount: 0,
    traceCompleteness: 'complete',
    accessEvents: tupleAllowlist.tuples.map((tuple) => accessEventFromTuple(tuple)),
  };
  const toolSurfaceTrace = {
    version: 1,
    kind: 'ambient-input-provenance-synthetic-tool-surface-trace',
    synthetic: true,
    proofNonce,
    traceCompleteness: 'complete',
    declaredToolDefinitionCount: 0,
    observedToolDefinitionCount: 0,
    observedToolInvocationCount: 0,
    unknownToolDefinitionCount: 0,
    unknownToolInvocationCount: 0,
    connectorDefinitionCount: 0,
    mcpDefinitionCount: 0,
    browserIntegrationCount: 0,
  };
  const lifetimeTrace = {
    version: 1,
    kind: 'ambient-input-provenance-synthetic-lifetime-trace',
    synthetic: true,
    proofNonce,
    modelStartObserved: true,
    modelStopObserved: true,
    guardStartedBeforeModelStart: true,
    guardStoppedAfterModelStop: true,
    eventGapCount: 0,
    unknownChildCount: 0,
    postStartInboundControlCount: 0,
    unknownNetworkEndpointCount: 0,
    traceCompleteness: 'complete',
  };
  return { sourceCoverageManifest, sealedInvocationEnvelope, localAccessTrace, toolSurfaceTrace, lifetimeTrace };
}

function artifactPath(fixtureRoot, artifactKey) {
  return join(fixtureRoot, 'artifacts', EXPECTED_ARTIFACTS[artifactKey].fileName);
}

function refreshArtifactEnvelope(fixtureRoot, artifactKey) {
  const bundlePath = join(fixtureRoot, 'evidence-bundle.json');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  bundle.artifacts[artifactKey].sha256 = fileSha256(artifactPath(fixtureRoot, artifactKey));
  writeJsonFile(bundlePath, bundle);
}

function refreshCaptureBindings(fixtureRoot) {
  const capturePath = artifactPath(fixtureRoot, 'captureStatement');
  const capture = JSON.parse(readFileSync(capturePath, 'utf8'));
  capture.sourceCoverageManifestSha256 = fileSha256(artifactPath(fixtureRoot, 'sourceCoverageManifest'));
  capture.sealedInvocationEnvelopeSha256 = fileSha256(artifactPath(fixtureRoot, 'sealedInvocationEnvelope'));
  capture.toolSurfaceManifestSha256 = fileSha256(artifactPath(fixtureRoot, 'toolSurfaceTrace'));
  writeJsonFile(capturePath, capture);
  refreshArtifactEnvelope(fixtureRoot, 'captureStatement');
}

function mutateArtifact(fixtureRoot, artifactKey, mutation, refreshCapture = false) {
  const path = artifactPath(fixtureRoot, artifactKey);
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  mutation(artifact);
  writeJsonFile(path, artifact);
  refreshArtifactEnvelope(fixtureRoot, artifactKey);
  if (refreshCapture) refreshCaptureBindings(fixtureRoot);
}

export function makeSyntheticFixture() {
  assertDesignPinned();
  const release = validateContractRelease();
  const workspaceReal = nativeRealpath(WORKSPACE_ROOT);
  const fixtureRoot = mkdtempSync(join(workspaceReal, FIXTURE_PREFIX));
  mkdirSync(join(fixtureRoot, 'artifacts'));
  const proofNonce = `synthetic-nonce-${randomBytes(16).toString('hex')}`;
  const fixtureArtifacts = createArtifacts(proofNonce, release.tupleAllowlist);

  for (const artifactKey of ['sourceCoverageManifest', 'sealedInvocationEnvelope', 'localAccessTrace', 'toolSurfaceTrace', 'lifetimeTrace']) {
    writeJsonFile(artifactPath(fixtureRoot, artifactKey), fixtureArtifacts[artifactKey]);
  }
  const captureStatement = {
    version: 1,
    kind: 'ambient-input-provenance-synthetic-capture-statement',
    synthetic: true,
    proofNonce,
    runtimeInstanceMeasurementSha256: fixedHash('runtime measurement'),
    runtimeConfigurationSha256: fixedHash('runtime configuration'),
    runnerAndAdapterSha256: fixedHash('runner and adapter'),
    sourceCoverageManifestSha256: fileSha256(artifactPath(fixtureRoot, 'sourceCoverageManifest')),
    sealedInvocationEnvelopeSha256: fileSha256(artifactPath(fixtureRoot, 'sealedInvocationEnvelope')),
    toolSurfaceManifestSha256: fileSha256(artifactPath(fixtureRoot, 'toolSurfaceTrace')),
    inputCaptureAgentSha256: fixedHash('input capture agent'),
    captureStartedBeforeModelStart: true,
    noUncapturedFramesObserved: true,
    captureState: 'synthetic-fixture-only',
  };
  writeJsonFile(artifactPath(fixtureRoot, 'captureStatement'), captureStatement);

  const artifacts = {};
  for (const [artifactKey, expected] of Object.entries(EXPECTED_ARTIFACTS)) {
    artifacts[artifactKey] = {
      fileName: expected.fileName,
      sha256: fileSha256(artifactPath(fixtureRoot, artifactKey)),
      sourceIdentity: expected.sourceIdentity,
    };
  }
  const bundle = {
    version: 1,
    kind: 'ambient-input-provenance-synthetic-evidence',
    recordState: 'synthetic-collected',
    synthetic: true,
    proofNonce,
    design: {
      fileName: DESIGN_FILE_NAME,
      sha256: DESIGN_SOURCE_SHA256,
    },
    guardContract: {
      fileName: release.guardContractFileName,
      sha256: release.guardContractSha256,
    },
    tupleAllowlist: {
      fileName: release.tupleAllowlistFileName,
      sha256: release.tupleAllowlistSha256,
    },
    contractRelease: {
      fileName: release.releaseFileName,
      sha256: release.releaseSha256,
    },
    artifacts,
    claims: {
      syntheticOnly: true,
      capabilityProbePass: false,
      p11Authorization: 'NOT_AUTHORIZED',
      roleDeliveryAuthorized: false,
      roleLaunchAuthorized: false,
      implementationAuthorized: false,
      returnCheckAuthorized: false,
      returnApplyAuthorized: false,
      measurementAuthorized: false,
      accessibilityAuthorized: false,
      motionAuthorized: false,
      gateAuthorized: false,
      reissuePublicationAuthorized: false,
      siteLifecycleMutationAuthorized: false,
      providerOrRuntimeProvisioningAuthorized: false,
      result: FIXED_NON_AUTHORIZING_RESULT,
    },
  };
  writeJsonFile(join(fixtureRoot, 'evidence-bundle.json'), bundle);
  return fixtureRoot;
}

export function cleanupSyntheticFixture(fixtureRoot) {
  const workspaceReal = nativeRealpath(WORKSPACE_ROOT);
  const resolved = resolve(fixtureRoot);
  assert(isWithin(workspaceReal, resolved) && basename(resolved).startsWith(FIXTURE_PREFIX), 'refusing to remove a non-synthetic or out-of-workspace directory');
  assertNoLinkComponents(workspaceReal, resolved, 'synthetic fixture cleanup root');
  rmSync(resolved, { recursive: true, force: false, maxRetries: 3 });
}

function expectRejected(label, mutation) {
  const fixture = makeSyntheticFixture();
  try {
    mutation(fixture);
    let rejected = false;
    try {
      validateSyntheticFixture(fixture);
    } catch (error) {
      if (error instanceof AmbientInputValidationError) rejected = true;
      else throw error;
    }
    assert(rejected, `self-test mutation was incorrectly accepted: ${label}`);
    return label;
  } finally {
    cleanupSyntheticFixture(fixture);
  }
}

function mutateBundle(fixtureRoot, mutation) {
  const path = join(fixtureRoot, 'evidence-bundle.json');
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  mutation(bundle);
  writeJsonFile(path, bundle);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectReleaseRejected(label, mutation) {
  const releasePath = join(TOOLS_ROOT, GUARD_CONTRACT_RELEASE_FILE_NAME);
  const release = cloneJson(readCanonicalJsonAtPath(WORKSPACE_ROOT, releasePath, 'self-test guard contract release'));
  mutation(release);
  let rejected = false;
  try {
    validateContractReleaseDocument(release);
  } catch (error) {
    if (error instanceof AmbientInputValidationError) rejected = true;
    else throw error;
  }
  assert(rejected, `self-test contract release mutation was incorrectly accepted: ${label}`);
  return label;
}

function expectContractRejected(label, mutation) {
  const contractPath = join(TOOLS_ROOT, GUARD_CONTRACT_FILE_NAME);
  const contract = cloneJson(readCanonicalJsonAtPath(WORKSPACE_ROOT, contractPath, 'self-test guard contract'));
  mutation(contract);
  let rejected = false;
  try {
    validateGuardContractDocument(contract);
  } catch (error) {
    if (error instanceof AmbientInputValidationError) rejected = true;
    else throw error;
  }
  assert(rejected, `self-test guard contract mutation was incorrectly accepted: ${label}`);
  return label;
}

function expectTupleAllowlistRejected(label, mutation) {
  const tupleAllowlistPath = join(TOOLS_ROOT, TUPLE_ALLOWLIST_FILE_NAME);
  const tupleAllowlist = cloneJson(readCanonicalJsonAtPath(WORKSPACE_ROOT, tupleAllowlistPath, 'self-test synthetic tuple allowlist'));
  mutation(tupleAllowlist);
  let rejected = false;
  try {
    validateSyntheticTupleAllowlistDocument(tupleAllowlist);
  } catch (error) {
    if (error instanceof AmbientInputValidationError) rejected = true;
    else throw error;
  }
  assert(rejected, `self-test synthetic tuple allowlist mutation was incorrectly accepted: ${label}`);
  return label;
}

function expectCanonicalJsonRejected(label, text) {
  let rejected = false;
  try {
    parseCanonicalJsonBytes(Buffer.from(text, 'utf8'), `self-test ${label}`);
  } catch (error) {
    if (error instanceof AmbientInputValidationError) rejected = true;
    else throw error;
  }
  assert(rejected, `self-test noncanonical JSON was incorrectly accepted: ${label}`);
  return label;
}

function addForbiddenFrame(fixtureRoot, sourceClass) {
  mutateArtifact(fixtureRoot, 'sealedInvocationEnvelope', (envelope) => {
    envelope.frames.push({
      sequence: envelope.frames.length + 1,
      sourceClass,
      frameType: 'attachment-descriptor-set',
      payloadSha256: fixedHash(`forbidden-frame:${sourceClass}`),
      byteLength: 0,
    });
  }, true);
}

function addForbiddenAccessEvent(fixtureRoot, operation, surfaceClass) {
  mutateArtifact(fixtureRoot, 'localAccessTrace', (trace) => {
    trace.accessEvents.push({
      sequence: trace.accessEvents.length + 1,
      actor: 'synthetic-implementation-identity',
      operation,
      surfaceClass,
      outcome: 'allowed',
      targetOpaqueId: 'synthetic-forbidden-target',
    });
  });
}

function assertExternalDesignSymlinkRejected() {
  const workspaceReal = nativeRealpath(WORKSPACE_ROOT);
  const fixtureRoot = mkdtempSync(join(workspaceReal, `${FIXTURE_PREFIX}design-link-`));
  const outsideRoot = mkdtempSync(join(tmpdir(), 'r5-ambient-design-source-'));
  const target = join(outsideRoot, DESIGN_FILE_NAME);
  const link = join(fixtureRoot, 'design-link.md');
  let linkCreated = false;
  try {
    writeFileSync(target, readFileSync(join(TOOLS_ROOT, DESIGN_FILE_NAME)));
    symlinkSync(target, link, 'file');
    linkCreated = true;
    let rejected = false;
    try {
      assertPinnedDesignFile(link, 'self-test external design symlink');
    } catch (error) {
      if (error instanceof AmbientInputValidationError) rejected = true;
      else throw error;
    }
    assert(rejected, 'self-test external design symlink was incorrectly accepted');
    return 'external-design-symlink';
  } finally {
    if (linkCreated) unlinkSync(link);
    rmSync(fixtureRoot, { recursive: true, force: false, maxRetries: 3 });
    rmSync(outsideRoot, { recursive: true, force: false, maxRetries: 3 });
  }
}

export function runSelfTest() {
  assertDesignPinned();
  const release = validateContractRelease();
  const validFixture = makeSyntheticFixture();
  try {
    const valid = validateSyntheticFixture(validFixture);
    assert(valid.result === FIXED_NON_AUTHORIZING_RESULT && valid.p11Authorization === 'NOT_AUTHORIZED', 'valid synthetic fixture returned an authorizing result');
  } finally {
    cleanupSyntheticFixture(validFixture);
  }

  const checks = [];
  checks.push('valid-contract-release');
  checks.push(expectCanonicalJsonRejected('release-json-bom', '\uFEFF{}\n'));
  checks.push(expectCanonicalJsonRejected('release-json-noncanonical', '{\n\n}\n'));
  checks.push(expectCanonicalJsonRejected('release-json-duplicate-root-key', '{"version": 1, "version": 1}\n'));
  checks.push(expectCanonicalJsonRejected('release-json-duplicate-nested-key', '{"source": {"sha256": "a", "sha256": "b"}}\n'));
  checks.push(expectReleaseRejected('release-effective-true', (candidate) => { candidate.effective = true; }));
  checks.push(expectReleaseRejected('release-synthetic-only-false', (candidate) => { candidate.syntheticOnly = false; }));
  checks.push(expectReleaseRejected('release-unknown-key', (candidate) => { candidate.unexpected = true; }));
  checks.push(expectReleaseRejected('release-source-contract-hash-mismatch', (candidate) => { candidate.sourceFiles[0].sha256 = '0'.repeat(64); }));
  checks.push(expectReleaseRejected('release-source-tuple-allowlist-hash-mismatch', (candidate) => { candidate.sourceFiles[1].sha256 = '0'.repeat(64); }));
  checks.push(expectReleaseRejected('release-source-design-hash-mismatch', (candidate) => { candidate.sourceFiles[2].sha256 = '0'.repeat(64); }));
  checks.push(expectReleaseRejected('release-source-schema-hash-mismatch', (candidate) => { candidate.sourceFiles[3].sha256 = '0'.repeat(64); }));
  checks.push(expectReleaseRejected('release-source-validator-hash-mismatch', (candidate) => { candidate.sourceFiles[4].sha256 = '0'.repeat(64); }));
  checks.push(expectReleaseRejected('release-source-e2e-hash-mismatch', (candidate) => { candidate.sourceFiles[5].sha256 = '0'.repeat(64); }));
  checks.push(expectReleaseRejected('release-source-order-mismatch', (candidate) => { [candidate.sourceFiles[0], candidate.sourceFiles[1]] = [candidate.sourceFiles[1], candidate.sourceFiles[0]]; }));
  checks.push(expectReleaseRejected('release-source-missing', (candidate) => { candidate.sourceFiles.pop(); }));
  checks.push(expectReleaseRejected('release-does-not-authorize-mismatch', (candidate) => { candidate.doesNotAuthorize.pop(); }));
  checks.push(expectReleaseRejected('release-non-authorizing-result-mismatch', (candidate) => { candidate.nonAuthorizingResult.roleLaunchAuthorized = true; }));
  checks.push(expectContractRejected('contract-role-launch-authorization', (candidate) => { candidate.nonAuthorizingResult.roleLaunchAuthorized = true; }));
  checks.push(expectContractRejected('contract-schema-pin-mismatch', (candidate) => { candidate.schemaRelation.sha256 = '0'.repeat(64); }));
  checks.push(expectContractRejected('contract-tuple-allowlist-pin-mismatch', (candidate) => { candidate.guardContract.tupleAllowlistRequired.syntheticArtifact.sha256 = '0'.repeat(64); }));
  checks.push(expectContractRejected('contract-purpose-mismatch', (candidate) => { candidate.purpose = 'changed'; }));
  checks.push(expectContractRejected('contract-scope-does-not-amend-mismatch', (candidate) => { candidate.scope.doesNotAmend.pop(); }));
  checks.push(expectContractRejected('contract-scope-does-not-create-or-configure-mismatch', (candidate) => { candidate.scope.doesNotCreateOrConfigure[0] = 'changed'; }));
  checks.push(expectContractRejected('contract-surface-meaning-mismatch', (candidate) => { candidate.guardContract.knownSurfaceClasses[0].meaning = 'changed'; }));
  checks.push(expectContractRejected('contract-write-authorization-mismatch', (candidate) => { candidate.guardContract.writeAuthorization = 'changed'; }));
  checks.push(expectContractRejected('contract-tuple-required-fields-mismatch', (candidate) => { candidate.guardContract.tupleAllowlistRequired.requiredFields.pop(); }));
  checks.push(expectContractRejected('contract-tuple-allowlist-rule-mismatch', (candidate) => { candidate.guardContract.tupleAllowlistRequired.rule = 'changed'; }));
  checks.push(expectContractRejected('contract-tuple-artifact-mode-mismatch', (candidate) => { candidate.guardContract.tupleAllowlistRequired.syntheticArtifact.mode = 'changed'; }));
  checks.push(expectContractRejected('contract-forbidden-surface-class-mismatch', (candidate) => { candidate.guardContract.forbiddenSurfaceClass = 'changed'; }));
  checks.push(expectContractRejected('contract-unknown-surface-disposition-mismatch', (candidate) => { candidate.guardContract.unknownSurfaceClassDisposition = 'allow'; }));
  checks.push(expectContractRejected('contract-unknown-operation-disposition-mismatch', (candidate) => { candidate.guardContract.unknownOperationDisposition = 'allow'; }));
  checks.push(expectContractRejected('contract-forbidden-or-unknown-operation-disposition-mismatch', (candidate) => { candidate.guardContract.forbiddenOrUnknownOperationDisposition = 'changed'; }));
  checks.push(expectContractRejected('contract-trace-lifetime-observations-mismatch', (candidate) => { candidate.traceLifetimeContract.requiredLifecycleObservations.pop(); }));
  checks.push(expectContractRejected('contract-trace-lifetime-required-values-mismatch', (candidate) => { candidate.traceLifetimeContract.requiredValues.eventGapCount = 1; }));
  checks.push(expectContractRejected('contract-trace-lifetime-sequence-rules-mismatch', (candidate) => { candidate.traceLifetimeContract.sequenceRules.missingEventDisposition = 'allow'; }));
  checks.push(expectContractRejected('contract-path-opaque-target-requirement-mismatch', (candidate) => { candidate.pathAndEvidenceSafety.opaqueTargetRequirement = 'changed'; }));
  checks.push(expectContractRejected('contract-path-permitted-evidence-fields-mismatch', (candidate) => { candidate.pathAndEvidenceSafety.permittedRoleVisibleEvidenceFields.pop(); }));
  checks.push(expectContractRejected('contract-path-prohibited-evidence-content-mismatch', (candidate) => { candidate.pathAndEvidenceSafety.prohibitedRoleVisibleEvidenceContent.pop(); }));
  checks.push(expectContractRejected('contract-path-artifact-filesystem-safety-mismatch', (candidate) => { candidate.pathAndEvidenceSafety.artifactFilesystemSafety.canonicalVerifierControlledRootRequired = false; }));
  checks.push(expectContractRejected('contract-forbidden-locator-leak-disposition-mismatch', (candidate) => { candidate.pathAndEvidenceSafety.forbiddenLocatorLeakDisposition = 'allow'; }));
  checks.push(expectContractRejected('contract-independent-verifier-requirements-mismatch', (candidate) => { candidate.requiredFutureRuntimeBindings.independentVerifierRequirements.pop(); }));
  checks.push(expectContractRejected('contract-signed-statement-bindings-mismatch', (candidate) => { candidate.requiredFutureRuntimeBindings.oneSignedStatementMustBind.pop(); }));
  checks.push(expectContractRejected('contract-proof-nonce-requirements-mismatch', (candidate) => { candidate.requiredFutureRuntimeBindings.proofNonceRequirements.mustBeFresh = false; }));
  checks.push(expectContractRejected('contract-preinvocation-source-coverage-mismatch', (candidate) => { candidate.requiredFutureRuntimeBindings.preInvocationSourceCoverage.mustEnumerateAllClasses.pop(); }));
  checks.push(expectContractRejected('contract-sealed-invocation-requirements-mismatch', (candidate) => { candidate.requiredFutureRuntimeBindings.sealedInvocationRequirements.noUncapturedFramesObserved = false; }));
  checks.push(expectContractRejected('contract-runtime-acceptance-preconditions-mismatch', (candidate) => { candidate.requiredFutureRuntimeBindings.runtimeAcceptancePreconditions.pop(); }));
  checks.push(expectContractRejected('contract-fail-closed-conditions-mismatch', (candidate) => { candidate.failClosedConditions.pop(); }));
  checks.push(expectContractRejected('contract-synthetic-fixture-permitted-inputs-mismatch', (candidate) => { candidate.syntheticFixtureBoundary.permittedInputs.pop(); }));
  checks.push(expectContractRejected('contract-synthetic-fixture-prohibited-inputs-mismatch', (candidate) => { candidate.syntheticFixtureBoundary.prohibitedInputs.pop(); }));
  checks.push(expectContractRejected('contract-synthetic-fixture-conclusion-mismatch', (candidate) => { candidate.syntheticFixtureBoundary.onlyPermittedConclusion = 'changed'; }));
  checks.push(expectContractRejected('contract-unknown-key', (candidate) => { candidate.unexpected = true; }));
  checks.push(expectTupleAllowlistRejected('tuple-allowlist-unknown-operation', (candidate) => { candidate.tuples[0].operation = 'write'; }));
  checks.push(expectTupleAllowlistRejected('tuple-allowlist-surface-operation-mismatch', (candidate) => { candidate.tuples[1].operation = 'exec'; }));
  checks.push(expectTupleAllowlistRejected('tuple-allowlist-duplicate-access', (candidate) => {
    candidate.tuples[1].actorOpaqueId = candidate.tuples[0].actorOpaqueId;
    candidate.tuples[1].surfaceClass = candidate.tuples[0].surfaceClass;
    candidate.tuples[1].targetOpaqueId = candidate.tuples[0].targetOpaqueId;
    candidate.tuples[1].operation = candidate.tuples[0].operation;
  }));
  checks.push(assertExternalDesignSymlinkRejected());
  let outsideWorkspaceRejected = false;
  try {
    validateSyntheticFixture(dirname(WORKSPACE_ROOT));
  } catch (error) {
    if (error instanceof AmbientInputValidationError) outsideWorkspaceRejected = true;
    else throw error;
  }
  assert(outsideWorkspaceRejected, 'self-test external fixture root was incorrectly accepted');
  checks.push('outside-workspace-fixture-root');
  checks.push(expectRejected('design-source-pin-mismatch', (fixture) => mutateBundle(fixture, (bundle) => { bundle.design.sha256 = '0'.repeat(64); })));
  checks.push(expectRejected('fixture-guard-contract-pin-mismatch', (fixture) => mutateBundle(fixture, (bundle) => { bundle.guardContract.sha256 = '0'.repeat(64); })));
  checks.push(expectRejected('fixture-tuple-allowlist-pin-mismatch', (fixture) => mutateBundle(fixture, (bundle) => { bundle.tupleAllowlist.sha256 = '0'.repeat(64); })));
  checks.push(expectRejected('fixture-contract-release-pin-mismatch', (fixture) => mutateBundle(fixture, (bundle) => { bundle.contractRelease.sha256 = '0'.repeat(64); })));
  checks.push(expectRejected('fixture-reissue-publication-claim', (fixture) => mutateBundle(fixture, (bundle) => { bundle.claims.reissuePublicationAuthorized = true; })));
  checks.push(expectRejected('evidence-bundle-bom', (fixture) => {
    const path = join(fixture, 'evidence-bundle.json');
    writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(path)]));
  }));
  checks.push(expectRejected('evidence-bundle-noncanonical', (fixture) => {
    const path = join(fixture, 'evidence-bundle.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace('{\n', '{\n\n'));
  }));
  checks.push(expectRejected('evidence-bundle-duplicate-key', (fixture) => {
    const path = join(fixture, 'evidence-bundle.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace('  "version": 1,\n', '  "version": 1,\n  "version": 1,\n'));
  }));
  checks.push(expectRejected('added-global-instruction-frame', (fixture) => addForbiddenFrame(fixture, 'platform-instructions')));
  checks.push(expectRejected('unlisted-parent-frame', (fixture) => addForbiddenFrame(fixture, 'launch-and-bootstrap')));
  checks.push(expectRejected('unlisted-session-resume-frame', (fixture) => addForbiddenFrame(fixture, 'session-and-history')));
  checks.push(expectRejected('missing-capture-start', (fixture) => mutateArtifact(fixture, 'captureStatement', (statement) => { statement.captureStartedBeforeModelStart = false; })));
  checks.push(expectRejected('late-or-incomplete-capture', (fixture) => mutateArtifact(fixture, 'captureStatement', (statement) => { statement.noUncapturedFramesObserved = false; })));
  checks.push(expectRejected('forbidden-filesystem-read', (fixture) => addForbiddenAccessEvent(fixture, 'read', 'forbidden-nonruntime-data')));
  checks.push(expectRejected('incomplete-os-trace', (fixture) => mutateArtifact(fixture, 'localAccessTrace', (trace) => { trace.traceCompleteness = 'partial'; })));
  checks.push(expectRejected('extra-tool-definition', (fixture) => mutateArtifact(fixture, 'toolSurfaceTrace', (trace) => { trace.declaredToolDefinitionCount = 1; }, true)));
  checks.push(expectRejected('extra-mcp-definition', (fixture) => mutateArtifact(fixture, 'toolSurfaceTrace', (trace) => { trace.mcpDefinitionCount = 1; }, true)));
  checks.push(expectRejected('extra-connector-definition', (fixture) => mutateArtifact(fixture, 'toolSurfaceTrace', (trace) => { trace.connectorDefinitionCount = 1; }, true)));
  checks.push(expectRejected('post-start-inbound-control', (fixture) => mutateArtifact(fixture, 'lifetimeTrace', (trace) => { trace.postStartInboundControlCount = 1; })));
  checks.push(expectRejected('duplicate-coverage-ordinal', (fixture) => mutateArtifact(fixture, 'sourceCoverageManifest', (manifest) => { manifest.sourceRecords[1].coverageOrdinal = 1; }, true)));
  checks.push(expectRejected('missing-coverage-record', (fixture) => mutateArtifact(fixture, 'sourceCoverageManifest', (manifest) => { manifest.sourceRecords.pop(); }, true)));
  checks.push(expectRejected('reordered-coverage-record', (fixture) => mutateArtifact(fixture, 'sourceCoverageManifest', (manifest) => { manifest.sourceRecords.reverse(); }, true)));
  checks.push(expectRejected('unobservable-source-state', (fixture) => mutateArtifact(fixture, 'sourceCoverageManifest', (manifest) => { manifest.sourceRecords[0].sourceState = 'unobservable'; }, true)));
  checks.push(expectRejected('provider-asserted-only-source-state', (fixture) => mutateArtifact(fixture, 'sourceCoverageManifest', (manifest) => { manifest.sourceRecords[0].sourceState = 'provider-asserted-only'; }, true)));
  checks.push(expectRejected('p11-authorization-claim', (fixture) => mutateBundle(fixture, (bundle) => { bundle.claims.p11Authorization = 'PASS'; })));
  checks.push(expectRejected('real-capability-pass-claim', (fixture) => mutateBundle(fixture, (bundle) => { bundle.claims.capabilityProbePass = true; })));
  checks.push(expectRejected('authorizing-result-string', (fixture) => mutateBundle(fixture, (bundle) => { bundle.claims.result = 'REAL_RUNTIME_PASS'; })));
  checks.push(expectRejected('guard-event-gap', (fixture) => mutateArtifact(fixture, 'localAccessTrace', (trace) => { trace.eventGapCount = 1; })));
  checks.push(expectRejected('unknown-child', (fixture) => mutateArtifact(fixture, 'lifetimeTrace', (trace) => { trace.unknownChildCount = 1; })));
  for (const operation of ACCESS_OPERATIONS) {
    checks.push(expectRejected(`forbidden-operation-${operation}`, (fixture) => addForbiddenAccessEvent(fixture, operation, 'forbidden-nonruntime-data')));
  }
  checks.push(expectRejected('unknown-surface-connect', (fixture) => addForbiddenAccessEvent(fixture, 'connect', 'unknown-surface')));

  return {
    status: 'PASS',
    synthetic: true,
    designSourceSha256: DESIGN_SOURCE_SHA256,
    guardContractSha256: release.guardContractSha256,
    tupleAllowlistSha256: release.tupleAllowlistSha256,
    contractReleaseSha256: release.releaseSha256,
    result: FIXED_NON_AUTHORIZING_RESULT,
    capabilityProbePass: false,
    p11Authorization: 'NOT_AUTHORIZED',
    rejectedChecks: checks,
  };
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
    return;
  }
  if (args.length === 1 && args[0] === '--check-contract-release') {
    process.stdout.write(`${JSON.stringify(validateContractRelease(), null, 2)}\n`);
    return;
  }
  if (args.length === 2 && args[0] === '--check') {
    process.stdout.write(`${JSON.stringify(validateSyntheticFixture(args[1]), null, 2)}\n`);
    return;
  }
  fail('usage: node r5-ordinal3-ambient-input-provenance-synthetic-validator.mjs --self-test | --check-contract-release | --check <workspace-synthetic-fixture>');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(MODULE_PATH)) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`FAIL: ${message}\n`);
    process.exitCode = 1;
  }
}
