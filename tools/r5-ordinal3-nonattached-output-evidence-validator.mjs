import { createHash, randomBytes } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_WORKSPACE_ROOT = resolve(dirname(MODULE_PATH), '..');

export const REQUIRED_ATTACHMENT_PATHS = Object.freeze([
  'input/assignment.json',
  'input/references/pc-first-view.png',
  'input/references/sp-first-view.png',
  'return-authority.json',
]);

export const REQUIRED_ARTIFACT_KEYS = Object.freeze([
  'persistentOutputCanonicalEmptyInventoryBefore',
  'persistentOutputCanonicalEmptyInventoryAfterProbe',
  'actualPersistentOutputHostExistenceAndNonAttachEvidence',
  'persistentOutputNonAttachmentConfigurationEvidence',
  'persistentOutputHostAclAndReparseEvidence',
  'outputLocatorNonDisclosureEvidence',
  'implementationIdentityOutputNamespaceAbsenceProbe',
  'implementationIdentityOutputNamespaceTrace',
  'syntheticOutputDecoyDefinition',
  'implementationIdentitySyntheticOutputDecoyDenialProbe',
  'fixedExporterIdentityAndBoundaryEvidence',
  'fixedExporterAtomicCreateEvidence',
  'mountTableBefore',
  'mountTableAfter',
  'aclTableBefore',
  'aclTableAfter',
  'reparseAndSymlinkScan',
  'inputHashBefore',
  'inputHashAfter',
  'probeTranscript',
  'probeTrace',
  'runtimeManagerEvents',
  'postProbeConfigurationRecheck',
]);

const EXPECTED_ARTIFACT_SOURCES = Object.freeze({
  persistentOutputCanonicalEmptyInventoryBefore: 'coordinator-verifier',
  persistentOutputCanonicalEmptyInventoryAfterProbe: 'coordinator-verifier',
  actualPersistentOutputHostExistenceAndNonAttachEvidence: 'coordinator-verifier',
  persistentOutputNonAttachmentConfigurationEvidence: 'runtime-manager',
  persistentOutputHostAclAndReparseEvidence: 'coordinator-verifier',
  outputLocatorNonDisclosureEvidence: 'coordinator-verifier',
  implementationIdentityOutputNamespaceAbsenceProbe: 'guest-measurement-agent',
  implementationIdentityOutputNamespaceTrace: 'guest-measurement-agent',
  syntheticOutputDecoyDefinition: 'coordinator-verifier',
  implementationIdentitySyntheticOutputDecoyDenialProbe: 'guest-measurement-agent',
  fixedExporterIdentityAndBoundaryEvidence: 'fixed-exporter-verifier',
  fixedExporterAtomicCreateEvidence: 'fixed-exporter-verifier',
  mountTableBefore: 'guest-measurement-agent',
  mountTableAfter: 'guest-measurement-agent',
  aclTableBefore: 'guest-measurement-agent',
  aclTableAfter: 'guest-measurement-agent',
  reparseAndSymlinkScan: 'guest-measurement-agent',
  inputHashBefore: 'guest-measurement-agent',
  inputHashAfter: 'guest-measurement-agent',
  probeTranscript: 'guest-measurement-agent',
  probeTrace: 'guest-measurement-agent',
  runtimeManagerEvents: 'runtime-manager',
  postProbeConfigurationRecheck: 'coordinator-verifier',
});

export const CONTRACT = Object.freeze({
  schema: Object.freeze({
    path: 'tools/r5-ordinal3-os-isolation-proof-schema.json',
    sha256: 'c17a30f3fd2b84c897635b0f0eb645e3633d3b19418d99c41a7cd8fb5d031403',
  }),
  amendment: Object.freeze({
    path: 'tools/r5-ordinal3-nonattached-output-contract-amendment-draft.json',
    sha256: 'b7960c5509ea50ed27d18ad636f0f12c5c712444a84de0765068f416b27b28a0',
  }),
  ownerAcceptance: Object.freeze({
    path: 'tools/r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance.json',
    sha256: 'a35ccd16bd8a911879614f04807a6d17d745e3de0491a1ee71350cfba2077e8e',
  }),
});

