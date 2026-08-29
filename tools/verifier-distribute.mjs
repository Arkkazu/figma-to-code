#!/usr/bin/env node
// 正本 templates/verify/ から案件の MyBrain/verify/ へ検証器を配布する。
//
// 素の cp で配布して案件のゲートを2回全面停止させた（2026-08-25・26）。
// どちらも原因は同じで、正本リポジトリの**作業ツリー**が未コミットの新契約WIPを含み、
// それを「正本の最新」と見なして配ったこと。案件側 MyBrain/ はgit管理外で復元できない。
// rules/mistakes.md 2026-08-26 の再発防止を、手順ではなくツールで強制する。
//
//   1. 未コミット変更を持つファイルは配布しない（--allow-dirty と理由で明示的に上書き可）
//   2. 上書き前に必ず退避を取る
//   3. 配布後に案件側 e2e を実行し、失敗したら自動で巻き戻す
//   4. 何を配ったかを標準出力に残す
//
// 使い方:
//   node tools/verifier-distribute.mjs <案件のMyBrain/verifyディレクトリ> [ファイル名...]
//   node tools/verifier-distribute.mjs <dir> figma-page-coverage.mjs --allow-dirty --reason "..."
//   node tools/verifier-distribute.mjs <dir> --check          配布せず判定だけ

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const upstreamRoot = resolve(here, "..");
const upstreamVerify = resolve(upstreamRoot, "templates/verify");

const E2E_SUITES = ["figma-gate.e2e.mjs", "figma-page-coverage.e2e.mjs"];

function fail(message) {
  console.error(`VERIFIER DISTRIBUTE: ${message}`);
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: upstreamRoot, encoding: "utf8", shell: false });
  if (result.error) fail(`git を実行できません: ${result.error.message}`);
  return result;
}

// 作業ツリーの状態。空文字なら HEAD と一致している。
function worktreeStatus(relativePath) {
  const result = git(["status", "--porcelain", "--", relativePath]);
  if (result.status !== 0) fail(`git status に失敗しました: ${relativePath}`);
  return result.stdout.trim();
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node tools/verifier-distribute.mjs <project MyBrain/verify dir> [file...] [--allow-dirty --reason <text>] [--check]");
  process.exit(2);
}

const destination = resolve(args[0]);
let checkOnly = false;
let allowDirty = false;
let reason = null;
const explicitFiles = [];
// 手で位置を数えると --reason の値をファイル名として拾う（実際に混入させた）。
// 走査しながら消費する形にして、値つきフラグを取り違えないようにする。
for (let index = 1; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--check") { checkOnly = true; continue; }
  if (value === "--allow-dirty") { allowDirty = true; continue; }
  if (value === "--reason") { reason = args[index + 1] ?? null; index += 1; continue; }
  if (value.startsWith("--")) fail(`不明なオプションです: ${value}`);
  explicitFiles.push(value);
}

if (!existsSync(destination) || !statSync(destination).isDirectory()) {
  fail(`配布先がディレクトリではありません: ${destination}`);
}
if (allowDirty && (!reason || reason.trim().length < 20)) {
  fail("--allow-dirty には --reason で20文字以上の理由が必要です。未コミットの正本を配る判断は記録を残してください。");
}

// 配布対象。指定が無ければ、配布先に既に存在する .mjs / .json を対象にする
// （案件へ配られていないものを勝手に増やさない）。
const candidates = explicitFiles.length > 0
  ? explicitFiles
  : readdirSync(upstreamVerify).filter((name) => {
    if (!/\.(mjs|json)$/.test(name)) return false;
    return existsSync(join(destination, name));
  });

if (candidates.length === 0) fail("配布対象がありません。");

const blocked = [];
const ready = [];
for (const name of candidates) {
  const source = join(upstreamVerify, name);
  if (!existsSync(source)) {
    blocked.push({ name, reason: "正本に存在しません" });
    continue;
  }
  const status = worktreeStatus(`templates/verify/${name}`);
  if (status === "") {
    ready.push(name);
  } else if (allowDirty) {
    ready.push(name);
    console.log(`WARN  ${name} は未コミットです（--allow-dirty で配布）: ${status.split("\n")[0]}`);
  } else {
    blocked.push({ name, reason: `未コミットの変更があります（${status.split("\n")[0]}）` });
  }
}

