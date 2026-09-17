# STATE - figma-to-code Public MyBrain

## Current

- 2026-09-17: Owner-authorized repair of the owner visual exemption path in the
  browser batch. The gate intentionally sends zero capture jobs for an
  owner-approved VISUAL exemption, but the batch zero-capture guard (painted:false
  forgery detection) rejected every such checkpoint, and batch job normalization
  dropped any exemption record. The gate now forwards the validated exemption
  (element id, selector, repo-relative basis path) in the capture document; the
  batch validates it, accepts it only with empty capture jobs, and records the
  skipped guard in `summary.paintGuard`. Unapproved or incomplete records still
  fail. Also reset `verify-layout` paint observations per run (they leaked across
  runs in one process). Checks: gate-browser-batch E2E PASS locally (real
  browser; CI known-failing list), figma-gate E2E 869 assertions PASS, owner
  exemption E2E PASS, run-checks 20/20 PASS. Mutations confirmed: disabling the
  batch skip, the per-run reset, or the gate forwarding each makes an E2E fail.
  The working tree had unrelated uncommitted edits to `cdp-browser` files from
  another session during these runs; they are not part of this change.

- 2026-09-15: Owner-authorized repair of Figma close forwarding to the style unit
  checker. Explicit same-scope exception ledgers are frozen at preflight.
  Focused regression: 83 assertions PASS, including a forwarding-removal mutation.
  All 20 suites now have PASS results (initial aggregate 19 PASS / 1 timeout;
  that main gate suite passed 859 assertions standalone). Official distribution
  passed 859 main-gate and 83 exception assertions. See
  [[reports/style-exception-forwarding-20260915]].

- 2026-09-11: Added the explicit variable-design viewport contract to the gate,
  coverage checks and contract audit. Verification and limitations are recorded
  in `reports/variable-design-viewport-verification-20260911.json`.

- 2026-08-22: Created a repository-local `MyBrain/` so cloud agents can read
  public development context for `figma-to-code`.
- Purpose: support future cloud-agent development of this repository without
  depending on local-only paths.
- Status: committed and pushed on `master` as `0d2def6`.
- 2026-08-22: Verified in a cloud session that this directory arrives with the
  repository clone, so read-order item 5 is reachable from cloud agents.

## Active Constraints

- This `MyBrain/` is public-shareable and Git-tracked.
- It is not a project-side private memory store.
- It must not contain client/project facts, Figma identifiers, secrets, URLs,
  selectors, measurements, private deployment data, or copied upper-layer
  rulebooks.

## Open Items

- None.

## Resolved

- 2026-08-22: Added `tools/public-memory-scan.mjs` as the pre-push private-data
  scan for this directory, with `tools/public-memory-scan.e2e.mjs` fixing both
  the positive and negative cases. This directory currently scans clean.
- 2026-08-22: Decided with the owner that root `README.md` lists this directory
  as one line under its structure list, and that no dedicated section is added -
  a section would duplicate `rules/public-memory-policy.md`. Applied.
