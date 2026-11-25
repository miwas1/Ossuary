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
