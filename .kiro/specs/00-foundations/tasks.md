# Tasks: 00-foundations (Phase 0)

Order follows plan §10: config and types first, then pure logic with its property tests, then I/O, then the Kiro layer and the exit-criteria proof. Each task names the requirements it serves. Property tests (P0-n) are required, not optional.

No task runs a docker command on this machine (D-35). Hooks are created after the scripts they call exist, so a half-built hook never gates later tasks.

- [ ] 1. Toolchain and workspace
  - [ ] 1.1 Install Node 24 with nvm and confirm `node -v` reports v24 inside the repo (`nvm use` reads `.nvmrc`).
    - _Requirements: 2.3_
  - [ ] 1.2 Write the root config: `package.json` (scripts table from the design, `engines.node ">=24 <25"`, `packageManager` pinned), `pnpm-workspace.yaml` with the catalog, `engineStrict` and `allowBuilds`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.nvmrc`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 1.3 Write `.gitignore` (no `.kiro` entry), `.dockerignore`, `.env.example` (WSL `DATABASE_URL` form, `POSTGRES_*` values, empty lines for later secrets), `LICENSE` (MIT, `Copyright (c) 2026 <NAME>`), `CHANGELOG.md`, the `README.md` stub with the bones markers and a Docker-free quick start, and the three-line `AGENTS.md`.
    - _Requirements: 4.1–4.5, 5.2, 18.1_
  - [ ] 1.4 Create the plan §4 folder tree with `.gitkeep` in empty folders, including `packages/skeleton/src/harness/voice/`. Add `package.json`, `tsconfig.json` and an `export {};` `src/index.ts` for `@ossuary/skeleton` (exports `"."` only), `create-ossuary`, `exhume` and `seance`, and the private `@ossuary/scripts` package.
    - _Requirements: 3.1–3.5, 21.1_
  - [ ] 1.5 Run `pnpm install`, commit `pnpm-lock.yaml`, and check `pnpm install --frozen-lockfile` and `turbo run typecheck lint test` pass on the empty packages.
    - _Requirements: 2.6, 6.3_

- [ ] 2. Database (PGlite for tests, WSL PostgreSQL for you, no Docker)
  - [ ] 2.1 Add `drizzle-orm`, `pg` and `@electric-sql/pglite` to the skeleton and `drizzle-kit` and `@types/pg` as dev dependencies. Write `packages/skeleton/drizzle.config.ts` and an empty `src/db/schema.ts`.
    - _Requirements: 5.3_
  - [ ] 2.2 Generate the empty migration with `drizzle-kit generate --custom --name=init` and check that the folder holds exactly `0000_init.sql` plus the journal and snapshot.
    - _Requirements: 5.4_
  - [ ] 2.3 Write `src/db/client.ts`: `createDb(url)` for `pglite://memory`, `pglite://<folder>` and `postgres(ql)://` (node-postgres), `migrateDb(handle)`, and the unsupported-scheme error that never echoes the URL. Do not export them from `src/index.ts`.
    - _Requirements: 5.5, 21.1_
  - [ ] 2.4 Write `src/db/migrate.test.ts`: one suite on `pglite://memory`, one on `pglite://<temp folder>` (reopened to check the migration persisted), and one on `TEST_DATABASE_URL` when set. Each checks one recorded migration per journal entry and that a second run adds none. Add a case for the unsupported-scheme error.
    - _Requirements: 5.5, 5.8_
  - [ ] 2.5 Write `src/db/migrate.ts` and the root `db:migrate` script. Test both exits: an empty `DATABASE_URL` (your `.env` today) exits 1 naming the variable, and a connection failure prints host and port only.
    - _Requirements: 5.6, 5.7_
  - [ ] 2.6 Write `docker-compose.yml` with the `db` service on `postgres:16` and no default password. It is not run here; CI checks it in task 9.1.
    - _Requirements: 5.9, 5.10_
  - [ ] 2.7 Write the "Local PostgreSQL in WSL" section of `docs/decisions.md`: the plan §12 one-time setup (install, start, role and database, `DATABASE_URL` in `.env`, restart after a WSL reboot), the note that Ubuntu 26.04 installs PostgreSQL 18, and the hosted-database fallback.
    - _Requirements: 19.1_

