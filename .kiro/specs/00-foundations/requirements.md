# Requirements: 00-foundations (Phase 0)

## Introduction

Phase 0 sets up the Ossuary repository so that later phases can build the skeleton and the two apps inside fixed rails. It delivers the monorepo and toolchain, a local Postgres with Drizzle, the root scripts (`pnpm verify`, `pnpm lint:boundaries`, `pnpm bones`), the threshold guard, CI, the whole `.kiro/` layer (steering, hooks, agents, MCP settings), the volatile `models.yaml`, a stub Render Blueprint, and a voice spike server for measuring ElevenLabs Custom LLM latency.

Phase 0 builds no skeleton module and no app behaviour. Those belong to Phases 1 to 5 (plan §10).

Each acceptance criterion is written in EARS and tagged in brackets with the framework rule or plan section it serves. Plan sections are written `Plan §n`. Correctness properties for this phase are numbered `P0-n`, so they don't collide with properties 1 to 12 in plan §11.

## Glossary

- **Repo**: the Ossuary monorepo rooted at the workspace folder.
- **Skeleton package**: the workspace package `@ossuary/skeleton` in `packages/skeleton/`.
- **App folder**: any direct child directory of `apps/` (today `apps/exhume` and `apps/seance`).
- **Provider directory**: `packages/skeleton/src/gateway/providers/` and everything below it.
- **Vendor SDK**: an npm package whose purpose is calling a hosted model vendor's API. The list is kept in one place inside the boundary lint (Requirement 7).
- **Boundary lint**: the script run by `pnpm lint:boundaries`.
- **Bones counter**: the script run by `pnpm bones`.
- **Bone line**: a line in a counted TypeScript file that holds at least one token that is neither whitespace nor a comment.
- **Test file**: a file whose name matches `*.test.*` or `*.spec.*`, or any file under a `__tests__/` directory.
- **Bones markers**: the exact strings `<!-- bones:start -->` and `<!-- bones:end -->` in the root `README.md`.
- **Guard script**: `scripts/guard-thresholds.mjs`.
- **Hook payload**: the JSON object Kiro writes to a PreToolUse command hook's stdin, carrying `tool_name` and `tool_input`.
- **Protected threshold file**: any path whose normalized form ends in the segments `evals/thresholds.yaml` (glob `**/evals/thresholds.yaml`).
- **Protected task path**: the directory `evals/tasks` at any depth, or any path below it (glob `**/evals/tasks/**`).
- **Normalized path**: a path with backslashes turned into forward slashes, any drive letter or UNC host prefix removed, `.` and `..` segments resolved, repeated slashes collapsed, and letters compared case-insensitively.
- **Threshold check**: the pull-request CI job that compares `thresholds.yaml` files between the base and head of a pull request.
- **Voice spike server**: `scripts/voice-spike-server.ts`.

## Requirements

### Requirement 1: Source documents in docs/

**User Story:** As the builder, I want the plan and the framework spec at the paths the plan names, so that steering file references and `#plan` / `#framework` resolve.

#### Acceptance Criteria

1. THE Repo SHALL contain `docs/implementation-plan.md`, `docs/framework-spec.md` and `docs/kiro-prompts.md`. [Plan §1 step 2, Plan §4, D-02]
2. THE Repo SHALL NOT keep the root copies `Ossuary — Implementation Plan.md` and `framework-spec.md`. [DOS-03, D-02]
3. THE Repo SHALL hold a `docs/decisions.md` that records every decision taken in this spec, and WHERE `docs/decisions.md` differs from the plan, `docs/decisions.md` SHALL govern. [Framework §1 SHOULD departures, D-01]

### Requirement 2: Monorepo and toolchain

**User Story:** As the builder, I want one strict TypeScript monorepo, so that the skeleton, the apps, the scripts and their tests share one toolchain.

#### Acceptance Criteria

