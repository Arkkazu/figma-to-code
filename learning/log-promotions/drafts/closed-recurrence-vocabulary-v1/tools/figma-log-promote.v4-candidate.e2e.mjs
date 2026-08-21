#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolPath = fileURLToPath(new URL("./figma-log-promote.v4-candidate.mjs", import.meta.url));
const canonicalKeys = [
  "completion-without-machine-evidence",
  "verification-coverage-gap",
  "unverified-figma-value",
  "spec-missing-or-weak",
  "required-step-not-blocking",
  "scope-drift",
  "comparison-condition-unfixed",
  "promotion-loop-broken",
];
const hash = (text) => createHash("sha256").update(text).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const write = (root, path, text) => {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
};
const read = (root, path) => readFileSync(resolve(root, path), "utf8");
const run = (root, ...args) => spawnSync(process.execPath, [toolPath, ...args], { cwd: root, encoding: "utf8" });
const pass = (result, label) => assert(result.status === 0, `${label}: ${result.stderr || result.stdout || result.error?.message || `exit ${result.status}`}`);
const sections = (text) => {
  const matches = [...text.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => ({
    heading: match[1].trim(),
    raw: text.slice(match.index, index + 1 < matches.length ? matches[index + 1].index : text.length),
  }));
};

function policy(aliases = {}) {
  return {
    version: 4,
    mode: "proposal",
    schemaMarker: "<!-- loop-log-schema: v1 -->",
    sourceLogs: [
      { path: "rules/corrections.md", kind: "correction" },
      { path: "rules/mistakes.md", kind: "mistake" },
    ],
    recurrenceThreshold: 2,
    allowedRecurrenceKeys: canonicalKeys,
    recurrenceKeyAliases: aliases,
    allowedRuleTargets: ["rules/correction-log-promotion.md"],
    allowedVerifierTargets: ["tools/figma-log-promote.mjs", "tools/figma-log-promote.e2e.mjs"],
    review: {
      loopEngineeringSpec: "draft-only",
      requiresIndependentReview: true,
      requiresOwnerApproval: true,
      requiresNegativeE2E: true,
      requiresAtomicPromotionPlan: true,
    },
  };
}

function compatibilityPolicy() {
  return {
    ...policy(),
    // This is intentionally a fixture-only compatibility policy.  It retains
    // the existing lifecycle regression targets while the production v4
    // candidate keeps its v3 allowlists unchanged.
    allowedRuleTargets: ["rules/figma-spec-pipeline.md", "rules/correction-log-promotion.md"],
    allowedVerifierTargets: ["templates/verify/figma-gate.e2e.mjs", "tools/figma-log-promote.mjs", "tools/figma-log-promote.e2e.mjs"],
  };
}

function setup(root, aliases = {}, policyOverride = null) {
  write(root, "rules/correction-log-promotion.md", "# fixture rule\n");
  write(root, "tools/figma-log-promote.mjs", "export {};\n");
  write(root, "tools/figma-log-promote.e2e.mjs", "export {};\n");
  write(root, "rules/log-promotion-policy.json", json(policyOverride ?? policy(aliases)));
  write(root, "rules/corrections.md", "# corrections\n\n<!-- loop-log-schema: v1 -->\n");
  write(root, "rules/mistakes.md", "# mistakes\n\n<!-- loop-log-schema: v1 -->\n");
}

function entry(id, key, {
  kind = "correction",
  failureClass = "fixture-failure",
  promotability = "promotable",
  ruleTargets = ["rules/correction-log-promotion.md"],
  verifierTargets = ["tools/figma-log-promote.mjs", "tools/figma-log-promote.e2e.mjs"],
} = {}) {
  const base = {
    version: 1,
    id,
    kind,
    occurredOn: "2026-08-21",
    failureClass,
    recurrenceKey: key,
    promotability,
    summary: "検証根拠を持たない完了報告を記録する",
    prevention: "機械証跡が無ければ完了状態を報告しない",
  };
  if (promotability === "non-promotable") {
    return { ...base, nonPromotableReason: "このfixtureでは負のE2Eを作成できないため、理由付きで非昇格にする。" };
  }
  return {
    ...base,
    ruleTargets,
    verifierTargets,
  };
}

