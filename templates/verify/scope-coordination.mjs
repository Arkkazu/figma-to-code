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

// lockの持ち主がまだ生きているか。生きていないlockは中断lockであり、奪ってよい。
//
// PIDの再利用で「死んでいるのに生きて見える」ことはあるが、その場合は奪わず拒否する側へ倒れる。
// 逆向き（生きているのに死んで見える）は起きないため、この判定で他人の実行中lockを壊さない。
function isLockOwnerAlive(lockPath) {
  let pid = null;
  try {
    pid = JSON.parse(readFileSync(lockPath, "utf8"))?.pid;
  } catch {
    return false; // 読めないlockは持ち主を名乗れない。中断lockとして扱う。
  }
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM は「存在するが権限が無い」。生きているとみなして奪わない。
    return error?.code === "EPERM";
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

  // 中断lockの回収。持ち主のプロセスが居なくなったlockは、誰も解放できないまま案件全体を止める。
  //
  // 実測（2026-08-29、rpa-technologies-theme）: preflight が拒否されると gate は fail() から
  // process.exit(1) を呼ぶ。下の finally は callback の return/throw でしか走らないため、
  // **拒否のたびにlockが漏れる**。実際に PID 32980 のlockが残り、別担当者のscopeが
  // 「lockを削除してよいか」を人に聞く以外に進めない状態になった。
  // 拒否経路を増やすほど頻発する欠陥なので、取得側で回収する。
  if (existsSync(lockPath) && !isLockOwnerAlive(lockPath)) {
    const owner = readLockOwner(lockPath);
    unlinkSync(lockPath);
    console.warn(`SCOPE COORDINATION: 中断lockを回収しました${owner}。持ち主のプロセスは存在しません。`);
  }

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

  // callback が process.exit() を呼ぶと finally は走らない。gate は拒否時に fail() から
  // process.exit(1) するため、finally だけでは解放されない。exit にも掛ける。
  // SIGKILL では両方走らないので、上の中断lock回収が最後の受け皿になる。
  const releaseOnExit = () => {
    try {
      if (existsSync(lockPath)) unlinkSync(lockPath);
    } catch {
      // 解放できなくても終了処理は止めない。次回の取得時に中断lockとして回収される。
    }
  };
  process.once("exit", releaseOnExit);

  try {
    return callback();
  } finally {
    process.removeListener("exit", releaseOnExit);
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
