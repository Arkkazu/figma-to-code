#!/usr/bin/env node
// scope-coordination.e2e.mjs — scope の解放（release）契約を固定する負のE2E。
//
// 2026-09-05: 予約を解放する手段が**どのエージェントにも無かった**。
// `markCoordinationGateAborted` は呼び出し元ゼロの死んだ関数で、gate に abort コマンドは無く、
// 実際の解放は台帳と受領証ファイルを手で書き換える未記録の操作だった。そのため放置された
// 予約に当たった実装役は「担当のエージェント側で abort してください」としか言えず、
// オーナーが担当者間の配車係になっていた。渡された側にも同じ機構しか無いのだから、
// 「担当だから解放できる」という前提自体が成り立っていない。
//
// 固定するのは次の5点。
//   (a) 別actorでも解放できる（actor一致を解放の条件にしない）
//   (b) 解放は台帳と受領証の両方を動かす（片方だけでは claim が残る）
//   (c) 誰がどのactorの予約をなぜ解放したかを追記で残す
//   (d) 実行済みの検証結果を持つ受領証は --force 無しで捨てさせない
//   (e) list は「誰に頼むか」ではなく「どれが動いていないか」を出す

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "scope-coordination-e2e-"));
const verifyDirectory = join(repo, "MyBrain", "verify");
const modulePath = join(verifyDirectory, "scope-coordination.mjs");
const failures = [];

