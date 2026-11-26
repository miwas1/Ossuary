#!/usr/bin/env bash
# Session helper: condense .agents/last.log into .agents/summary.log (failures, errors, totals, exit code).
cd /home/devnexx/hackathons/Ossuary || exit 1
sed 's/\x1b\[[0-9;]*m//g' .agents/last.log > .agents/clean.log
{
  grep -nE "EXIT=|error TS|  error |FAIL|✗|×|Error:|AssertionError|Tasks:|Test Files|Tests |failed" .agents/clean.log | head -80
  echo "--- tail"
  tail -6 .agents/clean.log
} > .agents/summary.log
