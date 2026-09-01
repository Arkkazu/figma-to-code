// scope lock state の構造契約。CLI（tools/figma-scope-lock.mjs）と
// Figma gate（figma-gate.mjs）の両方がこの1箇所を使う。
//
// 2026-09-01 実測：gate は `scopeLockStatePath` の **存在** しか見ていなかった
// （figma-gate.mjs の scopeLock 参照は1箇所、`existsSync` のみ）。そのため
// `{ status: "active", allowedPaths: [...] }` だけの最小の偽 state でも通り、
// `status: "blocked"` の state も通った。案件実測で state 102件のうち
// blocked は 31件あり、そのすべてが gate を通過できる状態だった。
// 正規の validator は CLI 側にあったが、gate から一度も呼ばれていなかった。
//
// 契約を2実装に分けると必ず乖離するので、構造検査はここだけに置く。
// パス正規化や git 走査は CLI 側の責務として残す（gate に新しい I/O を持ち込まない）。

import { isAbsolute, relative, resolve } from "node:path";

export const SCOPE_LOCK_STATE_VERSION = 1;
export const SCOPE_LOCK_STATE_KIND = "figma-scope-lock-state";
export const SCOPE_LOCK_STATE_STATUSES = Object.freeze(["active", "blocked"]);
// 編集を許可してよい status。blocked はここに含めない。
export const SCOPE_LOCK_EDITABLE_STATUSES = Object.freeze(["active"]);
export const SCOPE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

