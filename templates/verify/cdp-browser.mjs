import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Chromeはrenderer / GPU / utilityを子プロセスとして立てる。Windowsは子プロセスを
// 親に紐づけないため、launcherだけをkillすると残りが孤児として生き残る。検証を回すたびに
// 積み上がり、最終的にページ遷移がタイムアウトするまでマシンを圧迫する。
// taskkill /T でプロセスツリーごと落とす。
function killBrowserTree(chrome) {
  if (chrome.killed || chrome.exitCode !== null) return;
  if (process.platform === "win32" && chrome.pid) {
    const result = spawnSync("taskkill", ["/pid", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    if (result.status === 0) return;
  }
  chrome.kill();
}

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEFAULT_TIMEOUT_MS = 20000;
// ページ遷移と描画完了の待機は、CDPのプロトコル往復とは別枠にする。
// ローカルのWordPressはHTMLだけで数秒かかることがあり、フォントと画像を含めると
// プロトコル用の20秒では足りずに Page.navigate だけが落ちる。
// 環境差が大きいので上書きできるようにする。値は evidence に残る撮影条件ではなく待機上限なので、
// 大きくしても合否基準は変わらない（遅いページを待てるようになるだけ）。
const NAVIGATION_TIMEOUT_MS = Number.parseInt(process.env.FIGMA_VERIFY_NAV_TIMEOUT_MS ?? "", 10) > 0
  ? Number.parseInt(process.env.FIGMA_VERIFY_NAV_TIMEOUT_MS, 10)
  : 60000;
const POLL_INTERVAL_MS = 50;
// P-3だけが設定する非公開のbrowser拡張。symbolにすることでページ側や通常gateの
// 設定JSONから観測・差し替えできない。navigateAndWaitは同一CDP targetの測定結果だけを
// observerへ渡す。
const P3_NAVIGATION_OBSERVER = Symbol("figma-p3-navigation-observer");
const P3_WEBRTC_SNAPSHOT = Symbol("figma-p3-webrtc-snapshot");

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

export async function waitFor(condition, { timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const value = await condition();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms${lastError ? ` (${lastError.message})` : ""}.`);
}

async function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) rejectPort(error);
        else if (!port) rejectPort(new Error("Could not reserve a DevTools port."));
        else resolvePort(port);
      });
    });
  });
}

async function connectWebSocket(url, timeoutMs) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => rejectOpen(new Error(`Timed out opening CDP WebSocket after ${timeoutMs}ms.`)), timeoutMs);
    socket.onopen = () => {
      clearTimeout(timer);
      resolveOpen();
    };
    socket.onerror = () => {
      clearTimeout(timer);
      rejectOpen(new Error("Could not open CDP WebSocket."));
    };
  });
  return socket;
}

function createClient(socket, timeoutMs) {
  let nextId = 0;
  const pending = new Map();
  const eventListeners = new Map();

  const rejectPending = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (typeof message.method === "string" && !Object.prototype.hasOwnProperty.call(message, "id")) {
      const listeners = [
        ...(eventListeners.get(message.method) ?? []),
        ...(eventListeners.get("*") ?? []),
      ];
      for (const listener of listeners) {
        // CDPの通知処理が例外で止まると、以後の応答待機まで壊れて原因が隠れる。
        // listenerの例外は購読側が保持して、明示的に検証失敗へ変換する。
        try {
          listener(message.params ?? {}, message.method);
        } catch {
          // Event subscriptions must not break the command/response transport.
        }
      }
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;

    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) {
      request.reject(new Error(`${request.method}: ${message.error.message || "CDP error"}`));
    } else {
      request.resolve(message);
    }
  };
  socket.onerror = () => rejectPending(new Error("CDP WebSocket error."));
  socket.onclose = () => rejectPending(new Error("CDP WebSocket closed."));

  // CDPのプロトコル往復と、実ページの読み込みは所要時間の性質が違う。同じ上限を当てると
  // 遅いページで Page.navigate だけが落ちる。呼び出しごとに上限を指定できるようにする。
  const send = (method, params = {}, { timeoutMs: callTimeoutMs = timeoutMs } = {}) =>
    new Promise((resolveRequest, rejectRequest) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`${method} timed out after ${callTimeoutMs}ms.`));
      }, callTimeoutMs);
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer, method });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression, { awaitPromise = false } = {}) => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (response.result?.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.text || "Runtime.evaluate failed.");
    }
    return response.result?.result?.value;
  };

  const onEvent = (method, listener) => {
    if (typeof method !== "string" || method.trim() === "") throw new Error("CDP event method is required.");
    if (typeof listener !== "function") throw new Error("CDP event listener must be a function.");
    const listeners = eventListeners.get(method) ?? new Set();
    listeners.add(listener);
    eventListeners.set(method, listeners);
    return () => {
      const current = eventListeners.get(method);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) eventListeners.delete(method);
    };
  };

  return {
    send,
    evaluate,
    onEvent,
    close() {
      rejectPending(new Error("CDP client closed."));
      eventListeners.clear();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    },
  };
}

function networkTraceFail(message) {
  throw new Error(`CDP NETWORK TRACE: ${message}`);
}

function requiredHttpLoopbackUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    networkTraceFail(`${label} is not a valid URL: ${error.message}`);
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.hash) {
    networkTraceFail(`${label} must be an exact http://127.0.0.1:<port>/... URL without credentials or hash.`);
  }
  return url;
}

function normalizedHeaders(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw)
    .filter(([name]) => typeof name === "string" && name.trim() !== "")
    .map(([name, value]) => [name.trim().toLowerCase(), String(value)])
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function traceUrl(value, label) {
  if (typeof value !== "string" || value.trim() === "") networkTraceFail(`${label} URL is missing.`);
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    networkTraceFail(`${label} URL is invalid: ${value} (${error.message}).`);
  }
  return url;
}

function finiteTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function responseRecord(raw) {
  const response = raw && typeof raw === "object" ? raw : {};
  return {
    url: typeof response.url === "string" ? response.url : null,
    status: typeof response.status === "number" ? response.status : null,
    statusText: typeof response.statusText === "string" ? response.statusText : null,
    mimeType: typeof response.mimeType === "string" ? response.mimeType : null,
    headers: normalizedHeaders(response.headers),
    fromDiskCache: response.fromDiskCache === true,
    fromServiceWorker: response.fromServiceWorker === true,
    fromPrefetchCache: response.fromPrefetchCache === true,
  };
}

function phaseRecordForRequest(phase, params, ordinal) {
  const request = params.request && typeof params.request === "object" ? params.request : {};
  return {
    ordinal,
    requestId: typeof params.requestId === "string" ? params.requestId : null,
    url: typeof request.url === "string" ? request.url : null,
    method: typeof request.method === "string" ? request.method : null,
    resourceType: typeof params.type === "string" ? params.type : null,
    documentUrl: typeof params.documentURL === "string" ? params.documentURL : null,
    frameId: typeof params.frameId === "string" ? params.frameId : null,
    loaderId: typeof params.loaderId === "string" ? params.loaderId : null,
    startedAtCdpSeconds: finiteTimestamp(params.timestamp),
    response: params.redirectResponse ? responseRecord(params.redirectResponse) : null,
    responseFrameId: null,
    responseLoaderId: null,
    completion: params.redirectResponse ? "redirected" : "pending",
    completedAtCdpSeconds: params.redirectResponse ? finiteTimestamp(params.timestamp) : null,
  };
}

function publicPhase(phase) {
  const resources = phase.resources.map((resource) => ({
    ordinal: resource.ordinal,
    requestId: resource.requestId,
    url: resource.url,
    method: resource.method,
    resourceType: resource.resourceType,
    documentUrl: resource.documentUrl,
    frameId: resource.frameId,
    loaderId: resource.loaderId,
    startedAtCdpSeconds: resource.startedAtCdpSeconds,
    response: resource.response,
    responseFrameId: resource.responseFrameId,
    responseLoaderId: resource.responseLoaderId,
    completion: resource.completion,
    completedAtCdpSeconds: resource.completedAtCdpSeconds,
  }));
  return {
    id: phase.id,
    startedAtEpochMs: phase.startedAtEpochMs,
    endedAtEpochMs: phase.endedAtEpochMs,
    resources,
    documentResponses: resources
      .filter((resource) => resource.resourceType === "Document" && resource.response)
      .map((resource) => ({
        ordinal: resource.ordinal,
        requestId: resource.requestId,
        url: resource.url,
        frameId: resource.frameId,
        loaderId: resource.loaderId,
        response: resource.response,
        responseFrameId: resource.responseFrameId,
        responseLoaderId: resource.responseLoaderId,
      })),
    navigations: phase.navigations.map((navigation) => ({ ...navigation })),
    webSockets: phase.webSockets.map((socket) => ({ ...socket })),
  };
}

function allowedP3NetworkUrl(value, origin, label) {
  const url = traceUrl(value, label);
  if (url.protocol === "data:") return url;
  if (url.origin !== origin) {
    networkTraceFail(`${label} must use the hermetic provider origin ${origin} or data:, received ${url.href}.`);
  }
  return url;
}

// Page.addScriptToEvaluateOnNewDocument はHTMLへscript要素を追加せず、CSPを
// bypassするCDP command（Page.setBypassCSP）も使わない。各新規documentの最初に
// WebRTC APIをfail-closedで置換し、ページが例外を握り潰しても不可変getter経由で
// 使用試行を証跡化する。
const P3_WEBRTC_GUARD_PROPERTY = "__figmaP3WebRtcGuardState__";
const P3_WEBRTC_GUARD_SOURCE = `(() => {
  "use strict";
  const attempts = [];
  const coverage = [];
  const copy = (items) => items.map((item) => Object.freeze({ ...item }));
  const record = (api) => { attempts.push({ api, at: performance.now() }); };
  const blocked = (api) => function figmaP3WebRtcBlocked() {
    record(api);
    throw new DOMException("P-3 blocks WebRTC and media capture before document code runs.", "SecurityError");
  };
  // The P-3 evaluator closes its execution bundle with a deliberately
  // conservative static-loader policy. Descriptor lookup avoids dynamic
  // global property access and avoids invoking a page getter while deciding
  // whether an API exists.
  const descriptorInChain = (owner, api) => {
    let current = owner;
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, api);
      if (descriptor) return descriptor;
      current = Object.getPrototypeOf(current);
    }
    return null;
  };
  const replaceGlobal = (api) => {
    if (!descriptorInChain(globalThis, api)) { coverage.push({ api, status: "absent" }); return; }
    try {
      Object.defineProperty(globalThis, api, { configurable: false, enumerable: false, writable: false, value: blocked(api) });
      coverage.push({ api, status: "blocked" });
    } catch (error) {
      coverage.push({ api, status: "failed", detail: String(error && error.name || "error") });
    }
  };
  const replaceMethod = (owner, api) => {
    const descriptor = owner ? descriptorInChain(owner, api) : null;
    if (!descriptor || ("value" in descriptor && typeof descriptor.value !== "function") || ("get" in descriptor && typeof descriptor.get !== "function")) { coverage.push({ api, status: "absent" }); return; }
    try {
      Object.defineProperty(owner, api, { configurable: false, enumerable: false, writable: false, value: function figmaP3WebRtcBlockedMethod() {
        record(api);
        return Promise.reject(new DOMException("P-3 blocks WebRTC and media capture before document code runs.", "SecurityError"));
      } });
      coverage.push({ api, status: "blocked" });
    } catch (error) {
      coverage.push({ api, status: "failed", detail: String(error && error.name || "error") });
    }
  };
  for (const api of ["RTCPeerConnection", "webkitRTCPeerConnection", "mozRTCPeerConnection", "RTCIceTransport", "RTCDtlsTransport", "RTCSctpTransport", "RTCQuicTransport", "RTCIceGatherer"]) replaceGlobal(api);
  replaceMethod(navigator && navigator.mediaDevices, "getUserMedia");
  replaceMethod(navigator && navigator.mediaDevices, "getDisplayMedia");
  replaceMethod(navigator, "getUserMedia");
  try {
    Object.defineProperty(globalThis, ${JSON.stringify(P3_WEBRTC_GUARD_PROPERTY)}, {
      configurable: false,
      enumerable: false,
      get() {
        return Object.freeze({ version: 1, installed: true, attempts: Object.freeze(copy(attempts)), coverage: Object.freeze(copy(coverage)) });
      },
    });
  } catch {
    // The later CDP snapshot sees the missing guard and P-3 fails closed.
  }
})();`;

function validateP3WebRtcState(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== 1 || raw.installed !== true || !Array.isArray(raw.attempts) || !Array.isArray(raw.coverage)) {
    networkTraceFail("P-3 WebRTC pre-document guard is missing or malformed.");
  }
  const coverage = raw.coverage.map((entry) => ({
    api: typeof entry?.api === "string" ? entry.api : null,
    status: typeof entry?.status === "string" ? entry.status : null,
    detail: typeof entry?.detail === "string" ? entry.detail : null,
  }));
  if (coverage.some((entry) => !entry.api || !["absent", "blocked"].includes(entry.status))) {
    networkTraceFail(`P-3 WebRTC pre-document guard could not block every available API: ${JSON.stringify(coverage)}.`);
  }
  const attempts = raw.attempts.map((entry) => ({
    api: typeof entry?.api === "string" ? entry.api : null,
    at: finiteTimestamp(entry?.at),
  }));
  if (attempts.some((entry) => !entry.api)) networkTraceFail("P-3 WebRTC guard recorded a malformed API attempt.");
  return {
    version: 1,
    installed: true,
    attempts,
    coverage,
  };
}

