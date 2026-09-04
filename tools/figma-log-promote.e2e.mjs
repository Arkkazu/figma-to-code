#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolPath = fileURLToPath(new URL("./figma-log-promote.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "figma-log-promote-e2e-"));
const write = (path, text) => { const target = resolve(root, path); mkdirSync(resolve(target, ".."), { recursive: true }); writeFileSync(target, text, "utf8"); };
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const run = (...args) => spawnSync(process.execPath, [toolPath, ...args], { cwd: root, encoding: "utf8" });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pass = (result, label) => assert(result.status === 0, `${label}: exit ${result.status}; ${result.error?.message || result.stderr || result.stdout || "no output"}`);

function record(id, kind, { failureClass = "unverified-figma-value", recurrenceKey = "unverified-figma-value" } = {}) {
  return {
    version: 1,
    id,
    kind,
    occurredOn: "2026-07-18",
    failureClass,
    recurrenceKey,
    ruleTargets: ["rules/figma-spec-pipeline.md"],
    verifierTargets: ["templates/verify/figma-gate.e2e.mjs"],
    summary: "Figmaの事実を取得せず検証基準にした",
    prevention: "取得証跡が無ければ検証を停止する",
  };
}

function nonPromotableRecord(id, kind) {
  return {
    version: 1,
    id,
    kind,
    occurredOn: "2026-07-18",
    failureClass: "governance-recognition",
    recurrenceKey: "governance-recognition",
    promotability: "non-promotable",
    nonPromotableReason: "許可済み検証器では認識上の訂正そのものを再現できないため。",
    summary: "検証器の根拠を持たない認識訂正を記録する",
    prevention: "検証可能な強化が無い場合は理由付き非昇格として残す",
  };
}