if (blocked.length > 0) {
  console.error("VERIFIER DISTRIBUTE: 配布できないファイルがあります。");
  for (const item of blocked) console.error(`  - ${item.name}: ${item.reason}`);
  console.error("");
  console.error("  正本リポジトリの作業ツリーは「正本の最新」ではありません。未コミットの変更には、");
  console.error("  他セッションの進行中作業が混ざっていることがあります（実測 2026-08-25・26）。");
  console.error("  必要な変更だけを配りたい場合は、HEAD を土台に再適用したものを配ってください。");
  console.error("");
  console.error(`    git -C ${upstreamRoot} show HEAD:templates/verify/<file> > /tmp/<file>`);
  console.error("    # 配りたい変更だけを /tmp/<file> へ適用してから配布する");
  console.error("");
  console.error("  未コミットのまま配る判断をした場合は --allow-dirty --reason \"<20文字以上の理由>\" を付けます。");
  if (ready.length > 0) console.error(`  配布可能だったのは ${ready.length} 件です（今回は何も配っていません）。`);
  process.exit(1);
}

console.log(`配布対象 ${ready.length} 件（正本 = HEAD と一致）`);
for (const name of ready) console.log(`  - ${name}`);

if (checkOnly) {
  console.log("\n--check のため配布しませんでした。");
  process.exit(0);
}

// 退避。案件側 MyBrain/ はgit管理外で、上書きすると復元できない。
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = join(tmpdir(), `verifier-distribute-backup-${stamp}`);
mkdirSync(backupDirectory, { recursive: true });
const restored = [];
for (const name of ready) {
  const target = join(destination, name);
  if (existsSync(target)) {
    copyFileSync(target, join(backupDirectory, name));
    restored.push(name);
  }
}
console.log(`\n退避: ${backupDirectory}（${restored.length} 件）`);

for (const name of ready) {
  copyFileSync(join(upstreamVerify, name), join(destination, name));
}
console.log(`配布完了: ${ready.length} 件`);

// 配布後の検証。2回の事故はどちらも e2e を回して初めて気づいた。回さなければ気づけない。
//
// ただし固定の2本だけでは足りない。案件には e2e が19本あり、配布した当のファイルが
// 検査対象外だと、壊れた配布物が黙って通る。実測（2026-08-29、rpa-technologies-theme）:
// fidelity-benchmark.e2e.mjs を配布したが、cwd相対でパスを解決する移植性欠陥のため
// 案件では ENOENT で落ちる状態だった。固定2本には含まれないので配布は成功と表示された。
//
// **配布したものは配布先で必ず実行する。** 配布した .e2e.mjs はそれ自身を、
// 配布した実装には対応する .e2e.mjs があればそれを回す。固定2本は横断的な
// スモークとして残す。
const suitesForDistributedFiles = new Set(E2E_SUITES);
for (const name of ready) {
  const suite = name.endsWith(".e2e.mjs") ? name : name.replace(/\.mjs$/, ".e2e.mjs");
  if (!suite.endsWith(".e2e.mjs")) continue;
  if (existsSync(join(destination, suite))) suitesForDistributedFiles.add(suite);
}

const projectRoot = resolve(destination, "../..");
const failures = [];
for (const suite of [...suitesForDistributedFiles]) {
  const suitePath = join(destination, suite);
  if (!existsSync(suitePath)) continue;
  console.log(`\n実行: ${suite}`);
  const result = spawnSync("node", [suitePath], { cwd: projectRoot, encoding: "utf8", shell: false });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const lastLine = output.trim().split("\n").slice(-1)[0] ?? "";
  console.log(`  ${lastLine}`);
  if (result.status !== 0) failures.push({ suite, output });
}

if (failures.length > 0) {
  console.error("\nVERIFIER DISTRIBUTE: 配布後の e2e が失敗しました。退避から巻き戻します。");
  for (const name of restored) copyFileSync(join(backupDirectory, name), join(destination, name));
  console.error(`  巻き戻し完了: ${restored.length} 件`);
  for (const item of failures) {
    console.error(`\n  --- ${item.suite} ---`);
    console.error(item.output.trim().split("\n").slice(0, 8).map((line) => `  ${line}`).join("\n"));
  }
  process.exit(1);
}

console.log("\nVERIFIER DISTRIBUTE: 配布と検証が完了しました。");
