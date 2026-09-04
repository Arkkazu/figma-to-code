#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const repoRoot = process.cwd();
const [command, ...args] = process.argv.slice(2);

class PromotionError extends Error {}

function fail(message) {
  throw new PromotionError(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function requirePositiveInteger(value, label, minimum = 1) {
  if (!Number.isInteger(value) || value < minimum) fail(`${label} must be an integer greater than or equal to ${minimum}.`);
  return value;
}

function requireIdentifier(value, label) {
  const normalized = requireString(value, label);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) fail(`${label} must use letters, numbers, dot, underscore, or hyphen.`);
  return normalized;
}

function toRepoPath(value, label) {
  const input = requireString(value, label).replace(/\\/g, "/");
  if (isAbsolute(input) || /^[A-Za-z]:\//.test(input)) fail(`${label} must be relative to the Figma rule root.`);

  const absolutePath = resolve(repoRoot, input);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) fail(`${label} must stay inside the Figma rule root.`);

  return {
    absolutePath,
    relativePath: relativePath.replace(/\\/g, "/"),
  };
}

function normalizeRepoPath(value, label, { mustExist = false } = {}) {
  const path = toRepoPath(value, label);
  if (mustExist && !existsSync(path.absolutePath)) fail(`${label} does not exist: ${path.relativePath}`);
  return path.relativePath;
}

function readText(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} does not exist: ${filePath}`);
  return readFileSync(filePath, "utf8");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readText(filePath, label));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, jsonText(value), "utf8");
}

function writeImmutableJson(filePath, value, label) {
  const next = jsonText(value);
  if (existsSync(filePath)) {
    const current = readText(filePath, label);
    if (current !== next) fail(`${label} is immutable and already differs: ${filePath}`);
    return false;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, next, "utf8");
  return true;
}

function renderProposalMarkdown(filePath, proposal) {
  const text = proposalMarkdown(proposal);
  if (existsSync(filePath) && readText(filePath, `Log proposal ${proposal.id} markdown`) === text) return false;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, "utf8");
  return true;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeUniqueStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array.`);
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(`${label} must not contain duplicates.`);
  return normalized;
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

