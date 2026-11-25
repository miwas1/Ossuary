import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKIP_DIRS: ReadonlySet<string> = new Set(["node_modules", "dist", ".next", ".turbo", "coverage", ".git", ".worktrees"]);

/** List files under `root` (repo-relative POSIX paths, sorted) whose extension is in `extensions`. */
export function walkFiles(root: string, extensions: readonly string[], skipDirs: ReadonlySet<string> = SKIP_DIRS): string[] {
  const out: string[] = [];
  const visit = (rel: string): void => {
    const abs = rel ? path.join(root, rel) : root;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) visit(childRel);
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        out.push(childRel);
      }
    }
  };
  visit("");
  return out.sort();
}

/** Find the repo root from a script's own location (scripts/ or scripts/lib/). */
export function repoRootFrom(metaUrl: string): string {
  let dir = path.dirname(fileURLToPath(metaUrl));
  while (!fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("repo root (pnpm-workspace.yaml) not found");
    dir = parent;
  }
  return dir;
}
