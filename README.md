# Ossuary

Ossuary is a lean TypeScript skeleton for AI apps. It turns the AI Product Build Framework into code and Kiro configuration: one gateway to every model, hard budgets, quarantine for untrusted content, evals that gate every change, traces, MCP and a shared UI kit. Two apps are built on it to show how thin an app can be: **Exhume** (receipts to a naira ledger) and **Séance** (live voice mock interviews).

Built for Kiroween 2026, Skeleton Crew category.

## Bone count

How much of each app is its own code, next to the shared skeleton. `pnpm bones` rewrites this table.

<!-- bones:start -->
<!-- bones:end -->

## Quick start

No Docker needed.

```bash
nvm use            # Node 24, from .nvmrc
corepack enable    # pnpm, pinned in package.json
pnpm install
pnpm verify        # typecheck, lint, boundary lint, unit and property tests (runs on in-memory PGlite)
```

For a local database, install PostgreSQL in WSL once (see `docs/decisions.md`, "Local PostgreSQL in WSL"), put `DATABASE_URL` in `.env` (copy `.env.example`), then run `pnpm db:migrate`.

**With Docker** (optional, on any machine that has it): copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`, then `docker compose up db`.

## Apps

| App | What it does | Live URL |
| --- | --- | --- |
| Exhume | Receipts, invoices and POS slips to ledger entries | Coming in Phase 4 |
| Séance | Voice mock interviews with a spectral interviewer | Coming in Phase 5 |

## How this repo was built

Every phase is a Kiro spec in `.kiro/specs/`. Steering, hooks and the maker and judge agents live in `.kiro/`. Decisions that differ from the plan are in `docs/decisions.md`, and the build log is in `docs/kiro-log.md`.

## Licence

MIT. See `LICENSE`.
