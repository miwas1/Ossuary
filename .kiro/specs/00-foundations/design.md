# Design: 00-foundations (Phase 0)

## Overview

Phase 0 is configuration, the `createDb` helper (see Database), and five small programs:

| Program | Path | Runs as | Correctness properties |
| --- | --- | --- | --- |
| Boundary lint | `scripts/lint-boundaries.ts` + `scripts/lib/boundaries.ts` | `pnpm lint:boundaries`, the `no-vendor-sdk` hook, `pnpm verify` | P0-4, P0-5 |
| Bones counter | `scripts/bone-count.ts` + `scripts/lib/bones.ts` | `pnpm bones`, the `bone-count` hook | P0-6, P0-7 |
| Threshold guard | `scripts/guard-thresholds.mjs` | the `guard-thresholds` PreToolUse hook | P0-1, P0-2, P0-3 |
| Threshold check | `scripts/check-thresholds.ts` + `scripts/lib/thresholds.ts` | the pull-request workflow | P0-8 |
| Voice spike server | `scripts/voice-spike-server.ts` | `pnpm spike:voice` | none (checked with `curl`) |

Each program keeps its decision logic in a pure function that takes text and returns findings. A thin entry file does the I/O. The property tests call the pure functions, and the guard also gets child-process tests (Requirement 9.8).

Decisions are numbered `D-nn` and recorded in `docs/decisions.md`. D-01 to D-19 come from the requirements round. D-20 to D-31 are new in this design and are listed under "Departures from the plan" at the end.

## Repository layout after Phase 0

```text
ossuary/
├── .github/workflows/ci.yml              push: pnpm verify
├── .github/workflows/thresholds.yml      pull_request: threshold check
├── .kiro/
│   ├── steering/   product tech structure ui security evals archetype-ext archetype-cnv plan framework (.md)
│   ├── specs/00-foundations/             requirements.md design.md tasks.md
│   ├── hooks/      eval-on-save no-vendor-sdk bone-count guard-thresholds record-on-stop (.json)
│   ├── agents/     maker.json judge.json
│   └── settings/mcp.json                 created by you (D-20)
├── packages/
│   ├── skeleton/                         @ossuary/skeleton
│   │   ├── package.json  tsconfig.json  drizzle.config.ts
│   │   └── src/
│   │       ├── index.ts                  export {};
│   │       ├── manifest/ gateway/ gateway/providers/ harness/ harness/voice/ guard/ evals/ trace/ mcp/ ui/ blob/   (.gitkeep)
│   │       └── db/  client.ts  schema.ts  migrate.ts  migrate.test.ts  migrations/0000_init.sql  migrations/meta/{_journal.json,0000_snapshot.json}
│   └── create-ossuary/                   package.json tsconfig.json src/index.ts
├── apps/
│   ├── exhume/  package.json tsconfig.json src/index.ts src/app/ src/domain/ prompts/ skills/ evals/{tasks,graders,results}/ fixtures/
│   └── seance/  same shape
├── power/                                .gitkeep
├── docs/       implementation-plan.md framework-spec.md kiro-prompts.md decisions.md kiro-log.md
├── scripts/                              workspace package @ossuary/scripts (private)
│   ├── package.json tsconfig.json
│   ├── guard-thresholds.mjs  guard-thresholds.d.mts  capture-hook-payload.mjs  not-built-yet.mjs
│   ├── lint-boundaries.ts  bone-count.ts  check-thresholds.ts  voice-spike-server.ts
│   ├── lib/   boundaries.ts  bones.ts  thresholds.ts  walk.ts
│   └── test/  guard.test.ts guard.property.test.ts boundaries.property.test.ts bones.property.test.ts thresholds.property.test.ts
│              fixtures/hook-payloads/*.json
├── models.yaml  render.yaml  docker-compose.yml  .dockerignore  .env.example
├── package.json  pnpm-workspace.yaml  pnpm-lock.yaml  turbo.json  tsconfig.base.json  eslint.config.mjs
├── .nvmrc  .gitignore  LICENSE  README.md  CHANGELOG.md  AGENTS.md
```

`make-receipts.ts` from plan §4 belongs to Phase 4 and is not created.

## Toolchain

**Versions.** Node 24 is installed with nvm and recorded in `.nvmrc` (`24`) and `engines.node` (`">=24 <25"`). `packageManager` pins the exact pnpm version that `corepack` resolves under Node 24. Shared dev tools (TypeScript, Vitest, fast-check, ESLint, typescript-eslint, tsx, `@types/node` 24.x) are pinned once in a pnpm catalog in `pnpm-workspace.yaml` and referenced as `catalog:` from each package (D-28). Versions are the latest stable on the day of install.

**pnpm-workspace.yaml**

```yaml
packages: ["packages/*", "apps/*", "scripts"]
engineStrict: true
allowBuilds:
  'esbuild@0.18.20': true
  'esbuild@0.25.12': true
  'esbuild@0.28.2': true
catalog: { typescript: ..., vitest: ..., fast-check: ..., eslint: ..., typescript-eslint: ..., tsx: ..., "@types/node": ... }
overrides: { "@types/node": "catalog:" }
```

**Root package.json scripts**

| Script | Command | Notes |
| --- | --- | --- |
| `verify` | `pnpm lint:boundaries && turbo run typecheck lint test` | No evals in Phase 0 (Req 6.2) |
| `typecheck`, `lint`, `test`, `build` | `turbo run <task>` | |
| `lint:boundaries` | `tsx scripts/lint-boundaries.ts` | Root task: it spans packages |
| `bones` | `tsx scripts/bone-count.ts` | |
| `thresholds:check` | `tsx scripts/check-thresholds.ts` | Used by CI |
| `eval` | `node scripts/not-built-yet.mjs eval` | Prints `not built yet: pnpm eval (Phase 2)`, exits 0 |
| `db:migrate` | `pnpm --filter @ossuary/skeleton db:migrate` | |
| `db:generate` | `pnpm --filter @ossuary/skeleton db:generate` | Phase 1 onwards |
| `spike:voice` | `tsx scripts/voice-spike-server.ts` | |