// 昇格差分が実際に何を消したかを測る（2026-09-04 追加）。
// review.checks.strengthensOnly / guardrailsUnchanged は文字列 "PASS" を書けば通る申告であり、
// 「弱体化していない」という主張の根拠を1つも要求していなかった。ここで差分の前後から
// 検査の在庫を数え、消えたものを列挙する。単位はファイル種別で変える。
//   .mjs … 文字列・テンプレートリテラル（検査の識別子と失敗メッセージはここに現れる）
//   .md  … 空でない行（規則の弱体化は行の削除として現れる）
// 補間は ${} へ潰し、同じ内容が複数あるものは多重集合として数える。
const GUARD_LITERAL = /`(?:[^`\\]|\\[\s\S])*`|"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'/g;

function guardInventory(relativePath, source) {
  const counts = new Map();
  const add = (key) => {
    if (key !== "") counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  if (relativePath.endsWith(".md")) {
    for (const line of source.split(/\r?\n/)) add(line.trim());
  } else {
    for (const raw of source.match(GUARD_LITERAL) || []) {
      add(raw.slice(1, -1).replace(/\$\{[^}]*\}/g, "${}").trim());
    }
  }
  return counts;
}

function measureGuardRemovals(relativePath, before, after) {
  const beforeInventory = guardInventory(relativePath, before);
  // 在庫が空なら比較が空振りする。黙って通すと「検査した」という誤った記録だけが残る。
  if (beforeInventory.size === 0) fail(`Promotion target has no guard inventory to compare: ${relativePath}`);
  const afterInventory = guardInventory(relativePath, after);
  const removals = [];
  for (const [guard, count] of beforeInventory) {
    const remaining = afterInventory.get(guard) ?? 0;
    if (remaining < count) removals.push({ target: relativePath, guard, before: count, after: remaining });
  }
  return removals.sort((left, right) => left.guard.localeCompare(right.guard));
}

function guardKey(item) {
  // 区切りに JSON を使う：guard 文字列は任意なので単一の区切り文字では衝突しうる。
  return JSON.stringify([item.target, item.guard]);
}

// 消滅は禁止しない。書き換えでメッセージを言い換えれば消滅として出るためで、
// 一律に止めれば正当な強化まで止まる。要求するのは「消えるものを事前に列挙し、
// 理由を書く」ことであり、機械はその列挙が実測と過不足なく一致するかを見る。
function assertGuardRemovalsAreDeclared(measured, declared) {
  const declaredKeys = new Set(declared.map(guardKey));
  const measuredKeys = new Set(measured.map(guardKey));
  const undeclared = measured.filter((item) => !declaredKeys.has(guardKey(item)));
  if (undeclared.length > 0) {
    fail(
      `Promotion removes ${undeclared.length} guard(s) the plan does not declare. ` +
        "A strengthen-only promotion may remove a guard only when plan.removedGuards lists it with a reason:\n" +
        undeclared.map((item) => `  - ${item.target}: ${item.guard} (${item.before} -> ${item.after})`).join("\n")
    );
  }
  const unmatched = declared.filter((item) => !measuredKeys.has(guardKey(item)));
  if (unmatched.length > 0) {
    fail(
      `Promotion plan.removedGuards declares ${unmatched.length} removal(s) the patches do not make:\n` +
        unmatched.map((item) => `  - ${item.target}: ${item.guard}`).join("\n")
    );
  }
}

function markdownSections(text) {
  const matches = [...text.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return {
      heading: match[1].trim(),
      start,
      end,
      line: lineNumber(text, start),
      raw: text.slice(start, end),
    };
  });
}

function validatePolicy(raw) {
  requireObject(raw, "Log promotion policy");
  if (raw.version !== 3) fail("Log promotion policy.version must be 3.");
  if (requireString(raw.mode, "Log promotion policy.mode") !== "proposal") {
    fail("Log promotion policy.mode must be proposal.");
  }

  const sourceLogs = raw.sourceLogs;
  if (!Array.isArray(sourceLogs) || sourceLogs.length === 0) fail("Log promotion policy.sourceLogs must be a non-empty array.");
  const normalizedSources = sourceLogs.map((source, index) => {
    requireObject(source, `Log promotion policy.sourceLogs[${index}]`);
    const kind = requireString(source.kind, `Log promotion policy.sourceLogs[${index}].kind`);
    if (!['correction', 'mistake'].includes(kind)) fail(`Log promotion policy.sourceLogs[${index}].kind is invalid.`);
    return {
      kind,
      path: normalizeRepoPath(source.path, `Log promotion policy.sourceLogs[${index}].path`, { mustExist: true }),
    };
  });
  if (new Set(normalizedSources.map((source) => source.path)).size !== normalizedSources.length) {
    fail("Log promotion policy.sourceLogs must not contain duplicate paths.");
  }

  const allowedRuleTargets = normalizeUniqueStringArray(raw.allowedRuleTargets, "Log promotion policy.allowedRuleTargets")
    .map((path, index) => normalizeRepoPath(path, `Log promotion policy.allowedRuleTargets[${index}]`, { mustExist: true }));
  const allowedVerifierTargets = normalizeUniqueStringArray(raw.allowedVerifierTargets, "Log promotion policy.allowedVerifierTargets")
    .map((path, index) => normalizeRepoPath(path, `Log promotion policy.allowedVerifierTargets[${index}]`, { mustExist: true }));

  const review = requireObject(raw.review, "Log promotion policy.review");
  if (review.requiresIndependentReview !== true || review.requiresOwnerApproval !== true || review.requiresNegativeE2E !== true || review.requiresAtomicPromotionPlan !== true) {
    fail("Log promotion policy.review must require independent review, owner approval, a negative E2E, and an atomic promotion plan.");
  }

  return {
    version: 3,
    mode: "proposal",
    schemaMarker: requireString(raw.schemaMarker, "Log promotion policy.schemaMarker"),
    sourceLogs: normalizedSources,
    recurrenceThreshold: requirePositiveInteger(raw.recurrenceThreshold, "Log promotion policy.recurrenceThreshold", 2),
    allowedRuleTargets,
    allowedVerifierTargets,
    review: {
      loopEngineeringSpec: requireString(review.loopEngineeringSpec, "Log promotion policy.review.loopEngineeringSpec"),
      requiresIndependentReview: true,
      requiresOwnerApproval: true,
      requiresNegativeE2E: true,
      requiresAtomicPromotionPlan: true,
    },
  };
}

function parseMetadata(section, source, policy) {
  const matches = [...section.raw.matchAll(/<!--\s*loop-log:\s*(\{[\s\S]*?\})\s*-->/g)];
  if (matches.length > 1) fail(`${source.path}:${section.line} must contain at most one loop-log metadata comment.`);
  if (matches.length === 0) return null;

  let raw;
  try {
    raw = JSON.parse(matches[0][1]);
  } catch (error) {
    fail(`${source.path}:${section.line} loop-log metadata is not valid JSON: ${error.message}`);
  }
  requireObject(raw, `${source.path}:${section.line} loop-log metadata`);

  const id = requireIdentifier(raw.id, `${source.path}:${section.line} loop-log.id`);
  const kind = requireString(raw.kind, `${source.path}:${section.line} loop-log.kind`);
  if (kind !== source.kind) fail(`${source.path}:${section.line} loop-log.kind must be ${source.kind}.`);
  if (requireString(raw.action, `${source.path}:${section.line} loop-log.action`) !== "strengthen") {
    fail(`${source.path}:${section.line} loop-log.action must be strengthen.`);
  }
  const failureClass = requireIdentifier(raw.failureClass, `${source.path}:${section.line} loop-log.failureClass`);
  const recurrenceKey = requireIdentifier(raw.recurrenceKey, `${source.path}:${section.line} loop-log.recurrenceKey`);
  const promotability = raw.promotability === undefined
    ? "promotable"
    : requireString(raw.promotability, `${source.path}:${section.line} loop-log.promotability`);
  if (!["promotable", "non-promotable"].includes(promotability)) {
    fail(`${source.path}:${section.line} loop-log.promotability must be promotable or non-promotable.`);
  }
  if (promotability === "non-promotable") {
    if (raw.ruleTargets !== undefined || raw.verifierTargets !== undefined) {
      fail(`${source.path}:${section.line} non-promotable loop-log must not assign ruleTargets or verifierTargets.`);
    }
    return {
      id,
      kind,
      failureClass,
      recurrenceKey,
      action: "strengthen",
      promotability,
      nonPromotableReason: requireNonPromotableReason(raw.nonPromotableReason, `${source.path}:${section.line} loop-log.nonPromotableReason`),
    };
  }

  const ruleTargets = normalizeUniqueStringArray(raw.ruleTargets, `${source.path}:${section.line} loop-log.ruleTargets`)
    .map((path, index) => normalizeRepoPath(path, `${source.path}:${section.line} loop-log.ruleTargets[${index}]`, { mustExist: true }));
  const verifierTargets = normalizeUniqueStringArray(raw.verifierTargets, `${source.path}:${section.line} loop-log.verifierTargets`)
    .map((path, index) => normalizeRepoPath(path, `${source.path}:${section.line} loop-log.verifierTargets[${index}]`, { mustExist: true }));
  for (const path of ruleTargets) {
    if (!policy.allowedRuleTargets.includes(path)) fail(`${source.path}:${section.line} targets a non-approved rule path: ${path}`);
  }
  for (const path of verifierTargets) {
    if (!policy.allowedVerifierTargets.includes(path)) fail(`${source.path}:${section.line} targets a non-approved verifier path: ${path}`);
  }

  return {
    id,
    kind,
    failureClass,
    recurrenceKey,
    action: "strengthen",
    promotability,
    ruleTargets,
    verifierTargets,
  };
}

function scanSourceLog(source, policy) {
  const absolutePath = toRepoPath(source.path, `Source log ${source.path}`).absolutePath;
  const text = readText(absolutePath, `Source log ${source.path}`);
  const markerIndex = text.indexOf(policy.schemaMarker);
  if (markerIndex < 0) fail(`Source log ${source.path} is missing schema marker: ${policy.schemaMarker}`);
  if (text.indexOf(policy.schemaMarker, markerIndex + policy.schemaMarker.length) >= 0) {
    fail(`Source log ${source.path} contains the schema marker more than once.`);
  }

  const records = [];
  const nonPromotable = [];
  const unclassified = [];
  for (const section of markdownSections(text)) {
    const metadata = parseMetadata(section, source, policy);
    const isNewEntry = section.start < markerIndex;
    if (!metadata) {
      if (isNewEntry) {
        unclassified.push({
          path: source.path,
          kind: source.kind,
          heading: section.heading,
          line: section.line,
          sha256: sha256(section.raw),
        });
      }
      continue;
    }
    const sourceEvidence = {
      path: source.path,
      heading: section.heading,
      line: section.line,
      sha256: sha256(section.raw),
    };
    if (metadata.promotability === "non-promotable") {
      nonPromotable.push({
        id: metadata.id,
        kind: metadata.kind,
        failureClass: metadata.failureClass,
        recurrenceKey: metadata.recurrenceKey,
        reason: metadata.nonPromotableReason,
        source: sourceEvidence,
      });
      continue;
    }
    records.push({ ...metadata, source: sourceEvidence });
  }

  return { records, nonPromotable, unclassified };
}

function proposalMarkdown(proposal) {
  const lines = [
    `# ${proposal.id}`,
    "",
    "## Status",
    "",
    `- ${proposal.status}`,
    "",
    "## Recurrence evidence",
    "",
    `- failure class: ${proposal.recurrence.failureClass}`,
    `- recurrence key: ${proposal.recurrence.key}`,
    `- evidence count: ${proposal.recurrence.evidence.length} / threshold ${proposal.recurrence.threshold}`,
    // 提案の evidence.source は path / heading / sha256 だけを持つ（buildProposal で line を落としている。
    // 行番号は無関係な節が上に増えるたびに動き、同じ根拠のまま提案IDが変わってしまうため）。
    // ここで line を出そうとして `:undefined` を刷っていた。review が突き合わせるのも heading と
    // sha256 なので、読み手にも同じ同定手段を出す（2026-09-04）。
    ...proposal.recurrence.evidence.map((evidence) => `- ${evidence.id}: ${evidence.source.path} / ${evidence.source.heading} (${evidence.source.sha256})`),
    "",
    "## Required change",
    "",
    "- Strengthen the listed rule only; do not weaken validation, human gates, allowlists, stop conditions, budgets, or network policy.",
    ...proposal.requiredChange.ruleTargets.map((target) => `- Rule target: ${target}`),
    ...proposal.requiredChange.verifierTargets.map((target) => `- Verifier target: ${target}`),
    "- Add a negative E2E that reproduces the failure class before promotion.",
    "",
    "## Promotion gate",
    "",
    "- Independent reviewer must record PASS for evidence, non-weakening, target scope, and negative E2E.",
    "- Owner approval is required before a canonical rule or verifier is changed.",
    `- Loop Engineering review target: ${proposal.review.loopEngineeringSpec}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildProposal(group, policy) {
  const evidence = [...group.records].sort((a, b) => a.id.localeCompare(b.id));
  const proposalEvidence = evidence.map((record) => ({
    ...record,
    source: { path: record.source.path, heading: record.source.heading, sha256: record.source.sha256 },
  }));
  const ruleTargets = [...new Set(evidence.flatMap((record) => record.ruleTargets))].sort();
  const verifierTargets = [...new Set(evidence.flatMap((record) => record.verifierTargets))].sort();
  // 識別子は evidence の内容ハッシュを含める。提案は writeImmutableJson で不変に保存するため、
  // ログ本文が変われば別IDの新しい提案として記録される必要がある（同一IDで内容だけ変えられない）。
  // ただしそれだけでは旧提案が pending-review のまま残り、同じ再発キーの提案が滞留して見える。
  // 現行提案と被代替提案の対応は proposals/current.json（可変な索引）で管理する（STATE.md [83]）。
  const signature = sha256(JSON.stringify({
    policyVersion: policy.version,
    proposalSchemaVersion: 2,
    promotionPlanRequired: true,
    recurrenceKey: group.key,
    failureClass: group.failureClass,
    evidence: proposalEvidence.map((record) => ({ id: record.id, source: record.source })),
    ruleTargets,
    verifierTargets,
  })).slice(0, 16);

  return {
    version: 1,
    id: `figma-log-${group.key}-${signature}`,
    status: "pending-review",
    generatedBy: "figma-log-promote.mjs",
    recurrence: {
      key: group.key,
      failureClass: group.failureClass,
      threshold: policy.recurrenceThreshold,
      evidence: proposalEvidence,
    },
    requiredChange: {
      action: "strengthen",
      ruleTargets,
      verifierTargets,
      negativeE2ERequired: true,
    },
    review: {
      loopEngineeringSpec: policy.review.loopEngineeringSpec,
      requiresIndependentReview: true,
      requiresOwnerApproval: true,
      applyAllowed: false,
      promotionPlanRequired: true,
    },
  };
}

function scan(policyPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));

  const records = [];
  const nonPromotable = [];
  const unclassified = [];
  for (const source of policy.sourceLogs) {
    const result = scanSourceLog(source, policy);
    records.push(...result.records);
    nonPromotable.push(...result.nonPromotable);
    unclassified.push(...result.unclassified);
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  nonPromotable.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(records.map((record) => record.id)).size !== records.length) fail("loop-log ids must be globally unique across promotable logs.");
  if (new Set(nonPromotable.map((record) => record.id)).size !== nonPromotable.length) fail("loop-log ids must be globally unique across non-promotable logs.");
  const allIds = [...records, ...nonPromotable].map((record) => record.id);
  if (new Set(allIds).size !== allIds.length) fail("loop-log ids must be globally unique across all classified logs.");

  const currentIndexPath = resolve(outputPath.absolutePath, "proposals", "current.json");
  const previousIndex = existsSync(currentIndexPath)
    ? JSON.parse(readText(currentIndexPath, "Log proposal current index"))
    : { recurrenceKeys: {} };
  const recurrenceIndex = { ...(previousIndex.recurrenceKeys || {}) };

  const closedProposalState = Object.entries(recurrenceIndex)
    .flatMap(([recurrenceKey, entry]) => (entry.closed || []).map((item) => ({
      recurrenceKey,
      closureId: item.closureId,
      proposalId: item.proposalId,
      proposalSha256: item.proposalSha256,
    })))
    .sort((a, b) => `${a.recurrenceKey}:${a.proposalId}`.localeCompare(`${b.recurrenceKey}:${b.proposalId}`));
  const intakeIdentity = {
    // 生成契約が変わったら上げる。intake ID はこの identity の hash であり、
    // 同じ入力から違う出力が出るようになった場合に ID を分けないと、
    // 同一IDで内容だけ違う intake を書こうとして writeImmutableJson が落ちる。
    // 4: 未分類が残っていても、無関係な分類済み family の提案生成を止めなくした（2026-09-01）。
    promotionOutputVersion: 4,
    policySha256: sha256(readText(policyPath.absolutePath, "Log promotion policy")),
    records: records.map((record) => ({ id: record.id, source: record.source })),
    nonPromotable,
    unclassified,
    closedProposalState,
  };
  const intakeId = `figma-log-intake-${sha256(JSON.stringify(intakeIdentity)).slice(0, 16)}`;
  const intakePath = resolve(outputPath.absolutePath, "intake", `${intakeId}.json`);

  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.recurrenceKey) || { key: record.recurrenceKey, failureClass: record.failureClass, records: [] };
    if (group.failureClass !== record.failureClass) fail(`recurrence key ${record.recurrenceKey} maps to multiple failure classes.`);
    group.records.push(record);
    groups.set(record.recurrenceKey, group);
  }

  const proposals = [];
  const closedProposalIds = [];
  // 2026-09-01 まで、この生成ブロック全体が `if (unclassified.length === 0)` で囲まれていた。
  // marker の無い節が1つでもあると、**無関係な家族の提案生成まで全面的に止まった**。
  //
  // 実測（2026-09-01）: 閾値2に到達した promotable 家族が1件
  // （page-coverage-review-invalidated-implementer-stops）あったにもかかわらず、
  // それとは無関係な2節（corrections.md:135 / mistakes.md:17）が未分類であるという
  // ただそれだけの理由で提案は0件だった。この機構は設置以来、一度も提案を出していない。
  // 「規則は増えるが検証器は強くならない」の唯一の機械的な出口が、ここで塞がっていた。
  //
  // unclassified は「その節が未分類である」という事実であって、
  // 他の家族の再発が起きていないという根拠にはならない。分類の未完了は status と
  // 一覧に残し、提案生成は止めない。提案は従来どおり pending-review 止まりであり、
  // 独立レビュー・負のE2E・オーナー承認なしに正本は変わらない（applyAllowed: false）。
  for (const group of [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    if (group.records.length < policy.recurrenceThreshold) continue;
    const proposal = buildProposal(group, policy);
    const closed = (recurrenceIndex[proposal.recurrence.key]?.closed || []);
    if (closed.some((entry) => entry.proposalId === proposal.id)) {
      closedProposalIds.push(proposal.id);
      continue;
    }
    proposals.push(proposal);
  }

  // 未分類が残ったまま提案が出た場合は、それを status で名乗る。
  // 提案本体へ未分類の内訳を入れない：提案は writeImmutableJson で不変であり、
  // 無関係な節の分類が進むたびに同一IDの内容が変わって再スキャンが落ちる。
  // 内訳は intake / report / latest が保持する（unclassified, unclassifiedCount）。
  const status = proposals.length > 0
    ? (unclassified.length > 0 ? "pending-review-with-unclassified" : "pending-review")
    : unclassified.length > 0
      ? "waiting-human"
      : "no-recurring-failure";
  const intake = {
    version: 1,
    id: intakeId,
    status,
    policyPath: policyPath.relativePath,
    policySha256: intakeIdentity.policySha256,
    records: intakeIdentity.records,
    nonPromotable,
    unclassified,
    proposalIds: proposals.map((proposal) => proposal.id),
    closedProposalIds,
  };
  writeImmutableJson(intakePath, intake, "Log intake");

  const proposalPaths = [];
  for (const proposal of proposals) {
    const jsonPath = resolve(outputPath.absolutePath, "proposals", `${proposal.id}.json`);
    const markdownPath = resolve(outputPath.absolutePath, "proposals", `${proposal.id}.md`);
    writeImmutableJson(jsonPath, proposal, `Log proposal ${proposal.id}`);
    // .md は .json の描画であって根拠ではない（review が突き合わせるのは .json の SHA-256）。
    // 以前は .md も不変扱いだったため、描画の欠陥を1つ直すと既存の提案すべてで scan が
    // 「immutable and already differs」で落ちた。根拠の不変性は .json が担い、.md は
    // .json から作り直せる面として扱う（2026-09-04）。
    renderProposalMarkdown(markdownPath, proposal);
    proposalPaths.push(relative(repoRoot, jsonPath).replace(/\\/g, "/"));
  }

  const report = {
    version: 1,
    id: `${intakeId}-report`,
    status,
    intakePath: relative(repoRoot, intakePath).replace(/\\/g, "/"),
    recordCount: records.length,
    nonPromotableCount: nonPromotable.length,
    nonPromotable,
    unclassifiedCount: unclassified.length,
    proposalPaths,
    closedProposalIds,
    promotionRule: "Canonical rules and verifier code remain unchanged until independent review, negative E2E, and owner approval are recorded.",
  };
  const reportPath = resolve(outputPath.absolutePath, "reports", `${intakeId}.json`);
  writeImmutableJson(reportPath, report, "Log promotion report");
  writeJson(resolve(outputPath.absolutePath, "latest.json"), {
    version: 1,
    status,
    intakePath: report.intakePath,
    reportPath: relative(repoRoot, reportPath).replace(/\\/g, "/"),
    proposalPaths,
    nonPromotableCount: nonPromotable.length,
    unclassifiedCount: unclassified.length,
    closedProposalIds,
  });

  // 提案ファイルは不変なので、ログ本文が変わると同じ再発キーに別IDの提案が積まれる。
  // どれが現行でどれが被代替かを可変な索引で確定させ、旧提案が pending-review のまま
  // 滞留して見える状態を解消する。closed はproposalファイルを改変せず、別経路完了を同じ
  // recurrence keyに記録する。新しいevidenceで別IDのproposalが出た場合は通常どおり再開する。
  for (const proposal of proposals) {
    const key = proposal.recurrence.key;
    const previous = recurrenceIndex[key] || { current: null, superseded: [], closed: [] };
    const superseded = [...new Set([
      ...(previous.superseded || []),
      ...(previous.current && previous.current !== proposal.id ? [previous.current] : []),
    ])].sort();
    const closed = Array.isArray(previous.closed) ? previous.closed : [];
    recurrenceIndex[key] = { current: proposal.id, superseded, ...(closed.length > 0 ? { closed } : {}) };
  }
  writeJson(currentIndexPath, {
    version: 1,
    updatedAt: new Date().toISOString(),
    note: "Mutable index. Proposal files stay immutable; this records the current proposal, superseded proposals, and completed-outside-promotion closures per recurrence key.",
    recurrenceKeys: recurrenceIndex,
  });

  console.log(`PASS ${status}: ${records.length} promotable record(s), ${nonPromotable.length} non-promotable record(s), ${unclassified.length} unclassified new record(s), ${proposals.length} proposal(s).`);
}

function requireSha256(value, label) {
  const normalized = requireString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) fail(`${label} must be a SHA-256 hex digest.`);
  return normalized;
}

function sha256File(filePath, label) {
  return sha256(readText(filePath, label));
}

function assertNoProjectFacts(value, label) {
  const normalized = requireString(value, label);
  if (/\r|\n/.test(normalized)) fail(`${label} must be one line.`);
  if (/(?:https?:\/\/|(?:[A-Za-z]:[\\/])|node-id|figma\.com|localhost|wp-content)/i.test(normalized)) {
    fail(`${label} must not contain project-specific URLs, paths, node ids, or asset references.`);
  }
  return normalized;
}

function requireNonPromotableReason(value, label) {
  const normalized = assertNoProjectFacts(value, label);
  if ([...normalized].length < 20) fail(`${label} must be at least 20 characters.`);
  return normalized;
}

function sourceForKind(policy, kind) {
  const source = policy.sourceLogs.find((item) => item.kind === kind);
  if (!source) fail(`Log promotion policy has no source log for kind: ${kind}`);
  return source;
}

function scanAllSourceLogs(policy) {
  const records = [];
  const nonPromotable = [];
  const unclassified = [];
  for (const source of policy.sourceLogs) {
    const result = scanSourceLog(source, policy);
    records.push(...result.records);
    nonPromotable.push(...result.nonPromotable);
    unclassified.push(...result.unclassified);
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  nonPromotable.sort((a, b) => a.id.localeCompare(b.id));
  const ids = [...records, ...nonPromotable].map((record) => record.id);
  if (new Set(ids).size !== ids.length) {
    fail("loop-log ids must be globally unique across all classified source logs.");
  }
  return { records, nonPromotable, unclassified };
}

function validateRecordEntry(raw, policy) {
  requireObject(raw, "Log record");
  if (raw.version !== 1) fail("Log record.version must be 1.");
  const kind = requireString(raw.kind, "Log record.kind");
  if (!["correction", "mistake"].includes(kind)) fail("Log record.kind must be correction or mistake.");
  const occurredOn = requireString(raw.occurredOn, "Log record.occurredOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) fail("Log record.occurredOn must use YYYY-MM-DD.");
  const promotability = raw.promotability === undefined ? "promotable" : requireString(raw.promotability, "Log record.promotability");
  if (!["promotable", "non-promotable"].includes(promotability)) fail("Log record.promotability must be promotable or non-promotable.");
  const base = {
    version: 1,
    id: requireIdentifier(raw.id, "Log record.id"),
    kind,
    occurredOn,
    failureClass: requireIdentifier(raw.failureClass, "Log record.failureClass"),
    recurrenceKey: requireIdentifier(raw.recurrenceKey, "Log record.recurrenceKey"),
    promotability,
    summary: assertNoProjectFacts(raw.summary, "Log record.summary"),
    prevention: assertNoProjectFacts(raw.prevention, "Log record.prevention"),
  };
  if (promotability === "non-promotable") {
    if (raw.ruleTargets !== undefined || raw.verifierTargets !== undefined) {
      fail("Log record non-promotable entries must not assign ruleTargets or verifierTargets.");
    }
    return { ...base, nonPromotableReason: requireNonPromotableReason(raw.nonPromotableReason, "Log record.nonPromotableReason") };
  }
  const ruleTargets = normalizeUniqueStringArray(raw.ruleTargets, "Log record.ruleTargets")
    .map((path, index) => normalizeRepoPath(path, `Log record.ruleTargets[${index}]`, { mustExist: true }));
  const verifierTargets = normalizeUniqueStringArray(raw.verifierTargets, "Log record.verifierTargets")
    .map((path, index) => normalizeRepoPath(path, `Log record.verifierTargets[${index}]`, { mustExist: true }));
  for (const path of ruleTargets) {
    if (!policy.allowedRuleTargets.includes(path)) fail(`Log record targets a non-approved rule path: ${path}`);
  }
  for (const path of verifierTargets) {
    if (!policy.allowedVerifierTargets.includes(path)) fail(`Log record targets a non-approved verifier path: ${path}`);
  }
  return { ...base, ruleTargets, verifierTargets };
}

function findSingleMarker(text, marker, label) {
  const index = text.indexOf(marker);
  if (index < 0) fail(`${label} is missing schema marker: ${marker}`);
  if (text.indexOf(marker, index + marker.length) >= 0) fail(`${label} contains the schema marker more than once.`);
  return index;
}

function record(policyPathArg, entryPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const entryPath = toRepoPath(entryPathArg, "Log record path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const entry = validateRecordEntry(readJson(entryPath.absolutePath, "Log record"), policy);
  const existing = scanAllSourceLogs(policy);
  if (existing.records.some((record) => record.id === entry.id)) fail(`Log record.id already exists: ${entry.id}`);

  const source = sourceForKind(policy, entry.kind);
  const sourcePath = toRepoPath(source.path, `Source log ${source.path}`);
  const sourceText = readText(sourcePath.absolutePath, `Source log ${source.path}`);
  const markerIndex = findSingleMarker(sourceText, policy.schemaMarker, `Source log ${source.path}`);
  const metadata = {
    id: entry.id,
    kind: entry.kind,
    failureClass: entry.failureClass,
    recurrenceKey: entry.recurrenceKey,
    action: "strengthen",
    promotability: entry.promotability,
    ...(entry.promotability === "non-promotable"
      ? { nonPromotableReason: entry.nonPromotableReason }
      : { ruleTargets: entry.ruleTargets, verifierTargets: entry.verifierTargets }),
  };
  const block = [
    `## ${entry.occurredOn}: ${entry.failureClass}`,
    `<!-- loop-log: ${JSON.stringify(metadata)} -->`,
    `- 指摘：${entry.summary}`,
    `- 今後：${entry.prevention}`,
  ].join("\n");
  // 新しい記録は機械管理領域（marker より前）の**先頭**へ入れる。marker の直前へ入れると
  // 領域内が古い順に並び、「最新を上に」で読む運用と食い違って、先頭だけ読んだセッションに
  // 最新の記録が届かない。案件側で同じ2系統追記が実害を出したため揃えた（2026-08-26）。
  const firstHeading = /^## /m.exec(sourceText.slice(0, markerIndex));
  const insertAt = firstHeading ? firstHeading.index : markerIndex;
  const nextText = `${sourceText.slice(0, insertAt).replace(/\s*$/, "")}\n\n${block}\n\n${sourceText.slice(insertAt)}`;
  writeFileSync(sourcePath.absolutePath, nextText, "utf8");
  try {
    scan(policyPath.relativePath, outputPath.relativePath);
  } catch (error) {
    writeFileSync(sourcePath.absolutePath, sourceText, "utf8");
    throw error;
  }
  console.log(`PASS record: ${entry.id}`);
}

