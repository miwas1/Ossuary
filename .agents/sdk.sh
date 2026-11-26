#!/usr/bin/env bash
# Session helper: find the SDK type definitions the adapters rely on.
cd /home/devnexx/hackathons/Ossuary/packages/skeleton || exit 1
A=$(readlink -f node_modules/@anthropic-ai/sdk)
O=$(readlink -f node_modules/openai)
{
  echo "ANTHROPIC=$A"; echo "OPENAI=$O"
  echo "== anthropic package exports"; node -e 'const p=require(process.argv[1]+"/package.json");console.log(p.version, Object.keys(p.exports||{}).slice(0,15).join(" "))' "$A"
  echo "== anthropic output_config / effort / ttl / cache_creation"
  grep -rn --include=*.d.ts -E "output_config\??:|effort\??:|ttl\??:|cache_creation_input_tokens\??:|cache_read_input_tokens\??:" "$A/resources/messages" 2>/dev/null | head -20
  echo "== anthropic messages.create signature"
  grep -rn --include=messages.d.ts -E "^\s+create\(" "$A/resources/messages" | head -5
  echo "== anthropic APIError status/headers"
  grep -rn --include=*.d.ts -E "readonly (status|headers)" "$A/core" "$A" 2>/dev/null | head -8
  echo "== openai prompt_cache_options / breakpoint / reasoning / cache_write_tokens"
  grep -rn --include=*.d.ts -E "prompt_cache_options\??:|prompt_cache_breakpoint\??:|cache_write_tokens\??:|cached_tokens\??:|max_output_tokens\??:" "$O/resources/responses" 2>/dev/null | head -20
  echo "== openai client options maxRetries"
  grep -rn --include=*.d.ts -E "maxRetries\??:" "$O/client.d.ts" "$A/client.d.ts" 2>/dev/null | head -4
  echo "== openai response output_text"
  grep -rn --include=responses.d.ts -E "output_text\??:" "$O/resources/responses" | head -3
} > ../../.agents/sdk.log 2>&1
