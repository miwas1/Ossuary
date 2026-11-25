import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkFile, findImports, packageName } from "../lib/boundaries.ts";

const RUNS = { numRuns: 300 };
const segment = fc.stringMatching(/^[a-z][a-z0-9_-]{0,7}$/);

type Expect = { rule: string | null; allowed: string[] };
const PROVIDERS = ["packages/skeleton/src/gateway/providers/"];
const SEANCE_APP = ["apps/seance/src/app/"];

// Restricted packages, written independently of the RESTRICTED table, with the folders each is allowed in.
const specifiers: [string, Expect][] = [
  ["@anthropic-ai/sdk", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["openai", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@openai/agents", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@google/genai", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@google/generative-ai", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@google-cloud/vertexai", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@mistralai/mistralai", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["cohere-ai", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["groq-sdk", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@ai-sdk/anthropic", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@aws-sdk/client-bedrock-runtime", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@huggingface/inference", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["together-ai", { rule: "model-vendor-sdk", allowed: PROVIDERS }],
  ["@elevenlabs/elevenlabs-js", { rule: "elevenlabs-server-sdk", allowed: [] }],
  ["elevenlabs", { rule: "elevenlabs-server-sdk", allowed: [] }],
  ["@11labs/client", { rule: "elevenlabs-server-sdk", allowed: [] }],
  ["@elevenlabs/convai-widget-core", { rule: "elevenlabs-server-sdk", allowed: [] }],
  ["@elevenlabs/react", { rule: "elevenlabs-browser-sdk", allowed: SEANCE_APP }],
  ["@elevenlabs/client", { rule: "elevenlabs-browser-sdk", allowed: SEANCE_APP }],
  // Benign near misses and ordinary packages
  ["zod", { rule: null, allowed: [] }],
  ["react", { rule: null, allowed: [] }],
  ["node:fs", { rule: null, allowed: [] }],
  ["openai-compatible-types", { rule: null, allowed: [] }],
  ["@anthropic-ai-fake/sdk", { rule: null, allowed: [] }],
  ["@googlex/genai", { rule: null, allowed: [] }],
  ["@aws-sdk/client-s3", { rule: null, allowed: [] }],
  ["@ossuary/skeleton", { rule: null, allowed: [] }],
  ["./local-module", { rule: null, allowed: [] }],
];

const roots = [
  "packages/skeleton/src/gateway/providers/",
  "apps/seance/src/app/",
  "packages/skeleton/src/gateway/providers-evil/",
  "packages/skeleton/src/gateway/",
  "xpackages/skeleton/src/gateway/providers/",
  "apps/seance/src/application/",
  "apps/seance-x/src/app/",
  "apps/seance/src/",
  "apps/exhume/src/domain/",
  "packages/skeleton/src/harness/voice/",
  "scripts/",
  "",
];

// The import forms of Requirement 7.2. Some are TypeScript-only syntax.
const forms: { render: (s: string) => string; tsOnly: boolean }[] = [
  { render: (s) => `import x from "${s}";\nx;`, tsOnly: false },
  { render: (s) => `import "${s}";`, tsOnly: false },
  { render: (s) => `export * from "${s}";`, tsOnly: false },
  { render: (s) => `export { a } from "${s}";`, tsOnly: false },
  { render: (s) => `const m = await import("${s}");\nm;`, tsOnly: false },
  { render: (s) => `const m = require("${s}");\nm;`, tsOnly: false },
  { render: (s) => `import type { T } from "${s}";\nexport type U = T;`, tsOnly: true },
  { render: (s) => `import x = require("${s}");\nx;`, tsOnly: true },
  { render: (s) => `export type M = typeof import("${s}");`, tsOnly: true },
];

const ctx = { skeletonExports: ["."] };

describe("boundary lint properties", () => {
  // Feature: 00-foundations, Property P0-4: a restricted import is reported iff the file is outside the rule's allowed folder.
  it("P0-4 reports a restricted import if and only if the file is outside its allowed folder", () => {
    const file = fc
      .tuple(fc.constantFrom(...roots), fc.array(segment, { maxLength: 2 }), segment, fc.constantFrom(".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"))
      .map(([root, sub, name, ext]) => `${root}${sub.map((s) => `${s}/`).join("")}${name}${ext}`);
    const spec = fc.tuple(fc.constantFrom(...specifiers), fc.option(segment, { nil: undefined })).map(([[s, e], sub]) => {
      const withSub = sub && !s.startsWith(".") && !s.startsWith("node:") ? `${s}/${sub}` : s;
      return [withSub, e] as const;
    });
    fc.assert(
      fc.property(file, spec, fc.constantFrom(...forms), (f, [s, e], form) => {
        fc.pre(!form.tsOnly || /\.[cm]?tsx?$/.test(f));
        const violations = checkFile(f, `// generated\n${form.render(s)}\n`, ctx).filter((v) => v.rule !== "skeleton-internals");
        const expected = e.rule !== null && !e.allowed.some((prefix) => f.startsWith(prefix));
        expect(violations.map((v) => v.rule), `${f}: ${form.render(s)}`).toEqual(expected ? [e.rule] : []);
        if (expected) expect(violations[0]?.line).toBe(2);
      }),
      RUNS,
    );
  });

  // Feature: 00-foundations, Property P0-5: an app import is reported iff it lands inside packages/skeleton/ or is an unexported subpath.
  it("P0-5 reports skeleton deep imports from apps, never the bare package", () => {
    const appFile = fc
      .tuple(fc.constantFrom("exhume", "seance", "newapp"), fc.array(segment, { maxLength: 3 }), segment)
      .map(([app, dirs, name]) => ({ app, dirs, file: `apps/${app}/${[...dirs, `${name}.ts`].join("/")}` }));
    const exportsSet = fc.subarray(["./ui", "./costumes.css", "./gateway"]).map((xs) => [".", ...xs]);
    type Case = { spec: string; expectViolation: (exports: string[]) => boolean };
    const caseFor = (f: { app: string; dirs: string[]; file: string }) =>
      fc.oneof(
        // relative path into the skeleton package
        fc.constantFrom("", "src/index.ts", "src/gateway/router.ts", "dist/index.js", "package.json").map((target): Case => {
          const rel = path.posix.relative(path.posix.dirname(f.file), path.posix.join("packages/skeleton", target)) || ".";
          return { spec: rel.startsWith(".") ? rel : `./${rel}`, expectViolation: () => true };
        }),
        // relative path that stays inside the app
        fc.tuple(fc.nat({ max: f.dirs.length }), segment).map(([ups, name]): Case => ({
          spec: `${ups === 0 ? "./" : "../".repeat(ups)}${name}`,
          expectViolation: () => false,
        })),
        fc.constant<Case>({ spec: "@ossuary/skeleton", expectViolation: () => false }),
        fc.constantFrom("ui", "costumes.css", "gateway", "src/index.ts", "src/guard").map(
          (sub): Case => ({ spec: `@ossuary/skeleton/${sub}`, expectViolation: (ex) => !ex.includes(`./${sub}`) }),
        ),
      );
    fc.assert(
      fc.property(
        appFile.chain((f) => fc.tuple(fc.constant(f), caseFor(f))),
        exportsSet,
        fc.constantFrom(...forms.filter((x) => !x.tsOnly)),
        ([f, c], exportsKeys, form) => {
          const violations = checkFile(f.file, form.render(c.spec), { skeletonExports: exportsKeys });
          expect(violations.map((v) => v.rule), `${f.file}: ${c.spec} with ${exportsKeys.join(",")}`).toEqual(
            c.expectViolation(exportsKeys) ? ["skeleton-internals"] : [],
          );
        },
      ),
      RUNS,
    );
  });

  it("ignores specifiers that only appear in strings and comments", () => {
    const text = `// import x from "openai";\nconst s = "require('@anthropic-ai/sdk')";\n/* export * from "@google/genai" */\ns;`;
    expect(findImports("apps/exhume/src/a.ts", text)).toEqual([]);
  });

  it("finds the package of a specifier", () => {
    expect(packageName("openai/resources/chat")).toBe("openai");
    expect(packageName("@anthropic-ai/sdk/streaming")).toBe("@anthropic-ai/sdk");
    expect(packageName("./x")).toBeNull();
    expect(packageName("node:fs")).toBeNull();
  });
});
