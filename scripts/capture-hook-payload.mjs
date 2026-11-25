#!/usr/bin/env node
// Saves the JSON payload a Kiro hook sends on stdin, for test fixtures (Req 9.12, D-06).
// Usage: node scripts/capture-hook-payload.mjs <dir>. Always exits 0, so it never blocks anything.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "/tmp/ossuary-hook-capture";
try {
  const text = fs.readFileSync(0, "utf8");
  let event = "unknown";
  let tool = "none";
  try {
    const p = JSON.parse(text);
    event = String(p.hook_event_name ?? event);
    tool = String(p.tool_name ?? tool);
  } catch {
    /* not JSON: keep the defaults, save it anyway */
  }
  const safe = (s) => s.replace(/[^A-Za-z0-9_.-]/g, "_");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${safe(event)}-${safe(tool)}-${Date.now()}.json`), text);
} catch (err) {
  process.stderr.write(`capture-hook-payload: ${err instanceof Error ? err.message : String(err)}\n`);
}
process.exit(0);