1. THE Repo SHALL be a pnpm workspace whose members are `packages/*`, `apps/*` and `scripts`. [Plan §4]
2. THE Repo SHALL run the workspace tasks `typecheck`, `lint`, `test` and `build` through Turborepo. [Plan §4]
3. THE Repo SHALL declare `engines.node` as `">=24 <25"`, hold `24` in `.nvmrc`, and pin the pnpm version in `packageManager`, so that CI, local runs and Render use the same major version. [Plan §4, D-14]
4. THE Repo SHALL compile every TypeScript package with `strict: true` through one shared base `tsconfig` that each package extends. [Plan §4]
5. THE Repo SHALL provide Vitest and fast-check to every workspace package that has tests, and one ESLint flat config at the root using typescript-eslint. [Plan §4, Plan §11]
6. WHEN `pnpm install --frozen-lockfile` runs on a clean checkout, THE Repo SHALL install without error from the committed `pnpm-lock.yaml`. [Plan §11 CI]

### Requirement 3: Folder layout

**User Story:** As a judge, I want the repository to show the plan's structure from day one, so that I can see where each later phase will land.

#### Acceptance Criteria

1. THE Repo SHALL contain the folders of the plan §4 tree: `.kiro/{steering,specs,hooks,agents,settings}`, `packages/skeleton/src/{manifest,gateway,gateway/providers,harness,guard,evals,trace,mcp,ui,db,blob}`, `packages/create-ossuary`, `apps/exhume` and `apps/seance` (each with `src/app`, `src/domain`, `prompts`, `skills`, `evals/{tasks,graders,results}` and `fixtures`), `power/`, `docs/` and `scripts/`. [Plan §4]
2. THE Skeleton package SHALL be named `@ossuary/skeleton`, SHALL have `src/index.ts` as its only entry point, and SHALL list only `"."` in its `package.json` `exports`. [ARCH-02, Plan §6]
3. THE Repo SHALL define `apps/exhume` and `apps/seance` as workspace packages named `exhume` and `seance`, and `packages/create-ossuary` as `create-ossuary`, each with a `src/index.ts` that holds no runtime behaviour. [Plan §4, Plan §12]
4. WHERE a folder from criterion 1 has no files yet, THE Repo SHALL keep it in git with a `.gitkeep` file. [DOS-03]
5. THE Repo SHALL NOT contain skeleton module code other than `createDb` and the migration runner in `src/db/` (Requirement 5), app product files (`product.yaml`, `routing.yaml`, `THREATS.md`), eval tasks or `thresholds.yaml` files in this phase. [Plan §10 rows 1 to 5]

### Requirement 4: Licence, README, CHANGELOG and .gitignore

**User Story:** As a judge, I want a licensed, readable repo with `.kiro/` committed, so that the Skeleton Crew rules are met.

#### Acceptance Criteria

1. THE Repo SHALL contain the standard MIT licence text in `LICENSE` at the root, with the copyright line `Copyright (c) 2026 <NAME>`. [Plan §2 DoD, Plan §13, D-19]
2. THE Repo SHALL contain a root `README.md` stub that holds each Bones marker exactly once, with the start marker before the end marker. [Plan §2 DoD]
3. THE Repo SHALL contain a root `CHANGELOG.md` with a title heading. [Plan §4, framework §5 artifact 15]
4. THE Repo SHALL contain a root `.gitignore` that ignores dependency folders, build output, Turborepo cache, coverage, local database data and `.env` files other than `.env.example`. [SEC-03]
5. THE `.gitignore` SHALL NOT ignore `.kiro/` or any path below it. [Plan §13]

### Requirement 5: Postgres and Drizzle

**User Story:** As the builder, I want a working Drizzle setup that runs on a Postgres server or in-process PGlite, so that Phase 1 can add the `bones` schema without setup work and nothing local needs Docker.

#### Acceptance Criteria

