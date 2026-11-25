// Types for guard-thresholds.mjs, used by the TypeScript tests.
export interface FsProbe {
  exists(p: string): boolean;
  probeDir(p: string): boolean;
}
export interface Decision {
  exit: 0 | 2;
  reasons: string[];
}
export interface ShellSegment {
  words: string[];
  redirects: string[];
  raw: string;
}
export function normalizePath(p: string, cwd: string): string;
export function isThresholdFile(normPath: string): boolean;
export function isTaskPath(normPath: string): boolean;
export function classifyTool(toolName: string): "write" | "delete" | "move" | "shell" | "other";
export function splitShell(command: string): ShellSegment[];
export function analyseShell(command: string, cwd: string, fsProbe: FsProbe, depth?: number): string[];
export function decide(stdinText: string, opts?: { cwd?: string; fsProbe?: FsProbe }): Decision;
export const realFsProbe: FsProbe;