/**
 * Collect network evidence for a P-3 batch in the same page CDP target that runs
 * Q-09/Q-13/Q-08. This is deliberately opt-in: ordinary gate jobs keep their
 * existing network behavior and only P-3 passes `checkpointElementId/preflightId`.
 */
export async function startP3NetworkTrace(browser, {
  expectedUrl,
  expectedPhaseIds = ["q09-layout", "q09-capture", "q13-accessibility", "q08-motion"],
  idleMs = 75,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!browser || typeof browser.send !== "function" || typeof browser.onEvent !== "function") {
    networkTraceFail("browser must expose CDP send() and onEvent().");
  }
  const target = requiredHttpLoopbackUrl(expectedUrl, "P-3 expected URL");
  if (!Array.isArray(expectedPhaseIds) || expectedPhaseIds.length === 0 || expectedPhaseIds.some((id) => typeof id !== "string" || id.trim() === "")) {
    networkTraceFail("expectedPhaseIds must be a non-empty array of phase names.");
  }
  if (!Number.isInteger(idleMs) || idleMs < 0) networkTraceFail("idleMs must be a non-negative integer.");

  // Network.enable must precede the cache/SW controls. These calls are made on
  // the measured page target, not on a separate DevTools/browser connection.
  await browser.send("Network.enable");
  await browser.send("Network.setBypassServiceWorker", { bypass: true });
  await browser.send("Network.setCacheDisabled", { cacheDisabled: true });
  // 通常gateにはLifecycleイベント待機を追加しない。P-3のhermetic batchだけで
  // main-frame commit/loadをCDP上から照合する。
  await browser.send("Page.setLifecycleEventsEnabled", { enabled: true });
  // This injection is registered before the first P-3 navigation. It does not
  // call Page.setBypassCSP and does not alter a response body/header; the raw
  // CSP response header remains in the Network evidence below.
  const webRtcGuardResponse = await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: P3_WEBRTC_GUARD_SOURCE });
  const webRtcScriptIdentifier = typeof webRtcGuardResponse.result?.identifier === "string" ? webRtcGuardResponse.result.identifier : null;
  if (!webRtcScriptIdentifier) networkTraceFail("CDP did not return a P-3 WebRTC guard script identifier.");

  const phases = [];
  const expected = [...expectedPhaseIds];
  const requests = new Map();
  const unassignedEvents = [];
  let activePhase = null;
  let eventOrdinal = 0;
  let lastActivityAt = Date.now();
  let closed = false;

  const phaseForEvent = (method, params) => {
    if (activePhase) return activePhase;
    unassignedEvents.push({
      ordinal: ++eventOrdinal,
      method,
      requestId: typeof params?.requestId === "string" ? params.requestId : null,
      url: typeof params?.request?.url === "string" ? params.request.url : null,
    });
    return null;
  };

  const onEvent = (params, method) => {
    if (closed || !method.startsWith("Network.")) return;
    lastActivityAt = Date.now();
    if (method === "Network.requestWillBeSent") {
      const phase = phaseForEvent(method, params);
      if (!phase) return;
      const prior = requests.get(params.requestId);
      if (prior && prior.completion === "pending") {
        prior.completion = "superseded";
        prior.completedAtCdpSeconds = finiteTimestamp(params.timestamp);
      }
      const resource = phaseRecordForRequest(phase, params, ++eventOrdinal);
      phase.resources.push(resource);
      if (resource.requestId) requests.set(resource.requestId, resource);
      return;
    }
    if (method === "Network.responseReceived") {
      const resource = requests.get(params.requestId);
      if (!resource) {
        phaseForEvent(method, params);
        return;
      }
      resource.response = responseRecord(params.response);
      resource.responseFrameId = typeof params.frameId === "string" ? params.frameId : null;
      resource.responseLoaderId = typeof params.loaderId === "string" ? params.loaderId : null;
      return;
    }
    if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
      const resource = requests.get(params.requestId);
      if (!resource) {
        phaseForEvent(method, params);
        return;
      }
      resource.completion = method === "Network.loadingFinished" ? "finished" : "failed";
      resource.completedAtCdpSeconds = finiteTimestamp(params.timestamp);
      if (method === "Network.loadingFailed") resource.failureText = typeof params.errorText === "string" ? params.errorText : "Network loading failed.";
      return;
    }
    if (method === "Network.webSocketCreated") {
      const phase = phaseForEvent(method, params);
      if (!phase) return;
      phase.webSockets.push({
        ordinal: ++eventOrdinal,
        requestId: typeof params.requestId === "string" ? params.requestId : null,
        url: typeof params.url === "string" ? params.url : null,
      });
      return;
    }
    if (method.startsWith("Network.webSocket")) {
      // webSocketCreated may be disabled by a browser version or emitted before
      // a handshake event. Record every variant so a P-3 finalization cannot
      // silently accept any WebSocket traffic.
      const phase = phaseForEvent(method, params);
      if (!phase) return;
      phase.webSockets.push({
        ordinal: ++eventOrdinal,
        method,
        requestId: typeof params.requestId === "string" ? params.requestId : null,
        url: typeof params.url === "string" ? params.url : null,
      });
    }
  };
  const unsubscribe = browser.onEvent("*", onEvent);

  async function waitForPhaseIdle(phase) {
    await waitFor(() => {
      const pending = phase.resources.some((resource) => resource.completion === "pending");
      return !pending && Date.now() - lastActivityAt >= idleMs;
    }, { timeoutMs, intervalMs: Math.max(10, Math.min(POLL_INTERVAL_MS, idleMs || POLL_INTERVAL_MS)), label: `P-3 network phase ${phase.id} idle` });
  }

  function beginPhase(id) {
    if (closed) networkTraceFail("cannot begin a phase after the network trace is closed.");
    if (activePhase) networkTraceFail(`cannot begin ${id}; phase ${activePhase.id} is still active.`);
    const normalized = typeof id === "string" ? id.trim() : "";
    const expectedId = expected[phases.length];
    if (!normalized || normalized !== expectedId) {
      networkTraceFail(`phase order must be ${expected.join(", ")}; received ${normalized || "(empty)"}.`);
    }
    activePhase = {
      id: normalized,
      startedAtEpochMs: Date.now(),
      endedAtEpochMs: null,
      resources: [],
      webSockets: [],
      navigations: [],
    };
    phases.push(activePhase);
    return activePhase;
  }

  async function captureWebRtcState() {
    const raw = await browser.evaluate(`(() => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, ${JSON.stringify(P3_WEBRTC_GUARD_PROPERTY)});
      const state = descriptor && typeof descriptor.get === "function"
        ? descriptor.get.call(globalThis)
        : descriptor && "value" in descriptor
          ? descriptor.value
          : null;
      if (!state || typeof state !== "object") return null;
      return {
        version: state.version,
        installed: state.installed,
        attempts: Array.isArray(state.attempts) ? state.attempts.map((entry) => ({ api: entry.api, at: entry.at })) : null,
        coverage: Array.isArray(state.coverage) ? state.coverage.map((entry) => ({ api: entry.api, status: entry.status, detail: entry.detail ?? null })) : null,
      };
    })()`);
    return validateP3WebRtcState(raw);
  }

  function recordNavigation(raw) {
    if (!activePhase) networkTraceFail("P-3 navigation completed outside a named network phase.");
    if (!raw || typeof raw !== "object") networkTraceFail("P-3 navigation evidence is missing.");
    const navigation = {
      requestedUrl: typeof raw.requestedUrl === "string" ? raw.requestedUrl : null,
      frameId: typeof raw.frameId === "string" ? raw.frameId : null,
      loaderId: typeof raw.loaderId === "string" ? raw.loaderId : null,
      committedUrl: typeof raw.committedUrl === "string" ? raw.committedUrl : null,
      mainFrame: raw.mainFrame === true,
      commitObservedAtEpochMs: finiteTimestamp(raw.commitObservedAtEpochMs),
      loadObservedAtEpochMs: finiteTimestamp(raw.loadObservedAtEpochMs),
      loadAtCdpSeconds: finiteTimestamp(raw.loadAtCdpSeconds),
      complete: raw.complete === true,
      webRtc: validateP3WebRtcState(raw.webRtc),
    };
    if (!navigation.complete || !navigation.frameId || !navigation.loaderId || !navigation.mainFrame || !navigation.requestedUrl || !navigation.committedUrl || navigation.commitObservedAtEpochMs === null || navigation.loadObservedAtEpochMs === null || navigation.loadAtCdpSeconds === null) {
      networkTraceFail(`P-3 navigation lacks committed main-frame loader evidence in ${activePhase.id}.`);
    }
    if (navigation.requestedUrl !== target.href || navigation.committedUrl !== target.href || navigation.commitObservedAtEpochMs > navigation.loadObservedAtEpochMs) {
      networkTraceFail(`P-3 navigation must commit and load the frozen provider URL in ${activePhase.id}.`);
    }
    if (navigation.webRtc.attempts.length > 0) {
      networkTraceFail(`WebRTC API use is forbidden in P-3 phase ${activePhase.id}: ${JSON.stringify(navigation.webRtc.attempts)}.`);
    }
    const duplicate = activePhase.navigations.some((existing) => existing.frameId === navigation.frameId && existing.loaderId === navigation.loaderId);
    if (duplicate) networkTraceFail(`P-3 navigation duplicated main-frame loader ${navigation.loaderId} in ${activePhase.id}.`);
    activePhase.navigations.push(navigation);
  }

  if (browser[P3_NAVIGATION_OBSERVER] || browser[P3_WEBRTC_SNAPSHOT]) {
    networkTraceFail("P-3 navigation/WebRTC observer is already installed on this CDP browser.");
  }
  browser[P3_NAVIGATION_OBSERVER] = recordNavigation;
  browser[P3_WEBRTC_SNAPSHOT] = captureWebRtcState;

  function assertFrozenDocumentPhase(phase) {
    if (phase.navigations.length === 0) networkTraceFail(`P-3 network phase ${phase.id} did not complete a measured main-frame navigation.`);
    const navigationByLoader = new Map();
    for (const navigation of phase.navigations) {
      const key = `${navigation.frameId}\u0000${navigation.loaderId}`;
      if (navigationByLoader.has(key)) networkTraceFail(`P-3 phase ${phase.id} reused main-frame loader evidence.`);
      navigationByLoader.set(key, navigation);
    }
    const documentResources = phase.resources.filter((resource) => resource.resourceType === "Document");
    if (documentResources.length !== phase.navigations.length) {
      networkTraceFail(`P-3 phase ${phase.id} requires a 1:1 measured-navigation/document-response count; navigations=${phase.navigations.length}, documents=${documentResources.length}, evidence=${JSON.stringify({ navigations: phase.navigations.map((navigation) => ({ frameId: navigation.frameId, loaderId: navigation.loaderId, requestedUrl: navigation.requestedUrl })), documents: documentResources.map((resource) => ({ requestId: resource.requestId, frameId: resource.frameId, loaderId: resource.loaderId, url: resource.url, responseUrl: resource.response?.url ?? null })) })}.`);
    }
    const matchedLoaders = new Set();
    for (const resource of documentResources) {
      const requestUrl = allowedP3NetworkUrl(resource.url, target.origin, `${phase.id} document request`);
      if (!resource.response) networkTraceFail(`P-3 network phase ${phase.id} document response is missing.`);
      const responseUrl = allowedP3NetworkUrl(resource.response.url, target.origin, `${phase.id} document response`);
      if (requestUrl.href !== target.href || responseUrl.href !== target.href) {
        networkTraceFail(`P-3 document request and response must equal the frozen provider URL in ${phase.id}: ${requestUrl.href} -> ${responseUrl.href}.`);
      }
      if (!resource.frameId || !resource.loaderId || resource.responseFrameId !== resource.frameId || resource.responseLoaderId !== resource.loaderId) {
        networkTraceFail(`P-3 document request/response lacks matching frameId and loaderId in ${phase.id}.`);
      }
      const key = `${resource.frameId}\u0000${resource.loaderId}`;
      const navigation = navigationByLoader.get(key);
      if (!navigation) networkTraceFail(`P-3 document response has no matching measured navigation in ${phase.id}: ${key}.`);
      if (matchedLoaders.has(key)) networkTraceFail(`P-3 document response duplicates measured loader ${resource.loaderId} in ${phase.id}.`);
      matchedLoaders.add(key);
    }
    if (matchedLoaders.size !== navigationByLoader.size) networkTraceFail(`P-3 phase ${phase.id} contains a measured navigation without its own document response.`);
  }

  async function endPhase(phase) {
    if (!phase || activePhase !== phase) networkTraceFail("can only end the currently active P-3 network phase.");
    await waitForPhaseIdle(phase);
    assertFrozenDocumentPhase(phase);
    phase.endedAtEpochMs = Date.now();
    activePhase = null;
  }

  function close() {
    if (closed) return;
    closed = true;
    unsubscribe();
    if (browser[P3_NAVIGATION_OBSERVER] === recordNavigation) delete browser[P3_NAVIGATION_OBSERVER];
    if (browser[P3_WEBRTC_SNAPSHOT] === captureWebRtcState) delete browser[P3_WEBRTC_SNAPSHOT];
  }

  function finalize({ pageIdentity } = {}) {
    if (activePhase) networkTraceFail(`P-3 network phase ${activePhase.id} was not ended.`);
    close();
    if (phases.length !== expected.length || phases.some((phase, index) => phase.id !== expected[index] || phase.endedAtEpochMs === null)) {
      networkTraceFail(`P-3 network trace must contain completed phases ${expected.join(", ")}.`);
    }
    if (unassignedEvents.length > 0) {
      networkTraceFail(`network activity occurred outside a named P-3 phase: ${JSON.stringify(unassignedEvents)}.`);
    }
    if (!pageIdentity || typeof pageIdentity !== "object") networkTraceFail("page identity is required to finalize P-3 network evidence.");
    const loaded = traceUrl(pageIdentity.loadedUrl, "P-3 loaded page");
    if (loaded.href !== target.href) networkTraceFail(`P-3 loaded URL must equal the frozen provider URL ${target.href}, received ${loaded.href}.`);

    let providerHeaders = null;
    let documentCount = 0;
    for (const phase of phases) {
      let phaseDocumentCount = 0;
      if (phase.webSockets.length > 0) {
        networkTraceFail(`WebSocket traffic is forbidden in P-3 phase ${phase.id}: ${JSON.stringify(phase.webSockets)}.`);
      }
      for (const resource of phase.resources) {
        const requestUrl = allowedP3NetworkUrl(resource.url, target.origin, `${phase.id} request`);
        if (resource.completion === "failed") {
          networkTraceFail(`P-3 network request failed in ${phase.id}: ${requestUrl.href} (${resource.failureText ?? "unknown error"}).`);
        }
        // data: is not a network response. Its bytes remain inside the frozen
        // HTML/CSS/JS bundle that carries the provider headers, so it is allowed
        // without pretending that it was served by the loopback provider.
        if (requestUrl.protocol === "data:") continue;
        if (!resource.response) networkTraceFail(`P-3 network response is missing in ${phase.id}: ${requestUrl.href}.`);
        const responseUrl = allowedP3NetworkUrl(resource.response.url, target.origin, `${phase.id} response`);
        if (resource.response.status == null || resource.response.status < 200 || resource.response.status >= 300) {
          networkTraceFail(`P-3 provider response must be 2xx in ${phase.id}: ${responseUrl.href} (${resource.response.status ?? "missing status"}).`);
        }
        if (resource.response.fromDiskCache || resource.response.fromServiceWorker || resource.response.fromPrefetchCache) {
          networkTraceFail(`P-3 response must not come from cache or service worker: ${responseUrl.href}.`);
        }
        const headers = resource.response.headers;
        const observedHeaders = {
          providerMarker: headers["x-figma-p3-provider"] ?? null,
          entrySha256: headers["x-figma-p3-entry-sha256"] ?? null,
          bundleMerkleRoot: headers["x-figma-p3-bundle-sha256"] ?? null,
        };
        if (!observedHeaders.providerMarker || !/^[a-f0-9]{64}$/i.test(observedHeaders.entrySha256 ?? "") || !/^[a-f0-9]{64}$/i.test(observedHeaders.bundleMerkleRoot ?? "")) {
          networkTraceFail(`P-3 provider response is missing X-Figma-P3-Provider, X-Figma-P3-Entry-Sha256, or X-Figma-P3-Bundle-Sha256: ${responseUrl.href}.`);
        }
        if (!providerHeaders) providerHeaders = observedHeaders;
        else if (providerHeaders.providerMarker !== observedHeaders.providerMarker || providerHeaders.entrySha256 !== observedHeaders.entrySha256 || providerHeaders.bundleMerkleRoot !== observedHeaders.bundleMerkleRoot) {
          networkTraceFail(`P-3 provider headers changed between responses: ${responseUrl.href}.`);
        }
        if (resource.resourceType === "Document") {
          if (requestUrl.href !== target.href || responseUrl.href !== target.href) {
            networkTraceFail(`P-3 document request and response must equal the frozen provider URL in ${phase.id}: ${requestUrl.href} -> ${responseUrl.href}.`);
          }
          documentCount += 1;
          phaseDocumentCount += 1;
        }
      }
      if (phaseDocumentCount === 0) networkTraceFail(`P-3 network phase ${phase.id} did not record a document response for the frozen provider URL.`);
    }
    if (documentCount === 0) networkTraceFail("P-3 network trace did not record a document response.");
    if (!providerHeaders) networkTraceFail("P-3 network trace did not record provider response headers.");
    const resourceUrls = Array.isArray(pageIdentity.resourceUrls) ? pageIdentity.resourceUrls : [];
    const observedUrls = new Set(phases.flatMap((phase) => phase.resources.flatMap((resource) => [resource.url, resource.response?.url]).filter(Boolean)).map((value) => traceUrl(value, "P-3 traced resource").href));
    for (const value of resourceUrls) {
      const resourceUrl = allowedP3NetworkUrl(value, target.origin, "P-3 performance resource");
      if (resourceUrl.protocol !== "data:" && !observedUrls.has(resourceUrl.href)) {
        networkTraceFail(`P-3 performance resource lacks a matching CDP network response: ${resourceUrl.href}.`);
      }
    }
    return {
      version: 1,
      kind: "p3-hermetic-network-v1",
      expectedOrigin: target.origin,
      controls: {
        cacheDisabled: true,
        bypassServiceWorker: true,
      },
      providerHeaders,
      webRtc: {
        kind: "cdp-pre-document-block-v1",
        scriptIdentifier: webRtcScriptIdentifier,
        cspBypassed: false,
        // CSPはresponse headerを改変せずresourcesにも全文を残す。ここはdocument
        // ごとの索引であり、CSP未設定を合格条件に読み替えない。
        documentContentSecurityPolicies: phases.flatMap((phase) => phase.resources
          .filter((resource) => resource.resourceType === "Document" && resource.response)
          .map((resource) => ({
            phaseId: phase.id,
            frameId: resource.frameId,
            loaderId: resource.loaderId,
            value: resource.response.headers["content-security-policy"] ?? null,
          }))),
      },
      phases: phases.map(publicPhase),
    };
  }

  return { beginPhase, endPhase, finalize, close };
}

