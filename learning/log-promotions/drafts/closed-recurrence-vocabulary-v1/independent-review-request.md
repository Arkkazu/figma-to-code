# Independent review request — closed recurrence vocabulary candidate

## Review boundary

Review this draft bundle only. It requests no canonical rewrite, proposal approval, promotion application, runtime action, or delivery action.

## Required checks

1. Verify that the candidate policy has a closed canonical vocabulary, aliases only map legacy keys to canonical keys, and every observed legacy key is either mapped or explicitly unassigned.
2. Verify that a new record using an unknown key or a legacy alias fails before source-log bytes change.
3. Verify that alias resolution occurs only during aggregation and that the source recurrence key plus raw failure class remain in proposal evidence.
4. Verify that a family with heterogeneous raw failure classes aggregates under one canonical family without choosing an arbitrary raw class as the proposal class.
5. Verify that non-promotable records do not contribute to the unchanged recurrence threshold.
6. Verify that strict scan preserves the markerless-entry stop rule and that the marker-only alias projection is identified as analysis, not as a strict scan result.
7. Verify source-byte invariance for both source logs during the isolated alias scan and the current-log dry run.
8. Verify closure equivalence: identical historical evidence remains suppressed, while added or changed evidence opens a new pending-review proposal without mutating the old proposal or closure receipt.
9. Verify that the retained lifecycle regression runs review/apply only in a disposable temporary fixture and never invokes canonical `record`, `scan`, `review`, `apply`, or `close`.
10. Verify the allowlist compatibility note: v3 arrays are preserved, because narrowing them would invalidate historical evidence; this candidate does not claim that a target-allowlist narrowing is implemented.
11. Verify that any later `policy application plan` is a separately owner-approved before/after-hash-and-rollback plan for this vocabulary change, not an approval to apply an existing promotion proposal.

## Evidence to inspect

- `rules/log-promotion-policy.v4-candidate.json`
- `tools/figma-log-promote.v4-candidate.mjs`
- `tools/figma-log-promote.v4-candidate.e2e.mjs`
- `rules/correction-log-promotion.v4-candidate.md`
- `recurrence-key-resolution.json`
- `dry-run.json`
- `e2e.log`

The review outcome must be recorded independently. This request is not an approval record.
