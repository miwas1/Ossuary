# Decisions

Where this file differs from `docs/implementation-plan.md`, this file wins (D-01).

Each entry gives the decision, the reason, and the plan section it overrides, if any. Status is **approved** (you approved it) or **proposed** (in a spec stage awaiting your approval).

## Phase 0: 00-foundations

### D-01 This file wins over the plan
- Status: approved (requirements round).
- Decision: where `docs/decisions.md` differs from the plan, the decision governs. `product.md` carries this as house rule 5.
- Reason: the plan is fixed at its first export; decisions change as the build goes on.

### D-02 Source documents live in docs/
- Status: approved.
- Decision: the plan, the framework spec and `kiro-prompts.md` live in `docs/`. The two root copies (`Ossuary — Implementation Plan.md`, `framework-spec.md`) were moved into `docs/`; the newest plan and `kiro-prompts.md` were copied from Downloads.
- Overrides: nothing; this follows plan §1 step 2.

### D-03 maker.json has no model field
- Status: approved.
- Decision: neither custom agent names a model; Kiro uses the model selected in the IDE.
- Reason: model names live only in `models.yaml` (MODEL-07, house rule 3).
- Overrides: plan §9 maker example (`"model"`).

### D-04 Archetype steering files omit the product.yaml link for now
- Status: approved.
- Decision: `archetype-ext.md` and `archetype-cnv.md` leave out `#[[file:apps/<app>/product.yaml]]`. Phase 4 restores it in `archetype-ext.md` once `apps/exhume/product.yaml` exists, and Phase 5 restores it in `archetype-cnv.md` once `apps/seance/product.yaml` exists.
- Reason: the files don't exist yet, so the link would be broken.
- Overrides: plan §9 steering example.

### D-05 The guard hook covers write, delete, move and shell tools
- Status: approved.
- Decision: the PreToolUse guard runs for every built-in tool that writes, deletes or moves a file or runs a shell command, not only the `write` category. Matching shell commands is best effort; the pull-request threshold check is the backstop.
- Overrides: plan §9 hook table (matcher `write`).

### D-06 The guard fails closed on unreadable payloads
- Status: approved, with two conditions.
- Decision: if stdin isn't valid JSON, or `tool_name` or `tool_input` is missing, the guard exits 2.
- Condition 1: the block message says what couldn't be parsed (the JSON error or the missing field, plus the first 200 characters of stdin) and points to this file.
- Condition 2: before Phase 0 closes, one real file save and one real attempted write to a `thresholds.yaml` are triggered from Kiro, the actual payloads are saved as test fixtures, and the payload shape is recorded under "Hook payload shape" below.

### D-07 Skeleton subpath imports only through exports
- Status: approved.
- Decision: the boundary lint allows `@ossuary/skeleton/<subpath>` only when the skeleton's `package.json` `exports` lists it. Today it lists only `.`.

### D-08 pnpm verify runs the boundary lint
- Status: approved.
- Decision: `pnpm verify` = boundary lint + typecheck + ESLint + tests. No evals until Phase 2.

### D-09 The PR threshold check has a property test
- Status: approved.
- Decision: P0-8 covers the threshold comparison, since it states an invariant.

### D-10 MCP servers are disabled until Phase 3
- Status: approved.
- Decision: both servers in `.kiro/settings/mcp.json` carry `"disabled": true`. Phase 3 enables them.

### D-11 Phase 0 additions the plan doesn't name
- Status: approved.
- Decision: `scripts/` is a private workspace package. The phase also adds `scripts/lint-boundaries.ts`, `scripts/check-thresholds.ts`, a root `pnpm eval` placeholder that prints "not built yet", an empty `create-ossuary` package, a `power/` placeholder and a root `CHANGELOG.md`.

### D-12 Voice spike server extras
- Status: approved.
- Decision: an optional `VOICE_LLM_SECRET` bearer check (the server sits on a public tunnel), an optional `SPIKE_FIRST_TOKEN_DELAY_MS`, a non-streaming reply for `curl`, and logs that hold timings and counts but never message text.

### D-13 Definition of a bone line
- Status: approved.
- Decision: a line counts when at least one token on it is neither whitespace nor a comment. The count skips test files (`*.test.*`, `*.spec.*`, `__tests__/`) and `.d.ts`.

### D-14 Node 24 everywhere
- Status: approved.
- Decision: `.nvmrc` holds `24` and `engines.node` is `">=24 <25"`, so CI, local runs and Render match. pnpm enforces the range, and the catalog pins Node 24 types.

