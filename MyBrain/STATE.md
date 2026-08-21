# STATE - figma-to-code Public MyBrain

## Current

- 2026-08-22: Created a repository-local `MyBrain/` so cloud agents can read
  public development context for `figma-to-code`.
- Purpose: support future cloud-agent development of this repository without
  depending on local-only paths.
- Status: initial skeleton, not yet committed or pushed.

## Active Constraints

- This `MyBrain/` is public-shareable and Git-tracked.
- It is not a project-side private memory store.
- It must not contain client/project facts, Figma identifiers, secrets, URLs,
  selectors, measurements, private deployment data, or copied upper-layer
  rulebooks.

## Open Items

- Decide whether to add a pre-push private-data scan specific to this directory.
- Decide whether root `README.md` should link to this directory after owner
  review.
