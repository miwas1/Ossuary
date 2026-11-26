# Open questions

Non-blocking items (product.md, Autonomy). Nothing here is waited on.

## Phase 1: 01-skeleton-core

- **Task 12.3, smoke test and a real Echo run: skipped.** `.env` holds neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY`. With a key in `.env`, run `OSSUARY_SMOKE=1 pnpm --filter @ossuary/skeleton smoke` to record counts, commit `packages/skeleton/src/gateway/fixtures/token-counts.json`, rerun `pnpm verify` and run `pnpm --filter echo task "a lighthouse keeper"`. Full calibration needs recordings for both vendors and is a Phase 4 exit criterion (D-71).