**Per-package scripts.** Every workspace package has `typecheck: tsc --noEmit`, `lint: eslint .` and `test: vitest run --passWithNoTests`. No package has a `build` script yet, so `turbo run build` is a no-op until Phase 1.

**turbo.json**: tasks `build` (`dependsOn: ["^build"]`, outputs `dist/**`), `typecheck`, `lint` and `test`, all cacheable.

**tsconfig.base.json**: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`, `target: ES2023`, `module` and `moduleResolution: NodeNext`, `types: ["node"]`. Each package's `tsconfig.json` extends it. The Next.js apps will override module settings in Phases 4 and 5.

**eslint.config.mjs** (flat config at the root): `@eslint/js` recommended plus `typescript-eslint` recommended, ignoring `dist`, `.next`, `.turbo`, `coverage` and `node_modules`. Each package's `eslint .` finds it by walking up.

**@ossuary/skeleton package.json**: `"exports": { ".": "./src/index.ts" }` (Req 3.2). Apps can consume TypeScript source directly. Phase 1 decides whether to add a build step.

## Database

Nothing local needs Docker (D-35). There are three database targets:

| Where | Database | How it's reached |
| --- | --- | --- |
| Your machine | PostgreSQL installed in WSL by you | `DATABASE_URL` in `.env` |
| Tests, `pnpm verify`, CI | PGlite inside the Node process | `createDb('pglite://memory')` |
| CI (second pass) and production | Postgres 16 (service container; Render) | `TEST_DATABASE_URL` in CI; `DATABASE_URL` on Render |

**createDb (`packages/skeleton/src/db/client.ts`).**

```ts
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;   // common type for both drivers
export interface DbHandle { db: Db; driver: 'pglite' | 'postgres'; close(): Promise<void> }
export function createDb(url: string): Promise<DbHandle>;
export function migrateDb(handle: DbHandle): Promise<void>;     // runs ./migrations with the matching drizzle migrator
```

- `pglite://memory` → `new PGlite()` in memory; `pglite://<folder>` → `new PGlite(<folder>)`, with a relative folder resolved against the working directory. Both use `drizzle-orm/pglite`. The PGlite module is loaded with a dynamic `import()`, so production code that only uses `postgres://` never loads the WASM build.
- `postgres://…` and `postgresql://…` → a node-postgres (`pg`) `Pool` with `drizzle-orm/node-postgres`.
- Anything else throws `createDb: unsupported URL scheme "<scheme>"; use pglite://memory, pglite://<folder> or postgres://`. The URL itself is never echoed, because it can hold a password.
- `migrateDb` uses `drizzle-orm/pglite/migrator` or `drizzle-orm/node-postgres/migrator`, with `migrationsFolder` resolved from `import.meta.url`, so it works from any working directory.

`createDb` is not exported from `src/index.ts` in Phase 0 (Req 21.1). `migrate.ts` and the tests import it from `./client.ts`. Phase 1 decides the public `db` export.

The skeleton's dependencies are `drizzle-orm`, `pg` and `@electric-sql/pglite`, with `drizzle-kit` and `@types/pg` as dev dependencies.

**Database test (`packages/skeleton/src/db/migrate.test.ts`).** It runs one suite per target: always `pglite://memory`, and `TEST_DATABASE_URL` too when it is set. Each suite calls `migrateDb` and then checks that `drizzle.__drizzle_migrations` holds one row per journal entry (one today), and that a second `migrateDb` adds none. Tests never read `DATABASE_URL`, so they can't touch your development database.

