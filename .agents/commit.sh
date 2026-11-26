#!/usr/bin/env bash
# Session helper: tick tasks, stage the named paths plus tasks.md, and commit as "01-skeleton-core: group <N>".
# Usage: bash .agents/commit.sh <N> "<task ids>" <path>...
cd /home/devnexx/hackathons/Ossuary || exit 1
group="$1"; ids="$2"; shift 2
{
  # shellcheck disable=SC2086
  node .agents/tick.mjs $ids "$group"
  git add -- "$@" .kiro/specs/01-skeleton-core/tasks.md
  git commit -q -m "01-skeleton-core: group $group"
  echo "COMMIT_EXIT=$?"
  git log --oneline | head -1
  git status --short
} > .agents/commit.log 2>&1