1. THE Repo SHALL NOT need Docker for any local command: install, `pnpm verify`, tests, `pnpm db:migrate`, `pnpm bones`, `pnpm lint:boundaries` and `pnpm spike:voice`. [Plan §12 local development, D-35]
2. THE Repo SHALL read database credentials from environment variables, with development values documented in `.env.example` and no credential committed elsewhere. [SEC-03]
3. THE Skeleton package SHALL hold a Drizzle configuration whose schema file is `packages/skeleton/src/db/schema.ts` and whose migrations folder is `packages/skeleton/src/db/migrations/`. [Plan §4, Plan §6]
4. THE migrations folder SHALL contain exactly one migration, numbered 0000, with no SQL statements, plus the Drizzle journal that registers it. [Plan §10 row 0]
5. THE Skeleton package SHALL provide `createDb(url)` in `packages/skeleton/src/db/`, which returns a Drizzle database on PGlite for `pglite://memory` (in memory) or `pglite://<folder>` (stored in that folder), and on node-postgres for `postgres://` and `postgresql://` URLs, and SHALL reject any other URL with an error that names the accepted forms. [Plan §6 db, Plan §12, D-35]
6. WHEN `pnpm db:migrate` runs with `DATABASE_URL` set to a reachable Postgres, THE Repo SHALL apply all pending migrations and exit 0. [Plan §12 local development]
7. IF `pnpm db:migrate` runs while `DATABASE_URL` is unset or empty, THEN THE Repo SHALL exit non-zero with a message naming the missing variable. [SEC-03]
8. WHEN the database tests run, THE Repo SHALL apply all migrations to `createDb('pglite://memory')` and check that each one is recorded; WHERE `TEST_DATABASE_URL` is set, THE Repo SHALL also run the same tests against that server. [Plan §11 CI, D-35]
9. THE Repo SHALL keep a `docker-compose.yml` with one `db` service on the `postgres:16` image, a named volume, a health check, port 5432 bound to `127.0.0.1` only, and no default password, plus a root `.dockerignore`. [Plan §4, D-30, D-35]
10. THE Repo SHALL NOT run Docker on the development machine; the compose file is checked in CI only. [D-35]

### Requirement 6: pnpm verify

**User Story:** As the builder, I want one command that proves the repo is healthy, so that CI and I run the same checks.

#### Acceptance Criteria

1. WHEN `pnpm verify` runs, THE Repo SHALL run typecheck, ESLint, the Boundary lint and the tests of every workspace package, and SHALL exit non-zero if any of them fails. [Plan §11 commands, EVAL-06]
2. THE `pnpm verify` script SHALL NOT run evals in this phase. [Plan §10 row 2]
3. WHEN `pnpm verify` runs on the Phase 0 repo, THE Repo SHALL exit 0. [Plan §10 row 0 exit criteria]

### Requirement 7: Boundary lint

**User Story:** As the builder, I want a lint that blocks vendor SDK imports outside the gateway providers and deep imports into the skeleton, so that apps stay thin and the model stays a replaceable part.

#### Acceptance Criteria

1. WHEN `pnpm lint:boundaries` runs, THE Boundary lint SHALL scan every `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` file in the Repo except those under `node_modules`, `dist`, `.next`, `.turbo` and `coverage`. [MODEL-01]
2. THE Boundary lint SHALL treat each of these as an import: static `import` (including `import type`), `export ... from`, dynamic `import()`, `require()`, and `import x = require()`. [MODEL-01, ARCH-02]
3. THE Boundary lint SHALL keep its Vendor SDK list in one place, matching exact package names and scope prefixes, and SHALL cover at least `@anthropic-ai/*`, `openai`, `@openai/*`, `@google/genai`, `@google/generative-ai`, `@google-cloud/vertexai`, `@mistralai/*`, `cohere-ai`, `groq-sdk`, `@ai-sdk/*`, `@aws-sdk/client-bedrock-runtime`, `@huggingface/inference` and `together-ai`, including subpaths of each. [MODEL-01]
4. IF a scanned file outside the Provider directory imports a Vendor SDK, THEN THE Boundary lint SHALL report the file, the line and the import specifier, and SHALL exit 1. [MODEL-01, ARCH-02, Plan §4]
5. IF any scanned file imports the ElevenLabs server SDK (`@elevenlabs/elevenlabs-js`, the deprecated `elevenlabs` package, or any `@elevenlabs/*` or `@11labs/*` package other than the browser SDK), THEN THE Boundary lint SHALL report it and exit 1. The skeleton's voice adapter in `packages/skeleton/src/harness/voice/` fetches signed URLs with plain `fetch`. [SEC-03, ARCH-02, D-18]
6. IF a file outside `apps/seance/src/app/` imports the ElevenLabs browser SDK (`@elevenlabs/react` or `@elevenlabs/client`, the packages the current ElevenLabs Agents docs recommend), THEN THE Boundary lint SHALL report it and exit 1. [SEC-03, D-18]
7. IF a file inside an App folder imports a module that resolves anywhere inside `packages/skeleton/` (its `src/`, its build output or any other file), or imports a subpath of `@ossuary/skeleton` that the Skeleton package's `exports` does not list, THEN THE Boundary lint SHALL report the file, the line and the specifier, and SHALL exit 1. [ARCH-02, Plan §1 house rules, D-22]
8. WHILE no scanned file breaks criteria 4 to 7, THE Boundary lint SHALL exit 0 and print the number of files scanned. [MODEL-01]
9. **Property P0-4:** FOR ALL generated file paths, import forms and restricted package specifiers, THE Boundary lint SHALL report the import if and only if the file lies outside the locations its rule allows: the Provider directory for model Vendor SDKs, nowhere for the ElevenLabs server SDK, and `apps/seance/src/app/` for the ElevenLabs browser SDK. [MODEL-01, D-18]
10. **Property P0-5:** FOR ALL generated App folder files and specifiers, THE Boundary lint SHALL report a skeleton import if and only if the specifier resolves inside `packages/skeleton/` or is an unexported `@ossuary/skeleton` subpath; a bare `@ossuary/skeleton` import SHALL never be reported. [ARCH-02]

