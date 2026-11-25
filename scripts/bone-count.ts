// pnpm bones: count bone lines in the skeleton and each app, and rewrite the README table.
import fs from "node:fs";
import path from "node:path";
import { countBoneLines, isCounted, renderTable, rewriteReadme, type Row } from "./lib/bones.ts";
import { repoRootFrom, walkFiles } from "./lib/walk.ts";

function packageRow(root: string, relDir: string): Row {
  const dir = path.join(root, relDir);
  let name = path.basename(relDir);
  try {
    name = (JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string }).name ?? name;
  } catch {
    /* no package.json: use the folder name */
  }
  const files = walkFiles(dir, [".ts", ".tsx", ".mts", ".cts"]).filter((f) => isCounted(f));
  const lines = files.reduce((sum, f) => sum + countBoneLines(f, fs.readFileSync(path.join(dir, f), "utf8")), 0);
  return { name, lines };
}

const root = repoRootFrom(import.meta.url);
const skeleton = packageRow(root, "packages/skeleton");
const apps = fs
  .readdirSync(path.join(root, "apps"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => packageRow(root, `apps/${d.name}`));

const table = renderTable(skeleton, apps);
const readmePath = path.join(root, "README.md");
const result = rewriteReadme(fs.readFileSync(readmePath, "utf8"), table);
if (!result.ok) {
  console.error(`bones: ${result.reason}; README.md left unchanged`);
  process.exitCode = 1;
} else {
  if (result.changed) fs.writeFileSync(readmePath, result.text);
  console.log(table);
  console.log(result.changed ? "bones: README.md updated" : "bones: README.md already up to date");
}