- [ ] 3. Threshold guard (`scripts/guard-thresholds.mjs`)
  - [ ] 3.1 Write the pure path functions: `normalizePath` (separators, WSL UNC and drive prefixes, `.`/`..`, case for matching), `isThresholdFile`, `isTaskPath`, `classifyTool`, and the `tool_input` path extraction per tool class. Add `guard-thresholds.d.mts`.
    - _Requirements: 9.2, 9.3, 9.5_
  - [ ] 3.2 Write `decide(stdinText, { cwd, fsProbe })` with the decision table, including append-only task paths (`exists`) and the directory probe (`probeDir`, bounded, fails closed). Wrap it so any internal error exits 2. Write the fail-closed parse message, which says what couldn't be parsed and points to `docs/decisions.md`.
    - _Requirements: 9.2, 9.3, 9.5, 9.6, 9.7_
  - [ ] 3.3 Write `analyseShell`: quote-aware splitting, redirect targets, the read-only allowlist, the delete and move list for directories.
    - _Requirements: 9.4_
  - [ ] 3.4 Property test P0-1: every mutating payload on any spelling of a threshold path exits 2.
    - _Requirements: 9.9_
  - [ ] 3.5 Property test P0-2: every write, edit, delete or move-away on an existing task path exits 2.
    - _Requirements: 9.10_
  - [ ] 3.6 Property test P0-3: unprotected paths and near misses, new files inside a task path, and read-only shell commands all exit 0.
    - _Requirements: 9.11_
  - [ ] 3.7 Write the entry point (stdin, stderr, exit code, `--capture <dir>`) and child-process tests that pipe sample payloads for `fs_write`, `fs_append`, `str_replace`, `delete_file`, `smart_relocate`, `execute_bash` and `control_bash_process`, plus invalid JSON and a missing `tool_input`. Each test asserts the exit code and stderr.
    - _Requirements: 9.1, 9.6, 9.8_

- [ ] 4. Boundary lint (`pnpm lint:boundaries`)
  - [ ] 4.1 Write `scripts/lib/boundaries.ts`: the `RESTRICTED` table (model vendors, ElevenLabs server SDK, ElevenLabs browser SDK), `packageName`, and the AST-based `findImports` for all eight import forms.
    - _Requirements: 7.2, 7.3, 7.5, 7.6_
  - [ ] 4.2 Write `checkFile`, including the skeleton-internals rule (relative paths into `packages/skeleton/`, unexported `@ossuary/skeleton` subpaths).
    - _Requirements: 7.4, 7.5, 7.6, 7.7_
  - [ ] 4.3 Property test P0-4: a restricted import is reported if and only if the file is outside the rule's allowed folder.
    - _Requirements: 7.9_
  - [ ] 4.4 Property test P0-5: an app import is reported if and only if it lands inside `packages/skeleton/` or is an unexported subpath; the bare package never is.
    - _Requirements: 7.10_
  - [ ] 4.5 Write `scripts/lib/walk.ts` and `scripts/lint-boundaries.ts` (report format, file count, exit codes), and check it passes on the repo.
    - _Requirements: 7.1, 7.4, 7.8_

- [ ] 5. Bones counter (`pnpm bones`)
  - [ ] 5.1 Write `countBoneLines` and `isCounted` in `scripts/lib/bones.ts`.
    - _Requirements: 8.1, 8.2_
  - [ ] 5.2 Write `renderTable` and `rewriteReadme`, with unit tests for missing, repeated and reversed markers.
    - _Requirements: 8.3, 8.4, 8.6_
  - [ ] 5.3 Property test P0-6: trivia and test files never change a count, and a package total is the sum of its files.
    - _Requirements: 8.7_
  - [ ] 5.4 Property test P0-7: text outside the markers is unchanged, and rewriting is idempotent.
    - _Requirements: 8.8_
  - [ ] 5.5 Write `scripts/bone-count.ts` (writes only on change), run it once to fill the README table, and run it again to confirm it leaves the file untouched.
    - _Requirements: 8.1, 8.4, 8.5_

