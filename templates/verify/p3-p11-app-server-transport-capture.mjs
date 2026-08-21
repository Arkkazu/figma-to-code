#!/usr/bin/env node
// Trusted transport boundary for the P-11 App Server feasibility spike.
//
// This module is deliberately separate from the coordinator and from the
// App Server subprocess.  It tees the exact bytes written to the child stdin
// and received from its stdout/stderr before any JSON-RPC interpretation.  It
// is not a P-11 authorization mechanism.

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { P11ProcessTreeError, terminateWindowsProcessTree } from "./p3-p11-process-tree.mjs";

export const TRANSPORT_CAPTURE_VERSION = 1;

export class TransportCaptureError extends Error {
  constructor(code, detail = null) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, code) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new TransportCaptureError(code);
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function writeAll(handle, bytes) {
  let position = 0;
  while (position < bytes.byteLength) {
    const result = await handle.write(bytes, position, bytes.byteLength - position, null);
    if (!result || !Number.isInteger(result.bytesWritten) || result.bytesWritten <= 0) throw new TransportCaptureError("CAPTURE_ARTIFACT_WRITE_FAILED");
    position += result.bytesWritten;
  }
}

function digestOf(hash) {
  return hash.copy().digest("hex");
}

function rawJsonLine(bytes) {
  const source = bytes.byteLength > 0 && bytes.at(-1) === 0x0d ? bytes.subarray(0, -1) : bytes;
  if (source.byteLength === 0) throw new TransportCaptureError("CAPTURE_EMPTY_JSONL_LINE");
  let message;
  try { message = JSON.parse(source.toString("utf8")); }
  catch { throw new TransportCaptureError("CAPTURE_JSONL_PARSE_FAILED"); }
  if (!plainObject(message)) throw new TransportCaptureError("CAPTURE_JSONL_SCHEMA_INVALID");
  return message;
}

function observeChildExit(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal });
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new TransportCaptureError("CAPTURE_CHILD_PROCESS_ERROR", typeof error?.code === "string" ? error.code : null));
    });
  });
}

function observeChildClose(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal });
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new TransportCaptureError("CAPTURE_CHILD_PROCESS_ERROR", typeof error?.code === "string" ? error.code : null));
    });
  });
}

function waitWithin(promise, timeoutMs, code) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new TransportCaptureError(code))), timeoutMs);
    promise.then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    );
  });
}

function cleanupErrorDetail(error) {
  if (error instanceof P11ProcessTreeError) return { code: error.code, detail: error.detail ?? null };
  return { code: "PROCESS_TREE_UNEXPECTED", detail: null };
}

// App Server is intentionally long-lived while JSON-RPC requests are in
// flight.  Its lifetime must therefore not share the per-RPC deadline.  The
// shutdown deadline begins only after close() has ended stdin.  On Windows,
// the bounded cleanup targets only this capture-owned root PID and its child
// tree; it never selects an image name or a config-provided PID.
async function waitForChildCloseAfterClose(child, closePromise, timeoutMs, terminateProcessTreeFn) {
  try {
    return { close: await waitWithin(closePromise, timeoutMs, "CAPTURE_CHILD_EXIT_TIMEOUT"), processTreeCleanup: null };
  } catch (error) {
    if (!(error instanceof TransportCaptureError) || error.code !== "CAPTURE_CHILD_EXIT_TIMEOUT") throw error;
  }
  const cleanupTimeoutMs = Math.min(Math.max(timeoutMs, 1000), 10000);
  let processTreeCleanup;
  try {
    processTreeCleanup = await terminateProcessTreeFn(child.pid, { timeoutMs: cleanupTimeoutMs });
  } catch (error) {
    throw new TransportCaptureError("CAPTURE_PROCESS_TREE_CLEANUP_FAILED", { cleanup: cleanupErrorDetail(error) });
  }
  try {
    const close = await waitWithin(closePromise, cleanupTimeoutMs, "CAPTURE_PROCESS_TREE_CLEANUP_FAILED");
    throw new TransportCaptureError("CAPTURE_CHILD_EXIT_TIMEOUT", { processTreeCleanup, close });
  } catch (error) {
    if (error instanceof TransportCaptureError && error.code === "CAPTURE_CHILD_EXIT_TIMEOUT") throw error;
    if (error instanceof TransportCaptureError && error.code === "CAPTURE_PROCESS_TREE_CLEANUP_FAILED") {
      throw new TransportCaptureError("CAPTURE_PROCESS_TREE_CLEANUP_FAILED", { processTreeCleanup, close: error.detail ?? null });
    }
    throw error;
  }
}

