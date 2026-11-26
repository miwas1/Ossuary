#!/usr/bin/env bash
# Session helper: snapshot running node processes, memory and load.
{
  date
  uptime
  free -m
  ps -eo pid,etimes,pcpu,rss,args --sort=-pcpu | grep -E "node|vitest|tsx" | grep -v grep | head -20 | cut -c1-200
} > /home/devnexx/hackathons/Ossuary/.agents/ps.log 2>&1