function validateProposal(raw, policy) {
  requireObject(raw, "Log promotion proposal");
  if (raw.version !== 1) fail("Log promotion proposal.version must be 1.");
  if (requireString(raw.status, "Log promotion proposal.status") !== "pending-review") {
    fail("Log promotion proposal.status must be pending-review.");
  }
  const recurrence = requireObject(raw.recurrence, "Log promotion proposal.recurrence");
  const requiredChange = requireObject(raw.requiredChange, "Log promotion proposal.requiredChange");
  if (requireString(requiredChange.action, "Log promotion proposal.requiredChange.action") !== "strengthen") {
    fail("Log promotion proposal.requiredChange.action must be strengthen.");
  }
  if (requiredChange.negativeE2ERequired !== true) fail("Log promotion proposal requires a negative E2E.");
  const ruleTargets = normalizeUniqueStringArray(requiredChange.ruleTargets, "Log promotion proposal.requiredChange.ruleTargets")
    .map((path, index) => normalizeRepoPath(path, `Log promotion proposal.requiredChange.ruleTargets[${index}]`, { mustExist: true }));
  const verifierTargets = normalizeUniqueStringArray(requiredChange.verifierTargets, "Log promotion proposal.requiredChange.verifierTargets")
    .map((path, index) => normalizeRepoPath(path, `Log promotion proposal.requiredChange.verifierTargets[${index}]`, { mustExist: true }));
  for (const path of ruleTargets) {
    if (!policy.allowedRuleTargets.includes(path)) fail(`Log promotion proposal targets a non-approved rule path: ${path}`);
  }
  for (const path of verifierTargets) {
    if (!policy.allowedVerifierTargets.includes(path)) fail(`Log promotion proposal targets a non-approved verifier path: ${path}`);
  }
  if (!Array.isArray(recurrence.evidence) || recurrence.evidence.length < policy.recurrenceThreshold) {
    fail("Log promotion proposal.recurrence.evidence does not meet the threshold.");
  }
  const evidence = recurrence.evidence.map((item, index) => {
    const record = requireObject(item, `Log promotion proposal.recurrence.evidence[${index}]`);
    const source = requireObject(record.source, `Log promotion proposal.recurrence.evidence[${index}].source`);
    return {
      id: requireIdentifier(record.id, `Log promotion proposal.recurrence.evidence[${index}].id`),
      source: {
        path: normalizeRepoPath(source.path, `Log promotion proposal.recurrence.evidence[${index}].source.path`, { mustExist: true }),
        heading: requireString(source.heading, `Log promotion proposal.recurrence.evidence[${index}].source.heading`),
        sha256: requireSha256(source.sha256, `Log promotion proposal.recurrence.evidence[${index}].source.sha256`),
      },
    };
  });
  if (new Set(evidence.map((record) => record.id)).size !== evidence.length) fail("Log promotion proposal evidence ids must be unique.");
  return {
    version: 1,
    id: requireIdentifier(raw.id, "Log promotion proposal.id"),
    recurrenceKey: requireIdentifier(recurrence.key, "Log promotion proposal.recurrence.key"),
    failureClass: requireIdentifier(recurrence.failureClass, "Log promotion proposal.recurrence.failureClass"),
    threshold: requirePositiveInteger(recurrence.threshold, "Log promotion proposal.recurrence.threshold", 2),
    evidence,
    requiredChange: { ruleTargets, verifierTargets },
  };
}

