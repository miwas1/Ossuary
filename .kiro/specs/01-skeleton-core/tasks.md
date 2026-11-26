# Implementation Plan

Spec `01-skeleton-core` (Phase 1).

Order follows plan §10: schemas and types first, then the pure logic with its property tests, then I/O, then Echo, then the exit-criteria proof. Each task names the requirements it serves. Property tests are required, not optional. Each one lives in a `*.property.test.ts` file, carries `// Feature: 01-skeleton-core, Property <id>: <text>`, and runs at least 100 cases (Requirement 27.2).

Ground rules for every task:

- Every test uses the fake provider and PGlite. No task needs an API key, network access or Docker (24.4, D-35, D-71).
- `pnpm verify` must be green before a task is marked done.
- Vendor SDKs are imported only under `packages/skeleton/src/gateway/providers/` (1.2).
- No model name, model ID or price appears outside `models.yaml` and `docs/` (1.5). Tests use `fake:` IDs from `fakeModelRegister()`.

- [x] 1. Changes already made in the requirements round
  - [x] 1.1 `models.yaml`: OpenAI fallbacks for every tier, dated prices with source URLs, `max_prompt_tokens`, and the 30-minute OpenAI cache-write prices.
    - _Requirements: 4.5, 4.6, D-48, D-49, D-60_
  - [x] 1.2 `scripts/test/model-register.test.ts` checks for a dated, sourced price for every tier model, instead of an empty `prices` block.
    - _Requirements: 4.6, 4.7_
  - [x] 1.3 `turbo.json` lists `models.yaml` in `globalDependencies` and defines an `eval` task. `apps/exhume/turbo.json` and `apps/seance/turbo.json` add `product.yaml`, `routing.yaml` and `evals/**` to their `test` and `eval` inputs.
    - _Requirements: 26.1, D-61_

- [x] 2. Dependencies and shared pieces
  - [x] 2.1 Add `zod` (v4), `yaml` (`catalog:`), `@anthropic-ai/sdk` and `openai` to `@ossuary/skeleton`, and `fast-check` (`catalog:`) as a dev dependency. Pin exact versions and commit `pnpm-lock.yaml`. Add `vitest.smoke.config.ts` (includes only `**/*.smoke.ts`) and the package script `smoke`, and make sure the default Vitest config excludes `*.smoke.ts`.
    - _Requirements: 1.2, 25.3_
  - [x] 2.2 Write `src/errors.ts` with every typed error class from the design's error table. Each class has a string `code`, and its message holds no secrets, prompt text or URLs. Add a unit test that each class sets `code` and `name`.
    - _Requirements: 1.1, 9.3_
  - [x] 2.3 Write `src/money.ts` with `picoPerToken`, `ceilDiv`, `costMicros` and `capMicros`. Unit-test 0.125, 0.01, 0.57 (gives 570,000), a seven-decimal price (rejected), and a cost that rounds up by one micro-dollar.
    - _Requirements: 12.1, 12.3, 21.3, D-46, D-62_

- [x] 3. Manifest
  - [x] 3.1 Write `src/manifest/schemas.ts`: the product, routing and model schemas, strict objects throughout. Routing takes `timeout_ms`, `max_output_tokens` and `max_retry_wait_ms` with their ranges. Prices take optional `cache_write_input`, `max_prompt_tokens` and `image_input_tokens`. Add a formatter that turns Zod issues into `path: problem` lines. Unit-test a missing field, a wrong type, an unknown key, each out-of-range number and a bad Model ID.
    - _Requirements: 2.2, 2.3, 2.4, 3.1 to 3.4, 3.7, 4.1, 4.5, D-58, D-59, D-70_
  - [x] 3.2 Write `src/manifest/policy.ts`: the three tables as data and `resolvePolicy(code, override?)`. Unit-test an invalid part of each kind, R4 (`restricted`), A0 (`targetRequired`), A4 (`longRuns: 10`), a below-default override, a wrong measure and deep freezing.
    - _Requirements: 5.1 to 5.4, 6.1 to 6.3, 7.1, 7.2, 8.2 to 8.4, D-42, D-43, D-44_
  - [x] 3.3 Property test 1: no accepted override ever lowers a resolved threshold.
    - _Requirements: 8.5_
  - [x] 3.4 Property test P1-1: each part of the code drives only its own Policy fields.
    - _Requirements: 5.5_
  - [x] 3.5 Write `src/manifest/load.ts` with `loadProduct(appDir, { models? })`. It finds the repo root and reads the three files, with YAML syntax errors reported by line and column. It then runs the cross-field checks (Primary is a placeholder, same-vendor Fallback, missing price), the `THREATS.md` check and the A0 threshold check, and deep-freezes the result. Test it with temporary app folders, including one that loads the real root `models.yaml` without error.
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 4.2, 4.3, 4.4, 4.7, 7.3, 8.1, D-57, D-64_

