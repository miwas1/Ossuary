# Requirements Document

Spec `01-skeleton-core` (Phase 1).

## Introduction

Phase 1 builds the core of `@ossuary/skeleton`: the `manifest` module (product, routing and model files, and the code resolver), the `gateway` (one provider interface, Anthropic and OpenAI adapters, cache-ordered prompts, structured output, cost, spend caps, fallback and a demo kill switch), the `harness` (`defineApp`, `runTask`, `pipeline`, `generateEvaluate`, `Budget` and restartable task state), the `bones` database schema, and the `trace` module with redaction. It also creates `apps/echo`, a throwaway GEN-A1-R1 app that runs one `generateEvaluate` task end to end (plan §10 row 1).

Phase 1 builds no `guard`, `evals`, `mcp`, `ui` or `blob` module, no `realtimeSplit` and no `openAiCompatibleHandler`. Those belong to Phases 2 to 5.

Each acceptance criterion is written in EARS and tagged in brackets with the framework rule, plan section or decision it serves. Plan sections are written `Plan §n`. Properties 1, 2, 5, 6 and 8 are the plan §11 properties. Phase-local properties are numbered `P1-n`. Decisions D-42 to D-71 are new in this spec. All are approved and recorded in `docs/decisions.md`. Those that shape the requirements are listed at the end; D-62 to D-69 are listed in the design.

All automated tests run against the Fake provider. Only the opt-in smoke test (Requirement 25) calls a real vendor.

## Glossary

- **Repo**: the Ossuary monorepo rooted at the workspace folder.
- **Skeleton package**: the workspace package `@ossuary/skeleton` in `packages/skeleton/`.
- **Public entry**: `packages/skeleton/src/index.ts`, the only module apps import (ARCH-02).
- **App folder**: any direct child directory of `apps/`.
- **Echo app**: the workspace package `echo` in `apps/echo/`.
- **Code**: a product's three-part class `<Archetype>-<Autonomy>-<Risk>`, for example `GEN-A1-R1` (framework §3).
- **Product manifest**: an app's `product.yaml`.
- **Routing table**: the file named by the Product manifest's `routing` field, normally `routing.yaml`.
- **Model register**: the root `models.yaml`, the only file holding model IDs and prices (MODEL-07).
- **Model ID**: a string `vendor:model-name`, for example `anthropic:<name>`.
- **Placeholder ID**: a Model ID whose model name is exactly `<id>`. It marks a fallback not yet chosen.
- **Manifest loader**: the `loadProduct(appDir)` function in the `manifest` module.
- **Policy resolver**: the `resolvePolicy(code, override?)` function in the `manifest` module.
- **Policy**: the frozen object the Policy resolver returns, read by every other skeleton module.
- **Policy tables**: the three tables in the Policy tables section below, stored as data in the `manifest` module.
- **Override**: an optional `release` block in the Product manifest that raises the release threshold.
- **Gateway**: the object `createGateway(...)` returns; the only route from skeleton code to a model (MODEL-01).
- **Scoped gateway**: a Gateway view bound to one task's Budget, trace and Workspace, given to steps as `ctx.gateway`.
- **Provider**: an object that implements the skeleton's single provider interface for one vendor.
- **Vendor adapter**: a Provider that calls a real vendor API. It lives in `packages/skeleton/src/gateway/providers/`.
- **Fake provider**: a Provider that returns scripted outcomes for Model IDs of vendor `fake` and makes no network call.
- **Call request**: the vendor-neutral input to one Gateway call: step name, system prompt, Skills, tool schemas, reference documents, turn messages and an optional Zod schema (Plan §6 `CallRequest`).
- **Assembled prompt**: the ordered list of segments the Gateway builds from a Call request, each segment labelled with one kind: `system`, `skill`, `tool`, `reference` or `turn`.
- **Cache order**: the kind order of the Assembled prompt: `system`, `skill`, `tool`, `reference`, `turn` (MODEL-05).
- **Vendor cache order**: the order in which a Vendor adapter lays out its request body, following that vendor's cache-prefix rules. Anthropic: tool schemas in `tools`, then the system prompt, Skills and reference documents as `system` blocks, then the turn as `messages` (D-65). OpenAI: tool schemas in `tools`, then the system prompt, Skills and reference documents in the first `developer` message, then the turn messages; the top-level `instructions` field is never used (D-69).
- **Stable prefix**: the part of a vendor request body before the turn, which ends at the cache breakpoint.
- **Primary** and **Fallback**: the two Model IDs of a tier in the Model register.
- **Served model**: the Model ID whose response the Gateway returned for a call.
- **Retryable failure**: a vendor server error (HTTP 5xx), a rate limit (HTTP 429 or the vendor's overloaded status, classed `rate_limited`), a call timeout, or a Primary on a Killed vendor.
- **Retry wait**: a model step's `max_retry_wait_ms` in the Routing table: the longest `Retry-After` delay the Gateway may wait before retrying the same model once. It is 0 for realtime steps (such as Séance's `respond` in Phase 5) and at most 2,000 ms for batch steps (D-70).
- **Killed vendor**: a vendor named in a `killPrimary(vendor)` call that has not been revived.
- **Demo mode**: the state in which the environment variable `DEMO_MODE` equals `true`.
- **Typed error**: an instance of an error class exported from the Public entry, carrying a string `code` field.
- **Harness**: the `harness` module: `defineApp`, `runTask`, `pipeline`, `generateEvaluate` and `Budget`.
- **App definition**: the object `defineApp(...)` returns.
- **Task**: one run of an App definition on one input, stored as one row in `bones.tasks`.
- **Step**: one unit of work in a pattern: a pipeline step, or one generate or one evaluate call in a round. Kind `model`, `code` or `action` (Plan §6 `Step`).
- **Round**: one generate Step followed by one evaluate Step in `generateEvaluate`.
- **Run context**: the `ctx` object the Harness passes to each Step (Plan §6 `RunContext`, Phase 1 subset).
- **Budget**: the per-Task object that holds the step, token, time and spend caps and counters (HAR-05).
- **Active time**: wall-clock time during which a Task is running in some process, summed across restarts.
- **Reservation**: an amount of tokens and spend the Budget holds for a call before it is sent and settles after it ends.
- **Image part**: an image in a turn message, given as a media type and encoded bytes. In Phase 4 the skeleton resizes every image to a fixed maximum size before it reaches the Gateway (D-60).
- **Image allowance**: a Model ID's `image_input_tokens` in the Model register: the input tokens one resized Image part counts as for that model. Values are set in Phase 4 (D-60).
- **Prompt token estimate**: the UTF-8 byte length of the Assembled prompt's text divided by 2.5 and rounded up, plus one Image allowance per Image part, plus a fixed allowance per segment and per request set in the design. Image bytes are never counted. The Gateway checks it against each Candidate model's Prompt limit, and the Budget and spend caps reserve against it (D-60). Property P1-5 is the evidence that it never undercounts.
- **Calibrated**: the state in which the Token-count fixtures hold a recorded count for every corpus prompt from every tier model of every vendor in the Model register.
- **Prompt limit**: a Model ID's `max_prompt_tokens` in the Model register: the largest prompt the listed prices cover. Above it the vendor charges long-context rates, which the Gateway never pays (D-60).
- **Candidate model**: a Model ID the Gateway may serve a call from: the tier's Primary, then its Fallback, minus any Model ID excluded under Requirement 19 criterion 7.
- **Token-count fixtures**: the committed file of prompts and the input token counts real vendors reported for them, recorded by the Smoke test (Requirement 25) and replayed by the Fake provider.
- **Micro-dollar**: one millionth of a US dollar. Spend is stored and compared as integer Micro-dollars.
- **Workspace**: the owner of a Task for spend purposes, identified by a string `workspaceId`; in demo mode one anonymous browser.
- **Workspace day**: one UTC calendar day for one Workspace.
- **Workspace daily cap**: the Product manifest's `limits.max_workspace_spend_usd_per_day`.
- **Task state**: the JSON document saved on the Task row after each Step, from which a Task resumes.
- **Terminal status**: a Task status of `completed`, `failed` or `stopped`.
- **Bones schema**: the Postgres schema `bones` and its tables.
- **Database module**: the skeleton's `db` module, including `createDb(url)` from Phase 0.
- **Trace module**: the `trace` module: `withTrace`, `span` and `redact`.
- **Trace**: all Spans of one Task, sharing one trace ID.
- **Span**: one stored record of a timed operation (task, step, model call), written to `bones.spans`.
- **Redactor**: the `redact(value)` function in the Trace module.
- **Planted personal data**: email addresses and phone numbers inserted into generated test inputs.
- **Nigerian phone formats**: the formats listed in Requirement 23, criterion 2.
- **Secret value**: the value, 8 or more characters long, of any environment variable whose name ends in `_KEY`, `_SECRET`, `_TOKEN` or `_PASSWORD`, or is `DATABASE_URL`.
- **Smoke test**: the opt-in test that calls real vendors (Requirement 25).

