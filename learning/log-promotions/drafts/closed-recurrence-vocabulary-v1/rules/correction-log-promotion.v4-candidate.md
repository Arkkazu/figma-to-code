# Log promotion — closed recurrence vocabulary candidate

## Status and boundary

This is a draft-only operational wording candidate. It does not authorize a policy replacement, source-log rewrite, proposal approval, promotion application, or runtime action.

The promotion command may only create a `pending-review` proposal. Independent review, negative E2E evidence, owner approval, and an atomic promotion plan remain required before any canonical change.

## New records

Each new promotable or non-promotable record must use a `recurrenceKey` that appears directly in `allowedRecurrenceKeys`.

`recurrenceKeyAliases` are historical, read-only resolution entries. A new record using an alias must fail before its source log is changed. This prevents new free-form recurrence families from splitting the threshold population.

The initial vocabulary represents these failure families:

- completion without machine evidence;
- verification coverage gap;
- unverified Figma value;
- missing or weak specification;
- required step not blocking;
- scope drift;
- comparison condition unfixed; and
- promotion loop broken.

## Historical records and aliases

Existing loop-log markers are append-only evidence. They must not be rewritten to replace a legacy key with a canonical key.

During aggregation only, a listed alias resolves to its canonical recurrence family. A proposal retains both the canonical family and the observed source failure classes/keys in its evidence. This permits a family to contain historically heterogeneous `failureClass` values without discarding their provenance.

A legacy key with no alias is reported as `unassignedLegacy`. It is excluded from threshold aggregation, but it is not silently converted into a new record and does not alter its source bytes. It requires an owner-approved vocabulary or alias decision.

A markerless new section remains `unclassified`; it preserves the existing `waiting-human` stop rule and prevents proposal generation in a strict scan.

## Vocabulary maintenance

Adding, removing, or remapping a canonical recurrence key or alias requires all of the following before the canonical policy is changed:

1. a draft inventory that shows every affected legacy key and explicitly lists anything unassigned;
2. negative E2E coverage for rejection, threshold behavior, alias resolution, non-promotable exclusion, source-byte invariance, and closure compatibility;
3. independent review of the inventory, implementation, and dry-run evidence;
4. owner approval of the exact candidate bytes; and
5. a separate `policy application plan` with before/after hashes and rollback behavior.

Aliases are append-only historical interpretation. Source markers, old proposal bytes, closure receipts, and their recorded hashes remain reference-only evidence.

The `policy application plan` is prepared only after owner approval of the vocabulary change. It is not approval to apply, or an instruction to execute, any existing log-promotion proposal. It changes only the policy/tool/documentation candidate that has separately passed review.

## Closed proposals

A closed proposal is compared by canonical family, source failure classes, evidence identity/source hashes, and approved target sets. An exact equivalent remains suppressed. Added or changed evidence creates a new pending-review proposal; it never mutates the prior proposal or closure receipt.

## Allowlist compatibility note

This vocabulary candidate leaves the existing v3 rule-target and verifier-target allowlist arrays unchanged. Existing historical marker evidence depends on those lists during validation. This draft changes recurrence-key governance only; narrowing target lists is a separate, explicitly reviewed compatibility decision.