### D-15 Docker doesn't block Phase 0
- Status: superseded by D-35.
- Decision (original): the compose file and the empty migration are written now and run as soon as `docker` works in WSL.

### D-16 Git and GitHub
- Status: approved.
- Decision: `git init -b main` in the workspace (done). You create an empty public GitHub repo and give the remote URL. The repo's `LICENSE` file lets GitHub detect MIT. The `gh` CLI is installed if possible, and you authenticate it so CI can be watched.

### D-17 Threshold direction is explicit
- Status: approved.
- Decision: each `thresholds.yaml` entry is `{ min: <n> }` (higher is stricter) or `{ max: <n> }` (lower is stricter). For example `core_pass_k3: { min: 0.85 }`, `safety_failures: { max: 0 }`, `latency_p95_ms: { max: <from the spike> }`.
- Without the `thresholds-change` label, the PR check fails when any of these happens:
  - a `min` goes down;
  - a `max` goes up;
  - a key is removed;
  - a key changes direction.
- P0-8 covers all four cases.
- Overrides: plan §9 and §11 ("fails if any value drops").

### D-18 ElevenLabs SDKs
- Status: approved.
- Decision: the ElevenLabs server SDK (`@elevenlabs/elevenlabs-js`) is on the blocked list. The skeleton's voice adapter in `packages/skeleton/src/harness/voice/` fetches the signed URL with plain `fetch`.
- The browser SDK is allowed only under `apps/seance/src/app/`. The current ElevenLabs Agents docs recommend `@elevenlabs/react`, which re-exports `@elevenlabs/client`.
- Sources: [ElevenLabs Agents JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script), [@elevenlabs/client on npm](https://www.npmjs.com/package/@elevenlabs/client), [@elevenlabs/elevenlabs-js on npm](https://www.npmjs.com/package/@elevenlabs/elevenlabs-js).

### D-19 Licence holder
- Status: approved.
- Decision: `Copyright (c) 2026 <NAME>`.

### D-20 Create .kiro/settings/mcp.json outside Kiro
- Status: approved (design round).
- Decision: Kiro restricts agent writes under `.kiro/settings/`. Codex populated the file from the Phase 0 design and enabled the repository test for the required localhost URLs, disabled flags and environment reference. [Kiro permissions docs](https://kiro.dev/docs/permissions/)

### D-21 The ElevenLabs server SDK is blocked everywhere
- Status: approved (design round).
- Decision: the server SDK, the deprecated `elevenlabs` and `@11labs/*` packages, and any `@elevenlabs/*` package other than `@elevenlabs/react` and `@elevenlabs/client` are blocked in every folder, including `gateway/providers/`.
- Reason: the providers folder is for model vendors, and D-18 chose plain `fetch`.

### D-22 The deep-import check covers all of packages/skeleton/
- Status: approved (design round).
- Decision: an app import that resolves anywhere inside `packages/skeleton/` (not only `src/`) is a violation.
- Reason: a relative import into `dist/` bypasses the public entry just as one into `src/` does.

### D-23 The guard has no dependencies and no bypass
- Status: approved (design round).
- Decision: `guard-thresholds.mjs` uses only Node built-ins. An internal error exits 2. The only override is turning the hook off in Kiro's Agent Hooks panel; there is no environment-variable escape hatch, because the agent could set one.

### D-24 Guard shell analysis
- Status: approved (design round).
- Decision: a shell command that names a threshold file is blocked unless it is a known read-only command (`git add` and `git commit` count as read-only) and has no redirect into the file. The same applies to a command naming an existing task file (D-32). A command naming a directory that contains task paths is blocked only if it deletes or moves.

### D-25 Guard hook matcher
- Status: approved (design round).
- Decision: the matcher is the regex `write|append|replace|delete|relocate|rename|move|bash|shell|exec`, matched against tool IDs.

### D-26 Agent shell limits
- Status: approved (design round).
- Decision: shell limits are enforced with deny rules that exclude the allowed commands. maker also denies `git push --force`, `git reset --hard` and `git clean`. judge denies every file write and reads `.kiro/specs/**/*.md` as a resource.

### D-27 Deleting a directory with protected files inside is blocked
- Status: approved (design round).
- Decision: deleting or moving a directory blocks if, on disk, it holds a `thresholds.yaml` or an `evals/tasks/` folder at any depth. If the scan hits its size limit, the guard blocks.

### D-28 tsx and a pnpm catalog
- Status: approved (design round).
- Decision: TypeScript scripts run with `tsx`. Shared dev-tool versions are pinned once in the `pnpm-workspace.yaml` catalog.

### D-29 thresholds.yaml is flat
- Status: approved (design round).
- Decision: a threshold file is a flat key → `{min}`/`{max}` mapping. Nested groups, extra keys and numeric strings are format errors, which fail the PR check whatever the labels.

### D-30 No default database password
- Status: approved (design round).
- Decision: `docker-compose.yml` needs a `.env` copied from `.env.example` and has no fallback password.

### D-31 drizzle.config.ts sits at the skeleton package root
- Status: approved (design round).
- Decision: the config file is `packages/skeleton/drizzle.config.ts`. The schema and migrations stay in `packages/skeleton/src/db/`.
- Reason: drizzle-kit looks for the config at the package root, and tooling stays out of the bone count.
- Overrides: the Phase 0 brief ("Drizzle configured in packages/skeleton/src/db").

### D-32 Eval tasks are append-only for the maker
- Status: approved (from the updated plan §9).
- Decision: the maker can add a new file under `evals/tasks/` but can't change, move or delete an existing one. The guard enforces this by checking on disk whether the target exists. maker.json keeps a `fs_write` deny only for `**/evals/thresholds.yaml`, because a path glob can't tell new files from existing ones.
- Reason: changing a gold label to match a wrong output is the maker grading its own work. Adding regression tasks is required by EVAL-08.
- Overrides: the original plan §9 deny on all of `**/evals/tasks/**`, and the earlier design, which let writes to existing task files through.

### D-33 The judge can run the apps
- Status: approved (from the updated plan §9).
- Decision: the judge's shell allows `pnpm verify`, `pnpm eval`, `pnpm --filter <app> dev` or `start`, and `curl` to `localhost` or `127.0.0.1`. Extra deny rules block a second URL, `@file` uploads and output files on curl. Every other command and every file write is denied.
- Overrides: the original plan §9 limit to `pnpm verify` and `pnpm eval`.

### D-34 Plan updates adopted as written
- Status: approved (from the updated plan).
- Decision: `models.yaml` follows the updated plan §5 block, which moves Opus 5.5 to a mid-tier note and puts a different frontier primary in place. `docker-compose.yml`'s service is named `db`. A root `.dockerignore` is added. Apps get `api/health` and a `Dockerfile` in Phases 4 and 5.

### D-35 No Docker on the development machine
- Status: approved.
- Decision: there is no Docker on this machine and there won't be. Nothing in the local loop may need it, and no docker command is run here.
- Local database: PostgreSQL installed in WSL by you (plan §12), reached through `DATABASE_URL` in `.env`. Nothing waits for it.
- Tests, `pnpm verify` and CI run on PGlite through `createDb('pglite://memory')`. `createDb` also accepts `pglite://<folder>` for a PGlite database on disk, and uses node-postgres for `postgres://` URLs (D-37). `createDb` is built in Phase 0 inside `packages/skeleton/src/db/`, kept internal to the skeleton until Phase 1 decides the public `db` export.
- `pnpm eval` (Phase 2) uses `DATABASE_URL` when set and in-memory PGlite otherwise, and always writes the results JSON files as well.
- Docker stays supported, because this is a reusable skeleton:
  - `docker-compose.yml` keeps the `db` service on `postgres:16` (D-30 still applies).
  - Phases 4 and 5 add a Dockerfile per app: multi-stage, Next.js standalone output, a non-root user, and a healthcheck on `/api/health`.
  - Phase 7 adds an `apps` profile, so `docker compose --profile apps up` runs both apps against the `db` service.
- CI checks what this machine can't. From Phase 0, the database tests also run against a Postgres 16 service container through `TEST_DATABASE_URL`, and `docker compose config` checks that the compose file parses. Once the apps exist, a job builds both images and smoke-tests the compose stack.
- `render.yaml` pins `postgresMajorVersion: "16"` so production matches the CI service container.
- Docker is dropped from every Phase 0 exit criterion.
- Overrides: D-15; plan §4 and §12 wherever they make Docker Compose the local default.

### D-36 Spike server smoke test
- Status: approved (tasks round).
- Decision: the voice spike server gets a small Vitest test on an ephemeral port (chunk order, `[DONE]`, 401 with a secret, no message text in logs), in addition to the manual `curl` check, so `pnpm verify` covers it.

### D-37 node-postgres driver and file-backed PGlite
- Status: approved (from the updated docs/kiro-prompts.md, Prompt 0).
- Decision: `createDb` uses node-postgres (`pg`) for `postgres://` URLs, not postgres.js, and accepts `pglite://<folder>` as well as `pglite://memory`. The one-time PostgreSQL-in-WSL setup is written up in this file.
- Overrides: the earlier design, which used postgres.js and memory-only PGlite.

### D-38 TypeScript 6.0.3, not 7
- Status: approved (task 1.2; forced by the toolchain).
- Decision: the catalog pins `typescript` to 6.0.3. The npm `latest` tag is 7.0.2, the native port.
- Reason: typescript-eslint 8.74 supports TypeScript `>=4.8.4 <6.1.0`, and the boundary lint and bones counter parse files with the TypeScript compiler API (`ts.createSourceFile`).
- Revisit when typescript-eslint supports 7.

### D-39 Local environment answers
- Status: approved (your answers after the tasks round).
- PostgreSQL: keep the PostgreSQL 18 that Ubuntu 26.04 installed. The CI Postgres 16 job catches version-specific SQL; production stays on 16.
- Node: nvm's default stays 24, matching the repo pin. Hooks run in a fresh shell on the default Node.
- gh CLI: not installed. You create the `thresholds-change` label in the GitHub UI and watch CI there.

### D-40 Hooks load at session start; payload capture runs in the next session
- Status: approved (task 11.2).
- Decision: the five hooks were created with Kiro's hook tool as v1 JSON in `.kiro/hooks/`. Kiro loads them at the next session start, so they can't fire in the session that created them. The real payload capture (task 12.2) and the hook-fires-on-save check (task 12.1) therefore run in a fresh session.
- Two temporary hooks, `capture-pretooluse.json` and `capture-postfilesave.json`, save payloads to `/tmp/ossuary-hook-capture` with `scripts/capture-hook-payload.mjs`. The guard hook itself stays unchanged. Both temporary hooks are deleted once the fixtures are saved.

### D-41 Manual steering inlines excerpts

- Decision: keep manual inclusion for `plan.md` and `framework.md`. Inline the build phases and the framework’s opening sections respectively, and direct Kiro to read the full source documents for the task at hand.
- Reason: Kiro IDE 1.5.44 showed “Reference cut short” for both whole-document references in the workspace steering panel.
- Overrides: the two whole-document references in plan §9.

## Phase 1: 01-skeleton-core

All approved in the requirements round (26 Nov 2026). The spec is `.kiro/specs/01-skeleton-core/requirements.md`.

### D-42 Two approval values beyond the plan's Policy type
- Status: approved.
- Decision: `approval` values are `forbidden`, `approve`, `auto-with-undo` and `auto`. A0 uses `forbidden` for both reversible and irreversible actions; A3 and A4 use `auto` for irreversible actions.
- Reason: the plan type has no value for "no actions" or for unattended irreversible actions.
- Overrides: plan §5 `Policy` type.

### D-43 A0 products set their own threshold
- Status: approved.
- Decision: A0 has no numeric default bar (framework §8.3: "above the target set at G1"), so an A0 product must set `release.threshold` in `product.yaml` or it fails to load.
- Séance (CNV-A0-R2) starts in Phase 5 with a provisional threshold and raises it after its first baseline run. Raising is always allowed (D-44).
- Overrides: plan §5 autonomy table.

### D-44 Overrides only raise, through a release block
- Status: approved.
- Decision: overrides come from an optional `release: { threshold }` block in `product.yaml`. A threshold below the autonomy default is a load error, not clamped. The measure can't be overridden.
- Overrides: plan §5 `resolvePolicy(code, raise?)`.

### D-45 Workspace daily cap in product.yaml
- Status: approved.
- Decision: `limits.max_workspace_spend_usd_per_day` is a required `product.yaml` field. The global `DAILY_SPEND_CAP_USD` and the per-workspace demo counts (20 documents, 3 sessions) stay in Phase 7.
- Overrides: plan §5 `limits`, plan §12.

### D-46 Spend in integer micro-dollars
- Status: approved.
- Decision: spend is stored and compared as integer micro-dollars. Call costs round up; caps round down. `models.yaml` prices take an optional `cache_write_input` for vendors that charge more for cache writes; without it, cache writes are priced at `input`.
- Overrides: plan §5 `prices`; extends the tech.md money rule.

### D-47 Non-standard trace attributes use the ossuary. prefix
- Status: approved.
- Decision: attributes OpenTelemetry GenAI doesn't define are named `ossuary.*`, so the plan's `gen_ai.fallback=true` becomes `ossuary.fallback=true`. A name that would extend another attribute's name uses an underscore instead of a dot (`ossuary.fallback_reason`, `ossuary.prompt_limit_exceeded`), because OpenTelemetry advises against an attribute name that is also a namespace. GenAI names follow the current semantic-conventions registry (for example `gen_ai.provider.name`, not `gen_ai.system`). [Registry](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/registry/attributes/gen-ai.md)
- Overrides: plan §6 gateway behaviour.

### D-48 Anthropic and OpenAI adapters; every fallback is OpenAI
- Status: approved.
- Decision: Phase 1 ships Anthropic and OpenAI adapters. Every tier's fallback in `models.yaml` is an OpenAI model. There is no Google adapter in Phase 1; the provider interface stays open for one later.
- Overrides: plan §5 `models.yaml` (Google fallbacks for small and frontier), plan §10 row 1.

### D-49 No price, no call
- Status: approved.
- Decision: the gateway never calls a model without a `prices` entry, and `models.yaml` fails to load if a tier model has none.
- Prices were filled on 26 Nov 2026 from the standard-tier tables at the [Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing) and the [OpenAI pricing page](https://developers.openai.com/api/docs/pricing). The one value you marked to check, the cached-input price of the small fallback, was read from the OpenAI page the same day ($0.01 per million, short context).
- Overrides: plan §6 gateway behaviour.

### D-50 The fake provider is public
- Status: approved.
- Decision: `createFakeProvider` is exported from `@ossuary/skeleton` so app tests can use it. `fake:*` model IDs and prices in tests and the fake provider don't count as model IDs under MODEL-07.

### D-51 Echo has a --fake mode
- Status: approved.
- Decision: `pnpm --filter echo task --fake "<topic>"` runs on the fake provider, so the "trace in local PostgreSQL" check needs no API keys.

### D-52 What redaction covers
- Status: approved.
- Decision: redaction applies to spans (attributes, events, errors) and to error messages on task rows. It removes email addresses, phone numbers (including Nigerian formats) and secret values (OPS-09). Task inputs and saved task state are not redacted, because a task must resume from its real data.
- Follow-up: since task inputs and saved state stay unredacted, Phase 7 adds a retention purge for them (OPS-09).
- Overrides: plan §6 trace.

### D-53 The time cap counts active time
- Status: approved.
- Decision: `max_seconds` counts active time summed across restarts, so a task resumed the next day doesn't stop at once and a restart doesn't reset the clock.

### D-54 pipeline rejects action steps until Phase 2
- Status: approved.
- Decision: until Phase 2's approval gate exists, a `pipeline` with a step of kind `action` fails at definition time (fail closed).

### D-55 The public db export
- Status: approved.
- Decision: `@ossuary/skeleton` exports `createDb`; migrations run through its handle's `migrate()`. This settles the Phase 1 forward note.

### D-56 Four phase-local properties
- Status: approved.
- Decision: besides plan §11 properties 1, 2, 5, 6 and 8, Phase 1 tests P1-1 (each code axis drives only its own Policy fields), P1-2 (judge and generator never share a served model), P1-3 (task state round trip and resume equivalence), P1-4 (redaction leaves clean text alone and is idempotent) and P1-5 (the prompt token estimate never undercounts a recorded real count, added with D-60).

### D-57 Missing THREATS.md fails the load
- Status: approved.
- Decision: `loadProduct` fails when the Policy requires a threat model (R2, R3) and the app has no `THREATS.md`. Echo is R1 and is unaffected.

### D-58 YAML schemas reject unknown keys
- Status: approved.
- Decision: `product.yaml`, `routing.yaml` and `models.yaml` schemas are strict, so a misspelt field fails at load time. Later phases add fields as they need them.

### D-59 Step timeout and output cap in routing.yaml
- Status: approved.
- Decision: model steps take optional `timeout_ms` (1,000 to 300,000, default 30,000) and `max_output_tokens` (1 to 64,000, default 1,024). The time and spend reservations need both.
- Overrides: plan §5 `routing.yaml`.

### D-60 Prompt limits, cache-write lifetimes and image allowances
- Status: approved (your D-49 answer, revised after the second requirements round).
- Prompt limit: a `models.yaml` price entry may set `max_prompt_tokens`, the largest prompt its prices cover (the vendors charge long-context rates above it). A model with no `max_prompt_tokens` has no limit.
- Estimate: the gateway checks a prompt token estimate against each candidate model's limit: UTF-8 text bytes divided by 2.5 and rounded up, plus a per-segment allowance, plus one image allowance per image. Image bytes are never counted. The first version counted one token per byte, which refused Haiku prompts at about 25,000 real tokens.
- Routing: a prompt over the primary's limit but within the fallback's goes to the fallback without contacting the primary, recorded as `ossuary.fallback=true` and `ossuary.fallback_reason=prompt_too_long`. A prompt that fits no candidate is refused with `PromptTooLongError` before any reservation or vendor contact. A repair call that its served model can't take ends in `StructuredOutputError`.
- Overrun flag: if a response reports more input tokens than the served model's limit, its span gets `ossuary.prompt_limit_exceeded=true`, so it shows on `/bones`. The call is still charged at the listed prices.
- Evidence: property P1-5 checks that the estimate is never below the input tokens a real vendor reported for any prompt in the committed token-count fixtures. The smoke test's recording (D-71) is the only way to write those fixtures. If P1-5 fails, the divisor goes down; recorded counts are never edited.
- Reservations: the token and spend reservations use the same estimate plus the call's output cap (your design-round answer). P1-5 is what shows the estimate is an upper bound. One token per byte would make tasks hit `max_tokens` on reservations alone when the real call fits. If a real count ever exceeds the estimate, the overrun path (Requirement 13.7) charges the actual cost and stops further charges on that task.
- Cache writes: every cache write is priced at the lifetime the gateway requests. The Anthropic adapter requests 5 minutes and the OpenAI adapter 30 minutes, and `cache_write_input` in `models.yaml` holds the price for that lifetime. The OpenAI 30-minute write prices (sol 2.50, astra 10.00, luna 0.125 per million) were added from the [OpenAI pricing page](https://developers.openai.com/api/docs/pricing) on 26 Nov 2026.
- Images: in Phase 4 the skeleton resizes every image to a fixed maximum size before it reaches the gateway, and each image counts as the model's `image_input_tokens` allowance from `models.yaml`. Phase 1 builds only the estimator's image path and the optional field. With no allowances set, every image call fails closed, and the vendor adapters reject image parts until Phase 4 builds image sending. The maximum size and the allowance values are Phase 4 decisions.
- Overrides: plan §5 `prices`, plan §6 gateway behaviour.

### D-61 Turbo cache inputs include the manifests
- Status: approved.
- Decision: root `turbo.json` lists `models.yaml` in `globalDependencies`, so a change to it reruns every task. Each app's `turbo.json` extends the root and adds `product.yaml`, `routing.yaml` and `evals/**` to the inputs of its `test` and `eval` tasks, alongside `$TURBO_DEFAULT$`. The root `turbo.json` gains an `eval` task definition for this. Echo gets the same `turbo.json`.
- Reason: during the requirements round `pnpm verify` replayed every task from cache after a `models.yaml` edit, so the change was never tested.
- Overrides: the Phase 0 `turbo.json`.

### D-62 Prices as integer pico-dollars per token
- Status: approved (design round).
- Decision: prices are held as integer pico-dollars per token (one dollar per million tokens is one micro-dollar per token, times 10⁶). `models.yaml` prices may therefore have at most six decimals, and the schema rejects more. Costs use BigInt and round up to a micro-dollar. Caps are converted with an epsilon snap, so 0.57 becomes 570,000 micro-dollars, not 569,999.
- Extends: D-46.

### D-63 Worst-case reservations price input at the dearer rate
- Status: approved (design round).
- Decision: the spend reservation prices every estimated input token at the higher of `input` and `cache_write_input`, because a cold cache writes the whole prefix.
- Overrides: Requirement 13.1 as first written (input price only).

### D-64 A fake model register from the skeleton
- Status: approved (design round).
- Decision: the skeleton exports `fakeModelRegister()`, and `defineApp` accepts a parsed `models` object, so Echo's `--fake` mode and app tests need no fake entries in `models.yaml`.
- Extends: D-50, D-51.

### D-65 Each adapter follows its vendor's cache order; Property 6 tests the adapters
- Status: approved (design round), with your change to Property 6.
- Decision: each vendor adapter lays out its request in that vendor's cache-prefix order, with one breakpoint at the end of the stable prefix:
  - Anthropic: tool schemas in `tools`, then the system prompt, Skills and reference documents as `system` blocks, then the turn as `messages`. Anthropic builds its cache prefix as tools, then system, then messages ([Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).
  - OpenAI: tool schemas in `tools`, then the first `developer` message (D-69), then the turn. OpenAI's cache routing hashes the initial tokens, including tool definitions ([OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)).
- Property 6 checks each adapter's request body against its own vendor order, the breakpoint position, and byte-identical stable prefixes for requests that differ only in the turn. It does not check the plan's literal list (system, Skills, tools, reference, turn). The vendor-neutral assembled prompt keeps that list as its segment order, and the adapters reorder.
- Overrides: plan §6 gateway behaviour and plan §11 property 6 wording; MODEL-05's list is applied per vendor.

### D-66 A step may call only its own routing entry
- Status: approved (design round).
- Decision: a scoped gateway call may name only the running step's routing entry. This stops a generate step from calling the judge route, and a code step from calling any model.

### D-67 Where the time cap is checked
- Status: approved (design round).
- Decision: the time cap is checked before each step and each call, by aborting in-flight calls, and through `ctx.budget.check()`. A code step that does neither can overrun until it returns.

### D-68 One runner per task
- Status: approved (design round).
- Decision: concurrent resumes of the same task are not guarded against in Phase 1.

### D-69 The OpenAI system prompt goes in the first developer message
- Status: approved (design round).
- Decision: the OpenAI adapter puts the system prompt, Skills and reference documents in the first `developer` message and never uses the top-level `instructions` field. Newer OpenAI models append `instructions` after the input and bill it uncached on every request ([OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)).

### D-70 Rate limits trigger the fallback, with one bounded retry
- Status: approved (your answer to the design's Q-1).
- Decision: HTTP 429 and the vendor's overloaded status are classed `rate_limited`, a fallback trigger like 5xx and timeouts.
- Retry: if the response's `Retry-After` delay is within the step's allowed wait and the task's remaining time, the gateway waits and retries the same model once. Otherwise, or when `Retry-After` is missing, it goes straight to the fallback with `ossuary.fallback_reason=rate_limited`.
- Allowed wait: `routing.yaml` model steps take `max_retry_wait_ms`, an integer from 0 to 2,000 with a default of 2,000 (batch steps). Realtime steps set 0; Séance's `respond` does so in Phase 5.
- Limit: no vendor is retried more than once per call. A call makes at most two attempts per vendor, four in all, and switches to the fallback at most once. The same rule applies to a rate-limited fallback.
- Overrides: Requirement 14 as first written (429 was a `client` failure); extends D-59.

### D-71 No keys needed in Phase 1; calibration closes Phase 4
- Status: approved (design round).
- Decision: the skeleton builds and passes `pnpm verify` with no API keys. With no recorded token counts, P1-5 is skipped and `pnpm verify` prints a `P1-5 not calibrated` line. With some recordings but not all, P1-5 runs on what exists and prints `P1-5 partly calibrated`, naming the missing vendor and tier pairs. `estimateCalibration()` exposes the same status, so `/bones` can show it from Phase 3.
- Recording: whenever the smoke test runs (`OSSUARY_SMOKE=1`) with a vendor key in the environment or `.env`, it also records that vendor's token counts and replaces that vendor's fixture entries. There is no separate recording switch.
- Exit criterion: being fully calibrated moves from Phase 1 (Requirement 27.5 as first written) to Phase 4, the first phase where an app calls a real model.

## Forward notes for later phases

- Phase 2: `pnpm eval` database selection and JSON results (D-35).
- Phase 3: enable both MCP servers in `.kiro/settings/mcp.json` (D-10); show the token-estimate calibration status from `estimateCalibration()` on `/bones`, with a "not calibrated" notice when there are no recordings (D-71).
- Phase 4: restore `#[[file:apps/exhume/product.yaml]]` in `archetype-ext.md` (D-04); add `apps/exhume/Dockerfile` and `api/health` (D-35); choose the image maximum size, build the resize step and image sending in both adapters, and set `image_input_tokens` per model in `models.yaml` with its source (D-60); exit criterion: the token-count fixtures are fully calibrated and P1-5 passes on them, which needs one smoke run with both API keys (D-71).
- Phase 5: restore `#[[file:apps/seance/product.yaml]]` in `archetype-cnv.md` (D-04); add `apps/seance/Dockerfile` and `api/health` (D-35); allow `@elevenlabs/react` under `apps/seance/src/app/` only (D-18); give Séance a provisional `release.threshold` and raise it after the first baseline run (D-43); set `max_retry_wait_ms: 0` on Séance's realtime `respond` step (D-70).
- Phase 7: the compose `apps` profile and the CI image-build and compose smoke-test job (D-35); a retention purge for task inputs and saved task state (D-52, OPS-09).

## Local PostgreSQL in WSL

One-time setup from plan §12. Nothing in tests, `pnpm verify` or CI needs it; they run on PGlite.

1. Install and start PostgreSQL inside WSL:
   ```bash
   sudo apt update && sudo apt install -y postgresql
   sudo service postgresql start
   ```
   Ubuntu 26.04 installs PostgreSQL 18 (24.04 installs 16). This machine runs 18 on port 5432 (D-39).
2. Create a role and a database:
   ```bash
   sudo -u postgres createuser --createdb --pwprompt ossuary
   sudo -u postgres createdb -O ossuary ossuary
   ```
3. Put the URL in `.env` (git-ignored), then migrate:
   ```bash
   DATABASE_URL=postgres://ossuary:<password>@localhost:5432/ossuary
   pnpm db:migrate
   ```
4. WSL may not start services when it boots. If the apps can't connect after a restart, run `sudo service postgresql start` again.
5. If you can't install packages in WSL, point `DATABASE_URL` at a small hosted development database (Render Postgres) instead.

With Docker on another machine: copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`, and run `docker compose up db`.

## Voice spike: how to run

The spike server (`scripts/voice-spike-server.ts`) is a stub OpenAI-compatible `POST /v1/chat/completions`. It returns a fixed reply, calls no model, and logs one JSON timing line per request. It never logs message text or headers.

**Start it**

```bash
VOICE_LLM_SECRET=<any long random string> pnpm spike:voice   # PORT defaults to 8787
# optional: SPIKE_FIRST_TOKEN_DELAY_MS=400 to simulate a slow first token
```

**Check it locally**

```bash
curl -N http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $VOICE_LLM_SECRET" -H "Content-Type: application/json" \
  -d '{"model":"spike","stream":true,"messages":[{"role":"user","content":"hello"}]}'
```

You should see `chat.completion.chunk` events (the assistant role first, then the words, then `finish_reason: "stop"`) and `data: [DONE]`. Drop `"stream":true` for a single `chat.completion` object.

**Expose it through a tunnel**

- ngrok: `ngrok http 8787`, then use the `https://<id>.ngrok-free.app` URL it prints.
- Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:8787`, then use the `https://<name>.trycloudflare.com` URL it prints.

**Point ElevenLabs at it**

1. In ElevenLabs Agents, create an agent and set its LLM to **Custom LLM**.
2. Server URL: `https://<tunnel-host>/v1`. ElevenLabs appends `/chat/completions`.
3. API key: create a secret holding the same value as `VOICE_LLM_SECRET`; ElevenLabs sends it as `Authorization: Bearer <value>`.
4. Use the standard voice pipeline. A Custom LLM can't be combined with ElevenLabs' Realtime models (plan §8).
5. Talk to the agent from the ElevenLabs test page and watch the server's log.

**Read the log**

Each line is JSON: `{at, method, path, status, stream, messages, first_byte_ms, first_content_ms, last_byte_ms}`. The times are measured inside the server from the moment the request arrives. The server's own time is tiny, so the latency you hear is mostly ElevenLabs' speech-to-text, the tunnel round trip and text-to-speech. Note the time from the end of your speech to the first audio for at least 10 turns, and record the p50 and p95 under "Voice spike latency" below. That p95 becomes Séance's `latency_p95_ms: { max: <n> }` in Phase 5.

## Hook payload shape

Filled in by the payload capture task (D-06, D-40) in the next Kiro session. Until then the guard assumes the shape in Kiro's hook docs: `{ hook_event_name, cwd, session_id, tool_name, tool_input }` on stdin, with exit 2 blocking the call.

## Voice spike latency

Local check, no tunnel (25 Nov 2026): the stub answered a streamed request with first byte at 2.7 ms, first content at 3.1 ms and last byte at 4.6 ms, so the server adds almost nothing to the voice path.

`{"method":"POST","path":"/v1/chat/completions","status":200,"stream":true,"messages":1,"first_byte_ms":2.7,"first_content_ms":3.1,"last_byte_ms":4.6}`

ElevenLabs through a tunnel (p50 and p95, end of speech to first audio, 10 or more turns): pending a live ElevenLabs session.
