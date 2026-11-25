import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decide } from "../guard-thresholds.mjs";
import { append, bash, del, moveFrom, moveTo, probe, q, replace, write } from "./guard-helpers.ts";

const RUNS = { numRuns: 300 };

// A plain path segment that is never the literal "evals", so prefixes can't create a protected path by accident.
const segment = fc.stringMatching(/^[a-z0-9_-]{1,8}$/).filter((s) => s !== "evals");
const prefix = fc.array(segment, { minLength: 0, maxLength: 4 });

/** Re-spell a list of segments: random separators, case, `./` and `x/../` segments, and an absolute prefix. */
const spelling = (segments: string[]) =>
  fc
    .record({
      seps: fc.array(fc.constantFrom("/", "\\", "//"), { minLength: segments.length, maxLength: segments.length }),
      upper: fc.array(fc.boolean(), { minLength: 64, maxLength: 64 }),
      dots: fc.array(fc.constantFrom("", "./", "zz/../"), { minLength: segments.length, maxLength: segments.length }),
      root: fc.constantFrom("", "/home/u/r/", "C:\\r\\", "c:/r/", "\\\\wsl.localhost\\Ubuntu\\h\\", "//wsl$/Ubuntu/h/"),
    })
    .map(({ seps, upper, dots, root }) => {
      let out = root;
      segments.forEach((seg, i) => {
        const dot = (dots[i] ?? "").replace(/\//g, seps[i] ?? "/");
        out += dot + seg + (i < segments.length - 1 ? (seps[i] ?? "/") : "");
      });
      return [...out].map((ch, i) => (upper[i % 64] ? ch.toUpperCase() : ch)).join("");
    });

const thresholdPath = prefix.chain((pre) => spelling([...pre, "evals", "thresholds.yaml"]));
const taskPath = fc
  .tuple(prefix, fc.array(segment, { minLength: 0, maxLength: 3 }))
  .chain(([pre, sub]) => spelling([...pre, "evals", "tasks", ...sub]));

const mutatingThreshold: ((p: string) => string)[] = [
  write,
  append,
  replace,
  del,
  moveFrom,
  moveTo,
  (p) => bash(`echo 'x: { min: 0 }' > ${q(p)}`),
  (p) => bash(`sed -i 's/0.85/0.1/' ${q(p)}`),
  (p) => bash(`rm -f ${q(p)}`),
  (p) => bash(`mv ${q(p)} /tmp/t.yaml`),
  (p) => bash(`cp /tmp/loose.yaml ${q(p)}`),
];

const mutatingExistingTask: ((p: string) => string)[] = [
  write,
  append,
  replace,
  del,
  moveFrom,
  moveTo,
  (p) => bash(`rm -rf ${q(p)}`),
  (p) => bash(`mv ${q(p)} /tmp/old`),
  (p) => bash(`git rm -r ${q(p)}`),
  (p) => bash(`sed -i 's/expected/actual/' ${q(p)}`),
  (p) => bash(`echo '{}' > ${q(p)}`),
];

describe("guard-thresholds properties", () => {
  // Feature: 00-foundations, Property P0-1: every mutating payload on any spelling of a threshold file exits 2.
  it("P0-1 blocks every mutation of a thresholds.yaml, however the path is written", () => {
    fc.assert(
      fc.property(thresholdPath, fc.constantFrom(...mutatingThreshold), (p, build) => {
        const d = decide(build(p), { fsProbe: probe() });
        expect(d.exit, `${build(p)}\n${d.reasons.join("\n")}`).toBe(2);
      }),
      RUNS,
    );
  });

  // Feature: 00-foundations, Property P0-2: every write, edit, delete or move of an existing task path exits 2.
  it("P0-2 blocks every change, move or delete of an existing eval task", () => {
    fc.assert(
      fc.property(taskPath, fc.constantFrom(...mutatingExistingTask), (p, build) => {
        const d = decide(build(p), { fsProbe: probe({ exists: true }) });
        expect(d.exit, `${build(p)}\n${d.reasons.join("\n")}`).toBe(2);
      }),
      RUNS,
    );
  });

  // Feature: 00-foundations, Property P0-3: unprotected paths, new task files and read-only commands exit 0.
  describe("P0-3 lets everything else through", () => {
    const nearMiss = fc.tuple(
      prefix,
      fc.constantFrom(
        ["evals", "thresholds.yaml.bak"],
        ["evals", "threshold.yaml"],
        ["evalsx", "thresholds.yaml"],
        ["myevals", "thresholds.yaml"],
        ["evals-old", "tasks", "a.yaml"],
        ["myevals", "tasks", "a.yaml"],
        ["eval", "tasks", "a.yaml"],
        ["evals", "taskset", "a.yaml"],
        ["evals", "results", "run.json"],
        ["src", "index.ts"],
      ),
    );
    const anyPayload: ((p: string) => string)[] = [
      ...mutatingThreshold,
      ...mutatingExistingTask,
      (p) => bash(`cat ${q(p)}`),
    ];

    it("(a) any payload on a near miss or an unrelated path", () => {
      fc.assert(
        fc.property(nearMiss.chain(([pre, tail]) => spelling([...pre, ...tail])), fc.constantFrom(...anyPayload), (p, build) => {
          const d = decide(build(p), { fsProbe: probe({ exists: true }) });
          expect(d.exit, `${build(p)}\n${d.reasons.join("\n")}`).toBe(0);
        }),
        RUNS,
      );
    });

    it("(b) creating a new file inside evals/tasks/", () => {
      const creators: ((p: string) => string)[] = [
        write,
        append,
        moveTo,
        (p) => bash(`cat > ${q(p)} <<'EOF'\nid: new\nEOF`),
        (p) => bash(`touch ${q(p)}`),
        (p) => bash(`git add ${q(p)}`),
      ];
      const newTask = fc
        .tuple(prefix, fc.array(segment, { minLength: 1, maxLength: 3 }))
        .chain(([pre, sub]) => spelling([...pre, "evals", "tasks", ...sub]));
      fc.assert(
        fc.property(newTask, fc.constantFrom(...creators), (p, build) => {
          const d = decide(build(p), { fsProbe: probe({ exists: false }) });
          expect(d.exit, `${build(p)}\n${d.reasons.join("\n")}`).toBe(0);
        }),
        RUNS,
      );
    });

    it("(c) read-only shell commands on thresholds and existing tasks", () => {
      const readers: ((p: string) => string)[] = [
        (p) => bash(`cat ${q(p)}`),
        (p) => bash(`head -n 5 ${q(p)}`),
        (p) => bash(`grep -n min ${q(p)}`),
        (p) => bash(`wc -l ${q(p)}`),
        (p) => bash(`ls -la ${q(p)}`),
        (p) => bash(`git diff -- ${q(p)}`),
        (p) => bash(`git log --oneline -- ${q(p)}`),
        (p) => bash(`git add ${q(p)} && git commit -m 'add'`),
      ];
      fc.assert(
        fc.property(fc.oneof(thresholdPath, taskPath), fc.constantFrom(...readers), (p, build) => {
          const d = decide(build(p), { fsProbe: probe({ exists: true }) });
          expect(d.exit, `${build(p)}\n${d.reasons.join("\n")}`).toBe(0);
        }),
        RUNS,
      );
    });
  });
});
