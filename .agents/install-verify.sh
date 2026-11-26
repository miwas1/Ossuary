#!/usr/bin/env bash
# Session helper: link the new echo package, then pnpm verify.
cd /home/devnexx/hackathons/Ossuary || exit 1
pnpm install > .agents/install.log 2>&1
echo "EXIT=$?" >> .agents/install.log
bash .agents/verify.sh
