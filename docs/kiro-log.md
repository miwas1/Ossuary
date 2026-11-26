# Kiro log

Three lines per phase: what the spec decided, what a hook or property test caught, and what was changed by hand (plan §1, step 6). Judge findings and weekly transcript reading (EVAL-07) go here too.

## Phase 0: 00-foundations

### What the spec decided

Threshold direction is explicit (`{ min }` or `{ max }`), eval tasks are append-only, and there's no Docker on the dev machine: tests run on PGlite and CI covers Postgres 16 and the compose file (D-17, D-32, D-35).

### What a hook or property test caught

The first `pnpm verify` run caught four bugs before any hook existed: a guard test built absolute paths before its temp repo existed, `git check-ignore -q` was given three paths when it takes one, a `models.yaml` check was stricter than the file's own spacing, and ESLint flagged a dead assignment in the guard.

The deliberate vendor import failed `pnpm verify` at boundary lint. The temporary Git comparison rejected a lower minimum without the label and accepted it with the label.

### What I changed by hand

Moved the repo to Node 24 (`.nvmrc`, `engines`, `engineStrict`), made the first commit and push, and tightened two voice spike test assertions.

Confirmed all ten files in Kiro's workspace steering panel. The two manual references showed “Reference cut short”, so they now inline smaller excerpts and point to the full documents (D-41). Filled in the MCP settings and made the verification test require them.

### Exit checks

Both GitHub Actions jobs passed for `c46bee5`, including the Postgres 16 tests and Compose validation. [Phase 0 CI run](https://github.com/miwas1/Ossuary/actions/runs/45701490079)

The uncached Node 24 verification passed 91 tests and skipped the replay of a real Kiro payload. The local voice spike returned both response modes. The live hook capture, GitHub label and throwaway PR, and the tunneled ElevenLabs measurement remain open.

### Judge findings

Not run yet for Phase 0.

## Phase 1: 01-skeleton-core

### What the spec decided

Echo uses a separate judge model, persists task state after each step and writes redacted traces. Fake calls exercise the complete path without vendor keys. D-72 through D-80 record the implementation and review decisions.

### What verification caught

The full run caught a type error when Echo passed its typed generate/evaluate pattern to `defineApp`, and concurrent PGlite setup exceeded the test timeout in WSL. The harness now accepts typed candidates, and the skeleton suite runs with one worker. The missing-`DATABASE_URL` CLI test omits the developer's `.env` and bounds the child process runtime.

Changed by hand:

### Verification and scope

An uncached `pnpm verify` with `DATABASE_URL`, `TEST_DATABASE_URL` and both vendor keys unset passed all 18 tasks. Vitest reported 208 skeleton tests, four Echo tests and 87 repo-script tests passing, with five skips. Properties 1, 2, 5, 6, 8 and P1-1 through P1-4 passed with at least 100 generated cases each. P1-5 printed `not calibrated` once, as specified. The opt-in smoke script printed the `OSSUARY_SMOKE=1` instruction when disabled.

`pnpm bones` refreshed the README to 2,443 skeleton lines and 102 Echo lines. The Phase 1 commits cover the phase implementation, its spec checklist and its records. The guard, eval, MCP, UI and blob implementations remain scheduled for later phases.

### Local PostgreSQL exit check

On 26 November 2026, `pnpm db:migrate` applied both migrations to a disposable local PostgreSQL 18 cluster. All eight `bones` tables existed. With that same database, `pnpm --filter echo task --fake "a lighthouse keeper"` printed:

```text
task:     b06f9d5a-0d94-424b-ba16-aab878801a88
trace:    6e8ff8f4c5ea0ae1a19517e3d6d0c650
status:   completed
accepted: true
text:     Here lies the keeper, who kept every light but his own.
cost:     $0.000504 (fake prices)
spans:    5
```

```sql
select name, attributes->>'gen_ai.operation.name' as operation
from bones.spans
where trace_id = '6e8ff8f4c5ea0ae1a19517e3d6d0c650'
order by start_time;
```

| name | operation |
| --- | --- |
| `invoke_workflow echo` | `invoke_workflow` |
| `step generate` | |
| `chat small` | `chat` |
| `step evaluate` | |
| `chat mid` | `chat` |

The migration suite also passed all five tests with `TEST_DATABASE_URL` set to the disposable cluster, including migration replay and the table check on PostgreSQL. The cluster was stopped after verification.

### Live vendor check

Task 12.3 was skipped because `.env` contained neither vendor API key. The fixture remains empty, and full calibration is a Phase 4 exit criterion under D-71. `pnpm eval` reported that the eval runner arrives in Phase 2.

### Judge findings

The read-only Codex `judge` subagent used the repository's judge instructions because the dedicated Kiro CLI was unavailable. It reviewed requirements 1–27 and exercised the fake Echo CLI, the skeleton suite and the boundary lint. It flagged served-model pricing and identity, deadline handling, judge fallback, redaction of escaped secrets, validation and calibration coverage, OpenAI failure handling, and Echo's no-judge branch. The implementation and targeted cases cover those paths. The judge re-reviewed the fixes and confirmed the last two fallback cases independently.