function readProposal(policy, proposalPathArg) {
  const proposalPath = toRepoPath(proposalPathArg, "Proposal path");
  const proposalText = readText(proposalPath.absolutePath, "Log promotion proposal");
  const proposal = validateProposal(JSON.parse(proposalText), policy);
  const currentIndexPath = resolve(dirname(proposalPath.absolutePath), "current.json");
  if (existsSync(currentIndexPath)) {
    const index = JSON.parse(readText(currentIndexPath, "Log proposal current index"));
    const entry = (index.recurrenceKeys || {})[proposal.recurrenceKey];
    if (entry && entry.current !== proposal.id) {
      const closed = (entry.closed || []).find((item) => item.proposalId === proposal.id);
      if (closed) {
        fail(`Proposal is closed outside promotion for recurrence key ${proposal.recurrenceKey}: ${proposal.id}.`);
      }
      fail(
        `Proposal is not current for recurrence key ${proposal.recurrenceKey}: ${proposal.id}. Current proposal is ${entry.current || "none"}.`
      );
    }
  }
  const currentRecords = new Map(scanAllSourceLogs(policy).records.map((record) => [record.id, record]));
  for (const evidence of proposal.evidence) {
    const current = currentRecords.get(evidence.id);
    if (!current) fail(`Proposal evidence is no longer present in the source logs: ${evidence.id}`);
    if (current.source.sha256 !== evidence.source.sha256 || current.source.path !== evidence.source.path || current.source.heading !== evidence.source.heading) {
      fail(`Proposal evidence changed after generation: ${evidence.id}`);
    }
  }
  return { path: proposalPath, text: proposalText, sha256: sha256(proposalText), proposal };
}

