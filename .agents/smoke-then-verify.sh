#!/usr/bin/env bash
# Session helper: run the smoke script with OSSUARY_SMOKE unset (it must skip), then pnpm verify.
cd /home/devnexx/hackathons/Ossuary || exit 1
env -u OSSUARY_SMOKE pnpm --filter @ossuary/skeleton smoke > .agents/smoke.log 2>&1
echo "EXIT=$?" >> .agents/smoke.log
bash .agents/verify.sh
