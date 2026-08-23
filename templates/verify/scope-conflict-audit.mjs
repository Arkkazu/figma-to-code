import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

// 担当者名は案件ごとに決まる。正本の配布物に特定の名前を焼き込まないため、
// 既定を持ちつつ scope-coordination.json の actors で上書きできるようにする。
const DEFAULT_ACTORS = ["claude", "codex"];
const GATE_KINDS = new Set(["figma", "coding"]);
const OPERATIONS = new Set(["preflight", "amend"]);

class AuditError extends Error {
  constructor(violations) {
    super(violations.join("\n"));
    this.violations = violations;
  }
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} がありません: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} を読めません: ${error.message}`);
  }
}

function globMatches(pattern, path) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function samePaths(left, right) {
  return left.length === right.length && [...left].sort().every((path, index) => path === [...right].sort()[index]);
}

function operationTargets(manifest, label) {
  const scope = manifest?.scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) throw new Error(`${label} の scope がありません。`);
  if (!Array.isArray(scope.changeTargets) || scope.changeTargets.length === 0) throw new Error(`${label} の scope.changeTargets がありません。`);
  const deleteTargets = scope.deleteTargets === undefined ? [] : scope.deleteTargets;
  if (!Array.isArray(deleteTargets)) throw new Error(`${label} の scope.deleteTargets は配列である必要があります。`);
  return [...scope.changeTargets, ...deleteTargets].map(normalizePath);
}

// coding gate は状態をworktree外へ置ける（CODING_GATE_STATE_DIR）。受領証の場所を
// root配下に決め打ちすると、外部stateDirを使う実行では保持中の受領証が見えず、
// 「誰も保持していない」と誤判定して衝突を素通りさせる。ゲートと同じ規則で解決する。
function gateStateDir(root, gateKind) {
  if (gateKind === "coding") {
    const configured = process.env.CODING_GATE_STATE_DIR?.trim();
    if (configured) {
      if (!isAbsolute(configured)) throw new Error("CODING_GATE_STATE_DIR は絶対パスである必要があります。");
      return configured;
    }
  }
  return resolve(root, `.${gateKind}-gate`);
}

function readGateState(root, gateKind) {
  const statePath = resolve(gateStateDir(root, gateKind), "active.json");
  if (!existsSync(statePath)) return null;
  return readJson(statePath, `${gateKind} gate state`);
}

function activeGateClaim(root, gateKind) {
  const state = readGateState(root, gateKind);
  if (!state || ["closed", "aborted"].includes(state.phase)) return null;
  let targets = Array.isArray(state.changeTargets) ? state.changeTargets.map(normalizePath) : null;
  if (!targets && typeof state.manifestPath === "string") {
    targets = operationTargets(readJson(state.manifestPath, `${gateKind} gate manifest`), `${gateKind} gate manifest`);
  }
  if (!targets) throw new Error(`${gateKind} gateのactive受領証にchangeTargetsがありません。`);
  return {
    id: String(state.manifestId ?? "unknown"),
    source: `${gateKind} gate receipt`,
    targets,
    state,
  };
}

function dirtyPaths(root) {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) throw new Error(`git status --porcelain を実行できません。${result.error ? ` ${result.error.message}` : ""}`);
  const paths = new Set();
  for (const line of result.stdout.split("\n")) {
    if (!line) continue;
    const body = line.slice(3).trim();
    const arrow = body.indexOf(" -> ");
    const values = arrow >= 0 ? [body.slice(0, arrow), body.slice(arrow + 4)] : [body];
    for (const value of values) paths.add(normalizePath(value.replace(/^"|"$/g, "").trim()));
  }
  return paths;
}

function validateOwnershipRules(ownership, violations, actors) {
  if (ownership?.version !== 2) violations.push("共有所有者台帳の version は 2 である必要があります。");
  const rules = ownership?.exclusivePathOwnership;
  if (!Array.isArray(rules) || rules.length === 0) {
    violations.push("共有所有者台帳に exclusivePathOwnership がありません。");
    return [];
  }
  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule.pattern !== "string" || rule.pattern.trim() === "") violations.push(`共有所有者台帳の ${index} 行目に pattern がありません。`);
    if (!actors.has(rule?.owner)) violations.push(`共有所有者台帳の ${index} 行目の owner が不正です。`);
    if (rule?.except !== undefined && !Array.isArray(rule.except)) violations.push(`共有所有者台帳の ${index} 行目の except は配列である必要があります。`);
  }
  return rules;
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function closedFigmaScopeFileHashes(root) {
  const checkpointsRoot = resolve(root, "MyBrain/verify/checkpoints");
  const byPath = new Map();
  if (!existsSync(checkpointsRoot)) return byPath;
  for (const entry of readdirSync(checkpointsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const reportPath = resolve(checkpointsRoot, entry.name, "close-report.json");
    if (!existsSync(reportPath)) continue;
    let report;
    try {
      report = readJson(reportPath, `Figma close report (${entry.name})`);
    } catch {
      continue;
    }
    if (report?.result?.specFail !== 0 || report?.result?.layoutFail !== 0 || report?.result?.visualFail !== 0) continue;
    if (!report.fileHashes || typeof report.fileHashes !== "object") continue;
    for (const [path, sha256] of Object.entries(report.fileHashes)) {
      if (typeof sha256 !== "string") continue;
      const normalizedPath = normalizePath(path);
      if (!byPath.has(normalizedPath)) byPath.set(normalizedPath, new Set());
      byPath.get(normalizedPath).add(sha256);
    }
  }
  return byPath;
}

function permittedDirtyTargets(root, manifest, gateKind, targets, violations) {
  const permitted = new Set();
  // 生成物の宣言はゲートで名前が違うだけで意味は同じ。
  const generatedField = gateKind === "figma" ? "generatedTargets" : "generatedPaths";
  const generatedTargets = manifest.scope?.[generatedField];
  if (generatedTargets !== undefined) {
    if (!Array.isArray(generatedTargets)) {
      violations.push(`manifest の scope.${generatedField} は配列である必要があります。`);
    } else {
      for (const path of generatedTargets) permitted.add(normalizePath(path));
    }
  }
  const approval = manifest.scope?.preEditApproval;
  if (approval !== undefined) {
    if (!approval || typeof approval !== "object" || Array.isArray(approval) || typeof approval.instruction !== "string" || !Array.isArray(approval.paths)) {
      violations.push("manifest の scope.preEditApproval が不正です。");
    } else {
      for (const path of approval.paths) permitted.add(normalizePath(path));
    }
  }
  // 完了済みFigma scopeの合格時点と内容が一致する引き継ぎは、Figma scopeでだけ判定する。
  // close-report を書くのが figma gate だけであるため。
  if (gateKind !== "figma") return permitted;
  const closedHashes = closedFigmaScopeFileHashes(root);
  for (const target of targets) {
    const hashes = closedHashes.get(target);
    const absoluteTarget = resolve(root, target);
    if (hashes && existsSync(absoluteTarget) && hashes.has(hashFile(absoluteTarget))) permitted.add(target);
  }
  return permitted;
}

// 1スコープが両ゲートを使う場合、そのscopeのmanifestはゲート種別ごとに別ファイルになる。
// entry.gateManifestPaths が宣言されていればそれを正とし、無ければ従来の manifestPath を使う。
function entryManifestPath(entry, gateKind) {
  const perGate = entry?.gateManifestPaths;
  if (perGate && typeof perGate === "object" && !Array.isArray(perGate) && typeof perGate[gateKind] === "string") {
    return perGate[gateKind];
  }
  return entry?.manifestPath;
}

function loadCoordinationEntry(root, entry, violations, actors) {
  if (!entry || typeof entry.id !== "string" || !actors.has(entry.actor) || typeof entry.implementationContextId !== "string" || entry.implementationContextId.trim() === "" || typeof entry.manifestPath !== "string") {
    violations.push("scope coordination台帳の active/waiting行に id・actor・implementationContextId・manifestPath が揃っていません。");
    return null;
  }
  const absoluteManifestPath = resolve(root, entry.manifestPath);
  let manifest;
  let targets;
  try {
    manifest = readJson(absoluteManifestPath, `${entry.id} のmanifest`);
    targets = operationTargets(manifest, `${entry.id} のmanifest`);
  } catch (error) {
    violations.push(error.message);
    return null;
  }
  if (manifest.id !== entry.id) violations.push(`scope coordination台帳の ${entry.id} はmanifest idと一致しません。`);
  // Figma gate v13 の manifest は identity を持たない（実行時フラグだけを正とする設計）。
  // 宣言がある場合だけ突き合わせる。宣言が無いこと自体は違反ではなく、
  // その scope の identity は台帳の行が唯一の記録になる。
  if (manifest.scope?.implementationActor !== undefined && manifest.scope.implementationActor !== entry.actor) {
    violations.push(`scope coordination台帳の ${entry.id} はmanifestのimplementationActorと一致しません。`);
  }
  if (manifest.scope?.implementationContextId !== undefined && manifest.scope.implementationContextId !== entry.implementationContextId) {
    violations.push(`scope coordination台帳の ${entry.id} はmanifestのimplementationContextIdと一致しません。`);
  }
  if (!entry.gates || typeof entry.gates !== "object" || Array.isArray(entry.gates)) violations.push(`scope coordination台帳の ${entry.id} に gates がありません。`);
  return { entry, manifest, targets, absoluteManifestPath };
}

function dependencySatisfied(root, dependency) {
  if (!dependency || typeof dependency !== "object" || !GATE_KINDS.has(dependency.gate)) return false;
  const state = readGateState(root, dependency.gate);
  return Boolean(state && state.manifestId === dependency.scopeId && state.phase === (dependency.phase ?? "closed"));
}

function audit({ root, manifestPath, gateKind, operation, identity = {} }) {
  const violations = [];
  const absoluteManifestPath = isAbsolute(manifestPath) ? manifestPath : resolve(root, manifestPath);
  let manifest;
  let ownership;
  let coordination;
  try {
    manifest = readJson(absoluteManifestPath, "対象manifest");
    ownership = readJson(resolve(root, "MyBrain/verify/shared-component-ownership.json"), "共有所有者台帳");
    coordination = readJson(resolve(root, "MyBrain/verify/scope-coordination.json"), "scope coordination台帳");
  } catch (error) {
    throw new AuditError([error.message]);
  }

  // 担当者の集合は台帳が持つ。ここに焼き込むと、案件が担当者を増やすたびに正本を書き換える
  // ことになり、監査だけが古い集合で落ちる状態が生まれる。
  const declaredActors = Array.isArray(coordination.actors) ? coordination.actors.filter((value) => typeof value === "string" && value.trim() !== "") : [];
  const actors = new Set(declaredActors.length > 0 ? declaredActors : DEFAULT_ACTORS);

  const scopeId = typeof manifest.id === "string" ? manifest.id : "";
  // identityの出どころは2つある。coding gate は manifest.scope に宣言させ、Figma gate v13 は
  // preflightのCLIフラグだけを認めて manifest 側の宣言を拒否する（ファイルの自己申告は
  // 古くなりうるという理由）。監査はどちらの流儀も受け取れる必要があるため、
  // 渡された値を優先し、無いときだけ manifest を見る。
  const actor = identity.actor ?? manifest.scope?.implementationActor;
  const contextId = identity.contextId ?? manifest.scope?.implementationContextId;
  let targets = [];
  try {
    targets = operationTargets(manifest, "対象manifest");
  } catch (error) {
    violations.push(error.message);
  }
  if (!scopeId) violations.push("対象manifestの id がありません。");
  if (!actors.has(actor)) violations.push(`実装者は ${[...actors].join(" または ")} のいずれかである必要があります（--actor か対象manifestの scope.implementationActor で渡す）。`);
  if (typeof contextId !== "string" || contextId.trim() === "") violations.push("実装コンテキストIDがありません（--context-id か対象manifestの scope.implementationContextId で渡す）。");
  if (!OPERATIONS.has(operation)) violations.push("scope conflict auditのoperationが不正です。");
  if (operation === "amend" && gateKind !== "coding") violations.push("amendはcoding gateだけで実行できます。");
  const ownershipRules = validateOwnershipRules(ownership, violations, actors);

  if (!Array.isArray(coordination.scopes)) {
    violations.push("scope coordination台帳の scopes がありません。");
  }
  const entries = Array.isArray(coordination.scopes) ? coordination.scopes : [];
  const activeEntries = entries.filter((entry) =>
    entry?.status === "active"
    || entry?.status === "waiting"
    || (operation === "preflight" && entry?.id === scopeId && entry?.status === "aborted" && entry?.gates?.[gateKind] === "aborted")
  );
  const loadedEntries = activeEntries.map((entry) => loadCoordinationEntry(root, entry, violations, actors)).filter(Boolean);
  const own = loadedEntries.find(({ entry }) => entry.id === scopeId);
  if (!own) {
    violations.push(`${scopeId || "対象scope"} はscope coordination台帳で active または waiting として予約されていません。`);
  } else {
    if (own.entry.actor !== actor) violations.push(`${scopeId} の担当者がmanifestとscope coordination台帳で一致しません。`);
    if (own.entry.implementationContextId !== contextId) violations.push(`${scopeId} のimplementationContextIdがmanifestとscope coordination台帳で一致しません。`);
    const expectedManifestPath = entryManifestPath(own.entry, gateKind);
    if (normalizePath(relative(root, absoluteManifestPath)) !== normalizePath(expectedManifestPath)) {
      violations.push(`${scopeId} の ${gateKind} gate のmanifestPathがscope coordination台帳と一致しません（台帳: ${expectedManifestPath}）。`);
    }
    if (!samePaths(own.targets, targets)) violations.push(`${scopeId} の操作対象がscope coordination台帳のmanifestと一致しません。`);
    const acceptedGateStates = operation === "preflight" ? ["active", "waiting", "aborted"] : ["active", "waiting"];
    if (!GATE_KINDS.has(gateKind) || !acceptedGateStates.includes(own.entry.gates?.[gateKind])) {
      violations.push(`${scopeId} はscope coordination台帳で ${gateKind} gate を ${acceptedGateStates.join("、")} として予約していません。`);
    }
    for (const dependency of own.entry.dependsOn ?? []) {
      if (!dependencySatisfied(root, dependency)) {
        violations.push(`${scopeId} は依存scope ${dependency.scopeId} の ${dependency.gate} gate ${dependency.phase ?? "closed"} を待機中です。`);
      }
    }
  }

  let figmaClaim = null;
  let codingClaim = null;
  try {
    figmaClaim = activeGateClaim(root, "figma");
    codingClaim = activeGateClaim(root, "coding");
  } catch (error) {
    violations.push(error.message);
  }
  if (gateKind === "figma" && figmaClaim) {
    violations.push(`Figma gate受領証は ${figmaClaim.id} が保持中です。preflightで上書きできません。`);
  }
  if (gateKind === "coding" && operation === "preflight" && codingClaim) {
    violations.push(`Coding gate受領証は ${codingClaim.id} が保持中です。preflightで上書きできません。`);
  }
  const frozenAmendTargets = new Set();
  if (operation === "amend" && gateKind === "coding") {
    if (!codingClaim || codingClaim.id !== scopeId || codingClaim.state?.phase !== "preflight") {
      violations.push("coding amendには同一scopeのpreflight受領証が必要です。");
    } else {
      for (const target of [...(codingClaim.state.changeTargets || []), ...(codingClaim.state.deleteTargets || [])]) {
        frozenAmendTargets.add(normalizePath(target));
      }
    }
  }
  const codingState = readGateState(root, "coding");
  if (gateKind === "figma" && codingState && !["closed", "aborted"].includes(codingState.phase) && codingState.figmaGate) {
    violations.push(`Coding scope ${codingState.manifestId} がFigma受領証 ${codingState.figmaGate.manifestId} を参照中です。Figma preflightで上書きできません。`);
  }

  const claims = [
    ...loadedEntries.map(({ entry, targets: entryTargets }) => ({ id: entry.id, source: `coordination:${entry.status}`, targets: entryTargets })),
    ...[figmaClaim, codingClaim].filter(Boolean),
  ];
  let dirty = new Set();
  try {
    dirty = dirtyPaths(root);
  } catch (error) {
    violations.push(error.message);
  }
  const permittedDirty = permittedDirtyTargets(root, manifest, gateKind, targets, violations);

  for (const target of targets) {
    const ownershipRule = ownershipRules.find((rule) =>
      typeof rule?.pattern === "string"
      && globMatches(rule.pattern, target)
      && !(Array.isArray(rule.except) && rule.except.some((exception) => globMatches(exception, target))),
    );
    if (!ownershipRule) violations.push(`${target} の排他的所有者が共有所有者台帳にありません。`);
    else if (ownershipRule.owner !== actor) violations.push(`${target} の所有者は ${ownershipRule.owner} です。${actor} のscopeには宣言できません。`);

    for (const claim of claims.filter((claim) => claim.id !== scopeId && claim.targets.includes(target))) {
      violations.push(`${target} は ${claim.id}（${claim.source}）と競合します。`);
    }
    if (dirty.has(target) && !permittedDirty.has(target) && !(operation === "amend" && frozenAmendTargets.has(target))) {
      violations.push(
        gateKind === "figma"
          ? `${target} はdirtyです。preEditApproval・generatedTargets・closed Figma scopeの検証済みhashのいずれの根拠もなくpreflightできません。`
          : `${target} はdirtyです。Coding scopeは編集前にpreflightが必要です。新規preflightを開始できません。`
      );
    }
  }

  if (violations.length > 0) throw new AuditError(violations);
  return { scopeId, actor, targetCount: targets.length, gateKind, operation };
}

function parseArgs(argv) {
  let gateKind = null;
  let operation = "preflight";
  const identity = {};
  const positional = [];
  const named = {
    "--gate": (value) => { gateKind = value; },
    "--operation": (value) => { operation = value; },
    "--actor": (value) => { identity.actor = value; },
    "--context-id": (value) => { identity.contextId = value; },
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const equals = value.indexOf("=");
    const flag = equals >= 0 ? value.slice(0, equals) : value;
    if (!Object.hasOwn(named, flag)) { positional.push(value); continue; }
    named[flag](equals >= 0 ? value.slice(equals + 1) : argv[++index]);
  }
  return { gateKind, operation, identity, manifestPath: positional[0] };
}

const { gateKind, operation, identity, manifestPath } = parseArgs(process.argv.slice(2));
if (!manifestPath || !GATE_KINDS.has(gateKind) || !OPERATIONS.has(operation)) {
  console.error("Usage: node MyBrain/verify/scope-conflict-audit.mjs --gate <figma|coding> [--operation <preflight|amend>] [--actor <name> --context-id <id>] <manifest.json>");
  process.exit(2);
}

try {
  const result = audit({ root: process.cwd(), manifestPath, gateKind, operation, identity });
  console.log(`PASS: scope conflict audit (${result.scopeId}) / ${result.targetCount} target(s) / actor=${result.actor} / gate=${result.gateKind} / operation=${result.operation}`);
} catch (error) {
  const violations = error instanceof AuditError ? error.violations : [error.message];
  for (const violation of violations) console.error(`FAIL: ${violation}`);
  process.exit(1);
}