function requirePass(value, label) {
  if (requireString(value, label) !== "PASS") fail(`${label} must be PASS.`);
}

function normalizeActor(raw, label) {
  const actor = requireObject(raw, label);
  return {
    actor: requireIdentifier(actor.actor, `${label}.actor`),
    contextId: requireIdentifier(actor.contextId, `${label}.contextId`),
  };
}

function executeNode(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    fail(`${label} failed with exit ${result.status}: ${output}`);
  }
  return { stdoutSha256: sha256(`${result.stdout ?? ""}\n${result.stderr ?? ""}`) };
}

function validateReview(raw, policy, proposalInfo) {
  requireObject(raw, "Promotion review");
  if (raw.version !== 1) fail("Promotion review.version must be 1.");
  if (requireIdentifier(raw.proposalId, "Promotion review.proposalId") !== proposalInfo.proposal.id) fail("Promotion review.proposalId does not match the proposal.");
  if (normalizeRepoPath(raw.proposalPath, "Promotion review.proposalPath", { mustExist: true }) !== proposalInfo.path.relativePath) fail("Promotion review.proposalPath does not match the proposal path.");
  if (requireSha256(raw.proposalSha256, "Promotion review.proposalSha256") !== proposalInfo.sha256) fail("Promotion review.proposalSha256 does not match the proposal.");
  const implementation = normalizeActor(raw.implementation, "Promotion review.implementation");
  const reviewer = normalizeActor(raw.reviewer, "Promotion review.reviewer");
  if (implementation.actor === reviewer.actor && implementation.contextId === reviewer.contextId) fail("Promotion review must use an independent reviewer actor or context.");
  const checks = requireObject(raw.checks, "Promotion review.checks");
  for (const key of ["evidenceIntegrity", "recurrenceThreshold", "projectFactsExcluded", "strengthensOnly", "guardrailsUnchanged"]) {
    requirePass(checks[key], `Promotion review.checks.${key}`);
  }
  const negativeE2E = requireObject(raw.negativeE2E, "Promotion review.negativeE2E");
  const negativePath = normalizeRepoPath(negativeE2E.path, "Promotion review.negativeE2E.path", { mustExist: true });
  if (!negativePath.endsWith(".e2e.mjs")) fail("Promotion review.negativeE2E.path must be an .e2e.mjs file.");
  if (!proposalInfo.proposal.requiredChange.verifierTargets.includes(negativePath)) fail("Promotion review.negativeE2E.path must be an approved verifier target in the proposal.");
  if (requireSha256(negativeE2E.sha256, "Promotion review.negativeE2E.sha256") !== sha256File(resolve(repoRoot, negativePath), "Promotion negative E2E")) {
    fail("Promotion review.negativeE2E.sha256 does not match the current test file.");
  }
  requirePass(negativeE2E.result, "Promotion review.negativeE2E.result");
  const ownerApproval = requireObject(raw.ownerApproval, "Promotion review.ownerApproval");
  const approvalStatus = requireString(ownerApproval.status, "Promotion review.ownerApproval.status");
  if (!["pending", "approved"].includes(approvalStatus)) fail("Promotion review.ownerApproval.status must be pending or approved.");
  const owner = requireIdentifier(ownerApproval.owner, "Promotion review.ownerApproval.owner");
  const approvedAt = approvalStatus === "approved" ? requireString(ownerApproval.approvedAt, "Promotion review.ownerApproval.approvedAt") : null;
  return {
    implementation,
    reviewer,
    negativeE2E: { path: negativePath, sha256: sha256File(resolve(repoRoot, negativePath), "Promotion negative E2E") },
    ownerApproval: { status: approvalStatus, owner, approvedAt },
  };
}

