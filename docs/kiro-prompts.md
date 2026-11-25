# Ossuary: prompts for Kiro

Paste one prompt per phase into a new **Spec** chat in Kiro (feature spec, requirements first), with Opus 5.5 selected. Approve each stage (requirements, design, tasks) only after checking it against the phase's exit criteria in `docs/implementation-plan.md`, section 10.

## Before you start

1. Create a public GitHub repo named `ossuary` with an MIT license, clone it and open it in Kiro.
2. Copy `implementation-plan.md`, `framework-spec.md` and this file into `docs/`.
3. Install PostgreSQL in WSL (plan section 12, Local development). Docker is optional and never needed locally.
4. Paste Prompt 0. From Phase 1 on, `#plan` and `#framework` pull the two documents into the chat through the manual steering files that Phase 0 creates.
5. Decisions made during the build live in `docs/decisions.md`, and they win wherever they differ from the plan. `product.md` steering says so, so every chat sees it.

---

## Prompt 0: foundations (kickoff)

```text
You're building Ossuary for the Kiroween 2026 hackathon (Skeleton Crew category): a lean TypeScript skeleton for AI apps, and two apps built on it, Exhume and Séance.

Read these two files in full before you write anything:
- docs/implementation-plan.md: the build plan and the source of truth for scope, names, folder layout and exit criteria.
- docs/framework-spec.md: the AI Product Build Framework. Rule IDs such as HAR-05 and SEC-02 come from it.

Create a feature spec named 00-foundations for Phase 0 (plan section 10, row 0). It covers:

1. Monorepo: pnpm workspaces and Turborepo, TypeScript strict, Node 24, Vitest and fast-check, ESLint. Lay out the folder tree from plan section 4; empty packages with an index.ts are fine for now. Add an MIT LICENSE, a README stub with <!-- bones:start --> and <!-- bones:end --> markers, and a .gitignore that does NOT ignore .kiro/.
2. Database without Docker: Drizzle in packages/skeleton/src/db with createDb(url), which uses node-postgres for a postgres:// URL and PGlite for pglite://memory or pglite://<folder>. Add an empty first migration, pnpm db:migrate against DATABASE_URL, and a .env.example with a local DATABASE_URL. Tests and CI use PGlite, so they need no database server. Put the one-time PostgreSQL-in-WSL setup from plan section 12 in docs/decisions.md. Docker stays supported but optional: keep docker-compose.yml with a db service (no default password; .env.example), never require Docker in the local loop, and don't run docker commands here.
3. Root scripts:
   - pnpm verify: typecheck, lint, test (evals are added in Phase 2).
   - pnpm lint:boundaries: fails if any file outside packages/skeleton/src/gateway/providers/ imports a model vendor SDK (Anthropic, OpenAI, Google GenAI and similar), or if any app imports from packages/skeleton/src/* instead of @ossuary/skeleton.
   - pnpm bones: counts non-test TypeScript lines in packages/skeleton and in each apps/* folder, and rewrites the table between the README markers.
4. scripts/guard-thresholds.mjs: reads a PreToolUse JSON payload from stdin. If tool_input writes to any **/evals/thresholds.yaml or deletes anything under **/evals/tasks/, it prints the reason to stderr and exits 2; otherwise it exits 0. Include tests that pipe sample payloads into it.
5. GitHub Actions: pnpm verify on every push, and a pull-request check that fails when any value in a thresholds.yaml goes down unless the PR has the thresholds-change label.
6. .kiro/steering/: the ten files in plan section 9, with the front matter and inclusion modes shown there. product.md includes the house rules from plan section 1. plan.md and framework.md use manual inclusion and contain only a #[[file:docs/...]] reference.
7. .kiro/hooks/: the five hooks in plan section 9 as v1 JSON files. Any command that doesn't exist yet (such as pnpm eval) prints "not built yet" and exits 0 for now.
8. .kiro/agents/maker.json and judge.json as described in plan section 9, and .kiro/settings/mcp.json pointing at localhost:3001 and localhost:3002 (those servers come later).
9. models.yaml with the tier structure from plan section 5, placeholder IDs and an empty prices block; a stub render.yaml from plan section 12; and AGENTS.md at the root with three lines pointing to .kiro/steering/.
10. docs/decisions.md and docs/kiro-log.md with headings only, plus scripts/voice-spike-server.ts: a tiny Node server exposing POST /v1/chat/completions in OpenAI's streaming format. It returns a fixed reply and logs request timing, so I can test ElevenLabs Custom LLM latency through a tunnel. Document how to run it in docs/decisions.md.

Rules:
- Write requirements in EARS, and tag each one with the framework rule or plan section it serves.
- Add correctness properties as fast-check tests wherever a requirement states an invariant (here: the guard script, the boundary lint and the bones counter).
- Don't build skeleton modules or apps yet; those are Phases 1 to 5.
- Model names and prices go only in models.yaml.
- At each spec stage (requirements, design, tasks), list where you depart from the plan before asking me to approve.
- Finish with pnpm verify green, then list anything in the plan you couldn't do or think is wrong.

Exit criteria: CI is green on the empty packages, a hook fires on a test save, the steering files show in Kiro's steering panel, and the voice spike server runs locally.
```