### Requirement 8: Bones counter

**User Story:** As a judge, I want the README to show how much of each app is its own code, so that I can see each app is a thin layer on one skeleton.

#### Acceptance Criteria

1. WHEN `pnpm bones` runs, THE Bones counter SHALL count Bone lines in `packages/skeleton` and in each App folder. [Plan §2 DoD, Plan §11]
2. THE Bones counter SHALL count only `.ts`, `.tsx`, `.mts` and `.cts` files, and SHALL skip Test files, `.d.ts` files and anything under `node_modules`, `dist`, `.next`, `.turbo` and `coverage`. [Plan §2 DoD]
3. THE Bones counter SHALL write a Markdown table with the columns Package, Bone lines and App-specific share, listing the skeleton first and then the App folders in alphabetical order, where an app's share is its lines divided by its lines plus the skeleton's lines, rounded to a whole percent, and shown as `—` for the skeleton row or when the divisor is zero. [Plan §2 DoD]
4. WHEN the Bones counter writes the table, THE Bones counter SHALL replace only the text between the Bones markers and SHALL leave every byte outside them unchanged. [Plan §9 bone-count hook]
5. IF the new README content equals the current content, THEN THE Bones counter SHALL NOT write the file. [Plan §9 bone-count hook]
6. IF either Bones marker is missing, appears more than once, or the end marker comes first, THEN THE Bones counter SHALL print the reason, leave the README unchanged and exit 1. [Plan §9]
7. **Property P0-6:** FOR ALL generated source files, adding blank lines, comment-only lines or Test files SHALL NOT change a package's count, and the count of a package SHALL equal the sum of the counts of its files. [Plan §2 DoD]
8. **Property P0-7:** FOR ALL generated READMEs that hold valid Bones markers and all generated tables, rewriting SHALL preserve the text outside the markers exactly, and rewriting twice with the same counts SHALL give the same result as rewriting once. [Plan §9]

### Requirement 9: Threshold guard script

**User Story:** As the builder, I want the agent blocked from loosening eval thresholds or deleting eval tasks, so that a run can't be made to pass by editing the bar.

#### Acceptance Criteria