function reviewPromotion(policyPathArg, proposalPathArg, reviewPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const proposalInfo = readProposal(policy, proposalPathArg);
  const reviewPath = toRepoPath(reviewPathArg, "Promotion review path");
  const reviewText = readText(reviewPath.absolutePath, "Promotion review");
  const review = validateReview(JSON.parse(reviewText), policy, proposalInfo);
  const e2e = executeNode([resolve(repoRoot, review.negativeE2E.path)], "Promotion negative E2E");
  const status = review.ownerApproval.status === "approved" ? "ready-to-apply" : "waiting-owner";
  const receipt = {
    version: 1,
    id: `promotion-review-${proposalInfo.proposal.id}-${sha256(reviewText).slice(0, 16)}`,
    status,
    proposal: { id: proposalInfo.proposal.id, path: proposalInfo.path.relativePath, sha256: proposalInfo.sha256 },
    review: { path: reviewPath.relativePath, sha256: sha256(reviewText), implementation: review.implementation, reviewer: review.reviewer },
    negativeE2E: { path: review.negativeE2E.path, sha256: review.negativeE2E.sha256, execution: e2e },
    ownerApproval: review.ownerApproval,
    generatedAt: new Date().toISOString(),
  };
  const receiptPath = resolve(outputPath.absolutePath, "reviews", `${receipt.id}.json`);
  writeImmutableJson(receiptPath, receipt, "Promotion review receipt");
  writeJson(resolve(outputPath.absolutePath, "latest-review.json"), { version: 1, status, receiptPath: relative(repoRoot, receiptPath).replace(/\\/g, "/") });
  console.log(`PASS review ${status}: ${receipt.id}`);
}