---

## Prompt 1: skeleton core

```text
#plan #framework
Create a feature spec named 01-skeleton-core for Phase 1 of the implementation plan.

Scope (plan sections 5 and 6):
- manifest: loadProduct (Zod-validated product.yaml, routing.yaml, models.yaml) and resolvePolicy, with the policy tables for all six archetypes, five autonomy levels and four risk tiers. Overrides may raise thresholds, never lower them. R4 refuses to load.
- gateway: one provider interface with adapters for at least two vendors; cache-ordered prompt assembly (system, Skills, tools, reference, turn); Zod structured output with one repair retry; cost from models.yaml prices; charging to the task budget and the workspace daily cap, refusing calls that would exceed either; one retry on the fallback vendor after a server error, a timeout or the kill switch; killPrimary() available only in demo mode.
- harness: defineApp, runTask, the pipeline and generateEvaluate patterns, Budget (steps, tokens, seconds, spend), and task state saved as JSON so a run survives a restart. The evaluator in generateEvaluate uses the judge role from routing.yaml, never the generator's model.
- db: the bones schema (tasks, spans, approvals, audit_events, eval_runs, eval_results, feedback, spend) with migrations.
- trace: withTrace and span with OpenTelemetry GenAI attribute names, and redaction of emails and phone numbers (Nigerian formats included) before anything is stored.

Also create apps/echo, a throwaway app with code GEN-A1-R1 that runs one generateEvaluate task end to end.

Touch only packages/skeleton, apps/echo, models.yaml and their tests.
Requirements in EARS, tagged with framework IDs. Implement properties 1, 2, 5, 6 and 8 from plan section 11 as fast-check tests. Test the gateway against a fake provider; real vendor calls happen only in one opt-in smoke test.

Exit: those properties pass, pnpm verify is green (on PGlite), and an echo task's trace is in the local PostgreSQL database.
```

---

## Prompt 2: guard and evals

```text
#plan #framework
Create a feature spec named 02-skeleton-guard-evals for Phase 2 of the implementation plan.

guard (plan section 6):
- quarantine(content, schema) runs a model step with no tools and returns only schema-valid data plus injection_signals. It marks ctx.tainted.
- While ctx.tainted is true, ctx.tools hides every tool flagged privileged.
- ctx.approve / requireApproval applies policy.approval and writes an approvals row.
- audit records the actor and the person acted for on every action.
- filterOutput checks output against a prohibited-content list.

evals (plan sections 6 and 11):
- Task files under apps/<app>/evals/tasks/<set>/, one task per YAML file, so the guard can treat existing task files as read-only (append-only evals, docs/decisions.md).
- Deterministic graders (exact, numeric tolerance, regex, field compare) and a rubric grader that runs on the judge role from routing.yaml.
- runEvals with k trials, reporting pass@1, pass^k, cost per successful task, and p50 and p95 latency.
- Results written to evals/results/<date>-<git sha>.json and to the eval tables, with model, harness version and cost.
- thresholds.yaml entries use the { min } / { max } format recorded in docs/decisions.md, and the release check reads the direction from each entry.
- CLI: ossuary eval --app --set --k --sample --changed, wired to pnpm eval, and added to pnpm verify as the sampled regression and safety run. Replace the "not built yet" stub in the eval-on-save hook.

Give apps/echo a 10-task core set and a 5-task safety set.
Implement properties 3, 4 and 7 from plan section 11 as fast-check tests.

Exit: those properties pass, and pnpm eval --app echo --set core --k 3 prints pass@1, pass^k and cost per success.
```

---