try {
  write("rules/figma-spec-pipeline.md", "# rule\n");
  write("templates/verify/figma-gate.e2e.mjs", [
    'import { readFileSync } from "node:fs";',
    'import { resolve } from "node:path";',
    'const text = readFileSync(resolve(process.cwd(), "rules/figma-spec-pipeline.md"), "utf8");',
    'if (!text.includes("evidence-required")) process.exit(1);',
    'console.log("negative E2E PASS");',
  ].join("\n"));
  write("tools/figma-log-promote.mjs", "export {};\n");
  write("tools/figma-log-promote.e2e.mjs", "export {};\n");
  write("rules/log-promotion-policy.json", json({
    version: 3,
    mode: "proposal",
    schemaMarker: "<!-- loop-log-schema: v1 -->",
    sourceLogs: [{ path: "rules/corrections.md", kind: "correction" }, { path: "rules/mistakes.md", kind: "mistake" }],
    recurrenceThreshold: 2,
    allowedRuleTargets: ["rules/figma-spec-pipeline.md"],
    allowedVerifierTargets: ["templates/verify/figma-gate.e2e.mjs", "tools/figma-log-promote.mjs", "tools/figma-log-promote.e2e.mjs"],
    review: { loopEngineeringSpec: "C:/AI/loop-engineering/spec/06-self-improvement.md", requiresIndependentReview: true, requiresOwnerApproval: true, requiresNegativeE2E: true, requiresAtomicPromotionPlan: true },
  }));
  write("rules/corrections.md", "# corrections\n\n<!-- loop-log-schema: v1 -->\n\n## legacy\n- ignored\n");
  write("rules/mistakes.md", "# mistakes\n\n<!-- loop-log-schema: v1 -->\n\n## legacy\n- ignored\n");
  write("entries/a.json", json(record("correction-provenance-a", "correction")));
  write("entries/b.json", json(record("mistake-provenance-b", "mistake")));

  pass(run("record", "rules/log-promotion-policy.json", "entries/a.json", "learning/log-promotions"), "first record");
  pass(run("record", "rules/log-promotion-policy.json", "entries/b.json", "learning/log-promotions"), "second record");
  const latest = JSON.parse(read("learning/log-promotions/latest.json"));
  assert(latest.status === "pending-review" && latest.proposalPaths.length === 1, "records did not create one pending proposal");
  const proposalPath = latest.proposalPaths[0];
  const proposalText = read(proposalPath);
  const proposal = JSON.parse(proposalText);
  assert(proposal.review.promotionPlanRequired === true, "proposal does not require a plan");

  // 提案の .md は人が読んで根拠へ辿るための面である。持っていない項目を刷って
  // `undefined` を見せていた欠陥の再発を止める（2026-09-04）。
  const proposalMd = read(proposalPath.replace(/\.json$/, ".md"));
  assert(!proposalMd.includes("undefined"), "proposal markdown rendered an absent field");
  for (const evidence of proposal.recurrence.evidence) {
    assert(
      proposalMd.includes(`${evidence.id}: ${evidence.source.path} / ${evidence.source.heading} (${evidence.source.sha256})`),
      `proposal markdown does not identify evidence by heading and sha256: ${evidence.id}`,
    );
  }

  // .md は .json から作り直せる面である。描画の欠陥を直したときに既存提案の .md が
  // 「immutable and already differs」で scan を止めないことを確かめる（2026-09-04）。
  const mdPath = proposalPath.replace(/\.json$/, ".md");
  write(mdPath, "stale rendering");
  pass(run("scan", "rules/log-promotion-policy.json", "learning/log-promotions"), "scan after a stale proposal rendering");
  assert(read(mdPath) === proposalMd, "scan did not rebuild the proposal rendering from its json");

  // 根拠そのものである .json の不変性は保つ。
  write(proposalPath, json({ ...proposal, status: "tampered" }));
  assert(run("scan", "rules/log-promotion-policy.json", "learning/log-promotions").status !== 0, "scan accepted a rewritten proposal json");
  write(proposalPath, proposalText);

  const review = {
    version: 1,
    proposalId: proposal.id,
    proposalPath,
    proposalSha256: hash(proposalText),
    implementation: { actor: "codex", contextId: "implementation-context" },
    reviewer: { actor: "claude", contextId: "review-context" },
    checks: { evidenceIntegrity: "PASS", recurrenceThreshold: "PASS", projectFactsExcluded: "PASS", strengthensOnly: "PASS", guardrailsUnchanged: "PASS" },
    negativeE2E: { path: "templates/verify/figma-gate.e2e.mjs", sha256: hash(read("templates/verify/figma-gate.e2e.mjs")), result: "PASS" },
    ownerApproval: { status: "pending", owner: "kazu" },
  };
  write("reviews/review.json", json(review));
  const pendingReview = run("review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/log-promotions");
  assert(pendingReview.status !== 0, "review passed while its negative E2E was not fixed");

  write("rules/figma-spec-pipeline.md", "# rule\n\nevidence-required\n");
  review.negativeE2E.sha256 = hash(read("templates/verify/figma-gate.e2e.mjs"));
  write("reviews/review.json", json(review));
  pass(run("review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/log-promotions"), "waiting-owner review");
  let latestReview = JSON.parse(read("learning/log-promotions/latest-review.json"));
  assert(latestReview.status === "waiting-owner", "pending owner did not block application");
  const pendingReceipt = latestReview.receiptPath;
  write("plans/pending.json", json({ version: 1, id: "pending", proposalId: proposal.id, proposalPath, proposalSha256: hash(proposalText), reviewReceiptPath: pendingReceipt, reviewReceiptSha256: hash(read(pendingReceipt)), patches: [{ path: "rules/figma-spec-pipeline.md", expectedSha256: hash(read("rules/figma-spec-pipeline.md")), find: "evidence-required", replace: "wrong-value" }] }));
  assert(run("apply", "rules/log-promotion-policy.json", proposalPath, pendingReceipt, "plans/pending.json", "learning/log-promotions").status !== 0, "apply accepted waiting-owner receipt");

  review.ownerApproval = { status: "approved", owner: "kazu", approvedAt: "2026-07-18T00:00:00.000Z" };
  write("reviews/review.json", json(review));
  pass(run("review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/log-promotions"), "approved review");
  latestReview = JSON.parse(read("learning/log-promotions/latest-review.json"));
  assert(latestReview.status === "ready-to-apply", "approved review did not create ready receipt");
  const receipt = latestReview.receiptPath;
  const baseline = read("rules/figma-spec-pipeline.md");
  write("plans/rollback.json", json({ version: 1, id: "rollback", proposalId: proposal.id, proposalPath, proposalSha256: hash(proposalText), reviewReceiptPath: receipt, reviewReceiptSha256: hash(read(receipt)), patches: [{ path: "rules/figma-spec-pipeline.md", expectedSha256: hash(baseline), find: "evidence-required", replace: "wrong-value" }] }));
  assert(run("apply", "rules/log-promotion-policy.json", proposalPath, receipt, "plans/rollback.json", "learning/log-promotions").status !== 0, "apply accepted a plan whose negative E2E fails");
  assert(read("rules/figma-spec-pipeline.md") === baseline, "failed apply did not roll back the rule");

  write("plans/apply.json", json({ version: 1, id: "apply", proposalId: proposal.id, proposalPath, proposalSha256: hash(proposalText), reviewReceiptPath: receipt, reviewReceiptSha256: hash(read(receipt)), patches: [{ path: "rules/figma-spec-pipeline.md", expectedSha256: hash(baseline), find: "evidence-required", replace: "evidence-required" + "\n" + "verified-at-preflight" }] }));
  pass(run("apply", "rules/log-promotion-policy.json", proposalPath, receipt, "plans/apply.json", "learning/log-promotions"), "approved apply");
  assert(read("rules/figma-spec-pipeline.md").includes("verified-at-preflight"), "approved plan did not update the rule");
  assert(JSON.parse(read("learning/log-promotions/latest-promotion.json")).status === "promoted", "promotion receipt was not recorded");

  // 被代替提案は昇格経路へ進めない（proposals/current.json ガードの回帰試験）
  const currentIndexPath = "learning/log-promotions/proposals/current.json";
  write(currentIndexPath, json({ version: 1, recurrenceKeys: { [proposal.recurrence.key]: { current: "figma-log-superseding-proposal", superseded: [proposal.id] } } }));
  assert(run("review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/log-promotions").status !== 0, "review accepted a superseded proposal");
  assert(run("apply", "rules/log-promotion-policy.json", proposalPath, receipt, "plans/apply.json", "learning/log-promotions").status !== 0, "apply accepted a superseded proposal");
  write(currentIndexPath, json({ version: 1, recurrenceKeys: {} }));

  // 非昇格は理由付きで残し、promotableな再発提案を止めない。
  const nonPromotable = nonPromotableRecord("correction-governance-recognition-a", "correction");
  write("entries/non-promotable.json", json(nonPromotable));
  pass(run("record", "rules/log-promotion-policy.json", "entries/non-promotable.json", "learning/log-promotions"), "non-promotable record");
  let classificationLatest = JSON.parse(read("learning/log-promotions/latest.json"));
  assert(classificationLatest.nonPromotableCount === 1 && classificationLatest.unclassifiedCount === 0, "non-promotable record was not listed separately");
  assert(classificationLatest.proposalPaths.length === 1, "non-promotable record blocked a promotable proposal");
  const shortReason = { ...nonPromotable, id: "correction-governance-recognition-short", nonPromotableReason: "短い理由" };
  write("entries/non-promotable-short.json", json(shortReason));
  assert(run("record", "rules/log-promotion-policy.json", "entries/non-promotable-short.json", "learning/log-promotions").status !== 0, "non-promotable record accepted a short reason");
  const dishonestTarget = { ...nonPromotable, id: "correction-governance-recognition-targeted", ruleTargets: ["rules/figma-spec-pipeline.md"] };
  write("entries/non-promotable-targeted.json", json(dishonestTarget));
  assert(run("record", "rules/log-promotion-policy.json", "entries/non-promotable-targeted.json", "learning/log-promotions").status !== 0, "non-promotable record accepted a verifier or rule target");

  // 未分類の節（marker の無い見出し）の扱い。2026-09-01 変更。
  //
  // 旧契約: unclassified が1件でもあると proposal 生成ブロック全体を止めていた。
  // 実測でこれが機構全体を停止させていた（閾値到達 family が1件あったのに、
  // 無関係な2節が未分類というだけで提案0件。設置以来1件も提案が出ていなかった）。
  //
  // 新契約: 未分類は status と unclassifiedCount に残すが、
  // 無関係な分類済み family の提案生成は止めない。
  const correctionsBeforeUnclassified = read("rules/corrections.md");
  const addUnclassified = (text) =>
    text.replace("\n<!-- loop-log-schema: v1 -->", "\n\n## unclassified entry\n- metadata intentionally absent\n\n<!-- loop-log-schema: v1 -->");

  // (a) 未分類があり、閾値到達 family もある → 提案は出る。status が未分類の残存を名乗る。
  write("rules/corrections.md", addUnclassified(correctionsBeforeUnclassified));
  pass(run("scan", "rules/log-promotion-policy.json", "learning/log-promotions"), "unclassified scan");
  const unclassifiedLatest = JSON.parse(read("learning/log-promotions/latest.json"));
  assert(
    unclassifiedLatest.unclassifiedCount === 1,
    `unclassified count was not reported: ${JSON.stringify(unclassifiedLatest)}`,
  );
  assert(
    unclassifiedLatest.proposalPaths.length > 0,
    `an unrelated unclassified section still blocked proposal generation: ${JSON.stringify(unclassifiedLatest)}`,
  );
  assert(
    unclassifiedLatest.status === "pending-review-with-unclassified",
    `status must name the remaining unclassified sections: ${JSON.stringify(unclassifiedLatest)}`,
  );
  // 提案本体は未分類の内訳を持たない（不変ファイルへ可変値を入れない）。
  const unclassifiedProposal = JSON.parse(read(unclassifiedLatest.proposalPaths[0]));
  assert(
    unclassifiedProposal.status === "pending-review" && unclassifiedProposal.review.applyAllowed === false,
    "a proposal generated alongside unclassified sections must stay pending-review and non-appliable",
  );
  assert(
    !JSON.stringify(unclassifiedProposal).includes("unclassified"),
    "the immutable proposal must not embed the mutable unclassified snapshot",
  );

  // (b) 未分類だけがあり、閾値到達 family が無い → 従来どおり waiting-human で提案0件。
  const emptyOutput = "learning/log-promotions-unclassified-only";
  pass(run("scan", "rules/log-promotion-policy.json", emptyOutput), "unclassified-only scan into a fresh output");
  const emptyLatest = JSON.parse(read(`${emptyOutput}/latest.json`));
  assert(
    emptyLatest.unclassifiedCount === 1,
    `unclassified count was not reported in the fresh output: ${JSON.stringify(emptyLatest)}`,
  );
  assert(
    emptyLatest.status === (emptyLatest.proposalPaths.length > 0 ? "pending-review-with-unclassified" : "waiting-human"),
    `status must match whether proposals were generated: ${JSON.stringify(emptyLatest)}`,
  );

  // (c) 未分類を解消すると status は通常の pending-review へ戻る。
  write("rules/corrections.md", correctionsBeforeUnclassified);
  pass(run("scan", "rules/log-promotion-policy.json", "learning/log-promotions"), "classified scan");
  const classifiedLatest = JSON.parse(read("learning/log-promotions/latest.json"));
  assert(
    classifiedLatest.unclassifiedCount === 0 && classifiedLatest.status !== "pending-review-with-unclassified",
    `status did not return to normal after classification: ${JSON.stringify(classifiedLatest)}`,
  );

  // 別経路完了はcurrent index内で閉じ、同じevidenceでは再提案せず、新しいevidenceなら再開する。
  const outsideOptions = { failureClass: "completed-outside-promotion", recurrenceKey: "completed-outside-promotion" };
  write("entries/outside-a.json", json(record("correction-outside-a", "correction", outsideOptions)));
  write("entries/outside-b.json", json(record("mistake-outside-b", "mistake", outsideOptions)));
  pass(run("record", "rules/log-promotion-policy.json", "entries/outside-a.json", "learning/log-promotions"), "outside first record");
  pass(run("record", "rules/log-promotion-policy.json", "entries/outside-b.json", "learning/log-promotions"), "outside second record");
  classificationLatest = JSON.parse(read("learning/log-promotions/latest.json"));
  const outsideProposalPath = classificationLatest.proposalPaths.find((item) => item !== proposalPath);
  assert(Boolean(outsideProposalPath), "outside proposal was not generated");
  const outsideProposalText = read(outsideProposalPath);
  const outsideProposal = JSON.parse(outsideProposalText);
  const closure = {
    version: 1,
    id: "close-outside-proposal",
    proposalId: outsideProposal.id,
    proposalPath: outsideProposalPath,
    proposalSha256: hash(outsideProposalText),
    disposition: "completed-outside-promotion",
    reason: "同じ強化はowner直接指示の別経路で完了し、昇格証跡を演出しないため。",
    ownerApproval: { status: "pending", owner: "kazu" },
  };
  write("closures/pending.json", json(closure));
  assert(run("close", "rules/log-promotion-policy.json", outsideProposalPath, "closures/pending.json", "learning/log-promotions").status !== 0, "close accepted pending owner approval");
  closure.ownerApproval = { status: "approved", owner: "kazu", approvedAt: "2026-07-18T00:00:00.000Z" };
  write("closures/approved.json", json(closure));
  pass(run("close", "rules/log-promotion-policy.json", outsideProposalPath, "closures/approved.json", "learning/log-promotions"), "approved close");
  const closedIndex = JSON.parse(read(currentIndexPath));
  const closedEntry = closedIndex.recurrenceKeys[outsideProposal.recurrence.key];
  assert(closedEntry.current === null && closedEntry.closed.some((item) => item.proposalId === outsideProposal.id), "close did not record the proposal in its recurrence index");
  const closedReview = { ...review, proposalId: outsideProposal.id, proposalPath: outsideProposalPath, proposalSha256: hash(outsideProposalText) };
  write("reviews/closed.json", json(closedReview));
  assert(run("review", "rules/log-promotion-policy.json", outsideProposalPath, "reviews/closed.json", "learning/log-promotions").status !== 0, "review accepted a closed-outside-promotion proposal");
  assert(run("apply", "rules/log-promotion-policy.json", outsideProposalPath, receipt, "plans/apply.json", "learning/log-promotions").status !== 0, "apply accepted a closed-outside-promotion proposal");
  pass(run("scan", "rules/log-promotion-policy.json", "learning/log-promotions"), "closed proposal scan");
  classificationLatest = JSON.parse(read("learning/log-promotions/latest.json"));
  assert(classificationLatest.closedProposalIds.includes(outsideProposal.id) && !classificationLatest.proposalPaths.includes(outsideProposalPath), "unchanged closed proposal was reopened by scan");
  write("entries/outside-c.json", json(record("correction-outside-c", "correction", outsideOptions)));
  pass(run("record", "rules/log-promotion-policy.json", "entries/outside-c.json", "learning/log-promotions"), "outside recurrence after close");
  const reopenedIndex = JSON.parse(read(currentIndexPath)).recurrenceKeys[outsideProposal.recurrence.key];
  assert(reopenedIndex.current && reopenedIndex.current !== outsideProposal.id && reopenedIndex.closed.some((item) => item.proposalId === outsideProposal.id), "new evidence did not reopen a separately closed recurrence");

  const invalid = record("invalid-project-fact", "correction");
  invalid.summary = "http://localhost:3000/ を含む入力";
  write("entries/invalid.json", json(invalid));
  assert(run("record", "rules/log-promotion-policy.json", "entries/invalid.json", "learning/log-promotions").status !== 0, "record accepted project-specific facts");
  console.log("figma-log-promote E2E PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}