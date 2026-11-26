---
inclusion: always
---
# Product: Ossuary

Ossuary is a lean TypeScript skeleton for AI apps, built for Kiroween 2026 (Skeleton Crew category). It turns the AI Product Build Framework (`docs/framework-spec.md`) into code and Kiro configuration, so every app on it gets the same gateway, budgets, guardrails, evals, traces, MCP server and UI kit.

## The two apps

- **Exhume** (`apps/exhume`, code `EXT-A2-R2`): turns a photo or PDF of a receipt, invoice or POS slip into a naira ledger entry. It posts clean entries with undo, and asks before anything leaves the app.
- **Séance** (`apps/seance`, code `CNV-A0-R2`): a live voice mock interview with a spectral interviewer. Practice only; scores never go to an employer.

Each app is a thin layer: it declares a code in `product.yaml` and imports `@ossuary/skeleton`, which resolves the code into a policy and does the rest. The differences between the apps are structural (pipeline versus realtime-split), not just prompts.

## What judges look for

- Two live URLs that work in a fresh browser, with seeded demo data and no login.
- A repo that shows each app is a thin layer on one skeleton (the README bone count).
- Clear use of Kiro: specs with EARS requirements and property tests, steering, hooks, the maker and judge agents, MCP in both directions. `.kiro/` is committed.
- A video under three minutes and the Kiro write-up.

## House rules

1. Skeleton first. Apps import only from `@ossuary/skeleton`, never from its internals.
2. Anything deterministic (arithmetic, formatting, routing) is code, not prompt (HAR-06).
3. Model names and prices live only in `models.yaml` (MODEL-07).
4. No eval, no merge: the regression and safety sets pass before a phase closes.
5. Where `docs/decisions.md` differs from the plan, `docs/decisions.md` wins.

## Autonomy

- Decide, record, continue. When the plan or framework leaves a choice open, pick the option that best serves the current exit criteria, record it in `docs/decisions.md` as approved, and keep going.
- Stop and ask only when a choice would:
  1. spend money beyond the smoke test, or need a key or account that isn't in `.env`;
  2. delete or overwrite anything outside the current stage's folders;
  3. change the plan's scope: the apps, the category or what ships;
  4. weaken a safety rule: the guard, approvals, redaction, thresholds or eval tasks.
- Put non-blocking questions in `docs/open-questions.md` and never wait on them.
- If something needs a key that isn't in `.env`, build and test it against the fake provider, list that exit criterion in `docs/open-questions.md`, and move on.
- Eval runs on the fake provider are tagged `provider=fake` and never count toward a release threshold.
- Keep end-of-turn reports to five lines: done, open, next.

## Out of scope

Accounts and login, real payments (metering shows on the dashboard only), portfolio governance, compliance files and multi-tenant admin.

Use `#plan` for the implementation plan and `#framework` for the framework spec.