// scrollbars: "hidden" は --hide-scrollbars でスクロールバーの無い理想幅を測る。
// "visible" は実ブラウザと同じスクロールバー幅を含めて測る。
// 中央寄せ（margin: 0 auto）はこの差でx座標がずれるため、どちらで測ったかを宣言必須にする。
export async function startCdpBrowser({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  initialWidth = 1440,
  initialHeight = 2000,
  scrollbars,
} = {}) {
  const headlessMode = process.env.FIGMA_CDP_HEADLESS_MODE || "old";
  if (!/^(old|new)$/.test(headlessMode)) {
    throw new Error('FIGMA_CDP_HEADLESS_MODE must be "old" or "new".');
  }
  if (scrollbars !== "hidden" && scrollbars !== "visible") {
    throw new Error('startCdpBrowser requires scrollbars: "hidden" or "visible" (declare spec.viewportPolicy.scrollbars).');
  }

  const port = await reservePort();
  const profileDirectory = mkdtempSync(join(tmpdir(), "figma-cdp-"));
  const chrome = spawn(
    CHROME,
    [
      `--headless=${headlessMode}`,
      "--disable-gpu",
      ...(scrollbars === "hidden" ? ["--hide-scrollbars"] : []),
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
      `--window-size=${initialWidth},${initialHeight}`,
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let client = null;
  try {
    const endpoint = await waitFor(
      async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/json/version`);
          if (!response.ok) return null;
          const value = await response.json();
          return value.webSocketDebuggerUrl ? value : null;
        } catch {
          return null;
        }
      },
      { timeoutMs, label: "Chrome DevTools endpoint" }
    );

    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    if (!targetResponse.ok) throw new Error(`Could not create CDP target: HTTP ${targetResponse.status}.`);
    const target = await targetResponse.json();
    if (!target.webSocketDebuggerUrl) throw new Error("CDP target did not provide a WebSocket URL.");

    const socket = await connectWebSocket(target.webSocketDebuggerUrl, timeoutMs);
    client = createClient(socket, timeoutMs);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const versionResponse = await client.send("Browser.getVersion");
    const version = versionResponse.result;
    if (!version || typeof version.product !== "string" || typeof version.revision !== "string" || typeof version.userAgent !== "string") {
      throw new Error("CDP Browser.getVersion did not return product, revision, and userAgent.");
    }

    const sessionId = `cdp-${chrome.pid ?? "unknown"}-${port}`;
    return {
      ...client,
      browserPid: chrome.pid ?? null,
      chromeMode: headlessMode,
      sessionId,
      // Q-09/Q-13/Q-08 batch evidence records this result. Consumers must use
      // this session's evidence rather than launching another browser after measurement.
      browserVersion: {
        source: "CDP Browser.getVersion",
        product: version.product,
        revision: version.revision,
        userAgent: version.userAgent,
        jsVersion: typeof version.jsVersion === "string" ? version.jsVersion : null,
      },
      async close() {
        client?.close();
        killBrowserTree(chrome);
        try {
          rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch {
          // Chrome profile cleanup is best-effort after process termination.
        }
      },
    };
  } catch (error) {
    client?.close();
    killBrowserTree(chrome);
    try {
      rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Keep the original startup failure as the actionable error.
    }
    throw error;
  }
}

function canonicalNavigationUrl(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} URL is required.`);
  try {
    return new URL(value).href;
  } catch (error) {
    throw new Error(`${label} URL is invalid: ${error.message}`);
  }
}

async function navigateMainFrameAndWait(browser, { url, timeoutMs, requireLoader }) {
  const requestedUrl = canonicalNavigationUrl(url, "Page.navigate");
  const frameEvents = [];
  const lifecycleEvents = [];
  const unsubscribeFrame = browser.onEvent("Page.frameNavigated", (params) => {
    if (!params?.frame || typeof params.frame !== "object") return;
    frameEvents.push({ frame: params.frame, observedAtEpochMs: Date.now() });
  });
  const unsubscribeLifecycle = browser.onEvent("Page.lifecycleEvent", (params) => {
    lifecycleEvents.push({
      frameId: typeof params?.frameId === "string" ? params.frameId : null,
      loaderId: typeof params?.loaderId === "string" ? params.loaderId : null,
      name: typeof params?.name === "string" ? params.name : null,
      timestamp: finiteTimestamp(params?.timestamp),
      observedAtEpochMs: Date.now(),
    });
  });
  try {
    const response = await browser.send("Page.navigate", { url }, { timeoutMs });
    const result = response.result ?? {};
    if (typeof result.errorText === "string" && result.errorText.trim() !== "") {
      throw new Error(`Page.navigate failed: ${result.errorText}.`);
    }
    const frameId = typeof result.frameId === "string" ? result.frameId : null;
    const loaderId = typeof result.loaderId === "string" ? result.loaderId : null;
    if (!frameId || !loaderId) {
      if (requireLoader) {
        throw new Error(`P-3 navigation must return a main-frame loaderId and frameId for ${requestedUrl}.`);
      }
      return {
        requestedUrl,
        frameId,
        loaderId,
        committedUrl: null,
        mainFrame: null,
        commitObservedAtEpochMs: null,
        loadObservedAtEpochMs: null,
        loadAtCdpSeconds: null,
        complete: false,
      };
    }
    const matched = await waitFor(() => {
      const frameEvent = [...frameEvents].reverse().find((event) => event.frame?.id === frameId && event.frame?.loaderId === loaderId);
      if (!frameEvent) return null;
      const loadEvent = [...lifecycleEvents].reverse().find((event) => event.name === "load" && event.frameId === frameId && event.loaderId === loaderId);
      if (!loadEvent) return null;
      return { frameEvent, loadEvent };
    }, { timeoutMs, label: `main-frame commit and load for ${requestedUrl}` });
    const committedUrl = typeof matched.frameEvent.frame.url === "string" ? canonicalNavigationUrl(matched.frameEvent.frame.url, "Page.frameNavigated") : null;
    const navigation = {
      requestedUrl,
      frameId,
      loaderId,
      committedUrl,
      mainFrame: !matched.frameEvent.frame.parentId,
      commitObservedAtEpochMs: matched.frameEvent.observedAtEpochMs,
      loadObservedAtEpochMs: matched.loadEvent.observedAtEpochMs,
      loadAtCdpSeconds: matched.loadEvent.timestamp,
      complete: true,
    };
    if (requireLoader && (!navigation.mainFrame || navigation.committedUrl !== requestedUrl)) {
      throw new Error(`P-3 navigation commit must match the requested main-frame URL ${requestedUrl}, received ${navigation.committedUrl ?? "(missing)"}.`);
    }
    return navigation;
  } finally {
    unsubscribeFrame();
    unsubscribeLifecycle();
  }
}

export async function navigateAndWait(browser, { url, width, height = 2000, selectors = [], timeoutMs = NAVIGATION_TIMEOUT_MS }) {
  const uniqueSelectors = [...new Set(selectors.filter((selector) => typeof selector === "string" && selector.trim() !== ""))];
  await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const p3Navigation = typeof browser[P3_NAVIGATION_OBSERVER] === "function";
  const navigation = p3Navigation
    ? await navigateMainFrameAndWait(browser, { url, timeoutMs, requireLoader: true })
    : (await browser.send("Page.navigate", { url }, { timeoutMs }), null);

  // Page.navigateは測定対象DOMの生成前に返ることがある。この時点でlazy画像を走査すると
  // rootsが空のまま通過し、後から生成された画面外画像が読み込まれずreadinessが永久待機する。
  // 文書完了と測定rootの配置を先に待ってから、対象画像だけを強制読込する。
  await waitFor(
    async () => browser.evaluate(`(() => {
      if (document.readyState !== "complete") return false;
      const selectors = ${JSON.stringify(uniqueSelectors)};
      return selectors.every((selector) => {
        const root = document.querySelector(selector);
        if (!root) return false;
        const rect = root.getBoundingClientRect();
        const style = getComputedStyle(root);
        const hidden = style.display === "none" || style.visibility === "hidden";
        const isEmpty = root.children.length === 0 && root.textContent.trim() === "";
        return !hidden && (isEmpty || (rect.width > 0 && rect.height > 0));
      });
    })()`),
    { timeoutMs, label: `document and measurement roots for ${url} @ ${width}px` }
  );

  // 各checkpointの測定対象にあるlazy画像だけを読み込む。画面外のカードを待たず、
  // 対象カード内のロゴ等は確実に取得してから幾何・視覚検証を始める。
  await browser.evaluate(`(() => {
    const selectors = ${JSON.stringify(uniqueSelectors)};
    const roots = selectors.map((selector) => document.querySelector(selector)).filter(Boolean);
    const force = (image) => {
      image.loading = "eager";
      image.removeAttribute("loading");
      image.fetchPriority = "high";
      // Chromeのnative lazy-loadはloading属性の変更だけでは再スケジュールしない場合がある。
      // 同じURLを代入して、対象画像のリクエストを明示的に開始する。
      const source = image.currentSrc || image.src;
      if (source) image.src = source;
    };
    // 測定rootが1つも解決しないviewportがある。SP専用/PC専用の要素を持つcomponentの
    // checkpointがこれにあたる。このとき readiness はページ全体の画像を待つ側へ落ちるが、
    // 画面外のlazy画像は誰も読み込まないため imagesReady が永久にfalseになり、
    // 実装が正しくてもLAYOUT FAILになる。rootが無いときはページ全体を強制読込する。
    if (roots.length === 0) {
      for (const image of Array.from(document.images || [])) force(image);
      return;
    }
    for (const root of roots) {
      root.scrollIntoView({ block: "center", inline: "nearest" });
      const images = [
        ...(root.tagName === "IMG" ? [root] : []),
        ...Array.from(root.querySelectorAll("img")),
      ];
      for (const image of images) force(image);
    }
  })()`);

  let lastReadiness = null;
  try {
    const readiness = await waitFor(
      async () => {
        lastReadiness = await browser.evaluate(`(() => {
          const selectors = ${JSON.stringify(uniqueSelectors)};
          const selectorStates = selectors.map((selector) => {
            const element = document.querySelector(selector);
            if (!element) return { selector, ready: false, reason: "not-found" };
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const hidden = style.display === "none" || style.visibility === "hidden";
            // 中身が空の要素は、正しく描画されていても寸法が0になる。
            // これを「未描画」と扱うと、文言が抜けているという検出したい欠陥そのものが
            // 待機のタイムアウトに化けて、検証が実行されないまま終わる。
            // 空であることは測定層が spec と比べて判定するので、待機では通す。
            const isEmpty = element.children.length === 0 && element.textContent.trim() === "";
            const ready = !hidden && (isEmpty || (rect.width > 0 && rect.height > 0));
            return { selector, ready, reason: ready ? null : hidden ? "hidden" : "not-laid-out" };
          });
          // 待機対象の画像は「測定対象セレクタの配下」に限る。
          // ページ全体を待つと、対象と無関係な大量の画像でタイムアウトし、
          // spec側に不備が無くても LAYOUT FAIL になる。
          const scopeRoots = selectors
            .map((selector) => document.querySelector(selector))
            .filter(Boolean);
          const images = scopeRoots.length > 0
            ? [...new Set(scopeRoots.flatMap((root) => [
                ...(root.tagName === "IMG" ? [root] : []),
                ...Array.from(root.querySelectorAll("img")),
              ]))]
            : Array.from(document.images || []);
          // 読み込み失敗の画像は complete=true / naturalWidth=0 になる。
          // ここで永久待機すると差分検証が実行されず、失敗を隠してしまう。
          // 待機はネットワークの完了までに留め、失敗した画像は後段の実測・視覚比較で検出する。
          const imagesReady = images.every((image) => image.complete);
          const failedImageCount = images.filter((image) => image.complete && image.naturalWidth === 0).length;
          const fontsReady = !document.fonts || document.fonts.status === "loaded";
          return {
            ready: document.readyState === "complete" && fontsReady && imagesReady && selectorStates.every((state) => state.ready),
            documentReadyState: document.readyState,
            fontsReady,
            imagesReady,
            imageCount: images.length,
            failedImageCount,
            selectorStates,
          };
        })()`);
        return lastReadiness?.ready ? lastReadiness : null;
      },
      { timeoutMs, label: `page readiness for ${url} @ ${width}px` }
    );
    if (typeof browser[P3_WEBRTC_SNAPSHOT] === "function") {
      navigation.webRtc = await browser[P3_WEBRTC_SNAPSHOT]();
    }
    if (typeof browser[P3_NAVIGATION_OBSERVER] === "function") {
      browser[P3_NAVIGATION_OBSERVER](navigation);
    }
    return p3Navigation ? { ...readiness, navigation } : readiness;
  } catch (error) {
    throw new Error(`${error.message} Last readiness: ${JSON.stringify(lastReadiness)}.`);
  }
}

export async function captureElement(browser, selector) {
  const measured = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { error: "not-found" };
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") {
      return { error: "not-visible" };
    }
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  })()`);

  if (!measured || measured.error) {
    throw new Error(`Element is not capturable (${selector}): ${measured?.error ?? "no-result"}.`);
  }

  const clip = {
    x: Math.max(0, Math.round(measured.x)),
    y: Math.max(0, Math.round(measured.y)),
    width: Math.max(1, Math.round(measured.width)),
    height: Math.max(1, Math.round(measured.height)),
    scale: 1,
  };
  const screenshot = await browser.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
  if (!screenshot.result?.data) throw new Error(`Screenshot failed for ${selector}.`);
  return { clip, base64: screenshot.result.data };
}
