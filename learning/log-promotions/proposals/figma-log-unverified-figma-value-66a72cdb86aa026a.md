# figma-log-unverified-figma-value-66a72cdb86aa026a

## Status

- pending-review

## Recurrence evidence

- failure class: unverified-figma-value
- recurrence key: unverified-figma-value
- evidence count: 2 / threshold 2
- correction-provenance-spec-20260709: rules/corrections.md:undefined (bb1eba419ae0e8f6e9642fccd010f5536f0f3b65f542c4a491860ce9e98fa5cd)
- mistake-provenance-spec-20260625: rules/mistakes.md:undefined (405a72d3fbb09975c1e4bee4137752b7188fbac18a663765a8c0fc87a4070db6)

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

