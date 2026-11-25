import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { END_MARKER, START_MARKER, countBoneLines, isCounted, renderTable, rewriteReadme } from "../lib/bones.ts";

const RUNS = { numRuns: 300 };
const ident = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,6}$/).filter((s) => !["do", "if", "in", "for", "let", "new", "try", "var", "case", "else", "enum", "this", "void", "with", "break", "catch", "class", "const", "super", "throw", "while", "yield", "delete", "export", "import", "return", "switch", "typeof", "default", "extends", "finally", "continue", "debugger", "function", "instanceof", "type", "interface", "await", "async", "of", "as", "is"].includes(s));

// One-line statements that each hold code.
const statement = fc.oneof(
  fc.tuple(ident, fc.integer()).map(([n, v]) => `const ${n}_${Math.abs(v)} = ${v};`),
  ident.map((n) => `export type ${n.toUpperCase()}T = { ${n}: string };`),
  ident.map((n) => `function ${n}F() { return 1; }`),
  fc.string({ maxLength: 10 }).map((s) => `console.log(${JSON.stringify(s)});`),
);
// Lines that hold no code.
const trivia = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.string({ maxLength: 20 }).map((s) => `// ${s.replace(/[\r\n\u2028\u2029]/g, " ")}`),
  fc.string({ maxLength: 20 }).map((s) => `/* ${s.replace(/\*\//g, "").replace(/[\r\n\u2028\u2029]/g, " ")} */`),
  fc.constant("/**\n * Docs.\n * @param x the input\n */"),
  fc.constant("/*\n  block\n*/"),
);

/** Interleave statements with trivia at random positions. */
const fileOf = (statements: string[]) =>
  fc.array(fc.tuple(fc.nat(), trivia), { maxLength: 12 }).map((inserts) => {
    const lines = [...statements];
    for (const [pos, t] of inserts) lines.splice(pos % (lines.length + 1), 0, t);
    return lines.join("\n");
  });

describe("bones counter properties", () => {
  // Feature: 00-foundations, Property P0-6: trivia and test files never change a count; a package total is the sum of its files.
  it("P0-6 counts statements, ignores trivia, and sums per file", () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(statement, { minLength: 0, maxLength: 8 }), { minLength: 1, maxLength: 4 }).chain((files) =>
          fc.tuple(fc.constant(files), fc.tuple(...files.map((f) => fileOf(f)))),
        ),
        ([statementsPerFile, texts]) => {
          const counts = texts.map((t, i) => countBoneLines(`f${i}.ts`, t));
          counts.forEach((c, i) => expect(c, texts[i]).toBe(statementsPerFile[i]?.length));
          const total = counts.reduce((a, b) => a + b, 0);
          expect(total).toBe(statementsPerFile.reduce((a, s) => a + s.length, 0));
        },
      ),
      RUNS,
    );
  });

  it("P0-6 never counts test files, declaration files or skipped folders", () => {
    fc.assert(
      fc.property(
        fc.array(ident, { maxLength: 3 }),
        ident,
        fc.constantFrom(".test.ts", ".spec.ts", ".test.tsx", ".spec.mts", ".d.ts", ".d.mts"),
        (dirs, name, ext) => {
          expect(isCounted([...dirs, `${name}${ext}`].join("/"))).toBe(false);
          expect(isCounted([...dirs, "__tests__", `${name}.ts`].join("/"))).toBe(false);
          expect(isCounted([...dirs, "node_modules", `${name}.ts`].join("/"))).toBe(false);
          expect(isCounted([...dirs, `${name}.ts`].join("/"))).toBe(true);
        },
      ),
      RUNS,
    );
  });

  // Feature: 00-foundations, Property P0-7: text outside the markers is unchanged, and rewriting is idempotent.
  it("P0-7 keeps every byte outside the markers and is idempotent", () => {
    const noMarkers = fc.string({ maxLength: 200 }).filter((s) => !s.includes(START_MARKER) && !s.includes(END_MARKER));
    const table = fc.array(fc.tuple(ident, fc.nat(5000)), { maxLength: 4 }).map((apps) =>
      renderTable({ name: "@ossuary/skeleton", lines: 120 }, apps.map(([name, lines]) => ({ name, lines }))),
    );
    fc.assert(
      fc.property(noMarkers, noMarkers, noMarkers, table, (before, oldBody, after, t) => {
        const readme = `${before}${START_MARKER}${oldBody}${END_MARKER}${after}`;
        fc.pre(readme.split(START_MARKER).length === 2 && readme.split(END_MARKER).length === 2);
        const once = rewriteReadme(readme, t);
        if (!once.ok) throw new Error(once.reason);
        expect(once.text.startsWith(`${before}${START_MARKER}`)).toBe(true);
        expect(once.text.endsWith(`${END_MARKER}${after}`)).toBe(true);
        const twice = rewriteReadme(once.text, t);
        expect(twice.ok && twice.text).toBe(once.text);
        expect(twice.ok && twice.changed).toBe(false);
      }),
      RUNS,
    );
  });

  it("P0-7 refuses missing, repeated or reversed markers", () => {
    for (const bad of [
      "no markers",
      `${START_MARKER} only start`,
      `only end ${END_MARKER}`,
      `${END_MARKER} reversed ${START_MARKER}`,
      `${START_MARKER}${START_MARKER}${END_MARKER}`,
      `${START_MARKER}${END_MARKER}${END_MARKER}`,
    ]) {
      expect(rewriteReadme(bad, "| t |").ok, bad).toBe(false);
    }
  });

  it("renders the share column", () => {
    expect(renderTable({ name: "@ossuary/skeleton", lines: 300 }, [{ name: "seance", lines: 100 }, { name: "exhume", lines: 0 }])).toBe(
      [
        "| Package | Bone lines | App-specific share |",
        "| --- | ---: | ---: |",
        "| @ossuary/skeleton | 300 | — |",
        "| exhume | 0 | 0% |",
        "| seance | 100 | 25% |",
      ].join("\n"),
    );
    expect(renderTable({ name: "@ossuary/skeleton", lines: 0 }, [{ name: "a", lines: 0 }])).toContain("| a | 0 | — |");
  });

  it("counts every line of a multi-line template literal", () => {
    expect(countBoneLines("t.ts", "const s = `a\nb\nc`;\n")).toBe(3);
  });
});