const HEX_64 = /^[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{32,128}$/;
const RELATIVE_FILE = /^(?![\\/])(?!(?:[A-Za-z]:))[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const ABSOLUTE_PATH_VALUE = /(?:^[A-Za-z]:[\\/]|^\\\\|^\/)/;

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  assert(isPlainObject(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has unsupported or missing keys`);
}

function requireSha256(value, label) {
  assert(typeof value === 'string' && HEX_64.test(value), `${label} must be a lowercase SHA-256`);
}

function assertSafeDirectory(path, label) {
  const stat = lstatSync(path);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), `${label} must be a real non-symlink directory`);
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function canonicalDirectory(path, label) {
  const lexical = resolve(path);
  assertSafeDirectory(lexical, label);
  const canonical = realpathSync.native(lexical);
  assert(samePath(lexical, canonical), `${label} contains a symbolic-link or junction ancestor`);
  return canonical;
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

export function parseCanonicalJsonBytes(bytes, label) {
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
    fail(`${label} must be valid JSON: ${error.message}`);
  }
  assert(`${JSON.stringify(value, null, 2)}\n` === text, `${label} must use canonical UTF-8 JSON`);
  return value;
}

function ensureSafeRelativeFile(root, relativePath, label) {
  assert(typeof relativePath === 'string' && RELATIVE_FILE.test(relativePath), `${label} must be a safe relative file path`);
  assertSafeDirectory(root, `${label} root`);
  const candidate = resolve(root, relativePath);
  const rel = relative(root, candidate);
  assert(rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel), `${label} escapes its root`);
  let cursor = root;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    cursor = join(cursor, parts[index]);
    const stat = lstatSync(cursor);
    assert(!stat.isSymbolicLink(), `${label} contains a symbolic-link component`);
    if (index < parts.length - 1) {
      assert(stat.isDirectory(), `${label} has a non-directory parent component`);
    } else {
      assert(stat.isFile() && stat.nlink === 1, `${label} must identify a single-link regular file`);
    }
  }
  return candidate;
}

function readJsonFile(path, label) {
  return parseCanonicalJsonBytes(readFileSync(path), label);
}

function assertNoAbsoluteOrSecretLocator(value, label, visited = new Set()) {
  if (typeof value === 'string') {
    assert(!ABSOLUTE_PATH_VALUE.test(value), `${label} contains an absolute path or UNC locator`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  assert(!visited.has(value), `${label} contains a cyclic value`);
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    assert(!/^(?:actual(?:Persistent)?Output(?:Path|Root)|privateSpool(?:Path|Root)|hostLocator)$/i.test(key), `${label} exposes a prohibited locator field: ${key}`);
    assertNoAbsoluteOrSecretLocator(child, `${label}.${key}`, visited);
  }
}

function assertContractSource(workspaceRoot, entry, expected, label) {
  exactKeys(entry, ['path', 'sha256'], label);
  assert(entry.path === expected.path, `${label}.path does not match the pinned contract`);
  assert(entry.sha256 === expected.sha256, `${label}.sha256 does not match the pinned contract`);
  const sourcePath = ensureSafeRelativeFile(workspaceRoot, entry.path, label);
  assert(sha256File(sourcePath) === expected.sha256, `${label} source bytes do not match the pinned contract`);
}

function assertAcceptedAmendment(workspaceRoot) {
  const path = ensureSafeRelativeFile(workspaceRoot, CONTRACT.ownerAcceptance.path, 'owner acceptance');
  const acceptance = readJsonFile(path, 'owner acceptance');
  exactKeys(
    acceptance,
    ['version', 'kind', 'recordState', 'ownerApproved', 'approvedAt', 'approvalSource', 'acceptedDraft', 'acceptedScope', 'doesNotAuthorize', 'p11Authorization'],
    'owner acceptance',
  );
  assert(acceptance.recordState === 'finalized' && acceptance.ownerApproved === true, 'owner acceptance is not finalized and approved');
  assert(acceptance.acceptedDraft?.path === CONTRACT.amendment.path && acceptance.acceptedDraft?.sha256 === CONTRACT.amendment.sha256, 'owner acceptance does not bind the exact amendment draft');
  assert(acceptance.acceptedScope?.nonattachedPersistentOutputEvidenceSemantics === true, 'owner acceptance does not accept non-attached evidence semantics');
  assert(acceptance.acceptedScope?.schemaReplacementAuthorized === false, 'owner acceptance unexpectedly authorizes a schema replacement');
  assert(acceptance.acceptedScope?.typedValidatorStillRequiredForPass === true, 'owner acceptance no longer requires the typed validator');
  assert(acceptance.p11Authorization === 'NOT_AUTHORIZED', 'owner acceptance changes P-11 authorization');
}

function assertContractReferences(workspaceRoot, contracts) {
  exactKeys(contracts, ['schema', 'amendment', 'ownerAcceptance'], 'contracts');
  assertContractSource(workspaceRoot, contracts.schema, CONTRACT.schema, 'contracts.schema');
  assertContractSource(workspaceRoot, contracts.amendment, CONTRACT.amendment, 'contracts.amendment');
  assertContractSource(workspaceRoot, contracts.ownerAcceptance, CONTRACT.ownerAcceptance, 'contracts.ownerAcceptance');
  assertAcceptedAmendment(workspaceRoot);
}

function assertAttachmentInventory(attachments, label) {
  assert(Array.isArray(attachments) && attachments.length === REQUIRED_ATTACHMENT_PATHS.length, `${label} must contain exactly four attachments`);
  const seen = new Set();
  for (const entry of attachments) {
    exactKeys(entry, ['logicalPath', 'type', 'bytes', 'sha256'], `${label} entry`);
    assert(REQUIRED_ATTACHMENT_PATHS.includes(entry.logicalPath), `${label} has an unexpected attachment path`);
    assert(!seen.has(entry.logicalPath), `${label} repeats an attachment path`);
    seen.add(entry.logicalPath);
    assert(entry.type === 'regular-file', `${label}.${entry.logicalPath} must be a regular file`);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `${label}.${entry.logicalPath}.bytes must be a non-negative safe integer`);
    requireSha256(entry.sha256, `${label}.${entry.logicalPath}.sha256`);
  }
  assert(REQUIRED_ATTACHMENT_PATHS.every((path) => seen.has(path)), `${label} does not cover the exact attachment allowlist`);
}

function inventoryIndex(attachments) {
  return new Map(attachments.map((entry) => [entry.logicalPath, `${entry.type}:${entry.bytes}:${entry.sha256}`]));
}

function assertArtifactEnvelope(artifactPath, artifactKey, proofNonce, bundleSynthetic) {
  const artifact = readJsonFile(artifactPath, `artifacts.${artifactKey}`);
  exactKeys(
    artifact,
    [
      'version',
      'kind',
      'artifactKey',
      'proofNonce',
      'sourceIdentity',
      'sourceArtifactId',
      'independentOfImplementationIdentity',
      'actualOutputLocatorDisclosedToImplementation',
      'payload',
    ],
    `artifacts.${artifactKey}`,
  );
  assert(artifact.version === 1, `artifacts.${artifactKey}.version must be 1`);
  assert(artifact.kind === 'p3-r5-ordinal3-nonattached-output-evidence-artifact', `artifacts.${artifactKey}.kind is invalid`);
  assert(artifact.artifactKey === artifactKey, `artifacts.${artifactKey}.artifactKey does not match its manifest key`);
  assert(artifact.proofNonce === proofNonce, `artifacts.${artifactKey}.proofNonce does not match the bundle nonce`);
  assert(artifact.sourceIdentity === EXPECTED_ARTIFACT_SOURCES[artifactKey], `artifacts.${artifactKey} has the wrong source identity`);
  assert(typeof artifact.sourceArtifactId === 'string' && /^[a-z0-9][a-z0-9._-]{7,127}$/.test(artifact.sourceArtifactId), `artifacts.${artifactKey}.sourceArtifactId must be opaque`);
  assert(artifact.independentOfImplementationIdentity === true, `artifacts.${artifactKey} is not independent of the implementation identity`);
  assert(artifact.actualOutputLocatorDisclosedToImplementation === false, `artifacts.${artifactKey} discloses the actual output locator`);
  exactKeys(artifact.payload, ['assertionType', 'result', 'synthetic'], `artifacts.${artifactKey}.payload`);
  assert(artifact.payload.assertionType === artifactKey, `artifacts.${artifactKey}.payload.assertionType is invalid`);
  assert(artifact.payload.result === 'collected', `artifacts.${artifactKey}.payload.result must be collected`);
  assert(artifact.payload.synthetic === bundleSynthetic, `artifacts.${artifactKey}.payload.synthetic disagrees with the bundle`);
  assertNoAbsoluteOrSecretLocator(artifact, `artifacts.${artifactKey}`);
  return artifact.sourceArtifactId;
}

function assertArtifacts(bundleRoot, artifacts, proofNonce, bundleSynthetic) {
  exactKeys(artifacts, REQUIRED_ARTIFACT_KEYS, 'artifacts');
  const paths = new Set();
  const hashes = new Set();
  const sourceArtifactIds = new Set();
  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const entry = artifacts[key];
    exactKeys(entry, ['path', 'sha256'], `artifacts.${key}`);
    const artifactPath = ensureSafeRelativeFile(bundleRoot, entry.path, `artifacts.${key}.path`);
    requireSha256(entry.sha256, `artifacts.${key}.sha256`);
    assert(sha256File(artifactPath) === entry.sha256, `artifacts.${key} bytes do not match its SHA-256`);
    assert(!paths.has(entry.path), `artifacts.${key} reuses another artifact path`);
    assert(!hashes.has(entry.sha256), `artifacts.${key} reuses another artifact byte sequence`);
    paths.add(entry.path);
    hashes.add(entry.sha256);
    const sourceArtifactId = assertArtifactEnvelope(artifactPath, key, proofNonce, bundleSynthetic);
    assert(!sourceArtifactIds.has(sourceArtifactId), `artifacts.${key} reuses another source artifact identifier`);
    sourceArtifactIds.add(sourceArtifactId);
  }
}

function assertTopology(topology) {
  exactKeys(
    topology,
    [
      'persistentOutputLocationId',
      'implementationIdentityPersistentOutputAccess',
      'persistentOutputVisibleToImplementation',
      'workScratchPersistence',
      'fixedExporterOnly',
      'collectorApprovalStatus',
    ],
    'topology',
  );
  assert(typeof topology.persistentOutputLocationId === 'string' && /^[a-z0-9][a-z0-9._-]{7,127}$/.test(topology.persistentOutputLocationId), 'topology.persistentOutputLocationId must be opaque');
  assert(topology.implementationIdentityPersistentOutputAccess === 'none', 'implementation identity has persistent-output access');
  assert(topology.persistentOutputVisibleToImplementation === false, 'persistent output is visible to the implementation identity');
  assert(topology.workScratchPersistence === 'ephemeral-not-host-backed-destroyed-with-runtime', 'work scratch does not preserve current non-host-backed semantics');
  assert(topology.fixedExporterOnly === true, 'fixed exporter boundary is missing');
  assert(topology.collectorApprovalStatus === 'NOT_APPROVED', 'collector state is not fail-closed');
}

function assertClaims(claims) {
  exactKeys(
    claims,
    [
      'capabilityProbePass',
      'p11Authorization',
      'actualPersistentOutputPathDisclosedToImplementation',
      'guestActualOutputDenialProbeUsed',
      'syntheticDecoyIsSoleProof',
      'roleLaunchAuthorized',
      'roleLaunchExecuted',
      'implementationExecuted',
      'returnCheckExecuted',
      'returnApplyExecuted',
    ],
    'claims',
  );
  assert(claims.capabilityProbePass === false, 'this validator cannot certify an external capability probe PASS');
  assert(claims.p11Authorization === 'NOT_AUTHORIZED', 'claims change P-11 authorization');
  assert(claims.actualPersistentOutputPathDisclosedToImplementation === false, 'claims disclose the persistent output to the implementation identity');
  assert(claims.guestActualOutputDenialProbeUsed === false, 'claims use a retired actual-output denial probe');
  assert(claims.syntheticDecoyIsSoleProof === false, 'claims use a synthetic decoy as sole proof');
  for (const action of ['roleLaunchAuthorized', 'roleLaunchExecuted', 'implementationExecuted', 'returnCheckExecuted', 'returnApplyExecuted']) {
    assert(claims[action] === false, `claims.${action} must remain false`);
  }
}

export function validateEvidenceBundle(bundleRoot, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
  const root = canonicalDirectory(bundleRoot, 'evidence bundle root');
  const workspace = canonicalDirectory(workspaceRoot, 'workspace root');
  const bundlePath = ensureSafeRelativeFile(root, 'evidence-bundle.json', 'evidence bundle');
  const bundle = readJsonFile(bundlePath, 'evidence bundle');
  exactKeys(
    bundle,
    ['version', 'kind', 'recordState', 'synthetic', 'proofNonce', 'contracts', 'topology', 'attachmentInventoryBefore', 'attachmentInventoryAfter', 'artifacts', 'claims'],
    'evidence bundle',
  );
  assert(bundle.version === 1, 'evidence bundle.version must be 1');
  assert(bundle.kind === 'p3-r5-ordinal3-nonattached-output-evidence-bundle', 'evidence bundle.kind is invalid');
  assert(bundle.recordState === 'collected', 'evidence bundle must remain collected; a PASS record needs a future effective contract and separate authorization');
  assert(bundle.synthetic === true, 'this validator accepts only a P-3-free synthetic fixture; a real evidence bundle needs a successor validator with an approved trust anchor');
  assert(typeof bundle.proofNonce === 'string' && NONCE.test(bundle.proofNonce), 'proofNonce must be lowercase hexadecimal and nonce-like');
  assertNoAbsoluteOrSecretLocator(bundle, 'evidence bundle');
  assertContractReferences(workspace, bundle.contracts);
  assertTopology(bundle.topology);
  assertAttachmentInventory(bundle.attachmentInventoryBefore, 'attachmentInventoryBefore');
  assertAttachmentInventory(bundle.attachmentInventoryAfter, 'attachmentInventoryAfter');
  const before = inventoryIndex(bundle.attachmentInventoryBefore);
  const after = inventoryIndex(bundle.attachmentInventoryAfter);
  assert([...before.keys()].every((key) => before.get(key) === after.get(key)), 'attachment inventories differ across the probe');
  assertArtifacts(root, bundle.artifacts, bundle.proofNonce, bundle.synthetic);
  assertClaims(bundle.claims);
  return {
    status: 'structural-pass-not-runtime-authorization',
    proofNonce: bundle.proofNonce,
    synthetic: bundle.synthetic,
    capabilityProbePass: false,
    p11Authorization: 'NOT_AUTHORIZED',
    roleLaunchAuthorized: false,
    validatedArtifactCount: REQUIRED_ARTIFACT_KEYS.length,
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function makeSyntheticFixture(workspaceRoot) {
  const root = mkdtempSync(join(tmpdir(), 'r5-nonattached-validator-'));
  const artifactsRoot = join(root, 'artifacts');
  mkdirSync(artifactsRoot, { recursive: true });
  const artifacts = {};
  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const path = `artifacts/${key}.json`;
    const fullPath = join(root, path);
    artifacts[key] = { path, sha256: null };
  }
  const inventory = REQUIRED_ATTACHMENT_PATHS.map((logicalPath, index) => ({
    logicalPath,
    type: 'regular-file',
    bytes: index + 1,
    sha256: sha256Bytes(Buffer.from(`synthetic-${logicalPath}`)),
  }));
  const proofNonce = randomBytes(32).toString('hex');
  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const fullPath = join(root, artifacts[key].path);
    writeJson(fullPath, {
      version: 1,
      kind: 'p3-r5-ordinal3-nonattached-output-evidence-artifact',
      artifactKey: key,
      proofNonce,
      sourceIdentity: EXPECTED_ARTIFACT_SOURCES[key],
      sourceArtifactId: `synthetic-${key.toLowerCase()}`,
      independentOfImplementationIdentity: true,
      actualOutputLocatorDisclosedToImplementation: false,
      payload: {
        assertionType: key,
        result: 'collected',
        synthetic: true,
      },
    });
    artifacts[key].sha256 = sha256File(fullPath);
  }
  writeJson(join(root, 'evidence-bundle.json'), {
    version: 1,
    kind: 'p3-r5-ordinal3-nonattached-output-evidence-bundle',
    recordState: 'collected',
    synthetic: true,
    proofNonce,
    contracts: CONTRACT,
    topology: {
      persistentOutputLocationId: 'opaque-synthetic-output-location',
      implementationIdentityPersistentOutputAccess: 'none',
      persistentOutputVisibleToImplementation: false,
      workScratchPersistence: 'ephemeral-not-host-backed-destroyed-with-runtime',
      fixedExporterOnly: true,
      collectorApprovalStatus: 'NOT_APPROVED',
    },
    attachmentInventoryBefore: inventory,
    attachmentInventoryAfter: inventory,
    artifacts,
    claims: {
      capabilityProbePass: false,
      p11Authorization: 'NOT_AUTHORIZED',
      actualPersistentOutputPathDisclosedToImplementation: false,
      guestActualOutputDenialProbeUsed: false,
      syntheticDecoyIsSoleProof: false,
      roleLaunchAuthorized: false,
      roleLaunchExecuted: false,
      implementationExecuted: false,
      returnCheckExecuted: false,
      returnApplyExecuted: false,
    },
  });
  return root;
}

function expectRejected(fn, label) {
  try {
    fn();
  } catch {
    return;
  }
  fail(`self-test expected rejection: ${label}`);
}

function expectCanonicalJsonRejected(label, bytes) {
  let rejected = false;
  try {
    parseCanonicalJsonBytes(bytes, `self-test ${label}`);
  } catch {
    rejected = true;
  }
  assert(rejected, `self-test expected canonical JSON rejection: ${label}`);
  return label;
}

export function selfTest(workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
  const canonicalJsonChecks = [
    expectCanonicalJsonRejected('json-bom', Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a])),
    expectCanonicalJsonRejected('json-nul', Buffer.from([0x7b, 0x7d, 0x00, 0x0a])),
    expectCanonicalJsonRejected('json-invalid-utf8', Buffer.from([0xc3, 0x28])),
    expectCanonicalJsonRejected('json-noncanonical', Buffer.from('{\n\n}\n', 'utf8')),
    expectCanonicalJsonRejected('json-duplicate-root-key', Buffer.from('{"version":1,"version":1}\n', 'utf8')),
    expectCanonicalJsonRejected('json-duplicate-nested-key', Buffer.from('{"source":{"sha256":"a","sha256":"b"}}\n', 'utf8')),
  ];
  const root = makeSyntheticFixture(workspaceRoot);
  try {
    const result = validateEvidenceBundle(root, workspaceRoot);
    assert(result.status === 'structural-pass-not-runtime-authorization', 'self-test baseline result is unexpected');

    const artifact = join(root, 'artifacts', 'mountTableAfter.json');
    writeFileSync(artifact, 'tampered', { encoding: 'utf8', flag: 'w' });
    expectRejected(() => validateEvidenceBundle(root, workspaceRoot), 'artifact hash mismatch');

    const repaired = makeSyntheticFixture(workspaceRoot);
    try {
      const bundlePath = join(repaired, 'evidence-bundle.json');
      const bundle = readJsonFile(bundlePath, 'self-test bundle');
      bundle.claims.capabilityProbePass = true;
      writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
      expectRejected(() => validateEvidenceBundle(repaired, workspaceRoot), 'unapproved capability pass');

      bundle.claims.capabilityProbePass = false;
      bundle.topology.implementationIdentityPersistentOutputAccess = 'read';
      writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
      expectRejected(() => validateEvidenceBundle(repaired, workspaceRoot), 'persistent output exposure');

      const nonSyntheticFixture = makeSyntheticFixture(workspaceRoot);
      try {
        const nonSyntheticBundlePath = join(nonSyntheticFixture, 'evidence-bundle.json');
        const nonSyntheticBundle = readJsonFile(nonSyntheticBundlePath, 'non-synthetic self-test bundle');
        nonSyntheticBundle.synthetic = false;
        writeFileSync(nonSyntheticBundlePath, `${JSON.stringify(nonSyntheticBundle, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
        expectRejected(() => validateEvidenceBundle(nonSyntheticFixture, workspaceRoot), 'non-synthetic evidence bundle');
      } finally {
        rmSync(nonSyntheticFixture, { recursive: true, force: true, maxRetries: 3 });
      }

      const sameArtifact = join(repaired, bundle.artifacts.mountTableBefore.path);
      bundle.topology.implementationIdentityPersistentOutputAccess = 'none';
      bundle.artifacts.mountTableAfter = {
        path: bundle.artifacts.mountTableBefore.path,
        sha256: sha256File(sameArtifact),
      };
      writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
      expectRejected(() => validateEvidenceBundle(repaired, workspaceRoot), 'artifact reuse');

      const locatorFixture = makeSyntheticFixture(workspaceRoot);
      try {
        const locatorBundlePath = join(locatorFixture, 'evidence-bundle.json');
        const locatorBundle = readJsonFile(locatorBundlePath, 'locator self-test bundle');
        const locatorArtifact = join(locatorFixture, locatorBundle.artifacts.outputLocatorNonDisclosureEvidence.path);
        const locatorRecord = readJsonFile(locatorArtifact, 'locator self-test artifact');
        locatorRecord.actualPersistentOutputPath = 'C:\\secret\\return.ustar.tar';
        writeFileSync(locatorArtifact, `${JSON.stringify(locatorRecord, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
        locatorBundle.artifacts.outputLocatorNonDisclosureEvidence.sha256 = sha256File(locatorArtifact);
        writeFileSync(locatorBundlePath, `${JSON.stringify(locatorBundle, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
        expectRejected(() => validateEvidenceBundle(locatorFixture, workspaceRoot), 'actual output locator disclosure');
      } finally {
        rmSync(locatorFixture, { recursive: true, force: true, maxRetries: 3 });
      }

      const junctionOuter = mkdtempSync(join(tmpdir(), 'r5-nonattached-validator-junction-'));
      try {
        const targetParent = dirname(repaired);
        const alias = join(junctionOuter, 'alias');
        symlinkSync(targetParent, alias, 'junction');
        expectRejected(() => validateEvidenceBundle(join(alias, repaired.split(/[\\/]/).at(-1)), workspaceRoot), 'junction ancestor');
      } finally {
        rmSync(junctionOuter, { recursive: true, force: true, maxRetries: 3 });
      }
    } finally {
      rmSync(repaired, { recursive: true, force: true, maxRetries: 3 });
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
  return {
    status: 'self-test-pass',
    checks: [...canonicalJsonChecks, 'artifact-hash-mismatch', 'unapproved-capability-pass', 'persistent-output-exposure', 'non-synthetic-evidence-bundle', 'artifact-reuse', 'actual-output-locator-disclosure', 'junction-ancestor'],
    externalP3Reads: false,
    externalWrites: false,
  };
}

function usage() {
  return 'Usage: node tools/r5-ordinal3-nonattached-output-evidence-validator.mjs --self-test | --check <bundle-directory> [workspace-root]';
}

function main(argv) {
  if (argv.length === 1 && argv[0] === '--self-test') {
    return selfTest();
  }
  if ((argv.length === 2 || argv.length === 3) && argv[0] === '--check') {
    return validateEvidenceBundle(argv[1], argv[2] ?? DEFAULT_WORKSPACE_ROOT);
  }
  fail(usage());
}

if (process.argv[1] && resolve(process.argv[1]) === MODULE_PATH) {
  try {
    process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
