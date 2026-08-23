import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function coordinationPath(root = process.cwd()) {
  return resolve(root, "MyBrain/verify/scope-coordination.json");
}

function preflightLockPath(root = process.cwd()) {
  return resolve(root, ".scope-coordination", "preflight.lock");
}

export function readScopeCoordination(root = process.cwd()) {
  const path = coordinationPath(root);
  if (!existsSync(path)) throw new Error(`scope coordination台帳がありません: ${path}`);
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.scopes)) {
      throw new Error("scopes 配列がありません。");
    }
    return { path, data };
  } catch (error) {
    throw new Error(`scope coordination台帳を読めません: ${error.message}`);
  }
}

function deriveStatus(entry) {
  const gates = entry.gates;
  if (!gates || typeof gates !== "object" || Array.isArray(gates)) return entry.status;
  const states = Object.values(gates);
  if (states.includes("active")) return "active";
  if (states.includes("waiting")) return "waiting";
  if (states.length > 0 && states.every((state) => state === "closed")) return "closed";
  if (states.includes("aborted")) return "aborted";
  return entry.status;
}

function readLockOwner(lockPath) {
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const details = [lock?.gateKind, lock?.manifestPath, lock?.pid].filter(Boolean).join(" / ");
    return details ? ` (${details})` : "";
  } catch {
    return "";
  }
}

/**
 * Figma / coding のpreflightは同一の排他ロック内で、監査から受領証作成までを実行する。
 * 同時に二つの監査がPASSして一方がもう一方の受領証を上書きするraceを防ぐ。
 * lockが残っている場合は自動削除せず、安全側に停止する。
 */
export function withScopePreflightLock({ root = process.cwd(), gateKind, manifestPath }, callback) {
  if (!["figma", "coding"].includes(gateKind)) throw new Error(`未知のgate種別です: ${gateKind}`);
  const lockPath = preflightLockPath(root);
  mkdirSync(dirname(lockPath), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx");
    writeFileSync(descriptor, `${JSON.stringify({ gateKind, manifestPath, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
  } catch (error) {
    // Windowsではopen中のlockを削除できない。write失敗時は先にfdを閉じてから片付ける。
    if (descriptor !== undefined) {
      closeSync(descriptor);
      descriptor = undefined;
      if (existsSync(lockPath)) unlinkSync(lockPath);
    }
    if (error?.code === "EEXIST") {
      throw new Error(`別のscopeのpreflightが実行中または中断lockが残っています: ${lockPath}${readLockOwner(lockPath)}`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }

  try {
    return callback();
  } finally {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }
}

// scope-conflict-audit.mjs と同じ解決規則。両ゲートを使うscopeでは、ゲート種別ごとに
// manifest が別ファイルになるため、gateManifestPaths の宣言があればそちらを正とする。
function entryManifestPath(entry, gateKind) {
  const perGate = entry?.gateManifestPaths;
  if (perGate && typeof perGate === "object" && !Array.isArray(perGate) && typeof perGate[gateKind] === "string") {
    return perGate[gateKind];
  }
  return entry?.manifestPath;
}

function findReservedEntry({ root, scopeId, gateKind, actor, contextId, manifestPath }) {
  const { path, data } = readScopeCoordination(root);
  const entry = data.scopes.find((scope) => scope?.id === scopeId);
  if (!entry) throw new Error(`scope coordination台帳に scope がありません: ${scopeId}`);
  if (entry.actor !== actor) throw new Error(`${scopeId} のactorがscope coordination台帳と一致しません。`);
  if (entry.implementationContextId !== contextId) throw new Error(`${scopeId} のimplementationContextIdがscope coordination台帳と一致しません。`);
  const expectedManifestPath = entryManifestPath(entry, gateKind);
  if (expectedManifestPath !== manifestPath) throw new Error(`${scopeId} の ${gateKind} gate のmanifestPathがscope coordination台帳と一致しません（台帳: ${expectedManifestPath}）。`);
  if (!entry.gates || typeof entry.gates !== "object" || Array.isArray(entry.gates) || !["active", "waiting", "aborted"].includes(entry.gates[gateKind])) {
    throw new Error(`${scopeId} は${gateKind} gateをactive、waiting、またはabortedとして予約していません。`);
  }
  return { path, data, entry };
}

export function markCoordinationGateActive({ root = process.cwd(), scopeId, gateKind, actor, contextId, manifestPath }) {
  if (!["figma", "coding"].includes(gateKind)) throw new Error(`未知のgate種別です: ${gateKind}`);
  const { path, data, entry } = findReservedEntry({ root, scopeId, gateKind, actor, contextId, manifestPath });
  entry.gates[gateKind] = "active";
  entry.status = deriveStatus(entry);
  data.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { status: entry.status, gateState: entry.gates[gateKind] };
}

export function markCoordinationGateClosed({ root = process.cwd(), scopeId, gateKind, actor, contextId, manifestPath }) {
  if (!["figma", "coding"].includes(gateKind)) throw new Error(`未知のgate種別です: ${gateKind}`);
  const { path, data, entry } = findReservedEntry({ root, scopeId, gateKind, actor, contextId, manifestPath });
  entry.gates[gateKind] = "closed";
  entry.status = deriveStatus(entry);
  data.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { status: entry.status, gateState: entry.gates[gateKind] };
}

export function markCoordinationGateAborted({ root = process.cwd(), scopeId, gateKind, actor, contextId, manifestPath }) {
  if (!["figma", "coding"].includes(gateKind)) throw new Error(`未知のgate種別です: ${gateKind}`);
  const { path, data, entry } = findReservedEntry({ root, scopeId, gateKind, actor, contextId, manifestPath });
  if (entry.gates[gateKind] !== "active") throw new Error(`${scopeId} は${gateKind} gateをactiveとして保持していないためabortできません。`);
  entry.gates[gateKind] = "aborted";
  entry.status = deriveStatus(entry);
  data.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { status: entry.status, gateState: entry.gates[gateKind] };
}
