# figma-log-unverified-figma-value-8d8aa16d634fc8bd

## Status

- pending-review

## Recurrence evidence

- failure class: unverified-figma-value
- recurrence key: unverified-figma-value
- evidence count: 2 / threshold 2
- correction-provenance-spec-20260709: rules/corrections.md:75 (bb1eba419ae0e8f6e9642fccd010f5536f0f3b65f542c4a491860ce9e98fa5cd)
- mistake-provenance-spec-20260625: rules/mistakes.md:84 (618fda7815a1235455ee581a5d7565ade1084c4f6551c2589f7535b9a7637945)

## Required change

- Strengthen the listed rule only; do not weaken validation, human gates, allowlists, stop conditions, budgets, or network policy.
- Rule target: rules/figma-spec-pipeline.md
- Verifier target: templates/verify/figma-gate.e2e.mjs
- Verifier target: templates/verify/figma-gate.mjs
- Add a negative E2E that reproduces the failure class before promotion.

## Promotion gate

- Independent reviewer must record PASS for evidence, non-weakening, target scope, and negative E2E.
- Owner approval is required before a canonical rule or verifier is changed.
- Loop Engineering review target: C:\AI\loop-engineering\spec\06-self-improvement.md