## Prompt 3: MCP and UI kit

```text
#plan #framework
Create a feature spec named 03-skeleton-mcp-ui for Phase 3 of the implementation plan.

mcp:
- createMcpHandler(app) on the official MCP TypeScript SDK over Streamable HTTP, stateless.
- The four standard tools run, status, result and feedback (framework section 13, minimum tool contract), plus the app tools declared in product.yaml.
- Zod schemas for every tool, a per-caller bearer key (OSSUARY_MCP_KEY), a rate limit, and an audit row per call.
- loadSkills reads skills/*/SKILL.md and serves the Skills as MCP resources.

ui:
- React components: AIBadge, ApprovalCard, ActionPreview (with undo), DiffView, Citations, ProgressTracker, FeedbackControl (one click), StopButton.
- BonesDashboard with quality, cost per successful task, latency and safety panels, read from the trace and eval tables.
- Costume tokens as CSS variables, with crypt and seance themes. WCAG AA contrast and reduced-motion support.

Give apps/echo a Next.js shell with /api/mcp, /bones and a /kit page that renders every component in both costumes.
Once echo's /api/mcp works, set both servers in .kiro/settings/mcp.json to enabled.
Implement property 12 from plan section 11 as a fast-check test.

Exit: MCP Inspector lists the four tools on echo; you can call echo's run tool through .kiro/settings/mcp.json; /kit renders every component in both costumes.
```

---

## Prompt 4: Exhume

```text
#plan #framework
Create a feature spec named 04-exhume for Phase 4: build apps/exhume exactly as plan section 7 describes, using only @ossuary/skeleton.

Order:
1. product.yaml (EXT-A2-R2), routing.yaml and THREATS.md.
2. scripts/make-receipts.ts: synthetic Nigerian receipts, invoices and POS slips rendered from HTML to PNG with noise, blur and rotation, each with gold labels.
3. The core (30 to 40), safety (10) and held-out (20) eval sets, before any prompt is written.
4. The pipeline: ingest, extract (inside quarantine), validate (code, kobo integers), categorize (receipt-coding Skill), post (reversible, with undo), export (irreversible, approval required).
5. The Inbox, Review, Ledger and Bones screens in the crypt costume.
6. MCP tools extract_document, list_ledger and export_ledger.
7. Demo mode: 12 seeded receipts, Reset demo, 20 documents per workspace per day. Update render.yaml for this service, and add a Dockerfile (multi-stage, Next.js standalone output, non-root user, healthcheck on /api/health). Docker isn't available here, so CI builds and checks it.
8. docs/baseline.md: a template where I record my own time and accuracy on 20 receipts.
9. Add #[[file:apps/exhume/product.yaml]] back to .kiro/steering/archetype-ext.md.

The acceptance criteria in plan section 7 become the EARS requirements. Implement properties 9 and 10 from plan section 11 as fast-check tests.
If the app needs something the skeleton lacks, add it to the skeleton only if any app could use it, with a test and a line in docs/decisions.md. Otherwise keep it in the app. Never import skeleton internals.

Exit: core pass^3 of 85% or more, zero safety failures, properties 9 and 10 pass, pnpm bones shows Exhume's app-specific lines, and the app runs on port 3001.
```

---

## Prompt 5: Séance

```text
#plan #framework
Create a feature spec named 05-seance for Phase 5: build apps/seance exactly as plan section 8 describes.

Order:
1. product.yaml (CNV-A0-R2), routing.yaml, and THREATS.md stating it is practice only and scores are never shared with employers.
2. The realtimeSplit pattern in the skeleton harness. respond streams on the small tier using the planned move from task state; plan runs in the background on the mid tier after each turn and saves the next move.
3. The gateway's openAiCompatibleHandler, mounted at /api/voice/v1/chat/completions: OpenAI Chat Completions streaming format, rejecting any request without the VOICE_LLM_SECRET header.
4. evaluate on the judge role, writing a scorecard where every score cites transcript moments.
5. The candidate simulator (five personas) and the core (20), consistency (10) and safety (10) eval sets.
6. The Lobby, Live room, Scorecard and Bones screens in the seance costume. Use the ElevenLabs browser SDK with a signed URL that the server fetches, live captions, a stop button and the time left. Add a text-mode fallback with browser speech synthesis.
7. MCP tools list_roles, generate_question_bank and get_scorecard; here run takes a transcript and returns a scorecard.
8. Demo caps: 3 sessions of 5 minutes per workspace per day, and one seeded scorecard. Update render.yaml for this service, and add a Dockerfile like Exhume's.
9. Add #[[file:apps/seance/product.yaml]] back to .kiro/steering/archetype-cnv.md.

The server fetches the signed URL with plain fetch inside packages/skeleton/src/harness/voice/; the browser SDK is allowed only under apps/seance/src/app/ (see docs/decisions.md).

The first spoken line must say the interviewer is an AI. The interviewer must never ask about age, religion, ethnicity, marital or pregnancy status, or disability.
I will create the ElevenLabs agent myself, with Custom LLM pointing at the handler URL; read ELEVENLABS_AGENT_ID from the environment. Check the current ElevenLabs docs for the browser SDK and the signed-URL API before you code against them.
The acceptance criteria in plan section 8 become the EARS requirements. Implement property 11 from plan section 11 as fast-check tests. Record latency per turn in the turns table.

Exit: property 11 passes, the consistency set has run, p95 turn latency shows on /bones, and the app runs on port 3002.
```