function validatePromotionPlan(raw, proposalInfo, receiptInfo) {
  requireObject(raw, "Promotion plan");
  if (raw.version !== 1) fail("Promotion plan.version must be 1.");
  if (requireIdentifier(raw.proposalId, "Promotion plan.proposalId") !== proposalInfo.proposal.id) fail("Promotion plan.proposalId does not match the proposal.");
  if (normalizeRepoPath(raw.proposalPath, "Promotion plan.proposalPath", { mustExist: true }) !== proposalInfo.path.relativePath) fail("Promotion plan.proposalPath does not match the proposal path.");
  if (requireSha256(raw.proposalSha256, "Promotion plan.proposalSha256") !== proposalInfo.sha256) fail("Promotion plan.proposalSha256 does not match the proposal.");
  if (normalizeRepoPath(raw.reviewReceiptPath, "Promotion plan.reviewReceiptPath", { mustExist: true }) !== receiptInfo.path.relativePath) fail("Promotion plan.reviewReceiptPath does not match the review receipt.");
  if (requireSha256(raw.reviewReceiptSha256, "Promotion plan.reviewReceiptSha256") !== receiptInfo.sha256) fail("Promotion plan.reviewReceiptSha256 does not match the review receipt.");
  if (!Array.isArray(raw.patches) || raw.patches.length === 0) fail("Promotion plan.patches must be a non-empty array.");
  const allowedTargets = new Set([...proposalInfo.proposal.requiredChange.ruleTargets, ...proposalInfo.proposal.requiredChange.verifierTargets]);
  const patches = raw.patches.map((rawPatch, index) => {
    const patch = requireObject(rawPatch, `Promotion plan.patches[${index}]`);
    const path = normalizeRepoPath(patch.path, `Promotion plan.patches[${index}].path`, { mustExist: true });
    if (!allowedTargets.has(path)) fail(`Promotion plan patch targets a path not approved by the proposal: ${path}`);
    const find = typeof patch.find === "string" && patch.find !== "" ? patch.find : fail(`Promotion plan.patches[${index}].find must be a non-empty string.`);
    const replace = typeof patch.replace === "string" && patch.replace !== "" ? patch.replace : fail(`Promotion plan.patches[${index}].replace must be a non-empty string.`);
    if (find === replace) fail(`Promotion plan.patches[${index}] does not change its target.`);
    return { path, expectedSha256: requireSha256(patch.expectedSha256, `Promotion plan.patches[${index}].expectedSha256`), find, replace };
  });
  if (new Set(patches.map((patch) => patch.path)).size !== patches.length) fail("Promotion plan may patch each target path only once.");
  const removedGuards = normalizeDeclaredGuardRemovals(raw.removedGuards, allowedTargets);
  return { id: requireIdentifier(raw.id, "Promotion plan.id"), patches, removedGuards };
}

function normalizeDeclaredGuardRemovals(raw, allowedTargets) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("Promotion plan.removedGuards must be an array.");
  const declared = raw.map((rawItem, index) => {
    const item = requireObject(rawItem, `Promotion plan.removedGuards[${index}]`);
    const target = normalizeRepoPath(item.target, `Promotion plan.removedGuards[${index}].target`, { mustExist: true });
    if (!allowedTargets.has(target)) fail(`Promotion plan.removedGuards[${index}].target is not approved by the proposal: ${target}`);
    return {
      target,
      guard: requireString(item.guard, `Promotion plan.removedGuards[${index}].guard`),
      reason: requireNonPromotableReason(item.reason, `Promotion plan.removedGuards[${index}].reason`),
    };
  });
  if (new Set(declared.map(guardKey)).size !== declared.length) fail("Promotion plan.removedGuards must not declare the same guard twice.");
  return declared;
}

function applyPromotion(policyPathArg, proposalPathArg, receiptPathArg, planPathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const proposalInfo = readProposal(policy, proposalPathArg);
  const receiptPath = toRepoPath(receiptPathArg, "Promotion review receipt path");
  const receiptText = readText(receiptPath.absolutePath, "Promotion review receipt");
  const receipt = requireObject(JSON.parse(receiptText), "Promotion review receipt");
  if (receipt.version !== 1 || requireString(receipt.status, "Promotion review receipt.status") !== "ready-to-apply") fail("Promotion review receipt must be ready-to-apply.");
  if (requireIdentifier(receipt.proposal.id, "Promotion review receipt.proposal.id") !== proposalInfo.proposal.id || requireSha256(receipt.proposal.sha256, "Promotion review receipt.proposal.sha256") !== proposalInfo.sha256) fail("Promotion review receipt does not match the proposal.");
  const receiptNegativePath = normalizeRepoPath(receipt.negativeE2E.path, "Promotion review receipt.negativeE2E.path", { mustExist: true });
  if (!proposalInfo.proposal.requiredChange.verifierTargets.includes(receiptNegativePath)) fail("Promotion review receipt negative E2E is not approved by the proposal.");
  if (requireSha256(receipt.negativeE2E.sha256, "Promotion review receipt.negativeE2E.sha256") !== sha256File(resolve(repoRoot, receiptNegativePath), "Promotion negative E2E")) fail("Promotion review receipt negative E2E changed after review.");
  const receiptInfo = { path: receiptPath, sha256: sha256(receiptText) };
  const planPath = toRepoPath(planPathArg, "Promotion plan path");
  const planText = readText(planPath.absolutePath, "Promotion plan");
  const plan = validatePromotionPlan(JSON.parse(planText), proposalInfo, receiptInfo);
  const updates = plan.patches.map((patch) => {
    const absolutePath = resolve(repoRoot, patch.path);
    const before = readText(absolutePath, `Promotion target ${patch.path}`);
    if (sha256(before) !== patch.expectedSha256) fail(`Promotion target changed since the plan was authored: ${patch.path}`);
    const matchCount = before.split(patch.find).length - 1;
    if (matchCount !== 1) fail(`Promotion plan find text must occur exactly once in ${patch.path}; found ${matchCount}.`);
    return { ...patch, absolutePath, before, after: before.replace(patch.find, patch.replace) };
  });
  // 書き込む前に測る。ここで落ちれば対象は1バイトも変わらない。
  assertGuardRemovalsAreDeclared(
    updates.flatMap((update) => measureGuardRemovals(update.path, update.before, update.after)),
    plan.removedGuards
  );
  try {
    for (const update of updates) writeFileSync(update.absolutePath, update.after, "utf8");
    for (const update of updates.filter((item) => item.path.endsWith(".mjs"))) executeNode(["--check", update.absolutePath], `Promotion syntax check ${update.path}`);
    const e2e = executeNode([resolve(repoRoot, receiptNegativePath)], "Promotion negative E2E");
    const promotion = {
      version: 1,
      id: `promotion-${plan.id}-${sha256(`${proposalInfo.sha256}:${receiptInfo.sha256}:${planText}`).slice(0, 16)}`,
      status: "promoted",
      proposal: { id: proposalInfo.proposal.id, path: proposalInfo.path.relativePath, sha256: proposalInfo.sha256 },
      reviewReceipt: { path: receiptInfo.path.relativePath, sha256: receiptInfo.sha256 },
      plan: { id: plan.id, path: planPath.relativePath, sha256: sha256(planText) },
      patches: updates.map((update) => ({ path: update.path, beforeSha256: sha256(update.before), afterSha256: sha256(update.after) })),
      // 何が消えたかを承認済みの理由つきで残す。空配列は「何も消えなかった」の記録である。
      removedGuards: plan.removedGuards,
      validation: { negativeE2E: { path: receiptNegativePath, execution: e2e } },
      appliedAt: new Date().toISOString(),
    };
    const promotionPath = resolve(outputPath.absolutePath, "promotions", `${promotion.id}.json`);
    writeImmutableJson(promotionPath, promotion, "Promotion receipt");
    writeJson(resolve(outputPath.absolutePath, "latest-promotion.json"), { version: 1, status: "promoted", promotionPath: relative(repoRoot, promotionPath).replace(/\\/g, "/") });
    console.log(`PASS apply: ${promotion.id}`);
  } catch (error) {
    for (const update of updates) writeFileSync(update.absolutePath, update.before, "utf8");
    const message = error instanceof Error ? error.message : String(error);
    fail(`Promotion failed and was rolled back: ${message}`);
  }
}

