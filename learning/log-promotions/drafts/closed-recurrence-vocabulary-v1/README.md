# Closed Recurrence Vocabulary v1 — Draft Only

This bundle is a non-authoritative design candidate for log-promotion only.

- It does not modify `rules/log-promotion-policy.json`, `tools/figma-log-promote.mjs`, `tools/figma-log-promote.e2e.mjs`, source logs, proposals, closures, or canonical rules.
- Candidate execution writes only to operating-system temporary fixtures.
- A scan may create `pending-review` proposal files in those fixtures. The retained lifecycle compatibility regression also exercises `apply` only inside a disposable fixture; no canonical file is ever an input or output of that operation.
- The v4 policy retains the v3 rule/verifier allowlists byte-for-byte as lists. The proposed change is the closed recurrence vocabulary and its historic aliases.

## Candidate contents

- `rules/log-promotion-policy.v4-candidate.json` — policy v4 candidate.
- `tools/figma-log-promote.v4-candidate.mjs` — isolated tool candidate.
- `tools/figma-log-promote.v4-candidate.e2e.mjs` — temporary-fixture regression suite.
- `rules/correction-log-promotion.v4-candidate.md` — operational wording candidate.
- `recurrence-key-resolution.json` — all observed legacy keys and their classification.
- `tools/current-log-dry-run.mjs` / `dry-run.json` — read-only source measurement with isolated strict and marker-only runs.
- `manifest.json` — bundle inventory and non-authorization boundary.
- `independent-review-request.md` — review checklist; it is not an approval or receipt.

## Deliberate boundary

The strict isolated scan preserves the existing missing-metadata stop rule. It therefore reports the current markerless source section separately from the marker-only alias projection. The projection is an analysis result, not an application or a promotion approval. `dry-run.json` records source-byte invariance before and after the isolated measurement.

Where a projected family has evidence beyond an already closed historical proposal, its new `pending-review` result represents a changed full evidence set. It does not reopen or rewrite the closed proposal, closure receipt, or closure input; exact historical evidence remains suppressed by the closure-equivalence regression.