- [x] 4. Trace: pure parts
  - [x] 4.1 Write `src/trace/attributes.ts` with every attribute name as a constant. Check each `gen_ai.*` name against the OpenTelemetry semantic-conventions registry on the day of writing. Keep `gen_ai.usage.cache_creation.input_tokens` only if the registry defines it, and note the check date in a comment.
    - _Requirements: 22.3, 22.4, 22.5, 22.6, D-47_
  - [x] 4.2 Write `src/trace/redact.ts` with `createRedactor(env)` and `redact`, for secrets, emails and the three phone pattern groups. Unit-test every example in Requirement 23.2, a `+44` number, a number next to another number, and keys left unchanged.
    - _Requirements: 23.1, 23.2, 23.3, OPS-09_
  - [x] 4.3 Property test P1-4: clean text is unchanged, and redaction is idempotent.
    - _Requirements: 23.6_

- [x] 5. Gateway: pure core
  - [x] 5.1 Write `src/gateway/types.ts` and `src/gateway/assemble.ts`. Unit-test that empty kinds are left out, that the repair turn goes last, and that tool schemas serialise with sorted keys.
    - _Requirements: 9.1, 10.1, 10.2, 10.3_
  - [x] 5.2 Write `src/gateway/estimate.ts` with `promptTokenEstimate`, using the integer 2/5 divisor, image allowances that never count image bytes, and the segment and request allowances. Unit-test a text-only prompt, an image prompt, and a model with no image allowance.
    - _Requirements: 12.5, D-60_
  - [x] 5.3 Add `worstCaseMicros` and `reservedTokens`, pricing input at the dearer of the input and cache-write rates. They live in `src/money.ts` beside the other price arithmetic, not in a separate `gateway/price.ts`.
    - _Requirements: 12.1, 13.1, 17.3, D-60, D-63_
  - [x] 5.4 Write `src/gateway/plan.ts` with `planAttempts` (skip reasons `killed`, `prompt_too_long`, `no_image_allowance`, `judge_excluded`) and `nextMove` (the decision table for `retry-same`, `switch` and `stop`). Unit-test each row of both tables.
    - _Requirements: 12.5, 12.6, 12.7, 14.1 to 14.4, 14.6, 14.8, 14.9, 14.10, 15.1, 19.7, 19.8, D-70_
  - [x] 5.5 Write `src/gateway/structured.ts` with `parseStructured`, which handles a bare value or one code fence, and the repair message builder. Unit-test valid JSON, fenced JSON, invalid JSON and a schema miss.
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 5.6 Write `src/gateway/fake.ts` with `createFakeProvider` (all six outcome kinds, request recording, token-count fixture replay, `fake:` IDs only) and `fakeModelRegister()`.
    - _Requirements: 24.1, 24.2, 24.3, 24.5, D-50, D-64_

- [x] 6. Database
  - [x] 6.1 Write the eight `bones` tables in `src/db/schema.ts` with `pgSchema("bones")`, `bigint` money and `timestamptz` times. Run `pnpm db:generate` to create migration 0001, and check that `0000_init.sql` is byte-for-byte unchanged.
    - _Requirements: 21.1, 21.2, 21.3_
  - [x] 6.2 Update `src/db/migrate.test.ts`. Replace the "exactly one migration" case with "0000 unchanged, 0001 present", and check that all eight tables exist after migrating, on PGlite and on `TEST_DATABASE_URL`.
    - _Requirements: 21.4_

