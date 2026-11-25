// Bone counting (Requirement 8): non-test TypeScript lines that hold code, and the README table.
import ts from "typescript";

export const START_MARKER = "<!-- bones:start -->";
export const END_MARKER = "<!-- bones:end -->";

const COUNTED_EXT = /\.(ts|tsx|mts|cts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const TEST_FILE = /\.(test|spec)\.[cm]?tsx?$/;
const SKIPPED_SEGMENTS = new Set(["node_modules", "dist", ".next", ".turbo", "coverage", "__tests__"]);

/** Whether a repo-relative path is counted: TypeScript, not a declaration file, not a test file. */
export function isCounted(relPath: string): boolean {
  if (!COUNTED_EXT.test(relPath) || DECLARATION.test(relPath) || TEST_FILE.test(relPath)) return false;
  return !relPath.split("/").some((seg) => SKIPPED_SEGMENTS.has(seg));
}

/** Lines holding at least one token that is neither whitespace nor a comment. */
export function countBoneLines(fileName: string, text: string): number {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const lines = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sf);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    if (node.kind === ts.SyntaxKind.JsxText && /^\s*$/.test(node.getText(sf))) return;
    const start = node.getStart(sf);
    const end = node.getEnd();
    if (end <= start) return;
    const first = sf.getLineAndCharacterOfPosition(start).line;
    const last = sf.getLineAndCharacterOfPosition(end - 1).line;
    for (let line = first; line <= last; line += 1) lines.add(line);
  };
  visit(sf);
  return lines.size;
}

export interface Row {
  name: string;
  lines: number;
}

function share(app: number, skeleton: number): string {
  const total = app + skeleton;
  return total === 0 ? "—" : `${Math.round((100 * app) / total)}%`;
}

/** The Markdown table: skeleton first, then apps alphabetically, with each app's own share. */
export function renderTable(skeleton: Row, apps: readonly Row[]): string {
  const sorted = [...apps].sort((a, b) => a.name.localeCompare(b.name));
  return [
    "| Package | Bone lines | App-specific share |",
    "| --- | ---: | ---: |",
    `| ${skeleton.name} | ${skeleton.lines} | — |`,
    ...sorted.map((app) => `| ${app.name} | ${app.lines} | ${share(app.lines, skeleton.lines)} |`),
  ].join("\n");
}

export type Rewrite = { ok: true; text: string; changed: boolean } | { ok: false; reason: string };

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Replace only the text between the markers; every byte outside them is kept. */
export function rewriteReadme(readme: string, table: string): Rewrite {
  const starts = count(readme, START_MARKER);
  const ends = count(readme, END_MARKER);
  if (starts !== 1 || ends !== 1) {
    return { ok: false, reason: `README.md must hold ${START_MARKER} and ${END_MARKER} exactly once each (found ${starts} and ${ends})` };
  }
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (endIdx < startIdx) return { ok: false, reason: `${END_MARKER} comes before ${START_MARKER} in README.md` };
  const text = `${readme.slice(0, startIdx + START_MARKER.length)}\n${table.replace(/\n+$/, "")}\n${readme.slice(endIdx)}`;
  return { ok: true, text, changed: text !== readme };
}