- [ ] 6. Threshold check (`pnpm thresholds:check`)
  - [ ] 6.1 Write `parseThresholds` (flat `{min}`/`{max}` mapping, `uniqueKeys`), with unit tests for each format error.
    - _Requirements: 11.1, 11.6_
  - [ ] 6.2 Write `compareThresholds` for the four loosening kinds.
    - _Requirements: 11.3_
  - [ ] 6.3 Property test P0-8: the reported loosenings equal a reference model's for random keep, raise, lower, remove, flip and add operations, with the right kind. Added, unchanged and tightened keys are never reported.
    - _Requirements: 11.7_
  - [ ] 6.4 Write `scripts/check-thresholds.ts` (git `ls-tree` and `show`, the label from the environment, output tables, exit codes). Test it against a temporary git repo with two commits.
    - _Requirements: 11.2, 11.4, 11.5, 11.6_

- [ ] 7. Voice spike server (`pnpm spike:voice`)
  - [ ] 7.1 Write `scripts/voice-spike-server.ts` with `createSpikeServer(opts)`: streaming and non-streaming replies, 400/401/404/413, `SPIKE_FIRST_TOKEN_DELAY_MS`, one JSON timing line per request with no message text.
    - _Requirements: 20.1–20.8_
  - [ ] 7.2 Add a Vitest smoke test that starts the server on an ephemeral port and checks the chunk sequence, `[DONE]`, the 401 path with a secret set, and that the log line holds no message content (D-36).
    - _Requirements: 20.1, 20.3, 20.5_
  - [ ] 7.3 Write the "Voice spike: how to run" section of `docs/decisions.md`: start command, `curl` examples, ngrok and Cloudflare Tunnel steps, the ElevenLabs Custom LLM settings (server URL ending in `/v1`, `VOICE_LLM_SECRET` as the API key), and how to read the timing log.
    - _Requirements: 19.1_

- [ ] 8. `pnpm verify` and placeholders
  - [ ] 8.1 Write `scripts/not-built-yet.mjs` and the root `eval` script, which print `not built yet` and exit 0.
    - _Requirements: 13.7_
  - [ ] 8.2 Wire `verify` (boundary lint, typecheck, ESLint, tests; no evals). Check that it exits 0, and that it exits non-zero after a deliberately planted vendor import, which is then removed.
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 9. GitHub Actions
  - [ ] 9.1 Write `.github/workflows/ci.yml`: the `verify` job, plus the `db-postgres16` job (service container, `TEST_DATABASE_URL`, skeleton tests, `docker compose config --quiet`). No secrets.
    - _Requirements: 10.1–10.5, 5.8, 5.10_
  - [ ] 9.2 Write `.github/workflows/thresholds.yml`: `pull_request` with labelled and unlabelled events, event values passed through environment variables, read-only permissions.
    - _Requirements: 11.2, 11.4, 11.5_

- [ ] 10. Root registers
  - [ ] 10.1 Write `models.yaml` from the updated plan §5 block, with `prices: {}` and the field comment.
    - _Requirements: 16.1, 16.2_
  - [ ] 10.2 Write `render.yaml` from plan §12, with `postgresMajorVersion: "16"` and `sync: false` on every key.
    - _Requirements: 17.1, 17.2_
  - [ ] 10.3 Add a test that greps the repo for model IDs and prices outside `models.yaml` and `docs/`, so MODEL-07 is checked on every run.
    - _Requirements: 16.3, 12.5, 14.3_