## Policy tables

The Policy resolver holds these tables as data, copied from framework §3 and §8.3 and plan §5.

**Archetype table** (framework §3.1, plan §5)

| Archetype | `pattern` | Primary grader | Pricing unit | North-star metric | Archetype steering | Built in Phase 1 |
| --- | --- | --- | --- | --- | --- | --- |
| GEN | `generate-evaluate` | Rubric grader | Credits per output | Share of outputs accepted without major edits | none | Yes |
| EXT | `pipeline` | Field comparison against a gold set | Per document | Field accuracy against the human baseline | `archetype-ext.md` | Yes |
| ANS | `retrieval-answer` | Correctness and groundedness | Per resolution | Resolved without escalation | none | No (table entry only) |
| AGT | `planner-executor` | Final-state check in a sandbox | Per completed task | Task success at pass^k | none | No (table entry only) |
| CNV | `realtime-split` | Simulated conversations plus latency | Per minute | Goal completion within the latency target | `archetype-cnv.md` | No (Phase 5) |
| MON | `pipeline` (thresholded) | Precision and recall on labelled events | Per monitored entity per month | Precision at the target recall | none | No (table entry only) |

**Autonomy table** (framework §3.2 and §8.3, plan §5, D-42 and D-43)

| Autonomy | Reversible actions | Irreversible or external actions | Release measure | Default threshold |
| --- | --- | --- | --- | --- |
| A0 | `forbidden` | `forbidden` | `pass@1` | the product's own target (required) |
| A1 | `approve` | `approve` | `accept-rate` | 0.70 |
| A2 | `auto-with-undo` | `approve` | `pass^3` | 0.85 |
| A3 | `auto-with-undo` | `auto` | `pass^5` | 0.90 |
| A4 | `auto-with-undo` | `auto` | `pass^5`, plus 10 long-horizon runs | 0.95 |

**Risk table** (framework §3.3 and §3.4, plan §5)

| Risk | Safety eval sets | Threat model required | Privacy note in UI | Expert-labelled items | Fairness checks | Transcript review sample | Trace redaction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `standard` | No | No | none | No | `weekly-20` | On |
| R2 | `standard`, `app-attacks` | Yes (`THREATS.md`) | Yes | critical tasks | No | `weekly-50` | On |
| R3 | `standard`, `app-attacks` | Yes (`THREATS.md`) | Yes | all tasks | Yes | `daily` | On |
| R4 | refused: the Policy resolver returns no Policy | | | | | | |

## Requirements

### Requirement 1: Public entry and module boundaries

**User Story:** As the builder, I want every Phase 1 capability reachable only through `@ossuary/skeleton`, so that apps stay thin and the vendor boundary holds.

#### Acceptance Criteria

1. THE Public entry SHALL export `loadProduct`, `resolvePolicy`, `createGateway`, `createFakeProvider`, `defineApp`, `runTask`, `pipeline`, `generateEvaluate`, `Budget`, `withTrace`, `span`, `redact`, `createDb`, every Typed error class, and the types `Policy`, `RunContext`, `Step`, `CallRequest` and `Provider`. [ARCH-02, Plan §6, D-55]
2. THE Skeleton package SHALL import vendor SDKs only inside `packages/skeleton/src/gateway/providers/`, so that `pnpm lint:boundaries` exits 0. [MODEL-01]
3. THE Echo app SHALL import the skeleton only as `@ossuary/skeleton`. [ARCH-02, Plan §1 house rule 1]
4. THE Skeleton package SHALL list only `"."` in its `package.json` `exports`. [ARCH-02, D-07]
5. THE Repo SHALL keep model IDs and prices only in the Model register, except `fake:*` Model IDs and prices in test code and in the Fake provider. [MODEL-07, Plan §1 house rule 3, D-50]

### Requirement 2: Product manifest

**User Story:** As an app author, I want `product.yaml` checked against one schema, so that a typo fails loudly at load time instead of changing behaviour silently.

#### Acceptance Criteria

1. WHEN `loadProduct(appDir)` is called, THE Manifest loader SHALL read `product.yaml` from `appDir`, the Routing table at the path its `routing` field gives relative to `appDir`, and the Model register at the Repo root, validate each with Zod, and return the product, routing, models and resolved Policy as one deeply frozen object. [Framework §3, DOS-02, Plan §5]
2. THE Manifest loader SHALL require in the Product manifest: `id` (kebab-case), `name`, `code`, `users`, `market` (a non-empty list of ISO 3166-1 alpha-2 codes), `north_star`, `pricing` (`model`, `unit`, and an ISO 4217 `currency`), `routing`, `evals` (`dir`, `core_set`), and `limits` with positive integers `max_steps`, `max_tokens` and `max_seconds` and positive numbers `max_spend_usd` and `max_workspace_spend_usd_per_day`. [Plan §5, HAR-05, OPS-06, D-45]
3. THE Manifest loader SHALL accept the optional Product manifest fields `interfaces` (`mcp` with `path` and `tools`, and `skills`), `costume` and `release` (`threshold`, a number from 0 to 1), in the shapes of plan §5. [Plan §5, D-44]
4. IF a Product manifest, Routing table or Model register has a YAML syntax error, a missing required field, a value of the wrong type or an unknown key, THEN THE Manifest loader SHALL throw a `ManifestError` that names the file and, for each issue, the field path and the problem. [Plan §5, D-58]
5. IF the file named by `routing`, or `product.yaml` itself, does not exist, THEN THE Manifest loader SHALL throw a `ManifestError` naming the missing path. [Plan §5]
6. IF the resolved Policy requires a threat model AND `appDir` has no `THREATS.md`, THEN THE Manifest loader SHALL throw a `ManifestError` naming the missing file and the risk tier that requires it. [SEC-01, Framework §3.4, Plan §5 risk table, D-57]
7. IF the Product manifest's code has autonomy A0 AND the Product manifest has no `release.threshold`, THEN THE Manifest loader SHALL throw a `ManifestError` stating that A0 products set their own pass@1 target. [Framework §8.3, D-43]

### Requirement 3: Routing table

**User Story:** As an app author, I want each step's tier and effort declared in one file, so that routing is data I can change without touching code.

#### Acceptance Criteria

1. THE Manifest loader SHALL accept a Routing table that maps one or more step names, each matching `^[a-z][a-z0-9_-]*$`, to exactly one of a model step `{ tier, effort, role?, timeout_ms?, max_output_tokens?, max_retry_wait_ms? }` or a code step `{ kind: code }`. [MODEL-02, MODEL-04, HAR-06, Plan §5]
2. THE Manifest loader SHALL require a model step's `tier` to be `small`, `mid` or `frontier` and its `effort` to be `low`, `medium` or `high`. [MODEL-02, MODEL-04]
3. THE Manifest loader SHALL accept `role: judge` as the only value of `role`. [HAR-02, Plan §5]
4. THE Manifest loader SHALL require `timeout_ms`, when present, to be an integer from 1,000 to 300,000, and `max_output_tokens`, when present, to be an integer from 1 to 64,000. [HAR-05, D-59]
5. WHERE a model step omits `timeout_ms`, THE Gateway SHALL use a step timeout of 30,000 ms. [HAR-05, D-59]
6. WHERE a model step omits `max_output_tokens`, THE Gateway SHALL use a maximum of 1,024 output tokens. [HAR-05, D-59]
7. THE Manifest loader SHALL require `max_retry_wait_ms`, when present, to be an integer from 0 to 2,000, and WHERE a model step omits it, THE Gateway SHALL use 2,000 ms. [OPS-05, D-70]

