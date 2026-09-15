---
title: Frozen style exception ledger forwarding
date: 2026-09-15
status: in-progress
tags: [verification, regression]
---

# Scope

Local maintenance explicitly authorized by the owner. The Figma close command
did not forward the declared style exception ledger to the real unit checker.
This change does not alter the unit rules, visual thresholds, or application CSS.

## Contract

`scope.styleRuleExceptionsPath` optionally names a repository-relative coding
manifest. Its `id` must match the Figma scope; its
`scope.styleRuleApplication.exceptions` must be an array. Each entry needs a
declared SCSS file, selector, property and a reason of at least 20 characters.
The full ledger is hashed at preflight and rechecked by later frozen-input
checks. Close forwards this exact declared path as `--exceptions`.

Without the optional path, lint remains strict. Sibling filenames and other
active receipts are never searched automatically. Existing active preflights
must be reissued after the verifier update; old receipts must not be rewritten.

## Verification

Real unit checker CLI with disposable Git repositories; Sass and browser are
explicit doubles. Test valid exception, missing declaration, wrong selector,
unrelated unit violation, foreign scope, invalid ledger, out-of-scope file,
short reason and post-preflight mutation. Remove only forwarding in a disposable
verifier copy and require the formerly valid close to fail.

- Focused CLI regression: PASS, 83 assertions (130 seconds).
- Public-memory scan, rule-size audit, entry-trigger audit and diff whitespace
  check: PASS.
- Full `run-checks` and distribution: pending.

No client data is included here. Deployment and application-specific results
belong in the private project memory.