1. WHEN the Guard script runs, THE Guard script SHALL read one Hook payload from stdin. [Plan §9 hooks]
2. IF the Hook payload's `tool_input` writes, creates, appends to, edits, deletes, or moves to or from a Protected threshold file, THEN THE Guard script SHALL print to stderr a reason naming the path and the rule, and SHALL exit 2. [Framework §3.4, Framework §8.3, Plan §9]
3. IF the Hook payload's `tool_input` writes to, edits, appends to, deletes or moves away a Protected task path that already exists on disk, THEN THE Guard script SHALL print to stderr a reason naming the path, and SHALL exit 2. Creating a new file inside a Protected task path SHALL pass, so eval tasks are append-only. [EVAL-06, EVAL-08, Plan §9, D-32]
4. IF the Hook payload's `tool_input` holds a shell command that names a Protected threshold file together with any operation other than a known read-only one, or that deletes, moves, edits or redirects into an existing Protected task path, THEN THE Guard script SHALL print the reason to stderr and exit 2. [Plan §9, D-05, D-24]
5. THE Guard script SHALL compare paths in their Normalized path form. [Plan §9]
   - IF a payload deletes or moves away a directory that currently holds a Protected threshold file or a Protected task path at any depth, THEN THE Guard script SHALL treat it as criterion 2 or 3 and exit 2. [EVAL-08, D-27]
6. IF stdin is not valid JSON, or the payload lacks a string `tool_name` or an object `tool_input`, THEN THE Guard script SHALL exit 2 and print to stderr what could not be parsed (the parse error or the missing field, and the first 200 characters of stdin) and a pointer to `docs/decisions.md`. [SEC-02, D-06]
7. WHEN none of criteria 2, 3, 4 or 6 applies, THE Guard script SHALL exit 0 and print nothing to stdout. [Plan §9]
8. THE Repo SHALL include tests that pipe sample Hook payloads for each built-in file-write, file-delete, file-move and shell tool into the Guard script as a child process and assert its exit code and stderr. [Plan §9]
9. **Property P0-1:** FOR ALL generated paths that normalize to a Protected threshold file, written with any mix of separators, case, `.` and `..` segments and absolute prefixes, every mutating tool payload SHALL make the Guard script exit 2. [Framework §3.4]
10. **Property P0-2:** FOR ALL generated paths that normalize to an existing Protected task path, every write, edit, append, delete or move-away payload SHALL make the Guard script exit 2. [EVAL-08, D-32]
11. **Property P0-3:** FOR ALL generated paths that normalize to neither a Protected threshold file nor a Protected task path, and for all payloads that create a file that does not yet exist inside a Protected task path, the Guard script SHALL exit 0. [Plan §9, D-32]
12. BEFORE Phase 0 closes, THE Repo SHALL hold, as test fixtures, the real payloads Kiro sent for one PostFileSave and for one PreToolUse attempt to write a `thresholds.yaml`, and the tests SHALL run the Guard script on the PreToolUse fixture and expect exit 2. [Plan §9 hook docs check, D-06]
13. THE `docs/decisions.md` file SHALL record the PreToolUse payload shape observed in that capture, and whether exit code 2 blocked the call. [Plan §9, D-06]

### Requirement 10: CI on push

**User Story:** As the builder, I want every push checked the same way I check locally, so that CI catches what file-save hooks miss on manual edits.

#### Acceptance Criteria

1. WHEN any branch is pushed, THE CI SHALL install dependencies with a frozen lockfile on Node 24 and run `pnpm verify`. [Plan §11 CI, EVAL-06]
2. IF `pnpm verify` exits non-zero, THEN THE CI job SHALL fail. [Plan §11 CI]
3. THE CI SHALL NOT read any repository secret in this phase. [SEC-03]
4. WHEN any branch is pushed, THE CI SHALL also run the database tests against a `postgres:16` service container through `TEST_DATABASE_URL`, and SHALL check that `docker-compose.yml` parses with `docker compose config`. [Plan §11 CI, D-35]
5. THE CI SHALL leave the app image build and the compose smoke test to the phases that create the apps (Dockerfiles in Phases 4 and 5, the `apps` profile in Phase 7). [Plan §10 rows 4, 5 and 7, D-35]

### Requirement 11: Threshold check on pull requests

**User Story:** As the builder, I want a pull-request check that fails when a threshold drops, so that the guard has a backstop for manual edits and other agents.

#### Acceptance Criteria