### Requirement 4: Model register

**User Story:** As the builder, I want `models.yaml` validated, so that a vendor or price change touches one file and a bad edit is caught before any call.

#### Acceptance Criteria

1. THE Manifest loader SHALL require the Model register to hold exactly the tiers `small`, `mid` and `frontier`, each with a `primary` and a `fallback` Model ID matching `^[a-z][a-z0-9-]*:[^\s:]+$`. [MODEL-02, MODEL-07]
2. IF a tier's `primary` is a Placeholder ID, THEN THE Manifest loader SHALL throw a `ManifestError` naming the tier. [MODEL-02]
3. WHERE a tier's `fallback` is a Placeholder ID, THE Gateway SHALL treat that tier as having no Fallback. [MODEL-03, OPS-05]
4. IF a tier's `fallback` is not a Placeholder ID AND names the same vendor as its `primary`, THEN THE Manifest loader SHALL throw a `ManifestError` naming the tier. [MODEL-03]
5. THE Manifest loader SHALL require each `prices` entry to be keyed by a Model ID and to hold non-negative numbers `input`, `cached_input` and `output` in US dollars per million tokens, an optional non-negative `cache_write_input`, an optional positive integer `max_prompt_tokens`, an optional positive integer `image_input_tokens`, `currency: USD`, a `source` URL and a `checked` ISO date. [MODEL-07, ECON-06, D-46, D-60]
6. WHEN this phase fills a fallback Model ID or a price in the Model register, THE Repo SHALL record the vendor page and date in that entry's `source` and `checked` fields. [MODEL-07, ECON-06]
7. IF a tier's `primary` or non-placeholder `fallback` has no `prices` entry, THEN THE Manifest loader SHALL throw a `ManifestError` naming the tier and the Model ID. [OPS-06, MODEL-07, D-49]

### Requirement 5: Archetype policy

**User Story:** As the builder, I want the archetype part of the code to decide the harness pattern and measures, so that changing the code changes behaviour without touching app code.

#### Acceptance Criteria

1. WHEN the Policy resolver receives a code matching `^(GEN|EXT|ANS|AGT|CNV|MON)-A[0-4]-R[1-3]$`, THE Policy resolver SHALL return a Policy whose `pattern`, grader, `pricingUnit`, `northStar` and `steering` fields equal the archetype's row in the Archetype table. [Framework §3.1, Plan §5]
2. THE Policy resolver SHALL return a full Policy for all six archetypes, including those whose pattern is not built. [Plan §5]
3. IF a code does not match `^(GEN|EXT|ANS|AGT|CNV|MON)-A[0-4]-R[1-4]$`, THEN THE Policy resolver SHALL throw a `PolicyError` naming the code and the part that is invalid. [Framework §3]
4. THE Policy resolver SHALL return a deeply frozen Policy, and SHALL return deeply equal Policies for equal codes and Overrides. [Plan §5, HAR-06]
5. **Property P1-1:** FOR ALL pairs of valid codes, THE Policy resolver SHALL return equal archetype fields when the archetype parts are equal, equal `approval` and `release` fields when the autonomy parts are equal and no Override is given, and equal `safety` fields when the risk parts are equal. [Framework §3, D-56]

### Requirement 6: Autonomy policy

**User Story:** As the builder, I want the autonomy level to set the approval rule and the release bar, so that every app gets the governance its level demands.

#### Acceptance Criteria

1. WHEN the Policy resolver resolves a valid code, THE Policy resolver SHALL set `approval.reversible`, `approval.irreversible`, `release.measure` and `release.threshold` from the autonomy level's row in the Autonomy table. [Framework §3.2, Framework §8.3, HAR-08, D-42]
2. WHEN the Policy resolver resolves an A0 code without an Override, THE Policy resolver SHALL set `release.threshold` to 0 and `release.targetRequired` to true. [Framework §8.3, D-43]
3. WHEN the Policy resolver resolves an A4 code, THE Policy resolver SHALL set `release.longRuns` to 10. [Framework §8.3]

### Requirement 7: Risk policy and R4 refusal

**User Story:** As the builder, I want the risk tier to switch controls on and R4 to refuse to load, so that a restricted product can't run on the skeleton by accident.

#### Acceptance Criteria

1. WHEN the Policy resolver resolves an R1, R2 or R3 code, THE Policy resolver SHALL set `safety.sets`, `safety.requireThreatModel`, `safety.privacyNote`, `safety.expertLabels`, `safety.fairness`, `safety.reviewSample` and `safety.traceRedaction` from the risk tier's row in the Risk table. [Framework §3.4, Plan §5]
2. IF a code has risk tier R4, THEN THE Policy resolver SHALL throw a `PolicyError` with code `restricted` that names the code and states that R4 products are not loaded. [Framework §3.3, MODEL-06, Plan §5]
3. IF the Product manifest's code has risk tier R4, THEN THE Manifest loader SHALL throw the Policy resolver's `restricted` error and return no product. [Framework §3.3, Plan §5]

### Requirement 8: Threshold overrides

**User Story:** As a product owner, I want to raise a release threshold but never lower one, so that the bar only moves up (framework §3.4).

#### Acceptance Criteria

1. WHERE the Product manifest has `release.threshold`, THE Manifest loader SHALL pass it to the Policy resolver as the Override. [Framework §3.4, Plan §5, D-44]
2. WHEN the Override's threshold is greater than or equal to the autonomy level's default threshold, THE Policy resolver SHALL set `release.threshold` to the Override's threshold. [Framework §3.4, Framework §8.3]
3. IF the Override's threshold is below the default threshold, THEN THE Policy resolver SHALL throw a `PolicyError` naming the default and the Override. [Framework §3.4, D-44]
4. IF the Override names a `measure` different from the autonomy level's measure, or a threshold outside 0 to 1, THEN THE Policy resolver SHALL throw a `PolicyError` naming the field. [Framework §3.4, D-44]
5. **Property 1:** FOR ALL valid R1 to R3 codes and all generated Overrides, every Policy the Policy resolver returns SHALL have a `release.threshold` greater than or equal to the default threshold of the code's autonomy level, and SHALL equal the Override's threshold whenever the Override is accepted. [Framework §3.4]

### Requirement 9: Provider interface and vendor adapters

**User Story:** As the builder, I want one provider interface with adapters for two vendors, so that a model is a replaceable part and a fallback from another vendor exists.

#### Acceptance Criteria

1. THE Skeleton package SHALL define one Provider interface that takes a Model ID, an Assembled prompt, an effort, a maximum output token count, an optional JSON schema and an abort signal, and that returns either a complete response (text, Served model, input tokens, cache-read input tokens, cache-write input tokens, output tokens and finish reason) or a Typed error classed as `server`, `rate_limited` (with the `Retry-After` delay in milliseconds when the vendor sent one), `timeout` or `client`. [MODEL-01, OPS-05, Plan §6, D-70]
2. THE Skeleton package SHALL provide Vendor adapters for Anthropic and OpenAI in `packages/skeleton/src/gateway/providers/`. [MODEL-01, MODEL-03, Plan §10 row 1, D-48]
3. THE Vendor adapter SHALL read its API key from `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` at call time, and SHALL keep the key out of errors, Spans and logs. [SEC-03]
4. THE Vendor adapter SHALL pass the step's effort to the vendor's effort or reasoning setting for the model. [MODEL-04]
5. THE Vendor adapter SHALL lay out its request body in its Vendor cache order and SHALL place its one cache breakpoint at the end of the Stable prefix: the last `reference` segment, or the last segment before the turn when there is no reference. [MODEL-05, D-65, D-69]
6. THE Vendor adapter SHALL report input tokens including cached input tokens, as OpenTelemetry GenAI defines `gen_ai.usage.input_tokens`. [OPS-01]
7. IF `createGateway` receives a Model register that names a vendor, other than in a Placeholder ID, for which no Provider is registered, THEN `createGateway` SHALL throw a `GatewayError` naming the vendor and the tier. [MODEL-01, MODEL-03]
8. THE Anthropic adapter SHALL request a 5-minute cache lifetime and THE OpenAI adapter SHALL request a 30-minute cache lifetime, so that each cache write matches the `cache_write_input` price in the Model register. [MODEL-05, ECON-03, D-60]
9. IF an Assembled prompt holding an Image part reaches a Vendor adapter in Phase 1, THEN THE Vendor adapter SHALL throw a `client` failure without contacting the vendor; image sending is built in Phase 4. [MODEL-01, D-60]

