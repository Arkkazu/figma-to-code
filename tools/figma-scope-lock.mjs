#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const [command, ...args] = process.argv.slice(2);

class ScopeLockError extends Error {}

function fail(message) {
  throw new ScopeLockError(message);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object.");
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(label + " must be a non-empty string.");
  return value.trim();
}

function requireIdentifier(value, label) {
  const normalized = requireString(value, label);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    fail(label + " must use letters, numbers, dot, underscore, or hyphen.");
  }
  return normalized;
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(label + " does not exist: " + filePath);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(label + " is not valid JSON: " + error.message);
  }
}

function jsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, jsonText(value), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

// glob禁止は「宣言パス」に対する検査である。人間が manifest に `assets/scss/**/*.scss` のような
// 広い指定を書いてscopeを実質無制限にすることを防ぐためにある。
//
// 一方、git が返す**実在パス**にこれを適用してはならない。`{` や `[` はファイル名として正当であり、
// 実際に案件ルートに `{` という名前の0バイトファイルが1つあっただけで（2026-08-26、シェルの
// 打ち間違いによる生成物と思われる）、dirtySnapshot() が落ち、begin / verify / rebaseline が
// 案件全体で実行不能になった。観測値の検査で運用が止まるのは検査の誤用である。
// 走査済みの実在パスには、リポジトリ外・.git 侵入だけを引き続き禁じる。
function normalizeRelativePath(repoPath, value, label, options) {
  const allowGlobCharacters = Boolean(options && options.allowGlobCharacters);
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(label + " must be relative to the repository root.");
  if (!allowGlobCharacters && /[\*\?\[\]\{\}]/.test(input)) {
    fail(label + " must name one exact file; globs are not allowed.");
  }

  const absolutePath = resolve(repoPath, input);
  const normalized = relative(repoPath, absolutePath).replace(/\\/g, "/");
  if (normalized === "" || normalized === "." || normalized.startsWith("../") || isAbsolute(normalized)) {
    fail(label + " must stay inside the repository root.");
  }
  if (normalized.split("/").includes(".git")) fail(label + " must not point into .git.");
  return normalized;
}

function normalizePathArray(repoPath, value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(label + " must be a non-empty array.");
  const paths = value.map(function (entry, index) {
    return normalizeRelativePath(repoPath, entry, label + "[" + index + "]");
  });
  if (new Set(paths).size !== paths.length) fail(label + " must not contain duplicates.");
  return paths.sort();
}

function assertInside(rootPath, candidatePath, label) {
  const normalizedRoot = resolve(rootPath);
  const normalizedCandidate = resolve(candidatePath);
  const pathFromRoot = relative(normalizedRoot, normalizedCandidate);
  if (pathFromRoot === "" || pathFromRoot.startsWith("../") || isAbsolute(pathFromRoot)) {
    fail(label + " must be inside the repository root.");
  }
  return normalizedCandidate;
}

