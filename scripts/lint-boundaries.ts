// pnpm lint:boundaries: vendor SDKs only in the gateway providers, apps only through @ossuary/skeleton.
import fs from "node:fs";
import path from "node:path";
import { checkFile, exportKeys, type Violation } from "./lib/boundaries.ts";
import { repoRootFrom, walkFiles } from "./lib/walk.ts";

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"];

export function lintBoundaries(root: string): { files: number; violations: Violation[] } {
  const skeletonPkg = JSON.parse(fs.readFileSync(path.join(root, "packages/skeleton/package.json"), "utf8")) as { exports?: unknown };
  const ctx = { skeletonExports: exportKeys(skeletonPkg.exports) };
  const files = walkFiles(root, EXTENSIONS);
  const violations = files.flatMap((file) => checkFile(file, fs.readFileSync(path.join(root, file), "utf8"), ctx));
  return { files: files.length, violations };
}

const root = repoRootFrom(import.meta.url);
const { files, violations } = lintBoundaries(root);
for (const v of violations) console.error(`${v.file}:${v.line}  ${v.specifier}  ${v.rule}: ${v.message}`);
if (violations.length > 0) {
  console.error(`lint:boundaries: ${violations.length} violation(s) in ${files} files scanned`);
  process.exitCode = 1;
} else {
  console.log(`lint:boundaries: ok, ${files} files scanned`);
}