1. THE Repo SHALL define the `thresholds.yaml` format as a YAML mapping from a key to exactly one of `{ min: <number> }` (higher is stricter) or `{ max: <number> }` (lower is stricter), for example `core_pass_k3: { min: 0.85 }`, `safety_failures: { max: 0 }` and `latency_p95_ms: { max: <n> }`, and SHALL document it in `.kiro/steering/evals.md`. [EVAL-04, Framework §8.3, D-17]
2. WHEN a pull request is opened, synchronized, reopened, labelled or unlabelled, THE Threshold check SHALL compare every `**/evals/thresholds.yaml` file between the pull request's base and head. [Plan §9, Plan §11 CI]
3. THE Threshold check SHALL treat as a loosening each of: a `min` that goes down, a `max` that goes up, a key that is removed (including by removing the whole file), and a key that changes direction between `min` and `max`. [Framework §3.4, Framework §8.3, D-17]
4. IF the Threshold check finds a loosening AND the pull request lacks the `thresholds-change` label, THEN THE Threshold check SHALL fail and list each file, key, kind of loosening, old entry and new entry. [Framework §3.4]
5. WHERE the pull request has the `thresholds-change` label, THE Threshold check SHALL pass and list the loosenings it allowed. [Plan §9]
6. IF a `thresholds.yaml` file in base or head fails to parse as YAML or breaks the format of criterion 1, THEN THE Threshold check SHALL fail and name the file and the offending key, whatever the labels. [Plan §9]
7. **Property P0-8:** FOR ALL generated pairs of valid base and head threshold documents, THE Threshold check SHALL report exactly the set of keys that are loosened under criterion 3, each with the right kind, and SHALL report nothing for keys that are added, unchanged, or tightened (a `min` that goes up or a `max` that goes down). [Framework §3.4, D-17]

### Requirement 12: Steering files

**User Story:** As the builder, I want the rules loaded into Kiro automatically or on demand, so that every session follows the plan and the framework.

#### Acceptance Criteria

1. THE Repo SHALL contain the ten steering files of plan §9 in `.kiro/steering/`, with the inclusion modes of that table: `product.md`, `tech.md` and `structure.md` always; `ui.md` on `**/*.tsx`; `security.md` on `packages/skeleton/src/guard/**`, `apps/*/src/domain/**` and `**/tools/**`; `evals.md` on `**/evals/**`; `archetype-ext.md` on `apps/exhume/**`; `archetype-cnv.md` on `apps/seance/**`; `plan.md` and `framework.md` manual. [Plan §9]
2. THE `product.md` file SHALL state what Ossuary is, the two apps, the judging criteria, the four house rules of plan §1, and a fifth house rule: where `docs/decisions.md` differs from the plan, `docs/decisions.md` wins. [Plan §1, Plan §9, D-01]
3. THE `plan.md` file SHALL include the build phases excerpt and point to the full implementation plan and decisions. THE `framework.md` file SHALL include the purpose and core principles excerpt and point to the full framework specification. Both SHALL use manual inclusion. [Plan §9, D-41]
4. THE other steering files SHALL hold the content the plan §9 table assigns them. `archetype-ext.md` and `archetype-cnv.md` SHALL omit the `#[[file:apps/<app>/product.yaml]]` reference until Phases 4 and 5 create those files. [Plan §9, D-04]
5. THE steering files SHALL NOT contain model IDs or prices. [MODEL-07]

### Requirement 13: Hooks

**User Story:** As the builder, I want hooks that run the framework's checks while the agent works, so that violations surface at the moment they happen.

#### Acceptance Criteria

1. THE Repo SHALL contain the five hooks of plan §9 as v1 JSON files in `.kiro/hooks/`: `eval-on-save`, `no-vendor-sdk`, `bone-count`, `guard-thresholds` and `record-on-stop`. [Plan §9]
2. THE `eval-on-save` hook SHALL trigger on PostFileSave with the plan's matcher and run `pnpm eval --changed --sets regression,safety` with a 300-second timeout. [EVAL-06]
3. THE `no-vendor-sdk` hook SHALL trigger on PostFileSave for `\.(ts|tsx)$` and run `pnpm lint:boundaries`. [MODEL-01]
4. THE `bone-count` hook SHALL trigger on PostFileSave for `\.(ts|tsx)$` and run `pnpm bones`. [Plan §2 DoD]
5. THE `guard-thresholds` hook SHALL trigger on PreToolUse for every built-in tool that writes, deletes or moves a file or runs a shell command, and run `node scripts/guard-thresholds.mjs`. [Framework §3.4, Plan §9]
6. THE `record-on-stop` hook SHALL trigger on Stop with an agent prompt that asks for a CHANGELOG entry with eval deltas, cost change and components removed whenever the turn changed prompts, routing, models or harness code. [Framework §15.1 step 6, HAR-04]
7. WHEN a hook command runs a root script that later phases will build, THE Repo SHALL print `not built yet` and exit 0. [Plan §10 row 0]