**Version spread.** The WSL install on this machine is PostgreSQL 18 (Ubuntu 26.04's default), and PGlite embeds a newer major than 16 as well. Production and the CI service container stay on 16, so the CI service pass is the check that the SQL works on 16. See the open question at the end.

**docker-compose.yml (kept for Docker hosts; never run here)**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?copy .env.example to .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?copy .env.example to .env}
      POSTGRES_DB: ${POSTGRES_DB:?copy .env.example to .env}
    ports: ["127.0.0.1:${POSTGRES_PORT:-5432}:5432"]
    volumes: [ossuary-pg:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"], interval: 2s, retries: 30 }
volumes: { ossuary-pg: {} }
```

Compose has no default password: it refuses to start until `.env` exists (D-30). Phase 7 adds the `apps` profile with both app services. `.env.example` holds `DATABASE_URL` in the WSL form from plan §12, the `POSTGRES_*` values compose needs, and an empty line for each later secret.

`.dockerignore` excludes `node_modules`, `.next`, `.turbo`, `dist`, `coverage`, `.git`, `.env` and `.env.*` (keeping `.env.example`), so later app images never copy secrets or local builds.

**Drizzle.** `packages/skeleton/drizzle.config.ts` sets `dialect: "postgresql"`, `schema: "./src/db/schema.ts"` and `out: "./src/db/migrations"`. It sits at the package root rather than in `src/db/` because drizzle-kit looks for it there, and so it isn't counted as a skeleton bone. `schema.ts` is `export {};` with a comment that Phase 1 adds the `bones` schema. The empty migration is generated with `drizzle-kit generate --custom --name=init`, which writes `0000_init.sql` (a comment only), the journal and the snapshot.

**migrate.ts** (`pnpm db:migrate`). It loads the root `.env` with `process.loadEnvFile` if the file exists. If `DATABASE_URL` is unset or empty, it prints `DATABASE_URL is not set (see .env.example)` and exits 1 (Req 5.7). Otherwise it calls `createDb(DATABASE_URL)`, `migrateDb`, then `close`. A connection failure prints the host and port only, never the URL. If a driver rejects the comment-only migration, the fallback is `SELECT 1;`, recorded in decisions.md.

**Forward note for Phase 2 (D-35).** `pnpm eval` will call `createDb(process.env.DATABASE_URL || 'pglite://memory')` and will always write the results JSON as well, so evals run without a database server.

## Boundary lint

```ts
// scripts/lib/boundaries.ts
export type RuleId = 'model-vendor-sdk' | 'elevenlabs-server-sdk' | 'elevenlabs-browser-sdk' | 'skeleton-internals';
export interface Violation { file: string; line: number; specifier: string; rule: RuleId; message: string }
export interface Rule { id: RuleId; packages: string[]; allowedUnder: string[] }  // "@scope/*" or exact names

export const RESTRICTED: readonly Rule[];   // ordered, first match wins (most specific first)
export function findImports(file: string, text: string): { specifier: string; line: number }[];
export function packageName(specifier: string): string | null;  // null for relative, absolute and node: specifiers
export function checkFile(file: string, text: string, ctx: { skeletonExports: string[] }): Violation[];
```

**Restricted packages** (`RESTRICTED`, one table, Req 7.3):

| Order | Rule | Packages | Allowed under |
| --- | --- | --- | --- |
| 1 | `elevenlabs-browser-sdk` | `@elevenlabs/react`, `@elevenlabs/client` | `apps/seance/src/app/` |
| 2 | `elevenlabs-server-sdk` | `@elevenlabs/*`, `@11labs/*`, `elevenlabs` | nowhere (D-21) |
| 3 | `model-vendor-sdk` | `@anthropic-ai/*`, `openai`, `@openai/*`, `@google/genai`, `@google/generative-ai`, `@google-cloud/vertexai`, `@mistralai/*`, `cohere-ai`, `groq-sdk`, `@ai-sdk/*`, `@aws-sdk/client-bedrock-runtime`, `@huggingface/inference`, `together-ai`, `@deepseek/*`, `@xai/*`, `ollama` | `packages/skeleton/src/gateway/providers/` |

A package matches by exact name or by scope. Subpaths match their package: `openai/resources` is `openai`. "Allowed under" is a prefix test on the repo-relative path with a trailing slash, so `providers-evil/` does not match `providers/`.

**Finding imports.** `findImports` parses the file with `ts.createSourceFile`, using the script kind for its extension, and walks the AST:
- `ImportDeclaration`, including `import type`.
- `ExportDeclaration` with a module specifier.
- `ImportEqualsDeclaration` with an external module reference.
- `CallExpression` whose callee is the `import` keyword or the identifier `require`, with a string-literal first argument.
- `ImportTypeNode` (`typeof import('x')`).

Because this uses a real parse, strings and comments that merely mention a package are ignored. A dynamic import of a computed string can't be resolved and is not reported; Phase 1 code review covers that.

**Skeleton internals** (Req 7.7, D-22). This rule applies only to files under `apps/<name>/`, and the file is checked for each specifier:
- **Relative or absolute specifiers** are resolved against the file's directory with `path.posix`. If the result lands inside `packages/skeleton/`, the import is a violation.
- **`@ossuary/skeleton` subpaths:** `@ossuary/skeleton/<sub>` is a violation unless `./<sub>` is a key in the skeleton's `package.json` `exports`. Today the only key is `.`, so every subpath is a violation.
- **The bare specifier `@ossuary/skeleton`** is always allowed.

**Entry point.** `lint-boundaries.ts` walks the repo (`lib/walk.ts`), skipping `node_modules`, `dist`, `.next`, `.turbo`, `coverage`, `.git` and `.worktrees`. It reads the skeleton exports once and runs `checkFile` on every `.ts .tsx .mts .cts .js .mjs .cjs` file. It prints violations as `path:line  specifier  rule: message`, then a summary line with the file count, and exits 1 if there were any violations, 0 otherwise.

## Bones counter

```ts
// scripts/lib/bones.ts
export function countBoneLines(fileName: string, text: string): number;
export function isCounted(relPath: string): boolean;   // .ts/.tsx/.mts/.cts, not .d.ts, not a Test file, not in skipped dirs
export interface Row { name: string; lines: number }
export function renderTable(skeleton: Row, apps: Row[]): string;
export type Rewrite = { ok: true; text: string; changed: boolean } | { ok: false; reason: string };
export function rewriteReadme(readme: string, table: string): Rewrite;
```

**Counting.** `countBoneLines` parses the file with `ts.createSourceFile(setParentNodes: true)` and walks `node.getChildren(sourceFile)` down to the leaves. It skips JSDoc nodes, the end-of-file token and `JsxText` that holds only whitespace. Every line from each leaf's `getStart()` to its `getEnd()` is added to a set, and the count is the size of that set. Comments and blank lines never produce a leaf. A multi-line template literal counts each line it spans, because those lines are code.

**Table.** The skeleton row comes first, then the apps in alphabetical order. Names come from each `package.json` `name`, or the folder name if there is no `package.json`. The share is `round(100 × app / (app + skeleton))%`, or `—` for the skeleton row and when the divisor is 0.

```markdown
| Package | Bone lines | App-specific share |
| --- | ---: | ---: |
| @ossuary/skeleton | 1 | — |
| exhume | 1 | 50% |
| seance | 1 | 50% |
```

**Rewrite.** `rewriteReadme` first checks that each marker appears exactly once, with the start marker first (Req 8.6). It returns `readme.slice(0, startEnd) + "\n" + table + "\n" + readme.slice(endStart)`, where `startEnd` is the index just after the start marker and `endStart` is the index of the end marker. Every byte outside the markers is kept, and running it twice gives the same text. `bone-count.ts` writes the file only when `changed` is true (Req 8.5).

## Threshold guard (`scripts/guard-thresholds.mjs`)

The guard is plain ES module JavaScript using only Node built-ins (D-23). If dependencies were missing or broken, a guard with imports would fail on every write, and a broken import would also hide its own reason. `guard-thresholds.d.mts` gives the TypeScript tests types.

```js
/** @returns {{ exit: 0 | 2, reasons: string[] }} */
export function decide(stdinText, { cwd, fsProbe })   // fsProbe: { exists(p), probeDir(p) }
export function normalizePath(p, cwd)                 // Normalized path (glossary)
export function isThresholdFile(normPath)             // /(^|\/)evals\/thresholds\.yaml$/ after lowercasing
export function isTaskPath(normPath)                  // /(^|\/)evals\/tasks(\/|$)/ after lowercasing
export function classifyTool(toolName)                // 'write' | 'delete' | 'move' | 'shell' | 'other'
export function analyseShell(command, cwd, fsProbe)   // best effort, see below
```

When the file is run directly, it reads all of stdin, calls `decide`, writes the reasons to stderr and exits with the code. Any exception inside `decide` is caught and becomes exit 2 with the message `guard-thresholds: internal error: <message>`, so a bug in the guard still fails closed. The `--capture <dir>` flag first writes the raw payload to `<dir>/<hook_event_name>-<tool_name>-<timestamp>.json`; it is used only for the fixture capture task.

**Parsing (Req 9.6, D-06).** If the payload isn't valid JSON, or `tool_name` is not a string, or `tool_input` is not an object, the guard exits 2 with this message:

```text
guard-thresholds: blocked because the PreToolUse payload could not be parsed: <JSON error | "tool_name is missing or not a string" | "tool_input is missing or not an object">.
First 200 characters of stdin: <...>
The guard fails closed on payloads it cannot read. See docs/decisions.md (D-06) for the payload shape it expects.
```

**Tool classification.** Exact names come from the observed Kiro tool list; a name regex is the fallback.

| Class | Exact tool names | Fallback name pattern | Paths read from `tool_input` |
| --- | --- | --- | --- |
| write | `fs_write`, `fs_append`, `str_replace`, `semantic_rename` | `/write\|append\|replace\|edit\|create\|insert/i` | every string or string-array value whose key matches `/path\|file/i` |
| delete | `delete_file` | `/delete\|remove\|unlink/i` | the same, plus `targetFile`/`target` |
| move | `smart_relocate` | `/move\|relocate\|rename/i` | sources: keys matching `/^(source\|from\|old)/i`; destinations: `/^(dest\|to\|new\|target)/i` |
| shell | `execute_bash`, `control_bash_process` | `/bash\|shell\|exec\|command/i` | `tool_input.command` |
| other | anything else | | none, so exit 0 |

**Decision table.** Paths are normalized before matching (D-27 covers the directory probe).

| Class | Blocks (exit 2) when |
| --- | --- |
| write | any path is a threshold file, or is a task path that `exists(path)` |
| delete | any path is a threshold file or a task path, or `probeDir(path)` finds one inside it |
| move | a destination is a threshold file or an existing task path; or a source is a threshold file or a task path, or contains one |
| shell | `analyseShell` returns a reason |

Eval tasks are append-only (D-32): creating a file that doesn't exist yet inside a task path passes, so the agent can add regression tasks (EVAL-08). Changing, moving or deleting an existing one blocks, because changing a gold label to match a wrong output is the maker grading its own work. A move into a task path passes only when the destination doesn't exist.

`exists` and `probeDir` are passed in through a `fsProbe` argument, so `decide(stdinText, { cwd, fsProbe })`. The real probe uses `fs.statSync`; tests inject fakes.

**Normalization.** The steps run in order:
1. Turn `\` into `/`.
2. Strip a `//wsl.localhost/<distro>` or `//wsl$/<distro>` prefix and turn a `C:/` drive into `/mnt/c/`.
3. Join a relative path to `payload.cwd`, or to `process.cwd()` when the payload has none.
4. Resolve with `path.posix.normalize`, which collapses `//`, `.` and `..`.
5. Lowercase for matching only.

**Directory probe.** `probeDir(absPath)` reports whether `absPath` is a directory that contains a threshold file or a task path. It does a bounded breadth-first walk: depth 8, at most 20,000 entries, skipping `node_modules` and `.git`. If the walk hits the bound, it reports "contains" and fails closed. Tests inject a fake `probeDir`.

**Shell analysis (best effort, D-24).**
1. Tokenize with a small quote-aware shell-word splitter. Split segments on `;`, `&&`, `||`, `|` and newlines, and pull out redirect targets (`>`, `>>`, `1>`, `2>`).
2. A segment is treated as naming a threshold file when any token or redirect target normalizes to one, or when the raw text matches `/evals[\\/]+thresholds\.ya?ml/i`. The raw-text test also catches globs and variables.
   - The segment passes only if its command is on a read-only list and it has no redirect into the file. The list is `cat less more head tail grep rg wc diff ls stat file`, plus `git diff|log|show|status|blame|add|commit|ls-files`, plus `pnpm thresholds:check`.
   - Any other command blocks.
3. A segment that names an existing task path, or redirects into one, blocks unless its command is on the same read-only list. This makes `sed -i`, `cp … over`, `tee` and `>` into an existing task file block, while `cat > new-task.json` and `git add` of a new task pass. A side effect: `cp` from a task file to elsewhere also blocks, which is acceptable for a guard.
   - A segment naming a directory that `probeDir` says contains a task path blocks if its command is a delete or a move: `rm rmdir unlink shred mv`, `git rm`, `git mv`, `git clean`, `find ... -delete` or `find ... -exec rm`.
4. Commands that touch protected files without naming them can't be caught here: `git reset --hard`, `git checkout .`, or a script that writes the file. The PR threshold check is the backstop (D-05).

**Hook matcher.** The `guard-thresholds` hook uses the regex `write|append|replace|delete|relocate|rename|move|bash|shell|exec`. That covers every Kiro tool ID that can change a file or run a command. Tools that fall into the `other` class exit 0 at once, so a broad matcher costs little.

**Payload capture (Req 9.12).** A temporary hook file, `.kiro/hooks/capture-payloads.json`, runs `node scripts/capture-hook-payload.mjs scripts/test/fixtures/hook-payloads` on PostFileSave. During the capture, the guard hook's command also carries `--capture scripts/test/fixtures/hook-payloads`.
1. Kiro saves a `.ts` file, which produces the PostFileSave payload.
2. Kiro attempts `fs_write` to `apps/exhume/evals/thresholds.yaml`, which produces the PreToolUse payload and should be blocked.
3. Kiro renames the two fixtures to `kiro-postfilesave.json` and `kiro-pretooluse-fs_write-thresholds.json`, removes the temporary hook and the `--capture` flag, and records the shape and outcome in decisions.md.
4. `guard.test.ts` replays the PreToolUse fixture and expects exit 2.

If the write goes through, the guard did not block. In that case, Kiro records it in decisions.md and flags it to you before Phase 0 closes.

## Threshold check (`scripts/check-thresholds.ts`)

```ts
// scripts/lib/thresholds.ts
export type Entry = { dir: 'min' | 'max'; value: number };
export type Doc = Map<string, Entry>;
export type FormatError = { file: string; key?: string; message: string };
export function parseThresholds(file: string, text: string): { ok: true; doc: Doc } | { ok: false; errors: FormatError[] };
export type Kind = 'min-lowered' | 'max-raised' | 'removed' | 'direction-changed';
export type Loosening = { file: string; key: string; kind: Kind; before: Entry; after?: Entry };
export function compareThresholds(file: string, base: Doc, head: Doc): Loosening[];
```

**Format (Req 11.1, D-29).** A file is a flat YAML mapping. Each key maps to a mapping with exactly one key, `min` or `max`, whose value is a finite number. An empty file is an empty document. Duplicate keys, nested groups, extra keys, and strings that look like numbers are format errors. Parsing uses the `yaml` package with `uniqueKeys: true`.

**Comparison.** For each key in `base`:
- a missing key in `head` gives `removed`;
- a different `dir` gives `direction-changed`;
- `min` with `head < base` gives `min-lowered`;
- `max` with `head > base` gives `max-raised`.

Keys that exist only in `head` are never reported.

**Entry point.** It takes `--base <sha> --head <sha>` and reads the label from the env var `THRESHOLDS_CHANGE_LABEL` (`"true"` or `"false"`).
- It lists `git ls-tree -r --name-only <sha>` for both commits, keeps paths matching `(^|/)evals/thresholds\.yaml$`, and reads each file with `git show <sha>:<path>`. A file present only in base is compared against an empty document, so all its keys count as removed.
- If any file has format errors, it prints them and exits 1, whatever the label (Req 11.6).
- If it finds loosenings and the label is absent, it prints a table (file, key, kind, before, after) and exits 1. With the label, it prints the same table under "Allowed by the thresholds-change label" and exits 0. With no loosenings, it prints `No thresholds loosened` and exits 0.

## CI

**`.github/workflows/ci.yml`** runs on `push` to any branch, with `permissions: contents: read`:
1. `actions/checkout`.
2. `pnpm/action-setup`, which reads `packageManager`.
3. `actions/setup-node` with `node-version-file: .nvmrc` and `cache: pnpm`.
4. `pnpm install --frozen-lockfile`.
5. `pnpm verify` (database tests run on PGlite here).

A second job in the same workflow, `db-postgres16`, covers what this machine can't (D-35):
- A `postgres:16` service container with a health check, and `TEST_DATABASE_URL: postgres://ossuary:ossuary@localhost:5432/ossuary_test`. These are throwaway CI credentials, not secrets.
- After install, it runs `pnpm --filter @ossuary/skeleton test`, so the migration suite runs on PGlite and on Postgres 16.
- It runs `docker compose config --quiet` with the `POSTGRES_*` variables set inline, to check that `docker-compose.yml` parses.

Phases 4, 5 and 7 add the image build and the compose smoke test (Req 10.5).

Actions are pinned to their current major tags. Neither job reads secrets (Req 10.3).

**`.github/workflows/thresholds.yml`** runs on `pull_request` with types `[opened, synchronize, reopened, labeled, unlabeled]`, and `permissions: contents: read, pull-requests: read`. It uses `pull_request`, not `pull_request_target`, so forked PRs get no secrets and no write token.
1. Checkout with `fetch-depth: 0`.
2. Set up pnpm and Node, then install.
3. Run `pnpm thresholds:check --base "$BASE_SHA" --head "$HEAD_SHA"`.

The step sets these environment variables:
- `BASE_SHA: ${{ github.event.pull_request.base.sha }}`
- `HEAD_SHA: ${{ github.event.pull_request.head.sha }}`
- `THRESHOLDS_CHANGE_LABEL: ${{ contains(github.event.pull_request.labels.*.name, 'thresholds-change') }}`

Event values reach the script through environment variables, never interpolated into the shell line. The `thresholds-change` label is created with `gh label create` once the remote exists.

## Voice spike server (`scripts/voice-spike-server.ts`)

The server uses only `node:http`, `node:crypto` and `node:perf_hooks` (Req 20.7). `createSpikeServer(opts)` returns an `http.Server`, and `main` starts it on `PORT`, defaulting to 8787.

| Request | Response |
| --- | --- |
| `POST /v1/chat/completions`, `stream: true` | 200 `text/event-stream`. Chunks: `{role:"assistant"}`, then the reply split into word chunks, then `finish_reason:"stop"`, then `data: [DONE]` |
| `POST /v1/chat/completions`, no stream | 200 JSON `chat.completion` with the same reply and `usage` set to zeros |
| bad or missing bearer while `VOICE_LLM_SECRET` is set | 401 (compared with `timingSafeEqual`) |
| body is not JSON | 400; body over 1 MB: 413 |
| any other method or path | 404 |

Every chunk carries `id: "chatcmpl-spike-<n>"`, `object`, `created`, and `model: "ossuary-voice-spike"`. That is a label for the stub, not a vendor model ID. The fixed reply is `"Hello, I'm the Séance test interviewer, and I'm an AI. This is a fixed reply from the latency spike server."`. `SPIKE_FIRST_TOKEN_DELAY_MS` delays the first content chunk, while the role chunk is still sent at once.

After each request, the server logs one JSON line to stdout: `{at, method, path, status, stream, messages, first_byte_ms, first_content_ms, last_byte_ms}`. Times are measured from the request event with `performance.now()`. Message text and headers are never logged (Req 20.3).

To use it with ElevenLabs, set the agent's Custom LLM server URL to `https://<tunnel-host>/v1`. ElevenLabs appends `/chat/completions`. The API key secret is the value of `VOICE_LLM_SECRET`. decisions.md gives the full steps for ngrok and for Cloudflare Tunnel.

## Kiro layer

### Steering (`.kiro/steering/`)

| File | Front matter | Content |
| --- | --- | --- |
| `product.md` | `inclusion: always` | What Ossuary is; the two apps and their codes; the Skeleton Crew judging criteria; the house rules (the four of plan §1, plus rule 5: where `docs/decisions.md` differs from the plan, decisions.md wins); the out-of-scope list |
| `tech.md` | `inclusion: always` | Stack; commands (`pnpm verify`, `pnpm eval`, `pnpm bones`, `pnpm lint:boundaries`, `pnpm db:migrate`, `pnpm spike:voice`); the vendor SDK boundary and ElevenLabs rule; conventions (strict TS, Zod at boundaries, kobo integers, no model IDs outside `models.yaml`) |
| `structure.md` | `inclusion: always` | The folder tree; the public import rule; naming (kebab-case files, one spec per phase, `D-nn` decisions, `P0-n` properties) |
| `ui.md` | `fileMatch`, `["**/*.tsx"]` | UI kit first, costume tokens, WCAG AA contrast, keyboard paths, reduced motion |
| `security.md` | `fileMatch`, `["packages/skeleton/src/guard/**", "apps/*/src/domain/**", "**/tools/**"]` | SEC-02, SEC-03 and SEC-06 in plain words, and a short `quarantine()` example marked as the Phase 2 target API |
| `evals.md` | `fileMatch`, `["**/evals/**"]` | Task file format (Phase 2 fills in details); the `thresholds.yaml` min/max format; grade outcomes, not paths; never edit thresholds to make a run pass, and how the guard and the PR check enforce that |
| `archetype-ext.md` | `fileMatch`, `["apps/exhume/**"]` | The plan §9 example, minus the `product.yaml` link (D-04) |
| `archetype-cnv.md` | `fileMatch`, `["apps/seance/**"]` | The CNV split, latency budget, AI disclosure on the first turn, interruption; no `product.yaml` link (D-04) |
| `plan.md` | `inclusion: manual` | Build phases excerpt, with pointers to the full plan and decisions (D-41) |
| `framework.md` | `inclusion: manual` | Purpose and core principles excerpt, with a pointer to the full specification (D-41) |

### Hooks (`.kiro/hooks/`)

The hooks are created with Kiro's hook tool, which writes v1 JSON in the format shown in plan §9.

| id | trigger | matcher | action | timeout |
| --- | --- | --- | --- | --- |
| `eval-on-save` | PostFileSave | `apps/.*/(prompts\|skills)/\|routing\.yaml$\|models\.yaml$` | command `pnpm eval --changed --sets regression,safety` | 300 s |
| `no-vendor-sdk` | PostFileSave | `\.(ts\|tsx)$` | command `pnpm lint:boundaries` | 60 s |
| `bone-count` | PostFileSave | `\.(ts\|tsx)$` | command `pnpm bones` | 60 s |
| `guard-thresholds` | PreToolUse | `write\|append\|replace\|delete\|relocate\|rename\|move\|bash\|shell\|exec` | command `node scripts/guard-thresholds.mjs` | 30 s |
| `record-on-stop` | Stop | none | agent prompt (below) | |

The `record-on-stop` prompt: "If this turn changed anything under `apps/*/prompts/`, `apps/*/skills/`, a `routing.yaml`, `models.yaml` or `packages/skeleton/src/harness/`, append an entry to `CHANGELOG.md` under today's date. The entry gives what changed, the eval deltas (or 'evals not run'), the cost change and any harness components removed. Otherwise do nothing."

### Custom agents (`.kiro/agents/`)

Neither agent has a `model` field (D-03).

**maker.json**
```json
{
  "name": "maker",
  "description": "Builds Ossuary features from the current spec task",
  "prompt": "Implement the current spec task only. Follow the steering files and docs/decisions.md. Never write a thresholds.yaml. Eval tasks are append-only: you may add a new task file but never change, move or delete an existing one. Never import a vendor SDK outside packages/skeleton/src/gateway/providers/. Run pnpm verify before you finish.",
  "tools": ["read", "write", "shell"],
  "resources": ["file://.kiro/steering/**/*.md", "file://docs/implementation-plan.md", "file://docs/decisions.md"],
  "permissions": { "rules": [
    { "capability": "shell", "match": ["pnpm *", "git *"], "effect": "allow" },
    { "capability": "shell", "match": ["*"], "exclude": ["pnpm *", "git *"], "effect": "deny" },
    { "capability": "shell", "match": ["git push --force*", "git push -f*", "git reset --hard*", "git clean *"], "effect": "deny" },
    { "capability": "fs_write", "match": ["**/evals/thresholds.yaml"], "effect": "deny" }
  ] }
}
```

A path glob can't tell a new file from an existing one, so the append-only rule for `evals/tasks/` is enforced by the guard hook, not by a `fs_write` rule (D-32).

**judge.json**
```json
{
  "name": "judge",
  "description": "Reviews a finished spec task against its EARS requirements by running checks. Never edits files.",
  "prompt": "Review the named spec task against its EARS acceptance criteria in .kiro/specs/. Run pnpm verify and pnpm eval, start the app with pnpm --filter <app> dev when a criterion needs it, and exercise it with curl on localhost. Judge from what you observe, not from the maker's summary. For each criterion, report pass, fail or unverified with evidence. Report gaps only; do not fix them.",
  "tools": ["read", "shell"],
  "resources": ["file://.kiro/steering/**/*.md", "file://docs/implementation-plan.md", "file://docs/decisions.md", "file://.kiro/specs/**/*.md"],
  "permissions": { "rules": [
    { "capability": "shell", "match": ["pnpm verify*", "pnpm eval*", "pnpm --filter * dev", "pnpm --filter * start", "curl http://localhost:*", "curl http://127.0.0.1:*"], "effect": "allow" },
    { "capability": "shell", "match": ["*"], "exclude": ["pnpm verify*", "pnpm eval*", "pnpm --filter * dev", "pnpm --filter * start", "curl http://localhost:*", "curl http://127.0.0.1:*"], "effect": "deny" },
    { "capability": "shell", "match": ["curl * http*://*", "curl *@*", "curl *-o *", "curl *--output*", "curl *-T *", "curl *--upload-file*"], "effect": "deny" },
    { "capability": "fs_write", "match": ["**"], "effect": "deny" }
  ] }
}
```

Kiro's shell patterns treat `*` as any characters, so `curl http://localhost:*` would also match `curl http://localhost:3001 http://other.host`. The third rule denies a second URL, `@file` uploads and output files, which closes the obvious ways to send repo files elsewhere or write to disk (D-33). It is best effort; the judge holds no secrets.

Kiro's permission engine resolves deny over allow, and its shell parser splits compound commands. So `pnpm verify && rm -rf x` is denied on its second part (D-26).

### MCP settings (`.kiro/settings/mcp.json`)

Kiro always refuses agent writes under `.kiro/settings/`, so you create this file (D-20):

```json
{
  "mcpServers": {
    "exhume": { "url": "http://localhost:3001/api/mcp", "headers": { "Authorization": "Bearer ${OSSUARY_MCP_KEY}" }, "disabled": true },
    "seance": { "url": "http://localhost:3002/api/mcp", "headers": { "Authorization": "Bearer ${OSSUARY_MCP_KEY}" }, "disabled": true }
  }
}
```

## Other root files

- **models.yaml**: the plan §5 block as it now stands, including its comments. It keeps the plan's three primary IDs, writes the fallbacks as `"<vendor>:<id>"`, and has `prices: {}` with a comment listing the fields per model (`input`, `cached_input`, `output` per million tokens, `currency`, `source`, `checked`).
- **render.yaml**: plan §12 as written, with `postgresMajorVersion: "16"` on `ossuary-db` so production matches the CI service container, plus a header comment saying Phases 4 and 5 finish it and that field names must be checked against Render's Blueprint spec.
- **README.md**: title, one-paragraph pitch, the bones markers with the generated table, a quick start that needs no Docker (`nvm use`, `corepack enable`, `pnpm install`, `pnpm verify`; then, for a local database, the plan §12 WSL PostgreSQL steps, `DATABASE_URL` in `.env`, and `pnpm db:migrate`), a short "With Docker" note (`docker compose up db`), and placeholders for the live URLs and the video.
- **AGENTS.md**: three lines. A heading, a pointer to `.kiro/steering/` (start with `product.md`, `tech.md`, `structure.md`), and the decisions-win rule.
- **LICENSE**: MIT, `Copyright (c) 2026 <NAME>`.
- **CHANGELOG.md**: `# Changelog` and an `## Unreleased` heading.
- **.gitignore**: `node_modules/`, `dist/`, `.next/`, `.turbo/`, `coverage/`, `*.log`, `.env`, `.env.*`, `!.env.example`, `.worktrees/`, `pgdata/`. It has no `.kiro` entry, and a test checks that `git check-ignore` reports no file under `.kiro/`.
- **docs/decisions.md**: the D-nn entries, the voice spike how-to, the hook payload shape (filled in by the capture task) and a spike latency heading for you to fill in.
- **docs/kiro-log.md**: `# Kiro log`, `## Phase 0: 00-foundations` with sub-headings "What the spec decided", "What a hook or property test caught" and "What I changed by hand".

## Correctness properties

Each property is a fast-check test with at least 200 runs. Each test carries a comment tag: `// Feature: 00-foundations, Property P0-n: <text>`.

| # | Requirement | Generator | Assertion |
| --- | --- | --- | --- |
| P0-1 | 9.9 | A random repo-relative prefix + `evals/thresholds.yaml`, rewritten: random `\`/`/` mix, random case, `./` and `x/../` segments, and an absolute prefix (`/home/u/r/`, `C:\r\`, `\\wsl.localhost\U\h\`). Wrapped in a random mutating payload (write, append, replace, delete, move to, move from, `echo x > path`, `sed -i … path`, `rm path`) | `decide(...).exit === 2` |
| P0-2 | 9.10 | The same rewriting for `…/evals/tasks[/sub…]`, with `fsProbe.exists` returning true for the generated path. Wrapped in write, append, replace, delete, move-away, move-onto and shell (`rm`, `mv`, `git rm`, `sed -i`, `>` redirect) payloads | `exit === 2` |
| P0-3 | 9.11 | (a) Paths that normalize to neither protected form, including near misses (`evals/thresholds.yaml.bak`, `evals-old/tasks`, `evalsx/thresholds.yaml`, `myevals/tasks`), in any payload; (b) write, create and `cat > …` payloads to files inside `evals/tasks/` with `fsProbe.exists` returning false; (c) read-only shell commands on a threshold file or task file. `probeDir` reports nothing | `exit === 0` |
| P0-4 | 7.9 | A file path from a pool of roots (allowed roots, near-miss roots, other roots) + random subpath + extension; a restricted package (+ optional subpath) or a benign package; one of eight import forms | Exactly one violation with the expected rule if the package is restricted and the file is outside its allowed roots; none otherwise |
| P0-5 | 7.10 | An app file at a random depth; a specifier from: relative into `packages/skeleton/**`, relative within the app, `@ossuary/skeleton`, `@ossuary/skeleton/<sub>`; a random `exports` key set | A violation if and only if the specifier lands inside `packages/skeleton/` or is a subpath missing from `exports`; never for the bare package |
| P0-6 | 8.7 | A list of valid one-line statements, interleaved at random with blank lines, `//` lines, `/* */` blocks and JSDoc blocks | Count equals the number of statements; inserting more trivia leaves it unchanged; a package's total equals the sum over its files; Test-file names are never counted |
| P0-7 | 8.8 | Prefix and suffix strings without markers, old and new table bodies | The text before the start marker and after the end marker is unchanged; `rewrite(rewrite(x,t),t) === rewrite(x,t)`; READMEs with malformed markers return `ok: false` |
| P0-8 | 11.7 | A base `Doc`; a head built by applying a random mix of ops per key (keep, raise, lower, remove, flip direction) and adding new keys | The returned loosenings equal the set computed by a separate reference function over the applied ops, kind included; new, unchanged and tightened keys are absent |

Unit tests beside the properties:
- **Guard child-process tests:** sample payloads for `fs_write`, `fs_append`, `str_replace`, `delete_file`, `smart_relocate`, `execute_bash` and `control_bash_process`, plus invalid JSON, a missing `tool_input`, and the captured Kiro fixture. Each test checks the exit code and stderr.
- **Bones:** malformed markers.
- **Threshold format:** format errors.

## Error handling

| Situation | Behaviour |
| --- | --- |
| The guard can't parse the payload, or throws | Exit 2 with a stated reason (fail closed, D-06, D-23) |
| `node` is missing when the hook runs | Kiro treats a non-2 exit as "no block", so the guard fails open; the maker deny rule and the PR check still apply (D-05) |
| The guard blocks wrongly | Turn off the `guard-thresholds` hook in Kiro's Agent Hooks panel and fix the guard. There is no environment-variable bypass, because the agent could set one (D-23) |
| The README markers are broken | `pnpm bones` exits 1 and leaves the file unchanged |
| A boundary violation | `pnpm lint:boundaries` exits 1, which fails the hook, `pnpm verify` and CI |
| `DATABASE_URL` is unset | `db:migrate` exits 1 and names the variable |
| The local PostgreSQL service isn't running | `db:migrate` prints the host and port and exits 1; tests and `pnpm verify` are unaffected because they use PGlite |
| `createDb` gets an unknown URL scheme | It throws and names the accepted forms, without echoing the URL |

## Testing strategy

- Script tests live in `scripts/test/`. The database test lives beside the code in `packages/skeleton/src/db/`. The app and CLI packages have no tests yet, and `--passWithNoTests` keeps them green. Everything runs through `pnpm verify` and CI with no Docker and no database server.
- Exit-criteria checks that tests can't cover are run by hand and recorded in decisions.md or kiro-log.md:
  - A hook fires on a test save.
  - The steering files appear in Kiro's panel (you confirm).
  - The spike server answers `curl`.
  - CI is green once the remote exists, including the Postgres 16 job.
- `pnpm db:migrate` against your WSL PostgreSQL is run once `DATABASE_URL` is filled in. It is not an exit criterion, and nothing waits for it (D-35).

## Departures from the plan in this design

These were new in the design round. D-32 to D-35 came afterwards and are listed in `tasks.md`.

- **D-20 `.kiro/settings/mcp.json` is created by you.** Kiro hard-denies agent writes under `.kiro/settings/`, so I can't write it. The content is above.
- **D-21 The ElevenLabs server SDK is blocked everywhere, including `gateway/providers/`.** The providers folder is for model vendors, and you chose plain `fetch` in `harness/voice/`. The rule also catches every other `@elevenlabs/*` and `@11labs/*` package (the latter is deprecated), so only `@elevenlabs/react` and `@elevenlabs/client` get through, and only under `apps/seance/src/app/`.
- **D-22 The deep-import check covers all of `packages/skeleton/`, not just `src/`.** A relative import into the skeleton's `dist/` or `package.json` also bypasses the public entry. Requirement 7.7 is updated to match.
- **D-23 The guard is dependency-free and fails closed on its own errors.** The only override is turning the hook off in Kiro. There is no env-var escape hatch.
- **D-24 Shell analysis is allowlist-based.** Any command that names a threshold file or an existing task file blocks unless it is a read-only command, with `git add` and `git commit` allowed. Directories that contain task paths block only on delete and move.
- **D-25 The guard hook's matcher is a tool-ID regex rather than the bare `write` category.** It covers write, delete, move and shell tools in one hook.
- **D-26 The agents' shell limits are enforced with deny-with-exclude rules, not only allow rules.** Without them, other commands would just prompt.
  - maker also denies force push, `git reset --hard` and `git clean`.
  - judge denies all file writes.
  - judge's resources add `.kiro/specs/**/*.md`, so it can read the EARS criteria.
- **D-27 Deleting or moving a directory that contains a threshold file or a task path is blocked.** The guard checks the directory on disk.
- **D-28 TypeScript scripts run with `tsx`, and shared dev-tool versions live in a pnpm catalog.**
- **D-29 `thresholds.yaml` is a flat mapping.** Nested groups and extra keys are format errors.
- **D-30 Compose has no default password.** It needs a `.env` copied from `.env.example`.
- **D-31 `drizzle.config.ts` sits at the skeleton package root, not in `src/db/`.** Schema and migrations stay in `src/db/` as you asked. drizzle-kit finds the config there, and the bones count stays free of tooling.

## Resolved questions

The updated plan (docs/implementation-plan.md, §9) answered both design-round questions:
1. Eval tasks are append-only for the maker (D-32).
2. The judge may start the apps and `curl` localhost (D-33).

## Open question

**Local PostgreSQL major version.** Ubuntu 26.04's `apt install postgresql` installed PostgreSQL 18 on this machine; plan §12 assumed 24.04 and 16. PGlite also embeds a major newer than 16. Production (Render) and the CI service container stay on 16. Either keep 18 locally and rely on the CI Postgres 16 job to catch version-specific SQL, or install `postgresql-16` from the PostgreSQL apt repository (apt.postgresql.org) to match production.
