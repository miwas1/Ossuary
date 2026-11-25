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

## Forward notes for later phases

- Phase 1: decide the public `db` export (`createDb`, `migrateDb`) from `src/index.ts`.
- Phase 2: `pnpm eval` database selection and JSON results (D-35).
- Phase 3: enable both MCP servers in `.kiro/settings/mcp.json` (D-10).
- Phase 4: restore `#[[file:apps/exhume/product.yaml]]` in `archetype-ext.md` (D-04); add `apps/exhume/Dockerfile` and `api/health` (D-35).
- Phase 5: restore `#[[file:apps/seance/product.yaml]]` in `archetype-cnv.md` (D-04); add `apps/seance/Dockerfile` and `api/health` (D-35); allow `@elevenlabs/react` under `apps/seance/src/app/` only (D-18).
- Phase 7: the compose `apps` profile and the CI image-build and compose smoke-test job (D-35).

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
