#!/usr/bin/env node
// scope-conflict-audit.e2e.mjs — 排他所有の失効・未登録・交差判定を固定する負のE2E。
//
// 2026-09-01: 所有がエージェント名へ常設で紐づき close しても解放されないため、
// 稼働していない所有が別担当の宣言を止め、close受領証を作れず commit まで詰まった。
// 失効の仕組みを入れたので、(a) 失効した所有を読み飛ばすこと、(b) 稼働中の所有は
// 従来どおり止めること、(c) 止めるときは解除差分まで出すこと、(d) 所有者未登録を
// 停止事由にしないこと、(e) それでも交差する並行scopeは止まること、を固定する。

import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const templateDirectory = dirname(fileURLToPath(import.meta.url));
const repo = mkdtempSync(join(tmpdir(), "scope-conflict-audit-e2e-"));
const verifyDirectory = join(repo, "MyBrain", "verify");
const failures = [];

function write(name, value) {
  const path = join(verifyDirectory, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} に失敗しました: ${result.stderr}`);
}

function audit(manifestName, { actor = "codex", contextId = "ctx-codex" } = {}) {
  return spawnSync(
    process.execPath,
    [
      join(verifyDirectory, "scope-conflict-audit.mjs"),
      "--gate", "coding",
      "--operation", "preflight",
      "--actor", actor,
      "--context-id", contextId,
      `MyBrain/verify/${manifestName}`,
    ],
    { cwd: repo, encoding: "utf8" },
  );
}

function check(label, condition, detail) {
  if (condition) return;
  failures.push(`${label}: ${detail}`);
}

function manifestFor(id, targets, { actor = "codex", contextId = "ctx-codex" } = {}) {
  return {
    id,
    scope: { changeTargets: targets, implementationActor: actor, implementationContextId: contextId },
  };
}

function coordination(scopes) {
  return { version: 1, actors: ["claude", "codex"], scopes };
}

function entry(id, { actor = "codex", status = "active", contextId = "ctx-codex", manifest }) {
  return {
    id,
    actor,
    status,
    implementationContextId: contextId,
    manifestPath: `MyBrain/verify/${manifest}`,
    gates: { coding: status === "closed" ? "closed" : "active" },
  };
}

const target = "assets/scss/components/_button.scss";
const ownScope = entry("codex-target", { manifest: "coding-codex-target.json" });

try {
  mkdirSync(verifyDirectory, { recursive: true });
  copyFileSync(resolve(templateDirectory, "scope-conflict-audit.mjs"), join(verifyDirectory, "scope-conflict-audit.mjs"));
  git("init", "--quiet");
  write("coding-codex-target.json", manifestFor("codex-target", [target]));

  // (a) 失効した所有は読み飛ばす。closed な scope へ束ねた所有は、以後どの宣言も止めない。
  write("shared-component-ownership.json", {
    version: 2,
    exclusivePathOwnership: [
      { pattern: "assets/scss/components/*.scss", owner: "claude", grantedForScope: "claude-old" },
    ],
  });
  write("scope-coordination.json", coordination([
    ownScope,
    entry("claude-old", { actor: "claude", status: "closed", contextId: "ctx-claude", manifest: "coding-claude-old.json" }),
  ]));
  let result = audit("coding-codex-target.json");
  check("失効した所有の読み飛ばし", result.status === 0, `PASSするはずが exit ${result.status} / ${result.stderr}`);
  check("失効の報告", result.stdout.includes("失効した排他所有"), `失効を報告していない: ${result.stdout}`);

  // (b) 稼働中のscopeへ束ねた所有は、従来どおり宣言を止める。緩めていないことを固定する。
  write("shared-component-ownership.json", {
    version: 2,
    exclusivePathOwnership: [
      { pattern: "assets/scss/components/*.scss", owner: "claude", grantedForScope: "claude-live" },
    ],
  });
  write("coding-claude-live.json", manifestFor("claude-live", ["assets/scss/other.scss"], { actor: "claude", contextId: "ctx-claude" }));
  write("scope-coordination.json", coordination([
    ownScope,
    entry("claude-live", { actor: "claude", status: "active", contextId: "ctx-claude", manifest: "coding-claude-live.json" }),
  ]));
  result = audit("coding-codex-target.json");
  check("稼働中の所有は止める", result.status === 1, `FAILするはずが exit ${result.status}`);
  check("稼働中の所有の説明", result.stderr.includes("稼働中のscopeを持っています"), `待機を促していない: ${result.stderr}`);

  // (c) 恒久所有（grantedForScope無し）で所有者が稼働していないときは、止めたうえで
  //     「稼働していない所有が止めている」事実と、貼れる解除差分を必ず出す。
  write("shared-component-ownership.json", {
    version: 2,
    exclusivePathOwnership: [
      { pattern: "assets/scss/components/*.scss", owner: "claude" },
    ],
  });
  write("scope-coordination.json", coordination([ownScope]));
  result = audit("coding-codex-target.json");
  check("恒久所有は止める", result.status === 1, `FAILするはずが exit ${result.status}`);
  check("休眠所有の明示", result.stderr.includes("active / waiting のscopeは台帳に1件もありません"), `休眠を明示していない: ${result.stderr}`);
  check("解除差分の提示", result.stderr.includes(`"pattern": "${target}"`) && result.stderr.includes('"grantedForScope"'), `貼れる差分が無い: ${result.stderr}`);

  // (d) 所有者が台帳に無いことを停止事由にしない。新規の共有アセットで詰まらせない。
  write("shared-component-ownership.json", {
    version: 2,
    exclusivePathOwnership: [
      { pattern: "assets/css/*.css", owner: "codex", grantedForScope: "codex-target" },
    ],
  });
  write("scope-coordination.json", coordination([ownScope]));
  result = audit("coding-codex-target.json");
  check("未登録パスは止めない", result.status === 0, `PASSするはずが exit ${result.status} / ${result.stderr}`);
  check("未登録パスの報告", result.stdout.includes("有効な排他所有はありません"), `報告していない: ${result.stdout}`);

  // (e) 未登録を通すぶん、並行scopeの交差判定が最後の砦になる。ここは必ず止まること。
  write("coding-codex-other.json", manifestFor("codex-other", [target], { contextId: "ctx-codex-other" }));
  write("scope-coordination.json", coordination([
    ownScope,
    entry("codex-other", { contextId: "ctx-codex-other", manifest: "coding-codex-other.json" }),
  ]));
  result = audit("coding-codex-target.json");
  check("交差する並行scopeは止める", result.status === 1, `FAILするはずが exit ${result.status} / ${result.stdout}`);
  check("交差の説明", result.stderr.includes("codex-other"), `交差相手を示していない: ${result.stderr}`);

  // (f) grantedForScope の型が不正な台帳は受け付けない。
  write("shared-component-ownership.json", {
    version: 2,
    exclusivePathOwnership: [
      { pattern: "assets/scss/components/*.scss", owner: "codex", grantedForScope: "" },
    ],
  });
  write("scope-coordination.json", coordination([ownScope]));
  result = audit("coding-codex-target.json");
  check("不正なgrantedForScope", result.status === 1, `FAILするはずが exit ${result.status}`);
  check("不正の説明", result.stderr.includes("grantedForScope"), `理由を示していない: ${result.stderr}`);
} finally {
  rmSync(repo, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: scope conflict audit e2e (6 case(s))`);