### Requirement 10: Prompt assembly in cache order

**User Story:** As the builder, I want every prompt laid out for caching, so that cached input discounts apply on every repeated call (MODEL-05, ECON-03).

#### Acceptance Criteria

1. WHEN the Gateway receives a Call request, THE Gateway SHALL build the Assembled prompt as the system prompt, then each Skill, then each tool schema, then each reference document, then each turn message, keeping the given order within each kind and leaving out empty kinds. [MODEL-05, Plan §6]
2. THE Gateway SHALL put each item of the Call request into the Assembled prompt exactly once and add no other content, except the repair message of Requirement 11 at the end of the turn. [MODEL-05]
3. WHEN two Call requests have equal system prompts, Skills, tool schemas and reference documents, THE Gateway SHALL build Assembled prompts whose segments before the first `turn` segment are byte-identical. [MODEL-05, ECON-03]
4. **Property 6:** FOR ALL generated Call requests and for each Vendor adapter, the request body the adapter builds SHALL follow that adapter's Vendor cache order (tools first on Anthropic, D-65; the system prompt, Skills and reference documents in the first `developer` message on OpenAI, D-69), SHALL hold every item of the request exactly once in its original order within its kind, SHALL place the cache breakpoint at the end of the Stable prefix with no turn content before it, and two requests that differ only in their turn SHALL produce byte-identical serialised Stable prefixes. [MODEL-05, ECON-03, D-65, D-69]

### Requirement 11: Structured output with one repair

**User Story:** As an app author, I want typed model output validated with Zod, so that later steps and code checks get data they can trust.

#### Acceptance Criteria

1. WHERE a Call request has a Zod schema, THE Gateway SHALL parse the model's text as JSON, validate it with the schema, and return the validated value. [Plan §6, SEC-02, HAR-06]
2. IF the output fails JSON parsing or schema validation, THEN THE Gateway SHALL make exactly one repair call on the same Served model, with the same Assembled prompt plus one turn message holding the invalid output and the validation issues. [Plan §6]
3. IF the repair call's output also fails parsing or validation, THEN THE Gateway SHALL throw a `StructuredOutputError` that lists the validation issues and carries no partial value. [Plan §6, OPS-05]
4. THE Gateway SHALL reserve, charge and trace the repair call like any other call, and SHALL mark its Span with `ossuary.repair` set to true. [HAR-05, OPS-01]

### Requirement 12: Call cost

**User Story:** As the builder, I want each call priced from `models.yaml` in code, so that spend caps and cost per task rest on exact arithmetic (HAR-06).

#### Acceptance Criteria

1. WHEN a call completes, THE Gateway SHALL compute its cost from the Served model's `prices` entry as uncached input tokens times `input`, plus cache-read tokens times `cached_input`, plus cache-write tokens times `cache_write_input` (or `input` when that field is absent), plus output tokens times `output`, per million tokens, rounded up to a whole Micro-dollar with integer arithmetic. [OPS-06, ECON-01, HAR-06, D-46]
2. IF the Model ID the Gateway is about to call has no `prices` entry, THEN THE Gateway SHALL throw a `PriceMissingError` naming the Model ID, without contacting the vendor. [OPS-06, MODEL-07, D-49]
3. WHEN the Gateway converts a dollar cap from the Product manifest to Micro-dollars, THE Gateway SHALL round down to a whole Micro-dollar. [OPS-06, HAR-05, D-46]
4. WHEN a call completes, THE Gateway SHALL record the call's cost on its Span as `ossuary.cost.usd_micros`. [OPS-02, ECON-01]
5. WHEN the Gateway is about to make an attempt, including a repair call, THE Gateway SHALL compute the attempt's Prompt token estimate and treat a Candidate model as unable to take the prompt when the estimate exceeds its Prompt limit, or when the prompt holds an Image part and the model has no Image allowance. [OPS-06, ECON-01, D-60]
6. IF the Primary cannot take the prompt AND the Fallback can, THEN THE Gateway SHALL call the Fallback without contacting the Primary, and SHALL record on the call Span `ossuary.fallback` set to true and `ossuary.fallback_reason` set to `prompt_too_long` (or `no_image_allowance` when the cause is a missing Image allowance). [OPS-05, D-47, D-60]
7. IF no Candidate model can take the prompt, THEN THE Gateway SHALL throw a `PromptTooLongError` (a kind of `GatewayError`) naming each Candidate model with its Prompt limit and the estimate, without contacting any vendor and before any Reservation is made. [OPS-06, D-60]
8. IF a repair call (Requirement 11) cannot be taken by its Served model, THEN THE Gateway SHALL throw the `StructuredOutputError` of Requirement 11 criterion 3 without making the repair call. [Plan §6, D-60]
9. WHERE a Model ID's `prices` entry has no `max_prompt_tokens`, THE Gateway SHALL apply no Prompt limit to that Model ID. [D-60]
10. IF a completed call reports more input tokens than its Served model's Prompt limit, THEN THE Gateway SHALL charge the call at the listed prices and set `ossuary.prompt_limit_exceeded` to true on its Span. [OPS-02, ECON-01, D-60]
11. **Property P1-5:** FOR ALL prompts in the Token-count fixtures, the Prompt token estimate SHALL be greater than or equal to the input token count the vendor reported for that prompt. [D-60, D-56]
12. WHILE the Token-count fixtures hold no recorded count, THE Repo SHALL skip Property P1-5 and SHALL print one line containing `P1-5 not calibrated` in the `pnpm verify` output. [D-71]
13. WHILE the Token-count fixtures hold some recorded counts but are not Calibrated, THE Repo SHALL run Property P1-5 on the recorded counts and SHALL print one line containing `P1-5 partly calibrated` that names each vendor and tier with no recording. [D-71]
14. THE Public entry SHALL export `estimateCalibration()`, which returns whether the Token-count fixtures are Calibrated, the recording dates and the missing vendor and tier pairs, so that the Phase 3 `/bones` dashboard can show a "not calibrated" notice. [OPS-02, D-71]

### Requirement 13: Task spend cap and workspace daily cap

**User Story:** As the builder, I want calls refused before they would break a task cap or a workspace's daily cap, so that a demo visitor or a looping task can't run up a bill (OPS-06).

#### Acceptance Criteria

1. WHEN the Gateway is about to send a call, THE Gateway SHALL reserve the call's worst-case cost (the Prompt token estimate times the higher of the `input` and `cache_write_input` prices, plus the call's maximum output tokens times the `output` price) against the Task's spend cap and against the Workspace daily cap for the current Workspace day. [OPS-06, HAR-05, D-60, D-63]
2. IF the Reservation would take the Task's spend above its cap, THEN THE Gateway SHALL throw `BudgetExceeded` with kind `spend` and scope `task`, without contacting any vendor. [OPS-06, HAR-05]
3. IF the Reservation would take the Workspace day's spend above the Workspace daily cap, THEN THE Gateway SHALL throw `BudgetExceeded` with kind `spend` and scope `workspace`, without contacting any vendor. [OPS-06, ECON-05]
4. WHEN a call completes, THE Gateway SHALL replace the spend Reservation with the call's actual cost. [OPS-06]
5. WHEN a call fails, THE Gateway SHALL release the spend Reservation. [OPS-06]
6. THE Gateway SHALL store each Workspace day's spend in `bones.spend` and SHALL make each Reservation with one atomic conditional update, so that concurrent calls for one Workspace never take the stored total above the Workspace daily cap. [OPS-06]
7. IF a completed call's actual cost exceeds its Reservation, THEN THE Gateway SHALL charge the actual cost, mark the Span with `ossuary.budget.overrun` set to true, and the Budget SHALL refuse every later charge on that Task with `BudgetExceeded`. [HAR-05, OPS-06]

