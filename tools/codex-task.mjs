#!/usr/bin/env node
// codex-task.mjs — 依頼文をファイルから読んで codex へ渡す薄いラッパー。
//
// 目的は権限プロンプトの削減である。依頼文を Bash の文字列に直接埋め込むと、
// 長大な引数やコマンド置換（$(cat ...)）で許可規則の前方一致が外れ、
// 読み取りだけの批評依頼にも毎回承認を求めることになる（2026-08-06 実測）。
// このラッパーを経由すると呼び出しは `node tools/codex-task.mjs <prompt-file>` に固定され、
// 既存の許可規則で通る。
//
// Usage: node tools/codex-task.mjs <prompt-file> [--model <name>]
//   既定モデル: spark（この接続面で唯一利用できるモデル。2026-07-30 実測）

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

const COMPANION = "C:/Users/tane1/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs";

function fail(message) {
  console.error(`CODEX TASK: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const promptPathArg = args[0];
if (!promptPathArg) fail("Usage: node tools/codex-task.mjs <prompt-file> [--model <name>]");

const modelIndex = args.indexOf("--model");
const model = modelIndex >= 0 ? args[modelIndex + 1] : "spark";
if (!model) fail("--model needs a value.");

const promptPath = resolve(process.cwd(), promptPathArg);
if (!existsSync(promptPath)) fail(`prompt file does not exist: ${promptPath}`);
const prompt = readFileSync(promptPath, "utf8").trim();
if (prompt === "") fail(`prompt file is empty: ${promptPath}`);

if (!existsSync(COMPANION)) fail(`codex companion is not installed: ${COMPANION}`);

// companion は内部で spawn("codex") と PATH 解決に任せるため、二重インストール環境では
// どの版が動いたか分からなくなる。実測 2026-08-06: Volta 0.146.1 と npm global 0.142.1 が
// 併存し、モデル拒否の原因をこちらが誤診した。起動する実体を先に確定し、版を記録する。
const CODEX_BIN = process.env.CODEX_BIN || "C:/Users/tane1/AppData/Local/Volta/bin/codex.exe";
if (!existsSync(CODEX_BIN)) fail(`codex binary does not exist: ${CODEX_BIN} (CODEX_BIN で上書きできる)`);

let codexVersion;
try {
  codexVersion = execFileSync(CODEX_BIN, ["--version"], { encoding: "utf8" }).trim();
} catch (error) {
  fail(`codex --version failed for ${CODEX_BIN}: ${error.message}`);
}

// 子プロセスの PATH を、確定した実体のあるディレクトリ優先にする。
// これで companion が別の codex を拾う経路を塞ぐ。
const childEnv = { ...process.env, PATH: `${dirname(CODEX_BIN)}${delimiter}${process.env.PATH ?? ""}` };

console.log(`CODEX TASK: model=${model} codex=${codexVersion} (${CODEX_BIN}) prompt=${promptPathArg} (${prompt.length} chars)`);
const child = spawn(process.execPath, [COMPANION, "task", "--model", model, prompt], {
  stdio: "inherit",
  shell: false,
  env: childEnv,
});
child.on("exit", (code) => process.exit(code ?? 1));