### Requirement 14: Custom agents

**User Story:** As the builder, I want the agent that writes code kept apart from the agent that grades it, so that the maker never grades its own work.

#### Acceptance Criteria

1. THE Repo SHALL contain `.kiro/agents/maker.json` with the read, write and shell tools; shell limited to `pnpm *` and `git *` with force-push, `git reset --hard` and `git clean` denied; a deny rule for writes to `**/evals/thresholds.yaml`; and the steering files, the implementation plan and `docs/decisions.md` as resources. Eval tasks are append-only for the maker, enforced by the Guard script rather than a path rule. [HAR-02, Plan §9, D-26, D-32]
2. THE Repo SHALL contain `.kiro/agents/judge.json` with the read tool and a shell tool limited to `pnpm verify`, `pnpm eval`, starting an app with `pnpm --filter <app> dev` or `start`, and `curl` to `localhost` or `127.0.0.1` only; no write tool; the same resources plus the spec files; and a prompt that reviews a finished task against its EARS requirements by running the app and evals and reports gaps without editing files. [HAR-02, Plan §9, D-33]
3. THE agent files SHALL NOT contain model IDs. [MODEL-07]

### Requirement 15: MCP settings for Kiro

**User Story:** As the builder, I want Kiro configured to call both apps' MCP servers, so that later phases can test the agent interface from the IDE.

#### Acceptance Criteria

1. THE Repo SHALL contain `.kiro/settings/mcp.json` with a server `exhume` at `http://localhost:3001/api/mcp` and a server `seance` at `http://localhost:3002/api/mcp`. Kiro refuses agent writes under `.kiro/settings/`, so the builder creates this file from the content in the design. [INT-01, Plan §9, D-20]
2. THE MCP settings SHALL send `Authorization: Bearer` with the key read from the `OSSUARY_MCP_KEY` environment variable and SHALL NOT contain a literal key. [SEC-03, INT-08]
3. WHILE the app servers are not built, THE MCP settings SHALL mark both servers disabled; Phase 3 enables them. [Plan §10 row 3, D-10]

### Requirement 16: models.yaml

**User Story:** As the builder, I want one volatile register for models and prices, so that a vendor change touches one file.

#### Acceptance Criteria

1. THE Repo SHALL contain a root `models.yaml` matching the plan §5 block: the tiers `small`, `mid` and `frontier`, each with a `primary` and a `fallback` written as `vendor:model-id`, the plan's primary IDs, and `<id>` placeholders for the fallbacks. [MODEL-02, MODEL-03, MODEL-07, Plan §5]
2. THE `models.yaml` file SHALL contain an empty `prices` block with a comment giving the expected fields per model and the requirement to record the source date. [MODEL-07, ECON-06]
3. THE Repo SHALL NOT contain model IDs or prices in any file other than `models.yaml` and the two source documents in `docs/`. [MODEL-07, Plan §1 house rules]

### Requirement 17: Render Blueprint stub

**User Story:** As the builder, I want the deploy file in place early, so that Phases 4 and 5 only fill in build commands.

#### Acceptance Criteria

1. THE Repo SHALL contain a root `render.yaml` with the two web services, the database and the environment group of plan §12. [Plan §12]
2. THE `render.yaml` file SHALL NOT contain secret values; every key variable SHALL use `sync: false`. [SEC-03]

### Requirement 18: AGENTS.md

**User Story:** As the builder, I want other coding agents pointed at the same rules, so that the repo stays consistent whoever writes the code.