function compatibilityEntry(id, kind, {
  failureClass = "unverified-figma-value",
  recurrenceKey = "unverified-figma-value",
  promotability = "promotable",
} = {}) {
  return entry(id, recurrenceKey, {
    kind,
    failureClass,
    promotability,
    ruleTargets: ["rules/figma-spec-pipeline.md"],
    verifierTargets: ["templates/verify/figma-gate.e2e.mjs"],
  });
}

function marker(id, kind, rawKey, failureClass, promotability = "promotable") {
  const metadata = {
    id,
    kind,
    failureClass,
    recurrenceKey: rawKey,
    action: "strengthen",
    promotability,
    ...(promotability === "non-promotable"
      ? { nonPromotableReason: "このfixtureでは負のE2Eを作成できないため、理由付きで非昇格にする。" }
      : {
          ruleTargets: ["rules/correction-log-promotion.md"],
          verifierTargets: ["tools/figma-log-promote.mjs", "tools/figma-log-promote.e2e.mjs"],
        }),
  };
  return `## ${id}\n<!-- loop-log: ${JSON.stringify(metadata)} -->\n- 指摘：fixture\n- 今後：fixture\n\n`;
}

function withFixture(label, fn) {
  const root = mkdtempSync(join(tmpdir(), `closed-recurrence-${label}-`));
  try { fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

try {
  // 1. vocabulary外およびhistorical aliasはrecordで拒否し、正本fixtureへ追記しない。
  withFixture("outside-vocabulary", (root) => {
    setup(root, { "legacy-alias": "completion-without-machine-evidence" });
    const beforeCorrections = read(root, "rules/corrections.md");
    const beforeMistakes = read(root, "rules/mistakes.md");
    write(root, "entries/unknown.json", json(entry("unknown-key", "unknown-key")));
    assert(run(root, "record", "rules/log-promotion-policy.json", "entries/unknown.json", "learning/out").status !== 0, "unknown recurrence key was accepted");
    write(root, "entries/legacy.json", json(entry("legacy-key", "legacy-alias")));
    assert(run(root, "record", "rules/log-promotion-policy.json", "entries/legacy.json", "learning/out").status !== 0, "legacy alias was accepted as a new record key");
    assert(read(root, "rules/corrections.md") === beforeCorrections, "outside-vocabulary record changed corrections source bytes");
    assert(read(root, "rules/mistakes.md") === beforeMistakes, "outside-vocabulary record changed mistakes source bytes");
  });

  // 2. A single promotable canonical record remains below the unchanged threshold.
  withFixture("below-threshold", (root) => {
    setup(root);
    write(root, "entries/one.json", json(entry("one-canonical", "completion-without-machine-evidence")));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/one.json", "learning/out"), "one canonical record");
    const latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.status === "no-recurring-failure" && latest.proposalPaths.length === 0, "single canonical record generated a proposal");
  });

  // 3. The second promotable canonical record creates only a pending-review proposal.
  withFixture("threshold", (root) => {
    setup(root);
    write(root, "entries/a.json", json(entry("threshold-a", "completion-without-machine-evidence")));
    write(root, "entries/b.json", json(entry("threshold-b", "completion-without-machine-evidence", { kind: "mistake", failureClass: "different-raw-failure" })));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/a.json", "learning/out"), "threshold first record");
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/b.json", "learning/out"), "threshold second record");
    const latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.status === "pending-review" && latest.proposalPaths.length === 1, "threshold did not create exactly one proposal");
    const proposal = JSON.parse(read(root, latest.proposalPaths[0]));
    assert(proposal.status === "pending-review" && proposal.review.applyAllowed === false, "scan made a proposal applyable");
    assert(proposal.recurrence.sourceFailureClasses.length === 2, "heterogeneous failure classes were not retained as evidence");
  });

  // 4 and 6. Historical aliases aggregate to the expected family count without rewriting either source file.
  withFixture("aliases-byte-invariant", (root) => {
    setup(root, {
      "legacy-a1": "verification-coverage-gap",
      "legacy-a2": "verification-coverage-gap",
      "legacy-b1": "scope-drift",
      "legacy-b2": "scope-drift",
      "legacy-c1": "promotion-loop-broken",
      "legacy-c2": "promotion-loop-broken",
    });
    const corrections = `# corrections\n\n${marker("legacy-a1", "correction", "legacy-a1", "raw-a-one")}${marker("legacy-a2", "correction", "legacy-a2", "raw-a-two")}${marker("legacy-b1", "correction", "legacy-b1", "raw-b-one")}<!-- loop-log-schema: v1 -->\n`;
    const mistakes = `# mistakes\n\n${marker("legacy-b2", "mistake", "legacy-b2", "raw-b-two")}${marker("legacy-c1", "mistake", "legacy-c1", "raw-c-one")}${marker("legacy-c2", "mistake", "legacy-c2", "raw-c-two")}<!-- loop-log-schema: v1 -->\n`;
    write(root, "rules/corrections.md", corrections);
    write(root, "rules/mistakes.md", mistakes);
    const beforeCorrections = hash(corrections);
    const beforeMistakes = hash(mistakes);
    pass(run(root, "scan", "rules/log-promotion-policy.json", "learning/out"), "alias scan");
    assert(hash(read(root, "rules/corrections.md")) === beforeCorrections, "alias scan rewrote corrections markers");
    assert(hash(read(root, "rules/mistakes.md")) === beforeMistakes, "alias scan rewrote mistakes markers");
    const latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.status === "pending-review" && latest.proposalPaths.length === 3, "aliases did not create the expected three families");
    const keys = latest.proposalPaths.map((path) => JSON.parse(read(root, path)).recurrence.key).sort();
    assert(JSON.stringify(keys) === JSON.stringify(["promotion-loop-broken", "scope-drift", "verification-coverage-gap"]), "alias proposal families were wrong");
    const coverage = JSON.parse(read(root, latest.proposalPaths.find((path) => JSON.parse(read(root, path)).recurrence.key === "verification-coverage-gap")));
    assert(coverage.recurrence.evidence.every((item) => item.sourceRecurrenceKey.startsWith("legacy-a")), "proposal lost source recurrence keys");
  });

  // 5. non-promotable evidence never counts toward the unchanged threshold.
  withFixture("non-promotable", (root) => {
    setup(root);
    write(root, "entries/promotable.json", json(entry("promotable-only", "required-step-not-blocking")));
    write(root, "entries/non-promotable.json", json(entry("non-promotable-same-key", "required-step-not-blocking", { promotability: "non-promotable", failureClass: "same-family-non-promotable" })));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/promotable.json", "learning/out"), "promotable fixture record");
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/non-promotable.json", "learning/out"), "non-promotable fixture record");
    const latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.nonPromotableCount === 1 && latest.proposalPaths.length === 0, "non-promotable evidence was counted toward threshold");
  });

  // 7. A v3-shaped closed proposal remains closed under v4 when evidence is identical, and only new evidence reopens the family.
  withFixture("legacy-closure", (root) => {
    setup(root);
    const correctionBlock = marker("legacy-closed-a", "correction", "unverified-figma-value", "unverified-figma-value");
    const mistakeBlock = marker("legacy-closed-b", "mistake", "unverified-figma-value", "unverified-figma-value");
    const correctionText = `# corrections\n\n${correctionBlock}<!-- loop-log-schema: v1 -->\n`;
    const mistakeText = `# mistakes\n\n${mistakeBlock}<!-- loop-log-schema: v1 -->\n`;
    write(root, "rules/corrections.md", correctionText);
    write(root, "rules/mistakes.md", mistakeText);
    const correctionSection = sections(correctionText).find((item) => item.heading === "legacy-closed-a");
    const mistakeSection = sections(mistakeText).find((item) => item.heading === "legacy-closed-b");
    const oldId = "figma-log-unverified-figma-value-legacy-v3";
    const oldProposalPath = `learning/out/proposals/${oldId}.json`;
    const oldProposal = {
      version: 1,
      id: oldId,
      status: "pending-review",
      generatedBy: "figma-log-promote.mjs",
      recurrence: {
        key: "unverified-figma-value",
        failureClass: "unverified-figma-value",
        threshold: 2,
        evidence: [
          {
            id: "legacy-closed-a", kind: "correction", failureClass: "unverified-figma-value", recurrenceKey: "unverified-figma-value", action: "strengthen", promotability: "promotable",
            ruleTargets: ["rules/correction-log-promotion.md"], verifierTargets: ["tools/figma-log-promote.mjs", "tools/figma-log-promote.e2e.mjs"],
            source: { path: "rules/corrections.md", heading: correctionSection.heading, sha256: hash(correctionSection.raw) },
          },
          {
            id: "legacy-closed-b", kind: "mistake", failureClass: "unverified-figma-value", recurrenceKey: "unverified-figma-value", action: "strengthen", promotability: "promotable",
            ruleTargets: ["rules/correction-log-promotion.md"], verifierTargets: ["tools/figma-log-promote.mjs", "tools/figma-log-promote.e2e.mjs"],
            source: { path: "rules/mistakes.md", heading: mistakeSection.heading, sha256: hash(mistakeSection.raw) },
          },
        ],
      },
      requiredChange: {
        action: "strengthen",
        ruleTargets: ["rules/correction-log-promotion.md"],
        verifierTargets: ["tools/figma-log-promote.e2e.mjs", "tools/figma-log-promote.mjs"],
        negativeE2ERequired: true,
      },
      review: { loopEngineeringSpec: "draft-only", requiresIndependentReview: true, requiresOwnerApproval: true, applyAllowed: false, promotionPlanRequired: true },
    };
    write(root, oldProposalPath, json(oldProposal));
    const oldProposalBytes = read(root, oldProposalPath);
    const closureReceiptPath = "learning/out/closures/legacy-closure-receipt.json";
    const closureReceipt = json({ version: 1, id: "legacy-closure-receipt", status: "completed-outside-promotion", proposal: { id: oldId, path: oldProposalPath, sha256: hash(oldProposalBytes) } });
    write(root, closureReceiptPath, closureReceipt);
    write(root, "learning/out/proposals/current.json", json({
      version: 1,
      recurrenceKeys: {
        "unverified-figma-value": {
          current: null,
          superseded: [oldId],
          closed: [{ closureId: "legacy-closure", proposalId: oldId, proposalPath: oldProposalPath, proposalSha256: hash(oldProposalBytes) }],
        },
      },
    }));
    pass(run(root, "scan", "rules/log-promotion-policy.json", "learning/out"), "legacy closure scan");
    const latestClosed = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latestClosed.proposalPaths.length === 0 && latestClosed.closedProposalIds.includes(oldId), "identical closed v3 evidence reopened under v4");
    assert(read(root, oldProposalPath) === oldProposalBytes, "scan changed immutable legacy proposal bytes");
    assert(read(root, closureReceiptPath) === closureReceipt, "scan changed immutable closure receipt bytes");
    write(root, "entries/reopen.json", json(entry("legacy-closed-c", "unverified-figma-value", { failureClass: "new-evidence" })));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/reopen.json", "learning/out"), "new evidence after legacy closure");
    const latestReopened = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latestReopened.status === "pending-review" && latestReopened.proposalPaths.length === 1, "new evidence did not reopen the closed family");
    assert(read(root, oldProposalPath) === oldProposalBytes && read(root, closureReceiptPath) === closureReceipt, "reopen changed historical immutable bytes");
  });

  // Existing lifecycle regressions are retained below.  Their apply calls are
  // deliberately limited to this disposable fixture; no canonical file is a
  // command input or output of this candidate suite.
  withFixture("existing-lifecycle-regressions", (root) => {
    setup(root, {}, compatibilityPolicy());
    write(root, "rules/figma-spec-pipeline.md", "# rule\n");
    write(root, "templates/verify/figma-gate.e2e.mjs", [
      'import { readFileSync } from "node:fs";',
      'import { resolve } from "node:path";',
      'const text = readFileSync(resolve(process.cwd(), "rules/figma-spec-pipeline.md"), "utf8");',
      'if (!text.includes("evidence-required")) process.exit(1);',
      'console.log("negative E2E PASS");',
    ].join("\n"));

    write(root, "entries/a.json", json(compatibilityEntry("correction-provenance-a", "correction")));
    write(root, "entries/b.json", json(compatibilityEntry("mistake-provenance-b", "mistake")));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/a.json", "learning/out"), "existing first record");
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/b.json", "learning/out"), "existing second record");
    let latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.status === "pending-review" && latest.proposalPaths.length === 1, "existing records did not create one pending proposal");
    const proposalPath = latest.proposalPaths[0];
    const proposalText = read(root, proposalPath);
    const proposal = JSON.parse(proposalText);
    assert(proposal.review.promotionPlanRequired === true, "existing proposal does not require a plan");

    const review = {
      version: 1,
      proposalId: proposal.id,
      proposalPath,
      proposalSha256: hash(proposalText),
      implementation: { actor: "codex", contextId: "implementation-context" },
      reviewer: { actor: "claude", contextId: "review-context" },
      checks: { evidenceIntegrity: "PASS", recurrenceThreshold: "PASS", projectFactsExcluded: "PASS", strengthensOnly: "PASS", guardrailsUnchanged: "PASS" },
      negativeE2E: { path: "templates/verify/figma-gate.e2e.mjs", sha256: hash(read(root, "templates/verify/figma-gate.e2e.mjs")), result: "PASS" },
      ownerApproval: { status: "pending", owner: "kazu" },
    };
    write(root, "reviews/review.json", json(review));
    assert(run(root, "review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/out").status !== 0, "existing review passed while its negative E2E failed");

    write(root, "rules/figma-spec-pipeline.md", "# rule\n\nevidence-required\n");
    review.negativeE2E.sha256 = hash(read(root, "templates/verify/figma-gate.e2e.mjs"));
    write(root, "reviews/review.json", json(review));
    pass(run(root, "review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/out"), "existing waiting-owner review");
    let latestReview = JSON.parse(read(root, "learning/out/latest-review.json"));
    assert(latestReview.status === "waiting-owner", "pending owner did not block application");
    const pendingReceipt = latestReview.receiptPath;
    write(root, "plans/pending.json", json({
      version: 1,
      id: "pending",
      proposalId: proposal.id,
      proposalPath,
      proposalSha256: hash(proposalText),
      reviewReceiptPath: pendingReceipt,
      reviewReceiptSha256: hash(read(root, pendingReceipt)),
      patches: [{ path: "rules/figma-spec-pipeline.md", expectedSha256: hash(read(root, "rules/figma-spec-pipeline.md")), find: "evidence-required", replace: "wrong-value" }],
    }));
    assert(run(root, "apply", "rules/log-promotion-policy.json", proposalPath, pendingReceipt, "plans/pending.json", "learning/out").status !== 0, "existing apply accepted waiting-owner receipt");

    review.ownerApproval = { status: "approved", owner: "kazu", approvedAt: "2026-07-18T00:00:00.000Z" };
    write(root, "reviews/review.json", json(review));
    pass(run(root, "review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/out"), "existing approved review");
    latestReview = JSON.parse(read(root, "learning/out/latest-review.json"));
    assert(latestReview.status === "ready-to-apply", "approved review did not create ready receipt");
    const receipt = latestReview.receiptPath;
    const baseline = read(root, "rules/figma-spec-pipeline.md");
    write(root, "plans/rollback.json", json({
      version: 1,
      id: "rollback",
      proposalId: proposal.id,
      proposalPath,
      proposalSha256: hash(proposalText),
      reviewReceiptPath: receipt,
      reviewReceiptSha256: hash(read(root, receipt)),
      patches: [{ path: "rules/figma-spec-pipeline.md", expectedSha256: hash(baseline), find: "evidence-required", replace: "wrong-value" }],
    }));
    assert(run(root, "apply", "rules/log-promotion-policy.json", proposalPath, receipt, "plans/rollback.json", "learning/out").status !== 0, "existing apply accepted a plan whose negative E2E fails");
    assert(read(root, "rules/figma-spec-pipeline.md") === baseline, "failed fixture apply did not roll back the rule");

    write(root, "plans/apply.json", json({
      version: 1,
      id: "apply",
      proposalId: proposal.id,
      proposalPath,
      proposalSha256: hash(proposalText),
      reviewReceiptPath: receipt,
      reviewReceiptSha256: hash(read(root, receipt)),
      patches: [{ path: "rules/figma-spec-pipeline.md", expectedSha256: hash(baseline), find: "evidence-required", replace: "evidence-required\nverified-at-preflight" }],
    }));
    pass(run(root, "apply", "rules/log-promotion-policy.json", proposalPath, receipt, "plans/apply.json", "learning/out"), "existing approved fixture apply");
    assert(read(root, "rules/figma-spec-pipeline.md").includes("verified-at-preflight"), "approved fixture plan did not update the fixture rule");
    assert(JSON.parse(read(root, "learning/out/latest-promotion.json")).status === "promoted", "fixture promotion receipt was not recorded");

    const currentIndexPath = "learning/out/proposals/current.json";
    write(root, currentIndexPath, json({ version: 1, recurrenceKeys: { [proposal.recurrence.key]: { current: "figma-log-superseding-proposal", superseded: [proposal.id] } } }));
    assert(run(root, "review", "rules/log-promotion-policy.json", proposalPath, "reviews/review.json", "learning/out").status !== 0, "existing review accepted a superseded proposal");
    assert(run(root, "apply", "rules/log-promotion-policy.json", proposalPath, receipt, "plans/apply.json", "learning/out").status !== 0, "existing apply accepted a superseded proposal");
    write(root, currentIndexPath, json({ version: 1, recurrenceKeys: {} }));

    const nonPromotable = compatibilityEntry("correction-governance-recognition-a", "correction", {
      failureClass: "governance-recognition",
      recurrenceKey: "promotion-loop-broken",
      promotability: "non-promotable",
    });
    write(root, "entries/non-promotable.json", json(nonPromotable));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/non-promotable.json", "learning/out"), "existing non-promotable record");
    latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.nonPromotableCount === 1 && latest.unclassifiedCount === 0, "existing non-promotable record was not listed separately");
    assert(latest.proposalPaths.length === 1, "existing non-promotable record blocked a promotable proposal");
    const shortReason = { ...nonPromotable, id: "correction-governance-recognition-short", nonPromotableReason: "短い理由" };
    write(root, "entries/non-promotable-short.json", json(shortReason));
    assert(run(root, "record", "rules/log-promotion-policy.json", "entries/non-promotable-short.json", "learning/out").status !== 0, "existing non-promotable record accepted a short reason");
    const dishonestTarget = { ...nonPromotable, id: "correction-governance-recognition-targeted", ruleTargets: ["rules/figma-spec-pipeline.md"] };
    write(root, "entries/non-promotable-targeted.json", json(dishonestTarget));
    assert(run(root, "record", "rules/log-promotion-policy.json", "entries/non-promotable-targeted.json", "learning/out").status !== 0, "existing non-promotable record accepted a target");

    const correctionsBeforeUnclassified = read(root, "rules/corrections.md");
    write(root, "rules/corrections.md", correctionsBeforeUnclassified.replace("\n<!-- loop-log-schema: v1 -->", "\n\n## unclassified entry\n- metadata intentionally absent\n\n<!-- loop-log-schema: v1 -->"));
    pass(run(root, "scan", "rules/log-promotion-policy.json", "learning/out"), "existing unclassified scan");
    latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.status === "waiting-human" && latest.unclassifiedCount === 1 && latest.proposalPaths.length === 0, "existing unclassified record did not stop proposal generation");
    write(root, "rules/corrections.md", correctionsBeforeUnclassified);
    pass(run(root, "scan", "rules/log-promotion-policy.json", "learning/out"), "existing classified scan");

    const outsideOptions = { failureClass: "completed-outside-promotion", recurrenceKey: "scope-drift" };
    write(root, "entries/outside-a.json", json(compatibilityEntry("correction-outside-a", "correction", outsideOptions)));
    write(root, "entries/outside-b.json", json(compatibilityEntry("mistake-outside-b", "mistake", outsideOptions)));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/outside-a.json", "learning/out"), "existing outside first record");
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/outside-b.json", "learning/out"), "existing outside second record");
    latest = JSON.parse(read(root, "learning/out/latest.json"));
    const outsideProposalPath = latest.proposalPaths.find((item) => item !== proposalPath);
    assert(Boolean(outsideProposalPath), "existing outside proposal was not generated");
    const outsideProposalText = read(root, outsideProposalPath);
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
    write(root, "closures/pending.json", json(closure));
    assert(run(root, "close", "rules/log-promotion-policy.json", outsideProposalPath, "closures/pending.json", "learning/out").status !== 0, "existing close accepted pending owner approval");
    closure.ownerApproval = { status: "approved", owner: "kazu", approvedAt: "2026-07-18T00:00:00.000Z" };
    write(root, "closures/approved.json", json(closure));
    pass(run(root, "close", "rules/log-promotion-policy.json", outsideProposalPath, "closures/approved.json", "learning/out"), "existing approved close");
    const closedIndex = JSON.parse(read(root, currentIndexPath));
    const closedEntry = closedIndex.recurrenceKeys[outsideProposal.recurrence.key];
    assert(closedEntry.current === null && closedEntry.closed.some((item) => item.proposalId === outsideProposal.id), "existing close did not record the proposal in its recurrence index");
    const closedReview = { ...review, proposalId: outsideProposal.id, proposalPath: outsideProposalPath, proposalSha256: hash(outsideProposalText) };
    write(root, "reviews/closed.json", json(closedReview));
    assert(run(root, "review", "rules/log-promotion-policy.json", outsideProposalPath, "reviews/closed.json", "learning/out").status !== 0, "existing review accepted a closed-outside-promotion proposal");
    assert(run(root, "apply", "rules/log-promotion-policy.json", outsideProposalPath, receipt, "plans/apply.json", "learning/out").status !== 0, "existing apply accepted a closed-outside-promotion proposal");
    pass(run(root, "scan", "rules/log-promotion-policy.json", "learning/out"), "existing closed proposal scan");
    latest = JSON.parse(read(root, "learning/out/latest.json"));
    assert(latest.closedProposalIds.includes(outsideProposal.id) && !latest.proposalPaths.includes(outsideProposalPath), "unchanged closed proposal was reopened by scan");
    write(root, "entries/outside-c.json", json(compatibilityEntry("correction-outside-c", "correction", outsideOptions)));
    pass(run(root, "record", "rules/log-promotion-policy.json", "entries/outside-c.json", "learning/out"), "existing outside recurrence after close");
    const reopenedIndex = JSON.parse(read(root, currentIndexPath)).recurrenceKeys[outsideProposal.recurrence.key];
    assert(reopenedIndex.current && reopenedIndex.current !== outsideProposal.id && reopenedIndex.closed.some((item) => item.proposalId === outsideProposal.id), "new evidence did not reopen a separately closed recurrence");

    const invalid = compatibilityEntry("invalid-project-fact", "correction");
    invalid.summary = "localhost を含む入力";
    write(root, "entries/invalid.json", json(invalid));
    assert(run(root, "record", "rules/log-promotion-policy.json", "entries/invalid.json", "learning/out").status !== 0, "existing record accepted project-specific facts");
  });

  console.log("figma-log-promote v4 candidate E2E PASS");
} catch (error) {
  console.error(`figma-log-promote v4 candidate E2E FAIL: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
}