---

## Prompt 6: power and CLI (stretch)

```text
#plan #framework
Create a feature spec named 06-power-cli for Phase 6 of the implementation plan.

1. packages/create-ossuary: `pnpm create ossuary <name> --code <code>` scaffolds a new app with product.yaml, routing.yaml, THREATS.md when the risk tier is R2 or above, a 5-task seed eval set, prompts/, skills/, and the Next.js shell wired to /api/mcp and /bones.
2. power/ in the Agent Plugins format from plan section 9: plugin.json, mcp.json, and two Skills, raise-a-body and ossuary-rules.
3. Use only the CLI and the power to raise examples/epitaph (GEN-A1-R1: writes a short, funny epitaph for a retired piece of software). Keep it in examples/, not apps/, so the submission still shows exactly two apps.

Exit: examples/epitaph passes pnpm verify with zero changes to packages/skeleton, and the power installs from a local folder in a fresh Kiro workspace.
```

---

## Prompt 7: polish and proof

```text
#plan #framework
Create a feature spec named 07-polish for Phase 7. Work through the definition of done in plan section 2 and tick each item with evidence.

Include:
- The README: what Ossuary is, the architecture, the Exhume versus Séance contrast table, the bone-count table, a quick start and links.
- The "kill primary vendor" toggle and the code switch on /bones, in demo mode only.
- The EXT-A2-R3 flip: missing R3 controls show in red on /bones, and pnpm verify fails.
- Seed data, Reset demo, and the global daily spend cap.
- Docker: an apps profile in docker-compose.yml, so docker compose --profile apps up runs both apps against the db service, and a CI job that builds both images and smoke-tests that stack. Docker isn't on the dev machine, so CI is where this is checked.
- An accessibility pass: keyboard paths, AA contrast, reduced motion, captions.
- Error, empty and loading states on every screen.

Then run the judge agent on every acceptance criterion in plan sections 7 and 8, and fix what it finds.

Exit: every definition-of-done box is ticked, with the evidence listed in docs/kiro-log.md.
```

---

## Prompt 8: submission drafts

Use a normal (vibe) chat for this one.

```text
#plan
Draft the submission materials from plan section 13, using docs/kiro-log.md, the specs in .kiro/specs/ and the git history as evidence:
1. docs/KIRO.md: the Kiro write-up, with concrete examples of spec decisions, hooks that fired, property tests that caught bugs, the maker and judge agents, MCP in both directions, and the power.
2. docs/devpost.md: the project description for the Devpost form.
3. docs/video-script.md: a shot list and voice-over under 2 minutes 50 seconds, following section 13.
Only claim what the repo shows. Mark anything you can't verify as TODO for me.
```

---

## Reusable prompts

**After each spec task**

```text
Use the judge agent to review the task you just finished against its EARS requirements. It should run the app and pnpm eval, not just read the code, and list gaps without editing files. Fix the gaps, rerun pnpm verify, and add three lines to docs/kiro-log.md: what the spec decided, what a hook or property test caught, and a blank line starting "Changed by hand:" for me to fill in.
```

**Closing a phase**

```text
Check every exit criterion for this phase in plan section 10, and show me the evidence for each: command output, file paths, and any screenshot I should take for the video. Then run pnpm bones and write a CHANGELOG.md entry with eval deltas, cost changes and anything removed.
```
