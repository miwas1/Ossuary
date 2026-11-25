// Payload builders shared by the guard tests.
import type { FsProbe } from "../guard-thresholds.mjs";

export type Payload = { hook_event_name: string; cwd: string; tool_name: string; tool_input: Record<string, unknown> };

export const CWD = "/home/dev/ossuary";

export function payload(tool_name: string, tool_input: Record<string, unknown>, cwd = CWD): string {
  const p: Payload = { hook_event_name: "PreToolUse", cwd, tool_name, tool_input };
  return JSON.stringify(p);
}

/** Quote a path for a POSIX shell so backslashes survive. */
export const q = (p: string): string => `'${p.replace(/'/g, `'\\''`)}'`;

export const write = (p: string) => payload("fs_write", { path: p, text: "x: { min: 0 }\n" });
export const append = (p: string) => payload("fs_append", { path: p, text: "more\n" });
export const replace = (p: string) => payload("str_replace", { path: p, oldStr: "0.85", newStr: "0.10" });
export const del = (p: string) => payload("delete_file", { targetFile: p });
export const moveFrom = (p: string) => payload("smart_relocate", { sourcePath: p, destinationPath: "/tmp/elsewhere.yaml" });
export const moveTo = (p: string) => payload("smart_relocate", { sourcePath: "/tmp/new.yaml", destinationPath: p });
export const bash = (command: string) => payload("execute_bash", { command, description: "test" });
export const bashProcess = (command: string) => payload("control_bash_process", { action: "start", command });

export const probe = (opts: { exists?: boolean | ((p: string) => boolean); contains?: boolean } = {}): FsProbe => ({
  exists: (p) => (typeof opts.exists === "function" ? opts.exists(p) : (opts.exists ?? false)),
  probeDir: () => opts.contains ?? false,
});
