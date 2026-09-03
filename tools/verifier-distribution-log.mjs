// 配布記録の組み立てと追記。
//
// verifier-distribute.mjs は先頭から手続きが走るスクリプトで、import すると
// process.exit(2) に当たる。負のE2Eから直接叩けるよう、純粋な部分だけを分ける。
//
// 2026-09-03 まで、`--allow-dirty --reason "<20文字以上>"` の理由は長さ検査に
// 使われたあと**一度も参照されず捨てられていた**。「記録を残してください」と
// 言いながら何も記録しておらず、「未コミットの検証器がいつ・なぜ案件へ配られたか」を
// 後から数えられなかった。2026-08-26 に案件のゲートを2回全面停止させた事故はこの型で、
// その再発防止に作った仕組みが、迂回された証跡を持っていなかった。

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const DISTRIBUTION_LOG_NAME = "verifier-distribution-log.json";
export const DISTRIBUTION_LOG_VERSION = 1;

export function fileSha256(path, read = readFileSync) {
  return createHash("sha256").update(read(path)).digest("hex");
}

// 追記1件分を組み立てる純関数。値の取得と書き込みから分けてあるので、
// 「未コミット配布が理由つきで記録に残ること」を負のE2Eで直接固定できる。
export function buildDistributionEntry({ at, upstreamHead, files, allowDirty, reason, dirtyFiles, suites }) {
  return {
    at,
    upstreamHead: upstreamHead ?? null,
    allowDirty: Boolean(allowDirty),
    // --allow-dirty を使ったときだけ理由を持つ。使っていないのに理由だけ残さない。
    reason: allowDirty ? String(reason ?? "").trim() : null,
    files: [...files].sort((a, b) => a.name.localeCompare(b.name)),
    dirtyFiles: [...(dirtyFiles ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    suites: [...(suites ?? [])].sort(),
  };
}

// 追記型。既存を読み、末尾へ足して書き戻す。過去の記録を書き換えない。
export function appendDistributionLog(path, entry, io = {}) {
  const read = io.read ?? ((p) => readFileSync(p, "utf8"));
  const write = io.write ?? ((p, text) => writeFileSync(p, text, "utf8"));
  const has = io.exists ?? existsSync;
  const now = io.now ?? (() => new Date().toISOString());

  let log = { version: DISTRIBUTION_LOG_VERSION, entries: [] };
  if (has(path)) {
    try {
      const parsed = JSON.parse(read(path));
      if (parsed?.version === DISTRIBUTION_LOG_VERSION && Array.isArray(parsed.entries)) log = parsed;
      else log = { version: DISTRIBUTION_LOG_VERSION, entries: [], unreadablePriorLogAt: now() };
    } catch {
      // 壊れた記録で配布を止めない。止めると「記録のために配布できない」という逆転が起きる。
      // 読めなかった事実だけ残す。
      log = { version: DISTRIBUTION_LOG_VERSION, entries: [], unreadablePriorLogAt: now() };
    }
  }
  log.entries = [...log.entries, entry];
  write(path, `${JSON.stringify(log, null, 2)}\n`);
  return log;
}
