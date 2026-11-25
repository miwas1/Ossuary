// MODEL-07 and house rule 3: model IDs and prices live only in models.yaml (Req 16.3, 12.5, 14.3).
// docs/ holds the source documents and the decision record, which discuss models by name.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { walkFiles } from "../lib/walk.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const THIS_FILE = "scripts/test/model-register.test.ts";
const ALLOWED = (f: string) => f === "models.yaml" || f.startsWith("docs/") || f === THIS_FILE || f === "pnpm-lock.yaml";

const MODEL_ID = /\b(?:claude|gpt|gemini|deepseek|mistral|llama|grok|command-r|qwen)-[a-z0-9.-]*\d/i;
const MODEL_NAME = /\b(?:haiku|sonnet|opus|fable|mythos|astra|hydrogen|argon|carbon)\s+\d+(?:\.\d+)?\b/i;
const PRICE = /\$\s?\d+(?:\.\d+)?\s*\/\s*\$\s?\d+(?:\.\d+)?|\bper (?:million|M) tokens\b.*\$\d/i;

describe("volatile register", () => {
  it("keeps model IDs and prices out of every file except models.yaml and docs/", () => {
    const files = walkFiles(root, [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".md", ".yaml", ".yml"]).filter(
      (f) => !ALLOWED(f),
    );
    const hits: string[] = [];
    for (const f of files) {
      fs.readFileSync(path.join(root, f), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (MODEL_ID.test(line) || MODEL_NAME.test(line) || PRICE.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("models.yaml has the three tiers and an empty prices block", () => {
    const text = fs.readFileSync(path.join(root, "models.yaml"), "utf8");
    for (const tier of ["small", "mid", "frontier"]) expect(text).toMatch(new RegExp(`^\\s+${tier}:\\s+\\{\\s*primary: "[a-z]+:[^"]+",\\s*fallback: "[a-z]+:[^"]+"\\s*\\}`, "m"));
    expect(text).toMatch(/^prices: \{\}/m);
  });
});