function check(label, condition, detail) {
  if (condition) return;
  failures.push(`${label}: ${detail}`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readLedger() {
  return JSON.parse(readFileSync(join(verifyDirectory, "scope-coordination.json"), "utf8"));
}

function cli(...args) {
  return spawnSync(process.execPath, [modulePath, ...args], { cwd: repo, encoding: "utf8" });
}

function seed({ checkpoints = {} } = {}) {
  rmSync(join(repo, ".figma-gate"), { recursive: true, force: true });
  rmSync(join(repo, "MyBrain", "verify", "aborted-scopes"), { recursive: true, force: true });
  writeJson(join(verifyDirectory, "coding-codex-stale.json"), {
    id: "codex-stale",
    scope: { changeTargets: ["assets/css/common.css"], implementationActor: "codex", implementationContextId: "ctx-codex" },
  });
  writeJson(join(verifyDirectory, "scope-coordination.json"), {
    version: 1,
    actors: ["claude", "codex"],
    scopes: [
      {
        id: "codex-stale",
        actor: "codex",
        status: "active",
        implementationContextId: "ctx-codex",
        manifestPath: "MyBrain/verify/coding-codex-stale.json",
        gates: { figma: "active" },
      },
    ],
  });
  writeJson(join(repo, ".figma-gate", "active", "codex-stale.json"), {
    version: 5,
    phase: "preflight",
    manifestId: "codex-stale",
    changeTargets: ["assets/css/common.css"],
    checkpoints,
  });
}

try {
  mkdirSync(verifyDirectory, { recursive: true });
  writeFileSync(modulePath, readFileSync(resolve(templateDirectory, "scope-coordination.mjs"), "utf8"), "utf8");

  // (a)(b)(c) 別actor（claude）が codex の放置予約を解放できる。台帳と受領証の両方が動き、
  //           誰がどのactorの予約をなぜ解放したかが追記で残る。
  seed();
  let result = cli("release", "codex-stale", "--by", "claude", "--reason", "9日放置で受領証にcheckpointが無い");
  check("別actorが解放できる", result.status === 0, `PASSするはずが exit ${result.status} / ${result.stderr}`);
  let entry = readLedger().scopes[0];
  check("台帳が aborted になる", entry.status === "aborted" && entry.gates.figma === "aborted", `台帳が動いていない: ${JSON.stringify(entry.gates)} / ${entry.status}`);
  check("受領証が active から外れる", !existsSync(join(repo, ".figma-gate", "active", "codex-stale.json")), "受領証が active に残っている");
  check("受領証を退避している", existsSync(join(verifyDirectory, "aborted-scopes")) && readdirSync(join(verifyDirectory, "aborted-scopes")).length === 1, "退避先に受領証が無い");
  check("解放の記録", entry.releases?.[0]?.by === "claude" && entry.releases[0].from === "codex" && typeof entry.releases[0].reason === "string" && entry.releases[0].reason !== "", `by / from / reason が残っていない: ${JSON.stringify(entry.releases)}`);

  // (d) 実行済みの検証結果を持つ受領証は、--force 無しで捨てさせない。
  //     守るのは「担当者の縄張り」ではなく「検証済みの結果」である。
  seed({ checkpoints: { "hero": {}, "footer": {} } });
  result = cli("release", "codex-stale", "--by", "claude", "--reason", "片付け");
  check("実行済みは force 無しで拒否", result.status === 1, `FAILするはずが exit ${result.status} / ${result.stdout}`);
  check("破棄する中身の提示", result.stderr.includes("実行済み 2 件"), `破棄内容を出していない: ${result.stderr}`);
  check("拒否時は台帳を変えない", readLedger().scopes[0].status === "active", "拒否したのに台帳が動いた");
  check("拒否時は受領証を残す", existsSync(join(repo, ".figma-gate", "active", "codex-stale.json")), "拒否したのに受領証を動かした");

  // (d-2) --force を付ければ通り、何を捨てたかが記録に残る。
  result = cli("release", "codex-stale", "--by", "claude", "--reason", "再実行できるため破棄", "--force");
  check("force で解放できる", result.status === 0, `PASSするはずが exit ${result.status} / ${result.stderr}`);
  entry = readLedger().scopes[0];
  check("破棄の記録", (entry.releases?.[0]?.discardedReceipts ?? []).some((value) => value.includes("実行済み 2 件")), `破棄を記録していない: ${JSON.stringify(entry.releases)}`);

  // (e) 理由と by は必須。誰が何のために解放したか分からない解放を作らない。
  seed();
  result = cli("release", "codex-stale", "--by", "claude");
  check("理由なしは拒否", result.status === 1, `FAILするはずが exit ${result.status}`);
  result = cli("release", "codex-stale", "--reason", "片付け");
  check("byなしは拒否", result.status === 1, `FAILするはずが exit ${result.status}`);
  check("解放していない", readLedger().scopes[0].status === "active", "拒否したのに台帳が動いた");

  // (f) list は担当者ではなく「動いていないか」を出す。受領証の有無と放置日数を必ず含める。
  result = cli("list");
  check("list が動く", result.status === 0, `PASSするはずが exit ${result.status} / ${result.stderr}`);
  check("list に放置日数", result.stdout.includes("manifest最終更新"), `放置日数が無い: ${result.stdout}`);
  check("list に受領証の状態", result.stdout.includes("figma:preflight"), `受領証の状態が無い: ${result.stdout}`);
  check("list に解放手順", result.stdout.includes("release <scopeId> --by"), `解放手順を出していない: ${result.stdout}`);

  // (f-2) 台帳が実在しないmanifestを指している行を「不明」に丸めない。
  //       実測（2026-09-05）: service-detail-fixed-cta-20260826 の gateManifestPaths.coding が
  //       実在せず、放置9.4日の scope が一覧で「manifest不明」になっていた。
  //       宣言が実在しない scope は preflight もできないため、そのまま名指しする。
  const ledger = readLedger();
  ledger.scopes[0].gateManifestPaths = {
    figma: "MyBrain/verify/coding-codex-stale.json",
    coding: "MyBrain/verify/coding-codex-missing.json",
  };
  writeJson(join(verifyDirectory, "scope-coordination.json"), ledger);
  result = cli("list");
  check("実在しない宣言を名指しする", result.stdout.includes("coding-codex-missing.json"), `欠落を出していない: ${result.stdout}`);
  check("欠落があっても日数は出す", /manifest最終更新 \d+\.\d日/.test(result.stdout), `実在する方の日数を出していない: ${result.stdout}`);

  // (g) 既に閉じた scope は解放対象にしない。二重解放で記録を汚さない。
  cli("release", "codex-stale", "--by", "claude", "--reason", "片付け");
  result = cli("release", "codex-stale", "--by", "claude", "--reason", "もう一度");
  check("二重解放は拒否", result.status === 1, `FAILするはずが exit ${result.status}`);
  check("二重解放の理由", result.stderr.includes("既に"), `理由を示していない: ${result.stderr}`);
} finally {
  rmSync(repo, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("PASS: scope coordination release e2e (8 case(s))");
