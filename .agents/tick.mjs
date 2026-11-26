// Session helper: tick tasks in tasks.md. Usage: node .agents/tick.mjs 2.1 2.2 2 ...
// A bare group number ticks the group line once all of its subtasks are ticked.
import fs from "node:fs";
const file = ".kiro/specs/01-skeleton-core/tasks.md";
let text = fs.readFileSync(file, "utf8");
for (const id of process.argv.slice(2)) {
  const esc = id.replace(/\./g, "\\.");
  const re = new RegExp(`^(\\s*)- \\[ \\] (${esc}\\.? )`, "m");
  if (!re.test(text)) {
    console.error(`not found or already ticked: ${id}`);
    continue;
  }
  text = text.replace(re, "$1- [x] $2");
}
fs.writeFileSync(file, text);
