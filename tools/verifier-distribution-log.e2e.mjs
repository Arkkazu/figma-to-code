#!/usr/bin/env node
// 配布記録の負のE2E。
//
// 固定するのは「--allow-dirty で迂回した事実と理由が、後から数えられる形で残ること」。
// 2026-09-03 まで reason は長さ検査に使われたあと捨てられていた。
// 「記録を残してください」と言いながら何も記録していなかった。

import assert from "node:assert/strict";
import {
  DISTRIBUTION_LOG_NAME,
  DISTRIBUTION_LOG_VERSION,
  appendDistributionLog,
  buildDistributionEntry,
} from "./verifier-distribution-log.mjs";

const baseEntry = {
  at: "2026-09-03T00:00:00.000Z",
  upstreamHead: "0".repeat(40),
  files: [
    { name: "b.mjs", sourceSha256: "b".repeat(64), destinationSha256: "b".repeat(64) },
    { name: "a.mjs", sourceSha256: "a".repeat(64), destinationSha256: "a".repeat(64) },
  ],
  suites: ["z.e2e.mjs", "a.e2e.mjs"],
};

// --- buildDistributionEntry ---------------------------------------------

// 通常配布は理由を持たない。使っていないのに理由だけ残さない。
const clean = buildDistributionEntry({ ...baseEntry, allowDirty: false, reason: "使われないはずの理由" });
assert.equal(clean.allowDirty, false, "通常配布は allowDirty:false");
assert.equal(clean.reason, null, "--allow-dirty を使っていなければ理由を残さない");
assert.deepEqual(clean.dirtyFiles, [], "通常配布に dirtyFiles は無い");

// **迂回したときは、事実と理由の両方が残る。**これが今回の要点。
const dirty = buildDistributionEntry({
  ...baseEntry,
  allowDirty: true,
  reason: "  新契約のWIPを案件で先に確認するため配布する  ",
  dirtyFiles: [{ name: "b.mjs", status: " M templates/verify/b.mjs" }],
});
assert.equal(dirty.allowDirty, true, "迂回した事実が残る");
assert.equal(dirty.reason, "新契約のWIPを案件で先に確認するため配布する", "理由が前後空白を除いて残る");
assert.deepEqual(dirty.dirtyFiles, [{ name: "b.mjs", status: " M templates/verify/b.mjs" }], "どのファイルが未コミットだったかが残る");

// 並びを固定する。実行ごとに順序が変わると、記録の差分が読めない。
assert.deepEqual(clean.files.map((f) => f.name), ["a.mjs", "b.mjs"], "files は名前順");
assert.deepEqual(clean.suites, ["a.e2e.mjs", "z.e2e.mjs"], "suites は名前順");

// 版と配布元を残す。「どの版から配ったか」が無いと後から追えない。
assert.equal(clean.upstreamHead, "0".repeat(40), "配布元のHEADを残す");
assert.equal(buildDistributionEntry({ ...baseEntry, upstreamHead: null }).upstreamHead, null, "HEADを取れなくても記録は作る");

// --- appendDistributionLog ----------------------------------------------

const makeIo = (initial) => {
  const store = new Map(initial ? [["log.json", initial]] : []);
  return {
    store,
    io: {
      exists: (p) => store.has(p),
      read: (p) => store.get(p),
      write: (p, text) => store.set(p, text),
      now: () => "2026-09-03T00:00:00.000Z",
    },
  };
};

// 新規作成
let { store, io } = makeIo(null);
let log = appendDistributionLog("log.json", clean, io);
assert.equal(log.version, DISTRIBUTION_LOG_VERSION, "版を持つ");
assert.equal(log.entries.length, 1, "1件目を書く");
assert.match(store.get("log.json"), /\n$/, "末尾改行つきで書く");

// **追記型。過去の記録を書き換えない。**
({ store, io } = makeIo(store.get("log.json")));
log = appendDistributionLog("log.json", dirty, io);
assert.equal(log.entries.length, 2, "2件目は追記される");
assert.equal(log.entries[0].allowDirty, false, "1件目を書き換えない");
assert.equal(log.entries[1].allowDirty, true, "2件目に迂回が残る");
assert.equal(log.entries[1].reason, "新契約のWIPを案件で先に確認するため配布する", "追記後も理由が読める");

// 後から「迂回が何回あったか」を数えられる。これができないと記録の意味が無い。
const bypasses = log.entries.filter((e) => e.allowDirty);
assert.equal(bypasses.length, 1, "迂回の件数を数えられる");
assert.ok(bypasses.every((e) => typeof e.reason === "string" && e.reason.length > 0), "迂回には必ず理由が付いている");

// 壊れた記録で配布を止めない。止めると「記録のために配布できない」逆転が起きる。
({ store, io } = makeIo("{ 壊れたJSON"));
log = appendDistributionLog("log.json", clean, io);
assert.equal(log.entries.length, 1, "壊れた記録があっても書ける");
assert.equal(log.unreadablePriorLogAt, "2026-09-03T00:00:00.000Z", "読めなかった事実を残す");

// 版が違う記録も同様に扱う（黙って混ぜない）。
({ store, io } = makeIo(JSON.stringify({ version: 999, entries: [{ at: "old" }] })));
log = appendDistributionLog("log.json", clean, io);
assert.equal(log.entries.length, 1, "版違いの記録を引き継がない");
assert.ok(log.unreadablePriorLogAt, "版違いも読めなかった扱いで事実を残す");

assert.equal(DISTRIBUTION_LOG_NAME, "verifier-distribution-log.json", "記録の置き場所名を固定する");

process.stdout.write("verifier-distribution-log.e2e: PASS\n");
