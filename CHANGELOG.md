# Changelog

Model swaps, harness changes, eval deltas, cost changes and components removed (framework §15.1, step 6).

## Unreleased

### 2026-11-26

- What changed: `models.yaml` now names an OpenAI fallback for all three tiers, replacing the two Google placeholders and the OpenAI placeholder (D-48). It has standard-tier prices for the seven listed models, each with its vendor pricing URL and the check date, plus `max_prompt_tokens` where the vendor charges long-context rates above a size (D-49, D-60).
- Eval deltas: evals not run (the eval runner arrives in Phase 2).
- Cost change: none yet. No code reads the prices until the Phase 1 gateway is built.
- Later the same day: `models.yaml` added the 30-minute cache-write price for the three OpenAI models, and its comments now explain the cache lifetimes and the Phase 4 image allowance field (D-60). Evals not run. No cost change yet; once the gateway is built, OpenAI cache writes are priced at the listed write rate rather than the input rate. No harness components removed.
- Harness components removed: none.