// リポジトリ外・.git 侵入だけを見る。glob禁止は宣言パスに対する CLI 側の検査であり、
// 走査済みの実在パスに適用すると運用が止まる（2026-08-26 の実害）。ここでは適用しない。
export function isContainedRelativePath(repoRoot, value) {
  if (!isNonEmptyString(value)) return false;
  const input = value.split("\\").join("/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) return false;
  const normalized = relative(resolve(repoRoot), resolve(repoRoot, input)).split("\\").join("/");
  if (normalized === "" || normalized === "." || normalized.startsWith("../") || isAbsolute(normalized)) {
    return false;
  }
  return !normalized.split("/").includes(".git");
}

/**
 * scope lock state の構造契約を検査する。純関数で、I/O も git 呼び出しもしない。
 * 返り値は人が読める finding の配列。空配列なら契約を満たす。
 *
 * @param {unknown} raw               JSON.parse 済みの state
 * @param {object}  options
 * @param {string}  options.repoRoot            相対パス検査の基点
 * @param {string=} options.expectedScopeId     突き合わせる scopeId（gate manifest の id）
 * @param {boolean=} options.requireEditable    編集を許可する phase では true（blocked を落とす）
 */
export function collectScopeLockStateFindings(raw, options = {}) {
  const { repoRoot, expectedScopeId, requireEditable = false } = options;
  const findings = [];
  const add = (message) => findings.push(message);

  if (!isPlainObject(raw)) {
    add("scope lock state はオブジェクトではない。scope lock の state ファイルを指していない可能性がある。");
    return findings;
  }

  if (raw.version !== SCOPE_LOCK_STATE_VERSION) {
    add(`scope lock state.version は ${SCOPE_LOCK_STATE_VERSION} でなければならない（実際: ${JSON.stringify(raw.version)}）。`);
  }
  if (raw.kind !== SCOPE_LOCK_STATE_KIND) {
    add(
      `scope lock state.kind は "${SCOPE_LOCK_STATE_KIND}" でなければならない（実際: ${JSON.stringify(raw.kind)}）。` +
        " scope manifest（`scope-<id>.json`）ではなく state（`scope-<id>.state.json`）を指すこと。",
    );
  }

  if (!SCOPE_LOCK_STATE_STATUSES.includes(raw.status)) {
    add(`scope lock state.status は ${SCOPE_LOCK_STATE_STATUSES.join(" か ")} でなければならない（実際: ${JSON.stringify(raw.status)}）。`);
  } else if (requireEditable && !SCOPE_LOCK_EDITABLE_STATUSES.includes(raw.status)) {
    add(
      `scope lock state.status が "${raw.status}" である。この状態で編集工程を進めてはならない。\n` +
        "      これは異常ではなく定常手順である。scope lock が宣言外の変更を検出して止めている。\n" +
        "      復旧: 宣言外パスを元に戻すか、対象を増やすならオーナー承認を得て\n" +
        "        node C:/AI/figma-to-code/tools/figma-scope-lock.mjs amend <state> <amendment>\n" +
        "      をPASSさせてから、この工程をやり直す。blocked のまま active へ書き換えない。",
    );
  }

  if (!isPlainObject(raw.scope)) {
    add("scope lock state.scope はオブジェクトでなければならない。");
  } else {
    const scope = raw.scope;
    if (scope.version !== SCOPE_LOCK_STATE_VERSION) {
      add(`scope lock state.scope.version は ${SCOPE_LOCK_STATE_VERSION} でなければならない（実際: ${JSON.stringify(scope.version)}）。`);
    }
    if (!isNonEmptyString(scope.scopeId) || !SCOPE_ID_PATTERN.test(scope.scopeId.trim())) {
      add(`scope lock state.scope.scopeId が識別子として不正（実際: ${JSON.stringify(scope.scopeId)}）。`);
    } else if (isNonEmptyString(expectedScopeId) && scope.scopeId.trim() !== expectedScopeId.trim()) {
      add(
        `scope lock state.scope.scopeId が対象scopeと一致しない。` +
          `\n      期待: ${expectedScopeId}\n      実際: ${scope.scopeId}` +
          "\n      別scopeのstateを指している。自分のscopeのstateを宣言すること。",
      );
    }
    if (!isNonEmptyString(scope.repoPath)) {
      add("scope lock state.scope.repoPath は非空文字列でなければならない。");
    }
    if (!Array.isArray(scope.allowedPaths) || scope.allowedPaths.length === 0) {
      add("scope lock state.scope.allowedPaths は非空配列でなければならない。");
    } else if (!scope.allowedPaths.every((entry) => isNonEmptyString(entry))) {
      add("scope lock state.scope.allowedPaths の要素は非空文字列でなければならない。");
    }
  }

  if (!Array.isArray(raw.baseline)) {
    add("scope lock state.baseline は配列でなければならない。");
  } else {
    const paths = [];
    for (const [index, entry] of raw.baseline.entries()) {
      if (!isPlainObject(entry)) {
        add(`scope lock state.baseline[${index}] はオブジェクトでなければならない。`);
        continue;
      }
      if (repoRoot !== undefined && !isContainedRelativePath(repoRoot, entry.path)) {
        add(`scope lock state.baseline[${index}].path がリポジトリ内の相対パスでない（実際: ${JSON.stringify(entry.path)}）。`);
        continue;
      }
      if (entry.sha256 !== null && typeof entry.sha256 !== "string") {
        add(`scope lock state.baseline[${index}].sha256 は SHA-256 文字列か null でなければならない。`);
      }
      paths.push(String(entry.path).split("\\").join("/"));
    }
    if (new Set(paths).size !== paths.length) {
      add("scope lock state.baseline に重複したパスがある。");
    }
  }

  if (!Array.isArray(raw.history)) {
    add("scope lock state.history は配列でなければならない。");
  }

  if (!Array.isArray(raw.controlPaths) || raw.controlPaths.length < 2) {
    add("scope lock state.controlPaths は manifest と state を含む2要素以上の配列でなければならない。");
  } else {
    const control = raw.controlPaths.map((entry) => String(entry).split("\\").join("/"));
    if (!raw.controlPaths.every((entry) => isNonEmptyString(entry))) {
      add("scope lock state.controlPaths の要素は非空文字列でなければならない。");
    }
    if (new Set(control).size !== control.length) {
      add("scope lock state.controlPaths に重複がある。");
    }
  }

  return findings;
}
