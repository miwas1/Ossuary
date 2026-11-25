// pnpm thresholds:check --base <sha> --head <sha>
// Fails when a pull request loosens any evals/thresholds.yaml without the thresholds-change label (Requirement 11).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareThresholds, parseThresholds, showEntry, type Doc, type FormatError, type Loosening } from "./lib/thresholds.ts";

const THRESHOLD_FILE = /(^|\/)evals\/thresholds\.yaml$/;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

function thresholdFiles(cwd: string, sha: string): Set<string> {
  return new Set(git(cwd, ["ls-tree", "-r", "--name-only", sha]).split("\n").filter((f) => THRESHOLD_FILE.test(f)));
}

export interface CheckResult {
  exit: 0 | 1;
  output: string[];
}

export function runCheck(opts: { cwd: string; base: string; head: string; labelled: boolean }): CheckResult {
  const { cwd, base, head, labelled } = opts;
  const baseFiles = thresholdFiles(cwd, base);
  const headFiles = thresholdFiles(cwd, head);
  const errors: FormatError[] = [];
  const loosenings: Loosening[] = [];

  const load = (sha: string, file: string, present: boolean): Doc | null => {
    if (!present) return new Map();
    const parsed = parseThresholds(`${file}@${sha.slice(0, 7)}`, git(cwd, ["show", `${sha}:${file}`]));
    if (!parsed.ok) {
      errors.push(...parsed.errors);
      return null;
    }
    return parsed.doc;
  };

  for (const file of [...new Set([...baseFiles, ...headFiles])].sort()) {
    const before = load(base, file, baseFiles.has(file));
    const after = load(head, file, headFiles.has(file));
    if (before && after) loosenings.push(...compareThresholds(file, before, after));
  }

  const output: string[] = [];
  if (errors.length > 0) {
    output.push("thresholds:check: format errors (each entry must be { min: <number> } or { max: <number> }):");
    for (const e of errors) output.push(`  ${e.file}${e.key ? ` ${e.key}` : ""}: ${e.message}`);
    return { exit: 1, output };
  }
  if (loosenings.length === 0) return { exit: 0, output: ["thresholds:check: no thresholds loosened"] };

  output.push(labelled ? "thresholds:check: allowed by the thresholds-change label:" : "thresholds:check: thresholds loosened without the thresholds-change label:");
  output.push("| File | Key | Change | Before | After |", "| --- | --- | --- | --- | --- |");
  for (const l of loosenings) output.push(`| ${l.file} | ${l.key} | ${l.kind} | ${showEntry(l.before)} | ${showEntry(l.after)} |`);
  return { exit: labelled ? 0 : 1, output };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const base = arg("--base") ?? process.env.BASE_SHA;
  const head = arg("--head") ?? process.env.HEAD_SHA;
  if (!base || !head) {
    console.error("usage: pnpm thresholds:check --base <sha> --head <sha>");
    process.exit(1);
  }
  const result = runCheck({ cwd: process.cwd(), base, head, labelled: process.env.THRESHOLDS_CHANGE_LABEL === "true" });
  for (const line of result.output) (result.exit === 0 ? console.log : console.error)(line);
  process.exitCode = result.exit;
}