/**
 * A single App Server transport.  `messages` are parsed only after their raw
 * bytes have been queued to the coordinator-owned artifact.  Consumers must
 * treat the raw files, not the parsed projection, as evidence.
 */
class JsonRpcTransport {
  constructor({ child, handles, paths, observedLaunch, timeoutMs, now, terminateProcessTreeFn }) {
    this.child = child;
    this.handles = handles;
    this.paths = paths;
    this.observedLaunch = observedLaunch;
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.terminateProcessTreeFn = terminateProcessTreeFn;
    this.instanceId = randomUUID();
    this.childPid = child.pid ?? null;
    this.startedAt = now();
    this.stdinHash = createHash("sha256");
    this.stdoutHash = createHash("sha256");
    this.stderrHash = createHash("sha256");
    this.stdinBytes = 0;
    this.stdoutBytes = 0;
    this.stderrBytes = 0;
    this.messages = [];
    this.notifications = [];
    this.pending = new Map();
    this.nextId = 1;
    this.stdoutRemainder = Buffer.alloc(0);
    // Stdin must never wait behind an arbitrarily large stdout/stderr tee.
    // Each raw channel therefore has its own ordered write chain; close()
    // joins all three only after the child has been shut down.
    this.writeChains = {
      stdin: Promise.resolve(),
      stdout: Promise.resolve(),
      stderr: Promise.resolve(),
    };
    this.failure = null;
    this.processTreeCleanup = null;
    this.closed = false;
    this.exit = null;
    this.exitPromise = observeChildExit(child).then((result) => {
      this.exit = result;
      this.rejectPending(new TransportCaptureError("CAPTURE_CHILD_EXITED", result));
      return result;
    }, (error) => {
      this.fail(error);
      throw error;
    });
    // `exit` can precede closure of stdout/stderr handles on Windows.  The
    // shutdown path waits for `close` so a completed capture leaves no child
    // working-directory or stdio handle behind.
    this.closePromise = observeChildClose(child);
    this.closePromise.catch(() => {});
    child.stdout.on("data", (chunk) => this.captureStdout(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => this.captureStderr(Buffer.from(chunk)));
    child.stdin.on("error", (error) => this.fail(new TransportCaptureError("CAPTURE_CHILD_STDIN_ERROR", typeof error?.code === "string" ? error.code : null)));
  }

  append(channel, bytes) {
    if (!Object.prototype.hasOwnProperty.call(this.handles, channel)) throw new TransportCaptureError("CAPTURE_ARTIFACT_CHANNEL_INVALID");
    const next = this.writeChains[channel].then(() => writeAll(this.handles[channel], bytes));
    this.writeChains[channel] = next;
    next.catch((error) => this.fail(error instanceof TransportCaptureError ? error : new TransportCaptureError("CAPTURE_ARTIFACT_WRITE_FAILED")));
    return next;
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error instanceof TransportCaptureError ? error : new TransportCaptureError("CAPTURE_UNEXPECTED_FAILURE");
    this.rejectPending(this.failure);
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  captureStdout(bytes) {
    if (this.failure) return;
    this.stdoutHash.update(bytes);
    this.stdoutBytes += bytes.byteLength;
    this.append("stdout", bytes);
    this.stdoutRemainder = Buffer.concat([this.stdoutRemainder, bytes]);
    while (true) {
      const end = this.stdoutRemainder.indexOf(0x0a);
      if (end < 0) break;
      const line = this.stdoutRemainder.subarray(0, end);
      this.stdoutRemainder = this.stdoutRemainder.subarray(end + 1);
      try { this.acceptMessage(rawJsonLine(line), line); }
      catch (error) { this.fail(error); }
    }
  }

  captureStderr(bytes) {
    if (this.failure) return;
    this.stderrHash.update(bytes);
    this.stderrBytes += bytes.byteLength;
    this.append("stderr", bytes);
  }

  acceptMessage(message, bytes) {
    const item = {
      direction: "stdout",
      sequence: this.messages.length + 1,
      wireSha256: createHash("sha256").update(bytes).digest("hex"),
      message,
    };
    this.messages.push(item);
    if (Object.prototype.hasOwnProperty.call(message, "id")) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (Object.prototype.hasOwnProperty.call(message, "error")) pending.reject(new TransportCaptureError("CAPTURE_RPC_ERROR", message.error));
        else if (Object.prototype.hasOwnProperty.call(message, "result")) pending.resolve({ result: message.result, wire: item });
        else pending.reject(new TransportCaptureError("CAPTURE_RPC_RESPONSE_SCHEMA_INVALID"));
        return;
      }
    }
    if (typeof message.method === "string" && !Object.prototype.hasOwnProperty.call(message, "id")) {
      this.notifications.push(item);
      return;
    }
    // The peer may send a server request.  The feasibility spike does not
    // fulfill server requests, because doing so could add side effects.  It
    // remains in raw evidence and makes any affected observation incomplete.
    if (typeof message.method === "string") {
      this.fail(new TransportCaptureError("CAPTURE_UNHANDLED_SERVER_REQUEST", message.method));
      return;
    }
    this.fail(new TransportCaptureError("CAPTURE_JSONRPC_MESSAGE_INVALID"));
  }

