---
title: Frozen style exception ledger forwarding
date: 2026-09-15
status: verified
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
- Full `run-checks`: 19 suites PASS; the existing main gate suite reached its
  600-second runner limit after step 18 of 22. Standalone rerun: all 22 steps,
  859 assertions PASS (537 seconds). Thus every suite in the 20-suite collection
  has a passing result; the first aggregate run itself remains 19/20, not 20/20.
  No timeout limit or test case was removed.
- First distribution: exception regression PASS (83 assertions); rolled back
  because the existing edit-hook fixture froze the deployed kit but the real
  hook invokes the canonical kit. The positive hook fixture now freezes that
  same canonical kit; its runtime-tampering rejection cases are retained.
  The other CLI cases continue to test the deployed kit.
- Targeted real edit-hook regression after that fixture correction: 43 assertions
  PASS (44 seconds). Second distribution main gate suite: 859 assertions PASS
  (529 seconds); its separate style-exception suite also passed all 83 assertions
  (55 seconds). Official distribution completed with byte-identical committed
  source and destination files; backups and the distribution log were retained.

Implementation commits: `73ba1ed` (forwarding and regression) and `8b70b7f`
(portable real-hook fixture). Existing unrelated browser-module work was not
committed or distributed. No application source or old gate receipt was changed.

No client data is included here. Deployment and application-specific results
belong in the private project memory.