#### Acceptance Criteria

1. THE Repo SHALL contain a root `AGENTS.md` of three lines that points to `.kiro/steering/`. [Framework §5, Plan §9]

### Requirement 19: Decision record and Kiro log

**User Story:** As the builder, I want the decision record and the Kiro log started, so that every phase has a place to record what happened.

#### Acceptance Criteria

1. THE Repo SHALL contain `docs/decisions.md` with one numbered entry (`D-nn`) per decision taken in this spec, each giving the decision, the reason and the plan section it overrides if any; the one-time PostgreSQL-in-WSL setup from plan §12; a section explaining how to run the Voice spike server and point an ElevenLabs Custom LLM at it through a tunnel; a section for the observed hook payload shape; and an empty heading for the measured spike latency. [Framework §1 SHOULD departures, Plan §10 row 0, D-01]
2. THE Repo SHALL contain `docs/kiro-log.md` with headings only. [Plan §1 step 6]

### Requirement 20: Voice spike server

**User Story:** As the builder, I want a stub OpenAI-compatible endpoint, so that I can measure ElevenLabs Custom LLM latency through a tunnel before Séance exists.

#### Acceptance Criteria

1. WHEN the Voice spike server receives `POST /v1/chat/completions` with `"stream": true`, THE Voice spike server SHALL respond 200 with `text/event-stream`, send a fixed reply as `chat.completion.chunk` events (a first chunk with the assistant role, content chunks, and a last chunk with `finish_reason: "stop"`), and end with `data: [DONE]`. [HAR-09, UX-07, Plan §8 voice setup]
2. WHEN the Voice spike server receives `POST /v1/chat/completions` without `"stream": true`, THE Voice spike server SHALL respond 200 with one `chat.completion` JSON object holding the same fixed reply. [Plan §8 voice setup]
3. WHEN the Voice spike server finishes a request, THE Voice spike server SHALL log one line with the time received, milliseconds to first byte, milliseconds to last byte, the stream flag and the number of messages, and SHALL NOT log message content. [UX-07, OPS-09]
4. IF a request uses another method or path, THEN THE Voice spike server SHALL respond 404; IF the body is not valid JSON, THEN it SHALL respond 400. [Plan §8]
5. WHERE `VOICE_LLM_SECRET` is set, IF a request's `Authorization` header is not `Bearer` followed by that secret, THEN THE Voice spike server SHALL respond 401. [SEC-03, Plan §8 voice setup]
6. WHERE `SPIKE_FIRST_TOKEN_DELAY_MS` is set, THE Voice spike server SHALL wait that many milliseconds before sending the first content chunk. [UX-07]
7. THE Voice spike server SHALL use only Node built-in modules, call no model and import no Vendor SDK. [MODEL-01]
8. WHEN `pnpm spike:voice` runs, THE Repo SHALL start the Voice spike server on the port in `PORT`, defaulting to 8787. [Plan §10 row 0]

### Requirement 21: Phase scope

**User Story:** As the builder, I want Phase 0 to stay inside its row of the plan, so that later specs own their modules.

#### Acceptance Criteria

1. THE Repo SHALL NOT export any skeleton module API from `packages/skeleton/src/index.ts` in this phase; `createDb` stays internal to the skeleton until Phase 1 decides the public `db` export. [Plan §10, D-35]
2. THE Repo SHALL NOT include any Vendor SDK as a dependency in this phase. [MODEL-01, Plan §10 row 1]

## Exit criteria mapping

| Plan §10 row 0 exit criterion | Requirements |
| --- | --- |
| CI green on empty packages | 2, 3, 5, 6, 10 |
| A hook fires on a test save | 13 (checked by saving a `.ts` file and seeing `no-vendor-sdk` and `bone-count` run) |
| Steering shows in Kiro | 12 (checked by you in the steering panel) |
| Voice spike server runs locally | 20 (checked with `curl` against `pnpm spike:voice`) |
| Spike latency in `docs/decisions.md` | 19 leaves the heading; the measurement needs your ElevenLabs account and a tunnel |

No Phase 0 exit criterion needs Docker (D-35).