  async send(message) {
    if (this.failure) throw this.failure;
    if (this.closed || !this.child) throw new TransportCaptureError("CAPTURE_TRANSPORT_CLOSED");
    const bytes = Buffer.from(JSON.stringify(message) + "\n", "utf8");
    this.stdinHash.update(bytes);
    this.stdinBytes += bytes.byteLength;
    await this.append("stdin", bytes);
    const child = this.child;
    if (!child.stdin.write(bytes)) await new Promise((resolve, reject) => {
      child.stdin.once("drain", resolve);
      child.stdin.once("error", reject);
    });
  }

  async notify(method, params) {
    await this.send({ method, params });
  }

  async request(method, params, { timeoutMs = this.timeoutMs } = {}) {
    if (this.failure) throw this.failure;
    const id = this.nextId++;
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new TransportCaptureError("CAPTURE_RPC_TIMEOUT", method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
    try { await this.send({ method, id, params }); }
    catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      throw error;
    }
    return response;
  }

  async waitForNotification(predicate, { timeoutMs = this.timeoutMs } = {}) {
    const existing = this.notifications.find((item) => predicate(item.message));
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const timer = setInterval(() => {
        if (this.failure) {
          clearInterval(timer);
          reject(this.failure);
          return;
        }
        const found = this.notifications.find((item) => predicate(item.message));
        if (found) {
          clearInterval(timer);
          resolve(found);
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(timer);
          reject(new TransportCaptureError("CAPTURE_NOTIFICATION_TIMEOUT"));
        }
      }, 5);
    });
  }

  async close() {
    if (this.closed) return this.summary();
    this.closed = true;
    const child = this.child;
    try { child.stdin.end(); } catch {}
    try {
      const closed = await waitForChildCloseAfterClose(child, this.closePromise, this.timeoutMs, this.terminateProcessTreeFn);
      this.processTreeCleanup = closed.processTreeCleanup;
    } catch (error) {
      this.processTreeCleanup = error?.detail?.processTreeCleanup ?? error?.detail?.cleanup ?? null;
      this.fail(error);
    }
    await Promise.all(Object.values(this.writeChains));
    if (this.stdoutRemainder.byteLength !== 0 && !this.failure) this.fail(new TransportCaptureError("CAPTURE_UNTERMINATED_JSONL"));
    await Promise.all(Object.values(this.handles).map((handle) => handle.close()));
    this.child = null;
    if (this.failure) throw this.failure;
    return this.summary();
  }

  summary() {
    return {
      version: TRANSPORT_CAPTURE_VERSION,
      captureInstanceId: this.instanceId,
      observedAt: this.startedAt,
      endedAt: this.now(),
      observedLaunch: this.observedLaunch,
      process: { pid: this.childPid, exitCode: this.exit?.code ?? null, signal: this.exit?.signal ?? null },
      processTreeCleanup: this.processTreeCleanup,
      rawTransport: {
        stdin: { path: this.paths.stdin, sha256: digestOf(this.stdinHash), bytes: this.stdinBytes },
        stdout: { path: this.paths.stdout, sha256: digestOf(this.stdoutHash), bytes: this.stdoutBytes },
        stderr: { path: this.paths.stderr, sha256: digestOf(this.stderrHash), bytes: this.stderrBytes },
      },
      messages: this.messages,
    };
  }
}

