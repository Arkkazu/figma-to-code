#!/usr/bin/env node
// Isolated regression coverage for the P-3 hermetic static page provider.

import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { navigateAndWait, startCdpBrowser } from "./cdp-browser.mjs";

const providerModule = await import(pathToFileURL(resolve("templates/verify/p3-page-provider.mjs")).href);
const { assertStaticBundle, collectStaticBundle, startHermeticStaticProvider } = providerModule;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function put(root, pathname, value) {
  const target = join(root, pathname);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, "utf8");
}

async function port() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: "127.0.0.1", port: 0 }, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not allocate an isolated loopback port");
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  return address.port;
}

async function listen(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not allocate an isolated loopback server port");
  return address.port;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

async function expectFailure(label, expected, callback) {
  try {
    await callback();
  } catch (error) {
    if (String(error.message).includes(expected)) return;
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${error.stack || error.message}`);
  }
  throw new Error(`${label}: expected failure containing ${JSON.stringify(expected)}`);
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes, text: bytes.toString("utf8") };
}

async function rawLoopbackRequest(port, path) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({ host: "127.0.0.1", port, method: "GET", path }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", rejectRequest);
      response.once("end", () => {
        const bytes = Buffer.concat(chunks);
        resolveRequest({ response, bytes, text: bytes.toString("utf8") });
      });
    });
    request.once("error", rejectRequest);
    request.end();
  });
}

function cspDirectives(header) {
  if (typeof header !== "string" || !header.trim()) throw new Error("provider response is missing Content-Security-Policy");
  const directives = new Map();
  for (const raw of header.split(";")) {
    const value = raw.trim();
    if (!value) continue;
    const [name, ...tokens] = value.split(/\s+/);
    if (directives.has(name)) throw new Error(`provider response repeats CSP directive ${name}`);
    directives.set(name, tokens.join(" "));
  }
  return directives;
}

function requireCspDirective(directives, name, expected) {
  if (directives.get(name) !== expected) {
    throw new Error(`provider CSP ${name} must be ${JSON.stringify(expected)}, got ${JSON.stringify(directives.get(name))}`);
  }
}

const root = mkdtempSync(join(tmpdir(), "p3-page-provider-e2e-"));
let provider;
try {
  const output = "build/p3";
  const html = "<!doctype html><html><head><title>P3 fixture</title><style>.inline { display: block; }</style><script>globalThis.p3StaticFixture = true;</script><link rel=\"stylesheet\" href=\"assets/site.css\"></head><body><h1>provider</h1></body></html>";
  const css = ".fixture { color: rgb(1 2 3); }\n";
  put(root, `${output}/index.html`, html);
  put(root, `${output}/assets/site.css`, css);
  put(root, "escape.txt", "must never be served outside the frozen output root\n");
  const expectedBundle = collectStaticBundle({ workspaceRoot: root, outputRoot: output });
  if (expectedBundle.entries.length !== 2) throw new Error("fixture bundle did not enumerate both regular files");

  const listenPort = await port();
  const verifyUrl = `http://127.0.0.1:${listenPort}/p3/hero`;
  const marker = "ab".repeat(32);
  provider = await startHermeticStaticProvider({ workspaceRoot: root, outputRoot: output, entryPath: "index.html", verifyUrl, nonce: marker });
  if (provider.verifyUrl !== verifyUrl || provider.bundle.merkleRoot !== expectedBundle.merkleRoot) throw new Error("provider receipt does not bind the frozen URL and static bundle");

  const page = await fetchText(verifyUrl);
  if (page.response.status !== 200 || page.response.headers.get("x-figma-p3-provider") !== marker) throw new Error("provider did not serve the frozen entry through its exact loopback URL");
  const entryHash = sha256(Buffer.from(html, "utf8"));
  if (!page.bytes.equals(Buffer.from(html, "utf8"))) throw new Error("provider altered frozen HTML bytes to add or replace DOM evidence");
  if (page.response.headers.get("x-figma-p3-entry-sha256") !== entryHash || page.response.headers.get("x-figma-p3-bundle-sha256") !== expectedBundle.merkleRoot) throw new Error("provider did not emit the frozen entry and bundle hashes as response headers");
  const csp = cspDirectives(page.response.headers.get("content-security-policy"));
  for (const [name, expected] of Object.entries({
    "default-src": "'self'",
    "base-uri": "'none'",
    "connect-src": "'self'",
    webrtc: "'block'",
    "child-src": "'none'",
    "frame-src": "'none'",
    "worker-src": "'none'",
    "object-src": "'none'",
    "form-action": "'none'",
    "frame-ancestors": "'none'",
    "manifest-src": "'none'",
    "prefetch-src": "'none'",
    "navigate-to": "'self'",
    "script-src": "'self' 'unsafe-inline'",
    "style-src": "'self' 'unsafe-inline'",
    sandbox: "allow-scripts allow-same-origin",
  })) requireCspDirective(csp, name, expected);
  if (/\ballow-popups(?:-to-escape-sandbox)?\b/.test(csp.get("sandbox"))) throw new Error("provider CSP sandbox must not allow popups");
  for (const name of ["img-src", "media-src", "font-src"]) {
    const value = csp.get(name);
    if (!value || /\b(?:https?|wss?):/i.test(value)) throw new Error(`provider CSP ${name} permits an external origin`);
  }
  put(root, `${output}/assets/site.css`, ".fixture { color: rgb(9 8 7); }\n");
  const asset = await fetchText(`http://127.0.0.1:${listenPort}/p3/assets/site.css`);
  if (asset.response.status !== 200 || asset.text !== css || !asset.response.headers.get("content-type")?.startsWith("text/css") || asset.response.headers.get("content-security-policy") !== page.response.headers.get("content-security-policy")) throw new Error("provider did not serve a regular static resource unchanged with the same hermetic policy");

  const traversal = await rawLoopbackRequest(listenPort, "/%2e%2e/%2e%2e/escape.txt");
  if (traversal.response.statusCode !== 404 || traversal.text.includes("must never be served outside")) throw new Error(`encoded traversal request escaped the frozen output root: ${traversal.response.statusCode} ${JSON.stringify(traversal.text)}`);
  const separatorTraversal = await rawLoopbackRequest(listenPort, "/assets%2fsite.css");
  if (separatorTraversal.response.statusCode !== 404 || !separatorTraversal.text.includes("encoded path separators")) throw new Error("encoded separator request was not rejected");

  await expectFailure("external verify URL", "requires an exact http://127.0.0.1", async () => {
    await startHermeticStaticProvider({ workspaceRoot: root, outputRoot: output, entryPath: "index.html", verifyUrl: "http://localhost:32123/p3/hero", nonce: marker });
  });
  await expectFailure("output traversal", "strict descendant", async () => {
    collectStaticBundle({ workspaceRoot: root, outputRoot: "../outside" });
  });
  const pageControlledEvidence = "<!doctype html><html><head><meta name=figma-p3-provider content=forged><meta name=figma-p3&#45;entry-sha256 content=forged></head><body>page controlled</body></html>";
  put(root, "build/p3-reserved/index.html", pageControlledEvidence);
  const reservedPort = await port();
  const reserved = await startHermeticStaticProvider({ workspaceRoot: root, outputRoot: "build/p3-reserved", entryPath: "index.html", verifyUrl: `http://127.0.0.1:${reservedPort}/p3/reserved`, nonce: marker });
  try {
    const response = await fetchText(`http://127.0.0.1:${reservedPort}/p3/reserved`);
    if (response.response.status !== 200 || !response.bytes.equals(Buffer.from(pageControlledEvidence, "utf8"))) throw new Error("provider did not preserve page-controlled meta markup without injecting competing DOM evidence");
    if (response.response.headers.get("x-figma-p3-provider") !== marker) throw new Error("page-controlled meta markup replaced the provider response-header identity");
  } finally {
    await reserved.close();
  }

  let externalInputRequests = 0;
  const externalInput = createServer((request, response) => {
    externalInputRequests += 1;
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ external: true, path: request.url }));
  });
  let cspProvider = null;
  let cspBrowser = null;
  try {
    const externalPort = await listen(externalInput);
    const externalInputUrl = `http://127.0.0.1:${externalPort}/external-input.json`;
    const cspOutput = "build/p3-csp";
    const workerScript = 'postMessage("worker-executed");\n';
    const cspHtml = `<!doctype html><html><head><title>P3 CSP fixture</title></head><body><div id="ready">ready</div><script>
window.__p3CspProbe = (async () => {
  const worker = await new Promise((resolveProbe) => {
    let settled = false;
    let candidate = null;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      if (candidate) candidate.terminate();
      resolveProbe({ state });
    };
    try {
      candidate = new Worker("worker.js");
      candidate.addEventListener("message", () => finish("executed"));
      candidate.addEventListener("error", () => finish("blocked"));
      setTimeout(() => finish("timeout"), 1000);
    } catch {
      finish("blocked");
    }
  });
  let externalFetch;
  try {
    const response = await fetch(${JSON.stringify(externalInputUrl)}, { mode: "cors" });
    externalFetch = { state: "resolved", status: response.status };
  } catch {
    externalFetch = { state: "blocked" };
  }
    return { worker, externalFetch };
})();
</script></body></html>`;
    put(root, `${cspOutput}/index.html`, cspHtml);
    put(root, `${cspOutput}/worker.js`, workerScript);
    const cspPort = await port();
    const cspVerifyUrl = `http://127.0.0.1:${cspPort}/p3/csp`;
    cspProvider = await startHermeticStaticProvider({ workspaceRoot: root, outputRoot: cspOutput, entryPath: "index.html", verifyUrl: cspVerifyUrl, nonce: marker });
    const workerAsset = await fetchText(`http://127.0.0.1:${cspPort}/p3/worker.js`);
    if (workerAsset.response.status !== 200 || workerAsset.text !== workerScript || !workerAsset.response.headers.get("content-type")?.startsWith("text/javascript")) throw new Error("worker fixture is not a valid same-origin static provider resource");
    cspBrowser = await startCdpBrowser({ initialWidth: 320, initialHeight: 200, scrollbars: "hidden" });
    await navigateAndWait(cspBrowser, { url: cspVerifyUrl, width: 320, height: 200, selectors: ["#ready"] });
    const probe = await cspBrowser.evaluate("window.__p3CspProbe", { awaitPromise: true });
    if (!probe || probe.worker?.state !== "blocked") throw new Error(`provider CSP did not explicitly block a valid same-origin Worker: ${JSON.stringify(probe)}`);
    if (probe.externalFetch?.state !== "blocked") throw new Error(`provider CSP allowed an external fetch to resolve: ${JSON.stringify(probe)}`);
    if (externalInputRequests !== 0) throw new Error(`provider CSP allowed an external request to reach the input server: ${externalInputRequests}`);
  } finally {
    if (cspBrowser) await cspBrowser.close();
    if (cspProvider) await cspProvider.close();
    await closeServer(externalInput);
  }

  const occupied = createServer();
  await new Promise((resolveListen, rejectListen) => {
    occupied.once("error", rejectListen);
    occupied.listen({ host: "127.0.0.1", port: 0 }, resolveListen);
  });
  const occupiedAddress = occupied.address();
  if (!occupiedAddress || typeof occupiedAddress === "string") throw new Error("could not reserve collision port");
  await expectFailure("occupied provider port", "EADDRINUSE", async () => {
    await startHermeticStaticProvider({ workspaceRoot: root, outputRoot: output, entryPath: "index.html", verifyUrl: `http://127.0.0.1:${occupiedAddress.port}/p3/hero`, nonce: marker });
  });
  await new Promise((resolveClose, rejectClose) => occupied.close((error) => error ? rejectClose(error) : resolveClose()));

  const link = join(root, "linked-output");
  try {
    symlinkSync(join(root, output), link, "junction");
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
  }
  if (existsSync(link)) {
    await expectFailure("symlink output root", "must not traverse a symbolic link", async () => {
      collectStaticBundle({ workspaceRoot: root, outputRoot: "linked-output" });
    });
  }

  await expectFailure("post-freeze mutation", "changed after its Merkle root was frozen", async () => {
    await provider.assertBundleUnchanged();
  });
  await expectFailure("direct post-freeze mutation", "changed after its Merkle root was frozen", async () => {
    assertStaticBundle({ workspaceRoot: root, outputRoot: output }, expectedBundle);
  });

  console.log("p3-page-provider E2E PASS");
} finally {
  if (provider) await provider.close();
  rmSync(root, { recursive: true, force: true });
}
