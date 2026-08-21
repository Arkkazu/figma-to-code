#!/usr/bin/env node
// p3-page-provider.mjs — P-3 comparison専用のhermetic static page provider。
// 既起動の開発serverを信用せず、P-3親が管理するloopback serverだけを使う。

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

// P-3 serves an immutable local snapshot, not an application server. Keep
// ordinary inline HTML/CSS/JS usable for visual measurement, while preventing
// the document from bringing a worker, child document, popup, or remote input
// into the measured browser session. The provider identity is carried only in
// response headers; never alter the frozen HTML bytes to add DOM markers.
const STATIC_CSP = Object.freeze([
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  // Chrome must refuse WebRTC/STUN/DataChannel transport even when page code
  // catches the resulting exception. The P-3 CDP trace adds an early runtime
  // guard as a fail-closed fallback for engines that do not implement this
  // CSP Level 3 directive.
  "webrtc 'block'",
  "child-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "manifest-src 'none'",
  "prefetch-src 'none'",
  "navigate-to 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // No allow-popups token: CSP sandbox blocks auxiliary browsing contexts.
  "sandbox allow-scripts allow-same-origin",
].join("; "));

function staticSecurityHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": STATIC_CSP,
    "X-Content-Type-Options": "nosniff",
  };
}

function fail(message) {
  throw new Error(`P3 PAGE PROVIDER: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function stableHash(value) {
  return sha256(JSON.stringify(stable(value)));
}

// APFS is case-insensitive by default. Conservatively using case-insensitive
// boundary comparison for every Darwin host prevents a case variant from
// escaping the P-3 workspace/provider boundary. A case-sensitive APFS volume
// may reject an otherwise distinct path, which is intentional fail-closed
// behavior for this draft contract.
export function p3UsesCaseInsensitivePathComparison(platform = process.platform) {
  return platform === "win32" || platform === "darwin";
}

export function p3CanonicalPath(pathname, platform = process.platform) {
  const value = normalize(resolve(pathname)).replace(/\\/g, "/");
  return p3UsesCaseInsensitivePathComparison(platform) ? value.toLowerCase() : value;
}

export function p3PathWithin(base, candidate, platform = process.platform) {
  const normalizedBase = p3CanonicalPath(base, platform);
  const normalizedCandidate = p3CanonicalPath(candidate, platform);
  return normalizedCandidate === normalizedBase || normalizedCandidate.startsWith(`${normalizedBase}/`);
}

function canonical(pathname) { return p3CanonicalPath(pathname); }
function within(base, candidate) { return p3PathWithin(base, candidate); }

export function p3RelativeWithin(base, candidate, platform = process.platform) {
  const normalizedBase = p3CanonicalPath(base, platform);
  const normalizedCandidate = p3CanonicalPath(candidate, platform);
  if (normalizedCandidate === normalizedBase) return "";
  if (!normalizedCandidate.startsWith(`${normalizedBase}/`)) fail(`path is outside its declared root: ${candidate}`);
  return normalizedCandidate.slice(normalizedBase.length + 1);
}

function relativeWithin(base, candidate) { return p3RelativeWithin(base, candidate); }

function string(value, label, min = 1) {
  if (typeof value !== "string" || value.trim().length < min) fail(`${label} must be a string of at least ${min} characters`);
  return value.trim();
}

function workspaceAndOutput({ workspaceRoot, outputRoot }) {
  const workspace = string(workspaceRoot, "workspaceRoot", 1);
  const output = string(outputRoot, "outputRoot", 1);
  const workspaceAbsolute = resolve(workspace);
  const outputAbsolute = isAbsolute(output) ? resolve(output) : resolve(workspaceAbsolute, output);
  if (!within(workspaceAbsolute, outputAbsolute) || canonical(workspaceAbsolute) === canonical(outputAbsolute)) {
    fail("outputRoot must be a strict descendant of workspaceRoot");
  }
  // lstat(outputRoot) alone cannot detect `workspace/link/output`, because the
  // final directory is real while an ancestor is a symlink. Every segment below
  // the declared worktree is part of the hermetic bundle boundary.
  const segments = relativeWithin(workspaceAbsolute, outputAbsolute).split("/").filter(Boolean);
  let cursor = workspaceAbsolute;
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    let segmentStat;
    try { segmentStat = lstatSync(cursor); }
    catch (error) { fail(`could not inspect outputRoot ancestor ${cursor}: ${error.message}`); }
    if (segmentStat.isSymbolicLink()) fail(`outputRoot must not traverse a symbolic link: ${relative(workspaceAbsolute, cursor)}`);
  }
  let stat;
  try { stat = lstatSync(outputAbsolute); }
  catch (error) { fail(`outputRoot does not exist: ${outputAbsolute} (${error.message})`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("outputRoot must be a real directory, not a symlink or special file");
  return { workspaceRoot: workspaceAbsolute, outputRoot: outputAbsolute };
}

function relativeBundlePath(outputRoot, pathname) {
  const path = relative(outputRoot, pathname).split(sep).join("/");
  if (!path || path.startsWith("../") || path === "..") fail(`bundle entry escaped outputRoot: ${pathname}`);
  return path;
}

function walkBundle(outputRoot, directory, entries) {
  let children;
  try { children = readdirSync(directory, { withFileTypes: true }); }
  catch (error) { fail(`could not enumerate static bundle directory ${directory}: ${error.message}`); }
  children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    const pathname = resolve(directory, child.name);
    if (!within(outputRoot, pathname)) fail(`bundle entry escaped outputRoot: ${pathname}`);
    let stat;
    try { stat = lstatSync(pathname); }
    catch (error) { fail(`could not inspect static bundle entry ${pathname}: ${error.message}`); }
    if (stat.isSymbolicLink()) fail(`static bundle must not contain a symbolic link: ${relativeBundlePath(outputRoot, pathname)}`);
    if (stat.isDirectory()) {
      walkBundle(outputRoot, pathname, entries);
      continue;
    }
    if (!stat.isFile()) fail(`static bundle must not contain a non-regular file: ${relativeBundlePath(outputRoot, pathname)}`);
    let bytes;
    try { bytes = readFileSync(pathname); }
    catch (error) { fail(`could not read static bundle file ${pathname}: ${error.message}`); }
    entries.push({ path: relativeBundlePath(outputRoot, pathname), size: bytes.length, sha256: sha256(bytes) });
  }
}

/**
 * Hash every regular resource in a static build output. The root path is intentionally
 * excluded from the Merkle input so the identical A/B bundle has the same digest in
 * separate clean worktrees.
 */
export function collectStaticBundle(options) {
  const roots = workspaceAndOutput(options ?? {});
  const entries = [];
  walkBundle(roots.outputRoot, roots.outputRoot, entries);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  if (!entries.length) fail("static bundle must contain at least one regular file");
  return {
    version: 1,
    kind: "hermetic-static-v1",
    outputRoot: relativeWithin(roots.workspaceRoot, roots.outputRoot),
    entries,
    merkleRoot: stableHash(entries),
  };
}

/** Reject any mutation, symlink, or special file after a previously frozen bundle was read. */
export function assertStaticBundle(options, expected) {
  if (!expected || typeof expected !== "object" || expected.version !== 1 || expected.kind !== "hermetic-static-v1") {
    fail("expected static bundle must be a hermetic-static-v1 bundle receipt");
  }
  const actual = collectStaticBundle(options);
  if (actual.outputRoot !== expected.outputRoot || actual.merkleRoot !== expected.merkleRoot || stableHash(actual.entries) !== stableHash(expected.entries)) {
    fail("static bundle changed after its Merkle root was frozen");
  }
  return actual;
}

// The provider must serve the same bytes for every Q-09/Q-13/Q-08 navigation.
// Reading from outputRoot on each request would allow a build or a malicious page
// process to replace a later measurement while retaining only its final Merkle root.
function snapshotStaticBundle(roots, bundle) {
  const files = new Map();
  for (const entry of bundle.entries) {
    const pathname = resolve(roots.outputRoot, entry.path);
    if (!within(roots.outputRoot, pathname)) fail(`bundle snapshot escaped outputRoot: ${entry.path}`);
    let stat;
    try { stat = lstatSync(pathname); }
    catch (error) { fail(`could not inspect static snapshot file ${entry.path}: ${error.message}`); }
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`static snapshot file is not a regular non-symlink: ${entry.path}`);
    let bytes;
    try { bytes = readFileSync(pathname); }
    catch (error) { fail(`could not read static snapshot file ${entry.path}: ${error.message}`); }
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) fail(`static snapshot file changed while it was being frozen: ${entry.path}`);
    files.set(entry.path, bytes);
  }
  return files;
}

function verifyUrl(value) {
  let url;
  try { url = new URL(string(value, "verifyUrl", 8)); }
  catch (error) { fail(`verifyUrl is not a valid URL: ${error.message}`); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.hash) {
    fail("hermetic-static-v1 requires an exact http://127.0.0.1:<port>/... verifyUrl without credentials or hash");
  }
  if (!/^[1-9][0-9]{0,4}$/.test(url.port) || Number(url.port) > 65535) fail("verifyUrl port is invalid");
  return url;
}

function markerToken(value) {
  const normalized = string(value, "marker", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) fail("marker must be a 256-bit hexadecimal value");
  return normalized;
}

function entryPath(value, outputRoot) {
  const input = string(value ?? "index.html", "entryPath", 1).replace(/\\/g, "/");
  if (input.startsWith("/") || input.split("/").some((part) => !part || part === "." || part === "..")) fail("entryPath must be a non-empty output-root-relative regular-file path");
  const absolute = resolve(outputRoot, input);
  if (!within(outputRoot, absolute)) fail("entryPath escapes outputRoot");
  let stat;
  try { stat = lstatSync(absolute); }
  catch (error) { fail(`entryPath does not exist: ${input} (${error.message})`); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail("entryPath must be a regular non-symlink file");
  return { path: input, absolute };
}

function decodedPath(pathname) {
  if (/%2f|%5c/i.test(pathname)) fail("request path must not contain encoded path separators");
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { fail("request path has invalid percent encoding"); }
  if (!decoded.startsWith("/") || decoded.includes("\\") || decoded.split("/").some((part) => part === ".." || part === ".")) fail("request path traversal is not allowed");
  return decoded;
}

function mimeFor(pathname) {
  const index = pathname.lastIndexOf(".");
  return index >= 0 ? (MIME[pathname.slice(index).toLowerCase()] ?? "application/octet-stream") : "application/octet-stream";
}

function bundlePathForRequest(pathname, routePath, entry) {
  if (pathname === routePath) return entry.path;
  const base = routePath.endsWith("/") ? routePath : routePath.slice(0, routePath.lastIndexOf("/") + 1);
  const mounted = base !== "/" && pathname.startsWith(base) ? pathname.slice(base.length) : pathname.slice(1);
  const path = mounted.replace(/^\/+/, "");
  if (!path || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) fail("requested static resource has an invalid bundle-relative path");
  return path;
}

/**
 * Start a P-3-owned static server. It binds only to the exact loopback URL supplied
 * by the frozen gate manifest. Identity evidence is supplied by response headers;
 * every response body is served byte-for-byte from the launch-time snapshot.
 */
export async function startHermeticStaticProvider(options) {
  options = options ?? {};
  const roots = workspaceAndOutput(options);
  const target = verifyUrl(options.verifyUrl);
  const marker = markerToken(options.nonce ?? randomBytes(32).toString("hex"));
  const entry = entryPath(options.entryPath, roots.outputRoot);
  const bundle = collectStaticBundle(roots);
  const snapshot = snapshotStaticBundle(roots, bundle);
  const entryBytes = snapshot.get(entry.path);
  if (!entryBytes) fail("entryPath is absent from the frozen static bundle snapshot");
  const entrySha256 = sha256(entryBytes);
  const routePath = target.pathname;
  let closed = false;
  const server = createServer((request, response) => {
    try {
      if (closed) { response.writeHead(503, staticSecurityHeaders()); response.end(); return; }
      if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405, { ...staticSecurityHeaders(), Allow: "GET, HEAD" }); response.end(); return; }
      const requestUrl = new URL(request.url ?? "/", target);
      const pathname = decodedPath(requestUrl.pathname);
      const bundlePath = bundlePathForRequest(pathname, routePath, entry);
      const original = snapshot.get(bundlePath);
      if (!original) fail(`requested static resource is absent from the frozen bundle snapshot: ${bundlePath}`);
      const type = mimeFor(bundlePath);
      const body = original;
      response.writeHead(200, {
        ...staticSecurityHeaders(),
        "Content-Length": String(body.length),
        "Content-Type": type,
        "X-Figma-P3-Provider": marker,
        "X-Figma-P3-Entry-Sha256": entrySha256,
        "X-Figma-P3-Bundle-Sha256": bundle.merkleRoot,
      });
      if (request.method === "GET") response.end(body); else response.end();
    } catch (error) {
      response.writeHead(404, { ...staticSecurityHeaders(), "Content-Type": "text/plain; charset=utf-8" });
      response.end(`P3 static provider rejected this request: ${error.message}`);
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: "127.0.0.1", port: Number(target.port), exclusive: true }, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return {
    version: 1,
    kind: "hermetic-static-v1",
    verifyUrl: target.href,
    workspaceRoot: canonical(roots.workspaceRoot),
    outputRoot: bundle.outputRoot,
    entryPath: entry.path,
    providerPid: process.pid,
    marker,
    bundle,
    entrySha256,
    async assertBundleUnchanged() { return assertStaticBundle(roots, bundle); },
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    },
  };
}

function cliPath(value, label) {
  const input = string(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(`${label} must be repository-relative`);
  return input;
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === "bundle") {
    if (argv.length !== 1) fail("Usage: node p3-page-provider.mjs bundle <output-root>");
    process.stdout.write(`${JSON.stringify(collectStaticBundle({ workspaceRoot: process.cwd(), outputRoot: cliPath(argv[0], "output-root") }))}\n`);
    return;
  }
  if (command === "serve") {
    if (argv.length !== 4) fail("Usage: node p3-page-provider.mjs serve <verify-url> <output-root> <entry-path> <nonce>");
    const provider = await startHermeticStaticProvider({ workspaceRoot: process.cwd(), verifyUrl: argv[0], outputRoot: cliPath(argv[1], "output-root"), entryPath: cliPath(argv[2], "entry-path"), nonce: argv[3] });
    process.stdout.write(`${JSON.stringify({ version: provider.version, kind: provider.kind, verifyUrl: provider.verifyUrl, workspaceRoot: provider.workspaceRoot, outputRoot: provider.outputRoot, entryPath: provider.entryPath, providerPid: provider.providerPid, marker: provider.marker, bundle: provider.bundle })}\n`);
    const stop = async () => { try { await provider.close(); } finally { process.exitCode = 0; } };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    await new Promise(() => {});
  }
  fail("Usage: node p3-page-provider.mjs <bundle|serve> ...");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
