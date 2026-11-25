---
inclusion: always
---
# Tech

## Stack

- TypeScript (strict), Node 24 (`.nvmrc`, `engines.node ">=24 <25"`), pnpm workspaces and Turborepo.
- Next.js (App Router) per app; Tailwind CSS and shadcn/ui themed by skeleton costume tokens (from Phase 3).
- Postgres with Drizzle ORM: PostgreSQL in WSL for local dev, in-memory PGlite for tests and evals, Render Postgres 16 in production. `createDb(url)` takes `pglite://memory`, `pglite://<folder>` or `postgres://`.
- Docker is optional and never needed locally. Don't run docker commands on the dev machine; CI checks Docker support (D-35).
- Zod at every boundary; Vitest and fast-check for tests; ESLint flat config at the root.
- MCP: the official TypeScript SDK, Streamable HTTP, stateless.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm verify` | Boundary lint, typecheck, ESLint, unit and property tests. Must be green before a task is done. From Phase 2 it also runs the sampled regression and safety evals. |
| `pnpm lint:boundaries` | Fails on a vendor SDK import outside the gateway providers, or an app importing skeleton internals. |
| `pnpm bones` | Recounts skeleton and app lines and rewrites the README table. |
| `pnpm eval` | Runs eval sets (Phase 2; prints "not built yet" until then). |
| `pnpm db:migrate` | Applies migrations to `DATABASE_URL`. |
| `pnpm spike:voice` | Starts the voice latency spike server. |
| `pnpm thresholds:check` | Compares `thresholds.yaml` between two commits (used by CI on pull requests). |

## The vendor SDK boundary

- Model vendor SDKs (Anthropic, OpenAI, Google GenAI and similar) are imported only in `packages/skeleton/src/gateway/providers/` (MODEL-01).
- The ElevenLabs server SDK is never imported. The skeleton's voice adapter in `packages/skeleton/src/harness/voice/` fetches signed URLs with plain `fetch`. The ElevenLabs browser SDK is allowed only under `apps/seance/src/app/` (D-18).
- `pnpm lint:boundaries` enforces both rules, on save and in CI.

## Conventions

- ES modules everywhere; import local TypeScript files with their `.ts` extension.
- Money is stored as integers in the smallest unit (kobo for naira).
- No model IDs or prices anywhere except `models.yaml`.
- Secrets come from the environment (`.env`, never committed); `.env.example` lists every variable.
- Keep pure logic separate from I/O so properties can test it.
