#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const toolPath = fileURLToPath(new URL("./figma-scope-lock.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "figma-scope-lock-"));

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function runGit(args) {
  execFileSync("git", ["-C", root].concat(args), { stdio: "pipe", encoding: "utf8", windowsHide: true });
}

function run(args, expectedStatus) {
  const result = spawnSync(process.execPath, [toolPath].concat(args), {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== expectedStatus) {
    throw new Error("Expected exit " + expectedStatus + " for " + args.join(" ") + ", got " + result.status + "\nstdout:\n" + result.stdout + "\nstderr:\n" + result.stderr);
  }
  return result;
}

function append(relativePath, text) {
  writeFileSync(join(root, relativePath), text, { encoding: "utf8", flag: "a" });
}

try {
  runGit(["init"]);
  runGit(["config", "user.email", "scope-lock@example.test"]);
  runGit(["config", "user.name", "Scope Lock E2E"]);
  mkdirSync(join(root, "assets", "scss", "components"), { recursive: true });
  writeFileSync(join(root, "assets", "scss", "components", "_card.scss"), ".card {}\n", "utf8");
  writeFileSync(join(root, "dirty-before.txt"), "before\n", "utf8");
  runGit(["add", "."]);
  runGit(["commit", "-m", "fixture"]);
  append("dirty-before.txt", "existing dirty change\n");

  const scopePath = join(root, "MyBrain", "verify", "scope-card.json");
  const statePath = join(root, "MyBrain", "verify", "scope-card.state.json");
  writeJson(scopePath, {
    version: 1,
    scopeId: "card-fix",
    task: "single card correction",
    ownerInstruction: "Fix only the requested card.",
    repoPath: root,
    allowedPaths: ["assets/scss/components/_card.scss"],
  });

  run(["begin", scopePath, statePath], 0);
  run(["assert", statePath, "assets/scss/components/_card.scss"], 0);
  run(["assert", statePath, "outside.md"], 1);
  append("assets/scss/components/_card.scss", ".card { color: red; }\n");
  run(["verify", statePath], 0);

  const activeState = JSON.parse(readFileSync(statePath, "utf8"));
  if (activeState.status !== "active") throw new Error("Expected active state after in-scope verification.");

  const amendScopePath = join(root, "MyBrain", "verify", "scope-amend.json");
  const amendStatePath = join(root, "MyBrain", "verify", "scope-amend.state.json");
  writeJson(amendScopePath, {
    version: 1,
    scopeId: "amend-before-edit",
    task: "approved second file correction",
    ownerInstruction: "Fix the requested pair only.",
    repoPath: root,
    allowedPaths: ["assets/scss/components/_card.scss"],
  });
  run(["begin", amendScopePath, amendStatePath], 0);

  const amendmentPath = join(root, "MyBrain", "verify", "scope-amendment.json");
  writeJson(amendmentPath, {
    version: 1,
    scopeId: "amend-before-edit",
    addAllowedPaths: ["outside.md"],
    ownerApproval: {
      status: "approved",
      approvedBy: "owner",
      approvedAt: "2026-07-18T00:00:00.000Z",
      instruction: "Add outside.md to this task before editing it.",
    },
  });
  run(["amend", amendStatePath, amendmentPath], 0);
  append("outside.md", "approved path\n");
  run(["verify", amendStatePath], 0);

  // 宣言パスと交差しない変更では停止しない（2026-08-25 訂正
  // concurrent-scope-blocked-by-repo-wide-baseline の実装。2026-08-29）。
  // 旧契約では別scopeの正当な編集1件で blocked になり、begin も amend も拒否されて
  // 復帰不能だった。実測では案件の why-choose-us scope が blog-detail scope の編集で停止した。
  append("unexpected.md", "another scope's legitimate edit\n");
  const unrelated = run(["verify", amendStatePath], 0);
  const unrelatedOutput = (unrelated.stdout || "") + (unrelated.stderr || "");
  for (const marker of ["対象外変更 0 件", "baselineへ取り込んだ（違反ではない）", "unexpected.md"]) {
    if (!unrelatedOutput.includes(marker)) {
      throw new Error("disjoint change must not block; missing " + JSON.stringify(marker) + "\noutput:\n" + unrelatedOutput);
    }
  }
  const afterUnrelated = JSON.parse(readFileSync(amendStatePath, "utf8"));
  if (afterUnrelated.status !== "active") throw new Error("Disjoint change must leave the scope active.");
  if (!afterUnrelated.baseline.some((entry) => entry.path === "unexpected.md")) {
    throw new Error("Disjoint change must be folded into the baseline.");
  }
  // 取り込んだので、2回目は参考出力にも出ない。
  const secondVerify = run(["verify", amendStatePath], 0);
  if (((secondVerify.stdout || "") + (secondVerify.stderr || "")).includes("unexpected.md")) {
    throw new Error("A folded baseline entry must not reappear on the next verify.");
  }

  // 宣言そのものの書き換えは止める。判定範囲を狭めたぶん、ここは明示的に落とす。
  const tamperedScope = JSON.parse(readFileSync(amendScopePath, "utf8"));
  tamperedScope.allowedPaths = tamperedScope.allowedPaths.concat(["unexpected.md"]);
  writeJson(amendScopePath, tamperedScope);
  const tampered = run(["verify", amendStatePath], 1);
  const tamperedOutput = (tampered.stdout || "") + (tampered.stderr || "");
  if (!tamperedOutput.includes("Scope manifest changed after begin")) {
    throw new Error("Editing the scope manifest must block.\noutput:\n" + tamperedOutput);
  }
  const tamperedState = JSON.parse(readFileSync(amendStatePath, "utf8"));
  if (tamperedState.blocked?.reason !== "scope-manifest-tampered") {
    throw new Error("Expected scope-manifest-tampered block, got " + JSON.stringify(tamperedState.blocked));
  }

  // blocked の案内は、停止理由と復帰手段を自分で説明する。
  // 2026-08-29 の独立検証で、blocked の原因も再開手段も出力から読み取れず誤読された。
  const guidanceMarkers = [
    "rebaseline",
    "ownerApproval",
    "scope-manifest-tampered",
    "新しいscopeを起こすこと",
  ];
  const blockedCommands = [
    ["amend", run(["amend", amendStatePath, amendmentPath], 1)],
    ["assert", run(["assert", amendStatePath, "outside.md"], 1)],
  ];
  for (const [label, result] of blockedCommands) {
    const output = (result.stdout || "") + (result.stderr || "");
    for (const marker of guidanceMarkers) {
      if (!output.includes(marker)) {
        throw new Error(
          "blocked scope lock (" + label + ") must explain itself; missing " + JSON.stringify(marker) + "\noutput:\n" + output
        );
      }
    }
  }

  // manifest改ざんの停止は rebaseline では解除できない。
  const rebaselinePath = join(root, "MyBrain", "verify", "scope-rebaseline.json");
  writeJson(rebaselinePath, {
    version: 1,
    scopeId: "amend-before-edit",
    ownerApproval: {
      status: "approved",
      approvedBy: "owner",
      approvedAt: "2026-08-29T00:00:00.000Z",
      instruction: "別scopeの編集による誤停止だったので取り直す（20文字以上の理由）",
    },
  });
  const refusedRebaseline = run(["rebaseline", amendStatePath, rebaselinePath], 1);
  if (!((refusedRebaseline.stdout || "") + (refusedRebaseline.stderr || "")).includes("cannot be cleared by rebaseline")) {
    throw new Error("scope-manifest-tampered must not be clearable by rebaseline.");
  }

  // 宣言を begin 時点へ戻せば、その停止理由は解消する。ここから rebaseline の正経路を測る。
  tamperedScope.allowedPaths = tamperedScope.allowedPaths.filter((path) => path !== "unexpected.md");
  writeJson(amendScopePath, tamperedScope);
  const stillBlocked = JSON.parse(readFileSync(amendStatePath, "utf8"));
  stillBlocked.blocked = { at: "2026-08-29T00:00:00.000Z", reason: "out-of-scope-path", paths: ["legacy.md"] };
  writeJson(amendStatePath, stillBlocked);

  // 承認が無い / 理由が短い / scopeId 違いは拒否する。
  writeJson(rebaselinePath, { version: 1, scopeId: "amend-before-edit" });
  run(["rebaseline", amendStatePath, rebaselinePath], 1);
  writeJson(rebaselinePath, {
    version: 1,
    scopeId: "amend-before-edit",
    ownerApproval: { status: "approved", approvedBy: "owner", approvedAt: "2026-08-29T00:00:00.000Z", instruction: "短い" },
  });
  run(["rebaseline", amendStatePath, rebaselinePath], 1);
  writeJson(rebaselinePath, {
    version: 1,
    scopeId: "other-scope",
    ownerApproval: {
      status: "approved",
      approvedBy: "owner",
      approvedAt: "2026-08-29T00:00:00.000Z",
      instruction: "別scopeの編集による誤停止だったので取り直す（20文字以上の理由）",
    },
  });
  run(["rebaseline", amendStatePath, rebaselinePath], 1);

  writeJson(rebaselinePath, {
    version: 1,
    scopeId: "amend-before-edit",
    ownerApproval: {
      status: "approved",
      approvedBy: "owner",
      approvedAt: "2026-08-29T00:00:00.000Z",
      instruction: "別scopeの編集による誤停止だったので取り直す（20文字以上の理由）",
    },
  });
  run(["rebaseline", amendStatePath, rebaselinePath], 0);
  const recovered = JSON.parse(readFileSync(amendStatePath, "utf8"));
  if (recovered.status !== "active") throw new Error("rebaseline must return the scope to active.");
  if (recovered.blocked) throw new Error("rebaseline must clear the block.");
  const rebaselineEntry = recovered.history.find((entry) => entry.action === "rebaseline");
  if (!rebaselineEntry || rebaselineEntry.clearedBlock?.reason !== "out-of-scope-path") {
    throw new Error("rebaseline must record the block it cleared.");
  }
  // active に戻ったら通常の工程を続けられる。
  run(["assert", amendStatePath, "outside.md"], 0);
  run(["verify", amendStatePath], 0);
  // active な scope に rebaseline はできない。
  run(["rebaseline", amendStatePath, rebaselinePath], 1);

  const badScopePath = join(root, "MyBrain", "verify", "scope-glob.json");
  writeJson(badScopePath, {
    version: 1,
    scopeId: "glob-rejection",
    task: "must reject broad paths",
    ownerInstruction: "No broad scope.",
    repoPath: root,
    allowedPaths: ["assets/scss/**/*.scss"],
  });
  run(["begin", badScopePath, join(root, "MyBrain", "verify", "scope-glob.state.json")], 1);

  console.log("figma-scope-lock E2E PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}