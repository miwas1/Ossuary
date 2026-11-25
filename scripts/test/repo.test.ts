// Repo-level checks for Phase 0 (Requirements 1, 3, 4, 12, 13, 15, 17, 18).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
const exists = (f: string) => fs.existsSync(path.join(root, f));

describe("repo layout", () => {
  it("keeps the source documents in docs/ only", () => {
    for (const f of ["docs/implementation-plan.md", "docs/framework-spec.md", "docs/kiro-prompts.md", "docs/decisions.md", "docs/kiro-log.md"]) {
      expect(exists(f), f).toBe(true);
    }
    expect(exists("framework-spec.md")).toBe(false);
    expect(exists("Ossuary — Implementation Plan.md")).toBe(false);
  });

  it("has the MIT licence with the right holder", () => {
    const licence = read("LICENSE");
    expect(licence).toMatch(/^MIT License/);
    expect(licence).toMatch(/^Copyright \(c\) 2026 \S.*$/m);
  });

  it("has each bones marker exactly once, start first", () => {
    const readme = read("README.md");
    expect(readme.split("<!-- bones:start -->")).toHaveLength(2);
    expect(readme.split("<!-- bones:end -->")).toHaveLength(2);
    expect(readme.indexOf("<!-- bones:start -->")).toBeLessThan(readme.indexOf("<!-- bones:end -->"));
  });

  it("does not ignore .kiro/", () => {
    expect(read(".gitignore")).not.toMatch(/^\s*\/?\.kiro/m);
    const r = spawnSync("git", ["check-ignore", "-q", ".kiro/steering/product.md", ".kiro/hooks/x.json", ".kiro/specs/00-foundations/tasks.md"], { cwd: root });
    if (r.error) return; // git not available: the .gitignore text check above still applies
    expect(r.status, "git check-ignore matched a .kiro path").toBe(1);
  });

  it("exposes the skeleton only through its entry point", () => {
    const pkg = JSON.parse(read("packages/skeleton/package.json")) as { name: string; exports: Record<string, string> };
    expect(pkg.name).toBe("@ossuary/skeleton");
    expect(pkg.exports).toEqual({ ".": "./src/index.ts" });
  });

  it("pins Node 24", () => {
    expect(read(".nvmrc").trim()).toBe("24");
    expect((JSON.parse(read("package.json")) as { engines: { node: string } }).engines.node).toBe(">=24 <25");
    expect(parse(read("pnpm-workspace.yaml"))).toMatchObject({ engineStrict: true });
  });
});

describe("Kiro layer", () => {
  const steering: Record<string, { inclusion: string; fileMatchPattern?: string[] }> = {
    "product.md": { inclusion: "always" },
    "tech.md": { inclusion: "always" },
    "structure.md": { inclusion: "always" },
    "ui.md": { inclusion: "fileMatch", fileMatchPattern: ["**/*.tsx"] },
    "security.md": { inclusion: "fileMatch", fileMatchPattern: ["packages/skeleton/src/guard/**", "apps/*/src/domain/**", "**/tools/**"] },
    "evals.md": { inclusion: "fileMatch", fileMatchPattern: ["**/evals/**"] },
    "archetype-ext.md": { inclusion: "fileMatch", fileMatchPattern: ["apps/exhume/**"] },
    "archetype-cnv.md": { inclusion: "fileMatch", fileMatchPattern: ["apps/seance/**"] },
    "plan.md": { inclusion: "manual" },
    "framework.md": { inclusion: "manual" },
  };

  it.each(Object.entries(steering))("steering %s has the plan's front matter", (file, expected) => {
    const text = read(`.kiro/steering/${file}`);
    const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
    expect(m, `${file} has no front matter`).not.toBeNull();
    expect(parse(m![1]!)).toEqual(expected);
  });

  it("manual steering files hold only their file reference", () => {
    expect(read(".kiro/steering/plan.md").replace(/^---[\s\S]*?---\n/, "").trim()).toBe("#[[file:docs/implementation-plan.md]]");
    expect(read(".kiro/steering/framework.md").replace(/^---[\s\S]*?---\n/, "").trim()).toBe("#[[file:docs/framework-spec.md]]");
  });

  it("product.md carries the five house rules", () => {
    const text = read(".kiro/steering/product.md");
    expect(text).toMatch(/1\. Skeleton first/);
    expect(text).toMatch(/2\. Anything deterministic/);
    expect(text).toMatch(/3\. Model names and prices live only in `models.yaml`/);
    expect(text).toMatch(/4\. No eval, no merge/);
    expect(text).toMatch(/5\. Where `docs\/decisions.md` differs from the plan, `docs\/decisions.md` wins/);
  });

  it("has the five hooks as v1 JSON", () => {
    const expected: Record<string, string> = {
      "eval-on-save": "pnpm eval --changed --sets regression,safety",
      "no-vendor-sdk": "pnpm lint:boundaries",
      "bone-count": "pnpm bones",
      "guard-thresholds": "node scripts/guard-thresholds.mjs",
    };
    for (const [name, command] of Object.entries(expected)) {
      const hook = JSON.parse(read(`.kiro/hooks/${name}.json`)) as { version: string; hooks: { action: { command?: string } }[] };
      expect(hook.version, name).toBe("v1");
      expect(hook.hooks[0]?.action.command, name).toBe(command);
    }
    const stop = JSON.parse(read(".kiro/hooks/record-on-stop.json")) as { version: string; hooks: { trigger: string; action: { type: string } }[] };
    expect(stop.version).toBe("v1");
    expect(stop.hooks[0]?.action.type).not.toBe("command");
  });

  it("has the maker and judge agents without a model field", () => {
    for (const name of ["maker", "judge"]) {
      const agent = JSON.parse(read(`.kiro/agents/${name}.json`)) as Record<string, unknown>;
      expect(agent.name).toBe(name);
      expect(agent).not.toHaveProperty("model");
    }
    const judge = JSON.parse(read(".kiro/agents/judge.json")) as { tools: string[] };
    expect(judge.tools).not.toContain("write");
  });

  it("MCP settings point at both apps, read the key from the environment, and start disabled", () => {
    if (!exists(".kiro/settings/mcp.json") || read(".kiro/settings/mcp.json").trim() === "") return; // you create this file (D-20)
    const cfg = JSON.parse(read(".kiro/settings/mcp.json")) as { mcpServers: Record<string, { url: string; headers: Record<string, string>; disabled?: boolean }> };
    expect(cfg.mcpServers.exhume?.url).toBe("http://localhost:3001/api/mcp");
    expect(cfg.mcpServers.seance?.url).toBe("http://localhost:3002/api/mcp");
    for (const s of Object.values(cfg.mcpServers)) {
      expect(s.headers.Authorization).toBe("Bearer ${OSSUARY_MCP_KEY}");
      expect(s.disabled).toBe(true);
    }
  });

  it("render.yaml holds no secret values", () => {
    const blueprint = parse(read("render.yaml")) as { envVarGroups: { envVars: { key: string; sync?: boolean; value?: string }[] }[] };
    for (const v of blueprint.envVarGroups.flatMap((g) => g.envVars)) {
      if (v.key !== "DEMO_MODE") expect(v.sync, v.key).toBe(false);
    }
  });

  it("AGENTS.md is three lines pointing to .kiro/steering/", () => {
    const lines = read("AGENTS.md").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).toMatch(/\.kiro\/steering\//);
  });
});
