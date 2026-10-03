import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gateReceipts } from "./gate-lease.mjs";

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
  // 実測（2026-08-29、案件側）: preflight が拒否されると gate は fail() から
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
  if (!entry.gates || typeof entry.gates !== "object" || Array.isArray(entry.gates) || !["active", "waiting", "aborted", "suspended"].includes(entry.gates[gateKind])) {
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
  // suspended（中断）も abort できる。再開しないと決めたときの出口が無いと、
  // 中断した scope は台帳に残り続ける（2026-09-02 実測: 3件が該当）。
  if (!["active", "suspended"].includes(entry.gates[gateKind])) {
    throw new Error(`${scopeId} は${gateKind} gateをactiveまたはsuspendedとして保持していないためabortできません。`);
  }
  entry.gates[gateKind] = "aborted";
  entry.status = deriveStatus(entry);
  data.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { status: entry.status, gateState: entry.gates[gateKind] };
}

// ---------------------------------------------------------------------------
// scope の解放（release）
//
// 2026-09-05 まで、予約を解放する手段は**どのエージェントにも無かった**。
// `markCoordinationGateAborted` は export されているだけで呼び出し元が1件も無い死んだ関数で、
// figma-gate に abort コマンドは無く、実際の解放は `scope-coordination.json` を手で書き換え、
// 受領証ファイルを `aborted-scopes/` へ手で移すという未記録の操作で行われていた
// （案件実測: `aborted-scopes/` に16ファイルが手作業で積まれている）。
//
// その結果、放置された予約に当たった実装役は「担当の codex 側で close / abort してください」
// としか言えず、オーナーが担当者間の配車係になっていた。**だがその codex にも同じだけの
// 機構しか無い。**手で JSON を編集する以上の手段が存在しないのだから、
// 「担当だから解放できる」という前提自体が成り立っていない。
//
// したがって解放は権限ではなく記録の問題として扱う。**どのactorでも解放できる。**
// 代わりに、誰がどのactorの予約をなぜ解放したかを台帳へ追記で残し、
// 実行済みcheckpointを持つ受領証を捨てるときだけ明示フラグを要求する。
// これは上の「中断lockの回収」（持ち主のプロセスが居ないlockは奪ってよい）と同じ方針である。

function executedCount(state) {
  return [state?.checkpoints, state?.sections, state?.components]
    .filter((value) => value && typeof value === "object")
    .reduce((total, value) => total + (Array.isArray(value) ? value.length : Object.keys(value).length), 0);
}

// live な受領証（phase が closed / aborted 以外）を、ファイルの場所ごと返す。
// 台帳だけ aborted にしても受領証が active に残れば claim は解放されないため、
// 解放は必ず両方を動かす。
export function liveReceiptsOf(root, scopeId) {
  const found = [];
  for (const gateKind of ["figma", "coding"]) {
    for (const { path, state } of gateReceipts(root, gateKind)) {
      if (String(state?.manifestId ?? "") !== scopeId) continue;
      if (["closed", "aborted"].includes(state?.phase)) continue;
      found.push({ gateKind, path, phase: state?.phase ?? "phase不明", executed: executedCount(state) });
    }
  }
  return found;
}

// 宣言されている manifest を全部見て、いちばん新しいものを活動の目安にする。
//
// gate種別ごとに manifest が分かれる scope があるため、1本だけ見ると
// 「片方が存在しない」を「活動が不明」に丸めてしまう。実測（2026-09-05）:
// ある scope の `gateManifestPaths.coding` が実在しないファイルを指しており、
// 放置9.4日の scope が一覧で「manifest不明」になっていた。存在しない宣言は
// 隠さず missing として返す。scope-conflict-audit も同じ宣言を読むため、これは
// その scope が preflight できない状態でもある。
function manifestActivity(root, entry) {
  const candidates = new Set();
  for (const gateKind of ["figma", "coding"]) {
    const declared = entryManifestPath(entry, gateKind);
    if (typeof declared === "string" && declared.trim() !== "") candidates.add(declared);
  }
  if (typeof entry?.manifestPath === "string" && entry.manifestPath.trim() !== "") candidates.add(entry.manifestPath);

  let newest = null;
  const missing = [];
  for (const relativePath of candidates) {
    try {
      const mtime = statSync(resolve(root, relativePath)).mtimeMs;
      if (newest === null || mtime > newest) newest = mtime;
    } catch {
      missing.push(relativePath);
    }
  }
  return {
    ageDays: newest === null ? null : (Date.now() - newest) / 86400000,
    missingManifests: missing,
  };
}

/**
 * 予約中（active / waiting）の scope を、受領証の有無と放置日数つきで一覧する。
 * 「誰に頼めばよいか」ではなく「どれが実際に動いていないか」を出すための一覧である。
 */
export function listReservations({ root = process.cwd() } = {}) {
  const { data } = readScopeCoordination(root);
  return data.scopes
    .filter((entry) => ["active", "waiting"].includes(entry?.status))
    .map((entry) => ({
      id: entry.id,
      actor: entry.actor,
      status: entry.status,
      gates: entry.gates ?? {},
      ...manifestActivity(root, entry),
      receipts: liveReceiptsOf(root, entry.id),
    }))
    .sort((left, right) => (right.ageDays ?? -1) - (left.ageDays ?? -1));
}