function validateClosure(raw, proposalInfo) {
  requireObject(raw, "Promotion closure");
  if (raw.version !== 1) fail("Promotion closure.version must be 1.");
  const id = requireIdentifier(raw.id, "Promotion closure.id");
  if (requireIdentifier(raw.proposalId, "Promotion closure.proposalId") !== proposalInfo.proposal.id) fail("Promotion closure.proposalId does not match the proposal.");
  if (normalizeRepoPath(raw.proposalPath, "Promotion closure.proposalPath", { mustExist: true }) !== proposalInfo.path.relativePath) fail("Promotion closure.proposalPath does not match the proposal.");
  if (requireSha256(raw.proposalSha256, "Promotion closure.proposalSha256") !== proposalInfo.sha256) fail("Promotion closure.proposalSha256 does not match the proposal.");
  if (requireString(raw.disposition, "Promotion closure.disposition") !== "completed-outside-promotion") {
    fail("Promotion closure.disposition must be completed-outside-promotion.");
  }
  const ownerApproval = requireObject(raw.ownerApproval, "Promotion closure.ownerApproval");
  if (requireString(ownerApproval.status, "Promotion closure.ownerApproval.status") !== "approved") {
    fail("Promotion closure.ownerApproval.status must be approved.");
  }
  return {
    id,
    disposition: "completed-outside-promotion",
    reason: requireNonPromotableReason(raw.reason, "Promotion closure.reason"),
    ownerApproval: {
      status: "approved",
      owner: requireIdentifier(ownerApproval.owner, "Promotion closure.ownerApproval.owner"),
      approvedAt: requireString(ownerApproval.approvedAt, "Promotion closure.ownerApproval.approvedAt"),
    },
  };
}

function closeProposal(policyPathArg, proposalPathArg, closurePathArg, outputPathArg) {
  const policyPath = toRepoPath(policyPathArg, "Policy path");
  const outputPath = toRepoPath(outputPathArg, "Output path");
  const policy = validatePolicy(readJson(policyPath.absolutePath, "Log promotion policy"));
  const proposalInfo = readProposal(policy, proposalPathArg);
  const closurePath = toRepoPath(closurePathArg, "Promotion closure path");
  const closureText = readText(closurePath.absolutePath, "Promotion closure");
  let rawClosure;
  try {
    rawClosure = JSON.parse(closureText);
  } catch (error) {
    fail(`Promotion closure is not valid JSON: ${error.message}`);
  }
  const closure = validateClosure(rawClosure, proposalInfo);
  const currentIndexPath = resolve(outputPath.absolutePath, "proposals", "current.json");
  if (!existsSync(currentIndexPath)) fail("Log proposal current index does not exist.");
  const index = JSON.parse(readText(currentIndexPath, "Log proposal current index"));
  const recurrenceKeys = { ...(index.recurrenceKeys || {}) };
  const entry = recurrenceKeys[proposalInfo.proposal.recurrenceKey];
  if (!entry || entry.current !== proposalInfo.proposal.id) {
    fail(`Promotion closure requires the current proposal for recurrence key ${proposalInfo.proposal.recurrenceKey}.`);
  }
  const priorClosed = Array.isArray(entry.closed) ? entry.closed : [];
  if (priorClosed.some((item) => item.proposalId === proposalInfo.proposal.id)) {
    fail(`Promotion closure already exists for proposal: ${proposalInfo.proposal.id}`);
  }
  const closedAt = new Date().toISOString();
  const closed = [
    ...priorClosed,
    {
      closureId: closure.id,
      proposalId: proposalInfo.proposal.id,
      proposalPath: proposalInfo.path.relativePath,
      proposalSha256: proposalInfo.sha256,
      disposition: closure.disposition,
      reason: closure.reason,
      ownerApproval: closure.ownerApproval,
      closedAt,
    },
  ];
  recurrenceKeys[proposalInfo.proposal.recurrenceKey] = {
    current: null,
    superseded: [...new Set([...(entry.superseded || []), proposalInfo.proposal.id])].sort(),
    closed,
  };
  writeJson(currentIndexPath, {
    version: 1,
    updatedAt: closedAt,
    note: "Mutable index. Proposal files stay immutable; this records the current proposal, superseded proposals, and completed-outside-promotion closures per recurrence key.",
    recurrenceKeys,
  });
  const receipt = {
    version: 1,
    id: `promotion-closure-${closure.id}-${sha256(closureText).slice(0, 16)}`,
    status: "completed-outside-promotion",
    proposal: { id: proposalInfo.proposal.id, path: proposalInfo.path.relativePath, sha256: proposalInfo.sha256 },
    closure: { ...closure, path: closurePath.relativePath, sha256: sha256(closureText), closedAt },
  };
  const receiptPath = resolve(outputPath.absolutePath, "closures", `${receipt.id}.json`);
  writeImmutableJson(receiptPath, receipt, "Promotion closure receipt");
  writeJson(resolve(outputPath.absolutePath, "latest-closure.json"), {
    version: 1,
    status: receipt.status,
    closurePath: relative(repoRoot, receiptPath).replace(/\\/g, "/"),
  });
  console.log(`PASS close ${closure.disposition}: ${proposalInfo.proposal.id}`);
}

function usage() {
  console.error([
    "Usage:",
    "  node tools/figma-log-promote.mjs record <policy.json> <record.json> <output-dir>",
    "  node tools/figma-log-promote.mjs scan <policy.json> <output-dir>",
    "  node tools/figma-log-promote.mjs review <policy.json> <proposal.json> <review.json> <output-dir>",
    "  node tools/figma-log-promote.mjs apply <policy.json> <proposal.json> <review-receipt.json> <promotion-plan.json> <output-dir>",
    "  node tools/figma-log-promote.mjs close <policy.json> <proposal.json> <closure.json> <output-dir>",
  ].join("\n"));
}

try {
  if (command === "record" && args.length === 3) {
    record(args[0], args[1], args[2]);
  } else if (command === "scan" && args.length === 2) {
    scan(args[0], args[1]);
  } else if (command === "review" && args.length === 4) {
    reviewPromotion(args[0], args[1], args[2], args[3]);
  } else if (command === "apply" && args.length === 5) {
    applyPromotion(args[0], args[1], args[2], args[3], args[4]);
  } else if (command === "close" && args.length === 4) {
    closeProposal(args[0], args[1], args[2], args[3]);
  } else {
    usage();
    process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL ${message}`);
  process.exit(1);
}