### Requirement 14: Fallback and typed errors

**User Story:** As the builder, I want a primary failure to fall back once to another vendor or fail with a typed error, so that a caller never gets half an answer (OPS-05).

#### Acceptance Criteria

1. IF a call to a tier's Primary ends in a Retryable failure AND the tier has a Fallback, THEN THE Gateway SHALL switch to the Fallback exactly once, never switch back to the Primary, and return the Fallback's result. [OPS-05, MODEL-03, Plan §6, D-70]
2. WHEN the Gateway calls a Fallback, THE Gateway SHALL record on the call Span `ossuary.fallback` set to true, the reason as `ossuary.fallback_reason` (`server`, `timeout`, `rate_limited` or `killed` for a Primary failure, or a reason from Requirement 12 criterion 6 or Requirement 19 criterion 7), and the Fallback as `gen_ai.response.model`. [OPS-05, OPS-01, OPS-02, D-47, D-70]
3. IF the Fallback's attempts also fail, or the tier has no Fallback, THEN THE Gateway SHALL throw a `GatewayError` that lists each attempt's Model ID and failure class. [OPS-05]
4. IF a Primary call fails with a `client` failure, THEN THE Gateway SHALL throw a `GatewayError` without calling the Fallback. [OPS-05]
5. WHEN the Gateway sends a call, THE Gateway SHALL set the call's timeout to the smaller of the step's timeout and the Budget's remaining Active time, and SHALL abort the vendor request when the timeout passes. [HAR-05, OPS-05]
6. IF a call is aborted because the Budget's Active time ran out, THEN THE Gateway SHALL throw `BudgetExceeded` with kind `seconds` without calling the Fallback. [HAR-05]
7. IF an attempt fails after the vendor returned part of a response, THEN THE Gateway SHALL discard the partial text, so that the returned value, the Task state and the Span hold none of it. [OPS-05]
8. IF an attempt ends in a `rate_limited` failure whose `Retry-After` delay is no greater than the step's Retry wait, nor than the Budget's remaining Active time, AND that model has not been retried in this call, THEN THE Gateway SHALL wait that delay and retry the same model once, and SHALL mark the retry attempt's Span with `ossuary.retry` set to true. [OPS-05, HAR-05, D-70]
9. IF a `rate_limited` failure carries no `Retry-After` delay, or a delay above the step's Retry wait, or the model was already retried in this call, THEN THE Gateway SHALL treat it as a Retryable failure under criterion 1 without waiting. [OPS-05, D-70]
10. THE Gateway SHALL retry each vendor at most once per call, so that a call makes at most two attempts per vendor and at most four attempts in total. [OPS-05, D-70]
11. **Property 5:** FOR ALL generated Fake provider outcomes for the Primary and the Fallback (success, server error, rate limit with and without a `Retry-After` delay, timeout, client error, partial response then failure), all Retry waits, all kill-switch states and all prompt sizes relative to each model's Prompt limit, THE Gateway SHALL return the complete result of exactly one attempt or throw a Typed error, SHALL make at most one Fallback switch and at most one retry per vendor, SHALL wait only for delays within the Retry wait, SHALL return no partial result, and SHALL record `ossuary.fallback` as true on the Span if and only if it called the Fallback, with `ossuary.fallback_reason` equal to `rate_limited` whenever a rate limit caused the switch. [OPS-05, D-70]

### Requirement 15: Demo-only primary kill switch

**User Story:** As the presenter, I want to kill the primary vendor live in demo mode, so that the video shows a failover without breaking production.

#### Acceptance Criteria

1. WHILE Demo mode is on, WHEN `killPrimary(vendor)` is called, THE Gateway SHALL treat every Primary on that vendor as a Retryable failure, without contacting the vendor, until `revivePrimary(vendor)` is called. [OPS-05, Plan §6, Plan §12]
2. IF `killPrimary` or `revivePrimary` is called while Demo mode is off, THEN THE Gateway SHALL throw a `DemoModeOnlyError` and leave the set of Killed vendors unchanged. [Plan §6, Plan §12]
3. THE Gateway SHALL expose the current set of Killed vendors as a read-only list. [Plan §12]
4. THE Gateway SHALL hold the set of Killed vendors in process memory only, so that a restart clears it. [Plan §12]

### Requirement 16: App definition and run context

**User Story:** As an app author, I want `defineApp` to wire my steps to the policy, routing, gateway and trace, so that the app is a thin layer.

#### Acceptance Criteria

1. WHEN `defineApp({ dir, ... })` is called, THE Harness SHALL load the product with the Manifest loader and return an App definition holding the Policy, the Routing table and a `runTask` function. [Plan §6, ARCH-03]
2. IF the Policy's `pattern` is not built in this phase (`retrieval-answer`, `planner-executor`, `realtime-split`, or `pipeline` for MON), THEN THE Harness SHALL throw a `PatternNotBuiltError` naming the pattern and the archetype. [Plan §5]
3. IF the App definition supplies a pattern other than the Policy's `pattern`, THEN THE Harness SHALL throw a `ManifestError` naming both patterns. [Framework §3.1, HAR-01]
4. IF a model Step's name has no model step entry in the Routing table, THEN THE Harness SHALL throw a `ManifestError` naming the Step. [MODEL-02, Plan §6 `Step`]
5. IF a Step calls the Scoped gateway with a step name whose Routing table entry is a code step, THEN THE Gateway SHALL throw a `GatewayError` naming the step, without contacting a vendor. [HAR-06]
6. THE Harness SHALL pass each Step a Run context holding `taskId`, `traceId`, `workspaceId`, the Policy, a read-only view of the Budget, the Scoped gateway and `span()`. [Plan §6 `RunContext`, HAR-05]
7. THE Scoped gateway SHALL charge every call to the Task's Budget and Workspace, and SHALL record every call as a child Span of the current Step's Span. [HAR-05, OPS-01, OPS-06]

### Requirement 17: Budget

**User Story:** As the builder, I want hard limits on steps, tokens, time and spend enforced by code, so that no run can loop or overspend whatever the model does (HAR-05).

#### Acceptance Criteria

1. WHEN `runTask` starts a new Task, THE Harness SHALL create a Budget whose caps are the Product manifest's `limits.max_steps`, `limits.max_tokens`, `limits.max_seconds` and `limits.max_spend_usd` in Micro-dollars. [HAR-05, Plan §5]
2. IF starting a Step would take the Task's step count above `max_steps`, THEN THE Budget SHALL throw `BudgetExceeded` with kind `steps` before the Step runs. [HAR-05]
3. WHEN the Gateway is about to send a call, THE Budget SHALL reserve the Prompt token estimate plus the call's maximum output tokens against `max_tokens`. [HAR-05, D-60]
4. IF a token Reservation would take the Task's tokens above `max_tokens`, THEN THE Budget SHALL throw `BudgetExceeded` with kind `tokens` without any vendor being contacted. [HAR-05]
5. WHEN a call ends, THE Budget SHALL replace the token Reservation with the reported input and output tokens, or release the Reservation if the call failed. [HAR-05]
6. WHEN a Task's Active time reaches `max_seconds`, THE Budget SHALL throw `BudgetExceeded` with kind `seconds` in the running Step. [HAR-05, D-53]
7. WHEN `BudgetExceeded` reaches `runTask`, THE Harness SHALL set the Task's status to `stopped`, save the Task state, record the cap's kind, limit and used amount on the task Span, and return a result with status `stopped` and that kind. [HAR-05, OPS-02]
8. THE Harness SHALL give Steps a Budget view with no way to change a cap or a counter. [HAR-05]
9. **Property 2:** FOR ALL generated caps, Step sequences and Fake provider usages that stay within each call's Reservation, run on a controlled clock, the Task's counted steps, tokens, Active time and spend SHALL never exceed their caps, and WHEN the next Step or call would exceed a cap, THE Harness SHALL stop the Task with `BudgetExceeded` naming that cap, with no vendor call made for the refused charge. [HAR-05]

