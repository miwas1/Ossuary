---
inclusion: always
---
# Structure

```text
ossuary/
├── .kiro/            steering/ specs/ (one per phase) hooks/ agents/ settings/mcp.json
├── packages/
│   ├── skeleton/     @ossuary/skeleton; src/ manifest gateway(/providers) harness(/voice) guard evals trace mcp ui db blob, index.ts
│   └── create-ossuary/   CLI that creates a new app from a code (stretch)
├── apps/
│   ├── exhume/       product.yaml routing.yaml THREATS.md README.md Dockerfile
│   │                 src/app (pages, api/mcp, api/tasks, api/health), src/domain (steps, tools, schemas)
│   │                 prompts/ skills/ evals/{tasks,graders,thresholds.yaml,results} fixtures/
│   └── seance/       same shape
├── power/            the Kiro power (stretch)
├── docs/             implementation-plan.md framework-spec.md kiro-prompts.md decisions.md kiro-log.md
├── scripts/          repo tooling (boundary lint, bone count, threshold guard and check, voice spike)
├── models.yaml       tiers, model IDs and prices (the only place for them)
└── render.yaml  docker-compose.yml  turbo.json  pnpm-workspace.yaml  LICENSE  README.md  CHANGELOG.md  AGENTS.md
```

## The public import rule

- Apps import the skeleton only as `@ossuary/skeleton`. Never import `packages/skeleton/...` by path, and never use a subpath the skeleton's `package.json` `exports` doesn't list.
- Everything an app needs is exported from `packages/skeleton/src/index.ts`.

## Naming

- Files and folders: kebab-case. React components: PascalCase in kebab-case files.
- Specs: `.kiro/specs/<nn>-<name>/` with `requirements.md`, `design.md`, `tasks.md`, one per phase.
- Decisions: `D-nn` entries in `docs/decisions.md`.
- Correctness properties: plan §11 numbers (1 to 12) for the skeleton and apps; `P<phase>-n` for phase-local tooling properties.
- Tests: `*.test.ts` beside the code, `*.property.test.ts` for fast-check properties. Each property test carries `// Feature: <spec>, Property <id>: <text>`.