- [ ] 11. Kiro layer (you'll approve each write under `.kiro/hooks` and `.kiro/agents`, as Kiro always asks for those)
  - [ ] 11.1 Write the ten steering files with the plan §9 front matter. `product.md` carries house rule 5. `evals.md` documents the min/max format, append-only tasks, and one task per YAML file under `evals/tasks/<set>/` (updated Prompt 2). The archetype files leave out the `product.yaml` link.
    - _Requirements: 12.1–12.5_
  - [ ] 11.2 Create the five hooks as v1 JSON. `eval-on-save` calls the `pnpm eval` placeholder. `guard-thresholds` uses the tool-ID regex matcher.
    - _Requirements: 13.1–13.7_
  - [ ] 11.3 Write `maker.json` and `judge.json` from the design (no `model` field).
    - _Requirements: 14.1–14.3_
  - [ ] 11.4 You paste the design's `mcp.json` content into `.kiro/settings/mcp.json`. The file exists but is empty, and Kiro won't let the agent write there. I then check it parses and has no literal key.
    - _Requirements: 15.1–15.3_
  - [ ] 11.5 Write the `docs/kiro-log.md` headings.
    - _Requirements: 19.2_

- [ ] 12. Exit-criteria proof
  - [ ] 12.1 Hook fires on a test save: the agent saves a scratch `.ts` file, then confirms `no-vendor-sdk` and `bone-count` ran, and deletes the scratch file.
    - _Requirements: 13.3, 13.4_
  - [ ] 12.2 Payload capture: add the temporary capture hook and the guard's `--capture` flag, save a `.ts` file, and attempt a real `fs_write` to `apps/exhume/evals/thresholds.yaml`. Keep both payloads as fixtures, add the replay test (expects exit 2), and record the payload shape and whether exit 2 blocked the write in decisions.md. Then remove the capture hook and flag. If the write went through, stop and tell you.
    - _Requirements: 9.12, 9.13_
  - [ ] 12.3 Spike server runs locally: start `pnpm spike:voice`, `curl` both modes, and paste a timing line into decisions.md.
    - _Requirements: 20.8_
  - [ ] 12.4 You confirm the ten steering files show in Kiro's steering panel.
    - _Requirements: 12.1_
  - [ ] 12.5 Git and CI:
    - First commit on `main`.
    - Once you give the remote URL and authenticate `gh`: add the remote, push, and create the `thresholds-change` label.
    - Watch both CI jobs go green. Open a throwaway PR that lowers a planted `{ min }` to see the threshold check fail, then close it and delete the branch.
    - _Requirements: 10.1–10.4, 11.4_
  - [ ] 12.6 Final `pnpm verify`. Write the three Phase 0 lines in `kiro-log.md`, and list anything in the plan I couldn't do or think is wrong.
    - _Requirements: 6.3, 19.2_

## Departures from the plan in this stage

- **D-32 Eval tasks are append-only for the maker (updated plan §9).** The guard checks whether the target exists. maker.json keeps a write deny only for `thresholds.yaml`, because a path glob can't tell a new file from an existing one. This changes Req 9.3, P0-2 and P0-3: editing an existing task file now blocks, which the earlier design allowed.
- **D-33 The judge can start the apps and `curl` localhost (updated plan §9).** I added deny rules for a second URL, `@file` uploads and output files, because Kiro's `*` would otherwise let `curl http://localhost:1 http://elsewhere` through.
- **D-34 Updated plan adopted as written:** the new `models.yaml` block, the compose service named `db`, and a root `.dockerignore`.
- **D-35 No Docker here:**
  - PGlite for tests, `pnpm verify` and CI; your WSL PostgreSQL for local dev.
  - Docker stays supported through the compose file, the Dockerfiles in Phases 4 and 5, and the `apps` profile in Phase 7.
  - CI runs the database tests on Postgres 16 and checks that the compose file parses.
  - This brings `createDb` into Phase 0 (kept internal until Phase 1).
  - I pinned `postgresMajorVersion: "16"` in `render.yaml`, so production matches CI.
- **D-37 node-postgres and file-backed PGlite (updated Prompt 0 in `docs/kiro-prompts.md`).** `createDb` uses `pg` instead of postgres.js and also accepts `pglite://<folder>`. The WSL PostgreSQL setup goes in decisions.md (task 2.7).
- **D-36 (proposed) The spike server gets a small Vitest smoke test (task 7.2)** in addition to the `curl` check, so it is covered by `pnpm verify`.
- **Task 10.3 is new:** a test that fails if a model ID or price appears outside `models.yaml` and `docs/`.

## Open questions

1. **PostgreSQL major version.** Ubuntu 26.04 installed PostgreSQL 18, not 16, and it's running on port 5432. You can keep 18 and let the CI Postgres 16 job catch version drift, or install `postgresql-16` from apt.postgresql.org to match production.
2. **gh CLI.** Installing it needs `sudo apt install gh`, which prompts for your password. Shall I run it so you can type the password, or will you install it yourself?