### Requirement 18: Pipeline pattern

**User Story:** As an EXT app author, I want a fixed pipeline of steps, so that Exhume can run extract, validate and categorize in order.

#### Acceptance Criteria

1. WHEN a `pipeline` Task runs, THE Harness SHALL run the Steps in their declared order, pass each Step's output to the next Step as input, and return the last Step's output. [Plan §6, HAR-01]
2. IF a `pipeline` declares a Step of kind `action`, THEN THE Harness SHALL throw a `PatternNotBuiltError` stating that action Steps need the Phase 2 approval gate. [HAR-08, SEC-06, D-54]
3. IF a Step throws an error other than `BudgetExceeded`, THEN THE Harness SHALL set the Task's status to `failed`, store the error's class and its redacted message on the Task row and the Step Span, and save the Task state. [OPS-01, OPS-09]

### Requirement 19: generateEvaluate pattern and judge separation

**User Story:** As a GEN app author, I want generation and evaluation split across different models, so that the generator never grades its own work (HAR-02).

#### Acceptance Criteria

1. WHEN a `generateEvaluate` Task runs, THE Harness SHALL run Rounds in which the generate Step receives the input and the previous Round's feedback, and the evaluate Step receives the input and the generate Step's output and returns a verdict `{ pass, score, feedback }` validated with Zod. [HAR-02, Framework §3.1 GEN, Plan §6]
2. WHEN a verdict has `pass` set to true, or `maxRounds` Rounds have run, THE Harness SHALL complete the Task and return the last candidate, the last verdict, the Round count and `accepted` equal to the verdict's `pass`. [HAR-02, Plan §6]
3. THE Harness SHALL require `maxRounds` to be an integer from 1 to 10 and SHALL use 3 when it is omitted. [HAR-05]
4. THE Harness SHALL route the evaluate Step's Gateway calls to the Routing table step with `role: judge`, and the generate Step's calls to a step without that role. [HAR-02, Plan §5]
5. IF a GEN app's Routing table has no step with `role: judge`, or more than one, THEN THE Harness SHALL throw a `ManifestError` at `defineApp`. [HAR-02]
6. IF the judge step's tier has the same Primary as the generate step's tier, THEN THE Harness SHALL throw a `ManifestError` at `defineApp` naming both steps. [HAR-02]
7. WHEN the evaluate Step calls the Gateway, THE Gateway SHALL exclude the Model ID that served that Round's generate Step, so that the evaluate call uses the judge tier's Primary, or its Fallback when the Primary is excluded or fails; WHEN the Primary is excluded, THE Gateway SHALL record `ossuary.fallback_reason` as `judge_excluded`. [HAR-02, Plan §6]
8. IF every candidate model for an evaluate call is excluded or has failed, THEN THE Gateway SHALL throw a `JudgeConflictError` naming the excluded Model ID. [HAR-02]
9. **Property P1-2:** FOR ALL generated tier tables and Fake provider outcomes, every completed evaluate call SHALL have a Served model different from the Served model of the same Round's generate call. [HAR-02, D-56]

### Requirement 20: Restartable task state

**User Story:** As the builder, I want task state saved as JSON after each step, so that a run survives a process restart without repeating work or resetting its budget (HAR-03).

#### Acceptance Criteria