function runGit(repoPath, gitArgs) {
  const result = spawnSync("git", ["-C", repoPath].concat(gitArgs), {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) fail("git failed to start: " + result.error.message);
  if (result.status !== 0) {
    fail("git " + gitArgs.join(" ") + " failed: " + (result.stderr || result.stdout || "unknown error").trim());
  }
  return result.stdout;
}

function gitRoot(repoPath) {
  const root = runGit(repoPath, ["rev-parse", "--show-toplevel"]).trim();
  if (root === "") fail("git repository root could not be determined.");
  const normalizedRoot = resolve(root);
  if (relative(normalizedRoot, resolve(repoPath)) !== "" || relative(resolve(repoPath), normalizedRoot) !== "") {
    fail("scope.repoPath must be the Git repository root.");
  }
  return normalizedRoot;
}

function gitPathLines(repoPath, gitArgs) {
  const output = runGit(repoPath, gitArgs).trim();
  if (output === "") return [];
  return output.split(/\r?\n/).map(function (entry) {
    // git が返すのは実在パスである。glob文字を含むファイル名も正当なので拒否しない。
    return normalizeRelativePath(repoPath, entry, "git changed path", { allowGlobCharacters: true });
  });
}

function dirtyPaths(repoPath) {
  const paths = new Set();
  [
    ["diff", "--name-only", "--no-renames"],
    ["diff", "--cached", "--name-only", "--no-renames"],
    ["ls-files", "--others", "--exclude-standard"],
  ].forEach(function (gitArgs) {
    gitPathLines(repoPath, gitArgs).forEach(function (path) {
      paths.add(path);
    });
  });
  return [...paths].sort();
}

function fileHash(repoPath, repoRelativePath) {
  const absolutePath = resolve(repoPath, repoRelativePath);
  if (!existsSync(absolutePath)) return null;
  const stats = lstatSync(absolutePath);
  if (!stats.isFile()) fail("Changed path is not a regular file: " + repoRelativePath);
  return sha256(readFileSync(absolutePath));
}

function dirtySnapshot(repoPath) {
  return dirtyPaths(repoPath).map(function (path) {
    return { path: path, sha256: fileHash(repoPath, path) };
  });
}

function repoPathFromAbsolute(repoPath, absolutePath, label) {
  return normalizeRelativePath(repoPath, relative(repoPath, absolutePath), label);
}

function validateScope(raw, configPath) {
  requireObject(raw, "Scope manifest");
  if (raw.version !== 1) fail("Scope manifest.version must be 1.");

  const repoPath = resolve(requireString(raw.repoPath, "Scope manifest.repoPath"));
  if (!existsSync(repoPath)) fail("Scope manifest.repoPath does not exist: " + repoPath);
  const configAbsolutePath = resolve(configPath);
  assertInside(repoPath, configAbsolutePath, "Scope manifest file");

  const scope = {
    version: 1,
    scopeId: requireIdentifier(raw.scopeId, "Scope manifest.scopeId"),
    task: requireString(raw.task, "Scope manifest.task"),
    ownerInstruction: requireString(raw.ownerInstruction, "Scope manifest.ownerInstruction"),
    repoPath: repoPath,
    allowedPaths: normalizePathArray(repoPath, raw.allowedPaths, "Scope manifest.allowedPaths"),
  };

  gitRoot(scope.repoPath);
  return scope;
}

function validateState(raw, statePath) {
  requireObject(raw, "Scope lock state");
  if (raw.version !== 1 || raw.kind !== "figma-scope-lock-state") {
    fail("Scope lock state has an unsupported version or kind.");
  }

  const scope = validateScope(raw.scope, statePath);
  const stateAbsolutePath = assertInside(scope.repoPath, statePath, "Scope lock state file");
  if (!Array.isArray(raw.baseline)) fail("Scope lock state.baseline must be an array.");

  const baseline = raw.baseline.map(function (entry, index) {
    requireObject(entry, "Scope lock state.baseline[" + index + "]");
    // baseline は git の走査結果を保存したものなので、宣言パスではなく観測値である。
    // glob文字を含む実在ファイル名を拒否すると、state を読むだけで全コマンドが止まる。
    const path = normalizeRelativePath(
      scope.repoPath,
      entry.path,
      "Scope lock state.baseline[" + index + "].path",
      { allowGlobCharacters: true }
    );
    if (entry.sha256 !== null && typeof entry.sha256 !== "string") {
      fail("Scope lock state.baseline[" + index + "].sha256 must be a SHA-256 string or null.");
    }
    return { path: path, sha256: entry.sha256 };
  });
  if (new Set(baseline.map(function (entry) { return entry.path; })).size !== baseline.length) {
    fail("Scope lock state.baseline must not contain duplicate paths.");
  }

  if (!["active", "blocked"].includes(raw.status)) fail("Scope lock state.status must be active or blocked.");
  if (!Array.isArray(raw.history)) fail("Scope lock state.history must be an array.");
  if (!Array.isArray(raw.controlPaths) || raw.controlPaths.length < 2) {
    fail("Scope lock state.controlPaths must contain the manifest and state files.");
  }
  const controlPaths = raw.controlPaths.map(function (entry, index) {
    // controlPaths も実在ファイル（manifest / state / amendment / approval）の位置から導出する。
    return normalizeRelativePath(
      scope.repoPath,
      entry,
      "Scope lock state.controlPaths[" + index + "]",
      { allowGlobCharacters: true }
    );
  });
  if (new Set(controlPaths).size !== controlPaths.length) {
    fail("Scope lock state.controlPaths must not contain duplicate paths.");
  }

  return {
    statePath: stateAbsolutePath,
    raw: raw,
    scope: scope,
    baseline: baseline,
    controlPaths: controlPaths,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function loadState(stateInputPath) {
  const raw = readJson(resolve(stateInputPath), "Scope lock state");
  return validateState(raw, resolve(stateInputPath));
}

function saveState(state) {
  writeJson(state.statePath, state.raw);
}

function begin(scopeInputPath, stateInputPath) {
  const scopePath = resolve(scopeInputPath);
  const scope = validateScope(readJson(scopePath, "Scope manifest"), scopePath);
  const statePath = assertInside(scope.repoPath, resolve(stateInputPath), "Scope lock state file");
  if (existsSync(statePath)) fail("Scope lock state already exists and is immutable at begin: " + statePath);

  const controlPaths = [
    repoPathFromAbsolute(scope.repoPath, scopePath, "Scope manifest file"),
    repoPathFromAbsolute(scope.repoPath, statePath, "Scope lock state file"),
  ].sort();

  const state = {
    version: 1,
    kind: "figma-scope-lock-state",
    controlPaths: controlPaths,
    scope: {
      version: scope.version,
      scopeId: scope.scopeId,
      task: scope.task,
      ownerInstruction: scope.ownerInstruction,
      repoPath: scope.repoPath,
      allowedPaths: scope.allowedPaths,
    },
    createdAt: nowIso(),
    status: "active",
    baseline: dirtySnapshot(scope.repoPath),
    history: [
      {
        action: "begin",
        at: nowIso(),
        // 以後の verify が manifest を並び順ではなくこの記録で同定する。
        scopeManifestPath: repoPathFromAbsolute(scope.repoPath, scopePath, "Scope manifest file"),
        scopeManifestSha256: sha256(readFileSync(scopePath)),
      },
    ],
  };

  writeJson(statePath, state);
  console.log("PASS scope-lock begin: " + scope.scopeId + " with " + scope.allowedPaths.length + " allowed path(s).");
}

// blocked は行き止まりである。begin も amend も拒否するため、状態ファイルを見ただけでは
// 「何をすれば再開できるか」が分からない。2026-08-29 の独立検証では、blocked の原因を
// 既知の未実装欠陥と結び付けられず、直前に行った別作業の副作用と誤読された。
// 何が起きたか・なぜ復帰できないか・次に誰へ何を求めるかを、出力側で名指しする。
function blockedGuidance(state, action) {
  const blocked = state.raw.blocked || {};
  const reason = blocked.reason || "(記録なし)";
  const paths = Array.isArray(blocked.paths) ? blocked.paths : [];
  return [
    "Scope lock is blocked; " + action + " is refused.",
    "",
    "  scopeId: " + state.scope.scopeId,
    "  blocked at: " + (blocked.at || "(記録なし)"),
    "  reason: " + reason,
    "  blocked paths: " + (paths.length > 0 ? paths.join(", ") : "(記録なし)"),
    "",
    "  begin と amend はどちらも拒否される（既存stateは不変 / blocked は修正できない）。",
    "  自動でrevertしない。エージェントの判断で回避してはならない。",
    "",
    "  復帰は rebaseline だけである。オーナー承認ファイルが要る。",
    "",
    "    node C:/AI/figma-to-code/tools/figma-scope-lock.mjs rebaseline \\",
    "      " + (state.statePath || "<state.json>") + " <approval.json>",
    "",
    "  approval.json の形（instruction は20文字以上。なぜ解除してよいかを書く）:",
    '    { "version": 1, "scopeId": "' + state.scope.scopeId + '",',
    '      "ownerApproval": { "status": "approved", "approvedBy": "owner",',
    '        "approvedAt": "<ISO8601>", "instruction": "<解除してよい理由>" } }',
    "",
    reason === "scope-manifest-tampered"
      ? "  この停止は宣言ファイル自体の書き換えによるもので、rebaseline では解除できない。\n" +
        "  宣言を begin 時点の内容へ戻すか、新しいscopeを起こすこと。宣言を広げるなら amend を使う。"
      : "  停止する前に、上記パスが本当にこのscopeの逸脱かを確認すること。別scopeの正当な作業なら、\n" +
        "  現行のverifyは宣言パスと交差しない変更で停止しない（2026-08-29 実装）。古いstateであれば\n" +
        "  rebaseline で取り直せば、以後は誤停止しない。",
  ].join("\n");
}

function assertEdit(stateInputPath, inputPaths) {
  if (inputPaths.length === 0) fail("assert requires at least one proposed edit path.");
  const state = loadState(stateInputPath);
  if (state.raw.status !== "active") fail(blockedGuidance(state, "editing"));

  inputPaths.forEach(function (inputPath, index) {
    const normalized = normalizeRelativePath(state.scope.repoPath, inputPath, "assert path[" + index + "]");
    if (!state.scope.allowedPaths.includes(normalized)) {
      fail("Out-of-scope edit denied: " + normalized + ". Obtain explicit owner approval and amend before editing.");
    }
  });

  console.log("PASS scope-lock assert: all proposed edit path(s) are allowed.");
}

function verify(stateInputPath) {
  const state = loadState(stateInputPath);
  if (state.raw.status !== "active") fail(blockedGuidance(state, "verification"));

  const baselineMap = new Map(state.baseline.map(function (entry) {
    return [entry.path, entry.sha256];
  }));
  const current = dirtySnapshot(state.scope.repoPath);
  const currentMap = new Map(current.map(function (entry) {
    return [entry.path, entry.sha256];
  }));
  const paths = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const observedChanges = [...paths].sort().map(function (path) {
    const beforeSha256 = baselineMap.has(path) ? baselineMap.get(path) : null;
    const afterSha256 = currentMap.has(path) ? currentMap.get(path) : null;
    if (!baselineMap.has(path) || beforeSha256 !== afterSha256) {
      return { path: path, beforeSha256: beforeSha256, afterSha256: afterSha256 };
    }
    return null;
  }).filter(Boolean);

  const controlPathSet = new Set(state.controlPaths);
  const controlChanges = observedChanges.filter(function (entry) {
    return controlPathSet.has(entry.path);
  });
  const sourceChanges = observedChanges.filter(function (entry) {
    return !controlPathSet.has(entry.path);
  });
  // 判定範囲は宣言パスと制御パスに交差する変更だけとする（2026-08-25 訂正
  // concurrent-scope-blocked-by-repo-wide-baseline / 2026-08-29 実装）。
  //
  // 旧実装は baseline にリポジトリ全体の dirty 集合を取り、宣言パス以外の変更を
  // すべて違反としていた。そのため**別scopeが自分の宣言パスを正しく編集しただけで、
  // 宣言パスが1つも交差しない無関係なscopeが blocked になった**。実測（案件
  // rpa-technologies-theme, 2026-08-26）では why-choose-us scope が、blog-detail scope の
  // 正当な編集5件で停止し、begin も amend も拒否されて復帰不能になった。
  // 衝突判定は scope-conflict-audit のパス交差に委ねる方針と食い違っていた。
  //
  // 無関係な変更は違反ではなく baseline の更新として扱う。ただし黙って捨てず、
  // 件数とパスを出力し history にも残す。「自分が宣言せずに編集した」場合の検出は
  // assert（編集前に非宣言パスを拒否する）と、commit時の
  // close-receipt-audit --require-coverage が引き続き担う。
  const unrelatedChanges = sourceChanges.filter(function (entry) {
    return !state.scope.allowedPaths.includes(entry.path);
  });
  const inScopeChanges = sourceChanges.filter(function (entry) {
    return state.scope.allowedPaths.includes(entry.path);
  });

  // 判定範囲を狭めたぶん、制御パスの改ざんは明示的に落とす。scope manifest は begin で
  // 一度だけ書かれ、以後 amend でも書き換えない（amend が広げるのは state 側の
  // allowedPaths である）。したがって manifest の hash が begin 時と違えば、
  // 宣言そのものを途中で書き換えたことになる。
  const beginEntry = state.raw.history.find(function (entry) { return entry.action === "begin"; });
  const expectedManifestSha256 = beginEntry ? beginEntry.scopeManifestSha256 : null;
  // controlPaths には amendment / rebaseline approval も後から加わる。並び順で選ぶと
  // それらを manifest と誤認する（実測 2026-08-29: 案件の why-choose-us scope で
  // route-amendment.json を manifest と取り違え、hash不一致で誤検知した）。
  // 内容で同定する。scope manifest だけが repoPath と allowedPaths の両方を持つ。
  const manifestRepoPath = beginEntry && beginEntry.scopeManifestPath
    ? beginEntry.scopeManifestPath
    : state.controlPaths.find(function (path) {
      const absolutePath = resolve(state.scope.repoPath, path);
      if (!existsSync(absolutePath)) return false;
      try {
        const candidate = JSON.parse(readFileSync(absolutePath, "utf8"));
        return Boolean(candidate) && typeof candidate.repoPath === "string" && Array.isArray(candidate.allowedPaths);
      } catch {
        return false;
      }
    });
  let tamperedManifest = null;
  if (expectedManifestSha256 && manifestRepoPath) {
    const actualManifestSha256 = fileHash(state.scope.repoPath, manifestRepoPath);
    if (actualManifestSha256 !== expectedManifestSha256) {
      tamperedManifest = {
        path: manifestRepoPath,
        expectedSha256: expectedManifestSha256,
        actualSha256: actualManifestSha256,
      };
    }
  }

  const result = {
    action: "verify",
    at: nowIso(),
    changedPaths: inScopeChanges,
    controlChanges: controlChanges,
    unrelatedChanges: unrelatedChanges,
    outOfScopePaths: [],
    result: tamperedManifest ? "fail" : "pass",
  };
  state.raw.history.push(result);

  if (tamperedManifest) {
    state.raw.status = "blocked";
    state.raw.blocked = {
      at: result.at,
      reason: "scope-manifest-tampered",
      paths: [tamperedManifest.path],
      expectedSha256: tamperedManifest.expectedSha256,
      actualSha256: tamperedManifest.actualSha256,
    };
    saveState(state);
    fail(
      "Scope manifest changed after begin: " + tamperedManifest.path +
      "\n  begin時のhash: " + tamperedManifest.expectedSha256 +
      "\n  現在のhash:    " + (tamperedManifest.actualSha256 || "(ファイルが無い)") +
      "\n  宣言そのものを途中で書き換えている。宣言を広げるときは amend を使う（オーナー承認が要る）。"
    );
  }

  // 無関係な変更は baseline を更新して取り込む。次回の verify で再び差分として出さない。
  if (unrelatedChanges.length > 0) {
    const merged = new Map(state.baseline.map(function (entry) { return [entry.path, entry.sha256]; }));
    unrelatedChanges.forEach(function (entry) { merged.set(entry.path, entry.afterSha256); });
    state.raw.baseline = [...merged.entries()]
      .map(function (pair) { return { path: pair[0], sha256: pair[1] }; })
      .sort(function (left, right) { return left.path < right.path ? -1 : left.path > right.path ? 1 : 0; });
  }

  saveState(state);
  console.log("PASS scope-lock verify: 宣言パスの変更 " + inScopeChanges.length + " 件、対象外変更 0 件。");
  if (unrelatedChanges.length > 0) {
    console.log(
      "  参考: 宣言パスと交差しない変更 " + unrelatedChanges.length + " 件をbaselineへ取り込んだ（違反ではない）。"
    );
    unrelatedChanges.forEach(function (entry) { console.log("    " + entry.path); });
    console.log(
      "  これらが自分の編集である場合、assert を通していないことになる。宣言し直すか、commit時の" +
      " close-receipt-audit --require-coverage で落ちる。"
    );
  }
}

function amend(stateInputPath, amendmentInputPath) {
  const state = loadState(stateInputPath);
  if (state.raw.status !== "active") {
    fail(blockedGuidance(state, "amend"));
  }

  const amendmentPath = assertInside(state.scope.repoPath, resolve(amendmentInputPath), "Scope amendment file");
  const raw = readJson(amendmentPath, "Scope amendment");
  requireObject(raw, "Scope amendment");
  if (raw.version !== 1) fail("Scope amendment.version must be 1.");
  if (requireIdentifier(raw.scopeId, "Scope amendment.scopeId") !== state.scope.scopeId) {
    fail("Scope amendment.scopeId must match the active scope.");
  }

  const approval = requireObject(raw.ownerApproval, "Scope amendment.ownerApproval");
  if (requireString(approval.status, "Scope amendment.ownerApproval.status") !== "approved") {
    fail("Scope amendment.ownerApproval.status must be approved.");
  }
  if (requireString(approval.approvedBy, "Scope amendment.ownerApproval.approvedBy") !== "owner") {
    fail("Scope amendment.ownerApproval.approvedBy must be owner.");
  }
  requireString(approval.approvedAt, "Scope amendment.ownerApproval.approvedAt");
  requireString(approval.instruction, "Scope amendment.ownerApproval.instruction");

  const amendmentRepoPath = repoPathFromAbsolute(state.scope.repoPath, amendmentPath, "Scope amendment file");
  const addAllowedPaths = normalizePathArray(state.scope.repoPath, raw.addAllowedPaths, "Scope amendment.addAllowedPaths");
  const additions = addAllowedPaths.filter(function (path) {
    return !state.scope.allowedPaths.includes(path);
  });
  if (additions.length === 0) fail("Scope amendment must add at least one new path.");

  state.raw.scope.allowedPaths = state.scope.allowedPaths.concat(additions).sort();
  if (!state.controlPaths.includes(amendmentRepoPath)) {
    state.raw.controlPaths = state.controlPaths.concat([amendmentRepoPath]).sort();
  }
  state.raw.history.push({
    action: "amend",
    at: nowIso(),
    amendmentSha256: sha256(readFileSync(amendmentPath)),
    addedPaths: additions,
    ownerApproval: {
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      instruction: approval.instruction,
    },
  });
  saveState(state);
  console.log("PASS scope-lock amend: " + additions.length + " path(s) added after explicit owner approval.");
}

// blocked からの正規の復帰手順（2026-08-25 訂正の後半 / 2026-08-29 実装）。
//
// 従来 blocked は行き止まりだった。begin は既存stateを不変として拒否し、amend は blocked を
// 拒否する。そのため誤停止しても復帰できず、scopeを捨てて起こし直すしかなかった。
// verify の判定を交差基準へ寄せたことで誤停止は起きなくなるが、既に blocked のstateと、
// 本物の違反から戻る手順は別に要る。
//
// rebaseline は「いま作業ツリーにある変更を新しい baseline として受け入れ、active へ戻す」。
// 履歴は消さない。オーナー承認を必須にするのは、blocked が本物の逸脱だった場合に
// エージェントの判断で無かったことにさせないためである。
function rebaseline(stateInputPath, approvalInputPath) {
  const state = loadState(stateInputPath);
  if (state.raw.status !== "blocked") {
    fail("rebaseline is only for a blocked scope lock. Current status: " + state.raw.status + ".");
  }

  const approvalPath = assertInside(state.scope.repoPath, resolve(approvalInputPath), "Scope rebaseline approval file");
  const raw = readJson(approvalPath, "Scope rebaseline approval");
  requireObject(raw, "Scope rebaseline approval");
  if (raw.version !== 1) fail("Scope rebaseline approval.version must be 1.");
  if (requireIdentifier(raw.scopeId, "Scope rebaseline approval.scopeId") !== state.scope.scopeId) {
    fail("Scope rebaseline approval.scopeId must match the blocked scope.");
  }
  const approval = requireObject(raw.ownerApproval, "Scope rebaseline approval.ownerApproval");
  if (requireString(approval.status, "Scope rebaseline approval.ownerApproval.status") !== "approved") {
    fail("Scope rebaseline approval.ownerApproval.status must be approved.");
  }
  if (requireString(approval.approvedBy, "Scope rebaseline approval.ownerApproval.approvedBy") !== "owner") {
    fail("Scope rebaseline approval.ownerApproval.approvedBy must be owner.");
  }
  requireString(approval.approvedAt, "Scope rebaseline approval.ownerApproval.approvedAt");
  const instruction = requireString(approval.instruction, "Scope rebaseline approval.ownerApproval.instruction");
  if (instruction.trim().length < 20) {
    fail("Scope rebaseline approval.ownerApproval.instruction must record why the block is being cleared (>=20 chars).");
  }

  // 宣言そのものを書き換えたまま再開させない。manifest改ざんは rebaseline では戻せない。
  if (state.raw.blocked && state.raw.blocked.reason === "scope-manifest-tampered") {
    fail(
      "A scope-manifest-tampered block cannot be cleared by rebaseline." +
      "\n  宣言ファイルを begin 時点の内容へ戻すか、新しいscopeを起こすこと。"
    );
  }

  const clearedBlock = state.raw.blocked || null;
  const approvalRepoPath = repoPathFromAbsolute(state.scope.repoPath, approvalPath, "Scope rebaseline approval file");
  if (!state.controlPaths.includes(approvalRepoPath)) {
    state.raw.controlPaths = state.controlPaths.concat([approvalRepoPath]).sort();
  }
  state.raw.baseline = dirtySnapshot(state.scope.repoPath);
  state.raw.status = "active";
  delete state.raw.blocked;
  state.raw.history.push({
    action: "rebaseline",
    at: nowIso(),
    approvalSha256: sha256(readFileSync(approvalPath)),
    clearedBlock: clearedBlock,
    ownerApproval: {
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      instruction: approval.instruction,
    },
  });
  saveState(state);
  console.log(
    "PASS scope-lock rebaseline: " + state.scope.scopeId + " を active へ戻した（baseline " +
    state.raw.baseline.length + " 件で取り直した）。解除した停止は履歴に残している。"
  );
}

function showStatus(stateInputPath) {
  const state = loadState(stateInputPath);
  console.log(JSON.stringify({
    scopeId: state.scope.scopeId,
    status: state.raw.status,
    allowedPaths: state.raw.scope.allowedPaths,
    latest: state.raw.history[state.raw.history.length - 1] || null,
  }, null, 2));
}

function usage() {
  console.error("Usage:");
  console.error("  node figma-scope-lock.mjs begin <scope.json> <state.json>");
  console.error("  node figma-scope-lock.mjs assert <state.json> <relative-path> [relative-path...]");
  console.error("  node figma-scope-lock.mjs verify <state.json>");
  console.error("  node figma-scope-lock.mjs amend <state.json> <amendment.json>");
  console.error("  node figma-scope-lock.mjs status <state.json>");
}

try {
  if (command === "begin" && args.length === 2) {
    begin(args[0], args[1]);
  } else if (command === "assert" && args.length >= 2) {
    assertEdit(args[0], args.slice(1));
  } else if (command === "verify" && args.length === 1) {
    verify(args[0]);
  } else if (command === "amend" && args.length === 2) {
    amend(args[0], args[1]);
  } else if (command === "rebaseline" && args.length === 2) {
    rebaseline(args[0], args[1]);
  } else if (command === "status" && args.length === 1) {
    showStatus(args[0]);
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error("ERROR scope-lock: " + error.message);
  process.exitCode = 1;
}