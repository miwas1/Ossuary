#!/usr/bin/env node
// Placeholder for root scripts that later phases build (Req 13.7).
// Usage: node scripts/not-built-yet.mjs "<command>" <phase>
const [command = "this command", phase = "a later phase"] = process.argv.slice(2);
console.log(`not built yet: ${command} arrives in Phase ${phase}`);
process.exit(0);
