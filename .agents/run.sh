#!/usr/bin/env bash
# Session helper: run a command from the repo root and write its output and exit code to .agents/last.log.
cd /home/devnexx/hackathons/Ossuary || exit 1
"$@" > .agents/last.log 2>&1
echo "EXIT=$?" >> .agents/last.log
