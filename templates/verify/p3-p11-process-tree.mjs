#!/usr/bin/env node
// Bounded, PID-specific process-tree termination for the P-11 feasibility
// spike.  This is cleanup infrastructure, not P-11 authorization evidence.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

export const P11_PROCESS_TREE_VERSION = 1;

export class P11ProcessTreeError extends Error {
  constructor(code, detail = null) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function positivePid(value) {
  return Number.isInteger(value) && value > 0;
}

function waitForTaskkill(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(() => reject(new P11ProcessTreeError("PROCESS_TREE_TASKKILL_TIMEOUT")));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stdoutBytes += bytes.byteLength;
      stdout.push(bytes);
    });
    child.stderr?.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stderrBytes += bytes.byteLength;
      stderr.push(bytes);
    });
    child.once("error", (error) => finish(() => reject(new P11ProcessTreeError("PROCESS_TREE_TASKKILL_SPAWN_FAILED", typeof error?.code === "string" ? error.code : null))));
    child.once("close", (exitCode, signal) => finish(() => {
      const stdoutValue = Buffer.concat(stdout);
      const stderrValue = Buffer.concat(stderr);
      resolve({
        exitCode,
        signal,
        stdout: { bytes: stdoutBytes, sha256: sha256(stdoutValue) },
        stderr: { bytes: stderrBytes, sha256: sha256(stderrValue) },
      });
    }));
  });
}

/**
 * Request termination of precisely one supervisor-owned Windows process tree.
 * The caller must separately observe its target's `close` event before
 * claiming cleanup succeeded.  No image-name, wildcard, shell, or config
 * supplied process selector is accepted.
 */
export async function terminateWindowsProcessTree(pid, {
  spawnFn = spawn,
  timeoutMs = 10000,
  platform = process.platform,
} = {}) {
  if (!positivePid(pid)) throw new P11ProcessTreeError("PROCESS_TREE_PID_INVALID");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw new P11ProcessTreeError("PROCESS_TREE_TIMEOUT_INVALID");
  if (platform !== "win32") throw new P11ProcessTreeError("PROCESS_TREE_WINDOWS_TASKKILL_UNAVAILABLE", platform);
  let taskkill;
  try {
    taskkill = spawnFn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new P11ProcessTreeError("PROCESS_TREE_TASKKILL_SPAWN_FAILED", typeof error?.code === "string" ? error.code : null);
  }
  const taskkillResult = await waitForTaskkill(taskkill, timeoutMs);
  return {
    version: P11_PROCESS_TREE_VERSION,
    platform: "win32",
    targetPid: pid,
    method: "taskkill.exe /pid <supervisor-owned-pid> /t /f",
    taskkill: taskkillResult,
    requested: taskkillResult.exitCode === 0 && taskkillResult.signal === null,
  };
}
