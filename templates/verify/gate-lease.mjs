#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

// 書き手・監査・解放で保存先を共有する。既定値も環境変数指定時と同じ契約で扱う。
export function gateWorktreeRoot(root) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", shell: false });
  return result.status === 0 && result.stdout.trim() ? resolve(result.stdout.trim()) : resolve(root);
}

export function gateStateDir(root, kind) {
  if (!["coding", "figma"].includes(kind)) throw new Error(`未知のgate種別です: ${kind}`);
  const key = kind === "coding" ? "CODING_GATE_STATE_DIR" : "FIGMA_GATE_STATE_DIR";
  const configured = process.env[key]?.trim();
  if (configured) {
    if (!isAbsolute(configured)) throw new Error(`${key} は絶対パスである必要があります。`);
    return resolve(configured);
  }
  if (kind === "figma") return resolve(root, ".figma-gate");
  const worktree = gateWorktreeRoot(root);
  const identity = process.platform === "win32" ? worktree.toLowerCase() : worktree;
  return resolve(tmpdir(), `coding-rule-gate-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`);
}

// active/<id>.json、旧active.jsonを読む。closed/は依存の完了確認でのみ読む。
// 無効JSONやアクセス拒否を「受領証なし」に変換しない。解放側も同じ安全側の判定を使う。
export function gateReceipts(root, kind, { includeClosed = false } = {}) {
  const bases = [...new Set([gateStateDir(root, kind), resolve(root, `.${kind}-gate`)])];
  const found = [];
  const read = (path, archived) => {
    let source;
    try { source = readFileSync(path, "utf8"); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    const state = JSON.parse(source);
    if (!state || typeof state !== "object" || Array.isArray(state) || typeof state.manifestId !== "string" || typeof state.phase !== "string") {
      throw new Error(`gate受領証の形式が不正です: ${path}`);
    }
    // 明示的に別案件の受領証なら停止する。共有した外部保存先で他案件を書き換えない。
    const normalize = (value) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
    if (state.repository && normalize(state.repository) !== normalize(root)) {
      throw new Error(`gate受領証のrepositoryが一致しません: ${path}`);
    }
    found.push({ kind, path, state, archived });
  };
  const readDirectory = (base, bucket) => {
    const directory = resolve(base, bucket);
    let names;
    try { names = readdirSync(directory); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const name of names.filter((name) => name.endsWith(".json")).sort()) read(resolve(directory, name), bucket === "closed");
  };
  for (const base of bases) {
    readDirectory(base, "active");
    read(resolve(base, "active.json"), false);
  }
  if (includeClosed) for (const base of bases) readDirectory(base, "closed");
  return found;
}

export function gateDependencySatisfied(root, dependency) {
  if (!dependency || !["coding", "figma"].includes(dependency.gate)) return false;
  const receipts = gateReceipts(root, dependency.gate, { includeClosed: true })
    .filter(({ state }) => state.manifestId === dependency.scopeId);
  // 再開済みのscopeに古いclosedを流用しない。重複する現役形式が不一致なら安全側で拒否。
  const current = receipts.filter(({ archived }) => !archived);
  const authoritative = current.length ? current : receipts;
  return authoritative.length > 0 && authoritative.every(({ state }) => state.phase === (dependency.phase ?? "closed"));
}

// 受領証の保持を「リース」として扱う共通判定。
//
// **保持は「取ったら効き続ける」ではなく、更新し続けている間だけ効く。**
//
// なぜそうしたか。保持者が生きているかを観測する手段が無いのに、生きている前提の排他を
// かけていた。セッションは黙って死に、contextは消え、別担当は abort せずに終わる。
// そのため 2026-08-21 から 2026-09-10 までに、同じ形の詰まりを7回直している
// （受領証1枠の奪い合い / waiting のまま2日放置 / 他scopeのdirtyで全scopeがclose不可 /
// close済みの所有が19ファイルをせき止め / 受領証を持たない予約が42パスを保持 / 滞留受領証）。
// 対処は毎回「止める条件をひとつ狭める」で、そのたびに新しい死に方が残った。
// 生存の推定を足し続けるのをやめ、更新が絶えたら自動的に失効する側へ既定を反転させた。
//
// 2026-08-26 の実測が、放置しておく費用の実例である。waiting のまま2日放置された所有が
// 共有インフラをせき止め、止められた側が迂回実装を書き、ゲートはそれを通した。
// 当時の記録は「ゲートが実装品質を下げた」と結んでいる。
//
// 失効しても保持者の作業は消えない。続けるなら受領証を更新（再preflight・checkpoint）すれば
// リースは延びる。取り除いたのは「放置したまま他人を止め続けられる」状態だけである。

// リース期限（日数）。旧名 GATE_STALE_PREFLIGHT_DAYS も読む（設定済みの環境を壊さない）。
export const GATE_LEASE_DAYS = Number.parseFloat(
  process.env.GATE_LEASE_DAYS ?? process.env.GATE_STALE_PREFLIGHT_DAYS ?? "7",
);

// 受領証が最後に動いた時刻。キーは gate ごとに違うため、既知の候補すべてから最新を採る。
// coding gate は startedAt、figma gate は preflightAt、checkpoint は passedAt を書く。
// renewedAt は gate が更新のたびに書く明示キーで、無い受領証も上の実測値で判定できる。
//
// 2026-09-10: startedAt だけを見ていたため、案件の figma 受領証18件すべてで判定が
// 素通りしていた。合成fixtureだけで検査し、実データへ当てていなかったのが原因である。
export function lastActivityAt(state) {
  const stamps = [];
  const push = (value) => {
    const time = Date.parse(value ?? "");
    if (Number.isFinite(time)) stamps.push(time);
  };
  push(state?.renewedAt);
  push(state?.startedAt);
  push(state?.preflightAt);
  push(state?.amendedAt);
  for (const bucket of [state?.checkpoints, state?.sections, state?.components]) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const record of Object.values(bucket)) {
      if (!record || typeof record !== "object") continue;
      push(record.passedAt);
      push(record.renewedAt);
      push(record.closedAt);
      push(record.at);
    }
  }
  return stamps.length ? Math.max(...stamps) : null;
}

// リースが切れているなら経過日数を返す。時刻を1つも読めない受領証は判定しない（保持のまま）。
// 時刻が無いことを失効の根拠にすると、キー名を1つ知らないだけで他人の作業を奪える。
export function expiredLeaseDays(state, now = Date.now()) {
  const at = lastActivityAt(state);
  if (at === null) return null;
  const days = (now - at) / 86400000;
  return days > GATE_LEASE_DAYS ? days : null;
}
