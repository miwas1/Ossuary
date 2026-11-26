#!/usr/bin/env bash
# Session helper: pnpm verify, then the condensed summary in .agents/summary.log.
cd /home/devnexx/hackathons/Ossuary || exit 1
bash .agents/run.sh pnpm verify
bash .agents/summary.sh