/**
 * Start the actual App Server child.  The caller must compute and persist the
 * pre-launch record before this function is called.  `observedLaunch` is
 * created from the capture layer's own spawn arguments, rather than from a
 * value emitted by the App Server subprocess.
 */
export async function startAppServerCapture({ launch, artifacts, timeoutMs = 30000, spawnFn = spawn, openFile = open, now = () => new Date().toISOString(), terminateProcessTreeFn = terminateWindowsProcessTree }) {
  if (!plainObject(launch) || !plainObject(artifacts)) throw new TransportCaptureError("CAPTURE_ARGUMENT_INVALID");
  const executable = safeString(launch.executable, "CAPTURE_EXECUTABLE_INVALID");
  if (!Array.isArray(launch.args) || launch.args.some((item) => typeof item !== "string" || item.includes("\0"))) throw new TransportCaptureError("CAPTURE_ARGS_INVALID");
  const cwd = safeString(launch.cwd, "CAPTURE_CWD_INVALID");
  const codeHome = safeString(launch.codeHome, "CAPTURE_CODEX_HOME_INVALID");
  const sandboxProfile = safeString(launch.sandboxProfile, "CAPTURE_SANDBOX_PROFILE_INVALID");
  const codeHomeProfile = safeString(launch.codeHomeProfile, "CAPTURE_CODEX_HOME_PROFILE_INVALID");
  if (launch.model !== null && launch.model !== undefined && (typeof launch.model !== "string" || !launch.model || launch.model.includes("\0"))) throw new TransportCaptureError("CAPTURE_MODEL_INVALID");
  for (const key of ["stdin", "stdout", "stderr"]) safeString(artifacts[key], "CAPTURE_ARTIFACT_PATH_INVALID");
  const handles = {
    stdin: await openFile(artifacts.stdin, "wx", 0o600),
    stdout: await openFile(artifacts.stdout, "wx", 0o600),
    stderr: await openFile(artifacts.stderr, "wx", 0o600),
  };
  const observedLaunch = {
    executable,
    args: [...launch.args],
    cwd,
    codeHome,
    codeHomeProfile,
    sandboxProfile,
    model: launch.model ?? null,
  };
  let child;
  try {
    child = spawnFn(executable, launch.args, {
      cwd,
      env: { ...process.env, CODEX_HOME: codeHome },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    await Promise.all(Object.values(handles).map((handle) => handle.close()));
    throw new TransportCaptureError("CAPTURE_SPAWN_FAILED", typeof error?.code === "string" ? error.code : null);
  }
  return new JsonRpcTransport({ child, handles, paths: artifacts, observedLaunch, timeoutMs, now, terminateProcessTreeFn });
}

export function transportLaunchMatchesPrelaunch(transportLaunch, prelaunchLaunch) {
  return sameJson(transportLaunch, prelaunchLaunch);
}
