// Child-process tests: pipe sample PreToolUse payloads into guard-thresholds.mjs (Req 9.8).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyTool, normalizePath, splitShell } from "../guard-thresholds.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.resolve(here, "../guard-thresholds.mjs");
const FIXTURES = path.resolve(here, "fixtures/hook-payloads");

// Created when the module loads, so the case table below can use absolute paths.
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));
const TH = "apps/exhume/evals/thresholds.yaml";
const TASK = "apps/exhume/evals/tasks/core/r001.yaml";
const NEW_TASK = "apps/exhume/evals/tasks/core/r999.yaml";

beforeAll(() => {
  fs.mkdirSync(path.join(repo, "apps/exhume/evals/tasks/core"), { recursive: true });
  fs.writeFileSync(path.join(repo, TH), "core_pass_k3: { min: 0.85 }\n");
  fs.writeFileSync(path.join(repo, TASK), "id: r001\n");
  fs.mkdirSync(path.join(repo, "apps/exhume/src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "apps/exhume/src/a.ts"), "export {};\n");
});
afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

function run(input: string) {
  const r = spawnSync(process.execPath, [GUARD], { input, cwd: repo, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const p = (tool_name: string, tool_input: Record<string, unknown>) =>
  JSON.stringify({ hook_event_name: "PreToolUse", cwd: repo, tool_name, tool_input });

describe("guard-thresholds as a child process", () => {
  const cases: [string, string, 0 | 2, RegExp?][] = [
    ["fs_write to thresholds.yaml", p("fs_write", { path: TH, text: "x" }), 2, /thresholds/],
    ["fs_write with an absolute path", p("fs_write", { path: path.join(repo, TH), text: "x" }), 2, /thresholds/],
    ["fs_append to thresholds.yaml", p("fs_append", { path: TH, text: "x" }), 2],
    ["str_replace on thresholds.yaml", p("str_replace", { path: TH, oldStr: "0.85", newStr: "0.5" }), 2],
    ["str_replace on an existing task", p("str_replace", { path: TASK, oldStr: "r001", newStr: "r1" }), 2, /append-only/],
    ["fs_write over an existing task", p("fs_write", { path: TASK, text: "x" }), 2, /append-only/],
    ["fs_write of a new task", p("fs_write", { path: NEW_TASK, text: "id: r999\n" }), 0],
    ["fs_write of ordinary code", p("fs_write", { path: "apps/exhume/src/b.ts", text: "export {};" }), 0],
    ["delete_file of a task", p("delete_file", { targetFile: TASK }), 2],
    ["delete_file of thresholds.yaml", p("delete_file", { targetFile: TH }), 2],
    ["delete_file of ordinary code", p("delete_file", { targetFile: "apps/exhume/src/a.ts" }), 0],
    ["smart_relocate a task away", p("smart_relocate", { sourcePath: TASK, destinationPath: "tmp/r001.yaml" }), 2],
    ["smart_relocate onto thresholds.yaml", p("smart_relocate", { sourcePath: "tmp/x.yaml", destinationPath: TH }), 2],
    ["smart_relocate the evals folder", p("smart_relocate", { sourcePath: "apps/exhume/evals", destinationPath: "old" }), 2],
    ["smart_relocate ordinary code", p("smart_relocate", { sourcePath: "apps/exhume/src/a.ts", destinationPath: "apps/exhume/src/c.ts" }), 0],
    ["execute_bash redirect into thresholds.yaml", p("execute_bash", { command: `echo 'x: { min: 0 }' > ${TH}` }), 2],
    ["execute_bash sed -i on thresholds.yaml", p("execute_bash", { command: `sed -i 's/0.85/0.1/' ${TH}` }), 2],
    ["execute_bash cat thresholds.yaml", p("execute_bash", { command: `cat ${TH}` }), 0],
    ["execute_bash rm -rf the evals folder", p("execute_bash", { command: "rm -rf apps/exhume/evals" }), 2],
    ["execute_bash rm -rf a glob over apps", p("execute_bash", { command: "rm -rf apps/*" }), 2],
    ["execute_bash cd then edit a task", p("execute_bash", { command: "cd apps/exhume && sed -i 's/a/b/' evals/tasks/core/r001.yaml" }), 2],
    ["execute_bash bash -c wrapper", p("execute_bash", { command: `bash -c "echo 0 > ${TH}"` }), 2],
    ["execute_bash adds a new task", p("execute_bash", { command: `printf 'id: r999\\n' > ${NEW_TASK} && git add ${NEW_TASK}` }), 0],
    ["execute_bash pnpm verify", p("execute_bash", { command: "pnpm verify" }), 0],
    ["execute_bash with its own cwd", p("execute_bash", { command: "rm -rf evals", cwd: path.join(repo, "apps/exhume") }), 2],
    ["control_bash_process start", p("control_bash_process", { action: "start", command: `rm ${TH}` }), 2],
    ["control_bash_process harmless", p("control_bash_process", { action: "start", command: "pnpm spike:voice" }), 0],
    ["read_file is not a mutation", p("read_file", { path: TH }), 0],
  ];

  it.each(cases)("%s", (_name, input, expected, stderrPattern) => {
    const r = run(input);
    expect(r.code, r.stderr).toBe(expected);
    expect(r.stdout).toBe("");
    if (expected === 0) expect(r.stderr).toBe("");
    else expect(r.stderr).toMatch(stderrPattern ?? /guard-thresholds: blocked/);
  });

  it("fails closed on invalid JSON and says what it couldn't parse", () => {
    const r = run("not json {");
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/could not be parsed: invalid JSON/);
    expect(r.stderr).toMatch(/not json \{/);
    expect(r.stderr).toMatch(/docs\/decisions\.md/);
  });

  it("fails closed when tool_input is missing", () => {
    const r = run(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "fs_write" }));
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/tool_input is missing or not an object/);
    expect(r.stderr).toMatch(/docs\/decisions\.md/);
  });

  it("fails closed when tool_name is missing", () => {
    const r = run(JSON.stringify({ tool_input: { path: "a" } }));
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/tool_name is missing/);
  });

  // Req 9.12: the real payload Kiro sent for an attempted write to a thresholds.yaml.
  const captured = path.join(FIXTURES, "kiro-pretooluse-fs_write-thresholds.json");
  it.skipIf(!fs.existsSync(captured))("blocks the captured Kiro PreToolUse payload", () => {
    const raw = fs.readFileSync(captured, "utf8");
    const r = spawnSync(process.execPath, [GUARD], { input: raw, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(2);
  });
});

describe("guard-thresholds helpers", () => {
  it("normalizes Windows, WSL UNC and relative spellings", () => {
    expect(normalizePath("\\\\wsl.localhost\\Ubuntu\\home\\u\\r\\a.ts", "/")).toBe("/home/u/r/a.ts");
    expect(normalizePath("C:\\Repo\\x\\..\\y", "/")).toBe("/mnt/c/Repo/y");
    expect(normalizePath("./a//b/", "/w")).toBe("/w/a/b");
  });

  it("classifies the built-in tools", () => {
    expect(classifyTool("fs_write")).toBe("write");
    expect(classifyTool("str_replace")).toBe("write");
    expect(classifyTool("delete_file")).toBe("delete");
    expect(classifyTool("smart_relocate")).toBe("move");
    expect(classifyTool("execute_bash")).toBe("shell");
    expect(classifyTool("read_file")).toBe("other");
    expect(classifyTool("grep_search")).toBe("other");
  });

  it("splits shell segments and redirects", () => {
    const segs = splitShell(`a "b c" > out.txt 2>&1 && d 'e;f' | g; h >> log`);
    expect(segs.map((s) => s.words)).toEqual([["a", "b c"], ["d", "e;f"], ["g"], ["h"]]);
    expect(segs.map((s) => s.redirects)).toEqual([["out.txt"], [], [], ["log"]]);
  });
});
