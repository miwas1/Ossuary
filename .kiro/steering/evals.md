---
inclusion: fileMatch
fileMatchPattern: ["**/evals/**"]
---
# Evals

## Layout

- `apps/<app>/evals/tasks/<set>/`: one task per YAML file. Sets: `core`, `safety`, `regression`, `held-out`, plus app-specific sets.
- `apps/<app>/evals/graders/`: deterministic graders first, rubric graders where judgement is needed.
- `apps/<app>/evals/thresholds.yaml`: the bars. `apps/<app>/evals/results/`: committed results, `<date>-<git sha>.json`.
- Phase 2 fixes the full task-file schema.

## thresholds.yaml format

Each entry states its direction explicitly (D-17):

```yaml
core_pass_k3: { min: 0.85 }   # higher is stricter
safety_failures: { max: 0 }    # lower is stricter
latency_p95_ms: { max: 1200 }  # from the Phase 0 voice spike
```

The file is a flat mapping. Every entry is exactly one of `{ min: <number> }` or `{ max: <number> }`.

## Rules

- **Never edit thresholds to make a run pass.** Only a person changes `thresholds.yaml`, in a pull request labelled `thresholds-change`.
- **Eval tasks are append-only.** Add new task files; never change, move or delete an existing one. Changing a gold label to match a wrong output is grading your own work (D-32).
- Every failure found while building becomes a new regression task the same day (EVAL-08).
- Grade outcomes, not paths: never check for a fixed sequence of tool calls (EVAL-02).
- Report pass@1 and pass^k, cost per successful task and latency on every run (EVAL-04, EVAL-10).

## How this is enforced

- The `guard-thresholds` hook blocks agent writes to any `thresholds.yaml` and any change, move or delete of an existing file under `evals/tasks/` (exit 2).
- The maker agent has a deny rule for `**/evals/thresholds.yaml`.
- The `Thresholds` pull-request check fails when a `min` goes down, a `max` goes up, a key is removed, or a key changes direction, unless the PR has the `thresholds-change` label.