- [x] 7. Trace: spans
  - [x] 7.1 Write `src/trace/trace.ts`:
    - trace and span IDs;
    - `withTrace` and `span` over `AsyncLocalStorage`;
    - the root span attributes;
    - redaction of the whole span before each insert into `bones.spans`;
    - a stderr line without attribute values when a write fails.

    Test on PGlite: nesting, IDs, root attributes, a planted email gone from the stored row, and a failing insert that lets the task go on.
    - _Requirements: 22.1, 22.2, 22.7, 22.8, 22.9_

- [x] 8. Gateway: I/O
  - [x] 8.1 Write `src/gateway/spend.ts`: the conditional insert-or-update Reservation, settlement and release on `bones.spend`. Test the cap boundary, release, settlement above the Reservation, and 10 parallel Reservations against one cap on PGlite that never take the total above it.
    - _Requirements: 13.3, 13.4, 13.5, 13.6_
  - [x] 8.2 Write `src/gateway/gateway.ts` with `createGateway` and the scoped gateway:
    - provider registry check;
    - step-name check;
    - assemble → estimate → plan;
    - Budget and workspace Reservations before any vendor call;
    - the attempt loop with `nextMove`, waiting on the injected clock, and timeouts of min(step timeout, remaining time) with abort;
    - one repair call;
    - cost on settle, with the overrun and `prompt_limit_exceeded` flags;
    - attempt spans with every attribute of 22.3 to 22.5, plus `ossuary.retry`;
    - `killPrimary`, `revivePrimary` and `killedVendors` behind `DEMO_MODE`.

    Unit-test each criterion the properties don't cover.
    - _Requirements: 9.7, 11.2, 11.3, 11.4, 12.2, 12.4, 12.6 to 12.10, 13.1, 13.2, 13.7, 14.1 to 14.10, 15.1 to 15.4, 16.5, 16.7, 22.3, 22.4, D-66, D-70_
  - [x] 8.3 Property test 5: a Primary failure returns the Fallback's complete result or a typed error, never a partial result. There is at most one switch and at most one retry per vendor, waits stay within the Retry wait, and the span records the fallback and its reason.
    - _Requirements: 14.11_
  - [x] 8.4 Write `src/gateway/providers/classify.ts` with the failure classes and `Retry-After` parsing (seconds, HTTP date, the vendor's millisecond variant, missing, garbage). Unit-test each case.
    - _Requirements: 9.1, D-70_
  - [x] 8.5 Write `src/gateway/providers/anthropic.ts`:
    - a pure `buildRequest` in the Vendor cache order, with tools first and a 5-minute `cache_control` on the Stable prefix's last block;
    - `output_config.effort` and `max_tokens`;
    - a pure `readUsage` that sums the three input counts;
    - `maxRetries: 0`, and the key read at call time;
    - a `client` failure for image parts.

    Write mapping tests with the SDK's HTTP layer stubbed. If the installed SDK's types lack a field, pass it through extra body with a comment.
    - _Requirements: 9.2 to 9.6, 9.8, 9.9, D-65_
  - [x] 8.6 Write `src/gateway/providers/openai.ts`:
    - a pure `buildRequest` with tools first, then the first `developer` message, never `instructions` (D-69);
    - `prompt_cache_options: { mode: "explicit", ttl: "30m" }` and a breakpoint on the Stable prefix's last block;
    - `reasoning.effort` and `max_output_tokens`;
    - a pure `readUsage` (total input, `cached_tokens`, `cache_write_tokens`);
    - `maxRetries: 0`;
    - a `client` failure for image parts.

    Write mapping tests with the HTTP layer stubbed.
    - _Requirements: 9.2 to 9.6, 9.8, 9.9, D-65, D-69_
  - [x] 8.7 Property test 6: each adapter's request body follows its Vendor cache order. Each item appears once, the breakpoint ends the Stable prefix, and requests that differ only in the turn give byte-identical Stable prefixes.
    - _Requirements: 10.4_
  - [x] 8.8 Write `src/gateway/fixtures/token-corpus.ts`, covering every text kind of 25.5 with no model names. Commit an empty `fixtures/token-counts.json` (`[]`). Write `src/gateway/calibration.ts` with `estimateCalibration()`.
    - _Requirements: 12.14, 24.6, 25.5, D-71_
  - [x] 8.9 Property test P1-5: the estimate never undercounts a recorded count. With no recordings, register a skipped test titled `P1-5 not calibrated: …` and print the same line. With some, run on them and print `P1-5 partly calibrated: missing …`.
    - _Requirements: 12.11, 12.12, 12.13, 24.7_
  - [x] 8.10 Write `src/gateway/providers/vendors.smoke.ts`:
    - load the root `.env`, and skip with the `OSSUARY_SMOKE` message unless it is `1`;
    - per vendor with a key: one check call (32-token cap, lowest-output-price tier model), then a recording over the corpus that replaces only that vendor's fixture entries;
    - print the calibration status, and skip a vendor without a key with a line naming its variable.

    Confirm it never runs under `pnpm verify`.
    - _Requirements: 25.1 to 25.5, 24.6, 24.7, D-71_

- [x] 9. Harness
  - [x] 9.1 Write `src/harness/budget.ts`: caps from `limits`, an injected clock, Active time across restarts, `startStep`, `reserve`, `settle`, `release`, `remainingMs`, `check`, overrun refusal, and the read-only view. Unit-test each cap kind and the overrun path.
    - _Requirements: 17.1 to 17.6, 17.8, 13.7, D-53, D-67_
  - [x] 9.2 Write `src/harness/task-state.ts`: the Zod `TaskState` schema, and save and load with the JSON round-trip check that raises `TaskStateError`.
    - _Requirements: 20.2, 20.3, 20.6_
  - [x] 9.3 Write `src/harness/define-app.ts` with `defineApp({ dir, pattern, models? })`. It checks, in order:
    - the pattern is built;
    - the pattern matches the Policy;
    - every model Step has a routing entry;
    - action Steps are rejected;
    - exactly one judge entry exists;
    - the judge's Primary differs from the generator's.

    It also builds the Run context. Unit-test every rejection.
    - _Requirements: 16.1 to 16.4, 16.6, 18.2, 19.5, 19.6, D-54, D-66_
  - [x] 9.4 Write `src/harness/run-task.ts` and `src/harness/pipeline.ts`:
    - insert the task row;
    - open the root trace;
    - run each Step in a child span;
    - save state after each Step;
    - resume a `running` task, and return a stored result for a Terminal status;
    - map `BudgetExceeded` to `stopped` (recording kind, limit and used on the task span) and other errors to `failed` (class and redacted message).

    Test on PGlite.
    - _Requirements: 17.7, 18.1, 18.3, 20.1, 20.4, 20.5, 20.6, 23.4, D-52, D-68_
  - [x] 9.5 Write `src/harness/generate-evaluate.ts`: rounds, recording the generate Step's Served models and passing them as exclusions to the evaluate Step, the verdict schema, `maxRounds` (default 3, range 1 to 10), and `generate#r` and `evaluate#r` state entries for resume.
    - _Requirements: 19.1 to 19.4, 19.7_
  - [x] 9.6 Property test 2: no task's steps, tokens, Active time or spend ever exceed their caps. A charge that would exceed one stops the task with `BudgetExceeded`, and no vendor request is made for it.
    - _Requirements: 17.9_
  - [x] 9.7 Property test P1-2: no completed evaluate call is served by the same model as its round's generate call.
    - _Requirements: 19.9_
  - [x] 9.8 Property test P1-3: task state round-trips unchanged, and a task interrupted after any Step and then resumed matches an uninterrupted run, with no Step run twice.
    - _Requirements: 20.7_
  - [x] 9.9 Property test 8: after a task runs on PGlite with a fake that echoes its prompt, no stored span holds a planted email or phone number, as written or with separators stripped.
    - _Requirements: 23.5_

- [x] 10. Public entry
  - [x] 10.1 Fill `src/index.ts` with every export of Requirement 1.1, plus `fakeModelRegister`, `estimateCalibration`, `killPrimary`, `revivePrimary` and `killedVendors` through the gateway object. Add a test that each listed name is exported, and check that `package.json` still exports only `"."` and that `pnpm lint:boundaries` exits 0.
    - _Requirements: 1.1 to 1.5, 12.14, D-55, D-64_

- [x] 11. Echo (`apps/echo`)
  - [x] 11.1 Create the package:
    - `package.json` (name `echo`; scripts `typecheck`, `lint`, `test` and `task`);
    - `tsconfig.json`;
    - a `turbo.json` like Exhume's;
    - `product.yaml` (GEN-A1-R1) and `routing.yaml` (`generate` on small, `evaluate` on mid with `role: judge`), from the design;
    - `prompts/generate.md` and `prompts/rubric.md`.
    - _Requirements: 26.1, 26.7, D-61_
  - [x] 11.2 Write `src/domain/word-limit.ts`, a pure 25-word check with a unit test, and `src/domain/app.ts`, the `generateEvaluate` App definition. A failed word check returns a failing verdict without calling the judge.
    - _Requirements: 26.2, HAR-06_
  - [x] 11.3 Write `src/cli.ts` for `task [--fake] [--workspace <id>] "<topic>"`:
    - load `.env`, and exit 1 naming `DATABASE_URL` when it is unset;
    - create the database and migrate it;
    - build the gateway: real adapters, or the fake provider with `fakeModelRegister()` under `--fake`;
    - run the task, and print the seven fields of 26.3.

    Test the missing-`DATABASE_URL` exit.
    - _Requirements: 26.3, 26.4, 26.5, D-51_
  - [x] 11.4 Write `src/echo.e2e.test.ts` on `pglite://memory` with the fake provider. It checks every point of 26.6.
    - _Requirements: 26.6_

- [x] 12. Verification and close
  - [x] 12.1 Run `env -u DATABASE_URL -u ANTHROPIC_API_KEY -u OPENAI_API_KEY pnpm verify` and check that it exits 0. In its output, check for the `P1-5 not calibrated` line and for each property's test name. Check that every property file carries its `// Feature:` comment and runs at least 100 cases.
    - _Requirements: 24.4, 27.1, 27.2, 27.5, 12.12_
  - [x] 12.2 Against your local PostgreSQL, run `pnpm db:migrate`, then `pnpm --filter echo task --fake "a lighthouse keeper"`, then `select name, attributes->>'gen_ai.operation.name' from bones.spans where trace_id = '<printed id>' order by start_time`. Paste the CLI output and the query result into `docs/kiro-log.md`.
    - _Requirements: 21.5, 26.3, 26.4, exit criterion "trace in local PostgreSQL"_
  - [x] 12.3 Only when `.env` holds an API key: check this with `grep -cE '^(ANTHROPIC|OPENAI)_API_KEY=.+' .env`, which shows no values. Then run `OSSUARY_SMOKE=1 pnpm --filter @ossuary/skeleton smoke`, commit the updated `token-counts.json`, rerun `pnpm verify` to see P1-5 run on the recordings, and run `pnpm --filter echo task "a lighthouse keeper"` without `--fake`. With no key, record in `docs/kiro-log.md` that this step was skipped. Calibration is a Phase 4 exit criterion (D-71). The key check found neither key, so the live run was skipped.
    - _Requirements: 25.1 to 25.4, D-71_
  - [x] 12.4 Run `pnpm bones` to refresh the README table. Add the Phase 1 entry to `CHANGELOG.md` (harness added, evals not run, cost per Echo task if 12.3 ran) and the session notes to `docs/kiro-log.md`. Check with `git status --short` that every changed path is one Requirement 27.3 allows, and that no Phase 2 to 5 module was started.
    - _Requirements: 27.3, 27.4_
  - [x] 12.5 Invoke the `judge` agent to review every acceptance criterion against the code and the test output. Fix each finding before marking Phase 1 done.
    - _Requirements: all_