/**
 * scope を解放する。actor の一致は要求しない。
 *
 * 実行済みcheckpointを持つ受領証がある場合は、破棄する中身を全部出したうえで
 * `force` を要求する。守るべきは「担当者の縄張り」ではなく「検証済みの結果」である。
 */
export function releaseScope({ root = process.cwd(), scopeId, releasedBy, reason, force = false }) {
  if (typeof scopeId !== "string" || scopeId.trim() === "") throw new Error("解放する scope の id が必要です。");
  if (typeof releasedBy !== "string" || releasedBy.trim() === "") throw new Error("解放したactorを --by で渡してください。");
  if (typeof reason !== "string" || reason.trim() === "") throw new Error("解放の理由を --reason で渡してください。");

  const { path, data } = readScopeCoordination(root);
  const entry = data.scopes.find((scope) => scope?.id === scopeId);
  if (!entry) throw new Error(`scope coordination台帳に scope がありません: ${scopeId}`);
  if (["closed", "aborted"].includes(entry.status)) {
    throw new Error(`${scopeId} は既に ${entry.status} です。解放するものがありません。`);
  }

  const receipts = liveReceiptsOf(root, scopeId);
  const executed = receipts.filter((receipt) => receipt.executed > 0);
  if (executed.length > 0 && !force) {
    const detail = executed.map((receipt) => `${receipt.gateKind}:${receipt.phase}（実行済み ${receipt.executed} 件）`).join("、");
    throw new Error(
      `${scopeId} は実行済みの検証結果を持つ受領証を保持しています: ${detail}。`
      + " 捨てるなら --force を付けます。close で再実行できる場合は、解放ではなく close を選びます。",
    );
  }

  const releasedGates = [];
  for (const [gateKind, state] of Object.entries(entry.gates ?? {})) {
    if (!["active", "waiting", "suspended"].includes(state)) continue;
    entry.gates[gateKind] = "aborted";
    releasedGates.push(`${gateKind}:${state}→aborted`);
  }
  entry.status = "aborted";

  // 台帳だけ aborted にしても、受領証が active に残れば claim は解放されない。
  // 解放は必ず両方を動かす。
  const movedReceipts = [];
  const archiveDirectory = resolve(root, "MyBrain/verify/aborted-scopes");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const receipt of receipts) {
    mkdirSync(archiveDirectory, { recursive: true });
    const destination = resolve(archiveDirectory, `${scopeId}-${receipt.gateKind}-receipt-${stamp}.json`);
    renameSync(receipt.path, destination);
    movedReceipts.push(destination);
  }

  // 追記のみ。誰がどのactorの予約をなぜ解放したかが後から辿れないと、
  // 「勝手に消された」と「放置を片付けた」を区別できない。
  entry.releases = Array.isArray(entry.releases) ? entry.releases : [];
  entry.releases.push({
    by: releasedBy,
    from: entry.actor,
    reason,
    at: new Date().toISOString(),
    gates: releasedGates,
    discardedReceipts: executed.map((receipt) => `${receipt.gateKind}:${receipt.phase}（実行済み ${receipt.executed} 件）`),
  });

  data.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { scopeId, status: entry.status, releasedGates, movedReceipts, discarded: executed };
}

function runCli(argv) {
  const [command, ...rest] = argv;
  const root = process.cwd();
  if (command === "list") {
    const rows = listReservations({ root });
    console.log(`予約中の scope ${rows.length} 件（放置日数の長い順）`);
    for (const row of rows) {
      const age = row.ageDays === null ? "実在するmanifestなし" : `${row.ageDays.toFixed(1)}日`;
      const receipts = row.receipts.length
        ? row.receipts.map((receipt) => `${receipt.gateKind}:${receipt.phase}(実行済み ${receipt.executed})`).join(", ")
        : "受領証なし";
      console.log(`  ${row.id} / ${row.actor} / ${row.status} / manifest最終更新 ${age} / ${receipts}`);
      if (row.missingManifests.length > 0) {
        console.log(`      台帳が実在しないmanifestを指しています: ${row.missingManifests.join("、")}（この scope は preflight できません）`);
      }
    }
    console.log('解放: node MyBrain/verify/scope-coordination.mjs release <scopeId> --by <actor> --reason "..."');
    return 0;
  }
  if (command === "release") {
    const scopeId = rest.find((value) => !value.startsWith("--"));
    const valueOf = (flag) => {
      const index = rest.indexOf(flag);
      return index >= 0 ? rest[index + 1] : undefined;
    };
    const result = releaseScope({
      root,
      scopeId,
      releasedBy: valueOf("--by"),
      reason: valueOf("--reason"),
      force: rest.includes("--force"),
    });
    console.log(`RELEASED: ${result.scopeId} / ${result.status} / ${result.releasedGates.join("、") || "解放したgateなし"}`);
    for (const moved of result.movedReceipts) console.log(`  受領証を退避: ${moved}`);
    for (const discarded of result.discarded) console.log(`  破棄した検証結果: ${discarded.gateKind}:${discarded.phase}（実行済み ${discarded.executed} 件）`);
    return 0;
  }
  console.error('Usage: node MyBrain/verify/scope-coordination.mjs <list | release <scopeId> --by <actor> --reason "..." [--force]>');
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.exit(runCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
}