1. WHEN `runTask` starts a new Task, THE Harness SHALL insert a row in `bones.tasks` with the Task ID, app ID, Workspace, code, trace ID, input and status `running`. [HAR-03, OPS-01]
2. WHEN a Step completes, THE Harness SHALL save the Task state (completed Steps and their outputs, the Round number, the Budget's counters and Active time) as JSON on the Task row before the next Step starts. [HAR-03]
3. IF a Step's output cannot be stored as JSON, THEN THE Harness SHALL set the Task's status to `failed` with a `TaskStateError` naming the Step. [HAR-03]
4. WHEN `runTask` is called with the ID of a Task whose status is `running`, THE Harness SHALL resume from the saved Task state, skip completed Steps, reuse their saved outputs and continue the saved Budget counters. [HAR-03, HAR-05]
5. WHEN `runTask` is called with the ID of a Task in a Terminal status, THE Harness SHALL return the stored result without running a Step or calling the Gateway. [HAR-03, HAR-07]
6. IF saved Task state fails Zod validation on resume, THEN THE Harness SHALL set the Task's status to `failed` with a `TaskStateError` and run no Step. [HAR-03]
7. **Property P1-3:** FOR ALL generated Task states, saving then loading SHALL return an equal Task state; and FOR ALL generated pipelines of deterministic Steps and interruption points, a Task interrupted after any Step and resumed SHALL return the same output and the same step count as an uninterrupted Task, with no completed Step run twice. [HAR-03, D-56]

### Requirement 21: Bones schema and migrations

**User Story:** As the builder, I want the shared tables created by migration, so that every app and later phase writes to the same schema.

#### Acceptance Criteria

1. THE Database module SHALL define, in `packages/skeleton/src/db/schema.ts`, the tables `tasks`, `spans`, `approvals`, `audit_events`, `eval_runs`, `eval_results`, `feedback` and `spend` in the Postgres schema `bones`. [Plan §6, DOS-03]
2. THE Repo SHALL add the Bones schema as migration 0001, generated by drizzle-kit, and SHALL leave migration 0000 unchanged. [Plan §10 row 1, DOS-03]
3. THE Database module SHALL store money as integer Micro-dollars in `bigint` columns and timestamps as `timestamptz`. [Tech conventions, D-46]
4. WHEN the database tests run, THE Repo SHALL apply all migrations to `createDb('pglite://memory')` and check that each Bones schema table exists; WHERE `TEST_DATABASE_URL` is set, THE Repo SHALL run the same check against that server. [Plan §11 CI, D-35]
5. WHEN `pnpm db:migrate` runs with `DATABASE_URL` set to the local PostgreSQL, THE Repo SHALL create the Bones schema and exit 0. [Plan §12 local development]

### Requirement 22: Trace and spans

**User Story:** As the on-call engineer, I want one trace per task with OpenTelemetry GenAI attribute names, so that any app's traces read the same way (OPS-01).

#### Acceptance Criteria

1. WHEN `runTask` starts a new Task, THE Trace module SHALL create one trace ID of 32 lowercase hexadecimal characters and a root Span with `gen_ai.operation.name` set to `invoke_workflow` and `gen_ai.workflow.name` set to the app ID. [OPS-01]
2. THE Trace module SHALL record each Step as a child Span of the root Span, and each Gateway call attempt as a child Span of its Step's Span, all under the Task's trace ID. [OPS-01]
3. WHEN a Gateway call attempt ends, THE Trace module SHALL record on its Span `gen_ai.operation.name` (`chat`), `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.request.max_tokens`, `gen_ai.usage.input_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.output_tokens` and `gen_ai.response.finish_reasons`, and SHALL name the Span `chat <model name>`. [OPS-01, OPS-02]
4. WHEN a Gateway call attempt ends, THE Trace module SHALL record `gen_ai.system_instructions`, `gen_ai.input.messages` and `gen_ai.output.messages` as JSON strings after redaction. [OPS-01, OPS-09, EVAL-07]
5. THE Trace module SHALL put every attribute that OpenTelemetry GenAI does not define under the `ossuary.` prefix, including `ossuary.task.id`, `ossuary.step`, `ossuary.tier`, `ossuary.effort`, `ossuary.cost.usd_micros`, `ossuary.fallback` and `ossuary.repair`. [OPS-01, D-47]
6. THE Trace module SHALL define every OpenTelemetry attribute name in one source file, so that a renamed convention changes one place. [OPS-01]
7. WHEN a Span ends, THE Trace module SHALL write it to `bones.spans` with its trace ID, span ID, parent span ID, name, start time, end time, status and attributes. [OPS-01, OPS-02]
8. IF writing a Span fails, THEN THE Trace module SHALL log the failure to stderr without attribute values and let the Task continue. [OPS-01, OPS-09]
9. THE Trace module SHALL export `withTrace` and `span` so that app code can add Spans to the current Trace. [OPS-01, Plan §6]

### Requirement 23: Redaction before storage

**User Story:** As a user, I want my email address and phone number kept out of stored traces, so that debugging data doesn't leak personal data (OPS-09).

#### Acceptance Criteria

1. WHEN a Span is about to be written, THE Redactor SHALL replace every email address with `[email]`, every phone number with `[phone]` and every Secret value with `[secret]` in each attribute value, event and error message, walking nested objects and arrays and leaving keys unchanged. [OPS-09, SEC-03]
2. THE Redactor SHALL recognise these Nigerian phone formats, each with spaces, hyphens, dots or no separators between digit groups: local mobile numbers of 11 digits starting `070`, `071`, `080`, `081`, `090` or `091` (for example `0803 123 4567`, `08031234567`, `(0803) 123-4567`); the same numbers in international form with `+234`, `234` or `+234 (0)` and the leading `0` dropped (for example `+234 803 123 4567`, `2348031234567`, `+234 (0) 803 123 4567`); and `+234` landlines (for example `+234 1 234 5678`). [OPS-09, Plan §11 property 8]
3. THE Redactor SHALL also recognise international numbers written as `+` followed by 8 to 15 digits with optional separators. [OPS-09]
4. WHEN the Harness stores an error message on a Task row, THE Harness SHALL store the Redactor's output. [OPS-09, D-52]
5. **Property 8:** FOR ALL generated Task inputs with Planted personal data in any format of criteria 2 and 3 embedded in generated text, after a Task runs on a Fake provider that echoes its prompt, the stored Spans SHALL contain none of the planted email addresses, none of the planted phone numbers as written, and none of their digit sequences with separators removed. [OPS-09]
6. **Property P1-4:** FOR ALL generated text built from words, naira amounts such as `₦12,500.00`, ISO dates, clock times and numbers of up to 6 digits, THE Redactor SHALL return the text unchanged; and FOR ALL generated values, applying the Redactor twice SHALL give the same result as applying it once. [OPS-09, D-56]

### Requirement 24: Fake provider

**User Story:** As the builder, I want a scripted fake provider in the public API, so that every automated test runs without keys, network or spend.

#### Acceptance Criteria

1. THE Public entry SHALL export `createFakeProvider`, which returns a Provider for Model IDs of vendor `fake` whose outcome per call is scripted by the test: a success with given text and token usage, a server error, a rate limit with an optional `Retry-After` delay, a timeout that waits for the abort signal, a client error, or a partial response followed by a failure. [Plan §11, EVAL-06, D-70]
2. THE Fake provider SHALL record each request it receives, including the Assembled prompt, effort and maximum output tokens, for tests to inspect. [MODEL-05, Plan §11]
3. THE Fake provider SHALL make no network call and SHALL accept only Model IDs of vendor `fake`. [MODEL-07, D-50]
4. WHEN `pnpm verify` runs with no vendor API keys set and no network access, THE Repo SHALL pass every Phase 1 test. [EVAL-06, Plan §11 CI]
5. WHERE a test loads the Token-count fixtures into the Fake provider, THE Fake provider SHALL report, for a prompt that matches a fixture, the input token count the vendor reported for it. [D-60]
6. THE Token-count fixtures SHALL record, for each prompt, the vendor, the tier and slot (`primary` or `fallback`), the reported input tokens and the recording date, and SHALL hold no Model ID. [MODEL-07, D-60]
7. THE Repo SHALL change the Token-count fixtures only through the Smoke test's recording, never by hand, and SHALL treat a failing Property P1-5 as a reason to lower the estimate's divisor, never to edit a recorded count. [EVAL-08, D-60]

### Requirement 25: Opt-in real-vendor smoke test

**User Story:** As the builder, I want one test that calls the real vendors on demand, so that I can check the adapters against the live APIs without spending money on every run.

#### Acceptance Criteria

1. WHERE `OSSUARY_SMOKE` is `1` and a vendor's API key is set, THE Smoke test SHALL make one Gateway call through that vendor's adapter, using the tier model with the lowest `output` price that the Model register lists for that vendor, with at most 32 output tokens, and SHALL assert a complete response, non-zero token usage and a computed cost. [MODEL-01, MODEL-03, OPS-06]
2. WHILE `OSSUARY_SMOKE` is not `1`, THE Smoke test SHALL be skipped with a message naming the variable. [EVAL-06]
3. THE Skeleton package SHALL run the Smoke test through its own package script (`smoke`), outside `pnpm verify`. [Plan §11]
4. WHERE `OSSUARY_SMOKE` is `1` and a vendor's API key is set in the environment or the root `.env`, THE Smoke test SHALL also record token counts: it SHALL send each prompt of a committed token-count corpus to every priced tier model of that vendor, with the smallest output cap the vendor accepts, and SHALL replace that vendor's entries in the Token-count fixtures with the reported input tokens, keeping the other vendor's entries. [D-60, D-71]
5. THE token-count corpus SHALL include English prose, Nigerian Pidgin, Yoruba with tone marks, naira amounts, JSON, long digit runs, emoji, base64-like strings and a long reference document, so that Property P1-5 meets the text that tokenizes worst. [D-60]

### Requirement 26: Echo app

**User Story:** As the builder, I want a throwaway GEN app that runs one task end to end, so that the skeleton is proven before Exhume or Séance exists.

#### Acceptance Criteria

1. THE Echo app SHALL be a workspace package named `echo` in `apps/echo/`, holding a Product manifest with code `GEN-A1-R1`, a Routing table with a `generate` model step on tier `small` and an `evaluate` model step on tier `mid` with `role: judge`, a `prompts/` folder, a `src/domain/` folder, and a `turbo.json` that adds `product.yaml`, `routing.yaml` and `evals/**` to its `test` and `eval` task inputs, as Exhume and Séance do. [Plan §10 row 1, Plan §4, D-61]
2. THE Echo app SHALL define one `generateEvaluate` App definition through `defineApp`, in which the generate Step writes a one-sentence epitaph for a given topic and the evaluate Step checks the word limit in code and the rubric in `prompts/` with the judge. [HAR-02, HAR-06, Plan §10 row 1]
3. WHEN `pnpm --filter echo task "<topic>"` runs with `DATABASE_URL` set, THE Echo app SHALL apply pending migrations, run one Task in the Workspace `local` (or the one given with `--workspace`), and print the Task ID, trace ID, status, `accepted`, the final text, the cost in US dollars and the number of Spans stored. [Plan §10 row 1, OPS-01]
4. WHERE the `--fake` flag is given, THE Echo app SHALL run the Task on the Fake provider with a fake Model register, so that the end-to-end run needs no API key. [D-51]
5. IF `pnpm --filter echo task` runs while `DATABASE_URL` is unset or empty, THEN THE Echo app SHALL exit non-zero with a message naming the variable. [SEC-03]
6. WHEN the Echo app's end-to-end test runs on `createDb('pglite://memory')` with the Fake provider, THE Repo SHALL check that the Task ends `completed`, that its Spans share one trace ID and include the root, both Steps and both calls, that each call Span carries the attributes of Requirement 22 criterion 3, and that the evaluate call's Served model differs from the generate call's. [Plan §10 row 1, OPS-01, HAR-02]
7. THE Echo app SHALL hold no model ID, price, vendor SDK import or skeleton internal import. [MODEL-07, MODEL-01, ARCH-02]

### Requirement 27: Phase verification and scope

**User Story:** As the builder, I want the phase to close only on green checks inside its own files, so that later specs own their modules.

#### Acceptance Criteria

1. WHEN `pnpm verify` runs with `DATABASE_URL` unset, THE Repo SHALL run every Phase 1 test on PGlite, including Properties 1, 2, 5, 6 and 8 and P1-1 to P1-4, run or skip P1-5 as Requirement 12 criteria 12 and 13 say, and exit 0. [Plan §10 row 1, EVAL-06, D-71]
2. THE Repo SHALL put each property test in a `*.property.test.ts` file carrying the comment `// Feature: 01-skeleton-core, Property <id>: <text>`, and SHALL run each property for at least 100 generated cases. [Plan §11, structure.md]
3. THE Repo SHALL limit Phase 1 changes to `packages/skeleton/`, `apps/echo/`, `models.yaml` and their tests, plus `pnpm-lock.yaml`, `turbo.json` and the apps' `turbo.json` files, `scripts/test/model-register.test.ts`, `docs/decisions.md`, `docs/kiro-log.md`, `CHANGELOG.md` and the README bones table. [Kiro prompt 1, Plan §10]
4. THE Repo SHALL leave the `guard`, `evals`, `mcp`, `ui` and `blob` modules, `realtimeSplit`, `openAiCompatibleHandler`, and the Run context fields `tainted`, `tools` and `approve` to Phases 2 to 5. [Plan §10 rows 2 to 5]
5. THE Repo SHALL close Phase 1 without any vendor API key and without recorded token counts; being Calibrated is an exit criterion of Phase 4, the first phase in which an app calls a real model. [D-71]

## Exit criteria mapping

| Exit criterion | Requirements | How it is checked |
| --- | --- | --- |
| `pnpm verify` passes on PGlite | 1, 21, 24, 27 | `pnpm verify` with `DATABASE_URL` unset and no API keys |
| Properties 1, 2, 5, 6 and 8 pass | 8, 17, 14, 10, 23 | the five `*.property.test.ts` files inside `pnpm verify` |
| P1-5 is reported honestly | 12, 24, 25, 27 | with no recordings, `pnpm verify` prints `P1-5 not calibrated` and still exits 0; calibration itself is a Phase 4 exit criterion |
| An Echo task runs end to end | 26 | the Echo end-to-end test on PGlite (criterion 6) |
| A completed Echo task leaves a trace in local PostgreSQL | 21, 22, 26 | you run `pnpm db:migrate`, then `pnpm --filter echo task "<topic>"` (real vendors, or `--fake` without keys), then query `bones.spans` for the printed trace ID |

## Decisions taken in this spec

All approved in the requirements round and recorded in `docs/decisions.md`.

| ID | Decision | Plan section affected |
| --- | --- | --- |
| D-42 | The approval values extend the plan's `Policy` type: `forbidden` for A0 reversible actions, and `auto` for A3 and A4 irreversible actions. The plan type has no value for either case. | Plan §5 `Policy` type |
| D-43 | A0 has no numeric default bar (framework §8.3: "above the target set at G1"), so an A0 product must set `release.threshold` in `product.yaml`. Séance (CNV-A0-R2) starts in Phase 5 with a provisional threshold and raises it after its first baseline run; raising is always allowed. | Plan §5 autonomy table |
| D-44 | Overrides come from an optional `release: { threshold }` block in `product.yaml`. An Override below the default is rejected with an error, not clamped, and the measure can't be overridden. | Plan §5 `resolvePolicy(code, raise?)` |
| D-45 | The workspace daily cap is a new `product.yaml` field, `limits.max_workspace_spend_usd_per_day`. The global `DAILY_SPEND_CAP_USD` and the per-workspace demo counts (20 documents, 3 sessions) stay in Phase 7. | Plan §5 `limits`, Plan §12 |
| D-46 | Spend is integer Micro-dollars: costs round up per call, caps round down. `models.yaml` prices gain an optional `cache_write_input` for vendors that charge more for cache writes. | Plan §5 `prices`, tech.md money rule |
| D-47 | Attributes that OpenTelemetry GenAI doesn't define use the `ossuary.` prefix, so the plan's `gen_ai.fallback=true` becomes `ossuary.fallback=true`. Names that would extend another attribute name use an underscore (`ossuary.fallback_reason`, `ossuary.prompt_limit_exceeded`), because OpenTelemetry advises against an attribute name that is also a namespace. | Plan §6 gateway behaviour |
| D-48 | Phase 1 ships Anthropic and OpenAI adapters, and every tier's fallback is an OpenAI model. There is no Google adapter in Phase 1; the Provider interface leaves room for one later. | Plan §5 `models.yaml`, Plan §10 row 1 |
| D-49 | A model with no price is never called, and every tier model must have a price for `models.yaml` to load. Prices were filled on 2026-11-26 from the Anthropic and OpenAI pricing pages (standard tier). | Plan §6 gateway behaviour |
| D-50 | `createFakeProvider` is part of the public API so app tests can use it. `fake:*` Model IDs and prices in tests and the Fake provider don't count as model IDs under MODEL-07. | tech.md, house rule 3 |
| D-51 | Echo has a `--fake` mode, so the "trace in local PostgreSQL" check can run without API keys. | Plan §10 row 1 |
| D-52 | Redaction applies to Spans (attributes, events, errors) and to error messages on Task rows, and also covers Secret values (OPS-09). Task inputs and Task state are not redacted, because a Task must resume from its real data; Phase 7 adds a retention purge for them (OPS-09). | Plan §6 trace |
| D-53 | The time cap counts Active time across restarts, so a Task resumed the next day doesn't stop at once and a restart doesn't reset the clock. | Plan §6 harness |
| D-54 | Until Phase 2's approval gate exists, `pipeline` rejects action Steps (fail closed). | Plan §6 `pipeline` |
| D-55 | The public `db` export is `createDb`; migrations run through its handle's `migrate()`. This settles the Phase 1 forward note. | decisions.md forward notes |
| D-56 | Four phase-local properties are added: P1-1 (each code axis drives only its own Policy fields), P1-2 (judge and generator never share a Served model), P1-3 (task state round trip and resume equivalence) and P1-4 (redaction leaves clean text alone and is idempotent). P1-5 (the Prompt token estimate never undercounts a recorded real count) was added with D-60. | Plan §11 |
| D-57 | `loadProduct` fails when the Policy requires a threat model and the app has no `THREATS.md`, which is how `pnpm verify` comes to require it for R2 and R3. Echo is R1 and is unaffected. | Plan §5 risk table |
| D-58 | All three YAML schemas reject unknown keys, so a misspelt field fails at load time. Later phases add fields to the schemas as they need them. | Plan §5 |
| D-59 | `routing.yaml` model steps gain optional `timeout_ms` (default 30,000) and `max_output_tokens` (default 1,024), which the time and spend Reservations need. | Plan §5 `routing.yaml` |
| D-60 | A price entry may set `max_prompt_tokens`. The Gateway checks the Prompt token estimate (text bytes / 2.5, images by Image allowance, never image bytes) against each Candidate model's limit, and the token and spend Reservations use the same estimate plus the output cap. A prompt too long for the Primary goes to the Fallback with `ossuary.fallback_reason=prompt_too_long`; one too long for both is refused before any Reservation or vendor contact. A response over the limit sets `ossuary.prompt_limit_exceeded=true`. Cache writes are priced at the lifetime the Gateway requests (5 minutes on Anthropic, 30 on OpenAI). Image resizing and allowance values are Phase 4. | Plan §5 `prices`, Plan §6 gateway behaviour |
| D-61 | Turbo's cache hashes `models.yaml` for every task, and each app's `product.yaml`, `routing.yaml` and `evals/**` for its `test` and `eval` tasks. | Phase 0 `turbo.json` |
| D-70 | HTTP 429 and the vendor's overloaded status are `rate_limited`, a fallback trigger. A `Retry-After` within the step's Retry wait (0 for realtime steps, up to 2,000 ms for batch steps, set by `max_retry_wait_ms`) earns one retry of the same model; otherwise the Gateway switches straight to the Fallback with `ossuary.fallback_reason=rate_limited`. No vendor is retried more than once per call. | Requirement 14, Plan §6 gateway behaviour |
| D-71 | Phase 1 needs no API key. Without recordings, P1-5 is skipped with a visible `P1-5 not calibrated` line, and `estimateCalibration()` lets `/bones` show the same in Phase 3. The smoke test records token counts whenever it runs with a key. Being Calibrated is a Phase 4 exit criterion. | Plan §10 rows 1 and 4 |
