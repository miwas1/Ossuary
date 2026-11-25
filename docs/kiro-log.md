# Kiro log

Three lines per phase: what the spec decided, what a hook or property test caught, and what was changed by hand (plan §1, step 6). Judge findings and weekly transcript reading (EVAL-07) go here too.

## Phase 0: 00-foundations

### What the spec decided

Threshold direction is explicit (`{ min }` or `{ max }`), eval tasks are append-only, and there's no Docker on the dev machine: tests run on PGlite and CI covers Postgres 16 and the compose file (D-17, D-32, D-35).

### What a hook or property test caught

The first `pnpm verify` run caught four bugs before any hook existed: a guard test built absolute paths before its temp repo existed, `git check-ignore -q` was given three paths when it takes one, a `models.yaml` check was stricter than the file's own spacing, and ESLint flagged a dead assignment in the guard.

### What I changed by hand

Moved the repo to Node 24 (`.nvmrc`, `engines`, `engineStrict`), made the first commit and push, and tightened two voice spike test assertions.

### Judge findings

Not run yet for Phase 0.
