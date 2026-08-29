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

  append("unexpected.md", "scope violation\n");
  run(["verify", amendStatePath], 1);
  const blockedState = JSON.parse(readFileSync(amendStatePath, "utf8"));
  if (blockedState.status !== "blocked") throw new Error("Expected blocked state after out-of-scope change.");
  const blockedAmend = run(["amend", amendStatePath, amendmentPath], 1);

  // blocked は行き止まりであり、状態ファイルを見るだけでは再開手段の有無が分からない。
  // 2026-08-29 の独立検証で、blocked の原因を既知の未実装欠陥と結び付けられず、
  // 直前の別作業の副作用と誤読された。出力が自分で説明することを固定する。
  // amend / assert / verify のどれで当たっても同じ案内が出ること。
  const guidanceMarkers = [
    "これは行き止まりである",
    "begin",
    "amend",
    "concurrent-scope-blocked-by-repo-wide-baseline",
    "オーナーへ次の3点を示して判断を仰ぐ",
    "unexpected.md",
  ];
  const blockedCommands = [
    ["amend", blockedAmend],
    ["verify", run(["verify", amendStatePath], 1)],
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