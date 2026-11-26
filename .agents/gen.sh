#!/usr/bin/env bash
# Session helper: generate migration 0001 from schema.ts and record the result.
cd /home/devnexx/hackathons/Ossuary/packages/skeleton || exit 1
{
  sha256sum src/db/migrations/0000_init.sql
  pnpm exec drizzle-kit generate --name=bones
  echo "GEN_EXIT=$?"
  ls src/db/migrations src/db/migrations/meta
  sha256sum src/db/migrations/0000_init.sql
  git diff --stat -- src/db/migrations/0000_init.sql
} > ../../.agents/gen.log 2>&1
