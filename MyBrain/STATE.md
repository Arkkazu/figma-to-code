# STATE - figma-to-code Public MyBrain

## Current

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
