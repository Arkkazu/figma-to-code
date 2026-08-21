// Workspace-only provenance verifier for the R5 ordinal-3 candidate.
// It is intentionally not listed in its manifest: the verifier byte-pins the
// manifest instead, which avoids a verifier/manifest self-hash cycle.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, "..");
const VERIFIER_PATH = fileURLToPath(import.meta.url);
const VERIFIER_WORKSPACE_PATH = "tools/r5-ordinal3-candidate-provenance-review-verify.mjs";
const MANIFEST_WORKSPACE_PATH = "tools/r5-ordinal3-candidate-provenance-review-manifest.json";
const MANIFEST_PATH = resolve(WORKSPACE_ROOT, MANIFEST_WORKSPACE_PATH);
const EXPECTED_MANIFEST_SHA256 = "e273cbc8838d859a2236ecb2999305333859e70223a60e3217c599d427dd96dd";
const CANDIDATE_DESIGN_WORKSPACE_PATH = "tools/r5-baseline-reissue-3-candidate-design.json";
const CANDIDATE_GENERATOR_WORKSPACE_PATH = "tools/r5-baseline-reissue-3-candidate-dry-run.mjs";
const RESULT_SCHEMA = "p3-r5-ordinal3-candidate-provenance-review-verify/v1";

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assertHex(value, length, label) {
  assert(typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value), `${label} is not lowercase ${length}-hex.`);
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function canonicalBytes(value) { return Buffer.from(canonical(value), "utf8"); }
function exact(actual, expected, label) { assert(canonical(actual) === canonical(expected), `${label} changed.`); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, expected, label) {
  assert(isPlainObject(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has unsupported or missing keys.`);
}
function nativeRealpath(path) { return realpathSync.native ? realpathSync.native(path) : realpathSync(path); }
function isWithin(parent, child) {
  const route = relative(parent, child);
  return route === "" || (!isAbsolute(route) && !route.split(/[\\/]+/).includes(".."));
}
function assertWorkspaceRelativePath(logicalPath, label) {
  assert(typeof logicalPath === "string" && logicalPath.length > 0, `${label} must be a nonempty workspace-relative POSIX path.`);
  assert(!logicalPath.includes("\\") && !logicalPath.includes(":") && !logicalPath.startsWith("/"), `${label} must be workspace-relative POSIX.`);
  const segments = logicalPath.split("/");
  assert(segments.every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), `${label} contains an unsafe path component.`);
  const resolved = resolve(WORKSPACE_ROOT, ...segments);
  assert(resolved !== WORKSPACE_ROOT && isWithin(WORKSPACE_ROOT, resolved), `${label} escapes the workspace.`);
  return resolved;
}
function assertNoLinkComponents(path, label) {
  const root = resolve(WORKSPACE_ROOT);
  const target = resolve(path);
  const route = relative(root, target);
  assert(route && isWithin(root, target), `${label} escapes the workspace.`);
  try {
    const rootStatus = lstatSync(root);
    assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), `${label} workspace root is not a non-link directory.`);
    let current = root;
    const segments = route.split(/[\\/]+/).filter(Boolean);
    assert(segments.length > 0, `${label} resolves to the workspace root.`);
    for (let index = 0; index < segments.length; index += 1) {
      current = resolve(current, segments[index]);
      const status = lstatSync(current);
      assert(!status.isSymbolicLink(), `${label} contains a symbolic link or junction.`);
      if (index < segments.length - 1) assert(status.isDirectory(), `${label} has a non-directory ancestor.`);
    }
    const rootReal = nativeRealpath(root);
    const targetReal = nativeRealpath(target);
    assert(rootReal !== targetReal && isWithin(rootReal, targetReal), `${label} resolves outside the workspace.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    fail(`${label} has a missing or unreadable path component.`);
  }
}
function readRegular(path, label) {
  assertNoLinkComponents(path, label);
  const lstat = lstatSync(path);
  assert(lstat.isFile() && !lstat.isSymbolicLink(), `${label} is not a regular non-link file.`);
  const stat = statSync(path);
  assert(stat.isFile(), `${label} is not a regular file after stat.`);
  assert(typeof stat.nlink === "number" && Number.isInteger(stat.nlink) && stat.nlink >= 1, `${label} hard-link count is unobservable.`);
  assert(stat.nlink === 1, `${label} is hard-linked.`);
  return readFileSync(path);
}
function isJsonWhitespace(character) { return character === " " || character === "\n" || character === "\r" || character === "\t"; }
function assertNoDuplicateJsonKeys(text, label) {
  let index = 0;
  const skipWhitespace = () => { while (index < text.length && isJsonWhitespace(text[index])) index += 1; };
  const expect = (character, message) => { assert(text[index] === character, `${label} ${message}`); index += 1; };
  const parseString = () => {
    assert(text[index] === "\"", `${label} contains an invalid JSON string.`);
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "\"") {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); }
        catch (error) { fail(`${label} contains an invalid JSON string: ${error.message}`); }
      }
      if (character === "\\") {
        index += 1;
        assert(index < text.length, `${label} contains an unterminated JSON escape.`);
        const escape = text[index];
        assert('"\\/bfnrtu'.includes(escape), `${label} contains an invalid JSON escape.`);
        if (escape === "u") {
          assert(index + 4 < text.length, `${label} contains a truncated JSON unicode escape.`);
          for (let offset = 1; offset <= 4; offset += 1) assert(/[0-9a-fA-F]/.test(text[index + offset]), `${label} contains an invalid JSON unicode escape.`);
          index += 5;
        } else index += 1;
        continue;
      }
      assert(character.charCodeAt(0) >= 0x20, `${label} contains an unescaped control character.`);
      index += 1;
    }
    fail(`${label} contains an unterminated JSON string.`);
  };
  const parseValue = () => {
    skipWhitespace();
    const character = text[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") { index += 1; return; }
      while (true) {
        skipWhitespace();
        const key = parseString();
        assert(!keys.has(key), `${label} contains a duplicate JSON key: ${key}.`);
        keys.add(key);
        skipWhitespace();
        expect(":", "contains an object key without a colon.");
        parseValue();
        skipWhitespace();
        if (text[index] === "}") { index += 1; return; }
        expect(",", "contains an object member without a comma.");
      }
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") { index += 1; return; }
      while (true) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") { index += 1; return; }
        expect(",", "contains an array member without a comma.");
      }
    }
    if (character === "\"") { parseString(); return; }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) { index += literal.length; return; }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    assert(number !== null, `${label} contains an invalid JSON value.`);
    index += number[0].length;
  };
  parseValue();
  skipWhitespace();
  assert(index === text.length, `${label} contains trailing JSON data.`);
}
function parseCanonicalJsonBytes(bytes, label) {
  assert(Buffer.isBuffer(bytes), `${label} must be read as bytes.`);
  assert(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM.`);
  assert(!bytes.includes(0), `${label} must not contain a NUL byte.`);
  const text = bytes.toString("utf8");
  assert(Buffer.from(text, "utf8").equals(bytes), `${label} is not valid UTF-8.`);
  assertNoDuplicateJsonKeys(text, label);
  let value;
  try { value = JSON.parse(text); }
  catch (error) { fail(`${label} must be valid JSON: ${error.message}`); }
  assert(`${JSON.stringify(value, null, 2)}\n` === text, `${label} must use canonical UTF-8 JSON.`);
  return value;
}
function assertBoolean(value, expected, label) { assert(value === expected, `${label} changed.`); }
function validateSourceRecord(record, label) {
  exactKeys(record, ["workspacePath", "sha256"], label);
  assertWorkspaceRelativePath(record.workspacePath, `${label}.workspacePath`);
  assertHex(record.sha256, 64, `${label}.sha256`);
}
function validateManifest(manifest) {
  exactKeys(manifest, [
    "version",
    "kind",
    "recordState",
    "effective",
    "scope",
    "bindingModel",
    "roots",
    "dependencyClosure",
    "expectedGeneratorChecks",
    "nonAuthorizingResult",
    "requiredFinalStatement"
  ], "provenance review manifest");
  assert(manifest.version === 1, "provenance review manifest version changed.");
  assert(manifest.kind === "p3-r5-ordinal3-candidate-provenance-review-manifest", "provenance review manifest kind changed.");
  assert(manifest.recordState === "review-only" && manifest.effective === false, "provenance review manifest authorization state changed.");
  exactKeys(manifest.scope, ["workspaceOnly", "candidateValidationOnly", "externalP3ArtifactReads", "externalP3ArtifactWrites", "runtimeExecution"], "provenance review manifest scope");
  exact(manifest.scope, {
    workspaceOnly: true,
    candidateValidationOnly: true,
    externalP3ArtifactReads: false,
    externalP3ArtifactWrites: false,
    runtimeExecution: false
  }, "provenance review manifest scope");
  exactKeys(manifest.bindingModel, ["manifestPinsVerifier", "verifierPinsManifestSha256", "reason"], "provenance review binding model");
  exact(manifest.bindingModel, {
    manifestPinsVerifier: false,
    verifierPinsManifestSha256: true,
    reason: "The verifier is intentionally excluded from this manifest to avoid a self-hash cycle."
  }, "provenance review binding model");
  exactKeys(manifest.roots, ["candidateDesign", "candidateDryRunGenerator"], "provenance review roots");
  validateSourceRecord(manifest.roots.candidateDesign, "candidate design root");
  validateSourceRecord(manifest.roots.candidateDryRunGenerator, "candidate generator root");
  assert(manifest.roots.candidateDesign.workspacePath === CANDIDATE_DESIGN_WORKSPACE_PATH, "candidate design root path changed.");
  assert(manifest.roots.candidateDryRunGenerator.workspacePath === CANDIDATE_GENERATOR_WORKSPACE_PATH, "candidate generator root path changed.");
  exactKeys(manifest.dependencyClosure, ["uniqueWorkspaceInputCountExcludingRoots", "allFilesAreWorkspaceRelativeRegularNonLinkFiles", "files"], "provenance review dependency closure");
  assert(Number.isInteger(manifest.dependencyClosure.uniqueWorkspaceInputCountExcludingRoots) && manifest.dependencyClosure.uniqueWorkspaceInputCountExcludingRoots >= 0, "dependency closure count is invalid.");
  assertBoolean(manifest.dependencyClosure.allFilesAreWorkspaceRelativeRegularNonLinkFiles, true, "dependency closure file policy");
  assert(Array.isArray(manifest.dependencyClosure.files), "dependency closure files must be an array.");
  assert(manifest.dependencyClosure.files.length === manifest.dependencyClosure.uniqueWorkspaceInputCountExcludingRoots, "dependency closure count does not match files.");
  const sourceRecords = [
    { ...manifest.roots.candidateDesign, role: "candidate-design" },
    { ...manifest.roots.candidateDryRunGenerator, role: "candidate-generator" }
  ];
  const paths = new Set(sourceRecords.map((record) => record.workspacePath));
  for (const [index, record] of manifest.dependencyClosure.files.entries()) {
    validateSourceRecord(record, `dependency closure file ${index}`);
    assert(!paths.has(record.workspacePath), `dependency closure contains a duplicate or root path: ${record.workspacePath}.`);
    paths.add(record.workspacePath);
    sourceRecords.push({ ...record, role: "dependency" });
  }
  validateExpectedGeneratorChecks(manifest.expectedGeneratorChecks);
  validateNonAuthorizingResult(manifest.nonAuthorizingResult);
  assert(manifest.requiredFinalStatement === "This is a workspace-only review of candidate bytes and deterministic dry-run output. It reads no external P-3 artifact, creates no runtime, and authorizes no publication, delivery, launch, implementation, return, measurement, gate, or P-11 change.", "required final statement changed.");
  return sourceRecords;
}
function validateExpectedGeneratorChecks(expected) {
  exactKeys(expected, ["syntaxCheck", "selfTest", "dryRun"], "expected generator checks");
  assertBoolean(expected.syntaxCheck, true, "expected syntax check");
  exactKeys(expected.selfTest, [
    "schema",
    "status",
    "externalWritesPerformed",
    "roleDeliveryPerformed",
    "roleLaunchPerformed",
    "implementationPerformed",
    "returnCheckOrApplyPerformed",
    "browserOrFigmaMeasurementPerformed",
    "p11Changed",
    "checks"
  ], "expected generator self-test");
  assert(expected.selfTest.schema === "p3-r5-pair-reissue-3-candidate-self-test/v1", "expected generator self-test schema changed.");
  assert(expected.selfTest.status === "pass-workspace-only-no-external-action", "expected generator self-test status changed.");
  for (const field of ["externalWritesPerformed", "roleDeliveryPerformed", "roleLaunchPerformed", "implementationPerformed", "returnCheckOrApplyPerformed", "browserOrFigmaMeasurementPerformed", "p11Changed"]) {
    assertBoolean(expected.selfTest[field], false, `expected generator self-test ${field}`);
  }
  assert(Array.isArray(expected.selfTest.checks) && expected.selfTest.checks.length > 0 && expected.selfTest.checks.every((item) => typeof item === "string" && item.length > 0), "expected generator self-test checks are invalid.");
  assert(new Set(expected.selfTest.checks).size === expected.selfTest.checks.length, "expected generator self-test checks are duplicated.");
  exactKeys(expected.dryRun, [
    "schema",
    "status",
    "mode",
    "externalWritesPerformed",
    "roleDeliveryPerformed",
    "roleLaunchPerformed",
    "externalPredecessorArtifactsReadByDryRun",
    "externalPredecessorArtifactsModifiedByDryRun",
    "freshDestinationAbsenceVerifiedByDryRun",
    "canonicalCandidateSha256",
    "actionsPermittedByThisDryRun"
  ], "expected generator dry-run");
  exact(expected.dryRun, {
    schema: "p3-r5-pair-reissue-3-candidate/v2",
    status: "dry-run-pass-not-published",
    mode: "workspace-only-read-only-dry-run",
    externalWritesPerformed: false,
    roleDeliveryPerformed: false,
    roleLaunchPerformed: false,
    externalPredecessorArtifactsReadByDryRun: false,
    externalPredecessorArtifactsModifiedByDryRun: false,
    freshDestinationAbsenceVerifiedByDryRun: false,
    canonicalCandidateSha256: expected.dryRun.canonicalCandidateSha256,
    actionsPermittedByThisDryRun: []
  }, "expected generator dry-run boundary");
  assertHex(expected.dryRun.canonicalCandidateSha256, 64, "expected generator dry-run canonical candidate SHA-256");
}
function validateNonAuthorizingResult(result) {
  exactKeys(result, [
    "candidatePublicationAuthorized",
    "roleDeliveryAuthorized",
    "roleLaunchAuthorized",
    "implementationAuthorized",
    "returnCheckAuthorized",
    "returnApplyAuthorized",
    "measurementAuthorized",
    "accessibilityAuthorized",
    "motionAuthorized",
    "gateAuthorized",
    "p11Authorization",
    "providerOrRuntimeProvisioningAuthorized",
    "actionsPermittedByThisVerification"
  ], "non-authorizing result");
  for (const field of [
    "candidatePublicationAuthorized",
    "roleDeliveryAuthorized",
    "roleLaunchAuthorized",
    "implementationAuthorized",
    "returnCheckAuthorized",
    "returnApplyAuthorized",
    "measurementAuthorized",
    "accessibilityAuthorized",
    "motionAuthorized",
    "gateAuthorized",
    "providerOrRuntimeProvisioningAuthorized"
  ]) assertBoolean(result[field], false, `non-authorizing result ${field}`);
  assert(result.p11Authorization === "NOT_AUTHORIZED", "non-authorizing result P-11 state changed.");
  exact(result.actionsPermittedByThisVerification, [], "non-authorizing result permitted actions");
}
function loadManifest() {
  const manifestPath = assertWorkspaceRelativePath(MANIFEST_WORKSPACE_PATH, "provenance review manifest path");
  assert(manifestPath === MANIFEST_PATH, "provenance review manifest resolved path changed.");
  const bytes = readRegular(manifestPath, "provenance review manifest");
  assert(sha256(bytes) === EXPECTED_MANIFEST_SHA256, "provenance review manifest byte pin changed.");
  return { bytes, value: parseCanonicalJsonBytes(bytes, "provenance review manifest") };
}
function hashVerifierSource(phase) {
  const expectedPath = assertWorkspaceRelativePath(VERIFIER_WORKSPACE_PATH, `${phase} verifier path`);
  assert(resolve(VERIFIER_PATH) === expectedPath, `${phase} verifier was not started from its fixed workspace path.`);
  const bytes = readRegular(expectedPath, `${phase} verifier source`);
  return sha256(bytes);
}
function hashSources(sourceRecords, phase) {
  const records = [{
    role: "manifest",
    workspacePath: MANIFEST_WORKSPACE_PATH,
    sha256: EXPECTED_MANIFEST_SHA256
  }, ...sourceRecords];
  return records.map((record) => {
    const path = assertWorkspaceRelativePath(record.workspacePath, `${phase} ${record.role} path`);
    const bytes = readRegular(path, `${phase} ${record.role} ${record.workspacePath}`);
    const actualSha256 = sha256(bytes);
    assert(actualSha256 === record.sha256, `${phase} ${record.role} ${record.workspacePath} byte pin changed.`);
    // The candidate design is an executable input and the manifest is the
    // verifier's authority boundary, so both must be canonical JSON. Other
    // closure entries are byte-pinned evidence/schemas: some intentionally
    // preserve noncanonical historical bytes, which must be verified rather
    // than normalized or reserialized here.
    if ([MANIFEST_WORKSPACE_PATH, CANDIDATE_DESIGN_WORKSPACE_PATH].includes(record.workspacePath)) {
      parseCanonicalJsonBytes(bytes, `${phase} ${record.role} ${record.workspacePath}`);
    }
    return { role: record.role, workspacePath: record.workspacePath, sha256: actualSha256 };
  });
}
function assertStableSourceHashes(before, after) {
  exact(after, before, "source closure hashes changed while candidate generator ran");
}
function childEnvironment() {
  const env = { ...process.env };
  for (const name of ["NODE_OPTIONS", "NODE_PATH", "NODE_REPL_EXTERNAL_MODULE", "NODE_V8_COVERAGE", "NODE_COMPILE_CACHE"]) delete env[name];
  return env;
}
function resultBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  return Buffer.alloc(0);
}
function runCandidateGenerator(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: WORKSPACE_ROOT,
    env: childEnvironment(),
    encoding: "buffer",
    shell: false,
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024
  });
  assert(!result.error, `${label} could not start: ${result.error?.message ?? "unknown error"}`);
  assert(result.signal === null, `${label} was terminated by ${result.signal}.`);
  assert(result.status === 0, `${label} failed with exit status ${result.status}.`);
  const stderr = resultBuffer(result.stderr);
  assert(stderr.length === 0, `${label} wrote to stderr: ${stderr.toString("utf8")}`);
  return resultBuffer(result.stdout);
}
function verifyGenerator(manifest, includeSelfTest) {
  const generatorPath = assertWorkspaceRelativePath(manifest.roots.candidateDryRunGenerator.workspacePath, "candidate generator invocation path");
  const syntaxOutput = runCandidateGenerator(["--check", generatorPath], "candidate generator syntax check");
  assert(syntaxOutput.length === 0, "candidate generator syntax check wrote to stdout.");
  let selfTest = null;
  if (includeSelfTest) {
    const selfTestBytes = runCandidateGenerator([generatorPath, "--self-test"], "candidate generator self-test");
    selfTest = parseCanonicalJsonBytes(selfTestBytes, "candidate generator self-test output");
    exact(selfTest, manifest.expectedGeneratorChecks.selfTest, "candidate generator self-test output");
  }
  const firstDryRunBytes = runCandidateGenerator([generatorPath, "--dry-run"], "candidate generator first dry-run");
  const secondDryRunBytes = runCandidateGenerator([generatorPath, "--dry-run"], "candidate generator second dry-run");
  assert(firstDryRunBytes.equals(secondDryRunBytes), "candidate generator dry-run output is not deterministic.");
  const dryRun = parseCanonicalJsonBytes(firstDryRunBytes, "candidate generator dry-run output");
  exactKeys(dryRun, [
    "schema",
    "status",
    "mode",
    "externalWritesPerformed",
    "roleDeliveryPerformed",
    "roleLaunchPerformed",
    "externalPredecessorArtifactsReadByDryRun",
    "externalPredecessorArtifactsModifiedByDryRun",
    "freshDestinationAbsenceVerifiedByDryRun",
    "design",
    "oneTimeRecoveryException",
    "predecessor",
    "plannedPairRuntime",
    "plannedDeliveries",
    "freshDestinationChecksRequiredAtPublication",
    "futureIsolationPrerequisites",
    "launchGate",
    "actionsPermittedByThisDryRun",
    "actionsExplicitlyNotPerformed",
    "sha256"
  ], "candidate generator dry-run output");
  const { sha256: candidateSha256, ...candidate } = dryRun;
  assertHex(candidateSha256, 64, "candidate generator dry-run output SHA-256");
  assert(sha256(canonicalBytes(candidate)) === candidateSha256, "candidate generator dry-run output SHA-256 does not bind its canonical payload.");
  assert(candidateSha256 === manifest.expectedGeneratorChecks.dryRun.canonicalCandidateSha256, "candidate generator dry-run canonical candidate SHA-256 changed.");
  for (const [field, expected] of Object.entries(manifest.expectedGeneratorChecks.dryRun)) {
    if (field === "canonicalCandidateSha256") continue;
    exact(dryRun[field], expected, `candidate generator dry-run ${field}`);
  }
  assert(Array.isArray(dryRun.actionsExplicitlyNotPerformed) && dryRun.actionsExplicitlyNotPerformed.includes("roleDelivery") && dryRun.actionsExplicitlyNotPerformed.includes("roleLaunch") && dryRun.actionsExplicitlyNotPerformed.includes("implementation") && dryRun.actionsExplicitlyNotPerformed.includes("returnCheck") && dryRun.actionsExplicitlyNotPerformed.includes("returnApply") && dryRun.actionsExplicitlyNotPerformed.includes("browserOrFigmaMeasurement") && dryRun.actionsExplicitlyNotPerformed.includes("p11Mutation"), "candidate generator dry-run omits a required non-action declaration.");
  return {
    syntaxCheck: "pass",
    selfTest: includeSelfTest ? "pass" : "not-requested",
    dryRun: {
      deterministic: true,
      canonicalCandidateSha256: candidateSha256,
      actionsPermittedByThisDryRun: dryRun.actionsPermittedByThisDryRun
    }
  };
}
function runVerifierSelfTests() {
  const passed = [];
  const expectRejected = (name, action) => {
    let rejected = false;
    try { action(); }
    catch { rejected = true; }
    assert(rejected, `verifier self-test ${name} did not reject.`);
    passed.push(name);
  };
  expectRejected("manifest-byte-pin", () => assert(sha256(Buffer.from("{}\n", "utf8")) === EXPECTED_MANIFEST_SHA256, "manifest byte pin accepted altered bytes."));
  expectRejected("duplicate-json-key", () => parseCanonicalJsonBytes(Buffer.from('{"x":1,"x":2}\n', "utf8"), "verifier self-test duplicate JSON key"));
  expectRejected("noncanonical-json", () => parseCanonicalJsonBytes(Buffer.from("{\n\n}\n", "utf8"), "verifier self-test noncanonical JSON"));
  expectRejected("workspace-escape", () => assertWorkspaceRelativePath("../outside", "verifier self-test workspace escape"));
  expectRejected("workspace-backslash", () => assertWorkspaceRelativePath("tools\\unsafe", "verifier self-test workspace backslash"));
  return passed;
}
function run(mode) {
  const verifierPreSha256 = hashVerifierSource("pre-run");
  const initialManifest = loadManifest();
  const sourceRecords = validateManifest(initialManifest.value);
  const preHashes = hashSources(sourceRecords, "pre-run");
  const verifierSelfTests = mode === "--self-test" ? runVerifierSelfTests() : [];
  // Both supported modes independently bind all three candidate-generator
  // checks. The verifier's own negative fixtures run only under --self-test.
  const generator = verifyGenerator(initialManifest.value, true);
  const finalManifest = loadManifest();
  exact(finalManifest.value, initialManifest.value, "provenance review manifest changed while candidate generator ran");
  const postHashes = hashSources(sourceRecords, "post-run");
  assertStableSourceHashes(preHashes, postHashes);
  const verifierPostSha256 = hashVerifierSource("post-run");
  assert(verifierPostSha256 === verifierPreSha256, "verifier source changed while candidate generator ran.");
  return {
    schema: RESULT_SCHEMA,
    status: "pass-workspace-only-review-only",
    mode: mode === "--self-test" ? "self-test" : "check",
    externalP3ArtifactReads: false,
    externalP3ArtifactWrites: false,
    runtimeExecution: false,
    manifest: {
      workspacePath: MANIFEST_WORKSPACE_PATH,
      sha256: EXPECTED_MANIFEST_SHA256
    },
    verifierIntegrity: {
      manifestPinsVerifier: false,
      workspacePath: VERIFIER_WORKSPACE_PATH,
      preSha256: verifierPreSha256,
      postSha256: verifierPostSha256,
      stableAcrossGeneratorExecution: true
    },
    sourceClosure: {
      allFilesAreWorkspaceRelativeRegularNonLinkFiles: true,
      canonicalJsonSources: [MANIFEST_WORKSPACE_PATH, CANDIDATE_DESIGN_WORKSPACE_PATH],
      sourceCountIncludingManifest: preHashes.length,
      preHashes,
      postHashes,
      stableAcrossGeneratorExecution: true
    },
    generator,
    verifierSelfTests,
    nonAuthorizingResult: initialManifest.value.nonAuthorizingResult,
    requiredFinalStatement: initialManifest.value.requiredFinalStatement
  };
}
function writeJson(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

try {
  assert(process.argv.length === 3 && ["--check", "--self-test"].includes(process.argv[2]), "Usage: node tools/r5-ordinal3-candidate-provenance-review-verify.mjs --check|--self-test");
  writeJson(run(process.argv[2]));
} catch (error) {
  writeJson({
    schema: RESULT_SCHEMA,
    status: "fail-workspace-only-review-only",
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
}
